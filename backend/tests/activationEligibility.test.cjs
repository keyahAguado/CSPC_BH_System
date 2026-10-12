const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function handler(file, route, context) {
    const source = fs.readFileSync(path.join(__dirname, '../routes', file), 'utf8');
    const routeStart = source.indexOf(`router.post('${route}'`);
    const start = source.indexOf('async (req, res) => {', routeStart);
    const end = source.indexOf('\n});', start);
    assert.ok(routeStart >= 0 && start >= 0 && end > start);
    return vm.runInNewContext('(' + source.slice(start, end + 2) + ')', context);
}
function fixture(houses, { route = '/activate', failWrite = false } = {}) {
    const state = { writes: [], history: [], committed: 0, rolledBack: 0, released: 0, issued: 0, hashed: 0 };
    const user = { id: 7, role: 'owner', status: 'pending', password: null, google_id: null, email: 'applicant@example.test', email_verified_at: '2026-10-12' };
    const connection = {
        async beginTransaction() {}, async commit() { state.committed++; }, async rollback() { state.rolledBack++; }, release() { state.released++; },
        async query(sql, args) {
            if (sql.startsWith('SELECT id, user_id')) return [[{ id: 1, user_id: 7 }]];
            if (sql.includes('FROM users WHERE id =')) return [[user]];
            if (sql.startsWith('SELECT id FROM boarding_houses')) {
                assert.match(sql, /house_status = 'accredited'/);
                assert.match(sql, /FOR UPDATE/);
                assert.equal(args[0], 7);
                const selected = houses.filter(h => h.owner_id === args[0] && h.application_status === args[1] && h.house_status === 'accredited');
                return [sql.includes('LIMIT 1') ? selected.slice(0, 1) : selected];
            }
            if (sql.startsWith('SELECT id FROM users')) return [[]];
            if (failWrite) throw new Error('simulated write failure');
            state.writes.push({ sql, args }); return [{ affectedRows: 1 }];
        }
    };
    const fn = handler(route === '/activate' ? 'auth.js' : 'applications.js', route, {
        pool: { getConnection: async () => connection },
        validateStrictEmail: email => ({ valid: true, email }), hashActivationToken: () => 'mock-hash',
        isPendingApplicant: u => u && u.status === 'pending' && !u.password && !u.google_id,
        bcrypt: { hash: async () => { state.hashed++; return 'mock-password-hash'; } },
        APPLICATION_STATUS: { ACCOUNT_PENDING: 'ACCOUNT_PENDING', ACTIVE: 'ACTIVE' },
        recordStatusChange: async (c, change) => state.history.push(change),
        changesByApplicant: () => true, issueActivationToken: async () => { state.issued++; return 'mock-token'; },
        activationUrl: () => 'https://example.test/activate-account?token=mock', ACTIVATION_TTL_DAYS: 7,
        console: { error() {} }
    });
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    return { state, res, run: () => fn({ applicantId: 7, body: { token: 'mock', email: user.email, password: 'Test12345' } }, res) };
}
const house = (house_status, application_status = 'ACCOUNT_PENDING', owner_id = 7, id = 11) => ({ id, owner_id, house_status, application_status });

for (const route of ['/activate', '/activation-link']) {
    for (const [label, houses] of [
        ['no properties', []], ['archived approval', [house('archived')]], ['pending property', [house('pending')]],
        ['rejected property', [house('rejected')]], ['unapproved accredited property', [house('accredited', 'SUBMITTED')]],
        ['another applicant property', [house('accredited', 'ACCOUNT_PENDING', 8)]]
    ]) test(`${route} refuses ${label} without changing the owner or tokens`, async () => {
        const f = fixture(houses, { route }); await f.run();
        assert.equal(f.res.code, 409); assert.equal(f.res.body.success, false);
        assert.equal(f.state.writes.length, 0); assert.equal(f.state.issued, 0); assert.equal(f.state.hashed, 0);
        assert.equal(f.state.rolledBack, 1); assert.equal(f.state.committed, 0); assert.equal(f.state.released, 1);
    });
}
test('One qualifying property allows activation while other property statuses are preserved', async () => {
    const f = fixture([house('accredited'), house('pending', 'SUBMITTED', 7, 12), house('archived', 'ACCOUNT_PENDING', 7, 13)]);
    await f.run(); assert.equal(f.res.code, 200); assert.equal(f.res.body.success, true);
    assert.equal(f.state.hashed, 1); assert.equal(f.state.committed, 1); assert.equal(f.state.released, 1);
    assert.deepEqual(f.state.history.map(h => h.houseId), [11]);
    assert.ok(f.state.writes.some(w => w.sql.includes("status = 'active'")));
});
test('All qualifying approved properties record activation, without activating another owner property', async () => {
    const f = fixture([house('accredited'), house('accredited', 'ACCOUNT_PENDING', 7, 12), house('accredited', 'ACCOUNT_PENDING', 8, 13)]);
    await f.run(); assert.deepEqual(f.state.history.map(h => h.houseId), [11, 12]);
});
test('Eligible applicant can still obtain a fresh activation link', async () => {
    const f = fixture([house('accredited')], { route: '/activation-link' }); await f.run();
    assert.equal(f.res.code, 200); assert.equal(f.state.issued, 1); assert.equal(f.state.committed, 1);
});
test('Activation write failure rolls back and releases the connection', async () => {
    const f = fixture([house('accredited')], { failWrite: true }); await f.run();
    assert.equal(f.res.code, 500); assert.equal(f.state.rolledBack, 1); assert.equal(f.state.committed, 0); assert.equal(f.state.released, 1);
});
