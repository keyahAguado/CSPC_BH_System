<script setup>
import Header from '../../components/partials/Header.vue';
import { getApiBaseUrl } from '../../config/api';
import { useRoute } from 'vue-router';

const API = getApiBaseUrl();
const route = useRoute();

// Preserve any error messages passed back from the OAuth callback
const errorMap = {
  unauthorized_domain: 'That Google account is not authorised. Use your CSPC or personal Gmail account.',
  suspended: 'Your account has been suspended. Please contact SASO.',
  server_error: 'Something went wrong on our end. Please try again.',
  invalid_payload: 'Authentication payload was invalid. Please try again.',
  no_token: 'No session token received. Please try again.',
};
const errorMessage = errorMap[route.query.error] || null;

const handleGoogleLogin = () => {
  const currentOrigin = window.location.origin;
  window.location.href = `${API}/api/auth/google?origin=${encodeURIComponent(currentOrigin)}`;
};
</script>

<template>
  <div class="bg-slate-50 min-h-screen font-sans">
    <Header />

    <main class="min-h-[85vh] flex items-center justify-center p-6 bg-slate-50">
      <div class="bg-white rounded-[2rem] shadow-2xl p-8 max-w-md w-full text-center border border-slate-100">

        <!-- Branding -->
        <div class="mb-10 text-center">
          <h1 class="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Portal Access</h1>
          <p class="text-blue-600 font-bold uppercase text-[10px] tracking-[0.3em]">CSPC Boarding House Selection</p>
          <div class="w-12 h-1 bg-blue-600 mx-auto rounded-full mt-4"></div>
        </div>

        <!-- Error alert from OAuth redirect -->
        <div
          v-if="errorMessage"
          class="bg-red-50 text-red-600 text-xs p-3 rounded-xl mb-6 border border-red-100 text-left"
        >
          {{ errorMessage }}
        </div>

        <div class="space-y-4">
          <!-- PRIMARY: Sign in with Google -->
          <button
            @click="handleGoogleLogin"
            class="w-full group flex items-center gap-3 bg-white hover:bg-blue-50 border-2 border-slate-200 hover:border-blue-500 p-4 rounded-2xl transition-all duration-200 shadow-sm cursor-pointer"
          >
            <!-- Google "G" icon -->
            <div class="flex-shrink-0 bg-white rounded-xl p-1 shadow-sm border border-slate-100">
              <svg class="w-6 h-6" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                <path fill="none" d="M0 0h48v48H0z"/>
              </svg>
            </div>
            <span class="flex-1 font-bold text-[13px] text-slate-700 uppercase tracking-widest text-center">
              Continue with Google
            </span>
          </button>

          <!-- Helper text -->
          <p class="text-[10px] text-slate-400 font-medium leading-relaxed px-2">
            Students use <span class="font-bold text-slate-500">@my.cspc.edu.ph</span> &nbsp;·&nbsp;
            Employees use <span class="font-bold text-slate-500">@cspc.edu.ph</span> &nbsp;·&nbsp;
            Owners use their personal Gmail
          </p>

          <!-- Divider -->
          <div class="flex items-center gap-3 my-2">
            <div class="flex-1 h-px bg-slate-100"></div>
            <span class="text-[10px] font-black text-slate-300 uppercase tracking-widest">or</span>
            <div class="flex-1 h-px bg-slate-100"></div>
          </div>

          <!-- GUEST access -->
          <router-link
            to="/student/dashboard?guest=true"
            class="group flex items-center bg-white hover:bg-slate-50 border-2 border-slate-100 hover:border-blue-500 p-3 rounded-2xl transition-all duration-200 shadow-sm"
          >
            <div class="bg-slate-50 group-hover:bg-blue-50 p-2.5 rounded-xl transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-slate-400 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <span class="flex-1 font-bold text-[13px] text-slate-700 uppercase tracking-widest text-center pr-10">
              Browse as Guest
            </span>
          </router-link>
        </div>

        <p class="mt-8 text-[9px] font-black text-slate-300 uppercase tracking-[0.3em]">CSPC Boarding House System</p>
      </div>
    </main>
  </div>
</template>
