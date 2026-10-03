<script setup>
const isValidPermitDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
};
import { ref, computed, onMounted, watch, nextTick } from 'vue';
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

const currentUser = ref(JSON.parse(sessionStorage.getItem('cspc_user') || '{}'));
const activeStep = ref(1);
const showDpaModal = ref(!Boolean(currentUser.value.dpa_accepted));

const handleDpaAccepted = () => {
  showDpaModal.value = false;
  currentUser.value.dpa_accepted = 1;
};

const isLoading = ref(true);
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

const criteria = ref([
  { id: 1, label: 'Business Permit Application Form', permit_key: 'permit_business_form', required: true },
  { id: 2, label: 'Community Tax Certificate (Cedula)', permit_key: 'permit_cedula', required: false },
  { id: 3, label: 'DTI Registration Certificate', permit_key: 'permit_dti', required: false },
  { id: 4, label: 'Barangay Business Clearance', permit_key: 'permit_barangay', required: true },
  { id: 5, label: 'Certificate of Building Inspection', permit_key: 'permit_building', required: false },
  { id: 6, label: 'Zoning Certificate / Locational Clearance', permit_key: 'permit_zoning', required: false },
  { id: 7, label: 'Sanitary Permit / Health Clearance', permit_key: 'permit_sanitary', required: true },
  { id: 8, label: 'Valid Fire Safety Inspection Certificate', permit_key: 'permit_fire', required: true }
]);

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
  activeStep.value = 1;
  validationErrors.value = [];
  successMsg.value = '';
  errorMsg.value = '';
};

const loadOnboardingData = async () => {
  if (route.query.new === 'true') {
    resetFormToCleanSlate();
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
async function fetchHouseDetails() {
  if (!houseId.value) return;
  try {
    const res = await axios.get(`/api/boarding-houses/details/${houseId.value}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const house = res.data.data;
    if (house) {
      houseName.value = house.name || '';
      contactNumber.value = house.phone_contact || '';
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
      const digitsOnly = val.replace(/\D/g, '');
      const isValidFormat = /^[\d\s\/,\-\+\(\)]{7,100}$/.test(val);
      if (!isValidFormat || digitsOnly.length < 7) {
        fieldErrors.value.contactNumber = 'Please enter valid contact number(s) (e.g., 09123456789 or 09123456789 / 09987654321).';
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

const handleOwnerPhoneKeypress = (e) => {
  const char = String.fromCharCode(e.which || e.keyCode);
  if (!/[\d\s\/,\-\+]/.test(char)) {
    e.preventDefault();
  }
};

const handleOwnerPhoneInput = (e) => {
  contactNumber.value = e.target.value.replace(/[^\d\s\/,\-\+]/g, '');
  validateField('contactNumber');
};

const validateCurrentStep = () => {
  const errors = [];
  if (activeStep.value === 1) {
    criteria.value.forEach(p => {
      const hasFile = !!permitFiles.value[p.permit_key] || !!existingFiles.value[p.permit_key];
      const hasExpiry = !!permitExpiries.value[p.permit_key];

      if (hasExpiry && !isValidPermitDate(permitExpiries.value[p.permit_key])) {
        errors.push(p.label + ' expiry date is invalid. Enter a real date with a four-digit year (1000-9999).');
      }
      if (p.required && !hasFile) {
        permitFileErrors.value[p.permit_key] = `${p.label} document is required.`;
        errors.push(`${p.label} document is required.`);
      } else if (hasFile && !hasExpiry) {
        permitFileErrors.value[p.permit_key] = `Expiration date is required for ${p.label}.`;
        errors.push(`Expiration date is required for ${p.label}.`);
      } else if (hasFile && hasExpiry && permitFileErrors.value[p.permit_key] === `Expiration date is required for ${p.label}.`) {
        delete permitFileErrors.value[p.permit_key];
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

// Stepper Navigation Methods
const nextStep = () => {
  const stepErrors = validateCurrentStep();
  if (stepErrors.length > 0) {
    validationErrors.value = stepErrors;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  validationErrors.value = [];
  if (activeStep.value < 4) activeStep.value++;
};

const prevStep = () => {
  if (activeStep.value > 1) activeStep.value--;
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

// Handle generic permit file changes with automatic background conversion & instant reactive validation
const handlePermitFile = async (key, event) => {
  const file = event.target.files[0];
  if (!file) return;

  const validation = validateImageFile(file);
  if (!validation.valid) {
    permitFileErrors.value[key] = validation.message;
    event.target.value = '';
    delete permitFiles.value[key];
    return;
  }

  delete permitFileErrors.value[key];
  const processedFile = await transcodeHeicFile(file);
  permitFiles.value[key] = processedFile;
};

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
  const processedFile = await transcodeHeicFile(file);
  mainHouseImg.value = processedFile;
  mainHouseImgPreview.value = URL.createObjectURL(processedFile);
};

// Handle Dynamic Multi-Photo uploads with instant validation
const handlePhotosSelected = async (event) => {
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
    const processedFile = await transcodeHeicFile(file);
    selectedPhotos.value.push({
      file: processedFile,
      previewUrl: URL.createObjectURL(processedFile),
      dbValue: null
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
  }
});

// Reactively watch for route queries changing during component lifecycles (no remounting required)
watch(
  () => route.query,
  async () => {
    await loadOnboardingData();
  },
  { deep: true }
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
  const errors = [];
  criteria.value.forEach(p => {
    const value = permitExpiries.value[p.permit_key];
    if (value && !isValidPermitDate(value)) errors.push(p.label + ' expiry date is invalid. Enter a real date with a four-digit year (1000-9999).');
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

  return errors;
};

// Handle Form Submission
const submitApplication = async () => {
  validationErrors.value = [];
  successMsg.value = '';
  errorMsg.value = '';

  const errors = validateForm();
  if (errors.length > 0) {
    validationErrors.value = errors;
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
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

    if (houseId.value) {
      fd.append('house_id', houseId.value);
    }

    if (mainHouseImg.value) {
      fd.append('house_img', mainHouseImg.value);
    }

    // Append remaining database-stored extra images — pass the full stored value (Cloudinary URL or legacy filename)
    const dbPhotos = selectedPhotos.value.filter(p => !p.file).map(p => p.dbValue || '').filter(Boolean);
    fd.append('existing_photos', JSON.stringify(dbPhotos));

    // Append newly uploaded extra photos
    selectedPhotos.value.forEach(photoObj => {
      if (photoObj.file) {
        fd.append('house_photos', photoObj.file);
      }
    });

    // Append legal permit files and expiries dynamically
    criteria.value.forEach(p => {
      const file = permitFiles.value[p.permit_key];
      const expiry = permitExpiries.value[p.permit_key];
      if (file) fd.append(p.permit_key, file);
      if (expiry) {
        const fieldName = p.permit_key.replace('permit_', '');
        fd.append(`expiry_permit_${fieldName}`, expiry);
      }
    });

    const response = await axios.post(`/api/boarding-houses/accreditation`, fd, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      }
    });

    if (response.data.success) {
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
    errorMsg.value = err.response?.data?.message || 'Accreditation application failed. Please verify files and try again.';
    if (alertRef.value) {
      alertRef.value.showSystemAlert(errorMsg.value, 'error');
    }
  } finally {
    isSaving.value = false;
  }
};
</script>


<template>
  <div class="bg-[#eef6ff] min-h-screen font-sans pb-24">
    <FlashAlert ref="alertRef" />
    <!-- Navbar -->
    <nav class="bg-[#2a528a] px-10 py-5 flex justify-between items-center text-white shadow-md">
      <div class="flex items-center gap-3">
        <img src="/img/CSPC_logo.png" alt="Logo" class="w-9 h-9 object-contain bg-white rounded-full p-0.5" />
        <span class="font-bold text-[13px] tracking-tight uppercase">CSPC'S BOARDING HOUSE SELECTION</span>
      </div>
      <div class="text-[11px] font-black uppercase tracking-[0.2em] text-blue-200">
        Owner Onboarding
      </div>
    </nav>

    <!-- Fullscreen Large Map Verification Modal -->
    <div v-if="showFullscreenMap" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex flex-col p-6 md:p-10 animate-fade-in">
      <div class="max-w-6xl mx-auto w-full h-full flex flex-col bg-white rounded-[3rem] overflow-hidden shadow-2xl relative">
        <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 class="text-xl font-black text-slate-900 uppercase tracking-tight">Pin Your Location</h3>
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Click exactly where your boarding house is located</p>
          </div>
          <button type="button" @click="toggleFullscreenMap" class="bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 w-12 h-12 rounded-2xl flex items-center justify-center transition-all">
            <i class="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>
        <div ref="largeMapContainer" class="flex-1 bg-slate-100"></div>
        <div class="p-6 bg-white border-t border-slate-100 flex justify-center">
          <button type="button" @click="toggleFullscreenMap" class="bg-blue-600 text-white font-black px-12 py-4 rounded-2xl uppercase text-[11px] tracking-[0.2em] shadow-xl hover:bg-black transition-all">
            Save &amp; Confirm Location
          </button>
        </div>
      </div>
    </div>

    <!-- Main Workspace container -->
    <main class="max-w-4xl mx-auto py-16 px-6">
      
      <!-- Stepper Progress Indicator -->
      <div class="mb-12 flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm max-w-xl mx-auto">
        <div 
          v-for="step in [1, 2, 3, 4]" 
          :key="step"
          class="flex items-center"
        >
          <!-- Step Circle -->
          <button 
            type="button"
            @click="activeStep = step"
            :class="[
              activeStep === step ? 'bg-[#1e4a8d] text-white' : activeStep > step ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-400',
              'w-10 h-10 rounded-full flex items-center justify-center font-black text-xs transition duration-300'
            ]"
          >
            <i v-if="activeStep > step" class="fa-solid fa-check" />
            <span v-else>{{ step }}</span>
          </button>
          
          <!-- Connecting Line -->
          <div 
            v-if="step < 4" 
            class="h-1 w-10 sm:w-16 mx-2 rounded-full"
            :class="activeStep > step ? 'bg-green-400' : 'bg-slate-100'"
          ></div>
        </div>
      </div>

      <div class="text-center mb-12">
        <h1 class="text-4xl font-black text-slate-900 tracking-tight uppercase">Accreditation Process</h1>
        <p class="text-slate-500 font-bold uppercase text-[11px] tracking-[0.3em] mt-3">
          {{ activeStep === 1 ? 'Step 1: Legal Compliance' : activeStep === 2 ? 'Step 2: Property Photos' : activeStep === 3 ? 'Step 3: Property Details & Map' : 'Step 4: Amenities Center' }}
        </p>
      </div>

      <!-- Client Validation Errors Banner -->
      <div v-if="validationErrors.length > 0" class="mb-10 bg-[#fffbeb] border-2 border-[#fef3c7] rounded-[2.5rem] p-10 shadow-sm text-left animate-fade-in">
        <div class="flex items-start gap-6">
          <div class="bg-amber-500 text-white w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-200">
            <i class="fa-solid fa-triangle-exclamation text-2xl"></i>
          </div>
          <div>
            <h3 class="text-amber-800 font-black uppercase text-lg tracking-tight mb-2">Incomplete Details Detected</h3>
            <p class="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-4">Please fix the following problems to proceed with submission:</p>
            <ul class="list-disc list-inside space-y-2 text-slate-700 text-[13px] font-bold">
              <li v-for="err in validationErrors" :key="err" class="leading-relaxed">{{ err }}</li>
            </ul>
          </div>
        </div>
      </div>

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
            <h3 class="text-[#991b1b] font-black uppercase text-xl tracking-tight mb-1">Application Rejected</h3>
            <p class="text-[#ef4444] text-[10px] font-bold uppercase tracking-[0.2em] mb-6">Please review the comments from SASO Admin below:</p>
            <div class="bg-white/90 border-2 border-[#fee2e2] rounded-[1.8rem] p-8 text-slate-700 text-sm font-medium italic shadow-inner mb-6">
              "{{ adminComments || 'No comments left.' }}"
            </div>
            <div class="flex items-center gap-3 text-[#ef4444]">
              <div class="w-2 h-2 bg-[#ef4444] rounded-full animate-ping"></div>
              <p class="text-[10px] font-black uppercase tracking-widest leading-relaxed">
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
        <p class="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Loading application config details...</p>
      </div>

      <!-- Use v-show so that map Container and input are instantly available on mount -->
      <form v-show="!isLoading" @submit.prevent="submitApplication" class="space-y-10" novalidate>
        
        <!-- ================= STEP 1: MANDATORY PERMITS ================= -->
        <div v-show="activeStep === 1" class="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 sm:p-10 animate-fade-in text-left">
          <div class="flex items-center gap-4 mb-8 border-b border-slate-100 pb-6">
            <div class="bg-blue-600 text-white w-10 h-10 rounded-xl flex items-center justify-center font-black shadow-sm">1</div>
            <div>
              <h2 class="text-sm font-black text-slate-900 uppercase tracking-wider">Legal Permits &amp; Clearances</h2>
              <p class="text-xs text-slate-500 font-medium mt-0.5">Please provide the 4 mandatory permits and any additional supporting documents.</p>
            </div>
          </div>
          
          <div class="space-y-10">
            <!-- SECTION A: MANDATORY REQUIRED DOCUMENTS -->
            <div>
              <div class="flex items-center justify-between mb-5 border-b border-slate-100 pb-3">
                <h3 class="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                  <i class="fa-solid fa-shield-halved text-blue-600"></i> Mandatory Documents
                </h3>
                <span class="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">Required (Items 1-4)</span>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div 
                  v-for="(p, idx) in requiredCriteria" 
                  :key="p.id" 
                  class="relative group p-6 rounded-2xl border transition-all"
                  :class="permitFileErrors[p.permit_key] ? 'bg-rose-50/30 border-rose-300' : 'bg-slate-50/60 border-slate-200/80 hover:border-blue-300 hover:bg-white'"
                >
                  <div class="flex items-center justify-between mb-4 gap-2">
                    <label class="text-xs font-bold text-slate-800 transition group-hover:text-blue-600">
                      <span class="text-blue-600 font-black mr-1">{{ idx + 1 }}.</span> {{ p.label }}
                    </label>
                    <span class="bg-rose-50 text-rose-600 border border-rose-200 text-[8px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider shrink-0">Required</span>
                  </div>
                  
                  <div class="space-y-4">
                    <div>
                      <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Scanned File</label>
                      <input 
                        type="file" 
                        accept="image/*"
                        @change="(e) => handlePermitFile(p.permit_key, e)"
                        class="w-full text-xs font-medium text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition cursor-pointer" 
                      />
                      <p v-if="permitFileErrors[p.permit_key]" class="text-[11px] font-medium text-rose-600 mt-1.5 flex items-center gap-1.5">
                        <i class="fa-solid fa-circle-info"></i> {{ permitFileErrors[p.permit_key] }}
                      </p>
                      <div v-if="existingFiles[p.permit_key] && !permitFileErrors[p.permit_key]" class="mt-2">
                        <div class="flex items-center gap-2">
                          <span class="text-[10px] text-emerald-600 font-bold uppercase tracking-wider"><i class="fa-solid fa-circle-check"></i> Current:</span>
                          <a :href="getImageUrl(existingFiles[p.permit_key])" target="_blank" class="text-[10px] font-bold text-blue-600 hover:underline uppercase tracking-wider overflow-hidden text-ellipsis whitespace-nowrap block max-w-[180px]">View Document</a>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Expiration Date</label>
                      <input type="date" min="1000-01-01" max="9999-12-31" v-model="permitExpiries[p.permit_key]" class="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 focus:border-blue-500 outline-none transition" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- SECTION B: ADDITIONAL SUPPORTING DOCUMENTS -->
            <div>
              <div class="flex items-center justify-between mb-5 border-b border-slate-100 pb-3">
                <h3 class="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                  <i class="fa-solid fa-folder-open text-slate-400"></i> Additional Documents
                </h3>
                <span class="bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">Optional (Items 5-8)</span>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div 
                  v-for="(p, idx) in optionalCriteria" 
                  :key="p.id" 
                  class="relative group p-6 rounded-2xl border transition-all"
                  :class="permitFileErrors[p.permit_key] ? 'bg-rose-50/30 border-rose-300' : 'bg-slate-50/60 border-slate-200/80 hover:border-blue-300 hover:bg-white'"
                >
                  <div class="flex items-center justify-between mb-4 gap-2">
                    <label class="text-xs font-bold text-slate-800 transition group-hover:text-blue-600">
                      <span class="text-slate-400 font-bold mr-1">{{ idx + 5 }}.</span> {{ p.label }}
                    </label>
                    <span class="bg-slate-100 text-slate-500 border border-slate-200 text-[8px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider shrink-0">Optional</span>
                  </div>
                  
                  <div class="space-y-4">
                    <div>
                      <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Scanned File</label>
                      <input 
                        type="file" 
                        accept="image/*"
                        @change="(e) => handlePermitFile(p.permit_key, e)"
                        class="w-full text-xs font-medium text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 transition cursor-pointer" 
                      />
                      <p v-if="permitFileErrors[p.permit_key]" class="text-[11px] font-medium text-rose-600 mt-1.5 flex items-center gap-1.5">
                        <i class="fa-solid fa-circle-info"></i> {{ permitFileErrors[p.permit_key] }}
                      </p>
                      <div v-if="existingFiles[p.permit_key] && !permitFileErrors[p.permit_key]" class="mt-2">
                        <div class="flex items-center gap-2">
                          <span class="text-[10px] text-emerald-600 font-bold uppercase tracking-wider"><i class="fa-solid fa-circle-check"></i> Current:</span>
                          <a :href="getImageUrl(existingFiles[p.permit_key])" target="_blank" class="text-[10px] font-bold text-blue-600 hover:underline uppercase tracking-wider overflow-hidden text-ellipsis whitespace-nowrap block max-w-[180px]">View Document</a>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Expiration Date</label>
                      <input type="date" min="1000-01-01" max="9999-12-31" v-model="permitExpiries[p.permit_key]" class="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 focus:border-blue-500 outline-none transition" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p class="mt-8 text-[10px] text-slate-400 font-bold uppercase italic tracking-wider text-center">* Accepted formats: PNG, JPG, JPEG, WEBP, HEIC up to 10MB.</p>
        </div>

        <!-- ================= STEP 2: DYNAMIC PROPERTY PHOTOS ================= -->
        <div v-show="activeStep === 2" class="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-10 animate-fade-in text-left">
          <div class="flex items-center gap-4 mb-8 border-b border-slate-50 pb-6">
            <div class="bg-green-100 text-green-600 w-10 h-10 rounded-full flex items-center justify-center font-black">2</div>
            <h2 class="text-xs font-black text-slate-900 uppercase tracking-[0.2em]">Property Photos</h2>
          </div>
          
          <div class="space-y-8">
            <!-- Main Featured Image -->
            <div>
              <label class="block text-[10px] font-black uppercase mb-3 ml-1" :class="mainImgError ? 'text-red-600' : 'text-slate-400'">Featured Main Image (Facade/Exterior)</label>
              <div 
                class="border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer relative"
                :class="mainImgError ? 'bg-red-50/50 border-red-400' : 'bg-slate-50 border-slate-200 hover:border-green-400'"
              >
                <input type="file" accept="image/*" @change="handleMainImg" class="w-full text-xs font-bold text-slate-500 file:mr-4 file:py-2 file:px-6 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-green-600 file:text-white hover:file:bg-black transition cursor-pointer" />
                
                <p v-if="mainImgError" class="text-[10px] font-bold text-red-600 mt-2 flex items-center justify-center gap-1">
                  <i class="fa-solid fa-circle-exclamation"></i> {{ mainImgError }}
                </p>

                <!-- Main Image Preview Card -->
                <div v-if="mainHouseImgPreview" class="mt-4 max-w-xs mx-auto rounded-xl overflow-hidden border border-slate-200 shadow-sm relative group">
                  <img :src="mainHouseImgPreview" class="w-full h-48 object-cover" alt="Featured Exterior" />
                  <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
                    <span class="text-white text-[9px] font-black uppercase tracking-widest bg-black/60 px-3 py-1.5 rounded-full">Change Photo</span>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Dynamic Interior / Extra Photos Uploader -->
            <div class="border-t border-slate-100 pt-6">
              <label class="block text-[10px] font-black uppercase mb-3 ml-1" :class="photosError ? 'text-red-600' : 'text-slate-400'">Property Gallery Showcase (Upload up to 10 photos of rooms, amenities, and common areas)</label>
              
              <div 
                class="flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-6 transition cursor-pointer mb-6"
                :class="photosError ? 'bg-red-50/50 border-red-400' : 'bg-slate-50 border-slate-200 hover:border-blue-400'"
              >
                <input 
                  type="file" 
                  multiple 
                  accept="image/*"
                  @change="handlePhotosSelected" 
                  class="w-full text-xs font-bold text-slate-500 file:mr-4 file:py-2 file:px-6 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-[#2a528a] file:text-white hover:file:bg-black transition cursor-pointer"
                />
                <p v-if="photosError" class="text-[10px] font-bold text-red-600 mt-2 flex items-center justify-center gap-1">
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
                  <button 
                    type="button" 
                    @click="removePhoto(index)" 
                    class="absolute top-2 right-2 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-700"
                  >
                    <i class="fa-solid fa-trash text-xs" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ================= STEP 3: CORE INFO & 3-WAY MAP ================= -->
        <div v-show="activeStep === 3" class="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-10 animate-fade-in text-left">
          <div class="flex items-center gap-4 mb-8 border-b border-slate-50 pb-6">
            <div class="bg-purple-100 text-purple-600 w-10 h-10 rounded-full flex items-center justify-center font-black">3</div>
            <h2 class="text-xs font-black text-slate-900 uppercase tracking-[0.2em]">Boarding House Details</h2>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="md:col-span-2">
              <label class="block text-[10px] font-black uppercase mb-2 ml-1" :class="fieldErrors.houseName ? 'text-red-600' : 'text-slate-400'">Boarding House Name</label>
              <input 
                type="text" 
                v-model="houseName" 
                @blur="validateField('houseName')" 
                @input="validateField('houseName')"
                class="w-full p-4 rounded-xl text-sm font-bold outline-none transition border" 
                :class="fieldErrors.houseName ? 'bg-red-50 border-red-500 focus:border-red-500' : 'bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500'" 
                placeholder="E.g. Nabua Heights Residence" 
              />
              <p v-if="fieldErrors.houseName" class="text-[10px] font-bold text-red-600 mt-1 ml-1 flex items-center gap-1">
                <i class="fa-solid fa-circle-exclamation"></i> {{ fieldErrors.houseName }}
              </p>
            </div>

            <div>
              <label class="block text-[10px] font-black uppercase mb-2 ml-1" :class="fieldErrors.contactNumber ? 'text-red-600' : 'text-slate-400'">Contact Number</label>
              <input 
                type="text" 
                inputmode="tel"
                v-model="contactNumber" 
                @keypress="handleOwnerPhoneKeypress"
                @blur="validateField('contactNumber')" 
                @input="handleOwnerPhoneInput"
                class="w-full p-4 rounded-xl text-sm font-bold outline-none transition border" 
                :class="fieldErrors.contactNumber ? 'bg-red-50 border-red-500 focus:border-red-500' : 'bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500'" 
                placeholder="e.g. 09123456789 / 09987654321" 
              />
              <p v-if="fieldErrors.contactNumber" class="text-[10px] font-bold text-red-600 mt-1 ml-1 flex items-center gap-1">
                <i class="fa-solid fa-circle-exclamation"></i> {{ fieldErrors.contactNumber }}
              </p>
              <p v-else class="text-[10px] text-slate-400 font-bold mt-1.5 ml-1">
                <i class="fa-solid fa-circle-info text-blue-500 mr-1"></i> For multiple numbers, separate them using a slash (e.g. <code>09123456789 / 09987654321</code>).
              </p>
            </div>

            <div>
              <label class="block text-[10px] font-black uppercase mb-2 ml-1" :class="fieldErrors.selectedBarangay ? 'text-red-600' : 'text-slate-400'">Official Barangay (Nabua)</label>
              <select 
                v-model="selectedBarangay" 
                @change="validateField('selectedBarangay')"
                class="w-full p-4 rounded-xl text-sm font-bold outline-none transition cursor-pointer border" 
                :class="fieldErrors.selectedBarangay ? 'bg-red-50 border-red-500 focus:border-red-500' : 'bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500'"
              >
                <option value="">Select Barangay</option>
                <option v-for="b in barangaysList" :key="b" :value="b">{{ b }}</option>
              </select>
              <p v-if="fieldErrors.selectedBarangay" class="text-[10px] font-bold text-red-600 mt-1 ml-1 flex items-center gap-1">
                <i class="fa-solid fa-circle-exclamation"></i> {{ fieldErrors.selectedBarangay }}
              </p>
            </div>

            <div>
              <label class="block text-[10px] font-black uppercase mb-2 ml-1" :class="fieldErrors.price ? 'text-red-600' : 'text-slate-400'">Monthly Rent Price (₱)</label>
              <input 
                type="number" 
                v-model="price" 
                @blur="validateField('price')" 
                @input="validateField('price')"
                class="w-full p-4 rounded-xl text-sm font-bold outline-none transition border" 
                :class="fieldErrors.price ? 'bg-red-50 border-red-500 focus:border-red-500' : 'bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500'" 
                placeholder="1500" 
              />
              <p v-if="fieldErrors.price" class="text-[10px] font-bold text-red-600 mt-1 ml-1 flex items-center gap-1">
                <i class="fa-solid fa-circle-exclamation"></i> {{ fieldErrors.price }}
              </p>
            </div>

            <!-- Advance & Deposit Policy -->
            <div class="md:col-span-2 border-t border-slate-100 pt-6 mt-2">
              <h3 class="text-xs font-black text-[#1e4a8d] uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <i class="fa-solid fa-coins" /> Advance &amp; Deposit Policy
              </h3>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Advance Rent</label>
                  <select v-model="advanceMonths" class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition">
                    <option value="0">No Advance</option>
                    <option value="1">1 Month</option>
                    <option value="2">2 Months</option>
                  </select>
                </div>

                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Deposit Duration</label>
                  <select v-model="depositMonths" class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition">
                    <option value="0">No Deposit</option>
                    <option value="1">1 Month</option>
                    <option value="2">2 Months</option>
                  </select>
                </div>

                <div v-if="parseInt(depositMonths) > 0">
                  <label class="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Rent Deposit Type</label>
                  <select v-model="depositType" class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition">
                    <option value="consumable">Consumable (Last Month)</option>
                    <option value="refundable">Refundable (Cash)</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- 3-Way Location -->
            <div class="md:col-span-2 border-t border-slate-100 pt-6 mt-4">
              <h3 class="text-xs font-black text-[#1e4a8d] uppercase tracking-[0.2em] mb-6">
                <i class="fa-solid fa-map-location-dot" /> High-Precision Location Setup
              </h3>
              
              <div class="space-y-8 bg-slate-50/50 p-8 rounded-[2.5rem] border border-slate-100">
                <!-- STEP A: ADDRESS SEARCH -->
                <div>
                  <div class="flex items-center gap-3 mb-4">
                    <div class="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shadow-lg">A</div>
                    <label class="text-[11px] font-black text-slate-900 uppercase tracking-widest">Type your Property Address</label>
                  </div>
                  <div id="autocomplete-wrapper" class="w-full"></div>
                </div>

                <!-- STEP B: MAP VERIFICATION -->
                <div>
                  <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                    <div class="flex items-center gap-3">
                      <div class="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shadow-lg">B</div>
                      <label class="text-[11px] font-black text-slate-900 uppercase tracking-widest">Verify or Pin Exactly on Map</label>
                    </div>
                    <div class="flex gap-2">
                      <button 
                        type="button" 
                        @click="detectMyLocation" 
                        :disabled="isGpsLoading"
                        class="bg-white border border-slate-200 text-slate-600 text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-full shadow-sm hover:bg-blue-50 hover:text-blue-600 transition-all flex items-center gap-2"
                      >
                        <i v-if="isGpsLoading" class="fa-solid fa-spinner fa-spin" />
                        <i v-else class="fa-solid fa-location-crosshairs" /> Use My Current GPS
                      </button>
                      <button 
                        type="button" 
                        @click="toggleFullscreenMap" 
                        class="bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-full shadow-lg hover:bg-blue-600 transition-all flex items-center gap-2"
                      >
                        <i class="fa-solid fa-expand" /> Open Large Map
                      </button>
                    </div>
                  </div>

                  <div 
                    class="rounded-[2.5rem] overflow-hidden border-4 border-white shadow-xl h-[380px] sm:h-[450px] w-full relative bg-slate-50 group cursor-pointer" 
                  >
                    <div ref="mapContainer" class="w-full h-full"></div>
                    <div class="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors flex items-center justify-center" @click="toggleFullscreenMap">
                      <span class="bg-white/90 backdrop-blur-md px-6 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest text-slate-600 shadow-xl border border-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                        <i class="fa-solid fa-hand-pointer" /> Click to Zoom &amp; Adjust Pin
                      </span>
                    </div>
                  </div>

                  <div v-if="pinNeedsConfirmation" class="mt-3 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <i class="fa-solid fa-triangle-exclamation text-amber-500 text-xs mt-0.5"></i>
                    <p class="text-[11px] font-bold text-amber-800 leading-snug">
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

            <div class="md:col-span-2">
              <label class="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Property Description &amp; Rules</label>
              <textarea v-model="description" rows="4" class="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" placeholder="Describe your rooms, house rules (curfews), and environment..."></textarea>
            </div>
          </div>
        </div>

        <!-- ================= STEP 4: AMENITIES CENTER ================= -->
        <div v-show="activeStep === 4" class="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-10 animate-fade-in text-left">
          <div class="flex items-center gap-4 mb-8 border-b border-slate-50 pb-6">
            <div class="bg-orange-100 text-orange-600 w-10 h-10 rounded-full flex items-center justify-center font-black">4</div>
            <h2 class="text-xs font-black text-slate-900 uppercase tracking-[0.2em]">Amenities &amp; Services</h2>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-12">
            <!-- Free Amenities -->
            <div>
              <div class="flex items-center justify-between mb-6">
                <p class="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <i class="fa-solid fa-gift text-green-500"></i> Free Amenities
                </p>
                <div class="flex gap-2">
                  <input 
                    type="text" 
                    v-model="newFreeText" 
                    placeholder="Add custom..." 
                    class="w-32 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold focus:border-green-400 outline-none"
                    @keyup.enter="addCustomAmenity('free')"
                  />
                  <button 
                    type="button" 
                    @click="addCustomAmenity('free')" 
                    class="bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition"
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
                  <input type="checkbox" :value="item" v-model="selectedFree" class="w-4 h-4 rounded border-slate-300 accent-blue-600" />
                  <span class="text-[10px] font-bold text-slate-600 group-hover:text-blue-600">{{ item }}</span>
                </label>
                <!-- Custom Free items -->
                <label 
                  v-for="item in customFree" 
                  :key="item"
                  class="flex items-center gap-3 bg-white p-3 rounded-xl border border-blue-400 cursor-pointer transition group"
                >
                  <input type="checkbox" :value="item" v-model="selectedFree" class="w-4 h-4 rounded border-slate-300 accent-blue-600" />
                  <span class="text-[10px] font-bold text-slate-600 group-hover:text-blue-600">{{ item }}</span>
                </label>
              </div>
            </div>

            <!-- Paid Amenities -->
            <div>
              <div class="flex items-center justify-between mb-6">
                <p class="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <i class="fa-solid fa-coins text-orange-500"></i> Paid (Optional)
                </p>
                <div class="flex gap-2">
                  <input 
                    type="text" 
                    v-model="newPaidText" 
                    placeholder="Add custom..." 
                    class="w-32 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold focus:border-orange-400 outline-none"
                    @keyup.enter="addCustomAmenity('paid')"
                  />
                  <button 
                    type="button" 
                    @click="addCustomAmenity('paid')" 
                    class="bg-orange-100 text-orange-700 hover:bg-orange-200 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition"
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
                  <input type="checkbox" :value="item" v-model="selectedPaid" class="w-4 h-4 rounded border-slate-300 accent-orange-500" />
                  <span class="text-[10px] font-bold text-slate-600 group-hover:text-orange-600">{{ item }}</span>
                </label>
                <!-- Custom Paid items -->
                <label 
                  v-for="item in customPaid" 
                  :key="item"
                  class="flex items-center gap-3 bg-white p-3 rounded-xl border border-orange-400 cursor-pointer transition group"
                >
                  <input type="checkbox" :value="item" v-model="selectedPaid" class="w-4 h-4 rounded border-slate-300 accent-orange-500" />
                  <span class="text-[10px] font-bold text-slate-600 group-hover:text-orange-600">{{ item }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Stepper Navigation Buttons (Prev/Next/Submit) -->
        <div class="flex justify-between items-center max-w-sm mx-auto pt-10 pb-20">
          <button 
            v-if="activeStep > 1" 
            type="button" 
            @click="prevStep" 
            class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-black py-4 px-8 rounded-2xl text-xs uppercase tracking-widest transition"
          >
            Back
          </button>
          <div v-else class="w-20"></div> <!-- Spacer -->

          <button 
            v-if="activeStep < 4" 
            type="button" 
            @click="nextStep" 
            class="bg-[#1e4a8d] hover:bg-black text-white font-black py-4 px-10 rounded-2xl text-xs uppercase tracking-widest transition"
          >
            Next Step
          </button>

          <button 
            v-else 
            type="submit" 
            :disabled="isSaving"
            class="bg-green-600 hover:bg-black text-white font-black py-4 px-10 rounded-2xl text-xs uppercase tracking-widest transition disabled:opacity-50"
          >
            {{ isSaving ? 'Submitting...' : 'Submit Application' }}
          </button>
        </div>

      </form>
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
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fadeIn 0.35s ease-out forwards;
}
</style>