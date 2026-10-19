import crypto from 'crypto';
export function encryptionConfigured() { return /^[a-f0-9]{64}$/i.test(process.env.PAYMENT_CONNECTION_ENCRYPTION_KEY || ''); }
function masterKey() {
    if (!encryptionConfigured()) throw Object.assign(new Error('Payment setup needs administrator configuration.'), {status:503});
    return Buffer.from(process.env.PAYMENT_CONNECTION_ENCRYPTION_KEY,'hex');
}
export function sealSecret(value, context = '') {
    const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',masterKey(),iv);
    if(context)cipher.setAAD(Buffer.from(context));
    return [iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()].map(b=>b.toString('base64')).join('.');
}
export function openSecret(value, context = '') {
    const parts=String(value).split('.');
    if(parts.length!==4)throw new Error('Invalid encrypted payment credential.');
    const [iv,data,final,tag]=parts.map(s=>Buffer.from(s,'base64'));
    const decipher=crypto.createDecipheriv('aes-256-gcm',masterKey(),iv);
    if(context)decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.concat([data,final])),decipher.final()]).toString('utf8');
}
export const credentialFingerprint = key => crypto.createHmac('sha256',masterKey()).update('owner-paymongo-key:'+key).digest('hex');
