import { validateBody } from '../config/inputValidation.js';
import express from 'express';
import pool from '../config/db.js';
import { authenticateToken } from './auth.js';
import bcrypt from 'bcryptjs';
import { getComplianceStatus } from '../config/complianceHelper.js';
import { bookingIdFromReference } from '../config/stayAvailability.js';

// SASO figures and lists show real residents only: an automatically started stay counts once the owner confirms
// arrival. Stays awaiting arrival or recorded as not arrived are excluded. Manual and legacy rows never need arrival.
const RESIDENT = 'NOT (o.arrival_required = 1 AND o.arrival_confirmed_at IS NULL)';
import { MAX_FEATURES, SITE_SETTING_KEYS, settingsFromRows } from '../config/siteContent.js';
import {
    APPLICATION_STATUS, REVIEWABLE,
    issueActivationToken, recordStatusChange, ACTIVATION_TTL_DAYS
} from '../config/applicationWorkflow.js';

const router = express.Router();

// Helper middleware to strictly lock down routes to system administrators
const verifyAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') return next();
    return res.status(403).json({ success: false, message: 'Access denied.' });
};

// Helper for standard column select (including standard permits to prevent missing attributes)
const EXPLICIT_BH_COLUMNS = `
    bh.id AS id, bh.owner_id, bh.name, bh.img, bh.img_1, bh.img_2, bh.img_3,
    bh.location, bh.barangay, bh.map_link, bh.price, bh.phone_contact, bh.description,
    bh.amenities_free, bh.amenities_paid, bh.house_status, bh.compliance_status, bh.supplementary_status,
    bh.permit_business_form, bh.permit_cedula, bh.permit_dti, bh.permit_barangay,
    bh.permit_building, bh.permit_zoning, bh.permit_sanitary, bh.permit_fire,
    bh.expiry_permit_business_form, bh.expiry_permit_cedula, bh.expiry_permit_dti, 
    bh.expiry_permit_barangay, bh.expiry_permit_building, bh.expiry_permit_zoning, 
    bh.expiry_permit_sanitary, bh.expiry_permit_fire, bh.latitude, bh.longitude, 
    bh.advance_months, bh.deposit_months, bh.deposit_type, bh.document_update_pending, 
    bh.last_updated_document, bh.is_resubmission, bh.admin_comments, bh.archived_by, bh.resubmitted_at, bh.created_at
`;

// 1. GET - Retrieve Dashboard Statistics
router.get('/dashboard', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const [[housesRow]] = await pool.query(
            "SELECT COUNT(*) AS count FROM boarding_houses WHERE house_status = 'accredited'"
        );
        const [[pendingRow]] = await pool.query(
            "SELECT COUNT(*) AS count FROM boarding_houses WHERE house_status = 'pending' OR document_update_pending = 1"
        );

        // Residents are occupants whose arrival is confirmed. An automatically started stay that the owner has not
        // confirmed still holds its bed, but it is not counted as a resident in SASO figures.
        const ARRIVED = 'NOT (o.arrival_required = 1 AND o.arrival_confirmed_at IS NULL)';

        // CSPC student count: active CSPC student residents in accredited boarding houses
        const [[studentsRow]] = await pool.query(`
            SELECT COUNT(DISTINCT o.student_id) AS count
            FROM occupants o
            INNER JOIN rooms r ON o.room_id = r.id
            INNER JOIN boarding_houses bh ON r.house_id = bh.id
            WHERE bh.house_status = 'accredited'
              AND o.student_id IS NOT NULL 
              AND o.is_non_cspc = 0 
              AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE()) AND ${ARRIVED}
        `);

        // Occupancy Rate: capacity of accredited rooms vs CSPC residents in accredited houses. SASO reports CSPC students only;
        // non-CSPC boarders recorded by owners are never counted in admin figures.
        const [[capacityRow]] = await pool.query(`
            SELECT SUM(r.capacity) AS total_capacity 
            FROM rooms r
            INNER JOIN boarding_houses bh ON r.house_id = bh.id
            WHERE bh.house_status = 'accredited' AND r.deleted_at IS NULL
        `);
        const [[occupantsRow]] = await pool.query(`
            SELECT 
              (SELECT COUNT(DISTINCT o.student_id) 
               FROM occupants o 
               INNER JOIN rooms r ON o.room_id = r.id
               INNER JOIN boarding_houses bh ON r.house_id = bh.id
               WHERE bh.house_status = 'accredited'
                 AND o.student_id IS NOT NULL 
                 AND o.is_non_cspc = 0 
                 AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE()) AND ${ARRIVED})
              AS current_occupants
        `);
        const [[awaitingRow]] = await pool.query(`
            SELECT COUNT(o.id) AS count FROM occupants o
            INNER JOIN rooms r ON o.room_id = r.id
            INNER JOIN boarding_houses bh ON r.house_id = bh.id
            WHERE bh.house_status = 'accredited' AND o.is_non_cspc = 0 AND o.arrival_required = 1 AND o.arrival_confirmed_at IS NULL AND o.non_arrival_recorded_at IS NULL
              AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())
        `);
        const totalCapacity = parseInt(capacityRow.total_capacity) || 0;
        const currentOccupants = parseInt(occupantsRow.current_occupants) || 0;
        const occupancyRate = totalCapacity > 0
            ? Math.min(100, Math.round((currentOccupants / totalCapacity) * 100))
            : 0;

        // Top-Rated Boarding House
        const [[bestReviewed]] = await pool.query(`
            SELECT bh.name, AVG(r.rating) AS avg_rating
            FROM reviews r
            JOIN boarding_houses bh ON r.house_id = bh.id
            WHERE bh.house_status = 'accredited'
            GROUP BY bh.id
            ORDER BY avg_rating DESC, COUNT(r.id) DESC
            LIMIT 1
        `);
        let mostRated = 'N/A';
        if (bestReviewed) {
            mostRated = bestReviewed.name;
        }

        // Student Residency Overview Chart — counts unique active CSPC students per
        // accredited house, split by sex (SDG 5 / Gender Equality reporting) so the
        // dashboard shows the actual male/female composition, not just a raw total.
        let housesData = [];
        try {
            const [rows] = await pool.query(`
                SELECT bh.id, bh.name,
                       COUNT(DISTINCT o.student_id) AS student_count,
                       COUNT(DISTINCT CASE WHEN LOWER(u.sex) = 'male' THEN o.student_id END) AS male_count,
                       COUNT(DISTINCT CASE WHEN LOWER(u.sex) = 'female' THEN o.student_id END) AS female_count
                FROM boarding_houses bh
                LEFT JOIN rooms r ON bh.id = r.house_id
                LEFT JOIN occupants o ON r.id = o.room_id
                    AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())
                    AND o.is_non_cspc = 0
                    AND ${ARRIVED}
                LEFT JOIN users u ON o.student_id = u.id
                WHERE bh.house_status = 'accredited'
                GROUP BY bh.id, bh.name
                ORDER BY student_count DESC, bh.name ASC
                LIMIT 10
            `);
            housesData = rows || [];
        } catch (chartErr) {
            console.error('[DASHBOARD] Student Residency chart query failed:', chartErr.message);
            housesData = [];
        }

        // Booking Trends Chart Data (Last 6 Months) — always returns a 6-slot array
        let trends = [];
        try {
            // Build the 6-month scaffold with zero-filled slots
            for (let i = 5; i >= 0; i--) {
                const date = new Date();
                date.setMonth(date.getMonth() - i);
                trends.push({
                    month: date.toLocaleString('en-US', { month: 'short' }),
                    booking_count: 0
                });
            }

            const [trendsData] = await pool.query(`
                SELECT DATE_FORMAT(booking_date, '%b') AS month, COUNT(*) AS booking_count
                FROM bookings
                WHERE booking_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
                GROUP BY DATE_FORMAT(booking_date, '%Y-%m'), DATE_FORMAT(booking_date, '%b')
                ORDER BY DATE_FORMAT(booking_date, '%Y-%m') ASC
            `);

            (trendsData || []).forEach(row => {
                const found = trends.find(t => t.month.toLowerCase() === row.month.toLowerCase());
                if (found) {
                    found.booking_count = parseInt(row.booking_count) || 0;
                }
            });
        } catch (trendErr) {
            console.error('[DASHBOARD] Booking Trends chart query failed:', trendErr.message);
            trends = [];
        }

        res.json({
            success: true,
            stats: {
                totalHouses: housesRow.count || 0,
                totalStudents: studentsRow.count || 0,
                occupancyRate,
                awaitingArrival: awaitingRow.count || 0,
                pendingApps: pendingRow.count || 0,
                mostRated,
                houses: housesData,
                trends
            }
        });
    } catch (err) {
        console.error('[DASHBOARD] Stats Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to calculate stats.' });
    }
});

// =========================================================================
// 1.5 COURSE MANAGEMENT & REPORTING
// =========================================================================

// GET - List all courses (active + inactive) for the admin management view
router.get('/courses', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const [courses] = await pool.query('SELECT * FROM courses ORDER BY course_name ASC');
        res.json({ success: true, courses });
    } catch (err) {
        console.error('[COURSES] Fetch failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to load courses.' });
    }
});

// Valid departments — matches the college color-coding on the admin dashboard.
const VALID_DEPARTMENTS = ['CAS', 'CCS', 'CEA', 'CHS', 'CTHBM', 'CTDE'];

// POST - Add a new course
router.post('/courses/add', authenticateToken, verifyAdmin, validateBody('course'), async (req, res) => {
    try {
        const { course_code, course_name, department } = req.body;
        if (!course_code || !course_name) {
            return res.status(400).json({ success: false, message: 'Course code and name are required.' });
        }
        if (department && !VALID_DEPARTMENTS.includes(department)) {
            return res.status(400).json({ success: false, message: 'Invalid department.' });
        }
        await pool.query(
            'INSERT INTO courses (course_code, course_name, department) VALUES (?, ?, ?)',
            [course_code.trim(), course_name.trim(), department || null]
        );
        res.json({ success: true, message: 'Course added successfully.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'A course with that code already exists.' });
        }
        console.error('[COURSES] Add failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to add course.' });
    }
});

// POST - Edit an existing course
router.post('/courses/update/:id', authenticateToken, verifyAdmin, validateBody('course'), async (req, res) => {
    try {
        const { course_code, course_name, department } = req.body;
        if (!course_code || !course_name) {
            return res.status(400).json({ success: false, message: 'Course code and name are required.' });
        }
        if (department && !VALID_DEPARTMENTS.includes(department)) {
            return res.status(400).json({ success: false, message: 'Invalid department.' });
        }
        await pool.query(
            'UPDATE courses SET course_code = ?, course_name = ?, department = ? WHERE id = ?',
            [course_code.trim(), course_name.trim(), department || null, req.params.id]
        );
        res.json({ success: true, message: 'Course updated successfully.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'A course with that code already exists.' });
        }
        console.error('[COURSES] Update failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to update course.' });
    }
});

// POST - Toggle a course active/inactive (soft delete — keeps historical student records intact)
router.post('/courses/toggle/:id', authenticateToken, verifyAdmin, validateBody('ids'), async (req, res) => {
    try {
        await pool.query(
            'UPDATE courses SET is_active = NOT is_active WHERE id = ?',
            [req.params.id]
        );
        res.json({ success: true, message: 'Course status updated.' });
    } catch (err) {
        console.error('[COURSES] Toggle failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to update course status.' });
    }
});

// DELETE - Permanently remove a course. Refuses if any student record still
// references it (via users.course, a plain string, not a real FK) so deleting
// never silently orphans a real student's course selection.
router.post('/courses/delete/:id', authenticateToken, verifyAdmin, validateBody('ids'), async (req, res) => {
    try {
        const [[course]] = await pool.query('SELECT course_code FROM courses WHERE id = ?', [req.params.id]);
        if (!course) {
            return res.status(404).json({ success: false, message: 'Course not found.' });
        }

        const [[{ count }]] = await pool.query(
            'SELECT COUNT(*) AS count FROM users WHERE course = ?',
            [course.course_code]
        );
        if (count > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete — ${count} student${count === 1 ? '' : 's'} still ${count === 1 ? 'has' : 'have'} this course selected. Deactivate it instead, or reassign those students first.`
            });
        }

        await pool.query('DELETE FROM courses WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Course deleted successfully.' });
    } catch (err) {
        console.error('[COURSES] Delete failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to delete course.' });
    }
});

// ─── LANDING PAGE CONTENT (Core Features cards + footer details) ───────────
// Public visitors read these through GET /api/site-content.

// GET - All features (including hidden ones) and every footer/heading setting
router.get('/site-content', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const [features] = await pool.query('SELECT * FROM site_features ORDER BY sort_order ASC, id ASC');
        const [settingRows] = await pool.query('SELECT setting_key, setting_value FROM site_settings');
        res.json({ success: true, features, settings: settingsFromRows(settingRows), maxFeatures: MAX_FEATURES });
    } catch (err) {
        console.error('[SITE CONTENT] Fetch failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to load landing page content.' });
    }
});

// POST - Save section heading and footer details (only known keys are stored)
router.post('/site-content/settings', authenticateToken, verifyAdmin, validateBody('siteSettings'), async (req, res) => {
    try {
        const entries = SITE_SETTING_KEYS
            .filter(key => typeof req.body[key] === 'string')
            .map(key => [key, req.body[key].trim()]);
        if (entries.length === 0) {
            return res.status(400).json({ success: false, message: 'There are no landing page details to save.' });
        }
        await pool.query(
            'INSERT INTO site_settings (setting_key, setting_value) VALUES ? ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
            [entries]
        );
        res.json({ success: true, message: 'Landing page details saved.' });
    } catch (err) {
        console.error('[SITE CONTENT] Settings save failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to save landing page details.' });
    }
});

// POST - Add a feature card (appended to the end of the list)
router.post('/site-content/features/add', authenticateToken, verifyAdmin, validateBody('siteFeature'), async (req, res) => {
    try {
        const [[{ count, maxOrder }]] = await pool.query('SELECT COUNT(*) AS count, COALESCE(MAX(sort_order), 0) AS maxOrder FROM site_features');
        if (count >= MAX_FEATURES) {
            return res.status(400).json({ success: false, message: `The landing page supports up to ${MAX_FEATURES} feature cards. Remove one before adding another.` });
        }
        const { title, description, icon } = req.body;
        await pool.query(
            'INSERT INTO site_features (title, description, icon, sort_order) VALUES (?, ?, ?, ?)',
            [title.trim(), description.trim(), icon, Number(maxOrder) + 1]
        );
        res.json({ success: true, message: 'Feature added to the landing page.' });
    } catch (err) {
        console.error('[SITE CONTENT] Feature add failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to add feature.' });
    }
});

// POST - Edit a feature card
router.post('/site-content/features/update/:id', authenticateToken, verifyAdmin, validateBody('siteFeature'), async (req, res) => {
    try {
        const { title, description, icon } = req.body;
        const [result] = await pool.query(
            'UPDATE site_features SET title = ?, description = ?, icon = ? WHERE id = ?',
            [title.trim(), description.trim(), icon, req.params.id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Feature not found. Refresh the page and try again.' });
        res.json({ success: true, message: 'Feature updated.' });
    } catch (err) {
        console.error('[SITE CONTENT] Feature update failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to update feature.' });
    }
});

// POST - Show/hide a feature card without deleting it
router.post('/site-content/features/toggle/:id', authenticateToken, verifyAdmin, validateBody('ids'), async (req, res) => {
    try {
        const [result] = await pool.query('UPDATE site_features SET is_active = NOT is_active WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Feature not found. Refresh the page and try again.' });
        res.json({ success: true, message: 'Feature visibility updated.' });
    } catch (err) {
        console.error('[SITE CONTENT] Feature toggle failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to update feature visibility.' });
    }
});

// POST - Move a feature card one position up or down (renumbers the whole list atomically)
router.post('/site-content/features/move/:id', authenticateToken, verifyAdmin, validateBody('featureMove'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT id FROM site_features ORDER BY sort_order ASC, id ASC FOR UPDATE');
        const ids = rows.map(r => r.id);
        const from = ids.indexOf(Number(req.params.id));
        if (from === -1) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Feature not found. Refresh the page and try again.' });
        }
        const to = req.body.direction === 'up' ? from - 1 : from + 1;
        if (to >= 0 && to < ids.length) {
            [ids[from], ids[to]] = [ids[to], ids[from]];
            for (let i = 0; i < ids.length; i++) {
                await connection.query('UPDATE site_features SET sort_order = ? WHERE id = ?', [i + 1, ids[i]]);
            }
        }
        await connection.commit();
        res.json({ success: true, message: 'Feature order updated.' });
    } catch (err) {
        await connection.rollback();
        console.error('[SITE CONTENT] Feature move failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to reorder features.' });
    } finally {
        connection.release();
    }
});

// POST - Permanently delete a feature card
router.post('/site-content/features/delete/:id', authenticateToken, verifyAdmin, validateBody('ids'), async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM site_features WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Feature not found. Refresh the page and try again.' });
        res.json({ success: true, message: 'Feature removed from the landing page.' });
    } catch (err) {
        console.error('[SITE CONTENT] Feature delete failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to delete feature.' });
    }
});

// GET - Active residents grouped by course, for the admin breakdown report
router.get('/reports/courses', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const [breakdown] = await pool.query(`
            SELECT c.course_code, c.course_name, c.department, COUNT(DISTINCT o.student_id) AS resident_count
            FROM courses c
            LEFT JOIN users u ON u.course = c.course_code
            LEFT JOIN occupants o ON o.student_id = u.id AND o.is_non_cspc = 0
                AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE()) AND ${RESIDENT}
            GROUP BY c.id, c.course_code, c.course_name, c.department
            ORDER BY resident_count DESC, c.course_name ASC
        `);
        res.json({ success: true, breakdown });
    } catch (err) {
        console.error('[COURSES REPORT] Fetch failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to load course breakdown report.' });
    }
});

// 2. GET - Retrieve Pending Applications, Checklist criteria & results
router.get('/pending-applications', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        // Query 1: All houses that need attention
        const [applications] = await pool.query(`
            SELECT 
                ${EXPLICIT_BH_COLUMNS},
                u.name as owner_name, (CASE WHEN u.email LIKE '%@applicant.invalid' THEN NULL ELSE u.email END) as owner_email,
                u.phone as owner_phone,
                bh.reference_no, bh.application_status,
                (u.role = 'owner' AND u.status = 'pending' AND u.password IS NULL AND u.google_id IS NULL) AS awaiting_credentials
            FROM boarding_houses bh 
            JOIN users u ON bh.owner_id = u.id 
            WHERE bh.house_status = 'pending' OR bh.document_update_pending = 1
            ORDER BY bh.created_at DESC, bh.id DESC
        `);
        // Query 2: ALL checklist criteria (both global 8 + any house-specific ones)
        const [dbCriteria] = await pool.query('SELECT * FROM checklist_criteria WHERE is_active = 1');
        // Query 3: Which criteria were already verified (from previous admin reviews)
        const [checklistResults] = await pool.query('SELECT * FROM checklist_results WHERE is_verified = 1');

        // Fetch dynamic uploads
        // Query 4: Any custom requirement files uploaded by owners
        const [dynamicDocs] = await pool.query(`
            SELECT hd.*, cc.label AS criteria_label, cc.requirement_type
            FROM house_documents hd
            JOIN checklist_criteria cc ON hd.criteria_id = cc.id
        `);

        // Standard mapping dictionary matching standard database IDs (30-37) with standard permit file keys
        // Post-processing: inject permit_key for the 8 standard criteria
        const standardKeys = {
            30: 'permit_business_form',
            31: 'permit_cedula',
            32: 'permit_dti',
            33: 'permit_barangay',
            34: 'permit_building',
            35: 'permit_zoning',
            36: 'permit_sanitary',
            37: 'permit_fire'
        };

        // Inject permit_key on the fly for institutional/global criteria elements
        const criteria = dbCriteria.map(c => ({
            ...c,
            permit_key: c.house_id === null ? (standardKeys[c.id] || null) : null
        }));

        // Query 5: every file uploaded per legal document (multiple images / PDF)
        const [permitFiles] = await pool.query('SELECT house_id, permit_key, file_path FROM house_permit_files ORDER BY house_id, permit_key, sort_order, id');

        res.json({ success: true, applications, criteria, checklistResults, dynamicDocs, permitFiles });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. GET - Retrieve accredited/registered houses & dynamic uploads (filterable by barangay)
router.get('/applications/registered', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const { barangay } = req.query;

        let barangayClause = '';
        let queryParams = [];

        if (barangay && barangay.trim() !== '' && barangay.toLowerCase() !== 'all') {
            const cleanBarangay = barangay.trim();
            barangayClause = 'AND (bh.barangay = ? OR bh.location LIKE ?)';
            queryParams = [cleanBarangay, `%${cleanBarangay}%`];
        }

        const [houses] = await pool.query(`
            SELECT 
                ${EXPLICIT_BH_COLUMNS},
                u.name as owner_name, 
                (CASE WHEN u.email LIKE '%@applicant.invalid' THEN NULL ELSE u.email END) as owner_email, 
                u.phone as owner_phone, 
                u.address as owner_address,
                u.profile_pic as profile_pic,
                (SELECT AVG(rating) FROM reviews WHERE house_id = bh.id) as avg_rating,
                (SELECT COUNT(*) FROM reviews WHERE house_id = bh.id) as review_count
            FROM boarding_houses bh
            JOIN users u ON bh.owner_id = u.id
            WHERE bh.house_status = 'accredited'
            ${barangayClause}
            ORDER BY bh.created_at DESC
        `, queryParams);


        const [dynamicDocs] = await pool.query(`
            SELECT hd.*, cc.label AS criteria_label, cc.requirement_type
            FROM house_documents hd
            JOIN checklist_criteria cc ON hd.criteria_id = cc.id
        `);

        const [housePhotos] = await pool.query(`
            SELECT house_id, photo_url, sort_order FROM house_photos ORDER BY sort_order ASC
        `);

        // Every file uploaded per legal document (multiple images / PDF)
        const [permitFiles] = await pool.query('SELECT house_id, permit_key, file_path FROM house_permit_files ORDER BY house_id, permit_key, sort_order, id');

        const [criteria] = await pool.query('SELECT id, label, house_id, requirement_type FROM checklist_criteria WHERE is_active = 1 AND permit_key IS NULL AND id NOT BETWEEN 30 AND 37');
        res.json({ success: true, houses, dynamicDocs, housePhotos, permitFiles, criteria });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3A. GET - Retrieve all Archived boarding houses
router.get('/applications/archived', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const [houses] = await pool.query(`
            SELECT 
                ${EXPLICIT_BH_COLUMNS},
                u.name as owner_name, (CASE WHEN u.email LIKE '%@applicant.invalid' THEN NULL ELSE u.email END) as owner_email, u.phone as owner_phone, u.address as owner_address,
                u.profile_pic as profile_pic, bh.archive_reason, bh.archived_at,
                (SELECT AVG(rating) FROM reviews WHERE house_id = bh.id) as avg_rating,
                (SELECT COUNT(*) FROM reviews WHERE house_id = bh.id) as review_count
            FROM boarding_houses bh
            JOIN users u ON bh.owner_id = u.id
            WHERE bh.house_status = 'archived'
            ORDER BY bh.created_at DESC
        `);

        const [housePhotos] = await pool.query(`
            SELECT house_id, photo_url, sort_order FROM house_photos ORDER BY sort_order ASC
        `);

        // Every file uploaded per legal document (multiple images / PDF)
        const [permitFiles] = await pool.query('SELECT house_id, permit_key, file_path FROM house_permit_files ORDER BY house_id, permit_key, sort_order, id');

        const [dynamicDocs] = await pool.query('SELECT hd.*, cc.label AS criteria_label, cc.requirement_type FROM house_documents hd JOIN checklist_criteria cc ON hd.criteria_id = cc.id');
        res.json({ success: true, houses, housePhotos, permitFiles, dynamicDocs });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. POST - Archive a boarding house (Marks status as 'archived') — Alerts Owner only
// Manual archive (owner request e.g. at full capacity, admin discretion, etc.) is
// intentionally kept separate from auto-archiving due to expired required documents:
// it must NOT touch compliance_status, otherwise the owner dashboard can't tell the
// two apart and always shows "PERMITS EXPIRED" even when that's not why it's archived.
router.post('/archive/:id', authenticateToken, verifyAdmin, validateBody('archive'), async (req, res) => {
    const houseId = req.params.id;
    const { reason } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Fetch house and owner details
        const [house] = await connection.query('SELECT owner_id, name FROM boarding_houses WHERE id = ?', [houseId]);
        if (house.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Boarding house record not found.' });
        }
        const ownerId = house[0].owner_id;

        // 1. Update Boarding House status (compliance_status is left untouched)
        await connection.query(
            "UPDATE boarding_houses SET status_before_archive = CASE WHEN house_status = 'archived' THEN status_before_archive ELSE house_status END, house_status = 'archived', archived_by = 'admin', archive_reason = ?, archived_at = NOW(), admin_comments = ? WHERE id = ?",
            [reason && reason.trim() ? reason.trim() : null, reason && reason.trim() ? reason.trim() : null, houseId]
        );

        // 2. Insert Alert notification for the Owner ONLY
        const archiveMsg = `WARNING: Your boarding house "${house[0].name}" has been ARCHIVED by the SASO Administrator.${reason && reason.trim() ? ` Reason: ${reason.trim()}` : ''} Your listing is now hidden from students.`;
        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [ownerId, archiveMsg]
        );

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        console.error('Manual Archive Error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        connection.release();
    }
});

// 4A. POST - Restore an archived boarding house — Alerts Owner only
router.post('/restore/:id', authenticateToken, verifyAdmin, validateBody('ids'), async (req, res) => {
    const houseId = req.params.id;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Fetch house and owner details
        const [house] = await connection.query('SELECT * FROM boarding_houses WHERE id = ? FOR UPDATE', [houseId]);
        if (house.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Boarding house record not found.' });
        }
        if (house[0].house_status !== 'archived') {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'This property is no longer archived. Please refresh the list.' });
        }
        const liveCompliance = getComplianceStatus(house[0]);
        if (liveCompliance === 'expired') {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message: 'This property cannot be restored while required permits are expired. The owner must submit updated documents for review first.'
            });
        }
        const ownerId = house[0].owner_id;

        // 1. Restore Boarding House status
        await connection.query(
            "UPDATE boarding_houses SET house_status = 'accredited', compliance_status = ? WHERE id = ?",
            [liveCompliance, houseId]
        );

        // 2. Insert Approved notification for the Owner ONLY
        const restoreMsg = `CONGRATULATIONS: Your boarding house "${house[0].name}" has been RESTORED and is now active on the system.`;
        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [ownerId, restoreMsg]
        );

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        console.error('Manual Restore Error:', err.message);
        res.status(500).json({ success: false, message: 'We could not restore this property. Please try again.' });
    } finally {
        connection.release();
    }
});

// 5. GET - Fetch verified reviews for a specific boarding house
router.get('/reviews/:houseId', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const [reviews] = await pool.query(
            `SELECT r.*, u.name as student_name, u.profile_pic
             FROM reviews r
             JOIN users u ON r.student_id = u.id
             WHERE r.house_id = ?
             ORDER BY r.created_at DESC`,
            [req.params.houseId]
        );
        res.json({ success: true, reviews });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 6. GET - Fetch Room Matrix of a specific boarding house
router.get('/rooms/:houseId', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const [rooms] = await pool.query(
            `SELECT r.*, 
                (SELECT COUNT(*) FROM occupants o WHERE o.room_id = r.id AND o.is_non_cspc = 0 AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE()) AND ${RESIDENT}) AS occupant_count,
                (SELECT COUNT(*) FROM bookings b WHERE b.room_id = r.id AND b.status = 'confirmed' AND b.check_in_date <= CURDATE() AND (b.move_in_required = 1 OR (b.payment_method = 'paymongo' AND b.payment_status != 'paid')) AND b.payment_review_required = 0 AND NOT EXISTS (SELECT 1 FROM occupants ro WHERE ro.reference_no = CONCAT('REF-', IF(CHAR_LENGTH(b.id) < 4, LPAD(b.id,4,'0'),b.id)))) AS reserved_count,
                (SELECT COUNT(*) FROM bookings b WHERE b.room_id = r.id AND b.status = 'confirmed' AND b.check_in_date > CURDATE() AND (b.move_in_required = 1 OR (b.payment_method = 'paymongo' AND b.payment_status != 'paid')) AND b.payment_review_required = 0 AND NOT EXISTS (SELECT 1 FROM occupants ro WHERE ro.reference_no = CONCAT('REF-', IF(CHAR_LENGTH(b.id) < 4, LPAD(b.id,4,'0'),b.id)))) AS upcoming_reserved_count,
                (SELECT COUNT(*) FROM occupants o WHERE o.room_id = r.id AND o.is_non_cspc = 0 AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE()) AND ${RESIDENT}) AS cspc_count
             FROM rooms r
             WHERE r.house_id = ?`,
            [req.params.houseId]
        );
        res.json({ success: true, rooms });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 7. GET - Fetch CSPC occupants in a specific room (admin only sees CSPC students)
router.get('/rooms/occupants/:roomId', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const [occupants] = await pool.query(
            `SELECT o.*
             FROM occupants o
             WHERE o.room_id = ? 
               AND o.is_non_cspc = 0
               AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE()) AND ${RESIDENT}`,
            [req.params.roomId]
        );
        res.json({ success: true, occupants });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 8. POST - Admin check-out override for an occupant row
router.post('/rooms/occupants/checkout/:id', authenticateToken, verifyAdmin, validateBody('ids'), async (req, res) => {
    let connection;
    try {
        connection=await pool.getConnection();
        await connection.beginTransaction();
        const [rows]=await connection.query('SELECT id, student_id, room_id, reference_no FROM occupants WHERE id = ? AND is_non_cspc = 0',[req.params.id]);
        if (!rows.length) { await connection.rollback(); return res.status(404).json({success:false,message:'Occupant not found.'}); }
        const occupant=rows[0];
        if (occupant.student_id) await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE',[occupant.student_id]);
        await connection.query('SELECT id FROM rooms WHERE id = ? FOR UPDATE',[occupant.room_id]);
        const [current]=await connection.query('SELECT id, check_out_date FROM occupants WHERE id = ? FOR UPDATE',[req.params.id]);
        if (!current.length || current[0].check_out_date) { await connection.rollback(); return res.status(409).json({success:false,message:'Checkout is already recorded.'}); }
        await connection.query('UPDATE occupants SET check_out_date = CURDATE() WHERE id = ?',[req.params.id]);
        if (occupant.reference_no) await connection.query("UPDATE bookings SET status = 'completed' WHERE id = ? AND status = 'confirmed'",[bookingIdFromReference(occupant.reference_no)]);
        if (occupant.student_id) await connection.query('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',[occupant.student_id,'CHECKOUT RECORDED: The administrator recorded your checkout. Any separate future reservation remains unchanged.','/student/bookings']);
        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        if (connection) await connection.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally { connection?.release(); }
});

// 9. POST - Approve Accreditation Application — Alerts Owner only
router.post('/approve/:id', authenticateToken, verifyAdmin, validateBody('approval'), async (req, res) => {
    const houseId = req.params.id;
    const { checklist, admin_comments } = req.body;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [house] = await connection.query('SELECT owner_id, name, reference_no, application_status FROM boarding_houses WHERE id = ?', [houseId]);
        if (house.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Boarding house record not found.' });
        }
        const owner_id = house[0].owner_id;
        const [requiredDocuments] = await connection.query("SELECT id, label FROM checklist_criteria WHERE is_active = 1 AND permit_key IS NULL AND requirement_type = 'required' AND (house_id IS NULL OR house_id = ?) FOR UPDATE", [houseId]);
        const checkedIds = new Set((checklist || []).map(Number));
        if (requiredDocuments.some(item => !checkedIds.has(Number(item.id)))) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Verify all required documents before approving this property.' });
        }
        if (checklist && checklist.length > 0) {
            const [applicable] = await connection.query('SELECT id FROM checklist_criteria WHERE id IN (?) AND is_active = 1 AND (house_id IS NULL OR house_id = ?) FOR UPDATE', [checklist, houseId]);
            if (applicable.length !== checklist.length) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'Some checklist requirements do not apply to this property. Please refresh the application.' });
            }
        }

        await connection.query(
            `UPDATE boarding_houses 
             SET house_status = 'accredited', compliance_status = 'active', 
                 document_update_pending = 0, is_resubmission = 0, admin_comments = ? 
             WHERE id = ?`,
            [admin_comments && admin_comments.trim() !== 'Accredited' ? admin_comments.trim() : null, houseId]
        );

        // Property-first applicant (pending owner, no password, no Google link): the account is
        // NOT activated here. A one-time activation link lets the applicant set their own password.
        const [ownerRows] = await connection.query('SELECT id, name, email, role, status, password, google_id FROM users WHERE id = ? FOR UPDATE', [owner_id]);
        const owner = Array.isArray(ownerRows) ? ownerRows[0] : null;
        let activation = null;
        // Repeated approvals (e.g. a later document re-check) never re-issue links or re-record the decision.
        const alreadyApproved = ['APPROVED', 'ACCOUNT_PENDING', 'ACTIVE'].includes(house[0].application_status);
        const awaitingActivation = Boolean(owner && owner.role === 'owner' && owner.status === 'pending' && !owner.password && !owner.google_id);
        if (awaitingActivation && alreadyApproved) {
            // Activation already issued; the applicant can request a fresh link from Track My Application.
        } else if (awaitingActivation) {
            const reference_no = house[0].reference_no || `BH-${new Date().getFullYear()}-${String(houseId).padStart(5, '0')}`;
            if (!house[0].reference_no) {
                await connection.query('UPDATE boarding_houses SET reference_no = ? WHERE id = ?', [reference_no, houseId]);
            }
            // The owner opens the activation link from Track My Application; it is not shown to SASO.
            await issueActivationToken(connection, owner_id);
            activation = { name: owner.name, house_name: house[0].name, reference_no, expires_in_days: ACTIVATION_TTL_DAYS };
        } else {
            await connection.query('UPDATE users SET status = ? WHERE id = ?', ['active', owner_id]);
        }

        // Tracked applications move to ACCOUNT_PENDING (awaiting activation) or ACTIVE.
        if (house[0].application_status && !alreadyApproved) {
            const next = activation ? APPLICATION_STATUS.ACCOUNT_PENDING : APPLICATION_STATUS.ACTIVE;
            await connection.query('UPDATE boarding_houses SET application_status = ? WHERE id = ?', [next, houseId]);
            await recordStatusChange(connection, { houseId, from: house[0].application_status, to: APPLICATION_STATUS.APPROVED, remarks: admin_comments && admin_comments.trim() !== 'Accredited' ? admin_comments.trim() : 'Application approved', actorType: 'admin', actorId: req.user.id, withSnapshot: true });
            await recordStatusChange(connection, { houseId, from: APPLICATION_STATUS.APPROVED, to: next, remarks: activation ? 'Owner account activation link issued' : 'Linked to active owner account', actorType: 'system' });
        }

        await connection.query('DELETE FROM checklist_results WHERE house_id = ?', [houseId]);
        if (checklist && checklist.length > 0) {
            const values = checklist.map(cId => [houseId, cId, 1]);
            await connection.query('INSERT INTO checklist_results (house_id, criteria_id, is_verified) VALUES ?', [values]);
        }

        // Notify owner only
        const approveMsg = `CONGRATULATIONS: Your boarding house "${house[0].name}"${house[0].reference_no ? ` (reference ${house[0].reference_no})` : ''} has been officially ACCREDITED by SASO!`;
        await connection.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [owner_id, approveMsg]);

        await connection.commit();

        if (activation) return res.json({ success: true, activation });
        res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        connection.release();
    }
});

// 10. POST - Reject Accreditation Application (or a document-update review) — Alerts Owner only
// A brand-new application (house_status='pending') that gets rejected becomes 'rejected'
// and unlisted, as before. But rejecting a document RE-CHECK on a house that's already
// accredited or archived must NOT strip that existing status — the house stays exactly
// as it was (still bookable if accredited), only the flagged document goes back to the
// owner for correction. Otherwise a single bad renewal doc would fully un-list a live,
// operating boarding house.
router.post('/reject/:id', authenticateToken, verifyAdmin, validateBody('rejection'), async (req, res) => {
    const houseId = req.params.id;
    const { admin_comments } = req.body;
    const finalRejection = req.body.decision === 'reject';

    if (!admin_comments || !admin_comments.trim()) {
        return res.status(400).json({ success: false, message: 'Administrative feedback comments are required.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [house] = await connection.query('SELECT owner_id, name, house_status, application_status, reference_no FROM boarding_houses WHERE id = ?', [houseId]);
        if (house.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Record not found.' });
        }
        const owner_id = house[0].owner_id;
        const isNewApplication = house[0].house_status === 'pending';

        if (isNewApplication) {
            // Tracked applications can be closed for good; everything else keeps the revise-and-resubmit behaviour.
            const closeApplication = finalRejection && Boolean(house[0].application_status);
            await connection.query(
                `UPDATE boarding_houses
                 SET house_status = 'rejected', is_resubmission = ?, document_update_pending = 0, admin_comments = ?
                 WHERE id = ?`,
                [closeApplication ? 0 : 1, admin_comments, houseId]
            );
            if (house[0].application_status) {
                const next = closeApplication ? APPLICATION_STATUS.REJECTED : APPLICATION_STATUS.REVISION_REQUIRED;
                await connection.query('UPDATE boarding_houses SET application_status = ? WHERE id = ?', [next, houseId]);
                await recordStatusChange(connection, { houseId, from: house[0].application_status, to: next, remarks: admin_comments, actorType: 'admin', actorId: req.user.id });
            }
            const revisionRequested = Boolean(house[0].application_status) && !closeApplication;
            const rejectMsg = revisionRequested
                ? `REVISION REQUIRED: SASO requested corrections for "${house[0].name}"${house[0].reference_no ? ` (reference ${house[0].reference_no})` : ''}. Feedback: ${admin_comments}. Open Track My Application to update and resubmit.`
                : `NOTICE: Your application for "${house[0].name}"${house[0].reference_no ? ` (reference ${house[0].reference_no})` : ''} was REJECTED by SASO. Reason: ${admin_comments}`;
            await connection.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [owner_id, rejectMsg]);
        } else {
            // Document-update review on an already-accredited/archived house: preserve house_status.
            await connection.query(
                `UPDATE boarding_houses
                 SET document_update_pending = 0, admin_comments = ?
                 WHERE id = ?`,
                [admin_comments, houseId]
            );

            // The "unaffected" claim is only true if the house was already accredited —
            // if it's archived (e.g. a different required document also expired), telling
            // the owner nothing changed is simply false, since it's already hidden.
            const statusNote = house[0].house_status === 'accredited'
                ? 'Your listing remains active and bookable — please correct and re-upload the document.'
                : `Your listing is currently ${house[0].house_status} (unrelated to this specific document) — please correct and re-upload the document.`;

            const docRejectMsg = `ALERT: Your resubmitted document for "${house[0].name}" was not approved by SASO. Reason: ${admin_comments}. ${statusNote}`;
            await connection.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [owner_id, docRejectMsg]);
        }

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        connection.release();
    }
});


// 10.5 Application workflow (Track My Application)
// POST - SASO starts reviewing a submitted/resubmitted application: applicant edits are locked.
router.post('/applications/:id/start-review', authenticateToken, verifyAdmin, validateBody('ids'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT id, application_status FROM boarding_houses WHERE id = ? FOR UPDATE', [req.params.id]);
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Application not found.' });
        }
        const current = rows[0].application_status;
        if (!REVIEWABLE.has(current)) {
            await connection.rollback();
            return res.json({ success: true, status: current, changed: false });
        }
        await connection.query('UPDATE boarding_houses SET application_status = ? WHERE id = ?', [APPLICATION_STATUS.UNDER_REVIEW, req.params.id]);
        await recordStatusChange(connection, { houseId: rows[0].id, from: current, to: APPLICATION_STATUS.UNDER_REVIEW, remarks: 'SASO started the review', actorType: 'admin', actorId: req.user.id });
        await connection.query('INSERT INTO notifications (user_id, message) SELECT owner_id, ? FROM boarding_houses WHERE id = ?', ['APPLICATION UNDER REVIEW: SASO has started reviewing your property application. Editing is locked until a revision is requested. Open Track My Application for details.', req.params.id]);
        await connection.commit();
        res.json({ success: true, status: APPLICATION_STATUS.UNDER_REVIEW, changed: true });
    } catch (err) {
        await connection.rollback();
        console.error('Start review error:', err.code || err.message);
        res.status(500).json({ success: false, message: 'Could not update the application status.' });
    } finally {
        connection.release();
    }
});

// GET - Full status history (reviewer remarks, resubmissions) of one application.
router.get('/applications/:id/history', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const [history] = await pool.query(
            `SELECT h.from_status, h.to_status, h.remarks, h.actor_type, h.created_at, u.name AS actor_name
             FROM application_status_history h LEFT JOIN users u ON u.id = h.actor_id AND h.actor_type = 'admin'
             WHERE h.house_id = ? ORDER BY h.created_at ASC, h.id ASC`,
            [req.params.id]
        );
        res.json({ success: true, history });
    } catch (err) {
        console.error('Application history error:', err.code || err.message);
        res.status(500).json({ success: false, message: 'Could not load the application history.' });
    }
});

// ===================================================================
// 11. Shared document requirements (standard permits remain protected)
// ===================================================================

router.post('/criteria/add', authenticateToken, verifyAdmin, validateBody('criterion'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const label = req.body.label.trim();
        const [result] = await connection.query('INSERT INTO checklist_criteria (label, house_id, requirement_type) VALUES (?, NULL, ?)', [label, req.body.requirement_type || 'supplementary']);
        await connection.query("INSERT INTO notifications (user_id, message) SELECT id, ? FROM users WHERE role = 'owner'", ['SASO added a ' + (req.body.requirement_type === 'required' ? 'required' : 'supplementary (optional)') + ' document for all properties: "' + label + '". Please review Documents for each property.']);
        await connection.commit();
        res.json({ success: true, criteriaId: result.insertId });
    } catch (err) {
        await connection.rollback();
        console.error('Add requirement:', err.message);
        res.status(500).json({ success: false, message: 'Failed to add requirement.' });
    } finally { connection.release(); }
});

for (const action of ['update', 'delete']) {
    router.post('/criteria/' + action + '/:id', authenticateToken, verifyAdmin, validateBody(action === 'update' ? 'criterion' : 'ids'), async (req, res) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const [rows] = await connection.query('SELECT * FROM checklist_criteria WHERE id = ? AND is_active = 1 FOR UPDATE', [req.params.id]);
            if (!rows.length) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: 'Requirement not found.' });
            }
            const item = rows[0];
            if (item.permit_key || (Number(item.id) >= 30 && Number(item.id) <= 37 && item.house_id === null)) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'Standard permit requirements are protected.' });
            }
            if (action === 'update') await connection.query('UPDATE checklist_criteria SET label = ?, requirement_type = ? WHERE id = ?', [req.body.label.trim(), req.body.requirement_type || item.requirement_type || 'supplementary', item.id]);
            else await connection.query('UPDATE checklist_criteria SET is_active = 0 WHERE id = ?', [item.id]);
            const message = action === 'update'
                ? 'SASO updated document requirement "' + item.label + '" to "' + req.body.label.trim() + '" (' + ((req.body.requirement_type || item.requirement_type) === 'required' ? 'Required' : 'Supplementary, optional') + '). Existing uploads are retained; please review your documents.'
                : 'SASO removed document requirement "' + item.label + '" from the checklist. Previously submitted files are retained.';
            if (item.house_id === null) await connection.query("INSERT INTO notifications (user_id, message) SELECT id, ? FROM users WHERE role = 'owner'", [message]);
            else await connection.query('INSERT INTO notifications (user_id, message) SELECT owner_id, ? FROM boarding_houses WHERE id = ? AND owner_id IS NOT NULL', [message, item.house_id]);
            await connection.commit();
            res.json({ success: true });
        } catch (err) {
            await connection.rollback();
            console.error('Manage requirement:', err.message);
            res.status(500).json({ success: false, message: 'Failed to change requirement.' });
        } finally { connection.release(); }
    });
}




// ==========================================
// 12. USER DIRECTORY MANAGEMENT ENDPOINTS
// ==========================================

// GET - Retrieve all registered student and owner accounts
router.get('/users', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const [users] = await pool.query(
            "SELECT id, name, email, phone, role, status, profile_pic FROM users WHERE role IN ('student', 'owner') ORDER BY id DESC"
        );
        res.json({ success: true, users });
    } catch (err) {
        console.error('Fetch Users Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to fetch users list.' });
    }
});

// POST - Update User profile & optional password securely (Handles Email Conflicts)
router.post('/users/update/:id', authenticateToken, verifyAdmin, validateBody('adminUser'), async (req, res) => {
    const { id } = req.params;
    const { name, email, phone, password } = req.body;

    try {
        // 1. Prevent duplicate email addresses across accounts
        const [emailConflict] = await pool.query(
            "SELECT id FROM users WHERE email = ? AND id != ?",
            [email, id]
        );

        if (emailConflict.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'This email address is already registered to another user.'
            });
        }

        // 2. Perform conditional password updates safely
        // Step 2A: If admin also typed a new password → hash it and save everything
        if (password && password.trim() !== '') {
            const saltRounds = 10;
            const hashedPass = await bcrypt.hash(password, saltRounds);
            await pool.query(
                "UPDATE users SET name = ?, email = ?, phone = ?, password = ? WHERE id = ?",
                [name, email, phone, hashedPass, id]
            );
        } else {
            // Step 2B: No new password provided → update only profile fields, leave password untouched
            await pool.query(
                "UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?",
                [name, email, phone, id]
            );
        }

        res.json({ success: true, message: 'User updated successfully.' });
    } catch (err) {
        console.error('Update User Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to apply profile changes.' });
    }
});

// POST - Reset password back to institutional default
router.post('/users/reset-password/:id', authenticateToken, verifyAdmin, validateBody('ids'), async (req, res) => {
    try {
        const saltRounds = 10;
        const defaultHash = await bcrypt.hash('CSPC1234', saltRounds);
        await pool.query('UPDATE users SET password = ? WHERE id = ?', [defaultHash, req.params.id]);
        res.json({ success: true, message: 'Password reset successfully.' });
    } catch (err) {
        console.error('Reset Password Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to reset password.' });
    }
});

// POST - Toggle account access standardly between active and inactive
router.post('/users/toggle-status/:id', authenticateToken, verifyAdmin, validateBody('ids'), async (req, res) => {
    try {
        const [[user]] = await pool.query('SELECT status FROM users WHERE id = ?', [req.params.id]);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User account not found.' });
        }

        // Deactivated users transition to 'inactive', inactive/pending accounts activate to 'active'
        const newStatus = user.status === 'active' ? 'inactive' : 'active';
        await pool.query('UPDATE users SET status = ? WHERE id = ?', [newStatus, req.params.id]);

        res.json({ success: true, message: 'Account state modified successfully.' });
    } catch (err) {
        console.error('Toggle Status Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to modify account privileges.' });
    }
});

// ==========================================
// 13. REPORT MANAGEMENT ENDPOINTS
// ==========================================

// GET - Accredited Boarding Houses Masterlist Report
router.get('/reports/masterlist', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const [houses] = await pool.query(`
            SELECT
                bh.id,
                bh.name,
                bh.location AS address,
                bh.barangay,
                bh.house_status,
                u.name AS owner_name,
                u.phone AS owner_phone,
                (
                    SELECT COUNT(*)
                    FROM occupants o
                    INNER JOIN rooms ro ON o.room_id = ro.id
                    WHERE ro.house_id = bh.id
                      AND ro.deleted_at IS NULL
                      AND o.is_non_cspc = 0
                      AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE()) AND ${RESIDENT}
                ) AS occupied_beds,
                (
                    SELECT MAX(h.created_at)
                    FROM application_status_history h
                    WHERE h.house_id = bh.id AND h.to_status = 'APPROVED'
                ) AS approved_at,
                SUM(CASE WHEN r.gender_type = 'male' THEN 1 ELSE 0 END) AS male_rooms,
                SUM(CASE WHEN r.gender_type = 'female' THEN 1 ELSE 0 END) AS female_rooms,
                COUNT(r.id) AS total_rooms,
                COALESCE(SUM(r.capacity), 0) AS total_capacity,
                (
                    SELECT COUNT(DISTINCT o.student_id)
                    FROM occupants o
                    INNER JOIN rooms ro ON o.room_id = ro.id
                    WHERE ro.house_id = bh.id
                      AND o.is_non_cspc = 0
                      AND o.student_id IS NOT NULL
                      AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE()) AND ${RESIDENT}
                ) AS current_occupants,
                (
                    SELECT COUNT(DISTINCT o.student_id)
                    FROM occupants o
                    INNER JOIN rooms ro ON o.room_id = ro.id
                    INNER JOIN users su ON o.student_id = su.id
                    WHERE ro.house_id = bh.id
                      AND o.is_non_cspc = 0
                      AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE()) AND ${RESIDENT}
                      AND LOWER(su.sex) = 'male'
                ) AS male_count,
                (
                    SELECT COUNT(DISTINCT o.student_id)
                    FROM occupants o
                    INNER JOIN rooms ro ON o.room_id = ro.id
                    INNER JOIN users su ON o.student_id = su.id
                    WHERE ro.house_id = bh.id
                      AND o.is_non_cspc = 0
                      AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE()) AND ${RESIDENT}
                      AND LOWER(su.sex) = 'female'
                ) AS female_count
            FROM boarding_houses bh
            LEFT JOIN users u ON bh.owner_id = u.id
            LEFT JOIN rooms r ON bh.id = r.house_id AND r.deleted_at IS NULL
            WHERE bh.house_status = 'accredited'
            GROUP BY bh.id, bh.name, bh.location, bh.barangay, bh.house_status, u.name, u.phone
            ORDER BY bh.name ASC
        `);

        const reportDate = new Date().toLocaleDateString('en-PH', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
        res.json({ success: true, houses, reportDate });
    } catch (err) {
        console.error('[REPORT MASTERLIST ERROR]:', err.message);
        res.status(500).json({ success: false, message: 'Failed to generate masterlist report.' });
    }
});

// GET - Accreditation Compliance Audit Report
router.get('/reports/compliance', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const [houses] = await pool.query(`
            SELECT
                bh.id,
                bh.name,
                bh.house_status,
                bh.compliance_status,
                u.name AS owner_name,
                bh.expiry_permit_business_form,
                bh.expiry_permit_cedula,
                bh.expiry_permit_dti,
                bh.expiry_permit_barangay,
                bh.expiry_permit_building,
                bh.expiry_permit_zoning,
                bh.expiry_permit_sanitary,
                bh.expiry_permit_fire
            FROM boarding_houses bh
            LEFT JOIN users u ON bh.owner_id = u.id
            WHERE bh.house_status IN ('accredited', 'archived')
            ORDER BY bh.compliance_status ASC, bh.name ASC
        `);

        const reportDate = new Date().toLocaleDateString('en-PH', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
        res.json({ success: true, houses, reportDate });
    } catch (err) {
        console.error('[REPORT COMPLIANCE ERROR]:', err.message);
        res.status(500).json({ success: false, message: 'Failed to generate compliance report.' });
    }
});

        // GET - Emergency Student Residency Registry (filterable by barangay and boarding house)
router.get('/reports/emergency-registry', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const { barangay, house_id, course } = req.query;

        let whereClauses = [
            "o.is_non_cspc = 0",
            "o.student_id IS NOT NULL",
            // Strictly active only — checked out today or earlier are excluded
            "(o.check_out_date IS NULL OR o.check_out_date > CURDATE())",
            // Includes archived houses: a property losing accreditation doesn't evict
            // its residents, and this registry exists for physical safety tracking —
            // a student shouldn't vanish from disaster response just because the
            // property's paperwork status changed. Excludes pending/rejected, which
            // never have real occupants since booking requires an accredited listing.
            "bh.house_status IN ('accredited', 'archived')",
            RESIDENT
        ];
        let queryParams = [];

        if (barangay && barangay.trim() !== '' && barangay.toLowerCase() !== 'all') {
            const cleanBarangay = barangay.trim();
            whereClauses.push("(bh.barangay = ? OR ((bh.barangay IS NULL OR bh.barangay = '') AND bh.location LIKE ?))");
            queryParams.push(cleanBarangay, `%${cleanBarangay}%`);
        }

        if (house_id && house_id.trim() !== '' && house_id.toLowerCase() !== 'all') {
            whereClauses.push('bh.id = ?');
            queryParams.push(house_id.trim());
        }

        if (course && course.trim() !== '' && course.toLowerCase() !== 'all') {
            whereClauses.push('u.course = ?');
            queryParams.push(course.trim());
        }

        const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

        // Use ROW_NUMBER to deduplicate: if a student has multiple active occupancies
        // (e.g. checked into a new BH before old one was checked out), keep only the most recent
        const [residents] = await pool.query(`
            SELECT * FROM (
                SELECT
                    o.id,
                    bh.id AS house_id,
                    bh.name AS house_name,
                    bh.house_status,
                    bh.location AS house_location,
                    bh.barangay AS house_barangay,
                    bh.phone_contact AS house_owner_phone,
                    (SELECT ou.name FROM users ou WHERE ou.id = bh.owner_id) AS house_owner_name,
                    COALESCE(u.name, o.name, 'N/A') AS resident_name,
                    COALESCE(u.email, 'N/A') AS student_email,
                    COALESCE(u.phone, o.contact_number, 'N/A') AS student_phone,
                    COALESCE(NULLIF(TRIM(u.address), ''), NULLIF(TRIM(o.address), ''), 'N/A') AS home_address,
                    COALESCE(u.sex, 'N/A') AS sex,
                    COALESCE(u.course, 'N/A') AS course,
                    COALESCE(u.year_section, 'N/A') AS year_level,
                    r.room_number,
                    o.check_in_date AS booking_date,
                    o.emergency_contact,
                    o.guardian_name,
                    ROW_NUMBER() OVER (PARTITION BY COALESCE(o.student_id, o.id) ORDER BY o.check_in_date DESC, o.id DESC) AS rn
                FROM occupants o
                INNER JOIN rooms r ON o.room_id = r.id
                INNER JOIN boarding_houses bh ON r.house_id = bh.id
                LEFT JOIN users u ON o.student_id = u.id
                ${whereSql}
            ) ranked
            WHERE rn = 1
            ORDER BY house_name ASC, resident_name ASC
        `, queryParams);

        // Always return all accredited boarding houses for the filter dropdown
        // AND so the frontend can show empty houses too
        const [boardingHouses] = await pool.query(
            "SELECT id, name, location, barangay FROM boarding_houses WHERE house_status = 'accredited' ORDER BY name ASC"
        );

        res.json({
            success: true,
            residents,
            boardingHouses,
            summary: {
                totalResidents: residents.length,
                totalHouses: boardingHouses.length
            }
        });
    } catch (err) {
        console.error('[REPORT EMERGENCY REGISTRY ERROR]:', err.message);
        res.status(500).json({ success: false, message: 'Failed to load emergency registry.' });
    }
});

// GET - Student Reservation / Transaction History Report
router.get('/reports/transactions', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const [transactions] = await pool.query(`
            SELECT
                b.id,
                u.name AS student_name,
                bh.name AS house_name,
                b.status,
                b.payment_status,
                b.payment_method,
                b.monthly_rent AS room_price,
                b.check_in_date,
                b.booking_date,
                b.months
            FROM bookings b
            INNER JOIN users u ON b.student_id = u.id
            INNER JOIN boarding_houses bh ON b.house_id = bh.id
            ORDER BY b.booking_date DESC
        `);

        const reportDate = new Date().toLocaleDateString('en-PH', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
        res.json({ success: true, transactions, reportDate });
    } catch (err) {
        console.error('[REPORT TRANSACTIONS ERROR]:', err.message);
        res.status(500).json({ success: false, message: 'Failed to generate transactions report.' });
    }
});

export default router;
