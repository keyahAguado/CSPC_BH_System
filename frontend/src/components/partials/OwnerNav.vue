<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { confirmTone } from '../../utils/confirmTone.js';
import { simulatedBookingTime } from '../../utils/bookingClock.js';
import { useRouter, useRoute } from 'vue-router';
import { useUnreadNotifications } from '../../utils/useUnreadNotifications.js';
import FlashAlert from './FlashAlert.vue';
import ManagementNavigation from '../management/ManagementNavigation.vue';
import { vManagementDialog } from '../management/dialogAccessibility.js';

// Shown on this computer whenever the backend reports the test clock as on (it sends the test time with each response).
const showTestClock = computed(() => ['localhost','127.0.0.1','[::1]'].includes(window.location.hostname) && !!simulatedBookingTime.value);
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
  <ManagementNavigation role="owner" :open="sidebarOpen" :unread-count="unreadNotifCount" @toggle="sidebarOpen = !sidebarOpen" @close="closeSidebar" @logout="triggerLogoutConfirm" />
  <Teleport to="body"><router-link v-if="showTestClock && route.path !== '/owner/accreditation'" to="/owner/testing-clock" class="owner-test-clock-shortcut"><i class="fa-regular fa-calendar" aria-hidden="true"></i> Test calendar</router-link></Teleport>
  <!-- Secure Logout Confirm Modal Overlay -->
  <div v-management-dialog="{ close: () => showConfirmModal = false }" v-if="showConfirmModal" class="cm-backdrop">
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

<style scoped>.owner-test-clock-shortcut{position:fixed;right:22px;bottom:22px;z-index:90;display:inline-flex;align-items:center;gap:9px;padding:11px 16px;min-height:44px;box-sizing:border-box;border:1px solid #bfdbfe;border-radius:999px;background:#2563eb;color:white;text-decoration:none;font-size:13px;font-weight:650;box-shadow:0 6px 20px #1d4ed830}.owner-test-clock-shortcut:focus-visible{outline:3px solid #93c5fd;outline-offset:3px}@media(max-width:600px){.owner-test-clock-shortcut{right:14px;bottom:14px}}@media print{.owner-test-clock-shortcut{display:none}}</style>
