<script setup>
import { ref, computed } from 'vue';
import axios from 'axios';
import AppDialog from './AppDialog.vue';
import { cashNoShowReady, arrivalPending, manilaDay, scheduledDay, nonArrivalRecordReady, nonArrivalCloseReady, bookedCheckoutDay, advanceCoverage } from '../utils/bookingArrival.js';
import { ownerDate } from '../utils/ownerBookingDisplay.js';
// compact: only the non-arrival buttons (Room Details rows have their own Confirm arrival button).
const props=defineProps({booking:{type:Object,required:true},compact:Boolean});
const emit=defineEmits(['changed','notice']);
const busy=ref(false),confirmed=ref(false),error=ref(''),mode=ref(''),note=ref('');
// Shown beside the non-arrival actions so the owner can decide how long to hold the paid bed.
const coverage=computed(()=>advanceCoverage(props.booking));
const plural=(n,word)=>n+' '+word+(n===1?'':'s');
const prepaidParts=computed(()=>{const c=coverage.value;return c ? plural(c.advance,'advance month')+(c.consumableDeposit ? ' + '+plural(c.consumableDeposit,'month')+' consumable deposit' : '') : '';});
const coverageText=computed(()=>{
 const c=coverage.value;if(!c)return '';
 const covers=c.coversWholeStay ? 'covers the whole booked stay, until ' : 'covers the stay until ';
 const refundable=c.refundableDeposit ? ' The refundable deposit is a security deposit, not rent, so it is not counted.' : '';
 return 'Prepaid rent ('+prepaidParts.value+') '+covers+ownerDate(c.until)+'.'+refundable;
});
const checkoutLabel=computed(()=>ownerDate(bookedCheckoutDay(props.booking)));
const todayLabel=computed(()=>ownerDate(manilaDay()));
const student=computed(()=>props.booking.student_name || 'The student');
const canConfirmArrival=computed(()=>!props.compact && arrivalPending(props.booking) && !!props.booking.occupant_id && !!scheduledDay(props.booking) && manilaDay()>=scheduledDay(props.booking));
const canCashNoShow=computed(()=>!props.compact && cashNoShowReady(props.booking));
const DIALOGS={
 arrival:{title:'Confirm arrival?',icon:'fa-door-open',tone:'info',confirm:'Confirm arrival',button:'primary',check:'The student has moved in.'},
 'no-show':{title:'Cancel unpaid cash no-show?',icon:'fa-user-xmark',tone:'danger',confirm:'Cancel no-show',button:'danger',check:'The student did not arrive and no payment was received.'},
 'non-arrival':{title:'Record non-arrival?',icon:'fa-user-slash',tone:'warning',confirm:'Record non-arrival',button:'danger',check:'The student has not arrived as of today.'},
 'close-non-arrival':{title:'Close as "Did not arrive"?',icon:'fa-user-slash',tone:'danger',confirm:'Close stay',button:'danger',check:'The student has not arrived, and I want to free the bed.'}
};
const active=computed(()=>DIALOGS[mode.value]);
const open=value=>{mode.value=value;confirmed.value=false;error.value='';note.value='';};
const close=()=>{if(!busy.value)mode.value='';};
const URLS={arrival:b=>'/api/owner/rooms/occupants/arrival/'+b.occupant_id,'no-show':b=>'/api/owner/bookings/no-show/'+b.id,'non-arrival':b=>'/api/owner/bookings/non-arrival/'+b.id,'close-non-arrival':b=>'/api/owner/bookings/non-arrival/close/'+b.id};
const FAILURES={arrival:'Could not confirm arrival. Please try again.','no-show':'Could not cancel this no-show. Please try again.','non-arrival':'Could not record non-arrival. Please try again.','close-non-arrival':'Could not close this stay. Please try again.'};
const submit=async()=>{
 if(busy.value || !confirmed.value)return;
 busy.value=true;error.value='';
 try{
  const body=mode.value==='non-arrival' ? {note:note.value} : {};
  const {data}=await axios.post(URLS[mode.value](props.booking),body, {headers:{Authorization:'Bearer '+sessionStorage.getItem('cspc_token')}});
  busy.value=false;mode.value='';emit('notice',{message:data.message,tone:'success'});emit('changed');
 }catch(e){error.value=e.response?.data?.message || FAILURES[mode.value];if([404,409].includes(e.response?.status))emit('changed');}
 finally{busy.value=false;}
};
</script>
<template>
 <div v-if="canConfirmArrival || canCashNoShow || nonArrivalRecordReady(booking) || nonArrivalCloseReady(booking)" :class="['arrival-actions',{compact}]">
  <div class="arrival-buttons">
   <button v-if="canConfirmArrival" type="button" class="primary" @click="open('arrival')"><i class="fa-solid fa-door-open" aria-hidden="true"></i>Confirm arrival</button>
   <button v-if="canCashNoShow" type="button" class="danger" @click="open('no-show')"><i class="fa-solid fa-user-xmark" aria-hidden="true"></i>Cancel cash no-show</button>
   <button v-if="nonArrivalRecordReady(booking)" type="button" class="danger" @click="open('non-arrival')"><i class="fa-solid fa-user-slash" aria-hidden="true"></i>Record non-arrival</button>
   <button v-if="nonArrivalCloseReady(booking)" type="button" class="danger" @click="open('close-non-arrival')"><i class="fa-solid fa-user-slash" aria-hidden="true"></i>Close as did not arrive</button>
  </div>
  <template v-if="!compact">
   <p v-if="nonArrivalRecordReady(booking)" class="arrival-hint">Student hasn't come? Record non-arrival first; the student is notified and can still contact you. You can then close the stay as "Did not arrive" to free the bed.</p>
   <p v-else-if="nonArrivalCloseReady(booking)" class="arrival-hint">Recorded as not arrived. Confirm arrival if the student turns up, or close the stay as "Did not arrive" when you want to free the bed.</p>
   <p v-if="coverageText && (nonArrivalRecordReady(booking) || nonArrivalCloseReady(booking))" class="arrival-coverage"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i><span>{{ coverageText }} You decide when to close; the platform does not enforce this date.</span></p>
  </template>
 </div>
 <AppDialog :open="!!active" :title="active?.title || ''" :icon="active?.icon" :tone="active?.tone" :busy="busy" @close="close">
  <template v-if="mode==='arrival'">
   <p class="app-dialog-lead">Confirm that <strong>{{ student }}</strong> has physically moved in.</p>
   <dl class="app-dialog-facts"><div><dt>After confirming</dt><dd>Counted as a resident in your records and SASO figures</dd></div><div><dt>Payment</dt><dd>Recorded separately; not changed</dd></div></dl>
  </template>
  <template v-else-if="mode==='no-show'">
   <p class="app-dialog-lead"><strong>{{ student }}</strong> did not arrive and no payment was collected.</p>
   <dl class="app-dialog-facts"><div><dt>Booking</dt><dd>Cancelled as a cash no-show</dd></div><div><dt>Remaining dates</dt><dd>Released for other students</dd></div><div><dt>Other reservations</dt><dd>Unchanged</dd></div></dl>
  </template>
  <template v-else-if="mode==='non-arrival'">
   <p class="app-dialog-lead">Record that <strong>{{ student }}</strong> has not arrived. The student is notified so they can contact you.</p>
   <dl class="app-dialog-facts"><div><dt>Reservation and payment</dt><dd>Unchanged for now</dd></div><div><dt>Bed</dt><dd>Still held until you close the stay</dd></div><div v-if="coverage"><dt>Prepaid rent covers</dt><dd>Until {{ ownerDate(coverage.until) }} ({{ prepaidParts }})</dd></div></dl>
   <p class="app-dialog-callout"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>If the student arrives, use Confirm arrival. If not, close the stay as "Did not arrive" to free the bed.</span></p>
   <label class="app-dialog-field">Note <small>(optional, visible to you)</small><textarea v-model="note" rows="2" maxlength="500" placeholder="For example: no reply to calls since check-in day"></textarea></label>
  </template>
  <template v-else-if="mode==='close-non-arrival'">
   <p class="app-dialog-lead"><strong>{{ student }}</strong> has not arrived. Closing frees the bed for the rest of the booked stay.</p>
   <dl class="app-dialog-facts">
    <div><dt>Bed free from</dt><dd>{{ todayLabel }}</dd></div>
    <div><dt>Booked checkout</dt><dd>{{ checkoutLabel }}</dd></div>
    <div v-if="coverage"><dt>Prepaid rent covers</dt><dd>Until {{ ownerDate(coverage.until) }} ({{ prepaidParts }})</dd></div>
    <div><dt>Booking status</dt><dd>Did not arrive (not Completed)</dd></div>
    <div><dt>Payment record</dt><dd>Unchanged</dd></div>
   </dl>
   <p v-if="coverage && coverage.refundableDeposit" class="app-dialog-callout neutral"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>The refundable deposit is a security deposit, not rent, so it is not counted as prepaid rent.</span></p>
   <p class="app-dialog-callout warning"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>This cannot be undone. Any concern about the upfront payment is handled with the student outside the platform. You and the student are notified.</span></p>
  </template>
  <label v-if="active" class="app-dialog-check"><input v-model="confirmed" type="checkbox"/>{{ active.check }}</label>
  <p v-if="error" role="alert" class="app-dialog-error">{{ error }}</p>
  <template #footer>
   <button type="button" class="app-btn secondary" :disabled="busy" @click="close">Go back</button>
   <button type="button" :class="['app-btn',active?.button]" :disabled="busy || !confirmed" @click="submit">{{ busy ? 'Saving...' : active?.confirm }}</button>
  </template>
 </AppDialog>
</template>
<style scoped>
.arrival-actions{display:grid;gap:10px;margin-top:12px;}.arrival-actions.compact{margin-top:0;}.arrival-buttons{display:flex;flex-wrap:wrap;gap:8px;}.arrival-buttons button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;padding:8px 14px;border:1px solid transparent;border-radius:8px;font-size:12px;font-weight:650;line-height:1.2;cursor:pointer;transition:background .15s,border-color .15s;}.compact .arrival-buttons button{min-height:32px;padding:6px 10px;font-size:11.5px;}.arrival-buttons i{font-size:11px;}.arrival-buttons .primary{background:#2563eb;border-color:#2563eb;color:#fff;}.arrival-buttons .primary:hover{background:#1d4ed8;}.arrival-buttons .danger{background:#fef2f2;border-color:#fecaca;color:#b91c1c;}.arrival-buttons .danger:hover{background:#fee2e2;border-color:#fca5a5;}.arrival-buttons button:focus-visible{outline:3px solid #93c5fd;outline-offset:2px;}.arrival-buttons button:disabled{opacity:.5;cursor:not-allowed;}.arrival-hint{margin:0;font-size:12px;line-height:1.6;color:#526b89;}.arrival-coverage{display:flex;align-items:flex-start;gap:8px;margin:0;padding:8px 10px;border:1px solid #dbeafe;border-radius:8px;background:#f5f9ff;font-size:12px;line-height:1.6;color:#27476d;}.arrival-coverage i{margin-top:3px;color:#2563eb;font-size:11px;}@media(max-width:480px){.arrival-buttons button{flex:1 1 100%;}}@media(pointer:coarse){.arrival-buttons button{min-height:44px;}}
</style>
