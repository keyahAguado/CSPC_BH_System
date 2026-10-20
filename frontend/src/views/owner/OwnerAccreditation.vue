<script setup>
import ApplicantEmailGate from '../../components/ApplicantEmailGate.vue';
import DropdownSelect from '../../components/DropdownSelect.vue';
import TablePager from '../../components/management/TablePager.vue';
import { verifiedApplicantEmail } from '../../utils/applicantSession.js';
import { shrinkImage, shrinkDocumentImage } from '../../utils/imageShrink.js';
import OwnerNav from '../../components/partials/OwnerNav.vue';
import { normalizePhPhone, formatHouseContact, normalizeHouseContact, isValidHouseContact } from '../../utils/phoneValidation.js';
import { getRegions, getProvinces, getCitiesByRegion, getCities, getBarangays } from '../../utils/psgc.js';
import { saveDraftPart, loadDraft, clearDraft } from '../../utils/registrationDraft.js';
import { applicantToken, applicantHeaders, setApplicantToken, STATUS_INFO } from '../../utils/applicantSession.js';
import PageHeader from '../../components/management/PageHeader.vue';
import '../../styles/management.css';
import { vManagementDialog } from '../../components/management/dialogAccessibility.js';
import { validateInput } from '../../utils/inputValidation.js';
const isValidPermitDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
};
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import axios from 'axios';
import FlashAlert from '../../components/partials/FlashAlert.vue';
import DataPrivacyModal from '../../components/DataPrivacyModal.vue';
import { getImageUrl } from '../../config/api.js';
import NABUA_BARANGAYS from '../../constants/barangays.js';

const router = useRouter();
const route = useRoute();
const token = sessionStorage.getItem('cspc_token');
const API = import.meta.env.VITE_API_URL;
const alertRef = ref(null);

// Public property-first registration (/register): no account yet. The owner's
// details are collected with the property; SASO issues login credentials on approval.
const isPublicRegistration = route.meta?.publicRegistration === true;
// "Register a property" from the owner dashboard uses the same form layout and flow as /register.
const isPortalRegistration = !isPublicRegistration && route.query.new === 'true';
const useRegistrationLayout = isPublicRegistration || isPortalRegistration;
const ownerName = ref(typeof route.query.name === 'string' ? route.query.name : '');
// Owners register with a Gmail account: they type only the part before "@gmail.com"
const GMAIL_DOMAIN = '@gmail.com';
const cleanGmailName = (value) => String(value || '').split('@')[0].replace(/[^A-Za-z0-9.]/g, '').slice(0, 64);
const ownerEmailName = ref(cleanGmailName(typeof route.query.email === 'string' ? route.query.email : ''));
const verifiedEmail = ref(verifiedApplicantEmail());
const refreshVerifiedEmail = () => { verifiedEmail.value = verifiedApplicantEmail(); };
onMounted(() => window.addEventListener('applicant-session-updated', refreshVerifiedEmail));
onUnmounted(() => window.removeEventListener('applicant-session-updated', refreshVerifiedEmail));
const ownerEmail = computed(() => isPublicRegistration && !applicantMode ? verifiedEmail.value : (ownerEmailName.value ? ownerEmailName.value + GMAIL_DOMAIN : ''));
const sanitizeOwnerEmailName = () => { ownerEmailName.value = cleanGmailName(ownerEmailName.value); };
const ownerPhone = ref('');
const ownerErrors = ref({});

// Owner home address: Region → Province → City/Municipality → Barangay (PSGC lists) + street.
const addressStreet = ref('');
const regionCode = ref('');
const provinceCode = ref('');
const cityCode = ref('');
const barangayCode = ref('');
const regionOptions = ref([]);
const provinceOptions = ref([]);
const cityOptions = ref([]);
const barangayOptions = ref([]);
const regionHasProvinces = ref(true);
const addressLoading = ref('');
const addressLoadError = ref('');
const optionName = (list, code) => (list.find(o => o.code === code) || {}).name || '';
const ownerAddress = computed(() => [
  addressStreet.value.trim(),
  optionName(barangayOptions.value, barangayCode.value),
  optionName(cityOptions.value, cityCode.value),
  regionHasProvinces.value ? optionName(provinceOptions.value, provinceCode.value) : '',
  optionName(regionOptions.value, regionCode.value)
].filter(Boolean).join(', '));

const loadAddressOptions = async (level, loader) => {
  addressLoading.value = level;
  addressLoadError.value = '';
  try {
    return await loader();
  } catch (e) {
    addressLoadError.value = 'Could not load the address list. Check your internet connection and select again.';
    return [];
  } finally {
    addressLoading.value = '';
  }
};
const onRegionChange = async () => {
  provinceCode.value = ''; cityCode.value = ''; barangayCode.value = '';
  provinceOptions.value = []; cityOptions.value = []; barangayOptions.value = [];
  if (!regionCode.value) return;
  const provinces = await loadAddressOptions('province', () => getProvinces(regionCode.value));
  regionHasProvinces.value = provinces.length > 0;
  if (regionHasProvinces.value) provinceOptions.value = provinces;
  else cityOptions.value = await loadAddressOptions('city', () => getCitiesByRegion(regionCode.value));
};
const onProvinceChange = async () => {
  cityCode.value = ''; barangayCode.value = '';
  cityOptions.value = []; barangayOptions.value = [];
  if (provinceCode.value) cityOptions.value = await loadAddressOptions('city', () => getCities(provinceCode.value));
};
const onCityChange = async () => {
  barangayCode.value = '';
  barangayOptions.value = [];
  if (cityCode.value) barangayOptions.value = await loadAddressOptions('barangay', () => getBarangays(cityCode.value));
};
const loadRegions = async () => {
  if (!regionOptions.value.length) regionOptions.value = await loadAddressOptions('region', getRegions);
};
const submittedRegistration = ref(null);
const googleRedirectNotice = isPublicRegistration && route.query.notice === 'register_property';

// Track My Application modes (verified applicant, no owner account):
//   /register?edit=BH-…  edit before review or respond to a revision request
//   /register?add=1      add another property for the same applicant
const applicantEditRef = isPublicRegistration && typeof route.query.edit === 'string' ? route.query.edit.trim().toUpperCase() : '';
const applicantAddMode = isPublicRegistration && !applicantEditRef && route.query.add === '1';
const applicantMode = Boolean(applicantEditRef || applicantAddMode);
const includeOwnerStep = isPublicRegistration && !applicantMode;
const applicantStatus = ref('');
const applicantRemarks = ref('');
const editLocked = ref('');
const existingMainImgUrl = ref('');
const submitLabel = computed(() => {
  if (applicantEditRef) return applicantStatus.value === 'REVISION_REQUIRED' ? 'Resubmit for review' : 'Save changes';
  return applicantAddMode ? 'Submit property' : 'Submit application';
});
const breadcrumbTitle = computed(() => {
  if (submittedRegistration.value) return submittedRegistration.value.mode === 'edit' ? 'Changes saved' : 'Application submitted';
  if (applicantEditRef) return `${applicantStatus.value === 'REVISION_REQUIRED' ? 'Respond to revision' : 'Edit application'} · ${applicantEditRef}`;
  return applicantAddMode ? 'Add another property' : 'Register your Property';
});

const currentUser = ref(isPublicRegistration ? {} : JSON.parse(sessionStorage.getItem('cspc_user') || '{}'));
// Public registration adds an Owner Information step (step 0) before the existing four.
const firstStep = includeOwnerStep ? 0 : 1;
const steps = includeOwnerStep ? [0, 1, 2, 3, 4] : [1, 2, 3, 4];
const stepNumber = (step) => step + (includeOwnerStep ? 1 : 0);
const stepTitles = { 0: 'Owner Information', 1: 'Legal Compliance', 2: 'Property Photos', 3: 'Property Details & Map', 4: 'Amenities Center' };
const stepShortTitles = { 0: 'Owner Info', 1: 'Legal Documents', 2: 'Photos', 3: 'Details & Map', 4: 'Amenities' };
// Example featured photo and gallery categories for the public registration page.
const featuredPhotoExample = '/img/boarding_house/rumadabie.jpg';
const photoCategories = [
  { key: 'bedroom', label: 'Bedroom', hint: 'One photo per room: beds, cabinets, windows', sample: '/img/samples/bedroom.svg' },
  { key: 'comfort_room', label: 'Comfort Room / Bathroom', hint: 'Toilet, shower and sink', sample: '/img/samples/bathroom.svg' },
  { key: 'kitchen', label: 'Kitchen', hint: 'Cooking area, sink and dining table', sample: '/img/samples/kitchen.svg' },
  { key: 'exterior', label: 'Exterior', hint: 'Building sides, gate, parking, signage', sample: '/img/samples/exterior.svg' },
  { key: 'common_area', label: 'Common Areas', hint: 'Lounge, study or visitor area', sample: '/img/samples/common.svg' },
  { key: 'other', label: 'Other Property Areas', hint: 'Laundry, water supply, storage, etc.', sample: '/img/samples/other.svg' }
];
const photoCategoryKeys = photoCategories.map(c => c.key);
// Legacy (uncategorised) photos are listed under "Other Property Areas".
const photosIn = (key) => selectedPhotos.value
  .map((photo, index) => ({ photo, index }))
  .filter(({ photo }) => (photoCategoryKeys.includes(photo.category) ? photo.category : 'other') === key);
const activeStep = ref(firstStep);
const showDpaModal = ref(!applicantMode && !Boolean(currentUser.value.dpa_accepted));

const handleDpaAccepted = () => {
  showDpaModal.value = false;
  currentUser.value.dpa_accepted = 1;
};

const isLoading = ref(true);

// Details & Map (laptop/desktop): the step fits the window; the map takes whatever height is left.
const fitDetailsStep = computed(() => useRegistrationLayout && activeStep.value === 3 && !isLoading.value && !submittedRegistration.value);
const isSaving = ref(false);
const successMsg = ref('');
const errorMsg = ref('');
const validationErrors = ref([]); 

const isRejected = ref(currentUser.value.houseStatus === 'rejected');
const rawAdminComments = currentUser.value.admin_comments || '';
const adminComments = ref(rawAdminComments.trim().toLowerCase() === 'accredited' ? '' : rawAdminComments);

// Form Fields
const houseId = ref(null); // Dynamic assignment
const houseName = ref('');
const contactNumber = ref('');
const price = ref('');
const advanceMonths = ref('1');
const depositMonths = ref('1');
const depositType = ref('refundable');
const mapLink = ref('');
const locationAddress = ref('');
const selectedBarangay = ref('');
const latitude = ref('');
const longitude = ref('');
const description = ref('');
// True whenever the address text has been typed/edited but not yet confirmed
// via a dropdown selection, GPS fix, or pin drag/click — meaning
// latitude/longitude still reflect the OLD (or no) location while the
// visible address text shows something else.
const pinNeedsConfirmation = ref(false);

// File Input Tracking
const permitFiles = ref({});
const permitExpiries = ref({});
const existingFiles = ref({});

// Dynamic Multiple Photo Uploads
const mainHouseImg = ref(null);
const mainHouseImgPreview = ref('');
const selectedPhotos = ref([]); 
const maxPhotosLimit = 10;

const barangaysList = ref(NABUA_BARANGAYS);

const standardCriteria = [
  { id: 1, label: 'Business Permit Application Form', permit_key: 'permit_business_form', required: true },
  { id: 2, label: 'Community Tax Certificate (Cedula)', permit_key: 'permit_cedula', required: false },
  { id: 3, label: 'DTI Registration Certificate', permit_key: 'permit_dti', required: false },
  { id: 4, label: 'Barangay Business Clearance', permit_key: 'permit_barangay', required: true },
  { id: 5, label: 'Certificate of Building Inspection', permit_key: 'permit_building', required: false },
  { id: 6, label: 'Zoning Certificate / Locational Clearance', permit_key: 'permit_zoning', required: false },
  { id: 7, label: 'Sanitary Permit / Health Clearance', permit_key: 'permit_sanitary', required: true },
  { id: 8, label: 'Valid Fire Safety Inspection Certificate', permit_key: 'permit_fire', required: true }
];
const criteria = ref([...standardCriteria]);
const requirementsLoaded = ref(false);
const applyCustomCriteria = (items, docs = []) => {
  criteria.value = [...standardCriteria, ...items.map(c => ({ ...c, permit_key: `custom_document_${c.id}`, required: c.requirement_type === 'required' }))];
  for (const d of docs) {
    const key = `custom_document_${d.criteria_id}`;
    if (d.file_path) existingFiles.value[key] = d.file_path;
    if (d.expiry_date) permitExpiries.value[key] = String(d.expiry_date).slice(0, 10);
  }
};

const requiredCriteria = computed(() => criteria.value.filter(p => p.required));
const optionalCriteria = computed(() => criteria.value.filter(p => !p.required));

// Amenities Lists
const freeAmenities = ref(['Wi-Fi', '24/7 Water', 'CCTV', 'Electric Fan', 'Caretaker', 'Study Area', 'Visitor Area', 'Fire Exit']);
const selectedFree = ref([]);
const customFree = ref([]);
const newFreeText = ref('');

const paidAmenities = ref(['Aircon', 'Laundry', 'Parking', 'Refrigerator', 'Electricity', 'Water Bill', 'Balcony', 'Kitchen Use']);
const selectedPaid = ref([]);
const customPaid = ref([]);
const newPaidText = ref('');

// Google Maps & Modals Refs
const mapContainer = ref(null);
const largeMapContainer = ref(null);
const showFullscreenMap = ref(false);
const isGpsLoading = ref(false);

let googleInstance = null;
let mapInstance = null;
let markerInstance = null;
let largeMapInstance = null;
let largeMarkerInstance = null;

// ================= DYNAMIC SCRIPT LOADER (HEIC Decoders) =================
const loadScript = (url) => {
  return new Promise((resolve, reject) => {
    if (window.heic2any) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

const transcodeHeicFile = async (file) => {
  const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';
  if (!isHeic) return file;

  try {
    console.log("[HEIC DECODER] iPhone HEIC image detected. Loading transcoder dependency...");
    await loadScript('https://unpkg.com/heic2any@0.0.4/dist/heic2any.min.js');
    
    console.log("[HEIC DECODER] Processing file on client-side threads...");
    const resultBlob = await window.heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.8
    });

    const convertedBlob = Array.isArray(resultBlob) ? resultBlob[0] : resultBlob;
    const sanitizedName = file.name.replace(/\.[^/.]+$/, "") + ".jpeg";

    console.log("[HEIC DECODER] Successfully converted to standard JPEG format!");
    return new File([convertedBlob], sanitizedName, { type: 'image/jpeg' });
  } catch (err) {
    console.error("[HEIC DECODER] Image conversion thread crashed, falling back to original file:", err);
    return file;
  }
};

// ================= DYNAMIC STATE MANAGEMENT METHODS =================

const resetFormToCleanSlate = () => {
  houseId.value = null;
  houseName.value = '';
  contactNumber.value = '';
  price.value = '';
  advanceMonths.value = '1';
  depositMonths.value = '1';
  depositType.value = 'refundable';
  mapLink.value = '';
  locationAddress.value = '';
  selectedBarangay.value = '';
  latitude.value = '';
  longitude.value = '';
  description.value = '';
  permitFiles.value = {};
  permitExpiries.value = {};
  permitFileErrors.value = {};
  permitExpiryErrors.value = {};
  existingFiles.value = {};
  mainHouseImg.value = null;
  mainHouseImgPreview.value = '';
  selectedPhotos.value = [];
  selectedFree.value = [];
  customFree.value = [];
  selectedPaid.value = [];
  customPaid.value = [];
  isRejected.value = false;
  adminComments.value = '';
  activeStep.value = firstStep;
  validationErrors.value = [];
  successMsg.value = '';
  errorMsg.value = '';
};

const loadOnboardingData = async () => {
  draftReady.value = false;
  requirementsLoaded.value = false;
  try {
    const { data } = await axios.get('/api/boarding-houses/application-requirements');
    if (!data.success) throw new Error('Requirements unavailable');
    applyCustomCriteria(data.criteria || []);
    requirementsLoaded.value = true;
  } catch { errorMsg.value = 'Document requirements could not be loaded. Refresh before continuing.'; return; }
  if (isPublicRegistration) {
    if (submittedRegistration.value) return;
    resetFormToCleanSlate();
    if (applicantMode && !applicantToken()) {
      router.replace('/track');
      return;
    }
    if (applicantEditRef) await fetchApplicantApplication();
    else if (includeOwnerStep) { await loadRegions(); await restoreDraft(); }
    return;
  }
  if (route.query.new === 'true') {
    resetFormToCleanSlate();
    await restoreDraft();
  } else if (route.query.houseId) {
    houseId.value = route.query.houseId;
    await fetchHouseDetails();
  } else {
    // General fallback structure based on active session properties
    const storedHouseId = currentUser.value.houseId;
    if (storedHouseId) {
      houseId.value = storedHouseId;
      await fetchHouseDetails();
    } else {
      resetFormToCleanSlate();
    }
  }
};

// ================= DATABASE RETRIEVAL =================
const parseList = (value) => {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};

// Track My Application edit mode: the server only returns the verified applicant's own application.
async function fetchApplicantApplication() {
  try {
    const { data } = await axios.get(`/api/applications/${encodeURIComponent(applicantEditRef)}`, { headers: applicantHeaders() });
    const app = data.application;
    applyCustomCriteria(data.customCriteria || [], data.customDocuments || []);
    applicantStatus.value = app.status;
    applicantRemarks.value = app.status === 'REVISION_REQUIRED' ? (app.admin_comments || '') : '';
    if (!app.editable) editLocked.value = STATUS_INFO[app.status]?.hint || 'This application can no longer be edited.';
    houseId.value = 'existing';
    houseName.value = app.name || '';
    contactNumber.value = normalizeHouseContact(app.phone_contact || '');
    price.value = app.price || '';
    advanceMonths.value = String(app.advance_months ?? '0');
    depositMonths.value = String(app.deposit_months ?? '0');
    depositType.value = app.deposit_type || 'refundable';
    mapLink.value = app.map_link || '';
    locationAddress.value = app.location || '';
    selectedBarangay.value = app.barangay || '';
    latitude.value = app.latitude || '';
    longitude.value = app.longitude || '';
    description.value = app.description || '';
    selectedFree.value = parseList(app.amenities_free);
    selectedPaid.value = parseList(app.amenities_paid);
    selectedFree.value.forEach(tag => { if (!freeAmenities.value.includes(tag)) freeAmenities.value.push(tag); });
    selectedPaid.value.forEach(tag => { if (!paidAmenities.value.includes(tag)) paidAmenities.value.push(tag); });
    if (app.img) {
      existingMainImgUrl.value = getImageUrl(app.img);
      mainHouseImgPreview.value = existingMainImgUrl.value;
    }
    selectedPhotos.value = (data.photos || []).map(ph => ({ file: null, previewUrl: getImageUrl(ph.photo_url), dbValue: ph.photo_url, category: ph.category || null }));
    criteria.value.forEach(p => {
      if (app[p.permit_key]) {
        existingFiles.value[p.permit_key] = app[p.permit_key];
        const expiry = app['expiry_' + p.permit_key];
        permitExpiries.value[p.permit_key] = expiry ? new Date(expiry).toISOString().split('T')[0] : '';
      }
    });
  } catch (err) {
    if (err.response?.status === 401) { router.replace('/track'); return; }
    editLocked.value = err.response?.data?.message || 'We could not load this application.';
  }
}

async function fetchHouseDetails() {
  if (!houseId.value) return;
  try {
    const res = await axios.get(`/api/boarding-houses/details/${houseId.value}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const house = res.data.data;
    if (house) {
      houseName.value = house.name || '';
      contactNumber.value = normalizeHouseContact(house.phone_contact || '');
      price.value = house.price || '';
      advanceMonths.value = house.advance_months || '0';
      depositMonths.value = house.deposit_months || '0';
      depositType.value = house.deposit_type || 'refundable';
      mapLink.value = house.map_link || '';
      locationAddress.value = house.location || '';
      selectedBarangay.value = house.barangay || '';
      latitude.value = house.latitude || '';
      longitude.value = house.longitude || '';
      description.value = house.description || '';
      
      selectedFree.value = typeof house.amenities_free === 'string'
        ? JSON.parse(house.amenities_free || '[]')
        : (Array.isArray(house.amenities_free) ? house.amenities_free : []);
      selectedPaid.value = typeof house.amenities_paid === 'string'
        ? JSON.parse(house.amenities_paid || '[]')
        : (Array.isArray(house.amenities_paid) ? house.amenities_paid : []);

      // Add any custom amenities to the options list so checkboxes render
      selectedFree.value.forEach(tag => {
        if (!freeAmenities.value.includes(tag)) freeAmenities.value.push(tag);
      });
      selectedPaid.value.forEach(tag => {
        if (!paidAmenities.value.includes(tag)) paidAmenities.value.push(tag);
      });
      
      // Update warning context according to specific loaded details
      isRejected.value = house.house_status === 'rejected';
      adminComments.value = house.admin_comments || '';
      
      // Load saved main display exterior image
      if (house.img) {
        mainHouseImgPreview.value = getImageUrl(house.img);
      }

      // Populate extra image cells — prefer house_photos table (Cloudinary), fall back to legacy img_1/2/3
      selectedPhotos.value = [];
      const photosFromServer = res.data.photos || [];
      if (photosFromServer.length > 0) {
        photosFromServer.forEach(url => {
          selectedPhotos.value.push({ file: null, previewUrl: getImageUrl(url), dbValue: url });
        });
      } else {
        if (house.img_1) selectedPhotos.value.push({ file: null, previewUrl: getImageUrl(house.img_1), dbValue: house.img_1 });
        if (house.img_2) selectedPhotos.value.push({ file: null, previewUrl: getImageUrl(house.img_2), dbValue: house.img_2 });
        if (house.img_3) selectedPhotos.value.push({ file: null, previewUrl: getImageUrl(house.img_3), dbValue: house.img_3 });
      }

      const { data: documents } = await axios.get(`/api/boarding-houses/documents/${houseId.value}`, { headers: { Authorization: `Bearer ${token}` } });
      applyCustomCriteria((documents.criteria || []).filter(c => !c.permit_key), (documents.criteria || []).filter(c => !c.permit_key).map(c => ({ criteria_id: c.id, file_path: c.current_file, expiry_date: c.current_expiry })));

      // Store current file names for permits preview
      criteria.value.forEach(p => {
        if (house[p.permit_key]) {
          existingFiles.value[p.permit_key] = house[p.permit_key];
          permitExpiries.value[p.permit_key] = house['expiry_' + p.permit_key] ? new Date(house['expiry_' + p.permit_key]).toISOString().split('T')[0] : '';
        }
      });
    }
  } catch (e) {
    console.error('Failed to load existing boarding house details:', e.message);
  }
}

// Geographic bounds & center for Nabua, Camarines Sur (Lat: 13.4072, Lng: 123.3748)
const NABUA_CENTER = { lat: 13.4072, lng: 123.3748 };
const NABUA_BOUNDS = {
  north: 13.4500,
  south: 13.3700,
  east: 123.4100,
  west: 123.3300
};

// Reactive Instant Validation Error Trackers
const permitFileErrors = ref({});
const permitExpiryErrors = ref({});
const mainImgError = ref('');
const photosError = ref('');
const fieldErrors = ref({});

// Image Validation Helper (Max 10MB to accommodate high quality photos)
const validateImageFile = (file) => {
  if (!file) return { valid: false, message: 'No file selected.' };
  
  const fileName = file.name ? file.name.toLowerCase() : '';
  const fileType = file.type ? file.type.toLowerCase() : '';
  
  const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif'];
  const isImageMime = fileType.startsWith('image/');
  const hasImageExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
  
  if (!isImageMime && !hasImageExtension) {
    return { valid: false, message: 'Invalid file format. Only image files (PNG, JPG, JPEG, WEBP) are allowed.' };
  }
  
  const maxSizeInBytes = 10 * 1024 * 1024; // 10MB max size
  if (file.size > maxSizeInBytes) {
    return { valid: false, message: 'File is too large. Maximum size is 10MB.' };
  }
  
  return { valid: true, message: '' };
};

const validateField = (fieldName) => {
  if (fieldName === 'houseName') {
    if (!houseName.value.trim()) {
      fieldErrors.value.houseName = 'Boarding House Name is required.';
    } else {
      delete fieldErrors.value.houseName;
    }
  }
  if (fieldName === 'contactNumber') {
    const val = contactNumber.value.trim();
    if (!val) {
      fieldErrors.value.contactNumber = 'Contact Phone Number is required.';
    } else {
      if (!isValidHouseContact(val.replace(/\s*\/\s*$/, ''))) {
        fieldErrors.value.contactNumber = 'Enter one to three complete 11-digit mobile numbers starting with 09 (e.g., 09123456789 / 09987654321).';
      } else {
        delete fieldErrors.value.contactNumber;
      }
    }
  }
  if (fieldName === 'price') {
    if (!price.value || parseFloat(price.value) <= 0) {
      fieldErrors.value.price = 'Rent price must be a valid number greater than 0.';
    } else {
      delete fieldErrors.value.price;
    }
  }
  if (fieldName === 'selectedBarangay') {
    if (!selectedBarangay.value) {
      fieldErrors.value.selectedBarangay = 'Official Barangay selection is required.';
    } else {
      delete fieldErrors.value.selectedBarangay;
    }
  }
};

// Contact number: up to three 09XXXXXXXXX numbers; " / " is inserted after each complete number.
const handleOwnerPhoneKeypress = (e) => {
  if (e.key && e.key.length === 1 && !/[\d\/]/.test(e.key)) e.preventDefault();
};

const handleOwnerPhoneInput = (e) => {
  const typingForward = e.target.value.length > contactNumber.value.length;
  contactNumber.value = formatHouseContact(e.target.value, { typingForward });
  e.target.value = contactNumber.value;
  if (fieldErrors.value.contactNumber) validateField('contactNumber');
};

const sanitizeOwnerPhone = () => {
  ownerPhone.value = normalizePhPhone(ownerPhone.value);
};

const validateOwnerDetails = () => {
  const errors = {};
  if (!ownerName.value.trim()) errors.name = 'Owner full name is required.';
  if (isPublicRegistration && !applicantMode) {
    if (!verifiedEmail.value) errors.email = 'Verify your personal email before continuing.';
  } else if (!ownerEmailName.value.trim()) errors.email = 'Gmail address is required.';
  else if (/^\.|\.$|\.\./.test(ownerEmailName.value)) errors.email = 'A Gmail name cannot start or end with a dot, or have two dots in a row.';
  if (!/^09\d{9}$/.test(ownerPhone.value.trim())) errors.phone = 'Phone number must be a valid PH mobile number (11 digits, starting with 09).';
  if (!regionCode.value || (regionHasProvinces.value && !provinceCode.value) || !cityCode.value || !barangayCode.value) {
    errors.address = 'Please select your region, province, city/municipality and barangay.';
  }
  ownerErrors.value = errors;
  const list = Object.values(errors);
  const inputError = validateInput('ownerApplicant', { owner_name: ownerName.value, owner_email: ownerEmail.value.trim(), owner_phone: ownerPhone.value.trim(), owner_address: ownerAddress.value });
  // The shared rules only add format problems (e.g. an invalid email); "required" is already reported above.
  if (inputError && list.length === 0) {
    list.push(inputError);
    if (/email/i.test(inputError)) ownerErrors.value.email = inputError;
  }
  return list;
};

const validateCurrentStep = () => {
  const errors = [];
  if (activeStep.value === 0 && includeOwnerStep) {
    errors.push(...validateOwnerDetails());
  } else if (activeStep.value === 1) {
    // File problems stay in the File column and date problems in the Expiration column, so a missing
    // date never hides the files that are already attached.
    criteria.value.forEach(p => {
      const key = p.permit_key;
      const hasFile = permitHasFile(key);
      const expiry = permitExpiries.value[key];
      delete permitExpiryErrors.value[key];
      // A rejected replacement leaves the earlier valid files attached; its notice no longer blocks.
      if (hasFile) delete permitFileErrors.value[key];
      if (expiry && !isValidPermitDate(expiry)) {
        permitExpiryErrors.value[key] = 'Enter a complete, valid date.';
        errors.push(p.label + ' expiry date is invalid. Please enter a complete, valid date.');
      } else if (hasFile && !expiry) {
        permitExpiryErrors.value[key] = 'Add the expiration date.';
        errors.push(`Expiration date is required for ${p.label}.`);
      }
      if (p.required && !hasFile) {
        permitFileErrors.value[key] = `${p.label} document is required.`;
        errors.push(`${p.label} document is required.`);
      }
    });

    if (Object.keys(permitFileErrors.value).length > 0 && errors.length === 0) {
      errors.push('Please fix permit upload errors before proceeding.');
    }
  } else if (activeStep.value === 2) {
    if (!houseId.value && !mainHouseImg.value) {
      mainImgError.value = 'Featured Main Image (Exterior) is required for registration.';
      errors.push('Featured Main Image (Exterior) is required for registration.');
    }
    if (photosError.value) {
      errors.push(photosError.value);
    }
  } else if (activeStep.value === 3) {
    validateField('houseName');
    validateField('contactNumber');
    validateField('price');
    validateField('selectedBarangay');

    if (!locationAddress.value.trim()) {
      fieldErrors.value.locationAddress = 'A valid property address is required.';
    } else {
      delete fieldErrors.value.locationAddress;
    }

    if (!latitude.value || !longitude.value || parseFloat(latitude.value) === 0) {
      errors.push('Precise map pin coordinates are required.');
    } else if (pinNeedsConfirmation.value) {
      errors.push('Address text changed but map pin was not confirmed. Please select a dropdown suggestion or move the pin.');
    }

    if (Object.keys(fieldErrors.value).length > 0) {
      errors.push('Please fix the highlighted input errors before proceeding.');
    }
  }
  return errors;
};

// Missing details are shown as a flash alert so the form keeps its full size
const flashValidationErrors = (errors) => {
  const shown = errors.slice(0, 4).map(e => '• ' + e).join('\n');
  const more = errors.length > 4 ? `\n• …and ${errors.length - 4} more` : '';
  alertRef.value?.showSystemAlert(`Please complete the following:\n${shown}${more}`, 'warning');
};

// Stepper Navigation Methods
const nextStep = () => {
  const stepErrors = validateCurrentStep();
  if (stepErrors.length > 0) {
    validationErrors.value = stepErrors;
    flashValidationErrors(stepErrors);
    return;
  }
  validationErrors.value = [];
  if (activeStep.value < 4) { pushStepToHistory = true; activeStep.value++; }
};

const prevStep = () => {
  if (activeStep.value > firstStep) activeStep.value--;
};

// ---- Keep progress across refresh / accidental Back -------------------------------------------
// New registrations save a draft on this device (fields, current step and the chosen files) and
// restore it on return. The step is also kept in the address (?step=N), so the browser/phone Back
// button goes to the previous step instead of leaving the form. Editing an existing application
// or property always loads from the server instead.
let pushStepToHistory = false;
const draftReady = ref(false);
const draftKey = computed(() => {
  if (includeOwnerStep) return verifiedEmail.value ? `register:${verifiedEmail.value}` : '';
  if (isPortalRegistration) return `portal:${currentUser.value.id || currentUser.value.email || 'owner'}`;
  return '';
});
const draftFieldRefs = {
  ownerName, ownerEmailName, ownerPhone, addressStreet, regionCode, provinceCode, cityCode, barangayCode,
  houseName, contactNumber, price, advanceMonths, depositMonths, depositType, mapLink, locationAddress,
  selectedBarangay, latitude, longitude, description, permitExpiries, selectedFree, customFree, selectedPaid, customPaid
};
const draftFields = () => {
  const out = { step: activeStep.value, dpaAccepted: !showDpaModal.value };
  for (const [name, r] of Object.entries(draftFieldRefs)) out[name] = r.value;
  return JSON.parse(JSON.stringify(out));
};
// Files are copied into plain arrays (reactive proxies cannot be stored)
const draftFiles = () => ({
  permits: Object.fromEntries(Object.entries(permitFiles.value).map(([k, list]) => [k, [...(list || [])]])),
  main: mainHouseImg.value || null,
  photos: selectedPhotos.value.filter(p => p.file).map(p => ({ file: p.file, category: p.category || null }))
});
const restoreAddressOptions = async () => {
  if (!regionCode.value) return;
  const provinces = await loadAddressOptions('province', () => getProvinces(regionCode.value));
  regionHasProvinces.value = provinces.length > 0;
  if (regionHasProvinces.value) {
    provinceOptions.value = provinces;
    if (provinceCode.value) cityOptions.value = await loadAddressOptions('city', () => getCities(provinceCode.value));
  } else {
    cityOptions.value = await loadAddressOptions('city', () => getCitiesByRegion(regionCode.value));
  }
  if (cityCode.value) barangayOptions.value = await loadAddressOptions('barangay', () => getBarangays(cityCode.value));
};
const restoreDraft = async () => {
  draftReady.value = false;
  const key = draftKey.value;
  if (!key) return;
  const draft = await loadDraft(key);
  if (draft?.fields) {
    const f = draft.fields;
    for (const [name, r] of Object.entries(draftFieldRefs)) if (f[name] !== undefined) r.value = f[name];
    if (f.dpaAccepted) handleDpaAccepted();
    if (draft.files) {
      permitFiles.value = draft.files.permits || {};
      if (draft.files.main) { mainHouseImg.value = draft.files.main; mainHouseImgPreview.value = URL.createObjectURL(draft.files.main); }
      selectedPhotos.value = (draft.files.photos || []).map(p => ({ file: p.file, previewUrl: URL.createObjectURL(p.file), dbValue: null, category: p.category }));
    }
    await restoreAddressOptions();
    const step = Number(f.step);
    if (Number.isInteger(step) && step >= firstStep && step <= 4) activeStep.value = step;
  }
  draftReady.value = true;
  syncStepToUrl(false);
};
const syncStepToUrl = (push) => {
  if (!useRegistrationLayout || applicantEditRef || submittedRegistration.value) return;
  if (String(route.query.step) === String(activeStep.value)) return;
  router[push ? 'push' : 'replace']({ query: { ...route.query, step: String(activeStep.value) } }).catch(() => {});
};
watch(activeStep, () => {
  const push = pushStepToHistory;
  pushStepToHistory = false;
  if (draftReady.value || !draftKey.value) syncStepToUrl(push);
});
// Back / Forward in the browser (or the phone's back gesture) moves between steps
watch(() => route.query.step, (value) => {
  const step = Number(value);
  if (Number.isInteger(step) && step >= firstStep && step <= 4 && step !== activeStep.value) activeStep.value = step;
});
let draftFieldsTimer;
watch(() => JSON.stringify(draftFields()), () => {
  if (!draftReady.value || !draftKey.value || submittedRegistration.value) return;
  clearTimeout(draftFieldsTimer);
  const key = draftKey.value;
  draftFieldsTimer = setTimeout(() => saveDraftPart(key, 'fields', draftFields()), 400);
});
watch(() => [permitFiles.value, mainHouseImg.value, selectedPhotos.value.map(p => p.file)], () => {
  if (!draftReady.value || !draftKey.value || submittedRegistration.value) return;
  saveDraftPart(draftKey.value, 'files', draftFiles());
}, { deep: true });
// Email verified in this tab after the page loaded: pick up a draft saved earlier for that email
watch(verifiedEmail, (email) => { if (email && includeOwnerStep && !submittedRegistration.value) restoreDraft(); });
const discardDraft = () => {
  draftReady.value = false;
  clearTimeout(draftFieldsTimer);
  if (draftKey.value) clearDraft(draftKey.value);
};

// Add Custom Amenity dynamically
const addCustomAmenity = (type) => {
  if (type === 'free' && newFreeText.value.trim()) {
    customFree.value.push(newFreeText.value.trim());
    selectedFree.value.push(newFreeText.value.trim());
    newFreeText.value = '';
  } else if (type === 'paid' && newPaidText.value.trim()) {
    customPaid.value.push(newPaidText.value.trim());
    selectedPaid.value.push(newPaidText.value.trim());
    newPaidText.value = '';
  }
};

// Legal documents accept up to 5 files each: images (HEIC converted) or PDF.
const MAX_FILES_PER_DOCUMENT = 5;
const isPdfUpload = (file) => file && (file.type === 'application/pdf' || (file.name || '').toLowerCase().endsWith('.pdf'));
const handlePermitFile = async (key, event) => {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;

  // A rejected selection never removes files that were already attached.
  const reject = (message) => {
    const kept = permitFiles.value[key]?.length;
    permitFileErrors.value[key] = kept ? `${message} Your previous file${kept > 1 ? 's were' : ' was'} kept.` : message;
    event.target.value = '';
  };
  if (files.length > MAX_FILES_PER_DOCUMENT) return reject(`You can attach up to ${MAX_FILES_PER_DOCUMENT} files per document.`);
  for (const file of files) {
    if (isPdfUpload(file)) {
      if (file.size > 10 * 1024 * 1024) return reject('File is too large. Maximum size is 10MB.');
      continue;
    }
    const validation = validateImageFile(file);
    if (!validation.valid) return reject(validation.message.replace('Only image files (PNG, JPG, JPEG, WEBP) are allowed.', 'Only images (PNG, JPG, JPEG, WEBP, HEIC) or PDF files are allowed.'));
  }

  delete permitFileErrors.value[key];
  permitFiles.value[key] = await Promise.all(files.map(async f => (isPdfUpload(f) ? f : shrinkDocumentImage(await transcodeHeicFile(f)))));
};

// Legal documents table: one row per document, paged like the admin tables
const allPermits = computed(() => [...requiredCriteria.value, ...optionalCriteria.value].map((p, i) => ({ ...p, number: i + 1 })));
const docPage = ref(1);
const docPerPage = ref(10);
const docTotalPages = computed(() => Math.max(1, Math.ceil(allPermits.value.length / docPerPage.value)));
const docStart = computed(() => (allPermits.value.length ? (docPage.value - 1) * docPerPage.value + 1 : 0));
const docEnd = computed(() => Math.min(docPage.value * docPerPage.value, allPermits.value.length));
// Rows on the current page, still grouped under Mandatory / Additional
const docSections = computed(() => {
  const rows = allPermits.value.slice(docStart.value - 1, docEnd.value);
  return [
    { key: 'required', title: 'Mandatory documents', note: `${requiredCriteria.value.length} required`, items: rows.filter(p => p.required) },
    { key: 'optional', title: 'Additional documents', note: `${optionalCriteria.value.length} optional`, items: rows.filter(p => !p.required) }
  ].filter(section => section.items.length);
});
const permitHasFile = (key) => !!permitFiles.value[key]?.length || !!existingFiles.value[key];
const permitDone = (key) => permitHasFile(key) && !!permitExpiries.value[key] && !permitFileErrors.value[key] && !permitExpiryErrors.value[key];
const permitStatus = (key) => {
  if (permitFileErrors.value[key] || permitExpiryErrors.value[key]) return { tone: 'error', text: 'Needs attention' };
  const count = permitFiles.value[key]?.length || 0;
  if (count) return { tone: permitExpiries.value[key] ? 'done' : 'partial', text: `${count} file${count > 1 ? 's' : ''} attached${permitExpiries.value[key] ? '' : ' · add expiry date'}` };
  if (existingFiles.value[key]) return { tone: permitExpiries.value[key] ? 'done' : 'partial', text: 'On file' };
  return { tone: 'empty', text: 'Not uploaded' };
};
const formatFileSize = (bytes) => (bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB');
// When "Next: Photos" flags a document, show the page that holds it
watch(() => Object.keys(permitFileErrors.value).join() + '|' + Object.keys(permitExpiryErrors.value).join(), () => {
  const i = allPermits.value.findIndex(p => permitFileErrors.value[p.permit_key] || permitExpiryErrors.value[p.permit_key]);
  if (i >= 0) docPage.value = Math.floor(i / docPerPage.value) + 1;
});
// Entering a valid date clears that row's date message right away (no need to press Next again).
watch(permitExpiries, (values) => {
  for (const key of Object.keys(permitExpiryErrors.value)) {
    if (values[key] && isValidPermitDate(values[key])) delete permitExpiryErrors.value[key];
  }
}, { deep: true });

// Handle Main House Image with instant validation
const handleMainImg = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const validation = validateImageFile(file);
  if (!validation.valid) {
    mainImgError.value = validation.message;
    event.target.value = '';
    mainHouseImg.value = null;
    return;
  }

  mainImgError.value = '';
  const processedFile = await shrinkImage(await transcodeHeicFile(file));
  mainHouseImg.value = processedFile;
  mainHouseImgPreview.value = URL.createObjectURL(processedFile);
};

const clearMainImg = () => {
  if (mainHouseImgPreview.value && mainHouseImgPreview.value.startsWith('blob:')) URL.revokeObjectURL(mainHouseImgPreview.value);
  mainHouseImg.value = null;
  mainHouseImgPreview.value = existingMainImgUrl.value;
};

// Handle Dynamic Multi-Photo uploads with instant validation (category: gallery section on the public page)
const handlePhotosSelected = async (event, category = null) => {
  const files = Array.from(event.target.files);
  photosError.value = '';

  if (selectedPhotos.value.length + files.length > maxPhotosLimit) {
    photosError.value = `You can only upload a maximum of ${maxPhotosLimit} property photos.`;
    event.target.value = '';
    return;
  }

  for (const file of files) {
    const validation = validateImageFile(file);
    if (!validation.valid) {
      photosError.value = validation.message;
      event.target.value = '';
      return;
    }
  }

  for (const file of files) {
    const processedFile = await shrinkImage(await transcodeHeicFile(file));
    selectedPhotos.value.push({
      file: processedFile,
      previewUrl: URL.createObjectURL(processedFile),
      dbValue: null,
      category
    });
  }
  event.target.value = '';
};

const removePhoto = (index) => {
  if (selectedPhotos.value[index].previewUrl.startsWith('blob:')) {
    URL.revokeObjectURL(selectedPhotos.value[index].previewUrl);
  }
  selectedPhotos.value.splice(index, 1);
};

// High-Precision Coordinates Parser
const isResolvingMap = ref(false);

const extractCoordsFromString = (text) => {
  if (!text) return false;
  const rawUrl = String(text).trim();
  let decoded = rawUrl;
  try { decoded = decodeURIComponent(rawUrl); } catch (e) {}

  const regexArr = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&]query=(-?\d+\.\d+)[,%2C]+(-?\d+\.\d+)/,
    /!3d(-?\d+\.\d+).*?!4d(-?\d+\.\d+)/,
    /3d(-?\d+\.\d+).*?4d(-?\d+\.\d+)/,
    /[?&]q=(-?\d+\.\d+)[,%2C]+(-?\d+\.\d+)/,
    /[?&]ll=(-?\d+\.\d+)[,%2C]+(-?\d+\.\d+)/,
    /[?&]center=(-?\d+\.\d+)[,%2C]+(-?\d+\.\d+)/,
    /place\/[^\/]*\/@?(-?\d+\.\d+),(-?\d+\.\d+)/,
    /search\/[^\/]*\/@?(-?\d+\.\d+),(-?\d+\.\d+)/,
    /dir\/[^\/]*\/@?(-?\d+\.\d+),(-?\d+\.\d+)/,
    /^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/,
    /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/
  ];

  for (const textToTest of [rawUrl, decoded]) {
    for (const regex of regexArr) {
      const match = textToTest.match(regex);
      if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          updateCoords(lat, lng);
          reverseGeocode(lat, lng);
          return true;
        }
      }
    }
  }
  return false;
};

const isShortUrl = (url) => {
  if (!url) return false;
  try {
    const h = new URL(url).hostname;
    return h === 'maps.app.goo.gl' || h === 'goo.gl';
  } catch (e) { return false; }
};

const extractCoords = async (url) => {
  if (!url) return;
  const raw = String(url).trim();

  // If it already has parseable coords, extract directly
  if (extractCoordsFromString(raw)) return;

  // Short URL — resolve server-side first
  if (isShortUrl(raw)) {
    isResolvingMap.value = true;
    try {
      const res = await axios.get('/api/utils/resolve-map-link', { params: { url: raw } });
      if (res.data.success && res.data.resolvedUrl) {
        if (!extractCoordsFromString(res.data.resolvedUrl)) {
          console.warn('[MAP] Resolved URL has no extractable coordinates:', res.data.resolvedUrl);
        }
      }
    } catch (err) {
      console.error('[MAP] Failed to resolve short URL:', err.message);
    } finally {
      isResolvingMap.value = false;
    }
  }
};

const updateCoords = (lat, lng) => {
  latitude.value = lat.toFixed(8);
  longitude.value = lng.toFixed(8);
  pinNeedsConfirmation.value = false;

  const pos = { lat, lng };

  if (mapInstance && markerInstance) {
    mapInstance.setCenter(pos);
    markerInstance.position = pos;
  }
  if (largeMapInstance && largeMarkerInstance) {
    largeMapInstance.setCenter(pos);
    largeMarkerInstance.position = pos;
  }
};

// GPS Detection (GPS Trigger Button)
const detectMyLocation = () => {
  isGpsLoading.value = true;
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        updateCoords(lat, lng);
        reverseGeocode(lat, lng);
        isGpsLoading.value = false;

        // Friendly non-blocking warning notification if current GPS position is outside Nabua area
        if (lat < NABUA_BOUNDS.south || lat > NABUA_BOUNDS.north ||
            lng < NABUA_BOUNDS.west  || lng > NABUA_BOUNDS.east) {
          errorMsg.value = `Notice: GPS detected location outside Nabua area (${lat.toFixed(5)}, ${lng.toFixed(5)}). Address recorded successfully.`;
        } else {
          errorMsg.value = '';
        }
        delete fieldErrors.value.locationAddress;
      },
      (err) => {
        console.error("GPS Error:", err);
        alert("Could not retrieve precise GPS location. Please ensure location permissions are granted.");
        isGpsLoading.value = false;
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 } 
    );
  } else {
    alert("Geolocation is not supported by your browser.");
    isGpsLoading.value = false;
  }
};

// Google Reverse Geocoder — builds proper Philippine local address, no Plus Codes
const reverseGeocode = (lat, lng) => {
  if (!googleInstance) return;
  const geocoder = new googleInstance.maps.Geocoder();
  geocoder.geocode({ location: { lat, lng } }, (results, status) => {
    if (status === 'OK' && results && results.length > 0) {
      const target = results.find(r =>
        r.formatted_address && !/^[A-Z0-9]{4,}\+[A-Z0-9]{2,}/.test(r.formatted_address.trim())
      ) || results[0];

      const components = target.address_components || [];
      const get = (...types) => {
        for (const type of types) {
          const c = components.find(c => c.types.includes(type) && !c.types.includes('plus_code'));
          if (c) return c.long_name;
        }
        return null;
      };

      const parts = [
        get('street_number') && get('route') ? `${get('street_number')} ${get('route')}` : get('route'),
        get('sublocality_level_1', 'sublocality', 'neighborhood'),
        get('locality', 'administrative_area_level_3'),
        get('administrative_area_level_2'),
        get('country')
      ].filter(Boolean);

      if (parts.length >= 2) {
        locationAddress.value = parts.join(', ');
      } else {
        locationAddress.value = target.formatted_address.replace(/^[A-Z0-9]{4,}\+[A-Z0-9]{2,},?\s*/, '');
      }

      // Synchronize Autocomplete input field with reverse geocoded address
      const wrapper = document.getElementById('autocomplete-wrapper');
      if (wrapper) {
        const autocompleteEl = wrapper.querySelector('gmp-place-autocomplete') || wrapper.firstChild;
        if (autocompleteEl) autocompleteEl.value = locationAddress.value;
      }
    }
  });
};

// Fullscreen Map Modal toggler
const toggleFullscreenMap = () => {
  showFullscreenMap.value = !showFullscreenMap.value;
  
  if (showFullscreenMap.value) {
    // Reset map instance so it re-initializes into the freshly mounted DOM node
    largeMapInstance = null;
    largeMarkerInstance = null;

    setTimeout(() => {
      const lat = parseFloat(latitude.value) || NABUA_CENTER.lat;
      const lng = parseFloat(longitude.value) || NABUA_CENTER.lng;
      const pos = { lat, lng };

      if (!largeMapInstance) {
        const { AdvancedMarkerElement } = googleInstance.maps.marker;

        largeMapInstance = new googleInstance.maps.Map(largeMapContainer.value, {
          zoom: 18,
          center: pos,
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: false,
          restriction: {
            latLngBounds: NABUA_BOUNDS,
            strictBounds: false
          },
          mapId: 'CSPC_ACCREDITATION_MAP_LARGE'
        });

        largeMarkerInstance = new AdvancedMarkerElement({
          position: pos,
          map: largeMapInstance,
          gmpDraggable: true
        });

        largeMarkerInstance.addListener('gmp-dragend', () => {
          const newPos = largeMarkerInstance.position;
          if (newPos) {
            updateCoords(newPos.lat, newPos.lng);
            reverseGeocode(newPos.lat, newPos.lng);
          }
        });

        largeMapInstance.addListener('click', (e) => {
          const clickPos = e.latLng;
          if (clickPos) {
            const lat = clickPos.lat();
            const lng = clickPos.lng();
            largeMarkerInstance.position = { lat, lng };
            updateCoords(lat, lng);
            reverseGeocode(lat, lng);
          }
        });
      } else {
        largeMapInstance.setCenter(pos);
        largeMarkerInstance.position = pos;
      }
    }, 100);
  }
};

// Initializes Google Map Dynamically with strict Nabua restrictions
const initGoogleMap = async () => {
  const mapContainerEl = mapContainer.value;
  if (!mapContainerEl) return;

  if (mapInstance) {
    const { event } = googleInstance.maps;
    event.trigger(mapInstance, 'resize');
    const lat = parseFloat(latitude.value) || NABUA_CENTER.lat;
    const lng = parseFloat(longitude.value) || NABUA_CENTER.lng;
    mapInstance.setCenter({ lat, lng });
    return;
  }

  const defaultLat = parseFloat(latitude.value) || NABUA_CENTER.lat;
  const defaultLng = parseFloat(longitude.value) || NABUA_CENTER.lng;
  const myLatLng = { lat: defaultLat, lng: defaultLng };

  try {
    const { Map } = await googleInstance.maps.importLibrary("maps");
    const { AdvancedMarkerElement } = await googleInstance.maps.importLibrary("marker");
    const { PlaceAutocompleteElement } = await googleInstance.maps.importLibrary("places");

    mapInstance = new Map(mapContainerEl, {
      zoom: 16,
      center: myLatLng,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      restriction: {
        latLngBounds: NABUA_BOUNDS,
        strictBounds: true
      },
      mapId: 'CSPC_ACCREDITATION_MAP_SMALL'
    });

    markerInstance = new AdvancedMarkerElement({
      position: myLatLng,
      map: mapInstance,
      gmpDraggable: true,
      title: houseName.value || "Boarding House Location"
    });

    markerInstance.addListener('gmp-dragend', () => {
      const pos = markerInstance.position;
      if (pos) {
        const lat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
        const lng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;
        if (lat < NABUA_BOUNDS.south || lat > NABUA_BOUNDS.north ||
            lng < NABUA_BOUNDS.west  || lng > NABUA_BOUNDS.east) {
          fieldErrors.value.locationAddress = 'Only locations within Nabua, Camarines Sur are allowed (Iriga and Bato are excluded).';
          return;
        }
        delete fieldErrors.value.locationAddress;
        updateCoords(lat, lng);
        reverseGeocode(lat, lng);
      }
    });

    await nextTick();
    const wrapper = document.getElementById('autocomplete-wrapper');
    if (wrapper) {
      wrapper.innerHTML = ''; 
      
      const autocompleteEl = new PlaceAutocompleteElement({
        componentRestrictions: { country: 'ph' },
        includedRegionCodes: ['ph'],
        locationRestriction: NABUA_BOUNDS
      });

      autocompleteEl.placeholder = 'Type boarding house address or street name...';

      autocompleteEl.style.width = '100%';
      autocompleteEl.style.border = '2px solid #e2e8f0'; 
      autocompleteEl.style.borderRadius = '1rem'; 
      autocompleteEl.style.padding = '1rem'; 
      autocompleteEl.style.backgroundColor = '#ffffff';
      autocompleteEl.style.outline = 'none';
      autocompleteEl.style.fontSize = '0.875rem'; 
      autocompleteEl.style.fontWeight = '700'; 
      autocompleteEl.style.color = '#0f172a'; 

      if (locationAddress.value) {
        autocompleteEl.value = locationAddress.value;
      }

      wrapper.appendChild(autocompleteEl);

      autocompleteEl.addEventListener('input', () => {
        pinNeedsConfirmation.value = true;
      });

      autocompleteEl.addEventListener('gmp-select', async (event) => {
        const prediction = event.placePrediction;
        if (!prediction) return;

        const place = prediction.toPlace();
        await place.fetchFields({ fields: ['location', 'formattedAddress', 'addressComponents'] });

        if (place.location) {
          const lat = place.location.lat();
          const lng = place.location.lng();
          const addr = (place.formattedAddress || '').toLowerCase();

          // Reject Iriga, Bato, and points outside strict Nabua bounds
          if (addr.includes('iriga') || addr.includes('bato') ||
              lat < NABUA_BOUNDS.south || lat > NABUA_BOUNDS.north ||
              lng < NABUA_BOUNDS.west  || lng > NABUA_BOUNDS.east) {
            fieldErrors.value.locationAddress = 'Only locations within Nabua, Camarines Sur are allowed (Iriga and Bato are excluded).';
            return;
          }
          delete fieldErrors.value.locationAddress;

          updateCoords(lat, lng);
          locationAddress.value = place.formattedAddress || '';
        }
      });
    }
  } catch (err) {
    console.error("Error initializing Google Maps libraries:", err);
  }
};

// ================= LIFECYCLE AND REACTIVE ROUTE WATCHERS =================

onMounted(async () => {
  try {
    isLoading.value = true;
    
    // Resolve form state setup based on routing contexts
    await loadOnboardingData();

    setOptions({
      key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
      v: 'weekly'
    });

    await importLibrary('maps');
    await importLibrary('marker'); 
    await importLibrary('places');
    await importLibrary('geocoding');

    googleInstance = window.google; 
  } catch (err) {
    console.error('Google Maps loader failed:', err);
  } finally {
    isLoading.value = false;
    if (activeStep.value === 3) { await nextTick(); initGoogleMap(); }
  }
});

// Reactively watch for route queries changing during component lifecycles (no remounting required)
watch(
  () => JSON.stringify({ ...route.query, step: undefined }),
  async () => {
    await loadOnboardingData();
  }
);

watch(activeStep, async (newStep) => {
  if (newStep === 3) {
    await nextTick();
    await initGoogleMap();
  }
});

watch(locationAddress, (newVal) => {
  const el = document.querySelector('gmp-place-autocomplete');
  if (el && el.value !== newVal) {
    el.value = newVal;
  }
});

watch(mapLink, (newVal) => {
  extractCoords(newVal);
});

// ================= THE RIGOROUS CLIENT-SIDE VALIDATOR =================
const validateForm = () => {
  const errors = includeOwnerStep ? validateOwnerDetails() : [];
  if (!requirementsLoaded.value) errors.push('Document requirements could not be loaded. Refresh before submitting.');
  contactNumber.value = contactNumber.value.replace(/\s*\/\s*$/, ''); // a trailing separator is not a number
  const inputError = validateInput('property', { house_name: houseName.value, location: locationAddress.value, price: price.value, contact_number: contactNumber.value, latitude: latitude.value, longitude: longitude.value, advance_months: advanceMonths.value, deposit_months: depositMonths.value, deposit_type: depositType.value, description: description.value, map_link: mapLink.value });
  if (inputError) errors.push(inputError);
  criteria.value.forEach(p => {
    if (p.required && !permitHasFile(p.permit_key)) errors.push(`${p.label} document is required.`);
    if (permitHasFile(p.permit_key) && !permitExpiries.value[p.permit_key]) errors.push(`Expiration date is required for ${p.label}.`);
    const value = permitExpiries.value[p.permit_key];
    if (value && !isValidPermitDate(value)) errors.push(p.label + ' expiry date is invalid. Please enter a complete, valid date.');
  });

  // 1. Core Profile Details (Step 3)
  if (!houseName.value.trim()) {
    errors.push('Boarding House Name is required (Step 3).');
  }
  
  if (!contactNumber.value.trim()) {
    errors.push('Contact Phone Number is required (Step 3).');
  } else {
    const phoneRegex = /^[\d\s\/,\-\+\(\)]{7,100}$/;
    if (!phoneRegex.test(contactNumber.value.trim())) {
      errors.push('Contact Number must be a valid phone number or list of numbers (e.g., 09123456789 / 09987654321).');
    }
  }

  if (!price.value || parseFloat(price.value) <= 0) {
    errors.push('Rent Price must be a valid number greater than 0 (Step 3).');
  }

  // 2. High-Precision Map Coordinates (Step 3)
  if (!locationAddress.value.trim()) {
    errors.push('A valid property address is required. Please search or locate your property (Step 3).');
  }

  if (!latitude.value || !longitude.value || parseFloat(latitude.value) === 0 || parseFloat(longitude.value) === 0) {
    errors.push('Precise map pin coordinates are required. Please adjust or drag the pin on the map (Step 3).');
  } else if (pinNeedsConfirmation.value) {
    errors.push('The address text was changed but the map pin was not updated. Please select a suggestion from the dropdown, use GPS, or drag the pin to confirm the new location (Step 3).');
  }

  // 3. Featured Image (Step 2)
  if (!houseId.value && !mainHouseImg.value) {
    errors.push('Featured Main Exterior/Facade Image is required for new registration (Step 2).');
  }

  return includeOwnerStep ? errors.map(e => e.replace(/\(Step (\d)\)/, (m, n) => `(Step ${stepNumber(Number(n))})`)) : errors;
};

const referenceCopied = ref(false);
const copyReferenceNo = async () => {
  const r = submittedRegistration.value;
  if (!r) return;
  try {
    await navigator.clipboard.writeText(r.reference_no);
    referenceCopied.value = true;
  } catch {
    referenceCopied.value = false;
  }
};

// Handle Form Submission
const submitApplication = async () => {
  if (isPublicRegistration && !verifiedApplicantEmail()) { errorMsg.value = 'Your email verification session expired. Request another link before submitting. Your application has not been submitted.'; verifiedEmail.value = ''; return; }
  validationErrors.value = [];
  successMsg.value = '';
  errorMsg.value = '';

  const errors = validateForm();
  if (errors.length > 0) {
    validationErrors.value = errors;
    flashValidationErrors(errors);
    return;
  }

  isSaving.value = true;

  try {
    const fd = new FormData();
    fd.append('house_name', houseName.value);
    fd.append('contact_number', contactNumber.value);
    fd.append('price', price.value);
    fd.append('advance_months', advanceMonths.value);
    fd.append('deposit_months', depositMonths.value);
    fd.append('deposit_type', depositType.value);
    fd.append('location', locationAddress.value);
    fd.append('barangay', selectedBarangay.value || '');
    fd.append('map_link', mapLink.value);
    fd.append('latitude', latitude.value);
    fd.append('longitude', longitude.value);
    fd.append('description', description.value);
    
    fd.append('amenities_free', JSON.stringify(selectedFree.value));
    fd.append('amenities_paid', JSON.stringify(selectedPaid.value));

    if (houseId.value && !isPublicRegistration) {
      fd.append('house_id', houseId.value);
    }

    if (mainHouseImg.value) {
      fd.append('house_img', mainHouseImg.value);
    }

    // Append remaining database-stored extra images — pass the full stored value (Cloudinary URL or legacy filename)
    const keptPhotos = selectedPhotos.value.filter(p => !p.file && p.dbValue);
    fd.append('existing_photos', JSON.stringify(keptPhotos.map(p => p.dbValue)));

    // Append newly uploaded extra photos
    const newPhotos = selectedPhotos.value.filter(p => p.file);
    newPhotos.forEach(photoObj => fd.append('house_photos', photoObj.file));
    // Gallery categories in the same order the server combines photos (kept first, then new)
    fd.append('house_photo_categories', JSON.stringify([...keptPhotos, ...newPhotos].map(p => p.category || null)));

    // Append legal permit files and expiries dynamically
    criteria.value.forEach(p => {
      const selected = permitFiles.value[p.permit_key];
      const expiry = permitExpiries.value[p.permit_key];
      (Array.isArray(selected) ? selected : (selected ? [selected] : [])).forEach(file => fd.append(p.permit_key, file));
      if (expiry) {
        fd.append(`expiry_${p.permit_key}`, expiry);
      }
    });

    if (applicantMode) {
      const url = applicantEditRef ? `/api/applications/${encodeURIComponent(applicantEditRef)}/update` : '/api/applications/new';
      const response = await axios.post(url, fd, { headers: { ...applicantHeaders(), 'Content-Type': 'multipart/form-data' } });
      if (response.data.success) {
        router.push({ path: '/track', query: applicantEditRef
          ? { updated: applicantEditRef, status: response.data.status }
          : { submitted: response.data.reference_no } });
      }
      return;
    }

    if (isPublicRegistration) {
      fd.append('owner_name', ownerName.value.trim());
      fd.append('owner_email', ownerEmail.value.trim());
      fd.append('owner_phone', ownerPhone.value.trim());
      fd.append('owner_address', ownerAddress.value.trim());

      const response = await axios.post(`/api/boarding-houses/register-property`, fd, {
        headers: { ...applicantHeaders(), 'Content-Type': 'multipart/form-data' }
      });
      if (response.data.success) {
        const referenceNo = response.data.reference_no;
        discardDraft();
        try {
          // Open Track My Application for the new reference right away.
          setApplicantToken(response.data.token);
          router.push({ path: '/track', query: { submitted: referenceNo } });
        } catch {
          // Tracking could not be opened automatically: show the reference on the confirmation screen.
          submittedRegistration.value = { mode: 'new', reference_no: referenceNo, house_name: houseName.value };
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
      return;
    }

    const response = await axios.post(`/api/boarding-houses/accreditation`, fd, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      }
    });

    if (response.data.success) {
      discardDraft();
      const isAlreadyAccredited = currentUser.value.houseStatus === 'accredited';
      const successNotice = isAlreadyAccredited
        ? 'New boarding house application submitted! Awaiting SASO approval.'
        : 'Onboarding complete! Awaiting SASO approval.';

      successMsg.value = successNotice;
      if (alertRef.value) {
        alertRef.value.showSystemAlert(successNotice, 'success');
      }

      const freshHouseStatus = isAlreadyAccredited ? 'accredited' : 'pending';
      const updatedUser = { ...currentUser.value, houseStatus: freshHouseStatus, houseId: response.data.houseId };
      sessionStorage.setItem('cspc_user', JSON.stringify(updatedUser));

      setTimeout(() => {
        if (isAlreadyAccredited) {
          router.push('/owner/dashboard');
        } else {
          router.push('/owner/pending-review');
        }
      }, 1500);
    }
  } catch (err) {
    console.error(err);
    if (applicantMode && err.response?.status === 401) { router.replace('/track'); return; }
    errorMsg.value = err.response?.data?.message || 'Accreditation application failed. Please verify files and try again.';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    isSaving.value = false;
  }
};
</script>


<template>
  <div class="management-page management-form-page bg-[#eef6ff] min-h-screen font-sans pb-24" :class="{ 'registration-compact': useRegistrationLayout, 'registration-in-portal': isPortalRegistration, 'registration-details-fit': fitDetailsStep }">
    <div aria-live="polite" aria-atomic="false"><FlashAlert ref="alertRef" /></div>
    <!-- Navbar (the public registration page is a focused, full-width flow) -->
    <OwnerNav v-if="!isPublicRegistration" />
    <header v-else class="registration-topbar">
      <nav class="registration-breadcrumb" aria-label="Breadcrumb">
        <span class="hidden sm:inline">Boarding House Owner</span>
        <span class="registration-breadcrumb-sep hidden sm:inline" aria-hidden="true">/</span>
        <strong aria-current="page">{{ breadcrumbTitle }}</strong>
      </nav>
      <div class="registration-topbar-actions">
        <router-link v-if="applicantMode" to="/track"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span class="hidden md:inline">My applications</span></router-link>
        <router-link v-if="!applicantMode" to="/track" class="registration-login"><i class="fa-solid fa-magnifying-glass-location" aria-hidden="true"></i><span class="hidden md:inline">Track my application</span></router-link>
      </div>
    </header>

    <!-- Fullscreen Large Map Verification Modal -->
    <div v-management-dialog="{ close: () => toggleFullscreenMap() }" v-if="showFullscreenMap" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex flex-col p-6 md:p-10 animate-fade-in">
      <div class="max-w-6xl mx-auto w-full h-full flex flex-col bg-white rounded-[3rem] overflow-hidden shadow-2xl relative">
        <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 class="text-xl font-semibold text-slate-900 uppercase tracking-tight">Pin Your Location</h3>
            <p class="text-[12px] font-bold text-slate-400 uppercase tracking-wide">Click exactly where your boarding house is located</p>
          </div>
          <button aria-label="Close dialog" type="button" @click="toggleFullscreenMap" class="bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 w-12 h-12 rounded-2xl flex items-center justify-center transition-all management-button">
            <i class="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>
        <div ref="largeMapContainer" class="flex-1 bg-slate-100"></div>
        <div class="p-6 bg-white border-t border-slate-100 flex justify-center">
          <button type="button" @click="toggleFullscreenMap" class="bg-blue-600 text-white font-semibold px-12 py-4 rounded-2xl uppercase text-[12px] tracking-normal shadow-xl hover:bg-black transition-all management-button management-button-primary">
            Save &amp; Confirm Location
          </button>
        </div>
      </div>
    </div>

    <!-- Main Workspace container -->
    <main id="management-content" tabindex="-1" class="max-w-4xl mx-auto py-16 px-6">
      

      <!-- Public registration submitted: reference number and next steps -->
      <div v-if="submittedRegistration" class="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10 text-center animate-fade-in" role="status">
        <div class="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-4">
          <i class="fa-solid fa-circle-check text-2xl" aria-hidden="true"></i>
        </div>
        <h1 class="text-2xl font-semibold text-slate-900">
          {{ submittedRegistration.mode === 'edit' ? (submittedRegistration.status === 'RESUBMITTED' ? 'Revision resubmitted' : 'Changes saved') : 'Application submitted' }}
        </h1>
        <p class="text-slate-500 text-sm mt-2 max-w-lg mx-auto">
          <strong class="text-slate-800">{{ submittedRegistration.house_name }}</strong>
          {{ submittedRegistration.mode === 'edit' ? '— ' + (submittedRegistration.message || 'saved.') : 'has been sent to SASO for review.' }}
        </p>

        <div class="mt-6 bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 max-w-sm mx-auto">
          <p class="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">Reference No.</p>
          <p class="text-2xl font-bold text-[#1e4a8d] tracking-wider mt-1 select-all font-mono">{{ submittedRegistration.reference_no }}</p>
          <button type="button" @click="copyReferenceNo" class="mt-2 text-[13px] font-semibold text-[#1e4a8d] hover:underline">
            <i :class="['fa-solid mr-1', referenceCopied ? 'fa-check' : 'fa-copy']" aria-hidden="true"></i>{{ referenceCopied ? 'Copied' : 'Copy reference number' }}
          </button>
        </div>
        <p v-if="submittedRegistration.mode !== 'edit'" class="mt-3 max-w-md mx-auto text-[13px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-left">
          <i class="fa-solid fa-triangle-exclamation mr-1" aria-hidden="true"></i>Save this reference number to identify your property application. Access to tracking requires verification of your registered email.</p>

        <ol v-if="submittedRegistration.mode !== 'edit'" class="mt-6 text-left max-w-md mx-auto space-y-2 text-sm text-slate-600">
          <li class="flex gap-3"><span class="font-semibold text-[#1e4a8d]">1.</span> SASO reviews your property and documents. You can edit it until the review starts.</li>
          <li class="flex gap-3"><span class="font-semibold text-[#1e4a8d]">2.</span> If SASO asks for changes, update and resubmit from Track My Application.</li>
          <li class="flex gap-3"><span class="font-semibold text-[#1e4a8d]">3.</span> Once approved, activate your owner account and set your own password.</li>
        </ol>
        <router-link to="/track" class="inline-block mt-6 bg-[#1e4a8d] hover:bg-black text-white font-semibold py-3 px-8 rounded-xl text-sm transition management-button management-button-primary">
          Go to Track My Application
        </router-link>
      </div>

      <template v-else>

      <div v-if="googleRedirectNotice" class="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-blue-900 text-sm font-medium text-left">
        <i class="fa-solid fa-circle-info mr-2"></i>
        No owner account was found for that Google account. Please register your property first. After SASO approves it, you can activate your owner account.
      </div>


      <div v-if="editLocked" role="alert" class="mb-3 bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700">
        <i class="fa-solid fa-lock mr-1.5" aria-hidden="true"></i>{{ editLocked }}
        <router-link to="/track" class="ml-1 font-semibold text-[#1e4a8d] hover:underline">Back to my applications</router-link>
      </div>
      <div v-if="applicantRemarks" class="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900">
        <p class="font-semibold text-[12px] uppercase tracking-wide mb-1"><i class="fa-solid fa-comment-dots mr-1" aria-hidden="true"></i>SASO revision remarks</p>
        <p class="whitespace-pre-line">{{ applicantRemarks }}</p>
      </div>

      <nav v-if="useRegistrationLayout" class="registration-progress" aria-label="Registration progress">
        <ol class="flex items-start justify-center">
          <li v-for="step in steps" :key="step" class="flex items-start">
            <div class="flex flex-col items-center gap-1 w-10 sm:w-24">
              <span
                :aria-current="activeStep === step ? 'step' : undefined"
                :class="[
                  activeStep === step ? 'registration-step-active' : activeStep > step ? 'registration-step-done' : 'registration-step-todo',
                  'w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px]'
                ]"
              >
                <i v-if="activeStep > step" class="fa-solid fa-check" aria-hidden="true" />
                <span v-else>{{ stepNumber(step) }}</span>
              </span>
              <span class="hidden sm:block text-[11.5px] font-semibold text-center leading-tight" :class="activeStep === step ? 'text-[#142b4a]' : activeStep > step ? 'text-green-700' : 'text-slate-400'">{{ stepShortTitles[step] }}</span>
            </div>
            <span v-if="step < 4" class="h-0.5 w-4 sm:w-12 mt-4 rounded-full" :class="activeStep > step ? 'bg-green-400' : 'bg-slate-200'"></span>
          </li>
        </ol>
      </nav>

      <template v-else>
      <div class="text-center mb-10">
        <PageHeader title="Property accreditation" />
      </div>

      <!-- Stepper Progress Indicator -->
      <div class="mb-6 flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm max-w-xl mx-auto">
        <div
          v-for="step in steps"
          :key="step"
          class="flex items-center"
        >
          <!-- Step Circle -->
          <button
            type="button"
            :aria-current="activeStep === step ? 'step' : undefined"
            @click="activeStep = step"
            :class="[
              activeStep === step ? 'bg-[#1e4a8d] text-white' : activeStep > step ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-400',
              'w-10 h-10 rounded-full flex items-center justify-center font-black text-xs transition duration-300'
            ]"
          >
            <i v-if="activeStep > step" class="fa-solid fa-check" />
            <span v-else>{{ stepNumber(step) }}</span>
          </button>

          <!-- Connecting Line -->
          <div
            v-if="step < 4"
            class="h-1 w-10 sm:w-16 mx-2 rounded-full"
            :class="activeStep > step ? 'bg-green-400' : 'bg-slate-100'"
          ></div>
        </div>
      </div>

      <p class="text-center text-slate-500 font-bold uppercase text-[12px] tracking-normal mb-12">
        Step {{ stepNumber(activeStep) }}: {{ stepTitles[activeStep] }}
      </p>
      </template>


      <!-- Backend Success Banner -->
      <div v-if="successMsg" class="mb-10 bg-emerald-50 border-2 border-emerald-200 rounded-[2.5rem] p-8 text-emerald-800 text-center font-bold text-sm">
        <i class="fa-solid fa-circle-check mr-2"></i> {{ successMsg }}
      </div>

      <!-- Backend Error Banner -->
      <div v-if="errorMsg" class="mb-10 bg-rose-50 border-2 border-rose-200 rounded-[2.5rem] p-8 text-rose-800 text-center font-bold text-sm">
        <i class="fa-solid fa-triangle-exclamation mr-2"></i> {{ errorMsg }}
      </div>

      <!-- Rejection Alert -->
      <div v-if="isRejected" class="mb-10 bg-[#fff1f2] border-2 border-[#fecaca] rounded-[2.5rem] p-10 shadow-sm relative overflow-hidden">
        <div class="flex items-start gap-8 relative z-10">
          <div class="bg-[#ef4444] text-white w-16 h-16 rounded-[1.5rem] flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-200">
            <i class="fa-solid fa-circle-exclamation text-2xl"></i>
          </div>
          <div class="grow">
            <h3 class="text-[#991b1b] font-semibold uppercase text-xl tracking-tight mb-1">Application Rejected</h3>
            <p class="text-[#ef4444] text-[12px] font-bold uppercase tracking-normal mb-6">Please review the comments from SASO Admin below:</p>
            <div class="bg-white/90 border-2 border-[#fee2e2] rounded-[1.8rem] p-8 text-slate-700 text-sm font-medium italic shadow-inner mb-6">
              "{{ adminComments || 'No comments left.' }}"
            </div>
            <div class="flex items-center gap-3 text-[#ef4444]">
              <div class="w-2 h-2 bg-[#ef4444] rounded-full animate-ping"></div>
              <p class="text-[12px] font-semibold uppercase tracking-wide leading-relaxed">
                <i class="fa-solid fa-info-circle mr-1"></i> Correct the details and resubmit below.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading State Indicator (PWA Bulletproof inline SVG Loader) -->
      <div v-show="isLoading" class="py-20 flex flex-col items-center justify-center gap-3 bg-white rounded-[2rem] shadow-sm border border-slate-200 p-10">
        <svg class="animate-spin h-10 w-10 text-[#1e4a8d] mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-slate-400 font-bold uppercase text-[12px] tracking-wide">Loading application config details...</p>
      </div>

      <!-- Use v-show so that map Container and input are instantly available on mount -->
      <ApplicantEmailGate v-if="isPublicRegistration && !verifiedEmail" />
      <form v-show="!isLoading && (!isPublicRegistration || verifiedEmail)" @submit.prevent="submitApplication" class="space-y-10" novalidate>
        
        <!-- ================= STEP 0: OWNER INFORMATION (public registration) ================= -->
        <div v-if="includeOwnerStep" v-show="activeStep === 0" class="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 sm:p-10 animate-fade-in text-left">
          <div class="flex items-center gap-4 mb-8 border-b border-slate-100 pb-6">
            <div class="bg-blue-600 text-white w-10 h-10 rounded-xl flex items-center justify-center font-semibold shadow-sm">1</div>
            <h2 class="text-sm font-semibold text-slate-900 uppercase tracking-wider">Owner Information</h2>
          </div>
          <div class="registration-owner grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-6">
            <div class="space-y-4">
              <h3 class="registration-section-title">Contact details</h3>
              <div>
                <label for="owner-name" class="registration-label">Full name <span class="text-red-500">*</span></label>
                <input id="owner-name" v-model="ownerName" type="text" maxlength="255" autocomplete="name" placeholder="Juan Dela Cruz"
                  class="w-full bg-slate-50 border rounded-lg text-sm font-semibold focus:bg-white focus:border-blue-500 outline-none transition" :class="ownerErrors.name ? 'border-red-400' : 'border-slate-200'" />
                <p v-if="ownerErrors.name" class="text-red-500 text-[12px] font-bold mt-1">{{ ownerErrors.name }}</p>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label for="owner-email" class="registration-label">{{ isPublicRegistration ? 'Verified email address' : 'Gmail address' }} <span class="text-red-500">*</span></label>
                  <input v-if="isPublicRegistration" id="owner-email" :value="ownerEmail" readonly class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-3 text-sm" />
                  <div v-else class="gmail-field" :class="ownerErrors.email ? 'is-error' : ''">
                    <input id="owner-email" v-model="ownerEmailName" @input="sanitizeOwnerEmailName" type="text" maxlength="64" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="yourname" aria-describedby="owner-email-domain"
                      class="flex-1 min-w-0 bg-transparent border-0 text-sm font-semibold outline-none" />
                    <span id="owner-email-domain" class="gmail-domain">@gmail.com</span>
                  </div>
                  <p v-if="ownerErrors.email" class="text-red-500 text-[12px] font-bold mt-1">{{ ownerErrors.email }}</p>
                </div>
                <div>
                  <label for="owner-phone" class="registration-label">Mobile number <span class="text-red-500">*</span></label>
                  <input id="owner-phone" v-model="ownerPhone" @input="sanitizeOwnerPhone" type="text" inputmode="numeric" maxlength="11" autocomplete="tel" placeholder="09XXXXXXXXX"
                    class="w-full bg-slate-50 border rounded-lg text-sm font-semibold focus:bg-white focus:border-blue-500 outline-none transition" :class="ownerErrors.phone ? 'border-red-400' : 'border-slate-200'" />
                  <p v-if="ownerErrors.phone" class="text-red-500 text-[12px] font-bold mt-1">{{ ownerErrors.phone }}</p>
                </div>
              </div>
              <p class="text-[12px] text-slate-500"><i class="fa-solid fa-circle-info mr-1 text-blue-500" aria-hidden="true"></i>Your email becomes your owner login after approval. After you submit, you go straight to Track My Application with your reference number.</p>
            </div>

            <fieldset class="space-y-4 min-w-0">
              <legend class="registration-section-title">Residential address <span class="text-red-500">*</span></legend>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label for="owner-region" class="registration-label">Region</label>
                  <DropdownSelect id="owner-region" v-model="regionCode" @change="onRegionChange"
                    :options="regionOptions.map(r => ({ value: r.code, label: r.label }))"
                    :placeholder="addressLoading === 'region' ? 'Loading…' : 'Select region'"
                    :invalid="!!(ownerErrors.address && !regionCode)" trigger-class="w-full bg-slate-50 border rounded-lg text-sm font-semibold focus:bg-white focus:border-blue-500 outline-none transition border-slate-200" />
                </div>
                <div>
                  <label for="owner-province" class="registration-label">Province</label>
                  <DropdownSelect id="owner-province" v-model="provinceCode" @change="onProvinceChange"
                    :disabled="!regionCode || !regionHasProvinces || addressLoading === 'province'"
                    :options="provinceOptions.map(o => ({ value: o.code, label: o.name }))"
                    :placeholder="addressLoading === 'province' ? 'Loading…' : (regionCode && !regionHasProvinces ? 'Not applicable' : 'Select province')"
                    :invalid="!!(ownerErrors.address && regionCode && regionHasProvinces && !provinceCode)" trigger-class="w-full bg-slate-50 border rounded-lg text-sm font-semibold focus:bg-white focus:border-blue-500 outline-none transition border-slate-200" />
                </div>
                <div>
                  <label for="owner-city" class="registration-label">City / Municipality</label>
                  <DropdownSelect id="owner-city" v-model="cityCode" @change="onCityChange"
                    :disabled="!cityOptions.length || addressLoading === 'city'"
                    :options="cityOptions.map(o => ({ value: o.code, label: o.name }))"
                    :placeholder="addressLoading === 'city' ? 'Loading…' : 'Select city / municipality'"
                    :invalid="!!(ownerErrors.address && cityOptions.length && !cityCode)" trigger-class="w-full bg-slate-50 border rounded-lg text-sm font-semibold focus:bg-white focus:border-blue-500 outline-none transition border-slate-200" />
                </div>
                <div>
                  <label for="owner-barangay" class="registration-label">Barangay</label>
                  <DropdownSelect id="owner-barangay" v-model="barangayCode"
                    :disabled="!barangayOptions.length || addressLoading === 'barangay'"
                    :options="barangayOptions.map(o => ({ value: o.code, label: o.name }))"
                    :placeholder="addressLoading === 'barangay' ? 'Loading…' : 'Select barangay'"
                    :invalid="!!(ownerErrors.address && barangayOptions.length && !barangayCode)" trigger-class="w-full bg-slate-50 border rounded-lg text-sm font-semibold focus:bg-white focus:border-blue-500 outline-none transition border-slate-200" />
                </div>
              </div>
              <div>
                <label for="owner-street" class="registration-label">House no., street, purok <span class="font-normal text-slate-400">(optional)</span></label>
                <input id="owner-street" v-model="addressStreet" type="text" maxlength="255" autocomplete="address-line1" placeholder="e.g. 12 Rizal St., Purok 2"
                  class="w-full bg-slate-50 border rounded-lg text-sm font-semibold focus:bg-white focus:border-blue-500 outline-none transition border-slate-200" />
              </div>
              <p v-if="ownerErrors.address" class="text-red-500 text-[12px] font-bold">{{ ownerErrors.address }}</p>
              <p v-else-if="addressLoadError" class="text-amber-600 text-[12px] font-bold">{{ addressLoadError }}</p>
              <p v-else-if="ownerAddress" class="text-slate-500 text-[12px] font-medium"><i class="fa-solid fa-location-dot mr-1" aria-hidden="true"></i>{{ ownerAddress }}</p>
            </fieldset>
          </div>
        </div>

        <!-- ================= STEP 1: MANDATORY PERMITS ================= -->
        <div v-show="activeStep === 1" class="registration-legal bg-white rounded-3xl shadow-sm border border-slate-200 p-8 sm:p-10 animate-fade-in text-left">
          <div class="legal-fit">
          <div class="flex items-center gap-4 mb-8 border-b border-slate-100 pb-6">
            <div class="bg-blue-600 text-white w-10 h-10 rounded-xl flex items-center justify-center font-semibold shadow-sm">{{ stepNumber(1) }}</div>
            <div>
              <h2 class="text-sm font-semibold text-slate-900 uppercase tracking-wider">Legal Permits &amp; Clearances</h2>
              <p class="text-xs text-slate-500 font-medium mt-0.5">Please provide the 4 mandatory permits and any additional supporting documents.</p>
            </div>
          </div>


          <div class="dt-card">
            <TablePager position="top" noun="documents" :page="docPage" @update:page="docPage = $event" :total-pages="docTotalPages" :start="docStart" :end="docEnd" :total="allPermits.length" :per-page="docPerPage" @update:per-page="docPerPage = $event; docPage = 1" />
            <!-- Each group title sits above its own column header -->
            <div v-for="section in docSections" :key="section.key" class="dt-group">
              <div class="dt-group-title"><i :class="['fa-solid', section.key === 'required' ? 'fa-shield-halved' : 'fa-folder-open']" aria-hidden="true"></i> {{ section.title }} <span>{{ section.note }}</span></div>
              <div class="dt-scroll">
                <table class="dt-table">
                  <thead>
                    <tr>
                      <th class="dt-col-num">#</th>
                      <th>Document<small>Legal permit / clearance</small></th>
                      <th>File<small>PDF or image · up to 5</small></th>
                      <th>Expiration date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="p in section.items" :key="p.id" :class="['dt-row', 'is-' + permitStatus(p.permit_key).tone]">
                      <td class="dt-col-num" data-label="#">{{ p.number }}</td>
                      <td data-label="Document">
                        <span class="dt-name">{{ p.label }}</span>
                        <span :class="['dt-pill', p.required ? 'is-required' : '']">{{ p.required ? 'Required' : 'Optional' }}</span>
                      </td>
                      <td data-label="File">
                        <div class="dt-file">
                          <!-- The invisible file input covers the button, so click and drag-and-drop both work -->
                          <span class="dt-upload">
                            <input type="file" multiple accept="image/*,application/pdf,.pdf" :aria-label="'Upload ' + p.label" @change="(e) => handlePermitFile(p.permit_key, e)" />
                            <i class="fa-solid fa-arrow-up-from-bracket" aria-hidden="true"></i> {{ permitFiles[p.permit_key]?.length ? 'Replace' : 'Upload' }}
                          </span>
                          <span v-if="permitFiles[p.permit_key]?.length" class="dt-file-text is-ok" :title="permitFiles[p.permit_key].map(f => f.name).join(', ')">
                            <i :class="['fa-solid', isPdfUpload(permitFiles[p.permit_key][0]) ? 'fa-file-pdf' : 'fa-file-image']" aria-hidden="true"></i>
                            {{ permitFiles[p.permit_key].length > 1 ? permitFiles[p.permit_key].length + ' files' : permitFiles[p.permit_key][0].name }}
                            <small>{{ formatFileSize(permitFiles[p.permit_key].reduce((t, f) => t + f.size, 0)) }}</small>
                          </span>
                          <span v-else-if="existingFiles[p.permit_key]" class="dt-file-text is-ok">
                            <i class="fa-solid fa-circle-check" aria-hidden="true"></i> On file · <a :href="getImageUrl(existingFiles[p.permit_key])" target="_blank" rel="noopener">View</a>
                          </span>
                          <span v-else-if="!permitFileErrors[p.permit_key]" class="dt-file-text">No file chosen</span>
                        </div>
                        <p v-if="permitFileErrors[p.permit_key]" class="dt-cell-error">{{ permitFileErrors[p.permit_key] }}</p>
                      </td>
                      <td data-label="Expiration date">
                        <input type="date" :class="['dt-date', permitExpiryErrors[p.permit_key] ? 'is-invalid' : '']" min="1000-01-01" max="9999-12-31" v-model="permitExpiries[p.permit_key]" :aria-label="'Expiration date of ' + p.label" :aria-invalid="!!permitExpiryErrors[p.permit_key]" />
                        <p v-if="permitExpiryErrors[p.permit_key]" class="dt-cell-error">{{ permitExpiryErrors[p.permit_key] }}</p>
                      </td>
                      <td data-label="Status">
                        <span :class="['dt-status', 'is-' + permitStatus(p.permit_key).tone]">
                          <i :class="['fa-solid', { done: 'fa-circle-check', partial: 'fa-clock', error: 'fa-circle-exclamation', empty: 'fa-circle' }[permitStatus(p.permit_key).tone]]" aria-hidden="true"></i>
                          {{ { done: 'Complete', partial: permitExpiries[p.permit_key] ? 'In progress' : 'Add expiry date', error: 'Needs attention', empty: p.required ? 'Missing' : 'Optional' }[permitStatus(p.permit_key).tone] }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <TablePager position="bottom" noun="documents" :page="docPage" @update:page="docPage = $event" :total-pages="docTotalPages" :start="docStart" :end="docEnd" :total="allPermits.length" :per-page="docPerPage" @update:per-page="docPerPage = $event; docPage = 1" />
          </div>
          <p class="dt-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Accepted formats: PNG, JPG, JPEG, WEBP, HEIC or PDF — up to 5 files per document, 10 MB each. You can also drag files onto the Upload button.</p>
          </div>
        </div>

        <!-- ================= STEP 2: DYNAMIC PROPERTY PHOTOS ================= -->
        <div v-show="activeStep === 2" class="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-10 animate-fade-in text-left">
          <div class="flex items-center gap-4 mb-8 border-b border-slate-50 pb-6">
            <div class="bg-green-100 text-green-600 w-10 h-10 rounded-full flex items-center justify-center font-semibold">{{ stepNumber(2) }}</div>
            <h2 class="text-xs font-semibold text-slate-900 uppercase tracking-normal">Property Photos</h2>
          </div>
          
          <div v-if="!useRegistrationLayout" class="space-y-8">
            <!-- Main Featured Image -->
            <div>
              <label class="block text-[12px] font-semibold uppercase mb-3 ml-1" :class="mainImgError ? 'text-red-600' : 'text-slate-400'">Featured Main Image (Facade/Exterior)</label>
              <div 
                class="border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer relative"
                :class="mainImgError ? 'bg-red-50/50 border-red-400' : 'bg-slate-50 border-slate-200 hover:border-green-400'"
              >
                <input aria-label="Field" type="file" accept="image/*" @change="handleMainImg" class="w-full text-xs font-bold text-slate-500 file:mr-4 file:py-2 file:px-6 file:rounded-full file:border-0 file:text-[12px] file:font-semibold file:bg-green-600 file:text-white hover:file:bg-black transition cursor-pointer" />
                
                <p v-if="mainImgError" class="text-[12px] font-bold text-red-600 mt-2 flex items-center justify-center gap-1">
                  <i class="fa-solid fa-circle-exclamation"></i> {{ mainImgError }}
                </p>

                <!-- Main Image Preview Card -->
                <div v-if="mainHouseImgPreview" class="mt-4 max-w-xs mx-auto rounded-xl overflow-hidden border border-slate-200 shadow-sm relative group">
                  <img :src="mainHouseImgPreview" class="w-full h-48 object-cover" alt="Featured Exterior" />
                  <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
                    <span class="text-white text-[12px] font-semibold uppercase tracking-wide bg-black/60 px-3 py-1.5 rounded-full">Change Photo</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Dynamic Interior / Extra Photos Uploader -->
            <div class="border-t border-slate-100 pt-6">
              <label class="block text-[12px] font-semibold uppercase mb-3 ml-1" :class="photosError ? 'text-red-600' : 'text-slate-400'">Property Gallery Showcase (Upload up to 10 photos of rooms, amenities, and common areas)</label>
              
              <div 
                class="flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-6 transition cursor-pointer mb-6"
                :class="photosError ? 'bg-red-50/50 border-red-400' : 'bg-slate-50 border-slate-200 hover:border-blue-400'"
              >
                <input aria-label="Field" 
                  type="file" 
                  multiple 
                  accept="image/*"
                  @change="handlePhotosSelected" 
                  class="w-full text-xs font-bold text-slate-500 file:mr-4 file:py-2 file:px-6 file:rounded-full file:border-0 file:text-[12px] file:font-semibold file:bg-[#2a528a] file:text-white hover:file:bg-black transition cursor-pointer"
                />
                <p v-if="photosError" class="text-[12px] font-bold text-red-600 mt-2 flex items-center justify-center gap-1">
                  <i class="fa-solid fa-circle-exclamation"></i> {{ photosError }}
                </p>
              </div>

              <!-- Interactive Previews Grid with Delete option -->
              <div v-if="selectedPhotos.length > 0" class="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <div 
                  v-for="(photo, index) in selectedPhotos" 
                  :key="index" 
                  class="relative rounded-xl overflow-hidden aspect-square border border-slate-200 group"
                >
                  <img :src="photo.previewUrl" class="w-full h-full object-cover" alt="Interior Preview" />
                  <button aria-label="remove Photo" 
                    type="button" 
                    @click="removePhoto(index)" 
                    class="absolute top-2 right-2 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-700 management-button"
                  >
                    <i class="fa-solid fa-trash text-xs" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="registration-photos grid grid-cols-1 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] gap-6">
            <!-- Featured photo -->
            <section aria-labelledby="featured-photo-title" class="min-w-0">
              <div class="flex items-center justify-between gap-2 mb-2">
                <h3 id="featured-photo-title" class="registration-section-title !mb-0">Featured photo <span class="text-red-500">*</span></h3>
                <span class="registration-featured-badge"><i class="fa-solid fa-star" aria-hidden="true"></i> Featured</span>
              </div>
              <div class="registration-photo-frame" :class="mainImgError ? 'ring-2 ring-red-400' : ''">
                <img :src="mainHouseImgPreview || featuredPhotoExample" :alt="mainHouseImgPreview ? 'Selected featured photo' : 'Example featured photo: the full front of a two-storey boarding house, taken in daylight'" />
                <span v-if="!mainHouseImgPreview" class="registration-example-badge">Example</span>
              </div>
              <div class="flex flex-wrap items-center gap-2 mt-3">
                <label class="registration-upload-button">
                  <input type="file" accept="image/*" class="sr-only" @change="handleMainImg" />
                  <i class="fa-solid fa-upload" aria-hidden="true"></i> {{ mainHouseImgPreview ? 'Replace photo' : 'Choose photo' }}
                </label>
                <button v-if="mainHouseImg" type="button" @click="clearMainImg" class="text-[13px] font-semibold text-rose-600 hover:underline">Remove</button>
              </div>
              <p v-if="mainImgError" class="text-[12px] font-bold text-red-600 mt-2"><i class="fa-solid fa-circle-exclamation mr-1" aria-hidden="true"></i>{{ mainImgError }}</p>
              <p v-else class="text-[12px] text-slate-500 mt-2">A clear daytime photo of the whole front of the building. This is the main photo students see.</p>
            </section>

            <!-- Categorized gallery -->
            <section aria-labelledby="gallery-title" class="min-w-0">
              <div class="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <h3 id="gallery-title" class="registration-section-title !mb-0">Property gallery <span class="font-normal text-slate-400">(optional)</span></h3>
                <span class="text-[12px] font-semibold text-slate-500">{{ selectedPhotos.length }} / {{ maxPhotosLimit }} photos</span>
              </div>
              <p v-if="photosError" role="alert" class="text-[12px] font-bold text-red-600 mb-2"><i class="fa-solid fa-circle-exclamation mr-1" aria-hidden="true"></i>{{ photosError }}</p>
              <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                <div v-for="cat in photoCategories" :key="cat.key" class="registration-category">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="text-[13px] font-semibold text-[#142b4a]">{{ cat.label }}</p>
                      <p class="text-[11px] text-slate-500 leading-snug">{{ cat.hint }}</p>
                    </div>
                    <label class="registration-upload-button small" :class="selectedPhotos.length >= maxPhotosLimit ? 'opacity-50 pointer-events-none' : ''">
                      <input type="file" multiple accept="image/*" class="sr-only" :aria-label="'Add ' + cat.label + ' photos'" @change="(e) => handlePhotosSelected(e, cat.key)" />
                      <i class="fa-solid fa-plus" aria-hidden="true"></i> Add
                    </label>
                  </div>
                  <div class="grid grid-cols-3 gap-1.5 mt-2">
                    <div v-for="item in photosIn(cat.key)" :key="item.photo.previewUrl" class="registration-thumb group">
                      <img :src="item.photo.previewUrl" :alt="cat.label + ' photo'" />
                      <button type="button" @click="removePhoto(item.index)" :aria-label="'Remove ' + cat.label + ' photo'" class="registration-thumb-remove"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                    </div>
                    <div v-if="photosIn(cat.key).length === 0" class="registration-thumb col-span-3 sample">
                      <img :src="cat.sample" :alt="'Example ' + cat.label.toLowerCase() + ' photo'" />
                      <span class="registration-example-badge">Example</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        <!-- ================= STEP 3: CORE INFO & 3-WAY MAP ================= -->
        <div v-show="activeStep === 3" class="registration-details bg-white rounded-[2rem] shadow-sm border border-slate-200 p-10 animate-fade-in text-left">
          <div class="flex items-center gap-4 mb-8 border-b border-slate-50 pb-6">
            <div class="bg-purple-100 text-purple-600 w-10 h-10 rounded-full flex items-center justify-center font-semibold">{{ stepNumber(3) }}</div>
            <h2 class="text-xs font-semibold text-slate-900 uppercase tracking-normal">Boarding House Details</h2>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6" :class="{ 'xl:grid-cols-4': useRegistrationLayout }">
            <div class="md:col-span-2">
              <label class="block text-[12px] font-semibold uppercase mb-2 ml-1" :class="fieldErrors.houseName ? 'text-red-600' : 'text-slate-400'">Boarding House Name</label>
              <input aria-label="Boarding House Name" 
                type="text" 
                v-model="houseName" 
                @blur="validateField('houseName')" 
                @input="fieldErrors.houseName && validateField('houseName')"
                class="w-full p-4 rounded-xl text-sm font-bold outline-none transition border" 
                :class="fieldErrors.houseName ? 'bg-red-50 border-red-500 focus:border-red-500' : 'bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500'" 
                placeholder="E.g. Nabua Heights Residence" 
              />
              <p v-if="fieldErrors.houseName" class="text-[12px] font-bold text-red-600 mt-1 ml-1 flex items-center gap-1">
                <i class="fa-solid fa-circle-exclamation"></i> {{ fieldErrors.houseName }}
              </p>
            </div>

            <div :class="{ 'xl:col-span-2': useRegistrationLayout }">
              <label class="block text-[12px] font-semibold uppercase mb-2 ml-1" :class="fieldErrors.contactNumber ? 'text-red-600' : 'text-slate-400'">Contact Number</label>
              <input aria-label="Contact Number" 
                type="text" 
                inputmode="numeric"
                autocomplete="tel"
                maxlength="39"
                :value="contactNumber"
                @keypress="handleOwnerPhoneKeypress"
                @blur="validateField('contactNumber')" 
                @input="handleOwnerPhoneInput"
                class="w-full p-4 rounded-xl text-sm font-bold outline-none transition border" 
                :class="fieldErrors.contactNumber ? 'bg-red-50 border-red-500 focus:border-red-500' : 'bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500'" 
                placeholder="e.g. 09123456789 / 09987654321" 
              />
              <p v-if="fieldErrors.contactNumber" class="text-[12px] font-bold text-red-600 mt-1 ml-1 flex items-center gap-1">
                <i class="fa-solid fa-circle-exclamation"></i> {{ fieldErrors.contactNumber }}
              </p>
              <p v-else class="text-[12px] text-slate-400 font-bold mt-1.5 ml-1">
                <i class="fa-solid fa-circle-info text-blue-500 mr-1"></i> Up to 3 mobile numbers starting with 09 (11 digits each). The " / " is added for you after each number.
              </p>
            </div>

            <div>
              <label class="block text-[12px] font-semibold uppercase mb-2 ml-1" :class="fieldErrors.selectedBarangay ? 'text-red-600' : 'text-slate-400'">Official Barangay (Nabua)</label>
              <DropdownSelect aria-label="Official Barangay (Nabua)" v-model="selectedBarangay"
                @change="validateField('selectedBarangay')"
                :options="barangaysList.map(b => ({ value: b, label: b }))" placeholder="Select Barangay"
                :invalid="!!fieldErrors.selectedBarangay"
                :trigger-class="['w-full p-4 rounded-xl text-sm font-bold outline-none transition border', fieldErrors.selectedBarangay ? 'bg-red-50 border-red-500' : 'bg-slate-50 border-slate-200']" />
              <p v-if="fieldErrors.selectedBarangay" class="text-[12px] font-bold text-red-600 mt-1 ml-1 flex items-center gap-1">
                <i class="fa-solid fa-circle-exclamation"></i> {{ fieldErrors.selectedBarangay }}
              </p>
            </div>

            <div>
              <label class="block text-[12px] font-semibold uppercase mb-2 ml-1" :class="fieldErrors.price ? 'text-red-600' : 'text-slate-400'">Monthly Rent Price (₱)</label>
              <input aria-label="Monthly Rent Price (₱)" 
                type="number" min="0.01" max="99999999.99" step="0.01"
                v-model="price" 
                @blur="validateField('price')" 
                @input="fieldErrors.price && validateField('price')"
                class="w-full p-4 rounded-xl text-sm font-bold outline-none transition border" 
                :class="fieldErrors.price ? 'bg-red-50 border-red-500 focus:border-red-500' : 'bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500'" 
                placeholder="1500" 
              />
              <p v-if="fieldErrors.price" class="text-[12px] font-bold text-red-600 mt-1 ml-1 flex items-center gap-1">
                <i class="fa-solid fa-circle-exclamation"></i> {{ fieldErrors.price }}
              </p>
            </div>

            <!-- Advance & Deposit Policy -->
            <div class="md:col-span-2" :class="useRegistrationLayout ? '' : 'border-t border-slate-100 pt-6 mt-2'">
              <h3 class="text-xs font-semibold text-[#1e4a8d] uppercase tracking-normal mb-4 flex items-center gap-2">
                <i class="fa-solid fa-coins" /> Advance &amp; Deposit Policy
              </h3>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2 ml-1">Advance Rent</label>
                  <DropdownSelect aria-label="Advance Rent" v-model="advanceMonths" trigger-class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold outline-none transition"
                    :options="[{ value: '0', label: 'No Advance' }, { value: '1', label: '1 Month' }, { value: '2', label: '2 Months' }]" />
                </div>

                <div>
                  <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2 ml-1">Deposit Duration</label>
                  <DropdownSelect aria-label="Deposit Duration" v-model="depositMonths" trigger-class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold outline-none transition"
                    :options="[{ value: '0', label: 'No Deposit' }, { value: '1', label: '1 Month' }, { value: '2', label: '2 Months' }]" />
                </div>

                <div v-if="parseInt(depositMonths) > 0">
                  <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2 ml-1">Rent Deposit Type</label>
                  <DropdownSelect aria-label="Rent Deposit Type" v-model="depositType" trigger-class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold outline-none transition"
                    :options="[{ value: 'consumable', label: 'Consumable (Last Month)' }, { value: 'refundable', label: 'Refundable (Cash)' }]" />
                </div>
              </div>
            </div>

            <!-- 3-Way Location -->
            <div class="registration-location md:col-span-2" :class="useRegistrationLayout ? 'xl:col-start-3 xl:col-span-2 xl:row-start-1 xl:row-span-5' : 'border-t border-slate-100 pt-6 mt-4'">
              <h3 class="text-xs font-semibold text-[#1e4a8d] uppercase tracking-normal mb-6">
                <i class="fa-solid fa-map-location-dot" /> High-Precision Location Setup
              </h3>
              
              <div class="space-y-8 bg-slate-50/50 p-8 rounded-[2.5rem] border border-slate-100">
                <!-- STEP A: ADDRESS SEARCH -->
                <div>
                  <div class="flex items-center gap-3 mb-4">
                    <div class="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-semibold shadow-lg">A</div>
                    <label class="text-[12px] font-semibold text-slate-900 uppercase tracking-wide">Type your Property Address</label>
                  </div>
                  <div id="autocomplete-wrapper" class="w-full"></div>
                </div>

                <!-- STEP B: MAP VERIFICATION -->
                <div>
                  <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                    <div class="flex items-center gap-3">
                      <div class="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-semibold shadow-lg">B</div>
                      <label class="text-[12px] font-semibold text-slate-900 uppercase tracking-wide">Verify or Pin Exactly on Map</label>
                    </div>
                    <div class="flex gap-2">
                      <button 
                        type="button" 
                        @click="detectMyLocation" 
                        :disabled="isGpsLoading"
                        class="bg-white border border-slate-200 text-slate-600 text-[12px] font-semibold uppercase tracking-wide px-4 py-2 rounded-full shadow-sm hover:bg-blue-50 hover:text-blue-600 transition-all flex items-center gap-2 management-button management-button-secondary"
                      >
                        <i v-if="isGpsLoading" class="fa-solid fa-spinner fa-spin" />
                        <i v-else class="fa-solid fa-location-crosshairs" /> Use My Current GPS
                      </button>
                      <button 
                        type="button" 
                        @click="toggleFullscreenMap" 
                        class="bg-slate-900 text-white text-[12px] font-semibold uppercase tracking-wide px-4 py-2 rounded-full shadow-lg hover:bg-blue-600 transition-all flex items-center gap-2 management-button"
                      >
                        <i class="fa-solid fa-expand" /> Open Large Map
                      </button>
                    </div>
                  </div>

                  <div 
                    class="rounded-[2.5rem] overflow-hidden border-4 border-white shadow-xl w-full relative bg-slate-50 group cursor-pointer"
                    :class="useRegistrationLayout ? 'registration-map h-[280px]' : 'h-[380px] sm:h-[450px]'" 
                  >
                    <div ref="mapContainer" class="w-full h-full"></div>
                    <div class="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors flex items-center justify-center" @click="toggleFullscreenMap">
                      <span class="bg-white/90 backdrop-blur-md px-6 py-2.5 rounded-full text-[12px] font-semibold uppercase tracking-wide text-slate-600 shadow-xl border border-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                        <i class="fa-solid fa-hand-pointer" /> Click to Zoom &amp; Adjust Pin
                      </span>
                    </div>
                  </div>

                  <div v-if="pinNeedsConfirmation" class="mt-3 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <i class="fa-solid fa-triangle-exclamation text-amber-500 text-xs mt-0.5"></i>
                    <p class="text-[12px] font-bold text-amber-800 leading-snug">
                      Address text changed but the map pin hasn't moved yet. Select a suggestion from the dropdown, use GPS, or drag the pin — this is required before submitting.
                    </p>
                  </div>
                </div>

                <!-- STEP C removed: Google Maps short link extraction was unreliable.
                     Use GPS button or the Places search (Step A) instead. -->
              </div>
            </div>

            <!-- Hidden Coords inputs -->
            <input type="hidden" v-model="latitude" />
            <input type="hidden" v-model="longitude" />

            <div class="registration-description md:col-span-2">
              <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2 ml-1">Property Description &amp; Rules</label>
              <textarea aria-label="Property Description &amp;amp; Rules" v-model="description" :rows="useRegistrationLayout ? 2 : 4" class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" placeholder="Describe your rooms, house rules (curfews), and environment..."></textarea>
            </div>
          </div>
        </div>

        <!-- ================= STEP 4: AMENITIES CENTER ================= -->
        <div v-show="activeStep === 4" class="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-10 animate-fade-in text-left">
          <div class="flex items-center gap-4 mb-8 border-b border-slate-50 pb-6">
            <div class="bg-orange-100 text-orange-600 w-10 h-10 rounded-full flex items-center justify-center font-semibold">{{ stepNumber(4) }}</div>
            <h2 class="text-xs font-semibold text-slate-900 uppercase tracking-normal">Amenities &amp; Services</h2>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-12">
            <!-- Free Amenities -->
            <div>
              <div class="flex items-center justify-between mb-6">
                <p class="text-[12px] font-semibold text-slate-800 uppercase tracking-wide flex items-center gap-2">
                  <i class="fa-solid fa-gift text-green-500"></i> Free Amenities
                </p>
                <div class="flex gap-2">
                  <input aria-label="Add custom..." 
                    type="text" 
                    v-model="newFreeText" 
                    placeholder="Add custom..." 
                    class="w-32 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[12px] font-bold focus:border-green-400 outline-none"
                    @keyup.enter="addCustomAmenity('free')"
                  />
                  <button 
                    type="button" 
                    @click="addCustomAmenity('free')" 
                    class="bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1 rounded-lg text-[12px] font-semibold uppercase tracking-wider transition management-button"
                  >
                    Add
                  </button>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <label 
                  v-for="item in freeAmenities" 
                  :key="item"
                  class="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 cursor-pointer hover:bg-white hover:border-blue-400 transition group"
                >
                  <input aria-label="selected Free" type="checkbox" :value="item" v-model="selectedFree" class="w-4 h-4 rounded border-slate-300 accent-blue-600" />
                  <span class="text-[12px] font-bold text-slate-600 group-hover:text-blue-600">{{ item }}</span>
                </label>
                <!-- Custom Free items -->
                <label 
                  v-for="item in customFree" 
                  :key="item"
                  class="flex items-center gap-3 bg-white p-3 rounded-xl border border-blue-400 cursor-pointer transition group"
                >
                  <input aria-label="selected Free" type="checkbox" :value="item" v-model="selectedFree" class="w-4 h-4 rounded border-slate-300 accent-blue-600" />
                  <span class="text-[12px] font-bold text-slate-600 group-hover:text-blue-600">{{ item }}</span>
                </label>
              </div>
            </div>

            <!-- Paid Amenities -->
            <div>
              <div class="flex items-center justify-between mb-6">
                <p class="text-[12px] font-semibold text-slate-800 uppercase tracking-wide flex items-center gap-2">
                  <i class="fa-solid fa-coins text-orange-500"></i> Paid (Optional)
                </p>
                <div class="flex gap-2">
                  <input aria-label="Add custom..." 
                    type="text" 
                    v-model="newPaidText" 
                    placeholder="Add custom..." 
                    class="w-32 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[12px] font-bold focus:border-orange-400 outline-none"
                    @keyup.enter="addCustomAmenity('paid')"
                  />
                  <button 
                    type="button" 
                    @click="addCustomAmenity('paid')" 
                    class="bg-orange-100 text-orange-700 hover:bg-orange-200 px-3 py-1 rounded-lg text-[12px] font-semibold uppercase tracking-wider transition management-button"
                  >
                    Add
                  </button>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <label 
                  v-for="item in paidAmenities" 
                  :key="item"
                  class="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 cursor-pointer hover:bg-white hover:border-orange-400 transition group"
                >
                  <input aria-label="selected Paid" type="checkbox" :value="item" v-model="selectedPaid" class="w-4 h-4 rounded border-slate-300 accent-orange-500" />
                  <span class="text-[12px] font-bold text-slate-600 group-hover:text-orange-600">{{ item }}</span>
                </label>
                <!-- Custom Paid items -->
                <label 
                  v-for="item in customPaid" 
                  :key="item"
                  class="flex items-center gap-3 bg-white p-3 rounded-xl border border-orange-400 cursor-pointer transition group"
                >
                  <input aria-label="selected Paid" type="checkbox" :value="item" v-model="selectedPaid" class="w-4 h-4 rounded border-slate-300 accent-orange-500" />
                  <span class="text-[12px] font-bold text-slate-600 group-hover:text-orange-600">{{ item }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Stepper Navigation Buttons (Prev/Next/Submit) -->
        <div class="step-nav" :class="useRegistrationLayout ? 'registration-actions' : 'max-w-2xl mx-auto w-full pt-10 pb-20'">
          <button v-if="activeStep > firstStep" type="button" @click="prevStep" class="step-btn step-btn-secondary">
            <i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span>Back</span>
          </button>
          <span v-else aria-hidden="true"></span>

          <span aria-hidden="true"></span>

          <button v-if="activeStep < 4" type="button" @click="nextStep" class="step-btn step-btn-primary">
            <span>Next<span class="hidden md:inline">: {{ stepShortTitles[activeStep + 1] }}</span></span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </button>
          <button v-else type="submit" :disabled="isSaving || Boolean(editLocked)" class="step-btn step-btn-submit">
            <i :class="isSaving ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-paper-plane'" aria-hidden="true"></i>
            <span>{{ isSaving ? 'Submitting…' : (isPublicRegistration ? submitLabel : 'Submit Application') }}</span>
          </button>
        </div>

      </form>
      </template>
    </main>

    <!-- Data Privacy Act (DPA 2012) Mandatory Consent Notice Modal -->
    <DataPrivacyModal 
      :show="showDpaModal" 
      title="Owner Accreditation Data Privacy Notice"
      subtitle="Republic Act No. 10173 (Data Privacy Act of 2012)"
      @accepted="handleDpaAccepted" 
    />
  </div>
</template>

<style>
/* Public property registration: full-width, compact layout so each step fits one screen */
.registration-compact.management-page { padding: 0 !important; }
.registration-topbar { position: sticky; top: 0; z-index: 40; display: flex; align-items: stretch; height: 64px; background: #fff; border-bottom: 1px solid #e2e8f0; }
.registration-breadcrumb { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 0 clamp(12px, 2vw, 32px); font-size: 15px; color: #586b82; }
.registration-breadcrumb strong { color: #142b4a; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.registration-breadcrumb-sep { color: #94a3b8; }
.registration-topbar-actions { margin-left: auto; display: flex; align-items: center; gap: 6px; padding: 0 20px; }
.registration-topbar-actions a { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border-radius: 8px; font-size: 13px; font-weight: 600; color: #245b99; white-space: nowrap; }
.registration-topbar-actions a:hover { background: #edf3fa; }
.registration-topbar-actions a.registration-login { background: #245b99; color: #fff; }
.registration-topbar-actions a.registration-login:hover { background: #194775; }
@media (max-width: 767px) {
      .registration-breadcrumb { padding: 0 12px; font-size: 14px; }
  .registration-topbar-actions { padding: 0 8px; }
}
.registration-compact.management-page > main { max-width: none !important; padding: 16px clamp(12px, 2vw, 32px) 0 !important; }
.registration-progress { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px 16px 6px; margin-bottom: 10px; }
.registration-compact main > .mb-10 { margin-bottom: 12px !important; }
.registration-compact main > :is(.p-10, .p-8) { padding: 14px 18px !important; }
.registration-compact main > div .w-14.h-14 { width: 40px; height: 40px; }
.registration-compact form.space-y-10 > * + * { margin-top: 12px !important; }
.registration-compact form > .animate-fade-in { padding: 14px 20px !important; }
.registration-compact form > .animate-fade-in > div:first-child { margin-bottom: 10px !important; padding-bottom: 8px !important; }
.registration-compact form .pb-3 { padding-bottom: 6px !important; }
.registration-compact form .mb-1\.5 { margin-bottom: 4px !important; }
.registration-compact form .space-y-10 > * + * { margin-top: 12px !important; }
.registration-compact form .space-y-8 > * + * { margin-top: 14px !important; }
.registration-compact form .space-y-4 > * + * { margin-top: 6px !important; }
.registration-compact form .p-4 { padding: 9px 12px !important; }
.registration-compact form .p-6 { padding: 10px 14px !important; }
.registration-compact form .p-8 { padding: 14px !important; }
.registration-compact form .gap-6 { gap: 14px !important; }
.registration-compact form .gap-12 { gap: 24px !important; }
.registration-compact form :is(.mb-5, .mb-6) { margin-bottom: 10px !important; }
.registration-compact form .mb-4 { margin-bottom: 8px !important; }
.registration-compact form .mt-8 { margin-top: 10px !important; }
.registration-compact form .mt-4 { margin-top: 0 !important; }
/* Same layout inside the owner portal: keep room for the portal top bar and sidebar */
.registration-compact.registration-in-portal.management-page { padding-top: 72px !important; }
@media (min-width: 1180px) { .registration-compact.registration-in-portal.management-page { padding-left: 248px !important; } }
/* Fill the screen: the visible step panel stretches down to the action bar */
.registration-compact.management-page > main { min-height: calc(100vh - 64px); display: flex; flex-direction: column; }
.registration-compact.registration-in-portal.management-page > main { min-height: calc(100vh - 72px); }
.registration-compact main > form { flex: 1; display: flex; flex-direction: column; }
.registration-compact form > .animate-fade-in { flex: 1; display: flex; flex-direction: column; }
.registration-compact form > .animate-fade-in > :not(:first-child) { flex-shrink: 0; }
.registration-compact .registration-legal > .legal-fit { margin-bottom: 0 !important; padding-bottom: 0 !important; }
.registration-compact .registration-legal .legal-fit > div:first-child { margin-bottom: 10px !important; padding-bottom: 8px !important; }
/* Legal documents: table with the admin pager (Showing 1 to 8 of 8 · Rows per page · Prev / Next) */
.dt-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; }
.dt-group + .dt-group { border-top: 1px solid #e2e8f0; }
.dt-group-title { padding: 9px 14px; background: #eef2f7; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: .04em; }
.dt-group-title i { margin-right: 6px; color: #2563eb; }
.dt-group-title span { margin-left: 6px; font-weight: 500; color: #64748b; text-transform: none; letter-spacing: 0; }
.dt-scroll { overflow-x: auto; }
.dt-table { width: 100%; min-width: 860px; table-layout: fixed; border-collapse: collapse; font-size: 13px; color: #0f172a; text-align: left; }
.dt-table thead th { padding: 9px 14px; background: #f8fafc; font-size: 12.5px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0; white-space: nowrap; text-transform: none; letter-spacing: 0; }
.dt-table thead th small { display: block; font-size: 11px; font-weight: 500; color: #64748b; }
.dt-table td { padding: 9px 14px; vertical-align: middle; border-bottom: 1px solid #eef2f7; }
.dt-table tbody tr:last-child td { border-bottom: 0; }
.dt-col-num { width: 44px; color: #64748b; }
/* Fixed column widths: changing a file name or status never shifts the columns,
   and the Mandatory and Additional tables line up with each other */
.dt-table thead th:nth-child(2) { width: 30%; }
.dt-table thead th:nth-child(3) { width: 30%; }
.dt-table thead th:nth-child(4) { width: 20%; }
.dt-table thead th:nth-child(5) { width: auto; }
.dt-row:hover td { background: #f8fbff; }
.dt-row.is-error td { background: #fff7f7; }
.dt-name { display: block; font-size: 13.5px; font-weight: 600; color: #0f172a; }
.dt-pill { display: inline-block; margin-top: 3px; padding: 1px 7px; border-radius: 999px; font-size: 10.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; background: #f1f5f9; color: #64748b; }
.dt-pill.is-required { background: #fff1f2; color: #be123c; }
.dt-file { display: flex; align-items: center; gap: 10px; min-width: 0; }
.dt-upload { position: relative; flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: 1px solid #bfdbfe; border-radius: 9px; background: #eff6ff; color: #1d4ed8; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: background .15s, border-color .15s; }
.dt-upload:hover, .dt-upload:focus-within { background: #dbeafe; border-color: #93c5fd; }
.dt-upload input { position: absolute; inset: 0; width: 100%; height: 100%; min-height: 0 !important; opacity: 0; cursor: pointer; }
.dt-file-text { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; color: #94a3b8; }
.dt-file-text.is-ok { color: #15803d; font-weight: 500; }
.dt-file-text.is-ok i { margin-right: 4px; }
.dt-file-text small { margin-left: 4px; color: #64748b; font-weight: 400; }
.dt-file-text.is-error { color: #b91c1c; white-space: normal; }
.dt-file-text a { color: #1d4ed8; font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
.dt-date { width: 160px; height: 34px; min-height: 34px !important; padding: 0 10px; border: 1px solid #cbd5e1; border-radius: 9px; background: #fff; font-size: 13px; color: #0f172a; outline: none; }
.dt-date:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, .15); }
.dt-date.is-invalid { border-color: #f87171; }
.dt-cell-error { margin: 5px 0 0; font-size: 12px; line-height: 1.35; color: #b91c1c; }
.dt-status { display: inline-flex; align-items: center; gap: 5px; width: 140px; padding: 3px 9px; border-radius: 8px; font-size: 12px; font-weight: 600; white-space: nowrap; background: #f1f5f9; color: #64748b; }
.dt-status.is-done { background: #dcfce7; color: #15803d; }
.dt-status.is-partial { background: #fef3c7; color: #b45309; }
.dt-status.is-error { background: #fee2e2; color: #b91c1c; }
.dt-row.is-empty .dt-status i { font-size: 7px; }
.dt-note { margin: 10px 0 0; font-size: 12px; color: #64748b; text-align: center; }
.dt-note i { color: #94a3b8; margin-right: 4px; }
/* Phones: each document becomes a small card */
@media (max-width: 767px) {
  .dt-table { min-width: 0; table-layout: auto; }
  .dt-table thead th { width: auto !important; }
  .dt-table thead { display: none; }
  .dt-table, .dt-table tbody, .dt-table tr, .dt-table td { display: block; width: 100%; }
  .dt-row { padding: 10px 14px; border-bottom: 1px solid #eef2f7; }
  .dt-table td { padding: 3px 0; border: 0; }
  .dt-col-num { display: none !important; }
  .dt-date { width: 100%; }
  .dt-file-text { max-width: none; }
}
/* Details & Map (laptop/desktop, 4-column layout): compact so the whole step fits on one screen.
   Only spacing and box heights change; text stays readable and follows browser zoom. */
@media (min-width: 1280px) {
  .registration-compact .registration-details { padding: 14px 20px !important; }
  .registration-compact .registration-details > div:first-child { margin-bottom: 10px !important; padding-bottom: 8px !important; }
  .registration-compact .registration-details > div:first-child > div:first-child { width: 32px; height: 32px; }
  .registration-compact .registration-details > .grid { gap: 10px 18px !important; }
  .registration-compact .registration-details label.block { margin-bottom: 4px !important; }
  .registration-compact .registration-details :is(input[type='text'], input[type='number']),
  .registration-compact .registration-details .dd-trigger { height: 40px; min-height: 40px !important; padding: 0 12px !important; }
  .registration-compact .registration-details textarea { padding: 8px 12px !important; }
  .registration-compact .registration-details p.mt-1\.5 { margin-top: 3px !important; font-size: 11.5px; }
  .registration-compact .registration-details h3.mb-4 { margin-bottom: 6px !important; }
  .registration-compact .registration-details h3.mb-6 { margin-bottom: 6px !important; }
  .registration-compact .registration-details .grid.md\:grid-cols-3 { gap: 12px !important; }
  .registration-compact .registration-details .space-y-8 { padding: 12px 14px !important; border-radius: 18px !important; }
  .registration-compact .registration-details .space-y-8 > * + * { margin-top: 10px !important; }
  .registration-compact .registration-details .space-y-8 .mb-4 { margin-bottom: 8px !important; }
  .registration-compact .registration-details .registration-map { height: 230px !important; border-width: 2px; border-radius: 18px !important; }
}
/* Details & Map, laptop/desktop: the page is locked to the window height (like the admin lists).
   The left column keeps its size; the location box stretches to the bottom and the map fills the
   remaining height, so the whole step fits without page scrolling. No scaling, so text keeps its
   size and follows browser zoom. The panel never shows a scrollbar; the map absorbs the difference. */
@media (min-width: 1280px) and (min-height: 600px) {
  .registration-details-fit.management-page { height: 100dvh; min-height: 0 !important; overflow: hidden; display: flex; flex-direction: column; }
  .registration-details-fit.management-page > main { flex: 1 1 0; min-height: 0 !important; overflow: hidden; }
  .registration-details-fit main > * { flex-shrink: 0; }
  .registration-details-fit main > form { flex: 1 1 0; min-height: 0; }
  .registration-details-fit form > .registration-details { flex: 1 1 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
  .registration-details-fit .registration-details > * { flex-shrink: 0; }
  .registration-details-fit .registration-details > .grid { flex: 1 1 auto; min-height: 0; grid-template-rows: repeat(4, auto) minmax(0, 1fr); }
  .registration-details-fit .registration-location { display: flex; flex-direction: column; min-height: 0; }
  .registration-details-fit .registration-location > .space-y-8 { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
  .registration-details-fit .registration-location > .space-y-8 > div:nth-child(2) { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
  .registration-details-fit .registration-location .registration-map { flex: 1 1 0; height: auto !important; min-height: 120px; }
  .registration-details-fit .registration-description { display: flex; flex-direction: column; min-height: 0; }
  .registration-details-fit .registration-description textarea { flex: 1 1 auto; min-height: 56px; resize: none; }
  .registration-details-fit .registration-progress { margin-bottom: 8px; }
  .registration-details-fit .registration-actions { padding: 6px 2px !important; }
}
/* Address search box: less padding (its size is set inline by the Google element) */
@media (min-width: 1280px) {
  .registration-compact #autocomplete-wrapper gmp-place-autocomplete { padding: 4px 10px !important; border-radius: 12px !important; }
}
/* Owner information: compact two-column layout */
.registration-compact .registration-owner { align-content: start; }
.registration-compact .registration-section-title { display: block; font-size: 13px; font-weight: 700; color: #142b4a; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; padding: 0; }
.registration-compact .registration-label { display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 5px; }
.registration-compact .registration-owner :is(input, select, .dd-trigger) { padding: 10px 14px !important; font-size: 15px !important; height: 48px; min-height: 48px; }
/* Photos: compact upload boxes like the document cards */
/* Photos: featured photo + categorized gallery (consistent 4:3 frames) */
.registration-photo-frame { position: relative; aspect-ratio: 4 / 3; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; background: #f1f5f9; }
.registration-photo-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
.registration-example-badge { position: absolute; top: 8px; left: 8px; background: rgba(15, 23, 42, .78); color: #fff; font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; }
.registration-featured-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; color: #92400e; background: #fef3c7; border: 1px solid #fde68a; padding: 2px 8px; border-radius: 999px; }
.registration-upload-button { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; font-weight: 600; color: #fff; background: #245b99; border-radius: 8px; padding: 8px 14px; white-space: nowrap; }
.registration-upload-button:hover { background: #194775; }
.registration-upload-button:focus-within { outline: 3px solid #5e99db; outline-offset: 2px; }
.registration-upload-button.small { font-size: 12px; padding: 5px 10px; background: #eff6ff; color: #1e4a8d; border: 1px solid #bfdbfe; }
.registration-upload-button.small:hover { background: #dbeafe; }
.registration-category { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; background: #fff; min-width: 0; }
.registration-thumb { position: relative; aspect-ratio: 4 / 3; border-radius: 6px; overflow: hidden; border: 1px solid #e2e8f0; background: #f8fafc; }
.registration-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.registration-thumb.sample { aspect-ratio: auto; height: 72px; }
.registration-thumb.sample img { opacity: .9; }
.registration-thumb-remove { position: absolute; top: 3px; right: 3px; width: 22px; height: 22px; min-height: 22px !important; border-radius: 999px; background: rgba(220, 38, 38, .92); color: #fff; font-size: 11px; display: flex; align-items: center; justify-content: center; }
.registration-thumb-remove:focus-visible { outline: 2px solid #fff; }
.registration-actions { position: sticky; bottom: 0; z-index: 20; padding: 10px 2px !important; background: rgba(244, 247, 251, .95); backdrop-filter: blur(6px); border-top: 1px solid #e2e8f0; }
/* Step navigation (Back / progress / Next or Submit) */
.step-nav { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; }
.step-nav > :first-child { justify-self: start; }
.step-nav > :last-child { justify-self: end; }
.step-nav-progress { margin: 0; font-size: 13px; color: #64748b; text-align: center; white-space: nowrap; }
.step-nav-count { font-weight: 700; color: #142b4a; }
.step-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 44px; min-height: 44px; padding: 0 20px; border-radius: 10px; font-size: 14px; font-weight: 600; line-height: 1; white-space: nowrap; transition: background-color .15s, border-color .15s, box-shadow .15s; }
.step-btn:focus-visible { outline: 3px solid #5e99db; outline-offset: 2px; }
.step-btn:disabled { opacity: .55; cursor: not-allowed; }
.step-btn-secondary { background: #fff; color: #334155; border: 1px solid #cbd5e1; }
.step-btn-secondary:hover { border-color: #94a3b8; background: #f8fafc; }
.step-btn-primary { background: #245b99; color: #fff; box-shadow: 0 1px 2px rgba(20, 43, 74, .15); }
.step-btn-primary:hover { background: #194775; }
.step-btn-submit { background: #16a34a; color: #fff; box-shadow: 0 1px 2px rgba(22, 101, 52, .2); }
.step-btn-submit:hover:not(:disabled) { background: #15803d; }
@media (max-width: 480px) { .step-btn { padding: 0 14px; } .step-nav-progress { font-size: 12px; } }

/* ── Polished buttons (register page + shared step navigation) ───────────────────── */
.step-btn { height: 46px; min-height: 46px; padding: 0 22px; border-radius: 12px; font-size: 14px; letter-spacing: .01em; transition: transform .15s ease, box-shadow .15s ease, background .15s ease, border-color .15s ease; }
.step-btn i { font-size: 13px; transition: transform .15s ease; }
.step-btn:not(:disabled):hover { transform: translateY(-1px); }
.step-btn:not(:disabled):active { transform: translateY(0); }
.step-btn-secondary { background: #fff; color: #1e3a5f; border: 1px solid #d5dfeb; box-shadow: 0 1px 2px rgba(20, 43, 74, .06); }
.step-btn-secondary:hover { background: #f5f8fc; border-color: #9fb3cc; box-shadow: 0 4px 10px rgba(20, 43, 74, .08); }
.step-btn-secondary:hover i { transform: translateX(-2px); }
.step-btn-primary { background: linear-gradient(135deg, #2f6fc0 0%, #1e4a8d 100%); color: #fff; border: 0; box-shadow: 0 6px 16px rgba(30, 74, 141, .28); }
.step-btn-primary:hover { background: linear-gradient(135deg, #2a64ad 0%, #173c74 100%); box-shadow: 0 8px 20px rgba(30, 74, 141, .34); }
.step-btn-primary:hover i { transform: translateX(3px); }
.step-btn-submit { background: linear-gradient(135deg, #22c55e 0%, #15803d 100%); color: #fff; border: 0; box-shadow: 0 6px 16px rgba(21, 128, 61, .28); }
.step-btn-submit:hover:not(:disabled) { background: linear-gradient(135deg, #1fb355 0%, #116a33 100%); box-shadow: 0 8px 20px rgba(21, 128, 61, .34); }

/* Step circles */
.registration-step-active { background: linear-gradient(135deg, #2f6fc0, #1e4a8d); color: #fff; box-shadow: 0 0 0 3px #dbe8f8, 0 3px 8px rgba(30, 74, 141, .25); }
.registration-step-done { background: linear-gradient(135deg, #34d399, #16a34a); color: #fff; box-shadow: 0 2px 6px rgba(22, 163, 74, .25); }
.registration-step-todo { background: #fff; color: #94a3b8; border: 2px solid #dbe3ee; }

/* Header log in */
.registration-topbar-actions a.registration-login { background: linear-gradient(135deg, #2f6fc0, #1e4a8d); box-shadow: 0 4px 12px rgba(30, 74, 141, .25); border-radius: 10px; }
.registration-topbar-actions a.registration-login:hover { background: linear-gradient(135deg, #2a64ad, #173c74); }

/* Photo upload buttons */
.registration-upload-button { background: linear-gradient(135deg, #2f6fc0, #1e4a8d); border-radius: 10px; padding: 9px 16px; box-shadow: 0 4px 12px rgba(30, 74, 141, .22); transition: transform .15s ease, box-shadow .15s ease; }
.registration-upload-button:hover { background: linear-gradient(135deg, #2a64ad, #173c74); transform: translateY(-1px); box-shadow: 0 6px 16px rgba(30, 74, 141, .28); }
.registration-upload-button.small { background: #f1f6fd; color: #1e4a8d; border: 1px solid #c9daf1; border-radius: 999px; padding: 5px 12px; box-shadow: none; }
.registration-upload-button.small:hover { background: #1e4a8d; color: #fff; border-color: #1e4a8d; transform: none; box-shadow: 0 3px 8px rgba(30, 74, 141, .2); }

/* Document "Choose files" buttons (native file inputs) */
.registration-compact input[type=file]:not(.sr-only) { font-size: 12px; color: #64748b; }
.registration-compact input[type=file]:not(.sr-only)::file-selector-button {
  margin-right: 10px; padding: 6px 12px; border-radius: 9px; border: 1px solid #c9daf1;
  background: #f1f6fd; color: #1e4a8d; font-size: 12px; font-weight: 700; cursor: pointer;
  transition: background .15s ease, color .15s ease, border-color .15s ease;
}
.registration-compact input[type=file]:not(.sr-only):hover::file-selector-button { background: #1e4a8d; color: #fff; border-color: #1e4a8d; }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fadeIn 0.35s ease-out forwards;
}

/* Gmail field: owner types the name, "@gmail.com" is fixed */
.gmail-field { display: flex; align-items: stretch; width: 100%; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; transition: border-color .15s, background .15s; }
.gmail-field:focus-within { background: #fff; border-color: #3b82f6; }
.gmail-field.is-error { border-color: #f87171; }
.gmail-field input { padding: 10px 14px; }
.registration-compact .gmail-field input { height: 46px; min-height: 46px; font-size: 15px !important; }
.gmail-domain { display: flex; align-items: center; padding: 0 14px; background: #eef2f7; border-left: 1px solid #e2e8f0; color: #475569; font-size: 14px; font-weight: 600; white-space: nowrap; user-select: none; }

</style>

<style scoped>
/* Phone / PWA only (desktop unchanged) */
@media (max-width: 640px) {
  /* Step cards: less padding so nothing is cut off at the right edge */
  .animate-fade-in.text-left.bg-white { padding: 14px !important; border-radius: 18px !important; overflow: hidden; }
  .animate-fade-in.text-left.bg-white > div:first-child { margin-bottom: 14px !important; padding-bottom: 10px !important; gap: 10px !important; }
  .animate-fade-in.text-left.bg-white :is(.gap-6, .gap-y-6) { row-gap: 12px !important; }
  .animate-fade-in.text-left.bg-white .gap-6 { column-gap: 12px !important; }
  .animate-fade-in.text-left.bg-white .gap-12 { gap: 16px !important; }
  .animate-fade-in.text-left.bg-white :is(input, select, textarea).p-4, .animate-fade-in.text-left.bg-white :deep(.p-4.rounded-xl) { padding: 11px 12px !important; }
  .animate-fade-in.text-left.bg-white label.mb-2 { margin-bottom: 5px !important; font-size: 11px !important; }
  .rounded-\[2\.5rem\].p-10 { padding: 16px !important; border-radius: 18px !important; margin-bottom: 16px !important; }

  /* Legal documents: one card per document - name and status on top, file and expiry below */
  .dt-card { border: 0; border-radius: 0; background: transparent; overflow: visible; }
  .dt-group + .dt-group { border-top: 0; margin-top: 10px; }
  .dt-group-title { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; line-height: 1.5; }
  .dt-group-title span { display: block; margin: 2px 0 0 20px; font-size: 11.5px; }
  .dt-table tbody { display: grid !important; gap: 8px; padding-top: 8px; }
  .dt-table .dt-row { display: grid !important; grid-template-columns: minmax(0, 1fr) auto; gap: 0 10px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; }
  .dt-row.is-error { border-color: #f6caca; }
  .dt-table .dt-row td { width: auto; padding: 0; background: transparent !important; }
  .dt-table .dt-row td:nth-child(2) { grid-column: 1; grid-row: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
  .dt-table .dt-row td:nth-child(2) .dt-pill { margin-top: 0; }
  .dt-table .dt-row td:nth-child(5) { grid-column: 2; grid-row: 1; align-self: start; }
  .dt-table .dt-row td:is(:nth-child(3), :nth-child(4)) { grid-column: 1 / -1; margin-top: 10px; padding-top: 10px; border-top: 1px solid #eef2f7; }
  .dt-table .dt-row td:is(:nth-child(3), :nth-child(4))::before { content: attr(data-label); display: block; margin-bottom: 6px; font-size: 11px; font-weight: 600; color: #64748b; }
  .dt-file { flex-wrap: wrap; gap: 6px 10px; }
  .dt-upload { height: 36px; padding: 0 14px; }
  .dt-file-text { flex: 1 1 0; }
  .dt-date { width: 100%; height: 40px; }
  .dt-status { width: auto; }

  /* Photos: featured photo on top, gallery categories two per row */
  .registration-photos { gap: 16px !important; }
  .registration-photo-frame { aspect-ratio: 16 / 10; }
  .registration-photos > section:first-child .registration-upload-button { flex: 1; justify-content: center; }
  .registration-photos > section:last-child > .grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 8px !important; }
  .registration-category { display: flex; flex-direction: column; padding: 8px; }
  .registration-category > div:first-child { flex-direction: column; align-items: stretch; gap: 6px; }
  .registration-category .registration-upload-button.small { justify-content: center; }
  .registration-category > .grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; margin-top: 6px !important; }
  .registration-category > .grid > .sample { grid-column: 1 / -1; height: 60px; }
}
</style>
