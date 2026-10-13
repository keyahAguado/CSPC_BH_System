import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { escapeEmailHtml } from './notificationEmail.js';

export const normalizeApplicantEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
export const validApplicantEmail = email => email.length <= 255 && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email) && !/@(my\.)?cspc\.edu\.ph$/i.test(email);
export const hashVerificationToken = value => crypto.createHash('sha256').update(value).digest('hex');
const secret = () => {
    if (!process.env.JWT_SECRET) throw new Error('Applicant verification is not configured.');
    return `${process.env.JWT_SECRET}:verified-applicant-v2`;
};
export const signVerifiedApplicant = (email, applicantId = null) => jwt.sign(
    { scope: 'verified-applicant', email, ...(applicantId ? { applicantId } : {}) }, secret(), { expiresIn: '2h' }
);
export function readVerifiedApplicant(header = '') {
    if (!header.startsWith('Bearer ')) throw new Error('Missing verification session.');
    const payload = jwt.verify(header.slice(7), secret());
    if (payload.scope !== 'verified-applicant' || !validApplicantEmail(payload.email)
        || (payload.applicantId !== undefined && !Number.isInteger(payload.applicantId))) throw new Error('Invalid verification session.');
    return payload;
}
export function requireVerifiedEmail(req, res, next) {
    try {
        req.verifiedApplicant = readVerifiedApplicant(req.headers.authorization || '');
        next();
    } catch {
        return res.status(401).json({ success: false, message: 'Please verify your email before continuing. Your application has not been submitted.' });
    }
}

// Separate from the existing disabled notification service: Phase 1 sends verification only.
export async function sendApplicantVerification(email, token) {
    const { BREVO_API_KEY, EMAIL_FROM_ADDRESS, FRONTEND_URL } = process.env;
    if (process.env.APPLICANT_EMAIL_ENABLED !== 'true' || !BREVO_API_KEY || !EMAIL_FROM_ADDRESS || !FRONTEND_URL) throw new Error('Verification email is not configured.');
    const base = new URL(FRONTEND_URL);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Invalid frontend URL.');
    const link = new URL('/verify-applicant-email', base);
    // Fragment keeps the bearer token out of HTTP request URLs/referrers.
    link.hash = new URLSearchParams({ token }).toString();
    await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender: { email: EMAIL_FROM_ADDRESS, name: process.env.EMAIL_FROM_NAME || 'CSPC BH Finder' },
        to: [{ email }], subject: 'Verify your email — CSPC BH Finder',
        textContent: `Verify your email to submit or track your boarding-house application:\n\n${link.href}\n\nThis link expires in 30 minutes and can be used once. If you did not request it, ignore this email.`,
        htmlContent: `<html><body style="margin:0;background:#f2f5fa;font-family:Arial,sans-serif;color:#243449"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:600px;background:white;border:1px solid #e2e8f0;border-radius:16px" cellspacing="0" cellpadding="0"><tr><td style="padding:26px;background:#142b4a;color:white;font-size:20px;font-weight:bold;border-radius:16px 16px 0 0">CSPC BH Finder</td></tr><tr><td style="padding:28px"><h1 style="font-size:22px">Verify your applicant email</h1><p style="line-height:1.8">Confirm access to your inbox to submit or track your property application. This does not approve your property or activate an owner account.</p><p style="margin:26px 0"><a href="${escapeEmailHtml(link.href)}" style="display:inline-block;background:#1e4a8d;color:white;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Verify my email</a></p><p style="font-size:14px;color:#526174;line-height:1.7">This link expires in 30 minutes and can be used once. If you did not request it, ignore this email. Do not share this link.</p></td></tr></table></td></tr></table></body></html>`
    }, { headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 });
}

export function verificationHandlers({ pool, send = sendApplicantVerification, limit }) {
    return {
        request: async (req, res) => {
            const email = normalizeApplicantEmail(req.body?.email);
            if (!validApplicantEmail(email)) return res.status(400).json({ success: false, message: 'Enter a valid personal email address.' });
            if (!limit(`ip:${req.ip}`) || !limit(`email:${email}`)) return res.status(429).json({ success: false, message: 'Please wait before requesting another verification email.' });
            const token = crypto.randomBytes(32).toString('hex');
            const hash = hashVerificationToken(token);
            // Kept only by the tab that asked for the link; it collects the session once the link is opened anywhere.
            const requestId = crypto.randomBytes(32).toString('hex');
            try {
                const [users] = await pool.query('SELECT role, status, password, google_id FROM users WHERE email = ?', [email]);
                // Identical outward response: do not reveal existing account status.
                const eligible = !users.length || (users[0].role === 'owner' && users[0].status === 'pending' && !users[0].password && !users[0].google_id);
                if (eligible) {
                    await pool.query('INSERT INTO applicant_email_verifications (email, token_hash, poll_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))', [email, hash, hashVerificationToken(requestId)]);
                    try { await send(email, token); }
                    catch {
                        await pool.query('DELETE FROM applicant_email_verifications WHERE token_hash = ? AND used_at IS NULL', [hash]);
                        throw new Error('Verification delivery failed');
                    }
                }
                // Ineligible emails also get a requestId (it never resolves) so the response stays identical.
                return res.json({ success: true, requestId, message: 'If this email is eligible, a verification link has been requested. Check your inbox and spam folder. Existing account holders should sign in.' });
            } catch {
                // Never log Axios errors: they can contain the API key and verification link.
                return res.status(503).json({ success: false, message: 'Email verification is temporarily unavailable. Please try again later. No application was submitted.' });
            }
        },
        consume: async (req, res) => {
            if (!limit(`verify:${req.ip}`)) return res.status(429).json({ success: false, message: 'Please wait before trying verification again.' });
            const token = req.body?.token;
            if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ success: false, message: 'This verification link is invalid. Request another link.' });
            let connection;
            try {
                connection = await pool.getConnection();
                await connection.beginTransaction();
                const [rows] = await connection.query('SELECT id, email FROM applicant_email_verifications WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() FOR UPDATE', [hashVerificationToken(token)]);
                if (!rows.length) {
                    await connection.rollback();
                    return res.status(400).json({ success: false, message: 'This verification link has expired or was already used. Request another link.' });
                }
                const email = rows[0].email;
                const [users] = await connection.query('SELECT id, role, status, password, google_id FROM users WHERE email = ? FOR UPDATE', [email]);
                const user = users[0];
                if (user && !(user.role === 'owner' && user.status === 'pending' && !user.password && !user.google_id)) {
                    await connection.rollback();
                    return res.status(409).json({ success: false, message: 'Please sign in with your existing account.' });
                }
                // Opening the link only proves inbox access. The tab that requested it (on any device)
                // picks up the session through /email/status, so this device is not signed in.
                await connection.query('UPDATE applicant_email_verifications SET used_at = NOW(), verified_at = IF(expires_at > NOW(), NOW(), verified_at) WHERE email = ? AND used_at IS NULL', [email]);
                if (user) await connection.query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?', [user.id]);
                await connection.commit();
                return res.json({ success: true, verified: true, email });
            } catch {
                if (connection) await connection.rollback().catch(() => {});
                return res.status(503).json({ success: false, message: 'We could not verify your email. Please try again later.' });
            } finally { connection?.release(); }
        },
        // Polled by the requesting tab: hands over the verified session once, after the email link was opened.
        status: async (req, res) => {
            if (!limit(`status:${req.ip}`)) return res.status(429).json({ success: false, message: 'Please wait a moment before checking again.' });
            const requestId = req.body?.requestId;
            if (typeof requestId !== 'string' || !/^[a-f0-9]{64}$/.test(requestId)) return res.status(400).json({ success: false, message: 'Request a new verification link.' });
            let connection;
            try {
                connection = await pool.getConnection();
                await connection.beginTransaction();
                const [rows] = await connection.query('SELECT id, email, verified_at, claimed_at, expires_at > NOW() AS active FROM applicant_email_verifications WHERE poll_hash = ? FOR UPDATE', [hashVerificationToken(requestId)]);
                const row = rows[0];
                if (!row || row.claimed_at || !row.active) {
                    await connection.rollback();
                    return res.json({ success: true, verified: false, expired: true });
                }
                if (!row.verified_at) {
                    await connection.rollback();
                    return res.json({ success: true, verified: false });
                }
                const [users] = await connection.query('SELECT id, role, status, password, google_id FROM users WHERE email = ? FOR UPDATE', [row.email]);
                const user = users[0];
                if (user && !(user.role === 'owner' && user.status === 'pending' && !user.password && !user.google_id)) {
                    await connection.rollback();
                    return res.status(409).json({ success: false, message: 'Please sign in with your existing account.' });
                }
                await connection.query('UPDATE applicant_email_verifications SET claimed_at = NOW() WHERE id = ?', [row.id]);
                await connection.commit();
                return res.json({ success: true, verified: true, token: signVerifiedApplicant(row.email, user?.id), email: row.email, hasApplications: Boolean(user) });
            } catch {
                if (connection) await connection.rollback().catch(() => {});
                return res.status(503).json({ success: false, message: 'We could not check your verification. Please try again.' });
            } finally { connection?.release(); }
        }
    };
}
