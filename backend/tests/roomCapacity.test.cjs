const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.resolve(__dirname, '../routes/owner.js'), 'utf8');
const helperSource = source.slice(source.indexOf('async function getRoomCapacityUsage'), source.indexOf('// F1. PUT - Edit an existing room'));
function routes(method, name, pool) {
    const context = vm.createContext({pool, console:{error(){}}});
    vm.runInContext(helperSource, context);
    const result=[];let offset=0;
    while((offset=source.indexOf("router."+method+"('"+name+"'",offset))>=0){const arrow=source.indexOf('async (req, res) => {',offset),end=source.indexOf('\n});',arrow);result.push(vm.runInContext('('+source.slice(arrow,end+2)+')',context));offset=end+5;}
    assert(result.length);return result;
}
function fixture(options={}) {
    const state={room:{id:3,house_id:4,owner_id:9,capacity:options.capacity??2,price:1000,deleted_at:options.archived?'archived':null},occupants:(options.occupants||[]).map(o=>({room_id:3,...o})),bookings:(options.bookings||[]).map(b=>({id:1,student_id:2,house_id:4,room_id:3,status:'confirmed',payment_method:'paymongo',payment_status:'unpaid',...b})),queries:[],commits:0,rollbacks:0,releases:0,schemaPresent:!options.missingColumn,alters:0};
    let tail=Promise.resolve();
    const active=o=>!o.check_out_date||o.futureCheckout;
    const occupants=()=>state.occupants.filter(o=>o.room_id===3&&active(o));
    const reserved=()=>state.bookings.filter(b=>b.room_id===3&&b.status==='confirmed'&&b.payment_method==='paymongo'&&b.payment_status!=='paid'&&!state.occupants.some(o=>o.reference_no==='REF-'+String(b.id).padStart(4,'0')&&active(o)));
    const pool={async getConnection(){let inTransaction=false,unlock,held=false;const writes=[];
        return {async beginTransaction(){inTransaction=true;},async commit(){writes.splice(0).forEach(f=>f());inTransaction=false;state.commits++;unlock?.();unlock=undefined;},async rollback(){writes.length=0;inTransaction=false;state.rollbacks++;unlock?.();unlock=undefined;},release(){state.releases++;unlock?.();unlock=undefined;},async query(sql,args=[]){const q=sql.replace(/\s+/g,' ').trim();state.queries.push({q,args,inTransaction});
            if(q.includes('FROM rooms r')&&q.startsWith('SELECT')) {
                if(q.endsWith('FOR UPDATE')){assert(inTransaction);if(!held){const previous=tail;tail=new Promise(r=>{unlock=r;});await previous;held=true;}}
                const eligible=args[1]===state.room.owner_id&&(!q.includes('r.deleted_at IS NULL')||!state.room.deleted_at);
                return [eligible?[{...state.room,current_count:occupants().length}]:[]];
            }
            if(q.startsWith('SELECT COUNT(*) AS count FROM occupants')) {assert(held,'Capacity read must follow room lock');return [[{count:occupants().length}]];}
            if(q.startsWith('SELECT COUNT(*) AS count FROM bookings')) {assert(held);assert(q.includes("b.status = 'confirmed'"));assert(q.includes("b.payment_method = 'paymongo'"));assert(q.includes('NOT EXISTS'));return [[{count:reserved().length}]];}
            if(q.startsWith('SELECT b.*, u.name'))return [state.bookings.filter(b=>b.id==args[0]).map(b=>({...b,student_name:'Student'}))];
            if(q.startsWith('SELECT id FROM users'))return [[{id:args[0]}]];
            if(q.startsWith('SELECT * FROM bookings'))return [state.bookings.filter(b=>b.id==args[0]).map(b=>({...b}))];
            if(q.startsWith('SELECT id FROM bookings WHERE student_id'))return [state.bookings.filter(b=>b.student_id==args[0]&&b.id!=args[1]&&b.status==='confirmed')];
            if(q.startsWith('SELECT id FROM occupants WHERE student_id'))return [state.occupants.filter(o=>o.student_id==args[0]&&active(o))];
            if(q.startsWith('SELECT b.id FROM bookings')){assert(held);return [reserved().map(b=>({id:b.id}))];}
            if(q.startsWith('SELECT id FROM occupants WHERE room_id')){assert(held);return [occupants()];}
            if(q.startsWith("UPDATE bookings SET status = 'confirmed'")){writes.push(()=>{state.bookings.find(b=>b.id==args[0]).status='confirmed';});return [{affectedRows:1}];}
            if(q.startsWith('INSERT INTO notifications'))return [{affectedRows:1}];
            if(q.startsWith('SELECT id FROM rooms WHERE house_id'))return [options.duplicateRoom?[{id:99}]:[]];
            if(q.startsWith('SHOW COLUMNS'))return [state.schemaPresent?[{Field:'upfront_status'}]:[]];
            if(q.startsWith('ALTER TABLE')){assert(!inTransaction,'Existing lazy DDL must not release transaction locks');state.alters++;state.schemaPresent=true;return [{affectedRows:0}];}
            if(q.startsWith('INSERT INTO occupants')){assert(held&&inTransaction);if(options.failInsert)throw Error('fixture insert failure');writes.push(()=>state.occupants.push({id:state.occupants.length+1,room_id:args[0],name:args[1],months:args[8],amount:args[9],payment_status:args[10],upfront_status:args[11]}));return [{affectedRows:1}];}
            if(q.startsWith('UPDATE rooms SET room_number')){assert(held&&inTransaction);writes.push(()=>{state.room.room_number=args[0];state.room.capacity=args[2];if(q.includes('price = ?'))state.room.price=args[3];});return [{affectedRows:1}];}
            if(q.startsWith('UPDATE rooms SET deleted_at')){assert(held&&inTransaction);writes.push(()=>{state.room.deleted_at='archived';});return [{affectedRows:1}];}
            throw Error('Unexpected query '+q);
        }};
    }};
    return {state,pool};
}
const request=(body={})=>({user:{id:9,role:'owner'},params:{roomId:3},body:{name:'Manual occupant',room_number:'1',capacity:2,months:3,payment_status:'Not Paid',upfront_status:'Unpaid',...body}});
function response(){return {code:200,status(n){this.code=n;return this;},json(body){this.body=body;return this;}};}
async function run(f,method,name,body={},index=0){const res=response();await routes(method,name,f.pool)[index](request(body),res);return res;}
const add='/rooms/occupants/add/:roomId',edit='/rooms/edit/:roomId',archive='/rooms/delete/:roomId';
test('Existing full-occupant guard keeps its message',async()=>{const f=fixture({capacity:1,occupants:[{}]});const res=await run(f,'post',add);assert.equal(res.code,400);assert.equal(res.body.message,'Room has reached maximum occupant capacity.');assert.equal(f.state.occupants.length,1);});
test('Manual addition cannot take last approved online reservation slot',async()=>{const f=fixture({occupants:[{}],bookings:[{}]});const res=await run(f,'post',add);assert.equal(res.code,400);assert.match(res.body.message,/reserved/);assert.equal(f.state.occupants.length,1);assert.equal(f.state.rollbacks,1);});
test('Manual addition works when another unreserved slot exists',async()=>{const f=fixture({capacity:3,occupants:[{}],bookings:[{}]});const res=await run(f,'post',add);assert.equal(res.code,200);assert.equal(f.state.occupants.length,2);const o=f.state.occupants[1];assert.equal(o.months,3);assert.equal(o.amount,3000);assert.equal(o.payment_status,'Not Paid');assert.equal(o.upfront_status,'Unpaid');});
for(const status of ['pending','cancelled','rejected','completed'])test(status+' requests do not reserve a slot',async()=>{const f=fixture({capacity:1,bookings:[{status}]});assert.equal((await run(f,'post',add)).code,200);});
test('Cash bookings do not count twice against their occupants',async()=>{const f=fixture({capacity:2,occupants:[{reference_no:'REF-0001'}],bookings:[{payment_method:'cash'}]});assert.equal((await run(f,'post',add)).code,200);});
test('Legacy online resident marked rent due is not counted twice',async()=>{const f=fixture({capacity:2,occupants:[{reference_no:'REF-0001'}],bookings:[{}]});assert.equal((await run(f,'post',add)).code,200);});
test('Confirmed paid booking with occupant is counted only as occupancy',async()=>{const f=fixture({capacity:2,occupants:[{reference_no:'REF-0001'}],bookings:[{payment_status:'paid'}]});assert.equal((await run(f,'post',add)).code,200);});
test('Future checkout consumes capacity; past checkout does not',async()=>{const f=fixture({capacity:2,occupants:[{check_out_date:'future',futureCheckout:true},{check_out_date:'past'}],bookings:[{}]});assert.equal((await run(f,'post',add)).code,400);});
test('Other room reservations do not block manual addition',async()=>{const f=fixture({capacity:1,bookings:[{room_id:99}]});assert.equal((await run(f,'post',add)).code,200);});
for(const index of [0,1]) {
    test('Capacity edit '+index+' blocks below occupied plus reserved count',async()=>{const f=fixture({capacity:3,occupants:[{}],bookings:[{}]});assert.equal((await run(f,'put',edit,{capacity:1},index)).code,400);assert.equal(f.state.room.capacity,3);});
    test('Capacity edit '+index+' allows exact committed count',async()=>{const f=fixture({capacity:3,occupants:[{}],bookings:[{}]});assert.equal((await run(f,'put',edit,{capacity:2},index)).code,200);assert.equal(f.state.room.capacity,2);});
    test('Capacity edit '+index+' retains occupant-only guard',async()=>{const f=fixture({capacity:3,occupants:[{},{}]});const res=await run(f,'put',edit,{capacity:1},index);assert.equal(res.code,400);assert.match(res.body.message,/2 active occupant/);});
    test('Room archive '+index+' blocks approved unpaid online reservation',async()=>{const f=fixture({bookings:[{}]});assert.equal((await run(f,'delete',archive,{},index)).code,400);assert.equal(f.state.room.deleted_at,null);});
    test('Room archive '+index+' retains active-occupant protection',async()=>{const f=fixture({occupants:[{}]});assert.equal((await run(f,'delete',archive,{},index)).code,400);assert.equal(f.state.room.deleted_at,null);});
    test('Room archive '+index+' allows pending requests without deleting history',async()=>{const f=fixture({bookings:[{status:'pending'}]});assert.equal((await run(f,'delete',archive,{},index)).code,200);assert.equal(f.state.room.deleted_at,'archived');assert.equal(f.state.bookings[0].status,'pending');});
}
test('Archived room cannot receive manual occupant through direct URL',async()=>{const f=fixture({archived:true});assert.equal((await run(f,'post',add)).code,404);assert.equal(f.state.occupants.length,0);});
test('Two simultaneous manual additions cannot take the final place twice',async()=>{const f=fixture({capacity:1});const results=await Promise.all([run(f,'post',add),run(f,'post',add)]);assert.equal(results.filter(r=>r.code===200).length,1);assert.equal(f.state.occupants.length,1);});
test('Capacity edit and manual addition cannot leave more occupants than capacity',async()=>{const f=fixture({capacity:2,occupants:[{}]});await Promise.all([run(f,'put',edit,{capacity:1}),run(f,'post',add)]);assert(f.state.occupants.length<=f.state.room.capacity);});
test('Archive and manual addition cannot produce an occupied archived room',async()=>{const f=fixture({capacity:1});await Promise.all([run(f,'delete',archive),run(f,'post',add)]);assert(!(f.state.room.deleted_at&&f.state.occupants.length));});
test('Existing first-use column setup runs before locking transaction',async()=>{const f=fixture({missingColumn:true});assert.equal((await run(f,'post',add)).code,200);assert.equal(f.state.alters,1);assert.equal(f.state.occupants.length,1);});
test('Failed manual insertion rolls back and releases room lock',async()=>{const f=fixture({failInsert:true});assert.equal((await run(f,'post',add)).code,500);assert.equal(f.state.occupants.length,0);assert.equal(f.state.commits,0);assert.equal(f.state.rollbacks,1);assert.equal(f.state.releases,1);});
for(const [method,name]of [['post',add],['put',edit],['delete',archive]])test('Connection failure is handled on '+name,async()=>{const res=response();await routes(method,name,{getConnection:async()=>{throw Error('fixture offline');}})[0](request(),res);assert.equal(res.code,500);});

async function approve(f){const res=response(),req=request();req.params.id=1;await routes('post','/bookings/approve/:id',f.pool)[0](req,res);return res;}
test('Manual addition and online approval cannot both take final slot',async()=>{const f=fixture({capacity:1,bookings:[{status:'pending'}]});const result=await Promise.all([run(f,'post',add),approve(f)]);assert.equal(result.filter(r=>r.code===200).length,1);assert(f.state.occupants.length+f.state.bookings.filter(b=>b.status==='confirmed').length<=1);});
test('Online approval first reserves the slot against manual addition',async()=>{const f=fixture({capacity:1,bookings:[{status:'pending'}]});assert.equal((await approve(f)).code,200);assert.equal((await run(f,'post',add)).code,400);assert.equal(f.state.occupants.length,0);});
test('Archive and online approval cannot leave an approved reservation in newly archived room',async()=>{const f=fixture({capacity:1,bookings:[{status:'pending'}]});await Promise.all([run(f,'delete',archive),approve(f)]);assert(!(f.state.room.deleted_at&&f.state.bookings[0].status==='confirmed'));});
test('Capacity reduction and online approval respect occupied and reserved total',async()=>{const f=fixture({capacity:2,occupants:[{}],bookings:[{status:'pending'}]});await Promise.all([run(f,'put',edit,{capacity:1}),approve(f)]);assert(f.state.occupants.length+f.state.bookings.filter(b=>b.status==='confirmed').length<=f.state.room.capacity);});
