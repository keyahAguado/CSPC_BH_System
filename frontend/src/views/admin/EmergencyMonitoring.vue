<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import AdminNav from '../../components/partials/AdminNav.vue';
import { printEmergencyRegistry } from '../../utils/printHelper.js';
import { matchesSearch } from '../../utils/search.js';
import { DataTable } from 'simple-datatables';
import 'simple-datatables/dist/style.css';

const route = useRoute();

const residents = ref([]);
const boardingHouses = ref([]);
const selectedBarangay = ref('');
const selectedHouse = ref('');
const selectedCourse = ref(route.query.course || '');
const searchQuery = ref('');
const courseOptions = ref([]);
const isLoading = ref(true);

let dtInstance = null;

const initDataTable = () => {
  nextTick(() => {
    const tableEl = document.getElementById('emergencyTable');
    if (tableEl && !dtInstance) {
      try {
        dtInstance = new DataTable(tableEl, {
          perPage: 10,
          perPageSelect: [10, 25, 50, 100],
          searchable: false,
          labels: {
            perPage: "entries per page",
            noRows: "No active residents found",
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
      initDataTable();
    }
  } catch (error) {
    console.error('Failed to load emergency monitoring registry:', error);
  } finally {
    isLoading.value = false;
    initDataTable();
  }
};

const groupedResidents = computed(() => {
  // Build a map from all boarding houses (including ones with 0 residents)
  const groups = {};

  // Seed all known boarding houses first so empty ones still appear
  boardingHouses.value.forEach(bh => {
    groups[bh.id] = {
      house_id: bh.id,
      house_name: bh.name,
      house_status: 'accredited', // this seed list is always accredited-only (see backend query)
      house_location: bh.location || '',
      house_barangay: bh.barangay || '',
      house_owner_phone: '',
      residents: []
    };
  });

  // Filter residents using student-side flexible multi-word matching logic
  const filteredList = searchQuery.value.trim()
    ? residents.value.filter(r =>
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
      )
    : residents.value;

  // Fill in filtered residents
  filteredList.forEach(r => {
    const key = r.house_id;
    if (groups[key]) {
      if (!groups[key].house_owner_phone && r.house_owner_phone) {
        groups[key].house_owner_phone = r.house_owner_phone;
      }
      groups[key].residents.push(r);
    } else {
      // Covers residents of a house that's since been archived — the seeded
      // list above only includes currently-accredited houses, so an archived
      // house's residents land here instead of being silently dropped.
      groups[key] = {
        house_id: r.house_id,
        house_name: r.house_name || 'Unassigned',
        house_status: r.house_status || 'archived',
        house_location: r.house_location || '',
        house_barangay: r.house_barangay || '',
        house_owner_phone: r.house_owner_phone || '',
        residents: [r]
      };
    }
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
</script>

<template>
  <div class="bg-slate-50 min-h-screen pb-10 text-left font-sans">
    <AdminNav />

    <main class="max-w-[1400px] mx-auto pt-4 md:pt-10 px-4 md:px-6">
      
      <!-- Header Section -->
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6 mb-8">
        <div>
          <h1 class="text-xl md:text-2xl font-black text-slate-800 tracking-tight uppercase">Residency Registry</h1>
          <p class="text-[10px] md:text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Institutional Safety & Disaster Monitoring System</p>
        </div>

        <div class="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <!-- Barangay Filter -->
          <div class="flex-grow flex items-center gap-2 bg-white border border-slate-200 p-1.5 rounded-xl shadow-sm">
            <div class="pl-3 text-slate-400"><i class="fa-solid fa-filter text-xs"></i></div>
            <select v-model="selectedBarangay" @change="onBarangayChange" class="bg-transparent border-none w-full text-[12px] font-bold text-slate-600 outline-none pr-2 cursor-pointer">
              <option value="">All Barangays</option>
              <option v-for="b in barangays" :key="b" :value="b">{{ b }}</option>
            </select>
          </div>

          <!-- Boarding House Filter -->
          <div class="flex-grow flex items-center gap-2 bg-white border border-slate-200 p-1.5 rounded-xl shadow-sm">
            <div class="pl-3 text-slate-400"><i class="fa-solid fa-house text-xs"></i></div>
            <select v-model="selectedHouse" @change="onHouseChange" class="bg-transparent border-none w-full text-[12px] font-bold text-slate-600 outline-none pr-2 cursor-pointer">
              <option value="">All Boarding Houses</option>
              <option v-for="h in boardingHouses" :key="h.id" :value="h.id">{{ h.name }}</option>
            </select>
          </div>

          <!-- Course Filter -->
          <div class="flex-grow flex items-center gap-2 bg-white border border-slate-200 p-1.5 rounded-xl shadow-sm">
            <div class="pl-3 text-slate-400"><i class="fa-solid fa-graduation-cap text-xs"></i></div>
            <select v-model="selectedCourse" @change="onCourseChange" class="bg-transparent border-none w-full text-[12px] font-bold text-slate-600 outline-none pr-2 cursor-pointer">
              <option value="">All Courses</option>
              <option v-for="c in courseOptions" :key="c.course_code" :value="c.course_code">{{ c.course_code }}</option>
            </select>
          </div>

          <!-- Export/Print Button -->
          <button @click="handleExport"
             class="w-full md:w-auto justify-center bg-red-600 border border-red-700 text-white px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition shadow-sm flex items-center gap-2">
            <i class="fa-solid fa-print"></i> {{ printLabel }}
          </button>
        </div>
      </div>

      <!-- Dedicated Flexible Search Control Bar (Relocated Below Filters for Spacious Layout) -->
      <div class="bg-white rounded-2xl border border-slate-200 px-5 py-3.5 mb-8 shadow-sm flex items-center gap-3 no-print">
        <div class="text-slate-400 pl-1"><i class="fa-solid fa-magnifying-glass text-sm"></i></div>
        <input 
          type="text" 
          v-model="searchQuery" 
          placeholder="SEARCH RESIDENTS BY NAME, EMAIL, COURSE, ROOM, HOME ADDRESS, OR EMERGENCY CONTACT..." 
          class="bg-transparent border-none w-full text-[11px] font-bold text-slate-800 outline-none placeholder:text-slate-400 tracking-wide" 
        />
        <button v-if="searchQuery" @click="searchQuery = ''" class="text-slate-400 hover:text-slate-600 text-[10px] font-black uppercase tracking-widest px-2 transition">
          Clear
        </button>
      </div>

      <!-- Loading State Indicator (PWA inline SVG Loader) -->
      <div v-if="isLoading" class="py-20 flex flex-col items-center justify-center gap-3 bg-white rounded-[2rem] shadow-sm border border-slate-200 p-10 max-w-xl mx-auto text-center">
        <svg class="animate-spin h-10 w-10 text-[#1e4a8d] mb-4 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Loading residency records...</p>
      </div>

      <div v-else class="animate-in fade-in duration-300 space-y-6 md:space-y-8">
        
        <!-- Compact Stats Bar -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 no-print">
          <div class="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="text-slate-400 text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-1">Total Residents</div>
            <div class="text-xl md:text-2xl font-black text-slate-800">{{ residents.length }}</div>
            <div class="flex items-center gap-2.5 mt-1">
              <span class="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-blue-600">
                <span class="w-2 h-2 rounded-full bg-blue-500"></span>{{ genderCounts.male }}
              </span>
              <span class="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-pink-600">
                <span class="w-2 h-2 rounded-full bg-pink-500"></span>{{ genderCounts.female }}
              </span>
            </div>
          </div>
          <div class="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="text-slate-400 text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-1">Active Filter</div>
            <div class="text-xs md:text-sm font-black text-blue-600 uppercase truncate" :title="activeFilterLabel">{{ activeFilterLabel }}</div>
          </div>
          <div class="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="text-slate-400 text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-1">Safety Status</div>
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span class="text-[9px] md:text-[10px] font-black text-emerald-600 uppercase">System Active</span>
            </div>
          </div>
          <div class="bg-slate-900 p-4 md:p-5 rounded-2xl border border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <div class="text-slate-500 text-[8px] md:text-[9px] font-black uppercase tracking-widest mb-1">Last Update</div>
              <div class="text-[10px] md:text-[11px] font-bold text-white uppercase">{{ new Date().toLocaleDateString() }}</div>
            </div>
            <i class="fa-solid fa-clock-rotate-left text-slate-700"></i>
          </div>
        </div>

        <!-- ================= DESKTOP TABLE VIEW ================= -->
        <div class="hidden md:block print:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse" id="emergencyTable">
              <thead>
                <tr class="bg-slate-50 border-b border-slate-200 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                  <th class="px-6 py-4">Student Identity</th>
                  <th class="px-6 py-4 text-center">Sex</th>
                  <th class="px-6 py-4">Course / Year</th>
                  <th class="px-6 py-4">Current Residence</th>
                  <th class="px-6 py-4">Check-In</th>
                  <th class="px-6 py-4">Emergency Contact</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 text-[12px]">
                <!-- No results at all -->
                <tr v-if="residents.length === 0 && !selectedBarangay && !selectedHouse && !selectedCourse">
                  <td colspan="6" class="px-6 py-20 text-center">
                    <p class="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No active residents registered across all boarding houses.</p>
                  </td>
                </tr>
                <!-- Filter applied but no matches -->
                <tr v-else-if="residents.length === 0 && (selectedBarangay || selectedHouse || selectedCourse)">
                  <td colspan="6" class="px-6 py-16 text-center">
                    <p class="text-slate-700 font-black uppercase tracking-widest text-[11px] mb-2">No Active Residents on Record</p>
                    <p class="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Selected area has no registered residents at this time.</p>
                  </td>
                </tr>
                <template v-else v-for="group in groupedResidents.filter(g => g.residents.length > 0)" :key="group.house_name">
                  <!-- House Group Header Banner -->
                  <tr class="bg-blue-50/70 border-y border-blue-100">
                    <td colspan="6" class="px-6 py-3.5">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                          <div class="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold text-xs shadow-sm">
                            <i class="fa-solid fa-house-chimney"></i>
                          </div>
                          <div>
                            <h3 class="text-xs font-black text-slate-900 uppercase tracking-widest leading-none mb-1 flex items-center gap-2">
                              {{ group.house_name }}
                              <span v-if="group.house_status !== 'accredited'" class="bg-amber-100 text-amber-700 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest" title="This property is no longer accredited, but its residents are still tracked here for safety.">
                                Archived Property
                              </span>
                            </h3>
                            <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                              <i class="fa-solid fa-location-dot text-blue-500 mr-1"></i>
                              {{ group.house_barangay ? `Brgy. ${group.house_barangay}, Nabua, Camarines Sur` : group.house_location }}
                              <span v-if="group.house_owner_phone" class="ml-2 text-slate-400">| Contact: {{ group.house_owner_phone }}</span>
                            </p>
                          </div>
                        </div>
                        <span class="bg-blue-600/10 text-blue-700 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border border-blue-200/50">
                          {{ group.residents.length }} {{ group.residents.length === 1 ? 'Active Resident' : 'Active Residents' }}
                        </span>
                      </div>
                    </td>
                  </tr>
                  <!-- Boarders under this Boarding House -->
                  <tr v-for="r in group.residents" :key="r.id" class="hover:bg-slate-50/50 transition-colors group">
                    <td class="px-6 py-5">
                      <div class="font-bold text-slate-800 uppercase tracking-tight text-sm">{{ r.resident_name }}</div>
                      <div class="text-[10px] font-medium text-slate-400">{{ r.student_email }}</div>
                      <div class="text-[10px] font-bold text-blue-600 uppercase mt-0.5"><i class="fa-solid fa-house-user mr-1 text-[9px]"></i>Home: {{ r.home_address || 'N/A' }}</div>
                    </td>
                    <td class="px-6 py-5 text-center">
                      <span class="px-2 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-widest"
                            :class="{
                              'bg-blue-50 text-blue-600 border-blue-100': (r.sex || '').trim().toLowerCase() === 'male',
                              'bg-pink-50 text-pink-600 border-pink-100': (r.sex || '').trim().toLowerCase() === 'female',
                              'bg-slate-50 text-slate-400 border-slate-200': !['male', 'female'].includes((r.sex || '').trim().toLowerCase())
                            }">
                        {{ r.sex || 'N/A' }}
                      </span>
                    </td>
                    <td class="px-6 py-5">
                      <div class="font-bold text-slate-700 uppercase tracking-tighter">{{ r.course || 'N/A' }}</div>
                      <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Year Level: {{ r.year_level || 'N/A' }}</div>
                    </td>
                    <td class="px-6 py-5">
                      <div class="font-bold text-slate-700 uppercase tracking-tighter">{{ r.house_name }}</div>
                      <div class="text-[9px] font-bold text-blue-500 uppercase tracking-widest mt-0.5">Room #{{ r.room_number || 'N/A' }}</div>
                    </td>
                    <td class="px-6 py-5 text-slate-500 font-bold">
                      {{ new Date(r.booking_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
                    </td>
                    <td class="px-6 py-5">
                      <div class="flex items-center gap-3">
                        <div class="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg border border-red-100 flex flex-col min-w-[140px]">
                          <span class="text-[8px] font-black uppercase tracking-widest opacity-60">{{ r.guardian_name }}</span>
                          <span class="text-[11px] font-bold tracking-tight">{{ r.emergency_contact }}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ================= MOBILE PORTRAIT CARD VIEW (STRICTLY HIDDEN IN PRINT) ================= -->
        <div class="block md:hidden print:hidden space-y-6">
          <!-- No results at all -->
          <div v-if="residents.length === 0 && !selectedBarangay && !selectedHouse && !selectedCourse" class="bg-white p-10 rounded-2xl border border-slate-200 text-center shadow-sm">
            <p class="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No active residents registered across all boarding houses.</p>
          </div>
          <!-- Filter applied but no matches -->
          <div v-else-if="residents.length === 0 && (selectedBarangay || selectedHouse || selectedCourse)" class="bg-white p-10 rounded-2xl border border-slate-200 text-center shadow-sm">
            <p class="text-slate-700 font-black uppercase tracking-widest text-[11px] mb-2">No Active Residents on Record</p>
            <p class="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Selected area has no registered residents at this time.</p>
          </div>
          <div v-else v-for="group in groupedResidents.filter(g => g.residents.length > 0)" :key="group.house_name" class="space-y-3">
            <!-- Mobile House Group Header Banner -->
            <div class="bg-blue-50 border border-blue-200 p-4 rounded-xl flex justify-between items-center">
              <div class="flex items-center gap-2.5">
                <div class="w-7 h-7 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold text-xs">
                  <i class="fa-solid fa-house-chimney"></i>
                </div>
                <div>
                  <h3 class="text-xs font-black text-slate-900 uppercase tracking-wide leading-none mb-1 flex items-center gap-1.5 flex-wrap">
                    {{ group.house_name }}
                    <span v-if="group.house_status !== 'accredited'" class="bg-amber-100 text-amber-700 text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest">
                      Archived
                    </span>
                  </h3>
                  <p class="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                    {{ group.house_barangay ? `Brgy. ${group.house_barangay}, Nabua, Camarines Sur` : group.house_location }}
                  </p>
                </div>
              </div>
              <span class="bg-blue-600 text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
                {{ group.residents.length }}
              </span>
            </div>
            <!-- Student Boarder Cards under this house -->
            <div v-for="r in group.residents" :key="r.id" class="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div class="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <span>Student Identity</span>
                <span class="px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest"
                      :class="{
                        'bg-blue-50 text-blue-600 border-blue-100': (r.sex || '').trim().toLowerCase() === 'male',
                        'bg-pink-50 text-pink-600 border-pink-100': (r.sex || '').trim().toLowerCase() === 'female',
                        'bg-slate-50 text-slate-400 border-slate-200': !['male', 'female'].includes((r.sex || '').trim().toLowerCase())
                      }">
                  {{ r.sex || 'N/A' }}
                </span>
              </div>
              <div class="divide-y divide-slate-100 text-xs w-full">
                <div class="px-4 py-3 flex justify-between items-center gap-2">
                  <span class="font-bold text-slate-400 text-[10px] uppercase tracking-wider shrink-0">Name</span>
                  <div class="text-right truncate">
                    <p class="font-black text-slate-900 uppercase text-[12px] truncate">{{ r.resident_name }}</p>
                    <p class="text-[10px] text-slate-400 truncate">{{ r.student_email }}</p>
                    <p class="text-[10px] font-bold text-blue-600 uppercase truncate mt-0.5">Home: {{ r.home_address || 'N/A' }}</p>
                  </div>
                </div>
                <div class="px-4 py-3 flex justify-between items-center gap-2">
                  <span class="font-bold text-slate-400 text-[10px] uppercase tracking-wider shrink-0">Course / Yr</span>
                  <div class="text-right truncate">
                    <p class="text-slate-700 uppercase text-[11px] truncate">{{ r.course || 'N/A' }}</p>
                    <p class="text-[9px] text-slate-400">Year: {{ r.year_level || 'N/A' }}</p>
                  </div>
                </div>
                <div class="px-4 py-3 flex justify-between items-center gap-2">
                  <span class="font-bold text-slate-400 text-[10px] uppercase tracking-wider shrink-0">Room</span>
                  <span class="font-bold text-blue-600 text-[11px]">Room #{{ r.room_number || 'N/A' }}</span>
                </div>
                <div class="px-4 py-3 flex justify-between items-center gap-2">
                  <span class="font-bold text-slate-400 text-[10px] uppercase tracking-wider shrink-0">Check-In</span>
                  <span class="font-bold text-slate-500 text-[11px] text-right truncate">
                    {{ new Date(r.booking_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
                  </span>
                </div>
                <div class="px-4 py-3 flex justify-between items-center bg-red-50/50 gap-2">
                  <span class="font-bold text-red-500 text-[10px] uppercase tracking-wider shrink-0">Emergency Contact</span>
                  <div class="text-right">
                    <p class="text-[9px] font-black uppercase tracking-widest text-red-400/80">{{ r.guardian_name }}</p>
                    <p class="bg-red-50 text-red-600 px-2.5 py-1 mt-1 inline-block rounded-md text-[11px] font-black tracking-wider border border-red-100 shadow-sm truncate">
                      {{ r.emergency_contact }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Signatories (Single Line Row Layout with Generous Spacing) -->
        <div class="grid grid-cols-2 gap-8 mt-16 sm:mt-24 pt-10 sm:pt-12 mt-auto text-center signatories-block">
          <div>
            <div class="border-b border-slate-900 mx-auto w-3/4 mb-2"></div>
            <p class="text-[10px] font-black uppercase tracking-widest text-slate-600">PREPARED BY: SASO COORDINATOR</p>
          </div>
          <div>
            <div class="border-b border-slate-900 mx-auto w-3/4 mb-2"></div>
            <p class="text-[10px] font-black uppercase tracking-widest text-slate-600">APPROVED BY: SASO DIRECTOR</p>
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