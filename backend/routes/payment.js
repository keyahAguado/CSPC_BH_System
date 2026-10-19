import { bookingNow } from '../config/bookingClock.js';
import express from 'express';
import axios from 'axios';
import { paymentError, providerOptions, bookingProviderOptions, verifyWebhook, settlePayment, assertCheckoutContext } from '../config/paymentSettlement.js';
import { PAID_RESERVATION_POLICY } from '../config/paidCancellation.js';
import pool from '../config/db.js';
import { authenticateToken } from './auth.js';
import { requireOwnerPayments, openSecret, paymentMode } from '../config/ownerPayments.js';
import { directWebhookSecret, createDirectPaymentService, pauseDirectConnection } from '../config/ownerDirectPayments.js';

const router = express.Router();

router.get('/availability/:houseId', async (req, res) => {
    try { await requireOwnerPayments(pool, req.params.houseId); res.json({success:true, available:true}); }
    catch { res.json({success:true, available:false}); }
});

/**
 * 1. POST - Create PayMongo Checkout Session
 * Calculates the exact upfront Move-In Cost and requests a hosted payment URL from PayMongo
 */
router.post('/checkout', authenticateToken, async (req, res) => {
    let connection;
    try {
        if (req.user.role !== 'student') throw paymentError(403, 'Only students can start booking payments.');
        const { bookingId } = req.body;

        if (!Number.isSafeInteger(Number(bookingId)) || Number(bookingId) <= 0) {
            return res.status(400).json({ success: false, message: 'Booking ID is required.' });
        }
        // The student must accept the paid-reservation policy before a payable checkout opens.
        if (req.body.acceptPaidReservationPolicy !== true) {
            return res.status(400).json({ success: false, errorCode: 'paid_policy_not_accepted', message: 'Before paying, confirm that you understand this policy: ' + PAID_RESERVATION_POLICY });
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
        if (b.payment_due_at && new Date(b.payment_due_at).getTime() <= bookingNow().getTime()) throw paymentError(409, 'The payment deadline has passed. This reservation can no longer start or reopen checkout. Refresh My Bookings for its status.');
        // Serialize new checkout creation with owner connection changes.
        await connection.query('SELECT u.id FROM users u JOIN boarding_houses bh ON bh.owner_id = u.id WHERE bh.id = ? FOR UPDATE', [b.house_id]);
        // Existing sessions retain their original recipient, including historical platform sessions.
        let accountId = b.paymongo_account_id, directId = b.paymongo_direct_connection_id;
        if (!b.paymongo_session_id) {
            const recipient=await requireOwnerPayments(connection,b.house_id);
            directId=recipient.direct_connection_id||null;
            accountId=directId?null:recipient.account_id;
            if(directId) {
                try{await createDirectPaymentService().check(recipient);}catch(error){await connection.rollback();await pauseDirectConnection(pool,recipient,error.issue);throw error;}
            }
        }
        const contextBooking={...b,paymongo_account_id:accountId,paymongo_direct_connection_id:directId,paymongo_mode:b.paymongo_mode||paymentMode()};
        const options = await bookingProviderOptions(connection,contextBooking);
        if (b.paymongo_session_id) {
            const existing = (await axios.get('https://api.paymongo.com/v1/checkout_sessions/' + encodeURIComponent(b.paymongo_session_id), options)).data.data;
            assertCheckoutContext(existing, b);
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
            if (!accountId && !directId) throw paymentError(409, 'This older checkout has expired. Contact the owner before starting another online payment.');
            // Never restart a checkout after disconnect; existing active/paid sessions can still be verified.
            const currentRecipient = await requireOwnerPayments(connection,b.house_id);
            if (directId ? !currentRecipient.direct_connection_id : currentRecipient.account_id !== accountId) throw paymentError(409, 'The payment connection changed. Contact the owner before paying.');
        }

        const [recordedOccupants] = await connection.query('SELECT id FROM occupants WHERE reference_no = ? AND payment_method = ? FOR UPDATE', ['REF-' + String(b.id).padStart(4, '0'), 'paymongo']);
        if (recordedOccupants.length) throw paymentError(409, 'An online move-in payment is already recorded. Please contact the owner rather than paying again.');

        // Calculate the actual upfront move-in cost (advance + deposit) matching your exact database schema
        const advM = parseInt(b.advance_months || 0);
        const depM = parseInt(b.deposit_months || 0);
        const rent = parseFloat(b.monthly_rent || 0);

        // Charge the amount saved at approval; older approvals fall back to the current property terms.
        const initialPayment = b.upfront_amount != null ? Number(b.upfront_amount) : (Math.max(1, advM) * rent) + (depM * rent);

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
                        payment_method_types: ['qrph'],
                        success_url: `${frontendUrl}/student/bookings?payment_success=true&bookingId=${bookingId}`,
                        cancel_url: `${frontendUrl}/student/bookings`,
                        description: `Upfront Payment for Reservation at ${b.house_name}`,
                        send_email_receipt: true,
                        metadata: {
                            bookingId: bookingId.toString(),
                            ...(directId ? {paymentConnectionId:directId} : {})
                        }
                    }
                }
            },
            options
        );

        const session = paymongoResponse.data.data;
        const checkoutUrl = session?.attributes?.checkout_url;
        if (!session?.id || !checkoutUrl) throw paymentError(502, 'Invalid payment provider response.');
        assertCheckoutContext(session, {...contextBooking, paymongo_session_id:session.id});
        await connection.query('UPDATE bookings SET paymongo_session_id = ?, paymongo_account_id = ?, paymongo_mode = ?, paymongo_direct_connection_id = ? WHERE id = ?', [session.id, accountId, paymentMode(), directId||null, b.id]);
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
        const session = (await axios.get('https://api.paymongo.com/v1/checkout_sessions/' + encodeURIComponent(b.paymongo_session_id), await bookingProviderOptions(pool,b))).data.data;
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
        const [bookings] = await pool.query('SELECT paymongo_account_id,paymongo_direct_connection_id FROM bookings WHERE id = ?', [id]);
        if (!bookings.length || bookings[0].paymongo_account_id || bookings[0].paymongo_direct_connection_id) throw paymentError(409, 'Use the merchant payment webhook for this booking.');
        const session = (await axios.get('https://api.paymongo.com/v1/checkout_sessions/' + encodeURIComponent(resource.id), providerOptions())).data.data;
        await settlePayment(pool, id, session, undefined, true);
        res.status(200).send('Webhook processed successfully.');
    } catch (error) {
        console.error('[PAYMENT WEBHOOK ERROR]:', error.message);
        res.status(error.status || 500).send(error.status ? error.message : 'Payment processing failed.');
    }
});

router.post('/webhook/owner/:connectionId', async (req, res) => {
    try {
        if (!/^\d+$/.test(req.params.connectionId)) throw paymentError(400, 'Invalid connection.');
        const [rows] = await pool.query('SELECT * FROM owner_payment_connections WHERE id = ?', [req.params.connectionId]);
        const connection = rows[0];
        if (!connection?.webhook_secret || !connection.account_id) throw paymentError(404, 'Payment connection not found.');
        const event = verifyWebhook(req, openSecret(connection.webhook_secret), connection.mode);
        if (event.data.attributes.type !== 'checkout_session.payment.paid') return res.status(200).json({success:true});
        const resource = event.data.attributes.data;
        const id = Number(resource?.attributes?.metadata?.bookingId);
        if (!Number.isSafeInteger(id) || id <= 0 || !resource?.id) throw paymentError(400, 'Invalid booking payment event.');
        const [bookings] = await pool.query('SELECT * FROM bookings WHERE id = ?', [id]);
        const booking = bookings[0];
        if (!booking || booking.paymongo_account_id !== connection.account_id || booking.paymongo_mode !== connection.mode || booking.paymongo_session_id !== resource.id) throw paymentError(409, 'Payment recipient or checkout does not match.');
        const session = (await axios.get('https://api.paymongo.com/v1/checkout_sessions/' + encodeURIComponent(resource.id), providerOptions(connection.account_id, connection.mode))).data.data;
        await settlePayment(pool, id, session);
        res.status(200).json({success:true});
    } catch (error) {
        res.status(error.status || 500).json({success:false, message:error.status ? error.message : 'Payment processing failed.'});
    }
});

router.post('/webhook/direct/:connectionId',async(req,res)=>{
    try {
        if(!/^[0-9a-f-]{36}$/.test(req.params.connectionId))throw paymentError(400,'Invalid payment connection.');
        const [rows]=await pool.query('SELECT * FROM owner_direct_payment_connections WHERE id = ?',[req.params.connectionId]);
        const connection=rows[0];
        if(!connection?.webhook_secret)throw paymentError(404,'Payment connection not found.');
        // Retired/disconnected versions still receive confirmations for their existing checkouts.
        const event=verifyWebhook(req,directWebhookSecret(connection),connection.mode);
        if(event.data.attributes.type!=='checkout_session.payment.paid')return res.status(200).json({success:true});
        const resource=event.data.attributes.data,id=Number(resource?.attributes?.metadata?.bookingId);
        if(!Number.isSafeInteger(id)||id<=0||!resource?.id)throw paymentError(400,'Invalid booking payment event.');
        const [bookings]=await pool.query('SELECT * FROM bookings WHERE id = ?',[id]);const b=bookings[0];
        if(!b||b.paymongo_direct_connection_id!==connection.id||b.paymongo_mode!==connection.mode||b.paymongo_session_id!==resource.id)throw paymentError(409,'Payment connection or checkout does not match.');
        const session=(await axios.get('https://api.paymongo.com/v1/checkout_sessions/'+encodeURIComponent(resource.id),await bookingProviderOptions(pool,b))).data.data;
        await settlePayment(pool,id,session);res.json({success:true});
    }catch(error){res.status(error.status||500).json({success:false,message:error.status?error.message:'Payment confirmation could not be processed.'});}
});

export default router;
