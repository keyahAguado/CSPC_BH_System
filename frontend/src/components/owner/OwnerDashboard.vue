<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';

import { getImageUrl } from '../../config/api';

// States
const user = ref('');
const houses = ref([]);
const stats = ref({
  totalListings: 0,
  pendingBookings: 0
});
const unreadNotifCount = ref(0);
const isLoading = ref(true);
const alerts = ref([]);

// Retrieve stateless JWT token and user info
const token = localStorage.getItem('cspc_token');
const savedUser = localStorage.getItem('cspc_user');

// Show notification system alert
const showSystemAlert = (message, type = 'error') => {
  const id = 'alert-' + Date.now();
  const configs = {
    success: { borderClass: 'border-emerald-500', iconClass: 'fa-circle-check', iconColorClass: 'text-emerald-500', title: 'Action Successful' },
    error: { borderClass: 'border-slate-800', iconClass: 'fa-circle-info', iconColorClass: 'text-slate-600', title: 'System Notice' },
    warning: { borderClass: 'border-amber-500', iconClass: 'fa-triangle-exclamation', iconColorClass: 'text-amber-500', title: 'Attention Required' },
    info: { borderClass: 'border-blue-500', iconClass: 'fa-circle-info', iconColorClass: 'text-blue-500', title: 'Information' }
  };

  const config = configs[type] || configs.error;
  const newAlert = { id, message, type, ...config };
  
  alerts.value.push(newAlert);

  // Auto remove after 7 seconds
  setTimeout(() => {
    closeAlert(id);
  }, 7000);
};

const closeAlert = (id) => {
  alerts.value = alerts.value.filter(a => a.id !== id);
};

// Fetch Owner Dashboard Data
const fetchDashboardData = async () => {
  if (!token) {
    showSystemAlert('You are not logged in. Please log in first.', 'error');
    isLoading.value = false;
    return;
  }

  try {
    isLoading.value = true;
    const response = await axios.get('/api/owner/dashboard', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      houses.value = response.data.houses || [];
      stats.value = response.data.stats || { totalListings: 0, pendingBookings: 0 };
      unreadNotifCount.value = response.data.unreadNotifCount || 0;
      user.value = response.data.user || (savedUser ? JSON.parse(savedUser).name : 'Owner');
    }
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
    showSystemAlert(error.response?.data?.message || 'Could not load your dashboard. Connecting to backend...', 'warning');
    
    // Fallback stub data to keep visual UI pristine if API is starting up
    if (savedUser) {
      user.value = JSON.parse(savedUser).name;
    }
  } finally {
    isLoading.value = false;
  }
};

// Confirmation States
const showConfirmModal = ref(false);
const confirmTitle = ref('');
const confirmMessage = ref('');
const confirmAction = ref(null);

const triggerConfirm = (title, message, action) => {
  confirmTitle.value = title;
  confirmMessage.value = message;
  confirmAction.value = action;
  showConfirmModal.value = true;
};

const executeConfirm = async () => {
  showConfirmModal.value = false;
  if (confirmAction.value) {
    await confirmAction.value();
    confirmAction.value = null;
  }
};

// Delete/Remove Boarding House
const removeHouse = (houseId) => {
  triggerConfirm(
    'Confirm Removal',
    'Are you sure you want to remove this boarding house? This action cannot be undone.',
    async () => {
      try {
        const response = await axios.delete(`/api/owner/boarding-houses/${houseId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data.success) {
          showSystemAlert('Boarding house removed successfully.', 'success');
          fetchDashboardData();
        }
      } catch (error) {
        console.error('Error removing boarding house:', error);
        showSystemAlert(error.response?.data?.message || 'Failed to remove the boarding house. Please try again.', 'error');
      }
    }
  );
};

// Handle logout
const handleLogout = () => {
  localStorage.removeItem('cspc_token');
  localStorage.removeItem('cspc_user');
  window.location.href = '/';
};

onMounted(() => {
  if (savedUser) {
    user.value = JSON.parse(savedUser).name;
  }
  fetchDashboardData();
  
  // Check if routed with onboarding success flag
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('onboarding') === 'success') {
    showSystemAlert('Application submitted successfully! SASO admin has been notified.', 'success');
  }
});
</script>

<template>
  <div class="bg-[#eef6ff] min-h-screen flex flex-col font-sans">
    
    <!-- Custom Owner Navigation Bar (Prstine Legacy Replicant) -->
    <nav class="bg-[#2a528a] px-10 py-5 flex justify-between items-center text-white shadow-md sticky top-0 z-50">
      <div class="flex items-center gap-3">
        <img src="/img/CSPC_logo.png" alt="Logo" width="36" height="36" class="object-contain">
        <span class="font-bold text-[13px] tracking-tight uppercase">CSPC'S BOARDING HOUSE SELECTION</span>
      </div>
      <div class="flex gap-10 text-[13px] font-semibold">
        <a href="/users/owner/dashboard" class="text-white hover:text-blue-200 transition">Home</a>
        <a href="/users/owner/bookings" class="hover:text-blue-200 transition">Bookings</a>
        <a href="/users/owner/profile" class="hover:text-blue-200 transition">Profile</a>
        <a href="/users/notifications" class="hover:text-blue-200 transition relative">
          Notification
          <span v-if="unreadNotifCount > 0" class="absolute -top-1 -right-3 bg-red-500 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center border border-white shadow-sm">
            {{ unreadNotifCount }}
          </span>
        </a>
        <button @click="handleLogout" class="hover:text-red-300 transition focus:outline-none">Logout</button>
      </div>
    </nav>

    <!-- Custom Alert Container -->
    <div class="fixed top-8 right-8 z-[9999] max-w-sm w-full px-4 pointer-events-none space-y-4">
      <div v-for="alert in alerts" :key="alert.id" 
           class="pointer-events-auto flex items-stretch bg-white border-l-4 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] rounded-r-xl transition-all duration-500 ease-out transform overflow-hidden" 
           :class="alert.borderClass">
        <div class="px-5 py-5 flex items-center justify-center bg-slate-50/50">
          <i class="fa-solid text-xl" :class="[alert.iconClass, alert.iconColorClass]"></i>
        </div>
        <div class="flex-1 p-5 pr-8 text-left">
          <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">{{ alert.title }}</h4>
          <p class="text-[13px] font-bold text-slate-700 leading-relaxed">{{ alert.message }}</p>
        </div>
        <button @click="closeAlert(alert.id)" class="absolute top-3 right-3 text-slate-300 hover:text-slate-900 transition-colors">
          <i class="fa-solid fa-xmark text-xs"></i>
        </button>
      </div>
    </div>

    <!-- Main Content -->
    <main class="flex-1 w-full max-w-7xl mx-auto px-6 lg:px-12 py-10 text-center">
      <!-- Header -->
      <h2 class="text-3xl font-black text-slate-900 mb-6 tracking-tight uppercase">Welcome, {{ user }}</h2>

      <!-- Loading State Indicator -->
      <div v-if="isLoading" class="py-20 flex flex-col items-center justify-center gap-3">
        <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p class="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Loading Dashboard data...</p>
      </div>

      <div v-else>
        <!-- Pending Bookings Alert -->
        <div v-if="stats.pendingBookings > 0" class="mb-10 animate-pulse">
          <a href="/users/owner/bookings" class="inline-flex items-center gap-4 bg-orange-500 text-white px-8 py-4 rounded-2xl shadow-lg shadow-orange-200 hover:bg-orange-600 transition-all group">
            <div class="bg-white/20 p-2 rounded-lg">
              <i class="fa-solid fa-bell text-xl"></i>
            </div>
            <div class="text-left">
              <p class="text-[10px] font-black uppercase tracking-widest opacity-80">Action Required</p>
              <p class="text-sm font-black uppercase">You have {{ stats.pendingBookings }} new booking request{{ stats.pendingBookings > 1 ? 's' : '' }}</p>
            </div>
            <i class="fa-solid fa-arrow-right ml-4 group-hover:translate-x-1 transition-transform"></i>
          </a>
        </div>

        <!-- Cards Container -->
        <div class="flex flex-wrap gap-8 mb-16 justify-center">
          
          <!-- Loop through owner boarding houses -->
          <div v-for="house in houses" :key="house.id" 
               class="bg-white rounded-2xl p-4 shadow-sm border border-white hover:shadow-md transition-all duration-300 w-full max-w-[400px] flex flex-col text-left">
            
            <div class="rounded-xl overflow-hidden mb-4 h-[220px] relative">
              <img :src="getImageUrl(house.img)" :alt="house.name"
                   class="w-full h-full object-cover grayscale-[10%] hover:grayscale-0 transition duration-500"
                   @error="e => e.target.src = '/img/cspc_bg.webp'">
              
              <!-- EXPIRED OVERLAY -->
              <div v-if="house.compliance === 'expired'" class="absolute inset-0 bg-red-600/60 backdrop-blur-sm flex items-center justify-center p-6 text-center">
                <div>
                  <i class="fa-solid fa-ban text-white text-3xl mb-2"></i>
                  <p class="text-white text-[11px] font-black uppercase tracking-widest leading-tight">HIDDEN FROM STUDENTS: PERMITS EXPIRED</p>
                </div>
              </div>
              
              <!-- REJECTED OVERLAY -->
              <div v-else-if="house.house_status === 'rejected'" class="absolute inset-0 bg-red-500/80 backdrop-blur-sm flex items-center justify-center p-6 text-center">
                <div class="flex flex-col items-center">
                  <i class="fa-solid fa-circle-xmark text-white text-3xl mb-3"></i>
                  <p class="text-white text-[11px] font-black uppercase tracking-widest leading-tight mb-4">REJECTED BY SASO: HIDDEN FROM STUDENTS</p>
                  <a :href="`/users/owner/accreditation?houseId=${house.id}`" class="bg-white text-red-600 text-[10px] font-black px-6 py-2.5 rounded-full uppercase tracking-widest shadow-xl hover:bg-slate-100 transition active:scale-95 text-center">
                    Fix & Resubmit
                  </a>
                </div>
              </div>

              <!-- STATUS BADGES -->
              <div class="absolute top-4 left-4 flex flex-col gap-2">
                <div v-if="house.house_status === 'pending'" class="bg-yellow-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-md">
                  Pending Approval
                </div>
                <div v-else-if="house.house_status === 'rejected'" class="bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-md">
                  Rejected
                </div>
                <div v-else-if="house.compliance === 'expired'" class="bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-md">
                  Suspended
                </div>
                <div v-else-if="house.compliance === 'warning'" class="bg-orange-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-md">
                  Warning: Renew Permits
                </div>
                <div v-else class="bg-green-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-md">
                  Accredited
                </div>
              </div>
            </div>

            <!-- Warning Callout Box -->
            <div v-if="house.compliance === 'warning'" class="bg-orange-50 border-l-4 border-orange-500 p-3 mb-4 rounded-r-lg">
              <div class="flex items-center gap-2">
                <i class="fa-solid fa-clock text-orange-600 text-[10px]"></i>
                <p class="text-[9px] font-black text-orange-700 uppercase tracking-widest">Action Required: Permits expiring soon!</p>
              </div>
            </div>

            <!-- Body Details -->
            <div class="mb-4 flex-1 px-1 text-left">
              <h2 class="font-black text-lg text-slate-900 leading-tight mb-1 uppercase tracking-tight">
                {{ house.name }}
              </h2>
              <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wide">{{ house.location }}</p>
            </div>

            <!-- Actions buttons panel -->
            <div class="mt-auto bg-slate-50 rounded-xl p-4 flex flex-wrap gap-2 justify-center items-center border border-slate-100">
              <a v-if="house.house_status === 'rejected'" :href="`/users/owner/accreditation?houseId=${house.id}`" 
                 class="bg-red-600 text-white text-[10px] font-black px-4 py-2 rounded-md uppercase tracking-widest transition shadow-sm hover:scale-[1.02] active:scale-[0.98] inline-flex items-center justify-center">
                Fix Application
              </a>
              <a v-else :href="`/users/owner/edit/${house.id}`" 
                 class="bg-orange-400 text-white text-[10px] font-black px-4 py-2 rounded-md uppercase tracking-widest transition shadow-sm hover:scale-[1.02] active:scale-[0.98] inline-flex items-center justify-center">
                Edit
              </a>
              <a :href="`/users/owner/documents/${house.id}`" 
                 class="bg-blue-500 text-white text-[10px] font-black px-4 py-2 rounded-md uppercase tracking-widest transition shadow-sm hover:scale-[1.02] active:scale-[0.98] inline-flex items-center justify-center">
                Docs
              </a>
              <a :href="`/users/owner/rooms/${house.id}`" 
                 class="relative bg-green-500 text-white text-[10px] font-black px-4 py-2 rounded-md uppercase tracking-widest transition shadow-sm hover:scale-[1.02] active:scale-[0.98] inline-flex items-center justify-center">
                Rooms
                <span v-if="house.pending_count > 0" class="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-sm animate-bounce">
                  {{ house.pending_count }}
                </span>
              </a>
              <button @click="removeHouse(house.id)" 
                      class="bg-slate-200 text-slate-500 text-[10px] font-black px-4 py-2 rounded-md uppercase tracking-widest transition shadow-sm hover:bg-red-500 hover:text-white">
                Remove
              </button>
            </div>
          </div>

          <!-- Empty list indicator state -->
          <div v-if="houses.length === 0" class="p-16 border-2 border-dashed border-slate-200 rounded-3xl w-full max-w-2xl bg-white/50 flex flex-col items-center justify-center">
            <p class="text-slate-400 font-black uppercase text-sm tracking-widest">No properties listed yet.</p>
          </div>

        </div>

        <!-- Add Boarding House Button -->
        <div class="flex justify-center pb-12">
          <a href="/users/owner/accreditation?new=true"
             class="bg-blue-600 hover:bg-black text-white font-black py-4 px-10 rounded-xl text-[12px] uppercase tracking-widest shadow-md flex items-center justify-center gap-2 transition active:scale-95 w-full max-w-[350px]">
            <span class="text-xl leading-none font-black mt-[-2px]">+</span> Add boarding house
          </a>
        </div>
      </div>
    </main>

    <!-- Custom Confirmation Modal -->
    <div v-if="showConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div class="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full text-center border border-slate-100 animate-in zoom-in-95 duration-200">
        <div class="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-xl">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <h3 class="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">{{ confirmTitle }}</h3>
        <p class="text-slate-500 text-xs font-bold leading-relaxed mb-6">{{ confirmMessage }}</p>
        <div class="flex gap-3">
          <button @click="executeConfirm" class="flex-1 bg-red-600 hover:bg-slate-900 text-white text-[10px] font-black py-3.5 rounded-xl uppercase tracking-widest transition shadow-md cursor-pointer">Remove</button>
          <button @click="showConfirmModal = false" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black py-3.5 rounded-xl uppercase tracking-widest transition cursor-pointer">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>
