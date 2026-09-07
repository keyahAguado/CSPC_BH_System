<template>
  <!-- router-view dynamically loads HomeView, Login, or Register depending on the URL -->
  <router-view />
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';

const router = useRouter();
const route = useRoute();

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/login-options',
  '/register',
  '/register/owner-details',
  '/auth-success'
];

// ── Idle session auto-logout ──
// Logs the user out after a period of no interaction, independent of the
// JWT's own 7-day expiry (which only guards against an old token being
// reused, not against an unattended logged-in device/browser).
const IDLE_LIMIT_MS = 30 * 60 * 1000; // 30 minutes
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
let idleTimer = null;

const isAuthenticated = () => !!sessionStorage.getItem('cspc_token');

const handleIdleTimeout = () => {
  if (!isAuthenticated()) return;
  console.warn('[SESSION] Idle timeout reached. Logging out.');
  sessionStorage.clear();
  window.location.href = '/login?error=idle_timeout';
};

const resetIdleTimer = () => {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (!isAuthenticated()) return; // nothing to guard for a guest
  idleTimer = setTimeout(handleIdleTimeout, IDLE_LIMIT_MS);
};

const verifySessionOrEvict = () => {
  const token = sessionStorage.getItem('cspc_token');
  const isPublic = (route.meta && route.meta.public) || PUBLIC_PATHS.includes(route.path) || route.path === '/student/dashboard' || route.path.startsWith('/student/house/');

  // If the token is missing and we are on a protected route, evict immediately
  if (!token && !isPublic && route.path !== '/login' && route.path !== '/') {
    console.warn('[SECURITY GUARD] Unauthorized session cache restoration detected. Evicting to login.');
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/login?error=session_expired';
  }
};

const handlePageShow = (event) => {
  // Modern, non-deprecated Back-Forward Cache (BFCache) detection
  const navigationEntries = performance.getEntriesByType && performance.getEntriesByType('navigation');
  const isBackForwardType = navigationEntries && navigationEntries.length > 0 && navigationEntries[0].type === 'back_forward';
  
  const isBFCacheLoad = event.persisted || isBackForwardType;

  if (isBFCacheLoad) {
    verifySessionOrEvict();
  }
};

onMounted(() => {
  // 1. Run session verification on initial component mount
  verifySessionOrEvict();

  // 2. Event listeners for cache eviction and popstate/focus
  window.addEventListener('pageshow', handlePageShow);
  window.addEventListener('popstate', verifySessionOrEvict);
  window.addEventListener('focus', verifySessionOrEvict);

  // 3. Idle-timeout arming: start the timer now (covers an already-open
  // session), on every user interaction (resets it), and on every route
  // change (covers the moment a user just logged in, since login navigates
  // via router.push without a full page reload).
  resetIdleTimer();
  ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, resetIdleTimer, { passive: true }));
  router.afterEach(() => resetIdleTimer());

  // Dynamically inject the FontAwesome stylesheet on runtime
  if (!document.getElementById('font-awesome-cdn')) {
    const link = document.createElement('link');
    link.id = 'font-awesome-cdn';
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    link.crossOrigin = 'anonymous';
    link.referrerPolicy = 'no-referrer';
    document.head.appendChild(link);
  }
});

onUnmounted(() => {
  window.removeEventListener('pageshow', handlePageShow);
  window.removeEventListener('popstate', verifySessionOrEvict);
  window.removeEventListener('focus', verifySessionOrEvict);
  ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, resetIdleTimer));
  if (idleTimer) clearTimeout(idleTimer);
});
</script>