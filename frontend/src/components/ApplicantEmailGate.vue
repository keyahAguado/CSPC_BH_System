<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { setApplicantToken, rememberedDevice, saveRememberedDevice, forgetRememberedDevice, takeFreshVerificationFlag } from '../utils/applicantSession.js';
const route = useRoute();
const router = useRouter();
const email = ref('');
const requestedEmail = ref('');
const busy = ref(false);
const message = ref('');
const error = ref('');
const cooldown = ref(false);
const waiting = ref(false);
// After a while without verification, explain the existing-account case (shown to everyone,
// so the page never reveals whether an email is registered)
const waitingLong = ref(false);
const LONG_WAIT_MS = 45000;
let timer;
let poller;
let longWaitTimer;
// Opt-in "Remember this device for 7 days" (off by default)
const remember = ref(false);
let rememberChoice = false;
const resuming = ref(false);

// The link can be opened on any device (e.g. a phone). This tab keeps checking and continues
// by itself once the email is verified; the request survives a page reload for 30 minutes.
const PENDING_KEY = 'cspc_applicant_pending_request';
const savePending = (value) => { try { value ? sessionStorage.setItem(PENDING_KEY, JSON.stringify(value)) : sessionStorage.removeItem(PENDING_KEY); } catch { /* storage unavailable: polling still runs in this tab */ } };
const readPending = () => { try { return JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null'); } catch { return null; } };
const stopWaiting = () => { clearInterval(poller); poller = null; clearTimeout(longWaitTimer); longWaitTimer = null; waiting.value = false; waitingLong.value = false; };
// One check at a time, and only for the current request: on a slow connection a second check
// could otherwise find the request already completed by the first and wrongly report "expired".
let checking = false;
let activeRequestId = '';
const checkStatus = async (requestId) => {
  if (checking || requestId !== activeRequestId) return;
  checking = true;
  try {
    const { data } = await axios.post('/api/applications/email/status', { requestId, remember: rememberChoice });
    if (requestId !== activeRequestId) return;
    if (data.verified && data.token) {
      activeRequestId = '';
      stopWaiting(); savePending(null);
      if (data.deviceToken) saveRememberedDevice(data.deviceToken, data.deviceExpiresAt);
      setApplicantToken(data.token);
      if (data.hasApplications && route.path !== '/track') router.replace('/track');
    } else if (data.expired) {
      activeRequestId = '';
      stopWaiting(); savePending(null);
      message.value = '';
      error.value = data.reason === 'claimed'
        ? 'This verification was already completed, possibly in another tab or window. Continue there, or send a new link.'
        : 'This verification link expired (links last 30 minutes). Send a new link.';
    }
  } catch (err) {
    if (requestId !== activeRequestId) return;
    if (err.response?.status === 409 || err.response?.status === 400) {
      activeRequestId = '';
      stopWaiting(); savePending(null); message.value = '';
      error.value = err.response?.data?.message || 'Send a new verification link.';
    }
    // Network blips and rate limits: keep waiting and try again on the next tick.
  } finally {
    checking = false;
  }
};
const startWaiting = (requestId, sinceMs = 0) => {
  stopWaiting();
  activeRequestId = requestId;
  waiting.value = true;
  poller = setInterval(() => checkStatus(requestId), 3000);
  longWaitTimer = setTimeout(() => { if (waiting.value) waitingLong.value = true; }, Math.max(0, LONG_WAIT_MS - sinceMs));
};
// Lets the applicant abandon a pending request (wrong address, or an email that already has an account)
const startOver = () => {
  activeRequestId = '';
  stopWaiting(); savePending(null);
  clearTimeout(timer); cooldown.value = false;
  message.value = ''; error.value = ''; requestedEmail.value = '';
};
// A remembered device continues without a new email link (unless an action asked for fresh verification)
const resumeRememberedDevice = async () => {
  const device = rememberedDevice();
  if (!device) return false;
  resuming.value = true;
  try {
    const { data } = await axios.post('/api/applications/session/resume', { deviceToken: device.token });
    setApplicantToken(data.token);
    if (data.hasApplications && route.path !== '/track') router.replace('/track');
    return true;
  } catch (err) {
    if (err.response?.status === 401) forgetRememberedDevice();
    return false;
  } finally {
    resuming.value = false;
  }
};
onMounted(async () => {
  if (!takeFreshVerificationFlag() && await resumeRememberedDevice()) return;
  const pending = readPending();
  if (pending?.requestId && pending.until > Date.now()) {
    rememberChoice = pending.remember === true; remember.value = rememberChoice;
    requestedEmail.value = pending.email; email.value = pending.email;
    message.value = 'A verification link was sent.';
    // Restored after a reload: count the time already spent waiting
    startWaiting(pending.requestId, pending.since ? Date.now() - pending.since : 0);
    checkStatus(pending.requestId);
  } else savePending(null);
});
onUnmounted(() => { clearTimeout(timer); stopWaiting(); });
const request = async () => {
  error.value = ''; message.value = '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { error.value = 'Enter a valid personal email address.'; return; }
  busy.value = true;
  try {
    const { data } = await axios.post('/api/applications/email/request', { email: email.value.trim() });
    requestedEmail.value = email.value.trim();
    message.value = data.message;
    cooldown.value = true;
    timer = setTimeout(() => { cooldown.value = false; }, 60000);
    if (data.requestId) {
      rememberChoice = remember.value;
      savePending({ requestId: data.requestId, email: requestedEmail.value, remember: rememberChoice, since: Date.now(), until: Date.now() + 30 * 60 * 1000 });
      startWaiting(data.requestId);
    }
  } catch (err) { error.value = err.response?.data?.message || 'We could not request verification. Check your connection and try again.'; }
  finally { busy.value = false; }
};
</script>

<template>
  <section class="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 max-w-lg mx-auto my-6 text-left text-[#243449]" aria-labelledby="applicant-email-gate-title">
    <h2 id="applicant-email-gate-title" class="text-lg font-semibold leading-snug text-[#142b4a]">Verify your email</h2>
    <p class="text-sm leading-relaxed text-slate-600 mt-2">Verify your personal email before submitting or accessing an application. A reference number identifies your application but does not unlock it.</p>
    <form @submit.prevent="request" class="space-y-4 mt-5" novalidate>
      <div>
        <label for="applicant-email" class="block text-sm font-medium text-slate-800 mb-1.5">Personal email address</label>
        <input id="applicant-email" v-model="email" type="email" autocomplete="email" maxlength="255" required class="gate-input" :disabled="busy" :aria-describedby="error ? 'applicant-email-error' : undefined" />
      </div>
      <p v-if="error" id="applicant-email-error" role="alert" class="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5 gate-wrap">{{ error }}</p>
      <div v-if="message" role="status" class="text-sm leading-relaxed text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 space-y-1.5">
        <p class="gate-wrap">{{ message }} Check the inbox and spam folder for <span class="font-semibold">{{ requestedEmail }}</span>.</p>
        <p>Open the link on this device or on your phone and tap <span class="font-semibold">Verify my email</span>. This page continues automatically once your email is verified.</p>
        <p v-if="waiting" class="flex items-center gap-2 font-medium"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Waiting for verification…</p>
        <p class="text-emerald-800">The link expires in 30 minutes. Email verification does not approve your property or create an active owner login.</p>
        <button v-if="waiting" type="button" @click="startOver" class="gate-focus rounded font-medium text-[#245b99] hover:text-[#142b4a] underline underline-offset-2">Use a different email</button>
      </div>
      <div v-if="waitingLong" role="status" class="text-sm leading-relaxed text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-2">
        <p class="font-semibold">No verification link in your inbox?</p>
        <p>If this email already has a CSPC BH Finder account, we sent <span class="font-semibold">sign-in instructions</span> instead of a link. Sign in, then use <span class="font-semibold">Register a property</span> on your owner dashboard. Also check your spam folder.</p>
        <div class="flex flex-wrap gap-x-5 gap-y-2 pt-1">
          <router-link to="/login" class="gate-focus rounded font-semibold text-[#245b99] hover:text-[#142b4a] underline underline-offset-2">Sign in</router-link>
          <button type="button" @click="startOver" class="gate-focus rounded font-medium text-[#245b99] hover:text-[#142b4a] underline underline-offset-2">Use a different email</button>
        </div>
      </div>
      <label v-if="!waiting" class="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer">
        <input v-model="remember" type="checkbox" :disabled="busy" class="mt-0.5 w-4 h-4 shrink-0 accent-[#1e4a8d]" />
        <span>Remember this device for 7 days
          <span class="block text-[13px] text-slate-500">Skip email verification on this device next time. Do not use on shared or public computers.</span>
        </span>
      </label>
      <button :disabled="busy || cooldown" class="gate-focus w-full min-h-[44px] bg-[#1e4a8d] hover:bg-[#163870] text-white text-sm font-semibold rounded-lg px-4 py-3 disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed">{{ busy ? 'Requesting…' : cooldown ? 'Wait a minute before resending' : 'Send verification link' }}</button>
    </form>
    <p v-if="resuming" role="status" class="mt-4 text-sm text-slate-600 flex items-center gap-2"><i class="fa-solid fa-spinner fa-spin text-[#245b99]" aria-hidden="true"></i> Signing you in on this remembered device…</p>
    <p class="text-sm text-slate-600 mt-5 pt-4 border-t border-slate-100">Already have an activated account? <router-link to="/login" class="gate-focus rounded font-medium text-[#245b99] hover:text-[#142b4a] underline underline-offset-2">Sign in</router-link>.</p>
  </section>
</template>

<style scoped>
.gate-input { width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; color: #0f172a; font-size: 15px; transition: border-color .15s, box-shadow .15s; }
.gate-input:focus { outline: none; border-color: #245b99; box-shadow: 0 0 0 3px #bcd5f2; }
.gate-input:disabled { background: #f8fafc; color: #64748b; }
.gate-focus:focus-visible { outline: 3px solid #5e99db; outline-offset: 2px; }
.gate-wrap { overflow-wrap: anywhere; }
</style>
