import { requestCashRecovery } from '../config/bookingPaymentRecovery.js';
import { openRenewalWait, recordRenewalChoice, renewalExtensionRequested } from '../config/renewalPriority.js';
import { stayPeriod, studentStayConflict, roomStayUsage, roomListAvailability, ownerResponseDeadline } from '../config/stayAvailability.js';
import { bookingNow } from '../config/bookingClock.js';
import { cancelStudentReservation } from '../config/bookingCancellation.js';
import { validateImages } from '../config/uploadValidation.js';
import { validateBody, validateStudentCourse } from '../config/inputValidation.js';
import express from 'express';
import pool from '../config/db.js';
import { PUBLIC_HOUSE_COLUMNS } from '../config/publicHouseFields.js';
import { authenticateToken } from './auth.js';
import { requireOwnerPayments } from '../config/ownerPayments.js';
import { upload, saveUploadedFile } from '../config/upload.js';

const router = express.Router();
router.post('/bookings/request-cash/:id', authenticateToken, async(req,res)=>{
    if(req.user.role!=='student')return res.status(403).json({success:false,message:'Only students can request cash payment for their own booking.'});
    const id=Number(req.params.id);
    if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({success:false,message:'A valid booking is required.'});
    try{res.json(await requestCashRecovery(pool,req.user.id,id,{confirmed:req.body.confirm===true}));}
    catch(error){res.status(error.status||503).json({success:false,message:error.status?error.message:'Cash payment could not be requested. Refresh your booking before trying again.'});}
});

router.get('/stay-conflict', authenticateToken, async (req, res) => {
    try {
        const period=stayPeriod(req.query.check_in_date,req.query.months);
        const conflict=await studentStayConflict(pool,req.user.id,period,{lock:false});
        res.json({success:true,conflict,start:period.start,end:period.end});
    } catch(error) { res.status(error.status || 500).json({success:false,message:error.status ? error.message : 'Could not check your stay dates. Please try again.'}); }
});

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
router.post('/update-profile', authenticateToken, upload.single('profile_pic'), validateImages, validateBody('studentProfile'), validateStudentCourse(pool), async (req, res) => {
    let connection;
    try {
        const userId = req.user.id;
        const {
            student_id, sex, course, year_section,
            dob, age, address, phone, emergency_contact, guardian_name
        } = req.body;

        // Room eligibility uses the recorded sex, so it stays fixed while any request, reservation or stay is open.
        // Same student lock as booking submission, so a request cannot slip in between this check and the update.
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [current] = await connection.query('SELECT sex FROM users WHERE id = ? FOR UPDATE', [userId]);
        const recordedSex = String(current[0]?.sex || '').trim().toLowerCase();
        if (recordedSex && recordedSex !== String(sex || '').trim().toLowerCase()) {
            const [open] = await connection.query(`SELECT 1 FROM bookings WHERE student_id = ? AND status IN ('pending','confirmed')
                UNION ALL SELECT 1 FROM occupants WHERE student_id = ? AND (check_out_date IS NULL OR check_out_date > CURDATE()) LIMIT 1`, [userId, userId]);
            if (open.length) {
                await connection.rollback();
                return res.status(409).json({ success: false, errorCode: 'sex_locked', message: 'Your sex cannot be changed while you have a pending request, a reservation or a current stay, because room eligibility depends on it. Your profile was not saved. You can change it after the stay ends, or after cancelling an unpaid request.' });
            }
        }

        let profilePicUrl = req.body.existing_profile_pic || null;
        if (req.file) {
            profilePicUrl = await saveUploadedFile(req.file.buffer, req.file.originalname, 'profile_pics');
        }

        await connection.query(
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

        await connection.commit();
        res.json({
            success: true,
            message: 'Profile updated successfully!',
            profile_pic: profilePicUrl
        });

    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Update Profile Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to update database profile.' });
    } finally {
        connection?.release();
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
            SELECT ${PUBLIC_HOUSE_COLUMNS}, u.name as owner_name, (CASE WHEN u.email LIKE '%@applicant.invalid' THEN NULL ELSE u.email END) as owner_email,
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
                (SELECT COUNT(*) FROM bookings b WHERE b.room_id = r.id AND b.status = 'confirmed'
                    AND (b.move_in_required = 1 OR (b.payment_method = 'paymongo' AND b.payment_status != 'paid')) AND b.payment_review_required = 0
                    AND NOT EXISTS (SELECT 1 FROM occupants ro WHERE ro.reference_no = CONCAT('REF-', IF(CHAR_LENGTH(b.id) < 4, LPAD(b.id,4,'0'),b.id)))) AS reserved_count,
                   (SELECT COUNT(*) FROM occupants o WHERE o.room_id = r.id AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE()) AND COALESCE(o.is_non_cspc, 0) = 0) AS cspc_occupant_count,
                   (SELECT COUNT(*) FROM occupants o WHERE o.room_id = r.id AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE()) AND o.is_non_cspc = 1) AS non_cspc_occupant_count,
                   (SELECT COUNT(*) FROM occupants o WHERE o.room_id=r.id AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE()) AND (COALESCE(o.arrival_required,0)<>1 OR o.arrival_confirmed_at IS NOT NULL)) AS resident_count,
                   (SELECT COUNT(*) FROM occupants o WHERE o.room_id=r.id AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE()) AND (COALESCE(o.arrival_required,0)<>1 OR o.arrival_confirmed_at IS NOT NULL) AND COALESCE(o.is_non_cspc,0)=0) AS cspc_resident_count,
                   (SELECT COUNT(*) FROM occupants o WHERE o.room_id=r.id AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE()) AND (COALESCE(o.arrival_required,0)<>1 OR o.arrival_confirmed_at IS NOT NULL) AND o.is_non_cspc=1) AS non_cspc_resident_count,
                   (SELECT COUNT(*) FROM occupants o WHERE o.room_id=r.id AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE()) AND o.arrival_required=1 AND o.arrival_confirmed_at IS NULL) AS arrival_pending_count,
                   (SELECT COUNT(*) FROM bookings b WHERE b.room_id = r.id AND b.status = 'pending') AS pending_request_count
            FROM rooms r
            WHERE r.house_id = ? AND (r.deleted_at IS NULL OR r.deleted_at = 0)
        `, [houseId]);

        if (req.query.check_in_date || req.query.months) {
            let period;
            try { period = stayPeriod(req.query.check_in_date, req.query.months); }
            catch (error) { return res.status(400).json({ success:false, message:error.message }); }
            await roomListAvailability(pool,rooms,period);
        }

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
router.post('/review/:id', authenticateToken, validateBody('review'), async (req, res) => {
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
router.post('/book/:houseId', authenticateToken, validateBody('booking'), async (req, res) => {
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

        // The profile's sex is authoritative for room eligibility. A request may fill it in only when the
        // profile has none; it can never change a recorded value (that would bypass the room restriction).
        const [profileRows] = await connection.query('SELECT sex FROM users WHERE id = ?', [studentId]);
        const profileSex = String(profileRows[0]?.sex || '').trim().toLowerCase();
        if (profileSex && studentGender && studentGender !== profileSex) {
            await connection.rollback();
            return res.status(409).json({ success:false, errorCode:'sex_mismatch', message:`Your profile records your sex as ${profileSex}. Booking requests use your profile, so the booking form cannot change it. If your profile is wrong, update it in Profile settings before booking.` });
        }
        if (!profileSex && studentGender) {
            await connection.query('UPDATE users SET sex = ? WHERE id = ?', [studentGender, studentId]);
        }

        if (payment_method === 'paymongo') await requireOwnerPayments(connection, houseId);
        const period = stayPeriod(check_in_date, months);
        // The owner needs at least 2 hours before the response cutoff (noon on the check-in day).
        const responseDueAt = ownerResponseDeadline(check_in_date, bookingNow());
        if (!responseDueAt) {
            await connection.rollback();
            return res.status(409).json({ success:false, message:'This check-in date is too soon for the owner to respond. Requests must be sent at least 2 hours before 12:00 noon on the check-in day. Please choose a later check-in date.', errorCode:'response_window_too_short' });
        }
        if (await studentStayConflict(connection, studentId, period)) {
            await connection.rollback();
            return res.status(409).json({ success:false, message:'These dates overlap another pending reservation, approved booking, or stay. Choose a check-in date on or after its checkout date.', errorCode:'stay_overlap' });
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

        if (await roomStayUsage(connection, roomId, period) >= Number(room.capacity)) {
            await connection.rollback();
            return res.status(409).json({ success:false, message:'No bed is available for the entire selected stay. Choose another room or different dates.', errorCode:'capacity_full' });
        }

        const monthlyRent = parseFloat(room.price || 0);
        const totalAmount = monthlyRent * (parseInt(months) || 1);
        if (!Number.isFinite(totalAmount) || totalAmount < 0 || totalAmount > 99999999.99) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'The total rent exceeds the supported amount. Please reduce the duration or check the room rent.' });
        }

        const [houseRows] = await connection.query('SELECT owner_id, name FROM boarding_houses WHERE id = ?', [houseId]);
        const ownerId = houseRows[0].owner_id;

        const [insertResult] = await connection.query(
            `INSERT INTO bookings (
                student_id, house_id, room_id, status, resident_name, check_in_date,
                months, age, contact_number, emergency_contact, guardian_name,
                address, payment_method, payment_status, amount, monthly_rent, move_in_required, owner_response_due_at
            ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?, ?, 1, ?)`,
            [
                studentId, houseId, roomId, resident_name, check_in_date,
                parseInt(months) || 1, parseInt(age) || null, contact_number, emergency_contact || null,
                guardian_name || null, address || '', payment_method || 'cash', totalAmount, monthlyRent, responseDueAt
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
                 address = COALESCE(NULLIF(?, ''), address)
             WHERE id = ?`,
            [contact_number, parseInt(age) || null, emergency_contact, guardian_name, address, studentId]
        );

        const renewalWait=await openRenewalWait(connection,{id:insertResult.insertId,student_id:studentId,room_id:roomId,check_in_date,months:parseInt(months)||1},{ownerId,capacity:room.capacity,roomNumber:room.room_number});
        if(!renewalWait.waiting){
        const studentMsg = `RESERVATION SUBMITTED: Your booking request ${refNo} has been submitted! Awaiting landlord review.`;
        const ownerMsg = `NEW BOOKING REQUEST: A new student has requested to book Room ${room.room_number} in your property "${houseRows[0].name}" (${refNo})!`;

        await connection.query(
            'INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',
            [studentId, studentMsg, `/student/bookings/${insertResult.insertId}`]
        );

        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [ownerId, ownerMsg]
        );
        }
        await connection.commit();
        res.json({ success: true, message: renewalWait.waiting ? 'Request submitted: waiting for a renewal decision. No bed is guaranteed and no payment is due. See My Bookings for the deadline.' : 'Booking request submitted successfully!', bookingId: insertResult.insertId });
    } catch (err) {
        await connection.rollback();
        console.error('Booking submission failed:', err.message);
        res.status(err.status || 500).json({ success: false, message: err.status ? err.message : 'Failed to process reservation booking.' });
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
                    o.check_out_date AS occupant_check_out,
                    o.upfront_status AS occupant_upfront_status, o.payment_status AS occupant_payment_status,
                    o.arrival_required AS occupant_arrival_required, o.arrival_confirmed_at AS occupant_arrival_confirmed_at, o.non_arrival_recorded_at AS occupant_non_arrival_recorded_at
             FROM bookings b
             JOIN rooms r ON b.room_id = r.id
             JOIN boarding_houses bh ON b.house_id = bh.id
             LEFT JOIN occupants o ON o.reference_no = CONCAT('REF-', IF(CHAR_LENGTH(b.id) < 4, LPAD(b.id, 4, '0'), b.id))
             WHERE b.student_id = ?
             ORDER BY b.booking_date DESC`,
            [studentId]
        );

        // Only anonymous checkout dates are exposed, never other residents' identities.
        const renewalIds = b => { try { const ids=JSON.parse(b.renewal_sources || '[]'); return Array.isArray(ids) ? ids.map(Number).filter(id=>Number.isSafeInteger(id) && id>0) : []; } catch { return []; } };
        const sourceIds=[...new Set(bookings.flatMap(renewalIds))];
        const [renewalResidents]=sourceIds.length ? await pool.query('SELECT id,room_id,check_in_date,months FROM bookings WHERE id IN (?)',[sourceIds]) : [[]];
        for(const b of bookings) b.renewal_departure_dates=[...new Set(renewalResidents.filter(r=>renewalIds(b).includes(Number(r.id)) && Number(r.room_id)===Number(b.room_id)).map(r=>stayPeriod(r.check_in_date,r.months)?.end).filter(Boolean))].sort();

        // Map Move-in Costs — advance + deposit (month-based)
        const mappedBookings = bookings.map(b => {
            delete b.renewal_sources;
            const advM = parseInt(b.advance_months || 0);
            const depM = parseInt(b.deposit_months || 0);
            const rent = parseFloat(b.monthly_rent || 0);
            const initial_payment = b.upfront_amount != null ? Number(b.upfront_amount) : (Math.max(1, advM) * rent) + (depM * rent);

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


// 9. [POST] - Cancel a student reservation that has not been paid or started
router.post('/bookings/cancel/:id', authenticateToken, validateBody('ids'), async (req, res) => {
    try {
        res.json(await cancelStudentReservation(pool, req.user.id, req.params.id));
    } catch (err) {
        if (!err.status) console.error('Cancel booking failed:', err.message);
        res.status(err.status || 500).json({ success: false, message: err.status ? err.message : 'Failed to cancel reservation.' });
    }
});

router.post('/bookings/renewal/:id',authenticateToken,validateBody('ids'),async(req,res)=>{if(req.user.role!=='student')return res.status(403).json({success:false,message:'Student access required.'});try{res.json(await recordRenewalChoice(pool,req.user.id,req.params.id,req.body.choice));}catch(error){res.status(error.status || 500).json({success:false,message:error.status ? error.message : 'Could not save your renewal decision.'});}});

// 10. [POST] - Request stay extension
router.post('/bookings/extend/:id', authenticateToken, validateBody('ids'), async (req, res) => {
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
            'SELECT b.*, bh.owner_id, bh.name as house_name, r.room_number FROM bookings b JOIN boarding_houses bh ON b.house_id = bh.id LEFT JOIN rooms r ON r.id = b.room_id WHERE b.id = ? AND b.student_id = ? FOR UPDATE',
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

        if (Number(booking[0].move_in_required) === 1 && !booking[0].move_in_confirmed_at) {
            await connection.rollback();
            return res.status(409).json({ success:false, message:'Stay extensions are available after the booked stay starts.' });
        }
        const totalMonths = Number(booking[0].months) + months;
        const startDate = booking[0].check_in_date ? new Date(booking[0].check_in_date) : null;
        const totalRent = Number(booking[0].amount) + Number(booking[0].monthly_rent || 0) * months;
        if (!Number.isSafeInteger(totalMonths) || totalMonths > 2147483647 || !Number.isFinite(totalRent) || totalRent < 0 || totalRent > 99999999.99 || (startDate && (isNaN(startDate.getTime()) || startDate.getFullYear() * 12 + startDate.getMonth() + totalMonths > 9999 * 12 + 11))) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'The extension exceeds the supported check-out date or rent amount. Please request fewer months.' });
        }

        await connection.query(
            'UPDATE bookings SET is_extension_requested = 1, extension_months = ? WHERE id = ?',
            [months, req.params.id]
        );

        const refNo = `REF-${req.params.id.toString().padStart(4, '0')}`;
        await renewalExtensionRequested(connection,booking[0]);
        const extensionMsg = `EXTENSION REQUEST: A student has requested a stay extension of +${months} months for Room ${booking[0].room_number || booking[0].room_id} in your property "${booking[0].house_name}" (${refNo}).`;
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

// 11. [POST] - Withdraw a pending stay extension request (before the owner approves or declines it).
// Uses the same reset as the owner's decline; the booking itself was never changed by the request.
router.post('/bookings/extension/cancel/:id', authenticateToken, validateBody('ids'), async (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can cancel their extension requests.' });
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

        if (booking[0].status !== 'confirmed' || !booking[0].is_extension_requested) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'This extension request is no longer pending. Please refresh your booking.' });
        }

        await connection.query(
            'UPDATE bookings SET is_extension_requested = 0, extension_months = 0 WHERE id = ?',
            [req.params.id]
        );

        const refNo = `REF-${req.params.id.toString().padStart(4, '0')}`;
        const withdrawnMsg = `EXTENSION WITHDRAWN: A student has cancelled their stay extension request (+${booking[0].extension_months} months) for your property "${booking[0].house_name}" (${refNo}).`;
        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [booking[0].owner_id, withdrawnMsg]
        );

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Cancel stay extension failed:', err.message);
        res.status(500).json({ success: false, message: 'Failed to cancel the extension request.' });
    } finally {
        connection?.release();
    }
});

export default router;
