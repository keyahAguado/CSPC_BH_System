<script setup>
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import { clearApplicantToken } from '../../utils/applicantSession.js';

const route = useRoute();
const token = typeof route.query.token === 'string' ? route.query.token : '';

const email = ref((() => {
  try { return sessionStorage.getItem('cspc_activation_email') || ''; } catch { return ''; }
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
    errorMsg.value = 'Enter the email address you want to log in with.';
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
  <div class="min-h-screen bg-[#f4f7fb] font-sans flex items-center justify-center px-4 py-10">
    <main class="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
      <router-link to="/" class="flex items-center gap-3 mb-5">
        <img src="/img/CSPC_logo.png" alt="" class="w-10 h-10 object-contain" />
        <h1 class="text-xl font-bold text-[#142b4a]">Activate owner account</h1>
      </router-link>

      <div v-if="activatedEmail" role="status" class="text-center">
        <div class="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4"><i class="fa-solid fa-circle-check text-2xl" aria-hidden="true"></i></div>
        <p class="font-bold text-[#142b4a]">Your account is active</p>
        <p class="text-sm text-slate-500 mt-1 mb-6">Log in with <strong class="text-slate-700 break-all">{{ activatedEmail }}</strong> and your new password.</p>
        <router-link to="/login" class="inline-block bg-[#1e4a8d] hover:bg-[#163870] text-white font-semibold rounded-lg px-6 py-3 text-sm">Go to login</router-link>
      </div>

      <template v-else-if="!token">
        <p class="text-sm text-slate-600">This activation link is incomplete. Open <router-link to="/track" class="text-blue-600 font-semibold hover:underline">Track My Application</router-link> to get a new link.</p>
      </template>

      <form v-else @submit.prevent="activate" class="space-y-4" novalidate>
        <p class="text-sm text-slate-500">Choose the email and password you will use to log in to your owner dashboard.</p>
        <div v-if="errorMsg" role="alert" class="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2.5 text-sm font-semibold">{{ errorMsg }}</div>
        <div>
          <label for="activate-email" class="block text-[13px] font-semibold text-slate-600 mb-1.5">Login email</label>
          <input id="activate-email" v-model="email" type="email" autocomplete="email" maxlength="255" placeholder="name@gmail.com"
            class="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2.5 text-sm focus:bg-white focus:border-blue-500 outline-none" />
        </div>
        <div>
          <label for="activate-password" class="block text-[13px] font-semibold text-slate-600 mb-1.5">New password</label>
          <input id="activate-password" v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" maxlength="72"
            class="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2.5 text-sm focus:bg-white focus:border-blue-500 outline-none" />
        </div>
        <div>
          <label for="activate-confirm" class="block text-[13px] font-semibold text-slate-600 mb-1.5">Confirm password</label>
          <input id="activate-confirm" v-model="confirmPassword" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" maxlength="72"
            class="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2.5 text-sm focus:bg-white focus:border-blue-500 outline-none" />
        </div>
        <label class="flex items-center gap-2 text-[13px] text-slate-600"><input v-model="showPassword" type="checkbox" class="accent-blue-600" /> Show password</label>
        <ul class="text-[12px] space-y-1">
          <li v-for="rule in rules" :key="rule.text" :class="rule.ok ? 'text-emerald-600' : 'text-slate-400'">
            <i :class="['fa-solid mr-1.5', rule.ok ? 'fa-check' : 'fa-circle']" aria-hidden="true" style="font-size: 10px"></i>{{ rule.text }}
          </li>
        </ul>
        <button type="submit" :disabled="isSaving" class="w-full bg-[#1e4a8d] hover:bg-[#163870] text-white font-semibold rounded-lg py-3 text-sm disabled:opacity-60">
          {{ isSaving ? 'Activating…' : 'Activate account' }}
        </button>
      </form>
    </main>
  </div>
</template>
