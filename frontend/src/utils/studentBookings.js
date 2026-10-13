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
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
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
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—';
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
  booking.payment_method === 'paymongo' && !!booking.paymongo_payment_id && !booking.occupant_check_in;

export const isActiveBooking = (booking) => ['pending', 'confirmed'].includes(booking.status);

// Confirmed PayMongo booking whose move-in cost can be paid online (same rule as the Pay button)
export const needsOnlinePayment = (booking) =>
  !paymentNeedsReview(booking) && booking.status === 'confirmed' &&
  booking.payment_status !== 'paid' && booking.payment_method === 'paymongo';

export const isAwaitingPayment = (booking) =>
  isActiveBooking(booking) && booking.payment_status !== 'paid' && !paymentNeedsReview(booking);

const BOOKING_STATUS = {
  pending: { label: 'Pending', tone: 'amber' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  completed: { label: 'Checked out', tone: 'blue' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
  rejected: { label: 'Rejected', tone: 'red' }
};

export const bookingStatusBadge = (booking) =>
  BOOKING_STATUS[booking.status] || { label: booking.status || 'Unknown', tone: 'slate' };

export const paymentStatusBadge = (booking) => {
  // Review comes first, as on the previous page: a PayMongo payment arrived but the owner
  // has not recorded the move-in yet
  if (paymentNeedsReview(booking)) return { label: 'Under review', tone: 'amber' };
  if (booking.payment_status === 'paid') return { label: 'Paid', tone: 'blue' };
  if (booking.payment_status === 'failed') return { label: 'Payment failed', tone: 'red' };
  if (isActiveBooking(booking)) return { label: 'Awaiting payment', tone: 'orange' };
  return { label: 'Unpaid', tone: 'slate' };
};

export const BADGE_TONE_CLASSES = {
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  orange: 'bg-orange-50 text-orange-600',
  blue: 'bg-blue-50 text-blue-700',
  red: 'bg-rose-50 text-rose-700',
  slate: 'bg-slate-100 text-slate-500'
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
