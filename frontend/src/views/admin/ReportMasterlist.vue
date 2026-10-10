<script setup>
import LoadError from '../../components/management/LoadError.vue';

import PageHeader from '../../components/management/PageHeader.vue';
import '../../styles/management.css';
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import AdminNav from '../../components/partials/AdminNav.vue';

const houses = ref([]);
const reportDate = ref('');
const searchQuery = ref('');
const isLoading = ref(true);

const filteredHouses = computed(() => {
  if (!searchQuery.value) return houses.value;
  const q = searchQuery.value.toLowerCase().trim();
  return houses.value.filter(h =>
    (h.name || '').toLowerCase().includes(q) ||
    (h.owner_name || '').toLowerCase().includes(q) ||
    (h.address || '').toLowerCase().includes(q) ||
    (h.compliance_status || '').toLowerCase().includes(q)
  );
});

const token = sessionStorage.getItem('cspc_token');

const fetchReport = async () => {
  loadError.value = '';
  try {
    const res = await axios.get('/api/admin/reports/masterlist', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.data.success) {
      houses.value = res.data.houses || [];
      reportDate.value = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
  } catch (err) {
    loadError.value = 'The server did not return these records. Refresh the page to try again.';
    console.error(err);
  } finally {
    isLoading.value = false;
    reportDate.value = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
};

const handlePrint = () => {
  window.print();
};

onMounted(() => {
  fetchReport();
});

const loadError = ref('');
</script>

<template>
  <div class="management-page min-h-screen bg-slate-100 flex flex-col font-sans">
    
    <!-- Admin Navigation / Menu Bar (Mawawala kapag nag-print dahil sa no-print class) -->
    <div class="no-print">
      <AdminNav />
    </div>

    <!-- Main Content / Report Container -->
    <div id="management-content" tabindex="-1" class="management-content">
<LoadError :message="loadError" />
<PageHeader title="Accredited masterlist" description="Review and print institutional records." />
      <div class="max-w-[1000px] mx-auto bg-white p-4 sm:p-12 shadow-xl rounded-2xl border-t-8 border-[#2a528a] text-left relative">
        
        <!-- Header -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b-2 border-slate-100 pb-6 sm:pb-8 mb-6 sm:mb-8 gap-4">
          <div class="flex items-center gap-4 sm:gap-6">
            <img src="/img/CSPC_logo.png" class="w-16 h-16 sm:w-20 sm:h-20 object-contain" />
            <div>
              <h1 class="text-base sm:text-2xl font-semibold text-slate-800 uppercase tracking-tight">Camarines Sur Polytechnic Colleges</h1>
              <p class="text-[12px] sm:text-xs font-bold text-slate-500 uppercase tracking-wide">Office of Student Affairs and Services (SASO)</p>
            </div>
          </div>
          <div class="text-left sm:text-right w-full sm:w-auto flex justify-between sm:block border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
            <p class="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">Report Date</p>
            <p class="font-bold text-slate-800 text-sm sm:text-base">{{ reportDate }}</p>
          </div>
        </div>

        <!-- Title & Control Section -->
        <div class="flex flex-col sm:flex-row justify-between items-center mb-6 sm:mb-8 gap-4 no-print">
          <h2 class="text-sm sm:text-xl font-semibold text-[#2a528a] uppercase tracking-normal sm:tracking-normal">Accredited Boarding Houses Masterlist</h2>
          
          <!-- Single Search Input -->
          <div class="relative w-full sm:w-64">
            <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
              <i class="fa-solid fa-magnifying-glass text-xs"></i>
            </span>
            <input aria-label="SEARCH MASTERLIST..." type="text" v-model="searchQuery" placeholder="SEARCH MASTERLIST..."
                class="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[12px] font-bold tracking-wide focus:border-[#2a528a] outline-none transition-all placeholder:text-slate-400" />
          </div>
        </div>

        <!-- ================= DESKTOP TABLE VIEW ================= -->
        <div class="hidden md:block print:block overflow-hidden rounded-xl border border-slate-200 table-container mb-12">
          <table class="w-full text-left" id="masterlistTable">
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr class="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">
                <th class="px-4 py-4">#</th>
                <th class="px-4 py-4">Boarding House</th>
                <th class="px-4 py-4">Owner / Contact</th>
                <th class="px-4 py-4">Rooms (M/F)</th>
                <th class="px-4 py-4">Capacity</th>
                <th class="px-4 py-4 text-center">Occupants</th>
                <th class="px-4 py-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody class="text-[12px] text-slate-600">
              <tr v-if="filteredHouses.length === 0">
                <td colspan="7" class="px-4 py-12 text-center text-slate-400 font-bold uppercase tracking-wide">No accredited boarding houses found</td>
              </tr>
              <tr v-else v-for="(h, i) in filteredHouses" :key="h.id" class="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
                <td class="px-4 py-4 font-bold text-slate-400">{{ i + 1 }}</td>
                <td class="px-4 py-4">
                  <p class="font-semibold text-slate-900 uppercase leading-none">{{ h.name }}</p>
                  <p class="text-[12px] text-slate-400 italic font-medium mt-1">{{ h.address }}</p>
                </td>
                <td class="px-4 py-4 font-bold">
                  <span class="text-slate-700">{{ h.owner_name }}</span><br />
                  <span class="text-[12px] text-slate-400">{{ h.owner_phone }}</span>
                </td>
                <td class="px-4 py-4">
                  <div class="flex gap-2">
                    <span class="text-blue-500 font-semibold">{{ h.male_rooms }}M</span>
                    <span class="text-pink-500 font-semibold">{{ h.female_rooms }}F</span>
                  </div>
                  <p class="text-[12px] text-slate-400 uppercase font-semibold tracking-tighter">{{ h.total_rooms }} Total Rooms</p>
                </td>
                <td class="px-4 py-4 font-semibold text-slate-800">{{ h.total_capacity || 0 }} Pax</td>
                <td class="px-4 py-4 text-center">
                  <p class="font-semibold text-[#2a528a]">{{ h.current_occupants || 0 }}</p>
                  <p class="text-[12px] text-slate-400 font-semibold uppercase tracking-tighter">Students</p>
                  <div class="flex gap-1.5 justify-center mt-1">
                    <span class="text-blue-500 font-semibold text-[12px]">{{ h.male_count || 0 }}B</span>
                    <span class="text-pink-500 font-semibold text-[12px]">{{ h.female_count || 0 }}G</span>
                  </div>
                </td>
                <td class="px-4 py-4 text-center">
                  <span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[12px] font-semibold uppercase tracking-wide border border-emerald-100">
                    {{ h.house_status }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ================= MOBILE PORTRAIT CARD VIEW (STRICTLY HIDDEN IN PRINT) ================= -->
        <div class="block md:hidden print:hidden space-y-4 mb-8">
          <div v-if="filteredHouses.length === 0" class="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-400 font-bold uppercase text-xs">
            No accredited boarding houses found
          </div>
          <div v-else v-for="(h, i) in filteredHouses" :key="h.id" class="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div class="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
              <span class="text-xs font-semibold text-slate-400">#{{ i + 1 }}</span>
              <span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[12px] font-semibold uppercase tracking-wide border border-emerald-100">
                {{ h.house_status }}
              </span>
            </div>
            
            <div class="divide-y divide-slate-100 text-xs">
              <div class="px-4 py-2.5 flex justify-between items-center">
                <span class="font-bold text-slate-400 text-[12px] uppercase tracking-wider">Boarding House</span>
                <div class="text-right">
                  <p class="font-semibold text-slate-900 uppercase">{{ h.name }}</p>
                  <p class="text-[12px] text-slate-500 italic">{{ h.address }}</p>
                </div>
              </div>

              <div class="px-4 py-2.5 flex justify-between items-center">
                <span class="font-bold text-slate-400 text-[12px] uppercase tracking-wider">Owner / Contact</span>
                <div class="text-right font-bold">
                  <p class="text-slate-700">{{ h.owner_name }}</p>
                  <p class="text-[12px] text-slate-400">{{ h.owner_phone }}</p>
                </div>
              </div>

              <div class="px-4 py-2.5 flex justify-between items-center">
                <span class="font-bold text-slate-400 text-[12px] uppercase tracking-wider">Rooms (M/F)</span>
                <div class="text-right">
                  <div class="flex gap-2 justify-end">
                    <span class="text-blue-500 font-semibold">{{ h.male_rooms }}M</span>
                    <span class="text-pink-500 font-semibold">{{ h.female_rooms }}F</span>
                  </div>
                  <p class="text-[12px] text-slate-400 uppercase font-bold">{{ h.total_rooms }} Total Rooms</p>
                </div>
              </div>

              <div class="px-4 py-2.5 flex justify-between items-center">
                <span class="font-bold text-slate-400 text-[12px] uppercase tracking-wider">Capacity</span>
                <span class="font-semibold text-slate-800">{{ h.total_capacity || 0 }} Pax</span>
              </div>

              <div class="px-4 py-2.5 flex justify-between items-center">
                <span class="font-bold text-slate-400 text-[12px] uppercase tracking-wider">Occupants</span>
                <div class="text-right">
                  <span class="font-semibold text-[#2a528a]">{{ h.current_occupants || 0 }} Students</span>
                  <div class="flex gap-2 justify-end mt-0.5">
                    <span class="text-blue-500 font-semibold text-[12px]">{{ h.male_count || 0 }} Boys</span>
                    <span class="text-pink-500 font-semibold text-[12px]">{{ h.female_count || 0 }} Girls</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer / Signatories (Single Line Row Layout with Generous Spacing) -->
        <div class="grid grid-cols-2 gap-8 mt-16 sm:mt-24 pt-10 sm:pt-12 mt-auto text-center signatories-block">
          <div>
            <div class="border-b border-slate-900 mx-auto w-3/4 mb-2"></div>
            <p class="text-[12px] font-semibold uppercase tracking-wide text-slate-600">PREPARED BY: SASO COORDINATOR</p>
          </div>
          <div>
            <div class="border-b border-slate-900 mx-auto w-3/4 mb-2"></div>
            <p class="text-[12px] font-semibold uppercase tracking-wide text-slate-600">APPROVED BY: SASO DIRECTOR</p>
          </div>
        </div>

        <!-- Print Action -->
        <div class="mt-12 sm:mt-16 flex justify-center no-print">
          <button @click="handlePrint" class="w-full sm:w-auto bg-[#2a528a] hover:bg-slate-800 text-white font-semibold px-8 sm:px-12 py-4 rounded-xl transition uppercase text-[12px] tracking-wide flex items-center justify-center gap-3 shadow-lg management-button management-button-primary">
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
    size: landscape !important;
    margin: 0.8cm !important;
  }
  html, body, #app, main, div, section, article {
    background: #ffffff !important;
    background-color: #ffffff !important;
    color: #0f172a !important;
    width: 100% !important;
    height: auto !important;
    padding: 0 !important;
    margin: 0 !important;
    box-shadow: none !important;
  }
  .no-print, .block.md\:hidden, .md\:hidden {
    display: none !important;
  }
  .hidden.md\:block, .md\:block, .print\:block {
    display: block !important;
  }
  .shadow-xl, .shadow-sm, .shadow-lg {
    box-shadow: none !important;
  }
  .rounded-2xl, .rounded-xl {
    border-radius: 0 !important;
  }
  .border-t-8 {
    border-top: none !important;
  }
  table, .datatable-table {
    display: table !important;
    width: 100% !important;
    border-collapse: collapse !important;
    background: #ffffff !important;
  }
  thead, .datatable-table thead {
    display: table-header-group !important;
    visibility: visible !important;
  }
  tr, .datatable-table tr {
    display: table-row !important;
    page-break-inside: avoid !important;
  }
  th, td, .datatable-table th, .datatable-table td {
    border: 1px solid #94a3b8 !important;
    padding: 6px 8px !important;
    background: #ffffff !important;
    color: #0f172a !important;
    display: table-cell !important;
    visibility: visible !important;
  }
  th, .datatable-table th, a.datatable-sorter, .datatable-sorter {
    background-color: #ffffff !important;
    font-weight: 900 !important;
    text-transform: uppercase !important;
    color: #0f172a !important;
    text-decoration: none !important;
    pointer-events: none !important;
  }
  .signatories-block {
    margin-top: 4rem !important;
    padding-top: 2rem !important;
    page-break-inside: avoid !important;
  }
}
</style>