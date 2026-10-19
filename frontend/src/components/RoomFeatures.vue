<script setup>
import { computed, ref } from 'vue';
import { roomList } from '../utils/roomDetails.js';
import { getImageUrl } from '../config/api.js';
const props = defineProps({ room: { type: Object, required: true }, compact: Boolean, showCategories: Boolean });
const amenityGroups = computed(() => [{ title: 'Free amenities', items: roomList(props.room.amenities_free ?? props.room.amenities) }, { title: 'Paid amenities', items: roomList(props.room.amenities_paid) }]);
const amenityCount = computed(() => amenityGroups.value.reduce((total, group) => total + group.items.length, 0));
const photos = computed(() => roomList(props.room.photos));
const viewer = ref(null), index = ref(0);
const open = () => { index.value = 0; viewer.value.showModal(); };
</script>
<template>
  <div class="mt-3 space-y-2 text-left font-normal normal-case tracking-normal">
    <p class="text-xs text-slate-600"><span class="font-semibold">Floor:</span> {{ room.floor_label || 'Not specified' }}</p>
    <details v-if="compact && amenityCount" @click.stop>
      <summary class="text-xs text-slate-600 cursor-pointer">Room amenities ({{ amenityCount }})</summary>
      <div v-for="group in amenityGroups" :key="group.title" class="mt-2"><p class="text-xs font-semibold text-slate-700">{{ group.title }}</p><div v-if="group.items.length" class="flex flex-wrap gap-1 mt-1"><span v-for="amenity in group.items" :key="amenity" class="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-700">{{ amenity }}</span></div><p v-else class="text-xs text-slate-500">None listed.</p></div>
    </details>
    <template v-else-if="amenityCount || showCategories"><div v-for="group in amenityGroups" :key="group.title"><p class="text-xs font-semibold text-slate-700">{{ group.title }}</p><div v-if="group.items.length" class="flex flex-wrap gap-1 mt-1"><span v-for="amenity in group.items" :key="amenity" class="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-700">{{ amenity }}</span></div><p v-else class="text-xs text-slate-500">None listed.</p></div></template>
    <p v-else class="text-xs text-slate-500">Room amenities not specified.</p>
    <button v-if="photos.length" type="button" @click.prevent.stop="open" class="text-xs font-semibold text-blue-700 underline underline-offset-2 whitespace-nowrap">View room photos ({{ photos.length }})</button>
    <p v-else-if="!compact" class="text-xs text-slate-500">Room photos not provided yet.</p>
    <dialog ref="viewer" class="room-photo-dialog p-0 rounded-xl bg-slate-950 text-white" @click.stop @cancel.stop>
      <div class="flex items-center justify-between p-4 gap-4"><span class="text-sm">Room {{ room.room_number }} / Photo {{ index + 1 }} of {{ photos.length }}</span><button type="button" @click.prevent.stop="viewer.close()" class="px-3 py-2 rounded border border-slate-500 text-sm">Close</button></div>
      <img v-if="photos.length" :src="getImageUrl(photos[index])" :alt="'Room ' + room.room_number + ', photo ' + (index + 1)" class="room-photo-image" />
      <div v-if="photos.length > 1" class="flex items-center justify-between p-4"><button type="button" @click.prevent.stop="index = (index - 1 + photos.length) % photos.length" class="px-4 py-2 border border-slate-500 rounded">Previous</button><button type="button" @click.prevent.stop="index = (index + 1) % photos.length" class="px-4 py-2 border border-slate-500 rounded">Next</button></div>
    </dialog>
  </div>
</template>
<style scoped>
.room-photo-dialog { width: min(960px, 94vw); max-height: 92dvh; }
.room-photo-dialog::backdrop { background: rgb(15 23 42 / 0.8); }
.room-photo-image { width: 100%; height: min(65dvh, 700px); object-fit: contain; }
</style>
