<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import Header from '../../components/partials/Header.vue';
import { normalizePhPhone, isValidPhPhone } from '../../utils/phoneValidation.js';

const route  = useRoute();
const router = useRouter();

// ── Pre-filled from Google OAuth redirect query params ──
const email     = ref('');
const name      = ref('');
const googleId  = ref('');
const profilePic = ref('');

// ── Owner-specific fields to collect ──
const phone   = ref('');
const address = ref('');

const errorMessage   = ref('');
const successMessage = ref('');
const isLoading      = ref(false);

onMounted(() => {
  email.value      = route.query.email     || '';
  name.value       = route.query.name      || '';
  googleId.value   = route.query.google_id || '';
  profilePic.value = route.query.pic       || '';

  // If critical params are missing the URL was tampered — send back to login
  if (!email.value || !googleId.value) {
    router.replace('/login?error=invalid_payload');
  }
});

const sanitizePhoneInput = () => {
  phone.value = normalizePhPhone(phone.value);
};

const handleSubmit = async () => {
  if (!phone.value.trim() || !address.value.trim()) {
    errorMessage.value = 'Please fill in both your phone number and residential address.';
    return;
  }
  if (!isValidPhPhone(phone.value.trim())) {
    errorMessage.value = 'Phone number must be a valid PH mobile number (11 digits, starting with 09).';
    return;
  }

  errorMessage.value   = '';
  successMessage.value = '';
  isLoading.value      = true;

  try {
    const response = await axios.post('/api/auth/register/owner-complete', {
      name:      name.value,
      email:     email.value,
      google_id: googleId.value,
      phone:     phone.value.trim(),
      address:   address.value.trim(),
    });

    if (response.data.success) {
      const { token, user } = response.data;

      sessionStorage.setItem('cspc_token', token);
      sessionStorage.setItem('cspc_user', JSON.stringify(user));

      successMessage.value = 'Registration submitted! Redirecting...';

      setTimeout(() => {
        // New owners have no boarding house yet — send to accreditation
        router.push('/owner/accreditation');
      }, 1200);
    }
  } catch (err) {
    console.error('Owner registration error:', err);
    errorMessage.value = err.response?.data?.message || 'Registration failed. Please try again.';
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-blue-50 font-sans">
    <Header />

    <main class="min-h-[85vh] flex items-center justify-center p-6">
      <div class="bg-white rounded-3xl shadow-xl p-10 max-w-lg w-full border border-slate-100">

        <!-- Header -->
        <div class="text-center mb-8">
          <!-- Profile picture from Google, if available -->
          <img
            v-if="profilePic"
            :src="profilePic"
            :alt="name"
            class="w-16 h-16 rounded-full mx-auto mb-4 border-2 border-blue-100 object-cover"
          />
          <div v-else class="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>

          <h1 class="text-2xl font-black text-blue-900 uppercase tracking-tight">Almost There!</h1>
          <p class="text-slate-500 text-sm mt-1">
            We just need a couple more details to set up your owner account.
          </p>
        </div>

        <!-- Alerts -->
        <div v-if="errorMessage" class="bg-red-50 text-red-600 text-xs p-3 rounded-xl mb-4 border border-red-100">
          {{ errorMessage }}
        </div>
        <div v-if="successMessage" class="bg-green-50 text-green-600 text-xs p-3 rounded-xl mb-4 border border-green-100">
          {{ successMessage }}
        </div>

        <form @submit.prevent="handleSubmit" class="space-y-5 text-left">

          <!-- Read-only: Name & Email pre-filled from Google -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">Full Name</label>
              <input
                :value="name"
                type="text"
                class="w-full border border-slate-200 bg-slate-50 p-2.5 rounded-lg text-sm font-medium text-slate-500 cursor-not-allowed"
                readonly
              />
            </div>
            <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">Google Email</label>
              <input
                :value="email"
                type="email"
                class="w-full border border-slate-200 bg-slate-50 p-2.5 rounded-lg text-sm font-medium text-slate-500 cursor-not-allowed"
                readonly
              />
            </div>
          </div>

          <!-- Phone Number -->
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">
              Phone Number <span class="text-red-400">*</span>
            </label>
            <input
              v-model="phone"
              @input="sanitizePhoneInput"
              type="text"
              inputmode="numeric"
              maxlength="11"
              placeholder="09XXXXXXXXX"
              class="w-full border border-slate-200 p-2.5 rounded-lg text-sm focus:border-blue-500 outline-none font-medium"
              required
            />
          </div>

          <!-- Residential Address -->
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">
              Residential Address <span class="text-red-400">*</span>
            </label>
            <textarea
              v-model="address"
              rows="3"
              placeholder="e.g. Zone 1, Nabua, Camarines Sur"
              class="w-full border border-slate-200 p-2.5 rounded-lg text-sm focus:border-blue-500 outline-none font-medium resize-none"
              required
            ></textarea>
          </div>

          <!-- Notice -->
          <p class="text-[10px] text-slate-400 bg-slate-50 rounded-xl p-3 border border-slate-100 leading-relaxed">
            Your account will be marked <span class="font-bold text-amber-500">Pending Review</span> after submission.
            SASO will verify your details before granting full access.
          </p>

          <!-- Submit -->
          <button
            type="submit"
            :disabled="isLoading"
            class="w-full bg-[#1e4a8d] hover:bg-blue-900 text-white font-black py-4 rounded-xl transition shadow-lg uppercase text-xs tracking-widest disabled:opacity-50"
          >
            {{ isLoading ? 'Submitting...' : 'Complete Registration' }}
          </button>
        </form>

        <p class="text-center mt-6 text-slate-400 text-[10px] font-bold uppercase tracking-wide">
          Wrong account?
          <a href="/login" class="text-blue-600 underline">Go back to login</a>
        </p>
      </div>
    </main>
  </div>
</template>
