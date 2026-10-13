<script setup>
import TablePager from '../../components/management/TablePager.vue';
import LoadError from '../../components/management/LoadError.vue';

import PageHeader from '../../components/management/PageHeader.vue';
import '../../styles/management.css';
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import AdminNav from '../../components/partials/AdminNav.vue';
import { printEmergencyRegistry } from '../../utils/printHelper.js';
import { matchesSearch } from '../../utils/search.js';

const route = useRoute();

const residents = ref([]);
const boardingHouses = ref([]);
const selectedBarangay = ref('');
const selectedHouse = ref('');
const selectedCourse = ref(route.query.course || '');
const searchQuery = ref('');
const courseOptions = ref([]);
const isLoading = ref(true);

// Pure Vue Reactive Pagination State (matches Registered.vue)
const currentPage = ref(1);
const itemsPerPage = ref(10);

watch([searchQuery, selectedBarangay, selectedHouse, selectedCourse], () => {
  currentPage.value = 1;
});

const genderCounts = computed(() => {
  return residents.value.reduce((acc, r) => {
    const sex = (r.sex || '').trim().toLowerCase();
    if (sex === 'male') acc.male++;
    else if (sex === 'female') acc.female++;
    return acc;
  }, { male: 0, female: 0 });
});

const token = sessionStorage.getItem('cspc_token');

const fetchCourseOptions = async () => {
  try {
    const res = await axios.get('/api/admin/courses', {
      headers: { Authorization: `Bearer ${token}` }
    });
    courseOptions.value = (res.data.courses || []).filter(c => c.is_active);
  } catch (e) {
    console.warn('Failed to load course list for filter:', e.message);
  }
};

import NABUA_BARANGAYS from '../../constants/barangays.js';

const barangays = NABUA_BARANGAYS;

const fetchRegistry = async () => {
  loadError.value = '';
  try {
    isLoading.value = true;
    const params = new URLSearchParams();
    const barangayStr = String(selectedBarangay.value || '').trim();
    const houseStr = String(selectedHouse.value || '').trim();
    const courseStr = String(selectedCourse.value || '').trim();

    if (barangayStr && barangayStr.toLowerCase() !== 'all') {
      params.append('barangay', barangayStr);
    }
    if (houseStr && houseStr.toLowerCase() !== 'all') {
      params.append('house_id', houseStr);
    }
    if (courseStr && courseStr.toLowerCase() !== 'all') {
      params.append('course', courseStr);
    }

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const response = await axios.get(`/api/admin/reports/emergency-registry${queryString}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      residents.value = response.data.residents || [];
      if (response.data.boardingHouses && boardingHouses.value.length === 0) {
        boardingHouses.value = response.data.boardingHouses;
      }
    }
  } catch (error) {
    loadError.value = 'The server did not return these records. Refresh the page to try again.';
    console.error('Failed to load emergency monitoring registry:', error);
  } finally {
    isLoading.value = false;
  }
};

// Filter residents using flexible multi-word matching logic
const filteredResidents = computed(() => {
  if (!searchQuery.value.trim()) return residents.value;
  return residents.value.filter(r =>
    matchesSearch(searchQuery.value, [
      r.resident_name,
      r.student_email,
      r.course,
      r.year_level,
      r.home_address,
      r.guardian_name,
      r.emergency_contact,
      r.house_name,
      r.house_location,
      r.house_barangay,
      r.house_owner_phone
    ])
  );
});

const paginatedResidents = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  return filteredResidents.value.slice(start, start + itemsPerPage.value);
});

const totalPages = computed(() => {
  return Math.ceil(filteredResidents.value.length / itemsPerPage.value) || 1;
});

const startItemIndex = computed(() => {
  if (filteredResidents.value.length === 0) return 0;
  return (currentPage.value - 1) * itemsPerPage.value + 1;
});

const endItemIndex = computed(() => {
  return Math.min(currentPage.value * itemsPerPage.value, filteredResidents.value.length);
});

const groupedResidents = computed(() => {
  const groups = {};

  // Group paginated residents by house
  paginatedResidents.value.forEach(r => {
    const key = r.house_id || 'unassigned';
    if (!groups[key]) {
      const bh = boardingHouses.value.find(h => h.id === r.house_id);
      groups[key] = {
        house_id: r.house_id,
        house_name: r.house_name || (bh ? bh.name : 'Unassigned'),
        house_status: r.house_status || 'accredited',
        house_location: r.house_location || (bh ? bh.location : ''),
        house_barangay: r.house_barangay || (bh ? bh.barangay : ''),
        house_owner_phone: r.house_owner_phone || '',
        residents: []
      };
    }
    if (!groups[key].house_owner_phone && r.house_owner_phone) {
      groups[key].house_owner_phone = r.house_owner_phone;
    }
    groups[key].residents.push(r);
  });

  return Object.values(groups).sort((a, b) => a.house_name.localeCompare(b.house_name));
});

const onBarangayChange = () => {
  selectedHouse.value = '';
  selectedCourse.value = '';
  fetchRegistry();
};

const onHouseChange = () => {
  selectedBarangay.value = '';
  selectedCourse.value = '';
  fetchRegistry();
};

const onCourseChange = () => {
  selectedBarangay.value = '';
  selectedHouse.value = '';
  fetchRegistry();
};

// On-screen label — course shown as its short code, matching how courses
// appear everywhere else in the live app (dashboard bars, filter dropdown).
const activeFilterLabel = computed(() => {
  const selectedHouseObj = boardingHouses.value.find(h => String(h.id) === String(selectedHouse.value));
  if (selectedHouseObj) return selectedHouseObj.name;
  if (selectedBarangay.value) return `Barangay ${selectedBarangay.value}`;
  if (selectedCourse.value) return selectedCourse.value;
  return 'Unified Registry';
});

// Printed/exported report label — spells out the full course name alongside
// the code, since the document is meant to be read/archived on its own.
const reportFilterLabel = computed(() => {
  const selectedHouseObj = boardingHouses.value.find(h => String(h.id) === String(selectedHouse.value));
  if (selectedHouseObj) return selectedHouseObj.name;
  if (selectedBarangay.value) return `Barangay ${selectedBarangay.value}`;
  if (selectedCourse.value) {
    const c = courseOptions.value.find(c => c.course_code === selectedCourse.value);
    return c ? `${c.course_code} — ${c.course_name}` : selectedCourse.value;
  }
  return 'Unified Registry';
});

// Code -> full name lookup so the printed report can spell out each
// resident's course in full, not just the bare code.
const courseNameMap = computed(() =>
  Object.fromEntries(courseOptions.value.map(c => [c.course_code, c.course_name]))
);

const handleExport = () => {
  const date = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  printEmergencyRegistry(residents.value, reportFilterLabel.value, date, courseNameMap.value);
};

const printLabel = computed(() => {
  if (selectedHouse.value || selectedBarangay.value || selectedCourse.value) {
    return `Print — ${activeFilterLabel.value}`;
  }
  return 'Print Full Registry';
});

onMounted(() => {
  fetchRegistry();
  fetchCourseOptions();
});

const loadError = ref('');

// Summary tiles (follow the selected filter)
const houseCount = computed(() => new Set(residents.value.map(r => r.house_id).filter(Boolean)).size);
const courseCount = computed(() => new Set(residents.value.map(r => (r.course || '').trim()).filter(Boolean)).size);
const sexTone = (sex) => {
  const v = (sex || '').trim().toLowerCase();
  return v === 'male' ? 'is-male' : v === 'female' ? 'is-female' : '';
};
</script>

<template>
  <div class="management-page registry-fit bg-[#f8fafc] min-h-screen flex flex-col font-sans text-slate-800 text-left">
    <AdminNav />

    <main id="management-content" tabindex="-1" class="max-w-[1450px] mx-auto py-12 px-4 sm:px-6 flex-1 w-full text-left">
      <LoadError :message="loadError" />
      <PageHeader title="Emergency registry residence" />

      <!-- Summary tiles (counts follow the selected filter) -->
      <dl class="reg-tiles no-print">
        <div>
          <dt><i class="fa-solid fa-user-graduate" aria-hidden="true"></i> Residents</dt>
          <dd>{{ isLoading ? '…' : residents.length }}</dd>
          <span class="reg-tile-sub"><span class="text-blue-600">{{ genderCounts.male }} male</span> · <span class="text-pink-600">{{ genderCounts.female }} female</span></span>
        </div>
        <div>
          <dt><i class="fa-solid fa-house" aria-hidden="true"></i> Boarding houses</dt>
          <dd>{{ isLoading ? '…' : houseCount }}</dd>
          <span class="reg-tile-sub">with active residents</span>
        </div>
        <div>
          <dt><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i> Courses</dt>
          <dd>{{ isLoading ? '…' : courseCount }}</dd>
          <span class="reg-tile-sub">represented</span>
        </div>
        <div class="is-primary">
          <dt><i class="fa-solid fa-filter" aria-hidden="true"></i> Viewing</dt>
          <dd class="reg-tile-text" :title="activeFilterLabel">{{ activeFilterLabel }}</dd>
        </div>
      </dl>

      <!-- Filters -->
      <div class="reg-filters no-print">
        <div class="reg-search">
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input v-model="searchQuery" type="text" aria-label="Search residents" placeholder="Search by name, email, course, home address, or emergency contact..." />
          <button v-if="searchQuery" type="button" class="reg-search-clear" aria-label="Clear search" @click="searchQuery = ''"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </div>
        <label class="reg-select"><i class="fa-solid fa-location-dot" aria-hidden="true"></i>
          <select aria-label="Filter by barangay" v-model="selectedBarangay" @change="onBarangayChange">
            <option value="">All barangays</option>
            <option v-for="b in barangays" :key="b" :value="b">{{ b }}</option>
          </select>
        </label>
        <label class="reg-select"><i class="fa-solid fa-house" aria-hidden="true"></i>
          <select aria-label="Filter by boarding house" v-model="selectedHouse" @change="onHouseChange">
            <option value="">All boarding houses</option>
            <option v-for="h in boardingHouses" :key="h.id" :value="h.id">{{ h.name }}</option>
          </select>
        </label>
        <label class="reg-select"><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
          <select aria-label="Filter by course" v-model="selectedCourse" @change="onCourseChange">
            <option value="">All courses</option>
            <option v-for="c in courseOptions" :key="c.course_code" :value="c.course_code">{{ c.course_code }}</option>
          </select>
        </label>
        <button type="button" class="reg-btn-primary reg-btn-print" @click="handleExport"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> {{ printLabel }}</button>
      </div>

      <!-- Loading -->
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 px-6 gap-6">
        <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>

      <div v-else class="registry-body">
        <!-- LAPTOP / DESKTOP: table grouped by boarding house -->
        <div class="registry-table-card hidden lg:flex lg:flex-col print:block bg-white rounded-[2rem] shadow-sm border border-slate-200/60 overflow-hidden shadow-slate-100">
          <TablePager position="top" noun="entries" :page="currentPage" @update:page="currentPage = $event" :total-pages="totalPages" :start="startItemIndex" :end="endItemIndex" :total="filteredResidents.length" :per-page="itemsPerPage" @update:per-page="itemsPerPage = $event; currentPage = 1" />

          <div class="registry-table-scroll overflow-x-auto">
            <table class="management-registry-table w-full border-collapse" id="emergencyTable">
              <tbody class="divide-y divide-slate-100">
                <tr v-if="filteredResidents.length === 0">
                  <td colspan="5" class="admin-table-empty">
                    <p class="text-slate-500 font-medium text-[13px] text-center m-0">{{ (selectedBarangay || selectedHouse || selectedCourse || searchQuery) ? 'No residents match the selected filter or search.' : 'No active residents registered across all boarding houses.' }}</p>
                  </td>
                </tr>
                <template v-else v-for="group in groupedResidents.filter(g => g.residents.length > 0)" :key="group.house_name">
                  <tr class="reg-group-row">
                    <td colspan="5">
                      <div class="flex items-center justify-between gap-3 flex-wrap">
                        <div class="flex items-center gap-3 min-w-0">
                          <span class="reg-group-icon" aria-hidden="true"><i class="fa-solid fa-house-chimney"></i></span>
                          <div class="min-w-0">
                            <p class="reg-group-name">
                              {{ group.house_name }}
                              <span v-if="group.house_status !== 'accredited'" class="reg-chip is-warning" title="This property is no longer accredited, but its residents are still tracked here for safety.">Archived property</span>
                            </p>
                            <p class="reg-group-sub">
                              <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
                              {{ group.house_barangay ? `Brgy. ${group.house_barangay}, Nabua, Camarines Sur` : group.house_location }}
                              <span v-if="group.house_owner_phone"> · Owner contact: {{ group.house_owner_phone }}</span>
                            </p>
                          </div>
                        </div>
                        <span class="reg-chip is-primary">{{ group.residents.length }} {{ group.residents.length === 1 ? 'resident' : 'residents' }}</span>
                      </div>
                    </td>
                  </tr>
                  <tr class="reg-col-head">
                    <th scope="col">Student</th><th scope="col">Sex</th><th scope="col">Course / year</th><th scope="col">Residence</th><th scope="col">Emergency contact</th>
                  </tr>
                  <tr v-for="r in group.residents" :key="r.id">
                    <td>
                      <strong class="block text-slate-900 font-semibold">{{ r.resident_name }}</strong>
                      <span class="block text-slate-500 text-xs mt-0.5">{{ r.student_email }}</span>
                      <span class="block text-slate-500 text-xs mt-0.5"><i class="fa-solid fa-house-user text-slate-400 mr-1" aria-hidden="true"></i>Home: {{ r.home_address || 'N/A' }}</span>
                    </td>
                    <td>
                      <span :class="['reg-chip', sexTone(r.sex)]">{{ r.sex || 'N/A' }}</span>
                    </td>
                    <td>
                      <span class="block text-slate-800 font-medium">{{ r.course || 'N/A' }}</span>
                      <span class="block text-slate-500 text-xs mt-0.5">Year {{ r.year_level || 'N/A' }}</span>
                    </td>
                    <td>
                      <span class="block text-slate-800 font-medium">{{ r.house_name }}</span>
                      <span class="block text-slate-500 text-xs mt-0.5">Room {{ r.room_number || 'N/A' }}</span>
                    </td>
                    <td>
                      <div class="reg-emergency">
                        <span>{{ r.guardian_name || '—' }}</span>
                        <strong><i class="fa-solid fa-phone" aria-hidden="true"></i> {{ r.emergency_contact || '—' }}</strong>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <TablePager position="bottom" noun="entries" :page="currentPage" @update:page="currentPage = $event" :total-pages="totalPages" :start="startItemIndex" :end="endItemIndex" :total="filteredResidents.length" :per-page="itemsPerPage" @update:per-page="itemsPerPage = $event; currentPage = 1" />

        </div>

        <!-- PHONE: cards grouped by boarding house -->
        <div class="lg:hidden mb-3 rounded-2xl border border-slate-200 overflow-hidden">
          <TablePager position="top" noun="entries" :page="currentPage" @update:page="currentPage = $event" :total-pages="totalPages" :start="startItemIndex" :end="endItemIndex" :total="filteredResidents.length" :per-page="itemsPerPage" @update:per-page="itemsPerPage = $event; currentPage = 1" />
        </div>
        <div class="block lg:hidden print:hidden space-y-4">
          <div v-if="filteredResidents.length === 0" class="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500 text-[13px] font-medium">
            {{ (selectedBarangay || selectedHouse || selectedCourse || searchQuery) ? 'No residents match the selected filter or search.' : 'No active residents registered across all boarding houses.' }}
          </div>
          <div v-else v-for="group in groupedResidents.filter(g => g.residents.length > 0)" :key="'m-' + group.house_name" class="space-y-2">
            <div class="reg-group-card">
              <div class="min-w-0">
                <p class="reg-group-name">{{ group.house_name }} <span v-if="group.house_status !== 'accredited'" class="reg-chip is-warning">Archived</span></p>
                <p class="reg-group-sub">{{ group.house_barangay ? `Brgy. ${group.house_barangay}, Nabua, Camarines Sur` : group.house_location }}</p>
              </div>
              <span class="reg-chip is-primary">{{ group.residents.length }}</span>
            </div>
            <div v-for="r in group.residents" :key="'m-' + r.id" class="reg-card">
              <div class="flex justify-between items-start gap-2">
                <div class="min-w-0">
                  <p class="font-semibold text-slate-900 truncate">{{ r.resident_name }}</p>
                  <p class="text-xs text-slate-500 truncate">{{ r.student_email }}</p>
                </div>
                <span :class="['reg-chip', sexTone(r.sex)]">{{ r.sex || 'N/A' }}</span>
              </div>
              <dl class="reg-card-facts">
                <div><dt>Course / year</dt><dd>{{ r.course || 'N/A' }} · Year {{ r.year_level || 'N/A' }}</dd></div>
                <div><dt>Room</dt><dd>Room {{ r.room_number || 'N/A' }}</dd></div>
                <div><dt>Check-in</dt><dd>{{ r.booking_date ? new Date(r.booking_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' }}</dd></div>
                <div><dt>Home address</dt><dd>{{ r.home_address || 'N/A' }}</dd></div>
              </dl>
              <div class="reg-emergency mt-3">
                <span>Emergency contact · {{ r.guardian_name || '—' }}</span>
                <strong><i class="fa-solid fa-phone" aria-hidden="true"></i> {{ r.emergency_contact || '—' }}</strong>
              </div>
            </div>
          </div>
        </div>

        <!-- Signatories (printed report only) -->
        <div class="hidden print:grid grid-cols-2 gap-8 text-center signatories-block">
          <div>
            <div class="border-b border-slate-900 mx-auto w-3/4 mb-2"></div>
            <p class="text-[12px] font-semibold uppercase tracking-wide text-slate-600">PREPARED BY: SASO COORDINATOR</p>
          </div>
          <div>
            <div class="border-b border-slate-900 mx-auto w-3/4 mb-2"></div>
            <p class="text-[12px] font-semibold uppercase tracking-wide text-slate-600">APPROVED BY: SASO DIRECTOR</p>
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
    margin: 1cm;
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
  table {
    display: table !important;
    width: 100% !important;
    border-collapse: collapse !important;
    background: #ffffff !important;
  }
  th, td {
    border: 1px solid #94a3b8 !important;
    padding: 6px 8px !important;
    background: #ffffff !important;
    color: #0f172a !important;
  }
  th {
    background-color: #ffffff !important;
    font-weight: 900 !important;
    text-transform: uppercase !important;
  }
  .signatories-block {
    margin-top: 4rem !important;
    padding-top: 2rem !important;
    page-break-inside: avoid !important;
  }
}
</style>

<style scoped>
/* Let the registry grow with its rows; vertical scrolling belongs to the page. */
@media (min-width: 1024px) {
  .registry-fit { height: auto; min-height: 100dvh !important; overflow: visible; }
  .registry-fit > main { display: flex; flex-direction: column; min-height: 0; padding-top: 24px !important; padding-bottom: 20px !important; }
  .registry-fit > main :deep(.management-page-header) { margin-bottom: 14px; }
  .registry-fit > main > * { flex-shrink: 0; }
  .registry-fit > main > .registry-body { flex: 0 0 auto; display: flex; flex-direction: column; }
  .registry-table-card { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .registry-table-scroll { flex: 0 0 auto; max-height: none; overflow-x: auto; }
  .registry-table-scroll thead th { position: sticky; top: 0; z-index: 1; background: #f8fafc; }
  .registry-table-scroll :deep(td) { padding-top: 10px; padding-bottom: 10px; vertical-align: middle; }
}

/* Summary tiles */
.reg-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0 0 14px; }
@media (min-width: 1024px) { .reg-tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.reg-tiles > div { padding: 10px 14px; border-radius: 14px; background: #fff; border: 1px solid #e2e8f0; min-width: 0; }
.reg-tiles dt { font-size: 12px; font-weight: 600; color: #64748b; }
.reg-tiles dt i { color: #94a3b8; margin-right: 4px; }
.reg-tiles dd { margin: 2px 0 0; font-size: 20px; font-weight: 700; color: #142b4a; line-height: 1.2; }
.reg-tiles .reg-tile-text { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.reg-tile-sub { display: block; margin-top: 2px; font-size: 12px; color: #64748b; }
.reg-tiles > div.is-primary { background: #e7eef8; border-color: #c9d7ec; }
.reg-tiles > div.is-primary dd, .reg-tiles > div.is-primary dt i { color: #1e4a8d; }
.reg-tiles > div.is-danger { background: #fff1f2; border-color: #fecdd3; }
.reg-tiles > div.is-danger dd { color: #be123c; }

/* Filter bar */
.reg-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 14px; }
.reg-search { position: relative; flex: 1 1 280px; min-width: 0; }
.reg-search > i { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 12px; pointer-events: none; }
.reg-search input { width: 100%; height: 40px; min-height: 40px !important; padding: 0 40px 0 38px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 13.5px; font-weight: 600; color: #334155; outline: none; box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }
.reg-search input::placeholder { font-weight: 400; color: #94a3b8; }
.reg-search input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, .12); }
.reg-search-clear { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); width: 28px; height: 28px; min-height: 28px !important; border: 0; border-radius: 8px; background: transparent; color: #94a3b8; cursor: pointer; }
.reg-search-clear:hover { background: #f1f5f9; color: #475569; }
.reg-select { display: inline-flex; align-items: center; gap: 8px; padding: 0 12px; height: 40px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }
.reg-select i { color: #94a3b8; font-size: 12px; }
.reg-select select { border: 0; background: transparent; font-size: 13.5px; font-weight: 600; color: #334155; outline: none; cursor: pointer; min-height: 0 !important; max-width: 220px; }
.reg-count { font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; white-space: nowrap; }
.reg-btn-primary { display: inline-flex; align-items: center; gap: 8px; height: 40px; min-height: 40px !important; padding: 0 16px; border: 0; border-radius: 10px; background: #1e4a8d; color: #fff; font-size: 13.5px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.reg-btn-primary:hover { background: #163870; }
@media (max-width: 767px) { .reg-select, .reg-btn-primary { flex: 1 1 100%; justify-content: center; } .reg-select select { max-width: none; width: 100%; } }

/* Chips, buttons */
.reg-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; text-transform: capitalize; }
.reg-chip.is-primary { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
.reg-chip.is-violet { background: #f5f3ff; color: #6d28d9; border-color: #ddd6fe; }
.reg-chip.is-success { background: #f0fdf4; color: #15803d; border-color: #bbf7d0; }
.reg-chip.is-warning { background: #fff7ed; color: #c2410c; border-color: #fed7aa; }
.reg-chip.is-danger { background: #fff1f2; color: #be123c; border-color: #fecdd3; }
.reg-chip.is-male { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
.reg-chip.is-female { background: #fdf2f8; color: #be185d; border-color: #fbcfe8; }
.reg-dot { width: 7px; height: 7px; border-radius: 999px; background: currentColor; }
.reg-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 12px; min-height: 36px !important; border-radius: 10px; border: 1px solid #bfdbfe; background: #fff; color: #1d4ed8; font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.reg-btn:hover { background: #eff6ff; }
.reg-btn.is-icon { width: 36px; padding: 0; }
.reg-btn.is-danger { border-color: #fecdd3; background: #fff1f2; color: #be123c; }
.reg-btn.is-danger:hover { background: #ef4444; border-color: #ef4444; color: #fff; }
.reg-btn.is-success { border-color: #bbf7d0; background: #f0fdf4; color: #15803d; }
.reg-btn.is-success:hover { background: #22c55e; border-color: #22c55e; color: #fff; }
.reg-avatar { width: 40px; height: 40px; flex-shrink: 0; border-radius: 12px; object-fit: cover; border: 1px solid #e2e8f0; background: #f1f5f9; }

/* Residency groups */
.reg-group-row td { background: #f5f8fd; }
.reg-group-icon { width: 32px; height: 32px; flex-shrink: 0; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: #1e4a8d; color: #fff; font-size: 13px; }
.reg-group-name { margin: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 14px; font-weight: 700; color: #142b4a; }
.reg-group-sub { margin: 2px 0 0; font-size: 12px; color: #64748b; }
.reg-group-sub i { color: #94a3b8; margin-right: 2px; }
.reg-emergency { display: inline-flex; flex-direction: column; gap: 2px; padding: 6px 12px; border-radius: 10px; background: #fff1f2; border: 1px solid #fecdd3; min-width: 150px; }
.reg-emergency span { font-size: 12px; color: #9f1239; font-weight: 600; }
.reg-emergency strong { font-size: 13px; color: #be123c; font-weight: 700; }
.reg-group-card { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-radius: 14px; background: #e7eef8; border: 1px solid #c9d7ec; }
.reg-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; }
.reg-card-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; margin: 10px 0 0; }
.reg-card-facts dt { font-size: 11.5px; color: #64748b; }
.reg-card-facts dd { margin: 1px 0 0; font-size: 13px; font-weight: 600; color: #142b4a; }

/* Grid lines on every row and column */
.registry-table-scroll :deep(table) { border-collapse: collapse; }
.registry-table-scroll :deep(th),
.registry-table-scroll :deep(td) { border: 1px solid #e2e8f0 !important; }
.registry-table-scroll :deep(thead th) { border-top: 0 !important; }
.registry-table-scroll :deep(tr > :first-child) { border-left: 0 !important; }
.registry-table-scroll :deep(tr > :last-child) { border-right: 0 !important; }

/* Center every column's content (group banners in the residency table stay left-aligned) */
.registry-table-scroll :deep(th),
.registry-table-scroll :deep(td) { text-align: center !important; vertical-align: middle !important; }
.registry-table-scroll :deep(.reg-group-row td) { text-align: left !important; }
/* Student column stays left-aligned; Sex to Emergency contact are centered */
.registry-table-scroll :deep(tr > th:first-child),
.registry-table-scroll :deep(tr:not(.reg-group-row) > td:first-child) { text-align: left !important; }

/* Column titles repeat under each boarding house name */
.reg-col-head th { background: #f8fafc; font-size: 12px; font-weight: 700; color: #475569; padding-top: 8px !important; padding-bottom: 8px !important; }

.reg-btn-print { background: #dc2626 !important; }
.reg-btn-print:hover { background: #b91c1c !important; }
</style>
