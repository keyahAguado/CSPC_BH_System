import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import passport from 'passport';
import '../config/passport.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_cspc_token_key';

// =========================================================================
// 1. JWT AUTHENTICATION MIDDLEWARE (exported for use in other routes)
// =========================================================================
export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Access Token Required.' });

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        if (err) return res.status(403).json({ success: false, message: 'Expired Token.' });
        
        try {
            // Suggestion B: Active Session Revocation (Real-time DB status check)
            const [rows] = await pool.query('SELECT status FROM users WHERE id = ?', [decoded.id]);
            if (rows.length === 0 || rows[0].status === 'suspended' || rows[0].status === 'blocked') {
                return res.status(401).json({ success: false, message: 'Your account has been suspended by SASO.' });
            }
            req.user = decoded; // Contains { id, email, role }
            next();
        } catch (dbErr) {
            console.error('Session verification DB error:', dbErr.message);
            return res.status(500).json({ success: false, message: 'Database error during session check.' });
        }
    });
};

// =========================================================================
// 2. HELPER — build the full user payload that every login response returns
// =========================================================================
async function buildUserPayload(user) {
    const payload = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        student_id: user.student_id || null,
        course: user.course || null,
        year_section: user.year_section || null,
        phone: user.phone || null,
        houseStatus: 'none',
        houseId: null,
        houseName: '',
    };

    if (user.role === 'owner') {
        const [houses] = await pool.query(
            'SELECT id, name, house_status FROM boarding_houses WHERE owner_id = ?',
            [user.id]
        );
        if (houses.length > 0) {
            payload.houseStatus = houses[0].house_status;
            payload.houseId = houses[0].id;
            payload.houseName = houses[0].name;
        }
    }

    return payload;
}

// =========================================================================
// 3. STANDARD EMAIL + PASSWORD LOGIN  POST /api/auth/login
//    Still needed for owners who registered before Google OAuth,
//    and as fallback for any user with a local password.
// =========================================================================
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No account found with that email.',
            });
        }

        const user = rows[0];

        if (user.status === 'inactive') {
            return res.status(403).json({
                success: false,
                message: 'Your account has been deactivated. Please contact SASO.',
            });
        }

        if (!user.password) {
            return res.status(401).json({
                success: false,
                message: 'This account uses Google Sign-In. Please use the "Continue with Google" button.',
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Incorrect password. Please try again.' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        const payload = await buildUserPayload(user);

        return res.json({
            success: true,
            message: `Welcome back, ${user.name}!`,
            token,
            user: payload,
        });

    } catch (err) {
        console.error('Login Error:', err.message);
        return res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});

// =========================================================================
// 4. GOOGLE OAUTH INITIATION
// =========================================================================
router.get('/google', (req, res, next) => {
    const rawOrigin = req.query.origin || req.headers.referer || process.env.FRONTEND_URL || 'http://localhost:5173';
    const cleanOrigin = rawOrigin.replace(/\/+$/, '');

    passport.authenticate('google', {
        scope: ['profile', 'email'],
        prompt: 'select_account',
        session: false,
        state: cleanOrigin,
    })(req, res, next);
});

// =========================================================================
// 5. GOOGLE OAUTH CALLBACK
// =========================================================================
router.get('/google/callback',
    (req, res, next) => {
        const targetOrigin = req.query.state
            ? decodeURIComponent(req.query.state)
            : (process.env.FRONTEND_URL || 'http://localhost:5173');

        passport.authenticate('google', {
            session: false,
            failureRedirect: `${targetOrigin}/login?error=unauthorized_domain`,
        })(req, res, next);
    },
    async (req, res) => {
        const targetOrigin = req.query.state
            ? decodeURIComponent(req.query.state)
            : (process.env.FRONTEND_URL || 'http://localhost:5173');

        try {
            const user = req.user;

            // ── A. Brand-new owner → redirect to onboarding form ──────────
            if (user.isNewOwner) {
                const params = new URLSearchParams({
                    email: user.email,
                    name: user.name,
                    google_id: user.google_id,
                    pic: user.profilePic || '',
                });
                return res.redirect(`${targetOrigin}/register/owner-details?${params.toString()}`);
            }

            // ── B. Suspended account ───────────────────────────────────────
            if (user.status === 'inactive') {
                return res.redirect(`${targetOrigin}/login?error=suspended`);
            }

            // ── C. Valid existing user → issue JWT and redirect ────────────
            const payload = await buildUserPayload(user);

            const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            const userParam = encodeURIComponent(JSON.stringify(payload));
            return res.redirect(`${targetOrigin}/auth-success?token=${token}&user=${userParam}`);

        } catch (err) {
            console.error('OAuth Callback Error:', err.message);
            return res.redirect(`${targetOrigin}/login?error=server_error`);
        }
    }
);

// =========================================================================
// 5.5 TRADITIONAL OWNER REGISTRATION  POST /api/auth/register/owner
//     Used by owners registering with email + password (Register.vue)
// =========================================================================
router.post('/register/owner', async (req, res) => {
    const { name, phone, address, email, password } = req.body;

    if (!name || !phone || !address || !email || !password) {
        return res.status(400).json({ success: false, message: 'All mandatory fields are required.' });
    }

    try {
        // Guard: check if email already registered
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'An account with this email already exists. Please log in.',
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await pool.query(
            'INSERT INTO users (name, phone, address, email, password, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, phone, address, email, hashedPassword, 'owner', 'pending']
        );

        const newUser = {
            id: result.insertId,
            name,
            email,
            role: 'owner',
            status: 'pending',
            phone,
            address,
        };

        const token = jwt.sign(
            { id: newUser.id, email: newUser.email, role: newUser.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        const payload = await buildUserPayload(newUser);

        return res.status(201).json({
            success: true,
            message: 'Owner registration successful! Awaiting SASO approval.',
            token,
            user: payload,
        });

    } catch (err) {
        console.error('Owner Registration Error:', err.message);
        return res.status(500).json({ success: false, message: 'Server error during owner registration.' });
    }
});

// =========================================================================
// 6. OWNER ONBOARDING COMPLETION  POST /api/auth/register/owner-complete
//    Receives the details collected on the OwnerDetailsRegister.vue form,
//    inserts the new owner record, and returns a JWT so the browser can
//    log them in immediately.
// =========================================================================
router.post('/register/owner-complete', async (req, res) => {
    const { name, email, phone, address, google_id } = req.body;

    if (!name || !email || !phone || !address || !google_id) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    try {
        // Guard: make sure this email/google_id doesn't already exist
        const [existing] = await pool.query(
            'SELECT id FROM users WHERE email = ? OR google_id = ?',
            [email, google_id]
        );
        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'An account with this email already exists. Please log in.',
            });
        }

        const [result] = await pool.query(
            'INSERT INTO users (google_id, name, email, role, status, phone, address) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [google_id, name, email, 'owner', 'pending', phone, address]
        );

        const newUser = {
            id: result.insertId,
            name,
            email,
            role: 'owner',
            status: 'pending',
            phone,
            address,
        };

        const token = jwt.sign(
            { id: newUser.id, email: newUser.email, role: newUser.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        const payload = await buildUserPayload(newUser);

        return res.status(201).json({
            success: true,
            message: 'Owner registration successful! Awaiting SASO approval.',
            token,
            user: payload,
        });

    } catch (err) {
        console.error('Owner Complete Registration Error:', err.message);
        return res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});

// =========================================================================
// 7. SECURE CHANGE PASSWORD  (still useful for owners who set a local password)
// =========================================================================
// 7. SECURE SET / CHANGE PASSWORD
//    Allows both Email users (verifying current password) and
//    Google SSO users (setting a password for the first time) to set a password.
// =========================================================================
router.post('/change-password', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.trim().length < 6) {
        return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
    }

    try {
        const [[user]] = await pool.query('SELECT password, google_id FROM users WHERE id = ?', [userId]);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User record not found.' });
        }

        const isGoogleUser = Boolean(user.google_id);

        // Require currentPassword whenever an existing password is already set on the user account
        if (user.password && user.password.trim() !== '') {
            if (!currentPassword) {
                return res.status(400).json({ success: false, message: 'Please provide your current password.' });
            }
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ success: false, message: 'Your current password is incorrect.' });
            }
        }

        // Hash and store the new password
        const newHashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password = ? WHERE id = ?', [newHashedPassword, userId]);

        return res.json({
            success: true,
            message: user.password ? 'Password updated successfully.' : 'Password set successfully! You can now log in using Email + Password as well.'
        });
    } catch (err) {
        console.error('Set/Change Password Error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error while updating password.' });
    }
});

export default router;
