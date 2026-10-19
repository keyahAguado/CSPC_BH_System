<script setup>
import {reservationClosureMessage} from '../utils/reservationDeadline.js';
import { computed } from 'vue';
import { awaitingMoveIn, arrivalPending, moveInReviewDue, nonArrivalRecorded } from '../utils/bookingArrival.js';
import { PAID_RESERVATION_POLICY, paymentException, paymentExceptionMessage } from '../utils/paidReservationPolicy.js';
const props = defineProps({ booking:Object, owner:Boolean });
const message = computed(() => {
 const b=props.booking;
 // Checked before closure wording: a payment that arrived after expiry must not read as a plain expired booking.
 if (paymentException(b)) return paymentExceptionMessage(b,props.owner);
 if(reservationClosureMessage(b))return reservationClosureMessage(b);
 if (!b || Number(b.move_in_required)!==1) return '';
 if (b.status==='not_arrived') return props.owner ? 'Closed as "Did not arrive": the student never arrived and the remaining dates were released. It was not marked Completed, and the payment record is unchanged.' : 'This stay was closed as "Did not arrive" because you did not arrive, and the bed was released. Your payment record is unchanged. Concerns about the upfront payment are handled with the owner outside the platform.';
 if (nonArrivalRecorded(b)) return props.owner ? 'Recorded as not arrived. The bed is still held. Confirm arrival if the student turns up, or close the stay as "Did not arrive" to free the bed for the remaining dates.' : 'The owner recorded that you have not arrived. Your reservation and payment are unchanged for now, but if you do not arrive the owner may close the stay and release your bed. If you have arrived or still plan to, contact the owner as soon as possible.';
 if (b.status==='pending' && Number(b.renewal_waiting)) return 'Waiting for a resident renewal decision. This request is not approved, no bed is guaranteed, and no payment is due. The owner-response timer resumes with a new deadline after renewal review.';
 if (b.status==='pending') return 'Requested: the owner has up to 24 hours to respond, or until 12:00 noon on the check-in day if that is sooner. A pending request is not an occupied bed.';
 if (b.status==='cancelled' && b.expiry_reason==='paid_no_show') return 'This paid stay was closed as a no-show after the owner recorded the payment outcome. The remaining dates were released. Payment history is kept; the system does not issue refunds.';
 if (b.status==='cancelled' && b.expiry_reason==='paid_owner_cancelled') return 'This paid reservation was cancelled after the owner recorded the payment review outcome. Contact the owner for refund details; the system does not issue refunds automatically.';
 if (b.status==='cancelled') return b.expiry_reason==='owner_cancelled' ? 'The owner cancelled this unpaid future reservation. Its booked dates were released.' : b.expiry_reason==='cash_no_show' ? 'This unpaid cash stay was cancelled as a no-show. Its remaining booked dates were released.' : b.expiry_reason==='student_cancelled' ? 'The student cancelled this reservation before it was paid or started. Its dates were released.' : '';
 if (b.status==='rejected' && b.expiry_reason==='room_filled') return props.owner ? 'Closed automatically: another reservation took the last bed for these dates.' : 'Another reservation for this room was approved and no bed is left for your dates. Choose another room or different dates.';
 if (b.occupancy_start_issue) return props.owner ? 'Scheduled start needs review: '+b.occupancy_start_issue : 'Your scheduled stay needs owner review before it can start. Contact the owner. Your booked check-in and checkout dates have not changed.';
 if (moveInReviewDue(b)) return props.owner ? (b.payment_method==='cash' && b.payment_status!=='paid' ? 'Needs move-in review: the check-in day has passed and arrival is not confirmed. Confirm arrival if the student moved in, or cancel the unpaid cash no-show. Until then the bed stays held, and SASO does not count this student as a resident.' : 'Needs move-in review: the check-in day has passed and arrival is not confirmed. Confirm arrival if the student moved in; otherwise record non-arrival, then close the stay as "Did not arrive" to free the bed. The bed stays held until you do. SASO does not count this student as a resident until arrival is confirmed.') : 'The owner has not yet confirmed your arrival. Contact the owner if you have already moved in.';
 if (arrivalPending(b)) return props.owner ? 'The booked stay has started and the bed is held. Confirm arrival when the student moves in; SASO counts the student as a resident only after you confirm. Arrival and payment are recorded separately.' : 'Your booked stay has started. The owner confirms your arrival when you move in.';
 if (!awaitingMoveIn(b)) return b.status==='confirmed' ? 'The booked stay is active. Arrival and payment are recorded separately.' : '';
 if (b.payment_method==='cash') return props.owner ? 'Reserved: the stay starts automatically on its booked check-in date. Cash remains unpaid until you record collection at move-in. Confirm arrival when the student moves in.' : 'Reserved: your stay starts automatically on the booked check-in date. Pay the upfront cash cost to the owner at move-in. Your booked checkout does not shift if you arrive late; contact the owner if your plans change.';
 return b.payment_status==='paid' ? 'Paid and reserved: your bed is secured for the booked dates. Occupancy starts automatically on the check-in date, and checkout remains the booked end date.' : 'Reserved, awaiting online payment: pay before the deadline shown, which is 24 hours after approval or the end of the check-in day, whichever comes first. Your secured stay starts automatically on its booked check-in date.';
});
</script>
<template><aside v-if="message" class="booking-flow-notice"><span class="bfn-icon" aria-hidden="true"><i class="fa-solid fa-info"></i></span><div><strong>{{ paymentException(booking) ? 'Payment received · reservation not secured' : awaitingMoveIn(booking) ? 'Reserved for the booked dates' : 'Booked stay information' }}</strong><p>{{ message }}</p><p v-if="booking.status==='confirmed' && !paymentException(booking) && (booking.payment_status==='paid' || booking.paymongo_payment_id)" class="paid-policy-note"><strong>Paid reservations cannot be cancelled in the platform.</strong> {{ PAID_RESERVATION_POLICY }}</p></div></aside></template>
<style scoped>
.paid-policy-note{margin-top:10px!important;padding-top:10px;border-top:1px solid #dbeafe}.booking-flow-notice{display:flex;align-items:flex-start;gap:10px;max-width:560px;margin:10px 0 0;padding:11px 14px;border:1px solid #dbeafe;border-radius:10px;background:#f5f9ff;font-size:12.5px;line-height:1.6;color:#334a66;text-align:left;white-space:normal;}
.bfn-icon{display:grid;place-items:center;flex-shrink:0;width:28px;height:28px;border-radius:50%;background:#dbeafe;color:#1d4ed8;font-size:12px;}
.booking-flow-notice>div{min-width:0;}
.booking-flow-notice strong{display:block;margin-bottom:2px;font-size:13px;font-weight:700;color:#1e3a8a;}
.booking-flow-notice p{margin:0;}
@media(max-width:640px){.booking-flow-notice{max-width:none;padding:10px 12px;}}
</style>
