<script setup>
import LoadError from '../../components/management/LoadError.vue';

import AdminNav from '../../components/partials/AdminNav.vue';
import PageHeader from '../../components/management/PageHeader.vue';
import '../../styles/management.css';
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';
import { printTransactions } from '../../utils/printHelper.js';

const transactions = ref([]);
const reportDate = ref('');
const isLoading = ref(true);

const token = sessionStorage.getItem('cspc_token');

const fetchReport = async () => {
  loadError.value = '';
  try {
    const res = await axios.get('/api/admin/reports/transactions', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.data.success) {
      transactions.value = res.data.transactions || [];
      reportDate.value = res.data.reportDate || new Date().toLocaleDateString();
    }
  } catch (err) {
    loadError.value = 'The server did not return these records. Refresh the page to try again.';
    console.error(err);
  } finally {
    isLoading.value = false;
  }
};

const totalValue = computed(() => {
  return transactions.value.reduce((sum, t) => sum + parseFloat(t.room_price || 0), 0);
});

const handlePrint = () => {
  printTransactions(transactions.value, reportDate.value);
};

onMounted(() => {
  fetchReport();
});

const loadError = ref('');
</script>

<template>
  <div class="management-page min-h-screen font-sans">
<AdminNav />
<main id="management-content" tabindex="-1" class="management-content report-wide">
      <LoadError :message="loadError" /><PageHeader title="Reservation history" description="Review the existing student reservation report." />
    <div class="w-full bg-white p-6 sm:p-12 shadow-xl rounded-2xl border-t-8 border-[#2a528a] text-left">
      
      <!-- Header -->
      <div class="flex flex-col sm:flex-row gap-5 justify-between items-start sm:items-center border-b-2 border-slate-100 pb-8 mb-8">
        <div class="flex items-center gap-6">
          <img src="/img/CSPC_logo.png" class="w-20 h-20 object-contain" />
          <div>
            <h1 class="text-2xl font-semibold text-slate-800 uppercase tracking-tight">Camarines Sur Polytechnic Colleges</h1>
            <p class="text-xs font-bold text-slate-500 uppercase tracking-wide">Office of Student Affairs and Services (SASO)</p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">Report Date</p>
          <p class="font-bold text-slate-800">{{ reportDate }}</p>
        </div>
      </div>

      <!-- Title Section -->
      <div class="text-center mb-10">
        <h2 class="text-xl font-semibold text-[#2a528a] uppercase tracking-normal underline underline-offset-8">Student Reservation History</h2>
      </div>

      <!-- Table -->
      <div class="management-table-scroll rounded-xl border border-slate-200 mb-12">
        <table class="w-full text-left min-w-[700px]">
          <thead class="bg-slate-50 border-b border-slate-200">
            <tr class="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">
              <th class="px-6 py-4">Res ID</th>
              <th class="px-6 py-4">Student Resident</th>
              <th class="px-6 py-4">Boarding House</th>
              <th class="px-6 py-4">Status</th>
              <th class="px-6 py-4">Paid Via</th>
              <th class="px-6 py-4 text-right">Rent/Mo</th>
            </tr>
          </thead>
          <tbody class="text-[12px] text-slate-600">
            <tr v-for="t in transactions" :key="t.id" class="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
              <td class="px-6 py-4 font-bold text-slate-400 uppercase tracking-tighter">#RES-{{ t.id }}</td>
              <td class="px-6 py-4 font-semibold text-slate-800 uppercase">{{ t.student_name }}</td>
              <td class="px-6 py-4 font-bold">{{ t.house_name }}</td>
              <td class="px-6 py-4">
                <span class="px-2 py-0.5 rounded-full border text-[12px] font-semibold uppercase tracking-wide" :class="t.status === 'confirmed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'">
                  {{ t.status }}
                </span>
              </td>
              <td class="px-6 py-4">
                <span class="px-2 py-0.5 rounded-full border text-[12px] font-semibold uppercase tracking-wide" :class="t.payment_method === 'paymongo' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-50 text-slate-500 border-slate-200'">
                  {{ t.payment_method === 'paymongo' ? 'Online (GCash/Card)' : 'Cash' }}
                </span>
              </td>
              <td class="px-6 py-4 text-right font-semibold text-slate-900 tracking-tight">₱{{ parseFloat(t.room_price || 0).toLocaleString() }}</td>
            </tr>
            <tr class="bg-slate-50/50 font-semibold text-slate-900 border-t-2 border-slate-200">
              <td colspan="5" class="px-6 py-6 text-right uppercase tracking-normal text-[12px] text-slate-400">Monthly Value Capacity</td>
              <td class="px-6 py-6 text-right text-lg tracking-tighter">₱{{ totalValue.toLocaleString() }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Signatories -->
      <div class="grid grid-cols-2 gap-20 pt-16 mt-auto">
        <div class="text-center">
          <div class="border-b border-slate-900 mx-auto w-4/5 mb-2"></div>
          <p class="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Prepared By: SASO Coordinator</p>
        </div>
        <div class="text-center">
          <div class="border-b border-slate-900 mx-auto w-4/5 mb-2"></div>
          <p class="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Approved By: SASO Director</p>
        </div>
      </div>

      <div class="mt-16 flex justify-center no-print">
        <button @click="handlePrint" class="bg-[#2a528a] hover:bg-slate-800 text-white font-semibold px-12 py-4 rounded-xl transition uppercase text-[12px] tracking-wide flex items-center gap-3 shadow-lg management-button management-button-primary">
          <i class="fa-solid fa-print"></i> Print Reservation Report
        </button>
      </div>

    </div>
  </main>
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
