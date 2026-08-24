import express from 'express';
import multer from 'multer';
import pool from '../config/db.js';
import { authenticateToken } from './auth.js';
import { memoryUpload, uploadBufferToCloudinary } from '../config/cloudinary.js';

const router = express.Router();

// Multer using memory storage — files buffered in RAM, then streamed to Cloudinary
const uploadAccreditationFiles = memoryUpload.fields([
    { name: 'permit_business_form', maxCount: 1 },
    { name: 'permit_cedula', maxCount: 1 },
    { name: 'permit_dti', maxCount: 1 },
    { name: 'permit_barangay', maxCount: 1 },
    { name: 'permit_building', maxCount: 1 },
    { name: 'permit_zoning', maxCount: 1 },
    { name: 'permit_sanitary', maxCount: 1 },
    { name: 'permit_fire', maxCount: 1 },
    { name: 'house_img', maxCount: 1 },
    { name: 'house_photos', maxCount: 10 }
]);

// Helper: upload a single named field buffer to Cloudinary, return URL or fallback
const uploadField = async (files, fieldName, folder) => {
    if (files && files[fieldName] && files[fieldName][0]) {
        const result = await uploadBufferToCloudinary(files[fieldName][0].buffer, folder);
        return result.url;
    }
    return null;
};

// 2. [GET] - Retrieve all accredited boarding houses (Public)
router.get('/accredited', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM boarding_houses WHERE house_status = 'accredited'");
        res.json({ success: true, count: rows.length, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to retrieve listings.' });
    }
});

// 3. [GET] - Retrieve specific boarding house details
router.get('/details/:id', authenticateToken, async (req, res) => {
    try {
        const houseId = req.params.id;
        const [rows] = await pool.query('SELECT * FROM boarding_houses WHERE id = ?', [houseId]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Property not found.' });
        }
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        console.error('Fetch Details Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to fetch details.' });
    }
});

// 4. [GET] - Get the logged-in owner's property using JWT (Dynamic pending review sync)
router.get('/my-property', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM boarding_houses WHERE owner_id = ?', [req.user.id]);
        if (rows.length === 0) {
            return res.json({ success: true, hasProperty: false });
        }
        res.json({ success: true, hasProperty: true, data: rows[0] });
    } catch (err) {
        console.error('Fetch My Property Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to fetch property details.' });
    }
});

// 5. [GET] - Fetch Owner Documents & Criteria list (Combines Standard & Custom requirements)
router.get('/documents/:id', authenticateToken, async (req, res) => {
    try {
        const houseId = parseInt(req.params.id);
        const [houseRows] = await pool.query('SELECT * FROM boarding_houses WHERE id = ?', [houseId]);

        if (houseRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Boarding house not found.' });
        }
        const house = houseRows[0];

        // 1. Map standard institutional requirements
        const standardCriteria = [
            { id: 30, label: 'Business Permit Application Form', permit_key: 'permit_business_form' },
            { id: 31, label: 'Community Tax Certificate (Cedula)', permit_key: 'permit_cedula' },
            { id: 32, label: 'DTI Registration Certificate', permit_key: 'permit_dti' },
            { id: 33, label: 'Barangay Business Clearance', permit_key: 'permit_barangay' },
            { id: 34, label: 'Certificate of Building Inspection', permit_key: 'permit_building' },
            { id: 35, label: 'Zoning Certificate / Locational Clearance', permit_key: 'permit_zoning' },
            { id: 36, label: 'Sanitary Permit / Health Clearance', permit_key: 'permit_sanitary' },
            { id: 37, label: 'Valid Fire Safety Inspection Certificate', permit_key: 'permit_fire' }
        ];

        const standardCriteriaMapped = standardCriteria.map(p => ({
            ...p,
            current_file: house[p.permit_key] || null,
            current_expiry: house['expiry_' + p.permit_key] || null
        }));

        // 2. Fetch custom requirements specifically assigned to this boarding house
        const [customRows] = await pool.query(
            'SELECT id, label FROM checklist_criteria WHERE house_id = ?',
            [houseId]
        );

        // 3. Fetch any uploaded files for these custom criteria
        const [customDocs] = await pool.query(
            'SELECT criteria_id, file_path, expiry_date FROM house_documents WHERE house_id = ?',
            [houseId]
        );

        const customCriteriaMapped = customRows.map(c => {
            const doc = customDocs.find(d => d.criteria_id === c.id);
            return {
                id: c.id,
                label: c.label,
                permit_key: null, // Signals to the frontend that this is a dynamic requirement
                current_file: doc ? doc.file_path : null,
                current_expiry: doc ? doc.expiry_date : null
            };
        });

        // Combine both sets of criteria
        const criteria = [...standardCriteriaMapped, ...customCriteriaMapped];

        res.json({ success: true, house, criteria });
    } catch (err) {
        console.error('Fetch Documents Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to retrieve documents.' });
    }
});

// 5A. [GET] - Fallback Documents Endpoint (Resolves when no ID parameter is passed to URL)
router.get('/documents', authenticateToken, async (req, res) => {
    try {
        const [houseRows] = await pool.query('SELECT id FROM boarding_houses WHERE owner_id = ?', [req.user.id]);

        if (houseRows.length === 0) {
            return res.status(404).json({ success: false, message: 'No boarding house record linked to this account.' });
        }

        const houseId = houseRows[0].id;
        const [houseData] = await pool.query('SELECT * FROM boarding_houses WHERE id = ?', [houseId]);
        const house = houseData[0];

        const standardCriteria = [
            { id: 30, label: 'Business Permit Application Form', permit_key: 'permit_business_form' },
            { id: 31, label: 'Community Tax Certificate (Cedula)', permit_key: 'permit_cedula' },
            { id: 32, label: 'DTI Registration Certificate', permit_key: 'permit_dti' },
            { id: 33, label: 'Barangay Business Clearance', permit_key: 'permit_barangay' },
            { id: 34, label: 'Certificate of Building Inspection', permit_key: 'permit_building' },
            { id: 35, label: 'Zoning Certificate / Locational Clearance', permit_key: 'permit_zoning' },
            { id: 36, label: 'Sanitary Permit / Health Clearance', permit_key: 'permit_sanitary' },
            { id: 37, label: 'Valid Fire Safety Inspection Certificate', permit_key: 'permit_fire' }
        ];

        const standardCriteriaMapped = standardCriteria.map(p => ({
            ...p,
            current_file: house[p.permit_key] || null,
            current_expiry: house['expiry_' + p.permit_key] || null
        }));

        const [customRows] = await pool.query(
            'SELECT id, label FROM checklist_criteria WHERE house_id = ?',
            [houseId]
        );

        const [customDocs] = await pool.query(
            'SELECT criteria_id, file_path, expiry_date FROM house_documents WHERE house_id = ?',
            [houseId]
        );

        const customCriteriaMapped = customRows.map(c => {
            const doc = customDocs.find(d => d.criteria_id === c.id);
            return {
                id: c.id,
                label: c.label,
                permit_key: null,
                current_file: doc ? doc.file_path : null,
                current_expiry: doc ? doc.expiry_date : null
            };
        });

        const criteria = [...standardCriteriaMapped, ...customCriteriaMapped];

        res.json({ success: true, house, criteria });
    } catch (err) {
        console.error('Fallback documents lookup failed:', err.message);
        res.status(500).json({ success: false, message: 'Database failed during automatic documents lookup.' });
    }
});

// 6. [POST] - Update a single legal document dynamically (Standard or Custom)
router.post('/documents/update/:id', authenticateToken, memoryUpload.single('permit_file'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const houseId = parseInt(req.params.id);
        const { identifier, is_custom, expiry_date } = req.body;

        if (!req.file) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Please select a file.' });
        }

        // Upload to Cloudinary
        const uploadResult = await uploadBufferToCloudinary(req.file.buffer, 'permits');
        const fileUrl = uploadResult.url;
        let reqLabel = '';

        // Safe Date Parsing: Converts empty strings to NULL to prevent MySQL Strict Mode errors
        const parsedExpiryDate = (expiry_date && expiry_date.trim() !== '') ? expiry_date : null;

        console.log(`[DOC UPDATE] Received => house_id: ${houseId}, identifier: "${identifier}", is_custom: ${is_custom}, file: "${fileUrl}"`);

        // Fetch current status of the boarding house to execute conditional status transitions
        const [houseCheck] = await connection.query(
            'SELECT house_status FROM boarding_houses WHERE id = ?',
            [houseId]
        );
        const currentStatus = houseCheck.length > 0 ? houseCheck[0].house_status : 'none';

        // If current status is rejected, transition it back to pending upon resubmission
        const targetStatus = currentStatus === 'rejected' ? 'pending' : currentStatus;

        // ─── CASE A: Dynamic / Custom Checklist Document ───
        if (is_custom === 'true' || is_custom === true) {
            const criteriaId = parseInt(identifier);

            // PRE-CHECK VALIDATION: Prevents foreign key constraint crashes if admin deletes requirements in background
            const [criteriaCheck] = await connection.query(
                'SELECT id FROM checklist_criteria WHERE id = ?',
                [criteriaId]
            );
            if (criteriaCheck.length === 0) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'This requirement has been deleted or modified by the administrator. Please refresh the page.'
                });
            }

            // Upsert the document upload details inside house_documents
            const [existingDoc] = await connection.query(
                'SELECT id FROM house_documents WHERE house_id = ? AND criteria_id = ?',
                [houseId, criteriaId]
            );

            if (existingDoc.length > 0) {
                await connection.query(
                    'UPDATE house_documents SET file_path = ?, expiry_date = ? WHERE house_id = ? AND criteria_id = ?',
                    [fileUrl, parsedExpiryDate, houseId, criteriaId]
                );
            } else {
                await connection.query(
                    'INSERT INTO house_documents (house_id, criteria_id, file_path, expiry_date) VALUES (?, ?, ?, ?)',
                    [houseId, criteriaId, fileUrl, parsedExpiryDate]
                );
            }

            // Flag boarding house as pending re-verification & apply target status
            await connection.query(
                `UPDATE boarding_houses 
                 SET house_status = ?, document_update_pending = 1, last_updated_document = ? 
                 WHERE id = ? AND owner_id = ?`,
                [targetStatus, criteriaId.toString(), houseId, req.user.id]
            );

            // Fetch label for custom notification message
            const [criteriaRow] = await connection.query('SELECT label FROM checklist_criteria WHERE id = ?', [criteriaId]);
            reqLabel = criteriaRow.length > 0 ? criteriaRow[0].label : 'Custom Requirement';

        } else {
            // ─── CASE B: Standard Institutional Permit ───
            const allowedColumns = [
                'permit_business_form', 'permit_cedula', 'permit_dti', 'permit_barangay',
                'permit_building', 'permit_zoning', 'permit_sanitary', 'permit_fire'
            ];

            if (!allowedColumns.includes(identifier)) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'Invalid document identifier.' });
            }

            const fileColumn = identifier;
            const expiryColumn = 'expiry_' + identifier;

            // Update standard columns & apply target status
            await connection.query(
                `UPDATE boarding_houses 
                 SET ${fileColumn} = ?, ${expiryColumn} = ?, house_status = ?, document_update_pending = 1, last_updated_document = ? 
                 WHERE id = ? AND owner_id = ?`,
                [fileUrl, parsedExpiryDate, targetStatus, identifier, houseId, req.user.id]
            );

            const labels = {
                'permit_business_form': 'Business Permit',
                'permit_cedula': 'Cedula',
                'permit_dti': 'DTI Registration',
                'permit_barangay': 'Barangay Clearance',
                'permit_building': 'Building Inspection',
                'permit_zoning': 'Zoning Clearance',
                'permit_sanitary': 'Sanitary Permit',
                'permit_fire': 'Fire Safety'
            };
            reqLabel = labels[identifier] || identifier;
        }

        // ─── CASE C: DISPATCH SYSTEM ALERTS TO SASO ADMINISTRATORS (Safe two-column schema insertion) ───
        const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin'");
        const [houseNameRow] = await connection.query('SELECT name FROM boarding_houses WHERE id = ?', [houseId]);
        const houseName = houseNameRow.length > 0 ? houseNameRow[0].name : 'Boarding House';

        const adminMessage = `SYSTEM: Owner of "${houseName}" has uploaded an updated document for "${reqLabel}". Please review.`;
        for (const admin of admins) {
            await connection.query(
                'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [admin.id, adminMessage]
            );
        }
        console.log(`[DOC UPDATE] Admin alerts dispatched to ${admins.length} administrators.`);

        await connection.commit();
        res.json({ success: true, message: 'Document submitted for re-validation.' });
    } catch (err) {
        await connection.rollback();
        console.error('Update Single Document Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to update document.' });
    } finally {
        connection.release();
    }
});

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

// 7. [POST] - Submit New or Update Existing Boarding House Accreditation Application
router.post('/accreditation', authenticateToken, uploadAccreditationFiles, async (req, res) => {
    try {
        const ownerId = req.user.id;
        const {
            house_id,
            house_name, contact_number, price,
            advance_months, deposit_months, deposit_type,
            location, map_link, latitude, longitude, description,
            amenities_free, amenities_paid, existing_photos
        } = req.body;

        // Safe Date Parser: Ensures empty/invalid strings return NULL rather than NaN Date objects
        const parseSafeDate = (val) => {
            if (!val || typeof val !== 'string' || val.trim() === '') return null;
            const timestamp = Date.parse(val);
            if (isNaN(timestamp)) return null;
            return new Date(timestamp);
        };

        // Upload a field buffer to Cloudinary; returns the URL or null if no new file
        const uploadField = async (fieldName, folder) => {
            if (req.files && req.files[fieldName] && req.files[fieldName][0]) {
                try {
                    const result = await uploadBufferToCloudinary(req.files[fieldName][0].buffer, folder);
                    return result.url;
                } catch (uploadErr) {
                    console.error(`[CLOUDINARY UPLOAD ERROR] Field "${fieldName}":`, uploadErr.message);
                    throw new Error(`File upload failed for ${fieldName}: ${uploadErr.message}`);
                }
            }
            return null;
        };

        const getExpiry = (fieldName) => req.body[`expiry_permit_${fieldName}`] || null;

        // Upload all house photos to Cloudinary concurrently in parallel
        let uploadedPhotoUrls = [];
        if (req.files && req.files['house_photos'] && req.files['house_photos'].length > 0) {
            const photoPromises = req.files['house_photos'].map(f => uploadBufferToCloudinary(f.buffer, 'house_photos'));
            const uploadResults = await Promise.all(photoPromises);
            uploadedPhotoUrls = uploadResults.map(res => res.url);
        }
        const parsedExistingPhotos = existing_photos ? JSON.parse(existing_photos) : [];
        const combinedPhotos = [...parsedExistingPhotos, ...uploadedPhotoUrls];

        // Sanitize amenities input
        const sanitizedFree = sanitizeJSONInput(amenities_free);
        const sanitizedPaid = sanitizeJSONInput(amenities_paid);

        // ================= CASE A: UPDATE EXISTING RECORD =================
        if (house_id) {
            const [existingRows] = await pool.query(
                'SELECT * FROM boarding_houses WHERE id = ? AND owner_id = ?',
                [house_id, ownerId]
            );

            if (existingRows.length === 0) {
                return res.status(404).json({ success: false, message: 'Property not found.' });
            }

            const existingHouse = existingRows[0];
            const house_img = (await uploadField('house_img', 'house_images')) || existingHouse.img;

            const img_1 = combinedPhotos[0] || null;
            const img_2 = combinedPhotos[1] || null;
            const img_3 = combinedPhotos[2] || null;

            const permit_business_form = (await uploadField('permit_business_form', 'permits')) || existingHouse.permit_business_form;
            const permit_cedula        = (await uploadField('permit_cedula', 'permits'))         || existingHouse.permit_cedula;
            const permit_dti           = (await uploadField('permit_dti', 'permits'))            || existingHouse.permit_dti;
            const permit_barangay      = (await uploadField('permit_barangay', 'permits'))       || existingHouse.permit_barangay;
            const permit_building      = (await uploadField('permit_building', 'permits'))       || existingHouse.permit_building;
            const permit_zoning        = (await uploadField('permit_zoning', 'permits'))         || existingHouse.permit_zoning;
            const permit_sanitary      = (await uploadField('permit_sanitary', 'permits'))       || existingHouse.permit_sanitary;
            const permit_fire          = (await uploadField('permit_fire', 'permits'))           || existingHouse.permit_fire;

            const expiry_permit_business_form = getExpiry('business_form') ? parseSafeDate(getExpiry('business_form')) : existingHouse.expiry_permit_business_form;
            const expiry_permit_cedula        = getExpiry('cedula')        ? parseSafeDate(getExpiry('cedula'))        : existingHouse.expiry_permit_cedula;
            const expiry_permit_dti           = getExpiry('dti')           ? parseSafeDate(getExpiry('dti'))           : existingHouse.expiry_permit_dti;
            const expiry_permit_barangay      = getExpiry('barangay')      ? parseSafeDate(getExpiry('barangay'))      : existingHouse.expiry_permit_barangay;
            const expiry_permit_building      = getExpiry('building')      ? parseSafeDate(getExpiry('building'))      : existingHouse.expiry_permit_building;
            const expiry_permit_zoning        = getExpiry('zoning')        ? parseSafeDate(getExpiry('zoning'))        : existingHouse.expiry_permit_zoning;
            const expiry_permit_sanitary      = getExpiry('sanitary')      ? parseSafeDate(getExpiry('sanitary'))      : existingHouse.expiry_permit_sanitary;
            const expiry_permit_fire          = getExpiry('fire')          ? parseSafeDate(getExpiry('fire'))          : existingHouse.expiry_permit_fire;

            await pool.query(
                `UPDATE boarding_houses 
                 SET name = ?, img = ?, img_1 = ?, img_2 = ?, img_3 = ?, location = ?, barangay = ?, map_link = ?, price = ?, phone_contact = ?, description = ?,
                     amenities_free = ?, amenities_paid = ?, house_status = 'pending', admin_comments = NULL,
                     permit_business_form = ?, permit_cedula = ?, permit_dti = ?, permit_barangay = ?,
                     permit_building = ?, permit_zoning = ?, permit_sanitary = ?, permit_fire = ?,
                     expiry_permit_business_form = ?, expiry_permit_cedula = ?, expiry_permit_dti = ?, expiry_permit_barangay = ?,
                     expiry_permit_building = ?, expiry_permit_zoning = ?, expiry_permit_sanitary = ?, expiry_permit_fire = ?,
                     latitude = ?, longitude = ?, advance_months = ?, deposit_months = ?, deposit_type = ?
                 WHERE id = ? AND owner_id = ?`,
                [
                    house_name, house_img, img_1, img_2, img_3, location, req.body.barangay || null, map_link, parseFloat(price) || 0, contact_number, description || '',
                    sanitizedFree, sanitizedPaid,
                    permit_business_form, permit_cedula, permit_dti, permit_barangay,
                    permit_building, permit_zoning, permit_sanitary, permit_fire,
                    expiry_permit_business_form, expiry_permit_cedula, expiry_permit_dti, expiry_permit_barangay,
                    expiry_permit_building, expiry_permit_zoning, expiry_permit_sanitary, expiry_permit_fire,
                    latitude ? parseFloat(latitude) : null, longitude ? parseFloat(longitude) : null,
                    parseInt(advance_months) || 0, parseInt(deposit_months) || 0, deposit_type || null,
                    house_id, ownerId
                ]
            );

            // Sync all photos into house_photos table
            await pool.query('DELETE FROM house_photos WHERE house_id = ?', [house_id]);
            for (let i = 0; i < combinedPhotos.length; i++) {
                await pool.query(
                    'INSERT INTO house_photos (house_id, photo_url, sort_order) VALUES (?, ?, ?)',
                    [house_id, combinedPhotos[i], i]
                );
            }

            return res.json({
                success: true,
                message: 'Accreditation application updated successfully!',
                houseId: house_id
            });
        }

        // ================= CASE B: NEW REGISTRATION =================
        const house_img        = await uploadField('house_img', 'house_images');
        const permit_business_form = await uploadField('permit_business_form', 'permits');
        const permit_cedula        = await uploadField('permit_cedula', 'permits');
        const permit_dti           = await uploadField('permit_dti', 'permits');
        const permit_barangay      = await uploadField('permit_barangay', 'permits');
        const permit_building      = await uploadField('permit_building', 'permits');
        const permit_zoning        = await uploadField('permit_zoning', 'permits');
        const permit_sanitary      = await uploadField('permit_sanitary', 'permits');
        const permit_fire          = await uploadField('permit_fire', 'permits');

        const img_1 = combinedPhotos[0] || null;
        const img_2 = combinedPhotos[1] || null;
        const img_3 = combinedPhotos[2] || null;

        const [result] = await pool.query(
            `INSERT INTO boarding_houses (
                owner_id, name, img, img_1, img_2, img_3,
                location, barangay, map_link, price, phone_contact, description,
                amenities_free, amenities_paid, house_status,
                permit_business_form, permit_cedula, permit_dti, permit_barangay,
                permit_building, permit_zoning, permit_sanitary, permit_fire,
                expiry_permit_business_form, expiry_permit_cedula, expiry_permit_dti, expiry_permit_barangay,
                expiry_permit_building, expiry_permit_zoning, expiry_permit_sanitary, expiry_permit_fire,
                latitude, longitude, advance_months, deposit_months, deposit_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                ownerId, house_name, house_img, img_1, img_2, img_3,
                location, req.body.barangay || null, map_link, parseFloat(price) || 0, contact_number, description,
                sanitizedFree, sanitizedPaid, 'pending',
                permit_business_form, permit_cedula, permit_dti, permit_barangay,
                permit_building, permit_zoning, permit_sanitary, permit_fire,
                parseSafeDate(getExpiry('business_form')),
                parseSafeDate(getExpiry('cedula')),
                parseSafeDate(getExpiry('dti')),
                parseSafeDate(getExpiry('barangay')),
                parseSafeDate(getExpiry('building')),
                parseSafeDate(getExpiry('zoning')),
                parseSafeDate(getExpiry('sanitary')),
                parseSafeDate(getExpiry('fire')),
                latitude ? parseFloat(latitude) : null, longitude ? parseFloat(longitude) : null,
                parseInt(advance_months) || 0, parseInt(deposit_months) || 0, deposit_type || null
            ]
        );

        const newHouseId = result.insertId;
        for (let i = 0; i < combinedPhotos.length; i++) {
            await pool.query(
                'INSERT INTO house_photos (house_id, photo_url, sort_order) VALUES (?, ?, ?)',
                [newHouseId, combinedPhotos[i], i]
            );
        }

        // Notify all admins of new accreditation application
        try {
            const [admins] = await pool.query("SELECT id FROM users WHERE role = 'admin'");
            const adminMessage = `SYSTEM: A new boarding house application "${house_name}" has been submitted for accreditation review.`;
            for (const admin of admins) {
                await pool.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [admin.id, adminMessage]);
            }
        } catch (notifErr) {
            console.error('Failed to notify admins of new application:', notifErr.message);
        }

        res.status(201).json({
            success: true,
            message: 'Accreditation application submitted successfully!',
            houseId: result.insertId
        });

    } catch (err) {
        console.error('Accreditation Submission Error:', err);
        res.status(500).json({ success: false, message: err.message || 'Failed to process accreditation application.' });
    }
});

export default router;