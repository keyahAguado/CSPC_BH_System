<script setup>
import ReservationFlowSteps from '../../components/ReservationFlowSteps.vue';
import StudentRoomPicker from '../../components/StudentRoomPicker.vue';
import { roomMonthlyPrice, roomIsFull } from '../../utils/studentRoomPicker.js';
import { validateInput, validDate } from '../../utils/inputValidation.js';
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import StudentNav from '../../components/partials/StudentNav.vue';
import DataPrivacyModal from '../../components/DataPrivacyModal.vue';
import AddressPicker from '../../components/AddressPicker.vue';
import { normalizePhPhone, isValidPhPhone } from '../../utils/phoneValidation.js';
import { computeCheckoutDate, formatCheckoutDateString } from '../../utils/dateHelper.js';
import { bookingNow } from '../../utils/bookingClock.js';
import { PAID_RESERVATION_POLICY } from '../../utils/paidReservationPolicy.js';

const route = useRoute();
const router = useRouter();
const houseId = route.params.id;

const house = ref({});
const rooms = ref([]);
const isLoading = ref(true);
const loadError = ref('');
const onlinePaymentAvailable = ref(false);
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

// Today in the Philippines (follows the test clock when it is on); past dates are moved up to it.
const manilaDayOf = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const minCheckInDate = computed(() => manilaDayOf(bookingNow()));
// Same rule the server applies: the owner needs at least 2 hours before 12:00 noon (PHT) on the check-in day,
// so a same-day request must be sent before 10:00 AM. After that, tomorrow is the earliest check-in date.
const MIN_OWNER_WINDOW_MS = 2 * 3600000;
const tooSoonFor = day => validDate(day) && Date.parse(day + 'T12:00:00+08:00') - bookingNow().getTime() < MIN_OWNER_WINDOW_MS;
const earliestCheckInDate = computed(() => tooSoonFor(minCheckInDate.value) ? manilaDayOf(new Date(Date.parse(minCheckInDate.value + 'T12:00:00+08:00') + 86400000)) : minCheckInDate.value);
const checkInTooSoon = computed(() => form.value.check_in_date >= minCheckInDate.value && tooSoonFor(form.value.check_in_date));
const useEarliestCheckIn = () => { form.value.check_in_date = earliestCheckInDate.value; };
const focusCheckInDate = () => { const field = document.getElementById('booking-check-in-date'); field?.scrollIntoView({ behavior: 'smooth', block: 'center' }); field?.focus({ preventScroll: true }); };

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
// Room eligibility uses the sex recorded in the profile; the booking form cannot change a recorded value.
const profileSex = ref('');

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
    onlinePaymentAvailable.value = false;
    try { onlinePaymentAvailable.value = (await axios.get(`/api/payment/availability/${houseId}`, {timeout:8000})).data.available === true; } catch {}
    if (!onlinePaymentAvailable.value) form.value.payment_method = 'cash';

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
          profileSex.value = String(u.sex || '').trim().toLowerCase();
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

const continueToPersonalDetails = () => {
  const section = document.getElementById('booking-personal-details');
  section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  section?.focus({ preventScroll: true });
};

const selectedRoom = computed(() => rooms.value.find(r => String(r.id) === String(form.value.roomId)));
const monthlyRent = computed(() => roomMonthlyPrice(selectedRoom.value, house.value.price));
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


const sanitizePhoneInput = (fieldKey) => {
  form.value[fieldKey] = normalizePhPhone(form.value[fieldKey]);
};

// Step 1: Form submit opens the review/confirmation modal — nothing is sent yet
const openConfirmModal = () => {
  if (isLoading.value || loadError.value || !house.value.id) return;
  if (reservationBlocked.value || scheduleLoading.value || availabilityError.value || !scheduleReady.value) return;
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
  if (reservationBlocked.value || scheduleLoading.value || availabilityError.value || !scheduleReady.value) return;
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
    reservationBlocked.value = ['stay_overlap'].includes(e.response?.data?.errorCode);
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



// Availability is scoped to the requested stay. Ignore stale responses after date changes.
const scheduleReady = computed(() => validDate(form.value.check_in_date) && !checkInTooSoon.value && Number.isInteger(Number(form.value.months)) && Number(form.value.months)>0);
const scheduleLoading = ref(false), availabilityError = ref('');
let availabilityVersion = 0, scheduleTimer;
const refreshRoomAvailability = async () => {
  if (document.visibilityState === 'hidden' || !scheduleReady.value) return;
  const version = ++availabilityVersion;
  const params = {check_in_date:form.value.check_in_date,months:form.value.months};
  scheduleLoading.value = true; availabilityError.value = '';
  try {
    const [houseResult,conflictResult] = await Promise.all([
      axios.get('/api/student/house/'+houseId,{params,timeout:15000,headers:token ? {Authorization:'Bearer '+token} : {}}),
      token ? axios.get('/api/student/stay-conflict',{params,timeout:15000,headers:{Authorization:'Bearer '+token}}) : Promise.resolve({data:{conflict:false}})
    ]);
    if (version !== availabilityVersion) return;
    const data = houseResult.data;
    if (typeof conflictResult.data.conflict !== 'boolean' || String(data.house?.id)!==String(houseId) || !Array.isArray(data.rooms) || data.rooms.some(room=>room.available_count == null)) throw Error('Incomplete availability response');
    rooms.value = data.rooms;
    reservationBlocked.value = Boolean(conflictResult.data.conflict);
    if (reservationBlocked.value) errorMsg.value = 'These dates overlap another pending reservation, approved booking, or stay. Choose dates on or after its checkout, or manage that booking first.';
    else errorMsg.value = '';
    if (selectedRoom.value && roomIsFull(selectedRoom.value)) form.value.roomId = '';
  } catch (error) {
    if (version === availabilityVersion) availabilityError.value = error.response?.data?.message || 'Could not check availability. Please retry before selecting a room.';
  } finally { if(version === availabilityVersion) scheduleLoading.value=false; }
};
watch([() => form.value.check_in_date,() => form.value.months],() => {
  ++availabilityVersion;clearTimeout(scheduleTimer);form.value.roomId='';reservationBlocked.value=false;errorMsg.value='';availabilityError.value='';
  scheduleLoading.value=scheduleReady.value;
  if(scheduleReady.value) scheduleTimer=setTimeout(refreshRoomAvailability,300);
});
onMounted(() => {
  window.addEventListener('focus',refreshRoomAvailability);
  document.addEventListener('visibilitychange',refreshRoomAvailability);
  fetchData();
});
onUnmounted(() => {
  ++availabilityVersion;clearTimeout(scheduleTimer);
  window.removeEventListener('focus',refreshRoomAvailability);
  document.removeEventListener('visibilitychange',refreshRoomAvailability);
});
</script>

<template>
  <div class="bg-[#f8fafc] min-h-screen font-sans text-slate-800 pb-20">
    <StudentNav />

    <main class="max-w-6xl mx-auto py-10 px-4 sm:px-6">

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
        <div v-if="errorMsg" ref="bookingErrorRef" role="alert" class="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-5 text-left animate-fade-in">
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-100 text-red-600"><i :class="['fa-solid', reservationBlocked ? 'fa-calendar-xmark' : 'fa-circle-exclamation']" aria-hidden="true"></i></span>
          <div class="min-w-0 flex-1">
            <p class="text-[14px] font-bold text-red-900">{{ reservationBlocked ? 'These dates overlap another booking' : 'We couldn\'t submit your booking' }}</p>
            <p class="mt-1 break-words text-[13px] leading-relaxed text-red-800">{{ errorMsg }}</p>
            <div v-if="reservationBlocked" class="mt-3 flex flex-wrap gap-2">
              <button type="button" class="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-red-700" @click="focusCheckInDate"><i class="fa-solid fa-calendar-days" aria-hidden="true"></i>Change dates</button>
              <router-link to="/student/bookings" class="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-red-700 hover:bg-red-50">View My Bookings<i class="fa-solid fa-arrow-right" aria-hidden="true"></i></router-link>
            </div>
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
                <input id="booking-check-in-date" type="date" max="9999-12-31" v-model="form.check_in_date" :min="earliestCheckInDate" @blur="handleCheckInDateChange" :aria-invalid="checkInTooSoon" :aria-describedby="checkInTooSoon ? 'booking-check-in-error' : 'booking-check-in-help'" required
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition">
                <div v-if="checkInTooSoon" id="booking-check-in-error" role="alert" class="mt-2 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-800"><i class="fa-solid fa-circle-exclamation mt-0.5 text-red-600" aria-hidden="true"></i><div><p>This check-in date is too soon for the owner to respond. Requests must be sent at least 2 hours before 12:00 noon on the check-in day. Please choose a later check-in date.</p><button type="button" class="mt-1.5 font-semibold text-blue-700 underline hover:text-blue-800" @click="useEarliestCheckIn">Use {{ formatCheckoutDateString(earliestCheckInDate) }}</button></div></div>
                <p v-else id="booking-check-in-help" class="mt-2 text-xs text-slate-500">Tap the date field or calendar icon to choose your check-in date. Same-day requests close at 10:00 AM.</p>
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Duration of Stay (Months)</label>
                <input type="number" v-model="form.months" placeholder="Enter months" min="1" max="2147483647" step="1" required
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition">
              </div>
            </div>
          </div>

          <!-- STEP 2: ROOM SELECTION -->
          <section class="rounded-2xl border border-amber-200 bg-amber-50/60 px-5 py-4" aria-labelledby="reservation-deadlines-title">
            <h3 id="reservation-deadlines-title" class="flex items-center gap-2 text-[13px] font-bold text-amber-900"><span class="grid h-7 w-7 place-items-center rounded-full bg-amber-100 text-amber-700"><i class="fa-solid fa-clock text-[12px]" aria-hidden="true"></i></span>Reservation deadlines</h3>
            <ul class="mt-3 grid gap-3 text-[13px] leading-relaxed text-slate-700 md:grid-cols-3">
              <li class="flex gap-2.5"><i class="fa-solid fa-user-clock mt-1 text-amber-600" aria-hidden="true"></i><span><strong class="block font-semibold text-slate-900">Owner response</strong>Up to 24 hours, or until 12:00 noon on your check-in day if that is sooner. Send requests at least 2 hours before then.</span></li>
              <li class="flex gap-2.5"><i class="fa-solid fa-credit-card mt-1 text-amber-600" aria-hidden="true"></i><span><strong class="block font-semibold text-slate-900">Online payment</strong>24 hours after approval, or until the end of your check-in day if that comes first.</span></li>
              <li class="flex gap-2.5"><i class="fa-solid fa-hourglass-end mt-1 text-amber-600" aria-hidden="true"></i><span><strong class="block font-semibold text-slate-900">Automatic expiry</strong>Unanswered or unpaid online reservations expire automatically.</span></li>
            </ul>
          </section>
          <p v-if="scheduleReady && !scheduleLoading && !availabilityError" class="inline-flex flex-wrap items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-[13px] font-semibold text-blue-800"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i>Selected stay: {{ formatCheckoutDateString(form.check_in_date) }} &ndash; {{ formatCheckoutDateString(computeCheckoutDate(form.check_in_date,form.months)) }} (checkout)</p>
          <StudentRoomPicker v-if="scheduleReady && !scheduleLoading && !availabilityError" :rooms="rooms" :base-price="house.price" :student-gender="form.gender" v-model="form.roomId" @continue="continueToPersonalDetails" />

          <div v-else :class="['flex flex-col items-center gap-3 rounded-2xl border px-6 py-8 text-center text-sm', availabilityError ? 'border-red-200 bg-red-50 text-red-800' : 'border-dashed border-blue-200 bg-white text-slate-600']" role="status">
            <span :class="['grid h-11 w-11 place-items-center rounded-full', availabilityError ? 'bg-red-100 text-red-600' : 'bg-blue-50 text-blue-600']"><i :class="['fa-solid text-base', availabilityError ? 'fa-triangle-exclamation' : scheduleLoading ? 'fa-spinner fa-spin' : 'fa-bed']" aria-hidden="true"></i></span>
            <p class="max-w-md">{{ availabilityError || (scheduleLoading ? 'Checking beds for your selected stay...' : checkInTooSoon ? 'Choose a later check-in date to see available rooms.' : 'Choose your check-in date and duration above to see available rooms.') }}</p>
            <button v-if="availabilityError" type="button" @click="refreshRoomAvailability" class="rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-700"><i class="fa-solid fa-rotate-right mr-1.5" aria-hidden="true"></i>Retry availability check</button>
          </div>
          <p class="flex gap-2 px-2 text-xs leading-relaxed text-slate-500"><i class="fa-solid fa-circle-info mt-0.5 text-slate-400" aria-hidden="true"></i><span>You can book another stay when the dates do not overlap an existing request, booking, or stay. Checkout day may be the next check-in day; the previous room must be vacated before actual move-in.</span></p>

          <!-- STEP 3: PERSONAL DETAILS -->
          <div id="booking-personal-details" tabindex="-1" class="bg-white rounded-3xl p-8 shadow-sm border border-slate-200/50">
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
                <select v-model="form.gender" required :disabled="!!profileSex" aria-describedby="gender-source"
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition appearance-none cursor-pointer disabled:cursor-not-allowed disabled:text-slate-500">
                  <option value="" disabled>Select Gender</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
                <p id="gender-source" class="mt-2 ml-1 text-[11px] font-medium text-slate-500">{{ profileSex ? 'From your profile. Room eligibility uses this value; change it in Profile settings if it is wrong.' : 'Saved to your profile with this request. Room eligibility uses this value.' }}</p>
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
                <p class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Home Address</p>
                <AddressPicker v-model="form.address" id-prefix="book-address"
                  field-class="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition"
                  label-class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1" />
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

              <!-- Online payment is offered only after this owner's merchant setup is ready. -->
              <label class="flex items-start p-5 rounded-2xl border cursor-pointer transition"
                     :class="form.payment_method === 'paymongo' ? 'bg-blue-50/50 border-blue-200/60 shadow-sm' : 'bg-slate-50/40 border-slate-200/60 hover:border-slate-300'">
                <input type="radio" v-model="form.payment_method" value="paymongo" :disabled="!onlinePaymentAvailable" class="w-5 h-5 text-blue-600 mt-2.5" required>
                <div class="ml-4 flex items-start gap-4">
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0"
                       :class="form.payment_method === 'paymongo' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'">
                    <i class="fa-solid fa-credit-card text-base"></i>
                  </div>
                  <div class="text-left">
                    <span class="block text-sm font-black text-slate-900 uppercase tracking-tight leading-tight">QR Ph via PayMongo</span>
                    <span class="block text-[9px] text-blue-600 font-black uppercase tracking-widest mt-0.5">Pay via secure PayMongo portal</span>
                    <p class="text-[10px] text-slate-400 mt-3 font-medium leading-relaxed italic">
                      {{ onlinePaymentAvailable ? 'After approval, scan the checkout QR code using a supported banking or e-wallet app, including GCash. Pay before the booking deadline.' : 'This owner has not enabled online payments yet. Please choose cash or contact the owner.' }}
                    </p>
                  </div>
                </div>
              </label>
            </div>
            <p v-if="form.payment_method === 'paymongo'" class="mt-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[12px] leading-relaxed text-amber-900"><i class="fa-solid fa-circle-info mt-0.5" aria-hidden="true"></i><span><strong>Paid reservations cannot be cancelled in the platform.</strong> {{ PAID_RESERVATION_POLICY }}</span></p>
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
              :disabled="isSaving || reservationBlocked || scheduleLoading || !!availabilityError || !scheduleReady"
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
    <div v-if="showConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 sm:p-6">
      <div class="popup-panel bg-white w-full max-w-2xl max-h-[calc(100dvh-48px)] flex flex-col rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-left">
        <!-- Header -->
        <div class="bg-slate-900 px-5 sm:px-8 py-5 sm:py-6 shrink-0 flex items-center gap-4">
          <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
            <i class="fa-solid fa-clipboard-check text-white text-2xl"></i>
          </div>
          <div>
            <h3 class="text-white font-black text-lg uppercase tracking-tight leading-none">Review Your Booking</h3>
            <span class="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1.5 block">Please confirm the details below before submitting</span>
          </div>
        </div>

        <!-- Body: Summary of what's about to be submitted -->
        <div class="p-5 sm:p-8 space-y-4 min-h-0 overflow-y-auto flex-1">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm break-words">
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
              <p class="font-bold text-slate-800 uppercase">{{ form.payment_method === 'paymongo' ? 'QR Ph via PayMongo' : 'Cash (Over-the-Counter)' }}</p>
            </div>
            <div class="sm:col-span-2">
              <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Address</p>
              <p class="font-bold text-slate-800">{{ form.address || '—' }}</p>
            </div>
          </div>

          <ReservationFlowSteps :payment-method="form.payment_method" />

          <!-- Move-in cost callout -->
          <div class="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 mt-2">
            <p class="text-[9px] font-black text-emerald-700 uppercase tracking-widest mb-1">Estimated Move-in Cost</p>
            <p class="text-2xl font-black text-emerald-600">₱{{ formatMoney(initialPayment) }}</p>
            <p class="text-[10px] text-emerald-700/70 font-bold mt-0.5">{{ advanceLabel }} + {{ depositLabel }}</p>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="px-5 sm:px-8 pb-5 sm:pb-8 pt-4 shrink-0 flex flex-col sm:flex-row justify-end gap-3 border-t border-slate-100">
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
      <div class="popup-panel bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-left flex flex-col max-h-[90vh]">
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
          <p class="text-slate-900 font-medium text-sm leading-relaxed popup-message">
            Hello, <strong class="text-slate-900">{{ form.resident_name }}</strong>! Your room reservation request for <strong class="text-slate-900">{{ house.name }}</strong> has been successfully sent to the landlord.
          </p>

          <!-- Max Waiting Time Callout -->
          <div class="bg-amber-50/80 border border-amber-200/80 p-4 rounded-2xl flex items-center gap-3.5">
            <div class="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-md shadow-amber-200">
              <i class="fa-solid fa-clock"></i>
            </div>
            <div class="text-left">
              <p class="text-[10px] font-black uppercase tracking-widest text-amber-800">Max Waiting Time: 24 Hours</p>
              <p class="text-[11px] text-amber-900/90 font-bold leading-tight mt-0.5">Please allow up to 24 hours (or until 12:00 noon on your check-in day, if sooner) for the landlord to verify room availability and confirm your request.</p>
            </div>
          </div>

          <ReservationFlowSteps :payment-method="form.payment_method" />
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
