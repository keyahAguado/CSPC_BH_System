import express from 'express';
import rateLimit from 'express-rate-limit';
import pool from '../config/db.js';
import { authenticateToken } from './auth.js';
import { createOwnerPaymentService, ownerConnection, paymentMode, paymentSetupAvailable, publicConnection } from '../config/ownerPayments.js';

const router = express.Router();
const service = createOwnerPaymentService();
const failure = (error, fallback) => error.status ? {status:error.status,message:error.message}
    : [401,403].includes(error.response?.status) ? {status:503,message:'PayMongo has not authorized this payment setup. Please contact the system administrator; cash bookings remain available.'}
    : {status:502,message:fallback};
router.use(authenticateToken, (req, res, next) => req.user.role === 'owner' ? next() : res.status(403).json({success:false, message:'Only property owners can manage payment setup.'}));
router.use(rateLimit({windowMs: 60_000, limit: 20, standardHeaders:'draft-8', legacyHeaders:false}));
router.get('/', async (req, res) => {
    try { res.json({success:true, connection:publicConnection(await ownerConnection(pool, req.user.id))}); }
    catch { res.status(503).json({success:false, message:'Payment setup is temporarily unavailable. Please contact the administrator.'}); }
});
router.post('/start', async (req, res) => {
    let db;
    try {
        if (!paymentSetupAvailable()) return res.status(503).json({success:false, message:'Online payment setup needs administrator configuration. Cash bookings remain available.'});
        const email = String(req.body.email || '').trim().toLowerCase();
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || req.body.confirmAccountOwnership !== true) return res.status(400).json({success:false, message:'Enter your PayMongo email and confirm that you own or are authorized to manage that merchant account.'});
        db = await pool.getConnection(); await db.beginTransaction();
        const [users] = await db.query("SELECT id FROM users WHERE id = ? AND role = 'owner' AND status = 'active' FOR UPDATE", [req.user.id]);
        if (!users.length) throw Object.assign(new Error('Activate your owner account before setting up payments.'), {status:403});
        const existing = await ownerConnection(db, req.user.id);
        if (existing?.invitation_id) {
            if (existing.email !== email) throw Object.assign(new Error('A connection already exists for another email. Contact the administrator before changing the receiving account.'), {status:409});
            await db.commit(); return res.json({success:true, connection:publicConnection(existing)});
        }
        const invitationId = await service.invite(email);
        await db.query("INSERT INTO owner_payment_connections (owner_id, mode, email, invitation_id, status) VALUES (?, ?, ?, ?, 'pending')", [req.user.id, paymentMode(), email, invitationId]);
        await db.commit();
        res.json({success:true, connection:publicConnection(await ownerConnection(pool, req.user.id))});
    } catch (error) {
        if (db) await db.rollback();
        const issue = failure(error, 'PayMongo could not start setup. Check your email and try again later, or contact the administrator if you already have a PayMongo account.');
        res.status(issue.status).json({success:false, message:issue.message});
    } finally { db?.release(); }
});
router.post('/refresh', async (req, res) => {
    let db;
    try {
        if (!paymentSetupAvailable()) return res.status(503).json({success:false, message:'Online payment setup needs administrator configuration.'});
        db = await pool.getConnection(); await db.beginTransaction();
        await db.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [req.user.id]);
        const row = await ownerConnection(db, req.user.id);
        if (!row?.invitation_id) throw Object.assign(new Error('Start payment setup first.'), {status:409});
        const updated = await service.refresh(row);
        await db.query('UPDATE owner_payment_connections SET status = ?, account_id = COALESCE(?, account_id), webhook_id = COALESCE(?, webhook_id), webhook_secret = COALESCE(?, webhook_secret), checked_at = NOW() WHERE id = ?', [updated.status, updated.account_id || null, updated.webhook_id || null, updated.webhook_secret || null, row.id]);
        await db.commit();
        res.json({success:true, connection:publicConnection({...row, ...updated, checked_at:new Date().toISOString()})});
    } catch (error) {
        if (db) await db.rollback();
        // Fail closed for NEW payments; keep the saved account and webhook for existing payments.
        await pool.query("UPDATE owner_payment_connections SET status = 'attention' WHERE owner_id = ? AND mode = ? AND status = 'ready'", [req.user.id, paymentMode()]).catch(() => {});
        const issue = failure(error, 'Unable to confirm your PayMongo connection. Complete any pending steps in PayMongo, then check again. If this continues, contact the administrator.');
        res.status(issue.status).json({success:false, message:issue.message});
    } finally { db?.release(); }
});
export default router;
