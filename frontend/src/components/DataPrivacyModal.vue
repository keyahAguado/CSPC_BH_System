<script setup>
import { ref, watch } from 'vue';
import axios from 'axios';

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: 'Data Privacy Consent Notice'
  },
  subtitle: {
    type: String,
    default: 'Republic Act No. 10173 (Data Privacy Act of 2012)'
  }
});

const emit = defineEmits(['accepted', 'close']);

const isAgreed = ref(false);
const isSubmitting = ref(false);
const errorMsg = ref('');

watch(() => props.show, (newVal) => {
  if (newVal) {
    isAgreed.value = false;
    errorMsg.value = '';
  }
});

const handleConsentSubmit = async () => {
  if (!isAgreed.value) return;

  isSubmitting.value = true;
  errorMsg.value = '';

  try {
    const token = sessionStorage.getItem('cspc_token');
    const API = import.meta.env.VITE_API_URL || '';

    if (token) {
      await axios.post(`${API}/api/auth/dpa-consent`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Update session storage user object
      const storedUser = JSON.parse(sessionStorage.getItem('cspc_user') || '{}');
      storedUser.dpa_accepted = 1;
      storedUser.dpa_accepted_at = new Date().toISOString();
      sessionStorage.setItem('cspc_user', JSON.stringify(storedUser));
    }

    emit('accepted');
  } catch (err) {
    console.error('Failed to record DPA consent:', err);
    // Even if API fails, allow frontend flow to proceed gracefully
    emit('accepted');
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in">
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        
        <!-- Header -->
        <div class="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 px-6 py-5 text-white flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
            <svg class="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-bold tracking-tight text-white">{{ title }}</h3>
            <p class="text-xs text-blue-200 font-medium">{{ subtitle }}</p>
          </div>
        </div>

        <!-- Body Scrollable Content -->
        <div class="p-6 overflow-y-auto space-y-4 text-sm text-slate-600 dark:text-slate-300 flex-1">
          <div class="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 rounded-xl p-4 text-xs text-blue-900 dark:text-blue-300">
            <p class="font-bold mb-1 flex items-center gap-1.5">
              <svg class="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Camarines Sur Polytechnic Colleges &bull; Student Affairs & Services Office (SASO)
            </p>
            <p class="leading-relaxed">
              In compliance with Republic Act No. 10173, also known as the Data Privacy Act of 2012, CSPC is committed to protecting your privacy and ensuring that your personal information is processed with utmost confidentiality and security.
            </p>
          </div>

          <div class="space-y-3">
            <h4 class="font-semibold text-slate-900 dark:text-white text-xs uppercase tracking-wider">1. Purpose of Data Collection</h4>
            <p class="text-xs leading-relaxed">
              We collect and process your personal and accommodation details (including contact numbers, emergency contacts, identification credentials, property permits, and residency records) solely for accreditation, housing verification, safety monitoring, and official campus administration.
            </p>

            <h4 class="font-semibold text-slate-900 dark:text-white text-xs uppercase tracking-wider">2. Protection & Confidentiality</h4>
            <p class="text-xs leading-relaxed">
              Your personal data will not be shared with unauthorized third parties without your explicit consent, except as required by law or university regulatory policies.
            </p>

            <h4 class="font-semibold text-slate-900 dark:text-white text-xs uppercase tracking-wider">3. Your Rights as a Data Subject</h4>
            <p class="text-xs leading-relaxed">
              You reserve the right to access, correct, or request deletion of your personal data stored within the CSPC Boarding House Management System by contacting the SASO Administrator.
            </p>
          </div>

          <!-- Consent Checkbox -->
          <div class="pt-3 border-t border-slate-200 dark:border-slate-800">
            <label class="flex items-start gap-3 cursor-pointer group p-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-blue-50/50 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700/80 transition-colors">
              <input 
                type="checkbox" 
                v-model="isAgreed"
                class="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
              <span class="text-xs font-medium text-slate-800 dark:text-slate-200 leading-snug group-hover:text-blue-900 dark:group-hover:text-white">
                I have read and agree to the collection, processing, and storage of my personal and accommodation details in accordance with the Data Privacy Act of 2012 (RA 10173).
              </span>
            </label>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
          <button 
            type="button"
            @click="handleConsentSubmit"
            :disabled="!isAgreed || isSubmitting"
            class="w-full sm:w-auto px-6 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-md shadow-blue-700/20 transition-all flex items-center justify-center gap-2"
          >
            <svg v-if="isSubmitting" class="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>I Agree &amp; Continue</span>
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>
