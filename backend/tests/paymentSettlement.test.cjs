const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
function helpers(mode = 'test', secret = 'fixture-secret') {
    const source = fs.readFileSync(path.join(root, 'backend/config/paymentSettlement.js'), 'utf8').replace("import crypto from 'crypto';", '').replaceAll('export ', '');
    const env = { PAYMONGO_SECRET_KEY: 'sk_' + mode + '_fixture', PAYMONGO_WEBHOOK_SECRET: secret };
    return vm.runInNewContext(source + ';({paymentError,providerOptions,verifyWebhook,paidSession,settlePayment})', {crypto, process: {env}, Buffer, Date});
}
function session(overrides = {}) {
    return {id:'cs_fixture', attributes:{livemode:false, metadata:{bookingId:'1'}, line_items:[{amount:200000,quantity:1,currency:'PHP'}], payments:[{id:'pay_fixture',attributes:{status:'paid',amount:200000,currency:'PHP'}}], ...overrides}};
}
function fixture(options = {}) {
    const b = {id:1, student_id:2, room_id:3, house_id:4, status:'confirmed', payment_method:'paymongo', payment_status:'unpaid', paymongo_session_id:'cs_fixture', ...options.booking};
    const state = {b, occupants:options.existing ? [{id:7,reference_no:'REF-0001'}] : [], notifications:[], rollbacks:0};
    let last = Promise.resolve();
    const pool = {async getConnection() {
        const writes = []; let unlock; let held = false;
        return {async beginTransaction(){}, async commit(){ writes.splice(0).forEach(f=>f()); unlock?.(); unlock=undefined;}, async rollback(){writes.length=0; state.rollbacks++;unlock?.();unlock=undefined;}, release(){unlock?.();},
            async query(sql,args=[]) {
                const q=sql.replace(/\s+/g,' ').trim();
                if(q.startsWith('SELECT student_id FROM bookings')) return [[{student_id:b.student_id}]];
                if(q.startsWith('SELECT id FROM users')) { if(!held){ const prior=last; last=new Promise(r=>{unlock=r;});await prior;held=true;}return [[{id:2}]];}
                if(q.startsWith('SELECT * FROM bookings')) return [[{...b}]];
                if(q.startsWith('SELECT id FROM occupants WHERE reference_no')) return [state.occupants.map(o=>({...o}))];
                if(q.startsWith('SELECT r.id, r.capacity FROM rooms')) return [options.missingRoom ? [] : [{id:3,capacity:options.capacity ?? 2}]];
                if(q.startsWith('SELECT id FROM occupants WHERE student_id')) return [options.active ? [{id:8}] : []];
                if(q.startsWith('SELECT id FROM occupants WHERE room_id')) return [options.full ? [{id:9},{id:10}] : state.occupants];
                if(q.startsWith('SELECT id FROM bookings WHERE student_id')) return [options.otherBooking ? [{id:8}] : []];
                if(q.startsWith('SELECT b.id FROM bookings')) return [options.reserved ? [{id:12},{id:13}] : []];
                if(q.startsWith('SELECT b.*, u.name')) return [[{...b,student_name:'Test Student',house_owner_id:9,room_number:'1',check_in_date:'2026-10-02',months:2,amount:2000}]];
                if(q.startsWith('UPDATE bookings SET paymongo_session_id')) { writes.push(()=>{b.paymongo_session_id=args[0];});return [{affectedRows:1}]; }
                if(q.startsWith('UPDATE bookings SET payment_status')) { writes.push(()=>{b.payment_status='paid';b.paymongo_payment_id=args[0];});return [{affectedRows:1}]; }
                if(q.startsWith('INSERT INTO occupants')) { writes.push(()=>state.occupants.push({id:7,reference_no:args[2]}));return [{affectedRows:1}]; }
                if(q.startsWith('INSERT INTO notifications')) { if(options.failNotification)throw Error('fixture database failure');writes.push(()=>state.notifications.push(args));return [{affectedRows:1}]; }
                throw Error('Unhandled query: '+q);
            }
        };
    }};
    return {pool,state};
}
const h=helpers();
test('Unpaid provider session cannot settle despite browser success URL', async()=>{const f=fixture();await assert.rejects(h.settlePayment(f.pool,1,session({payments:[]} ),2), /not confirmed/);assert.equal(f.state.b.payment_status,'unpaid');assert.equal(f.state.occupants.length,0);});
for(const [name, modify] of [
    ['wrong session',s=>{s.id='cs_other';}],['wrong booking',s=>{s.attributes.metadata.bookingId='99';}],
    ['wrong amount',s=>{s.attributes.payments[0].attributes.amount=1;}],['wrong currency',s=>{s.attributes.payments[0].attributes.currency='USD';}],
    ['wrong mode',s=>{s.attributes.livemode=true;}],['invalid line items',s=>{s.attributes.line_items=[];}]
]) test(name+' is rejected without payment writes',async()=>{const f=fixture(),s=session();modify(s);await assert.rejects(h.settlePayment(f.pool,1,s,2));assert.equal(f.state.b.payment_status,'unpaid');});
test('Paid settlement uses provider amount and one occupant',async()=>{const f=fixture();const result=await h.settlePayment(f.pool,1,session(),2);assert.equal(result.requiresReview,false);assert.equal(f.state.b.paymongo_payment_id,'pay_fixture');assert.equal(f.state.occupants.length,1);assert.match(f.state.notifications[0][1],/2,000\.00/);});
test('Concurrent return and webhook create one occupant and notification pair',async()=>{const f=fixture();await Promise.all([h.settlePayment(f.pool,1,session(),2),h.settlePayment(f.pool,1,session())]);assert.equal(f.state.occupants.length,1);assert.equal(f.state.notifications.length,2);});
test('Rent due cannot make the same paid transaction settle twice',async()=>{const f=fixture({existing:true,booking:{payment_status:'unpaid',paymongo_payment_id:'pay_fixture'}});await h.settlePayment(f.pool,1,session(),2);assert.equal(f.state.occupants.length,1);assert.equal(f.state.notifications.length,0);});
for(const status of ['cancelled','rejected','completed','pending'])test('Late paid '+status+' reservation records payment without occupancy',async()=>{const f=fixture({booking:{status}});const r=await h.settlePayment(f.pool,1,session(),2);assert.equal(r.requiresReview,true);assert.equal(f.state.b.status,status);assert.equal(f.state.b.payment_status,'paid');assert.equal(f.state.occupants.length,0);});
for(const option of ['full','active','otherBooking','missingRoom','reserved'])test(option+' requires owner review without inserting occupancy',async()=>{const f=fixture({[option]:true});const r=await h.settlePayment(f.pool,1,session(),2);assert.equal(r.requiresReview,true);assert.equal(f.state.occupants.length,0);});
test('Database failure rolls back payment and occupant',async()=>{const f=fixture({failNotification:true});await assert.rejects(h.settlePayment(f.pool,1,session(),2),/database failure/);assert.equal(f.state.b.payment_status,'unpaid');assert.equal(f.state.occupants.length,0);});
test('Another student cannot settle booking',async()=>{const f=fixture();await assert.rejects(h.settlePayment(f.pool,1,session(),88),/not found/);});
test('Cash booking cannot be settled online',async()=>{const f=fixture({booking:{payment_method:'cash'}});await assert.rejects(h.settlePayment(f.pool,1,session(),2),/not an online/);});
test('Signed legacy session can be recorded without duplicate occupant',async()=>{const f=fixture({existing:true,booking:{paymongo_session_id:null}});await h.settlePayment(f.pool,1,session(),undefined,true);assert.equal(f.state.b.paymongo_session_id,'cs_fixture');assert.equal(f.state.occupants.length,1);});
test('Browser cannot bind arbitrary legacy session',async()=>{const f=fixture({booking:{paymongo_session_id:null}});await assert.rejects(h.settlePayment(f.pool,1,session(),2),/does not match/);});
function signed(mode='test',age=0,secret='fixture-secret') {const rawBody=JSON.stringify({data:{attributes:{type:'checkout_session.payment.paid',data:session()}}});const t=String(Math.floor(Date.now()/1000)-age);const sig=crypto.createHmac('sha256',secret).update(t+'.'+rawBody).digest('hex');return {rawBody,headers:{'paymongo-signature':'t='+t+',te='+(mode==='test'?sig:'')+',li='+(mode==='live'?sig:'')}};}
for(const mode of ['test','live'])test(mode+' webhook signature is accepted',()=>{assert.equal(helpers(mode).verifyWebhook(signed(mode)).data.attributes.type,'checkout_session.payment.paid');});
test('Empty webhook secret is refused',()=>assert.throws(()=>helpers('test','').verifyWebhook(signed()),/not configured/));
test('Wrong webhook mode signature is refused',()=>assert.throws(()=>h.verifyWebhook(signed('live')),/signature/));
test('Forged webhook signature is refused',()=>assert.throws(()=>h.verifyWebhook(signed('test',0,'wrong')),/signature/));
test('Stale webhook is refused',()=>assert.throws(()=>h.verifyWebhook(signed('test',600)),/Expired/));
test('Parsed body cannot replace raw body for signature checks',()=>{const req=signed();delete req.rawBody;assert.throws(()=>h.verifyWebhook(req),/raw payload/);});
function route(file,name,context){const source=fs.readFileSync(path.join(root,file),'utf8');const start=source.indexOf("router.post('"+name+"'");const arrow=source.indexOf('async (req, res) => {',start);const end=source.indexOf('\n});',arrow);return vm.runInNewContext('('+source.slice(arrow,end+2)+')',{console:{error(){}},...context});}
function response(){return {code:200,status(n){this.code=n;return this;},json(b){this.body=b;return this;},send(b){this.body=b;return this;}};}
test('Webhook database failure is not acknowledged as successful',async()=>{const handler=route('backend/routes/payment.js','/webhook',{...h,axios:{get:async()=>({data:{data:session()}})},pool:{},settlePayment:async()=>{throw Error('database unavailable');}});const res=response();await handler(signed(),res);assert.equal(res.code,500);});
test('Browser verification requires retrieved paid session',async()=>{let settled=false;const handler=route('backend/routes/payment.js','/verify-payment',{...h,pool:{query:async()=>[[{payment_method:'paymongo',paymongo_session_id:'cs_fixture'}]]},axios:{get:async()=>{throw Error('network');}},settlePayment:async()=>{settled=true;}});const res=response();await handler({user:{id:2,role:'student'},body:{bookingId:1}},res);assert.equal(res.code,502);assert.equal(settled,false);});
for(const method of ['cash','paymongo'])test('Owner booking payment '+method+' guard preserves online settlement',async()=>{const queries=[];const conn={beginTransaction:async()=>{},rollback:async()=>{},commit:async()=>{},release(){},query:async(sql)=>{queries.push(sql);return sql.includes('SELECT b.student_id')?[[{student_id:2,room_id:3,payment_method:method}]]:[{affectedRows:1}];}};const handler=route('backend/routes/owner.js','/bookings/payment/:id',{pool:{getConnection:async()=>conn}});const res=response();await handler({user:{id:9},params:{id:1},body:{status:'paid'}},res);assert.equal(res.code,method==='cash'?200:409);assert.equal(queries.some(q=>q.startsWith('UPDATE bookings')),method==='cash');});
test('Monthly rent update syncs cash only and enforces ownership',async()=>{const queries=[];const conn={beginTransaction:async()=>{},rollback:async()=>{},commit:async()=>{},release(){},query:async(sql)=>{queries.push(sql);return sql.includes('SELECT o.student_id')?[[{student_id:2,room_id:3}]]:[{affectedRows:1}];}};const handler=route('backend/routes/owner.js','/rooms/occupants/payment/:id',{pool:{getConnection:async()=>conn}});const res=response();await handler({user:{id:9},params:{id:7},body:{status:'Not Paid'}},res);assert.equal(res.code,200);assert(queries.find(q=>q.startsWith('UPDATE bookings')).includes("payment_method = 'cash'"));assert(queries[0].includes('bh.owner_id = ?'));});

function checkoutFixture(booking = {}, existingSession, oldOccupant = false) {
    const b={id:1,student_id:2,status:'confirmed',payment_method:'paymongo',payment_status:'unpaid',monthly_rent:1000,advance_months:1,deposit_months:1,...booking};
    const state={created:0,saved:[],commits:0};
    const connection={beginTransaction:async()=>{},commit:async()=>{state.commits++;},rollback:async()=>{},release(){},query:async(sql,args)=>{
        if(sql.startsWith('SELECT id FROM users'))return [[{id:2}]];
        if(sql.startsWith('SELECT b.*'))return [[b]];
        if(sql.startsWith('SELECT id FROM occupants'))return [oldOccupant?[{id:7}]:[]];
        if(sql.startsWith('UPDATE bookings SET paymongo_session_id')){state.saved.push(args);return [{affectedRows:1}];}
        throw Error('Unhandled checkout query');
    }};
    const axios={get:async()=>({data:{data:existingSession}}),post:async(url,body)=>{state.created++;state.request=body;return {data:{data:{id:'cs_new',attributes:{checkout_url:'https://checkout.paymongo.com/fixture'}}}};}};
    const handler=route('backend/routes/payment.js','/checkout',{...h,axios,pool:{getConnection:async()=>connection},process:{env:{FRONTEND_URL:'https://frontend.example'}},URL});
    return {state,handler};
}
for(const status of ['pending','cancelled','rejected','completed'])test('Cannot create checkout for '+status,async()=>{const f=checkoutFixture({status}),res=response();await f.handler({user:{id:2,role:'student'},body:{bookingId:1},headers:{}},res);assert.equal(res.code,409);assert.equal(f.state.created,0);});
test('New checkout preserves upfront formula and stores session ID before redirect',async()=>{const f=checkoutFixture(),res=response();await f.handler({user:{id:2,role:'student'},body:{bookingId:1},headers:{}},res);assert.equal(res.code,200);assert.equal(f.state.request.data.attributes.line_items[0].amount,200000);assert.equal(f.state.saved[0][0],'cs_new');assert.equal(f.state.commits,1);});
test('Repeated checkout reuses active session',async()=>{const f=checkoutFixture({paymongo_session_id:'cs_fixture'},{attributes:{status:'active',payments:[],checkout_url:'https://checkout.paymongo.com/fixture'}}),res=response();await f.handler({user:{id:2,role:'student'},body:{bookingId:1},headers:{}},res);assert.equal(res.code,200);assert.equal(f.state.created,0);});
test('Expired unpaid checkout can be replaced',async()=>{const f=checkoutFixture({paymongo_session_id:'cs_fixture'},{attributes:{status:'expired',payments:[]}}),res=response();await f.handler({user:{id:2,role:'student'},body:{bookingId:1},headers:{}},res);assert.equal(res.code,200);assert.equal(f.state.created,1);});
test('Legacy online occupant is protected against a second checkout',async()=>{const f=checkoutFixture({},undefined,true),res=response();await f.handler({user:{id:2,role:'student'},body:{bookingId:1},headers:{}},res);assert.equal(res.code,409);assert.equal(f.state.created,0);});
for(const booking of [{payment_status:'paid'},{paymongo_payment_id:'pay_fixture'},{payment_method:'cash'}])test('Already settled or cash booking cannot create online checkout '+JSON.stringify(booking),async()=>{const f=checkoutFixture(booking),res=response();await f.handler({user:{id:2,role:'student'},body:{bookingId:1},headers:{}},res);assert.equal(res.code,409);assert.equal(f.state.created,0);});
test('Non-student cannot create checkout',async()=>{const f=checkoutFixture(),res=response();await f.handler({user:{id:2,role:'owner'},body:{bookingId:1},headers:{}},res);assert.equal(res.code,403);});
test('Monthly rent endpoint refuses another owners occupant before writes',async()=>{let writes=0;const conn={beginTransaction:async()=>{},rollback:async()=>{},release(){},query:async(sql)=>{if(sql.startsWith('UPDATE'))writes++;return [[]];}};const handler=route('backend/routes/owner.js','/rooms/occupants/payment/:id',{pool:{getConnection:async()=>conn}});const res=response();await handler({user:{id:9},params:{id:7},body:{status:'Paid'}},res);assert.equal(res.code,404);assert.equal(writes,0);});
test('Non-CSPC rent update does not create or change bookings/upfront payments',async()=>{const queries=[];const conn={beginTransaction:async()=>{},rollback:async()=>{},commit:async()=>{},release(){},query:async(sql)=>{queries.push(sql);return sql.startsWith('SELECT')?[[{student_id:null,room_id:3}]]:[{affectedRows:1}];}};const handler=route('backend/routes/owner.js','/rooms/occupants/payment/:id',{pool:{getConnection:async()=>conn}});const res=response();await handler({user:{id:9},params:{id:7},body:{status:'Paid'}},res);assert.equal(res.code,200);assert.equal(queries.filter(q=>q.startsWith('UPDATE')).length,1);assert(!queries.some(q=>q.includes('upfront_status')));});
for(const name of ['/rooms/occupants/payment/:id','/bookings/payment/:id'])test('Connection failure handled on '+name,async()=>{const handler=route('backend/routes/owner.js',name,{pool:{getConnection:async()=>{throw Error('database unavailable');}}});const res=response();await handler({user:{id:9},params:{id:7},body:{status:'Paid'}},res);assert.equal(res.code,500);});

test('Student desktop and mobile both distinguish paid transactions without occupancy',()=>{const source=fs.readFileSync(path.join(root,'frontend/src/views/student/StudentBookings.vue'),'utf8');assert.equal((source.match(/paymentStatusBadge\(booking\)\.label/g)||[]).length,2);const helper=fs.readFileSync(path.join(root,'frontend/src/utils/studentBookings.js'),'utf8');const badge=helper.slice(helper.indexOf('export const paymentStatusBadge'));assert(badge.indexOf('paymentNeedsReview(booking)')<badge.indexOf("booking.payment_status === 'paid'"),'review must be checked before paid');const fn=vm.runInNewContext('('+helper.match(/export const paymentNeedsReview = (\(booking\) =>[\s\S]*?);\r?\n/)[1]+')');assert.equal(fn({payment_method:'paymongo',paymongo_payment_id:'pay_fixture',occupant_check_in:null}),true);assert.equal(fn({payment_method:'paymongo',paymongo_payment_id:'pay_fixture',occupant_check_in:'2026-10-02'}),false);assert.equal(fn({payment_method:'cash',occupant_check_in:null}),false);});
test('Paid session found on repeated checkout settles rather than requesting another charge',async()=>{let settled=0;const conn={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},query:async(sql)=>sql.startsWith('SELECT b.*')?[[{id:1,status:'confirmed',payment_method:'paymongo',payment_status:'unpaid',paymongo_session_id:'cs_fixture'}]]:[[{id:2}]]};const handler=route('backend/routes/payment.js','/checkout',{...h,pool:{getConnection:async()=>conn},axios:{get:async()=>({data:{data:session()}})},settlePayment:async()=>{settled++;return {success:true};}});const res=response();await handler({user:{id:2,role:'student'},body:{bookingId:1},headers:{}},res);assert.equal(res.code,200);assert.equal(settled,1);});
