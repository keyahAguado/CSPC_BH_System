const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
process.env.JWT_SECRET = 'isolated-verification-test-secret';
let helpers;
test.before(async () => { helpers = await import('../config/applicantVerification.js'); });
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const rawToken = 'a'.repeat(64);
function fixture({ user, expired = false, used = false, failSend = false } = {}) {
    const state = { used, rows: 0, sent: 0, verified: false, committed: 0, rolledBack: 0 };
    const connection = {
        async beginTransaction() {}, async commit() { state.committed++; }, async rollback() { state.rolledBack++; }, release() {},
        async query(sql, args) {
            if (sql.startsWith('SELECT id, email FROM applicant_email')) return [!expired && !state.used && args[0] === helpers.hashVerificationToken(rawToken) ? [{ id: 1, email: 'applicant@example.test' }] : []];
            if (sql.startsWith('SELECT id, role')) return [user ? [user] : []];
            if (sql.startsWith('UPDATE applicant_email')) { state.used = true; return [{ affectedRows: 1 }]; }
            if (sql.startsWith('UPDATE users')) { state.verified = true; return [{ affectedRows: 1 }]; }
            throw Error('Unexpected query: ' + sql);
        }
    };
    const pool = { async getConnection() { return connection; }, async query(sql, args) {
        if (sql.startsWith('SELECT role')) return [user ? [user] : []];
        if (sql.startsWith('INSERT INTO applicant_email')) { state.rows++; assert.match(args[1], /^[a-f0-9]{64}$/); return [{ insertId: 1 }]; }
        if (sql.startsWith('DELETE FROM applicant_email')) { state.rows--; return [{}]; }
        throw Error('Unexpected pool query');
    } };
    return { state, handlers: helpers.verificationHandlers({ pool, limit: () => true, send: async () => { state.sent++; if (failSend) throw Error('mock failure'); } }) };
}
test('Verified session is email-bound and separate from old applicant and login scopes', () => {
    const session = helpers.signVerifiedApplicant('applicant@example.test', 7);
    const payload = helpers.readVerifiedApplicant('Bearer ' + session);
    assert.equal(payload.email, 'applicant@example.test'); assert.equal(payload.applicantId, 7);
    const jwt = require('jsonwebtoken');
    for (const scope of ['applicant', 'owner']) {
        const forged = jwt.sign({ scope, applicantId: 7, email: 'applicant@example.test' }, process.env.JWT_SECRET + ':verified-applicant-v2');
        assert.throws(() => helpers.readVerifiedApplicant('Bearer ' + forged));
    }
});
test('Expired or tampered verified sessions are refused', () => {
    const jwt = require('jsonwebtoken');
    const expired = jwt.sign({ scope: 'verified-applicant', email: 'applicant@example.test' }, process.env.JWT_SECRET + ':verified-applicant-v2', { expiresIn: -1 });
    assert.throws(() => helpers.readVerifiedApplicant('Bearer ' + expired));
    const valid = helpers.signVerifiedApplicant('applicant@example.test');
    assert.throws(() => helpers.readVerifiedApplicant('Bearer ' + valid.slice(0, -3) + 'xyz'));
});
test('Unverified request is rejected before upload or identity selection', () => {
    let next = false; const res = response();
    helpers.requireVerifiedEmail({ headers: {} }, res, () => { next = true; });
    assert.equal(res.code, 401); assert.equal(next, false);
});
test('New email receives a link without creating a user or property', async () => {
    const f = fixture(), res = response(); await f.handlers.request({ ip: 'mock', body: { email: 'applicant@example.test' } }, res);
    assert.equal(res.code, 200); assert.equal(f.state.rows, 1); assert.equal(f.state.sent, 1);
});
test('SMTP/provider failure invalidates challenge and reports no application submitted', async () => {
    const f = fixture({ failSend: true }), res = response(); await f.handlers.request({ ip: 'mock', body: { email: 'applicant@example.test' } }, res);
    assert.equal(res.code, 503); assert.equal(f.state.rows, 0); assert.match(res.body.message, /No application was submitted/);
});
test('Active account does not gain applicant access and has generic request response', async () => {
    const f = fixture({ user: { id: 7, role: 'owner', status: 'active', password: 'hash' } }), res = response();
    await f.handlers.request({ ip: 'mock', body: { email: 'applicant@example.test' } }, res);
    assert.equal(res.code, 200); assert.equal(f.state.sent, 0); assert.match(res.body.message, /If this email is eligible/);
});
test('Institutional and malformed email rejected without delivery', async () => {
    for (const email of ['not-email', 'student@my.cspc.edu.ph', 'admin@cspc.edu.ph']) {
        const f = fixture(), res = response(); await f.handlers.request({ ip: 'mock', body: { email } }, res);
        assert.equal(res.code, 400); assert.equal(f.state.sent, 0);
    }
});
test('Valid challenge grants a restricted pre-registration session', async () => {
    const f = fixture(), res = response(); await f.handlers.consume({ ip: 'mock', body: { token: rawToken } }, res);
    assert.equal(res.code, 200); assert.equal(res.body.hasApplications, false); assert.equal(f.state.used, true);
    assert.equal(helpers.readVerifiedApplicant('Bearer ' + res.body.token).applicantId, undefined);
});
test('Verified existing pending applicant gets only its own identity', async () => {
    const f = fixture({ user: { id: 77, role: 'owner', status: 'pending', password: null, google_id: null } }), res = response();
    await f.handlers.consume({ ip: 'mock', body: { token: rawToken } }, res);
    assert.equal(res.code, 200); assert.equal(f.state.verified, true);
    assert.equal(helpers.readVerifiedApplicant('Bearer ' + res.body.token).applicantId, 77);
});
test('One-time token cannot be consumed twice', async () => {
    const f = fixture(), first = response(), second = response();
    await f.handlers.consume({ ip: 'mock', body: { token: rawToken } }, first);
    await f.handlers.consume({ ip: 'mock', body: { token: rawToken } }, second);
    assert.equal(first.code, 200); assert.equal(second.code, 400);
});
test('Expired and consumed tokens do not grant access', async () => {
    for (const options of [{ expired: true }, { used: true }]) {
        const f = fixture(options), res = response(); await f.handlers.consume({ ip: 'mock', body: { token: rawToken } }, res);
        assert.equal(res.code, 400); assert.equal(res.body.token, undefined);
    }
});
test('An unknown correctly shaped token cannot prove email ownership', async () => {
    const f = fixture(), res = response(); await f.handlers.consume({ ip: 'mock', body: { token: 'b'.repeat(64) } }, res);
    assert.equal(res.code, 400); assert.equal(f.state.used, false);
});
test('Activation/deactivation between request and verification refuses applicant access', async () => {
    for (const status of ['active', 'inactive']) {
        const f = fixture({ user: { id: 7, role: 'owner', status, password: null } }), res = response();
        await f.handlers.consume({ ip: 'mock', body: { token: rawToken } }, res); assert.equal(res.code, 409);
    }
});
test('Rate limit prevents delivery and token consumption', async () => {
    const h = helpers.verificationHandlers({ pool: {}, limit: () => false });
    for (const [method, body] of [['request', { email: 'applicant@example.test' }], ['consume', { token: rawToken }]]) {
        const res = response(); await h[method]({ ip: 'mock', body }, res); assert.equal(res.code, 429);
    }
});
test('Public registration checks verification before multipart upload and ignores forged identity', () => {
    const source = fs.readFileSync('backend/routes/boardingHouses.js', 'utf8');
    assert.match(source, /router.post\('\/register-property', requireVerifiedEmail/);
    assert.match(source, /const ownerEmail = req.verifiedApplicant.email/);
    assert.match(source, /req.body.owner_email.trim\(\).toLowerCase\(\) !== ownerEmail/);
    const tracking = fs.readFileSync('backend/routes/applications.js', 'utf8');
    assert.match(tracking, /router.post\('\/access', requireVerifiedEmail/);
    assert.match(tracking, /u.email = \?/);
});
test('Activation cannot replace the verified email or use an unverified applicant', async () => {
    const source = fs.readFileSync('backend/routes/auth.js', 'utf8');
    const start = source.indexOf("router.post('/activate'");
    const handlerStart = source.indexOf('async (req, res) => {', start);
    const end = source.indexOf('\n});', handlerStart);
    for (const marker of [null, '2026-10-11']) {
        let writes = 0, rolledBack = false;
        const handler = require('node:vm').runInNewContext('(' + source.slice(handlerStart, end + 2) + ')', {
            validateStrictEmail: email => ({ valid: true, email }), hashActivationToken: helpers.hashVerificationToken,
            isPendingApplicant: () => true,
            pool: { getConnection: async () => ({ beginTransaction: async () => {}, rollback: async () => { rolledBack = true; }, release() {},
                query: async sql => {
                    if (sql.startsWith('SELECT id, user_id')) return [[{ id: 1, user_id: 7 }]];
                    if (sql.startsWith('SELECT id, email')) return [[{ id: 7, email: 'applicant@example.test', email_verified_at: marker }]];
                    writes++; throw Error('No mutation expected');
                }
            }) }
        });
        const res = response(); await handler({ body: { token: rawToken, email: marker ? 'attacker@example.test' : 'applicant@example.test' } }, res);
        assert.equal(res.code, 403); assert.equal(writes, 0); assert.equal(rolledBack, true);
    }
});
