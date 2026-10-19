import { bookingNow } from './bookingClock.js';
import { notifyRenewalIncomingClosed } from './renewalPriority.js';
import { closeExpiredCheckout } from './reservationExpiry.js';
import { PAID_RESERVATION_POLICY } from './paidCancellation.js';
import { calendarDay, manilaToday } from './stayAvailability.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export async function cancelFutureReservation(pool,ownerId,bookingId,{reason,closeCheckout=b=>closeExpiredCheckout(b,{pool})}={}) {
 if(typeof reason!=='string' || reason.trim().length<5 || reason.trim().length>1000)throw fail(400,'Enter a cancellation reason for the student (5-1000 characters).');
 const [before]=await pool.query('SELECT b.id, b.student_id, b.status, b.payment_method, b.payment_status, b.paymongo_payment_id, b.paymongo_session_id, b.paymongo_account_id, b.paymongo_mode, b.paymongo_direct_connection_id, b.payment_review_required, b.check_in_date, b.move_in_confirmed_at FROM bookings b JOIN boarding_houses bh ON bh.id=b.house_id WHERE b.id=? AND bh.owner_id=?',[bookingId,ownerId]);
 const initial=before[0];
 if(!initial)throw fail(404,'Reservation not found or access denied.');
 if(initial.status!=='confirmed' || !initial.check_in_date || calendarDay(initial.check_in_date)<=manilaToday() || initial.move_in_confirmed_at)throw fail(409,'Only a future reservation that has not started can be cancelled here. Refresh the booking.');
 if(initial.payment_status==='paid' || initial.paymongo_payment_id || Number(initial.payment_review_required))throw fail(409,PAID_RESERVATION_POLICY);
 if(initial.payment_method==='paymongo' && initial.paymongo_session_id){
  let closed;try{closed=await closeCheckout(initial);}catch{throw fail(503,'The online checkout could not be closed. The reservation is unchanged; please try again.');}
  if(!closed)throw fail(409,'A payment for this reservation is processing or was just received, so it cannot be cancelled. Refresh in a few minutes to see the payment status. If the payment is verified, the reservation cannot be cancelled through the platform.');
 }
 let c;
 try {
  c=await pool.getConnection();await c.beginTransaction();
  const [initial]=await c.query('SELECT b.id, b.student_id FROM bookings b JOIN boarding_houses bh ON bh.id=b.house_id WHERE b.id=? AND bh.owner_id=?',[bookingId,ownerId]);
  if(!initial.length)throw fail(404,'Reservation not found or access denied.');
  await c.query('SELECT id FROM users WHERE id=? FOR UPDATE',[initial[0].student_id]);
  const [rows]=await c.query('SELECT * FROM bookings WHERE id=? FOR UPDATE',[bookingId]);const b=rows[0];
  if(!b || b.status!=='confirmed' || !b.check_in_date || calendarDay(b.check_in_date)<=manilaToday() || b.move_in_confirmed_at)throw fail(409,'Only a future reservation that has not started can be cancelled here. Refresh the booking.');
  if((b.paymongo_session_id || null)!==(before[0].paymongo_session_id || null))throw fail(409,'The checkout session changed. Refresh this booking before cancelling.');
  if(b.payment_status==='paid' || b.paymongo_payment_id || Number(b.payment_review_required))throw fail(409,PAID_RESERVATION_POLICY);
  await c.query('SELECT id FROM rooms WHERE id=? FOR UPDATE',[b.room_id]);
  const reference='REF-'+String(b.id).padStart(4,'0');
  const [occupants]=await c.query('SELECT id FROM occupants WHERE reference_no=? FOR UPDATE',[reference]);
  if(occupants.length)throw fail(409,'This booking has an occupant record. Review the stay from Boarder Details.');
  await c.query("UPDATE bookings SET status='cancelled', expiry_reason='owner_cancelled', expired_at=NOW(), occupancy_start_issue=NULL, cancellation_review=? WHERE id=?",[JSON.stringify({status:'resolved',kind:'unpaid_owner_cancellation',reason:reason.trim(),resolved_at:bookingNow().toISOString()}),b.id]);
  const message=`RESERVATION CANCELLED: ${reference}. The owner cancelled this unpaid future reservation. Reason: ${reason.trim()}. No payment was collected for this reservation. Its booked dates have been released. Other bookings are unchanged.`;
  for(const [id,link] of [[b.student_id,'/student/bookings/'+b.id],[ownerId,'/owner/bookings']])await c.query('INSERT INTO notifications (user_id,message,link) VALUES (?,?,?)',[id,message,link]);
  await notifyRenewalIncomingClosed(c,b,ownerId,'cancelled by the owner');
  await c.commit();return {success:true,message:'Future reservation cancelled. Its dates are available again.'};
 }catch(error){if(c)await c.rollback();throw error;}finally{c?.release();}
}
// Nothing has been paid or occupied yet: still pending, approved-but-unpaid online, or a reserved cash stay that has not started.
const studentCancellable=b=>b.payment_status!=='paid' && !b.paymongo_payment_id && (b.status==='pending' || (b.status==='confirmed' && (b.payment_method==='paymongo' || (Number(b.move_in_required)===1 && !b.move_in_confirmed_at))));
export async function cancelStudentReservation(pool,studentId,bookingId,{closeCheckout=b=>closeExpiredCheckout(b,{pool})}={}) {
 const [initial]=await pool.query('SELECT id, status, payment_method, payment_status, paymongo_payment_id, paymongo_session_id, paymongo_account_id, paymongo_mode, paymongo_direct_connection_id, move_in_required, move_in_confirmed_at FROM bookings WHERE id=? AND student_id=?',[bookingId,studentId]);
 if(!initial.length)throw fail(404,'Reservation not found.');
 if(initial[0].payment_status==='paid' || initial[0].paymongo_payment_id)throw fail(400,PAID_RESERVATION_POLICY);
 if(!studentCancellable(initial[0]))throw fail(400,'This reservation is already active. Please contact the property owner to check out.');
 // Close the hosted checkout first, as the expiry worker does, so a cancelled booking cannot still be paid.
 // A payment found here is settled instead, and the booking stays for owner review.
 if(initial[0].status==='confirmed' && initial[0].paymongo_session_id){
  let closed;
  try{closed=await closeCheckout(initial[0]);}catch{throw fail(503,'The online checkout could not be closed. Please try again in a few minutes.');}
  if(!closed)throw fail(409,'A payment for this reservation is processing or was just received, so it cannot be cancelled. Refresh in a few minutes to see the payment status. If the payment is verified, the reservation cannot be cancelled through the platform.');
 }
 let c;
 try {
  c=await pool.getConnection();await c.beginTransaction();
  await c.query('SELECT id FROM users WHERE id=? FOR UPDATE',[studentId]);
  const [rows]=await c.query('SELECT b.*, bh.owner_id, bh.name AS house_name FROM bookings b JOIN boarding_houses bh ON bh.id=b.house_id WHERE b.id=? AND b.student_id=? FOR UPDATE',[bookingId,studentId]);const b=rows[0];
  // A new checkout session opened after the close above must not survive the cancellation.
  if(!b || !studentCancellable(b) || b.status!==initial[0].status || (b.paymongo_session_id || null)!==(initial[0].paymongo_session_id || null))throw fail(409,'This reservation has changed. Please refresh My Bookings before cancelling.');
  const reference='REF-'+String(b.id).padStart(4,'0');
  const [occupants]=await c.query('SELECT id FROM occupants WHERE reference_no=? AND (check_out_date IS NULL OR check_out_date > CURDATE()) FOR UPDATE',[reference]);
  if(occupants.length)throw fail(400,'This reservation is already active. Please contact the property owner to check out.');
  await c.query("UPDATE bookings SET status='cancelled', expiry_reason='student_cancelled', expired_at=NOW(), occupancy_start_issue=NULL WHERE id=?",[b.id]);
  await c.query('INSERT INTO notifications (user_id,message,link) VALUES (?,?,?)',[b.owner_id,`RESERVATION CANCELLED: A student has cancelled their reservation for your property "${b.house_name}" (${reference}).`,'/owner/bookings']);
  await notifyRenewalIncomingClosed(c,b,b.owner_id,'cancelled by the requesting student');
  await c.commit();return {success:true};
 }catch(error){if(c)await c.rollback();throw error;}finally{c?.release();}
}
