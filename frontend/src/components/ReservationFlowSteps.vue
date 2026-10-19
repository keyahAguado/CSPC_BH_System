<script setup>
defineProps({paymentMethod:String});
</script>
<template>
 <section class="reservation-flow-steps" aria-label="How your reservation works">
  <h4>How your reservation works</h4>
  <ol><li><strong>1. Request review</strong><p>The owner has up to 24 hours to respond, or until 12:00 noon on your check-in day if that is sooner. An unanswered request expires automatically.</p></li>
   <li v-if="paymentMethod==='paymongo'"><strong>2. Pay online after approval</strong><p>Complete the upfront payment within 24 hours of approval, or by the end of your check-in day if that comes first. Payment secures the reserved bed; an unpaid online reservation expires. Once your payment is verified, the reservation cannot be cancelled through the platform; exceptional concerns are handled directly with the owner, outside the platform. This does not mean payments are non-refundable.</p></li>
   <li v-else><strong>2. Keep your approved reservation</strong><p>Cash is due when you move in. Your approved cash reservation does not expire just because payment has not yet been collected.</p></li>
   <li><strong>3. Your booked stay starts</strong><p>{{ paymentMethod==='cash' ? 'On the booked check-in date, your bed is held and your stay starts automatically. The owner confirms your arrival when you move in. Pay cash to the owner at move-in; it remains unpaid until collection is recorded.' : 'After verified payment, your stay starts automatically on the booked check-in date. The owner confirms your arrival when you move in; no duplicate payment is needed.' }}</p></li>
   <li><strong>4. Keep your booked checkout date</strong><p>Arriving late does not extend the booked dates. The owner records checkout; extensions must fit around other reservations. The owner may cancel an unpaid cash no-show after the check-in day. A paid reservation cannot be cancelled through the platform.</p></li></ol>
 </section>
</template>
<style scoped>.reservation-flow-steps{padding:16px;border:1px solid #dce7f5;border-radius:12px;background:#f8fbff;margin-top:16px;text-align:left;}.reservation-flow-steps h4{font-size:13px;font-weight:750;color:#193b65;margin-bottom:12px;}.reservation-flow-steps ol{display:grid;gap:12px;list-style:none;}.reservation-flow-steps strong{font-size:12px;color:#25466d;}.reservation-flow-steps p{font-size:11px;color:#46617f;line-height:1.8;margin-top:3px;}</style>
