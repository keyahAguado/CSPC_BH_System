<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import AdminNav from '../../components/partials/AdminNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';

const users = ref([]);
const isLoading = ref(true);
const alertRef = ref(null);
const token = localStorage.getItem('cspc_token');
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
    console.error('Failed to load user directory:', error);
    diagnosticError.value = error.message + (error.response ? ` (Status: ${error.response.status} - ${error.response.statusText})` : ' (Network Offline)');
    showSystemAlert('Could not fetch database user lists.', 'warning');
  } finally {
    isLoading.value = false;
  }
};

const handleUpdateProfile = async () => {
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
    phone: user.phone || '',
    role: user.role, // Tracks if student or owner for conditional styling
    password: ''
  };
  showEditModal.value = true;
};

// Client-Side Live Filters
const filteredUsers = computed(() => {
  return users.value.filter(u => {
    const matchQuery = 
      u.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.value.toLowerCase());
    
    const matchRole = filterRole.value === 'all' || u.role === filterRole.value;
    const matchStatus = filterStatus.value === 'all' || u.status === filterStatus.value;
    
    return matchQuery && matchRole && matchStatus;
  });
});

// Metrics Computed Layers
const totalStudents = computed(() => users.value.filter(u => u.role === 'student').length);
const totalOwners = computed(() => users.value.filter(u => u.role === 'owner').length);
const totalSuspended = computed(() => users.value.filter(u => u.status === 'inactive').length);

onMounted(() => {
  fetchUsers();
});
</script>

<template>
  <div class="bg-[#f8fafc] min-h-screen flex flex-col font-sans text-slate-800 text-left">
    <AdminNav />
    <FlashAlert ref="alertRef" />

    <main class="max-w-[1450px] mx-auto py-12 px-4 sm:px-6 flex-1 w-full text-left">
      <!-- Header -->
      <div class="mb-10 mt-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 animate-fade-in">
        <div>
          <h1 class="text-[28px] sm:text-[32px] text-slate-900 tracking-tight font-black uppercase">User Registry</h1>
          <div class="w-16 h-1.5 bg-[#2563eb] rounded-full mt-2"></div>
        </div>

        <!-- Metrics Engine Dashboard -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full md:w-auto">
          <div class="bg-white px-6 py-3 rounded-2xl border border-slate-200/60 shadow-sm shadow-slate-100 min-w-[140px]">
            <span class="text-slate-400 text-[9px] font-black uppercase tracking-widest block">System Users</span>
            <span class="text-xl font-black text-slate-900">{{ users.length }}</span>
          </div>
          <div class="bg-white px-6 py-3 rounded-2xl border border-slate-200/60 shadow-sm shadow-slate-100 min-w-[140px]">
            <span class="text-blue-500 text-[9px] font-black uppercase tracking-widest block">Students</span>
            <span class="text-xl font-black text-blue-600">{{ totalStudents }}</span>
          </div>
          <div class="bg-white px-6 py-3 rounded-2xl border border-slate-200/60 shadow-sm shadow-slate-100 min-w-[140px]">
            <span class="text-purple-500 text-[9px] font-black uppercase tracking-widest block">Owners</span>
            <span class="text-xl font-black text-purple-600">{{ totalOwners }}</span>
          </div>
          <div class="bg-white px-6 py-3 rounded-2xl border border-slate-200/60 shadow-sm shadow-slate-100 min-w-[140px]">
            <span class="text-rose-500 text-[9px] font-black uppercase tracking-widest block">Suspended</span>
            <span class="text-xl font-black text-rose-600">{{ totalSuspended }}</span>
          </div>
        </div>
      </div>

      <!-- Live Search and Action Filters -->
      <div class="bg-white rounded-3xl border border-slate-200/60 px-6 sm:px-8 py-6 mb-8 flex flex-col md:flex-row gap-4 items-center shadow-sm animate-fade-in">
        <div class="relative w-full md:flex-1">
          <span class="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400">
            <i class="fa-solid fa-magnifying-glass"></i>
          </span>
          <input v-model="searchQuery" type="text" placeholder="Search accounts by name or email query..." 
            class="w-full pl-11 pr-6 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition" />
        </div>
        
        <div class="flex flex-col sm:flex-row gap-4 w-full md:w-auto shrink-0">
          <select v-model="filterRole" class="bg-slate-50 border border-slate-200 px-6 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider text-slate-600 outline-none focus:border-blue-500 focus:bg-white cursor-pointer w-full sm:w-auto">
            <option value="all">All Roles</option>
            <option value="student">Students</option>
            <option value="owner">Owners</option>
          </select>
          
          <select v-model="filterStatus" class="bg-slate-50 border border-slate-200 px-6 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider text-slate-600 outline-none focus:border-blue-500 focus:bg-white cursor-pointer w-full sm:w-auto">
            <option value="all">All States</option>
            <option value="active">Active</option>
            <option value="inactive">Suspended</option>
          </select>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 px-6 gap-6">
        <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>

      <!-- Content Container -->
      <div v-else>
        <!-- MOBILE VIEW CONTAINER (Card Layout para sa cp) -->
        <div class="block md:hidden bg-white rounded-[2rem] shadow-sm border border-slate-200/60 p-6 space-y-4">
          <div class="border-b border-slate-100 pb-3 text-center">
            <h2 class="text-xs font-black uppercase tracking-[0.2em] text-slate-400">User Directory Overview</h2>
          </div>

          <!-- Kung walang nahanap na user sa mobile -->
          <div v-if="filteredUsers.length === 0" class="py-12 text-center">
            <p class="text-slate-400 italic text-xs font-black uppercase tracking-widest">
              No matching user accounts registered.
            </p>
          </div>

          <!-- Kung may mga user sa mobile -->
          <div v-else class="space-y-4">
            <div v-for="user in filteredUsers" :key="user.id" class="bg-slate-50/50 rounded-[1.5rem] p-5 border border-slate-100 space-y-3">
              <div class="flex items-center gap-3 border-b border-slate-200/60 pb-3">
                <div class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 overflow-hidden border border-slate-100">
                  <img v-if="user.profile_pic" :src="getImageUrl(user.profile_pic)" class="w-full h-full object-cover" />
                  <i v-else class="fa-solid fa-user-shield text-[16px]"></i>
                </div>
                <div class="overflow-hidden flex-1">
                  <div class="font-black text-slate-900 uppercase tracking-tight text-sm truncate">{{ user.name }}</div>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="inline-block text-[8px] font-black uppercase px-2.5 py-0.5 rounded-md tracking-widest leading-none border"
                      :class="user.role === 'student' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-purple-50 text-purple-600 border-purple-100'">
                      {{ user.role }}
                    </span>
                    <div class="flex items-center gap-1.5">
                      <div class="w-2 h-2 rounded-full" :class="user.status === 'active' ? 'bg-emerald-505' : 'bg-rose-500'" :style="{ backgroundColor: user.status === 'active' ? '#10b981' : '#f43f5e' }"></div>
                      <span class="text-[9px] font-black uppercase tracking-wider" :class="user.status === 'active' ? 'text-emerald-600' : 'text-rose-600'">
                        {{ user.status === 'active' ? 'Active' : 'Suspended' }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="space-y-1 text-xs">
                <div class="flex justify-between py-0.5">
                  <span class="font-black text-slate-400 uppercase tracking-wider text-[10px]">Email:</span>
                  <span class="font-semibold text-slate-600 text-right truncate ml-4">{{ user.email }}</span>
                </div>
                <div class="flex justify-between py-0.5">
                  <span class="font-black text-slate-400 uppercase tracking-wider text-[10px]">Phone:</span>
                  <span class="font-semibold text-slate-600 text-right">{{ user.phone || 'No Phone' }}</span>
                </div>
              </div>

              <!-- Action Buttons para sa Mobile -->
              <div class="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60">
                <button @click="openEditModal(user)" class="bg-white border border-slate-200 text-slate-700 hover:bg-blue-500 hover:text-white hover:border-blue-500 rounded-xl p-2.5 flex items-center justify-center gap-1.5 transition text-[10px] font-black uppercase tracking-wider shadow-2xs cursor-pointer">
                  <i class="fa-solid fa-pen-to-square text-[12px]"></i> Edit
                </button>

                <template v-if="user.role === 'owner'">
                  <button @click="triggerConfirm('Reset Credentials?', `Force overwrite ${user.name}'s current password back to institutional default CSPC1234?`, () => handleResetPassword(user.id))" 
                    class="bg-white border border-slate-200 text-slate-700 hover:bg-amber-500 hover:text-white hover:border-amber-500 rounded-xl p-2.5 flex items-center justify-center gap-1.5 transition text-[10px] font-black uppercase tracking-wider shadow-2xs cursor-pointer">
                    <i class="fa-solid fa-key text-[12px]"></i> Reset Key
                  </button>
                </template>
                <template v-else>
                  <div class="bg-blue-50 border border-blue-100 text-blue-600 rounded-xl p-2.5 flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-wider">
                    <i class="fa-brands fa-google"></i> Google SSO
                  </div>
                </template>
              </div>

              <div class="pt-1">
                <button @click="triggerConfirm(user.status === 'active' ? 'Deactivate Account Access?' : 'Approve System Access?', `Are you sure you want to transition ${user.name}'s operational status to ${user.status === 'active' ? 'suspended' : 'active'}?`, () => handleToggleStatus(user.id))"
                        class="w-full rounded-xl py-2.5 font-black uppercase text-[10px] tracking-widest transition shadow-sm active:scale-95 cursor-pointer border"
                        :class="user.status === 'active' ? 'bg-rose-50 text-rose-500 border-rose-100 hover:bg-rose-500 hover:text-white' : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-600 hover:text-white'">
                  {{ user.status === 'active' ? 'Deactivate Account' : 'Activate Account' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- DESKTOP TABLE LAYOUT (Laging kita ang headers kahit walang laman) -->
        <div class="hidden md:block bg-white rounded-[2rem] shadow-sm border border-slate-200/60 overflow-hidden animate-fade-in shadow-slate-100">
          <div class="overflow-x-auto">
            <table class="w-full text-center border-collapse min-w-[1100px]">
              <thead>
                <tr class="bg-slate-50/50 border-b border-slate-100 text-slate-400 text-[10px] font-black tracking-widest uppercase">
                  <th class="py-6 px-8 text-left w-2/5 border-r border-slate-100">User Profile / Contact info</th>
                  <th class="py-6 px-6 border-r border-slate-100">System Role</th>
                  <th class="py-6 px-6 border-r border-slate-100">Security Access</th>
                  <th class="py-6 px-8 text-right">Administrative Actions</th>
                </tr>
              </thead>
              <tbody class="text-[13px] font-bold text-slate-700 divide-y divide-slate-100">
                <tr v-if="filteredUsers.length === 0">
                  <td colspan="4" class="py-20 text-slate-400 italic text-sm text-center font-black uppercase tracking-widest">
                    No matching user accounts registered.
                  </td>
                </tr>
                <tr v-for="user in filteredUsers" :key="user.id" class="hover:bg-slate-50/20 transition duration-200">
                  <td class="py-6 px-8 text-left border-r border-slate-100">
                    <div class="flex items-center gap-5">
                      <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 overflow-hidden border border-slate-100">
                        <img v-if="user.profile_pic" :src="getImageUrl(user.profile_pic)" class="w-full h-full object-cover" />
                        <i v-else class="fa-solid fa-user-shield text-[18px]"></i>
                      </div>
                      <div>
                        <div class="font-black text-slate-900 uppercase tracking-tight text-base leading-tight">{{ user.name }}</div>
                        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-slate-400 text-[10px] font-bold uppercase">
                          <span><i class="fa-solid fa-envelope mr-1.5 text-blue-500"></i>{{ user.email }}</span>
                          <span><i class="fa-solid fa-phone mr-1.5 text-slate-400"></i>{{ user.phone || 'No Phone' }}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  <td class="py-6 px-6 border-r border-slate-100">
                    <span class="inline-block text-[9px] font-black uppercase px-3.5 py-1.5 rounded-xl tracking-widest leading-none border"
                      :class="user.role === 'student' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-purple-50 text-purple-600 border-purple-100'">
                      {{ user.role }}
                    </span>
                  </td>

                  <td class="py-6 px-6 border-r border-slate-100">
                    <div class="flex items-center justify-center gap-2">
                      <div class="w-2.5 h-2.5 rounded-full" 
                        :class="user.status === 'active' ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]' : 'bg-rose-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]'"></div>
                      <span class="text-[10px] font-black uppercase tracking-widest leading-none"
                        :class="user.status === 'active' ? 'text-emerald-600' : 'text-rose-600'">
                        {{ user.status === 'active' ? 'Active' : 'Suspended' }}
                      </span>
                    </div>
                  </td>

                  <td class="py-6 px-8 text-right">
                    <div class="flex justify-end items-center gap-3">
                      <button @click="openEditModal(user)" class="w-10 h-10 flex items-center justify-center border border-slate-100 bg-white hover:bg-blue-500 hover:text-white rounded-xl transition duration-300 shadow-sm active:scale-95 cursor-pointer" title="Edit Profile Details">
                        <i class="fa-solid fa-pen-to-square text-xs"></i>
                      </button>
                      
                      <!-- DYNAMIC ADAPTATION FOR SSO USERS VS LOCAL USERS -->
                      <template v-if="user.role === 'owner'">
                        <button @click="triggerConfirm('Reset Credentials?', `Force overwrite ${user.name}'s current password back to institutional default CSPC1234?`, () => handleResetPassword(user.id))" 
                          class="w-10 h-10 flex items-center justify-center border border-slate-100 bg-white hover:bg-amber-500 hover:text-white rounded-xl transition duration-300 shadow-sm active:scale-95 cursor-pointer" title="Reset Default Password">
                          <i class="fa-solid fa-key text-xs"></i>
                        </button>
                      </template>
                      <template v-else>
                        <span class="text-[8px] font-black uppercase tracking-wider text-blue-500 bg-blue-50 border border-blue-100 px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm leading-none" title="Federated SSO accounts manage passwords via Google Security panels.">
                          <i class="fa-brands fa-google"></i> Google SSO
                        </span>
                      </template>

                      <button @click="triggerConfirm(user.status === 'active' ? 'Deactivate Account Access?' : 'Approve System Access?', `Are you sure you want to transition ${user.name}'s operational status to ${user.status === 'active' ? 'suspended' : 'active'}?`, () => handleToggleStatus(user.id))"
                        class="px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition shadow-sm active:scale-95 cursor-pointer border"
                        :class="user.status === 'active' ? 'bg-rose-50 text-rose-500 border-rose-100 hover:bg-rose-500 hover:text-white' : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-600 hover:text-white'">
                        {{ user.status === 'active' ? 'Deactivate' : 'Activate' }}
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>

    <!-- Administrative Profile Modifications Modal -->
    <div v-if="showEditModal" class="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden transform transition-all border border-slate-100 text-left animate-in zoom-in-95 duration-200">
        <div class="bg-slate-900 text-white px-10 py-8 flex justify-between items-center">
          <div>
            <h3 class="font-black text-2xl uppercase tracking-tight">Edit Profile</h3>
            <p class="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">Administrator Oversight Mode</p>
          </div>
          <button @click="showEditModal = false" class="text-white hover:text-slate-300 transition h-10 w-10 rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer">
            <i class="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>
        
        <form @submit.prevent="handleUpdateProfile" class="p-10 space-y-6">
          <div class="space-y-1.5">
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
            <input v-model="editForm.name" type="text" required class="w-full bg-slate-50 border border-slate-200 px-6 py-4 rounded-2xl font-bold text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition" />
          </div>
          <div class="space-y-1.5">
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
            <input v-model="editForm.email" type="email" required class="w-full bg-slate-50 border border-slate-200 px-6 py-4 rounded-2xl font-bold text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition" />
          </div>
          <div class="space-y-1.5">
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Phone Number</label>
            <input v-model="editForm.phone" type="text" class="w-full bg-slate-50 border border-slate-200 px-6 py-4 rounded-2xl font-bold text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition" />
          </div>

          <!-- OPTIONAL PASSWORD MODIFICATION (EXCLUSIVELY DISPLAYED FOR MANUAL LOCAL ACCOUNTS / OWNERS) -->
          <div v-if="editForm.role === 'owner'" class="space-y-1.5 pt-4 border-t border-slate-100 animate-fade-in">
            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Set New Password</label>
            <input v-model="editForm.password" type="password" placeholder="Leave blank to keep existing password" class="w-full bg-slate-50 border border-slate-200 px-6 py-4 rounded-2xl font-bold text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition" />
            <p class="text-[9px] text-slate-400 italic ml-1 font-semibold">Leave empty if you do not want to alter this landlord's password.</p>
          </div>

          <div class="flex justify-end gap-4 pt-6">
            <button type="button" @click="showEditModal = false" class="px-8 py-4 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-slate-900 transition cursor-pointer">Cancel</button>
            <button type="submit" class="bg-[#1e4a8d] hover:bg-slate-900 text-white px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl transition active:scale-95 cursor-pointer">Save Changes</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Custom Confirmation Modal -->
    <div v-if="showConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div class="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full text-center border border-slate-100 animate-in zoom-in-95 duration-200">
        <div class="text-[#2a528a] mb-4 flex justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 class="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">{{ confirmTitle }}</h3>
        <p class="text-slate-500 text-xs font-medium mb-6 leading-relaxed">{{ confirmMessage }}</p>
        
        <div class="flex gap-3">
          <button @click="executeConfirm" class="flex-1 bg-blue-600 hover:bg-black text-white text-[10px] font-black py-3.5 rounded-xl uppercase tracking-widest transition active:scale-95 cursor-pointer">
            Confirm
          </button>
          <button @click="showConfirmModal = false" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black py-3.5 rounded-xl uppercase tracking-widest transition active:scale-95 cursor-pointer">
            Cancel
          </button>
        </div>
      </div>
    </div>

  </div>
</template>