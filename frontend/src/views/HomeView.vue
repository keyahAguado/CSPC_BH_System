<script setup>
import { ref, onMounted, nextTick, watch } from 'vue';
import axios from 'axios';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import Header from '../components/partials/Header.vue';
import PrivacyPolicyModal from '../components/partials/PrivacyPolicyModal.vue';

import { getImageUrl } from '../config/api';
import { formatAddress } from '../utils/formatAddress.js';
import { useOfflineStatus } from '../utils/offlineHelper.js';

const { isOffline } = useOfflineStatus();

const cspcGate = { lat: 13.4059565, lng: 123.3753135 };
const showMapView = ref(false);
const mapContainer = ref(null);
let mapInstance = null;
let mapMarkers = [];

// Instant initialization from persistent localStorage cache for 0ms offline rendering
const initialCachedHouses = (() => {
  try {
    const raw = localStorage.getItem('cspc_cached_accredited_houses');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
})();

const houses = ref(initialCachedHouses);
const isLoading = ref(initialCachedHouses.length === 0);
const showModal = ref(false);
const showPrivacyModal = ref(false);

const toggleModal = () => {
  showModal.value = !showModal.value;
};

const fetchHouses = async () => {
  try {
    if (houses.value.length === 0) {
      isLoading.value = true;
    }
    const response = await axios.get('/api/boarding-houses/accredited');
    if (response.data && response.data.success && Array.isArray(response.data.data)) {
      houses.value = response.data.data;
      localStorage.setItem('cspc_cached_accredited_houses', JSON.stringify(response.data.data));
    }
  } catch (error) {
    console.error('Failed to fetch houses from network:', error);
    try {
      const cached = localStorage.getItem('cspc_cached_accredited_houses');
      if (cached) {
        houses.value = JSON.parse(cached);
      }
    } catch (err) {}
  } finally {
    isLoading.value = false;
  }
};

const plotMarkers = (googleInstance) => {
  mapMarkers.forEach(m => { m.map = null; });
  mapMarkers = [];

  const bounds = new googleInstance.maps.LatLngBounds();
  bounds.extend(cspcGate);

  const cspcMarker = new googleInstance.maps.marker.AdvancedMarkerElement({
    map: mapInstance,
    position: cspcGate,
    title: 'CSPC Main Campus',
  });
  mapMarkers.push(cspcMarker);

  houses.value.forEach(house => {
    const lat = parseFloat(house.latitude);
    const lng = parseFloat(house.longitude);
    if (!lat || !lng) return;
    const position = { lat, lng };
    bounds.extend(position);

    const marker = new googleInstance.maps.marker.AdvancedMarkerElement({
      map: mapInstance,
      position,
      title: house.name,
    });

    const infoWindow = new googleInstance.maps.InfoWindow({
      content: `
        <div style="font-family: sans-serif; padding: 4px; max-width: 200px;">
          <strong style="display:block; margin-bottom:4px; font-size: 13px;">${house.name}</strong>
          <span style="font-size: 11px; color: #64748b;">${formatAddress(house)}</span><br/>
          <a href="/student/house/${house.id}" style="font-size: 11px; color: #2a528a; font-weight: bold;">View Details →</a>
        </div>
      `
    });
    marker.addEventListener('gmp-click', () => infoWindow.open({ anchor: marker, map: mapInstance }));
    mapMarkers.push(marker);
  });

  if (!bounds.isEmpty()) {
    mapInstance.fitBounds(bounds, 60);
  }
};

const initMap = async () => {
  await nextTick();
  if (!mapContainer.value || mapInstance) return;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  if (!apiKey) {
    console.error('[Maps] No Google Maps API key available.');
    return;
  }

  try {
    setOptions({ key: apiKey, v: 'weekly' });
    await importLibrary('maps');
    await importLibrary('marker');
  } catch (loaderErr) {
    console.warn('[Maps] Loader note:', loaderErr.message);
  }

  const googleInstance = window.google;
  if (!googleInstance) {
    console.error('[Maps] window.google unavailable after loading.');
    return;
  }

  const { Map } = await googleInstance.maps.importLibrary('maps');
  mapInstance = new Map(mapContainer.value, {
    center: cspcGate,
    zoom: 14,
    mapId: 'CSPC_BOARDING_HOUSE_MAP',
  });

  plotMarkers(googleInstance);
};

const toggleMapView = () => {
  showMapView.value = !showMapView.value;
};

watch(showMapView, (val) => {
  if (val) initMap();
});

watch(houses, () => {
  if (mapInstance && window.google) plotMarkers(window.google);
});

onMounted(() => {
  fetchHouses();
});
</script>

<template>
  <div class="bg-white min-h-screen font-sans text-slate-800">
    <Header @openPrivacyModal="showPrivacyModal = true" />

    <!-- MODAL -->
    <div v-if="showModal" class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div class="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl border border-slate-100">
        <div class="text-[#1e4a8d] mb-4 flex justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 class="text-xl font-black text-black mb-2 uppercase tracking-tight">Login Required</h2>
        <p class="text-slate-500 mb-6 text-sm">To book a boarding house, you must first log in using your <strong>CSPC student email</strong>.</p>
        
        <div class="flex flex-col gap-3">
          <a href="/login-options" class="bg-[#1e4a8d] hover:bg-black text-white font-black py-3 rounded-xl transition uppercase text-xs tracking-widest text-center">
            Go to Login
          </a>
          <button @click="toggleModal" class="text-slate-400 text-xs font-bold hover:text-black uppercase tracking-widest focus:outline-none">
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- 1. HERO SECTION -->
    <header class="relative h-[90vh] flex items-center justify-center text-white overflow-hidden">
      <div class="absolute inset-0 bg-black/50 z-10"></div>
      <img src="/img/cspc_bg.webp" class="absolute inset-0 w-full h-full object-cover" alt="Background" />

      <div class="relative z-20 text-center px-4">
        <p class="text-sm font-bold tracking-[0.3em] uppercase mb-4 text-blue-200">Camarines Sur Polytechnic Colleges</p>
        <h1 class="text-5xl md:text-7xl font-black mb-8 tracking-tighter uppercase leading-none">
          CSPC'S BOARDING <br /> HOUSE SELECTION
        </h1>
        <button @click="toggleModal" class="bg-[#1e4a8d] hover:bg-white hover:text-black text-white font-black py-4 px-12 rounded-lg transition duration-300 shadow-xl uppercase text-xs tracking-[0.2em] focus:outline-none">
          BOOK NOW
        </button>
      </div>
    </header>

    <!-- 2. FEATURES SECTION -->
    <section id="features" class="py-24 bg-blue-50 px-10 border-b border-blue-100">
      <div class="max-w-5xl mx-auto">
        <h2 class="text-xs font-black text-blue-600 text-center mb-2 tracking-[0.4em] uppercase">The Platform</h2>
        <h3 class="text-3xl font-black text-blue-900 text-center mb-16 tracking-tight uppercase">Core Features</h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
          <div class="bg-white p-8 rounded-xl shadow-md border-l-8 border-blue-500 hover:shadow-lg transition duration-300">
            <h3 class="font-bold text-blue-800 text-lg mb-3 uppercase tracking-tight">SASO-Accredited Listings Only</h3>
            <p class="text-slate-600 text-sm leading-relaxed">
              All boarding houses are verified and approved by the Student Affairs and Services Office (SASO) to ensure safety, compliance, and quality standards.
            </p>
          </div>

          <div class="bg-white p-8 rounded-xl shadow-md border-l-8 border-blue-500 hover:shadow-lg transition duration-300">
            <h3 class="font-bold text-blue-800 text-lg mb-3 uppercase tracking-tight">Advanced Search & Filters</h3>
            <p class="text-slate-600 text-sm leading-relaxed">
              Enables quick and efficient searching of boarding houses near CSPC campus to match students' and parents' specific needs.
            </p>
          </div>

          <div class="bg-white p-8 rounded-xl shadow-md border-l-8 border-blue-500 hover:shadow-lg transition duration-300">
            <h3 class="font-bold text-blue-800 text-lg mb-3 uppercase tracking-tight">Real Photos & Details</h3>
            <p class="text-slate-600 text-sm leading-relaxed">
              Actual photos of rooms and facilities plus full details: monthly rates, house rules, exact location, and owner contact information.
            </p>
          </div>

          <div class="bg-white p-8 rounded-xl shadow-md border-l-8 border-blue-500 hover:shadow-lg transition duration-300">
            <h3 class="font-bold text-blue-800 text-lg mb-3 uppercase tracking-tight">User Friendly & Responsive</h3>
            <p class="text-slate-600 text-sm leading-relaxed">
              Accessible on desktop and mobile devices, with an intuitive interface designed for students and parents to use easily anytime, anywhere.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- MAIN PUBLIC DIRECTORY VIEW (OFFERS SECTION) -->
    <section id="offers" class="py-12 bg-white text-center scroll-mt-16">
      <div class="max-w-7xl mx-auto px-6">
        <div class="flex flex-col items-center mb-10">
          <span class="text-blue-600 text-[10px] font-black uppercase tracking-[0.2em] mb-2 bg-blue-50 px-4 py-1.5 rounded-full border border-blue-100">Official Portal</span>
          <h1 class="text-3xl md:text-4xl font-black text-slate-900 uppercase tracking-tight">Accredited Boarding Houses</h1>
          <p class="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2 mb-6">CSPC SASO Verified Student Accommodations</p>

          <!-- LIST / MAP TOGGLE -->
          <div class="inline-flex bg-slate-100 p-1 rounded-2xl border border-slate-200/60 shadow-inner">
            <button @click="showMapView = false"
                    class="px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                    :class="!showMapView ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400 hover:text-slate-600'">
              <i class="fa-solid fa-list mr-1.5"></i> List View
            </button>
            <button @click="toggleMapView"
                    class="px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                    :class="showMapView ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400 hover:text-slate-600'">
              <i class="fa-solid fa-map-location-dot mr-1.5"></i> Map View
            </button>
          </div>
        </div>

        <!-- AGGREGATE MAP VIEW -->
        <div v-if="showMapView" class="mb-10">
          <div ref="mapContainer" class="w-full h-[420px] sm:h-[480px] rounded-3xl border border-slate-200/80 shadow-md bg-slate-50"></div>
          <p class="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-3">
            <i class="fa-solid fa-circle-info mr-1"></i> Click a pin to preview a listing near CSPC campus.
          </p>
        </div>

        <!-- Subtle Offline Notice (ONLY when physically offline) -->
        <div v-if="isOffline" class="mb-8 max-w-3xl mx-auto p-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-amber-500/10 border border-amber-400/40 backdrop-blur-md rounded-2xl text-amber-900 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left animate-fade-in">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-md shadow-amber-200">
              <i class="fa-solid fa-wifi-slash animate-pulse"></i>
            </div>
            <div>
              <p class="text-xs font-black uppercase tracking-wide text-amber-950">You are currently offline • Displaying saved listings</p>
              <p class="text-[11px] font-medium text-amber-800">Reconnect to active internet to view real-time room availability and updates.</p>
            </div>
          </div>
          <span class="self-start sm:self-auto text-[9px] bg-amber-600 text-white px-3 py-1.5 rounded-full font-black uppercase tracking-widest shrink-0 shadow-sm">
            Offline Cache
          </span>
        </div>

        <!-- Loading State Indicator -->
        <div v-if="isLoading" class="py-12 flex flex-col items-center justify-center gap-2">
          <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p class="text-slate-400 font-bold uppercase text-[9px] tracking-widest">Loading Boarding Houses...</p>
        </div>

        <div v-if="!showMapView && houses.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div v-for="house in houses" :key="house.id" 
               class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col h-full group">
            
            <div class="aspect-video overflow-hidden bg-slate-100 relative">
              <img :src="getImageUrl(house.img)" loading="lazy" decoding="async" class="w-full h-full object-cover grayscale-[10%] group-hover:grayscale-0 transition duration-500" @error="e => e.target.src = 'https://placehold.co/600x400?text=No+Photo'" alt="House photo" />
              <div class="absolute top-3 right-3 bg-blue-600 text-white text-[8px] font-black px-2 py-1 rounded-full uppercase tracking-widest shadow-lg">
                Accredited
              </div>
            </div>

            <div class="p-5 flex flex-col flex-1 text-center">
              <div class="min-h-[60px] flex items-center justify-center mb-2">
                <h2 class="font-black text-sm text-[#2a528a] uppercase leading-tight tracking-tight">
                  {{ house.name }}
                </h2>
              </div>
              
              <p class="text-slate-400 text-[9px] font-bold uppercase tracking-widest mb-6 truncate">
                <i class="fa-solid fa-location-dot mr-1"></i> {{ formatAddress(house) }}
              </p>
    
              <button @click="toggleModal" class="mt-auto w-full bg-[#2a528a] text-white px-4 py-3 rounded-lg text-[9px] font-black tracking-[0.2em] uppercase hover:bg-black transition shadow-md focus:outline-none">
                BOOK NOW
              </button>
            </div>
          </div>
        </div>

        <!-- ONLINE Empty State (When 0 accredited houses exist in database) -->
        <div v-else-if="!isLoading && !isOffline && houses.length === 0" class="col-span-full py-16 text-center flex flex-col items-center justify-center bg-slate-50/50 rounded-3xl border border-slate-100 p-8 max-w-xl mx-auto">
          <div class="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#2a528a] mb-4 shadow-sm">
            <i class="fa-solid fa-building-circle-check text-2xl"></i>
          </div>
          <h3 class="text-slate-900 font-black uppercase tracking-tight text-sm mb-1">No Accredited Boarding Houses Available Yet</h3>
          <p class="text-slate-400 font-medium text-xs max-w-md leading-relaxed">
            SASO Administrators are currently inspecting and reviewing pending landlord accreditation applications. Please check back soon!
          </p>
        </div>

        <!-- OFFLINE Empty State -->
        <div v-else-if="!isLoading && isOffline && houses.length === 0" class="col-span-full py-16 text-center flex flex-col items-center justify-center bg-amber-50/50 rounded-3xl border border-amber-100 p-8 max-w-xl mx-auto">
          <div class="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600 mb-4 shadow-sm">
            <i class="fa-solid fa-wifi-slash text-2xl"></i>
          </div>
          <h3 class="text-amber-950 font-black uppercase tracking-widest text-xs mb-1">No Saved Boarding Houses Offline</h3>
          <p class="text-amber-800 font-medium text-xs max-w-md leading-relaxed">
            Please connect to an active internet connection to load and save available boarding houses.
          </p>
        </div>
      </div>
    </section>

    <!-- FOOTER WITH HIGH-VISIBILITY DATA PRIVACY ACT COMPLIANCE BADGE -->
    <footer class="bg-slate-900 text-white py-10 px-6 border-t border-slate-800 shrink-0">
      <div class="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div class="text-center md:text-left">
          <p class="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">CSPC Boarding House Selection System</p>
          <p class="text-[11px] text-slate-400">Official Student Affairs and Services Office (SASO) Accommodation Portal</p>
        </div>

        <!-- High-Visibility Prominent Data Privacy Badge Button -->
        <button 
          @click="showPrivacyModal = true" 
          class="group bg-gradient-to-r from-amber-500/20 via-amber-400/10 to-amber-500/20 hover:from-amber-500/30 hover:to-amber-500/30 border border-amber-400/50 text-amber-300 px-5 py-2.5 rounded-full flex items-center gap-2.5 transition-all duration-300 shadow-md hover:shadow-amber-500/10 active:scale-95 focus:outline-none"
        >
          <span class="w-6 h-6 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-xs font-black group-hover:scale-110 transition">
            <i class="fa-solid fa-shield-halved"></i>
          </span>
          <div class="text-left leading-tight">
            <p class="text-[10px] font-black uppercase tracking-widest text-amber-300">Data Privacy Policy</p>
            <p class="text-[9px] font-semibold text-amber-200/80">RA 10173 Compliant Disclosure</p>
          </div>
        </button>
      </div>

      <div class="max-w-7xl mx-auto mt-8 pt-6 border-t border-slate-800/80 text-center text-[10px] text-slate-400 font-medium">
        <p>© 2026 CSPC Boarding House Selection & Management System. All rights reserved.</p>
      </div>
    </footer>

    <!-- Privacy Policy Modal Component -->
    <PrivacyPolicyModal :isOpen="showPrivacyModal" @close="showPrivacyModal = false" />
  </div>
</template>
