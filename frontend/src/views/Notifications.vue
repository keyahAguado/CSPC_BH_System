<script setup>
import MessageText from "../components/MessageText.vue";
import {notificationContext,notificationTitle,notificationTone,newestNotifications,manilaDayOf,dateRange,dayHeading,formalDay} from '../utils/notificationInbox.js';
import PageHeader from '../components/management/PageHeader.vue';
import TablePager from '../components/management/TablePager.vue';
import LoadError from '../components/management/LoadError.vue';
import '../styles/management.css';
import { ref, computed, watch, onMounted, nextTick } from 'vue';
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
const search=ref(''),unreadOnly=ref(false),selectedIds=ref([]),markingSelected=ref(false),actionError=ref('');
// Owner/admin inbox filters: property, notice date (Philippine days), action requests and sort order.
const property=ref('all'),datePreset=ref('all'),customFrom=ref(''),customTo=ref(''),actionOnly=ref(false),sortOrder=ref('newest');
const NO_PROPERTY='__none';
const todayDay=()=>manilaDayOf(Date.now());
const notificationDialog=ref(null),detailId=ref(null);
const activeNotification=computed(()=>items.value.find(n=>n.id===detailId.value));
let detailTrigger;
const showMessage=async(notif,event)=>{detailTrigger=event?.currentTarget;detailId.value=notif.id;await nextTick();if(notificationDialog.value && !notificationDialog.value.open)notificationDialog.value.showModal();if(!readFlag(notif))markRead(notif.id).catch(()=>{});};
const closeMessage=()=>{notificationDialog.value?.close();detailId.value=null;nextTick(()=>{if(detailTrigger?.isConnected)detailTrigger.focus({preventScroll:true});});};
const readFlag=n=>Number(n.is_read)===1;

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
    actionError.value='Could not mark this notification read. Please try again.';
    throw err;
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

  if(/REF-\d+|renewal|checkout|arrival|no-show|payment received|booked stay/i.test(message || ''))return 'booking';
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
  const stored=typeof notif.link==='string' && notif.link.startsWith('/'+role+'/') ? notif.link : null;
  const ref=String(notif.message || '').match(/\bREF-(\d+)\b/)?.[1];
  if(stored){if(role==='owner' && /^\/owner\/bookings(?:\?|$)/.test(stored) && ref){const url=new URL(stored,location.origin);url.searchParams.set('bookingId',String(Number(ref)));return url.pathname+url.search;}return stored;}
  const type = getNotifType(notif.message);

  if (role === 'owner') {
    if (type === 'booking') return ref ? '/owner/bookings?bookingId='+Number(ref) : '/owner/bookings';
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
  if (!readFlag(notif)) {
    markRead(notif.id).catch(()=>{});
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
    .replace(/^[A-Z][A-Z ]{2,60}:\s*/, '')
    .replace(/\s+PHT\b/g,'')
    .replace(/^ALERT:\s*/i, '')
    .replace(/^WARNING:\s*/i, '')
    .replace(/^SYSTEM:\s*/i, '')
    .replace(/^CONGRATULATIONS:\s*/i, '')
    .replace(/^NOTICE:\s*/i, '')
    .replace(/\bsupplementary documents?\b/gi, match => match.toLowerCase().endsWith('s') ? 'optional documents' : 'optional document');
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
  const meta=TYPE_META[type] || TYPE_META.general;
  return { ...n,is_read:readFlag(n)?1:0, type, meta, title:notificationTitle(n.message,meta.title),context:notificationContext(n),tone:notificationTone(n.message,type),day:manilaDayOf(n.created_at) };
}));
const studentGroups = computed(() => {
  const groups = [];
  for (const notification of newestNotifications(items.value)) {
    let group = groups[groups.length - 1];
    if (!group || group.day !== notification.day) {
      group = { day: notification.day, label: dayHeading(notification.day, todayDay()), items: [] };
      groups.push(group);
    }
    group.items.push(notification);
  }
  return groups;
});
const filterCounts = computed(() => {
  const counts = { all: items.value.length, unread: 0, attention: 0, week: 0, booking: 0, documents: 0, accreditation: 0, system: 0 };
  const week=dateRange('7d',todayDay());
  items.value.forEach(n => {
    counts[n.meta.category]++;
    if (!n.is_read) counts.unread++;
    if (!n.is_read && n.tone.action) counts.attention++;
    if (n.day>=week.from && n.day<=week.to) counts.week++;
  });
  return counts;
});
const invalidRange=computed(()=>datePreset.value==='custom' && !!customFrom.value && !!customTo.value && customFrom.value>customTo.value);
const propertyOptions=computed(()=>[...new Set(items.value.map(n=>n.context.property).filter(Boolean))].sort((a,b)=>a.localeCompare(b)));
const hasUnlinked=computed(()=>items.value.some(n=>!n.context.property));
const DATE_PRESETS=[{key:'all',label:'Any time'},{key:'today',label:'Today'},{key:'7d',label:'Last 7 days'},{key:'30d',label:'Last 30 days'},{key:'custom',label:'Custom range'}];
const dateSummary=computed(()=>datePreset.value!=='custom' ? DATE_PRESETS.find(p=>p.key===datePreset.value).label : customFrom.value || customTo.value ? (formalDay(customFrom.value) || '…')+' – '+(formalDay(customTo.value) || '…') : 'Custom range');
const activeFilterCount=computed(()=>[search.value.trim(),unreadOnly.value,actionOnly.value,property.value!=='all',datePreset.value!=='all',activeFilter.value!=='all'].filter(Boolean).length);
const visibleItems = computed(() => {
 const term=search.value.trim().toLowerCase();
 const range=dateRange(datePreset.value,todayDay(),{from:customFrom.value,to:customTo.value});
 if(invalidRange.value)return [];
 const rows=newestNotifications(items.value.filter(n=>(activeFilter.value==='all' || n.meta.category===activeFilter.value) && (!unreadOnly.value || !readFlag(n)) && (!actionOnly.value || n.tone.action)
  && (property.value==='all' || (property.value===NO_PROPERTY ? !n.context.property : n.context.property===property.value))
  && (!range.from || n.day>=range.from) && (!range.to || n.day<=range.to)
  && (!term || [n.message,n.title,n.context.property,n.context.room].some(v=>String(v||'').toLowerCase().includes(term)))));
 return sortOrder.value==='oldest' ? rows.reverse() : rows;
});
// Owner / admin inbox is paged (same pager as the admin tables) so the list doesn't run on forever
const nfPage = ref(1);
const nfPerPage = ref(10);
const nfTotalPages = computed(() => Math.max(1, Math.ceil(visibleItems.value.length / nfPerPage.value)));
const nfPaged = computed(() => visibleItems.value.slice((nfPage.value - 1) * nfPerPage.value, nfPage.value * nfPerPage.value));
const nfStart = computed(() => (visibleItems.value.length ? (nfPage.value - 1) * nfPerPage.value + 1 : 0));
const nfEnd = computed(() => Math.min(nfPage.value * nfPerPage.value, visibleItems.value.length));
watch([activeFilter,search,unreadOnly,actionOnly,property,datePreset,customFrom,customTo,sortOrder,nfPerPage], () => { nfPage.value = 1;selectedIds.value=[]; });
// The current page split into day groups (Today, Yesterday, then dates) so rows read as a timeline.
const nfGroups=computed(()=>{const today=todayDay(),groups=[];for(const n of nfPaged.value){const last=groups[groups.length-1];if(last && last.day===n.day)last.items.push(n);else groups.push({day:n.day,label:dayHeading(n.day,today),items:[n]});}return groups;});
const showAttention=()=>{activeFilter.value='all';router.replace({query:{...route.query,filter:undefined}});unreadOnly.value=true;actionOnly.value=true;};
const showWeek=()=>{datePreset.value='7d';};
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
      selectedIds.value=[];
    }
  } catch (err) {
    actionError.value='Could not mark all notifications read. Please try again.';
  } finally {
    isMarkingAll.value = false;
  }
};

const pageSelected=computed(()=>nfPaged.value.length>0 && nfPaged.value.every(n=>selectedIds.value.includes(n.id)));
const somePageSelected=computed(()=>nfPaged.value.some(n=>selectedIds.value.includes(n.id)));
const togglePage=()=>{const ids=nfPaged.value.map(n=>n.id);selectedIds.value=pageSelected.value?selectedIds.value.filter(id=>!ids.includes(id)):[...new Set([...selectedIds.value,...ids])];};
const markSelectedRead=async()=>{if(markingSelected.value)return;markingSelected.value=true;actionError.value='';try{const selected=notifications.value.filter(n=>selectedIds.value.includes(n.id) && !readFlag(n));const results=await Promise.allSettled(selected.map(n=>markRead(n.id)));if(results.some(r=>r.status==='rejected'))actionError.value='Some notifications could not be marked read. Try again.';selectedIds.value=[];}finally{markingSelected.value=false;}};
const actionLabel=n=>n.type==='booking' ? 'View booking' : n.meta.category==='documents' ? 'View documents' : 'View details';
const resetInbox=()=>{search.value='';unreadOnly.value=false;actionOnly.value=false;property.value='all';datePreset.value='all';customFrom.value='';customTo.value='';sortOrder.value='newest';setFilter('all');};
const dateLabel=value=>value && Number.isFinite(new Date(value).getTime())?new Date(value).toLocaleDateString('en-US',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric'}):'Date unavailable';
const timeLabel=value=>value && Number.isFinite(new Date(value).getTime())?new Date(value).toLocaleTimeString('en-US',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit',hour12:true}):'';
const formatWhen = (value) => value
  ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : 'N/A';

onMounted(() => {
  fetchNotifications();
});
</script>

<template>
  <div class="min-h-screen flex flex-col font-sans text-left" 
       :class="[user.role === 'student' ? 'bg-slate-50 text-slate-900 pb-6' : 'bg-[#eef6ff] text-slate-900 pb-12', { 'management-page': user.role === 'admin' || user.role === 'owner', 'notif-owner-theme': user.role === 'owner' || user.role === 'admin' }]">
    
    <component :is="user.role === 'admin' ? AdminNav : (user.role === 'owner' ? OwnerNav : StudentNav)" />

    <main :id="user.role !== 'student' ? 'management-content' : undefined" :class="['flex-1 mx-auto w-full', user.role==='student' ? 'max-w-5xl' : 'nf-main', user.role === 'student' ? 'py-5 px-4 md:py-10 md:px-8' : 'py-6 px-4 sm:px-6']">

      <!-- Header Section -->
      <LoadError v-if="user.role !== 'student'" :message="loadError" />
      <PageHeader v-if="user.role !== 'student'" title="Notifications" />
      <header v-else class="mb-5">
        <h1 class="text-[28px] font-black text-slate-900 tracking-tight">Notifications</h1>
        <div class="flex items-center justify-between gap-3 mt-2">
          <p class="text-sm text-slate-500" role="status">{{ filterCounts.unread ? `${filterCounts.unread} unread updates` : 'You’re all caught up' }}</p>
          <button type="button" class="min-h-[44px] text-[13px] font-semibold text-blue-700 disabled:opacity-50" :disabled="isMarkingAll || !filterCounts.unread || isLoading" @click="markAllRead">{{ isMarkingAll ? 'Marking…' : 'Mark all read' }}</button>
        </div>
      </header>
      <LoadError v-if="user.role === 'student'" :message="loadError" />
      <p v-if="user.role === 'student' && actionError" role="alert" class="ni-error mb-4">{{ actionError }}</p>
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
          <section v-for="group in studentGroups" :key="group.day" class="mb-5" :aria-label="group.label">
            <h2 class="text-xs font-bold text-slate-500 mb-2 px-1">{{ group.label }}</h2>
            <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
              <article v-for="notif in group.items" :key="notif.id" class="flex gap-3 p-4" :class="!readFlag(notif) ? 'bg-blue-50/60' : ''">
                <span class="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center" :style="{ backgroundColor: notif.meta.soft, color: notif.meta.ink }" aria-hidden="true"><i :class="['fa-solid', notif.tone.icon]"></i></span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-start gap-2">
                    <h3 class="flex-1 text-sm font-bold text-slate-900 leading-snug">{{ notif.title }}</h3>
                    <span v-if="!readFlag(notif)" class="mt-1.5 w-2 h-2 rounded-full bg-blue-600 shrink-0"><span class="sr-only">Unread</span></span>
                  </div>
                  <p class="mt-1.5 text-[13px] text-slate-600 leading-relaxed break-words"><MessageText :text="cleanMessage(notif.message)" /></p>
                  <p class="text-[11px] text-slate-400 mt-2">{{ timeLabel(notif.created_at) }}</p>
                  <div class="flex items-center justify-between gap-3 mt-1">
                    <router-link :to="getNotifTargetRoute(notif)" @click="!readFlag(notif) && markRead(notif.id).catch(() => {})" class="inline-flex items-center gap-2 min-h-[44px] text-xs font-semibold text-blue-700">View details <i class="fa-solid fa-arrow-right text-[10px]" aria-hidden="true"></i></router-link>
                    <button v-if="!readFlag(notif)" type="button" @click="markRead(notif.id).catch(() => {})" class="min-h-[44px] text-xs font-medium text-slate-500">Mark as read</button>
                  </div>
                </div>
              </article>
            </div>
          </section>
          <div v-if="!notifications.length && !loadError" class="bg-white border border-slate-200 rounded-2xl px-6 py-14 text-center">
            <span class="mx-auto flex items-center justify-center w-14 h-14 bg-blue-50 text-blue-600 rounded-full"><i class="fa-regular fa-bell text-xl" aria-hidden="true"></i></span>
            <h2 class="mt-4 text-base font-bold text-slate-900">No notifications yet</h2>
            <p class="mt-2 text-sm text-slate-500 leading-relaxed">Your booking updates and account notices will appear here.</p>
          </div>
        </template>
        <!-- =================================================================== -->
        <!-- 2. OWNER & ADMIN NOTIFICATIONS TEMPLATE  -->
        <!-- =================================================================== -->
        <template v-else>
<section class="ni-summary" aria-label="Inbox summary">
<button type="button" class="ni-stat" :class="{active:unreadOnly && !actionOnly}" @click="unreadOnly=!unreadOnly;actionOnly=false"><span class="ni-stat-icon blue" aria-hidden="true"><i class="fa-solid fa-envelope"></i></span><span><strong>{{ filterCounts.unread }}</strong><small>Unread</small></span></button>
<button type="button" class="ni-stat" :class="{active:unreadOnly && actionOnly}" @click="unreadOnly && actionOnly ? (unreadOnly=false,actionOnly=false) : showAttention()"><span class="ni-stat-icon amber" aria-hidden="true"><i class="fa-solid fa-hand-pointer"></i></span><span><strong>{{ filterCounts.attention }}</strong><small>Unread action requests</small></span></button>
<button type="button" class="ni-stat" :class="{active:datePreset==='7d'}" @click="datePreset=datePreset==='7d'?'all':'7d'"><span class="ni-stat-icon green" aria-hidden="true"><i class="fa-solid fa-calendar-week"></i></span><span><strong>{{ filterCounts.week }}</strong><small>In the last 7 days</small></span></button>
</section>
<div class="ni-toolbar"><nav class="ni-tabs" aria-label="Notification categories"><button type="button" :class="{active:activeFilter==='all'}" :aria-pressed="activeFilter==='all'" @click="setFilter('all')"><i class="fa-solid fa-bell" aria-hidden="true"></i>All <span>{{ filterCounts.all }}</span></button><button v-for="f in FILTERS" :key="f.key" type="button" :class="{active:activeFilter===f.key}" :aria-pressed="activeFilter===f.key" @click="setFilter(f.key)"><i :class="['fa-solid',f.icon]" aria-hidden="true"></i>{{ f.label }}<span>{{ filterCounts[f.key] }}</span></button></nav><button class="ni-mark-all" type="button" :disabled="isMarkingAll || !filterCounts.unread" @click="markAllRead"><i :class="['fa-solid',isMarkingAll?'fa-spinner fa-spin':'fa-check-double']" aria-hidden="true"></i>Mark all read</button></div>
<p v-if="actionError" role="alert" class="ni-error">{{ actionError }}</p>
<div class="ni-controls">
 <label class="ni-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input v-model="search" type="search" placeholder="Search by message, reference, property or room" aria-label="Search notifications"></label>
 <select v-if="propertyOptions.length" v-model="property" class="ni-select-field" aria-label="Filter by property"><option value="all">All properties</option><option v-for="p in propertyOptions" :key="p" :value="p">{{ p }}</option><option v-if="hasUnlinked" :value="NO_PROPERTY">General notices (not one property)</option></select>
 <details class="ni-date"><summary :class="{set:datePreset!=='all'}"><i class="fa-regular fa-calendar" aria-hidden="true"></i><span>{{ dateSummary }}</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary><div><strong>Notification date</strong><div class="ni-presets" role="radiogroup" aria-label="Notification date"><label v-for="p in DATE_PRESETS" :key="p.key"><input v-model="datePreset" type="radio" name="ni-date-preset" :value="p.key">{{ p.label }}</label></div><div v-if="datePreset==='custom'" class="ni-custom"><label>From<input v-model="customFrom" type="date" aria-label="Notifications from"></label><label>To<input v-model="customTo" type="date" aria-label="Notifications to"></label></div><p v-if="invalidRange" role="alert">The start date must be on or before the end date.</p></div></details>
 <select v-model="sortOrder" class="ni-select-field" aria-label="Sort notifications"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
 <label class="ni-toggle"><input v-model="unreadOnly" type="checkbox" role="switch"><span class="ni-switch" aria-hidden="true"></span>Unread only</label>
 <label class="ni-toggle"><input v-model="actionOnly" type="checkbox" role="switch"><span class="ni-switch" aria-hidden="true"></span>Action requests</label>
 <button v-if="activeFilterCount" type="button" class="ni-reset" @click="resetInbox"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i>Reset filters</button>
</div>
<div v-if="selectedIds.length" class="ni-selection" role="status"><span>{{ selectedIds.length }} selected</span><button type="button" :disabled="markingSelected" @click="markSelectedRead">Mark selected read</button><button type="button" @click="selectedIds=[]">Clear selection</button></div>
<section class="ni-list" aria-label="Notifications">
<TablePager position="top" noun="notifications" :page="nfPage" :total-pages="nfTotalPages" :start="nfStart" :end="nfEnd" :total="visibleItems.length" :per-page="nfPerPage" @update:page="nfPage=$event" @update:per-page="nfPerPage=$event" />
<div class="ni-columns"><label><input type="checkbox" :checked="pageSelected" :indeterminate.prop="somePageSelected && !pageSelected" :disabled="!nfPaged.length" @change="togglePage" aria-label="Select notifications on this page"></label><span>Notification</span><span>Property / Room</span><span>Time</span><span></span></div>
<template v-for="group in nfGroups" :key="group.day || 'unknown'">
<h3 class="ni-day"><span>{{ group.label }}</span><small>{{ group.items.length }} {{ group.items.length===1 ? 'notification' : 'notifications' }}</small></h3>
<article v-for="notif in group.items" :key="notif.id" :class="['ni-row','tone-'+notif.tone.tone,{'is-unread':!notif.is_read}]">
<label class="ni-select"><input type="checkbox" v-model="selectedIds" :value="notif.id" :aria-label="'Select notification: '+notif.title"></label>
<div class="ni-content"><span class="ni-icon" aria-hidden="true"><i :class="['fa-solid',notif.tone.icon]"></i></span><div class="ni-copy"><div class="ni-title"><span v-if="!notif.is_read" class="ni-dot" aria-label="Unread"></span><h2>{{ notif.title }}</h2><span v-if="notif.tone.action && !notif.is_read" class="ni-flag">Action requested</span><span class="ni-category">{{ CATEGORY_LABEL[notif.meta.category] }}</span></div><p class="ni-preview"><MessageText :text="cleanMessage(notif.message)" /></p></div></div>
<div class="ni-property"><template v-if="notif.context.property"><strong>{{ notif.context.property }}</strong><span v-if="notif.context.room">{{ notif.context.room }}</span></template><span v-else class="ni-muted">{{ notif.context.allProperties ? 'All properties' : 'General notice' }}</span></div>
<time class="ni-time" :datetime="notif.created_at" :title="dateLabel(notif.created_at)"><span>{{ timeLabel(notif.created_at) }}</span></time>
<div class="ni-actions"><router-link v-if="getNotifTargetRoute(notif)" :to="getNotifTargetRoute(notif)" class="ni-view" @click="!notif.is_read && markRead(notif.id).catch(()=>{})">{{ actionLabel(notif) }}</router-link><details class="ni-more"><summary :aria-label="'Options for '+notif.title"><i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i></summary><div><button v-if="!notif.is_read" type="button" @click="markRead(notif.id).catch(()=>{})">Mark as read</button><span v-else>Already read</span></div></details></div>
</article>
</template>
<div v-if="!nfPaged.length" class="ni-empty"><i class="fa-solid fa-inbox" aria-hidden="true"></i><h2>{{ notifications.length?'No matching notifications':'No notifications yet' }}</h2><p>{{ invalidRange ? 'Fix the date range to see results.' : notifications.length?'Try another search, date or filter.':'Updates about your account and properties will appear here.' }}</p><button v-if="notifications.length && activeFilterCount" type="button" @click="resetInbox">Reset filters</button></div>
<TablePager position="bottom" noun="notifications" :page="nfPage" :total-pages="nfTotalPages" :start="nfStart" :end="nfEnd" :total="visibleItems.length" :per-page="nfPerPage" @update:page="nfPage=$event" @update:per-page="nfPerPage=$event" />
</section>
</template>

      </div>

      <p v-if="user.role==='student'" class="mt-16 text-center text-blue-700/40 font-semibold uppercase text-[12px] tracking-[0.4em]">End of Your Notifications</p>
    <Teleport to="body"><dialog ref="notificationDialog" class="ni-message-dialog" aria-labelledby="notification-message-heading" @cancel.prevent="closeMessage" @click="($event.target===notificationDialog) && closeMessage()"><template v-if="activeNotification"><header><span :class="['ni-dialog-icon','tone-'+activeNotification.tone.tone]" aria-hidden="true"><i :class="['fa-solid',activeNotification.tone.icon]"></i></span><div class="ni-dialog-heading"><span class="ni-dialog-category">{{ CATEGORY_LABEL[activeNotification.meta.category] }}</span><h2 id="notification-message-heading">{{ activeNotification.title }}</h2></div><button type="button" class="ni-dialog-close" aria-label="Close notification" @click="closeMessage"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></header><div class="ni-dialog-body"><dl><div><dt>Property / Room</dt><dd>{{ activeNotification.context.property || (activeNotification.context.allProperties ? 'All properties' : 'General notice') }}<span v-if="activeNotification.context.room"> &middot; {{ activeNotification.context.room }}</span></dd></div><div><dt>Date &amp; time</dt><dd>{{ dateLabel(activeNotification.created_at) }} &middot; {{ timeLabel(activeNotification.created_at) }}</dd></div></dl><p class="ni-full-message"><MessageText :text="cleanMessage(activeNotification.message)" /></p><p class="ni-dialog-history">This message records an event at the time shown. Open the related page to check its current status.</p></div><footer><button type="button" @click="closeMessage">Close</button><router-link v-if="getNotifTargetRoute(activeNotification)" :to="getNotifTargetRoute(activeNotification)" @click="closeMessage">{{ actionLabel(activeNotification) }} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></router-link></footer></template></dialog></Teleport>
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
</style>

<style scoped>
.nf-main{max-width:1680px!important;padding-top:28px!important;padding-bottom:36px!important}.notif-owner-theme{background:#f2f7fd!important}.ni-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}.ni-tabs{display:flex;gap:10px;flex-wrap:wrap}.ni-tabs button{display:inline-flex;align-items:center;justify-content:center;gap:9px;padding:9px 15px;min-height:40px;border:1px solid #dfe8f4;border-radius:999px;background:white;font:inherit;font-size:12.5px;font-weight:650;color:#4b617e;cursor:pointer;transition:background .15s,border-color .15s}.ni-tabs button>i{color:#7b8da6;font-size:13px}.ni-tabs button>span{display:grid;place-items:center;min-width:25px;height:25px;padding:0 7px;background:#edf3fb;border-radius:999px;font-size:12px;box-sizing:border-box}.ni-tabs button.active{color:#1558d6;background:#edf4ff;border-color:#3b7bff;box-shadow:inset 0 0 0 1px #3b7bff}.ni-tabs button.active>i{color:#2563eb}.ni-tabs button.active>span{background:#2563eb;color:white}.ni-tabs button:hover:not(.active){background:#f7faff;border-color:#bdd1ee}.ni-mark-all{display:inline-flex;align-items:center;gap:8px;padding:9px 13px;min-height:38px;border:1px solid #5684ff;border-radius:9px;background:white;color:#1d5bd6;font:inherit;font-size:12px;font-weight:650;cursor:pointer}.ni-mark-all:disabled{opacity:.5;cursor:default}
.ni-controls{display:flex;align-items:center;flex-wrap:wrap;gap:16px;padding:14px 16px;background:white;border:1px solid #e2eaf5;border-radius:12px;margin-bottom:14px;box-shadow:0 3px 12px #1f487005}.ni-search{display:flex;align-items:center;gap:10px;flex:1;max-width:560px;min-width:200px;border:1px solid #d9e4f2;border-radius:8px;padding:0 12px;height:38px;color:#7b8ca4}.ni-search input{flex:1;width:100%;min-width:0;border:0;background:transparent;padding:0;outline:none;font:inherit;font-size:13px;color:#203b5b;min-height:0!important}.ni-search:focus-within{border-color:#60a5fa;box-shadow:0 0 0 3px #dbeafe}.ni-toggle{display:inline-flex;align-items:center;gap:10px;color:#526985;font-size:12.5px;cursor:pointer;position:relative}.ni-toggle input{position:absolute;opacity:0;width:38px;height:24px;margin:0}.ni-switch{display:block;width:36px;height:21px;border-radius:999px;background:#a7b5c9;padding:3px;box-sizing:border-box;transition:background .15s}.ni-switch:before{content:'';display:block;width:15px;height:15px;background:white;border-radius:50%;box-shadow:0 1px 3px #33415533;transition:transform .15s}.ni-toggle input:checked+.ni-switch{background:#2563eb}.ni-toggle input:checked+.ni-switch:before{transform:translateX(15px)}.ni-toggle input:focus-visible+.ni-switch{outline:3px solid #93c5fd;outline-offset:3px}
.ni-list{background:white;border:1px solid #e1eaf5;border-radius:13px;overflow:visible;box-shadow:0 5px 20px #1b426208}.ni-list :deep(.tp-bar){font-size:12px;font-weight:500;padding:12px 16px;background:#fcfdff;gap:10px 16px}.ni-list :deep(.tp-bar.is-top){border-radius:13px 13px 0 0}.ni-list :deep(.tp-bar.is-bottom){border-radius:0 0 13px 13px}.ni-list :deep(.tp-pages button){font-size:12px;font-weight:650;height:32px;min-height:32px!important;min-width:32px;padding:0 9px}.ni-list :deep(.tp-rows select){font-size:12px;font-weight:600}.ni-columns,.ni-row{display:grid;grid-template-columns:24px minmax(280px,1fr) minmax(125px,.26fr) 130px minmax(120px,.22fr);align-items:center;gap:18px;padding:17px 20px}.ni-columns{background:#f3f7fc;border-bottom:1px solid #e5edf7;font-size:12px;color:#5a708c;font-weight:650}.ni-columns>span:first-of-type{padding-left:67px}.ni-columns input,.ni-select input{width:17px;height:17px;accent-color:#2563eb;border-radius:4px;cursor:pointer;margin:0}.ni-columns label,.ni-select{display:inline-flex;align-items:center;justify-content:center;min-height:32px}.ni-row{border-bottom:1px solid #e8eef7;padding-top:20px;padding-bottom:20px;min-width:0}.ni-row:last-of-type{border-bottom:0}.ni-row.is-unread{background:#fcfdff}.ni-row:hover{background:#f8fbff}.ni-content{display:flex;gap:12px;align-items:flex-start;min-width:0}.ni-dot{width:7px;height:7px;flex-shrink:0;border-radius:50%;margin-top:17px;background:transparent}.ni-dot.unread{background:#2563eb}.ni-icon{display:grid;place-items:center;width:40px;height:40px;flex-shrink:0;border-radius:11px;background:#f0f5fc;color:#8190a6;font-size:17px}.is-unread .ni-icon{background:#e8f1ff;color:#3277ed}.ni-copy{flex:1;min-width:0}.ni-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.ni-title h2{font-size:13.5px;font-weight:700;color:#183453;line-height:1.5;margin:0}.ni-category{display:inline-block;background:#eaf2ff;color:#2464d4;border-radius:999px;padding:3px 8px;font-size:10.5px;font-weight:600;line-height:1.3;white-space:nowrap}.ni-copy>p{margin:5px 0 0;font-size:12.5px;line-height:1.65;color:#526985;overflow-wrap:anywhere}.ni-property,.ni-time{display:flex;flex-direction:column;gap:4px;font-size:12px;line-height:1.5;color:#617690;min-width:0}.ni-property strong{font-weight:600;color:#3d5677;overflow-wrap:anywhere}.ni-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px}.ni-view{display:inline-flex;align-items:center;justify-content:center;padding:8px 10px;border-radius:7px;background:#2563eb;color:white;font-size:11px;font-weight:650;line-height:1.3;text-decoration:none;white-space:nowrap}.ni-view:hover{background:#1d4ed8}.ni-more{position:relative}.ni-more summary{display:grid;place-items:center;min-width:28px;min-height:32px;cursor:pointer;list-style:none;color:#58708e;border-radius:6px}.ni-more summary::-webkit-details-marker{display:none}.ni-more summary:hover{background:#eaf2ff}.ni-more>div{position:absolute;right:0;top:34px;z-index:25;min-width:145px;padding:6px;background:white;border:1px solid #d9e4f3;border-radius:8px;box-shadow:0 8px 22px #1434591a}.ni-more button,.ni-more>div>span{display:block;padding:8px 10px;font:inherit;font-size:12px;white-space:nowrap;color:#35557d;background:white;border:0;border-radius:5px}.ni-more button{cursor:pointer;width:100%;text-align:left}.ni-more button:hover{background:#eff6ff}.ni-selection{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;padding:10px 14px;border:1px solid #bfd6f7;border-radius:9px;background:#eff6ff;font-size:12px;color:#234a7e}.ni-selection button,.ni-empty button{padding:5px 9px;border:1px solid #bdd2ee;border-radius:6px;background:white;color:#1d4ed8;font:inherit;font-size:12px;cursor:pointer}.ni-error{padding:10px 14px;border:1px solid #fecaca;border-radius:8px;background:#fff5f5;color:#b91c1c;font-size:13px}.ni-empty{padding:40px 20px;text-align:center;color:#60738c}.ni-empty>i{font-size:25px;color:#91a5c2}.ni-empty h2{font-size:15px;font-weight:650;color:#294767;margin:12px 0 6px}.ni-empty p{font-size:13px;margin:0 0 14px}.ni-tabs button:focus-visible,.ni-mark-all:focus-visible,.ni-view:focus-visible,.ni-more summary:focus-visible,.ni-selection button:focus-visible{outline:3px solid #93c5fd;outline-offset:3px}
@media(max-width:1150px){.ni-columns,.ni-row{grid-template-columns:22px minmax(220px,1fr) 125px 110px 110px;gap:12px;padding-left:14px;padding-right:14px}.ni-content{gap:9px}.ni-icon{width:34px;height:34px;font-size:15px}.ni-columns>span:first-of-type{padding-left:57px}.ni-actions{gap:4px}.ni-view{font-size:10.5px;padding:8px}.ni-title h2{font-size:13px}}
@media(max-width:900px){.ni-columns{display:flex;gap:8px}.ni-columns>span{display:none}.ni-columns>span:first-of-type{display:block;padding-left:0}.ni-columns>span:first-of-type:after{content:' - select page'}.ni-row{grid-template-columns:24px minmax(0,1fr);align-items:start;gap:10px 8px;padding:16px}.ni-select{grid-column:1;grid-row:1}.ni-content{grid-column:2;grid-row:1}.ni-property,.ni-time,.ni-actions{grid-column:2;margin-left:50px}.ni-property:before{content:'Property / Room';font-size:10px;font-weight:600;color:#7c8fa9}.ni-property{gap:2px}.ni-time{flex-direction:row;flex-wrap:wrap;gap:7px;font-size:11px}.ni-actions{justify-content:space-between}.ni-more>div{top:35px}.ni-list :deep(.tp-bar){align-items:flex-start;gap:12px}.ni-list :deep(.tp-info){gap:10px}.ni-list :deep(.tp-pages){flex-wrap:wrap}.ni-controls{gap:14px}.ni-search{max-width:none;flex-basis:100%;min-width:0}.ni-tabs{gap:7px}.ni-tabs button{padding:7px 11px;font-size:12px}.ni-toolbar{gap:12px}.ni-mark-all{margin-left:auto}}
@media(pointer:coarse){.ni-view,.ni-more summary,.ni-tabs button,.ni-mark-all{min-height:44px;box-sizing:border-box}.ni-list :deep(.tp-pages button){height:40px;min-height:40px!important;min-width:40px}.ni-select,.ni-columns label{min-height:40px}.ni-more>div{top:44px}}
@media(prefers-reduced-motion:reduce){.ni-tabs button,.ni-switch,.ni-switch:before{transition:none}}
</style>

<style scoped>
.ni-copy>.ni-preview{display:block;white-space:pre-line;overflow-wrap:anywhere;line-height:1.65}.ni-read-message{display:inline-flex;align-items:center;gap:7px;margin-top:6px;padding:3px 0;border:0;background:transparent;color:#2464d4;font:inherit;font-size:11.5px;font-weight:600;line-height:1.4;cursor:pointer}.ni-read-message:hover{text-decoration:underline}.ni-read-message i{font-size:10px;text-decoration:none}.ni-read-message:focus-visible{outline:2px solid #60a5fa;outline-offset:3px;border-radius:3px}
.ni-message-dialog{width:min(640px,calc(100vw - 32px));max-height:85dvh;margin:auto;padding:0;border:1px solid #dce6f3;border-radius:15px;background:white;color:#213d5f;box-shadow:0 24px 80px #10274440;overflow:auto;font-family:'Plus Jakarta Sans',ui-sans-serif,system-ui,sans-serif;box-sizing:border-box}.ni-message-dialog::backdrop{background:#10243c80}.ni-message-dialog header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:20px 22px;border-bottom:1px solid #e5edf7}.ni-dialog-category{display:inline-block;font-size:11px;font-weight:650;color:#2563eb;margin-bottom:6px}.ni-message-dialog h2{font-size:18px;font-weight:700;line-height:1.45;margin:0;overflow-wrap:anywhere}.ni-dialog-close{display:grid;place-items:center;flex-shrink:0;width:32px;height:32px;padding:0;border:1px solid #dce6f3;border-radius:8px;background:white;color:#526b89;cursor:pointer}.ni-dialog-body{padding:18px 22px}.ni-dialog-body dl{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:0 0 18px;padding-bottom:16px;border-bottom:1px solid #edf2f8}.ni-dialog-body dt{font-size:11px;color:#617690;margin-bottom:5px}.ni-dialog-body dd{margin:0;color:#294a70;font-size:12px;font-weight:600;line-height:1.6;overflow-wrap:anywhere}.ni-full-message{margin:0;font-size:13.5px;line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere;color:#334e6e}.ni-dialog-history{font-size:11.5px;line-height:1.65;color:#617690;padding:11px 12px;background:#f5f8fd;border-radius:8px;margin:18px 0 0}.ni-message-dialog footer{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:9px;padding:14px 22px;border-top:1px solid #e5edf7;background:#fbfdff}.ni-message-dialog footer button,.ni-message-dialog footer a{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:8px 12px;border:1px solid #d3dfef;border-radius:8px;font:inherit;font-size:12px;font-weight:600;line-height:1.4;background:white;color:#35567f;cursor:pointer;text-decoration:none}.ni-message-dialog footer a{background:#2563eb;border-color:#2563eb;color:white}.ni-message-dialog button:focus-visible,.ni-message-dialog a:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}@media(max-width:639px){.ni-message-dialog header,.ni-dialog-body{padding:16px}.ni-dialog-body dl{grid-template-columns:1fr}.ni-message-dialog footer{padding:12px 16px}.ni-message-dialog h2{font-size:16px}}@media(pointer:coarse){.ni-read-message{min-height:36px}.ni-dialog-close{width:40px;height:40px}.ni-message-dialog footer button,.ni-message-dialog footer a{min-height:44px;box-sizing:border-box}}
</style>

<style scoped>
/* Redesigned owner/admin inbox: summary, filter bar, day groups, event tones (palette shared with owner badges). */
.ni-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:16px}
.ni-stat{display:flex;align-items:center;gap:12px;padding:14px 16px;border:1px solid #e1eaf5;border-radius:12px;background:#fff;font:inherit;text-align:left;cursor:pointer;box-shadow:0 3px 12px #1f487008;transition:border-color .15s,box-shadow .15s}
.ni-stat:hover{border-color:#bdd1ee}.ni-stat.active{border-color:#3b7bff;box-shadow:inset 0 0 0 1px #3b7bff}
.ni-stat strong{display:block;font-size:20px;font-weight:700;line-height:1.2;color:#163454;font-variant-numeric:tabular-nums}.ni-stat small{display:block;font-size:12px;color:#5a708c;font-weight:550}
.ni-stat-icon{display:grid;place-items:center;flex-shrink:0;width:40px;height:40px;border-radius:11px;font-size:16px}
.ni-stat-icon.blue{background:#dbeafe;color:#1d4ed8}.ni-stat-icon.amber{background:#fef3c7;color:#b45309}.ni-stat-icon.green{background:#dcfce7;color:#15803d}
.ni-controls{gap:10px!important}
.ni-select-field,.ni-date>summary{height:38px;padding:0 12px;border:1px solid #d9e4f2;border-radius:8px;background:#fff;font:inherit;font-size:12.5px;font-weight:550;color:#203b5b;box-sizing:border-box;cursor:pointer}
.ni-select-field{appearance:none;padding-right:30px;max-width:220px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 16 16'%3E%3Cpath d='m4 6 4 4 4-4' fill='none' stroke='%23657b94' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center}
.ni-date{position:relative}.ni-date>summary{display:flex;align-items:center;gap:8px;list-style:none;white-space:nowrap}.ni-date>summary::-webkit-details-marker{display:none}.ni-date>summary i{font-size:11px;color:#7b8ca4}.ni-date>summary.set{border-color:#3b7bff;color:#1558d6;background:#f5f9ff}
.ni-date>div{position:absolute;left:0;top:44px;z-index:30;width:260px;display:grid;gap:10px;padding:14px;border:1px solid #d9e4f3;border-radius:10px;background:#fff;box-shadow:0 12px 32px #102e501c}
.ni-date strong{font-size:12px;color:#183453}.ni-presets{display:grid;gap:2px}.ni-presets label{display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:6px;font-size:12.5px;color:#35557d;cursor:pointer}.ni-presets label:hover{background:#f3f7fd}.ni-presets input{accent-color:#2563eb;margin:0}
.ni-custom{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ni-custom label{display:grid;gap:4px;font-size:11.5px;color:#5a708c}.ni-custom input{padding:6px 7px;border:1px solid #d6e3f2;border-radius:7px;font:inherit;font-size:12px;min-width:0}.ni-date p{margin:0;font-size:11.5px;color:#b91c1c}
.ni-reset{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 12px;border:1px solid #dfe8f4;border-radius:8px;background:#fff;color:#1d4ed8;font:inherit;font-size:12px;font-weight:600;cursor:pointer}.ni-reset:hover{background:#f5f9ff}
.ni-day{display:flex;align-items:baseline;gap:10px;margin:0;padding:10px 20px;background:#f8fbff;border-bottom:1px solid #e8eef7;font-size:12px;font-weight:700;color:#294a70;letter-spacing:.01em}.ni-day small{font-size:11px;font-weight:500;color:#7c8fa9}
.ni-row{position:relative}.ni-row.is-unread{background:#fbfdff}.ni-row.is-unread:before{content:'';position:absolute;left:0;top:12px;bottom:12px;width:3px;border-radius:0 3px 3px 0;background:#2563eb}
.ni-row .ni-icon{background:#f1f5f9;color:#64748b}
.tone-info .ni-icon,.ni-dialog-icon.tone-info{background:#dbeafe;color:#1d4ed8}.tone-success .ni-icon,.ni-dialog-icon.tone-success{background:#dcfce7;color:#15803d}.tone-warning .ni-icon,.ni-dialog-icon.tone-warning{background:#fef3c7;color:#b45309}.tone-danger .ni-icon,.ni-dialog-icon.tone-danger{background:#fee2e2;color:#b91c1c}.tone-extension .ni-icon,.ni-dialog-icon.tone-extension{background:#ede9fe;color:#6d28d9}.tone-neutral .ni-icon,.ni-dialog-icon.tone-neutral{background:#f1f5f9;color:#475569}
.ni-row:not(.is-unread) .ni-icon{opacity:.75}.ni-row:not(.is-unread) .ni-title h2{color:#3d5677;font-weight:650}
.ni-title .ni-dot{display:inline-block;width:8px;height:8px;margin:0;border-radius:50%;background:#2563eb;flex-shrink:0}
.ni-flag{display:inline-block;padding:3px 8px;border-radius:999px;background:#fef3c7;color:#b45309;font-size:10.5px;font-weight:650;line-height:1.3;white-space:nowrap}
.ni-category{background:#f1f5f9!important;color:#526985!important}
.ni-muted{color:#8a9bb2;font-style:italic}.ni-time span{font-variant-numeric:tabular-nums;font-weight:600;color:#3d5677}
.ni-columns>span:first-of-type{padding-left:52px!important}
.ni-message-dialog header{align-items:center}.ni-dialog-heading{flex:1;min-width:0}.ni-dialog-icon{display:grid;place-items:center;flex-shrink:0;width:40px;height:40px;border-radius:11px;font-size:16px}
.ni-stat:focus-visible,.ni-select-field:focus-visible,.ni-date>summary:focus-visible,.ni-reset:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}
@media(max-width:900px){.ni-summary{grid-template-columns:1fr 1fr 1fr;gap:8px}.ni-stat{padding:10px 12px;gap:9px}.ni-stat-icon{width:32px;height:32px;font-size:13px}.ni-stat strong{font-size:17px}.ni-select-field{max-width:none;flex:1 1 45%}.ni-date{flex:1 1 45%}.ni-date>summary{width:100%;justify-content:space-between}.ni-day{padding:9px 16px}.ni-property,.ni-time,.ni-actions{margin-left:52px!important}}
@media(max-width:560px){.ni-summary{grid-template-columns:1fr}.ni-date>div{width:min(260px,calc(100vw - 48px))}}
@media(pointer:coarse){.ni-select-field,.ni-date>summary,.ni-reset,.ni-stat{min-height:44px}}
@media(prefers-reduced-motion:reduce){.ni-stat{transition:none}}
/* Phone / PWA only (desktop unchanged): three summary tiles in one row, scrollable category tabs, tighter list */
@media(max-width:560px){
.nf-main{padding-top:14px!important}
.ni-summary{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}
.ni-stat{flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:10px 6px;text-align:center}
.ni-stat-icon{width:30px;height:30px;font-size:13px;border-radius:9px}
.ni-stat strong{font-size:18px}
.ni-stat small{font-size:10.5px;line-height:1.3}
.ni-toolbar{gap:8px;margin-bottom:12px}
.ni-tabs{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;width:100%}
.ni-tabs button{grid-column:span 2;min-width:0;padding:7px 6px;gap:6px;font-size:11.5px}
.ni-tabs button:nth-child(n+4){grid-column:span 3}
.ni-tabs button:nth-child(n+4):last-child:nth-child(4){grid-column:span 6}
.ni-mark-all{width:100%;justify-content:center}
.ni-controls{padding:10px;gap:8px!important;margin-bottom:12px}
.ni-search{flex-basis:100%;max-width:none;min-width:0}
.ni-toggle{flex:1 1 40%;font-size:12px}
.ni-row{padding:12px;gap:8px}
.ni-icon{width:32px;height:32px;font-size:13px}
.ni-property,.ni-time,.ni-actions{margin-left:0!important}
.ni-day{padding:8px 12px}
}
</style>
