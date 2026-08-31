<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import axios from 'axios';
import FlashAlert from './FlashAlert.vue';

const router = useRouter();
const route = useRoute();
const unreadNotifCount = ref(0);
const alertRef = ref(null);
const showConfirmModal = ref(false); // Controls the minimalist logout overlay modal
const token = localStorage.getItem('cspc_token');

// Mobile sidebar state
const sidebarOpen = ref(false);

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
  localStorage.clear();
  sessionStorage.clear();
  showConfirmModal.value = false;
  sidebarOpen.value = false;
  window.location.replace('/login-options');
};

const triggerLogoutConfirm = () => {
  showConfirmModal.value = true;
  sidebarOpen.value = false;
};

const closeSidebar = () => {
  sidebarOpen.value = false;
};

const navigateTo = (path) => {
  router.push(path);
  sidebarOpen.value = false;
};

// Real-time notification updates
let pollInterval = null;

const handleNotificationEvent = () => {
  fetchUnreadCount();
};

// Close sidebar on outside click
const handleOutsideClick = (e) => {
  if (sidebarOpen.value && !e.target.closest('.mobile-sidebar') && !e.target.closest('.hamburger-btn')) {
    sidebarOpen.value = false;
  }
};

onMounted(() => {
  fetchUnreadCount();
  pollInterval = setInterval(fetchUnreadCount, 2000);
  window.addEventListener('notification-updated', handleNotificationEvent);
  document.addEventListener('click', handleOutsideClick);
});

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
  window.removeEventListener('notification-updated', handleNotificationEvent);
  document.removeEventListener('click', handleOutsideClick);
});
</script>

<template>
  <FlashAlert ref="alertRef" />

  <!-- ===================== DESKTOP NAV (hidden on mobile) ===================== -->
  <nav class="hidden md:flex bg-[#1e4a8d] px-4 sm:px-6 md:px-10 py-4 flex-wrap sm:flex-nowrap justify-between items-center text-white shadow-md sticky top-0 z-50 gap-3 border-b border-blue-900/40">
    <router-link to="/" class="flex items-center gap-2.5 min-w-0 hover:opacity-90 transition group">
      <img src="/img/CSPC_logo.png" alt="Logo" class="w-8 h-8 sm:w-9 sm:h-9 object-contain bg-white/10 rounded-full p-0.5 flex-shrink-0 group-hover:scale-105 transition" />
      <span class="font-bold text-xs sm:text-[13px] tracking-tight uppercase truncate">CSPC'S BOARDING HOUSE SELECTION</span>
    </router-link>
    <div class="flex gap-4 sm:gap-6 md:gap-10 text-xs sm:text-[13px] font-semibold items-center w-full sm:w-auto py-1 sm:py-0">
      <router-link to="/owner/dashboard" class="hover:text-blue-200 transition whitespace-nowrap">Home</router-link>
      <router-link to="/owner/bookings" class="hover:text-blue-200 transition whitespace-nowrap">Bookings</router-link>
      <router-link to="/owner/profile" class="hover:text-blue-200 transition whitespace-nowrap">Profile</router-link>
      <router-link to="/owner/notifications" class="hover:text-blue-200 transition relative whitespace-nowrap">
        Notification
        <span v-if="unreadNotifCount > 0" class="absolute -top-1 -right-3 bg-red-500 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center border border-white shadow-sm">
          {{ unreadNotifCount }}
        </span>
      </router-link>
      <button @click="triggerLogoutConfirm" class="hover:text-red-300 transition focus:outline-none cursor-pointer bg-transparent border-0 whitespace-nowrap">Logout</button>
    </div>
  </nav>

  <!-- ===================== MOBILE HEADER (visible only on mobile) ===================== -->
  <header class="mobile-header md:hidden fixed top-0 left-0 right-0 z-50 bg-[#1e4a8d] shadow-lg">
    <div class="flex items-center gap-3 px-4 py-3">
      <!-- Hamburger Button -->
      <button
        class="hamburger-btn flex items-center justify-center w-9 h-9 rounded-lg text-white hover:bg-white/10 transition-colors flex-shrink-0 focus:outline-none"
        @click.stop="sidebarOpen = !sidebarOpen"
        aria-label="Toggle menu"
      >
        <svg v-if="!sidebarOpen" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <!-- Logo -->
      <img src="/img/CSPC_logo.png" alt="CSPC Logo" class="w-8 h-8 object-contain bg-white/10 rounded-full p-0.5 flex-shrink-0" />

      <!-- Title -->
      <span class="font-bold text-white text-xs tracking-tight uppercase leading-tight">CSPC'S BOARDING HOUSE SELECTION</span>
    </div>
  </header>

  <!-- Spacer so content doesn't go under fixed mobile header -->
  <div class="md:hidden h-[56px]"></div>

  <!-- ===================== MOBILE SIDEBAR OVERLAY ===================== -->
  <transition name="fade-overlay">
    <div
      v-if="sidebarOpen"
      class="md:hidden fixed inset-0 bg-black/50 z-[60] backdrop-blur-sm"
      @click="closeSidebar"
    ></div>
  </transition>

  <!-- ===================== MOBILE SIDEBAR PANEL ===================== -->
  <transition name="slide-sidebar">
    <nav
      v-if="sidebarOpen"
      class="mobile-sidebar md:hidden fixed top-0 left-0 h-full w-72 bg-[#1a3f7a] z-[70] shadow-2xl flex flex-col overflow-y-auto"
    >
      <!-- Sidebar Header -->
      <div class="flex items-center gap-3 px-5 py-4 bg-[#1e4a8d] border-b border-white/10">
        <img src="/img/CSPC_logo.png" alt="CSPC Logo" class="w-9 h-9 object-contain bg-white/10 rounded-full p-0.5 flex-shrink-0" />
        <div class="min-w-0">
          <p class="text-white font-black text-xs uppercase tracking-tight leading-tight">CSPC'S BOARDING HOUSE SELECTION</p>
          <p class="text-blue-200 text-[10px] mt-0.5">Owner Portal</p>
        </div>
      </div>

      <!-- Nav Items -->
      <div class="flex flex-col flex-1 px-3 py-4 gap-1">

        <button
          @click="navigateTo('/owner/dashboard')"
          :class="[
            'flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left text-sm font-semibold transition-all duration-200',
            route.path === '/owner/dashboard'
              ? 'bg-white/20 text-white shadow-sm'
              : 'text-blue-100 hover:bg-white/10 hover:text-white'
          ]"
        >
          <i class="fa-solid fa-house w-5 text-center text-base"></i>
          <span>Home</span>
        </button>

        <button
          @click="navigateTo('/owner/bookings')"
          :class="[
            'flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left text-sm font-semibold transition-all duration-200',
            route.path === '/owner/bookings'
              ? 'bg-white/20 text-white shadow-sm'
              : 'text-blue-100 hover:bg-white/10 hover:text-white'
          ]"
        >
          <i class="fa-solid fa-calendar-check w-5 text-center text-base"></i>
          <span>Bookings</span>
        </button>

        <button
          @click="navigateTo('/owner/profile')"
          :class="[
            'flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left text-sm font-semibold transition-all duration-200',
            route.path === '/owner/profile'
              ? 'bg-white/20 text-white shadow-sm'
              : 'text-blue-100 hover:bg-white/10 hover:text-white'
          ]"
        >
          <i class="fa-solid fa-user w-5 text-center text-base"></i>
          <span>Profile</span>
        </button>

        <button
          @click="navigateTo('/owner/notifications')"
          :class="[
            'flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left text-sm font-semibold transition-all duration-200 relative',
            route.path === '/owner/notifications'
              ? 'bg-white/20 text-white shadow-sm'
              : 'text-blue-100 hover:bg-white/10 hover:text-white'
          ]"
        >
          <i class="fa-solid fa-bell w-5 text-center text-base"></i>
          <span>Notification</span>
          <span v-if="unreadNotifCount > 0" class="ml-auto bg-red-500 text-white text-[9px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center border border-white/30 shadow-sm">
            {{ unreadNotifCount }}
          </span>
        </button>

      </div>

      <!-- Divider + Logout -->
      <div class="px-3 pb-6 border-t border-white/10 pt-3">
        <button
          @click="triggerLogoutConfirm"
          class="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left text-sm font-semibold text-red-300 hover:bg-red-500/20 hover:text-red-200 transition-all duration-200"
        >
          <i class="fa-solid fa-right-from-bracket w-5 text-center text-base"></i>
          <span>Logout</span>
        </button>
      </div>
    </nav>
  </transition>

  <!-- Secure Logout Confirm Modal Overlay -->
  <div v-if="showConfirmModal" class="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in text-left">
    <div class="bg-[#f8fafc] rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border border-slate-100 animate-in zoom-in duration-300">
      <div class="text-[#d9534f] mb-4 flex justify-center">
        <i class="fa-solid fa-circle-exclamation text-5xl text-red-500"></i>
      </div>
      <h2 class="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">Logout session?</h2>
      <p class="text-slate-500 mb-6 text-sm">You will be redirected to the login page.</p>
      
      <div class="flex gap-3 justify-center">
        <button @click="handleLogout" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-6 rounded-xl transition text-xs uppercase tracking-widest flex-1 shadow-md shadow-red-100 cursor-pointer">
          Yes, Logout
        </button>
        <button @click="showConfirmModal = false" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2.5 px-6 rounded-xl transition text-xs uppercase tracking-widest flex-1 cursor-pointer">
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<style>
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.animate-fade-in {
  animation: fadeIn 0.25s ease-out forwards;
}

/* Sidebar slide-in/out animation */
.slide-sidebar-enter-active,
.slide-sidebar-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-sidebar-enter-from,
.slide-sidebar-leave-to {
  transform: translateX(-100%);
}
.slide-sidebar-enter-to,
.slide-sidebar-leave-from {
  transform: translateX(0);
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