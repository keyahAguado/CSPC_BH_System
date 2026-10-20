<script setup>
// Image document viewer with zoom: fit to screen, then 125%–400% of the fitted size.
// Buttons, Ctrl + mouse wheel, + / − / 0 keys, and click to toggle fit / 200%. Zoom resets per file.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { loadDocumentFile } from '../utils/openFile.js';

const props = defineProps({ src: { type: String, required: true }, alt: { type: String, default: 'Document preview' } });
const emit = defineEmits(['backdrop', 'error']);

const STEPS = [1, 1.25, 1.5, 2, 2.5, 3, 4];
const zoom = ref(1);
const box = ref(null);
const natural = ref({ w: 0, h: 0 });
const area = ref({ w: 0, h: 0 });
const resolvedSrc = ref(''), loading = ref(true), failed = ref(false);
let imageRequest, resizeObserver, imageVersion = 0;
async function loadImage() {
  const current=++imageVersion;imageRequest?.abort();imageRequest=new AbortController();
  if(resolvedSrc.value)URL.revokeObjectURL(resolvedSrc.value);
  resolvedSrc.value='';loading.value=true;failed.value=false;
  try {
    const file=await loadDocumentFile(props.src,{signal:imageRequest.signal});
    if(current!==imageVersion)return;
    if(!file.type.startsWith('image/'))throw Error('Not an image');
    resolvedSrc.value=URL.createObjectURL(file);
  }catch{if(current===imageVersion){failed.value=true;emit('error');}}
  finally{if(current===imageVersion)loading.value=false;}
}

const measure = () => { const el = box.value; if (el) area.value = { w: el.clientWidth - 32, h: el.clientHeight - 80 }; };
const onLoad = (e) => { natural.value = { w: e.target.naturalWidth, h: e.target.naturalHeight }; measure(); };
// Same size the image had before zooming: shrunk to fit, never enlarged past its own pixels.
const fit = computed(() => natural.value.w && area.value.w > 0 ? Math.min(area.value.w / natural.value.w, area.value.h / natural.value.h, 1) : 1);
const zoomedStyle = computed(() => natural.value.w && area.value.w > 0 && area.value.h > 0
  ? { width: Math.max(1, Math.round(natural.value.w * fit.value * zoom.value)) + 'px', height: Math.max(1, Math.round(natural.value.h * fit.value * zoom.value)) + 'px', maxWidth: 'none', maxHeight: 'none', flexShrink: 0 } : { maxWidth: '100%', maxHeight: '100%' });

const zoomIn = () => { zoom.value = STEPS.find(s => s > zoom.value + 0.001) ?? STEPS[STEPS.length - 1]; };
const zoomOut = () => { zoom.value = [...STEPS].reverse().find(s => s < zoom.value - 0.001) ?? 1; };
const reset = () => { zoom.value = 1; };
const toggle = () => { zoom.value = zoom.value > 1 ? 1 : 2; };
const onWheel = (e) => { if (!e.ctrlKey) return; e.preventDefault(); if (e.deltaY < 0) zoomIn(); else zoomOut(); };
const onKey = (e) => {
  if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn(); }
  else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomOut(); }
  else if (e.key === '0') { e.preventDefault(); reset(); }
};

watch(() => props.src, () => { reset(); natural.value = { w: 0, h: 0 }; void loadImage(); });
onMounted(() => { resizeObserver = new ResizeObserver(measure); if (box.value) resizeObserver.observe(box.value); measure(); void loadImage(); window.addEventListener('resize', measure); window.addEventListener('keydown', onKey); });
onBeforeUnmount(() => { resizeObserver?.disconnect(); ++imageVersion;imageRequest?.abort();if(resolvedSrc.value)URL.revokeObjectURL(resolvedSrc.value);window.removeEventListener('resize', measure); window.removeEventListener('keydown', onKey); });
</script>

<template>
  <div class="dz">
    <div ref="box" :class="['dz-scroll', { 'is-zoomed': zoom > 1 }]" @wheel="onWheel" @click.self="emit('backdrop')">
      <p v-if="loading" class="dz-message" role="status">Loading image...</p>
      <p v-else-if="failed" class="dz-message" role="alert">This image could not be loaded. Please retry or open the original file.</p>
      <img v-else :src="resolvedSrc" :alt="alt" class="dz-img" :style="zoomedStyle" @load="onLoad" @error="failed=true;emit('error')" @click="toggle" />
    </div>
    <div v-if="!loading&&!failed" class="dz-controls" role="group" aria-label="Zoom">
      <button type="button" :disabled="zoom <= 1" aria-label="Zoom out" title="Zoom out (−)" @click="zoomOut"><i class="fa-solid fa-magnifying-glass-minus" aria-hidden="true"></i></button>
      <span class="dz-level" aria-live="polite">{{ zoom === 1 ? 'Fit' : Math.round(zoom * 100) + '%' }}</span>
      <button type="button" :disabled="zoom >= 4" aria-label="Zoom in" title="Zoom in (+)" @click="zoomIn"><i class="fa-solid fa-magnifying-glass-plus" aria-hidden="true"></i></button>
      <button type="button" class="dz-fit" :disabled="zoom === 1" title="Fit to screen (0)" @click="reset">Fit to screen</button>
    </div>
  </div>
</template>

<style scoped>
.dz { position: relative; flex: 1 1 auto; align-self: stretch; width: 100%; height: 100%; min-width: 0; min-height: 0; }
.dz-message{margin:auto;padding:24px;text-align:center;color:#fff;font-size:14px;line-height:1.6}
.dz-scroll { position: absolute; inset: 0; width: 100%; height: 100%; display: flex; overflow: hidden; padding: 16px 16px 64px; box-sizing: border-box; }
.dz-scroll.is-zoomed { overflow: auto; }
/* margin:auto centers the image and still lets every edge be scrolled into view when zoomed */
.dz-img { margin: auto; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; border-radius: 6px; background: #fff; box-shadow: 0 20px 50px rgba(0, 0, 0, .45); cursor: zoom-in; }
.dz-scroll.is-zoomed .dz-img { cursor: zoom-out; }
.dz-controls { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; align-items: center; gap: 4px; padding: 5px; border-radius: 999px; background: rgba(15, 23, 42, .88); border: 1px solid rgba(255, 255, 255, .18); box-shadow: 0 10px 30px rgba(0, 0, 0, .35); z-index: 2; }
.dz-controls button { display: inline-flex; align-items: center; justify-content: center; min-width: 38px; height: 38px; min-height: 38px !important; padding: 0 12px; border: 0; border-radius: 999px; background: transparent; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
.dz-controls button:hover:enabled { background: rgba(255, 255, 255, .16); }
.dz-controls button:disabled { opacity: .4; cursor: default; }
.dz-controls button:focus-visible { outline: 3px solid #93c5fd; outline-offset: 1px; }
.dz-level { min-width: 52px; text-align: center; color: #fff; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
.dz-fit { font-size: 12.5px !important; }
@media (max-width: 639px) { .dz-fit { display: none !important; } }
</style>
