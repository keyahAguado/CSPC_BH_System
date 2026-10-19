const eventTitles={
 'RESERVATION SUBMITTED':'Request sent to the owner',
 'RESERVATION APPROVED':'Your reservation was approved',
 'RESERVATION CANCELLED':'Reservation cancelled',
 'RESERVATION EXPIRED':'Reservation expired',
 'REQUEST CLOSED':'Requested dates are no longer available',
 'BOOKED STAY STARTED':'Your booked stay has started',
 'ARRIVAL CONFIRMED':'The owner confirmed your arrival',
 'MARKED NOT ARRIVED':'The owner recorded that you have not arrived',
 'STAY CLOSED AS NOT ARRIVED':'Your stay was closed: did not arrive',
 'CASH NO-SHOW CANCELLED':'Stay closed because you did not arrive',
 'PAYMENT SETTLED':'Your payment was verified',
 'PAYMENT RECEIVED':'Payment received',
 'RESERVATION NOT SECURED':'Payment received, but your reservation was not secured',
 'EXTENSION APPROVED':'Your extension was approved',
 'EXTENSION UPDATE':'Update about your extension request',
 'RENEWAL DECISION REQUIRED':'Will you extend your stay or leave as scheduled?',
 'WAITING FOR RENEWAL DECISION':'Your request is waiting for a resident decision',
 'RENEWAL DECISION UPDATE':'Update about a resident decision',
 'RENEWAL DECISION RECORDED':'Your plan to leave was recorded',
 'RENEWAL EXTENSION REQUESTED':'Your extension request needs owner approval',
 'RENEWAL DECISION RESOLVED':'Update to your renewal decision',
 'RENEWAL REVIEW COMPLETE':'Your request is ready for owner review',
 'REPLACEMENT REQUEST UPDATE':'Update about a future room request',
 'REPLACEMENT REQUEST CLOSED':'A future room request was closed',
 'RENEWAL WAIT ENDED':'Your room request was closed',
 'FUTURE RESERVATION APPROVED':'A later reservation was approved for your room',
 'REPLACEMENT APPROVAL RECORDED':'A future reservation was approved',
 'REQUEST EXPIRED AFTER RENEWAL REVIEW':'Request expired - choose a later check-in',
 'CHECKOUT REMINDER':'Reminder about your planned checkout',
 'STAY NEEDS REVIEW':'Your stay needs the owner to take action'
};
// Requests that closed without a reservation: tell the student what to do next.
const CLOSED_REQUEST=/^(RENEWAL WAIT ENDED|REQUEST CLOSED|REQUEST EXPIRED AFTER RENEWAL REVIEW|RESERVATION EXPIRED)$/;
export function studentNotificationPresentation(value){
 const raw=String(value||'').replace(/\s+PHT\b/g,'').trim();
 const match=raw.match(/^([A-Z][A-Z ]{2,60}):\s*([\s\S]*)$/);
 const prefix=match?.[1],body=match?.[2]||raw;
 let title=eventTitles[prefix];
 if(prefix==='RESERVATION EXPIRED')title=/payment/i.test(body)?'Reservation expired - payment deadline missed':/owner.*respond/i.test(body)?'Request expired - no owner response':'Reservation expired';
 if(/CANCELLATION REQUESTED BY OWNER|Cancellation review opened/i.test(raw))title='Owner requested cancellation - payment arrangement needed';
 else if(/Cancellation review withdrawn/i.test(raw))title='Cancellation request withdrawn - reservation kept';
 else if(/Paid reservation cancelled|Paid no-show closed/i.test(raw))title='Cancellation confirmed - payment outcome recorded';
 if(!title)return null;
 return {title,body,category:/^PAYMENT|^RESERVATION NOT SECURED$/.test(prefix||'')?'payment':'booking',icon:/expired|closed|cancel/i.test(title)?'fa-circle-xmark':/payment/i.test(title)?'fa-credit-card':/checkout|extension|resident/i.test(title)?'fa-calendar-days':'fa-circle-info',guidance:CLOSED_REQUEST.test(prefix||'') ? 'Next step: choose another room or different dates. You can send a new request from the boarding house page; no payment is due for this closed request.' : 'This notification records an event at the time shown. Open booking details for the current status and next step.'};
}
