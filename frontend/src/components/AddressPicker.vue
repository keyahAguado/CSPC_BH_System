<script setup>
// Home address picker: Region → Province → City/Municipality → Barangay (local PSGC lists) + street.
// v-model is the composed text address, saved in the same column as before. A saved address
// (including older free-typed ones) is shown as-is until the user chooses to change it.
import { ref, computed, watch } from 'vue';
import DropdownSelect from './DropdownSelect.vue';
import { getRegions, getProvinces, getCitiesByRegion, getCities, getBarangays } from '../utils/psgc.js';

const props = defineProps({
  modelValue: { type: String, default: '' },
  idPrefix: { type: String, default: 'address' },
  invalid: { type: Boolean, default: false },
  // Matches each page's input styling.
  fieldClass: { type: String, default: 'w-full bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:bg-white focus:border-blue-500 outline-none transition' },
  labelClass: { type: String, default: 'block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 ml-0.5' },
  // Clicking anywhere on the saved address opens the selections (no separate Change button).
  clickToEdit: { type: Boolean, default: false },
  // "Select down to the barangay…" helper line under the fields
  showHint: { type: Boolean, default: true }
});
const emit = defineEmits(['update:modelValue']);

const saved = ref(props.modelValue || '');
const editing = ref(!props.modelValue);
let lastEmitted = props.modelValue || '';

const street = ref('');
const regionCode = ref('');
const provinceCode = ref('');
const cityCode = ref('');
const barangayCode = ref('');
const regionOptions = ref([]);
const provinceOptions = ref([]);
const cityOptions = ref([]);
const barangayOptions = ref([]);
const regionHasProvinces = ref(true);
const loading = ref('');
const loadError = ref('');
let selectionVersion = 0;
let loadVersion = 0;

const nameOf = (list, code) => (list.find(o => o.code === code) || {}).name || '';
const complete = computed(() => !loading.value && !loadError.value
  && regionOptions.value.some(o => o.code === regionCode.value)
  && (!regionHasProvinces.value || provinceOptions.value.some(o => o.code === provinceCode.value))
  && cityOptions.value.some(o => o.code === cityCode.value)
  && barangayOptions.value.some(o => o.code === barangayCode.value));
const composed = computed(() => [
  street.value.trim(),
  nameOf(barangayOptions.value, barangayCode.value),
  nameOf(cityOptions.value, cityCode.value),
  regionHasProvinces.value ? nameOf(provinceOptions.value, provinceCode.value) : '',
  nameOf(regionOptions.value, regionCode.value)
].filter(Boolean).join(', '));

const publish = (value) => { lastEmitted = value; emit('update:modelValue', value); };
// Only a completed selection replaces the address. An unfinished one keeps the saved address
// (or stays empty when there is none, so required checks still catch it).
watch([composed, complete], () => { if (editing.value) publish(complete.value ? composed.value : saved.value); });

// Pages load the saved profile after mounting: treat outside changes as the saved address.
watch(() => props.modelValue, (value) => {
  if ((value || '') === lastEmitted) return;
  lastEmitted = value || '';
  saved.value = value || '';
  editing.value = !value;
  if (editing.value) loadRegions();
});

const load = async (level, loader) => {
  const version = ++loadVersion;
  loading.value = level;
  loadError.value = '';
  try { return await loader(); } catch {
    if (version === loadVersion) loadError.value = 'Could not load the address list. Check your connection and select again.';
    return [];
  } finally { if (version === loadVersion) loading.value = ''; }
};
const loadRegions = async () => { if (!regionOptions.value.length) regionOptions.value = await load('region', getRegions); };
const onRegionChange = async () => {
  const version = ++selectionVersion;
  provinceCode.value = ''; cityCode.value = ''; barangayCode.value = '';
  provinceOptions.value = []; cityOptions.value = []; barangayOptions.value = [];
  if (!regionCode.value) return;
  const provinces = await load('province', () => getProvinces(regionCode.value));
  if (version !== selectionVersion || loadError.value) return;
  regionHasProvinces.value = provinces.length > 0;
  if (regionHasProvinces.value) provinceOptions.value = provinces;
  else { const cities = await load('city', () => getCitiesByRegion(regionCode.value)); if (version === selectionVersion) cityOptions.value = cities; }
};
const onProvinceChange = async () => {
  const version = ++selectionVersion;
  cityCode.value = ''; barangayCode.value = '';
  cityOptions.value = []; barangayOptions.value = [];
  if (provinceCode.value) { const cities = await load('city', () => getCities(provinceCode.value)); if (version === selectionVersion) cityOptions.value = cities; }
};
const onCityChange = async () => {
  const version = ++selectionVersion;
  barangayCode.value = '';
  barangayOptions.value = [];
  if (cityCode.value) { const barangays = await load('barangay', () => getBarangays(cityCode.value)); if (version === selectionVersion) barangayOptions.value = barangays; }
};

const startChange = () => { editing.value = true; publish(complete.value ? composed.value : saved.value); loadRegions(); };
const keepSaved = () => { editing.value = false; publish(saved.value); };

if (editing.value) loadRegions();
const opts = (list, useLabel) => list.map(o => ({ value: o.code, label: useLabel ? o.label : o.name }));
</script>

<template>
  <div class="min-w-0">
    <button v-if="!editing && clickToEdit" :id="idPrefix" type="button" @click="startChange" :aria-label="'Change address: ' + saved" :class="[fieldClass, 'block text-left cursor-pointer']">
      <p class="min-w-0 break-words"><i class="fa-solid fa-location-dot text-blue-500 mr-2" aria-hidden="true"></i>{{ saved }}</p>
    </button>
    <div v-else-if="!editing" class="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p class="text-sm font-semibold text-slate-800 min-w-0 break-words"><i class="fa-solid fa-location-dot text-blue-500 mr-2" aria-hidden="true"></i>{{ saved }}</p>
      <button type="button" @click="startChange" class="shrink-0 text-xs font-semibold text-blue-700 hover:text-blue-900 underline-offset-2 hover:underline">Change</button>
    </div>

    <div v-else class="space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label :for="idPrefix + '-region'" :class="labelClass">Region</label>
          <DropdownSelect :id="idPrefix + '-region'" v-model="regionCode" @change="onRegionChange"
            :options="opts(regionOptions, true)" :placeholder="loading === 'region' ? 'Loading…' : 'Select region'"
            :invalid="invalid && !regionCode" :trigger-class="fieldClass" />
        </div>
        <div>
          <label :for="idPrefix + '-province'" :class="labelClass">Province</label>
          <DropdownSelect :id="idPrefix + '-province'" v-model="provinceCode" @change="onProvinceChange"
            :disabled="!regionCode || !regionHasProvinces || loading === 'province'"
            :options="opts(provinceOptions)"
            :placeholder="loading === 'province' ? 'Loading…' : (regionCode && !regionHasProvinces ? 'Not applicable' : 'Select province')"
            :invalid="invalid && !!regionCode && regionHasProvinces && !provinceCode" :trigger-class="fieldClass" />
        </div>
        <div>
          <label :for="idPrefix + '-city'" :class="labelClass">City / Municipality</label>
          <DropdownSelect :id="idPrefix + '-city'" v-model="cityCode" @change="onCityChange"
            :disabled="!cityOptions.length || loading === 'city'" :options="opts(cityOptions)"
            :placeholder="loading === 'city' ? 'Loading…' : 'Select city / municipality'"
            :invalid="invalid && !!cityOptions.length && !cityCode" :trigger-class="fieldClass" />
        </div>
        <div>
          <label :for="idPrefix + '-barangay'" :class="labelClass">Barangay</label>
          <DropdownSelect :id="idPrefix + '-barangay'" v-model="barangayCode"
            :disabled="!barangayOptions.length || loading === 'barangay'" :options="opts(barangayOptions)"
            :placeholder="loading === 'barangay' ? 'Loading…' : 'Select barangay'"
            :invalid="invalid && !!barangayOptions.length && !barangayCode" :trigger-class="fieldClass" />
        </div>
      </div>
      <div>
        <label :for="idPrefix + '-street'" :class="labelClass">House no., street, purok <span class="normal-case font-normal text-slate-400">(optional)</span></label>
        <input :id="idPrefix + '-street'" v-model="street" type="text" maxlength="150" autocomplete="address-line1" placeholder="e.g. 12 Rizal St., Purok 2" :class="[fieldClass, 'px-4 py-3']" />
      </div>
      <p v-if="loadError" class="text-amber-600 text-xs font-semibold">{{ loadError }}</p>
      <p v-else-if="complete" class="text-slate-600 text-xs font-medium"><i class="fa-solid fa-location-dot mr-1 text-blue-500" aria-hidden="true"></i>{{ composed }}</p>
      <p v-else-if="showHint" class="text-slate-500 text-xs">Select down to the barangay to complete the address.</p>
      <button v-if="saved" type="button" @click="keepSaved" class="text-xs font-semibold text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline">Keep current address: {{ saved }}</button>
    </div>
  </div>
</template>
