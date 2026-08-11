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

      // 2. Perform Dynamic Redirection based on Role
      if (user.role === 'admin') {
        router.push('/admin/dashboard');
      } 
      else if (user.role === 'owner') {
        // Redirection based on boarding house status (none, pending, accredited, rejected)
        if (user.houseStatus === 'none') {
          router.push('/owner/accreditation');
        } else if (user.houseStatus === 'pending') {
          router.push('/owner/pending-review');
        } else {
          router.push('/owner/dashboard');
        }
      } 
      else if (user.role === 'student') {
        // Enforce Profile Completion check (from your legacy EJS logic)
        if (!user.student_id || !user.course || !user.year_section) {
          router.push('/student/profile'); // Profile setup required
        } else {
          router.push('/student/dashboard'); // Ready to browse/book
        }
      } 
      else {
        router.push('/');
      }

    } catch (err) {
      console.error('Failed to parse Google user payload:', err);
      router.push('/login?error=invalid_payload');
    }
  } else {
    router.push('/login?error=no_token');
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