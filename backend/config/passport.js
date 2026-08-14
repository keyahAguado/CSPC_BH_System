import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import pool from './db.js'; // Imports promise-based connection pool

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
},
    async (accessToken, refreshToken, profile, done) => {
        const email = profile.emails[0]?.value;
        if (!email) {
            return done(null, false, { message: 'No email found in Google account.' });
        }

        // ─── INSTITUTIONAL DOMAIN GUARD ───
        // Only @my.cspc.edu.ph accounts are permitted to authenticate via Google SSO.
        // Any other domain is rejected before any database interaction occurs.
        if (!email.endsWith('@my.cspc.edu.ph')) {
            return done(null, false, { message: 'unauthorized_domain' });
        }
        // ──────────────────────────────────

        const newUser = {
            google_id: profile.id,
            name: profile.displayName || email.split('@')[0],
            email: email,
            role: 'student',
            status: 'active'
        };

        try {
            // 1. Check if user already exists by Google ID
            let [rows] = await pool.query('SELECT * FROM users WHERE google_id = ?', [profile.id]);
            
            if (rows.length > 0) {
                return done(null, rows[0]);
            }

            // 2. Check if email exists (maybe registered via standard email previously)
            [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
            if (rows.length > 0) {
                // Update existing record with google_id and ensure role is preserved or set
                await pool.query('UPDATE users SET google_id = ? WHERE email = ?', [profile.id, email]);
                const [updated] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
                return done(null, updated[0]);
            }

            // 3. Create new student record if entirely new user
            const [result] = await pool.query(
                'INSERT INTO users (google_id, name, email, role, status) VALUES (?, ?, ?, ?, ?)',
                [newUser.google_id, newUser.name, newUser.email, newUser.role, newUser.status]
            );
            const [created] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
            return done(null, created[0]);

        } catch (err) {
            console.error('Google OAuth DB Error:', err.message);
            return done(err);
        }
    }));

export default passport;