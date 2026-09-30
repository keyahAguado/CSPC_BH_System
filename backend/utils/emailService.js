import pool from '../config/db.js';

/**
 * Escapes special HTML characters in text inputs to prevent HTML injection in emails.
 * @param {string} str 
 * @returns {string}
 */
const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

/**
 * Asynchronously sends an email notification to a registered user without blocking API flow.
 * Checks sendRawEmail's result and logs success/failure accurately.
 * @param {number} userId - The target user database ID
 * @param {string} subject - Email subject line
 * @param {string} message - Notification text message
 */
export const sendNotificationEmail = (userId, subject, message) => {
    Promise.resolve().then(async () => {
        try {
            if (!userId) return;

            const [[user]] = await pool.query('SELECT name, email FROM users WHERE id = ?', [userId]);
            if (!user || !user.email) {
                console.warn(`[EMAIL NOTICE]: Target user ID ${userId} has no valid email address recorded.`);
                return;
            }

            console.log(`[EMAIL QUEUED]: Prepared Brevo HTTPS notification for user ID ${userId} (${user.email}).`);
            const result = await sendRawEmail(user.email, user.name, subject, message);
            if (!result.success) {
                console.error(`[EMAIL DISPATCH FAILED]: Brevo rejected notification for user ID ${userId} (${user.email}): ${result.error}`);
            }
        } catch (err) {
            console.error('[EMAIL SERVICE ERROR]: Exception during email notification processing:', err.message);
        }
    }).catch(err => {
        console.error('[EMAIL UNHANDLED REJECTION]:', err.message);
    });
};

/**
 * Direct transactional email dispatcher helper using Brevo HTTPS REST API (v3).
 * API Endpoint: POST https://api.brevo.com/v3/smtp/email
 * Header: api-key: BREVO_API_KEY
 * 
 * @param {string} recipientEmail 
 * @param {string} recipientName 
 * @param {string} subject 
 * @param {string} message 
 * @returns {Promise<{success: boolean, messageId?: string, error?: string, status?: number}>}
 */
export const sendRawEmail = async (recipientEmail, recipientName, subject, message) => {
    try {
        const apiKey = process.env.BREVO_API_KEY || '';
        const senderAddress = process.env.EMAIL_FROM_ADDRESS || '';
        const senderName = process.env.EMAIL_FROM_NAME || 'CSPC Boarding House System';

        if (!apiKey) {
            console.warn('[EMAIL CONFIG MISSING]: BREVO_API_KEY is not set in environment variables.');
            return {
                success: false,
                error: 'BREVO_API_KEY is missing. Please set BREVO_API_KEY in Render Environment Variables.'
            };
        }

        if (!senderAddress) {
            console.warn('[EMAIL CONFIG MISSING]: EMAIL_FROM_ADDRESS is not set in environment variables.');
            return {
                success: false,
                error: 'EMAIL_FROM_ADDRESS is missing. Please set EMAIL_FROM_ADDRESS in Render Environment Variables.'
            };
        }

        if (!recipientEmail) {
            return { success: false, error: 'Recipient email address is required.' };
        }

        const safeRecipientName = escapeHtml(recipientName || 'User');
        const safeMessage = escapeHtml(message || '');
        const formattedSubject = `[CSPC Boarding House System] ${subject}`;
        const plainText = `Hello ${recipientName || 'User'},\n\n${message}\n\nBest regards,\nCSPC Boarding House Management Team`;

        const htmlContent = `
            <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                    <div style="background: #1e40af; padding: 20px 24px; text-align: center;">
                        <h2 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">CSPC Boarding House System</h2>
                    </div>
                    <div style="padding: 32px 24px;">
                        <p style="font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 0;">Hello ${safeRecipientName},</p>
                        <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px;">${safeMessage}</p>
                        <div style="padding: 16px; background-color: #f1f5f9; border-radius: 8px; border-left: 4px solid #1e40af;">
                            <p style="margin: 0; font-size: 12px; color: #64748b; font-weight: 600;">You can log in to your CSPC Boarding House Portal to review details and take necessary action.</p>
                        </div>
                    </div>
                    <div style="background-color: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #f1f5f9;">
                        <p style="margin: 0; font-size: 11px; color: #94a3b8; font-weight: 600;">Camarines Sur Polytechnic Colleges &bull; Boarding House Management Office</p>
                    </div>
                </div>
            </div>
        `;

        const payload = {
            sender: {
                name: senderName,
                email: senderAddress
            },
            to: [
                {
                    email: recipientEmail,
                    name: recipientName || 'User'
                }
            ],
            subject: formattedSubject,
            textContent: plainText,
            htmlContent: htmlContent
        };

        // Bounded request timeout (10 seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        }).finally(() => clearTimeout(timeoutId));

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
            const messageId = data.messageId || (Array.isArray(data.messageIds) ? data.messageIds[0] : 'accepted');
            console.log(`[EMAIL BREVO ACCEPTED]: Sent "${subject}" to ${recipientEmail} | MessageID: ${messageId}`);
            return {
                success: true,
                messageId
            };
        } else {
            const errorMsg = data.message || data.code || `HTTP Status ${response.status}`;
            console.error(`[EMAIL BREVO REJECTED]: Provider returned error (HTTP ${response.status}): ${errorMsg}`);
            return {
                success: false,
                status: response.status,
                error: errorMsg
            };
        }
    } catch (err) {
        const errorMsg = err.name === 'AbortError' ? 'HTTPS request timed out after 10 seconds' : err.message;
        console.error(`[EMAIL DISPATCH ERROR]: Failed to send to ${recipientEmail}: ${errorMsg}`);
        return {
            success: false,
            error: errorMsg
        };
    }
};
