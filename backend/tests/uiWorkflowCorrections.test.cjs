const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
let attachments;
test.before(async () => { attachments = await import('../../frontend/src/utils/documentFiles.js'); });
test('All ordered permit pages survive string/numeric property IDs, with legacy fallback', () => {
    const rows = [{ house_id: '47', permit_key: 'permit_fire', file_path: '/first.png' }, { house_id: 47, permit_key: 'permit_fire', file_path: '/second.pdf' }, { house_id: 48, permit_key: 'permit_fire', file_path: '/foreign.png' }];
    assert.deepEqual(attachments.permitAttachments({ id: 47 }, 'permit_fire', rows), ['/first.png', '/second.pdf']);
    assert.deepEqual(attachments.permitAttachments({ id: 47, permit_barangay: '/legacy.pdf' }, 'permit_barangay', rows), ['/legacy.pdf']);
    assert.deepEqual(attachments.documentAttachments({ file_paths: '["/a.png","/b.pdf","/a.png"]' }), ['/a.png', '/b.pdf']);
});
for (const page of ['Registered', 'Archived']) test(`${page} viewer opens the selected attachment and navigates the complete set`, () => {
    const src = read(`frontend/src/views/admin/${page}.vue`), start = src.indexOf('const openPreviewSet ='), end = src.indexOf('const closePreview =', start);
    const c = { previewFiles: { value: [] }, previewIndex: { value: 0 }, previewImageUrl: { value: '' }, previewZoomed: { value: false }, showPreviewModal: { value: false }, getImageUrl: value => value };
    const f = vm.runInNewContext(src.slice(start, end) + '\n({openPreviewSet,stepPreview})', c);
    f.openPreviewSet(['/1.png', '/2.pdf', '/3.png'], 1);
    assert.equal(c.previewImageUrl.value, '/2.pdf');
    f.stepPreview(1); assert.equal(c.previewImageUrl.value, '/3.png');
    f.stepPreview(1); assert.equal(c.previewImageUrl.value, '/1.png');
});
test('PDF attachment tiles recognize PDFs with query strings', () => {
    const line = read('frontend/src/components/DocumentAttachmentList.vue').split('\n').find(line => line.startsWith('const isPdf ='));
    const isPdf = vm.runInNewContext(line + '\nisPdf');
    assert.equal(isPdf('/document.pdf?download=1'), true);
    assert.equal(isPdf('/document.png'), false);
});
const owner = read('backend/routes/owner.js');
const editRoutes = [...owner.matchAll(/router\.put\('\/rooms\/edit\/:roomId'/g)].map(match => {
    const start = owner.indexOf('async (req, res) => {', match.index), end = owner.indexOf('\n});', start);
    return owner.slice(start, end + 2);
});
for (const [index, source] of editRoutes.entries()) {
    for (const capacity of [3, 4, 2]) test(`Room update ${index + 1}: capacity ${capacity} ${capacity < 3 ? 'still protects occupied beds' : 'allows unrelated edits'}`, async () => {
        let checked = false, written = false, committed = false;
        const c = { async beginTransaction() {}, async commit() { committed = true; }, async rollback() {}, release() {}, async query(sql) {
            if (sql.includes('FROM rooms r')) return [[{ id: 1, house_id: 47, room_number: '102', capacity: 3, price: 3000 }]];
            if (sql.startsWith('UPDATE rooms')) written = true;
            return [{}];
        } };
        const handler = vm.runInNewContext('(' + source + ')', {
            pool: { getConnection: async () => c }, parseRoomInput: (roomNumber, cap) => ({ roomNumber, capacity: Number(cap) }), saveRoomDetails: async () => {},
            getRoomCapacityUsage: async () => { checked = true; return { requiredCapacity: 3, occupants: 3, reserved: 0 }; }, console: { error() {} }
        });
        const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
        await handler({ user: { id: 10 }, params: { roomId: '1' }, body: { room_number: '102', capacity, price: 3500 } }, res);
        assert.equal(res.code, capacity < 3 ? 400 : 200);
        assert.equal(checked, capacity < 3); assert.equal(written, capacity >= 3); assert.equal(committed, capacity >= 3);
    });
}
function addressFixture() {
    const { ref, computed, watch, reactive } = require('../../frontend/node_modules/vue');
    const src = read('frontend/src/components/AddressPicker.vue').split('<script setup>')[1].split('</script>')[0].replace(/^import .*;\r?\n/gm, '');
    const pending = [];
    const f = vm.runInNewContext(src + '\n({complete,regionCode,provinceCode,cityCode,barangayCode,regionOptions,provinceOptions,cityOptions,barangayOptions,loading,loadError,onRegionChange})', {
        ref, computed, watch, defineProps: () => reactive({ modelValue: 'Saved address' }), defineEmits: () => () => {},
        getRegions: async () => [], getProvinces: code => new Promise(resolve => pending.push({ code, resolve })), getCities: async () => [], getCitiesByRegion: async () => [], getBarangays: async () => []
    });
    return { f, pending };
}
test('Address is incomplete while loading, after failure, or before selecting a barangay', () => {
    const { f } = addressFixture();
    for (const [level, code] of [['region', 'r'], ['province', 'p'], ['city', 'c'], ['barangay', 'b']]) {
        f[level + 'Options'].value = [{ code, name: code }]; f[level + 'Code'].value = code;
    }
    assert.equal(f.complete.value, true);
    f.loading.value = 'barangay'; assert.equal(f.complete.value, false);
    f.loading.value = ''; f.loadError.value = 'Failed'; assert.equal(f.complete.value, false);
    f.loadError.value = ''; f.barangayOptions.value = []; assert.equal(f.complete.value, false);
});
test('Old address responses cannot replace the latest region selection', async () => {
    const { f, pending } = addressFixture();
    f.regionCode.value = 'old'; const old = f.onRegionChange();
    f.regionCode.value = 'new'; const current = f.onRegionChange();
    pending[1].resolve([{ code: 'new-province' }]); await current;
    pending[0].resolve([{ code: 'old-province' }]); await old;
    assert.equal(f.provinceOptions.value[0].code, 'new-province');
});
