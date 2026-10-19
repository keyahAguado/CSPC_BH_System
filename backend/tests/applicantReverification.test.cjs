const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '../..');
let verification, navigation;
test.before(async () => {
    verification = await import('../config/applicantVerification.js');
    navigation = await import('../../frontend/src/utils/applicantNavigation.js');
});
test('Consuming a fresh link verifies only that request, not every request for the email', async () => {
    const queries = [];
    const c = { async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}, async query(sql, args) {
        queries.push({ sql, args });
        if (sql.startsWith('SELECT id, email FROM')) return [[{ id: 12, email: 'applicant@example.test' }]];
        if (sql.startsWith('SELECT id, role')) return [[]];
        return [{}];
    } };
    const handlers = verification.verificationHandlers({ pool: { getConnection: async () => c }, limit: () => true });
    const res = response();
    await handlers.consume({ ip: 'test', body: { token: 'a'.repeat(64) } }, res);
    assert.equal(res.body.success, true);
    const update = queries.find(q => q.sql.startsWith('UPDATE applicant_email_verifications'));
    assert.match(update.sql, /WHERE id = \? AND used_at IS NULL/);
    assert.deepEqual(update.args, [12]);
});
function response() { return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
test('An actually expired verification link stays rejected', async () => {
    const c = { async beginTransaction() {}, async rollback() {}, release() {}, async query(sql) { return [sql.includes('SELECT used_at') ? [{ used_at: null, active: 0 }] : []]; } };
    const handlers = verification.verificationHandlers({ pool: { getConnection: async () => c }, limit: () => true });
    const res = response();
    await handlers.consume({ ip: 'test', body: { token: 'b'.repeat(64) } }, res);
    assert.equal(res.code, 400);
    assert.match(res.body.message, /expired/);
});
test('Sign-out and successful verification clear the pending request in this tab and synced tabs', () => {
    const source = fs.readFileSync(path.join(root, 'frontend/src/utils/applicantSession.js'), 'utf8').replace(/export /g, '');
    const storage = new Map(); let receive;
    const result = vm.runInNewContext(source + '\n({clearApplicantToken,setApplicantToken,PENDING_VERIFICATION_KEY})', {
        sessionStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
        BroadcastChannel: class { addEventListener(_, f) { receive = f; } postMessage() {} }, window: { dispatchEvent() {} }, Event: class {},
    });
    for (const action of [() => result.clearApplicantToken(), () => result.setApplicantToken('fresh'), () => receive({ data: '' }), () => receive({ data: 'fresh-other-tab' })]) {
        storage.set(result.PENDING_VERIFICATION_KEY, '{"requestId":"stale"}');
        action(); assert.equal(storage.has(result.PENDING_VERIFICATION_KEY), false);
    }
});
function gateFixture() {
    const source = fs.readFileSync(path.join(root, 'frontend/src/components/ApplicantEmailGate.vue'), 'utf8').split('<script setup>')[1].split('</script>')[0].replace(/^import .*;\r?\n/gm, '');
    const storage = new Map(), tokens = [], requests = []; let unmount;
    const gate = vm.runInNewContext(source + '\n({request,startWaiting,checkStatus,sessionChanged,email,waiting,error})', {
        ref: value => ({ value }), useRoute: () => ({ path: '/track' }), useRouter: () => ({ replace() {} }), onMounted() {}, onUnmounted(f) { unmount = f; },
        axios: { post: (...args) => new Promise(resolve => requests.push({ args, resolve })) },
        PENDING_VERIFICATION_KEY: 'pending', setApplicantToken: token => tokens.push(token), rememberedDevice: () => null,
        saveRememberedDevice() {}, forgetRememberedDevice() {}, takeFreshVerificationFlag: () => false,
        sessionStorage: { setItem: (k, v) => storage.set(k, v), getItem: k => storage.get(k), removeItem: k => storage.delete(k) },
        setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {}, window: { addEventListener() {}, removeEventListener() {} }
    });
    return { gate, storage, tokens, requests, unmount: () => unmount() };
}
test('A status response arriving after sign-out cannot restore the applicant session', async () => {
    const f = gateFixture(); f.gate.startWaiting('old');
    const pending = f.gate.checkStatus('old'); f.gate.sessionChanged();
    f.requests[0].resolve({ data: { verified: true, token: 'old-session' } }); await pending;
    assert.equal(f.tokens.length, 0); assert.equal(f.gate.waiting.value, false);
});
test('Leaving the gate invalidates a late verification-status response', async () => {
    const f = gateFixture(); f.gate.startWaiting('old');
    const pending = f.gate.checkStatus('old'); f.unmount();
    f.requests[0].resolve({ data: { expired: true } }); await pending;
    assert.equal(f.gate.error.value, '');
});
test('A verification-email request finishing after navigation cannot restart polling', async () => {
    const f = gateFixture(); f.gate.email.value = 'applicant@example.test';
    const pending = f.gate.request(); f.unmount();
    f.requests[0].resolve({ data: { requestId: 'stale', message: 'Sent' } }); await pending;
    assert.equal(f.storage.size, 0); assert.equal(f.gate.waiting.value, false);
});
test('Browser Back from tracking to old registration goes Home, explicit Edit/Add stays available', () => {
    const from = { name: 'TrackApplication', fullPath: '/track?submitted=BH-TEST' };
    for (const name of ['Register', 'OwnerDetailsRegister']) assert.equal(navigation.trackingBackDestination({ name, fullPath: '/register?step=0' }, from, { current: '/register?step=0', forward: from.fullPath }), '/');
    assert.equal(navigation.trackingBackDestination({ name: 'Register', query: { edit: 'BH-TEST' } }, from, { current: from.fullPath, forward: null }), null);
    assert.equal(navigation.trackingBackDestination({ name: 'Home' }, from, { forward: from.fullPath }), null);
});
