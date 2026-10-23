<script setup>
import { computed, ref, watch, onUnmounted } from 'vue';
import DocumentPdfPreview from './DocumentPdfPreview.vue';
import DocumentZoomImage from './DocumentZoomImage.vue';
import { vManagementDialog } from './management/dialogAccessibility.js';
import { getImageUrl } from '../config/api.js';
import { openFileInNewTab } from '../utils/openFile.js';
const props = defineProps({ files: { type: Array, default: () => [] }, title: { type: String, default: 'Document' } });
const emit = defineEmits(['close']);
const previewFiles = ref([]), previewIndex = ref(0), previewFailed = ref(false);
let blobs = [];
const release = () => { blobs.forEach(url => URL.revokeObjectURL(url)); blobs = []; };
watch(() => props.files, files => {
  release();
  previewFiles.value = files.map(file => {
    if (file instanceof File) { const url = URL.createObjectURL(file); blobs.push(url); return url; }
    try { const url = new URL(getImageUrl(file), window.location.origin); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
  }).filter(Boolean);
  previewIndex.value = 0; previewFailed.value = false;
}, { immediate: true });
onUnmounted(release);
const previewTitle = computed(() => props.title);
const previewUrl = computed(() => previewFiles.value[previewIndex.value] || '');
const previewIsPdf = computed(() => {
  const file = props.files[previewIndex.value];
  return file instanceof File
    ? file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    : /\.pdf(?:$|[?#])/i.test(previewUrl.value);
});
const closePreview = () => emit('close');
const stepDocumentPreview = direction => { previewIndex.value = (previewIndex.value + direction + previewFiles.value.length) % previewFiles.value.length; previewFailed.value = false; };
</script>
<template><Teleport to="body">
    <div v-if="previewFiles.length" v-management-dialog="{ close: closePreview }" class="owner-doc-viewer" @click.self="closePreview" @keydown.left.prevent="stepDocumentPreview(-1)" @keydown.right.prevent="stepDocumentPreview(1)">
      <section class="owner-doc-dialog">
      <div class="owner-doc-toolbar">
        <h2>{{ previewTitle }}</h2>
        <span aria-live="polite">File {{ previewIndex + 1 }} of {{ previewFiles.length }}</span>
        <a :href="previewUrl" target="_blank" rel="noopener noreferrer" @click.prevent="openFileInNewTab(previewUrl)">Open in new tab</a>
        <button type="button" aria-label="Close document preview" @click="closePreview">Close</button>
      </div>
      <div :class="['owner-doc-stage', { 'has-zoom': !previewIsPdf && !previewFailed }]">
        <DocumentPdfPreview v-if="previewIsPdf" :src="previewUrl" :title="previewTitle + ', file ' + (previewIndex + 1)" />
        <DocumentZoomImage v-else-if="!previewFailed" :src="previewUrl" :alt="previewTitle + ', file ' + (previewIndex + 1)" @error="previewFailed = true" @backdrop="closePreview" />
        <div v-else class="owner-doc-error" role="alert"><p>Preview unavailable. Retry, or open this file in a new tab.</p><button type="button" @click="previewFailed = false">Retry preview</button></div>
      </div>
      <div v-if="previewFiles.length > 1" class="owner-doc-navigation">
        <button type="button" @click="stepDocumentPreview(-1)">Previous file</button>
        <button type="button" @click="stepDocumentPreview(1)">Next file</button>
      </div>
      </section>
    </div>
</Teleport></template>
<style scoped>
.owner-doc-viewer { position: fixed; inset: 0; z-index: 250; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(15, 23, 42, .6); backdrop-filter: blur(3px); }
.owner-doc-dialog { height: min(92vh, 1000px); display: flex; flex-direction: column; width: min(1100px, 100%); max-height: min(92vh, 1000px); background: #fff; color: #0f172a; border-radius: 18px; overflow: hidden; box-shadow: 0 24px 60px rgba(15, 23, 42, .35); }
.owner-doc-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding: 12px 16px; background: linear-gradient(120deg, #142b4a, #1e4a8d); color: #fff; }
.owner-doc-toolbar h2 { flex: 1; min-width: 140px; margin: 0; font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
.owner-doc-toolbar span { font-size: 12.5px; color: #dbeafe; }
.owner-doc-toolbar a, .owner-doc-toolbar button { display: inline-flex; align-items: center; min-height: 34px !important; padding: 0 12px; border: 1px solid rgba(255, 255, 255, .35); border-radius: 9px; background: rgba(255, 255, 255, .12); color: #fff; font-size: 13px; font-weight: 600; text-decoration: none; cursor: pointer; }
.owner-doc-toolbar a:hover, .owner-doc-toolbar button:hover { background: rgba(255, 255, 255, .24); }
.owner-doc-viewer :is(a, button):focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px; }
.owner-doc-stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 14px; background: #f1f5f9; }
.owner-doc-stage img { max-width: 100%; max-height: calc(min(86vh, 900px) - 140px); object-fit: contain; border-radius: 8px; box-shadow: 0 4px 14px rgba(15, 23, 42, .15); }
.owner-doc-stage.has-zoom { height: calc(min(92vh, 1000px) - 110px); padding: 0; background: #1e293b; }
.owner-doc-stage iframe { width: 100%; height: calc(min(92vh, 1000px) - 140px); border: 0; border-radius: 8px; background: #fff; }
.owner-doc-stage p { color: #475569; font-size: 14px; }
.owner-doc-error { text-align: center; padding: 20px; }
.owner-doc-error button { margin-top: 14px; min-height: 40px; padding: 8px 16px; border: 1px solid #cbd5e1; border-radius: 9px; color: #1e4a8d; background: white; cursor: pointer; font-weight: 600; }
.owner-doc-navigation { display: flex; justify-content: center; gap: 10px; padding: 10px; border-top: 1px solid #e2e8f0; background: #fff; }
.owner-doc-navigation button { min-height: 36px !important; padding: 0 14px; border: 1px solid #cbd5e1; border-radius: 9px; background: #fff; color: #1e4a8d; font-size: 13px; font-weight: 600; cursor: pointer; }
.owner-doc-navigation button:hover { background: #eff6ff; }
@media (max-width: 640px) { .owner-doc-viewer { padding: 8px; } .owner-doc-dialog { height: 94dvh; max-height: 94dvh; } .owner-doc-toolbar { padding: 10px; } .owner-doc-toolbar h2 { flex-basis: 100%; } }
</style>
