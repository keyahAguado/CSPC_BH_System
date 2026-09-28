<script setup>
import { ref, watch, computed, onMounted } from 'vue';
import axios from 'axios';
import AdminNav from '../../components/partials/AdminNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { matchesSearch } from '../../utils/search.js';
import { formatAddress } from '../../utils/formatAddress.js';
import { computeCheckoutDate, formatCheckoutDateString } from '../../utils/dateHelper.js';

const getAdminCheckoutDate = (occ) => {
  if (!occ.check_in_date) return '—';
  const d = computeCheckoutDate(occ.check_in_date, occ.months || 1);
  return formatCheckoutDateString(d);
};

const houses = ref([]);
const dynamicDocs = ref([]);
const searchQuery = ref('');

const filteredHouses = computed(() => {
  if (!searchQuery.value) return houses.value;
  return houses.value.filter(h =>
    matchesSearch(searchQuery.value, [
      h.name,
      h.owner_name,
      h.owner_email,
      h.created_at ? formatDate(h.created_at) : '',
      h.created_at ? String(h.created_at) : '',
      h.owner_phone,
      h.phone_contact,
      h.location,
      h.barangay,
      h.description,
      h.amenities_free,
      h.amenities_paid
    ])
  );
});

const isLoading = ref(true);
const alertRef = ref(null);
const token = sessionStorage.getItem('cspc_token');
import { getImageUrl } from '../../config/api';

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

// Active contexts 
const activeHouse = ref(null);
const activeDocs = ref([]);
const requiredDocs = ref([]);
const optionalDocs = ref([]);
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

// Pure Vue Reactive Pagination
const currentPage = ref(1);
const itemsPerPage = ref(10);

watch(searchQuery, () => {
  currentPage.value = 1;
});

const paginatedHouses = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  return filteredHouses.value.slice(start, start + itemsPerPage.value);
});

const totalPages = computed(() => {
  return Math.ceil(filteredHouses.value.length / itemsPerPage.value) || 1;
});

const startItemIndex = computed(() => {
  if (filteredHouses.value.length === 0) return 0;
  return (currentPage.value - 1) * itemsPerPage.value + 1;
});

const endItemIndex = computed(() => {
  return Math.min(currentPage.value * itemsPerPage.value, filteredHouses.value.length);
});

const fetchArchivedHouses = async () => {
  try {
    isLoading.value = true;
    diagnosticError.value = '';
    apiResponsePayload.value = null;

    const response = await axios.get(`/api/admin/applications/archived`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    apiResponsePayload.value = response.data;

    if (response.data.success) {
      houses.value = response.data.houses || [];
      dynamicDocs.value = response.data.dynamicDocs || [];
    }
  } catch (error) {
    console.error('Failed to load archived houses:', error);
    diagnosticError.value = error.message + (error.response ? ` (Status: ${error.response.status} - ${error.response.statusText})` : ' (Network Offline)');
    showSystemAlert('Could not fetch archived boarding houses.', 'warning');
  } finally {
    isLoading.value = false;
  }
};

const handleRestoreHouse = async (houseId) => {
  try {
    const response = await axios.post(`/api/admin/restore/${houseId}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.data.success) {
      showSystemAlert('Boarding house restored successfully.', 'success');
      fetchArchivedHouses();
    }
  } catch (error) {
    console.error('Restore failed:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to restore property.', 'error');
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

// BH Info Modal
const openBhInfo = async (house) => {
  activeHouse.value = house;
  bhPhotos.value = [house.img, house.img_1, house.img_2, house.img_3].filter(i => i && i !== 'null');
  currentPhotoIndex.value = 0;
  showBhModal.value = true;

  try {
    isLoadingReviews.value = true;
    const response = await axios.get(`/api/admin/reviews/${house.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    reviews.value = response.data.reviews || [];
  } catch (e) {
    console.error('Failed to load reviews:', e);
    reviews.value = [];
  } finally {
    isLoadingReviews.value = false;
  }

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
          mapId: 'CSPC_ADMIN_ARCHIVED_PREVIEW'
        });

        new AdvancedMarkerElement({
          position: bhLocation,
          map: map,
          title: house.name
        });
      }
    } catch (err) {
      console.warn('Map initialization failed:', err);
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

  const requiredList = [
    { label: 'BUSINESS PERMIT APPLICATION FORM', key: 'permit_business_form' },
    { label: 'BARANGAY BUSINESS CLEARANCE', key: 'permit_barangay' },
    { label: 'SANITARY PERMIT / HEALTH CLEARANCE', key: 'permit_sanitary' },
    { label: 'VALID FIRE SAFETY INSPECTION CERTIFICATE', key: 'permit_fire' }
  ];

  const optionalList = [
    { label: 'COMMUNITY TAX CERTIFICATE (CEDULA)', key: 'permit_cedula' },
    { label: 'DTI REGISTRATION CERTIFICATE', key: 'permit_dti' },
    { label: 'CERTIFICATE OF BUILDING INSPECTION', key: 'permit_building' },
    { label: 'ZONING CERTIFICATE / LOCATIONAL CLEARANCE', key: 'permit_zoning' }
  ];

  requiredDocs.value = requiredList.map(p => ({
    label: p.label,
    file: house[p.key] || null
  }));

  const standardOptional = optionalList.map(p => ({
    label: p.label,
    file: house[p.key] || null
  }));

  const facadeDoc = house.img ? [{ label: 'FACADE PHOTO', file: house.img }] : [];

  const dynamicUploaded = dynamicDocs.value
    .filter(d => d.house_id === house.id)
    .map(d => ({
      label: (d.criteria_label || 'ADDITIONAL DOCUMENT').toUpperCase(),
      file: d.file_path
    }));

  optionalDocs.value = [...standardOptional, ...facadeDoc, ...dynamicUploaded];
  showDocModal.value = true;
};

const closeDocs = () => {
  showDocModal.value = false;
  activeHouse.value = null;
  requiredDocs.value = [];
  optionalDocs.value = [];
};

// Rooms Matrix
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
  fetchArchivedHouses();
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
    await fetchArchivedHouses();

    setOptions({
      key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
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

    <main class="max-w-[1450px] mx-auto py-12 px-4 sm:px-6 flex-1 w-full text-left">
      <!-- Header -->
      <div class="text-center mb-10 mt-6 animate-fade-in">
        <h1 class="text-[28px] sm:text-[32px] text-slate-900 tracking-tight font-black uppercase">List of Archived Boarding Houses</h1>
        <div class="w-16 h-1.5 bg-[#2563eb] mx-auto rounded-full mt-2"></div>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 px-6 gap-6">
        <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>

      <!-- Content Container -->
      <div v-else>
        <!-- Search Control Bar (Positioned at TOP for Mobile & Desktop) -->
        <div class="mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <!-- Search Input -->
          <div class="relative flex-1 min-w-0 w-full sm:w-auto">
            <i class="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search by boarding house name, location..."
              class="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 placeholder:font-normal placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition shadow-sm"
            />
          </div>

          <!-- Clear Filter Button -->
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            class="flex items-center gap-2 px-4 py-3 bg-slate-100 hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-500 hover:text-red-600 rounded-2xl text-xs font-black uppercase tracking-widest transition whitespace-nowrap w-full sm:w-auto justify-center"
          >
            <i class="fa-solid fa-xmark"></i> Clear
          </button>
        </div>

        <!-- Top Pagination Bar -->
        <div v-if="filteredHouses.length > 0" class="mb-4 px-6 py-3.5 bg-white rounded-2xl border border-slate-200/60 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-bold text-slate-500">
          <div class="flex items-center gap-4">
            <span>Showing {{ startItemIndex }} to {{ endItemIndex }} of {{ filteredHouses.length }} entries</span>
            <div class="flex items-center gap-2">
              <span class="text-[11px] font-bold text-slate-400">Rows per page:</span>
              <select v-model="itemsPerPage" class="bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg text-xs font-bold text-slate-700 outline-none cursor-pointer">
                <option :value="10">10</option>
                <option :value="25">25</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
              </select>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button 
              @click="currentPage > 1 && currentPage--" 
              :disabled="currentPage === 1"
              class="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition font-bold cursor-pointer"
            >
              <i class="fa-solid fa-chevron-left text-[10px]"></i> Prev
            </button>
            <span class="px-3 py-1 bg-blue-600 text-white rounded-xl font-black text-xs">
              {{ currentPage }} / {{ totalPages }}
            </span>
            <button 
              @click="currentPage < totalPages && currentPage++" 
              :disabled="currentPage === totalPages"
              class="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition font-bold cursor-pointer"
            >
              Next <i class="fa-solid fa-chevron-right text-[10px]"></i>
            </button>
          </div>
        </div>

        <!-- MOBILE VIEW CONTAINER -->
        <div class="block md:hidden bg-white rounded-[2rem] shadow-sm border border-slate-200/60 p-6 space-y-4">
          <div class="border-b border-slate-100 pb-3 text-center">
            <h2 class="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Archived List Overview</h2>
          </div>

          <div v-if="filteredHouses.length === 0" class="py-12 text-center">
            <p class="text-slate-400 italic text-xs font-black uppercase tracking-widest">
              No archived boarding houses found.
            </p>
          </div>

          <div v-else class="space-y-4">
            <div v-for="(house, index) in paginatedHouses" :key="house.id" class="bg-slate-50/50 rounded-[1.5rem] p-5 border border-slate-100 space-y-3">
              <div class="flex justify-between items-start border-b border-slate-200/60 pb-2">
                <div>
                  <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">#{{ startItemIndex + index }}</span>
                  <h3 class="text-base font-black text-slate-900 uppercase tracking-tight leading-tight mt-0.5">{{ house.name }}</h3>
                </div>
                <span class="text-[9px] font-black text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-full shadow-2xs">
                  {{ formatDate(house.created_at) }}
                </span>
              </div>

              <div class="space-y-1.5 text-xs">
                <div class="flex justify-between py-0.5">
                  <span class="font-black text-slate-400 uppercase tracking-wider text-[10px]">Owner Name:</span>
                  <span class="font-bold text-slate-700 text-right">{{ house.owner_name }}</span>
                </div>
                <div class="flex justify-between py-0.5">
                  <span class="font-black text-slate-400 uppercase tracking-wider text-[10px]">Email:</span>
                  <span class="font-semibold text-slate-500 text-right break-all ml-4">{{ house.owner_email }}</span>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2 pt-2">
                <button @click="openProfile(house)" class="text-blue-600 border border-blue-100 bg-white hover:bg-blue-50 rounded-xl p-2.5 flex items-center justify-center gap-1.5 transition text-[10px] font-black uppercase tracking-wider shadow-2xs">
                  <i class="fa-solid fa-user-tie text-[12px]"></i> Profile
                </button>
                <button @click="openBhInfo(house)" class="text-blue-600 border border-blue-100 bg-white hover:bg-blue-50 rounded-xl p-2.5 flex items-center justify-center gap-1.5 transition text-[10px] font-black uppercase tracking-wider shadow-2xs">
                  <i class="fa-solid fa-hotel text-[12px]"></i> BH Info
                </button>
                <button @click="openDocs(house)" class="text-blue-600 border border-blue-100 bg-white hover:bg-blue-50 rounded-xl p-2.5 flex items-center justify-center gap-1.5 transition text-[10px] font-black uppercase tracking-wider shadow-2xs">
                  <i class="fa-solid fa-file-invoice text-[12px]"></i> Docs
                </button>
                <button @click="openRoomsMatrix(house)" class="text-blue-600 border border-blue-100 bg-white hover:bg-blue-50 rounded-xl p-2.5 flex items-center justify-center gap-1.5 transition text-[10px] font-black uppercase tracking-wider shadow-2xs">
                  <i class="fa-solid fa-door-open text-[12px]"></i> Rooms
                </button>
              </div>

              <div class="pt-1">
                <button @click="triggerConfirm('Confirm Restore?', `Are you sure you want to restore ${house.name} back to the active registered list?`, () => handleRestoreHouse(house.id))"
                        class="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl py-2.5 font-black text-[10px] uppercase tracking-widest transition shadow-sm active:scale-95 cursor-pointer">
                  Restore Property
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- DESKTOP TABLE LAYOUT -->
        <div class="hidden md:block bg-white rounded-[2rem] shadow-sm border border-slate-200/60 overflow-hidden shadow-slate-100">
          <div class="overflow-x-auto">
            <table class="w-full text-center border-collapse min-w-[1300px]">
              <thead>
                <tr class="bg-slate-50/50 border-b border-slate-100 text-slate-400 text-[10px] font-black tracking-widest uppercase">
                  <th class="py-6 px-3 w-12 border-r border-slate-100">#</th>
                  <th class="py-6 px-4 border-r border-slate-100">Boarding House</th>
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
                  <td colspan="8" class="py-20 text-slate-400 italic text-sm text-center font-black uppercase tracking-widest">
                    No archived boarding houses found.
                  </td>
                </tr>
                <tr v-for="(house, index) in paginatedHouses" :key="house.id" class="hover:bg-slate-50/20 transition duration-200">
                  <td class="py-6 px-3 border-r border-slate-100 text-slate-400 font-bold">{{ startItemIndex + index }}</td>
                  <td class="py-6 px-4 border-r border-slate-100 font-black text-slate-900 leading-tight uppercase">{{ house.name }}</td>
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
                    <button @click="triggerConfirm('Confirm Restore?', `Are you sure you want to restore ${house.name} back to the active registered list?`, () => handleRestoreHouse(house.id))"
                            class="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl px-4 py-2 font-black text-[10px] uppercase tracking-widest transition shadow-md active:scale-95 cursor-pointer">
                      Restore
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pure Vue Reactive Pagination Bar -->
          <div v-if="filteredHouses.length > 0" class="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-bold text-slate-500">
            <div class="flex items-center gap-4">
              <span>Showing {{ startItemIndex }} to {{ endItemIndex }} of {{ filteredHouses.length }} entries</span>
              <div class="flex items-center gap-2">
                <span class="text-[11px] font-bold text-slate-400">Rows per page:</span>
                <select v-model="itemsPerPage" class="bg-white border border-slate-200 px-2 py-1 rounded-lg text-xs font-bold text-slate-700 outline-none">
                  <option :value="10">10</option>
                  <option :value="25">25</option>
                  <option :value="50">50</option>
                  <option :value="100">100</option>
                </select>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <button 
                @click="currentPage > 1 && currentPage--" 
                :disabled="currentPage === 1"
                class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition font-bold"
              >
                <i class="fa-solid fa-chevron-left text-[10px]"></i> Prev
              </button>
              <span class="px-3 py-1 bg-blue-600 text-white rounded-lg font-black text-xs">
                {{ currentPage }} / {{ totalPages }}
              </span>
              <button 
                @click="currentPage < totalPages && currentPage++" 
                :disabled="currentPage === totalPages"
                class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition font-bold"
              >
                Next <i class="fa-solid fa-chevron-right text-[10px]"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Owner Profile Modal -->
    <div v-if="showProfileModal && activeHouse" class="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden text-left border border-slate-100 animate-in zoom-in-95 duration-200">
        <div class="bg-slate-50 border-b border-slate-100 px-8 py-6 flex justify-between items-center shrink-0">
          <h1 class="text-[10px] font-black tracking-[0.2em] uppercase text-slate-400">Owner Information Profile</h1>
          <button @click="closeProfile" class="text-slate-400 hover:text-red-500 transition text-2xl focus:outline-none cursor-pointer">&times;</button>
        </div>
        
        <div class="flex-1 overflow-y-auto bg-white p-8 sm:p-12 scrollbar-thin">
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

          <div class="max-w-none space-y-8 w-full">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <!-- Map Section -->
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

            <!-- Student Reviews & Ratings -->
            <div class="bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Student Reviews &amp; Ratings</h3>
                <div v-if="activeHouse.avg_rating" class="flex items-center gap-1.5 bg-yellow-400/10 px-3 py-1 rounded-full border border-yellow-400/20 shrink-0">
                  <i class="fa-solid fa-star text-yellow-500 text-[10px]"></i>
                  <span class="text-[10px] font-black text-yellow-700">{{ Number(activeHouse.avg_rating).toFixed(1) }} average ({{ activeHouse.review_count || 0 }} {{ (activeHouse.review_count || 0) === 1 ? 'review' : 'reviews' }})</span>
                </div>
              </div>

              <div v-if="isLoadingReviews" class="py-8 flex justify-center">
                <div class="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <div v-else-if="reviews.length === 0" class="py-8 text-center">
                <p class="text-slate-400 italic text-xs font-black uppercase tracking-widest">No reviews submitted yet — rating shown on the dashboard is not yet backed by any review.</p>
              </div>
              <div v-else class="space-y-3 max-h-80 overflow-y-auto pr-1">
                <div v-for="r in reviews" :key="r.id" class="bg-white rounded-2xl p-4 border border-slate-100 flex gap-3">
                  <div class="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 overflow-hidden border border-slate-100">
                    <img v-if="r.profile_pic" :src="getImageUrl(r.profile_pic)" class="w-full h-full object-cover" />
                    <i v-else class="fa-solid fa-user text-xs"></i>
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center justify-between gap-2 flex-wrap">
                      <span class="font-black text-slate-800 text-xs uppercase tracking-tight">{{ r.student_name }}</span>
                      <div class="flex items-center gap-2 shrink-0">
                        <div class="flex gap-0.5">
                          <i v-for="star in 5" :key="star" class="fa-solid fa-star text-[10px]" :class="star <= r.rating ? 'text-yellow-400' : 'text-slate-200'"></i>
                        </div>
                        <span class="text-[9px] font-bold text-slate-400">{{ formatDate(r.created_at) }}</span>
                      </div>
                    </div>
                    <p class="text-xs text-slate-600 font-medium mt-1.5 leading-relaxed">{{ r.comment || 'No written comment.' }}</p>
                  </div>
                </div>
              </div>
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
    
       
    <!-- Modal Content -->
    <div class="p-6 sm:p-10 overflow-y-auto grow bg-white custom-scrollbar text-left space-y-8">
      
      <!-- Required Documents Section -->
      <div>
        <p class="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-4 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-rose-500 inline-block"></span> REQUIRED DOCUMENTS
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
          <div v-for="doc in requiredDocs" :key="doc.label"
               class="bg-white border border-slate-100 rounded-[2rem] shadow-md overflow-hidden flex flex-col group transition hover:shadow-2xl">
            <div v-if="doc.file" class="h-56 bg-slate-50 relative flex items-center justify-center p-6">
              <img :src="getImageUrl(doc.file)" class="w-full h-full object-contain filter group-hover:scale-110 transition duration-500" />
              <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
                <button @click="openPreview(getImageUrl(doc.file))" type="button" class="bg-white text-slate-900 px-6 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-600 hover:text-white transition cursor-pointer">Preview</button>
              </div>
            </div>
            <div v-else class="bg-slate-50 border-2 border-dashed border-rose-200 rounded-[2rem] p-10 flex flex-col items-center justify-center text-center h-56">
              <i class="fa-solid fa-file-circle-exclamation text-4xl text-rose-300 mb-4"></i>
              <h3 class="font-black text-[11px] text-rose-400 uppercase tracking-widest">NOT SUBMITTED</h3>
            </div>
            <div class="p-4 border-t border-slate-50 text-center flex-1 flex items-center justify-center">
              <h3 class="font-black text-[11px] text-slate-800 uppercase tracking-tight leading-snug">{{ doc.label }}</h3>
            </div>
          </div>
        </div>
      </div>

      <!-- Optional Documents Section -->
      <div>
        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-slate-400 inline-block"></span> OPTIONAL DOCUMENTS
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
          <div v-for="doc in optionalDocs" :key="doc.label"
               class="bg-white border border-slate-100 rounded-[2rem] shadow-md overflow-hidden flex flex-col group transition hover:shadow-2xl">
            <div v-if="doc.file" class="h-56 bg-slate-50 relative flex items-center justify-center p-6">
              <img :src="getImageUrl(doc.file)" class="w-full h-full object-contain filter group-hover:scale-110 transition duration-500" />
              <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
                <button @click="openPreview(getImageUrl(doc.file))" type="button" class="bg-white text-slate-900 px-6 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-600 hover:text-white transition cursor-pointer">Preview</button>
              </div>
            </div>
            <div v-else class="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] p-10 flex flex-col items-center justify-center text-center opacity-60 h-56">
              <i class="fa-solid fa-file-circle-exclamation text-4xl text-slate-300 mb-4"></i>
              <h3 class="font-black text-[11px] text-slate-400 uppercase tracking-widest">NOT SUBMITTED</h3>
            </div>
            <div class="p-4 border-t border-slate-50 text-center flex-1 flex items-center justify-center">
              <h3 class="font-black text-[11px] text-slate-800 uppercase tracking-tight leading-snug">{{ doc.label }}</h3>
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

        <div class="flex-1 overflow-y-auto bg-slate-50/50 p-6 md:p-8">
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
              No active boarders inside this room.
            </div>

            <div v-for="(occ, i) in activeRoomOccupants" :key="occ.id" class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <div class="bg-slate-50 px-6 py-3.5 border-b border-slate-100 flex justify-between items-center">
                <span class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Resident #{{ i + 1 }}</span>
                <span class="inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase" :class="occ.payment_status === 'Paid' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'">
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
                  <span class="text-blue-600 font-black">{{ occ.months }} Month{{ occ.months > 1 ? 's' : '' }} — ₱{{ occ.amount ? Number(occ.amount).toLocaleString() : '0' }}</span>
                </div>
                <div class="py-3.5 flex justify-between items-center">
                  <span class="text-[9px] font-black uppercase tracking-widest text-slate-400">Check-out Date</span>
                  <span class="text-blue-600 font-black">{{ getAdminCheckoutDate(occ) }}</span>
                </div>
                <div v-if="occ.emergency_contact" class="py-3.5 flex justify-between items-center">
                  <span class="text-[9px] font-black uppercase tracking-widest text-slate-400">Emergency Contact</span>
                  <span class="text-slate-700">{{ occ.emergency_contact }}</span>
                </div>
              </div>

              <div class="bg-slate-50/50 px-6 py-3.5 border-t border-slate-100 flex justify-end">
                <button disabled
                        class="bg-slate-100 text-slate-400 border border-slate-200 text-[9px] font-black px-4 py-2 rounded-xl uppercase cursor-not-allowed opacity-50">
                  Checkout Resident
                </button>
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
      <div class="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full text-center border border-slate-100 animate-in zoom-in-95 duration-200">
        <div class="text-[#2a528a] mb-4 flex justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 class="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">{{ confirmTitle }}</h3>
        <p class="text-slate-500 text-xs font-medium mb-6 leading-relaxed">{{ confirmMessage }}</p>
        
        <div class="flex gap-3">
          <button @click="executeConfirm" class="flex-1 bg-blue-600 hover:bg-black text-white text-[10px] font-black py-3.5 rounded-xl uppercase tracking-widest transition active:scale-95">
            Confirm
          </button>
          <button @click="showConfirmModal = false" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black py-3.5 rounded-xl uppercase tracking-widest transition active:scale-95">
            Cancel
          </button>
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
        <button 
          @click="downloadOriginal" 
          :disabled="isDownloading" 
          class="bg-blue-600 hover:bg-black text-white px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition flex items-center gap-2"
        >
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