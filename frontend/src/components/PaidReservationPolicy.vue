<script setup>
// Owner-side notice for a paid reservation. Information only: paid cancellation, refunds and disputes are outside
// the platform's scope, so this component has no actions.
defineProps({booking:Object});
</script>
<template>
 <p class="paid-policy"><strong>Paid reservation · cannot be cancelled here</strong> Once a payment is verified, neither you nor the student can cancel this reservation through the platform. Handle exceptional cancellation or payment concerns directly with the student, outside the platform. This does not mean payments are non-refundable.</p>
</template>
<style scoped>.paid-policy{margin:8px 0;color:#23456c;font-size:13px;line-height:1.7;max-width:540px}.paid-policy strong{display:block;color:#102e50;font-weight:700}</style>
