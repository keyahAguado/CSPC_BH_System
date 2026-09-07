import pool from './db.js';

// Critical: required for the boarding house to legally operate. Expiry here
// drives compliance_status and can auto-archive the listing.
const criticalPermits = [
    { key: 'expiry_permit_business_form', label: 'Business Permit' },
    { key: 'expiry_permit_barangay', label: 'Barangay Business Clearance' },
    { key: 'expiry_permit_sanitary', label: 'Sanitary/Health Clearance' },
    { key: 'expiry_permit_fire', label: 'Fire Safety Certificate' }
];
// Supplementary: still required documents institutionally, but not load-bearing
// for operation. Expiry only flags the owner — never archives the listing.
const supplementaryPermits = [
    { key: 'expiry_permit_cedula', label: 'Cedula' },
    { key: 'expiry_permit_dti', label: 'DTI Registration' },
    { key: 'expiry_permit_building', label: 'Building Inspection' },
    { key: 'expiry_permit_zoning', label: 'Zoning/Locational Clearance' }
];

const classify = (house, permitList, now, thirtyDaysFromNow) => {
    let status = 'active';
    const expiringSoon = [];
    const expired = [];
    for (const p of permitList) {
        const expiryDate = house[p.key];
        if (!expiryDate) continue; // no expiry date → skip this permit
        const date = new Date(expiryDate);
        if (date < now) {
            expired.push(p.label);
            status = 'expired';
        } else if (date < thirtyDaysFromNow && status !== 'expired') {
            expiringSoon.push(p.label);
            status = 'warning';
        }
    }
    return { status, expiringSoon, expired };
};

/**
 * Evaluates ONE boarding house's compliance/supplementary status right now and
 * fires notifications on change, exactly like the sweep below does per-house.
 * Called both by the sweep (looping every house) and immediately after an owner
 * saves a document, so notifications don't have to wait for the next sweep.
 */
export async function evaluateHouseCompliance(houseId) {
    const [rows] = await pool.query('SELECT * FROM boarding_houses WHERE id = ? AND house_status != \'archived\'', [houseId]);
    if (rows.length === 0) return;
    const house = rows[0];

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    const critical = classify(house, criticalPermits, now, thirtyDaysFromNow);
    const supplementary = classify(house, supplementaryPermits, now, thirtyDaysFromNow);

    // 1. Critical documents drive compliance_status and auto-archiving
    if (house.compliance_status !== critical.status) {
        if (critical.status === 'expired') {
            await pool.query("UPDATE boarding_houses SET compliance_status = ?, house_status = 'archived' WHERE id = ?", [critical.status, house.id]);

            await pool.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [
                house.owner_id,
                `URGENT: Your boarding house "${house.name}" has been AUTOMATICALLY ARCHIVED because the following required documents expired: ${critical.expired.join(', ')}.`
            ]);
            const [admins] = await pool.query("SELECT id FROM users WHERE role = 'admin'");
            for (const admin of admins) {
                await pool.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [
                    admin.id,
                    `SYSTEM: House "${house.name}" automatically archived due to required document expiration (${critical.expired.join(', ')}).`
                ]);
            }
        } else {
            await pool.query('UPDATE boarding_houses SET compliance_status = ? WHERE id = ?', [critical.status, house.id]);
            if (critical.status === 'warning') {
                await pool.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [
                    house.owner_id,
                    `WARNING: The following required documents for "${house.name}" are expiring soon (within 30 days): ${critical.expiringSoon.join(', ')}.`
                ]);
            }
        }
    }

    // 2. Supplementary documents only flag the owner — never archive, never
    // notify admin, never affect public visibility.
    if (house.supplementary_status !== supplementary.status) {
        await pool.query('UPDATE boarding_houses SET supplementary_status = ? WHERE id = ?', [supplementary.status, house.id]);

        if (supplementary.status === 'expired') {
            await pool.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [
                house.owner_id,
                `ALERT: The following supplementary documents for "${house.name}" have expired: ${supplementary.expired.join(', ')}. Your listing remains active and bookable — please upload renewed copies when convenient.`
            ]);
        } else if (supplementary.status === 'warning') {
            await pool.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [
                house.owner_id,
                `WARNING: The following supplementary documents for "${house.name}" are expiring soon (within 30 days): ${supplementary.expiringSoon.join(', ')}. Please upload renewed copies before they expire.`
            ]);
        }
    }
}

/**
 * Scans all boarding houses, updates their compliance status,
 * and sends notifications for soon-to-expire or expired documents.
 */
export async function runComplianceCheck() {
    try {
        const [houses] = await pool.query("SELECT id FROM boarding_houses WHERE house_status != 'archived'");
        const now = new Date();

        for (const house of houses) {
            await evaluateHouseCompliance(house.id);
        }

        // --- BOOKING DURATION CHECK ---
        // Notifies owner and student exactly twice: at 7 days before end, and on the end date.
        // Uses DAY() comparison to fire only on the specific day, not every day for 7 days.
        const [expiringBookings] = await pool.query(`
            SELECT b.*, bh.name as house_name, bh.owner_id, u.name as student_name
            FROM bookings b
            JOIN boarding_houses bh ON b.house_id = bh.id
            JOIN users u ON b.student_id = u.id
            WHERE b.status = 'confirmed' 
            AND (
                DATE_ADD(b.check_in_date, INTERVAL b.months MONTH) = CURDATE()
                OR DATE_ADD(b.check_in_date, INTERVAL b.months MONTH) = DATE_ADD(CURDATE(), INTERVAL 7 DAY)
            )
        `, []);

        for (const booking of expiringBookings) {
            const endDate = new Date(booking.check_in_date);
            endDate.setMonth(endDate.getMonth() + booking.months);

            const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

            let ownerMsg, studentMsg;
            if (daysLeft <= 0) {
                ownerMsg = `STAY ENDED: The stay of ${booking.student_name} at "${booking.house_name}" has officially ended today. Please process their checkout.`;
                studentMsg = `STAY ENDED: Your stay at "${booking.house_name}" has ended today. Please coordinate with your landlord for checkout.`;
            } else {
                ownerMsg = `REMINDER: The stay of ${booking.student_name} at "${booking.house_name}" ends in ${daysLeft} days. Please prepare for checkout or a stay extension.`;
                studentMsg = `REMINDER: Your stay at "${booking.house_name}" ends in ${daysLeft} days. Contact your landlord if you wish to extend.`;
            }

            await pool.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [booking.owner_id, ownerMsg]);
            await pool.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [booking.student_id, studentMsg]);
        }

        console.log('[COMPLIANCE] Daily check completed.');
    } catch (err) {
        console.error('[COMPLIANCE] Check failed:', err);
    }
}