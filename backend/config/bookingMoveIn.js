import { notifyRenewalIncomingClosed } from './renewalPriority.js';
import { PAID_RESERVATION_POLICY } from './paidCancellation.js';
import { bookingNow } from './bookingClock.js';
import { bookingIdFromReference, bookingReference, calendarDay, formalDate, stayPeriod } from './stayAvailability.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const manilaDayOf=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const isPaid=value=>String(value || '').toLowerCase()==='paid';

// Paid stays whose student never arrives (docs/paid-non-arrival.md). Attendance records only: neither step cancels a
// paid reservation, releases its bed before the booked checkout, changes payment, or records refunds.
// Lock order matches arrival confirmation and cash no-show: student, booking, room, occupant.
async function lockStartedStay(connection,ownerId,bookingId) {
    const [initial]=await connection.query('SELECT b.id, b.student_id FROM bookings b JOIN boarding_houses bh ON bh.id = b.house_id WHERE b.id = ? AND bh.owner_id = ?',[bookingId,ownerId]);
    if (!initial.length) throw fail(404,'Reservation not found or access denied.');
    await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE',[initial[0].student_id]);
    const [rows]=await connection.query('SELECT * FROM bookings WHERE id = ? FOR UPDATE',[bookingId]);
    const b=rows[0];
    if (!b || b.status!=='confirmed' || Number(b.move_in_required)!==1) throw fail(409,'This booking is no longer an active stay. Refresh the booking.');
    await connection.query('SELECT id FROM rooms WHERE id = ? FOR UPDATE',[b.room_id]);
    const reference=bookingReference(b.id);
    const [occupants]=await connection.query('SELECT id, upfront_status, payment_status, check_out_date, arrival_required, arrival_confirmed_at, non_arrival_recorded_at FROM occupants WHERE reference_no = ? FOR UPDATE',[reference]);
    const o=occupants[0];
    if (!o || Number(o.arrival_required)!==1) throw fail(409,'This stay has not started automatically, so there is no arrival to record. Refresh the booking.');
    if (o.arrival_confirmed_at) throw fail(409,'Arrival is already confirmed for this stay. Record checkout from Boarder Details when the resident leaves.');
    if (o.check_out_date) throw fail(409,'This stay is already closed. Refresh the booking.');
    return {b,o,reference};
}

export async function recordNonArrival(pool,ownerId,bookingId,{note='',now=bookingNow()}={}) {
    if (note!=null && typeof note!=='string') throw fail(400,'The note must be text.');
    const text=String(note || '').trim();
    if (text.length>500) throw fail(400,'Keep the note to 500 characters or fewer.');
    const today=manilaDayOf(now);
    let connection;
    try {
        connection=await pool.getConnection();await connection.beginTransaction();
        const {b,o,reference}=await lockStartedStay(connection,ownerId,bookingId);
        if (!b.check_in_date || today<=calendarDay(b.check_in_date)) throw fail(409,'Non-arrival can be recorded only after the booked check-in day has passed.');
        if (Number(b.payment_review_required)) throw fail(409,'This booking has a payment exception, so it has no started stay to record.');
        const paid=(b.payment_method==='paymongo' && !!b.paymongo_payment_id) || isPaid(b.payment_status) || isPaid(o.upfront_status) || isPaid(o.payment_status);
        if (!paid) throw fail(409,'No payment is recorded for this stay. For an unpaid cash booking, use Cancel cash no-show instead.');
        if (o.non_arrival_recorded_at) { await connection.rollback(); return {success:true,message:'Non-arrival is already recorded for this stay.'}; }
        await connection.query('UPDATE occupants SET non_arrival_recorded_at = NOW(), non_arrival_note = ? WHERE id = ?',[text || null,o.id]);
        const period=stayPeriod(b.check_in_date,b.months);
        await connection.query('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',[b.student_id,`MARKED NOT ARRIVED: ${reference}. The owner recorded that you have not arrived for your stay from ${formalDate(period.start)} to ${formalDate(period.end)} (checkout). Your reservation and payment are unchanged for now. If you do not arrive, the owner may close the stay as "Did not arrive" and release your bed. If you have arrived or still plan to, contact the owner as soon as possible so they can confirm your arrival. Concerns about the upfront payment are handled with the owner outside the platform.`,'/student/bookings/'+b.id]);
        await connection.commit();
        return {success:true,message:`Non-arrival recorded and the student was notified. The bed is still held. Confirm arrival if the student turns up, or close the stay as "Did not arrive" to free the bed.`};
    }catch(error){if(connection)await connection.rollback();throw error;}
    finally{connection?.release();}
}

export async function closeNonArrival(pool,ownerId,bookingId,{now=bookingNow()}={}) {
    const today=manilaDayOf(now);
    let connection;
    try {
        connection=await pool.getConnection();await connection.beginTransaction();
        const {b,o,reference}=await lockStartedStay(connection,ownerId,bookingId);
        if (!o.non_arrival_recorded_at) throw fail(409,'Record non-arrival first. A stay is closed as "Did not arrive" only after non-arrival has been recorded.');
        let period;
        try { period=stayPeriod(b.check_in_date,b.months); } catch { throw fail(409,'This booking has invalid stay dates. Refresh the booking.'); }
        // The upfront payment covers move-in (advance + deposit), not the whole stay, so the owner may free the bed
        // once non-arrival is recorded. The stay ends today (never later than the booked checkout); the remaining
        // dates are released, like a cash no-show. The payment record is kept; settlement happens outside the platform.
        const closedOn=today<period.end ? today : period.end;
        await connection.query('UPDATE occupants SET check_out_date = ? WHERE id = ?',[closedOn,o.id]);
        await connection.query("UPDATE bookings SET status = 'not_arrived', occupancy_start_issue = NULL WHERE id = ?",[b.id]);
        const released=closedOn<period.end ? ` The remaining booked dates (${formalDate(closedOn)} to ${formalDate(period.end)}) were released.` : '';
        const message=`STAY CLOSED AS NOT ARRIVED: ${reference}. The student did not arrive for the stay booked from ${formalDate(period.start)}, and the owner closed it as "Did not arrive" on ${formalDate(closedOn)}.${released} The payment record is unchanged. Concerns about the upfront payment are handled between the student and the owner, outside the platform.`;
        await connection.query('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',[b.student_id,message,'/student/bookings/'+b.id]);
        await connection.query('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',[ownerId,message,'/owner/bookings']);
        await connection.commit();
        return {success:true,message:`Stay closed as "Did not arrive" and the bed is free from ${formalDate(closedOn)}. It was not marked Completed, and the payment record is unchanged.`};
    }catch(error){if(connection)await connection.rollback();throw error;}
    finally{connection?.release();}
}

export async function updateBookingArrival(pool,ownerId,bookingId,{noShow=false,now=bookingNow()}={}) {
    if (!noShow) throw fail(410,'Booked stays start automatically. No move-in confirmation is needed.');
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    let connection;
    try {
        connection=await pool.getConnection();await connection.beginTransaction();
        const [initial]=await connection.query('SELECT b.id, b.student_id FROM bookings b JOIN boarding_houses bh ON bh.id = b.house_id WHERE b.id = ? AND bh.owner_id = ?',[bookingId,ownerId]);
        if (!initial.length) throw fail(404,'Reservation not found or access denied.');
        await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE',[initial[0].student_id]);
        const [rows]=await connection.query('SELECT * FROM bookings WHERE id = ? FOR UPDATE',[bookingId]);
        const b=rows[0];
        if (!b || b.status!=='confirmed' || Number(b.move_in_required)!==1) throw fail(409,'Only an approved unpaid cash reservation can be cancelled as a no-show.');
        if (b.payment_method!=='cash' || b.payment_status==='paid' || b.paymongo_payment_id) throw fail(409,'Only an unpaid cash reservation can be closed as a no-show. '+PAID_RESERVATION_POLICY);
        if (!b.check_in_date || today<=calendarDay(b.check_in_date)) throw fail(409,'A no-show can only be confirmed after the scheduled check-in day has passed.');
        await connection.query('SELECT id FROM rooms WHERE id = ? FOR UPDATE',[b.room_id]);
        const reference='REF-'+String(b.id).padStart(4,'0');
        const [occupants]=await connection.query('SELECT id, upfront_status, payment_status, check_out_date, arrival_confirmed_at FROM occupants WHERE reference_no = ? FOR UPDATE',[reference]);
        if (occupants.some(o=>o.arrival_confirmed_at)) throw fail(409,'Arrival is already confirmed for this stay, so it cannot be cancelled as a no-show. Record checkout from Boarder Details instead.');
        if (occupants.length && (Number(b.occupancy_auto_started)!==1 || occupants.some(o=>o.check_out_date || String(o.upfront_status).toLowerCase()==='paid' || String(o.payment_status).toLowerCase()==='paid'))) throw fail(409,'This stay already has a recorded payment, a manual start, or a checkout, so it cannot be closed as an unpaid cash no-show. Confirm arrival if the student moved in. A paid stay cannot be cancelled through the platform; handle a non-arrival with the student outside the platform.');
        if (occupants.length) await connection.query('UPDATE occupants SET check_out_date = ? WHERE reference_no = ? AND check_out_date IS NULL',[today,reference]);
        await connection.query("UPDATE bookings SET status = 'cancelled', expiry_reason = 'cash_no_show', expired_at = NOW(), occupancy_start_issue = NULL WHERE id = ?",[b.id]);
        const message=`CASH NO-SHOW CANCELLED: ${reference}. The owner confirmed non-arrival after the booked check-in day. This unpaid stay has been closed and its remaining dates released. Other reservations are unchanged.`;
        await connection.query('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',[b.student_id,message,'/student/bookings/'+b.id]);
        await connection.query('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',[ownerId,message,'/owner/bookings']);
        await notifyRenewalIncomingClosed(connection,b,ownerId,'closed as an unpaid cash no-show');
        await connection.commit();return {success:true,message:'Cash no-show cancelled. This stay is closed and its remaining dates are available again.'};
    }catch(error){if(connection)await connection.rollback();throw error;}
    finally{connection?.release();}
}

// Physical arrival is separate from the scheduled start and from payment. Only the owner records it;
// recording cash or a scheduled start never implies arrival.
export async function confirmOccupantArrival(pool,ownerId,occupantId,{now=bookingNow()}={}) {
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    let connection;
    try {
        connection=await pool.getConnection();await connection.beginTransaction();
        const [owned]=await connection.query('SELECT o.id, o.student_id, o.room_id, o.reference_no FROM occupants o JOIN rooms r ON r.id = o.room_id JOIN boarding_houses bh ON bh.id = r.house_id WHERE o.id = ? AND bh.owner_id = ?',[occupantId,ownerId]);
        if (!owned.length) throw fail(404,'Occupant not found or access denied.');
        const occupant=owned[0];
        // Same lock order as automatic starts and no-show cancellation: student, booking, room, occupant.
        if (occupant.student_id) await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE',[occupant.student_id]);
        const [linked]=occupant.reference_no ? await connection.query("SELECT id, status FROM bookings WHERE id = ? FOR UPDATE",[bookingIdFromReference(occupant.reference_no)]) : [[]];
        await connection.query('SELECT id FROM rooms WHERE id = ? FOR UPDATE',[occupant.room_id]);
        const [rows]=await connection.query('SELECT id, check_in_date, check_out_date, arrival_required, arrival_confirmed_at FROM occupants WHERE id = ? FOR UPDATE',[occupantId]);
        const o=rows[0];
        if (!o || Number(o.arrival_required)!==1) throw fail(409,'This boarder does not need arrival confirmation.');
        if (o.arrival_confirmed_at) { await connection.rollback(); return {success:true,message:'Arrival is already confirmed.'}; }
        if (o.check_out_date && calendarDay(o.check_out_date)<=today) throw fail(409,'This stay is already checked out.');
        if (linked[0] && linked[0].status!=='confirmed') throw fail(409,'This booking is no longer active. Refresh Boarder Details.');
        if (!o.check_in_date || calendarDay(o.check_in_date)>today) throw fail(409,'Arrival can be confirmed from the booked check-in date.');
        // Confirming arrival supersedes an earlier non-arrival record (the student turned up late).
        await connection.query('UPDATE occupants SET arrival_confirmed_at = NOW(), non_arrival_recorded_at = NULL, non_arrival_note = NULL WHERE id = ?',[occupantId]);
        if (occupant.student_id && linked[0]) await connection.query('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',[occupant.student_id,`ARRIVAL CONFIRMED: ${occupant.reference_no}. The owner recorded your move-in.`,'/student/bookings/'+linked[0].id]);
        await connection.commit();return {success:true,message:'Arrival confirmed. This boarder now counts as a resident.'};
    }catch(error){if(connection)await connection.rollback();throw error;}
    finally{connection?.release();}
}
