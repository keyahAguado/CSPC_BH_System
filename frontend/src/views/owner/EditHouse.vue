<script setup>
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
</script>

<template>
  <div class="bg-slate-900/65 min-h-screen flex items-center justify-center p-2 sm:p-6 backdrop-blur-sm font-sans overflow-x-hidden">
    <FlashAlert ref="alertRef" />

    <!-- Fullscreen Verification Map Modal -->
    <div v-if="showFullscreenMap" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex flex-col p-4 sm:p-10 animate-fade-in">
      <div class="max-w-6xl mx-auto w-full h-full flex flex-col bg-white rounded-[2rem] sm:rounded-[3rem] overflow-hidden shadow-2xl relative">
        <div class="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 class="text-base sm:text-xl font-black text-slate-900 uppercase tracking-tight">Pin Your Location</h3>
            <p class="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Adjust the map pin precisely</p>
          </div>
          <button type="button" @click="toggleFullscreenMap" class="bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all">
            <i class="fa-solid fa-xmark text-lg sm:text-xl"></i>
          </button>
        </div>
        <div ref="largeMapContainer" class="flex-1 bg-slate-100"></div>
        <div class="p-4 sm:p-6 bg-white border-t border-slate-100 flex justify-center">
          <button type="button" @click="toggleFullscreenMap" class="bg-blue-600 text-white font-black px-8 sm:px-12 py-3 sm:py-4 rounded-2xl uppercase text-[10px] sm:text-[11px] tracking-[0.2em] shadow-xl hover:bg-black transition-all">
            Save &amp; Confirm Location
          </button>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="bg-white rounded-2xl w-full max-w-4xl p-12 text-center flex flex-col items-center justify-center">
      <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
      <p class="text-slate-400 font-bold uppercase text-[9px] tracking-widest">Loading details...</p>
    </div>

    <!-- Modal Content -->
    <div v-else class="bg-white rounded-2xl w-full max-w-4xl shadow-2xl my-6 overflow-hidden relative text-left animate-in zoom-in duration-300">
      
      <!-- Header -->
      <div class="bg-slate-50 border-b border-slate-200 px-4 sm:px-8 py-4 sm:py-5 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <h2 class="font-black text-[11px] sm:text-xs tracking-[0.2em] sm:tracking-[0.3em] uppercase text-black">Edit Boarding House</h2>
        <router-link to="/owner/dashboard" class="text-slate-400 hover:text-black transition focus:outline-none">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </router-link>
      </div>

      <!-- Form Body -->
      <div class="p-4 sm:p-8 md:p-12 overflow-y-auto max-h-[75vh]">
        
        <div class="mb-8 sm:mb-12 border-b border-slate-100 pb-8 sm:pb-10">
          <div class="flex flex-col md:flex-row gap-6 sm:gap-8 items-center md:items-start">
            <div class="w-full md:w-64 h-48 rounded-2xl overflow-hidden shadow-md border border-slate-100 shrink-0 bg-slate-50">
              <img :src="mainHouseImgPreview" :alt="houseName"
                   class="w-full h-full object-cover rounded-2xl shadow-sm"
                   @error="e => e.target.src = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'" />
            </div>
            <div class="flex-1 text-center md:text-left py-2 sm:py-4 w-full">
              <div class="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-3 sm:gap-4 mb-3">
                <i class="fa-solid fa-building-circle-check text-3xl sm:text-4xl text-blue-600"></i>
                <h2 class="text-2xl sm:text-4xl font-black text-slate-900 uppercase tracking-tighter leading-tight break-all">{{ houseName }}</h2>
              </div>
              <div class="flex items-center justify-center md:justify-start gap-2 text-slate-500 mb-6 sm:mb-8">
                <i class="fa-solid fa-location-dot text-blue-500 shrink-0"></i>
                <span class="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] break-all">{{ locationAddress }}</span>
              </div>
              
              <div class="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 sm:px-5 py-2 rounded-xl border border-blue-100">
                <i class="fa-solid fa-pen-to-square text-[10px]"></i>
                <span class="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-blue-900">Update Property Details</span>
              </div>
            </div>
          </div>
        </div>

        <form @submit.prevent="handleSubmit" class="space-y-8 sm:space-y-12">
          
          <!-- Photos Section -->
          <div class="space-y-6 bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-200">
            <h3 class="text-xs font-black text-black uppercase tracking-[0.2em] mb-4">Update Photos</h3>
            
            <div>
              <label class="block text-[10px] font-bold text-black uppercase mb-3 ml-0.5 tracking-wider">Main Boarding House Photo</label>
              <input type="file" @change="handleHouseImgChange" accept="image/*" class="w-full px-3 sm:px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-600 font-semibold file:mr-2 sm:file:mr-4 file:py-2 file:px-3 sm:file:px-4 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-blue-600 file:text-white hover:file:bg-black transition cursor-pointer" />
            </div>

            <!-- Dynamic Additional Photo Upload Section -->
            <div class="border-t border-slate-200/60 pt-6">
              <label class="block text-[10px] font-bold text-black uppercase mb-3 ml-0.5 tracking-wider">Additional Interior Photos (Maximum 10 Photos)</label>
              <div class="flex items-center justify-center bg-white border border-slate-200 rounded-xl p-4 sm:p-6 transition cursor-pointer mb-6">
                <input type="file" multiple accept="image/*" @change="handlePhotosSelected" class="w-full text-xs font-bold text-slate-500 file:mr-2 sm:file:mr-4 file:py-2 file:px-4 sm:file:px-6 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-[#2a528a] file:text-white hover:file:bg-black transition cursor-pointer" />
              </div>

              <!-- Interactive Previews Grid with Delete option -->
              <div v-if="selectedPhotos.length > 0" class="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
                <div v-for="(photo, index) in selectedPhotos" :key="index" class="relative rounded-xl overflow-hidden aspect-square border border-slate-200 group">
                  <img :src="photo.previewUrl" class="w-full h-full object-cover" alt="Interior Preview" />
                  <button type="button" @click="removePhoto(index)" class="absolute top-2 right-2 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-700">
                    <i class="fa-solid fa-trash text-xs" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Basic Details -->
          <div class="space-y-6 sm:space-y-10">
            <div>
              <label class="flex items-center gap-2 text-[10px] font-bold text-black uppercase mb-3 ml-0.5 tracking-wider">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                Boarding House Name
              </label>
              <input type="text" v-model="houseName" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-black font-semibold focus:bg-white focus:border-black focus:outline-none transition shadow-sm" />
            </div>

            <div>
              <label class="flex items-center gap-2 text-[10px] font-bold text-black uppercase mb-3 ml-0.5 tracking-wider">
                <span class="text-base font-black leading-none shrink-0 mt-[-2px]">₱</span>
                Monthly Rent Price
              </label>
              <input type="number" min="0.01" max="99999999.99" step="0.01" v-model="price" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-black font-semibold focus:bg-white focus:border-black focus:outline-none transition shadow-sm" />
            </div>

            <div>
              <label class="flex items-center gap-2 text-[10px] font-bold text-black uppercase mb-3 ml-0.5 tracking-wider">
                <i class="fa-solid fa-location-dot text-blue-600"></i>
                Official Barangay (Nabua)
              </label>
              <select v-model="selectedBarangay" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-black font-semibold focus:bg-white focus:border-black focus:outline-none transition shadow-sm cursor-pointer">
                <option value="">Select Official Barangay</option>
                <option v-for="b in barangaysList" :key="b" :value="b">{{ b }}</option>
              </select>
            </div>
            
            <!-- Advance & Deposit Policy -->
            <div class="space-y-6 bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-200">
              <h3 class="text-xs font-black text-black uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <i class="fa-solid fa-coins" />
                Advance & Deposit Policy
              </h3>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                <div>
                  <label class="block text-[10px] font-bold text-black uppercase mb-2 ml-0.5 tracking-wider">Advance Rent</label>
                  <select v-model="advanceMonths" class="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-black font-semibold focus:outline-none focus:border-black transition">
                    <option :value="0">No Advance</option>
                    <option :value="1">1 Month</option>
                    <option :value="2">2 Months</option>
                  </select>
                </div>
                
                <div>
                  <label class="block text-[10px] font-bold text-black uppercase mb-2 ml-0.5 tracking-wider">Deposit Duration</label>
                  <select v-model="depositMonths" class="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-black font-semibold focus:outline-none focus:border-black transition">
                    <option :value="0">No Deposit</option>
                    <option :value="1">1 Month</option>
                    <option :value="2">2 Months</option>
                  </select>
                </div>

                <div v-show="depositMonths > 0">
                  <label class="block text-[10px] font-bold text-black uppercase mb-2 ml-0.5 tracking-wider">Rent Deposit Type</label>
                  <select v-model="depositType" class="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-black font-semibold focus:outline-none focus:border-black transition">
                    <option value="consumable">Consumable (Last Month)</option>
                    <option value="refundable">Refundable (Cash)</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label class="flex items-center gap-2 text-[10px] font-bold text-black uppercase mb-3 ml-0.5 tracking-wider">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                Contact Number
              </label>
              <input type="text" inputmode="tel" v-model="contactNumber" @keypress="handleOwnerPhoneKeypress" @input="handleOwnerPhoneInput" placeholder="E.g., 09123456789 / 09987654321" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-black font-semibold focus:bg-white focus:border-black focus:outline-none transition shadow-sm" />
              <p class="text-[10px] text-slate-400 font-bold mt-1.5 ml-0.5">
                <i class="fa-solid fa-circle-info text-blue-500 mr-1"></i> For multiple numbers, separate them using a slash (e.g. <code>09123456789 / 09987654321</code>).
              </p>
            </div>

            <!-- High-Precision 3-Way Location Registration -->
            <div>
              <h3 class="text-xs font-black text-[#1e4a8d] uppercase tracking-[0.2em] mb-4 sm:mb-6">
                <i class="fa-solid fa-map-location-dot" /> High-Precision Location Setup
              </h3>
              
              <div class="space-y-6 sm:space-y-8 bg-slate-50/50 p-4 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-100">
                <!-- STEP A -->
                <div>
                  <div class="flex items-center gap-3 mb-3 sm:mb-4">
                    <div class="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shadow-lg">A</div>
                    <label class="text-[10px] sm:text-[11px] font-black text-slate-900 uppercase tracking-widest">Type your Property Address</label>
                  </div>
                  <div id="autocomplete-wrapper" class="w-full"></div>
                </div>

                <!-- STEP B -->
                <div>
                  <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4">
                    <div class="flex items-center gap-3">
                      <div class="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shadow-lg">B</div>
                      <label class="text-[10px] sm:text-[11px] font-black text-slate-900 uppercase tracking-widest">Verify or Pin Exactly on Map</label>
                    </div>
                    <div class="flex flex-wrap gap-2 w-full sm:w-auto">
                      <button 
                        type="button" 
                        @click="detectMyLocation" 
                        :disabled="isGpsLoading"
                        class="bg-white border border-slate-200 text-slate-600 text-[9px] font-black uppercase tracking-widest px-3 sm:px-4 py-2 rounded-full shadow-sm hover:bg-blue-50 hover:text-blue-600 transition-all flex items-center gap-2 flex-1 sm:flex-initial justify-center"
                      >
                        <i v-if="isGpsLoading" class="fa-solid fa-spinner fa-spin" />
                        <i v-else class="fa-solid fa-location-crosshairs" /> Use GPS
                      </button>
                      <button 
                        type="button" 
                        @click="toggleFullscreenMap" 
                        class="bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest px-3 sm:px-4 py-2 rounded-full shadow-lg hover:bg-blue-600 transition-all flex items-center gap-2 flex-1 sm:flex-initial justify-center"
                      >
                        <i class="fa-solid fa-expand" /> Large Map
                      </button>
                    </div>
                  </div>

                  <div class="rounded-[1.5rem] sm:rounded-[2rem] overflow-hidden border-4 border-white shadow-xl aspect-video relative bg-slate-50 group cursor-pointer">
                    <div id="map" ref="mapContainer" class="w-full h-full min-h-[300px] sm:min-h-[350px]"></div>
                    <div class="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors flex items-center justify-center" @click="toggleFullscreenMap">
                      <span class="bg-white/90 backdrop-blur-md px-4 sm:px-6 py-2 sm:py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest text-slate-600 shadow-xl border border-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                        <i class="fa-solid fa-hand-pointer" /> Click to Zoom &amp; Adjust Pin
                      </span>
                    </div>
                  </div>

                  <div v-if="!latitude || !longitude" class="mt-3 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <i class="fa-solid fa-triangle-exclamation text-amber-500 text-xs mt-0.5"></i>
                    <p class="text-[11px] font-bold text-amber-800 leading-snug">
                      No GPS pin set yet. Without a location, this listing won't appear on the public Map View and students can't get walking directions from CSPC. Use "Use GPS" or "Large Map" above to set it.
                    </p>
                  </div>
                  <div v-else-if="pinNeedsConfirmation" class="mt-3 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <i class="fa-solid fa-triangle-exclamation text-amber-500 text-xs mt-0.5"></i>
                    <p class="text-[11px] font-bold text-amber-800 leading-snug">
                      Address text changed but the map pin hasn't moved yet. Select a suggestion from the dropdown, use "Use GPS", or drag the pin — otherwise the old location will be kept when you save.
                    </p>
                  </div>
                </div>

                <!-- Step C removed: Google Maps short link extraction was unreliable.
                     Use GPS button or the Places search (Step A) instead. -->
              </div>
            </div>

            <!-- Hidden inputs -->
            <input type="hidden" v-model="latitude" />
            <input type="hidden" v-model="longitude" />

            <div>
              <label class="flex items-center gap-2 text-[10px] font-bold text-black uppercase mb-3 ml-0.5 tracking-wider">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                Property Description & Rules
              </label>
              <textarea v-model="description" rows="5" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-black font-semibold focus:bg-white focus:border-black focus:outline-none transition shadow-sm"></textarea>
            </div>
          </div>

          <!-- Amenities -->
          <div class="space-y-6 sm:space-y-8">
            <!-- Free Amenities -->
            <div class="px-1 sm:px-2 py-2 sm:py-4">
              <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6 sm:mb-8">
                <p class="flex items-center gap-3 text-[10px] sm:text-[11px] font-black text-black uppercase tracking-[0.2em]">
                  <i class="fa-solid fa-gift text-emerald-500" />
                  Free Amenities
                </p>
                <div class="flex gap-2 w-full sm:w-auto">
                  <input type="text" v-model="newFreeAmenityInput" placeholder="Add custom..." class="flex-1 sm:w-32 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 sm:py-1 text-[10px] font-bold focus:border-blue-400 outline-none" />
                  <button type="button" @click="addCustomAmenity('free')" class="bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 sm:py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition shrink-0">Add</button>
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs text-black font-semibold">
                <label v-for="item in freeAmenities" :key="item" class="flex items-center gap-3 cursor-pointer bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-sm hover:border-black transition">
                  <input type="checkbox" :value="item" v-model="selectedFreeAmenities" class="w-4 h-4 border-slate-300 text-black rounded accent-black shrink-0" />
                  <span class="break-words">{{ item }}</span>
                </label>
              </div>
            </div>

            <!-- Paid Amenities -->
            <div class="px-1 sm:px-2 py-2 sm:py-4 border-t border-slate-100">
              <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6 sm:mb-8 mt-4">
                <p class="flex items-center gap-3 text-[10px] sm:text-[11px] font-black text-black uppercase tracking-[0.2em]">
                  <i class="fa-solid fa-coins text-rose-500" />
                  Paid Amenities
                </p>
                <div class="flex gap-2 w-full sm:w-auto">
                  <input type="text" v-model="newPaidAmenityInput" placeholder="Add custom..." class="flex-1 sm:w-32 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 sm:py-1 text-[10px] font-bold focus:border-red-400 outline-none" />
                  <button type="button" @click="addCustomAmenity('paid')" class="bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1.5 sm:py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition shrink-0">Add</button>
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs text-black font-semibold">
                <label v-for="item in paidAmenities" :key="item" class="flex items-center gap-3 cursor-pointer bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-sm hover:border-black transition">
                  <input type="checkbox" :value="item" v-model="selectedPaidAmenities" class="w-4 h-4 border-slate-300 text-black rounded accent-black shrink-0" />
                  <span class="break-words">{{ item }}</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Submit Button -->
          <div class="pt-8 sm:pt-10 border-t border-slate-100 flex justify-center">
            <button type="submit" :disabled="isSubmitting" class="bg-black hover:bg-slate-800 text-white font-black py-4 px-8 sm:px-16 rounded-xl text-[11px] sm:text-[12px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 transition active:scale-95 w-full max-w-[400px] disabled:opacity-50">
              {{ isSubmitting ? 'Saving Changes...' : 'Save Changes' }}
            </button>
          </div>
        </form>
      </div>
    </div>
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