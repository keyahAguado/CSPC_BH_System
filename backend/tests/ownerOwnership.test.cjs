const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.resolve(__dirname, '../routes/owner.js'), 'utf8');
function handlers(method, route, pool) {
    const result = []; let offset = 0;
    const marker = "router." + method + "('" + route + "'";
    while ((offset = source.indexOf(marker, offset)) >= 0) {
        const arrow = source.indexOf('async (req, res) => {', offset);
        const end = source.indexOf('\n});', arrow);
        assert(source.slice(offset, arrow).includes('authenticateToken, verifyOwner'));
        result.push(vm.runInNewContext('(' + source.slice(arrow, end + 2) + ')', {pool, console: {error() {}, log() {}}}));
        offset = end + 5;
    }
    assert(result.length > 0);
    return result;
}
function response() { return {code:200, status(n){this.code=n;return this;},json(body){this.body=body;return this;}}; }
function fixture({ownerId = 10, exists = true, studentId = null, failUpdate = false} = {}) {
    const state = {queries:[], updates:[], committed:0, rolledBack:0, released:0};
    const connection = {
        async beginTransaction() {}, async commit() {state.committed++;}, async rollback() {state.rolledBack++;}, release(){state.released++;},
        async query(sql, args) {
            const q=sql.replace(/\s+/g,' ').trim(); state.queries.push({sql:q,args});
            if(q.startsWith('SELECT')) {
                assert(q.includes('bh.owner_id = ?'), 'Ownership must be part of the actual SQL predicate');
                return [exists && args[1] === ownerId ? [{id:7,student_id:studentId,room_id:3,house_name:'Test house'}] : []];
            }
            if(q.startsWith('ALTER')) { const e = new Error('fixture column already exists'); e.code='ER_DUP_FIELDNAME'; throw e; }
            if(q.startsWith('UPDATE')) {if(failUpdate) throw Error('fixture write failed');state.updates.push({sql:q,args});return [{affectedRows:1}];}
            if(q.startsWith('INSERT INTO notifications')) return [{affectedRows:1}];
            throw Error('Unexpected query '+q);
        }
    };
    return {state,pool:{getConnection:async()=>connection,query:connection.query.bind(connection)}};
}
const request=(status)=>({params:{id:'7',roomId:'3'},user:{id:10,role:'owner'},body:{status,room_number:'1',capacity:2}});
for(const status of ['Paid','Unpaid',undefined]) for(const studentId of [null,2]) test('Owned '+(studentId?'CSPC cash':'non-CSPC')+' upfront toggle preserves '+status,async()=>{
    const f=fixture({studentId}),res=response();await handlers('post','/rooms/occupants/upfront-payment/:id',f.pool)[0](request(status),res);
    assert.equal(res.code,200);assert.equal(res.body.success,true);assert.equal(f.state.committed,1);assert.equal(f.state.released,1);
    assert.equal(f.state.updates.length,1);assert.equal(f.state.updates[0].args[0],status||'Paid');assert.equal(f.state.updates[0].args[1],'7');
    assert.equal(f.state.queries[0].args[1],10);assert(f.state.queries[0].sql.startsWith('SELECT o.id'));
    assert(!f.state.updates.some(q=>q.sql.includes('payment_status')||q.sql.includes('bookings')));
});
for(const settings of [{ownerId:99},{exists:false}])test('Missing or other-owner upfront record blocked before update/schema check '+JSON.stringify(settings),async()=>{
    const f=fixture(settings),res=response();await handlers('post','/rooms/occupants/upfront-payment/:id',f.pool)[0](request('Paid'),res);
    assert.equal(res.code,404);assert.equal(f.state.committed,0);assert.equal(f.state.rolledBack,1);assert.equal(f.state.released,1);
    assert.equal(f.state.queries.length,1);assert.equal(f.state.updates.length,0);
});
test('Upfront ownership lookup failure prevents writes',async()=>{const f=fixture();f.pool.getConnection=async()=>({beginTransaction:async()=>{},query:async()=>{throw Error('fixture lookup failed');},rollback:async()=>{f.state.rolledBack++;},release(){f.state.released++;}});const res=response();await handlers('post','/rooms/occupants/upfront-payment/:id',f.pool)[0](request('Paid'),res);assert.equal(res.code,500);assert.equal(f.state.rolledBack,1);assert.equal(f.state.updates.length,0);});
test('Upfront update failure returns error and releases connection',async()=>{const f=fixture({failUpdate:true}),res=response();await handlers('post','/rooms/occupants/upfront-payment/:id',f.pool)[0](request('Unpaid'),res);assert.equal(res.code,500);assert.equal(f.state.committed,0);assert.equal(f.state.released,1);});
for(const [method,route] of [['put','/rooms/edit/:roomId'],['delete','/rooms/delete/:roomId'],['post','/rooms/restore/:roomId'],['post','/rooms/occupants/add/:roomId'],['post','/rooms/occupants/payment/:id'],['post','/rooms/occupants/checkout/:id']])test('Existing ownership protection remains effective on '+route,async()=>{
    const f=fixture({ownerId:99});for(const handler of handlers(method,route,f.pool)){const res=response();await handler(request('Paid'),res);assert.equal(res.code,404);assert.equal(f.state.updates.length,0);assert(f.state.queries.every(q=>q.sql.startsWith('SELECT')));}
});
for(const studentId of [null,2])test('Correct-owner checkout still follows existing '+(studentId?'student':'manual occupant')+' workflow',async()=>{const f=fixture({studentId}),res=response();await handlers('post','/rooms/occupants/checkout/:id',f.pool)[0](request(),res);assert.equal(res.code,200);assert(f.state.updates[0].sql.includes('check_out_date = CURDATE()'));assert.equal(f.state.updates.length,studentId?2:1);assert.equal(f.state.committed,1);});
const middleware = vm.runInNewContext('('+source.match(/const verifyOwner = ([\s\S]*?\n});/)[1]+')');
for(const role of ['student','admin',undefined])test('Existing role middleware rejects '+role,()=>{const res=response();let next=false;middleware({user:{role}},res,()=>{next=true;});assert.equal(res.code,403);assert.equal(next,false);});
