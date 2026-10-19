export function notificationContext(n){
 const text=String(n.message||'');
 const property=n.house_name || text.match(/(?:property|boarding house|at)\s+"([^"]+)"/i)?.[1] || (/extension/i.test(text)?text.match(/for\s+"([^"]+)"/i)?.[1]:null);
 const room=n.room_number || text.match(/\bRoom\s+([A-Za-z0-9_-]+)/i)?.[1];
 return {property:property || (/\ball (?:properties|boarding houses)\b|for all properties/i.test(text)?'All properties':''),room:room?'Room '+room:''};
}
// Leading "PREFIX:" of a stored message (letters, spaces and hyphens, e.g. CASH NO-SHOW CANCELLED).
export const notificationPrefix=message=>String(message||'').match(/^([A-Z][A-Z -]{2,60}):/)?.[1];
const titles={
 'NEW BOOKING REQUEST':'New reservation request','RESERVATION SUBMITTED':'Reservation submitted','RESERVATION APPROVED':'Reservation approved','RESERVATION EXPIRED':'Reservation expired','RESERVATION CANCELLED':'Reservation cancelled','RESERVATION UPDATE':'Reservation update','EXTENSION REQUEST':'Extension requested','EXTENSION APPROVED':'Extension approved','EXTENSION UPDATE':'Extension update','EXTENSION WITHDRAWN':'Extension request withdrawn','PAYMENT SETTLED':'Payment verified','PAYMENT RECEIVED':'Payment received','PAYMENT EXCEPTION':'Payment exception · reservation not secured','RESERVATION NOT SECURED':'Payment received · reservation not secured','BOOKED STAY STARTED':'Booked stay started','ARRIVAL CONFIRMED':'Arrival confirmed','MARKED NOT ARRIVED':'Recorded as not arrived','STAY CLOSED AS NOT ARRIVED':'Stay closed · did not arrive','CHECKOUT REMINDER':'Checkout reminder','CHECKOUT RECORDED':'Checkout recorded','STAY ENDED':'Stay ended','CASH NO-SHOW CANCELLED':'Cash no-show closed','STAY NEEDS REVIEW':'Stay needs attention','RENEWAL DECISION OPENED':'Resident decision needed','RENEWAL DECISION REQUIRED':'Renewal decision requested','WAITING FOR RENEWAL DECISION':'Waiting for resident decision','RENEWAL EXTENSION REQUESTED':'Extension needs approval','RENEWAL DECISION RECORDED':'Departure plan recorded','RENEWAL REVIEW COMPLETE':'Request ready for your review','RENEWAL DECISION RESOLVED':'Resident decision resolved','RENEWAL DECISION UPDATE':'Resident decision update','REPLACEMENT REQUEST CLOSED':'Future request closed','REPLACEMENT REQUEST UPDATE':'Future request update','REPLACEMENT APPROVAL RECORDED':'Future reservation approved','RENEWAL WAIT ENDED':'Waiting stage ended','FUTURE RESERVATION APPROVED':'Future reservation approved','REQUEST CLOSED':'Request closed','REQUEST EXPIRED AFTER RENEWAL REVIEW':'Request expired after renewal review','APPLICATION SUBMITTED':'Application submitted','APPLICATION UNDER REVIEW':'Application under review','REVISION REQUIRED':'Revision required'
};
export function notificationTitle(message,fallback='Notification'){
 const raw=String(message||'');const prefix=notificationPrefix(raw);
 if(/CANCELLATION REQUESTED BY OWNER|Cancellation review opened/i.test(raw))return 'Cancellation requested';
 if(/Cancellation review withdrawn/i.test(raw))return 'Cancellation request withdrawn';
 if(/Paid reservation cancelled|Paid no-show closed/i.test(raw))return 'Paid cancellation completed';
 // Older notices used PAYMENT RECEIVED for exceptions too ("Please review this reservation").
 if(prefix==='PAYMENT RECEIVED')return /review|exception/i.test(raw) ? 'Payment exception · reservation not secured' : 'Payment received';
 return titles[prefix] || fallback;
}

// How each event looks in the owner/admin inbox: a colour tone, an icon, and whether the notice asked the reader to
// do something. "action" describes the notice when it was sent; the linked page shows whether it is still open.
const TONES={
 'NEW BOOKING REQUEST':['info','fa-calendar-plus',true],'RESERVATION SUBMITTED':['info','fa-paper-plane'],
 'RESERVATION APPROVED':['success','fa-calendar-check'],'FUTURE RESERVATION APPROVED':['success','fa-calendar-check'],'REPLACEMENT APPROVAL RECORDED':['success','fa-calendar-check'],
 'RESERVATION CANCELLED':['danger','fa-calendar-xmark'],'RESERVATION EXPIRED':['danger','fa-hourglass-end'],'REQUEST CLOSED':['danger','fa-calendar-xmark'],'REQUEST EXPIRED AFTER RENEWAL REVIEW':['danger','fa-hourglass-end'],'REPLACEMENT REQUEST CLOSED':['danger','fa-calendar-xmark'],'RENEWAL WAIT ENDED':['neutral','fa-circle-stop'],
 'PAYMENT SETTLED':['success','fa-money-bill-wave'],'PAYMENT RECEIVED':['success','fa-money-bill-wave'],'PAYMENT EXCEPTION':['danger','fa-triangle-exclamation',true],'RESERVATION NOT SECURED':['danger','fa-triangle-exclamation',true],
 'BOOKED STAY STARTED':['info','fa-house-user',true],'ARRIVAL CONFIRMED':['success','fa-door-open'],'MARKED NOT ARRIVED':['warning','fa-user-slash'],'STAY CLOSED AS NOT ARRIVED':['neutral','fa-user-slash'],'CASH NO-SHOW CANCELLED':['neutral','fa-user-xmark'],
 'EXTENSION REQUEST':['extension','fa-calendar-plus',true],'RENEWAL EXTENSION REQUESTED':['extension','fa-calendar-plus',true],'EXTENSION APPROVED':['success','fa-calendar-check'],'EXTENSION UPDATE':['extension','fa-calendar-days'],'EXTENSION WITHDRAWN':['neutral','fa-calendar-minus'],
 'STAY NEEDS REVIEW':['danger','fa-circle-exclamation',true],'RENEWAL DECISION OPENED':['warning','fa-people-arrows',true],'RENEWAL REVIEW COMPLETE':['info','fa-clipboard-check',true],'RENEWAL DECISION RECORDED':['info','fa-person-walking-luggage'],'RENEWAL DECISION RESOLVED':['info','fa-people-arrows'],
 'CHECKOUT REMINDER':['warning','fa-calendar-day',true],'CHECKOUT RECORDED':['neutral','fa-arrow-right-from-bracket'],'STAY ENDED':['neutral','fa-arrow-right-from-bracket'],
 'APPLICATION SUBMITTED':['info','fa-file-signature'],'APPLICATION UNDER REVIEW':['info','fa-magnifying-glass'],'REVISION REQUIRED':['warning','fa-pen-to-square',true]
};
const TYPE_TONES={expiry:['warning','fa-triangle-exclamation',true],rejected:['danger','fa-circle-exclamation',true],issue:['danger','fa-circle-exclamation',true],approved:['success','fa-circle-check'],application:['info','fa-file-signature'],document_update:['info','fa-file-shield'],booking:['info','fa-calendar-check'],general:['info','fa-bell']};
export function notificationTone(message,type='general'){
 const [tone,icon,action=false]=TONES[notificationPrefix(message)] || TYPE_TONES[type] || TYPE_TONES.general;
 return {tone,icon,action};
}

// Philippine calendar day of a timestamp (YYYY-MM-DD), for date filters and day groups.
export const manilaDayOf=value=>{const date=new Date(value);return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(date) : '';};
const shiftDay=(day,days)=>{const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
// Date presets resolve to an inclusive [from, to] range of Manila days.
export function dateRange(preset,today,custom={}){
 if(preset==='today')return {from:today,to:today};
 if(preset==='7d')return {from:shiftDay(today,-6),to:today};
 if(preset==='30d')return {from:shiftDay(today,-29),to:today};
 if(preset==='custom')return {from:custom.from || '',to:custom.to || ''};
 return {from:'',to:''};
}
// Formal date for a Manila calendar day: Nov 4, 2026.
export const formalDay=day=>day ? new Date(day+'T00:00:00+08:00').toLocaleDateString('en-US',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric'}) : '';
export function dayHeading(day,today){
 if(!day)return 'Date unavailable';
 if(day===today)return 'Today';
 if(day===shiftDay(today,-1))return 'Yesterday';
 return new Date(day+'T00:00:00+08:00').toLocaleDateString('en-US',{timeZone:'Asia/Manila',weekday:'long',month:'short',day:'numeric',year:'numeric'});
}

export function newestNotifications(rows){return [...rows].sort((a,b)=>(Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0) || Number(b.id)-Number(a.id));}

export function notificationPreview(value,limit=180){
 const text=String(value||'').replace(/\s+/g,' ').trim();const letters=Array.from(text);if(letters.length<=limit)return text;
 let preview=letters.slice(0,limit).join('');const boundary=preview.lastIndexOf(' ');if(boundary>limit*.65)preview=preview.slice(0,boundary);return preview+'...';
}
