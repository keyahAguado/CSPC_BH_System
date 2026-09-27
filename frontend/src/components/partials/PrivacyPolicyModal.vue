<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close', 'accept']);

const isAgreed = ref(false);

watch(() => props.isOpen, (val) => {
  if (val) isAgreed.value = false;
});

const closeModal = () => {
  emit('close');
};

const handleAgree = () => {
  if (!isAgreed.value) return;
  localStorage.setItem('cspc_privacy_accepted', 'true');
  emit('accept');
  emit('close');
};
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in"
      @click.self="closeModal"
    >
      <div class="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">

        <!-- Header — matches DataPrivacyModal style -->
        <div class="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 px-6 py-5 text-white flex items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
              <svg class="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h3 class="text-lg font-bold tracking-tight text-white">Data Privacy Policy</h3>
              <p class="text-xs text-blue-200 font-medium">Republic Act No. 10173 (Data Privacy Act of 2012)</p>
            </div>
          </div>
          <button
            @click="closeModal"
            class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors focus:outline-none flex-shrink-0"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Body -->
        <div class="p-6 overflow-y-auto space-y-4 text-sm text-slate-600 flex-1">

          <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-900">
            <p class="font-bold mb-1 flex items-center gap-1.5">
              <svg class="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Camarines Sur Polytechnic Colleges &bull; Student Affairs &amp; Services Office (SASO)
            </p>
            <p class="leading-relaxed">
              In compliance with Republic Act No. 10173 (Data Privacy Act of 2012), CSPC is committed to protecting your privacy and ensuring that your personal information is processed with utmost confidentiality and security.
            </p>
          </div>

          <div class="space-y-3">
            <h4 class="font-semibold text-slate-900 text-xs uppercase tracking-wider">1. Personal Information Collected</h4>
            <ul class="list-disc pl-5 space-y-1 text-xs text-slate-500 leading-relaxed">
              <li><strong>Students:</strong> Full Name, Institutional Email, Contact Number, Address, Course/Year, Emergency Contact, and Guardian details.</li>
              <li><strong>Boarding House Owners:</strong> Full Name, Contact Number, Property Address, Legal Permits, and Property Photos.</li>
            </ul>

            <h4 class="font-semibold text-slate-900 text-xs uppercase tracking-wider">2. Purpose of Data Collection</h4>
            <ul class="list-disc pl-5 space-y-1 text-xs text-slate-500 leading-relaxed">
              <li>Verifying student eligibility via official CSPC email authentication.</li>
              <li>Processing boarding house accreditation and compliance verification by SASO Administrators.</li>
              <li>Facilitating secure room bookings and payment record verification.</li>
              <li>Assisting emergency monitoring and safety compliance under CSPC SASO supervision.</li>
            </ul>

            <h4 class="font-semibold text-slate-900 text-xs uppercase tracking-wider">3. Protection &amp; Confidentiality</h4>
            <p class="text-xs leading-relaxed text-slate-500">
              All credentials and uploaded files are secured using industry-standard safeguards including cryptographic password hashing, stateless JWT session tokens, and encrypted cloud storage. Your personal data will not be shared with unauthorized third parties.
            </p>

            <h4 class="font-semibold text-slate-900 text-xs uppercase tracking-wider">4. Your Rights as a Data Subject</h4>
            <ul class="list-disc pl-5 space-y-1 text-xs text-slate-500 leading-relaxed">
              <li>Be informed of how your personal data is processed.</li>
              <li>Access, update, or rectify your profile information.</li>
              <li>Request deletion of your account data by coordinating with SASO.</li>
            </ul>

            <h4 class="font-semibold text-slate-900 text-xs uppercase tracking-wider">5. Contact &amp; Inquiries</h4>
            <p class="text-xs leading-relaxed text-slate-500">
              For questions or to exercise your rights under RA 10173, contact the <strong>Student Affairs and Services Office (SASO)</strong> at CSPC, Nabua, Camarines Sur.
            </p>
          </div>

          <!-- Consent Checkbox — consistent with DataPrivacyModal -->
          <div class="pt-3 border-t border-slate-200">
            <label class="flex items-start gap-3 cursor-pointer group p-3 bg-slate-50 hover:bg-blue-50/50 rounded-xl border border-slate-200 transition-colors">
              <input
                type="checkbox"
                v-model="isAgreed"
                class="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
              <span class="text-xs font-medium text-slate-800 leading-snug group-hover:text-blue-900">
                I have read and agree to the collection, processing, and storage of my personal information in accordance with the Data Privacy Act of 2012 (RA 10173).
              </span>
            </label>
          </div>
        </div>

        <!-- Footer -->
        <div class="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            @click="handleAgree"
            :disabled="!isAgreed"
            class="w-full sm:w-auto px-6 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>I Agree &amp; Continue</span>
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.98); }
  to   { opacity: 1; transform: scale(1); }
}
.animate-fade-in {
  animation: fadeIn 0.2s ease-out forwards;
}
</style>
