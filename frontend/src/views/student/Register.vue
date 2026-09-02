<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import Header from '../../components/partials/Header.vue';
import { getApiBaseUrl } from '../../config/api';

const router = useRouter();
const isGoogleLoading = ref(false);

const handleGoogleSignup = () => {
  isGoogleLoading.value = true;
  const origin = window.location.origin;
  const base   = getApiBaseUrl();
  window.location.replace(`${base}/api/auth/google?origin=${encodeURIComponent(origin)}`);
};
</script>

<template>
  <div class="min-h-screen bg-slate-900 font-sans flex flex-col justify-between selection:bg-blue-500 selection:text-white">
    <Header />

    <main class="flex-1 flex items-center justify-center p-4 sm:p-6 my-4 sm:my-6 relative overflow-y-auto">
      <!-- Ambient Gradient Backdrop & Glow Orbs -->
      <div class="absolute inset-0 z-0 pointer-events-none">
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[34rem] h-[34rem] bg-blue-600/15 rounded-full blur-[120px]"></div>
        <div class="absolute top-1/3 right-1/4 w-[24rem] h-[24rem] bg-indigo-600/15 rounded-full blur-[100px]"></div>
      </div>

      <!-- Main Glassmorphic Card -->
      <div class="relative z-10 w-full max-w-md bg-white dark:bg-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200/80 dark:border-slate-700/80 text-center transition-all duration-300">
        
        <!-- Back to Login Button -->
        <router-link 
          to="/login" 
          class="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700/80 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-300 flex items-center justify-center font-bold text-xs transition duration-200"
          title="Back to login"
        >
          ✕
        </router-link>

        <!-- Brand Icon Badge -->
        <div class="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-800/60 flex items-center justify-center mx-auto mb-4 shadow-xs">
          <i class="fa-solid fa-building-user text-xl text-[#1e4a8d] dark:text-blue-400"></i>
        </div>

        <h1 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-1.5">
          Landlord Registration
        </h1>
        <p class="text-slate-500 dark:text-slate-400 text-xs font-medium leading-normal mb-5">
          Register your boarding house for SASO accreditation and student listing.
        </p>

        <!-- Security Verification Notice Banner -->
        <div class="bg-blue-50/80 dark:bg-blue-950/50 rounded-2xl p-4 border border-blue-200/60 dark:border-blue-900/60 text-left mb-5 space-y-1.5 shadow-xs">
          <div class="flex items-center gap-2 text-blue-900 dark:text-blue-300 font-extrabold text-xs uppercase tracking-wide">
            <svg class="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Verified Identity Required</span>
          </div>
          <p class="text-[11.5px] text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
            To protect students and ensure authentic listings, property owners sign up using a verified <strong class="text-slate-900 dark:text-white font-bold">Google / Gmail account</strong>.
          </p>
        </div>

        <!-- Google OAuth Primary Button -->
        <button
          type="button"
          @click="handleGoogleSignup"
          :disabled="isGoogleLoading"
          class="w-full bg-[#1e4a8d] hover:bg-[#163870] active:scale-[0.98] text-white font-extrabold py-3.5 px-5 rounded-2xl shadow-lg shadow-[#1e4a8d]/25 hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-3 text-xs uppercase tracking-widest cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed group"
        >
          <span class="flex-shrink-0">
            <svg v-if="isGoogleLoading" class="animate-spin w-5 h-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <svg v-else class="w-5 h-5 bg-white rounded-full p-0.5" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
          </span>
          <span>{{ isGoogleLoading ? 'Connecting to Google...' : 'Continue with Google' }}</span>
        </button>

        <!-- Trust Badges -->
        <div class="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-700/80 text-[10px] font-extrabold text-slate-400 dark:text-slate-400 uppercase tracking-tight">
          <div class="flex flex-col items-center gap-1">
            <i class="fa-solid fa-circle-check text-emerald-500 text-xs"></i>
            <span>Real Email</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <i class="fa-solid fa-bolt text-amber-500 text-xs"></i>
            <span>1-Click Setup</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <i class="fa-solid fa-lock text-blue-500 text-xs"></i>
            <span>SASO Verified</span>
          </div>
        </div>

        <p class="mt-6 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wide">
          Already registered? 
          <router-link to="/login" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline ml-1">
            Log in here
          </router-link>
        </p>
      </div>
    </main>
  </div>
</template>
