<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import StudentNav from '../../components/partials/StudentNav.vue';
import { formatAddress } from '../../utils/formatAddress.js';
import { formatPriceRange } from '../../utils/formatPrice.js';
import { getImageUrl } from '../../config/api';

const route = useRoute();
const router = useRouter();

const CSPC_GATE = { lat: 13.4059565, lng: 123.3753135 };
const CACHE_KEY = 'cspc_cached_student_houses';

const houses = ref((() => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]') || []; } catch (e) { return []; }
})());
const isLoading = ref(true);
const mapError = ref('');
const selectedId = ref(route.query.house ? String(route.query.house) : null);
const locating = ref(false);
const locateNotice = ref('');

// Same coordinate rules as the House Details map
const coordsOf = (house) => {
  if (String(house.latitude ?? '').trim() === '' || String(house.longitude ?? '').trim() === '') return null;
  const lat = Number(house.latitude);
  const lng = Number(house.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0 || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};
const pinnedHouses = computed(() => houses.value.filter(h => coordsOf(h)));
const unpinnedCount = computed(() => houses.value.length - pinnedHouses.value.length);
const selectedHouse = computed(() => pinnedHouses.value.find(h => String(h.id) === selectedId.value) || null);

const displayPrice = (house) => {
  const text = formatPriceRange(house);
  return text === '₱0' ? null : text.replace(' - ', ' – ');
};
// Short price for the pin itself: the lowest monthly price
const pinPrice = (house) => {
  const min = parseFloat(house.min_price) || parseFloat(String(house.price ?? '').replace(/,/g, '')) || 0;
  return min > 0 ? '₱' + Math.round(min).toLocaleString() : 'BH';
};
const ratingValue = (house) => parseFloat(house.avg_rating) || 0;
const directionsUrl = (house) => {
  const c = coordsOf(house);
  return c ? `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}` : '#';
};

let google = null;
let map = null;
let userMarker = null;
const markers = new Map(); // house id -> { marker, el }

const fetchHouses = async () => {
  let apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  try {
    const res = await axios.get('/api/student/houses');
    if (Array.isArray(res.data?.houses)) {
      houses.value = res.data.houses;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(res.data.houses)); } catch (e) {}
    }
    apiKey = res.data?.googleMapsApiKey || apiKey;
  } catch (e) {
    console.warn('Map: could not refresh boarding houses, using saved listings.');
  }
  return apiKey;
};

const pinElement = (house) => {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'bh-pin';
  el.setAttribute('aria-label', `${house.name}, ${pinPrice(house)}`);
  el.innerHTML = `<i class="fa-solid fa-house" aria-hidden="true"></i><span></span>`;
  el.querySelector('span').textContent = pinPrice(house);
  return el;
};

const highlightSelected = () => {
  markers.forEach(({ el }, id) => el?.classList.toggle('is-selected', id === selectedId.value));
};

const selectHouse = (house, pan = true) => {
  selectedId.value = String(house.id);
  highlightSelected();
  router.replace({ query: { ...route.query, house: String(house.id) } }).catch(() => {});
  if (pan && map) map.panTo(coordsOf(house));
};

const clearSelection = () => {
  selectedId.value = null;
  highlightSelected();
  const { house, ...rest } = route.query;
  router.replace({ query: rest }).catch(() => {});
};

const addMarkers = async () => {
  let AdvancedMarkerElement = null;
  try { ({ AdvancedMarkerElement } = await importLibrary('marker')); } catch (e) {}

  pinnedHouses.value.forEach(house => {
    const position = coordsOf(house);
    const id = String(house.id);
    if (AdvancedMarkerElement) {
      const el = pinElement(house);
      const marker = new AdvancedMarkerElement({ map, position, content: el, title: house.name, zIndex: 2 });
      el.addEventListener('click', (ev) => { ev.stopPropagation(); selectHouse(house); });
      markers.set(id, { marker, el });
    } else {
      const marker = new google.maps.Marker({ map, position, title: house.name, label: { text: pinPrice(house), fontSize: '11px', fontWeight: '700' } });
      marker.addListener('click', () => selectHouse(house));
      markers.set(id, { marker, el: null });
    }
  });

  // CSPC campus marker
  if (AdvancedMarkerElement) {
    const el = document.createElement('div');
    el.className = 'campus-pin';
    el.innerHTML = '<img src="/img/CSPC_logo.png" alt=""><span>CSPC</span>';
    new AdvancedMarkerElement({ map, position: CSPC_GATE, content: el, title: 'CSPC Campus', zIndex: 1 });
  } else {
    new google.maps.Marker({ map, position: CSPC_GATE, title: 'CSPC Campus' });
  }
  highlightSelected();
};

const fitAll = () => {
  if (!map) return;
  if (selectedHouse.value) {
    map.setCenter(coordsOf(selectedHouse.value));
    map.setZoom(17);
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  bounds.extend(CSPC_GATE);
  pinnedHouses.value.forEach(h => bounds.extend(coordsOf(h)));
  if (pinnedHouses.value.length === 0) { map.setCenter(CSPC_GATE); map.setZoom(15); return; }
  map.fitBounds(bounds, { top: 90, right: 40, bottom: 200, left: 40 });
};

const initMap = async () => {
  const apiKey = await fetchHouses();
  isLoading.value = false;
  if (!apiKey) { mapError.value = 'The map is currently unavailable. Please try again later.'; return; }
  try {
    try { setOptions({ key: apiKey, v: 'weekly' }); } catch (e) { /* already configured */ }
    await importLibrary('maps');
    google = window.google;
    await nextTick();
    const el = document.getElementById('studentMap');
    if (!google || !el) throw new Error('Google Maps did not load');
    map = new google.maps.Map(el, {
      center: CSPC_GATE,
      zoom: 15,
      mapId: 'CSPC_STUDENT_DETAILS_MAP',
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
      clickableIcons: false
    });
    map.addListener('click', () => { if (selectedId.value) clearSelection(); });
    await addMarkers();
    fitAll();
  } catch (err) {
    console.error('Map initialization failed:', err);
    mapError.value = 'The map is currently unavailable. Please check your connection and try again.';
  }
};

const locateMe = () => {
  locateNotice.value = '';
  if (!navigator.geolocation) { locateNotice.value = 'Your browser does not provide location access.'; return; }
  locating.value = true;
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      locating.value = false;
      const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (!map) return;
      if (!userMarker) {
        let AdvancedMarkerElement = null;
        try { ({ AdvancedMarkerElement } = await importLibrary('marker')); } catch (e) {}
        if (AdvancedMarkerElement) {
          const dot = document.createElement('div');
          dot.className = 'me-dot';
          userMarker = new AdvancedMarkerElement({ map, position, content: dot, title: 'You are here', zIndex: 3 });
        } else {
          userMarker = new google.maps.Marker({ map, position, title: 'You are here' });
        }
      } else if ('position' in userMarker) {
        userMarker.position = position;
      } else {
        userMarker.setPosition(position);
      }
      map.panTo(position);
      map.setZoom(16);
    },
    () => {
      locating.value = false;
      locateNotice.value = 'Your location is unavailable. Allow location access and try again.';
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
  );
};

// Selecting a house from the list page ("View on Map") while this page is already open
watch(() => route.query.house, (id) => {
  if (!id || String(id) === selectedId.value) return;
  const house = pinnedHouses.value.find(h => String(h.id) === String(id));
  if (house) { selectHouse(house, false); fitAll(); }
});

onMounted(initMap);
onUnmounted(() => {
  markers.forEach(({ marker }) => { if ('map' in marker) marker.map = null; else marker.setMap?.(null); });
  markers.clear();
});
</script>

<template>
  <div class="student-map-page bg-[#f8fafc] font-sans text-slate-800">
    <StudentNav />

    <div class="map-shell relative">
      <div id="studentMap" class="absolute inset-0" role="region" aria-label="Map of boarding houses"></div>

      <!-- Loading / error -->
      <div v-if="isLoading || mapError" class="absolute inset-0 flex items-center justify-center bg-slate-50 px-6 text-center">
        <div v-if="isLoading">
          <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p class="text-sm text-slate-500">Loading map…</p>
        </div>
        <div v-else>
          <div class="w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-3"><i class="fa-solid fa-map-location-dot text-2xl" aria-hidden="true"></i></div>
          <p class="text-sm font-semibold text-slate-800">{{ mapError }}</p>
          <router-link to="/student/dashboard" class="inline-block mt-4 text-sm font-semibold text-blue-700">Back to the list</router-link>
        </div>
      </div>

      <!-- Top bar -->
      <div v-if="!isLoading && !mapError" class="absolute top-3 left-3 right-3 flex items-start gap-2 pointer-events-none">
        <div class="pointer-events-auto flex-1 min-w-0 bg-white/95 backdrop-blur rounded-2xl shadow-md border border-slate-100 px-4 py-2.5">
          <p class="text-[14px] font-bold text-slate-900 leading-tight">{{ pinnedHouses.length }} boarding {{ pinnedHouses.length === 1 ? 'house' : 'houses' }} on the map</p>
          <p v-if="unpinnedCount > 0" class="text-[12px] text-slate-500 leading-tight mt-0.5">{{ unpinnedCount }} without a map location are only in the list</p>
          <p v-else class="text-[12px] text-slate-500 leading-tight mt-0.5">Tap a pin to see the boarding house</p>
        </div>
        <router-link to="/student/dashboard" class="pointer-events-auto shrink-0 h-[52px] px-4 rounded-2xl bg-white shadow-md border border-slate-100 flex items-center gap-2 text-[14px] font-semibold text-blue-700">
          <i class="fa-solid fa-list" aria-hidden="true"></i> List
        </router-link>
      </div>

      <!-- My location -->
      <button
        v-if="!isLoading && !mapError"
        type="button"
        @click="locateMe"
        class="absolute right-3 w-12 h-12 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center text-blue-700 transition-[bottom]"
        :class="selectedHouse ? 'bottom-[208px]' : 'bottom-4'"
        aria-label="Show my location"
      >
        <i class="fa-solid" :class="locating ? 'fa-spinner fa-spin' : 'fa-location-crosshairs'" aria-hidden="true"></i>
      </button>
      <p v-if="locateNotice" role="status" class="absolute left-3 right-16 bottom-4 bg-white rounded-xl shadow-md px-3 py-2 text-[12px] text-slate-700" :class="{ 'bottom-[208px]': selectedHouse }">{{ locateNotice }}</p>

      <!-- Selected house card -->
      <transition name="card-up">
        <article v-if="selectedHouse" class="absolute left-3 right-3 bottom-3 bg-white rounded-[22px] shadow-xl border border-slate-100 p-2.5" aria-live="polite">
          <div class="flex gap-3">
            <img
              :src="getImageUrl(selectedHouse.img)"
              :alt="selectedHouse.name"
              class="w-[104px] h-[104px] rounded-2xl object-cover bg-slate-100 shrink-0"
              @error="$event.target.src='https://cdn-icons-png.flaticon.com/512/3135/3135715.png'"
            >
            <div class="min-w-0 flex-1 pr-7 py-0.5">
              <span class="inline-flex items-center gap-1 text-[10.5px] font-semibold text-green-700 bg-green-50 rounded-full px-2 py-0.5"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Accredited</span>
              <h2 class="font-black text-[15px] text-slate-900 leading-tight uppercase tracking-tight line-clamp-2 mt-1">{{ selectedHouse.name }}</h2>
              <p v-if="formatAddress(selectedHouse)" class="text-[11px] text-slate-500 uppercase tracking-wide line-clamp-1 mt-1">
                <i class="fa-solid fa-location-dot text-blue-600" aria-hidden="true"></i> {{ formatAddress(selectedHouse) }}
              </p>
              <div class="flex items-baseline justify-between gap-2 mt-1.5">
                <p class="leading-none truncate">
                  <template v-if="displayPrice(selectedHouse)"><span class="font-black text-[16px] text-blue-700">{{ displayPrice(selectedHouse) }}</span><span class="text-[11px] text-slate-500"> /month</span></template>
                  <span v-else class="text-[12px] text-slate-400">Price not available</span>
                </p>
                <p class="shrink-0 text-[12px] text-slate-600"><i class="fa-solid fa-star text-amber-400" aria-hidden="true"></i>
                  {{ Number(selectedHouse.review_count) > 0 ? ratingValue(selectedHouse).toFixed(1) : 'New' }}
                </p>
              </div>
            </div>
          </div>
          <button type="button" @click="clearSelection" class="absolute top-2 right-2 w-9 h-9 rounded-full text-slate-400 hover:bg-slate-100 flex items-center justify-center" aria-label="Close">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
          <div class="grid grid-cols-[1fr_1.2fr] gap-2.5 mt-2.5">
            <a :href="directionsUrl(selectedHouse)" target="_blank" rel="noopener" class="flex items-center justify-center gap-2 py-3 rounded-xl border-[1.5px] border-blue-700 text-blue-700 text-[14px] font-semibold">
              <i class="fa-solid fa-diamond-turn-right" aria-hidden="true"></i> Directions
            </a>
            <router-link :to="`/student/house/${selectedHouse.id}`" class="flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-700 text-white text-[14px] font-semibold">
              View Details <i class="fa-solid fa-arrow-right text-[12px]" aria-hidden="true"></i>
            </router-link>
          </div>
        </article>
      </transition>
    </div>
  </div>
</template>

<style scoped>
/* Fills the screen between the header and the mobile tab bar */
.map-shell { height: calc(100dvh - 64px - var(--student-tabbar-h, 64px) - env(safe-area-inset-bottom)); }
@media (min-width: 768px) { .map-shell { height: calc(100dvh - 76px); } }
.card-up-enter-active, .card-up-leave-active { transition: transform .2s ease, opacity .2s ease; }
.card-up-enter-from, .card-up-leave-to { transform: translateY(16px); opacity: 0; }
</style>

<style>
/* Map pins are created outside Vue, so these styles are global (prefixed to this page) */
.bh-pin { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: #1d4ed8; color: #fff; font: 700 12px/1 'Segoe UI', Arial, sans-serif; border: 2px solid #fff; box-shadow: 0 3px 10px rgb(15 47 102 / .35); cursor: pointer; position: relative; white-space: nowrap; }
.bh-pin::after { content: ''; position: absolute; left: 50%; bottom: -7px; margin-left: -6px; border: 6px solid transparent; border-top-color: #1d4ed8; border-bottom: 0; }
.bh-pin i { font-size: 11px; }
.bh-pin.is-selected { background: #e0a526; color: #142b4a; transform: scale(1.12); z-index: 5; }
.bh-pin.is-selected::after { border-top-color: #e0a526; }
.bh-pin:focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px; }
.campus-pin { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; border-radius: 999px; background: #fff; color: #142b4a; font: 800 12px/1 'Segoe UI', Arial, sans-serif; box-shadow: 0 3px 10px rgb(15 47 102 / .3); border: 2px solid #142b4a; }
.campus-pin img { width: 22px; height: 22px; object-fit: contain; }
.me-dot { width: 18px; height: 18px; border-radius: 50%; background: #2563eb; border: 3px solid #fff; box-shadow: 0 0 0 6px rgb(37 99 235 / .25); }
</style>
