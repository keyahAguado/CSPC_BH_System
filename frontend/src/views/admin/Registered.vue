<script setup>
import TablePager from '../../components/management/TablePager.vue';
import LoadError from '../../components/management/LoadError.vue';

import PageHeader from '../../components/management/PageHeader.vue';
import '../../styles/management.css';
import { vManagementDialog } from '../../components/management/dialogAccessibility.js';
import { ref, onMounted, computed, watch, nextTick } from 'vue';
import axios from 'axios';
import AdminNav from '../../components/partials/AdminNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { downloadOriginalFile } from '../../utils/downloadHelper';
import { getImageUrl } from '../../config/api';
import { formatAddress } from '../../utils/formatAddress.js';
import { computeCheckoutDate, formatCheckoutDateString } from '../../utils/dateHelper.js';
import { matchesSearch } from '../../utils/search.js';

const getAdminCheckoutDate = (occ) => {
  if (!occ.check_in_date) return '—';
  const d = computeCheckoutDate(occ.check_in_date, occ.months || 1);
  return formatCheckoutDateString(d);
};

const houses = ref([]);
const dynamicDocs = ref([]);
const housePhotos = ref([]);

const isLoading = ref(true);
const alertRef = ref(null);
const token = sessionStorage.getItem('cspc_token');

// Barangay filter & search state
import NABUA_BARANGAYS from '../../constants/barangays.js';

const barangays = NABUA_BARANGAYS;
const selectedBarangay = ref('');
const searchQuery = ref('');

// Pure Vue Reactive Pagination
const currentPage = ref(1);
const itemsPerPage = ref(10);

watch([searchQuery, selectedBarangay], () => {
  currentPage.value = 1;
});

// Client-side filtered list: applies both barangay filter and flexible multi-word local search
const filteredHouses = computed(() => {
  let result = houses.value;

  // 1. Strict Barangay Filter (Exact match only)
  if (selectedBarangay.value && selectedBarangay.value !== '') {
    const bVal = selectedBarangay.value.toLowerCase().trim();
    result = result.filter(h => {
      const houseBrgy = (h.barangay || '').toLowerCase().trim();
      return houseBrgy === bVal;
    });
  }

  // 2. Search Query Filter — flexible multi-word match across all fields
  if (searchQuery.value.trim()) {
    result = result.filter(h =>
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
        h.street_address,
        h.address,
        h.description,
        h.amenities_free,
        h.amenities_paid,
        h.price ? String(h.price) : '',
        h.capacity ? String(h.capacity) : ''
      ])
    );
  }

  return result;
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

// Diagnostic States
const diagnosticError = ref('');
const apiResponsePayload = ref(null);

const isDownloading = ref(false);
const showPreviewModal = ref(false);
const previewImageUrl = ref('');

// Legal documents can be PDF: open those in a new tab instead of the image preview.
const isPdfFile = (url) => /\.pdf($|[?#])/i.test(String(url || ''));

// Full-screen document viewer: images fit the screen (click to zoom to actual size); PDFs show inline
const previewZoomed = ref(false);
const openPreview = (url) => {
  if (!url || url.endsWith('#')) return;
  previewImageUrl.value = url;
  previewZoomed.value = false;
  showPreviewModal.value = true;
};

const closePreview = () => {
  showPreviewModal.value = false;
  previewImageUrl.value = '';
  previewZoomed.value = false;
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
const showConfirmModal = ref(false);

// Active objects (Guarded safely with v-if checks to prevent early render crashes)
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

const fetchRegisteredHouses = async () => {
  loadError.value = '';
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
      housePhotos.value = response.data.housePhotos || [];
    }
  } catch (error) {
    loadError.value = 'The server did not return these records. Refresh the page to try again.';
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


// Manual archive: distinct from the system's own auto-archive-on-expired-permits.
// A reason is captured so the owner sees WHY (e.g. "requested — at full capacity")
// instead of the generic expired-permits messaging.
const showArchiveModal = ref(false);
const archiveTargetHouse = ref(null);
const archiveReasonInput = ref('');

const openArchiveModal = (house) => {
  archiveTargetHouse.value = house;
  archiveReasonInput.value = '';
  showArchiveModal.value = true;
};

const closeArchiveModal = () => {
  showArchiveModal.value = false;
  archiveTargetHouse.value = null;
  archiveReasonInput.value = '';
};

const execArchive = async () => {
  if (!archiveTargetHouse.value) return;
  const houseId = archiveTargetHouse.value.id;
  showArchiveModal.value = false;
  try {
    const response = await axios.post(`/api/admin/archive/${houseId}`, { reason: archiveReasonInput.value }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.data.success) {
      showSystemAlert('Boarding house archived successfully.', 'success');
      if (showDetail.value) closeDetail();
      fetchRegisteredHouses();
    }
  } catch (error) {
    console.error('Archive failed:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to archive property.', 'error');
  } finally {
    archiveTargetHouse.value = null;
    archiveReasonInput.value = '';
  }
};

// ─── Property details panel: owner, property, documents and rooms in one place (tabs) ───
const REQUIRED_PERMITS = [
  { label: 'Business Permit Application Form', key: 'permit_business_form' },
  { label: 'Barangay Business Clearance', key: 'permit_barangay' },
  { label: 'Sanitary Permit / Health Clearance', key: 'permit_sanitary' },
  { label: 'Valid Fire Safety Inspection Certificate', key: 'permit_fire' }
];
const OPTIONAL_PERMITS = [
  { label: 'Community Tax Certificate (Cedula)', key: 'permit_cedula' },
  { label: 'DTI Registration Certificate', key: 'permit_dti' },
  { label: 'Certificate of Building Inspection', key: 'permit_building' },
  { label: 'Zoning Certificate / Locational Clearance', key: 'permit_zoning' }
];

// Days until a date (negative once passed), counted in calendar days
const daysUntil = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
};
const expiryTone = (value) => {
  const days = daysUntil(value);
  if (days === null) return 'none';
  if (days < 0) return 'danger';
  if (days <= 30) return 'warning';
  return 'success';
};

// Row summary: how many required permits are on file and the earliest required expiry
const requiredOnFile = (h) => REQUIRED_PERMITS.filter(p => h[p.key]).length;
const nextRequiredExpiry = (h) => {
  const dates = REQUIRED_PERMITS.map(p => h['expiry_' + p.key]).filter(v => daysUntil(v) !== null);
  if (!dates.length) return null;
  return dates.sort((a, b) => new Date(a) - new Date(b))[0];
};
const permitSummary = (h) => {
  const onFile = requiredOnFile(h);
  if (onFile < REQUIRED_PERMITS.length) return { label: `${onFile}/${REQUIRED_PERMITS.length} required on file`, tone: 'danger', icon: 'fa-circle-exclamation' };
  const tone = expiryTone(nextRequiredExpiry(h));
  if (tone === 'danger') return { label: 'Permit expired', tone, icon: 'fa-circle-exclamation' };
  if (tone === 'warning') return { label: 'Expiring soon', tone, icon: 'fa-clock' };
  return { label: 'Permits complete', tone: 'success', icon: 'fa-circle-check' };
};
const expiryNote = (value) => {
  const days = daysUntil(value);
  if (days === null) return '';
  if (days < 0) return `Expired ${formatDate(value)}`;
  if (days === 0) return 'Expires today';
  return `Expires ${formatDate(value)}`;
};

const showDetail = ref(false);
const detailTab = ref('overview');
const roomsChanged = ref(false);
const isLoadingRooms = ref(false);
const DETAIL_TABS = [
  { key: 'overview', label: 'Overview', icon: 'fa-house' },
  { key: 'documents', label: 'Documents', icon: 'fa-file-lines' },
  { key: 'rooms', label: 'Rooms & occupants', icon: 'fa-door-open' }
];

const buildDocs = (house) => {
  const toDoc = (p) => ({ label: p.label, file: house[p.key] || null, expiry: house['expiry_' + p.key] || null });
  requiredDocs.value = REQUIRED_PERMITS.map(toDoc);
  const facadeDoc = house.img ? [{ label: 'Facade photo', file: house.img, expiry: null }] : [];
  const dynamicUploaded = dynamicDocs.value
    .filter(d => d.house_id === house.id)
    .map(d => ({ label: d.criteria_label || 'Additional document', file: d.file_path, expiry: null }));
  optionalDocs.value = [...OPTIONAL_PERMITS.map(toDoc), ...facadeDoc, ...dynamicUploaded];
};

const buildPhotos = (house) => {
  // Prefer house_photos table entries (supports > 4 photos), fall back to legacy img columns
  const photosFromTable = housePhotos.value.filter(p => p.house_id === house.id).map(p => p.photo_url);
  const legacyPhotos = [house.img, house.img_1, house.img_2, house.img_3].filter(i => i && i !== 'null');
  bhPhotos.value = photosFromTable.length > 0 ? photosFromTable : legacyPhotos;
  currentPhotoIndex.value = 0;
};

const loadReviews = async (house) => {
  try {
    isLoadingReviews.value = true;
    const response = await axios.get(`/api/admin/reviews/${house.id}`, { headers: { Authorization: `Bearer ${token}` } });
    reviews.value = response.data.reviews || [];
  } catch (e) {
    console.error('Failed to fetch reviews:', e);
    reviews.value = [];
  } finally {
    isLoadingReviews.value = false;
  }
};

const loadRooms = async (house) => {
  try {
    isLoadingRooms.value = true;
    const response = await axios.get(`/api/admin/rooms/${house.id}`, { headers: { Authorization: `Bearer ${token}` } });
    activeRooms.value = response.data.rooms || [];
  } catch (error) {
    console.error('Failed to load rooms:', error);
    showSystemAlert('Could not fetch room matrix.', 'error');
  } finally {
    isLoadingRooms.value = false;
  }
};

const drawMap = async () => {
  await nextTick();
  const house = activeHouse.value;
  const mapContainer = mapElement.value;
  if (!house || !mapContainer || !googleInstance) return;
  try {
    const bhLocation = { lat: parseFloat(house.latitude) || 13.4079, lng: parseFloat(house.longitude) || 123.3745 };
    const { Map } = await googleInstance.maps.importLibrary('maps');
    const { AdvancedMarkerElement } = await googleInstance.maps.importLibrary('marker');
    const map = new Map(mapContainer, {
      center: bhLocation,
      zoom: 16,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      mapId: 'DEMO_MAP_ID'
    });
    new AdvancedMarkerElement({ position: bhLocation, map, title: house.name });
  } catch (err) {
    console.warn('Map loader error:', err);
  }
};

const openDetail = (house, tab = 'overview') => {
  activeHouse.value = house;
  buildPhotos(house);
  buildDocs(house);
  activeRooms.value = [];
  activeRoomOccupants.value = [];
  isOccupantsView.value = false;
  roomsChanged.value = false;
  detailTab.value = tab;
  showDetail.value = true;
  loadReviews(house);
  loadRooms(house);
  if (tab === 'overview') drawMap();
};

watch(detailTab, (tab) => {
  if (tab === 'overview' && showDetail.value) drawMap();
});

const closeDetail = () => {
  showDetail.value = false;
  activeHouse.value = null;
  reviews.value = [];
  activeRooms.value = [];
  activeRoomOccupants.value = [];
  isOccupantsView.value = false;
  requiredDocs.value = [];
  optionalDocs.value = [];
  // A boarder checkout changes room counts, so refresh the list
  if (roomsChanged.value) fetchRegisteredHouses();
  roomsChanged.value = false;
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
      roomsChanged.value = true;
      viewBoarderDetails(activeRoomData.value);
    }
  } catch (error) {
    console.error('Checkout failed:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to checkout boarder.', 'error');
  }
};

const totalOccupants = computed(() => activeRooms.value.reduce((n, r) => n + Number(r.occupant_count || 0), 0));
const totalCapacity = computed(() => activeRooms.value.reduce((n, r) => n + Number(r.capacity || 0), 0));
const totalCspc = computed(() => activeRooms.value.reduce((n, r) => n + Number(r.cspc_count || 0), 0));
const totalNonCspc = computed(() => activeRooms.value.reduce((n, r) => n + Number(r.non_cspc_count || 0), 0));

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

const loadError = ref('');
</script>

<template>
  <div class="management-page registered-fit bg-[#f8fafc] min-h-screen flex flex-col font-sans text-slate-800 text-left">
    <AdminNav />
    <div aria-live="polite" aria-atomic="false"><FlashAlert ref="alertRef" /></div>

    <main id="management-content" tabindex="-1" class="max-w-[1450px] mx-auto py-12 px-6 flex-1 w-full text-left">
      <LoadError :message="loadError" />
      <!-- Header -->
      <PageHeader title="Registered properties" description="Manage accredited boarding houses, documents, rooms, and occupants." />

      <!-- Loading State -->
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 px-6 gap-6">
        <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>

      <!-- Filter Bar -->
      <div v-if="!isLoading" class="mb-5 flex flex-col sm:flex-row items-center gap-3 animate-fade-in">
        <!-- Search Input -->
        <div class="relative flex-1 min-w-0 w-full sm:w-auto">
          <i class="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
          <input aria-label="Search by boarding house name, date, location..."
            v-model="searchQuery"
            type="text"
            placeholder="Search by boarding house name, date, location..."
            class="w-full h-[46px] pl-10 pr-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 placeholder:font-normal placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition shadow-sm"
          />
        </div>

        <!-- Barangay Filter Dropdown -->
        <div class="flex items-center gap-2 bg-white border border-slate-200 px-4 h-[46px] rounded-2xl shadow-sm min-w-[220px] w-full sm:w-auto">
          <i class="fa-solid fa-filter text-slate-400 text-xs flex-shrink-0"></i>
          <select aria-label="selected Barangay"
            v-model="selectedBarangay"
            class="flex-1 h-full bg-transparent border-none text-sm font-bold text-slate-700 outline-none cursor-pointer barangay-select"
          >
            <option value="">All Barangays</option>
            <option v-for="b in barangays" :key="b" :value="b">{{ b }}</option>
          </select>
        </div>

        <!-- Clear Filter Button -->
        <button
          v-if="selectedBarangay || searchQuery"
          @click="selectedBarangay = ''; searchQuery = '';"
          class="flex items-center gap-2 px-4 py-3 bg-slate-100 hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-500 hover:text-red-600 rounded-2xl text-xs font-semibold uppercase tracking-wide transition whitespace-nowrap w-full sm:w-auto justify-center management-button"
        >
          <i class="fa-solid fa-xmark"></i> Clear
        </button>

        <!-- Results count badge -->
        <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
          {{ filteredHouses.length }} result{{ filteredHouses.length !== 1 ? 's' : '' }}
          <span v-if="selectedBarangay" class="ml-1 px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full text-[12px] uppercase tracking-wide">{{ selectedBarangay }}</span>
        </div>
      </div>

      <!-- Table Container & Card Layout -->
      <div v-if="!isLoading" class="registered-body animate-fade-in">
        
        <div class="md:hidden mb-3 rounded-2xl border border-slate-200 overflow-hidden">
          <TablePager position="top" noun="entries" :page="currentPage" @update:page="currentPage = $event" :total-pages="totalPages" :start="startItemIndex" :end="endItemIndex" :total="filteredHouses.length" :per-page="itemsPerPage" @update:per-page="itemsPerPage = $event; currentPage = 1" />
        </div>

        <!-- PHONE VIEW: one card per property -->
        <div class="block md:hidden space-y-3">
          <div v-if="filteredHouses.length === 0" class="bg-white rounded-2xl p-8 text-center border border-slate-200/60 text-slate-400 italic text-sm font-semibold">
            <span v-if="selectedBarangay || searchQuery">No boarding houses match the selected filter.</span>
            <span v-else>No registered boarding houses found.</span>
          </div>
          <div v-for="(house, index) in paginatedHouses" :key="'mob-' + house.id" class="rp-card">
            <div class="flex justify-between items-start gap-3">
              <div class="min-w-0">
                <span class="text-[12px] font-semibold text-slate-400">#{{ startItemIndex + index }}</span>
                <h3 class="font-semibold text-slate-900 text-base leading-tight">{{ house.name }}</h3>
                <p class="text-xs text-slate-500 mt-1">{{ formatAddress(house) || '—' }}</p>
              </div>
              <span :class="['rp-chip', 'is-' + permitSummary(house).tone]"><i :class="['fa-solid', permitSummary(house).icon]" aria-hidden="true"></i>{{ permitSummary(house).label }}</span>
            </div>
            <p class="text-xs text-slate-600 mt-3"><i class="fa-solid fa-user-tie text-slate-400 mr-1.5" aria-hidden="true"></i>{{ house.owner_name }} <span v-if="house.owner_phone || house.phone_contact" class="text-slate-400">· {{ house.owner_phone || house.phone_contact }}</span></p>
            <button type="button" class="rp-view-btn w-full mt-3" @click="openDetail(house)"><i class="fa-solid fa-eye" aria-hidden="true"></i> View details</button>
          </div>
        </div>

        <!-- LAPTOP / DESKTOP VIEW: Table Layout -->
        <div class="registered-table-card hidden md:flex md:flex-col bg-white rounded-[2rem] shadow-sm border border-slate-200/60 overflow-hidden shadow-slate-100">
          <TablePager position="top" noun="entries" :page="currentPage" @update:page="currentPage = $event" :total-pages="totalPages" :start="startItemIndex" :end="endItemIndex" :total="filteredHouses.length" :per-page="itemsPerPage" @update:per-page="itemsPerPage = $event; currentPage = 1" />

          <div class="registered-table-scroll overflow-x-auto">
            <table class="management-registry-table w-full border-collapse">
              <thead class="bg-slate-50">
                <tr><th scope="col">#</th><th scope="col">Boarding house</th><th scope="col">Owner</th><th scope="col">Permits</th><th scope="col">Registered</th><th scope="col"><span class="sr-only">Actions</span></th></tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-if="filteredHouses.length === 0">
                  <td colspan="6" class="py-20 text-slate-400 italic text-sm text-center font-semibold">
                    <span v-if="selectedBarangay || searchQuery">No boarding houses match the selected filter.</span>
                    <span v-else>No registered boarding houses found.</span>
                  </td>
                </tr>
                <tr v-for="(house, index) in paginatedHouses" :key="house.id" class="rp-row">
                  <td class="text-slate-500">{{ startItemIndex + index }}</td>
                  <td>
                    <strong class="block text-slate-900 font-semibold">{{ house.name }}</strong>
                    <span class="block text-slate-500 text-xs mt-1">{{ formatAddress(house) || '—' }}</span>
                  </td>
                  <td>
                    <span class="block text-slate-800 font-medium">{{ house.owner_name }}</span>
                    <span class="block text-slate-500 text-xs mt-1">{{ house.owner_phone || house.phone_contact || '—' }}</span>
                  </td>
                  <td>
                    <span :class="['rp-chip', 'is-' + permitSummary(house).tone]"><i :class="['fa-solid', permitSummary(house).icon]" aria-hidden="true"></i>{{ permitSummary(house).label }}</span>
                    <span v-if="nextRequiredExpiry(house)" class="block text-slate-500 text-xs mt-1">Next: {{ expiryNote(nextRequiredExpiry(house)) }}</span>
                  </td>
                  <td class="text-slate-500 text-xs">{{ formatDate(house.created_at) }}</td>
                  <td class="text-right">
                    <button type="button" class="rp-view-btn" @click="openDetail(house)" :aria-label="'View details of ' + house.name"><i class="fa-solid fa-eye" aria-hidden="true"></i> View details</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <TablePager position="bottom" noun="entries" :page="currentPage" @update:page="currentPage = $event" :total-pages="totalPages" :start="startItemIndex" :end="endItemIndex" :total="filteredHouses.length" :per-page="itemsPerPage" @update:per-page="itemsPerPage = $event; currentPage = 1" />

        </div>

      </div>
    </main>

    <!-- Property details page (opens in the admin content area; replaces the separate Owner / Property / Documents / Rooms pop-ups) -->
    <div v-management-dialog="{ close: () => closeDetail() }" v-if="showDetail && activeHouse" class="rp-page" :aria-label="activeHouse.name + ' details'">
      <div class="rp-page-inner">
        <!-- Back link + main action -->
        <div class="rp-topline">
          <button type="button" class="rp-back is-main" @click="closeDetail"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Back</button>
          <button type="button" class="rp-archive-btn" @click="openArchiveModal(activeHouse)"><i class="fa-solid fa-box-archive" aria-hidden="true"></i> Archive property</button>
        </div>

        <!-- Summary card -->
        <section class="rp-card rp-hero">
          <div class="rp-hero-main">
            <img v-if="bhPhotos.length" :src="getImageUrl(bhPhotos[0])" class="rp-hero-photo" alt="" @click="currentPhotoIndex = 0; showLightbox = true" />
            <span v-else class="rp-hero-photo is-empty" aria-hidden="true"><i class="fa-solid fa-house"></i></span>
            <div class="min-w-0">
              <h1 class="rp-hero-title">{{ activeHouse.name }}</h1>
              <p class="rp-hero-sub"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> {{ formatAddress(activeHouse) || '—' }}</p>
              <p class="rp-hero-sub"><i class="fa-solid fa-user-tie" aria-hidden="true"></i> {{ activeHouse.owner_name }}<span v-if="activeHouse.owner_phone || activeHouse.phone_contact"> · {{ activeHouse.owner_phone || activeHouse.phone_contact }}</span></p>
              <div class="rp-chips">
                <span :class="['rp-chip', 'is-' + permitSummary(activeHouse).tone]"><i :class="['fa-solid', permitSummary(activeHouse).icon]" aria-hidden="true"></i>{{ permitSummary(activeHouse).label }}</span>
                <span class="rp-chip"><i class="fa-regular fa-calendar" aria-hidden="true"></i>Registered {{ formatDate(activeHouse.created_at) }}</span>
                <span v-if="activeHouse.avg_rating" class="rp-chip is-star"><i class="fa-solid fa-star" aria-hidden="true"></i>{{ Number(activeHouse.avg_rating).toFixed(1) }} ({{ activeHouse.review_count || 0 }})</span>
              </div>
            </div>
          </div>
          <dl class="rp-stats">
            <div><dt><i class="fa-solid fa-door-open" aria-hidden="true"></i> Rooms</dt><dd>{{ isLoadingRooms ? '…' : activeRooms.length }}</dd></div>
            <div class="is-primary"><dt><i class="fa-solid fa-user-graduate" aria-hidden="true"></i> CSPC students</dt><dd>{{ isLoadingRooms ? '…' : totalCspc }}</dd><span v-if="!isLoadingRooms && totalNonCspc > 0" class="rp-stat-sub">+ {{ totalNonCspc }} non-CSPC</span></div>
            <div><dt><i class="fa-solid fa-file-shield" aria-hidden="true"></i> Required permits</dt><dd>{{ requiredOnFile(activeHouse) }} / {{ REQUIRED_PERMITS.length }}</dd></div>
            <div :class="'is-' + expiryTone(nextRequiredExpiry(activeHouse))"><dt><i class="fa-regular fa-calendar-xmark" aria-hidden="true"></i> Next permit expiry</dt><dd>{{ nextRequiredExpiry(activeHouse) ? formatDate(nextRequiredExpiry(activeHouse)) : '—' }}</dd></div>
          </dl>
        </section>

        <!-- Tabs -->
        <nav class="rp-tabs" role="tablist" aria-label="Property details">
          <button v-for="t in DETAIL_TABS" :key="t.key" type="button" role="tab" :aria-selected="detailTab === t.key" :class="['rp-tab', { 'is-active': detailTab === t.key }]" @click="detailTab = t.key">
            <i :class="['fa-solid', t.icon]" aria-hidden="true"></i>{{ t.label }}
            <span v-if="t.key === 'documents'" class="rp-tab-count">{{ requiredOnFile(activeHouse) }}/{{ REQUIRED_PERMITS.length }}</span>
            <span v-else-if="t.key === 'rooms' && !isLoadingRooms" class="rp-tab-count">{{ activeRooms.length }}</span>
          </button>
        </nav>

        <!-- OVERVIEW -->
        <div v-if="detailTab === 'overview'" class="rp-grid">
          <div class="rp-col">
            <section class="rp-card">
              <h2 class="rp-card-title">Owner</h2>
              <div class="flex items-center gap-4 mb-4">
                <span class="rp-avatar">
                  <img v-if="activeHouse.profile_pic" :src="getImageUrl(activeHouse.profile_pic)" alt="" />
                  <span v-else>{{ (activeHouse.owner_name || '?').charAt(0).toUpperCase() }}</span>
                </span>
                <div>
                  <p class="rp-strong">{{ activeHouse.owner_name }}</p>
                  <p class="rp-muted">Boarding house owner</p>
                </div>
              </div>
              <dl class="rp-facts">
                <div><dt>Phone number</dt><dd>{{ activeHouse.owner_phone || activeHouse.phone_contact || 'N/A' }}</dd></div>
                <div><dt>Email address</dt><dd class="break-all">{{ activeHouse.owner_email || 'N/A' }}</dd></div>
                <div class="rp-span-2"><dt>Residential address</dt><dd>{{ activeHouse.owner_address || 'N/A' }}</dd></div>
              </dl>
            </section>

            <section class="rp-card">
              <h2 class="rp-card-title">Property</h2>
              <dl class="rp-facts">
                <div><dt>Monthly rate</dt><dd>{{ Number(activeHouse.price) > 0 ? '₱' + Number(activeHouse.price).toLocaleString('en-PH') : '—' }}</dd></div>
                <div><dt>Property contact</dt><dd>{{ activeHouse.phone_contact || '—' }}</dd></div>
                <div><dt>Advance payment</dt><dd>{{ activeHouse.advance_months ? activeHouse.advance_months + ' month(s)' : '—' }}</dd></div>
                <div><dt>Deposit</dt><dd>{{ activeHouse.deposit_months ? activeHouse.deposit_months + ' month(s)' : '—' }}<span v-if="activeHouse.deposit_type" class="capitalize"> · {{ activeHouse.deposit_type }}</span></dd></div>
              </dl>
              <h3 class="rp-sub-title">Description</h3>
              <p class="rp-text">{{ activeHouse.description || 'No description provided.' }}</p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div>
                  <h3 class="rp-sub-title">Free amenities</h3>
                  <div class="flex flex-wrap gap-1.5">
                    <span v-for="a in parseAmenities(activeHouse.amenities_free)" :key="a" class="rp-tag is-free">{{ a }}</span>
                    <span v-if="!parseAmenities(activeHouse.amenities_free).length" class="rp-muted italic">Basic facilities</span>
                  </div>
                </div>
                <div>
                  <h3 class="rp-sub-title">Paid add-ons</h3>
                  <div class="flex flex-wrap gap-1.5">
                    <span v-for="a in parseAmenities(activeHouse.amenities_paid)" :key="a" class="rp-tag is-paid">{{ a }}</span>
                    <span v-if="!parseAmenities(activeHouse.amenities_paid).length" class="rp-muted italic">No paid add-ons listed.</span>
                  </div>
                </div>
              </div>
            </section>

            <section class="rp-card">
              <div class="rp-card-head">
                <h2 class="rp-card-title !mb-0">Student reviews</h2>
                <span v-if="activeHouse.avg_rating" class="rp-chip is-star"><i class="fa-solid fa-star" aria-hidden="true"></i>{{ Number(activeHouse.avg_rating).toFixed(1) }} average · {{ activeHouse.review_count || 0 }} {{ (activeHouse.review_count || 0) === 1 ? 'review' : 'reviews' }}</span>
              </div>
              <div v-if="isLoadingReviews" class="py-6 flex justify-center"><div class="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
              <p v-else-if="reviews.length === 0" class="rp-muted italic">No reviews submitted yet.</p>
              <div v-else class="space-y-2">
                <div v-for="r in reviews" :key="r.id" class="rp-review">
                  <div class="flex items-center justify-between gap-2 flex-wrap">
                    <span class="rp-strong">{{ r.student_name }}</span>
                    <span class="rp-muted"><i v-for="star in 5" :key="star" class="fa-solid fa-star text-[11px]" :class="star <= r.rating ? 'text-amber-400' : 'text-slate-200'"></i> · {{ formatDate(r.created_at) }}</span>
                  </div>
                  <p class="rp-text mt-1">{{ r.comment || 'No written comment.' }}</p>
                </div>
              </div>
            </section>
          </div>

          <div class="rp-col">
            <section class="rp-card">
              <h2 class="rp-card-title">Location</h2>
              <div ref="mapElement" class="rp-map"></div>
            </section>
            <section class="rp-card">
              <div class="rp-card-head">
                <h2 class="rp-card-title !mb-0">Photos</h2>
                <span v-if="bhPhotos.length" class="rp-muted">{{ currentPhotoIndex + 1 }} of {{ bhPhotos.length }} · {{ getPhotoLabel(currentPhotoIndex) }}</span>
              </div>
              <div v-if="bhPhotos.length" class="rp-photo" @click="showLightbox = true">
                <img :src="getImageUrl(bhPhotos[currentPhotoIndex])" alt="Property photo" />
                <span class="rp-photo-hint"><i class="fa-solid fa-expand" aria-hidden="true"></i> Expand</span>
                <button v-if="bhPhotos.length > 1" type="button" class="rp-photo-nav is-prev" aria-label="Previous photo" @click.stop="prevPhoto">&lsaquo;</button>
                <button v-if="bhPhotos.length > 1" type="button" class="rp-photo-nav is-next" aria-label="Next photo" @click.stop="nextPhoto">&rsaquo;</button>
              </div>
              <div v-else class="rp-empty">No property photos uploaded</div>
              <div v-if="bhPhotos.length > 1" class="flex gap-2 mt-3 overflow-x-auto pb-1">
                <button v-for="(img, idx) in bhPhotos" :key="idx" type="button" :aria-label="'Show photo ' + (idx + 1)" @click="currentPhotoIndex = idx"
                        :class="['rp-thumb-btn', { 'is-active': currentPhotoIndex === idx }]"><img :src="getImageUrl(img)" alt="" /></button>
              </div>
            </section>
          </div>
        </div>

        <!-- DOCUMENTS -->
        <div v-else-if="detailTab === 'documents'" class="rp-col">
          <section v-for="group in [{ title: 'Required documents', items: requiredDocs, required: true }, { title: 'Optional documents', items: optionalDocs, required: false }]" :key="group.title" class="rp-card">
            <div class="rp-card-head">
              <h2 class="rp-card-title !mb-0">{{ group.title }}</h2>
              <span :class="['rp-chip', group.required ? (requiredOnFile(activeHouse) === REQUIRED_PERMITS.length ? 'is-success' : 'is-danger') : '']">{{ group.items.filter(d => d.file).length }} of {{ group.items.length }} submitted</span>
            </div>
            <ul class="rp-doc-grid">
              <li v-for="doc in group.items" :key="doc.label" :class="['rp-doc', { 'is-missing': !doc.file }]">
                <button v-if="doc.file" type="button" class="rp-doc-preview" :aria-label="'View ' + doc.label" @click="openPreview(getImageUrl(doc.file))">
                  <img v-if="!isPdfFile(doc.file)" :src="getImageUrl(doc.file)" alt="" />
                  <span v-else class="rp-doc-pdf"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> PDF</span>
                </button>
                <span v-else class="rp-doc-preview is-empty" aria-hidden="true"><i class="fa-regular fa-file"></i></span>
                <div class="min-w-0 flex-1">
                  <p class="rp-doc-name">{{ doc.label }}</p>
                  <p class="rp-doc-meta">
                    <span v-if="!doc.file" :class="group.required ? 'text-rose-600 font-semibold' : 'text-slate-400'">Not submitted</span>
                    <template v-else>
                      <span class="text-emerald-700 font-semibold"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Submitted</span>
                      <span v-if="doc.expiry" :class="['rp-exp', 'is-' + expiryTone(doc.expiry)]"> · {{ expiryNote(doc.expiry) }}</span>
                    </template>
                  </p>
                  <button v-if="doc.file" type="button" class="rp-link-btn" @click="openPreview(getImageUrl(doc.file))"><i class="fa-solid fa-expand" aria-hidden="true"></i> View full screen</button>
                </div>
              </li>
            </ul>
          </section>
        </div>

        <!-- ROOMS & OCCUPANTS -->
        <div v-else class="rp-col">
          <template v-if="!isOccupantsView">
            <section class="rp-card">
              <div class="rp-card-head">
                <h2 class="rp-card-title !mb-0">Rooms</h2>
                <span class="rp-muted">{{ totalOccupants }} of {{ totalCapacity }} beds occupied · {{ Math.max(totalCapacity - totalOccupants, 0) }} vacant</span>
              </div>
              <div v-if="isLoadingRooms" class="py-8 flex justify-center"><div class="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
              <div v-else-if="activeRooms.length === 0" class="rp-empty">No rooms listed for this boarding house.</div>
              <div v-else class="rp-room-grid">
                <div v-for="room in activeRooms" :key="room.id" class="rp-room">
                  <div class="flex items-center justify-between gap-2">
                    <span class="rp-strong">Room {{ room.room_number }}</span>
                    <span :class="['rp-chip', room.occupant_count >= room.capacity ? 'is-danger' : 'is-success']">{{ room.occupant_count >= room.capacity ? 'Full' : 'Available' }}</span>
                  </div>
                  <span class="rp-tag mt-2" :class="room.gender_type === 'female' ? 'is-female' : 'is-male'">{{ room.gender_type }}</span>
                  <div class="rp-bar" aria-hidden="true"><span :style="{ width: Math.min(100, (room.occupant_count / Math.max(room.capacity, 1)) * 100) + '%' }"></span></div>
                  <p class="rp-muted mt-1">{{ room.occupant_count }} / {{ room.capacity }} occupied ({{ room.capacity - room.occupant_count }} vacant)</p>
                  <p class="rp-muted"><span class="text-blue-700 font-semibold">{{ room.cspc_count }} CSPC</span><span v-if="room.non_cspc_count > 0"> + {{ room.non_cspc_count }} non-CSPC</span></p>
                  <button type="button" class="rp-link-btn mt-2" @click="viewBoarderDetails(room)">View occupants <i class="fa-solid fa-chevron-right text-[10px]" aria-hidden="true"></i></button>
                </div>
              </div>
            </section>
          </template>

          <template v-else>
            <section class="rp-card">
              <div class="rp-card-head">
                <button type="button" class="rp-back" @click="isOccupantsView = false"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Back to rooms</button>
                <h2 class="rp-card-title !mb-0">Room {{ activeRoomData ? activeRoomData.room_number : '' }} occupants</h2>
              </div>
              <div v-if="activeRoomOccupants.length === 0" class="rp-empty">No active CSPC student boarders in this room.</div>
              <div v-else class="rp-room-grid">
                <div v-for="(occ, i) in activeRoomOccupants" :key="occ.id" class="rp-room">
                  <div class="flex items-center justify-between gap-2 mb-3">
                    <div>
                      <p class="rp-strong">{{ occ.name }}</p>
                      <p class="rp-muted">CSPC resident #{{ i + 1 }}</p>
                    </div>
                    <span :class="['rp-chip', occ.payment_status === 'Paid' ? 'is-success' : 'is-danger']">{{ occ.payment_status }}</span>
                  </div>
                  <dl class="rp-facts">
                    <div><dt>Age / contact</dt><dd>{{ occ.age ? `${occ.age} yrs old` : '—' }} · {{ occ.contact_number || 'No contact' }}</dd></div>
                    <div><dt>Duration &amp; ledger</dt><dd>{{ occ.months }} month{{ occ.months > 1 ? 's' : '' }} — ₱{{ occ.amount ? Number(occ.amount).toLocaleString() : '0' }}</dd></div>
                    <div><dt>Check-in</dt><dd>{{ occ.check_in_date ? new Date(occ.check_in_date).toLocaleDateString() : '—' }}</dd></div>
                    <div><dt>Check-out</dt><dd>{{ getAdminCheckoutDate(occ) }}</dd></div>
                    <div v-if="occ.emergency_contact" class="rp-span-2"><dt>Emergency contact</dt><dd>{{ occ.emergency_contact }}</dd></div>
                  </dl>
                </div>
              </div>
            </section>
          </template>
        </div>
      </div>
    </div>

    <!-- Custom Confirmation Modal -->
    <div v-management-dialog="{ close: () => showConfirmModal = false }" v-if="showConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div class="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full text-center border border-slate-100">
        <h3 class="text-lg font-semibold text-slate-900 uppercase tracking-tight mb-2">{{ confirmTitle }}</h3>
        <p class="text-slate-500 text-xs font-medium mb-6 leading-relaxed">{{ confirmMessage }}</p>
        <div class="flex gap-3">
          <button @click="executeConfirm" class="flex-1 bg-blue-600 hover:bg-black text-white text-[12px] font-semibold py-3.5 rounded-xl uppercase tracking-wide transition management-button management-button-primary">Confirm</button>
          <button @click="showConfirmModal = false" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[12px] font-semibold py-3.5 rounded-xl uppercase tracking-wide transition management-button">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Manual Archive Modal (captures WHY, so the owner sees the real reason instead of generic "permits expired") -->
    <div v-management-dialog="{ close: () => closeArchiveModal() }" v-if="showArchiveModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div class="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full text-center border border-slate-100">
        <h3 class="text-lg font-semibold text-slate-900 uppercase tracking-tight mb-2">Archive Property?</h3>
        <p class="text-slate-500 text-xs font-medium mb-4 leading-relaxed">
          "{{ archiveTargetHouse?.name }}" will be moved to the archive list and hidden from students. This is separate from the system's automatic archiving for expired permits — the owner will see this reason instead.
        </p>
        <textarea aria-label="Reason (optional) — e.g. Owner requested, currently at full capacity" v-model="archiveReasonInput" rows="3" placeholder="Reason (optional) — e.g. Owner requested, currently at full capacity"
                  class="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl text-xs font-semibold text-slate-700 outline-none transition mb-6 text-left"></textarea>
        <div class="flex gap-3">
          <button @click="execArchive" class="flex-1 bg-red-500 hover:bg-red-600 text-white text-[12px] font-semibold py-3.5 rounded-xl uppercase tracking-wide transition management-button">Confirm Archive</button>
          <button @click="closeArchiveModal" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[12px] font-semibold py-3.5 rounded-xl uppercase tracking-wide transition management-button">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Full-screen Document Viewer -->
    <div v-management-dialog="{ close: () => closePreview() }" v-if="showPreviewModal" class="doc-viewer animate-fade-in" @click.self="closePreview">
      <div class="doc-viewer-bar">
        <span class="doc-viewer-title"><i :class="isPdfFile(previewImageUrl) ? 'fa-solid fa-file-pdf' : 'fa-solid fa-file-image'" aria-hidden="true"></i> Document preview</span>
        <div class="doc-viewer-actions">
          <button v-if="!isPdfFile(previewImageUrl)" type="button" class="doc-viewer-btn" @click="previewZoomed = !previewZoomed" :aria-pressed="previewZoomed">
            <i :class="previewZoomed ? 'fa-solid fa-magnifying-glass-minus' : 'fa-solid fa-magnifying-glass-plus'" aria-hidden="true"></i>
            {{ previewZoomed ? 'Fit to screen' : 'Actual size' }}
          </button>
          <a :href="previewImageUrl" target="_blank" rel="noopener" class="doc-viewer-btn"><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i> Open in new tab</a>
          <button type="button" @click="downloadOriginal" :disabled="isDownloading" class="doc-viewer-btn is-primary">
            <i :class="isDownloading ? 'fa-solid fa-spinner animate-spin' : 'fa-solid fa-download'" aria-hidden="true"></i>
            {{ isDownloading ? 'Downloading...' : 'Download' }}
          </button>
          <button type="button" aria-label="Close preview" @click="closePreview" class="doc-viewer-close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </div>
      </div>
      <div :class="['doc-viewer-stage', { 'is-zoomed': previewZoomed }]" @click.self="closePreview">
        <iframe v-if="isPdfFile(previewImageUrl)" :src="previewImageUrl" class="doc-viewer-pdf" title="Document preview"></iframe>
        <img v-else :src="previewImageUrl" class="doc-viewer-img" alt="Document preview" @click="previewZoomed = !previewZoomed" />
      </div>
    </div>

    <!-- Fullscreen Lightbox Modal for BH Gallery -->
    <div v-management-dialog="{ close: () => showLightbox = false }" v-if="showLightbox && bhPhotos.length > 0" class="fixed inset-0 z-[250] bg-black/90 backdrop-blur-md flex items-center justify-center p-4" @click="showLightbox = false">
      <div class="relative max-w-5xl max-h-[90vh] w-full flex flex-col items-center justify-center" @click.stop>
        <button aria-label="Close dialog" @click="showLightbox = false" class="absolute -top-12 right-0 text-white/80 hover:text-white text-3xl font-semibold focus:outline-none cursor-pointer">&times;</button>
        <img :src="getImageUrl(bhPhotos[currentPhotoIndex])" class="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-white/10" />
        <div class="mt-4 bg-slate-900/80 text-white px-5 py-2 rounded-full text-xs font-semibold uppercase tracking-wide border border-white/10 flex items-center gap-3">
          <span>{{ getPhotoLabel(currentPhotoIndex) }}</span>
          <span class="text-slate-500">|</span>
          <span class="text-blue-400">{{ currentPhotoIndex + 1 }} / {{ bhPhotos.length }}</span>
        </div>
      </div>
    </div>


  </div>
</template>
<style scoped>
/* Laptop/desktop: keep the whole registry on one screen. The page itself does not scroll;
   only the table rows scroll inside the card, with the pagination bar always visible. */
@media (min-width: 768px) {
  .registered-fit {
    height: 100dvh;
    min-height: 0 !important;
    overflow: hidden;
  }
  .registered-fit > main {
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding-top: 24px !important;
    padding-bottom: 20px !important;
  }
  .registered-fit > main :deep(.management-page-header) {
    margin-bottom: 16px;
  }
  .registered-body,
  .registered-table-card {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .registered-table-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .registered-table-scroll thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: #f8fafc;
  }
  .registered-table-scroll :deep(td) {
    padding-top: 10px;
    padding-bottom: 10px;
  }
}

/* Registry rows: the whole row opens the details panel */
.rp-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
.rp-chip.is-success { background: #f0fdf4; color: #15803d; border-color: #bbf7d0; }
.rp-chip.is-warning { background: #fff7ed; color: #c2410c; border-color: #fed7aa; }
.rp-chip.is-danger { background: #fff1f2; color: #be123c; border-color: #fecdd3; }
.rp-chip.is-star { background: #fffbeb; color: #b45309; border-color: #fde68a; }
.rp-view-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 8px 14px; min-height: 38px; border-radius: 10px; border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background .15s, border-color .15s; }
.rp-view-btn:hover { background: #3b82f6; border-color: #3b82f6; color: #fff; }
.rp-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; }

/* Property details page: fills the admin content area (beside the sidebar, below the top bar) */
.rp-page {
  --a-primary: #1E4A8D; --a-primary-soft: #E7EEF8; --a-primary-tint: #C9D7EC;
  --a-gold: #E0A526; --a-bg: #EEF3FA; --a-surface: #FFFFFF; --a-surface-2: #F6F9FD; --a-border: #DFE7F2;
  --a-heading: #142B4A; --a-text: #33475F; --a-muted: #5B6E86; --a-faint: #8597AD;
  position: fixed; top: 72px; right: 0; bottom: 0; left: 0; z-index: 45;
  overflow-y: auto; background: var(--a-bg); color: var(--a-text); text-align: left;
  font-family: 'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
  animation: rp-fade .18s ease-out;
}
@media (min-width: 1180px) { .rp-page { left: 248px; } }
@keyframes rp-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.rp-page-inner { max-width: 1440px; margin: 0 auto; padding: 20px clamp(16px, 2.6vw, 36px) 40px; display: flex; flex-direction: column; gap: 16px; }
.rp-topline { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.rp-back { display: inline-flex; align-items: center; gap: 8px; padding: 0 14px; min-height: 38px !important; border-radius: 10px; border: 1px solid var(--a-border); background: var(--a-surface); color: var(--a-primary); font-size: 13.5px; font-weight: 600; cursor: pointer; }
.rp-back:hover { background: var(--a-primary-soft); border-color: var(--a-primary-tint); }
.rp-archive-btn { display: inline-flex; align-items: center; gap: 8px; padding: 0 18px; min-height: 40px !important; border-radius: 10px; border: 1px solid #ef4444; background: #ef4444; color: #fff; font-size: 13.5px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(239, 68, 68, .25); }
.rp-back.is-main { padding: 0 18px; min-height: 40px !important; background: var(--a-primary); border-color: var(--a-primary); color: #fff; font-weight: 700; }
.rp-back.is-main:hover { background: #163870; border-color: #163870; }

.rp-card { background: var(--a-surface); border: 1px solid var(--a-border); border-radius: 20px; box-shadow: 0 1px 2px rgba(20, 43, 74, .04), 0 8px 24px rgba(20, 43, 74, .05); padding: 22px 24px; min-width: 0; }
.rp-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.rp-card-title { margin: 0 0 14px; font-size: 16px; font-weight: 700; color: var(--a-heading); letter-spacing: -.01em; }
.rp-sub-title { margin: 16px 0 6px; font-size: 13px; font-weight: 600; color: var(--a-muted); }
.rp-strong { margin: 0; font-size: 15px; font-weight: 700; color: var(--a-heading); }
.rp-muted { margin: 0; font-size: 13px; color: var(--a-muted); }
.rp-text { margin: 0; font-size: 14px; line-height: 1.65; color: var(--a-text); white-space: pre-wrap; }

/* Summary card */
.rp-hero { display: flex; flex-direction: column; gap: 18px; border-top: 4px solid var(--a-gold); }
.rp-hero-main { display: flex; gap: 20px; align-items: flex-start; }
.rp-hero-photo { width: 168px; height: 120px; flex-shrink: 0; border-radius: 14px; object-fit: cover; border: 1px solid var(--a-border); cursor: zoom-in; }
.rp-hero-photo.is-empty { display: flex; align-items: center; justify-content: center; background: var(--a-primary-soft); color: var(--a-primary); font-size: 32px; cursor: default; }
.rp-hero-title { margin: 0; font-size: clamp(22px, 2.2vw, 28px); font-weight: 700; color: var(--a-heading); letter-spacing: -.02em; line-height: 1.2; }
.rp-hero-sub { margin: 6px 0 0; font-size: 14px; color: var(--a-muted); display: flex; align-items: center; gap: 8px; }
.rp-hero-sub i { color: var(--a-faint); width: 14px; }
.rp-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.rp-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 0; }
.rp-stats dt i { color: var(--a-faint); margin-right: 4px; }
.rp-stat-sub { display: block; margin-top: 2px; font-size: 12px; color: var(--a-muted); }
.rp-stats > div.is-primary { background: var(--a-primary-soft); border-color: var(--a-primary-tint); }
.rp-stats > div.is-primary dd, .rp-stats > div.is-primary dt i { color: var(--a-primary); }
.rp-stats > div.is-success dd { color: #15803d; }
.rp-stats > div { padding: 12px 14px; border-radius: 14px; background: var(--a-surface-2); border: 1px solid var(--a-border); }
.rp-stats dt { font-size: 12px; font-weight: 600; color: var(--a-muted); }
.rp-stats dd { margin: 4px 0 0; font-size: 18px; font-weight: 700; color: var(--a-heading); }
.rp-stats > div.is-warning { background: #fff7ed; border-color: #fdba74; }
.rp-stats > div.is-warning dd { color: #ea580c; }
.rp-stats > div.is-danger { background: #fff1f2; border-color: #fecdd3; }
.rp-stats > div.is-danger dd { color: #be123c; }
@media (max-width: 1023px) { .rp-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .rp-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .rp-hero-main { flex-direction: column; } .rp-hero-photo { width: 100%; height: 180px; } }

/* Tabs (admin pill style) */
.rp-tabs { display: flex; flex-shrink: 0; gap: 6px; padding: 6px; border-radius: 14px; background: var(--a-surface); border: 1px solid var(--a-border); overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
.rp-tabs::-webkit-scrollbar { display: none; }
.rp-page-inner > * { flex-shrink: 0; }
.rp-tab { display: inline-flex; flex-shrink: 0; align-items: center; gap: 8px; padding: 0 16px; height: 40px; min-height: 40px !important; line-height: 1; border: 0; border-radius: 10px; background: transparent; color: var(--a-muted); font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.rp-tab:hover { background: var(--a-surface-2); color: var(--a-primary); }
.rp-tab.is-active { background: var(--a-primary); color: #fff; }
.rp-tab-count { padding: 1px 8px; border-radius: 999px; background: var(--a-primary-soft); color: var(--a-primary); font-size: 11.5px; font-weight: 700; }
.rp-tab.is-active .rp-tab-count { background: rgba(255, 255, 255, .2); color: #fff; }

.rp-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
@media (min-width: 1024px) { .rp-grid { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); } }
.rp-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }

.rp-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 20px; margin: 0; }
.rp-span-2 { grid-column: 1 / -1; }
@media (max-width: 640px) { .rp-facts { grid-template-columns: minmax(0, 1fr); } }
.rp-facts dt { font-size: 12.5px; color: var(--a-muted); font-weight: 500; }
.rp-facts dd { margin: 3px 0 0; font-size: 14.5px; color: var(--a-heading); font-weight: 600; }
.rp-avatar { width: 56px; height: 56px; flex-shrink: 0; border-radius: 16px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: var(--a-primary); color: #fff; font-size: 22px; font-weight: 700; }
.rp-avatar img { width: 100%; height: 100%; object-fit: cover; }
.rp-tag { display: inline-block; padding: 4px 11px; border-radius: 999px; background: var(--a-surface-2); border: 1px solid var(--a-border); color: var(--a-text); font-size: 12.5px; font-weight: 600; text-transform: capitalize; }
.rp-tag.is-free { background: #f0fdf4; border-color: #bbf7d0; color: #15803d; }
.rp-tag.is-paid { background: var(--a-primary-soft); border-color: var(--a-primary-tint); color: var(--a-primary); }
.rp-tag.is-female { background: #fdf2f8; border-color: #fbcfe8; color: #be185d; }
.rp-tag.is-male { background: var(--a-primary-soft); border-color: var(--a-primary-tint); color: var(--a-primary); }
.rp-map { height: 320px; border-radius: 14px; overflow: hidden; border: 1px solid var(--a-border); background: var(--a-surface-2); }
.rp-photo { position: relative; height: 320px; border-radius: 14px; overflow: hidden; background: #0f172a; cursor: zoom-in; }
.rp-photo img { width: 100%; height: 100%; object-fit: cover; }
.rp-photo-hint { position: absolute; right: 10px; bottom: 10px; padding: 4px 10px; border-radius: 999px; background: rgba(15, 23, 42, .75); color: #fff; font-size: 12px; font-weight: 600; }
.rp-photo-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 36px; height: 36px; min-height: 36px !important; border-radius: 999px; border: 0; background: rgba(255, 255, 255, .92); color: var(--a-heading); font-size: 20px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(0, 0, 0, .2); }
.rp-photo-nav.is-prev { left: 10px; }
.rp-photo-nav.is-next { right: 10px; }
.rp-thumb-btn { width: 72px; height: 54px; min-height: 0 !important; flex-shrink: 0; padding: 0; border-radius: 10px; overflow: hidden; border: 2px solid var(--a-border); opacity: .7; cursor: pointer; }
.rp-thumb-btn.is-active { border-color: var(--a-primary); opacity: 1; }
.rp-thumb-btn img { width: 100%; height: 100%; object-fit: cover; }
.rp-empty { padding: 28px; text-align: center; border: 1px dashed #cbd5e1; border-radius: 14px; background: var(--a-surface-2); color: var(--a-faint); font-size: 14px; font-weight: 600; }
.rp-review { padding: 12px 14px; border-radius: 12px; background: var(--a-surface-2); border: 1px solid var(--a-border); }

/* Documents */
.rp-doc-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
@media (min-width: 900px) { .rp-doc-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.rp-doc { display: flex; align-items: center; gap: 16px; padding: 12px; border-radius: 16px; border: 1px solid var(--a-border); background: var(--a-surface-2); }
.rp-doc.is-missing { background: #fff; border-style: dashed; }
.rp-doc-preview { width: 112px; height: 84px; flex-shrink: 0; padding: 0; min-height: 0 !important; border-radius: 12px; overflow: hidden; border: 1px solid var(--a-border); background: #fff; display: flex; align-items: center; justify-content: center; cursor: zoom-in; }
.rp-doc-preview img { width: 100%; height: 100%; object-fit: cover; }
.rp-doc-preview.is-empty { background: var(--a-surface-2); color: var(--a-faint); font-size: 26px; cursor: default; border-style: dashed; }
.rp-doc-pdf { display: flex; flex-direction: column; align-items: center; gap: 4px; color: #e11d48; font-size: 12px; font-weight: 700; }
.rp-doc-pdf i { font-size: 28px; }
.rp-doc-name { margin: 0; font-size: 14.5px; font-weight: 600; color: var(--a-heading); line-height: 1.35; }
.rp-doc-meta { margin: 4px 0 0; font-size: 13px; }
.rp-exp.is-success, .rp-exp.is-none { color: var(--a-muted); }
.rp-exp.is-warning { color: #ea580c; font-weight: 600; }
.rp-exp.is-danger { color: #be123c; font-weight: 600; }
.rp-link-btn { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; padding: 0 12px; min-height: 32px !important; border-radius: 9px; border: 1px solid var(--a-primary-tint); background: #fff; color: var(--a-primary); font-size: 12.5px; font-weight: 600; cursor: pointer; }
.rp-link-btn:hover { background: var(--a-primary); border-color: var(--a-primary); color: #fff; }

/* Rooms */
.rp-room-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
@media (min-width: 768px) { .rp-room-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 1280px) { .rp-room-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.rp-room { padding: 16px; border-radius: 16px; border: 1px solid var(--a-border); background: var(--a-surface-2); }
.rp-bar { height: 8px; margin-top: 12px; border-radius: 999px; background: var(--a-border); overflow: hidden; }
.rp-bar span { display: block; height: 100%; border-radius: 999px; background: var(--a-primary); }

/* Full-screen document viewer */
.doc-viewer { position: fixed; inset: 0; z-index: 260; display: flex; flex-direction: column; background: rgba(15, 23, 42, .92); backdrop-filter: blur(4px); }
.doc-viewer-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 16px; background: rgba(15, 23, 42, .85); border-bottom: 1px solid rgba(255, 255, 255, .08); }
.doc-viewer-title { display: inline-flex; align-items: center; gap: 8px; color: #fff; font-size: 14px; font-weight: 600; }
.doc-viewer-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.doc-viewer-btn { display: inline-flex; align-items: center; gap: 7px; height: 36px; min-height: 36px !important; padding: 0 14px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, .2); background: rgba(255, 255, 255, .08); color: #fff; font-size: 13px; font-weight: 600; text-decoration: none; cursor: pointer; }
.doc-viewer-btn:hover { background: rgba(255, 255, 255, .18); }
.doc-viewer-btn.is-primary { background: #3b82f6; border-color: #3b82f6; }
.doc-viewer-btn.is-primary:hover { background: #2563eb; }
.doc-viewer-btn:disabled { opacity: .6; cursor: default; }
.doc-viewer-close { width: 36px; height: 36px; min-height: 36px !important; border-radius: 10px; border: 0; background: rgba(255, 255, 255, .12); color: #fff; font-size: 16px; cursor: pointer; }
.doc-viewer-close:hover { background: #f43f5e; }
.doc-viewer-stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 16px; overflow: hidden; }
.doc-viewer-img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; border-radius: 6px; background: #fff; box-shadow: 0 20px 50px rgba(0, 0, 0, .45); cursor: zoom-in; }
.doc-viewer-stage.is-zoomed { overflow: auto; align-items: flex-start; justify-content: flex-start; }
.doc-viewer-stage.is-zoomed .doc-viewer-img { max-width: none; max-height: none; margin: auto; cursor: zoom-out; }
.doc-viewer-pdf { width: 100%; height: 100%; border: 0; border-radius: 6px; background: #fff; }

/* Barangay dropdown: no extra min-height so the box matches the search field */
.barangay-select { min-height: 0 !important; padding: 0; }
</style>
