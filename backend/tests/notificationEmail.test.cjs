const test = require('node:test');
const assert = require('node:assert/strict');
let api;
test.before(async () => { api = await import('../config/notificationEmail.js'); });
const env = { NOTIFICATION_EMAIL_ENABLED: 'true', BREVO_API_KEY: 'mock-only', EMAIL_FROM_ADDRESS: 'sender@example.test', FRONTEND_URL: 'https://example.test' };
function fixture({ enabled = true, lock = 1, fail = false, rows = [{ notification_id: 22, attempts: 0, name: 'Owner', email: 'owner@example.test', role: 'owner', status: 'pending', message: 'Approved' }] } = {}) {
    const state = { queries: [], sent: 0, released: 0, warnings: [] };
    const pool = { async getConnection() { return {
        async query(sql, params) {
            state.queries.push([sql, params]);
            if (sql.includes('GET_LOCK')) return [[{ acquired: lock }]];
            if (sql.includes('SELECT d.notification_id')) return [rows];
            return [{}];
        }, release() { state.released++; }
    }; } };
    return { state, run: () => api.createNotificationEmailWorker({ pool, env: { ...env, NOTIFICATION_EMAIL_ENABLED: enabled ? 'true' : 'false' }, log: { warn: text => state.warnings.push(text) }, send: async () => { state.sent++; if (fail) throw new Error('secret-must-not-log'); return '<mock-message-id>'; } })() };
}
test('Template escapes feedback and applicant names and uses trusted role links', () => {
    const mail = api.notificationEmailContent({ name: '<script>', role: 'owner', status: 'pending' }, '<img onerror=bad>\nApproved', 'https://example.test');
    assert.ok(!mail.htmlContent.includes('<script>'));
    assert.ok(!mail.htmlContent.includes('<img onerror'));
    assert.match(mail.htmlContent, /&lt;img/);
    assert.match(mail.htmlContent, /https:\/\/example.test\/track/);
    assert.match(mail.textContent, /does not activate an owner account/);
    assert.throws(() => api.notificationEmailContent({}, 'Hello', 'javascript:bad'));
});
test('Student notifications link to student notifications, not applicant tracking', () => {
    assert.match(api.notificationEmailContent({ role: 'student', status: 'active' }, 'Paid', 'https://example.test').htmlContent, /\/student\/notifications/);
});
test('Only approval email explains activation; submission confirmation does not imply approval', () => {
    const user = { name: 'Applicant', role: 'owner', status: 'pending' };
    const submitted = api.notificationEmailContent(user, 'APPLICATION SUBMITTED: Your application was received.', 'https://example.test');
    assert.match(submitted.subject, /Application received/);
    assert.ok(!submitted.textContent.includes('SASO has approved'));
    assert.ok(!submitted.textContent.includes('seven days'));
    const approved = api.notificationEmailContent(user, 'CONGRATULATIONS: Your house has been ACCREDITED by SASO!', 'https://example.test');
    assert.match(approved.textContent, /approval does not expire with the link/);
    assert.match(approved.textContent, /still approved and accredited/);
});
test('Restoration notification has a restoration subject rather than an accreditation subject', () => {
    const mail = api.notificationEmailContent({ role: 'owner', status: 'active' }, 'CONGRATULATIONS: Your house has been RESTORED.', 'https://example.test');
    assert.match(mail.subject, /restored/);
    assert.ok(!mail.subject.includes('accredited'));
});
test('Disabled worker performs no queries or delivery', async () => {
    const f = fixture({ enabled: false }); await f.run(); assert.equal(f.state.sent, 0); assert.equal(f.state.queries.length, 0);
});
test('Only one database-lock owner can process emails', async () => {
    const f = fixture({ lock: 0 }); await f.run(); assert.equal(f.state.sent, 0); assert.equal(f.state.released, 1);
});
test('Committed notifications are queued uniquely above migration cutoff and acknowledged', async () => {
    const f = fixture(); await f.run(); assert.equal(f.state.sent, 1);
    assert.ok(f.state.queries.some(([sql]) => sql.includes('INSERT IGNORE') && sql.includes('start_after_id')));
    assert.ok(f.state.queries.some(([sql, params]) => sql.includes("status = 'accepted'") && params[0] === '<mock-message-id>'));
    assert.ok(f.state.queries.some(([sql]) => sql.includes('RELEASE_LOCK')));
});
test('Provider failure records retry without throwing or logging secrets', async () => {
    const f = fixture({ fail: true }); await f.run();
    assert.ok(f.state.queries.some(([sql, params]) => sql.includes('next_attempt_at =') && params[0] === 'pending' && params[1] === 1));
    assert.ok(!f.state.warnings.join('').includes('secret-must-not-log'));
});
test('Five failed attempts stop automatic retries', async () => {
    const f = fixture({ fail: true, rows: [{ notification_id: 22, attempts: 4, email: 'owner@example.test' }] }); await f.run();
    assert.ok(f.state.queries.some(([sql, params]) => sql.includes('next_attempt_at =') && params[0] === 'failed'));
});
test('Legacy placeholder email is skipped without provider delivery', async () => {
    const f = fixture({ rows: [{ notification_id: 1, email: 'legacy@applicant.invalid' }] }); await f.run();
    assert.equal(f.state.sent, 0); assert.ok(f.state.queries.some(([sql]) => sql.includes("status = 'skipped'")));
});
test('Missing queue schema does not throw into application workflows and releases the connection', async () => {
    let released = false, warning = false;
    const worker = api.createNotificationEmailWorker({ env, log: { warn() { warning = true; } }, pool: { async getConnection() { return {
        async query(sql) { if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]]; if (sql.includes('RELEASE_LOCK')) return [[]]; throw new Error('missing schema'); },
        release() { released = true; }
    }; } }, send: async () => { assert.fail('Delivery must not run without the queue'); } });
    await worker(); assert.ok(released); assert.ok(warning);
});
