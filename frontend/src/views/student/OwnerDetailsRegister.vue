<script setup>
import UserAvatar from "../../components/UserAvatar.vue";
import { validateInput } from '../../utils/inputValidation.js';
import { ref, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import Header from '../../components/partials/Header.vue';
import { normalizePhPhone, isValidPhPhone } from '../../utils/phoneValidation.js';
import AddressPicker from '../../components/AddressPicker.vue';

const route  = useRoute();
const router = useRouter();

const email      = ref('');
const name       = ref('');
const googleId   = ref('');
const onboardingCode = ref('');
const profilePic = ref('');

const phone   = ref('');
const address = ref('');

const errorMessage   = ref('');
const successMessage = ref('');
const isLoading      = ref(false);

onMounted(async () => {
  onboardingCode.value = route.query.onboarding_code || '';
  email.value      = route.query.email     || '';
  name.value       = route.query.name      || '';
  googleId.value   = route.query.google_id || '';
  profilePic.value = route.query.pic       || '';

  if (!email.value || !googleId.value || !onboardingCode.value) {
    router.replace('/login?error=invalid_payload');
  }
});

const sanitizePhoneInput = () => {
  phone.value = normalizePhPhone(phone.value);
};

const handleSubmit = async () => {
  if (isLoading.value) return;
  const inputError = validateInput('ownerRegistration', { name: name.value, email: email.value, google_id: googleId.value, phone: phone.value, address: address.value, profile_pic: profilePic.value || '' });
  if (inputError) { errorMessage.value = inputError; return; }
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
      onboarding_code: onboardingCode.value,
      name:        name.value,
      email:       email.value,
      google_id:   googleId.value,
      phone:       phone.value.trim(),
      address:     address.value.trim(),
      profile_pic: profilePic.value || '',
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
          <UserAvatar :src="profilePic" :name="name" class="w-16 h-16 rounded-full mx-auto mb-4" />

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
            <p class="block text-[10px] font-black text-slate-400 uppercase mb-1">
              Residential Address <span class="text-red-400">*</span>
            </p>
            <AddressPicker v-model="address" id-prefix="owner-register-address"
              field-class="w-full border border-slate-200 rounded-lg text-sm focus:border-blue-500 outline-none font-medium"
              label-class="block text-[10px] font-black text-slate-400 uppercase mb-1" />
            <p class="text-[9px] text-slate-400 mt-1 ml-1 font-medium">Your personal home address — not the boarding house location.</p>
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
