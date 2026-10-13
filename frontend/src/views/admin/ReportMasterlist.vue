<script setup>
import TablePager from '../../components/management/TablePager.vue';
import LoadError from '../../components/management/LoadError.vue';

import PageHeader from '../../components/management/PageHeader.vue';
import '../../styles/management.css';
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';
import AdminNav from '../../components/partials/AdminNav.vue';

const houses = ref([]);
const reportDate = ref('');
const searchQuery = ref('');

// Pagination (screen only; the printed copy lists every house)
const currentPage = ref(1);
const itemsPerPage = ref(10);
watch(searchQuery, () => { currentPage.value = 1; });
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

const formatDay = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const totalPages = computed(() => Math.max(1, Math.ceil(filteredHouses.value.length / itemsPerPage.value)));
const startItemIndex = computed(() => (filteredHouses.value.length ? (currentPage.value - 1) * itemsPerPage.value + 1 : 0));
const endItemIndex = computed(() => Math.min(currentPage.value * itemsPerPage.value, filteredHouses.value.length));
const onPage = (i) => i + 1 >= startItemIndex.value && i + 1 <= endItemIndex.value;

// Summary tiles (all accredited houses, not just the search results)
const totals = computed(() => houses.value.reduce((t, h) => {
  t.rooms += Number(h.total_rooms || 0);
  t.maleRooms += Number(h.male_rooms || 0);
  t.femaleRooms += Number(h.female_rooms || 0);
  t.capacity += Number(h.total_capacity || 0);
  t.occupants += Number(h.occupied_beds ?? h.current_occupants ?? 0);
  t.boys += Number(h.male_count || 0);
  t.girls += Number(h.female_count || 0);
  return t;
}, { rooms: 0, maleRooms: 0, femaleRooms: 0, capacity: 0, occupants: 0, boys: 0, girls: 0 }));
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
            <p class="text-sm font-bold uppercase mt-1">Accredited Boarding Houses Masterlist</p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-[11px] font-semibold uppercase">Report date</p>
          <p class="text-sm font-bold">{{ reportDate }}</p>
        </div>
      </div>

      <div class="no-print">
        <PageHeader title="Accredited masterlist" />

        <!-- Summary tiles -->
        <dl class="ml-tiles">
          <div><dt><i class="fa-solid fa-house-circle-check" aria-hidden="true"></i> Accredited houses</dt><dd>{{ isLoading ? '…' : houses.length }}</dd></div>
          <div><dt><i class="fa-solid fa-door-open" aria-hidden="true"></i> Rooms</dt><dd>{{ isLoading ? '…' : totals.rooms }}</dd><span class="ml-tile-sub"><span class="text-blue-600">{{ totals.maleRooms }} male</span> · <span class="text-pink-600">{{ totals.femaleRooms }} female</span></span></div>
          <div><dt><i class="fa-solid fa-bed" aria-hidden="true"></i> Bed capacity</dt><dd>{{ isLoading ? '…' : totals.capacity }}</dd></div>
          <div class="is-primary"><dt><i class="fa-solid fa-user-graduate" aria-hidden="true"></i> Current occupants</dt><dd>{{ isLoading ? '…' : totals.occupants }}</dd><span class="ml-tile-sub"><span class="text-blue-600">{{ totals.boys }} male</span> · <span class="text-pink-600">{{ totals.girls }} female</span></span></div>
        </dl>

        <!-- Toolbar -->
        <div class="ml-toolbar">
          <div class="ml-search">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <input v-model="searchQuery" type="text" aria-label="Search masterlist" placeholder="Search by boarding house, owner, or address..." />
          </div>
          <span class="ml-count">{{ filteredHouses.length }} result{{ filteredHouses.length !== 1 ? 's' : '' }}</span>
          <button type="button" class="ml-print" @click="handlePrint"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> Print / Save as PDF</button>
        </div>
      </div>

      <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 gap-6 no-print">
        <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>

      <div v-else class="masterlist-body">
        <!-- LAPTOP / DESKTOP + PRINT: table -->
        <div class="masterlist-card admin-table-card hidden md:flex md:flex-col print:block">
          <TablePager position="top" noun="entries" :page="currentPage" @update:page="currentPage = $event" :total-pages="totalPages" :start="startItemIndex" :end="endItemIndex" :total="filteredHouses.length" :per-page="itemsPerPage" @update:per-page="itemsPerPage = $event; currentPage = 1" />

          <div class="masterlist-scroll overflow-x-auto">
            <table class="ml-table admin-table w-full" id="masterlistTable">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Boarding house<small>Address / barangay</small></th>
                  <th scope="col">Owner / contact</th>
                  <th scope="col">Total rooms</th>
                  <th scope="col">Bed capacity<small>Beds</small></th>
                  <th scope="col">Current occupants<small>Male / female</small></th>
                  <th scope="col">Accreditation<small>Approval date</small></th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="filteredHouses.length === 0">
                  <td colspan="8" class="admin-table-empty">No accredited boarding houses found.</td>
                </tr>
                <tr v-for="(h, i) in filteredHouses" :key="h.id" :class="{ 'ml-off-page': !onPage(i) }">
                  <td class="text-slate-500">{{ i + 1 }}</td>
                  <td>
                    <strong class="ml-name admin-table-name">{{ h.name }}</strong>
                    <span class="admin-table-sub print:hidden">{{ h.address || '—' }}</span>
                    <span v-if="h.barangay" class="admin-table-sub print:hidden">Brgy. {{ h.barangay }}</span>
                  </td>
                  <td>
                    <span class="admin-table-main">{{ h.owner_name }}</span>
                    <span class="admin-table-sub"><i class="fa-solid fa-phone text-slate-500 mr-1.5" aria-hidden="true"></i>{{ h.owner_phone || '—' }}</span>
                  </td>
                  <td>{{ h.total_rooms || 0 }}</td>
                  <td>{{ h.total_capacity || 0 }}</td>
                  <td>
                    <span class="ml-mf"><span class="text-blue-600">{{ h.male_count || 0 }} M</span><span class="ml-sep">|</span><span class="text-pink-600">{{ h.female_count || 0 }} F</span></span>
                    <span class="admin-table-sub">{{ h.occupied_beds ?? h.current_occupants ?? 0 }} / {{ h.total_capacity || 0 }} total</span>
                  </td>
                  <td>{{ h.approved_at ? formatDay(h.approved_at) : '—' }}</td>
                  <td><span class="ml-status"><i class="fa-solid fa-circle-check" aria-hidden="true"></i>{{ h.house_status }}</span></td>
                </tr>
              </tbody>
              <tfoot class="sig-spacer-row" aria-hidden="true"><tr><td colspan="8"></td></tr></tfoot>
            </table>
          </div>
                    <TablePager position="bottom" noun="entries" :page="currentPage" @update:page="currentPage = $event" :total-pages="totalPages" :start="startItemIndex" :end="endItemIndex" :total="filteredHouses.length" :per-page="itemsPerPage" @update:per-page="itemsPerPage = $event; currentPage = 1" />

        </div>

        <!-- PHONE: cards -->
        <div class="md:hidden mb-3 rounded-2xl border border-slate-200 overflow-hidden">
          <TablePager position="top" noun="entries" :page="currentPage" @update:page="currentPage = $event" :total-pages="totalPages" :start="startItemIndex" :end="endItemIndex" :total="filteredHouses.length" :per-page="itemsPerPage" @update:per-page="itemsPerPage = $event; currentPage = 1" />
        </div>
        <div class="block md:hidden print:hidden space-y-3">
          <div v-if="filteredHouses.length === 0" class="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500 font-semibold text-sm">No accredited boarding houses found.</div>
          <div v-for="(h, i) in filteredHouses" v-show="onPage(i)" :key="'m-' + h.id" class="ml-card">
            <div class="flex justify-between items-start gap-3">
              <div class="min-w-0">
                <span class="text-[12px] font-semibold text-slate-400">#{{ i + 1 }}</span>
                <p class="font-semibold text-slate-900 leading-tight">{{ h.name }}</p>
                <p class="text-xs text-slate-500 mt-0.5">{{ h.address || '—' }}</p>
              </div>
              <span class="ml-chip">{{ h.house_status }}</span>
            </div>
            <p class="text-xs text-slate-600 mt-2">{{ h.owner_name }}<span v-if="h.owner_phone" class="text-slate-400"> · {{ h.owner_phone }}</span></p>
            <dl class="ml-card-facts">
              <div><dt>Rooms</dt><dd>{{ h.total_rooms || 0 }} <small>({{ h.male_rooms || 0 }} M · {{ h.female_rooms || 0 }} F)</small></dd></div>
              <div><dt>Capacity</dt><dd>{{ h.total_capacity || 0 }} beds</dd></div>
              <div><dt>Occupants</dt><dd>{{ h.occupied_beds ?? h.current_occupants ?? 0 }} <small>({{ h.male_count || 0 }} M · {{ h.female_count || 0 }} F)</small></dd></div>
              <div><dt>Approved</dt><dd>{{ h.approved_at ? formatDay(h.approved_at) : '—' }}</dd></div>
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

<style scoped>
/* Same layout as the other admin lists: one screen on laptop, table scrolls inside its card */
@media screen and (min-width: 768px) {
  .masterlist-fit { height: 100dvh; min-height: 0 !important; overflow: hidden; }
  .masterlist-fit > main { display: flex; flex-direction: column; min-height: 0; padding-top: 24px !important; padding-bottom: 20px !important; }
  .masterlist-fit > main > * { flex-shrink: 0; }
  .masterlist-fit > main > .masterlist-body { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
  .masterlist-card { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .masterlist-scroll { flex: 1; min-height: 0; overflow: auto; }
  .masterlist-scroll thead th { position: sticky; top: 0; z-index: 1; background: #f8fafc; }
}
.ml-off-page { display: none; }
@media print { .ml-off-page { display: table-row !important; } }
.masterlist-card { display: flex; flex-direction: column; }
/* Masterlist table uses the shared .admin-table look (styles/management.css) */
.ml-thumb { width: 64px; height: 48px; flex-shrink: 0; border-radius: 8px; object-fit: cover; border: 1px solid #e2e8f0; }
.ml-thumb.is-empty { display: flex; align-items: center; justify-content: center; background: #e7eef8; color: #1e4a8d; }
.ml-mf { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; font-size: 13px; }
.ml-sep { color: #cbd5e1; font-weight: 400; }
.ml-status { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 8px; background: #dcfce7; color: #15803d; font-size: 12px; font-weight: 600; text-transform: capitalize; white-space: nowrap; }
.ml-status i { font-size: 12px; color: #16a34a; }
@media print {
  .ml-table thead th { background: #fff !important; color: #0f172a !important; }
  .ml-table thead th small { color: #334155 !important; }
  .ml-thumb { width: 44px; height: 34px; }
}

.ml-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0 0 14px; }
@media (min-width: 1024px) { .ml-tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.ml-tiles > div { padding: 10px 14px; border-radius: 14px; background: #fff; border: 1px solid #e2e8f0; }
.ml-tiles dt { font-size: 12px; font-weight: 600; color: #64748b; }
.ml-tiles dt i { color: #94a3b8; margin-right: 4px; }
.ml-tiles dd { margin: 2px 0 0; font-size: 20px; font-weight: 700; color: #142b4a; line-height: 1.2; }
.ml-tile-sub { display: block; margin-top: 2px; font-size: 12px; color: #64748b; }
.ml-tiles > div.is-primary { background: #e7eef8; border-color: #c9d7ec; }
.ml-tiles > div.is-primary dd, .ml-tiles > div.is-primary dt i { color: #1e4a8d; }

.ml-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 14px; }
.ml-search { position: relative; flex: 1 1 280px; min-width: 0; }
.ml-search i { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 12px; pointer-events: none; }
.ml-search input { width: 100%; height: 40px; min-height: 40px !important; padding: 0 14px 0 38px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 13.5px; font-weight: 600; color: #334155; outline: none; }
.ml-search input::placeholder { font-weight: 400; color: #94a3b8; }
.ml-search input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, .12); }
.ml-count { font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; white-space: nowrap; }
.ml-print { display: inline-flex; align-items: center; gap: 8px; height: 40px; min-height: 40px !important; padding: 0 16px; border: 0; border-radius: 10px; background: #dc2626; color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.ml-print:hover { background: #b91c1c; }
@media (max-width: 767px) { .ml-print { flex: 1 1 100%; justify-content: center; } }

.ml-chip { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 999px; background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; font-size: 12px; font-weight: 600; text-transform: capitalize; }
.ml-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; }
.ml-card-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 10px 0 0; }
@media (max-width: 420px) { .ml-card-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.ml-card-facts dt { font-size: 11.5px; color: #64748b; }
.ml-card-facts dd { margin: 1px 0 0; font-size: 13px; font-weight: 700; color: #142b4a; }
.ml-card-facts small { font-weight: 500; color: #64748b; }

/* Printed letterhead: clear space between the heading rule and the table */
.print-letterhead { align-items: center; justify-content: space-between; gap: 24px; padding: 4px 0 14px; margin-bottom: 22px; border-bottom: 2px solid #1e293b; }
@media print {
  .print-letterhead { display: flex !important; margin-bottom: 22px !important; padding-bottom: 14px !important; }
}

/* Printed copy / PDF: large, even text in every cell */
@media print {
  .ml-table { min-width: 0 !important; width: 100% !important; }
  .ml-table thead th, .ml-table tbody td { padding: 8px 12px !important; }
  .ml-table thead th, .ml-table thead th * { font-size: 9.5pt !important; }
  .ml-table tbody td, .ml-table tbody td * { font-size: 10.5pt !important; line-height: 1.3 !important; }
  .ml-table tbody td i { font-size: 9pt !important; }
  .ml-name { font-weight: 800 !important; }
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
/* Printed copy: same lines as the Compliance report: a clear border on every cell, none around
   the empty space kept for the signature lines, and no rounded box */
@media print {
  .ml-table thead th, .ml-table tbody td { border: 1px solid #475569 !important; }
  .ml-table thead th { position: static !important; }
  .ml-table { table-layout: auto !important; border: 0 !important; }
  .ml-table .sig-spacer-row td { border: 0 !important; }
  .ml-table thead th, .ml-table thead th * { overflow-wrap: normal !important; word-break: keep-all !important; }
  .masterlist-card { border: 0 !important; border-radius: 0 !important; }
}
</style>
