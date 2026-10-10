import express from 'express';
import pool from '../config/db.js';
import { DEFAULT_FEATURES, settingsFromRows } from '../config/siteContent.js';

const router = express.Router();

// GET - Public landing page content (visible Core Features cards + footer details).
// Read-only and unauthenticated: it only exposes text the admin chose to publish.
router.get('/', async (req, res) => {
    try {
        const [features] = await pool.query(
            'SELECT id, title, description, icon FROM site_features WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
        );
        const [settingRows] = await pool.query('SELECT setting_key, setting_value FROM site_settings');
        res.json({ success: true, features, settings: settingsFromRows(settingRows) });
    } catch (err) {
        // Tables not migrated yet (or DB briefly unavailable): serve the original content.
        console.error('[SITE CONTENT] Public fetch failed:', err.message);
        res.json({ success: true, fallback: true, features: DEFAULT_FEATURES.map((f, i) => ({ id: -(i + 1), ...f })), settings: settingsFromRows([]) });
    }
});

export default router;
