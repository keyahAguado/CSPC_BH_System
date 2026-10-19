<script setup>
import { computed } from 'vue';
import '../styles/owner-badges.css';
import { PAID_RESERVATION_POLICY } from '../utils/paidReservationPolicy.js';
const props = defineProps({ booking: Object, plain: Boolean, owner: Boolean });
const review = computed(() => { try { return JSON.parse(props.booking?.cancellation_review || 'null'); } catch { return null; } });
const pending = computed(() => review.value?.status === 'pending');
const explanation = computed(() => {
 if(pending.value)return 'This earlier cancellation request did not cancel the reservation, and the booked dates remain held. '+PAID_RESERVATION_POLICY;
 if(review.value?.kind==='unpaid_owner_cancellation')return props.owner ? 'You cancelled this unpaid reservation and released its dates. The student was notified of your reason. No payment was collected.' : 'The owner cancelled this unpaid reservation and released its dates. No payment was collected. Read the reason below; you may choose another room or send a new request if available.';
 return props.owner ? (review.value?.disposition==='refunded' ? 'You recorded an external refund and finalized cancellation. Keep the refund reference for your records.' : 'You recorded the student agreement to cancel without a refund. The reservation dates were released.') : (review.value?.disposition==='refunded' ? 'The owner recorded an external refund. Check the reference below and contact the owner if you have not received the payment.' : 'The owner recorded an agreed cancellation without a refund. Check the agreement details below and contact the owner if they do not match your discussion.');
});
</script>
<template>
  <section v-if="review && review.status !== 'withdrawn'" :class="['review-summary', pending ? 'is-open' : 'is-done', { plain }]">
    <header v-if="!plain">
      <span class="rs-icon" aria-hidden="true"><i class="fa-solid fa-scale-balanced"></i></span>
      <strong>{{ review.kind==='unpaid_owner_cancellation' ? 'Reservation cancelled by owner' : pending ? 'Earlier cancellation request · reservation still active' : 'Cancellation completed' }}</strong>
      <span :class="['o-badge', 'small', pending ? 'amber' : 'slate']"><i :class="['fa-solid', pending ? 'fa-hourglass-half' : 'fa-circle-check']" aria-hidden="true"></i>{{ pending ? 'Dates remain held' : 'Cancellation confirmed' }}</span>
    </header>
    <p class="rs-lead">{{ explanation }}</p>
    <dl>
      <div class="rs-reason"><dt>Owner's reason</dt><dd><strong>{{ review.reason }}</strong></dd></div>
      <div v-if="review.reference"><dt>{{ review.disposition === 'refunded' ? 'Refund reference' : 'Agreement details' }}</dt><dd>{{ review.reference }}</dd></div>
    </dl>
  </section>
</template>
<style scoped>
.review-summary{max-width:560px;margin:12px 0;padding:12px 14px;border:1px solid;border-radius:10px;font-size:12.5px;line-height:1.6;text-align:left;overflow-wrap:anywhere;}
.review-summary.is-open{background:#fffbeb;border-color:#fde68a;}
.review-summary.is-done{background:#f8fafc;border-color:#e2e8f0;}
.review-summary header{display:flex;align-items:center;flex-wrap:wrap;gap:8px;}
.review-summary header strong{font-size:13px;font-weight:700;color:#0f2a4f;}
.rs-icon{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;font-size:12px;}
.is-open .rs-icon{background:#fef3c7;color:#b45309;}
.is-done .rs-icon{background:#e2e8f0;color:#475569;}
.rs-lead{margin:8px 0 0;color:#334a66;}
.review-summary dl{display:grid;gap:4px;margin:8px 0 0;padding-top:8px;border-top:1px dashed #e2e8f0;}
.review-summary dl>div{display:grid;grid-template-columns:120px minmax(0,1fr);gap:10px;}
.review-summary dt{color:#5d6f88;}
.review-summary dd{margin:0;font-weight:600;color:#0f2a4f;}
.review-summary .rs-reason{padding:10px 12px;border-radius:8px;background:#fff;border:1px solid #e5d7a7}.rs-reason dd strong{font-size:13px;font-weight:700;white-space:pre-wrap;line-height:1.6}
/* Inside a page card: no outer frame; reason and reference side by side */
.review-summary.plain{max-width:none;margin:0;}
.review-summary.plain .rs-lead{margin-top:0;}
.review-summary.plain dl{grid-template-columns:1fr 1fr;gap:12px;}
.review-summary.plain dl>div{grid-template-columns:1fr;gap:2px;}
@media(max-width:480px){.review-summary dl>div{grid-template-columns:1fr;gap:0;}.review-summary.plain dl{grid-template-columns:1fr;}}
</style>
