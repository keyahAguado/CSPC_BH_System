<script setup>
import FlashAlert from './FlashAlert.vue';
import { ref } from 'vue';

const alertRef = ref(null);
</script>

<template>
  <FlashAlert ref="alertRef" />
  
  <nav class="sticky top-0 bg-[#1e4a8d] z-50 text-white shadow-md border-b border-blue-900/30">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 md:px-10 h-16 flex justify-between items-center">
      
      <!-- Brand Logo and Title -->
      <a href="/" class="flex items-center gap-2.5 min-w-0 pr-2 group">
        <img src="/img/CSPC_logo.png" alt="CSPC Logo" class="w-8 h-8 sm:w-9 sm:h-9 object-contain flex-shrink-0 bg-white/10 rounded-full p-0.5 transition group-hover:scale-105" />
        <span class="font-bold text-xs sm:text-sm tracking-tight uppercase text-white truncate">
          CSPC'S BOARDING HOUSE SELECTION
        </span>
      </a>
      
      <!-- Navigation & Action Buttons -->
      <div class="flex items-center gap-4 flex-shrink-0">
        <!-- Links shown on desktop views -->
        <div class="hidden md:flex gap-6 text-xs uppercase items-center font-semibold text-blue-100">
          <a href="/" class="hover:text-white transition">Home</a>
          <a href="/#features" class="hover:text-white transition">Features</a>
          <a href="/#offers" class="hover:text-white transition">Offers</a>
        </div>

        <!-- Data Privacy Badge button -->
        <button 
          @click="$emit('openPrivacyModal')" 
          class="hidden sm:flex items-center gap-1.5 bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-300/40 text-[10px] font-extrabold px-3 py-1.5 rounded-full uppercase tracking-wider transition active:scale-95 focus:outline-none"
          title="Republic Act 10173 Data Privacy Policy"
        >
          <i class="fa-solid fa-shield-halved text-amber-400"></i>
          <span>Data Privacy</span>
        </button>
        
        <!-- Mobile & Desktop LOGIN Pill Button (Matching Mobile PWA Image) -->
        <a 
          href="/login-options" 
          class="bg-[#4fa3f7] hover:bg-[#3993e8] text-white text-xs font-bold py-1.5 px-5 sm:px-6 rounded-full transition-all duration-200 uppercase tracking-wider shadow-sm active:scale-95 flex items-center justify-center whitespace-nowrap"
        >
          LOGIN
        </a>
      </div>

    </div>
  </nav>
</template>

