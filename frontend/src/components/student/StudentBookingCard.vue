<script setup>
// One booking as a card: house, dates, room and duration, price and payment, and the main action.
// Used by My Bookings on every screen size.
import {
  formatMoney, formatShortDate, formatCheckInShort, formatCheckOutShort, monthsLabel,
  bookingAddress, bookingStatusBadge, paymentStatusBadge, BADGE_TONE_CLASSES, needsOnlinePayment
} from '../../utils/studentBookings.js';

defineProps({ booking: { type: Object, required: true } });

const cancellationPrompt = booking => { try { const review=JSON.parse(booking.cancellation_review || 'null'); return review?.status==='pending' ? 'An earlier cancellation request did not cancel this reservation. See booking details.' : review?.status==='resolved' ? 'View the cancellation reason in booking details.' : ''; } catch { return ''; } };
const badgeClass = (badge) => BADGE_TONE_CLASSES[badge.tone] || BADGE_TONE_CLASSES.slate;
const methodLabel = (b) => b.payment_method === 'paymongo' ? 'Online' : (b.payment_method === 'cash' ? 'Cash' : 'Not recorded');
const methodIcon = (b) => b.payment_method === 'paymongo' ? 'fa-credit-card' : b.payment_method === 'cash' ? 'fa-money-bill-wave' : 'fa-circle-question';
</script>

<template>
  <article class="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_18px_rgb(15_47_102/.07)] p-4 flex flex-col">
    <!-- House -->
    <div>
      <div class="min-w-0 flex-1">
        <!-- House name with the status on the right of the same row -->
        <div class="flex items-start justify-between gap-3">
          <h2 class="min-w-0 text-[16.5px] font-extrabold text-slate-900 leading-snug break-words">{{ booking.house_name }}</h2>
          <span class="shrink-0 mt-0.5 px-2.5 py-1 rounded-lg text-[11px] font-bold leading-tight text-right" :class="badgeClass(bookingStatusBadge(booking))">{{ bookingStatusBadge(booking).label }}</span>
        </div>
        <p class="mt-1 text-[12.5px] text-slate-500 flex items-start gap-1.5 leading-snug">
          <i class="fa-solid fa-location-dot text-[#1e4b8f] text-[11px] mt-[3px]" aria-hidden="true"></i>
          <span class="break-words">{{ bookingAddress(booking) }}</span>
        </p>
      </div>
    </div>

    <div class="mt-4 divide-y divide-slate-100 border-t border-slate-100">
      <!-- Dates -->
      <div class="py-3.5 grid grid-cols-2">
        <div class="flex items-start gap-2.5 pr-3 border-r border-slate-100">
          <i class="fa-regular fa-calendar text-[17px] text-slate-700 mt-0.5" aria-hidden="true"></i>
          <div class="min-w-0">
            <p class="text-[12px] text-slate-500">Check-in</p>
            <p class="text-[14px] font-bold text-slate-900">{{ formatCheckInShort(booking) }}</p>
          </div>
        </div>
        <div class="flex items-start gap-2.5 pl-4">
          <i class="fa-regular fa-calendar text-[17px] text-slate-700 mt-0.5" aria-hidden="true"></i>
          <div class="min-w-0">
            <p class="text-[12px] text-slate-500">Check-out</p>
            <p class="text-[14px] font-bold text-slate-900">{{ formatCheckOutShort(booking) }}</p>
          </div>
        </div>
      </div>

      <!-- Room, duration, booked on -->
      <div class="py-3.5 flex items-start gap-2.5">
        <i class="fa-solid fa-door-closed text-[16px] text-slate-700 mt-0.5 w-[17px] text-center" aria-hidden="true"></i>
        <div class="min-w-0 flex-1">
          <p class="text-[12px] text-slate-500">Room &amp; duration</p>
          <p class="text-[14px] font-bold text-slate-900">Room {{ booking.room_number }} · {{ monthsLabel(booking.months) }}</p>
        </div>
        <span class="text-right shrink-0">
          <span class="block text-[12px] text-slate-500">Booked on</span>
          <span class="block text-[13px] font-semibold text-slate-800">{{ formatShortDate(booking.booking_date) }}</span>
        </span>
      </div>

      <!-- Price & payment -->
      <div class="py-3.5 flex items-start gap-2.5">
        <i class="fa-regular fa-credit-card text-[16px] text-slate-700 mt-0.5 w-[17px] text-center" aria-hidden="true"></i>
        <div class="min-w-0 flex-1">
          <p class="text-[12px] text-slate-500">Total price</p>
          <p class="text-[15px] font-bold text-slate-900">₱{{ formatMoney(booking.amount) }}</p>
          <p class="text-[12px] text-slate-500">₱{{ formatMoney(booking.monthly_rent) }}/month</p>
        </div>
        <div class="shrink-0 flex flex-col items-end gap-1.5">
          <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.06em]" :class="badgeClass(paymentStatusBadge(booking))">{{ paymentStatusBadge(booking).label }}</span>
          <span class="bk-method" :class="booking.payment_method"><i :class="['fa-solid', methodIcon(booking)]" aria-hidden="true"></i>{{ methodLabel(booking) }}</span>
        </div>
      </div>
    </div>

    <router-link v-if="cancellationPrompt(booking)" :to="'/student/bookings/' + booking.id" class="mt-1 flex items-start gap-2.5 rounded-xl bg-blue-50/70 px-3.5 py-3 text-[12.5px] text-slate-600 leading-snug">
      <i class="fa-solid fa-circle-info text-blue-600 text-[15px] mt-px" aria-hidden="true"></i>
      <span>{{ cancellationPrompt(booking) }}</span>
    </router-link>

    <div class="h-3 shrink-0" aria-hidden="true"></div>
    <router-link
      :to="`/student/bookings/${booking.id}`"
      class="mt-auto h-12 w-full rounded-xl flex items-center justify-center gap-2 text-white text-[15px] font-bold transition"
      :class="needsOnlinePayment(booking) ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-700'"
    >{{ needsOnlinePayment(booking) ? 'Pay now' : 'View booking details' }} <i class="fa-solid fa-chevron-right text-[12px]" aria-hidden="true"></i></router-link>
  </article>
</template>

<style scoped>
.bk-method { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 999px; border: 1px solid #dbe4ef; background: #f8fafc; color: #475569; font-size: 11px; font-weight: 700; line-height: 1.5; white-space: nowrap; }
.bk-method i { font-size: 10px; }
.bk-method.paymongo { border-color: #bfdbfe; background: #eff6ff; color: #1d4ed8; }
.bk-method.cash { border-color: #bbf7d0; background: #f0fdf4; color: #15803d; }
</style>
