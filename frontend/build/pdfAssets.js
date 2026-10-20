import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
// PDF.js loads character maps, standard fonts and image decoders on demand.
// Serve its matching package version locally; never send permit contents to a third-party viewer.
export function pdfAssets(){
  return {name:'local-pdf-assets',apply:'build',generateBundle(){
    const root=path.dirname(require.resolve('pdfjs-dist/package.json'));
    const {version}=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
    for(const dir of ['cmaps','standard_fonts','wasm'])for(const name of fs.readdirSync(path.join(root,dir))){
      if(!/\.(bcmap|pfb|ttf|wasm)$/.test(name))continue;
      this.emitFile({type:'asset',fileName:'assets/pdfjs-'+version+'/'+dir+'/'+name,source:fs.readFileSync(path.join(root,dir,name))});
    }
  }};
}
