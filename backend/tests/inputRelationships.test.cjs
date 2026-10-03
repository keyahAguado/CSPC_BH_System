const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const test=require('node:test'),assert=require('node:assert/strict');
const validation=import(pathToFileURL(path.join(__dirname,'../config/inputValidation.js')).href);
const response=()=>({code:200,status(code){this.code=code;return this;},json(body){this.body=body;}});
function handler(file,route,context) {
    const source=fs.readFileSync(path.join(__dirname,'../routes',file),'utf8');
    const start=source.indexOf('async (req, res) => {',source.indexOf("router.post('"+route+"'"));
    const end=source.indexOf('\n});',start);
    return vm.runInNewContext('('+source.slice(start,end+2)+')',{console:{error(){},log(){}},...context});
}
for(const [name,rows,fail] of [['active course',[{id:1}],false],['unchanged historical course',[{id:1}],false],['unknown/inactive new course',[],false],['course lookup unavailable',[],true]])test(name+' is handled before profile upload/write',async()=>{
    const api=await validation;let reached=false;const queries=[];
    const middleware=api.validateStudentCourse({async query(sql,args){queries.push({sql,args});if(fail)throw Error('private SQL error');return [rows];}});
    const res=response();await middleware({user:{id:1},body:{course:'BSIT'}},res,()=>{reached=true;});
    assert.equal(reached,rows.length>0&&!fail);
    assert.equal(res.code,fail?503:rows.length?200:400);
    assert(queries[0].sql.includes('course = ? OR EXISTS'));assert(queries[0].sql.includes('is_active = 1'));
    assert.deepEqual(queries[0].args,[1,'BSIT','BSIT']);
    if(res.body)assert(!res.body.message.includes('SQL'));
});
test('Blank optional course leaves the existing save flow available',async()=>{
    const api=await validation;let reached=false;await api.validateStudentCourse({query(){assert.fail();}})({body:{course:''}},response(),()=>{reached=true;});assert(reached);
});
for(const applicable of [[{id:1},{id:2}],[{id:1}],[]])test('Accreditation checks selected criteria before changing statuses: '+applicable.length,async()=>{
    const state={writes:[],rollback:0,commit:0,release:0,queries:[]};
    const connection={beginTransaction:async()=>{},async query(sql,args){state.queries.push({sql,args});if(sql.startsWith('SELECT owner_id'))return [[{owner_id:2,name:'House'}]];if(sql.startsWith('SELECT id FROM checklist_criteria'))return [applicable];state.writes.push(sql);return [{affectedRows:1}];},async rollback(){state.rollback++;},async commit(){state.commit++;},release(){state.release++;}};
    const fn=handler('admin.js','/approve/:id',{pool:{getConnection:async()=>connection}});
    const res=response();await fn({params:{id:1},body:{checklist:[1,2],admin_comments:''}},res);
    assert.equal(res.code,applicable.length===2?200:400);
    assert.equal(state.writes.length>0,applicable.length===2);
    assert.equal(state.rollback,applicable.length===2?0:1);assert.equal(state.release,1);
    const check=state.queries.find(q=>q.sql.startsWith('SELECT id FROM checklist_criteria'));
    assert(check.sql.includes('house_id IS NULL OR house_id = ?'));assert(check.sql.endsWith('FOR UPDATE'));assert.equal(check.args[1],1);
});
for(const target of ['student','occupant','extension'])test(target+' oversized calculated rent rolls back without writing',async()=>{
    const state={writes:0,rollbacks:0,releases:0};
    const connection={beginTransaction:async()=>{},async query(sql){
        if(sql.includes('SHOW COLUMNS'))return [[{Field:'upfront_status'}]];
        if(sql.includes('SELECT r.*'))return [[{id:1,capacity:5,current_count:0,price:99999999.99,gender_type:'male'}]];
        if(sql.includes('SELECT id FROM users'))return [[{id:1}]];
        if(sql.includes('SELECT sex'))return [[{sex:'male'}]];
        if(sql.includes('COUNT(*)'))return [[{count:0}]];
        if(sql.includes('SELECT b.*'))return [[{id:1,status:'confirmed',months:2,is_extension_requested:1,extension_months:2,monthly_rent:99999999.99,amount:99999999.99}]];
        if(sql.startsWith('SELECT'))return [[]];
        state.writes++;throw Error('Unexpected write');
    },async rollback(){state.rollbacks++;},release(){state.releases++;},commit(){assert.fail();}};
    const route=target==='student'?'/book/:houseId':target==='occupant'?'/rooms/occupants/add/:roomId':'/bookings/approve-extension/:id';
    const fn=handler(target==='student'?'student.js':'owner.js',route,{pool:{getConnection:async()=>connection},getRoomCapacityUsage:async()=>({occupants:0,reserved:0})});
    const res=response();await fn({params:{id:1,houseId:1,roomId:1},user:{id:1,role:'student'},body:{roomId:1,months:2,check_in_date:'2026-12-30'}},res);
    assert.equal(res.code,400);assert.match(res.body.message,/supported amount/);assert.equal(state.writes,0);assert.equal(state.rollbacks,1);assert.equal(state.releases,1);
});
for(const target of ['request','approve'])test('Extension '+target+' rejects a check-out year beyond 9999 without writing',async()=>{
    let rollback=0,release=0,writes=0;
    const connection={beginTransaction:async()=>{},async query(sql){if(sql.startsWith('SELECT'))return [[{id:1,status:'confirmed',months:1,is_extension_requested:target==='approve'?1:0,extension_months:2,monthly_rent:0,amount:0,check_in_date:'9999-11-30'}]];writes++;return [{}];},async rollback(){rollback++;},release(){release++;},commit(){assert.fail();}};
    const fn=handler(target==='request'?'student.js':'owner.js',target==='request'?'/bookings/extend/:id':'/bookings/approve-extension/:id',{pool:{getConnection:async()=>connection}});
    const res=response();await fn({params:{id:1},user:{id:1,role:'student'},body:{extension_months:2}},res);
    assert.equal(res.code,400);assert.equal(writes,0);assert.equal(rollback,1);assert.equal(release,1);assert.match(res.body.message,/check-out date/);
});
