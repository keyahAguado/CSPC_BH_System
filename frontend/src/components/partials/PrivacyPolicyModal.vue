<script setup>
import { defineProps, defineEmits } from 'vue';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close']);

const closeModal = () => {
  emit('close');
};
</script>

<template>
  <div 
    v-if="isOpen" 
    class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4 sm:p-6 animate-fade-in"
    @click.self="closeModal"
  >
    <div class="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden text-left">
      <!-- Modal Header -->
      <div class="bg-[#2a528a] text-white p-6 sm:p-8 flex justify-between items-center shrink-0">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <i class="fa-solid fa-shield-halved text-amber-400 text-sm"></i>
            <span class="text-[10px] font-black uppercase tracking-[0.2em] text-blue-200">Republic Act No. 10173 Compliant</span>
          </div>
          <h2 class="text-xl sm:text-2xl font-black uppercase tracking-tight">Data Privacy Policy</h2>
        </div>
        <button 
          @click="closeModal" 
          class="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-lg transition-colors focus:outline-none"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <!-- Modal Body (Scrollable) -->
      <div class="p-6 sm:p-8 overflow-y-auto space-y-6 text-slate-600 text-sm font-medium leading-relaxed">
        
        <!-- Notice Box -->
        <div class="bg-blue-50 border-l-4 border-[#2a528a] p-4 rounded-r-2xl">
          <p class="text-xs text-blue-900 font-bold">
            The CSPC Boarding House Selection & Transaction Management System is committed to protecting your personal data in accordance with the <strong>Data Privacy Act of 2012 (Republic Act No. 10173)</strong> of the Philippines.
          </p>
        </div>

        <!-- Section 1 -->
        <div>
          <h3 class="text-xs font-black text-slate-900 uppercase tracking-widest mb-2 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-[#2a528a]"></span> 1. Personal Information Collected
          </h3>
          <p class="mb-2">We collect only necessary personal data required to process boarding house selection, accreditation, room reservations, and student safety monitoring:</p>
          <ul class="list-disc pl-5 space-y-1 text-xs text-slate-500">
            <li><strong>Students:</strong> Full Name, Institutional Email (<code class="bg-slate-100 px-1 py-0.5 rounded text-blue-600">@cspc.edu.ph</code>), Contact Number, Address, Course/Year, Emergency Contact Person, and Guardian details.</li>
            <li><strong>Boarding House Owners:</strong> Full Name, Contact Number, Property Address, Legal Documents such as Permits, and Property Photos.</li>
          </ul>
        </div>

        <!-- Section 2 -->
        <div>
          <h3 class="text-xs font-black text-slate-900 uppercase tracking-widest mb-2 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-[#2a528a]"></span> 2. Purpose of Data Collection
          </h3>
          <p class="text-xs">Your data is collected strictly for official university services, including:</p>
          <ul class="list-disc pl-5 space-y-1 text-xs text-slate-500 mt-1">
            <li>Verifying student eligibility via official CSPC email authentication.</li>
            <li>Processing boarding house accreditation and compliance verification by SASO Administrators.</li>
            <li>Facilitating secure room bookings and upfront payment record verification.</li>
            <li>Assisting emergency monitoring and safety compliance under CSPC SASO supervision.</li>
          </ul>
        </div>

        <!-- Section 3  -->
        <div>
          <h3 class="text-xs font-black text-slate-900 uppercase tracking-widest mb-2 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-[#2a528a]"></span> 3. Data Protection & Security Controls
          </h3>
          <p class="text-xs">
            All user credentials, payment details, and uploaded files are secured using industry-standard physical and technical safeguards. This includes one-way cryptographic hashing for passwords, stateless secure session tokens for user authentication, encrypted cloud-hosted storage for media assets, and secure cryptographic signature verification for payment notifications. We strictly do <strong>NOT</strong> sell, lease, or share your personal data with unauthorized third parties.
          </p>
        </div>
        <!-- Section 4 -->
        <div>
          <h3 class="text-xs font-black text-slate-900 uppercase tracking-widest mb-2 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-[#2a528a]"></span> 4. User Rights under RA 10173
          </h3>
          <p class="text-xs mb-2">As a data subject, you have the right to:</p>
          <ul class="list-disc pl-5 space-y-1 text-xs text-slate-500">
            <li>Be informed of how your personal data is processed.</li>
            <li>Access, update, or rectify your profile information.</li>
            <li>Request the deletion or removal of your account data upon official coordination with SASO.</li>
          </ul>
        </div>

        <!-- Section 5 -->
        <div>
          <h3 class="text-xs font-black text-slate-900 uppercase tracking-widest mb-2 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-[#2a528a]"></span> 5. Contact & Inquiries
          </h3>
          <p class="text-xs">
            For questions regarding this Data Privacy Policy or to exercise your rights under RA 10173, please contact the <strong>Student Affairs and Services Office (SASO)</strong> at Camarines Sur Polytechnic Colleges (CSPC), Nabua, Camarines Sur.
          </p>
        </div>

      </div>

      <!-- Modal Footer -->
      <div class="p-6 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
        <button 
          @click="closeModal" 
          class="bg-[#2a528a] hover:bg-slate-900 text-white font-black text-xs py-3 px-8 rounded-xl uppercase tracking-widest shadow-md transition-all active:scale-95"
        >
          I Understand & Agree
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}
.animate-fade-in {
  animation: fadeIn 0.2s ease-out forwards;
}
</style>
