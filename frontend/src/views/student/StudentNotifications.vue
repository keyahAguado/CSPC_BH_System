<script setup>
import { formalDatesInText } from '../../utils/dateHelper.js';
import MessageText from "../../components/MessageText.vue";
import {studentNotificationPresentation} from '../../utils/studentNotification.js';
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import StudentNav from '../../components/partials/StudentNav.vue';
import StudentPager from '../../components/partials/StudentPager.vue';
import TablePager from '../../components/management/TablePager.vue';
import { manilaDayOf, dayHeading } from '../../utils/notificationInbox.js';
import { useOfflineStatus } from '../../utils/offlineHelper.js';

const PAGE_SIZES = [10, 25, 50, 100];
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
const viewFilter = ref(VIEWS.includes(savedState.view) ? savedState.view : 'all');
const currentPage = ref(Math.max(1, parseInt(savedState.page, 10) || 1));
const perPage = ref(PAGE_SIZES.includes(savedState.perPage) ? savedState.perPage : 10);

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
  const raw = String(n.message || '').replace(/\s+PHT\b/g,'').trim();
  const friendly=studentNotificationPresentation(raw);
  const m = raw.match(/^([A-Z][A-Z ]{2,40}):\s*(.*)$/s);
  const prefix = m ? m[1].trim() : '';
  const body = formalDatesInText(m ? m[2] : raw);
  let meta = friendly || KNOWN_TYPES[prefix];
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

// ── Counts, filters, sort, pagination ────────────────────────────────────────
const counts = computed(() => ({
  all: items.value.length,
  unread: items.value.filter(n => !n.is_read).length,
  bookingUpdates: items.value.filter(n => n.category === 'booking' || n.category === 'payment').length
}));

const statCards = computed(() => [
  { key: 'all', label: 'All', value: counts.value.all, icon: 'fa-inbox', tone: 'bg-[#dbeafe] text-[#1d4ed8]' },
  { key: 'unread', label: 'Unread', value: counts.value.unread, icon: 'fa-envelope', tone: 'bg-[#fef3c7] text-[#b45309]' },
  { key: 'booking', label: 'Booking Updates', value: counts.value.bookingUpdates, icon: 'fa-calendar-check', tone: 'bg-[#dcfce7] text-[#15803d]' }
]);

const timeOf = (n) => {
  const t = new Date(n.created_at).getTime();
  return isNaN(t) ? 0 : t;
};

const filteredItems = computed(() => {
  const list = items.value.filter(n => {
    if (viewFilter.value === 'unread' && n.is_read) return false;
    if (viewFilter.value === 'booking' && !(n.category === 'booking' || n.category === 'payment')) return false;
    if (viewFilter.value === 'payment' && n.category !== 'payment') return false;
    if (viewFilter.value === 'other' && n.category !== 'other') return false;
    return true;
  });
  return [...list].sort((a, b) => timeOf(b) - timeOf(a) || b.id - a.id);
});

// Paged like the data tables across the app ("Showing x to y of z" · Rows per page · Prev / Next)
const totalPages = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / perPage.value)));
const pageStart = computed(() => filteredItems.value.length === 0 ? 0 : (currentPage.value - 1) * perPage.value + 1);
const pageEnd = computed(() => Math.min(currentPage.value * perPage.value, filteredItems.value.length));
const pagedItems = computed(() => filteredItems.value.slice((currentPage.value - 1) * perPage.value, currentPage.value * perPage.value));

const goToPage = (n) => {
  if (n >= 1 && n <= totalPages.value) currentPage.value = n;
};

watch([viewFilter, perPage], () => { currentPage.value = 1; });

// Unread view: marking an item read can empty the last page, so keep the page in range
watch([totalPages, isLoading], ([total, loading]) => {
  if (!loading && currentPage.value > total) currentPage.value = total;
}, { immediate: true });

watch([viewFilter, currentPage, perPage], () => {
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify({ view: viewFilter.value, page: currentPage.value, perPage: perPage.value }));
  } catch (e) {}
});

const setView = (key) => { viewFilter.value = key; };

// ── Desktop: data table like the owner inbox (day groups, selection, View + menu) ──
const dayGroups = computed(() => {
  const today = manilaDayOf(Date.now());
  const groups = [];
  for (const n of pagedItems.value) {
    const day = manilaDayOf(n.created_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(n);
    else groups.push({ day, label: dayHeading(day, today), items: [n] });
  }
  return groups;
});
const timeLabel = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true }) : '';
const dateLabel = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable';
const refLabel = (n) => n.bookingId ? 'REF-' + String(n.bookingId).padStart(4, '0') : '';

const selectedIds = ref([]);
const markingSelected = ref(false);
const pageSelected = computed(() => pagedItems.value.length > 0 && pagedItems.value.every(n => selectedIds.value.includes(n.id)));
const somePageSelected = computed(() => pagedItems.value.some(n => selectedIds.value.includes(n.id)));
const togglePage = () => {
  const ids = pagedItems.value.map(n => n.id);
  selectedIds.value = pageSelected.value ? selectedIds.value.filter(id => !ids.includes(id)) : [...new Set([...selectedIds.value, ...ids])];
};
const markSelectedRead = async () => {
  if (markingSelected.value) return;
  markingSelected.value = true;
  try {
    const unread = items.value.filter(n => selectedIds.value.includes(n.id) && !n.is_read);
    await Promise.allSettled(unread.map(n => markRead(n.id)));
    selectedIds.value = [];
  } finally {
    markingSelected.value = false;
  }
};

// ── Mobile: All / Unread cards over a newest-first paged list, no search ────
const mobileView = ref('all');
const mobilePage = ref(1);
const mobilePerPage = ref(10);
const mobileItems = computed(() => [...items.value]
  .filter(n => mobileView.value === 'all' || !n.is_read)
  .sort((a, b) => timeOf(b) - timeOf(a) || b.id - a.id));
const mobileTotalPages = computed(() => Math.max(1, Math.ceil(mobileItems.value.length / mobilePerPage.value)));
const mobileStart = computed(() => mobileItems.value.length === 0 ? 0 : (mobilePage.value - 1) * mobilePerPage.value + 1);
const mobileEnd = computed(() => Math.min(mobilePage.value * mobilePerPage.value, mobileItems.value.length));
const mobileShown = computed(() => mobileItems.value.slice((mobilePage.value - 1) * mobilePerPage.value, mobilePage.value * mobilePerPage.value));
watch([mobileView, mobilePerPage], () => { mobilePage.value = 1; });
watch(mobileTotalPages, (total) => { if (mobilePage.value > total) mobilePage.value = total; });

// Short time label: "Just now", "5m", "3h", "Yesterday", "Oct 3"
const shortWhen = (value) => {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h`;
  if (mins < 48 * 60) return 'Yesterday';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
};

onMounted(fetchNotifications);
</script>

<template>
  <div class="bg-[#f6f8fb] min-h-screen font-sans text-slate-800 pb-20">
    <StudentNav />

    <main class="max-w-[1920px] mx-auto px-4 sm:px-8 xl:px-[65px] pt-5 md:pt-10 lg:pt-[52px] text-left">
      <!-- Mobile header -->
      <header class="md:hidden">
        <div class="min-w-0">
          <h1 class="text-[28px] font-extrabold text-slate-900 tracking-tight leading-tight">Notifications</h1>
          <p class="mt-1 text-[11px] font-semibold text-slate-400 uppercase tracking-[0.18em]">Your recent alerts and updates</p>
        </div>
      </header>

      <header class="hidden md:block">
        <h1 class="text-[28px] sm:text-[40px] font-extrabold text-slate-900 tracking-tight uppercase leading-none">Notifications</h1>
        <p class="mt-3 sm:mt-4 text-[11px] sm:text-[13px] font-semibold text-slate-400 uppercase tracking-[0.18em]">Your recent alerts and updates</p>
      </header>

      <!-- Loading -->
      <div v-if="isLoading" class="mt-5 md:mt-8 bg-white rounded-2xl p-12 md:p-20 text-center border border-slate-200 flex flex-col items-center justify-center">
        <div class="w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p class="text-slate-400 font-semibold text-sm">Loading your notifications…</p>
      </div>

      <!-- Offline -->
      <div v-else-if="isOffline" class="mt-5 md:mt-8 bg-white rounded-2xl p-10 md:p-16 text-center border-2 border-dashed border-amber-200">
        <i class="fa-solid fa-wifi text-3xl text-amber-300 mb-4"></i>
        <p class="text-amber-600 font-bold uppercase tracking-widest text-xs mb-2">No Internet Connection</p>
        <p class="text-slate-400 font-medium text-sm">Please connect to the internet to view your notifications.</p>
      </div>

      <!-- Error -->
      <div v-else-if="loadError" class="mt-5 md:mt-8 bg-white rounded-2xl p-10 md:p-16 text-center border border-rose-100">
        <i class="fa-solid fa-circle-exclamation text-3xl text-rose-400 mb-4"></i>
        <p class="text-slate-900 font-bold mb-1">Unable to load your notifications</p>
        <p class="text-slate-400 text-sm mb-5">Something went wrong. Please try again.</p>
        <button type="button" @click="fetchNotifications" class="bg-[#1e4b8f] hover:bg-[#163a70] text-white text-sm font-bold px-5 py-2.5 rounded-lg transition">Retry</button>
      </div>

      <!-- Empty inbox -->
      <div v-else-if="notifications.length === 0" class="mt-5 md:mt-8 p-10 md:p-16 border-2 border-dashed border-slate-200 rounded-2xl bg-white flex flex-col items-center justify-center gap-3 text-center">
        <i class="fa-solid fa-bell-slash text-4xl text-slate-300"></i>
        <p class="text-slate-500 font-bold">No notifications yet.</p>
        <p class="text-slate-400 text-sm">Updates about your reservations and payments will appear here.</p>
      </div>

      <template v-else>
        <!-- MOBILE: All / Unread cards (label on top, then icon and number; same layout as My Bookings), Mark all read, then the paged list -->
        <div class="md:hidden mt-4 grid grid-cols-2 gap-3">
          <button
            v-for="card in [{ key: 'all', label: 'All', value: counts.all, icon: 'fa-inbox', tone: 'bg-[#dbeafe] text-[#1d4ed8]' }, { key: 'unread', label: 'Unread', value: counts.unread, icon: 'fa-envelope', tone: 'bg-[#fef3c7] text-[#b45309]' }]"
            :key="card.key"
            type="button"
            @click="mobileView = card.key"
            :aria-pressed="mobileView === card.key"
            class="min-w-0 min-h-[76px] px-4 py-3.5 text-left bg-white border rounded-xl shadow-[0_3px_12px_#1f487008] transition-[border-color,box-shadow] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-[#93c5fd] focus-visible:outline-offset-2"
            :class="mobileView === card.key ? 'border-[#3b7bff] shadow-[inset_0_0_0_1px_#3b7bff]' : 'border-[#e1eaf5]'"
          >
            <span class="block text-[11px] font-bold uppercase tracking-[0.1em] leading-tight" :class="mobileView === card.key ? 'text-[#1e4b8f]' : 'text-slate-600'">{{ card.label }}</span>
            <span class="mt-2 flex items-center gap-2.5">
              <span class="shrink-0 grid place-items-center w-9 h-9 rounded-[10px] text-[15px]" :class="card.tone" aria-hidden="true"><i class="fa-solid" :class="card.icon"></i></span>
              <strong class="text-[26px] font-bold leading-none tabular-nums" :class="mobileView === card.key ? 'text-[#1e4b8f]' : 'text-[#163454]'">{{ card.value }}</strong>
            </span>
          </button>
        </div>
        <div v-if="counts.unread > 0" class="md:hidden mt-2 flex justify-end">
          <button
            type="button"
            @click="markAllRead"
            :disabled="isMarkingAll"
            class="text-[13px] font-semibold text-[#1e4b8f] py-2 disabled:text-slate-300"
          >{{ isMarkingAll ? 'Marking…' : 'Mark all read' }}</button>
        </div>

        <section class="md:hidden mt-4 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <p v-if="mobileItems.length === 0" class="px-5 py-12 text-center text-[14px] text-slate-500 font-medium">You're all caught up — no unread notifications.</p>
          <template v-else>
            <ul class="divide-y divide-slate-100">
              <li
                v-for="n in mobileShown"
                :key="n.id"
                @click="openNotification(n)"
                class="relative bg-white flex items-start gap-3 px-4 py-4 active:bg-slate-50"
                :class="targetFor(n) ? 'cursor-pointer' : ''"
              >
                <span v-if="!n.is_read" class="absolute left-0 top-0 bottom-0 w-[3px] bg-[#1e4b8f]" aria-hidden="true"></span>
                <div class="w-10 h-10 shrink-0 rounded-full flex items-center justify-center"
                     :class="n.is_read ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-[#1e4b8f]'">
                  <i class="fa-solid text-[15px]" :class="n.icon" aria-hidden="true"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between gap-2">
                    <h3 class="text-[14.5px] leading-snug" :class="n.is_read ? 'font-semibold text-slate-700' : 'font-bold text-slate-900'">{{ n.title }}</h3>
                    <span class="shrink-0 flex items-center gap-1.5 pt-0.5">
                      <time :datetime="n.created_at" class="text-[11.5px]" :class="n.is_read ? 'text-slate-400' : 'text-[#1e4b8f] font-semibold'">{{ shortWhen(n.created_at) }}</time>
                      <span v-if="!n.is_read" class="w-2 h-2 rounded-full bg-blue-600" aria-hidden="true"></span>
                      <span v-if="!n.is_read" class="sr-only">Unread</span>
                    </span>
                  </div>
                  <p class="mt-1 text-[13px] leading-relaxed text-slate-600 break-words"><MessageText :text="n.body" /></p>
                </div>
              </li>
            </ul>
            <StudentPager class="px-4 border-t border-slate-100" noun="notifications" :page="mobilePage" :total-pages="mobileTotalPages" :start="mobileStart" :end="mobileEnd" :total="mobileItems.length" @update:page="mobilePage = $event"  />
          </template>
        </section>

        <div class="hidden md:block">
        <!-- Summary cards (also quick view filters): same card design as the phone view -->
        <div class="mt-7 sm:mt-8 flex flex-wrap gap-3">
          <button
            v-for="card in statCards"
            :key="card.key"
            type="button"
            @click="setView(card.key)"
            :aria-pressed="viewFilter === card.key"
            class="min-w-[170px] min-h-[76px] px-4 py-3.5 text-left bg-white border rounded-xl shadow-[0_3px_12px_#1f487008] transition-[border-color,box-shadow] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-[#93c5fd] focus-visible:outline-offset-2"
            :class="viewFilter === card.key ? 'border-[#3b7bff] shadow-[inset_0_0_0_1px_#3b7bff]' : 'border-[#e1eaf5] hover:border-[#bdd1ee]'"
          >
            <span class="block text-[11px] font-bold uppercase tracking-[0.1em] leading-tight whitespace-nowrap" :class="viewFilter === card.key ? 'text-[#1e4b8f]' : 'text-slate-600'">{{ card.label }}</span>
            <span class="mt-2 flex items-center gap-2.5">
              <span class="shrink-0 grid place-items-center w-9 h-9 rounded-[10px] text-[15px]" :class="card.tone" aria-hidden="true"><i class="fa-solid" :class="card.icon"></i></span>
              <strong class="text-[26px] font-bold leading-none tabular-nums" :class="viewFilter === card.key ? 'text-[#1e4b8f]' : 'text-[#163454]'">{{ card.value }}</strong>
            </span>
          </button>
        </div>

        <!-- Notifications table (same design as the owner inbox) -->
        <div class="ni-toolbar">
          <h2 class="text-[17px] sm:text-[18px] font-bold text-slate-900">Recent notifications</h2>
          <button class="ni-mark-all" type="button" :disabled="isMarkingAll || counts.unread === 0" @click="markAllRead"><i :class="['fa-solid', isMarkingAll ? 'fa-spinner fa-spin' : 'fa-check-double']" aria-hidden="true"></i>Mark all read</button>
        </div>
        <div v-if="selectedIds.length" class="ni-selection" role="status"><span>{{ selectedIds.length }} selected</span><button type="button" :disabled="markingSelected" @click="markSelectedRead">Mark selected read</button><button type="button" @click="selectedIds = []">Clear selection</button></div>
        <section class="ni-list" aria-label="Notifications">
          <TablePager position="top" noun="notifications" :page="currentPage" :total-pages="totalPages" :start="pageStart" :end="pageEnd" :total="filteredItems.length" :per-page="perPage" @update:page="goToPage" @update:per-page="perPage = $event" />
          <div class="ni-columns"><label><input type="checkbox" :checked="pageSelected" :indeterminate.prop="somePageSelected && !pageSelected" :disabled="!pagedItems.length" @change="togglePage" aria-label="Select notifications on this page"></label><span>Notification</span><span>Booking</span><span>Time</span><span></span></div>
          <template v-for="group in dayGroups" :key="group.day || 'unknown'">
            <h3 class="ni-day"><span>{{ group.label }}</span><small>{{ group.items.length }} {{ group.items.length === 1 ? 'notification' : 'notifications' }}</small></h3>
            <article v-for="n in group.items" :key="n.id" :class="['ni-row', { 'is-unread': !n.is_read }]">
              <label class="ni-select"><input type="checkbox" v-model="selectedIds" :value="n.id" :aria-label="'Select notification: ' + n.title"></label>
              <div class="ni-content">
                <span class="ni-icon" aria-hidden="true"><i :class="['fa-solid', n.icon]"></i></span>
                <div class="ni-copy">
                  <div class="ni-title"><span v-if="!n.is_read" class="ni-dot" aria-label="Unread"></span><h2>{{ n.title }}</h2><span class="ni-category">{{ CATEGORY_TAG[n.category].label }}</span></div>
                  <p class="ni-preview"><MessageText :text="n.body" /></p>
                  <p v-if="n.guidance" class="ni-guidance">{{ n.guidance }}</p>
                </div>
              </div>
              <div class="ni-property"><strong v-if="refLabel(n)">{{ refLabel(n) }}</strong><span v-else class="ni-muted">General notice</span></div>
              <time class="ni-time" :datetime="n.created_at" :title="dateLabel(n.created_at)"><span>{{ timeLabel(n.created_at) }}</span></time>
              <div class="ni-actions">
                <router-link v-if="targetFor(n)" :to="targetFor(n).to" class="ni-view" @click="!n.is_read && markRead(n.id)">{{ targetFor(n).label }}</router-link>
                <details class="ni-more"><summary :aria-label="'Options for ' + n.title"><i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i></summary><div><button v-if="!n.is_read" type="button" @click="markRead(n.id)">Mark as read</button><span v-else>Already read</span></div></details>
              </div>
            </article>
          </template>
          <div v-if="!pagedItems.length" class="ni-empty"><i class="fa-solid fa-inbox" aria-hidden="true"></i><h2>{{ viewFilter === 'unread' ? 'You are all caught up' : 'No notifications in this view' }}</h2><p>{{ viewFilter === 'unread' ? 'No unread notifications.' : 'Try another filter.' }}</p><button v-if="viewFilter !== 'all'" type="button" @click="setView('all')">Show all notifications</button></div>
          <TablePager position="bottom" noun="notifications" :page="currentPage" :total-pages="totalPages" :start="pageStart" :end="pageEnd" :total="filteredItems.length" :per-page="perPage" @update:page="goToPage" @update:per-page="perPage = $event" />
        </section>

        <p class="mt-4 text-[12px] text-slate-400">Updates about your reservations, payments and stay extensions appear here. Select a notification to open the related booking.</p>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
/* Desktop notifications table: same design as the owner inbox (views/Notifications.vue) */
.ni-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:24px 0 14px}
.ni-mark-all{display:inline-flex;align-items:center;gap:8px;padding:9px 13px;min-height:38px;border:1px solid #5684ff;border-radius:9px;background:white;color:#1d5bd6;font:inherit;font-size:12px;font-weight:650;cursor:pointer}
.ni-mark-all:disabled{opacity:.5;cursor:default}
.ni-selection{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;padding:10px 14px;border:1px solid #bfd6f7;border-radius:9px;background:#eff6ff;font-size:12px;color:#234a7e}
.ni-selection button,.ni-empty button{padding:5px 9px;border:1px solid #bdd2ee;border-radius:6px;background:white;color:#1d4ed8;font:inherit;font-size:12px;cursor:pointer}
.ni-list{background:white;border:1px solid #e1eaf5;border-radius:13px;overflow:visible;box-shadow:0 5px 20px #1b426208}
.ni-list :deep(.tp-bar){font-size:12px;font-weight:500;padding:12px 16px;background:#fcfdff;gap:10px 16px}
.ni-list :deep(.tp-bar.is-top){border-radius:13px 13px 0 0}
.ni-list :deep(.tp-bar.is-bottom){border-radius:0 0 13px 13px}
.ni-list :deep(.tp-pages button){font-size:12px;font-weight:650;height:32px;min-height:32px!important;min-width:32px;padding:0 9px}
.ni-list :deep(.tp-rows select){font-size:12px;font-weight:600}
.ni-columns,.ni-row{display:grid;grid-template-columns:24px minmax(280px,1fr) minmax(125px,.26fr) 130px minmax(120px,.22fr);align-items:center;gap:18px;padding:17px 20px}
.ni-columns{background:#f3f7fc;border-bottom:1px solid #e5edf7;font-size:12px;color:#5a708c;font-weight:650}
.ni-columns>span:first-of-type{padding-left:52px}
.ni-columns input,.ni-select input{width:17px;height:17px;accent-color:#2563eb;border-radius:4px;cursor:pointer;margin:0}
.ni-columns label,.ni-select{display:inline-flex;align-items:center;justify-content:center;min-height:32px}
.ni-day{display:flex;align-items:baseline;gap:10px;margin:0;padding:9px 16px;background:#f8fbff;border-bottom:1px solid #e8eef7;font-size:12px;font-weight:700;color:#294a70;letter-spacing:.01em}
.ni-day small{font-size:11px;font-weight:500;color:#7c8fa9}
.ni-row{position:relative;border-bottom:1px solid #e8eef7;padding-top:20px;padding-bottom:20px;min-width:0}
.ni-row:last-of-type{border-bottom:0}
.ni-row:hover{background:#f8fbff}
.ni-row.is-unread{background:#fbfdff}
.ni-row.is-unread:before{content:'';position:absolute;left:0;top:12px;bottom:12px;width:3px;border-radius:0 3px 3px 0;background:#2563eb}
.ni-content{display:flex;gap:12px;align-items:flex-start;min-width:0}
.ni-icon{display:grid;place-items:center;width:40px;height:40px;flex-shrink:0;border-radius:11px;background:#f1f5f9;color:#64748b;font-size:17px}
.ni-row:not(.is-unread) .ni-icon{opacity:.75}
.ni-copy{flex:1;min-width:0}
.ni-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ni-title h2{font-size:13.5px;font-weight:700;color:#183453;line-height:1.5;margin:0}
.ni-row:not(.is-unread) .ni-title h2{color:#3d5677;font-weight:650}
.ni-title .ni-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#2563eb;flex-shrink:0}
.ni-category{display:inline-block;background:#f1f5f9;color:#526985;border-radius:999px;padding:3px 8px;font-size:10.5px;font-weight:600;line-height:1.3;white-space:nowrap}
.ni-copy>p{margin:5px 0 0;font-size:12.5px;line-height:1.65;color:#526985;overflow-wrap:anywhere}
.ni-copy>.ni-preview{display:block;white-space:pre-line}
.ni-copy>.ni-guidance{color:#334c68}
.ni-property,.ni-time{display:flex;flex-direction:column;gap:4px;font-size:12px;line-height:1.5;color:#617690;min-width:0}
.ni-property strong{font-weight:600;color:#3d5677;font-variant-numeric:tabular-nums}
.ni-muted{color:#8a9bb2;font-style:italic}
.ni-time span{font-variant-numeric:tabular-nums;font-weight:600;color:#3d5677}
.ni-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px}
.ni-view{display:inline-flex;align-items:center;justify-content:center;padding:8px 10px;border-radius:7px;background:#2563eb;color:white;font-size:11px;font-weight:650;line-height:1.3;text-decoration:none;white-space:nowrap}
.ni-view:hover{background:#1d4ed8}
.ni-more{position:relative}
.ni-more summary{display:grid;place-items:center;min-width:28px;min-height:32px;cursor:pointer;list-style:none;color:#58708e;border-radius:6px}
.ni-more summary::-webkit-details-marker{display:none}
.ni-more summary:hover{background:#eaf2ff}
.ni-more>div{position:absolute;right:0;top:34px;z-index:25;min-width:145px;padding:6px;background:white;border:1px solid #d9e4f3;border-radius:8px;box-shadow:0 8px 22px #1434591a}
.ni-more button,.ni-more>div>span{display:block;padding:8px 10px;font:inherit;font-size:12px;white-space:nowrap;color:#35557d;background:white;border:0;border-radius:5px}
.ni-more button{cursor:pointer;width:100%;text-align:left}
.ni-more button:hover{background:#eff6ff}
.ni-empty{padding:40px 20px;text-align:center;color:#60738c}
.ni-empty>i{font-size:25px;color:#91a5c2}
.ni-empty h2{font-size:15px;font-weight:650;color:#294767;margin:12px 0 6px}
.ni-empty p{font-size:13px;margin:0 0 14px}
.ni-mark-all:focus-visible,.ni-view:focus-visible,.ni-more summary:focus-visible,.ni-selection button:focus-visible{outline:3px solid #93c5fd;outline-offset:3px}
@media(max-width:1150px){
  .ni-columns,.ni-row{grid-template-columns:22px minmax(220px,1fr) 110px 100px 110px;gap:12px;padding-left:14px;padding-right:14px}
  .ni-content{gap:9px}
  .ni-icon{width:34px;height:34px;font-size:15px}
  .ni-columns>span:first-of-type{padding-left:43px}
  .ni-actions{gap:4px}
  .ni-view{font-size:10.5px;padding:8px}
  .ni-title h2{font-size:13px}
}
@media(max-width:900px){
  .ni-columns{display:flex;gap:8px}
  .ni-columns>span{display:none}
  .ni-columns>span:first-of-type{display:block;padding-left:0}
  .ni-columns>span:first-of-type:after{content:' - select page'}
  .ni-row{grid-template-columns:24px minmax(0,1fr);align-items:start;gap:10px 8px;padding:16px}
  .ni-select{grid-column:1;grid-row:1}
  .ni-content{grid-column:2;grid-row:1}
  .ni-property,.ni-time,.ni-actions{grid-column:2;margin-left:43px}
  .ni-property:before{content:'Booking';font-size:10px;font-weight:600;color:#7c8fa9}
  .ni-property{gap:2px}
  .ni-time{flex-direction:row;flex-wrap:wrap;gap:7px;font-size:11px}
  .ni-actions{justify-content:space-between}
}
@media(pointer:coarse){.ni-view,.ni-more summary,.ni-mark-all{min-height:44px;box-sizing:border-box}.ni-select,.ni-columns label{min-height:40px}.ni-more>div{top:44px}}
</style>
