import express from 'express';
import multer from 'multer';
import path from 'path';
import pool from '../config/db.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

// Helper middleware to strictly lock down routes to property owners
const verifyOwner = (req, res, next) => {
    if (req.user && req.user.role === 'owner') return next();
    return res.status(403).json({ success: false, message: 'Access denied.' });
};

// Multer Storage Configuration for Owner Media Files (Interior uploads & Profile pictures)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const uploadOwnerMedia = upload.fields([
    { name: 'img', maxCount: 1 },
    { name: 'img_1', maxCount: 1 },
    { name: 'img_2', maxCount: 1 },
    { name: 'img_3', maxCount: 1 }
]);

// Self-healing database sanitizer: Guarantees clean, single-serialized JSON strings
const sanitizeJSONInput = (val) => {
    if (!val) return '[]';
    if (typeof val === 'string') {
        try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) return val; // Already a valid JSON array string
        } catch (e) { }
        return JSON.stringify([val]);
    }
    if (Array.isArray(val)) {
        return JSON.stringify(val);
    }
    return '[]';
};

// =========================================================================
// OWNER PERSONAL PROFILE ENDPOINTS (GET & POST)
// =========================================================================

// A. GET - Retrieve active Owner profile records
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, email, role, name, phone, address, profile_pic FROM users WHERE id = ?',
            [req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Owner profile not found.' });
        }

        res.json({ success: true, user: rows[0] });
    } catch (err) {
        console.error('Fetch Profile Error:', err.message);
        res.status(500).json({ success: false, message: 'Database failed to retrieve profile.' });
    }
});

// Reuseable profile updates handler
const updateProfileHandler = async (req, res) => {
    try {
        const { name, phone, address } = req.body;

        // Fetch existing picture path to preserve if no new file is being uploaded
        const [existing] = await pool.query('SELECT profile_pic FROM users WHERE id = ?', [req.user.id]);
        let profilePicFilename = existing.length > 0 ? existing[0].profile_pic : null;

        if (req.file) {
            profilePicFilename = req.file.filename;
        }

        await pool.query(
            'UPDATE users SET name = ?, phone = ?, address = ?, profile_pic = ? WHERE id = ?',
            [name, phone, address || '', profilePicFilename, req.user.id]
        );

        res.json({ success: true, message: 'Profile updated successfully.' });
    } catch (err) {
        console.error('Update Profile Error:', err.message);
        res.status(500).json({ success: false, message: 'Database failed to save profile changes.' });
    }
};

// Map both endpoints to the same handler to prevent frontend routing breaks
router.post('/profile', authenticateToken, upload.single('profile_pic'), updateProfileHandler);
router.post('/update-profile', authenticateToken, upload.single('profile_pic'), updateProfileHandler);

// =========================================================================
// OWNER DASHBOARD & STATISTICS ENDPOINT
// =========================================================================

// GET - Retrieve Owner Dashboard Statistics
router.get('/dashboard', authenticateToken, verifyOwner, async (req, res) => {
    try {
        const [houseRows] = await pool.query(
            `SELECT bh.*, bh.compliance_status AS compliance,
                    (SELECT COUNT(*) FROM bookings WHERE house_id = bh.id AND status = 'pending') AS pending_count
             FROM boarding_houses bh
             WHERE bh.owner_id = ?`,
            [req.user.id]
        );

        if (houseRows.length === 0) {
            return res.json({ success: true, hasProperty: false, houses: [], stats: { totalListings: 0, pendingBookings: 0 } });
        }

        const totalListings = houseRows.length;
        const pendingBookings = houseRows.reduce((sum, h) => sum + h.pending_count, 0);

        res.json({
            success: true,
            hasProperty: true,
            houses: houseRows,
            stats: {
                totalListings,
                pendingBookings
            }
        });
    } catch (err) {
        console.error('Owner Dashboard Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to load owner dashboard statistics.' });
    }
});

// =========================================================================
// ACCREDITATION EDIT HOUSES ENDPOINTS
// =========================================================================

// C. GET - Retrieve Boarding House details for Editing
router.get('/edit/:id', authenticateToken, verifyOwner, async (req, res) => {
    try {
        const [houseRows] = await pool.query(
            'SELECT * FROM boarding_houses WHERE id = ? AND owner_id = ?',
            [req.params.id, req.user.id]
        );

        if (houseRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Boarding house record not found.' });
        }

        res.json({
            success: true,
            house: houseRows[0],
            googleMapsApiKey: process.env.VITE_GOOGLE_MAPS_API_KEY || ''
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// D. POST - Save Edited Boarding House details
router.post('/edit/:id', authenticateToken, verifyOwner, uploadOwnerMedia, async (req, res) => {
    try {
        const {
            house_name, location, price, contact_number, map_link, description,
            latitude, longitude, advance_months, deposit_months, deposit_type,
            existing_img, existing_img_1, existing_img_2, existing_img_3,
            amenities_free, amenities_paid // ◄── Read directly as clean JSON strings
        } = req.body;

        const img = (req.files && req.files['img']) ? req.files['img'][0].filename : existing_img;
        const img_1 = (req.files && req.files['img_1']) ? req.files['img_1'][0].filename : existing_img_1;
        const img_2 = (req.files && req.files['img_2']) ? req.files['img_2'][0].filename : existing_img_2;
        const img_3 = (req.files && req.files['img_3']) ? req.files['img_3'][0].filename : existing_img_3;

        // Sanitize amenities arrays safely into JSON strings
        const sanitizedFree = sanitizeJSONInput(amenities_free);
        const sanitizedPaid = sanitizeJSONInput(amenities_paid);

        const extractBarangay = (loc, barInput) => {
            if (barInput && barInput.trim()) return barInput.trim();
            if (!loc) return null;
            const known = ['San Antonio', 'San Esteban', 'San Isidro', 'San Juan', 'San Luis', 'San Miguel', 'San Nicolas', 'San Roque'];
            return known.find(b => loc.toLowerCase().includes(b.toLowerCase())) || null;
        };
        const computedBarangay = extractBarangay(location, req.body.barangay);

        await pool.query(
            `UPDATE boarding_houses 
             SET name = ?, img = ?, img_1 = ?, img_2 = ?, img_3 = ?, location = ?, barangay = ?, map_link = ?, price = ?, phone_contact = ?, description = ?,
                 latitude = ?, longitude = ?, advance_months = ?, deposit_months = ?, deposit_type = ?,
                 amenities_free = ?, amenities_paid = ?
             WHERE id = ? AND owner_id = ?`,
            [
                house_name, img, img_1, img_2, img_3, location, computedBarangay, map_link, parseFloat(price) || 0, contact_number, description || '',
                latitude ? parseFloat(latitude) : null, longitude ? parseFloat(longitude) : null,
                parseInt(advance_months) || 0, parseInt(deposit_months) || 0, deposit_type || 'refundable',
                sanitizedFree, sanitizedPaid,
                req.params.id, req.user.id
            ]
        );

        res.json({ success: true, message: 'Property details updated successfully.' });
    } catch (err) {
        console.error('Update details error:', err.message);
        res.status(500).json({ success: false, message: 'Database failed to save updates.' });
    }
});

// =========================================================================
// ROOMS AND OCCUPANTS MANAGEMENT ENDPOINTS
// =========================================================================

// E. GET - Retrieve Rooms belong to a specific Boarding House (Excludes today's checked out occupants)
router.get('/rooms/:houseId', authenticateToken, verifyOwner, async (req, res) => {
    try {
        const [houseRows] = await pool.query(
            'SELECT id, name FROM boarding_houses WHERE id = ? AND owner_id = ?',
            [req.params.houseId, req.user.id]
        );

        if (houseRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Boarding house record not found.' });
        }

        const [rooms] = await pool.query(
            `SELECT r.*, 
                (SELECT COUNT(*) FROM occupants o WHERE o.room_id = r.id AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())) AS occupant_count
             FROM rooms r
             WHERE r.house_id = ?`,
            [req.params.houseId]
        );

        res.json({ success: true, house: houseRows[0], rooms });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// F. POST - Add a new room
router.post('/rooms/add/:houseId', authenticateToken, verifyOwner, async (req, res) => {
    try {
        const { room_number, gender_type, capacity } = req.body;

        const [houseRows] = await pool.query(
            'SELECT price FROM boarding_houses WHERE id = ? AND owner_id = ?',
            [req.params.houseId, req.user.id]
        );

        if (houseRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Unauthorized action.' });
        }

        const basePrice = houseRows[0].price || 0;

        await pool.query(
            'INSERT INTO rooms (house_id, room_number, gender_type, capacity, price, status) VALUES (?, ?, ?, ?, ?, "available")',
            [req.params.houseId, room_number, gender_type || 'female', parseInt(capacity) || 1, basePrice]
        );

        res.json({ success: true, message: 'Room created successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// G. GET - Retrieve individual room details, active occupants, and pending reservations
router.get('/rooms/details/:roomId', authenticateToken, verifyOwner, async (req, res) => {
    try {
        const [roomRows] = await pool.query(
            `SELECT r.*, bh.price as house_price, bh.advance_months, bh.deposit_months, bh.deposit_type, bh.id as house_id
             FROM rooms r
             JOIN boarding_houses bh ON r.house_id = bh.id
             WHERE r.id = ? AND bh.owner_id = ?`,
            [req.params.roomId, req.user.id]
        );

        if (roomRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Room not found.' });
        }

        const [occupants] = await pool.query(
            `SELECT o.*, bh.advance_months, bh.deposit_months, bh.deposit_type
             FROM occupants o
             JOIN rooms r ON o.room_id = r.id
             JOIN boarding_houses bh ON r.house_id = bh.id
             WHERE o.room_id = ? AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())`,
            [req.params.roomId]
        );

        const [pendingBookings] = await pool.query(
            `SELECT b.*, u.name as student_name, u.phone as contact_number, u.profile_pic
             FROM bookings b
             JOIN users u ON b.student_id = u.id
             WHERE b.room_id = ? AND b.status = 'pending'`,
            [req.params.roomId]
        );

        res.json({ success: true, room: roomRows[0], occupants, pendingBookings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// H. POST - Manually add a non-CSPC occupant
router.post('/rooms/occupants/add/:roomId', authenticateToken, verifyOwner, async (req, res) => {
    try {
        const { roomId } = req.params;
        const { name, age, contact_number, check_in_date, months, emergency_contact, guardian_name, payment_status, address } = req.body;

        const [roomRows] = await pool.query(
            `SELECT r.*, 
                (SELECT COUNT(*) FROM occupants o WHERE o.room_id = r.id AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())) AS current_count
             FROM rooms r
             JOIN boarding_houses bh ON r.house_id = bh.id
             WHERE r.id = ? AND bh.owner_id = ?`,
            [roomId, req.user.id]
        );

        if (roomRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Room configuration mismatch.' });
        }

        const targetRoom = roomRows[0];
        if (targetRoom.current_count >= targetRoom.capacity) {
            return res.status(400).json({ success: false, message: 'Room has reached maximum occupant capacity.' });
        }

        const checkIn = check_in_date || new Date().toISOString().split('T')[0];
        const monthlyRent = parseFloat(targetRoom.price || 0);
        const totalAmount = monthlyRent * (parseInt(months) || 1);

        await pool.query(
            `INSERT INTO occupants (
                room_id, student_id, reference_no, name, age, address, 
                contact_number, emergency_contact, guardian_name, check_in_date, 
                months, amount, payment_status, is_non_cspc
            ) VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
                roomId, name, parseInt(age) || null, address || '',
                contact_number || '', emergency_contact || '', guardian_name || '',
                checkIn, parseInt(months) || 1, totalAmount, payment_status || 'Not Paid'
            ]
        );

        res.json({ success: true, message: 'Manual non-CSPC boarder added.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// I. POST - Toggle occupant payment status (Transaction-safe: Syncs with bookings)
router.post('/rooms/occupants/payment/:id', authenticateToken, verifyOwner, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { status } = req.body;
        const targetStatus = status || 'Paid';

        // 1. Update the occupant's payment status in occupants table
        await connection.query(
            'UPDATE occupants SET payment_status = ? WHERE id = ?',
            [targetStatus, req.params.id]
        );

        // 2. Fetch occupant details to identify student_id and room_id
        const [occupantRows] = await connection.query(
            'SELECT student_id, room_id FROM occupants WHERE id = ?',
            [req.params.id]
        );

        if (occupantRows.length > 0 && occupantRows[0].student_id) {
            const { student_id, room_id } = occupantRows[0];
            const bookingStatus = targetStatus.toLowerCase() === 'paid' ? 'paid' : 'unpaid';

            // 3. Synchronize status with the active booking record
            await connection.query(
                `UPDATE bookings SET payment_status = ? 
                 WHERE student_id = ? AND room_id = ? AND status = 'confirmed'`,
                [bookingStatus, student_id, room_id]
            );
        }

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        console.error('[OCCUPANT PAYMENT SYNC ERROR]:', err.message);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        connection.release();
    }
});

// J. POST - Checkout boarder (Transaction-safe: notifies student on check-out)
router.post('/rooms/occupants/checkout/:id', authenticateToken, verifyOwner, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Pre-fetch occupant record + linked boarding house name before mutating
        const [occupantRows] = await connection.query(
            `SELECT o.student_id, o.room_id, bh.name AS house_name
             FROM occupants o
             JOIN rooms r ON o.room_id = r.id
             JOIN boarding_houses bh ON r.house_id = bh.id
             WHERE o.id = ? AND bh.owner_id = ?`,
            [req.params.id, req.user.id]
        );

        if (occupantRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Occupant record not found or access denied.' });
        }

        const { student_id, room_id, house_name } = occupantRows[0];

        // 2. Set check_out_date to today
        await connection.query(
            'UPDATE occupants SET check_out_date = CURDATE() WHERE id = ?',
            [req.params.id]
        );

        // 3. Mark the corresponding confirmed booking as 'completed' so the student's
        //    booking list reflects the checked-out status in real-time
        if (student_id) {
            await connection.query(
                `UPDATE bookings SET status = 'completed'
                 WHERE student_id = ? AND room_id = ? AND status = 'confirmed'`,
                [student_id, room_id]
            );

            // 4. Notify the student via the notifications inbox
            await connection.query(
                'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [
                    student_id,
                    `NOTICE: Your residency at "${house_name}" has been checked out by the property owner/administrator. We hope you had a comfortable stay.`
                ]
            );
            console.log(`[CHECKOUT] Notification dispatched => student_id=${student_id}, house="${house_name}"`);
        } else {
            // Non-CSPC occupant — no student account to notify
            console.log(`[CHECKOUT] Non-CSPC boarder checked out from room_id=${room_id}. No notification sent.`);
        }

        await connection.commit();
        res.json({ success: true, message: 'Boarder successfully checked out.' });
    } catch (err) {
        await connection.rollback();
        console.error('[CHECKOUT] Transaction Error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        connection.release();
    }
});

// =========================================================================
// RESERVATIONS AND BOOKINGS MANAGEMENT ENDPOINTS
// =========================================================================

// K. GET - Retrieve Bookings List
router.get('/bookings', authenticateToken, verifyOwner, async (req, res) => {
    try {
        const { houseId } = req.query;
        let query = `
            SELECT b.*, u.name as student_name, u.phone as contact_number, u.profile_pic, u.address, u.guardian_name,
                   r.room_number, r.gender_type as room_gender,
                   bh.name as house_name, bh.location as house_location, bh.advance_months, bh.deposit_months, bh.deposit_type
            FROM bookings b
            JOIN users u ON b.student_id = u.id
            JOIN rooms r ON b.room_id = r.id
            JOIN boarding_houses bh ON r.house_id = bh.id
            WHERE bh.owner_id = ?
        `;
        const params = [req.user.id];

        if (houseId) {
            query += ' AND bh.id = ?';
            params.push(houseId);
        }

        query += ' ORDER BY b.booking_date DESC';

        const [bookings] = await pool.query(query, params);

        const processedBookings = bookings.map(b => {
            const advM = parseInt(b.advance_months || 0);
            const depM = parseInt(b.deposit_months || 0);
            const rent = parseFloat(b.monthly_rent || 0);
            const initial_payment = (advM * rent) + (depM * rent);

            return {
                ...b,
                initial_payment
            };
        });

        const houseName = processedBookings.length > 0 && houseId ? processedBookings[0].house_name : '';

        res.json({ success: true, bookings: processedBookings, houseName });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// L (POST /bookings/approve/:id)
router.post('/bookings/approve/:id', authenticateToken, verifyOwner, async (req, res) => {
    const bookingId = req.params.id;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [bookingRows] = await connection.query(
            `SELECT b.*, u.name as student_name, u.age, u.address, u.phone, u.emergency_contact, u.guardian_name,
                    bh.advance_months, bh.deposit_months, bh.deposit_type
             FROM bookings b
             JOIN users u ON b.student_id = u.id
             JOIN rooms r ON b.room_id = r.id
             JOIN boarding_houses bh ON r.house_id = bh.id
             WHERE b.id = ?`,
            [bookingId]
        );

        if (bookingRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Reservation request record not found.' });
        }

        const b = bookingRows[0];

        const [capacityRows] = await connection.query(
            `SELECT r.capacity, 
                (SELECT COUNT(*) FROM occupants o WHERE o.room_id = r.id AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())) AS current_count
             FROM rooms r WHERE r.id = ?`,
            [b.room_id]
        );

        const roomConfig = capacityRows[0];
        if (roomConfig.current_count >= roomConfig.capacity) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'The target room has reached full capacity.', errorCode: 'capacity_full' });
        }

        // 1. Confirm the booking status
        await connection.query(
            'UPDATE bookings SET status = "confirmed" WHERE id = ?',
            [bookingId]
        );

        // 2. ─── CONDITIONAL OCCUPANCY SEPARATION ───
        // Only insert the occupant immediately if they are paying via Cash.
        // If paying via PayMongo, the occupant is created only AFTER successful payment verification.
        if (b.payment_method === 'cash') {
            const refNo = `REF-${bookingId.toString().padStart(4, '0')}`;
            const checkIn = b.check_in_date || new Date().toISOString().split('T')[0];

            await connection.query(
                `INSERT INTO occupants (
                    room_id, student_id, reference_no, name, age, address, 
                    contact_number, emergency_contact, guardian_name, check_in_date, 
                    months, amount, payment_status, is_non_cspc
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Not Paid', 0)`,
                [
                    b.room_id, b.student_id, refNo, b.student_name, b.age, b.address,
                    b.phone, b.emergency_contact, b.guardian_name, checkIn,
                    b.months, b.amount
                ]
            );
        }

        // 3. Dispatch the appropriate notification
        const notificationMsg = b.payment_method === 'paymongo'
            ? `RESERVATION APPROVED: Your booking request has been approved! Please complete your online payment to secure your room.`
            : `RESERVATION APPROVED: Your booking request has been confirmed! Please make arrangements to check-in.`;

        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [b.student_id, notificationMsg]
        );

        await connection.commit();
        res.json({ success: true, message: 'Reservation request successfully approved.' });
    } catch (err) {
        await connection.rollback();
        console.error('Booking approval error:', err.message);
        res.status(500).json({ success: false, message: 'Transaction rolled back. Failed to process approval.' });
    } finally {
        connection.release();
    }
});

// M. POST - Reject Student Reservation Booking Request
router.post('/bookings/reject/:id', authenticateToken, verifyOwner, async (req, res) => {
    try {
        const [bookingRows] = await pool.query('SELECT student_id, id FROM bookings WHERE id = ?', [req.params.id]);
        if (bookingRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Record not found.' });
        }

        await pool.query('UPDATE bookings SET status = "rejected" WHERE id = ?', [req.params.id]);

        await pool.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [bookingRows[0].student_id, `RESERVATION UPDATE: Your booking request REF-${bookingRows[0].id.toString().padStart(4, '0')} was not approved by the landlord.`]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// N. POST - Approve Stay Extension
router.post('/bookings/approve-extension/:id', authenticateToken, verifyOwner, async (req, res) => {
    const bookingId = req.params.id;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [booking] = await connection.query('SELECT * FROM bookings WHERE id = ?', [bookingId]);
        if (booking.length === 0) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        const b = booking[0];
        const extraMonths = b.extension_months || 0;
        const newTotalMonths = b.months + extraMonths;
        const rentRate = parseFloat(b.monthly_rent || 0);
        const addedCost = rentRate * extraMonths;
        const newTotalAmount = parseFloat(b.amount) + addedCost;

        await connection.query(
            `UPDATE bookings 
             SET months = ?, amount = ?, is_extension_requested = 0, extension_months = 0 
             WHERE id = ?`,
            [newTotalMonths, newTotalAmount, bookingId]
        );

        await connection.query(
            `UPDATE occupants 
             SET months = ?, amount = ? 
             WHERE student_id = ? AND room_id = ? AND check_out_date IS NULL`,
            [newTotalMonths, newTotalAmount, b.student_id, b.room_id]
        );

        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [b.student_id, `EXTENSION APPROVED: Your stay extension request of +${extraMonths} months has been approved.`]
        );

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        connection.release();
    }
});

// O. POST - Reject Stay Extension
router.post('/bookings/reject-extension/:id', authenticateToken, verifyOwner, async (req, res) => {
    try {
        const [booking] = await pool.query('SELECT student_id FROM bookings WHERE id = ?', [req.params.id]);
        if (booking.length === 0) {
            return res.status(404).json({ success: false, message: 'Record not found.' });
        }

        await pool.query(
            'UPDATE bookings SET is_extension_requested = 0, extension_months = 0 WHERE id = ?',
            [req.params.id]
        );

        await pool.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [booking[0].student_id, 'EXTENSION UPDATE: Your stay extension request was declined by the landlord.']
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// P. POST - Update booking billing status directly (Transaction-safe: Syncs with occupants)
router.post('/bookings/payment/:id', authenticateToken, verifyOwner, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { status } = req.body;
        const targetStatus = status || 'paid';

        // 1. Update the booking's payment status in bookings table
        await connection.query(
            'UPDATE bookings SET payment_status = ? WHERE id = ?',
            [targetStatus, req.params.id]
        );

        // 2. Fetch booking details to identify student_id and room_id
        const [bookingRows] = await connection.query(
            'SELECT student_id, room_id FROM bookings WHERE id = ?',
            [req.params.id]
        );

        if (bookingRows.length > 0 && bookingRows[0].student_id) {
            const { student_id, room_id } = bookingRows[0];
            const occupantStatus = targetStatus.toLowerCase() === 'paid' ? 'Paid' : 'Not Paid';

            // 3. Synchronize status with the active occupant record
            await connection.query(
                `UPDATE occupants SET payment_status = ? 
                 WHERE student_id = ? AND room_id = ? AND check_out_date IS NULL`,
                [occupantStatus, student_id, room_id]
            );
        }

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        console.error('[BOOKING PAYMENT SYNC ERROR]:', err.message);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        connection.release();
    }
});

export default router;