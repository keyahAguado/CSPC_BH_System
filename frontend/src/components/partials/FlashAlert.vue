<script setup>
import { ref } from 'vue';

const alerts = ref([]);

const showSystemAlert = (message, type = 'error') => {
  const id = 'alert-' + Date.now();
  const configs = {
    success: { 
      borderClass: 'border-emerald-500 bg-emerald-50/10', 
      iconClass: 'fa-circle-check', 
      iconBgClass: 'bg-emerald-500 text-white', 
      title: 'Action Successful' 
    },
    error: { 
      borderClass: 'border-red-500 bg-red-50/10', 
      iconClass: 'fa-circle-exclamation', 
      iconBgClass: 'bg-red-500 text-white', 
      title: 'Action Blocked' 
    },
    warning: { 
      borderClass: 'border-amber-500 bg-amber-50/10', 
      iconClass: 'fa-triangle-exclamation', 
      iconBgClass: 'bg-amber-500 text-white', 
      title: 'Attention Required' 
    },
    info: { 
      borderClass: 'border-blue-500 bg-blue-50/10', 
      iconClass: 'fa-circle-info', 
      iconBgClass: 'bg-blue-500 text-white', 
      title: 'Information' 
    }
  };

  const config = configs[type] || configs.error;
  const newAlert = { id, message, type, ...config };
  
  alerts.value.push(newAlert);

  setTimeout(() => {
    closeAlert(id);
  }, 7000);
};

const closeAlert = (id) => {
  alerts.value = alerts.value.filter(a => a.id !== id);
};

defineExpose({
  showSystemAlert
});
</script>

<template>
  <div class="fixed top-5 right-5 sm:top-8 sm:right-8 z-[99999] max-w-md w-[calc(100vw-2.5rem)] sm:w-full pointer-events-none space-y-3">
    <div v-for="alert in alerts" :key="alert.id" 
         class="pointer-events-auto flex items-center bg-white/95 backdrop-blur-md border-l-4 shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-2xl p-4 transition-all duration-300 ease-out transform animate-fade-in border border-slate-200/80 relative overflow-hidden" 
         :class="alert.borderClass">
      <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-md mr-3.5" :class="alert.iconBgClass">
        <i class="fa-solid text-base" :class="alert.iconClass"></i>
      </div>
      <div class="flex-1 pr-6 text-left">
        <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-0.5">{{ alert.title }}</h4>
        <p class="text-[12px] sm:text-[13px] font-bold text-slate-800 leading-snug whitespace-pre-line">{{ alert.message }}</p>
      </div>
      <button @click="closeAlert(alert.id)" class="absolute top-2.5 right-2.5 text-slate-400 hover:text-slate-900 w-6 h-6 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-all">
        <i class="fa-solid fa-xmark text-xs"></i>
      </button>
    </div>
  </div>
</template>
