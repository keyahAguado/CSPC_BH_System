import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_cspc_token_key';

// ================= 1. EXPORTED JWT DECRYPTION MIDDLEWARE =================
export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Extract from Bearer <token>
    if (!token) return res.status(401).json({ success: false, message: 'Access Token Required.' });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ success: false, message: 'Expired Token.' });
        req.user = decoded; // Contains { id, email, role }
        next();
    });
};

// ================= 2. [CREATE] - Owner & Student Registration Endpoints =================
router.post('/register/owner', async (req, res) => {
    const { name, email, password, phone, address } = req.body;

    try {
        const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Email is already registered. Please log in.'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await pool.query(
            'INSERT INTO users (name, email, password, role, phone, address, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, email, hashedPassword, 'owner', phone, address, 'pending']
        );

        const token = jwt.sign(
            { id: result.insertId, email, role: 'owner' },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            success: true,
            message: 'Owner registration successful! Awaiting SASO approval.',
            token,
            user: { id: result.insertId, name, email, role: 'owner', status: 'pending' }
        });

    } catch (err) {
        console.error('Registration Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});

router.post('/register/student', async (req, res) => {
    const { name, email, password, phone, student_id, course, year_section } = req.body;

    try {
        const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Email is already registered. Please log in.'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await pool.query(
            'INSERT INTO users (name, email, password, role, status, phone, student_id, course, year_section) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, email, hashedPassword, 'student', 'active', phone || null, student_id || null, course || null, year_section || null]
        );

        const token = jwt.sign(
            { id: result.insertId, email, role: 'student' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            success: true,
            message: 'Student account created successfully!',
            token,
            user: {
                id: result.insertId,
                name,
                email,
                role: 'student',
                status: 'active',
                student_id: student_id || null,
                course: course || null,
                year_section: year_section || null,
                phone: phone || null
            }
        });

    } catch (err) {
        console.error('Student Registration Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error during student registration.' });
    }
});

// ================= 3. [POST] - Standard Login Endpoint =================
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found. Please check your email or register.'
            });
        }

        const user = rows[0];

        // Self-healing: If user exists via Google SSO (no password set yet), set their password on manual login
        if (!user.password && password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id]);
            user.password = hashedPassword;
        }

        const isMatch = await bcrypt.compare(password, user.password || '');
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Incorrect password. Please try again.'
            });
        }

        let houseStatus = 'none';
        let houseId = null;
        let houseName = '';

        if (user.role === 'owner') {
            const [houses] = await pool.query(
                'SELECT id, name, house_status FROM boarding_houses WHERE owner_id = ?',
                [user.id]
            );

            if (houses.length > 0) {
                houseStatus = houses[0].house_status;
                houseId = houses[0].id;
                houseName = houses[0].name;
            }
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: `Welcome back, ${user.name}!`,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
                student_id: user.student_id || null,
                course: user.course || null,
                year_section: user.year_section || null,
                phone: user.phone || null,
                houseStatus,
                houseId,
                houseName
            }
        });

    } catch (err) {
        console.error('Login Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});

import passport from 'passport';
import '../config/passport.js';

// ================= 4. GOOGLE OAUTH INITIATION (DYNAMIC ORIGIN PRESERVATION) =================
router.get('/google', (req, res, next) => {
    const rawOrigin = req.query.origin || req.headers.referer || process.env.FRONTEND_URL || 'http://localhost:5173';
    // Clean trailing slashes
    const cleanOrigin = rawOrigin.replace(/\/+$/, '');

    passport.authenticate('google', {
        scope: ['profile', 'email'],
        prompt: 'select_account',
        session: false,
        state: cleanOrigin
    })(req, res, next);
});

// ================= 5. GOOGLE OAUTH CALLBACK (DYNAMIC ORIGIN RESOLUTION) =================
router.get('/google/callback',
    (req, res, next) => {
        const targetOrigin = req.query.state ? decodeURIComponent(req.query.state) : (process.env.FRONTEND_URL || 'http://localhost:5173');
        passport.authenticate('google', {
            session: false,
            failureRedirect: `${targetOrigin}/login?error=unauthorized_domain`
        })(req, res, next);
    },
    async (req, res) => {
        try {
            const user = req.user;
            const targetOrigin = req.query.state ? decodeURIComponent(req.query.state) : (process.env.FRONTEND_URL || 'http://localhost:5173');

            const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            // Build a complete, unified user payload matching manual login exactly
            const payload = {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
                student_id: user.student_id || null,
                course: user.course || null,
                year_section: user.year_section || null,
                phone: user.phone || null
            };

            // If the user is an owner, fetch their boarding house status dynamically
            if (user.role === 'owner') {
                const [houses] = await pool.query(
                    'SELECT id, name, house_status FROM boarding_houses WHERE owner_id = ?',
                    [user.id]
                );
                if (houses.length > 0) {
                    payload.houseStatus = houses[0].house_status;
                    payload.houseId = houses[0].id;
                    payload.houseName = houses[0].name;
                } else {
                    payload.houseStatus = 'none';
                    payload.houseId = null;
                    payload.houseName = '';
                }
            }

            const userPayload = encodeURIComponent(JSON.stringify(payload));
            res.redirect(`${targetOrigin}/auth-success?token=${token}&user=${userPayload}`);
        } catch (err) {
            console.error('Callback Error:', err.message);
            const targetOrigin = req.query.state ? decodeURIComponent(req.query.state) : (process.env.FRONTEND_URL || 'http://localhost:5173');
            res.redirect(`${targetOrigin}/login?error=server_error`);
        }
    }
);

// POST - Secure Change Password for Students or Owners
router.post('/change-password', authenticateToken, async (req, res) => {
    const userId = req.user.id; // Safely retrieved from the authenticateToken JWT payload
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ success: false, message: 'Both password fields are required.' });
    }

    try {
        // 1. Fetch user's current password hash
        const [[user]] = await pool.query('SELECT password FROM users WHERE id = ?', [userId]);
        if (!user || !user.password) {
            return res.status(404).json({ success: false, message: 'User password record not found.' });
        }

        // 2. Verify current password matches
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Your current password is incorrect.' });
        }

        // 3. Hash and save the new password
        const saltRounds = 10;
        const newHashedPassword = await bcrypt.hash(newPassword, saltRounds);

        await pool.query(
            'UPDATE users SET password = ? WHERE id = ?',
            [newHashedPassword, userId]
        );

        res.json({ success: true, message: 'Password updated successfully.' });
    } catch (err) {
        console.error('Change Password Error:', err.message);
        res.status(500).json({ success: false, message: 'Internal server error while changing password.' });
    }
});

export default router;