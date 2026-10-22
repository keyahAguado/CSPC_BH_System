import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

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
    if (provider === 's3') getS3Config();
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
    }));
    return `/uploads/s3/${key}`;
}
// The bucket remains private. This application route preserves existing URL-based
// media access; it does not introduce owner/admin authorization for documents.
export async function serveS3Media(req, res) {
    const key = Array.isArray(req.params.key) ? req.params.key.join('/') : req.params.key;
    if (!/^media\/[a-z_]+\/[a-f0-9-]{36}\.[a-z]+$/.test(key || '')) return res.sendStatus(404);
    try {
        const object = await storageClient().send(new GetObjectCommand({
            Bucket: process.env.S3_BUCKET, Key: key,
            ...(req.headers.range ? { Range: req.headers.range } : {}),
        }));
        res.status(object.ContentRange ? 206 : 200);
        res.setHeader('Content-Type', object.ContentType || 'application/octet-stream');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Accept-Ranges', 'bytes');
        if (object.ContentLength != null) res.setHeader('Content-Length', object.ContentLength);
        if (object.ContentRange) res.setHeader('Content-Range', object.ContentRange);
        if (req.method === 'HEAD') {
            object.Body?.destroy();
            return res.end();
        }
        await pipeline(object.Body, res);
    } catch (error) {
        if (res.headersSent) return res.destroy();
        const status = error.$metadata?.httpStatusCode;
        if (status === 404 || error.name === 'NoSuchKey') return res.sendStatus(404);
        if (status === 416) return res.sendStatus(416);
        console.error('[S3 READ ERROR]', error.name);
        return res.status(502).json({ message: 'Media storage is temporarily unavailable.' });
    }
}
