<script setup>
import PaidReservationPolicy from './PaidReservationPolicy.vue';
import AppDialog from './AppDialog.vue';
import {ownerDate} from '../utils/ownerBookingDisplay.js';
import {computed,ref} from 'vue';
import axios from 'axios';
import {scheduledDay,manilaDay} from '../utils/bookingArrival.js';
const props=defineProps({booking:Object});const emit=defineEmits(['changed','notice']);
const dialogOpen=ref(false),busy=ref(false),error=ref(''),reason=ref('');
const future=computed(()=>props.booking.status==='confirmed' && !props.booking.move_in_confirmed_at && !props.booking.occupant_check_in && scheduledDay(props.booking)>manilaDay());
const paid=computed(()=>props.booking.payment_status==='paid' || !!props.booking.paymongo_payment_id);
const submit=async()=>{if(busy.value)return;busy.value=true;error.value='';try{const {data}=await axios.post('/api/owner/bookings/cancel-reservation/'+props.booking.id,{reason:reason.value}, {headers:{Authorization:'Bearer '+sessionStorage.getItem('cspc_token')}});dialogOpen.value=false;emit('notice',{message:data.message,tone:'success'});emit('changed');}catch(e){error.value=e.response?.data?.message || 'Cancellation failed. Please try again.';}finally{busy.value=false;}};
</script>
<template><div v-if="future" class="future-actions"><PaidReservationPolicy v-if="paid" :booking="booking" /><p v-else-if="Number(booking.payment_review_required)">This booking has a payment exception, so it cannot be cancelled through the platform. Settle it with the student outside the platform.</p><button v-else type="button" @click="error='';reason='';dialogOpen=true">Cancel reservation</button></div>
<AppDialog :open="dialogOpen" title="Cancel future reservation?" icon="fa-calendar-xmark" tone="danger" :busy="busy" @close="dialogOpen=false">
 <p class="app-dialog-lead">This cancels the unpaid reservation for <strong>{{ booking.student_name }}</strong>.</p>
 <dl class="app-dialog-facts"><div><dt>Check-in</dt><dd>{{ ownerDate(booking.check_in_date) }}</dd></div><div><dt>Dates</dt><dd>Released for other students</dd></div><div><dt>Other reservations</dt><dd>Unchanged</dd></div></dl>
 <label class="app-dialog-field">Reason shown to the student <small>(at least 5 characters)</small><textarea v-model="reason" rows="3" maxlength="1000" placeholder="Explain why this reservation must be cancelled." required></textarea></label>
 <p v-if="error" role="alert" class="app-dialog-error">{{ error }}</p>
 <template #footer><button type="button" class="app-btn secondary" :disabled="busy" @click="dialogOpen=false">Keep reservation</button><button type="button" class="app-btn danger" :disabled="busy || reason.trim().length<5" @click="submit">{{ busy ? 'Cancelling...' : 'Cancel reservation' }}</button></template>
</AppDialog></template>
<style scoped>
.cancel-reason{display:grid;gap:8px;margin:16px 0;font-size:13px;font-weight:600}.cancel-reason textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #cdd9e8;border-radius:8px;font:inherit;resize:vertical}
.future-actions{margin-top:12px}.future-actions p{font-size:12px;color:#465e7e;line-height:1.6}.future-actions button,.reservation-confirm button{font:inherit;font-size:12px;font-weight:600;border:1px solid #fecdd3;border-radius:8px;padding:8px 12px;background:#fff1f2;color:#be123c;cursor:pointer}.reservation-confirm{width:min(460px,calc(100vw - 32px));box-sizing:border-box;border:0;border-radius:16px;padding:24px;color:#233e60;box-shadow:0 24px 70px #10274433}.reservation-confirm::backdrop{background:#0f172a80}.reservation-confirm h2{font-size:18px;margin:0 0 12px;font-weight:650}.reservation-confirm p{font-size:14px;line-height:1.65;text-align:left}.reservation-confirm footer{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:22px}.reservation-confirm button{color:#334155;background:white;border-color:#dbe4ef}.reservation-confirm .danger{color:white;background:#dc3545;border-color:#dc3545}.reservation-confirm .error{color:#b42338}.reservation-confirm button:disabled{opacity:.5;cursor:wait}@media(pointer:coarse){button{min-height:44px}}
</style>