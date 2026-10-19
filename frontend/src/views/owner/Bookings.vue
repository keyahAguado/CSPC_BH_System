<script setup>
import BookingTestClock from '../../components/BookingTestClock.vue';
import { confirmTone } from '../../utils/confirmTone.js';
import { ownerDate, ownerDay, ownerStayEnd, ownerMoney, ownerBookingReference } from '../../utils/ownerBookingDisplay.js';
import OwnerBookingWorkspace from '../../components/OwnerBookingWorkspace.vue';
import LoadError from '../../components/management/LoadError.vue';

import '../../styles/management.css';
import '../../styles/admin-theme.css';
import '../../styles/owner-pages.css';
import { vManagementDialog } from '../../components/management/dialogAccessibility.js';
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import OwnerNav from '../../components/partials/OwnerNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';

const route = useRoute();

const bookings = ref([]);
const houseName = ref('');
const houseId = ref(route.query.houseId || '');
const isLoading = ref(true);
const reportDate = ref(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));

const workspaceRows = ref(null);

const alertRef = ref(null);
const token = sessionStorage.getItem('cspc_token');

// Modal States
const showModal = ref(false);
const modalTitle = ref('');
const modalText = ref('');
// Optional label/value rows shown under the message (for example, extension details).
const modalDetails = ref([]);
const modalConfirmAction = ref(null);
const modalType = ref('info');

const showSystemAlert = (message, type = 'error') => {
  if (alertRef.value) {
    alertRef.value.showSystemAlert(message, type);
  }
};

const isProcessingDecision = ref(false);

const triggerConfirmModal = (title, text, type, confirmAction, details = []) => {
  if (isProcessingDecision.value) return;
  modalTitle.value = title;
  modalText.value = text;
  modalDetails.value = details;
  modalType.value = type;
  modalConfirmAction.value = confirmAction;
  showModal.value = true;
};

const executeConfirm = async () => {
  if (isProcessingDecision.value || !modalConfirmAction.value) return;
  const action = modalConfirmAction.value;
  modalConfirmAction.value = null;
  isProcessingDecision.value = true;
  showModal.value = false;
  try {
    await action();
  } finally {
    isProcessingDecision.value = false;
  }
};

// Rows from manually added non-CSPC boarders share the list with bookings
const rowKey = (b) => (b.is_non_cspc ? 'nc-' : 'b-') + b.id;
const refLabel = (b) => (b.is_non_cspc
  ? (b.reference_no || `NC-${b.id.toString().padStart(4, '0')}`)
  : `REF-${b.id.toString().padStart(4, '0')}`);

// silent: background refresh (no spinner, no error toast) used to keep the list in sync with
// student actions such as withdrawing an extension request
const fetchBookings = async (silent = false) => {
  if (silent) {
    if (isLoading.value) return;
    try {
      let url = `/api/owner/bookings`;

      const response = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      if (response.data.success) {
        bookings.value = response.data.bookings || [];
        houseName.value = response.data.houseName || houseName.value;
      }
    } catch (error) { /* keep showing the current list; the next refresh will retry */ }
    return;
  }
  loadError.value = '';
  try {
    isLoading.value = true;
    let url = `/api/owner/bookings`;


    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      bookings.value = response.data.bookings || [];
      houseName.value = response.data.houseName || '';
    }
  } catch (error) {
    loadError.value = 'The server did not return these records. Refresh the page to try again.';
    console.error('Failed to load bookings:', error);
    showSystemAlert('Could not fetch bookings list.', 'warning');
  } finally {
    isLoading.value = false;
  }
};

const filteredBookings = computed(() => workspaceRows.value ?? bookings.value);

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

const getAllHouseBookings = (houseName) => {
  return filteredBookings.value.filter(b => b.house_name === houseName);
};

const handleApprove = (booking) => {
  triggerConfirmModal(
    'Approve Booking?',
    `Approve the reservation for ${booking.student_name}?\n\n${booking.payment_method === 'cash' ? 'Approval reserves the booked dates. Cash is due at arrival and remains unpaid until you record collection.' : 'The student has 24 hours after approval to pay online, or until the end of the check-in day if that is sooner. If payment is not verified by the deadline, the reservation expires.'}\n\nThe eligible stay starts automatically on the booked check-in date. Checkout remains the booked end date.`,
    'success',
    async () => {
      try {
        const response = await axios.post(`/api/owner/bookings/approve/${booking.id}`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data.success) {
          showSystemAlert(response.data.message || 'Booking confirmed and student notified!', 'success');
          await fetchBookings(true);
        }
      } catch (error) {
        showSystemAlert(error.response?.data?.message || 'Approval failed.', 'error');
        if ([404, 409].includes(error.response?.status)) await fetchBookings(true);
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
          fetchBookings(true);
        }
      } catch (error) {
        showSystemAlert('Rejection failed.', 'error');
      }
    }
  );
};

// 409 = the request is no longer pending (the student withdrew it, or it was already decided)
const extensionActionFailed = (error, fallback) => {
  if (error?.response?.status === 409) {
    showSystemAlert(error?.response?.data?.message || 'This extension request is no longer pending — the student may have withdrawn it. The list has been updated.', 'warning');
    fetchBookings(true);
    return;
  }
  showSystemAlert(error?.response?.data?.message || fallback, 'error');
};

const extensionDetails = (booking) => {
  const months = Number(booking.extension_months) || 0;
  const start = ownerDay(booking.occupant_check_in || booking.check_in_date);
  const newEnd = computeCheckoutDate(start, (Number(booking.months) || 0) + months);
  const rent = Number(booking.monthly_rent) || 0;
  return [
    ['Resident', booking.student_name || 'Not recorded'],
    ['Booking', ownerBookingReference(booking) + (booking.room_number ? ' · Room ' + booking.room_number : '') + (booking.house_name ? ' · ' + booking.house_name : '')],
    ['Extension requested', '+' + months + ' month' + (months === 1 ? '' : 's')],
    ['Current checkout', ownerDate(ownerStayEnd(booking))],
    ['New checkout if approved', newEnd ? ownerDate(`${newEnd.getFullYear()}-${String(newEnd.getMonth() + 1).padStart(2, '0')}-${String(newEnd.getDate()).padStart(2, '0')}`) : 'Not available'],
    ['Added rent', rent ? '₱' + ownerMoney(rent * months) + ' (' + months + ' × ₱' + ownerMoney(rent) + '/month)' : 'Not recorded']
  ];
};

const handleApproveExtension = (booking) => {
  const months = Number(booking.extension_months) || 0;
  triggerConfirmModal(
    'Approve stay extension?',
    `${booking.student_name || 'The resident'} asked to stay ${months} more month${months === 1 ? '' : 's'}. Approval checks other stays and future reservations for the added dates; monthly rent for the added months is tracked as usual.`,
    'success',
    async () => {
      try {
        const response = await axios.post(`/api/owner/bookings/approve-extension/${booking.id}`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data.success) {
          showSystemAlert('Stay extension approved!', 'success');
          fetchBookings(true);
        }
      } catch (error) {
        extensionActionFailed(error, 'Failed to approve extension.');
      }
    },
    extensionDetails(booking)
  );
};

const handleRejectExtension = (booking) => {
  triggerConfirmModal(
    'Reject stay extension?',
    `Reject ${booking.student_name || 'the resident'}'s request to stay longer? Their booked checkout stays the same, and they are notified.`,
    'warning',
    async () => {
      try {
        const response = await axios.post(`/api/owner/bookings/reject-extension/${booking.id}`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data.success) {
          showSystemAlert('Stay extension rejected.', 'info');
          fetchBookings(true);
        }
      } catch (error) {
        extensionActionFailed(error, 'Failed to reject extension.');
      }
    },
    extensionDetails(booking)
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
      fetchBookings(true);
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

import { computeCheckoutDate, formatCheckoutDateString } from '../../utils/dateHelper.js';

const getCheckoutDateDisplay = (booking) => {
  const checkIn = booking.check_in_date;
  if (!checkIn) return '—';
  const computedDate = computeCheckoutDate(checkIn, booking.months);
  return formatCheckoutDateString(computedDate);
};

// Keep the list current while the page stays open (e.g. a student withdraws an extension request)
let refreshTimer = null;
const refreshWhenVisible = () => { if (document.visibilityState === 'visible') fetchBookings(true); };

onMounted(() => {
  fetchBookings();
  refreshTimer = setInterval(refreshWhenVisible, 30000);
  document.addEventListener('visibilitychange', refreshWhenVisible);
  window.addEventListener('focus', refreshWhenVisible);
});

onUnmounted(() => {
  clearInterval(refreshTimer);
  document.removeEventListener('visibilitychange', refreshWhenVisible);
  window.removeEventListener('focus', refreshWhenVisible);
});

const loadError = ref('');
</script>

<template>
  <div class="management-page owner-page owner-bookings-page bg-slate-100 min-h-screen flex flex-col font-sans">
    <div class="no-print">
      <OwnerNav />
    </div>
    <div aria-live="polite" aria-atomic="false"><FlashAlert ref="alertRef" /></div>

    <!-- Confirmation Modal Overlay -->
    <div v-management-dialog="{ close: () => showModal = false }" v-if="showModal" class="cm-backdrop">
      <div class="cm-panel popup-panel" role="dialog" aria-modal="true">
        <div class="cm-body">
          <span :class="['cm-icon', confirmTone(modalTitle, modalType).tone]" aria-hidden="true"><i :class="['fa-solid', confirmTone(modalTitle, modalType).icon]"></i></span>
          <div><h3 class="cm-title">{{ modalTitle }}</h3><p class="cm-message popup-message">{{ modalText }}</p><dl v-if="modalDetails.length" class="cm-facts"><div v-for="[label, value] in modalDetails" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div></dl></div>
        </div>
        <div class="cm-actions">
          <button type="button" class="cm-btn cm-cancel" @click="showModal = false">Cancel</button>
          <button type="button" :class="['cm-btn', confirmTone(modalTitle, modalType).button]" :disabled="isProcessingDecision" @click="executeConfirm">Confirm</button>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <main id="management-content" tabindex="-1" class="flex-1 max-w-[1700px] mx-auto w-[96%] py-12 px-2 lg:px-6">
      <BookingTestClock />
      <LoadError :message="loadError" />

      <!-- Header Section -->
      <div class="text-left">
        <!-- Hidden Template for PDF Direct Download & Print -->
        <div id="pdf-report-template" class="hidden print:block">
          <!-- Print Only Header -->
          <div class="hidden print:flex flex-row justify-between items-center border-b-2 border-slate-300 pb-6 mb-8 text-left">
            <div class="flex items-center gap-6">
              <img src="/img/CSPC_logo.png" class="w-16 h-16 object-contain" />
              <div>
                <h1 class="text-xl font-semibold text-slate-900 uppercase tracking-tight">CSPC Boarding House Management System</h1>
                <p class="text-sm font-semibold text-[#2a528a] uppercase tracking-wider mt-0.5">Property Booking Monitoring Report</p>
              </div>
            </div>
            <div class="text-right">
              <p class="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">REPORT DATE</p>
              <p class="font-bold text-slate-900 text-base">{{ reportDate }}</p>
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
              <div v-for="booking in getAllHouseBookings(hName)" :key="'p-' + rowKey(booking)" class="print-booking-card">
                <!-- Card Header Row -->
                <div class="print-card-header">
                  <div class="print-ref-block">
                    <span class="print-ref-no">{{ refLabel(booking) }}</span>
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
        </div>


      </div>

      <!-- Main Loader state -->
      <div v-if="isLoading" class="bg-white rounded-[1.5rem] p-20 shadow-xl border border-slate-200 text-center flex flex-col items-center justify-center">
        <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
        <p class="text-slate-400 font-bold uppercase text-[12px] tracking-wide">Loading bookings records...</p>
      </div>

      <template v-else>
        <OwnerBookingWorkspace :bookings="bookings" :initial-property="String(houseId)" :initial-booking="String(route.query.bookingId || '')" :busy="isProcessingDecision" @report-rows="workspaceRows=$event" @print="handlePrint" @approve="handleApprove" @reject="handleReject" @approve-extension="handleApproveExtension" @reject-extension="handleRejectExtension" @mark-paid="handleMarkPaid" @changed="fetchBookings(true)" @notice="n=>typeof n==='string' ? showSystemAlert(n,'success') : showSystemAlert(n?.message,n?.tone || 'success')" />

      </template>

    </main>
  </div>
</template>

<style>
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
