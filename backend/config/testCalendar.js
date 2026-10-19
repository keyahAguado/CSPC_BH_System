import { calendarDay, stayPeriod } from './stayAvailability.js';

// Booking events for the test calendar: the moments where the system or the owner must act.
// Only active (pending or confirmed) bookings produce events; an owner sees their own properties, an admin sees all.
const manilaDay = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const nextDay = day => new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);

export function bookingEvents(b) {
    const base = { bookingId: b.id, ref: 'REF-' + String(b.id).padStart(4, '0'), student: b.student_name, room: b.room_number, house: b.house_name, method: b.payment_method };
    const events = [];
    const at = (type, label, date) => { const d = new Date(date); if (Number.isFinite(d.getTime())) events.push({ ...base, type, label, at: d.toISOString(), day: manilaDay(d) }); };
    const on = (type, label, day) => { if (/^\d{4}-\d{2}-\d{2}$/.test(day)) events.push({ ...base, type, label, at: null, day }); };
    const checkIn = b.check_in_date ? calendarDay(b.check_in_date) : '';
    if (b.status==='pending' && Number(b.renewal_waiting) && b.renewal_wait_until) at('renewal_wait','Renewal decision due',b.renewal_wait_until);
    if (b.status==='confirmed' && ['pending','requested'].includes(b.renewal_response) && b.renewal_response_due_at) at('renewal_decision','Resident renewal decision / approval due',b.renewal_response_due_at);
    if (b.status === 'pending' && b.owner_response_due_at) at('owner_deadline', 'Owner response deadline', b.owner_response_due_at);
    if (b.status === 'confirmed' && b.payment_method === 'paymongo' && !b.paymongo_payment_id && b.payment_status !== 'paid' && b.payment_due_at) at('payment_deadline', 'Online payment deadline', b.payment_due_at);
    if (!b.move_in_confirmed_at) on('check_in', 'Check-in (stay starts)', checkIn);
    if (b.status === 'confirmed' && Number(b.arrival_required) === 1 && !b.arrival_confirmed_at && !b.occupant_check_out) on('move_in_review', 'Move-in review if arrival is unconfirmed', nextDay(checkIn));
    if (b.status === 'confirmed' && !b.occupant_check_out) { try { on('checkout_due', 'Booked checkout date', stayPeriod(b.check_in_date, b.months).end); } catch { /* invalid dates: no checkout event */ } }
    return events;
}

export async function bookingCalendarEvents(pool, { ownerId = null, from, to }) {
    const [rows] = await pool.query(`SELECT b.id, b.status, b.payment_method, b.payment_status, b.paymongo_payment_id, b.check_in_date, b.months,
            b.owner_response_due_at, b.payment_due_at, b.move_in_confirmed_at, b.renewal_waiting,b.renewal_wait_until,b.renewal_response,b.renewal_response_due_at, u.name AS student_name, r.room_number, bh.name AS house_name,
            o.check_out_date AS occupant_check_out, o.arrival_required, o.arrival_confirmed_at
        FROM bookings b JOIN users u ON u.id = b.student_id JOIN rooms r ON r.id = b.room_id JOIN boarding_houses bh ON bh.id = b.house_id
        LEFT JOIN occupants o ON o.reference_no = CONCAT('REF-', LPAD(b.id, GREATEST(4, CHAR_LENGTH(b.id)), '0'))
        WHERE b.status IN ('pending', 'confirmed')${ownerId ? ' AND bh.owner_id = ?' : ''} ORDER BY b.id`, ownerId ? [ownerId] : []);
    return rows.flatMap(bookingEvents).filter(e => e.day >= from && e.day <= to).sort((a, b) => a.day.localeCompare(b.day) || String(a.at || '').localeCompare(String(b.at || '')));
}
