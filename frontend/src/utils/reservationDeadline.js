import { bookingNow } from './bookingClock.js';
import { paymentException } from './paidReservationPolicy.js';
export function reservationDeadlineInfo(booking, now = bookingNow().getTime()) {
  // A payment exception has no deadline to show; it is explained by the booking notice instead.
  if (!booking || booking.is_non_cspc || booking.occupant_check_in || paymentException(booking)) return null;
  if (booking.status === 'cancelled' && booking.expiry_reason) {
    return { expired: true, label: ['owner_cancelled','paid_owner_cancelled'].includes(booking.expiry_reason) ? 'Cancelled by the owner before check-in.' : booking.expiry_reason === 'cash_no_show' ? 'Cancelled: owner confirmed a cash no-show.' : booking.expiry_reason === 'student_cancelled' ? 'Cancelled by the student.' : booking.expiry_reason === 'paid_no_show' ? 'Closed: the owner recorded a paid no-show.' : booking.expiry_reason === 'renewal_window_expired' ? 'Expired: not enough time remained for owner review after the renewal decision.' : booking.expiry_reason === 'owner_timeout' ? 'Expired: owner response deadline passed.' : 'Expired: online payment deadline passed.' };
  }
  if (booking.payment_status === 'paid' || booking.paymongo_payment_id) return null;
  const value = booking.status === 'pending' ? booking.owner_response_due_at
    : booking.status === 'confirmed' && booking.payment_method === 'paymongo' ? booking.payment_due_at : null;
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return { expired: false, overdue: date.getTime() <= now, at: date, label: booking.status === 'pending' ? 'Owner response due' : 'Pay online by' };
}

export function reservationClosureMessage(b){
 if(b?.status!=='cancelled' || paymentException(b))return '';
 if(b.expiry_reason==='payment_timeout')return 'This reservation expired because online payment was not completed before the payment deadline. The reserved bed has been released. You can submit a new booking request.';
 if(b.expiry_reason==='owner_timeout')return 'This request expired because the owner did not respond before the approval deadline. No bed was reserved. You can submit a new request or choose another property.';
 if(b.expiry_reason==='renewal_window_expired')return 'This request expired because there was not enough time left for owner approval after the renewal decision. Choose a later check-in date.';
 return '';
}
