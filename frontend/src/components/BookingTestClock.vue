<script setup>
import { computed } from 'vue';
import { simulatedBookingTime } from '../utils/bookingClock.js';
// Compact status for pages that show bookings. The backend sends the test time only while the test clock is on.
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const time = computed(() => simulatedBookingTime.value ? new Date(simulatedBookingTime.value) : null);
const label = computed(() => time.value ? time.value.toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const simulated = computed(() => !!time.value && Math.abs(time.value.getTime() - Date.now()) > 120000);
</script>
<template>
  <aside v-if="local && time" class="test-clock-bar" aria-label="Booking test clock">
    <i class="fa-regular fa-calendar" aria-hidden="true"></i>
    <span><strong>{{ simulated ? 'Test time' : 'Test calendar on' }}:</strong> {{ label }}</span>
    <router-link to="/owner/testing-clock">Open test calendar</router-link>
  </aside>
</template>
<style scoped>
.test-clock-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:12px 0 20px;padding:10px 14px;background:#f8fbff;border:1px solid #d6e4fb;border-radius:12px;color:#294665;font-size:13px}
.test-clock-bar i{color:#2563eb}.test-clock-bar strong{color:#193b63;font-weight:700}
.test-clock-bar a{margin-left:auto;color:#215bcc;font-weight:600;display:inline-flex;align-items:center;min-height:32px}
@media (pointer:coarse){.test-clock-bar a{min-height:44px}}
</style>
