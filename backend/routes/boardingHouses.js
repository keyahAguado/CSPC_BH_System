import { validateImages } from '../config/uploadValidation.js';
import { requireVerifiedEmail, signVerifiedApplicant } from '../config/applicantVerification.js';
import { validateBody } from '../config/inputValidation.js';
import express from 'express';
import multer from 'multer';
import pool from '../config/db.js';
import { PUBLIC_HOUSE_COLUMNS } from '../config/publicHouseFields.js';
import { authenticateToken } from './auth.js';
import { upload, saveUploadedFile } from '../config/upload.js';
import { evaluateHouseCompliance } from '../config/complianceManager.js';
import { APPLICATION_STATUS, APPLICANT_EDITABLE, effectiveApplicationStatus, generateReferenceNo, recordStatusChange, createRateLimiter, isPendingApplicant } from '../config/applicationWorkflow.js';

const router = express.Router();

// Multer using memory storage for buffering file uploads
export const uploadAccreditationFiles = upload.fields([
    { name: 'permit_business_form', maxCount: 5 },
    { name: 'permit_cedula', maxCount: 5 },
    { name: 'permit_dti', maxCount: 5 },
    { name: 'permit_barangay', maxCount: 5 },
    { name: 'permit_building', maxCount: 5 },
    { name: 'permit_zoning', maxCount: 5 },
    { name: 'permit_sanitary', maxCount: 5 },
    { name: 'permit_fire', maxCount: 5 },
    { name: 'house_img', maxCount: 1 },
    { name: 'house_photos', maxCount: 10 }
]);

// Helper: upload a single named field buffer, return URL/path or fallback
const uploadField = async (files, fieldName, folder) => {
    if (files && files[fieldName] && files[fieldName][0]) {
        const f = files[fieldName][0];
        return await saveUploadedFile(f.buffer, f.originalname, folder);
    }
    return null;
};

// Helper to calculate price_range for a house object
const attachPriceRange = (house, minVal, maxVal) => {
    const prices = [];
    if (house.price !== null && house.price !== undefined && parseFloat(house.price) > 0) {
        prices.push(parseFloat(house.price));
    }
    if (minVal !== null && minVal !== undefined && parseFloat(minVal) > 0) {
        prices.push(parseFloat(minVal));
    }
    if (maxVal !== null && maxVal !== undefined && parseFloat(maxVal) > 0) {
        prices.push(parseFloat(maxVal));
    }

    if (prices.length === 0) {
        return { ...house, min_price: 0, max_price: 0, price_range: '₱0' };
    }

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    let displayPrice = `₱${Number(min).toLocaleString()}`;
    if (min !== max) {
        displayPrice = `₱${Number(min).toLocaleString()} - ₱${Number(max).toLocaleString()}`;
    }
    return { ...house, min_price: min, max_price: max, price_range: displayPrice };
};

// 2. [GET] - Retrieve all accredited boarding houses (Public search & directory)
const handleAccreditedFetch = async (req, res) => {
    try {
        const searchQuery = (req.query.query || req.query.search || req.query.q || '').trim();
        const terms = searchQuery.split(/\s+/).map(t => t.trim()).filter(t => t.length > 0);

        let rows;
        if (terms.length === 0) {
            [rows] = await pool.query(`
                SELECT ${PUBLIC_HOUSE_COLUMNS},
                       MIN(r.price) AS min_price, 
                       MAX(r.price) AS max_price 
                FROM boarding_houses bh
                LEFT JOIN rooms r ON bh.id = r.house_id AND r.deleted_at IS NULL
                WHERE bh.house_status = 'accredited'
                GROUP BY bh.id
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
                       MIN(r.price) AS min_price, 
                       MAX(r.price) AS max_price,
                       (${scoreClauses.join(' + ')}) AS relevance 
                FROM boarding_houses bh
                LEFT JOIN rooms r ON bh.id = r.house_id AND r.deleted_at IS NULL
                WHERE bh.house_status = 'accredited' AND (${whereClauses.join(' OR ')})
                GROUP BY bh.id
                ORDER BY relevance DESC, bh.created_at DESC
            `;
            [rows] = await pool.query(sql, queryParams);
        }

        const formatted = rows.map(h => attachPriceRange(h, h.min_price, h.max_price));
        res.json({ success: true, count: formatted.length, data: formatted });
    } catch (err) {
        console.error('Fetch Accredited Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to retrieve listings.' });
    }
};

router.get('/accredited', handleAccreditedFetch);
router.get('/search', handleAccreditedFetch);

// 3. [GET] - Retrieve specific boarding house details
router.get('/details/:id', authenticateToken, async (req, res) => {
    if (!['owner', 'admin'].includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Property documents and application details are available only to the property owner and SASO.' });
    }
    try {
        const houseId = req.params.id;
        const [rows] = await pool.query(`
            SELECT bh.*, 
                   MIN(r.price) AS min_price, 
                   MAX(r.price) AS max_price 
            FROM boarding_houses bh
            LEFT JOIN rooms r ON bh.id = r.house_id AND r.deleted_at IS NULL
            WHERE bh.id = ? AND (? = 'admin' OR bh.owner_id = ?)
            GROUP BY bh.id
        `, [houseId, req.user.role, req.user.id]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Property not found.' });
        }
        const formatted = attachPriceRange(rows[0], rows[0].min_price, rows[0].max_price);

        // Also fetch house_photos table (used on Cloudinary deployments where img_1/2/3 may be null)
        let photos = [];
        try {
            const [photoRows] = await pool.query(
                'SELECT photo_url FROM house_photos WHERE house_id = ? ORDER BY sort_order ASC',
                [houseId]
            );
            photos = photoRows.map(r => r.photo_url);
        } catch (e) {
            // house_photos table may not exist on older DBs — fall back silently
        }

        res.json({ success: true, data: formatted, photos });
    } catch (err) {
        console.error('Fetch Details Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to fetch details.' });
    }
});

// 4. [GET] - Get the logged-in owner's property using JWT (Dynamic pending review sync)
router.get('/my-property', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT bh.*, 
                   MIN(r.price) AS min_price, 
                   MAX(r.price) AS max_price 
            FROM boarding_houses bh
            LEFT JOIN rooms r ON bh.id = r.house_id AND r.deleted_at IS NULL
            WHERE bh.owner_id = ?
            GROUP BY bh.id
            ORDER BY bh.created_at DESC
        `, [req.user.id]);
        if (rows.length === 0) {
            return res.json({ success: true, hasProperty: false, properties: [] });
        }
        const formatted = rows.map(h => attachPriceRange(h, h.min_price, h.max_price));
        res.json({ success: true, hasProperty: true, data: formatted[0], properties: formatted });
    } catch (err) {
        console.error('Fetch My Property Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to fetch property details.' });
    }
});

// 5. [GET] - Fetch Owner Documents & Criteria list (Combines Standard & Custom requirements)
router.get('/documents/:id', authenticateToken, async (req, res) => {
    if (!['owner', 'admin'].includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Property documents and application details are available only to the property owner and SASO.' });
    }
    try {
        const houseId = parseInt(req.params.id);
        const [houseRows] = await pool.query("SELECT * FROM boarding_houses WHERE id = ? AND (? = 'admin' OR owner_id = ?)", [houseId, req.user.role, req.user.id]);

        if (houseRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Boarding house not found.' });
        }
        const house = houseRows[0];

        // 1. Map standard institutional requirements (Mandatory 1-4, Optional 5-8)
        const standardCriteria = [
            { id: 30, label: 'Business Permit Application Form', permit_key: 'permit_business_form', required: true },
            { id: 33, label: 'Barangay Business Clearance', permit_key: 'permit_barangay', required: true },
            { id: 37, label: 'Valid Fire Safety Inspection Certificate', permit_key: 'permit_fire', required: true },
            { id: 36, label: 'Sanitary Permit / Health Clearance', permit_key: 'permit_sanitary', required: true },
            { id: 31, label: 'Community Tax Certificate (Cedula)', permit_key: 'permit_cedula', required: false },
            { id: 32, label: 'DTI Registration Certificate', permit_key: 'permit_dti', required: false },
            { id: 34, label: 'Certificate of Building Inspection', permit_key: 'permit_building', required: false },
            { id: 35, label: 'Zoning Certificate / Locational Clearance', permit_key: 'permit_zoning', required: false }
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
    if (!['owner', 'admin'].includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Property documents and application details are available only to the property owner and SASO.' });
    }
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
router.post('/documents/update/:id', authenticateToken, upload.single('permit_file'), validateImages, validateBody('document'), async (req, res) => {
    if (req.user.role !== 'owner') {
        return res.status(403).json({ success: false, message: 'Only owners can update property documents.' });
    }
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const houseId = parseInt(req.params.id);
        const { identifier, is_custom, expiry_date } = req.body;

        const [ownedHouse] = await connection.query(
            'SELECT id FROM boarding_houses WHERE id = ? AND owner_id = ? FOR UPDATE',
            [houseId, req.user.id]
        );
        if (ownedHouse.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Property not found or access denied.' });
        }

        if (is_custom === 'true' || is_custom === true) {
            const criteriaId = Number(identifier);
            const [applicableCriteria] = Number.isInteger(criteriaId) && criteriaId > 0
                ? await connection.query(
                    'SELECT id FROM checklist_criteria WHERE id = ? AND (house_id IS NULL OR house_id = ?) FOR UPDATE',
                    [criteriaId, houseId]
                )
                : [[]];
            if (applicableCriteria.length === 0) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'This custom requirement is unavailable for this property. Please refresh the page.' });
            }
        }


        if (!req.file) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Please select a file.' });
        }

        // Save file via unified storage provider
        const fileUrl = await saveUploadedFile(req.file.buffer, req.file.originalname, 'permits');
        let reqLabel = '';

        // Safe Date Parsing: Converts empty strings to NULL to prevent MySQL Strict Mode errors
        const parsedExpiryDate = (expiry_date && expiry_date.trim() !== '') ? expiry_date : null;

        console.log(`[DOC UPDATE] Received => house_id: ${houseId}, identifier: "${identifier}", is_custom: ${is_custom}, file: "${fileUrl}"`);

        // Fetch current status of the boarding house to execute conditional status transitions
        const [houseCheck] = await connection.query(
            'SELECT house_status, is_resubmission FROM boarding_houses WHERE id = ?',
            [houseId]
        );
        const currentStatus = houseCheck.length > 0 ? houseCheck[0].house_status : 'none';

        // If current status is rejected or archived, transition it back to pending upon resubmission
        const targetStatus = (currentStatus === 'rejected' || currentStatus === 'archived') ? 'pending' : currentStatus;
        const isResubmissionVal = (currentStatus === 'rejected' || currentStatus === 'archived' || (houseCheck.length > 0 && houseCheck[0].is_resubmission)) ? 1 : 0;

        // Fetch current document update tracking state to accumulate multiple updated documents in a single pending session
        const [currentHouseState] = await connection.query(
            'SELECT document_update_pending, last_updated_document FROM boarding_houses WHERE id = ?',
            [houseId]
        );

        const docKey = (is_custom === 'true' || is_custom === true) ? identifier.toString() : identifier;
        let updatedDocs = [];
        if (currentHouseState.length > 0 && currentHouseState[0].document_update_pending && currentHouseState[0].last_updated_document) {
            const existingList = currentHouseState[0].last_updated_document.split(',').map(s => s.trim()).filter(Boolean);
            if (!existingList.includes(docKey)) {
                existingList.push(docKey);
            }
            updatedDocs = existingList;
        } else {
            updatedDocs = [docKey];
        }
        const accumulatedDocsStr = updatedDocs.join(',').slice(0, 250);

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
                 SET house_status = ?, is_resubmission = ?, document_update_pending = 1, last_updated_document = ?, admin_comments = NULL, resubmitted_at = NOW()
                 WHERE id = ? AND owner_id = ?`,
                [targetStatus, isResubmissionVal, accumulatedDocsStr, houseId, req.user.id]
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
                 SET ${fileColumn} = ?, ${expiryColumn} = ?, house_status = ?, is_resubmission = ?, document_update_pending = 1, last_updated_document = ?, admin_comments = NULL, resubmitted_at = NOW()
                 WHERE id = ? AND owner_id = ?`,
                [fileUrl, parsedExpiryDate, targetStatus, isResubmissionVal, accumulatedDocsStr, houseId, req.user.id]
            );
            // The re-uploaded file replaces any earlier multi-file set for this document.
            await connection.query('DELETE FROM house_permit_files WHERE house_id = ? AND permit_key = ?', [houseId, fileColumn]);

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

        // Evaluate the new expiry date immediately instead of waiting for the next
        // scheduled sweep — otherwise an owner who just uploaded a near-expiry
        // document sees "Expiring Soon" on this page but gets no notification
        // until the next midnight cron run. Awaited (not fire-and-forget) so the
        // notification is guaranteed to exist by the time this response returns.
        try {
            await evaluateHouseCompliance(houseId);
        } catch (evalErr) {
            console.error('[DOC UPDATE] Immediate compliance evaluation failed:', evalErr.message);
        }

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
router.post('/accreditation', authenticateToken, uploadAccreditationFiles, validateImages, validateBody('property'), async (req, res) => {
    let connection;
    let transactionOpen = false;
    let submissionStep = 'validation';
    const safeDiagnostic = (error) => {
        const databaseError = error?.cause || error;
        const rawCode = databaseError?.code || databaseError?.name || 'UNKNOWN';
        const code = typeof rawCode === 'string' && /^(?:[A-Z][A-Z0-9_]{0,63}|Error|TypeError|RangeError)$/.test(rawCode) ? rawCode : 'UNKNOWN';
        const match = String(databaseError?.sqlMessage || databaseError?.message || '').match(/(?:for column|column) ['`]([a-z_]+)['`]/i);
        const allowedColumns = new Set([
            'owner_id', 'name', 'price', 'phone_contact', 'latitude', 'longitude',
            'advance_months', 'deposit_months', 'deposit_type', 'house_status',
            'house_id', 'photo_url', 'sort_order', 'barangay', 'location', 'map_link', 'permit_key', 'file_path',
            'amenities_free', 'amenities_paid', 'description', 'img', 'img_1', 'img_2', 'img_3',
            ...['business_form', 'cedula', 'dti', 'barangay', 'building', 'zoning', 'sanitary', 'fire'].flatMap(key => ['permit_' + key, 'expiry_permit_' + key])
        ]);
        return { step: submissionStep, code, column: match && allowedColumns.has(match[1]) ? match[1] : 'unknown' };
    };
    const beginApplicationTransaction = async () => {
        submissionStep = 'database-connection';
        connection = await pool.getConnection();
        submissionStep = 'transaction-start';
        await connection.beginTransaction();
        transactionOpen = true;
    };
    const commitApplicationTransaction = async () => {
        submissionStep = 'commit';
        await connection.commit();
        transactionOpen = false;
        connection.release();
        connection = null;
    };
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

        // Upload a field buffer via unified storage provider; returns the URL/path or null if no new file
        const uploadField = async (fieldName, folder) => {
            if (req.files && req.files[fieldName] && req.files[fieldName][0]) {
                try {
                    submissionStep = 'upload:' + fieldName;
                    const f = req.files[fieldName][0];
                    return await saveUploadedFile(f.buffer, f.originalname, folder);
                } catch (uploadErr) {
                    throw new Error('File upload failed.', { cause: uploadErr });
                }
            }
            return null;
        };

        const getExpiry = (fieldName) => req.body[`expiry_permit_${fieldName}`] || null;

        // Legal documents may carry several files (images or PDF). The first file keeps
        // using the permit column (via uploadField); the rest are uploaded here and the
        // complete list is written to house_permit_files inside the property transaction.
        const permitFileKeys = ['permit_business_form', 'permit_cedula', 'permit_dti', 'permit_barangay', 'permit_building', 'permit_zoning', 'permit_sanitary', 'permit_fire'];
        const extraPermitFiles = {};
        const uploadExtraPermitFiles = async () => {
            for (const key of permitFileKeys) {
                const extra = (req.files && req.files[key]) ? req.files[key].slice(1) : [];
                if (extra.length === 0) continue;
                submissionStep = 'upload:' + key;
                extraPermitFiles[key] = await Promise.all(extra.map(f => saveUploadedFile(f.buffer, f.originalname, 'permits')));
            }
        };
        const savePermitFileList = async (targetHouseId, firstFiles) => {
            for (const key of permitFileKeys) {
                if (!firstFiles[key]) continue;
                submissionStep = 'permit-files-save';
                await connection.query('DELETE FROM house_permit_files WHERE house_id = ? AND permit_key = ?', [targetHouseId, key]);
                const list = [firstFiles[key], ...(extraPermitFiles[key] || [])];
                for (let i = 0; i < list.length; i++) {
                    await connection.query('INSERT INTO house_permit_files (house_id, permit_key, file_path, sort_order) VALUES (?, ?, ?, ?)', [targetHouseId, key, list[i], i]);
                }
            }
        };

        // A missing house_id means a new application, never an implicit edit.
        // Check before persistent uploads so a duplicate leaves the existing record untouched.
        if (!house_id) {
            if (typeof house_name !== 'string' || !house_name.trim()) {
                return res.status(400).json({ success: false, message: 'Please enter a boarding house name.' });
            }
            submissionStep = 'duplicate-check';
            const [existingOwnerHouse] = await pool.query(
                'SELECT id FROM boarding_houses WHERE owner_id = ? AND LOWER(TRIM(name)) = LOWER(?) LIMIT 1',
                [ownerId, house_name.trim()]
            );
            if (existingOwnerHouse.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'An application for this boarding house already exists. Please open the existing property to edit it or resubmit its documents.'
                });
            }
        }

        submissionStep = 'photo-list-validation';
        let parsedExistingPhotos;
        try {
            parsedExistingPhotos = existing_photos ? JSON.parse(existing_photos) : [];
            if (!Array.isArray(parsedExistingPhotos) || parsedExistingPhotos.some(photo => typeof photo !== 'string')) {
                throw new Error('Invalid photo list');
            }
        } catch {
            return res.status(400).json({ success: false, message: 'Please refresh the application and select your photos again.' });
        }

        // Upload all house photos via unified storage provider concurrently in parallel
        let uploadedPhotoUrls = [];
        if (req.files && req.files['house_photos'] && req.files['house_photos'].length > 0) {
            console.log(`[ACCREDITATION PHOTOS] Received ${req.files['house_photos'].length} new photo file(s)`);
            submissionStep = 'gallery-upload';
            const photoPromises = req.files['house_photos'].map(f => saveUploadedFile(f.buffer, f.originalname, 'house_photos'));
            uploadedPhotoUrls = await Promise.all(photoPromises);
            console.log(`[ACCREDITATION PHOTOS] Uploaded: ${JSON.stringify(uploadedPhotoUrls)}`);
        }
        const combinedPhotos = [...parsedExistingPhotos, ...uploadedPhotoUrls];
        // Optional gallery categories, aligned with combinedPhotos (existing first, then new uploads).
        const photoCategoryOptions = ['bedroom', 'comfort_room', 'kitchen', 'exterior', 'common_area', 'other'];
        let photoCategories = [];
        try {
            const parsedCategories = JSON.parse(req.body.house_photo_categories || '[]');
            if (Array.isArray(parsedCategories)) photoCategories = parsedCategories;
        } catch { photoCategories = []; }
        const photoCategoryAt = (i) => (photoCategoryOptions.includes(photoCategories[i]) ? photoCategories[i] : null);
        console.log(`[ACCREDITATION PHOTOS] existing=${parsedExistingPhotos.length} new=${uploadedPhotoUrls.length} combined=${combinedPhotos.length}`);

        // Sanitize amenities input
        const sanitizedFree = sanitizeJSONInput(amenities_free);
        const sanitizedPaid = sanitizeJSONInput(amenities_paid);

        // ================= CASE A: UPDATE EXISTING RECORD =================
        if (house_id) {
            submissionStep = 'property-lookup';
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

            const newPermitFiles = {};
            for (const key of permitFileKeys) newPermitFiles[key] = await uploadField(key, 'permits');
            await uploadExtraPermitFiles();
            const permit_business_form = newPermitFiles.permit_business_form || existingHouse.permit_business_form;
            const permit_cedula        = newPermitFiles.permit_cedula        || existingHouse.permit_cedula;
            const permit_dti           = newPermitFiles.permit_dti           || existingHouse.permit_dti;
            const permit_barangay      = newPermitFiles.permit_barangay      || existingHouse.permit_barangay;
            const permit_building      = newPermitFiles.permit_building      || existingHouse.permit_building;
            const permit_zoning        = newPermitFiles.permit_zoning        || existingHouse.permit_zoning;
            const permit_sanitary      = newPermitFiles.permit_sanitary      || existingHouse.permit_sanitary;
            const permit_fire          = newPermitFiles.permit_fire          || existingHouse.permit_fire;

            const expiry_permit_business_form = getExpiry('business_form') ? parseSafeDate(getExpiry('business_form')) : existingHouse.expiry_permit_business_form;
            const expiry_permit_cedula        = getExpiry('cedula')        ? parseSafeDate(getExpiry('cedula'))        : existingHouse.expiry_permit_cedula;
            const expiry_permit_dti           = getExpiry('dti')           ? parseSafeDate(getExpiry('dti'))           : existingHouse.expiry_permit_dti;
            const expiry_permit_barangay      = getExpiry('barangay')      ? parseSafeDate(getExpiry('barangay'))      : existingHouse.expiry_permit_barangay;
            const expiry_permit_building      = getExpiry('building')      ? parseSafeDate(getExpiry('building'))      : existingHouse.expiry_permit_building;
            const expiry_permit_zoning        = getExpiry('zoning')        ? parseSafeDate(getExpiry('zoning'))        : existingHouse.expiry_permit_zoning;
            const expiry_permit_sanitary      = getExpiry('sanitary')      ? parseSafeDate(getExpiry('sanitary'))      : existingHouse.expiry_permit_sanitary;
            const expiry_permit_fire          = getExpiry('fire')          ? parseSafeDate(getExpiry('fire'))          : existingHouse.expiry_permit_fire;

            await beginApplicationTransaction();
            // Applicant routes supply this server-only context. Ordinary owner
            // accreditation requests retain their existing behavior.
            if (req.applicantEdit) {
                submissionStep = 'application-edit-check';
                const [currentRows] = await connection.query('SELECT * FROM boarding_houses WHERE id = ? AND owner_id = ? FOR UPDATE', [house_id, ownerId]);
                const current = currentRows[0];
                if (!current || !APPLICANT_EDITABLE.has(effectiveApplicationStatus(current))
                    || effectiveApplicationStatus(current) !== req.applicantEdit.before
                    || current.house_status !== req.applicantEdit.houseStatus
                    || (current.admin_comments || '') !== req.applicantEdit.remarks) {
                    await connection.rollback();
                    transactionOpen = false;
                    return res.status(409).json({ success: false, message: 'SASO has updated this application while you were editing. Refresh Track My Application to see its current status before making further changes.' });
                }
            }
            submissionStep = 'property-update';
            const [updateResult] = await connection.query(
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
                    house_name, house_img, img_1, img_2, img_3, location, req.body.barangay || null, map_link, parseFloat(price) || 0, (contact_number || '').toString().trim().slice(0, 200), description || '',
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

            console.log(`[ACCREDITATION UPDATE] house_id=${house_id} owner_id=${ownerId} affectedRows=${updateResult.affectedRows}`);

            if (updateResult.affectedRows === 0) {
                console.error(`[ACCREDITATION UPDATE] 0 rows affected — house_id=${house_id} may not belong to owner_id=${ownerId}`);
                await connection.rollback();
                transactionOpen = false;
                return res.status(403).json({ success: false, message: 'This property is no longer available to update. Please refresh and try again.' });
            }

            // Save the property and its complete gallery as one database transaction.
            submissionStep = 'gallery-save';
            await connection.query('DELETE FROM house_photos WHERE house_id = ?', [house_id]);
            for (let i = 0; i < combinedPhotos.length; i++) {
                await connection.query(
                    'INSERT INTO house_photos (house_id, photo_url, sort_order, category) VALUES (?, ?, ?, ?)',
                    [house_id, combinedPhotos[i], i, photoCategoryAt(i)]
                );
            }
            await savePermitFileList(house_id, newPermitFiles);
            if (req.applicantEdit) {
                const { before, after } = req.applicantEdit;
                submissionStep = 'application-status-save';
                await connection.query(
                    after === APPLICATION_STATUS.RESUBMITTED
                        ? 'UPDATE boarding_houses SET application_status = ?, is_resubmission = 1, resubmitted_at = NOW() WHERE id = ?'
                        : 'UPDATE boarding_houses SET application_status = ? WHERE id = ?',
                    [after, house_id]
                );
                await recordStatusChange(connection, {
                    houseId: house_id, from: before, to: after, actorType: 'applicant', actorId: ownerId, withSnapshot: true,
                    remarks: after === APPLICATION_STATUS.RESUBMITTED ? 'Revised application resubmitted for review' : 'Application edited before review'
                });
            }
            await commitApplicationTransaction();

            // Evaluate the newly-saved expiry dates immediately rather than waiting
            // for the next scheduled sweep.
            try {
                await evaluateHouseCompliance(house_id);
            } catch (evalErr) {
                console.error('[ACCREDITATION] Immediate compliance evaluation failed:', evalErr.message);
            }

            return res.json({
                success: true,
                message: 'Accreditation application updated successfully!',
                houseId: house_id
            });
        }

        // New registrations never overwrite an existing property by name.
        const house_img        = await uploadField('house_img', 'house_images');
        const permit_business_form = await uploadField('permit_business_form', 'permits');
        const permit_cedula        = await uploadField('permit_cedula', 'permits');
        const permit_dti           = await uploadField('permit_dti', 'permits');
        const permit_barangay      = await uploadField('permit_barangay', 'permits');
        const permit_building      = await uploadField('permit_building', 'permits');
        const permit_zoning        = await uploadField('permit_zoning', 'permits');
        const permit_sanitary      = await uploadField('permit_sanitary', 'permits');
        const permit_fire          = await uploadField('permit_fire', 'permits');
        await uploadExtraPermitFiles();

        const img_1 = combinedPhotos[0] || null;
        const img_2 = combinedPhotos[1] || null;
        const img_3 = combinedPhotos[2] || null;

        await beginApplicationTransaction();
        submissionStep = 'property-insert';
        const [result] = await connection.query(
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
                location, req.body.barangay || null, map_link, parseFloat(price) || 0, (contact_number || '').toString().trim().slice(0, 200), description,
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

        submissionStep = 'gallery-save';
        const newHouseId = result.insertId;
        for (let i = 0; i < combinedPhotos.length; i++) {
            await connection.query(
                'INSERT INTO house_photos (house_id, photo_url, sort_order, category) VALUES (?, ?, ?, ?)',
                [newHouseId, combinedPhotos[i], i, photoCategoryAt(i)]
            );
        }
        await savePermitFileList(newHouseId, { permit_business_form, permit_cedula, permit_dti, permit_barangay, permit_building, permit_zoning, permit_sanitary, permit_fire });

        await commitApplicationTransaction();

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
        if (connection && transactionOpen) {
            try {
                await connection.rollback();
            } catch (rollbackErr) {
                console.error('Accreditation rollback failed:', rollbackErr.code || rollbackErr.name);
            }
        }
        console.error('Accreditation Submission Error:', safeDiagnostic(err));
        res.status(500).json({ success: false, message: 'We could not save your application. Please try again. If the problem continues, contact SASO.' });
    } finally {
        if (connection) connection.release();
    }
});

// 8. [POST] - Public property-first owner registration (no account yet)
//    The applicant registers the property together with their owner details.
//    A pending owner record (no password, no Google link) is created and the
//    property is saved through the same accreditation handler as above. The applicant
//    receives a random reference number that opens Track My Application.
//    Submitting never activates an account: SASO approval issues an activation link.
const allowRegistrationAttempt = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });

// Runs the accreditation handler above (unchanged) as the given owner and captures its
// response, so every application path shares the same validation, uploads and transaction.
export async function submitAccreditationAs(req, ownerId) {
    const layer = router.stack.find(l => l.route && l.route.path === '/accreditation' && l.route.methods.post);
    const submitAccreditation = layer.route.stack[layer.route.stack.length - 1].handle;
    const captured = { code: 200, body: null };
    const capture = {
        status(code) { captured.code = code; return this; },
        json(body) { captured.body = body; return this; }
    };
    req.user = { id: ownerId, role: 'owner', status: 'pending' };
    try {
        await submitAccreditation(req, capture);
    } catch (err) {
        console.error('Application Submission Error:', err.code || err.message);
        captured.code = 500;
        captured.body = null;
    }
    return captured;
}

// Marks a freshly saved application: random reference number (unique key, retried on the
// rare collision), SUBMITTED status and an audit entry.
export async function markApplicationSubmitted(houseId, applicantId) {
    let referenceNo = null;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        for (let attempt = 0; attempt < 5 && !referenceNo; attempt++) {
            const candidate = generateReferenceNo();
            try {
                await connection.query('UPDATE boarding_houses SET reference_no = ?, application_status = ? WHERE id = ?', [candidate, APPLICATION_STATUS.SUBMITTED, houseId]);
                referenceNo = candidate;
            } catch (err) {
                if (err.code !== 'ER_DUP_ENTRY') throw err;
            }
        }
        if (!referenceNo) throw new Error('Could not allocate a unique reference number');
        await recordStatusChange(connection, { houseId, to: APPLICATION_STATUS.SUBMITTED, remarks: 'Application submitted', actorType: 'applicant', actorId: applicantId, withSnapshot: true });
        await connection.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [applicantId, `APPLICATION SUBMITTED: Your property application ${referenceNo} was received. SASO will review it. Open Track My Application to view its status.`]);
        await connection.commit();
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
    return referenceNo;
}

const submissionFailed = (captured) => captured.code >= 400 || !captured.body?.success || !captured.body.houseId;
const failureResponse = (res, captured) => res.status(captured.code >= 400 ? captured.code : 500).json(
    captured.body && !captured.body.success
        ? captured.body
        : { success: false, message: 'We could not save your application. Please try again. If the problem continues, contact SASO.' }
);

router.post('/register-property', requireVerifiedEmail, (req, res, next) => {
    if (!allowRegistrationAttempt(req.ip || 'unknown')) {
        return res.status(429).json({ success: false, message: 'Please wait before submitting another application.' });
    }
    next();
}, uploadAccreditationFiles, validateImages, validateBody('property'), validateBody('ownerApplicant'), async (req, res) => {

    const ownerName = req.body.owner_name.trim();
    const ownerEmail = req.verifiedApplicant.email;
    if (req.body.owner_email.trim().toLowerCase() !== ownerEmail) return res.status(400).json({ success: false, message: 'Use the email address you verified.' });
    const ownerPhone = req.body.owner_phone.trim();
    const ownerAddress = req.body.owner_address.trim();
    // A public registration is always a brand-new application identified by its reference number.
    delete req.body.house_id;

    // Only the server-verified email can select the pending applicant identity.
    // An email that already has a pending application gets another application under the same
    // applicant; emails of active accounts (owners, students, SASO) are never reused here.
    let ownerId = null;
    let createdOwner = false;
    try {
        const [existing] = await pool.query('SELECT id, role, status, password, google_id FROM users WHERE email = ?', [ownerEmail]);
        if (existing.length > 0) {
            if (!isPendingApplicant(existing[0])) {
                return res.status(409).json({ success: false, message: 'This email belongs to an active account. Please log in and add the property from your owner dashboard.' });
            }
            ownerId = existing[0].id;
        } else {
            const [userResult] = await pool.query(
                `INSERT INTO users (name, email, role, status, phone, address, dpa_accepted, dpa_accepted_at, email_verified_at)
                 VALUES (?, ?, 'owner', 'pending', ?, ?, 1, NOW(), NOW())`,
                [ownerName, ownerEmail, ownerPhone, ownerAddress]
            );
            ownerId = userResult.insertId;
            createdOwner = true;
        }
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Another registration with this email is being saved. Please wait a moment and try again.' });
        console.error('Property Registration Owner Error:', err.code || err.message);
        return res.status(500).json({ success: false, message: 'We could not save your registration. Please try again. If the problem continues, contact SASO.' });
    }

    const captured = await submitAccreditationAs(req, ownerId);
    if (submissionFailed(captured)) {
        try {
            if (createdOwner) await pool.query('DELETE FROM users WHERE id = ?', [ownerId]);
        } catch (cleanupErr) {
            console.error('Property Registration cleanup failed:', cleanupErr.code || cleanupErr.message);
        }
        return failureResponse(res, captured);
    }

    let referenceNo;
    try {
        referenceNo = await markApplicationSubmitted(captured.body.houseId, ownerId);
    } catch (err) {
        // Without a reference the applicant could not track it, so undo the whole registration.
        console.error('Property Registration status save failed:', err.code || err.message);
        try {
            if (createdOwner) await pool.query('DELETE FROM users WHERE id = ?', [ownerId]);
            else await pool.query('DELETE FROM boarding_houses WHERE id = ?', [captured.body.houseId]);
        } catch { /* best effort */ }
        return res.status(500).json({ success: false, message: 'We could not save your registration. Please try again. If the problem continues, contact SASO.' });
    }

    return res.status(201).json({
        success: true,
        message: 'Application submitted! Keep your reference number to track it.',
        reference_no: referenceNo,
        token: signVerifiedApplicant(ownerEmail, ownerId)
    });
});

export default router;
