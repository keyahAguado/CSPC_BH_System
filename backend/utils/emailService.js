import nodemailer from 'nodemailer';
import pool from '../config/db.js';

/**
 * Dynamically constructs a Nodemailer Transport instance using environment configuration.
 * Supports standard Gmail App Passwords and custom SMTP gateways.
 */
const createTransporter = (portOverride = null, secureOverride = null) => {
    const user = process.env.SMTP_USER || process.env.EMAIL_USER || '';
    const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';

    const configuredPort = parseInt(process.env.SMTP_PORT || '587');
    const port = portOverride !== null ? portOverride : configuredPort;
    const secure = secureOverride !== null ? secureOverride : (process.env.SMTP_SECURE === 'true' || port === 465);

    if (process.env.SMTP_SERVICE === 'gmail' || host.includes('gmail.com')) {
        return nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port,
            secure,
            requireTLS: !secure,
            auth: { user, pass },
            tls: { rejectUnauthorized: false },
            connectionTimeout: 4000,
            greetingTimeout: 4000,
            socketTimeout: 4000
        });
    }

    return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 4000,
        greetingTimeout: 4000,
        socketTimeout: 4000
    });
};

/**
 * Asynchronously sends an email notification to a registered user without blocking API flow
 * @param {number} userId - The target user database ID
 * @param {string} subject - Email subject line
 * @param {string} message - Notification text message
 */
export const sendNotificationEmail = (userId, subject, message) => {
    Promise.resolve().then(async () => {
        try {
            if (!userId) return;

            const [[user]] = await pool.query('SELECT name, email FROM users WHERE id = ?', [userId]);
            if (!user || !user.email) return;

            await sendRawEmail(user.email, user.name, subject, message);
        } catch (err) {
            console.error('[EMAIL SERVICE ERROR]: Failed to dispatch user notification email:', err.message);
        }
    }).catch(err => {
        console.error('[EMAIL UNHANDLED REJECTION]:', err.message);
    });
};

/**
 * Direct raw email dispatcher helper with HTTPS API support and dual-port fallback
 */
export const sendRawEmail = async (recipientEmail, recipientName, subject, message) => {
    try {
        const user = process.env.SMTP_USER || process.env.EMAIL_USER || '';
        const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';
        const resendApiKey = process.env.RESEND_API_KEY || process.env.RESEND_KEY || '';

        const htmlContent = `
            <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                    <div style="background: #1e40af; padding: 20px 24px; text-align: center;">
                        <h2 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">CSPC Boarding House System</h2>
                    </div>
                    <div style="padding: 32px 24px;">
                        <p style="font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 0;">Hello ${recipientName || 'User'},</p>
                        <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px;">${message}</p>
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

        // Option A: Use Resend HTTPS API if API Key is configured in environment (100% reliable on Vercel/serverless)
        if (resendApiKey) {
            try {
                const resendRes = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${resendApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: process.env.EMAIL_FROM || 'CSPC Boarding House System <onboarding@resend.dev>',
                        to: [recipientEmail],
                        subject: `[CSPC Boarding House System] ${subject}`,
                        html: htmlContent
                    })
                });
                if (resendRes.ok) {
                    const data = await resendRes.json();
                    console.log(`[EMAIL DISPATCHED VIA RESEND HTTPS]: Sent to ${recipientEmail} | ID: ${data.id}`);
                    return { success: true, messageId: data.id };
                }
            } catch (resendErr) {
                console.warn(`[EMAIL RESEND HTTPS ERROR]: ${resendErr.message}. Falling back to Nodemailer SMTP...`);
            }
        }

        // Option B: Nodemailer SMTP with Dual-Port Auto Fallback (587 / 465)
        const mailOptions = {
            from: `"CSPC Boarding House System" <${user || 'no-reply@cspc.edu.ph'}>`,
            to: recipientEmail,
            subject: `[CSPC Boarding House System] ${subject}`,
            text: `Hello ${recipientName || 'User'},\n\n${message}\n\nBest regards,\nCSPC Boarding House Management Team`,
            html: htmlContent
        };

        if (user && pass) {
            try {
                const transporter = createTransporter();
                const info = await transporter.sendMail(mailOptions);
                console.log(`[EMAIL DISPATCHED SUCCESS]: Sent "${subject}" to ${recipientEmail} | MessageID: ${info.messageId}`);
                return { success: true, messageId: info.messageId };
            } catch (primaryErr) {
                console.warn(`[EMAIL DISPATCH WARNING]: Primary transport attempt failed (${primaryErr.message}). Attempting fallback...`);
                
                try {
                    const configuredPort = parseInt(process.env.SMTP_PORT || '587');
                    const fallbackPort = configuredPort === 465 ? 587 : 465;
                    const fallbackSecure = fallbackPort === 465;

                    const fallbackTransporter = createTransporter(fallbackPort, fallbackSecure);
                    const info = await fallbackTransporter.sendMail(mailOptions);
                    console.log(`[EMAIL DISPATCHED SUCCESS VIA FALLBACK]: Sent "${subject}" to ${recipientEmail} on port ${fallbackPort} | MessageID: ${info.messageId}`);
                    return { success: true, messageId: info.messageId };
                } catch (fallbackErr) {
                    console.error(`[EMAIL DISPATCH NOTICE]: Direct SMTP connection timed out or blocked on host network (${fallbackErr.message}).`);
                    return { success: false, simulated: true, error: fallbackErr.message };
                }
            }
        } else {
            console.log(`[EMAIL SIMULATED (SMTP Credentials Not Set in backend/.env)]: Subject: "${subject}" | To: ${recipientEmail}`);
            return { success: true, simulated: true, note: 'SMTP_USER and SMTP_PASS or RESEND_API_KEY must be added to backend/.env to send real emails.' };
        }
    } catch (err) {
        console.error(`[EMAIL DISPATCH ERROR]: Failed to send to ${recipientEmail}: ${err.message}`);
        return { success: false, error: err.message };
    }
};
