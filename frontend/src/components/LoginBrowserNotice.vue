<script setup>
import { ref } from 'vue';
defineProps({ visible: Boolean });
const loginUrl = `${window.location.origin}/login`;
const copyStatus = ref('');
async function copyLoginLink() {
  try {
    await navigator.clipboard.writeText(loginUrl);
    copyStatus.value = 'Link copied. Paste it into Chrome or Safari.';
  } catch {
    copyStatus.value = 'Select and copy the address below, then paste it into Chrome or Safari.';
  }
}
</script>

<template>
  <div v-if="visible" role="note" class="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-left text-sm text-amber-950">
    <p class="font-bold">Open in Chrome or Safari to sign in</p>
    <p class="mt-2 leading-relaxed">This page appears to be inside another app. Google sign-in may be blocked here. Use the app menu to open this page in your browser, or copy this link and paste it into Chrome or Safari.</p>
    <button type="button" class="mt-3 rounded-lg border border-amber-500 bg-white px-3 py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" @click="copyLoginLink">Copy login link</button>
    <input aria-label="Login address to copy" :value="loginUrl" readonly class="mt-3 block w-full rounded border border-amber-300 bg-white p-2 text-xs text-slate-900" @focus="$event.target.select()" />
    <p role="status" class="mt-2 text-xs">{{ copyStatus }}</p>
  </div>
</template>
