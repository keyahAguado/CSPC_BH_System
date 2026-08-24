<template>
  <!-- router-view dynamically loads HomeView, Login, or Register depending on the URL -->
  <router-view />
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';

const validateSecuritySession = () => {
  const token = localStorage.getItem('cspc_token');
  const rawUser = localStorage.getItem('cspc_user');
  let user = null;
  try {
    if (rawUser && rawUser !== 'undefined') user = JSON.parse(rawUser);
  } catch (e) {}

  const path = window.location.pathname;
  const isProtectedAdmin = path.startsWith('/admin');
  const isProtectedOwner = path.startsWith('/owner');
  const isProtectedStudent = path.startsWith('/student') && path !== '/student/dashboard' && !path.startsWith('/student/house/');

  if ((isProtectedAdmin || isProtectedOwner || isProtectedStudent) && (!token || !user || !user.role)) {
    console.warn('[SECURITY GUARD] Unauthorized session cache restoration detected. Redirecting to login.');
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace('/login-options');
  }
};

const handlePageShow = (event) => {
  // If page was restored from BFCache (back-forward cache) or swipe gesture
  if (event.persisted) {
    validateSecuritySession();
  }
};

onMounted(() => {
  validateSecuritySession();
  window.addEventListener('pageshow', handlePageShow);
  window.addEventListener('popstate', validateSecuritySession);
  window.addEventListener('focus', validateSecuritySession);

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
  window.removeEventListener('popstate', validateSecuritySession);
  window.removeEventListener('focus', validateSecuritySession);
});
</script>