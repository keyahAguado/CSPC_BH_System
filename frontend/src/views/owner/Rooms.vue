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
const token = localStorage.getItem('cspc_token');

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
    }
  } catch (error) {
    console.error('Failed to load rooms:', error);
    showSystemAlert('Could not fetch room details.', 'warning');
  } finally {
    isLoading.value = false;
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

const handleSaveRoom = async () => {
  if (!newRoomNumber.value || !newCapacity.value) {
    showSystemAlert('Please fill in all room details.', 'error');
    return;
  }

  try {
    isSubmitting.value = true;
    const response = await axios.post(`/api/owner/rooms/add/${house.value.id}`, {
      room_number: newRoomNumber.value,
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
  if (!editRoomNumber.value || !editCapacity.value) {
    showSystemAlert('Please fill in all room details.', 'error');
    return;
  }

  try {
    isSubmitting.value = true;
    const response = await axios.put(`/api/owner/rooms/edit/${editingRoomId.value}`, {
      room_number: editRoomNumber.value,
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
    showSystemAlert('Cannot delete room with active occupants. Please check out boarders first.', 'warning');
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

        <div class="grid grid-cols-1 gap-12">
          
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
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</span>
                  <span v-if="room.occupant_count >= room.capacity" class="inline-block bg-red-50 text-red-600 border border-red-100 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Full</span>
                  <span v-else-if="room.occupant_count === 0" class="inline-block bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Vacant</span>
                  <span v-else class="inline-block bg-blue-50 text-blue-600 border border-blue-100 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Available</span>
                </div>
                <div class="flex items-center gap-2 pt-2">
                  <router-link :to="'/owner/rooms/details/' + room.id" class="flex-1 bg-[#2a528a] text-white text-[10px] font-black py-2.5 rounded-xl uppercase tracking-widest hover:bg-black transition shadow-sm text-center">
                    View
                  </router-link>
                  <button @click="openEditModal(room)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black px-3 py-2.5 rounded-xl uppercase tracking-widest transition">
                    Edit
                  </button>
                  <button @click="openDeleteModal(room)" class="bg-red-50 hover:bg-red-500 hover:text-white text-red-500 text-[10px] font-black px-3 py-2.5 rounded-xl uppercase tracking-widest transition">
                    Delete
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
                    <td colspan="4" class="px-8 py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
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
                      <span v-if="room.occupant_count >= room.capacity" class="inline-block bg-red-50 text-red-600 border border-red-100 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest">Full</span>
                      <span v-else-if="room.occupant_count === 0" class="inline-block bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest">Vacant</span>
                      <span v-else class="inline-block bg-blue-50 text-blue-600 border border-blue-100 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest">Available</span>
                    </td>
                    <td class="px-8 py-5 text-center">
                      <div class="flex items-center justify-center gap-2">
                        <router-link :to="'/owner/rooms/details/' + room.id" class="bg-[#2a528a] text-white text-[10px] font-black px-4 py-2 rounded-lg uppercase tracking-widest hover:bg-black transition shadow-sm inline-block">
                          Details
                        </router-link>
                        <button @click="openEditModal(room)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black px-3 py-2 rounded-lg uppercase tracking-widest transition cursor-pointer">
                          Edit
                        </button>
                        <button @click="openDeleteModal(room)" class="bg-red-50 hover:bg-red-500 hover:text-white text-red-500 border border-red-100 text-[10px] font-black px-3 py-2 rounded-lg uppercase tracking-widest transition cursor-pointer">
                          Delete
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
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</span>
                  <span v-if="room.occupant_count >= room.capacity" class="inline-block bg-red-50 text-red-600 border border-red-100 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Full</span>
                  <span v-else-if="room.occupant_count === 0" class="inline-block bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Vacant</span>
                  <span v-else class="inline-block bg-blue-50 text-blue-600 border border-blue-100 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Available</span>
                </div>
                <div class="flex items-center gap-2 pt-2">
                  <router-link :to="'/owner/rooms/details/' + room.id" class="flex-1 bg-[#2a528a] text-white text-[10px] font-black py-2.5 rounded-xl uppercase tracking-widest hover:bg-black transition shadow-sm text-center">
                    View
                  </router-link>
                  <button @click="openEditModal(room)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black px-3 py-2.5 rounded-xl uppercase tracking-widest transition">
                    Edit
                  </button>
                  <button @click="openDeleteModal(room)" class="bg-red-50 hover:bg-red-500 hover:text-white text-red-500 text-[10px] font-black px-3 py-2.5 rounded-xl uppercase tracking-widest transition">
                    Delete
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
                    <td colspan="4" class="px-8 py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
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
                      <span v-if="room.occupant_count >= room.capacity" class="inline-block bg-red-50 text-red-600 border border-red-100 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest">Full</span>
                      <span v-else-if="room.occupant_count === 0" class="inline-block bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest">Vacant</span>
                      <span v-else class="inline-block bg-blue-50 text-blue-600 border border-blue-100 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest">Available</span>
                    </td>
                    <td class="px-8 py-5 text-center">
                      <div class="flex items-center justify-center gap-2">
                        <router-link :to="'/owner/rooms/details/' + room.id" class="bg-[#2a528a] text-white text-[10px] font-black px-4 py-2 rounded-lg uppercase tracking-widest hover:bg-black transition shadow-sm inline-block">
                          Details
                        </router-link>
                        <button @click="openEditModal(room)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black px-3 py-2 rounded-lg uppercase tracking-widest transition cursor-pointer">
                          Edit
                        </button>
                        <button @click="openDeleteModal(room)" class="bg-red-50 hover:bg-red-500 hover:text-white text-red-500 border border-red-100 text-[10px] font-black px-3 py-2 rounded-lg uppercase tracking-widest transition cursor-pointer">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
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
            <input v-model="newCapacity" type="number" required placeholder="2" class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
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
            <input v-model="editCapacity" type="number" min="1" required placeholder="2" class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
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

    <!-- ===== Delete Room Confirmation Modal ===== -->
    <div v-if="showDeleteConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
      <div class="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full text-center border border-slate-100 animate-in zoom-in-95 duration-200">
        <div class="text-red-500 mb-4 flex justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <h3 class="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">Delete Room {{ deletingRoomNumber }}?</h3>
        <p class="text-slate-500 text-xs font-medium mb-6 leading-relaxed">
          Are you sure you want to remove this room from your property? This action cannot be undone.
        </p>
        
        <div class="flex gap-3">
          <button @click="handleDeleteRoom" :disabled="isSubmitting" class="flex-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black py-3.5 rounded-xl uppercase tracking-widest transition active:scale-95 disabled:opacity-50 cursor-pointer">
            {{ isSubmitting ? 'Deleting...' : 'Delete Room' }}
          </button>
          <button @click="closeDeleteModal" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black py-3.5 rounded-xl uppercase tracking-widest transition active:scale-95 cursor-pointer">
            Cancel
          </button>
        </div>
      </div>
    </div>

  </div>
</template>