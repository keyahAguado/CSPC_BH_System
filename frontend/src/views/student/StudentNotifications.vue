<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import StudentNav from '../../components/partials/StudentNav.vue';
import { useOfflineStatus } from '../../utils/offlineHelper.js';

const PAGE_SIZE = 5;
const STATE_KEY = 'cspc_student_notifications_state';

const router = useRouter();
const token = sessionStorage.getItem('cspc_token');
const { isOffline } = useOfflineStatus();

const notifications = ref([]);
const isLoading = ref(true);
const loadError = ref(false);
const isMarkingAll = ref(false);

const savedState = (() => {
  try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || '{}') || {}; } catch (e) { return {}; }
})();
const VIEWS = ['all', 'unread', 'booking', 'payment', 'other'];
const searchQuery = ref(typeof savedState.q === 'string' ? savedState.q : '');
const viewFilter = ref(VIEWS.includes(savedState.view) ? savedState.view : 'all');
const sortBy = ref(savedState.sort === 'oldest' ? 'oldest' : 'newest');
const currentPage = ref(Math.max(1, parseInt(savedState.page, 10) || 1));

const authHeaders = () => ({ headers: { Authorization: `Bearer ${token}` } });

// Lets the navbar badge refresh right away (StudentNav listens for this event)
const notifyNavbar = () => window.dispatchEvent(new Event('notification-updated'));

const fetchNotifications = async () => {
  try {
    isLoading.value = true;
    loadError.value = false;
    const res = await axios.get('/api/notifications', authHeaders());
    if (res.data.success) notifications.value = res.data.notifications || [];
  } catch (err) {
    console.error('Failed to fetch notifications:', err);
    loadError.value = true;
  } finally {
    isLoading.value = false;
  }
};

const markRead = async (id) => {
  try {
    const res = await axios.post(`/api/notifications/read/${id}`, {}, authHeaders());
    if (res.data.success) {
      notifications.value = notifications.value.map(n => (n.id === id ? { ...n, is_read: 1 } : n));
      notifyNavbar();
    }
  } catch (err) {
    console.error('Failed to mark notification as read:', err);
  }
};

const markAllRead = async () => {
  if (isMarkingAll.value || counts.value.unread === 0) return;
  try {
    isMarkingAll.value = true;
    const res = await axios.post('/api/notifications/read-all', {}, authHeaders());
    if (res.data.success) {
      notifications.value = notifications.value.map(n => ({ ...n, is_read: 1 }));
      notifyNavbar();
    }
  } catch (err) {
    console.error('Failed to mark all notifications as read:', err);
  } finally {
    isMarkingAll.value = false;
  }
};

// ── Reading the stored message ─────────────────────────────────────────────
// Messages are stored as "PREFIX: text" (e.g. "RESERVATION APPROVED: ..."). The prefix
// becomes the title and decides the type; anything unrecognised falls back to "Update".
const KNOWN_TYPES = {
  'RESERVATION SUBMITTED': { title: 'Reservation submitted', category: 'booking', icon: 'fa-envelope' },
  'RESERVATION APPROVED': { title: 'Reservation approved', category: 'booking', icon: 'fa-circle-check' },
  'RESERVATION UPDATE': { title: 'Reservation update', category: 'booking', icon: 'fa-circle-info' },
  'RESERVATION CANCELLED': { title: 'Reservation cancelled', category: 'booking', icon: 'fa-circle-xmark' },
  'EXTENSION APPROVED': { title: 'Extension approved', category: 'booking', icon: 'fa-calendar-plus' },
  'EXTENSION UPDATE': { title: 'Extension update', category: 'booking', icon: 'fa-calendar-xmark' },
  'PAYMENT SETTLED': { title: 'Payment settled', category: 'payment', icon: 'fa-peso-sign' }
};
const CATEGORY_TAG = {
  booking: { label: 'Booking', classes: 'bg-blue-50 text-blue-700' },
  payment: { label: 'Payment', classes: 'bg-orange-50 text-orange-600' },
  other: { label: 'Update', classes: 'bg-slate-100 text-slate-600' }
};

const sentenceCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();

const parseNotification = (n) => {
  const raw = String(n.message || '').trim();
  const m = raw.match(/^([A-Z][A-Z ]{2,40}):\s*(.*)$/s);
  const prefix = m ? m[1].trim() : '';
  const body = m ? m[2] : raw;
  let meta = KNOWN_TYPES[prefix];
  if (!meta && /checked out/i.test(body)) meta = { title: 'Checked out', category: 'booking', icon: 'fa-door-open' };
  // Fallbacks only match phrases about a specific reservation, so general text that merely
  // mentions "booking" (e.g. "complete your profile to start booking") stays an "Update"
  if (!meta && /\b(reservation|booking request|stay extension|residency|REF-\d+)\b/i.test(body)) meta = { title: prefix ? sentenceCase(prefix) : 'Booking update', category: 'booking', icon: 'fa-circle-info' };
  if (!meta && /\b(payment (?:of|was|has|is)|paid)\b/i.test(body)) meta = { title: prefix ? sentenceCase(prefix) : 'Payment update', category: 'payment', icon: 'fa-peso-sign' };
  if (!meta) meta = { title: prefix ? sentenceCase(prefix) : 'Update', category: 'other', icon: 'fa-bell' };

  const refMatch = raw.match(/\bREF-(\d{1,})\b/);
  return { ...n, body, ...meta, bookingId: refMatch ? parseInt(refMatch[1], 10) : null };
};

const items = computed(() => notifications.value.map(parseNotification));

// Highlights booking references, room numbers and peso amounts without using v-html
const HIGHLIGHT = /(REF-\d+|Room [A-Za-z0-9-]+|₱[\d,]+(?:\.\d+)?)/g;
const bodySegments = (text) => String(text).split(HIGHLIGHT).filter(s => s !== '')
  .map(s => ({ text: s, strong: /^(REF-\d+|Room [A-Za-z0-9-]+|₱[\d,]+(?:\.\d+)?)$/.test(s) }));

// Where a notification leads: the exact booking when the message names one, otherwise My Bookings
const targetFor = (n) => {
  // Newer booking notifications store a direct link to the booking they are about
  if (typeof n.link === 'string' && n.link.startsWith('/student/')) {
    if (/^\/student\/bookings\/\d+$/.test(n.link)) return { to: n.link, label: 'View booking' };
    if (n.link === '/student/bookings') return { to: n.link, label: 'View my bookings' };
    return { to: n.link, label: 'View details' };
  }
  if (n.bookingId) return { to: `/student/bookings/${n.bookingId}`, label: 'View booking' };
  if (n.category !== 'other') return { to: '/student/bookings', label: 'View my bookings' };
  return null;
};

const openNotification = (n) => {
  if (!n.is_read) markRead(n.id);
  const target = targetFor(n);
  if (target) router.push(target.to);
};

const onRowClick = (n, event) => {
  if (event.target.closest('a, button')) return;
  openNotification(n);
};

const formatWhen = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
};

// ── Counts, filters, sort, pagination ────────────────────────────────────────
const counts = computed(() => ({
  all: items.value.length,
  unread: items.value.filter(n => !n.is_read).length,
  bookingUpdates: items.value.filter(n => n.category === 'booking' || n.category === 'payment').length
}));

const statCards = computed(() => [
  { key: 'all', label: 'All', value: counts.value.all },
  { key: 'unread', label: 'Unread', value: counts.value.unread },
  { key: 'booking', label: 'Booking Updates', value: counts.value.bookingUpdates }
]);

const timeOf = (n) => {
  const t = new Date(n.created_at).getTime();
  return isNaN(t) ? 0 : t;
};

const filteredItems = computed(() => {
  const terms = searchQuery.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = items.value.filter(n => {
    if (viewFilter.value === 'unread' && n.is_read) return false;
    if (viewFilter.value === 'booking' && !(n.category === 'booking' || n.category === 'payment')) return false;
    if (viewFilter.value === 'payment' && n.category !== 'payment') return false;
    if (viewFilter.value === 'other' && n.category !== 'other') return false;
    if (!terms.length) return true;
    const haystack = `${n.title} ${n.body}`.toLowerCase();
    return terms.every(t => haystack.includes(t));
  });
  const dir = sortBy.value === 'oldest' ? 1 : -1;
  return [...list].sort((a, b) => (timeOf(a) - timeOf(b)) * dir || (a.id - b.id) * dir);
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / PAGE_SIZE)));
const pageStart = computed(() => filteredItems.value.length === 0 ? 0 : (currentPage.value - 1) * PAGE_SIZE + 1);
const pageEnd = computed(() => Math.min(currentPage.value * PAGE_SIZE, filteredItems.value.length));
const pagedItems = computed(() => filteredItems.value.slice((currentPage.value - 1) * PAGE_SIZE, currentPage.value * PAGE_SIZE));

// Page buttons: first, last, and one either side of the current page, with gaps as "…"
const pageButtons = computed(() => {
  const total = totalPages.value;
  const keep = new Set([1, total, currentPage.value - 1, currentPage.value, currentPage.value + 1].filter(n => n >= 1 && n <= total));
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

watch([searchQuery, viewFilter, sortBy], () => { currentPage.value = 1; });

// Unread view: marking an item read can empty the last page, so keep the page in range
watch([totalPages, isLoading], ([total, loading]) => {
  if (!loading && currentPage.value > total) currentPage.value = total;
}, { immediate: true });

watch([searchQuery, viewFilter, sortBy, currentPage], () => {
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify({ q: searchQuery.value, view: viewFilter.value, sort: sortBy.value, page: currentPage.value }));
  } catch (e) {}
});

const setView = (key) => { viewFilter.value = key; };

const resetFilters = () => {
  searchQuery.value = '';
  viewFilter.value = 'all';
  sortBy.value = 'newest';
};

onMounted(fetchNotifications);
</script>

<template>
  <div class="bg-[#f6f8fb] min-h-screen font-sans text-slate-800 pb-20">
    <StudentNav />

    <main class="max-w-[1920px] mx-auto px-4 sm:px-8 xl:px-[65px] pt-10 lg:pt-[52px] text-left">
      <header>
        <h1 class="text-[28px] sm:text-[40px] font-extrabold text-slate-900 tracking-tight uppercase leading-none">Student Inbox</h1>
        <p class="mt-3 sm:mt-4 text-[11px] sm:text-[13px] font-semibold text-slate-400 uppercase tracking-[0.18em]">Your recent alerts and updates</p>
      </header>

      <!-- Loading -->
      <div v-if="isLoading" class="mt-8 bg-white rounded-2xl p-20 text-center border border-slate-200 flex flex-col items-center justify-center">
        <div class="w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p class="text-slate-400 font-semibold text-sm">Loading your notifications…</p>
      </div>

      <!-- Offline -->
      <div v-else-if="isOffline" class="mt-8 bg-white rounded-2xl p-16 text-center border-2 border-dashed border-amber-200">
        <i class="fa-solid fa-wifi text-3xl text-amber-300 mb-4"></i>
        <p class="text-amber-600 font-bold uppercase tracking-widest text-xs mb-2">No Internet Connection</p>
        <p class="text-slate-400 font-medium text-sm">Please connect to the internet to view your notifications.</p>
      </div>

      <!-- Error -->
      <div v-else-if="loadError" class="mt-8 bg-white rounded-2xl p-16 text-center border border-rose-100">
        <i class="fa-solid fa-circle-exclamation text-3xl text-rose-400 mb-4"></i>
        <p class="text-slate-900 font-bold mb-1">Unable to load your notifications</p>
        <p class="text-slate-400 text-sm mb-5">Something went wrong. Please try again.</p>
        <button type="button" @click="fetchNotifications" class="bg-[#1e4b8f] hover:bg-[#163a70] text-white text-sm font-bold px-5 py-2.5 rounded-lg transition">Retry</button>
      </div>

      <!-- Empty inbox -->
      <div v-else-if="notifications.length === 0" class="mt-8 p-16 border-2 border-dashed border-slate-200 rounded-2xl bg-white flex flex-col items-center justify-center gap-3 text-center">
        <i class="fa-solid fa-bell-slash text-4xl text-slate-300"></i>
        <p class="text-slate-500 font-bold">No notifications yet.</p>
        <p class="text-slate-400 text-sm">Updates about your reservations and payments will appear here.</p>
      </div>

      <template v-else>
        <!-- Summary cards (also quick view filters) -->
        <div class="mt-7 sm:mt-8 grid grid-cols-3 sm:flex sm:flex-wrap gap-2.5 sm:gap-3">
          <button
            v-for="card in statCards"
            :key="card.key"
            type="button"
            @click="setView(card.key)"
            :aria-pressed="viewFilter === card.key"
            class="text-left bg-white rounded-xl px-4 sm:px-[18px] py-3 sm:py-[13px] sm:min-w-[118px] transition border"
            :class="viewFilter === card.key ? 'border-[#1e4b8f] ring-1 ring-[#1e4b8f]' : 'border-slate-200 hover:border-slate-300'"
          >
            <span class="block text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.12em] leading-tight"
                  :class="viewFilter === card.key ? 'text-[#1e4b8f]' : 'text-slate-600'">{{ card.label }}</span>
            <span class="block mt-1.5 text-[20px] sm:text-[21px] font-bold leading-none"
                  :class="viewFilter === card.key ? 'text-[#1e4b8f]' : 'text-slate-900'">{{ card.value }}</span>
          </button>
        </div>

        <!-- Search, view, sort -->
        <div class="mt-6 bg-white border border-slate-200 rounded-2xl p-3 sm:p-[18px] flex flex-col lg:flex-row lg:items-center gap-3">
          <div class="relative flex-1 min-w-0">
            <span class="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400 pointer-events-none">
              <i class="fa-solid fa-magnifying-glass text-[12px]"></i>
            </span>
            <input
              v-model="searchQuery"
              type="text"
              aria-label="Search notifications"
              placeholder="Search notifications"
              class="w-full h-12 pl-10 pr-4 bg-white border border-slate-300 rounded-lg text-[14px] text-slate-700 placeholder:text-slate-400 outline-none focus:border-[#1e4b8f] transition"
            >
          </div>
          <div class="grid grid-cols-2 lg:flex gap-3 lg:items-center">
            <div class="relative">
              <select v-model="viewFilter" aria-label="View" class="nt-select lg:w-[166px]">
                <option value="all">View: All alerts</option>
                <option value="unread">View: Unread</option>
                <option value="booking">View: Booking updates</option>
                <option value="payment">View: Payments</option>
                <option value="other">View: Other</option>
              </select>
              <i class="fa-solid fa-chevron-down nt-chevron"></i>
            </div>
            <div class="relative">
              <select v-model="sortBy" aria-label="Sort notifications" class="nt-select lg:w-[166px]">
                <option value="newest">Sort: Newest</option>
                <option value="oldest">Sort: Oldest</option>
              </select>
              <i class="fa-solid fa-chevron-down nt-chevron"></i>
            </div>
          </div>
          <button
            type="button"
            @click="markAllRead"
            :disabled="counts.unread === 0 || isMarkingAll"
            class="self-end lg:self-auto px-2 lg:px-1 text-[14px] font-bold text-[#1e4b8f] hover:underline disabled:text-slate-300 disabled:no-underline whitespace-nowrap"
          >{{ isMarkingAll ? 'Marking…' : 'Mark all as read' }}</button>
        </div>

        <!-- Notifications list -->
        <section class="mt-6 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div class="flex items-center justify-between gap-4 px-5 sm:px-[25px] py-5 border-b border-slate-200">
            <h2 class="text-[17px] sm:text-[18px] font-bold text-slate-900">Recent notifications</h2>
            <p class="text-[12px] sm:text-[13px] font-semibold text-slate-500 whitespace-nowrap">
              Showing {{ pageStart }}–{{ pageEnd }} of {{ filteredItems.length }} alert{{ filteredItems.length === 1 ? '' : 's' }}
            </p>
          </div>

          <!-- No matches -->
          <div v-if="filteredItems.length === 0" class="px-6 py-16 text-center">
            <p class="text-slate-500 font-semibold mb-3">
              {{ viewFilter === 'unread' && !searchQuery.trim() ? "You're all caught up — no unread notifications." : 'No notifications match your search or filters.' }}
            </p>
            <button type="button" @click="resetFilters" class="text-[#1e4b8f] font-bold text-sm hover:underline">Show all notifications</button>
          </div>

          <ul v-else class="divide-y divide-slate-200">
            <li
              v-for="n in pagedItems"
              :key="n.id"
              @click="onRowClick(n, $event)"
              class="relative flex gap-4 sm:gap-[18px] px-5 sm:px-[25px] py-[22px] transition-colors"
              :class="[n.is_read ? 'bg-white hover:bg-slate-50/60' : 'bg-blue-50/30 hover:bg-blue-50/60', targetFor(n) ? 'cursor-pointer' : '']"
            >
              <span v-if="!n.is_read" class="absolute left-0 top-0 bottom-0 w-[3px] bg-[#1e4b8f]" aria-hidden="true"></span>

              <div class="w-[52px] h-[52px] shrink-0 rounded-xl flex items-center justify-center"
                   :class="n.is_read ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-[#1e4b8f]'">
                <i class="fa-solid text-[18px]" :class="n.icon" aria-hidden="true"></i>
              </div>

              <div class="flex-1 min-w-0 pr-5">
                <p class="text-[12px] font-semibold uppercase tracking-[0.04em] text-slate-500">
                  <time :datetime="n.created_at">{{ formatWhen(n.created_at) }}</time>
                </p>
                <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 class="text-[16px] font-bold text-slate-900">{{ n.title }}</h3>
                  <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.06em] leading-none" :class="CATEGORY_TAG[n.category].classes">{{ CATEGORY_TAG[n.category].label }}</span>
                  <span v-if="!n.is_read" class="sr-only">Unread</span>
                </div>
                <p class="mt-1.5 text-[13px] leading-relaxed text-slate-500 break-words">
                  <template v-for="(seg, i) in bodySegments(n.body)" :key="i"><b v-if="seg.strong" class="font-bold text-slate-700">{{ seg.text }}</b><template v-else>{{ seg.text }}</template></template>
                </p>
                <div v-if="!n.is_read || targetFor(n)" class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <button v-if="!n.is_read" type="button" @click="markRead(n.id)" class="inline-flex items-center gap-1.5 text-[12px] font-bold tracking-[0.03em] text-[#1e4b8f] hover:underline">
                    <i class="fa-solid fa-check text-[10px]"></i> Mark as read
                  </button>
                  <router-link
                    v-if="targetFor(n)"
                    :to="targetFor(n).to"
                    @click="!n.is_read && markRead(n.id)"
                    class="text-[12px] font-bold tracking-[0.03em] text-[#1e4b8f] hover:underline"
                  >{{ targetFor(n).label }}</router-link>
                </div>
              </div>

              <span v-if="!n.is_read" class="absolute right-5 sm:right-[25px] top-[30px] w-2 h-2 rounded-full bg-blue-600" aria-hidden="true"></span>
            </li>
          </ul>

          <!-- Pagination -->
          <div v-if="filteredItems.length > 0" class="border-t border-slate-200 px-5 sm:px-[25px] py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p class="text-[13px] text-slate-500">
              Showing <b class="text-slate-700">{{ pageStart }}–{{ pageEnd }}</b> of <b class="text-slate-700">{{ filteredItems.length }}</b> alert{{ filteredItems.length === 1 ? '' : 's' }}
            </p>
            <nav v-if="totalPages > 1" aria-label="Notification pages" class="flex items-center gap-[7px]">
              <button type="button" aria-label="Previous page" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)" class="nt-page">
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
                  class="nt-page"
                  :class="{ 'is-current': p === currentPage }"
                >{{ p }}</button>
              </template>
              <button type="button" aria-label="Next page" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)" class="nt-page">
                <i class="fa-solid fa-chevron-right text-[9px]"></i>
              </button>
            </nav>
          </div>
        </section>

        <p class="mt-4 text-[12px] text-slate-400">Updates about your reservations, payments and stay extensions appear here. Select a notification to open the related booking.</p>
      </template>
    </main>
  </div>
</template>

<style scoped>
.nt-select {
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
.nt-select:focus { border-color: #1e4b8f; }
.nt-chevron {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  color: #64748b;
  pointer-events: none;
}
.nt-page {
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
.nt-page:hover:not(:disabled):not(.is-current) { border-color: #1e4b8f; color: #1e4b8f; }
.nt-page:disabled { opacity: .45; cursor: default; }
.nt-page.is-current { background: #1e4b8f; border-color: #1e4b8f; color: #fff; }
</style>
