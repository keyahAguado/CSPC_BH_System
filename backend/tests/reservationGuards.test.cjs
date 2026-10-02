const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
function handler(file, route, pool) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const start = source.indexOf(route);
  assert(start >= 0);
  const arrow = source.indexOf('async (req, res) => {', start);
  const end = source.indexOf('\n});', arrow);
  return vm.runInNewContext('(' + source.slice(arrow, end + 2) + ')', { pool, console: { error() {} } });
}
function response() {
  return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
function fixture({ bookings = [], occupants = [], capacity = 2, eligible = true, failNotification = false } = {}) {
  const state = { bookings: bookings.map(b => ({ room_id: 1, house_id: 1, payment_method: 'cash', payment_status: 'unpaid', months: 1, amount: 1000, ...b })), occupants: occupants.map(o => ({ ...o })), notifications: [], queries: [], rollbacks: 0 };
  const locks = new Map();
  let sequence = 100;
  async function connection() {
    const releaseLocks = [], held = new Set(), writes = [];
    async function lock(key) {
      if (held.has(key)) return;
      const previous = locks.get(key) || Promise.resolve();
      let release;
      const next = new Promise(resolve => { release = resolve; });
      locks.set(key, next);
      await previous;
      held.add(key);
      releaseLocks.push(release);
    }
    function unlock() { releaseLocks.splice(0).forEach(release => release()); }
    return {
      async beginTransaction() {},
      async commit() { writes.splice(0).forEach(write => write()); unlock(); },
      async rollback() { writes.length = 0; state.rollbacks++; unlock(); },
      release() { unlock(); },
      async query(sql, args = []) {
        state.queries.push(sql);
        const q = sql.replace(/\s+/g, ' ').trim();
        if (q === 'SELECT id FROM users WHERE id = ? FOR UPDATE') { await lock('student:' + args[0]); return [[{ id: args[0] }]]; }
        if (q.startsWith('SELECT b.*, u.name')) return [[...state.bookings.filter(b => b.id == args[0] && args[1] == 9)].map(b => ({ ...b, student_name: 'Fixture' }))];
        if (q.startsWith('SELECT * FROM bookings WHERE id')) return [[...state.bookings.filter(b => b.id == args[0])].map(b => ({ ...b }))];
        if (q.startsWith('SELECT r.id, r.capacity') || q.startsWith('SELECT r.* FROM rooms')) { assert(q.endsWith('FOR UPDATE')); await lock('room:' + args[0]); return [eligible ? [{ id: args[0], capacity, price: 1000, gender_type: 'female', room_number: '1' }] : []]; }
        if ((q.startsWith('SELECT id FROM bookings') || q.startsWith('SELECT b.id FROM bookings'))) {
          assert(q.endsWith('FOR UPDATE'));
          const pending = q.includes("status = 'pending'");
          if (pending) assert(!q.includes('house_id ='));
          return [state.bookings.filter(b => q.includes('room_id =')
            ? b.room_id == args[0] && b.status === 'confirmed' && b.payment_method === 'paymongo' && b.payment_status !== 'paid' && !state.occupants.some(o => o.reference_no === 'REF-' + String(b.id).padStart(4, '0') && (!o.check_out_date || o.futureCheckout))
            : b.student_id == args[0] && b.status === (pending ? 'pending' : 'confirmed') && (!q.includes('id !=') || b.id != args[1]))];
        }
        if (q.startsWith('SELECT id FROM occupants')) return [state.occupants.filter(o => (q.includes('WHERE room_id') ? o.room_id == args[0] : o.student_id == args[0]) && (!o.check_out_date || o.futureCheckout))];
        if (q.startsWith('SELECT sex FROM users')) return [[{ sex: 'female' }]];
        if (q.startsWith('SELECT COUNT(*) as count FROM occupants')) return [[{ count: state.occupants.filter(o => o.room_id == args[0] && !o.check_out_date).length }]];
        if (q.startsWith('SELECT owner_id, name')) return [[{ owner_id: 9, name: 'Fixture House' }]];
        if (q.startsWith('INSERT INTO bookings')) {
          const id = ++sequence;
          writes.push(() => state.bookings.push({ id, student_id: args[0], house_id: args[1], room_id: args[2], status: 'pending' }));
          return [{ insertId: id }];
        }
        if (q.startsWith("UPDATE bookings SET status = 'confirmed'")) { writes.push(() => { state.bookings.find(b => b.id == args[0]).status = 'confirmed'; }); return [{ affectedRows: 1 }]; }
        if (q.startsWith('INSERT INTO occupants')) { writes.push(() => state.occupants.push({ room_id: args[0], student_id: args[1], reference_no: args[2] })); return [{ affectedRows: 1 }]; }
        if (q.startsWith('INSERT INTO notifications')) { if (failNotification) throw Error('Fixture failure'); writes.push(() => state.notifications.push(args)); return [{ affectedRows: 1 }]; }
        if (q.startsWith('UPDATE users')) return [{ affectedRows: 1 }];
        throw Error('Unhandled fixture SQL: ' + q);
      }
    };
  }
  return { state, pool: { getConnection: connection } };
}
const submitRoute = "router.post('/book/:houseId'";
const approveRoute = "router.post('/bookings/approve/:id'";
function submitReq(id = 7, house = 1) { return { user: { id, role: 'student' }, params: { houseId: house }, body: { roomId: house, gender: 'female', check_in_date: '2026-10-02', months: 1, resident_name: 'Fixture', payment_method: 'cash' } }; }
function approveReq(id, owner = 9) { return { user: { id: owner }, params: { id } }; }
const pending = { id: 1, student_id: 7, status: 'pending' };
for (const status of ['cancelled', 'rejected', 'completed']) test('Student can rebook after ' + status, async () => {
  const f = fixture({ bookings: [{ ...pending, status }] }); const res = response();
  await handler('backend/routes/student.js', submitRoute, f.pool)(submitReq(), res);
  assert.equal(res.code, 200); assert.equal(f.state.bookings.filter(b => b.status === 'pending').length, 1);
});
for (const status of ['pending', 'confirmed']) test('Student blocked across houses by ' + status, async () => {
  const f = fixture({ bookings: [{ ...pending, house_id: 2, status }] }); const res = response();
  await handler('backend/routes/student.js', submitRoute, f.pool)(submitReq(), res);
  assert.equal(res.body.errorCode, status + '_booking'); assert.equal(f.state.bookings.length, 1); assert.equal(f.state.notifications.length, 0);
});
test('Future checkout remains an active stay', async () => {
  const f = fixture({ occupants: [{ student_id: 7, room_id: 2, check_out_date: '2099-01-01', futureCheckout: true }] }); const res = response();
  await handler('backend/routes/student.js', submitRoute, f.pool)(submitReq(), res);
  assert.equal(res.body.errorCode, 'active_stay'); assert.equal(f.state.bookings.length, 0);
});
test('Two simultaneous student requests create only one reservation', async () => {
  const f = fixture(); const fn = handler('backend/routes/student.js', submitRoute, f.pool); const a = response(), b = response();
  await Promise.all([fn(submitReq(7, 1), a), fn(submitReq(7, 2), b)]);
  assert.deepEqual([a.code, b.code].sort(), [200, 400]); assert.equal(f.state.bookings.length, 1); assert.equal(f.state.notifications.length, 2);
});
for (const method of ['cash', 'paymongo']) test(method + ' approval and repeated approval', async () => {
  const f = fixture({ bookings: [{ ...pending, payment_method: method }] }); const fn = handler('backend/routes/owner.js', approveRoute, f.pool);
  const a = response(), b = response(); await fn(approveReq(1), a); await fn(approveReq(1), b);
  assert.equal(a.code, 200); assert.equal(b.code, 200); assert.equal(f.state.bookings[0].status, 'confirmed');
  assert.equal(f.state.occupants.length, method === 'cash' ? 1 : 0); assert.equal(f.state.notifications.length, 1);
});
for (const status of ['cancelled', 'rejected', 'completed']) test('Cannot approve ' + status, async () => {
  const f = fixture({ bookings: [{ ...pending, status }] }); const res = response();
  await handler('backend/routes/owner.js', approveRoute, f.pool)(approveReq(1), res);
  assert.equal(res.code, 409); assert.equal(f.state.occupants.length, 0); assert.equal(f.state.notifications.length, 0);
});
test('Cannot approve student with another confirmed booking', async () => {
  const f = fixture({ bookings: [pending, { ...pending, id: 2, house_id: 2, status: 'confirmed', payment_method: 'paymongo' }] }); const res = response();
  await handler('backend/routes/owner.js', approveRoute, f.pool)(approveReq(1), res); assert.equal(res.code, 409);
});
test('Cannot approve student with active occupancy', async () => {
  const f = fixture({ bookings: [pending], occupants: [{ student_id: 7, room_id: 2 }] }); const res = response();
  await handler('backend/routes/owner.js', approveRoute, f.pool)(approveReq(1), res); assert.equal(res.code, 409);
});
test('Concurrent approvals of existing competing requests confirm only one', async () => {
  const f = fixture({ bookings: [pending, { ...pending, id: 2, room_id: 2, house_id: 2 }] }); const fn = handler('backend/routes/owner.js', approveRoute, f.pool); const a = response(), b = response();
  await Promise.all([fn(approveReq(1), a), fn(approveReq(2), b)]); assert.deepEqual([a.code, b.code].sort(), [200, 409]); assert.equal(f.state.occupants.length, 1);
});
test('Concurrent approvals for final space admit only one', async () => {
  const f = fixture({ capacity: 1, bookings: [pending, { ...pending, id: 2, student_id: 8 }] }); const fn = handler('backend/routes/owner.js', approveRoute, f.pool); const a = response(), b = response();
  await Promise.all([fn(approveReq(1), a), fn(approveReq(2), b)]); assert.deepEqual([a.code, b.code].sort(), [200, 400]); assert.equal(f.state.occupants.length, 1);
});
test('Unpaid confirmed online reservation reserves final space', async () => {
  const f = fixture({ capacity: 1, bookings: [pending, { ...pending, id: 2, student_id: 8, status: 'confirmed', payment_method: 'paymongo' }] }); const res = response();
  await handler('backend/routes/owner.js', approveRoute, f.pool)(approveReq(1), res); assert.equal(res.body.errorCode, 'capacity_full'); assert.equal(f.state.occupants.length, 0);
});
test('Ineligible room/listing cannot be approved', async () => {
  const f = fixture({ bookings: [pending], eligible: false }); const res = response();
  await handler('backend/routes/owner.js', approveRoute, f.pool)(approveReq(1), res); assert.equal(res.code, 409);
});
test('Other owner cannot approve', async () => {
  const f = fixture({ bookings: [pending] }); const res = response();
  await handler('backend/routes/owner.js', approveRoute, f.pool)(approveReq(1, 10), res); assert.equal(res.code, 404);
});
test('Notification failure rolls back approval and occupancy', async () => {
  const f = fixture({ bookings: [pending], failNotification: true }); const res = response();
  await handler('backend/routes/owner.js', approveRoute, f.pool)(approveReq(1), res); assert.equal(res.code, 500); assert.equal(f.state.bookings[0].status, 'pending'); assert.equal(f.state.occupants.length, 0);
});
for (const [file, route, rows] of [
  ['backend/routes/student.js', "router.post('/bookings/cancel/:id'", [{ ...pending, payment_status: 'unpaid', house_name: 'Fixture' }]],
  ['backend/routes/owner.js', "router.post('/bookings/reject/:id'", [pending]]
]) test('Stale decision cannot overwrite approval: ' + route, async () => {
  let updates = 0, notifications = 0;
  const pool = { query: async sql => {
    if (sql.startsWith('SELECT')) return [rows];
    if (sql.startsWith('UPDATE')) { updates++; assert(sql.includes('AND status =')); return [{ affectedRows: 0 }]; }
    notifications++; return [{ affectedRows: 1 }];
  } };
  const res = response(); await handler(file, route, pool)({ user: { id: 7 }, params: { id: 1 } }, res);
  assert.equal(res.code, 409); assert.equal(updates, 1); assert.equal(notifications, 0);
});
test('Online resident marked rent due is not counted twice against capacity', async () => {
  const f = fixture({ capacity: 2, bookings: [pending, { ...pending, id: 2, student_id: 8, status: 'confirmed', payment_method: 'paymongo' }], occupants: [{ student_id: 8, room_id: 1, reference_no: 'REF-0002' }] }); const res = response();
  await handler('backend/routes/owner.js', approveRoute, f.pool)(approveReq(1), res); assert.equal(res.code, 200); assert.equal(f.state.occupants.length, 2);
});
test('Two approvals of the same request create one occupant and notification', async () => {
  const f = fixture({ bookings: [pending] }); const fn = handler('backend/routes/owner.js', approveRoute, f.pool); const a = response(), b = response();
  await Promise.all([fn(approveReq(1), a), fn(approveReq(1), b)]); assert.equal(a.code, 200); assert.equal(b.code, 200); assert.equal(f.state.occupants.length, 1); assert.equal(f.state.notifications.length, 1);
});
test('Non-student cannot submit a booking', async () => {
  const f = fixture(); const res = response(); const req = submitReq(); req.user.role = 'owner';
  await handler('backend/routes/student.js', submitRoute, f.pool)(req, res); assert.equal(res.code, 403); assert.equal(f.state.queries.length, 0);
});
test('New request cannot target archived room or unaccredited house', async () => {
  const f = fixture({ eligible: false }); const res = response();
  await handler('backend/routes/student.js', submitRoute, f.pool)(submitReq(), res); assert.equal(res.code, 404); assert.equal(f.state.bookings.length, 0);
});
test('Full room blocks a new request', async () => {
  const f = fixture({ capacity: 1, occupants: [{ room_id: 1, student_id: 8 }] }); const res = response();
  await handler('backend/routes/student.js', submitRoute, f.pool)(submitReq(), res); assert.equal(res.code, 400); assert.equal(f.state.bookings.length, 0);
});
