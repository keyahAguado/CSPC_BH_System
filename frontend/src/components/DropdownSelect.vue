<script setup>
// Select box whose list always opens BELOW the field, with a fixed height and its own scrollbar.
// Native <select> lists open up or down depending on the browser and can cover the address bar.
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] }, // [{ value, label }]
  placeholder: { type: String, default: 'Select…' },
  disabled: Boolean,
  invalid: Boolean,
  id: { type: String, default: undefined },
  ariaLabel: { type: String, default: undefined },
  triggerClass: { type: [String, Array, Object], default: '' }
});
const emit = defineEmits(['update:modelValue', 'change']);

const open = ref(false);
const active = ref(-1);
const triggerRef = ref(null);
const panelRef = ref(null);
const listRef = ref(null);
const panelStyle = ref({});
const listId = `dd-list-${Math.random().toString(36).slice(2, 9)}`;

const selected = computed(() => props.options.find(o => String(o.value) === String(props.modelValue)));
const filtered = computed(() => props.options);

// Fixed below the trigger; the list height shrinks to the room left in the window (never opens upward)
const place = () => {
  const el = triggerRef.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const room = window.innerHeight - r.bottom - 12;
  panelStyle.value = { top: `${r.bottom + 4}px`, left: `${r.left}px`, width: `${r.width}px`, '--dd-max': `${Math.max(140, Math.min(280, room))}px` };
};
const onOutside = (e) => {
  if (!triggerRef.value?.contains(e.target) && !panelRef.value?.contains(e.target)) close();
};
const show = async () => {
  if (props.disabled) return;
  // Bring the field up a little first when it sits near the bottom, so the list has room below it
  const r = triggerRef.value.getBoundingClientRect();
  if (window.innerHeight - r.bottom < 220) triggerRef.value.scrollIntoView({ block: 'center', behavior: 'instant' });
  open.value = true;
  active.value = Math.max(0, filtered.value.findIndex(o => String(o.value) === String(props.modelValue)));
  place();
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
  document.addEventListener('mousedown', onOutside);
  await nextTick();
  listRef.value?.focus();
  scrollActive();
};
const close = (refocus = false) => {
  if (!open.value) return;
  open.value = false;
  window.removeEventListener('scroll', place, true);
  window.removeEventListener('resize', place);
  document.removeEventListener('mousedown', onOutside);
  if (refocus) triggerRef.value?.focus();
};
const pick = (o) => {
  const changed = String(o.value) !== String(props.modelValue);
  emit('update:modelValue', o.value);
  close(true);
  if (changed) nextTick(() => emit('change', o.value));
};
const scrollActive = () => nextTick(() => listRef.value?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' }));
const onKey = (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); active.value = Math.min(filtered.value.length - 1, active.value + 1); scrollActive(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); active.value = Math.max(0, active.value - 1); scrollActive(); }
  else if (e.key === 'Enter') { e.preventDefault(); const o = filtered.value[active.value]; if (o) pick(o); }
  else if (e.key === 'Escape' || e.key === 'Tab') close(e.key === 'Escape');
};
const onTriggerKey = (e) => {
  if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); }
};
watch(() => props.disabled, (d) => { if (d) close(); });
onBeforeUnmount(() => close());
</script>

<template>
  <div class="dd">
    <button ref="triggerRef" type="button" :id="id" :disabled="disabled"
            :class="['dd-trigger', triggerClass, { 'is-open': open, 'is-invalid': invalid, 'is-placeholder': !selected }]"
            aria-haspopup="listbox" :aria-expanded="open" :aria-controls="listId" :aria-label="ariaLabel"
            @click="open ? close() : show()" @keydown="onTriggerKey">
      <span class="dd-value">{{ selected ? selected.label : placeholder }}</span>
      <i class="fa-solid fa-chevron-down dd-caret" aria-hidden="true"></i>
    </button>
    <Teleport to="body">
      <div v-if="open" ref="panelRef" class="dd-panel" :style="panelStyle">
        <ul :id="listId" ref="listRef" class="dd-list" role="listbox" tabindex="-1" :aria-activedescendant="active >= 0 ? listId + '-' + active : undefined" @keydown="onKey">
          <li v-for="(o, i) in filtered" :id="listId + '-' + i" :key="o.value" role="option"
              :aria-selected="String(o.value) === String(modelValue)"
              :class="['dd-option', { 'is-active': i === active, 'is-selected': String(o.value) === String(modelValue) }]"
              @mouseenter="active = i" @mousedown.prevent @click="pick(o)">
            <span>{{ o.label }}</span>
            <i v-if="String(o.value) === String(modelValue)" class="fa-solid fa-check" aria-hidden="true"></i>
          </li>
          <li v-if="!filtered.length" class="dd-empty">No options</li>
        </ul>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.dd { position: relative; width: 100%; }
.dd-trigger { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; text-align: left; cursor: pointer; }
.dd-trigger:disabled { cursor: not-allowed; opacity: .7; }
.dd-trigger.is-open { border-color: #3b82f6 !important; background: #fff !important; box-shadow: 0 0 0 3px rgba(59, 130, 246, .12); }
.dd-trigger.is-invalid { border-color: #f87171 !important; }
.dd-value { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dd-trigger.is-placeholder .dd-value { color: #64748b; }
.dd-caret { flex-shrink: 0; font-size: 11px; color: #64748b; transition: transform .15s; }
.dd-trigger.is-open .dd-caret { transform: rotate(180deg); }
</style>

<style>
/* Teleported to <body>, so these are global */
.dd-panel { position: fixed; z-index: 1000; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 12px 32px rgba(15, 23, 42, .16); overflow: hidden; font-family: inherit; }
.dd-list { list-style: none; margin: 0; padding: 4px; max-height: var(--dd-max, 280px); overflow-y: auto; outline: none; }
.dd-option { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border-radius: 8px; font-size: 14px; color: #0f172a; cursor: pointer; }
.dd-option.is-active { background: #eff6ff; color: #1d4ed8; }
.dd-option.is-selected { font-weight: 600; }
.dd-option i { font-size: 12px; color: #2563eb; }
.dd-empty { padding: 10px; font-size: 13px; color: #94a3b8; text-align: center; }
</style>
