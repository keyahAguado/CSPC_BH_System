import path from 'path';

const extensions = new Set(['.jpg','.jpeg','.png','.webp','.gif','.bmp','.tif','.tiff','.heic','.heif','.avif']);
export function supportedImage(file) {
    if (!file || !extensions.has(path.extname(file.originalname || '').toLowerCase())) return false;
    const b = file.buffer;
    if (!Buffer.isBuffer(b) || b.length < 12) return false;
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
    if (b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return true;
    if (b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WEBP') return true;
    if (['GIF87a','GIF89a'].includes(b.toString('ascii',0,6))) return true;
    if (b.toString('ascii',0,2) === 'BM') return true;
    if (b.subarray(0,4).equals(Buffer.from([73,73,42,0])) || b.subarray(0,4).equals(Buffer.from([77,77,0,42]))) return true;
    if (b.toString('ascii',4,8) === 'ftyp') {
        const brands = new Set(['heic','heix','hevc','hevx','mif1','msf1','avif','avis']);
        const end = Math.min(b.readUInt32BE(0), b.length, 128);
        for (let i = 8; i + 4 <= end; i += 4) if (i !== 12 && brands.has(b.toString('ascii',i,i+4))) return true;
    }
    return false;
}
// Legal documents may also be PDF (checked by the %PDF- signature, not just the extension).
export const PERMIT_FIELDS = ['permit_business_form', 'permit_cedula', 'permit_dti', 'permit_barangay', 'permit_building', 'permit_zoning', 'permit_sanitary', 'permit_fire'];
export function supportedPdf(file) {
    if (!file || path.extname(file.originalname || '').toLowerCase() !== '.pdf') return false;
    const b = file.buffer;
    return Buffer.isBuffer(b) && b.length >= 5 && b.toString('ascii', 0, 5) === '%PDF-';
}
// Run after Multer buffers the request, before any file is persistently saved.
export function validateImages(req, res, next) {
    const files = req.file ? [req.file] : Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat();
    // Application uploads: accreditation, public registration and Track My Application routes.
    const isApplicationUpload = req.path === '/accreditation' || req.path === '/register-property' || req.applicationUpload === true;
    const allowsPermitPdf = isApplicationUpload;
    for (const file of files) {
        if (allowsPermitPdf && PERMIT_FIELDS.includes(file.fieldname) && supportedPdf(file)) continue;
        if (!supportedImage(file)) {
            const labels = { profile_pic: 'Profile photo', img: 'Featured property photo', house_img: 'Featured property photo', house_photos: 'Gallery photo', permit_file: 'Document image', permit_business_form: 'Business permit image', permit_cedula: 'Cedula image', permit_dti: 'DTI image', permit_barangay: 'Barangay clearance image', permit_building: 'Building permit image', permit_zoning: 'Zoning permit image', permit_sanitary: 'Sanitary permit image', permit_fire: 'Fire safety permit image' };
            const label = labels[file.fieldname] || 'Selected image';
            const formats = allowsPermitPdf && PERMIT_FIELDS.includes(file.fieldname) ? 'image or PDF file (JPG, PNG, WEBP, HEIC or PDF)' : 'image file (JPG, PNG, WEBP, GIF, BMP, TIFF, HEIC, HEIF, or AVIF)';
            return res.status(400).json({ success: false, message: `${label} is invalid. Please select a supported ${formats}.`, errorCode: 'invalid_input' });
        }
    }
    if (req.path?.startsWith('/edit/')) {
        const gallery = files.filter(file => file.fieldname !== 'img');
        const featured = files.filter(file => file.fieldname === 'img');
        if (featured.length > 1 || gallery.some(file => !/^new_photo_\d+$/.test(file.fieldname))) return res.status(400).json({ success: false, message: 'Please refresh the property form and select your photos again.' });
        let existing;
        try { existing = JSON.parse(req.body.existing_photos || '[]'); } catch { existing = null; }
        if (!Array.isArray(existing) || existing.length + gallery.length > 10) return res.status(400).json({ success: false, message: 'A property can have at most 10 gallery photos. Please remove extra photos before saving.' });
    }
    if (isApplicationUpload) {
        let existing;
        try { existing = JSON.parse(req.body.existing_photos || '[]'); } catch { existing = null; }
        if (!Array.isArray(existing) || existing.length + (req.files?.house_photos?.length || 0) > 10) return res.status(400).json({ success: false, message: 'A property can have at most 10 gallery photos. Please remove extra photos before saving.' });
    }
    return next();
}
export function uploadErrorHandler(err, req, res, next) {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'The submitted form could not be read. Please refresh the page and try again.', errorCode: 'invalid_input' });
    if (err?.name !== 'MulterError') return next(err);
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Each uploaded file must be 10 MB or smaller. Please choose a smaller image.' : 'Too many files or an unsupported upload field. Please refresh the form and select your files again.';
    return res.status(400).json({ success: false, message, errorCode: 'invalid_input' });
}
