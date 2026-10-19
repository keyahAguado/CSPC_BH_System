<script setup>
import UserAvatar from "../UserAvatar.vue";
const accountPhoto = (()=>{try{return JSON.parse(sessionStorage.getItem("cspc_user") || "{}").profile_pic || ""}catch{return ""}})();
import { computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import '../../styles/management.css';
import '../../styles/admin-theme.css';
import { vManagementDialog } from './dialogAccessibility.js';
const props = defineProps({ role: { type: String, required: true }, open: Boolean, unreadCount: { type: Number, default: 0 } });
const emit = defineEmits(['close', 'toggle', 'logout']);
const route = useRoute();
const isAdmin = computed(() => props.role === 'admin');
const groups = computed(() => props.role === 'admin' ? [
  { label: 'Main', items: [['Home', '/admin/dashboard', 'fa-house']] },
  { label: 'Property administration', items: [['New applications', '/admin/pending-applications', 'fa-clipboard-check'], ['Registered properties', '/admin/registered', 'fa-building'], ['Archived properties', '/admin/archived', 'fa-box-archive']] },
  { label: 'Reports', items: [['Accredited masterlist', '/admin/reports/masterlist', 'fa-list-check'], ['Compliance & expiry', '/admin/reports/compliance', 'fa-file-circle-check'], ['Emergency registry residence', '/admin/emergency-monitoring', 'fa-shield-halved']] },
  { label: 'People', items: [['User registry', '/admin/users', 'fa-users']] },
  { label: 'System', items: [['Landing page', '/admin/site-content', 'fa-globe'], ['Notifications', '/admin/notifications', 'fa-bell']] }
] : [
  { label: 'Workspace', items: [['Overview & properties', '/owner/dashboard', 'fa-house'], ['Booking', '/owner/bookings', 'fa-calendar-check']] },
  { label: 'Compliance', items: [['Legal documents', '/owner/documents', 'fa-folder-open']] },
  { label: 'Account', items: [['Profile & security', '/owner/profile', 'fa-user'], ['Notifications', '/owner/notifications', 'fa-bell']] }
]);
const propertyId = computed(() => ['OwnerEdit', 'OwnerRooms', 'OwnerDocuments'].includes(route.name) ? route.params.id : null);
const active = (path) => route.path === path || (path === '/owner/documents' && route.path.startsWith(path + '/'));

// Top bar breadcrumb: the first crumb goes back to the portal home
const homePath = computed(() => (props.role === 'admin' ? '/admin/dashboard' : '/owner/dashboard'));
// Top bar: name the current page with its sidebar label so the two always agree.
const pageTitle = computed(() => {
  for (const group of groups.value) {
    const item = group.items.find(i => active(i[1]));
    if (item) return item[0];
  }
  return route.meta.title;
});
// Navigation behavior is shared; each portal has its own visual theme.
const adminName = (() => {
  try { return JSON.parse(sessionStorage.getItem('cspc_user') || '{}').name || (props.role === 'admin' ? 'Administrator' : 'Property owner'); } catch { return props.role === 'admin' ? 'Administrator' : 'Property owner'; }
})();
const roleLabel = computed(() => (isAdmin.value ? 'Administrator · SASO' : 'Property owner'));
const adminInitials = adminName.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'A';
const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });

let desktopQuery;
const closeOnDesktop = event => { if (event.matches) emit('close'); };
onMounted(() => { desktopQuery = window.matchMedia('(min-width: 1180px)'); desktopQuery.addEventListener('change', closeOnDesktop); });
onUnmounted(() => desktopQuery?.removeEventListener('change', closeOnDesktop));
</script>
<template>
  <a class="management-skip no-print" href="#management-content">Skip to main content</a>
  <div v-if="open" class="management-nav-backdrop no-print" @click="emit('close')"></div>
  <aside v-management-dialog="{ enabled: open, label: 'Navigation', close: () => emit('close') }" id="management-navigation" class="management-sidebar mobile-sidebar no-print" :class="{ 'is-open': open, 'is-admin': true, 'is-owner': !isAdmin }">
    <router-link to="/" class="management-brand" @click="emit('close')">
      <img src="/img/cspc_bh_finder_icon.png" alt="CSPC BH Finder" />
      <span><strong>CSPC BH Finder</strong><small>{{ role === 'admin' ? 'Administration portal' : 'Owner portal' }}</small></span>
    </router-link>
    <button class="management-nav-close" aria-label="Close navigation" @click="emit('close')"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    <nav :aria-label="role === 'admin' ? 'Administration' : 'Owner management'" class="management-nav-groups">
      <section v-for="group in groups" :key="group.label">
        <p class="management-nav-label">{{ group.label }}</p>
        <router-link v-for="item in group.items" :key="item[1]" :to="item[1]" class="management-nav-link" :class="{ 'is-active': active(item[1]) }" :aria-current="active(item[1]) ? 'page' : undefined" @click="emit('close')">
          <i :class="['fa-solid', item[2]]" aria-hidden="true"></i><span>{{ item[0] }}</span>
          <span v-if="item[1].endsWith('/notifications') && unreadCount > 0" class="management-nav-count" :aria-label="unreadCount + ' unread notifications'">{{ unreadCount }}</span>
        </router-link>
      </section>
      <section v-if="role === 'owner' && propertyId">
        <p class="management-nav-label">Selected property</p>
        <router-link :to="'/owner/edit/' + propertyId" class="management-nav-link" :class="{ 'is-active': route.name === 'OwnerEdit' }" @click="emit('close')"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>Property details</router-link>
        <router-link :to="'/owner/rooms/' + propertyId" class="management-nav-link" :class="{ 'is-active': route.name === 'OwnerRooms' }" @click="emit('close')"><i class="fa-solid fa-door-open" aria-hidden="true"></i>Rooms & occupants</router-link>
      </section>
    </nav>
    <div class="management-nav-footer">
      <div class="admin-nav-user">
        <UserAvatar :src="accountPhoto" :name="adminName" class="admin-avatar" />
        <span class="admin-nav-user-text"><strong :title="adminName">{{ adminName }}</strong><small>{{ roleLabel }}</small></span>
        <button type="button" class="admin-nav-signout" aria-label="Sign out" title="Sign out" @click="emit('logout')"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i></button>
      </div>
    </div>
  </aside>
  <header class="management-topbar no-print is-admin" :class="{ 'is-owner': !isAdmin }">
    <div class="management-topbar-title"><button class="management-menu-toggle hamburger-btn" aria-label="Toggle navigation" :aria-expanded="open" aria-controls="management-navigation" @click="emit('toggle')"><i class="fa-solid fa-bars" aria-hidden="true"></i></button><nav aria-label="Breadcrumb" class="management-breadcrumb"><router-link :to="homePath" class="management-crumb">{{ role === 'admin' ? 'Administration' : 'Property management' }}</router-link><span class="management-topbar-separator" aria-hidden="true">/</span><router-link :to="route.path" class="management-crumb is-current" aria-current="page"><strong>{{ pageTitle }}</strong></router-link></nav></div>
    <div class="admin-topbar-tools">
      <span v-if="isAdmin" class="admin-topbar-date"><i class="fa-regular fa-calendar" aria-hidden="true"></i>{{ today }}</span>
      <router-link :to="'/' + role + '/notifications'" class="management-topbar-notifications" aria-label="View notifications"><i class="fa-regular fa-bell" aria-hidden="true"></i><span v-if="unreadCount > 0" class="management-nav-count">{{ unreadCount }}</span></router-link>
    </div>
  </header>
</template>
