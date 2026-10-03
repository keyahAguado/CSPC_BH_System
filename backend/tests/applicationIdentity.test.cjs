const fs=require('node:fs');const vm=require('node:vm');const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../routes/boardingHouses.js'),'utf8');
const route=source.indexOf("router.post('/accreditation'");const start=source.indexOf('async (req, res) => {',route);const end=source.indexOf('\n});',start);assert(start>0&&end>start);
function fixture({duplicate=false,owned=true}={}){
 const state={uploads:0,writes:[],queries:[]};
 const pool={async query(sql,args){const q=sql.replace(/\s+/g,' ').trim();state.queries.push({q,args});
  if(q.startsWith('SELECT id FROM boarding_houses WHERE owner_id')){assert(q.includes('LOWER(TRIM(name))'));return [duplicate?[{id:7}]:[]];}
  if(q.startsWith('SELECT * FROM boarding_houses'))return [owned?[{id:7,img:'/old.jpg',permit_fire:'/old-fire.pdf',expiry_permit_fire:'2030-01-01'}]:[]];
  if(q.startsWith('SELECT id FROM users'))return [[]];
  if(/^(INSERT|UPDATE|DELETE)/.test(q)){state.writes.push({q,args});return [{insertId:8,affectedRows:1}];}
  throw Error('Unexpected query '+q);
 }};
 pool.getConnection=async()=>({query:pool.query,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}});
 const handler=vm.runInNewContext('('+source.slice(start,end+2)+')',{pool,saveUploadedFile:async()=>{state.uploads++;return '/new.jpg';},sanitizeJSONInput:x=>x||null,evaluateHouseCompliance:async()=>{},console:{log(){},error(){},warn(){}}});
 return {state,handler};
}
const request=(body={})=>({user:{id:10,role:'owner'},body:{house_name:'Property',price:'1000',existing_photos:'["/old-gallery.jpg"]',...body},files:{house_photos:[{buffer:Buffer.from('test'),originalname:'photo.jpg'}]}});
function response(){return {code:200,status(n){this.code=n;return this;},json(body){this.body=body;return this;}};}
for(const status of ['pending','rejected','accredited','archived'])test('Same-name new application cannot overwrite existing '+status,async()=>{const f=fixture({duplicate:true}),res=response();await f.handler(request({house_name:' PROPERTY '}),res);assert.equal(res.code,409);assert.equal(res.body.success,false);assert.match(res.body.message,/already exists/);assert.equal(f.state.uploads,0);assert.equal(f.state.writes.length,0);assert.deepEqual(Array.from(f.state.queries[0].args),[10,'PROPERTY']);});
for(const name of [undefined,null,'', '   ',123])test('Missing/invalid new property name gets helpful validation '+String(name),async()=>{const f=fixture(),res=response();await f.handler(request({house_name:name}),res);assert.equal(res.code,400);assert.equal(f.state.uploads,0);assert.equal(f.state.writes.length,0);});
test('New distinct property retains insertion, files, gallery and pending status',async()=>{const f=fixture(),res=response();await f.handler(request(),res);assert.equal(res.code,201);assert.equal(res.body.houseId,8);assert.equal(f.state.uploads,1);const insert=f.state.writes.find(x=>x.q.startsWith('INSERT INTO boarding_houses'));assert.equal(insert.args[0],10);assert.equal(insert.args[14],'pending');assert.equal(f.state.writes.filter(x=>x.q.startsWith('INSERT INTO house_photos')).length,2);assert(!f.state.writes.some(x=>x.q.startsWith('UPDATE boarding_houses')));});
test('Explicit owned property ID retains update/resubmission and existing permits',async()=>{const f=fixture({duplicate:true}),res=response();await f.handler(request({house_id:'7'}),res);assert.equal(res.code,200);assert.equal(res.body.houseId,'7');assert(!f.state.queries.some(x=>x.q.includes('LOWER(TRIM(name))')));const update=f.state.writes.find(x=>x.q.startsWith('UPDATE boarding_houses'));assert(update.q.includes('WHERE id = ? AND owner_id = ?'));assert(update.args.includes('/old-fire.pdf'));assert.equal(update.args.at(-2),'7');assert.equal(update.args.at(-1),10);});
test('Explicit foreign/missing property ID cannot fall back to same-name overwrite',async()=>{const f=fixture({owned:false,duplicate:true}),res=response();await f.handler(request({house_id:'7'}),res);assert.equal(res.code,404);assert.equal(f.state.writes.length,0);assert(!f.state.queries.some(x=>x.q.includes('LOWER(TRIM(name))')));});
test('Retry after successful insertion is blocked without a second write',async()=>{let exists=false;const f=fixture(),query=f.handler;await query(request(),response());exists=f.state.writes.some(x=>x.q.startsWith('INSERT INTO boarding_houses'));assert(exists);const retry=fixture({duplicate:exists}),res=response();await retry.handler(request(),res);assert.equal(res.code,409);assert.equal(retry.state.writes.length,0);});
