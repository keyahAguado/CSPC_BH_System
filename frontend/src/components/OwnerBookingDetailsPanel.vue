<script setup>
import UserAvatar from "./UserAvatar.vue";
import RenewalDecisionNotice from './RenewalDecisionNotice.vue';
import { computed, ref, nextTick, useId } from 'vue';
import CancellationReviewSummary from './CancellationReviewSummary.vue';
import FutureReservationActions from './FutureReservationActions.vue';
import BookingFlowNotice from './BookingFlowNotice.vue';
import BookingArrivalActions from './BookingArrivalActions.vue';
import ReservationDeadline from './ReservationDeadline.vue';
import '../styles/owner-badges.css';
import { ownerBookingReference, ownerBookingStage, ownerUpfrontPayment, ownerDate, ownerTimestamp, ownerStayEnd, ownerMoney, ownerMonthlyRent, ownerBookingActivity } from '../utils/ownerBookingDisplay.js';
const props=defineProps({booking:{type:Object,required:true},busy:Boolean,initialTab:{type:String,default:'details'}});
const emit=defineEmits(['close','approve','reject','approve-extension','reject-extension','mark-paid','changed','notice']);
const tab=ref(props.initialTab), uid=useId();
const moveTab=async(event)=>{const list=event.currentTarget.parentElement;tab.value=tab.value==='details' ? 'activity' : 'details';await nextTick();list?.querySelector('[aria-selected="true"]')?.focus();};
const stage=computed(()=>ownerBookingStage(props.booking));
const payment=computed(()=>ownerUpfrontPayment(props.booking));
const activity=computed(()=>ownerBookingActivity(props.booking));
const initials=computed(()=>String(props.booking.student_name || '?').split(/\s+/).map(word=>word[0]).slice(0,2).join(''));
const hasExtension=computed(()=>props.booking.status==='confirmed' && Number(props.booking.is_extension_requested)===1);
const terminal=computed(()=>['completed','not_arrived','cancelled','rejected'].includes(props.booking.status));
const online=computed(()=>props.booking.payment_method==='paymongo');
const terminalNote=computed(()=>({completed:['Completed booking.','Checkout is recorded; no further booking actions are available.'],cancelled:['Cancelled booking.','No move-in or extension action is available.'],rejected:['Rejected request.','No move-in or extension action is available.']})[props.booking.status]);
// Who performed an event, only where the event itself proves it. Checkout can be recorded by the owner or SASO,
// and a legacy manual start has no record of who did it, so those show no actor.
const ACTORS={'Booking requested':'Student','Occupant record added':'Owner','Booked stay started automatically':'System','Arrival confirmed by owner':'Owner','Reservation cancelled by owner':'Owner','Cash no-show cancelled':'Owner','Paid no-show closed by owner':'Owner','Cancelled by student':'Student','Request closed: room filled':'System','Reservation expired':'System'};
</script>
<template>
 <div class="ob-detail">
  <header class="ob-detail-header"><div><h2>Booking details</h2><p class="mono">{{ ownerBookingReference(booking) }}</p></div><button type="button" class="ob-close" aria-label="Close booking details" @click="emit('close')"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></header>
  <div class="ob-detail-tabs" role="tablist" aria-label="Booking details tabs"><button v-for="key in ['details','activity']" :id="uid+'-'+key" :key="key" type="button" role="tab" :aria-selected="tab===key" :tabindex="tab===key ? 0 : -1" @click="tab=key" @keydown.right.prevent="moveTab" @keydown.left.prevent="moveTab">{{ key==='details' ? 'Details' : 'Activity' }}</button></div>

  <div class="ob-person"><UserAvatar :src="booking.profile_pic" :name="booking.student_name" class="ob-avatar" /><div><h3>{{ booking.student_name }}</h3><p><span class="mono">{{ ownerBookingReference(booking) }}</span><span aria-hidden="true">·</span><span :class="['ob-method',online ? 'online' : 'cash']"><i :class="['fa-solid',online ? 'fa-credit-card' : 'fa-money-bill-wave']" aria-hidden="true"></i>{{ online ? 'Online' : 'Cash' }}</span></p><small v-if="Number(booking.is_non_cspc)">Non-CSPC occupant</small></div></div>

  <div v-if="tab==='details'" class="ob-detail-body" role="tabpanel" aria-label="Booking details">
   <div class="ob-badges"><span :class="['o-badge',stage.tone]">{{ stage.label }}</span><span v-if="stage.key==='reserved'" class="o-badge sky">Starts on check-in</span><span v-if="hasExtension" class="o-badge purple">Extension requested · +{{ booking.extension_months }} months</span></div>
   <RenewalDecisionNotice :booking="booking" owner />
   <CancellationReviewSummary :booking="booking" owner />
   <ReservationDeadline :booking="booking" owner />
   <BookingFlowNotice :booking="booking" owner />

   <section class="ob-section" aria-labelledby="stay-record">
    <h4 id="stay-record">Stay record</h4>
    <dl class="ob-facts">
     <div><dt>Property</dt><dd class="strong">{{ booking.house_name }}</dd></div>
     <div><dt>Room</dt><dd class="strong">Room {{ booking.room_number }}<span v-if="booking.room_gender" :class="['ob-gender',String(booking.room_gender).toLowerCase()]"> · {{ booking.room_gender }}</span></dd></div>
     <div><dt>Check-in</dt><dd>{{ ownerDate(booking.occupant_check_in || booking.check_in_date) }}</dd></div>
     <div><dt>Check-out</dt><dd class="accent">{{ ownerDate(ownerStayEnd(booking)) }}</dd></div>
     <div><dt>Duration</dt><dd>{{ booking.months }} {{ Number(booking.months)===1 ? 'month' : 'months' }}</dd></div>
    </dl>
   </section>

   <section class="ob-section" aria-labelledby="payment-summary">
    <h4 id="payment-summary">Payment summary · PHP</h4>
    <dl class="ob-ledger">
     <div><dt>Monthly rent</dt><dd class="money">₱{{ ownerMoney(booking.monthly_rent) }}</dd></div>
     <div><dt>Total rent</dt><dd class="money">₱{{ ownerMoney(booking.amount ?? booking.total_amount) }}</dd></div>
     <div><dt>Move-in upfront fee<small>{{ Math.max(1,Number(booking.advance_months)||0) }} month(s) advance + {{ Number(booking.deposit_months)||0 }} month(s) deposit</small></dt><dd class="money">₱{{ ownerMoney(booking.initial_payment) }}</dd></div>
     <div><dt>Payment method</dt><dd><span :class="['ob-method',online ? 'online' : 'cash']"><i :class="['fa-solid',online ? 'fa-credit-card' : 'fa-money-bill-wave']" aria-hidden="true"></i>{{ online ? 'Online' : 'Cash' }}</span></dd></div>
     <div><dt>Upfront payment</dt><dd><span :class="['o-badge','payment',payment.tone]">{{ payment.label }}</span></dd></div>
     <div v-if="booking.occupant_check_in || Number(booking.is_non_cspc)"><dt>Monthly rent status</dt><dd>{{ ownerMonthlyRent(booking) }}</dd></div>
    </dl>
   </section>

   <section v-if="!terminal" class="ob-section ob-next-step" aria-labelledby="next-step">
    <h4 id="next-step">Next step</h4><p v-if="booking.status==='pending' && Number(booking.renewal_waiting)" class="ob-note">Wait for the renewal decision or review the resident extension. This incoming request cannot be approved or paid yet. You may reject it below; affected parties will be notified.</p><button v-if="booking.status==='pending' && Number(booking.renewal_waiting)" type="button" class="ob-btn reject" :disabled="busy" @click="emit('reject',booking)">Reject incoming request</button>
    <p v-if="stage.key==='reserved' && booking.payment_method==='cash'" class="ob-note">Reserved for {{ ownerDate(booking.check_in_date) }}. No move-in confirmation is needed. The stay starts automatically on that date; collect cash at arrival and record it in Boarder Details. Checkout remains {{ ownerDate(ownerStayEnd(booking)) }}.</p>
    <p v-else-if="stage.key==='reserved' && payment.key==='paid'" class="ob-note">Payment received. The bed is reserved and the stay starts automatically on {{ ownerDate(booking.check_in_date) }}. No owner confirmation is needed. Checkout remains {{ ownerDate(ownerStayEnd(booking)) }}.</p>
    <p v-else-if="stage.key==='reserved'" class="ob-note">Waiting for verified online payment. The student must pay before the displayed deadline or the reservation is automatically cancelled. Once paid, the stay starts on its booked check-in date.</p>
    <FutureReservationActions :booking="booking" @changed="emit('changed')" @notice="emit('notice',$event)" />
    <template v-if="booking.status==='pending' && !Number(booking.renewal_waiting)"><p class="ob-note">Review this request before the response deadline. Approval reserves a bed for the requested dates.</p><div class="ob-action-pair"><button type="button" class="ob-btn approve" :disabled="busy" @click="emit('approve',booking)">Approve</button><button type="button" class="ob-btn reject" :disabled="busy" @click="emit('reject',booking)">Reject</button></div></template>
    <template v-if="hasExtension"><p class="ob-note">Review the requested +{{ booking.extension_months }} months. Approval checks other stays and future room reservations.</p><div class="ob-action-pair"><button type="button" class="ob-btn approve" :disabled="busy" @click="emit('approve-extension',booking)">Approve extension</button><button type="button" class="ob-btn reject" :disabled="busy" @click="emit('reject-extension',booking)">Reject extension</button></div></template>
    <BookingArrivalActions :booking="booking" @changed="emit('changed')" @notice="emit('notice',$event)" />
    <p v-if="stage.key==='review' && booking.occupancy_start_issue" class="ob-note warn">{{ booking.occupancy_start_issue }}</p>
    <p v-if="stage.key==='occupying'" class="ob-note">Manage monthly rent, upfront fees, and checkout from this room's Boarder Details.</p>
    <router-link v-if="stage.key==='occupying' && booking.room_id" :to="'/owner/rooms/details/'+booking.room_id" class="ob-btn secondary">Open room details <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></router-link>
    <button v-if="!Number(booking.is_non_cspc) && stage.key==='confirmed' && booking.payment_method==='cash' && booking.payment_status!=='paid'" type="button" class="ob-btn primary" :disabled="busy" @click="emit('mark-paid',booking)">Mark paid</button>
   </section>

   <section class="ob-section" aria-labelledby="contact-record">
    <h4 id="contact-record">Contact record</h4>
    <dl class="ob-facts compact">
     <div><dt>Student contact</dt><dd>{{ booking.contact_number || 'Not provided' }}</dd></div>
     <div><dt>Guardian</dt><dd class="strong">{{ booking.guardian_name || 'Not provided' }}</dd></div>
     <div><dt>Emergency</dt><dd>{{ booking.emergency_contact || 'Not provided' }}</dd></div>
     <div><dt>Address</dt><dd>{{ booking.address || 'Not provided' }}</dd></div>
    </dl>
   </section>
   <p v-if="terminal && terminalNote" class="ob-note"><strong>{{ terminalNote[0] }}</strong> {{ terminalNote[1] }}</p>
  </div>

  <div v-else class="ob-detail-body" role="tabpanel" aria-label="Booking activity">
   <section class="ob-section first">
    <h4>Booking activity</h4>
    <p class="ob-subtle">Changes to this booking only.</p>
    <ol v-if="activity.length" class="ob-timeline">
     <li v-for="(event,index) in activity" :key="index" :class="event.tone"><span class="ob-event-icon" aria-hidden="true"><i :class="['fa-solid',event.icon]"></i></span><div><strong>{{ event.label }}</strong><span class="ob-when"><span class="mono">{{ event.dateOnly ? ownerDate(event.at) : ownerTimestamp(event.at) }}</span><template v-if="ACTORS[event.label]"> · {{ ACTORS[event.label] }}</template></span></div></li>
    </ol>
    <p v-else class="ob-subtle">No dated activity is available for this record.</p>
   </section>
   <p class="ob-note">Only events with a recorded date are listed. Approval, payment and extension decision times are not stored in the booking data; their current status is shown in Details.</p>
  </div>
 </div>
</template>
<style scoped>
.ob-detail{--ink:#0f2a4f;--text:#334a66;--muted:#5d6f88;--line:#e2e8f0;--blue:#2563eb;--blue-strong:#1d4ed8;--blue-soft:#eff6ff;--mono:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;min-width:0;background:#fff;color:var(--text);font-size:13px;line-height:1.55;}
.mono{font-family:var(--mono);}
.ob-detail-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:22px 24px 12px;}
.ob-detail-header h2{margin:0;font-size:22px;font-weight:700;letter-spacing:-.02em;color:var(--ink);}
.ob-detail-header p{margin:4px 0 0;font-size:12.5px;color:var(--muted);}
.ob-close{display:grid;place-items:center;width:36px;height:36px;flex-shrink:0;border:1px solid #d5deea;border-radius:8px;background:#fff;color:#475b78;cursor:pointer;}
.ob-close:hover{border-color:#bfdbfe;background:var(--blue-soft);color:var(--blue-strong);}
.ob-detail-tabs{display:flex;gap:28px;margin:0 24px;border-bottom:1px solid var(--line);}
.ob-detail-tabs button{padding:10px 4px;margin-bottom:-1px;border:0;border-bottom:3px solid transparent;background:none;font:inherit;font-size:13.5px;font-weight:600;color:var(--muted);cursor:pointer;}
.ob-detail-tabs button:hover{color:var(--ink);}
.ob-detail-tabs button[aria-selected=true]{color:var(--blue);border-bottom-color:var(--blue);}
.ob-person{display:flex;align-items:center;gap:12px;padding:18px 24px 0;}
.ob-avatar{display:grid;place-items:center;width:44px;height:44px;flex-shrink:0;border-radius:50%;background:#e0ebff;color:var(--blue-strong);font-weight:700;}
.ob-person h3{margin:0;font-size:15px;font-weight:700;color:var(--ink);}
.ob-person p{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:3px 0 0;font-size:12px;color:var(--muted);}
.ob-person small{font-size:11.5px;color:var(--muted);}
.ob-method{display:inline-flex;align-items:center;gap:5px;padding:1px 7px;border:1px solid;border-radius:5px;font-size:11px;font-weight:600;line-height:1.6;}
.ob-method i{font-size:9px;}
.ob-method.cash{background:#f8fafc;border-color:#e2e8f0;color:#475569;}
.ob-method.online{background:#f5f3ff;border-color:#ddd6fe;color:#6d28d9;}
.ob-detail-body{padding:14px 24px 28px;}
.ob-badges{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px;}
.ob-section{margin-top:20px;padding-top:18px;border-top:1px solid var(--line);}
.ob-section.first{margin-top:4px;padding-top:0;border-top:0;}
.ob-section h4{margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#3f5371;}
.ob-facts{display:grid;gap:10px;margin:0;}
.ob-facts>div{display:grid;grid-template-columns:120px minmax(0,1fr);gap:12px;align-items:baseline;}
.ob-facts dt{font-size:13px;color:var(--muted);}
.ob-facts dd{margin:0;font-size:13px;color:var(--text);overflow-wrap:anywhere;}
.ob-facts.compact>div{grid-template-columns:110px minmax(0,1fr);}
.ob-facts.compact dt,.ob-facts.compact dd{font-size:12.5px;}
.ob-facts dd.strong{font-weight:700;color:var(--ink);}
.ob-facts dd.accent{font-weight:700;color:var(--blue);}
.ob-gender{font-size:12px;font-weight:600;text-transform:capitalize;}
.ob-gender.female{color:#db2777;}.ob-gender.male{color:#2563eb;}.ob-gender.mixed{color:#7c3aed;}
.ob-ledger{margin:0;border:1px solid var(--line);border-radius:8px;background:#fbfcfe;}
.ob-ledger>div{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-top:1px solid #edf1f6;}
.ob-ledger>div:first-child{border-top:0;}
.ob-ledger dt{font-size:13px;color:var(--muted);}
.ob-ledger dt small{display:block;margin-top:2px;font-size:11px;color:#7a8ba3;}
.ob-ledger dd{margin:0;text-align:right;}
.ob-ledger dd.money{font-family:var(--mono);font-size:13px;font-weight:500;color:var(--ink);white-space:nowrap;}
.ob-next-step{display:grid;gap:10px;justify-items:start;}
.ob-next-step h4{margin-bottom:2px;}
.ob-note{margin:16px 0 0;padding:10px 14px;border-left:3px solid #94a3b8;border-radius:0 8px 8px 0;background:#f8fafc;font-size:12.5px;line-height:1.6;color:var(--text);}
.ob-next-step .ob-note{margin:0;width:100%;box-sizing:border-box;}
.ob-note.warn{border-left-color:#fbbf24;background:#fef3c7;color:#78350f;}
.ob-note strong{color:var(--ink);}
.ob-action-pair{display:flex;gap:8px;flex-wrap:wrap;}
.ob-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;padding:8px 14px;border:1px solid transparent;border-radius:8px;font:inherit;font-size:12.5px;font-weight:600;text-decoration:none;cursor:pointer;}
.ob-btn.approve{background:#16a34a;border-color:#16a34a;color:#fff;}.ob-btn.approve:hover{background:#15803d;}
.ob-btn.reject{background:#fff;border-color:#fca5a5;color:#b91c1c;}.ob-btn.reject:hover{background:#fef2f2;}
.ob-btn.primary{background:var(--blue);border-color:var(--blue);color:#fff;}.ob-btn.primary:hover{background:var(--blue-strong);}
.ob-btn.secondary{background:#fff;border-color:#d5deea;color:#28466d;}.ob-btn.secondary:hover{background:var(--blue-soft);border-color:#bfdbfe;color:var(--blue-strong);}
.ob-btn:disabled{opacity:.55;cursor:not-allowed;}
.ob-subtle{margin:0 0 14px;font-size:12.5px;color:var(--muted);}
.ob-timeline{position:relative;margin:0;padding:0;list-style:none;}
.ob-timeline li{position:relative;display:flex;gap:12px;padding-bottom:18px;}
.ob-timeline li:not(:last-child)::before{content:'';position:absolute;left:14px;top:30px;bottom:0;width:2px;background:#e2e8f0;}
.ob-event-icon{position:relative;z-index:1;display:grid;place-items:center;flex-shrink:0;width:30px;height:30px;border-radius:50%;background:#f1f5f9;color:#475569;font-size:12px;}
.ob-timeline li.blue .ob-event-icon{background:#dbeafe;color:#1d4ed8;}.ob-timeline li.green .ob-event-icon{background:#dcfce7;color:#15803d;}.ob-timeline li.red .ob-event-icon{background:#fee2e2;color:#b91c1c;}.ob-timeline li.slate .ob-event-icon{background:#f1f5f9;color:#475569;}
.ob-timeline li>div{padding-top:4px;}
.ob-timeline strong{display:block;font-size:13.5px;font-weight:700;color:var(--ink);}
.ob-when{display:block;margin-top:2px;font-size:12px;color:var(--muted);}
.ob-detail :deep(.booking-flow-notice),.ob-detail :deep(.reservation-deadline){max-width:none;}
button:focus-visible,a:focus-visible{outline:3px solid #93c5fd;outline-offset:2px;}
@media(max-width:480px){.ob-detail-header,.ob-person{padding-left:16px;padding-right:16px;}.ob-detail-tabs{margin:0 16px;}.ob-detail-body{padding:14px 16px 24px;}.ob-facts>div,.ob-facts.compact>div{grid-template-columns:104px minmax(0,1fr);}}
@media(pointer:coarse){.ob-btn,.ob-close,.ob-detail-tabs button{min-height:44px;}.ob-close{width:44px;}}
</style>
