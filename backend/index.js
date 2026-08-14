// =========================================================================
// SECTION 1: GLOBAL IMPORTS & CONFIGURATION
// =========================================================================
import 'dotenv/config'; // Loads environment variables as the very first step
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import passport from 'passport';
import pool from './config/db.js'; // Database connection pool (resolves natively to 127.0.0.1:3306)
import './config/passport.js';
import cron from 'node-cron';
import { runComplianceCheck } from './config/complianceManager.js';


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

const app = express();
const PORT = process.env.PORT || 3000;

// =========================================================================
// SECTION 3: GLOBAL MIDDLEWARES & STATIC ASSETS
// =========================================================================
app.use(cors());
app.use(express.json());
app.use(passport.initialize());

// Disable HTTP caching for all API routes so responses always return 200 (never 304).
// This is required for Workbox service worker runtime caching to store responses —
// Workbox only caches status 0 and 200, never 304 "Not Modified" responses.
app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

// Serve the physical public uploads folder statically so browsers can load images safely
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


// B. Simple Connection Test Endpoint
app.get('/api/test', (req, res) => {
    res.json({ success: true, message: "Hello from the CSPC Boarding House system backend API!" });
});

// C. Database Diagnostic Table Inspector
app.get('/api/tables', async (req, res) => {
    try {
        const [rows] = await pool.execute('SHOW TABLES');
        res.json({ success: true, tables: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===================================================
// AUTOMATED COMPLIANCE & BOOKING SCHEDULER (DAILY)
// ===================================================
cron.schedule('0 0 * * *', async () => {
    console.log('[CRON EXECUTION] Running daily compliance check...');
    try {
        await runComplianceCheck();
    } catch (err) {
        console.error('[CRON EXECUTION ERROR] Compliance checking failed:', err);
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
// Ensures the public/uploads folder is always present on cloud servers
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('📁 Successfully created missing uploads directory:', uploadsDir);
}
// ────────────────────────────────────────────────


app.use(express.json({
    verify: (req, res, buf) => {
        // Stores a raw, unparsed string copy of the payload for webhook signature verifications
        req.rawBody = buf.toString();
    }
}));

app.listen(PORT, () => {
    console.log(`🚀 Backend Server running on http://localhost:${PORT}`);
});