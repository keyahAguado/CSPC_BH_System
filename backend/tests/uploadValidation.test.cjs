const { pathToFileURL } = require('node:url');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const load = import(pathToFileURL(path.join(__dirname,'../config/uploadValidation.js')).href);
const response = () => ({status(code){this.code=code;return this;},json(body){this.body=body;}});
function image(ext) {
    const b=Buffer.alloc(40);
    if(['jpg','jpeg'].includes(ext)) Buffer.from([255,216,255]).copy(b);
    if(ext==='png') Buffer.from([137,80,78,71,13,10,26,10]).copy(b);
    if(ext==='webp'){b.write('RIFF');b.write('WEBP',8);}
    if(ext==='gif')b.write('GIF89a');
    if(ext==='bmp')b.write('BM');
    if(['tif','tiff'].includes(ext))Buffer.from([73,73,42,0]).copy(b);
    if(['heic','heif','avif'].includes(ext)){b.writeUInt32BE(24);b.write('ftyp',4);b.write(ext==='heif'?'mif1':ext,8);}
    return {originalname:'image.'+ext,buffer:b,fieldname:'house_photos'};
}
for(const ext of ['jpg','jpeg','png','webp','gif','bmp','tif','tiff','heic','heif','avif']) test('Recognizes supported '+ext+' header',async()=>assert((await load).supportedImage(image(ext))));
for(const file of [{originalname:'fake.jpg',buffer:Buffer.from('not an image at all')},{originalname:'script.svg',buffer:Buffer.from('<svg><script>alert(1)</script></svg>')},{...image('jpg'),originalname:'image.exe'},{...image('png'),buffer:Buffer.alloc(0)}]) test('Rejects unsupported or disguised file '+file.originalname,async()=>assert(!(await load).supportedImage(file)));
test('Recognizes HEIF compatible brand with generic major brand',async()=>{
    const file=image('heic');file.buffer.write('isom',8);file.buffer.write('heic',16);assert((await load).supportedImage(file));
});
test('Invalid file prevents persistence middleware from running',async()=>{
    const api=await load;let reached=false;const res=response();
    api.validateImages({file:{originalname:'fake.jpg',buffer:Buffer.from('invalid-image-content')}},res,()=>{reached=true;});
    assert.equal(res.code,400);assert.equal(reached,false);assert.match(res.body.message,/supported image/);
});
test('Valid images and no replacement files preserve normal flow',async()=>{
    const api=await load;
    for(const req of [{file:image('jpg')},{files:{permit_fire:[image('png')]}},{files:[{...image('webp'),fieldname:'img'}]},{}]) {
        let reached=false;api.validateImages(req,response(),()=>{reached=true;});assert(reached);
    }
});
for(const target of ['edit','accreditation']) test(target+' combined gallery count rejects 11 before storage',async()=>{
    const api=await load;let reached=false;const res=response();const file={...image('jpg'),fieldname:'new_photo_0'};
    const req={path:target==='edit'?'/edit/1':'/accreditation',body:{existing_photos:JSON.stringify(new Array(10).fill('/old.jpg'))},files:target==='edit'?[file]:{house_photos:[file]}};
    api.validateImages(req,res,()=>{reached=true;});assert.equal(res.code,400);assert.equal(reached,false);
});
test('Ten existing photos with no new files remain valid',async()=>{
    const api=await load;let reached=false;
    api.validateImages({path:'/accreditation',body:{existing_photos:JSON.stringify(new Array(10).fill('/old.jpg'))},files:{}},response(),()=>{reached=true;});assert(reached);
});
test('Unexpected property upload field is rejected',async()=>{
    const api=await load;const res=response();api.validateImages({path:'/edit/1',body:{},files:[{...image('jpg'),fieldname:'unknown'}]},res,()=>assert.fail());assert.equal(res.code,400);
});
for(const code of ['LIMIT_FILE_SIZE','LIMIT_FILE_COUNT','LIMIT_UNEXPECTED_FILE']) test(code+' produces friendly JSON instead of technical error',async()=>{
    const api=await load;const res=response();api.uploadErrorHandler({name:'MulterError',code,message:'private/internal/path'},null,res,()=>assert.fail());
    assert.equal(res.code,400);assert.equal(res.body.success,false);assert(!res.body.message.includes('private'));if(code==='LIMIT_FILE_SIZE')assert.match(res.body.message,/10 MB/);
});
test('Other errors retain the existing error handling path',async()=>{
    const api=await load;const error=Error('network error');let forwarded;api.uploadErrorHandler(error,null,response(),e=>{forwarded=e;});assert.equal(forwarded,error);
});
test('Malformed JSON receives a correction message without internal parser details',async()=>{
    const api=await load;const res=response();api.uploadErrorHandler({type:'entity.parse.failed',message:'private parser detail'},null,res,()=>assert.fail());assert.equal(res.code,400);assert.match(res.body.message,/refresh/);assert(!res.body.message.includes('private'));
});
