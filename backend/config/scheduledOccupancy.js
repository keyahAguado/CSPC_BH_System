import { bookingNow } from './bookingClock.js';
import { calendarDay, formalDate, manilaToday, stayPeriod, studentStayConflict, roomStayUsage } from './stayAvailability.js';

// Caller holds the student and booking locks. Approval, payment settlement and
// the scheduler share this operation so scheduled starts cannot create duplicates.
export async function startBookedStay(connection,b,{today=manilaToday()}={}) {
    if (b.status!=='confirmed' || Number(b.move_in_required)!==1 || Number(b.payment_review_required) || b.move_in_confirmed_at) return {started:false};
    if (b.payment_method!=='cash' && !(b.payment_method==='paymongo' && b.payment_status==='paid' && b.paymongo_payment_id)) return {started:false};
    if (!b.check_in_date || calendarDay(b.check_in_date)>today) return {started:false};
    const reference='REF-'+String(b.id).padStart(4,'0');
    const [existing]=await connection.query('SELECT id FROM occupants WHERE reference_no = ? FOR UPDATE',[reference]);
    if (existing.length) return {started:false};
    const [details]=await connection.query(`SELECT b.*, u.name AS student_name, u.phone AS user_phone, u.age AS user_age,
        u.address AS user_address, u.emergency_contact AS user_emergency, u.guardian_name AS user_guardian,
        bh.owner_id FROM bookings b JOIN users u ON u.id = b.student_id JOIN boarding_houses bh ON bh.id = b.house_id WHERE b.id = ?`,[b.id]);
    if (!details.length) throw new Error('Scheduled booking details are unavailable.');
    const info={...details[0],...b};
    const block=async message=>{
        if (info.occupancy_start_issue!==message) {
            await connection.query('UPDATE bookings SET occupancy_start_issue = ? WHERE id = ?',[message,b.id]);
            await connection.query('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',[b.student_id,`STAY NEEDS REVIEW: ${reference}. Your scheduled stay could not start. Contact the owner; the booked dates have not changed.`,'/student/bookings/'+b.id]);
            if (info.owner_id) await connection.query('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',[info.owner_id,`STAY NEEDS REVIEW: ${reference}. ${message} The booked dates have not changed.`,'/owner/bookings']);
        }
        return {started:false,blocked:message};
    };
    let period;
    try { period=stayPeriod(b.check_in_date,b.months); }
    catch { return block('The booking needs valid stay dates before occupancy can start.'); }
    if (today>=period.end) return block('The booked checkout date has passed, so this stay was not started. Close an unpaid cash booking as a no-show. A paid reservation cannot be cancelled through the platform; settle it with the student outside the platform.');
    const [rooms]=await connection.query("SELECT r.id, r.capacity FROM rooms r JOIN boarding_houses bh ON bh.id = r.house_id WHERE r.id = ? AND r.deleted_at IS NULL AND bh.house_status = 'accredited' FOR UPDATE",[b.room_id]);
    if (!rooms.length) return block('The room is archived or the property is not accredited, so this stay cannot start. Restore the room, or contact the student about this reservation.');
    const [active]=await connection.query('SELECT id FROM occupants WHERE student_id = ? AND (check_out_date IS NULL OR check_out_date > CURDATE()) FOR UPDATE',[b.student_id]);
    if (active.length) return block('The student has a previous stay awaiting checkout. Record checkout before this stay starts.');
    const [occupied]=await connection.query('SELECT id FROM occupants WHERE room_id = ? AND (check_out_date IS NULL OR check_out_date > CURDATE()) FOR UPDATE',[b.room_id]);
    if (occupied.length>=Number(rooms[0].capacity)) return block('The room still has occupants awaiting checkout. Release a bed before this stay starts.');
    if (await studentStayConflict(connection,b.student_id,period,{excludeBookingId:b.id,today}) || await roomStayUsage(connection,b.room_id,period,{excludeBookingId:b.id,today})>=Number(rooms[0].capacity)) return block('The booked dates conflict with another stay or room commitment. Review the overlapping dates.');
    const paid=b.payment_method==='paymongo' || b.payment_status==='paid';
    await connection.query(`INSERT INTO occupants (room_id, student_id, reference_no, name, age, address, contact_number,
        emergency_contact, guardian_name, check_in_date, months, amount, payment_status, payment_method, upfront_status, is_non_cspc, arrival_required)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
    [b.room_id,b.student_id,reference,info.resident_name || info.student_name,info.age ?? info.user_age,info.address || info.user_address,info.contact_number || info.user_phone,
        info.emergency_contact || info.user_emergency,info.guardian_name || info.user_guardian,period.start,b.months,b.amount,paid?'Paid':'Not Paid',b.payment_method,paid?'Paid':'Unpaid']);
    // Retain this existing stage marker for compatibility. It now records the
    // scheduled transition, not an assertion of physical arrival or cash receipt.
    await connection.query('UPDATE bookings SET move_in_confirmed_at = NOW(), occupancy_auto_started = 1, occupancy_start_issue = NULL WHERE id = ?',[b.id]);
    const message=`BOOKED STAY STARTED: ${reference}. Your stay runs from ${formalDate(period.start)} to ${formalDate(period.end)} (checkout). The owner confirms your arrival when you move in. ${paid?'The upfront payment is recorded.':'Cash upfront payment is still unpaid; pay the owner at move-in.'}`;
    await connection.query('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',[b.student_id,message,'/student/bookings/'+b.id]);
    const ownerMessage=`BOOKED STAY STARTED: ${reference}. The booked stay of ${info.resident_name || info.student_name || 'the student'} started (${formalDate(period.start)} to ${formalDate(period.end)}, checkout). Confirm arrival when the student moves in. ${paid?'The upfront payment is already recorded.':'Cash upfront is not collected yet; record it when you receive it.'}`;
    if (info.owner_id) await connection.query('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',[info.owner_id,ownerMessage,'/owner/rooms/details/'+b.room_id]);
    return {started:true,start:period.start,end:period.end};
}

export function createScheduledOccupancyWorker({pool,logger=console,now=()=>bookingNow()}) {
    let running=false;
    return async()=>{
        if(running)return {skipped:true};
        running=true;let started=0,blocked=0;
        try {
            const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(now());
            const [candidates]=await pool.query(`SELECT b.id,b.student_id FROM bookings b WHERE b.status = 'confirmed' AND b.move_in_required = 1
                AND b.move_in_confirmed_at IS NULL AND b.check_in_date <= ? AND b.payment_review_required = 0
                AND (b.payment_method = 'cash' OR (b.payment_method = 'paymongo' AND b.payment_status = 'paid' AND b.paymongo_payment_id IS NOT NULL))
                AND NOT EXISTS (SELECT 1 FROM occupants o WHERE o.reference_no = CONCAT('REF-',LPAD(b.id,GREATEST(4,CHAR_LENGTH(b.id)),'0')))
                ORDER BY (b.occupancy_start_issue IS NOT NULL),b.check_in_date,b.id LIMIT 100`,[today]);
            for(const candidate of candidates){
                let connection;
                try {
                    connection=await pool.getConnection();await connection.beginTransaction();
                    await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE',[candidate.student_id]);
                    const [rows]=await connection.query('SELECT * FROM bookings WHERE id = ? FOR UPDATE',[candidate.id]);
                    const result=rows.length ? await startBookedStay(connection,rows[0],{today}) : {};
                    await connection.commit();
                    if(result.started)started++;if(result.blocked)blocked++;
                } catch(error){if(connection)await connection.rollback();logger.error('[SCHEDULED OCCUPANCY]',candidate.id,error.message);}
                finally{connection?.release();}
            }
            return {started,blocked};
        }catch(error){logger.error('[SCHEDULED OCCUPANCY]',error.message);return {started,blocked,failed:true};}
        finally{running=false;}
    };
}
