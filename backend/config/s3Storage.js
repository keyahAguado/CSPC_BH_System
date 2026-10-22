import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createDocumentAccess } from './mediaAccess.js';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const types = { '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.gif':'image/gif', '.pdf':'application/pdf', '.bmp':'image/bmp', '.tif':'image/tiff', '.tiff':'image/tiff', '.heic':'image/heic', '.heif':'image/heif', '.avif':'image/avif' };
let client;
export function getS3Config(env = process.env) {
    for (const name of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
        if (!env[name]?.trim()) throw new Error(`Missing required storage setting: ${name}`);
    }
    const endpoint = new URL(env.S3_ENDPOINT);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Invalid S3_ENDPOINT');
    return {
        endpoint: endpoint.toString(),
        region: env.S3_REGION || 'us-east-1',
        forcePathStyle: env.S3_FORCE_PATH_STYLE !== 'false',
        credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    };
}
export function validateStorageConfig() {
    const provider = (process.env.STORAGE_PROVIDER || 'local').trim().toLowerCase();
    if (!['local', 'cloudinary', 's3'].includes(provider)) throw new Error('Unsupported STORAGE_PROVIDER');
    if (provider === 's3') {
        getS3Config();
        if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(process.env.S3_BUCKET)) throw new Error('Invalid S3_BUCKET');
        const website = new URL(process.env.FRONTEND_URL);
        if (!['http:', 'https:'].includes(website.protocol) || website.username || website.password || website.pathname !== '/' || website.search || website.hash) throw new Error('FRONTEND_URL must be the website origin');
        if (!process.env.JWT_SECRET?.trim()) throw new Error('JWT_SECRET is required for document access');
    }
}
function storageClient() {
    return client ||= new S3Client(getS3Config());
}
export async function saveS3File(buffer, originalname, folder) {
    const extension = path.extname(originalname).toLowerCase();
    const contentType = types[extension];
    if (!contentType || !/^[a-z_]+$/.test(folder)) throw new Error('Unsupported media type or category');
    const key = `media/${folder}/${randomUUID()}${extension}`;
    await storageClient().send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET, Key: key, Body: buffer, ContentType: contentType,
        CacheControl: folder === 'permits' ? 'private, no-store' : 'public, max-age=3600',
    }));
    return `/uploads/s3/${key}`;
}
// Store stable references; generate short-lived delivery URLs only when requested.
export function createS3MediaHandler({ client = storageClient, sign = getSignedUrl, canReadDocument = async () => false, env = process.env } = {}) {
    return async function serveMedia(req, res) {
        const key = Array.isArray(req.params.key) ? req.params.key.join('/') : req.params.key;
        if (!/^media\/[a-z_]+\/[a-f0-9-]{36}\.[a-z]+$/.test(key || '')) return res.sendStatus(404);
        res.setHeader('Cache-Control', 'private, no-store');
        try {
            if (key.startsWith('media/permits/') && !(await canReadDocument(req.headers.authorization, '/uploads/s3/' + key))) return res.sendStatus(403);
            const Command = req.method === 'HEAD' ? HeadObjectCommand : GetObjectCommand;
            const signed = new URL(await sign(client(), new Command({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn: 300 }));
            // Nginx strips /storage and preserves the signed internal Host header.
            const delivery = new URL('/storage' + signed.pathname + signed.search, env.FRONTEND_URL);
            return res.redirect(307, delivery.href);
        } catch (error) {
            console.error('[S3 LINK ERROR]', error.name);
            return res.status(503).json({ message: 'Media storage is temporarily unavailable.' });
        }
    };
}
export const serveS3Media = createS3MediaHandler();
