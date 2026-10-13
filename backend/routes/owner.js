import { validateImages } from '../config/uploadValidation.js';
import { validateBody } from '../config/inputValidation.js';
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
                (SELECT COUNT(*) FROM occupants o WHERE o.room_id = r.id AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())) AS occupant_count,
                (SELECT COUNT(*) FROM bookings b WHERE b.room_id = r.id AND b.status = 'pending') AS pending_request_count
             FROM rooms r
             WHERE r.house_id = ? AND (r.deleted_at IS NULL OR r.deleted_at = 0)`,
            [req.params.houseId]
        );

        const [archivedRooms] = await pool.query(
            `SELECT r.*, 
                (SELECT COUNT(*) FROM occupants o WHERE o.room_id = r.id AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())) AS occupant_count,
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
router.post('/rooms/add/:houseId', authenticateToken, verifyOwner, validateBody('room'), async (req, res) => {
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

        await connection.query(
            "INSERT INTO rooms (house_id, room_number, gender_type, capacity, price, status) VALUES (?, ?, ?, ?, ?, 'available')",
            [req.params.houseId, input.roomNumber, gender_type || 'female', input.capacity, roomPrice]
        );

        await connection.commit();
        transactionOpen = false;
        res.json({ success: true, message: 'Room created successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    } finally {
        if (connection) {
            try { if (transactionOpen) await connection.rollback(); }
            finally { connection.release(); }
        }
    }
});

// Occupants and approved online reservations both consume a room's capacity.
async function getRoomCapacityUsage(connection, roomId) {
    const [occupants] = await connection.query(
        'SELECT COUNT(*) AS count FROM occupants WHERE room_id = ? AND (check_out_date IS NULL OR check_out_date > CURDATE())',
        [roomId]
    );
    const [reservations] = await connection.query(
        `SELECT COUNT(*) AS count FROM bookings b
         WHERE b.room_id = ? AND b.status = 'confirmed' AND b.payment_method = 'paymongo' AND b.payment_status != 'paid'
         AND NOT EXISTS (SELECT 1 FROM occupants o
             WHERE o.reference_no = CONCAT('REF-', IF(CHAR_LENGTH(b.id) < 4, LPAD(b.id, 4, '0'), b.id))
             AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE()))`,
        [roomId]
    );
    return { occupants: Number(occupants[0].count), reserved: Number(reservations[0].count) };
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
router.put('/rooms/edit/:roomId', authenticateToken, verifyOwner, validateBody('room'), async (req, res) => {
    let connection;
    let transactionOpen = false;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        transactionOpen = true;
        const { room_number, gender_type, capacity, price } = req.body;

        // Verify room belongs to owner's house
        const [roomRows] = await connection.query(
            `SELECT r.id, r.house_id, r.price, r.room_number
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
        const usage = await getRoomCapacityUsage(connection, req.params.roomId);
        if (parsedCapacity < usage.occupants + usage.reserved) {
            return res.status(400).json({
                success: false,
                message: usage.reserved > 0
                    ? `Cannot set capacity to ${parsedCapacity}. This room has ${usage.occupants} active occupant(s) and ${usage.reserved} approved online reservation(s) awaiting payment.`
                    : `Cannot set capacity to ${parsedCapacity}. This room currently has ${usage.occupants} active occupant(s).`
            });
        }

        await connection.query(
            `UPDATE rooms SET room_number = ?, gender_type = ?, capacity = ?, price = ? WHERE id = ?`,
            [input.roomNumber, gender_type || 'female', parsedCapacity, roomPrice, req.params.roomId]
        );

        await connection.commit();
        transactionOpen = false;
        res.json({ success: true, message: 'Room details updated successfully.' });
    } catch (err) {
        console.error('Edit room error:', err.message);
        res.status(500).json({ success: false, message: err.message });
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
            return res.status(400).json({ success: false, message: 'Cannot archive room with approved online reservations awaiting payment. Resolve those reservations first.' });
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
             WHERE r.house_id = ? AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())`,
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
            `SELECT r.id, r.house_id, r.room_number
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
        const usage = await getRoomCapacityUsage(connection, roomId);
        if (parsedCapacity < usage.occupants + usage.reserved) {
            return res.status(400).json({
                success: false,
                message: usage.reserved > 0
                    ? `Cannot set capacity to ${parsedCapacity}. This room has ${usage.occupants} active occupant(s) and ${usage.reserved} approved online reservation(s) awaiting payment.`
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
            return res.status(400).json({ success: false, message: 'Cannot archive room with approved online reservations awaiting payment. Resolve those reservations first.' });
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
router.post('/rooms/occupants/add/:roomId', authenticateToken, verifyOwner, validateBody('occupant'), async (req, res) => {
    let connection;
    let transactionOpen = false;
    try {
        connection = await pool.getConnection();
        const { roomId } = req.params;
        const { name, age, contact_number, check_in_date, months, emergency_contact, guardian_name, payment_status, upfront_status, address } = req.body;

        const [roomRows] = await connection.query(
            `SELECT r.*, 
                (SELECT COUNT(*) FROM occupants o WHERE o.room_id = r.id AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())) AS current_count
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
                await connection.query("ALTER TABLE occupants ADD COLUMN upfront_status VARCHAR(50) DEFAULT 'Paid'");
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
        if (usage.occupants + usage.reserved >= currentRooms[0].capacity) {
            return res.status(400).json({ success: false, message: 'Room has no available places. Remaining places are reserved for approved online bookings awaiting payment.' });
        }

        const upfrontStatus = upfront_status === 'Paid' ? 'Paid' : 'Unpaid';

        const checkIn = check_in_date || new Date().toISOString().split('T')[0];
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
            `SELECT o.student_id, o.room_id FROM occupants o JOIN rooms r ON r.id = o.room_id
             JOIN boarding_houses bh ON bh.id = r.house_id WHERE o.id = ? AND bh.owner_id = ?`,
            [req.params.id, req.user.id]);
        if (!owned.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Occupant not found or access denied.' });
        }

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
                 WHERE student_id = ? AND room_id = ? AND status = 'confirmed'
                 AND payment_method = 'cash'`,
                [bookingStatus, student_id, room_id]
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
            `SELECT o.id FROM occupants o
             JOIN rooms r ON r.id = o.room_id
             JOIN boarding_houses bh ON bh.id = r.house_id
             WHERE o.id = ? AND bh.owner_id = ?`,
            [req.params.id, req.user.id]
        );
        if (occupantRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Occupant not found or access denied.' });
        }

        // 0. Ensure upfront_status column exists in occupants table
        try {
            await connection.query("ALTER TABLE occupants ADD COLUMN upfront_status VARCHAR(50) DEFAULT 'Paid'");
        } catch (colErr) {
            // Column already exists, ignore error
        }

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

// J. POST - Checkout boarder (Transaction-safe: notifies student on check-out)
router.post('/rooms/occupants/checkout/:id', authenticateToken, verifyOwner, validateBody('ids'), async (req, res) => {
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
                   (b.payment_method = 'paymongo' AND b.paymongo_payment_id IS NOT NULL
                    AND NOT EXISTS (SELECT 1 FROM occupants po WHERE po.reference_no = CONCAT('REF-', IF(CHAR_LENGTH(b.id) < 4, LPAD(b.id, 4, '0'), b.id)))) AS payment_requires_review,
                   u.name as student_name, u.phone as contact_number, u.profile_pic, u.address, u.guardian_name,
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
            const initial_payment = (Math.max(1, advM) * rent) + (depM * rent);

            return {
                ...b,
                initial_payment
            };
        });

        // Non-CSPC boarders are added straight into occupants (no booking row),
        // so surface them here too, shaped like bookings, for the monitoring list.
        let walkInQuery = `
            SELECT o.id, o.reference_no, o.name AS student_name, o.contact_number, o.address,
                   o.emergency_contact, o.guardian_name, o.check_in_date, o.check_out_date,
                   o.months, o.amount, o.payment_status, o.payment_method,
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

        const today = new Date().toISOString().split('T')[0];
        const walkInRows = walkIns.map(o => {
            const checkOut = o.check_out_date ? new Date(o.check_out_date).toISOString().split('T')[0] : null;
            const rent = parseFloat(o.monthly_rent || 0);
            return {
                ...o,
                is_non_cspc: 1,
                status: checkOut && checkOut <= today ? 'completed' : 'confirmed',
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
        if (currentBooking.status === 'confirmed') {
            await connection.rollback();
            return res.json({ success: true, message: 'This reservation is already approved.' });
        }
        if (currentBooking.status !== 'pending') {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'This reservation is no longer pending. Please refresh the booking list.' });
        }
        const [otherStays] = await connection.query("SELECT id FROM bookings WHERE student_id = ? AND id != ? AND status = 'confirmed' FOR UPDATE", [b.student_id, bookingId]);
        const [activeOccupancy] = await connection.query('SELECT id FROM occupants WHERE student_id = ? AND (check_out_date IS NULL OR check_out_date > CURDATE()) FOR UPDATE', [b.student_id]);
        if (otherStays.length > 0 || activeOccupancy.length > 0) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'This student already has a confirmed booking or active stay. Please refresh the booking list.' });
        }
        const [eligibleRooms] = await connection.query("SELECT r.id, r.capacity FROM rooms r JOIN boarding_houses bh ON bh.id = r.house_id WHERE r.id = ? AND bh.owner_id = ? AND r.deleted_at IS NULL AND bh.house_status = 'accredited' FOR UPDATE", [b.room_id, req.user.id]);
        if (eligibleRooms.length === 0) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'This room or boarding house is no longer available for booking.' });
        }

        const roomConfig = eligibleRooms[0];
        // Current reads after the room lock include prior approved online reservations.
        const [reservedBookings] = await connection.query("SELECT b.id FROM bookings b WHERE b.room_id = ? AND b.status = 'confirmed' AND b.payment_method = 'paymongo' AND b.payment_status != 'paid' AND NOT EXISTS (SELECT 1 FROM occupants o WHERE o.reference_no = CONCAT('REF-', IF(CHAR_LENGTH(b.id) < 4, LPAD(b.id, 4, '0'), b.id)) AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())) FOR UPDATE", [b.room_id]);
        const [currentOccupants] = await connection.query('SELECT id FROM occupants WHERE room_id = ? AND (check_out_date IS NULL OR check_out_date > CURDATE()) FOR UPDATE', [b.room_id]);
        if (currentOccupants.length + reservedBookings.length >= roomConfig.capacity) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'The target room has reached full capacity.', errorCode: 'capacity_full' });
        }

        // 1. Confirm the booking status
        await connection.query(
            "UPDATE bookings SET status = 'confirmed' WHERE id = ?",
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
                    months, amount, payment_status, payment_method, is_non_cspc
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Not Paid', 'cash', 0)`,
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
            'INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',
            [b.student_id, notificationMsg, `/student/bookings/${b.id}`]
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
router.post('/bookings/reject/:id', authenticateToken, verifyOwner, validateBody('ids'), async (req, res) => {
    try {
        const [bookingRows] = await pool.query(
            `SELECT b.student_id, b.id 
             FROM bookings b
             JOIN rooms r ON b.room_id = r.id
             JOIN boarding_houses bh ON r.house_id = bh.id
             WHERE b.id = ? AND bh.owner_id = ?`,
            [req.params.id, req.user.id]
        );
        if (bookingRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Record not found or access denied.' });
        }

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

        const extApprovedMsg = `EXTENSION APPROVED: Your stay extension request of +${extraMonths} months has been approved.`;
        await connection.query(
            'INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',
            [b.student_id, extApprovedMsg, `/student/bookings/${b.id}`]
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
            `SELECT b.student_id, b.room_id, b.payment_method
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
                 WHERE student_id = ? AND room_id = ? AND check_out_date IS NULL`,
                [occupantStatus, student_id, room_id]
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