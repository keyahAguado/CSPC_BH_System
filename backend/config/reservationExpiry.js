import { notifyRenewalIncomingClosed } from './renewalPriority.js';
import axios from 'axios';
import { providerOptions, bookingProviderOptions, settlePayment, assertCheckoutContext } from './paymentSettlement.js';

// Closing the provider session first prevents a released room from retaining a payable URL.
export async function closeExpiredCheckout(booking, { http = axios, options = null, settle = settlePayment, pool } = {}) {
    if (!booking.paymongo_session_id) return true;
    const url = 'https://api.paymongo.com/v1/checkout_sessions/' + encodeURIComponent(booking.paymongo_session_id);
    const config = options ? await options(booking.paymongo_account_id, booking.paymongo_mode) : await bookingProviderOptions(pool,booking);
    const inspect = async () => {
        const session = (await http.get(url, config)).data.data;
        assertCheckoutContext(session, booking);
        if ((session?.attributes?.payments || []).some(payment => payment.attributes?.status === 'paid')) {
            await settle(pool, booking.id, session);
            return { paid: true, expired: false };
        }
        return { paid: false, expired: session?.attributes?.status === 'expired' };
    };
    const state = await inspect();
    if (state.paid) return false;
    if (state.expired) return true;
    try {
        const response = await http.post(url + '/expire', {}, config);
        if (response.data?.data?.attributes?.status === 'expired') return true;
        return (await inspect()).expired;
    } catch (error) {
        // Paid, pending or processing payments cannot be expired. Retry on a later sweep.
        if (error.response?.status !== 400) throw error;
        return (await inspect()).expired;
    }
}

export function createReservationExpiryWorker({ pool, closeCheckout = booking => closeExpiredCheckout(booking, { pool }), logger = console }) {
    let running = false;
    return async function runReservationExpiry() {
        if (running) return { skipped: true };
        running = true;
        let expired = 0;
        try {
            const [candidates] = await pool.query(`SELECT b.id, b.student_id, b.status, b.paymongo_session_id, b.paymongo_account_id, b.paymongo_mode, b.paymongo_direct_connection_id
                FROM bookings b WHERE b.payment_status != 'paid' AND b.paymongo_payment_id IS NULL
                AND ((b.status = 'pending' AND b.owner_response_due_at <= NOW())
                  OR (b.status = 'confirmed' AND b.payment_method = 'paymongo' AND b.payment_due_at <= NOW()))
                AND NOT EXISTS (SELECT 1 FROM occupants o WHERE o.reference_no = CONCAT('REF-', IF(CHAR_LENGTH(b.id) < 4, LPAD(b.id, 4, '0'), b.id))
                  AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE()))
                ORDER BY b.id LIMIT 100`);
            for (const candidate of candidates) {
                let connection;
                try {
                    if (candidate.status === 'confirmed' && !(await closeCheckout(candidate))) continue;
                    connection = await pool.getConnection();
                    await connection.beginTransaction();
                    if (candidate.student_id) await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [candidate.student_id]);
                    const [rows] = await connection.query(`SELECT b.*, bh.owner_id,
                        ((b.status = 'pending' AND b.owner_response_due_at <= NOW()) OR
                         (b.status = 'confirmed' AND b.payment_method = 'paymongo' AND b.payment_due_at <= NOW())) AS deadline_due
                        FROM bookings b JOIN boarding_houses bh ON bh.id = b.house_id WHERE b.id = ? FOR UPDATE`, [candidate.id]);
                    const b = rows[0];
                    if (!b || !Number(b.deadline_due) || b.payment_status === 'paid' || b.paymongo_payment_id ||
                        (b.status === 'confirmed' && (b.paymongo_session_id || null) !== (candidate.paymongo_session_id || null))) {
                        await connection.rollback(); continue;
                    }
                    const reference = 'REF-' + String(b.id).padStart(4, '0');
                    const [occupants] = await connection.query('SELECT id FROM occupants WHERE reference_no = ? AND (check_out_date IS NULL OR check_out_date > CURDATE())', [reference]);
                    if (occupants.length) { await connection.rollback(); continue; }
                    const reason = b.status === 'pending' ? 'owner_timeout' : 'payment_timeout';
                    await connection.query("UPDATE bookings SET status = 'cancelled', expired_at = NOW(), expiry_reason = ? WHERE id = ?", [reason, b.id]);
                    const explanation = reason === 'owner_timeout' ? 'Your request expired because the owner did not respond before the approval deadline. You may send a new request or choose another property.' : 'Your reservation expired because online payment was not completed before the payment deadline. The reserved bed has been released. If you still need a room, submit a new booking request.';
                    if (b.student_id) await connection.query('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)', [b.student_id, `RESERVATION EXPIRED: ${reference}. ${explanation}`, '/student/bookings/' + b.id]);
                    // Owners get their own wording: what happened and that no action is needed.
                    const ownerExplanation = reason === 'owner_timeout' ? 'The request was not answered before the response deadline, so it closed automatically. No bed was held. No action is needed; the student was notified.' : 'The student did not complete the online payment before the payment deadline, so the reservation closed automatically and the bed is available again for these dates. No action is needed; the student was notified.';
                    if (b.owner_id) await connection.query('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)', [b.owner_id, `RESERVATION EXPIRED: ${reference}. ${ownerExplanation}`, '/owner/bookings']);
                    await notifyRenewalIncomingClosed(connection,b,b.owner_id,'expired after its response or online payment deadline');
                    await connection.commit();
                    expired++;
                } catch (error) {
                    if (connection) await connection.rollback();
                    logger.error('[RESERVATION EXPIRY]', candidate.id, error.message);
                } finally { connection?.release(); }
            }
            return { expired };
        } catch (error) {
            logger.error('[RESERVATION EXPIRY]', error.message);
            return { expired, failed: true };
        } finally { running = false; }
    };
}
