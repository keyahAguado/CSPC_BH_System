
<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { confirmTone } from '../../utils/confirmTone.js';
import { useRouter, useRoute } from 'vue-router';
import { useUnreadNotifications } from '../../utils/useUnreadNotifications.js';
import FlashAlert from './FlashAlert.vue';
import ManagementNavigation from '../management/ManagementNavigation.vue';
import { vManagementDialog } from '../management/dialogAccessibility.js';

const router = useRouter();
const route = useRoute();
const unreadNotifCount = useUnreadNotifications();
const alertRef = ref(null);
const showConfirmModal = ref(false); // Controls the minimalist logout overlay modal


// Mobile sidebar state
const sidebarOpen = ref(false);



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

// Close sidebar on outside click
const handleOutsideClick = (e) => {
  if (sidebarOpen.value && !e.target.closest('.mobile-sidebar') && !e.target.closest('.hamburger-btn')) {
    sidebarOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleOutsideClick);
});

onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick);
});
</script>

<template>
  <div aria-live="polite" aria-atomic="false"><FlashAlert ref="alertRef" /></div>
  <ManagementNavigation role="admin" :open="sidebarOpen" :unread-count="unreadNotifCount" @toggle="sidebarOpen = !sidebarOpen" @close="closeSidebar" @logout="triggerLogoutConfirm" />
  <!-- Secure Logout Confirm Modal Overlay -->
  <div v-management-dialog="{ close: () => showConfirmModal = false }" v-if="showConfirmModal" class="cm-backdrop">
    <div class="cm-panel popup-panel" role="dialog" aria-modal="true">
      <div class="cm-body">
        <span :class="['cm-icon', confirmTone('Sign out?').tone]" aria-hidden="true"><i :class="['fa-solid', confirmTone('Sign out?').icon]"></i></span>
        <div><h3 class="cm-title">{{ 'Sign out?' }}</h3><p class="cm-message popup-message">You will be signed out and returned to the login page.</p></div>
      </div>
      <div class="cm-actions">
        <button type="button" class="cm-btn cm-cancel" @click="showConfirmModal = false">Cancel</button>
        <button type="button" :class="['cm-btn', confirmTone('Sign out?').button]" @click="handleLogout">Sign out</button>
      </div>
    </div>
  </div>
</template>
