<script setup>
import DocumentThumbnail from './DocumentThumbnail.vue';
defineProps({ files: { type: Array, default: () => [] }, label: { type: String, required: true } });
defineEmits(['preview']);
const isPdf = file => /\.pdf($|[?#])/i.test(String(file));
</script>
<template>
  <div class="attachment-list" :aria-label="label + ' attachments'">
    <button v-for="(file, index) in files" :key="file" type="button" class="attachment-file"
      :aria-label="`View ${label}, file ${index + 1} of ${files.length}`" @click="$emit('preview', index)">
      <span v-if="isPdf(file)" class="attachment-pdf"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> PDF</span>
      <DocumentThumbnail v-else :file="file" :alt="`${label}, file ${index + 1}`" />
      <span>File {{ index + 1 }} of {{ files.length }}</span>
    </button>
  </div>
</template>
<style scoped>
.attachment-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.attachment-file{width:104px;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;background:#f8fafc;color:#243449;font-size:11px;text-align:center}.attachment-file img,.attachment-pdf{width:100%;height:72px;object-fit:contain;display:flex;align-items:center;justify-content:center;gap:6px}.attachment-file>span:last-child{display:block;padding:5px}.attachment-file:focus-visible{outline:3px solid #60a5fa;outline-offset:2px}
</style>
