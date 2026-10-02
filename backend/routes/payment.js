import express from 'express';
import axios from 'axios';
import { paymentError, providerOptions, verifyWebhook, settlePayment } from '../config/paymentSettlement.js';
import pool from '../config/db.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

/**
 * 1. POST - Create PayMongo Checkout Session
 * Calculates the exact upfront Move-In Cost and requests a hosted payment URL from PayMongo
 */
router.post('/checkout', authenticateToken, async (req, res) => {
    let connection;
    try {
        if (req.user.role !== 'student') throw paymentError(403, 'Only students can start booking payments.');
        const options = providerOptions();
        const { bookingId } = req.body;

        if (!Number.isSafeInteger(Number(bookingId)) || Number(bookingId) <= 0) {
            return res.status(400).json({ success: false, message: 'Booking ID is required.' });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();
        await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [req.user.id]);

        // Fetch the target booking details joined with boarding house criteria to calculate upfront move-in costs
        const [bookingRows] = await connection.query(
            `SELECT b.*, bh.name AS house_name, bh.advance_months, bh.deposit_months, bh.deposit_type, r.room_number
             FROM bookings b
             JOIN boarding_houses bh ON b.house_id = bh.id
             JOIN rooms r ON b.room_id = r.id
             WHERE b.id = ? AND b.student_id = ? FOR UPDATE`,
            [bookingId, req.user.id]
        );

        if (bookingRows.length === 0) {
            throw paymentError(404, 'Booking record not found.');
        }

        const b = bookingRows[0];
        if (b.status !== 'confirmed' || b.payment_method !== 'paymongo') throw paymentError(409, 'Only approved online reservations can be paid.');
        if (b.payment_status === 'paid' || b.paymongo_payment_id) throw paymentError(409, 'The upfront payment is already recorded.');
        if (b.paymongo_session_id) {
            const existing = (await axios.get('https://api.paymongo.com/v1/checkout_sessions/' + encodeURIComponent(b.paymongo_session_id), options)).data.data;
            if ((existing.attributes.payments || []).some(p => p.attributes?.status === 'paid')) {
                await connection.commit();
                connection.release();
                connection = undefined;
                return res.json(await settlePayment(pool, b.id, existing, req.user.id));
            }
            if (existing.attributes.status === 'active' && existing.attributes.checkout_url) {
                await connection.commit();
                return res.json({ success: true, checkoutUrl: existing.attributes.checkout_url });
            }
            if (existing.attributes.status !== 'expired') throw paymentError(409, 'This checkout session cannot be reused. Please contact the owner.');
        }

        const [recordedOccupants] = await connection.query('SELECT id FROM occupants WHERE reference_no = ? AND payment_method = ? FOR UPDATE', ['REF-' + String(b.id).padStart(4, '0'), 'paymongo']);
        if (recordedOccupants.length) throw paymentError(409, 'An online move-in payment is already recorded. Please contact the owner rather than paying again.');

        // Calculate the actual upfront move-in cost (advance + deposit) matching your exact database schema
        const advM = parseInt(b.advance_months || 0);
        const depM = parseInt(b.deposit_months || 0);
        const rent = parseFloat(b.monthly_rent || 0);

        // Excludes the non-existent fixed deposit to prevent query failures
        const initialPayment = (Math.max(1, advM) * rent) + (depM * rent);

        // Convert the upfront cost to centavos
        const amountInCentavos = Math.round(initialPayment * 100);

        if (!Number.isSafeInteger(amountInCentavos) || amountInCentavos <= 0) throw paymentError(409, 'The upfront amount is invalid. Please contact the owner.');

        // Determine frontend origin dynamically to prevent redirect errors to wrong port
        const reqOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
        const frontendUrl = process.env.FRONTEND_URL || reqOrigin || 'http://localhost';

        // Call PayMongo Checkout Session API
        const paymongoResponse = await axios.post(
            'https://api.paymongo.com/v2/checkout_sessions',
            {
                data: {
                    attributes: {
                        line_items: [
                            {
                                name: `Move-In Upfront Cost - Room ${b.room_number}`,
                                quantity: 1,
                                amount: amountInCentavos,
                                currency: 'PHP'
                            }
                        ],
                        payment_method_types: ['gcash', 'card', 'qrph'],
                        success_url: `${frontendUrl}/student/bookings?payment_success=true&bookingId=${bookingId}`,
                        cancel_url: `${frontendUrl}/student/bookings`,
                        description: `Upfront Payment for Reservation at ${b.house_name}`,
                        send_email_receipt: true,
                        metadata: {
                            bookingId: bookingId.toString()
                        }
                    }
                }
            },
            options
        );

        const session = paymongoResponse.data.data;
        const checkoutUrl = session?.attributes?.checkout_url;
        if (!session?.id || !checkoutUrl) throw paymentError(502, 'Invalid payment provider response.');
        await connection.query('UPDATE bookings SET paymongo_session_id = ? WHERE id = ?', [session.id, b.id]);
        await connection.commit();
        res.json({ success: true, checkoutUrl });

    } catch (err) {
        if (connection) await connection.rollback();
        console.error('[PAYMONGO CREATE ERROR]:', err.message);
        res.status(err.status || 502).json({ success: false, message: err.status ? err.message : 'Unable to start payment. Please try again shortly.' });
    } finally { connection?.release(); }
});

// A return URL is a request to verify payment, never proof of payment.
router.post('/verify-payment', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'student') throw paymentError(403, 'Only students can verify booking payments.');
        const id = Number(req.body.bookingId);
        if (!Number.isSafeInteger(id) || id <= 0) throw paymentError(400, 'A valid booking ID is required.');
        const [rows] = await pool.query('SELECT * FROM bookings WHERE id = ? AND student_id = ?', [id, req.user.id]);
        const b = rows[0];
        if (!b) throw paymentError(404, 'Booking not found.');
        if (b.payment_method !== 'paymongo') throw paymentError(409, 'This is not an online payment booking.');
        if (!b.paymongo_session_id) throw paymentError(409, 'No online checkout session is recorded. Please contact the owner if you already paid.');
        const session = (await axios.get('https://api.paymongo.com/v1/checkout_sessions/' + encodeURIComponent(b.paymongo_session_id), providerOptions())).data.data;
        res.json(await settlePayment(pool, id, session, req.user.id));
    } catch (error) {
        console.error('[PAYMENT VERIFICATION ERROR]:', error.message);
        res.status(error.status || 502).json({ success: false, message: error.status ? error.message : 'Payment verification is temporarily unavailable. Please refresh your bookings shortly.' });
    }
});

router.post('/webhook', async (req, res) => {
    try {
        const event = verifyWebhook(req);
        if (event.data.attributes.type !== 'checkout_session.payment.paid') return res.status(200).send('Event ignored.');
        const resource = event.data.attributes.data;
        const id = Number(resource?.attributes?.metadata?.bookingId);
        if (!Number.isSafeInteger(id) || id <= 0 || !resource?.id) throw paymentError(400, 'Invalid booking payment event.');
        const session = (await axios.get('https://api.paymongo.com/v1/checkout_sessions/' + encodeURIComponent(resource.id), providerOptions())).data.data;
        await settlePayment(pool, id, session, undefined, true);
        res.status(200).send('Webhook processed successfully.');
    } catch (error) {
        console.error('[PAYMENT WEBHOOK ERROR]:', error.message);
        res.status(error.status || 500).send(error.status ? error.message : 'Payment processing failed.');
    }
});

export default router;
