<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import StudentNav from '../../components/partials/StudentNav.vue';

const route = useRoute();
const router = useRouter();
const houseId = route.params.id;

const house = ref({});
const rooms = ref([]);
const isLoading = ref(true);
const isSaving = ref(false);
const successMsg = ref('');
const errorMsg = ref('');
const showSuccessModal = ref(false);

const token = localStorage.getItem('cspc_token');
const isGuest = !token;
import { getApiBaseUrl } from '../../config/api';

const API = getApiBaseUrl();

// Self-healing local storage parser (Guarantees zero start-up crashes)
let currentUserObj = {};
try {
  const userRaw = localStorage.getItem('cspc_user');
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
  age: '',
  contact_number: '',
  emergency_contact: '',
  guardian_name: '',
  address: '',
  payment_method: 'cash' // Default selection
});

const fetchData = async () => {
  if (!navigator.onLine) {
    errorMsg.value = 'You are currently offline. Please connect to the internet to make a booking.';
    isLoading.value = false;
    return;
  }
  try {
    const res = await axios.get(`/api/student/house/${houseId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    house.value = res.data.house || {};
    rooms.value = res.data.rooms || [];

    // Pre-fill user details from active profile session
    form.value.resident_name = currentUser.name || '';
    form.value.age = currentUser.age || '';
    form.value.contact_number = currentUser.phone || '';
    form.value.emergency_contact = currentUser.emergency_contact || '';
    form.value.guardian_name = currentUser.guardian_name || '';
    form.value.address = currentUser.address || '';
  } catch (e) {
    console.error('Failed to load house data', e);
    errorMsg.value = 'Unable to load house details. Please check your connection.';
  } finally {
    isLoading.value = false;
  }
};

const femaleRooms = computed(() => rooms.value.filter(r => r.gender_type === 'female'));
const maleRooms = computed(() => rooms.value.filter(r => r.gender_type === 'male'));

const monthlyRent = computed(() => parseFloat(house.value.price) || 0);
const advanceMonths = computed(() => parseInt(house.value.advance_months) || 0);
const depositMonths = computed(() => parseInt(house.value.deposit_months) || 0);

const depositFixedAmount = computed(() => {
  const parsed = parseFloat(house.value.deposit_fixed_amount);
  return isNaN(parsed) ? 0 : parsed;
});

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

const submitBooking = async () => {
  if (isGuest) {
    errorMsg.value = 'You must be logged in to book.';
    return;
  }
  isSaving.value = true;
  successMsg.value = '';
  errorMsg.value = '';
  try {
    await axios.post(`/api/student/book/${houseId}`, form.value, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    // Open the informative success modal instead of auto-redirecting instantly
    showSuccessModal.value = true;

  } catch (e) {
    errorMsg.value = e.response?.data?.message || 'Unable to submit booking. Please check your connection and try again.';
  } finally {
    isSaving.value = false;
  }
};

// Redirects the student to their bookings page upon clicking the close button
const handleSuccessModalClose = () => {
  showSuccessModal.value = false;
  router.push('/student/bookings');
};


onMounted(fetchData);
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
        <div v-if="errorMsg" class="mb-6 bg-rose-50 border border-rose-200 text-rose-800 text-[13px] font-semibold p-5 rounded-2xl flex items-center gap-3 animate-fade-in">
          <i class="fa-solid fa-circle-info text-rose-500"></i> {{ errorMsg }}
        </div>

        <form @submit.prevent="submitBooking" class="space-y-6 text-left">

          <!-- STEP 1: SCHEDULE -->
          <div class="bg-white rounded-3xl p-8 shadow-sm border border-slate-200/50 animate-fade-in">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-blue-100">1</div>
              <h2 class="text-sm font-black uppercase tracking-widest text-slate-900">Schedule Information</h2>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Check-In Date</label>
                <input type="date" v-model="form.check_in_date" required
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition">
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Duration of Stay (Months)</label>
                <input type="number" v-model="form.months" placeholder="Enter months" min="1" required
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
                    <div class="flex items-center gap-2 w-full justify-between pr-1 text-slate-800">
                      <span class="text-base font-semibold min-w-[4.5rem]">Room {{ room.room_number }}</span>
                      <span v-if="room.occupant_count < room.capacity" class="bg-green-500/10 text-green-700 border border-green-200/50 text-[10px] px-2.5 py-0.5 rounded-full font-bold shadow-sm whitespace-nowrap">
                        Available {{ room.capacity - room.occupant_count }}/{{ room.capacity }}
                      </span>
                      <span v-else class="bg-red-500/10 text-red-700 border border-red-200/50 text-[10px] px-2.5 py-0.5 rounded-full font-bold shadow-sm whitespace-nowrap">
                        Occupied {{ room.capacity }}/{{ room.capacity }}
                      </span>
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
                    <div class="flex items-center gap-2 w-full justify-between pr-1 text-slate-800">
                      <span class="text-base font-semibold min-w-[4.5rem]">Room {{ room.room_number }}</span>
                      <span v-if="room.occupant_count < room.capacity" class="bg-green-500/10 text-green-700 border border-green-200/50 text-[10px] px-2.5 py-0.5 rounded-full font-bold shadow-sm whitespace-nowrap">
                        Available {{ room.capacity - room.occupant_count }}/{{ room.capacity }}
                      </span>
                      <span v-else class="bg-red-500/10 text-red-700 border border-red-200/50 text-[10px] px-2.5 py-0.5 rounded-full font-bold shadow-sm whitespace-nowrap">
                        Occupied {{ room.capacity }}/{{ room.capacity }}
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- STEP 3: PERSONAL DETAILS -->
          <div class="bg-white rounded-3xl p-8 shadow-sm border border-slate-200/50">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-blue-100">3</div>
              <h2 class="text-sm font-black uppercase tracking-widest text-slate-900">Personal Details</h2>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="md:col-span-2">
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Resident Full Name</label>
                <input type="text" v-model="form.resident_name" required
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition">
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Age</label>
                <input type="number" v-model="form.age" placeholder="Your age" required
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition">
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Contact Number</label>
                <input type="text" v-model="form.contact_number" placeholder="09xxxxxxxxx" required
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition">
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Emergency Contact</label>
                <input type="text" v-model="form.emergency_contact" placeholder="09xxxxxxxxx"
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition">
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Guardian Name</label>
                <input type="text" v-model="form.guardian_name" placeholder="Guardian's full name"
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition">
              </div>
              <div class="md:col-span-2">
                <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Home Address</label>
                <input type="text" v-model="form.address" placeholder="Barangay, Municipality, Province"
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
              :disabled="isSaving"
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
    <!-- CUSTOM INFORMATIONAL MODAL: Booking Success & Next Steps   -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <div v-if="showSuccessModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6" @click.self="handleSuccessModalClose">
      <div class="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-left">
        <!-- Header -->
        <div class="bg-blue-600 px-8 py-6 flex items-center gap-4">
          <div class="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center shrink-0">
            <i class="fa-solid fa-circle-check text-white text-2xl"></i>
          </div>
          <div>
            <h3 class="text-white font-black text-lg uppercase tracking-tight leading-none">Booking Submitted</h3>
            <span class="text-blue-200 text-[10px] font-black uppercase tracking-widest mt-1.5 block">Your reservation request is registered</span>
          </div>
        </div>

        <!-- Body -->
        <div class="p-8 md:p-10 space-y-6">
          <p class="text-slate-600 font-semibold text-sm leading-relaxed">
            Hello, <strong class="text-slate-900">{{ form.resident_name }}</strong>! Your room reservation request for <strong class="text-slate-900">{{ house.name }}</strong> has been successfully sent to the landlord.
          </p>

          <!-- Conditional Steps: Online PayMongo Flow -->
          <div v-if="form.payment_method === 'paymongo'" class="space-y-4">
            <h4 class="text-[10px] font-black text-blue-600 uppercase tracking-widest border-b border-slate-100 pb-2">Next Steps for Online Payment</h4>
            <div class="space-y-4">
              <!-- Step 1 -->
              <div class="flex items-start gap-3.5">
                <div class="w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">1</div>
                <div>
                  <h5 class="font-bold text-slate-800 text-xs uppercase tracking-wide">Awaiting Landlord Review</h5>
                  <p class="text-slate-400 text-[11px] leading-relaxed mt-0.5">The landlord will check room availability and verify your reservation details.</p>
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
                  <h5 class="font-bold text-slate-800 text-xs uppercase tracking-wide">Awaiting Landlord Review</h5>
                  <p class="text-slate-400 text-[11px] leading-relaxed mt-0.5">The landlord will review your reservation request and approve your slot.</p>
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
        <div class="px-8 pb-8 flex justify-end">
          <button type="button" @click="handleSuccessModalClose" class="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer">
            OK, Got It <i class="fa-solid fa-arrow-right text-[10px]"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>