<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import axios from 'axios';
const connection=ref(null), history=ref([]), busy=ref(false), error=ref(''), message=ref('');
const secretKey=ref(''), label=ref(''), authorized=ref(false), allowWebhook=ref(false), disconnectConfirmed=ref(false);
const labels={not_started:'Not connected',pending:'Setup in progress',ready:'QR Ph connection checked',attention:'New online payments paused',disconnected:'Disconnected for new payments'};
const actions={connect_requested:'Setup requested',reconnect_requested:'Reconnection requested',connection_verified:'Connection verified',connection_checked:'Connection checked',disconnected_for_new_payments:'New payments disconnected'};
const headers=()=>({Authorization:'Bearer '+sessionStorage.getItem('cspc_token')});
async function request(action='',body) {
  if(busy.value)return;
  busy.value=true;error.value='';message.value='';
  try {
    const response=body===undefined?await axios.get('/api/owner/direct-payments',{headers:headers(),timeout:30000}):await axios.post('/api/owner/direct-payments/'+action,body,{headers:headers()});
    connection.value=response.data.direct;
    if(response.data.history)history.value=response.data.history;
    label.value=connection.value.label;
    if(action)message.value=action==='disconnect'?'New online payments are now stopped. Existing payment verification is retained.':'Connection checked. Review the status below.';
  }catch(e){
    error.value=e.response?.data?.message||'Payment settings could not be updated. Please try again.';
    // A failed provider check may have paused the server-side connection.
    // Reload its status so a previous ready badge cannot conceal that change.
    if(action){
      try{
        const response=await axios.get('/api/owner/direct-payments',{headers:headers(),timeout:10000});
        connection.value=response.data.direct;
        if(response.data.history)history.value=response.data.history;
      }catch{connection.value=null;}
    }
  }
  finally{secretKey.value='';busy.value=false;}
}
function connect(){const value=secretKey.value;secretKey.value='';return request('connect',{secretKey:value,label:label.value,authorized:authorized.value,allowWebhook:allowWebhook.value});}
onMounted(()=>request());onBeforeUnmount(()=>{secretKey.value='';});
</script>
<template>
  <section class="direct-payments" aria-labelledby="direct-heading">
    <div class="connection-heading"><span class="connection-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/></svg></span><div><span class="section-kicker">YOUR MERCHANT ACCOUNT</span><h2 id="direct-heading">Connect your own PayMongo account</h2></div></div>
    <p>Student checkout payments are created using your merchant account. PayMongo receives the payment for that account and controls fees, payout schedules, verification, and available payment methods. One connection covers all properties under your owner login.</p>
    <p v-if="!connection && !error" role="status">Loading payment settings…</p>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p><p v-if="message" class="notice" role="status">{{ message }}</p>
    <button v-if="!connection && !busy" type="button" @click="request()">Retry</button>
    <template v-if="connection">
      <div :class="['status-row', 'status-'+connection.status]">
        <span class="status-icon" aria-hidden="true">
          <svg v-if="connection.status==='ready'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>
          <svg v-else-if="connection.status==='attention'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 8v5M12 16.5v.5"/><path d="M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v4.5l3 2"/></svg>
        </span>
        <div class="status-text"><span class="status-caption">CONNECTION STATUS</span><strong>{{ labels[connection.status] || 'Check connection' }}</strong>
          <span class="status-sub">{{ connection.status==='ready' ? 'Students can pay your properties online with QR Ph.' : connection.status==='attention' ? 'New online payments are paused. Cash bookings still work.' : connection.status==='disconnected' ? 'New online payments are off. Cash bookings still work.' : 'Connect your PayMongo account to accept online payments.' }}</span>
        </div>
        <span :class="['mode-badge', connection.mode==='live' ? 'is-live' : 'is-test']">{{ connection.mode === 'live' ? 'LIVE • Real money' : 'TEST • No real money' }}</span>
      </div>
      <p v-if="!connection.setupAvailable" class="notice">The administrator must enable secure owner payments on this environment first. You can continue accepting cash bookings. Do not send your key to the administrator in chat or email.</p>
      <dl v-if="connection.lastFour" class="account-summary">
        <div><dt>Merchant label</dt><dd>{{ connection.label }}</dd><small>Your own reminder; not verified by PayMongo</small></div>
        <div><dt>Saved secret key</dt><dd class="mono">•••• {{ connection.lastFour }}</dd><small>Encrypted; only the last four characters are shown</small></div>
        <div><dt>Last checked</dt><dd>{{ connection.checkedAt ? new Date(connection.checkedAt).toLocaleString('en-PH') : 'Not yet' }}</dd><small>Rechecked about every 10 minutes and before each checkout</small></div>
      </dl>
      <p v-if="connection.status==='ready'" class="notice">QR Ph and the payment webhook passed the latest check. Before accepting live bookings, confirm the receiving merchant in your PayMongo dashboard with an authorized small payment. This check does not prove bank settlement or guarantee future availability.</p>
      <p v-if="connection.status==='attention'" class="notice warn">PayMongo access or payment confirmation could not be verified. Check your account and webhook in PayMongo, then check here again. If your key was replaced, reconnect using the new key from the same merchant. Do not ask a student to pay twice.</p>
      <component :is="connection.lastFour ? 'details' : 'div'" :class="connection.lastFour ? 'payment-help' : 'steps-block'">
      <summary v-if="connection.lastFour">How setup works</summary>
      <h3 v-else class="steps-heading">Get started in three steps</h3>
      <ol class="setup-steps">
        <li><strong>Prepare your merchant account.</strong> Sign in to your own PayMongo dashboard and complete its requirements. QR Ph must be active. Direct GCash checkout is not included; students may scan QR Ph using a supported bank or wallet app.</li>
        <li><strong>Copy your secret API key privately.</strong> Find API keys in PayMongo’s developer settings. Use a {{ connection.mode }} secret key beginning with <code>sk_{{ connection.mode }}_</code>, not a public key. Never share your PayMongo password.</li>
        <li><strong>Connect and verify.</strong> The system checks QR Ph and registers a payment-confirmation webhook in your merchant account. A webhook is PayMongo’s automatic payment notice to this system.</li>
      </ol>
      </component>
      <form @submit.prevent="connect" class="connection-form"><div class="form-heading"><span class="form-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg></span><div><h3>{{ connection.lastFour ? 'Manage your connection' : 'Add your merchant details' }}</h3><p>Use the account that should receive your booking payments.</p></div></div>
        <label for="direct-merchant-label">Merchant label (your reminder)</label>
        <input id="direct-merchant-label" v-model="label" maxlength="120" required :disabled="busy || !connection.setupAvailable" placeholder="e.g. My boarding house" autocomplete="off" />
        <label for="direct-secret">{{ connection.lastFour ? 'Reconnect or replace secret key' : 'PayMongo secret key' }}</label>
        <input id="direct-secret" v-model="secretKey" type="password" maxlength="256" required :disabled="busy || !connection.setupAvailable" autocomplete="new-password" autocapitalize="none" :spellcheck="false" aria-describedby="key-security" />
        <p id="key-security" class="small">The field clears after submission. The server encrypts saved keys with authenticated encryption and only returns the last four characters. Keys are never stored in browser storage. This does not remove the responsibility of authorized server operators to protect the server and encryption key.</p>
        <p class="notice key-permissions"><strong>Understand the access you are granting</strong><br />A merchant secret key can grant broad API access. This connection does not make the key narrowly scoped. This app uses it for its booking checkouts and payment webhooks; it does not provide payout, transfer, or refund controls. Only connect an account you are authorized to manage.</p>
        <label class="check"><input v-model="authorized" type="checkbox" required :disabled="busy || !connection.setupAvailable" /><span>I own or am authorized to manage this merchant account and authorize this system to store its encrypted secret key and process its booking payments.</span></label>
        <label class="check"><input v-model="allowWebhook" type="checkbox" required :disabled="busy || !connection.setupAvailable" /><span>I authorize this system to create and check its payment-confirmation webhook in this account.</span></label>
        <button class="connect-button" type="submit" :disabled="busy || !connection.setupAvailable || !authorized || !allowWebhook || !secretKey.trim()">{{ busy ? 'Working…' : 'Connect and verify' }} <span v-if="!busy" aria-hidden="true">&rarr;</span></button><p class="submit-note">Encrypted storage &middot; Only the last four characters are shown after saving</p>
      </form>
      <div class="actions"><a href="https://dashboard.paymongo.com" target="_blank" rel="noopener noreferrer">Open PayMongo dashboard ↗</a><button v-if="connection.lastFour && connection.status!=='disconnected'" type="button" :disabled="busy || !connection.setupAvailable" @click="request('check',{})">Check connection</button></div>
      <details class="payment-help"><summary>Connection help, fees & disconnection</summary>
        <p>Replace a key using a new key from the same merchant account. The system verifies access to the previous webhook before accepting a replacement, so existing checkouts retain their recipient. A different receiving merchant requires administrator review; entering a different label does not change the recipient.</p>
        <p>Disconnect stops new online payments. Encrypted credentials and webhook verification are retained to finish existing checkouts and investigate payments. Disconnect does not revoke your key or delete your PayMongo webhook. Revoking the key or disabling the webhook in PayMongo can prevent confirmation of payments already started. Coordinate with the administrator before doing either.</p>
        <p>PayMongo fees and account requirements still apply. Refund eligibility and fees depend on PayMongo and your agreement with the student; refunds are handled outside this app through the owner’s PayMongo account. A successful payment does not mean a bank payout has completed.</p>
        <div v-if="connection.lastFour && connection.status!=='disconnected'">
          <label class="check"><input v-model="disconnectConfirmed" type="checkbox" :disabled="busy" /><span>I understand that new online payments will stop and existing payment verification will be retained.</span></label>
          <button class="danger" type="button" :disabled="busy || !connection.setupAvailable || !disconnectConfirmed" @click="request('disconnect',{confirm:true})">Disconnect new online payments</button>
        </div>
      </details>
      <details class="payment-help" v-if="history.length"><summary>Recent payment-setting activity</summary><ul><li v-for="(event,index) in history" :key="index">{{ actions[event.action] || 'Settings updated' }} — {{ new Date(event.created_at).toLocaleString('en-PH') }}</li></ul></details>
    </template>
  </section>
</template>
<style scoped>
.direct-payments{background:#fff;border:1px solid #e0e8f0;border-radius:20px;margin:24px 0;color:#42526a;box-shadow:0 6px 24px #18395706;overflow:hidden;padding:30px}
.connection-heading{display:flex;gap:16px;align-items:center;margin-bottom:16px}.connection-icon,.form-icon{display:grid;place-items:center;flex-shrink:0;width:52px;height:52px;border-radius:15px;background:#edf4ff;color:#2463d9}.connection-icon svg{width:29px;height:29px}.section-kicker,.status-caption{display:block;font-size:10px;letter-spacing:.12em;font-weight:750;color:#64748b;margin-bottom:5px}.direct-payments h2{font-size:22px;letter-spacing:-.025em;color:#153454;font-weight:750;line-height:1.3;margin:0}.direct-payments h3{font-size:16px;font-weight:700;color:#183957;margin:0}.direct-payments p,.direct-payments li{font-size:13px;line-height:1.8;margin:12px 0;overflow-wrap:anywhere}.direct-payments>p:first-of-type{max-width:850px;color:#627389}
.status-row{display:flex;justify-content:space-between;gap:16px;align-items:center;margin:24px 0;padding:18px 20px;background:#f8fafc;border:1px solid #e5ebf2;border-radius:13px}.status-row strong{display:flex;align-items:center;gap:8px;color:#42526a;font-size:14px}.status-row i{width:8px;height:8px;border-radius:50%;background:#94a3b8}.status-ready{background:#f0fdf7;border-color:#c6eedc}.status-ready i{background:#059669}.status-ready strong{color:#047857}.status-attention{background:#fff9ee;border-color:#f7ddb0}.status-attention i{background:#d97706}.mode-badge{font-size:10px;font-weight:750;letter-spacing:.03em;background:white;border:1px solid #dce4ee;padding:6px 10px;border-radius:7px;white-space:nowrap}.notice{padding:15px 18px;background:#eff6ff;border:1px solid #dbeafe;border-radius:11px;color:#34577e}.error{background:#fff1f2;border-color:#fecdd3;color:#9f1239}.steps-heading{margin:30px 0 16px!important}.setup-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;list-style:none;counter-reset:steps;padding:0;margin:0 0 28px}.setup-steps li{counter-increment:steps;position:relative;background:#f8fafc;border:1px solid #e8edf4;border-radius:12px;margin:0;padding:48px 16px 16px;font-size:12px;line-height:1.75}.setup-steps li::before{content:counter(steps,decimal-leading-zero);position:absolute;top:15px;left:16px;color:#2563eb;font-size:12px;letter-spacing:.05em;font-weight:800}.setup-steps strong{display:block;color:#24415f;font-size:13px;margin-bottom:6px}.setup-steps code{background:#e8eef6;padding:2px 4px;border-radius:4px;font-size:11px}
.connection-form{padding:26px;border:1px solid #dfe7f1;border-radius:15px;background:linear-gradient(145deg,#fff,#fafcff)}.form-heading{display:flex;gap:13px;align-items:center;margin-bottom:22px}.form-icon{width:42px;height:42px;border-radius:12px;background:#eaf1fc}.form-icon svg{width:22px;height:22px}.form-heading p{margin:3px 0 0;font-size:12px}.direct-payments form>label{display:block;margin-top:18px;font-weight:650;font-size:12px;color:#344c66}.direct-payments input:not([type=checkbox]){display:block;width:100%;min-height:48px;border:1px solid #cbd7e5;background:white;padding:12px 14px;border-radius:9px;margin-top:8px;font-size:16px;transition:border-color .15s,box-shadow .15s}.direct-payments input:not([type=checkbox]):focus{border-color:#4b83ed;box-shadow:0 0 0 3px #2563eb12}.direct-payments input:disabled{background:#f5f7fa;color:#64748b}.direct-payments form>.check,.check{display:flex;align-items:flex-start;gap:12px;font-weight:400;line-height:1.65;margin:16px 0;color:#52637a;font-size:12px}.check input{width:18px;height:18px;accent-color:#2563eb;flex-shrink:0;margin-top:3px}.small{font-size:11px!important;color:#718198}.key-permissions{background:#f6f8fc;border-color:#e6ebf3;font-size:12px!important;margin:20px 0!important}.key-permissions strong{color:#35516d}.direct-payments button{min-height:44px;padding:11px 18px;border-radius:9px;background:#245bdb;color:#fff;font-weight:650;font-size:13px;margin-top:12px;transition:background .15s}.direct-payments button:hover:enabled{background:#174ac4}.direct-payments button:disabled{opacity:.5;cursor:not-allowed}.direct-payments .connect-button{display:flex;align-items:center;justify-content:center;gap:22px;box-shadow:0 4px 10px #2563eb17}.connect-button span{font-size:18px}.submit-note{font-size:10px!important;color:#7b8a9d;margin-bottom:0!important}.direct-payments .danger{background:#b91c1c}.direct-payments a{color:#245bdb;text-decoration:none;font-weight:600;font-size:12px}.direct-payments a:hover{text-decoration:underline}.actions{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between;padding:18px 0 6px}.actions button{background:#edf3fe;color:#245bdb;margin:0}.direct-payments details{border:1px solid #e5ebf3;border-radius:12px;margin-top:16px;padding:0 18px;background:#fff}.direct-payments summary{cursor:pointer;min-height:52px;align-content:center;font-weight:650;font-size:12px;color:#3d5672;padding:14px 0}.direct-payments details p{font-size:12px;color:#627389}.direct-payments details[open]{padding-bottom:14px}.direct-payments :is(button,input,a,summary):focus-visible{outline:3px solid #60a5fa;outline-offset:3px}
/* Readability: near-black body text, larger sizes and clearer status and account summary */
.direct-payments{color:#1e293b}.direct-payments p,.direct-payments li{font-size:14px;color:#1e293b}.direct-payments>p:first-of-type{color:#334155;font-size:14.5px}
.direct-payments h2{color:#0f172a;font-size:24px}.direct-payments h3{color:#0f172a;font-size:17px}.section-kicker,.status-caption{color:#475569;font-size:11px}
.status-row{display:grid;grid-template-columns:auto 1fr auto;padding:20px 22px;gap:16px}.status-icon{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:#e2e8f0;color:#334155}.status-icon svg{width:24px;height:24px}
.status-text strong{font-size:18px;color:#0f172a}.status-sub{display:block;margin-top:3px;font-size:13.5px;color:#334155}
.status-ready .status-icon{background:#059669;color:#fff}.status-ready .status-text strong{color:#065f46}.status-attention .status-icon{background:#d97706;color:#fff}.status-attention .status-text strong{color:#92400e}.status-disconnected .status-icon{background:#64748b;color:#fff}
.mode-badge{font-size:11px;padding:7px 11px;color:#0f172a}.mode-badge.is-live{background:#065f46;border-color:#065f46;color:#fff}.mode-badge.is-test{background:#fef3c7;border-color:#fcd34d;color:#78350f}
.account-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 18px}.account-summary>div{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;min-width:0}
.account-summary dt{font-size:11px;font-weight:750;letter-spacing:.06em;text-transform:uppercase;color:#475569}.account-summary dd{margin:4px 0 2px;font-size:16px;font-weight:700;color:#0f172a;overflow-wrap:anywhere}.account-summary dd.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.04em}.account-summary small{display:block;font-size:12px;color:#475569;line-height:1.5}
.notice{color:#1e3a8a;font-size:14px}.notice.warn{background:#fffbeb;border-color:#fde68a;color:#78350f}.error{color:#9f1239}
.setup-steps li{font-size:13.5px;color:#1e293b}.setup-steps strong{color:#0f172a;font-size:14.5px}.steps-block{margin-top:6px}
.direct-payments form>label{font-size:13.5px;color:#0f172a}.form-heading p{font-size:13px;color:#334155}.direct-payments form>.check,.check{font-size:13.5px;color:#1e293b}.small{font-size:12.5px!important;color:#475569}.key-permissions{font-size:13.5px!important;color:#1e293b}.key-permissions strong{color:#0f172a}.submit-note{font-size:12px!important;color:#475569}
.direct-payments button{font-size:14px}.direct-payments a{font-size:13.5px}.direct-payments summary{font-size:14px;color:#0f172a}.direct-payments details p,.direct-payments details li{font-size:13.5px;color:#1e293b}
@media(max-width:900px){.account-summary{grid-template-columns:1fr}}
@media(max-width:639px){.status-row{grid-template-columns:auto 1fr}.status-row .mode-badge{grid-column:1 / -1;justify-self:start}.direct-payments h2{font-size:20px}}
@media(max-width:900px){.setup-steps{grid-template-columns:1fr}.setup-steps li{padding:16px 16px 16px 53px}.setup-steps li::before{left:16px;top:18px}}
@media(max-width:639px){.direct-payments{padding:20px 16px;border-radius:16px}.connection-heading{gap:12px;align-items:flex-start}.connection-icon{width:42px;height:42px;border-radius:12px}.connection-icon svg{width:24px;height:24px}.direct-payments h2{font-size:19px}.section-kicker{font-size:9px}.status-row{padding:15px;align-items:flex-start;flex-direction:column;gap:12px}.connection-form{padding:18px 14px}.form-heading{align-items:flex-start}.direct-payments button{width:100%}.actions{align-items:stretch;flex-direction:column}.direct-payments p{font-size:12px}.submit-note{text-align:center}.direct-payments details{padding-left:14px;padding-right:14px}}
</style>
