<script setup>
import { ref } from 'vue';

const alerts = ref([]);

const showSystemAlert = (message, type = 'error') => {
  const id = 'alert-' + Date.now();
  const configs = {
    success: { borderClass: 'border-emerald-500', iconClass: 'fa-circle-check', iconColorClass: 'text-emerald-500', title: 'Action Successful' },
    error: { borderClass: 'border-slate-800', iconClass: 'fa-circle-info', iconColorClass: 'text-slate-600', title: 'System Notice' },
    warning: { borderClass: 'border-amber-500', iconClass: 'fa-triangle-exclamation', iconColorClass: 'text-amber-500', title: 'Attention Required' },
    info: { borderClass: 'border-blue-500', iconClass: 'fa-circle-info', iconColorClass: 'text-blue-500', title: 'Information' }
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
  <div class="fixed top-8 right-8 z-[9999] max-w-sm w-full px-4 pointer-events-none space-y-4">
    <div v-for="alert in alerts" :key="alert.id" 
         class="pointer-events-auto flex items-stretch bg-white border-l-4 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] rounded-r-xl transition-all duration-500 ease-out transform overflow-hidden" 
         :class="alert.borderClass">
      <div class="px-5 py-5 flex items-center justify-center bg-slate-50/50">
        <i class="fa-solid text-xl" :class="[alert.iconClass, alert.iconColorClass]"></i>
      </div>
      <div class="flex-1 p-5 pr-8 text-left">
        <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">{{ alert.title }}</h4>
        <p class="text-[13px] font-bold text-slate-700 leading-relaxed">{{ alert.message }}</p>
      </div>
      <button @click="closeAlert(alert.id)" class="absolute top-3 right-3 text-slate-300 hover:text-slate-900 transition-colors">
        <i class="fa-solid fa-xmark text-xs"></i>
      </button>
    </div>
  </div>
</template>
