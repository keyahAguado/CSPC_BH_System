// Notify each affected booking once. Lock order matches payment settlement: student, then booking.
export async function notifyPaymentInterruption(pool, owner) {
    const [candidates] = await pool.query(`SELECT b.id, b.student_id FROM bookings b
        JOIN boarding_houses bh ON bh.id = b.house_id WHERE bh.owner_id = ?
        AND b.payment_method = 'paymongo' AND b.status IN ('pending','confirmed')
        AND b.payment_status != 'paid' AND b.paymongo_payment_id IS NULL
        AND (b.paymongo_mode IS NULL OR b.paymongo_mode = ?)
        AND b.payment_interruption_notified_at IS NULL`, [owner.owner_id, owner.mode]);
    for (const candidate of candidates) {
        let db;
        try {
            db = await pool.getConnection(); await db.beginTransaction();
            await db.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [candidate.student_id]);
            const [rows] = await db.query(`SELECT b.*, bh.owner_id FROM bookings b JOIN boarding_houses bh ON bh.id = b.house_id
                WHERE b.id = ? AND bh.owner_id = ? FOR UPDATE`, [candidate.id, owner.owner_id]);
            const b = rows[0];
            if (!b || b.payment_method !== 'paymongo' || !['pending','confirmed'].includes(b.status) || b.payment_status === 'paid' || b.paymongo_payment_id || b.payment_interruption_notified_at || (b.paymongo_mode && b.paymongo_mode!==owner.mode)) { await db.rollback(); continue; }
            const reference = 'REF-' + String(b.id).padStart(4,'0');
            await db.query('UPDATE bookings SET payment_interruption_notified_at = UTC_TIMESTAMP() WHERE id = ?', [b.id]);
            await db.query('INSERT INTO notifications (user_id,message,link) VALUES (?,?,?)', [b.student_id,
                `ONLINE PAYMENT INTERRUPTED: ${reference}. The owner's online payment connection is unavailable. This is not a cancellation or proof of failed payment. Open your booking to check payment or request cash payment for owner review. Any online checkout must be verified and closed first. Do not pay twice. Existing deadlines remain until a cash request is accepted by the system.`, '/student/bookings/' + b.id]);
            await db.query('INSERT INTO notifications (user_id,message,link) VALUES (?,?,?)', [owner.owner_id,
                `BOOKING PAYMENT INTERRUPTED: ${reference}. Your online connection is unavailable for this student's unpaid request. Restore and check your connection in Online payments. The student can request cash payment; that returns the booking for your approval after its online checkout is safely closed. Do not collect cash for an unresolved online payment. Existing deadlines still apply.`, '/owner/bookings']);
            await db.commit();
        } catch (error) { if (db) await db.rollback(); throw error; }
        finally { db?.release(); }
    }
}
