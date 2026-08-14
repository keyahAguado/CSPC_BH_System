<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import StudentNav from '../../components/partials/StudentNav.vue';
import { useOfflineStatus } from '../../utils/offlineHelper.js';

const router = useRouter();
const houses = ref([]);
const isLoading = ref(true);
const searchInput = ref('');
const minPrice = ref('');
const maxPrice = ref('');
const selectedRatings = ref([]);
const showLoginModal = ref(false);

const { isOffline } = useOfflineStatus();
const isOfflineFlag = ref(false);

const token = localStorage.getItem('cspc_token');
const userRaw = localStorage.getItem('cspc_user');
const currentUser = userRaw ? JSON.parse(userRaw) : null;
const isGuest = !token;

import { getApiBaseUrl, getImageUrl } from '../../config/api';

const API = getApiBaseUrl();

const fetchHouses = async () => {
  try {
    isLoading.value = true;
    isOfflineFlag.value = false;
    // Always attempt the fetch — if offline, the SW will serve from cache automatically.
    // Only show the offline banner if both network and cache fail (no response at all).
    const res = await axios.get('/api/student/houses');
    houses.value = res.data.houses || [];
  } catch (e) {
    console.error('Failed to load houses', e);
    if (houses.value.length === 0) {
      isOfflineFlag.value = true;
    }
  } finally {
    isLoading.value = false;
  }
};

const filteredHouses = computed(() => {
  return houses.value.filter(h => {
    const name = (h.name || '').toLowerCase();
    const matchSearch = !searchInput.value || name.includes(searchInput.value.toLowerCase());
    const price = parseFloat(String(h.price).replace(/,/g, '')) || 0;
    const min = parseFloat(minPrice.value) || 0;
    const max = parseFloat(maxPrice.value) || Infinity;
    const matchPrice = price >= min && price <= max;
    const rating = Math.round(h.avg_rating || 0);
    const matchRating = selectedRatings.value.length === 0 || selectedRatings.value.includes(rating);
    return matchSearch && matchPrice && matchRating;
  });
});

const toggleRating = (num) => {
  const idx = selectedRatings.value.indexOf(num);
  if (idx === -1) selectedRatings.value.push(num);
  else selectedRatings.value.splice(idx, 1);
};

const handleBook = (houseId) => {
  if (isGuest) {
    showLoginModal.value = true;
  } else {
    router.push(`/student/book/${houseId}`);
  }
};

const handleDetails = (houseId) => {
  router.push(`/student/house/${houseId}`);
};

onMounted(fetchHouses);
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
              <h3 class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Accreditation Score</h3>
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
              <h3 class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Price Threshold</h3>
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
                Welcome, {{ currentUser?.name || 'Guest Student' }}
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

              <!-- Price Threshold -->
              <hr class="border-slate-100 mb-3">
              <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Price Threshold</p>
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

          <!-- Offline Banner -->
          <div v-else-if="isOffline || isOfflineFlag" class="py-24 text-center bg-white rounded-[2rem] border-2 border-dashed border-amber-200 shadow-sm">
            <svg class="w-12 h-12 text-amber-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M12 12h.01M8.464 15.536a5 5 0 010-7.072M5.636 18.364a9 9 0 010-12.728"/>
            </svg>
            <p class="text-amber-600 font-black uppercase tracking-widest text-[11px] mb-1">No Internet Connection</p>
            <p class="text-slate-400 font-bold text-[10px]">You are currently offline. Please connect to the internet to view available boarding houses.</p>
          </div>

          <!-- DYNAMIC ACCREDITED HOUSES GRID -->
          <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-8">
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
                  {{ house.location }}
                </p>
              </div>

              <!-- Action Terms Footer Block -->
              <div class="mt-auto bg-slate-50 border border-slate-100/80 rounded-2xl p-5 flex justify-between items-center">
                <div class="text-left">
                  <p class="font-black text-2xl text-slate-900 leading-none">₱{{ Number(house.price).toLocaleString() }}</p>
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