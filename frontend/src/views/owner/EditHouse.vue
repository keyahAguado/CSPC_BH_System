<script setup>
import LoadError from '../../components/management/LoadError.vue';

import OwnerNav from '../../components/partials/OwnerNav.vue';
import PageHeader from '../../components/management/PageHeader.vue';
import '../../styles/management.css';
import '../../styles/admin-theme.css';
import '../../styles/owner-pages.css';
import { vManagementDialog } from '../../components/management/dialogAccessibility.js';
import { validateInput } from '../../utils/inputValidation.js';
import { ref, onMounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import FlashAlert from '../../components/partials/FlashAlert.vue';
import NABUA_BARANGAYS from '../../constants/barangays.js';

const route = useRoute();
const router = useRouter();

const houseId = ref(route.params.id);
const houseName = ref('');
const contactNumber = ref('');
const price = ref('');
const locationAddress = ref('');
const selectedBarangay = ref('');
const mapLink = ref('');
const description = ref('');
const latitude = ref('');
const longitude = ref('');
// True whenever the address text has been typed/edited but not yet confirmed
// via a dropdown selection, GPS fix, or pin drag — meaning latitude/longitude
// still reflect the OLD location while the visible address text shows a new
// one. Without this, saving here would silently keep the stale pin.
const pinNeedsConfirmation = ref(false);
const advanceMonths = ref(1);
const depositMonths = ref(1);
const depositType = ref('refundable');

const barangaysList = ref(NABUA_BARANGAYS);

// Amenities configurations 
const freeAmenities = ref(['Wi-Fi', '24/7 Water', 'CCTV', 'Electric Fan', 'Caretaker', 'Study Area', 'Visitor Area', 'Fire Exit']);
const paidAmenities = ref(['Aircon', 'Laundry', 'Parking', 'Refrigerator', 'Electricity', 'Water Bill', 'Balcony', 'Kitchen Use']);

const selectedFreeAmenities = ref([]);
const selectedPaidAmenities = ref([]);

const newFreeAmenityInput = ref('');
const newPaidAmenityInput = ref('');

// Image references
const houseImgFile = ref(null);
const mainHouseImgPreview = ref('');
const mainImageOnRecord = ref('');

// Dynamic Additional Photo Upload Section 
const selectedPhotos = ref([]); 
const maxPhotosLimit = 10; 

const isLoading = ref(true);
const isSubmitting = ref(false);
const isGpsLoading = ref(false);
const showFullscreenMap = ref(false);

const alertRef = ref(null);
const token = sessionStorage.getItem('cspc_token');
import { getImageUrl } from '../../config/api';

// Google Maps Refs
const mapContainer = ref(null);
const largeMapContainer = ref(null);

let googleInstance = null;
let mapInstance = null;
let markerInstance = null;
let largeMapInstance = null;
let largeMarkerInstance = null;

const showSystemAlert = (message, type = 'error') => {
  if (alertRef.value) alertRef.value.showSystemAlert(message, type);
};

// MULTI-PASS COMPLIANT PARSER: Unpacks double-serialized JSON strings securely
const parseAmenities = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  let temp = val;
  while (typeof temp === 'string') {
    try {
      const parsed = JSON.parse(temp);
      if (temp === parsed) break; // Halts infinite loops for literal strings
      temp = parsed;
    } catch (e) {
      return temp.split(',').map(item => item.trim()).filter(Boolean);
    }
  }
  return Array.isArray(temp) ? temp : [];
};

// Apple HEIC Transcoder dependency loader
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
    showSystemAlert("Processing iPhone photo format...", "info");
    await loadScript('https://unpkg.com/heic2any@0.0.4/dist/heic2any.min.js');
    
    const resultBlob = await window.heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.8
    });

    const convertedBlob = Array.isArray(resultBlob) ? resultBlob[0] : resultBlob;
    const sanitizedName = file.name.replace(/\.[^/.]+$/, "") + ".jpeg";

    return new File([convertedBlob], sanitizedName, { type: 'image/jpeg' });
  } catch (err) {
    console.error("[DECODER] Apple photo conversion crashed:", err);
    return file;
  }
};

const addCustomAmenity = (type) => {
  if (type === 'free') {
    const value = newFreeAmenityInput.value.trim();
    if (value) {
      if (!freeAmenities.value.includes(value)) freeAmenities.value.push(value);
      if (!selectedFreeAmenities.value.includes(value)) selectedFreeAmenities.value.push(value);
      newFreeAmenityInput.value = '';
    }
  } else if (type === 'paid') {
    const value = newPaidAmenityInput.value.trim();
    if (value) {
      if (!paidAmenities.value.includes(value)) paidAmenities.value.push(value);
      if (!selectedPaidAmenities.value.includes(value)) selectedPaidAmenities.value.push(value);
      newPaidAmenityInput.value = '';
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
};

// Modern Google Places Autocomplete & Advanced Marker initialization
const NABUA_CENTER = { lat: 13.4072, lng: 123.3748 };
const NABUA_BOUNDS = {
  north: 13.4500,
  south: 13.3700,
  east: 123.4100,
  west: 123.3300
};

const initGoogleMap = async () => {
  const mapContainerEl = mapContainer.value;
  if (!mapContainerEl) return;

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
      mapId: 'CSPC_EDIT_MAP_SMALL'
    });

    markerInstance = new AdvancedMarkerElement({
      position: myLatLng,
      map: mapInstance,
      gmpDraggable: true,
      title: houseName.value || "Property Location"
    });

    markerInstance.addListener('gmp-dragend', () => {
      const pos = markerInstance.position;
      if (pos) {
        const lat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
        const lng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;
        if (lat < NABUA_BOUNDS.south || lat > NABUA_BOUNDS.north ||
            lng < NABUA_BOUNDS.west  || lng > NABUA_BOUNDS.east) {
          showSystemAlert('Only locations within Nabua, Camarines Sur are allowed (Iriga and Bato are excluded).', 'warning');
          return;
        }
        updateCoords(lat, lng);
        reverseGeocode(lat, lng);
      }
    });

    await nextTick();
    const wrapper = document.getElementById('autocomplete-wrapper');
    if (wrapper) {
      wrapper.innerHTML = '';
      
      const autocompleteEl = new PlaceAutocompleteElement({
        componentRestrictions: { country: "ph" },
        includedRegionCodes: ['ph'],
        locationRestriction: NABUA_BOUNDS
      });

      autocompleteEl.placeholder = 'Type boarding house address or street name...';
      autocompleteEl.style.width = '100%';
      autocompleteEl.style.border = '1px solid #cbd5e1'; 
      autocompleteEl.style.borderRadius = '0.75rem'; 
      autocompleteEl.style.padding = '0.85rem'; 
      autocompleteEl.style.backgroundColor = '#f8fafc';
      autocompleteEl.style.outline = 'none';
      autocompleteEl.style.fontSize = '0.875rem'; 
      autocompleteEl.style.fontWeight = '600'; 
      autocompleteEl.style.color = '#000000';

      if (locationAddress.value) {
        autocompleteEl.value = locationAddress.value;
      }

      wrapper.appendChild(autocompleteEl);

      // Typing changes the visible text without moving the pin — flag it as
      // unconfirmed until the owner actually picks a suggestion (or uses
      // GPS/drags the pin, which clear the flag in updateCoords).
      autocompleteEl.addEventListener('input', () => {
        pinNeedsConfirmation.value = true;
      });

      autocompleteEl.addEventListener('gmp-select', async (event) => {
        const prediction = event.placePrediction;
        if (!prediction) return;

        const place = prediction.toPlace();
        await place.fetchFields({ fields: ['location', 'formattedAddress'] });

        if (place.location) {
          const lat = place.location.lat();
          const lng = place.location.lng();
          const addr = (place.formattedAddress || '').toLowerCase();

          // Reject Iriga, Bato, and points outside strict Nabua bounds
          if (addr.includes('iriga') || addr.includes('bato') ||
              lat < NABUA_BOUNDS.south || lat > NABUA_BOUNDS.north ||
              lng < NABUA_BOUNDS.west  || lng > NABUA_BOUNDS.east) {
            showSystemAlert('Only locations within Nabua, Camarines Sur are allowed (Iriga and Bato are excluded).', 'warning');
            return;
          }

          updateCoords(lat, lng);
          locationAddress.value = place.formattedAddress || '';
        }
      });
    }
  } catch (err) {
    console.error("Failed loading Maps libraries:", err);
  }
};

const updateCoords = (lat, lng) => {
  latitude.value = lat.toFixed(8);
  longitude.value = lng.toFixed(8);
  pinNeedsConfirmation.value = false;

  const openInMapsBtn = document.getElementById('openInMapsBtn');
  if (openInMapsBtn) {
    openInMapsBtn.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  
  if (mapInstance && markerInstance) {
    mapInstance.setCenter({ lat, lng });
    markerInstance.position = { lat, lng };
  }
  if (largeMapInstance && largeMarkerInstance) {
    largeMapInstance.setCenter({ lat, lng });
    largeMarkerInstance.position = { lat, lng };
  }
};

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
    /place\/[^\/]*\/@?(-?\d+\.\d+),(-?\d+\.\d+)/,
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

  if (extractCoordsFromString(raw)) return;

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

        // Friendly alert if current GPS position is outside Nabua area
        if (lat < NABUA_BOUNDS.south || lat > NABUA_BOUNDS.north ||
            lng < NABUA_BOUNDS.west  || lng > NABUA_BOUNDS.east) {
          showSystemAlert(`Notice: GPS detected location outside Nabua area (${lat.toFixed(5)}, ${lng.toFixed(5)}). Address recorded successfully.`, 'warning');
        }
      },
      (err) => {
        console.error("GPS Error:", err);
        alert("Could not detect precise GPS location. Please check browser location permissions.");
        isGpsLoading.value = false;
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  } else {
    alert("Geolocation is not supported by your browser.");
    isGpsLoading.value = false;
  }
};

const reverseGeocode = (lat, lng) => {
  if (!googleInstance) return;
  const geocoder = new googleInstance.maps.Geocoder();
  geocoder.geocode({ location: { lat, lng } }, (results, status) => {
    if (status === 'OK' && results && results.length > 0) {
      // Find the most detailed result that isn't a pure Plus Code result
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

      // Philippine address order: street/route, barangay, municipality/city, province, country
      const parts = [
        get('street_number') && get('route') ? `${get('street_number')} ${get('route')}` : get('route'),
        get('sublocality_level_1', 'sublocality', 'neighborhood'),  // Barangay
        get('locality', 'administrative_area_level_3'),              // Municipality / City
        get('administrative_area_level_2'),                          // Province
        get('country')
      ].filter(Boolean);

      if (parts.length >= 2) {
        locationAddress.value = parts.join(', ');
      } else {
        // Fallback: strip leading Plus Code segment
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

const toggleFullscreenMap = () => {
  showFullscreenMap.value = !showFullscreenMap.value;
  
  if (showFullscreenMap.value) {
    setTimeout(() => {
      const lat = parseFloat(latitude.value) || 13.4079;
      const lng = parseFloat(longitude.value) || 123.3751;
      const pos = { lat, lng };

      if (!largeMapInstance) {
        const { AdvancedMarkerElement } = googleInstance.maps.marker;

        largeMapInstance = new googleInstance.maps.Map(largeMapContainer.value, {
          zoom: 18,
          center: pos,
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: false,
          mapId: 'CSPC_EDIT_MAP_LARGE'
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

const handleHouseImgChange = async (e) => {
  const file = e.target.files[0];
  if (file) {
    const processedFile = await transcodeHeicFile(file);
    houseImgFile.value = processedFile;
    mainHouseImgPreview.value = URL.createObjectURL(processedFile);
  }
};

const handlePhotosSelected = async (e) => {
  const files = Array.from(e.target.files);
  if (selectedPhotos.value.length + files.length > maxPhotosLimit) {
    alert(`You can only upload a maximum of ${maxPhotosLimit} property photos.`);
    return;
  }

  for (const file of files) {
    const processedFile = await transcodeHeicFile(file);
    selectedPhotos.value.push({
      file: processedFile,
      previewUrl: URL.createObjectURL(processedFile),
      dbValue: null
    });
  }
};

const removePhoto = (index) => {
  if (selectedPhotos.value[index].previewUrl.startsWith('blob:')) {
    URL.revokeObjectURL(selectedPhotos.value[index].previewUrl);
  }
  selectedPhotos.value.splice(index, 1);
};

const loadHouseDetails = async () => {
  loadError.value = '';
  let mapApiKey = '';
  try {
    isLoading.value = true;
    const response = await axios.get(`/api/owner/edit/${houseId.value}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      const houseData = response.data.house;
      mapApiKey = response.data.googleMapsApiKey;

      if (houseData) {
        houseName.value = houseData.name || '';
        contactNumber.value = houseData.phone_contact || '';
        price.value = houseData.price || '';
        locationAddress.value = houseData.location || '';
        selectedBarangay.value = houseData.barangay || '';
        mapLink.value = houseData.map_link || '';
        description.value = houseData.description || '';
        latitude.value = houseData.latitude ? parseFloat(houseData.latitude).toFixed(8) : '';
        longitude.value = houseData.longitude ? parseFloat(houseData.longitude).toFixed(8) : '';
        advanceMonths.value = houseData.advance_months !== undefined ? houseData.advance_months : 1;
        depositMonths.value = houseData.deposit_months !== undefined ? houseData.deposit_months : 1;
        depositType.value = houseData.deposit_type || 'refundable';

        mainImageOnRecord.value = houseData.img || '';
        if (mainImageOnRecord.value) {
          mainHouseImgPreview.value = getImageUrl(mainImageOnRecord.value);
        }

        selectedPhotos.value = [];
        // Load from house_photos table (up to 10), fall back to img_1/2/3 if empty
        const photosFromServer = response.data.photos || [];
        const legacyPhotos = [houseData.img_1, houseData.img_2, houseData.img_3].filter(Boolean);
        const photoList = photosFromServer.length > 0 ? photosFromServer : legacyPhotos;
        photoList.forEach(url => {
          selectedPhotos.value.push({ file: null, previewUrl: getImageUrl(url), dbValue: url });
        });

        selectedFreeAmenities.value = parseAmenities(houseData.amenities_free);
        selectedPaidAmenities.value = parseAmenities(houseData.amenities_paid);

        selectedFreeAmenities.value.forEach(tag => {
          if (!freeAmenities.value.includes(tag)) freeAmenities.value.push(tag);
        });
        selectedPaidAmenities.value.forEach(tag => {
          if (!paidAmenities.value.includes(tag)) paidAmenities.value.push(tag);
        });
      }
    }
  } catch (error) {
    loadError.value = 'The server did not return these records. Refresh the page to try again.';
    console.error('Failed to load edit details:', error);
  } finally {
    isLoading.value = false;
    await nextTick();

    setOptions({
      key: mapApiKey || import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
      v: 'weekly'
    });

    await importLibrary('maps');
    await importLibrary('marker');
    await importLibrary('places');

    googleInstance = window.google;
    await initGoogleMap();
  }
};

const handleSubmit = async () => {
  if (isSubmitting.value) return;
  const validationError = validateInput('property', { house_name: houseName.value, location: locationAddress.value, price: price.value, contact_number: contactNumber.value, latitude: latitude.value, longitude: longitude.value, advance_months: advanceMonths.value, deposit_months: depositMonths.value, deposit_type: depositType.value, description: description.value, map_link: mapLink.value });
  if (validationError) { showSystemAlert(validationError, 'error'); return; }
  if (pinNeedsConfirmation.value) {
    showSystemAlert('You edited the address but haven\'t confirmed a new location — pick a suggestion from the dropdown, use GPS, or drag the pin before saving.', 'warning');
    return;
  }
  try {
    isSubmitting.value = true;
    const formData = new FormData();

    formData.append('house_name', houseName.value);
    formData.append('location', locationAddress.value);
    formData.append('barangay', selectedBarangay.value || '');
    formData.append('price', price.value);
    formData.append('contact_number', contactNumber.value);
    formData.append('map_link', mapLink.value);
    formData.append('description', description.value || '');
    formData.append('latitude', latitude.value);
    formData.append('longitude', longitude.value);
    formData.append('advance_months', advanceMonths.value);
    formData.append('deposit_months', depositMonths.value);
    formData.append('deposit_type', depositType.value);
    
    formData.append('amenities_free', JSON.stringify(selectedFreeAmenities.value));
    formData.append('amenities_paid', JSON.stringify(selectedPaidAmenities.value));

    if (houseImgFile.value) {
      formData.append('img', houseImgFile.value);
    } else {
      formData.append('existing_img', mainImageOnRecord.value);
    }

    // Send existing photo URLs as JSON array
    const existingPhotos = selectedPhotos.value.filter(p => !p.file).map(p => p.dbValue || '').filter(Boolean);
    formData.append('existing_photos', JSON.stringify(existingPhotos));

    // Send new photo files individually
    selectedPhotos.value.forEach((p, idx) => {
      if (p.file) {
        formData.append(`new_photo_${idx}`, p.file);
      }
    });

    const response = await axios.post(`/api/owner/edit/${houseId.value}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.data.success) {
      if (!latitude.value || !longitude.value) {
        showSystemAlert('Saved, but no GPS pin is set — this listing will be hidden from the public Map View until you add one.', 'warning');
      } else {
        showSystemAlert('Boarding house updated successfully!', 'success');
      }
      setTimeout(() => {
        router.push('/owner/dashboard');
      }, 1500);
    }
  } catch (error) {
    console.error('Update failed:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to update boarding house.', 'error');
  } finally {
    isSubmitting.value = false;
  }
};

watch(mapLink, (newVal) => {
  extractCoords(newVal);
});

onMounted(() => {
  loadHouseDetails();
});

const loadError = ref('');
</script>

<template>
  <div class="management-page owner-page min-h-screen font-sans flex flex-col">
    <OwnerNav />
    <main id="management-content" tabindex="-1" class="management-content eh-main">
      <LoadError :message="loadError" />
      <PageHeader title="Edit property" :eyebrow="houseName">
        <router-link to="/owner/dashboard" class="eh-btn eh-btn-ghost">Cancel</router-link>
        <button v-if="!isLoading" type="submit" form="eh-form" :disabled="isSubmitting" class="eh-btn eh-btn-primary">
          <i :class="isSubmitting ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-check'" aria-hidden="true"></i>
          {{ isSubmitting ? 'Saving…' : 'Save changes' }}
        </button>
      </PageHeader>
    <div aria-live="polite" aria-atomic="false"><FlashAlert ref="alertRef" /></div>

    <!-- Fullscreen Verification Map Modal -->
    <div v-management-dialog="{ close: () => toggleFullscreenMap() }" v-if="showFullscreenMap" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex flex-col p-4 sm:p-10 animate-fade-in">
      <div class="max-w-6xl mx-auto w-full h-full flex flex-col bg-white rounded-[2rem] sm:rounded-[3rem] overflow-hidden shadow-2xl relative">
        <div class="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 class="text-base sm:text-xl font-semibold text-slate-900 tracking-tight">Pin your location</h3>
            <p class="text-[12px] font-semibold text-slate-400">Adjust the map pin precisely</p>
          </div>
          <button aria-label="Close dialog" type="button" @click="toggleFullscreenMap" class="bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all management-button">
            <i class="fa-solid fa-xmark text-lg sm:text-xl"></i>
          </button>
        </div>
        <div ref="largeMapContainer" class="flex-1 bg-slate-100"></div>
        <div class="p-4 sm:p-6 bg-white border-t border-slate-100 flex justify-center">
          <button type="button" @click="toggleFullscreenMap" class="bg-blue-600 text-white font-semibold px-8 sm:px-12 py-3 sm:py-4 rounded-2xl text-[13px] shadow-xl hover:bg-black transition-all management-button management-button-primary">
            Save &amp; confirm location
          </button>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="eh-card eh-loading" role="status">
      <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading details…
    </div>

    <form v-else id="eh-form" @submit.prevent="handleSubmit" class="eh-grid">

      <!-- Column 1: photos + amenities -->
      <div class="eh-col">
        <section class="eh-card">
          <h2 class="eh-title"><span class="eh-bar" aria-hidden="true"></span>Photos</h2>
          <div class="eh-cover">
            <img class="eh-cover-photo" :src="mainHouseImgPreview" :alt="houseName" @error="e => e.target.src = '/img/cspc_bg.webp'" />
            <label class="eh-cover-change">
              <i class="fa-solid fa-camera" aria-hidden="true"></i> Change main photo
              <input aria-label="Main Boarding House Photo" type="file" @change="handleHouseImgChange" accept="image/*" class="eh-sr" />
            </label>
          </div>

          <div class="eh-row-head">
            <span class="eh-label">Interior photos <small>max 10</small></span>
            <label class="eh-btn eh-btn-soft eh-btn-sm">
              <i class="fa-solid fa-plus" aria-hidden="true"></i> Add photos
              <input aria-label="Additional Interior Photos" type="file" multiple accept="image/*" @change="handlePhotosSelected" class="eh-sr" />
            </label>
          </div>
          <div v-if="selectedPhotos.length > 0" class="eh-thumbs">
            <div v-for="(photo, index) in selectedPhotos" :key="index" class="eh-thumb">
              <img :src="photo.previewUrl" alt="Interior preview" />
              <button aria-label="Remove photo" type="button" @click="removePhoto(index)" class="eh-thumb-del">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <p v-else class="eh-hint">No interior photos yet.</p>
        </section>

        <section class="eh-card">
          <h2 class="eh-title"><span class="eh-bar" aria-hidden="true"></span>Amenities</h2>
          <div v-for="group in [{ key: 'free', label: 'Free', icon: 'fa-gift', items: freeAmenities, model: 'free' }, { key: 'paid', label: 'Paid', icon: 'fa-coins', items: paidAmenities, model: 'paid' }]" :key="group.key" class="eh-amen-group">
            <div class="eh-row-head">
              <span :class="['eh-label', 'is-' + group.key]"><i :class="['fa-solid', group.icon]" aria-hidden="true"></i> {{ group.label }}</span>
              <div class="eh-add">
                <input v-if="group.key === 'free'" aria-label="Add custom free amenity" type="text" v-model="newFreeAmenityInput" placeholder="Add custom…" @keydown.enter.prevent="addCustomAmenity('free')" />
                <input v-else aria-label="Add custom paid amenity" type="text" v-model="newPaidAmenityInput" placeholder="Add custom…" @keydown.enter.prevent="addCustomAmenity('paid')" />
                <button type="button" @click="addCustomAmenity(group.key)" class="eh-btn eh-btn-soft eh-btn-sm">Add</button>
              </div>
            </div>
            <div class="eh-chips">
              <label v-for="item in group.items" :key="item" :class="['eh-chip', 'is-' + group.key]">
                <input v-if="group.key === 'free'" :aria-label="item" type="checkbox" :value="item" v-model="selectedFreeAmenities" />
                <input v-else :aria-label="item" type="checkbox" :value="item" v-model="selectedPaidAmenities" />
                <i class="fa-solid fa-check" aria-hidden="true"></i>
                <span>{{ item }}</span>
              </label>
            </div>
          </div>
        </section>
      </div>

      <!-- Column 2: details -->
      <section class="eh-card eh-col">
        <h2 class="eh-title"><span class="eh-bar" aria-hidden="true"></span>Property details</h2>
        <div class="eh-fields">
          <div class="eh-span-2">
            <label class="eh-label" for="eh-name">Boarding house name</label>
            <input id="eh-name" type="text" v-model="houseName" required class="eh-input" />
          </div>
          <div>
            <label class="eh-label" for="eh-price">Monthly rent (₱)</label>
            <input id="eh-price" type="number" min="0.01" max="99999999.99" step="0.01" v-model="price" required class="eh-input" />
          </div>
          <div>
            <label class="eh-label" for="eh-brgy">Barangay (Nabua)</label>
            <select id="eh-brgy" v-model="selectedBarangay" required class="eh-input">
              <option value="">Select barangay</option>
              <option v-for="b in barangaysList" :key="b" :value="b">{{ b }}</option>
            </select>
          </div>
          <div class="eh-span-2">
            <label class="eh-label" for="eh-phone">Contact number</label>
            <input id="eh-phone" type="text" inputmode="tel" v-model="contactNumber" @keypress="handleOwnerPhoneKeypress" @input="handleOwnerPhoneInput" placeholder="09123456789 / 09987654321" required class="eh-input" />
            <p class="eh-hint"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Separate multiple numbers with a slash.</p>
          </div>
        </div>

        <div class="eh-sub">
          <p class="eh-sub-title"><i class="fa-solid fa-coins" aria-hidden="true"></i> Advance &amp; deposit policy</p>
          <div class="eh-fields eh-fields-3">
            <div>
              <label class="eh-label" for="eh-adv">Advance rent</label>
              <select id="eh-adv" v-model="advanceMonths" class="eh-input">
                <option :value="0">No advance</option>
                <option :value="1">1 month</option>
                <option :value="2">2 months</option>
              </select>
            </div>
            <div>
              <label class="eh-label" for="eh-dep">Deposit</label>
              <select id="eh-dep" v-model="depositMonths" class="eh-input">
                <option :value="0">No deposit</option>
                <option :value="1">1 month</option>
                <option :value="2">2 months</option>
              </select>
            </div>
            <div v-show="depositMonths > 0">
              <label class="eh-label" for="eh-deptype">Deposit type</label>
              <select id="eh-deptype" v-model="depositType" class="eh-input">
                <option value="consumable">Consumable</option>
                <option value="refundable">Refundable</option>
              </select>
            </div>
          </div>
        </div>

        <div class="eh-grow">
          <label class="eh-label" for="eh-desc">Description &amp; house rules</label>
          <textarea id="eh-desc" v-model="description" class="eh-input eh-textarea"></textarea>
        </div>
      </section>

      <!-- Column 3: location -->
      <section class="eh-card eh-col eh-col-location">
        <div class="eh-row-head">
          <h2 class="eh-title"><span class="eh-bar" aria-hidden="true"></span>Location</h2>
          <div class="eh-map-actions">
            <button type="button" @click="detectMyLocation" :disabled="isGpsLoading" class="eh-btn eh-btn-soft eh-btn-sm">
              <i :class="isGpsLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-location-crosshairs'" aria-hidden="true"></i> Use GPS
            </button>
            <button type="button" @click="toggleFullscreenMap" class="eh-btn eh-btn-dark eh-btn-sm">
              <i class="fa-solid fa-expand" aria-hidden="true"></i> Large map
            </button>
          </div>
        </div>

        <div>
          <span class="eh-label"><span class="eh-step">A</span> Search your property address</span>
          <div id="autocomplete-wrapper" class="w-full"></div>
        </div>

        <div class="eh-map-block">
          <span class="eh-label"><span class="eh-step">B</span> Verify or pin exactly on the map</span>
          <div class="eh-map group">
            <div id="map" ref="mapContainer" class="w-full h-full"></div>
            <div class="eh-map-overlay" @click="toggleFullscreenMap">
              <span><i class="fa-solid fa-hand-pointer" aria-hidden="true"></i> Click to zoom &amp; adjust pin</span>
            </div>
          </div>
        </div>

        <div v-if="!latitude || !longitude" class="eh-warn">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
          <p>No GPS pin set yet. Without a location, this listing won't appear on the public Map View and students can't get walking directions from CSPC.</p>
        </div>
        <div v-else-if="pinNeedsConfirmation" class="eh-warn">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
          <p>Address changed but the pin hasn't moved. Pick a suggestion, use GPS, or drag the pin — otherwise the old location is kept.</p>
        </div>

        <!-- Hidden inputs -->
        <input type="hidden" v-model="latitude" />
        <input type="hidden" v-model="longitude" />
      </section>
    </form>

    </main>
</div>
</template>

<style>
.pac-container {
  border-radius: 1rem !important;
  border: 1px solid #e2e8f0 !important;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1) !important;
  padding: 0.5rem !important;
  margin-top: 5px !important;
  z-index: 9999 !important;
}
</style>

<style scoped>
/* Edit property: full-width card grid that fits one screen on desktop (same card language as Profile) */
.eh-main { display: flex; flex-direction: column; padding-top: 24px !important; padding-bottom: 24px !important; }
.eh-main :deep(.management-page-header) { margin-bottom: 18px; }
.eh-grid { flex: 1; display: grid; gap: 18px; grid-template-columns: minmax(0, 1fr); align-items: stretch; }
@media (min-width: 900px) { .eh-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .eh-col-location { grid-column: 1 / -1; } }
@media (min-width: 1360px) {
  .eh-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.15fr); }
  .eh-col-location { grid-column: auto; }
}
.eh-col { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.eh-card { background: #fff; border: 1px solid var(--a-border); border-radius: 18px; padding: 18px 20px; box-shadow: var(--a-shadow); min-width: 0; }
section.eh-card.eh-col { gap: 16px; }
.eh-col > .eh-card:last-child { flex: 1; }
.eh-loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 48px; color: var(--a-muted); font-weight: 600; }

.eh-title { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; font-size: 17px !important; font-weight: 700 !important; color: var(--a-heading); }
section.eh-col > .eh-title, .eh-row-head .eh-title { margin-bottom: 0; }
.eh-bar { width: 5px; height: 20px; border-radius: 999px; background: var(--a-primary); }
.eh-row-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; margin: 14px 0 10px; }
.eh-col-location > .eh-row-head:first-child { margin-top: 0; margin-bottom: 0; }
.eh-label { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 12.5px; font-weight: 600; color: var(--a-muted); }
.eh-row-head .eh-label { margin-bottom: 0; }
.eh-label small { font-weight: 500; color: var(--a-faint); }
.eh-label.is-free i { color: #059669; }
.eh-label.is-paid i { color: #e11d48; }
.eh-hint { margin: 6px 0 0; font-size: 12px; color: var(--a-faint); }
.eh-hint i { color: var(--a-primary); margin-right: 4px; }
.eh-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* Buttons */
.eh-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 42px; padding: 0 18px; border-radius: 10px; border: 1px solid transparent; font-size: 13.5px; font-weight: 600; text-decoration: none; cursor: pointer; transition: background .15s, border-color .15s, color .15s; }
.eh-btn-sm { height: 34px; padding: 0 12px; font-size: 12.5px; border-radius: 9px; }
.eh-btn-primary { background: var(--a-primary); color: #fff; box-shadow: 0 4px 12px rgba(30, 74, 141, .22); }
.eh-btn-primary:hover:not(:disabled) { background: var(--a-primary-strong); }
.eh-btn-ghost { background: #fff; border-color: var(--a-border); color: var(--a-text); }
.eh-btn-ghost:hover { background: var(--a-surface-2); }
.eh-btn-soft { background: var(--a-primary-soft); color: var(--a-primary); }
.eh-btn-soft:hover:not(:disabled) { background: var(--a-primary-tint); }
.eh-btn-soft:focus-within { outline: 3px solid #7fa6db; outline-offset: 2px; }
.eh-btn-dark { background: var(--a-heading); color: #fff; }
.eh-btn-dark:hover { background: var(--a-primary); }

/* Photos */
.eh-cover { position: relative; aspect-ratio: 16 / 9; border-radius: 14px; overflow: hidden; background: #0f1f36; }
.eh-cover img { position: absolute; inset: 0; width: 100%; height: 100%; }
.eh-cover-photo { object-fit: cover; object-position: center; }
.eh-cover-change { position: absolute; right: 10px; bottom: 10px; display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; border-radius: 9px; background: rgba(255, 255, 255, .94); color: var(--a-heading); font-size: 12.5px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(15, 31, 54, .25); transition: background .15s; }
.eh-cover-change:hover { background: #fff; }
.eh-cover-change:focus-within { outline: 3px solid #7fa6db; outline-offset: 2px; }
.eh-thumbs { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.eh-thumb { position: relative; aspect-ratio: 1; border-radius: 10px; overflow: hidden; border: 1px solid var(--a-border); }
.eh-thumb img { width: 100%; height: 100%; object-fit: cover; }
.eh-thumb-del { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; border-radius: 999px; border: 0; background: rgba(169, 60, 52, .92); color: #fff; font-size: 11px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.eh-thumb-del:hover { background: #8f2f28; }

/* Amenities */
.eh-amen-group + .eh-amen-group { margin-top: 14px; border-top: 1px dashed var(--a-border); }
.eh-amen-group:first-of-type .eh-row-head { margin-top: 0; }
.eh-add { display: flex; gap: 6px; }
.eh-add input { width: 130px; height: 34px; min-height: 34px !important; padding: 0 10px; border: 1px solid var(--a-border); border-radius: 9px !important; background: var(--a-surface-2); font-size: 12.5px; }
.eh-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.eh-chip { position: relative; display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--a-border); background: #fff; color: var(--a-text); font-size: 12.5px; font-weight: 600; cursor: pointer; transition: background .15s, border-color .15s, color .15s; }
.eh-chip input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.eh-chip i { display: none; font-size: 10px; }
.eh-chip:hover { border-color: var(--a-primary-tint); background: var(--a-surface-2); }
.eh-chip:focus-within { outline: 3px solid #7fa6db; outline-offset: 1px; }
.eh-chip.is-free:has(input:checked) { background: #e3f6ea; border-color: #9fd8b7; color: #1d7a45; }
.eh-chip.is-paid:has(input:checked) { background: #fff1f2; border-color: #fecdd3; color: #be123c; }
.eh-chip:has(input:checked) i { display: inline; }

/* Details */
.eh-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 14px; }
.eh-fields-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.eh-span-2 { grid-column: 1 / -1; }
.eh-input { width: 100%; height: 42px; min-height: 42px !important; padding: 0 12px; border: 1px solid var(--a-border); border-radius: 10px !important; background: var(--a-surface-2); color: var(--a-heading); font-size: 14px; font-weight: 600; outline: none; transition: background .15s, border-color .15s; }
.eh-input:focus { background: #fff; }
.eh-sub { padding: 14px; border-radius: 14px; background: var(--a-surface-2); border: 1px solid var(--a-border); }
.eh-sub .eh-input { background: #fff; }
.eh-sub-title { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; font-size: 13px; font-weight: 700; color: var(--a-heading); }
.eh-sub-title i { color: var(--a-gold); }
.eh-grow { flex: 1; display: flex; flex-direction: column; min-height: 120px; }
.eh-textarea { flex: 1; height: auto; min-height: 110px !important; padding: 10px 12px; line-height: 1.55; font-weight: 500; resize: vertical; }

/* Location */
.eh-map-actions { display: flex; gap: 8px; }
.eh-step { width: 20px; height: 20px; border-radius: 999px; background: var(--a-primary); color: #fff; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.eh-map-block { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.eh-map { position: relative; flex: 1; min-height: 300px; border-radius: 14px; overflow: hidden; border: 1px solid var(--a-border); background: var(--a-surface-2); cursor: pointer; }
.eh-map-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(15, 31, 54, .04); transition: background .15s; }
.eh-map-overlay span { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; background: rgba(255, 255, 255, .94); color: var(--a-heading); font-size: 12.5px; font-weight: 600; box-shadow: 0 4px 12px rgba(15, 31, 54, .18); opacity: 0; transition: opacity .15s; }
.eh-map:hover .eh-map-overlay { background: transparent; }
.eh-map:hover .eh-map-overlay span { opacity: 1; }
.eh-warn { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 10px; background: var(--a-warning-soft); border: 1px solid #f1d9b5; }
.eh-warn i { color: var(--a-gold); margin-top: 2px; font-size: 13px; }
.eh-warn p { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--a-warning); font-weight: 500; }

@media (max-width: 560px) {
  .eh-fields, .eh-fields-3 { grid-template-columns: minmax(0, 1fr); }
  .eh-thumbs { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .eh-add { width: 100%; }
  .eh-add input { flex: 1; width: auto; }
  .eh-main :deep(.management-header-actions) { width: 100%; }
  .eh-main :deep(.management-header-actions) .eh-btn { flex: 1; }
}
</style>