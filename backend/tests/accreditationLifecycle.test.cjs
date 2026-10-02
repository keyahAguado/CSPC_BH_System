const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const complianceSource = fs.readFileSync(path.join(root, 'backend/config/complianceHelper.js'), 'utf8').replaceAll('export ', '');
const getComplianceStatus = vm.runInNewContext(complianceSource + ';getComplianceStatus');
function route(file, marker, context) {
    const source=fs.readFileSync(path.join(root,file),'utf8');const start=source.indexOf(marker);assert(start>=0);
    const arrow=source.indexOf('async (req, res) => {',start),end=source.indexOf('\n});',arrow);
    return vm.runInNewContext('('+source.slice(arrow,end+2)+')',{console:{error(){}},getComplianceStatus,...context});
}
function response(){return {code:200,status(n){this.code=n;return this;},json(body){this.body=body;return this;}};}
function fixture(options={}) {
    const defaults={id:1,owner_id:9,name:'Test listing',house_status:'accredited',status_before_archive:null,archived_by:null,archive_reason:null,archived_at:null,compliance_status:'active',admin_comments:null,expiry_permit_business_form:'2099-12-31',expiry_permit_barangay:'2099-12-31',expiry_permit_sanitary:'2099-12-31',expiry_permit_fire:'2099-12-31'};
    const state={houses:(options.houses||[{...options.house}]).map(h=>({...defaults,...h})),writes:0,evaluations:0,notifications:[],queries:[],commits:0,rollbacks:0};
    const find=id=>state.houses.find(h=>h.id==id);
    async function query(sql,args=[],writes) {
        const q=sql.replace(/\s+/g,' ').trim();state.queries.push({q,args});
        if(q.startsWith('SELECT')) {
            const h=find(args[0]);return [h&&(!q.includes('owner_id = ?')||h.owner_id==args[1])?[{...h}]:[]];
        }
        if(q.startsWith('UPDATE boarding_houses')) {
            if(options.beforeUpdate)options.beforeUpdate(state,q);
            let id,canWrite,update;
            if(q.includes('status_before_archive = house_status')) {
                id=args[1];const h=find(id);canWrite=h&&h.owner_id==args[2]&&h.house_status==='accredited';
                update=()=>{const h=find(id);h.status_before_archive=h.house_status;h.house_status='archived';h.archived_by='owner';h.archive_reason=args[0];h.archived_at='fixture timestamp';};
                assert(q.includes("AND house_status = 'accredited'"));
            } else if(q.includes('status_before_archive = CASE')) {
                id=args[2];canWrite=!!find(id);update=()=>{const h=find(id);if(h.house_status!=='archived')h.status_before_archive=h.house_status;h.house_status='archived';h.archived_by='admin';h.archive_reason=args[0];h.admin_comments=args[1];h.archived_at='admin timestamp';};
            } else if(q.includes('status_before_archive = NULL')) {
                id=args[0];const h=find(id);const fields=['expiry_permit_business_form','expiry_permit_barangay','expiry_permit_sanitary','expiry_permit_fire'];
                canWrite=h&&h.owner_id==args[1]&&h.house_status==='archived'&&h.archived_by==='owner'&&h.status_before_archive==='accredited'&&h.compliance_status!=='expired'&&!h.admin_comments&&fields.every((k,i)=>h[k]===args[i+2]);
                assert(q.includes("AND archived_by = 'owner'"));assert(q.includes("AND status_before_archive = 'accredited'"));assert(q.includes('expiry_permit_fire <=> ?'));
                update=()=>{const h=find(id);h.house_status='accredited';h.compliance_status='active';h.status_before_archive=null;h.archived_by=null;h.archive_reason=null;h.archived_at=null;};
            } else if(q.includes("house_status = 'accredited'")) {
                id=args[0];canWrite=!!find(id);update=()=>{const h=find(id);h.house_status='accredited';h.compliance_status='active';};
            } else throw Error('Unexpected update '+q);
            if(!canWrite)return [{affectedRows:0}];const work=()=>{update();state.writes++;};if(writes)writes.push(work);else work();return [{affectedRows:1}];
        }
        if(q.startsWith('INSERT INTO notifications')) {if(options.failNotification)throw Error('fixture notification failure');const work=()=>state.notifications.push(args);if(writes)writes.push(work);else work();return [{affectedRows:1}];}
        throw Error('Unexpected query '+q);
    }
    const pool={query,async getConnection(){const writes=[];return {beginTransaction:async()=>{},query:(sql,args)=>query(sql,args,writes),commit:async()=>{writes.splice(0).forEach(f=>f());state.commits++;},rollback:async()=>{writes.length=0;state.rollbacks++;},release(){}};}};
    const evaluateHouseCompliance=async(id)=>{state.evaluations++;if(options.failEvaluation)throw Error('fixture evaluation failure');const h=find(id);const status=getComplianceStatus(h);h.compliance_status=status;if(status==='expired'){h.house_status='archived';h.archived_by='system';}if(options.afterEvaluation)options.afterEvaluation(state);};
    const context={pool,evaluateHouseCompliance};
    return {state,pause:route('backend/routes/owner.js',"router.delete('/boarding-houses/:id'",context),reactivate:route('backend/routes/owner.js',"router.post('/boarding-houses/reactivate/:id'",context),adminArchive:route('backend/routes/admin.js',"router.post('/archive/:id'",context),adminRestore:route('backend/routes/admin.js',"router.post('/restore/:id'",context)};
}
const ownerRequest=(id=1,body={})=>({params:{id},user:{id:9,role:'owner'},body});
const archived={house_status:'archived',archived_by:'owner',status_before_archive:'accredited',archived_at:'old timestamp'};
async function call(handler,req=ownerRequest()){const res=response();await handler(req,res);return res;}
for(const status of ['pending','rejected','archived'])test('Owner cannot pause '+status+' property',async()=>{const f=fixture({house:{house_status:status,archived_by:status==='archived'?'system':null}});const original=JSON.stringify(f.state.houses);const res=await call(f.pause);assert.equal(res.code,403);assert.equal(JSON.stringify(f.state.houses),original);assert.equal(f.state.writes,0);});
for(const status of ['pending','rejected','accredited'])test('Direct owner reactivation cannot accredit '+status+' property',async()=>{const f=fixture({house:{house_status:status}});const res=await call(f.reactivate);assert.equal(res.code,403);assert.equal(f.state.houses[0].house_status,status);assert.equal(f.state.evaluations,0);assert.equal(f.state.writes,0);});
test('Owner-accredited pause/reactivate round trip preserves occupants and records provenance',async()=>{const f=fixture();const req=ownerRequest(1,{reason:'Fully booked'});assert.equal((await call(f.pause,req)).code,200);const h=f.state.houses[0];assert.equal(h.status_before_archive,'accredited');assert.equal(h.house_status,'archived');assert.equal(h.archive_reason,'Fully booked');assert.equal((await call(f.reactivate)).code,200);assert.equal(h.house_status,'accredited');assert.equal(h.archived_by,null);assert.equal(h.status_before_archive,null);assert.equal(h.archive_reason,null);assert.equal(h.archived_at,null);assert(f.state.queries.every(({q})=>!q.includes('occupants')&&!q.includes('bookings')));});
test('Client cannot forge previous accreditation during pause',async()=>{const f=fixture({house:{house_status:'pending'}});const res=await call(f.pause,ownerRequest(1,{status_before_archive:'accredited',house_status:'accredited'}));assert.equal(res.code,403);assert.equal(f.state.houses[0].house_status,'pending');});
test('Client cannot supply accreditation proof during reactivation',async()=>{const f=fixture({house:{...archived,status_before_archive:null}});assert.equal((await call(f.reactivate,ownerRequest(1,{status_before_archive:'accredited'}))).code,403);assert.equal(f.state.writes,0);});
for(const authority of ['admin','system',null])test(authority+' archive cannot be claimed by owner',async()=>{const f=fixture({house:{...archived,archived_by:authority}});assert.equal((await call(f.pause)).code,403);assert.equal((await call(f.reactivate)).code,403);assert.equal(f.state.houses[0].archived_by,authority);assert.equal(f.state.writes,0);});
for(const prior of [null,'pending','rejected','archived'])test('Owner archive with previous status '+prior+' requires SASO review',async()=>{const f=fixture({house:{...archived,status_before_archive:prior}});assert.equal((await call(f.reactivate)).code,403);assert.equal(f.state.evaluations,0);assert.equal(f.state.writes,0);});
test('Expired critical permits retain existing rejection and system archive',async()=>{const f=fixture({house:{...archived,expiry_permit_fire:'2000-01-01'}});const res=await call(f.reactivate);assert.equal(res.code,400);assert.match(res.body.message,/permits have expired/);assert.equal(f.state.houses[0].archived_by,'system');assert.equal(f.state.writes,0);});
test('Supplementary expiry does not block legitimate reactivation',async()=>{const f=fixture({house:{...archived,expiry_permit_dti:'2000-01-01'}});assert.equal((await call(f.reactivate)).code,200);});
test('Administrative comments retain existing reactivation restriction',async()=>{const f=fixture({house:{...archived,admin_comments:'Review required'}});const res=await call(f.reactivate);assert.equal(res.code,403);assert.match(res.body.message,/Review required/);assert.equal(f.state.writes,0);});
test('Evaluation changing archive authority blocks reactivation',async()=>{const f=fixture({house:archived,afterEvaluation:state=>{state.houses[0].archived_by='admin';}});assert.equal((await call(f.reactivate)).code,403);assert.equal(f.state.writes,0);});
test('Owner transfer/deletion after evaluation cannot reactivate stale record',async()=>{const f=fixture({house:archived,afterEvaluation:state=>{state.houses[0].owner_id=99;}});assert.equal((await call(f.reactivate)).code,404);assert.equal(f.state.writes,0);});
for(const handler of ['pause','reactivate'])test('Another owner cannot '+handler+' this property',async()=>{const f=fixture({house:{...archived,owner_id:99}});assert.equal((await call(f[handler])).code,404);assert.equal(f.state.writes,0);});
for(const handler of ['pause','reactivate'])test('Missing property returns 404 on '+handler,async()=>{const f=fixture({houses:[]});assert.equal((await call(f[handler])).code,404);assert.equal(f.state.writes,0);});
test('Concurrent admin archive cannot be overwritten by owner pause',async()=>{const f=fixture({beforeUpdate:(state,q)=>{if(q.includes('status_before_archive = house_status')){state.houses[0].house_status='archived';state.houses[0].archived_by='admin';}}});assert.equal((await call(f.pause)).code,409);assert.equal(f.state.houses[0].archived_by,'admin');assert.equal(f.state.writes,0);});
test('Concurrent admin archive cannot be overwritten by reactivation',async()=>{const f=fixture({house:archived,beforeUpdate:(state,q)=>{if(q.includes('status_before_archive = NULL'))state.houses[0].archived_by='admin';}});assert.equal((await call(f.reactivate)).code,409);assert.equal(f.state.houses[0].archived_by,'admin');assert.equal(f.state.writes,0);});
test('Permit change between verification and update prevents stale reactivation',async()=>{const f=fixture({house:archived,beforeUpdate:(state,q)=>{if(q.includes('status_before_archive = NULL'))state.houses[0].expiry_permit_fire='2000-01-01';}});assert.equal((await call(f.reactivate)).code,409);assert.equal(f.state.houses[0].house_status,'archived');assert.equal(f.state.writes,0);});
test('Two concurrent pause requests record one transition',async()=>{const f=fixture();const results=await Promise.all([call(f.pause),call(f.pause)]);assert.equal(results.filter(r=>r.code===200).length,1);assert.equal(f.state.writes,1);});
test('Two concurrent reactivations record one transition',async()=>{const f=fixture({house:archived});const results=await Promise.all([call(f.reactivate),call(f.reactivate)]);assert.equal(results.filter(r=>r.code===200).length,1);assert.equal(f.state.writes,1);});
test('Repeated pause/reactivate preserves state without duplicate transitions',async()=>{const f=fixture();assert.equal((await call(f.pause)).code,200);assert.equal((await call(f.pause)).code,403);assert.equal((await call(f.reactivate)).code,200);assert.equal((await call(f.reactivate)).code,403);assert.equal(f.state.writes,2);});
test('Accrediting one house does not grant permission to accredit another',async()=>{const f=fixture({houses:[{id:1},{id:2,house_status:'pending'}]});assert.equal((await call(f.pause)).code,200);assert.equal((await call(f.reactivate,ownerRequest(2))).code,403);assert.equal((await call(f.pause,ownerRequest(2))).code,403);assert.equal(f.state.houses[1].house_status,'pending');assert.equal((await call(f.reactivate)).code,200);});
test('Admin archive without reason explicitly replaces owner archive authority',async()=>{const f=fixture({house:archived});assert.equal((await call(f.adminArchive)).code,200);assert.equal(f.state.houses[0].archived_by,'admin');assert.equal(f.state.houses[0].status_before_archive,'accredited');assert.equal(f.state.houses[0].admin_comments,null);assert.equal((await call(f.reactivate)).code,403);assert.equal(f.state.notifications.length,1);});
for(const status of ['accredited','pending','rejected'])test('Admin archive records '+status+' as prior status',async()=>{const f=fixture({house:{house_status:status}});assert.equal((await call(f.adminArchive,ownerRequest(1,{reason:'SASO review'}))).code,200);assert.equal(f.state.houses[0].status_before_archive,status);assert.equal(f.state.houses[0].archive_reason,'SASO review');assert.equal(f.state.houses[0].admin_comments,'SASO review');});
test('Failed admin notification rolls back archive authority change',async()=>{const f=fixture({house:archived,failNotification:true});assert.equal((await call(f.adminArchive)).code,500);assert.equal(f.state.houses[0].archived_by,'owner');assert.equal(f.state.writes,0);});
test('Existing admin restore followed by a new owner pause remains valid',async()=>{const f=fixture({house:{...archived,archived_by:'admin'}});assert.equal((await call(f.adminRestore)).code,200);assert.equal((await call(f.pause)).code,200);assert.equal((await call(f.reactivate)).code,200);});
test('Compliance evaluation failure does not reactivate listing',async()=>{const f=fixture({house:archived,failEvaluation:true});assert.equal((await call(f.reactivate)).code,500);assert.equal(f.state.houses[0].house_status,'archived');assert.equal(f.state.writes,0);});
test('Dashboard offers reactivation only to an eligible recorded owner archive',()=>{const source=fs.readFileSync(path.join(root,'frontend/src/views/owner/OwnerDashboard.vue'),'utf8');const match=source.match(/const canReactivateListing = ([\s\S]*?);/);const fn=vm.runInNewContext('('+match[1]+')');assert.equal(fn({...archived,compliance:'active'}),true);for(const extra of [{house_status:'pending'},{archived_by:'admin'},{archived_by:'system'},{status_before_archive:null},{status_before_archive:'pending'},{compliance:'expired'},{admin_comments:'Review'}])assert.equal(fn({...archived,compliance:'active',...extra}),false);assert(source.includes('v-if="house.house_status === \'accredited\'" class="mt-2'));assert(source.includes('v-else-if="canReactivateListing(house)"'));});
