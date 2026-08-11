<script setup>
defineProps({
  currentUser: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['open-login', 'logout']);
</script>

<template>
  <!-- CSPC Royal Blue Navbar -->
  <nav class="sticky top-0 bg-[#1e4a8d] border-b border-blue-900/40 z-50 shadow-md text-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 md:px-10 h-16 flex justify-between items-center">
      
      <!-- Brand Logo and Title -->
      <a href="/" class="flex items-center gap-2.5 min-w-0 pr-2 group">
        <img src="/img/CSPC_logo.png" alt="CSPC Logo" class="w-8 h-8 sm:w-9 sm:h-9 object-contain flex-shrink-0 bg-white/10 rounded-full p-0.5 transition group-hover:scale-105" />
        <span class="font-bold text-xs sm:text-sm tracking-tight uppercase text-white truncate">
          CSPC'S BOARDING HOUSE SELECTION
        </span>
      </a>

      <!-- Auth Action States -->
      <div class="flex items-center gap-3 flex-shrink-0">
        <!-- If Logged In: Show User Info & Logout -->
        <div v-if="currentUser" class="flex items-center gap-3">
          <span class="text-xs text-blue-100 hidden sm:inline">
            Welcome, <strong class="text-white font-bold">{{ currentUser.name }}</strong>
            <span class="text-[9px] px-2 py-0.5 rounded-full bg-blue-900 text-blue-200 ml-1.5 uppercase font-black tracking-wider border border-blue-800">{{ currentUser.role }}</span>
          </span>
          <button 
            @click="emit('logout')" 
            class="text-xs font-bold text-red-300 hover:text-red-400 uppercase tracking-widest transition"
          >
            Logout
          </button>
        </div>
        
        <!-- If Logged Out: Show LOGIN Trigger Pill Button -->
        <a 
          v-else 
          href="/login-options" 
          @click.prevent="emit('open-login')" 
          class="bg-[#4fa3f7] hover:bg-[#3993e8] text-white text-xs font-bold py-1.5 px-5 sm:px-6 rounded-full transition-all duration-200 uppercase tracking-wider shadow-sm active:scale-95 flex items-center justify-center whitespace-nowrap"
        >
          LOGIN
        </a>
      </div>

    </div>
  </nav>
</template>