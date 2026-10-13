<script setup>
import PageHeader from '../components/management/PageHeader.vue';
import TablePager from '../components/management/TablePager.vue';
import LoadError from '../components/management/LoadError.vue';
import '../styles/management.css';
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import OwnerNav from '../components/partials/OwnerNav.vue';
import AdminNav from '../components/partials/AdminNav.vue';
import StudentNav from '../components/partials/StudentNav.vue';
import { useOfflineStatus } from '../utils/offlineHelper.js';

const route = useRoute();
const router = useRouter();
const notifications = ref([]);
const loadError = ref('');
const isLoading = ref(true);
const token = sessionStorage.getItem('cspc_token');
const user = JSON.parse(sessionStorage.getItem('cspc_user') || '{}');
const API = import.meta.env.VITE_API_URL;

const { isOffline } = useOfflineStatus();

const fetchNotifications = async () => {
  loadError.value = '';
  try {
    isLoading.value = true;
    const res = await axios.get(`/api/notifications`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.data.success) {
      notifications.value = res.data.notifications || [];
    }
  } catch (err) {
    loadError.value = 'The server did not return notifications. Refresh the page to try again.';
    console.error('Failed to fetch notifications:', err);
  } finally {
    isLoading.value = false;
  }
};

const markRead = async (id) => {
  try {
    const res = await axios.post(`/api/notifications/read/${id}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.data.success) {
      notifications.value = notifications.value.map(n => 
        n.id === id ? { ...n, is_read: 1 } : n
      );
    }
  } catch (err) {
    console.error('Failed to mark notification as read:', err);
  }
};

/**
 * Dynamic message classification matching database prefix tags
 */
const getNotifType = (message) => {
  const msg = (message || '').toLowerCase();
  
  // ───  Intercept Criteria Actions to prevent them matching generic ALERT/WARNING expiry conditions ───
  if (
    msg.includes('saso admin has added') ||
    msg.includes('saso admin has updated') ||
    msg.includes('saso admin has removed')
  ) {
    return 'general'; // Renders cleanly as a blue "System Update" card
  }

  // Detect Booking / Reservation requests & Extension requests
  if (
    msg.includes('booking') ||
    msg.includes('reservation') ||
    msg.includes('requested a room') ||
    msg.includes('room request') ||
    msg.includes('payment settled') ||
    msg.includes('new booking') ||
    msg.includes('occupant') ||
    msg.includes('extension') ||
    msg.includes('extension request')
  ) {
    return 'booking';
  }

  // New or resubmitted boarding house applications → accreditation
  if (
    msg.includes('new boarding house application') ||
    msg.includes('submitted for accreditation') ||
    msg.includes('resubmitted for review')
  ) {
    return 'application';
  }

  // Detect if Owner uploaded an updated document or registered a new house application
  if (
    msg.includes('uploaded an updated document') || 
    msg.includes('has uploaded an updated document') ||
    msg.includes('new boarding house application') ||
    msg.includes('resubmission')
  ) {
    return 'document_update';
  }
  
  if (
    msg.includes('congratulations') || 
    msg.includes('officially approved') || 
    msg.includes('accredited') || 
    msg.includes('acc_approved') || 
    msg.includes('accreditation') ||
    msg.includes('restored')
  ) {
    return 'approved';
  }
  if (
    msg.includes('rejected') || 
    msg.includes('rejected by saso') || 
    msg.includes('notice:')
  ) {
    return 'rejected';
  }
  if (
    msg.includes('archived') || 
    msg.includes('archived list') || 
    msg.includes('hidden from students')
  ) {
    return 'issue';
  }
  if (
    msg.includes('removed') || 
    msg.includes('deleted')
  ) {
    return 'general';
  }
  if (
    msg.includes('alert:') || 
    msg.includes('warning:') || 
    msg.includes('expiry') ||
    msg.includes('expir') ||
    msg.includes('expired') ||
    msg.includes('expiring') ||
    msg.includes('fast expiring') ||
    msg.includes('due')
  ) {
    return 'expiry';
  }
  
  return 'general';
};

/**
 * Determines target destination route when notification container is clicked
 */
const getNotifTargetRoute = (notif) => {
  const role = user.role;
  const type = getNotifType(notif.message);

  if (role === 'owner') {
    if (type === 'booking') return '/owner/bookings';
    if (type === 'expiry' || type === 'rejected' || type === 'general') {
      const match = notif.message ? notif.message.match(/"([^"]+)"/) : null;
      if (match && match[1]) {
        return `/owner/documents?houseName=${encodeURIComponent(match[1])}`;
      }
      return '/owner/documents';
    }
    if (type === 'approved') return '/owner/dashboard';
    const match = notif.message ? notif.message.match(/"([^"]+)"/) : null;
    if (match && match[1]) {
      return `/owner/documents?houseName=${encodeURIComponent(match[1])}`;
    }
    return '/owner/documents';
  }

  if (role === 'admin') {
    if (type === 'application' || type === 'document_update' || type === 'approved' || type === 'rejected' || type === 'general') {
      return '/admin/pending-applications';
    }
    if (type === 'issue') return '/admin/archived';
    if (type === 'expiry') return '/admin/registered';
    return '/admin/pending-applications';
  }

  if (role === 'student') {
    return '/student/bookings';
  }

  return null;
};

const handleContainerClick = (notif, event) => {
  // Prevent double triggering if clicked directly on an interactive button/link inside
  if (event && (event.target.tagName === 'BUTTON' || event.target.tagName === 'A' || event.target.closest('button') || event.target.closest('a'))) {
    return;
  }
  if (!notif.is_read) {
    markRead(notif.id);
  }
  const targetRoute = getNotifTargetRoute(notif);
  if (targetRoute) {
    router.push(targetRoute);
  }
};

/**
 * Strips database routing prefixes from front-end display
 */
const cleanMessage = (message) => {
  if (!message) return '';
  return message
    .replace(/^ALERT:\s*/i, '')
    .replace(/^WARNING:\s*/i, '')
    .replace(/^SYSTEM:\s*/i, '')
    .replace(/^CONGRATULATIONS:\s*/i, '')
    .replace(/^NOTICE:\s*/i, '');
};

// Colours per notification type: bright header/buttons (color), readable text (ink), light boxes (soft)
const TYPE_META = {
  booking: { title: 'Reservation Request', icon: 'fa-calendar-check', color: '#3b82f6', ink: '#1d4ed8', soft: '#eff6ff', category: 'booking' },
  application: { title: 'Accreditation Application', icon: 'fa-file-signature', color: '#22c55e', ink: '#15803d', soft: '#f0fdf4', category: 'accreditation' },
  document_update: { title: 'Document Update Review', icon: 'fa-file-shield', color: '#3b82f6', ink: '#1d4ed8', soft: '#eff6ff', category: 'documents' },
  expiry: { title: 'Permit Expiry Warning', icon: 'fa-triangle-exclamation', color: '#fb923c', ink: '#c2410c', soft: '#fff7ed', category: 'documents' },
  issue: { title: 'System Alert', icon: 'fa-circle-exclamation', color: '#f43f5e', ink: '#be123c', soft: '#fff1f2', category: 'documents' },
  approved: { title: 'Accreditation Approved', icon: 'fa-circle-check', color: '#22c55e', ink: '#15803d', soft: '#f0fdf4', category: 'accreditation' },
  rejected: { title: 'Accreditation Rejected', icon: 'fa-circle-exclamation', color: '#f43f5e', ink: '#be123c', soft: '#fff1f2', category: 'accreditation' },
  general: { title: 'System Update', icon: 'fa-bell', color: '#3b82f6', ink: '#1d4ed8', soft: '#eff6ff', category: 'system' }
};

// SASO does not handle reservations, so the admin inbox has no Bookings filter
const FILTERS = [
  { key: 'booking', label: 'Bookings', icon: 'fa-calendar-check' },
  { key: 'documents', label: 'Documents', icon: 'fa-file-lines' },
  { key: 'accreditation', label: 'Accreditation', icon: 'fa-award' },
  { key: 'system', label: 'System', icon: 'fa-bell' }
].filter(f => !(f.key === 'booking' && user.role === 'admin'));
const CATEGORY_LABEL = { booking: 'Bookings', documents: 'Documents', accreditation: 'Accreditation', system: 'System' };

// No category selected shows everything; clicking the active category again clears it
const activeFilter = ref(FILTERS.some(f => f.key === route.query.filter) ? route.query.filter : 'all');
const setFilter = (key) => {
  if (key === activeFilter.value) key = 'all';
  activeFilter.value = key;
  router.replace({ query: { ...route.query, filter: key === 'all' ? undefined : key } });
};

// Classify each message once instead of on every template binding
const items = computed(() => notifications.value.map(n => {
  const type = getNotifType(n.message);
  return { ...n, type, meta: TYPE_META[type] || TYPE_META.general };
}));
const filterCounts = computed(() => {
  const counts = { all: items.value.length, unread: 0, booking: 0, documents: 0, accreditation: 0, system: 0 };
  items.value.forEach(n => {
    counts[n.meta.category]++;
    if (!n.is_read) counts.unread++;
  });
  return counts;
});
const visibleItems = computed(() => {
  if (activeFilter.value === 'all') return items.value;
  return items.value.filter(n => n.meta.category === activeFilter.value);
});

// Owner / admin inbox is paged (same pager as the admin tables) so the list doesn't run on forever
const nfPage = ref(1);
const nfPerPage = ref(10);
const nfTotalPages = computed(() => Math.max(1, Math.ceil(visibleItems.value.length / nfPerPage.value)));
const nfPaged = computed(() => visibleItems.value.slice((nfPage.value - 1) * nfPerPage.value, nfPage.value * nfPerPage.value));
const nfStart = computed(() => (visibleItems.value.length ? (nfPage.value - 1) * nfPerPage.value + 1 : 0));
const nfEnd = computed(() => Math.min(nfPage.value * nfPerPage.value, visibleItems.value.length));
watch(activeFilter, () => { nfPage.value = 1; });
watch(nfTotalPages, (total) => { if (nfPage.value > total) nfPage.value = total; });

const isMarkingAll = ref(false);
const markAllRead = async () => {
  try {
    isMarkingAll.value = true;
    const res = await axios.post('/api/notifications/read-all', {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.data.success) {
      notifications.value = notifications.value.map(n => ({ ...n, is_read: 1 }));
    }
  } catch (err) {
    console.error('Failed to mark all notifications as read:', err);
  } finally {
    isMarkingAll.value = false;
  }
};

const formatWhen = (value) => value
  ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : 'N/A';

onMounted(() => {
  fetchNotifications();
});
</script>

<template>
  <div class="min-h-screen flex flex-col font-sans text-left" 
       :class="[user.role === 'student' ? 'bg-[#bae1ff] text-slate-900 pb-20' : 'bg-[#eef6ff] text-slate-900 pb-12', { 'management-page': user.role === 'admin' || user.role === 'owner', 'notif-owner-theme': user.role === 'owner' || user.role === 'admin' }]">
    
    <component :is="user.role === 'admin' ? AdminNav : (user.role === 'owner' ? OwnerNav : StudentNav)" />

    <main :id="user.role !== 'student' ? 'management-content' : undefined" :class="['flex-1 max-w-5xl mx-auto w-full', user.role === 'student' ? 'py-12 px-6 lg:px-12' : 'py-6 px-4 sm:px-6']">

      <!-- Header Section -->
      <LoadError v-if="user.role !== 'student'" :message="loadError" />
      <PageHeader v-if="user.role !== 'student'" title="Notifications" />
      <div v-else class="mb-14 text-center">
        <h1 class="text-3xl font-black text-slate-900 uppercase tracking-tight mb-2">
          {{ user.role === 'admin' ? 'Admin Inbox' : (user.role === 'owner' ? 'Owner Inbox' : 'Student Inbox') }}
        </h1>
        <p class="font-bold uppercase text-[11px] tracking-[0.2em] mb-4"
           :class="user.role === 'student' ? 'text-[#2a528a]' : 'text-blue-600'">
          {{ user.role === 'admin' ? 'Tracking system alerts and updates' : (user.role === 'owner' ? 'Tracking your account activity' : 'Your Recent Alerts and Updates') }}
        </p>
        <div class="w-16 h-1.5 mx-auto rounded-full" :class="user.role === 'student' ? 'bg-[#2a528a]' : 'bg-blue-600'"></div>
      </div>

      <!-- Loading State Indicator -->
      <div v-if="isLoading" class="py-20 flex flex-col items-center justify-center gap-3 bg-white rounded-[2rem] shadow-sm border border-slate-200 p-10 max-w-xl mx-auto text-center">
        <svg class="animate-spin h-10 w-10 text-blue-600 mb-4 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Compiling Inbox...</p>
      </div>

      <!-- Offline Banner -->
      <div v-else-if="isOffline" class="py-20 flex flex-col items-center justify-center gap-3 bg-white rounded-[2rem] shadow-sm border-2 border-dashed border-amber-200 p-10 max-w-xl mx-auto text-center">
        <svg class="w-12 h-12 text-amber-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M12 12h.01M8.464 15.536a5 5 0 010-7.072M5.636 18.364a9 9 0 010-12.728"/>
        </svg>
        <p class="text-amber-600 font-black uppercase tracking-widest text-[11px]">No Internet Connection</p>
        <p class="text-slate-400 font-bold text-[10px]">Please connect to the internet to view your notifications.</p>
      </div>

      <div v-else class="space-y-6">

        <!-- =================================================================== -->
        <!-- 1. STUDENT NOTIFICATIONS TEMPLATE  -->
        <!-- =================================================================== -->
        <template v-if="user.role === 'student'">
          <div v-for="notif in notifications" :key="notif.id" 
               @click="handleContainerClick(notif, $event)"
               class="bg-white rounded-3xl p-6 shadow-xl border border-white flex gap-6 items-start transition-all duration-300 hover:shadow-2xl hover:border-blue-300 group cursor-pointer"
               :class="notif.is_read ? 'opacity-70' : ''">
            
            <div class="w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center group-hover:scale-110 transition-transform"
                 :class="notif.is_read ? 'bg-slate-100 text-slate-400' : 'bg-blue-50 text-blue-600'">
              <i class="fa-solid text-xl" :class="notif.is_read ? 'fa-envelope-open' : 'fa-envelope'"></i>
            </div>
            
            <div class="flex-1 min-w-0">
              <div class="flex justify-between items-start mb-2">
             <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">
  {{ notif.created_at ? new Date(notif.created_at).toLocaleString() : 'N/A' }}
</span>
                <span v-if="!notif.is_read" class="bg-blue-600 w-2 h-2 rounded-full shadow-lg shadow-blue-200"></span>
              </div>
              <p class="text-slate-800 font-semibold leading-relaxed">{{ cleanMessage(notif.message) }}</p>
              
              <button v-if="!notif.is_read" @click.stop="markRead(notif.id)" 
                      class="mt-4 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-black transition flex items-center gap-2 cursor-pointer">
                <i class="fa-solid fa-check"></i> Mark as Read
              </button>
            </div>
          </div>

          <!-- Student Empty State -->
          <div v-if="notifications.length === 0" class="bg-white/50 backdrop-blur-sm border-2 border-dashed border-white/60 rounded-[3rem] p-24 text-center">
            <div class="flex flex-col items-center gap-6 opacity-30">
              <i class="fa-solid fa-bell-slash text-6xl text-[#2a528a]"></i>
              <p class="text-[#2a528a] font-black uppercase text-xs tracking-[0.3em]">No notifications yet.</p>
            </div>
          </div>
        </template>

        <!-- =================================================================== -->
        <!-- 2. OWNER & ADMIN NOTIFICATIONS TEMPLATE  -->
        <!-- =================================================================== -->
        <template v-else>
          <!-- Category filter bar -->
          <div class="nf-toolbar">
            <div class="nf-tabs" role="group" aria-label="Filter notifications by category">
              <button v-for="f in FILTERS" :key="f.key" type="button"
                      :aria-pressed="activeFilter === f.key" :class="['nf-tab', { 'is-active': activeFilter === f.key }]"
                      @click="setFilter(f.key)">
                <i :class="['fa-solid', f.icon]" aria-hidden="true"></i>
                {{ f.label }}
                <span class="nf-tab-count">{{ filterCounts[f.key] }}</span>
              </button>
            </div>
            <button v-if="filterCounts.unread > 0" type="button" class="nf-markall" :disabled="isMarkingAll" @click="markAllRead">
              <i :class="isMarkingAll ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-check-double'" aria-hidden="true"></i>
              Mark all read
            </button>
          </div>

          <div class="nf-pager"><TablePager position="top" noun="notifications" :page="nfPage" @update:page="nfPage = $event" :total-pages="nfTotalPages" :start="nfStart" :end="nfEnd" :total="visibleItems.length" :per-page="nfPerPage" @update:per-page="nfPerPage = $event; nfPage = 1" /></div>

          <article v-for="notif in nfPaged" :key="notif.id"
               @click="handleContainerClick(notif, $event)"
               tabindex="0" role="link" :aria-label="'Open notification: ' + notif.meta.title" @keydown.enter.prevent="handleContainerClick(notif, $event)"
               class="nf-card"
               :class="{ 'is-read': notif.is_read, 'is-unread': !notif.is_read }"
               :style="{ '--nf-accent': notif.meta.color, '--nf-ink': notif.meta.ink, '--nf-soft': notif.meta.soft }">

            <!-- Header Bar -->
            <header class="nf-head">
              <span class="nf-head-icon" aria-hidden="true"><i :class="['fa-solid', notif.meta.icon]"></i></span>
              <h2>{{ notif.meta.title }}</h2>
              <span class="nf-head-tag">{{ CATEGORY_LABEL[notif.meta.category] }}</span>
              <span v-if="!notif.is_read" class="nf-new">New</span>
            </header>

            <!-- Card Body -->
            <div class="nf-body">
              <p class="nf-message">{{ cleanMessage(notif.message) }}</p>

              <!-- Context Blocks -->
              <div v-if="notif.type === 'booking' && user.role === 'owner'" class="nf-context">
                <p class="nf-context-title">Reservation request — action required</p>
                <p class="nf-context-text">A student has submitted a room reservation request or payment update. Open your bookings to review and respond.</p>
                <router-link to="/owner/bookings" class="nf-cta">Manage reservations <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></router-link>
              </div>

              <div v-else-if="notif.type === 'approved'" class="nf-context nf-approved">
                <div class="nf-seal">
                  <img src="/img/seal%20of%20approval.png" alt="CSPC Accredited" @error="e => e.target.src = '/img/cspc_logo.png'" />
                </div>
                <div>
                  <p class="nf-context-title">Status: Approved</p>
                  <p class="nf-context-text nf-strong">Accredited boarding house owner</p>
                </div>
              </div>

              <div v-else-if="notif.type === 'application' && user.role === 'admin'" class="nf-context">
                <p class="nf-context-title">Accreditation review — action required</p>
                <p class="nf-context-text">A boarding house application was submitted or resubmitted. Open New applications to review its requirements.</p>
              </div>

              <div v-else-if="notif.type === 'document_update' && user.role === 'admin'" class="nf-context">
                <p class="nf-context-title">Verification — action required</p>
                <p class="nf-context-text">An owner has uploaded updated files or resubmitted an application. Open the checklist to inspect the requirements.</p>
                <router-link to="/admin/pending-applications" class="nf-cta">Review checklist <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></router-link>
              </div>

              <div v-else-if="notif.type === 'expiry'" class="nf-context">
                <p class="nf-context-title">Action required</p>
                <p class="nf-context-text">
                  <template v-if="notif.message.toLowerCase().includes('supplementary')">
                    Upload a renewed copy on your Legal Documents page. Your listing remains active and bookable in the meantime — this is a reminder, not a suspension.
                  </template>
                  <template v-else>
                    Upload the renewed permits on your Legal Documents page. If they are not renewed before the expiry date, your listing will be hidden from students automatically.
                  </template>
                </p>
                <router-link to="/owner/documents" class="nf-cta">Update documents <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></router-link>
              </div>

              <div v-else-if="notif.type === 'rejected'" class="nf-context">
                <p class="nf-context-title">Action required</p>
                <p class="nf-context-text">Your application was not approved. Review the feedback from SASO and update your property details or legal documents to proceed.</p>
                <router-link to="/owner/documents" class="nf-cta">Review &amp; resubmit <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></router-link>
              </div>

              <div v-else-if="notif.type === 'issue' && user.role === 'owner'" class="nf-context nf-neutral">
                <p class="nf-context-title">Listing archived</p>
                <p class="nf-context-text">Your listing is hidden from students. If required permits expired, renew and resubmit them. If SASO archived it manually, contact the office to discuss reactivation.</p>
                <router-link to="/owner/documents" class="nf-cta">View documents <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></router-link>
              </div>

              <!-- Action buttons & timestamps -->
              <footer class="nf-foot">
                <button v-if="!notif.is_read" type="button" @click.stop="markRead(notif.id)" class="nf-markread">
                  <i class="fa-solid fa-check" aria-hidden="true"></i> Mark as read
                </button>
                <span v-else class="nf-open">Open <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>

                <div class="nf-meta">
                  <span class="nf-from">{{ notif.type === 'general' && user.role === 'admin' ? 'From boarding house owner' : 'From SASO Admin' }}</span>
                  <time :datetime="notif.created_at">{{ formatWhen(notif.created_at) }}</time>
                </div>
              </footer>
            </div>
          </article>

          <div class="nf-pager"><TablePager position="bottom" noun="notifications" :page="nfPage" @update:page="nfPage = $event" :total-pages="nfTotalPages" :start="nfStart" :end="nfEnd" :total="visibleItems.length" :per-page="nfPerPage" @update:per-page="nfPerPage = $event; nfPage = 1" /></div>

          <!-- Owner / Admin Empty State -->
          <div v-if="visibleItems.length === 0" class="nf-empty">
            <div class="nf-empty-icon"><i :class="['fa-solid', notifications.length === 0 ? 'fa-bell-slash' : 'fa-inbox']" aria-hidden="true"></i></div>
            <h3>{{ notifications.length === 0 ? 'No notifications yet' : 'Nothing in this category' }}</h3>
            <p v-if="notifications.length">You're all caught up here.</p>
            <button v-if="notifications.length" type="button" class="nf-markall" @click="setFilter('all')">Show all notifications</button>
          </div>
        </template>

      </div>

      <p class="mt-16 text-center text-blue-700/40 font-semibold uppercase text-[12px] tracking-[0.4em]">End of Your Notifications</p>
    </main>
  </div>
</template>
<style>
/* Owner inbox uses the portal font (Plus Jakarta Sans) and its heading style */
.notif-owner-theme,
.notif-owner-theme :is(h1, h2, h3, h4, p, span, a, label, button, input, select, textarea, strong, small, div) {
  font-family: 'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif !important;
}
.notif-owner-theme > main { -webkit-font-smoothing: antialiased; }
.notif-owner-theme .font-black { font-weight: 700 !important; }
.notif-owner-theme :is(.tracking-widest, .tracking-\[0\.2em\], .tracking-\[0\.3em\]) { letter-spacing: .06em !important; }
/* Owner / admin inbox: filter tabs and cards (header colours per type come from --nf-accent) */
.nf-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.nf-tabs { display: flex; flex-wrap: wrap; gap: 10px; }
.nf-tab { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 8px 0 16px; border: 1px solid #dfe7f2; border-radius: 999px; background: #fff; color: #5b6e86; font-size: 13.5px; font-weight: 600; cursor: pointer; box-shadow: 0 1px 2px rgba(20, 43, 74, .04); transition: background .15s, color .15s, box-shadow .15s; }
.nf-tab i { font-size: 12px; opacity: .8; }
.nf-tab:hover { background: #eef3fa; color: #142b4a; }
.nf-tab.is-active { background: #1e40af; border-color: #1e40af; color: #fff; box-shadow: 0 4px 12px rgba(30, 64, 175, .25); }
.nf-tab:focus-visible { outline: 3px solid #7fa6db; outline-offset: 2px; }
.nf-tab-count { min-width: 24px; padding: 0 8px; border-radius: 999px; background: #eef3fa; color: #5b6e86; font-size: 11.5px; font-weight: 700; line-height: 24px; text-align: center; }
.nf-tab.is-active .nf-tab-count { background: rgba(255, 255, 255, .22); color: #fff; }
.nf-markall { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 16px; border-radius: 10px; border: 1.5px solid #1e40af; background: #fff; color: #1e40af; font-size: 13px; font-weight: 700; cursor: pointer; transition: background .15s, color .15s; }
.nf-markall:hover:not(:disabled) { background: #1e40af; color: #fff; }

.nf-card { position: relative; overflow: hidden; background: #fff; border: 1px solid #dfe7f2; border-radius: 14px; box-shadow: 0 1px 2px rgba(20, 43, 74, .04), 0 6px 18px rgba(20, 43, 74, .05); cursor: pointer; }
.nf-card:focus-visible { outline: 3px solid #7fa6db; outline-offset: 2px; }
.nf-card.is-read { opacity: .82; }
.nf-head { display: flex; align-items: center; gap: 10px; padding: 8px 14px; background: var(--nf-accent); color: #fff; }
.nf-head-icon { width: 26px; height: 26px; flex-shrink: 0; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, .25); color: #fff; font-size: 12.5px; }
.nf-head h2 { flex: 1; min-width: 0; margin: 0; font-size: 13.5px; font-weight: 700; color: #fff !important; letter-spacing: .01em; text-shadow: 0 1px 1px rgba(0, 0, 0, .12); }
.nf-head-tag { padding: 2px 9px; border-radius: 999px; background: rgba(255, 255, 255, .25); color: #fff; font-size: 11px; font-weight: 700; }
.nf-new { padding: 2px 8px; border-radius: 999px; background: #fff; color: var(--nf-ink, var(--nf-accent)); font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
.nf-body { padding: 12px 16px 12px; }
.nf-message { margin: 0 0 10px; font-size: 13.5px; line-height: 1.55; color: #33475f; }
.nf-card.is-unread .nf-message { color: #142b4a; font-weight: 500; }
.nf-context { margin-bottom: 10px; padding: 10px 12px; border-radius: 10px; border-left: 4px solid var(--nf-accent); background: var(--nf-soft, color-mix(in srgb, var(--nf-accent) 7%, #fff)); }
.nf-context-title { margin: 0 0 2px; font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--nf-ink, var(--nf-accent)); }
.nf-context-text { margin: 0; font-size: 13px; line-height: 1.5; color: #475569; }
.nf-strong { font-weight: 700; color: var(--nf-ink, var(--nf-accent)); }
.nf-cta { display: inline-flex; align-items: center; gap: 8px; margin-top: 8px; height: 32px; padding: 0 14px; border-radius: 9px; background: var(--nf-accent); color: #fff; font-size: 12.5px; font-weight: 700; text-decoration: none; box-shadow: 0 4px 12px color-mix(in srgb, var(--nf-accent) 30%, transparent); transition: transform .15s, filter .15s; }
.nf-cta:hover { filter: brightness(.92); transform: translateY(-1px); }
.nf-cta i { font-size: 11px; }
.nf-approved { display: flex; align-items: center; gap: 12px; }
.nf-seal { width: 44px; height: 44px; flex-shrink: 0; padding: 4px; border-radius: 10px; background: #fff; border: 1px solid #d1eadc; }
.nf-seal img { width: 100%; height: 100%; object-fit: contain; }
.nf-neutral { --nf-accent: #64748b; --nf-ink: #475569; --nf-soft: #f8fafc; }
.nf-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding-top: 10px; border-top: 1px solid #edf2f8; }
.nf-markread { display: inline-flex; align-items: center; gap: 7px; height: 32px; min-height: 32px !important; padding: 0 14px; border: 0; border-radius: 9px; background: #0f172a; color: #fff; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: background .15s, transform .15s; }
.nf-markread:hover { background: #1e40af; }
.nf-markread:active { transform: scale(.97); }
.nf-open { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: #1e40af; transition: gap .15s; }
.nf-open i { font-size: 11px; }
.nf-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; text-align: right; }
.nf-from { font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #94a3b8; }
.nf-meta time { font-size: 12px; font-weight: 600; color: #5b6e86; }
.nf-empty { padding: 56px 24px; text-align: center; background: #fff; border: 1px dashed #c9d7ec; border-radius: 18px; }
.nf-empty-icon { width: 64px; height: 64px; margin: 0 auto 14px; border-radius: 999px; display: flex; align-items: center; justify-content: center; background: #eef3fa; color: #8597ad; font-size: 22px; }
.nf-empty h3 { margin: 0; font-size: 16px; font-weight: 700; color: #142b4a; }
.nf-empty p { margin: 6px 0 16px; font-size: 13.5px; color: #5b6e86; }
@media (max-width: 640px) {
  .nf-tabs { width: 100%; gap: 8px; }
  .nf-head-tag { display: none; }
  .nf-meta { align-items: flex-start; text-align: left; }
}
@media (prefers-reduced-motion: reduce) { .nf-tab, .nf-cta { transition: none; } }
.notif-owner-theme .management-page-header h1 { font-size: clamp(22px, 2.2vw, 28px); font-weight: 700; letter-spacing: -.02em; color: #142b4a; text-transform: none; }
/* Owner / admin inbox: tighter spacing between cards */
.notif-owner-theme .space-y-6 > * + * { margin-top: 12px !important; }
.nf-pager { margin: 0 0 14px; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; }
</style>
