<script setup>
import { ref } from 'vue';
import axios from 'axios';
const token = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
// Do not leave the verification secret in the address bar after reading it.
window.history.replaceState(window.history.state, '', window.location.pathname);
const busy = ref(false);
const error = ref('');
const verified = ref(false);
const verify = async () => {
  busy.value = true; error.value = '';
  try {
    // Only confirms the inbox. The page where the link was requested continues on its own,
    // so this device (often a phone) is not taken into the application form.
    await axios.post('/api/applications/email/verify', { token });
    verified.value = true;
  } catch (err) { error.value = err.response?.data?.message || 'Verification could not finish. Please check your connection and try again.'; }
  finally { busy.value = false; }
};
</script>
<template>
  <main class="min-h-screen bg-[#f4f7fb] px-4 py-10 sm:py-16 font-sans text-[#243449]">
    <section class="max-w-lg mx-auto bg-white border border-slate-200 rounded-xl p-6 sm:p-8" aria-labelledby="verify-applicant-title">
      <img src="/img/CSPC_logo.png" alt="" class="w-10 h-10 object-contain mb-4" />
      <h1 id="verify-applicant-title" class="text-xl font-semibold leading-snug text-[#142b4a]">Verify your applicant email</h1>
      <p class="text-sm leading-relaxed text-slate-600 mt-2">This confirms access to your inbox. It does not approve your property or activate an owner dashboard account.</p>
      <div v-if="verified" role="status" class="mt-5 text-sm leading-relaxed text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 space-y-1.5">
        <p class="font-semibold flex items-center gap-2"><i class="fa-solid fa-circle-check text-emerald-600" aria-hidden="true"></i> Email verified</p>
        <p>Go back to the page where you requested the link. It continues automatically. You can close this tab.</p>
      </div>
      <p v-if="error" role="alert" class="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5 mt-5 verify-wrap">{{ error }}</p>
      <button v-if="token && !verified" @click="verify" :disabled="busy" class="verify-focus w-full min-h-[44px] mt-5 bg-[#1e4a8d] hover:bg-[#163870] text-white text-sm font-semibold rounded-lg px-4 py-3 disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed">{{ busy ? 'Verifying…' : 'Verify my email' }}</button>
      <p v-else-if="!token" role="alert" class="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5 mt-5">The verification link is incomplete. Request a new link.</p>
      <p v-if="!verified" class="mt-5 pt-4 border-t border-slate-100 text-sm">
        <router-link to="/track" class="verify-focus rounded font-medium text-[#245b99] hover:text-[#142b4a] underline underline-offset-2">Request another verification link</router-link>
      </p>
    </section>
  </main>
</template>

<style scoped>
.verify-focus:focus-visible { outline: 3px solid #5e99db; outline-offset: 2px; }
.verify-wrap { overflow-wrap: anywhere; }
</style>
