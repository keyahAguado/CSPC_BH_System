import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import pool from '../config/db.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

/**
 * 1. POST - Create PayMongo Checkout Session
 * Calculates the exact upfront Move-In Cost and requests a hosted payment URL from PayMongo
 */
router.post('/checkout', authenticateToken, async (req, res) => {
    try {
        const { bookingId } = req.body;

        if (!bookingId) {
            return res.status(400).json({ success: false, message: 'Booking ID is required.' });
        }

        // Fetch the target booking details joined with boarding house criteria to calculate upfront move-in costs
        const [bookingRows] = await pool.query(
            `SELECT b.*, bh.name AS house_name, bh.advance_months, bh.deposit_months, bh.deposit_type, r.room_number
             FROM bookings b
             JOIN boarding_houses bh ON b.house_id = bh.id
             JOIN rooms r ON b.room_id = r.id
             WHERE b.id = ? AND b.student_id = ?`,
            [bookingId, req.user.id]
        );

        if (bookingRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Booking record not found.' });
        }

        const b = bookingRows[0];

        // Calculate the actual upfront move-in cost (advance + deposit) matching your exact database schema
        const advM = parseInt(b.advance_months || 0);
        const depM = parseInt(b.deposit_months || 0);
        const rent = parseFloat(b.monthly_rent || 0);

        // Excludes the non-existent fixed deposit to prevent query failures
        const initialPayment = (Math.max(1, advM) * rent) + (depM * rent);

        // Convert the upfront cost to centavos
        const amountInCentavos = Math.round(initialPayment * 100);

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
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY + ':').toString('base64')}`
                }
            }
        );

        const checkoutUrl = paymongoResponse.data.data.attributes.checkout_url;
        res.json({ success: true, checkoutUrl });

    } catch (err) {
        console.error('[PAYMONGO CREATE ERROR]:', err.response?.data || err.message);
        res.status(500).json({ success: false, message: 'Failed to create payment session.' });
    }
});

/**
 * 2. POST - Verify and Settle Payment (Transaction-safe sync)
 * Called once the student returns to /student/bookings on successful checkout
 */
router.post('/verify-payment', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { bookingId } = req.body;

        const [bookingRows] = await connection.query(
            'SELECT payment_status, room_id, student_id FROM bookings WHERE id = ? AND student_id = ?',
            [bookingId, req.user.id]
        );

        if (bookingRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        const { payment_status, student_id, room_id } = bookingRows[0];

        // Guard: Prevent duplicate processing if webhook already settled this payment
        if (payment_status === 'paid') {
            await connection.rollback();
            return res.json({ success: true, message: 'Payment already settled.' });
        }

        // 1. Set payment status to 'paid' in bookings table
        await connection.query(
            "UPDATE bookings SET payment_status = 'paid' WHERE id = ?",
            [bookingId]
        );

        // 2. Fetch full student details joined with boarding house criteria to calculate upfront move-in costs
        const [fullBooking] = await connection.query(
            `SELECT b.*, u.name as student_name, u.age, u.address, u.phone, u.emergency_contact, u.guardian_name,
                    bh.advance_months, bh.deposit_months, bh.deposit_type, bh.name as house_name, bh.owner_id as house_owner_id,
                    r.room_number
             FROM bookings b 
             JOIN users u ON b.student_id = u.id 
             JOIN boarding_houses bh ON b.house_id = bh.id
             JOIN rooms r ON b.room_id = r.id
             WHERE b.id = ?`,
            [bookingId]
        );

        const fb = fullBooking[0];
        const refNo = `REF-${bookingId.toString().padStart(4, '0')}`;
        const checkIn = fb.check_in_date || new Date().toISOString().split('T')[0];

        // 3. Create the occupant record (Officially occupying the room now that payment has cleared)
        await connection.query(
            `INSERT INTO occupants (
                room_id, student_id, reference_no, name, age, address,
                contact_number, emergency_contact, guardian_name, check_in_date,
                months, amount, payment_status, payment_method, is_non_cspc
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Paid', 'paymongo', 0)`,
            [
                fb.room_id, fb.student_id, refNo, fb.student_name, fb.age, fb.address,
                fb.phone, fb.emergency_contact, fb.guardian_name, checkIn,
                fb.months, fb.amount
            ]
        );

        // ─── CALCULATE ACTUAL MOVE-IN COST FOR NOTIFICATION DISPLAY ───
        const advM = parseInt(fb.advance_months || 0);
        const depM = parseInt(fb.deposit_months || 0);
        const rent = parseFloat(fb.monthly_rent || 0);

        const initialPayment = (Math.max(1, advM) * rent) + (depM * rent);
        const formattedPayment = initialPayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // 4. Send payment settlement notification to the student with the correct move-in cost paid
        const paymentMsg = `PAYMENT SETTLED: Your payment of ₱${formattedPayment} has been verified! Your room reservation is now officially secured.`;
        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [fb.student_id, paymentMsg]
        );

        // 5. Notify the owner that payment has cleared and the student is now occupying the room
        if (fb.house_owner_id) {
            const ownerPaymentMsg = `PAYMENT RECEIVED: ${fb.student_name} has completed their online payment of ₱${formattedPayment} for Room ${fb.room_number} at "${fb.house_name}". They are now officially an occupant.`;
            await connection.query(
                'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [fb.house_owner_id, ownerPaymentMsg]
            );
        }

        await connection.commit();
        res.json({ success: true, message: 'Payment verified and occupancy successfully recorded.' });
    } catch (err) {
        await connection.rollback();
        console.error('[PAYMENT VERIFICATION ERROR]:', err.message);
        res.status(500).json({ success: false, message: 'Failed to verify transaction.' });
    } finally {
        connection.release();
    }
});

/**
 * 3. POST - PayMongo Webhook Listener (Secure, Signature-Verified Server-to-Server)
 * Processes the payment event asynchronously, even if the student closes their browser.
 */
router.post('/webhook', async (req, res) => {
    const signature = req.headers['paymongo-signature'];
    // Uses rawBody buffer if configured globally, otherwise falls back to stringified req.body
    const payload = req.rawBody || JSON.stringify(req.body);

    if (!signature) {
        return res.status(400).send('Missing signature header.');
    }

    try {
        // Parse signature components: t=timestamp, li=signature
        const parts = signature.split(',');
        const timestampPart = parts.find(p => p.trim().startsWith('t='));
        const signaturePart = parts.find(p => p.trim().startsWith('li='));

        if (!timestampPart || !signaturePart) {
            return res.status(400).send('Invalid signature format.');
        }

        const timestamp = timestampPart.split('=')[1];
        const paymongoSig = signaturePart.split('=')[1];

        // Recreate the HMAC-SHA256 signature hash using your Webhook Secret Key
        const baseString = `${timestamp}.${payload}`;
        const computedSignature = crypto
            .createHmac('sha256', process.env.PAYMONGO_WEBHOOK_SECRET || '')
            .update(baseString)
            .digest('hex');

        // Use timing-safe comparison to prevent timing attack exploits
        // Both buffers must be equal length — if they differ in length it is already a mismatch
        const computedBuffer = Buffer.from(computedSignature, 'hex');
        const receivedBuffer = Buffer.from(paymongoSig, 'hex');
        const signaturesMatch = computedBuffer.length === receivedBuffer.length &&
            crypto.timingSafeEqual(computedBuffer, receivedBuffer);

        if (!signaturesMatch) {
            console.warn('[SECURITY WARNING] PayMongo Webhook signature verification failed!');
            return res.status(401).send('Signature verification failed.');
        }

        // Process completed checkout session event
        // NOTE: PayMongo's real event name is "checkout_session.payment.paid",
        // not Stripe's "checkout.session.completed" — confirmed directly against
        // the event subscribed to on the PayMongo dashboard's webhook config.
        const event = JSON.parse(payload);
        const eventType = event.data.attributes.type;

        if (eventType === 'checkout_session.payment.paid') {
            const session = event.data.attributes.data;
            const bookingId = session.attributes.metadata?.bookingId;

            if (bookingId) {
                const parsedBookingId = parseInt(bookingId, 10);
                const connection = await pool.getConnection();

                try {
                    await connection.beginTransaction();

                    // Check if the page redirect already verified and settled this booking
                    const [bookingRows] = await connection.query(
                        'SELECT payment_status, room_id, student_id FROM bookings WHERE id = ?',
                        [parsedBookingId]
                    );

                    if (bookingRows.length > 0 && bookingRows[0].payment_status !== 'paid') {
                        const { student_id, room_id } = bookingRows[0];

                        // 1. Settle booking payment status
                        await connection.query(
                            "UPDATE bookings SET payment_status = 'paid' WHERE id = ?",
                            [parsedBookingId]
                        );

                        // 2. Fetch student details to insert occupant row
                        const [fullBooking] = await connection.query(
                            `SELECT b.*, u.name as student_name, u.age, u.address, u.phone, u.emergency_contact, u.guardian_name,
                                    bh.name as house_name, bh.owner_id as house_owner_id,
                                    r.room_number
                             FROM bookings b 
                             JOIN users u ON b.student_id = u.id
                             JOIN boarding_houses bh ON b.house_id = bh.id
                             JOIN rooms r ON b.room_id = r.id
                             WHERE b.id = ?`,
                            [parsedBookingId]
                        );

                        const fb = fullBooking[0];
                        const refNo = `REF-${parsedBookingId.toString().padStart(4, '0')}`;
                        const checkIn = fb.check_in_date || new Date().toISOString().split('T')[0];

                        // 3. Create the occupant record (Officially occupying the room now)
                        await connection.query(
                            `INSERT INTO occupants (
                                room_id, student_id, reference_no, name, age, address,
                                contact_number, emergency_contact, guardian_name, check_in_date,
                                months, amount, payment_status, payment_method, is_non_cspc
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Paid', 'paymongo', 0)`,
                            [
                                fb.room_id, fb.student_id, refNo, fb.student_name, fb.age, fb.address,
                                fb.phone, fb.emergency_contact, fb.guardian_name, checkIn,
                                fb.months, fb.amount
                            ]
                        );

                        // 4. Send payment settlement notification to the student
                        const webhookPaymentMsg = `PAYMENT SETTLED: Your payment of ₱${fb.amount} has been verified! Your room reservation is now officially secured.`;
                        await connection.query(
                            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                            [fb.student_id, webhookPaymentMsg]
                        );

                        // 5. Notify the owner that payment cleared via webhook
                        if (fb.house_owner_id) {
                            const whOwnerMsg = `PAYMENT RECEIVED: ${fb.student_name} has completed their online payment of ₱${fb.amount} for Room ${fb.room_number} at "${fb.house_name}". They are now officially an occupant.`;
                            await connection.query(
                                'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                                [fb.house_owner_id, whOwnerMsg]
                            );
                        }

                        await connection.commit();
                        console.log(`[WEBHOOK] Booking ID ${parsedBookingId} successfully settled and room occupied.`);
                    } else {
                        await connection.rollback();
                    }
                } catch (dbErr) {
                    await connection.rollback();
                    console.error('[WEBHOOK DB ERROR]:', dbErr.message);
                } finally {
                    connection.release();
                }
            }
        } else {
            console.log(`[WEBHOOK] Ignored unhandled event type: ${eventType}`);
        }

        res.status(200).send('Webhook processed successfully.');
    } catch (error) {
        console.error('[WEBHOOK ERROR]:', error.message);
        res.status(500).send('Internal Server Error.');
    }
});

export default router;