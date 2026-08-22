<script setup>
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

onMounted(() => {
  const token = route.query.token;
  const userString = route.query.user;

  if (token && userString) {
    try {
      const user = JSON.parse(decodeURIComponent(userString));

      // 1. Save standard session variables
      localStorage.setItem('cspc_token', token);
      localStorage.setItem('cspc_user', JSON.stringify(user));

      // Determine target path
      let targetPath = '/';
      if (user.role === 'admin') {
        targetPath = '/admin/dashboard';
      } 
      else if (user.role === 'owner') {
        if (user.houseStatus === 'none') {
          targetPath = '/owner/accreditation';
        } else if (user.houseStatus === 'pending') {
          targetPath = '/owner/pending-review';
        } else {
          targetPath = '/owner/dashboard';
        }
      } 
      else if (user.role === 'student') {
        if (!user.student_id || !user.course || !user.year_section) {
          targetPath = '/student/profile';
        } else {
          targetPath = '/student/dashboard';
        }
      }

      // Hard redirect ensures PWA / iOS WebApp initializes clean session state without manual refresh
      window.location.href = targetPath;

    } catch (err) {
      console.error('Failed to parse Google user payload:', err);
      window.location.href = '/login?error=invalid_payload';
    }
  } else {
    window.location.href = '/login?error=no_token';
  }
});
</script>

<template>
  <div class="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
    <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-4"></div>
    <h2 class="text-lg font-black text-slate-900 uppercase tracking-tight">Authenticating with Google...</h2>
    <p class="text-sm text-slate-500 mt-1">Please wait while we establish your secure session.</p>
  </div>
</template>