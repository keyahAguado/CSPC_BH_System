<script setup>
import UserAvatar from "../../components/UserAvatar.vue";
import { confirmTone } from '../../utils/confirmTone.js';
import BookingTestClock from '../../components/BookingTestClock.vue';
import {ownerTimestamp,ownerDate,ownerStayEnd} from '../../utils/ownerBookingDisplay.js';
import UpcomingReservations from '../../components/UpcomingReservations.vue';
import ReservationDeadline from '../../components/ReservationDeadline.vue';
import OwnerRoomSummary from '../../components/OwnerRoomSummary.vue';
import BookingArrivalActions from '../../components/BookingArrivalActions.vue';
import LoadError from '../../components/management/LoadError.vue';

import PageHeader from '../../components/management/PageHeader.vue';
import '../../styles/management.css';
import '../../styles/admin-theme.css';
import '../../styles/owner-pages.css';
import { vManagementDialog } from '../../components/management/dialogAccessibility.js';
import { validateInput } from '../../utils/inputValidation.js';
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import OwnerNav from '../../components/partials/OwnerNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';
import { getImageUrl } from '../../config/api.js';
import { normalizePhPhone, isValidPhPhone } from '../../utils/phoneValidation.js';
import { occupantAwaitingArrival, occupantNotArrived, manilaDay, scheduledDay } from '../../utils/bookingArrival.js';
import '../../styles/owner-badges.css';

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
const roomId = computed(() => route.params.id);

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

const roomLabel = computed(() => /^(room|bed|unit|cottage|house)\b/i.test(String(room.value.room_number)) ? room.value.room_number : 'Room ' + room.value.room_number);
const toggleBoarderRow = (event,id) => { if (!event.target.closest('button,a,input,select,label')) toggleOccupant(id); };
const roomSubtitle = computed(() => (room.value.gender_type === 'female' ? "Female's Room" : "Male's Room") + ' / ' + (room.value.floor_label || 'Floor not specified') + ' / ' + (Number(room.value.capacity) > 1 ? 'Shared room' : 'Single room'));
const occupants = ref([]);
const pendingBookings = ref([]);
const upcomingBookings = ref([]);
const checkoutAttention=computed(()=>occupants.value.filter(o=>!o.check_out_date && ownerStayEnd(o) && ownerStayEnd(o)<=manilaDay()));
const occupantFilter = ref('all'); // Filter: 'all', 'cspc', 'non_cspc'

const isNonCspc = (occupant) => occupant.is_non_cspc === true || Number(occupant.is_non_cspc) === 1;
const filteredOccupants = computed(() => {
  if (occupantFilter.value === 'cspc') {
    return occupants.value.filter(o => !isNonCspc(o));
  }
  if (occupantFilter.value === 'non_cspc') {
    return occupants.value.filter(o => isNonCspc(o));
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

let roomLoadVersion = 0;
const fetchRoomDetails = async () => {
  const requestVersion = ++roomLoadVersion;
  const requestedRoomId = String(roomId.value || '');
  loadError.value = '';
  isLoading.value = true;
  try {
    const response = await axios.get(`/api/owner/rooms/details/${requestedRoomId}`, {
      timeout: 15000,
      headers: { Authorization: `Bearer ${token}` }
    });
    if (requestVersion !== roomLoadVersion) return;
    const data = response.data;
    if (!data?.success || !data.room || String(data.room.id) !== requestedRoomId || !Array.isArray(data.occupants) || !Array.isArray(data.pendingBookings)) {
      throw new Error('Incomplete or mismatched room details response');
    }
    room.value = data.room;
    occupants.value = data.occupants;
    pendingBookings.value = data.pendingBookings;
    upcomingBookings.value = data.upcomingBookings || [];
  } catch (error) {
    if (requestVersion !== roomLoadVersion) return;
    loadError.value = error.response?.status === 404
      ? 'This room could not be found. Return to Manage Rooms and open it again.'
      : 'Could not load this room and its boarders. Please try again.';
    console.error('Failed to load room details:', error);
    showSystemAlert('Could not fetch room and boarders information.', 'warning');
  } finally {
    if (requestVersion === roomLoadVersion) isLoading.value = false;
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

// Cash upfront fees stay unpaid until the owner confirms collection.
const isUpfrontCollected = (occupant) => occupant.payment_method === 'paymongo' || occupant.upfront_status === 'Paid';

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

// Arrival is confirmed by the owner from the check-in date; it is separate from payment.
const canConfirmArrival = occupant => occupantAwaitingArrival(occupant) && !!scheduledDay(occupant) && scheduledDay(occupant) <= manilaDay();
const arrivalLabel = occupant => occupantNotArrived(occupant) ? 'Not arrived (recorded)' : scheduledDay(occupant) && scheduledDay(occupant) < manilaDay() ? 'Move-in review' : 'Arrival pending';
// Boarder rows are occupant records; the non-arrival actions work on the linked booking (REF-0064 -> 64).
// The server rechecks status, payment and dates, so this only decides which buttons to offer.
const occupantBooking = (occ) => {
  const id = Number(/^REF-(\d+)$/.exec(String(occ.reference_no || ''))?.[1]);
  if (!id || Number(occ.is_non_cspc) || !occ.student_id) return null;
  const onlinePaid = occ.payment_method === 'paymongo' && String(occ.upfront_status || '').toLowerCase() === 'paid';
  return { id, status: 'confirmed', move_in_required: 1, payment_review_required: 0, student_name: occ.name, occupant_id: occ.id,
    occupant_arrival_required: occ.arrival_required, occupant_arrival_confirmed_at: occ.arrival_confirmed_at, occupant_check_out: occ.check_out_date,
    occupant_non_arrival_recorded_at: occ.non_arrival_recorded_at, occupant_check_in: occ.check_in_date, check_in_date: occ.check_in_date, months: occ.months,
    payment_method: occ.payment_method, paymongo_payment_id: onlinePaid ? 'recorded' : null, occupant_upfront_status: occ.upfront_status, occupant_payment_status: occ.payment_status,
    advance_months: occ.advance_months, deposit_months: occ.deposit_months, deposit_type: occ.deposit_type };
};
const handleConfirmArrival = async (occupant) => {
  try {
    const response = await axios.post(`/api/owner/rooms/occupants/arrival/${occupant.id}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.data.success) {
      showSystemAlert(response.data.message || 'Arrival confirmed.', 'success');
      fetchRoomDetails();
    }
  } catch (error) {
    console.error('Arrival confirmation failed:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to confirm arrival.', 'error');
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
  if (occ.check_out_date) return formatDate(occ.check_out_date);
  if (!occ.check_in_date) return '—';
  const computedDate = computeCheckoutDate(occ.check_in_date, occ.months || 1);
  return formatCheckoutDateString(computedDate);
};

let reservationRefreshInFlight=false;
const refreshReservationState=async()=>{
 if(reservationRefreshInFlight || document.visibilityState!=='visible' || isLoading.value || loadError.value || isProcessingDecision.value || isSavingNonCspc.value || showAddModal.value || showRemoveModal.value || showConfirmModal.value || document.querySelector('dialog[open]'))return;
 const id=String(roomId.value),version=roomLoadVersion;reservationRefreshInFlight=true;
 try{
  const {data}=await axios.get('/api/owner/rooms/details/'+id,{timeout:15000,headers:{Authorization:'Bearer '+token}});
  if(version!==roomLoadVersion || id!==String(roomId.value) || showAddModal.value || showRemoveModal.value || showConfirmModal.value || isProcessingDecision.value || document.querySelector('dialog[open]'))return;
  if(data?.success && String(data.room?.id)===id && Array.isArray(data.pendingBookings) && Array.isArray(data.occupants)){
   room.value=data.room;occupants.value=data.occupants;pendingBookings.value=data.pendingBookings;upcomingBookings.value=data.upcomingBookings || [];
  }
 }catch{/* Keep the last successful view; manual Refresh requests can report a connection error. */}finally{reservationRefreshInFlight=false;}
};
let reservationRefreshTimer;
onMounted(() => {
 fetchRoomDetails();reservationRefreshTimer=setInterval(refreshReservationState,30000);
 window.addEventListener('focus',refreshReservationState);document.addEventListener('visibilitychange',refreshReservationState);
});
onUnmounted(()=>{clearInterval(reservationRefreshTimer);window.removeEventListener('focus',refreshReservationState);document.removeEventListener('visibilitychange',refreshReservationState);});
watch(roomId, (next, previous) => {
  if (String(next) === String(previous)) return;
  occupantFilter.value = 'all';
  expandedOccupants.value = new Set();
  fetchRoomDetails();
});

const loadError = ref('');
</script>

<template>
  <div class="management-page owner-page room-details-refined bg-slate-100 min-h-screen flex flex-col font-sans">
    <OwnerNav />
    <div aria-live="polite" aria-atomic="false"><FlashAlert ref="alertRef" /></div>

    <main id="management-content" tabindex="-1" class="room-details-content flex-1 max-w-[1750px] mx-auto w-[96%] py-12 px-2 lg:px-6 text-left animate-in fade-in duration-300">
      <BookingTestClock />
      <LoadError :message="loadError" /><div v-if="loadError && !isLoading" class="mb-6"><button type="button" @click="fetchRoomDetails" class="management-button management-button-primary px-4 py-2">Retry loading room and boarders</button></div>
      <!-- Header -->
      <div class="room-details-page-header">
        <router-link :to="'/owner/rooms/' + room.house_id"
           class="text-[#2a528a] font-semibold text-[12px] uppercase tracking-wide hover:text-blue-800 transition inline-flex items-center gap-2 mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          BACK TO ROOMS
        </router-link>
        
        <PageHeader v-if="loadError || !room.id" title="Room details" /><header v-else class="rd-heading"><p class="rd-eyebrow">{{ roomLabel }}<span>Room details</span></p><h1>{{ roomSubtitle.split(' / ')[0] }}</h1><p class="rd-subtitle"><span>{{ room.floor_label || 'Floor not specified' }}</span><span aria-hidden="true">/</span><span>{{ Number(room.capacity)>1 ? 'Shared room' : 'Single room' }}</span></p></header>
      </div>

      <OwnerRoomSummary v-if="!isLoading && !loadError && room.id" :room="room" :occupant-count="occupants.length" />

      <!-- Loading State -->
      <div v-if="isLoading" class="p-20 text-center bg-white rounded-[2.5rem] shadow-sm border border-slate-200/60 flex flex-col items-center justify-center">
        <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
        <p class="text-slate-400 font-bold uppercase text-[12px] tracking-wide">Loading Room and Boarders...</p>
      </div>

      <div v-else-if="!loadError && room.id" class="room-details-sections space-y-10">
        <aside v-if="checkoutAttention.length" class="checkout-attention" role="status"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i><div><h2>Checkout needs attention</h2><p v-for="o in checkoutAttention" :key="o.id"><strong>{{ o.name }}</strong> &mdash; planned checkout {{ ownerDate(ownerStayEnd(o)) }}.</p><p>Confirm whether the resident has left. Record actual checkout in Boarder Details after departure, or review an extension. An unclosed stay may prevent the next stay from starting; a reminder does not release the bed.</p><a href="#boarder-records">Review boarder records <i class="fa-solid fa-arrow-down" aria-hidden="true"></i></a></div></aside>
        <UpcomingReservations :bookings="upcomingBookings" @changed="fetchRoomDetails" @notice="n=>typeof n==='string' ? showSystemAlert(n,'success') : showSystemAlert(n?.message,n?.tone || 'success')" />
        <!-- Pending Reservations Section -->
        <section v-if="pendingBookings && pendingBookings.length > 0" class="pending-requests">
          <div class="rd-section-heading rd-pending-heading bg-orange-100/50 px-8 py-5 border-b border-orange-200 flex items-center gap-3">
            <div class="rd-section-marker w-2 h-6 bg-orange-500 rounded-full"></div>
            <div class="rd-section-title"><h2>Pending Reservation Requests</h2><p>Review and respond before the deadline</p></div>
            <button type="button" class="pending-refresh" @click="fetchRoomDetails" :disabled="isLoading"><i class="fa-solid fa-rotate" aria-hidden="true"></i>Refresh requests</button><span class="o-badge amber">
              <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>Action required
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
                  <th class="px-5 py-4 text-center">Response deadline</th><th class="px-5 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-orange-100 text-center">
                <tr v-for="pb in pendingBookings" :key="pb.id" class="hover:bg-white/60 transition-colors">
                  <td data-label="Student" class="px-5 py-4">
                    <div class="pending-student">
                      <div class="w-10 h-10 rounded-full overflow-hidden bg-slate-200 flex-shrink-0">
                        <UserAvatar :src="pb.profile_pic" :name="pb.student_name" class="w-full h-full rounded-full" />
                      </div>
                      <div class="text-left">
                        <p class="font-semibold text-slate-800 text-[13px] uppercase">{{ pb.student_name }}</p>
                        <p class="text-[12px] font-bold text-slate-500 uppercase tracking-tight">{{ pb.contact_number }}</p>
                      </div>
                    </div>
                  </td>
                  <td data-label="Duration of stay" class="px-5 py-4 text-center font-bold text-slate-700">
                    {{ pb.months }} Month{{ pb.months > 1 ? 's' : '' }}
                  </td>
                  <td data-label="Total amount" class="px-5 py-4 text-center font-semibold text-slate-800">
                    ₱{{ Number(pb.amount).toLocaleString() }}
                  </td>
                  <td data-label="Payment" class="px-5 py-4 text-center">
                    <span :class="['o-badge', pb.payment_method === 'paymongo' ? 'purple' : 'slate']">
                      <i class="fa-solid" :class="pb.payment_method === 'paymongo' ? 'fa-mobile-screen-button' : 'fa-money-bill-wave'"></i>
                      {{ pb.payment_method === 'paymongo' ? 'Online (GCash/Card)' : 'Cash' }}
                    </span>
                  </td>
                  <td data-label="Response deadline" class="pending-deadline"><span v-if="Number(pb.renewal_waiting)" class="pending-hold"><strong><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i>On hold until a resident decides</strong><span>A current resident may extend their stay into these dates. Their decision is due <b>{{ ownerTimestamp(pb.renewal_wait_until) }}</b>.</span><span>You can approve or reject this request after that. The student has not been asked to pay.</span></span><ReservationDeadline v-else :booking="pb" owner /></td>
                  <td data-label="Actions" class="px-5 py-4">
                    <div class="flex items-center justify-center gap-2">
                      <button @click="triggerConfirm('Approve Request?', `Approve a reservation for ${pb.student_name}? This reserves a bed. ${pb.payment_method === 'cash' ? 'Cash is collected at actual arrival.' : 'Online payment is due within 24 hours, or by the end of the check-in day if sooner.'} The stay starts automatically on the booked check-in date. Cash collection is recorded separately.`, () => handleApproveBooking(pb.id))"
                              type="button" :class="['bd-btn', Number(pb.renewal_waiting) ? 'is-hold' : 'is-approve']" :disabled="Number(pb.renewal_waiting) || isProcessingDecision" :title="Number(pb.renewal_waiting) ? 'On hold until the current resident decides to extend or leave.' : 'Approve this request if its dates fit'">
                        <template v-if="Number(pb.renewal_waiting)"><i class="fa-solid fa-lock" aria-hidden="true"></i> On hold</template><template v-else>Approve</template>
                      </button>
                      <button @click="triggerConfirm('Reject Request?', `Are you sure you want to reject ${pb.student_name}'s booking request?`, () => handleRejectBooking(pb.id))"
                              type="button" class="bd-btn is-reject">
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
        <section id="boarder-records" class="boarder-section bg-white rounded-3xl shadow-sm border border-slate-200/60 overflow-hidden">
          <div class="rd-section-heading rd-boarder-heading bg-slate-50/80 px-8 py-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="w-2 h-6 rounded-full" :class="room.gender_type === 'female' ? 'bg-pink-400' : 'bg-blue-400'"></div>
              <h2 class="rd-boarder-title text-sm font-semibold text-slate-800 uppercase tracking-wide">
                {{ room.room_number }} — Boarder Details
              </h2><p class="boarder-row-hint">Select a row to view additional information / {{ occupants.length }} occupants</p>
            </div>
            
            <div class="boarder-toolbar-actions">
              <label class="boarder-type-filter"><span class="sr-only">Occupant Filter</span><i class="fa-solid fa-users" aria-hidden="true"></i><select aria-label="occupant Filter" v-model="occupantFilter"><option value="all">ALL BOARDERS ({{ occupants.length }})</option><option value="cspc">CSPC STUDENTS ONLY</option><option value="non_cspc">NON-CSPC BOARDERS / STUDENTS</option></select><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></label>
              <button @click="openAddModal"
                  class="bg-blue-500 hover:bg-blue-600 active:scale-95 text-white px-4 py-2.5 rounded-lg font-semibold text-[12px] uppercase tracking-wide shadow-lg shadow-blue-200 transition-all duration-200 flex items-center gap-3 cursor-pointer management-button management-button-primary">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            Add Non-CSPC Occupant
          </button>
            </div>
          </div>

          <!-- ===== MOBILE ACCORDION (hidden on sm+) ===== -->
          <div class="boarder-mobile divide-y divide-slate-100">
            <div v-if="filteredOccupants.length === 0" class="rd-empty px-5 py-10 text-center text-slate-400 font-bold text-xs uppercase tracking-wide">
              No matching boarders found in this room.<button v-if="occupants.length && occupantFilter !== 'all'" type="button" @click="occupantFilter = 'all'" class="block mx-auto mt-3 text-blue-600 underline">Show all boarders</button>
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
                    <span v-if="occupantAwaitingArrival(occ)" class="o-badge amber small"><i class="fa-solid fa-door-open" aria-hidden="true"></i>{{ arrivalLabel(occ) }}</span>
                  </div>
                  <p class="text-[12px] font-bold text-slate-400 uppercase tracking-wider">{{ occ.contact_number || 'No contact' }}</p>
                </div>
                <!-- Status badge -->
                <span v-if="occ.payment_status === 'Paid'" class="o-badge green flex-shrink-0"><i class="fa-solid fa-circle-check" aria-hidden="true"></i>Rent Paid</span>
                <span v-else class="o-badge amber flex-shrink-0"><i class="fa-solid fa-clock" aria-hidden="true"></i>Rent Due</span>
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
                      <span class="text-[12px] font-bold text-slate-400 uppercase block">(₱{{ Number(room.price || room.house_price || 0).toLocaleString() }}/month)</span>
                    </div>
                  </div>
                  <div class="flex items-center justify-between py-2.5">
                    <span class="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">Monthly Rent Status</span>
                    <div class="flex items-center gap-1.5">
                      <span :class="['o-badge', occ.payment_status === 'Paid' ? 'green' : 'amber']">
                        <i class="fa-solid" :class="occ.payment_status === 'Paid' ? 'fa-circle-check' : 'fa-clock'"></i>
                        {{ occ.payment_status === 'Paid' ? 'Rent Paid' : 'Rent Due' }}
                      </span>
                      <button type="button" @click="handleTogglePayment(occ)" :class="['bd-btn', occ.payment_status === 'Paid' ? 'is-undo' : 'is-pay']">
                        <i :class="['fa-solid', occ.payment_status === 'Paid' ? 'fa-rotate-left' : 'fa-check']" aria-hidden="true"></i>{{ occ.payment_status === 'Paid' ? 'Mark rent unpaid' : 'Mark rent paid' }}
                      </button>
                    </div>
                  </div>
                  <div class="flex items-center justify-between py-2.5">
                    <span class="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">Move-in Upfront</span>
                    <div class="flex flex-col items-end gap-0.5">
                      <span class="font-bold text-xs text-emerald-700">₱{{ formatMoveInLedger(occ).total.toLocaleString('en-US', {minimumFractionDigits:2}) }}</span>
                      <template v-if="occ.payment_method === 'paymongo'">
                        <span class="o-badge payment green">
                          <i class="fa-solid fa-mobile-screen-button"></i>
                          Upfront Paid (Online)
                        </span>
                      </template>
                      <template v-else>
                        <span :class="['o-badge', 'payment', isUpfrontCollected(occ) ? 'green' : 'amber']">
                          <i class="fa-solid" :class="isUpfrontCollected(occ) ? 'fa-money-bill-wave' : 'fa-clock'"></i>
                          {{ getUpfrontLabel(occ) }}
                        </span>
                        <button type="button" @click="handleToggleUpfront(occ)" :class="['bd-btn', isUpfrontCollected(occ) ? 'is-undo' : 'is-pay']">
                          <i :class="['fa-solid', isUpfrontCollected(occ) ? 'fa-rotate-left' : 'fa-check']" aria-hidden="true"></i>{{ getUpfrontActionLabel(occ) }}
                        </button>
                      </template>
                    </div>
                  </div>
                  <div class="flex items-center justify-between py-2.5">
                    <span class="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">Action</span>
                    <button v-if="canConfirmArrival(occ)" type="button" @click="triggerConfirm('Confirm Arrival?', `Confirm that ${occ.name} has moved in? They will count as a resident in SASO figures. Payment is not changed.`, () => handleConfirmArrival(occ))" class="bd-btn is-arrival mr-2"><i class="fa-solid fa-door-open" aria-hidden="true"></i>Confirm Arrival</button>
                    <button v-if="!occupantNotArrived(occ)" @click="triggerConfirm('Confirm Checkout?', `Are you sure you want to checkout ${occ.name}?`, () => handleCheckoutOccupant(occ.id))"
                            type="button" class="bd-btn is-checkout">
                      <i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i>Checkout
                    </button>
                  </div>
                  <BookingArrivalActions v-if="occupantBooking(occ)" :booking="occupantBooking(occ)" compact class="pb-2.5" @changed="fetchRoomDetails" @notice="showSystemAlert($event.message, $event.tone)" />

                </div>
              </div>
            </div>
          </div>
          <!-- ===== END MOBILE ACCORDION ===== -->

          <!-- ===== DESKTOP TABLE (hidden on mobile) ===== -->
          <div class="boarder-desktop" role="region" aria-label="Boarder Details table" tabindex="0">
            <table class="boarder-table">
              <colgroup><col style="width:4%" /><col style="width:9%" /><col style="width:18%" /><col style="width:14%" /><col style="width:9%" /><col style="width:14%" /><col style="width:16%" /><col style="width:16%" /></colgroup>
              <thead><tr><th scope="col">#</th><th scope="col">Ref No.</th><th scope="col">Student Name</th><th scope="col" class="boarder-dates-heading"><span>Check-In</span><span>/ Check-Out</span></th><th scope="col">Duration</th><th scope="col" class="boarder-payment-heading">Monthly Rent Status</th><th scope="col" class="boarder-payment-heading">Move-in Upfront Fee</th><th scope="col" class="boarder-action-heading">Action</th></tr></thead>
              <tbody>
                <tr v-if="!filteredOccupants.length"><td colspan="8" class="boarder-empty"><span class="rd-empty-icon"><i class="fa-solid fa-user-group" aria-hidden="true"></i></span><span>No matching boarders found in this room.</span></td></tr>
                <template v-for="(occ,i) in filteredOccupants" :key="occ.id">
                  <tr class="boarder-main-row" :class="{expanded:expandedOccupants.has(occ.id)}" @click="toggleBoarderRow($event,occ.id)">
                    <td>{{ i+1 }}</td><td class="boarder-reference">{{ occ.reference_no || 'MANUAL' }}</td>
                    <td><button type="button" class="boarder-name" @click.stop="toggleOccupant(occ.id)" :aria-expanded="expandedOccupants.has(occ.id)" :aria-controls="'boarder-details-' + occ.id">{{ occ.name }}<i :class="['fa-solid', expandedOccupants.has(occ.id) ? 'fa-chevron-up' : 'fa-chevron-down']" aria-hidden="true"></i></button><span v-if="occupantAwaitingArrival(occ)" class="o-badge amber small mt-1"><i class="fa-solid fa-door-open" aria-hidden="true"></i>{{ arrivalLabel(occ) }}</span></td>
                    <td><span class="boarder-check-in">{{ formatDate(occ.check_in_date) }}</span><span class="boarder-check-out">{{ getCheckoutDateDisplay(occ) }}</span></td>
                    <td>{{ occ.months }} Month{{ occ.months > 1 ? 's' : '' }}</td>
                    <td><span :class="['o-badge',occ.payment_status === 'Paid' ? 'green' : 'amber']"><i class="fa-solid" :class="occ.payment_status === 'Paid' ? 'fa-circle-check' : 'fa-clock'" aria-hidden="true"></i>{{ occ.payment_status === 'Paid' ? 'Rent Paid' : 'Rent Due' }}</span><small class="boarder-monthly-rate">&#8369;{{ Number(room.price || room.house_price || 0).toLocaleString() }}/month</small></td>
                    <td><template v-if="formatMoveInLedger(occ).total > 0"><strong class="boarder-upfront-amount">&#8369;{{ formatMoveInLedger(occ).total.toLocaleString('en-US',{minimumFractionDigits:2}) }}</strong><span :class="['o-badge', 'payment', occ.payment_method === 'paymongo' || isUpfrontCollected(occ) ? 'green' : 'amber']"><i :class="['fa-solid', occ.payment_method === 'paymongo' ? 'fa-mobile-screen-button' : isUpfrontCollected(occ) ? 'fa-money-bill-wave' : 'fa-clock']" aria-hidden="true"></i>{{ occ.payment_method === 'paymongo' ? 'Upfront Paid (Online)' : getUpfrontLabel(occ) }}</span></template><span v-else>No Deposit / Advance</span></td>
                    <td @click.stop><div class="boarder-row-actions"><button v-if="canConfirmArrival(occ)" type="button" @click="triggerConfirm('Confirm Arrival?', `Confirm that ${occ.name} has moved in? They will count as a resident in SASO figures. Payment is not changed.`, () => handleConfirmArrival(occ))" class="bd-btn is-arrival"><i class="fa-solid fa-door-open" aria-hidden="true"></i>Confirm Arrival</button><button type="button" @click="handleTogglePayment(occ)" :class="['bd-btn', occ.payment_status === 'Paid' ? 'is-undo' : 'is-pay']"><i :class="['fa-solid', occ.payment_status === 'Paid' ? 'fa-rotate-left' : 'fa-check']" aria-hidden="true"></i>{{ occ.payment_status === 'Paid' ? 'Mark rent unpaid' : 'Mark rent paid' }}</button><button v-if="!occupantNotArrived(occ)" type="button" @click="triggerConfirm('Confirm Checkout?', `Are you sure you want to checkout ${occ.name}? This will free their slot in this room.`, () => handleCheckoutOccupant(occ.id))" class="bd-btn is-checkout"><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i>Checkout</button><BookingArrivalActions v-if="occupantBooking(occ)" :booking="occupantBooking(occ)" compact @changed="fetchRoomDetails" @notice="showSystemAlert($event.message, $event.tone)" /></div></td>
                  </tr>
                  <tr v-if="expandedOccupants.has(occ.id)" :id="'boarder-details-' + occ.id" class="boarder-expanded-row"><td colspan="8">
                    <div class="boarder-expanded-panel"><section class="boarder-personal-group"><h3><i class="fa-solid fa-user" aria-hidden="true"></i>Occupant Information</h3><dl class="boarder-expanded-grid boarder-personal-grid">
                      <div><dt>Address</dt><dd>{{ occ.address || '-' }}</dd></div><div><dt>Contact</dt><dd>{{ occ.contact_number || '-' }}</dd></div><div><dt>Emergency</dt><dd>{{ occ.emergency_contact || '-' }}</dd></div>
                      </dl></section><section class="boarder-financial-group"><h3><i class="fa-solid fa-file-invoice" aria-hidden="true"></i>Payment Information</h3><dl class="boarder-expanded-grid boarder-financial-grid"><div><dt>Total Rent</dt><dd class="boarder-total-rent">&#8369;{{ calculateTotalRent(occ) ? Number(calculateTotalRent(occ)).toLocaleString() : '0' }}</dd><dd>&#8369;{{ Number(room.price || room.house_price || 0).toLocaleString() }}/month</dd></div>
                      <div><dt>Move-in Upfront Fee</dt><dd><template v-if="formatMoveInLedger(occ).total > 0"><strong>&#8369;{{ formatMoveInLedger(occ).total.toLocaleString('en-US',{minimumFractionDigits:2}) }}</strong><span v-if="formatMoveInLedger(occ).advM > 0" class="block">Advance Rent: &#8369;{{ formatMoveInLedger(occ).advAmt.toLocaleString('en-US',{minimumFractionDigits:2}) }}</span><span v-if="formatMoveInLedger(occ).depM > 0" class="block">{{ formatMoveInLedger(occ).friendlyType }} Deposit: &#8369;{{ formatMoveInLedger(occ).depAmt.toLocaleString('en-US',{minimumFractionDigits:2}) }}</span><em v-if="formatMoveInLedger(occ).depM > 0" :class="formatMoveInLedger(occ).depositType === 'consumable' ? 'text-amber-500' : 'text-blue-400'">{{ formatMoveInLedger(occ).depositType === 'consumable' ? "Usable as last month's rent" : 'Return on move-out' }}</em><span v-if="occ.payment_method === 'paymongo'" class="block boarder-online-note">Upfront Paid (Online)</span><button v-else type="button" @click="handleToggleUpfront(occ)" :class="['bd-btn', isUpfrontCollected(occ) ? 'is-undo' : 'is-pay']"><i :class="['fa-solid', isUpfrontCollected(occ) ? 'fa-rotate-left' : 'fa-check']" aria-hidden="true"></i>{{ getUpfrontActionLabel(occ) }}</button></template><span v-else>No Deposit / Advance</span></dd></div>
                    </dl></section></div>
                  </td></tr>
                </template>
              </tbody>
            </table>
          </div>
          <!-- ===== END DESKTOP TABLE ===== -->
          <footer class="boarder-table-footer"><strong>Showing {{ filteredOccupants.length }} of {{ occupants.length }} occupants</strong><span>{{ occupants.length >= Number(room.capacity) ? 'Room is full' : Math.max(0, Number(room.capacity)-occupants.length-Number(room.reserved_count || 0)) + ' beds available today; upcoming stays are listed above' }}</span></footer>
        </section>


      </div>
    </main>

    <!-- ===== Add Non-CSPC Occupant Modal ===== -->
    <div v-management-dialog="{ close: () => closeAddModal() }" v-show="showAddModal" class="manual-occupant-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] overflow-y-auto flex items-start justify-center p-4 py-8 animate-fade-in">
      <div class="manual-occupant-dialog bg-white w-full max-w-2xl relative text-left">
        <div class="flex justify-between items-center mb-8">
          <div>
            <h2 class="text-xl font-semibold text-slate-900 uppercase tracking-tight">Add Non-CSPC Occupant</h2>
            <p class="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">Room: {{ room.room_number }}</p>
          </div>
          <button aria-label="Close dialog" @click="closeAddModal" class="text-slate-300 hover:text-slate-900 transition text-3xl leading-none focus:outline-none cursor-pointer">&times;</button>
        </div>

        <p class="text-xs text-slate-600 leading-relaxed mb-5">Add a non-CSPC occupant after actual arrival. This records occupancy immediately; it is different from approving a future reservation. Record the rent and upfront collection status accurately below.</p>
        <form @submit.prevent="handleAddNonCspc" class="manual-occupant-form grid grid-cols-1 md:grid-cols-2 gap-5">
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
          <div class="manual-occupant-footer md:col-span-2 pt-4 border-t border-slate-100">
            <button type="button" @click="closeAddModal" :disabled="isSavingNonCspc" class="manual-occupant-cancel">Cancel</button><button type="submit" :disabled="isSavingNonCspc" class="w-full bg-blue-600 hover:bg-black text-white font-semibold py-4 rounded-xl text-[12px] uppercase tracking-wide transition shadow-xl active:scale-95 disabled:opacity-50 cursor-pointer management-button management-button-primary">
              {{ isSavingNonCspc ? 'Saving Occupant...' : 'Save Occupant' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ===== Checkout Non-CSPC Occupant Modal ===== -->
    <div v-management-dialog="{ close: () => closeRemoveModal() }" v-show="showRemoveModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] overflow-y-auto flex items-center justify-center p-4 animate-fade-in">
      <div class="popup-panel bg-white w-full max-w-md rounded-[2rem] shadow-2xl p-10 text-left animate-in zoom-in duration-200">
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
    <div v-management-dialog="{ close: () => showConfirmModal = false }" v-if="showConfirmModal" class="cm-backdrop">
      <div class="cm-panel popup-panel" role="dialog" aria-modal="true">
        <div class="cm-body">
          <span :class="['cm-icon', confirmTone(confirmTitle).tone]" aria-hidden="true"><i :class="['fa-solid', confirmTone(confirmTitle).icon]"></i></span>
          <div><h3 class="cm-title">{{ confirmTitle }}</h3><p class="cm-message popup-message">{{ confirmMessage }}</p></div>
        </div>
        <div class="cm-actions">
          <button type="button" class="cm-btn cm-cancel" @click="showConfirmModal = false">Cancel</button>
          <button type="button" :class="['cm-btn', confirmTone(confirmTitle).button]" :disabled="isProcessingDecision" @click="executeConfirm">Confirm</button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.pending-requests{background:white;border:1px solid #e0e8f3;border-radius:16px;overflow:hidden;box-shadow:0 5px 20px rgb(27 65 115 / .035);}.pending-requests>div:first-child{padding:18px 22px;background:#fff8ed;border-color:#fae6c8;}.pending-requests th{padding:12px 16px;font-size:11px;text-transform:none;letter-spacing:0;color:#526b89;background:#f5f8fd;border:0;}.pending-requests td{padding:18px 16px;vertical-align:middle;color:#243e60;}.pending-requests tbody{border-color:#edf2f8;}.pending-student{display:flex;align-items:center;gap:12px;text-align:left;}.pending-requests th:first-child{text-align:left;}.pending-deadline{min-width:225px;max-width:290px;}.pending-deadline :deep(.reservation-deadline){margin:0;}.pending-requests button{box-shadow:none;}
@media(max-width:767px){.pending-requests>div:first-child{padding:16px;flex-wrap:wrap;}.pending-requests table,.pending-requests tbody{display:block;}.pending-requests thead{display:none;}.pending-requests tbody{padding:0 16px;}.pending-requests tr{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:18px 0;border-bottom:1px solid #e6edf6;}.pending-requests tr:last-child{border-bottom:0;}.pending-requests td{display:block;padding:0;min-width:0;max-width:none;text-align:left;}.pending-requests td:before{content:attr(data-label);display:block;font-size:11px;color:#526b89;margin-bottom:5px;}.pending-requests td:first-child,.pending-requests td:nth-child(5),.pending-requests td:last-child{grid-column:1/-1;}.pending-requests td:first-child:before,.pending-requests td:last-child:before{display:none;}.pending-requests td:last-child>div{justify-content:flex-end;}.pending-requests button{min-height:44px;}}

.room-details-page-header{margin-bottom:16px;}.room-details-page-header :deep(.management-page-header){margin-bottom:18px;}.boarder-section{border-radius:15px !important;}.boarder-section>div:first-child{padding:17px 20px;background:white;border-bottom:1px solid #e5ecf5;}.boarder-section>div:first-child>div:first-child{flex-wrap:wrap;gap:10px;}.boarder-row-hint{font-size:11px;color:#7f91ab;font-weight:400;}.boarder-toolbar-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}.boarder-toolbar-actions>button{min-height:40px;font-size:11px;white-space:nowrap;letter-spacing:normal;text-transform:none;padding:10px 15px;box-shadow:none;}.boarder-type-filter{position:relative;display:block;min-width:225px;max-width:320px;}.boarder-type-filter>i:first-of-type{position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:12px;color:#6e83a0;pointer-events:none;}.boarder-type-filter>i:last-of-type{position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:10px;color:#6e83a0;pointer-events:none;}.boarder-type-filter select{appearance:none;background-image:none !important;background-color:#fff;width:100%;min-height:40px;border:1px solid #dbe5f1;border-radius:8px;padding:10px 32px 10px 33px;font-size:11px;font-weight:500;color:#607797;cursor:pointer;}.boarder-type-filter select:focus-visible{outline:2px solid #93c5fd;outline-offset:2px;}.boarder-type-filter option{font-size:12px;padding:10px;}
.boarder-mobile{display:none;}.boarder-desktop{display:block;overflow-x:auto;}.boarder-table{width:100%;min-width:1080px;border-collapse:collapse;table-layout:fixed;font-size:12px;}.boarder-table th{padding:13px 14px;text-align:left;font-size:10px;color:#6d83a1;font-weight:650;background:#f7faff;}.boarder-table td{padding:20px 14px;font-size:11px;color:#607797;vertical-align:middle;}.boarder-table th.boarder-action-heading{text-align:center;}.boarder-main-row{cursor:pointer;border-bottom:1px solid #edf1f7;}.boarder-main-row:hover,.boarder-main-row.expanded{background:#fbfdff;}.boarder-reference{font-size:10px !important;font-family:monospace;}.boarder-name{display:flex;align-items:center;gap:9px;text-align:left;font-size:12px;font-weight:700;text-transform:uppercase;color:#193452;overflow-wrap:anywhere;}.boarder-name i{font-size:9px;color:#91a3ba;flex-shrink:0;}.boarder-check-in,.boarder-check-out{display:block;font-size:11px;font-weight:650;}.boarder-check-in{color:#253e5b;}.boarder-check-out{color:#2563eb;margin-top:4px;}.boarder-payment-pill{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:650;line-height:1.5;}.boarder-payment-pill.paid{background:#eaf8f2;color:#08916a;}.boarder-payment-pill.due{background:#fff7e7;color:#b7790b;}.boarder-monthly-rate{display:block;font-size:10px;color:#7f91ab;margin-top:5px;}.boarder-upfront-amount{display:block;font-size:11px;color:#294966;margin-bottom:5px;}.boarder-row-actions{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px;}.boarder-row-actions .management-button{font-size:10px;min-height:32px;padding:7px 9px;white-space:nowrap;font-weight:600;text-transform:none;letter-spacing:normal;border-width:1px;border-radius:7px;}.boarder-expanded-row>td{padding:0 20px 20px 50px;background:#fff;}.boarder-expanded-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr 1.7fr;gap:20px;border-top:1px dashed #dfe8f3;padding-top:16px;}.boarder-expanded-grid dt{font-size:10px;font-weight:650;color:#7a8fa9;margin-bottom:6px;}.boarder-expanded-grid dd{font-size:11px;color:#607797;line-height:1.6;overflow-wrap:anywhere;}.boarder-expanded-grid .boarder-total-rent{font-weight:700;color:#29445f;}.boarder-expanded-grid em{display:block;font-size:10px;}.boarder-upfront-action{display:block;margin-top:7px;padding:5px 9px;background:white;border:1px solid #e2e8f0;border-radius:6px;color:#94a3b8;font-size:10px;font-weight:650;}.boarder-upfront-action:hover{color:#2563eb;}.boarder-online-note{color:#08916a;font-size:10px;margin-top:5px;}.boarder-table-footer{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 20px;background:#fafcff;border-top:1px solid #edf1f7;font-size:11px;color:#8193ac;}.boarder-table-footer strong{color:#314e6d;font-weight:650;}.boarder-name:focus-visible{outline:2px solid #93c5fd;outline-offset:4px;border-radius:4px;}
@media(max-width:1023px){.boarder-mobile{display:block;}.boarder-desktop{display:none;}.boarder-section>div:first-child{align-items:flex-start;}.boarder-toolbar-actions{width:100%;}.boarder-type-filter{flex:1;min-width:210px;max-width:none;}.boarder-toolbar-actions>button{min-height:44px;}.boarder-mobile .management-button{min-height:44px;}.boarder-row-hint{font-size:11px;width:100%;}}
@media(max-width:539px){.boarder-toolbar-actions{display:grid;grid-template-columns:1fr;gap:12px;}.boarder-type-filter{min-width:0;width:100%;}.boarder-toolbar-actions>button{justify-content:center;width:100%;}.boarder-section>div:first-child{padding:16px;}.room-details-page-header :deep(.management-page-header h1){font-size:24px;}}
@media(max-width:639px){.boarder-mobile .justify-between{gap:12px;flex-wrap:wrap;}.boarder-mobile .text-right{overflow-wrap:anywhere;}}

/* Room details: balanced payment columns and grouped expanded information. */
.boarder-table th.boarder-payment-heading,.boarder-main-row>td:nth-child(6),.boarder-main-row>td:nth-child(7){text-align:center;}
.boarder-payment-pill{justify-content:center;max-width:100%;white-space:normal;}
.boarder-monthly-rate,.boarder-upfront-amount{width:100%;text-align:center;}
.boarder-expanded-row>td{padding:0 18px 18px;}
.boarder-expanded-panel{display:grid;grid-template-columns:1fr 1.05fr;gap:24px;padding:18px 20px;border:1px solid #e4edf9;border-radius:13px;background:linear-gradient(120deg,#f6faff,#fbfdff);}
.boarder-expanded-panel h3{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:700;color:#193b65;margin-bottom:16px;}
.boarder-expanded-panel h3>i{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;color:#2364b7;background:#e2eeff;font-size:14px;}
.boarder-expanded-grid{border:0;padding:0;gap:18px;}
.boarder-personal-grid{grid-template-columns:1.2fr 1fr 1fr;}
.boarder-financial-grid{grid-template-columns:.8fr 1.7fr;}
.boarder-financial-group{border-left:1px solid #dfe8f4;padding-left:24px;}
.boarder-expanded-grid>div+div{border-left:1px solid #e5edf8;padding-left:16px;}
.boarder-expanded-grid dt{font-size:11px;font-weight:500;}
.boarder-expanded-grid dd{font-size:12px;}
.boarder-expanded-grid dd>strong,.boarder-expanded-grid .boarder-total-rent{font-size:13px;color:#193b65;}
.boarder-online-note{display:table;margin-top:7px;padding:4px 9px;border-radius:999px;background:#e4f8f0;color:#08916a;}
.boarder-table th{font-size:11px;}
.boarder-table td{font-size:12px;}
.boarder-name{text-transform:none;font-size:13px;}
.boarder-name i{color:#2563eb;}
.boarder-type-filter select{min-height:44px;border-radius:10px;}
.boarder-table-footer>span{border-left:1px solid #dce6f3;padding-left:14px;}
@media(min-width:1440px){.boarder-table td{padding-top:18px;padding-bottom:18px;}.boarder-payment-pill{font-size:11px;}.boarder-monthly-rate{font-size:12px;}.boarder-upfront-amount{font-size:13px;}.boarder-row-hint{font-size:12px;}}
@media(max-width:1200px){.boarder-expanded-panel{gap:16px;}.boarder-financial-group{padding-left:16px;}.boarder-personal-grid{grid-template-columns:1fr 1fr;}.boarder-personal-grid>div:first-child{grid-column:1/-1;}.boarder-personal-grid>div:nth-child(2){border:0;padding-left:0;}}


/* Readable data and visibly distinct payment actions across desktop and mobile. */
.boarder-table th.boarder-dates-heading,.boarder-main-row>td:nth-child(4){text-align:center;}
.boarder-dates-heading>span{display:block;line-height:1.55;white-space:nowrap;}
.boarder-table th,.boarder-row-hint,.boarder-table-footer,.boarder-type-filter select{color:#4b6381;}
.boarder-table td,.boarder-expanded-grid dd{color:#334c68;}
.boarder-expanded-grid dt,.boarder-monthly-rate{color:#526b89;}
.boarder-reference{color:#46617f !important;}
.boarder-check-in,.boarder-upfront-amount{color:#1c3655;}
.bd-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px!important;padding:6px 12px;border:1px solid transparent;border-radius:8px;font-size:12px;font-weight:600;line-height:1.2;letter-spacing:0;text-transform:none;white-space:nowrap;cursor:pointer;transition:background .15s,border-color .15s,color .15s;}
.bd-btn i{font-size:11px;}
.bd-btn.is-pay,.bd-btn.is-approve{background:#16a34a;border-color:#16a34a;color:#fff;}.bd-btn.is-pay:hover,.bd-btn.is-approve:hover{background:#15803d;border-color:#15803d;}
.bd-btn.is-undo{background:#fff;border-color:#fcd34d;color:#b45309;}.bd-btn.is-undo:hover{background:#fffbeb;border-color:#fbbf24;}
.bd-btn.is-arrival{background:#2563eb;border-color:#2563eb;color:#fff;}.bd-btn.is-arrival:hover{background:#1d4ed8;}
.bd-btn.is-checkout,.bd-btn.is-reject{background:#fff;border-color:#fecaca;color:#b91c1c;}.bd-btn.is-checkout:hover,.bd-btn.is-reject:hover{background:#fef2f2;border-color:#fca5a5;}
.bd-btn:focus-visible{outline:3px solid #93c5fd;outline-offset:2px;}
@media(pointer:coarse){.bd-btn{min-height:44px!important;}}
.boarder-section .boarder-upfront-action{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:7px 11px;border-radius:7px;font-size:11px;font-weight:650;text-decoration:none;cursor:pointer;}
.boarder-section .upfront-mark-unpaid{background:#ffedd5;color:#9a3412;border:1px solid #fed7aa;}
.boarder-section .upfront-mark-unpaid:hover{background:#fed7aa;color:#7c2d12;}
.boarder-section .upfront-mark-paid{background:#059669;color:white;border:1px solid #059669;}
.boarder-section .upfront-mark-paid:hover{background:#047857;}
.boarder-mobile :is(.text-slate-400,.text-slate-500){color:#526b89;}
.boarder-section :is(.boarder-payment-action,.boarder-upfront-action):focus-visible{outline:3px solid #93c5fd;outline-offset:2px;}
@media(max-width:1023px){.boarder-section .boarder-upfront-action{min-height:44px;}.boarder-mobile .text-slate-400{color:#4b6381;}}

.boarder-section :is(button,select),.room-details-page-header a{transition:background-color 160ms ease,color 160ms ease,border-color 160ms ease,box-shadow 160ms ease;}
@media(prefers-reduced-motion:reduce){.boarder-section :is(button,select),.room-details-page-header a{transition:none;}}
</style>

<style scoped>.boarder-row-actions{display:grid;grid-template-columns:1fr;justify-items:stretch;gap:6px;max-width:140px;margin:auto}.boarder-row-actions .bd-btn{width:100%;min-height:32px;padding:7px 9px;font-size:11px;line-height:1.2;justify-content:center}.boarder-table{min-width:1020px}@media(max-width:1023px){.boarder-row-actions{max-width:none;grid-template-columns:repeat(auto-fit,minmax(125px,1fr))}.boarder-row-actions .bd-btn{min-height:44px}}</style>

<style scoped>.checkout-attention{display:flex;align-items:flex-start;gap:12px;padding:16px 18px;margin:18px 0;border:1px solid #f4ce85;border-radius:12px;background:#fff9ed;color:#68451b}.checkout-attention>i{color:#b7790b;margin-top:3px}.checkout-attention h2{margin:0 0 7px;font-size:14px;font-weight:700}.checkout-attention p{font-size:12.5px;line-height:1.65;margin:5px 0}.checkout-attention a{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:650;color:#92400e;margin-top:7px;padding:4px 0}.checkout-attention a:focus-visible{outline:2px solid #b7790b;outline-offset:3px}#boarder-records{scroll-margin-top:110px}</style>

<style scoped>.pending-refresh{margin-left:auto;display:inline-flex;align-items:center;gap:7px;padding:7px 10px;background:white;border:1px solid #e9cba0;border-radius:7px;color:#864d18;font-size:12px;font-weight:600;line-height:1.3;cursor:pointer}.pending-refresh:hover{background:#fff7e8}.pending-refresh:focus-visible{outline:2px solid #b7790b;outline-offset:3px}@media(pointer:coarse){.pending-refresh{min-height:44px}}</style>

<style scoped>
.room-details-refined{background:#f3f7fc!important}.room-details-content{padding-top:30px!important;padding-bottom:44px!important}.room-details-page-header{margin-bottom:26px}.room-details-page-header>a{font-size:10px;letter-spacing:.04em;margin-bottom:16px}.rd-eyebrow{display:flex;align-items:center;gap:12px;font-size:10px;letter-spacing:.12em;font-weight:750;color:#6f86a2;text-transform:uppercase;margin:0 0 10px}.rd-eyebrow span{display:inline-flex;align-items:center;gap:7px;font-size:9px;color:#7f93ad}.rd-eyebrow span:before{content:'';width:5px;height:5px;border-radius:50%;background:#8aa3c2}.rd-heading h1{font-size:clamp(26px,2.4vw,36px);font-weight:800;letter-spacing:-.035em;line-height:1.2;color:#0d2d53;margin:0}.rd-subtitle{display:flex;flex-wrap:wrap;gap:13px;align-items:center;margin:9px 0 0;color:#526f91;font-size:13px;font-weight:550;line-height:1.6}.rd-subtitle>span:nth-child(2){color:#aec0d5}.room-details-sections{display:flex;flex-direction:column;gap:24px}.room-details-sections>:not([hidden]){margin-top:0!important;margin-bottom:0!important}.pending-requests,.boarder-section{border-radius:24px!important;border:1px solid #dce7f4!important;background:white;box-shadow:0 14px 36px rgb(27 63 105 / .055)!important}.room-details-refined .rd-section-heading{background:white!important;padding:22px 24px!important;gap:12px;border-bottom:1px solid #e5edf7!important;min-height:78px;box-sizing:border-box}.rd-section-marker{width:6px;height:28px;flex-shrink:0;border-radius:5px;background:#ff982c}.rd-section-title h2,.rd-boarder-title{font-size:14px!important;line-height:1.5!important;font-weight:750!important;letter-spacing:-.01em!important;text-transform:none!important;color:#163554!important;margin:0}.rd-section-title p{font-size:11px;color:#6b819c;margin:3px 0 0;line-height:1.5}.rd-section-heading .o-badge{font-size:10px;padding:5px 9px;font-weight:650}.rd-section-heading .pending-refresh{font-size:10.5px;padding:7px 10px;border-color:#e0e9f4;color:#526f91}.rd-boarder-heading>div:first-child{display:grid;grid-template-columns:6px minmax(0,1fr);column-gap:12px;row-gap:3px;align-items:center}.rd-boarder-heading>div:first-child>div:first-child{grid-row:1/3;width:6px;height:27px}.rd-boarder-heading .boarder-row-hint{grid-column:2;flex-basis:auto;font-size:10.5px;line-height:1.5;color:#7286a1;white-space:normal;margin:0}.boarder-toolbar-actions{gap:9px}.boarder-type-filter select{min-height:38px;font-size:10px;border-radius:8px;padding:9px 30px 9px 31px}.boarder-toolbar-actions>.management-button{font-size:10.5px!important;min-height:38px!important;padding:9px 13px!important;border-radius:8px!important;text-transform:none!important;letter-spacing:0!important;gap:8px;box-shadow:0 4px 12px #2563eb1a!important}.boarder-toolbar-actions svg{width:15px;height:15px}.room-details-refined .pending-requests th{padding:14px 20px!important;background:#fbfcff!important;border-bottom:1px solid #edf2f8;font-size:10.5px!important;font-weight:650!important;letter-spacing:0!important;color:#627b9a!important;text-transform:none!important}.room-details-refined .pending-requests td{padding:22px 20px!important;font-size:12px;line-height:1.6}.pending-student{gap:10px}.pending-student>div:first-child{width:36px;height:36px}.pending-student p:first-child{font-size:11.5px;text-transform:none;font-weight:700;color:#284465}.pending-student p:last-child{font-size:10px;font-weight:500;text-transform:none;color:#6f84a0;margin-top:3px}.pending-deadline :deep(.reservation-deadline){max-width:355px;padding:11px 12px;border-radius:11px;background:#fffdf4;border-color:#f4d78f;box-shadow:none}.pending-deadline :deep(.rd-label){font-size:9px;letter-spacing:.04em}.pending-deadline :deep(.rd-time-row){font-size:11px}.pending-deadline :deep(.rd-body small){font-size:9.5px;line-height:1.55;color:#6c809b}.pending-requests .bd-btn{font-size:10.5px;min-height:35px;padding:8px 12px;border-radius:8px}.room-details-refined .boarder-table{font-size:12px}.room-details-refined .boarder-table th{padding:17px 18px!important;background:white!important;border-bottom:1px solid #edf2f8;color:#69809c!important;font-size:10px!important;font-weight:650;letter-spacing:0;text-transform:none}.room-details-refined .boarder-table td{padding:20px 18px!important;border-color:#edf2f8}.room-details-refined .boarder-table .boarder-empty{height:130px;padding:30px!important;text-align:center;color:#758ca6;font-size:12px}.rd-empty-icon{display:inline-grid;place-items:center;width:30px;height:30px;background:#f3f7fc;border-radius:9px;margin-right:9px;color:#8ba4c1;font-size:13px;vertical-align:middle}.boarder-name{font-size:12px;text-transform:none;color:#234260}.boarder-monthly-rate{font-size:11px}.boarder-table-footer{padding:13px 22px;font-size:10.5px;border-color:#edf2f8;background:#fcfdff}.room-details-refined .boarder-table .boarder-expanded-row>td{padding:0 18px 20px!important}.boarder-expanded-grid{font-size:11px}.checkout-attention{margin:0;border-radius:16px}.rd-empty{font-size:12px;text-transform:none;letter-spacing:0}
@media(max-width:1100px){.room-details-refined .rd-section-heading{padding:18px 20px!important;flex-wrap:wrap}.rd-boarder-heading .boarder-toolbar-actions{flex:1;justify-content:flex-end;min-width:260px}.room-details-content{padding-top:24px!important}.room-details-sections{gap:20px}}
@media(max-width:639px){.room-details-content{width:100%!important;padding:20px 14px 32px!important}.room-details-page-header{margin-bottom:20px}.rd-heading h1{font-size:28px}.rd-subtitle{font-size:12px;gap:10px}.rd-eyebrow{font-size:9px}.pending-requests,.boarder-section{border-radius:18px!important}.room-details-refined .rd-section-heading{padding:17px 16px!important;gap:10px}.rd-section-title h2,.rd-boarder-title{font-size:13px!important}.rd-section-title p{font-size:10.5px}.rd-pending-heading .pending-refresh{margin-left:18px}.rd-section-heading .o-badge{font-size:9.5px}.rd-boarder-heading .boarder-toolbar-actions{min-width:0;display:grid;grid-template-columns:1fr;width:100%;margin-top:7px}.boarder-type-filter{max-width:none;min-width:0}.boarder-toolbar-actions>.management-button{min-height:44px!important}.boarder-type-filter select{min-height:44px}.room-details-sections{gap:18px}.boarder-mobile .management-button{font-size:12px}.room-details-refined .pending-requests td{padding:14px 16px!important}.pending-deadline :deep(.reservation-deadline){max-width:none}}
</style>

<style scoped>.manual-occupant-dialog{padding:26px;border-radius:18px;max-height:calc(100dvh - 64px);overflow:auto;box-shadow:0 20px 70px #10274440}.manual-occupant-dialog h2{text-transform:none;font-size:21px}.manual-occupant-dialog p{font-size:13px;line-height:1.7;color:#27476d}.manual-occupant-form label{font-size:13px;color:#193c66;text-transform:none;font-weight:650}.manual-occupant-form input,.manual-occupant-form select{font-size:14px;font-weight:500;color:#102e50;background:white}.manual-occupant-footer{display:flex;gap:12px;align-items:center}.manual-occupant-footer button{width:auto;flex:1;text-transform:none;font-size:14px;letter-spacing:0;padding:12px;box-shadow:none}.manual-occupant-cancel{border:1px solid #cbd9ec;border-radius:12px;background:white;color:#193c66;font-weight:600}@media(max-width:640px){.manual-occupant-dialog{padding:20px;max-height:calc(100dvh - 32px)}.manual-occupant-overlay{padding:16px}}.bd-btn.is-hold,.bd-btn.is-hold:disabled{background:#f1f5f9;border-color:#e2e8f0;color:#475569;opacity:1;cursor:not-allowed}.pending-hold{display:grid;gap:4px;max-width:300px;margin:0 auto;text-align:left;font-size:12.5px;line-height:1.55;color:#334155}.pending-hold strong{display:flex;align-items:center;gap:7px;color:#0f172a;font-weight:650}.pending-hold strong i{color:#64748b;font-size:12px}.pending-hold b{color:#0f172a;font-weight:600}
</style>
