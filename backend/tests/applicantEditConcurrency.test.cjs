const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
let workflow;
test.before(async () => { workflow = await import('../config/applicationWorkflow.js'); });
const source = fs.readFileSync(path.join(__dirname, '../routes/boardingHouses.js'), 'utf8');
const start = source.indexOf('async (req, res) => {', source.indexOf("router.post('/accreditation'"));
const end = source.indexOf('\n});', start);

function fixture({ before = 'SUBMITTED', race = {}, fail = '' } = {}) {
    const initial = { id: 7, owner_id: 10, name: 'Original property', img: '/old.jpg', permit_fire: '/old.pdf', house_status: before === 'REVISION_REQUIRED' ? 'rejected' : 'pending', application_status: before, admin_comments: before === 'REVISION_REQUIRED' ? 'Correct the document' : null };
    const state = { db: { house: { ...initial, ...race }, photos: ['/original.jpg'], history: [] }, events: [], commits: 0, rollbacks: 0, releases: 0 };
    const original = structuredClone(state.db);
    let draft;
    const connection = {
        async beginTransaction() { state.events.push('begin'); draft = structuredClone(state.db); },
        async commit() { if (fail === 'commit') throw Error('simulated commit failure'); state.events.push('commit'); state.db = draft; state.commits++; },
        async rollback() { draft = null; state.rollbacks++; }, release() { state.releases++; },
        async query(sql, args) {
            assert.ok(draft, 'all edit operations must share a transaction');
            const query = sql.replace(/\s+/g, ' ').trim();
            if (query.startsWith('SELECT * FROM boarding_houses')) {
                if (query.includes('FOR UPDATE')) { state.events.push('lock'); assert.equal(args[1], 10); }
                return [[structuredClone(draft.house)]];
            }
            state.events.push(query);
            if (query.startsWith('UPDATE boarding_houses SET name')) {
                draft.house.name = args[0]; draft.house.house_status = 'pending'; draft.house.admin_comments = null;
                return [{ affectedRows: 1 }];
            }
            if (query.startsWith('DELETE FROM house_photos')) { draft.photos = []; return [{}]; }
            if (query.startsWith('INSERT INTO house_photos')) { draft.photos.push(args[1]); return [{}]; }
            if (query.startsWith('UPDATE boarding_houses SET application_status')) {
                if (fail === 'status') throw Error('simulated status failure');
                draft.house.application_status = args[0]; return [{}];
            }
            if (query.startsWith('INSERT INTO application_status_history')) {
                if (fail === 'history') throw Error('simulated history failure');
                draft.history.push({ from: args[1], to: args[2], snapshot: JSON.parse(args[6]) }); return [{}];
            }
            throw Error('Unexpected edit query: ' + query);
        }
    };
    const handler = vm.runInNewContext('(' + source.slice(start, end + 2) + ')', {
        pool: { getConnection: async () => connection, query: async sql => {
            if (sql.startsWith('SELECT * FROM boarding_houses')) return [[initial]];
            throw Error('Unexpected write outside transaction');
        } },
        saveUploadedFile: async () => '/new.jpg', sanitizeJSONInput: () => '[]',
        evaluateHouseCompliance: async () => { assert.equal(state.commits, 1); state.events.push('compliance'); },
        APPLICATION_STATUS: workflow.APPLICATION_STATUS, APPLICANT_EDITABLE: workflow.APPLICANT_EDITABLE,
        effectiveApplicationStatus: workflow.effectiveApplicationStatus, recordStatusChange: workflow.recordStatusChange,
        console: { log() {}, warn() {}, error() {} }
    });
    const req = { user: { id: 10 }, body: { house_id: '7', house_name: 'Updated property', existing_photos: '["/retained.jpg"]' }, files: { house_photos: [{ buffer: Buffer.from('mock'), originalname: 'new.jpg' }] },
        applicantEdit: { before, after: before === 'REVISION_REQUIRED' ? 'RESUBMITTED' : 'SUBMITTED', houseStatus: initial.house_status, remarks: initial.admin_comments || '' } };
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    return { state, original, run: () => handler(req, res), res };
}

for (const race of [
    { application_status: 'UNDER_REVIEW' },
    { application_status: 'ACCOUNT_PENDING', house_status: 'accredited' },
    { application_status: 'REJECTED', house_status: 'rejected' },
    { house_status: 'archived' },
    { admin_comments: 'New SASO feedback' }
]) test('SASO change before applicant lock is preserved: ' + JSON.stringify(race), async () => {
    const f = fixture({ race }); await f.run();
    assert.equal(f.res.code, 409); assert.equal(f.state.commits, 0); assert.equal(f.state.rollbacks, 1); assert.equal(f.state.releases, 1);
    assert.deepEqual(f.state.db, f.original);
    assert.ok(!f.state.events.some(event => event.startsWith('UPDATE ')));
});
for (const before of ['SUBMITTED', 'REVISION_REQUIRED']) test(before + ' edit saves details, gallery, status and snapshot before one commit', async () => {
    const f = fixture({ before }); await f.run();
    assert.equal(f.res.code, 200); assert.equal(f.state.commits, 1); assert.equal(f.state.rollbacks, 0); assert.equal(f.state.releases, 1);
    const expected = before === 'REVISION_REQUIRED' ? 'RESUBMITTED' : 'SUBMITTED';
    assert.equal(f.state.db.house.application_status, expected);
    assert.equal(f.state.db.history[0].to, expected);
    assert.equal(f.state.db.history[0].snapshot.name, 'Updated property');
    assert.equal(f.state.db.history[0].snapshot.house_status, 'pending');
    assert.deepEqual(f.state.db.photos, ['/retained.jpg', '/new.jpg']);
    assert.ok(f.state.events.indexOf('lock') < f.state.events.findIndex(event => event.startsWith('UPDATE ')));
    assert.ok(f.state.events.findIndex(event => event.startsWith('INSERT INTO application_status_history')) < f.state.events.indexOf('commit'));
});
for (const fail of ['status', 'history', 'commit']) test(fail + ' failure rolls back the entire applicant edit', async () => {
    const f = fixture({ fail }); await f.run(); assert.equal(f.res.code, 500); assert.equal(f.state.commits, 0);
    assert.equal(f.state.rollbacks, 1); assert.equal(f.state.releases, 1); assert.deepEqual(f.state.db, f.original);
});
