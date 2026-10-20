<script setup>
defineProps({ room: { type: Object, required: true }, archived: Boolean, busy: Boolean });
const emit = defineEmits(['edit','archive','restore']);
</script>
<template>
<div class="owner-room-actions">
            <template v-if="!archived"><router-link :to="'/owner/rooms/details/' + room.id" class="relative bg-[#2a528a] text-white text-[12px] font-semibold px-4 py-2 rounded-lg uppercase tracking-wide hover:bg-black transition shadow-sm inline-flex items-center management-button management-button-primary">Details<span v-if="room.pending_request_count > 0" class="owner-room-pending" :aria-label="room.pending_request_count + ' pending requests'">{{ room.pending_request_count }}</span></router-link><button type="button" @click="emit('edit',room)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12px] font-semibold px-3 py-2 rounded-lg uppercase tracking-wide transition cursor-pointer management-button">Edit</button><button type="button" @click="emit('archive',room)" class="bg-amber-50 hover:bg-amber-500 hover:text-white text-amber-600 border border-amber-200/60 text-[12px] font-semibold px-3 py-2 rounded-lg uppercase tracking-wide transition cursor-pointer management-button">Archive</button></template>
            <button v-else type="button" :disabled="busy" @click="emit('restore',room)" class="bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold px-4 py-2 rounded-lg uppercase tracking-wide transition disabled:opacity-50 management-button"><i class="fa-solid fa-rotate-left mr-2" aria-hidden="true"></i>Restore room</button>
          </div>

</template>
<style scoped>
.owner-room-actions {display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:nowrap;}
.owner-room-actions .management-button {white-space:nowrap;min-height:34px;letter-spacing:normal;text-transform:none;font-size:11px;padding:6px 10px;transition:background-color 160ms ease,color 160ms ease,border-color 160ms ease,box-shadow 160ms ease;justify-content:center;}
.owner-room-pending {position:absolute;top:-8px;right:-7px;min-width:18px;height:18px;padding:0 4px;display:grid;place-items:center;border-radius:50%;border:2px solid white;background:#ef4444;color:white;font-size:10px;}
@media(max-width:1023px){.owner-room-actions {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}.owner-room-actions .management-button{min-height:44px;padding:10px 6px;font-size:12px;}.owner-room-actions>button:only-child{grid-column:1/-1;}}
@media(prefers-reduced-motion:reduce){.owner-room-actions .management-button{transition:none;}}
@media(max-width:639px){.owner-room-actions{gap:6px}.owner-room-actions .management-button{min-height:36px;padding:7px 6px;font-size:12px}}
</style>
