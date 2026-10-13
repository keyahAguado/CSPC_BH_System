const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
process.env.JWT_SECRET = 'isolated-verification-test-secret';
let helpers;
test.before(async () => { helpers = await import('../config/applicantVerification.js'); });
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const rawToken = 'a'.repeat(64);
const requestId = 'c'.repeat(64);
function fixture({ user, expired = false, used = false, failSend = false, failNotify = false, linkOpened = false, claimed = false } = {}) {
    const state = { used, rows: 0, sent: 0, notified: 0, verified: false, committed: 0, rolledBack: 0, linkOpened, claimed };
    const connection = {
        async beginTransaction() {}, async commit() { state.committed++; }, async rollback() { state.rolledBack++; }, release() {},
        async query(sql, args) {
            if (sql.startsWith('SELECT id, email FROM applicant_email')) return [!expired && !state.used && args[0] === helpers.hashVerificationToken(rawToken) ? [{ id: 1, email: 'applicant@example.test' }] : []];
            if (sql.startsWith('SELECT id, email, verified_at')) return [args[0] === helpers.hashVerificationToken(requestId) ? [{ id: 1, email: 'applicant@example.test', verified_at: state.linkOpened ? new Date() : null, claimed_at: state.claimed ? new Date() : null, active: expired ? 0 : 1 }] : []];
            if (sql.startsWith('SELECT id, role')) return [user ? [user] : []];
            if (sql.startsWith('UPDATE applicant_email_verifications SET claimed_at')) { state.claimed = true; return [{ affectedRows: 1 }]; }
            if (sql.startsWith('UPDATE applicant_email')) { state.used = true; state.linkOpened = true; return [{ affectedRows: 1 }]; }
            if (sql.startsWith('UPDATE users')) { state.verified = true; return [{ affectedRows: 1 }]; }
            throw Error('Unexpected query: ' + sql);
        }
    };
    const pool = { async getConnection() { return connection; }, async query(sql, args) {
        if (sql.startsWith('SELECT role')) return [user ? [user] : []];
        if (sql.startsWith('INSERT INTO applicant_email')) { state.rows++; assert.match(args[1], /^[a-f0-9]{64}$/); assert.match(args[2], /^[a-f0-9]{64}$/); return [{ insertId: 1 }]; }
        if (sql.startsWith('DELETE FROM applicant_email')) { state.rows--; return [{}]; }
        throw Error('Unexpected pool query');
    } };
    return { state, handlers: helpers.verificationHandlers({ pool, limit: () => true,
        send: async () => { state.sent++; if (failSend) throw Error('mock failure'); },
        notify: async () => { state.notified++; if (failNotify) throw Error('mock failure'); } }) };
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
    assert.equal(res.code, 200); assert.equal(f.state.rows, 1); assert.equal(f.state.sent, 1); assert.match(res.body.requestId, /^[a-f0-9]{64}$/);
});
test('SMTP/provider failure invalidates challenge and reports no application submitted', async () => {
    const f = fixture({ failSend: true }), res = response(); await f.handlers.request({ ip: 'mock', body: { email: 'applicant@example.test' } }, res);
    assert.equal(res.code, 503); assert.equal(f.state.rows, 0); assert.match(res.body.message, /No application was submitted/);
});
test('Active account does not gain applicant access and has generic request response', async () => {
    const f = fixture({ user: { id: 7, role: 'owner', status: 'active', password: 'hash' } }), res = response();
    await f.handlers.request({ ip: 'mock', body: { email: 'applicant@example.test' } }, res);
    // No verification link is sent; the account holder gets sign-in instructions instead
    assert.equal(res.code, 200); assert.equal(f.state.sent, 0); assert.equal(f.state.notified, 1);
    assert.match(res.body.message, /sign-in instructions if this email already has an account/);
});
test('Existing and new emails get an identical on-screen response (no account disclosure)', async () => {
    const accounts = [undefined, { id: 7, role: 'owner', status: 'active', password: 'hash' }, { id: 8, role: 'owner', status: 'active', google_id: 'g' }, { id: 9, role: 'student', status: 'active', google_id: 'g' }];
    const bodies = [];
    for (const user of accounts) {
        const f = fixture({ user }), res = response();
        await f.handlers.request({ ip: 'mock', body: { email: 'applicant@example.test' } }, res);
        assert.equal(res.code, 200); assert.equal(f.state.rows, 1); assert.equal(f.state.sent + f.state.notified, 1);
        assert.match(res.body.requestId, /^[a-f0-9]{64}$/);
        bodies.push(JSON.stringify({ ...res.body, requestId: 'x' }));
    }
    assert.equal(new Set(bodies).size, 1);
});
test('Existing-account request keeps the tab waiting instead of reporting expired immediately', async () => {
    // A recorded, unverified, unexpired request reports "waiting", not "expired"
    const f = fixture({ user: { id: 7, role: 'owner', status: 'active', password: 'hash' } }), res = response();
    await f.handlers.status({ ip: 'mock', body: { requestId } }, res);
    assert.equal(res.code, 200); assert.equal(res.body.verified, false); assert.equal(res.body.expired, undefined); assert.equal(res.body.token, undefined);
});
test('Sign-in notice failure invalidates the request like a verification failure', async () => {
    const f = fixture({ user: { id: 7, role: 'owner', status: 'active', password: 'hash' }, failNotify: true }), res = response();
    await f.handlers.request({ ip: 'mock', body: { email: 'applicant@example.test' } }, res);
    assert.equal(res.code, 503); assert.equal(f.state.rows, 0); assert.match(res.body.message, /No application was submitted/);
});
test('Institutional and malformed email rejected without delivery', async () => {
    for (const email of ['not-email', 'student@my.cspc.edu.ph', 'admin@cspc.edu.ph']) {
        const f = fixture(), res = response(); await f.handlers.request({ ip: 'mock', body: { email } }, res);
        assert.equal(res.code, 400); assert.equal(f.state.sent, 0);
    }
});
test('Opening the link only confirms the inbox and does not sign in that device', async () => {
    const f = fixture(), res = response(); await f.handlers.consume({ ip: 'mock', body: { token: rawToken } }, res);
    assert.equal(res.code, 200); assert.equal(res.body.verified, true); assert.equal(res.body.token, undefined); assert.equal(f.state.used, true);
});
test('Requesting tab receives a restricted pre-registration session once the link was opened', async () => {
    const f = fixture(), pending = response(), done = response();
    await f.handlers.status({ ip: 'mock', body: { requestId } }, pending);
    assert.equal(pending.body.verified, false); assert.equal(pending.body.token, undefined);
    await f.handlers.consume({ ip: 'mock', body: { token: rawToken } }, response());
    await f.handlers.status({ ip: 'mock', body: { requestId } }, done);
    assert.equal(done.code, 200); assert.equal(done.body.hasApplications, false);
    assert.equal(helpers.readVerifiedApplicant('Bearer ' + done.body.token).applicantId, undefined);
});
test('Verified existing pending applicant gets only its own identity', async () => {
    const f = fixture({ user: { id: 77, role: 'owner', status: 'pending', password: null, google_id: null } }), res = response();
    await f.handlers.consume({ ip: 'mock', body: { token: rawToken } }, response());
    await f.handlers.status({ ip: 'mock', body: { requestId } }, res);
    assert.equal(res.code, 200); assert.equal(f.state.verified, true);
    assert.equal(helpers.readVerifiedApplicant('Bearer ' + res.body.token).applicantId, 77);
});
test('Verified session is handed over once and never for expired or unknown requests', async () => {
    for (const [options, id] of [[{ linkOpened: true, claimed: true }, requestId], [{ linkOpened: true, expired: true }, requestId], [{ linkOpened: true }, 'd'.repeat(64)]]) {
        const f = fixture(options), res = response(); await f.handlers.status({ ip: 'mock', body: { requestId: id } }, res);
        assert.equal(res.body.verified, false); assert.equal(res.body.expired, true); assert.equal(res.body.token, undefined);
    }
    const bad = response(); await fixture().handlers.status({ ip: 'mock', body: { requestId: 'nope' } }, bad); assert.equal(bad.code, 400);
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
    for (const [method, body] of [['request', { email: 'applicant@example.test' }], ['consume', { token: rawToken }], ['status', { requestId }]]) {
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
