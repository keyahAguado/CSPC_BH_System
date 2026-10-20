<script setup>
import TablePager from '../../components/management/TablePager.vue';
import { confirmTone } from '../../utils/confirmTone.js';
import LoadError from '../../components/management/LoadError.vue';

import '../../styles/management.css';
import '../../styles/admin-theme.css';
import { vManagementDialog } from '../../components/management/dialogAccessibility.js';
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import axios from 'axios';
import OwnerNav from '../../components/partials/OwnerNav.vue';
import { getImageUrl } from '../../config/api';
import { formatAddress } from '../../utils/formatAddress.js';

// States
const user = ref('');
const houses = ref([]);
const stats = ref({
  totalListings: 0,
  pendingBookings: 0
});
const isLoading = ref(true);
const alerts = ref([]);

const token = sessionStorage.getItem('cspc_token');
const savedUser = sessionStorage.getItem('cspc_user');

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

const fetchDashboardData = async () => {
  loadError.value = '';
  if (!token) return;
  try {
    isLoading.value = true;
    const response = await axios.get('/api/owner/dashboard', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      houses.value = response.data.houses || [];
      stats.value = response.data.stats || { totalListings: 0, pendingBookings: 0 };
      user.value = response.data.user || (savedUser ? JSON.parse(savedUser).name : 'Owner');
    }
  } catch (error) {
    loadError.value = 'The server did not return these records. Refresh the page to try again.';
    console.error('Failed to load dashboard data:', error);
    showSystemAlert('Could not load dashboard records. Connecting to backend...', 'warning');
  } finally {
    isLoading.value = false;
  }
};

// Confirmation, Unlist & Reactivation Modal States
const showConfirmModal = ref(false);
const confirmTitle = ref('');
const confirmMessage = ref('');
const confirmAction = ref(null);

const showPauseModal = ref(false);
const pauseHouseId = ref(null);
const pauseReason = ref('Fully Booked / At Capacity');
const customPauseReason = ref('');
const isArchiving = ref(false);

const showReactivateBlockedModal = ref(false);
const blockedHouseId = ref(null);
const blockedErrorMessage = ref('');

// Toggle to show/hide archived listings on the dashboard
const listingFilter = ref('active'); // 'all' | 'active' | 'archived'

// Filtered house list based on filter tab
const visibleHouses = computed(() => {
  if (listingFilter.value === 'archived') return houses.value.filter(h => h.house_status === 'archived');
  if (listingFilter.value === 'active') return houses.value.filter(h => h.house_status !== 'archived');
  return houses.value; // 'all'
});

// One property at a time: the tabs list the properties on the current page (admin-style pager),
// and the card shows the selected one
const SELECTED_KEY = 'cspc_owner_selected_property';
const readSelected = () => { try { return localStorage.getItem(SELECTED_KEY) || ''; } catch { return ''; } };
const selectedHouseId = ref(readSelected());
const propPage = ref(1);
const propPerPage = ref(10);
const propTotalPages = computed(() => Math.max(1, Math.ceil(visibleHouses.value.length / propPerPage.value)));
const propStart = computed(() => (visibleHouses.value.length ? (propPage.value - 1) * propPerPage.value + 1 : 0));
const propEnd = computed(() => Math.min(propPage.value * propPerPage.value, visibleHouses.value.length));
const tabHouses = computed(() => visibleHouses.value.slice(propStart.value - 1, propEnd.value));
const shownHouse = computed(() => tabHouses.value.find(h => String(h.id) === String(selectedHouseId.value)) || tabHouses.value[0] || null);
const shownIndex = computed(() => visibleHouses.value.indexOf(shownHouse.value));
const selectHouse = (id) => {
  selectedHouseId.value = String(id);
  try { localStorage.setItem(SELECTED_KEY, String(id)); } catch { /* storage unavailable: choice lasts this visit */ }
  const i = visibleHouses.value.findIndex(h => String(h.id) === String(id));
  if (i >= 0) propPage.value = Math.floor(i / propPerPage.value) + 1;
};
const stepHouse = (step) => {
  const next = visibleHouses.value[shownIndex.value + step];
  if (next) selectHouse(next.id);
};
// Open on the page that holds the remembered property; keep the page valid when the filter changes
watch([visibleHouses, propPerPage], () => {
  const i = visibleHouses.value.findIndex(h => String(h.id) === String(selectedHouseId.value));
  propPage.value = i >= 0 ? Math.floor(i / propPerPage.value) + 1 : Math.min(propPage.value, propTotalPages.value);
});

// Count of archived houses (drives the filter badge)
const archivedCount = computed(() =>
  houses.value.filter(h => h.house_status === 'archived').length
);

// Welcome banner summary
const accreditedCount = computed(() => houses.value.filter(h => h.house_status === 'accredited').length);
const attentionCount = computed(() => houses.value.filter(h => h.house_status === 'rejected' || h.house_status === 'archived' || h.compliance === 'warning').length);
const summaryLine = computed(() => {
  if (!houses.value.length) return 'Register your first boarding house to start receiving bookings from CSPC students.';
  const parts = [`${accreditedCount.value} of ${houses.value.length} ${houses.value.length === 1 ? 'property is' : 'properties are'} listed for students`];
  if (stats.value.pendingBookings) parts.push(`${stats.value.pendingBookings} booking ${stats.value.pendingBookings === 1 ? 'request needs' : 'requests need'} your decision`);
  else if (attentionCount.value) parts.push(`${attentionCount.value} ${attentionCount.value === 1 ? 'property needs' : 'properties need'} attention`);
  return parts.join(' · ') + '.';
});
const firstName = computed(() => String(user.value || 'Owner').trim().split(/\s+/)[0]);

const isExpiredArchive = (h) => h.house_status === 'archived' && (h.archived_by === 'system' || h.compliance === 'expired' || h.compliance_status === 'expired');
const statusMeta = (h) => {
  if (h.house_status === 'pending') return { label: 'Pending approval', tone: 'warning', icon: 'fa-hourglass-half' };
  if (h.house_status === 'rejected') return { label: 'Rejected', tone: 'danger', icon: 'fa-circle-xmark' };
  if (isExpiredArchive(h)) return { label: 'Inactive · permits expired', tone: 'danger', icon: 'fa-ban' };
  if (h.house_status === 'archived' && h.archived_by === 'owner') return { label: 'Unlisted by you', tone: 'neutral', icon: 'fa-eye-slash' };
  if (h.house_status === 'archived') return { label: 'Suspended by SASO', tone: 'neutral', icon: 'fa-box-archive' };
  if (h.compliance === 'warning') return { label: 'Renew permits soon', tone: 'expiry', icon: 'fa-clock' };
  return { label: 'Accredited', tone: 'success', icon: 'fa-circle-check' };
};

// Welcome banner, attention list and property facts
const PERMIT_EXPIRY_FIELDS = ['business_form', 'barangay', 'sanitary', 'fire'].map(k => 'expiry_permit_' + k);
const nextPermitExpiry = (h) => {
  const dates = PERMIT_EXPIRY_FIELDS.map(f => h[f]).filter(Boolean).map(v => new Date(v)).filter(d => !Number.isNaN(d.getTime()));
  if (!dates.length) return null;
  return new Date(Math.min(...dates.map(d => d.getTime())));
};
const formatDay = (d) => d ? d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
// Days until the earliest required permit expires (negative once expired), counted in calendar days
const permitDaysLeft = (h) => {
  const d = nextPermitExpiry(h);
  if (!d) return null;
  const today = new Date();
  const startOf = (x) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  return Math.round((startOf(d) - startOf(today)) / 86400000);
};
const permitCountdown = (h) => {
  const days = permitDaysLeft(h);
  if (days === null) return '';
  if (days < 0) return `Expired ${-days} ${days === -1 ? 'day' : 'days'} ago`;
  if (days === 0) return 'Expires today';
  return `${days} ${days === 1 ? 'day' : 'days'} left`;
};
const permitTone = (h) => {
  const days = permitDaysLeft(h);
  if (days === null) return 'none';
  if (days <= 0) return 'danger';
  if (days <= 30) return 'warn';
  return 'ok';
};
const formatPeso =(v) => (Number(v) > 0 ? '₱' + Number(v).toLocaleString('en-PH', { maximumFractionDigits: 0 }) : null);

// Keep showArchived as an alias for backward-compat with any other refs
const showArchived = computed(() => listingFilter.value === 'archived');

// Optional doc info pop-up
const showSuppModal = ref(false);
const suppModalStatus = ref('');

const openSuppModal = (status) => {
  suppModalStatus.value = status;
  showSuppModal.value = true;
};

const canReactivateListing = (house) => house.house_status === 'archived'
  && house.archived_by === 'owner'
  && house.status_before_archive === 'accredited'
  && house.compliance !== 'expired'
  && !house.admin_comments;

// Reactivation confirmation modal
const showReactivateConfirmModal = ref(false);
const pendingReactivateHouseId = ref(null);

const openReactivateConfirm = (houseId) => {
  pendingReactivateHouseId.value = houseId;
  showReactivateConfirmModal.value = true;
};

const closeReactivateConfirmModal = () => {
  showReactivateConfirmModal.value = false;
  pendingReactivateHouseId.value = null;
};

const triggerConfirm = (title, message, action) => {
  confirmTitle.value = title;
  confirmMessage.value = message;
  confirmAction.value = action;
  showConfirmModal.value = true;
};

const executeConfirm = async () => {
  showConfirmModal.value = false;
  if (confirmAction.value) {
    await confirmAction.value();
    confirmAction.value = null;
  }
};

const openPauseModal = (houseId) => {
  pauseHouseId.value = houseId;
  pauseReason.value = 'Fully Booked / At Capacity';
  customPauseReason.value = '';
  showPauseModal.value = true;
};

const closePauseModal = () => {
  showPauseModal.value = false;
  pauseHouseId.value = null;
};

const closeReactivateBlockedModal = () => {
  showReactivateBlockedModal.value = false;
  blockedHouseId.value = null;
  blockedErrorMessage.value = '';
};

const handlePauseListing = async () => {
  if (!pauseHouseId.value) return;
  const reasonToSave = pauseReason.value === 'Other' ? customPauseReason.value : pauseReason.value;
  try {
    isArchiving.value = true;
    const response = await axios.delete(`/api/owner/boarding-houses/${pauseHouseId.value}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { reason: reasonToSave || 'Unlisted by Landlord' }
    });

    if (response.data.success) {
      showSystemAlert('Boarding house unlisted & archived. Active boarders remain tracked.', 'success');
      closePauseModal();
      fetchDashboardData();
    }
  } catch (error) {
    console.error('Error archiving boarding house:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to unlist listing.', 'error');
  } finally {
    isArchiving.value = false;
  }
};

const execReactivateHouse = async () => {
  const houseId = pendingReactivateHouseId.value;
  closeReactivateConfirmModal();
  if (!houseId) return;
  try {
    const response = await axios.post(`/api/owner/boarding-houses/reactivate/${houseId}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      showSystemAlert('Boarding house reactivated successfully! Listing is now active.', 'success');
      fetchDashboardData();
    }
  } catch (error) {
    console.error('Error reactivating boarding house:', error);
    const msg = error.response?.data?.message || 'Reactivation blocked by system compliance.';
    blockedHouseId.value = houseId;
    blockedErrorMessage.value = msg;
    showReactivateBlockedModal.value = true;
    // Refresh dashboard so card states reflect the compliance evaluation that ran
    // (e.g. archived_by may have changed from 'owner' to 'system' if permits expired)
    fetchDashboardData();
  }
};

const preventBackNavigation = () => {
  window.history.pushState(null, null, window.location.href);
};

onMounted(() => {
  window.history.pushState(null, null, window.location.href);
  window.addEventListener('popstate', preventBackNavigation);
  if (savedUser) {
    user.value = JSON.parse(savedUser).name;
  }
  fetchDashboardData();
});

onUnmounted(() => {
  window.removeEventListener('popstate', preventBackNavigation);
});

const loadError = ref('');
</script>

<template>
  <div class="admin-shell owner-dashboard">
    <OwnerNav />

    <!-- Alert Panel -->
    <div class="fixed top-20 right-6 z-[9999] max-w-sm w-full px-4 pointer-events-none space-y-3">
      <div v-for="alert in alerts" :key="alert.id"
           class="pointer-events-auto relative flex items-stretch bg-white border-l-4 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] rounded-r-xl overflow-hidden"
           :class="alert.borderClass">
        <div class="px-4 flex items-center justify-center bg-slate-50/60">
          <i class="fa-solid text-lg" :class="[alert.iconClass, alert.iconColorClass]"></i>
        </div>
        <div class="flex-1 p-4 pr-8 text-left">
          <h4 class="text-[14px] font-bold text-slate-500 mb-0.5">{{ alert.title }}</h4>
          <p class="text-[13px] font-semibold text-slate-700 leading-relaxed">{{ alert.message }}</p>
        </div>
        <button aria-label="Close" @click="closeAlert(alert.id)" class="absolute top-2.5 right-2.5 text-slate-300 hover:text-slate-700 transition-colors">
          <i class="fa-solid fa-xmark text-xs"></i>
        </button>
      </div>
    </div>

    <main id="management-content" tabindex="-1">
      <LoadError :message="loadError" />

      <section class="od-welcome" aria-label="Welcome">
        <div class="od-welcome-text">
          <p class="od-welcome-eyebrow"><span class="od-portal"><i class="fa-solid fa-house-user" aria-hidden="true"></i> Owner portal</span></p>
          <h1>Welcome back, {{ firstName }}</h1>
          <p class="od-welcome-summary">{{ isLoading ? 'Loading your properties…' : summaryLine }}</p>
        </div>
        <div class="od-welcome-actions">
          <router-link to="/owner/accreditation?new=true" class="od-btn-gold"><i class="fa-solid fa-plus" aria-hidden="true"></i> Register a property</router-link>
          <router-link to="/owner/bookings" class="od-btn-glass"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i> View bookings</router-link>
        </div>
      </section>

      <div v-if="!isLoading && stats.pendingBookings > 0" class="od-alert" role="status">
        <span class="od-alert-icon" aria-hidden="true"><i class="fa-solid fa-clipboard-list"></i></span>
        <p>{{ stats.pendingBookings }} booking {{ stats.pendingBookings === 1 ? 'request needs' : 'requests need' }} your decision</p>
        <router-link to="/owner/bookings" class="od-btn-navy">Review {{ stats.pendingBookings === 1 ? 'booking' : 'bookings' }} <i class="fa-solid fa-chevron-right" aria-hidden="true"></i></router-link>
      </div>

      <div v-if="isLoading" class="od-panel od-loading" role="status">
        <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading your dashboard…
      </div>

      <template v-else>
        <section class="od-section" aria-labelledby="od-props-title">
          <div class="od-section-head">
            <div>
              <h2 id="od-props-title">{{ houses.length === 1 ? 'Your property' : 'Your properties' }}</h2>
              <p>{{ houses.length - archivedCount }} active boarding {{ houses.length - archivedCount === 1 ? 'house' : 'houses' }}<template v-if="archivedCount"> · {{ archivedCount }} archived</template></p>
            </div>
            <div v-if="houses.length > 1" class="od-tabs" role="tablist" aria-label="Filter properties">
              <button type="button" role="tab" :aria-selected="listingFilter === 'all'" :class="{ active: listingFilter === 'all' }" @click="listingFilter = 'all'">All <span>{{ houses.length }}</span></button>
              <button type="button" role="tab" :aria-selected="listingFilter === 'active'" :class="{ active: listingFilter === 'active' }" @click="listingFilter = 'active'">Active <span>{{ houses.length - archivedCount }}</span></button>
              <button type="button" role="tab" :aria-selected="listingFilter === 'archived'" :class="{ active: listingFilter === 'archived' }" @click="listingFilter = 'archived'">Archived <span>{{ archivedCount }}</span></button>
            </div>
          </div>

          <div v-if="visibleHouses.length" class="od-pager"><TablePager position="top" noun="properties" :page="propPage" @update:page="propPage = $event" :total-pages="propTotalPages" :start="propStart" :end="propEnd" :total="visibleHouses.length" :per-page="propPerPage" @update:per-page="propPerPage = $event; propPage = 1" /></div>
          <!-- Property switcher: one property is shown at a time (shown even with a single property) -->
          <div v-if="visibleHouses.length" class="od-switcher">
            <div class="od-switch-tabs" role="tablist" aria-label="Choose a property">
              <button v-for="h in tabHouses" :key="h.id" type="button" role="tab"
                      :aria-selected="shownHouse?.id === h.id" :class="['od-switch-tab', { 'is-active': shownHouse?.id === h.id }]"
                      @click="selectHouse(h.id)">
                <img :src="getImageUrl(h.img)" alt="" @error="e => e.target.src = '/img/cspc_bg.webp'" />
                <span class="od-switch-text">
                  <span class="od-switch-name">{{ h.name }}</span>
                  <span :class="['od-switch-status', 'is-' + statusMeta(h).tone]"><span class="od-switch-dot" aria-hidden="true"></span>{{ statusMeta(h).label }}</span>
                </span>
                <span v-if="h.pending_count > 0" class="od-switch-count" :aria-label="h.pending_count + ' pending requests'">{{ h.pending_count }}</span>
              </button>
            </div>
            <div class="od-switch-nav">
              <span>Property {{ shownIndex + 1 }} of {{ visibleHouses.length }}</span>
              <button type="button" aria-label="Previous property" :disabled="shownIndex <= 0" @click="stepHouse(-1)"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
              <button type="button" aria-label="Next property" :disabled="shownIndex >= visibleHouses.length - 1" @click="stepHouse(1)"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
            </div>
          </div>

          <div v-if="visibleHouses.length" class="od-list">
            <article v-for="house in (shownHouse ? [shownHouse] : [])" :key="house.id" class="od-card">
              <div class="od-media" :class="{ 'is-muted': house.house_status === 'archived' || house.house_status === 'rejected' }">
                <img class="od-media-photo" :src="getImageUrl(house.img)" :alt="house.name" @error="e => e.target.src = '/img/cspc_bg.webp'" />
                <span :class="['od-status', 'od-status-overlay', 'is-' + statusMeta(house).tone]"><i :class="['fa-solid', statusMeta(house).icon]" aria-hidden="true"></i>{{ statusMeta(house).label }}</span>
                <span v-if="house.pending_count > 0" class="od-media-pending"><i class="fa-solid fa-bell" aria-hidden="true"></i> {{ house.pending_count }} pending</span>
              </div>

              <div class="od-body">
                <div class="od-title-row">
                  <h3 class="od-name">{{ house.name }}</h3>
                  <span v-if="house.reference_no" class="od-ref" title="Property reference number">#{{ house.reference_no }}</span>
                </div>
                <p class="od-address"><i class="fa-solid fa-location-dot" aria-hidden="true"></i>{{ formatAddress(house) }}</p>

                <dl class="od-stats">
                  <div>
                    <span class="od-stat-icon" aria-hidden="true"><i class="fa-solid fa-peso-sign"></i></span>
                    <div>
                      <dt>Monthly rate</dt>
                      <dd>{{ formatPeso(house.price) ? formatPeso(house.price) : '—' }}<small v-if="formatPeso(house.price)"> / month</small></dd>
                    </div>
                  </div>
                  <div>
                    <span class="od-stat-icon" aria-hidden="true"><i class="fa-solid fa-door-open"></i></span>
                    <div>
                      <dt>Rooms</dt>
                      <dd>{{ Number(house.room_count ?? house.rooms) > 0 ? Number(house.room_count ?? house.rooms) : '—' }}</dd>
                    </div>
                  </div>
                  <div :class="['is-permit', 'is-' + permitTone(house)]">
                    <span class="od-stat-icon" aria-hidden="true"><i class="fa-solid fa-file-shield"></i></span>
                    <div>
                      <dt>Permits valid until</dt>
                      <dd>{{ nextPermitExpiry(house) ? formatDay(nextPermitExpiry(house)) : '—' }}</dd>
                      <span v-if="nextPermitExpiry(house)" class="od-stat-sub">{{ permitCountdown(house) }}</span>
                    </div>
                  </div>
                </dl>

                <!-- Status note (one per state) -->
                <div v-if="isExpiredArchive(house)" class="od-note is-danger">
                  <p>Hidden from students — required permits expired. Renew them to reactivate the listing.</p>
                  <router-link :to="`/owner/documents/${house.id}`" class="admin-link">Upload renewed permits <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></router-link>
                </div>
                <div v-else-if="house.house_status === 'archived' && house.archived_by === 'owner'" class="od-note">
                  <p>You unlisted this property<template v-if="house.archive_reason"> ({{ house.archive_reason }})</template>. Students can't see it.</p>
                </div>
                <div v-else-if="house.house_status === 'archived'" class="od-note">
                  <p>Suspended by SASO<template v-if="house.admin_comments">: “{{ house.admin_comments }}”</template>. Upload updated documents to request re-accreditation.</p>
                  <router-link :to="`/owner/documents/${house.id}`" class="admin-link">Upload updated documents <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></router-link>
                </div>
                <div v-else-if="house.house_status === 'rejected'" class="od-note is-danger">
                  <p>Rejected by SASO and hidden from students. Review the feedback and resubmit.</p>
                </div>
                <div v-else-if="house.house_status === 'pending'" class="od-note is-warning">
                  <p>Waiting for SASO to review your application.</p>
                </div>
                <div v-else-if="house.compliance === 'warning'" class="od-note is-warning is-expiry">
                  <p>Some permits expire soon. Upload renewed copies to stay listed.</p>
                  <router-link :to="`/owner/documents/${house.id}`" class="admin-link">Renew permits <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></router-link>
                </div>

                <div v-if="house.document_update_pending || (house.compliance !== 'warning' && house.supplementary_status && house.supplementary_status !== 'active')" class="od-chips">
                  <span v-if="house.document_update_pending" class="admin-badge is-warning"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Document update under review</span>
                  <button v-if="house.compliance !== 'warning' && house.supplementary_status && house.supplementary_status !== 'active'" type="button"
                          class="admin-badge is-neutral od-chip-btn" @click="openSuppModal(house.supplementary_status)">
                    <i class="fa-solid fa-circle-info" aria-hidden="true"></i>{{ house.supplementary_status === 'expired' ? 'Optional doc expired' : 'Optional doc expiring' }}
                  </button>
                </div>

                <div class="od-actions">
                  <router-link v-if="house.house_status === 'rejected'" :to="`/owner/documents/${house.id}`" class="od-act is-danger">
                    <i class="fa-solid fa-wrench" aria-hidden="true"></i> Fix &amp; resubmit
                  </router-link>
                  <template v-else>
                    <router-link :to="`/owner/rooms/${house.id}`" class="od-act is-primary od-act-rooms">
                      Manage rooms
                      <span v-if="house.pending_count > 0" class="od-count" :aria-label="house.pending_count + ' pending requests'">{{ house.pending_count }}</span>
                    </router-link>
                    <router-link :to="`/owner/documents/${house.id}`" class="od-act od-act-docs"><i class="fa-regular fa-file-lines" aria-hidden="true"></i> Documents</router-link>
                    <router-link :to="`/owner/edit/${house.id}`" class="od-act od-act-edit"><i class="fa-solid fa-pen" aria-hidden="true"></i> Edit property</router-link>
                  </template>
                </div>
                <div v-if="house.house_status !== 'rejected'" class="od-foot">
                  <button v-if="house.house_status === 'accredited'" type="button" class="od-pause" @click="openPauseModal(house.id)">Pause / unlist listing</button>
                  <button v-else-if="canReactivateListing(house)" type="button" class="od-act od-reactivate" @click="openReactivateConfirm(house.id)">
                    <i class="fa-solid fa-play" aria-hidden="true"></i> Reactivate listing
                  </button>
                  <p v-else-if="house.house_status === 'archived'" class="od-hint">Contact SASO for review before reactivation.</p>
                </div>
              </div>
            </article>
          </div>
          <div v-if="visibleHouses.length" class="od-pager is-bottom"><TablePager position="bottom" noun="properties" :page="propPage" @update:page="propPage = $event" :total-pages="propTotalPages" :start="propStart" :end="propEnd" :total="visibleHouses.length" :per-page="propPerPage" @update:per-page="propPerPage = $event; propPage = 1" /></div>

          <div v-else class="od-panel od-empty">
            <i class="fa-regular fa-folder-open" aria-hidden="true"></i>
            <p class="od-empty-title">{{ houses.length === 0 ? 'No properties yet' : 'No properties in this view' }}</p>
            <p>{{ houses.length === 0 ? 'Register your first boarding house to get started.' : 'Try another filter.' }}</p>
            <router-link v-if="houses.length === 0" to="/owner/accreditation?new=true" class="od-act is-primary"><i class="fa-solid fa-plus" aria-hidden="true"></i> Register a property</router-link>
            <button v-else type="button" class="od-act" @click="listingFilter = 'all'">Show all ({{ houses.length }})</button>
          </div>
        </section>

        <p class="od-tip"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Keep your property information and documents up to date.</p>
      </template>
    </main>

    <!-- Optional Document Info Modal -->
    <div v-management-dialog="{ close: () => showSuppModal = false }" v-if="showSuppModal" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[250] flex items-center justify-center p-4" @click.self="showSuppModal = false">
      <div class="popup-panel bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-100 overflow-hidden">
        <div class="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
              <i class="fa-solid fa-circle-info text-slate-500"></i>
            </div>
            <h3 class="text-[12px] font-semibold text-slate-700 uppercase tracking-wide">Optional Document</h3>
          </div>
          <button aria-label="Close dialog" @click="showSuppModal = false" class="text-slate-300 hover:text-slate-600 transition cursor-pointer">
            <i class="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>
        <div class="px-6 py-5">
          <p class="text-[13px] font-medium text-slate-900 leading-relaxed popup-message">
            <template v-if="suppModalStatus === 'expired'">
              An optional document (e.g. Cedula, DTI, Building Inspection, or Zoning Clearance) has expired. <strong class="text-slate-800">Your listing stays visible and bookable</strong> — these are non-critical documents that don't affect your accreditation status. Renew it when convenient.
            </template>
            <template v-else>
              An optional document is expiring soon. <strong class="text-slate-800">No action needed yet</strong> — this will not affect your listing or accreditation status. You may upload a renewed copy in advance under <strong>Docs</strong>.
            </template>
          </p>
        </div>
        <div class="px-6 pb-5">
          <button @click="showSuppModal = false"
                  class="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-[12px] font-semibold py-2.5 rounded-xl uppercase tracking-wide transition cursor-pointer management-button">
            Got it
          </button>
        </div>
      </div>
    </div>

    <!-- Pause / Unlist Listing Modal -->
    <div v-management-dialog="{ close: () => closePauseModal() }" v-if="showPauseModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div class="popup-panel bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">

        <!-- Modal Header -->
        <div class="bg-amber-50 border-b border-amber-100 px-7 py-5 flex items-center gap-4">
          <div class="w-11 h-11 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
            <i class="fa-solid fa-eye-slash text-amber-500 text-lg"></i>
          </div>
          <div>
            <h3 class="text-sm font-semibold text-slate-900 uppercase tracking-tight leading-tight">Pause / Unlist Boarding House</h3>
            <p class="text-[12px] font-bold text-amber-600 uppercase tracking-wide mt-0.5">Listing will be hidden from students</p>
          </div>
        </div>

        <!-- Modal Body -->
        <div class="px-7 py-6 space-y-5">
          <!-- Info notice -->
          <div class="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <i class="fa-solid fa-circle-info text-slate-400 text-sm mt-0.5 shrink-0"></i>
            <p class="text-[12px] font-medium text-slate-900 leading-relaxed popup-message">
              Your listing will be hidden from student search. Active boarders remain tracked and unaffected. You can reactivate any time.
            </p>
          </div>

          <!-- Reason Select -->
          <div>
            <label class="block text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Reason for Pausing <span class="text-red-500">*</span>
            </label>
            <select aria-label="Reason for Pausing" v-model="pauseReason" class="w-full bg-white border border-slate-200 hover:border-amber-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 p-3 rounded-xl text-[12px] font-bold text-slate-700 outline-none cursor-pointer transition">
              <option value="Fully Booked / At Capacity">Fully Booked / At Capacity</option>
              <option value="Renovation & Upgrades">Renovation &amp; Upgrades</option>
              <option value="End of Semester / Vacation Break">End of Semester / Vacation Break</option>
              <option value="Personal / Landlord Break">Personal / Landlord Break</option>
              <option value="Other">Other (specify below)</option>
            </select>
          </div>

          <!-- Custom reason input -->
          <div v-if="pauseReason === 'Other'">
            <label class="block text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Specify Reason</label>
            <input aria-label="Specify Reason" v-model="customPauseReason" type="text" placeholder="e.g. Temporary structural repair"
                   class="w-full bg-white border border-slate-200 hover:border-amber-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 p-3 rounded-xl text-[12px] font-bold text-slate-700 outline-none transition" />
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="px-7 pb-6 flex gap-3">
          <button @click="handlePauseListing" :disabled="isArchiving"
                  class="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-[12px] font-semibold py-3 rounded-xl uppercase tracking-wide transition shadow-sm cursor-pointer flex items-center justify-center gap-2 management-button">
            <i class="fa-solid fa-eye-slash text-[12px]"></i>
            {{ isArchiving ? 'Pausing...' : 'Confirm Pause' }}
          </button>
          <button @click="closePauseModal"
                  class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[12px] font-semibold py-3 rounded-xl uppercase tracking-wide transition cursor-pointer management-button">
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Reactivate Listing Confirmation Modal -->
    <div v-management-dialog="{ close: () => closeReactivateConfirmModal() }" v-if="showReactivateConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div class="popup-panel bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">

        <!-- Modal Header -->
        <div class="bg-emerald-50 border-b border-emerald-100 px-7 py-5 flex items-center gap-4">
          <div class="w-11 h-11 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
            <i class="fa-solid fa-play text-emerald-600 text-lg"></i>
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900 leading-tight">Reactivate Listing</h3>
            <p class="text-[13px] font-medium text-emerald-600 mt-0.5">Make listing visible to students again</p>
          </div>
        </div>

        <!-- Modal Body -->
        <div class="px-7 py-6">
          <div class="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <i class="fa-solid fa-circle-info text-slate-400 text-sm mt-0.5 shrink-0"></i>
            <p class="text-[13px] font-medium text-slate-900 leading-relaxed popup-message">
              This will make your boarding house visible to students again in the public listing. The system will verify your permits before reactivation — if any required permits have expired, you will be notified.
            </p>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="px-7 pb-6 flex gap-3">
          <button @click="execReactivateHouse"
                  class="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[13px] font-semibold py-3 rounded-xl transition shadow-sm cursor-pointer flex items-center justify-center gap-2 management-button">
            <i class="fa-solid fa-play text-[12px]"></i> Confirm Reactivate
          </button>
          <button @click="closeReactivateConfirmModal"
                  class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[13px] font-semibold py-3 rounded-xl transition cursor-pointer management-button">
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Reactivation Blocked (Expired Permits) Pop-Up Modal -->
    <div v-management-dialog="{ close: () => closeReactivateBlockedModal() }" v-if="showReactivateBlockedModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div class="popup-panel bg-white rounded-[2rem] shadow-2xl p-8 max-w-md w-full text-center border border-slate-100 animate-in zoom-in-95 duration-200">
        <div class="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl shadow-inner">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <h3 class="text-xl font-semibold text-slate-900 uppercase tracking-tight mb-2">Cannot Reactivate Listing</h3>
        <p class="text-slate-900 text-[13px] font-medium leading-relaxed mb-6 bg-red-50/80 border border-red-100 p-4 rounded-xl text-left popup-message">
          {{ blockedErrorMessage }}
        </p>
        <div class="flex flex-col gap-3">
          <router-link v-if="blockedHouseId" :to="`/owner/documents/${blockedHouseId}`" 
                       class="w-full bg-red-600 hover:bg-slate-900 text-white text-[12px] font-semibold py-3.5 rounded-xl uppercase tracking-wide transition shadow-md text-center management-button">
            Upload Renewed Permits
          </router-link>
          <button @click="closeReactivateBlockedModal" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-[12px] font-semibold py-3.5 rounded-xl uppercase tracking-wide transition cursor-pointer management-button">
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Custom Confirmation Modal -->
    <div v-management-dialog="{ close: () => showConfirmModal = false }" v-if="showConfirmModal" class="cm-backdrop">
      <div class="cm-panel popup-panel" role="dialog" aria-modal="true">
        <div class="cm-body">
          <span :class="['cm-icon', confirmTone(confirmTitle).tone]" aria-hidden="true"><i :class="['fa-solid', confirmTone(confirmTitle).icon]"></i></span>
          <div><h3 class="cm-title">{{ confirmTitle }}</h3><p class="cm-message popup-message">{{ confirmMessage }}</p></div>
        </div>
        <div class="cm-actions">
          <button type="button" class="cm-btn cm-cancel" @click="showConfirmModal = false">Cancel</button>
          <button type="button" :class="['cm-btn', confirmTone(confirmTitle).button]" @click="executeConfirm">Remove</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Property switcher: tabs for the first properties, a dropdown for the rest, arrows to step through */
.od-switcher { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.od-switch-tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
.od-switch-tab { display: inline-flex; align-items: center; gap: 10px; max-width: 260px; min-height: 0 !important; padding: 6px 12px 6px 6px; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; text-align: left; cursor: pointer; transition: border-color .15s, box-shadow .15s, background .15s; }
.od-switch-tab:hover { border-color: #bfdbfe; background: #f8fbff; }
.od-switch-tab.is-active { border-color: #1e4a8d; background: #eff6ff; box-shadow: 0 0 0 3px rgba(30, 74, 141, .12); }
.od-switch-tab img { width: 40px; height: 40px; flex-shrink: 0; border-radius: 9px; object-fit: cover; background: #e2e8f0; }
.od-switch-text { display: flex; flex-direction: column; min-width: 0; }
.od-switch-name { font-size: 13.5px; font-weight: 700; color: #142b4a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.od-switch-status { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600; color: #64748b; white-space: nowrap; }
.od-switch-dot { width: 7px; height: 7px; border-radius: 999px; background: currentColor; }
.od-switch-status.is-success { color: #15803d; }
.od-switch-status.is-warning, .od-switch-status.is-expiry { color: #b45309; }
.od-switch-status.is-danger { color: #b91c1c; }
.od-switch-count { flex-shrink: 0; min-width: 20px; padding: 0 6px; border-radius: 999px; background: #f59e0b; color: #fff; font-size: 11px; font-weight: 700; line-height: 20px; text-align: center; }
.od-pager { margin-bottom: 12px; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; }
.od-pager.is-bottom { margin: 12px 0 0; }
.od-switch-nav { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #64748b; }
.od-switch-nav span { margin-right: 4px; }
.od-switch-nav button { width: 34px; height: 34px; min-height: 34px !important; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #e2e8f0; border-radius: 9px; background: #fff; color: #1e4a8d; cursor: pointer; }
.od-switch-nav button:hover:not(:disabled) { background: #eff6ff; }
.od-switch-nav button:disabled { opacity: .4; cursor: default; }

/* Owner dashboard — CSPC navy / blue / gold, Plus Jakarta Sans (tokens from admin-theme.css) */
.od-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 16px 24px; margin-bottom: 20px; }
.od-head h1 { margin: 0; font-size: clamp(24px, 2.4vw, 30px) !important; font-weight: 700 !important; color: var(--a-heading) !important; letter-spacing: -.02em; line-height: 1.2; }
.od-head p { margin: 6px 0 0; font-size: 14px; color: var(--a-muted); }
.od-btn-outline { display: inline-flex; align-items: center; gap: 10px; min-height: 42px; padding: 0 18px; border-radius: 10px; border: 1.5px solid var(--a-heading); background: #fff; color: var(--a-heading); font-size: 13.5px; font-weight: 600; text-decoration: none; transition: background .15s, color .15s; }
.od-btn-outline:hover { background: var(--a-heading); color: #fff; }
.od-btn-navy { flex-shrink: 0; display: inline-flex; align-items: center; gap: 10px; min-height: 38px; padding: 0 16px; border-radius: 8px; background: var(--a-heading); color: #fff; font-size: 13px; font-weight: 600; text-decoration: none; transition: background .15s; }
.od-btn-navy:hover { background: var(--a-primary); }
.od-btn-navy i { font-size: 11px; }

.od-alert { display: flex; align-items: center; gap: 14px; padding: 10px 10px 10px 14px; margin-bottom: 24px; border-radius: 12px; background: #fdf3dc; border: 1px solid #f3e1ad; }
.od-alert-icon { width: 32px; height: 32px; flex-shrink: 0; border-radius: 999px; background: var(--a-gold); color: #142b4a; display: flex; align-items: center; justify-content: center; font-size: 14px; }
.od-alert p { flex: 1; min-width: 0; margin: 0; font-size: 14px; font-weight: 500; color: var(--a-heading); }

.od-section-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.od-section-head h2 { margin: 0; font-size: 20px !important; font-weight: 700 !important; color: var(--a-heading) !important; letter-spacing: -.01em; }
.od-section-head p { margin: 2px 0 0; font-size: 13px; color: var(--a-muted); }
.od-tabs { display: inline-flex; padding: 3px; border-radius: 10px; background: var(--a-track); }
.od-tabs button { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--a-muted); border: 0; background: transparent; cursor: pointer; }
.od-tabs button span { min-width: 20px; padding: 0 6px; border-radius: 999px; background: var(--a-surface); color: var(--a-muted); font-size: 11px; line-height: 18px; text-align: center; }
.od-tabs button.active { background: var(--a-surface); color: var(--a-heading); box-shadow: 0 1px 3px rgba(20, 43, 74, .12); }
.od-tabs button.active span { background: var(--a-heading); color: #fff; }

.od-list { display: flex; flex-direction: column; gap: 16px; }
.od-card { display: grid; grid-template-columns: minmax(0, 46%) minmax(0, 1fr); gap: 20px; padding: 12px; background: #fff; border: 1px solid var(--a-border); border-radius: 14px; box-shadow: 0 1px 2px rgba(20, 43, 74, .04); }
.od-media { position: relative; min-height: 200px; border-radius: 10px; overflow: hidden; background: var(--a-surface-2); }
.od-media img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.od-media img.is-muted { filter: grayscale(.6) brightness(.9); }
.od-body { min-width: 0; display: flex; flex-direction: column; padding: 8px 8px 4px 0; }
.od-title-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.od-name { margin: 0; font-size: 22px !important; font-weight: 700 !important; color: var(--a-heading) !important; letter-spacing: -.02em; line-height: 1.25; }
.od-status { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.od-status.is-success { background: #e3f6ea; color: #1d7a45; }
.od-status.is-warning { background: var(--a-warning-soft); color: var(--a-warning); }
.od-status.is-danger { background: var(--a-danger-soft); color: var(--a-danger); }
.od-status.is-neutral { background: var(--a-surface-2); color: var(--a-muted); }
.od-address { margin: 10px 0 0; display: flex; gap: 8px; font-size: 13px; color: var(--a-muted); line-height: 1.4; }
.od-address i { color: var(--a-faint); margin-top: 2px; font-size: 12px; }
.od-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 18px 0 0; padding-bottom: 16px; border-bottom: 1px solid var(--a-border); }
.od-stats > div + div { padding-left: 24px; border-left: 1px solid var(--a-border); }
.od-stats dt { font-size: 12.5px; color: var(--a-muted); }
.od-stats dd { margin: 4px 0 0; font-size: 17px; font-weight: 700; color: var(--a-heading); }
.od-stats dd.is-warn { color: var(--a-warning); }
.od-note { margin-top: 12px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.od-note p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--a-text); }
.od-note.is-warning p { color: var(--a-warning); }
.od-note.is-danger p { color: var(--a-danger); }
.od-note .admin-link { font-size: 13px; }
.od-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.od-chip-btn { cursor: pointer; font-family: inherit; }

.od-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
.od-act { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; padding: 0 18px; border-radius: 8px; border: 1.5px solid var(--a-heading); background: #fff; color: var(--a-heading); font-family: inherit; font-size: 13px; font-weight: 600; text-decoration: none; cursor: pointer; transition: background .15s, color .15s, border-color .15s; }
.od-act:hover { background: #eef3fa; }
.od-act.is-primary { background: var(--a-heading); color: #fff; }
.od-act.is-primary:hover { background: var(--a-primary); border-color: var(--a-primary); }
.od-act.is-danger { background: var(--a-danger); border-color: var(--a-danger); color: #fff; }
.od-count { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: var(--a-gold); color: #142b4a; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.od-foot { display: flex; justify-content: flex-end; margin-top: auto; padding-top: 10px; }
.od-pause { padding: 2px 0; border: 0; background: none; font-family: inherit; font-size: 12.5px; font-weight: 500; color: var(--a-muted); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.od-pause:hover { color: var(--a-warning); }
.od-reactivate { background: var(--a-success); border-color: var(--a-success); color: #fff; }
.od-reactivate:hover { background: #225f43; }
.od-hint { margin: 0; font-size: 12.5px; color: var(--a-muted); }

.od-panel { background: #fff; border: 1px solid var(--a-border); border-radius: 14px; }
.od-loading { display: flex; align-items: center; justify-content: center; gap: 10px; color: var(--a-muted); font-weight: 600; padding: 48px; }
.od-empty { min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 32px; text-align: center; color: var(--a-muted); }
.od-empty > i { font-size: 28px; color: var(--a-faint); }
.od-empty-title { margin: 4px 0 0; font-size: 15px; font-weight: 700; color: var(--a-heading); }
.od-empty p:not(.od-empty-title) { margin: 0 0 8px; }
.od-tip { display: flex; align-items: center; gap: 8px; margin: 20px 0 0; font-size: 12.5px; color: var(--a-muted); }
.od-tip i { color: var(--a-faint); }

/* Property card v2: full-photo media panel, icon stat tiles, softer notes */
.od-list { gap: 20px; }
.od-card { grid-template-columns: minmax(0, 46%) minmax(0, 1fr); gap: 0; padding: 0; border-radius: 18px; overflow: hidden; box-shadow: 0 1px 2px rgba(20, 43, 74, .04), 0 10px 28px rgba(20, 43, 74, .06); transition: box-shadow .2s, transform .2s; }
.od-card:hover { box-shadow: 0 2px 4px rgba(20, 43, 74, .05), 0 16px 36px rgba(20, 43, 74, .10); }
.od-media { min-height: 300px; border-radius: 0; background: #0f1f36; }
.od-media img { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.od-media .od-media-photo { object-fit: cover; object-position: center; transition: transform .35s ease; }
.od-card:hover .od-media-photo { transform: scale(1.02); }
.od-media.is-muted img { filter: grayscale(.65) brightness(.85); }
.od-media::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(15, 31, 54, .35) 0%, transparent 28%, transparent 78%, rgba(15, 31, 54, .35) 100%); pointer-events: none; }
.od-status-overlay { position: absolute; z-index: 1; top: 14px; left: 14px; box-shadow: 0 4px 12px rgba(15, 31, 54, .25); backdrop-filter: blur(6px); }
.od-status-overlay.is-success { background: rgba(227, 246, 234, .95); }
.od-status-overlay.is-neutral { background: rgba(246, 249, 253, .95); }
.od-media-pending { position: absolute; z-index: 1; right: 14px; bottom: 14px; display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px; background: var(--a-gold); color: #142b4a; font-size: 12px; font-weight: 700; box-shadow: 0 4px 12px rgba(15, 31, 54, .25); }
.od-body { padding: 22px 24px 18px; }
.od-name { font-size: 23px !important; }
.od-address { margin-top: 8px; font-size: 13.5px; }
.od-stats { gap: 12px; margin-top: 18px; padding-bottom: 0; border-bottom: 0; }
.od-stats > div { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; background: var(--a-surface-2); border: 1px solid var(--a-border); }
.od-stats > div + div { padding-left: 14px; border-left: 1px solid var(--a-border); }
.od-stat-icon { width: 36px; height: 36px; flex-shrink: 0; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: var(--a-primary-soft); color: var(--a-primary); font-size: 14px; }
.od-stats dt { font-size: 12px; font-weight: 500; }
.od-stats dd { margin-top: 2px; font-size: 16.5px; }
.od-stats dd small { font-size: 12px; font-weight: 500; color: var(--a-muted); }
.od-stats > div.is-warn { background: var(--a-warning-soft); border-color: #f1d9b5; }
.od-stats > div.is-warn .od-stat-icon { background: #f8e2c2; color: var(--a-warning); }
.od-stats > div.is-warn dd { color: var(--a-warning); }

/* Property card v3: refined accents, three stat tiles, live permit countdown */
.od-card { position: relative; }
.od-card::before { content: ''; position: absolute; z-index: 2; left: 0; top: 0; bottom: 0; width: 4px; background: var(--a-primary); }
.od-card:has(.od-status.is-warning)::before { background: var(--a-gold); }
.od-card:has(.od-status.is-danger)::before { background: var(--a-danger); }
.od-card:has(.od-status.is-neutral)::before { background: var(--a-faint); }
.od-media { min-height: 320px; }
.od-title-row { align-items: baseline; }
.od-name { font-size: 24px !important; letter-spacing: -.025em; }
.od-ref { padding: 2px 9px; border-radius: 6px; background: var(--a-surface-2); border: 1px solid var(--a-border); color: var(--a-muted); font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: .02em; }
.od-address { padding-bottom: 16px; border-bottom: 1px dashed var(--a-border); }
.od-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 16px; }
.od-stats > div, .od-stats > div + div { padding: 12px; gap: 10px; border: 1px solid var(--a-border); background: #fff; }
.od-stat-icon { width: 34px; height: 34px; font-size: 13px; }
.od-stats dt { font-size: 11.5px; font-weight: 600; letter-spacing: .02em; color: var(--a-faint); }
.od-stats dd { font-size: 16px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.od-stat-sub { display: block; margin-top: 1px; font-size: 11.5px; font-weight: 600; color: var(--a-muted); }
.od-stats > div.is-ok .od-stat-sub { color: var(--a-success); }
.od-stats > div.is-warn { background: var(--a-warning-soft); border-color: #f1d9b5; }
.od-stats > div.is-warn .od-stat-sub { color: var(--a-warning); }
.od-stats > div.is-danger { background: var(--a-danger-soft); border-color: #f0c9c5; }
.od-stats > div.is-danger .od-stat-icon { background: #f6d5d1; color: var(--a-danger); }
.od-stats > div.is-danger :is(dd, .od-stat-sub) { color: var(--a-danger); }
.od-act { min-height: 42px; }
.od-act:not(.is-primary):not(.is-danger):not(.od-reactivate) { border-width: 1px; border-color: var(--a-primary-tint); color: var(--a-primary); }
.od-act:not(.is-primary):not(.is-danger):not(.od-reactivate):hover { background: var(--a-primary-soft); border-color: var(--a-primary); }
@media (max-width: 1280px) and (min-width: 901px) {
  .od-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .od-stats > .is-permit { grid-column: 1 / -1; }
}
@media (max-width: 560px) {
  .od-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .od-stats > .is-permit { grid-column: 1 / -1; }
}
.od-note { margin-top: 14px; padding: 10px 12px; border-radius: 10px; background: var(--a-surface-2); border-left: 3px solid var(--a-faint); }
.od-note.is-warning { background: var(--a-warning-soft); border-left-color: var(--a-gold); }
.od-note.is-danger { background: var(--a-danger-soft); border-left-color: var(--a-danger); }
/* Permit expiry: orange (same palette as the Edit / Docs / Rooms buttons) */
.od-note.is-expiry { background: #fff7ed; border-left-color: #fb923c; }
.od-note.is-expiry p { color: #c2410c; }
.od-note.is-expiry .admin-link { color: #ea580c; font-weight: 700; }
.od-stats > div.is-warn, .od-stats > div.is-warn + div, div + .od-stats > div.is-warn { background: #fff7ed !important; border-color: #fdba74 !important; }
.od-stats > div.is-warn .od-stat-icon { background: #fb923c; color: #fff; }
.od-stats > div.is-warn :is(dd, .od-stat-sub) { color: #ea580c; }
.od-status.is-expiry, .od-status-overlay.is-expiry { background: #fb923c; color: #fff; }
.od-card:has(.od-status.is-expiry)::before { background: #fb923c; }
.od-chips .admin-badge.is-warning { background: #ffedd5; color: #c2410c; }
/* Card actions: green rooms, blue documents, orange edit */
.od-actions .od-act.od-act-rooms, .od-actions .od-act.od-act-docs, .od-actions .od-act.od-act-edit { border: 0 !important; color: #fff !important; font-weight: 700; box-shadow: 0 4px 10px rgba(15, 23, 42, .12); }
.od-actions .od-act.od-act-rooms { background: #22c55e; }
.od-actions .od-act.od-act-rooms:hover { background: #16a34a !important; }
.od-actions .od-act.od-act-docs { background: #3b82f6; }
.od-actions .od-act.od-act-docs:hover { background: #2563eb !important; }
.od-actions .od-act.od-act-edit { background: #fb923c; }
.od-actions .od-act.od-act-edit:hover { background: #f97316 !important; }
.od-actions { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--a-border); }
.od-act { border-radius: 10px; }
.od-act.is-primary { box-shadow: 0 4px 12px rgba(20, 43, 74, .18); }
.od-foot { padding-top: 12px; }

@media (max-width: 900px) {
  .od-card { grid-template-columns: minmax(0, 1fr); }
  .od-media { min-height: 0; aspect-ratio: 16 / 10; }
  .od-body { padding: 18px; }
}
@media (max-width: 480px) {
  .od-stats { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 560px) {
  .od-alert { flex-wrap: wrap; }
  .od-btn-navy, .od-btn-outline { width: 100%; justify-content: center; }
  .od-act { flex: 1 1 auto; }
  .od-stats > div + div { padding-left: 14px; }
}

/* Welcome banner (original) */
.od-welcome { position: relative; overflow: hidden; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px 24px; padding: 26px 28px; margin-bottom: 20px; border-radius: var(--a-radius); color: #fff;
  background: radial-gradient(circle at 88% -10%, rgba(224, 165, 38, .35), transparent 40%), linear-gradient(120deg, #1E4A8D 0%, #163870 55%, #142B4A 100%); box-shadow: 0 12px 28px rgba(20, 43, 74, .18); }
.od-welcome::after { content: '\f015'; font-family: 'Font Awesome 6 Free'; font-weight: 900; position: absolute; right: 26px; bottom: -34px; font-size: 150px; color: rgba(255, 255, 255, .05); pointer-events: none; }
.od-welcome-text { position: relative; z-index: 1; min-width: 0; }
.od-welcome-eyebrow { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 0 8px; font-size: 13px; color: #c9d7ec; }
.od-portal { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; background: rgba(255, 255, 255, .14); color: #fff; font-size: 11.5px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
.od-welcome h1 { margin: 0; font-size: clamp(22px, 2.4vw, 30px) !important; font-weight: 700 !important; color: #fff !important; letter-spacing: -.02em; line-height: 1.2; }
.od-welcome-summary { margin: 6px 0 0; font-size: 14px; color: #dce6f4; max-width: 640px; }
.od-welcome-actions { position: relative; z-index: 1; display: flex; flex-wrap: wrap; gap: 10px; }
.od-btn-gold, .od-btn-glass { display: inline-flex; align-items: center; gap: 8px; min-height: 42px; padding: 0 18px; border-radius: 12px; font-size: 13.5px; font-weight: 700; text-decoration: none; transition: transform .15s, box-shadow .15s, background .15s; }
.od-btn-gold { background: var(--a-gold); color: #142b4a; box-shadow: 0 6px 16px rgba(224, 165, 38, .35); }
.od-btn-gold:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(224, 165, 38, .45); }
.od-btn-glass { background: rgba(255, 255, 255, .12); color: #fff; border: 1px solid rgba(255, 255, 255, .22); }
.od-btn-glass:hover { background: rgba(255, 255, 255, .2); }
@media (max-width: 640px) { .od-welcome { padding: 20px; } .od-welcome-actions { width: 100%; } .od-btn-gold, .od-btn-glass { flex: 1; justify-content: center; } }
@media (max-width: 400px) { .od-stats { grid-template-columns: minmax(0, 1fr); } }
/* Phone / PWA: compact property card so it fits with less scrolling (desktop unchanged) */
@media (max-width: 560px) {
  .od-media { aspect-ratio: 16 / 8; }
  .od-status-overlay { top: 10px; left: 10px; }
  .od-media-pending { right: 10px; bottom: 10px; }
  .od-body { padding: 14px 14px 12px; }
  .od-name { font-size: 19px !important; }
  .od-ref { font-size: 10.5px; padding: 1px 7px; }
  .od-address { margin-top: 4px; padding-bottom: 10px; font-size: 12.5px; }
  .od-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 10px; }
  .od-stats > .is-permit { grid-column: auto; }
  .od-stats > div, .od-stats > div + div { padding: 8px; gap: 0; border-radius: 10px; }
  .od-stat-icon { display: none; }
  .od-stats dt { font-size: 10.5px; line-height: 1.3; }
  .od-stats dd { font-size: 13.5px; white-space: normal; }
  .od-stats dd small { display: block; font-size: 10.5px; }
  .od-stat-sub { font-size: 10.5px; }
  .od-note { margin-top: 10px; padding: 8px 10px; }
  .od-actions { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 6px; margin-top: 12px; padding-top: 12px; }
  .od-act { min-height: 38px; padding: 0 6px; gap: 5px; font-size: 12px; }
  .od-foot { padding-top: 8px; }
}
</style>
