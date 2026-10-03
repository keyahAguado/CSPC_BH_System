<script setup>
import { validateInput, validDate } from '../../utils/inputValidation.js';
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import StudentNav from '../../components/partials/StudentNav.vue';
import DataPrivacyModal from '../../components/DataPrivacyModal.vue';
import { normalizePhPhone, isValidPhPhone } from '../../utils/phoneValidation.js';
import { computeCheckoutDate, formatCheckoutDateString } from '../../utils/dateHelper.js';

const route = useRoute();
const router = useRouter();
const houseId = route.params.id;

const house = ref({});
const rooms = ref([]);
const isLoading = ref(true);
const loadError = ref('');
const isFetchingHouse = ref(false);
const isSaving = ref(false);
const successMsg = ref('');
const errorMsg = ref('');
const reservationBlocked = ref(false);
const showConfirmModal = ref(false);   // Pre-submission review modal
const showSuccessModal = ref(false);   // Post-submission result modal
const showDpaModal = ref(false);       // Data Privacy Act consent modal
const bookingErrorRef = ref(null);

const handleDpaAccepted = () => {
  showDpaModal.value = false;
  if (currentUser) currentUser.dpa_accepted = 1;
  showConfirmModal.value = true;
};

const token = sessionStorage.getItem('cspc_token');
const isGuest = !token;
import { getApiBaseUrl } from '../../config/api';

const API = getApiBaseUrl();

// Self-healing local storage parser (Guarantees zero start-up crashes)
let currentUserObj = {};
try {
  const userRaw = sessionStorage.getItem('cspc_user');
  if (userRaw && userRaw !== 'undefined') {
    currentUserObj = JSON.parse(userRaw);
  }
} catch (parseError) {
  console.error("[BOOKING] Ignored corrupted user session storage:", parseError);
}
const currentUser = currentUserObj;

// Form
const form = ref({
  roomId: '',
  check_in_date: '',
  months: '',
  resident_name: '',
  gender: '',
  age: '',
  contact_number: '',
  emergency_contact: '',
  guardian_name: '',
  address: '',
  payment_method: 'cash' // Default selection
});

// Dynamic min check-in date (Today)
const minCheckInDate = computed(() => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
});

// Wait until the field loses focus; incomplete dates are checked on submission.
const handleCheckInDateChange = () => {
  if (!validDate(form.value.check_in_date)) return;
  if (form.value.check_in_date < minCheckInDate.value) {
    form.value.check_in_date = minCheckInDate.value;
  }
};

const clearInputError = () => {
  if (!reservationBlocked.value) errorMsg.value = '';
};

const showBookingError = (message) => {
  errorMsg.value = message;
  nextTick(() => bookingErrorRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
};

const isAutoFilledFromProfile = ref(false);

const fetchData = async () => {
  if (isFetchingHouse.value) return;
  isFetchingHouse.value = true;
  isLoading.value = true;
  loadError.value = '';
  if (!navigator.onLine) {
    loadError.value = 'You are currently offline. Please connect to the internet to load the booking form.';
    isFetchingHouse.value = false;
    isLoading.value = false;
    return;
  }
  try {
    const res = await axios.get(`/api/student/house/${houseId}`, {
      timeout: 15000,
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.data?.house || String(res.data.house.id) !== String(houseId) || !Array.isArray(res.data.rooms)) {
      throw new Error('Incomplete booking property response');
    }
    house.value = res.data.house;
    rooms.value = res.data.rooms || [];

    // 1. Initial pre-fill from cached local session
    if (currentUser.phone || currentUser.emergency_contact || currentUser.guardian_name || currentUser.address || currentUser.age || currentUser.sex || currentUser.gender) {
      isAutoFilledFromProfile.value = true;
    }
    form.value.resident_name = currentUser.name || '';
    form.value.gender = (currentUser.sex || currentUser.gender || '').toLowerCase();
    form.value.age = currentUser.age || '';
    form.value.contact_number = normalizePhPhone(currentUser.phone);
    form.value.emergency_contact = normalizePhPhone(currentUser.emergency_contact);
    form.value.guardian_name = currentUser.guardian_name || '';
    form.value.address = currentUser.address || '';

    // 2. Fresh real-time fetch from backend profile endpoint for 100% complete pre-filling
    if (token) {
      try {
        const profileRes = await axios.get('/api/student/profile', {
          timeout: 15000,
          headers: { Authorization: `Bearer ${token}` }
        });
        if (profileRes.data.success && profileRes.data.user) {
          const u = profileRes.data.user;
          if (u.phone || u.emergency_contact || u.guardian_name || u.address || u.age || u.sex || u.gender) {
            isAutoFilledFromProfile.value = true;
          }
          if (u.name) form.value.resident_name = u.name;
          if (u.sex || u.gender) form.value.gender = (u.sex || u.gender || '').toLowerCase();
          if (u.age) form.value.age = u.age;
          if (u.phone) form.value.contact_number = normalizePhPhone(u.phone);
          if (u.emergency_contact) form.value.emergency_contact = normalizePhPhone(u.emergency_contact);
          if (u.guardian_name) form.value.guardian_name = u.guardian_name;
          if (u.address) form.value.address = u.address;
        }
      } catch (profileErr) {
        console.error('Failed to fetch real-time profile data:', profileErr);
      }
    }
  } catch (e) {
    console.error('Failed to load house data', e);
    house.value = {};
    rooms.value = [];
    loadError.value = e.response?.status === 404
      ? 'This property is no longer available for booking. Please return to the listings.'
      : 'We could not load the booking form. Please check your connection and try again.';
  } finally {
    isFetchingHouse.value = false;
    isLoading.value = false;
  }
};

const femaleRooms = computed(() => rooms.value.filter(r => (r.gender_type || '').trim().toLowerCase() === 'female'));
const maleRooms = computed(() => rooms.value.filter(r => (r.gender_type || '').trim().toLowerCase() === 'male'));
const mixedRooms = computed(() => rooms.value.filter(r => {
  const g = (r.gender_type || '').trim().toLowerCase();
  return g !== 'female' && g !== 'male';
}));

const selectedRoom = computed(() => rooms.value.find(r => String(r.id) === String(form.value.roomId)));
const monthlyRent = computed(() => {
  if (selectedRoom.value && parseFloat(selectedRoom.value.price) > 0) {
    return parseFloat(selectedRoom.value.price);
  }
  return parseFloat(house.value.price) || 0;
});
const advanceMonths = computed(() => parseInt(house.value.advance_months) || 0);
const depositMonths = computed(() => parseInt(house.value.deposit_months) || 0);

const depositFixedAmount = computed(() => 0);

const depositType = computed(() => house.value.deposit_type || 'refundable');

const SD = computed(() => depositMonths.value * monthlyRent.value + depositFixedAmount.value);
const totalContract = computed(() => monthlyRent.value * (parseInt(form.value.months) || 0));
const initialPayment = computed(() => Math.max(1, advanceMonths.value) * monthlyRent.value + SD.value);

const advanceLabel = computed(() =>
  advanceMonths.value > 0 ? `${advanceMonths.value} Month${advanceMonths.value > 1 ? 's' : ''} Advance` : `First Month's Rent`
);
const depositLabel = computed(() => {
  const friendly = depositType.value === 'consumable' ? 'Consumable' : 'Refundable';
  return depositMonths.value > 0
    ? `${depositMonths.value} Month${depositMonths.value > 1 ? 's' : ''} ${friendly} Deposit`
    : 'No Deposit (Promo)';
});
const depositNote = computed(() => {
  if (depositMonths.value > 0) {
    const type = depositType.value === 'consumable' ? 'consumable for your final month' : 'refundable upon move-out';
    return `"The ${depositMonths.value} Month Deposit is ${type}."`;
  }
  return '"No deposit required! Enjoy your stay."';
});

const formatMoney = (val) =>
  Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatRoomNumber = (val) => {
  if (!val) return '';
  const trimmed = String(val).trim();
  if (/^(room|bed|unit|cottage|house)\b/i.test(trimmed)) {
    return trimmed;
  }
  return `Room ${trimmed}`;
};

const sanitizePhoneInput = (fieldKey) => {
  form.value[fieldKey] = normalizePhPhone(form.value[fieldKey]);
};

// Step 1: Form submit opens the review/confirmation modal — nothing is sent yet
const openConfirmModal = () => {
  if (isLoading.value || loadError.value || !house.value.id) return;
  if (reservationBlocked.value) return;
  if (isGuest) {
    errorMsg.value = 'You must be logged in to book.';
    return;
  }
  const validationError = validateInput('booking', form.value, { today: minCheckInDate.value });
  if (validationError) {
    showBookingError(validationError);
    return;
  }
  if (!isValidPhPhone(form.value.contact_number)) {
    errorMsg.value = 'Contact number must be a valid PH mobile number (11 digits, starting with 09).';
    showBookingError(errorMsg.value);
    return;
  }
  if (form.value.emergency_contact && !isValidPhPhone(form.value.emergency_contact)) {
    errorMsg.value = 'Emergency contact number must be a valid PH mobile number (11 digits, starting with 09).';
    showBookingError(errorMsg.value);
    return;
  }
  errorMsg.value = '';
  if (currentUser && !currentUser.dpa_accepted) {
    showDpaModal.value = true;
    return;
  }
  showConfirmModal.value = true;
};

// Step 2: "Ok, Submit Booking" in the confirm modal — this is where the booking is actually sent
const confirmAndSubmit = async () => {
  if (isLoading.value || loadError.value || !house.value.id) return;
  if (reservationBlocked.value) return;
  const validationError = validateInput('booking', form.value, { today: minCheckInDate.value });
  if (validationError) {
    showConfirmModal.value = false;
    showBookingError(validationError);
    return;
  }
  if (isSaving.value) return; // Hard guard: prevent double-fire
  showConfirmModal.value = false;
  isSaving.value = true;
  successMsg.value = '';
  errorMsg.value = '';
  try {
    await axios.post(`/api/student/book/${houseId}`, form.value, {
      headers: { Authorization: `Bearer ${token}` }
    });
    showSuccessModal.value = true;
  } catch (e) {
    reservationBlocked.value = ['pending_booking', 'confirmed_booking', 'active_stay'].includes(e.response?.data?.errorCode);
    errorMsg.value = e.response?.data?.message || 'Unable to submit booking. Please check your connection and try again.';
    showBookingError(errorMsg.value);
  } finally {
    isSaving.value = false;
  }
};

// Navigates to bookings after the success modal is acknowledged
const handleSuccessModalClose = () => {
  showSuccessModal.value = false;
  router.push('/student/bookings');
};


import { setupAddressAutocomplete } from '../../utils/placesAutocomplete.js';

const initAddressAutocomplete = (el) => {
  if (el) {
    setupAddressAutocomplete(el, (selectedAddress) => {
      form.value.address = selectedAddress;
    });
  }
};

onMounted(async () => {
  await fetchData();
  if (!token) return;
  try {
    const response = await axios.get('/api/student/bookings', { headers: { Authorization: `Bearer ${token}` } });
    const existing = (response.data.bookings || []).find(b => b.status === 'pending' || b.status === 'confirmed');
    if (existing) {
      reservationBlocked.value = true;
      errorMsg.value = existing.status === 'pending'
        ? `You already have a pending reservation at ${existing.house_name}. Cancel it or wait for the owner's decision before reserving another boarding house.`
        : 'You already have a confirmed booking. View My Bookings to manage your stay.';
    }
  } catch (error) {
    // Submission still checks current reservation eligibility on the server.
    console.warn('Could not check existing reservations:', error.message);
  }
});
</script>

<template>
  <div class="bg-[#f8fafc] min-h-screen font-sans text-slate-800 pb-20">
    <StudentNav />

    <main class="max-w-4xl mx-auto py-10 px-6">

      <!-- LOADING -->
      <div v-if="isLoading" class="text-center py-32">
        <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p class="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Loading booking form...</p>
      </div>

      <section v-else-if="loadError" role="alert" class="bg-white border border-slate-200 rounded-3xl p-8 text-center my-8">
        <h1 class="text-xl font-bold text-slate-900 mb-3">Booking form unavailable</h1>
        <p class="text-slate-600 mb-6">{{ loadError }}</p>
        <div class="flex flex-wrap justify-center gap-4">
          <button @click="fetchData" :disabled="isFetchingHouse" class="bg-blue-600 text-white rounded-xl px-6 py-3 font-bold disabled:opacity-50">Try Again</button>
          <button @click="router.push('/student/dashboard')" class="text-blue-700 font-bold px-6 py-3">Back to Listings</button>
        </div>
      </section>

      <template v-else>
        <!-- HEADER -->
        <div class="text-center mb-10 mt-6">
          <h1 class="text-3xl font-black text-slate-900 uppercase tracking-tight">{{ house.name }}</h1>
          <p class="text-slate-500 font-bold text-xs uppercase tracking-[0.2em] mt-2">Secure your reservation</p>
        </div>

        <!-- Minimal Alerts -->
        <div v-if="successMsg" class="mb-6 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[13px] font-semibold p-5 rounded-2xl flex items-center gap-3 animate-fade-in">
          <i class="fa-solid fa-circle-check text-emerald-500"></i> {{ successMsg }}
        </div>
        <div v-if="errorMsg" ref="bookingErrorRef" role="alert" class="mb-6 bg-rose-50 border border-rose-200 text-rose-800 text-[13px] font-semibold p-4 sm:p-5 rounded-2xl flex items-start gap-3 animate-fade-in">
          <i class="fa-solid fa-circle-info text-rose-500 shrink-0 mt-1" aria-hidden="true"></i>
          <div class="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-3">
            <p class="min-w-0 flex-1 break-words leading-relaxed">{{ errorMsg }}</p>
            <router-link v-if="reservationBlocked" to="/student/bookings" class="self-start sm:self-auto font-bold underline shrink-0">My Bookings</router-link>
          </div>
        </div>

        <form @submit.prevent="openConfirmModal" @input="clearInputError" @change="clearInputError" class="space-y-6 text-left">

          <!-- STEP 1: SCHEDULE -->
          <div class="bg-white rounded-3xl p-8 shadow-sm border border-slate-200/50 animate-fade-in">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-blue-100">1</div>
              <h2 class="text-sm font-black uppercase tracking-widest text-slate-900">Schedule Information</h2>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label for="booking-check-in-date" class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Check-In Date</label>
                <input id="booking-check-in-date" type="date" max="9999-12-31" v-model="form.check_in_date" :min="minCheckInDate" @blur="handleCheckInDateChange" aria-describedby="booking-check-in-help" required
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition">
                <p id="booking-check-in-help" class="mt-2 text-xs text-slate-500">Tap the date field or calendar icon to choose your check-in date.</p>
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Duration of Stay (Months)</label>
                <input type="number" v-model="form.months" placeholder="Enter months" min="1" max="2147483647" step="1" required
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition">
              </div>
            </div>
          </div>

          <!-- STEP 2: ROOM SELECTION -->
          <div class="bg-white rounded-3xl p-8 shadow-sm border border-slate-200/50">
            <div class="flex items-center gap-3 mb-8">
              <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-blue-100">2</div>
              <h2 class="text-sm font-black uppercase tracking-widest text-slate-900">Choose Your Room</h2>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <!-- Female -->
              <div class="bg-gradient-to-br from-pink-50 to-rose-50/50 rounded-[1.5rem] p-6 lg:p-8 border border-pink-100 shadow-sm">
                <h3 class="flex items-center gap-2 text-sm font-black text-pink-700 uppercase tracking-widest mb-6 border-b border-pink-200/40 pb-3">
                  <span class="w-2.5 h-2.5 rounded-full bg-pink-500 shadow-sm"></span>
                  Female's Wing
                </h3>
                <div class="grid grid-cols-1 gap-y-3">
                  <p v-if="femaleRooms.length === 0" class="text-slate-400 text-xs font-bold uppercase tracking-widest">No rooms listed.</p>
                  <label
                    v-for="room in femaleRooms"
                    :key="room.id"
                    class="flex items-center gap-3 group bg-white hover:bg-white rounded-xl p-2.5 transition border border-slate-200/60 shadow-sm hover:shadow cursor-pointer"
                    :class="{ 'opacity-50 cursor-not-allowed': room.occupant_count >= room.capacity }"
                  >
                    <input
                      type="radio"
                      name="roomId"
                      :value="room.id"
                      v-model="form.roomId"
                      :disabled="room.occupant_count >= room.capacity"
                      required
                      class="w-5 h-5 flex-shrink-0 accent-blue-600"
                    >
                    <div class="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full justify-between pr-1 text-slate-800">
                      <div class="flex flex-col text-left">
                        <span class="text-sm sm:text-base font-semibold leading-tight">{{ formatRoomNumber(room.room_number) }}</span>
                        <span class="text-[11px] font-black text-blue-600">₱{{ formatMoney(room.price || house.price) }}/mo</span>
                      </div>
                      <div class="flex flex-col items-end gap-1 shrink-0">
                        <span v-if="room.occupant_count < room.capacity" class="bg-green-500/10 text-green-700 border border-green-200/50 text-[9px] sm:text-[10px] px-2 sm:px-2.5 py-0.5 rounded-full font-bold shadow-sm">
                          {{ room.occupant_count }}/{{ room.capacity }} Occupied ({{ Math.max(0, room.capacity - room.occupant_count) }} Vacant)
                        </span>
                        <span v-else class="bg-red-500/10 text-red-700 border border-red-200/50 text-[9px] sm:text-[10px] px-2 sm:px-2.5 py-0.5 rounded-full font-bold shadow-sm">
                          Full ({{ room.capacity }}/{{ room.capacity }} Occupied)
                        </span>
                        <span v-if="room.pending_request_count > 0 && room.occupant_count < room.capacity"
                              class="bg-amber-50 text-amber-700 border border-amber-200/60 text-[9px] px-2 py-0.5 rounded-full font-bold">
                          {{ room.pending_request_count }} pending request{{ room.pending_request_count > 1 ? 's' : '' }}
                        </span>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <!-- Male -->
              <div class="bg-gradient-to-br from-blue-50 to-cyan-50/50 rounded-[1.5rem] p-6 lg:p-8 border border-blue-100 shadow-sm">
                <h3 class="flex items-center gap-2 text-sm font-black text-blue-700 uppercase tracking-widest mb-6 border-b border-blue-200/40 pb-3">
                  <span class="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm"></span>
                  Male's Wing
                </h3>
                <div class="grid grid-cols-1 gap-y-3">
                  <p v-if="maleRooms.length === 0" class="text-slate-400 text-xs font-bold uppercase tracking-widest">No rooms listed.</p>
                  <label
                    v-for="room in maleRooms"
                    :key="room.id"
                    class="flex items-center gap-3 group bg-white hover:bg-white rounded-xl p-2.5 transition border border-slate-200/60 shadow-sm hover:shadow cursor-pointer"
                    :class="{ 'opacity-50 cursor-not-allowed': room.occupant_count >= room.capacity }"
                  >
                    <input
                      type="radio"
                      name="roomId"
                      :value="room.id"
                      v-model="form.roomId"
                      :disabled="room.occupant_count >= room.capacity"
                      required
                      class="w-5 h-5 flex-shrink-0 accent-blue-600"
                    >
                    <div class="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full justify-between pr-1 text-slate-800">
                      <div class="flex flex-col text-left">
                        <span class="text-sm sm:text-base font-semibold leading-tight">{{ formatRoomNumber(room.room_number) }}</span>
                        <span class="text-[11px] font-black text-blue-600">₱{{ formatMoney(room.price || house.price) }}/mo</span>
                      </div>
                      <div class="flex flex-col items-end gap-1 shrink-0">
                        <span v-if="room.occupant_count < room.capacity" class="bg-green-500/10 text-green-700 border border-green-200/50 text-[9px] sm:text-[10px] px-2 sm:px-2.5 py-0.5 rounded-full font-bold shadow-sm">
                          {{ room.occupant_count }}/{{ room.capacity }} Occupied ({{ Math.max(0, room.capacity - room.occupant_count) }} Vacant)
                        </span>
                        <span v-else class="bg-red-500/10 text-red-700 border border-red-200/50 text-[9px] sm:text-[10px] px-2 sm:px-2.5 py-0.5 rounded-full font-bold shadow-sm">
                          Full ({{ room.capacity }}/{{ room.capacity }} Occupied)
                        </span>
                        <span v-if="room.pending_request_count > 0 && room.occupant_count < room.capacity"
                              class="bg-amber-50 text-amber-700 border border-amber-200/60 text-[9px] px-2 py-0.5 rounded-full font-bold">
                          {{ room.pending_request_count }} pending request{{ room.pending_request_count > 1 ? 's' : '' }}
                        </span>
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- STEP 3: PERSONAL DETAILS -->
          <div class="bg-white rounded-3xl p-8 shadow-sm border border-slate-200/50">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-blue-100">3</div>
                <h2 class="text-sm font-black uppercase tracking-widest text-slate-900">Personal Details</h2>
              </div>
              <div v-if="isAutoFilledFromProfile" class="inline-flex items-center gap-1.5 text-[9px] font-black text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200/60 uppercase tracking-widest self-start sm:self-auto">
                <i class="fa-solid fa-circle-check text-emerald-500"></i> Auto-Filled from Profile
              </div>
              <div v-else class="inline-flex items-center gap-1.5 text-[9px] font-black text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-200/60 uppercase tracking-widest self-start sm:self-auto">
                <i class="fa-solid fa-cloud-arrow-up text-blue-500"></i> Auto-Saves to Profile on Submit
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Resident Full Name</label>
                <input type="text" v-model="form.resident_name" required
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition">
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Gender Specification</label>
                <select v-model="form.gender" required
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition appearance-none cursor-pointer">
                  <option value="" disabled>Select Gender</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Age</label>
                <input type="number" v-model="form.age" placeholder="Your age" required
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition">
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Contact Number</label>
                <input type="text" v-model="form.contact_number" @input="sanitizePhoneInput('contact_number')"
                  inputmode="numeric" maxlength="11" placeholder="09xxxxxxxxx" required
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition">
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Emergency Contact</label>
                <input type="text" v-model="form.emergency_contact" @input="sanitizePhoneInput('emergency_contact')"
                  inputmode="numeric" maxlength="11" placeholder="09xxxxxxxxx"
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition">
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Guardian Name</label>
                <input type="text" v-model="form.guardian_name" placeholder="Guardian's full name"
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition">
              </div>
              <div class="md:col-span-2">
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Home Address</label>
                <input type="text" :ref="initAddressAutocomplete" v-model="form.address" placeholder="Barangay, Municipality, Province"
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition">
              </div>
            </div>
          </div>
          
          <!-- STEP 4: PAYMENT METHOD -->
          <div class="bg-white rounded-3xl p-8 shadow-sm border border-slate-200/50">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-blue-100">4</div>
              <h2 class="text-sm font-black uppercase tracking-widest text-slate-900">Payment Method</h2>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Option A: Cash -->
              <label class="flex items-start p-5 rounded-2xl border cursor-pointer transition"
                     :class="form.payment_method === 'cash' ? 'bg-blue-50/50 border-blue-200/60 shadow-sm' : 'bg-slate-50/40 border-slate-200/60 hover:border-slate-300'">
                <input type="radio" v-model="form.payment_method" value="cash" class="w-5 h-5 text-blue-600 mt-2.5" required>
                <div class="ml-4 flex items-start gap-4">
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0"
                       :class="form.payment_method === 'cash' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'">
                    <i class="fa-solid fa-money-bill-transfer text-base"></i>
                  </div>
                  <div class="text-left">
                    <span class="block text-sm font-black text-slate-900 uppercase tracking-tight leading-tight">Over-the-Counter Cash</span>
                    <span class="block text-[9px] text-blue-600 font-black uppercase tracking-widest mt-0.5">Pay directly at boarding house</span>
                    <p class="text-[10px] text-slate-400 mt-3 font-medium leading-relaxed italic">
                      "Submit your reservation. Once approved by the landlord, you can pay your upfront move-in cost directly to them in person upon check-in."
                    </p>
                  </div>
                </div>
              </label>

              <!-- Option B: PayMongo (GCash / Card) -->
              <label class="flex items-start p-5 rounded-2xl border cursor-pointer transition"
                     :class="form.payment_method === 'paymongo' ? 'bg-blue-50/50 border-blue-200/60 shadow-sm' : 'bg-slate-50/40 border-slate-200/60 hover:border-slate-300'">
                <input type="radio" v-model="form.payment_method" value="paymongo" class="w-5 h-5 text-blue-600 mt-2.5" required>
                <div class="ml-4 flex items-start gap-4">
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0"
                       :class="form.payment_method === 'paymongo' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'">
                    <i class="fa-solid fa-credit-card text-base"></i>
                  </div>
                  <div class="text-left">
                    <span class="block text-sm font-black text-slate-900 uppercase tracking-tight leading-tight">GCash / Cards (Online)</span>
                    <span class="block text-[9px] text-blue-600 font-black uppercase tracking-widest mt-0.5">Pay via secure PayMongo portal</span>
                    <p class="text-[10px] text-slate-400 mt-3 font-medium leading-relaxed italic">
                      "Submit your reservation first. Once approved, click the 'Pay Move-In Cost' button on your dashboard to complete payment securely online."
                    </p>
                  </div>
                </div>
              </label>
            </div>
          </div>

          <!-- DYNAMIC COST SUMMARY (Only reveals if a room is actively selected) -->
          <div v-if="form.roomId" class="bg-gradient-to-br from-slate-900 to-blue-950 text-white rounded-3xl p-8 shadow-md border border-blue-900/50 animate-fade-in">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
                <i class="fa-solid fa-calculator"></i>
              </div>
              <h2 class="text-sm font-black uppercase tracking-widest text-slate-200">Upfront Cost &amp; Contract Summary</h2>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
              <!-- Breakdown -->
              <div class="space-y-4 text-left">
                <h3 class="text-[10px] font-black text-blue-400 uppercase tracking-widest border-b border-slate-800 pb-2">Breakdown of Fees</h3>
                <div class="space-y-3">
                  <div class="flex justify-between items-center text-xs text-slate-300">
                    <span>Monthly Room Rent</span>
                    <span class="font-bold text-white">₱{{ formatMoney(monthlyRent) }}</span>
                  </div>
                  <div class="flex justify-between items-center text-xs text-slate-300">
                    <span>Stay Duration</span>
                    <span class="font-bold text-white">{{ form.months || 0 }} Month(s)</span>
                  </div>
                  <div class="border-t border-slate-800/50 pt-2 space-y-3">
                    <div class="flex justify-between items-center text-xs text-slate-300">
                      <span>{{ advanceLabel }}</span>
                      <span class="font-bold text-white">₱{{ formatMoney(Math.max(1, advanceMonths) * monthlyRent) }}</span>
                    </div>
                    <div class="flex justify-between items-center text-xs text-slate-300">
                      <span>{{ depositLabel }}</span>
                      <span class="font-bold text-white">₱{{ formatMoney(SD) }}</span>
                    </div>
                  </div>
                  <div class="flex justify-between items-center text-xs text-emerald-400 font-black border-t border-slate-800/80 pt-3">
                    <span>INITIAL MOVE-IN COST</span>
                    <span class="text-sm">₱{{ formatMoney(initialPayment) }}</span>
                  </div>
                  <p class="text-[10px] text-slate-400 italic mt-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800/30 leading-relaxed">
                    {{ depositNote }}
                  </p>
                </div>
              </div>

              <!-- Totals -->
              <div class="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col justify-between gap-6 text-left">
                <div>
                  <span class="block text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">Total Stay Value</span>
                  <span class="text-xl font-bold text-white">₱{{ formatMoney(totalContract) }}</span>
                  <span class="block text-[9px] text-slate-400 mt-1">Total rent for the entire check-in period</span>
                </div>
                <div class="border-t border-white/10 pt-4">
                  <span class="block text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Initial Payment Due (Move-in Cost)</span>
                  <span class="text-3xl font-black text-emerald-400">₱{{ formatMoney(initialPayment) }}</span>
                  <span class="block text-[9px] text-slate-400 mt-1">Rent advance + rent deposit. Due upon checking in.</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Minimalist Selection Placeholder Banner -->
          <div v-else class="bg-white border border-slate-200/60 rounded-[1.5rem] p-8 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">
            <i class="fa-solid fa-hotel mb-2 text-2xl block text-slate-300"></i>
            Please choose a room above to view moving terms and calculate stay value.
          </div>
          
          <!-- BUTTONS -->
          <div class="flex flex-col md:flex-row gap-4 pt-6">
            <router-link
              :to="`/student/house/${houseId}`"
              class="flex-1 bg-white border-2 border-slate-200 text-slate-400 font-black py-4 rounded-2xl text-xs uppercase tracking-widest hover:bg-slate-50 transition text-center"
            >Cancel</router-link>
            <button
              type="submit"
              :disabled="isSaving || reservationBlocked"
              class="flex-[2] bg-blue-600 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest shadow-xl shadow-blue-200 hover:bg-slate-900 transition-all transform hover:-translate-y-1 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              <div v-if="isSaving" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              {{ isSaving ? 'Submitting...' : 'Confirm Booking' }}
            </button>
          </div>
        </form>
      </template>
    </main>

    <!-- ═══════════════════════════════════════════════════════════ -->
    <!-- PRE-SUBMISSION REVIEW MODAL: Confirm before sending       -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <div v-if="showConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
      <div class="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-left">
        <!-- Header -->
        <div class="bg-slate-900 px-8 py-6 flex items-center gap-4">
          <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
            <i class="fa-solid fa-clipboard-check text-white text-2xl"></i>
          </div>
          <div>
            <h3 class="text-white font-black text-lg uppercase tracking-tight leading-none">Review Your Booking</h3>
            <span class="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1.5 block">Please confirm the details below before submitting</span>
          </div>
        </div>

        <!-- Body: Summary of what's about to be submitted -->
        <div class="p-8 space-y-4 max-h-[65vh] overflow-y-auto">
          <div class="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <div>
              <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">House</p>
              <p class="font-bold text-slate-800">{{ house.name }}</p>
            </div>
            <div>
              <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Room</p>
              <p class="font-bold text-slate-800">
                {{ rooms.find(r => r.id === form.roomId)?.room_number || '—' }}
              </p>
            </div>
            <div>
              <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Name</p>
              <p class="font-bold text-slate-800">{{ form.resident_name || '—' }}</p>
            </div>
            <div>
              <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Gender</p>
              <p class="font-bold text-slate-800 capitalize">{{ form.gender || '—' }}</p>
            </div>
            <div>
              <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Age</p>
              <p class="font-bold text-slate-800">{{ form.age || '—' }}</p>
            </div>
            <div>
              <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Contact</p>
              <p class="font-bold text-slate-800">{{ form.contact_number || '—' }}</p>
            </div>
            <div>
              <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Check-In Date</p>
              <p class="font-bold text-slate-800">{{ formatCheckoutDateString(form.check_in_date) }}</p>
            </div>
            <div>
              <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Est. Check-Out Date</p>
              <p class="font-bold text-blue-600">
                {{ form.check_in_date && form.months ? formatCheckoutDateString(computeCheckoutDate(form.check_in_date, form.months)) : '—' }}
              </p>
            </div>
            <div>
              <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Duration</p>
              <p class="font-bold text-slate-800">{{ form.months || '—' }} Month{{ parseInt(form.months) > 1 ? 's' : '' }}</p>
            </div>
            <div>
              <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Payment Method</p>
              <p class="font-bold text-slate-800 uppercase">{{ form.payment_method === 'paymongo' ? 'GCash / Card (Online)' : 'Cash (Over-the-Counter)' }}</p>
            </div>
            <div class="col-span-2">
              <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Address</p>
              <p class="font-bold text-slate-800">{{ form.address || '—' }}</p>
            </div>
          </div>

          <!-- Move-in cost callout -->
          <div class="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 mt-2">
            <p class="text-[9px] font-black text-emerald-700 uppercase tracking-widest mb-1">Estimated Move-in Cost</p>
            <p class="text-2xl font-black text-emerald-600">₱{{ formatMoney(initialPayment) }}</p>
            <p class="text-[10px] text-emerald-700/70 font-bold mt-0.5">{{ advanceLabel }} + {{ depositLabel }}</p>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="px-8 pb-8 pt-4 flex flex-col sm:flex-row justify-end gap-3 border-t border-slate-100">
          <button type="button" @click="showConfirmModal = false"
            class="w-full sm:w-auto px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-[11px] uppercase tracking-widest rounded-xl transition flex items-center justify-center gap-2 cursor-pointer">
            <i class="fa-solid fa-arrow-left text-[10px]"></i> Back to Form
          </button>
          <button type="button" @click="confirmAndSubmit" :disabled="isSaving || reservationBlocked"
            class="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest rounded-xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer">
            <div v-if="isSaving" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            {{ isSaving ? 'Submitting...' : 'Submit Booking' }}
            <i v-if="!isSaving" class="fa-solid fa-check text-[10px]"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════ -->
    <!-- CUSTOM INFORMATIONAL MODAL: Booking Success & Next Steps   -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <div v-if="showSuccessModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 sm:p-6" @click.self="handleSuccessModalClose">
      <div class="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-left flex flex-col max-h-[90vh]">
        <!-- Header -->
        <div class="bg-blue-600 px-8 py-6 flex items-center gap-4 shrink-0">
          <div class="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center shrink-0">
            <i class="fa-solid fa-circle-check text-white text-2xl"></i>
          </div>
          <div>
            <h3 class="text-white font-black text-lg uppercase tracking-tight leading-none">Booking Submitted</h3>
            <span class="text-blue-200 text-[10px] font-black uppercase tracking-widest mt-1.5 block">Your reservation request is registered</span>
          </div>
        </div>

        <!-- Body — scrollable so it never clips on small screens -->
        <div class="p-8 md:p-10 space-y-6 overflow-y-auto flex-1">
          <p class="text-slate-600 font-semibold text-sm leading-relaxed">
            Hello, <strong class="text-slate-900">{{ form.resident_name }}</strong>! Your room reservation request for <strong class="text-slate-900">{{ house.name }}</strong> has been successfully sent to the landlord.
          </p>

          <!-- Max Waiting Time Callout -->
          <div class="bg-amber-50/80 border border-amber-200/80 p-4 rounded-2xl flex items-center gap-3.5">
            <div class="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-md shadow-amber-200">
              <i class="fa-solid fa-clock"></i>
            </div>
            <div class="text-left">
              <p class="text-[10px] font-black uppercase tracking-widest text-amber-800">Max Waiting Time: 24 Hours</p>
              <p class="text-[11px] text-amber-900/90 font-bold leading-tight mt-0.5">Please allow up to 24 hours for the landlord to verify room availability and confirm your request.</p>
            </div>
          </div>

          <!-- Conditional Steps: Online PayMongo Flow -->
          <div v-if="form.payment_method === 'paymongo'" class="space-y-4">
            <h4 class="text-[10px] font-black text-blue-600 uppercase tracking-widest border-b border-slate-100 pb-2">Next Steps for Online Payment</h4>
            <div class="space-y-4">
              <!-- Step 1 -->
              <div class="flex items-start gap-3.5">
                <div class="w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">1</div>
                <div>
                  <h5 class="font-bold text-slate-800 text-xs uppercase tracking-wide">Awaiting Landlord Review (Max 24h)</h5>
                  <p class="text-slate-400 text-[11px] leading-relaxed mt-0.5">The landlord will check room availability and verify your reservation details within 24 hours.</p>
                </div>
              </div>
              <!-- Step 2 -->
              <div class="flex items-start gap-3.5">
                <div class="w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">2</div>
                <div>
                  <h5 class="font-bold text-slate-800 text-xs uppercase tracking-wide">Secure your room slot</h5>
                  <p class="text-slate-400 text-[11px] leading-relaxed mt-0.5">Once approved, you will receive an alert in your inbox notifying you of the approval and instructing you to complete your payment.</p>
                </div>
              </div>
              <!-- Step 3 -->
              <div class="flex items-start gap-3.5">
                <div class="w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">3</div>
                <div>
                  <h5 class="font-bold text-slate-800 text-xs uppercase tracking-wide">Settle Upfront Move-in Cost</h5>
                  <p class="text-slate-400 text-[11px] leading-relaxed mt-0.5">Go to "My Bookings" and click "Pay Move-In Cost" to pay securely via GCash or Card. Completing this payment officially secures your room slot and registers you as an occupant.</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Conditional Steps: OTC Cash Flow -->
          <div v-else class="space-y-4">
            <h4 class="text-[10px] font-black text-blue-600 uppercase tracking-widest border-b border-slate-100 pb-2">Next Steps for Cash Payment</h4>
            <div class="space-y-4">
              <!-- Step 1 -->
              <div class="flex items-start gap-3.5">
                <div class="w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">1</div>
                <div>
                  <h5 class="font-bold text-slate-800 text-xs uppercase tracking-wide">Awaiting Landlord Review (Max 24h)</h5>
                  <p class="text-slate-400 text-[11px] leading-relaxed mt-0.5">The landlord will review your reservation request and approve your slot within 24 hours.</p>
                </div>
              </div>
              <!-- Step 2 -->
              <div class="flex items-start gap-3.5">
                <div class="w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">2</div>
                <div>
                  <h5 class="font-bold text-slate-800 text-xs uppercase tracking-wide">Secure Check-In</h5>
                  <p class="text-slate-400 text-[11px] leading-relaxed mt-0.5">Once approved, the room is reserved. You will pay the landlord directly in person when you arrive.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="px-8 pb-8 flex flex-col sm:flex-row justify-end gap-3 border-t border-slate-100 pt-4 shrink-0">
          <button type="button" @click="router.push('/student/house/' + houseId)" class="w-full sm:w-auto px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-[11px] uppercase tracking-widest rounded-xl transition flex items-center justify-center gap-2 cursor-pointer">
            <i class="fa-solid fa-house text-[10px]"></i> Back to House
          </button>
          <button type="button" @click="handleSuccessModalClose" class="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer">
            View My Bookings <i class="fa-solid fa-arrow-right text-[10px]"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- Data Privacy Act (DPA 2012) Mandatory Consent Notice Modal -->
    <DataPrivacyModal 
      :show="showDpaModal" 
      title="Student Reservation Data Privacy Notice"
      subtitle="Republic Act No. 10173 (Data Privacy Act of 2012)"
      @accepted="handleDpaAccepted" 
    />
  </div>
</template>
