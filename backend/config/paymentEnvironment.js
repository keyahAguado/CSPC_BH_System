export const paymentMode = () => ['live','test'].includes(process.env.PAYMONGO_PAYMENT_MODE)
    ? process.env.PAYMONGO_PAYMENT_MODE : process.env.PAYMONGO_SECRET_KEY?.startsWith('sk_live_') ? 'live' : 'test';
export function validWebhookOrigin() {
    try { const url=new URL(process.env.PAYMONGO_WEBHOOK_BASE_URL);return url.protocol==='https:'&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash; } catch {return false;}
}
