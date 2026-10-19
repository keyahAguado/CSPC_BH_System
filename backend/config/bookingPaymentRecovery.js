import { requireOwnerPayments } from './ownerPayments.js';
import { closeExpiredCheckout } from './reservationExpiry.js';
import { bookingNow } from './bookingClock.js';
import { ownerResponseDeadline } from './stayAvailability.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const inTime=(b,now)=>{const due=b.status==='confirmed'?b.payment_due_at:b.owner_response_due_at;return !due || new Date(due).getTime()>now.getTime();};
const eligible=b=>b && ['pending','confirmed'].includes(b.status) && b.payment_method==='paymongo' && b.payment_status!=='paid' && !b.paymongo_payment_id && !Number(b.payment_review_required) && !b.move_in_confirmed_at;
async function requireInterrupted(db,b,ready) {
    try { await ready(db,b.house_id); }
    catch(error) { if(error.status===409)return; throw error; }
    throw fail(409,'Online payments are available again. Refresh your booking to continue online, or contact the owner about another payment arrangement.');
}
export async function requestCashRecovery(pool,studentId,bookingId,{confirmed=false,ready=requireOwnerPayments,closeCheckout=b=>closeExpiredCheckout(b,{pool}),now=bookingNow}={}) {
    if(!confirmed)throw fail(400,'Confirm that the unpaid online checkout will close and this booking will return for cash-payment approval.');
    const [initial]=await pool.query('SELECT * FROM bookings WHERE id = ? AND student_id = ?',[bookingId,studentId]);
    const before=initial[0];
    if(!before)throw fail(404,'Booking not found.');
    if(!eligible(before))throw fail(409,'Only an unpaid online request without a payment exception or started stay can request cash payment.');
    if(!inTime(before,now()))throw fail(409,'The reservation deadline has passed. Refresh the booking before choosing another payment arrangement.');
    await requireInterrupted(pool,before,ready);
    if(!ownerResponseDeadline(before.check_in_date,now()))throw fail(409,'There is not enough time for another owner review. Contact the owner; the current reservation and payment record are unchanged.');
    if(before.paymongo_session_id) {
        let closed;
        try { closed=await closeCheckout(before); }
        catch { throw fail(503,'The original online checkout could not be verified and closed. Cash payment has not been requested. Ask the owner to restore the original payment connection; do not pay twice.'); }
        if(!closed)throw fail(409,'An online payment is processing or was received. Cash payment has not been requested. Refresh your booking and do not pay twice.');
    }
    let db;
    try {
        db=await pool.getConnection();await db.beginTransaction();
        await db.query('SELECT id FROM users WHERE id = ? FOR UPDATE',[studentId]);
        const [rows]=await db.query('SELECT b.*, bh.owner_id FROM bookings b JOIN boarding_houses bh ON bh.id = b.house_id WHERE b.id = ? AND b.student_id = ? FOR UPDATE',[bookingId,studentId]);
        const b=rows[0];
        if(!eligible(b) || !inTime(b,now()) || b.status!==before.status || (b.paymongo_session_id||null)!==(before.paymongo_session_id||null))throw fail(409,'The booking or checkout changed. Refresh before requesting cash payment.');
        await db.query('SELECT id FROM users WHERE id = ? FOR UPDATE',[b.owner_id]);
        await requireInterrupted(db,b,ready);
        const due=ownerResponseDeadline(b.check_in_date,now());
        if(!due)throw fail(409,'There is not enough time left for owner review. Contact the owner.');
        const [occupants]=await db.query('SELECT id FROM occupants WHERE reference_no = ? FOR UPDATE',['REF-'+String(b.id).padStart(4,'0')]);
        if(occupants.length)throw fail(409,'This booking already has a stay record. Contact the owner instead of changing its payment method.');
        // Retain the verified-closed checkout/version identifiers for reconciliation. Never reuse it for cash.
        await db.query(`UPDATE bookings SET payment_method = 'cash', status = 'pending', payment_status = 'unpaid',
            cash_recovery_session_id = paymongo_session_id, paymongo_session_id = NULL,
            move_in_required = 0, payment_due_at = NULL, upfront_amount = NULL, owner_response_due_at = ?,
            cash_recovery_requested_at = UTC_TIMESTAMP() WHERE id = ?`,[due,b.id]);
        const reference='REF-'+String(b.id).padStart(4,'0');
        await db.query('INSERT INTO notifications (user_id,message,link) VALUES (?,?,?)',[studentId,`CASH PAYMENT REQUESTED: ${reference}. The unpaid online checkout was closed, or no checkout had been opened. Your request is back with the owner for cash-payment approval. Dates are unchanged, but no bed is guaranteed until approval. Do not pay cash before the owner approves and arranges collection.`,'/student/bookings/'+b.id]);
        await db.query('INSERT INTO notifications (user_id,message,link) VALUES (?,?,?)',[b.owner_id,`CASH PAYMENT REVIEW: ${reference}. The student requested cash because your online connection was unavailable. The unpaid online checkout was safely closed, or none existed. Review availability and approve or reject this cash request. The previous online approval no longer holds a bed; do not treat this notice as payment received.`,'/owner/bookings']);
        await db.commit();return {success:true,message:'Cash payment requested. The owner must review and approve your booking again.'};
    }catch(error){if(db)await db.rollback();throw error;}finally{db?.release();}
}
