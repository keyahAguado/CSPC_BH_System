<script setup>
import OwnerRoomActions from './OwnerRoomActions.vue';
import { computed } from 'vue';
import { getImageUrl } from '../config/api.js';
import { roomList } from '../utils/roomDetails.js';
const props = defineProps({ rooms: { type: Array, default: () => [] }, title: String, tone: String, archived: Boolean, busy: Boolean });
const emit = defineEmits(['edit','archive','restore']);
const beds = computed(() => props.rooms.reduce((sum,room) => sum + Number(room.capacity || 0), 0));
const photos = (room) => roomList(room.photos);
const vacant = (room) => Math.max(0,Number(room.capacity || 0)-Number(room.occupant_count || 0)-Number(room.reserved_count || 0));
const status = (room) => vacant(room) === 0 ? (Number(room.occupant_count || 0) >= Number(room.capacity) ? 'Full' : 'Reserved') : Number(room.occupant_count || 0) === 0 && !Number(room.reserved_count || 0) ? 'Vacant' : vacant(room) + ' available';
</script>
<template>
  <section class="owner-room-group">
    <header class="room-group-heading"><h2><span :class="['room-group-marker',tone]" aria-hidden="true"></span>{{ title }}</h2><p>{{ rooms.length }} rooms / {{ beds }} total beds</p></header>
    <div class="room-group-scroll" role="region" :aria-label="title + ' table'" tabindex="0">
      <table class="owner-room-table"><colgroup><col class="col-room" /><col class="col-floor" /><col class="col-rent" /><col class="col-occupancy" /><col class="col-status" /><col class="col-actions" /></colgroup>
        <thead><tr><th scope="col">Room</th><th scope="col">Floor</th><th scope="col">Monthly rent</th><th scope="col">Occupancy</th><th scope="col">Current status</th><th scope="col" class="room-actions-heading">Actions</th></tr></thead>
        <tbody><tr v-for="room in rooms" :key="room.id">
          <td><div class="owner-room-identity"><img v-if="photos(room).length" :src="getImageUrl(photos(room)[0])" :alt="'Room ' + room.room_number" class="owner-room-thumb" loading="lazy" /><span v-else class="owner-room-placeholder" aria-hidden="true"><i class="fa-solid fa-bed"></i></span><div><strong>{{ /^(room|bed|unit|cottage|house)\b/i.test(room.room_number) ? room.room_number : 'Room ' + room.room_number }}</strong><p>{{ Number(room.capacity) > 1 ? 'Shared room' : 'Single room' }} / <b>{{ room.capacity }} {{ Number(room.capacity) === 1 ? 'bed' : 'beds' }}</b></p></div></div></td>
          <td><span class="owner-room-floor">{{ room.floor_label || 'Not specified' }}</span></td>
          <td><p class="owner-room-rent"><strong>&#8369;{{ Number(room.price ?? 0).toLocaleString('en-PH', {maximumFractionDigits:2}) }}</strong><span> / month</span></p></td>
          <td><p class="owner-room-occupancy">{{ room.occupant_count || 0 }} / {{ room.capacity }} occupied<span v-if="Number(room.reserved_count)"> &middot; {{ room.reserved_count }} reserved today</span><small v-if="Number(room.upcoming_reserved_count)" class="block text-xs mt-1 text-blue-700">{{ room.upcoming_reserved_count }} upcoming reservation{{ Number(room.upcoming_reserved_count) === 1 ? '' : 's' }}</small></p></td>
          <td><span :class="['owner-room-status', archived ? 'archived' : status(room) === 'Vacant' ? 'available' : vacant(room) === 0 ? 'full' : vacant(room) === 1 ? 'limited' : 'available']">{{ archived ? 'Archived' : status(room) }}</span></td>
          <td><OwnerRoomActions :room="room" :archived="archived" :busy="busy" @edit="emit('edit',$event)" @archive="emit('archive',$event)" @restore="emit('restore',$event)" /></td>
        </tr></tbody>
      </table>
    </div>
    <div class="owner-room-mobile-list">
      <article v-for="room in rooms" :key="room.id" class="owner-room-mobile-card">
        <div class="owner-room-identity"><img v-if="photos(room).length" :src="getImageUrl(photos(room)[0])" :alt="'Room ' + room.room_number" class="owner-room-thumb" loading="lazy" /><span v-else class="owner-room-placeholder" aria-hidden="true"><i class="fa-solid fa-bed"></i></span><div><h3>{{ /^(room|bed|unit|cottage|house)\b/i.test(room.room_number) ? room.room_number : 'Room ' + room.room_number }}</h3><p>{{ Number(room.capacity) > 1 ? 'Shared room' : 'Single room' }} / <b>{{ room.capacity }} {{ Number(room.capacity) === 1 ? 'bed' : 'beds' }}</b></p></div></div>
        <dl class="owner-room-mobile-facts"><div><dt>Floor</dt><dd class="owner-room-floor">{{ room.floor_label || 'Not specified' }}</dd></div><div><dt>Monthly rent</dt><dd class="owner-room-rent"><strong>&#8369;{{ Number(room.price ?? 0).toLocaleString('en-PH', {maximumFractionDigits:2}) }}</strong><span> / month</span></dd></div><div><dt>Occupancy</dt><dd class="owner-room-occupancy">{{ room.occupant_count || 0 }} / {{ room.capacity }} occupied<span v-if="Number(room.reserved_count)"> &middot; {{ room.reserved_count }} reserved today</span><small v-if="Number(room.upcoming_reserved_count)" class="block text-xs mt-1 text-blue-700">{{ room.upcoming_reserved_count }} upcoming reservation{{ Number(room.upcoming_reserved_count) === 1 ? '' : 's' }}</small></dd></div><div><dt>Current status</dt><dd><span :class="['owner-room-status', archived ? 'archived' : status(room) === 'Vacant' ? 'available' : vacant(room) === 0 ? 'full' : vacant(room) === 1 ? 'limited' : 'available']">{{ archived ? 'Archived' : status(room) }}</span></dd></div></dl>
        <OwnerRoomActions :room="room" :archived="archived" :busy="busy" @edit="emit('edit',$event)" @archive="emit('archive',$event)" @restore="emit('restore',$event)" />
      </article>
    </div>
    <footer v-if="!archived" class="room-group-note">Current status shows beds today. Future availability depends on stay dates. Description and amenities are available in <b>Details</b>.</footer>
  </section>
</template>
<style scoped>
.owner-room-group {background:#fff;border:0;border-radius:15px;box-shadow:0 5px 18px rgb(22 54 94 / .035);overflow:hidden;}
.room-group-heading {display:flex;justify-content:space-between;align-items:center;gap:16px;padding:17px 20px;border-bottom:0;}.room-group-heading h2 {display:flex;align-items:center;gap:10px;color:#18304f;font-size:16px;font-weight:700;}.room-group-heading p {font-size:11px;color:#7c8da7;}.room-group-marker {height:19px;width:4px;border-radius:3px;background:#94a3b8;}.room-group-marker.female {background:#ec4899;}.room-group-marker.male {background:#60a5fa;}
.room-group-scroll {overflow-x:auto;}.room-group-scroll:focus-visible {outline:2px solid #93c5fd;outline-offset:-2px;}.owner-room-table {width:100%;min-width:1140px;border-collapse:collapse;table-layout:fixed;font-size:13px;}.col-room{width:26%;}.col-floor{width:12%;}.col-rent{width:14%;}.col-occupancy{width:14%;}.col-status{width:12%;}.col-actions{width:22%;}
.owner-room-table th {padding:11px 18px;text-align:left;color:#8191aa;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:.025em;background:#fafcff;border-bottom:1px solid #e5ecf5;}.owner-room-table td {padding:23px 20px;border-bottom:0;vertical-align:middle;}.owner-room-table tbody tr:last-child td {border-bottom:0;}.owner-room-table tbody tr:hover {background:#fcfdff;}
.owner-room-identity {display:flex;align-items:center;gap:16px;min-width:0;}.owner-room-identity>div {min-width:0;}.owner-room-identity strong {display:block;font-size:14px;font-weight:750;color:#172c49;overflow-wrap:anywhere;}.owner-room-identity p {font-size:12px;color:#7c8da7;margin-top:5px;}.owner-room-identity b {font-weight:650;color:#60738e;}.owner-room-thumb,.owner-room-placeholder {width:58px;height:58px;border-radius:8px;object-fit:cover;flex-shrink:0;}.owner-room-placeholder {display:grid;place-items:center;background:linear-gradient(135deg,#d8e7eb,#8caeb9);color:#fff;font-size:23px;}.owner-room-floor {font-size:13px;color:#283c57;overflow-wrap:anywhere;}.owner-room-description {font-size:11px;color:#8191aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.owner-room-muted {font-size:11px;color:#8191aa;}
.owner-room-amenities {display:flex;align-items:center;gap:5px;min-width:0;flex-wrap:wrap;}.owner-room-amenities>span {font-size:10px;color:#697f9e;border:1px solid #e0e7f0;background:#f6f8fb;padding:4px 6px;border-radius:999px;max-width:90px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.owner-room-more {color:#2563eb;font-size:10px;font-weight:700;padding:3px;}.owner-room-rent {display:flex;gap:3px;align-items:baseline;flex-wrap:wrap;}.owner-room-rent strong {font-size:13px;color:#172c49;font-weight:750;}.owner-room-rent>span {font-size:10px;color:#7c8da7;font-weight:600;}.owner-room-occupancy {font-family:inherit;font-size:13px;font-weight:400;color:#283c57;line-height:1.5;margin:0;}.owner-room-status {display:inline-block;margin-top:0;font-size:12px;font-weight:650;padding:6px 12px;border-radius:999px;}.owner-room-status.available {background:#eaf8f2;color:#08916a;}.owner-room-status.limited,.owner-room-status.full {background:#fff7e7;color:#b7790b;}.owner-room-status.archived {background:#f1f5f9;color:#64748b;}

.room-group-note {background:#fafcff;border-top:0;padding:12px 18px;font-size:11px;line-height:1.5;color:#8191aa;}.room-group-note strong,.room-group-note b {color:#314b6e;}
@media(max-width:767px){.room-group-heading{padding:16px;}.room-group-heading h2{font-size:15px;}.room-group-heading p{font-size:10px;}.room-group-note{padding:12px 16px;}}
 .owner-room-group :is(table,thead,tbody,tr,th,td) {border:0 !important;box-shadow:none;}
.owner-room-group .owner-room-table :is(th,td) {padding-left:20px !important;padding-right:20px !important;}
.owner-room-group .owner-room-table th.room-actions-heading {text-align:center !important;}
.owner-room-mobile-list {display:none;}
@media(max-width:1023px){
  .room-group-scroll {display:none;}
  .owner-room-mobile-list {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:0 16px 18px;}
  .owner-room-mobile-card {min-width:0;background:#f7f9fc;border-radius:12px;padding:18px;}
  .owner-room-identity h3 {font-size:15px;font-weight:750;color:#172c49;overflow-wrap:anywhere;}
  .owner-room-mobile-facts {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 14px;margin:22px 0;}
  .owner-room-mobile-facts>div {min-width:0;}
  .owner-room-mobile-facts dt {font-size:11px;font-weight:600;color:#657b98;margin-bottom:6px;}
  .owner-room-mobile-facts dd {overflow-wrap:anywhere;}
  .owner-room-status {padding:5px 9px;}
}
@media(max-width:639px){.owner-room-mobile-list {grid-template-columns:minmax(0,1fr);}.room-group-heading {align-items:flex-start;flex-wrap:wrap;gap:8px;}.owner-room-mobile-card {padding:18px;}}
</style>
