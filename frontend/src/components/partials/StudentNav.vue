<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { confirmTone } from '../../utils/confirmTone.js';
import { useRouter, useRoute } from 'vue-router';
import axios from 'axios';
import FlashAlert from './FlashAlert.vue';
import Header from './Header.vue';

const router = useRouter();
const route = useRoute();

// Mobile bottom tab bar
const tabs = [
  { label: 'Home', to: '/student/dashboard', icon: 'fa-house', iconStyle: 'fa-solid', active: () => route.path === '/student/dashboard' || route.path.startsWith('/student/house/') || route.path.startsWith('/student/book/') },
  { label: 'My Bookings', to: '/student/bookings', icon: 'fa-calendar-check', iconStyle: 'fa-regular', active: () => route.path.startsWith('/student/bookings') },
  { label: 'Profile', to: '/student/profile', icon: 'fa-user', iconStyle: 'fa-regular', active: () => route.path === '/student/profile' }
];
const unreadNotifCount = ref(0);
const alertRef = ref(null);
const showConfirmModal = ref(false); // Controls the minimalist logout overlay modal
const token = sessionStorage.getItem('cspc_token');


const fetchUnreadCount = async () => {
  if (!token) return;
  try {
    const response = await axios.get('/api/notifications/unread-count', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.data.success) {
      unreadNotifCount.value = response.data.count || 0;
    }
  } catch (error) {
    console.warn('Notifications unread count failed to load.');
  }
};

const handleLogout = () => {
  sessionStorage.removeItem('cspc_token');
  sessionStorage.removeItem('user_role');
  sessionStorage.removeItem('cspc_user');
  localStorage.clear();
  sessionStorage.clear();
  showConfirmModal.value = false;
  router.replace('/login');
};

const triggerLogoutConfirm = () => {
  showConfirmModal.value = true;
};

// Real-time notification updates
let pollInterval = null;

const handleNotificationEvent = () => {
  fetchUnreadCount();
};

onMounted(() => {
  // Leaves room at the bottom of the page for the mobile tab bar
  if (token) document.body.classList.add('has-student-tabbar');
  fetchUnreadCount();
  pollInterval = setInterval(fetchUnreadCount, 2000);
  window.addEventListener('notification-updated', handleNotificationEvent);
});

onUnmounted(() => {
  document.body.classList.remove('has-student-tabbar');
  if (pollInterval) clearInterval(pollInterval);
  window.removeEventListener('notification-updated', handleNotificationEvent);
});
</script>

<template>
  <!-- Guest Navbar (Matches Index page Header) -->
  <Header v-if="!token" />

  <!-- Logged-in Student Navigation -->
  <template v-else>
    <FlashAlert ref="alertRef" />

    <!-- ===================== DESKTOP NAV (hidden on mobile) ===================== -->
  <nav class="student-topbar hidden md:flex px-6 md:px-10 h-[72px] justify-between items-center text-white shadow-md sticky top-0 z-50 gap-6">
    <router-link to="/student/dashboard" class="flex items-center gap-3 group focus:outline-none" aria-label="CSPC BH Finder, Student home">
      <span class="w-11 h-11 rounded-xl bg-white flex items-center justify-center shadow-sm flex-shrink-0 transition-transform group-hover:scale-105">
        <img src="/img/cspc_bh_finder_icon.png" alt="" class="w-9 h-9 object-contain" />
      </span>
      <span class="text-left">
        <span class="block text-[18px] font-extrabold text-white tracking-tight leading-tight">CSPC BH Finder</span>
        <span class="block text-[12.5px] text-blue-100/90 font-medium leading-tight">Student</span>
      </span>
    </router-link>
    <div class="flex gap-6 lg:gap-10 text-[13px] font-semibold items-center">
      <router-link to="/student/dashboard" class="hover:text-blue-200 transition whitespace-nowrap">Home</router-link>
      <router-link to="/student/profile" class="hover:text-blue-200 transition whitespace-nowrap">Profile</router-link>
      <router-link to="/student/bookings" class="hover:text-blue-200 transition whitespace-nowrap">My Bookings</router-link>
      <router-link to="/student/notifications" class="hover:text-blue-200 transition relative whitespace-nowrap">
        Notifications
        <span v-if="unreadNotifCount > 0" class="absolute -top-2.5 -right-5 min-w-[20px] h-[20px] px-1.5 rounded-full bg-[#f5b82e] text-[#1b2a4a] text-[11px] font-extrabold flex items-center justify-center shadow-sm">
          {{ unreadNotifCount }}
        </span>
      </router-link>
      <button @click="triggerLogoutConfirm" class="hover:text-red-300 transition focus:outline-none cursor-pointer bg-transparent border-0 whitespace-nowrap">Logout</button>
    </div>
  </nav>

  <!-- ===================== MOBILE HEADER (visible only on mobile) ===================== -->
  <header class="mobile-header student-topbar md:hidden fixed top-0 left-0 right-0 z-50 shadow-lg">
    <div class="relative flex items-center gap-2 pl-4 pr-3 h-[64px]">
      <router-link to="/student/dashboard" class="flex items-center gap-3 min-w-0 flex-1 focus:outline-none" aria-label="CSPC BH Finder, Student home">
        <span class="w-11 h-11 rounded-xl bg-white flex items-center justify-center shadow-sm flex-shrink-0">
          <img src="/img/cspc_bh_finder_icon.png" alt="" class="w-9 h-9 object-contain" />
        </span>
        <span class="text-left min-w-0">
          <span class="block text-[18px] font-extrabold text-white tracking-tight leading-tight truncate">CSPC BH Finder</span>
          <span class="block text-[12.5px] text-blue-100/90 font-medium leading-tight truncate">Student</span>
        </span>
      </router-link>

      <router-link
        to="/student/notifications"
        class="relative flex items-center justify-center w-11 h-11 rounded-full text-white hover:bg-white/10 transition-colors flex-shrink-0"
        :aria-label="unreadNotifCount > 0 ? `Notifications, ${unreadNotifCount} unread` : 'Notifications'"
      >
        <i class="fa-regular fa-bell text-[21px]" aria-hidden="true"></i>
        <span v-if="unreadNotifCount > 0" class="absolute top-1 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#f5b82e] text-[#1b2a4a] text-[10.5px] font-extrabold flex items-center justify-center" aria-hidden="true">{{ unreadNotifCount > 9 ? '9+' : unreadNotifCount }}</span>
      </router-link>

    </div>
  </header>

  <!-- Spacer so content doesn't go under fixed mobile header -->
  <div class="md:hidden h-[64px]"></div>

  <!-- ===================== MOBILE BOTTOM TAB BAR ===================== -->
  <nav class="student-tabbar md:hidden" aria-label="Student">
    <router-link
      v-for="tab in tabs"
      :key="tab.label"
      :to="tab.to"
      class="student-tab"
      :class="{ 'is-active': tab.active() }"
      :aria-current="tab.active() ? 'page' : undefined"
    >
      <i :class="[tab.active() ? 'fa-solid' : tab.iconStyle, tab.icon]" aria-hidden="true"></i>
      <span>{{ tab.label }}</span>
    </router-link>
    <button type="button" class="student-tab" @click="triggerLogoutConfirm">
      <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
      <span>Logout</span>
    </button>
  </nav>

  <!-- Secure Logout Confirm Modal Overlay -->
  <div v-if="showConfirmModal" class="cm-backdrop">
    <div class="cm-panel popup-panel" role="dialog" aria-modal="true">
      <div class="cm-body">
        <span :class="['cm-icon', confirmTone('Log out?').tone]" aria-hidden="true"><i :class="['fa-solid', confirmTone('Log out?').icon]"></i></span>
        <div><h3 class="cm-title">{{ 'Log out?' }}</h3><p class="cm-message popup-message">You will be signed out and redirected to the login page.</p></div>
      </div>
      <div class="cm-actions">
        <button type="button" class="cm-btn cm-cancel" @click="showConfirmModal = false">Cancel</button>
        <button type="button" :class="['cm-btn', confirmTone('Log out?').button]" @click="handleLogout">Log out</button>
      </div>
    </div>
  </div>
  </template>
</template>

<style>
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.animate-fade-in {
  animation: fadeIn 0.25s ease-out forwards;
}

/* Mobile top bar: navy gradient with a soft decorative circle */
.student-topbar { background: radial-gradient(circle at 88% -60%, rgb(255 255 255 / .07) 0 60%, transparent 60.5%), linear-gradient(135deg, #142b4a 0%, #1b3a6b 55%, #1e4a8d 100%); }


/* Mobile bottom tab bar. Its height is shared (via --student-tabbar-h) with anything
   that sits on top of it, e.g. the Book Now bar and the map page, so they line up exactly. */
:root { --student-tabbar-h: 64px; }
.student-tabbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 55; box-sizing: border-box; height: calc(var(--student-tabbar-h) + env(safe-area-inset-bottom)); display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); background: #fff; border-top: 1px solid #e2e8f0; box-shadow: 0 -4px 18px rgb(15 47 102 / .06); padding: 6px 4px calc(6px + env(safe-area-inset-bottom)); }
/* White fill below the bar so page content never shows under it (e.g. while the browser toolbar resizes) */
.student-tabbar::after { content: ''; position: absolute; left: 0; right: 0; top: 100%; height: 120px; background: #fff; }
.student-tab { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 0; padding: 4px 2px; color: #475569; font-size: 11px; font-weight: 500; text-decoration: none; text-align: center; line-height: 1.15; border-radius: 12px; }
.student-tab i { font-size: 20px; }
.student-tab span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.student-tab.is-active { color: #1d4ed8; font-weight: 700; }
.student-tab, .student-tab:hover, .student-tab:focus, .student-tab:focus-visible, .student-tab:active { outline: none; box-shadow: none; -webkit-tap-highlight-color: transparent; }
@media (max-width: 767px) {
  body.has-student-tabbar { padding-bottom: calc(var(--student-tabbar-h) + env(safe-area-inset-bottom)); }
}


/* Overlay fade animation */
.fade-overlay-enter-active,
.fade-overlay-leave-active {
  transition: opacity 0.25s ease;
}
.fade-overlay-enter-from,
.fade-overlay-leave-to {
  opacity: 0;
}
.fade-overlay-enter-to,
.fade-overlay-leave-from {
  opacity: 1;
}
</style>
