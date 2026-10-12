<script setup>
import { ref, onUnmounted } from 'vue';
import axios from 'axios';
const email = ref('');
const requestedEmail = ref('');
const busy = ref(false);
const message = ref('');
const error = ref('');
const cooldown = ref(false);
let timer;
onUnmounted(() => clearTimeout(timer));
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
        <p>Open the link, then press Verify email to continue.</p>
        <p class="text-emerald-800">The link expires in 30 minutes. Email verification does not approve your property or create an active owner login.</p>
      </div>
      <button :disabled="busy || cooldown" class="gate-focus w-full min-h-[44px] bg-[#1e4a8d] hover:bg-[#163870] text-white text-sm font-semibold rounded-lg px-4 py-3 disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed">{{ busy ? 'Requesting…' : cooldown ? 'Wait a minute before resending' : 'Send verification link' }}</button>
    </form>
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
