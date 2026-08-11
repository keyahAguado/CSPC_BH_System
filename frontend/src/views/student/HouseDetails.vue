<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import StudentNav from '../../components/partials/StudentNav.vue';

const route = useRoute();
const router = useRouter();
const houseId = route.params.id;

const house = ref({});
const reviews = ref([]);
const avgRating = ref(0);
const isLoading = ref(true);
const showLoginModal = ref(false);

const token = localStorage.getItem('cspc_token');
const isGuest = !token;
import { getApiBaseUrl, getImageUrl } from '../../config/api';

const API = getApiBaseUrl();

// Photo carousel
const currentPhotoIndex = ref(0);
const photos = computed(() => {
  const imgs = [];
  if (house.value.img) imgs.push(getImageUrl(house.value.img));
  if (house.value.img_1) imgs.push(getImageUrl(house.value.img_1));
  if (house.value.img_2) imgs.push(getImageUrl(house.value.img_2));
  if (house.value.img_3) imgs.push(getImageUrl(house.value.img_3));
  return imgs;
});

const currentPhoto = computed(() => photos.value[currentPhotoIndex.value] || '');

const nextPhoto = () => {
  if (photos.value.length > 1) {
    currentPhotoIndex.value = (currentPhotoIndex.value + 1) % photos.value.length;
  }
};
const prevPhoto = () => {
  if (photos.value.length > 1) {
    currentPhotoIndex.value = (currentPhotoIndex.value - 1 + photos.value.length) % photos.value.length;
  }
};

// Star rating for review form
const selectedRating = ref(0);
const hoverRating = ref(0);
const reviewComment = ref('');
const isSubmittingReview = ref(false);
const reviewSuccess = ref('');
const reviewError = ref('');

// ================= DYNAMIC ROUTE GUIDE & GPS STATES =================
const mapMode = ref('cspc'); // 'user' or 'cspc'
const userPos = ref(null);
const routeDistance = ref('--');
const routeDuration = ref('Calculating...');
const campusDistText = ref('Loading...');
const showCampusBadge = ref(false);
const isGpsChecking = ref(false);

const cspcGate = { lat: 13.4059565, lng: 123.3753135 };
let googleInstance = null;
let mapInstance = null;
let directionsService = null;
let directionsRenderer = null;

// Initializes Google Maps and computes proximity badges
const initGoogleMap = async () => {
  let mapContainerEl = document.getElementById("bhMap");
  
  // Mobile / DOM render safety: Retry finding container if not immediately mounted
  if (!mapContainerEl) {
    await new Promise(resolve => setTimeout(resolve, 100));
    mapContainerEl = document.getElementById("bhMap");
  }
  if (!mapContainerEl) return;

  const rawLat = parseFloat(house.value.latitude);
  const rawLng = parseFloat(house.value.longitude);
  const bhLat = (!isNaN(rawLat) && rawLat !== 0) ? rawLat : 13.4079;
  const bhLng = (!isNaN(rawLng) && rawLng !== 0) ? rawLng : 123.3751;
  const bhLocation = { lat: bhLat, lng: bhLng };

  try {
    const mapsLib = (googleInstance?.maps?.importLibrary) ? await googleInstance.maps.importLibrary("maps") : googleInstance?.maps;
    const MapClass = mapsLib?.Map || googleInstance?.maps?.Map;

    if (!MapClass) {
      console.error("Google Maps Map class is unavailable.");
      return;
    }

    directionsService = new googleInstance.maps.DirectionsService();
    directionsRenderer = new googleInstance.maps.DirectionsRenderer({
      suppressMarkers: false,
      polylineOptions: { strokeColor: "#2563eb", strokeWeight: 5 }
    });

    mapInstance = new MapClass(mapContainerEl, {
      center: bhLocation,
      zoom: 16,
      mapTypeControl: true,
      streetViewControl: true,
      fullscreenControl: true,
      gestureHandling: 'cooperative',
      mapId: 'CSPC_STUDENT_DETAILS_MAP'
    });

    directionsRenderer.setMap(mapInstance);

    // Marker creation with graceful fallback (AdvancedMarkerElement -> Marker)
    let markerCreated = false;
    try {
      if (googleInstance?.maps?.importLibrary) {
        const { AdvancedMarkerElement } = await googleInstance.maps.importLibrary("marker");
        if (AdvancedMarkerElement) {
          new AdvancedMarkerElement({
            position: bhLocation,
            map: mapInstance,
            title: house.value.name || 'Boarding House Location'
          });
          markerCreated = true;
        }
      }
    } catch (markerErr) {
      console.warn("AdvancedMarkerElement unavailable, using standard Marker fallback:", markerErr.message);
    }

    if (!markerCreated && googleInstance?.maps?.Marker) {
      new googleInstance.maps.Marker({
        position: bhLocation,
        map: mapInstance,
        title: house.value.name || 'Boarding House Location'
      });
    }

    // Trigger container layout resize for mobile webviews & PWAs
    setTimeout(() => {
      if (mapInstance && googleInstance?.maps?.event) {
        googleInstance.maps.event.trigger(mapInstance, 'resize');
        mapInstance.setCenter(bhLocation);
      }
    }, 200);

    // 1. Compute Proximity to CSPC Gate instantly
    calculateRoute(cspcGate, 'cspc', (result) => {
      const dist = result.routes[0].legs[0].distance.text;
      const dur = result.routes[0].legs[0].duration.text;
      campusDistText.value = `${dist} from CSPC Campus (${dur} walk)`;
      showCampusBadge.value = true;
    });

    // 2. Pre-detect User GPS silently in background
    detectGPS(false);
  } catch (err) {
    console.error("Map initialization failed:", err);
  }
};

const detectGPS = (forceMode = false) => {
  if (!navigator.geolocation) {
    setMapMode('cspc');
    return;
  }

  isGpsChecking.value = true;
  navigator.geolocation.getCurrentPosition(
    (position) => {
      userPos.value = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      isGpsChecking.value = false;
      if (forceMode) {
        setMapMode('user');
      }
    },
    (error) => {
      console.warn("GPS Access Denied or Unavailable:", error.message);
      isGpsChecking.value = false;
      if (forceMode === 'user' || forceMode === true) {
        alert("GPS Signal Mismatched. Please ensure location permissions are enabled in your browser.");
      }
      setMapMode('cspc');
    },
    { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
  );
};

const setMapMode = (mode) => {
  mapMode.value = mode;
  if (mode === 'user') {
    if (!userPos.value) {
      detectGPS(true);
      return;
    }
    calculateRoute(userPos.value, 'user');
  } else {
    calculateRoute(cspcGate, 'cspc');
  }
};

const calculateRoute = (origin, mode, callback) => {
  if (!directionsService || !directionsRenderer) return;

  const rawLat = parseFloat(house.value.latitude);
  const rawLng = parseFloat(house.value.longitude);
  const bhLat = (!isNaN(rawLat) && rawLat !== 0) ? rawLat : 13.4079;
  const bhLng = (!isNaN(rawLng) && rawLng !== 0) ? rawLng : 123.3751;
  const bhLocation = { lat: bhLat, lng: bhLng };

  directionsService.route({
    origin: origin,
    destination: bhLocation,
    travelMode: googleInstance.maps.TravelMode.WALKING
  }, (result, status) => {
    if (status === 'OK') {
      if (mode === mapMode.value || callback) {
        directionsRenderer.setDirections(result);
        const leg = result.routes[0].legs[0];
        routeDistance.value = leg.distance.text;
        routeDuration.value = leg.duration.text;
      }
      if (callback) callback(result);
    }
  });
};

const gpsSyncLink = computed(() => {
  const rawLat = parseFloat(house.value.latitude);
  const rawLng = parseFloat(house.value.longitude);
  const bhLat = (!isNaN(rawLat) && rawLat !== 0) ? rawLat : 13.4079;
  const bhLng = (!isNaN(rawLng) && rawLng !== 0) ? rawLng : 123.3751;
  const origin = mapMode.value === 'user' && userPos.value ? userPos.value : cspcGate;
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${bhLat},${bhLng}&travelmode=walking`;
});

// ================= SUBMIT REVIEW & DATA FETCHING =================
const submitReview = async () => {
  if (isGuest) { showLoginModal.value = true; return; }
  if (!selectedRating.value) { reviewError.value = 'Please select a star rating.'; return; }
  
  isSubmittingReview.value = true;
  reviewError.value = '';
  reviewSuccess.value = '';

  try {
    await axios.post(`/api/student/review/${houseId}`, {
      rating: selectedRating.value,
      comment: reviewComment.value
    }, { headers: { Authorization: `Bearer ${token}` } });
    
    reviewSuccess.value = 'Review submitted successfully!';
    reviewComment.value = '';
    selectedRating.value = 0;
    await fetchData();
  } catch (e) {
    reviewError.value = e.response?.data?.message || 'Verification failed. You can only review properties where you are an active resident or have a confirmed booking.';
  } finally {
    isSubmittingReview.value = false;
  }
};

const fetchData = async () => {
  let mapApiKey = '';
  try {
    isLoading.value = true;
    const res = await axios.get(`/api/student/house/${houseId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    house.value = res.data.house || {};
    reviews.value = res.data.reviews || [];
    avgRating.value = res.data.avgRating || 0;
    mapApiKey = res.data.googleMapsApiKey;
  } catch (e) {
    console.error('Failed to load house data', e);
  } finally {
    isLoading.value = false;
    await nextTick();

    // Always set the API key before loading - window.google may exist from PWA/cache but without a valid key
    const apiKeyToUse = mapApiKey || import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

    if (!apiKeyToUse) {
      console.error('[Maps] No Google Maps API key available. Map will not load.');
      return;
    }

    try {
      setOptions({
        key: apiKeyToUse,
        v: 'weekly'
      });
      await importLibrary('maps');
      await importLibrary('marker');
      await importLibrary('places');
    } catch (loaderErr) {
      // Loader may throw "only loads once" if already initialized — this is safe to ignore
      // as long as window.google is available afterward
      console.warn('[Maps] Loader note:', loaderErr.message);
    }

    googleInstance = window.google;
    if (!googleInstance) {
      console.error('[Maps] window.google is not available after loading. Check API key restrictions.');
      return;
    }
    await initGoogleMap();
  }
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

const freeAmenities = computed(() => {
  const list = parseAmenities(house.value.amenities_free);
  return list.length > 0 ? list : ['Basic facilities'];
});

const paidAmenities = computed(() => {
  return parseAmenities(house.value.amenities_paid);
});

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

const handleBook = () => {
  if (isGuest) { showLoginModal.value = true; return; }
  router.push(`/student/book/${houseId}`);
};

onMounted(fetchData);
</script>

<template>
  <div class="bg-[#f8fafc] min-h-screen text-slate-800 pb-20 font-sans">
    <StudentNav />

    <!-- Login Modal -->
    <div v-if="showLoginModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-fade-in">
      <div class="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border border-slate-100">
        <div class="text-blue-600 mb-4 flex justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 class="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Login Required</h2>
        <p class="text-slate-500 mb-6 text-sm">To book or post a review, you must first log in using your <strong>CSPC student email</strong>.</p>
        <div class="flex flex-col gap-3">
          <a href="/login-options" class="bg-blue-600 hover:bg-slate-900 text-white font-black py-3.5 rounded-xl transition-colors uppercase text-xs tracking-widest text-center block shadow-lg shadow-blue-100">Go to Login</a>
          <button @click="showLoginModal = false" class="text-slate-400 text-xs font-bold hover:text-slate-900 uppercase tracking-widest mt-2">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-48">
      <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>

    <main v-else class="max-w-5xl mx-auto py-12 px-6">

      <!-- TOP HEADER & ACTIONS -->
      <div class="flex flex-col md:flex-row justify-between items-start gap-8 mb-10">
        <div class="flex-1 text-left">
          <h1 class="text-4xl md:text-5xl font-black text-slate-900 tracking-tight uppercase mb-4 leading-tight">
            {{ house.name }}
          </h1>
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-2 bg-white text-slate-600 px-4 py-2 rounded-full border border-slate-200/80 shadow-sm">
              <i class="fa-solid fa-location-dot text-blue-500 text-[11px]"></i>
              <span class="font-bold text-[10px] uppercase tracking-widest leading-none">{{ house.location || 'Location Pending' }}</span>
            </div>
            
            <div v-if="showCampusBadge" class="flex items-center gap-2 bg-[#2563eb] text-white px-4 py-2 rounded-full shadow-md shadow-blue-100/50">
              <i class="fa-solid fa-graduation-cap text-[10px]"></i>
              <span class="text-[10px] font-black uppercase tracking-widest leading-none">{{ campusDistText }}</span>
            </div>

            <div v-if="avgRating > 0" class="flex items-center gap-2 bg-amber-400 text-white px-4 py-2 rounded-full shadow-md shadow-amber-100/50">
              <i class="fa-solid fa-star text-[11px]"></i>
              <span class="text-[10px] font-black uppercase tracking-widest">{{ avgRating }} Rating</span>
            </div>
          </div>
        </div>
        
        <div class="flex flex-col items-stretch md:items-end gap-3 w-full md:w-auto shrink-0">
          <button
            @click="handleBook"
            class="bg-blue-600 text-white font-black text-[12px] py-4 px-12 rounded-2xl shadow-xl shadow-blue-100 hover:bg-slate-900 transition-all uppercase tracking-widest whitespace-nowrap active:scale-95"
          >
            Book Now <i class="fa-solid fa-calendar-check ml-2"></i>
          </button>
          
          <!-- Redesigned Move-in Conditions Card (Clean & Minimalist) -->
          <div class="p-6 bg-white border border-slate-200/80 rounded-[1.5rem] w-full text-left max-w-sm md:max-w-[280px] shadow-sm">
            <h4 class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 border-b border-slate-50 pb-2">
              Move-in Conditions
            </h4>
            <div class="space-y-4">
              <div class="flex items-start gap-3">
                <div class="w-8 h-8 rounded-xl bg-blue-50/50 flex items-center justify-center text-blue-600 shrink-0">
                  <i class="fa-solid fa-receipt text-xs"></i>
                </div>
                <div>
                  <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Advance Rent</p>
                  <p class="text-[13px] font-black text-slate-800">
                    {{ house.advance_months > 0 ? house.advance_months + ' Month' + (house.advance_months > 1 ? 's' : '') + ' Advance' : 'No Advance Required' }}
                  </p>
                </div>
              </div>
              
              <div class="flex items-start gap-3">
                <div class="w-8 h-8 rounded-xl bg-blue-50/50 flex items-center justify-center text-blue-600 shrink-0">
                  <i class="fa-solid fa-lock text-xs"></i>
                </div>
                <div>
                  <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Security Deposit</p>
                  <p class="text-[13px] font-black text-slate-800">
                    <template v-if="house.deposit_months > 0">
                      {{ house.deposit_months }} Month{{ house.deposit_months > 1 ? 's' : '' }}
                      <span class="text-blue-600 font-bold">({{ house.deposit_type === 'consumable' ? 'Consumable' : 'Refundable' }})</span>
                    </template>
                    <template v-else>No Deposit Required</template>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- INTERACTIVE LOCATION MATRIX -->
      <div class="bg-white rounded-t-[2.5rem] p-4 sm:p-8 md:p-12 shadow-sm border border-slate-200/50">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 text-left">
          <div class="flex items-center gap-3">
            <div class="bg-blue-500 w-1.5 h-6 rounded-full"></div>
            <h2 class="text-base font-black uppercase tracking-widest text-slate-900">Interactive Location Guide</h2>
          </div>
          
          <!-- Minimalist Map Toggle Selector -->
          <div class="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/60 shadow-inner w-full sm:w-auto">
            <button @click="setMapMode('user')" :disabled="isGpsChecking"
                    class="flex-1 sm:flex-none px-4 sm:px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer"
                    :class="mapMode === 'user' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400 hover:text-slate-600'">
              <i class="fa-solid fa-person-walking"></i> From Me
            </button>
            <button @click="setMapMode('cspc')"
                    class="flex-1 sm:flex-none px-4 sm:px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer"
                    :class="mapMode === 'cspc' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400 hover:text-slate-600'">
              <i class="fa-solid fa-graduation-cap"></i> From CSPC
            </button>
          </div>
        </div>

        <div class="relative group mb-6">
          <div id="bhMap" class="shadow-md bg-slate-50 rounded-[1.5rem] sm:rounded-[2rem] border border-slate-200/80 h-[320px] sm:h-[380px] w-full relative z-0"></div>
        </div>

        <!-- Dynamic Results Bar -->
        <div class="flex flex-col sm:flex-row items-center justify-between bg-slate-50 border border-slate-200/60 p-5 rounded-2xl gap-4 text-left">
          <div class="flex items-center gap-4">
            <div class="bg-blue-600/10 p-3.5 rounded-xl text-blue-600 shrink-0">
              <i :class="mapMode === 'user' ? 'fa-solid fa-person-walking' : 'fa-solid fa-graduation-cap'" class="text-lg"></i>
            </div>
            <div>
              <p class="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-0.5">
                {{ mapMode === 'user' ? 'Navigate From Me' : 'Campus Proximity' }}
              </p>
              <div class="flex items-center gap-3">
                <span class="text-xl font-black text-slate-900 leading-none">{{ routeDistance }}</span>
                <span class="w-1.5 h-1.5 bg-slate-300 rounded-full"></span>
                <span class="text-sm font-black text-blue-600 uppercase">{{ routeDuration }}</span>
              </div>
            </div>
          </div>
          
          <a :href="gpsSyncLink" target="_blank"
             class="bg-green-600 text-white text-[10px] font-black px-6 py-4 rounded-xl shadow-md uppercase tracking-widest hover:bg-green-700 transition-all duration-300 active:scale-95 flex items-center gap-2 w-full sm:w-auto justify-center">
             GPS SYNC READY <i class="fa-solid fa-up-right-from-square text-[9px] ml-1"></i>
          </a>
        </div>
      </div>

      <!-- GALLERY SECTION -->
      <div class="bg-white p-8 md:p-12 border-x border-slate-200/50">
        <div class="flex items-center gap-3 mb-6 text-left">
          <div class="bg-blue-500 w-1.5 h-6 rounded-full"></div>
          <h2 class="text-base font-black uppercase tracking-widest text-slate-900">Property Gallery</h2>
        </div>
        
        <div class="relative flex items-center gap-4">
          <button @click="prevPhoto" class="text-slate-300 hover:text-blue-600 hover:scale-110 transition text-4xl select-none leading-none cursor-pointer focus:outline-none">‹</button>
          
          <div class="rounded-3xl overflow-hidden aspect-video w-full border border-slate-100 shadow-lg bg-slate-50 relative flex items-center justify-center">
            <img v-if="currentPhoto" :src="currentPhoto" class="w-full h-full object-contain" alt="Property Main Gallery">
            <div v-else class="text-slate-400 text-[10px] font-black uppercase tracking-widest">No interior photos uploaded yet</div>
          </div>
          
          <button @click="nextPhoto" class="text-slate-300 hover:text-blue-600 hover:scale-110 transition text-4xl select-none leading-none cursor-pointer focus:outline-none">›</button>
        </div>
        
        <div v-if="photos.length > 1" class="flex justify-center gap-2.5 mt-5">
          <span
            v-for="(_, i) in photos"
            :key="i"
            @click="currentPhotoIndex = i"
            class="w-2 h-2 rounded-full cursor-pointer transition-all duration-300"
            :class="i === currentPhotoIndex ? 'bg-blue-600 scale-125' : 'bg-slate-200'"
          ></span>
        </div>
      </div>

      <!-- INTERIOR DETAILS -->
      <div class="bg-white rounded-b-[2.5rem] p-8 md:p-12 shadow-sm border-x border-b border-slate-200/50 space-y-12">
        <!-- Amenities Grid -->
        <section class="text-left">
          <div class="flex items-center gap-3 mb-6">
            <div class="bg-blue-500 w-1.5 h-6 rounded-full"></div>
            <h2 class="text-base font-black uppercase tracking-widest text-slate-900">Details &amp; Facilities</h2>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div class="bg-slate-50 p-6 rounded-2xl border border-slate-100">
              <h3 class="text-[10px] font-black text-emerald-600 uppercase mb-4 tracking-widest flex items-center gap-2">
                <i class="fa-solid fa-gift text-sm"></i> Free Amenities
              </h3>
              <ul class="text-[13px] font-bold text-slate-600 space-y-3">
                <li v-for="a in freeAmenities" :key="a" class="flex items-center gap-3">
                  <span class="w-2.5 h-2.5 bg-emerald-500 rounded-full flex-shrink-0"></span>{{ a }}
                </li>
              </ul>
            </div>
            
            <div class="bg-slate-50 p-6 rounded-2xl border border-slate-100">
              <h3 class="text-[10px] font-black text-blue-600 uppercase mb-4 tracking-widest flex items-center gap-2">
                <i class="fa-solid fa-coins text-sm"></i> Paid Add-ons
              </h3>
              <ul class="text-[13px] font-bold space-y-3">
                <li v-if="paidAmenities.length === 0" class="text-slate-400 italic font-medium">No paid facilities listed.</li>
                <li v-for="a in paidAmenities" :key="a" class="flex items-center gap-3 text-slate-600">
                  <span class="w-2.5 h-2.5 bg-blue-400 rounded-full flex-shrink-0"></span>{{ a }}
                </li>
              </ul>
            </div>
          </div>
        </section>

        <!-- Owner Bio Profile Details -->
        <section class="border-t border-slate-100 pt-10 text-left">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Owner Details</h3>
              <p class="text-lg font-black text-slate-800 uppercase">{{ house.owner_name }}</p>
              <p class="text-xs font-bold text-slate-400 mt-1 break-all">{{ house.owner_email }}</p>
            </div>
            <div>
              <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Phone Number</h3>
              <p class="text-lg font-black text-blue-600 tracking-widest font-mono">{{ house.phone_contact || 'N/A' }}</p>
            </div>
          </div>
        </section>

        <!-- Long description -->
        <section class="border-t border-slate-100 pt-10 text-left">
          <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Description</h3>
          <p class="text-[14px] font-medium text-slate-600 leading-relaxed text-justify whitespace-pre-wrap">
            {{ house.description || 'No description provided by the landlord.' }}
          </p>
        </section>

        <!-- Approved Seal Section -->
        <section class="border-t border-slate-100 pt-10">
          <div class="bg-gradient-to-br from-amber-50 to-yellow-50/50 border border-amber-200/60 rounded-3xl p-8 flex flex-col sm:flex-row items-center gap-8 text-left shadow-sm">
            <div class="relative shrink-0">
              <div class="absolute inset-0 bg-amber-400/10 rounded-full blur-lg scale-110"></div>
              <div class="relative bg-white rounded-3xl p-4 shadow-md border border-amber-100">
                <img src="/img/seal%20of%20approval.png" alt="CSPC Official Seal" class="w-24 h-24 object-contain" @error="e => e.target.src = '/img/CSPC_logo.png'" />
              </div>
            </div>
            <div>
              <span class="inline-block bg-amber-100 text-amber-700 text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-3">CSPC Certified</span>
              <h3 class="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">Seal of Approval</h3>
              <p class="text-[13px] font-semibold text-slate-500 leading-relaxed">This boarding house has been officially reviewed and accredited by CSPC. It meets all required safety, fire protection, and spatial living standards for student accommodation.</p>
            </div>
          </div>
        </section>
      </div>

      <!-- REVIEWS & COMMENTS SECTION -->
      <div class="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-sm border border-slate-200/50 mt-10 text-left">
        <div class="flex justify-between items-center mb-10 border-b border-slate-100 pb-6">
          <h2 class="text-base font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
            <i class="fa-regular fa-comments text-blue-600 text-lg"></i>
            Reviews &amp; Comments
          </h2>
          <div v-if="avgRating > 0" class="flex items-center gap-2 font-sans">
            <span class="text-xl font-black text-slate-900 leading-none">{{ avgRating }}</span>
            <div class="flex text-amber-400 text-xs">
              <i v-for="i in 5" :key="i" class="fa-solid fa-star" :class="i <= Math.round(avgRating) ? '' : 'text-slate-100'"></i>
            </div>
            <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">({{ reviews.length }} Reviews)</span>
          </div>
          <span v-else class="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-full">No Ratings</span>
        </div>

        <!-- Reviews list loops -->
        <div class="space-y-8 mb-12">
          <div v-if="reviews.length === 0" class="py-12 text-center">
            <p class="text-slate-400 font-bold text-sm uppercase tracking-widest">No reviews written for this house yet.</p>
          </div>
          <div v-for="review in reviews" :key="review.id" class="flex gap-5 group">
            <div class="shrink-0">
              <img
                v-if="review.profile_pic"
                :src="`${API}/uploads/${review.profile_pic}`"
                class="w-12 h-12 rounded-2xl object-cover shadow-sm border border-slate-100"
              >
              <div
                v-else
                class="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600 font-black text-sm"
              >{{ (review.student_name || 'A').charAt(0).toUpperCase() }}</div>
            </div>
            <div class="flex-1">
              <div class="flex items-center justify-between mb-1">
                <h4 class="text-sm font-black text-slate-900 uppercase tracking-tight">{{ review.student_name }}</h4>
                <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{{ formatDate(review.created_at) }}</span>
              </div>
              <div class="flex text-amber-400 text-[10px] mb-2.5">
                <i v-for="i in 5" :key="i" class="fa-solid fa-star" :class="i <= review.rating ? '' : 'text-slate-100'"></i>
              </div>
              <p class="text-sm font-medium text-slate-600 leading-relaxed italic">"{{ review.comment }}"</p>
            </div>
          </div>
        </div>

        <!-- Review Submission Card -->
        <div class="bg-blue-50/50 p-8 rounded-[2rem] border border-blue-100/60 shadow-inner">
          <h3 class="text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-6">Post your review</h3>

          <div class="mb-6 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[13px] font-semibold p-4 rounded-xl flex items-center gap-3 animate-fade-in" v-if="reviewSuccess">
            <i class="fa-solid fa-circle-check text-emerald-500"></i>
            <span>{{ reviewSuccess }}</span>
          </div>
          <div class="mb-6 bg-rose-50 border border-rose-200 text-rose-800 text-[13px] font-semibold p-4 rounded-xl flex items-center gap-3 animate-fade-in" v-if="reviewError">
            <i class="fa-solid fa-circle-info text-rose-500"></i>
            <span>{{ reviewError }}</span>
          </div>

          <div class="flex gap-2.5 mb-6">
            <i
              v-for="i in 5"
              :key="i"
              class="fa-solid fa-star text-3xl cursor-pointer transition-all duration-200 hover:scale-110 active:scale-95"
              :class="i <= (hoverRating || selectedRating) ? 'text-amber-400' : 'text-slate-200'"
              @mouseenter="hoverRating = i"
              @mouseleave="hoverRating = 0"
              @click="selectedRating = i"
            ></i>
          </div>

          <textarea
            v-model="reviewComment"
            rows="4"
            class="w-full h-32 bg-white border border-slate-200 rounded-2xl p-5 text-sm font-medium focus:ring-4 focus:ring-blue-100/50 focus:border-blue-400 outline-none transition-all resize-none mb-6 shadow-sm placeholder:text-slate-300"
            placeholder="Share your stay experience..."
          ></textarea>

          <button
            @click="submitReview"
            :disabled="isSubmittingReview"
            class="bg-slate-900 text-white px-10 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-blue-600 transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            <div v-if="isSubmittingReview" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            {{ isSubmittingReview ? 'Submitting...' : 'Submit Feedback' }}
          </button>
        </div>
      </div>
    </main>
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
#bhMap {
  height: 380px;
  min-height: 280px;
  width: 100%;
  border-radius: 2rem;
  border: 1px solid #e2e8f0;
  touch-action: pan-x pan-y;
}
@media (max-width: 640px) {
  #bhMap {
    height: 320px;
    border-radius: 1.5rem;
  }
}
</style>