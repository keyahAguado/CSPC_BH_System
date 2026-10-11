<script setup>
import LoadError from '../../components/management/LoadError.vue';

import PageHeader from '../../components/management/PageHeader.vue';
import '../../styles/management.css';
import '../../styles/admin-theme.css';
import '../../styles/owner-pages.css';
import { vManagementDialog } from '../../components/management/dialogAccessibility.js';
import { validateInput } from '../../utils/inputValidation.js';
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import OwnerNav from '../../components/partials/OwnerNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';
import { getImageUrl } from '../../config/api.js';
import { normalizePhPhone, isValidPhPhone } from '../../utils/phoneValidation.js';

// --- Accordion toggle state for mobile ---
const expandedOccupants = ref(new Set());
const toggleOccupant = (id) => {
  if (expandedOccupants.value.has(id)) {
    expandedOccupants.value.delete(id);
  } else {
    expandedOccupants.value.add(id);
  }
  expandedOccupants.value = new Set(expandedOccupants.value);
};
// -----------------------------------------

const route = useRoute();
const roomId = ref(route.params.id); 

const room = ref({
  id: '',
  house_id: '',
  room_number: '',
  gender_type: 'female',
  capacity: 2,
  occupant_count: 0,
  price: 0,
  house_price: 0
});

const occupants = ref([]);
const pendingBookings = ref([]);
const occupantFilter = ref('all'); // Filter: 'all', 'cspc', 'non_cspc'

const filteredOccupants = computed(() => {
  if (occupantFilter.value === 'cspc') {
    return occupants.value.filter(o => !o.is_non_cspc);
  }
  if (occupantFilter.value === 'non_cspc') {
    return occupants.value.filter(o => o.is_non_cspc);
  }
  return occupants.value;
});

const isLoading = ref(true);
const isSavingNonCspc = ref(false);
const showAddModal = ref(false);
const showRemoveModal = ref(false);
const showConfirmModal = ref(false);

// Confirm Modal States
const confirmTitle = ref('');
const confirmMessage = ref('');
const confirmAction = ref(null);

const alertRef = ref(null);
const token = sessionStorage.getItem('cspc_token');
const API = import.meta.env.VITE_API_URL;

// Form state for manual occupant
const newOccupant = ref({
  name: '',
  age: '',
  contact_number: '',
  check_in_date: '',
  months: 1,
  emergency_contact: '',
  guardian_name: '',
  payment_status: 'Not Paid',
  upfront_status: 'Unpaid',
  address: ''
});

const showSystemAlert = (message, type = 'error') => {
  if (alertRef.value) {
    alertRef.value.showSystemAlert(message, type);
  }
};

const isProcessingDecision = ref(false);

const triggerConfirm = (title, message, action) => {
  if (isProcessingDecision.value) return;
  confirmTitle.value = title;
  confirmMessage.value = message;
  confirmAction.value = action;
  showConfirmModal.value = true;
};

const executeConfirm = async () => {
  if (isProcessingDecision.value || !confirmAction.value) return;
  const action = confirmAction.value;
  confirmAction.value = null;
  isProcessingDecision.value = true;
  showConfirmModal.value = false;
  try {
    await action();
  } finally {
    isProcessingDecision.value = false;
  }
};

const fetchRoomDetails = async () => {
  loadError.value = '';
  try {
    isLoading.value = true;
    const response = await axios.get(`/api/owner/rooms/details/${roomId.value}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      room.value = response.data.room || {};
      occupants.value = response.data.occupants || [];
      pendingBookings.value = response.data.pendingBookings || [];
    }
  } catch (error) {
    loadError.value = 'The server did not return these records. Refresh the page to try again.';
    console.error('Failed to load room details:', error);
    showSystemAlert('Could not fetch room and boarders information.', 'warning');
  } finally {
    isLoading.value = false;
  }
};

const handleApproveBooking = async (bookingId) => {
  try {
    const response = await axios.post(`/api/owner/bookings/approve/${bookingId}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.data.success) {
      showSystemAlert(response.data.message || 'Reservation request approved successfully!', 'success');
      await fetchRoomDetails();
    }
  } catch (error) {
    console.error('Approve failed:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to approve booking.', 'error');
    if ([404, 409].includes(error.response?.status)) await fetchRoomDetails();
  }
};

const handleRejectBooking = async (bookingId) => {
  try {
    const response = await axios.post(`/api/owner/bookings/reject/${bookingId}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.data.success) {
      showSystemAlert('Reservation request rejected.', 'info');
      fetchRoomDetails();
    }
  } catch (error) {
    console.error('Reject failed:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to reject booking.', 'error');
  }
};

const handleTogglePayment = async (occupant) => {
  const newStatus = occupant.payment_status === 'Paid' ? 'Not Paid' : 'Paid';
  try {
    const response = await axios.post(`/api/owner/rooms/occupants/payment/${occupant.id}`, {
      status: newStatus
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.data.success) {
      showSystemAlert(`Monthly payment status updated to ${newStatus}.`, 'success');
      fetchRoomDetails();
    }
  } catch (error) {
    console.error('Payment toggle failed:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to update payment status.', 'error');
  }
};

const calculateTotalRent = (occupant) => {
  const months = parseInt(occupant.months) || 1;
  // Room's own price takes priority over house base price
  const monthlyRate = parseFloat(room.value.price || room.value.house_price || occupant.monthly_rent || 0);
  if (monthlyRate > 0) {
    return months * monthlyRate;
  }
  return parseFloat(occupant.amount || 0);
};

// Manual occupants require an explicit upfront collection status.
// Preserve the existing fallback for CSPC cash bookings.
const isUpfrontCollected = (occupant) => (occupant.upfront_status || (occupant.is_non_cspc ? 'Unpaid' : 'Paid')) === 'Paid';

const getUpfrontLabel = (occupant) => {
  if (occupant.is_non_cspc) {
    return isUpfrontCollected(occupant) ? 'Upfront Collected' : 'Upfront Not Collected';
  }
  return isUpfrontCollected(occupant) ? 'Upfront Paid (Cash)' : 'Upfront Unpaid (Cash)';
};

const getUpfrontActionLabel = (occupant) => {
  if (occupant.is_non_cspc) {
    return isUpfrontCollected(occupant) ? 'Mark Not Collected' : 'Mark Collected';
  }
  return isUpfrontCollected(occupant) ? 'Mark Upfront Unpaid' : 'Mark Upfront Paid';
};

const handleToggleUpfront = async (occupant) => {
  const newStatus = isUpfrontCollected(occupant) ? 'Unpaid' : 'Paid';
  try {
    const response = await axios.post(`/api/owner/rooms/occupants/upfront-payment/${occupant.id}`, {
      status: newStatus
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.data.success) {
      showSystemAlert(`Move-in Upfront status updated to ${newStatus}.`, 'success');
      fetchRoomDetails();
    }
  } catch (error) {
    console.error('Upfront payment toggle failed:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to update upfront payment status.', 'error');
  }
};

const handleCheckoutOccupant = async (occupantId) => {
  try {
    const response = await axios.post(`/api/owner/rooms/occupants/checkout/${occupantId}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.data.success) {
      showSystemAlert('Boarder checked out successfully.', 'success');
      showRemoveModal.value = false;
      fetchRoomDetails();
    }
  } catch (error) {
    console.error('Checkout failed:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to checkout boarder.', 'error');
  }
};

const sanitizePhoneInput = (fieldKey) => {
  newOccupant.value[fieldKey] = normalizePhPhone(newOccupant.value[fieldKey]);
};

const handleAddNonCspc = async () => {
  if (isSavingNonCspc.value) return;
  const validationError = validateInput('occupant', newOccupant.value);
  if (validationError) { showSystemAlert(validationError, 'error'); return; }
  if (!newOccupant.value.name) {
    showSystemAlert('Full name is required.', 'error');
    return;
  }
  if (newOccupant.value.contact_number && !isValidPhPhone(newOccupant.value.contact_number)) {
    showSystemAlert('Contact number must be a valid PH mobile number (11 digits, starting with 09).', 'error');
    return;
  }
  if (newOccupant.value.emergency_contact && !isValidPhPhone(newOccupant.value.emergency_contact)) {
    showSystemAlert('Emergency contact number must be a valid PH mobile number (11 digits, starting with 09).', 'error');
    return;
  }

  try {
    isSavingNonCspc.value = true;
    const response = await axios.post(`/api/owner/rooms/occupants/add/${roomId.value}`, newOccupant.value, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      showSystemAlert('Manual occupant saved successfully!', 'success');
      closeAddModal();
      fetchRoomDetails();
    }
  } catch (error) {
    console.error('Failed to add occupant:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to add manual occupant.', 'error');
  } finally {
    isSavingNonCspc.value = false;
  }
};

const openAddModal = () => {
  showAddModal.value = true;
};

const closeAddModal = () => {
  showAddModal.value = false;
  newOccupant.value = {
    name: '',
    age: '',
    contact_number: '',
    check_in_date: '',
    months: 1,
    emergency_contact: '',
    guardian_name: '',
    payment_status: 'Not Paid',
    upfront_status: 'Unpaid',
    address: ''
  };
};

const openRemoveModal = () => {
  showRemoveModal.value = true;
};

const closeRemoveModal = () => {
  showRemoveModal.value = false;
};

const formatMoveInLedger = (occ) => {
  const advM = parseInt(occ.advance_months || 0);
  const depM = parseInt(occ.deposit_months || 0);
  // Room's own price takes priority over house base price
  const rentPerMonth = parseFloat(room.value.price || room.value.house_price || 0);
  const advAmt = advM * rentPerMonth;
  const depAmt = depM * rentPerMonth;
  const total = advAmt + depAmt;
  const friendlyType = occ.deposit_type === 'consumable' ? 'Consumable' : 'Refundable (Cash)';

  return {
    total,
    advAmt,
    depAmt,
    advM,
    depM,
    friendlyType,
    depositType: occ.deposit_type
  };
};

import { computeCheckoutDate, formatCheckoutDateString } from '../../utils/dateHelper.js';

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return '—';
  }
};

const getCheckoutDateDisplay = (occ) => {
  if (!occ.check_in_date) return '—';
  const computedDate = computeCheckoutDate(occ.check_in_date, occ.months || 1);
  return formatCheckoutDateString(computedDate);
};

onMounted(() => {
  fetchRoomDetails();
});

const loadError = ref('');
</script>

<template>
  <div class="management-page owner-page bg-slate-100 min-h-screen flex flex-col font-sans">
    <OwnerNav />
    <div aria-live="polite" aria-atomic="false"><FlashAlert ref="alertRef" /></div>

    <main id="management-content" tabindex="-1" class="flex-1 max-w-[1750px] mx-auto w-[96%] py-12 px-2 lg:px-6 text-left animate-in fade-in duration-300">
      <LoadError :message="loadError" />
      <!-- Header -->
      <div class="mb-12">
        <router-link :to="'/owner/rooms/' + room.house_id"
           class="text-[#2a528a] font-semibold text-[12px] uppercase tracking-wide hover:text-blue-800 transition inline-flex items-center gap-2 mb-8">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          BACK TO ROOMS
        </router-link>
        
        <PageHeader title="Room details" />
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="p-20 text-center bg-white rounded-[2.5rem] shadow-sm border border-slate-200/60 flex flex-col items-center justify-center">
        <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
        <p class="text-slate-400 font-bold uppercase text-[12px] tracking-wide">Loading Room and Boarders...</p>
      </div>

      <div v-else class="space-y-10">
        <!-- Pending Reservations Section -->
        <section v-if="pendingBookings && pendingBookings.length > 0" class="bg-orange-50/50 rounded-3xl border-2 border-dashed border-orange-200 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
          <div class="bg-orange-100/50 px-8 py-5 border-b border-orange-200 flex items-center gap-3">
            <div class="w-2 h-6 bg-orange-500 rounded-full animate-pulse"></div>
            <h2 class="text-sm font-semibold text-orange-800 uppercase tracking-wide">
              Pending Reservation Requests
            </h2>
            <span class="ml-auto bg-orange-500 text-white text-[12px] font-semibold px-2 py-1 rounded-full uppercase tracking-wide">
              Action Required
            </span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm text-left">
              <thead>
                <tr class="text-orange-700 uppercase text-[12px] font-semibold tracking-wider border-b border-orange-100 bg-orange-50/50">
                  <th class="px-5 py-4 text-center">Student</th>
                  <th class="px-5 py-4 text-center">Duration of Stay</th>
                  <th class="px-5 py-4 text-center">Total Amount</th>
                  <th class="px-5 py-4 text-center">Payment</th>
                  <th class="px-5 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-orange-100 text-center">
                <tr v-for="pb in pendingBookings" :key="pb.id" class="hover:bg-white/60 transition-colors">
                  <td class="px-5 py-4">
                    <div class="flex items-center gap-3 justify-center">
                      <div class="w-10 h-10 rounded-full overflow-hidden bg-slate-200 flex-shrink-0">
                        <img :src="pb.profile_pic ? getImageUrl(pb.profile_pic) : `https://ui-avatars.com/api/?name=${encodeURIComponent(pb.student_name)}`" class="w-full h-full object-cover" />
                      </div>
                      <div class="text-left">
                        <p class="font-semibold text-slate-800 text-[13px] uppercase">{{ pb.student_name }}</p>
                        <p class="text-[12px] font-bold text-slate-500 uppercase tracking-tight">{{ pb.contact_number }}</p>
                      </div>
                    </div>
                  </td>
                  <td class="px-5 py-4 text-center font-bold text-slate-700">
                    {{ pb.months }} Month{{ pb.months > 1 ? 's' : '' }}
                  </td>
                  <td class="px-5 py-4 text-center font-semibold text-slate-800">
                    ₱{{ Number(pb.amount).toLocaleString() }}
                  </td>
                  <td class="px-5 py-4 text-center">
                    <span class="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-full uppercase tracking-wide border"
                          :class="pb.payment_method === 'paymongo' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-100 text-slate-500 border-slate-200'">
                      <i class="fa-solid" :class="pb.payment_method === 'paymongo' ? 'fa-mobile-screen-button' : 'fa-money-bill-wave'"></i>
                      {{ pb.payment_method === 'paymongo' ? 'Online (GCash/Card)' : 'Cash' }}
                    </span>
                  </td>
                  <td class="px-5 py-4">
                    <div class="flex items-center justify-center gap-2">
                      <button @click="triggerConfirm('Approve Request?', `Are you sure you want to approve ${pb.student_name}'s booking request?`, () => handleApproveBooking(pb.id))"
                              class="bg-green-500 hover:bg-black text-white text-[12px] font-semibold px-4 py-2 rounded-lg uppercase tracking-wide transition shadow-md shadow-green-100 active:scale-95 cursor-pointer management-button">
                        Approve
                      </button>
                      <button @click="triggerConfirm('Reject Request?', `Are you sure you want to reject ${pb.student_name}'s booking request?`, () => handleRejectBooking(pb.id))"
                              class="bg-red-50 text-red-500 border border-red-100 hover:bg-red-500 hover:text-white text-[12px] font-semibold px-4 py-2 rounded-lg uppercase tracking-wide transition active:scale-95 cursor-pointer management-button">
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Table Section -->
        <section class="bg-white rounded-3xl shadow-sm border border-slate-200/60 overflow-hidden">
          <div class="bg-slate-50/80 px-8 py-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="w-2 h-6 rounded-full" :class="room.gender_type === 'female' ? 'bg-pink-400' : 'bg-blue-400'"></div>
              <h2 class="text-sm font-semibold text-slate-800 uppercase tracking-wide">
                {{ room.room_number }} — Boarder Details
              </h2>
            </div>
            
            <div class="flex items-center gap-3">
              <!-- Occupant Type Filter -->
              <select aria-label="occupant Filter" v-model="occupantFilter" class="bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-[12px] font-semibold uppercase text-slate-700 shadow-sm focus:border-blue-600 outline-none cursor-pointer">
                <option value="all">ALL BOARDERS ({{ occupants.length }})</option>
                <option value="cspc">CSPC STUDENTS ONLY</option>
                <option value="non_cspc">NON-CSPC BOARDERS / STUDENTS</option>
              </select>

              <span class="text-[12px] font-semibold uppercase tracking-wide hidden sm:inline" :class="room.gender_type === 'female' ? 'text-pink-500' : 'text-blue-500'">
                {{ room.gender_type === 'female' ? "Female's Room" : "Male's Room" }}
              </span>
            </div>
          </div>

          <!-- ===== MOBILE ACCORDION (hidden on sm+) ===== -->
          <div class="sm:hidden divide-y divide-slate-100">
            <div v-if="filteredOccupants.length === 0" class="px-5 py-10 text-center text-slate-400 font-bold text-xs uppercase tracking-wide">
              No matching boarders found in this room.
            </div>

            <div v-for="(occ, i) in filteredOccupants" :key="occ.id">
              <!-- Collapsed header row -->
              <button
                @click="toggleOccupant(occ.id)"
                class="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left management-button"
              >
                <!-- Chevron icon -->
                <span class="w-8 h-8 rounded-full border-2 border-slate-200 flex items-center justify-center flex-shrink-0 text-slate-500 transition-transform"
                      :class="expandedOccupants.has(occ.id) ? 'rotate-180 border-blue-400 text-blue-500' : ''">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="font-semibold text-slate-900 uppercase text-sm truncate">{{ occ.name }}</p>
                  </div>
                  <p class="text-[12px] font-bold text-slate-400 uppercase tracking-wider">{{ occ.contact_number || 'No contact' }}</p>
                </div>
                <!-- Status badge -->
                <span v-if="occ.payment_status === 'Paid'" class="bg-emerald-50 text-emerald-600 border border-emerald-100 text-[12px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0">Paid</span>
                <span v-else class="bg-orange-50 text-orange-500 border border-orange-100 text-[12px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0">Unpaid</span>
              </button>

              <!-- Expanded detail panel -->
              <div v-if="expandedOccupants.has(occ.id)" class="px-5 pb-5 bg-slate-50/50 border-t border-slate-100">
                <div class="divide-y divide-slate-100">

                  <!-- Row helper -->
                  <div class="flex items-center justify-between py-2.5">
                    <span class="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">Ref No.</span>
                    <span class="font-bold text-sm text-slate-700">{{ occ.reference_no || 'MANUAL' }}</span>
                  </div>
                  <div class="flex items-center justify-between py-2.5">
                    <span class="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">Check-In</span>
                    <span class="font-bold text-sm text-slate-700">{{ formatDate(occ.check_in_date) }}</span>
                  </div>
                  <div class="flex items-center justify-between py-2.5">
                    <span class="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">Check-Out</span>
                    <span class="font-bold text-sm text-blue-600">{{ getCheckoutDateDisplay(occ) }}</span>
                  </div>
                  <div class="flex items-start justify-between py-2.5 gap-4">
                    <span class="text-[12px] font-semibold text-slate-400 uppercase tracking-wide shrink-0">Address</span>
                    <span class="font-bold text-sm text-slate-700 text-right">{{ occ.address || '—' }}</span>
                  </div>
                  <div class="flex items-center justify-between py-2.5">
                    <span class="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">Contact</span>
                    <span class="font-bold text-sm text-slate-700">{{ occ.contact_number || '—' }}</span>
                  </div>
                  <div class="flex items-center justify-between py-2.5">
                    <span class="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">Emergency</span>
                    <span class="font-bold text-sm text-slate-700">{{ occ.emergency_contact || '—' }}</span>
                  </div>
                  <div class="flex items-center justify-between py-2.5">
                    <span class="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">Duration</span>
                    <span class="font-bold text-sm text-slate-700">{{ occ.months }} Month{{ occ.months > 1 ? 's' : '' }}</span>
                  </div>
                  <div class="flex items-center justify-between py-2.5">
                    <span class="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">Total Rent</span>
                    <div class="text-right">
                      <span class="font-bold text-sm text-slate-700 block">₱{{ calculateTotalRent(occ) ? Number(calculateTotalRent(occ)).toLocaleString() : '0' }}</span>
                      <span class="text-[12px] font-bold text-slate-400 uppercase block">(₱{{ Number(room.price || room.house_price || 0).toLocaleString() }}/mo)</span>
                    </div>
                  </div>
                  <div class="flex items-center justify-between py-2.5">
                    <span class="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">Monthly Rent Status</span>
                    <div class="flex items-center gap-1.5">
                      <span class="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider"
                            :class="occ.payment_status === 'Paid' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-orange-50 text-orange-600 border border-orange-100'">
                        <i class="fa-solid" :class="occ.payment_status === 'Paid' ? 'fa-circle-check' : 'fa-clock'"></i>
                        {{ occ.payment_status === 'Paid' ? 'Rent Paid' : 'Rent Due' }}
                      </span>
                      <button @click="handleTogglePayment(occ)"
                              class="text-[12px] font-semibold px-2 py-0.5 rounded-lg uppercase tracking-wider transition-all duration-200 cursor-pointer border shadow-sm management-button"
                              :class="occ.payment_status === 'Paid' ? 'bg-slate-100 hover:bg-orange-500 hover:text-white text-slate-600 border-slate-200' : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'">
                        {{ occ.payment_status === 'Paid' ? 'Mark Unpaid' : 'Mark Paid' }}
                      </button>
                    </div>
                  </div>
                  <div class="flex items-center justify-between py-2.5">
                    <span class="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">Move-in Upfront</span>
                    <div class="flex flex-col items-end gap-0.5">
                      <span class="font-bold text-xs text-emerald-700">₱{{ formatMoveInLedger(occ).total.toLocaleString('en-US', {minimumFractionDigits:2}) }}</span>
                      <template v-if="occ.payment_method === 'paymongo'">
                        <span class="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <i class="fa-solid fa-mobile-screen-button"></i>
                          Upfront Paid (Online)
                        </span>
                      </template>
                      <template v-else>
                        <span class="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider"
                              :class="isUpfrontCollected(occ) ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-orange-50 text-orange-600 border border-orange-200'">
                          <i class="fa-solid" :class="isUpfrontCollected(occ) ? 'fa-money-bill-wave' : 'fa-clock'"></i>
                          {{ getUpfrontLabel(occ) }}
                        </span>
                        <button @click="handleToggleUpfront(occ)" class="text-[12px] font-semibold text-slate-400 hover:text-blue-600 uppercase tracking-wider underline cursor-pointer mt-0.5">
                          {{ getUpfrontActionLabel(occ) }}
                        </button>
                      </template>
                    </div>
                  </div>
                  <div class="flex items-center justify-between py-2.5">
                    <span class="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">Action</span>
                    <button @click="triggerConfirm('Confirm Checkout?', `Are you sure you want to checkout ${occ.name}?`, () => handleCheckoutOccupant(occ.id))"
                            class="hover:bg-red-500 hover:text-white text-slate-400 border border-slate-200 text-[12px] font-semibold px-3 py-1.5 rounded-lg uppercase tracking-wider transition-all duration-200 cursor-pointer management-button">
                      Checkout
                    </button>
                  </div>

                </div>
              </div>
            </div>
          </div>
          <!-- ===== END MOBILE ACCORDION ===== -->

          <!-- ===== DESKTOP TABLE (hidden on mobile) ===== -->
          <div class="hidden sm:block overflow-x-auto">
            <table class="w-full text-[12px] text-left border-collapse min-w-[1200px]">
              <thead>
                <tr class="text-slate-500 uppercase text-[12px] font-semibold tracking-wider border-b border-slate-100 bg-slate-50/50">
                  <th class="px-3 py-4 text-center">#</th>
                  <th class="px-3 py-4 text-center">Ref No.</th>
                  <th class="px-3 py-4">Student Name</th>
                  <th class="px-3 py-4 text-center">Check-In /<br/>Check-Out</th>
                  <th class="px-3 py-4">Address</th>
                  <th class="px-3 py-4 text-center">Contact</th>
                  <th class="px-3 py-4 text-center">Emergency</th>
                  <th class="px-3 py-4 text-center">Duration</th>
                  <th class="px-3 py-4 text-center whitespace-nowrap">Total Rent</th>
                  <th class="px-3 py-4 text-center bg-emerald-50 text-emerald-700 whitespace-nowrap">Move-in Upfront<br/>Fee</th>
                  <th class="px-3 py-4 text-center whitespace-nowrap">Monthly Rent<br/>Status</th>
                  <th class="px-3 py-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-if="filteredOccupants.length === 0">
                  <td colspan="12" class="px-8 py-12 text-center text-slate-400 font-bold text-xs uppercase tracking-wide">
                    No matching boarders found in this room.
                  </td>
                </tr>
                <tr v-for="(occ, i) in filteredOccupants" :key="occ.id" class="hover:bg-slate-50/50 transition-colors">
                  <td class="px-3 py-4 text-center font-bold text-slate-500">{{ i + 1 }}</td>
                  <td class="px-3 py-4 text-center font-mono font-bold text-slate-500">{{ occ.reference_no || 'MANUAL' }}</td>
                  <td class="px-3 py-4 font-bold text-slate-800 uppercase whitespace-nowrap">
                    {{ occ.name }}
                  </td>
                  <td class="px-3 py-4 text-center font-bold text-slate-700 whitespace-nowrap">
                    <span class="block text-xs font-bold text-slate-700">{{ formatDate(occ.check_in_date) }}</span>
                    <span class="block text-[12px] font-bold text-blue-600 mt-0.5">{{ getCheckoutDateDisplay(occ) }}</span>
                  </td>
                  <td class="px-3 py-4 font-bold text-slate-700 whitespace-normal min-w-[200px]">{{ occ.address || '—' }}</td>
                  <td class="px-3 py-4 text-center font-bold text-slate-700">{{ occ.contact_number || '—' }}</td>
                  <td class="px-3 py-4 text-center font-bold text-slate-700">{{ occ.emergency_contact || '—' }}</td>
                  <td class="px-3 py-4 text-center font-bold text-slate-700 whitespace-nowrap">{{ occ.months }} Month{{ occ.months > 1 ? 's' : '' }}</td>
                  <td class="px-3 py-4 text-center font-bold text-slate-700 whitespace-nowrap">
                    ₱{{ calculateTotalRent(occ) ? Number(calculateTotalRent(occ)).toLocaleString() : '0' }}
                    <span class="block text-[12px] text-slate-400 font-bold uppercase mt-0.5">(₱{{ Number(room.price || room.house_price || 0).toLocaleString() }}/mo)</span>
                  </td>
                  <!-- Move-in Ledger Column -->
                  <td class="px-3 py-4 text-left bg-emerald-50/40">
                    <template v-if="formatMoveInLedger(occ).total > 0">
                      <div class="flex flex-col gap-1">
                        <div class="flex items-center justify-between gap-2">
                          <span class="font-semibold text-sm text-emerald-800">₱{{ formatMoveInLedger(occ).total.toLocaleString('en-US', {minimumFractionDigits:2}) }}</span>
                          <!-- Online badge (PayMongo - Automated) -->
                          <span v-if="occ.payment_method === 'paymongo'" class="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0 whitespace-nowrap">
                            <i class="fa-solid fa-mobile-screen-button"></i>
                            Upfront Paid (Online)
                          </span>
                          <!-- Cash badge -->
                          <span v-else class="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider shrink-0 whitespace-nowrap"
                                :class="isUpfrontCollected(occ) ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-orange-50 text-orange-600 border border-orange-200'">
                            <i class="fa-solid" :class="isUpfrontCollected(occ) ? 'fa-money-bill-wave' : 'fa-clock'"></i>
                            {{ getUpfrontLabel(occ) }}
                          </span>
                        </div>
                        <!-- Cash toggle button -->
                        <button v-if="occ.payment_method !== 'paymongo'" @click="handleToggleUpfront(occ)" class="self-end text-[12px] font-semibold text-slate-400 hover:text-blue-600 uppercase tracking-tighter underline cursor-pointer">
                          {{ getUpfrontActionLabel(occ) }}
                        </button>
                      </div>
                      <span v-if="formatMoveInLedger(occ).advM > 0" class="block text-[12px] font-bold text-slate-500 leading-tight mt-1">
                        Advance Rent: ₱{{ formatMoveInLedger(occ).advAmt.toLocaleString('en-US', {minimumFractionDigits:2}) }}
                      </span>
                      <span v-if="formatMoveInLedger(occ).depM > 0" class="block text-[12px] font-bold text-slate-500 leading-tight">
                        {{ formatMoveInLedger(occ).friendlyType }} Deposit: ₱{{ formatMoveInLedger(occ).depAmt.toLocaleString('en-US', {minimumFractionDigits:2}) }}
                      </span>
                      <span v-if="formatMoveInLedger(occ).depM > 0 && formatMoveInLedger(occ).depositType === 'consumable'" class="block text-[12px] italic text-amber-500 leading-tight mt-0.5">
                        Usable as last month's rent
                      </span>
                      <span v-else-if="formatMoveInLedger(occ).depM > 0 && formatMoveInLedger(occ).depositType === 'refundable'" class="block text-[12px] italic text-blue-400 leading-tight mt-0.5">
                        Return on move-out
                      </span>
                    </template>
                    <template v-else>
                      <span class="text-slate-400 font-bold">No Deposit / Advance</span>
                    </template>
                  </td>
                  <!-- Monthly Rent Status Column -->
                  <td class="px-3 py-4 text-center whitespace-nowrap">
                    <div class="flex flex-col items-center gap-1.5">
                      <span class="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider"
                            :class="occ.payment_status === 'Paid' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-orange-50 text-orange-600 border border-orange-100'">
                        <i class="fa-solid" :class="occ.payment_status === 'Paid' ? 'fa-circle-check' : 'fa-clock'"></i>
                        {{ occ.payment_status === 'Paid' ? 'Rent Paid' : 'Rent Due' }}
                      </span>
                      <button @click="handleTogglePayment(occ)"
                              class="text-[12px] font-semibold px-2.5 py-1 rounded-lg uppercase tracking-wider transition-all duration-200 cursor-pointer border shadow-sm management-button"
                              :class="occ.payment_status === 'Paid' ? 'bg-slate-100 hover:bg-orange-500 hover:text-white text-slate-600 border-slate-200' : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'">
                        {{ occ.payment_status === 'Paid' ? 'Mark Unpaid' : 'Mark Paid' }}
                      </button>
                    </div>
                  </td>
                  <!-- Action Column -->
                  <td class="px-3 py-4 text-center">
                    <button @click="triggerConfirm('Confirm Checkout?', `Are you sure you want to checkout ${occ.name}? This will free their slot in this room.`, () => handleCheckoutOccupant(occ.id))"
                            class="hover:bg-red-500 hover:text-white text-slate-400 border border-slate-200 text-[12px] font-semibold px-2.5 py-1 rounded-lg uppercase tracking-wider transition-all duration-200 shadow-sm active:scale-95 cursor-pointer management-button">
                      Checkout
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <!-- ===== END DESKTOP TABLE ===== -->

        </section>

        <!-- Action Buttons -->
        <div class="mt-8 flex flex-wrap justify-center gap-4 pb-16">
          <button @click="openAddModal"
                  class="bg-blue-500 hover:bg-blue-600 active:scale-95 text-white px-8 py-3.5 rounded-full font-semibold text-[13px] uppercase tracking-wide shadow-lg shadow-blue-200 transition-all duration-200 flex items-center gap-3 cursor-pointer management-button management-button-primary">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            Add Non-CSPC Occupant
          </button>

        </div>
      </div>
    </main>

    <!-- ===== Add Non-CSPC Occupant Modal ===== -->
    <div v-management-dialog="{ close: () => closeAddModal() }" v-show="showAddModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] overflow-y-auto flex items-start justify-center p-4 py-8 animate-fade-in">
      <div class="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl p-10 relative text-left animate-in zoom-in duration-200">
        <div class="flex justify-between items-center mb-8">
          <div>
            <h2 class="text-xl font-semibold text-slate-900 uppercase tracking-tight">Add Non-CSPC Occupant</h2>
            <p class="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">Room: {{ room.room_number }}</p>
          </div>
          <button aria-label="Close dialog" @click="closeAddModal" class="text-slate-300 hover:text-slate-900 transition text-3xl leading-none focus:outline-none cursor-pointer">&times;</button>
        </div>

        <form @submit.prevent="handleAddNonCspc" class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div class="md:col-span-2">
            <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2">Full Name *</label>
            <input aria-label="Full Name" v-model="newOccupant.name" type="text" required placeholder="e.g. Juan Dela Cruz" class="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
          <div>
            <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2">Age</label>
            <input aria-label="Age" v-model="newOccupant.age" type="number" min="1" max="120" step="1" placeholder="20" class="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
          <div>
            <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2">Contact Number</label>
            <input aria-label="Contact Number" v-model="newOccupant.contact_number" @input="sanitizePhoneInput('contact_number')" type="text" inputmode="numeric" maxlength="11" placeholder="09xxxxxxxxx" class="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
          <div>
            <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2">Check-in Date</label>
            <input aria-label="Check-in Date" v-model="newOccupant.check_in_date" type="date" min="1000-01-01" max="9999-12-31" class="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
          <div>
            <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2">Duration of Stay (Months)</label>
            <input aria-label="Duration of Stay (Months)" v-model="newOccupant.months" type="number" min="1" max="2147483647" step="1" class="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
          <div>
            <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2">Emergency Contact</label>
            <input aria-label="Emergency Contact" v-model="newOccupant.emergency_contact" @input="sanitizePhoneInput('emergency_contact')" type="text" inputmode="numeric" maxlength="11" placeholder="09xxxxxxxxx" class="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
          <div>
            <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2">Guardian Name</label>
            <input aria-label="Guardian Name" v-model="newOccupant.guardian_name" type="text" placeholder="Guardian's full name" class="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
          <div>
            <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2">Monthly Rent Status</label>
            <select aria-label="Monthly Rent Status" v-model="newOccupant.payment_status" class="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition appearance-none cursor-pointer">
              <option value="Not Paid">Not Paid</option>
              <option value="Paid">Paid</option>
            </select>
          </div>
          <div>
            <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2">Move-In Upfront</label>
            <select aria-label="Move-In Upfront" v-model="newOccupant.upfront_status" class="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition appearance-none cursor-pointer">
              <option value="Unpaid">Not Collected</option>
              <option value="Paid">Collected</option>
            </select>
          </div>
          <div class="md:col-span-2">
            <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2">Address</label>
            <input aria-label="Address" v-model="newOccupant.address" type="text" placeholder="Barangay, Municipality, Province" class="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
          <div class="md:col-span-2 pt-4 border-t border-slate-100">
            <button type="submit" :disabled="isSavingNonCspc" class="w-full bg-blue-600 hover:bg-black text-white font-semibold py-4 rounded-xl text-[12px] uppercase tracking-wide transition shadow-xl active:scale-95 disabled:opacity-50 cursor-pointer management-button management-button-primary">
              {{ isSavingNonCspc ? 'Saving Occupant...' : 'Save Occupant' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ===== Checkout Non-CSPC Occupant Modal ===== -->
    <div v-management-dialog="{ close: () => closeRemoveModal() }" v-show="showRemoveModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] overflow-y-auto flex items-center justify-center p-4 animate-fade-in">
      <div class="bg-white w-full max-w-md rounded-[2rem] shadow-2xl p-10 text-left animate-in zoom-in duration-200">
        <div class="flex justify-between items-center mb-8">
          <h2 class="text-xl font-semibold text-slate-900 uppercase tracking-tight">Checkout Non-CSPC</h2>
          <button aria-label="Close dialog" @click="closeRemoveModal" class="text-slate-300 hover:text-slate-900 transition text-3xl leading-none focus:outline-none cursor-pointer">&times;</button>
        </div>
        <p class="text-xs text-slate-500 font-bold uppercase tracking-wider mb-6">Select an occupant to checkout from this room:</p>
        <div class="space-y-3">
          <template v-for="occ in occupants" :key="occ.id">
            <div v-if="occ.is_non_cspc" class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-4 animate-fade-in">
              <div>
                <p class="text-sm font-semibold text-slate-800">{{ occ.name }}</p>
                <p class="text-[12px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{{ occ.reference_no || 'MANUAL' }}</p>
              </div>
              <button @click="triggerConfirm('Confirm Checkout?', `Are you sure you want to checkout ${occ.name}? This will free their slot in this room.`, () => handleCheckoutOccupant(occ.id))"
                      class="bg-red-50 hover:bg-red-500 hover:text-white text-red-500 border border-red-200 text-[12px] font-semibold px-4 py-2 rounded-lg uppercase tracking-wider transition cursor-pointer management-button">
                Checkout
              </button>
            </div>
          </template>
        </div>
        <button @click="closeRemoveModal" class="mt-6 w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-3 rounded-xl text-[12px] uppercase tracking-wide transition cursor-pointer management-button">Cancel</button>
      </div>
    </div>

    <!-- =====  Custom Confirmation Modal ===== -->
    <div v-management-dialog="{ close: () => showConfirmModal = false }" v-if="showConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div class="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full text-center border border-slate-100 animate-in zoom-in-95 duration-200">
        <div class="text-[#2a528a] mb-4 flex justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-slate-900 uppercase tracking-tight mb-2">{{ confirmTitle }}</h3>
        <p class="text-slate-500 text-xs font-medium mb-6 leading-relaxed">{{ confirmMessage }}</p>
        
        <div class="flex gap-3">
          <button @click="executeConfirm" :disabled="isProcessingDecision" class="flex-1 bg-blue-600 hover:bg-black text-white text-[12px] font-semibold py-3.5 rounded-xl uppercase tracking-wide transition active:scale-95 cursor-pointer management-button management-button-primary">
            Confirm
          </button>
          <button @click="showConfirmModal = false" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[12px] font-semibold py-3.5 rounded-xl uppercase tracking-wide transition active:scale-95 cursor-pointer management-button">
            Cancel
          </button>
        </div>
      </div>
    </div>

  </div>
</template>
