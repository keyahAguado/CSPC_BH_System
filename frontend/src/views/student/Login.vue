<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import Header from '../../components/partials/Header.vue';

const router = useRouter();

const email = ref('');
const password = ref('');
const errorMessage = ref('');
const successMessage = ref('');
const isLoading = ref(false);

const handleLogin = async () => {
  if (!email.value || !password.value) {
    errorMessage.value = 'Please enter both email and password.';
    return;
  }
  errorMessage.value = '';
  successMessage.value = '';
  isLoading.value = true;

  try {
    const response = await axios.post('/api/auth/login', {
      email: email.value,
      password: password.value
    });

    if (response.data.success) {
      const { token, user } = response.data;
      localStorage.setItem('cspc_token', token);
      localStorage.setItem('cspc_user', JSON.stringify(user));
      successMessage.value = 'Login successful! Redirecting...';

      setTimeout(() => {
        if (user.role === 'admin') {
          router.push('/admin/dashboard');

        } else if (user.role === 'owner') {
          const houseStatus = user.houseStatus || 'none';
          if (houseStatus === 'accredited') {
            router.push('/owner/dashboard');
          } else if (houseStatus === 'pending') {
            router.push('/owner/pending-review');
          } else if (houseStatus === 'rejected') {
            router.push('/owner/accreditation');
          } else {
            router.push('/owner/accreditation');
          }

        } else if (user.role === 'student') {
          // Unified First-Timer Validation Checks (student_id, course, year_section)
          const isFirstTimer = !user.student_id || !user.course || !user.year_section;
          
          if (isFirstTimer) {
            router.push('/student/profile');
          } else {
            router.push('/student/dashboard');
          }

        } else {
          router.push('/');
        }
      }, 1000);
    }
  } catch (error) {
    console.error('Login failed:', error);
    errorMessage.value = error.response?.data?.message || 'Incorrect credentials. Please try again.';
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-slate-50 font-sans">
    <Header />

    <main class="min-h-[85vh] flex items-center justify-center p-6">
      <div class="bg-white rounded-3xl shadow-xl p-12 max-w-md w-full relative border border-slate-100">
        <a href="/login-options" class="absolute top-8 right-8 text-blue-900 font-bold text-xl">&lt;</a>

        <h1 class="text-4xl font-bold text-center mb-10 text-gray-900 tracking-tight">LOGIN</h1>

        <!-- Local Alerts -->
        <div v-if="errorMessage" class="bg-red-50 text-red-600 text-xs p-3 rounded-xl mb-4 border border-red-100 text-left">
          {{ errorMessage }}
        </div>
        <div v-if="successMessage" class="bg-green-50 text-green-600 text-xs p-3 rounded-xl mb-4 border border-green-100 text-left">
          {{ successMessage }}
        </div>

        <form @submit.prevent="handleLogin" class="space-y-6 text-left">
          <div>
            <label class="block text-sm font-bold mb-2">Email</label>
            <input v-model="email" type="email" placeholder="Enter email" class="w-full border-2 border-gray-800 p-2 rounded focus:outline-none focus:border-blue-500 text-sm font-medium" required />
          </div>

          <div>
            <label class="block text-sm font-bold mb-2">Password</label>
            <input v-model="password" type="password" placeholder="••••••••" class="w-full border-2 border-gray-800 p-2 rounded focus:outline-none focus:border-blue-500 text-sm font-medium" required />
          </div>

          <div class="flex justify-center pt-4">
            <button type="submit" :disabled="isLoading" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2.5 px-10 rounded-lg transition shadow-md focus:outline-none w-full uppercase text-xs tracking-widest disabled:opacity-50">
              {{ isLoading ? 'Logging in...' : 'Login' }}
            </button>
          </div>
        </form>

        <p class="text-center mt-8 text-gray-600 text-sm">
          Don't have an account? <a href="/register" class="text-blue-600 underline font-semibold">Sign up</a>
        </p>
      </div>
    </main>
  </div>
</template>
