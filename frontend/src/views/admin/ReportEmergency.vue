<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import { printEmergencyRegistry } from '../../utils/printHelper.js';

const route = useRoute();
const residents = ref([]);
const reportDate = ref('');
const targetArea = ref('Unified Registry');
const isLoading = ref(true);

const token = localStorage.getItem('cspc_token');

const fetchReport = async () => {
  try {
    const barangay = route.query.barangay || '';
    const barangayParam = barangay ? `&barangay=${encodeURIComponent(barangay)}` : '';
    const res = await axios.get(`/api/admin/reports/emergency-registry?${barangayParam}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.data.success) {
      residents.value = res.data.residents || [];
      // Use the barangay query param as the target area label, or fallback
      targetArea.value = barangay ? decodeURIComponent(barangay) : 'Unified Registry';
      reportDate.value = new Date().toLocaleDateString('en-PH', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
    }
  } catch (err) {
    console.error(err);
  } finally {
    isLoading.value = false;
  }
};

const handlePrint = () => {
  printEmergencyRegistry(residents.value, targetArea.value, reportDate.value);
};

onMounted(() => {
  fetchReport();
});
</script>

<template>
  <div class="min-h-screen bg-slate-100 py-12 px-6 font-sans">
    <div class="max-w-[1200px] mx-auto bg-white p-12 shadow-xl rounded-2xl border-t-8 border-red-600 text-left">
      
      <!-- Header -->
      <div class="flex justify-between items-center border-b-2 border-slate-100 pb-8 mb-8">
        <div class="flex items-center gap-6">
          <img src="/img/CSPC_logo.png" class="w-20 h-20 object-contain" />
          <div>
            <h1 class="text-2xl font-black text-slate-800 uppercase tracking-tight">Camarines Sur Polytechnic Colleges</h1>
            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest">Office of Student Affairs and Services (SASO)</p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Report Date</p>
          <p class="font-bold text-slate-800">{{ reportDate }}</p>
        </div>
      </div>

      <!-- Title Section -->
      <div class="text-center mb-10">
        <h2 class="text-xl font-black text-red-600 uppercase tracking-[0.2em] underline underline-offset-8">Emergency Student Residency Registry</h2>
        <p class="mt-4 text-[13px] font-black text-slate-600 uppercase tracking-widest bg-slate-100 inline-block px-6 py-2 rounded-full">
          Target Zone: {{ targetArea }}
        </p>
      </div>

      <!-- Table -->
      <div class="overflow-hidden rounded-xl border border-slate-200 mb-12">
        <table class="w-full text-left">
          <thead class="bg-slate-50 border-b border-slate-200">
            <tr class="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              <th class="px-4 py-4">Student Resident</th>
              <th class="px-4 py-4">Sex</th>
              <th class="px-4 py-4">Course / Year</th>
              <th class="px-4 py-4">House & Room</th>
              <th class="px-4 py-4">Guardian / Contact</th>
              <th class="px-4 py-4 text-right">Emergency Phone</th>
            </tr>
          </thead>
          <tbody class="text-[11px] text-slate-600">
            <tr v-for="r in residents" :key="r.id" class="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
              <td class="px-4 py-4">
                <p class="font-black text-slate-900 uppercase tracking-tight leading-none">{{ r.resident_name }}</p>
                <p class="text-[8px] text-slate-400 font-bold uppercase mt-1">{{ r.student_email }}</p>
              </td>
              <td class="px-4 py-4">
                <span class="px-2 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-widest" :class="r.sex === 'Male' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-pink-50 text-pink-600 border-pink-100'">
                  {{ r.sex || 'N/A' }}
                </span>
              </td>
              <td class="px-4 py-4">
                <p class="font-bold text-slate-700 uppercase tracking-tighter">{{ r.course || 'N/A' }}</p>
                <p class="text-[8px] text-slate-400 font-black uppercase">Year Level: {{ r.year_level || 'N/A' }}</p>
              </td>
              <td class="px-4 py-4">
                <p class="font-bold text-slate-900 uppercase">{{ r.house_name }}</p>
                <p class="text-[10px] font-black text-[#2a528a]">ROOM #{{ r.room_number || 'N/A' }}</p>
              </td>
              <td class="px-4 py-4">
                <p class="font-bold text-slate-700 uppercase">{{ r.guardian_name || 'N/A' }}</p>
                <p class="text-[8px] text-slate-400 font-black uppercase italic">Guardian</p>
              </td>
              <td class="px-4 py-4 text-right">
                <span class="bg-red-50 text-red-600 px-3 py-1 rounded-lg text-[12px] font-black tracking-widest border border-red-100 shadow-sm">
                  {{ r.emergency_contact }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Signatories -->
      <div class="grid grid-cols-2 gap-20 pt-16 mt-auto">
        <div class="text-center">
          <div class="border-b border-slate-900 mx-auto w-4/5 mb-2"></div>
          <p class="text-[10px] font-black uppercase tracking-widest text-slate-500">Prepared By: SASO Coordinator</p>
        </div>
        <div class="text-center">
          <div class="border-b border-slate-900 mx-auto w-4/5 mb-2"></div>
          <p class="text-[10px] font-black uppercase tracking-widest text-slate-500">Approved By: SASO Director</p>
        </div>
      </div>

      <div class="mt-16 flex justify-center no-print">
        <button @click="handlePrint" class="bg-red-600 hover:bg-black text-white font-black px-12 py-4 rounded-xl transition uppercase text-[11px] tracking-widest flex items-center gap-3 shadow-lg">
          <i class="fa-solid fa-print"></i> Print Emergency Registry
        </button>
      </div>

    </div>
  </div>
</template>

<style>
@media print {
  @page {
    size: A4;
    margin: 1.5cm;
  }
  html, body {
    width: 100% !important;
    height: auto !important;
    background: white !important;
    padding: 0 !important;
    margin: 0 !important;
    font-size: 10pt;
  }
  #app {
    background: white !important;
    padding: 0 !important;
    margin: 0 !important;
    min-height: unset !important;
  }
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  .no-print {
    display: none !important;
  }
  .min-h-screen {
    min-height: unset !important;
  }
  .shadow-xl, .shadow-sm {
    box-shadow: none !important;
  }
  table {
    page-break-inside: auto;
  }
  tr {
    page-break-inside: avoid;
    page-break-after: auto;
  }
}
</style>
