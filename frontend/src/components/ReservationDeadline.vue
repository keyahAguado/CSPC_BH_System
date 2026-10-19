<script setup>
import { bookingNow } from '../utils/bookingClock.js';
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { reservationDeadlineInfo } from '../utils/reservationDeadline.js';
const props = defineProps({ booking: Object, owner: Boolean });
const now = ref(bookingNow().getTime());
const info = computed(() => reservationDeadlineInfo(props.booking, now.value));
const formatted = computed(() => {
 const date = info.value?.at;
 if (!date) return '';
 const day = date.toLocaleDateString('en-US', { timeZone:'Asia/Manila', month:'short', day:'numeric', year:'numeric' });
 const time = date.toLocaleTimeString('en-US', { timeZone:'Asia/Manila', hour:'numeric', minute:'2-digit', hour12:true });
 return `${day} · ${time}`;
});
// Time left until the deadline, from the same clock the deadline check uses (the test clock when it is on).
const remaining = computed(() => {
 if (!info.value?.at || info.value.overdue || info.value.expired) return '';
 const minutes = Math.floor((info.value.at.getTime() - now.value) / 60000);
 if (minutes < 1) return 'Less than a minute left';
 const d = Math.floor(minutes / 1440), h = Math.floor(minutes % 1440 / 60), m = minutes % 60;
 return (d ? `${d} day${d === 1 ? '' : 's'} ${h} h` : h ? `${h} h ${m} min` : `${m} min`) + ' left';
});
const state = computed(() => info.value?.expired ? 'is-closed' : info.value?.overdue ? 'is-overdue' : 'is-open');
const nextStep = computed(() => {
 if(info.value?.expired)return props.owner ? 'This reservation is closed. The student can send a new request if the dates and room are still available. Review any cancellation reason or payment arrangement in Booking Details.' : 'Check the closure reason in Booking Details. If you still need accommodation, you can submit a new request with available dates or choose another room/property.';
 if(info.value?.overdue)return props.owner ? 'The deadline has passed. Refresh to check the final status before taking another action; an online payment already in progress may still need verification.' : 'The deadline has passed. Refresh to check the final status. If it expires, submit a new request or choose another room/property; do not assume the bed is still reserved.';
 if(props.booking?.status==='pending')return props.owner ? 'Approve or reject before the displayed deadline (24 hours after submission, or noon on check-in day if sooner). Without a response, the request expires automatically and the student must send a new request.' : 'Wait for the owner to approve or reject your request. If there is no response by this deadline, it expires automatically. You can then send a new request with available dates or choose another room/property. Do not pay before approval.';
 return props.owner ? 'The student must complete online payment before this deadline. If unpaid, the reservation expires after checkout verification and its dates are released. Contact the student if they need help.' : 'Complete online payment before this deadline to keep the reservation. If it expires unpaid, you can submit a new request if the dates remain available, or choose another room/property.';
});
let timer;
onMounted(() => { timer = setInterval(() => { now.value = bookingNow().getTime(); }, 30000); });
onUnmounted(() => clearInterval(timer));
</script>
<template>
  <div v-if="info" :class="['reservation-deadline', state]" role="status">
    <span class="rd-icon" aria-hidden="true"><i :class="['fa-solid', info.expired ? 'fa-circle-xmark' : info.overdue ? 'fa-triangle-exclamation' : 'fa-clock']"></i></span>
    <div v-if="info.expired" class="rd-body"><strong class="rd-closed">{{ info.label }}</strong><small class="rd-next-step"><strong>What to do next:</strong> {{ nextStep }}</small></div>
    <div v-else class="rd-body">
      <span class="rd-label">{{ info.label }}</span>
      <span class="rd-time-row"><time :datetime="info.at.toISOString()">{{ formatted }}</time><span v-if="remaining" class="rd-remaining">{{ remaining }}</span></span>
      <small class="rd-next-step"><strong>What to do next:</strong> {{ nextStep }}</small>
    </div>
  </div>
</template>
<style scoped>
.reservation-deadline{display:flex;align-items:flex-start;gap:10px;max-width:400px;margin-top:10px;padding:10px 12px;border:1px solid;border-radius:10px;font-size:12px;line-height:1.55;text-align:left;white-space:normal;}
.reservation-deadline.is-open{background:#fffbeb;border-color:#fde68a;}
.reservation-deadline.is-overdue,.reservation-deadline.is-closed{background:#fef2f2;border-color:#fecaca;}
.rd-icon{display:grid;place-items:center;flex-shrink:0;width:28px;height:28px;border-radius:50%;font-size:12px;}
.is-open .rd-icon{background:#fef3c7;color:#b45309;}
.is-overdue .rd-icon,.is-closed .rd-icon{background:#fee2e2;color:#b91c1c;}
.rd-body{display:flex;flex-direction:column;min-width:0;}
.rd-label{font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#b45309;}
.is-overdue .rd-label{color:#b91c1c;}
.rd-time-row{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;margin-top:2px;}
.rd-time-row time{font-size:13px;font-weight:700;color:#0f2a4f;}
.rd-remaining{display:inline-flex;padding:1px 8px;border-radius:999px;background:#fef3c7;color:#b45309;font-size:11px;font-weight:650;}
.rd-body small{display:block;margin-top:7px;font-size:12px;line-height:1.65;color:#27476d;}.rd-next-step strong{color:#102e50;font-weight:700;}
.rd-closed{padding-top:4px;font-size:12.5px;font-weight:650;color:#991b1b;}
</style>
