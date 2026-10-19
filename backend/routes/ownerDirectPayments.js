import { notifyPaymentInterruption } from '../config/paymentInterruption.js';
import express from 'express';
import rateLimit from 'express-rate-limit';
import pool from '../config/db.js';
import { authenticateToken } from './auth.js';
import { paymentMode } from '../config/paymentEnvironment.js';
import { sealSecret } from '../config/paymentSecrets.js';
import { directSetupAvailable, currentDirectConnection, directPublic, createDirectPaymentService,
    newDirectRecord, validateOwnerKey, directContext, directFailure, pauseDirectConnection } from '../config/ownerDirectPayments.js';

const router=express.Router(),service=createDirectPaymentService();
const fail=(status,message)=>Object.assign(new Error(message),{status});
router.use(authenticateToken,(req,res,next)=>req.user.role==='owner'?next():res.status(403).json({success:false,message:'Only owners can manage their payment account.'}));
router.use((req,res,next)=>{res.set('Cache-Control','no-store');res.set('Pragma','no-cache');next();});
router.use(rateLimit({windowMs:60_000,limit:10,standardHeaders:'draft-8',legacyHeaders:false}));
router.use((req,res,next)=>{
    // The application captures raw JSON for webhook signatures; never retain setup secrets there.
    req.rawBody=undefined;
    if(req.method==='GET')return next();
    if(!directSetupAvailable())return res.status(503).json({success:false,message:'Direct owner payments need administrator configuration. Cash bookings remain available.'});
    const localTest=paymentMode()==='test'&&['localhost','127.0.0.1','[::1]'].includes(req.hostname)&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);
    if(!req.secure&&!localTest)return res.status(400).json({success:false,message:'Use the HTTPS site to manage payment credentials. Live keys are never accepted over HTTP.'});
    const age=Date.now()/1000-Number(req.user.iat);
    if(!Number.isFinite(age)||age<0||age>15*60)return res.status(401).json({success:false,errorCode:'recent_login_required',message:'For your security, sign out and sign in again before changing payment settings. Your saved connection is unchanged.'});
    next();
});
const logEvent=(db,ownerId,id,action)=>db.query('INSERT INTO owner_payment_events (owner_id,connection_id,action) VALUES (?,?,?)',[ownerId,id,action]);
async function ownerLock(db,id) {
    const [rows]=await db.query("SELECT id FROM users WHERE id = ? AND role = 'owner' AND status = 'active' FOR UPDATE",[id]);
    if(!rows.length)throw fail(403,'Activate your owner account before setting up payments.');
}
router.get('/',async(req,res)=>{
    try {
        const row=await currentDirectConnection(pool,req.user.id);
        const [history]=await pool.query('SELECT action,created_at FROM owner_payment_events WHERE owner_id = ? ORDER BY id DESC LIMIT 10',[req.user.id]);
        res.json({success:true,direct:directPublic(row),history});
    }catch{res.status(503).json({success:false,message:'Payment settings could not be loaded.'});}
});
router.post('/connect',async(req,res)=>{
    let db,row,committed=false;
    try {
        if(req.body.authorized!==true||req.body.allowWebhook!==true)throw fail(400,'Confirm account ownership and payment-webhook setup before continuing.');
        const key=typeof req.body.secretKey==='string'?req.body.secretKey.trim():'';
        delete req.body.secretKey;
        validateOwnerKey(key);
        const label=String(req.body.label||'').trim();
        if(!label||label.length>120||/[\x00-\x1f]/.test(label))throw fail(400,'Enter a merchant label of 1–120 characters. It is a reminder for you, not PayMongo-verified identity.');
        row=newDirectRecord(req.user.id,key,label);
        db=await pool.getConnection();await db.beginTransaction();await ownerLock(db,req.user.id);
        const previous=await currentDirectConnection(db,req.user.id);
        if(previous?.status==='pending'&&Date.now()-new Date(previous.checked_at||previous.created_at).getTime()<120000)throw fail(409,'Payment setup is already in progress. Wait a moment, then check the connection.');
        const [used]=await db.query('SELECT id,owner_id FROM owner_direct_payment_connections WHERE key_fingerprint = ?',[row.key_fingerprint]);
        if(used.length&&(Number(used[0].owner_id)!==Number(req.user.id)||used[0].id!==previous?.id))throw fail(409,'This key is already associated with another connection. Use the latest key for your own merchant account.');
        if(previous?.key_fingerprint===row.key_fingerprint) {
            row=previous;
            await db.query("UPDATE owner_direct_payment_connections SET status = 'pending', checked_at = NOW(), issue_code = NULL, merchant_label = ? WHERE id = ?",[label,row.id]);
        }else {
            if(previous)await service.proveSameMerchant(previous,row);
            if(previous) {
                const [versions]=await db.query('SELECT id,owner_id,mode FROM owner_direct_payment_connections WHERE owner_id = ? AND mode = ?',[req.user.id,paymentMode()]);
                // A rotated key can restore verification of old checkouts from this same merchant.
                for(const version of versions)await db.query('UPDATE owner_direct_payment_connections SET secret_ciphertext = ? WHERE id = ?',[sealSecret(key,directContext(version,'key')),version.id]);
                await db.query("UPDATE owner_direct_payment_connections SET current_slot = NULL, status = 'retired' WHERE id = ?",[previous.id]);
            }
            await db.query('INSERT INTO owner_direct_payment_connections (id,owner_id,mode,merchant_label,secret_ciphertext,key_fingerprint,key_last_four) VALUES (?,?,?,?,?,?,?)',[row.id,row.owner_id,row.mode,row.merchant_label,row.secret_ciphertext,row.key_fingerprint,row.key_last_four]);
        }
        await logEvent(db,req.user.id,row.id,previous?'reconnect_requested':'connect_requested');
        await db.commit();committed=true;
        await db.beginTransaction();await ownerLock(db,req.user.id);
        const pending = await currentDirectConnection(db,req.user.id);
        if(!pending || pending.id!==row.id || pending.status!=='pending')throw fail(409,'Payment setup changed. Reload the page before continuing.');
        // Persist pending setup first so a provider timeout cannot hide an already-created webhook.
        const update=await service.check(row,{createWebhook:true});
        await db.query("UPDATE owner_direct_payment_connections SET webhook_id = ?, webhook_secret = ?, status = 'ready', issue_code = NULL, checked_at = NOW() WHERE id = ? AND current_slot = 1 AND status = 'pending'",[update.webhook_id,update.webhook_secret,row.id]);
        await logEvent(db,req.user.id,row.id,'connection_verified');await db.commit();
        res.json({success:true,direct:directPublic(await currentDirectConnection(pool,req.user.id))});
    }catch(error) {
        if(db)await db.rollback();
        if(committed&&row)await pool.query("UPDATE owner_direct_payment_connections SET status = 'attention', issue_code = ? WHERE id = ? AND current_slot = 1 AND status = 'pending'",[error.issue||'setup_incomplete',row.id]).catch(()=>{});
        const issue=directFailure(error);
        res.status(issue.status||502).json({success:false,message:issue.message});
    }finally{if(req.body)delete req.body.secretKey;db?.release();}
});
router.post('/check',async(req,res)=>{
    let row,db;
    try {
        db=await pool.getConnection();await db.beginTransaction();await ownerLock(db,req.user.id);
        row=await currentDirectConnection(db,req.user.id);
        if(!row)throw fail(409,'Connect your own merchant account first.');
        if(row.status==='disconnected')throw fail(409,'Reconnect to enable new online payments. Existing payment verification is retained.');
        if(row.status==='pending'&&Date.now()-new Date(row.checked_at||row.created_at).getTime()<120000)throw fail(409,'Payment setup is in progress. Wait a moment before checking again.');
        const update=await service.check(row,{createWebhook:req.body.allowWebhook===true});
        await db.query("UPDATE owner_direct_payment_connections SET webhook_id = ?, webhook_secret = ?, status = 'ready', issue_code = NULL, checked_at = NOW() WHERE id = ? AND current_slot = 1 AND status <> 'disconnected'",[update.webhook_id,update.webhook_secret,row.id]);
        await logEvent(db,req.user.id,row.id,'connection_checked');await db.commit();
        res.json({success:true,direct:directPublic(await currentDirectConnection(pool,req.user.id))});
    }catch(error){if(db)await db.rollback();if(row)await pauseDirectConnection(pool,row,error.issue).catch(()=>{});const issue=directFailure(error);res.status(issue.status||502).json({success:false,message:issue.message});}finally{db?.release();}
});
router.post('/disconnect',async(req,res)=>{
    let db;
    try {
        if(req.body.confirm!==true)throw fail(400,'Confirm that new online payments will stop and existing payment verification must be retained.');
        db=await pool.getConnection();await db.beginTransaction();await ownerLock(db,req.user.id);
        const row=await currentDirectConnection(db,req.user.id);
        if(!row)throw fail(409,'No direct payment connection was found.');
        await db.query("UPDATE owner_direct_payment_connections SET status = 'disconnected', issue_code = NULL WHERE id = ?",[row.id]);
        await logEvent(db,req.user.id,row.id,'disconnected_for_new_payments');await db.commit();
        await notifyPaymentInterruption(pool,row).catch(()=>{}); // Periodic sweep retries a failed notification.
        res.json({success:true,direct:directPublic({...row,status:'disconnected',issue_code:null})});
    }catch(error){if(db)await db.rollback();const issue=directFailure(error);res.status(issue.status||502).json({success:false,message:issue.message});}finally{db?.release();}
});
export default router;
