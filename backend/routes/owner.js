import { requireOwnerPayments } from '../config/ownerPayments.js';
import { notifyRenewalIncomingClosed, notifyRenewalIncomingApproved, rejectRenewalIncoming } from '../config/renewalPriority.js';
import { bookingNow } from '../config/bookingClock.js';
import { reviewPaidCancellation, PAID_RESERVATION_POLICY } from '../config/paidCancellation.js';
import { cancelFutureReservation } from '../config/bookingCancellation.js';
import { startBookedStay } from '../config/scheduledOccupancy.js';
import { bookingIdFromReference, formalDate, stayPeriod, studentStayConflict, roomStayUsage, manilaToday, onlinePaymentDeadline, rejectUnfittablePending } from '../config/stayAvailability.js';
import { updateBookingArrival, confirmOccupantArrival, recordNonArrival, closeNonArrival } from '../config/bookingMoveIn.js';
import { saveRoomDetails } from '../config/roomDetails.js';
import { validateImages } from '../config/uploadValidation.js';
import { validateBody } from '../config/inputValidation.js';
import { notificationForRole } from '../config/notificationAudience.js';
import express from 'express';
import pool from '../config/db.js';
import { authenticateToken } from './auth.js';
import { upload, saveUploadedFile } from '../config/upload.js';
import NABUA_BARANGAYS from '../config/barangays.js';
import { getComplianceStatus, getSupplementaryStatus } from '../config/complianceHelper.js';
import { evaluateHouseCompliance } from '../config/complianceManager.js';

const router = express.Router();

// Helper middleware to strictly lock down routes to property owners
const verifyOwner = (req, res, next) => {
    if (req.user && req.user.role === 'owner') return next();
    return res.status(403).json({ success: false, message: 'Access denied.' });
};

// Multer using memory storage for all owner file uploads
// uploadOwnerMedia uses .any() to accept img + up to 10 dynamic new_photo_N fields
const uploadOwnerMedia = upload.any();

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
        if (!req.user || !req.user.id) {
            return res.status(401).json({ success: false, message: 'Invalid session token.' });
        }

        const [rows] = await pool.query(
            'SELECT id, email, role, name, phone, address, profile_pic, google_id, password FROM users WHERE id = ?',
            [req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Owner profile not found.' });
        }

        const u = rows[0];
        const isGoogleUser = Boolean(u.google_id && String(u.google_id).trim() !== '');
        const hasPassword = Boolean(u.password && String(u.password).trim() !== '');

        res.json({
            success: true,
            user: {
                id: u.id,
                email: u.email,
                role: u.role,
                name: u.name,
                phone: u.phone,
                address: u.address,
                profile_pic: u.profile_pic,
                isGoogleUser,
                hasPassword
            }
        });
    } catch (err) {
        console.error('Fetch Owner Profile Error:', err.message);
        res.status(500).json({ success: false, message: 'Database failed to retrieve profile.' });
    }
});

// Reuseable profile updates handler
const updateProfileHandler = async (req, res) => {
    try {
        const { name, phone, address } = req.body;

        // Fetch existing picture to preserve if no new file uploaded
        const [existing] = await pool.query('SELECT profile_pic FROM users WHERE id = ?', [req.user.id]);
        let profilePicUrl = existing.length > 0 ? existing[0].profile_pic : null;

        if (req.file) {
            profilePicUrl = await saveUploadedFile(req.file.buffer, req.file.originalname, 'profile_pics');
        }

        await pool.query(
            'UPDATE users SET name = ?, phone = ?, address = ?, profile_pic = ? WHERE id = ?',
            [name, phone, address || '', profilePicUrl, req.user.id]
        );

        res.json({ success: true, message: 'Profile updated successfully.' });
    } catch (err) {
        console.error('Update Profile Error:', err.message);
        res.status(500).json({ success: false, message: 'Database failed to save profile changes.' });
    }
};

// Map both endpoints to the same handler to prevent frontend routing breaks
router.post('/profile', authenticateToken, upload.single('profile_pic'), validateImages, validateBody('ownerProfile'), updateProfileHandler);
router.post('/update-profile', authenticateToken, upload.single('profile_pic'), validateImages, validateBody('ownerProfile'), updateProfileHandler);

// =========================================================================
// OWNER DASHBOARD & STATISTICS ENDPOINT
// =========================================================================

// GET - Retrieve Owner Dashboard Statistics
router.get('/dashboard', authenticateToken, verifyOwner, async (req, res) => {
    try {
        const [houseRows] = await pool.query(
            `SELECT bh.*, bh.compliance_status AS compliance,
                    (SELECT COUNT(*) FROM bookings WHERE house_id = bh.id AND status = 'pending') AS pending_count,
                    (SELECT COUNT(*) FROM rooms WHERE house_id = bh.id AND deleted_at IS NULL) AS room_count
             FROM boarding_houses bh
             WHERE bh.owner_id = ?`,
            [req.user.id]
        );

        if (houseRows.length === 0) {
            return res.json({ success: true, hasProperty: false, houses: [], stats: { totalListings: 0, pendingBookings: 0 } });
        }

        // Display status is computed live from the actual expiry dates rather than
        // trusting compliance_status/supplementary_status as stored — those columns
        // only update when the compliance sweep (daily cron, or immediately after a
        // document save) runs, so they can go stale between sweeps. Actual archiving
        // still only happens via that sweep — this only affects what the owner sees
        // here.
        // For owner-unlisted houses: if critical permits have since expired, override
        // archived_by in the response to 'system' so the frontend shows the correct
        // "PERMITS EXPIRED" overlay instead of the "UNLISTED BY OWNER" overlay.
        // This is display-only — the DB is NOT touched here.
        for (const h of houseRows) {
            h.compliance = getComplianceStatus(h);
            h.supplementary_status = getSupplementaryStatus(h);
            if (h.house_status === 'archived' && h.archived_by === 'owner' && h.compliance === 'expired') {
                h.archived_by = 'system';
                h.compliance_status = 'expired';
            }
        }

        // Sort: accredited first, then pending, then rejected, then archived (owner-unlisted),
        // then archived (system/admin) — so active listings are always at the top.
        const statusOrder = { accredited: 0, pending: 1, rejected: 2 };
        houseRows.sort((a, b) => {
            const getOrder = (h) => {
                if (h.house_status !== 'archived') return statusOrder[h.house_status] ?? 1;
                if (h.archived_by === 'owner') return 3;   // unlisted by owner
                return 4;                                   // system/admin archived
            };
            return getOrder(a) - getOrder(b);
        });

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

        // Fetch all photos from house_photos table (up to 10)
        const [photoRows] = await pool.query(
            'SELECT photo_url FROM house_photos WHERE house_id = ? ORDER BY sort_order ASC',
            [req.params.id]
        );

        res.json({
            success: true,
            house: houseRows[0],
            photos: photoRows.map(r => r.photo_url),
            googleMapsApiKey: process.env.VITE_GOOGLE_MAPS_API_KEY || ''
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// D. POST - Save Edited Boarding House details
router.post('/edit/:id', authenticateToken, verifyOwner, uploadOwnerMedia, validateImages, validateBody('property'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [ownedHouse] = await connection.query(
            'SELECT id FROM boarding_houses WHERE id = ? AND owner_id = ? FOR UPDATE',
            [req.params.id, req.user.id]
        );
        if (ownedHouse.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Property not found or access denied.' });
        }

        const {
            house_name, location, price, contact_number, map_link, description,
            latitude, longitude, advance_months, deposit_months, deposit_type,
            existing_img, amenities_free, amenities_paid
        } = req.body;

        // Existing photos array sent from frontend as JSON
        let existingPhotos = [];
        try { existingPhotos = JSON.parse(req.body.existing_photos || '[]'); } catch(e) {}

        // Upload any new photo files to Cloudinary concurrently in parallel
        let newPhotoUrls = [];
        if (req.files && Array.isArray(req.files)) {
            const photoFiles = req.files.filter(f => f.fieldname !== 'img');
            if (photoFiles.length > 0) {
                const uploadPromises = photoFiles.map(f => saveUploadedFile(f.buffer, f.originalname, 'house_images'));
                newPhotoUrls = await Promise.all(uploadPromises);
            }
        }

        // Merge: existing first, new appended, cap at 10
        const allPhotos = [...existingPhotos, ...newPhotoUrls].slice(0, 10);

        // Upload featured image if replaced
        let featuredImg = existing_img || null;
        if (req.files && Array.isArray(req.files)) {
            const imgFile = req.files.find(f => f.fieldname === 'img');
            if (imgFile) {
                featuredImg = await saveUploadedFile(imgFile.buffer, imgFile.originalname, 'house_images');
            }
        }

        const sanitizedFree = sanitizeJSONInput(amenities_free);
        const sanitizedPaid = sanitizeJSONInput(amenities_paid);

        const extractBarangay = (loc, barInput) => {
            if (barInput && barInput.trim()) return barInput.trim();
            if (!loc) return null;
            return NABUA_BARANGAYS.find(b => loc.toLowerCase().includes(b.toLowerCase())) || null;
        };
        const computedBarangay = extractBarangay(location, req.body.barangay);

        // Keep img_1/2/3 in sync for backwards compatibility
        const img_1 = allPhotos[0] || null;
        const img_2 = allPhotos[1] || null;
        const img_3 = allPhotos[2] || null;

        await connection.query(
            `UPDATE boarding_houses 
             SET name = ?, img = ?, img_1 = ?, img_2 = ?, img_3 = ?, location = ?, barangay = ?, map_link = ?, price = ?, phone_contact = ?, description = ?,
                 latitude = ?, longitude = ?, advance_months = ?, deposit_months = ?, deposit_type = ?,
                 amenities_free = ?, amenities_paid = ?
             WHERE id = ? AND owner_id = ?`,
            [
                house_name, featuredImg, img_1, img_2, img_3, location, computedBarangay, map_link,
                parseFloat(price) || 0, (contact_number || '').toString().trim().slice(0, 200), description || '',
                latitude ? parseFloat(latitude) : null, longitude ? parseFloat(longitude) : null,
                parseInt(advance_months) || 0, parseInt(deposit_months) || 0, deposit_type || 'refundable',
                sanitizedFree, sanitizedPaid,
                req.params.id, req.user.id
            ]
        );

        // Replace house_photos for this house (Safeguarded if table does not exist)
        try {
            await connection.query('DELETE FROM house_photos WHERE house_id = ?', [req.params.id]);
            for (let i = 0; i < allPhotos.length; i++) {
                await connection.query(
                    'INSERT INTO house_photos (house_id, photo_url, sort_order) VALUES (?, ?, ?)',
                    [req.params.id, allPhotos[i], i]
                );
            }
        } catch (photoErr) {
            console.warn('[HOUSE_PHOTOS] Skipped optional house_photos table query:', photoErr.message);
        }

        // Preserve individual room prices set by the owner
        // (Do not overwrite rooms.price with house base price)

        await connection.commit();
        res.json({ success: true, message: 'Property details updated successfully.' });
    } catch (err) {
        await connection.rollback();
        console.error('Update details error:', err.message);
        res.status(500).json({ success: false, message: err.message || 'Database failed to save updates.' });
    } finally {
        connection.release();
    }
});

// Soft-Delete / Archive Boarding House by Owner
router.delete('/boarding-houses/:id', authenticateToken, verifyOwner, validateBody('archive'), async (req, res) => {
    try {
        const houseId = req.params.id;
        const reason = req.body?.reason || 'Paused by Landlord';

        const [houseRows] = await pool.query(
            'SELECT id, name, house_status FROM boarding_houses WHERE id = ? AND owner_id = ?',
            [houseId, req.user.id]
        );

        if (houseRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Boarding house record not found or unauthorized.' });
        }

        if (houseRows[0].house_status !== 'accredited') {
            return res.status(403).json({ success: false, message: 'Only accredited listings can be paused by their owner. Pending or rejected applications require SASO review.' });
        }

        const [result] = await pool.query(
            `UPDATE boarding_houses 
             SET status_before_archive = house_status, house_status = 'archived', archived_by = 'owner', archive_reason = ?, archived_at = NOW()
             WHERE id = ? AND owner_id = ? AND house_status = 'accredited'`,
            [reason, houseId, req.user.id]
        );

        if (result.affectedRows === 0) {
            return res.status(409).json({ success: false, message: 'The listing status has changed. Please refresh your dashboard.' });
        }

        res.json({
            success: true,
            message: 'Boarding house listing has been paused and archived. Active occupants remain recorded.'
        });
    } catch (err) {
        console.error('Archive Boarding House Error:', err.message);
        res.status(500).json({ success: false, message: err.message || 'Failed to archive boarding house.' });
    }
});

// Reactivate Boarding House by Owner (with Critical Permit Expiry Check)
router.post('/boarding-houses/reactivate/:id', authenticateToken, verifyOwner, validateBody('ids'), async (req, res) => {
    try {
        const houseId = req.params.id;

        const [houseRows] = await pool.query(
            'SELECT * FROM boarding_houses WHERE id = ? AND owner_id = ?',
            [houseId, req.user.id]
        );

        if (houseRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Boarding house record not found or unauthorized.' });
        }

        const house = houseRows[0];

        // Ownership alone is not permission to accredit a property.
        if (house.house_status !== 'archived' || house.archived_by !== 'owner' || house.status_before_archive !== 'accredited') {
            return res.status(403).json({ success: false, message: 'Only previously accredited listings paused by their owner can be reactivated. This property requires SASO review.' });
        }

        // 1. Run compliance evaluation to sync compliance_status column in DB
        await evaluateHouseCompliance(houseId);

        // Fetch fresh house record after evaluation
        const [freshRows] = await pool.query('SELECT * FROM boarding_houses WHERE id = ? AND owner_id = ?', [houseId, req.user.id]);
        if (freshRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Boarding house record not found or unauthorized.' });
        }
        const currentHouse = freshRows[0];

        const liveCompliance = getComplianceStatus(currentHouse);
        if (currentHouse.compliance_status === 'expired' || liveCompliance === 'expired') {
            return res.status(400).json({
                success: false,
                message: 'Cannot reactivate listing: One or more required legal permits have expired. Please upload updated permits under Docs to proceed.'
            });
        }

        // Evaluation or a concurrent admin action may have changed the archive authority.
        if (currentHouse.house_status !== 'archived' || currentHouse.archived_by !== 'owner' || currentHouse.status_before_archive !== 'accredited') {
            return res.status(403).json({ success: false, message: 'This property requires SASO review before reactivation.' });
        }

        // 2. Preserve existing administrative restrictions
        if (currentHouse.archived_by === 'admin' || currentHouse.admin_comments) {
            return res.status(403).json({
                success: false,
                message: currentHouse.admin_comments 
                    ? `Listing inactive: ${currentHouse.admin_comments}. Please upload updated documents under Docs for SASO re-accreditation.`
                    : 'This listing cannot be reactivated because legal permit documents require SASO re-accreditation. Please upload updated permits under Docs to proceed.'
            });
        }

        const [result] = await pool.query(
            `UPDATE boarding_houses 
             SET house_status = 'accredited', compliance_status = 'active', archived_by = NULL, archive_reason = NULL, archived_at = NULL, status_before_archive = NULL
             WHERE id = ? AND owner_id = ? AND house_status = 'archived' AND archived_by = 'owner'
               AND status_before_archive = 'accredited' AND compliance_status != 'expired'
               AND (admin_comments IS NULL OR admin_comments = '')
               AND expiry_permit_business_form <=> ? AND expiry_permit_barangay <=> ?
               AND expiry_permit_sanitary <=> ? AND expiry_permit_fire <=> ?`,
            [houseId, req.user.id, currentHouse.expiry_permit_business_form, currentHouse.expiry_permit_barangay,
                currentHouse.expiry_permit_sanitary, currentHouse.expiry_permit_fire]
        );

        if (result.affectedRows === 0) {
            return res.status(409).json({ success: false, message: 'The listing status or permits have changed. Please refresh your dashboard.' });
        }

        res.json({
            success: true,
            message: 'Boarding house has been reactivated and is now visible to students.'
        });
    } catch (err) {
        console.error('Reactivate Boarding House Error:', err.message);
        res.status(500).json({ success: false, message: err.message || 'Failed to reactivate boarding house.' });
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
                (SELECT COUNT(*) FROM occupants o WHERE o.room_id = r.id AND o.check_out_date IS NULL) AS occupant_count,
                (SELECT COUNT(*) FROM bookings b WHERE b.room_id = r.id AND b.status = 'confirmed' AND b.check_in_date <= CURDATE()
                    AND (b.move_in_required = 1 OR (b.payment_method = 'paymongo' AND b.payment_status != 'paid')) AND b.payment_review_required = 0
                    AND NOT EXISTS (SELECT 1 FROM occupants ro WHERE ro.reference_no = CONCAT('REF-', IF(CHAR_LENGTH(b.id) < 4, LPAD(b.id,4,'0'),b.id)))) AS reserved_count,
                (SELECT COUNT(*) FROM bookings b WHERE b.room_id = r.id AND b.status = 'confirmed' AND b.check_in_date > CURDATE()
                    AND (b.move_in_required = 1 OR (b.payment_method = 'paymongo' AND b.payment_status != 'paid')) AND b.payment_review_required = 0
                    AND NOT EXISTS (SELECT 1 FROM occupants ro WHERE ro.reference_no = CONCAT('REF-', IF(CHAR_LENGTH(b.id) < 4, LPAD(b.id,4,'0'),b.id)))) AS upcoming_reserved_count,
                (SELECT COUNT(*) FROM bookings b WHERE b.room_id = r.id AND b.status = 'pending') AS pending_request_count
             FROM rooms r
             WHERE r.house_id = ? AND (r.deleted_at IS NULL OR r.deleted_at = 0)`,
            [req.params.houseId]
        );

        const [archivedRooms] = await pool.query(
            `SELECT r.*, 
                (SELECT COUNT(*) FROM occupants o WHERE o.room_id = r.id AND o.check_out_date IS NULL) AS occupant_count,
                (SELECT COUNT(*) FROM bookings b WHERE b.room_id = r.id AND b.status = 'confirmed' AND b.check_in_date <= CURDATE()
                    AND (b.move_in_required = 1 OR (b.payment_method = 'paymongo' AND b.payment_status != 'paid')) AND b.payment_review_required = 0
                    AND NOT EXISTS (SELECT 1 FROM occupants ro WHERE ro.reference_no = CONCAT('REF-', IF(CHAR_LENGTH(b.id) < 4, LPAD(b.id,4,'0'),b.id)))) AS reserved_count,
                (SELECT COUNT(*) FROM bookings b WHERE b.room_id = r.id AND b.status = 'confirmed' AND b.check_in_date > CURDATE()
                    AND (b.move_in_required = 1 OR (b.payment_method = 'paymongo' AND b.payment_status != 'paid')) AND b.payment_review_required = 0
                    AND NOT EXISTS (SELECT 1 FROM occupants ro WHERE ro.reference_no = CONCAT('REF-', IF(CHAR_LENGTH(b.id) < 4, LPAD(b.id,4,'0'),b.id)))) AS upcoming_reserved_count,
                (SELECT COUNT(*) FROM bookings b WHERE b.room_id = r.id AND b.status = 'pending') AS pending_request_count
             FROM rooms r
             WHERE r.house_id = ? AND r.deleted_at IS NOT NULL AND r.deleted_at != 0`,
            [req.params.houseId]
        );

        res.json({ success: true, house: houseRows[0], rooms, archivedRooms });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// F. POST - Add a new room
router.post('/rooms/add/:houseId', authenticateToken, verifyOwner, upload.array('room_photos', 6), validateImages, validateBody('room'), async (req, res) => {
    let connection;
    let transactionOpen = false;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        transactionOpen = true;
        const { room_number, gender_type, capacity, price } = req.body;

        const [houseRows] = await connection.query(
            'SELECT price FROM boarding_houses WHERE id = ? AND owner_id = ? FOR UPDATE',
            [req.params.houseId, req.user.id]
        );

        if (houseRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Unauthorized action.' });
        }

        const input = parseRoomInput(room_number, capacity);
        if (input.error) return res.status(400).json({ success: false, message: input.error });

        // The house lock serializes room additions and edits without changing the schema.
        const [duplicates] = await connection.query(
            'SELECT id FROM rooms WHERE house_id = ? AND TRIM(room_number) = ?',
            [req.params.houseId, input.roomNumber]
        );
        if (duplicates.length > 0) {
            return res.status(409).json({ success: false, message: 'This room number already exists in this property, including archived rooms. Please use a different number or restore the existing room.' });
        }

        const basePrice = houseRows[0].price || 0;
        const roomPrice = (price !== undefined && price !== null && price !== '') ? parseFloat(price) : basePrice;

        const [createdRoom] = await connection.query(
            "INSERT INTO rooms (house_id, room_number, gender_type, capacity, price, status) VALUES (?, ?, ?, ?, ?, 'available')",
            [req.params.houseId, input.roomNumber, gender_type || 'female', input.capacity, roomPrice]
        );

        await saveRoomDetails(connection, createdRoom.insertId, req, {}, true);

        await connection.commit();
        transactionOpen = false;
        res.json({ success: true, message: 'Room created successfully.' });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.status === 400 ? err.message : 'Could not save this room. Please try again.' });
    } finally {
        if (connection) {
            try { if (transactionOpen) await connection.rollback(); }
            finally { connection.release(); }
        }
    }
});

// Occupants and approved reservations both consume a room's capacity.
async function getRoomCapacityUsage(connection, roomId) {
    const [occupants] = await connection.query(
        'SELECT COUNT(*) AS count FROM occupants WHERE room_id = ? AND check_out_date IS NULL',
        [roomId]
    );
    const [reservations] = await connection.query(
        `SELECT COUNT(*) AS count FROM bookings b
         WHERE b.room_id = ? AND b.status = 'confirmed' AND (b.move_in_required = 1 OR (b.payment_method = 'paymongo' AND b.payment_status != 'paid')) AND b.payment_review_required = 0
         AND NOT EXISTS (SELECT 1 FROM occupants o
             WHERE o.reference_no = CONCAT('REF-', IF(CHAR_LENGTH(b.id) < 4, LPAD(b.id, 4, '0'), b.id))
             )`,
        [roomId]
    );
    const requiredCapacity = Math.max(Number(occupants[0].count), await roomStayUsage(connection,roomId,{start:manilaToday(),end:'9999-12-31'}));
    return { occupants: Number(occupants[0].count), reserved: Number(reservations[0].count), requiredCapacity };
}

function parseRoomInput(roomNumber, capacity) {
    const validNumberType = typeof roomNumber === 'string' || (typeof roomNumber === 'number' && Number.isFinite(roomNumber));
    const normalized = validNumberType ? String(roomNumber).trim() : '';
    if (!normalized) return { error: 'Room number is required.' };
    if (Array.from(normalized).length > 50) return { error: 'Room number must be 50 characters or fewer.' };
    if (!['string', 'number'].includes(typeof capacity)) {
        return { error: 'Capacity must be a whole number of at least 1 within the supported range.' };
    }
    const parsedCapacity = Number(capacity);
    if (!Number.isInteger(parsedCapacity) || parsedCapacity < 1 || parsedCapacity > 2147483647) {
        return { error: 'Capacity must be a whole number of at least 1 within the supported range.' };
    }
    return { roomNumber: normalized, capacity: parsedCapacity };
}

// F1. PUT - Edit an existing room
router.put('/rooms/edit/:roomId', authenticateToken, verifyOwner, upload.array('room_photos', 6), validateImages, validateBody('room'), async (req, res) => {
    let connection;
    let transactionOpen = false;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        transactionOpen = true;
        const { room_number, gender_type, capacity, price } = req.body;

        // Verify room belongs to owner's house
        const [roomRows] = await connection.query(
            `SELECT r.id, r.house_id, r.capacity, r.price, r.room_number, r.floor_label, r.amenities, r.photos, r.amenities_free, r.amenities_paid
             FROM rooms r 
             JOIN boarding_houses bh ON r.house_id = bh.id 
             WHERE r.id = ? AND bh.owner_id = ? FOR UPDATE`,
            [req.params.roomId, req.user.id]
        );

        if (roomRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Room not found or unauthorized action.' });
        }

        const roomPrice = (price !== undefined && price !== null && price !== '') ? parseFloat(price) : roomRows[0].price;

        const input = parseRoomInput(room_number, capacity);
        if (input.error) return res.status(400).json({ success: false, message: input.error });
        const parsedCapacity = input.capacity;

        // Keep non-name edits available for existing records; validate additions/renames.
        if (input.roomNumber !== String(roomRows[0].room_number ?? '').trim()) {
            const [duplicates] = await connection.query(
                'SELECT id FROM rooms WHERE house_id = ? AND TRIM(room_number) = ? AND id != ?',
                [roomRows[0].house_id, input.roomNumber, req.params.roomId]
            );
            if (duplicates.length > 0) {
                return res.status(409).json({ success: false, message: 'This room number already exists in this property, including archived rooms. Please use a different number.' });
            }
        }

        // Read after the room lock so concurrent additions/approvals cannot take these places.
        const usage = parsedCapacity < Number(roomRows[0].capacity) ? await getRoomCapacityUsage(connection, req.params.roomId) : null;
        if (usage && parsedCapacity < usage.requiredCapacity) {
            return res.status(400).json({
                success: false,
                message: usage.reserved > 0
                    ? `Cannot set capacity to ${parsedCapacity}. This room has ${usage.occupants} active occupant(s) and ${usage.reserved} approved reservation(s) reserved for their booked dates.`
                    : `Cannot set capacity to ${parsedCapacity}. This room currently has ${usage.occupants} active occupant(s).`
            });
        }

        await connection.query(
            `UPDATE rooms SET room_number = ?, gender_type = ?, capacity = ?, price = ? WHERE id = ?`,
            [input.roomNumber, gender_type || 'female', parsedCapacity, roomPrice, req.params.roomId]
        );

        await saveRoomDetails(connection, req.params.roomId, req, roomRows[0]);

        await connection.commit();
        transactionOpen = false;
        res.json({ success: true, message: 'Room details updated successfully.' });
    } catch (err) {
        console.error('Edit room error:', err.message);
        res.status(err.status || 500).json({ success: false, message: err.status === 400 ? err.message : 'Could not save this room. Please try again.' });
    } finally {
        if (connection) {
            try { if (transactionOpen) await connection.rollback(); }
            finally { connection.release(); }
        }
    }
});

// F2. DELETE - Delete a room (Guarded against rooms with active boarders)
router.delete('/rooms/delete/:roomId', authenticateToken, verifyOwner, validateBody('ids'), async (req, res) => {
    let connection;
    let transactionOpen = false;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        transactionOpen = true;
        // Verify ownership
        const [roomRows] = await connection.query(
            `SELECT r.id, r.house_id 
             FROM rooms r 
             JOIN boarding_houses bh ON r.house_id = bh.id 
             WHERE r.id = ? AND bh.owner_id = ? FOR UPDATE`,
            [req.params.roomId, req.user.id]
        );

        if (roomRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Room not found or unauthorized action.' });
        }

        const usage = await getRoomCapacityUsage(connection, req.params.roomId);
        if (usage.occupants > 0) {
            return res.status(400).json({ success: false, message: 'Cannot delete room with active occupants. Please check out or relocate boarders first.' });
        }
        if (usage.reserved > 0) {
            return res.status(400).json({ success: false, message: 'Cannot archive room with approved reservations awaiting payment. Resolve those reservations first.' });
        }

        await connection.query('UPDATE rooms SET deleted_at = NOW() WHERE id = ?', [req.params.roomId]);

        await connection.commit();
        transactionOpen = false;
        res.json({ success: true, message: 'Room soft-deleted successfully.' });
    } catch (err) {
        console.error('Delete room error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        if (connection) {
            try { if (transactionOpen) await connection.rollback(); }
            finally { connection.release(); }
        }
    }
});

// F3. POST - Restore a soft-deleted room
router.post('/rooms/restore/:roomId', authenticateToken, verifyOwner, validateBody('ids'), async (req, res) => {
    try {
        const [roomRows] = await pool.query(
            `SELECT r.id 
             FROM rooms r 
             JOIN boarding_houses bh ON r.house_id = bh.id 
             WHERE r.id = ? AND bh.owner_id = ?`,
            [req.params.roomId, req.user.id]
        );

        if (roomRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Room not found or unauthorized action.' });
        }

        await pool.query('UPDATE rooms SET deleted_at = NULL WHERE id = ?', [req.params.roomId]);

        res.json({ success: true, message: 'Room restored successfully.' });
    } catch (err) {
        console.error('Restore room error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// =========================================================================
// BOARDING HOUSE REMOVAL ENDPOINT
// =========================================================================

// DELETE - Remove a boarding house (Guarded against houses with active occupants)
router.delete('/boarding-houses/:houseId', authenticateToken, verifyOwner, validateBody('ids'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Verify the house belongs to this owner
        const [houseRows] = await connection.query(
            'SELECT id, name FROM boarding_houses WHERE id = ? AND owner_id = ?',
            [req.params.houseId, req.user.id]
        );

        if (houseRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Boarding house not found or unauthorized action.' });
        }

        // Guard: block removal if any room has active occupants
        const [activeOccupants] = await connection.query(
            `SELECT COUNT(*) AS count
             FROM occupants o
             JOIN rooms r ON o.room_id = r.id
             WHERE r.house_id = ? AND o.check_out_date IS NULL`,
            [req.params.houseId]
        );

        if (activeOccupants[0].count > 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `Cannot remove this boarding house. There are ${activeOccupants[0].count} active occupant(s) still residing. Please check them out first.`
            });
        }

        // Hard delete — ON DELETE CASCADE handles rooms, bookings, checklist data, etc.
        await connection.query('DELETE FROM boarding_houses WHERE id = ? AND owner_id = ?', [req.params.houseId, req.user.id]);

        await connection.commit();
        res.json({ success: true, message: 'Boarding house removed successfully.' });
    } catch (err) {
        await connection.rollback();
        console.error('Remove boarding house error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to remove boarding house. Please try again.' });
    } finally {
        connection.release();
    }
});

// F1. PUT - Edit an existing room
router.put('/rooms/edit/:roomId', authenticateToken, verifyOwner, validateBody('room'), async (req, res) => {
    let connection;
    let transactionOpen = false;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        transactionOpen = true;
        const { room_number, gender_type, capacity } = req.body;
        const roomId = parseInt(req.params.roomId);

        // Verify room belongs to owner's house
        const [roomRows] = await connection.query(
            `SELECT r.id, r.house_id, r.room_number, r.capacity
             FROM rooms r 
             JOIN boarding_houses bh ON r.house_id = bh.id 
             WHERE r.id = ? AND bh.owner_id = ? FOR UPDATE`,
            [roomId, req.user.id]
        );

        if (roomRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Room not found or unauthorized action.' });
        }

        const input = parseRoomInput(room_number, capacity);
        if (input.error) return res.status(400).json({ success: false, message: input.error });
        const parsedCapacity = input.capacity;

        // Keep non-name edits available for existing records; validate additions/renames.
        if (input.roomNumber !== String(roomRows[0].room_number ?? '').trim()) {
            const [duplicates] = await connection.query(
                'SELECT id FROM rooms WHERE house_id = ? AND TRIM(room_number) = ? AND id != ?',
                [roomRows[0].house_id, input.roomNumber, roomId]
            );
            if (duplicates.length > 0) {
                return res.status(409).json({ success: false, message: 'This room number already exists in this property, including archived rooms. Please use a different number.' });
            }
        }

        // Read after the room lock so concurrent additions/approvals cannot take these places.
        const usage = parsedCapacity < Number(roomRows[0].capacity) ? await getRoomCapacityUsage(connection, roomId) : null;
        if (usage && parsedCapacity < usage.requiredCapacity) {
            return res.status(400).json({
                success: false,
                message: usage.reserved > 0
                    ? `Cannot set capacity to ${parsedCapacity}. This room has ${usage.occupants} active occupant(s) and ${usage.reserved} approved reservation(s) for their booked dates.`
                    : `Cannot set capacity to ${parsedCapacity}. This room currently has ${usage.occupants} active occupant(s).`
            });
        }

        await connection.query(
            `UPDATE rooms SET room_number = ?, gender_type = ?, capacity = ? WHERE id = ?`,
            [input.roomNumber, gender_type || 'female', parsedCapacity, roomId]
        );

        await connection.commit();
        transactionOpen = false;
        res.json({ success: true, message: 'Room details updated successfully.' });
    } catch (err) {
        console.error('Edit room error:', err.message);
        res.status(500).json({ success: false, message: 'Database error while updating room. Please try again.' });
    } finally {
        if (connection) {
            try { if (transactionOpen) await connection.rollback(); }
            finally { connection.release(); }
        }
    }
});

// F2. DELETE - Delete a room (Guarded against rooms with active boarders)
router.delete('/rooms/delete/:roomId', authenticateToken, verifyOwner, validateBody('ids'), async (req, res) => {
    let connection;
    let transactionOpen = false;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        transactionOpen = true;
        // Verify ownership
        const [roomRows] = await connection.query(
            `SELECT r.id, r.house_id 
             FROM rooms r 
             JOIN boarding_houses bh ON r.house_id = bh.id 
             WHERE r.id = ? AND bh.owner_id = ? FOR UPDATE`,
            [req.params.roomId, req.user.id]
        );

        if (roomRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Room not found or unauthorized action.' });
        }

        const usage = await getRoomCapacityUsage(connection, req.params.roomId);
        if (usage.occupants > 0) {
            return res.status(400).json({ success: false, message: 'Cannot delete room with active occupants. Please check out or relocate boarders first.' });
        }
        if (usage.reserved > 0) {
            return res.status(400).json({ success: false, message: 'Cannot archive room with approved reservations awaiting payment. Resolve those reservations first.' });
        }

        await connection.query('UPDATE rooms SET deleted_at = NOW() WHERE id = ?', [req.params.roomId]);

        await connection.commit();
        transactionOpen = false;
        res.json({ success: true, message: 'Room soft-deleted successfully.' });
    } catch (err) {
        console.error('Delete room error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        if (connection) {
            try { if (transactionOpen) await connection.rollback(); }
            finally { connection.release(); }
        }
    }
});

// G. GET - Retrieve individual room details, active occupants, and pending reservations
router.get('/rooms/details/:roomId', authenticateToken, verifyOwner, async (req, res) => {
    try {
        const [roomRows] = await pool.query(
            `SELECT r.*, (SELECT COUNT(*) FROM bookings b WHERE b.room_id = r.id AND b.status = 'confirmed' AND b.check_in_date <= CURDATE()
                    AND (b.move_in_required = 1 OR (b.payment_method = 'paymongo' AND b.payment_status != 'paid')) AND b.payment_review_required = 0
                    AND NOT EXISTS (SELECT 1 FROM occupants ro WHERE ro.reference_no = CONCAT('REF-', IF(CHAR_LENGTH(b.id) < 4, LPAD(b.id,4,'0'),b.id)))) AS reserved_count,
                (SELECT COUNT(*) FROM bookings b WHERE b.room_id = r.id AND b.status = 'confirmed' AND b.check_in_date > CURDATE()
                    AND (b.move_in_required = 1 OR (b.payment_method = 'paymongo' AND b.payment_status != 'paid')) AND b.payment_review_required = 0
                    AND NOT EXISTS (SELECT 1 FROM occupants ro WHERE ro.reference_no = CONCAT('REF-', IF(CHAR_LENGTH(b.id) < 4, LPAD(b.id,4,'0'),b.id)))) AS upcoming_reserved_count, bh.price as house_price, bh.advance_months, bh.deposit_months, bh.deposit_type, bh.id as house_id
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
             WHERE o.room_id = ? AND o.check_out_date IS NULL`,
            [req.params.roomId]
        );

        const [pendingBookings] = await pool.query(
            `SELECT b.*, u.name as student_name, u.phone as contact_number, u.profile_pic
             FROM bookings b
             JOIN users u ON b.student_id = u.id
             WHERE b.room_id = ? AND b.status = 'pending'`,
            [req.params.roomId]
        );

        const [upcomingBookings] = await pool.query(
            `SELECT b.*, u.name AS student_name, u.profile_pic FROM bookings b JOIN users u ON u.id=b.student_id
             WHERE b.room_id=? AND b.status='confirmed' AND b.move_in_confirmed_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM occupants o WHERE o.reference_no=CONCAT('REF-',IF(CHAR_LENGTH(b.id)<4,LPAD(b.id,4,'0'),b.id)))
             ORDER BY b.check_in_date,b.id`,[req.params.roomId]);
        res.json({ success: true, room: roomRows[0], occupants, pendingBookings, upcomingBookings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// H. POST - Manually add a non-CSPC occupant
router.post('/rooms/occupants/add/:roomId', authenticateToken, verifyOwner, validateBody('occupant'), async (req, res) => {
    let connection;
    let transactionOpen = false;
    try {
        connection = await pool.getConnection();
        const { roomId } = req.params;
        const { name, age, contact_number, check_in_date, months, emergency_contact, guardian_name, payment_status, upfront_status, address } = req.body;

        const [roomRows] = await connection.query(
            `SELECT r.*, 
                (SELECT COUNT(*) FROM occupants o WHERE o.room_id = r.id AND o.check_out_date IS NULL) AS current_count
             FROM rooms r
             JOIN boarding_houses bh ON r.house_id = bh.id
             WHERE r.id = ? AND bh.owner_id = ? AND r.deleted_at IS NULL`,
            [roomId, req.user.id]
        );

        if (roomRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Room configuration mismatch.' });
        }

        const targetRoom = roomRows[0];
        if (targetRoom.current_count >= targetRoom.capacity) {
            return res.status(400).json({ success: false, message: 'Room has reached maximum occupant capacity.' });
        }

        // The existing upfront toggle lazily creates this column. Manual additions
        // also need it so the owner's choice is stored on the first occupant.
        const [upfrontColumns] = await connection.query("SHOW COLUMNS FROM occupants LIKE 'upfront_status'");
        if (upfrontColumns.length === 0) {
            try {
                await connection.query("ALTER TABLE occupants ADD COLUMN upfront_status VARCHAR(50) DEFAULT 'Unpaid'");
            } catch (err) {
                if (err.code !== 'ER_DUP_FIELDNAME') throw err;
            }
        }

        // Keep the existing lazy column setup outside the transaction: ALTER TABLE releases locks.
        await connection.beginTransaction();
        transactionOpen = true;
        const [currentRooms] = await connection.query(
            `SELECT r.* FROM rooms r JOIN boarding_houses bh ON bh.id = r.house_id
             WHERE r.id = ? AND bh.owner_id = ? AND r.deleted_at IS NULL FOR UPDATE`,
            [roomId, req.user.id]
        );
        if (currentRooms.length === 0) {
            return res.status(404).json({ success: false, message: 'Room is unavailable or access denied.' });
        }
        const usage = await getRoomCapacityUsage(connection, roomId);
        if (usage.occupants >= currentRooms[0].capacity) {
            return res.status(400).json({ success: false, message: 'Room has reached maximum occupant capacity.' });
        }


        const manualPeriod = stayPeriod(check_in_date || manilaToday(),parseInt(months)||1);
        if (await roomStayUsage(connection,roomId,manualPeriod) >= Number(currentRooms[0].capacity)) return res.status(409).json({success:false,message:'This stay would overlap a reserved bed. Choose different dates or a room with availability for the entire stay.'});

        const upfrontStatus = upfront_status === 'Paid' ? 'Paid' : 'Unpaid';

        const checkIn = check_in_date || manilaToday();
        const monthlyRent = parseFloat(currentRooms[0].price || 0);
        const totalAmount = monthlyRent * (parseInt(months) || 1);
        if (!Number.isFinite(totalAmount) || totalAmount < 0 || totalAmount > 99999999.99) {
            return res.status(400).json({ success: false, message: 'The total rent exceeds the supported amount. Please reduce the duration or check the room rent.' });
        }

        await connection.query(
            `INSERT INTO occupants (
                room_id, student_id, reference_no, name, age, address, 
                contact_number, emergency_contact, guardian_name, check_in_date, 
                months, amount, payment_status, upfront_status, is_non_cspc
            ) VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
                roomId, name, parseInt(age) || null, address || '',
                contact_number || '', emergency_contact || '', guardian_name || '',
                checkIn, parseInt(months) || 1, totalAmount, payment_status || 'Not Paid', upfrontStatus
            ]
        );

        await connection.commit();
        transactionOpen = false;
        res.json({ success: true, message: 'Manual non-CSPC boarder added.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    } finally {
        if (connection) {
            try { if (transactionOpen) await connection.rollback(); }
            finally { connection.release(); }
        }
    }
});

// I. POST - Toggle occupant payment status (Transaction-safe: Syncs with bookings)
router.post('/rooms/occupants/payment/:id', authenticateToken, verifyOwner, validateBody('monthlyRent'), async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const { status } = req.body;
        const targetStatus = status || 'Paid';

        if (!['Paid', 'Not Paid'].includes(targetStatus)) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Invalid monthly rent status.' });
        }
        const [owned] = await connection.query(
            `SELECT o.student_id, o.room_id, o.reference_no FROM occupants o JOIN rooms r ON r.id = o.room_id
             JOIN boarding_houses bh ON bh.id = r.house_id WHERE o.id = ? AND bh.owner_id = ?`,
            [req.params.id, req.user.id]);
        if (!owned.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Occupant not found or access denied.' });
        }

        const payingOccupant=owned[0];
        if (payingOccupant.student_id) await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE',[payingOccupant.student_id]);
        if (payingOccupant.reference_no) {
            const [linked]=await connection.query("SELECT id, status, expiry_reason FROM bookings WHERE id = ? FOR UPDATE",[bookingIdFromReference(payingOccupant.reference_no)]);
            if (linked[0]?.expiry_reason==='cash_no_show') { await connection.rollback(); return res.status(409).json({success:false,message:'This booking was closed as a cash no-show, so a payment cannot be recorded on it.'}); }
        }
        await connection.query('SELECT id FROM rooms WHERE id = ? FOR UPDATE',[payingOccupant.room_id]);

        // Monthly rent is separate from verified online move-in payment.
        await connection.query(
            'UPDATE occupants SET payment_status = ? WHERE id = ?',
            [targetStatus, req.params.id]
        );

        // 2. Fetch occupant details to identify student_id and room_id
        const occupantRows = owned;

        if (occupantRows.length > 0 && occupantRows[0].student_id) {
            const { student_id, room_id } = occupantRows[0];
            const bookingStatus = targetStatus.toLowerCase() === 'paid' ? 'paid' : 'unpaid';

            // 3. Synchronize status with the active booking record
            await connection.query(
                `UPDATE bookings SET payment_status = ? 
                 WHERE id = ? AND status = 'confirmed'
                 AND payment_method = 'cash'`,
                [bookingStatus, bookingIdFromReference(occupantRows[0].reference_no)]
            );
        }

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('[OCCUPANT PAYMENT SYNC ERROR]:', err.message);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        connection?.release();
    }
});

// I-2. POST - Toggle occupant Move-in Upfront Fee payment status (for cash bookings/manual boarders)
router.post('/rooms/occupants/upfront-payment/:id', authenticateToken, verifyOwner, validateBody('upfront'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Reject missing or other-owner occupants before any update or schema check.
        const [occupantRows] = await connection.query(
            `SELECT o.id, o.student_id, o.room_id, o.reference_no FROM occupants o
             JOIN rooms r ON r.id = o.room_id
             JOIN boarding_houses bh ON bh.id = r.house_id
             WHERE o.id = ? AND bh.owner_id = ?`,
            [req.params.id, req.user.id]
        );
        if (occupantRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Occupant not found or access denied.' });
        }

        // Lock in the same order as no-show cancellation and automatic starts.
        const occupant=occupantRows[0];
        if (occupant.student_id) await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE',[occupant.student_id]);
        if (occupant.reference_no) {
            const [linked]=await connection.query("SELECT id, status, expiry_reason, payment_method, paymongo_payment_id FROM bookings WHERE id = ? FOR UPDATE",[bookingIdFromReference(occupant.reference_no)]);
            if (linked[0]?.payment_method==='paymongo' && linked[0]?.paymongo_payment_id) { await connection.rollback(); return res.status(409).json({success:false,message:'Verified online upfront payments cannot be changed using the cash collection control.'}); }
            if (linked[0]?.expiry_reason==='cash_no_show') { await connection.rollback(); return res.status(409).json({success:false,message:'This booking was closed as a cash no-show, so a payment cannot be recorded on it.'}); }
        }
        await connection.query('SELECT id FROM rooms WHERE id = ? FOR UPDATE',[occupant.room_id]);
        await connection.query('SELECT id, upfront_status FROM occupants WHERE id = ? FOR UPDATE',[req.params.id]);

        const { status } = req.body;
        const targetStatus = status || 'Paid';

        // 1. Update the occupant's upfront payment status
        await connection.query(
            'UPDATE occupants SET upfront_status = ? WHERE id = ?',
            [targetStatus, req.params.id]
        );

        await connection.commit();
        res.json({ success: true, message: `Upfront payment status updated to ${targetStatus}.` });
    } catch (err) {
        await connection.rollback();
        console.error('[UPFRONT PAYMENT TOGGLE ERROR]:', err.message);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        connection.release();
    }
});

// I-3. POST - Confirm that an automatically started boarder physically arrived
router.post('/rooms/occupants/arrival/:id', authenticateToken, verifyOwner, validateBody('ids'), async (req, res) => {
    try { res.json(await confirmOccupantArrival(pool, req.user.id, req.params.id)); }
    catch (error) { res.status(error.status || 500).json({ success:false, message:error.status ? error.message : 'Could not confirm arrival. Please try again.' }); }
});

// J. POST - Checkout boarder (Transaction-safe: notifies student on check-out)
router.post('/rooms/occupants/checkout/:id', authenticateToken, verifyOwner, validateBody('ids'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Pre-fetch occupant record + linked boarding house name before mutating
        const [occupantRows] = await connection.query(
            `SELECT o.student_id, o.room_id, o.reference_no, bh.name AS house_name
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

        if (student_id) await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE',[student_id]);
        await connection.query('SELECT id FROM rooms WHERE id = ? FOR UPDATE',[room_id]);
        const [checkoutRows] = await connection.query('SELECT id, check_out_date, arrival_confirmed_at, non_arrival_recorded_at FROM occupants WHERE id = ? FOR UPDATE',[req.params.id]);
        if (!checkoutRows.length || checkoutRows[0].check_out_date) { await connection.rollback(); return res.status(409).json({success:false,message:'Checkout is already recorded. Refresh the room details.'}); }
        // Checkout would mark a stay Completed for a student the owner recorded as never arriving.
        if (checkoutRows[0].non_arrival_recorded_at && !checkoutRows[0].arrival_confirmed_at) { await connection.rollback(); return res.status(409).json({success:false,message:'This student is recorded as not arrived, so checkout is not available. Confirm arrival if the student has moved in, or close the stay as "Did not arrive" from Bookings to free the bed.'}); }

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
                 WHERE id = ? AND status = 'confirmed'`,
                [bookingIdFromReference(occupantRows[0].reference_no)]
            );

            // 4. Notify the student via the notifications inbox
            const checkoutMsg = `NOTICE: Your residency at "${house_name}" has been checked out by the property owner. We hope you had a comfortable stay.`;
            await connection.query(
                'INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',
                [student_id, checkoutMsg, '/student/bookings']
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
            SELECT b.*,
                   (b.payment_method = 'paymongo' AND b.paymongo_payment_id IS NOT NULL AND (b.move_in_required = 0 OR b.payment_review_required = 1 OR b.status != 'confirmed')
                    AND NOT EXISTS (SELECT 1 FROM occupants po WHERE po.reference_no = CONCAT('REF-', IF(CHAR_LENGTH(b.id) < 4, LPAD(b.id, 4, '0'), b.id)))) AS payment_requires_review,
                   u.name as student_name, u.phone as contact_number, u.profile_pic, u.address, u.guardian_name,
                   r.room_number, r.gender_type as room_gender,
                   ob.check_in_date AS occupant_check_in, ob.check_out_date AS occupant_check_out,
                   ob.payment_status AS occupant_payment_status, ob.upfront_status AS occupant_upfront_status,
                   ob.id AS occupant_id, ob.arrival_required AS occupant_arrival_required, ob.arrival_confirmed_at AS occupant_arrival_confirmed_at,
                   ob.non_arrival_recorded_at AS occupant_non_arrival_recorded_at, ob.non_arrival_note AS occupant_non_arrival_note,
                   bh.name as house_name, bh.location as house_location, bh.advance_months, bh.deposit_months, bh.deposit_type
            FROM bookings b
            JOIN users u ON b.student_id = u.id
            JOIN rooms r ON b.room_id = r.id
            JOIN boarding_houses bh ON r.house_id = bh.id
            LEFT JOIN occupants ob ON ob.reference_no = CONCAT('REF-', LPAD(b.id, GREATEST(4,CHAR_LENGTH(b.id)), '0'))
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
            const initial_payment = b.upfront_amount != null ? Number(b.upfront_amount) : (Math.max(1, advM) * rent) + (depM * rent);

            return {
                ...b,
                initial_payment
            };
        });

        // Non-CSPC boarders are added straight into occupants (no booking row),
        // so surface them here too, shaped like bookings, for the monitoring list.
        let walkInQuery = `
            SELECT o.id, o.room_id, bh.id AS house_id, o.reference_no, o.name AS student_name, o.contact_number, o.address,
                   o.emergency_contact, o.guardian_name, o.check_in_date, o.check_out_date,
                   o.months, o.amount, o.payment_status, o.payment_method, o.upfront_status,
                   o.created_at AS booking_date,
                   r.room_number, r.gender_type AS room_gender, r.price AS monthly_rent,
                   bh.name AS house_name, bh.location AS house_location,
                   bh.advance_months, bh.deposit_months, bh.deposit_type
            FROM occupants o
            JOIN rooms r ON o.room_id = r.id
            JOIN boarding_houses bh ON r.house_id = bh.id
            WHERE bh.owner_id = ? AND o.is_non_cspc = 1
        `;
        const walkInParams = [req.user.id];
        if (houseId) {
            walkInQuery += ' AND bh.id = ?';
            walkInParams.push(houseId);
        }
        const [walkIns] = await pool.query(walkInQuery, walkInParams);

        const walkInRows = walkIns.map(o => {
            // This is an actual recorded checkout, not the projected stay end.
            // Resetting the test clock must never reopen a closed manual stay.
            const checkedOut = o.check_out_date != null && o.check_out_date !== '';
            const rent = parseFloat(o.monthly_rent || 0);
            return {
                ...o,
                is_non_cspc: 1,
                status: checkedOut ? 'completed' : 'confirmed',
                payment_status: String(o.payment_status || '').toLowerCase() === 'paid' ? 'paid' : 'unpaid',
                payment_method: o.payment_method || 'cash',
                total_amount: o.amount,
                initial_payment: (Math.max(1, parseInt(o.advance_months || 0)) * rent) + (parseInt(o.deposit_months || 0) * rent)
            };
        });

        const allRows = [...processedBookings, ...walkInRows]
            .sort((a, b) => new Date(b.booking_date || 0) - new Date(a.booking_date || 0));

        const houseName = allRows.length > 0 && houseId ? allRows[0].house_name : '';

        res.json({ success: true, bookings: allRows, houseName });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// L (POST /bookings/approve/:id)
router.post('/bookings/approve/:id', authenticateToken, verifyOwner, validateBody('ids'), async (req, res) => {
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
             WHERE b.id = ? AND bh.owner_id = ?`,
            [bookingId, req.user.id]
        );

        if (bookingRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Reservation request record not found or access denied.' });
        }

        const b = bookingRows[0];

        // Match submission lock order: student first, then booking/room.
        await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [b.student_id]);
        const [currentBookings] = await connection.query('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [bookingId]);
        const currentBooking = currentBookings[0];
        if (!currentBooking) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Reservation request no longer exists.' });
        }
        if (currentBooking.status==='pending' && Number(currentBooking.renewal_waiting)) { await connection.rollback(); return res.status(409).json({success:false,message:'This request is waiting for a renewal decision. It cannot be approved or paid yet. The system will notify you when review can proceed.'}); }
        if (currentBooking.status === 'confirmed') {
            await connection.rollback();
            return res.json({ success: true, message: 'This reservation is already approved.' });
        }
        if (currentBooking.owner_response_due_at && new Date(currentBooking.owner_response_due_at).getTime() <= bookingNow().getTime()) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'The owner response deadline has passed. This request can no longer be approved.', errorCode: 'reservation_expired' });
        }
        if (currentBooking.status !== 'pending') {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'This reservation is no longer pending. Please refresh the booking list.' });
        }
        const period = stayPeriod(currentBooking.check_in_date,currentBooking.months);
        if (await studentStayConflict(connection,b.student_id,period,{excludeBookingId:b.id,includePending:false})) {
            await connection.rollback();
            return res.status(409).json({ success:false, message:'This reservation overlaps another booking or stay for this student.', errorCode:'stay_overlap' });
        }
        const [eligibleRooms] = await connection.query("SELECT r.id, r.capacity FROM rooms r JOIN boarding_houses bh ON bh.id = r.house_id WHERE r.id = ? AND bh.owner_id = ? AND r.deleted_at IS NULL AND bh.house_status = 'accredited' FOR UPDATE", [b.room_id, req.user.id]);
        if (eligibleRooms.length === 0) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'This room or boarding house is no longer available for booking.' });
        }

        const roomConfig = eligibleRooms[0];
        if (await roomStayUsage(connection,b.room_id,period,{excludeBookingId:b.id}) >= Number(roomConfig.capacity)) {
            await connection.rollback();
            return res.status(409).json({ success:false, message:'No bed is available throughout these reservation dates.', errorCode:'capacity_full' });
        }

        if(currentBooking.payment_method==='paymongo') {
            await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE',[req.user.id]);
            try { await requireOwnerPayments(connection,currentBooking.house_id); }
            catch(error) { if(error.status!==409)throw error;await connection.rollback();return res.status(409).json({success:false,errorCode:'online_payment_unavailable',message:'Your online payment connection is not ready. Open Online payments to restore it before approving this online request. The student can request cash payment from their booking details; that request requires your approval.'}); }
        }
        const paymentDueAt = currentBooking.payment_method === 'paymongo' ? onlinePaymentDeadline(currentBooking.check_in_date, bookingNow()) : null;
        if (currentBooking.payment_method === 'paymongo' && !paymentDueAt) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'Less than 2 hours remain before the end of the check-in day, so there is not enough time to pay online. Reject the request; the student can book again with a later date or choose cash.', errorCode: 'payment_cutoff_passed' });
        }
        // Keep the upfront amount agreed at approval, even if the property's advance/deposit terms change later.
        const rent = parseFloat(currentBooking.monthly_rent || 0);
        const upfrontAmount = Math.round(((Math.max(1, parseInt(b.advance_months || 0)) + parseInt(b.deposit_months || 0)) * rent) * 100) / 100;

        // 1. Confirm the booking status
        await connection.query(
            "UPDATE bookings SET status = 'confirmed', move_in_required = 1, payment_due_at = ?, upfront_amount = ? WHERE id = ?",
            [paymentDueAt, Number.isFinite(upfrontAmount) ? upfrontAmount : null, bookingId]
        );

        // Future approvals reserve; eligible due bookings start within this transaction.
        await startBookedStay(connection,{...b,...currentBooking,status:'confirmed',move_in_required:1});

        // 3. Dispatch the appropriate notification
        const notificationMsg = b.payment_method === 'paymongo'
            ? `RESERVATION APPROVED: Your booking request has been approved! Please complete your online payment by ${paymentDueAt.toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} to secure your room. Payment reserves your bed. Your secured stay starts automatically on the booked check-in date; checkout remains the booked end date. Before you pay: ${PAID_RESERVATION_POLICY}`
            : `RESERVATION APPROVED: Your booking request has been confirmed! Your bed is reserved. Pay the upfront move-in cost in cash when you arrive. Your stay starts automatically on the booked check-in date. Cash remains unpaid until the owner records collection.`;

        await connection.query(
            'INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',
            [b.student_id, notificationMsg, `/student/bookings/${b.id}`]
        );
        await notifyRenewalIncomingApproved(connection,currentBooking,req.user.id);

        await connection.commit();
        let closed = 0;
        try {
            const released = await rejectUnfittablePending(pool, b.room_id, { excludeBookingId: b.id, onRejected:(c,rejected)=>notifyRenewalIncomingClosed(c,rejected,req.user.id,'closed because no bed remains for its dates') });
            closed = released.rejected;
            if (released.failed) console.error('[PENDING REQUEST RELEASE]', released.failed, 'request(s) could not be rechecked for room', b.room_id);
        } catch (error) { console.error('[PENDING REQUEST RELEASE]', error.message); }
        res.json({ success: true, message: 'Reservation request successfully approved.' + (closed ? ` ${closed} other pending request${closed === 1 ? ' was' : 's were'} closed because no bed is left for ${closed === 1 ? 'its' : 'their'} dates.` : '') });
    } catch (err) {
        await connection.rollback();
        console.error('Booking approval error:', err.message);
        res.status(500).json({ success: false, message: 'Transaction rolled back. Failed to process approval.' });
    } finally {
        connection.release();
    }
});

// The old manual transition is retired; cash no-show review remains owner-controlled.
router.post('/bookings/move-in/:id', authenticateToken, verifyOwner, validateBody('ids'), async (req, res) => {
    res.status(410).json({success:false,message:'Booked stays start automatically on their scheduled check-in date. Refresh Bookings; no move-in confirmation is needed.'});
});
router.post('/bookings/cancellation-review/:id', authenticateToken, verifyOwner, validateBody('ids'), async(req,res)=>{
 try{res.json(await reviewPaidCancellation(pool,req.user.id,req.params.id,req.body));}catch(error){res.status(error.status || 500).json({success:false,message:error.status ? error.message : 'Could not update the cancellation review.'});}
});
router.post('/bookings/cancel-reservation/:id', authenticateToken, verifyOwner, validateBody('ids'), async (req,res) => {
 try { res.json(await cancelFutureReservation(pool,req.user.id,req.params.id,{reason:req.body.reason})); }
 catch(error) { res.status(error.status || 500).json({success:false,message:error.status ? error.message : 'Could not cancel this reservation. Please try again.'}); }
});
// Paid stays whose student never arrives: attendance records, not cancellation (docs/paid-non-arrival.md).
router.post('/bookings/non-arrival/:id', authenticateToken, verifyOwner, validateBody('ids'), async (req, res) => {
    try { res.json(await recordNonArrival(pool, req.user.id, req.params.id, { note:req.body.note })); }
    catch (error) { res.status(error.status || 500).json({ success:false, message:error.status ? error.message : 'Could not record non-arrival. Please try again.' }); }
});
router.post('/bookings/non-arrival/close/:id', authenticateToken, verifyOwner, validateBody('ids'), async (req, res) => {
    try { res.json(await closeNonArrival(pool, req.user.id, req.params.id)); }
    catch (error) { res.status(error.status || 500).json({ success:false, message:error.status ? error.message : 'Could not close this stay. Please try again.' }); }
});
router.post('/bookings/no-show/:id', authenticateToken, verifyOwner, validateBody('ids'), async (req, res) => {
    try { res.json(await updateBookingArrival(pool, req.user.id, req.params.id, { noShow:true })); }
    catch (error) { res.status(error.status || 500).json({ success:false, message:error.status ? error.message : 'Could not update the no-show. Please try again.' }); }
});

// M. POST - Reject Student Reservation Booking Request
router.post('/bookings/reject/:id', authenticateToken, verifyOwner, validateBody('ids'), async (req, res) => {
    try {
        const [bookingRows] = await pool.query(
            `SELECT b.student_id, b.id, b.renewal_waiting, b.renewal_sources, b.room_id
             FROM bookings b
             JOIN rooms r ON b.room_id = r.id
             JOIN boarding_houses bh ON r.house_id = bh.id
             WHERE b.id = ? AND bh.owner_id = ?`,
            [req.params.id, req.user.id]
        );
        if (bookingRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Record not found or access denied.' });
        }

        if(Number(bookingRows[0].renewal_waiting))return res.json(await rejectRenewalIncoming(pool,req.user.id,req.params.id));
        const [rejectResult] = await pool.query("UPDATE bookings SET status = 'rejected' WHERE id = ? AND status = 'pending'", [req.params.id]);
        if (rejectResult.affectedRows === 0) {
            return res.status(409).json({ success: false, message: 'Only a pending reservation can be rejected. Please refresh the booking list.' });
        }

        const rejectMsg = `RESERVATION UPDATE: Your booking request REF-${bookingRows[0].id.toString().padStart(4, '0')} was not approved by the landlord.`;
        await pool.query(
            'INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',
            [bookingRows[0].student_id, rejectMsg, `/student/bookings/${bookingRows[0].id}`]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// N. POST - Approve Stay Extension
router.post('/bookings/approve-extension/:id', authenticateToken, verifyOwner, validateBody('ids'), async (req, res) => {
    const bookingId = req.params.id;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [extensionOwner] = await connection.query('SELECT b.student_id FROM bookings b JOIN boarding_houses bh ON bh.id = b.house_id WHERE b.id = ? AND bh.owner_id = ?', [bookingId,req.user.id]);
        if (!extensionOwner.length) { await connection.rollback(); return res.status(404).json({success:false,message:'Booking not found or access denied.'}); }
        await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE',[extensionOwner[0].student_id]);
        const [booking] = await connection.query(
            `SELECT b.* 
             FROM bookings b
             JOIN rooms r ON b.room_id = r.id
             JOIN boarding_houses bh ON r.house_id = bh.id
             WHERE b.id = ? AND bh.owner_id = ? FOR UPDATE`,
            [bookingId, req.user.id]
        );
        if (booking.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Booking not found or access denied.' });
        }

        const b = booking[0];
        if (Number(b.move_in_required) === 1 && !b.move_in_confirmed_at) {
            await connection.rollback();
            return res.status(409).json({ success:false, message:'Stay extensions are available after the booked stay starts.' });
        }

        const extraMonths = Number(b.extension_months);
        const newTotalMonths = Number(b.months) + extraMonths;
        if (b.status !== 'confirmed' || !b.is_extension_requested) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'This booking has no eligible pending extension. Please refresh the booking list.' });
        }
        if (!Number.isInteger(extraMonths) || extraMonths < 1 || !Number.isInteger(newTotalMonths) || newTotalMonths < 1 || newTotalMonths > 2147483647) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Invalid extension duration.' });
        }
        const startDate = b.check_in_date ? new Date(b.check_in_date) : null;
        if (startDate && (isNaN(startDate.getTime()) || startDate.getFullYear() * 12 + startDate.getMonth() + newTotalMonths > 9999 * 12 + 11)) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'The extension exceeds the supported check-out date. Please request fewer months.' });
        }
        const rentRate = parseFloat(b.monthly_rent || 0);
        const addedCost = rentRate * extraMonths;
        const newTotalAmount = parseFloat(b.amount) + addedCost;
        if (!Number.isFinite(newTotalAmount) || newTotalAmount < 0 || newTotalAmount > 99999999.99) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'The extended rent exceeds the supported amount. Please request fewer months.' });
        }

        const extendedPeriod = stayPeriod(b.check_in_date,newTotalMonths);
        const reference = 'REF-' + String(b.id).padStart(4,'0');
        const [extensionRooms] = await connection.query('SELECT id, capacity FROM rooms WHERE id = ? FOR UPDATE',[b.room_id]);
        if (!extensionRooms.length || await studentStayConflict(connection,b.student_id,extendedPeriod,{excludeBookingId:b.id,excludeReference:reference}) || await roomStayUsage(connection,b.room_id,extendedPeriod,{excludeBookingId:b.id,excludeReference:reference}) >= Number(extensionRooms[0].capacity)) {
            await connection.rollback();
            return res.status(409).json({success:false,message:'This extension conflicts with another stay or a later room reservation. The existing checkout date is unchanged.'});
        }

        await connection.query(
            `UPDATE bookings 
             SET months = ?, amount = ?, is_extension_requested = 0, extension_months = 0 
             WHERE id = ?`,
            [newTotalMonths, newTotalAmount, bookingId]
        );

        await connection.query(
            `UPDATE occupants 
             SET months = ?, amount = ? 
             WHERE reference_no = ? AND check_out_date IS NULL`,
            [newTotalMonths, newTotalAmount, reference]
        );

        const extApprovedMsg = `EXTENSION APPROVED: Your stay extension request of +${extraMonths} months has been approved. Your new booked checkout is ${formalDate(extendedPeriod.end)}. Later renewal requests must fit around approved reservations. Any waiting replacement requests will be rechecked and notified.`;
        await connection.query(
            'INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',
            [b.student_id, extApprovedMsg, `/student/bookings/${b.id}`]
        );
        await connection.query('INSERT INTO notifications (user_id,message,link) VALUES (?,?,?)',[req.user.id,notificationForRole(extApprovedMsg,'owner'),'/owner/bookings']);
        await connection.commit();
        try { await rejectUnfittablePending(pool,b.room_id,{onRejected:(c,rejected)=>notifyRenewalIncomingClosed(c,rejected,req.user.id,'closed because an approved extension leaves no bed for its dates')}); } catch(error) { console.error('[EXTENSION PENDING REVIEW]',error.message); }
        res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        connection.release();
    }
});

// O. POST - Reject Stay Extension
router.post('/bookings/reject-extension/:id', authenticateToken, verifyOwner, validateBody('ids'), async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [booking] = await connection.query(
            `SELECT b.student_id, b.status, b.is_extension_requested
             FROM bookings b
             JOIN rooms r ON b.room_id = r.id
             JOIN boarding_houses bh ON r.house_id = bh.id
             WHERE b.id = ? AND bh.owner_id = ? FOR UPDATE`,
            [req.params.id, req.user.id]
        );
        if (booking.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Record not found or access denied.' });
        }

        if (booking[0].status !== 'confirmed' || !booking[0].is_extension_requested) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'This booking has no eligible pending extension. Please refresh the booking list.' });
        }

        await connection.query(
            'UPDATE bookings SET is_extension_requested = 0, extension_months = 0 WHERE id = ?',
            [req.params.id]
        );

        const extDeclinedMsg = 'EXTENSION UPDATE: Your stay extension request was declined by the landlord.';
        await connection.query(
            'INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',
            [booking[0].student_id, extDeclinedMsg, `/student/bookings/${booking[0].id}`]
        );

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        if (connection) await connection.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        connection?.release();
    }
});

// P. POST - Update booking billing status directly (Transaction-safe: Syncs with occupants)
router.post('/bookings/payment/:id', authenticateToken, verifyOwner, validateBody('bookingPayment'), async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const { status } = req.body;
        const targetStatus = status || 'paid';

        // 1. Pre-verify ownership of booking before mutating
        const [bookingRows] = await connection.query(
            `SELECT b.student_id, b.room_id, b.payment_method, b.move_in_required, b.move_in_confirmed_at
             FROM bookings b
             JOIN rooms r ON b.room_id = r.id
             JOIN boarding_houses bh ON r.house_id = bh.id
             WHERE b.id = ? AND bh.owner_id = ?`,
            [req.params.id, req.user.id]
        );

        if (bookingRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Booking not found or access denied.' });
        }

        if (!['paid', 'unpaid'].includes(targetStatus)) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Invalid payment status.' });
        }
        if (bookingRows[0].payment_method === 'paymongo') {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'Online upfront payments are verified through PayMongo. Update monthly rent from the occupant record.' });
        }
        if (Number(bookingRows[0].move_in_required) === 1 && !bookingRows[0].move_in_confirmed_at) {
            await connection.rollback();
            return res.status(409).json({success:false,message:'This future reservation has not started. Record cash upfront collection from Boarder Details after the stay starts.'});
        }

        // 2. Update the cash booking's payment status in bookings table
        await connection.query(
            'UPDATE bookings SET payment_status = ? WHERE id = ?',
            [targetStatus, req.params.id]
        );

        if (bookingRows[0].student_id) {
            const { student_id, room_id } = bookingRows[0];
            const occupantStatus = targetStatus.toLowerCase() === 'paid' ? 'Paid' : 'Not Paid';

            // 3. Synchronize status with the active occupant record
            await connection.query(
                `UPDATE occupants SET payment_status = ? 
                 WHERE reference_no = ? AND check_out_date IS NULL`,
                [occupantStatus, 'REF-' + String(req.params.id).padStart(4,'0')]
            );
        }

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('[BOOKING PAYMENT SYNC ERROR]:', err.message);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        connection?.release();
    }
});

export default router;
