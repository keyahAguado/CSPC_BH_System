import { resetStudentTests } from './config/resetStudentTests.js';
import { listManualTestRecords, resetManualTests } from './config/resetManualTests.js';
import { createCheckoutReminderWorker } from './config/checkoutReminders.js';
import { createRenewalWorker } from './config/renewalPriority.js';
import { clockState, setBookingClock, testClockEnabled, clockRequestAllowed } from './config/bookingClock.js';
import { testSessionState, startTestSession, endTestSession } from './config/testSession.js';
import { bookingCalendarEvents } from './config/testCalendar.js';
import { authenticateToken } from './routes/auth.js';
import { createScheduledOccupancyWorker } from './config/scheduledOccupancy.js';
import { createReservationExpiryWorker } from './config/reservationExpiry.js';
import { createNotificationEmailWorker } from './config/notificationEmail.js';
import { uploadErrorHandler } from './config/uploadValidation.js';
// =========================================================================
// SECTION 1: GLOBAL IMPORTS & CONFIGURATION
// =========================================================================
import 'dotenv/config'; // Loads environment variables as the very first step
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import passport from 'passport';
import pool, { databaseReady } from './config/db.js'; // Database connection pool (resolves natively to 127.0.0.1:3306)
import './config/passport.js';
import cron from 'node-cron';
import { runComplianceCheck } from './config/complianceManager.js';
import { getUploadsDir, cleanupOrphanedUploads } from './config/upload.js';


// =========================================================================
// SECTION 2: ROUTER HANDLERS IMPORTS
// =========================================================================
import authRouter from './routes/auth.js';                    // Consolidated Authentication (JWT Login, Google SSO)
import boardingHousesRouter from './routes/boardingHouses.js';  // Shared Boarding Houses data & listings
import studentRouter from './routes/student.js';                // Student Profile modules
import ownerRouter from './routes/owner.js';                    // Owner Profile & file-handling actions
import adminRouter from './routes/admin.js';                    // SASO Admin dashboard & accreditation checklist actions
import notificationRouter from './routes/notifications.js';    // Real-time unread alerts & inbox manager
import paymentRoutes from './routes/payment.js';
import ownerDirectPaymentRoutes from './routes/ownerDirectPayments.js';
import { createDirectHealthWorker } from './config/ownerDirectPayments.js';
import siteContentRouter from './routes/siteContent.js';        // Public landing page content (managed by admin)
import applicationsRouter from './routes/applications.js';     // Track My Application (accountless applicants)
import locationsRouter from './routes/locations.js';           // Philippine address lists (local PSGC copy)

const app = express();
const PORT = process.env.PORT || 3000;

// =========================================================================
// SECTION 3: GLOBAL SECURITY HARDENING & MIDDLEWARES
// =========================================================================
// Trust the platform's reverse proxy (Render) so req.secure and
// x-forwarded-proto reflect the client's actual connection, not the
// internal HTTP hop between the proxy and this process. Docker adds its own nginx; set TRUST_PROXY_HOPS=2
// when another proxy (e.g. the host's HTTPS proxy) sits in front, so rate limits see each visitor's real IP.
app.set('trust proxy', Math.min(Math.max(Number.parseInt(process.env.TRUST_PROXY_HOPS, 10) || 1, 1), 5));

// HTTPS enforcement: redirect any plain-HTTP request to HTTPS and tell
// browsers to remember that via HSTS. Self-detecting rather than relying
// on NODE_ENV: local dev requests never carry x-forwarded-proto (no proxy
// in front of them), so this is a no-op on localhost and only activates
// once a reverse proxy (Render) is actually forwarding the header.
app.use((req, res, next) => {
    const forwardedProto = req.headers['x-forwarded-proto'];
    if (!forwardedProto) return next(); // no proxy in front of us — local dev

    if (req.secure || forwardedProto === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
        return next();
    }
    res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
});

// Restrict CORS to known frontend origins only
const allowedOrigins = [
    'http://localhost',
    'http://localhost:5173',
    'http://localhost:3000',
    ...(testClockEnabled() ? ['http://localhost:5174','http://127.0.0.1:5174','http://[::1]:5174'] : []),
    'http://127.0.0.1:5173',
    'https://cspc-bh-system.vercel.app',
    'https://boardinghouse.cspc.edu.ph',
    process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, Postman, server-to-server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: Origin '${origin}' is not allowed.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({
    verify: (req, res, buf) => {
        // Stores a raw, unparsed copy of every request body so webhook signature
        // verification (e.g. PayMongo) can hash the exact bytes that were signed,
        // instead of a re-serialized (and potentially byte-different) reconstruction.
        req.rawBody = buf.toString();
    }
}));
app.use(passport.initialize());

// Disable HTTP caching for all API routes so responses always return 200 (never 304).
// This is required for Workbox service worker runtime caching to store responses —
// Workbox only caches status 0 and 200, never 304 "Not Modified" responses.
app.use('/api', (req, res, next) => {
    if(testClockEnabled()){res.setHeader('X-Booking-Test-Time',clockState().now);res.setHeader('Access-Control-Expose-Headers','X-Booking-Test-Time');}
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

// Serve physical uploads folder statically so browsers load images safely
app.use('/uploads', express.static(getUploadsDir()));
app.use('/uploads', express.static(path.resolve('public/uploads')));

// =========================================================================
// SECTION 4: USER AUTHENTICATION & REGISTRATION ROUTES
// =========================================================================
// Handles user logins, password validation, Google OAuth redirects, and profile creations
app.use('/api/auth', authRouter);

// =========================================================================
// SECTION 5: STUDENT USER MODULES
// =========================================================================
// Serves profile retrieving and updating. Mounted on legacy alias to prevent any client-side breaks
app.use('/api/student', studentRouter);       // Modern SPA path
app.use('/users/student', studentRouter);

// =========================================================================
// SECTION 6: OWNER USER MODULES
// =========================================================================
// A. Boarding house list data (accreditations, file views, onboarding submissions)
app.use('/api/boarding-houses', boardingHousesRouter);

// B. Personal owner details (contact updates, residential addresses, and profile picture uploads)
app.use('/api/owner', ownerRouter);

// =========================================================================
// SECTION 7: SASO ADMIN USER MODULES
// =========================================================================
// Handles system stats calculations, pending checklists verification, and decisions processing
app.use('/api/admin', adminRouter);

// =========================================================================
// SECTION 8: SYSTEM UTILITIES & DIAGNOSTICS
// =========================================================================
// A. Centralized Notifications Inbox (Shared dynamically by Student, Owner, and Admin)
app.use('/api/notifications', notificationRouter);

app.use('/api/payment', paymentRoutes);

app.use('/api/owner/direct-payments', ownerDirectPaymentRoutes);

// B. Public landing page content (Core Features + footer), edited under /api/admin/site-content
app.use('/api/site-content', siteContentRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/locations', locationsRouter);

// Multer validation failures use the same user-facing JSON contract as forms.
app.use(uploadErrorHandler);

// =========================================================================
// UTILITY: Resolve Google Maps short URLs server-side
// maps.app.goo.gl short links have no coordinates in them — they require
// server-side redirect resolution since browsers block cross-origin redirects.
// =========================================================================
import https from 'https';
import http from 'http';

app.get('/api/utils/resolve-map-link', (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ success: false, message: 'Missing url parameter.' });
    }

    // Only allow Google Maps domains to prevent open-redirect abuse
    const allowedHosts = ['maps.app.goo.gl', 'goo.gl', 'maps.google.com', 'www.google.com', 'google.com'];
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch (e) {
        return res.status(400).json({ success: false, message: 'Invalid URL format.' });
    }

    if (!allowedHosts.some(h => parsedUrl.hostname === h || parsedUrl.hostname.endsWith('.' + h))) {
        return res.status(403).json({ success: false, message: 'Only Google Maps URLs are supported.' });
    }

    // Follow redirects up to 6 hops using GET to ensure Location headers are returned
    const followRedirects = (currentUrl, hopsLeft, cb) => {
        if (hopsLeft <= 0) return cb(null, currentUrl);

        let parsed;
        try { parsed = new URL(currentUrl); } catch (e) { return cb(e); }

        const mod = parsed.protocol === 'https:' ? https : http;
        const options = {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'GET',
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        };

        const reqObj = mod.request(options, (r) => {
            // Always consume the response body to free the socket
            r.resume();
            if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location) {
                let next = r.headers.location;
                // Resolve relative redirects
                if (next.startsWith('/')) {
                    next = `${parsed.protocol}//${parsed.host}${next}`;
                }
                followRedirects(next, hopsLeft - 1, cb);
            } else {
                cb(null, currentUrl);
            }
        });
        reqObj.on('error', (err) => cb(err));
        reqObj.on('timeout', () => { reqObj.destroy(); cb(new Error('Timeout resolving URL.')); });
        reqObj.end();
    };

    followRedirects(url, 6, (err, finalUrl) => {
        if (err) {
            console.error('[MAP RESOLVE ERROR]', err.message);
            return res.status(502).json({ success: false, message: 'Could not resolve the map link. Please try again.' });
        }
        console.log(`[MAP RESOLVE] ${url} → ${finalUrl}`);
        res.json({ success: true, resolvedUrl: finalUrl });
    });
});


// B. Simple Connection Test Endpoint
app.get('/api/test', (req, res) => {
    res.json({ success: true, message: "Hello from the CSPC Boarding House system backend API!" });
});

// ===================================================
// AUTOMATED COMPLIANCE & BOOKING SCHEDULER (DAILY)
// ===================================================
const runNotificationEmails = createNotificationEmailWorker({ pool });
// While a simulated time is set, real-time jobs pause; on real time they run as usual, test clock enabled or not.
cron.schedule('* * * * *', () => { if(!clockState().simulated) void runNotificationEmails(); });
const runRenewalReview=createRenewalWorker({pool});
cron.schedule('* * * * *',()=>{void runRenewalReview();});
const runReservationExpiry = createReservationExpiryWorker({ pool });
const runOwnerPaymentHealth = createDirectHealthWorker({pool});
// Run as soon as startup schema checks finish, rather than waiting for the next cron boundary.
void databaseReady.then(ready=>{if(ready)return runOwnerPaymentHealth();}).catch(()=>console.warn('[OWNER PAYMENTS] Startup check deferred to scheduled retry.'));
cron.schedule('*/10 * * * *',()=>{void runOwnerPaymentHealth();});
cron.schedule('* * * * *', () => { void runReservationExpiry(); });
const runScheduledOccupancy = createScheduledOccupancyWorker({ pool });
const runCheckoutReminders=createCheckoutReminderWorker({pool});
cron.schedule('* * * * *',()=>{void runCheckoutReminders();});
const localClockAccess=(req,res,next)=>{if(!clockRequestAllowed(req))return res.status(404).json({success:false});if(req.user.role!=='owner' && req.user.role!=='admin')return res.status(403).json({success:false,message:'Owner or admin access required.'});next();};
app.get('/api/testing/booking-clock-health',(req,res)=>{if(!clockRequestAllowed(req))return res.sendStatus(404);res.json({application:'cspc-booking-test',database:process.env.DB_NAME,enabled:true});});
app.get('/api/testing/booking-clock',authenticateToken,localClockAccess,async(req,res)=>{try{res.json({...clockState(),session:await testSessionState(pool)});}catch(error){res.status(500).json({success:false,message:error.message});}});
app.get('/api/testing/manual-test-records',authenticateToken,localClockAccess,async(req,res)=>{try{res.json({success:true,records:await listManualTestRecords(pool,{ownerId:req.user.role==='admin'?null:req.user.id})});}catch(error){res.status(500).json({success:false,message:'Could not load manual test records.'});}});
app.post('/api/testing/reset-manual-records',authenticateToken,localClockAccess,async(req,res)=>{try{res.json(await resetManualTests(pool,{occupantIds:req.body.occupantIds,confirmed:req.body.confirmed,ownerId:req.user.role==='admin'?null:req.user.id}));}catch(error){res.status(error.status||500).json({success:false,message:error.status?error.message:'Could not clear manual test records. Nothing was cleared.'});}});
app.get('/api/testing/test-students',authenticateToken,localClockAccess,async(req,res)=>{try{const [rows]=await pool.query("SELECT DISTINCT u.id,u.name FROM users u JOIN bookings b ON b.student_id=u.id JOIN boarding_houses bh ON bh.id=b.house_id WHERE u.role='student' AND (? IS NULL OR bh.owner_id=?) ORDER BY u.name",[req.user.role==='admin'?null:req.user.id,req.user.role==='admin'?null:req.user.id]);res.json({success:true,students:rows});}catch(error){res.status(500).json({success:false,message:'Could not load test students.'});}});
app.post('/api/testing/reset-students',authenticateToken,localClockAccess,async(req,res)=>{try{const target=req.body.now;if(typeof target!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(target) || !Number.isFinite(Date.parse(target)) || Date.parse(target)<Date.now()+60000)return res.status(400).json({success:false,message:'Choose a test starting time at least one minute after real time. Nothing was cleared.'});const result=await resetStudentTests(pool,{studentIds:req.body.studentIds,confirmed:req.body.confirmed,ownerId:req.user.role==='admin'?null:req.user.id});setBookingClock(null);setBookingClock(target);res.json({...result,...clockState()});}catch(error){res.status(error.status||500).json({success:false,message:error.status?error.message:'Could not restart selected test accounts. Nothing was cleared.'});}});
app.post('/api/testing/booking-clock/session',authenticateToken,localClockAccess,async(req,res)=>{try{const action=req.body?.action;if(!['start','restore','keep'].includes(action))return res.status(400).json({success:false,message:'Choose start, restore or keep.'});if(action!=='start')setBookingClock(null);const result=action==='start'?await startTestSession(pool):await endTestSession(pool,{restore:action==='restore'});res.json({...clockState(),session:result,message:result.message});}catch(error){res.status(error.status || 500).json({success:false,message:error.message});}});
app.get('/api/testing/booking-calendar',authenticateToken,localClockAccess,async(req,res)=>{const {from,to}=req.query;const day=/^\d{4}-\d{2}-\d{2}$/;if(!day.test(from || '') || !day.test(to || '') || from>to || Date.parse(to)-Date.parse(from)>92*86400000)return res.status(400).json({success:false,message:'Choose a valid date range of up to 3 months.'});try{res.json({success:true,events:await bookingCalendarEvents(pool,{ownerId:req.user.role==='owner'?req.user.id:null,from,to})});}catch(error){res.status(500).json({success:false,message:error.message});}});
app.post('/api/testing/booking-clock',authenticateToken,localClockAccess,async(req,res)=>{try{const state=setBookingClock(req.body.now);const renewal=await runRenewalReview();const expiry=await runReservationExpiry();const occupancy=await runScheduledOccupancy();const checkoutReminders=await runCheckoutReminders();res.json({...state,renewal,expiry,occupancy,checkoutReminders,message:'Booking clock updated. Records created or cancelled by this test are not undone by resetting the clock.'});}catch(error){res.status(error.status || 500).json({success:false,message:error.message});}});
cron.schedule('* * * * *', () => { void runScheduledOccupancy(); });

cron.schedule('0 0 * * *', async () => {
    if(clockState().simulated) return;
    console.log('[CRON EXECUTION] Running daily compliance check...');
    try {
        await runComplianceCheck();
    } catch (err) {
        console.error('[CRON EXECUTION ERROR] Compliance checking failed:', err);
    }
});

// ===================================================
// ORPHANED UPLOAD CLEANUP (DAILY)
// Removes local files left behind when a photo/permit/profile pic is
// replaced (the DB pointer is overwritten but the old file isn't deleted).
// ===================================================
cron.schedule('30 0 * * *', async () => {
    if(clockState().simulated) return;
    console.log('[CRON EXECUTION] Running orphaned upload cleanup...');
    try {
        const result = await cleanupOrphanedUploads(pool);
        console.log('[CRON EXECUTION] Upload cleanup result:', result);
    } catch (err) {
        console.error('[CRON EXECUTION ERROR] Upload cleanup failed:', err);
    }
});

// ===================================================
// RENDER FREE TIER KEEP-ALIVE PING (Every 14 minutes)
// Prevents the Render instance from spinning down during active use,
// which causes 30-50 second cold start delays on OAuth and API calls.
// ===================================================
cron.schedule('*/14 * * * *', () => {
    const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;
    import('https').then(({ default: https }) => {
        https.get(`${url}/api/test`, (res) => {
            console.log(`[KEEP-ALIVE] Ping sent. Status: ${res.statusCode}`);
        }).on('error', () => {
            // Silent fail — non-critical
        });
    }).catch(() => {
        // Fallback for http
        import('http').then(({ default: http }) => {
            http.get(`http://localhost:${process.env.PORT || 3000}/api/test`, () => {});
        });
    });
});

// ─── AUTO-CREATE UPLOADS DIRECTORY ON STARTUP ───
const activeUploadsDir = getUploadsDir();
console.log('📁 Active local uploads directory resolved:', activeUploadsDir);
// ────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`🚀 Backend Server running on http://localhost:${PORT}`);
});
