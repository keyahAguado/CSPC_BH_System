<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import axios from 'axios';
import { getApiBaseUrl } from '../../config/api';
import PrivacyPolicyModal from '../../components/partials/PrivacyPolicyModal.vue';

const router = useRouter();
const route  = useRoute();
const showPrivacyModal = ref(false);
const pendingAction    = ref(null);

// ── Form state ──
const email           = ref('');
const password        = ref('');
const showPass        = ref(false);
const isLoading       = ref(false);
const isGoogleLoading = ref(false);
const errorMsg        = ref('');
const successMsg      = ref('');
const errorShakeKey   = ref(0);

// reCAPTCHA v2 state (email/password login only). Required only when a site key is configured,
// so a missing VITE_RECAPTCHA_SITE_KEY never locks everyone out of email login.
const recaptchaSiteKey  = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';
const recaptchaEnabled  = Boolean(recaptchaSiteKey);
const recaptchaToken    = ref('');
const recaptchaWidgetId = ref(null);

const resetRecaptcha = () => {
  if (window.grecaptcha && recaptchaWidgetId.value !== null) {
    window.grecaptcha.reset(recaptchaWidgetId.value);
  }
  recaptchaToken.value = '';
};

// Detect if user typed a CSPC institutional email (@my.cspc.edu.ph or @cspc.edu.ph)
const isInstitutionalEmail = computed(() => {
  const clean = email.value.trim().toLowerCase();
  return clean.endsWith('@my.cspc.edu.ph') || clean.endsWith('@cspc.edu.ph');
});

// ── OAuth & Route Error messages passed back from backend or navigation guards ──
const oauthErrors = {
  session_required:    'Please log in to access this page.',
  session_expired:     'Your session has expired. Please log in again.',
  idle_timeout:        'You were logged out after 30 minutes of inactivity. Please log in again.',
  unauthorized:        'Access denied. You do not have permission to view that page.',
  unauthorized_domain: 'That Google account isn\'t authorised. Use your CSPC or personal Gmail.',
  oauth_failed:        'Google authentication timed out or was interrupted. Please try logging in again.',
  suspended:           'Your account has been suspended. Please contact SASO.',
  server_error:        'Something went wrong. Please try again.',
  invalid_payload:     'Authentication failed. Please try again.',
  no_token:            'No session received. Please try again.',
  pending_approval:    'Your property registration is still under SASO review. You will receive your reference number, email and password once it is approved.',
};

onMounted(() => {
  if (route.query.error) {
    errorMsg.value = oauthErrors[route.query.error] || 'An error occurred. Please try again.';
  }
  if (!localStorage.getItem('cspc_privacy_accepted')) {
    showPrivacyModal.value = true;
  }

  // Load reCAPTCHA v2 script and render widget inside #recaptcha-container
  if (recaptchaEnabled) {
    window.onRecaptchaLoad = () => {
      const container = document.getElementById('recaptcha-container');
      if (container && window.grecaptcha && !container.hasChildNodes()) {
        recaptchaWidgetId.value = window.grecaptcha.render(container, {
          sitekey: recaptchaSiteKey,
          callback: (token) => { recaptchaToken.value = token; },
          'expired-callback': () => { recaptchaToken.value = ''; },
        });
      }
    };

    const scriptId = 'recaptcha-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://www.google.com/recaptcha/api.js?onload=onRecaptchaLoad&render=explicit';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    } else if (window.grecaptcha && window.grecaptcha.render) {
      // Script already loaded (returning to this page): render directly
      window.onRecaptchaLoad();
    }
  }
});

// ── Redirect helper (shared with AuthSuccess logic) ──
function redirectByRole(user) {
  if (user.role === 'admin') {
    router.push('/admin/dashboard');
  } else if (user.role === 'owner') {
    const s = user.houseStatus || user.house_status || 'none';
    if (s === 'accredited') router.push('/owner/dashboard');
    else if (s === 'pending' || s === 'rejected') router.push('/owner/pending-review');
    else router.push('/owner/accreditation');
  } else if (user.role === 'student') {
    if (!user.student_id || !user.course || !user.year_section) {
      router.push('/student/profile');
    } else {
      router.push('/student/dashboard');
    }
  } else {
    router.push('/');
  }
}

// ── Email + password login ──
const handleLogin = async () => {
  if (!email.value || !password.value) {
    errorMsg.value = 'Please enter your email address and password.';
    return;
  }

  const cleanEmail = email.value.trim().toLowerCase();

  // Strict domain regexes enforcing exact domain spelling and structure
  const strictGmailPattern = /^[a-zA-Z0-9._%+-]{3,64}@gmail\.com$/;
  const strictYahooPattern = /^[a-zA-Z0-9._%+-]{3,64}@yahoo\.com(\.ph)?$/;
  const strictCspcPattern  = /^[a-zA-Z0-9._%+-]{3,64}@(my\.)?cspc\.edu\.ph$/;

  const isValidGmail = strictGmailPattern.test(cleanEmail);
  const isValidYahoo = strictYahooPattern.test(cleanEmail);
  const isValidCspc  = strictCspcPattern.test(cleanEmail);

  if (!isValidGmail && !isValidYahoo && !isValidCspc) {
    if (!cleanEmail.includes('@')) {
      errorMsg.value = 'Missing "@" in email address. Example: username@gmail.com';
      return;
    }

    const parts = cleanEmail.split('@');
    const username = parts[0] || '';
    const domain = parts[1] || '';

    if (username.length < 3) {
      errorMsg.value = 'Email username before @ must be at least 3 characters long.';
      return;
    }

    if (domain !== 'gmail.com') {
      errorMsg.value = 'Email domain must be typed strictly as @gmail.com (correct spelling and placement).';
      return;
    }

    errorMsg.value = 'Please enter a valid email ending strictly with @gmail.com (e.g. username@gmail.com).';
    return;
  }

  const username = cleanEmail.split('@')[0];
  if (cleanEmail !== 'admin@cspc.edu.ph' && ['gmail', 'email', 'test', 'user', 'owner', 'student'].includes(username)) {
    errorMsg.value = 'Please enter your actual email username (e.g. juan.delacruz@gmail.com).';
    return;
  }

  errorMsg.value   = '';
  successMsg.value = '';

  // Require reCAPTCHA verification before attempting login
  if (recaptchaEnabled && !recaptchaToken.value) {
    errorMsg.value = 'Please complete the CAPTCHA verification below.';
    errorShakeKey.value++;
    return;
  }

  isLoading.value  = true;

  try {
    const { data } = await axios.post('/api/auth/login', {
      email:    email.value.trim(),
      password: password.value,
    });

    if (data.success) {
      sessionStorage.setItem('cspc_token', data.token);
      sessionStorage.setItem('cspc_user', JSON.stringify(data.user));
      successMsg.value = 'Welcome back! Redirecting...';
      setTimeout(() => redirectByRole(data.user), 800);
    }
  } catch (err) {
    errorMsg.value = err.response?.data?.message || 'Incorrect credentials. Please try again.';
    errorShakeKey.value++;
    resetRecaptcha();
  } finally {
    isLoading.value = false;
  }
};

// ── Google OAuth ──
const proceedGoogleLogin = () => {
  if (isGoogleLoading.value) return;
  errorMsg.value        = '';
  isGoogleLoading.value = true;

  const origin = window.location.origin;
  const base   = getApiBaseUrl();
  window.location.replace(`${base}/api/auth/google?origin=${encodeURIComponent(origin)}`);
};

const handleGoogleLogin = () => {
  if (!localStorage.getItem('cspc_privacy_accepted')) {
    pendingAction.value = 'google';
    showPrivacyModal.value = true;
    return;
  }
  proceedGoogleLogin();
};

const handlePrivacyAccepted = () => {
  if (pendingAction.value === 'google') {
    pendingAction.value = null;
    proceedGoogleLogin();
  } else if (pendingAction.value === 'submit') {
    pendingAction.value = null;
    handleLogin();
  }
};

const handleOwnerRegister = () => handleGoogleLogin();
</script>

<template>
  <div class="min-h-screen font-sans flex flex-col md:flex-row bg-slate-900 selection:bg-blue-500 selection:text-white">

    <!-- ═══════════════════════════════════════════════
         LEFT PANEL — Brand & Visual Hero (Desktop)
    ═══════════════════════════════════════════════ -->
    <div class="hidden lg:flex lg:w-[48%] relative flex-col justify-between overflow-hidden bg-[#0a1931] p-12 lg:p-14">
      <!-- Ambient gradient overlay & glowing backdrop -->
      <div class="absolute inset-0 z-0 pointer-events-none">
        <img src="/img/cspc_bg.webp" class="w-full h-full object-cover opacity-20 filter blur-[1px] scale-105" alt="" />
        <div class="absolute inset-0 bg-gradient-to-br from-[#0a1931]/95 via-[#102a54]/90 to-[#0b1b36]/98"></div>
        <!-- Ambient radial glow Orbs -->
        <div class="absolute -top-32 -left-32 w-[30rem] h-[30rem] bg-blue-600/20 rounded-full blur-[100px]"></div>
        <div class="absolute -bottom-32 -right-32 w-[30rem] h-[30rem] bg-indigo-600/20 rounded-full blur-[100px]"></div>
      </div>

      <!-- Header Logo & Branding -->
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

      <!-- Center Hero Content (Boxless & Pristine) -->
      <div class="relative z-10 max-w-lg my-auto py-10">
        <!-- Sleek Status Badge -->
        <div class="inline-flex items-center gap-2.5 bg-white/10 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/15 text-blue-200 text-[10px] font-extrabold uppercase tracking-widest mb-8">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          SASO Official Housing Portal
        </div>

        <h1 class="text-white font-black text-4xl xl:text-[2.75rem] uppercase leading-[1.15] tracking-tight mb-6">
          Find Your<br />
          <span class="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 via-white to-blue-300">Home Away</span><br />
          From Home.
        </h1>

        <p class="text-blue-100/80 text-sm leading-relaxed font-normal mb-10 max-w-md">
          Connecting Camarines Sur Polytechnic Colleges students with official SASO-accredited boarding houses and verified property owners.
        </p>

        <!-- Vertical High-End Highlight List (Clean, Boxless, Icon-Driven) -->
        <div class="space-y-4">
          <div class="flex items-start gap-3.5 group">
            <div class="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 flex-shrink-0 mt-0.5">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <p class="text-white text-xs font-bold tracking-wide">SASO Accredited Accommodations</p>
              <p class="text-blue-200/60 text-[11px] font-medium mt-0.5">Inspected properties meeting college safety standards</p>
            </div>
          </div>

          <div class="flex items-start gap-3.5 group">
            <div class="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 flex-shrink-0 mt-0.5">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457-.312-2.841-.873-4.084" />
              </svg>
            </div>
            <div>
              <p class="text-white text-xs font-bold tracking-wide">Unified Google Institutional SSO</p>
              <p class="text-blue-200/60 text-[11px] font-medium mt-0.5">Instant sign-in for @my.cspc.edu.ph & @cspc.edu.ph</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Note -->
      <div class="relative z-10 flex flex-wrap items-center justify-between text-blue-300/60 text-[11px] font-semibold border-t border-white/10 pt-6 gap-2">
        <span>Camarines Sur Polytechnic Colleges &bull; SASO</span>
        <span class="text-blue-200/80 font-bold uppercase tracking-wider text-[10px]">Developed by <strong class="text-white">TEAM DABINUSHKA</strong></span>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════
         RIGHT PANEL — Unified Login Interface
    ═══════════════════════════════════════════════ -->
    <div class="flex-1 flex flex-col justify-center items-center bg-slate-50 dark:bg-slate-900 p-6 sm:p-10 md:p-14 min-h-screen">

      <!-- Mobile Branding Header -->
      <div class="lg:hidden flex flex-col items-center mb-8 text-center">
        <a href="/" class="inline-flex flex-col items-center gap-2 mb-2">
          <img src="/img/CSPC_logo.png" alt="CSPC" class="w-14 h-14 object-contain drop-shadow-md" />
          <span class="text-[#1e4a8d] dark:text-blue-400 font-black text-sm uppercase tracking-[0.25em]">CSPC Boarding House</span>
        </a>
        <p class="text-slate-400 text-xs font-medium">SASO Official Student & Owner Portal</p>
      </div>

      <!-- Main Login Card Container -->
      <div class="w-full max-w-md bg-white dark:bg-slate-800/90 rounded-3xl p-8 sm:p-10 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200/70 dark:border-slate-700/80 transition-all duration-300">

        <!-- Title Header -->
        <div class="mb-8 text-left">
          <h2 class="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
            Sign In
          </h2>
          <p class="text-slate-400 dark:text-slate-400 text-xs sm:text-sm font-medium mt-1">
            Access your CSPC Boarding House account.
          </p>
        </div>

        <!-- System Error / Success Alerts -->
        <transition name="fade">
          <div :key="errorShakeKey" v-if="errorMsg" class="animate-shake flex items-start gap-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs p-4 rounded-2xl mb-6 border border-red-100 dark:border-red-900/50 shadow-sm">
            <svg class="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
            </svg>
            <span class="leading-relaxed font-medium">{{ errorMsg }}</span>
          </div>
        </transition>

        <transition name="fade">
          <div v-if="successMsg" class="flex items-start gap-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs p-4 rounded-2xl mb-6 border border-emerald-100 dark:border-emerald-900/50 shadow-sm">
            <svg class="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            <span class="leading-relaxed font-medium">{{ successMsg }}</span>
          </div>
        </transition>

        <!-- ═══════════════════════════════════════════════
             1. GOOGLE OAUTH BUTTON (STUDENTS, STAFF, GMAIL OWNERS)
        ═══════════════════════════════════════════════ -->
        <div class="mb-6">
          <button
            @click="handleGoogleLogin"
            :disabled="isGoogleLoading"
            class="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-white font-bold text-xs sm:text-sm py-3.5 px-4 rounded-2xl border border-slate-200 dark:border-slate-600 shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed group cursor-pointer"
          >
            <span class="flex-shrink-0">
              <svg v-if="isGoogleLoading" class="animate-spin w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <svg v-else class="w-5 h-5" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
            </span>
            <span class="uppercase tracking-wider font-extrabold text-[12px]">
              {{ isGoogleLoading ? 'Connecting to Google...' : 'Continue with Google' }}
            </span>
          </button>
          <p class="text-[10px] text-slate-400 dark:text-slate-400 font-medium text-center mt-2.5">
            For Students, Staff, or Owners signing in via Google
          </p>
        </div>

        <!-- Elegant Divider -->
        <div class="relative my-6 text-center">
          <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-200 dark:border-slate-700"></div></div>
          <span class="relative bg-white dark:bg-slate-800 px-3 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">OR LOG IN WITH PASSWORD</span>
        </div>

        <!-- ═══════════════════════════════════════════════
             2. EMAIL + PASSWORD LOGIN FORM (ADMIN & EMAIL OWNERS)
        ═══════════════════════════════════════════════ -->
        <form @submit.prevent="handleLogin" class="space-y-4 text-left" novalidate>
          <!-- Email Input -->
          <div>
            <label class="block text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest mb-1.5">
              Email Address
            </label>
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
              </div>
              <input
                v-model="email"
                type="email"
                placeholder="admin@cspc.edu.ph or owner@example.com"
                autocomplete="email"
                class="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-2xl pl-10 pr-4 py-3 text-xs sm:text-sm font-semibold text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1e4a8d]/20 focus:border-[#1e4a8d] dark:focus:border-blue-400 transition"
              />
            </div>

            <!-- Dynamic Institutional Email Helper Badge -->
            <transition name="fade">
              <div v-if="isInstitutionalEmail" class="mt-2 text-[11px] bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 p-2.5 rounded-xl flex items-center gap-2">
                <svg class="w-4 h-4 flex-shrink-0 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span class="leading-tight">Students & Staff with Google accounts use <strong>"Continue with Google"</strong> above.</span>
              </div>
            </transition>
          </div>

          <!-- Password Input -->
          <div>
            <label class="block text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest mb-1.5">
              Password
            </label>
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <input
                v-model="password"
                :type="showPass ? 'text' : 'password'"
                placeholder="••••••••"
                autocomplete="current-password"
                class="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-2xl pl-10 pr-11 py-3 text-xs sm:text-sm font-semibold text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1e4a8d]/20 focus:border-[#1e4a8d] dark:focus:border-blue-400 transition"
              />
              <button
                type="button"
                @click="showPass = !showPass"
                class="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                tabindex="-1"
                aria-label="Toggle password visibility"
              >
                <svg v-if="!showPass" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.956 9.956 0 012.293-3.95M9.88 9.88a3 3 0 104.24 4.24M3 3l18 18" />
                </svg>
              </button>
            </div>
          </div>

          <!-- reCAPTCHA v2 widget — only for email/password login -->
          <div v-if="recaptchaEnabled" class="flex justify-center">
            <div id="recaptcha-container"></div>
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="isLoading || (recaptchaEnabled && !recaptchaToken)"
            class="w-full bg-gradient-to-r from-[#1e4a8d] to-[#163870] hover:from-[#163870] hover:to-[#0f2a56] active:scale-[0.98] text-white font-extrabold py-3.5 px-4 rounded-2xl transition-all duration-200 shadow-md shadow-[#1e4a8d]/20 uppercase text-xs tracking-widest disabled:opacity-50 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-2 cursor-pointer"
          >
            <svg v-if="isLoading" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>{{ isLoading ? 'Signing in...' : 'Sign In' }}</span>
          </button>
        </form>

        <!-- ═══════════════════════════════════════════════
             3. STREAMLINED BOTTOM FOOTER LINKS
        ═══════════════════════════════════════════════ -->
        <div class="mt-8 pt-6 border-t border-slate-100 dark:border-slate-700/80 flex flex-col items-center gap-4">
          <div class="w-full flex items-center justify-between text-xs font-bold">
            <router-link
              to="/register"
              class="text-[#1e4a8d] dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              <span>Register Your Property</span>
              <span>→</span>
            </router-link>

            <router-link
              to="/student/dashboard?guest=true"
              class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
            >
              Browse as Guest
            </router-link>
          </div>

          <button
            type="button"
            @click="showPrivacyModal = true"
            class="inline-flex items-center gap-2 text-[10px] font-bold text-amber-700 dark:text-amber-300 hover:text-amber-900 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 border border-amber-200/80 dark:border-amber-700/50 px-4 py-2 rounded-full transition-colors uppercase tracking-wider focus:outline-none cursor-pointer"
          >
            <i class="fa-solid fa-shield-halved text-amber-600 dark:text-amber-400"></i>
            <span>Data Privacy Policy (RA 10173)</span>
          </button>
        </div>

      </div>
    </div>

    <!-- Data Privacy Consent Modal -->
    <PrivacyPolicyModal :isOpen="showPrivacyModal" @close="showPrivacyModal = false" @accept="handlePrivacyAccepted" />
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-6px); }
  40%, 80% { transform: translateX(6px); }
}
.animate-shake {
  animation: shake 0.4s ease-in-out;
}
</style>

