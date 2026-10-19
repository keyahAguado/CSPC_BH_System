<script setup>
const cancellationPrompt = booking => { try { const review=JSON.parse(booking.cancellation_review || 'null'); return review?.status==='pending' ? 'An earlier cancellation request did not cancel this reservation. See booking details.' : review?.status==='resolved' ? 'View the cancellation reason in booking details.' : ''; } catch { return ''; } };
import { ref, computed, watch, onMounted } from 'vue';
import axios from 'axios';
import StudentNav from '../../components/partials/StudentNav.vue';
import { useOfflineStatus } from '../../utils/offlineHelper.js';
import {
  formatMoney, formatShortDate, formatCheckInShort, formatCheckOutShort, monthsLabel,
  bookingAddress, bookingReference, checkInDateOf, isActiveBooking, isAwaitingPayment,
  bookingStatusBadge, paymentStatusBadge, BADGE_TONE_CLASSES, needsOnlinePayment
} from '../../utils/studentBookings.js';

const PAGE_SIZE = 5;
const STATE_KEY = 'cspc_student_bookings_state';

const bookings = ref([]);
const isLoading = ref(true);
const loadError = ref(false);
const alerts = ref([]);

const { isOffline } = useOfflineStatus();
const token = sessionStorage.getItem('cspc_token');

// Search / filter / sort / page are kept for this tab so "Back to My Bookings" restores them
const savedState = (() => {
  try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || '{}') || {}; } catch (e) { return {}; }
})();
const VIEWS = ['all', 'active', 'history', 'awaiting'];
const STATUSES = ['', 'pending', 'confirmed', 'completed', 'not_arrived', 'cancelled', 'rejected'];
const SORTS = ['recent', 'oldest', 'move_in', 'amount'];

const searchQuery = ref(typeof savedState.q === 'string' ? savedState.q : '');
const viewFilter = ref(VIEWS.includes(savedState.view) ? savedState.view : 'all');
const statusFilter = ref(STATUSES.includes(savedState.status) ? savedState.status : '');
const sortBy = ref(SORTS.includes(savedState.sort) ? savedState.sort : 'recent');
const currentPage = ref(Math.max(1, parseInt(savedState.page, 10) || 1));

// Displays the slide-in toast notification banner in the upper right
const showSystemAlert = (message, type = 'error') => {
  const id = 'alert-' + Date.now();
  const configs = {
    success: { borderClass: 'border-emerald-500', iconClass: 'fa-circle-check', iconColorClass: 'text-emerald-500', title: 'Action Successful' },
    error: { borderClass: 'border-slate-800', iconClass: 'fa-circle-info', iconColorClass: 'text-slate-600', title: 'System Notice' },
    warning: { borderClass: 'border-amber-500', iconClass: 'fa-triangle-exclamation', iconColorClass: 'text-amber-500', title: 'Attention Required' },
    info: { borderClass: 'border-blue-500', iconClass: 'fa-circle-info', iconColorClass: 'text-blue-500', title: 'Information' }
  };
  const config = configs[type] || configs.error;
  alerts.value.push({ id, message, type, ...config });
  setTimeout(() => closeAlert(id), 7000);
};

const closeAlert = (id) => {
  alerts.value = alerts.value.filter(a => a.id !== id);
};

const fetchBookings = async () => {
  try {
    isLoading.value = true;
    loadError.value = false;
    const res = await axios.get(`/api/student/bookings`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    bookings.value = res.data.bookings || [];
  } catch (e) {
    console.error('Failed to load bookings', e);
    loadError.value = true;
  } finally {
    isLoading.value = false;
  }
};

// Auto-verify payment on return from successful PayMongo Checkout
const checkUrlQueryOnMount = async () => {
  if (!navigator.onLine) return;
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
        showSystemAlert(response.data.message || 'Payment verified successfully.', response.data.requiresReview ? 'error' : 'success');
        await fetchBookings();
      }
    } catch (err) {
      console.error('Failed to settle payment:', err);
      showSystemAlert(err.response?.data?.message || 'Payment verification is temporarily unavailable. Please refresh your bookings shortly.', 'error');
    }
  }
};

const counts = computed(() => ({
  all: bookings.value.length,
  active: bookings.value.filter(isActiveBooking).length,
  history: bookings.value.filter(b => !isActiveBooking(b)).length,
  awaiting: bookings.value.filter(isAwaitingPayment).length
}));

const statCards = computed(() => [
  { key: 'all', label: 'All Bookings', value: counts.value.all },
  { key: 'active', label: 'Active', value: counts.value.active },
  { key: 'history', label: 'Booking History', value: counts.value.history },
  { key: 'awaiting', label: 'Awaiting Payment', value: counts.value.awaiting }
]);

const matchesView = (b) => {
  if (viewFilter.value === 'active') return isActiveBooking(b);
  if (viewFilter.value === 'history') return !isActiveBooking(b);
  if (viewFilter.value === 'awaiting') return isAwaitingPayment(b);
  return true;
};

const timeOf = (val) => {
  const t = val ? new Date(val).getTime() : NaN;
  return isNaN(t) ? null : t;
};

const filteredBookings = computed(() => {
  const terms = searchQuery.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = bookings.value
    .map((b, index) => ({ b, index }))
    .filter(({ b }) => {
      if (!matchesView(b)) return false;
      if (statusFilter.value && b.status !== statusFilter.value) return false;
      if (!terms.length) return true;
      const haystack = [b.house_name, `room ${b.room_number}`, b.room_number, bookingAddress(b), bookingReference(b)]
        .filter(Boolean).join(' ').toLowerCase();
      return terms.every(t => haystack.includes(t));
    });

  const byBooked = (dir) => (x, y) => ((timeOf(x.b.booking_date) ?? 0) - (timeOf(y.b.booking_date) ?? 0)) * dir || x.index - y.index;
  if (sortBy.value === 'recent') {
    // Booking creation order, independent of lifecycle status.
    list.sort(byBooked(-1));
  } else if (sortBy.value === 'oldest') {
    list.sort(byBooked(1));
  } else if (sortBy.value === 'move_in') {
    list.sort((x, y) => {
      const tx = timeOf(checkInDateOf(x.b));
      const ty = timeOf(checkInDateOf(y.b));
      if (tx === null && ty === null) return x.index - y.index;
      if (tx === null) return 1;
      if (ty === null) return -1;
      return tx - ty || x.index - y.index;
    });
  } else if (sortBy.value === 'amount') {
    list.sort((x, y) => (Number(y.b.amount) || 0) - (Number(x.b.amount) || 0) || x.index - y.index);
  }
  return list.map(item => item.b);
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredBookings.value.length / PAGE_SIZE)));
const pageStart = computed(() => filteredBookings.value.length === 0 ? 0 : (currentPage.value - 1) * PAGE_SIZE + 1);
const pageEnd = computed(() => Math.min(currentPage.value * PAGE_SIZE, filteredBookings.value.length));
const pagedBookings = computed(() =>
  filteredBookings.value.slice((currentPage.value - 1) * PAGE_SIZE, currentPage.value * PAGE_SIZE)
);

// Page buttons: first, last, and one either side of the current page, with gaps as "…"
const pageButtons = computed(() => {
  const total = totalPages.value;
  const keep = new Set([1, total, currentPage.value - 1, currentPage.value, currentPage.value + 1]
    .filter(n => n >= 1 && n <= total));
  const list = [];
  let prev = 0;
  [...keep].sort((a, b) => a - b).forEach(n => {
    if (n - prev > 1) list.push('gap-' + n);
    list.push(n);
    prev = n;
  });
  return list;
});

const goToPage = (n) => {
  if (n >= 1 && n <= totalPages.value) currentPage.value = n;
};

watch([searchQuery, viewFilter, statusFilter, sortBy], () => { currentPage.value = 1; });

watch([totalPages, isLoading], ([total, loading]) => {
  if (!loading && currentPage.value > total) currentPage.value = total;
}, { immediate: true });

watch([searchQuery, viewFilter, statusFilter, sortBy, currentPage], () => {
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify({
      q: searchQuery.value, view: viewFilter.value, status: statusFilter.value, sort: sortBy.value, page: currentPage.value
    }));
  } catch (e) {}
});

const resetFilters = () => {
  searchQuery.value = '';
  viewFilter.value = 'all';
  statusFilter.value = '';
  sortBy.value = 'recent';
};

const tableTitle = computed(() => ({
  all: 'Your booking history',
  active: 'Active bookings',
  history: 'Past bookings',
  awaiting: 'Bookings awaiting payment'
}[viewFilter.value]));

const badgeClass = (badge) => BADGE_TONE_CLASSES[badge.tone] || BADGE_TONE_CLASSES.slate;

onMounted(() => {
  fetchBookings();
  checkUrlQueryOnMount();
});
</script>

<template>
  <div class="bg-[#f6f8fb] min-h-screen font-sans text-slate-800 pb-20">
    <StudentNav />

    <!-- Alert Panel (slide-in toasts) -->
    <div class="fixed top-8 right-8 z-[9999] max-w-sm w-full px-4 pointer-events-none space-y-4">
      <div v-for="alert in alerts" :key="alert.id"
           class="pointer-events-auto relative flex items-stretch bg-white border-l-4 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] rounded-r-xl overflow-hidden"
           :class="alert.borderClass">
        <div class="px-5 py-5 flex items-center justify-center bg-slate-50/50">
          <i class="fa-solid text-xl" :class="[alert.iconClass, alert.iconColorClass]"></i>
        </div>
        <div class="flex-1 p-5 pr-8 text-left">
          <h4 class="text-[14px] font-bold text-slate-800 mb-1">{{ alert.title }}</h4>
          <p class="text-[13px] font-medium text-slate-700 leading-relaxed">{{ alert.message }}</p>
        </div>
        <button @click="closeAlert(alert.id)" aria-label="Dismiss" class="absolute top-3 right-3 text-slate-300 hover:text-slate-900 transition-colors">
          <i class="fa-solid fa-xmark text-xs"></i>
        </button>
      </div>
    </div>

    <main class="max-w-[1920px] mx-auto px-4 sm:px-8 xl:px-[62px] pt-10 lg:pt-14 text-left">
      <header>
        <h1 class="text-[28px] sm:text-[40px] font-extrabold text-slate-900 tracking-tight uppercase leading-none">My Bookings</h1>
        <p class="mt-3 sm:mt-4 text-[11px] sm:text-[13px] font-semibold text-slate-400 uppercase tracking-[0.18em]">View your active and past boarding house bookings</p>
      </header>

      <!-- Loading State -->
      <div v-if="isLoading" class="mt-8 bg-white rounded-2xl p-20 text-center border border-slate-200 flex flex-col items-center justify-center">
        <div class="w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p class="text-slate-400 font-semibold text-sm">Loading your bookings…</p>
      </div>

      <!-- Offline -->
      <div v-else-if="isOffline" class="mt-8 bg-white rounded-2xl p-16 text-center border-2 border-dashed border-amber-200">
        <i class="fa-solid fa-wifi text-3xl text-amber-300 mb-4"></i>
        <p class="text-amber-600 font-bold uppercase tracking-widest text-xs mb-2">No Internet Connection</p>
        <p class="text-slate-400 font-medium text-sm">Please connect to the internet to view your bookings.</p>
      </div>

      <!-- Load error -->
      <div v-else-if="loadError" class="mt-8 bg-white rounded-2xl p-16 text-center border border-rose-100">
        <i class="fa-solid fa-circle-exclamation text-3xl text-rose-400 mb-4"></i>
        <p class="text-slate-900 font-bold mb-1">Unable to load your bookings</p>
        <p class="text-slate-400 text-sm mb-5">Something went wrong. Please try again.</p>
        <button type="button" @click="fetchBookings" class="bg-[#1e4b8f] hover:bg-[#163a70] text-white text-sm font-bold px-5 py-2.5 rounded-lg transition">Retry</button>
      </div>

      <!-- Empty -->
      <div v-else-if="bookings.length === 0" class="mt-8 p-16 border-2 border-dashed border-slate-200 rounded-2xl bg-white flex flex-col items-center justify-center gap-3 text-center">
        <i class="fa-solid fa-calendar-xmark text-4xl text-slate-300"></i>
        <p class="text-slate-500 font-bold">You have no bookings yet.</p>
        <router-link to="/student/dashboard" class="text-[#1e4b8f] font-bold text-sm hover:underline">Browse boarding houses</router-link>
      </div>

      <template v-else>
        <!-- Summary cards (also act as quick view filters) -->
        <div class="mt-7 sm:mt-8 grid grid-cols-2 sm:flex sm:flex-wrap gap-3 sm:gap-3.5">
          <button
            v-for="card in statCards"
            :key="card.key"
            type="button"
            @click="viewFilter = card.key"
            :aria-pressed="viewFilter === card.key"
            class="text-left bg-white rounded-xl px-5 py-[15px] sm:min-w-[146px] transition border"
            :class="viewFilter === card.key ? 'border-[#1e4b8f] ring-1 ring-[#1e4b8f]' : 'border-slate-200 hover:border-slate-300'"
          >
            <span class="block text-[11px] sm:text-[12px] font-bold uppercase tracking-[0.12em] whitespace-nowrap"
                  :class="viewFilter === card.key ? 'text-[#1e4b8f]' : 'text-slate-600'">{{ card.label }}</span>
            <span class="block mt-2 text-[26px] sm:text-[28px] font-bold leading-none"
                  :class="viewFilter === card.key ? 'text-[#1e4b8f]' : 'text-slate-900'">{{ card.value }}</span>
          </button>
        </div>

        <!-- Search, filters, sort -->
        <div class="mt-7 bg-white border border-slate-200 rounded-2xl p-3 sm:p-[18px] flex flex-col lg:flex-row lg:items-center gap-3">
          <div class="relative flex-1 min-w-0">
            <span class="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400 pointer-events-none">
              <i class="fa-solid fa-magnifying-glass text-[12px]"></i>
            </span>
            <input
              v-model="searchQuery"
              type="text"
              aria-label="Search bookings"
              placeholder="Search your bookings by boarding house or room"
              class="w-full h-12 pl-10 pr-4 bg-white border border-slate-300 rounded-lg text-[14px] text-slate-700 placeholder:text-slate-400 outline-none focus:border-[#1e4b8f] transition"
            >
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 lg:flex gap-3 lg:items-center">
            <div class="relative">
              <select v-model="viewFilter" aria-label="View" class="bk-select lg:w-[166px]">
                <option value="all">View: All bookings</option>
                <option value="active">View: Active</option>
                <option value="history">View: History</option>
                <option value="awaiting">View: Awaiting payment</option>
              </select>
              <i class="fa-solid fa-chevron-down bk-chevron"></i>
            </div>
            <div class="relative">
              <select v-model="statusFilter" aria-label="Booking status" class="bk-select lg:w-[156px]">
                <option value="">Booking status</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Checked out</option>
                <option value="not_arrived">Did not arrive</option>
                <option value="cancelled">Cancelled</option>
                <option value="rejected">Rejected</option>
              </select>
              <i class="fa-solid fa-chevron-down bk-chevron"></i>
            </div>
            <div class="relative">
              <select v-model="sortBy" aria-label="Sort bookings" class="bk-select lg:w-[156px]">
                <option value="recent">Sort: Recent</option>
                <option value="oldest">Sort: Oldest</option>
                <option value="move_in">Sort: Move-in date</option>
                <option value="amount">Sort: Total cost</option>
              </select>
              <i class="fa-solid fa-chevron-down bk-chevron"></i>
            </div>
          </div>
          <button
            type="button"
            @click="resetFilters"
            class="self-end lg:self-auto px-2 lg:px-3 text-[14px] font-bold text-[#1e4b8f] hover:underline whitespace-nowrap"
          >Reset filters</button>
        </div>

        <!-- Bookings list -->
        <section class="mt-6 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div class="flex items-center justify-between gap-4 px-5 sm:px-[25px] py-5">
            <h2 class="text-[17px] sm:text-[18px] font-bold text-slate-900">{{ tableTitle }}</h2>
            <p class="text-[12px] sm:text-[13px] font-semibold text-slate-500 whitespace-nowrap">
              {{ filteredBookings.length }} booking{{ filteredBookings.length === 1 ? '' : 's' }}{{ filteredBookings.length === bookings.length ? ' total' : ' found' }}
            </p>
          </div>

          <!-- No matches -->
          <div v-if="filteredBookings.length === 0" class="border-t border-slate-200 px-6 py-16 text-center">
            <p class="text-slate-500 font-semibold mb-3">No bookings match your search or filters.</p>
            <button type="button" @click="resetFilters" class="text-[#1e4b8f] font-bold text-sm hover:underline">Reset filters</button>
          </div>

          <template v-else>
            <!-- Desktop table -->
            <div class="hidden lg:block border-t border-slate-200 overflow-x-auto">
              <table class="w-full text-left border-collapse table-auto">
                <thead>
                  <tr class="bg-slate-50/70 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600">
                    <th class="pl-4 pr-3 xl:pl-5 xl:pr-4 py-[15px] font-bold w-[26%] min-w-[170px] xl:min-w-[220px] whitespace-nowrap">Boarding House</th>
                    <th class="px-3 xl:px-4 py-[15px] font-bold leading-snug whitespace-normal xl:whitespace-nowrap">Duration &amp; Dates</th>
                    <th class="px-3 xl:px-4 py-[15px] font-bold leading-snug whitespace-normal xl:whitespace-nowrap">Payment Details</th>
                    <th class="px-3 xl:px-4 py-[15px] font-bold leading-snug whitespace-normal xl:whitespace-nowrap">Booked On</th>
                    <th class="px-3 xl:px-4 py-[15px] font-bold leading-snug whitespace-normal xl:whitespace-nowrap">Booking Status</th>
                    <th class="px-3 xl:px-4 py-[15px] font-bold leading-snug whitespace-normal xl:whitespace-nowrap">Payment Status</th>
                    <th class="px-3 xl:px-4 py-[15px]"><span class="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="booking in pagedBookings" :key="booking.id" class="border-t border-slate-200 hover:bg-slate-50/50 transition-colors">
                    <td class="pl-4 pr-3 xl:pl-5 xl:pr-4 py-[22px] align-middle">
                      <p class="text-[15px] font-bold text-slate-900 leading-snug break-words">{{ booking.house_name }}</p>
                      <p class="mt-1.5 text-[12px] text-slate-500 flex items-start gap-1.5 leading-snug">
                        <span class="mt-[5px] w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0"></span>
                        <span>{{ bookingAddress(booking) }}</span>
                      </p>
                    </td>
                    <td class="px-3 xl:px-4 py-[22px] align-middle whitespace-nowrap">
                      <p class="text-[14px] font-bold text-slate-900">{{ monthsLabel(booking.months) }}</p>
                      <p class="mt-1 text-[12px] text-slate-500"><span class="inline-block w-9">IN</span>{{ formatCheckInShort(booking) }}</p>
                      <p class="mt-1 text-[12px] text-blue-700"><span class="inline-block w-9">OUT</span>{{ formatCheckOutShort(booking) }}</p>
                    </td>
                    <td class="px-3 xl:px-4 py-[22px] align-middle whitespace-nowrap">
                      <p class="text-[17px] font-bold text-slate-900 leading-tight">₱{{ formatMoney(booking.amount) }}</p>
                      <p class="mt-1 text-[12px] text-slate-500">₱{{ formatMoney(booking.monthly_rent) }}/month</p>
                      <p class="mt-1.5 flex flex-wrap items-center gap-1.5"><span class="text-[12.5px] font-bold text-slate-900">Room {{ booking.room_number }}</span><span class="bk-method" :class="booking.payment_method"><i :class="['fa-solid', booking.payment_method === 'paymongo' ? 'fa-credit-card' : booking.payment_method === 'cash' ? 'fa-money-bill-wave' : 'fa-circle-question']" aria-hidden="true"></i>{{ booking.payment_method === 'paymongo' ? 'Online' : (booking.payment_method === 'cash' ? 'Cash' : 'Not recorded') }}</span></p>
                    </td>
                    <td class="px-3 xl:px-4 py-[22px] align-middle whitespace-nowrap">
                      <p class="text-[14px] font-bold text-slate-900">{{ formatShortDate(booking.booking_date) }}</p>
                    </td>
                    <td class="px-3 xl:px-4 py-[22px] align-middle whitespace-nowrap">
                      <span class="inline-block px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.06em] text-center leading-tight whitespace-normal xl:whitespace-nowrap" :class="badgeClass(bookingStatusBadge(booking))">{{ bookingStatusBadge(booking).label }}</span><router-link v-if="cancellationPrompt(booking)" :to="'/student/bookings/'+booking.id" class="booking-cancel-prompt">{{ cancellationPrompt(booking) }} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></router-link>
                    </td>
                    <td class="px-3 xl:px-4 py-[22px] align-middle whitespace-nowrap">
                      <span class="inline-block px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.06em] text-center leading-tight whitespace-normal xl:whitespace-nowrap" :class="badgeClass(paymentStatusBadge(booking))">{{ paymentStatusBadge(booking).label }}</span>
                    </td>
                    <td class="px-3 xl:px-4 py-[22px] align-middle whitespace-nowrap">
                      <!-- Bookings that can be paid online point straight to payment -->
                      <router-link
                        v-if="needsOnlinePayment(booking)"
                        :to="`/student/bookings/${booking.id}`"
                        :aria-label="`Pay move-in cost for booking ${bookingReference(booking)} at ${booking.house_name}`"
                        class="inline-flex items-center gap-1.5 whitespace-nowrap bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-bold px-3 py-2 rounded-lg shadow-sm shadow-emerald-200 transition"
                      >Pay now <i class="fa-solid fa-chevron-right text-[9px]"></i></router-link>
                      <router-link
                        v-else
                        :to="`/student/bookings/${booking.id}`"
                        :aria-label="`View booking ${bookingReference(booking)} at ${booking.house_name}`"
                        class="inline-flex items-center gap-1.5 text-[14px] font-bold text-[#1e4b8f] hover:underline"
                      >View <i class="fa-solid fa-chevron-right text-[10px]"></i></router-link>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Mobile / tablet cards -->
            <div class="lg:hidden border-t border-slate-200 divide-y divide-slate-200">
              <router-link
                v-for="booking in pagedBookings"
                :key="`m-${booking.id}`"
                :to="`/student/bookings/${booking.id}`"
                class="block px-5 py-5 hover:bg-slate-50/60 transition-colors"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-[15px] font-bold text-slate-900 leading-snug break-words">{{ booking.house_name }}</p>
                    <p class="mt-1 text-[12px] text-slate-500 flex items-start gap-1.5">
                      <span class="mt-[5px] w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0"></span>
                      <span>{{ bookingAddress(booking) }}</span>
                    </p>
                  </div>
                  <span v-if="needsOnlinePayment(booking)" class="shrink-0 bg-emerald-600 text-white text-[12px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1">Pay now <i class="fa-solid fa-chevron-right text-[9px]"></i></span>
                  <span v-else class="shrink-0 text-[13px] font-bold text-[#1e4b8f] flex items-center gap-1">View <i class="fa-solid fa-chevron-right text-[10px]"></i></span>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.06em]" :class="badgeClass(bookingStatusBadge(booking))">{{ bookingStatusBadge(booking).label }}</span><router-link v-if="cancellationPrompt(booking)" :to="'/student/bookings/'+booking.id" class="booking-cancel-prompt mobile">{{ cancellationPrompt(booking) }} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></router-link>
                  <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.06em]" :class="badgeClass(paymentStatusBadge(booking))">{{ paymentStatusBadge(booking).label }}</span>
                </div>
                <div class="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-[12px]">
                  <div>
                    <p class="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Duration</p>
                    <p class="mt-0.5 font-bold text-slate-900 text-[13px]">{{ monthsLabel(booking.months) }}</p>
                    <p class="text-slate-500">IN {{ formatCheckInShort(booking) }}</p>
                    <p class="text-blue-700">OUT {{ formatCheckOutShort(booking) }}</p>
                  </div>
                  <div>
                    <p class="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Payment</p>
                    <p class="mt-0.5 font-bold text-slate-900 text-[14px]">₱{{ formatMoney(booking.amount) }}</p>
                    <p class="text-slate-500">₱{{ formatMoney(booking.monthly_rent) }}/month</p>
                    <p class="mt-1 flex flex-wrap items-center gap-1.5"><span class="text-[12.5px] font-bold text-slate-900">Room {{ booking.room_number }}</span><span class="bk-method" :class="booking.payment_method"><i :class="['fa-solid', booking.payment_method === 'paymongo' ? 'fa-credit-card' : booking.payment_method === 'cash' ? 'fa-money-bill-wave' : 'fa-circle-question']" aria-hidden="true"></i>{{ booking.payment_method === 'paymongo' ? 'Online' : (booking.payment_method === 'cash' ? 'Cash' : 'Not recorded') }}</span></p>
                  </div>
                  <div class="col-span-2">
                    <p class="text-slate-500">Booked on <span class="font-bold text-slate-900">{{ formatShortDate(booking.booking_date) }}</span></p>
                  </div>
                </div>
              </router-link>
            </div>

            <!-- Pagination -->
            <div class="border-t border-slate-200 px-5 sm:px-[25px] py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p class="text-[13px] text-slate-500">
                Showing <b class="text-slate-700">{{ pageStart }}–{{ pageEnd }}</b> of <b class="text-slate-700">{{ filteredBookings.length }}</b> of your bookings
              </p>
              <nav v-if="totalPages > 1" aria-label="Booking pages" class="flex items-center gap-[7px]">
                <button type="button" aria-label="Previous page" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)" class="bk-page">
                  <i class="fa-solid fa-chevron-left text-[9px]"></i>
                </button>
                <template v-for="p in pageButtons" :key="p">
                  <span v-if="typeof p === 'string'" class="w-5 text-center text-slate-400 text-xs">…</span>
                  <button
                    v-else
                    type="button"
                    :aria-label="`Page ${p}`"
                    :aria-current="p === currentPage ? 'page' : undefined"
                    @click="goToPage(p)"
                    class="bk-page"
                    :class="{ 'is-current': p === currentPage }"
                  >{{ p }}</button>
                </template>
                <button type="button" aria-label="Next page" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)" class="bk-page">
                  <i class="fa-solid fa-chevron-right text-[9px]"></i>
                </button>
              </nav>
            </div>
          </template>
        </section>

        <p v-if="sortBy === 'recent'" class="mt-4 text-[12px] text-slate-400">Newest bookings appear first. Use the status filters to find active stays.</p>
      </template>
    </main>
  </div>
</template>

<style scoped>
.bk-select {
  width: 100%;
  height: 48px;
  appearance: none;
  padding: 0 36px 0 14px;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #334155;
  outline: none;
  cursor: pointer;
}
.bk-select:focus { border-color: #1e4b8f; }
.bk-chevron {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  color: #64748b;
  pointer-events: none;
}
.bk-page {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  transition: border-color .15s, color .15s;
}
.bk-page:hover:not(:disabled):not(.is-current) { border-color: #1e4b8f; color: #1e4b8f; }
.bk-page:disabled { opacity: .45; cursor: default; }
.bk-page.is-current { background: #1e4b8f; border-color: #1e4b8f; color: #fff; }
</style>

<style scoped>.booking-cancel-prompt{display:block;max-width:250px;margin-top:8px;font-size:12px;font-weight:500;line-height:1.6;white-space:normal;color:#1d4ed8;text-decoration:none}.booking-cancel-prompt:hover{text-decoration:underline}.booking-cancel-prompt i{display:inline-block;margin-left:4px;font-size:10px;text-decoration:none}.booking-cancel-prompt:focus-visible{outline:2px solid #60a5fa;outline-offset:3px;border-radius:3px}.booking-cancel-prompt.mobile{flex-basis:100%;max-width:none}.bk-method{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;border:1px solid #dbe4ef;background:#f8fafc;color:#475569;font-size:11px;font-weight:700;line-height:1.5;white-space:nowrap}.bk-method i{font-size:10px}.bk-method.paymongo{border-color:#bfdbfe;background:#eff6ff;color:#1d4ed8}.bk-method.cash{border-color:#bbf7d0;background:#f0fdf4;color:#15803d}
</style>
