<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';
import { printMasterlist } from '../../utils/printHelper.js';
import AdminNav from '../../components/partials/AdminNav.vue'; // IMPORT ADMIN NAV FOR MENU BAR

const houses = ref([]);
const reportDate = ref('');
const isLoading = ref(true);

const token = localStorage.getItem('cspc_token');

const fetchReport = async () => {
  try {
    const res = await axios.get('/api/admin/reports/masterlist', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.data.success) {
      houses.value = res.data.houses || [];
      reportDate.value = res.data.reportDate || new Date().toLocaleDateString();
    }
  } catch (err) {
    console.error(err);
  } finally {
    isLoading.value = false;
  }
};

const handlePrint = () => {
  printMasterlist(houses.value, reportDate.value);
};

onMounted(() => {
  fetchReport();
});
</script>

<template>
  <div class="min-h-screen bg-slate-100 flex flex-col font-sans">
    
    <!-- Admin Navigation / Menu Bar (Mawawala kapag nag-print dahil sa no-print class) -->
    <div class="no-print">
      <AdminNav />
    </div>

    <!-- Main Content / Report Container -->
    <div class="py-6 sm:py-12 px-2 sm:px-6 flex-grow">
      <div class="max-w-[1000px] mx-auto bg-white p-4 sm:p-12 shadow-xl rounded-2xl border-t-8 border-[#2a528a] text-left relative">
        
        <!-- Header -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b-2 border-slate-100 pb-6 sm:pb-8 mb-6 sm:mb-8 gap-4">
          <div class="flex items-center gap-4 sm:gap-6">
            <img src="/img/CSPC_logo.png" class="w-16 h-16 sm:w-20 sm:h-20 object-contain" />
            <div>
              <h1 class="text-base sm:text-2xl font-black text-slate-800 uppercase tracking-tight">Camarines Sur Polytechnic Colleges</h1>
              <p class="text-[9px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest">Office of Student Affairs and Services (SASO)</p>
            </div>
          </div>
          <div class="text-left sm:text-right w-full sm:w-auto flex justify-between sm:block border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Report Date</p>
            <p class="font-bold text-slate-800 text-sm sm:text-base">{{ reportDate }}</p>
          </div>
        </div>

        <!-- Title Section -->
        <div class="text-center mb-8 sm:mb-10">
          <h2 class="text-sm sm:text-xl font-black text-[#2a528a] uppercase tracking-[0.1em] sm:tracking-[0.2em] underline underline-offset-8">Accredited Boarding Houses Masterlist</h2>
        </div>

        <!-- ================= DESKTOP TABLE VIEW ================= -->
        <div class="hidden md:block overflow-hidden rounded-xl border border-slate-200 table-container mb-12">
          <table class="w-full text-left">
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr class="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                <th class="px-4 py-4">#</th>
                <th class="px-4 py-4">Boarding House</th>
                <th class="px-4 py-4">Owner / Contact</th>
                <th class="px-4 py-4">Rooms (M/F)</th>
                <th class="px-4 py-4">Capacity</th>
                <th class="px-4 py-4 text-center">Occupants</th>
                <th class="px-4 py-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody class="text-[11px] text-slate-600">
              <tr v-for="(h, i) in houses" :key="h.id" class="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
                <td class="px-4 py-4 font-bold text-slate-400">{{ i + 1 }}</td>
                <td class="px-4 py-4">
                  <p class="font-black text-slate-900 uppercase leading-none">{{ h.name }}</p>
                  <p class="text-[9px] text-slate-400 italic font-medium mt-1">{{ h.address }}</p>
                </td>
                <td class="px-4 py-4 font-bold">
                  <span class="text-slate-700">{{ h.owner_name }}</span><br />
                  <span class="text-[9px] text-slate-400">{{ h.owner_phone }}</span>
                </td>
                <td class="px-4 py-4">
                  <div class="flex gap-2">
                    <span class="text-blue-500 font-black">{{ h.male_rooms }}M</span>
                    <span class="text-pink-500 font-black">{{ h.female_rooms }}F</span>
                  </div>
                  <p class="text-[8px] text-slate-400 uppercase font-black tracking-tighter">{{ h.total_rooms }} Total Rooms</p>
                </td>
                <td class="px-4 py-4 font-black text-slate-800">{{ h.total_capacity || 0 }} Pax</td>
                <td class="px-4 py-4 text-center">
                  <p class="font-black text-[#2a528a]">{{ h.current_occupants || 0 }}</p>
                  <p class="text-[8px] text-slate-400 font-black uppercase tracking-tighter">Students</p>
                </td>
                <td class="px-4 py-4 text-center">
                  <span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase tracking-widest border border-emerald-100">
                    {{ h.house_status }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ================= MOBILE PORTRAIT CARD VIEW ================= -->
        <div class="block md:hidden space-y-4 mb-8">
          <div v-for="(h, i) in houses" :key="h.id" class="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div class="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
              <span class="text-xs font-black text-slate-400">#{{ i + 1 }}</span>
              <span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-widest border border-emerald-100">
                {{ h.house_status }}
              </span>
            </div>
            
            <div class="divide-y divide-slate-100 text-xs">
              <div class="px-4 py-2.5 flex justify-between items-center">
                <span class="font-bold text-slate-400 text-[10px] uppercase tracking-wider">Boarding House</span>
                <div class="text-right">
                  <p class="font-black text-slate-900 uppercase">{{ h.name }}</p>
                  <p class="text-[10px] text-slate-500 italic">{{ h.address }}</p>
                </div>
              </div>

              <div class="px-4 py-2.5 flex justify-between items-center">
                <span class="font-bold text-slate-400 text-[10px] uppercase tracking-wider">Owner / Contact</span>
                <div class="text-right font-bold">
                  <p class="text-slate-700">{{ h.owner_name }}</p>
                  <p class="text-[10px] text-slate-400">{{ h.owner_phone }}</p>
                </div>
              </div>

              <div class="px-4 py-2.5 flex justify-between items-center">
                <span class="font-bold text-slate-400 text-[10px] uppercase tracking-wider">Rooms (M/F)</span>
                <div class="text-right">
                  <div class="flex gap-2 justify-end">
                    <span class="text-blue-500 font-black">{{ h.male_rooms }}M</span>
                    <span class="text-pink-500 font-black">{{ h.female_rooms }}F</span>
                  </div>
                  <p class="text-[9px] text-slate-400 uppercase font-bold">{{ h.total_rooms }} Total Rooms</p>
                </div>
              </div>

              <div class="px-4 py-2.5 flex justify-between items-center">
                <span class="font-bold text-slate-400 text-[10px] uppercase tracking-wider">Capacity</span>
                <span class="font-black text-slate-800">{{ h.total_capacity || 0 }} Pax</span>
              </div>

              <div class="px-4 py-2.5 flex justify-between items-center">
                <span class="font-bold text-slate-400 text-[10px] uppercase tracking-wider">Occupants</span>
                <span class="font-black text-[#2a528a]">{{ h.current_occupants || 0 }} Students</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer / Signatories -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-10 sm:gap-20 pt-10 sm:pt-16 mt-auto">
          <div class="text-center">
            <div class="border-b border-slate-900 mx-auto w-4/5 mb-2"></div>
            <p class="text-[10px] font-black uppercase tracking-widest text-slate-500">Prepared By: SASO Staff</p>
          </div>
          <div class="text-center">
            <div class="border-b border-slate-900 mx-auto w-4/5 mb-2"></div>
            <p class="text-[10px] font-black uppercase tracking-widest text-slate-500">Noted By: SASO Director</p>
          </div>
        </div>

        <!-- Print Action -->
        <div class="mt-12 sm:mt-16 flex justify-center no-print">
          <button @click="handlePrint" class="w-full sm:w-auto bg-[#2a528a] hover:bg-slate-800 text-white font-black px-8 sm:px-12 py-4 rounded-xl transition uppercase text-[11px] tracking-widest flex items-center justify-center gap-3 shadow-lg">
            <i class="fa-solid fa-print"></i> Print / Download PDF
          </button>
        </div>

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
  .rounded-2xl {
    border-radius: 0 !important;
  }
  .table-container {
    overflow: visible !important;
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