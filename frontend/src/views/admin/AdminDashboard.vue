<script setup>
import { ref, onMounted, nextTick } from 'vue';
import axios from 'axios';
import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import AdminNav from '../../components/partials/AdminNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';

// State Variables
const stats = ref({
  totalHouses: 0,
  totalStudents: 0,
  occupancyRate: 0,
  pendingApps: 0,
  mostRated: 'N/A',
  houses: [],
  trends: []
});

const isLoading = ref(true);
const alertRef = ref(null);
const token = localStorage.getItem('cspc_token');

// Chart Canvas Elements Refs
const residencyCanvas = ref(null);
const trendCanvas = ref(null);

let residencyChart = null;
let trendChart = null;

const showSystemAlert = (message, type = 'error') => {
  if (alertRef.value) {
    alertRef.value.showSystemAlert(message, type);
  }
};

const fetchDashboardStats = async () => {
  try {
    isLoading.value = true;
    const response = await axios.get('/api/admin/dashboard', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.data.success) {
      stats.value = response.data.stats || {
        totalHouses: 0,
        totalStudents: 0,
        occupancyRate: 0,
        pendingApps: 0,
        mostRated: 'N/A',
        houses: [],
        trends: []
      };
    }
  } catch (error) {
    console.error('Failed to load dashboard stats:', error);
    showSystemAlert('Could not load administrative stats.', 'warning');
  } finally {
    // Set loading false FIRST so Vue renders the v-else block (canvas elements)
    isLoading.value = false;
  }

  // Wait for Vue to flush the DOM update — canvases are now mounted
  await nextTick();
  renderCharts();
};

const renderCharts = () => {
  const rawHouses = stats.value.houses || [];
  const rawTrends = stats.value.trends || [];

  // A. Student Residency Bar Chart (Only render if houses data is on record)
  if (residencyCanvas.value && rawHouses.length > 0) {
    const barLabels = rawHouses.map(h => h.name.toUpperCase());
    const barData = rawHouses.map(h => h.student_count);

    barLabels.reverse();
    barData.reverse();

    if (residencyChart) residencyChart.destroy();

    residencyChart = new Chart(residencyCanvas.value.getContext('2d'), {
      type: 'bar',
      data: {
        labels: barLabels,
        datasets: [{
          label: 'Students',
          data: barData,
          backgroundColor: '#2a528a',
          borderRadius: 6,
          barThickness: 14
        }]
      },
      options: {
        indexAxis: 'y',
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { beginAtZero: true, grid: { color: '#f8fafc' }, ticks: { font: { family: 'Outfit', weight: 'bold', size: 10 } } },
          y: { grid: { display: false }, ticks: { font: { family: 'Outfit', weight: 'black', size: 9 }, color: '#475569' } }
        }
      }
    });
  }

  // B. Booking Trend Line Chart (Only render if trend data is on record)
  if (trendCanvas.value && rawTrends.length > 0) {
    const lineLabels = rawTrends.map(t => t.month);
    const lineData = rawTrends.map(t => t.booking_count);

    if (trendChart) trendChart.destroy();

    const ctxTrend = trendCanvas.value.getContext('2d');
    const gradient = ctxTrend.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');

    trendChart = new Chart(ctxTrend, {
      type: 'line',
      data: {
        labels: lineLabels,
        datasets: [{
          label: 'Monthly Bookings',
          data: lineData,
          borderColor: '#10b981',
          borderWidth: 3,
          backgroundColor: gradient,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#10b981',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: 'Outfit', weight: 'bold', size: 10 }, color: '#475569' } },
          y: { 
            beginAtZero: true, 
            grid: { color: '#f8fafc' }, 
            ticks: { font: { family: 'Outfit', weight: 'bold', size: 10 }, color: '#94a3b8' } 
          }
        }
      }
    });
  }
};

onMounted(() => {
  fetchDashboardStats();
});
</script>

<template>
  <div class="bg-[#eef6ff] min-h-screen font-sans text-slate-800 flex flex-col">
    <AdminNav />
    <FlashAlert ref="alertRef" />

    <main class="flex-1 max-w-6xl mx-auto w-full py-8 px-4 sm:px-6 text-left">
      <!-- Dashboard Header -->
      <div class="text-center mb-6">
        <h1 class="text-2xl font-black text-slate-800 uppercase tracking-tight">
          Boarding House Dashboard
        </h1>
        <div class="w-12 h-1 bg-[#1d70f5] mx-auto rounded-full mt-1.5"></div>
      </div>

      <!-- Loading State Indicator -->
      <div v-if="isLoading" class="py-16 flex flex-col items-center justify-center gap-3 bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md mx-auto text-center">
        <svg class="animate-spin h-8 w-8 text-[#1e4a8d] mb-2 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-slate-400 font-bold uppercase text-[9px] tracking-widest">Loading stats details...</p>
      </div>

      <div v-else class="space-y-6 animate-in fade-in duration-300">
        <!-- Summary Stats Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <!-- Accredited Houses -->
          <div class="bg-white rounded-2xl p-3.5 sm:p-5 shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden transition hover:shadow-md group">
            <div class="w-9 h-9 sm:w-11 sm:h-11 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mb-2.5 sm:mb-4 transition group-hover:bg-[#2a528a] group-hover:text-white shadow-sm flex-shrink-0">
              <i class="fa-solid fa-house-circle-check text-base sm:text-lg"></i>
            </div>
            <div>
              <p class="text-[9px] sm:text-[10px] text-slate-400 font-black uppercase tracking-wider mb-1 truncate">Accredited Houses</p>
              <div class="flex items-baseline flex-wrap gap-1 sm:gap-2">
                <p class="text-2xl sm:text-3xl font-black text-slate-900 leading-none">{{ stats.totalHouses || 0 }}</p>
                <span class="text-[8px] sm:text-[9px] font-black text-blue-500 uppercase tracking-tight">Active Units</span>
              </div>
            </div>
          </div>

          <!-- Student Residents -->
          <div class="bg-white rounded-2xl p-3.5 sm:p-5 shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden transition hover:shadow-md group">
            <div class="w-9 h-9 sm:w-11 sm:h-11 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 mb-2.5 sm:mb-4 transition group-hover:bg-emerald-600 group-hover:text-white shadow-sm flex-shrink-0">
              <i class="fa-solid fa-users text-base sm:text-lg"></i>
            </div>
            <div>
              <p class="text-[9px] sm:text-[10px] text-slate-400 font-black uppercase tracking-wider mb-1 truncate">Student Residents</p>
              <div class="flex items-baseline flex-wrap gap-1 sm:gap-2">
                <p class="text-2xl sm:text-3xl font-black text-slate-900 leading-none">{{ stats.totalStudents || 0 }}</p>
                <span class="text-[8px] sm:text-[9px] font-black text-emerald-500 uppercase tracking-tight">Registered</span>
              </div>
            </div>
          </div>

          <!-- Occupancy Rate -->
          <div class="bg-white rounded-2xl p-3.5 sm:p-5 shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden transition hover:shadow-md group">
            <div class="w-9 h-9 sm:w-11 sm:h-11 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600 mb-2.5 sm:mb-4 transition group-hover:bg-purple-600 group-hover:text-white shadow-sm flex-shrink-0">
              <i class="fa-solid fa-chart-pie text-base sm:text-lg"></i>
            </div>
            <div>
              <p class="text-[9px] sm:text-[10px] text-slate-400 font-black uppercase tracking-wider mb-1 truncate">Occupancy Rate</p>
              <div class="flex items-baseline flex-wrap gap-1 sm:gap-2">
                <p class="text-2xl sm:text-3xl font-black text-slate-900 leading-none">{{ stats.occupancyRate || 0 }}%</p>
                <span class="text-[8px] sm:text-[9px] font-black text-purple-500 uppercase tracking-tight">Current Load</span>
              </div>
            </div>
          </div>

          <!-- Pending Applications -->
          <div class="bg-white rounded-2xl p-3.5 sm:p-5 shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden transition hover:shadow-md group">
            <div class="w-9 h-9 sm:w-11 sm:h-11 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500 mb-2.5 sm:mb-4 transition group-hover:bg-amber-500 group-hover:text-white shadow-sm flex-shrink-0">
              <i class="fa-solid fa-hourglass-half text-base sm:text-lg"></i>
            </div>
            <div>
              <p class="text-[9px] sm:text-[10px] text-slate-400 font-black uppercase tracking-wider mb-1 truncate">Pending Applications</p>
              <div class="flex items-baseline flex-wrap gap-1 sm:gap-2">
                <p class="text-2xl sm:text-3xl font-black text-slate-900 leading-none">{{ stats.pendingApps || 0 }}</p>
                <span class="text-[8px] sm:text-[9px] font-black text-amber-500 uppercase tracking-tight">In Queue</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Top Rated Highlight Card -->
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4 transition hover:shadow-md group">
          <div class="flex items-center gap-5">
            <div class="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-colors flex-shrink-0">
              <i class="fa-solid fa-star text-xl"></i>
            </div>
            <div>
              <p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Top-Rated Boarding House</p>
              <h2 class="text-xl font-black text-slate-900 uppercase tracking-tight">{{ stats.mostRated || 'N/A' }}</h2>
              <p class="text-[10px] font-bold text-amber-500 mt-0.5 uppercase tracking-wider">Highest rated based on student reviews</p>
            </div>
          </div>
          <div class="flex flex-col items-center md:items-end gap-1 bg-slate-50 px-5 py-3 rounded-xl border border-slate-100 flex-shrink-0">
            <div class="flex gap-1">
              <i class="fa-solid fa-star text-amber-400 text-sm"></i>
              <i class="fa-solid fa-star text-amber-400 text-sm"></i>
              <i class="fa-solid fa-star text-amber-400 text-sm"></i>
              <i class="fa-solid fa-star text-amber-400 text-sm"></i>
              <i class="fa-solid fa-star text-amber-400 text-sm"></i>
            </div>
            <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Student Verified Rating</span>
          </div>
        </div>

        <!-- Main Chart Section -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <!-- Student Residency Bar Chart -->
          <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-1 h-5 bg-[#2a528a] rounded-full"></div>
              <h2 class="text-xs font-black tracking-wider uppercase text-slate-800">Student Residency Overview</h2>
            </div>
            <div class="w-full relative" style="height: 260px;">
              <div v-if="!stats.houses || stats.houses.length === 0" class="absolute inset-0 flex flex-col items-center justify-center text-slate-400 font-bold uppercase tracking-wider text-xs text-center">
                No active boarding house statistics available
              </div>
              <canvas v-else ref="residencyCanvas" id="boardingHouseChart"></canvas>
            </div>
          </div>

          <!-- Booking Activity Trend Line Chart -->
          <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-1 h-5 bg-emerald-500 rounded-full"></div>
              <h2 class="text-xs font-black tracking-wider uppercase text-slate-800">System-Wide Booking Trend</h2>
            </div>
            <div class="w-full relative" style="height: 260px;">
              <div v-if="!stats.trends || stats.trends.length === 0" class="absolute inset-0 flex flex-col items-center justify-center text-slate-400 font-bold uppercase tracking-wider text-xs text-center">
                No booking activity records available
              </div>
              <canvas v-else ref="trendCanvas" id="bookingTrendChart"></canvas>
            </div>
          </div>
        </div>

        <!-- Report Management Section -->
        <div>
          <div class="flex items-center gap-3 mb-4">
            <div class="w-1 h-6 bg-[#2a528a] rounded-full"></div>
            <h2 class="text-base font-black text-slate-800 uppercase tracking-wider">Report Management</h2>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <!-- Accredited Masterlist -->
            <div class="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 group transition hover:-translate-y-1 hover:shadow-md flex flex-col">
              <div class="flex justify-between items-start mb-4">
                <div class="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 group-hover:bg-[#2a528a] group-hover:text-white transition-colors">
                  <i class="fa-solid fa-file-contract text-lg"></i>
                </div>
                <span class="text-[9px] font-black text-slate-300 uppercase tracking-wider">Institutional</span>
              </div>
              <h3 class="text-base font-black text-slate-800 uppercase mb-2">Accredited Masterlist</h3>
              <p class="text-xs font-medium text-slate-500 mb-6 leading-relaxed flex-grow">Generate an official list of all boarding houses currently accredited by SASO.</p>
              <router-link to="/admin/reports/masterlist" class="text-blue-600 font-bold text-xs uppercase tracking-wider flex items-center gap-2 hover:gap-3 transition-all">
                Generate Report <i class="fa-solid fa-arrow-right"></i>
              </router-link>
            </div>

            <!-- Emergency Student Registry -->
            <div class="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 group transition hover:-translate-y-1 hover:shadow-md flex flex-col">
              <div class="flex justify-between items-start mb-4">
                <div class="w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center text-red-600 group-hover:bg-red-600 group-hover:text-white transition-colors">
                  <i class="fa-solid fa-house-medical text-lg"></i>
                </div>
                <span class="text-[9px] font-black text-slate-300 uppercase tracking-wider">Safety Module</span>
              </div>
              <h3 class="text-base font-black text-slate-800 uppercase mb-2">Emergency Student Registry</h3>
              <p class="text-xs font-medium text-slate-500 mb-6 leading-relaxed flex-grow">Export student residency lists filtered by geographic risk areas (Monitoring Page).</p>
              <router-link to="/admin/emergency-monitoring" class="text-red-600 font-bold text-xs uppercase tracking-wider flex items-center gap-2 hover:gap-3 transition-all">
                Open Monitoring <i class="fa-solid fa-arrow-right"></i>
              </router-link>
            </div>

            <!-- Accreditation & Expiry -->
            <div class="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 group transition hover:-translate-y-1 hover:shadow-md flex flex-col">
              <div class="flex justify-between items-start mb-4">
                <div class="w-11 h-11 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                  <i class="fa-solid fa-file-invoice text-lg"></i>
                </div>
                <span class="text-[9px] font-black text-slate-300 uppercase tracking-wider">Compliance</span>
              </div>
              <h3 class="text-base font-black text-slate-800 uppercase mb-2">Accreditation & Expiry</h3>
              <p class="text-xs font-medium text-slate-500 mb-6 leading-relaxed flex-grow">Monitor legal document statuses and expiry dates for compliance reports.</p>
              <router-link to="/admin/reports/compliance" class="text-orange-600 font-bold text-xs uppercase tracking-wider flex items-center gap-2 hover:gap-3 transition-all">
                Generate Report <i class="fa-solid fa-arrow-right"></i>
              </router-link>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>