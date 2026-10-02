import crypto from 'crypto';

export function paymentError(status, message) {
    return Object.assign(new Error(message), { status });
}
export function providerOptions() {
    if (!/^sk_(test|live)_/.test(process.env.PAYMONGO_SECRET_KEY || '')) {
        throw paymentError(503, 'Online payment is temporarily unavailable.');
    }
    return { timeout: 15000, headers: { Authorization: 'Basic ' + Buffer.from(process.env.PAYMONGO_SECRET_KEY + ':').toString('base64') } };
}
export function verifyWebhook(req) {
    const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
    if (!secret) throw paymentError(503, 'Webhook verification is not configured.');
    providerOptions();
    if (typeof req.rawBody !== 'string' || typeof req.headers['paymongo-signature'] !== 'string') {
        throw paymentError(400, 'Missing raw payload or signature.');
    }
    const parts = Object.fromEntries(req.headers['paymongo-signature'].split(',').map(p => p.trim().split('=')));
    const mode = process.env.PAYMONGO_SECRET_KEY.startsWith('sk_live_');
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
export function paidSession(session, booking) {
    const a = session?.attributes;
    if (!a || session.id !== booking.paymongo_session_id || String(a.metadata?.bookingId) !== String(booking.id)) {
        throw paymentError(409, 'Payment session does not match this booking.');
    }
    if (a.livemode !== process.env.PAYMONGO_SECRET_KEY.startsWith('sk_live_')) throw paymentError(409, 'Payment mode does not match.');
    const amount = (a.line_items || []).reduce((sum, item) => sum + (item.currency === 'PHP' ? Number(item.amount) * Number(item.quantity) : NaN), 0);
    const payment = (a.payments || []).find(p => p.attributes?.status === 'paid');
    if (!payment) throw paymentError(409, 'PayMongo has not confirmed payment yet. Please refresh your bookings shortly.');
    if (!payment.id || !Number.isSafeInteger(amount) || amount <= 0 || payment.attributes.currency !== 'PHP' || Number(payment.attributes.amount) !== amount) {
        throw paymentError(409, 'Payment amount could not be verified. Please contact the owner.');
    }
    return { id: payment.id, amount };
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
            return { success: true, requiresReview: !existing.length, message: existing.length ? 'Payment already verified.' : 'Payment received. Please contact the owner to review your reservation.' };
        }
        const [rooms] = await connection.query("SELECT r.id, r.capacity FROM rooms r JOIN boarding_houses bh ON bh.id = r.house_id WHERE r.id = ? AND r.deleted_at IS NULL AND bh.house_status = 'accredited' FOR UPDATE", [b.room_id]);
        const [active] = await connection.query('SELECT id FROM occupants WHERE student_id = ? AND (check_out_date IS NULL OR check_out_date > CURDATE()) FOR UPDATE', [b.student_id]);
        const [other] = await connection.query("SELECT id FROM bookings WHERE student_id = ? AND id != ? AND status = 'confirmed' FOR UPDATE", [b.student_id, b.id]);
        const [occupied] = await connection.query('SELECT id FROM occupants WHERE room_id = ? AND (check_out_date IS NULL OR check_out_date > CURDATE()) FOR UPDATE', [b.room_id]);
        const [reserved] = await connection.query(
            `SELECT b.id FROM bookings b WHERE b.room_id = ? AND b.id != ? AND b.status = 'confirmed'
             AND b.payment_method = 'paymongo' AND b.payment_status != 'paid'
             AND NOT EXISTS (SELECT 1 FROM occupants o WHERE o.reference_no = CONCAT('REF-', IF(CHAR_LENGTH(b.id) < 4, LPAD(b.id, 4, '0'), b.id))
             AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())) FOR UPDATE`, [b.room_id, b.id]);
        const requiresReview = !existing.length && (b.status !== 'confirmed' || !rooms.length || active.length > 0 || other.length > 0 || occupied.length + reserved.length >= Number(rooms[0].capacity));
        const [full] = await connection.query(
            `SELECT b.*, u.name AS student_name, u.age, u.address, u.phone, u.emergency_contact, u.guardian_name,
                    bh.owner_id AS house_owner_id, bh.name AS house_name, r.room_number
             FROM bookings b JOIN users u ON u.id = b.student_id JOIN boarding_houses bh ON bh.id = b.house_id
             JOIN rooms r ON r.id = b.room_id WHERE b.id = ?`, [b.id]);
        const fb = full[0];
        if (!fb) throw paymentError(409, 'Booking details are unavailable.');
        await connection.query("UPDATE bookings SET payment_status = 'paid', paymongo_payment_id = ? WHERE id = ?", [payment.id, b.id]);
        if (!requiresReview && !existing.length) {
            await connection.query(
                `INSERT INTO occupants (room_id, student_id, reference_no, name, age, address, contact_number,
                  emergency_contact, guardian_name, check_in_date, months, amount, payment_status, payment_method, is_non_cspc)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Paid', 'paymongo', 0)`,
                [fb.room_id, fb.student_id, ref, fb.student_name, fb.age, fb.address, fb.phone, fb.emergency_contact, fb.guardian_name, fb.check_in_date, fb.months, fb.amount]);
        }
        const amount = (payment.amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const suffix = requiresReview ? 'The reservation needs owner review; no new occupancy was created.' : 'Your room reservation is secured.';
        await connection.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [fb.student_id, 'PAYMENT SETTLED: Your online payment of \u20b1' + amount + ' has been verified. ' + suffix]);
        if (fb.house_owner_id) await connection.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [fb.house_owner_id, 'PAYMENT RECEIVED: ' + fb.student_name + ' paid \u20b1' + amount + ' for Room ' + fb.room_number + '. ' + (requiresReview ? 'Please review this reservation; no new occupancy was created.' : 'Occupancy is recorded.')]);
        await connection.commit();
        return { success: true, requiresReview, message: requiresReview ? 'Payment received. Please contact the owner to review your reservation.' : 'Payment verified and occupancy successfully recorded.' };
    } catch (error) {
        if (connection) await connection.rollback();
        throw error;
    } finally { connection?.release(); }
}
