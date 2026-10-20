<script setup>
import RoomInformationFields from '../../components/RoomInformationFields.vue';
import { confirmTone } from '../../utils/confirmTone.js';
import OwnerRoomGroup from '../../components/OwnerRoomGroup.vue';
import { roomFormDetails, roomFormData, roomDetailsError } from '../../utils/roomDetails.js';
import LoadError from '../../components/management/LoadError.vue';

import PageHeader from '../../components/management/PageHeader.vue';
import '../../styles/management.css';
import '../../styles/admin-theme.css';
import '../../styles/owner-pages.css';
import { vManagementDialog } from '../../components/management/dialogAccessibility.js';
import { validateInput } from '../../utils/inputValidation.js';
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import OwnerNav from '../../components/partials/OwnerNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';

const route = useRoute();

const house = ref({ id: '', name: '' });
const femaleRooms = ref([]);
const maleRooms = ref([]);
const archivedRooms = ref([]);
const roomSearch = ref('');
const roomTypeFilter = ref('all');
const roomFloorFilter = ref('all');
const allActiveRooms = computed(() => [...femaleRooms.value, ...maleRooms.value]);
const visibleSourceRooms = computed(() => activeTab.value === 'active' ? allActiveRooms.value : archivedRooms.value);
const floorOptions = computed(() => [...new Set(visibleSourceRooms.value.map(room => room.floor_label).filter(Boolean))].sort((a,b) => a.localeCompare(b, undefined, {numeric:true})));
const filteredRooms = computed(() => visibleSourceRooms.value.filter(room =>
  String(room.room_number || '').toLowerCase().includes(roomSearch.value.trim().toLowerCase())
  && (roomTypeFilter.value === 'all' || room.gender_type === roomTypeFilter.value)
  && (roomFloorFilter.value === 'all' || (roomFloorFilter.value === 'unspecified' ? !room.floor_label : room.floor_label === roomFloorFilter.value))));
const roomGroups = computed(() => activeTab.value === 'archived'
  ? [{ key:'archived', title:'Archived rooms', rooms:filteredRooms.value }]
  : [{key:'female',title:"Female's room",rooms:filteredRooms.value.filter(room => room.gender_type === 'female')},{key:'male',title:"Male's room",rooms:filteredRooms.value.filter(room => room.gender_type === 'male')}]);
const clearRoomFilters = () => { roomSearch.value=''; roomTypeFilter.value='all'; roomFloorFilter.value='all'; };
const activeTab = ref('active'); // 'active' or 'archived'

// Form states for adding new room
const newRoomNumber = ref('');
const newGenderType = ref('female');
const newCapacity = ref('');
const newPrice = ref('');
const newDetails = ref(roomFormDetails());

// Form states for editing room
const showEditModal = ref(false);
const editingRoomId = ref(null);
const editRoomNumber = ref('');
const editGenderType = ref('female');
const editCapacity = ref('');
const editPrice = ref('');
const editDetails = ref(roomFormDetails());

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
  loadError.value = '';
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
    loadError.value = 'The server did not return these records. Refresh the page to try again.';
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
    newDetails.value = roomFormDetails();
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
  const inputError = validateInput('room', { room_number: String(newRoomNumber.value ?? ''), capacity: newCapacity.value, price: newPrice.value, gender_type: newGenderType.value });
  if (inputError) { showSystemAlert(inputError, 'error'); return; }
  if (isSubmitting.value) return;
  const validationError = validateRoomForm(newRoomNumber.value, newCapacity.value);
  if (validationError) {
    showSystemAlert(validationError, 'error');
    return;
  }

  const detailsError = roomDetailsError(newDetails.value, true);
  if (detailsError) { showSystemAlert(detailsError, 'error'); return; }

  try {
    isSubmitting.value = true;
    const response = await axios.post(`/api/owner/rooms/add/${house.value.id}`, roomFormData({ room_number: String(newRoomNumber.value).trim(), gender_type: newGenderType.value, capacity: newCapacity.value, price: newPrice.value }, newDetails.value), {
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
  editPrice.value = room.price ?? '';
  editDetails.value = roomFormDetails(room);
  showEditModal.value = true;
};

const closeEditModal = () => {
  showEditModal.value = false;
  editingRoomId.value = null;
};

const handleUpdateRoom = async () => {
  const inputError = validateInput('room', { room_number: String(editRoomNumber.value ?? ''), capacity: editCapacity.value, price: editPrice.value, gender_type: editGenderType.value });
  if (inputError) { showSystemAlert(inputError, 'error'); return; }
  if (isSubmitting.value) return;
  const validationError = validateRoomForm(editRoomNumber.value, editCapacity.value);
  if (validationError) {
    showSystemAlert(validationError, 'error');
    return;
  }

  const detailsError = roomDetailsError(editDetails.value, false);
  if (detailsError) { showSystemAlert(detailsError, 'error'); return; }

  try {
    isSubmitting.value = true;
    const response = await axios.put(`/api/owner/rooms/edit/${editingRoomId.value}`, roomFormData({ room_number: String(editRoomNumber.value).trim(), gender_type: editGenderType.value, capacity: editCapacity.value, price: editPrice.value }, editDetails.value), {
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

const loadError = ref('');
</script>

<template>
  <div class="management-page owner-page bg-slate-100 min-h-screen flex flex-col font-sans">
    <OwnerNav />
    <div aria-live="polite" aria-atomic="false"><FlashAlert ref="alertRef" /></div>

    <!-- Main Content -->
    <main id="management-content" tabindex="-1" class="flex-1 max-w-6xl mx-auto w-full py-12 px-6 lg:px-12 text-left">
      <LoadError :message="loadError" />

      <PageHeader title="Rooms & occupants" :eyebrow="house.name" description="Scan all rooms quickly, then open a room to see its full details." />
      <div class="owner-room-create-row no-print">
        <button type="button" @click="toggleAddModal" class="owner-room-create-button bg-blue-600 text-white px-5 py-3 rounded-xl font-semibold text-[12px] hover:bg-blue-700 transition inline-flex items-center gap-2 management-button management-button-primary"><i class="fa-solid fa-plus" aria-hidden="true"></i>Add room</button>
      </div>
      <div v-if="isLoading" class="owner-rooms-loading"><div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div><p>Loading rooms...</p></div>
      <div v-else class="owner-rooms-content">
        <div class="owner-room-toolbar">
          <div class="owner-room-tabs" aria-label="Room status"><button type="button" @click="activeTab = 'active'; clearRoomFilters()" :aria-pressed="activeTab === 'active'" :class="activeTab === 'active' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white text-slate-500 hover:bg-slate-200/60 border border-slate-200/60'">Active rooms ({{ allActiveRooms.length }})</button><button type="button" @click="activeTab = 'archived'; clearRoomFilters()" :aria-pressed="activeTab === 'archived'" :class="activeTab === 'archived' ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-500 hover:bg-slate-200/60 border border-slate-200/60'">Archived rooms ({{ archivedRooms.length }})</button></div>
          <div class="owner-room-filters"><select v-model="roomTypeFilter" aria-label="Filter by room type"><option value="all">All room types</option><option value="female">Female rooms</option><option value="male">Male rooms</option></select><select v-model="roomFloorFilter" aria-label="Filter by floor"><option value="all">All floors</option><option v-for="floor in floorOptions" :key="floor" :value="floor">{{ floor }}</option><option value="unspecified">Not specified</option></select></div>
          <label class="owner-room-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input v-model="roomSearch" type="search" aria-label="Search room number" placeholder="Search room no." /></label>
        </div>
        <div class="owner-room-utility"><span>{{ filteredRooms.length }} {{ activeTab === 'archived' ? 'archived' : 'active' }} rooms shown</span><router-link :to="'/owner/bookings?houseId=' + house.id" class="bg-[#2a528a] text-white px-4 py-2 rounded-lg text-[12px] font-semibold hover:bg-black transition management-button management-button-primary"><i class="fa-solid fa-calendar-check mr-2" aria-hidden="true"></i>Manage bookings</router-link></div>
        <template v-for="group in roomGroups" :key="group.key"><OwnerRoomGroup v-if="group.rooms.length" :rooms="group.rooms" :title="group.title" :tone="group.key" :archived="activeTab === 'archived'" :busy="isSubmitting" @edit="openEditModal" @archive="openDeleteModal" @restore="room => handleRestoreRoom(room.id,room.room_number)" /></template>
        <div v-if="!filteredRooms.length" class="owner-room-empty"><i class="fa-solid fa-door-open" aria-hidden="true"></i><h2>{{ visibleSourceRooms.length ? 'No rooms match your filters' : activeTab === 'archived' ? 'No archived rooms' : 'No rooms added yet' }}</h2><p>{{ visibleSourceRooms.length ? 'Try another room number, room type or floor.' : activeTab === 'archived' ? 'Archived rooms will appear here for restoration.' : 'Add a room to start managing its details, pricing and occupants.' }}</p><button v-if="visibleSourceRooms.length" type="button" @click="clearRoomFilters" class="text-blue-600 underline">Clear filters</button></div>
      </div>
    </main>

    <!-- ===== Add Room Modal ===== -->
    <div v-management-dialog="{ close: () => toggleAddModal() }" v-show="showAddModal" class="room-modal-overlay fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
      <div class="room-modal-panel bg-white w-full relative text-left shadow-2xl animate-in zoom-in duration-200">
        <div class="room-modal-header"><div class="room-modal-heading"><span class="room-modal-icon"><i class="fa-solid fa-door-open" aria-hidden="true"></i></span><div>
          <h2 class="text-xl font-semibold text-slate-900 uppercase tracking-tight">Add New Room</h2><p>Set up room details, amenities and actual photos.</p></div></div>
          <button aria-label="Close Add Room dialog" @click="toggleAddModal" class="room-modal-close">
            <i class="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <form @submit.prevent="handleSaveRoom" class="room-modal-form"><div class="room-modal-body"><div class="room-modal-basics">
          <div>
            <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2 ml-1">Room Number / ID</label>
            <input aria-label="Room Number / ID" v-model="newRoomNumber" type="text" required placeholder="E.g. Room 101" class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
          <div>
            <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2 ml-1">Gender Specification</label>
            <select aria-label="Gender Specification" v-model="newGenderType" required class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition appearance-none cursor-pointer">
              <option value="female">Female's Room</option>
              <option value="male">Male's Room</option>
            </select>
          </div>
          <div>
            <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2 ml-1">Capacity</label>
            <input aria-label="Capacity" v-model="newCapacity" type="number" min="1" step="1" required placeholder="2" class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
          <div>
            <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2 ml-1">Monthly Rent (₱)</label>
            <input aria-label="Monthly Rent (₱)" v-model="newPrice" type="number" min="0" max="99999999.99" step="0.01" placeholder="E.g. 1500 (Leave blank to use property base rate)" class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
          </div><RoomInformationFields v-model="newDetails" is-new />
          </div><div class="room-modal-footer"><button type="button" @click="toggleAddModal" :disabled="isSubmitting" class="room-modal-cancel management-button">Cancel</button>
          <button type="submit" :disabled="isSubmitting" class="room-modal-save bg-blue-600 text-white font-semibold disabled:opacity-50 management-button management-button-primary">
            {{ isSubmitting ? 'Saving Room...' : 'Save Room' }}
          </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ===== Edit Room Modal ===== -->
    <div v-management-dialog="{ close: () => closeEditModal() }" v-show="showEditModal" class="room-modal-overlay fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
      <div class="room-modal-panel bg-white w-full relative text-left shadow-2xl animate-in zoom-in duration-200">
        <div class="room-modal-header"><div class="room-modal-heading"><span class="room-modal-icon"><i class="fa-solid fa-door-open" aria-hidden="true"></i></span><div>
          <h2 class="text-xl font-semibold text-slate-900 uppercase tracking-tight">Edit Room Details</h2><p>Keep room details, amenities and photos up to date.</p></div></div>
          <button aria-label="Close dialog" @click="closeEditModal" class="room-modal-close">
            <i class="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <form @submit.prevent="handleUpdateRoom" class="room-modal-form"><div class="room-modal-body"><div class="room-modal-basics">
          <div>
            <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2 ml-1">Room Number / ID</label>
            <input aria-label="Room Number / ID" v-model="editRoomNumber" type="text" required placeholder="E.g. Room 101" class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
          <div>
            <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2 ml-1">Gender Specification</label>
            <select aria-label="Gender Specification" v-model="editGenderType" required class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition appearance-none cursor-pointer">
              <option value="female">Female's Room</option>
              <option value="male">Male's Room</option>
            </select>
          </div>
          <div>
            <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2 ml-1">Capacity</label>
            <input aria-label="Capacity" v-model="editCapacity" type="number" min="1" step="1" required placeholder="2" class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
          <div>
            <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2 ml-1">Monthly Rent (₱)</label>
            <input aria-label="Monthly Rent (₱)" v-model="editPrice" type="number" min="0" max="99999999.99" step="0.01" placeholder="E.g. 1500" class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
          </div>
          </div><RoomInformationFields v-model="editDetails" />
          </div><div class="room-modal-footer"><button type="button" @click="closeEditModal" :disabled="isSubmitting" class="room-modal-cancel management-button">Cancel</button>
          <button type="submit" :disabled="isSubmitting" class="room-modal-save bg-blue-600 text-white font-semibold disabled:opacity-50 management-button management-button-primary">
            {{ isSubmitting ? 'Updating Room...' : 'Update Room' }}
          </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ===== Archive Room Confirmation Modal ===== -->
    <div v-management-dialog="{ close: () => closeDeleteModal() }" v-if="showDeleteConfirmModal" class="cm-backdrop">
      <div class="cm-panel popup-panel" role="dialog" aria-modal="true">
        <div class="cm-body">
          <span :class="['cm-icon', confirmTone('Archive Room ' + deletingRoomNumber + '?').tone]" aria-hidden="true"><i :class="['fa-solid', confirmTone('Archive Room ' + deletingRoomNumber + '?').icon]"></i></span>
          <div><h3 class="cm-title">{{ 'Archive Room ' + deletingRoomNumber + '?' }}</h3><p class="cm-message popup-message">This room moves to your Archived Rooms tab and is hidden from students. You can restore it at any time.</p></div>
        </div>
        <div class="cm-actions">
          <button type="button" class="cm-btn cm-cancel" @click="closeDeleteModal()">Cancel</button>
          <button type="button" :class="['cm-btn', confirmTone('Archive Room ' + deletingRoomNumber + '?').button]" :disabled="isSubmitting" @click="handleDeleteRoom">{{ isSubmitting ? 'Archiving...' : 'Archive room' }}</button>
        </div>
      </div>
    </div>

  </div>
</template>
<style scoped>
.owner-rooms-content {display:grid;gap:18px;}.owner-rooms-loading {display:flex;flex-direction:column;align-items:center;gap:14px;padding:70px 20px;border:1px solid #e2e8f0;border-radius:16px;background:white;color:#71839c;font-size:13px;}
.owner-room-toolbar {container-type:inline-size;display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:15px;background:white;border:1px solid #e1e9f4;border-radius:14px;box-shadow:0 4px 14px rgb(22 54 94 / .025);}.owner-room-tabs {display:flex;align-items:center;gap:8px;flex-wrap:wrap;}.owner-room-tabs button {font-size:12px;font-weight:650;border-radius:8px;padding:10px 13px;white-space:nowrap;}.owner-room-filters {display:flex;gap:10px;padding-left:15px;border-left:1px solid #e2e8f0;}.owner-room-filters select {font-size:12px;color:#72839d;border:1px solid #e1e9f4;border-radius:7px;padding:9px 28px 9px 11px;background-color:#fff;max-width:180px;}.owner-room-search {display:flex;align-items:center;gap:10px;flex:1 1 260px;max-width:360px;min-width:240px;margin-left:auto;border:1px solid #e1e9f4;border-radius:7px;background:#fbfcff;padding:12px 15px;color:#71839c;}.owner-room-search i {font-size:11px;}.owner-room-search input {border:0;background:transparent;padding:0;outline:none;font-size:13px;min-width:0;width:100%;color:#29415e;}.owner-room-search:focus-within {outline:2px solid #93c5fd;outline-offset:2px;}
.owner-room-utility {display:flex;align-items:center;justify-content:space-between;gap:12px;color:#8191aa;font-size:11px;}.owner-room-empty {padding:55px 20px;background:white;border:1px solid #e1e9f4;border-radius:15px;text-align:center;color:#71839c;}.owner-room-empty>i {font-size:28px;margin-bottom:15px;}.owner-room-empty h2 {font-size:17px;font-weight:650;color:#314b6e;margin-bottom:8px;}.owner-room-empty p {font-size:13px;}.owner-room-empty button {margin-top:15px;font-size:13px;}
@media(max-width:767px){.owner-room-toolbar {gap:12px;padding:13px;}.owner-room-tabs{width:100%;}.owner-room-tabs button{flex:1;font-size:11px;}.owner-room-filters{padding-left:0;border:0;flex:1;}.owner-room-filters select{min-width:0;max-width:none;width:50%;}.owner-room-search{width:100%;min-width:0;max-width:none;flex-basis:100%;margin:0;}.owner-room-search input{width:100%;}.owner-room-utility{align-items:center;}}
@media(min-width:768px) and (max-width:1100px){.owner-room-search {flex-basis:100%;max-width:none;min-width:0;}}
@media(max-width:420px){.owner-room-filters {width:100%;flex-basis:100%;}.owner-room-tabs {gap:6px;}.owner-room-tabs button {padding:10px 8px;}}
@container (max-width:1000px){.owner-room-search {flex-basis:100%;min-width:0;max-width:none;}}

.owner-room-create-row{display:flex;justify-content:flex-end;margin:-8px 0 20px;}
.owner-page .owner-room-create-button{min-height:36px;min-width:0;padding:8px 14px;font-size:12px;justify-content:center;flex-shrink:0;box-shadow:0 2px 6px rgb(37 99 235 / .12);cursor:pointer;}
.owner-room-create-button:focus-visible{outline:3px solid #93c5fd;outline-offset:3px;}
@media(max-width:767px){.owner-room-create-row{margin:0 0 20px;}.owner-page .owner-room-create-button{width:auto;min-height:40px;font-size:12px;}}

/* Add/edit room dialogs share one responsive, independently scrolling layout. */
.room-modal-overlay{padding:24px;}
.owner-page .room-modal-panel{max-width:800px;height:min(860px,calc(100dvh - 48px));max-height:calc(100dvh - 48px);display:grid;grid-template-rows:auto minmax(0,1fr);overflow:clip;border-radius:18px;}
.room-modal-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 26px;border-bottom:1px solid #e4edf8;background:#fff;flex-shrink:0;}
.room-modal-heading{display:flex;align-items:center;gap:14px;min-width:0;}
.room-modal-icon{width:44px;height:44px;display:grid;place-items:center;flex-shrink:0;border-radius:12px;background:#eff6ff;color:#2563eb;font-size:20px;}
.room-modal-heading h2{font-size:20px;font-weight:750;line-height:1.3;}
.room-modal-heading p{font-size:12px;line-height:1.6;color:#526b89;margin-top:4px;}
.room-modal-close{width:40px;height:40px;display:grid;place-items:center;flex-shrink:0;border:1px solid #e1e9f4;border-radius:10px;background:#f8faff;color:#46617f;cursor:pointer;}
.room-modal-close:hover{background:#eff6ff;color:#2563eb;}
.room-modal-form{display:grid;grid-template-rows:minmax(0,1fr) auto;min-height:0;overflow:clip;}
.room-modal-body{overflow-y:auto;overscroll-behavior:contain;min-height:0;padding:24px 26px;scrollbar-gutter:stable;}
.room-modal-basics{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;}
.room-modal-basics label{font-size:12px;color:#334c68;margin-left:0;}
.room-modal-basics :is(input,select){padding:12px 14px;font-size:14px;font-weight:500;background:#fff;min-height:46px;}
.room-modal-basics select{appearance:auto;padding-right:30px;}
.room-modal-footer{display:flex;justify-content:flex-end;align-items:center;gap:12px;flex-shrink:0;padding:16px 26px;border-top:1px solid #e4edf8;background:#f8faff;}
.room-modal-footer .management-button{min-height:36px;padding:8px 16px;font-size:12px;cursor:pointer;}
.room-modal-cancel{border:1px solid #d8e3f0;background:white;color:#334c68;}
.room-modal-cancel:hover{background:#edf3fb;}
.room-modal-save{min-width:110px;}
.room-modal-panel :is(button,input,select):focus-visible{outline:3px solid #93c5fd;outline-offset:2px;}
@media(max-width:639px){.room-modal-overlay{padding:12px;}.owner-page .room-modal-panel{height:calc(100dvh - 24px);max-height:calc(100dvh - 24px);}.room-modal-header{padding:16px;gap:10px;}.room-modal-heading{gap:10px;}.room-modal-heading h2{font-size:18px;}.room-modal-icon{width:38px;height:38px;font-size:17px;}.room-modal-body{padding:20px 16px;}.room-modal-basics{grid-template-columns:1fr;gap:16px;}.room-modal-footer{padding:14px 16px;}.room-modal-footer>button{flex:0 1 auto;min-width:90px;}.room-modal-heading p{font-size:11px;}}


.owner-room-create-button,.owner-room-tabs button,.owner-room-utility a,.room-modal-panel button{transition:background-color 160ms ease,color 160ms ease,border-color 160ms ease,box-shadow 160ms ease;}
@media(pointer:coarse){.owner-page .owner-room-create-button,.room-modal-footer .management-button{min-height:44px;}}
@media(prefers-reduced-motion:reduce){.owner-room-create-button,.owner-room-tabs button,.owner-room-utility a,.room-modal-panel button{transition:none;}}
/* Phone / PWA only: tighter toolbar and spacing */
@media(max-width:639px){
.owner-rooms-content{gap:12px}
.owner-room-create-row{margin:0 0 12px}
.owner-room-toolbar{gap:8px;padding:10px}
.owner-room-tabs button{padding:8px 6px}
.owner-room-filters{gap:8px}
.owner-room-filters select{padding:8px 26px 8px 10px}
.owner-room-search{padding:9px 12px}
}
@media(max-width:639px){
.owner-room-utility a.management-button{min-height:38px!important;height:38px;padding:0 14px!important;font-size:13px!important;line-height:1!important;display:inline-flex;align-items:center;border-radius:9px!important}
/* Add / Edit room: basics in two columns */
.room-modal-basics{grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
.room-modal-basics label{font-size:11px;margin-bottom:6px}
.room-modal-basics :is(input,select){padding:11px 12px!important}
}
</style>
