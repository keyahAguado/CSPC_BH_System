import {bookingNow} from './bookingClock.js';
import {notificationForRole} from './notificationAudience.js';
import {calendarDay,manilaToday,stayPeriod,roomStayUsage,ownerResponseDeadline} from './stayAvailability.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export const renewalDate=value=>new Date(calendarDay(value)+'T00:00:00+08:00').toLocaleDateString('en-US',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric'});
const ref=id=>'REF-'+String(id).padStart(4,'0');
export const renewalTime=value=>new Date(value).toLocaleString('en-US',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true});
const ids=b=>{try{const v=JSON.parse(b.renewal_sources || '[]');return Array.isArray(v)?v.filter(Number.isSafeInteger):[];}catch{return [];}};
const notify=(c,user,message,link)=>c.query('INSERT INTO notifications (user_id,message,link) VALUES (?,?,?)',[user,notificationForRole(message,link.startsWith('/owner/')?'owner':'student'),link]);
const end=b=>stayPeriod(b.check_in_date,b.months).end;
const live=b=>b.status==='confirmed' && !b.actual_checkout;
const pendingOffer=b=>['pending','requested'].includes(b.renewal_response);
export function renewalWindow(checkIn,now=bookingNow()){
 const cap=Date.parse(calendarDay(checkIn)+'T12:00:00+08:00')-2*3600000;
 const due=Math.min(now.getTime()+86400000,cap);
 return due-now.getTime()>=2*3600000 ? new Date(due) : null;
}
export function renewalStillPending(b,now=bookingNow()){
 return live(b) && pendingOffer(b) && b.renewal_notice_checkout && end(b)===calendarDay(b.renewal_notice_checkout) && new Date(b.renewal_response_due_at).getTime()>now.getTime();
}
// Called by submission while its room is locked. No speculative bed is sold: B remains pending.
export async function openRenewalWait(c,b,{ownerId,capacity,roomNumber,now=bookingNow()}={}){
 const period=stayPeriod(b.check_in_date,b.months),today=manilaToday();
 const [residents]=await c.query(`SELECT b.*,o.check_out_date AS actual_checkout FROM bookings b JOIN occupants o ON o.reference_no=CONCAT('REF-',LPAD(b.id,GREATEST(4,CHAR_LENGTH(b.id)),'0')) WHERE b.room_id=? AND b.status='confirmed' AND o.check_out_date IS NULL AND (COALESCE(o.arrival_required,0)<>1 OR o.arrival_confirmed_at IS NOT NULL)`,[b.room_id]);
 const departures=[...new Map(residents.map(r=>[Number(r.id),r])).values()].filter(r=>{try{return end(r)>=today && end(r)<=period.start;}catch{return false;}});
 if(!departures.length)return {waiting:false};
 const used=await roomStayUsage(c,b.room_id,period,{excludeBookingId:b.id,lock:false});
 const candidates=departures.filter(r=>!r.renewal_notice_checkout || calendarDay(r.renewal_notice_checkout)!==end(r) || renewalStillPending(r,now));
 if(!candidates.length){if(used+departures.length>=Number(capacity))await c.query('UPDATE bookings SET renewal_sources=? WHERE id=?',[JSON.stringify(departures.map(r=>Number(r.id))),b.id]);return {waiting:false};}
 if(used+candidates.length<Number(capacity)){if(used+departures.length>=Number(capacity))await c.query('UPDATE bookings SET renewal_sources=? WHERE id=?',[JSON.stringify(departures.map(r=>Number(r.id))),b.id]);return {waiting:false};}
 const window=renewalWindow(b.check_in_date,now);
 if(!window)throw fail(409,'This future opening needs a resident renewal decision, but there is not enough time for renewal and owner review before check-in. Choose a later check-in date.');
 if(candidates.some(r=>r.renewal_notice_checkout && calendarDay(r.renewal_notice_checkout)===end(r) && new Date(r.renewal_response_due_at).getTime()>Date.parse(calendarDay(b.check_in_date)+'T12:00:00+08:00')-2*3600000))throw fail(409,'An existing renewal decision cannot finish before this check-in cutoff. Choose a later date.');
 let latest=now.getTime();const sources=[];
 for(const r of candidates){
  const finish=end(r),same=r.renewal_notice_checkout && calendarDay(r.renewal_notice_checkout)===finish;
  // The first competing request sets this checkout's deadline. Later requests never reset it.
  if(!same){r.renewal_response=Number(r.is_extension_requested)?'requested':'pending';r.renewal_response_due_at=window;r.renewal_notice_checkout=finish;
   await c.query('UPDATE bookings SET renewal_notice_checkout=?,renewal_response_due_at=?,renewal_response=? WHERE id=?',[finish,window,r.renewal_response,r.id]);
   await notify(c,r.student_id,`RENEWAL DECISION REQUIRED: ${ref(r.id)}, Room ${roomNumber}. Your booked checkout is ${renewalDate(finish)}. A future request depends on capacity becoming free. By ${renewalTime(window)}, request an extension or confirm leaving from your booking details. An extension needs owner approval before that deadline; a request alone does not extend your stay. If no extension is approved by the deadline, renewal priority ends and another request may be approved. Your existing stay and checkout are unchanged.`,'/student/bookings/'+r.id);
   await notify(c,ownerId,`RENEWAL DECISION OPENED: ${ref(r.id)}, Room ${roomNumber}, checkout ${renewalDate(finish)}. Decision/extension approval due ${renewalTime(window)}. Contact the resident or review an extension. Incoming requests remain unapproved and must not pay; recorded checkout is still required.`,'/owner/bookings');
  }
  latest=Math.max(latest,new Date(r.renewal_response_due_at).getTime());sources.push(Number(r.id));
 }
 await c.query('UPDATE bookings SET renewal_waiting=1,renewal_sources=?,renewal_wait_until=?,owner_response_due_at=NULL WHERE id=?',[JSON.stringify(sources),new Date(latest),b.id]);
 const text=`WAITING FOR RENEWAL DECISION: ${ref(b.id)}, Room ${roomNumber}, requested ${renewalDate(period.start)} to ${renewalDate(period.end)} (checkout). The future opening depends on an existing resident's renewal decision, due by ${renewalTime(latest)}. Your request is not approved and no bed is guaranteed. Do not pay. The owner-response timer is paused during this stage. Once resolved, you will receive a new owner-response deadline or an explanation if these dates are unavailable. You can cancel this unpaid request from My Bookings.`;
 await notify(c,b.student_id,text,'/student/bookings/'+b.id);
 await notify(c,ownerId,text,'/owner/bookings');
 return {waiting:true,deadline:new Date(latest)};
}
export async function notifyRenewalIncomingClosed(c,b,ownerId,reason){
 const sourceIds=ids(b);
 if(!Number(b.renewal_waiting) && !sourceIds.length)return;if(sourceIds.length){const [residents]=await c.query("SELECT id,student_id FROM bookings WHERE id IN (?) AND status='confirmed'",[sourceIds]);for(const r of residents)await notify(c,r.student_id,`REPLACEMENT REQUEST CLOSED: For ${ref(r.id)}, a future request linked to your renewal decision was ${reason}. Your existing stay, booked checkout and any extension request are unchanged. No checkout or extension was recorded by this notice. If you still need an extension, request it; owner approval depends on available capacity.`,'/student/bookings/'+r.id);}
 const text=`RENEWAL WAIT ENDED: ${ref(b.id)} was ${reason}. Your request is closed: no bed was reserved for these dates and no payment is due. Please choose another room or different dates; you can send a new request from the boarding house page.`;
 await notify(c,b.student_id,text,'/student/bookings/'+b.id);await notify(c,ownerId,`RENEWAL WAIT ENDED: ${ref(b.id)} was ${reason}. This incoming request is no longer active and needs no action. Existing residents and their stays are unchanged. The student was notified.`,'/owner/bookings');
}
export async function notifyRenewalIncomingApproved(c,b,ownerId){
 const sourceIds=ids(b);if(!sourceIds.length)return;
 const [residents]=await c.query("SELECT id,student_id FROM bookings WHERE id IN (?) AND status='confirmed'",[sourceIds]);
 for(const r of residents)await notify(c,r.student_id,`FUTURE RESERVATION APPROVED: For ${ref(r.id)}, a later reservation now holds capacity from ${renewalDate(b.check_in_date)} to ${renewalDate(end(b))} in this room. Your current stay and checkout are unchanged. Any later extension must fit around approved reservations; it cannot displace this commitment. Contact the owner about alternatives.`,'/student/bookings/'+r.id);
 await notify(c,ownerId,`REPLACEMENT APPROVAL RECORDED: ${ref(b.id)}, ${renewalDate(b.check_in_date)} to ${renewalDate(end(b))}. Capacity is reserved for these dates. Affected current residents were notified; their booked checkout remains unchanged.`,'/owner/bookings');
}
export async function rejectRenewalIncoming(pool,ownerId,bookingId){let c;try{c=await pool.getConnection();await c.beginTransaction();
 const [owned]=await c.query('SELECT b.student_id FROM bookings b JOIN boarding_houses bh ON bh.id=b.house_id WHERE b.id=? AND bh.owner_id=?',[bookingId,ownerId]);if(!owned.length)throw fail(404,'Request not found.');
 await c.query('SELECT id FROM users WHERE id=? FOR UPDATE',[owned[0].student_id]);const [rows]=await c.query('SELECT * FROM bookings WHERE id=? FOR UPDATE',[bookingId]);const b=rows[0];if(!b || b.status!=='pending' || !Number(b.renewal_waiting))throw fail(409,'This request changed. Refresh before rejecting.');
 await c.query('SELECT id FROM rooms WHERE id=? FOR UPDATE',[b.room_id]);await c.query("UPDATE bookings SET status='rejected',renewal_waiting=0 WHERE id=?",[b.id]);await notifyRenewalIncomingClosed(c,b,ownerId,'rejected by the owner');await c.commit();return {success:true,message:'Request rejected. The incoming student, affected residents, and owner were notified.'};
 }catch(e){if(c)await c.rollback();throw e;}finally{c?.release();}}
async function related(c,r,message){
 message=message.replace('Your booked checkout','The existing resident’s booked checkout');
 const [waiting]=await c.query("SELECT id,student_id,renewal_sources,check_in_date,months FROM bookings WHERE room_id=? AND status='pending' AND renewal_waiting=1",[r.room_id]);
 for(const b of waiting.filter(b=>ids(b).includes(Number(r.id))))await notify(c,b.student_id,`RENEWAL DECISION UPDATE: ${ref(b.id)}, requested ${renewalDate(b.check_in_date)} to ${renewalDate(end(b))}. ${message} Your request is not approved; do not pay. We will notify you when owner review can proceed or the dates become unavailable.`,'/student/bookings/'+b.id);
}
export async function recordRenewalChoice(pool,studentId,bookingId,choice){
 if(choice!=='leave')throw fail(400,'Choose confirm leaving, or use Request extension to specify the extension duration.');
 let c;try{c=await pool.getConnection();await c.beginTransaction();await c.query('SELECT id FROM users WHERE id=? FOR UPDATE',[studentId]);
 const [rows]=await c.query('SELECT b.*,bh.owner_id FROM bookings b JOIN boarding_houses bh ON bh.id=b.house_id WHERE b.id=? AND b.student_id=? FOR UPDATE',[bookingId,studentId]);const b=rows[0];
 if(!b)throw fail(404,'Booking not found.');
 if(!renewalStillPending(b))throw fail(409,'This renewal priority window is no longer open. Refresh your booking.');
 if(Number(b.is_extension_requested))throw fail(409,'Withdraw your pending extension request before confirming you will leave.');
 await c.query('SELECT id FROM rooms WHERE id=? FOR UPDATE',[b.room_id]);
 await c.query("UPDATE bookings SET renewal_response='declined' WHERE id=?",[b.id]);
 const text=`RENEWAL DECISION RECORDED: ${ref(b.id)}. You confirmed leaving on ${renewalDate(end(b))}. Your current stay is not cancelled and has not been checked out. The owner can now review replacement requests; later extensions depend on remaining capacity. Contact the owner to arrange actual checkout.`;
 await notify(c,studentId,text,'/student/bookings/'+b.id);await notify(c,b.owner_id,text.replace('You confirmed','The resident confirmed'),'/owner/bookings');
 await related(c,b,'The renewal decision was received. The owner will recheck availability.');await c.commit();return {success:true,message:'Departure intention recorded. Actual checkout is still required; related students and the owner were notified.'};
 }catch(e){if(c)await c.rollback();throw e;}finally{c?.release();}
}
export async function renewalExtensionRequested(c,b){
 if(!renewalStillPending(b))return;
 await c.query("UPDATE bookings SET renewal_response='requested' WHERE id=?",[b.id]);
 const text=`RENEWAL EXTENSION REQUESTED: ${ref(b.id)}. The extension still needs owner approval by ${renewalTime(b.renewal_response_due_at)} to retain renewal priority. Current checkout remains ${renewalDate(end(b))} until approval. Other approved reservations cannot be displaced.`;
 await notify(c,b.student_id,text,'/student/bookings/'+b.id);await notify(c,b.owner_id,text,'/owner/bookings');await related(c,b,'An existing resident requested an extension. Owner approval is pending.');
}
// Offer transitions are committed separately before incoming requests are processed, preserving lock order.
export function createRenewalWorker({pool,logger=console}){
 let running=false;
 return async()=>{if(running)return {skipped:true};running=true;let released=0,closed=0;try{
  const [offers]=await pool.query("SELECT id,student_id FROM bookings WHERE renewal_response IN ('pending','requested') ORDER BY renewal_response_due_at,id LIMIT 100");
  for(const offer of offers){let c;try{
   c=await pool.getConnection();await c.beginTransaction();
   await c.query('SELECT id FROM users WHERE id=? FOR UPDATE',[offer.student_id]);
   const [rows]=await c.query("SELECT b.*,bh.owner_id,o.check_out_date AS actual_checkout FROM bookings b JOIN boarding_houses bh ON bh.id=b.house_id LEFT JOIN occupants o ON o.reference_no=CONCAT('REF-',LPAD(b.id,GREATEST(4,CHAR_LENGTH(b.id)),'0')) WHERE b.id=? FOR UPDATE",[offer.id]);
   const r=rows[0];if(!r || !pendingOffer(r)){await c.rollback();continue;}
   await c.query('SELECT id FROM rooms WHERE id=? FOR UPDATE',[r.room_id]);
   let state=null,explanation='';
   if(!live(r)){state='released';explanation='The original stay has closed.';}
   else if(end(r)!==calendarDay(r.renewal_notice_checkout)){state='extended';explanation='The owner approved changed stay dates. New checkout: '+end(r)+'.';}
   else if(new Date(r.renewal_response_due_at).getTime()<=bookingNow().getTime()){state='expired';explanation='The renewal decision window ended without an approved extension. Later extension requests depend on remaining capacity.';}
   else if(r.renewal_response==='requested' && !Number(r.is_extension_requested)){state='released';explanation='The extension request is no longer pending. Your booked checkout remains '+end(r)+'.';}
   if(!state){await c.rollback();continue;}
   await c.query('UPDATE bookings SET renewal_response=? WHERE id=?',[state,r.id]);
   const text=`RENEWAL DECISION RESOLVED: ${ref(r.id)}. ${explanation} Incoming requests will be rechecked. This notice does not record physical checkout or cancel another approved reservation.`;
   await notify(c,r.student_id,text,'/student/bookings/'+r.id);await notify(c,r.owner_id,text,'/owner/bookings');await related(c,r,explanation);await c.commit();
  }catch(e){if(c)await c.rollback();logger.error('[RENEWAL OFFER]',offer.id,e.message);}finally{c?.release();}}
  const [waiting]=await pool.query("SELECT id,student_id FROM bookings WHERE status='pending' AND renewal_waiting=1 ORDER BY renewal_wait_until,id LIMIT 100");
  for(const incoming of waiting){let c;try{c=await pool.getConnection();await c.beginTransaction();await c.query('SELECT id FROM users WHERE id=? FOR UPDATE',[incoming.student_id]);const [rows]=await c.query('SELECT b.*,bh.owner_id FROM bookings b JOIN boarding_houses bh ON bh.id=b.house_id WHERE b.id=? FOR UPDATE',[incoming.id]);const b=rows[0];if(!b || b.status!=='pending' || !Number(b.renewal_waiting)){await c.rollback();continue;}
   const [rooms]=await c.query('SELECT id,capacity,room_number FROM rooms WHERE id=? AND deleted_at IS NULL FOR UPDATE',[b.room_id]);
   const period=stayPeriod(b.check_in_date,b.months),sources=ids(b);
   const [residents]=sources.length?await c.query("SELECT b.*,o.check_out_date AS actual_checkout FROM bookings b LEFT JOIN occupants o ON o.reference_no=CONCAT('REF-',LPAD(b.id,GREATEST(4,CHAR_LENGTH(b.id)),'0')) WHERE b.id IN (?)",[sources]):[[]];
   const used=rooms.length?await roomStayUsage(c,b.room_id,period,{excludeBookingId:b.id,lock:false}):Infinity;
   const unresolved=residents.filter(r=>renewalStillPending(r));
   if(rooms.length && used<Number(rooms[0].capacity) && unresolved.length && used+unresolved.length>=Number(rooms[0].capacity)){await c.rollback();continue;}
   const due=ownerResponseDeadline(b.check_in_date,bookingNow());
   let text,ownerText;
   if(!rooms.length || used>=Number(rooms[0].capacity)){
    await c.query("UPDATE bookings SET status='rejected',expiry_reason='renewal_unavailable',expired_at=NOW(),renewal_waiting=0 WHERE id=?",[b.id]);
    text=`REQUEST CLOSED: ${ref(b.id)}, requested ${renewalDate(period.start)} to ${renewalDate(period.end)}. Renewal/capacity review is complete and no bed is available throughout these dates. Your request was not approved and no payment is due. Choose another room or date. Existing approved reservations are unchanged.`;
    ownerText=`REQUEST CLOSED: ${ref(b.id)}, requested ${renewalDate(period.start)} to ${renewalDate(period.end)}. After the renewal review, no bed is free for the whole stay, so the request closed automatically. No action is needed; the student was notified.`;
   }else if(!due){await c.query("UPDATE bookings SET status='cancelled',expiry_reason='renewal_window_expired',expired_at=NOW(),renewal_waiting=0 WHERE id=?",[b.id]);closed++;
    text=`REQUEST EXPIRED AFTER RENEWAL REVIEW: ${ref(b.id)}, requested ${renewalDate(period.start)} to ${renewalDate(period.end)}. There is not enough time for owner review before the check-in cutoff. Your request was not approved, no bed was guaranteed, and no payment is due. Submit a new request with a later check-in date.`;
    ownerText=`REQUEST EXPIRED AFTER RENEWAL REVIEW: ${ref(b.id)}, requested ${renewalDate(period.start)} to ${renewalDate(period.end)}. Not enough time was left for your review before the check-in cutoff, so the request expired. No action is needed; the student was notified.`;
   }else{await c.query('UPDATE bookings SET renewal_waiting=0,owner_response_due_at=? WHERE id=?',[due,b.id]);
    text=`RENEWAL REVIEW COMPLETE: ${ref(b.id)}, requested ${renewalDate(period.start)} to ${renewalDate(period.end)}. Your request is now awaiting owner approval. Owner response due ${renewalTime(due)}. It is not approved and no bed is guaranteed; do not pay. Approval will recheck availability. Cash is due at arrival after approval; online payment starts only after approval.`;
    ownerText=`RENEWAL REVIEW COMPLETE: ${ref(b.id)}, requested ${renewalDate(period.start)} to ${renewalDate(period.end)}. The renewal decision is settled and this request is ready for your review. Approve or reject it by ${renewalTime(due)}; approval rechecks availability.`;
   }
   await notify(c,b.student_id,text,'/student/bookings/'+b.id);await notify(c,b.owner_id,ownerText,'/owner/bookings');
   for(const r of residents)await notify(c,r.student_id,`REPLACEMENT REQUEST UPDATE: Your renewal decision for ${ref(r.id)} was applied to a future request. ${due && rooms.length && used<Number(rooms[0].capacity)?'The owner may now review that request; no replacement booking has been approved by this notice.':'That request was closed.'} Your existing stay and checkout remain unchanged. Any later extension must fit around approved reservations.`,'/student/bookings/'+r.id);
   await c.commit();
   if(due && rooms.length && used<Number(rooms[0].capacity))released++;else closed++;
  }catch(e){if(c)await c.rollback();logger.error('[RENEWAL WAIT]',incoming.id,e.message);}finally{c?.release();}}
  return {released,closed};
 }catch(e){logger.error('[RENEWAL WORKER]',e.message);return {released,closed,failed:true};}finally{running=false;}};
}
