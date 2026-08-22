import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import pool from './db.js';

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
},
    async (accessToken, refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value;
        if (!email) {
            return done(null, false, { message: 'No email found in Google account.' });
        }

        // ─── DOMAIN-BASED ROLE DETECTION ───
        const isStudent = email.endsWith('@my.cspc.edu.ph');
        const isAdmin   = email.endsWith('@cspc.edu.ph');
        const isOwner   = !isStudent && !isAdmin; // any other domain (e.g. @gmail.com)

        const name       = profile.displayName || email.split('@')[0];
        const profilePic = profile.photos?.[0]?.value || null;

        try {
            // ─── PATH A: STUDENT ───────────────────────────────────────────
            if (isStudent) {
                // 1. Try to find by Google ID
                let [rows] = await pool.query('SELECT * FROM users WHERE google_id = ?', [profile.id]);
                if (rows.length > 0) return done(null, rows[0]);

                // 2. Try to find by email (previously manual account)
                [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
                if (rows.length > 0) {
                    await pool.query('UPDATE users SET google_id = ? WHERE email = ?', [profile.id, email]);
                    const [updated] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
                    return done(null, updated[0]);
                }

                // 3. Auto-register new student
                const [result] = await pool.query(
                    'INSERT INTO users (google_id, name, email, role, status) VALUES (?, ?, ?, ?, ?)',
                    [profile.id, name, email, 'student', 'active']
                );
                const [created] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
                return done(null, created[0]);
            }

            // ─── PATH B: ADMIN / EMPLOYEE ──────────────────────────────────
            if (isAdmin) {
                // 1. Try to find by Google ID
                let [rows] = await pool.query('SELECT * FROM users WHERE google_id = ?', [profile.id]);
                if (rows.length > 0) return done(null, rows[0]);

                // 2. Try to find by email
                [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
                if (rows.length > 0) {
                    await pool.query('UPDATE users SET google_id = ? WHERE email = ?', [profile.id, email]);
                    const [updated] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
                    return done(null, updated[0]);
                }

                // 3. Auto-register new admin
                const [result] = await pool.query(
                    'INSERT INTO users (google_id, name, email, role, status) VALUES (?, ?, ?, ?, ?)',
                    [profile.id, name, email, 'admin', 'active']
                );
                const [created] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
                return done(null, created[0]);
            }

            // ─── PATH C: OWNER (personal Gmail or other domain) ───────────
            // 1. Try to find by Google ID
            let [rows] = await pool.query('SELECT * FROM users WHERE google_id = ?', [profile.id]);
            if (rows.length > 0) return done(null, rows[0]);

            // 2. Try to find by email (returning owner with existing account)
            [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
            if (rows.length > 0) {
                await pool.query('UPDATE users SET google_id = ? WHERE email = ?', [profile.id, email]);
                const [updated] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
                return done(null, updated[0]);
            }

            // 3. Brand-new owner — do NOT insert yet; return a shell object
            //    The callback route will redirect them to the onboarding form.
            return done(null, {
                isNewOwner: true,
                google_id: profile.id,
                name,
                email,
                profilePic,
            });

        } catch (err) {
            console.error('Google OAuth DB Error:', err.message);
            return done(err);
        }
    }
));

export default passport;
