<script setup>
import {reservationClosureMessage} from '../../utils/reservationDeadline.js';
import RenewalDecisionNotice from '../../components/RenewalDecisionNotice.vue';
import CancellationReviewSummary from '../../components/CancellationReviewSummary.vue';
import BookingFlowNotice from '../../components/BookingFlowNotice.vue';
import AppDialog from '../../components/AppDialog.vue';
import { PAID_RESERVATION_POLICY, paymentException, paymentExceptionMessage } from '../../utils/paidReservationPolicy.js';
import ReservationDeadline from '../../components/ReservationDeadline.vue';
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import StudentNav from '../../components/partials/StudentNav.vue';
import { escapeHtml } from '../../utils/htmlHelper.js';
import { useOfflineStatus } from '../../utils/offlineHelper.js';
import { computeCheckoutDate } from '../../utils/dateHelper.js';
import {
  formatMoney, formatLongDate, formatCalendarLong, monthsLabel, bookingAddress, bookingReference,
  checkInDateOf, checkOutDateOf, paymentMethodLabel, paymentNeedsReview, moveInBreakdownText,
  bookingStatusBadge, paymentStatusBadge, BADGE_TONE_CLASSES, needsOnlinePayment, isActiveBooking,
  depositTypeLabel, depositTypeNote, advanceRentLine, depositLine
} from '../../utils/studentBookings.js';

const route = useRoute();
const token = sessionStorage.getItem('cspc_token');
const { isOffline } = useOfflineStatus();

const booking = ref(null);
const house = ref(null);
const isLoading = ref(true);
const loadError = ref(false);
const notFound = ref(false);
const alerts = ref([]);

const showCancelConfirmModal = ref(false);
const showReceiptModal = ref(false);
const showContact = ref(false);
const showExtendForm = ref(false);
const extensionMonths = ref(1);
const isPaying = ref(false);
const onlineAvailable = ref(null), showCashRecovery = ref(false), cashRecoveryAccepted = ref(false), isRequestingCash = ref(false);
const requestCashPayment = async () => {
  if(!cashRecoveryAccepted.value || !booking.value)return;
  isRequestingCash.value=true;
  try {
    const result=await axios.post('/api/student/bookings/request-cash/'+booking.value.id,{confirm:true},{headers:{Authorization:'Bearer '+token},timeout:60000});
    showCashRecovery.value=false;cashRecoveryAccepted.value=false;
    showSystemAlert(result.data.message,'success');await fetchBooking();
  }catch(error){showCashRecovery.value=false;showSystemAlert(error.response?.data?.message||'Cash payment could not be requested. Refresh your booking; do not pay twice.','error');}
  finally{isRequestingCash.value=false;}
};

// Displays the slide-in toast notification banner in the upper right
const showSystemAlert = (message, type = 'error') => {
  const id = 'alert-' + Date.now();
  const configs = {
    success: { borderClass: 'border-emerald-500', iconClass: 'fa-circle-check', iconColorClass: 'text-emerald-500', title: 'Action Successful' },
    error: { borderClass: 'border-slate-800', iconClass: 'fa-circle-info', iconColorClass: 'text-slate-600', title: 'System Notice' },
    warning: { borderClass: 'border-amber-500', iconClass: 'fa-triangle-exclamation', iconColorClass: 'text-amber-500', title: 'Attention Required' },
    info: { borderClass: 'border-blue-500', iconClass: 'fa-circle-info', iconColorClass: 'text-blue-500', title: 'Information' }
  };
  const config = configs[type] || configs.error;
  alerts.value.push({ id, message, type, ...config });
  setTimeout(() => closeAlert(id), 7000);
};

const closeAlert = (id) => {
  alerts.value = alerts.value.filter(a => a.id !== id);
};

// Contact details and map position come from the public house listing (same API as Property Details)
const fetchHouse = async (houseId) => {
  if (!houseId) return;
  try {
    const res = await axios.get(`/api/student/house/${houseId}`);
    house.value = res.data?.house || null;
  } catch (e) {
    house.value = null;
  }
};

const fetchBooking = async () => {
  try {
    isLoading.value = true;
    loadError.value = false;
    notFound.value = false;
    const res = await axios.get('/api/student/bookings', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const found = (res.data.bookings || []).find(b => String(b.id) === String(route.params.id));
    booking.value = found || null;
    onlineAvailable.value = null;
    if(found && found.payment_method==='paymongo' && ['pending','confirmed'].includes(found.status) && found.payment_status!=='paid' && !found.paymongo_payment_id){
      try{onlineAvailable.value=(await axios.get('/api/payment/availability/'+found.house_id,{timeout:8000})).data.available===true;}catch{}
    }
    notFound.value = !found;
    if (found) fetchHouse(found.house_id);
  } catch (e) {
    console.error('Failed to load booking', e);
    loadError.value = true;
  } finally {
    isLoading.value = false;
  }
};

// ── Existing booking actions (same API calls and rules as before) ─────────────
const execCancelReservation = async () => {
  showCancelConfirmModal.value = false;
  if (!booking.value) return;
  try {
    const res = await axios.post(`/api/student/bookings/cancel/${booking.value.id}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.data.success) {
      showSystemAlert('Reservation request cancelled successfully.', 'success');
      await fetchBooking();
    }
  } catch (err) {
    console.error('Cancel booking failed:', err);
    showSystemAlert(err.response?.data?.message || 'Unable to cancel. Please check your connection and try again.', 'error');
  }
};

const requestExtension = async () => {
  const months = extensionMonths.value || 1;
  try {
    await axios.post(`/api/student/bookings/extend/${booking.value.id}`, { extension_months: months }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    await fetchBooking();
    showExtendForm.value = false;
    showSystemAlert('Stay extension request submitted successfully.', 'success');
  } catch (e) {
    console.error('Extension failed', e);
    showSystemAlert(e.response?.data?.message || 'Unable to submit extension. Please check your connection and try again.', 'error');
  }
};

// Withdraws a pending extension request (the booking itself only changes once an owner approves)
const showCancelExtensionModal = ref(false);
const isCancellingExtension = ref(false);
const cancelExtensionRequest = async () => {
  if (isCancellingExtension.value || !booking.value) return;
  try {
    isCancellingExtension.value = true;
    await axios.post(`/api/student/bookings/extension/cancel/${booking.value.id}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    showCancelExtensionModal.value = false;
    showSystemAlert('Your extension request was cancelled.', 'success');
    await fetchBooking();
  } catch (e) {
    console.error('Cancel extension failed', e);
    showCancelExtensionModal.value = false;
    showSystemAlert(e.response?.data?.message || 'Unable to cancel the extension request. Please check your connection and try again.', 'error');
    await fetchBooking();
  } finally {
    isCancellingExtension.value = false;
  }
};

// Pay buttons open the policy confirmation; checkout starts only after the student accepts it.
const showPayPolicyModal = ref(false);
const payPolicyAccepted = ref(false);
const triggerPayment = () => {
  if (isPaying.value || !booking.value) return;
  payPolicyAccepted.value = false;
  showPayPolicyModal.value = true;
};

const confirmPayment = async () => {
  if (isPaying.value || !booking.value || !payPolicyAccepted.value) return;
  try {
    isPaying.value = true;
    // Create PayMongo checkout session
    const response = await axios.post(`/api/payment/checkout`, {
      bookingId: booking.value.id,
      acceptPaidReservationPolicy: true
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success && response.data.checkoutUrl) {
      // Redirect student to PayMongo Hosted Checkout Page
      window.location.href = response.data.checkoutUrl;
    } else if (response.data.success) {
      showPayPolicyModal.value = false;
      showSystemAlert(response.data.message || 'Payment verified.', response.data.requiresReview ? 'error' : 'success');
      await fetchBooking();
    }
  } catch (error) {
    console.error('[PAYMENT ERROR] Failed to initialize checkout:', error);
    showPayPolicyModal.value = false;
    showSystemAlert(error.response?.data?.message || 'Unable to start payment. Please check your connection and try again.', 'error');
  } finally {
    isPaying.value = false;
  }
};

const getReceiptRentLabel = (b) => {
  const months = parseInt(b.advance_months || 0);
  return months > 0 ? `Advance Rent (${months} Mo)` : 'First Month Rent';
};

const getReceiptRentAmount = (b) =>
  Math.max(1, parseInt(b.advance_months || 0)) * parseFloat(b.monthly_rent || 0);

// Compact receipt print window (unchanged receipt format)
const printReceipt = () => {
  if (!booking.value) return;
  const r = booking.value;

  const advanceAmt = getReceiptRentAmount(r).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const depositAmt = (parseInt(r.deposit_months || 0) * parseFloat(r.monthly_rent || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const totalAmt = parseFloat(r.initial_payment || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const refNo = `REF-${r.id.toString().padStart(4, '0')}`;
  const printDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const depositLine = parseInt(r.deposit_months) > 0
    ? `<tr><td>Security Deposit (${escapeHtml(r.deposit_months)} Mo, ${depositTypeLabel(r)})</td><td class="amt">&#8369;${depositAmt}</td></tr>`
    : '';

  const checkInDateRaw = r.occupant_check_in || r.check_in_date;
  const checkInDisplay = checkInDateRaw
    ? new Date(checkInDateRaw).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—';
  const checkOutDate = computeCheckoutDate(checkInDateRaw, r.months, 0);
  const checkOutDisplay = checkOutDate
    ? checkOutDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—';

  const win = window.open('', '_blank');
  if (!win) { alert('Pop-up blocked. Please allow pop-ups and try again.'); return; }

  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Receipt ${escapeHtml(refNo)}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 9pt; color: #1e293b; background: #fff; width: 80mm; padding: 6mm 8mm 10mm; }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .upper { text-transform: uppercase; }
    .divider { border: none; border-top: 1px dashed #94a3b8; margin: 6px 0; }
    .divider-solid { border: none; border-top: 1.5px solid #1e293b; margin: 6px 0; }
    .logo-section { text-align: center; padding-bottom: 8px; }
    .logo-section img { width: 40px; height: 40px; object-fit: contain; }
    .org { font-size: 8pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; }
    .sub { font-size: 6.5pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px; }
    .title { font-size: 11pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; margin: 6px 0 2px; }
    .ref { font-size: 8pt; color: #2563eb; font-weight: 700; letter-spacing: 0.1em; }
    table { width: 100%; border-collapse: collapse; margin: 4px 0; }
    table td { padding: 2px 0; font-size: 8.5pt; vertical-align: top; }
    table td.label { color: #64748b; width: 45%; }
    table td.value { font-weight: 700; text-align: right; }
    .breakdown td { padding: 1.5px 0; font-size: 8pt; }
    .breakdown td.amt { text-align: right; font-weight: 700; }
    .total-row td { font-size: 10pt; font-weight: 900; padding-top: 4px; }
    .total-row td.amt { color: #059669; }
    .footer { text-align: center; font-size: 7pt; color: #94a3b8; margin-top: 8px; line-height: 1.5; }
    .status-badge { display: inline-block; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; padding: 1px 8px; border-radius: 10px; font-size: 7pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; }
  </style>
</head>
<body>
  <div class="logo-section">
    <img src="/img/CSPC_logo.png" alt="CSPC" onerror="this.style.display='none'" />
    <div class="org">Camarines Sur Polytechnic Colleges</div>
    <div class="sub">Boarding House Management System</div>
  </div>
  <hr class="divider-solid" />
  <div class="center title">Payment Receipt</div>
  <div class="center ref">${escapeHtml(refNo)}</div>
  <div class="center" style="margin-top:3px"><span class="status-badge">Paid &mdash; ${escapeHtml(receiptPaymentMethod(r))}</span></div>
  <hr class="divider" />
  <table>
    <tr><td class="label">Printed On</td><td class="value">${printDate}</td></tr>
    <tr><td class="label">Resident</td><td class="value upper">${escapeHtml(r.resident_name || '')}</td></tr>
    <tr><td class="label">Boarding House</td><td class="value upper">${escapeHtml(r.house_name || '')}</td></tr>
    <tr><td class="label">Room</td><td class="value">Room ${escapeHtml(r.room_number || 'N/A')}</td></tr>
    <tr><td class="label">Duration</td><td class="value">${escapeHtml(r.months || 0)} Month(s)</td></tr>
    <tr><td class="label">Check-In</td><td class="value">${checkInDisplay}</td></tr>
    <tr><td class="label">Check-Out</td><td class="value" style="color:#2563eb">${checkOutDisplay}</td></tr>
    <tr><td class="label">Monthly Rent</td><td class="value">&#8369;${parseFloat(r.monthly_rent || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
  </table>
  <hr class="divider" />
  <table class="breakdown">
    <tr><td colspan="2" style="font-size:7pt;font-weight:900;text-transform:uppercase;color:#94a3b8;letter-spacing:0.1em;padding-bottom:3px">Move-in Cost Breakdown</td></tr>
    <tr><td>${escapeHtml(getReceiptRentLabel(r))}</td><td class="amt">&#8369;${advanceAmt}</td></tr>
    ${depositLine}
    <tr class="total-row"><td class="bold upper">Total Paid</td><td class="amt">&#8369;${totalAmt}</td></tr>
  </table>
  <hr class="divider-solid" />
  <div class="footer">Official receipt for move-in cost payment.<br/>Keep this for your records.</div>
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); setTimeout(function() { window.close(); }, 500); }, 400);
    });
    window.onafterprint = function() { window.close(); };
  <\/script>
</body>
</html>`);
  win.document.close();
};

const receiptPaymentMethod = (b) => {
  if (b.payment_method === 'paymongo') return 'PayMongo';
  if (b.payment_method === 'cash') return 'Cash';
  return 'Not recorded';
};


// ── Derived display state ────────────────────────────────────────────────────
const b = computed(() => booking.value || {});
const needsReview = computed(() => !!booking.value && paymentNeedsReview(booking.value));
const isPaid = computed(() => paymentStatusBadge(b.value).label === 'Paid');
const isConfirmed = computed(() => b.value.status === 'confirmed');

const canCancel = computed(() => !needsReview.value && !isPaid.value && !b.value.paymongo_payment_id && (
  b.value.status === 'pending' || (isConfirmed.value && !isPaid.value && (b.value.payment_method === 'paymongo' || (Number(b.value.move_in_required) === 1 && !b.value.move_in_confirmed_at)))
));
const canPayOnline = computed(() => !!booking.value && needsOnlinePayment(booking.value));
const canRequestCash = computed(() => onlineAvailable.value===false && ['pending','confirmed'].includes(b.value.status) && b.value.payment_method==='paymongo' && !isPaid.value && !b.value.paymongo_payment_id && !needsReview.value && !b.value.move_in_confirmed_at);
const canPrintReceipt = computed(() => !needsReview.value && isConfirmed.value && isPaid.value);
const canRequestExtension = computed(() => canPrintReceipt.value && !b.value.is_extension_requested && (Number(b.value.move_in_required) !== 1 || !!b.value.move_in_confirmed_at));
const canCancelExtension = computed(() => isConfirmed.value && !!b.value.is_extension_requested);
// Directions and owner contact only matter while the stay is pending or ongoing
const showGettingThere = computed(() => !!booking.value && isActiveBooking(booking.value));
// The cancellation review gets its own card; its header shows whether the review is open or completed.
const cancellationReview = computed(() => { try { const r = JSON.parse(b.value.cancellation_review || 'null'); return r && r.status !== 'withdrawn' ? r : null; } catch { return null; } });
const hasAnyAction = computed(() => canRequestCash.value || canPayOnline.value || canPrintReceipt.value || showGettingThere.value || canCancel.value);

const nextSteps = computed(() => {
  const x = b.value;
  if (x.occupancy_start_issue) return 'Your scheduled stay needs owner review. Contact the owner; your booked dates have not changed.';
  if (needsReview.value) return paymentException(x) ? paymentExceptionMessage(x) : 'Your payment was received but is not linked to a started stay. Contact the owner to settle it outside the platform. Do not pay again.';
  if (x.status === 'pending') return 'Your reservation request is waiting for the owner\'s review. You will be notified once it is confirmed or declined.';
  if (x.status === 'confirmed' && Number(x.move_in_required) === 1 && !x.move_in_confirmed_at) return x.payment_method === 'cash' ? 'Your bed is reserved. The stay starts automatically on the booked check-in date. Pay cash to the owner at move-in; the booked checkout does not change.' : x.payment_status === 'paid' ? 'Your payment is verified. Your stay starts automatically on its booked check-in date and retains the booked checkout date.' : 'Pay online within the approval deadline. Your secured stay starts automatically on the booked check-in date.';
  if (x.status === 'confirmed' && x.move_in_confirmed_at) return isPaid.value ? 'Your booked stay is active and your upfront payment is recorded. Keep the scheduled checkout date; request approval for any extension.' : 'Your booked stay is active. Pay the upfront cash cost to the owner at move-in; payment remains unpaid until collection is recorded.';
  if (x.status === 'confirmed') {
    if (isPaid.value) {
      return x.is_extension_requested
        ? `Your payment is settled. Your stay extension request (+${monthsLabel(x.extension_months).toLowerCase()}) is waiting for the owner's approval.`
        : 'Your payment is settled and your room is reserved for the dates shown. You can print your receipt or request a stay extension.';
    }
    if (x.payment_method === 'paymongo') {
      return x.payment_status === 'failed'
        ? 'Your last online payment did not go through. Please pay the move-in cost again to secure your room.'
        : 'Pay the move-in cost online to secure your room for the dates shown.';
    }
    return 'Please bring the required payment when you visit the boarding house. Your room is reserved for the dates shown above.';
  }
  if (x.status === 'not_arrived') return 'This stay was closed as "Did not arrive" because you did not arrive, and the bed was released. Your payment record is unchanged. Concerns about the upfront payment are handled with the owner outside the platform.';
  if (x.status === 'completed') {
    return x.occupant_check_out
      ? `Your stay is complete. You checked out on ${formatCalendarLong(x.occupant_check_out)}.`
      : 'Your stay is complete.';
  }
  if (x.status === 'cancelled') return reservationClosureMessage(x) || 'This reservation was cancelled. See the cancellation information for its reason, or browse other boarding houses from Home.';
  if (x.status === 'rejected') return 'The owner declined this reservation request. You can browse other boarding houses from Home.';
  return 'Contact the boarding house if you have questions about this booking.';
});

const locationUrl = computed(() => {
  const h = house.value || {};
  const lat = parseFloat(h.latitude);
  const lng = parseFloat(h.longitude);
  if (!isNaN(lat) && !isNaN(lng)) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  if (typeof h.map_link === 'string' && /^https?:\/\//i.test(h.map_link.trim())) return h.map_link.trim();
  if (!booking.value) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.value.house_name}, ${bookingAddress(b.value)}`)}`;
});

const contactPhone = computed(() => (house.value?.phone_contact || '').trim());
const contactEmail = computed(() => (house.value?.owner_email || '').trim());
// A phone field may hold several numbers ("0912… / 0987…")
const phoneNumbers = computed(() => contactPhone.value.split(/[\/,;]+/).map(p => p.trim()).filter(Boolean));
const hasContact = computed(() => phoneNumbers.value.length > 0 || !!contactEmail.value);

const badgeClass = (badge) => BADGE_TONE_CLASSES[badge.tone] || BADGE_TONE_CLASSES.slate;

onMounted(fetchBooking);
</script>

<template>
  <div class="bg-[#f6f8fb] min-h-screen font-sans text-slate-800 pb-20">
    <StudentNav />

    <!-- Alert Panel (slide-in toasts) -->
    <div class="fixed top-4 left-4 right-4 sm:top-8 sm:left-auto sm:right-8 z-[9999] sm:max-w-sm sm:w-full sm:px-4 pointer-events-none space-y-4">
      <div v-for="alert in alerts" :key="alert.id"
           class="pointer-events-auto relative flex items-stretch bg-white border-l-4 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] rounded-r-xl overflow-hidden"
           :class="alert.borderClass">
        <div class="px-5 py-5 flex items-center justify-center bg-slate-50/50">
          <i class="fa-solid text-xl" :class="[alert.iconClass, alert.iconColorClass]"></i>
        </div>
        <div class="flex-1 p-5 pr-8 text-left">
          <h4 class="text-[14px] font-bold text-slate-800 mb-1">{{ alert.title }}</h4>
          <p class="text-[13px] font-medium text-slate-700 leading-relaxed">{{ alert.message }}</p>
        </div>
        <button @click="closeAlert(alert.id)" aria-label="Dismiss" class="absolute top-3 right-3 text-slate-300 hover:text-slate-900 transition-colors">
          <i class="fa-solid fa-xmark text-xs"></i>
        </button>
      </div>
    </div>

    <main class="max-w-[1240px] mx-auto px-4 sm:px-8 pt-8 lg:pt-10 pb-12 text-left">
      <nav aria-label="Breadcrumb" class="text-[13px] text-slate-500">
        <ol class="flex flex-wrap items-center gap-2">
          <li><router-link to="/student/dashboard" class="hover:text-[#1e4b8f] hover:underline">Home</router-link></li>
          <li aria-hidden="true" class="text-slate-300">/</li>
          <li><router-link to="/student/bookings" class="hover:text-[#1e4b8f] hover:underline">My Bookings</router-link></li>
          <li aria-hidden="true" class="text-slate-300">/</li>
          <li aria-current="page" class="text-slate-700">Booking Details</li>
        </ol>
      </nav>

      <!-- Loading -->
      <div v-if="isLoading" class="mt-8 bg-white rounded-2xl p-20 text-center border border-slate-200 flex flex-col items-center justify-center">
        <div class="w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p class="text-slate-400 font-semibold text-sm">Loading booking details…</p>
      </div>

      <!-- Offline (nothing loaded) -->
      <div v-else-if="isOffline && !booking" class="mt-8 bg-white rounded-2xl p-16 text-center border-2 border-dashed border-amber-200">
        <i class="fa-solid fa-wifi text-3xl text-amber-300 mb-4"></i>
        <p class="text-amber-600 font-bold uppercase tracking-widest text-xs mb-2">No Internet Connection</p>
        <p class="text-slate-400 font-medium text-sm">Please connect to the internet to view this booking.</p>
      </div>

      <!-- Error -->
      <div v-else-if="loadError" class="mt-8 bg-white rounded-2xl p-16 text-center border border-rose-100">
        <i class="fa-solid fa-circle-exclamation text-3xl text-rose-400 mb-4"></i>
        <p class="text-slate-900 font-bold mb-1">Unable to load this booking</p>
        <p class="text-slate-400 text-sm mb-5">Something went wrong. Please try again.</p>
        <button type="button" @click="fetchBooking" class="bg-[#1e4b8f] hover:bg-[#163a70] text-white text-sm font-bold px-5 py-2.5 rounded-lg transition">Retry</button>
      </div>

      <!-- Not found / not this student's booking -->
      <div v-else-if="notFound" class="mt-8 bg-white rounded-2xl p-16 text-center border border-slate-200">
        <i class="fa-solid fa-calendar-xmark text-3xl text-slate-300 mb-4"></i>
        <p class="text-slate-900 font-bold mb-1">Booking not found</p>
        <p class="text-slate-400 text-sm mb-5">This booking doesn't exist or isn't linked to your account.</p>
        <router-link to="/student/bookings" class="text-[#1e4b8f] font-bold text-sm hover:underline">Back to My Bookings</router-link>
      </div>

      <template v-else-if="booking">
        <!-- Title row -->
        <div class="mt-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 class="text-[28px] sm:text-[34px] font-extrabold text-[#0f2a4f] tracking-tight leading-tight">Booking Details</h1>
            <p class="mt-2 text-[11px] sm:text-[12px] font-semibold text-slate-400 uppercase tracking-[0.16em]">Your reservation information</p>
          </div>
          <div class="sm:text-right">
            <p class="text-[12px] text-slate-400">Booked on</p>
            <p class="mt-1 text-[14px] font-bold text-slate-900">{{ formatLongDate(b.booking_date) }}</p>
            <p class="mt-1.5 text-[12px] text-slate-400">Booking ID: <span class="font-bold text-slate-900">#{{ bookingReference(b) }}</span></p>
          </div>
        </div>

        <div class="bd-banner mt-6"><RenewalDecisionNotice :booking="b" @changed="fetchBooking" @notice="showSystemAlert($event, 'success')" /><ReservationDeadline :booking="b" /></div>

        <div v-if="canRequestCash" class="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5" role="status">
          <h3 class="font-bold text-amber-950">Online payment is currently unavailable</h3>
          <p class="mt-2 text-sm leading-relaxed text-amber-900">Contact the owner to restore online payment, or request cash payment below. We must safely close any unpaid checkout first. A cash request returns your booking for owner approval; it does not guarantee a bed. Do not pay twice.</p>
          <button type="button" class="bd-btn mt-4" @click="showCashRecovery = true">Request cash payment</button>
        </div>
        <!-- On smaller screens the Actions panel sits below the booking, so surface payment here -->
        <div v-if="canPayOnline" class="lg:hidden mt-6 bg-orange-50 border border-orange-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
          <div class="flex-1">
            <p class="text-[13px] font-bold text-orange-700">Payment needed</p>
            <p class="mt-0.5 text-[13px] text-slate-600">Your booking is confirmed. Pay the move-in cost of <b class="text-slate-900">₱{{ formatMoney(b.initial_payment) }}</b> online to secure your room.</p>
          </div>
          <button type="button" @click="triggerPayment" :disabled="isPaying" class="bd-btn is-pay shrink-0">
            {{ isPaying ? 'Connecting…' : 'Pay now' }}
          </button>
        </div>

        <div class="mt-7 sm:mt-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)] gap-6 items-start">
          <!-- LEFT: reservation card and cancellation review -->
          <div class="space-y-6 min-w-0">
          <section class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div class="px-5 sm:px-7 pt-6 pb-5 flex items-start justify-between gap-4 border-b border-slate-200">
              <div class="min-w-0">
                <h2 class="text-[20px] sm:text-[22px] font-bold text-slate-900 leading-tight break-words">{{ b.house_name }}</h2>
                <p class="mt-2 text-[13px] text-slate-500 flex items-start gap-1.5">
                  <span class="mt-[6px] w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0"></span>
                  <span>{{ bookingAddress(b) }}</span>
                </p>
              </div>
              <span class="shrink-0 px-3 py-1.5 rounded-full text-[10.5px] font-bold uppercase tracking-[0.06em]" :class="badgeClass(bookingStatusBadge(b))">{{ bookingStatusBadge(b).label }}</span>
            </div>

            <!-- Room & stay -->
            <div class="px-5 sm:px-7 py-6 border-b border-slate-200">
              <h3 class="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">Room &amp; Stay Details</h3>
              <dl class="mt-4 grid grid-cols-2 gap-x-6 gap-y-5">
                <div>
                  <dt class="text-[12px] uppercase text-slate-500">Room</dt>
                  <dd class="mt-1 text-[16px] font-bold text-slate-900">Room {{ b.room_number || 'N/A' }}</dd>
                </div>
                <div>
                  <dt class="text-[12px] uppercase text-slate-500">Length of stay</dt>
                  <dd class="mt-1 text-[16px] font-bold text-slate-900">{{ monthsLabel(b.months) }}</dd>
                </div>
                <div>
                  <dt class="text-[12px] uppercase text-slate-500">Move-in date</dt>
                  <dd class="mt-1 text-[16px] font-bold text-blue-700">{{ formatCalendarLong(checkInDateOf(b)) }}</dd>
                </div>
                <div>
                  <dt class="text-[12px] uppercase text-slate-500">Move-out date</dt>
                  <dd class="mt-1 text-[16px] font-bold text-blue-700">{{ formatCalendarLong(checkOutDateOf(b)) }}</dd>
                </div>
                <div v-if="b.status === 'completed' && b.occupant_check_out" class="col-span-2">
                  <dt class="text-[12px] uppercase text-slate-500">Checked out on</dt>
                  <dd class="mt-1 text-[16px] font-bold text-slate-900">{{ formatCalendarLong(b.occupant_check_out) }}</dd>
                </div>
              </dl>
              <!-- A pending extension does not change the booking until the owner approves it -->
              <div v-if="b.status === 'confirmed' && b.is_extension_requested" class="mt-5 flex items-start gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
                <i class="fa-solid fa-calendar-plus text-violet-600 text-[13px] mt-0.5"></i>
                <p class="text-[13px] text-violet-950 leading-relaxed">
                  <b>Extension requested: +{{ monthsLabel(b.extension_months).toLowerCase() }}</b> — waiting for the owner's approval.
                  Your length of stay, move-out date and totals will update once it is approved.
                  <button type="button" @click="showCancelExtensionModal = true" class="ml-1 font-bold text-violet-800 underline underline-offset-2 hover:text-violet-950">Cancel request</button>
                </p>
              </div>
            </div>

            <!-- Payment breakdown -->
            <div class="px-5 sm:px-7 py-6">
              <h3 class="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">Payment Breakdown</h3>
              <div class="mt-4 space-y-3.5 text-[14px]">
                <div class="flex justify-between gap-4">
                  <span class="text-slate-500">Monthly rent</span>
                  <span class="font-bold text-slate-700">₱{{ formatMoney(b.monthly_rent) }}</span>
                </div>
                <div class="flex justify-between gap-4">
                  <span class="text-slate-500">{{ Number(b.months) || 0 }}-month total</span>
                  <span class="font-bold text-slate-700">₱{{ formatMoney(b.amount) }}</span>
                </div>
              </div>
              <div class="mt-5 pt-5 border-t border-slate-200 flex justify-between items-center gap-4">
                <span class="text-[16px] font-bold text-slate-900">Total booking cost</span>
                <span class="text-[19px] sm:text-[20px] font-bold text-slate-900">₱{{ formatMoney(b.amount) }}</span>
              </div>
              <div v-if="Number(b.initial_payment) > 0" class="mt-5 bg-emerald-50 border border-emerald-200 rounded-xl px-[18px] py-4">
                <div class="flex items-start justify-between gap-3"><p class="text-[12px] font-bold uppercase tracking-[0.12em] text-emerald-700">Move-in Cost</p><span class="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.06em]" :class="badgeClass(paymentStatusBadge(b))">{{ paymentStatusBadge(b).label }}</span></div>
                <p class="mt-1 text-[20px] font-bold text-emerald-700">₱{{ formatMoney(b.initial_payment) }}</p>
                <p class="mt-1 text-[12px] text-slate-500">{{ moveInBreakdownText(b) }}</p>
                <dl class="mt-3 pt-3 border-t border-emerald-200/70 space-y-2 text-[13px]">
                  <div class="flex justify-between gap-4">
                    <dt class="text-slate-600">{{ advanceRentLine(b).label }}</dt>
                    <dd class="font-bold text-slate-700">₱{{ formatMoney(advanceRentLine(b).amount) }}</dd>
                  </div>
                  <div v-if="depositLine(b)" class="flex justify-between gap-4">
                    <dt class="text-slate-600">
                      {{ depositLine(b).label }}
                      <span class="ml-1 inline-block align-middle px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.06em] bg-white text-emerald-700 border border-emerald-200">{{ depositTypeLabel(b) }}</span>
                    </dt>
                    <dd class="font-bold text-slate-700">₱{{ formatMoney(depositLine(b).amount) }}</dd>
                  </div>
                </dl>
                <p v-if="depositLine(b)" class="mt-2 text-[12px] text-slate-500">
                  <i class="fa-solid fa-circle-info text-[10px] text-emerald-600 mr-1"></i>Deposit is {{ depositTypeNote(b).charAt(0).toLowerCase() + depositTypeNote(b).slice(1) }}.
                </p>
              </div>
            </div>
          </section>

          <section v-if="cancellationReview" class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div class="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-200"><h3 class="flex items-center gap-2.5 text-[15px] font-bold text-slate-900"><span class="h-5 w-1 rounded-full bg-blue-600" aria-hidden="true"></span>{{ cancellationReview.kind === 'unpaid_owner_cancellation' ? 'Cancellation reason' : 'Cancellation and payment arrangement' }}</h3><span class="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.06em]" :class="cancellationReview.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'">{{ cancellationReview.status === 'pending' ? 'Action needed' : 'Cancellation confirmed' }}</span></div>
            <div class="px-5 sm:px-6 py-5"><CancellationReviewSummary :booking="b" plain /></div>
          </section>
          </div>

          <!-- RIGHT: status, next steps, actions -->
          <aside class="space-y-6 min-w-0">
          <section class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div class="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-200"><h3 class="flex items-center gap-2.5 text-[15px] font-bold text-slate-900"><span class="h-5 w-1 rounded-full bg-blue-600" aria-hidden="true"></span>Booking &amp; payment status</h3></div>
            <div class="px-5 sm:px-6 pt-2 pb-5">
              <dl class="divide-y divide-slate-200">
                <div class="flex items-center justify-between gap-4 py-3.5">
                  <dt class="text-[13px] font-semibold text-slate-500">Booking status</dt>
                  <dd><span class="inline-block px-3 py-1.5 rounded-full text-[10.5px] font-bold uppercase tracking-[0.06em]" :class="badgeClass(bookingStatusBadge(b))">{{ bookingStatusBadge(b).label }}</span></dd>
                </div>
                <div class="flex items-center justify-between gap-4 py-3.5">
                  <dt class="text-[13px] font-semibold text-slate-500">Payment method</dt>
                  <dd class="text-[14px] font-bold text-slate-900">{{ paymentMethodLabel(b) }}</dd>
                </div>
                <div class="flex items-center justify-between gap-4 py-3.5">
                  <dt class="text-[13px] font-semibold text-slate-500">Payment status</dt>
                  <dd><span class="inline-block px-3 py-1.5 rounded-full text-[10.5px] font-bold uppercase tracking-[0.06em] whitespace-nowrap" :class="badgeClass(paymentStatusBadge(b))">{{ paymentStatusBadge(b).label }}</span></dd>
                </div>
              </dl>
              <div class="bd-notice"><BookingFlowNotice :booking="b" /></div>
            </div>
          </section>

          <section class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div class="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-200"><h3 class="flex items-center gap-2.5 text-[15px] font-bold text-slate-900"><span class="h-5 w-1 rounded-full bg-blue-600" aria-hidden="true"></span>Next steps</h3></div>
            <div class="px-5 sm:px-6 py-5">
              <p class="flex items-start gap-2.5 bg-blue-50/70 border border-blue-100 rounded-xl px-4 py-3.5 text-[13.5px] leading-relaxed text-slate-700"><i class="fa-solid fa-circle-info mt-1 text-[13px] text-blue-600" aria-hidden="true"></i><span>{{ nextSteps }}</span></p>
              <router-link v-if="['cancelled','rejected','completed','not_arrived'].includes(b.status)" to="/student/dashboard" class="mt-4 inline-flex items-center gap-2 text-[13px] font-bold text-[#1e4b8f] hover:underline"><i class="fa-solid fa-arrow-left text-[11px]" aria-hidden="true"></i>Browse other boarding houses</router-link>
            </div>

            <div v-if="hasAnyAction" class="px-5 sm:px-6 pb-6 pt-1 border-t border-slate-200">
              <h4 class="mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Actions</h4>

              <!-- Main action: pay online when the booking needs it (same rule as before) -->
              <button v-if="canPayOnline" type="button" @click="triggerPayment" :disabled="isPaying" class="bd-btn is-pay w-full mt-4">
                <i class="fa-solid fa-credit-card text-[12px]"></i>
                {{ isPaying ? 'Connecting…' : `Pay move-in cost · ₱${formatMoney(b.initial_payment)}` }}
              </button>

              <!-- Paid stay: receipt and extension -->
              <div v-if="canPrintReceipt" class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button type="button" @click="showReceiptModal = true" class="bd-btn w-full">
                  <i class="fa-solid fa-receipt text-[12px]"></i> Print receipt
                </button>
                <button v-if="canRequestExtension" type="button" @click="showExtendForm = !showExtendForm" :aria-expanded="showExtendForm" class="bd-btn is-extend w-full">
                  <i class="fa-solid fa-calendar-plus text-[12px]"></i> Request extension
                </button>
                <button v-if="canCancelExtension" type="button" @click="showCancelExtensionModal = true" class="bd-btn is-extend w-full">
                  <i class="fa-solid fa-calendar-xmark text-[12px]"></i> Cancel extension request
                </button>
              </div>

              <div v-if="canRequestExtension && showExtendForm" class="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                <label for="extension-months" class="block text-[12px] font-semibold text-slate-500 mb-2">Additional months</label>
                <div class="flex gap-2">
                  <input id="extension-months" type="number" v-model.number="extensionMonths" min="1"
                         class="w-24 h-11 px-3 rounded-lg border border-slate-300 bg-white text-[14px] font-semibold outline-none focus:border-[#1e4b8f]">
                  <button type="button" @click="requestExtension" class="bd-btn is-extend-solid flex-1">Submit request</button>
                </div>
              </div>

              <!-- Getting there / reaching the owner -->
              <div v-if="showGettingThere" class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3" :class="{ 'mt-4': !canPayOnline && !canPrintReceipt }">
                <a
                  :href="locationUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="bd-btn w-full"
                  :class="{ 'is-primary': !canPayOnline && !canPrintReceipt }"
                ><i class="fa-solid fa-location-dot text-[12px]"></i> View location</a>
                <button
                  type="button"
                  @click="showContact = !showContact"
                  :aria-expanded="showContact"
                  :disabled="!hasContact"
                  :title="hasContact ? '' : 'Contact details are not available for this boarding house'"
                  class="bd-btn w-full"
                ><i class="fa-solid fa-phone text-[12px]"></i> Contact boarding house</button>
              </div>

              <div v-if="showContact && hasContact" class="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-[14px]">
                <p v-for="phone in phoneNumbers" :key="phone" class="flex items-center gap-2.5">
                  <i class="fa-solid fa-phone text-[12px] text-[#1e4b8f]"></i>
                  <a :href="`tel:${phone.replace(/[^\d+]/g, '')}`" class="font-bold text-slate-900 hover:underline">{{ phone }}</a>
                </p>
                <p v-if="contactEmail" class="flex items-center gap-2.5 min-w-0">
                  <i class="fa-solid fa-envelope text-[12px] text-[#1e4b8f]"></i>
                  <a :href="`mailto:${contactEmail}`" class="font-bold text-slate-900 hover:underline break-all">{{ contactEmail }}</a>
                </p>
              </div>

              <!-- Destructive action kept apart from the others -->
              <div v-if="canCancel" class="mt-5 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <p class="text-[12px] text-slate-400">Changed your plans?</p>
                <button type="button" @click="showCancelConfirmModal = true" class="text-[13px] font-bold text-rose-700 hover:text-rose-800 hover:underline">
                  Cancel reservation
                </button>
              </div>
            </div>
          </section>
          </aside>
        </div>
      </template>
    </main>

    <AppDialog :open="showCashRecovery" title="Request cash payment?" icon="fa-money-bill-wave" tone="info" :busy="isRequestingCash" @close="showCashRecovery = false">
      <p class="app-dialog-lead">Your booking will return to the owner for approval as a cash request. Its dates stay the same, but the previous online approval will no longer reserve a bed.</p>
      <p class="app-dialog-callout warning">The original checkout must be verified and closed first. If payment is processing, paid, or cannot be checked, this request will not proceed. Do not make another payment.</p>
      <label class="app-dialog-check"><input v-model="cashRecoveryAccepted" type="checkbox"><span>I want to request cash payment and understand that the owner must approve my booking again before arranging cash collection.</span></label>
      <template #footer><button type="button" class="app-btn secondary" :disabled="isRequestingCash" @click="showCashRecovery = false">Keep current request</button><button type="button" class="app-btn primary" :disabled="isRequestingCash || !cashRecoveryAccepted" @click="requestCashPayment">{{ isRequestingCash ? 'Checking checkout...' : 'Send cash request' }}</button></template>
    </AppDialog>
    <!-- Paid-reservation policy: accepted before every checkout (the server also requires it) -->
    <AppDialog :open="showPayPolicyModal && !!booking" title="Before you pay" icon="fa-credit-card" tone="info" :busy="isPaying" @close="showPayPolicyModal = false">
      <p class="app-dialog-lead">You are paying <strong>₱{{ formatMoney(b.initial_payment) }}</strong> to secure this reservation.</p>
      <p class="app-dialog-callout warning"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>{{ PAID_RESERVATION_POLICY }}</span></p>
      <label class="app-dialog-check"><input v-model="payPolicyAccepted" type="checkbox"><span>I understand that after my payment is verified, this reservation cannot be cancelled through the platform.</span></label>
      <template #footer>
        <button type="button" class="app-btn secondary" @click="showPayPolicyModal = false" :disabled="isPaying">Not now</button>
        <button type="button" class="app-btn primary" @click="confirmPayment" :disabled="isPaying || !payPolicyAccepted">{{ isPaying ? 'Connecting…' : 'Continue to payment' }}</button>
      </template>
    </AppDialog>

    <!-- Cancel extension request confirmation -->
    <div v-if="showCancelExtensionModal && booking" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6" @click.self="showCancelExtensionModal = false">
      <div class="popup-panel bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="cancel-ext-title">
        <div class="bg-violet-600 px-8 py-5 flex items-center gap-4">
          <div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
            <i class="fa-solid fa-calendar-xmark text-white text-xl"></i>
          </div>
          <h3 id="cancel-ext-title" class="text-white font-black text-base uppercase tracking-tight">Cancel Extension Request</h3>
        </div>
        <div class="px-8 sm:px-10 py-8 text-left">
          <p class="text-slate-900 font-medium text-sm leading-relaxed mb-2 popup-message">
            Withdraw your request to extend your stay by <strong class="text-violet-700">+{{ monthsLabel(b.extension_months).toLowerCase() }}</strong>?
          </p>
          <p class="text-slate-500 text-[13px] leading-relaxed popup-message">Your current booking stays exactly as it is. The owner will be notified, and you can request a new extension later.</p>
        </div>
        <div class="px-8 sm:px-10 pb-8 flex flex-col-reverse sm:flex-row justify-end gap-3">
          <button @click="showCancelExtensionModal = false" class="px-6 py-3 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-500 font-black text-[11px] uppercase tracking-widest rounded-xl transition">
            Keep request
          </button>
          <button @click="cancelExtensionRequest" :disabled="isCancellingExtension" class="px-6 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-black text-[11px] uppercase tracking-widest rounded-xl shadow-md transition">
            {{ isCancellingExtension ? 'Cancelling…' : 'Cancel extension' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Cancel reservation confirmation -->
    <div v-if="showCancelConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6" @click.self="showCancelConfirmModal = false">
      <div class="popup-panel bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
        <div class="bg-red-600 px-8 py-5 flex items-center gap-4">
          <div class="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center shrink-0">
            <i class="fa-solid fa-circle-xmark text-white text-xl"></i>
          </div>
          <h3 id="cancel-title" class="text-white font-bold text-base">Cancel Reservation</h3>
        </div>
        <div class="px-8 sm:px-10 py-8 text-left">
          <p class="text-slate-900 font-medium text-sm leading-relaxed mb-2 popup-message">
            Are you sure you want to <strong class="text-red-600">cancel</strong> reservation <strong>#{{ bookingReference(b) }}</strong>? Its dates will be released for other students.
          </p>
          <p class="text-slate-600 font-medium text-[13px] leading-relaxed popup-message">This action cannot be undone. To stay here later, send a new booking request.</p>
        </div>
        <div class="px-8 sm:px-10 pb-8 flex flex-col-reverse sm:flex-row justify-end gap-3">
          <button @click="showCancelConfirmModal = false" class="px-6 py-3 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-500 font-semibold text-[13px] rounded-xl transition">
            Keep reservation
          </button>
          <button @click="execCancelReservation" class="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold text-[13px] rounded-xl shadow-md transition">
            <i class="fa-solid fa-trash-can mr-2"></i>Confirm Cancellation
          </button>
        </div>
      </div>
    </div>

    <!-- Receipt preview -->
    <div v-if="showReceiptModal && booking" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-6" @click.self="showReceiptModal = false">
      <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden text-left p-8 border border-slate-100" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
        <div class="text-center border-b-2 border-dashed border-slate-200 pb-6 mb-6">
          <h2 class="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] mb-1">CSPC Boarding House System</h2>
          <h3 id="receipt-title" class="text-lg font-black text-slate-900 uppercase tracking-tight">Official Payment Receipt</h3>
          <p class="text-[9px] text-slate-400 font-bold uppercase mt-1">Payment Method: {{ receiptPaymentMethod(booking) }}</p>
        </div>
        <div class="space-y-4 text-xs font-semibold text-slate-600">
          <div class="flex justify-between gap-4"><span class="text-slate-400">Reference Number:</span><span class="font-mono text-slate-900 font-bold">{{ bookingReference(booking) }}</span></div>
          <div class="flex justify-between gap-4"><span class="text-slate-400">Receipt Generated:</span><span class="text-slate-900">{{ new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}</span></div>
          <div class="flex justify-between gap-4"><span class="text-slate-400">Resident Name:</span><span class="text-slate-900 uppercase font-bold text-right">{{ booking.resident_name }}</span></div>
          <div class="flex justify-between gap-4"><span class="text-slate-400">Boarding House:</span><span class="text-slate-900 uppercase font-bold text-right">{{ booking.house_name }}</span></div>
          <div class="flex justify-between gap-4 border-b border-slate-100 pb-3"><span class="text-slate-400">Allocated Room:</span><span class="text-slate-900 font-bold">Room {{ booking.room_number }}</span></div>
          <div class="space-y-2 pt-2">
            <div class="flex justify-between text-slate-400 text-[10px] uppercase font-black tracking-wider"><span>Description</span><span>Amount</span></div>
            <div class="flex justify-between text-slate-700"><span>{{ getReceiptRentLabel(booking) }}</span><span>₱{{ formatMoney(getReceiptRentAmount(booking)) }}</span></div>
            <div v-if="parseInt(booking.deposit_months) > 0" class="flex justify-between text-slate-700">
              <span>Security Deposit ({{ booking.deposit_months }} Mo, {{ depositTypeLabel(booking) }})</span>
              <span>₱{{ formatMoney(parseInt(booking.deposit_months) * parseFloat(booking.monthly_rent)) }}</span>
            </div>
          </div>
          <div class="flex justify-between border-t-2 border-dashed border-slate-200 pt-5 mt-6 text-sm">
            <span class="text-slate-900 font-black uppercase tracking-wider">TOTAL AMOUNT PAID:</span>
            <span class="text-base font-black text-emerald-600">₱{{ formatMoney(booking.initial_payment) }}</span>
          </div>
        </div>
        <div class="mt-8 pt-6 border-t border-slate-100 flex gap-3">
          <button @click="printReceipt" class="app-print-button flex-1 bg-blue-600 hover:bg-black text-white text-[10px] font-black py-3 rounded-xl uppercase tracking-widest transition flex items-center justify-center gap-2">
            <i class="fa-solid fa-print"></i> Print PDF
          </button>
          <button @click="showReceiptModal = false" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black py-3 rounded-xl uppercase tracking-widest transition">
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bd-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 17px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  font-weight: 700;
  color: #1e3a6e;
  transition: background-color .15s, border-color .15s, color .15s;
}
.bd-btn:hover:not(:disabled) { border-color: #1e4b8f; background: #f8fafc; }
.bd-btn:disabled { opacity: .5; cursor: not-allowed; }
.bd-banner :deep(.reservation-deadline) { max-width: none; margin-top: 0; padding: 14px 16px; }
.bd-notice :deep(.booking-flow-notice) { max-width: none; margin-top: 12px; }
.bd-btn.is-primary { background: #1e4b8f; border-color: #1e4b8f; color: #fff; }
.bd-btn.is-primary:hover:not(:disabled) { background: #163a70; border-color: #163a70; }
/* Payment stands apart from the blue palette in green; extensions use violet (amber means pending/warning) */
.bd-btn.is-pay { background: #059669; border-color: #059669; color: #fff; box-shadow: 0 4px 12px rgba(5, 150, 105, .25); }
.bd-btn.is-pay:hover:not(:disabled) { background: #047857; border-color: #047857; }
.bd-btn.is-extend { background: #f5f3ff; border-color: #8b5cf6; color: #6d28d9; }
.bd-btn.is-extend:hover:not(:disabled) { background: #ede9fe; border-color: #7c3aed; }
.bd-btn.is-extend-solid { background: #7c3aed; border-color: #7c3aed; color: #fff; }
.bd-btn.is-extend-solid:hover:not(:disabled) { background: #6d28d9; border-color: #6d28d9; }
</style>
