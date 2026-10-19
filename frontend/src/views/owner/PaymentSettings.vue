<script setup>
import { computed, onMounted, ref } from 'vue';
import axios from 'axios';
import OwnerDirectPaymentSetup from '../../components/OwnerDirectPaymentSetup.vue';
import OwnerNav from '../../components/partials/OwnerNav.vue';
const connection = ref(null), loading = ref(true), busy = ref(false), error = ref('');
let user = {}; try { user = JSON.parse(sessionStorage.getItem('cspc_user') || '{}'); } catch {}
const email = ref(user.email || ''), authorized = ref(false);
const headers = () => ({Authorization: 'Bearer ' + sessionStorage.getItem('cspc_token')});
const labels = {not_started:'Not connected',pending:'Finish setup in PayMongo',verification_pending:'Verification in progress',ready:'Ready to accept QR Ph',attention:'Connection needs attention',declined:'Invitation declined',cancelled:'Invitation cancelled'};
const status = computed(() => connection.value?.status || 'not_started');
const statusLabel = computed(() => labels[status.value] || 'Check your connection');
async function request(path = '', body) {
  error.value = ''; busy.value = true;
  try {
    const response = body === undefined ? await axios.get('/api/owner/payment-setup', {headers:headers()}) : await axios.post('/api/owner/payment-setup/' + path, body, {headers:headers()});
    connection.value = response.data.connection;
    if (connection.value.email) email.value = connection.value.email;
  } catch (e) { error.value = e.response?.data?.message || 'Unable to load payment setup. Please try again.'; }
  finally { busy.value = false; loading.value = false; }
}
onMounted(() => request());
</script>
<template>
  <div class="management-page owner-page"><OwnerNav />
    <main id="management-content" class="management-content payment-settings">
      <header class="payments-hero"><div><p class="eyebrow">PAYMENT SETTINGS</p><h1>Online payments</h1><p>A simple way for students to pay, directly to your merchant account.</p></div><span class="hero-tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></svg> Your account. Your payments.</span></header>
      <OwnerDirectPaymentSetup />
      <details class="invitation-alternative"><summary>Other connection options <span>PayMongo invitation &middot; Requires platform eligibility</span></summary>
      <p v-if="loading" role="status">Loading payment setup…</p>
      <p v-if="error" class="payment-error" role="alert">{{ error }}</p>
      <template v-if="!loading && connection">
        <section class="payment-card" aria-labelledby="payment-status">
          <div class="payment-status-row"><h2 id="payment-status">Payment connection</h2><span :class="['payment-state',{ready:status === 'ready'}]">{{ statusLabel }}</span></div>
          <p v-if="connection.mode === 'test'" class="payment-test"><strong>Test environment.</strong> Payments here do not move real money. A live connection must be set up separately.</p>
          <p v-if="!connection.setupAvailable">Online payment setup is not available yet. Please contact the system administrator. You can continue accepting cash bookings.</p>
          <form v-else-if="status === 'not_started'" @submit.prevent="request('start', {email,confirmAccountOwnership:authorized})">
            <ol class="payment-steps"><li><strong>Use your merchant email</strong><span>Enter the email you will use for your PayMongo account.</span></li><li><strong>Complete PayMongo verification</strong><span>PayMongo handles your identity and business details on its own website.</span></li><li><strong>Return and check your connection</strong><span>Online booking payments become available after verification and payment confirmation are ready.</span></li></ol>
            <label for="merchant-email">PayMongo email</label><input id="merchant-email" v-model="email" type="email" autocomplete="email" maxlength="254" required />
            <label class="payment-consent"><input v-model="authorized" type="checkbox" required /><span>I own or am authorized to manage this merchant account. I understand this email will be shared with PayMongo to start the connection.</span></label>
            <p class="payment-permissions">You will review the connection in PayMongo. The app requests permission to create and read its booking payments and manage payment webhooks. Webhooks may include other activity on your PayMongo account. It does not request transfers, payouts, wallet access, or refunds.</p>
            <button class="management-button" type="submit" :disabled="busy || !authorized">{{ busy ? 'Starting setup…' : 'Start payment setup' }}</button>
          </form>
          <div v-else>
            <p><strong>Merchant email:</strong> {{ connection.email }}</p>
            <p v-if="status === 'ready'">Students can choose QR Ph online payment for your properties. Payments are processed under your connected merchant account; PayMongo controls fees, settlement, and withdrawals.</p>
            <p v-else-if="status === 'pending'">Continue in PayMongo using the exact email above. Complete the invitation and any verification steps, then return here.</p>
            <p v-else-if="status === 'verification_pending'">Your account is linked, but QR Ph or account verification is not ready. Finish any steps shown in PayMongo, then check again.</p>
            <p v-else>Open PayMongo to review your invitation or account status. If it was declined or cancelled, contact the administrator before starting another connection.</p>
            <div class="payment-actions"><a v-if="connection.continueUrl" :href="connection.continueUrl" target="_blank" rel="noopener noreferrer" class="management-button">Continue in PayMongo ↗</a><a v-else href="https://dashboard.paymongo.com" target="_blank" rel="noopener noreferrer">Open PayMongo ↗</a><button type="button" class="management-button" :disabled="busy || !connection.setupAvailable" @click="request('refresh', {})">{{ busy ? 'Checking…' : 'Check connection' }}</button></div>
            <p v-if="connection.checkedAt" class="payment-small">Last checked: {{ new Date(connection.checkedAt).toLocaleString('en-PH') }}</p>
          </div>
        </section>
        <section class="payment-card"><h2>Already have a PayMongo account?</h2><p>Use that account’s email. Review any linking request in PayMongo under Settings → Invitations. If PayMongo cannot link an existing account, contact the administrator; do not create duplicate accounts. Use the secure direct connection form above only if you choose the API-key method.</p><h2>What students will use</h2><p>QR Ph lets students scan the checkout QR code with a supported banking or e-wallet app, including GCash. Availability depends on your PayMongo account.</p><p>Keep your PayMongo password and API keys private. The invitation method does not require entering a key. Cash bookings remain available while setup is pending.</p></section>
      </template>
      <button v-if="!loading && !connection" type="button" class="management-button" @click="request()">Try again</button>
      </details>
    </main>
  </div>
</template>
<style scoped>
.payment-settings{max-width:1000px;margin:0 auto;padding:28px 24px 48px}.payment-settings header{margin-bottom:24px}.eyebrow{font-size:12px;color:#64748b}.payment-settings h1{font-size:28px;font-weight:750;color:#102e50}.payment-settings h2{font-size:18px;font-weight:700;margin:0 0 12px}.payment-settings p{font-size:14px;line-height:1.75;color:#475569;overflow-wrap:anywhere;margin:10px 0}.payment-card{padding:24px;background:white;border:1px solid #dfe7f1;border-radius:16px;margin:18px 0}.payment-status-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.payment-state{padding:7px 12px;border-radius:999px;background:#fff7e7;color:#92400e;font-size:12px;font-weight:700}.payment-state.ready{background:#ecfdf5;color:#047857}.payment-steps{display:grid;gap:16px;padding-left:22px;margin:24px 0}.payment-steps li{font-size:14px;padding-left:5px}.payment-steps span{display:block;color:#64748b;line-height:1.6;margin-top:4px}.payment-settings form>label{display:block;font-size:14px;font-weight:600}.payment-settings input[type=email]{width:100%;max-width:480px;border:1px solid #cbd5e1;border-radius:10px;padding:12px;margin:8px 0 18px;font-size:16px}.payment-settings form>.payment-consent{display:flex;gap:12px;align-items:flex-start;font-weight:400;line-height:1.6}.payment-consent input{width:20px;height:20px;flex-shrink:0;margin-top:3px}.payment-permissions,.payment-small{font-size:12px!important}.payment-actions{display:flex;flex-wrap:wrap;align-items:center;gap:16px;margin:20px 0}.payment-actions a{color:#2563eb}.payment-actions a.management-button{color:white}.payment-test,.payment-error{padding:12px 16px;border-radius:10px;background:#eff6ff}.payment-error{background:#fef2f2;color:#991b1b!important}.payment-settings .management-button{min-height:44px}.payment-settings a:focus-visible,.payment-settings button:focus-visible{outline:3px solid #93c5fd;outline-offset:3px}@media(max-width:639px){.payment-settings{padding:22px 14px 36px}.payment-card{padding:18px}.payment-actions>*{width:100%;text-align:center;justify-content:center}}
.payments-hero{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:8px 0 4px}.payment-settings{max-width:1180px}.payment-settings .eyebrow{font-size:10px;letter-spacing:.14em;font-weight:750;color:#74879f;margin-bottom:6px}.payment-settings h1{font-size:32px;letter-spacing:-.035em}.hero-tag{display:flex;align-items:center;gap:8px;background:#edf4ff;border:1px solid #dce8fa;color:#41658d;font-size:11px;font-weight:650;padding:10px 13px;border-radius:10px;white-space:nowrap}.hero-tag svg{width:17px;height:17px}.invitation-alternative{background:#fff;border:1px solid #e0e8f0;border-radius:13px;padding:0 22px;margin-top:20px}.invitation-alternative>summary{font-size:13px;color:#36516d;font-weight:650;cursor:pointer;padding:18px 0;min-height:54px}.invitation-alternative>summary span{font-size:11px;font-weight:400;color:#7b8ba0;margin-left:12px}.invitation-alternative .payment-card{box-shadow:none}@media(max-width:900px){.hero-tag{display:none}}@media(max-width:639px){.payments-hero{padding:0}.payment-settings h1{font-size:28px}.invitation-alternative{padding:0 16px}.invitation-alternative>summary span{display:block;margin:6px 0 0 17px}}
</style>
