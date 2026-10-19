import { bookingNow } from './bookingClock.js';
// Calendar days, with checkout exclusive: a new stay may start on checkout day.
export const calendarDay = value => value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`
    : String(value || '').slice(0,10);
// Formal date for messages: "Nov 4, 2026" (the same format as the app's date displays).
export const formalDate = day => { const value=calendarDay(day); return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value+'T00:00:00+08:00').toLocaleDateString('en-US',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric'}) : value; };
export const manilaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Manila', year:'numeric', month:'2-digit', day:'2-digit' }).format(bookingNow());
export function stayPeriod(start, months) {
    const day = calendarDay(start);
    const count = Number(months);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(count) || count < 1) throw Object.assign(new Error('Choose a valid check-in date and duration.'), {status:400});
    const [y,m,d] = day.split('-').map(Number);
    const date = new Date(Date.UTC(y,m-1,d));
    if (date.toISOString().slice(0,10) !== day || y < 1000 || y*12+m-1+count > 9999*12+11) throw Object.assign(new Error('The stay dates are outside the supported range.'), {status:400});
    const end = new Date(Date.UTC(y,m-1+count,1));
    end.setUTCDate(Math.min(d,new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate()));
    return {start:day,end:end.toISOString().slice(0,10)};
}
// REF-0064 <-> booking 64 (same format as SQL CONCAT('REF-', LPAD(id, GREATEST(4,CHAR_LENGTH(id)), '0'))).
// Looking a booking up by its id uses the primary key; matching the CONCAT expression scans, and with
// FOR UPDATE locks, every booking row.
export const bookingReference = id => 'REF-'+String(id).padStart(4,'0');
export const bookingIdFromReference = reference => {
    const match=/^REF-(\d{1,15})$/.exec(String(reference || ''));
    const id=match ? Number(match[1]) : 0;
    return Number.isSafeInteger(id) && id>0 && bookingReference(id)===reference ? id : null;
};
export const overlaps = (a,b) => a.start < a.end && b.start < b.end && a.start < b.end && b.start < a.end;
export function recordPeriod(row, today = manilaToday()) {
    let period;
    try { period=stayPeriod(row.check_in_date,row.months); }
    catch { return {start:'1000-01-01',end:row.check_out_date ? calendarDay(row.check_out_date) : '9999-12-31'}; }
    // A recorded checkout overrides the projected end. An overdue unclosed stay
    // remains blocked until the owner records checkout/cancels the reservation.
    if (row.check_out_date) period.end=calendarDay(row.check_out_date);
    else if (period.end < today) period.end='9999-12-31';
    return period;
}
export function peakUsage(period, records) {
    const events=[];
    for (const row of records) {
        if (!overlaps(period,row.period)) continue;
        events.push([row.period.start < period.start ? period.start : row.period.start,1]);
        events.push([row.period.end > period.end ? period.end : row.period.end,-1]);
    }
    events.sort((a,b)=>a[0].localeCompare(b[0]) || a[1]-b[1]);
    let used=0,peak=0;
    for(const [,change] of events){used+=change;peak=Math.max(peak,used);}
    return peak;
}
export async function studentStayConflict(connection,studentId,period,{excludeBookingId=0,excludeReference='',lock=true,includePending=true,today=manilaToday()}={}) {
    const suffix=lock?' FOR UPDATE':'';
    const [occupants]=await connection.query('SELECT id, reference_no, check_in_date, check_out_date, months FROM occupants WHERE student_id = ?'+suffix,[studentId]);
    const [bookings]=await connection.query(`SELECT b.id, b.status, b.check_in_date, b.months FROM bookings b WHERE b.student_id = ? AND b.id != ? AND b.status IN ('pending','confirmed')
        AND NOT EXISTS (SELECT 1 FROM occupants o WHERE o.reference_no = CONCAT('REF-', LPAD(b.id, GREATEST(4,CHAR_LENGTH(b.id)), '0')))`+suffix,[studentId,excludeBookingId]);
    return occupants.some(o=>o.reference_no !== excludeReference && overlaps(period,recordPeriod(o,today))) || bookings.some(b=>(includePending || b.status === 'confirmed') && overlaps(period,recordPeriod(b,today)));
}
export async function roomStayUsage(connection,roomId,period,{excludeBookingId=0,excludeReference='',lock=true,today=manilaToday()}={}) {
    const suffix=lock?' FOR UPDATE':'';
    const [occupants]=await connection.query('SELECT id, reference_no, check_in_date, check_out_date, months FROM occupants WHERE room_id = ?'+suffix,[roomId]);
    const [bookings]=await connection.query(`SELECT b.id, b.check_in_date, b.months FROM bookings b WHERE b.room_id = ? AND b.id != ? AND b.status = 'confirmed' AND b.payment_review_required = 0
        AND NOT EXISTS (SELECT 1 FROM occupants o WHERE o.reference_no = CONCAT('REF-', LPAD(b.id, GREATEST(4,CHAR_LENGTH(b.id)), '0')))`+suffix,[roomId,excludeBookingId]);
    const records=[...occupants.filter(o=>o.reference_no !== excludeReference).map(o=>({period:recordPeriod(o,today)})),...bookings.map(b=>({period:recordPeriod(b,today)}))];
    return peakUsage(period,records);
}

// Two reads for the whole room list, rather than two reads per room.
export async function roomListAvailability(connection,rooms,period) {
    if (!rooms.length) return;
    const ids=rooms.map(room=>room.id);
    const [occupants]=await connection.query('SELECT room_id, check_in_date, check_out_date, months FROM occupants WHERE room_id IN (?)',[ids]);
    const [bookings]=await connection.query(`SELECT b.room_id, b.check_in_date, b.months FROM bookings b WHERE b.room_id IN (?) AND b.status = 'confirmed' AND b.payment_review_required = 0
        AND NOT EXISTS (SELECT 1 FROM occupants o WHERE o.reference_no = CONCAT('REF-', LPAD(b.id, GREATEST(4,CHAR_LENGTH(b.id)), '0')))`,[ids]);
    const groups=new Map(ids.map(id=>[String(id),[]]));
    for(const row of [...occupants,...bookings]) groups.get(String(row.room_id))?.push({period:recordPeriod(row)});
    for(const room of rooms) {
        room.available_count=Math.max(0,Number(room.capacity)-peakUsage(period,groups.get(String(room.id))));
        room.availability_start=period.start;
        room.availability_end=period.end;
    }
}

// Deadline policy (PHT). Owner: 24 hours after the request, but no later than 12:00 noon on the check-in day,
// which leaves the afternoon for online payment. Online payment: 24 hours after approval, but no later than the
// end of the check-in day. Each step needs at least 2 hours; otherwise these return null and the caller refuses.
export const MIN_OWNER_WINDOW_MS=2*3600000, MIN_PAYMENT_WINDOW_MS=2*3600000;
const deadline=(cap,now,minimum)=>{const due=Math.min(now.getTime()+86400000,cap);return Number.isFinite(due) && due-now.getTime()>=minimum ? new Date(due) : null;};
export function ownerResponseDeadline(checkInDate,now=bookingNow()) {
    return deadline(Date.parse(calendarDay(checkInDate)+'T12:00:00+08:00'),now,MIN_OWNER_WINDOW_MS);
}
export function onlinePaymentDeadline(checkInDate,now=bookingNow()) {
    return deadline(Date.parse(calendarDay(checkInDate)+'T00:00:00+08:00')+86400000,now,MIN_PAYMENT_WINDOW_MS);
}

// Pending requests never hold beds. After an approval, close pending requests for the room that can
// no longer fit, so those students can choose another room now instead of waiting for the 24-hour expiry.
// Each request is rechecked in its own transaction (student, booking, room lock order).
export async function rejectUnfittablePending(pool,roomId,{excludeBookingId=0,onRejected=async()=>{}}={}) {
    const [candidates]=await pool.query("SELECT id, student_id FROM bookings WHERE room_id = ? AND id != ? AND status = 'pending' ORDER BY id",[roomId,excludeBookingId]);
    let rejected=0,failed=0;
    for(const candidate of candidates){
        let c;
        try {
            c=await pool.getConnection();await c.beginTransaction();
            await c.query('SELECT id FROM users WHERE id = ? FOR UPDATE',[candidate.student_id]);
            const [rows]=await c.query('SELECT * FROM bookings WHERE id = ? FOR UPDATE',[candidate.id]);const b=rows[0];
            if(!b || b.status!=='pending' || Number(b.room_id)!==Number(roomId)){await c.rollback();continue;}
            const [rooms]=await c.query('SELECT id, capacity FROM rooms WHERE id = ? FOR UPDATE',[roomId]);
            if(!rooms.length || await roomStayUsage(c,roomId,stayPeriod(b.check_in_date,b.months))<Number(rooms[0].capacity)){await c.rollback();continue;}
            const reference='REF-'+String(b.id).padStart(4,'0');
            await c.query("UPDATE bookings SET status = 'rejected', expiry_reason = 'room_filled', expired_at = NOW() WHERE id = ?",[b.id]);
            await c.query('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',[b.student_id,`REQUEST CLOSED: ${reference}. Another reservation for this room was approved, and no bed is left for your dates. Please choose another room or different dates.`,'/student/bookings/'+b.id]);
            await onRejected(c,b);
            await c.commit();rejected++;
        } catch { if(c)await c.rollback(); failed++; }
        finally { c?.release(); }
    }
    return {rejected,failed};
}
