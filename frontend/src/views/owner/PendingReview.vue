<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

const router = useRouter();
const token = localStorage.getItem('cspc_token');
const API = import.meta.env.VITE_API_URL;

// Reactive states
const currentUser = ref(JSON.parse(localStorage.getItem('cspc_user') || '{}'));
const houseName = ref('Your Boarding House');
const houseId = ref(null);
const submittedCount = ref(0);
const isLoading = ref(true);

const fetchMyProperty = async () => {
  try {
    // Call secure backend endpoint to fetch live property data
    const res = await axios.get(`/api/boarding-houses/my-property`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.data.success) {
      if (res.data.hasProperty) {
        const house = res.data.data;
        houseName.value = house.name;
        houseId.value = house.id;

        const freshStatus = house.house_status;

        // ─── SELF-HEALING SESSION SYNCHRONIZER ───
        // Updates localStorage dynamically to prevent routing desyncs
        if (currentUser.value.houseStatus !== freshStatus) {
          currentUser.value.houseStatus = freshStatus;
          localStorage.setItem('cspc_user', JSON.stringify(currentUser.value));
        }

        // Dynamically redirect owner to the correct view if status is no longer pending
        if (freshStatus === 'rejected') {
          router.push('/owner/documents');
          return;
        } else if (freshStatus === 'accredited') {
          router.push('/owner/dashboard');
          return;
        }

        // Calculate how many permits out of the 8 are actually uploaded
        const permitsKeys = [
          'permit_business_form', 'permit_cedula', 'permit_dti', 'permit_barangay',
          'permit_building', 'permit_zoning', 'permit_sanitary', 'permit_fire'
        ];
        
        let count = 0;
        permitsKeys.forEach(key => {
          if (house[key]) count++;
        });
        submittedCount.value = count;

      } else {
        // If they have no property registered at all, reset status and send to accreditation form
        currentUser.value.houseStatus = 'none';
        localStorage.setItem('cspc_user', JSON.stringify(currentUser.value));
        router.push('/owner/accreditation');
      }
    }
  } catch (err) {
    console.error('Failed to sync pending application status:', err);
  } finally {
    isLoading.value = false;
  }
};

const handleLogout = () => {
  localStorage.removeItem('cspc_token');
  localStorage.removeItem('cspc_user');
  router.push('/login-options');
};

onMounted(fetchMyProperty);
</script>

<template>
  <div class="bg-[#eef6ff] min-h-screen flex items-center justify-center p-6 font-sans">
    
    <!-- Main Loader state (PWA inline SVG Loader) -->
    <div v-if="isLoading" class="max-w-3xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-12 text-center flex flex-col items-center justify-center">
      <!-- SVG Spinner: Works offline, requires 0 CSS/font packages -->
      <svg class="animate-spin h-10 w-10 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <p class="text-slate-400 font-bold uppercase text-[9px] tracking-widest">Loading documents records...</p>
    </div>

    <div v-else class="max-w-2xl w-full text-center animate-fade-in">
      <!-- Animated Icon Container -->
      <div class="relative w-32 h-32 mx-auto mb-10">
        <div class="absolute inset-0 bg-blue-500/20 rounded-full animate-ping"></div>
        <div class="relative w-32 h-32 bg-white rounded-full flex items-center justify-center shadow-xl border-4 border-blue-100">
          <i class="fa-solid fa-file-shield text-4xl text-blue-600"></i>
        </div>
      </div>

      <h1 class="text-3xl font-black text-slate-900 uppercase tracking-tight mb-4">Application Under Review</h1>
      <p class="text-slate-500 font-medium text-lg leading-relaxed mb-10 px-4">
        Hello, <span class="text-blue-600 font-bold">{{ currentUser.name }}</span>! Your boarding house application for 
        <span class="text-slate-800 font-bold">"{{ houseName }}"</span> is currently being validated by our SASO Admin team.
      </p>

      <!-- Status Card -->
      <div class="bg-white rounded-3xl p-8 shadow-sm border border-white mb-10 text-left">
        <div class="flex items-start gap-4 mb-8">
          <div class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-check text-green-600"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900">Documents Submitted</h3>
            <!-- Dynamically displays exact uploaded count (e.g. 5 of 8, or 8 of 8) -->
            <p class="text-sm text-slate-500">We have received {{ submittedCount }} of 8 mandatory legal permits.</p>
          </div>
        </div>

        <div class="flex items-start gap-4 mb-8">
          <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <div>
            <h3 class="font-bold text-slate-900">Initial Validation</h3>
            <p class="text-sm text-slate-500">The Admin is currently cross-referencing your documents with LGU records.</p>
          </div>
        </div>

        <div class="flex items-start gap-4 grayscale opacity-40">
          <div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-certificate text-slate-400"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900">Accreditation Granted</h3>
            <p class="text-sm text-slate-500">Your property will appear on the student browsing list once approved.</p>
          </div>
        </div>
      </div>

      <div class="flex flex-col sm:flex-row gap-4 justify-center">
        <button 
          @click="handleLogout" 
          class="bg-slate-200 hover:bg-slate-300 text-slate-700 px-10 py-4 rounded-2xl font-black text-[12px] uppercase tracking-widest transition-all active:scale-95 shadow-sm"
        >
          Logout &amp; Wait
        </button>
        <router-link 
          v-if="houseId"
          :to="`/owner/documents/${houseId}`" 
          class="bg-blue-600 hover:bg-black text-white px-10 py-4 rounded-2xl font-black text-[12px] uppercase tracking-widest transition-all active:scale-95 shadow-md flex items-center justify-center gap-2"
        >
          <i class="fa-solid fa-eye text-sm"></i>
          View My Application
        </router-link>
      </div>

      <p class="mt-12 text-[11px] text-slate-400 font-bold uppercase tracking-[0.2em]">
        CSPC'S BOARDING HOUSE SELECTION SYSTEM &bull; SASO COMPLIANCE
      </p>
    </div>
  </div>
</template>