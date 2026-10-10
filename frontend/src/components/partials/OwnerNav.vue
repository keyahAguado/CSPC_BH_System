<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import axios from 'axios';
import FlashAlert from './FlashAlert.vue';
import ManagementNavigation from '../management/ManagementNavigation.vue';
import { vManagementDialog } from '../management/dialogAccessibility.js';

const router = useRouter();
const route = useRoute();
const unreadNotifCount = ref(0);
const alertRef = ref(null);
const showConfirmModal = ref(false); // Controls the minimalist logout overlay modal
const token = sessionStorage.getItem('cspc_token');

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
  sessionStorage.removeItem('cspc_token');
  sessionStorage.removeItem('user_role');
  sessionStorage.removeItem('cspc_user');
  localStorage.clear();
  sessionStorage.clear();
  showConfirmModal.value = false;
  sidebarOpen.value = false;
  router.replace('/login');
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
  <div aria-live="polite" aria-atomic="false"><FlashAlert ref="alertRef" /></div>
  <ManagementNavigation role="owner" :open="sidebarOpen" :unread-count="unreadNotifCount" @toggle="sidebarOpen = !sidebarOpen" @close="closeSidebar" @logout="triggerLogoutConfirm" />
  <!-- Secure Logout Confirm Modal Overlay -->
  <div v-management-dialog="{ close: () => showConfirmModal = false }" v-if="showConfirmModal" class="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in text-left">
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
