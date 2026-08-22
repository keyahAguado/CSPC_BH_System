import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { Readable } from 'stream';

// Configure Cloudinary credentials from environment variables
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Multer instance using memory storage.
 * Use this instead of disk-based multer for all file uploads.
 * After multer runs, call uploadBufferToCloudinary() with req.file.buffer.
 */
export const memoryUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

/**
 * Uploads a buffer to Cloudinary.
 * @param {Buffer} buffer - File buffer from req.file.buffer
 * @param {string} folder - Cloudinary folder, e.g. 'house_images'
 * @param {string} [publicId] - Optional stable public_id (omit for auto-generated)
 * @returns {Promise<{url: string, public_id: string}>}
 */
export function uploadBufferToCloudinary(buffer, folder, publicId) {
    return new Promise((resolve, reject) => {
        const options = {
            folder: `cspc_bh/${folder}`,
            transformation: [{ quality: 'auto', fetch_format: 'auto' }],
            ...(publicId ? { public_id: publicId, overwrite: true } : {})
        };

        const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error) return reject(error);
            resolve({ url: result.secure_url, public_id: result.public_id });
        });

        Readable.from(buffer).pipe(uploadStream);
    });
}

/**
 * Deletes a file from Cloudinary by its URL or public_id.
 * Safe to call even if the value is undefined.
 */
export async function deleteFromCloudinary(publicIdOrUrl) {
    if (!publicIdOrUrl) return;
    // Skip local filenames (legacy disk-based files — don't try to delete from Cloudinary)
    if (!publicIdOrUrl.startsWith('http')) return;
    try {
        let publicId = publicIdOrUrl;
        if (publicIdOrUrl.startsWith('http')) {
            const parts = publicIdOrUrl.split('/');
            const uploadIdx = parts.indexOf('upload');
            if (uploadIdx !== -1) {
                const afterVersion = parts.slice(uploadIdx + 2).join('/');
                publicId = afterVersion.replace(/\.[^/.]+$/, '');
            }
        }
        await cloudinary.uploader.destroy(publicId);
    } catch (e) {
        console.warn('[CLOUDINARY] Delete skipped:', e.message);
    }
}

export default cloudinary;
