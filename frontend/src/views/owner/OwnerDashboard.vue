<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
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

const handleReactivateHouse = async (houseId) => {
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
        <div class="flex flex-wrap gap-8 mb-16 justify-center">
          
          <div v-for="house in houses" :key="house.id" 
               class="bg-white rounded-2xl p-4 shadow-sm border border-white hover:shadow-md transition-all duration-300 w-full max-w-[400px] flex flex-col text-left">
            
            <div class="rounded-xl overflow-hidden mb-4 h-[220px] relative">
              <img :src="getImageUrl(house.img)" :alt="house.name"
                   class="w-full h-full object-cover grayscale-[10%] hover:grayscale-0 transition duration-500"
                   @error="e => e.target.src = '/img/cspc_bg.webp'" />
              
              <!-- ARCHIVED BY OWNER -->
              <div v-if="house.house_status === 'archived' && (house.archived_by === 'owner' || (!house.archived_by && house.compliance !== 'expired' && !house.admin_comments))" 
                   class="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6 text-center">
                <div class="flex flex-col items-center">
                  <i class="fa-solid fa-eye-slash text-amber-400 text-3xl mb-2"></i>
                  <p class="text-white text-[11px] font-black uppercase tracking-widest leading-tight">UNLISTED BY OWNER (HIDDEN FROM STUDENTS)</p>
                  <p v-if="house.archive_reason" class="text-slate-300 text-[9px] font-bold uppercase tracking-wide mt-2 bg-slate-800/70 px-3 py-1 rounded-full">
                    Reason: {{ house.archive_reason }}
                  </p>
                  <button @click="handleReactivateHouse(house.id)"
                          class="mt-4 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black px-5 py-2.5 rounded-full uppercase tracking-widest shadow-xl transition active:scale-95 cursor-pointer">
                    <i class="fa-solid fa-play mr-1.5 text-[9px]"></i> Reactivate Listing
                  </button>
                </div>
              </div>

              <!-- ARCHIVED: EXPIRED PERMITS (automatic compliance) -->
              <div v-else-if="house.house_status === 'archived' && house.compliance === 'expired'" class="absolute inset-0 bg-red-600/70 backdrop-blur-sm flex items-center justify-center p-6 text-center">
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

              <!-- ARCHIVED: BY ADMIN -->
              <div v-else-if="house.house_status === 'archived'" class="absolute inset-0 bg-slate-800/80 backdrop-blur-sm flex items-center justify-center p-6 text-center">
                <div>
                  <i class="fa-solid fa-box-archive text-white text-3xl mb-2"></i>
                  <p class="text-white text-[11px] font-black uppercase tracking-widest leading-tight">SUSPENDED BY SASO ADMIN</p>
                  <p v-if="house.admin_comments" class="text-amber-300 text-[9px] font-bold uppercase tracking-widest leading-tight mt-2">"{{ house.admin_comments }}"</p>
                  <p class="text-white/80 text-[9px] font-bold uppercase tracking-widest leading-tight mt-2">Contact SASO Admin for reinstatement.</p>
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
                <div v-else-if="house.house_status === 'archived' && (house.archived_by === 'owner' || (!house.archived_by && house.compliance !== 'expired' && !house.admin_comments))" class="bg-amber-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-md">
                  Unlisted by Owner
                </div>
                <div v-else-if="house.house_status === 'archived' && house.compliance === 'expired'" class="bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-md">
                  Suspended: Permits Expired
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

            <!-- Supplementary Doc Notice -->
            <div v-if="house.compliance !== 'warning' && house.supplementary_status && house.supplementary_status !== 'active'"
                 class="bg-slate-50 border-l-4 border-slate-400 p-3 mb-4 rounded-r-lg">
              <div class="flex items-center gap-2">
                <i class="fa-solid fa-circle-info text-slate-500 text-[10px]"></i>
                <p class="text-[9px] font-black text-slate-600 uppercase tracking-widest">
                  {{ house.supplementary_status === 'expired'
                    ? 'Not urgent: a supplementary document has expired. Your listing stays visible and bookable — renew it when convenient.'
                    : 'Heads up: a supplementary document expires soon. No action needed yet — this will not affect your listing.' }}
                </p>
              </div>
            </div>

            <!-- Body Details -->
            <div class="mb-4 flex-1 px-1">
              <h2 class="font-black text-lg text-slate-900 leading-tight mb-1 uppercase tracking-tight">
                {{ house.name }}
              </h2>
              <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wide">{{ formatAddress(house) }}</p>
            </div>

            <!-- Actions Panel -->
            <div class="mt-auto bg-slate-50 rounded-xl p-4 flex flex-wrap gap-2 justify-center items-center border border-slate-100">
              <router-link v-if="house.house_status === 'rejected'" :to="`/owner/documents/${house.id}`" 
                 class="bg-red-600 text-white text-[10px] font-black px-4 py-2 rounded-md uppercase tracking-widest transition shadow-sm hover:scale-[1.02] active:scale-[0.98] inline-flex items-center justify-center">
                Fix Application
              </router-link>
              <router-link v-else :to="`/owner/edit/${house.id}`" 
                 class="bg-orange-400 text-white text-[10px] font-black px-4 py-2 rounded-md uppercase tracking-widest transition shadow-sm hover:scale-[1.02] active:scale-[0.98] inline-flex items-center justify-center">
                Edit
              </router-link>
              <router-link :to="`/owner/documents/${house.id}`" 
                 class="bg-blue-500 text-white text-[10px] font-black px-4 py-2 rounded-md uppercase tracking-widest transition shadow-sm hover:scale-[1.02] active:scale-[0.98] inline-flex items-center justify-center">
                Docs
              </router-link>
              <router-link :to="`/owner/rooms/${house.id}`" 
                 class="relative bg-green-500 text-white text-[10px] font-black px-4 py-2 rounded-md uppercase tracking-widest transition shadow-sm hover:scale-[1.02] active:scale-[0.98] inline-flex items-center justify-center">
                Rooms
                <span v-if="house.pending_count > 0" class="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-sm animate-bounce">
                  {{ house.pending_count }}
                </span>
              </router-link>
              <button v-if="house.house_status === 'accredited' || house.house_status === 'pending'"
                      @click="openPauseModal(house.id)" 
                      class="bg-slate-200 text-slate-600 text-[10px] font-black px-4 py-2 rounded-md uppercase tracking-widest transition shadow-sm hover:bg-amber-500 hover:text-white cursor-pointer">
                Unlist Listing
              </button>
              <button v-else-if="house.house_status === 'archived' && (house.archived_by === 'owner' || (!house.archived_by && house.compliance !== 'expired' && !house.admin_comments))"
                      @click="handleReactivateHouse(house.id)"
                      class="bg-emerald-500 text-white text-[10px] font-black px-4 py-2 rounded-md uppercase tracking-widest transition shadow-sm hover:bg-emerald-600 cursor-pointer">
                Reactivate
              </button>
            </div>
          </div>

          <div v-if="houses.length === 0" class="p-16 border-2 border-dashed border-slate-200 rounded-3xl w-full max-w-2xl bg-white/50 flex flex-col items-center justify-center">
            <p class="text-slate-400 font-black uppercase text-sm tracking-widest">No properties listed yet.</p>
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

    <!-- Unlist Listing Reason Modal -->
    <div v-if="showPauseModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div class="bg-white rounded-[2rem] shadow-2xl p-8 max-w-md w-full text-left border border-slate-100 animate-in zoom-in-95 duration-200">
        <div class="w-12 h-12 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mb-4 text-xl">
          <i class="fa-solid fa-eye-slash"></i>
        </div>
        <h3 class="text-lg font-black text-slate-900 uppercase tracking-tight mb-1">Unlist Boarding House</h3>
        <p class="text-slate-500 text-xs font-bold leading-relaxed mb-6">
          Are you sure you want to unlist this boarding house? Current boarders remain active and tracked, but students will not find your house in public search.
        </p>

        <div class="space-y-4 mb-6">
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Select Reason for Unlisting *</label>
            <select v-model="pauseReason" class="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-xs font-bold outline-none focus:border-amber-500 cursor-pointer">
              <option value="Fully Booked / At Capacity">Fully Booked / At Capacity</option>
              <option value="Renovation & Upgrades">Renovation &amp; Upgrades</option>
              <option value="End of Semester / Vacation Break">End of Semester / Vacation Break</option>
              <option value="Personal / Landlord Break">Personal / Landlord Break</option>
              <option value="Other">Other (Specify below)</option>
            </select>
          </div>

          <div v-if="pauseReason === 'Other'">
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Specify Custom Reason</label>
            <input v-model="customPauseReason" type="text" placeholder="e.g. Temporary structural repair" class="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-xs font-bold outline-none focus:border-amber-500" />
          </div>
        </div>

        <div class="flex gap-3">
          <button @click="handlePauseListing" :disabled="isArchiving" class="flex-1 bg-amber-500 hover:bg-slate-900 text-white text-[10px] font-black py-3.5 rounded-xl uppercase tracking-widest transition shadow-md disabled:opacity-50 cursor-pointer">
            {{ isArchiving ? 'Unlisting...' : 'Confirm Unlist' }}
          </button>
          <button @click="closePauseModal" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black py-3.5 rounded-xl uppercase tracking-widest transition cursor-pointer">
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