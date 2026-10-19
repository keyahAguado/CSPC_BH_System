// Legacy cancellation requests do not change the active booking status.
const cancellationPending = () => false;
import { awaitingMoveIn, arrivalPending, nonArrivalRecorded } from './bookingArrival.js';
import { reservationDeadlineInfo } from './reservationDeadline.js';
import { paymentException } from './paidReservationPolicy.js';
// Shared display helpers for the student My Bookings list and Booking Details pages.
// Booking status (pending/confirmed/completed/cancelled/rejected) and payment status
// (unpaid/paid/failed) are always presented separately.
import { formatAddress } from './formatAddress.js';
import { computeCheckoutDate } from './dateHelper.js';

export const formatMoney = (val) =>
  Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatShortDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatLongDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

// Same reference format the receipts and owner notifications use (REF-0001)
export const bookingReference = (booking) => `REF-${String(booking?.id ?? '').padStart(4, '0')}`;

export const bookingAddress = (booking) =>
  formatAddress({ barangay: booking.house_barangay, location: booking.house_location }) || 'Address pending';

export const checkInDateOf = (booking) => booking.occupant_check_in || booking.check_in_date || null;

export const checkOutDateOf = (booking) => {
  const checkIn = checkInDateOf(booking);
  return checkIn ? computeCheckoutDate(checkIn, booking.months) : null;
};

// Date-only strings ("2026-10-14") are read as calendar dates so they never shift a day
const toCalendarDate = (val) => {
  if (!val) return null;
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = val instanceof Date ? val : new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

export const formatCalendarShort = (val) => {
  const d = toCalendarDate(val);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
};

export const formatCalendarLong = (val) => {
  const d = toCalendarDate(val);
  return d ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
};

export const formatCheckInShort = (booking) => formatCalendarShort(checkInDateOf(booking));
export const formatCheckOutShort = (booking) => formatCalendarShort(checkOutDateOf(booking));

export const monthsLabel = (months) => {
  const n = Number(months) || 0;
  return `${n} Month${n === 1 ? '' : 's'}`;
};

export const paymentMethodLabel = (booking) => {
  if (booking.payment_method === 'paymongo') return 'Online (GCash/Card)';
  if (booking.payment_method === 'cash') return 'Cash';
  return 'Not recorded';
};

// A PayMongo payment arrived but the owner has not yet recorded the move-in
export const paymentNeedsReview = (booking) =>
  booking.expiry_reason !== 'paid_owner_cancelled' && booking.payment_method === 'paymongo' && !!booking.paymongo_payment_id && !booking.occupant_check_in && (Number(booking.move_in_required) !== 1 || booking.status !== 'confirmed' || Number(booking.payment_review_required) === 1);

export const isActiveBooking = (booking) => ['pending', 'confirmed'].includes(booking.status);

// Confirmed PayMongo booking whose move-in cost can be paid online (same rule as the Pay button)
export const upfrontIsPaid = booking => !!booking.paymongo_payment_id || (booking.occupant_upfront_status != null ? String(booking.occupant_upfront_status).toLowerCase()==='paid' : booking.payment_status==='paid');

export const needsOnlinePayment = (booking) =>
  !paymentNeedsReview(booking) && booking.status === 'confirmed' &&
  !upfrontIsPaid(booking) && booking.payment_method === 'paymongo' && !reservationDeadlineInfo(booking)?.overdue;

export const isAwaitingPayment = (booking) =>
  !(booking.status==='pending' && Number(booking.renewal_waiting)) && isActiveBooking(booking) && !upfrontIsPaid(booking) && !paymentNeedsReview(booking);

const BOOKING_STATUS = {
  pending: { label: 'Pending', tone: 'amber' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  completed: { label: 'Checked out', tone: 'blue' },
  not_arrived: { label: 'Did not arrive', tone: 'slate' },
  cancelled: { label: 'Cancelled', tone: 'red' },
  rejected: { label: 'Rejected', tone: 'red' }
};

export const bookingStatusBadge = (booking) =>
  (cancellationPending(booking) ? {label:'Cancellation requested',tone:'amber'} : paymentException(booking) ? {label:'Payment exception',tone:'amber'} : nonArrivalRecorded(booking) ? {label:'Marked not arrived',tone:'amber'} : booking.status==='pending' && Number(booking.renewal_waiting) ? {label:'Waiting for renewal decision',tone:'amber'} : booking.status==='confirmed' && (booking.occupancy_start_issue || Number(booking.payment_review_required)) ? {label:'Owner review needed',tone:'amber'} : awaitingMoveIn(booking) ? { label: 'Reserved', tone: 'blue' } : arrivalPending(booking) ? { label:'Started · arrival pending', tone:'amber' } : Number(booking.move_in_required) === 1 && booking.status === 'confirmed' ? { label:'Occupied', tone:'green' } : booking.status === 'cancelled' && booking.expiry_reason ? { label: ['cash_no_show','paid_no_show'].includes(booking.expiry_reason) ? 'Cancelled: no-show' : ['owner_cancelled','paid_owner_cancelled'].includes(booking.expiry_reason) ? 'Cancelled by owner' : booking.expiry_reason === 'student_cancelled' ? 'Cancelled' : 'Expired', tone: 'red' } : BOOKING_STATUS[booking.status]) || { label: booking.status || 'Unknown', tone: 'slate' };

export const paymentStatusBadge = (booking) => {
  if(booking.status==='pending' && Number(booking.renewal_waiting))return {label:'Not due',tone:'slate'};
  try { const review=JSON.parse(booking.cancellation_review || 'null'); if(booking.status==='cancelled' && review?.status==='resolved' && review.disposition==='refunded') return {label:'External refund recorded',tone:'slate'}; } catch {}
  // Review comes first, as on the previous page: a PayMongo payment arrived but the owner
  // has not recorded the move-in yet
  if (paymentNeedsReview(booking)) return { label: 'Received · not secured', tone: 'amber' };
  if (upfrontIsPaid(booking)) return { label: 'Paid', tone: 'blue' };
  if (booking.payment_status === 'failed') return { label: 'Payment failed', tone: 'red' };
  if (awaitingMoveIn(booking) && booking.payment_method === 'cash') return { label:'Cash due at move-in', tone:'orange' };
  if (booking.status === 'pending') return { label: 'Not due — awaiting approval', tone: 'slate' };
  if (isActiveBooking(booking)) return { label: booking.payment_method === 'cash' ? 'Cash not collected' : 'Awaiting online payment', tone: 'orange' };
  return { label: 'Unpaid', tone: 'slate' };
};

export const BADGE_TONE_CLASSES = {
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-700',
  orange: 'bg-orange-100 text-orange-700',
  blue: 'bg-blue-100 text-blue-700',
  red: 'bg-red-100 text-red-700',
  slate: 'bg-slate-100 text-slate-600'
};

// Same wording as the reservation form (Book.vue); owners default to refundable
export const depositTypeLabel = (booking) => (booking.deposit_type === 'consumable' ? 'Consumable' : 'Refundable');
export const depositTypeNote = (booking) => (booking.deposit_type === 'consumable'
  ? 'Consumable — used as payment for your final month'
  : 'Refundable upon move-out');

// Amounts follow the existing move-in calculation: max(1, advance) months of rent + deposit months of rent
export const advanceRentLine = (booking) => {
  const months = parseInt(booking.advance_months || 0, 10);
  return {
    label: months > 0 ? `Advance rent (${months} month${months === 1 ? '' : 's'})` : 'First month rent',
    amount: Math.max(1, months) * parseFloat(booking.monthly_rent || 0)
  };
};
export const depositLine = (booking) => {
  const months = parseInt(booking.deposit_months || 0, 10);
  return months > 0
    ? { label: `Security deposit (${months} month${months === 1 ? '' : 's'})`, amount: months * parseFloat(booking.monthly_rent || 0) }
    : null;
};

export const moveInBreakdownText = (booking) => {
  const adv = Number(booking.advance_months) || 0;
  const dep = Number(booking.deposit_months) || 0;
  const unit = n => `${n} month${n === 1 ? '' : 's'}`;
  if (adv > 0 && dep > 0) return `${unit(adv)} advance + ${unit(dep)} deposit`;
  if (adv > 0) return `${unit(adv)} advance only`;
  if (dep > 0) return `${unit(dep)} deposit only`;
  return 'Due upon check-in';
};
