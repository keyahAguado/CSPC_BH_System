<script setup>
import TablePager from '../../components/management/TablePager.vue';
import LoadError from '../../components/management/LoadError.vue';

import PageHeader from '../../components/management/PageHeader.vue';
import '../../styles/management.css';
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';
import AdminNav from '../../components/partials/AdminNav.vue';
import { printCompliance } from '../../utils/printHelper.js';
import { matchesSearch } from '../../utils/search.js';

const houses = ref([]);
const reportDate = ref('');
const searchQuery = ref('');
const isLoading = ref(true);

const currentPage = ref(1);
const itemsPerPage = ref(10);

const token = sessionStorage.getItem('cspc_token');

const fetchReport = async () => {
  loadError.value = '';
  try {
    const res = await axios.get('/api/admin/reports/compliance', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.data.success) {
      houses.value = res.data.houses || [];
      const rawDate = res.data.reportDate ? new Date(res.data.reportDate) : new Date();
      reportDate.value = isNaN(rawDate) ? new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : rawDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
  } catch (err) {
    loadError.value = 'The server did not return these records. Refresh the page to try again.';
    console.error(err);
  } finally {
    isLoading.value = false;
    if (!reportDate.value) {
      reportDate.value = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
  }
};

const filteredHouses = computed(() => {
  if (!searchQuery.value || !searchQuery.value.trim()) return houses.value;
  return houses.value.filter(h =>
    matchesSearch(searchQuery.value, [
      h.name,
      h.owner_name,
      h.compliance_status
    ])
  );
});

const paginatedHouses = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  return filteredHouses.value.slice(start, start + itemsPerPage.value);
});

const totalPages = computed(() => {
  return Math.ceil(filteredHouses.value.length / itemsPerPage.value) || 1;
});

const startItemIndex = computed(() => {
  if (filteredHouses.value.length === 0) return 0;
  return (currentPage.value - 1) * itemsPerPage.value + 1;
});

const endItemIndex = computed(() => {
  return Math.min(currentPage.value * itemsPerPage.value, filteredHouses.value.length);
});

watch([searchQuery, itemsPerPage], () => {
  currentPage.value = 1;
});

const handlePrint = () => {
  window.print();
};

onMounted(() => {
  fetchReport();
});

const loadError = ref('');

const PERMITS = [
  { key: 'business_form', label: 'Business' },
  { key: 'cedula', label: 'Cedula (CTC)' },
  { key: 'dti', label: 'DTI' },
  { key: 'barangay', label: 'Barangay' },
  { key: 'building', label: 'Building' },
  { key: 'zoning', label: 'Zoning' },
  { key: 'sanitary', label: 'Sanitary' },
  { key: 'fire', label: 'Fire safety' }
];
const normalStatus = (v) => {
  const s = String(v || '').toLowerCase();
  return s === 'inactive' ? 'expired' : s;
};
const statusCount = (key) => houses.value.filter(h => normalStatus(h.compliance_status) === key).length;
const statusTone = (v) => ({ active: 'success', warning: 'warning', expired: 'danger' }[normalStatus(v)] || 'neutral');
const statusLabel = (v) => ({ active: 'Compliant', warning: 'Expiring soon', expired: 'Expired' }[normalStatus(v)] || (v || '—'));
const isExpired = (v) => { const d = new Date(v); return !Number.isNaN(d.getTime()) && d < new Date(); };
const formatDay = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
</script>

<template>
  <div class="management-page bg-[#f8fafc] min-h-screen flex flex-col font-sans text-slate-800 text-left">
    <div class="no-print"><AdminNav /></div>

    <main id="management-content" tabindex="-1" class="management-content report-wide">
      <LoadError :message="loadError" />

      <!-- Printed letterhead (paper copy only) -->
      <div class="print-letterhead hidden print:flex">
        <div class="flex items-center gap-4">
          <img src="/img/CSPC_logo.png" class="w-16 h-16 object-contain" alt="CSPC logo" />
          <div>
            <p class="text-lg font-bold uppercase">Camarines Sur Polytechnic Colleges</p>
            <p class="text-xs font-semibold uppercase">Office of Student Affairs and Services (SASO)</p>
            <p class="text-sm font-bold uppercase mt-1">Accreditation Compliance Audit Report</p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-[11px] font-semibold uppercase">Generated on</p>
          <p class="text-sm font-bold">{{ reportDate }}</p>
        </div>
      </div>

      <div class="no-print">
        <PageHeader title="Compliance & expiry" />

        <!-- Summary tiles -->
        <dl class="cp-tiles">
          <div><dt><i class="fa-solid fa-house-circle-check" aria-hidden="true"></i> Boarding houses</dt><dd>{{ isLoading ? '…' : houses.length }}</dd></div>
          <div class="is-success"><dt><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Compliant</dt><dd>{{ isLoading ? '…' : statusCount('active') }}</dd></div>
          <div class="is-warning"><dt><i class="fa-solid fa-clock" aria-hidden="true"></i> Expiring soon</dt><dd>{{ isLoading ? '…' : statusCount('warning') }}</dd></div>
          <div class="is-danger"><dt><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> Expired</dt><dd>{{ isLoading ? '…' : statusCount('expired') }}</dd></div>
        </dl>

        <!-- Toolbar -->
        <div class="cp-toolbar">
          <div class="cp-search">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <input v-model="searchQuery" type="text" aria-label="Search compliance records" placeholder="Search by boarding house, owner, or status..." />
          </div>
          <span class="cp-count">{{ filteredHouses.length }} result{{ filteredHouses.length !== 1 ? 's' : '' }}</span>
          <button type="button" class="cp-print app-print-button" @click="handlePrint"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> Print / Save as PDF</button>
        </div>
      </div>

      <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 gap-6 no-print">
        <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>

      <div v-else class="cp-body">
        <!-- LAPTOP / DESKTOP + PRINT: table -->
        <div class="cp-card admin-table-card hidden md:flex md:flex-col print:block">
          <TablePager position="top" noun="entries" :page="currentPage" @update:page="currentPage = $event" :total-pages="totalPages" :start="startItemIndex" :end="endItemIndex" :total="filteredHouses.length" :per-page="itemsPerPage" @update:per-page="itemsPerPage = $event; currentPage = 1" />

          <div class="cp-scroll overflow-x-auto">
            <table class="cp-table admin-table w-full" id="complianceTable">
              <thead>
                <tr>
                  <th rowspan="2">Boarding house<small>Owner</small></th>
                  <th rowspan="2" class="cp-center">Status</th>
                  <th colspan="8" class="cp-group-head">Legal permit expiration dates</th>
                </tr>
                <tr>
                  <th v-for="p in PERMITS" :key="p.key" class="cp-sub">{{ p.label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="filteredHouses.length === 0">
                  <td colspan="10" class="admin-table-empty">No compliance records found.</td>
                </tr>
                <!-- Screen: current page only. Print: every filtered row. -->
                <tr v-for="h in filteredHouses" :key="h.name" :class="{ 'cp-off-page': !paginatedHouses.includes(h) }">
                  <td class="cp-name-cell">
                    <strong class="admin-table-name">{{ h.name }}</strong>
                    <span class="admin-table-sub">{{ h.owner_name }}</span>
                  </td>
                  <td><span :class="['cp-status', 'is-' + statusTone(h.compliance_status)]">{{ statusLabel(h.compliance_status) }}</span></td>
                  <td v-for="p in PERMITS" :key="p.key">
                    <template v-if="h['expiry_permit_' + p.key]">
                      <span :class="isExpired(h['expiry_permit_' + p.key]) ? 'text-red-600 font-bold' : 'text-slate-700'">{{ formatDay(h['expiry_permit_' + p.key]) }}</span>
                      <span v-if="isExpired(h['expiry_permit_' + p.key])" class="hidden print:inline text-[7pt] text-red-600 font-semibold ml-0.5">(EXPIRED)</span>
                    </template>
                    <span v-else class="text-slate-300">N/A</span>
                  </td>
                </tr>
              </tbody>
              <tfoot class="sig-spacer-row" aria-hidden="true"><tr><td colspan="10"></td></tr></tfoot>
            </table>
          </div>

          <TablePager position="bottom" noun="entries" :page="currentPage" @update:page="currentPage = $event" :total-pages="totalPages" :start="startItemIndex" :end="endItemIndex" :total="filteredHouses.length" :per-page="itemsPerPage" @update:per-page="itemsPerPage = $event; currentPage = 1" />

        </div>

        <!-- PHONE: cards -->
        <div class="md:hidden mb-3 rounded-2xl border border-slate-200 overflow-hidden">
          <TablePager position="top" noun="entries" :page="currentPage" @update:page="currentPage = $event" :total-pages="totalPages" :start="startItemIndex" :end="endItemIndex" :total="filteredHouses.length" :per-page="itemsPerPage" @update:per-page="itemsPerPage = $event; currentPage = 1" />
        </div>
        <div class="block md:hidden print:hidden space-y-3">
          <div v-if="filteredHouses.length === 0" class="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500 font-semibold text-sm">No compliance records found.</div>
          <div v-for="h in paginatedHouses" :key="'m-' + h.name" class="cp-mcard">
            <div class="flex justify-between items-start gap-3">
              <div class="min-w-0">
                <p class="font-semibold text-slate-900">{{ h.name }}</p>
                <p class="text-xs text-slate-500">{{ h.owner_name }}</p>
              </div>
              <span :class="['cp-status', 'is-' + statusTone(h.compliance_status)]">{{ statusLabel(h.compliance_status) }}</span>
            </div>
            <dl class="cp-mfacts">
              <div v-for="p in PERMITS" :key="p.key">
                <dt>{{ p.label }}</dt>
                <dd :class="h['expiry_permit_' + p.key] && isExpired(h['expiry_permit_' + p.key]) ? 'text-red-600' : ''">{{ h['expiry_permit_' + p.key] ? formatDay(h['expiry_permit_' + p.key]) : 'N/A' }}</dd>
              </div>
            </dl>
          </div>
          
        </div>

        <!-- Signatories (paper copy only) -->
        <div class="hidden print:grid grid-cols-2 gap-8 text-center signatories-block">
          <div>
            <div class="border-b border-slate-900 mx-auto w-3/4 mb-2"></div>
            <p class="text-[12px] font-semibold uppercase tracking-wide">Prepared by: SASO Coordinator</p>
          </div>
          <div>
            <div class="border-b border-slate-900 mx-auto w-3/4 mb-2"></div>
            <p class="text-[12px] font-semibold uppercase tracking-wide">Approved by: SASO Director</p>
          </div>
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

<style scoped>
@media screen and (min-width: 768px) {
  .cp-fit { height: 100dvh; min-height: 0 !important; overflow: hidden; }
  .cp-fit > main { display: flex; flex-direction: column; min-height: 0; padding-top: 24px !important; padding-bottom: 20px !important; }
  .cp-fit > main > * { flex-shrink: 0; }
  .cp-fit > main > .cp-body { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
  .cp-card { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .cp-scroll { flex: 1; min-height: 0; overflow: auto; }
}
.cp-fit :deep(.management-page-header) { margin-bottom: 14px; }
.cp-off-page { display: none; }
@media print { .cp-off-page { display: table-row !important; } }

.cp-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0 0 14px; }
@media (min-width: 1024px) { .cp-tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.cp-tiles > div { padding: 12px 16px; border-radius: 14px; background: #fff; border: 1px solid #e2e8f0; }
.cp-tiles dt { font-size: 12px; font-weight: 600; color: #64748b; }
.cp-tiles dt i { margin-right: 4px; color: #94a3b8; }
.cp-tiles dd { margin: 4px 0 0; font-size: 22px; font-weight: 700; color: #142b4a; line-height: 1.2; }
.cp-tiles .is-success dd, .cp-tiles .is-success dt i { color: #15803d; }
.cp-tiles .is-warning dd, .cp-tiles .is-warning dt i { color: #ea580c; }
.cp-tiles .is-danger dd, .cp-tiles .is-danger dt i { color: #dc2626; }

.cp-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-bottom: 14px; }
.cp-search { position: relative; flex: 1 1 280px; min-width: 0; }
.cp-search i { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 12px; pointer-events: none; }
.cp-search input { width: 100%; height: 40px; min-height: 40px !important; padding: 0 14px 0 38px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 13.5px; font-weight: 600; color: #334155; outline: none; }
.cp-search input::placeholder { font-weight: 400; color: #94a3b8; }
.cp-search input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, .12); }
.cp-legend { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #64748b; }
.cp-dot { width: 8px; height: 8px; border-radius: 999px; background: #dc2626; }
.cp-count { font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; white-space: nowrap; }
.cp-print { display: inline-flex; align-items: center; gap: 8px; height: 40px; min-height: 40px !important; padding: 0 16px; border: 0; border-radius: 10px; background: #dc2626; color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.cp-print:hover { background: #b91c1c; }
@media (max-width: 767px) { .cp-print { flex: 1 1 100%; justify-content: center; } }

/* Compliance table uses the shared .admin-table look (styles/management.css); the two header rows
   stick together, and a thin rule groups the permit date columns */
.cp-table { min-width: 1100px !important; }
.cp-table thead { position: sticky; top: 0; z-index: 2; }
.cp-table thead th { position: static !important; vertical-align: bottom; color: #0f172a !important; }
.cp-table thead th.cp-group-head { padding-bottom: 4px !important; text-align: center !important; font-weight: 700 !important; color: #0f172a !important; }
.cp-table thead th.cp-sub { padding-top: 4px !important; text-align: center !important; font-weight: 600 !important; color: #0f172a !important; }
/* One divider line between Status and the permit date columns */
.cp-table thead th.cp-group-head, .cp-table thead th.cp-sub:first-child, .cp-table tbody td:nth-child(3) { border-left: 1px solid #e2e8f0 !important; }
/* Status and permit date columns are centred */
.cp-table thead th.cp-center, .cp-table tbody td:not(.cp-name-cell) { text-align: center !important; }
.cp-table tbody td { white-space: nowrap; }
.cp-table tbody td.cp-name-cell { white-space: normal; min-width: 220px; }
.cp-status { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; white-space: nowrap; background: #f1f5f9; color: #475569; }
.cp-status.is-success { background: #e3f6ea; color: #15803d; }
.cp-status.is-warning { background: #fff7ed; color: #c2410c; }
.cp-status.is-danger { background: #fee2e2; color: #b91c1c; }
.cp-mcard { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; }
.cp-mfacts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; margin: 10px 0 0; }
.cp-mfacts dt { font-size: 11.5px; color: #64748b; }
.cp-mfacts dd { margin: 1px 0 0; font-size: 13px; font-weight: 600; color: #142b4a; }
@media print {
  .cp-table thead th, .cp-table thead th.cp-sub { background: #fff !important; color: #0f172a !important; position: static !important; }
  .cp-table thead th small { color: #334155 !important; }
}

/* Printed letterhead: clear space between the heading rule and the table */
.print-letterhead { align-items: center; justify-content: space-between; gap: 24px; padding: 4px 0 14px; margin-bottom: 22px; border-bottom: 2px solid #1e293b; }
@media print {
  .print-letterhead { display: flex !important; margin-bottom: 22px !important; padding-bottom: 14px !important; }
}

/* Printed copy / PDF: large, even text in every cell */
@media print {
  .cp-table { min-width: 0 !important; width: 100% !important; }
  .cp-table thead th, .cp-table tbody td { padding: 8px 10px !important; white-space: normal !important; }
  .cp-table thead th, .cp-table thead th * { font-size: 9.5pt !important; }
  .cp-table tbody td, .cp-table tbody td * { font-size: 10pt !important; line-height: 1.3 !important; }
  .print-letterhead p { font-size: 10.5pt !important; }
  .print-letterhead p:first-child { font-size: 14pt !important; }
  .signatories-block p { font-size: 10pt !important; }
}


/* Signature lines sit at the bottom of every printed page; the empty table footer
   (repeated on each page) keeps rows from running underneath them */
.sig-spacer-row { display: none; }
@media print {
  .management-page .signatories-block { position: fixed !important; left: 0 !important; right: 0 !important; bottom: 0 !important; margin: 0 !important; padding: 0 0 4mm !important; background: #fff !important; }
  .sig-spacer-row { display: table-footer-group !important; }
  .sig-spacer-row td { height: 26mm !important; border: 0 !important; padding: 0 !important; background: transparent !important; }
}
/* Printed copy: every cell gets the same visible border (including Status | Business),
   and column titles wrap between words only ("Building", not "Buildin g") */
@media print {
  .cp-table thead th, .cp-table thead th.cp-group-head, .cp-table thead th.cp-sub, .cp-table thead th.cp-sub:first-child,
  .cp-table tbody td, .cp-table tbody td:nth-child(3) { border: 1px solid #475569 !important; }
  .cp-table thead { position: static !important; }
  .cp-table { table-layout: auto !important; border: 0 !important; }
  .cp-table .sig-spacer-row td { border: 0 !important; }
  .cp-table thead th, .cp-table thead th * { font-size: 8pt !important; overflow-wrap: normal !important; word-break: keep-all !important; hyphens: none !important; }
  .cp-card { border: 0 !important; border-radius: 0 !important; }
}
</style>
