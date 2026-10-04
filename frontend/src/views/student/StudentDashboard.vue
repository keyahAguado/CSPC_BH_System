<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import StudentNav from '../../components/partials/StudentNav.vue';

import { useOfflineStatus } from '../../utils/offlineHelper.js';
import { formatAddress } from '../../utils/formatAddress.js';
import { formatPriceRange } from '../../utils/formatPrice.js';

const router = useRouter();
const route = useRoute();
// Instant initialization from persistent localStorage cache for 0ms offline rendering
const initialCachedHouses = (() => {
  try {
    const raw = localStorage.getItem('cspc_cached_student_houses') || localStorage.getItem('cspc_cached_accredited_houses');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
})();

const houses = ref(initialCachedHouses);
const isLoading = ref(initialCachedHouses.length === 0);
const searchInput = ref('');
const minPrice = ref('');
const maxPrice = ref('');
const selectedRatings = ref([]);
const showLoginModal = ref(false);

const { isOffline } = useOfflineStatus();
const isOfflineFlag = ref(false);

const token = sessionStorage.getItem('cspc_token');
const userRaw = sessionStorage.getItem('cspc_user');
const currentUser = userRaw ? JSON.parse(userRaw) : null;
const isGuest = computed(() => route.query.guest === 'true' || !token);
const displayName = computed(() => isGuest.value ? 'Guest' : (currentUser?.name || 'Guest'));


import { getApiBaseUrl, getImageUrl } from '../../config/api';

const API = getApiBaseUrl();

const fetchHouses = async () => {
  try {
    if (houses.value.length === 0) {
      isLoading.value = true;
    }
    isOfflineFlag.value = false;
    const res = await axios.get('/api/student/houses');
    const fetched = res.data?.houses || res.data?.data || (Array.isArray(res.data) ? res.data : null);
    if (Array.isArray(fetched)) {
      houses.value = fetched;
      localStorage.setItem('cspc_cached_student_houses', JSON.stringify(fetched));
    }
  } catch (e) {
    console.error('Failed to load houses from network:', e);
    try {
      const cached = localStorage.getItem('cspc_cached_student_houses') || localStorage.getItem('cspc_cached_accredited_houses');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          houses.value = parsed;
        }
      }
    } catch (err) {}
    
    if (houses.value.length === 0) {
      isOfflineFlag.value = true;
    }
  } finally {
    isLoading.value = false;
  }
};

const filteredHouses = computed(() => {
  const query = (searchInput.value || '').toLowerCase().trim();
  const terms = query.split(/\s+/).filter(t => t.length > 0);

  const filtered = houses.value.filter(h => {
    const name = (h.name || '').toLowerCase();
    const address = (h.address || h.location || '').toLowerCase();
    const barangay = (h.barangay || '').toLowerCase();
    const ownerName = (h.owner_name || '').toLowerCase();

    const matchSearch = terms.length === 0 || terms.some(t => 
      name.includes(t) || address.includes(t) || barangay.includes(t) || ownerName.includes(t)
    );

    const rawPrice = (h.price !== null && h.price !== undefined) ? String(h.price).replace(/,/g, '') : '0';
    const price = parseFloat(rawPrice) || 0;
    const min = parseFloat(minPrice.value) || 0;
    const max = parseFloat(maxPrice.value) || Infinity;
    const matchPrice = price >= min && price <= max;

    const rating = Math.round(parseFloat(h.avg_rating) || 0);
    const matchRating = selectedRatings.value.length === 0 || selectedRatings.value.includes(rating);
    return matchSearch && matchPrice && matchRating;
  });

  if (terms.length > 0) {
    return [...filtered].sort((a, b) => {
      const getScore = (h) => {
        const name = (h.name || '').toLowerCase();
        const address = (h.address || h.location || '').toLowerCase();
        const barangay = (h.barangay || '').toLowerCase();
        const ownerName = (h.owner_name || '').toLowerCase();
        return terms.reduce((acc, t) => {
          let score = 0;
          if (name.includes(t)) score += 3;
          if (address.includes(t)) score += 2;
          if (barangay.includes(t)) score += 1;
          if (ownerName.includes(t)) score += 1;
          return acc + score;
        }, 0);
      };
      return getScore(b) - getScore(a);
    });
  }

  return filtered;
});

const toggleRating = (num) => {
  const idx = selectedRatings.value.indexOf(num);
  if (idx === -1) selectedRatings.value.push(num);
  else selectedRatings.value.splice(idx, 1);
};

const handleBook = (houseId) => {
  if (isGuest.value) {
    showLoginModal.value = true;
  } else {
    router.push(`/student/book/${houseId}`);
  }
};

const handleDetails = (houseId) => {
  router.push(`/student/house/${houseId}`);
};

const preventBackNavigation = () => {
  window.history.pushState(null, null, window.location.href);
};

onMounted(() => {
  window.history.pushState(null, null, window.location.href);
  window.addEventListener('popstate', preventBackNavigation);
  fetchHouses();
});

onUnmounted(() => {
  window.removeEventListener('popstate', preventBackNavigation);
});
</script>

<template>
  <div class="bg-[#f8fafc] min-h-screen font-sans text-slate-800 pb-20">
    <StudentNav />

    <!-- LOGIN PROMPT MODAL -->
    <div
      v-if="showLoginModal"
      class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-fade-in"
    >
      <div class="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border border-slate-100">
        <div class="text-blue-600 mb-4 flex justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 class="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Login Required</h2>
        <p class="text-slate-500 mb-6 text-sm">
          To perform this action, you must first log in using your <strong>CSPC student email</strong>.
        </p>
        <div class="flex flex-col gap-3">
          <a
            href="/login-options"
            class="bg-blue-600 hover:bg-slate-900 text-white font-black py-3.5 rounded-xl transition-colors uppercase text-xs tracking-widest text-center block shadow-lg shadow-blue-100"
          >Go to Login</a>
          <button
            @click="showLoginModal = false"
            class="text-slate-400 text-xs font-bold hover:text-slate-900 uppercase tracking-widest mt-2 focus:outline-none"
          >Cancel</button>
        </div>
      </div>
    </div>

    <!-- MAIN BODY CONTAINER -->
    <main class="max-w-7xl mx-auto py-12 px-6">
      <div class="flex flex-col lg:flex-row gap-8">

        <!-- SIDEBAR FILTERS (Desktop only) -->
        <aside class="hidden lg:block lg:w-[260px] flex-shrink-0 text-left">
          <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/60 sticky top-24">
            <div class="flex items-center gap-2.5 mb-4 text-slate-800">
              <i class="fa-solid fa-sliders text-blue-500 text-sm"></i>
              <h2 class="text-xs font-black uppercase tracking-[0.2em] text-slate-900">Filter Directory</h2>
            </div>
            <hr class="mb-5 border-slate-100">

            <!-- Star Rating Filter -->
            <div class="mb-6">
              <h3 class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Ratings</h3>
              <div class="space-y-2.5">
                <label
                  v-for="num in [5,4,3,2,1]"
                  :key="num"
                  class="flex items-center gap-3 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    :value="num"
                    :checked="selectedRatings.includes(num)"
                    @change="toggleRating(num)"
                    class="w-4 h-4 border-slate-300 rounded text-blue-600 focus:ring-0 cursor-pointer"
                  >
                  <span class="text-xs font-bold text-slate-600 group-hover:text-slate-900">
                    {{ num }}
                    <span class="text-amber-400 ml-1">
                      <i v-for="star in num" :key="star" class="fa-solid fa-star text-[10px]"></i>
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <!-- Price Range Filter -->
            <div>
              <h3 class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Price Range </h3>
              <div class="flex items-center gap-1.5">
                <div class="relative flex-1">
                  <span class="absolute left-3 top-2.5 text-slate-300 text-[10px] font-bold">₱</span>
                  <input
                    type="number"
                    v-model="minPrice"
                    placeholder="MIN"
                    class="w-full pl-6 pr-2 py-2 border border-slate-200 bg-slate-50/50 rounded-xl text-[10px] font-black outline-none focus:bg-white focus:border-blue-400 transition"
                  >
                </div>
                <span class="text-slate-300 text-xs">-</span>
                <div class="relative flex-1">
                  <span class="absolute left-3 top-2.5 text-slate-300 text-[10px] font-bold">₱</span>
                  <input
                    type="number"
                    v-model="maxPrice"
                    placeholder="MAX"
                    class="w-full pl-6 pr-2 py-2 border border-slate-200 bg-slate-50/50 rounded-xl text-[10px] font-black outline-none focus:bg-white focus:border-blue-400 transition"
                  >
                </div>
              </div>
            </div>
          </div>
        </aside>

        <!-- MAIN VIEW WORKSPACE -->
        <section class="flex-1 text-left">
          <!-- Welcome and Search Header (Aligned horizontally on desktop to save space) -->
          <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-3 lg:mb-6 border-b border-slate-200/50 pb-3 lg:pb-6">
            <div>
              <h1 class="text-3xl font-black text-slate-900 mb-1 uppercase tracking-tight">
                Welcome, {{ displayName }}
              </h1>
              <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">CSPC Housing Selection Portal</p>
            </div>
            
            <!-- Compact Search Bar -->
            <div class="relative w-full max-w-sm shrink-0">
              <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                <i class="fa-solid fa-magnifying-glass text-xs"></i>
              </span>
              <input
                type="text"
                v-model="searchInput"
                placeholder="SEARCH BOARDING HOUSE..."
                class="w-full pl-9 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black tracking-widest shadow-sm focus:border-blue-400 outline-none transition"
              >
            </div>
          </div>

          <!-- MOBILE-ONLY INLINE FILTER CARD (hidden on lg+) -->
          <div class="lg:hidden mb-6">
            <div class="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4">
              <p class="text-[9px] font-black text-slate-800 uppercase tracking-[0.2em] mb-3">Filters</p>
              <!-- Rating -->
              <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Rating</p>
              <div class="grid grid-cols-3 gap-2 mb-4">
                <label
                  v-for="num in [5,4,3,2,1]"
                  :key="num"
                  class="flex items-center gap-1.5 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    :value="num"
                    :checked="selectedRatings.includes(num)"
                    @change="toggleRating(num)"
                    class="w-4 h-4 border-slate-300 rounded text-blue-600 focus:ring-0 cursor-pointer flex-shrink-0"
                  >
                  <span class="text-[10px] font-bold text-slate-600 group-hover:text-slate-900 flex items-center gap-0.5">
                    {{ num }}
                    <span class="text-amber-400">
                      <i v-for="star in num" :key="star" class="fa-solid fa-star text-[9px]"></i>
                    </span>
                  </span>
                </label>
              </div>

              <!-- Max Budget -->
              <hr class="border-slate-100 mb-3">
              <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Max Budget</p>
              <div class="flex items-center gap-1.5">
                <div class="relative flex-1">
                  <span class="absolute left-3 top-2.5 text-slate-300 text-[10px] font-bold">₱</span>
                  <input
                    type="number"
                    v-model="minPrice"
                    placeholder="MIN"
                    class="w-full pl-6 pr-2 py-2 border border-slate-200 bg-slate-50/50 rounded-xl text-[10px] font-black outline-none focus:bg-white focus:border-blue-400 transition"
                  >
                </div>
                <span class="text-slate-300 text-xs">-</span>
                <div class="relative flex-1">
                  <span class="absolute left-3 top-2.5 text-slate-300 text-[10px] font-bold">₱</span>
                  <input
                    type="number"
                    v-model="maxPrice"
                    placeholder="MAX"
                    class="w-full pl-6 pr-2 py-2 border border-slate-200 bg-slate-50/50 rounded-xl text-[10px] font-black outline-none focus:bg-white focus:border-blue-400 transition"
                  >
                </div>
              </div>
            </div>
          </div>

          <!-- Loading Spinner -->
          <div v-if="isLoading" class="py-24 text-center bg-white rounded-[2rem] border border-slate-200/60 shadow-sm">
            <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p class="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Loading boarding houses...</p>
          </div>

          <!-- Subtle Offline Notice (ONLY when physically offline) -->
          <div v-if="isOffline" class="mb-6 p-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-amber-500/10 border border-amber-400/40 backdrop-blur-md rounded-2xl text-amber-900 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
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

          <!-- ONLINE Empty State (When 0 accredited houses exist in database) -->
          <div v-if="!isLoading && !isOffline && houses.length === 0" class="py-20 text-center bg-white rounded-[2rem] border border-slate-200/80 shadow-sm px-6">
            <div class="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#2a528a] mx-auto mb-4 shadow-sm">
              <i class="fa-solid fa-building-circle-check text-2xl"></i>
            </div>
            <h3 class="text-slate-900 font-black uppercase tracking-tight text-sm mb-1">No Accredited Boarding Houses Available Yet</h3>
            <p class="text-slate-400 font-medium text-xs max-w-md mx-auto leading-relaxed">
              SASO Administrators are currently reviewing and inspecting pending landlord accreditation applications. Please check back soon for updated listings.
            </p>
          </div>

          <!-- OFFLINE Empty State (Only if NO cached houses exist in storage) -->
          <div v-if="!isLoading && isOffline && houses.length === 0" class="py-20 text-center bg-white rounded-[2rem] border-2 border-dashed border-amber-200 shadow-sm px-6">
            <div class="w-14 h-14 rounded-2xl bg-amber-100/80 flex items-center justify-center text-amber-600 mx-auto mb-4">
              <i class="fa-solid fa-wifi-slash text-2xl"></i>
            </div>
            <h3 class="text-amber-900 font-black uppercase tracking-widest text-xs mb-1">No Saved Listings Available Offline</h3>
            <p class="text-slate-500 font-medium text-xs max-w-sm mx-auto">Please connect to an active internet connection to load and save available boarding houses.</p>
          </div>

          <!-- DYNAMIC ACCREDITED HOUSES GRID -->
          <div v-if="!isLoading && houses.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div
              v-for="house in filteredHouses"
              :key="house.id"
              class="bg-white rounded-[2rem] p-5 shadow-sm border border-slate-200/50 hover:shadow-md transition-all duration-300 flex flex-col hover:-translate-y-1"
            >
              <!-- Aspect-Ratio Protected Photo Cover -->
              <div class="rounded-2xl overflow-hidden mb-5 aspect-[16/10] bg-slate-50 border border-slate-100 shadow-inner">
                <img
                  :src="getImageUrl(house.img)"
                  :alt="house.name"
                  loading="lazy"
                  decoding="async"
                  class="w-full h-full object-cover grayscale-[5%] hover:grayscale-0 transition duration-500"
                  @error="$event.target.src='https://cdn-icons-png.flaticon.com/512/3135/3135715.png'"
                >
              </div>

              <!-- Header Details -->
              <div class="px-1 mb-5 text-left">
                <!-- Stars Rating badge using clean FontAwesome glpyhs -->
                <div v-if="house.review_count > 0" class="flex items-center gap-1 text-amber-400 text-[10px] mb-2">
                  <i v-for="i in 5" :key="i" class="fa-solid fa-star" :class="i <= Math.round(house.avg_rating) ? 'text-amber-400' : 'text-slate-100'"></i>
                  <span class="text-slate-400 ml-1.5 font-black uppercase tracking-widest text-[8px]">
                    ({{ house.review_count }} Reviews)
                  </span>
                </div>
                
                <h2 class="font-black text-xl text-slate-900 leading-tight uppercase tracking-tight mb-1.5">{{ house.name }}</h2>
                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                  <i class="fa-solid fa-location-dot text-[9px] text-blue-500"></i>
                  {{ formatAddress(house) }}
                </p>
              </div>

              <!-- Action Terms Footer Block -->
              <div class="mt-auto bg-slate-50 border border-slate-100/80 rounded-2xl p-5 flex justify-between items-center">
                <div class="text-left">
                  <p class="font-black text-2xl text-slate-900 leading-none">{{ formatPriceRange(house) }}</p>
                  <p class="text-[8px] text-slate-400 font-black uppercase tracking-widest mt-1.5 leading-none">per month</p>
                  <p class="text-[9px] text-slate-500 font-bold mt-2 flex items-center gap-1">
                    <i class="fa-solid fa-door-open text-blue-500 text-[8px]"></i> Rooms: {{ house.room_count || 0 }}
                  </p>
                </div>
                <div class="flex flex-col gap-1.5 items-end shrink-0">
                  <button
                    @click="handleBook(house.id)"
                    class="bg-blue-600 text-white text-[10px] font-black py-2.5 px-6 rounded-xl uppercase tracking-widest hover:bg-slate-900 transition active:scale-95 shadow-lg shadow-blue-100 leading-none cursor-pointer"
                  >Book Now</button>
                  <button
                    @click="handleDetails(house.id)"
                    class="bg-slate-200 text-slate-800 text-[10px] font-black py-2.5 px-6 rounded-xl uppercase tracking-widest hover:bg-slate-900 hover:text-white transition leading-none cursor-pointer"
                  >View Details</button>
                </div>
              </div>
            </div>

            <!-- Empty State Dotted-Border Card -->
            <div v-if="filteredHouses.length === 0" class="col-span-full py-20 text-center bg-white rounded-[2rem] border-2 border-dashed border-slate-200/80 shadow-inner">
              <svg class="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2"
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
              </svg>
              <p class="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No accredited houses match your filter criteria.</p>
            </div>
          </div>
        </section>
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
  animation: fadeIn 0.25s ease-out forwards;
}
</style>