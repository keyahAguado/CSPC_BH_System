<script setup>
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';

const route = useRoute();
const router = useRouter();

onMounted(async () => {
  const code = route.query.code;

  if (!code) {
    router.replace('/login?error=no_token');
    return;
  }

  try {
    // Exchange the one-time code for the real token/user payload.
    // Keeps the JWT out of the URL (browser history, server logs, Referer).
    const { data } = await axios.post('/api/auth/exchange', { code });
    const { token, user } = data;

    // 1. Save standard session variables
    sessionStorage.setItem('cspc_token', token);
    sessionStorage.setItem('user_role', user.role || '');
    sessionStorage.setItem('cspc_user', JSON.stringify(user));

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

    // Use router.replace() to overwrite Google OAuth history entries
    router.replace(targetPath);

  } catch (err) {
    console.error('Failed to exchange Google auth code:', err);
    router.replace('/login?error=invalid_payload');
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