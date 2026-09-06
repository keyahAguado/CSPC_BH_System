<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import AdminNav from '../../components/partials/AdminNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';

const router = useRouter();

const adminName = (() => {
  try {
    const savedUser = JSON.parse(sessionStorage.getItem('cspc_user') || '{}');
    return savedUser.name || 'Admin';
  } catch {
    return 'Admin';
  }
})();

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
const token = sessionStorage.getItem('cspc_token');

// Course breakdown report + admin course management
const courseBreakdown = ref([]);
const showCourseModal = ref(false);
const courseList = ref([]);
const isLoadingCourses = ref(false);
const courseForm = ref({ id: null, course_code: '', course_name: '', department: '' });
const courseFormRef = ref(null);
const courseCodeInputRef = ref(null);

// System-consistent confirmation modal (matches the pattern used across admin pages)
const showConfirmModal = ref(false);
const confirmTitle = ref('');
const confirmMessage = ref('');
const confirmAction = ref(null);

const triggerConfirm = (title, message, action) => {
  confirmTitle.value = title;
  confirmMessage.value = message;
  confirmAction.value = action;
  showConfirmModal.value = true;
};

const executeConfirm = async () => {
  showConfirmModal.value = false;
  if (confirmAction.value) {
    await confirmAction.value();
    confirmAction.value = null;
  }
};

// College/department color coding — shared by the report bars and the manage-courses list.
const DEPARTMENTS = ['CCS', 'CHS', 'CEA', 'CAS', 'CTHBM', 'CTDE'];
const DEPARTMENT_COLORS = {
  CCS: { bar: 'bg-yellow-400', badge: 'bg-yellow-50 text-yellow-700 border-yellow-100' },
  CHS: { bar: 'bg-purple-500', badge: 'bg-purple-50 text-purple-700 border-purple-100' },
  CEA: { bar: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600 border-slate-200' },
  CAS: { bar: 'bg-red-500', badge: 'bg-red-50 text-red-700 border-red-100' },
  CTHBM: { bar: 'bg-green-500', badge: 'bg-green-50 text-green-700 border-green-100' },
  CTDE: { bar: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700 border-blue-100' }
};
const DEFAULT_DEPT_COLOR = { bar: 'bg-slate-300', badge: 'bg-slate-50 text-slate-400 border-slate-100' };
const deptColor = (dept) => DEPARTMENT_COLORS[dept] || DEFAULT_DEPT_COLOR;

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

const fetchCourseBreakdown = async () => {
  try {
    const response = await axios.get('/api/admin/reports/courses', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.data.success) {
      courseBreakdown.value = response.data.breakdown || [];
    }
  } catch (error) {
    console.error('Failed to load course breakdown:', error);
  }
};

const fetchCourseList = async () => {
  isLoadingCourses.value = true;
  try {
    const response = await axios.get('/api/admin/courses', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.data.success) {
      courseList.value = response.data.courses || [];
    }
  } catch (error) {
    console.error('Failed to load course list:', error);
    showSystemAlert('Could not load the course list.', 'warning');
  } finally {
    isLoadingCourses.value = false;
  }
};

const openCourseModal = () => {
  courseForm.value = { id: null, course_code: '', course_name: '', department: '' };
  showCourseModal.value = true;
  fetchCourseList();
};

const editCourse = async (course) => {
  courseForm.value = { id: course.id, course_code: course.course_code, course_name: course.course_name, department: course.department || '' };
  // The form sits above a scrollable course list — without this, clicking Edit on a
  // row further down silently updates the (now off-screen) form with no visible feedback.
  await nextTick();
  courseFormRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  courseCodeInputRef.value?.focus();
};

const resetCourseForm = () => {
  courseForm.value = { id: null, course_code: '', course_name: '', department: '' };
};

const saveCourse = async () => {
  try {
    const payload = {
      course_code: courseForm.value.course_code.trim(),
      course_name: courseForm.value.course_name.trim(),
      department: courseForm.value.department || null
    };
    const url = courseForm.value.id
      ? `/api/admin/courses/update/${courseForm.value.id}`
      : '/api/admin/courses/add';

    const response = await axios.post(url, payload, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      showSystemAlert(courseForm.value.id ? 'Course updated.' : 'Course added.', 'success');
      resetCourseForm();
      fetchCourseList();
      fetchCourseBreakdown();
    }
  } catch (error) {
    showSystemAlert(error.response?.data?.message || 'Failed to save course.', 'error');
  }
};

const toggleCourse = async (course) => {
  try {
    await axios.post(`/api/admin/courses/toggle/${course.id}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    fetchCourseList();
  } catch (error) {
    showSystemAlert(error.response?.data?.message || 'Failed to update course status.', 'error');
  }
};

const deleteCourse = (course) => {
  triggerConfirm(
    'Delete Course?',
    `Permanently delete "${course.course_code} — ${course.course_name}"? This cannot be undone. This is automatically blocked if any student still has this course selected.`,
    async () => {
      try {
        const response = await axios.post(`/api/admin/courses/delete/${course.id}`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data.success) {
          showSystemAlert('Course deleted.', 'success');
          fetchCourseList();
          fetchCourseBreakdown();
        }
      } catch (error) {
        showSystemAlert(error.response?.data?.message || 'Failed to delete course.', 'error');
      }
    }
  );
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

const preventBackNavigation = () => {
  window.history.pushState(null, null, window.location.href);
};

onMounted(() => {
  window.history.pushState(null, null, window.location.href);
  window.addEventListener('popstate', preventBackNavigation);
  fetchDashboardStats();
  fetchCourseBreakdown();
});

onUnmounted(() => {
  window.removeEventListener('popstate', preventBackNavigation);
});
</script>

<template>
  <div class="bg-[#eef6ff] min-h-screen font-sans text-slate-800 flex flex-col">
    <AdminNav />
    <FlashAlert ref="alertRef" />

    <main class="flex-1 max-w-6xl mx-auto w-full py-8 px-4 sm:px-6 text-left">
      <!-- Dashboard Header -->
      <div class="text-center mb-6">
        <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Hello, {{ adminName }}!</p>
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
          <router-link to="/admin/registered" class="cursor-pointer bg-white rounded-2xl p-3.5 sm:p-5 shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden transition hover:shadow-md hover:scale-[1.02] group">
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
          </router-link>

          <!-- Student Residents -->
          <router-link to="/admin/emergency-monitoring" class="cursor-pointer bg-white rounded-2xl p-3.5 sm:p-5 shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden transition hover:shadow-md hover:scale-[1.02] group">
            <div class="w-9 h-9 sm:w-11 sm:h-11 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 mb-2.5 sm:mb-4 transition group-hover:bg-emerald-600 group-hover:text-white shadow-sm flex-shrink-0">
              <i class="fa-solid fa-users text-base sm:text-lg"></i>
            </div>
            <div>
              <p class="text-[9px] sm:text-[10px] text-slate-400 font-black uppercase tracking-wider mb-1 truncate">Active Residents</p>
              <div class="flex items-baseline flex-wrap gap-1 sm:gap-2">
                <p class="text-2xl sm:text-3xl font-black text-slate-900 leading-none">{{ stats.totalStudents || 0 }}</p>
                <span class="text-[8px] sm:text-[9px] font-black text-emerald-500 uppercase tracking-tight">Confirmed Stays</span>
              </div>
            </div>
          </router-link>

          <!-- Occupancy Rate -->
          <router-link to="/admin/registered" class="cursor-pointer bg-white rounded-2xl p-3.5 sm:p-5 shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden transition hover:shadow-md hover:scale-[1.02] group">
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
          </router-link>

          <!-- Pending Applications -->
          <router-link to="/admin/pending-applications" class="cursor-pointer bg-white rounded-2xl p-3.5 sm:p-5 shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden transition hover:shadow-md hover:scale-[1.02] group">
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
          </router-link>
        </div>

        <!-- Top Rated Highlight Card -->
        <router-link to="/admin/registered" class="cursor-pointer bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4 transition hover:shadow-md hover:scale-[1.01] group">
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
        </router-link>

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

        <!-- Residents by Course Breakdown -->
        <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div class="flex items-center justify-between gap-3 mb-4">
            <div class="flex items-center gap-3">
              <div class="w-1 h-5 bg-purple-500 rounded-full"></div>
              <h2 class="text-xs font-black tracking-wider uppercase text-slate-800">Active Residents by Course</h2>
            </div>
            <button @click="openCourseModal" class="text-[9px] font-black uppercase tracking-widest text-purple-600 hover:text-purple-800 transition flex items-center gap-1.5 cursor-pointer">
              <i class="fa-solid fa-gear"></i> Manage Courses
            </button>
          </div>

          <div v-if="courseBreakdown.filter(c => c.resident_count > 0).length === 0" class="py-10 flex items-center justify-center text-slate-400 font-bold uppercase tracking-wider text-xs text-center">
            No active residents matched to a course yet
          </div>
          <template v-else>
            <div class="space-y-2.5">
              <button v-for="c in courseBreakdown.filter(c => c.resident_count > 0)" :key="c.course_code"
                @click="router.push({ path: '/admin/emergency-monitoring', query: { course: c.course_code } })"
                class="w-full flex items-center gap-3 group cursor-pointer text-left"
                :title="`View ${c.resident_count} active resident${c.resident_count === 1 ? '' : 's'} in ${c.course_code}`">
                <span class="text-[10px] font-black text-slate-500 uppercase w-16 shrink-0 group-hover:text-slate-900 transition">{{ c.course_code }}</span>
                <div class="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div class="h-full rounded-full transition-opacity group-hover:opacity-75" :class="deptColor(c.department).bar"
                    :style="{ width: (c.resident_count / Math.max(...courseBreakdown.map(x => x.resident_count), 1) * 100) + '%' }"></div>
                </div>
                <span class="text-xs font-black text-slate-800 w-6 text-right shrink-0">{{ c.resident_count }}</span>
              </button>
            </div>

            <!-- Department color legend -->
            <div class="flex flex-wrap gap-x-4 gap-y-1.5 mt-5 pt-4 border-t border-slate-100">
              <div v-for="dept in DEPARTMENTS" :key="dept" class="flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-full shrink-0" :class="deptColor(dept).bar"></span>
                <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{{ dept }}</span>
              </div>
            </div>
          </template>
        </div>

        <!-- Report Management Section -->
        <div>
          <div class="flex items-center gap-3 mb-4">
            <div class="w-1 h-6 bg-[#2a528a] rounded-full"></div>
            <h2 class="text-base font-black text-slate-800 uppercase tracking-wider">Report Management</h2>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <!-- Accredited Masterlist -->
            <router-link to="/admin/reports/masterlist" class="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 group transition hover:-translate-y-1 hover:shadow-md flex flex-col cursor-pointer">
              <div class="flex justify-between items-start mb-4">
                <div class="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 group-hover:bg-[#2a528a] group-hover:text-white transition-colors">
                  <i class="fa-solid fa-file-contract text-lg"></i>
                </div>
                <span class="text-[9px] font-black text-slate-300 uppercase tracking-wider">Institutional</span>
              </div>
              <h3 class="text-base font-black text-slate-800 uppercase mb-2">Accredited Masterlist</h3>
              <p class="text-xs font-medium text-slate-500 mb-6 leading-relaxed flex-grow">Generate an official list of all boarding houses currently accredited by SASO.</p>
              <div class="text-blue-600 font-bold text-xs uppercase tracking-wider flex items-center gap-2 group-hover:gap-3 transition-all">
                Generate Report <i class="fa-solid fa-arrow-right"></i>
              </div>
            </router-link>

            <!-- Emergency Student Registry -->
            <router-link to="/admin/emergency-monitoring" class="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 group transition hover:-translate-y-1 hover:shadow-md flex flex-col cursor-pointer">
              <div class="flex justify-between items-start mb-4">
                <div class="w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center text-red-600 group-hover:bg-red-600 group-hover:text-white transition-colors">
                  <i class="fa-solid fa-house-medical text-lg"></i>
                </div>
                <span class="text-[9px] font-black text-slate-300 uppercase tracking-wider">Safety Module</span>
              </div>
              <h3 class="text-base font-black text-slate-800 uppercase mb-2">Emergency Student Registry</h3>
              <p class="text-xs font-medium text-slate-500 mb-6 leading-relaxed flex-grow">Export student residency lists filtered by geographic risk areas (Monitoring Page).</p>
              <div class="text-red-600 font-bold text-xs uppercase tracking-wider flex items-center gap-2 group-hover:gap-3 transition-all">
                Open Monitoring <i class="fa-solid fa-arrow-right"></i>
              </div>
            </router-link>

            <!-- Accreditation & Expiry -->
            <router-link to="/admin/reports/compliance" class="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 group transition hover:-translate-y-1 hover:shadow-md flex flex-col cursor-pointer">
              <div class="flex justify-between items-start mb-4">
                <div class="w-11 h-11 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                  <i class="fa-solid fa-file-invoice text-lg"></i>
                </div>
                <span class="text-[9px] font-black text-slate-300 uppercase tracking-wider">Compliance</span>
              </div>
              <h3 class="text-base font-black text-slate-800 uppercase mb-2">Accreditation & Expiry</h3>
              <p class="text-xs font-medium text-slate-500 mb-6 leading-relaxed flex-grow">Monitor legal document statuses and expiry dates for compliance reports.</p>
              <div class="text-orange-600 font-bold text-xs uppercase tracking-wider flex items-center gap-2 group-hover:gap-3 transition-all">
                Generate Report <i class="fa-solid fa-arrow-right"></i>
              </div>
            </router-link>
          </div>
        </div>
      </div>
    </main>

    <!-- Manage Courses Modal -->
    <div v-if="showCourseModal" class="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 text-left animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        <div class="bg-slate-900 text-white px-8 py-6 flex justify-between items-center shrink-0">
          <div>
            <h3 class="font-black text-xl uppercase tracking-tight">Manage Courses</h3>
            <p class="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">Drives the student profile dropdown &amp; course reports</p>
          </div>
          <button @click="showCourseModal = false" class="text-white hover:text-slate-300 transition h-10 w-10 rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer">
            <i class="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <div class="p-8 overflow-y-auto" ref="courseFormRef">
          <!-- Editing indicator — makes it obvious the form above just got populated -->
          <div v-if="courseForm.id" class="mb-3 flex items-center gap-2 bg-purple-50 border border-purple-100 text-purple-700 text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl">
            <i class="fa-solid fa-pen-to-square"></i> Editing "{{ courseForm.course_code }}" — update the fields below and Save
          </div>

          <!-- Add / Edit Form -->
          <form @submit.prevent="saveCourse" class="flex flex-col sm:flex-row gap-3 mb-6 pb-6 border-b border-slate-100">
            <input ref="courseCodeInputRef" v-model="courseForm.course_code" type="text" placeholder="Code (e.g. BSIT)" required
              class="w-full sm:w-32 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-purple-500 focus:bg-white transition" />
            <input v-model="courseForm.course_name" type="text" placeholder="Full name (e.g. BS Information Technology)" required
              class="w-full flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-purple-500 focus:bg-white transition" />
            <select v-model="courseForm.department"
              class="w-full sm:w-32 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-purple-500 focus:bg-white transition appearance-none">
              <option value="">No Dept.</option>
              <option v-for="dept in DEPARTMENTS" :key="dept" :value="dept">{{ dept }}</option>
            </select>
            <div class="flex gap-2 shrink-0">
              <button type="submit" class="bg-purple-600 hover:bg-purple-700 text-white px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition active:scale-95 cursor-pointer">
                {{ courseForm.id ? 'Save' : 'Add' }}
              </button>
              <button v-if="courseForm.id" type="button" @click="resetCourseForm" class="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition cursor-pointer">
                Cancel
              </button>
            </div>
          </form>

          <!-- Course List -->
          <div v-if="isLoadingCourses" class="py-10 flex justify-center">
            <div class="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <div v-else class="space-y-2">
            <div v-for="c in courseList" :key="c.id" class="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-100 hover:bg-slate-50/60 transition"
              :class="{ 'opacity-50': !c.is_active }">
              <div class="min-w-0 flex items-center flex-wrap gap-x-2 gap-y-1">
                <span class="font-black text-slate-900 uppercase text-sm">{{ c.course_code }}</span>
                <span class="text-slate-500 text-xs font-semibold truncate">{{ c.course_name }}</span>
                <span v-if="c.department" class="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border" :class="deptColor(c.department).badge">{{ c.department }}</span>
                <span v-if="!c.is_active" class="text-[8px] font-black uppercase tracking-widest text-rose-500 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-md">Inactive</span>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button @click="editCourse(c)" class="w-8 h-8 flex items-center justify-center border border-slate-200 bg-white hover:bg-blue-500 hover:text-white rounded-lg transition cursor-pointer" title="Edit">
                  <i class="fa-solid fa-pen-to-square text-xs"></i>
                </button>
                <button @click="toggleCourse(c)" class="w-8 h-8 flex items-center justify-center border border-slate-200 bg-white hover:bg-rose-500 hover:text-white rounded-lg transition cursor-pointer" :title="c.is_active ? 'Deactivate' : 'Activate'">
                  <i class="fa-solid" :class="c.is_active ? 'fa-toggle-on' : 'fa-toggle-off'"></i>
                </button>
                <button @click="deleteCourse(c)" class="w-8 h-8 flex items-center justify-center border border-slate-200 bg-white hover:bg-red-600 hover:text-white rounded-lg transition cursor-pointer" title="Delete permanently">
                  <i class="fa-solid fa-trash text-xs"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Custom Confirmation Modal (consistent with the rest of the admin UI) -->
    <div v-if="showConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div class="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full text-center border border-slate-100 animate-in zoom-in-95 duration-200">
        <div class="text-[#2a528a] mb-4 flex justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 class="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">{{ confirmTitle }}</h3>
        <p class="text-slate-500 text-xs font-medium mb-6 leading-relaxed">{{ confirmMessage }}</p>

        <div class="flex gap-3">
          <button @click="executeConfirm" class="flex-1 bg-blue-600 hover:bg-black text-white text-[10px] font-black py-3.5 rounded-xl uppercase tracking-widest transition active:scale-95 cursor-pointer">
            Confirm
          </button>
          <button @click="showConfirmModal = false" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black py-3.5 rounded-xl uppercase tracking-widest transition active:scale-95 cursor-pointer">
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>