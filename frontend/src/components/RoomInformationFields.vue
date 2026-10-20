<script setup>
import { ref, watch, onBeforeUnmount, useId } from 'vue';
import { getImageUrl } from '../config/api.js';
const props = defineProps({ modelValue: { type: Object, required: true }, isNew: Boolean });
const emit = defineEmits(['update:modelValue']);
const floorOptionsId = useId();
const descriptionHelpId = useId();
const customAmenity = ref({ amenities_free: '', amenities_paid: '' });
const groups = [{ key: 'amenities_free', title: 'Free amenities', icon: 'fa-gift', note: 'Included in the room rent.' }, { key: 'amenities_paid', title: 'Paid amenities', icon: 'fa-cart-shopping', note: 'Available for an additional charge.' }];
const notice = ref('');
const choices = ['Bed frame', 'Mattress', 'Study desk', 'Chair', 'Wardrobe', 'Electric fan', 'Air conditioning', 'Private bathroom', 'Wi-Fi', 'Balcony'];
const amenityChoices = (key) => [...new Set([...choices, ...props.modelValue[key]])];
const update = (key, value) => emit('update:modelValue', { ...props.modelValue, [key]: value });
const toggle = (key, amenity, selected) => {
  const other = key === 'amenities_free' ? 'amenities_paid' : 'amenities_free';
  emit('update:modelValue', { ...props.modelValue,
    [key]: selected ? [...props.modelValue[key], amenity] : props.modelValue[key].filter(a => a !== amenity),
    [other]: selected ? props.modelValue[other].filter(a => a.toLowerCase() !== amenity.toLowerCase()) : props.modelValue[other]
  });
};
const addAmenity = (key) => {
  const label = customAmenity.value[key].trim();
  if (label && !props.modelValue[key].some(a => a.toLowerCase() === label.toLowerCase()) && props.modelValue.amenities_free.length + props.modelValue.amenities_paid.length < 30) toggle(key, label, true);
  customAmenity.value[key] = '';
};
const previews = ref([]);
watch(() => props.modelValue.files, (files) => {
  previews.value.forEach(url => URL.revokeObjectURL(url));
  previews.value = files.map(file => URL.createObjectURL(file));
}, { immediate: true });
onBeforeUnmount(() => previews.value.forEach(url => URL.revokeObjectURL(url)));
const selectPhotos = (event) => {
  const files = [...(event.target.files || [])]; event.target.value = '';
  if (files.some(file => file.size > 10 * 1024 * 1024)) { notice.value = 'Each photo must be 10 MB or smaller.'; return; }
  if (files.length + props.modelValue.files.length + props.modelValue.existing_photos.length > 6) { notice.value = 'A room can have up to 6 photos. Remove a photo before adding more.'; return; }
  notice.value = ''; update('files', [...props.modelValue.files, ...files]);
};
</script>
<template>
  <section class="room-information-fields border-t border-slate-200 pt-5 space-y-5">
    <label class="block text-sm font-semibold text-slate-700">Floor / storey
      <input :value="modelValue.floor_label" @input="update('floor_label', $event.target.value)" :list="floorOptionsId" maxlength="60" required placeholder="e.g. Ground floor or 2nd floor" class="mt-2 w-full p-3 rounded-xl border border-slate-300 bg-white font-normal" />
    </label>
    <datalist :id="floorOptionsId"><option>Basement</option><option>Ground floor</option><option>2nd floor</option><option>3rd floor</option><option>4th floor</option><option>5th floor</option></datalist>
    <label class="block text-sm font-semibold text-slate-700">Room description <span class="font-normal text-slate-500">(optional)</span>
      <textarea :value="modelValue.description" @input="update('description', $event.target.value)" maxlength="1000" rows="3" placeholder="e.g. A bright, well-ventilated room with a quiet study area." class="mt-2 w-full p-3 rounded-xl border border-slate-300 bg-white font-normal text-sm resize-y" :aria-describedby="descriptionHelpId" />
      <span :id="descriptionHelpId" class="block text-xs font-normal text-slate-500 mt-1">Describe what makes this room unique. Floor and amenities are listed separately. Up to 1,000 characters.</span>
    </label>
    <div>
      <h3 class="text-sm font-semibold text-slate-700">Room amenities</h3>
      <p class="text-xs text-slate-500 mt-1 mb-3">Choose Free or Paid for each amenity available in this room. Selecting it in one category moves it out of the other.</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <fieldset v-for="group in groups" :key="group.key" :class="['room-amenity-group', group.key]">
          <legend class="room-amenity-legend"><i :class="['fa-solid',group.icon]" aria-hidden="true"></i>{{ group.title }}<span>{{ modelValue[group.key].length }}</span></legend>
          <p class="text-xs text-slate-500 mb-3">{{ group.note }}</p>
          <div class="space-y-2">
            <label v-for="amenity in amenityChoices(group.key)" :key="amenity" class="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" :checked="modelValue[group.key].includes(amenity)" @change="toggle(group.key, amenity, $event.target.checked)" class="rounded border-slate-300 text-blue-600" />{{ amenity }}
            </label>
          </div>
          <div class="flex gap-2 mt-3"><input v-model="customAmenity[group.key]" maxlength="80" :aria-label="'Other ' + group.title.toLowerCase()" placeholder="Other amenity" @keydown.enter.prevent="addAmenity(group.key)" class="min-w-0 flex-1 p-2 border border-slate-300 rounded-lg text-sm" /><button type="button" @click="addAmenity(group.key)" class="px-3 rounded-lg border border-slate-300 text-sm font-semibold">Add</button></div>
        </fieldset>
      </div>
    </div>
    <div>
      <p class="text-sm font-semibold text-slate-700"><i class="fa-regular fa-images room-photos-icon" aria-hidden="true"></i>Actual room photos</p>
      <p class="text-xs text-slate-500 mt-1 mb-3">Up to 6 photos, 10 MB each. {{ isNew ? 'At least one photo is required for a new room.' : 'Existing rooms can be updated while photos are being completed.' }}</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        <div v-for="(photo, index) in modelValue.existing_photos" :key="photo" class="relative"><img :src="getImageUrl(photo)" alt="Saved room photo" class="w-full h-24 object-cover rounded-lg" /><button type="button" @click="update('existing_photos', modelValue.existing_photos.filter((_, i) => i !== index))" class="room-photo-remove absolute right-1 top-1 bg-white rounded px-2 py-1 text-xs font-semibold" :aria-label="'Remove saved photo ' + (index + 1)">Remove</button></div>
        <div v-for="(preview, index) in previews" :key="preview" class="relative"><img :src="preview" alt="New room photo preview" class="w-full h-24 object-cover rounded-lg" /><button type="button" @click="update('files', modelValue.files.filter((_, i) => i !== index))" class="room-photo-remove absolute right-1 top-1 bg-white rounded px-2 py-1 text-xs font-semibold" :aria-label="'Remove new photo ' + (index + 1)">Remove</button></div>
      </div>
      <label class="room-photo-upload">
        <span><i class="fa-solid fa-arrow-up-from-bracket" aria-hidden="true"></i>Choose photos</span>
        <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif,image/gif" @change="selectPhotos" />
      </label>
      <p class="text-xs text-slate-500 mt-2" aria-live="polite">{{ modelValue.existing_photos.length + previews.length }} of 6 photos selected</p>
      <p v-if="notice" role="alert" class="text-sm text-red-600 mt-2">{{ notice }}</p>
    </div>
  </section>
</template>

<style scoped>
.room-information-fields{border-color:#e4edf8;}
.room-information-fields .text-slate-500{color:#526b89;line-height:1.65;}
.room-amenity-group{min-width:0;padding:16px;border:1px solid #dce7f4;border-radius:13px;background:#fbfdff;}
.room-amenity-legend{display:flex;align-items:center;gap:8px;padding:0 6px;font-size:13px;font-weight:700;color:#25466d;}
.room-amenity-legend>i{color:#2563eb;font-size:16px;}
.room-amenity-legend>span{display:inline-grid;place-items:center;min-width:22px;height:22px;border-radius:999px;background:#e6efff;color:#1d4ed8;font-size:11px;}
/* Same colours as the room summary: free amenities green, paid amenities orange. */
.amenities_free .room-amenity-legend>i{color:#18ad72;}.amenities_free .room-amenity-legend>span{background:#dcfce7;color:#15803d;}
.amenities_paid .room-amenity-legend>i{color:#ed9220;}.amenities_paid .room-amenity-legend>span{background:#ffedd5;color:#c2410c;}
.room-amenity-group label{min-height:32px;cursor:pointer;line-height:1.45;}
.room-amenity-group input[type=checkbox]{width:16px;height:16px;flex-shrink:0;accent-color:#2563eb;}
.room-amenity-group input[type=text],.room-amenity-group input:not([type]){min-height:40px;background:white;}
.room-amenity-group button{min-height:40px;background:#eff6ff;border-color:#bfdbfe;color:#1d4ed8;cursor:pointer;}
.room-amenity-group button:hover{background:#dbeafe;}
.room-photos-icon{color:#2563eb;margin-right:9px;}
.room-information-fields :is(button,input):focus-visible{outline:3px solid #93c5fd;outline-offset:2px;}
@media(max-width:639px){.room-amenity-group label{min-height:38px;}.room-amenity-group button{min-height:44px;}}

.room-photo-upload{display:block;border:1px dashed #b7cdef;border-radius:12px;background:#f6faff;padding:14px;color:#25466d;}
.room-photo-upload>span{display:flex;align-items:center;gap:9px;font-size:13px;margin-bottom:10px;}
.room-photo-upload>span>i{color:#2563eb;}
.room-photo-upload input[type=file]{position:static;display:block;width:100%;height:auto;min-height:34px;max-width:100%;clip:auto;clip-path:none;white-space:normal;overflow:visible;font-size:12px;color:#46617f;cursor:pointer;}
.room-photo-upload input[type=file]::file-selector-button{padding:7px 11px;margin-right:10px;font-size:12px;border-radius:7px;cursor:pointer;}

.room-photo-upload{padding:12px;}
.room-photo-upload>span{font-size:12px;margin-bottom:8px;}
.room-information-fields .room-photo-remove{min-height:28px;padding:4px 8px;font-size:11px;line-height:1.4;color:#9f1239;background:#fff1f2;border:1px solid #fecdd3;border-radius:6px;cursor:pointer;box-shadow:0 1px 3px rgb(15 23 42 / .08);}
.room-information-fields .room-photo-remove:hover{background:#ffe4e6;color:#881337;}
.room-amenity-group button{min-height:34px;padding:6px 10px;font-size:12px;}
.room-information-fields button,.room-photo-upload input[type=file]::file-selector-button{transition:background-color 160ms ease,color 160ms ease,border-color 160ms ease,box-shadow 160ms ease;}
@media(pointer:coarse){.room-information-fields .room-photo-remove,.room-amenity-group button,.room-photo-upload input[type=file]{min-height:44px;}}
@media(prefers-reduced-motion:reduce){.room-information-fields button,.room-photo-upload input[type=file]::file-selector-button{transition:none;}}
/* Phone / PWA only: amenity checkboxes in two columns */
@media(max-width:639px){
.room-amenity-group{padding:12px}
.room-amenity-group>.space-y-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:2px 10px}
.room-amenity-group>.space-y-2>label{margin:0!important;min-height:34px;font-size:13px;overflow-wrap:anywhere}
}
</style>
