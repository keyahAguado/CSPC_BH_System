import express from 'express';
import pool from '../config/db.js';
import { PUBLIC_HOUSE_COLUMNS } from '../config/publicHouseFields.js';
import { authenticateToken } from './auth.js';
import { upload, saveUploadedFile } from '../config/upload.js';

const router = express.Router();

// [GET] - Active course list for the profile dropdown
router.get('/courses', authenticateToken, async (req, res) => {
    try {
        const [courses] = await pool.query(
            'SELECT course_code, course_name FROM courses WHERE is_active = 1 ORDER BY course_name ASC'
        );
        res.json({ success: true, courses });
    } catch (err) {
        console.error('Fetch student courses failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to load course list.' });
    }
});

router.get('/profile', authenticateToken, async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ success: false, message: 'Invalid session token.' });
        }
        const [rows] = await pool.query('SELECT id, email, role, name, phone, address, status, student_id, sex, course, year_section, dob, age, emergency_contact, guardian_name, profile_pic, created_at FROM users WHERE id = ?', [req.user.id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User profile not found.' });
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

        let profilePicUrl = req.body.existing_profile_pic || null;
        if (req.file) {
            profilePicUrl = await saveUploadedFile(req.file.buffer, req.file.originalname, 'profile_pics');
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
                emergency_contact || null, guardian_name || null, profilePicUrl,
                userId
            ]
        );

        res.json({
            success: true,
            message: 'Profile updated successfully!',
            profile_pic: profilePicUrl
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
        const searchQuery = (req.query.query || req.query.search || req.query.q || '').trim();
        const terms = searchQuery.split(/\s+/).map(t => t.trim()).filter(t => t.length > 0);

        let houses;
        if (terms.length === 0) {
            [houses] = await pool.query(`
                SELECT ${PUBLIC_HOUSE_COLUMNS},
                       (SELECT AVG(rating) FROM reviews WHERE house_id = bh.id) AS avg_rating,
                       (SELECT COUNT(*) FROM reviews WHERE house_id = bh.id) AS review_count,
                       (SELECT COUNT(*) FROM rooms WHERE house_id = bh.id AND deleted_at IS NULL) AS room_count,
                       (SELECT MIN(price) FROM rooms WHERE house_id = bh.id AND deleted_at IS NULL) AS min_price,
                       (SELECT MAX(price) FROM rooms WHERE house_id = bh.id AND deleted_at IS NULL) AS max_price
                FROM boarding_houses bh
                WHERE bh.house_status = 'accredited'
                ORDER BY bh.created_at DESC
            `);
        } else {
            let scoreClauses = [];
            let whereClauses = [];
            let params = [];

            terms.forEach(term => {
                scoreClauses.push(`(IF(bh.name LIKE ?, 3, 0) + IF(bh.location LIKE ?, 2, 0) + IF(COALESCE(bh.barangay, '') LIKE ?, 1, 0))`);
                whereClauses.push(`(bh.name LIKE ? OR bh.location LIKE ? OR bh.barangay LIKE ?)`);
                const wildterm = `%${term}%`;
                params.push(wildterm, wildterm, wildterm);
            });

            const queryParams = [...params, ...params];
            const sql = `
                SELECT ${PUBLIC_HOUSE_COLUMNS},
                       (SELECT AVG(rating) FROM reviews WHERE house_id = bh.id) AS avg_rating,
                       (SELECT COUNT(*) FROM reviews WHERE house_id = bh.id) AS review_count,
                       (SELECT COUNT(*) FROM rooms WHERE house_id = bh.id AND deleted_at IS NULL) AS room_count,
                       (SELECT MIN(price) FROM rooms WHERE house_id = bh.id AND deleted_at IS NULL) AS min_price,
                       (SELECT MAX(price) FROM rooms WHERE house_id = bh.id AND deleted_at IS NULL) AS max_price,
                       (${scoreClauses.join(' + ')}) AS relevance
                FROM boarding_houses bh
                WHERE bh.house_status = 'accredited' AND (${whereClauses.join(' OR ')})
                ORDER BY relevance DESC, bh.created_at DESC
            `;
            [houses] = await pool.query(sql, queryParams);
        }

        const formatted = houses.map(h => {
            const prices = [];
            if (h.price !== null && h.price !== undefined && parseFloat(h.price) > 0) {
                prices.push(parseFloat(h.price));
            }
            if (h.min_price !== null && h.min_price !== undefined && parseFloat(h.min_price) > 0) {
                prices.push(parseFloat(h.min_price));
            }
            if (h.max_price !== null && h.max_price !== undefined && parseFloat(h.max_price) > 0) {
                prices.push(parseFloat(h.max_price));
            }
            let min = 0, max = 0, price_range = '₱0';
            if (prices.length > 0) {
                min = Math.min(...prices);
                max = Math.max(...prices);
                price_range = min !== max ? `₱${Number(min).toLocaleString()} - ₱${Number(max).toLocaleString()}` : `₱${Number(min).toLocaleString()}`;
            }
            return { ...h, min_price: min, max_price: max, price_range };
        });

        res.json({ success: true, houses: formatted });
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
            SELECT ${PUBLIC_HOUSE_COLUMNS}, u.name as owner_name, u.email as owner_email,
                   (SELECT MIN(price) FROM rooms WHERE house_id = bh.id AND deleted_at IS NULL) AS min_price,
                   (SELECT MAX(price) FROM rooms WHERE house_id = bh.id AND deleted_at IS NULL) AS max_price
            FROM boarding_houses bh
            JOIN users u ON bh.owner_id = u.id
            WHERE bh.id = ? AND bh.house_status = 'accredited'
        `, [houseId]);

        if (houseRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Accredited boarding house not found.' });
        }

        const hRaw = houseRows[0];
        const prices = [];
        if (hRaw.price !== null && hRaw.price !== undefined && parseFloat(hRaw.price) > 0) {
            prices.push(parseFloat(hRaw.price));
        }
        if (hRaw.min_price !== null && hRaw.min_price !== undefined && parseFloat(hRaw.min_price) > 0) {
            prices.push(parseFloat(hRaw.min_price));
        }
        if (hRaw.max_price !== null && hRaw.max_price !== undefined && parseFloat(hRaw.max_price) > 0) {
            prices.push(parseFloat(hRaw.max_price));
        }
        let min = 0, max = 0, price_range = '₱0';
        if (prices.length > 0) {
            min = Math.min(...prices);
            max = Math.max(...prices);
            price_range = min !== max ? `₱${Number(min).toLocaleString()} - ₱${Number(max).toLocaleString()}` : `₱${Number(min).toLocaleString()}`;
        }
        const house = { ...hRaw, min_price: min, max_price: max, price_range };

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
                   (SELECT COUNT(*) FROM occupants o WHERE o.room_id = r.id AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())) AS occupant_count,
                   (SELECT COUNT(*) FROM bookings b WHERE b.room_id = r.id AND b.status = 'pending') AS pending_request_count
            FROM rooms r
            WHERE r.house_id = ? AND (r.deleted_at IS NULL OR r.deleted_at = 0)
        `, [houseId]);

        // Fetch all gallery photos (up to 10)
        const [photoRows] = await pool.query(
            'SELECT photo_url FROM house_photos WHERE house_id = ? ORDER BY sort_order ASC',
            [houseId]
        );

        res.json({
            success: true,
            house: house,
            reviews,
            avgRating,
            rooms,
            photos: photoRows.map(r => r.photo_url),
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
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can submit reservation requests.' });
    }
    const houseId = req.params.houseId;
    const studentId = req.user.id;
    const {
        roomId, check_in_date, months, resident_name, age, gender, sex,
        contact_number, emergency_contact, guardian_name, address, payment_method
    } = req.body;

    const studentGender = (gender || sex || '').trim().toLowerCase();

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Serialize reservation submission and approval for this student.
        const [bookingStudent] = await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [studentId]);
        if (bookingStudent.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Student account not found.' });
        }

        // Update student sex/gender in database if provided in booking request
        if (studentGender) {
            await connection.query(
                `UPDATE users SET sex = COALESCE(NULLIF(?, ''), sex) WHERE id = ?`,
                [studentGender, studentId]
            );
        }

        // --- SYSTEM GUARD 1: Prevent students checked-in somewhere else from booking duplicates ---
        const [activeOccupancy] = await connection.query(
            'SELECT id FROM occupants WHERE student_id = ? AND (check_out_date IS NULL OR check_out_date > CURDATE()) FOR UPDATE',
            [studentId]
        );
        if (activeOccupancy.length > 0) {
            await connection.rollback();
            return res.status(403).json({
                success: false,
                message: 'Booking blocked. You are currently checked-in as an active resident of a boarding house. You must check out before making a new reservation.',
                errorCode: 'active_stay'
            });
        }

        // --- SYSTEM GUARD 2: Prevent students with already approved stays from double-booking ---
        const [confirmedBookings] = await connection.query(
            "SELECT id FROM bookings WHERE student_id = ? AND status = 'confirmed' FOR UPDATE",
            [studentId]
        );
        if (confirmedBookings.length > 0) {
            await connection.rollback();
            return res.status(403).json({
                success: false,
                message: 'Booking blocked. You already have a confirmed booking. View My Bookings to manage it before reserving another property.',
                errorCode: 'confirmed_booking'
            });
        }

        const [pendingBookingRows] = await connection.query(
            "SELECT id FROM bookings WHERE student_id = ? AND status = 'pending' FOR UPDATE",
            [studentId]
        );
        if (pendingBookingRows.length > 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'You already have a pending reservation. Cancel it or wait for the owner\'s decision before reserving another boarding house.', errorCode: 'pending_booking' });
        }

        // --- Standard checks ---
        const [roomRows] = await connection.query(
            'SELECT r.* FROM rooms r JOIN boarding_houses bh ON bh.id = r.house_id WHERE r.id = ? AND r.house_id = ? AND r.deleted_at IS NULL AND bh.house_status = \'accredited\' FOR UPDATE',
            [roomId, houseId]
        );
        if (roomRows.length === 0) {
            await connection.rollback();
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
        
        // Auto-update student profile in MySQL so all future bookings are pre-filled 100% automatically
        await connection.query(
            `UPDATE users 
             SET phone = COALESCE(NULLIF(?, ''), phone),
                 age = COALESCE(?, age),
                 emergency_contact = COALESCE(NULLIF(?, ''), emergency_contact),
                 guardian_name = COALESCE(NULLIF(?, ''), guardian_name),
                 address = COALESCE(NULLIF(?, ''), address),
                 sex = COALESCE(NULLIF(?, ''), sex)
             WHERE id = ?`,
            [contact_number, parseInt(age) || null, emergency_contact, guardian_name, address, studentGender || null, studentId]
        );

        const studentMsg = `RESERVATION SUBMITTED: Your booking request ${refNo} has been submitted! Awaiting landlord review.`;
        const ownerMsg = `NEW BOOKING REQUEST: A new student has requested to book Room ${room.room_number} in your property "${houseRows[0].name}" (${refNo})!`;

        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [studentId, studentMsg]
        );

        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [ownerId, ownerMsg]
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
                    bh.name as house_name, bh.location as house_location, bh.barangay as house_barangay,
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

        // Map Move-in Costs — advance + deposit (month-based)
        const mappedBookings = bookings.map(b => {
            const advM = parseInt(b.advance_months || 0);
            const depM = parseInt(b.deposit_months || 0);
            const rent = parseFloat(b.monthly_rent || 0);
            const initial_payment = (Math.max(1, advM) * rent) + (depM * rent);

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

        const b = booking[0];

        // A confirmed CASH booking, or a confirmed+paid PayMongo booking, already has a
        // real occupant record — cancelling the booking without evicting that occupant
        // would leave the two tables disagreeing. Self-cancel is only safe while nothing
        // has actually been occupied yet: still pending, or approved-but-unpaid PayMongo.
        const canSelfCancel = b.status === 'pending'
            || (b.status === 'confirmed' && b.payment_method === 'paymongo' && b.payment_status !== 'paid');

        if (!canSelfCancel) {
            return res.status(400).json({
                success: false,
                message: 'This reservation is already active. Please contact the property owner to check out.'
            });
        }

        const [cancelResult] = await pool.query(
            "UPDATE bookings SET status = 'cancelled' WHERE id = ? AND status = ? AND payment_status = ?",
            [req.params.id, b.status, b.payment_status]
        );
        if (cancelResult.affectedRows === 0) {
            return res.status(409).json({ success: false, message: 'This reservation has changed. Please refresh My Bookings before cancelling.' });
        }

        const refNo = `REF-${req.params.id.toString().padStart(4, '0')}`;
        const cancelMsg = `RESERVATION CANCELLED: A student has cancelled their pending reservation request for your property "${booking[0].house_name}" (${refNo}).`;
        // Notify owner
        await pool.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [booking[0].owner_id, cancelMsg]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Cancel booking failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to cancel reservation.' });
    }
});

// 10. [POST] - Request stay extension
router.post('/bookings/extend/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can request stay extensions.' });
    }
    const value = req.body.extension_months;
    const months = Number(value);
    if (!['string', 'number'].includes(typeof value) || !Number.isInteger(months) || months < 1 || months > 2147483647) {
        return res.status(400).json({ success: false, message: 'Extension duration must be a positive whole number of months.' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [booking] = await connection.query(
            'SELECT b.*, bh.owner_id, bh.name as house_name FROM bookings b JOIN boarding_houses bh ON b.house_id = bh.id WHERE b.id = ? AND b.student_id = ? FOR UPDATE',
            [req.params.id, req.user.id]
        );

        if (booking.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Reservation not found.' });
        }

        if (booking[0].status !== 'confirmed' || booking[0].is_extension_requested) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'Only a confirmed booking without a pending extension can request an extension.' });
        }

        await connection.query(
            'UPDATE bookings SET is_extension_requested = 1, extension_months = ? WHERE id = ?',
            [months, req.params.id]
        );

        const refNo = `REF-${req.params.id.toString().padStart(4, '0')}`;
        const extensionMsg = `EXTENSION REQUEST: A student has requested a stay extension of +${months} months for Room ${booking[0].room_id} in your property "${booking[0].house_name}" (${refNo}).`;
        // Notify owner
        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [booking[0].owner_id, extensionMsg]
        );

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Request stay extension failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to submit extension request.' });
    } finally {
        connection?.release();
    }
});

export default router;