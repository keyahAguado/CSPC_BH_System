import { getTrustedOAuthOrigin } from '../config/oauthRedirect.js';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../config/db.js';
import passport from 'passport';
import '../config/passport.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_cspc_token_key';

// ── One-time OAuth exchange codes ──────────────────────────────────────
// Keeps the real JWT out of the redirect URL (browser history, server logs,
// Referer headers). Each code is single-use and expires after 60 seconds.
const OAUTH_EXCHANGE_TTL_MS = 60 * 1000;
const oauthExchangeCodes = new Map();

function issueExchangeCode(token, userParam) {
    const code = crypto.randomBytes(32).toString('hex');
    oauthExchangeCodes.set(code, {
        token,
        userParam,
        expiresAt: Date.now() + OAUTH_EXCHANGE_TTL_MS,
    });
    return code;
}

// =========================================================================
// 0. ULTRA-STRICT EMAIL VALIDATOR HELPER
// =========================================================================
function validateStrictEmail(emailStr) {
    if (!emailStr || typeof emailStr !== 'string') {
        return { valid: false, message: 'Email address is required.' };
    }

    const clean = emailStr.trim().toLowerCase();

    // Standard RFC-compliant email regex enforcing top-level domain with dot and 2+ char extension
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(clean)) {
        return { valid: false, message: 'Please enter a valid email address (e.g., name@gmail.com).' };
    }

    // Strict domain regexes enforcing exact domain spelling
    const strictGmailPattern = /^[a-zA-Z0-9._%+-]{3,64}@gmail\.com$/;
    const strictYahooPattern = /^[a-zA-Z0-9._%+-]{3,64}@yahoo\.com(\.ph)?$/;
    const strictOutlookPattern = /^[a-zA-Z0-9._%+-]{3,64}@(outlook|hotmail)\.com$/;
    const strictCspcPattern  = /^[a-zA-Z0-9._%+-]{3,64}@(my\.)?cspc\.edu\.ph$/;

    const isValidGmail = strictGmailPattern.test(clean);
    const isValidYahoo = strictYahooPattern.test(clean);
    const isValidOutlook = strictOutlookPattern.test(clean);
    const isValidCspc  = strictCspcPattern.test(clean);

    if (isValidGmail || isValidYahoo || isValidOutlook || isValidCspc) {
        const username = clean.split('@')[0];
        if (clean !== 'admin@cspc.edu.ph' && ['gmail', 'email', 'test', 'user', 'owner', 'student'].includes(username)) {
            return { valid: false, message: 'Please enter your actual email username (e.g. juan.delacruz@gmail.com).' };
        }
        return { valid: true, email: clean };
    }

    // Detailed error feedback when email fails strict pattern matching
    const parts = clean.split('@');
    const domain = parts[1] || '';

    if (domain.includes('gmail') && domain !== 'gmail.com') {
        return { valid: false, message: 'Email domain must be typed strictly as @gmail.com (correct spelling and placement).' };
    }
    if (domain.includes('yahoo') && !['yahoo.com', 'yahoo.com.ph'].includes(domain)) {
        return { valid: false, message: 'Did you mean @yahoo.com? Please check domain spelling.' };
    }

    return { valid: false, message: 'Please enter a valid email address (e.g., name@gmail.com).' };
}

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
            if (!decoded || !decoded.id) {
                return res.status(403).json({ success: false, message: 'Invalid Token Payload.' });
            }
            const [rows] = await pool.query('SELECT id, status, role FROM users WHERE id = ?', [decoded.id]);
            if (rows.length === 0) {
                return res.status(401).json({ success: false, message: 'Your account is no longer available. Please log in again.' });
            }
            const user = rows[0];
            if (!['active', 'pending'].includes(user.status)) {
                return res.status(401).json({ success: false, code: 'ACCOUNT_INACTIVE', message: 'Your account has been deactivated. Please contact SASO for assistance.' });
            }
            if (!['student', 'owner', 'admin'].includes(user.role)) {
                return res.status(403).json({ success: false, message: 'Invalid account role.' });
            }
            req.user = { ...decoded, id: user.id, role: user.role, status: user.status };
            next();
        } catch (dbErr) {
            console.warn('Session verification database check failed:', dbErr.code || 'database_error');
            return res.status(503).json({ success: false, message: 'Unable to verify your account right now. Please try again shortly.' });
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
            'SELECT id, name, house_status FROM boarding_houses WHERE owner_id = ? ORDER BY id DESC',
            [user.id]
        );
        if (houses.length > 0) {
            const accredited = houses.find(h => h.house_status === 'accredited');
            if (accredited) {
                payload.houseStatus = 'accredited';
                payload.houseId = accredited.id;
                payload.houseName = accredited.name;
            } else {
                payload.houseStatus = houses[0].house_status;
                payload.houseId = houses[0].id;
                payload.houseName = houses[0].name;
            }
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
    let { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const check = validateStrictEmail(email);
    if (!check.valid) {
        return res.status(400).json({ success: false, message: check.message });
    }
    email = check.email;

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
            return res.status(400).json({
                success: false,
                message: "This account is registered via Google SSO. Please log in using 'Continue with Google' first. You can set up a local password in your profile settings later.",
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Incorrect credentials. Please try again.' });
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
    const rawOrigin = req.query.origin || req.headers.referer || process.env.FRONTEND_URL || 'http://localhost';
    const cleanOrigin = getTrustedOAuthOrigin(rawOrigin);

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
        const targetOrigin = getTrustedOAuthOrigin(req.query.state);

        passport.authenticate('google', { session: false }, (err, user, info) => {
            if (err) {
                console.warn('⚠️ Google OAuth token exchange warning/error:', err.message || err);
                return res.redirect(`${targetOrigin}/login?error=oauth_failed`);
            }
            if (!user) {
                return res.redirect(`${targetOrigin}/login?error=unauthorized_domain`);
            }
            req.user = user;
            next();
        })(req, res, next);
    },
    async (req, res) => {
        const targetOrigin = getTrustedOAuthOrigin(req.query.state);

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
            const code = issueExchangeCode(token, userParam);
            return res.redirect(`${targetOrigin}/auth-success?code=${code}`);

        } catch (err) {
            console.error('OAuth Callback Error:', err.message);
            return res.redirect(`${targetOrigin}/login?error=server_error`);
        }
    }
);

// =========================================================================
// 4.5 OAUTH CODE EXCHANGE POST /api/auth/exchange
//     Swaps the one-time code from the OAuth redirect for the real JWT.
//     Keeps the token out of the URL (history/logs/Referer).
// =========================================================================
router.post('/exchange', (req, res) => {
    const { code } = req.body;

    if (!code || typeof code !== 'string') {
        return res.status(400).json({ success: false, message: 'Missing exchange code.' });
    }

    const entry = oauthExchangeCodes.get(code);
    oauthExchangeCodes.delete(code); // single-use regardless of outcome

    if (!entry || entry.expiresAt < Date.now()) {
        return res.status(400).json({ success: false, message: 'Invalid or expired code.' });
    }

    return res.json({
        success: true,
        token: entry.token,
        user: JSON.parse(decodeURIComponent(entry.userParam)),
    });
});

// =========================================================================
// 5.5 TRADITIONAL OWNER REGISTRATION POST /api/auth/register/owner
//     Disabled for new accounts: Landlords MUST register via Google OAuth
//     to guarantee verified real email accounts.
// =========================================================================
router.post('/register/owner', async (req, res) => {
    return res.status(400).json({
        success: false,
        message: 'Manual landlord registration is disabled. Please click "Continue with Google" to verify your email identity.'
    });
});

// =========================================================================
// 6. OWNER ONBOARDING COMPLETION  POST /api/auth/register/owner-complete
//    Receives the details collected on the OwnerDetailsRegister.vue form,
//    inserts the new owner record, and returns a JWT so the browser can
//    log them in immediately.
// =========================================================================
router.post('/register/owner-complete', async (req, res) => {
    const { name, email, phone, address, google_id, profile_pic } = req.body;

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
            'INSERT INTO users (google_id, name, email, role, status, phone, address, profile_pic) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [google_id, name, email, 'owner', 'pending', phone, address, profile_pic || null]
        );

        const newUser = {
            id: result.insertId,
            name,
            email,
            role: 'owner',
            status: 'pending',
            phone,
            address,
            profile_pic: profile_pic || null,
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

// =========================================================================
// DATA PRIVACY ACT (RA 10173) CONSENT AUDIT LOGGING
// =========================================================================
router.post('/dpa-consent', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        await pool.query('UPDATE users SET dpa_accepted = 1, dpa_accepted_at = NOW() WHERE id = ?', [userId]);

        // Also update session user if stored
        return res.json({
            success: true,
            message: 'Data Privacy Act consent recorded successfully.'
        });
    } catch (err) {
        console.error('DPA Consent Error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to record DPA consent.' });
    }
});

export default router;
