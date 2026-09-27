import express from 'express';
import pool from '../config/db.js';
import { authenticateToken } from './auth.js';
import { sendRawEmail } from '../utils/emailService.js';

const router = express.Router();

// Document-expiry notifications are owned entirely by complianceManager.js
// (the daily cron, and an immediate check right after a document is saved),
// which respects the critical vs supplementary document tiering. This route
// used to also run its own separate, untiered expiry check on every page
// load — removed to avoid two systems producing conflicting notifications
// for the same event.

// 1. [GET] - Get all notifications for the logged-in user
router.get('/', authenticateToken, async (req, res) => {
    try {
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
        const [[{ count }]] = await pool.query('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
        res.json({ success: true, count });
    } catch (err) {
        res.status(500).json({ success: false, count: 0 });
    }
});

// 4. [POST] - Test Email Dispatch Diagnostic Endpoint
router.post('/test-email', authenticateToken, async (req, res) => {
    try {
        const recipientEmail = req.body.email || req.user.email;
        const recipientName = req.user.name || 'User';

        const result = await sendRawEmail(
            recipientEmail,
            recipientName,
            'CSPC System Email Dispatch Test',
            'This is a diagnostic test email sent from the CSPC Boarding House Management System to verify email delivery functionality.'
        );

        res.json({
            success: result.success !== false,
            recipient: recipientEmail,
            detail: result
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;