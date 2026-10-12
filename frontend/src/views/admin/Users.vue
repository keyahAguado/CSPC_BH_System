<script setup>
import TablePager from '../../components/management/TablePager.vue';
import LoadError from '../../components/management/LoadError.vue';

import PageHeader from '../../components/management/PageHeader.vue';
import '../../styles/management.css';
import { vManagementDialog } from '../../components/management/dialogAccessibility.js';
import { validateInput } from '../../utils/inputValidation.js';
import { ref, watch, computed, onMounted } from 'vue';
import axios from 'axios';
import AdminNav from '../../components/partials/AdminNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';
import { normalizePhPhone, isValidPhPhone } from '../../utils/phoneValidation.js';
import { matchesSearch } from '../../utils/search.js';

const users = ref([]);
const isLoading = ref(true);
const alertRef = ref(null);
const token = sessionStorage.getItem('cspc_token');
import { getImageUrl } from '../../config/api';

// Diagnostic States
const diagnosticError = ref('');
const apiResponsePayload = ref(null);

// Live Query Filters
const searchQuery = ref('');
const filterRole = ref('all');
const filterStatus = ref('all');

// Modals
const showEditModal = ref(false);
const showConfirmModal = ref(false);

// Active Form Context with Password Safety
const editForm = ref({
  id: null,
  name: '',
  email: '',
  phone: '',
  role: '', // Added explicitly to dictate conditional password visibility
  password: ''
});

// Custom Confirmation State Machine
const confirmTitle = ref('');
const confirmMessage = ref('');
const confirmAction = ref(null);

const showSystemAlert = (message, type = 'error') => {
  if (alertRef.value) {
    alertRef.value.showSystemAlert(message, type);
  }
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

const fetchUsers = async () => {
  loadError.value = '';
  try {
    isLoading.value = true;
    diagnosticError.value = '';
    apiResponsePayload.value = null;

    const response = await axios.get(`/api/admin/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    apiResponsePayload.value = response.data;

    if (response.data.success) {
      users.value = response.data.users || [];
    }
  } catch (error) {
    loadError.value = 'The server did not return these records. Refresh the page to try again.';
    console.error('Failed to load user directory:', error);
    diagnosticError.value = error.message + (error.response ? ` (Status: ${error.response.status} - ${error.response.statusText})` : ' (Network Offline)');
    showSystemAlert('Could not fetch database user lists.', 'warning');
  } finally {
    isLoading.value = false;
  }
};

const sanitizePhoneInput = () => {
  editForm.value.phone = normalizePhPhone(editForm.value.phone);
};

const handleUpdateProfile = async () => {
  const inputError = validateInput('adminUser', editForm.value);
  if (inputError) { showSystemAlert(inputError, 'error'); return; }
  if (editForm.value.phone && !isValidPhPhone(editForm.value.phone)) {
    showSystemAlert('Phone number must be a valid PH mobile number (11 digits, starting with 09).', 'error');
    return;
  }
  try {
    const response = await axios.post(
      `/api/admin/users/update/${editForm.value.id}`,
      {
        name: editForm.value.name,
        email: editForm.value.email,
        phone: editForm.value.phone,
        password: editForm.value.password // Sent securely inside request body
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (response.data.success) {
      showSystemAlert('User profile details updated successfully.', 'success');
      showEditModal.value = false;
      fetchUsers();
    }
  } catch (error) {
    console.error('Failed profile update:', error);
    showSystemAlert(error.response?.data?.message || 'Could not save profile configurations.', 'error');
  }
};

const handleResetPassword = async (userId) => {
  try {
    const response = await axios.post(`/api/admin/users/reset-password/${userId}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.data.success) {
      showSystemAlert('User credentials reset to default CSPC1234.', 'success');
    }
  } catch (error) {
    console.error('Reset failed:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to override user credentials.', 'error');
  }
};

const handleToggleStatus = async (userId) => {
  try {
    const response = await axios.post(`/api/admin/users/toggle-status/${userId}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.data.success) {
      showSystemAlert('Account authorization state successfully toggled.', 'success');
      fetchUsers();
    }
  } catch (error) {
    console.error('State toggle failed:', error);
    showSystemAlert(error.response?.data?.message || 'Account status mutation aborted.', 'error');
  }
};

// Open Modals Safely
const openEditModal = (user) => {
  editForm.value = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: normalizePhPhone(user.phone),
    role: user.role, // Tracks if student or owner for conditional styling
    password: ''
  };
  showEditModal.value = true;
};

// Client-Side Live Filters
const filteredUsers = computed(() => {
  return users.value.filter(u => {
    const matchQuery = matchesSearch(searchQuery.value, [
      u.name,
      u.email,
      u.phone ? normalizePhPhone(u.phone) : '',
      u.phone || '',
      u.role,
      u.status
    ]);
    
    const matchRole = filterRole.value === 'all' || u.role === filterRole.value;
    const matchStatus = filterStatus.value === 'all' || u.status === filterStatus.value;
    
    return matchQuery && matchRole && matchStatus;
  });
});

// Pure Vue Reactive Pagination
const currentPage = ref(1);
const itemsPerPage = ref(10);

watch([searchQuery, filterRole, filterStatus], () => {
  currentPage.value = 1;
});

const paginatedUsers = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  return filteredUsers.value.slice(start, start + itemsPerPage.value);
});

const totalPages = computed(() => {
  return Math.ceil(filteredUsers.value.length / itemsPerPage.value) || 1;
});

const startItemIndex = computed(() => {
  if (filteredUsers.value.length === 0) return 0;
  return (currentPage.value - 1) * itemsPerPage.value + 1;
});

const endItemIndex = computed(() => {
  return Math.min(currentPage.value * itemsPerPage.value, filteredUsers.value.length);
});

// Metrics Computed Layers
const totalStudents = computed(() => users.value.filter(u => u.role === 'student').length);
const totalOwners = computed(() => users.value.filter(u => u.role === 'owner').length);
const totalSuspended = computed(() => users.value.filter(u => u.status === 'inactive').length);
const totalPending = computed(() => users.value.filter(u => u.status === 'pending').length);
const statusLabel = (status) => status === 'active' ? 'Active' : status === 'pending' ? 'Pending' : 'Suspended';
const statusTone = (status) => status === 'active' ? 'is-success' : status === 'pending' ? 'is-warning' : 'is-danger';

onMounted(() => {
  fetchUsers();
});

const loadError = ref('');
</script>

<template>
  <div class="management-page bg-[#f8fafc] min-h-screen flex flex-col font-sans text-slate-800 text-left">
    <AdminNav />
    <div aria-live="polite" aria-atomic="false"><FlashAlert ref="alertRef" /></div>

    <main id="management-content" tabindex="-1" class="max-w-[1450px] mx-auto py-12 px-4 sm:px-6 flex-1 w-full text-left">
      <LoadError :message="loadError" />
      <PageHeader title="User registry" description="Manage account details, access, and existing security controls." />

      <!-- Summary tiles -->
      <dl class="reg-tiles">
        <div>
          <dt><i class="fa-solid fa-users" aria-hidden="true"></i> All users</dt>
          <dd>{{ isLoading ? '…' : users.length }}</dd>
        </div>
        <div>
          <dt><i class="fa-solid fa-user-graduate" aria-hidden="true"></i> Students</dt>
          <dd class="text-blue-700">{{ isLoading ? '…' : totalStudents }}</dd>
          <span class="reg-tile-sub">all accounts, incl. non-boarders</span>
        </div>
        <div>
          <dt><i class="fa-solid fa-user-tie" aria-hidden="true"></i> Owners</dt>
          <dd class="text-violet-700">{{ isLoading ? '…' : totalOwners }}</dd>
          <span v-if="totalPending" class="reg-tile-sub">{{ totalPending }} awaiting accreditation</span>
        </div>
        <div :class="{ 'is-danger': totalSuspended > 0 }">
          <dt><i class="fa-solid fa-user-lock" aria-hidden="true"></i> Suspended</dt>
          <dd>{{ isLoading ? '…' : totalSuspended }}</dd>
        </div>
      </dl>

      <!-- Filters -->
      <div class="reg-filters">
        <div class="reg-search">
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input v-model="searchQuery" type="text" aria-label="Search accounts" placeholder="Search by name, email, or phone..." />
          <button v-if="searchQuery" type="button" class="reg-search-clear" aria-label="Clear search" @click="searchQuery = ''"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </div>
        <label class="reg-select"><i class="fa-solid fa-id-badge" aria-hidden="true"></i>
          <select aria-label="Filter by role" v-model="filterRole">
            <option value="all">All roles</option>
            <option value="student">Students</option>
            <option value="owner">Owners</option>
          </select>
        </label>
        <label class="reg-select"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>
          <select aria-label="Filter by status" v-model="filterStatus">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Suspended</option>
            <option value="pending">Pending</option>
          </select>
        </label>
        <span class="reg-count">{{ filteredUsers.length }} result{{ filteredUsers.length !== 1 ? 's' : '' }}</span>
      </div>

      <!-- Loading -->
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 px-6 gap-6">
        <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>

      <div v-else class="registry-body">
        <!-- PHONE: cards -->
        <div class="lg:hidden mb-3 rounded-2xl border border-slate-200 overflow-hidden">
          <TablePager position="top" noun="entries" :page="currentPage" @update:page="currentPage = $event" :total-pages="totalPages" :start="startItemIndex" :end="endItemIndex" :total="filteredUsers.length" :per-page="itemsPerPage" @update:per-page="itemsPerPage = $event; currentPage = 1" />
        </div>
        <div class="block lg:hidden space-y-3">
          <div v-if="filteredUsers.length === 0" class="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500 text-sm font-semibold">No matching user accounts.</div>
          <div v-for="user in paginatedUsers" :key="'m-' + user.id" class="reg-card">
            <div class="flex items-center gap-3">
              <img :src="user.profile_pic ? getImageUrl(user.profile_pic) : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=e2e8f0&color=475569&bold=true&size=80`" class="reg-avatar" :alt="user.name" />
              <div class="min-w-0 flex-1">
                <p class="font-semibold text-slate-900 truncate">{{ user.name }}</p>
                <p class="text-xs text-slate-500 truncate">{{ user.email }}</p>
              </div>
            </div>
            <div class="flex flex-wrap gap-2 mt-3">
              <span :class="['reg-chip', user.role === 'student' ? 'is-primary' : 'is-violet']">{{ user.role === 'student' ? 'Student' : 'Owner' }}</span>
              <span :class="['reg-chip', statusTone(user.status)]"><span class="reg-dot" aria-hidden="true"></span>{{ statusLabel(user.status) }}</span>
              <span class="reg-chip"><i :class="user.role === 'owner' ? 'fa-solid fa-key' : 'fa-brands fa-google'" aria-hidden="true"></i>{{ user.role === 'owner' ? 'Password' : 'Google sign-in' }}</span>
            </div>
            <p class="text-xs text-slate-500 mt-2"><i class="fa-solid fa-phone text-slate-400 mr-1" aria-hidden="true"></i>{{ user.phone || 'No phone' }}</p>
            <div class="flex flex-wrap gap-2 mt-3">
              <button type="button" class="reg-btn is-edit" @click="openEditModal(user)"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Edit</button>
              <button v-if="user.role === 'owner'" type="button" class="reg-btn" @click="triggerConfirm('Reset Credentials?', `Force overwrite ${user.name}'s current password back to institutional default CSPC1234?`, () => handleResetPassword(user.id))"><i class="fa-solid fa-key" aria-hidden="true"></i> Reset password</button>
              <span v-if="user.status === 'pending'" class="reg-chip is-warning"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> Awaiting accreditation</span>
              <button v-else type="button" :class="['reg-btn', user.status === 'active' ? 'is-danger' : 'is-success']"
                      @click="triggerConfirm(user.status === 'active' ? 'Deactivate Account Access?' : 'Approve System Access?', `Are you sure you want to transition ${user.name}'s operational status to ${user.status === 'active' ? 'suspended' : 'active'}?`, () => handleToggleStatus(user.id))">
                {{ user.status === 'active' ? 'Deactivate' : 'Activate' }}
              </button>
            </div>
          </div>
        </div>

        <!-- LAPTOP / DESKTOP: table -->
        <div class="registry-table-card hidden lg:flex lg:flex-col bg-white rounded-[2rem] shadow-sm border border-slate-200/60 overflow-hidden shadow-slate-100">
          <TablePager position="top" noun="entries" :page="currentPage" @update:page="currentPage = $event" :total-pages="totalPages" :start="startItemIndex" :end="endItemIndex" :total="filteredUsers.length" :per-page="itemsPerPage" @update:per-page="itemsPerPage = $event; currentPage = 1" />

          <div class="registry-table-scroll overflow-x-auto">
            <table class="management-registry-table w-full border-collapse">
              <thead class="bg-slate-50">
                <tr><th scope="col">User</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Sign-in</th><th scope="col" class="w-[1%] whitespace-nowrap">Actions</th></tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-if="filteredUsers.length === 0">
                  <td colspan="5" class="py-20 text-slate-500 text-sm text-center font-semibold">No matching user accounts.</td>
                </tr>
                <tr v-for="user in paginatedUsers" :key="user.id">
                  <td>
                    <div class="flex items-center gap-3">
                      <img :src="user.profile_pic ? getImageUrl(user.profile_pic) : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=e2e8f0&color=475569&bold=true&size=80`" class="reg-avatar" :alt="user.name" />
                      <div class="min-w-0 text-left">
                        <strong class="block text-slate-900 font-semibold">{{ user.name }}</strong>
                        <span class="block text-slate-500 text-xs mt-0.5">{{ user.email }}</span>
                        <span class="block text-slate-500 text-xs mt-0.5">{{ user.phone || 'No phone' }}</span>
                      </div>
                    </div>
                  </td>
                  <td><span :class="['reg-chip', user.role === 'student' ? 'is-primary' : 'is-violet']">{{ user.role === 'student' ? 'Student' : 'Owner' }}</span></td>
                  <td><span :class="['reg-chip', statusTone(user.status)]"><span class="reg-dot" aria-hidden="true"></span>{{ statusLabel(user.status) }}</span></td>
                  <td>
                    <span class="text-slate-600 text-xs font-semibold" :title="user.role === 'owner' ? 'Signs in with email and password' : 'Signs in with a Google account; password is managed by Google'">
                      <i :class="user.role === 'owner' ? 'fa-solid fa-key text-slate-400' : 'fa-brands fa-google text-blue-500'" aria-hidden="true"></i>
                      {{ user.role === 'owner' ? 'Password' : 'Google' }}
                    </span>
                  </td>
                  <td>
                    <div class="reg-actions">
                      <button type="button" class="reg-btn is-edit" @click="openEditModal(user)" :aria-label="'Edit ' + user.name"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Edit</button>
                      <span v-if="user.role !== 'owner'" aria-hidden="true"></span>
                      <button v-else type="button" class="reg-btn is-icon" title="Reset to default password" :aria-label="'Reset password of ' + user.name"
                              @click="triggerConfirm('Reset Credentials?', `Force overwrite ${user.name}'s current password back to institutional default CSPC1234?`, () => handleResetPassword(user.id))"><i class="fa-solid fa-key" aria-hidden="true"></i></button>
                      <span v-if="user.status === 'pending'" class="reg-chip is-warning reg-action-wide" title="This account is awaiting boarding house accreditation approval."><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> Awaiting accreditation</span>
                      <button v-else type="button" :class="['reg-btn', 'reg-action-wide', user.status === 'active' ? 'is-danger' : 'is-success']"
                              @click="triggerConfirm(user.status === 'active' ? 'Deactivate Account Access?' : 'Approve System Access?', `Are you sure you want to transition ${user.name}'s operational status to ${user.status === 'active' ? 'suspended' : 'active'}?`, () => handleToggleStatus(user.id))">
                        {{ user.status === 'active' ? 'Deactivate' : 'Activate' }}
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <TablePager position="bottom" noun="entries" :page="currentPage" @update:page="currentPage = $event" :total-pages="totalPages" :start="startItemIndex" :end="endItemIndex" :total="filteredUsers.length" :per-page="itemsPerPage" @update:per-page="itemsPerPage = $event; currentPage = 1" />

        </div>
      </div>
    </main>

    <!-- Administrative Profile Modifications Modal -->
    <div v-management-dialog="{ close: () => showEditModal = false }" v-if="showEditModal" class="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden transform transition-all border border-slate-100 text-left animate-in zoom-in-95 duration-200">
        <div class="bg-slate-900 text-white px-10 py-8 flex justify-between items-center">
          <div>
            <h3 class="font-semibold text-2xl uppercase tracking-tight">Edit Profile</h3>
            <p class="text-slate-400 text-[12px] font-bold uppercase tracking-wide mt-1">Administrator Oversight Mode</p>
          </div>
          <button aria-label="Close dialog" @click="showEditModal = false" class="text-white hover:text-slate-300 transition h-10 w-10 rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer management-button">
            <i class="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>
        
        <form @submit.prevent="handleUpdateProfile" class="p-10 space-y-6">
          <div class="space-y-1.5">
            <label class="block text-[12px] font-semibold text-slate-400 uppercase tracking-wide ml-1">Full Name</label>
            <input aria-label="Full Name" v-model="editForm.name" type="text" required class="w-full bg-slate-50 border border-slate-200 px-6 py-4 rounded-2xl font-bold text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition" />
          </div>
          <div class="space-y-1.5">
            <label class="block text-[12px] font-semibold text-slate-400 uppercase tracking-wide ml-1">Email Address</label>
            <input aria-label="Email Address" v-model="editForm.email" type="email" required class="w-full bg-slate-50 border border-slate-200 px-6 py-4 rounded-2xl font-bold text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition" />
          </div>
          <div class="space-y-1.5">
            <label class="block text-[12px] font-semibold text-slate-400 uppercase tracking-wide ml-1">Phone Number</label>
            <input aria-label="Phone Number" v-model="editForm.phone" @input="sanitizePhoneInput" type="text" inputmode="numeric" maxlength="11" placeholder="09XXXXXXXXX" class="w-full bg-slate-50 border border-slate-200 px-6 py-4 rounded-2xl font-bold text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition" />
          </div>

          <!-- OPTIONAL PASSWORD MODIFICATION (EXCLUSIVELY DISPLAYED FOR MANUAL LOCAL ACCOUNTS / OWNERS) -->
          <div v-if="editForm.role === 'owner'" class="space-y-1.5 pt-4 border-t border-slate-100 animate-fade-in">
            <label class="block text-[12px] font-semibold text-slate-400 uppercase tracking-wide ml-1">Set New Password</label>
            <input aria-label="Set New Password" v-model="editForm.password" type="password" placeholder="Leave blank to keep existing password" class="w-full bg-slate-50 border border-slate-200 px-6 py-4 rounded-2xl font-bold text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition" />
            <p class="text-[12px] text-slate-400 italic ml-1 font-semibold">Leave empty if you do not want to alter this landlord's password.</p>
          </div>

          <div class="flex justify-end gap-4 pt-6">
            <button type="button" @click="showEditModal = false" class="px-8 py-4 text-slate-400 font-semibold text-[12px] uppercase tracking-wide hover:text-slate-900 transition cursor-pointer">Cancel</button>
            <button type="submit" class="bg-[#1e4a8d] hover:bg-slate-900 text-white px-10 py-4 rounded-2xl font-semibold text-[12px] uppercase tracking-wide shadow-xl transition active:scale-95 cursor-pointer management-button management-button-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Custom Confirmation Modal -->
    <div v-management-dialog="{ close: () => showConfirmModal = false }" v-if="showConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div class="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full text-center border border-slate-100 animate-in zoom-in-95 duration-200">
        <div class="text-[#2a528a] mb-4 flex justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-slate-900 uppercase tracking-tight mb-2">{{ confirmTitle }}</h3>
        <p class="text-slate-500 text-xs font-medium mb-6 leading-relaxed">{{ confirmMessage }}</p>
        
        <div class="flex gap-3">
          <button @click="executeConfirm" class="flex-1 bg-blue-600 hover:bg-black text-white text-[12px] font-semibold py-3.5 rounded-xl uppercase tracking-wide transition active:scale-95 cursor-pointer management-button management-button-primary">
            Confirm
          </button>
          <button @click="showConfirmModal = false" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[12px] font-semibold py-3.5 rounded-xl uppercase tracking-wide transition active:scale-95 cursor-pointer management-button">
            Cancel
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* Registry pages: same layout as Registered properties (one screen on laptop, table scrolls inside its card) */
@media (min-width: 1024px) {
  .registry-fit { height: 100dvh; min-height: 0 !important; overflow: hidden; }
  .registry-fit > main { display: flex; flex-direction: column; min-height: 0; padding-top: 24px !important; padding-bottom: 20px !important; }
  .registry-fit > main :deep(.management-page-header) { margin-bottom: 14px; }
  .registry-fit > main > * { flex-shrink: 0; }
  .registry-fit > main > .registry-body { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
  .registry-table-card { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .registry-table-scroll { flex: 1; min-height: 0; overflow: auto; }
  .registry-table-scroll thead th { position: sticky; top: 0; z-index: 1; background: #f8fafc; }
  .registry-table-scroll :deep(td) { padding-top: 10px; padding-bottom: 10px; vertical-align: middle; }
}

/* Summary tiles */
.reg-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0 0 14px; }
@media (min-width: 1024px) { .reg-tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.reg-tiles > div { padding: 12px 16px; border-radius: 14px; background: #fff; border: 1px solid #e2e8f0; min-width: 0; }
.reg-tiles dt { font-size: 12px; font-weight: 600; color: #64748b; }
.reg-tiles dt i { color: #94a3b8; margin-right: 4px; }
.reg-tiles dd { margin: 4px 0 0; font-size: 22px; font-weight: 700; color: #142b4a; line-height: 1.2; }
.reg-tiles .reg-tile-text { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.reg-tile-sub { display: block; margin-top: 2px; font-size: 12px; color: #64748b; }
.reg-tiles > div.is-primary { background: #e7eef8; border-color: #c9d7ec; }
.reg-tiles > div.is-primary dd, .reg-tiles > div.is-primary dt i { color: #1e4a8d; }
.reg-tiles > div.is-danger { background: #fff1f2; border-color: #fecdd3; }
.reg-tiles > div.is-danger dd { color: #be123c; }

/* Filter bar */
.reg-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 14px; }
.reg-search { position: relative; flex: 1 1 280px; min-width: 0; }
.reg-search > i { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 12px; pointer-events: none; }
.reg-search input { width: 100%; padding: 12px 40px 12px 40px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; font-size: 14px; font-weight: 600; color: #334155; outline: none; box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }
.reg-search input::placeholder { font-weight: 400; color: #94a3b8; }
.reg-search input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, .12); }
.reg-search-clear { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); width: 28px; height: 28px; min-height: 28px !important; border: 0; border-radius: 8px; background: transparent; color: #94a3b8; cursor: pointer; }
.reg-search-clear:hover { background: #f1f5f9; color: #475569; }
.reg-select { display: inline-flex; align-items: center; gap: 8px; padding: 0 12px; height: 46px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }
.reg-select i { color: #94a3b8; font-size: 12px; }
.reg-select select { border: 0; background: transparent; font-size: 13.5px; font-weight: 600; color: #334155; outline: none; cursor: pointer; min-height: 0 !important; max-width: 220px; }
.reg-count { font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; white-space: nowrap; }
.reg-btn-primary { display: inline-flex; align-items: center; gap: 8px; height: 46px; min-height: 46px !important; padding: 0 18px; border: 0; border-radius: 14px; background: #1e4a8d; color: #fff; font-size: 13.5px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.reg-btn-primary:hover { background: #163870; }
@media (max-width: 767px) { .reg-select, .reg-btn-primary { flex: 1 1 100%; justify-content: center; } .reg-select select { max-width: none; width: 100%; } }

/* Chips, buttons */
.reg-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; text-transform: capitalize; }
.reg-chip.is-primary { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
.reg-chip.is-violet { background: #f5f3ff; color: #6d28d9; border-color: #ddd6fe; }
.reg-chip.is-success { background: #f0fdf4; color: #15803d; border-color: #bbf7d0; }
.reg-chip.is-warning { background: #fff7ed; color: #c2410c; border-color: #fed7aa; }
.reg-chip.is-danger { background: #fff1f2; color: #be123c; border-color: #fecdd3; }
.reg-chip.is-male { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
.reg-chip.is-female { background: #fdf2f8; color: #be185d; border-color: #fbcfe8; }
.reg-dot { width: 7px; height: 7px; border-radius: 999px; background: currentColor; }
.reg-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 12px; min-height: 36px !important; border-radius: 10px; border: 1px solid #bfdbfe; background: #fff; color: #1d4ed8; font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.reg-btn:hover { background: #eff6ff; }
.reg-btn.is-icon { width: 36px; padding: 0; }
.reg-btn.is-danger { border-color: #fecdd3; background: #fff1f2; color: #be123c; }
.reg-btn.is-danger:hover { background: #ef4444; border-color: #ef4444; color: #fff; }
.reg-btn.is-success { border-color: #bbf7d0; background: #f0fdf4; color: #15803d; }
.reg-btn.is-success:hover { background: #22c55e; border-color: #22c55e; color: #fff; }
.reg-btn.is-edit { border-color: #fcd34d; background: #fffbeb; color: #92400e; }
.reg-btn.is-edit:hover { background: #f59e0b; border-color: #f59e0b; color: #fff; }
.reg-avatar { width: 40px; height: 40px; flex-shrink: 0; border-radius: 12px; object-fit: cover; border: 1px solid #e2e8f0; background: #f1f5f9; }

/* Residency groups */
.reg-group-row td { background: #f5f8fd; }
.reg-group-icon { width: 32px; height: 32px; flex-shrink: 0; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: #1e4a8d; color: #fff; font-size: 13px; }
.reg-group-name { margin: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 14px; font-weight: 700; color: #142b4a; }
.reg-group-sub { margin: 2px 0 0; font-size: 12px; color: #64748b; }
.reg-group-sub i { color: #94a3b8; margin-right: 2px; }
.reg-emergency { display: inline-flex; flex-direction: column; gap: 2px; padding: 6px 12px; border-radius: 10px; background: #fff1f2; border: 1px solid #fecdd3; min-width: 150px; }
.reg-emergency span { font-size: 12px; color: #9f1239; font-weight: 600; }
.reg-emergency strong { font-size: 13px; color: #be123c; font-weight: 700; }
.reg-group-card { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-radius: 14px; background: #e7eef8; border: 1px solid #c9d7ec; }
.reg-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; }
.reg-card-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; margin: 10px 0 0; }
.reg-card-facts dt { font-size: 11.5px; color: #64748b; }
.reg-card-facts dd { margin: 1px 0 0; font-size: 13px; font-weight: 600; color: #142b4a; }


/* Actions: fixed slots (Edit · reset password · access) so buttons line up on every row */
.reg-actions { display: grid; grid-template-columns: 76px 36px 176px; gap: 8px; align-items: center; justify-content: center; }
.reg-action-wide { width: 100%; justify-content: center; }
.reg-actions > .reg-btn { width: 100%; }

/* Center every column's content (group banners in the residency table stay left-aligned) */
.registry-table-scroll :deep(th),
.registry-table-scroll :deep(td) { text-align: center !important; vertical-align: middle !important; }
.registry-table-scroll :deep(.reg-group-row td) { text-align: left !important; }
/* User column stays left-aligned; the other columns are centered */
.registry-table-scroll :deep(tr > th:first-child),
.registry-table-scroll :deep(tr > td:first-child) { text-align: left !important; }

/* User registry: the page scrolls. The table scrolls sideways when it is wider than the card,
   so no column is cut off (phones and tablets use the card list instead). */
@media (min-width: 1024px) {
  .registry-table-card { overflow: hidden !important; }
  .registry-table-scroll { overflow-x: auto !important; overflow-y: hidden; }
}
</style>
