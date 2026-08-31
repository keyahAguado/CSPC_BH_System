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
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
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

export default upload;
