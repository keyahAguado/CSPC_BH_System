// Accountless application workflow: approval issues an activation link (never a password),
// tracked applications move through the status workflow, legacy rows keep their behaviour.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const test = require('node:test'), assert = require('node:assert/strict');
process.env.JWT_SECRET = 'isolated-application-workflow-secret';
const source = fs.readFileSync(path.join(__dirname, '../routes/admin.js'), 'utf8');
const workflow = import(pathToFileURL(path.join(__dirname, '../config/applicationWorkflow.js')).href);
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function route(name, state, { house, owner }) {
    const connection = {
        beginTransaction: async () => {},
        async query(sql, args) {
            state.queries.push({ sql, args });
            if (sql.startsWith('SELECT owner_id')) return [[house]];
            if (sql.startsWith('SELECT id, name, email, role, status, password, google_id FROM users')) { assert(sql.endsWith('FOR UPDATE')); return [[owner]]; }
            state.writes.push({ sql, args });
            return [{ affectedRows: 1 }];
        },
        async commit() { state.events.push('commit'); }, async rollback() { state.events.push('rollback'); }, release() { state.events.push('release'); }
    };
    const start = source.indexOf('async (req, res) => {', source.indexOf(`router.post('${name}'`));
    const end = source.indexOf('\n});', start);
    const context = {
        console: { error() {}, log() {} }, pool: { getConnection: async () => connection },
        APPLICATION_STATUS: { SUBMITTED: 'SUBMITTED', UNDER_REVIEW: 'UNDER_REVIEW', REVISION_REQUIRED: 'REVISION_REQUIRED', RESUBMITTED: 'RESUBMITTED', APPROVED: 'APPROVED', REJECTED: 'REJECTED', ACCOUNT_PENDING: 'ACCOUNT_PENDING', ACTIVE: 'ACTIVE' },
        ACTIVATION_TTL_DAYS: 7,
        issueActivationToken: async () => 'tok123',
        activationUrl: (t) => 'http://localhost/activate-account?token=' + t,
        recordStatusChange: async (conn, entry) => { state.history.push(entry); }
    };
    return vm.runInNewContext('(' + source.slice(start, end + 2) + ')', context);
}
const fresh = () => ({ queries: [], writes: [], mails: [], events: [], history: [] });
const applicant = { id: 2, name: 'Juan', email: 'juan@gmail.com', role: 'owner', status: 'pending', password: null, google_id: null };
const trackedHouse = { owner_id: 2, name: 'House', reference_no: 'BH-2026-00007', application_status: 'UNDER_REVIEW' };

test('Approval of a pending applicant issues an activation link, never a password, and keeps the account pending', async () => {
    const state = fresh(); const res = response();
    await route('/approve/:id', state, { house: trackedHouse, owner: applicant })({ params: { id: 7 }, user: { id: 1 }, body: { checklist: [], admin_comments: '' } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.activation.url, undefined, 'the activation link is not shown to SASO');
    assert(state.writes.length > 0);
    assert.equal(res.body.activation.reference_no, 'BH-2026-00007');
    assert.equal(res.body.activation.email, undefined, 'no email is involved');
    assert.equal(res.body.credentials, undefined);
    assert(!state.writes.some(w => /password/i.test(w.sql)), 'no password is written');
    assert(!state.writes.some(w => w.sql.startsWith('UPDATE users SET status')), 'account stays pending until activation');
    assert(state.writes.some(w => w.sql.startsWith('UPDATE boarding_houses SET application_status') && w.args[0] === 'ACCOUNT_PENDING'));
    assert.deepEqual(state.history.map(h => h.to), ['APPROVED', 'ACCOUNT_PENDING']);
    assert.deepEqual(state.events.slice(-2), ['commit', 'release']);
});
test('Approval of an existing active owner activates the property only', async () => {
    const state = fresh(); const res = response();
    await route('/approve/:id', state, { house: trackedHouse, owner: { ...applicant, status: 'active', password: 'hash' } })({ params: { id: 7 }, user: { id: 1 }, body: { checklist: [], admin_comments: '' } }, res);
    assert.equal(res.body.activation, undefined);
    assert(state.writes.some(w => w.sql.startsWith('UPDATE users SET status')));
    assert.deepEqual(state.history.map(h => h.to), ['APPROVED', 'ACTIVE']);
});
test('Legacy (untracked) approval keeps previous behaviour without history', async () => {
    const state = fresh(); const res = response();
    await route('/approve/:id', state, { house: { owner_id: 2, name: 'Old', reference_no: null, application_status: null }, owner: { ...applicant, status: 'active', password: 'hash' } })({ params: { id: 7 }, user: { id: 1 }, body: { checklist: [], admin_comments: '' } }, res);
    assert.equal(res.code, 200); assert.equal(state.history.length, 0);
    assert(!state.writes.some(w => w.sql.includes('application_status')));
});
for (const [decision, expected, resubmission] of [[undefined, 'REVISION_REQUIRED', 1], ['revision', 'REVISION_REQUIRED', 1], ['reject', 'REJECTED', 0]]) {
    test('Review decision ' + decision + ' sets ' + expected, async () => {
        const state = fresh(); const res = response();
        await route('/reject/:id', state, { house: { ...trackedHouse, house_status: 'pending' }, owner: applicant })({ params: { id: 7 }, user: { id: 1 }, body: { admin_comments: 'Fix the fire permit', decision } }, res);
        assert.equal(res.code, 200);
        const update = state.writes.find(w => w.sql.includes("house_status = 'rejected'"));
        assert.equal(update.args[0], resubmission);
        assert(state.writes.some(w => w.sql.startsWith('UPDATE boarding_houses SET application_status') && w.args[0] === expected));
        assert.equal(state.history[0].remarks, 'Fix the fire permit');
    });
}
test('Final rejection is ignored for untracked legacy applications (still revisable)', async () => {
    const state = fresh(); const res = response();
    await route('/reject/:id', state, { house: { owner_id: 2, name: 'Old', house_status: 'pending', application_status: null }, owner: applicant })({ params: { id: 7 }, user: { id: 1 }, body: { admin_comments: 'No', decision: 'reject' } }, res);
    assert.equal(state.writes.find(w => w.sql.includes("house_status = 'rejected'")).args[0], 1);
    assert.equal(state.history.length, 0);
});

test('Reference numbers are random, unguessable and match the accepted pattern (old sequential ones too)', async () => {
    const w = await workflow;
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
        const ref = w.generateReferenceNo(new Date('2026-10-10'));
        assert.match(ref, /^BH-2026-[A-HJ-NP-Z2-9]{6}$/);
        assert(w.REFERENCE_PATTERN.test(ref));
        seen.add(ref);
    }
    assert(seen.size > 195, 'references do not repeat');
    assert(w.REFERENCE_PATTERN.test('BH-2026-00014'), 'legacy sequential reference still accepted');
    assert.equal(w.normalizeReference(' bh-2026-k7q2xm '), 'BH-2026-K7Q2XM');
    assert(!w.REFERENCE_PATTERN.test("BH-2026-' OR 1=1"));
});
test('Tracking session token cannot be used as a login token and rejects tampering', async () => {
    const w = await workflow; const jwt = require('jsonwebtoken');
    const token = w.signApplicantToken(5, 'applicant@example.test');
    assert.equal(jwt.decode(token).id, undefined, 'no user id claim for authenticateToken');
    let req = { headers: { authorization: 'Bearer ' + token } }; let passed = false;
    w.verifyApplicant(req, response(), () => { passed = true; });
    assert(passed); assert.equal(req.applicantId, 5);
    const forged = jwt.sign({ applicantId: 5, scope: 'applicant' }, process.env.JWT_SECRET || 'your_super_secret_cspc_token_key');
    const res = response(); passed = false;
    w.verifyApplicant({ headers: { authorization: 'Bearer ' + forged } }, res, () => { passed = true; });
    assert.equal(passed, false); assert.equal(res.code, 401);
});
test('Placeholder emails are recognised and never look like real addresses', async () => {
    const w = await workflow;
    const email = w.placeholderEmail('BH-2026-K7Q2XM');
    assert.equal(email, 'bh-2026-k7q2xm@applicant.invalid');
    assert(w.isPlaceholderEmail(email));
    assert(!w.isPlaceholderEmail('juan@gmail.com'));
});
test('Status helpers: editable window, legacy mapping and pending applicant detection', async () => {
    const w = await workflow;
    assert(w.APPLICANT_EDITABLE.has('SUBMITTED') && w.APPLICANT_EDITABLE.has('REVISION_REQUIRED'));
    for (const locked of ['UNDER_REVIEW', 'RESUBMITTED', 'APPROVED', 'REJECTED', 'ACCOUNT_PENDING', 'ACTIVE']) assert(!w.APPLICANT_EDITABLE.has(locked));
    assert.equal(w.effectiveApplicationStatus({ application_status: null, house_status: 'accredited' }), 'ACTIVE');
    assert.equal(w.effectiveApplicationStatus({ application_status: null, house_status: 'rejected', is_resubmission: 1 }), 'REVISION_REQUIRED');
    assert.equal(w.effectiveApplicationStatus({ application_status: 'UNDER_REVIEW', house_status: 'pending' }), 'UNDER_REVIEW');
    assert.equal(w.isPendingApplicant(applicant), true);
    assert.equal(w.isPendingApplicant({ ...applicant, google_id: 'g' }), false);
    assert.equal(w.hashActivationToken('abc').length, 64);
});
test('Repeated approval of an already approved application issues no new link and records no new history', async () => {
    for (const status of ['ACCOUNT_PENDING', 'ACTIVE']) {
        const state = fresh(); const res = response();
        const owner = status === 'ACTIVE' ? { ...applicant, status: 'active', password: 'hash' } : applicant;
        await route('/approve/:id', state, { house: { ...trackedHouse, application_status: status }, owner })({ params: { id: 7 }, user: { id: 1 }, body: { checklist: [], admin_comments: '' } }, res);
        assert.equal(res.code, 200);
        assert.equal(res.body.activation, undefined);
        assert.equal(state.history.length, 0);
        assert(!state.writes.some(w => w.sql.includes('application_status')));
    }
});
