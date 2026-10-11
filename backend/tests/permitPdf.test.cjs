const { pathToFileURL } = require('node:url');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const load = import(pathToFileURL(path.join(__dirname, '../config/uploadValidation.js')).href);
const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
const pdf = (fieldname, name = 'permit.pdf', body = '%PDF-1.7 test') => ({ fieldname, originalname: name, buffer: Buffer.from(body) });
const run = async (req) => { const api = await load; let reached = false; const res = response(); api.validateImages(req, res, () => { reached = true; }); return { reached, res }; };

for (const route of ['/accreditation', '/register-property']) {
    test('Legal document PDF accepted on ' + route, async () => {
        const { reached } = await run({ path: route, files: { permit_fire: [pdf('permit_fire'), pdf('permit_fire', 'second.pdf')] }, body: {} });
        assert.equal(reached, true);
    });
}
test('PDF rejected for photo fields', async () => {
    const { reached, res } = await run({ path: '/accreditation', files: { house_photos: [pdf('house_photos')] }, body: {} });
    assert.equal(reached, false); assert.equal(res.code, 400);
});
test('PDF rejected on single-document resubmission route', async () => {
    const { reached } = await run({ path: '/documents/update/7', file: pdf('permit_file'), body: {} });
    assert.equal(reached, false);
});
test('Renamed non-PDF content is rejected', async () => {
    const { reached, res } = await run({ path: '/register-property', files: { permit_fire: [pdf('permit_fire', 'fake.pdf', '<script>alert(1)</script>')] }, body: {} });
    assert.equal(reached, false); assert.match(res.body.message, /image or PDF/);
});
test('PDF signature with non-PDF extension is rejected', async () => {
    const { reached } = await run({ path: '/register-property', files: { permit_fire: [pdf('permit_fire', 'permit.exe')] }, body: {} });
    assert.equal(reached, false);
});
