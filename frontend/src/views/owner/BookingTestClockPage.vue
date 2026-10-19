<script setup>
import OwnerNav from '../../components/partials/OwnerNav.vue';
import BookingTestCalendar from '../../components/BookingTestCalendar.vue';
import '../../styles/management.css';
import '../../styles/admin-theme.css';
import '../../styles/owner-pages.css';
</script>
<template><div class="management-page owner-page"><OwnerNav /><main id="management-content" tabindex="-1"><h1 class="clock-page-title">Booking test calendar</h1><p class="clock-page-description">Move booking time forward to test deadlines, automatic stay starts, move-in reviews and checkouts without waiting. Each booking's key dates appear on the calendar.</p><BookingTestCalendar /><router-link to="/owner/bookings" class="clock-page-back">Back to bookings &rarr;</router-link></main></div></template>
<style scoped>.clock-page-title{font-size:24px;font-weight:700;color:#193b63;margin:0 0 8px}.clock-page-description{font-size:14px;color:#526b89;line-height:1.65;max-width:760px}.clock-page-back{display:inline-flex;align-items:center;min-height:44px;color:#215bcc;font-size:13px;font-weight:600}</style>
