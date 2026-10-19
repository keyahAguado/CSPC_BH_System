import axios from 'axios';
import { providerOptions } from './paymentSettlement.js';
import { sealSecret } from './paymentSecrets.js';
import { paymentMode, validWebhookOrigin } from './paymentEnvironment.js';
import { currentDirectConnection, readyDirectConnection } from './ownerDirectPayments.js';
export { sealSecret, openSecret } from './paymentSecrets.js';
export { paymentMode } from './paymentEnvironment.js';
const fail = (status, message) => Object.assign(new Error(message), { status });
export function paymentSetupAvailable() {
 return process.env.PAYMONGO_LINKED_ACCOUNTS_ENABLED === 'true' && /^sk_(test|live)_/.test(process.env.PAYMONGO_SECRET_KEY || '') && /^[a-f0-9]{64}$/i.test(process.env.PAYMENT_CONNECTION_ENCRYPTION_KEY || '') && validWebhookOrigin();
}
export async function ownerConnection(db, ownerId) {
    const [rows] = await db.query('SELECT * FROM owner_payment_connections WHERE owner_id = ? AND mode = ?', [ownerId, paymentMode()]);
    return rows[0] || null;
}
export async function requireOwnerPayments(db, houseId) {
    const [houses] = await db.query('SELECT owner_id FROM boarding_houses WHERE id = ?', [houseId]);
    if (!houses[0]) throw fail(404, 'Property not found.');
    {
        const direct = await currentDirectConnection(db, houses[0].owner_id);
        if (direct) {
            const ready = await readyDirectConnection(db, houses[0].owner_id);
            if (!ready) throw fail(409, 'The owner must check their online payment connection. Choose cash or contact the owner.');
            return {...ready, direct_connection_id:ready.id};
        }
    }
    if (!paymentSetupAvailable()) throw fail(409, 'Online payments are not available for this property. Choose cash or contact the owner.');
    const row = await ownerConnection(db, houses[0].owner_id);
    if (!row || row.status !== 'ready' || !row.account_id || !row.webhook_secret || !row.webhook_id) throw fail(409, 'The owner has not finished online payment setup. Choose cash or contact the owner.');
    return row;
}
export function publicConnection(row) {
    return { status: row?.status === 'ready' && !paymentSetupAvailable() ? 'attention' : row?.status || 'not_started', email: row?.email || '', mode: paymentMode(),
        setupAvailable: paymentSetupAvailable(), checkedAt: row?.checked_at || null,
        continueUrl: row?.invitation_id && row.status === 'pending' ? `https://dashboard.paymongo.com/signup?${new URLSearchParams({email: row.email, invitation_code: row.invitation_id})}` : null };
}
const linkingBase = 'https://accounts-api.paymongo.com/v2/linking_requests';
const unwrap = value => value?.data?.attributes || value?.data || value;
export const PAYMENT_POLICY = { payment: {view: 'related', manage: 'related'}, webhook: {view: 'global', manage: 'global'} };
export function createOwnerPaymentService({ http = axios } = {}) {
    return {
        async invite(email) {
            const menu = unwrap((await http.get(linkingBase + '/policy_menu', providerOptions())).data);
            if (menu?.policy_selection_allowed !== true || menu?.account_linking_allowed === false) throw fail(503, 'Owner payment connections are not enabled for the platform yet. Contact the administrator; cash bookings remain available.');
            const result = (await http.post(linkingBase + '/invites', {invites: [{email, account_type: 'merchant'}], policy_selection: PAYMENT_POLICY}, providerOptions())).data;
            const body = unwrap(result);
            const entry = body?.invites?.find(item => item.email?.toLowerCase() === email.toLowerCase());
            if (!entry || !/^lr_[a-zA-Z0-9]+$/.test(entry.invitation_id || '') || entry.status !== 'pending') throw fail(409, 'PayMongo could not start this connection. If you already have an account, open PayMongo Invitations or contact the administrator.');
            return entry.invitation_id;
        },
        async refresh(row) {
            const invite = unwrap((await http.get(linkingBase + '/' + encodeURIComponent(row.invitation_id), providerOptions())).data);
            if (invite.email?.toLowerCase() !== row.email.toLowerCase() || invite.invitation_id !== row.invitation_id) throw fail(502, 'PayMongo returned a different connection. Please contact the administrator.');
            if (['declined', 'cancelled'].includes(invite.status)) return {status: invite.status};
            if (invite.status !== 'accepted') return {status: 'pending'};
            if (!/^org_[a-zA-Z0-9]+$/.test(invite.child_account_id || '')) throw fail(502, 'The accepted connection has no merchant account.');
            const accountId = invite.child_account_id;
            if (row.account_id && row.account_id !== accountId) throw fail(409, 'The connected merchant changed. Contact the administrator.');
            const account = unwrap((await http.get('https://api.paymongo.com/v2/accounts/' + accountId, providerOptions())).data);
            if (account.id !== accountId || account.type !== 'merchant') throw fail(502, 'PayMongo returned a different merchant account.');
            if (account.activation_status !== 'activated') return {status: 'verification_pending', account_id: accountId};
            const options = providerOptions(accountId);
            const capabilities = unwrap((await http.get('https://api.paymongo.com/v1/merchants/capabilities/payment_methods', options)).data);
            const methods = Array.isArray(capabilities) ? capabilities : capabilities?.payment_methods;
            if (!Array.isArray(methods) || !methods.includes('qrph')) return {status: 'verification_pending', account_id: accountId};
            const url = process.env.PAYMONGO_WEBHOOK_BASE_URL.replace(/\/$/, '') + '/api/payment/webhook/owner/' + row.id;
            let webhook;
            if (row.webhook_id) {
                webhook = (await http.get('https://api.paymongo.com/v1/webhooks/' + row.webhook_id, options)).data.data;
                if (webhook?.attributes?.url !== url || webhook?.attributes?.status !== 'enabled' || !webhook?.attributes?.events?.includes('checkout_session.payment.paid')) throw fail(409, 'Payment confirmation needs administrator attention. Online payments remain unavailable.');
            } else {
                // Recover an interrupted setup before creating another provider webhook.
                const existing = (await http.get('https://api.paymongo.com/v1/webhooks', options)).data.data;
                webhook = Array.isArray(existing) && existing.find(item => item.attributes?.url === url && item.attributes?.status === 'enabled' && item.attributes?.events?.includes('checkout_session.payment.paid'));
                if (!webhook) webhook = (await http.post('https://api.paymongo.com/v1/webhooks', {data: {attributes: {url, events: ['checkout_session.payment.paid']}}}, options)).data.data;
            }
            if (!webhook?.id || typeof webhook.attributes?.secret_key !== 'string' || webhook.attributes.livemode !== (row.mode === 'live')) throw fail(502, 'PayMongo payment confirmation could not be verified.');
            return {status: 'ready', account_id: accountId, webhook_id: webhook.id, webhook_secret: sealSecret(webhook.attributes.secret_key)};
        }
    };
}
