<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { loadRecaptcha } from '../utils/recaptchaLoader.js';
const props = defineProps({ siteKey: { type: String, required: true } });
const emit = defineEmits(['update:token']);
const container = ref(null), loading = ref(false), error = ref('');
let active = true, widgetId = null, api;
const clearToken = () => emit('update:token', '');
const failed = () => {
  if (!active) return;
  clearToken(); loading.value = false;
  error.value = 'Verification timed out or lost its connection. Please retry CAPTCHA.';
};
async function start() {
  if (!active || loading.value) return;
  loading.value = true; error.value = ''; clearToken();
  try {
    api = await loadRecaptcha();
    if (!active || !container.value) return;
    if (widgetId !== null) api.reset(widgetId);
    else widgetId = api.render(container.value, {
      sitekey: props.siteKey,
      callback: token => { if (active) { error.value = ''; emit('update:token', token); } },
      'expired-callback': () => { if (active) { clearToken(); error.value = 'Verification expired. Please complete CAPTCHA again.'; } },
      'error-callback': failed
    });
  } catch (failure) {
    if (active) { clearToken(); error.value = failure.message || 'CAPTCHA could not load. Please retry.'; }
  } finally { if (active) loading.value = false; }
}
function reset() {
  clearToken();
  if (widgetId === null) return;
  try { api.reset(widgetId); } catch { failed(); }
}
onMounted(start);
onBeforeUnmount(() => {
  active = false;
  // Reset while the iframe is still attached, before Vue removes the login form.
  if (widgetId !== null) { try { api.reset(widgetId); } catch {} }
  widgetId = null;
});
defineExpose({ reset });
</script>
<template>
  <div class="flex flex-col items-center gap-2 min-w-0">
    <div ref="container"></div>
    <p v-if="loading" role="status" class="text-xs text-slate-500">Loading verification...</p>
    <p v-if="error" role="alert" class="text-xs text-red-600 text-center">{{ error }}</p>
    <button type="button" :disabled="loading" @click="start" class="captcha-retry">
      <svg :class="{ 'animate-spin': loading }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 11.6-1L20 9M4 15l2.4 3A7 7 0 0 0 18 17"/></svg>
      {{ loading ? 'Loading verification...' : 'Retry CAPTCHA' }}
    </button>
    <p v-if="error" class="text-xs text-slate-500 text-center">If retry still fails, reload this page and check whether your browser or network blocks Google verification.</p>
  </div>
</template>

<style scoped>
.captcha-retry { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 36px; padding: 7px 14px; border: 1px solid #d6e2f3; border-radius: 12px; background: #f0f5fc; color: #1e4a8d; font-size: 12px; font-weight: 700; transition: background .15s, border-color .15s; }
.captcha-retry:hover:not(:disabled) { background: #e3edfa; border-color: #9fb8dc; }
.captcha-retry:focus-visible { outline: 3px solid #93b6e6; outline-offset: 3px; }
.captcha-retry:disabled { opacity: .6; cursor: wait; }
:global(.dark) .captcha-retry { background: #243750; border-color: #425879; color: #dbeafe; }
:global(.dark) .captcha-retry:hover:not(:disabled) { background: #304765; }
</style>
