<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';
import StudentNav from '../../components/partials/StudentNav.vue';
import { useOfflineStatus } from '../../utils/offlineHelper.js';

const bookings = ref([]);
const isLoading = ref(true);
const alerts = ref([]);

const { isOffline } = useOfflineStatus();

const token = localStorage.getItem('cspc_token');
import { getApiBaseUrl } from '../../config/api';

const API = getApiBaseUrl();

const showCancelConfirmModal = ref(false);
const pendingCancelBookingId = ref(null);
const showReceiptModal = ref(false);
const activeReceipt = ref(null);

// Displays the polished slide-in toast notification banner in the upper right
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

// Triggered when clicking "Cancel Reservation" - opens the custom modal
const cancelReservation = (id) => {
  pendingCancelBookingId.value = id;
  showCancelConfirmModal.value = true;
};

// Executes the actual backend cancellation call
const execCancelReservation = async () => {
  showCancelConfirmModal.value = false;
  const id = pendingCancelBookingId.value;
  pendingCancelBookingId.value = null;
  
  if (!id) return;
  
  try {
    const res = await axios.post(`/api/student/bookings/cancel/${id}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.data.success) {
      showSystemAlert('Reservation request cancelled successfully.', 'success');
      await fetchBookings();
    }
  } catch (err) {
    console.error('Cancel booking failed:', err);
    showSystemAlert('Unable to cancel. Please check your connection and try again.', 'error');
  }
};

// Safely parse current user session
let currentUserObj = {};
try {
  const userRaw = localStorage.getItem('cspc_user');
  if (userRaw && userRaw !== 'undefined') {
    currentUserObj = JSON.parse(userRaw);
  }
} catch (e) {
  console.error("Corrupted student storage parser:", e);
}
const currentUser = currentUserObj;

const fetchBookings = async () => {
  // Skip network call entirely if already offline — show banner immediately
  if (!navigator.onLine) {
    isLoading.value = false;
    return;
  }
  try {
    isLoading.value = true;
    const res = await axios.get(`/api/student/bookings`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    bookings.value = res.data.bookings || [];
  } catch (e) {
    console.error('Failed to load bookings', e);
    // Silently fail — offline banner handles the UI
  } finally {
    isLoading.value = false;
  }
};

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

const formatMoney = (val) =>
  Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const showExtendForm = ref({});
const toggleExtend = (id) => {
  showExtendForm.value[id] = !showExtendForm.value[id];
};

const extensionMonths = ref({});
const requestExtension = async (bookingId) => {
  const months = extensionMonths.value[bookingId] || 1;
  try {
    await axios.post(`/api/student/bookings/extend/${bookingId}`, { extension_months: months }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    await fetchBookings();
    showExtendForm.value[bookingId] = false;
    showSystemAlert('Stay extension request submitted successfully.', 'success');
  } catch (e) {
    console.error('Extension failed', e);
    showSystemAlert('Unable to submit extension. Please check your connection and try again.', 'error');
  }
};

const isPaying = ref({});

const triggerPayment = async (booking) => {
  try {
    isPaying.value[booking.id] = true;
    
    // Create PayMongo checkout session
    const response = await axios.post(`/api/payment/checkout`, {
      bookingId: booking.id
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success && response.data.checkoutUrl) {
      // Redirect student to PayMongo Hosted Checkout Page
      window.location.href = response.data.checkoutUrl;
    }
  } catch (error) {
    console.error('[PAYMENT ERROR] Failed to initialize checkout:', error);
    showSystemAlert('Unable to start payment. Please check your connection and try again.', 'error');
  } finally {
    isPaying.value[booking.id] = false;
  }
};

// Auto-verify payment on return from successful PayMongo Checkout
const checkUrlQueryOnMount = async () => {
  if (!navigator.onLine) return; // Skip if offline — payment verification requires internet
  const urlParams = new URLSearchParams(window.location.search);
  const isSuccess = urlParams.get('payment_success') === 'true';
  const bookingId = urlParams.get('bookingId');

  if (isSuccess && bookingId) {
    try {
      const response = await axios.post('/api/payment/verify-payment', {
        bookingId: parseInt(bookingId)
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        window.history.replaceState({}, document.title, window.location.pathname);
        showSystemAlert('Payment Settled successfully! Your stay configuration has updated.', 'success');
        await fetchBookings();
      }
    } catch (err) {
      console.error('Failed to settle payment:', err);
      showSystemAlert('Payment verification could not be completed. Please contact your landlord to confirm.', 'error');
    }
  }
};

// Opens the custom receipt modal and loads the booking details
const viewReceipt = (booking) => {
  activeReceipt.value = booking;
  showReceiptModal.value = true;
};

// Triggers the browser's native print dialog for the receipt modal
const printReceipt = () => {
  window.print();
};

// Combined mounting hook runs standard fetch and checks redirection query parameters
onMounted(() => {
  fetchBookings();
  checkUrlQueryOnMount();
});
</script>


<template>
  <div class="bg-[#f8fafc] min-h-screen font-sans text-slate-800 pb-20">
    <StudentNav />

    <!-- Alert Panel (Tailwind slide-in toasts) -->
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

    <main class="py-12 px-6 lg:px-12 max-w-6xl mx-auto">
      <header class="mb-10 text-center md:text-left">
        <h1 class="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">My Bookings</h1>
        <p class="text-slate-400 font-bold uppercase text-[9px] tracking-[0.2em] mt-2">Tracking your pending and confirmed stays</p>
      </header>

      <!-- Loading State -->
      <div v-if="isLoading" class="bg-white rounded-3xl p-20 text-center shadow-sm border border-slate-200/60 flex flex-col items-center justify-center">
        <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
        <p class="text-slate-400 font-bold uppercase tracking-widest text-[9px]">Loading bookings...</p>
      </div>

      <!-- Offline Banner -->
      <div v-else-if="isOffline" class="bg-white rounded-3xl p-20 text-center shadow-sm border-2 border-dashed border-amber-200">
        <svg class="w-12 h-12 text-amber-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M12 12h.01M8.464 15.536a5 5 0 010-7.072M5.636 18.364a9 9 0 010-12.728"/>
        </svg>
        <p class="text-amber-600 font-black uppercase tracking-widest text-[11px] mb-2">No Internet Connection</p>
        <p class="text-slate-400 font-bold text-[10px]">Please connect to the internet to view your bookings.</p>
      </div>

      <!-- Bookings Container -->
      <div v-else-if="bookings.length > 0" class="space-y-6">
        
        <!-- DESKTOP TABLE VIEW (Visible on tablet & desktop screens) -->
        <div class="hidden md:block bg-white rounded-[2rem] shadow-sm border border-slate-200/60 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse min-w-[950px]">
              <thead>
                <tr class="bg-slate-50/50 border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th class="p-8">Boarding House</th>
                  <th class="p-8">Duration of Stay</th>
                  <th class="p-8 text-center">Payment Details</th>
                  <th class="p-8">Booking Date</th>
                  <th class="p-8 text-center">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50 text-[13px] font-semibold text-slate-700">
                <tr
                  v-for="booking in bookings"
                  :key="booking.id"
                  class="hover:bg-slate-50/20 transition group"
                >
                  <!-- House Info -->
                  <td class="p-8">
                    <h3 class="text-sm font-black text-slate-900 uppercase tracking-tight group-hover:text-blue-600 transition-colors">
                      {{ booking.house_name }}
                    </h3>
                    <p class="text-[10px] text-slate-400 font-bold uppercase mt-1.5 tracking-widest inline-flex items-start gap-1.5 leading-snug">
                      <i class="fa-solid fa-location-dot text-[9px] text-blue-500 shrink-0 mt-0.5"></i>
                      <span>{{ booking.house_location || 'Address Pending' }}</span>
                    </p>
                  </td>

                  <!-- Duration -->
                  <td class="p-8">
                    <div class="flex flex-col gap-1">
                      <span class="text-sm font-black text-blue-600">{{ booking.months }} Months</span>
                      <p class="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Duration of Stay</p>
                    </div>
                  </td>

                  <!-- Payment Details with Move-in Ledger -->
                  <td class="p-8 text-center">
                    <div class="flex flex-col gap-1 items-center">
                      <span class="text-[11px] font-bold text-slate-400 italic">₱{{ formatMoney(booking.monthly_rent) }} / Month</span>
                      <span class="text-sm font-black text-slate-900 leading-none">₱{{ formatMoney(booking.amount) }} Total</span>
                      <span class="inline-block bg-blue-50 text-blue-600 text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest mt-1.5">Room {{ booking.room_number }}</span>
                      
                      <div v-if="booking.initial_payment > 0" class="mt-3 pt-3 border-t border-slate-100/80 w-full max-w-[200px]">
                        <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Move-in Cost</span>
                        <span class="text-sm font-black text-emerald-600">₱{{ formatMoney(booking.initial_payment) }}</span>
                        <span class="text-[8px] font-bold text-slate-400 block leading-tight mt-1">
                          <template v-if="Number(booking.advance_months) > 0 && Number(booking.deposit_months) > 0">
                            {{ booking.advance_months }} Month Advance + {{ booking.deposit_months }} Month Deposit
                          </template>
                          <template v-else-if="Number(booking.advance_months) > 0">
                            {{ booking.advance_months }} Month Advance Only
                          </template>
                          <template v-else-if="Number(booking.deposit_months) > 0">
                            {{ booking.deposit_months }} Month Deposit Only
                          </template>
                          <template v-else>Due upon check-in</template>
                        </span>
                      </div>
                    </div>
                  </td>

                  <!-- Date -->
                  <td class="p-8">
                    <p class="text-sm font-bold text-slate-600">{{ formatDate(booking.booking_date) }}</p>
                    <p class="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Reservation Date</p>
                  </td>

                  <!-- Status Pill Badges -->
                  <td class="p-8 text-center whitespace-nowrap">
                    <!-- Pending -->
                    <div v-if="booking.status === 'pending'" class="flex flex-col items-center gap-3">
                      <span class="bg-yellow-50 text-yellow-700 border border-yellow-200/50 text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-sm">Pending Review</span>
                      <button
                        @click="cancelReservation(booking.id)"
                        class="text-[9px] font-black text-red-500 hover:text-red-700 uppercase tracking-widest transition underline underline-offset-4 decoration-2 cursor-pointer"
                      >Cancel Reservation</button>
                    </div>

                    <!-- Confirmed / Active Stay -->
                    <div v-else-if="booking.status === 'confirmed'" class="flex flex-col items-center gap-2">
                      <span class="bg-emerald-50 text-emerald-700 border border-emerald-200/50 text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-sm">Confirmed</span>
                      <span v-if="booking.occupant_check_in" class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                        Check-in: {{ formatDate(booking.occupant_check_in) }}
                      </span>
                      
                      <template v-if="booking.payment_status === 'paid'">
                        <div class="flex flex-col items-center gap-1.5">
                          <span class="text-[8px] font-black text-emerald-500 uppercase tracking-widest block leading-none">Payment Settled</span>
                          <button 
                            @click="viewReceipt(booking)" 
                            class="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[8px] font-black px-3 py-1 rounded-lg uppercase tracking-widest transition cursor-pointer"
                          >
                            <i class="fa-solid fa-receipt mr-1"></i> Print Receipt
                          </button>
                        </div>

                        <div class="mt-4 pt-4 border-t border-slate-100/80 w-full">
                          <span v-if="booking.is_extension_requested" class="text-[9px] font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 animate-pulse block">
                            Extension Pending (+{{ booking.extension_months }} Months)
                          </span>
                          <template v-else>
                            <button
                              @click="toggleExtend(booking.id)"
                              class="text-[9px] font-black text-[#2a528a] hover:text-black uppercase tracking-widest transition underline underline-offset-4 decoration-2 cursor-pointer"
                            >Request Extension</button>
                            <div v-if="showExtendForm[booking.id]" class="mt-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-inner">
                              <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 text-left">Additional Months:</p>
                              <div class="flex gap-2">
                                <input
                                  type="number"
                                  v-model="extensionMonths[booking.id]"
                                  value="1"
                                  min="1"
                                  class="w-16 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold outline-none focus:border-blue-500 transition"
                                >
                                <button
                                  @click="requestExtension(booking.id)"
                                  class="bg-[#2a528a] text-white px-4 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-black transition cursor-pointer"
                                >Submit</button>
                              </div>
                            </div>
                          </template>
                        </div>
                      </template>

                      <!-- AWAITING PAYMENT OPTION BRANCHES -->
                      <template v-else>
                        <div v-if="booking.payment_method === 'paymongo'" class="flex flex-col items-center gap-2 w-full pt-2">
                          <span class="text-[8px] font-black text-orange-400 uppercase tracking-widest block leading-none mb-1">Awaiting Payment</span>
                          <button 
                            @click="triggerPayment(booking)" 
                            :disabled="isPaying[booking.id]"
                            class="bg-blue-600 hover:bg-black text-white text-[9px] font-black px-4 py-2 rounded-lg uppercase tracking-widest transition shadow-sm cursor-pointer disabled:opacity-50"
                          >
                            {{ isPaying[booking.id] ? 'Connecting...' : 'Pay Move-In Cost' }}
                          </button>
                        </div>
                        
                        <div v-else class="flex flex-col items-center gap-1.5 pt-2">
                          <span class="bg-orange-50 text-orange-600 border border-orange-200/50 text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-sm">Awaiting Cash Payment</span>
                          <p class="text-[8px] font-bold text-slate-400 uppercase mt-0.5">Pay directly at boarding house</p>
                        </div>
                      </template>
                    </div>

                    <!-- Completed / Checked Out -->
                    <div v-else-if="booking.status === 'completed'" class="flex flex-col items-center gap-1.5">
                      <span class="bg-blue-50 text-blue-600 border border-blue-200/50 text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-sm">Checked Out</span>
                      <p class="text-[8px] font-bold text-slate-400 uppercase mt-0.5">Stay Completed</p>
                      <span v-if="booking.occupant_check_out" class="text-[8px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1 rounded-full">
                        <i class="fa-solid fa-calendar-check text-blue-400 mr-1"></i>{{ formatDate(booking.occupant_check_out) }}
                      </span>
                    </div>

                    <!-- Cancelled -->
                    <span v-else-if="booking.status === 'cancelled'" class="bg-slate-50 text-slate-500 border border-slate-200/50 text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest">Cancelled</span>

                    <!-- Other/Rejected -->
                    <span v-else class="bg-rose-50 text-rose-700 border border-rose-200/50 text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest">Rejected</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- MOBILE PHONE CARD VIEW (Styled strictly matching reference design with centered balanced padding) -->
        <div class="block md:hidden space-y-6">
          <div
            v-for="booking in bookings"
            :key="`mobile-${booking.id}`"
            class="bg-white rounded-[2.2rem] shadow-[0_12px_40px_-15px_rgba(0,0,0,0.09)] border border-slate-200/80 overflow-hidden"
          >
            <div class="grid grid-cols-[115px_1fr] sm:grid-cols-[140px_1fr] items-stretch">
              
              <!-- ROW 1: Boarding House -->
              <div class="p-5 flex items-center justify-center text-center font-bold text-slate-400 text-[11px] uppercase tracking-wider border-r border-slate-300">
                Boarding House
              </div>
              <div class="p-5 text-center border-b border-slate-200 flex flex-col items-center justify-center gap-1">
                <h3 class="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight">
                  {{ booking.house_name }}
                </h3>
                <p class="text-[9px] text-slate-400 font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 mt-0.5">
                  <i class="fa-solid fa-location-dot text-[9px] text-blue-500"></i>
                  <span>{{ booking.house_location || 'Address Pending' }}</span>
                </p>
              </div>

              <!-- ROW 2: Duration -->
              <div class="p-5 flex items-center justify-center text-center font-bold text-slate-400 text-[11px] uppercase tracking-wider border-r border-slate-300">
                Duration
              </div>
              <div class="p-5 text-center border-b border-slate-200 flex flex-col items-center justify-center gap-1">
                <span class="text-base sm:text-lg font-black text-blue-600 tracking-tight">{{ booking.months }} Months</span>
                <p class="text-[8px] sm:text-[9px] text-slate-400 font-bold uppercase tracking-widest">DURATION OF STAY</p>
              </div>

              <!-- ROW 3: Payment Details -->
              <div class="p-5 flex items-center justify-center text-center font-bold text-slate-400 text-[11px] uppercase tracking-wider border-r border-slate-300 leading-tight">
                Payment Details
              </div>
              <div class="p-5 text-center border-b border-slate-200 flex flex-col items-center justify-center gap-1">
                <span class="text-[10px] sm:text-[11px] font-bold text-slate-400 italic">₱{{ formatMoney(booking.monthly_rent) }} monthly</span>
                <span class="text-base sm:text-lg font-black text-slate-900">₱{{ formatMoney(booking.amount) }} Total</span>
                <span class="inline-block bg-blue-50 text-blue-600 border border-blue-200/80 text-[8px] sm:text-[9px] font-black px-3 py-0.5 rounded-full uppercase tracking-wider mt-1">ROOM {{ booking.room_number }}</span>
                
                <div v-if="booking.initial_payment > 0" class="mt-2.5 pt-2.5 border-t border-slate-100 w-full max-w-[180px]">
                  <span class="text-[7px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Move-in Cost</span>
                  <span class="text-xs font-black text-emerald-600">₱{{ formatMoney(booking.initial_payment) }}</span>
                  <span class="text-[7px] font-bold text-slate-400 block leading-tight mt-0.5">
                    <template v-if="Number(booking.advance_months) > 0 && Number(booking.deposit_months) > 0">
                      {{ booking.advance_months }} Mo Advance + {{ booking.deposit_months }} Mo Deposit
                    </template>
                    <template v-else-if="Number(booking.advance_months) > 0">
                      {{ booking.advance_months }} Mo Advance Only
                    </template>
                    <template v-else-if="Number(booking.deposit_months) > 0">
                      {{ booking.deposit_months }} Mo Deposit Only
                    </template>
                    <template v-else>Due upon check-in</template>
                  </span>
                </div>
              </div>

              <!-- ROW 4: Booking Date -->
              <div class="p-5 flex items-center justify-center text-center font-bold text-slate-400 text-[11px] uppercase tracking-wider border-r border-slate-300">
                Booking Date
              </div>
              <div class="p-5 text-center border-b border-slate-200 flex flex-col items-center justify-center gap-1">
                <p class="text-xs sm:text-sm font-black text-slate-900">{{ formatDate(booking.booking_date) }}</p>
                <p class="text-[8px] sm:text-[9px] text-slate-400 font-bold uppercase tracking-widest">RESERVATION DATE</p>
              </div>

              <!-- ROW 5: Status -->
              <div class="p-5 flex items-center justify-center text-center font-bold text-slate-400 text-[11px] uppercase tracking-wider border-r border-slate-300">
                Status
              </div>
              <div class="p-5 text-center flex flex-col items-center justify-center gap-2">
                <!-- Pending -->
                <div v-if="booking.status === 'pending'" class="flex flex-col items-center gap-2.5">
                  <span class="bg-yellow-50 text-yellow-700 border border-yellow-200/50 text-[9px] font-black px-4 py-1 rounded-full uppercase tracking-widest shadow-sm">Pending Review</span>
                  <button
                    @click="cancelReservation(booking.id)"
                    class="text-[9px] font-black text-red-500 hover:text-red-700 uppercase tracking-widest transition underline underline-offset-4 decoration-2 cursor-pointer"
                  >Cancel Reservation</button>
                </div>

                <!-- Confirmed / Active Stay -->
                <div v-else-if="booking.status === 'confirmed'" class="flex flex-col items-center gap-2 w-full">
                  <div class="flex flex-col items-center justify-center gap-1 w-full">
                    <span class="bg-emerald-100 text-emerald-700 border border-emerald-200/60 text-[9px] font-black px-4 py-1 rounded-full uppercase tracking-widest shadow-sm">CONFIRMED</span>
                    <span v-if="booking.payment_status === 'paid'" class="text-[8px] font-black text-emerald-500 uppercase tracking-widest mt-0.5 block">PAYMENT SETTLED</span>
                  </div>

                  <span v-if="booking.occupant_check_in" class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                    Check-in: {{ formatDate(booking.occupant_check_in) }}
                  </span>

                  <template v-if="booking.payment_status === 'paid'">
                    <button 
                      @click="viewReceipt(booking)" 
                      class="mt-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[8px] font-black px-3.5 py-1 rounded-lg uppercase tracking-widest transition cursor-pointer"
                    >
                      <i class="fa-solid fa-receipt mr-1"></i> Print Receipt
                    </button>

                    <div class="mt-3 pt-3 border-t border-slate-100 w-full flex flex-col items-center">
                      <span v-if="booking.is_extension_requested" class="text-[8px] font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-lg border border-amber-100 animate-pulse block">
                        Extension Pending (+{{ booking.extension_months }} Months)
                      </span>
                      <template v-else>
                        <button
                          @click="toggleExtend(booking.id)"
                          class="text-[8px] font-black text-[#1e3a8a] hover:text-black uppercase tracking-widest transition underline underline-offset-4 decoration-2 cursor-pointer"
                        >REQUEST EXTENSION</button>
                        <div v-if="showExtendForm[booking.id]" class="mt-2 bg-slate-100/90 p-3 rounded-xl border border-slate-200 w-full max-w-[200px]">
                          <p class="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1.5 text-center">ADDITIONAL MONTHS</p>
                          <div class="flex items-center justify-center gap-2">
                            <input
                              type="number"
                              v-model="extensionMonths[booking.id]"
                              value="1"
                              min="1"
                              class="w-12 px-2 py-1 rounded-md border border-slate-300 bg-white text-xs font-bold text-center outline-none focus:border-blue-500"
                            >
                            <button
                              @click="requestExtension(booking.id)"
                              class="bg-[#1e3a8a] text-white px-3 py-1 rounded-md text-[8px] font-black uppercase tracking-widest hover:bg-black transition cursor-pointer"
                            >SUBMIT</button>
                          </div>
                        </div>
                      </template>
                    </div>
                  </template>

                  <template v-else>
                    <div v-if="booking.payment_method === 'paymongo'" class="flex flex-col items-center gap-1.5 w-full pt-1">
                      <span class="text-[8px] font-black text-orange-400 uppercase tracking-widest block leading-none">Awaiting Payment</span>
                      <button 
                        @click="triggerPayment(booking)" 
                        :disabled="isPaying[booking.id]"
                        class="bg-blue-600 hover:bg-black text-white text-[9px] font-black px-4 py-2 rounded-lg uppercase tracking-widest transition shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        {{ isPaying[booking.id] ? 'Connecting...' : 'Pay Move-In Cost' }}
                      </button>
                    </div>
                    
                    <div v-else class="flex flex-col items-center gap-1 pt-1">
                      <span class="bg-orange-50 text-orange-600 border border-orange-200/50 text-[8px] font-black px-3.5 py-1 rounded-full uppercase tracking-widest shadow-sm">Awaiting Cash Payment</span>
                      <p class="text-[7px] font-bold text-slate-400 uppercase mt-0.5">Pay directly at boarding house</p>
                    </div>
                  </template>
                </div>

                <!-- Completed / Checked Out -->
                <div v-else-if="booking.status === 'completed'" class="flex flex-col items-center gap-1">
                  <span class="bg-blue-50 text-blue-600 border border-blue-200/50 text-[8px] font-black px-3.5 py-1 rounded-full uppercase tracking-widest shadow-sm">Checked Out</span>
                  <p class="text-[7px] font-bold text-slate-400 uppercase mt-0.5">Stay Completed</p>
                  <span v-if="booking.occupant_check_out" class="text-[7px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full mt-1">
                    <i class="fa-solid fa-calendar-check text-blue-400 mr-1"></i>{{ formatDate(booking.occupant_check_out) }}
                  </span>
                </div>

                <!-- Cancelled -->
                <span v-else-if="booking.status === 'cancelled'" class="bg-slate-50 text-slate-500 border border-slate-200/50 text-[9px] font-black px-3.5 py-1 rounded-full uppercase tracking-widest">Cancelled</span>

                <!-- Other/Rejected -->
                <span v-else class="bg-rose-50 text-rose-700 border border-rose-200/50 text-[9px] font-black px-3.5 py-1 rounded-full uppercase tracking-widest">Rejected</span>
              </div>

            </div>
          </div>
        </div>

      </div>

      <!-- Clean Empty State -->
      <div v-else class="p-20 border-2 border-dashed border-slate-200 rounded-[2rem] bg-white flex flex-col items-center justify-center gap-6">
        <div class="flex flex-col items-center gap-3 opacity-30 text-center">
          <i class="fa-solid fa-calendar-xmark text-5xl text-slate-400"></i>
          <p class="text-slate-400 font-black uppercase text-xs tracking-[0.2em] mt-2">No bookings registered under your active account.</p>
        </div>
      </div>
    </main>
  </div>

  <!-- ═══════════════════════════════════════════════════════════ -->
  <!-- CUSTOM CONFIRMATION MODAL: Cancel Reservation Request      -->
  <!-- ═══════════════════════════════════════════════════════════ -->
  <div v-if="showCancelConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6" @click.self="showCancelConfirmModal = false">
    <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
      <!-- Header -->
      <div class="bg-red-600 px-8 py-5 flex items-center gap-4">
        <div class="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center shrink-0">
          <i class="fa-solid fa-circle-xmark text-white text-xl"></i>
        </div>
        <h3 class="text-white font-black text-base uppercase tracking-tight">Cancel Reservation</h3>
      </div>
      <!-- Body -->
      <div class="px-10 py-8 text-left">
        <p class="text-slate-700 font-semibold text-sm leading-relaxed mb-2">
          Are you sure you want to <strong class="text-red-600">cancel</strong> this reservation request?
        </p>
        <p class="text-slate-400 font-bold text-[11px] uppercase tracking-widest leading-relaxed">This action cannot be undone.</p>
      </div>
      <!-- Actions -->
      <div class="px-10 pb-8 flex justify-end gap-4">
        <button @click="showCancelConfirmModal = false; pendingCancelBookingId = null" class="px-8 py-3 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-500 font-black text-[11px] uppercase tracking-widest rounded-xl transition">
          Cancel
        </button>
        <button @click="execCancelReservation" class="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-black text-[11px] uppercase tracking-widest rounded-xl shadow-md transition">
          <i class="fa-solid fa-trash-can mr-2"></i>Confirm Cancellation
        </button>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════ -->
  <!-- CUSTOM PRINTABLE RECEIPT MODAL                             -->
  <!-- ═══════════════════════════════════════════════════════════ -->
 <div v-if="showReceiptModal && activeReceipt" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-6" @click.self="showReceiptModal = false">
    <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-left p-8 border border-slate-100 relative">
      
      <!-- Header / Branding -->
      <div class="text-center border-b-2 border-dashed border-slate-200 pb-6 mb-6">
        <h2 class="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] mb-1">CSPC Boarding House System</h2>
        <h3 class="text-lg font-black text-slate-900 uppercase tracking-tight">Official Payment Receipt</h3>
        <p class="text-[9px] text-slate-400 font-bold uppercase mt-1">Transaction Completed Via PayMongo</p>
      </div>

      <!-- Receipt Body Details -->
      <div class="space-y-4 text-xs font-semibold text-slate-600">
        <div class="flex justify-between">
          <span class="text-slate-400">Reference Number:</span>
          <span class="font-mono text-slate-900 font-bold">REF-{{ activeReceipt.id.toString().padStart(4, '0') }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">Payment Date:</span>
          <span class="text-slate-900">{{ new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">Resident Name:</span>
          <span class="text-slate-900 uppercase font-bold">{{ activeReceipt.resident_name }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">Boarding House:</span>
          <span class="text-slate-900 uppercase font-bold">{{ activeReceipt.house_name }}</span>
        </div>
        <div class="flex justify-between border-b border-slate-100 pb-3">
          <span class="text-slate-400">Allocated Room:</span>
          <span class="text-slate-900 font-bold">Room {{ activeReceipt.room_number }}</span>
        </div>

        <!-- Breakdown -->
        <div class="space-y-2 pt-2">
          <div class="flex justify-between text-slate-400 text-[10px] uppercase font-black tracking-wider">
            <span>Description</span>
            <span>Amount</span>
          </div>
          <div class="flex justify-between text-slate-700">
            <span>Advance Rent ({{ activeReceipt.advance_months }} Mo)</span>
            <span>₱{{ formatMoney(parseInt(activeReceipt.advance_months || 1) * parseFloat(activeReceipt.monthly_rent)) }}</span>
          </div>
          <div v-if="parseInt(activeReceipt.deposit_months) > 0" class="flex justify-between text-slate-700">
            <span>Security Deposit ({{ activeReceipt.deposit_months }} Mo)</span>
            <span>₱{{ formatMoney(parseInt(activeReceipt.deposit_months) * parseFloat(activeReceipt.monthly_rent)) }}</span>
          </div>
        </div>

        <!-- Total Paid -->
        <div class="flex justify-between border-t-2 border-dashed border-slate-200 pt-5 mt-6 text-sm">
          <span class="text-slate-900 font-black uppercase tracking-wider">TOTAL AMOUNT PAID:</span>
          <span class="text-base font-black text-emerald-600">₱{{ formatMoney(activeReceipt.initial_payment) }}</span>
        </div>
      </div>

      <!-- Instructions / Print Action -->
      <div class="mt-8 pt-6 border-t border-slate-100 flex gap-3 no-print">
        <button @click="printReceipt" class="flex-1 bg-blue-600 hover:bg-black text-white text-[10px] font-black py-3 rounded-xl uppercase tracking-widest transition flex items-center justify-center gap-2 cursor-pointer">
          <i class="fa-solid fa-print"></i> Print PDF
        </button>
        <button @click="showReceiptModal = false; activeReceipt = null" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black py-3 rounded-xl uppercase tracking-widest transition cursor-pointer">
          Close
        </button>
      </div>
    </div>
  </div>
    
</template>

<style>
@media print {
  body { background: white !important; margin: 0 !important; padding: 0 !important; }
  /* Hide the rest of the application including navbars, background, and main wrappers */
  .no-print, nav, footer, button, main, header, table { display: none !important; }
  
  /* Render only the modal content cleanly on the center of the white page */
  .fixed { position: absolute !important; inset: 0 !important; display: flex !important; align-items: center !important; justify-content: center !important; }
  .bg-white { box-shadow: none !important; border: none !important; padding: 0 !important; }
  .rounded-3xl { border-radius: 0 !important; }
}
</style>