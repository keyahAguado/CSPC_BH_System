const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const load = Promise.all(['backend/config/inputValidation.js', 'frontend/src/utils/inputValidation.js', 'backend/config/siteContent.js', 'frontend/src/constants/siteContent.js'].map(file => import(pathToFileURL(path.join(root, file)).href)));

const validFeature = { title: 'Online Reservations', description: 'Reserve a room from any device.', icon: 'calendar-check' };
const validSettings = {
    features_eyebrow: 'The Platform', features_heading: 'Core Features', footer_title: 'CSPC Boarding House Selection System',
    footer_tagline: 'Official SASO Accommodation Portal', footer_office: 'Student Affairs and Services Office', footer_address: 'San Miguel, Nabua, Camarines Sur',
    footer_email: 'saso@cspc.edu.ph', footer_phone: '0912 345 6789', footer_hours: 'Mon–Fri, 8:00 AM – 5:00 PM',
    footer_facebook: 'https://facebook.com/cspc', footer_website: '', footer_copyright: '© 2026 CSPC'
};

const both = async (scope, data) => {
    const [backend, frontend] = await load;
    const server = backend.validateInput(scope, data);
    assert.equal(frontend.validateInput(scope, data), server, 'browser and server validation must agree');
    return server;
};

test('Valid feature, move, and settings submissions are accepted identically', async () => {
    assert.equal(await both('siteFeature', validFeature), null);
    assert.equal(await both('featureMove', { direction: 'up' }), null);
    assert.equal(await both('featureMove', { direction: 'down' }), null);
    assert.equal(await both('siteSettings', validSettings), null);
    assert.equal(await both('siteSettings', { ...validSettings, footer_email: '', footer_phone: '', footer_facebook: '', features_eyebrow: '' }), null, 'optional fields may be empty');
});

for (const [key, value] of [['title', ''], ['title', '   '], ['title', 'A'.repeat(121)], ['title', {}], ['description', ''], ['description', 'A'.repeat(501)], ['icon', ''], ['icon', 'skull'], ['icon', 'fa-solid fa-star'], ['icon', []]]) {
    test('siteFeature rejects invalid ' + key + ' ' + JSON.stringify(value).slice(0, 40), async () => {
        assert.notEqual(await both('siteFeature', { ...validFeature, [key]: value }), null);
    });
}

for (const value of ['', 'left', {}, null]) test('featureMove rejects direction ' + JSON.stringify(value), async () => {
    assert.notEqual(await both('featureMove', { direction: value }), null);
});

for (const [key, value] of [
    ['features_heading', ''], ['footer_title', '  '], ['footer_title', 'A'.repeat(121)], ['footer_email', 'not-an-email'],
    ['footer_phone', 'call me'], ['footer_facebook', 'javascript:alert(1)'], ['footer_website', 'www.cspc.edu.ph'],
    ['footer_website', 'ftp://cspc.edu.ph'], ['footer_copyright', 'A'.repeat(256)], ['footer_address', {}]
]) test('siteSettings rejects invalid ' + key + ' ' + JSON.stringify(value).slice(0, 40), async () => {
    assert.notEqual(await both('siteSettings', { ...validSettings, [key]: value }), null);
});

test('Icon allowlists agree across backend, frontend catalogue, and validation', async () => {
    const [, , backendContent, frontendContent] = await load;
    assert.deepEqual(frontendContent.FEATURE_ICONS.map(i => i.value), backendContent.FEATURE_ICONS);
    for (const icon of backendContent.FEATURE_ICONS) assert.equal(await both('siteFeature', { ...validFeature, icon }), null, icon + ' must validate');
});

test('Default content is identical in backend, frontend fallback, and migration seed', async () => {
    const [, , backendContent, frontendContent] = await load;
    assert.deepEqual(frontendContent.SITE_SETTING_DEFAULTS, backendContent.SITE_SETTING_DEFAULTS);
    assert.deepEqual(frontendContent.DEFAULT_FEATURES.map(({ id, ...f }) => f), backendContent.DEFAULT_FEATURES);
    const sql = read('backend/migrations/2026-10-10_add_site_content.sql');
    for (const f of backendContent.DEFAULT_FEATURES) {
        assert(sql.includes(`'${f.title}'`), 'migration seeds ' + f.title);
        assert(sql.includes(`'${f.description.replaceAll("'", "''")}'`), 'migration seeds description of ' + f.title);
    }
    for (const [key, value] of Object.entries(backendContent.SITE_SETTING_DEFAULTS)) assert(sql.includes(`('${key}', '${value}')`), 'migration seeds ' + key);
    assert.equal(await both('siteSettings', backendContent.SITE_SETTING_DEFAULTS), null, 'defaults must pass validation');
    for (const f of backendContent.DEFAULT_FEATURES) assert.equal(await both('siteFeature', f), null, 'default feature must pass validation');
});

test('Settings keys accepted by validation match the stored keys', async () => {
    const [, , backendContent] = await load;
    const source = read('backend/config/inputValidation.js');
    const block = source.slice(source.indexOf("scope === 'siteSettings'"), source.indexOf("scope === 'approval'"));
    for (const key of backendContent.SITE_SETTING_KEYS) assert(block.includes(`'${key}'`), key + ' is validated');
});

test('settingsFromRows ignores unknown keys and fills missing ones', async () => {
    const [, , { settingsFromRows, SITE_SETTING_DEFAULTS }] = await load;
    const settings = settingsFromRows([{ setting_key: 'footer_email', setting_value: 'a@b.co' }, { setting_key: 'is_admin', setting_value: '1' }]);
    assert.equal(settings.footer_email, 'a@b.co');
    assert.equal(settings.is_admin, undefined);
    assert.equal(settings.footer_title, SITE_SETTING_DEFAULTS.footer_title);
});

test('Every admin landing page route is admin-only and validated before touching the database', () => {
    const admin = read('backend/routes/admin.js');
    for (const [route, scope] of [
        ["'/site-content/settings'", 'siteSettings'], ["'/site-content/features/add'", 'siteFeature'],
        ["'/site-content/features/update/:id'", 'siteFeature'], ["'/site-content/features/toggle/:id'", 'ids'],
        ["'/site-content/features/move/:id'", 'featureMove'], ["'/site-content/features/delete/:id'", 'ids']
    ]) {
        const line = admin.split('\n').find(l => l.includes('router.post(' + route));
        assert(line, route + ' exists');
        assert(line.includes('authenticateToken, verifyAdmin'), route + ' requires an admin session');
        assert(line.includes(`validateBody('${scope}')`), route + ' validates ' + scope);
    }
    const getLine = admin.split('\n').find(l => l.includes("router.get('/site-content'"));
    assert(getLine && getLine.includes('authenticateToken, verifyAdmin'), 'admin content listing requires an admin session');
});

test('Public endpoint only exposes visible cards and display fields', () => {
    const route = read('backend/routes/siteContent.js');
    assert(route.includes('WHERE is_active = 1'));
    assert(route.includes('SELECT id, title, description, icon FROM site_features'));
    assert(!/router\.(post|put|patch|delete)\(/.test(route), 'public router is read-only');
    assert(read('backend/index.js').includes("app.use('/api/site-content', siteContentRouter)"));
});

test('Migration is re-runnable and never rewrites or removes records', () => {
    const sql = read('backend/migrations/2026-10-10_add_site_content.sql');
    assert(sql.includes('CREATE TABLE IF NOT EXISTS `site_features`'));
    assert(sql.includes('CREATE TABLE IF NOT EXISTS `site_settings`'));
    assert(sql.includes('WHERE NOT EXISTS (SELECT 1 FROM `site_features`)'));
    assert(sql.includes('INSERT IGNORE INTO `site_settings`'));
    // No statement may begin with a destructive keyword ("ON UPDATE CURRENT_TIMESTAMP" column clauses are fine).
    assert(!/(?:^|;)\s*(?:UPDATE|DELETE|DROP|TRUNCATE|ALTER|REPLACE)\b/i.test(sql.replace(/^--.*$/gm, '')));
    const init = read('backend/config/init.sql');
    assert(init.includes('CREATE TABLE IF NOT EXISTS `site_features`') && init.includes('CREATE TABLE IF NOT EXISTS `site_settings`'), 'fresh installs include the tables');
});

test('Startup auto-migration seeds features only when the table is first created', () => {
    const db = read('backend/config/db.js');
    const fn = db.slice(db.indexOf('async function ensureSiteContentTables'));
    assert(fn.indexOf("SHOW TABLES LIKE 'site_features'") < fn.indexOf('INSERT INTO site_features'), 'seed is guarded by the table-exists check');
    assert(fn.includes('INSERT IGNORE INTO site_settings'), 'existing settings are never overwritten');
});

test('Landing page renders managed content with safe external links', () => {
    const home = read('frontend/src/views/HomeView.vue');
    assert(home.includes("axios.get('/api/site-content')"));
    assert(home.includes('v-for="feature in siteFeatures"'));
    assert(home.includes('{{ siteSettings.footer_copyright }}'));
    assert(home.includes('safeExternalUrl(siteSettings.value.footer_facebook)'));
    assert(home.includes('rel="noopener noreferrer"'));
    assert(!home.includes('v-html'), 'admin-entered text is never rendered as HTML');
});

test('safeExternalUrl only allows http(s) links', async () => {
    const [, , , { safeExternalUrl }] = await load;
    assert.equal(safeExternalUrl('https://cspc.edu.ph'), 'https://cspc.edu.ph');
    assert.equal(safeExternalUrl(' http://x.y '), 'http://x.y');
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', '', null, undefined, 42]) assert.equal(safeExternalUrl(bad), '');
});
