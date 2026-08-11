<template>
  <!-- router-view dynamically loads HomeView, Login, or Register depending on the URL -->
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue';

onMounted(() => {
  // Dynamically inject the FontAwesome stylesheet on runtime
  if (!document.getElementById('font-awesome-cdn')) {
    const link = document.createElement('link');
    link.id = 'font-awesome-cdn';
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    link.crossOrigin = 'anonymous';
    link.referrerPolicy = 'no-referrer';
    document.head.appendChild(link);
    console.log('[DEBUG] FontAwesome 6 CDN Programmatically Loaded Successfully.');
  }
});
</script>