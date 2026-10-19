import { notifyPaymentInterruption } from './paymentInterruption.js';
import crypto from 'crypto';
import axios from 'axios';
import { encryptionConfigured, sealSecret, openSecret, credentialFingerprint } from './paymentSecrets.js';
import { paymentMode, validWebhookOrigin } from './paymentEnvironment.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const API='https://api.paymongo.com/v1';
export const directSetupAvailable=()=>process.env.PAYMONGO_DIRECT_ACCOUNTS_ENABLED==='true'&&encryptionConfigured()&&validWebhookOrigin();
export const directContext=(row,kind)=>`owner-paymongo:${row.id}:${Number(row.owner_id)}:${row.mode}:${kind}`;
export const directSecret=row=>openSecret(row.secret_ciphertext,directContext(row,'key'));
export const directWebhookSecret=row=>openSecret(row.webhook_secret,directContext(row,'webhook'));
export function directProviderOptions(row) {
    if(!['test','live'].includes(row.mode)||row.mode!==paymentMode())throw fail(409,'This payment belongs to another payment environment. Contact the administrator.');
    const key=directSecret(row);
    if(!new RegExp('^sk_'+row.mode+'_[a-zA-Z0-9]+$').test(key))throw fail(503,'The saved payment credential cannot be used. Contact the owner.');
    return {timeout:15000,maxRedirects:0,headers:{Authorization:'Basic '+Buffer.from(key+':').toString('base64')}};
}
export async function currentDirectConnection(db,ownerId) {
    const [rows]=await db.query('SELECT * FROM owner_direct_payment_connections WHERE owner_id = ? AND mode = ? AND current_slot = 1',[ownerId,paymentMode()]);return rows[0]||null;
}
export function directPublic(row) {
    return {status:row?.status==='ready'&&!directSetupAvailable()?'attention':row?.status||'not_started',
        mode:paymentMode(),setupAvailable:directSetupAvailable(),label:row?.merchant_label||'',lastFour:row?.key_last_four||'',
        checkedAt:row?.checked_at||null,issue:row?.issue_code||null};
}
export async function readyDirectConnection(db,ownerId) {
    if(!directSetupAvailable())return null;
    const row=await currentDirectConnection(db,ownerId);
    if(!row||row.status!=='ready'||!row.webhook_id||!row.webhook_secret)return null;
    // Status older than 20 minutes is never enough to accept a new payment request.
    if(!row.checked_at||Date.now()-new Date(row.checked_at).getTime()>20*60*1000)return null;
    return row;
}
export async function directOptionsForBooking(db,booking) {
    const [rows]=await db.query('SELECT * FROM owner_direct_payment_connections WHERE id = ?',[booking.paymongo_direct_connection_id]);
    const row=rows[0];
    if(!row||row.mode!==booking.paymongo_mode)throw fail(409,'The original payment connection is unavailable. Contact the owner; do not pay again.');
    return directProviderOptions(row);
}
export function validateOwnerKey(key) {
    if(typeof key!=='string'||key.length>256||!/^sk_(test|live)_[a-zA-Z0-9]+$/.test(key))throw fail(400,'Enter a valid PayMongo secret key, not a public key.');
    const mode=key.startsWith('sk_live_')?'live':'test';
    if(mode!==paymentMode())throw fail(400,`This environment accepts ${paymentMode()} keys only. Your key was not saved.`);
    return mode;
}
function methodsFrom(response) {
    const body=response.data?.data?.attributes||response.data?.data||response.data;
    const methods=Array.isArray(body)?body:body?.payment_methods;
    if(!Array.isArray(methods)||methods.some(m=>typeof m!=='string'))throw fail(502,'PayMongo returned an unrecognized capability response.');
    return methods;
}
export function directFailure(error) {
    if(error.status && !error.isAxiosError && !error.response)return error;
    if([401,403].includes(error.response?.status))return Object.assign(fail(409,'PayMongo rejected access. Reconnect a valid key from the same merchant account or contact PayMongo.'),{issue:'access_rejected'});
    return Object.assign(fail(502,'PayMongo is temporarily unavailable. New online payments are paused until the connection is checked again.'),{issue:'provider_unavailable'});
}
export function createDirectPaymentService({http=axios}={}) {
    return {
        async inspect(row) {
            const options=directProviderOptions(row);
            const methods=methodsFrom(await http.get(API+'/merchants/capabilities/payment_methods',options));
            if(!methods.includes('qrph'))throw Object.assign(fail(409,'QR Ph is not active on this merchant account. Activate it in PayMongo before reconnecting.'),{issue:'qrph_unavailable'});
            return options;
        },
        async check(row,{createWebhook=false}={}) {
            try {
                const options=await this.inspect(row);
                const url=process.env.PAYMONGO_WEBHOOK_BASE_URL.replace(/\/$/,'')+'/api/payment/webhook/direct/'+row.id;
                let hook;
                if(row.webhook_id)hook=(await http.get(API+'/webhooks/'+encodeURIComponent(row.webhook_id),options)).data.data;
                else if(createWebhook) {
                    // Exact callback UUID is owned by this credential version; recover retries before creating.
                    const list=(await http.get(API+'/webhooks',options)).data.data;
                    hook=Array.isArray(list)&&list.find(h=>h.attributes?.url===url&&h.attributes?.status==='enabled');
                    if(!hook)hook=(await http.post(API+'/webhooks',{data:{attributes:{url,events:['checkout_session.payment.paid']}}},options)).data.data;
                }
                const a=hook?.attributes;
                if(!hook?.id||a?.url!==url||a.status!=='enabled'||a.livemode!==(row.mode==='live')||!a.events?.includes('checkout_session.payment.paid'))throw Object.assign(fail(409,'Payment confirmation is not ready. Check your PayMongo webhook or reconnect this account.'),{issue:'webhook_unavailable'});
                // Existing webhooks may omit the signing secret; retain the previously verified encrypted secret.
                const secret=typeof a.secret_key==='string'&&a.secret_key.length>10?sealSecret(a.secret_key,directContext(row,'webhook')):row.webhook_secret;
                if(!secret)throw fail(502,'PayMongo did not provide a webhook verification secret.');
                if(row.webhook_id&&row.webhook_secret&&typeof a.secret_key==='string'&&a.secret_key!==directWebhookSecret(row))throw fail(409,'The webhook secret changed. Reconnect this merchant before accepting new payments.');
                return {webhook_id:hook.id,webhook_secret:secret,status:'ready'};
            }catch(error){throw directFailure(error);}
        },
        async proveSameMerchant(previous,next) {
            if(!previous.webhook_id)throw fail(409,'The previous setup was incomplete. An administrator must review it before changing credentials.');
            const hook=(await http.get(API+'/webhooks/'+encodeURIComponent(previous.webhook_id),directProviderOptions(next))).data.data;
            if(hook?.id!==previous.webhook_id||hook.attributes?.url!==process.env.PAYMONGO_WEBHOOK_BASE_URL.replace(/\/$/,'')+'/api/payment/webhook/direct/'+previous.id)throw fail(409,'The new key must belong to the same PayMongo merchant.');
            // Recover access for checkouts created under the older key before retiring that version.
            const secret=directSecret(next);
            return sealSecret(secret,directContext(previous,'key'));
        }
    };
}
export function newDirectRecord(ownerId,key,label) {
    const row={id:crypto.randomUUID(),owner_id:Number(ownerId),mode:validateOwnerKey(key),merchant_label:label};
    return {...row,secret_ciphertext:sealSecret(key,directContext(row,'key')),key_fingerprint:credentialFingerprint(key),key_last_four:key.slice(-4)};
}
export async function pauseDirectConnection(db,row,issue) {
    const [result]=await db.query("UPDATE owner_direct_payment_connections SET status = 'attention', issue_code = ? WHERE id = ? AND current_slot = 1 AND status = 'ready'",[issue||'check_required',row.id]);
    if(result.affectedRows)await db.query('INSERT INTO notifications (user_id,message,link) VALUES (?,?,?)',[row.owner_id,'ONLINE PAYMENTS PAUSED: PayMongo access or payment confirmation could not be verified. New online bookings are unavailable; cash remains available. Open Online payments to check or reconnect your merchant account. Existing payments must still be checked; do not ask students to pay twice.','/owner/payments']);
    await notifyPaymentInterruption(db,row);
}
export function createDirectHealthWorker({pool,service=createDirectPaymentService(),log=console}={}) {
    let running=false;
    return async()=>{
        if(running||!directSetupAvailable())return;
        running=true;
        try {
            const [rows]=await pool.query("SELECT * FROM owner_direct_payment_connections WHERE current_slot = 1 AND mode = ? AND status IN ('ready','attention') ORDER BY checked_at LIMIT 100",[paymentMode()]);
            for(const row of rows) {
                try {const update=await service.check(row);await pool.query("UPDATE owner_direct_payment_connections SET status = 'ready', issue_code = NULL, checked_at = NOW(), webhook_secret = ? WHERE id = ? AND current_slot = 1 AND status IN ('ready','attention')",[update.webhook_secret,row.id]);}
                catch(error){await pauseDirectConnection(pool,row,error.issue);await pool.query('UPDATE owner_direct_payment_connections SET checked_at = NOW() WHERE id = ? AND current_slot = 1',[row.id]);}
            }
            const [disconnected]=await pool.query(`SELECT c.* FROM owner_direct_payment_connections c WHERE c.current_slot = 1 AND c.mode = ? AND c.status = 'disconnected'
                AND EXISTS (SELECT 1 FROM bookings b JOIN boarding_houses bh ON bh.id = b.house_id WHERE bh.owner_id = c.owner_id
                    AND b.payment_method = 'paymongo' AND b.status IN ('pending','confirmed') AND b.payment_status != 'paid'
                    AND b.paymongo_payment_id IS NULL AND b.payment_interruption_notified_at IS NULL
                    AND (b.paymongo_mode IS NULL OR b.paymongo_mode = ?)) LIMIT 100`,[paymentMode(),paymentMode()]);
            // c.mode already equals the current mode; comparing bookings.paymongo_mode (utf8mb4_general_ci) with
            // the newer table's column (server-default collation) raised "Illegal mix of collations".
            for(const row of disconnected)await notifyPaymentInterruption(pool,row);
        }catch(error){log.warn('[OWNER PAYMENTS] Connection health check could not finish:',error?.code||error?.name||'unknown');}finally{running=false;}
    };
}
