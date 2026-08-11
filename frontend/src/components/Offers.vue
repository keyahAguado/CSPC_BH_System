<script setup>
import HouseCard from './HouseCard.vue';

defineProps({
  boardingHouses: {
    type: Array,
    required: true
  },
  isLoading: {
    type: Boolean,
    required: true
  }
});

const emit = defineEmits(['book-click']);
</script>

<template>
  <!-- 4. OFFERS SECTION -->
  <section id="offers" class="py-24 bg-white px-6">
    <div class="max-w-5xl mx-auto">
      <h2 class="text-[10px] font-black text-blue-600 text-center mb-2 tracking-[0.4em] uppercase">Boarding Houses</h2>
      <h3 class="text-2xl font-black text-black text-center mb-12 tracking-tight uppercase">Current Offers</h3>
      
      <!-- Loading State -->
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-20">
        <div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
        <p class="text-slate-500 text-xs mt-4 uppercase font-bold tracking-widest">Loading CSPC accredited properties...</p>
      </div>

      <!-- Grid of Reusable House Cards -->
      <div v-else-if="boardingHouses.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <HouseCard 
          v-for="house in boardingHouses" 
          :key="house.id" 
          :house="house" 
          @book-click="emit('book-click')"
        />
      </div>

      <!-- Empty State -->
      <div v-else class="py-20 text-center">
        <div class="text-slate-300 mb-4 flex justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>
        <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">No accredited boarding houses found yet.</p>
      </div>

    </div>
  </section>
</template>