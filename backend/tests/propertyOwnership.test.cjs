const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
function response() { return { code: 200, status(code) { this.code=code; return this; }, json(body) { this.body=body; return this; } }; }
function fixture({owned=true,applicable=true,existing=false,status='accredited',fail=false}={}) {
    const state={uploads:0,writes:[],queries:[],commit:0,rollback:0,release:0};
    const connection={async beginTransaction(){},async commit(){state.commit++;},async rollback(){state.rollback++;},release(){state.release++;},async query(sql,args){
        const q=sql.replace(/\s+/g,' ').trim();state.queries.push({q,args});
        if(q.startsWith('SELECT id FROM boarding_houses WHERE id = ? AND owner_id = ?')) { assert(q.endsWith('FOR UPDATE'));assert.equal(args[1],10); if(fail)throw Error('lookup failed');return [owned?[{id:7}]:[]]; }
        if(q.startsWith('SELECT id FROM checklist_criteria') && q.includes('house_id IS NULL')) {assert(q.endsWith('FOR UPDATE'));assert.equal(args[1],7);return [applicable?[{id:12}]:[]];}
        if(q.startsWith('SELECT id FROM checklist_criteria'))return [[{id:12}]];
        if(q.startsWith('SELECT house_status'))return [[{house_status:status,is_resubmission:0}]];
        if(q.startsWith('SELECT document_update_pending'))return [[{document_update_pending:1,last_updated_document:'permit_fire'}]];
        if(q.startsWith('SELECT id FROM house_documents'))return [existing?[{id:8}]:[]];
        if(q.startsWith('SELECT label'))return [[{label:'Custom'}]];
        if(q.startsWith('SELECT id FROM users'))return [[{id:20}]];
        if(q.startsWith('SELECT name'))return [[{name:'Property'}]];
        if(/^(UPDATE|INSERT|DELETE)/.test(q)){state.writes.push({q,args});return [{affectedRows:1}];}
        throw Error('Unexpected query '+q);
    }};
    return {state,pool:{getConnection:async()=>connection},async saveUploadedFile(){state.uploads++;return '/uploads/test.jpg';}};
}
function handler(file,route,f){const src=fs.readFileSync(require('node:path').join(__dirname,'../routes',file),'utf8');const start=src.indexOf("router.post('"+route+"'");const arrow=src.indexOf('async (req, res) => {',start);const end=src.indexOf('\n});',arrow);assert(start>=0&&end>arrow);return vm.runInNewContext('('+src.slice(arrow,end+2)+')',{pool:f.pool,saveUploadedFile:f.saveUploadedFile,sanitizeJSONInput:()=>null,NABUA_BARANGAYS:[],evaluateHouseCompliance:async()=>{},console:{log(){},warn(){},error(){}}});}
function request(custom=true,role='owner'){return {params:{id:'7'},user:{id:10,role},body:{identifier:custom?'12':'permit_fire',is_custom:custom,expiry_date:'',existing_photos:'["/uploads/old.jpg"]',house_name:'Property'},file:{buffer:Buffer.from('fixture'),originalname:'test.jpg'},files:[{fieldname:'new_photo_0',buffer:Buffer.from('fixture'),originalname:'test.jpg'}]};}
for(const route of ['/edit/:id','/documents/update/:id'])for(const settings of [{owned:false},{fail:true}])test(route+' rejects unauthorized/missing/failed ownership before uploads or writes '+JSON.stringify(settings),async()=>{const f=fixture(settings),res=response();await handler(route.startsWith('/edit')?'owner.js':'boardingHouses.js',route,f)(request(),res);assert.equal(res.code,settings.fail?500:404);assert.equal(f.state.uploads,0);assert.equal(f.state.writes.length,0);assert.equal(f.state.commit,0);assert.equal(f.state.rollback,1);assert.equal(f.state.release,1);});
for(const role of ['student','admin',undefined])test('Document mutation rejects role '+role,async()=>{const f=fixture(),res=response();const req=request();req.user.role=role;await handler('boardingHouses.js','/documents/update/:id',f)(req,res);assert.equal(res.code,403);assert.equal(f.state.queries.length,0);assert.equal(f.state.uploads,0);});
test('Custom requirement belonging to another house is blocked before storage',async()=>{const f=fixture({applicable:false}),res=response();await handler('boardingHouses.js','/documents/update/:id',f)(request(),res);assert.equal(res.code,400);assert.equal(f.state.uploads,0);assert.equal(f.state.writes.length,0);assert.equal(f.state.rollback,1);});
for(const id of ['12oops','',null,-1,1.5])test('Invalid custom criterion ID blocked '+id,async()=>{const f=fixture(),res=response(),req=request();req.body.identifier=id;await handler('boardingHouses.js','/documents/update/:id',f)(req,res);assert.equal(res.code,400);assert.equal(f.state.uploads,0);assert.equal(f.state.writes.length,0);});
for(const status of ['pending','rejected','archived','accredited'])for(const custom of [true,false])test('Owned '+status+' '+(custom?'custom':'standard')+' document retains resubmission behavior',async()=>{const f=fixture({status}),res=response();await handler('boardingHouses.js','/documents/update/:id',f)(request(custom),res);assert.equal(res.code,200);assert.equal(f.state.uploads,1);assert.equal(f.state.commit,1);const update=f.state.writes.find(x=>x.q.startsWith('UPDATE boarding_houses'));assert(update);assert.equal(update.args[custom?0:2],['rejected','archived'].includes(status)?'pending':status);assert.equal(update.args.at(-1),10);});
test('Owned existing custom document still updates',async()=>{const f=fixture({existing:true}),res=response();await handler('boardingHouses.js','/documents/update/:id',f)(request(),res);assert.equal(res.code,200);assert(f.state.writes.some(x=>x.q.startsWith('UPDATE house_documents')));});
test('Owned gallery replacement retains photos and ordinary edit',async()=>{const f=fixture(),res=response();await handler('owner.js','/edit/:id',f)(request(),res);assert.equal(res.code,200);assert.equal(f.state.uploads,1);assert.equal(f.state.commit,1);assert(f.state.writes.some(x=>x.q.startsWith('DELETE FROM house_photos')));assert.equal(f.state.writes.filter(x=>x.q.startsWith('INSERT INTO house_photos')).length,2);});
