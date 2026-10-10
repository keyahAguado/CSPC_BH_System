<script setup>
import PageHeader from '../components/management/PageHeader.vue';
import LoadError from '../components/management/LoadError.vue';
import '../styles/management.css';
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import OwnerNav from '../components/partials/OwnerNav.vue';
import AdminNav from '../components/partials/AdminNav.vue';
import StudentNav from '../components/partials/StudentNav.vue';
import { useOfflineStatus } from '../utils/offlineHelper.js';

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
    if (type === 'document_update' || type === 'approved' || type === 'rejected' || type === 'general') {
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

onMounted(() => {
  fetchNotifications();
});
</script>

<template>
  <div class="min-h-screen flex flex-col font-sans text-left" 
       :class="[user.role === 'student' ? 'bg-[#bae1ff] text-slate-900 pb-20' : 'bg-[#eef6ff] text-slate-900 pb-12', { 'management-page': user.role === 'admin' || user.role === 'owner' }]">
    
    <component :is="user.role === 'admin' ? AdminNav : (user.role === 'owner' ? OwnerNav : StudentNav)" />

    <main :id="user.role !== 'student' ? 'management-content' : undefined" class="flex-1 max-w-5xl mx-auto w-full py-12 px-6 lg:px-12">

      <!-- Header Section -->
      <LoadError v-if="user.role !== 'student'" :message="loadError" />
      <PageHeader v-if="user.role !== 'student'" title="Notifications" description="Review system updates, requests, and compliance notices." />
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
          <div v-for="notif in notifications" :key="notif.id" 
               @click="handleContainerClick(notif, $event)"
               tabindex="0" role="link" aria-label="Open notification" @keydown.enter.prevent="handleContainerClick(notif, $event)" class="management-notification-item bg-white rounded-[2.5rem] shadow-sm border border-slate-200/60 overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-blue-300 cursor-pointer group"
               :class="notif.is_read ? 'management-notification-read' : ''">
            
            <!-- Header Bar -->
            <div v-if="getNotifType(notif.message) === 'booking'" class="bg-[#1e40af] px-5 py-3 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <i class="fa-solid fa-calendar-check text-white text-lg"></i>
                <h2 class="text-white font-semibold uppercase text-[13px] tracking-widest">Reservation Request</h2>
              </div>
              <span class="text-[12px] font-extrabold text-blue-100 uppercase tracking-widest bg-blue-900/40 px-3 py-1 rounded-full">Bookings</span>
            </div>
            <div v-else-if="getNotifType(notif.message) === 'approved'" class="bg-[#7ab495] px-5 py-3 flex items-center gap-3">
              <i class="fa-solid fa-circle-check text-white text-lg"></i>
              <h2 class="text-white font-semibold uppercase text-[13px] tracking-widest">Accreditation Approved</h2>
            </div>
            <div v-else-if="getNotifType(notif.message) === 'document_update'" class="bg-[#1e40af] px-5 py-3 flex items-center gap-3">
              <i class="fa-solid fa-file-shield text-white text-lg"></i>
              <h2 class="text-white font-semibold uppercase text-[13px] tracking-widest">Document Update Review</h2>
            </div>
            <div v-else-if="getNotifType(notif.message) === 'issue'" class="bg-[#e11d48] px-5 py-3 flex items-center gap-3">
              <i class="fa-solid fa-circle-exclamation text-white text-lg"></i>
              <h2 class="text-white font-semibold uppercase text-[13px] tracking-widest">System Alert</h2>
            </div>
            <div v-else-if="getNotifType(notif.message) === 'rejected'" class="bg-[#e11d48] px-5 py-3 flex items-center gap-3">
              <i class="fa-solid fa-circle-exclamation text-white text-lg"></i>
              <h2 class="text-white font-semibold uppercase text-[13px] tracking-widest">Accreditation Rejected</h2>
            </div>
            <div v-else-if="getNotifType(notif.message) === 'expiry'" class="bg-[#f59e0b] px-5 py-3 flex items-center gap-3">
              <i class="fa-solid fa-triangle-exclamation text-white text-lg"></i>
              <h2 class="text-white font-semibold uppercase text-[13px] tracking-widest">Permit Expiry Warning</h2>
            </div>
            <div v-else class="bg-[#2563eb] px-5 py-3 flex items-center gap-3">
              <i class="fa-solid fa-bell text-white text-lg"></i>
              <h2 class="text-white font-semibold uppercase text-[13px] tracking-widest">System Update</h2>
            </div>

            <!-- Card Body -->
            <div class="p-5">
              <div class="flex items-start gap-4 mb-4">
                <span v-if="!notif.is_read" class="w-2.5 h-2.5 mt-2 bg-blue-500 rounded-full flex-shrink-0 animate-pulse"></span>
                <p class="text-slate-500 font-medium leading-relaxed text-[15px]">
                  {{ cleanMessage(notif.message) }}
                </p>
              </div>

              <!-- Context Blocks -->
              <div v-if="getNotifType(notif.message) === 'booking' && user.role === 'owner'" class="bg-[#eff6ff] border-l-[6px] border-[#1e40af] p-4 rounded-r-xl mb-4">
                <p class="text-[#1e40af] font-semibold text-[12px] uppercase tracking-widest mb-2">Reservation Request Action Required:</p>
                <p class="text-slate-600 text-[14px] leading-relaxed italic mb-6">"A student has submitted a room reservation request or payment update. Click anywhere on this notification or below to view and manage your reservation requests."</p>
                <router-link to="/owner/bookings" class="inline-flex items-center gap-3 bg-[#1e40af] text-white px-6 py-3 rounded-2xl text-[12px] font-semibold uppercase tracking-widest hover:opacity-90 transition shadow-lg active:scale-95">
                  Manage Reservations <i class="fa-solid fa-arrow-right text-[12px]"></i>
                </router-link>
              </div>

              <div v-else-if="getNotifType(notif.message) === 'approved'" class="bg-[#f0f9f4] border-l-[6px] border-[#7ab495] p-4 rounded-r-xl mb-4">
                <div class="flex items-center gap-6">
                  <div class="w-20 h-20 bg-white rounded-2xl flex items-center justify-center p-2 shadow-sm border border-emerald-100 overflow-hidden shrink-0">
                    <img src="/img/seal%20of%20approval.png" alt="CSPC Accredited" class="w-full h-full object-contain" @error="e => e.target.src = '/img/cspc_logo.png'" />
                  </div>
                  <div>
                    <p class="text-[#065f46] font-semibold uppercase text-[12px] tracking-widest mb-1">Status: Approved</p>
                    <p class="text-[#065f46] text-[14px] font-semibold uppercase tracking-tight">Accredited Boarding House Owner</p>
                  </div>
                </div>
              </div>

              <div v-else-if="getNotifType(notif.message) === 'document_update' && user.role === 'admin'" class="bg-[#eff6ff] border-l-[6px] border-[#1e40af] p-4 rounded-r-xl mb-4">
                <p class="text-[#1e40af] font-semibold text-[12px] uppercase tracking-widest mb-2">Verification Action Required:</p>
                <p class="text-slate-600 text-[14px] leading-relaxed italic mb-6">"An owner has uploaded updated files or resubmitted an application. Click anywhere on this card to inspect the requirement checklist."</p>
                <router-link to="/admin/pending-applications" class="inline-flex items-center gap-3 bg-[#1e40af] text-white px-6 py-3 rounded-2xl text-[12px] font-semibold uppercase tracking-widest hover:opacity-90 transition shadow-lg active:scale-95">
                  Review Checklist <i class="fa-solid fa-arrow-right text-[12px]"></i>
                </router-link>
              </div>

              <div v-else-if="getNotifType(notif.message) === 'expiry'" class="bg-[#fffbeb] border-l-[6px] border-[#f59e0b] p-4 rounded-r-xl mb-4">
                <p class="text-[#92400e] font-semibold text-[12px] uppercase tracking-widest mb-2">Action Required:</p>
                <p class="text-slate-600 text-[14px] leading-relaxed italic mb-6">
                  <template v-if="notif.message.toLowerCase().includes('supplementary')">
                    "Please navigate to your Legal Documents page to upload a renewed copy. Your listing remains active and bookable in the meantime — this is a reminder, not a suspension."
                  </template>
                  <template v-else>
                    "Please navigate to your Legal Documents page to upload the corresponding files or updated permits. Failure to renew before the expiry date will automatically hide your listing from students."
                  </template>
                </p>
                <router-link to="/owner/documents" class="inline-flex items-center gap-3 bg-[#f59e0b] text-white px-6 py-3 rounded-2xl text-[12px] font-semibold uppercase tracking-widest hover:opacity-90 transition shadow-lg active:scale-95">
                  Update Documents <i class="fa-solid fa-arrow-right text-[12px]"></i>
                </router-link>
              </div>

             <div v-else-if="getNotifType(notif.message) === 'rejected'" class="bg-[#fff1f2] border-l-[6px] border-[#e11d48] p-4 rounded-r-xl mb-4">
                <p class="text-[#9f1239] font-semibold text-[12px] uppercase tracking-widest mb-2">Action Required:</p>
                <p class="text-slate-600 text-[14px] leading-relaxed italic mb-6">"Your application was not approved. Please review the specific feedback provided by the administration and update your property details or legal documents to proceed."</p>
                <!-- SYSTEM FALLBACK RESOLVES OWNER BOARDING HOUSE DYNAMICALLY -->
                <router-link to="/owner/documents" class="inline-flex items-center gap-3 bg-[#e11d48] text-white px-6 py-3 rounded-2xl text-[12px] font-semibold uppercase tracking-widest hover:opacity-90 transition shadow-lg active:scale-95">
                  Review & Resubmit <i class="fa-solid fa-arrow-right text-[12px]"></i>
                </router-link>
              </div>

              <div v-else-if="getNotifType(notif.message) === 'issue' && user.role === 'owner'" class="bg-slate-50 border-l-[6px] border-slate-500 p-4 rounded-r-xl mb-4">
                <p class="text-slate-700 font-semibold text-[12px] uppercase tracking-widest mb-2">Listing Archived:</p>
                <p class="text-slate-600 text-[14px] leading-relaxed italic mb-6">"Your listing is currently hidden from students. If this was due to expired required permits, renew and resubmit them below. If SASO archived it manually, contact the office to discuss reactivation."</p>
                <router-link to="/owner/documents" class="inline-flex items-center gap-3 bg-slate-600 text-white px-6 py-3 rounded-2xl text-[12px] font-semibold uppercase tracking-widest hover:opacity-90 transition shadow-lg active:scale-95">
                  View Documents <i class="fa-solid fa-arrow-right text-[12px]"></i>
                </router-link>
              </div>

              <!-- Action buttons & timestamps -->
              <div class="flex items-end justify-between">
                <button v-if="!notif.is_read" @click.stop="markRead(notif.id)" class="bg-[#0f172a] hover:bg-black text-white px-7 py-3.5 rounded-2xl font-semibold text-[12px] uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 shadow-xl shadow-slate-200 cursor-pointer">
                  <i class="fa-solid fa-check text-[12px]"></i> Mark Read
                </button>
                <div v-else class="text-xs font-bold text-blue-600 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                  <span>Click container to view</span>
                  <i class="fa-solid fa-arrow-right text-[12px]"></i>
                </div>

                <div class="text-right">
                  <p class="text-slate-300 font-bold text-[12px] uppercase tracking-[0.2em] mb-1">
                    {{ getNotifType(notif.message) === 'general' && user.role === 'admin' ? 'Message from Boarding House Owner' : 'Message from SASO Admin' }}
                  </p>
                  <p class="text-slate-400 font-semibold text-[13px]">
                    {{ notif.created_at ? new Date(notif.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A' }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Owner / Admin Empty State -->
          <div v-if="notifications.length === 0" class="p-20 text-center bg-white rounded-[2.5rem] shadow-sm border border-slate-200/60">
            <div class="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <i class="fa-solid fa-bell-slash text-slate-300 text-2xl"></i>
            </div>
            <h3 class="text-slate-400 font-bold uppercase tracking-widest text-xs">No notifications yet</h3>
          </div>
        </template>

      </div>

      <p class="mt-16 text-center text-blue-700/40 font-semibold uppercase text-[12px] tracking-[0.4em]">End of Your Notifications</p>
    </main>
  </div>
</template>