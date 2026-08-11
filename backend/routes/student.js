import express from 'express';
import multer from 'multer';
import path from 'path';
import pool from '../config/db.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

// 1. Configure Multer Storage for Uploaded Profile Pictures
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Limit size to 5MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp/;
        const isValidExt = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const isValidMime = allowedTypes.test(file.mimetype);
        if (isValidExt && isValidMime) {
            cb(null, true);
        } else {
            cb(new Error('Only JPG, JPEG, PNG, and WEBP images are allowed.'));
        }
    }
});

// 2. [GET] - Retrieve Active Student Profile
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        res.json({ success: true, user: rows[0] });
    } catch (err) {
        console.error('Fetch Profile Error:', err.message);
        res.status(500).json({ success: false, message: 'Database error fetching profile.' });
    }
});

// 3. [POST] - Update Student Profile
router.post('/update-profile', authenticateToken, upload.single('profile_pic'), async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            student_id, sex, course, year_section,
            dob, age, address, phone, emergency_contact, guardian_name
        } = req.body;

        let profilePicPath = req.body.existing_profile_pic || null;
        if (req.file) {
            profilePicPath = req.file.filename;
        }

        await pool.query(
            `UPDATE users SET 
                student_id = ?, sex = ?, course = ?, year_section = ?, 
                dob = ?, age = ?, address = ?, phone = ?, 
                emergency_contact = ?, guardian_name = ?, profile_pic = ?
            WHERE id = ?`,
            [
                student_id || null, sex || null, course || null, year_section || null,
                dob ? new Date(dob) : null, age ? parseInt(age) : null, address || null, phone || null,
                emergency_contact || null, guardian_name || null, profilePicPath,
                userId
            ]
        );

        res.json({
            success: true,
            message: 'Profile updated successfully!',
            profile_pic: profilePicPath
        });

    } catch (err) {
        console.error('Update Profile Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to update database profile.' });
    }
});

// =========================================================================
// STUDENT HOUSES DIRECTORY ENDPOINTS 
// =========================================================================

// 4. [GET] - Retrieve all accredited boarding houses for student browsing
router.get('/houses', async (req, res) => {
    try {
        const [houses] = await pool.query(`
            SELECT bh.*,
                   (SELECT AVG(rating) FROM reviews WHERE house_id = bh.id) AS avg_rating,
                   (SELECT COUNT(*) FROM reviews WHERE house_id = bh.id) AS review_count,
                   (SELECT COUNT(*) FROM rooms WHERE house_id = bh.id) AS room_count
            FROM boarding_houses bh
            WHERE bh.house_status = 'accredited'
            ORDER BY bh.created_at DESC
        `);

        res.json({ success: true, houses });
    } catch (err) {
        console.error('Fetch student houses failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to retrieve boarding house directory.' });
    }
});

// 5. [GET] - Retrieve single house details, student reviews, rating average, and rooms list
router.get('/house/:id', async (req, res) => {
    try {
        const houseId = req.params.id;

        const [houseRows] = await pool.query(`
            SELECT bh.*, u.name as owner_name, u.email as owner_email
            FROM boarding_houses bh
            JOIN users u ON bh.owner_id = u.id
            WHERE bh.id = ? AND bh.house_status = 'accredited'
        `, [houseId]);

        if (houseRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Accredited boarding house not found.' });
        }

        const [reviews] = await pool.query(`
            SELECT r.*, u.name as student_name, u.profile_pic
            FROM reviews r
            JOIN users u ON r.student_id = u.id
            WHERE r.house_id = ?
            ORDER BY r.created_at DESC
        `, [houseId]);

        const [avgRows] = await pool.query(`
            SELECT AVG(rating) as avg_rating FROM reviews WHERE house_id = ?
        `, [houseId]);

        const avgRating = avgRows[0] && avgRows[0].avg_rating ? parseFloat(Number(avgRows[0].avg_rating).toFixed(1)) : 0;

        const [rooms] = await pool.query(`
            SELECT r.*,
                   (SELECT COUNT(*) FROM occupants o WHERE o.room_id = r.id AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())) AS occupant_count
            FROM rooms r
            WHERE r.house_id = ?
        `, [houseId]);

        res.json({
            success: true,
            house: houseRows[0],
            reviews,
            avgRating,
            rooms,
            googleMapsApiKey: process.env.VITE_GOOGLE_MAPS_API_KEY || ''
        });
    } catch (err) {
        console.error('Fetch boarding house details failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to load boarding house details.' });
    }
});

// 6. [POST] - Submit a student rating and text review (Rigorously guarded)
router.post('/review/:id', authenticateToken, async (req, res) => {
    try {
        const houseId = req.params.id;
        const studentId = req.user.id;
        const { rating, comment } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: 'Star rating must be between 1 and 5.' });
        }

        const [occupantRows] = await pool.query(`
            SELECT id FROM occupants 
            WHERE student_id = ? AND room_id IN (SELECT id FROM rooms WHERE house_id = ?)
        `, [studentId, houseId]);

        const [bookingRows] = await pool.query(`
            SELECT id FROM bookings 
            WHERE student_id = ? AND house_id = ? AND status = 'confirmed'
        `, [studentId, houseId]);

        if (occupantRows.length === 0 && bookingRows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'To keep review scores authentic, you can only review properties where you have historically booked or resided.'
            });
        }

        await pool.query(
            'INSERT INTO reviews (house_id, student_id, rating, comment) VALUES (?, ?, ?, ?)',
            [houseId, studentId, parseInt(rating), comment || '']
        );

        res.json({ success: true, message: 'Review submitted successfully!' });
    } catch (err) {
        console.error('Submit review failed:', err.message);
        res.status(500).json({ success: false, message: 'Database failed to save review.' });
    }
});

// =========================================================================
// STUDENT RESERVATIONS AND STAY ACTIONS
// =========================================================================

// 7. [POST] - Submit a student reservation booking request (Rigorously Guarded)
router.post('/book/:houseId', authenticateToken, async (req, res) => {
    const houseId = req.params.houseId;
    const studentId = req.user.id;
    const {
        roomId, check_in_date, months, resident_name, age,
        contact_number, emergency_contact, guardian_name, address, payment_method
    } = req.body;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // --- SYSTEM GUARD 1: Prevent students checked-in somewhere else from booking duplicates ---
        const [activeOccupancy] = await connection.query(
            'SELECT id FROM occupants WHERE student_id = ? AND check_out_date IS NULL',
            [studentId]
        );
        if (activeOccupancy.length > 0) {
            return res.status(403).json({
                success: false,
                message: 'Booking blocked. You are currently checked-in as an active resident of a boarding house. You must check out before making a new reservation.'
            });
        }

        // --- SYSTEM GUARD 2: Prevent students with already approved stays from double-booking ---
        const [confirmedBookings] = await connection.query(
            "SELECT id FROM bookings WHERE student_id = ? AND status = 'confirmed'",
            [studentId]
        );
        if (confirmedBookings.length > 0) {
            return res.status(403).json({
                success: false,
                message: 'Booking blocked. You already have a confirmed stay. Please complete or cancel your active stay before booking another property.'
            });
        }

        // --- Standard checks ---
        const [roomRows] = await connection.query(
            'SELECT * FROM rooms WHERE id = ? AND house_id = ?',
            [roomId, houseId]
        );
        if (roomRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Selected room not found.' });
        }

        const room = roomRows[0];

        // ─── NEW GENDER VALIDATION SYSTEM GUARD ───
        // Retrieves the student's registered sex from the users table
        const [studentRows] = await connection.query(
            'SELECT sex FROM users WHERE id = ?',
            [studentId]
        );
        const studentSex = studentRows[0]?.sex ? studentRows[0].sex.trim().toLowerCase() : null;

        if (!studentSex) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Booking blocked. Please specify your gender (sex) in your profile settings before making a reservation.'
            });
        }

        const roomGender = room.gender_type ? room.gender_type.trim().toLowerCase() : '';
        // If the room gender type is restricted and does not match the student's sex, block the booking
        if (roomGender && roomGender !== 'mixed' && roomGender !== 'unisex' && roomGender !== studentSex) {
            await connection.rollback();
            return res.status(403).json({
                success: false,
                message: `Booking blocked. This room is designated for ${room.gender_type} occupants only.`
            });
        }

        const [occupantsCountRows] = await connection.query(
            `SELECT COUNT(*) as count FROM occupants o
             WHERE o.room_id = ? AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())`,
            [roomId]
        );
        const activeOccupantsCount = occupantsCountRows[0].count || 0;
        if (activeOccupantsCount >= room.capacity) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'This room has already reached maximum capacity.' });
        }

        const [pendingBookingRows] = await connection.query(
            'SELECT id FROM bookings WHERE student_id = ? AND house_id = ? AND status = "pending"',
            [studentId, houseId]
        );
        if (pendingBookingRows.length > 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'You already have an active pending reservation request for this boarding house.' });
        }

        const monthlyRent = parseFloat(room.price || 0);
        const totalAmount = monthlyRent * (parseInt(months) || 1);

        const [houseRows] = await connection.query('SELECT owner_id, name FROM boarding_houses WHERE id = ?', [houseId]);
        const ownerId = houseRows[0].owner_id;

        const [insertResult] = await connection.query(
            `INSERT INTO bookings (
                student_id, house_id, room_id, status, resident_name, check_in_date,
                months, age, contact_number, emergency_contact, guardian_name,
                address, payment_method, payment_status, amount, monthly_rent
            ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?, ?)`,
            [
                studentId, houseId, roomId, resident_name, check_in_date,
                parseInt(months) || 1, parseInt(age) || null, contact_number, emergency_contact || null,
                guardian_name || null, address || '', payment_method || 'cash', totalAmount, monthlyRent
            ]
        );

        const refNo = `REF-${insertResult.insertId.toString().padStart(4, '0')}`;
        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [studentId, `RESERVATION SUBMITTED: Your booking request ${refNo} has been submitted! Awaiting landlord review.`]
        );
        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [ownerId, `NEW BOOKING REQUEST: A new student has requested to book Room ${room.room_number} in your property "${houseRows[0].name}" (${refNo})!`]
        );

        await connection.commit();
        res.json({ success: true, message: 'Booking request submitted successfully!', bookingId: insertResult.insertId });
    } catch (err) {
        await connection.rollback();
        console.error('Booking submission failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to process reservation booking.' });
    } finally {
        connection.release();
    }
});

// 8. [GET] - Retrieve all bookings for the logged-in student (With future-proof conditional padding join)
router.get('/bookings', authenticateToken, async (req, res) => {
    try {
        const studentId = req.user.id;
        const [bookings] = await pool.query(
            `SELECT b.*, r.room_number, r.gender_type as room_gender,
                    bh.name as house_name, bh.location as house_location, 
                    bh.advance_months, bh.deposit_months, bh.deposit_type,
                    o.check_in_date AS occupant_check_in,
                    o.check_out_date AS occupant_check_out
             FROM bookings b
             JOIN rooms r ON b.room_id = r.id
             JOIN boarding_houses bh ON b.house_id = bh.id
             LEFT JOIN occupants o ON o.reference_no = CONCAT('REF-', IF(CHAR_LENGTH(b.id) < 4, LPAD(b.id, 4, '0'), b.id))
             WHERE b.student_id = ?
             ORDER BY b.booking_date DESC`,
            [studentId]
        );

        // Map Move-in Costs safely (No deposit_fixed_amount lookup)
        const mappedBookings = bookings.map(b => {
            const advM = parseInt(b.advance_months || 0);
            const depM = parseInt(b.deposit_months || 0);
            const rent = parseFloat(b.monthly_rent || 0);
            const initial_payment = (advM * rent) + (depM * rent);

            return {
                ...b,
                initial_payment
            };
        });

        res.json({ success: true, bookings: mappedBookings });
    } catch (err) {
        console.error('Fetch student bookings failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to retrieve bookings.' });
    }
});


// 9. [POST] - Cancel student pending booking
router.post('/bookings/cancel/:id', authenticateToken, async (req, res) => {
    try {
        const [booking] = await pool.query(
            'SELECT b.*, bh.owner_id, bh.name as house_name FROM bookings b JOIN boarding_houses bh ON b.house_id = bh.id WHERE b.id = ? AND b.student_id = ?',
            [req.params.id, req.user.id]
        );

        if (booking.length === 0) {
            return res.status(404).json({ success: false, message: 'Reservation not found.' });
        }

        await pool.query(
            'UPDATE bookings SET status = "cancelled" WHERE id = ?',
            [req.params.id]
        );

        const refNo = `REF-${req.params.id.toString().padStart(4, '0')}`;
        // Notify owner
        await pool.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [booking[0].owner_id, `RESERVATION CANCELLED: A student has cancelled their pending reservation request for your property "${booking[0].house_name}" (${refNo}).`]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Cancel booking failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to cancel reservation.' });
    }
});

// 10. [POST] - Request stay extension
router.post('/bookings/extend/:id', authenticateToken, async (req, res) => {
    try {
        const { extension_months } = req.body;
        const [booking] = await pool.query(
            'SELECT b.*, bh.owner_id, bh.name as house_name FROM bookings b JOIN boarding_houses bh ON b.house_id = bh.id WHERE b.id = ? AND b.student_id = ?',
            [req.params.id, req.user.id]
        );

        if (booking.length === 0) {
            return res.status(404).json({ success: false, message: 'Reservation not found.' });
        }

        await pool.query(
            'UPDATE bookings SET is_extension_requested = 1, extension_months = ? WHERE id = ?',
            [parseInt(extension_months) || 1, req.params.id]
        );

        const refNo = `REF-${req.params.id.toString().padStart(4, '0')}`;
        // Notify owner
        await pool.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [booking[0].owner_id, `EXTENSION REQUEST: A student has requested a stay extension of +${extension_months} months for Room ${booking[0].room_id} in your property "${booking[0].house_name}" (${refNo}).`]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Request stay extension failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to submit extension request.' });
    }
});

export default router;