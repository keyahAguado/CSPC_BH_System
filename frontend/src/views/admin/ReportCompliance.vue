<script setup>
import { ref, onMounted, nextTick, watch } from 'vue';
import axios from 'axios';
import AdminNav from '../../components/partials/AdminNav.vue';
import { printCompliance } from '../../utils/printHelper.js';
import { DataTable } from 'simple-datatables';
import 'simple-datatables/dist/style.css';

const houses = ref([]);
const reportDate = ref('');
const searchQuery = ref('');
const isLoading = ref(true);

let dtInstance = null;

const initDataTable = () => {
  nextTick(() => {
    const tableEl = document.getElementById('complianceTable');
    if (tableEl && !dtInstance) {
      try {
        dtInstance = new DataTable(tableEl, {
          perPage: 10,
          perPageSelect: [10, 25, 50, 100],
          searchable: false,
          labels: {
            perPage: "entries per page",
            noRows: "No compliance audit records found",
            info: "Showing {start} to {end} of {rows} entries",
          }
        });
      } catch (err) {
        console.warn('DataTable init error:', err);
      }
    }
  });
};

watch(searchQuery, (val) => {
  if (dtInstance) {
    dtInstance.search(val);
  }
});

const token = sessionStorage.getItem('cspc_token');

const fetchReport = async () => {
  try {
    const res = await axios.get('/api/admin/reports/compliance', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.data.success) {
      houses.value = res.data.houses || [];
      const rawDate = res.data.reportDate ? new Date(res.data.reportDate) : new Date();
      reportDate.value = isNaN(rawDate) ? new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : rawDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      initDataTable();
    }
  } catch (err) {
    console.error(err);
  } finally {
    isLoading.value = false;
    if (!reportDate.value) {
      reportDate.value = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
    initDataTable();
  }
};

const handlePrint = () => {
  window.print();
};

onMounted(() => {
  fetchReport();
});
</script>

<template>
  <div class="min-h-screen bg-slate-100 pb-12 font-sans text-left">
    <AdminNav />

    <main class="max-w-[1400px] mx-auto pt-4 md:pt-10 px-4 md:px-6">
      
      <!-- Loading State Indicator -->
      <div v-if="isLoading" class="py-20 flex flex-col items-center justify-center gap-3 bg-white rounded-2xl shadow-sm border border-slate-200 p-10 max-w-xl mx-auto text-center">
        <svg class="animate-spin h-10 w-10 text-[#2a528a] mb-4 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Loading compliance audit records...</p>
      </div>

      <!-- Main Content Container -->
      <div v-else class="bg-white p-6 md:p-12 shadow-xl rounded-2xl border-t-8 border-[#2a528a] text-left">
        
        <!-- Header -->
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center border-b-2 border-slate-100 pb-6 md:pb-8 mb-8 gap-4">
          <div class="flex items-center gap-4 md:gap-6">
            <img src="/img/CSPC_logo.png" class="w-14 h-14 md:w-20 md:h-20 object-contain" />
            <div>
              <h1 class="text-lg md:text-2xl font-black text-slate-800 uppercase tracking-tight">Camarines Sur Polytechnic Colleges</h1>
              <p class="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest">Office of Student Affairs and Services (SASO)</p>
            </div>
          </div>
          <div class="text-left md:text-right w-full md:w-auto flex md:block justify-between border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Generated On</p>
            <p class="font-bold text-slate-800 text-sm md:text-base">{{ reportDate }}</p>
          </div>
        </div>

        <!-- Title & Control Section -->
        <div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 no-print">
          <h2 class="text-base md:text-xl font-black text-[#2a528a] uppercase tracking-[0.1em] md:tracking-[0.2em]">Accreditation Compliance Audit Report</h2>
          
          <!-- Single Search Input -->
          <div class="relative w-full md:w-64">
            <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
              <i class="fa-solid fa-magnifying-glass text-xs"></i>
            </span>
            <input type="text" v-model="searchQuery" placeholder="SEARCH COMPLIANCE..."
                class="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold tracking-widest focus:border-[#2a528a] outline-none transition-all placeholder:text-slate-400" />
          </div>
        </div>

        <!-- Legend (Hidden in print) -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-10 bg-slate-50 p-5 md:p-6 rounded-xl border border-slate-200 no-print-legend no-print">
          <div>
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Audit Legend</h3>
            <div class="flex flex-wrap gap-4">
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span class="text-[10px] font-bold text-slate-600 uppercase">Valid / Active</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full bg-red-500"></div>
                <span class="text-[10px] font-bold text-slate-600 uppercase">Expired / Action Required</span>
              </div>
            </div>
          </div>
          <div class="border-t md:border-t-0 md:border-l border-slate-200 pt-4 md:pt-0 md:pl-8">
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Policy Summary</h3>
            <p class="text-[11px] font-bold text-slate-500 leading-snug">All legal permits must be updated annually. Properties with expired documents are flagged for automatic archiving.</p>
          </div>
        </div>

        <!-- ================= DESKTOP TABLE VIEW ================= -->
        <div class="hidden md:block print:block overflow-x-auto rounded-xl border border-slate-200 mb-12">
          <table class="w-full text-left whitespace-nowrap" id="complianceTable">
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr class="text-[9px] font-black text-slate-600 uppercase tracking-widest border-b border-slate-200">
                <th rowspan="2" class="px-4 py-4 min-w-[170px] align-middle border-r border-slate-200 bg-slate-100/70">Boarding House & Owner</th>
                <th rowspan="2" class="px-4 py-4 text-center align-middle border-r border-slate-200 bg-slate-100/70">Status</th>
                <th colspan="8" class="px-3 py-2 text-center bg-slate-100/90 font-black tracking-widest text-[#2a528a]">Legal Permit Expiration Dates</th>
              </tr>
              <tr class="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                <th class="px-3 py-2 text-center border-r border-slate-200">Business</th>
                <th class="px-3 py-2 text-center border-r border-slate-200">Cedula (CTC)</th>
                <th class="px-3 py-2 text-center border-r border-slate-200">DTI</th>
                <th class="px-3 py-2 text-center border-r border-slate-200">Barangay</th>
                <th class="px-3 py-2 text-center border-r border-slate-200">Building</th>
                <th class="px-3 py-2 text-center border-r border-slate-200">Zoning</th>
                <th class="px-3 py-2 text-center border-r border-slate-200">Sanitary</th>
                <th class="px-3 py-2 text-center">Fire Safety</th>
              </tr>
            </thead>
            <tbody class="text-[10px] text-slate-600">
              <tr v-if="houses.length === 0">
                <td colspan="10" class="px-4 py-12 text-center text-slate-400 font-bold uppercase tracking-widest">No compliance records found</td>
              </tr>
              <tr v-else v-for="h in houses" :key="h.name" class="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
                <td class="px-4 py-3 font-bold">
                  <p class="font-black text-slate-900 uppercase leading-none">{{ h.name }}</p>
                  <p class="text-[8px] text-slate-400 font-bold uppercase mt-1">{{ h.owner_name }}</p>
                </td>
                <td class="px-4 py-3 text-center">
                  <span class="whitespace-nowrap inline-block text-center min-w-[70px] px-2.5 py-1 rounded-full border text-[8.5px] font-black uppercase tracking-wider"
                    :class="{
                      'bg-emerald-50 text-emerald-700 border-emerald-200': (h.compliance_status || '').toLowerCase() === 'active',
                      'bg-amber-50 text-amber-700 border-amber-200': (h.compliance_status || '').toLowerCase() === 'warning',
                      'bg-red-50 text-red-700 border-red-200': (h.compliance_status || '').toLowerCase() === 'expired' || (h.compliance_status || '').toLowerCase() === 'inactive'
                    }">
                    {{ h.compliance_status }}
                  </span>
                </td>
                <td v-for="p in ['business_form', 'cedula', 'dti', 'barangay', 'building', 'zoning', 'sanitary', 'fire']" :key="p" class="px-3 py-3 text-center">
                  <span v-if="h['expiry_permit_' + p]" :class="new Date(h['expiry_permit_' + p]) < new Date() ? 'text-red-600 font-black' : 'text-slate-700 font-bold'">
                    {{ new Date(h['expiry_permit_' + p]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
                    <span v-if="new Date(h['expiry_permit_' + p]) < new Date()" class="hidden print:inline text-[7pt] text-red-600 font-black uppercase ml-0.5">(EXPIRED)</span>
                  </span>
                  <span v-else class="text-slate-300">N/A</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ================= MOBILE PORTRAIT CARD VIEW (STRICTLY HIDDEN IN PRINT) ================= -->
        <div class="block md:hidden print:hidden space-y-4 mb-12">
          <div v-if="houses.length === 0" class="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">
            No compliance records found
          </div>
          <div v-else v-for="h in houses" :key="h.name" class="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            
            <div class="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
              <div>
                <p class="font-black text-slate-900 uppercase text-xs">{{ h.name }}</p>
                <p class="text-[9px] text-slate-400 font-bold uppercase">{{ h.owner_name }}</p>
              </div>
              <span class="px-2 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-tighter" :class="h.compliance_status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'">
                {{ h.compliance_status }}
              </span>
            </div>

            <div class="divide-y divide-slate-100 text-[11px]">
              <div v-for="p in [
                { key: 'business_form', label: 'Business Permit Expiry' },
                { key: 'cedula', label: 'Cedula (CTC) Expiry' },
                { key: 'dti', label: 'DTI Permit Expiry' },
                { key: 'barangay', label: 'Barangay Clearance Expiry' },
                { key: 'building', label: 'Building Permit Expiry' },
                { key: 'zoning', label: 'Zoning Clearance Expiry' },
                { key: 'sanitary', label: 'Sanitary Permit Expiry' },
                { key: 'fire', label: 'Fire Safety Expiry' }
              ]" :key="p.key" class="px-4 py-2.5 flex justify-between items-center">
                <span class="text-slate-400 font-bold uppercase text-[10px]">{{ p.label }}</span>
                <span v-if="h['expiry_permit_' + p.key]" :class="new Date(h['expiry_permit_' + p.key]) < new Date() ? 'text-red-500 font-black' : 'text-slate-700 font-semibold'">
                  {{ new Date(h['expiry_permit_' + p.key]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
                </span>
                <span v-else class="text-slate-300 text-xs">N/A</span>
              </div>
            </div>

          </div>
        </div>

        <!-- Signatories (Single Line Row Layout with Generous Spacing) -->
        <div class="grid grid-cols-2 gap-8 mt-16 md:mt-24 pt-10 md:pt-12 text-center signatories-block">
          <div>
            <div class="border-b border-slate-900 mx-auto w-3/4 mb-2"></div>
            <p class="text-[10px] font-black uppercase tracking-widest text-slate-600">PREPARED BY: SASO COORDINATOR</p>
          </div>
          <div>
            <div class="border-b border-slate-900 mx-auto w-3/4 mb-2"></div>
            <p class="text-[10px] font-black uppercase tracking-widest text-slate-600">APPROVED BY: SASO DIRECTOR</p>
          </div>
        </div>

        <div class="mt-12 md:mt-16 flex justify-center no-print">
          <button @click="handlePrint" class="w-full md:w-auto bg-[#2a528a] hover:bg-slate-800 text-white font-black px-12 py-4 rounded-xl transition uppercase text-[11px] tracking-widest flex items-center justify-center gap-3 shadow-lg">
            <i class="fa-solid fa-print"></i> Print Compliance Report
          </button>
        </div>

      </div>
    </main>
  </div>
</template>

<style>
@media print {
  @page {
    size: A4 landscape;
    margin: 0.8cm;
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
  .no-print, .no-print-legend, .block.md\:hidden, .md\:hidden {
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
  .overflow-x-auto {
    overflow: visible !important;
  }
  table {
    display: table !important;
    width: 100% !important;
    table-layout: auto !important;
    border-collapse: collapse !important;
    background: #ffffff !important;
  }
  th, td {
    border: 1px solid #94a3b8 !important;
    padding: 4px 5px !important;
    font-size: 7.5pt !important;
    line-height: 1.2 !important;
    white-space: normal !important;
    word-break: break-word !important;
    background: #ffffff !important;
    color: #0f172a !important;
  }
  th {
    font-size: 7pt !important;
    font-weight: 800 !important;
    text-transform: uppercase !important;
    background-color: #ffffff !important;
  }
  .whitespace-nowrap {
    white-space: normal !important;
  }
  .signatories-block {
    margin-top: 4rem !important;
    padding-top: 2rem !important;
    page-break-inside: avoid !important;
  }
}
</style>