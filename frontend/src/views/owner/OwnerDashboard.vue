<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import axios from 'axios';
import OwnerNav from '../../components/partials/OwnerNav.vue';
import { getImageUrl } from '../../config/api';
import { formatAddress } from '../../utils/formatAddress.js';

// States
const user = ref('');
const houses = ref([]);
const stats = ref({
  totalListings: 0,
  pendingBookings: 0
});
const isLoading = ref(true);
const alerts = ref([]);

const token = sessionStorage.getItem('cspc_token');
const savedUser = sessionStorage.getItem('cspc_user');

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

  setTimeout(() => {
    closeAlert(id);
  }, 7000);
};

const closeAlert = (id) => {
  alerts.value = alerts.value.filter(a => a.id !== id);
};

const fetchDashboardData = async () => {
  if (!token) return;
  try {
    isLoading.value = true;
    const response = await axios.get('/api/owner/dashboard', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      houses.value = response.data.houses || [];
      stats.value = response.data.stats || { totalListings: 0, pendingBookings: 0 };
      user.value = response.data.user || (savedUser ? JSON.parse(savedUser).name : 'Owner');
    }
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
    showSystemAlert('Could not load dashboard records. Connecting to backend...', 'warning');
  } finally {
    isLoading.value = false;
  }
};

// Confirmation, Unlist & Reactivation Modal States
const showConfirmModal = ref(false);
const confirmTitle = ref('');
const confirmMessage = ref('');
const confirmAction = ref(null);

const showPauseModal = ref(false);
const pauseHouseId = ref(null);
const pauseReason = ref('Fully Booked / At Capacity');
const customPauseReason = ref('');
const isArchiving = ref(false);

const showReactivateBlockedModal = ref(false);
const blockedHouseId = ref(null);
const blockedErrorMessage = ref('');

// Toggle to show/hide archived listings on the dashboard
const listingFilter = ref('active'); // 'all' | 'active' | 'archived'

// Filtered house list based on filter tab
const visibleHouses = computed(() => {
  if (listingFilter.value === 'archived') return houses.value.filter(h => h.house_status === 'archived');
  if (listingFilter.value === 'active') return houses.value.filter(h => h.house_status !== 'archived');
  return houses.value; // 'all'
});

// Count of archived houses (drives the filter badge)
const archivedCount = computed(() =>
  houses.value.filter(h => h.house_status === 'archived').length
);

// Keep showArchived as an alias for backward-compat with any other refs
const showArchived = computed(() => listingFilter.value === 'archived');

// Supplementary doc info pop-up
const showSuppModal = ref(false);
const suppModalStatus = ref('');

const openSuppModal = (status) => {
  suppModalStatus.value = status;
  showSuppModal.value = true;
};

// Reactivation confirmation modal
const showReactivateConfirmModal = ref(false);
const pendingReactivateHouseId = ref(null);

const openReactivateConfirm = (houseId) => {
  pendingReactivateHouseId.value = houseId;
  showReactivateConfirmModal.value = true;
};

const closeReactivateConfirmModal = () => {
  showReactivateConfirmModal.value = false;
  pendingReactivateHouseId.value = null;
};

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

const openPauseModal = (houseId) => {
  pauseHouseId.value = houseId;
  pauseReason.value = 'Fully Booked / At Capacity';
  customPauseReason.value = '';
  showPauseModal.value = true;
};

const closePauseModal = () => {
  showPauseModal.value = false;
  pauseHouseId.value = null;
};

const closeReactivateBlockedModal = () => {
  showReactivateBlockedModal.value = false;
  blockedHouseId.value = null;
  blockedErrorMessage.value = '';
};

const handlePauseListing = async () => {
  if (!pauseHouseId.value) return;
  const reasonToSave = pauseReason.value === 'Other' ? customPauseReason.value : pauseReason.value;
  try {
    isArchiving.value = true;
    const response = await axios.delete(`/api/owner/boarding-houses/${pauseHouseId.value}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { reason: reasonToSave || 'Unlisted by Landlord' }
    });

    if (response.data.success) {
      showSystemAlert('Boarding house unlisted & archived. Active boarders remain tracked.', 'success');
      closePauseModal();
      fetchDashboardData();
    }
  } catch (error) {
    console.error('Error archiving boarding house:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to unlist listing.', 'error');
  } finally {
    isArchiving.value = false;
  }
};

const execReactivateHouse = async () => {
  const houseId = pendingReactivateHouseId.value;
  closeReactivateConfirmModal();
  if (!houseId) return;
  try {
    const response = await axios.post(`/api/owner/boarding-houses/reactivate/${houseId}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      showSystemAlert('Boarding house reactivated successfully! Listing is now active.', 'success');
      fetchDashboardData();
    }
  } catch (error) {
    console.error('Error reactivating boarding house:', error);
    const msg = error.response?.data?.message || 'Reactivation blocked by system compliance.';
    blockedHouseId.value = houseId;
    blockedErrorMessage.value = msg;
    showReactivateBlockedModal.value = true;
    // Refresh dashboard so card states reflect the compliance evaluation that ran
    // (e.g. archived_by may have changed from 'owner' to 'system' if permits expired)
    fetchDashboardData();
  }
};

const preventBackNavigation = () => {
  window.history.pushState(null, null, window.location.href);
};

onMounted(() => {
  window.history.pushState(null, null, window.location.href);
  window.addEventListener('popstate', preventBackNavigation);
  if (savedUser) {
    user.value = JSON.parse(savedUser).name;
  }
  fetchDashboardData();
});

onUnmounted(() => {
  window.removeEventListener('popstate', preventBackNavigation);
});
</script>

<template>
  <div class="bg-[#eef6ff] min-h-screen flex flex-col font-sans">
    <OwnerNav />

    <!-- Alert Panel -->
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
      <h2 class="text-3xl font-black text-slate-900 mb-6 tracking-tight uppercase">Welcome, {{ user }}</h2>

      <!-- Loading State -->
      <div v-if="isLoading" class="py-20 flex flex-col items-center justify-center gap-3">
        <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p class="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Loading Dashboard data...</p>
      </div>

      <div v-else>
        <!-- Pending Bookings Alert -->
        <div v-if="stats.pendingBookings > 0" class="mb-10 animate-pulse">
        <router-link to="/owner/bookings" class="inline-flex items-center gap-4 bg-orange-500 text-white px-8 py-4 rounded-2xl shadow-lg shadow-orange-200 hover:bg-orange-600 transition-all group">
            <div class="bg-white/20 p-2 rounded-lg">
              <i class="fa-solid fa-bell text-xl"></i>
            </div>
            <div class="text-left">
              <p class="text-[10px] font-black uppercase tracking-widest opacity-80">Action Required</p>
              <p class="text-sm font-black uppercase">You have {{ stats.pendingBookings }} new booking request{{ stats.pendingBookings > 1 ? 's' : '' }}</p>
            </div>
            <i class="fa-solid fa-arrow-right ml-4 group-hover:translate-x-1 transition-transform"></i>
          </router-link>
        </div>

        <!-- Cards Container -->
        <!-- Filter tabs — centered, 3-way: All / Active / Archived -->
        <div v-if="archivedCount > 0" class="mb-8 px-2">
          <div class="flex items-center gap-1 bg-white rounded-xl p-1 border border-slate-200 shadow-sm w-full">
            <button @click="listingFilter = 'all'"
                    class="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition cursor-pointer min-w-0"
                    :class="listingFilter === 'all' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'">
              <i class="fa-solid fa-layer-group text-[9px] shrink-0"></i>
              <span class="truncate">All</span>
              <span class="text-[8px] font-black px-1.5 py-0.5 rounded-full leading-none shrink-0"
                    :class="listingFilter === 'all' ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'">
                {{ houses.length }}
              </span>
            </button>
            <button @click="listingFilter = 'active'"
                    class="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition cursor-pointer min-w-0"
                    :class="listingFilter === 'active' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'">
              <i class="fa-solid fa-house-chimney text-[9px] shrink-0"></i>
              <span class="truncate">Active</span>
              <span class="text-[8px] font-black px-1.5 py-0.5 rounded-full leading-none shrink-0"
                    :class="listingFilter === 'active' ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'">
                {{ houses.filter(h => h.house_status !== 'archived').length }}
              </span>
            </button>
            <button @click="listingFilter = 'archived'"
                    class="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition cursor-pointer min-w-0"
                    :class="listingFilter === 'archived' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'">
              <i class="fa-solid fa-box-archive text-[9px] shrink-0"></i>
              <span class="truncate">Archived</span>
              <span class="text-[8px] font-black px-1.5 py-0.5 rounded-full leading-none shrink-0"
                    :class="listingFilter === 'archived' ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'">
                {{ archivedCount }}
              </span>
            </button>
          </div>
        </div>

        <div class="flex flex-wrap gap-8 mb-16 justify-center">
          
          <div v-for="house in visibleHouses" :key="house.id" 
               class="bg-white rounded-2xl p-4 shadow-sm border border-white hover:shadow-md transition-all duration-300 w-full max-w-[400px] flex flex-col text-left">
            
            <div class="rounded-xl overflow-hidden mb-4 h-[220px] relative">
              <img :src="getImageUrl(house.img)" :alt="house.name"
                   class="w-full h-full object-cover grayscale-[10%] hover:grayscale-0 transition duration-500"
                   @error="e => e.target.src = '/img/cspc_bg.webp'" />
              
              <!-- 1. AUTOMATICALLY ARCHIVED: EXPIRED PERMITS -->
              <div v-if="house.house_status === 'archived' && (house.archived_by === 'system' || house.compliance === 'expired' || house.compliance_status === 'expired')" 
                   class="absolute inset-0 bg-red-600/70 backdrop-blur-sm flex items-center justify-center p-6 text-center">
                <div>
                  <i class="fa-solid fa-ban text-white text-3xl mb-2"></i>
                  <p class="text-white text-[11px] font-black uppercase tracking-widest leading-tight">HIDDEN FROM STUDENTS: REQUIRED PERMITS EXPIRED</p>
                  <p class="text-white/80 text-[9px] font-bold uppercase tracking-widest leading-tight mt-2">Renew your permits under Docs to reactivate listing.</p>
                  <router-link :to="`/owner/documents/${house.id}`" 
                               class="inline-block mt-3 bg-white text-red-600 text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-widest shadow-md hover:bg-slate-100 transition">
                    Upload Renewed Permits
                  </router-link>
                </div>
              </div>

              <!-- 2. ARCHIVED BY OWNER (Manual Unlist) -->
              <div v-else-if="house.house_status === 'archived' && house.archived_by === 'owner'" 
                   class="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6 text-center">
                <div class="flex flex-col items-center">
                  <i class="fa-solid fa-eye-slash text-amber-400 text-3xl mb-2"></i>
                  <p class="text-white text-[11px] font-black uppercase tracking-widest leading-tight">UNLISTED BY OWNER (HIDDEN FROM STUDENTS)</p>
                  <p v-if="house.archive_reason" class="text-slate-300 text-[9px] font-bold uppercase tracking-wide mt-2 bg-slate-800/70 px-3 py-1 rounded-full">
                    Reason: {{ house.archive_reason }}
                  </p>
                  <button @click="openReactivateConfirm(house.id)"
                          class="mt-4 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black px-5 py-2.5 rounded-full uppercase tracking-widest shadow-xl transition active:scale-95 cursor-pointer">
                    <i class="fa-solid fa-play mr-1.5 text-[9px]"></i> Reactivate Listing
                  </button>
                </div>
              </div>

              <!-- 3. ARCHIVED BY SASO ADMIN (Manual Suspension) -->
              <div v-else-if="house.house_status === 'archived'" class="absolute inset-0 bg-slate-800/80 backdrop-blur-sm flex items-center justify-center p-6 text-center">
                <div>
                  <i class="fa-solid fa-box-archive text-white text-3xl mb-2"></i>
                  <p class="text-white text-[11px] font-black uppercase tracking-widest leading-tight">SUSPENDED BY SASO ADMIN</p>
                  <p v-if="house.admin_comments" class="text-amber-300 text-[9px] font-bold uppercase tracking-widest leading-tight mt-2">"{{ house.admin_comments }}"</p>
                  <p class="text-white/80 text-[9px] font-bold uppercase tracking-widest leading-tight mt-2">Contact SASO or upload updated documents to request re-accreditation.</p>
                  <router-link :to="`/owner/documents/${house.id}`" 
                               class="inline-block mt-3 bg-amber-400 text-slate-900 text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-widest shadow-md hover:bg-amber-300 transition">
                    Upload Updated Documents
                  </router-link>
                </div>
              </div>

              <!-- REJECTED OVERLAY -->
              <div v-else-if="house.house_status === 'rejected'" class="absolute inset-0 bg-red-500/80 backdrop-blur-sm flex items-center justify-center p-6 text-center">
                <div class="flex flex-col items-center">
                  <i class="fa-solid fa-circle-xmark text-white text-3xl mb-3"></i>
                  <p class="text-white text-[11px] font-black uppercase tracking-widest leading-tight mb-4">REJECTED BY SASO: HIDDEN FROM STUDENTS</p>
                  <router-link :to="`/owner/documents/${house.id}`" class="bg-white text-red-600 text-[10px] font-black px-6 py-2.5 rounded-full uppercase tracking-widest shadow-xl hover:bg-slate-100 transition active:scale-95 text-center">
                    Fix & Resubmit
                  </router-link>
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
                <div v-else-if="house.house_status === 'archived' && (house.archived_by === 'system' || house.compliance === 'expired' || house.compliance_status === 'expired')" class="bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-md">
                  Inactive: Permits Expired
                </div>
                <div v-else-if="house.house_status === 'archived' && house.archived_by === 'owner'" class="bg-amber-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-md">
                  Unlisted by Owner
                </div>
                <div v-else-if="house.house_status === 'archived'" class="bg-slate-700 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-md">
                  Suspended by SASO
                </div>
                <div v-else-if="house.compliance === 'warning'" class="bg-orange-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-md">
                  Warning: Renew Permits
                </div>
                <div v-else class="bg-green-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-md">
                  Accredited
                </div>
              </div>
            </div>

            <!-- Warning Box (Shown on active or unlisted houses if permits expiring) -->
            <div v-if="house.compliance === 'warning'" class="bg-orange-50 border-l-4 border-orange-500 p-3 mb-4 rounded-r-lg">
              <div class="flex items-center gap-2">
                <i class="fa-solid fa-clock text-orange-600 text-[10px]"></i>
                <p class="text-[9px] font-black text-orange-700 uppercase tracking-widest">Action Required: Permits expiring soon!</p>
              </div>
            </div>

            <!-- Body Details -->
            <div class="mb-4 flex-1 px-1">
              <h2 class="font-black text-lg text-slate-900 leading-tight mb-1 uppercase tracking-tight">
                {{ house.name }}
              </h2>
              <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wide">{{ formatAddress(house) }}</p>
              <!-- Supplementary Doc Notice — compact chip, click for details -->
              <button v-if="house.compliance !== 'warning' && house.supplementary_status && house.supplementary_status !== 'active'"
                      @click="openSuppModal(house.supplementary_status)"
                      class="inline-flex items-center gap-1 mt-1.5 text-[9px] font-bold text-slate-400 bg-slate-100 hover:bg-slate-200 hover:text-slate-600 px-2 py-0.5 rounded-full transition cursor-pointer">
                <i class="fa-solid fa-circle-info text-[8px]"></i>
                {{ house.supplementary_status === 'expired' ? 'Supplementary doc expired — non-urgent' : 'Supplementary doc expiring soon' }}
              </button>
              <!-- Document Re-Verification Pending chip — shown when owner uploaded a doc awaiting admin review -->
              <span v-if="house.document_update_pending"
                    class="inline-flex items-center gap-1 mt-1.5 text-[9px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block"></span>
                Document update pending admin review
              </span>
            </div>

            <!-- Actions Panel -->
            <div class="mt-auto bg-slate-50 rounded-xl p-3 border border-slate-100">
              <div class="grid grid-cols-3 gap-2">
                <router-link v-if="house.house_status === 'rejected'" :to="`/owner/documents/${house.id}`" 
                   class="col-span-3 bg-red-600 text-white text-[10px] font-black px-4 py-2 rounded-md uppercase tracking-widest transition shadow-sm hover:scale-[1.02] active:scale-[0.98] inline-flex items-center justify-center gap-1.5">
                  <i class="fa-solid fa-wrench text-[9px]"></i> Fix Application
                </router-link>
                <template v-else>
                  <router-link :to="`/owner/edit/${house.id}`" 
                     class="bg-orange-400 text-white text-[10px] font-black px-2 py-2 rounded-md uppercase tracking-widest transition shadow-sm hover:scale-[1.02] active:scale-[0.98] inline-flex items-center justify-center gap-1.5">
                    <i class="fa-solid fa-pen text-[9px]"></i> Edit
                  </router-link>
                  <router-link :to="`/owner/documents/${house.id}`" 
                     class="bg-blue-500 text-white text-[10px] font-black px-2 py-2 rounded-md uppercase tracking-widest transition shadow-sm hover:scale-[1.02] active:scale-[0.98] inline-flex items-center justify-center gap-1.5">
                    <i class="fa-solid fa-file-lines text-[9px]"></i> Docs
                  </router-link>
                  <router-link :to="`/owner/rooms/${house.id}`" 
                     class="relative bg-green-500 text-white text-[10px] font-black px-2 py-2 rounded-md uppercase tracking-widest transition shadow-sm hover:scale-[1.02] active:scale-[0.98] inline-flex items-center justify-center gap-1.5">
                    <i class="fa-solid fa-door-open text-[9px]"></i> Rooms
                    <span v-if="house.pending_count > 0" class="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-sm animate-bounce">
                      {{ house.pending_count }}
                    </span>
                  </router-link>
                </template>
              </div>

              <!-- Unlist / Reactivate — full-width row below the main action buttons -->
              <div v-if="house.house_status === 'accredited' || house.house_status === 'pending'" class="mt-2 pt-2 border-t border-slate-200">
                <button @click="openPauseModal(house.id)"
                        class="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 hover:border-amber-400 hover:bg-amber-50 text-slate-500 hover:text-amber-700 text-[10px] font-black py-2 px-4 rounded-lg uppercase tracking-widest transition cursor-pointer">
                  <i class="fa-solid fa-eye-slash text-[10px]"></i> Pause / Unlist Listing
                </button>
              </div>
              <div v-else-if="house.house_status === 'archived' && house.archived_by !== 'admin'" class="mt-2 pt-2 border-t border-slate-200">
                <button @click="openReactivateConfirm(house.id)"
                        class="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black py-2 px-4 rounded-lg uppercase tracking-widest transition shadow-sm cursor-pointer">
                  <i class="fa-solid fa-play text-[9px]"></i> Reactivate Listing
                </button>
              </div>
            </div>
          </div>

          <div v-if="visibleHouses.length === 0" class="p-16 border-2 border-dashed border-slate-200 rounded-3xl w-full max-w-2xl bg-white/50 flex flex-col items-center justify-center">
            <p class="text-slate-400 font-black uppercase text-sm tracking-widest">
              {{ houses.length === 0 ? 'No properties listed yet.' : 'No listings in this category.' }}
            </p>
            <button v-if="houses.length > 0 && listingFilter === 'active'" @click="listingFilter = 'all'"
                    class="mt-4 text-[10px] font-black text-blue-500 uppercase tracking-widest underline cursor-pointer">
              Show all listings
            </button>
          </div>

        </div>

        <!-- Add Boarding House Button -->
        <div class="flex justify-center pb-12">
          <router-link to="/owner/accreditation?new=true"
             class="bg-blue-600 hover:bg-black text-white font-black py-4 px-10 rounded-xl text-[12px] uppercase tracking-widest shadow-md flex items-center justify-center gap-2 transition active:scale-95 w-full max-w-[350px]">
            <span class="text-xl leading-none font-black mt-[-2px]">+</span> Add boarding house
          </router-link>
        </div>
      </div>
    </main>

    <!-- Supplementary Document Info Modal -->
    <div v-if="showSuppModal" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[250] flex items-center justify-center p-4" @click.self="showSuppModal = false">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-100 overflow-hidden">
        <div class="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
              <i class="fa-solid fa-circle-info text-slate-500"></i>
            </div>
            <h3 class="text-[11px] font-black text-slate-700 uppercase tracking-widest">Supplementary Document</h3>
          </div>
          <button @click="showSuppModal = false" class="text-slate-300 hover:text-slate-600 transition cursor-pointer">
            <i class="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>
        <div class="px-6 py-5">
          <p class="text-[13px] font-semibold text-slate-600 leading-relaxed">
            <template v-if="suppModalStatus === 'expired'">
              A supplementary document (e.g. Cedula, DTI, Building Inspection, or Zoning Clearance) has expired. <strong class="text-slate-800">Your listing stays visible and bookable</strong> — these are non-critical documents that don't affect your accreditation status. Renew it when convenient.
            </template>
            <template v-else>
              A supplementary document is expiring soon. <strong class="text-slate-800">No action needed yet</strong> — this will not affect your listing or accreditation status. You may upload a renewed copy in advance under <strong>Docs</strong>.
            </template>
          </p>
        </div>
        <div class="px-6 pb-5">
          <button @click="showSuppModal = false"
                  class="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-black py-2.5 rounded-xl uppercase tracking-widest transition cursor-pointer">
            Got it
          </button>
        </div>
      </div>
    </div>

    <!-- Pause / Unlist Listing Modal -->
    <div v-if="showPauseModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">

        <!-- Modal Header -->
        <div class="bg-amber-50 border-b border-amber-100 px-7 py-5 flex items-center gap-4">
          <div class="w-11 h-11 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
            <i class="fa-solid fa-eye-slash text-amber-500 text-lg"></i>
          </div>
          <div>
            <h3 class="text-sm font-black text-slate-900 uppercase tracking-tight leading-tight">Pause / Unlist Boarding House</h3>
            <p class="text-[10px] font-bold text-amber-600 uppercase tracking-widest mt-0.5">Listing will be hidden from students</p>
          </div>
        </div>

        <!-- Modal Body -->
        <div class="px-7 py-6 space-y-5">
          <!-- Info notice -->
          <div class="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <i class="fa-solid fa-circle-info text-slate-400 text-sm mt-0.5 shrink-0"></i>
            <p class="text-[11px] font-semibold text-slate-500 leading-relaxed">
              Your listing will be hidden from student search. Active boarders remain tracked and unaffected. You can reactivate any time.
            </p>
          </div>

          <!-- Reason Select -->
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
              Reason for Pausing <span class="text-red-500">*</span>
            </label>
            <select v-model="pauseReason" class="w-full bg-white border border-slate-200 hover:border-amber-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 p-3 rounded-xl text-[12px] font-bold text-slate-700 outline-none cursor-pointer transition">
              <option value="Fully Booked / At Capacity">Fully Booked / At Capacity</option>
              <option value="Renovation & Upgrades">Renovation &amp; Upgrades</option>
              <option value="End of Semester / Vacation Break">End of Semester / Vacation Break</option>
              <option value="Personal / Landlord Break">Personal / Landlord Break</option>
              <option value="Other">Other (specify below)</option>
            </select>
          </div>

          <!-- Custom reason input -->
          <div v-if="pauseReason === 'Other'">
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Specify Reason</label>
            <input v-model="customPauseReason" type="text" placeholder="e.g. Temporary structural repair"
                   class="w-full bg-white border border-slate-200 hover:border-amber-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 p-3 rounded-xl text-[12px] font-bold text-slate-700 outline-none transition" />
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="px-7 pb-6 flex gap-3">
          <button @click="handlePauseListing" :disabled="isArchiving"
                  class="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-[11px] font-black py-3 rounded-xl uppercase tracking-widest transition shadow-sm cursor-pointer flex items-center justify-center gap-2">
            <i class="fa-solid fa-eye-slash text-[10px]"></i>
            {{ isArchiving ? 'Pausing...' : 'Confirm Pause' }}
          </button>
          <button @click="closePauseModal"
                  class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-black py-3 rounded-xl uppercase tracking-widest transition cursor-pointer">
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Reactivate Listing Confirmation Modal -->
    <div v-if="showReactivateConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">

        <!-- Modal Header -->
        <div class="bg-emerald-50 border-b border-emerald-100 px-7 py-5 flex items-center gap-4">
          <div class="w-11 h-11 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
            <i class="fa-solid fa-play text-emerald-600 text-lg"></i>
          </div>
          <div>
            <h3 class="text-sm font-black text-slate-900 uppercase tracking-tight leading-tight">Reactivate Listing</h3>
            <p class="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-0.5">Make listing visible to students again</p>
          </div>
        </div>

        <!-- Modal Body -->
        <div class="px-7 py-6">
          <div class="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <i class="fa-solid fa-circle-info text-slate-400 text-sm mt-0.5 shrink-0"></i>
            <p class="text-[11px] font-semibold text-slate-500 leading-relaxed">
              This will make your boarding house visible to students again in the public listing. The system will verify your permits before reactivation — if any required permits have expired, you will be notified.
            </p>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="px-7 pb-6 flex gap-3">
          <button @click="execReactivateHouse"
                  class="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-black py-3 rounded-xl uppercase tracking-widest transition shadow-sm cursor-pointer flex items-center justify-center gap-2">
            <i class="fa-solid fa-play text-[10px]"></i> Confirm Reactivate
          </button>
          <button @click="closeReactivateConfirmModal"
                  class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-black py-3 rounded-xl uppercase tracking-widest transition cursor-pointer">
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Reactivation Blocked (Expired Permits) Pop-Up Modal -->
    <div v-if="showReactivateBlockedModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div class="bg-white rounded-[2rem] shadow-2xl p-8 max-w-md w-full text-center border border-slate-100 animate-in zoom-in-95 duration-200">
        <div class="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl shadow-inner">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <h3 class="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">Cannot Reactivate Listing</h3>
        <p class="text-slate-600 text-xs font-bold leading-relaxed mb-6 bg-red-50/80 border border-red-100 p-4 rounded-xl text-left">
          {{ blockedErrorMessage }}
        </p>
        <div class="flex flex-col gap-3">
          <router-link v-if="blockedHouseId" :to="`/owner/documents/${blockedHouseId}`" 
                       class="w-full bg-red-600 hover:bg-slate-900 text-white text-[10px] font-black py-3.5 rounded-xl uppercase tracking-widest transition shadow-md text-center">
            Upload Renewed Permits
          </router-link>
          <button @click="closeReactivateBlockedModal" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black py-3.5 rounded-xl uppercase tracking-widest transition cursor-pointer">
            Close
          </button>
        </div>
      </div>
    </div>

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