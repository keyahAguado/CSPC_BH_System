<script setup>
import { computed, ref, watch, nextTick } from 'vue';
import TablePager from './management/TablePager.vue';
import OwnerBookingDetailsPanel from './OwnerBookingDetailsPanel.vue';
import { ownerBookingKey, ownerBookingReference, ownerBookingStage, ownerUpfrontPayment, ownerDate, ownerDay, ownerStayEnd, ownerMoney } from '../utils/ownerBookingDisplay.js';
import { matchesSearch } from '../utils/search.js';
import { moveInReviewDue } from '../utils/bookingArrival.js';
import '../styles/owner-badges.css';
const props=defineProps({bookings:{type:Array,default:()=>[]},initialProperty:String,initialBooking:String,busy:Boolean});
const emit=defineEmits(['report-rows','print','approve','reject','approve-extension','reject-extension','mark-paid','changed','notice']);
const search=ref(''),status=ref('all'),payment=ref('all'),room=ref('all'),property=ref(props.initialProperty || 'all');
const from=ref(''),to=ref(''),page=ref(1),perPage=ref(10),sort=ref('booked'),order=ref(-1);
const selectedKey=ref(''),dialog=ref(null),initialTab=ref('details');
let lastTrigger;
const selected=computed(()=>props.bookings.find(b=>ownerBookingKey(b)===selectedKey.value));
const propertyKey=b=>String(b.house_id ?? b.house_name);
const properties=computed(()=>[...new Map(props.bookings.map(b=>[propertyKey(b),{id:propertyKey(b),name:b.house_name,address:b.house_location}])).values()]);
const propertyRows=computed(()=>props.bookings.filter(b=>property.value==='all' || propertyKey(b)===property.value));
const activeProperty=computed(()=>properties.value.find(h=>h.id===property.value));
// Problems that background retries cannot fix on their own: the owner has to act.
const moveInReviews=computed(()=>propertyRows.value.filter(b=>moveInReviewDue(b)));
const blockedStarts=computed(()=>propertyRows.value.filter(b=>b.status==='confirmed' && b.occupancy_start_issue));
const rooms=computed(()=>[...new Set(propertyRows.value.map(b=>String(b.room_number)))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})));
const invalidRange=computed(()=>from.value && to.value && from.value>to.value);
const filtered=computed(()=>{
 const rows=propertyRows.value.filter(b=>{
  const stage=ownerBookingStage(b),p=ownerUpfrontPayment(b);
  if(status.value!=='all' && stage.key!==status.value) return false;
  if(payment.value==='cash' || payment.value==='paymongo'){if(b.payment_method!==payment.value)return false;}
  else if(payment.value!=='all' && p.key!==payment.value)return false;
  if(room.value!=='all' && String(b.room_number)!==room.value)return false;
  if(invalidRange.value)return false;
  const start=ownerDay(b.occupant_check_in || b.check_in_date),endDay=ownerStayEnd(b);
  if((from.value && (!endDay || endDay<=from.value)) || (to.value && (!start || start>to.value)))return false;
  return matchesSearch(search.value,[b.student_name,ownerBookingReference(b),'Room '+b.room_number,b.house_name,b.guardian_name,b.emergency_contact,Number(b.is_non_cspc)?'non-CSPC':'CSPC']);
 });
 return rows.sort((a,b)=>{
  if(sort.value==='booked'){
   const stamp=b=>{const value=Date.parse(b.booking_date || '');return Number.isFinite(value)?value:0;};
   return (stamp(a)-stamp(b))*order.value || (Number(a.id)-Number(b.id))*order.value || ownerBookingKey(a).localeCompare(ownerBookingKey(b));
  }
  let x,y;
  if(sort.value==='student'){x=a.student_name || '';y=b.student_name || '';}
  else if(sort.value==='room'){x=String(a.room_number || '');y=String(b.room_number || '');}
  else if(sort.value==='checkin'){x=String(a.check_in_date || '');y=String(b.check_in_date || '');}
  else if(sort.value==='payment'){x=ownerUpfrontPayment(a).label;y=ownerUpfrontPayment(b).label;}
  else{x=ownerBookingStage(a).label;y=ownerBookingStage(b).label;}
  return x.localeCompare(y,undefined,{numeric:true,sensitivity:'base'})*order.value || ownerBookingKey(a).localeCompare(ownerBookingKey(b),undefined,{numeric:true});
 });
});
const totalPages=computed(()=>Math.max(1,Math.ceil(filtered.value.length/perPage.value)));
const rows=computed(()=>filtered.value.slice((page.value-1)*perPage.value,page.value*perPage.value));
const start=computed(()=>filtered.value.length ? (page.value-1)*perPage.value+1 : 0),end=computed(()=>Math.min(page.value*perPage.value,filtered.value.length));
watch([search,status,payment,room,property,from,to,perPage],()=>page.value=1);
watch(property,()=>{room.value='all';closeDetails();});
watch(totalPages,total=>page.value=Math.min(page.value,total));
watch(filtered,value=>emit('report-rows',value),{immediate:true});
watch(selected,booking=>{if(!booking)closeDetails();});
const sortColumn=key=>{order.value=sort.value===key ? -order.value : 1;sort.value=key;page.value=1;};
const sortIcon=key=>sort.value===key ? order.value===1 ? 'fa-sort-up' : 'fa-sort-down' : 'fa-sort';
const reset=()=>{search.value='';status.value='all';payment.value='all';room.value='all';from.value='';to.value='';sort.value='booked';order.value=-1;page.value=1;};
// The details panel is a slide-over dialog at every width (full screen on phones).
const openDetails=async(b,event,tab='details')=>{
 lastTrigger=event?.currentTarget;selectedKey.value=ownerBookingKey(b);initialTab.value=tab;await nextTick();
 if(dialog.value && !dialog.value.open)dialog.value.showModal();
};
let openedInitialBooking='';
watch(()=>[props.initialBooking,props.bookings],async()=>{
 const id=String(props.initialBooking || '');if(!id || id===openedInitialBooking)return;
 const booking=props.bookings.find(b=>!Number(b.is_non_cspc) && String(b.id)===id);if(!booking)return;
 await nextTick();if(String(props.initialBooking)!==id)return;openedInitialBooking=id;await openDetails(booking);
},{immediate:true});
function closeDetails(){dialog.value?.close();selectedKey.value='';lastTrigger?.focus?.({preventScroll:true});}
// Decisions open the page's own confirmation pop-up, so the panel closes first and never covers it.
const decision=(name,b)=>{closeDetails();emit(name,b);};
const handlers={approve:b=>decision('approve',b),reject:b=>decision('reject',b),'approve-extension':b=>decision('approve-extension',b),'reject-extension':b=>decision('reject-extension',b),'mark-paid':b=>decision('mark-paid',b),changed:()=>emit('changed'),notice:value=>emit('notice',value),close:closeDetails};
const hasExtension=b=>b.status==='confirmed' && Number(b.is_extension_requested)===1;
const upfrontAmount=b=>!Number(b.renewal_waiting) && ownerUpfrontPayment(b).key!=='paid' && ['pending','confirmed'].includes(b.status) && Number(b.initial_payment) > 0 ? '₱'+ownerMoney(b.initial_payment) : '';
const tabs=computed(()=>[{key:'all',label:'All bookings',count:propertyRows.value.length},{key:'pending',label:'Pending'},{key:'reserved',label:'Reserved'},{key:'occupying',label:'Occupying'},{key:'completed',label:'Completed'},{key:'not-arrived',label:'Did not arrive'},{key:'cancelled',label:'Cancelled'}]);
// A second, smaller badge for what the row is waiting on; derived only from existing booking fields.
const rowHint=b=>{
 if(hasExtension(b))return {label:'Extension +'+b.extension_months+' mo',tone:'purple',icon:'fa-calendar-plus'};
 if(b.status==='pending' && Number(b.renewal_waiting))return {label:'On hold until resident decides',tone:'slate',icon:'fa-hourglass-half'};
 if(b.status==='pending')return {label:'Response needed',tone:'amber',icon:'fa-reply'};
 if(ownerBookingStage(b).key==='reserved')return ownerUpfrontPayment(b).label==='Awaiting payment' ? {label:'Awaiting payment',tone:'amber',icon:'fa-hourglass-half'} : {label:'Starts on check-in',tone:'sky',icon:'fa-calendar-day'};
 return null;
};
</script>
<template>
 <section class="ob-workspace no-print" aria-label="Manage bookings">
  <header class="ob-heading">
   <div><p class="ob-eyebrow">Owner workspace / Reservations</p><h1>Bookings</h1><p class="ob-subtitle">Manage stays, payment state, and owner actions.</p></div>
   <button type="button" class="ob-button secondary ob-print app-print-button" aria-label="Print or save bookings as PDF" @click="emit('print')"><i class="fa-solid fa-print" aria-hidden="true"></i><span>Print / Save PDF</span></button>
  </header>

  <section v-if="moveInReviews.length || blockedStarts.length" class="ob-alerts" role="status" aria-label="Bookings that need your action"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><div><strong>Action needed</strong><ul><li v-if="blockedStarts.length">{{ blockedStarts.length }} booked {{ blockedStarts.length===1 ? 'stay cannot' : 'stays cannot' }} start: {{ blockedStarts.map(b=>ownerBookingReference(b)).join(', ') }}. Usually a previous boarder's checkout has not been recorded; open each booking to see why.</li><li v-if="moveInReviews.length">{{ moveInReviews.length }} {{ moveInReviews.length===1 ? 'stay needs' : 'stays need' }} move-in review: {{ moveInReviews.map(b=>ownerBookingReference(b)).join(', ') }}. The check-in day has passed without a confirmed arrival. Confirm arrival, cancel an eligible unpaid cash no-show, or record checkout.</li></ul><button type="button" class="ob-link" @click="status='review'">Show bookings that need review</button></div></section>

  <div class="ob-surface">
  <label class="ob-property"><span class="ob-property-icon"><i class="fa-solid fa-house" aria-hidden="true"></i></span><span class="ob-property-copy"><span class="sr-only">Property</span><select v-model="property" aria-label="Filter bookings by property"><option value="all">All properties</option><option v-if="property!=='all' && !activeProperty" :value="property">Selected property</option><option v-for="house in properties" :key="house.id" :value="house.id">{{ house.name }}</option></select><small>{{ activeProperty?.address || (property==='all' ? 'Bookings across your properties' : 'No bookings for this property') }}</small></span><i class="fa-solid fa-chevron-down ob-property-caret" aria-hidden="true"></i></label>

  <div class="ob-filters">
   <label class="ob-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input v-model="search" type="search" aria-label="Search student or booking reference" placeholder="Search student or reference…"/></label>
   <select v-model="status" aria-label="Filter booking status"><option value="all">Status</option><option value="pending">Pending requests</option><option value="reserved">Reserved</option><option value="occupying">Occupying</option><option value="confirmed">Approved</option><option value="review">Needs review</option><option value="completed">Completed</option><option value="cancelled">Cancelled / expired</option><option value="rejected">Rejected</option></select>
   <select v-model="payment" aria-label="Filter payment"><option value="all">Payment</option><option value="paid">Upfront paid</option><option value="unpaid">Upfront unpaid</option><option value="cash">Cash bookings</option><option value="paymongo">Online bookings</option></select>
   <select v-model="room" aria-label="Filter room"><option value="all">Room</option><option v-for="number in rooms" :key="number" :value="number">Room {{ number }}</option></select>
   <details class="ob-date-filter"><summary><i class="fa-regular fa-calendar" aria-hidden="true"></i><span>{{ from || to ? 'Dates set' : 'Stay dates' }}</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary><div><strong>Stays overlapping these dates</strong><label>From<input v-model="from" type="date" aria-label="Stay date from"/></label><label>Through<input v-model="to" type="date" :min="from || undefined" aria-label="Stay date through"/></label><p v-if="invalidRange" role="alert">The end must be on or after the start.</p><button type="button" class="ob-link" @click="from='';to=''">Clear dates</button></div></details>
  </div>

  <div class="ob-tabs-row">
   <nav class="ob-tabs" aria-label="Quick booking filters"><button v-for="tab in tabs" :key="tab.key" type="button" :aria-pressed="status===tab.key" @click="status=tab.key">{{ tab.label }}<span v-if="tab.count !== undefined" class="ob-tab-count">{{ tab.count }}</span></button></nav>
   <div class="ob-sort-tools"><button type="button" class="ob-link" :aria-pressed="sort==='booked' && order===-1" @click="sort='booked';order=-1;page=1"><i class="fa-solid fa-arrow-down-wide-short" aria-hidden="true"></i> Newest first</button><button type="button" class="ob-link" @click="reset">Reset filters</button></div>
  </div>

  <div class="ob-table-card">
   <TablePager position="top" noun="bookings" :page="page" :total-pages="totalPages" :start="start" :end="end" :total="filtered.length" :per-page="perPage" @update:page="page=$event" @update:per-page="perPage=$event"/>
   <div class="ob-table-scroll">
    <table class="ob-table">
     <colgroup><col class="c-student"/><col class="c-room"/><col class="c-stay"/><col class="c-payment"/><col class="c-status"/><col class="c-actions"/></colgroup>
     <thead><tr><th v-for="col in [{key:'student',label:'Student / ref'},{key:'room',label:'Room'},{key:'checkin',label:'Stay dates'},{key:'payment',label:'Move-in payment'},{key:'status',label:'Booking status'}]" :key="col.key" :aria-sort="sort===col.key ? order===1 ? 'ascending' : 'descending' : 'none'"><button type="button" @click="sortColumn(col.key)">{{ col.label }}<i :class="['fa-solid',sortIcon(col.key)]" aria-hidden="true"></i></button></th><th class="ob-actions-heading">Actions</th></tr></thead>
     <tbody>
      <tr v-for="b in rows" :key="ownerBookingKey(b)" :class="{selected:selectedKey===ownerBookingKey(b)}">
       <td><button type="button" class="ob-name" @click="openDetails(b,$event)">{{ b.student_name }}</button><div class="ob-meta"><span class="ob-ref">{{ ownerBookingReference(b) }}</span><span :class="['ob-method',b.payment_method==='paymongo' ? 'online' : 'cash']"><i :class="['fa-solid',b.payment_method==='paymongo' ? 'fa-credit-card' : 'fa-money-bill-wave']" aria-hidden="true"></i>{{ b.payment_method==='paymongo' ? 'Online' : 'Cash' }}</span><span v-if="Number(b.is_non_cspc)" class="ob-non-cspc">Non-CSPC</span></div></td>
       <td><strong class="ob-room">Room {{ b.room_number }}</strong><span :class="['ob-gender',String(b.room_gender || '').toLowerCase()]">{{ b.room_gender || 'Unspecified' }}</span></td>
       <td><span class="ob-date">{{ ownerDate(b.occupant_check_in || b.check_in_date) }}</span><span class="ob-date end">– {{ ownerDate(ownerStayEnd(b)) }}</span></td>
       <td><div :class="['ob-payment-chip',ownerUpfrontPayment(b).tone]"><span :class="['o-badge','payment',ownerUpfrontPayment(b).tone]">{{ ownerUpfrontPayment(b).label }}</span><span v-if="upfrontAmount(b)" class="ob-amount">{{ upfrontAmount(b) }}</span></div></td>
       <td><div :class="['ob-status-stack',ownerBookingStage(b).tone]"><span :class="['o-badge',ownerBookingStage(b).tone]">{{ ownerBookingStage(b).label }}</span><span v-if="rowHint(b)" :class="['o-badge','small',rowHint(b).tone]">{{ rowHint(b).label }}</span></div></td>
       <td><div class="ob-row-actions"><template v-if="b.status==='pending' && !Number(b.renewal_waiting) && !Number(b.is_non_cspc)"><button type="button" class="ob-button approve" :disabled="busy" @click="emit('approve',b)"><i class="fa-solid fa-check" aria-hidden="true"></i>Approve</button><button type="button" class="ob-button reject" :disabled="busy" @click="emit('reject',b)">Reject</button></template><template v-else-if="hasExtension(b) && !Number(b.is_non_cspc)"><button type="button" class="ob-button approve" :disabled="busy" @click="emit('approve-extension',b)"><i class="fa-solid fa-check" aria-hidden="true"></i>Approve</button><button type="button" class="ob-button reject" :disabled="busy" @click="emit('reject-extension',b)">Reject</button></template><button v-else type="button" :class="['ob-button','ob-view-details',selectedKey===ownerBookingKey(b) ? 'primary' : 'secondary']" @click="openDetails(b,$event)"><i class="fa-regular fa-eye" aria-hidden="true"></i>View details</button><details v-if="b.status!=='pending' && !hasExtension(b)" class="ob-more"><summary :aria-label="'More options for '+ownerBookingReference(b)"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></summary><div><button type="button" @click="openDetails(b,$event)">Booking details</button><button type="button" @click="openDetails(b,$event,'activity')">Recorded activity</button><router-link v-if="b.room_id" :to="'/owner/rooms/details/'+b.room_id">Open room details</router-link></div></details></div></td>
      </tr>
     </tbody>
    </table>
   </div>
   <div class="ob-mobile-cards"><article v-for="b in rows" :key="ownerBookingKey(b)" :class="{selected:selectedKey===ownerBookingKey(b)}"><div class="ob-mobile-head"><div><button type="button" class="ob-name" @click="openDetails(b,$event)">{{ b.student_name }}</button><div class="ob-meta"><span class="ob-ref">{{ ownerBookingReference(b) }}</span><span :class="['ob-method',b.payment_method==='paymongo' ? 'online' : 'cash']">{{ b.payment_method==='paymongo' ? 'Online' : 'Cash' }}</span><span v-if="Number(b.is_non_cspc)" class="ob-non-cspc">Non-CSPC</span></div></div><span :class="['o-badge',ownerBookingStage(b).tone]">{{ ownerBookingStage(b).label }}</span></div><dl class="ob-mobile-info"><div><dt>Room</dt><dd>Room {{ b.room_number }} <span :class="['ob-gender','inline',String(b.room_gender || '').toLowerCase()]">{{ b.room_gender }}</span></dd></div><div><dt>Move-in payment</dt><dd><span :class="['o-badge','payment',ownerUpfrontPayment(b).tone]">{{ ownerUpfrontPayment(b).label }}</span><span v-if="upfrontAmount(b)" class="ob-amount">{{ upfrontAmount(b) }}</span></dd></div><div class="wide"><dt>Stay dates</dt><dd class="ob-date">{{ ownerDate(b.occupant_check_in || b.check_in_date) }} <span class="end">– {{ ownerDate(ownerStayEnd(b)) }}</span></dd></div></dl><p v-if="rowHint(b)" class="ob-mobile-hint"><span :class="['o-badge','small',rowHint(b).tone]">{{ rowHint(b).label }}</span></p><div class="ob-mobile-actions"><button type="button" class="ob-button secondary ob-view-details" @click="openDetails(b,$event)">View details <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button><template v-if="b.status==='pending' && !Number(b.renewal_waiting) && !Number(b.is_non_cspc)"><button type="button" class="ob-button approve" :disabled="busy" @click="emit('approve',b)"><i class="fa-solid fa-check" aria-hidden="true"></i>Approve</button><button type="button" class="ob-button reject" :disabled="busy" @click="emit('reject',b)">Reject</button></template><template v-else-if="hasExtension(b) && !Number(b.is_non_cspc)"><button type="button" class="ob-button approve" :disabled="busy" @click="emit('approve-extension',b)"><i class="fa-solid fa-check" aria-hidden="true"></i>Approve</button><button type="button" class="ob-button reject" :disabled="busy" @click="emit('reject-extension',b)">Reject</button></template></div></article></div>
   <div v-if="!rows.length" class="ob-empty"><i class="fa-regular fa-calendar" aria-hidden="true"></i><h2>No matching bookings</h2><p>Try another property, search, or filter.</p><button type="button" class="ob-button secondary" @click="reset">Reset filters</button></div>
   <TablePager position="bottom" noun="bookings" :page="page" :total-pages="totalPages" :start="start" :end="end" :total="filtered.length" :per-page="perPage" @update:page="page=$event" @update:per-page="perPage=$event"/>
  </div>

  </div>

  <Teleport to="body"><dialog ref="dialog" class="ob-drawer" aria-label="Booking details" @cancel.prevent="closeDetails" @click="($event.target===dialog) && closeDetails()"><OwnerBookingDetailsPanel v-if="selected" :key="selectedKey+initialTab" :booking="selected" :initial-tab="initialTab" :busy="busy" v-on="handlers"/></dialog></Teleport>
 </section>
</template>
<style scoped src="../styles/owner-booking-workspace.css"></style>
