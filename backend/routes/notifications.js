import express from 'express';
import pool from '../config/db.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

const PERMIT_LABELS = {
    permit_business_form: 'Business Permit',
    permit_cedula: 'Cedula',
    permit_dti: 'DTI Registration',
    permit_barangay: 'Barangay Clearance',
    permit_building: 'Building Inspection Certificate',
    permit_zoning: 'Zoning/Locational Clearance',
    permit_sanitary: 'Sanitary/Health Permit',
    permit_fire: 'Fire Safety Inspection Certificate'
};

/**
 * Automated Document Expiry Notification Checker
 * Detects expired or expiring permits (within 30 days) and posts unread inbox alerts to owners.
 */
async function checkExpiringDocumentsForOwner(userId) {
    try {
        const [houses] = await pool.query(
            'SELECT id, name, expiry_permit_business_form, expiry_permit_cedula, expiry_permit_dti, expiry_permit_barangay, expiry_permit_building, expiry_permit_zoning, expiry_permit_sanitary, expiry_permit_fire FROM boarding_houses WHERE owner_id = ?',
            [userId]
        );
        if (houses.length === 0) return;

        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(now.getDate() + 30);

        for (const house of houses) {
            // A. Institutional permits check
            for (const [key, label] of Object.entries(PERMIT_LABELS)) {
                const expiryVal = house['expiry_' + key];
                if (!expiryVal) continue;

                const expiryDate = new Date(expiryVal);
                if (isNaN(expiryDate.getTime())) continue;

                const isExpired = expiryDate < now;
                const isExpiringSoon = !isExpired && expiryDate <= thirtyDaysFromNow;

                if (isExpired || isExpiringSoon) {
                    const dateStr = expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const msgPrefix = isExpired ? '🚨 EXPIRED PERMIT:' : '⚠️ EXPIRING PERMIT WARNING:';
                    const msgBody = isExpired
                        ? `${msgPrefix} Your ${label} for "${house.name}" expired on ${dateStr}. Please upload an updated permit in Legal Documents.`
                        : `${msgPrefix} Your ${label} for "${house.name}" will expire on ${dateStr}. Please renew and upload your document.`;

                    // Deduplicate: check if any notification (read or unread) containing label and house.name already exists within last 7 days
                    const [existing] = await pool.query(
                        `SELECT id FROM notifications 
                         WHERE user_id = ? AND message LIKE ? 
                         AND created_at >= NOW() - INTERVAL 7 DAY LIMIT 1`,
                        [userId, `%${label}%${house.name}%`]
                    );

                    if (existing.length === 0) {
                        await pool.query(
                            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                            [userId, msgBody]
                        );
                    }
                }
            }

            // B. Custom criteria documents in house_documents table
            const [customDocs] = await pool.query(
                `SELECT hd.expiry_date, c.label 
                 FROM house_documents hd 
                 JOIN checklist_criteria c ON hd.criteria_id = c.id 
                 WHERE hd.house_id = ? AND hd.expiry_date IS NOT NULL`,
                [house.id]
            );

            for (const doc of customDocs) {
                if (!doc.expiry_date) continue;
                const expiryDate = new Date(doc.expiry_date);
                if (isNaN(expiryDate.getTime())) continue;

                const isExpired = expiryDate < now;
                const isExpiringSoon = !isExpired && expiryDate <= thirtyDaysFromNow;

                if (isExpired || isExpiringSoon) {
                    const dateStr = expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const label = doc.label || 'Legal Document';
                    const msgPrefix = isExpired ? '🚨 EXPIRED DOCUMENT:' : '⚠️ EXPIRING DOCUMENT WARNING:';
                    const msgBody = isExpired
                        ? `${msgPrefix} Your ${label} for "${house.name}" expired on ${dateStr}. Please upload an updated document.`
                        : `${msgPrefix} Your ${label} for "${house.name}" will expire on ${dateStr}. Please renew and upload your document.`;

                    const [existing] = await pool.query(
                        `SELECT id FROM notifications 
                         WHERE user_id = ? AND message LIKE ? 
                         AND created_at >= NOW() - INTERVAL 7 DAY LIMIT 1`,
                        [userId, `%${label}%${house.name}%`]
                    );

                    if (existing.length === 0) {
                        await pool.query(
                            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                            [userId, msgBody]
                        );
                    }
                }
            }
        }
    } catch (err) {
        console.error('[NOTIFICATIONS] Error checking expiring documents:', err.message);
    }
}

// 1. [GET] - Get all notifications for the logged-in user
router.get('/', authenticateToken, async (req, res) => {
    try {
        if (req.user.role === 'owner') {
            await checkExpiringDocumentsForOwner(req.user.id);
        }
        const [notifications] = await pool.query(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json({ success: true, notifications });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
    }
});

// 2. [POST] - Mark notification as read
router.post('/read/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', 
        [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update status.' });
    }
});

// 3. [GET] - Count unread notifications (for Navbar badges)
router.get('/unread-count', authenticateToken, async (req, res) => {
    try {
        if (req.user.role === 'owner') {
            await checkExpiringDocumentsForOwner(req.user.id);
        }
        const [[{ count }]] = await pool.query('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
        res.json({ success: true, count });
    } catch (err) {
        res.status(500).json({ success: false, count: 0 });
    }
});

export default router;