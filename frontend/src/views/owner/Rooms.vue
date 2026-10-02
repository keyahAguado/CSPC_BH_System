<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import OwnerNav from '../../components/partials/OwnerNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';

const route = useRoute();

const house = ref({ id: '', name: '' });
const femaleRooms = ref([]);
const maleRooms = ref([]);
const archivedRooms = ref([]);
const activeTab = ref('active'); // 'active' or 'archived'

// Form states for adding new room
const newRoomNumber = ref('');
const newGenderType = ref('female');
const newCapacity = ref('');
const newPrice = ref('');

// Form states for editing room
const showEditModal = ref(false);
const editingRoomId = ref(null);
const editRoomNumber = ref('');
const editGenderType = ref('female');
const editCapacity = ref('');
const editPrice = ref('');

// Delete confirmation modal states
const showDeleteConfirmModal = ref(false);
const deletingRoomId = ref(null);
const deletingRoomNumber = ref('');

const isLoading = ref(true);
const isSubmitting = ref(false);
const showAddModal = ref(false);
const alertRef = ref(null);
const token = sessionStorage.getItem('cspc_token');

const showSystemAlert = (message, type = 'error') => {
  if (alertRef.value) {
    alertRef.value.showSystemAlert(message, type);
  }
};

const fetchRooms = async () => {
  try {
    isLoading.value = true;
    const houseId = route.params.id; 

    const response = await axios.get(`/api/owner/rooms/${houseId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      house.value = response.data.house || { id: houseId, name: 'Boarding House' };
      const rooms = response.data.rooms || [];
      femaleRooms.value = rooms.filter(r => r.gender_type === 'female');
      maleRooms.value = rooms.filter(r => r.gender_type === 'male');
      archivedRooms.value = response.data.archivedRooms || [];
    }
  } catch (error) {
    console.error('Failed to load rooms:', error);
    showSystemAlert('Could not fetch room details.', 'warning');
  } finally {
    isLoading.value = false;
  }
};

const handleRestoreRoom = async (roomId, roomNumber) => {
  try {
    isSubmitting.value = true;
    const response = await axios.post(`/api/owner/rooms/restore/${roomId}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      showSystemAlert(`Room ${roomNumber} restored successfully!`, 'success');
      fetchRooms();
    }
  } catch (error) {
    console.error('Failed to restore room:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to restore room.', 'error');
  } finally {
    isSubmitting.value = false;
  }
};

const toggleAddModal = () => {
  showAddModal.value = !showAddModal.value;
  if (!showAddModal.value) {
    newRoomNumber.value = '';
    newGenderType.value = 'female';
    newCapacity.value = '';
    newPrice.value = '';
  }
};

const validateRoomForm = (number, capacity) => {
  if (!String(number ?? '').trim()) return 'Room number is required.';
  if (Array.from(String(number).trim()).length > 50) return 'Room number must be 50 characters or fewer.';
  const value = Number(capacity);
  if (!Number.isInteger(value) || value < 1 || value > 2147483647) return 'Capacity must be a whole number of at least 1 within the supported range.';
  return null;
};

const handleSaveRoom = async () => {
  if (isSubmitting.value) return;
  const validationError = validateRoomForm(newRoomNumber.value, newCapacity.value);
  if (validationError) {
    showSystemAlert(validationError, 'error');
    return;
  }

  try {
    isSubmitting.value = true;
    const response = await axios.post(`/api/owner/rooms/add/${house.value.id}`, {
      room_number: String(newRoomNumber.value).trim(),
      gender_type: newGenderType.value,
      capacity: newCapacity.value,
      price: newPrice.value
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      showSystemAlert('New room saved successfully!', 'success');
      toggleAddModal();
      fetchRooms();
    }
  } catch (error) {
    console.error('Failed to add room:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to add new room.', 'error');
  } finally {
    isSubmitting.value = false;
  }
};

// --- Edit Room ---
const openEditModal = (room) => {
  editingRoomId.value = room.id;
  editRoomNumber.value = room.room_number;
  editGenderType.value = room.gender_type;
  editCapacity.value = room.capacity;
  editPrice.value = room.price || '';
  showEditModal.value = true;
};

const closeEditModal = () => {
  showEditModal.value = false;
  editingRoomId.value = null;
};

const handleUpdateRoom = async () => {
  if (isSubmitting.value) return;
  const validationError = validateRoomForm(editRoomNumber.value, editCapacity.value);
  if (validationError) {
    showSystemAlert(validationError, 'error');
    return;
  }

  try {
    isSubmitting.value = true;
    const response = await axios.put(`/api/owner/rooms/edit/${editingRoomId.value}`, {
      room_number: String(editRoomNumber.value).trim(),
      gender_type: editGenderType.value,
      capacity: editCapacity.value,
      price: editPrice.value
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      showSystemAlert('Room details updated successfully!', 'success');
      closeEditModal();
      fetchRooms();
    }
  } catch (error) {
    console.error('Failed to edit room:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to update room details.', 'error');
  } finally {
    isSubmitting.value = false;
  }
};

// --- Delete Room ---
const openDeleteModal = (room) => {
  if (room.occupant_count > 0) {
    showSystemAlert('Attention Required: Cannot archive room with active occupants. Please check out all boarders first.', 'warning');
    return;
  }
  deletingRoomId.value = room.id;
  deletingRoomNumber.value = room.room_number;
  showDeleteConfirmModal.value = true;
};

const closeDeleteModal = () => {
  showDeleteConfirmModal.value = false;
  deletingRoomId.value = null;
};

const handleDeleteRoom = async () => {
  try {
    isSubmitting.value = true;
    const response = await axios.delete(`/api/owner/rooms/delete/${deletingRoomId.value}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      showSystemAlert(`Room ${deletingRoomNumber.value} removed successfully.`, 'success');
      closeDeleteModal();
      fetchRooms();
    }
  } catch (error) {
    console.error('Failed to delete room:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to delete room.', 'error');
  } finally {
    isSubmitting.value = false;
  }
};

onMounted(() => {
  fetchRooms();
});
</script>

<template>
  <div class="bg-slate-100 min-h-screen flex flex-col font-sans">
    <OwnerNav />
    <FlashAlert ref="alertRef" />

    <!-- Main Content -->
    <main class="flex-1 max-w-6xl mx-auto w-full py-12 px-6 lg:px-12 text-left">

      <!-- Header Section -->
      <div class="mb-12 text-center">
        <h1 class="text-3xl font-black text-slate-900 uppercase tracking-tight mb-2">Room Status</h1>
        <p class="text-blue-600 font-bold uppercase text-[13px] tracking-[0.2em] mb-4 text-center">
          {{ house.name }}
        </p>
        <div class="w-20 h-1 bg-blue-600 mx-auto rounded-full"></div>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="p-20 text-center bg-white rounded-[2.5rem] shadow-sm border border-slate-200/60 flex flex-col items-center justify-center">
        <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
        <p class="text-slate-400 font-bold uppercase text-[9px] tracking-widest">Loading rooms status...</p>
      </div>

      <div v-else class="space-y-12">
        
        <!-- Bookings Monitoring Section -->
        <div class="bg-white rounded-3xl shadow-sm border border-slate-200/60 p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-6 transition-all duration-300 hover:shadow-md">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 md:w-14 md:h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-inner flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <path d="m9 16 2 2 4-4" />
              </svg>
            </div>
            <div>
              <h2 class="text-base md:text-xl font-black text-slate-900 uppercase tracking-tight">Bookings Monitoring</h2>
              <p class="text-slate-500 text-[10px] md:text-[11px] font-bold uppercase tracking-wider">Review and manage boarder reservations</p>
            </div>
          </div>
          
          <!-- Native SPA routing link -->
          <router-link :to="'/owner/bookings?houseId=' + house.id" class="w-full md:w-auto bg-[#2a528a] text-white px-6 py-3 md:px-8 md:py-4 rounded-2xl font-black text-[11px] md:text-[12px] uppercase tracking-widest hover:bg-black transition-all duration-300 flex items-center justify-center gap-3 shadow-lg shadow-blue-100 active:scale-95">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Manage
          </router-link>
        </div>

        <!-- Room Filter Tabs: Active Rooms vs Archived Rooms -->
        <div class="flex items-center justify-between border-b border-slate-200/80 pb-4">
          <div class="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center sm:gap-3">
            <button 
              @click="activeTab = 'active'"
              class="px-3.5 sm:px-5 py-2.5 rounded-xl font-black text-[10px] sm:text-[11px] uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5 text-center"
              :class="activeTab === 'active' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white text-slate-500 hover:bg-slate-200/60 border border-slate-200/60'"
            >
              <i class="fa-solid fa-door-open text-xs"></i> Active Rooms ({{ femaleRooms.length + maleRooms.length }})
            </button>
            <button 
              @click="activeTab = 'archived'"
              class="px-3.5 sm:px-5 py-2.5 rounded-xl font-black text-[10px] sm:text-[11px] uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5 text-center"
              :class="activeTab === 'archived' ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-500 hover:bg-slate-200/60 border border-slate-200/60'"
            >
              <i class="fa-solid fa-box-archive text-xs"></i> Archived Rooms ({{ archivedRooms.length }})
            </button>
          </div>
        </div>

        <div v-if="activeTab === 'active'" class="grid grid-cols-1 gap-12">
          
          <!-- Female's Room Section -->
          <section class="bg-white rounded-3xl shadow-sm border border-slate-200/60 overflow-hidden">
            <div class="bg-slate-50/80 px-5 md:px-8 py-4 md:py-5 border-b border-slate-200 flex items-center gap-3 justify-between">
              <div class="flex items-center gap-3">
                <div class="w-2 h-6 bg-pink-400 rounded-full"></div>
                <h2 class="text-sm font-black text-slate-800 uppercase tracking-widest">Female's Room</h2>
              </div>
            </div>

            <!-- MOBILE CARD LIST (hidden on sm+) -->
            <div class="sm:hidden divide-y divide-slate-100">
              <div v-if="femaleRooms.length === 0" class="px-5 py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                No Female Rooms listed
              </div>
              <div v-for="room in femaleRooms" :key="room.id" class="px-5 py-4 flex flex-col gap-3">
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Room No.</span>
                  <span class="font-black text-slate-800 text-sm">{{ room.room_number }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Occupancy</span>
                  <span class="font-bold text-slate-600 text-sm">
                    {{ room.occupant_count }} / {{ room.capacity }}
                    <span class="text-[9px] text-slate-400 font-black uppercase ml-1">({{ Math.max(0, room.capacity - room.occupant_count) }} Vacant)</span>
                  </span>
                </div>
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</span>
                  <div class="flex items-center gap-2 flex-wrap">
                    <span v-if="room.occupant_count >= room.capacity" class="inline-block bg-red-50 text-red-600 border border-red-100 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Full</span>
                    <span v-else-if="room.occupant_count === 0" class="inline-block bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Vacant</span>
                    <span v-else class="inline-block bg-blue-50 text-blue-600 border border-blue-100 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Available</span>
                  </div>
                </div>
                <div class="flex items-center gap-2 pt-2">
                  <router-link :to="'/owner/rooms/details/' + room.id" class="relative flex-1 bg-[#2a528a] text-white text-[10px] font-black py-2.5 rounded-xl uppercase tracking-widest hover:bg-black transition shadow-sm text-center flex items-center justify-center">
                    View
                    <span v-if="room.pending_request_count > 0" class="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-sm animate-bounce">
                      {{ room.pending_request_count }}
                    </span>
                  </router-link>
                  <button @click="openEditModal(room)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black px-3 py-2.5 rounded-xl uppercase tracking-widest transition">
                    Edit
                  </button>
                  <button @click="openDeleteModal(room)" class="bg-amber-50 hover:bg-amber-500 hover:text-white text-amber-600 border border-amber-200/60 text-[10px] font-black px-3 py-2.5 rounded-xl uppercase tracking-widest transition">
                    Archive
                  </button>
                </div>
              </div>
            </div>

            <!-- DESKTOP TABLE (hidden on mobile) -->
            <div class="hidden sm:block overflow-x-auto">
              <table class="w-full text-sm text-left">
                <thead>
                  <tr class="text-slate-500 uppercase text-[10px] font-black tracking-wider border-b border-slate-100">
                    <th class="px-8 py-5 text-center">Room No.</th>
                    <th class="px-8 py-5 text-center">Monthly Rent</th>
                    <th class="px-8 py-5 text-center">Occupancy</th>
                    <th class="px-8 py-5 text-center">Current Status</th>
                    <th class="px-8 py-5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  <tr v-if="femaleRooms.length === 0">
                    <td colspan="5" class="px-8 py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                      No Female Rooms listed
                    </td>
                  </tr>
                  <tr v-for="room in femaleRooms" :key="room.id" class="hover:bg-slate-50/50 transition-colors group">
                    <td class="px-8 py-5 font-bold text-slate-700 text-center">{{ room.room_number }}</td>
                    <td class="px-8 py-5 text-center font-black text-slate-900">₱{{ Number(room.price || 0).toLocaleString() }}</td>
                    <td class="px-8 py-5 text-center font-bold text-slate-500">
                      {{ room.occupant_count }} / {{ room.capacity }}
                      <span class="block text-[10px] text-slate-400 font-black uppercase mt-1 tracking-tighter">
                        {{ Math.max(0, room.capacity - room.occupant_count) }} Vacant
                      </span>
                    </td>
                    <td class="px-8 py-5 text-center">
                      <div class="flex flex-col items-center gap-1.5">
                        <span v-if="room.occupant_count >= room.capacity" class="inline-block bg-red-50 text-red-600 border border-red-100 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest">Full</span>
                        <span v-else-if="room.occupant_count === 0" class="inline-block bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest">Vacant</span>
                        <span v-else class="inline-block bg-blue-50 text-blue-600 border border-blue-100 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest">Available</span>
                      </div>
                    </td>
                    <td class="px-8 py-5 text-center">
                      <div class="flex items-center justify-center gap-2">
                        <router-link :to="'/owner/rooms/details/' + room.id" class="relative bg-[#2a528a] text-white text-[10px] font-black px-4 py-2 rounded-lg uppercase tracking-widest hover:bg-black transition shadow-sm inline-flex items-center">
                          Details
                          <span v-if="room.pending_request_count > 0" class="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-sm animate-bounce">
                            {{ room.pending_request_count }}
                          </span>
                        </router-link>
                        <button @click="openEditModal(room)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black px-3 py-2 rounded-lg uppercase tracking-widest transition cursor-pointer">
                          Edit
                        </button>
                        <button @click="openDeleteModal(room)" class="bg-amber-50 hover:bg-amber-500 hover:text-white text-amber-600 border border-amber-200/60 text-[10px] font-black px-3 py-2 rounded-lg uppercase tracking-widest transition cursor-pointer">
                          Archive
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- Male's Room Section -->
          <section class="bg-white rounded-3xl shadow-sm border border-slate-200/60 overflow-hidden">
            <div class="bg-slate-50/80 px-5 md:px-8 py-4 md:py-5 border-b border-slate-200 flex items-center gap-3">
              <div class="w-2 h-6 bg-blue-400 rounded-full"></div>
              <h2 class="text-sm font-black text-slate-800 uppercase tracking-widest">Male's Room</h2>
            </div>

            <!-- MOBILE CARD LIST (hidden on sm+) -->
            <div class="sm:hidden divide-y divide-slate-100">
              <div v-if="maleRooms.length === 0" class="px-5 py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                No Male Rooms listed
              </div>
              <div v-for="room in maleRooms" :key="room.id" class="px-5 py-4 flex flex-col gap-3">
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Room No.</span>
                  <span class="font-black text-slate-800 text-sm">{{ room.room_number }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Occupancy</span>
                  <span class="font-bold text-slate-600 text-sm">
                    {{ room.occupant_count }} / {{ room.capacity }}
                    <span class="text-[9px] text-slate-400 font-black uppercase ml-1">({{ Math.max(0, room.capacity - room.occupant_count) }} Vacant)</span>
                  </span>
                </div>
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</span>
                  <div class="flex items-center gap-2 flex-wrap">
                    <span v-if="room.occupant_count >= room.capacity" class="inline-block bg-red-50 text-red-600 border border-red-100 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Full</span>
                    <span v-else-if="room.occupant_count === 0" class="inline-block bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Vacant</span>
                    <span v-else class="inline-block bg-blue-50 text-blue-600 border border-blue-100 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Available</span>
                  </div>
                </div>
                <div class="flex items-center gap-2 pt-2">
                  <router-link :to="'/owner/rooms/details/' + room.id" class="relative flex-1 bg-[#2a528a] text-white text-[10px] font-black py-2.5 rounded-xl uppercase tracking-widest hover:bg-black transition shadow-sm text-center flex items-center justify-center">
                    View
                    <span v-if="room.pending_request_count > 0" class="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-sm animate-bounce">
                      {{ room.pending_request_count }}
                    </span>
                  </router-link>
                  <button @click="openEditModal(room)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black px-3 py-2.5 rounded-xl uppercase tracking-widest transition">
                    Edit
                  </button>
                  <button @click="openDeleteModal(room)" class="bg-amber-50 hover:bg-amber-500 hover:text-white text-amber-600 border border-amber-200/60 text-[10px] font-black px-3 py-2.5 rounded-xl uppercase tracking-widest transition">
                    Archive
                  </button>
                </div>
              </div>
            </div>

            <!-- DESKTOP TABLE (hidden on mobile) -->
            <div class="hidden sm:block overflow-x-auto">
              <table class="w-full text-sm text-left">
                <thead>
                  <tr class="text-slate-500 uppercase text-[10px] font-black tracking-wider border-b border-slate-100">
                    <th class="px-8 py-5 text-center">Room No.</th>
                    <th class="px-8 py-5 text-center">Monthly Rent</th>
                    <th class="px-8 py-5 text-center">Occupancy</th>
                    <th class="px-8 py-5 text-center">Current Status</th>
                    <th class="px-8 py-5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  <tr v-if="maleRooms.length === 0">
                    <td colspan="5" class="px-8 py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                      No Male Rooms listed
                    </td>
                  </tr>
                  <tr v-for="room in maleRooms" :key="room.id" class="hover:bg-slate-50/50 transition-colors">
                    <td class="px-8 py-5 font-bold text-slate-700 text-center">{{ room.room_number }}</td>
                    <td class="px-8 py-5 text-center font-black text-slate-900">₱{{ Number(room.price || 0).toLocaleString() }}</td>
                    <td class="px-8 py-5 text-center font-bold text-slate-500">
                      {{ room.occupant_count }} / {{ room.capacity }}
                      <span class="block text-[10px] text-slate-400 font-black uppercase mt-1 tracking-tighter">
                        {{ Math.max(0, room.capacity - room.occupant_count) }} Vacant
                      </span>
                    </td>
                    <td class="px-8 py-5 text-center">
                      <div class="flex flex-col items-center gap-1.5">
                        <span v-if="room.occupant_count >= room.capacity" class="inline-block bg-red-50 text-red-600 border border-red-100 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest">Full</span>
                        <span v-else-if="room.occupant_count === 0" class="inline-block bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest">Vacant</span>
                        <span v-else class="inline-block bg-blue-50 text-blue-600 border border-blue-100 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest">Available</span>
                      </div>
                    </td>
                    <td class="px-8 py-5 text-center">
                      <div class="flex items-center justify-center gap-2">
                        <router-link :to="'/owner/rooms/details/' + room.id" class="relative bg-[#2a528a] text-white text-[10px] font-black px-4 py-2 rounded-lg uppercase tracking-widest hover:bg-black transition shadow-sm inline-flex items-center">
                          Details
                          <span v-if="room.pending_request_count > 0" class="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-sm animate-bounce">
                            {{ room.pending_request_count }}
                          </span>
                        </router-link>
                        <button @click="openEditModal(room)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black px-3 py-2 rounded-lg uppercase tracking-widest transition cursor-pointer">
                          Edit
                        </button>
                        <button @click="openDeleteModal(room)" class="bg-amber-50 hover:bg-amber-500 hover:text-white text-amber-600 border border-amber-200/60 text-[10px] font-black px-3 py-2 rounded-lg uppercase tracking-widest transition cursor-pointer">
                          Archive
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <!-- ARCHIVED ROOMS SECTION -->
        <div v-else class="bg-white rounded-3xl shadow-sm border border-slate-200/60 overflow-hidden">
          <div class="bg-slate-900 text-white px-5 md:px-8 py-4 md:py-5 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <i class="fa-solid fa-box-archive text-amber-400"></i>
              <h2 class="text-sm font-black uppercase tracking-widest">Archived Rooms</h2>
            </div>
            <span class="text-[10px] font-black uppercase tracking-wider bg-amber-400/20 text-amber-300 px-3 py-1 rounded-full border border-amber-400/30">
              Retained for Records
            </span>
          </div>

          <!-- MOBILE CARD LIST (hidden on sm+) -->
          <div class="sm:hidden divide-y divide-slate-100">
            <div v-if="archivedRooms.length === 0" class="px-5 py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
              No archived rooms.
            </div>
            <div v-for="room in archivedRooms" :key="room.id" class="px-5 py-4 flex flex-col gap-3 text-left">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Room No.</span>
                <span class="font-black text-slate-800 text-sm">{{ room.room_number }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Wing / Gender</span>
                <span class="inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase" :class="room.gender_type === 'female' ? 'bg-pink-50 text-pink-600 border border-pink-100' : 'bg-blue-50 text-blue-600 border border-blue-100'">
                  {{ room.gender_type }}'s Wing
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monthly Rent</span>
                <span class="font-black text-slate-900 text-sm">₱{{ Number(room.price || 0).toLocaleString() }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</span>
                <span class="inline-block bg-slate-100 text-slate-600 border border-slate-200 text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                  Archived
                </span>
              </div>
              <div class="pt-2">
                <button 
                  @click="handleRestoreRoom(room.id, room.room_number)"
                  :disabled="isSubmitting"
                  class="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black py-2.5 rounded-xl uppercase tracking-widest transition shadow-md shadow-emerald-100 active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  <i class="fa-solid fa-rotate-left text-xs"></i> Restore Room
                </button>
              </div>
            </div>
          </div>

          <!-- DESKTOP TABLE (hidden on mobile) -->
          <div class="hidden sm:block overflow-x-auto">
            <table class="w-full text-sm text-left">
              <thead>
                <tr class="text-slate-500 uppercase text-[10px] font-black tracking-wider border-b border-slate-100 bg-slate-50/50">
                  <th class="px-8 py-5 text-center">Room No.</th>
                  <th class="px-8 py-5 text-center">Wing / Gender</th>
                  <th class="px-8 py-5 text-center">Monthly Rent</th>
                  <th class="px-8 py-5 text-center">Status</th>
                  <th class="px-8 py-5 text-center">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-if="archivedRooms.length === 0">
                  <td colspan="5" class="px-8 py-12 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                    No archived rooms.
                  </td>
                </tr>
                <tr v-for="room in archivedRooms" :key="room.id" class="hover:bg-slate-50/50 transition-colors">
                  <td class="px-8 py-5 font-bold text-slate-700 text-center">{{ room.room_number }}</td>
                  <td class="px-8 py-5 text-center font-bold text-slate-600 capitalize">
                    <span class="inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase" :class="room.gender_type === 'female' ? 'bg-pink-50 text-pink-600 border border-pink-100' : 'bg-blue-50 text-blue-600 border border-blue-100'">
                      {{ room.gender_type }}'s Wing
                    </span>
                  </td>
                  <td class="px-8 py-5 text-center font-black text-slate-900">₱{{ Number(room.price || 0).toLocaleString() }}</td>
                  <td class="px-8 py-5 text-center">
                    <span class="inline-block bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest">
                      Archived
                    </span>
                  </td>
                  <td class="px-8 py-5 text-center">
                    <button 
                      @click="handleRestoreRoom(room.id, room.room_number)"
                      :disabled="isSubmitting"
                      class="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black px-5 py-2.5 rounded-xl uppercase tracking-widest transition shadow-md shadow-emerald-100 active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 mx-auto"
                    >
                      <i class="fa-solid fa-rotate-left text-xs"></i> Restore Room
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Global Action Buttons -->
        <div class="mt-16 flex flex-wrap justify-center gap-6 pb-20">
          <button @click="toggleAddModal" class="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black text-[12px] uppercase tracking-widest shadow-lg shadow-blue-200 hover:bg-black hover:shadow-none transition-all duration-300 flex items-center gap-3 active:scale-95 focus:outline-none cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            Add Room
          </button>
        </div>

      </div>
    </main>

    <!-- ===== Add Room Modal ===== -->
    <div v-show="showAddModal" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
      <div class="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden p-10 relative text-left animate-in zoom-in duration-200">
        <div class="flex justify-between items-center mb-8">
          <h2 class="text-xl font-black text-slate-900 uppercase tracking-tight">Add New Room</h2>
          <button @click="toggleAddModal" class="text-slate-300 hover:text-slate-900 transition focus:outline-none cursor-pointer">
            <i class="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <form @submit.prevent="handleSaveRoom" class="space-y-6">
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Room Number / ID</label>
            <input v-model="newRoomNumber" type="text" required placeholder="E.g. Room 101" class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Gender Specification</label>
            <select v-model="newGenderType" required class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition appearance-none cursor-pointer">
              <option value="female">Female's Room</option>
              <option value="male">Male's Room</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Capacity</label>
            <input v-model="newCapacity" type="number" min="1" step="1" required placeholder="2" class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Monthly Rent (₱)</label>
            <input v-model="newPrice" type="number" step="any" placeholder="E.g. 1500 (Leave blank to use property base rate)" class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
          <button type="submit" :disabled="isSubmitting" class="w-full bg-blue-600 hover:bg-black text-white font-black py-4 rounded-xl text-[10px] uppercase tracking-widest transition shadow-xl active:scale-95 disabled:opacity-50 cursor-pointer">
            {{ isSubmitting ? 'Saving Room...' : 'Save Room' }}
          </button>
        </form>
      </div>
    </div>

    <!-- ===== Edit Room Modal ===== -->
    <div v-show="showEditModal" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
      <div class="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden p-10 relative text-left animate-in zoom-in duration-200">
        <div class="flex justify-between items-center mb-8">
          <h2 class="text-xl font-black text-slate-900 uppercase tracking-tight">Edit Room Details</h2>
          <button @click="closeEditModal" class="text-slate-300 hover:text-slate-900 transition focus:outline-none cursor-pointer">
            <i class="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <form @submit.prevent="handleUpdateRoom" class="space-y-6">
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Room Number / ID</label>
            <input v-model="editRoomNumber" type="text" required placeholder="E.g. Room 101" class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Gender Specification</label>
            <select v-model="editGenderType" required class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition appearance-none cursor-pointer">
              <option value="female">Female's Room</option>
              <option value="male">Male's Room</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Capacity</label>
            <input v-model="editCapacity" type="number" min="1" step="1" required placeholder="2" class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
          <div>
            <label class="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Monthly Rent (₱)</label>
            <input v-model="editPrice" type="number" step="any" placeholder="E.g. 1500" class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
          <button type="submit" :disabled="isSubmitting" class="w-full bg-blue-600 hover:bg-black text-white font-black py-4 rounded-xl text-[10px] uppercase tracking-widest transition shadow-xl active:scale-95 disabled:opacity-50 cursor-pointer">
            {{ isSubmitting ? 'Updating Room...' : 'Update Room' }}
          </button>
        </form>
      </div>
    </div>

    <!-- ===== Archive Room Confirmation Modal ===== -->
    <div v-if="showDeleteConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
      <div class="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full text-center border border-slate-100 animate-in zoom-in-95 duration-200">
        <div class="text-amber-500 mb-4 flex justify-center">
          <div class="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center border border-amber-200/60">
            <i class="fa-solid fa-box-archive text-amber-500 text-2xl"></i>
          </div>
        </div>
        <h3 class="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">Archive Room {{ deletingRoomNumber }}?</h3>
        <p class="text-slate-500 text-xs font-medium mb-6 leading-relaxed">
          Are you sure you want to archive this room? It will be safely moved to your Archived Rooms tab and can be restored at any time.
        </p>
        
        <div class="flex gap-3">
          <button @click="handleDeleteRoom" :disabled="isSubmitting" class="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black py-3.5 rounded-xl uppercase tracking-widest transition active:scale-95 disabled:opacity-50 cursor-pointer">
            {{ isSubmitting ? 'Archiving...' : 'Archive Room' }}
          </button>
          <button @click="closeDeleteModal" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black py-3.5 rounded-xl uppercase tracking-widest transition active:scale-95 cursor-pointer">
            Cancel
          </button>
        </div>
      </div>
    </div>

  </div>
</template>