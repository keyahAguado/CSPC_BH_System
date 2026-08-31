<script setup>
import { ref, onMounted, nextTick, computed, watch } from 'vue';
import axios from 'axios';
import AdminNav from '../../components/partials/AdminNav.vue';

import FlashAlert from '../../components/partials/FlashAlert.vue';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { downloadOriginalFile } from '../../utils/downloadHelper';
import { getImageUrl } from '../../config/api';
import { formatAddress } from '../../utils/formatAddress.js';

const houses = ref([]);
const dynamicDocs = ref([]);

const isLoading = ref(true);
const alertRef = ref(null);
const token = localStorage.getItem('cspc_token');

// Barangay filter & search state
import NABUA_BARANGAYS from '../../constants/barangays.js';

const barangays = NABUA_BARANGAYS;
const selectedBarangay = ref('');
const searchQuery = ref('');

// Client-side filtered list: applies both barangay filter and local search securely
const filteredHouses = computed(() => {
  let result = houses.value;

  // 1. Strict Barangay Filter (Exact match only, no loose includes)
  if (selectedBarangay.value && selectedBarangay.value !== '') {
    const bVal = selectedBarangay.value.toLowerCase().trim();
    result = result.filter(h => {
      const houseBrgy = (h.barangay || '').toLowerCase().trim();
      return houseBrgy === bVal;
    });
  }

  // 2. Search Query Filter
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    result = result.filter(h =>
      (h.name || '').toLowerCase().includes(q) ||
      (h.owner_name || '').toLowerCase().includes(q) ||
      (h.owner_email || '').toLowerCase().includes(q) ||
      (h.location || '').toLowerCase().includes(q) ||
      (h.barangay || '').toLowerCase().includes(q)
    );
  }

  return result;
});

// Diagnostic States
const diagnosticError = ref('');
const apiResponsePayload = ref(null);

const isDownloading = ref(false);
const showPreviewModal = ref(false);
const previewImageUrl = ref('');

const openPreview = (url) => {
  if (!url || url.endsWith('#')) return;
  previewImageUrl.value = url;
  showPreviewModal.value = true;
};

const closePreview = () => {
  showPreviewModal.value = false;
  previewImageUrl.value = '';
};

const downloadOriginal = () => {
  if (!previewImageUrl.value) return;
  downloadOriginalFile(
    previewImageUrl.value,
    token,
    () => { isDownloading.value = true; },
    () => { isDownloading.value = false; },
    (err) => {
      console.error('Download failed:', err);
      showSystemAlert('Failed to download document file.', 'error');
    }
  );
};

// Modals
const showProfileModal = ref(false);
const showBhModal = ref(false);
const showDocModal = ref(false);
const showRoomsModal = ref(false);
const showConfirmModal = ref(false);

// Active objects (Guarded safely with v-if checks to prevent early render crashes)
const activeHouse = ref(null);
const activeDocs = ref([]);
const activeRooms = ref([]);
const activeRoomOccupants = ref([]);
const activeRoomData = ref(null);
const isOccupantsView = ref(false);

const bhPhotos = ref([]);
const currentPhotoIndex = ref(0);
const showLightbox = ref(false);

const getPhotoLabel = (idx) => {
  if (idx === 0) return 'Featured Exterior Photo';
  if (idx === 1) return 'Interior View 1';
  if (idx === 2) return 'Interior View 2';
  if (idx === 3) return 'Interior View 3';
  return `Photo ${idx + 1}`;
};

const prevPhoto = () => {
  if (bhPhotos.value.length === 0) return;
  currentPhotoIndex.value = (currentPhotoIndex.value - 1 + bhPhotos.value.length) % bhPhotos.value.length;
};

const nextPhoto = () => {
  if (bhPhotos.value.length === 0) return;
  currentPhotoIndex.value = (currentPhotoIndex.value + 1) % bhPhotos.value.length;
};

const reviews = ref([]);
const isLoadingReviews = ref(false);
const mapElement = ref(null);

// Confirmation States
const confirmTitle = ref('');
const confirmMessage = ref('');
const confirmAction = ref(null);

let googleInstance = null;

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

const fetchRegisteredHouses = async () => {
  try {
    isLoading.value = true;
    diagnosticError.value = '';
    apiResponsePayload.value = null;

    const params = new URLSearchParams();
    if (selectedBarangay.value && selectedBarangay.value !== '') {
      params.append('barangay', selectedBarangay.value);
    }

    const url = `/api/admin/applications/registered${params.toString() ? '?' + params.toString() : ''}`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    apiResponsePayload.value = response.data;

    if (response.data.success) {
      houses.value = response.data.houses || [];
      dynamicDocs.value = response.data.dynamicDocs || [];
    }
  } catch (error) {
    console.error('Failed to load registered houses:', error);
    diagnosticError.value = error.message + (error.response ? ` (Status: ${error.response.status} - ${error.response.statusText})` : ' (Network Offline)');
    showSystemAlert('Could not fetch registered boarding houses.', 'warning');
  } finally {
    isLoading.value = false;
  }
};

// Re-fetch whenever barangay selection changes
watch(selectedBarangay, () => {
  fetchRegisteredHouses();
});


const handleArchiveHouse = async (houseId) => {
  try {
    const response = await axios.post(`/api/admin/archive/${houseId}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.data.success) {
      showSystemAlert('Boarding house archived successfully.', 'success');
      fetchRegisteredHouses();
    }
  } catch (error) {
    console.error('Archive failed:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to archive property.', 'error');
  }
};

// Owner Profile Viewer
const openProfile = (house) => {
  activeHouse.value = house;
  showProfileModal.value = true;
};

const closeProfile = () => {
  showProfileModal.value = false;
  activeHouse.value = null;
};

// BH Info Modal (Student style preview)
const openBhInfo = async (house) => {
  activeHouse.value = house;
  bhPhotos.value = [house.img, house.img_1, house.img_2, house.img_3].filter(i => i && i !== 'null');
  currentPhotoIndex.value = 0;
  showBhModal.value = true;

  // Load verified reviews
  try {
    isLoadingReviews.value = true;
    const response = await axios.get(`/api/admin/reviews/${house.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    reviews.value = response.data.reviews || [];
  } catch (e) {
    console.error('Failed to fetch reviews:', e);
    reviews.value = [];
  } finally {
    isLoadingReviews.value = false;
  }

  // Load Google Map dynamically
  setTimeout(async () => {
    try {
      const lat = parseFloat(house.latitude) || 13.4079;
      const lng = parseFloat(house.longitude) || 123.3745;
      const bhLocation = { lat, lng };
      
      const { Map } = await googleInstance.maps.importLibrary("maps");
      const { AdvancedMarkerElement } = await googleInstance.maps.importLibrary("marker");

      const mapContainer = mapElement.value;
      if (mapContainer) {
        const map = new Map(mapContainer, {
          center: bhLocation,
          zoom: 16,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          mapId: 'CSPC_ADMIN_REGISTERED_PREVIEW'
        });

        new AdvancedMarkerElement({
          position: bhLocation,
          map: map,
          title: house.name
        });
      }
    } catch (err) {
      console.warn('Map loader error:', err);
    }
  }, 200);
};

const closeBhInfo = () => {
  showBhModal.value = false;
  activeHouse.value = null;
  reviews.value = [];
};



// Documents Viewer
const openDocs = (house) => {
  activeHouse.value = house;
  const permits = [
    { label: 'Business Permit', key: 'permit_business_form' },
    { label: 'Cedula', key: 'permit_cedula' },
    { label: 'DTI Registration', key: 'permit_dti' },
    { label: 'Barangay Clearance', key: 'permit_barangay' },
    { label: 'Building Inspection', key: 'permit_building' },
    { label: 'Zoning/Locational', key: 'permit_zoning' },
    { label: 'Sanitary/Health', key: 'permit_sanitary' },
    { label: 'Fire Safety', key: 'permit_fire' }
  ];

  const uploads = permits.map(p => ({
    label: p.label,
    file: house[p.key] || null,
    isDynamic: false
  }));

  const dynamicUploaded = dynamicDocs.value
    .filter(d => d.house_id === house.id)
    .map(d => ({
      label: d.criteria_label || 'Additional Doc',
      file: d.file_path,
      isDynamic: true
    }));

  activeDocs.value = [...uploads, ...dynamicUploaded];
  showDocModal.value = true;
};

const closeDocs = () => {
  showDocModal.value = false;
  activeHouse.value = null;
  activeDocs.value = [];
};

// Rooms Matrix Modal
const openRoomsMatrix = async (house) => {
  activeHouse.value = house;
  isOccupantsView.value = false;
  showRoomsModal.value = true;

  try {
    const response = await axios.get(`/api/admin/rooms/${house.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    activeRooms.value = response.data.rooms || [];
  } catch (error) {
    console.error('Failed to load rooms:', error);
    showSystemAlert('Could not fetch room matrix.', 'error');
  }
};

const viewBoarderDetails = async (room) => {
  activeRoomData.value = room;
  try {
    const response = await axios.get(`/api/admin/rooms/occupants/${room.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    activeRoomOccupants.value = response.data.occupants || [];
    isOccupantsView.value = true;
  } catch (error) {
    console.error('Failed to load occupants:', error);
    showSystemAlert('Could not fetch room boarders list.', 'error');
  }
};

const handleCheckoutOccupant = async (occId) => {
  try {
    const response = await axios.post(`/api/admin/rooms/occupants/checkout/${occId}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.data.success) {
      showSystemAlert('Boarder checked out successfully.', 'success');
      viewBoarderDetails(activeRoomData.value);
    }
  } catch (error) {
    console.error('Checkout failed:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to checkout boarder.', 'error');
  }
};

const closeRoomsModal = () => {
  showRoomsModal.value = false;
  activeHouse.value = null;
  activeRooms.value = [];
  activeRoomOccupants.value = [];
  isOccupantsView.value = false;
  fetchRegisteredHouses(); 
};

const parseAmenities = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  let temp = val;
  while (typeof temp === 'string') {
    try {
      const parsed = JSON.parse(temp);
      if (temp === parsed) break;
      temp = parsed;
    } catch (e) {
      return temp.split(',').map(item => item.trim()).filter(Boolean);
    }
  }
  return Array.isArray(temp) ? temp : [];
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return '—';
  }
};

onMounted(async () => {
  try {
    isLoading.value = true;
    await fetchRegisteredHouses();

    setOptions({
      key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'YOUR_FALLBACK_GOOGLE_KEY',
      v: 'weekly'
    });

    await importLibrary('maps');
    await importLibrary('marker'); 
    await importLibrary('places');

    googleInstance = window.google; 
  } catch (err) {
    console.error('Google Maps loader failed:', err);
  } finally {
    isLoading.value = false;
  }
});
</script>

<template>
  <div class="bg-[#f8fafc] min-h-screen flex flex-col font-sans text-slate-800 text-left">
    <AdminNav />
    <FlashAlert ref="alertRef" />

    <main class="max-w-[1450px] mx-auto py-12 px-6 flex-1 w-full text-left">
      <!-- Header -->
      <div class="text-center mb-10 mt-6 animate-fade-in">
        <h1 class="text-[32px] text-slate-900 tracking-tight font-black uppercase">List of Registered Boarding Houses</h1>
        <div class="w-16 h-1.5 bg-[#2563eb] mx-auto rounded-full mt-2"></div>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 px-6 gap-6">
        <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>

      <!-- Filter Bar -->
      <div v-if="!isLoading" class="mb-5 flex flex-col sm:flex-row items-center gap-3 animate-fade-in">
        <!-- Search Input -->
        <div class="relative flex-1 min-w-0 w-full sm:w-auto">
          <i class="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search by name, owner, location..."
            class="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 placeholder:font-normal placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition shadow-sm"
          />
        </div>

        <!-- Barangay Filter Dropdown -->
        <div class="flex items-center gap-2 bg-white border border-slate-200 px-4 py-3 rounded-2xl shadow-sm min-w-[220px] w-full sm:w-auto">
          <i class="fa-solid fa-filter text-slate-400 text-xs flex-shrink-0"></i>
          <select
            v-model="selectedBarangay"
            class="flex-1 bg-transparent border-none text-sm font-bold text-slate-700 outline-none cursor-pointer"
          >
            <option value="">All Barangays</option>
            <option v-for="b in barangays" :key="b" :value="b">{{ b }}</option>
          </select>
        </div>

        <!-- Clear Filter Button -->
        <button
          v-if="selectedBarangay || searchQuery"
          @click="selectedBarangay = ''; searchQuery = '';"
          class="flex items-center gap-2 px-4 py-3 bg-slate-100 hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-500 hover:text-red-600 rounded-2xl text-xs font-black uppercase tracking-widest transition whitespace-nowrap w-full sm:w-auto justify-center"
        >
          <i class="fa-solid fa-xmark"></i> Clear
        </button>

        <!-- Results count badge -->
        <div class="text-xs font-black text-slate-400 uppercase tracking-wider whitespace-nowrap">
          {{ filteredHouses.length }} result{{ filteredHouses.length !== 1 ? 's' : '' }}
          <span v-if="selectedBarangay" class="ml-1 px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full text-[9px] uppercase tracking-widest">{{ selectedBarangay }}</span>
        </div>
      </div>

      <!-- Table Container & Card Layout -->
      <div v-if="!isLoading" class="animate-fade-in">
        
        <!-- MOBILE VIEW: Card Layout -->
        <div class="block md:hidden space-y-4">
          <div v-if="filteredHouses.length === 0" class="bg-white rounded-2xl p-8 text-center border border-slate-200/60 text-slate-400 italic text-sm font-black uppercase tracking-widest">
            <span v-if="selectedBarangay || searchQuery">No boarding houses match the selected filter.</span>
            <span v-else>No registered boarding houses found.</span>
          </div>
          
          <div v-for="(house, index) in filteredHouses" :key="'mob-' + house.id" class="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm space-y-4">
            <div class="flex justify-between items-start gap-3">
              <div>
                <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">#{{ index + 1 }}</span>
                <h3 class="font-black text-slate-900 uppercase text-base leading-tight mt-0.5">{{ house.name }}</h3>
              </div>
              <span class="text-[10px] font-black text-slate-400 uppercase bg-slate-100 px-2.5 py-1 rounded-full whitespace-nowrap">
                {{ formatDate(house.created_at) }}
              </span>
            </div>

            <div class="text-xs space-y-1 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <div class="flex justify-between">
                <span class="text-slate-400 font-bold uppercase text-[10px]">Owner:</span>
                <span class="font-semibold text-slate-800">{{ house.owner_name }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400 font-bold uppercase text-[10px]">Email:</span>
                <span class="text-slate-500 truncate max-w-[200px]">{{ house.owner_email }}</span>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2 pt-1">
              <button @click="openProfile(house)" class="text-blue-500 border border-blue-100 bg-white hover:bg-blue-50 rounded-xl p-2.5 flex items-center justify-center gap-2 transition shadow-sm group cursor-pointer active:scale-95">
                <i class="fa-solid fa-user-tie text-[14px] text-blue-500"></i>
                <span class="text-[9px] font-black uppercase tracking-widest text-blue-900">Owner Profile</span>
              </button>
              
              <button @click="openBhInfo(house)" class="text-blue-500 border border-blue-200 bg-white hover:bg-blue-50 rounded-xl p-2.5 flex items-center justify-center gap-2 transition shadow-sm group cursor-pointer active:scale-95">
                <i class="fa-solid fa-hotel text-[14px] text-blue-500"></i>
                <span class="text-[9px] font-black uppercase tracking-widest text-blue-900">BH Info</span>
              </button>

              <button @click="openDocs(house)" class="text-blue-500 border border-blue-200 bg-white hover:bg-blue-50 rounded-xl p-2.5 flex items-center justify-center gap-2 transition shadow-sm group cursor-pointer active:scale-95">
                <i class="fa-solid fa-file-invoice text-[14px] text-blue-500"></i>
                <span class="text-[9px] font-black uppercase tracking-widest text-blue-900">Documents</span>
              </button>

              <button @click="openRoomsMatrix(house)" class="text-blue-500 border border-blue-200 bg-white hover:bg-blue-50 rounded-xl p-2.5 flex items-center justify-center gap-2 transition shadow-sm group cursor-pointer active:scale-95">
                <i class="fa-solid fa-door-open text-[14px] text-blue-500"></i>
                <span class="text-[9px] font-black uppercase tracking-widest text-blue-900">Rooms</span>
              </button>
            </div>

            <div class="pt-2 border-t border-slate-100 flex justify-end">
              <button @click="triggerConfirm('Confirm Archive?', `Are you sure you want to archive ${house.name}? This property will be moved to the archive list and hidden from students.`, () => handleArchiveHouse(house.id))"
                      class="w-full bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 font-black text-[10px] uppercase tracking-widest transition shadow-sm active:scale-95 cursor-pointer text-center">
                Archive Property
              </button>
            </div>
          </div>
        </div>

        <!-- LAPTOP / DESKTOP VIEW: Table Layout -->
        <div class="hidden md:block bg-white rounded-[2rem] shadow-sm border border-slate-200/60 overflow-hidden shadow-slate-100">
          <div class="overflow-x-auto">
            <table class="w-full text-center border-collapse min-w-[1300px]">
              <thead>
                <tr class="bg-slate-50/50 border-b border-slate-100 text-slate-400 text-[10px] font-black tracking-widest uppercase">
                  <th class="py-6 px-3 w-12 border-r border-slate-100">#</th>
                  <th class="py-6 px-4 border-r border-slate-100">Boarding House</th>
                  <th class="py-6 px-4 border-r border-slate-100">Owner Name</th>
                  <th class="py-6 px-4 border-r border-slate-100">Email</th>
                  <th class="py-6 px-4 border-r border-slate-100 text-center">Date</th>
                  <th class="py-6 px-3 border-r border-slate-100">Owners Profile</th>
                  <th class="py-6 px-3 border-r border-slate-100">Boarding House Info</th>
                  <th class="py-6 px-3 border-r border-slate-100">Documents</th>
                  <th class="py-6 px-3 border-r border-slate-100">Rooms</th>
                  <th class="py-6 px-4">Action</th>
                </tr>
              </thead>
              <tbody class="text-[13px] font-bold text-slate-700 divide-y divide-slate-100">
                <tr v-if="filteredHouses.length === 0">
                  <td colspan="10" class="py-20 text-slate-400 italic text-sm text-center font-black uppercase tracking-widest">
                    <span v-if="selectedBarangay || searchQuery">No boarding houses match the selected filter.</span>
                    <span v-else>No registered boarding houses found.</span>
                  </td>
                </tr>
                <tr v-for="(house, index) in filteredHouses" :key="house.id" class="hover:bg-slate-50/20 transition duration-200">

                  <td class="py-6 px-3 border-r border-slate-100 text-slate-400 font-bold">{{ index + 1 }}</td>
                  <td class="py-6 px-4 border-r border-slate-100 font-black text-slate-900 leading-tight uppercase">{{ house.name }}</td>
                  <td class="py-6 px-4 border-r border-slate-100 font-semibold">{{ house.owner_name }}</td>
                  <td class="py-6 px-4 border-r border-slate-100 text-slate-500">{{ house.owner_email }}</td>
                  <td class="py-6 px-4 border-r border-slate-100 text-slate-400 font-black">
                    {{ formatDate(house.created_at) }}
                  </td>
                  <td class="py-6 px-3 border-r border-slate-100">
                    <button @click="openProfile(house)" class="text-blue-500 border border-blue-100 bg-white hover:bg-blue-50 rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 mx-auto transition w-20 shadow-sm group cursor-pointer active:scale-95">
                      <i class="fa-solid fa-user-tie text-[16px] text-blue-500 group-hover:scale-110 transition duration-300"></i>
                      <span class="leading-tight text-[8px] font-black uppercase tracking-widest text-center text-blue-900">View<br />Profile</span>
                    </button>
                  </td>
                  <td class="py-6 px-3 border-r border-slate-100">
                    <button @click="openBhInfo(house)" class="text-blue-500 border border-blue-200 bg-white hover:bg-blue-50 rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 mx-auto transition w-20 shadow-sm group cursor-pointer active:scale-95">
                      <i class="fa-solid fa-hotel text-[16px] text-blue-500 group-hover:scale-110 transition duration-300"></i>
                      <span class="leading-tight text-[8px] font-black uppercase tracking-widest text-center text-blue-900">View BH<br />Info</span>
                    </button>
                  </td>
                  <td class="py-6 px-3 border-r border-slate-100">
                    <button @click="openDocs(house)" class="text-blue-500 border border-blue-200 bg-white hover:bg-blue-50 rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 mx-auto transition w-20 shadow-sm group cursor-pointer active:scale-95">
                      <i class="fa-solid fa-file-invoice text-[16px] text-blue-500 group-hover:scale-110 transition duration-300"></i>
                      <span class="leading-tight text-[8px] font-black uppercase tracking-widest text-center text-blue-900">View<br />Docs</span>
                    </button>
                  </td>
                  <td class="py-6 px-3 border-r border-slate-100">
                    <button @click="openRoomsMatrix(house)" class="text-blue-500 border border-blue-200 bg-white hover:bg-blue-50 rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 mx-auto transition w-20 shadow-sm group cursor-pointer active:scale-95">
                      <i class="fa-solid fa-door-open text-[16px] text-blue-500 group-hover:scale-110 transition duration-300"></i>
                      <span class="leading-tight text-[8px] font-black uppercase tracking-widest text-center text-blue-900">View<br />Rooms</span>
                    </button>
                  </td>
                  <td class="py-6 px-4">
                    <button @click="triggerConfirm('Confirm Archive?', `Are you sure you want to archive ${house.name}? This property will be moved to the archive list and hidden from students.`, () => handleArchiveHouse(house.id))"
                            class="bg-red-500 hover:bg-red-600 text-white rounded-xl px-4 py-2 font-black text-[10px] uppercase tracking-widest transition shadow-md active:scale-95 cursor-pointer">
                      Archive
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>

    <!-- Modals (Profile, BH Info, Docs, Rooms, Confirm, Preview) -->
   <!-- Owner Profile Modal -->
<div v-if="showProfileModal && activeHouse" class="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
  <div class="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden text-left border border-slate-100 animate-in zoom-in-95 duration-200">
    <div class="bg-slate-50 border-b border-slate-100 px-8 py-6 flex justify-between items-center shrink-0">
      <h1 class="text-[10px] font-black tracking-[0.2em] uppercase text-slate-400">Owner Information Profile</h1>
      <button @click="closeProfile" class="text-slate-400 hover:text-red-500 transition text-2xl focus:outline-none cursor-pointer">&times;</button>
    </div>
    
    <div class="flex-1 overflow-y-auto bg-white p-8 sm:p-12 scrollbar-thin">
      <!-- Profile Header Wrapper -->
      <div class="flex flex-col sm:flex-row items-center gap-6 mb-10 pb-8 border-b border-slate-100 text-center sm:text-left">
        <div class="w-24 h-24 rounded-3xl bg-[#2a528a] flex items-center justify-center shadow-md shrink-0 overflow-hidden border-2 border-slate-100">
          <img v-if="activeHouse.profile_pic" :src="getImageUrl(activeHouse.profile_pic)" class="w-full h-full object-cover" />
          <span v-else class="text-white text-4xl font-black">{{ activeHouse.owner_name.charAt(0).toUpperCase() }}</span>
        </div>
        <div>
          <h2 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight mb-1">{{ activeHouse.owner_name }}</h2>
          <p class="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em]">Boarding House Owner</p>
        </div>
      </div>

      <!-- Information Grid Layout -->
      <div class="space-y-8 max-w-2xl mx-auto">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 items-center">
          <div class="md:col-span-1">
            <h3 class="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em]">Contact Details</h3>
            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Primary Information</p>
          </div>
          <div class="md:col-span-2 space-y-4">
            <div class="space-y-1">
              <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
              <div class="bg-slate-50 border border-slate-200/60 rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-800">{{ activeHouse.owner_name }}</div>
            </div>
            <div class="space-y-1">
              <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Phone Number</label>
              <div class="bg-slate-50 border border-slate-200/60 rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-800">{{ activeHouse.owner_phone || activeHouse.phone_contact || 'N/A' }}</div>
            </div>
            <div class="space-y-1">
              <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Residential Address</label>
              <div class="bg-slate-50 border border-slate-200/60 rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-800">{{ activeHouse.owner_address || 'N/A' }}</div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 items-center pt-6 border-t border-slate-50">
          <div class="md:col-span-1">
            <h3 class="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em]">Security</h3>
            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Credentials</p>
          </div>
          <div class="md:col-span-2">
            <div class="space-y-1">
              <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
              <div class="bg-slate-50 border border-slate-200/60 rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-400 italic break-all">{{ activeHouse.owner_email }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="border-t border-slate-100 px-8 py-5 flex justify-end bg-slate-50/50 shrink-0">
      <button @click="closeProfile" class="bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em] px-8 py-3 rounded-xl hover:bg-blue-600 transition shadow-md focus:outline-none cursor-pointer">Close Profile</button>
    </div>
  </div>
</div>

    <!-- Boarding House Info Modal -->
<div v-if="showBhModal && activeHouse" class="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
  <div class="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-6xl flex flex-col max-h-[92vh] overflow-hidden text-left border border-slate-100 animate-in zoom-in-95 duration-200">
    <div class="bg-slate-900 text-white px-8 py-5 flex justify-between items-center rounded-t-[2.5rem] shrink-0">
      <div class="flex items-center gap-3">
        <img src="/img/CSPC_logo.png" alt="Logo" class="w-7 h-7 object-contain" />
        <h2 class="text-sm font-black tracking-tight uppercase">Boarding House Information</h2>
      </div>
      <button @click="closeBhInfo" class="text-white hover:text-blue-100 transition flex items-center justify-center h-8 w-8 rounded-full hover:bg-white/10 text-xl focus:outline-none cursor-pointer">&times;</button>
    </div>
    
    <div class="flex-1 overflow-y-auto bg-white p-8 md:p-12 space-y-8">
      <!-- Header Info -->
      <div class="max-w-none">
        <h1 class="text-3xl md:text-4xl font-black text-slate-900 uppercase tracking-tight leading-tight">{{ activeHouse.name }}</h1>
        <div class="flex items-center gap-4 mt-3 flex-wrap">
          <div class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p class="font-bold text-[11px] uppercase tracking-widest text-slate-600">
              {{ formatAddress(activeHouse) || `Near ${activeHouse.name}` }}
            </p>
          </div>
          <div v-if="activeHouse.avg_rating" class="flex items-center gap-1.5 bg-yellow-400/10 px-3 py-1 rounded-full border border-yellow-400/20">
            <span class="text-[10px] font-black text-yellow-700">{{ Number(activeHouse.avg_rating).toFixed(1) }} Rating ({{ activeHouse.review_count || 0 }})</span>
          </div>
        </div>
      </div>

      <!-- Content Box Wrapper -->
      <div class="max-w-none space-y-8 w-full">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Map Container -->
          <div class="bg-slate-50 rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm flex flex-col">
            <h2 class="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 mb-3">Location Map</h2>
            <div class="rounded-2xl overflow-hidden border border-slate-200 shadow-inner bg-white relative w-full flex-1 min-h-[320px]">
              <div ref="mapElement" class="w-full h-full min-h-[320px]"></div>
            </div>
          </div>

          <!-- Enhanced Property Gallery Section -->
          <div class="bg-slate-50 rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-3">
                <h2 class="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Property Gallery</h2>
                <span v-if="bhPhotos.length > 0" class="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-white px-2.5 py-1 rounded-full border border-slate-200 shadow-2xs">
                  {{ currentPhotoIndex + 1 }} of {{ bhPhotos.length }}
                </span>
              </div>

              <!-- Main Stage Photo Viewer -->
              <div v-if="bhPhotos.length > 0" class="relative group rounded-2xl overflow-hidden border border-slate-200 shadow-inner bg-slate-900 aspect-video w-full flex items-center justify-center cursor-pointer" @click="showLightbox = true">
                <img :src="getImageUrl(bhPhotos[currentPhotoIndex])" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt="Property Photo" />
                
                <!-- Badge Overlay -->
                <div class="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/20 shadow-md">
                  <i class="fa-solid fa-camera mr-1.5 text-blue-400"></i> {{ getPhotoLabel(currentPhotoIndex) }}
                </div>

                <!-- Lightbox Hint Overlay -->
                <div class="absolute bottom-3 right-3 bg-slate-900/80 backdrop-blur-md text-white px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border border-white/20 opacity-0 group-hover:opacity-100 transition shadow-md">
                  <i class="fa-solid fa-expand mr-1"></i> Expand Photo
                </div>

                <!-- Nav Controls -->
                <button v-if="bhPhotos.length > 1" @click.stop="prevPhoto" class="absolute left-2.5 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-slate-800 w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shadow-lg transition cursor-pointer active:scale-95 z-10">&lsaquo;</button>
                <button v-if="bhPhotos.length > 1" @click.stop="nextPhoto" class="absolute right-2.5 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-slate-800 w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shadow-lg transition cursor-pointer active:scale-95 z-10">&rsaquo;</button>
              </div>

              <!-- Fallback Empty Photos -->
              <div v-else class="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-8 text-center flex flex-col items-center justify-center min-h-[220px]">
                <i class="fa-solid fa-image text-slate-300 text-3xl mb-2"></i>
                <p class="text-slate-400 text-[10px] font-bold uppercase tracking-widest">No Property Photos Uploaded</p>
              </div>
            </div>

            <!-- Interactive Thumbnails Carousel Row -->
            <div v-if="bhPhotos.length > 1" class="flex items-center gap-2 mt-4 pt-4 border-t border-slate-200/60 overflow-x-auto pb-1">
              <button v-for="(img, idx) in bhPhotos" :key="idx" @click="currentPhotoIndex = idx"
                      class="relative w-16 h-12 rounded-xl overflow-hidden border-2 transition shrink-0 cursor-pointer focus:outline-none"
                      :class="currentPhotoIndex === idx ? 'border-blue-600 ring-2 ring-blue-400/30 scale-105 shadow-md' : 'border-slate-200 opacity-60 hover:opacity-100'">
                <img :src="getImageUrl(img)" class="w-full h-full object-cover" />
              </button>
            </div>
          </div>

        </div>

        <!-- Amenities -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-slate-50 p-6 rounded-3xl border border-slate-100">
            <h3 class="text-[10px] font-black text-emerald-600 uppercase mb-3 tracking-widest">Free Amenities</h3>
            <ul class="text-xs font-bold text-slate-600 space-y-2">
              <template v-if="parseAmenities(activeHouse.amenities_free).length > 0">
                <li v-for="a in parseAmenities(activeHouse.amenities_free)" :key="a" class="flex items-center gap-2">
                  <span class="w-2 h-2 bg-emerald-500 rounded-full"></span> {{ a }}
                </li>
              </template>
              <li v-else class="italic text-slate-400">Basic facilities</li>
            </ul>
          </div>
          <div class="bg-slate-50 p-6 rounded-3xl border border-slate-100">
            <h3 class="text-[10px] font-black text-rose-500 uppercase mb-3 tracking-widest">Paid Add-ons</h3>
            <ul class="text-xs font-bold text-slate-600 space-y-2">
              <template v-if="parseAmenities(activeHouse.amenities_paid).length > 0">
                <li v-for="a in parseAmenities(activeHouse.amenities_paid)" :key="a" class="flex items-center gap-2">
                  <span class="w-2 h-2 bg-blue-400 rounded-full"></span> {{ a }}
                </li>
              </template>
              <li v-else class="italic text-slate-400">No paid add-ons listed.</li>
            </ul>
          </div>
        </div>

        <!-- Description -->
        <div class="bg-slate-50 p-6 rounded-3xl border border-slate-100">
          <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Description</h3>
          <p class="text-sm font-medium text-slate-600 leading-relaxed whitespace-pre-wrap">{{ activeHouse.description || 'No description provided.' }}</p>
        </div>
      </div>
    </div>

    <div class="border-t border-slate-100 px-8 py-4 flex justify-end bg-slate-50/50 shrink-0">
      <button @click="closeBhInfo" class="bg-[#2a528a] text-white text-[10px] font-black uppercase tracking-[0.2em] px-8 py-3 rounded-full hover:bg-slate-900 transition shadow-md focus:outline-none cursor-pointer">Close Preview</button>
    </div>
  </div>
</div>

   <!-- Document Viewer Modal -->
<div v-if="showDocModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex justify-center items-center p-4">
  <div class="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-left border border-slate-100 animate-in fade-in duration-300">
    
    <!-- Modal Header -->
    <div class="bg-[#2a528a] text-white px-8 py-5 flex items-center shrink-0">
      <div class="flex items-center gap-3 min-w-0 pr-4">
        <div class="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
          </svg>
        </div>
        <h2 class="text-sm sm:text-lg font-black uppercase tracking-tight truncate">
          {{ activeHouse ? activeHouse.owner_name : '' }} - Legal Documents
        </h2>
      </div>
      
      <button @click="closeDocs" class="ml-auto text-white/80 hover:text-white bg-white/10 hover:bg-red-500 transition flex items-center justify-center h-9 w-9 rounded-full text-xl focus:outline-none cursor-pointer shrink-0">&times;</button>
    </div>
    
    <!-- Modal Content Grid -->
    <div class="p-8 overflow-y-auto grow bg-slate-50/50">
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
        <div v-for="doc in activeDocs" :key="doc.label" class="flex justify-center">
          <div v-if="!doc.file" class="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-6 w-full h-72 flex flex-col items-center justify-center text-center opacity-60 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-300 mb-3">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" />
            </svg>
            <h3 class="font-black text-[11px] text-slate-400 uppercase tracking-widest">{{ doc.label }}</h3>
            <p class="text-[8px] text-slate-300 mt-1 font-bold uppercase tracking-widest">NOT UPLOADED</p>
          </div>

          <div v-else class="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden w-full h-72 flex flex-col group transition hover:shadow-xl">
            <div class="h-44 bg-slate-100 relative flex items-center justify-center p-4">
              <img :src="getImageUrl(doc.file)" class="w-full h-full object-contain filter group-hover:scale-105 transition duration-300" />
              <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center">
                <button @click="openPreview(getImageUrl(doc.file))" type="button" class="bg-white text-slate-900 px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest shadow-md hover:bg-blue-600 hover:text-white transition cursor-pointer">Preview</button>
              </div>
            </div>
            <div class="p-4 text-center border-t border-slate-50 flex-1 flex flex-col justify-center">
              <h3 class="font-black text-[11px] text-slate-900 uppercase tracking-tight">{{ doc.label }}</h3>
              <p class="text-[8px] text-slate-400 mt-1 font-bold uppercase tracking-widest">Verified File</p>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</div>

   <!-- Rooms Matrix Modal -->
<div v-if="showRoomsModal" class="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
  <div class="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden text-left border border-slate-100 animate-in zoom-in-95 duration-200">
    
    <!-- Modal Header -->
    <div class="bg-[#2a528a] text-white py-5 px-6 sm:px-8 flex justify-between items-center rounded-t-[2.5rem] shrink-0">
      <div class="flex items-center gap-2.5 min-w-0 pr-4">
        <div class="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
        </div>
        <h2 class="text-[11px] sm:text-xs font-black uppercase tracking-wider leading-snug">
          Rooms & Occupants <span class="block sm:inline">Monitoring</span>
        </h2>
      </div>
      <button @click="closeRoomsModal" class="text-white hover:text-red-300 transition flex items-center justify-center h-9 w-9 rounded-full hover:bg-white/10 text-xl focus:outline-none cursor-pointer shrink-0">&times;</button>
    </div>

    <!-- Main Content Area -->
    <div class="flex-1 overflow-y-auto bg-slate-50/50 p-6 md:p-8">
      
      <!-- 1. Rooms Matrix List View -->
      <div v-if="!isOccupantsView" class="space-y-4 max-w-2xl mx-auto font-sans">
        <div class="text-center pb-3">
          <h1 class="text-xl font-black text-slate-900 uppercase tracking-tight mb-1">Room Status Matrix</h1>
          <p class="text-blue-600 font-black uppercase text-[10px] tracking-widest">{{ activeHouse ? activeHouse.name : '' }}</p>
        </div>

        <div v-if="activeRooms.length === 0" class="bg-white rounded-3xl p-8 text-center text-slate-400 font-bold uppercase tracking-widest text-xs border border-slate-100">
          No rooms listed for this boarding house.
        </div>

        <div v-for="room in activeRooms" :key="room.id" class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition hover:shadow-md">
          <div class="space-y-1">
            <div class="flex items-center gap-3">
              <span class="text-lg font-black text-slate-900">Room {{ room.room_number }}</span>
              <span class="inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase" :class="room.gender_type === 'female' ? 'bg-pink-50 text-pink-600 border border-pink-100' : 'bg-blue-50 text-blue-600 border border-blue-100'">
                {{ room.gender_type }}
              </span>
            </div>
            <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Occupancy: <span class="text-slate-900 font-black">{{ room.occupant_count }} / {{ room.capacity }}</span>
              <span class="text-slate-400">({{ room.capacity - room.occupant_count }} Vacant)</span>
            </p>
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <span class="text-blue-600 font-black">{{ room.cspc_count }} CSPC</span>
              <span v-if="room.non_cspc_count > 0" class="ml-2 text-slate-400">+ {{ room.non_cspc_count }} Non-CSPC</span>
            </p>
          </div>

          <div class="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <span class="inline-block border text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-wider" :class="room.occupant_count >= room.capacity ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'">
              {{ room.occupant_count >= room.capacity ? 'Full' : 'Available' }}
            </span>
            <button @click="viewBoarderDetails(room)" class="bg-[#2a528a] hover:bg-slate-900 text-white text-[9px] font-black px-5 py-2.5 rounded-xl uppercase tracking-widest transition shadow-sm cursor-pointer">
              View Details
            </button>
          </div>
        </div>
      </div>

      <!-- 2. Room Occupants Card View -->
      <div v-else class="space-y-6 max-w-2xl mx-auto font-sans">
        <div class="flex items-center justify-between">
          <button @click="isOccupantsView = false" class="text-blue-500 hover:text-blue-700 font-black text-xs uppercase tracking-widest flex items-center gap-1 cursor-pointer">
            &lsaquo; Back to Rooms
          </button>
          <h2 class="text-xs font-black uppercase tracking-widest text-slate-400">
            Room {{ activeRoomData ? activeRoomData.room_number : '' }} Occupants
          </h2>
        </div>

        <div v-if="activeRoomOccupants.length === 0" class="bg-white rounded-3xl p-8 text-center text-slate-400 uppercase font-black tracking-widest text-xs border border-slate-100">
          No active CSPC student boarders in this room.
        </div>

        <div v-for="(occ, i) in activeRoomOccupants" :key="occ.id" class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div class="bg-slate-900 px-6 py-3.5 border-b border-slate-800 flex justify-between items-center">
            <span class="text-[10px] font-black uppercase tracking-[0.2em] text-white">CSPC Resident #{{ i + 1 }}</span>
            <span class="inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase" :class="occ.payment_status === 'Paid' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'">
              {{ occ.payment_status }}
            </span>
          </div>

          <div class="divide-y divide-slate-50 px-6 text-xs font-bold text-slate-700">
            <div class="py-3.5 flex justify-between items-center">
              <span class="text-[9px] font-black uppercase tracking-widest text-slate-400">Name</span>
              <span class="font-black text-slate-900 uppercase text-sm">{{ occ.name }}</span>
            </div>
            <div class="py-3.5 flex justify-between items-center">
              <span class="text-[9px] font-black uppercase tracking-widest text-slate-400">Age / Contact</span>
              <span class="text-slate-800">{{ occ.age ? `${occ.age} yrs old` : '—' }} • {{ occ.contact_number || 'No contact' }}</span>
            </div>
            <div class="py-3.5 flex justify-between items-center">
              <span class="text-[9px] font-black uppercase tracking-widest text-slate-400">Check-in Date</span>
              <span>{{ occ.check_in_date ? new Date(occ.check_in_date).toLocaleDateString() : '—' }}</span>
            </div>
            <div class="py-3.5 flex justify-between items-center">
              <span class="text-[9px] font-black uppercase tracking-widest text-slate-400">Duration & Ledger</span>
              <span class="text-blue-600 font-black">{{ occ.months }} Mos — ₱{{ occ.amount ? Number(occ.amount).toLocaleString() : '0' }}</span>
            </div>
          </div>
        </div>

      </div>

    </div>

    <div class="border-t border-slate-100 px-8 py-4 flex justify-end bg-white shrink-0">
      <button @click="closeRoomsModal" class="bg-slate-900 text-white px-8 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition shadow-md focus:outline-none cursor-pointer">Close Monitor</button>
    </div>

  </div>
</div>

    <!-- Custom Confirmation Modal -->
    <div v-if="showConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div class="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full text-center border border-slate-100">
        <h3 class="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">{{ confirmTitle }}</h3>
        <p class="text-slate-500 text-xs font-medium mb-6 leading-relaxed">{{ confirmMessage }}</p>
        <div class="flex gap-3">
          <button @click="executeConfirm" class="flex-1 bg-blue-600 hover:bg-black text-white text-[10px] font-black py-3.5 rounded-xl uppercase tracking-widest transition">Confirm</button>
          <button @click="showConfirmModal = false" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black py-3.5 rounded-xl uppercase tracking-widest transition">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Dynamic Lightbox Preview Modal -->
    <div v-if="showPreviewModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[250] flex items-center justify-center p-4 animate-fade-in" @click="closePreview">
      <div class="relative max-w-4xl max-h-[85vh] overflow-hidden bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center" @click.stop>
        <button @click="closePreview" class="absolute top-4 right-4 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 w-10 h-10 rounded-full flex items-center justify-center transition">
          <i class="fa-solid fa-xmark text-lg"></i>
        </button>
        <img :src="previewImageUrl" class="max-w-full max-h-[70vh] object-contain rounded-2xl mb-4 shadow-sm" alt="Document Preview" />
        <button @click="downloadOriginal" :disabled="isDownloading" class="bg-blue-600 hover:bg-black text-white px8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition flex items-center gap-2">
          <i v-if="isDownloading" class="fa-solid fa-spinner animate-spin"></i>
          <i v-else class="fa-solid fa-download"></i>
          {{ isDownloading ? 'Downloading...' : 'Download Original' }}
        </button>
      </div>
    </div>

    <!-- Fullscreen Lightbox Modal for BH Gallery -->
    <div v-if="showLightbox && bhPhotos.length > 0" class="fixed inset-0 z-[250] bg-black/90 backdrop-blur-md flex items-center justify-center p-4" @click="showLightbox = false">
      <div class="relative max-w-5xl max-h-[90vh] w-full flex flex-col items-center justify-center" @click.stop>
        <button @click="showLightbox = false" class="absolute -top-12 right-0 text-white/80 hover:text-white text-3xl font-black focus:outline-none cursor-pointer">&times;</button>
        <img :src="getImageUrl(bhPhotos[currentPhotoIndex])" class="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-white/10" />
        <div class="mt-4 bg-slate-900/80 text-white px-5 py-2 rounded-full text-xs font-black uppercase tracking-widest border border-white/10 flex items-center gap-3">
          <span>{{ getPhotoLabel(currentPhotoIndex) }}</span>
          <span class="text-slate-500">|</span>
          <span class="text-blue-400">{{ currentPhotoIndex + 1 }} / {{ bhPhotos.length }}</span>
        </div>
      </div>
    </div>


  </div>
</template>