<script setup>
defineProps({
  house: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['book-click']);

import { getImageUrl } from '../config/api';
</script>

<template>
  <div class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col h-full group">
    
    <div class="aspect-video overflow-hidden bg-slate-100 relative">
    <img 
    :src="house.img ? getImageUrl(house.img) : '/img/profile.jpg'" 
    class="w-full h-full object-cover grayscale-[10%] group-hover:grayscale-0 transition duration-500"
    @error="(e) => e.target.src = 'https://placehold.co/600x400?text=Accredited+House'"
    alt="Property thumbnail"
    />
      <div class="absolute top-3 right-3 bg-[#1e4a8d] text-white text-[8px] font-black px-2 py-1 rounded-full uppercase tracking-widest shadow-lg">
        Accredited
      </div>
    </div>

    <!-- Content details -->
    <div class="p-5 flex flex-col flex-1 text-center">
      <div class="min-h-[60px] flex items-center justify-center mb-2">
        <h2 class="font-black text-sm text-[#2a528a] uppercase leading-tight tracking-tight">
          {{ house.name }}
        </h2>
      </div>
      
      <p class="text-slate-400 text-[9px] font-bold uppercase tracking-widest mb-6 truncate">
        {{ house.location || 'Nabua, Camarines Sur' }}
      </p>

      <button 
        @click="emit('book-click')" 
        class="mt-auto w-full bg-[#2a528a] text-white px-4 py-3 rounded-lg text-[9px] font-black tracking-[0.2em] uppercase hover:bg-black transition shadow-md"
      >
        BOOK NOW
      </button>
    </div>

  </div>
</template>