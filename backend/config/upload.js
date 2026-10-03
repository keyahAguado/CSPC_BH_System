import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

// Configure Cloudinary credentials from environment variables
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Shared Multer instance using memory storage for buffering uploads in RAM.
 */
export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 19 } // 10MB limit
});

/**
 * Resolves the target uploads directory for local disk storage.
 */
export const getUploadsDir = () => {
    if (process.env.UPLOADS_DIR) {
        const customDir = path.resolve(process.env.UPLOADS_DIR);
        if (!fs.existsSync(customDir)) fs.mkdirSync(customDir, { recursive: true });
        return customDir;
    }

    // Default to /app/uploads inside Docker container or fallback to local uploads folder
    const targetDir = fs.existsSync('/app') ? '/app/uploads' : path.resolve('public/uploads');
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    return targetDir;
};

/**
 * Saves an uploaded file buffer to either Cloudinary or local disk based on STORAGE_PROVIDER.
 * @param {Buffer} buffer - File buffer from req.file.buffer
 * @param {string} originalname - Original file name for extension preservation
 * @param {string} folder - Category subfolder (e.g., 'profile_pics', 'house_images', 'permits')
 * @returns {Promise<string>} - Returns full Cloudinary HTTPS URL or relative /uploads/filename.ext path
 */
export async function saveUploadedFile(buffer, originalname = 'file.jpg', folder = 'general') {
    const provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase().trim();

    if (provider === 'cloudinary') {
        return new Promise((resolve, reject) => {
            const options = {
                folder: `cspc_bh/${folder}`,
                transformation: [{ quality: 'auto', fetch_format: 'auto' }]
            };

            const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
                if (error) {
                    console.error('[CLOUDINARY UPLOAD ERROR]:', error.message);
                    return reject(error);
                }
                resolve(result.secure_url);
            });

            Readable.from(buffer).pipe(uploadStream);
        });
    }

    // Default: STORAGE_PROVIDER === 'local'
    const targetDir = getUploadsDir();
    const ext = path.extname(originalname) || '.jpg';
    const filename = `${folder}_${Date.now()}_${Math.floor(Math.random() * 10000)}${ext}`;
    const filePath = path.join(targetDir, filename);

    await fs.promises.writeFile(filePath, buffer);
    console.log(`📁 [LOCAL UPLOAD SUCCESS] File saved to ${filePath}`);

    // Return uniform relative path served directly by Nginx /uploads/
    return `/uploads/${filename}`;
}

/**
 * Sweeps the local uploads directory for orphaned files — ones no longer
 * referenced by any DB record (e.g. left behind after a photo/permit/profile
 * pic is replaced, since replacements only overwrite the DB pointer, not the
 * old file on disk). No-op when STORAGE_PROVIDER is not 'local'.
 * A 24h grace period protects files that were just written but whose DB
 * row hasn't committed yet.
 * @param {import('mysql2/promise').Pool} pool
 */
export async function cleanupOrphanedUploads(pool) {
    const provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase().trim();
    if (provider !== 'local') return { skipped: true };

    const dir = getUploadsDir();
    const files = await fs.promises.readdir(dir).catch(() => []);
    if (files.length === 0) return { deleted: 0, scanned: 0 };

    const [rows] = await pool.query(`
        SELECT img AS path FROM boarding_houses WHERE img IS NOT NULL
        UNION SELECT img_1 FROM boarding_houses WHERE img_1 IS NOT NULL
        UNION SELECT img_2 FROM boarding_houses WHERE img_2 IS NOT NULL
        UNION SELECT img_3 FROM boarding_houses WHERE img_3 IS NOT NULL
        UNION SELECT permit_business_form FROM boarding_houses WHERE permit_business_form IS NOT NULL
        UNION SELECT permit_cedula FROM boarding_houses WHERE permit_cedula IS NOT NULL
        UNION SELECT permit_dti FROM boarding_houses WHERE permit_dti IS NOT NULL
        UNION SELECT permit_barangay FROM boarding_houses WHERE permit_barangay IS NOT NULL
        UNION SELECT permit_building FROM boarding_houses WHERE permit_building IS NOT NULL
        UNION SELECT permit_zoning FROM boarding_houses WHERE permit_zoning IS NOT NULL
        UNION SELECT permit_sanitary FROM boarding_houses WHERE permit_sanitary IS NOT NULL
        UNION SELECT permit_fire FROM boarding_houses WHERE permit_fire IS NOT NULL
        UNION SELECT profile_pic FROM users WHERE profile_pic IS NOT NULL
        UNION SELECT photo_url FROM house_photos WHERE photo_url IS NOT NULL
        UNION SELECT file_path FROM house_documents WHERE file_path IS NOT NULL
    `);

    const referenced = new Set(rows.map(r => path.basename(String(r.path))));
    const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;
    let deleted = 0;

    for (const filename of files) {
        if (referenced.has(filename)) continue;
        const filePath = path.join(dir, filename);
        try {
            const stat = await fs.promises.stat(filePath);
            if (Date.now() - stat.mtimeMs < GRACE_PERIOD_MS) continue;
            await fs.promises.unlink(filePath);
            deleted++;
        } catch (e) {
            // Ignore individual file errors (already removed, permission issue, etc.)
        }
    }

    return { deleted, scanned: files.length };
}

export default upload;
