<script setup>
import LoadError from '../../components/management/LoadError.vue';
import '../../styles/management.css';
import '../../styles/admin-theme.css';
import { vManagementDialog } from '../../components/management/dialogAccessibility.js';
import { validateInput } from '../../utils/inputValidation.js';
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
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
const showAllCourses = ref(false);
const COURSE_PREVIEW_COUNT = 6;

// Institution-wide male/female totals for the residency chart's legend
// (SDG 5 — Gender Equality reporting).
const genderTotals = computed(() => {
  const houses = stats.value.houses || [];
  return houses.reduce((acc, h) => {
    acc.male += parseInt(h.male_count) || 0;
    acc.female += parseInt(h.female_count) || 0;
    return acc;
  }, { male: 0, female: 0 });
});

// Already ordered resident_count DESC by the backend query.
const coursesWithResidents = computed(() => courseBreakdown.value.filter(c => c.resident_count > 0));
const displayedCourses = computed(() =>
  showAllCourses.value ? coursesWithResidents.value : coursesWithResidents.value.slice(0, COURSE_PREVIEW_COUNT)
);
const maxCourseResidentCount = computed(() =>
  Math.max(...coursesWithResidents.value.map(c => c.resident_count), 1)
);
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
// Fixed categorical order (validated for colour-vision deficiency); a department keeps its hue everywhere.
const DEPARTMENT_COLORS = {
  CCS: '#FFD000',
  CHS: '#A855F7',
  CEA: '#9CA3AF',
  CAS: '#FF2D2D',
  CTHBM: '#16D94F',
  CTDE: '#2F80FF'
};
const DEFAULT_DEPT_COLOR = '#CBD5E1';
const deptColor = (dept) => DEPARTMENT_COLORS[dept] || DEFAULT_DEPT_COLOR;

// Chart styling shared by both canvases (presentation only).
const CHART_FONT = "'Plus Jakarta Sans', ui-sans-serif, system-ui, 'Segoe UI', Arial, sans-serif";
const SERIES_PRIMARY = '#3B82F6';
const SERIES_MALE = '#3B82F6';
const SERIES_FEMALE = '#EC4899';
const INK = '#33475F';
const INK_MUTED = '#8597AD';
const GRID = '#EDF2F8';
const tooltipStyle = {
  backgroundColor: '#142B4A',
  titleColor: '#FFFFFF',
  bodyColor: '#DCE6F4',
  titleFont: { family: CHART_FONT, weight: '600', size: 12 },
  bodyFont: { family: CHART_FONT, weight: '500', size: 12 },
  padding: 10,
  cornerRadius: 10,
  boxPadding: 4,
  usePointStyle: true
};

const genderTotalCount = computed(() => genderTotals.value.male + genderTotals.value.female);
const genderShare = (count) => genderTotalCount.value > 0 ? Math.round((count / genderTotalCount.value) * 100) : 0;

// Summary figures derived from the six-month series the API already returns.
const trendSummary = computed(() => {
  const trends = stats.value.trends || [];
  const total = trends.reduce((sum, t) => sum + (parseInt(t.booking_count) || 0), 0);
  let peak = null;
  trends.forEach(t => {
    const count = parseInt(t.booking_count) || 0;
    if (count > 0 && (!peak || count > peak.count)) peak = { month: t.month, count };
  });
  return { total, peak };
});

// Bar chart height follows the number of properties instead of a fixed 320px box.
const residencyChartHeight = computed(() => Math.max(180, (stats.value.houses || []).length * 34 + 40));

// Occupancy ring geometry (r = 18).
const RING_CIRCUMFERENCE = 2 * Math.PI * 18;
const occupancyDash = computed(() => {
  const pct = Math.min(100, Math.max(0, Number(stats.value.occupancyRate) || 0));
  return `${(pct / 100) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`;
});

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
  const inputError = validateInput('course', courseForm.value);
  if (inputError) { showSystemAlert(inputError, 'error'); return; }
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
  loadError.value = '';
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
    loadError.value = 'The server did not return these records. Refresh the page to try again.';
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

  // A. Student Residency Bar Chart — stacked by sex (SDG 5 / Gender Equality
  // reporting), so each house's bar shows its actual male/female composition
  // rather than one undifferentiated total. The backend already orders houses by
  // resident count, so the busiest property is listed first (top of the chart).
  if (residencyCanvas.value && rawHouses.length > 0) {
    const barLabels = rawHouses.map(h => h.name);
    const maleData = rawHouses.map(h => parseInt(h.male_count) || 0);
    const femaleData = rawHouses.map(h => parseInt(h.female_count) || 0);
    const totalAt = (i) => maleData[i] + femaleData[i];

    if (residencyChart) residencyChart.destroy();

    residencyChart = new Chart(residencyCanvas.value.getContext('2d'), {
      type: 'bar',
      plugins: [ChartDataLabels],
      data: {
        labels: barLabels,
        datasets: [
          {
            label: 'Male',
            data: maleData,
            backgroundColor: SERIES_MALE,
            hoverBackgroundColor: '#2563EB',
            // 2px surface-coloured gap between the stacked segments.
            borderColor: '#FFFFFF',
            borderWidth: { right: 2 },
            borderSkipped: false,
            borderRadius: 0,
            barThickness: 16,
            stack: 'residents'
          },
          {
            label: 'Female',
            data: femaleData,
            backgroundColor: SERIES_FEMALE,
            hoverBackgroundColor: '#DB2777',
            borderRadius: { topRight: 6, bottomRight: 6 },
            borderSkipped: false,
            barThickness: 16,
            stack: 'residents'
          }
        ]
      },
      options: {
        indexAxis: 'y',
        maintainAspectRatio: false,
        layout: { padding: { right: 32 } },
        interaction: { mode: 'index', axis: 'y', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle,
            callbacks: {
              footer: (items) => `Total: ${totalAt(items[0].dataIndex)} residents`
            },
            footerFont: { family: CHART_FONT, weight: '600', size: 12 },
            footerColor: '#FFFFFF'
          },
          // One label per bar: the total at the bar end (segment values live in the tooltip).
          datalabels: {
            display: (ctx) => ctx.datasetIndex === 1 && totalAt(ctx.dataIndex) > 0,
            anchor: 'end',
            align: 'end',
            offset: 6,
            clamp: true,
            color: INK,
            font: { family: CHART_FONT, weight: '600', size: 12 },
            formatter: (value, ctx) => totalAt(ctx.dataIndex)
          }
        },
        scales: {
          x: {
            stacked: true,
            beginAtZero: true,
            grid: { color: GRID },
            border: { display: false },
            ticks: { font: { family: CHART_FONT, size: 11 }, color: INK_MUTED, precision: 0 }
          },
          y: {
            stacked: true,
            grid: { display: false },
            border: { display: false },
            ticks: {
              font: { family: CHART_FONT, weight: '500', size: 12 },
              color: INK,
              callback: function (value) {
                const label = this.getLabelForValue(value);
                // Phones leave less room for the name column; the tooltip still shows the full name.
                const max = this.chart.width < 480 ? 14 : 24;
                return label.length > max ? label.slice(0, max - 1) + '…' : label;
              }
            }
          }
        }
      }
    });
  }

  // B. Booking Trend Line Chart (Only render if trend data is on record)
  if (trendCanvas.value && rawTrends.length > 0) {
    const lineLabels = rawTrends.map(t => t.month);
    const lineData = rawTrends.map(t => t.booking_count);

    // Emphasis: the busiest month is solid navy, the rest a light tint. Only the
    // peak and the latest month carry a value label; the tooltip covers the rest.
    const numeric = lineData.map(v => parseInt(v) || 0);
    const maxValue = Math.max(...numeric);
    const peakIndex = maxValue > 0 ? numeric.indexOf(maxValue) : -1;
    const lastIndex = numeric.length - 1;
    const isLabelled = (i) => (i === peakIndex || i === lastIndex) && numeric[i] > 0;

    if (trendChart) trendChart.destroy();

    trendChart = new Chart(trendCanvas.value.getContext('2d'), {
      type: 'bar',
      plugins: [ChartDataLabels],
      data: {
        labels: lineLabels,
        datasets: [{
          label: 'Bookings',
          data: lineData,
          backgroundColor: numeric.map((_, i) => (i === peakIndex ? SERIES_PRIMARY : '#93C5FD')),
          hoverBackgroundColor: numeric.map((_, i) => (i === peakIndex ? '#2563EB' : '#60A5FA')),
          borderRadius: { topLeft: 6, topRight: 6 },
          borderSkipped: false,
          maxBarThickness: 24,
          categoryPercentage: 0.7
        }]
      },
      options: {
        maintainAspectRatio: false,
        layout: { padding: { top: 22, left: 2, right: 6 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle,
            displayColors: false,
            callbacks: { label: (ctx) => `${ctx.parsed.y} booking${ctx.parsed.y === 1 ? '' : 's'}` }
          },
          datalabels: {
            display: (ctx) => isLabelled(ctx.dataIndex),
            anchor: 'end',
            align: 'end',
            offset: 2,
            color: '#142B4A',
            font: { family: CHART_FONT, weight: '700', size: 12 },
            formatter: (value) => value
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { font: { family: CHART_FONT, weight: '500', size: 12 }, color: INK }
          },
          y: {
            beginAtZero: true,
            grid: { color: GRID },
            border: { display: false },
            ticks: { font: { family: CHART_FONT, size: 11 }, color: INK_MUTED, precision: 0, maxTicksLimit: 5 }
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

const loadError = ref('');
</script>

<template>
  <div class="admin-shell">
    <AdminNav />
    <div aria-live="polite" aria-atomic="false"><FlashAlert ref="alertRef" /></div>

    <main id="management-content" tabindex="-1">
      <LoadError :message="loadError" />

      <header class="admin-page-head no-print">
        <div>
          <h1>Welcome back, {{ adminName }}</h1>
        </div>
      </header>

      <!-- Loading skeleton (keeps the final layout so nothing jumps when data arrives) -->
      <div v-if="isLoading" aria-busy="true" aria-label="Loading dashboard statistics">
        <div class="admin-kpis">
          <div v-for="n in 4" :key="n" class="admin-skeleton" style="height: 112px;"></div>
        </div>
        <div class="admin-grid admin-grid-main">
          <div class="admin-skeleton" style="height: 420px;"></div>
          <div class="admin-skeleton" style="height: 420px;"></div>
        </div>
      </div>

      <div v-else class="space-y-5">
        <!-- KPI tiles -->
        <section class="admin-kpis" style="margin-bottom: 0;" aria-label="Key figures">
          <router-link to="/admin/registered" class="admin-kpi">
            <div class="admin-kpi-top">
              <span class="admin-kpi-icon" aria-hidden="true"><i class="fa-solid fa-building-circle-check"></i></span>
              <span class="admin-kpi-arrow" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></span>
            </div>
            <div>
              <p class="admin-kpi-label">Accredited properties</p>
              <p class="admin-kpi-value">{{ stats.totalHouses || 0 }}</p>
              <p class="admin-kpi-note">Currently accredited boarding houses</p>
            </div>
          </router-link>

          <router-link to="/admin/emergency-monitoring" class="admin-kpi">
            <div class="admin-kpi-top">
              <span class="admin-kpi-icon" aria-hidden="true"><i class="fa-solid fa-user-graduate"></i></span>
              <span class="admin-kpi-arrow" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></span>
            </div>
            <div>
              <p class="admin-kpi-label">CSPC student residents</p>
              <p class="admin-kpi-value">{{ stats.totalStudents || 0 }}</p>
              <p class="admin-kpi-note">Active residents in accredited properties</p>
            </div>
          </router-link>

          <router-link to="/admin/registered" class="admin-kpi">
            <div class="admin-kpi-top">
              <svg class="admin-ring" viewBox="0 0 44 44" aria-hidden="true">
                <circle class="track" cx="22" cy="22" r="18" />
                <circle class="fill" cx="22" cy="22" r="18" :stroke-dasharray="occupancyDash" />
              </svg>
              <span class="admin-kpi-arrow" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></span>
            </div>
            <div>
              <p class="admin-kpi-label">Occupancy rate</p>
              <p class="admin-kpi-value">{{ stats.occupancyRate || 0 }}%</p>
              <p class="admin-kpi-note">Active occupants against accredited room capacity</p>
            </div>
          </router-link>

          <router-link to="/admin/pending-applications" class="admin-kpi">
            <div class="admin-kpi-top">
              <span class="admin-kpi-icon" :class="{ 'is-warm': stats.pendingApps > 0 }" aria-hidden="true"><i class="fa-solid fa-clipboard-list"></i></span>
              <span v-if="stats.pendingApps > 0" class="admin-badge is-warning"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>Needs review</span>
              <span v-else class="admin-badge is-success"><i class="fa-solid fa-circle-check" aria-hidden="true"></i>Queue clear</span>
            </div>
            <div>
              <p class="admin-kpi-label">Awaiting review</p>
              <p class="admin-kpi-value">{{ stats.pendingApps || 0 }}</p>
              <p class="admin-kpi-note">Applications and pending document updates</p>
            </div>
          </router-link>
        </section>

        <!-- Residency + booking activity -->
        <div class="admin-grid admin-grid-main">
          <section class="admin-card" aria-labelledby="residency-title">
            <div class="admin-card-head">
              <div>
                <h2 id="residency-title">Student residency by property</h2>
                <p>Accredited properties ranked by active CSPC residents, split by sex</p>
              </div>
              <span class="admin-badge is-neutral">Top 10</span>
            </div>

            <template v-if="stats.houses && stats.houses.length > 0">
              <div v-if="genderTotalCount > 0" class="admin-split-summary">
                <div class="admin-split" role="img" :aria-label="`Male ${genderTotals.male} (${genderShare(genderTotals.male)}%), female ${genderTotals.female} (${genderShare(genderTotals.female)}%)`">
                  <span :style="{ width: genderShare(genderTotals.male) + '%', background: SERIES_MALE }"></span>
                  <span :style="{ width: genderShare(genderTotals.female) + '%', background: SERIES_FEMALE }"></span>
                </div>
                <div class="admin-legend">
                  <span><i class="admin-swatch" :style="{ background: SERIES_MALE }"></i>Male <strong>{{ genderTotals.male }}</strong> · {{ genderShare(genderTotals.male) }}%</span>
                  <span><i class="admin-swatch" :style="{ background: SERIES_FEMALE }"></i>Female <strong>{{ genderTotals.female }}</strong> · {{ genderShare(genderTotals.female) }}%</span>
                  <span class="text-[12px]" style="color: var(--a-muted); margin-left: auto;">Totals for the properties shown</span>
                </div>
              </div>
            </template>

            <div class="admin-chart" :style="{ height: (stats.houses && stats.houses.length > 0 ? residencyChartHeight : 220) + 'px' }">
              <div v-if="!stats.houses || stats.houses.length === 0" class="admin-empty">
                <i class="fa-solid fa-chart-bar" aria-hidden="true"></i>
                No active boarding house statistics available
              </div>
              <canvas v-else ref="residencyCanvas" id="boardingHouseChart" role="img" aria-label="Active CSPC residents by property and sex. The legend shows totals for the displayed properties."></canvas>
            </div>
          </section>

          <div class="admin-stack">
            <section class="admin-card" aria-labelledby="bookings-title">
              <div class="admin-card-head" style="margin-bottom: 10px;">
                <div>
                  <h2 id="bookings-title">Booking activity</h2>
                  <p>Reservations made per month, system-wide</p>
                </div>
                <span class="admin-badge is-neutral">Last 6 months</span>
              </div>
              <div v-if="stats.trends && stats.trends.length > 0" class="admin-stat-inline">
                <div><small>Total bookings</small><strong>{{ trendSummary.total }}</strong></div>
                <div v-if="trendSummary.peak"><small>Busiest month</small><strong>{{ trendSummary.peak.month }} · {{ trendSummary.peak.count }}</strong></div>
              </div>
              <div class="admin-chart" style="height: 220px;">
                <div v-if="!stats.trends || stats.trends.length === 0" class="admin-empty">
                  <i class="fa-solid fa-chart-line" aria-hidden="true"></i>
                  No booking activity records available
                </div>
                <canvas v-else ref="trendCanvas" id="bookingTrendChart" role="img" aria-label="System-wide monthly booking counts over the last six months."></canvas>
              </div>
            </section>

            <router-link to="/admin/registered" class="admin-card admin-feature" style="text-decoration: none;" aria-label="Top-rated boarding house, view registered properties">
              <span class="admin-feature-icon" aria-hidden="true"><i class="fa-solid fa-award"></i></span>
              <div class="min-w-0">
                <p>Top-rated boarding house</p>
                <h3>{{ stats.mostRated || 'N/A' }}</h3>
                <p class="mt-1">Highest average student review among accredited properties</p>
              </div>
            </router-link>
          </div>
        </div>

        <!-- Courses + reports -->
        <div class="admin-grid admin-grid-main">
          <section class="admin-card" aria-labelledby="courses-title">
            <div class="admin-card-head">
              <div>
                <h2 id="courses-title">Active residents by course</h2>
                <p>Select a course to open its residents in the emergency registry residence</p>
              </div>
              <button type="button" @click="openCourseModal" class="admin-btn admin-btn-secondary">
                <i class="fa-solid fa-sliders" aria-hidden="true"></i> Manage courses
              </button>
            </div>

            <div v-if="coursesWithResidents.length === 0" class="admin-empty">
              <i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
              No active residents matched to a course yet
            </div>
            <template v-else>
              <div class="admin-course-list" :class="{ 'max-h-80 overflow-y-auto pr-1': showAllCourses }">
                <button v-for="c in displayedCourses" :key="c.course_code" type="button"
                  @click="router.push({ path: '/admin/emergency-monitoring', query: { course: c.course_code } })"
                  class="admin-course-row"
                  :title="`View ${c.resident_count} active resident${c.resident_count === 1 ? '' : 's'} in ${c.course_code}`">
                  <span class="admin-course-code"><strong>{{ c.course_code }}</strong><small>{{ c.department || 'No dept.' }}</small></span>
                  <span class="admin-course-track"><span :style="{ width: (c.resident_count / maxCourseResidentCount * 100) + '%', background: deptColor(c.department) }"></span></span>
                  <span class="admin-course-value">{{ c.resident_count }}</span>
                </button>
              </div>

              <div class="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4" style="border-top: 1px solid var(--a-track);">
                <div class="admin-legend" aria-label="Department colours">
                  <span v-for="dept in DEPARTMENTS" :key="dept"><i class="admin-swatch" :style="{ background: deptColor(dept) }"></i>{{ dept }}</span>
                </div>
                <button v-if="coursesWithResidents.length > COURSE_PREVIEW_COUNT" type="button" @click="showAllCourses = !showAllCourses" class="admin-link">
                  {{ showAllCourses ? 'Show fewer' : `Show all ${coursesWithResidents.length} courses` }}
                  <i class="fa-solid text-[11px]" :class="showAllCourses ? 'fa-chevron-up' : 'fa-chevron-down'" aria-hidden="true"></i>
                </button>
              </div>
            </template>
          </section>

          <section class="admin-card" aria-labelledby="reports-title">
            <div class="admin-card-head">
              <div>
                <h2 id="reports-title">Reports &amp; registries</h2>
                <p>Printable institutional records</p>
              </div>
            </div>
            <nav class="admin-links" aria-labelledby="reports-title">
              <router-link to="/admin/reports/masterlist">
                <span class="admin-link-icon" aria-hidden="true"><i class="fa-solid fa-file-contract"></i></span>
                <span><strong>Accredited masterlist</strong><small>Official list of SASO-accredited boarding houses</small></span>
                <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
              </router-link>
              <router-link to="/admin/reports/compliance">
                <span class="admin-link-icon" aria-hidden="true"><i class="fa-solid fa-file-circle-check"></i></span>
                <span><strong>Compliance &amp; expiry</strong><small>Legal document status and permit expiry dates</small></span>
                <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
              </router-link>
              <router-link to="/admin/emergency-monitoring">
                <span class="admin-link-icon" aria-hidden="true"><i class="fa-solid fa-house-medical"></i></span>
                <span><strong>Emergency registry residence</strong><small>Residents and emergency contacts by area</small></span>
                <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
              </router-link>
            </nav>
          </section>
        </div>
      </div>
    </main>

    <!-- Manage Courses Modal -->
    <div v-management-dialog="{ close: () => showCourseModal = false }" v-if="showCourseModal" class="admin-dialog-backdrop z-[100]">
      <div class="admin-dialog max-w-2xl">
        <div class="admin-dialog-head">
          <div>
            <h3>Manage courses</h3>
            <p>Courses populate the student profile dropdown and course reports.</p>
          </div>
          <button type="button" aria-label="Close dialog" @click="showCourseModal = false" class="admin-icon-btn">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        <div class="admin-dialog-body" ref="courseFormRef">
          <!-- Editing indicator — makes it obvious the form above just got populated -->
          <div v-if="courseForm.id" class="admin-notice">
            <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Editing “{{ courseForm.course_code }}”. Update the fields and select Save.
          </div>

          <!-- Add / Edit Form -->
          <form @submit.prevent="saveCourse" class="flex flex-col sm:flex-row gap-3 mb-5 pb-5" style="border-bottom: 1px solid var(--a-border);">
            <input aria-label="Code (e.g. BSIT)" ref="courseCodeInputRef" v-model="courseForm.course_code" type="text" placeholder="Code (e.g. BSIT)" required
              class="admin-field sm:w-32" />
            <input aria-label="Full name (e.g. BS Information Technology)" v-model="courseForm.course_name" type="text" placeholder="Full name (e.g. BS Information Technology)" required
              class="admin-field flex-1" />
            <select aria-label="department" v-model="courseForm.department" class="admin-field sm:w-32">
              <option value="">No dept.</option>
              <option v-for="dept in DEPARTMENTS" :key="dept" :value="dept">{{ dept }}</option>
            </select>
            <div class="flex gap-2 shrink-0">
              <button type="submit" :class="['admin-btn', courseForm.id ? 'admin-btn-primary' : 'admin-btn-success']">
                <i v-if="!courseForm.id" class="fa-solid fa-plus" aria-hidden="true"></i>{{ courseForm.id ? 'Save' : 'Add' }}
              </button>
              <button v-if="courseForm.id" type="button" @click="resetCourseForm" class="admin-btn admin-btn-ghost">
                Cancel
              </button>
            </div>
          </form>

          <!-- Course List -->
          <div v-if="isLoadingCourses" class="py-10 flex justify-center">
            <div class="admin-spinner" role="status" aria-label="Loading courses"></div>
          </div>
          <div v-else class="space-y-2">
            <div v-for="c in courseList" :key="c.id" class="admin-row-item" :class="{ 'is-inactive': !c.is_active }">
              <div class="min-w-0 flex items-center flex-wrap gap-x-2.5 gap-y-1">
                <span class="admin-row-title">{{ c.course_code }}</span>
                <span class="admin-row-sub truncate">{{ c.course_name }}</span>
                <span v-if="c.department" class="admin-badge is-neutral"><i class="admin-swatch" :style="{ background: deptColor(c.department) }"></i>{{ c.department }}</span>
                <span v-if="!c.is_active" class="admin-badge is-warning">Inactive</span>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button type="button" aria-label="Edit" @click="editCourse(c)" class="admin-icon-btn is-edit" title="Edit">
                  <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
                </button>
                <button type="button" aria-label="toggle Course" @click="toggleCourse(c)" class="admin-icon-btn" :title="c.is_active ? 'Deactivate' : 'Activate'">
                  <i class="fa-solid" :class="c.is_active ? 'fa-toggle-on' : 'fa-toggle-off'" aria-hidden="true"></i>
                </button>
                <button type="button" aria-label="Delete permanently" @click="deleteCourse(c)" class="admin-icon-btn is-danger" title="Delete permanently">
                  <i class="fa-solid fa-trash" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Custom Confirmation Modal (consistent with the rest of the admin UI) -->
    <div v-management-dialog="{ close: () => showConfirmModal = false }" v-if="showConfirmModal" class="admin-dialog-backdrop z-[250]">
      <div class="admin-dialog max-w-sm" style="padding: 28px; text-align: center;">
        <div class="admin-confirm-icon" aria-hidden="true"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <h3 class="text-lg font-bold mb-2" style="color: var(--a-heading);">{{ confirmTitle }}</h3>
        <p class="text-[13px] leading-relaxed mb-6" style="color: var(--a-muted);">{{ confirmMessage }}</p>
        <div class="flex gap-3">
          <button type="button" @click="showConfirmModal = false" class="admin-btn admin-btn-secondary flex-1">
            Cancel
          </button>
          <button type="button" @click="executeConfirm" class="admin-btn admin-btn-danger flex-1">
            Confirm
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Brighter progress lines */
.admin-ring .fill { stroke: #3B82F6; }
.admin-ring .track { stroke: #DBEAFE; }
.admin-course-track { height: 10px; background: #E2E8F0; }

/* Top-rated card: bright orange badge */
.admin-feature-icon { background: #ff9f0a !important; color: #fff !important; }
.admin-course-track { height: 12px; }
</style>
