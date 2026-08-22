import pool from './db.js';

/**
 * Scans all boarding houses, updates their compliance status, 
 * and sends notifications for soon-to-expire or expired documents.
 */
export async function runComplianceCheck() {
    try {
        const [houses] = await pool.query("SELECT * FROM boarding_houses WHERE house_status != 'archived'");
        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(now.getDate() + 30);

        const permits = [
            { key: 'expiry_permit_business_form', label: 'Business Permit' },
            { key: 'expiry_permit_cedula', label: 'Cedula' },
            { key: 'expiry_permit_dti', label: 'DTI Registration' },
            { key: 'expiry_permit_barangay', label: 'Barangay Clearance' },
            { key: 'expiry_permit_building', label: 'Building Inspection' },
            { key: 'expiry_permit_zoning', label: 'Zoning/Locational Clearance' },
            { key: 'expiry_permit_sanitary', label: 'Sanitary/Health Clearance' },
            { key: 'expiry_permit_fire', label: 'Fire Safety Certificate' }
        ];

        for (const house of houses) {
            let newStatus = 'active';
            let expiringSoonList = [];
            let expiredList = [];

            for (const p of permits) {
                const expiryDate = house[p.key];
                if (!expiryDate) continue;  // no expiry date → skip this permit

                const date = new Date(expiryDate);
                if (date < now) {
                    expiredList.push(p.label);
                    newStatus = 'expired';
                } else if (date < thirtyDaysFromNow && newStatus !== 'expired') {
                    expiringSoonList.push(p.label);
                    newStatus = 'warning';
                }
            }

            // 1. Update Database Status if changed
            if (house.compliance_status !== newStatus) {
                // If expired, automatically archive the house
                if (newStatus === 'expired') {
                    await pool.query("UPDATE boarding_houses SET compliance_status = ?, house_status = 'archived' WHERE id = ?", [newStatus, house.id]);
                } else {
                    await pool.query('UPDATE boarding_houses SET compliance_status = ? WHERE id = ?', [newStatus, house.id]);
                }

                // 2. Notify Owner of change
                if (newStatus === 'expired') {
                    await pool.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [
                        house.owner_id,
                        `URGENT: Your boarding house "${house.name}" has been AUTOMATICALLY ARCHIVED because the following documents expired: ${expiredList.join(', ')}.`
                    ]);
                    // Also notify Admin
                    const [admins] = await pool.query("SELECT id FROM users WHERE role = 'admin'");
                    for (const admin of admins) {
                        await pool.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [
                            admin.id,
                            `SYSTEM: House "${house.name}" automatically archived due to document expiration (${expiredList.join(', ')}).`
                        ]);
                    }
                } else if (newStatus === 'warning') {
                    await pool.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [
                        house.owner_id,
                        `WARNING: The following documents for "${house.name}" are expiring soon (within 30 days): ${expiringSoonList.join(', ')}.`
                    ]);
                }
            }
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