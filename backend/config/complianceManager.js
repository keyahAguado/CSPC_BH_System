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
                if (!expiryDate) continue;

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
        const [expiringBookings] = await pool.query(`
            SELECT b.*, bh.name as house_name, bh.owner_id, u.name as student_name
            FROM bookings b
            JOIN boarding_houses bh ON b.house_id = bh.id
            JOIN users u ON b.student_id = u.id
            WHERE b.status = 'confirmed' 
            AND DATE_ADD(b.check_in_date, INTERVAL b.months MONTH) <= DATE_ADD(?, INTERVAL 7 DAY)
        `, [now]);

        for (const booking of expiringBookings) {
            const endDate = new Date(booking.check_in_date);
            endDate.setMonth(endDate.getMonth() + booking.months);

            const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

            let msg = "";
            if (daysLeft <= 0) {
                msg = `The stay for student ${booking.student_name} at "${booking.house_name}" has officially ENDED. Please process their checkout or extend their stay.`;
            } else {
                msg = `Reminder: The stay for ${booking.student_name} at "${booking.house_name}" will end in ${daysLeft} days.`;
            }

            await pool.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [booking.owner_id, msg]);
            await pool.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [booking.student_id, msg]);
        }

        console.log('[COMPLIANCE] Daily check completed.');
    } catch (err) {
        console.error('[COMPLIANCE] Check failed:', err);
    }
}