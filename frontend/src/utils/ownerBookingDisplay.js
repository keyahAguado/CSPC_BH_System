// Legacy cancellation requests do not change the active booking status.
const cancellationPending = () => false;
import { awaitingMoveIn, arrivalPending, moveInReviewDue, nonArrivalRecorded } from './bookingArrival.js';
import { computeCheckoutDate } from './dateHelper.js';
import { paymentException } from './paidReservationPolicy.js';

export const ownerBookingKey = b => (Number(b.is_non_cspc) ? 'nc-' : 'b-') + b.id;
export const ownerBookingReference = b => b.reference_no || `${Number(b.is_non_cspc) ? 'NC' : 'REF'}-${String(b.id).padStart(4,'0')}`;
export const ownerBookingStage = b => {
  if(cancellationPending(b))return {key:'review',label:'Cancellation requested',tone:'amber'};
  // Before cancelled/expired: a late payment on an expired booking is still money received.
  if (paymentException(b)) return {key:'review',label:'Payment exception',tone:'amber'};
  if (b.status === 'cancelled') return {key:'cancelled',label:b.expiry_reason && !['cash_no_show','owner_cancelled','paid_owner_cancelled','paid_no_show','student_cancelled'].includes(b.expiry_reason) ? 'Expired' : 'Cancelled',tone:'red'};
  if (b.status === 'rejected') return {key:'rejected',label:b.expiry_reason==='room_filled' ? 'Closed · room filled' : 'Rejected',tone:'red'};
  if (b.status === 'completed') return {key:'completed',label:'Completed',tone:'slate'};
  if (b.status === 'not_arrived') return {key:'not-arrived',label:'Did not arrive',tone:'slate'};
  if (b.occupancy_start_issue && b.status==='confirmed') return {key:'review',label:'Stay needs review',tone:'amber'};
  if (b.status === 'pending' && Number(b.renewal_waiting)) return {key:'pending',label:'On hold · resident deciding',tone:'slate'};
  if (b.status === 'pending') return {key:'pending',label:'Pending request',tone:'amber'};
  if (Number(b.payment_review_required) || Number(b.payment_requires_review)) return {key:'review',label:'Payment exception',tone:'amber'};
  if (nonArrivalRecorded(b)) return {key:'review',label:'Paid · not arrived',tone:'amber'};
  if (moveInReviewDue(b)) return {key:'review',label:'Needs move-in review',tone:'amber'};
  if (arrivalPending(b)) return {key:'occupying',label:'Started · arrival pending',tone:'blue'};
  if (b.status === 'confirmed' && (Number(b.is_non_cspc) || b.move_in_confirmed_at || b.occupant_check_in)) return {key:'occupying',label:'Occupying',tone:'green'};
  if (awaitingMoveIn(b) || (b.status === 'confirmed' && b.payment_method === 'paymongo' && b.payment_status !== 'paid')) return {key:'reserved',label:'Reserved',tone:'blue'};
  return {key:b.status || 'unknown',label:b.status === 'confirmed' ? 'Approved' : 'Unknown',tone:'slate'};
};
export const ownerUpfrontPayment = b => {
  if(b.status==='pending' && Number(b.renewal_waiting))return {key:'not-due',label:'Not due',tone:'slate'};
  try { const review=JSON.parse(b.cancellation_review || 'null'); if(b.status==='cancelled' && review?.status==='resolved' && review.disposition==='refunded') return {key:'refunded',label:'External refund recorded',tone:'slate'}; } catch {}
  if (paymentException(b)) return {key:'paid',label:'Received · not secured',tone:'amber'};
  if (b.payment_method==='paymongo' && b.paymongo_payment_id) return {key:'paid',label:'Paid',tone:'green'};
  const recorded=b.occupant_upfront_status ?? b.upfront_status;
  if (recorded != null) return String(recorded).toLowerCase()==='paid' ? {key:'paid',label:'Paid',tone:'green'} : {key:'unpaid',label:'Not collected',tone:'amber'};
  if (b.paymongo_payment_id || String(b.payment_status).toLowerCase()==='paid') return {key:'paid',label:'Paid',tone:'green'};
  if (b.status==='pending' && b.payment_method==='paymongo') return {key:'unpaid',label:'After approval',tone:'slate'};
  if (b.status==='confirmed' && b.payment_method==='cash' && awaitingMoveIn(b)) return {key:'unpaid',label:'Cash at move-in',tone:'amber'};
  return {key:'unpaid',label:b.payment_method==='paymongo' && b.status==='confirmed' ? 'Awaiting payment' : 'Unpaid',tone:'amber'};
};
export const ownerDate = value => {
  if (!value) return 'Not recorded';
  const date = typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value+'T00:00:00+08:00') : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-US',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric'}) : 'Not recorded';
};
export const ownerDay = value => {
  if (!value) return '';
  if (typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date=new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(date) : '';
};
export const ownerTimestamp = value => {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Date not recorded';
  return ownerDate(value)+' · '+new Date(value).toLocaleTimeString('en-US',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit',hour12:true});
};
export const ownerStayEnd = b => {
  if (b.occupant_check_out || b.check_out_date) return ownerDay(b.occupant_check_out || b.check_out_date);
  const date=computeCheckoutDate(ownerDay(b.occupant_check_in || b.check_in_date),b.months);
  return date ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}` : '';
};
export const ownerMoney = value => Number(value || 0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
export const ownerMonthlyRent = b => {
  const value=b.occupant_payment_status ?? b.payment_status;
  return value ? String(value).toLowerCase()==='paid' ? 'Rent paid' : 'Rent due' : 'Not recorded';
};
export const ownerBookingActivity = b => [
  b.booking_date && {label:Number(b.is_non_cspc) ? 'Occupant record added' : 'Booking requested',at:b.booking_date,icon:'fa-file-lines',tone:'blue'},
  b.move_in_confirmed_at && {label:Number(b.occupancy_auto_started)===1 ? 'Booked stay started automatically' : 'Stay started',at:b.move_in_confirmed_at,icon:'fa-house',tone:'green'},
  b.occupant_non_arrival_recorded_at && {label:'Non-arrival recorded by owner',at:b.occupant_non_arrival_recorded_at,icon:'fa-user-slash',tone:'amber'},
  b.status==='not_arrived' && b.occupant_check_out && {label:'Closed as did not arrive',at:b.occupant_check_out,icon:'fa-user-slash',tone:'slate',dateOnly:true},
  b.occupant_arrival_confirmed_at && {label:'Arrival confirmed by owner',at:b.occupant_arrival_confirmed_at,icon:'fa-door-open',tone:'green'},
  b.status==='completed' && (b.occupant_check_out || b.check_out_date) && {label:'Checkout recorded',at:b.occupant_check_out || b.check_out_date,icon:'fa-arrow-right-from-bracket',tone:'slate',dateOnly:true},
  b.expired_at && {label:['owner_cancelled','paid_owner_cancelled'].includes(b.expiry_reason) ? 'Reservation cancelled by owner' : b.expiry_reason==='cash_no_show' ? 'Cash no-show cancelled' : b.expiry_reason==='paid_no_show' ? 'Paid no-show closed by owner' : b.expiry_reason==='student_cancelled' ? 'Cancelled by student' : b.expiry_reason==='room_filled' ? 'Request closed: room filled' : 'Reservation expired',at:b.expired_at,icon:'fa-clock',tone:'red'}
].filter(Boolean).sort((a,c)=>new Date(a.at)-new Date(c.at));
