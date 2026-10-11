// Accountless boarding house applications: statuses, reference numbers, tracking
// sessions, account activation tokens and the status history (audit trail).
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export const APPLICATION_STATUS = Object.freeze({
    SUBMITTED: 'SUBMITTED',
    UNDER_REVIEW: 'UNDER_REVIEW',
    REVISION_REQUIRED: 'REVISION_REQUIRED',
    RESUBMITTED: 'RESUBMITTED',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    ACCOUNT_PENDING: 'ACCOUNT_PENDING',
    ACTIVE: 'ACTIVE'
});

// Applicants may change their application only before SASO starts reviewing it,
// or when SASO has asked for a revision. Enforced on the server for every update.
export const APPLICANT_EDITABLE = new Set([APPLICATION_STATUS.SUBMITTED, APPLICATION_STATUS.REVISION_REQUIRED]);
// SASO starts a review only from a fresh submission or a resubmission.
export const REVIEWABLE = new Set([APPLICATION_STATUS.SUBMITTED, APPLICATION_STATUS.RESUBMITTED]);

// Legacy rows (application_status NULL) are described from house_status so they still display.
export function effectiveApplicationStatus(house) {
    if (house.application_status) return house.application_status;
    if (house.house_status === 'accredited') return APPLICATION_STATUS.ACTIVE;
    if (house.house_status === 'rejected') return house.is_resubmission ? APPLICATION_STATUS.REVISION_REQUIRED : APPLICATION_STATUS.REJECTED;
    if (house.house_status === 'pending') return house.is_resubmission ? APPLICATION_STATUS.RESUBMITTED : APPLICATION_STATUS.SUBMITTED;
    return String(house.house_status || '').toUpperCase() || APPLICATION_STATUS.SUBMITTED;
}

// Applicants register without an email. Their account row holds a non-routable placeholder
// (RFC 2606 ".invalid") until they choose a real login email when activating their account.
export const PLACEHOLDER_EMAIL_DOMAIN = '@applicant.invalid';
export const placeholderEmail = (seed) => `${String(seed).toLowerCase().replace(/[^a-z0-9-]/g, '')}${PLACEHOLDER_EMAIL_DOMAIN}`;
export const isPlaceholderEmail = (email) => String(email || '').toLowerCase().endsWith(PLACEHOLDER_EMAIL_DOMAIN);

// A public applicant: pending owner account with no password and no Google link.
export const isPendingApplicant = (user) =>
    Boolean(user) && user.role === 'owner' && user.status === 'pending' && !user.password && !user.google_id;

// ── Reference numbers: the reference alone opens Track My Application, so new ones are
//    random (not sequential) to prevent guessing; older sequential ones stay valid. ──
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateReferenceNo(date = new Date()) {
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) code += REFERENCE_ALPHABET[bytes[i] % REFERENCE_ALPHABET.length];
    return `BH-${date.getFullYear()}-${code}`;
}
export const REFERENCE_PATTERN = /^BH-\d{4}-[A-Z0-9]{5,12}$/;
export const normalizeReference = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');

// ── Tracking session: separate secret and payload so it can never act as a login token ──
const APPLICANT_SECRET = `${process.env.JWT_SECRET || 'your_super_secret_cspc_token_key'}:applicant-tracking`;
export const signApplicantToken = (applicantId) =>
    jwt.sign({ applicantId, scope: 'applicant' }, APPLICANT_SECRET, { expiresIn: '2h' });

export function verifyApplicant(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, message: 'Please verify your application access first.' });
    try {
        const payload = jwt.verify(token, APPLICANT_SECRET);
        if (payload.scope !== 'applicant' || !Number.isInteger(payload.applicantId)) throw new Error('scope');
        req.applicantId = payload.applicantId;
        return next();
    } catch {
        return res.status(401).json({ success: false, message: 'Your tracking session has expired. Please enter your reference number again.' });
    }
}

// ── Owner account activation links: random token, only the SHA-256 hash is stored ──
export const ACTIVATION_TTL_DAYS = 7;
export const hashActivationToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
export async function issueActivationToken(connection, userId) {
    const token = crypto.randomBytes(32).toString('hex');
    // A new link replaces any earlier unused one.
    await connection.query('UPDATE account_activation_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [userId]);
    await connection.query(
        'INSERT INTO account_activation_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))',
        [userId, hashActivationToken(token), ACTIVATION_TTL_DAYS]
    );
    return token;
}
export const activationUrl = (token) => `${(process.env.FRONTEND_URL || 'http://localhost').replace(/\/+$/, '')}/activate-account?token=${token}`;

// ── Status history / audit trail ────────────────────────────────────────────────
const SNAPSHOT_FIELDS = ['name', 'location', 'barangay', 'price', 'phone_contact', 'description', 'amenities_free', 'amenities_paid',
    'latitude', 'longitude', 'advance_months', 'deposit_months', 'deposit_type', 'img', 'house_status', 'admin_comments',
    'permit_business_form', 'permit_cedula', 'permit_dti', 'permit_barangay', 'permit_building', 'permit_zoning', 'permit_sanitary', 'permit_fire'];

export async function recordStatusChange(connection, { houseId, from = null, to, remarks = null, actorType, actorId = null, withSnapshot = false }) {
    let snapshot = null;
    if (withSnapshot) {
        const [rows] = await connection.query('SELECT * FROM boarding_houses WHERE id = ?', [houseId]);
        if (rows[0]) snapshot = JSON.stringify(Object.fromEntries(SNAPSHOT_FIELDS.map(f => [f, rows[0][f] ?? null])));
    }
    await connection.query(
        'INSERT INTO application_status_history (house_id, from_status, to_status, remarks, actor_type, actor_id, snapshot) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [houseId, from, to, remarks, actorType, actorId, snapshot]
    );
}

// Small in-memory limiter for the public tracking/registration endpoints.
export function createRateLimiter({ windowMs, max }) {
    const hits = new Map();
    return (key) => {
        const now = Date.now();
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
        const entry = hits.get(key) || { count: 0, resetAt: now + windowMs };
        entry.count++;
        hits.set(key, entry);
        return entry.count <= max;
    };
}
