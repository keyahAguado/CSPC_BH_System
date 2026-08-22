<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';
import Header from '../components/partials/Header.vue';

import { getImageUrl } from '../config/api';
import { formatAddress } from '../utils/formatAddress.js';

const houses = ref([]);
const isLoading = ref(true);
const showModal = ref(false);

const toggleModal = () => {
  showModal.value = !showModal.value;
};

const fetchHouses = async () => {
  try {
    isLoading.value = true;
    const response = await axios.get('/api/boarding-houses/accredited');
    if (response.data.success) {
      houses.value = response.data.data || [];
    }
  } catch (error) {
    console.error('Failed to fetch houses:', error);
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  fetchHouses();
});
</script>

<template>
  <div class="bg-white min-h-screen font-sans text-slate-800">
    <Header />

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
            <p class="text-sm text-gray-600 leading-relaxed font-medium">All boarding houses are verified and approved by the Student Affairs and Services Office (SASO) to ensure safety, compliance, and quality standards.</p>
          </div>
         
          <div class="bg-white p-8 rounded-xl shadow-md border-l-8 border-blue-500 hover:shadow-lg transition duration-300">
            <h3 class="font-bold text-blue-800 text-lg mb-3 uppercase tracking-tight">Advanced Search & Filters</h3>
            <p class="text-sm text-gray-600 leading-relaxed font-medium">Enables quick and efficient searching of boarding houses near CSPC campus to match students' and parents' specific needs.</p>
          </div>

          <div class="bg-white p-8 rounded-xl shadow-md border-l-8 border-blue-500 hover:shadow-lg transition duration-300">
            <h3 class="font-bold text-blue-800 text-lg mb-3 uppercase tracking-tight">Real Photos & Details</h3>
            <p class="text-sm text-gray-600 leading-relaxed font-medium">Actual photos of rooms and facilities plus full details: monthly rates, house rules, exact location, and owner contact information.</p>
          </div>

          <div class="bg-white p-8 rounded-xl shadow-md border-l-8 border-blue-500 hover:shadow-lg transition duration-300">
            <h3 class="font-bold text-blue-800 text-lg mb-3 uppercase tracking-tight">User Friendly & Responsive</h3>
            <p class="text-sm text-gray-600 leading-relaxed font-medium">Accessible on desktop and mobile devices, with an intuitive interface designed for students and parents to use easily anytime, anywhere.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 3. OFFERS SECTION -->
    <section id="offers" class="py-20 bg-white px-10">
      <div class="max-w-5xl mx-auto">
        <h2 class="text-[10px] font-black text-blue-600 text-center mb-2 tracking-[0.4em] uppercase">Boarding Houses</h2>
        <h3 class="text-2xl font-black text-black text-center mb-12 tracking-tight uppercase">Current Offers</h3>
        
        <!-- Loading State Indicator -->
        <div v-if="isLoading" class="py-12 flex flex-col items-center justify-center gap-2">
          <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p class="text-slate-400 font-bold uppercase text-[9px] tracking-widest">Loading Boarding Houses...</p>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

          <div v-if="houses.length === 0" class="col-span-full py-20 text-center flex flex-col items-center justify-center">
            <div class="text-slate-300 mb-4">
              <i class="fa-solid fa-house-circle-exclamation text-5xl"></i>
            </div>
            <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">No accredited boarding houses found yet.</p>
          </div>
        </div>
      </div>
    </section>


  </div>
</template>
