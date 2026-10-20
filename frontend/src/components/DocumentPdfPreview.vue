<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { loadDocumentFile, openFileInNewTab } from '../utils/openFile.js';
const props=defineProps({src:{type:String,required:true},title:{type:String,default:'PDF document'}});
const canvas=ref(null),stage=ref(null),loading=ref(true),rendering=ref(false),error=ref('');
const page=ref(1),pages=ref(0),zoom=ref(1);
let pdf,task,renderTask,controller,observer,version=0,renderVersion=0;
async function renderPage(){
  if(!pdf||!canvas.value||!stage.value)return;
  const current=++renderVersion;
  renderTask?.cancel();rendering.value=true;
  try{
    const document=pdf,p=await document.getPage(page.value);
    if(current!==renderVersion||document!==pdf)return;
    const original=p.getViewport({scale:1});
    const fit=Math.min(Math.max(1,stage.value.clientWidth-40)/original.width,Math.max(1,stage.value.clientHeight-40)/original.height,1.5);
    const viewport=p.getViewport({scale:fit*zoom.value});
    const ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(16_000_000/(viewport.width*viewport.height)));
    canvas.value.width=Math.round(viewport.width*ratio);canvas.value.height=Math.round(viewport.height*ratio);
    canvas.value.style.width=Math.round(viewport.width)+'px';canvas.value.style.height=Math.round(viewport.height)+'px';
    renderTask=p.render({canvasContext:canvas.value.getContext('2d'),viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]});
    await renderTask.promise;
  }catch(e){if(current===renderVersion&&e.name!=='RenderingCancelledException')error.value='This PDF could not be rendered. Try opening the original file.';}
  finally{if(current===renderVersion)rendering.value=false;}
}
async function load(){
  const current=++version;++renderVersion;controller?.abort();renderTask?.cancel();
  const previous=task;task=null;pdf=null;void previous?.destroy().catch(()=>{});
  controller=new AbortController();loading.value=true;error.value='';page.value=1;pages.value=0;zoom.value=1;
  try{
    // Load the PDF engine only when a permit PDF is opened, not on the public homepage.
    const [engine,worker,file]=await Promise.all([import('pdfjs-dist'),import('pdfjs-dist/build/pdf.worker.min.mjs?url'),loadDocumentFile(props.src,{signal:controller.signal,expected:'pdf'})]);
    if(current!==version)return;
    // Bypass older service-worker/browser entries stored with an octet-stream MIME type.
    engine.GlobalWorkerOptions.workerSrc=worker.default+'?module=1';
    const assets=new URL(import.meta.env.BASE_URL+'assets/pdfjs-'+engine.version+'/',window.location.origin).href;
    task=engine.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true,
      cMapUrl:assets+'cmaps/',cMapPacked:true,standardFontDataUrl:assets+'standard_fonts/',wasmUrl:assets+'wasm/'});
    const result=await task.promise;
    if(current!==version){await result.destroy();return;}
    pdf=result;pages.value=result.numPages;loading.value=false;await nextTick();await renderPage();
  }catch(e){if(current===version)error.value=e.name==='PasswordException'?'This PDF is password protected. Open the original file in your PDF reader.':e.message||'The PDF could not be loaded.';}
  finally{if(current===version)loading.value=false;}
}
function changeZoom(amount){zoom.value=Math.max(.5,Math.min(4,Math.round((zoom.value+amount)*100)/100));}
watch(()=>props.src,load);watch([page,zoom],()=>{void renderPage();});
onMounted(()=>{void load();observer=new ResizeObserver(()=>{void renderPage();});if(stage.value)observer.observe(stage.value);});
onBeforeUnmount(()=>{++version;++renderVersion;controller?.abort();renderTask?.cancel();void task?.destroy().catch(()=>{});observer?.disconnect();});
</script>
<template>
  <section class="pdf-preview" :aria-label="title">
    <div v-if="loading" class="pdf-message" role="status">Loading PDF...</div>
    <div v-if="error" class="pdf-message pdf-error" role="alert"><p>{{ error }}</p><div><button type="button" @click="load">Retry preview</button><button type="button" @click="openFileInNewTab(src)">Open original file</button></div></div>
    <div ref="stage" class="pdf-stage" :aria-busy="loading||rendering"><canvas v-show="!loading&&!error" ref="canvas" role="img" :aria-label="title+', page '+page+' of '+pages"></canvas></div>
    <div v-if="pages&&!error" class="pdf-controls" role="group" aria-label="PDF page and zoom controls">
      <button type="button" aria-label="Previous PDF page" :disabled="page<=1||rendering" @click="page--">Previous</button>
      <span aria-live="polite">Page {{ page }} of {{ pages }}</span>
      <button type="button" aria-label="Next PDF page" :disabled="page>=pages||rendering" @click="page++">Next</button>
      <span class="pdf-divider" aria-hidden="true"></span>
      <button type="button" aria-label="Zoom out PDF" :disabled="zoom<=.5||rendering" @click="changeZoom(-.25)">−</button>
      <span>{{ zoom===1?'Fit page':Math.round(zoom*100)+'%' }}</span>
      <button type="button" aria-label="Zoom in PDF" :disabled="zoom>=4||rendering" @click="changeZoom(.25)">+</button>
      <button type="button" :disabled="zoom===1||rendering" @click="zoom=1">Fit page</button>
    </div>
  </section>
</template>
<style scoped>
.pdf-preview{position:relative;display:flex;flex-direction:column;width:100%;height:min(76vh,850px);min-height:260px;min-width:0;flex:1;background:#1e293b;color:#fff;border-radius:8px;overflow:hidden}.pdf-stage{flex:1;min-height:0;overflow:auto;padding:20px;display:flex;align-items:flex-start}.pdf-stage canvas{display:block;flex-shrink:0;margin:auto;background:white;box-shadow:0 8px 28px #0005}.pdf-message{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;padding:24px;text-align:center;background:#1e293b;z-index:1;font-size:14px}.pdf-error p{max-width:580px;color:#fff!important;line-height:1.7}.pdf-message>div{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}.pdf-controls{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px;padding:9px;background:#0f172a;border-top:1px solid #475569;font-size:12px}.pdf-controls span{padding:0 5px;white-space:nowrap}.pdf-preview button{display:inline-flex;align-items:center;justify-content:center;min-height:40px!important;min-width:40px;padding:7px 12px;border:1px solid #64748b;border-radius:7px;background:#334155;color:#fff;font-size:12px;cursor:pointer}.pdf-preview button:hover:enabled{background:#475569}.pdf-preview button:disabled{opacity:.4;cursor:default}.pdf-preview button:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}.pdf-divider{height:22px;border-left:1px solid #64748b}@media(max-width:639px){.pdf-preview{height:72vh}.pdf-stage{padding:12px}.pdf-controls{gap:3px}.pdf-controls button{padding:6px 8px}.pdf-divider{display:none}}
</style>
