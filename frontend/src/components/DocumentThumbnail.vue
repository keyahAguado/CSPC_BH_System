<script setup>
import { ref, watch, onUnmounted } from 'vue';
import { getImageUrl } from '../config/api.js';
import { loadDocumentFile } from '../utils/openFile.js';
const props = defineProps({ file: { type: String, required: true }, alt: { type: String, default: '' } });
const source = ref(''); let controller, current = 0;
const release = () => { if (source.value) URL.revokeObjectURL(source.value); source.value = ''; };
watch(() => props.file, async file => {
  const version = ++current; controller?.abort(); controller = new AbortController(); release();
  try { const blob = await loadDocumentFile(getImageUrl(file), { signal: controller.signal }); if (version === current && blob.type.startsWith('image/')) source.value = URL.createObjectURL(blob); } catch {}
}, { immediate: true });
onUnmounted(() => { ++current; controller?.abort(); release(); });
</script>
<template><span class="document-thumbnail"><img v-if="source" :src="source" :alt="alt" /><i v-else class="fa-regular fa-file-image" aria-hidden="true"></i></span></template>
<style scoped>.document-thumbnail { display:flex;align-items:center;justify-content:center;width:100%;height:72px;color:#64748b; }.document-thumbnail img{width:100%;height:100%;object-fit:contain;}</style>
