// Validate bytes, not filenames: never open an app-shell/HTML response as a permit.
export function fileTarget(url) {
  if(!url)throw new Error('A file address is required.');
  const target=new URL(url,window.location.href);
  if(!['http:','https:','blob:'].includes(target.protocol)||target.username||target.password)throw new Error('This file address is not supported.');
  return target;
}
export function detectedFileType(bytes) {
  const text=new TextDecoder('latin1').decode(bytes.slice(0,32));
  if(text.startsWith('%PDF-'))return 'application/pdf';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if([137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
  if(/^GIF8[79]a/.test(text))return 'image/gif';
  if(text.startsWith('RIFF')&&text.slice(8,12)==='WEBP')return 'image/webp';
  if(text.startsWith('BM'))return 'image/bmp';
  if(text.startsWith('II*\0')||text.startsWith('MM\0*'))return 'image/tiff';
  if(text.slice(4,8)==='ftyp'&&/avif|avis/.test(text.slice(8)))return 'image/avif';
  throw new Error('The server did not return a supported image or PDF. The file may be unavailable or an older offline copy may contain the app page. Refresh and retry.');
}
export async function loadDocumentFile(url,{signal,expected,token}={}) {
  const target=fileTarget(url),controller=new AbortController(),abort=()=>controller.abort();
  if(signal?.aborted)controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(abort,30000);
  try {
    const response=await fetch(target.href,{credentials:target.origin===window.location.origin?'same-origin':'omit',cache:'no-store',signal:controller.signal,...(token&&target.origin===window.location.origin?{headers:{Authorization:'Bearer '+token}}:{})});
    if(!response.ok)throw new Error('The file could not be loaded ('+response.status+'). Please retry or contact the property owner.');
    if(Number(response.headers.get('content-length'))>25*1024*1024)throw new Error('This file is too large to preview.');
    const blob=await response.blob();
    if(!blob.size||blob.size>25*1024*1024)throw new Error('This file is empty or too large to preview.');
    const type=detectedFileType(new Uint8Array(await blob.slice(0,32).arrayBuffer()));
    if(expected==='pdf'&&type!=='application/pdf')throw new Error('This link did not return a PDF document.');
    return new Blob([blob],{type});
  }catch(error){
    if(error.name==='AbortError')throw new Error('The file request was cancelled or timed out. Please retry.');
    throw error;
  }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
// Reserve a tab during the click, before downloading can lose browser activation.
// A validated blob avoids navigating into the installed app's HTTP URL scope.
// Browser/OS preferences still determine whether a new browser tab or window is used.
export async function openFileInNewTab(url) {
  let target;
  try{target=fileTarget(url);}catch{return false;}
  const tab=window.open('about:blank','_blank');
  if(!tab){window.alert('Your browser blocked the new tab. Allow pop-ups for this site, then try again.');return false;}
  tab.opener=null;tab.document.title='Opening document';tab.document.body.textContent='Loading your document...';
  try {
    const blob=await loadDocumentFile(target.href);
    if(tab.closed)return false;
    const blobUrl=URL.createObjectURL(blob);
    tab.location.replace(blobUrl);
    // Keep the URL available to native PDF readers while the tab is open, up to one hour.
    let timer;
    const expiry=setTimeout(()=>{clearInterval(timer);URL.revokeObjectURL(blobUrl);},60*60*1000);
    timer=setInterval(()=>{if(tab.closed){clearInterval(timer);clearTimeout(expiry);URL.revokeObjectURL(blobUrl);}},5000);
    return true;
  }catch(error){
    if(!tab.closed){tab.document.title='Document unavailable';tab.document.body.textContent='Unable to open this file. '+(error.message||'Please retry from the document viewer.');}
    return false;
  }
}
