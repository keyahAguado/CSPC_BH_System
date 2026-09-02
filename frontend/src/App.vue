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

const verifySessionOrEvict = () => {
  const token = localStorage.getItem('cspc_token');
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
});
</script>