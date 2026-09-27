<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

const router = useRouter();
const token = sessionStorage.getItem('cspc_token');

// Reactive states
const currentUser = ref(JSON.parse(sessionStorage.getItem('cspc_user') || '{}'));
const myProperties = ref([]);
const houseName = ref('Your Boarding House');
const houseId = ref(null);
const submittedCount = ref(0);
const isLoading = ref(true);

const fetchMyProperty = async () => {
  try {
    const res = await axios.get(`/api/boarding-houses/my-property`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.data.success) {
      if (res.data.hasProperty) {
        myProperties.value = res.data.properties || [res.data.data];
        const primaryHouse = res.data.data;
        houseName.value = primaryHouse.name;
        houseId.value = primaryHouse.id;

        const hasAccredited = myProperties.value.some(h => h.house_status === 'accredited');
        const freshStatus = hasAccredited ? 'accredited' : primaryHouse.house_status;

        // Self-healing session synchronizer
        if (currentUser.value.houseStatus !== freshStatus) {
          currentUser.value.houseStatus = freshStatus;
          sessionStorage.setItem('cspc_user', JSON.stringify(currentUser.value));
        }

        // Calculate submitted count for primary house
        const permitsKeys = [
          'permit_business_form', 'permit_cedula', 'permit_dti', 'permit_barangay',
          'permit_building', 'permit_zoning', 'permit_sanitary', 'permit_fire'
        ];
        let count = 0;
        permitsKeys.forEach(key => {
          if (primaryHouse[key]) count++;
        });
        submittedCount.value = count;
      } else {
        currentUser.value.houseStatus = 'none';
        sessionStorage.setItem('cspc_user', JSON.stringify(currentUser.value));
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
  sessionStorage.removeItem('cspc_token');
  sessionStorage.removeItem('cspc_user');
  router.push('/login-options');
};

onMounted(fetchMyProperty);
</script>

<template>
  <div class="bg-[#eef6ff] min-h-screen flex items-center justify-center p-6 font-sans">
    
    <!-- Loader -->
    <div v-if="isLoading" class="max-w-5xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-12 text-center flex flex-col items-center justify-center">
      <svg class="animate-spin h-10 w-10 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <p class="text-slate-400 font-bold uppercase text-[9px] tracking-widest">Loading application records...</p>
    </div>

    <div v-else class="max-w-5xl w-full text-center animate-fade-in py-8">
      <!-- Animated Icon Header -->
      <div class="relative w-28 h-28 mx-auto mb-8">
        <div class="absolute inset-0 bg-blue-500/20 rounded-full animate-ping"></div>
        <div class="relative w-28 h-28 bg-white rounded-full flex items-center justify-center shadow-xl border-4 border-blue-100">
          <i class="fa-solid fa-file-shield text-3xl text-blue-600"></i>
        </div>
      </div>

      <h1 class="text-3xl font-black text-slate-900 uppercase tracking-tight mb-3">Application Under Review</h1>
      <p class="text-slate-500 font-medium text-sm leading-relaxed mb-8 px-4">
        Hello, <span class="text-blue-600 font-bold">{{ currentUser.name }}</span>! Below are your registered boarding house applications and their current accreditation status with the SASO Admin team.
      </p>

      <!-- Multi-Property Applications List -->
      <div class="space-y-4 mb-8 text-left">
        <div 
          v-for="house in myProperties" 
          :key="house.id" 
          class="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 hover:border-blue-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6"
        >
          <div class="space-y-2 flex-1">
            <div class="flex items-center gap-3 flex-wrap">
              <h3 class="text-lg font-black text-slate-900">{{ house.name }}</h3>
              <span 
                class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider"
                :class="house.house_status === 'accredited' ? 'bg-green-100 text-green-700 border border-green-200' : house.house_status === 'rejected' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-amber-100 text-amber-700 border border-amber-200'"
              >
                {{ house.house_status === 'accredited' ? 'Accredited' : house.house_status === 'rejected' ? 'Needs Revision' : 'Pending Review' }}
              </span>
            </div>

            <p class="text-xs text-slate-500 font-medium flex items-center gap-2">
              <i class="fa-solid fa-location-dot text-slate-400"></i>
              {{ [house.barangay ? `Brgy. ${house.barangay}` : null, 'Nabua', 'Camarines Sur'].filter(Boolean).join(', ') }}
            </p>

            <div v-if="house.admin_comments" class="bg-red-50 border border-red-200 rounded-xl p-3 text-[11px] text-red-700 font-medium mt-2">
              <span class="font-bold uppercase tracking-wider block text-[9px] text-red-800 mb-0.5">Admin Feedback:</span>
              {{ house.admin_comments }}
            </div>
          </div>

          <!-- Actions per Property -->
          <div class="flex items-center gap-3 shrink-0 flex-wrap">
            <router-link 
              :to="`/owner/accreditation?houseId=${house.id}`" 
              class="bg-blue-600 hover:bg-black text-white px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all active:scale-95 shadow-sm flex items-center gap-1.5"
            >
              <i class="fa-solid fa-pen-to-square"></i> Edit Application
            </router-link>

            <router-link 
              :to="`/owner/documents/${house.id}`" 
              class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all active:scale-95 shadow-sm flex items-center gap-1.5"
            >
              <i class="fa-solid fa-folder-open"></i> Documents
            </router-link>
          </div>
        </div>
      </div>

      <!-- General Bottom Actions -->
      <div class="flex flex-col sm:flex-row gap-4 justify-center">
        <button 
          @click="handleLogout" 
          class="bg-slate-200 hover:bg-slate-300 text-slate-700 px-8 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 shadow-sm"
        >
          Logout
        </button>

        <router-link 
          to="/owner/accreditation?new=true" 
          class="bg-slate-900 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 shadow-md flex items-center justify-center gap-2"
        >
          <i class="fa-solid fa-plus text-sm"></i>
          Register Another Property
        </router-link>
      </div>

      <p class="mt-10 text-[11px] text-slate-400 font-bold uppercase tracking-[0.2em]">
        CSPC'S BOARDING HOUSE SELECTION SYSTEM &bull; SASO COMPLIANCE
      </p>
    </div>
  </div>
</template>