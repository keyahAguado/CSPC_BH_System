import { bookingNow } from './bookingClock.js';
import { startBookedStay } from './scheduledOccupancy.js';
import { stayPeriod, studentStayConflict, roomStayUsage } from './stayAvailability.js';
import crypto from 'crypto';
import { paymentMode } from './paymentEnvironment.js';
import { directOptionsForBooking } from './ownerDirectPayments.js';

export async function bookingProviderOptions(db,booking) {
    return booking.paymongo_direct_connection_id ? directOptionsForBooking(db,booking) : providerOptions(booking.paymongo_account_id,booking.paymongo_mode);
}

export function paymentError(status, message) {
    return Object.assign(new Error(message), { status });
}
export function providerOptions(accountId = null, mode = null) {
    if (!/^sk_(test|live)_/.test(process.env.PAYMONGO_SECRET_KEY || '')) {
        throw paymentError(503, 'Online payment is temporarily unavailable.');
    }
    if (mode && mode !== (process.env.PAYMONGO_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test')) throw paymentError(409, 'This payment belongs to a different payment environment. Contact the administrator.');
    if (accountId && !/^org_[a-zA-Z0-9]+$/.test(accountId)) throw paymentError(409, 'The receiving payment account is invalid.');
    return { timeout: 15000, headers: { Authorization: 'Basic ' + Buffer.from(process.env.PAYMONGO_SECRET_KEY + ':').toString('base64'), ...(accountId ? {'Account-ID': accountId} : {}) } };
}
export function verifyWebhook(req, secret = process.env.PAYMONGO_WEBHOOK_SECRET, expectedMode = null) {
    if (!secret) throw paymentError(503, 'Webhook verification is not configured.');
    if (!expectedMode) providerOptions();
    if (typeof req.rawBody !== 'string' || typeof req.headers['paymongo-signature'] !== 'string') {
        throw paymentError(400, 'Missing raw payload or signature.');
    }
    const parts = Object.fromEntries(req.headers['paymongo-signature'].split(',').map(p => p.trim().split('=')));
    if (expectedMode && (!['test','live'].includes(expectedMode)||expectedMode!==paymentMode())) throw paymentError(409, 'Webhook payment mode does not match.');
    const mode = expectedMode ? expectedMode==='live' : process.env.PAYMONGO_SECRET_KEY.startsWith('sk_live_');
    const signature = parts[mode ? 'li' : 'te'];
    if (!/^\d+$/.test(parts.t || '') || !/^[a-f0-9]{64}$/i.test(signature || '')) {
        throw paymentError(401, 'Invalid webhook signature.');
    }
    if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) throw paymentError(401, 'Expired webhook signature.');
    const expected = crypto.createHmac('sha256', secret).update(parts.t + '.' + req.rawBody).digest();
    if (!crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw paymentError(401, 'Invalid webhook signature.');
    let event;
    try { event = JSON.parse(req.rawBody); } catch { throw paymentError(400, 'Invalid webhook payload.'); }
    if (!event?.data?.attributes?.type) throw paymentError(400, 'Invalid webhook event.');
    return event;
}
export function assertCheckoutContext(session, booking) {
    const a = session?.attributes;
    if (!a || session.id !== booking.paymongo_session_id || String(a.metadata?.bookingId) !== String(booking.id)) {
        throw paymentError(409, 'Payment session does not match this booking.');
    }
    const expectedMode=booking.paymongo_mode || (process.env.PAYMONGO_SECRET_KEY?.startsWith('sk_live_')?'live':'test');
    if (a.livemode !== (expectedMode==='live')) throw paymentError(409, 'Payment mode does not match.');
    if (booking.paymongo_mode && booking.paymongo_mode !== (a.livemode ? 'live' : 'test')) throw paymentError(409, 'Saved payment mode does not match.');
    if (booking.paymongo_account_id && a.metadata?.PYM_executed_for !== booking.paymongo_account_id) throw paymentError(409, 'Payment recipient does not match this booking.');
    if (booking.paymongo_direct_connection_id && a.metadata?.paymentConnectionId !== booking.paymongo_direct_connection_id) throw paymentError(409, 'Payment credential context does not match this booking.');
    return a;
}
export function paidSession(session, booking) {
    const a = assertCheckoutContext(session, booking);
    const amount = (a.line_items || []).reduce((sum, item) => sum + (item.currency === 'PHP' ? Number(item.amount) * Number(item.quantity) : NaN), 0);
    const payment = (a.payments || []).find(p => p.attributes?.status === 'paid');
    if (!payment) throw paymentError(409, 'PayMongo has not confirmed payment yet. Please refresh your bookings shortly.');
    if (!payment.id || !Number.isSafeInteger(amount) || amount <= 0 || payment.attributes.currency !== 'PHP' || Number(payment.attributes.amount) !== amount) {
        throw paymentError(409, 'Payment amount could not be verified. Please contact the owner.');
    }
    const paidAt=Number(payment.attributes.paid_at);
    return { id: payment.id, amount, paidAt:Number.isFinite(paidAt) && paidAt>0 ? paidAt*1000 : null };
}

// A payment exception: the verified payment stays on record, but it did not secure the reservation, so no bed is
// held and no stay starts. The platform cannot cancel, refund or reinstate a paid reservation; the student and the
// owner settle it outside the platform. Wording must not suggest an in-app review, cancellation or refund step.
export const PAYMENT_EXCEPTION_RESPONSE = 'Payment received, but it could not secure this reservation. Do not pay again. Open the booking for the reason and next steps.';
export function paymentExceptionNotices({ reference, amount, roomNumber, studentName, reason, existingStay }) {
    const bed = existingStay ? 'The existing stay record is unchanged.' : 'No bed is held for these dates, and the stay will not start automatically.';
    return {
        student: 'RESERVATION NOT SECURED: ' + reference + '. Your online payment of ₱' + amount + ' was verified, but it could not secure this reservation. Reason: ' + reason + ' ' + bed + ' The platform cannot cancel this reservation or refund the payment. Contact the owner to settle it outside the platform; this does not mean the payment is non-refundable. Do not pay again.',
        owner: 'PAYMENT EXCEPTION: ' + reference + '. ' + studentName + ' paid ₱' + amount + ' online for Room ' + roomNumber + ', but the payment could not secure the reservation. Reason: ' + reason + ' ' + bed + ' The platform cannot cancel, refund or reinstate this reservation. Settle it with the student outside the platform.'
    };
}

// Both return verification and webhooks use this transaction. Lock order matches booking approval.
export async function settlePayment(pool, bookingId, session, studentId, allowLegacySession = false) {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [initial] = await connection.query('SELECT student_id FROM bookings WHERE id = ?', [bookingId]);
        if (!initial.length || (studentId !== undefined && initial[0].student_id !== studentId)) throw paymentError(404, 'Booking not found.');
        await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [initial[0].student_id]);
        const [rows] = await connection.query('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [bookingId]);
        const b = rows[0];
        if (!b || b.payment_method !== 'paymongo') throw paymentError(409, 'This booking is not an online payment booking.');
        // Signed webhooks can recover checkout sessions created before session IDs were persisted.
        if (!b.paymongo_session_id && allowLegacySession && String(session?.attributes?.metadata?.bookingId) === String(b.id)) {
            b.paymongo_session_id = session.id;
            await connection.query('UPDATE bookings SET paymongo_session_id = ? WHERE id = ?', [session.id, b.id]);
        }
        const payment = paidSession(session, b);
        const ref = 'REF-' + String(b.id).padStart(4, '0');
        const [existing] = await connection.query('SELECT id FROM occupants WHERE reference_no = ? FOR UPDATE', [ref]);
        if (b.paymongo_payment_id) {
            if (b.paymongo_payment_id !== payment.id) throw paymentError(409, 'A different payment is already recorded. Please contact the owner.');
            await connection.commit();
            const review = !!Number(b.payment_review_required) || !existing.length && !(Number(b.move_in_required) === 1 && b.status === 'confirmed' && !Number(b.payment_review_required));
            return { success: true, requiresReview: review, message: review ? PAYMENT_EXCEPTION_RESPONSE : 'Payment already verified. Your reservation is secured.' };
        }
        const [rooms] = await connection.query("SELECT r.id, r.capacity FROM rooms r JOIN boarding_houses bh ON bh.id = r.house_id WHERE r.id = ? AND r.deleted_at IS NULL AND bh.house_status = 'accredited' FOR UPDATE", [b.room_id]);
        let scheduleConflict = true;
        try {
            const period = stayPeriod(b.check_in_date,b.months);
            scheduleConflict = await studentStayConflict(connection,b.student_id,period,{excludeBookingId:b.id,excludeReference:ref}) ||
                !rooms.length || await roomStayUsage(connection,b.room_id,period,{excludeBookingId:b.id,excludeReference:ref}) >= Number(rooms[0].capacity);
        } catch (error) { if (!error.status) throw error; }
        const paymentIssues=[];
        const expected=b.upfront_amount == null ? null : Math.round(Number(b.upfront_amount)*100);
        if(expected == null && !existing.length)paymentIssues.push('This older booking has no saved upfront amount to compare the payment with.');
        else if(expected != null && (!Number.isSafeInteger(expected) || expected<=0 || expected!==payment.amount))paymentIssues.push('The amount paid does not match the approved upfront amount.');
        if(b.payment_due_at){
            const due=new Date(b.payment_due_at).getTime();
            if(!Number.isFinite(due))paymentIssues.push('The saved payment deadline is invalid.');
            else if(payment.paidAt!=null ? payment.paidAt>=due : bookingNow().getTime()>=due)paymentIssues.push(payment.paidAt!=null ? 'PayMongo recorded the payment at or after the payment deadline.' : 'The payment was verified after the payment deadline, and PayMongo gave no payment time.');
        }
        if(Number(b.payment_review_required))paymentIssues.push('This booking already has a payment exception on record.');
        if(!existing.length && (b.status!=='confirmed' || scheduleConflict))paymentIssues.push('When the payment arrived, this booking was no longer active or its dates were no longer available.');
        const requiresReview=paymentIssues.length>0;
        const [full] = await connection.query(
            `SELECT b.*, u.name AS student_name, u.age, u.address, u.phone, u.emergency_contact, u.guardian_name,
                    bh.owner_id AS house_owner_id, bh.name AS house_name, r.room_number
             FROM bookings b JOIN users u ON u.id = b.student_id JOIN boarding_houses bh ON bh.id = b.house_id
             JOIN rooms r ON r.id = b.room_id WHERE b.id = ?`, [b.id]);
        const fb = full[0];
        if (!fb) throw paymentError(409, 'Booking details are unavailable.');
        if (!existing.length) {
            await connection.query('UPDATE bookings SET move_in_required = 1 WHERE id = ?', [b.id]);
            b.move_in_required = 1;
        }
        await connection.query("UPDATE bookings SET payment_status = 'paid', paymongo_payment_id = ? WHERE id = ?", [payment.id, b.id]);
        if (requiresReview) await connection.query('UPDATE bookings SET payment_review_required = 1, payment_review_reason = ? WHERE id = ?', [paymentIssues.join(' '),b.id]);
        if (!requiresReview && !existing.length) await startBookedStay(connection,{...fb,...b,payment_status:'paid',paymongo_payment_id:payment.id});
        const amount = (payment.amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (requiresReview) {
            const notice = paymentExceptionNotices({ reference: ref, amount, roomNumber: fb.room_number, studentName: fb.student_name, reason: paymentIssues.join(' '), existingStay: existing.length > 0 });
            await connection.query('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)', [fb.student_id, notice.student, '/student/bookings/' + b.id]);
            if (fb.house_owner_id) await connection.query('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)', [fb.house_owner_id, notice.owner, '/owner/bookings']);
        } else {
            const suffix = existing.length ? 'Your existing move-in record remains unchanged.' : 'Your room reservation is secured. Your secured stay starts automatically on the booked check-in date, with its booked checkout date unchanged.';
            await connection.query('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)', [fb.student_id, 'PAYMENT SETTLED: Your online payment of \u20b1' + amount + ' has been verified. ' + suffix, '/student/bookings/' + b.id]);
            if (fb.house_owner_id) await connection.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [fb.house_owner_id, 'PAYMENT RECEIVED: ' + fb.student_name + ' paid \u20b1' + amount + ' for Room ' + fb.room_number + '. ' + (Number(b.move_in_required) === 1 ? 'The bed is secured. The stay starts automatically on its booked check-in date.' : 'Occupancy is recorded.')]);
        }
        await connection.commit();
        return { success: true, requiresReview, message: requiresReview ? PAYMENT_EXCEPTION_RESPONSE : (Number(b.move_in_required) === 1 ? 'Payment verified. Your bed is reserved; occupancy starts automatically on the booked check-in date.' : 'Payment verified and occupancy successfully recorded.') };
    } catch (error) {
        if (connection) await connection.rollback();
        throw error;
    } finally { connection?.release(); }
}
