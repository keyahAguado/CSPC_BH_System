import { bookingNow } from './bookingClock.js';
import { notificationForRole } from './notificationAudience.js';
import { stayPeriod, calendarDay, formalDate } from './stayAvailability.js';

export function checkoutReminder(row, now=bookingNow()) {
    // A student recorded as not arrived has no departure to arrange; the owner closes that stay from Bookings.
    if (row.check_out_date || row.non_arrival_recorded_at) return null;
    let end;
    try { end=stayPeriod(row.check_in_date,row.months).end; } catch { return null; }
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    if(calendarDay(row.check_in_date)>today)return null;
    const days=Math.round((Date.parse(end)-Date.parse(today))/86400000);
    if(days>7)return null;
    const bucket=days<0?'overdue':days===0?'today':days===1?'tomorrow':days<=3?'within 3 days':'within 7 days';
    const identity=row.reference_no || `Manual occupant #${row.id}`;
    return {end,bucket,message:`CHECKOUT REMINDER: ${identity}, Room ${row.room_number}. Planned checkout: ${formalDate(end)} (${bucket}). Contact each other to arrange departure or request an extension; an extension requires owner approval and available dates. The owner must record actual checkout after departure. This reminder does not check anyone out or release a bed.`};
}

// Row lock plus transactional duplicate check also protects multiple backend instances.
export function createCheckoutReminderWorker({pool,now=()=>bookingNow(),logger=console}) {
    let running=false;
    return async()=>{
        if(running)return {skipped:true};
        running=true;let sent=0,failed=0;
        try {
            const [rows]=await pool.query('SELECT id FROM occupants WHERE check_out_date IS NULL');
            for(const row of rows){
                let c;
                try {
                    c=await pool.getConnection();await c.beginTransaction();
                    const [locked]=await c.query(`SELECT o.*,r.room_number,bh.owner_id FROM occupants o JOIN rooms r ON r.id=o.room_id JOIN boarding_houses bh ON bh.id=r.house_id WHERE o.id=? FOR UPDATE`,[row.id]);
                    const o=locked[0],reminder=o && checkoutReminder(o,now());
                    if(!reminder){await c.rollback();continue;}
                    const [bookings]=o.reference_no ? await c.query("SELECT id FROM bookings WHERE student_id=? AND CONCAT('REF-',LPAD(id,GREATEST(4,CHAR_LENGTH(id)),'0'))=?",[o.student_id,o.reference_no]) : [[]];
                    const recipients=[[o.owner_id,'/owner/rooms/details/'+o.room_id]];
                    if(o.student_id && bookings[0])recipients.push([o.student_id,'/student/bookings/'+bookings[0].id]);
                    let count=0;
                    for(const [user,link] of recipients){
                        const message=notificationForRole(reminder.message,link.startsWith('/owner/')?'owner':'student');
                        const [existing]=await c.query('SELECT id FROM notifications WHERE user_id=? AND message IN (?, ?) AND link=? LIMIT 1',[user,reminder.message,message,link]);
                        if(!existing.length){await c.query('INSERT INTO notifications (user_id,message,link) VALUES (?,?,?)',[user,message,link]);count++;}
                    }
                    await c.commit();sent+=count;
                }catch(error){if(c)await c.rollback();failed++;logger.error('[CHECKOUT REMINDER]',row.id,error.message);}finally{c?.release();}
            }
            return {sent,failed};
        }catch(error){logger.error('[CHECKOUT REMINDER]',error.message);return {sent,failed:failed+1};}finally{running=false;}
    };
}
