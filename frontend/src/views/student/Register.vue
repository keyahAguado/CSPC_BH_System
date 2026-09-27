<script setup>
import { ref } from 'vue';
import { getApiBaseUrl } from '../../config/api';

const isGoogleLoading = ref(false);

const handleGoogleSignup = () => {
  isGoogleLoading.value = true;
  const origin = window.location.origin;
  const base   = getApiBaseUrl();
  window.location.replace(`${base}/api/auth/google?origin=${encodeURIComponent(origin)}`);
};
</script>

<template>
  <div class="min-h-screen font-sans flex flex-col md:flex-row bg-slate-900 selection:bg-blue-500 selection:text-white">

    <!-- ═══════════════════════════════════════════════
         LEFT PANEL — Brand Hero (Desktop only)
    ═══════════════════════════════════════════════ -->
    <div class="hidden lg:flex lg:w-[48%] relative flex-col justify-between overflow-hidden bg-[#0a1931] p-12 lg:p-14">
      <!-- Ambient overlay -->
      <div class="absolute inset-0 z-0 pointer-events-none">
        <img src="/img/cspc_bg.webp" class="w-full h-full object-cover opacity-20 filter blur-[1px] scale-105" alt="" />
        <div class="absolute inset-0 bg-gradient-to-br from-[#0a1931]/95 via-[#102a54]/90 to-[#0b1b36]/98"></div>
        <div class="absolute -top-32 -left-32 w-[30rem] h-[30rem] bg-blue-600/20 rounded-full blur-[100px]"></div>
        <div class="absolute -bottom-32 -right-32 w-[30rem] h-[30rem] bg-indigo-600/20 rounded-full blur-[100px]"></div>
      </div>

      <!-- Logo -->
      <div class="relative z-10">
        <a href="/" class="inline-flex items-center gap-4 group">
          <div class="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-2.5 flex items-center justify-center shadow-xl group-hover:scale-105 transition duration-300">
            <img src="/img/CSPC_logo.png" alt="CSPC" class="w-full h-full object-contain drop-shadow" />
          </div>
          <div>
            <p class="text-white font-black text-sm uppercase tracking-[0.2em] leading-tight">CSPC</p>
            <p class="text-blue-300 text-[10px] font-extrabold uppercase tracking-[0.25em] mt-0.5">Boarding House System</p>
          </div>
        </a>
      </div>

      <!-- Hero content -->
      <div class="relative z-10 max-w-lg my-auto py-10">
        <div class="inline-flex items-center gap-2.5 bg-white/10 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/15 text-blue-200 text-[10px] font-extrabold uppercase tracking-widest mb-8">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          SASO Official Housing Portal
        </div>

        <h1 class="text-white font-black text-4xl xl:text-[2.75rem] uppercase leading-[1.15] tracking-tight mb-6">
          List Your<br />
          <span class="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 via-white to-blue-300">Property With</span><br />
          CSPC SASO.
        </h1>

        <p class="text-blue-100/80 text-sm leading-relaxed font-normal mb-10 max-w-md">
          Register your boarding house for SASO accreditation and connect with verified CSPC students looking for safe, affordable accommodation.
        </p>

        <div class="space-y-4">
          <div class="flex items-start gap-3.5">
            <div class="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 flex-shrink-0 mt-0.5">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div>
              <p class="text-white text-xs font-bold tracking-wide">Google Identity Verification</p>
              <p class="text-blue-200/60 text-[11px] font-medium mt-0.5">Every registration is tied to a verified Google account</p>
            </div>
          </div>
          <div class="flex items-start gap-3.5">
            <div class="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 flex-shrink-0 mt-0.5">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <p class="text-white text-xs font-bold tracking-wide">SASO Accreditation Process</p>
              <p class="text-blue-200/60 text-[11px] font-medium mt-0.5">Submit documents online — reviewed by SASO administrators</p>
            </div>
          </div>
          <div class="flex items-start gap-3.5">
            <div class="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 flex-shrink-0 mt-0.5">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
              </svg>
            </div>
            <div>
              <p class="text-white text-xs font-bold tracking-wide">Reach Verified CSPC Students</p>
              <p class="text-blue-200/60 text-[11px] font-medium mt-0.5">Listed properties are visible to all enrolled CSPC students</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="relative z-10 flex flex-wrap items-center justify-between text-blue-300/60 text-[11px] font-semibold border-t border-white/10 pt-6 gap-2">
        <span>Camarines Sur Polytechnic Colleges &bull; SASO</span>
        <span class="text-blue-200/80 font-bold uppercase tracking-wider text-[10px]">Developed by <strong class="text-white">TEAM DABINUSHKA</strong></span>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════
         RIGHT PANEL — Registration Card
    ═══════════════════════════════════════════════ -->
    <div class="flex-1 flex flex-col justify-center items-center bg-slate-50 dark:bg-slate-900 p-6 sm:p-10 md:p-14 min-h-screen">

      <!-- Mobile branding -->
      <div class="lg:hidden flex flex-col items-center mb-8 text-center">
        <a href="/" class="inline-flex flex-col items-center gap-2 mb-2">
          <img src="/img/CSPC_logo.png" alt="CSPC" class="w-14 h-14 object-contain drop-shadow-md" />
          <span class="text-[#1e4a8d] dark:text-blue-400 font-black text-sm uppercase tracking-[0.25em]">CSPC Boarding House</span>
        </a>
        <p class="text-slate-400 text-xs font-medium">SASO Official Landlord Registration</p>
      </div>

      <!-- Card -->
      <div class="w-full max-w-md bg-white dark:bg-slate-800/90 rounded-3xl p-8 sm:p-10 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200/70 dark:border-slate-700/80">

        <!-- Close / back button -->
        <router-link to="/login"
          class="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-xs transition lg:hidden"
          title="Back to login">✕</router-link>

        <!-- Icon + title -->
        <div class="mb-8 text-left">
          <div class="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-800/60 flex items-center justify-center mb-4 shadow-xs">
            <i class="fa-solid fa-building-user text-xl text-[#1e4a8d] dark:text-blue-400"></i>
          </div>
          <h2 class="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
            Landlord Registration
          </h2>
          <p class="text-slate-400 dark:text-slate-400 text-xs sm:text-sm font-medium mt-1">
            Register your boarding house for SASO accreditation.
          </p>
        </div>

        <!-- Verification notice -->
        <div class="bg-blue-50 dark:bg-blue-950/50 rounded-2xl p-4 border border-blue-200/60 dark:border-blue-900/60 mb-6 space-y-1.5">
          <div class="flex items-center gap-2 text-blue-900 dark:text-blue-300 font-extrabold text-xs uppercase tracking-wide">
            <svg class="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Verified Identity Required</span>
          </div>
          <p class="text-[11.5px] text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
            To protect students and ensure authentic listings, property owners sign up using a verified <strong class="text-slate-900 dark:text-white">Google / Gmail account</strong>.
          </p>
        </div>

        <!-- Google button -->
        <button
          type="button"
          @click="handleGoogleSignup"
          :disabled="isGoogleLoading"
          class="w-full flex items-center justify-center gap-3 bg-[#1e4a8d] hover:bg-[#163870] active:scale-[0.98] text-white font-extrabold py-3.5 px-5 rounded-2xl shadow-lg shadow-[#1e4a8d]/25 hover:shadow-xl transition-all duration-300 text-xs uppercase tracking-widest cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
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

        <!-- Trust badges -->
        <div class="grid grid-cols-3 gap-2 mt-6 pt-5 border-t border-slate-100 dark:border-slate-700/80 text-[10px] font-extrabold text-slate-400 uppercase tracking-tight">
          <div class="flex flex-col items-center gap-1.5">
            <i class="fa-solid fa-circle-check text-emerald-500 text-sm"></i>
            <span>Real Email</span>
          </div>
          <div class="flex flex-col items-center gap-1.5">
            <i class="fa-solid fa-bolt text-amber-500 text-sm"></i>
            <span>1-Click Setup</span>
          </div>
          <div class="flex flex-col items-center gap-1.5">
            <i class="fa-solid fa-lock text-blue-500 text-sm"></i>
            <span>SASO Verified</span>
          </div>
        </div>

        <p class="mt-6 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wide text-center">
          Already registered?
          <router-link to="/login" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline ml-1">
            Log in here
          </router-link>
        </p>
      </div>
    </div>

  </div>
</template>
