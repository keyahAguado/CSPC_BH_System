import { bookingNow } from './bookingClock.js';
import { computeCheckoutDate } from './dateHelper.js';
export const awaitingMoveIn = b => Number(b?.move_in_required) === 1 && b.status === 'confirmed' && !b.move_in_confirmed_at && !b.occupant_check_in;
export const manilaDay = (date = bookingNow()) => new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit' }).format(date);
export const scheduledDay = b => { const value=b?.check_in_date; if(!value)return ''; if(typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value))return value; const date=new Date(value); return Number.isFinite(date.getTime()) ? manilaDay(date) : ''; };
export const cashNoShowReady = b => b?.status==='confirmed' && Number(b.move_in_required)===1 && b.payment_method==='cash' && b.payment_status!=='paid' && !b.paymongo_payment_id && !b.occupant_check_out && (!b.move_in_confirmed_at || Number(b.occupancy_auto_started)===1) && String(b.occupant_upfront_status || b.upfront_status || '').toLowerCase()!=='paid' && String(b.occupant_payment_status || '').toLowerCase()!=='paid' && !b.occupant_arrival_confirmed_at && !!scheduledDay(b) && manilaDay()>scheduledDay(b);
// An automatically started stay is scheduled, not a confirmed resident, until the owner confirms arrival.
export const arrivalPending = b => b?.status==='confirmed' && Number(b.occupant_arrival_required ?? b.arrival_required)===1 && !(b.occupant_arrival_confirmed_at || b.arrival_confirmed_at) && !(b.occupant_check_out || b.check_out_date);
// After the check-in day, an unconfirmed arrival needs the owner's attention: confirm arrival, record a no-show, or check out.
export const moveInReviewDue = b => arrivalPending(b) && !!scheduledDay(b) && manilaDay()>scheduledDay(b);
// Paid stays whose student never arrives (docs/paid-non-arrival.md): an attendance record, never a cancellation.
const isPaid = value => String(value || '').toLowerCase()==='paid';
export const paidStay = b => (b?.payment_method==='paymongo' && !!b.paymongo_payment_id) || isPaid(b?.payment_status) || isPaid(b?.occupant_upfront_status) || isPaid(b?.occupant_payment_status);
const dayString = date => date ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}` : '';
export const bookedCheckoutDay = b => dayString(computeCheckoutDate(scheduledDay(b),b?.months));
// How far the rent prepaid at move-in covers the stay: advance months (at least one, as in the upfront amount) plus a
// consumable deposit, which is prepaid rent for the final month(s). A refundable deposit is a security deposit, not
// rent, so it is not counted. Information for the owner's close decision only; the platform does not enforce it.
export const advanceCoverage = b => {
  const start=scheduledDay(b);if(!start)return null;
  const advance=Math.max(1,parseInt(b?.advance_months,10) || 0),deposit=Math.max(0,parseInt(b?.deposit_months,10) || 0);
  const consumable=deposit>0 && b?.deposit_type==='consumable',months=advance+(consumable?deposit:0),booked=bookedCheckoutDay(b);
  let until=dayString(computeCheckoutDate(start,months));if(!until)return null;
  if(booked && until>booked)until=booked;
  return {months,advance,consumableDeposit:consumable?deposit:0,refundableDeposit:!consumable?deposit:0,until,coversWholeStay:!!booked && until===booked};
};
export const nonArrivalRecorded = b => b?.status==='confirmed' && !!b.occupant_non_arrival_recorded_at && !b.occupant_arrival_confirmed_at && !b.occupant_check_out;
export const nonArrivalRecordReady = b => b?.status==='confirmed' && Number(b.move_in_required)===1 && !Number(b.payment_review_required) && !!b.occupant_id && Number(b.occupant_arrival_required)===1 && !b.occupant_arrival_confirmed_at && !b.occupant_check_out && !b.occupant_non_arrival_recorded_at && paidStay(b) && !!scheduledDay(b) && manilaDay()>scheduledDay(b);
// The upfront payment covers move-in, not the whole stay, so the owner may free the bed once non-arrival is recorded.
export const nonArrivalCloseReady = b => nonArrivalRecorded(b);
// Occupant rows (Boarder Details) carry the arrival fields directly.
export const occupantAwaitingArrival = o => Number(o?.arrival_required)===1 && !o.arrival_confirmed_at && !o.check_out_date;
export const occupantNotArrived = o => occupantAwaitingArrival(o) && !!o.non_arrival_recorded_at;
