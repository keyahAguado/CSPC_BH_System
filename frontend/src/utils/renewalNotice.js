import {ownerDay,ownerStayEnd} from './ownerBookingDisplay.js';
export function renewalNoticeState(b,now=Date.now()){
 const waiting=b?.status==='pending' && !!Number(b.renewal_waiting);
 const active=b?.status==='confirmed' && !b.occupant_check_out;
 const sameCheckout=active && !!b.renewal_notice_checkout && ownerStayEnd(b)===ownerDay(b.renewal_notice_checkout);
 const open=!!(sameCheckout && ['pending','requested'].includes(b.renewal_response) && new Date(b.renewal_response_due_at).getTime()>now);
 const pendingExtension=!!(active && Number(b.is_extension_requested));
 const departure=!!(sameCheckout && b.renewal_response==='declined');
 return {waiting:!!waiting,open,pendingExtension,departure,visible:!!(waiting||open||pendingExtension||departure),checkout:ownerStayEnd(b||{})};
}
