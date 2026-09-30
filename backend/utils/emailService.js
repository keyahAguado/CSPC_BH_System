import nodemailer from 'nodemailer';
import pool from '../config/db.js';

/**
 * Dynamically constructs a Nodemailer Transport instance using environment configuration.
 * Supports standard Gmail App Passwords and custom SMTP gateways.
 */
const getTransporter = () => {
    const user = process.env.SMTP_USER || process.env.EMAIL_USER || '';
    const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '465');
    const secure = process.env.SMTP_SECURE !== 'false'; // default true for port 465

    if (process.env.SMTP_SERVICE === 'gmail' || host.includes('gmail.com')) {
        return nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true, // SSL/TLS — works on Render (port 587 STARTTLS is blocked)
            auth: { user, pass },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 10000
        });
    }

    return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
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
 * Direct raw email dispatcher helper
 */
export const sendRawEmail = async (recipientEmail, recipientName, subject, message) => {
    try {
        const user = process.env.SMTP_USER || process.env.EMAIL_USER || '';
        const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';

        const mailOptions = {
            from: `"CSPC Boarding House System" <${user || 'no-reply@cspc.edu.ph'}>`,
            to: recipientEmail,
            subject: `[CSPC Boarding House System] ${subject}`,
            text: `Hello ${recipientName || 'User'},\n\n${message}\n\nBest regards,\nCSPC Boarding House Management Team`,
            html: `
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
            `
        };

        if (user && pass) {
            const transporter = getTransporter();
            const info = await transporter.sendMail(mailOptions);
            console.log(`[EMAIL DISPATCHED SUCCESS]: Sent "${subject}" to ${recipientEmail} | MessageID: ${info.messageId}`);
            return { success: true, messageId: info.messageId };
        } else {
            console.log(`[EMAIL SIMULATED (SMTP Credentials Not Set in backend/.env)]: Subject: "${subject}" | To: ${recipientEmail}`);
            return { success: true, simulated: true, note: 'SMTP_USER and SMTP_PASS must be added to backend/.env to send real emails.' };
        }
    } catch (err) {
        console.error(`[EMAIL DISPATCH ERROR]: Failed to send to ${recipientEmail}: ${err.message}`);
        return { success: false, error: err.message };
    }
};
