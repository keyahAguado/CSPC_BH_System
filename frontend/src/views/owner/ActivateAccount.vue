<script setup>
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import { clearApplicantToken, verifiedApplicantEmail } from '../../utils/applicantSession.js';

const route = useRoute();
const token = typeof route.query.token === 'string' ? route.query.token : '';

const email = ref((() => {
  try { return verifiedApplicantEmail() || sessionStorage.getItem('cspc_activation_email') || ''; } catch { return ''; }
})());
const password = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const isSaving = ref(false);
const errorMsg = ref('');
const activatedEmail = ref('');

const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim()));
const rules = computed(() => [
  { ok: password.value.length >= 8, text: 'At least 8 characters' },
  { ok: /[A-Za-z]/.test(password.value) && /\d/.test(password.value), text: 'Letters and numbers' },
  { ok: password.value.length > 0 && password.value === confirmPassword.value, text: 'Passwords match' }
]);

const activate = async () => {
  errorMsg.value = '';
  if (!emailValid.value) {
    errorMsg.value = 'Return to Track My Application and select Activate owner account to restore your verified email.';
    return;
  }
  if (!rules.value.every(r => r.ok)) {
    errorMsg.value = 'Please choose a password that meets all the requirements.';
    return;
  }
  isSaving.value = true;
  try {
    const { data } = await axios.post('/api/auth/activate', { token, email: email.value.trim(), password: password.value });
    activatedEmail.value = data.email || email.value.trim();
    password.value = '';
    confirmPassword.value = '';
    clearApplicantToken();
    try { sessionStorage.removeItem('cspc_activation_email'); } catch { /* storage unavailable */ }
  } catch (err) {
    errorMsg.value = err.response?.data?.message || 'We could not activate your account. Please try again.';
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-[#f4f7fb] font-sans text-[#243449] flex items-start sm:items-center justify-center px-4 py-10">
    <main class="activate-card w-full max-w-md">
      <router-link to="/" class="activate-focus activate-head">
        <span class="activate-logo"><img src="/img/CSPC_logo.png" alt="" class="w-8 h-8 object-contain" /></span>
        <span class="min-w-0">
          <h1 class="text-lg sm:text-xl font-bold leading-snug text-white">Activate owner account</h1>
          <span class="block text-[12.5px] text-blue-100">CSPC Boarding House Finder</span>
        </span>
      </router-link>
      <div class="p-6 sm:p-8">

      <div v-if="activatedEmail" role="status" class="text-center">
        <div class="activate-success-icon" aria-hidden="true"><i class="fa-solid fa-check"></i></div>
        <p class="text-[12px] font-bold uppercase tracking-wider text-emerald-700">Activation complete</p>
        <p class="text-xl font-bold text-[#142b4a] mt-1">Your account is active</p>
        <p class="text-sm leading-relaxed text-slate-600 mt-2">Log in with this email and your new password.</p>
        <div class="activate-email-box">
          <i class="fa-regular fa-envelope" aria-hidden="true"></i>
          <span class="activate-wrap">{{ activatedEmail }}</span>
        </div>
        <router-link to="/login" class="activate-focus activate-cta">Go to login <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></router-link>
        <p class="mt-4 text-[12.5px] text-slate-500"><i class="fa-solid fa-shield-halved mr-1 text-slate-400" aria-hidden="true"></i>Keep your password private. SASO will never ask for it.</p>
      </div>

      <template v-else-if="!token">
        <p class="text-sm leading-relaxed text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">This activation link is incomplete. Open <router-link to="/track" class="activate-focus rounded font-medium text-[#245b99] hover:text-[#142b4a] underline underline-offset-2">Track My Application</router-link> to get a new link.</p>
      </template>

      <form v-else @submit.prevent="activate" class="space-y-4" novalidate>
        <p class="text-sm leading-relaxed text-slate-600">Your verified applicant email will be your login email. Set a password to activate your approved owner account.</p>
        <div v-if="errorMsg" role="alert" class="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-3 py-2.5 text-sm activate-wrap">{{ errorMsg }}</div>
        <div>
          <label for="activate-email" class="block text-sm font-medium text-slate-800 mb-1.5">Login email</label>
          <input id="activate-email" v-model="email" type="email" autocomplete="email" maxlength="255" readonly
            class="activate-input activate-readonly" />
        </div>
        <div>
          <label for="activate-password" class="block text-sm font-medium text-slate-800 mb-1.5">New password</label>
          <input id="activate-password" v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" maxlength="72" aria-describedby="activate-rules"
            class="activate-input" />
        </div>
        <div>
          <label for="activate-confirm" class="block text-sm font-medium text-slate-800 mb-1.5">Confirm password</label>
          <input id="activate-confirm" v-model="confirmPassword" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" maxlength="72" aria-describedby="activate-rules"
            class="activate-input" />
        </div>
        <label class="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer"><input v-model="showPassword" type="checkbox" class="activate-focus w-4 h-4 accent-[#1e4a8d]" /> Show password</label>
        <ul id="activate-rules" class="text-[13px] space-y-1" aria-label="Password requirements">
          <li v-for="rule in rules" :key="rule.text" :class="rule.ok ? 'text-emerald-700' : 'text-slate-600'">
            <i :class="['fa-solid mr-1.5', rule.ok ? 'fa-check' : 'fa-circle']" aria-hidden="true" style="font-size: 10px"></i>{{ rule.text }}
          </li>
        </ul>
        <button type="submit" :disabled="isSaving || !emailValid" class="activate-focus w-full min-h-[44px] bg-[#1e4a8d] hover:bg-[#163870] text-white font-semibold rounded-lg py-3 text-sm disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed">
          {{ isSaving ? 'Activating…' : 'Activate account' }}
        </button>
      </form>
      </div>
    </main>
  </div>
</template>

<style scoped>
.activate-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; box-shadow: 0 16px 40px rgba(20, 43, 74, .12); }
.activate-head { display: flex; align-items: center; gap: 12px; padding: 18px 22px; background: linear-gradient(120deg, #142b4a 0%, #1e4a8d 60%, #2f6fc0 100%); }
.activate-logo { width: 46px; height: 46px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 14px; background: #fff; box-shadow: 0 2px 8px rgba(0, 0, 0, .15); }
.activate-success-icon { width: 72px; height: 72px; margin: 4px auto 16px; display: flex; align-items: center; justify-content: center; border-radius: 999px; background: linear-gradient(135deg, #22c55e, #15803d); color: #fff; font-size: 30px; box-shadow: 0 0 0 8px #dcfce7, 0 0 0 16px #f0fdf4, 0 10px 24px rgba(22, 163, 74, .3); animation: activate-pop .45s ease-out; }
@keyframes activate-pop { from { transform: scale(.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .activate-success-icon { animation: none; } }
.activate-email-box { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 16px 0 20px; padding: 12px 14px; border: 1px dashed #cbd5e1; border-radius: 12px; background: #f8fafc; font-size: 14.5px; font-weight: 600; color: #142b4a; }
.activate-email-box i { color: #1e4a8d; }
.activate-cta { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 48px; border-radius: 12px; background: #1e4a8d; color: #fff; font-size: 15px; font-weight: 600; box-shadow: 0 6px 16px rgba(30, 74, 141, .25); transition: background .15s, transform .15s; }
.activate-cta:hover { background: #163870; transform: translateY(-1px); }
.activate-input { width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; color: #0f172a; font-size: 15px; transition: border-color .15s, box-shadow .15s; }
.activate-input:focus { outline: none; border-color: #245b99; box-shadow: 0 0 0 3px #bcd5f2; }
.activate-readonly, .activate-readonly:focus { background: #f8fafc; color: #475569; border-color: #e2e8f0; }
.activate-focus:focus-visible { outline: 3px solid #5e99db; outline-offset: 2px; }
.activate-wrap { overflow-wrap: anywhere; }
</style>
