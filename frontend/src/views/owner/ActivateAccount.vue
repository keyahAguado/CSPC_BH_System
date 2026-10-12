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
    <main class="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
      <router-link to="/" class="activate-focus flex items-center gap-3 mb-5 rounded-lg">
        <img src="/img/CSPC_logo.png" alt="" class="w-10 h-10 object-contain shrink-0" />
        <h1 class="text-xl font-semibold leading-snug text-[#142b4a]">Activate owner account</h1>
      </router-link>

      <div v-if="activatedEmail" role="status" class="text-center">
        <div class="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto mb-4"><i class="fa-solid fa-circle-check text-2xl" aria-hidden="true"></i></div>
        <p class="text-base font-semibold text-[#142b4a]">Your account is active</p>
        <p class="text-sm leading-relaxed text-slate-600 mt-1 mb-6">Log in with <strong class="font-semibold text-slate-800 activate-wrap">{{ activatedEmail }}</strong> and your new password.</p>
        <router-link to="/login" class="activate-focus inline-flex items-center justify-center min-h-[44px] bg-[#1e4a8d] hover:bg-[#163870] text-white font-semibold rounded-lg px-6 py-3 text-sm">Go to login</router-link>
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
    </main>
  </div>
</template>

<style scoped>
.activate-input { width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; color: #0f172a; font-size: 15px; transition: border-color .15s, box-shadow .15s; }
.activate-input:focus { outline: none; border-color: #245b99; box-shadow: 0 0 0 3px #bcd5f2; }
.activate-readonly, .activate-readonly:focus { background: #f8fafc; color: #475569; border-color: #e2e8f0; }
.activate-focus:focus-visible { outline: 3px solid #5e99db; outline-offset: 2px; }
.activate-wrap { overflow-wrap: anywhere; }
</style>
