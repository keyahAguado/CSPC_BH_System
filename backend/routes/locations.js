import express from 'express';
import fs from 'node:fs';

// Philippine address lists (PSGC) served from a local copy, so address pickers do not depend on
// the public PSGC API being reachable. Paths mirror https://psgc.gitlab.io/api so the frontend
// can fall back to it. Data: backend/data/psgc.json (rebuilt rarely; PSGC changes about yearly).
const router = express.Router();

let lists = null;
function load() {
    if (lists) return lists;
    const data = JSON.parse(fs.readFileSync(new URL('../data/psgc.json', import.meta.url), 'utf8'));
    const byName = (a, b) => a.name.localeCompare(b.name);
    const group = (rows, key, toItem) => {
        const map = new Map();
        for (const row of rows) {
            if (!key(row)) continue;
            if (!map.has(key(row))) map.set(key(row), []);
            map.get(key(row)).push(toItem(row));
        }
        for (const items of map.values()) items.sort(byName);
        return map;
    };
    const item = ([code, name]) => ({ code, name });
    lists = {
        regions: data.regions.map(([code, name, regionName]) => ({ code, name, regionName })).sort((a, b) => a.code.localeCompare(b.code)),
        provincesByRegion: group(data.provinces, p => p[2], item),
        citiesByRegion: group(data.cities, c => c[3], item),
        citiesByProvince: group(data.cities, c => c[2], item),
        barangaysByCity: group(data.barangays, b => b[2], item)
    };
    return lists;
}

const send = (res, items) => res.json(items || []);
const code = /^\d{9}$/;
const withCode = (handler) => (req, res) => {
    if (!code.test(req.params.code)) return res.status(400).json({ success: false, message: 'Invalid location code.' });
    try { handler(req, res); } catch (err) {
        console.error('[LOCATIONS]', err.message);
        res.status(503).json({ success: false, message: 'Address lists are unavailable.' });
    }
};

router.get('/regions', (req, res) => {
    try { send(res, load().regions); } catch (err) {
        console.error('[LOCATIONS]', err.message);
        res.status(503).json({ success: false, message: 'Address lists are unavailable.' });
    }
});
router.get('/regions/:code/provinces', withCode((req, res) => send(res, load().provincesByRegion.get(req.params.code))));
router.get('/regions/:code/cities-municipalities', withCode((req, res) => send(res, load().citiesByRegion.get(req.params.code))));
router.get('/provinces/:code/cities-municipalities', withCode((req, res) => send(res, load().citiesByProvince.get(req.params.code))));
router.get('/cities-municipalities/:code/barangays', withCode((req, res) => send(res, load().barangaysByCity.get(req.params.code))));

export default router;
