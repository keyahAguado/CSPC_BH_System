<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import OwnerNav from '../../components/partials/OwnerNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';

const route = useRoute();

const bookings = ref([]);
const houseName = ref('');
const houseId = ref(route.query.houseId || '');
const searchQuery = ref('');
const isLoading = ref(true);

const alertRef = ref(null);
const token = sessionStorage.getItem('cspc_token');
const API = import.meta.env.VITE_API_URL;

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
  const query = searchQuery.value.toUpperCase();
  if (!query) return bookings.value;

  return bookings.value.filter(b => {
    return (
      (b.student_name && b.student_name.toUpperCase().includes(query)) ||
      (b.room_number && b.room_number.toString().includes(query)) ||
      (b.id && `REF-${b.id.toString().padStart(4, '0')}`.toUpperCase().includes(query)) ||
      (b.address && b.address.toUpperCase().includes(query)) ||
      (b.contact_number && b.contact_number.includes(query))
    );
  });
});

const groupedHouses = computed(() => {
  const list = [];
  filteredBookings.value.forEach(b => {
    if (!list.includes(b.house_name)) {
      list.push(b.house_name);
    }
  });
  return list;
});

const getHouseBookings = (houseName) => {
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
    `Approve extension request for +${booking.extension_months} Months?`,
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
        <div class="hidden print:block mb-6 text-center">
          <h2 class="text-[10px] font-black text-blue-600 uppercase tracking-[0.5em] mb-1">CSPC Boarding House Management System</h2>
          <h1 class="text-2xl font-black text-slate-900 uppercase tracking-tight">OFFICIAL BOOKING MONITORING REPORT</h1>
          <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2">Generated on: {{ new Date().toLocaleString() }}</p>
          <div class="mt-4 w-full h-px bg-slate-200"></div>
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
            <div class="relative w-full sm:w-64 md:w-80">
              <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                <i class="fa-solid fa-magnifying-glass text-xs"></i>
              </span>
              <input type="text" v-model="searchQuery" placeholder="SEARCH BOOKINGS..."
                  class="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold tracking-widest shadow-sm focus:border-[#2a528a] outline-none transition-all placeholder:text-slate-300" />
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


        <!-- ===== DESKTOP TABLE (hidden on mobile) ===== -->
        <div class="booking-table-wrapper overflow-x-auto print:overflow-visible">
          <table class="w-full text-left border-collapse min-w-[1400px] print:min-w-0" id="bookingsTable">
            <thead class="bg-slate-50/50">
              <tr class="text-black uppercase text-[11px] font-black tracking-tight border-b border-slate-200">
                <th class="px-4 py-7">Ref No.</th>
                <th class="px-4 py-7">Student Name</th>
                <th class="px-1 py-7 text-center">Age</th>
                <th class="px-2 py-7 text-center">Room</th>
                <th class="px-2 py-7 text-center leading-tight">Check-In Date</th>
                <th class="px-3 py-7">Address</th>
                <th class="px-2 py-7 text-center leading-tight">Contact Number</th>
                <th class="px-2 py-7 text-center leading-tight">Emergency Contact</th>
                <th class="px-3 py-7">Guardian Name</th>
                <th class="px-1 py-7 text-center leading-tight">Duration<br />of Stay</th>
                <th class="px-2 py-7 text-center leading-tight">Monthly<br />Rent</th>
                <th class="px-2 py-7 text-center leading-tight">Total<br />Payment</th>
                <th class="px-2 py-7 text-center leading-tight bg-emerald-50 text-emerald-700">Initial Payment<br />Due (Move-in)</th>
                <th class="px-2 py-7 text-center action-col no-print">Action/Status</th>
              </tr>
            </thead>
            <tbody class="text-[13px] font-semibold text-slate-700 divide-y divide-slate-100">
              <template v-for="hName in groupedHouses" :key="hName">
                
                <!-- House Group Header -->
                <tr class="bg-blue-50/50 house-group-header">
                  <td colspan="14" class="px-6 py-4 border-y border-blue-100">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-3">
                        <div class="w-8 h-8 bg-[#2a528a] rounded-lg flex items-center justify-center text-white">
                          <i class="fa-solid fa-house-chimney text-sm"></i>
                        </div>
                        <div>
                          <h3 class="text-[11px] font-black text-[#2a528a] uppercase tracking-widest leading-none mb-1">{{ hName }}</h3>
                          <p class="text-[9px] text-slate-400 font-bold uppercase tracking-tighter italic">
                            {{ getHouseBookings(hName)[0]?.house_location }}
                          </p>
                        </div>
                      </div>
                      <span class="bg-blue-600/10 text-blue-700 text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                        {{ getHouseBookings(hName).length }} Total Bookings
                      </span>
                    </div>
                  </td>
                </tr>

                <!-- Bookings Loop -->
                <tr v-for="booking in getHouseBookings(hName)" :key="booking.id" class="hover:bg-slate-50/20 transition-colors">
                  <td class="px-4 py-8 font-mono text-[10px]">
                    REF-{{ booking.id.toString().padStart(4, '0') }}
                  </td>
                  <td class="px-4 py-8 leading-relaxed font-bold text-slate-900">
                    {{ booking.student_name }}
                  </td>
                  <td class="px-1 py-8 text-center">{{ booking.age || 'N/A' }}</td>
                  <td class="px-2 py-8 text-center leading-tight">
                    <span class="text-slate-900 font-bold">Room {{ booking.room_number }}</span><br />
                    <span class="text-[9px] font-black uppercase tracking-tighter" :class="[booking.room_gender === 'female' ? 'text-pink-500' : 'text-blue-500']">{{ booking.room_gender }}</span>
                  </td>
                  <td class="px-2 py-8 text-center leading-tight">
                    <span v-if="booking.check_in_date">
                      {{ new Date(booking.check_in_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
                    </span>
                    <span v-else class="text-orange-400">Not set</span>
                  </td>
                  <td class="px-3 py-8 leading-tight text-[11px] whitespace-normal min-w-[200px]">
                    {{ booking.address || 'N/A' }}
                  </td>
                  <td class="px-2 py-8 text-center leading-tight text-[11px]">
                    {{ booking.contact_number || 'N/A' }}
                  </td>
                  <td class="px-2 py-8 text-center leading-tight text-[11px]">
                    {{ booking.emergency_contact || 'N/A' }}
                  </td>
                  <td class="px-3 py-8 leading-tight font-bold text-slate-800">
                    {{ booking.guardian_name || 'N/A' }}
                  </td>
                  <td class="px-1 py-8 text-center font-bold text-blue-600">{{ booking.months }} Months</td>
                  <td class="px-2 py-8 text-center font-semibold text-slate-500">₱{{ Number(booking.monthly_rent || 0).toLocaleString() }}</td>
                  <td class="px-2 py-8 text-center font-black text-slate-900">₱{{ Number(booking.amount).toLocaleString() }}</td>
                  <td class="px-2 py-8 text-center bg-emerald-50/30">
                    <div v-if="booking.initial_payment > 0">
                      <span class="block text-sm font-black text-emerald-700">₱{{ Number(booking.initial_payment).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
                      <span class="block text-[8px] font-bold text-slate-400 mt-0.5 leading-tight">
                        Adv: ₱{{ (parseInt(booking.advance_months || 0) * parseFloat(booking.monthly_rent || 0)).toLocaleString('en-US', {minimumFractionDigits:2}) }} +<br />
                        Dep ({{ booking.deposit_type === 'consumable' ? 'Consum' : 'Refund' }}): ₱{{ ((parseInt(booking.deposit_months || 0) * parseFloat(booking.monthly_rent || 0)) + parseFloat(booking.deposit_fixed_amount || 0)).toLocaleString('en-US', {minimumFractionDigits:2}) }}
                      </span>
                    </div>
                    <span v-else class="text-slate-300 text-[10px] font-bold">—</span>
                  </td>
                  
                  <td class="px-2 py-8 text-center action-col no-print">
                    <!-- Extension actions -->
                    <div v-if="booking.is_extension_requested" class="bg-amber-50 border border-amber-200 p-2 rounded-xl mb-2">
                      <p class="text-[9px] font-black text-amber-700 uppercase leading-tight mb-1">Extension: +{{ booking.extension_months }} Months</p>
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
                    <div v-if="booking.status === 'pending'" class="flex flex-col gap-2">
                      <button @click="handleApprove(booking)" class="w-full bg-[#108548] text-white px-3 py-1.5 rounded-lg font-black text-[9px] hover:bg-emerald-700 transition shadow-sm uppercase tracking-widest focus:outline-none">
                        Approve
                      </button>
                      <button @click="handleReject(booking)" class="w-full bg-red-500 text-white px-3 py-1.5 rounded-lg font-black text-[9px] hover:bg-red-700 transition shadow-sm uppercase tracking-widest focus:outline-none">
                        Reject
                      </button>
                    </div>
                    <div v-else-if="booking.status === 'confirmed'" class="flex flex-col gap-2">
                      <span class="bg-green-100 text-green-700 text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-widest">Approved</span>
                      <button v-if="booking.payment_status !== 'paid'" @click="handleMarkPaid(booking)" class="w-full bg-blue-500 text-white px-3 py-1.5 rounded-lg font-black text-[9px] hover:bg-blue-700 transition shadow-sm uppercase tracking-widest focus:outline-none">
                        Mark Paid
                      </button>
                      <span v-else class="text-emerald-500 text-[9px] font-black uppercase">Paid</span>
                    </div>
                    <span v-else class="text-slate-400 text-[9px] font-black uppercase">{{ booking.status }}</span>
                  </td>
                </tr>

              </template>

              <tr v-if="filteredBookings.length === 0">
                <td colspan="14" class="py-20 text-center text-slate-400 font-bold uppercase tracking-widest">
                  No bookings found under search.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ===== MOBILE CARD VIEW (shown only on mobile) ===== -->
        <div class="mobile-cards-wrapper">
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
              <span class="m-house-count">{{ getHouseBookings(hName).length }} Bookings</span>
            </div>

            <!-- Mobile Booking Cards -->
            <div v-for="booking in getHouseBookings(hName)" :key="'mc-' + booking.id" class="m-card">

              <div class="m-row">
                <span class="m-lbl">Ref No.</span>
                <span class="m-val">{{ booking.id }}</span>
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
                    Dep ({{ booking.deposit_type === 'consumable' ? 'Consum' : 'Refund' }}): ₱{{ ((parseInt(booking.deposit_months || 0) * parseFloat(booking.monthly_rent || 0)) + parseFloat(booking.deposit_fixed_amount || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
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
                    <p class="m-ext-title">Extension: +{{ booking.extension_months }} Months</p>
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
          <!-- End of Records -->
          <div v-if="filteredBookings.length > 0" class="m-end-of-records">
            <span class="m-eor-text">End of Records</span>
          </div>
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
  .m-pill-default  { color: #94a3b8; }

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
   PRINT STYLES
====================================================== */
@media print {
  /* 1. Page & Background Reset */
  body, html { 
    background: #ffffff !important; 
    margin: 0 !important; 
    padding: 0 !important; 
    width: 100% !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* 2. */
  .no-print, nav, footer, button, .control-bar, .fixed, .backdrop-blur-sm { 
    display: none !important; 
  }

  /* 3. */
  body > div, #app, main { 
    display: block !important;
    width: 100% !important; 
    max-width: 100% !important; 
    margin: 0 !important; 
    padding: 0 !important; 
    zoom: normal !important;
  }

  /* 4. */
  .bg-white, main > div, .max-w-7xl, .max-w-6xl, .max-w-5xl, .container { 
    background: transparent !important;
    background-color: transparent !important;
    border: none !important; 
    box-shadow: none !important; 
    overflow: visible !important;
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  
  .overflow-hidden { 
    overflow: visible !important; 
  }

  /* 5. Header Section */
  .print-header, header, .text-center {
    width: 100% !important;
    max-width: 100% !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
    margin-bottom: 20px !important;
    background: transparent !important;
  }

  /* 6. Table Layout */
  .booking-table-wrapper { 
    display: block !important; 
    width: 100% !important;
    max-width: 100% !important;
    overflow: visible !important;
  }
  
  .mobile-cards-wrapper { 
    display: none !important; 
  }

  table { 
    display: table !important;
    font-size: 9px !important; 
    width: 100% !important; 
    max-width: 100% !important;
    table-layout: auto !important; 
    border-collapse: collapse !important; 
  }

  thead { display: table-header-group !important; }
  tbody { display: table-row-group !important; }
  tr { display: table-row !important; page-break-inside: avoid; }

  th, td { 
    display: table-cell !important;
    border: 0.5px solid #94a3b8 !important; 
    padding: 6px 8px !important;
    color: #0f172a !important;
    line-height: 1.3 !important;
    vertical-align: middle !important;
  }

  th:nth-child(n), td:nth-child(n) { 
    width: auto !important; 
  }

  th { 
    background: #f1f5f9 !important; 
    font-weight: bold !important;
    -webkit-print-color-adjust: exact !important; 
    print-color-adjust: exact !important; 
  }
  
  .house-group-header { 
    background: #e2e8f0 !important; 
    font-weight: bold !important;
    -webkit-print-color-adjust: exact !important; 
    print-color-adjust: exact !important; 
  }
  
  .action-col { 
    display: none !important; 
  } 

  @page { 
    size: landscape; 
    margin: 1cm 1.2cm; 
  }
}
</style>