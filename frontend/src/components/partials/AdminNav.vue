
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
  <ManagementNavigation role="admin" :open="sidebarOpen" :unread-count="unreadNotifCount" @toggle="sidebarOpen = !sidebarOpen" @close="closeSidebar" @logout="triggerLogoutConfirm" />
  <!-- Secure Logout Confirm Modal Overlay -->
  <div v-management-dialog="{ close: () => showConfirmModal = false }" v-if="showConfirmModal" class="is-admin admin-dialog-backdrop z-[9999]">
    <div class="admin-dialog max-w-sm" style="padding: 28px; text-align: center;">
      <div class="admin-confirm-icon" aria-hidden="true"><i class="fa-solid fa-right-from-bracket"></i></div>
      <h2 class="text-lg font-bold mb-2" style="color: var(--a-heading);">Sign out?</h2>
      <p class="text-[13px] mb-6" style="color: var(--a-muted);">You will be returned to the login page.</p>
      <div class="flex gap-3">
        <button type="button" @click="showConfirmModal = false" class="admin-btn admin-btn-secondary flex-1">
          Cancel
        </button>
        <button type="button" @click="handleLogout" class="admin-btn admin-btn-danger flex-1">
          Sign out
        </button>
      </div>
    </div>
  </div>
</template>
