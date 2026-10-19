// Track My Application: accountless access for boarding house applicants.
// Verified email grants restricted tracking access; ownership is checked on every route.
import express from 'express';
import {
    requireVerifiedEmail, verificationHandlers, signVerifiedApplicant, hashVerificationToken,
    isTrackingSessionActive, readVerifiedApplicant
} from '../config/applicantVerification.js';
import pool from '../config/db.js';
import { validateImages } from '../config/uploadValidation.js';
import { validateBody, validateInput } from '../config/inputValidation.js';
import { uploadAccreditationFiles, submitAccreditationAs, markApplicationSubmitted } from './boardingHouses.js';
import {
    APPLICATION_STATUS, APPLICANT_EDITABLE, effectiveApplicationStatus, isPendingApplicant,
    REFERENCE_PATTERN, normalizeReference, verifyApplicant, issueActivationToken, activationUrl,
    recordStatusChange, createRateLimiter, ACTIVATION_TTL_DAYS, isPlaceholderEmail
} from '../config/applicationWorkflow.js';

const router = express.Router();
const verificationIpLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
const verificationEmailLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const verificationCooldown = createRateLimiter({ windowMs: 60 * 1000, max: 1 });
// The requesting tab polls every few seconds while it waits for the link to be opened
const verificationStatusLimit = createRateLimiter({ windowMs: 60 * 1000, max: 40 });
const emailVerification = verificationHandlers({ pool, limit: key => key.startsWith('email:')
    ? verificationEmailLimit(key) && verificationCooldown(key)
    : key.startsWith('status:') ? verificationStatusLimit(key) : verificationIpLimit(key) });
router.post('/email/request', emailVerification.request);
router.post('/email/verify', emailVerification.consume);
router.post('/email/status', emailVerification.status);

const accessByIp = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
const accessByReference = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const changesByApplicant = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

const GENERIC_ACCESS_ERROR = 'No application was found with that reference number.';
const notFound = (res) => res.status(404).json({ success: false, message: 'Application not found.' });

// validateBody() only accepts numeric route params; these routes use the reference number instead.
const validatePropertyBody = (req, res, next) => {
    const error = validateInput('property', req.body || {});
    if (error) return res.status(400).json({ success: false, message: error, errorCode: 'invalid_input' });
    return next();
};

// Marks multipart requests from these routes as application uploads (permit PDFs, photo limits).
const markApplicationUpload = (req, res, next) => { req.applicationUpload = true; next(); };

const verifyCurrentApplicant = async (req, res, next) => {
    try {
        const user = await loadApplicant(req.applicantId);
        if (!isPendingApplicant(user) || user.email.toLowerCase() !== req.verifiedApplicant.email) {
            return res.status(401).json({ success: false, message: 'Applicant access is no longer available. Activated owners should sign in.' });
        }
        // Remembered-device sessions are checked every time, so signing out takes effect immediately
        if (req.verifiedApplicant?.sid && !(await isTrackingSessionActive(pool, req.verifiedApplicant.sid, req.verifiedApplicant.email))) {
            return res.status(401).json({ success: false, message: 'You signed out on this device or your 7-day session ended. Please verify your email again.' });
        }
        next();
    } catch {
        return res.status(503).json({ success: false, message: 'We could not check your application access. Please try again later.' });
    }
};
const applicantAccess = [verifyApplicant, verifyCurrentApplicant];

async function loadApplicant(applicantId) {
    const [rows] = await pool.query('SELECT id, name, email, role, status, password, google_id FROM users WHERE id = ?', [applicantId]);
    return rows[0] || null;
}

// Only applications owned by the verified applicant are ever returned.
async function loadOwnedApplication(applicantId, reference) {
    if (!REFERENCE_PATTERN.test(reference)) return null;
    const [rows] = await pool.query('SELECT * FROM boarding_houses WHERE reference_no = ? AND owner_id = ?', [reference, applicantId]);
    return rows[0] || null;
}

function accountStatus(applicant, statuses) {
    if (applicant.status === 'active' && applicant.password) return 'ACTIVE';
    if (statuses.includes(APPLICATION_STATUS.ACCOUNT_PENDING)) return 'ACCOUNT_PENDING';
    return 'NOT_APPROVED_YET';
}

async function notifyAdmins(message) {
    try {
        const [admins] = await pool.query("SELECT id FROM users WHERE role = 'admin'");
        for (const admin of admins) await pool.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [admin.id, message]);
    } catch (err) {
        console.error('Application admin notification failed:', err.code || err.message);
    }
}

// ── Reference-number tracking (no email needed) ──────────────────────────────
// Returns only the status, progress dates and nothing private (no name, remarks, documents, contacts).
// Only the random reference format is accepted: older sequential numbers (e.g. BH-2026-00014) are
// guessable, so those must be tracked with the registered email instead.
const RANDOM_REFERENCE = /^BH-\d{4}-[A-HJ-NP-Z2-9]{6}$/;
const LEGACY_REFERENCE = /^BH-\d{4}-\d{5}$/;
const trackByIp = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 15 });
const trackByReference = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
const REFERENCE_NOT_FOUND = 'No application was found with that reference number. Check it and try again, or track with your registered email.';

router.post('/track', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const reference = normalizeReference(req.body?.reference_no);
    if (!trackByIp(`track:${req.ip || 'unknown'}`) || (reference && !trackByReference(`track:${reference}`))) {
        return res.status(429).json({ success: false, message: 'Too many attempts. Please wait 15 minutes and try again.' });
    }
    if (LEGACY_REFERENCE.test(reference)) {
        return res.status(404).json({ success: false, legacy: true, message: 'Older reference numbers can only be tracked with your registered email. Use "Track with email" below.' });
    }
    if (!RANDOM_REFERENCE.test(reference)) return res.status(404).json({ success: false, message: REFERENCE_NOT_FOUND });
    try {
        const [rows] = await pool.query(
            'SELECT id, reference_no, house_status, application_status, is_resubmission, created_at FROM boarding_houses WHERE reference_no = ?',
            [reference]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: REFERENCE_NOT_FOUND });
        const house = rows[0];
        const [history] = await pool.query(
            'SELECT to_status, created_at FROM application_status_history WHERE house_id = ? ORDER BY created_at ASC, id ASC',
            [house.id]
        );
        const timeline = history.map(h => ({ status: h.to_status, at: h.created_at }));
        return res.json({
            success: true,
            application: {
                reference_no: house.reference_no,
                status: effectiveApplicationStatus(house),
                submitted_at: timeline[0]?.at || house.created_at || null,
                updated_at: timeline[timeline.length - 1]?.at || house.created_at || null,
                timeline
            }
        });
    } catch (err) {
        console.error('Reference tracking error:', err.code || err.message);
        return res.status(500).json({ success: false, message: 'We could not check that reference right now. Please try again.' });
    }
});

// ── Remembered device (7 days) ───────────────────────────────────────────────
const resumeByIp = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 30 });
const DEVICE_TOKEN = /^[a-f0-9]{64}$/;

// POST /api/applications/session/resume — continue a remembered device without a new email link.
router.post('/session/resume', async (req, res) => {
    if (!resumeByIp(`resume:${req.ip || 'unknown'}`)) return res.status(429).json({ success: false, message: 'Too many attempts. Please wait and try again.' });
    const deviceToken = req.body?.deviceToken;
    const ended = () => res.status(401).json({ success: false, message: 'Your remembered session has ended. Please verify your email again.' });
    if (typeof deviceToken !== 'string' || !DEVICE_TOKEN.test(deviceToken)) return ended();
    try {
        const [rows] = await pool.query(
            'SELECT id, email FROM applicant_tracking_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()',
            [hashVerificationToken(deviceToken)]
        );
        if (rows.length === 0) return ended();
        const session = rows[0];
        const [users] = await pool.query('SELECT id, role, status, password, google_id FROM users WHERE email = ?', [session.email]);
        const user = users[0];
        // Activated owners (or other accounts) must sign in normally; this device session ends
        if (user && !isPendingApplicant(user)) {
            await pool.query('UPDATE applicant_tracking_sessions SET revoked_at = NOW() WHERE id = ?', [session.id]);
            return res.status(401).json({ success: false, message: 'Applicant access is no longer available. Activated owners should sign in.' });
        }
        await pool.query('UPDATE applicant_tracking_sessions SET last_used_at = NOW() WHERE id = ?', [session.id]);
        return res.json({
            success: true, email: session.email, hasApplications: Boolean(user),
            token: signVerifiedApplicant(session.email, user?.id, { sid: session.id, via: 'device' })
        });
    } catch (err) {
        console.error('Tracking session resume error:', err.code || err.message);
        return res.status(503).json({ success: false, message: 'We could not restore your session. Please try again.' });
    }
});

// POST /api/applications/session/revoke — sign out this device, or every device for the verified email.
// Always answers success so it reveals nothing about other sessions.
router.post('/session/revoke', async (req, res) => {
    try {
        const deviceToken = req.body?.deviceToken;
        if (typeof deviceToken === 'string' && DEVICE_TOKEN.test(deviceToken)) {
            const [rows] = await pool.query('SELECT id, email FROM applicant_tracking_sessions WHERE token_hash = ?', [hashVerificationToken(deviceToken)]);
            if (rows[0]) {
                if (req.body?.all === true) await pool.query('UPDATE applicant_tracking_sessions SET revoked_at = NOW() WHERE email = ? AND revoked_at IS NULL', [rows[0].email]);
                else await pool.query('UPDATE applicant_tracking_sessions SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL', [rows[0].id]);
            }
        } else if (req.body?.all === true) {
            // No remembered device here: "sign out everywhere" uses the current verified session's email
            let payload = null;
            try { payload = readVerifiedApplicant(req.headers.authorization || ''); } catch { payload = null; }
            if (payload) await pool.query('UPDATE applicant_tracking_sessions SET revoked_at = NOW() WHERE email = ? AND revoked_at IS NULL', [payload.email]);
        }
        return res.json({ success: true });
    } catch (err) {
        console.error('Tracking session revoke error:', err.code || err.message);
        return res.status(503).json({ success: false, message: 'We could not sign out everywhere right now. Please try again.' });
    }
});

// POST /api/applications/access — open a 2-hour tracking session with the reference number.
router.post('/access', requireVerifiedEmail, validateBody('applicationAccess'), async (req, res) => {
    const reference = normalizeReference(req.body.reference_no);
    if (!accessByIp(req.ip || 'unknown') || !accessByReference(reference)) {
        return res.status(429).json({ success: false, message: 'Too many attempts. Please wait 15 minutes and try again.' });
    }
    try {
        if (!REFERENCE_PATTERN.test(reference)) return res.status(401).json({ success: false, message: GENERIC_ACCESS_ERROR });
        const [rows] = await pool.query(
            `SELECT u.id FROM boarding_houses bh JOIN users u ON u.id = bh.owner_id
             WHERE bh.reference_no = ? AND u.role = 'owner' AND u.status = 'pending' AND u.email = ?`,
            [reference, req.verifiedApplicant.email]
        );
        if (rows.length === 0) return res.status(401).json({ success: false, message: GENERIC_ACCESS_ERROR });
        return res.json({ success: true, token: signVerifiedApplicant(req.verifiedApplicant.email, rows[0].id, { sid: req.verifiedApplicant.sid, via: req.verifiedApplicant.via }) });
    } catch (err) {
        console.error('Application access error:', err.code || err.message);
        return res.status(500).json({ success: false, message: 'We could not verify your application right now. Please try again.' });
    }
});

// GET /api/applications/mine — every application of the verified applicant.
router.get('/mine', applicantAccess, async (req, res) => {
    try {
        const applicant = await loadApplicant(req.applicantId);
        if (!applicant) return res.status(401).json({ success: false, message: 'Please verify your application access again.' });
        const [houses] = await pool.query(
            `SELECT bh.id, bh.reference_no, bh.name, bh.house_status, bh.application_status, bh.is_resubmission, bh.admin_comments,
                    bh.created_at, bh.resubmitted_at,
                    (SELECT MAX(h.created_at) FROM application_status_history h WHERE h.house_id = bh.id) AS last_activity
             FROM boarding_houses bh WHERE bh.owner_id = ? ORDER BY bh.created_at DESC, bh.id DESC`,
            [req.applicantId]
        );
        const applications = houses.map(h => {
            const status = effectiveApplicationStatus(h);
            return {
                reference_no: h.reference_no,
                name: h.name,
                status,
                submitted_at: h.created_at,
                updated_at: h.last_activity || h.resubmitted_at || h.created_at,
                remarks: [APPLICATION_STATUS.REVISION_REQUIRED, APPLICATION_STATUS.REJECTED].includes(status) ? (h.admin_comments || null) : null,
                editable: APPLICANT_EDITABLE.has(status) && Boolean(h.reference_no)
            };
        });
        return res.json({
            success: true,
            applicant: { name: applicant.name, email: isPlaceholderEmail(applicant.email) ? null : applicant.email, account_status: accountStatus(applicant, applications.map(a => a.status)) },
            applications
        });
    } catch (err) {
        console.error('Application list error:', err.code || err.message);
        return res.status(500).json({ success: false, message: 'We could not load your applications. Please try again.' });
    }
});

// GET /api/applications/:reference — full details for viewing or editing one application.
router.get('/:reference', applicantAccess, async (req, res) => {
    try {
        const house = await loadOwnedApplication(req.applicantId, normalizeReference(req.params.reference));
        if (!house) return notFound(res);
        const [photos] = await pool.query('SELECT photo_url, category FROM house_photos WHERE house_id = ? ORDER BY sort_order ASC, id ASC', [house.id]);
        const [permitFiles] = await pool.query('SELECT permit_key, file_path FROM house_permit_files WHERE house_id = ? ORDER BY permit_key, sort_order, id', [house.id]);
        const [history] = await pool.query('SELECT to_status AS status, remarks, created_at FROM application_status_history WHERE house_id = ? ORDER BY created_at ASC, id ASC', [house.id]);
        const [customDocuments] = await pool.query('SELECT criteria_id, file_path, file_paths, expiry_date FROM house_documents WHERE house_id = ?', [house.id]);
        const [customCriteria] = await pool.query('SELECT id, label, requirement_type FROM checklist_criteria WHERE is_active = 1 AND permit_key IS NULL AND id NOT BETWEEN 30 AND 37 AND (house_id IS NULL OR house_id = ?)', [house.id]);
        const status = effectiveApplicationStatus(house);
        const fields = ['reference_no', 'name', 'img', 'location', 'barangay', 'map_link', 'price', 'phone_contact', 'description',
            'amenities_free', 'amenities_paid', 'latitude', 'longitude', 'advance_months', 'deposit_months', 'deposit_type', 'admin_comments', 'created_at'];
        const permits = ['business_form', 'cedula', 'dti', 'barangay', 'building', 'zoning', 'sanitary', 'fire'].flatMap(k => [`permit_${k}`, `expiry_permit_${k}`]);
        return res.json({
            success: true,
            application: { ...Object.fromEntries([...fields, ...permits].map(f => [f, house[f] ?? null])), status, editable: APPLICANT_EDITABLE.has(status) },
            photos,
            permitFiles,
            customDocuments, customCriteria,
            history
        });
    } catch (err) {
        console.error('Application detail error:', err.code || err.message);
        return res.status(500).json({ success: false, message: 'We could not load this application. Please try again.' });
    }
});

// POST /api/applications/:reference/update — edit before review, or resubmit after a revision request.
router.post('/:reference/update', applicantAccess, markApplicationUpload, uploadAccreditationFiles, validateImages, validatePropertyBody, async (req, res) => {
    if (!changesByApplicant(`applicant:${req.applicantId}`)) {
        return res.status(429).json({ success: false, message: 'Too many changes in a short time. Please wait a few minutes and try again.' });
    }
    try {
        const house = await loadOwnedApplication(req.applicantId, normalizeReference(req.params.reference));
        if (!house) return notFound(res);
        const before = effectiveApplicationStatus(house);
        if (!APPLICANT_EDITABLE.has(before)) {
            const reason = before === APPLICATION_STATUS.UNDER_REVIEW || before === APPLICATION_STATUS.RESUBMITTED
                ? 'SASO is reviewing this application, so it is locked. You can edit it again if SASO requests a revision.'
                : 'This application can no longer be edited.';
            return res.status(409).json({ success: false, message: reason });
        }

        req.body.house_id = String(house.id);
        const after = before === APPLICATION_STATUS.REVISION_REQUIRED ? APPLICATION_STATUS.RESUBMITTED : APPLICATION_STATUS.SUBMITTED;
        req.applicantEdit = { before, after, houseStatus: house.house_status, remarks: house.admin_comments || '' };
        const captured = await submitAccreditationAs(req, req.applicantId);
        if (captured.code >= 400 || !captured.body?.success) {
            return res.status(captured.code >= 400 ? captured.code : 500).json(captured.body && !captured.body.success
                ? captured.body
                : { success: false, message: 'We could not save your changes. Please try again.' });
        }

        if (after === APPLICATION_STATUS.RESUBMITTED) {
            await notifyAdmins(`SYSTEM: Application ${house.reference_no} ("${req.body.house_name}") was revised and resubmitted for review.`);
        }
        return res.json({ success: true, status: after, message: after === APPLICATION_STATUS.RESUBMITTED ? 'Revised application resubmitted to SASO.' : 'Your changes were saved.' });
    } catch (err) {
        console.error('Application update error:', err.code || err.message);
        return res.status(500).json({ success: false, message: 'We could not save your changes. Please try again.' });
    }
});

// POST /api/applications/new — add another property for the same verified applicant.
router.post('/new', applicantAccess, markApplicationUpload, uploadAccreditationFiles, validateImages, validatePropertyBody, async (req, res) => {
    if (!changesByApplicant(`applicant:${req.applicantId}`)) {
        return res.status(429).json({ success: false, message: 'Too many submissions in a short time. Please wait a few minutes and try again.' });
    }
    try {
        const applicant = await loadApplicant(req.applicantId);
        if (!applicant || applicant.role !== 'owner') return res.status(401).json({ success: false, message: 'Please verify your application access again.' });
        if (!isPendingApplicant(applicant)) {
            return res.status(409).json({ success: false, message: 'Your owner account is active. Please log in and add the property from your owner dashboard.' });
        }
        delete req.body.house_id;
        const captured = await submitAccreditationAs(req, req.applicantId);
        if (captured.code >= 400 || !captured.body?.success || !captured.body.houseId) {
            return res.status(captured.code >= 400 ? captured.code : 500).json(captured.body && !captured.body.success
                ? captured.body
                : { success: false, message: 'We could not save your application. Please try again.' });
        }
        const referenceNo = await markApplicationSubmitted(captured.body.houseId, req.applicantId);
        return res.status(201).json({ success: true, reference_no: referenceNo, message: 'New property application submitted.' });
    } catch (err) {
        console.error('Additional application error:', err.code || err.message);
        return res.status(500).json({ success: false, message: 'We could not save your application. Please try again.' });
    }
});

// POST /api/applications/activation-link — approved applicant gets a fresh one-time activation link.
router.post('/activation-link', applicantAccess, async (req, res) => {
    // Setting the owner password needs a fresh email verification, not a remembered device
    if (req.verifiedApplicant?.via === 'device') {
        return res.status(403).json({ success: false, code: 'FRESH_VERIFICATION_REQUIRED', message: 'For your security, verify your email again to activate your owner account.' });
    }
    if (!changesByApplicant(`activation:${req.applicantId}`)) {
        return res.status(429).json({ success: false, message: 'Too many requests. Please wait a few minutes and try again.' });
    }
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [users] = await connection.query('SELECT id, role, status, password, google_id FROM users WHERE id = ? FOR UPDATE', [req.applicantId]);
        const [approved] = await connection.query("SELECT id FROM boarding_houses WHERE owner_id = ? AND application_status = ? AND house_status = 'accredited' LIMIT 1 FOR UPDATE", [req.applicantId, APPLICATION_STATUS.ACCOUNT_PENDING]);
        if (!isPendingApplicant(users[0]) || approved.length === 0) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'Account activation is available only after SASO approves an application.' });
        }
        const token = await issueActivationToken(connection, req.applicantId);
        await connection.commit();
        return res.json({ success: true, activation_url: activationUrl(token), expires_in_days: ACTIVATION_TTL_DAYS });
    } catch (err) {
        await connection.rollback();
        console.error('Activation link error:', err.code || err.message);
        return res.status(500).json({ success: false, message: 'We could not create an activation link. Please try again.' });
    } finally {
        connection.release();
    }
});

export default router;
