import axios from 'axios';
import crypto from 'crypto';
import { notificationForRole } from './notificationAudience.js';

export const escapeEmailHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function notificationEmailContent(user, message, base) {
    message=notificationForRole(message,user.role).replace(/\s+PHT\b/g,'');
    const url = new URL(base);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid frontend URL');
    const pending = user.role === 'owner' && user.status === 'pending';
    url.pathname = pending ? '/track' : `/${['admin', 'owner', 'student'].includes(user.role) ? user.role : 'student'}/notifications`;
    url.search = ''; url.hash = '';
    // Applicants can check the status with just the reference number (random-format references only)
    const reference = pending ? (String(message).match(/\bBH-\d{4}-[A-HJ-NP-Z2-9]{6}\b/) || [])[0] : undefined;
    if (reference) url.search = new URLSearchParams({ ref: reference }).toString();
    const referenceNote = reference ? ` You can also check the status anytime with reference number ${reference} on Track My Application, without signing in.` : '';
    const prefix = String(message).split(':', 1)[0].trim();
    const approval = prefix === 'CONGRATULATIONS' && /\bACCREDITED\b/i.test(message);
    const note = pending
        ? (approval
            ? 'SASO has approved this property. Open Track My Application and verify your registered email to activate your owner account. Activation links expire after seven days; you can request a fresh link from tracking. Your approval does not expire with the link. Activation requires a property that is still approved and accredited.'
            : 'Open Track My Application and verify your registered email to view the current status, SASO feedback, and available actions. Submitting or verifying an application does not activate an owner account.') + referenceNote
        : 'Sign in to view the latest information and any available actions. This email records an event; the system shows the current status.';
    const titles = { 'CHECKOUT REMINDER':'Your planned checkout needs attention', 'APPLICATION SUBMITTED': 'Application received', 'APPLICATION UNDER REVIEW': 'SASO review started', 'REVISION REQUIRED': 'Your application needs corrections', CONGRATULATIONS: 'Your property has been accredited', 'PAYMENT SETTLED': 'Your payment has been verified', 'PAYMENT RECEIVED': 'Payment received', 'RENEWAL DECISION REQUIRED':'Your renewal decision is needed','RENEWAL DECISION OPENED':'Resident renewal decision opened','WAITING FOR RENEWAL DECISION':'Reservation waiting for renewal decision','RENEWAL DECISION UPDATE':'Renewal decision update','RENEWAL DECISION RECORDED':'Departure intention recorded','RENEWAL EXTENSION REQUESTED':'Renewal extension needs approval','RENEWAL DECISION RESOLVED':'Renewal decision resolved','RENEWAL REVIEW COMPLETE':'Reservation ready for owner review','REPLACEMENT REQUEST UPDATE':'Future request update','REPLACEMENT REQUEST CLOSED':'Future request closed','RENEWAL WAIT ENDED':'Renewal waiting stage ended','REQUEST CLOSED':'Reservation request closed','FUTURE RESERVATION APPROVED':'Future room capacity reserved','REPLACEMENT APPROVAL RECORDED':'Replacement reservation approved','REQUEST EXPIRED AFTER RENEWAL REVIEW':'Reservation request expired' };
    const title = prefix === 'CONGRATULATIONS' && /\bRESTORED\b/i.test(message)
        ? 'Your property has been restored'
        : titles[prefix] || 'Your system notification';
    return {
        subject: `CSPC BH Finder - ${title}`,
        textContent: `Hello ${user.name || 'there'},\n\n${message}\n\n${note}\n\n${url.href}`,
        htmlContent: `<html><body style="margin:0;background:#f2f5fa;font-family:Arial,sans-serif;color:#243449"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px" cellspacing="0" cellpadding="0"><tr><td style="padding:26px;background:#142b4a;color:#ffffff;border-radius:16px 16px 0 0;font-weight:bold;font-size:20px">CSPC BH Finder</td></tr><tr><td style="padding:28px"><h1 style="font-size:22px;margin:0 0 20px">${title}</h1><p>Hello ${escapeEmailHtml(user.name || 'there')},</p><div style="background:#f4f7fb;border-left:4px solid #1e4a8d;padding:18px;line-height:1.7;overflow-wrap:anywhere">${escapeEmailHtml(message).replace(/\r?\n/g, '<br>')}</div><p style="font-size:14px;line-height:1.7;color:#526174">${escapeEmailHtml(note)}</p><p style="margin:26px 0"><a href="${escapeEmailHtml(url.href)}" style="display:inline-block;padding:14px 24px;background:#1e4a8d;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold">${pending ? 'Track my application' : 'View notification'}</a></p><p style="font-size:12px;color:#64748b;line-height:1.6">This is an automated system notification. Do not share verification or activation links.</p></td></tr></table></td></tr></table></body></html>`
    };
}

export async function sendNotificationViaBrevo(user, message, notificationId) {
    const content = notificationEmailContent(user, message, process.env.FRONTEND_URL);
    const { data } = await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender: { email: process.env.EMAIL_FROM_ADDRESS, name: process.env.EMAIL_FROM_NAME || 'CSPC BH Finder' },
        to: [{ email: user.email }], ...content,
        headers: { 'Idempotency-Key': crypto.createHash('sha256').update(`${process.env.FRONTEND_URL}|${user.email}|${notificationId}`).digest('hex') }
    }, { headers: { 'api-key': process.env.BREVO_API_KEY }, timeout: 15000 });
    if (!data?.messageId) throw new Error('No provider acknowledgement');
    return data.messageId;
}

// Reads only committed notification rows. Email never participates in business transactions.
export function createNotificationEmailWorker({ pool, send = sendNotificationViaBrevo, env = process.env, log = console }) {
    let running = false;
    return async () => {
        if (running || env.NOTIFICATION_EMAIL_ENABLED !== 'true') return;
        if (!env.BREVO_API_KEY || !env.EMAIL_FROM_ADDRESS || !env.FRONTEND_URL) {
            log.warn('[NOTIFICATION EMAIL] Missing configuration; in-app notifications remain available.'); return;
        }
        running = true;
        let connection, locked = false;
        try {
            connection = await pool.getConnection();
            const [locks] = await connection.query("SELECT GET_LOCK('cspc_notification_email', 0) AS acquired");
            locked = Number(locks[0]?.acquired) === 1;
            if (!locked) return;
            // Migration records a cutoff so historical messages are never mass-emailed.
            await connection.query(`INSERT IGNORE INTO notification_email_deliveries (notification_id)
                SELECT n.id FROM notifications n JOIN notification_email_settings s ON s.id = 1
                WHERE n.id > s.start_after_id`);
            const [rows] = await connection.query(`SELECT d.notification_id, d.attempts, n.message, u.email, u.name, u.role, u.status
                FROM notification_email_deliveries d JOIN notifications n ON n.id = d.notification_id
                JOIN users u ON u.id = n.user_id
                WHERE d.status = 'pending' AND d.next_attempt_at <= NOW()
                ORDER BY d.notification_id LIMIT 10`);
            for (const row of rows) {
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email || '') || String(row.email).endsWith('@applicant.invalid')) {
                    await connection.query("UPDATE notification_email_deliveries SET status = 'skipped' WHERE notification_id = ?", [row.notification_id]); continue;
                }
                try {
                    const messageId = await send(row, row.message, row.notification_id);
                    await connection.query("UPDATE notification_email_deliveries SET status = 'accepted', provider_message_id = ?, accepted_at = NOW(), attempts = attempts + 1 WHERE notification_id = ?", [messageId, row.notification_id]);
                } catch (error) {
                    const attempts = Number(row.attempts) + 1;
                    const status = attempts >= 5 ? 'failed' : 'pending';
                    await connection.query('UPDATE notification_email_deliveries SET status = ?, attempts = ?, next_attempt_at = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE notification_id = ?', [status, attempts, Math.min(60, 2 ** attempts), row.notification_id]);
                    // Never log provider error objects, recipients, messages or credentials.
                    log.warn(`[NOTIFICATION EMAIL] Notification ${row.notification_id}: delivery attempt failed.`);
                }
            }
        } catch (error) {
            const missingSchema = error?.code === 'ER_NO_SUCH_TABLE';
            log.warn(missingSchema
                ? '[NOTIFICATION EMAIL] Queue tables are missing. Apply 2026-10-11_add_notification_email_queue.sql before enabling notification emails. In-app workflows are unaffected.'
                : '[NOTIFICATION EMAIL] Worker unavailable. Check migration/configuration; in-app workflows are unaffected.');
        } finally {
            if (locked) await connection.query("SELECT RELEASE_LOCK('cspc_notification_email')").catch(() => {});
            connection?.release(); running = false;
        }
    };
}
