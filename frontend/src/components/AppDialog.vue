<script setup>
// Shared dialog on the native <dialog> element (showModal), so it opens above other native dialogs such as the
// Bookings side panel and stays clickable there. Body helpers (app-dialog-lead, -facts, -callout, -check, -field)
// are in styles/app-dialog.css.
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import '../styles/app-dialog.css';
const props = defineProps({
  open: Boolean,
  title: { type: String, required: true },
  description: String,
  tone: { type: String, default: 'info' },
  icon: String,
  size: { type: String, default: 'md' },
  busy: Boolean,
  dismissible: { type: Boolean, default: true }
});
const emit = defineEmits(['close']);
const dialog = ref(null);
const close = () => { if (!props.busy && props.dismissible) emit('close'); };
const sync = async (open) => {
  await nextTick();
  const el = dialog.value;
  if (!el) return;
  if (open && !el.open) el.showModal();
  if (!open && el.open) el.close();
};
watch(() => props.open, sync);
onMounted(() => sync(props.open));
onBeforeUnmount(() => { if (dialog.value?.open) dialog.value.close(); });
// Escape: let the parent decide (it may be busy). A click on the backdrop (the dialog element itself) closes.
const onCancel = (event) => { event.preventDefault(); close(); };
const onBackdrop = (event) => { if (event.target === dialog.value) close(); };
</script>
<template>
  <Teleport to="body">
    <dialog ref="dialog" :class="['app-dialog', 'popup-panel', 'size-' + size, 'tone-' + tone]" :aria-label="title" @cancel="onCancel" @click="onBackdrop">
      <template v-if="open">
        <header class="app-dialog-header">
          <span v-if="icon" class="app-dialog-icon" aria-hidden="true"><i :class="['fa-solid', icon]"></i></span>
          <div class="app-dialog-heading"><h2>{{ title }}</h2><p v-if="description">{{ description }}</p></div>
          <button v-if="dismissible" type="button" class="app-dialog-close" :disabled="busy" aria-label="Close dialog" @click="close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </header>
        <div class="app-dialog-body"><slot /></div>
        <footer v-if="$slots.footer" class="app-dialog-footer"><slot name="footer" /></footer>
      </template>
    </dialog>
  </Teleport>
</template>
