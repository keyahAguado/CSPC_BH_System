import { validateBody } from '../config/inputValidation.js';
import { notificationForRole } from '../config/notificationAudience.js';
import express from 'express';
import pool from '../config/db.js';
import { authenticateToken } from './auth.js';

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
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC',
            [req.user.id]
        );
        // Many booking notices name only REF-0064 or link to a room. Add the property and room so the inbox can show
        // and filter by them. Only bookings/rooms the signed-in user owns (or booked) are looked up.
        const bookingIds=[...new Set(notifications.map(n=>Number(String(n.message || '').match(/\bREF-(\d{1,15})\b/)?.[1])).filter(id=>Number.isSafeInteger(id) && id>0))];
        const roomIds=[...new Set(notifications.map(n=>Number(String(n.link || '').match(/^\/owner\/rooms\/details\/(\d{1,15})$/)?.[1])).filter(id=>Number.isSafeInteger(id) && id>0))];
        const byBooking=new Map(),byRoom=new Map();
        if (bookingIds.length) {
            const [rows]=await pool.query(`SELECT b.id, bh.name AS house_name, r.room_number FROM bookings b JOIN boarding_houses bh ON bh.id = b.house_id
                LEFT JOIN rooms r ON r.id = b.room_id WHERE b.id IN (?) AND (bh.owner_id = ? OR b.student_id = ?)`,[bookingIds,req.user.id,req.user.id]);
            for (const row of rows) byBooking.set(Number(row.id),row);
        }
        if (roomIds.length) {
            const [rows]=await pool.query('SELECT r.id, r.room_number, bh.name AS house_name FROM rooms r JOIN boarding_houses bh ON bh.id = r.house_id WHERE r.id IN (?) AND bh.owner_id = ?',[roomIds,req.user.id]);
            for (const row of rows) byRoom.set(Number(row.id),row);
        }
        res.json({ success: true, notifications:notifications.map(n=>{
            const found=byBooking.get(Number(String(n.message || '').match(/\bREF-(\d{1,15})\b/)?.[1])) || byRoom.get(Number(String(n.link || '').match(/^\/owner\/rooms\/details\/(\d{1,15})$/)?.[1]));
            return {...n,message:notificationForRole(n.message,req.user.role).replace(/\s+PHT\b/g,''),...(found ? {house_name:found.house_name,room_number:found.room_number} : {})};
        }) });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
    }
});

// 2. [POST] - Mark notification as read
router.post('/read/:id', authenticateToken, validateBody('ids'), async (req, res) => {
    try {
        await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', 
        [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update status.' });
    }
});

// 2.5 [POST] - Mark all of the signed-in user's notifications as read
router.post('/read-all', authenticateToken, async (req, res) => {
    try {
        const [result] = await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [req.user.id]);
        res.json({ success: true, updated: result.affectedRows });
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

// 4. [POST] - Diagnostic Endpoint for POD Version
router.post('/test-email', authenticateToken, async (req, res) => {
    res.json({
        success: true,
        disabled: true,
        message: 'Email notifications are disabled for the POD defense version.'
    });
});

export default router;
