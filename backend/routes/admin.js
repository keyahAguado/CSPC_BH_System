import express from 'express';
import pool from '../config/db.js';
import { authenticateToken } from './auth.js';
import bcrypt from 'bcryptjs';

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
    bh.last_updated_document, bh.is_resubmission, bh.admin_comments, bh.created_at
`;

// Helper: Self-healing automatic backfill for missing barangay values using location field
// Only fills houses where barangay is genuinely empty — never overrides owner-set values
const autoBackfillBarangays = async () => {
    try {
        // Correct any houses whose barangay was wrongly set by the old hardcoded backfill.
        // These corrections are safe to run repeatedly — they only update specific rows.
        const corrections = [
            { namePattern: '%mikeah%', correctBarangay: 'San Miguel' },
            { namePattern: '%rebecca%', correctBarangay: 'San Antonio' },
        ];
        for (const fix of corrections) {
            await pool.query(
                `UPDATE boarding_houses SET barangay = ? WHERE LOWER(name) LIKE ? AND barangay != ?`,
                [fix.correctBarangay, fix.namePattern, fix.correctBarangay]
            );
        }

        // Fill genuinely empty barangay fields from location string
        const [houses] = await pool.query("SELECT id, name, location FROM boarding_houses WHERE barangay IS NULL OR barangay = ''");
        const knownBarangays = [
            'San Antonio', 'San Esteban', 'San Isidro', 'San Juan', 'San Luis',
            'San Miguel', 'San Nicolas', 'San Roque', 'Angustia', 'Atate',
            'Malawag', 'Palbreak', 'Santa Cruz', 'Santa Elena', 'Santa Lucia',
            'Santiago Old', 'Santiago Young', 'Santo Domingo', 'Topas Proper', 'Topas Samar'
        ];
        for (const h of houses) {
            let matched = null;
            if (h.location) {
                matched = knownBarangays.find(b => h.location.toLowerCase().includes(b.toLowerCase()));
            }
            if (matched) {
                await pool.query("UPDATE boarding_houses SET barangay = ? WHERE id = ?", [matched, h.id]);
            }
        }
    } catch (e) {
        console.error('[BARANGAY AUTO-BACKFILL ERROR]:', e.message);
    }
};
autoBackfillBarangays();

// One-time correction: fix any houses whose barangay was incorrectly set by old backfill logic
pool.query(`
    UPDATE boarding_houses 
    SET barangay = 'San Miguel' 
    WHERE LOWER(name) LIKE '%mikeah%' AND (barangay IS NULL OR barangay != 'San Miguel')
`).catch(e => console.error('[BARANGAY CORRECTION ERROR]:', e.message));


// 1. GET - Retrieve Dashboard Statistics
router.get('/dashboard', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const [[housesRow]] = await pool.query(
            "SELECT COUNT(*) AS count FROM boarding_houses WHERE house_status = 'accredited'"
        );
        const [[pendingRow]] = await pool.query(
            "SELECT COUNT(*) AS count FROM boarding_houses WHERE house_status = 'pending' OR document_update_pending = 1"
        );

        // CSPC student count: active CSPC student residents in accredited boarding houses
        const [[studentsRow]] = await pool.query(`
            SELECT COUNT(DISTINCT o.student_id) AS count
            FROM occupants o
            INNER JOIN rooms r ON o.room_id = r.id
            INNER JOIN boarding_houses bh ON r.house_id = bh.id
            WHERE bh.house_status = 'accredited'
              AND o.student_id IS NOT NULL 
              AND o.is_non_cspc = 0 
              AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())
        `);

        // Occupancy Rate: capacity of accredited rooms vs active occupants (unique CSPC + manual non-CSPC) in accredited houses
        const [[capacityRow]] = await pool.query(`
            SELECT SUM(r.capacity) AS total_capacity 
            FROM rooms r
            INNER JOIN boarding_houses bh ON r.house_id = bh.id
            WHERE bh.house_status = 'accredited'
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
                 AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE()))
              +
              (SELECT COUNT(o.id) 
               FROM occupants o 
               INNER JOIN rooms r ON o.room_id = r.id
               INNER JOIN boarding_houses bh ON r.house_id = bh.id
               WHERE bh.house_status = 'accredited'
                 AND o.is_non_cspc = 1 
                 AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE()))
              AS current_occupants
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
router.post('/courses/add', authenticateToken, verifyAdmin, async (req, res) => {
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
router.post('/courses/update/:id', authenticateToken, verifyAdmin, async (req, res) => {
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
router.post('/courses/toggle/:id', authenticateToken, verifyAdmin, async (req, res) => {
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
router.post('/courses/delete/:id', authenticateToken, verifyAdmin, async (req, res) => {
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

// GET - Active residents grouped by course, for the admin breakdown report
router.get('/reports/courses', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const [breakdown] = await pool.query(`
            SELECT c.course_code, c.course_name, c.department, COUNT(DISTINCT o.student_id) AS resident_count
            FROM courses c
            LEFT JOIN users u ON u.course = c.course_code
            LEFT JOIN occupants o ON o.student_id = u.id
                AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())
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
                u.name as owner_name, u.email as owner_email 
            FROM boarding_houses bh 
            JOIN users u ON bh.owner_id = u.id 
            WHERE bh.house_status = 'pending' OR bh.document_update_pending = 1
            ORDER BY bh.created_at DESC
        `);
        // Query 2: ALL checklist criteria (both global 8 + any house-specific ones)
        const [dbCriteria] = await pool.query('SELECT * FROM checklist_criteria');
        // Query 3: Which criteria were already verified (from previous admin reviews)
        const [checklistResults] = await pool.query('SELECT * FROM checklist_results WHERE is_verified = 1');

        // Fetch dynamic uploads
        // Query 4: Any custom requirement files uploaded by owners
        const [dynamicDocs] = await pool.query(`
            SELECT hd.*, cc.label AS criteria_label 
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

        res.json({ success: true, applications, criteria, checklistResults, dynamicDocs });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. GET - Retrieve accredited/registered houses & dynamic uploads (filterable by barangay)
router.get('/applications/registered', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        await autoBackfillBarangays();
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
                u.email as owner_email, 
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
            SELECT hd.*, cc.label AS criteria_label 
            FROM house_documents hd
            JOIN checklist_criteria cc ON hd.criteria_id = cc.id
        `);

        res.json({ success: true, houses, dynamicDocs });
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
                u.name as owner_name, u.email as owner_email, u.phone as owner_phone, u.address as owner_address,
                (SELECT AVG(rating) FROM reviews WHERE house_id = bh.id) as avg_rating,
                (SELECT COUNT(*) FROM reviews WHERE house_id = bh.id) as review_count
            FROM boarding_houses bh
            JOIN users u ON bh.owner_id = u.id
            WHERE bh.house_status = 'archived'
            ORDER BY bh.created_at DESC
        `);

        res.json({ success: true, houses });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. POST - Archive a boarding house (Marks status as 'archived') — Alerts Owner only
// Manual archive (owner request e.g. at full capacity, admin discretion, etc.) is
// intentionally kept separate from auto-archiving due to expired required documents:
// it must NOT touch compliance_status, otherwise the owner dashboard can't tell the
// two apart and always shows "PERMITS EXPIRED" even when that's not why it's archived.
router.post('/archive/:id', authenticateToken, verifyAdmin, async (req, res) => {
    const houseId = req.params.id;
    const { reason } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Fetch house and owner details
        const [house] = await connection.query('SELECT owner_id, name FROM boarding_houses WHERE id = ?', [houseId]);
        if (house.length === 0) {
            return res.status(404).json({ success: false, message: 'Boarding house record not found.' });
        }
        const ownerId = house[0].owner_id;

        // 1. Update Boarding House status (compliance_status is left untouched)
        await connection.query(
            "UPDATE boarding_houses SET house_status = 'archived', admin_comments = ? WHERE id = ?",
            [reason && reason.trim() ? reason.trim() : null, houseId]
        );

        // 2. Insert Alert notification for the Owner ONLY
        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [ownerId, `WARNING: Your boarding house "${house[0].name}" has been ARCHIVED by the SASO Administrator.${reason && reason.trim() ? ` Reason: ${reason.trim()}` : ''} Your listing is now hidden from students.`]
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
router.post('/restore/:id', authenticateToken, verifyAdmin, async (req, res) => {
    const houseId = req.params.id;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Fetch house and owner details
        const [house] = await connection.query('SELECT owner_id, name FROM boarding_houses WHERE id = ?', [houseId]);
        if (house.length === 0) {
            return res.status(404).json({ success: false, message: 'Boarding house record not found.' });
        }
        const ownerId = house[0].owner_id;

        // 1. Restore Boarding House status
        await connection.query(
            "UPDATE boarding_houses SET house_status = 'accredited', compliance_status = 'active' WHERE id = ?",
            [houseId]
        );

        // 2. Insert Approved notification for the Owner ONLY
        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [ownerId, `CONGRATULATIONS: Your boarding house "${house[0].name}" has been RESTORED and is now active on the system.`]
        );

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        console.error('Manual Restore Error:', err.message);
        res.status(500).json({ success: false, message: err.message });
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
                (SELECT COUNT(*) FROM occupants o WHERE o.room_id = r.id AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())) AS occupant_count,
                (SELECT COUNT(*) FROM occupants o WHERE o.room_id = r.id AND o.is_non_cspc = 0 AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())) AS cspc_count,
                (SELECT COUNT(*) FROM occupants o WHERE o.room_id = r.id AND o.is_non_cspc = 1 AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())) AS non_cspc_count
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
               AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())`,
            [req.params.roomId]
        );
        res.json({ success: true, occupants });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 8. POST - Admin check-out override for an occupant row
router.post('/rooms/occupants/checkout/:id', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        await pool.query(
            'UPDATE occupants SET check_out_date = CURDATE() WHERE id = ?',
            [req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 9. POST - Approve Accreditation Application — Alerts Owner only
router.post('/approve/:id', authenticateToken, verifyAdmin, async (req, res) => {
    const houseId = req.params.id;
    const { checklist, admin_comments } = req.body;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [house] = await connection.query('SELECT owner_id, name FROM boarding_houses WHERE id = ?', [houseId]);
        if (house.length === 0) {
            return res.status(404).json({ success: false, message: 'Boarding house record not found.' });
        }
        const owner_id = house[0].owner_id;

        await connection.query(
            `UPDATE boarding_houses 
             SET house_status = 'accredited', compliance_status = 'active', 
                 document_update_pending = 0, is_resubmission = 0, admin_comments = ? 
             WHERE id = ?`,
            [admin_comments && admin_comments.trim() !== 'Accredited' ? admin_comments.trim() : null, houseId]
        );

        await connection.query('UPDATE users SET status = ? WHERE id = ?', ['active', owner_id]);

        await connection.query('DELETE FROM checklist_results WHERE house_id = ?', [houseId]);
        if (checklist && checklist.length > 0) {
            const values = checklist.map(cId => [houseId, cId, 1]);
            await connection.query('INSERT INTO checklist_results (house_id, criteria_id, is_verified) VALUES ?', [values]);
        }

        // Notify owner only
        await connection.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [owner_id, `CONGRATULATIONS: Your boarding house "${house[0].name}" has been officially ACCREDITED by SASO!`]);

        await connection.commit();
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
router.post('/reject/:id', authenticateToken, verifyAdmin, async (req, res) => {
    const houseId = req.params.id;
    const { admin_comments } = req.body;

    if (!admin_comments || !admin_comments.trim()) {
        return res.status(400).json({ success: false, message: 'Administrative feedback comments are required.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [house] = await connection.query('SELECT owner_id, name, house_status FROM boarding_houses WHERE id = ?', [houseId]);
        if (house.length === 0) {
            return res.status(404).json({ success: false, message: 'Record not found.' });
        }
        const owner_id = house[0].owner_id;
        const isNewApplication = house[0].house_status === 'pending';

        if (isNewApplication) {
            await connection.query(
                `UPDATE boarding_houses
                 SET house_status = 'rejected', is_resubmission = 1, document_update_pending = 0, admin_comments = ?
                 WHERE id = ?`,
                [admin_comments, houseId]
            );
            await connection.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [owner_id, `NOTICE: Your application for "${house[0].name}" was REJECTED by SASO. Reason: ${admin_comments}`]);
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

            await connection.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [owner_id, `ALERT: Your resubmitted document for "${house[0].name}" was not approved by SASO. Reason: ${admin_comments}. ${statusNote}`]);
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


// ===================================================================
// 11. Custom criteria actions (Guarded from modification of global defaults)
// ===================================================================

router.post('/criteria/add', authenticateToken, verifyAdmin, async (req, res) => {
    const { label, house_id } = req.body;
    const connection = await pool.getConnection();

    console.log(`[CRITERIA ADD] Received => label: "${label}", house_id: ${house_id} (type: ${typeof house_id})`);

    try {
        await connection.beginTransaction();

        // 1. Validate that house_id actually references a real boarding house
        if (house_id) {
            const parsedHouseId = parseInt(house_id);
            if (isNaN(parsedHouseId) || parsedHouseId <= 0) {
                await connection.rollback();
                console.error(`[CRITERIA ADD] REJECTED — house_id "${house_id}" is not a valid integer.`);
                return res.status(400).json({ success: false, message: 'Invalid boarding house ID provided.' });
            }

            const [houseCheck] = await connection.query(
                'SELECT id FROM boarding_houses WHERE id = ?',
                [parsedHouseId]
            );
            if (houseCheck.length === 0) {
                await connection.rollback();
                console.error(`[CRITERIA ADD] REJECTED — No boarding house found with id=${parsedHouseId}. Orphan insert blocked.`);
                return res.status(400).json({ success: false, message: 'Referenced boarding house does not exist.' });
            }
        }

        // 2. Insert the new checklist criteria
        const [result] = await connection.query(
            'INSERT INTO checklist_criteria (label, house_id) VALUES (?, ?)',
            [label, house_id ? parseInt(house_id) : null]
        );
        const newCriteriaId = result.insertId;
        console.log(`[CRITERIA ADD] Inserted criteria id=${newCriteriaId} for house_id=${house_id || 'GLOBAL'}`);

        // 3. If it is a house-specific dynamic criteria, notify the landlord
        if (house_id) {
            const [houseRows] = await connection.query(
                'SELECT owner_id, name FROM boarding_houses WHERE id = ?',
                [parseInt(house_id)]
            );

            if (houseRows.length > 0) {
                const house = houseRows[0];
                const message = `ALERT: SASO Admin has added a new custom requirement: "${label}" for your property "${house.name}". Please upload the required file evidence.`;

                await connection.query(
                    'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                    [house.owner_id, message]
                );
                console.log(`[CRITERIA ADD] Notification dispatched => owner_id=${house.owner_id}, house="${house.name}"`);
            } else {
                console.warn(`[CRITERIA ADD] WARNING — No house owner found for house_id=${house_id}. No notification sent.`);
            }
        }

        await connection.commit();
        res.json({ success: true, criteriaId: newCriteriaId });
    } catch (err) {
        await connection.rollback();
        console.error('[CRITERIA ADD] Transaction Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to add criteria.' });
    } finally {
        connection.release();
    }
});

router.post('/criteria/update/:id', authenticateToken, verifyAdmin, async (req, res) => {
    const criteriaId = req.params.id;
    const { label } = req.body;
    const connection = await pool.getConnection();

    console.log(`[CRITERIA UPDATE] Received => criteria_id: ${criteriaId}, new label: "${label}"`);

    try {
        await connection.beginTransaction();

        // 1. Verify existence and make sure it is not a locked institutional/global document
        const [criteriaRows] = await connection.query(
            'SELECT house_id, label FROM checklist_criteria WHERE id = ?',
            [criteriaId]
        );
        if (criteriaRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Criteria record not found.' });
        }
        if (criteriaRows[0].house_id === null) {
            return res.status(400).json({ success: false, message: 'Institutional items locked.' });
        }

        console.log(`[CRITERIA UPDATE] Confirmed => house_id=${criteriaRows[0].house_id}, old label="${criteriaRows[0].label}"`);

        // 2. Perform label update
        await connection.query(
            'UPDATE checklist_criteria SET label = ? WHERE id = ?',
            [label, criteriaId]
        );

        // 3. Notify the owner of the change
        const [houseRows] = await connection.query(
            'SELECT owner_id, name FROM boarding_houses WHERE id = ?',
            [criteriaRows[0].house_id]
        );

        if (houseRows.length > 0) {
            const house = houseRows[0];
            const message = `WARNING: SASO Admin has updated the requirement "${criteriaRows[0].label}" to: "${label}" for your property "${house.name}". Please verify your uploaded file remains accurate.`;

            await connection.query(
                'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [house.owner_id, message]
            );
            console.log(`[CRITERIA UPDATE] Notification dispatched => owner_id=${house.owner_id}, house="${house.name}"`);
        } else {
            console.warn(`[CRITERIA UPDATE] WARNING — No house found for house_id=${criteriaRows[0].house_id}. No notification sent.`);
        }

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        console.error('[CRITERIA UPDATE] Transaction Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to update criteria.' });
    } finally {
        connection.release();
    }
});

router.post('/criteria/delete/:id', authenticateToken, verifyAdmin, async (req, res) => {
    const criteriaId = req.params.id;
    const connection = await pool.getConnection();

    console.log(`[CRITERIA DELETE] Received => criteria_id: ${criteriaId}`);

    try {
        await connection.beginTransaction();

        // 1. Verify eligibility (must not be an institutional requirement)
        const [criteriaRows] = await connection.query(
            'SELECT house_id, label FROM checklist_criteria WHERE id = ?',
            [criteriaId]
        );
        if (criteriaRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Criteria record not found.' });
        }
        if (criteriaRows[0].house_id === null) {
            return res.status(400).json({ success: false, message: 'Institutional items locked.' });
        }

        console.log(`[CRITERIA DELETE] Confirmed => house_id=${criteriaRows[0].house_id}, label="${criteriaRows[0].label}"`);

        // 2. Delete criteria from table
        await connection.query(
            'DELETE FROM checklist_criteria WHERE id = ?',
            [criteriaId]
        );

        // 3. Notify the owner
        const [houseRows] = await connection.query(
            'SELECT owner_id, name FROM boarding_houses WHERE id = ?',
            [criteriaRows[0].house_id]
        );

        if (houseRows.length > 0) {
            const house = houseRows[0];
            const message = `ALERT: SASO Admin has removed the custom requirement: "${criteriaRows[0].label}" for your property "${house.name}".`;

            await connection.query(
                'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [house.owner_id, message]
            );
            console.log(`[CRITERIA DELETE] Notification dispatched => owner_id=${house.owner_id}, house="${house.name}"`);
        } else {
            console.warn(`[CRITERIA DELETE] WARNING — No house found for house_id=${criteriaRows[0].house_id}. No notification sent.`);
        }

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        console.error('[CRITERIA DELETE] Transaction Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to remove criteria.' });
    } finally {
        connection.release();
    }
});

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
router.post('/users/update/:id', authenticateToken, verifyAdmin, async (req, res) => {
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
router.post('/users/reset-password/:id', authenticateToken, verifyAdmin, async (req, res) => {
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
router.post('/users/toggle-status/:id', authenticateToken, verifyAdmin, async (req, res) => {
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
                bh.house_status,
                u.name AS owner_name,
                u.phone AS owner_phone,
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
                      AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())
                ) AS current_occupants,
                (
                    SELECT COUNT(DISTINCT o.student_id)
                    FROM occupants o
                    INNER JOIN rooms ro ON o.room_id = ro.id
                    INNER JOIN users su ON o.student_id = su.id
                    WHERE ro.house_id = bh.id
                      AND o.is_non_cspc = 0
                      AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())
                      AND LOWER(su.sex) = 'male'
                ) AS male_count,
                (
                    SELECT COUNT(DISTINCT o.student_id)
                    FROM occupants o
                    INNER JOIN rooms ro ON o.room_id = ro.id
                    INNER JOIN users su ON o.student_id = su.id
                    WHERE ro.house_id = bh.id
                      AND o.is_non_cspc = 0
                      AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())
                      AND LOWER(su.sex) = 'female'
                ) AS female_count
            FROM boarding_houses bh
            LEFT JOIN users u ON bh.owner_id = u.id
            LEFT JOIN rooms r ON bh.id = r.house_id
            WHERE bh.house_status = 'accredited'
            GROUP BY bh.id, bh.name, bh.location, bh.house_status, u.name, u.phone
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
        await autoBackfillBarangays();
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
            "bh.house_status IN ('accredited', 'archived')"
        ];
        let queryParams = [];

        if (barangay && barangay.trim() !== '' && barangay.toLowerCase() !== 'all') {
            const cleanBarangay = barangay.trim();
            whereClauses.push('(bh.barangay = ? OR (bh.barangay IS NULL AND bh.location LIKE ?))');
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
