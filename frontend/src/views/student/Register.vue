<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import Header from '../../components/partials/Header.vue';

const router = useRouter();

const name = ref('');
const phone = ref('');
const address = ref('');
const email = ref('');
const password = ref('');

const showPassword = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const isLoading = ref(false);

const handleRegister = async () => {
  if (!name.value || !phone.value || !address.value || !email.value || !password.value) {
    errorMessage.value = 'Please fill in all mandatory fields.';
    return;
  }

  const cleanEmail = email.value.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    errorMessage.value = 'Please enter a valid email address (e.g. name@gmail.com).';
    return;
  }

  errorMessage.value = '';
  successMessage.value = '';
  isLoading.value = true;

  try {
    const response = await axios.post('/api/auth/register/owner', {
      name: name.value,
      phone: phone.value,
      address: address.value,
      email: cleanEmail,
      password: password.value
    });

    if (response.data.success) {
      const { token, user } = response.data;
      localStorage.setItem('cspc_token', token);
      localStorage.setItem('cspc_user', JSON.stringify(user));
      successMessage.value = 'Registration successful! Redirecting to accreditation...';

      setTimeout(() => {
        router.push('/owner/accreditation');
      }, 1200);
    }
  } catch (error) {
    console.error('Registration failed:', error);
    errorMessage.value = error.response?.data?.message || 'Registration failed. Please check your data.';
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-blue-50 font-sans">
    <Header />

    <main class="min-h-[85vh] flex items-center justify-center p-6 bg-blue-50">
      <div class="bg-white rounded-3xl shadow-xl p-10 max-w-lg w-full relative border border-slate-100">
        <router-link to="/login" class="absolute top-8 right-8 text-blue-900 font-bold text-xl hover:opacity-75 transition">&lt;</router-link>

        <h1 class="text-3xl font-black text-center mb-8 text-blue-900 uppercase tracking-tight">
          OWNER REGISTRATION
        </h1>

        <!-- Local Alerts -->
        <div v-if="errorMessage" class="bg-red-50 text-red-600 text-xs p-3 rounded-xl mb-4 border border-red-100 text-left">
          {{ errorMessage }}
        </div>
        <div v-if="successMessage" class="bg-green-50 text-green-600 text-xs p-3 rounded-xl mb-4 border border-green-100 text-left">
          {{ successMessage }}
        </div>

        <form @submit.prevent="handleRegister" class="space-y-4 text-left">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">Full Name</label>
              <input v-model="name" type="text" class="w-full border border-slate-200 p-2.5 rounded-lg text-sm focus:border-blue-500 outline-none font-medium" placeholder="John Doe" required />
            </div>
            <div>
              <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">Phone Number</label>
              <input v-model="phone" type="text" class="w-full border border-slate-200 p-2.5 rounded-lg text-sm focus:border-blue-500 outline-none font-medium" placeholder="0912 345 6789" required />
            </div>
          </div>

          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">Address</label>
            <textarea v-model="address" class="w-full border border-slate-200 p-2.5 rounded-lg text-sm focus:border-blue-500 outline-none font-medium h-20" placeholder="Zone 1, Nabua, Camarines Sur" required></textarea>
          </div>

          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">Contact Email</label>
            <input v-model="email" type="email" class="w-full border border-slate-200 p-2.5 rounded-lg text-sm focus:border-blue-500 outline-none font-medium" placeholder="owner@example.com" required />
          </div>

          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">Create Password</label>
            <div class="relative">
              <input v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="Min. 8 characters" class="w-full border border-slate-200 p-2.5 pr-10 rounded-lg text-sm focus:border-blue-500 outline-none font-medium" required />
              <button type="button" @click="showPassword = !showPassword" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition cursor-pointer">
                <i :class="showPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"></i>
              </button>
            </div>
          </div>

          <div class="flex justify-center pt-6">
            <button type="submit" :disabled="isLoading" class="w-full bg-[#1e4a8d] hover:bg-black text-white font-black py-4 rounded-xl transition shadow-lg uppercase text-xs tracking-widest disabled:opacity-50">
              {{ isLoading ? 'Creating Account...' : 'Create Account' }}
            </button>
          </div>
        </form>

        <p class="text-center mt-6 text-slate-500 text-xs font-bold uppercase tracking-wide">
          Already registered? <router-link to="/login" class="text-blue-600 underline font-semibold">Log in here</router-link>
        </p>
      </div>
    </main>
  </div>
</template>


