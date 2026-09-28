<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import OwnerNav from '../../components/partials/OwnerNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';

const route = useRoute();

const bookings = ref([]);
const houseName = ref('');
const houseId = ref(route.query.houseId || '');
const searchQuery = ref('');
const statusFilter = ref('all');
const isLoading = ref(true);
const reportDate = ref(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));

// Datatable Pagination State
const currentPage = ref(1);
const itemsPerPage = ref(10);

const alertRef = ref(null);
const token = sessionStorage.getItem('cspc_token');
const API = import.meta.env.VITE_API_URL;

// Reset to page 1 whenever user types in search query or changes status filter
watch([searchQuery, statusFilter], () => {
  currentPage.value = 1;
});

// Modal States
const showModal = ref(false);
const modalTitle = ref('');
const modalText = ref('');
const modalConfirmAction = ref(null);
const modalType = ref('info');

const showSystemAlert = (message, type = 'error') => {
  if (alertRef.value) {
    alertRef.value.showSystemAlert(message, type);
  }
};

const triggerConfirmModal = (title, text, type, confirmAction) => {
  modalTitle.value = title;
  modalText.value = text;
  modalType.value = type;
  modalConfirmAction.value = confirmAction;
  showModal.value = true;
};

const executeConfirm = async () => {
  showModal.value = false;
  if (modalConfirmAction.value) {
    await modalConfirmAction.value();
  }
};

const fetchBookings = async () => {
  try {
    isLoading.value = true;
    let url = `/api/owner/bookings`;
    if (houseId.value) {
      url += `?houseId=${houseId.value}`;
    }

    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      bookings.value = response.data.bookings || [];
      houseName.value = response.data.houseName || '';
    }
  } catch (error) {
    console.error('Failed to load bookings:', error);
    showSystemAlert('Could not fetch bookings list.', 'warning');
  } finally {
    isLoading.value = false;
  }
};

const filteredBookings = computed(() => {
  let list = bookings.value;

  if (statusFilter.value && statusFilter.value !== 'all') {
    list = list.filter(b => (b.status || '').toLowerCase() === statusFilter.value.toLowerCase());
  }

  if (!searchQuery.value || !searchQuery.value.trim()) return list;

  const q = searchQuery.value.toLowerCase().trim();
  return list.filter(b =>
    (b.student_name || '').toLowerCase().includes(q) ||
    (b.room_number != null ? b.room_number.toString() : '').includes(q) ||
    (b.id != null ? `ref-${b.id.toString().padStart(4, '0')}` : '').toLowerCase().includes(q) ||
    (b.id != null ? b.id.toString() : '').includes(q) ||
    (b.address || '').toLowerCase().includes(q) ||
    (b.contact_number || '').toLowerCase().includes(q) ||
    (b.emergency_contact || '').toLowerCase().includes(q) ||
    (b.guardian_name || '').toLowerCase().includes(q) ||
    (b.status || '').toLowerCase().includes(q) ||
    (b.payment_status || '').toLowerCase().includes(q) ||
    (b.payment_method || '').toLowerCase().includes(q)
  );
});

// Paginated Slice of Filtered Bookings
const paginatedBookings = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  return filteredBookings.value.slice(start, start + itemsPerPage.value);
});

const totalPages = computed(() => {
  return Math.ceil(filteredBookings.value.length / itemsPerPage.value) || 1;
});

const prevPage = () => {
  if (currentPage.value > 1) currentPage.value--;
};

const nextPage = () => {
  if (currentPage.value < totalPages.value) currentPage.value++;
};

const groupedHouses = computed(() => {
  const list = [];
  paginatedBookings.value.forEach(b => {
    if (!list.includes(b.house_name)) {
      list.push(b.house_name);
    }
  });
  return list;
});

// Print view uses ALL filtered bookings (not paginated)
const allGroupedHouses = computed(() => {
  const list = [];
  filteredBookings.value.forEach(b => {
    if (!list.includes(b.house_name)) {
      list.push(b.house_name);
    }
  });
  return list;
});

const getHouseBookings = (houseName) => {
  return paginatedBookings.value.filter(b => b.house_name === houseName);
};

const getAllHouseBookings = (houseName) => {
  return filteredBookings.value.filter(b => b.house_name === houseName);
};

const handleApprove = (booking) => {
  triggerConfirmModal(
    'Approve Booking?',
    `Confirm this reservation for ${booking.student_name}? The student will be notified.`,
    'success',
    async () => {
      try {
        const response = await axios.post(`/api/owner/bookings/approve/${booking.id}`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data.success) {
          showSystemAlert('Booking confirmed and student notified!', 'success');
          fetchBookings();
        }
      } catch (error) {
        showSystemAlert(error.response?.data?.message || 'Approval failed.', 'error');
      }
    }
  );
};

const handleReject = (booking) => {
  triggerConfirmModal(
    'Reject Booking?',
    `Are you sure you want to reject reservation request REF-${booking.id}?`,
    'warning',
    async () => {
      try {
        const response = await axios.post(`/api/owner/bookings/reject/${booking.id}`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data.success) {
          showSystemAlert('Booking has been rejected.', 'info');
          fetchBookings();
        }
      } catch (error) {
        showSystemAlert('Rejection failed.', 'error');
      }
    }
  );
};

const handleApproveExtension = (booking) => {
  triggerConfirmModal(
    'Approve Stay Extension?',
    `Approve extension request for +${booking.extension_months} Month${booking.extension_months > 1 ? 's' : ''}?`,
    'success',
    async () => {
      try {
        const response = await axios.post(`/api/owner/bookings/approve-extension/${booking.id}`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data.success) {
          showSystemAlert('Stay extension approved!', 'success');
          fetchBookings();
        }
      } catch (error) {
        showSystemAlert('Failed to approve extension.', 'error');
      }
    }
  );
};

const handleRejectExtension = (booking) => {
  triggerConfirmModal(
    'Reject Stay Extension?',
    'Are you sure you want to reject this stay extension request?',
    'warning',
    async () => {
      try {
        const response = await axios.post(`/api/owner/bookings/reject-extension/${booking.id}`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data.success) {
          showSystemAlert('Stay extension rejected.', 'info');
          fetchBookings();
        }
      } catch (error) {
        showSystemAlert('Failed to reject extension.', 'error');
      }
    }
  );
};

const handleMarkPaid = async (booking) => {
  try {
    const response = await axios.post(`/api/owner/bookings/payment/${booking.id}`, {
      status: 'paid'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.data.success) {
      showSystemAlert('Payment marked as Paid!', 'success');
      fetchBookings();
    }
  } catch (error) {
    showSystemAlert('Failed to mark payment.', 'error');
  }
};

const handlePrint = () => {
  window.print();
};

// Plain-language payment method label — assume the owner isn't a technical person
const paymentMethodLabel = (method) => {
  return method === 'paymongo' ? 'Online (GCash/Card)' : 'Cash';
};

// A confirmed PayMongo booking only becomes an actual resident once the
// student finishes paying — until then it's a reserved slot, not an
// occupied room. Distinct from cash, where approval itself seats them.
const isAwaitingOnlinePayment = (booking) => {
  return booking.status === 'confirmed' && booking.payment_method === 'paymongo' && booking.payment_status !== 'paid';
};

import { computeCheckoutDate, formatCheckoutDateString } from '../../utils/dateHelper.js';

const getCheckoutDateDisplay = (booking) => {
  const checkIn = booking.check_in_date;
  if (!checkIn) return '—';
  const extMonths = booking.is_extension_requested ? (parseInt(booking.extension_months) || 0) : 0;
  const computedDate = computeCheckoutDate(checkIn, booking.months, extMonths);
  return formatCheckoutDateString(computedDate);
};

onMounted(() => {
  fetchBookings();
});
</script>

<template>
  <div class="bg-slate-100 min-h-screen flex flex-col font-sans">
    <div class="no-print">
      <OwnerNav />
    </div>
    <FlashAlert ref="alertRef" />

    <!-- Confirmation Modal Overlay -->
    <div v-if="showModal" class="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
      <div class="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border border-slate-100 animate-in zoom-in duration-200">
        <div class="mb-4 flex justify-center" :class="[modalType === 'success' ? 'text-emerald-500' : modalType === 'warning' ? 'text-amber-500' : 'text-blue-500']">
          <i class="fa-solid text-5xl" :class="[modalType === 'success' ? 'fa-circle-check' : modalType === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-info']"></i>
        </div>
        <h2 class="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">{{ modalTitle }}</h2>
        <p class="text-slate-500 mb-6 text-sm">{{ modalText }}</p>
        <div class="flex gap-3">
          <button @click="executeConfirm" class="bg-black hover:bg-slate-800 text-white font-bold py-2.5 px-6 rounded-xl transition text-xs uppercase tracking-widest flex-1">
            Confirm
          </button>
          <button @click="showModal = false" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2.5 px-6 rounded-xl transition text-xs uppercase tracking-widest flex-1">
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <main class="flex-1 max-w-[1700px] mx-auto w-[96%] py-12 px-2 lg:px-6">

      <!-- Header Section -->
      <div class="mb-12 text-center">
        <!-- Print Only Header -->
        <div class="hidden print:flex flex-row justify-between items-center border-b-2 border-slate-300 pb-6 mb-8 text-left">
          <div class="flex items-center gap-6">
            <img src="/img/CSPC_logo.png" class="w-16 h-16 object-contain" />
            <div>
              <h1 class="text-xl font-black text-slate-900 uppercase tracking-tight">CSPC Boarding House Management System</h1>
              <p class="text-sm font-black text-[#2a528a] uppercase tracking-wider mt-0.5">Property Booking Monitoring Report</p>
            </div>
          </div>
          <div class="text-right">
            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">REPORT DATE</p>
            <p class="font-bold text-slate-900 text-base">{{ reportDate }}</p>
          </div>
        </div>

        <h1 class="text-3xl font-black text-slate-900 uppercase tracking-tight mb-2 no-print">
          {{ houseName ? `Bookings for ${houseName}` : 'Bookings Monitoring' }}
        </h1>
        <p class="text-blue-600 font-bold uppercase text-[12px] tracking-[0.2em] mb-4 text-center tracking-widest no-print">
          {{ houseName ? 'Property-Scoped Reservation View' : 'Comprehensive Reservation Overview' }}
        </p>
        <div class="w-20 h-1.5 bg-blue-600 mx-auto rounded-full no-print"></div>
      </div>

      <!-- Main Loader state -->
      <div v-if="isLoading" class="bg-white rounded-[1.5rem] p-20 shadow-xl border border-slate-200 text-center flex flex-col items-center justify-center">
        <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
        <p class="text-slate-400 font-bold uppercase text-[9px] tracking-widest">Loading bookings records...</p>
      </div>

      <!-- Main Card Container -->
      <div v-else class="bg-white rounded-[1.5rem] shadow-xl border border-slate-200/60 overflow-hidden text-left animate-in fade-in duration-300">

        <!-- Control Bar -->
        <div class="px-6 py-6 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 control-bar no-print">
          <!-- Left side -->
          <div class="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <!-- Search bar -->
            <div class="relative w-full sm:w-56 md:w-72">
              <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                <i class="fa-solid fa-magnifying-glass text-xs"></i>
              </span>
              <input type="text" v-model="searchQuery" placeholder="SEARCH BOOKINGS..."
                  class="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold tracking-widest shadow-sm focus:border-[#2a528a] outline-none transition-all placeholder:text-slate-300" />
            </div>

            <!-- Status Filter -->
            <div class="relative w-full sm:w-44">
              <select v-model="statusFilter" class="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-700 shadow-sm focus:border-[#2a528a] outline-none cursor-pointer">
                <option value="all">ALL STATUSES</option>
                <option value="pending">PENDING REQUESTS</option>
                <option value="confirmed">CONFIRMED / ACTIVE</option>
                <option value="completed">COMPLETED / CHECKED OUT</option>
                <option value="rejected">REJECTED / CANCELLED</option>
              </select>
            </div>

            <!-- Print Trigger button -->
            <button @click="handlePrint"
                class="bg-[#d9454f] hover:bg-black text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all duration-300 flex items-center gap-2 shadow-lg shadow-rose-100 active:scale-95 leading-none cb-pdf-btn">
              <i class="fa-solid fa-file-pdf"></i>
              <span class="cb-pdf-label">Download PDF</span>
            </button>

            <!-- Back to Dashboard — mobile: shows as '<', desktop: full label -->
            <router-link to="/owner/dashboard"
                class="cb-back-btn inline-flex items-center gap-2 group text-[11px] font-black text-[#2a528a] bg-white px-4 py-2.5 rounded-xl border border-slate-200 hover:border-[#2a528a] hover:bg-[#2a528a] hover:text-white transition-all duration-300 uppercase tracking-widest shadow-sm sm:hidden">
              <span class="cb-back-short">&lt;</span>
            </router-link>
          </div>

          <!-- Right side (desktop only) -->
          <div class="hidden sm:flex items-center gap-3">
            <router-link v-if="houseId" to="/owner/bookings"
                class="inline-flex items-center gap-2 group text-[11px] font-black text-slate-500 bg-white px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-900 hover:text-slate-900 transition-all duration-300 uppercase tracking-widest shadow-sm">
              <i class="fa-solid fa-list-ul"></i>
              View All Bookings
            </router-link>
            <router-link to="/owner/dashboard"
                class="inline-flex items-center gap-2 group text-[11px] font-black text-[#2a528a] bg-white px-4 py-2.5 rounded-xl border border-slate-200 hover:border-[#2a528a] hover:bg-[#2a528a] hover:text-white transition-all duration-300 uppercase tracking-widest shadow-sm">
              Back to Dashboard
              <i class="fa-solid fa-arrow-right group-hover:translate-x-1 transition-transform"></i>
            </router-link>
          </div>
        </div>

        <!-- Top Pagination Bar -->
        <div v-if="filteredBookings.length > 0" class="px-6 py-3.5 bg-white border-b border-slate-200/60 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-bold text-slate-500 no-print print:hidden">
          <div class="flex items-center gap-4">
            <span>Showing {{ Math.min((currentPage - 1) * itemsPerPage + 1, filteredBookings.length) }} to {{ Math.min(currentPage * itemsPerPage, filteredBookings.length) }} of {{ filteredBookings.length }} entries</span>
            <div class="flex items-center gap-2">
              <span class="text-[11px] font-bold text-slate-400">Rows per page:</span>
              <select v-model="itemsPerPage" @change="currentPage = 1" class="bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg text-xs font-bold text-slate-700 outline-none cursor-pointer">
                <option :value="10">10</option>
                <option :value="25">25</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
              </select>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button 
              type="button"
              @click="prevPage" 
              :disabled="currentPage === 1"
              class="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition font-bold cursor-pointer"
            >
              <i class="fa-solid fa-chevron-left text-[10px]"></i> Prev
            </button>
            <span class="px-3 py-1 bg-blue-600 text-white rounded-xl font-black text-xs">
              {{ currentPage }} / {{ totalPages }}
            </span>
            <button 
              type="button"
              @click="nextPage" 
              :disabled="currentPage === totalPages"
              class="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition font-bold cursor-pointer"
            >
              Next <i class="fa-solid fa-chevron-right text-[10px]"></i>
            </button>
          </div>
        </div>


        <!-- ===== PRINT-ONLY LAYOUT (hidden on screen, shown only when printing) ===== -->
        <div class="hidden print:block print-report-body">
          <template v-for="hName in allGroupedHouses" :key="'p-' + hName">
            <!-- House Section Header -->
            <div class="print-house-header">
              <div class="print-house-title">
                <span class="print-house-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1e3a5f" style="width:16px;height:16px;display:inline-block;vertical-align:middle"><path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z"/><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z"/></svg>
              </span>
                <div>
                  <strong>{{ hName }}</strong>
                  <span v-if="getAllHouseBookings(hName)[0]?.house_location" class="print-house-loc">{{ getAllHouseBookings(hName)[0]?.house_location }}</span>
                </div>
              </div>
              <span class="print-house-count">{{ getAllHouseBookings(hName).length }} TOTAL BOOKING{{ getAllHouseBookings(hName).length > 1 ? 'S' : '' }}</span>
            </div>

            <!-- Booking Entry Cards -->
            <div v-for="booking in getAllHouseBookings(hName)" :key="'p-' + booking.id" class="print-booking-card">
              <!-- Card Header Row -->
              <div class="print-card-header">
                <div class="print-ref-block">
                  <span class="print-ref-no">REF-{{ booking.id.toString().padStart(4, '0') }}</span>
                  <span class="print-payment-method">{{ paymentMethodLabel(booking.payment_method) }}</span>
                </div>
                <div class="print-status-block">
                  <span class="print-status-badge" :class="[
                    booking.status === 'confirmed' && booking.payment_status === 'paid' ? 'print-status-paid' :
                    booking.status === 'confirmed' ? 'print-status-approved' :
                    booking.status === 'pending' ? 'print-status-pending' :
                    booking.status === 'rejected' ? 'print-status-rejected' : 'print-status-other'
                  ]">
                    {{ booking.status === 'confirmed' ? (booking.payment_status === 'paid' ? 'APPROVED / PAID' : 'APPROVED') : booking.status.toUpperCase() }}
                  </span>
                </div>
              </div>

              <!-- Field Grid -->
              <div class="print-fields-grid">
                <div class="print-field">
                  <span class="print-field-label">Student Name</span>
                  <span class="print-field-value print-name">{{ booking.student_name }}</span>
                </div>
                <div class="print-field">
                  <span class="print-field-label">Age</span>
                  <span class="print-field-value">{{ booking.age || '—' }}</span>
                </div>
                <div class="print-field">
                  <span class="print-field-label">Room</span>
                  <span class="print-field-value">
                    Room {{ booking.room_number }}
                    <span class="print-gender" :class="booking.room_gender === 'female' ? 'print-gender-f' : 'print-gender-m'">{{ booking.room_gender }}</span>
                  </span>
                </div>
                <div class="print-field">
                  <span class="print-field-label">Check-In Date</span>
                  <span class="print-field-value">{{ booking.check_in_date ? new Date(booking.check_in_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' }}</span>
                </div>
                <div class="print-field">
                  <span class="print-field-label">Check-Out Date</span>
                  <span class="print-field-value print-blue">{{ getCheckoutDateDisplay(booking) }}</span>
                </div>
                <div class="print-field print-field-wide">
                  <span class="print-field-label">Address</span>
                  <span class="print-field-value">{{ booking.address || '—' }}</span>
                </div>
                <div class="print-field">
                  <span class="print-field-label">Contact Number</span>
                  <span class="print-field-value">{{ booking.contact_number || '—' }}</span>
                </div>
                <div class="print-field">
                  <span class="print-field-label">Emergency Contact</span>
                  <span class="print-field-value">{{ booking.emergency_contact || '—' }}</span>
                </div>
                <div class="print-field">
                  <span class="print-field-label">Guardian Name</span>
                  <span class="print-field-value">{{ booking.guardian_name || '—' }}</span>
                </div>
                <div class="print-field">
                  <span class="print-field-label">Duration of Stay</span>
                  <span class="print-field-value print-blue">{{ booking.months }} Month{{ booking.months > 1 ? 's' : '' }}</span>
                </div>
                <div class="print-field">
                  <span class="print-field-label">Monthly Rent</span>
                  <span class="print-field-value">₱{{ Number(booking.monthly_rent || 0).toLocaleString() }}</span>
                </div>
                <div class="print-field">
                  <span class="print-field-label">Total Payment</span>
                  <span class="print-field-value print-bold">₱{{ Number(booking.amount || booking.total_amount || 0).toLocaleString() }}</span>
                </div>
                <div class="print-field" v-if="booking.initial_payment > 0">
                  <span class="print-field-label">Initial Payment (Move-In)</span>
                  <span class="print-field-value print-green">
                    ₱{{ Number(booking.initial_payment).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                    <span class="print-payment-breakdown">
                      Adv: ₱{{ (parseInt(booking.advance_months || 0) * parseFloat(booking.monthly_rent || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 }) }} + Dep ({{ booking.deposit_type === 'consumable' ? 'Consum' : 'Refund' }}): ₱{{ (parseInt(booking.deposit_months || 0) * parseFloat(booking.monthly_rent || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </template>

          <!-- No bookings fallback -->
          <div v-if="filteredBookings.length === 0" class="print-empty">
            No booking records found.
          </div>

          <!-- Report Footer -->
          <div class="print-footer">
            <div class="print-footer-sig">
              <div class="print-sig-line"></div>
              <span>Prepared by (Owner / Manager)</span>
            </div>
            <div class="print-footer-sig">
              <div class="print-sig-line"></div>
              <span>Verified by</span>
            </div>
            <div class="print-footer-note">
              This report was generated from the CSPC Boarding House Management System.
            </div>
          </div>
        </div>

        <!-- ===== DESKTOP TABLE (hidden on mobile, hidden on print) ===== -->
        <div class="booking-table-wrapper w-full overflow-x-auto shadow-sm rounded-xl border border-slate-200 print:hidden">
          <table class="w-full text-left border-collapse min-w-[1250px] divide-y divide-slate-200" id="bookingsTable">
            <thead class="bg-slate-100/80 border-b border-slate-300">
              <tr class="text-slate-800 uppercase text-[10px] font-black tracking-wider">
                <th class="px-4 py-3 whitespace-nowrap">REF NO.</th>
                <th class="px-4 py-3 whitespace-nowrap">STUDENT NAME</th>
                <th class="px-3 py-3 text-center whitespace-nowrap">AGE</th>
                <th class="px-3 py-3 text-center whitespace-nowrap">ROOM</th>
                <th class="px-3 py-3 text-center" style="min-width:110px">CHECK-IN /<br/>CHECK-OUT</th>
                <th class="px-4 py-3 whitespace-nowrap">ADDRESS</th>
                <th class="px-3 py-3 text-center whitespace-nowrap">CONTACT<br/>NUMBER</th>
                <th class="px-3 py-3 text-center whitespace-nowrap">EMERGENCY<br/>CONTACT</th>
                <th class="px-4 py-3 whitespace-nowrap">GUARDIAN<br/>NAME</th>
                <th class="px-3 py-3 text-center whitespace-nowrap">DURATION<br/>&amp; STAY</th>
                <th class="px-3 py-3 text-center whitespace-nowrap">RENT /<br/>TOTAL</th>
                <th class="px-4 py-3 text-left bg-emerald-50/80 text-emerald-800" style="min-width:160px">INITIAL PAYMENT<br/><span class="font-bold normal-case text-[9px] text-emerald-600">DUE (MOVE-IN)</span></th>
                <th class="px-4 py-3 text-center whitespace-nowrap">ACTION /<br/>STATUS</th>
              </tr>
            </thead>
            <tbody class="text-[12px] font-semibold text-slate-700 divide-y divide-slate-100">
              <template v-for="hName in groupedHouses" :key="hName">
                
                <!-- House Group Header (Matches User Screenshot) -->
                <tr class="bg-blue-50/50 border-y border-blue-100 house-group-header">
                  <td colspan="13" class="px-6 py-3.5">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-3">
                        <div class="w-8 h-8 bg-[#2a528a] text-white rounded-lg flex items-center justify-center shadow-xs shrink-0">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z"/><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z"/></svg>
                        </div>
                        <div>
                          <h3 class="text-xs font-black text-slate-900 uppercase tracking-tight leading-none">{{ hName }}</h3>
                          <p v-if="getHouseBookings(hName)[0]?.house_location" class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                            {{ getHouseBookings(hName)[0]?.house_location }}
                          </p>
                        </div>
                      </div>
                      <span class="text-[10px] font-black text-[#2a528a] bg-blue-100/70 border border-blue-200/50 px-3 py-1 rounded-full uppercase tracking-wider">
                        {{ getHouseBookings(hName).length }} TOTAL BOOKINGS
                      </span>
                    </div>
                  </td>
                </tr>

                <!-- Bookings Loop (Matches User Screenshot) -->
                <tr v-for="booking in getHouseBookings(hName)" :key="booking.id" class="hover:bg-slate-50/40 transition-colors">
                  <td class="px-4 py-6 font-mono text-[10px] leading-relaxed">
                    <span class="font-bold text-slate-900 text-xs block">REF-{{ booking.id.toString().padStart(4, '0') }}</span>
                    <span class="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest"
                          :class="booking.payment_method === 'paymongo' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-slate-100 text-slate-500 border border-slate-200'">
                      <i class="fa-solid" :class="booking.payment_method === 'paymongo' ? 'fa-mobile-screen-button' : 'fa-money-bill-wave'"></i>
                      {{ paymentMethodLabel(booking.payment_method) }}
                    </span>
                  </td>
                  <td class="px-4 py-6 font-bold text-slate-900 text-sm whitespace-nowrap">
                    {{ booking.student_name }}
                  </td>
                  <td class="px-3 py-6 text-center font-bold text-slate-700">{{ booking.age || 'N/A' }}</td>
                  <td class="px-3 py-6 text-center whitespace-nowrap">
                    <span class="font-bold text-slate-900 text-xs block">Room {{ booking.room_number }}</span>
                    <span class="text-[9px] font-black uppercase tracking-wider block" :class="booking.room_gender === 'female' ? 'text-pink-500' : 'text-blue-500'">
                      {{ booking.room_gender }}
                    </span>
                  </td>
                  <td class="px-3 py-6 text-center font-bold text-slate-800 whitespace-nowrap">
                    <span class="block text-xs font-bold text-slate-800">{{ booking.check_in_date ? new Date(booking.check_in_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set' }}</span>
                    <span class="block text-[9px] font-bold text-blue-600 mt-0.5">{{ getCheckoutDateDisplay(booking) }}</span>
                  </td>
                  <td class="px-4 py-6 font-bold text-slate-600 text-xs min-w-[180px] max-w-[220px] leading-snug">
                    {{ booking.address || 'N/A' }}
                  </td>
                  <td class="px-3 py-6 text-center font-bold text-slate-700 text-xs whitespace-nowrap">
                    {{ booking.contact_number || 'N/A' }}
                  </td>
                  <td class="px-3 py-6 text-center font-bold text-slate-700 text-xs whitespace-nowrap">
                    {{ booking.emergency_contact || 'N/A' }}
                  </td>
                  <td class="px-4 py-6 font-bold text-slate-900 text-xs whitespace-nowrap">
                    {{ booking.guardian_name || 'N/A' }}
                  </td>
                  <td class="px-3 py-6 text-center font-bold text-blue-600 text-xs whitespace-nowrap">
                    <span class="block font-black text-blue-600">{{ booking.months }} Month{{ booking.months > 1 ? 's' : '' }}</span>
                    <span class="block text-[9px] font-bold text-slate-400 mt-0.5">Duration</span>
                  </td>
                  <td class="px-3 py-6 text-center whitespace-nowrap">
                    <span class="block text-xs font-bold text-slate-700">₱{{ Number(booking.monthly_rent || 0).toLocaleString() }}<span class="text-slate-400">/month</span></span>
                    <span class="block text-sm font-black text-slate-900 mt-0.5">₱{{ Number(booking.amount || booking.total_amount || 0).toLocaleString() }}</span>
                  </td>
                  <!-- Move-in Ledger Column -->
                  <td class="px-4 py-6 text-left bg-emerald-50/40 min-w-[180px]">
                    <div v-if="booking.initial_payment > 0">
                      <span class="block text-sm font-black text-emerald-700">₱{{ Number(booking.initial_payment).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
                      <span class="block text-[8px] font-bold text-slate-400 mt-0.5 leading-tight">
                        Adv: ₱{{ (parseInt(booking.advance_months || 0) * parseFloat(booking.monthly_rent || 0)).toLocaleString('en-US', {minimumFractionDigits:2}) }} +<br />
                        Dep ({{ booking.deposit_type === 'consumable' ? 'Consum' : 'Refund' }}): ₱{{ (parseInt(booking.deposit_months || 0) * parseFloat(booking.monthly_rent || 0)).toLocaleString('en-US', {minimumFractionDigits:2}) }}
                      </span>
                    </div>
                    <span v-else class="text-slate-300 text-xs font-bold">—</span>
                  </td>
                  <!-- Action/Status Column -->
                  <td class="px-4 py-6 text-center whitespace-nowrap">
                    <!-- Screen view: Interactive buttons -->
                    <div class="print:hidden">
                      <!-- Extension actions -->
                      <div v-if="booking.is_extension_requested" class="bg-amber-50 border border-amber-200 p-2 rounded-xl mb-2">
                        <p class="text-[9px] font-black text-amber-700 uppercase leading-tight mb-1">Extension: +{{ booking.extension_months }} Month{{ booking.extension_months > 1 ? 's' : '' }}</p>
                        <div class="flex gap-2">
                          <button type="button" @click="handleApproveExtension(booking)" class="flex-1 bg-amber-500 text-white px-3 py-1.5 rounded-lg font-black text-[8px] hover:bg-black transition shadow-sm uppercase tracking-widest">
                            Approve
                          </button>
                          <button type="button" @click="handleRejectExtension(booking)" class="flex-1 bg-red-100 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg font-black text-[8px] hover:bg-red-600 hover:text-white transition shadow-sm uppercase tracking-widest">
                            Reject
                          </button>
                        </div>
                      </div>

                      <!-- Main status actions -->
                      <div v-if="booking.status === 'pending'" class="flex flex-col gap-1.5 items-center">
                        <button @click="handleApprove(booking)" class="w-24 bg-[#108548] hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-black text-[9px] transition shadow-xs uppercase tracking-widest cursor-pointer">
                          APPROVE
                        </button>
                        <button @click="handleReject(booking)" class="w-24 bg-[#dc2626] hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg font-black text-[9px] transition shadow-xs uppercase tracking-widest cursor-pointer">
                          REJECT
                        </button>
                      </div>
                      <div v-else-if="isAwaitingOnlinePayment(booking)" class="flex flex-col gap-1.5 max-w-[160px] mx-auto">
                        <span class="bg-amber-100 text-amber-700 text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-widest">
                          Reserved — Awaiting Payment
                        </span>
                        <p class="text-[9px] font-semibold text-slate-400 leading-snug">
                          Won't count as occupied until student pays online.
                        </p>
                      </div>
                      <div v-else-if="booking.status === 'confirmed'" class="flex flex-col items-center">
                        <span class="bg-green-100 text-green-700 text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest">APPROVED</span>
                        <button v-if="booking.payment_status !== 'paid'" @click="handleMarkPaid(booking)" class="mt-1.5 w-24 bg-blue-500 text-white px-2 py-1 rounded-lg font-black text-[8px] hover:bg-blue-700 transition shadow-xs uppercase tracking-widest cursor-pointer">
                          Mark Paid
                        </button>
                        <span v-else class="text-emerald-600 text-[9px] font-black uppercase tracking-widest mt-1">PAID</span>
                      </div>
                      <div v-else-if="booking.status === 'cancelled'" class="text-slate-400 font-black text-[10px] uppercase tracking-wider">
                        CANCELLED
                      </div>
                      <div v-else-if="booking.status === 'rejected'" class="text-rose-500 font-black text-[10px] uppercase tracking-wider">
                        REJECTED
                      </div>
                      <span v-else class="text-slate-400 text-[10px] font-black uppercase">{{ booking.status }}</span>
                    </div>

                    <!-- Print handled by separate print-only layout above -->

                  </td>
                </tr>

              </template>

              <tr v-if="filteredBookings.length === 0">
                <td colspan="13" class="py-20 text-center text-slate-400 font-bold uppercase tracking-widest">
                  No bookings found under search.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination Bar — always visible when there are bookings -->
        <div v-if="filteredBookings.length > 0" class="px-6 py-4 bg-slate-50/50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 pagination-container no-print print:hidden">
          <div class="flex items-center gap-4">
            <span class="text-xs font-bold text-slate-500">
              Showing <span class="font-black text-slate-800">{{ Math.min((currentPage - 1) * itemsPerPage + 1, filteredBookings.length) }}</span>
              to <span class="font-black text-slate-800">{{ Math.min(currentPage * itemsPerPage, filteredBookings.length) }}</span>
              of <span class="font-black text-slate-800">{{ filteredBookings.length }}</span> booking{{ filteredBookings.length > 1 ? 's' : '' }}
            </span>
            <div class="flex items-center gap-2">
              <span class="text-[11px] font-bold text-slate-400">Rows per page:</span>
              <select v-model="itemsPerPage" @change="currentPage = 1" class="bg-white border border-slate-200 px-2 py-1 rounded-lg text-xs font-bold text-slate-700 outline-none cursor-pointer">
                <option :value="10">10</option>
                <option :value="25">25</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
              </select>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button 
              type="button"
              @click="prevPage" 
              :disabled="currentPage === 1"
              class="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition font-bold cursor-pointer"
            >
              <i class="fa-solid fa-chevron-left text-[10px]"></i> Prev
            </button>
            <span class="px-3 py-1 bg-blue-600 text-white rounded-xl font-black text-xs">
              {{ currentPage }} / {{ totalPages }}
            </span>
            <button 
              type="button"
              @click="nextPage" 
              :disabled="currentPage === totalPages"
              class="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition font-bold cursor-pointer"
            >
              Next <i class="fa-solid fa-chevron-right text-[10px]"></i>
            </button>
          </div>
        </div>

        <!-- ===== MOBILE CARD VIEW (shown only on mobile, hidden in print) ===== -->
        <div class="mobile-cards-wrapper print:hidden">
          <div v-if="filteredBookings.length === 0" class="py-16 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">
            No bookings found under search.
          </div>

          <template v-for="hName in groupedHouses" :key="'m-' + hName">
            <!-- House Group Header -->
            <div class="m-house-hdr">
              <div class="m-house-icon"><i class="fa-solid fa-house-chimney"></i></div>
              <div class="m-house-info">
                <span class="m-house-name">{{ hName }}</span>
                <span class="m-house-loc">{{ getHouseBookings(hName)[0]?.house_location }}</span>
              </div>
              <span class="m-house-count">{{ getHouseBookings(hName).length }} Booking{{ getHouseBookings(hName).length > 1 ? 's' : '' }}</span>
            </div>

            <!-- Mobile Booking Cards -->
            <div v-for="booking in getHouseBookings(hName)" :key="'mc-' + booking.id" class="m-card">

              <div class="m-row">
                <span class="m-lbl">Ref No.</span>
                <span class="m-val">{{ booking.id }}</span>
              </div>
              <div class="m-row">
                <span class="m-lbl">Payment Method</span>
                <span class="m-val">
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest"
                        :class="booking.payment_method === 'paymongo' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'">
                    <i class="fa-solid" :class="booking.payment_method === 'paymongo' ? 'fa-mobile-screen-button' : 'fa-money-bill-wave'"></i>
                    {{ paymentMethodLabel(booking.payment_method) }}
                  </span>
                </span>
              </div>
              <div class="m-row">
                <span class="m-lbl">Student Name</span>
                <span class="m-val">{{ booking.student_name }}</span>
              </div>
              <div class="m-row">
                <span class="m-lbl">Age</span>
                <span class="m-val">{{ booking.age || 'N/A' }}</span>
              </div>
              <div class="m-row">
                <span class="m-lbl">Room</span>
                <span class="m-val">
                  {{ booking.room_number }}
                  <span class="m-gender" :class="booking.room_gender === 'female' ? 'f' : 'm'">{{ booking.room_gender }}</span>
                </span>
              </div>
              <div class="m-row">
                <span class="m-lbl">Check-In Date</span>
                <span class="m-val">
                  <span v-if="booking.check_in_date">{{ new Date(booking.check_in_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) }}</span>
                  <span v-else style="color:#f97316">Not set</span>
                </span>
              </div>
              <div class="m-row">
                <span class="m-lbl">Check-Out Date</span>
                <span class="m-val font-extrabold text-blue-600">
                  <span>{{ getCheckoutDateDisplay(booking) }}</span>
                </span>
              </div>
              <div class="m-row">
                <span class="m-lbl">Address</span>
                <span class="m-val">{{ booking.address || 'N/A' }}</span>
              </div>
              <div class="m-row">
                <span class="m-lbl">Contact Number</span>
                <span class="m-val">{{ booking.contact_number || 'N/A' }}</span>
              </div>
              <div class="m-row">
                <span class="m-lbl">Emergency Contact</span>
                <span class="m-val">{{ booking.emergency_contact || 'N/A' }}</span>
              </div>
              <div class="m-row">
                <span class="m-lbl">Guardian Name</span>
                <span class="m-val">{{ booking.guardian_name || 'N/A' }}</span>
              </div>
              <div class="m-row">
                <span class="m-lbl">Stay Months</span>
                <span class="m-val">{{ booking.months }}</span>
              </div>
              <div class="m-row">
                <span class="m-lbl">Monthly Rent</span>
                <span class="m-val">₱{{ Number(booking.monthly_rent || 0).toLocaleString() }}</span>
              </div>
              <div class="m-row">
                <span class="m-lbl">Total Payment</span>
                <span class="m-val">₱{{ Number(booking.amount).toLocaleString() }}</span>
              </div>

              <!-- Initial Payment — same detail as desktop -->
              <div class="m-row" v-if="booking.initial_payment > 0">
                <span class="m-lbl">Initial Payment</span>
                <span class="m-val m-val-col">
                  <span class="m-init-amt">₱{{ Number(booking.initial_payment).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
                  <span class="m-init-sub">
                    Adv: ₱{{ (parseInt(booking.advance_months || 0) * parseFloat(booking.monthly_rent || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 }) }} +
                    Dep ({{ booking.deposit_type === 'consumable' ? 'Consum' : 'Refund' }}): ₱{{ (parseInt(booking.deposit_months || 0) * parseFloat(booking.monthly_rent || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                  </span>
                </span>
              </div>
              <div class="m-row" v-else>
                <span class="m-lbl">Initial Payment</span>
                <span class="m-val" style="color:#cbd5e1">—</span>
              </div>

              <!-- Action / Status -->
              <div class="m-row m-row-action">
                <span class="m-lbl">Action/Status</span>
                <div class="m-actions">
                  <!-- Extension request -->
                  <div v-if="booking.is_extension_requested" class="m-ext-box">
                    <p class="m-ext-title">Extension: +{{ booking.extension_months }} Month{{ booking.extension_months > 1 ? 's' : '' }}</p>
                    <div class="m-btn-row">
                      <button @click="handleApproveExtension(booking)" class="m-btn m-btn-amber">Approve</button>
                      <button @click="handleRejectExtension(booking)" class="m-btn m-btn-red-ol">Reject</button>
                    </div>
                  </div>
                  <!-- Pending -->
                  <div v-if="booking.status === 'pending'" class="m-btn-row">
                    <button @click="handleApprove(booking)" class="m-btn m-btn-green">Approve</button>
                    <button @click="handleReject(booking)" class="m-btn m-btn-red">Reject</button>
                  </div>
                  <!-- Approved, awaiting online payment -->
                  <div v-else-if="isAwaitingOnlinePayment(booking)" class="m-pending-box">
                    <span class="m-pill m-pill-pending">Reserved — Awaiting Payment</span>
                    <p class="m-pending-note">Won't count as occupied until the student pays online.</p>
                  </div>
                  <!-- Confirmed -->
                  <div v-else-if="booking.status === 'confirmed'" class="m-btn-row">
                    <span class="m-pill m-pill-approved">Approved</span>
                    <button v-if="booking.payment_status !== 'paid'" @click="handleMarkPaid(booking)" class="m-btn m-btn-blue">Mark Paid</button>
                    <span v-else class="m-pill m-pill-paid">Paid</span>
                  </div>
                  <!-- Other statuses -->
                  <span v-else class="m-pill m-pill-default">{{ booking.status }}</span>
                </div>
              </div>
            </div>

          <!-- End of Records -->
          <div v-if="filteredBookings.length > 0" class="m-end-of-records">
            <span class="m-eor-text">End of Records</span>
          </div>
          </template>
        </div>
      </div>

    </main>
  </div>
</template>

<style>
/* ======================================================
   MOBILE CARD VIEW — only active below 768 px
====================================================== */

/* Hide mobile cards on desktop, show table */
.mobile-cards-wrapper { display: none; }
.booking-table-wrapper { display: block; }

@media (max-width: 767px) {
  /* Swap visibility */
  .booking-table-wrapper { display: none !important; }
  .mobile-cards-wrapper  { display: block !important; }

  /* ── Control bar: one flat row on mobile ── */
  .control-bar {
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    align-items: center !important;
    gap: 8px !important;
    padding: 10px 12px !important;
  }
  .control-bar > div:first-child {
    flex-wrap: nowrap !important;
    gap: 8px !important;
    width: 100% !important;
  }
  /* Search stretches to fill remaining space */
  .control-bar > div:first-child > div:first-child {
    flex: 1 1 0% !important;
    min-width: 0 !important;
  }
  /* PDF button — keep icon, hide text label */
  .cb-pdf-btn {
    flex-shrink: 0 !important;
    padding: 10px 14px !important;
  }
  .cb-pdf-label { display: none; }
  /* Back button — square, shows only '<' */
  .cb-back-btn {
    flex-shrink: 0 !important;
    padding: 10px 14px !important;
    font-size: 15px !important;
    font-weight: 900 !important;
  }

  /* ── House group header ── */
  .m-house-hdr {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #eff6ff;
    border-top: 1px solid #bfdbfe;
    border-bottom: 1px solid #bfdbfe;
    padding: 10px 16px;
  }
  .m-house-icon {
    width: 30px; height: 30px;
    background: #2a528a;
    border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 12px; flex-shrink: 0;
  }
  .m-house-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .m-house-name {
    font-size: 10px; font-weight: 900; color: #2a528a;
    text-transform: uppercase; letter-spacing: .12em;
    line-height: 1; margin-bottom: 2px;
  }
  .m-house-loc {
    font-size: 8px; color: #94a3b8; font-weight: 700;
    text-transform: uppercase; font-style: italic;
  }
  .m-house-count {
    background: rgba(37,99,235,.1); color: #1d4ed8;
    font-size: 8px; font-weight: 900; padding: 3px 9px;
    border-radius: 999px; text-transform: uppercase;
    letter-spacing: .07em; white-space: nowrap;
  }

  /* ── Booking card wrapper ── */
  .m-card {
    background: #fff;
    border-bottom: 2px solid #e2e8f0;
  }

  /* ── Row: label | value ── */
  .m-row {
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid #e8ecf0;
    min-height: 36px;
  }
  .m-row:last-child { border-bottom: none; }

  .m-lbl {
    width: 44%;
    flex-shrink: 0;
    padding: 9px 8px 9px 14px;
    font-size: 9.5px;
    font-weight: 900;
    color: #0f172a;
    text-transform: uppercase;
    letter-spacing: .055em;
    line-height: 1.35;
    display: flex;
    align-items: center;
    /* NO right border — clean look matching screenshot */
  }

  .m-val {
    flex: 1;
    padding: 9px 14px 9px 10px;
    font-size: 12px;
    font-weight: 400;
    color: #334155;
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
    line-height: 1.4;
    border-left: 1px solid #e2e8f0;
  }

  /* Initial payment stacks vertically */
  .m-val-col {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding-top: 8px;
    padding-bottom: 8px;
  }
  .m-init-amt {
    font-size: 13px;
    font-weight: 900;
    color: #047857;
  }
  .m-init-sub {
    font-size: 9px;
    font-weight: 600;
    color: #94a3b8;
    line-height: 1.4;
  }

  /* Gender badge */
  .m-gender {
    font-size: 8px; font-weight: 900;
    text-transform: uppercase;
    padding: 1px 5px; border-radius: 999px;
  }
  .m-gender.f { color: #ec4899; background: #fdf2f8; }
  .m-gender.m { color: #3b82f6; background: #eff6ff; }

  /* ── Action row ── */
  .m-row-action { min-height: 48px; align-items: stretch; }
  .m-row-action .m-lbl { align-self: stretch; align-items: flex-start; padding-top: 12px; }
  .m-actions {
    flex: 1;
    border-left: 1px solid #e2e8f0;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .m-btn-row {
    display: flex;
    gap: 8px;
  }

  /* Buttons — wide like screenshot */
  .m-btn {
    flex: 1;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: .07em;
    border: none;
    cursor: pointer;
    transition: opacity .15s;
    text-align: center;
  }
  .m-btn:active { opacity: .8; }
  .m-btn-green  { background: #108548; color: #fff; }
  .m-btn-red    { background: #ef4444; color: #fff; }
  .m-btn-amber  { background: #f59e0b; color: #fff; }
  .m-btn-blue   { background: #3b82f6; color: #fff; }
  .m-btn-red-ol { background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; }

  /* Pills / badges */
  .m-pill {
    display: inline-block;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: .07em;
    padding: 5px 18px;
    border-radius: 999px;
  }
  .m-pill-paid     { background: #16a34a; color: #fff; }
  .m-pill-approved { background: #dcfce7; color: #15803d; }
  .m-pill-pending  { background: #fef3c7; color: #b45309; }
  .m-pill-default  { color: #94a3b8; }

  .m-pending-box { display: flex; flex-direction: column; gap: 5px; }
  .m-pending-note {
    font-size: 9px; font-weight: 600; color: #94a3b8; line-height: 1.5;
  }

  /* Extension box */
  .m-ext-box {
    background: #fffbeb; border: 1px solid #fde68a;
    border-radius: 8px; padding: 6px 8px; margin-bottom: 4px;
  }
  .m-ext-title {
    font-size: 8px; font-weight: 900; color: #b45309;
    text-transform: uppercase; letter-spacing: .06em;
    margin: 0 0 4px;
  }

  /* ── End of Records footer ── */
  .m-end-of-records {
    padding: 16px 20px;
    text-align: center;
    background: #fff;
    border-top: 1px solid #e2e8f0;
  }
  .m-eor-text {
    font-size: 9px;
    font-weight: 900;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: .2em;
  }
}

/* ======================================================
   PRINT STYLES — Card-per-booking layout (Portrait A4)
====================================================== */
@media print {
  @page {
    size: A4 portrait;
    margin: 1.2cm 1.2cm 1.4cm;
  }

  /* 1. Global reset */
  html, body, #app {
    width: 100% !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    font-family: 'Segoe UI', Arial, sans-serif !important;
    font-size: 9pt !important;
    color: #0f172a !important;
  }

  /* 2. Hide everything that isn't needed in print */
  .no-print,
  nav, footer, button,
  .control-bar,
  .fixed, .backdrop-blur-sm,
  .booking-table-wrapper,
  .mobile-cards-wrapper,
  .pagination-container {
    display: none !important;
  }

  /* 3. Container reset */
  main, body > div, .bg-slate-100, .bg-white {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    overflow: visible !important;
  }

  /* ── Report Header (logo + title) ── */
  .print-report-header-wrapper {
    display: flex !important;
  }

  /* ── Report body ── */
  .print-report-body {
    display: block !important;
    width: 100% !important;
  }

  /* ── House section header ── */
  .print-house-header {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    background: #e8f0fb !important;
    border: 1px solid #b6cef0 !important;
    border-radius: 6px !important;
    padding: 7px 12px !important;
    margin: 14px 0 6px !important;
    page-break-inside: avoid !important;
  }
  .print-house-title {
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
  }
  .print-house-icon {
    font-size: 13pt !important;
  }
  .print-house-title strong {
    display: block !important;
    font-size: 10pt !important;
    font-weight: 900 !important;
    color: #1e3a5f !important;
    text-transform: uppercase !important;
    letter-spacing: 0.04em !important;
    line-height: 1.2 !important;
  }
  .print-house-loc {
    display: block !important;
    font-size: 7.5pt !important;
    color: #64748b !important;
    font-style: italic !important;
  }
  .print-house-count {
    font-size: 8pt !important;
    font-weight: 900 !important;
    color: #1e4db7 !important;
    background: #dbeafe !important;
    padding: 3px 10px !important;
    border-radius: 999px !important;
    letter-spacing: 0.06em !important;
    white-space: nowrap !important;
  }

  /* ── Booking card ── */
  .print-booking-card {
    border: 1px solid #cbd5e1 !important;
    border-radius: 6px !important;
    margin-bottom: 10px !important;
    page-break-inside: avoid !important;
    overflow: hidden !important;
    background: #fff !important;
  }

  /* Card header: ref + status */
  .print-card-header {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    background: #f8fafc !important;
    border-bottom: 1px solid #e2e8f0 !important;
    padding: 6px 12px !important;
  }
  .print-ref-block {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
  }
  .print-ref-no {
    font-size: 10pt !important;
    font-weight: 900 !important;
    color: #0f172a !important;
    font-family: 'Courier New', monospace !important;
    letter-spacing: 0.05em !important;
  }
  .print-payment-method {
    font-size: 7.5pt !important;
    font-weight: 700 !important;
    color: #475569 !important;
    background: #f1f5f9 !important;
    border: 1px solid #e2e8f0 !important;
    padding: 1.5px 8px !important;
    border-radius: 999px !important;
    text-transform: uppercase !important;
    letter-spacing: 0.06em !important;
  }
  .print-status-block {
    display: flex !important;
    align-items: center !important;
  }
  .print-status-badge {
    font-size: 8pt !important;
    font-weight: 900 !important;
    padding: 3px 12px !important;
    border-radius: 999px !important;
    text-transform: uppercase !important;
    letter-spacing: 0.08em !important;
  }
  .print-status-paid     { background: #dcfce7 !important; color: #15803d !important; border: 1px solid #86efac !important; }
  .print-status-approved { background: #d1fae5 !important; color: #065f46 !important; border: 1px solid #6ee7b7 !important; }
  .print-status-pending  { background: #fef3c7 !important; color: #92400e !important; border: 1px solid #fde68a !important; }
  .print-status-rejected { background: #fee2e2 !important; color: #991b1b !important; border: 1px solid #fca5a5 !important; }
  .print-status-other    { background: #f1f5f9 !important; color: #475569 !important; border: 1px solid #e2e8f0 !important; }

  /* Field grid inside card */
  .print-fields-grid {
    display: grid !important;
    grid-template-columns: repeat(3, 1fr) !important;
    gap: 0 !important;
    padding: 0 !important;
  }
  .print-field {
    border-right: 1px solid #e2e8f0 !important;
    border-bottom: 1px solid #e2e8f0 !important;
    padding: 5px 10px !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 1px !important;
  }
  .print-field:nth-child(3n) {
    border-right: none !important;
  }
  .print-field-wide {
    grid-column: span 2 !important;
  }
  .print-field-label {
    font-size: 6.5pt !important;
    font-weight: 900 !important;
    color: #64748b !important;
    text-transform: uppercase !important;
    letter-spacing: 0.08em !important;
    line-height: 1.2 !important;
  }
  .print-field-value {
    font-size: 9pt !important;
    font-weight: 600 !important;
    color: #0f172a !important;
    line-height: 1.35 !important;
  }
  .print-name  { font-weight: 900 !important; font-size: 10pt !important; }
  .print-bold  { font-weight: 900 !important; font-size: 10pt !important; }
  .print-blue  { color: #1d4ed8 !important; font-weight: 900 !important; }
  .print-green { color: #15803d !important; font-weight: 900 !important; }

  .print-gender {
    font-size: 7pt !important;
    font-weight: 900 !important;
    text-transform: uppercase !important;
    padding: 1px 5px !important;
    border-radius: 999px !important;
    margin-left: 4px !important;
  }
  .print-gender-f { color: #db2777 !important; background: #fdf2f8 !important; }
  .print-gender-m { color: #2563eb !important; background: #eff6ff !important; }

  .print-payment-breakdown {
    display: block !important;
    font-size: 7pt !important;
    font-weight: 600 !important;
    color: #64748b !important;
    margin-top: 2px !important;
  }

  /* No bookings message */
  .print-empty {
    text-align: center !important;
    font-size: 10pt !important;
    color: #94a3b8 !important;
    padding: 24px !important;
  }

  /* Footer / signatories */
  .print-footer {
    display: flex !important;
    align-items: flex-end !important;
    justify-content: space-between !important;
    margin-top: 28px !important;
    padding-top: 12px !important;
    border-top: 1.5px solid #e2e8f0 !important;
    page-break-inside: avoid !important;
    gap: 24px !important;
  }
  .print-footer-sig {
    flex: 1 !important;
    text-align: center !important;
    font-size: 8pt !important;
    color: #475569 !important;
    font-weight: 700 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.06em !important;
  }
  .print-sig-line {
    width: 100% !important;
    border-bottom: 1px solid #0f172a !important;
    margin-bottom: 5px !important;
    height: 24px !important;
  }
  .print-footer-note {
    font-size: 7pt !important;
    color: #94a3b8 !important;
    text-align: right !important;
    font-style: italic !important;
    max-width: 220px !important;
    line-height: 1.4 !important;
    align-self: flex-end !important;
  }
}
</style>