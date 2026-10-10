import mysql from 'mysql2/promise';
import { DEFAULT_FEATURES, SITE_SETTING_DEFAULTS } from './siteContent.js';

let dbHost = process.env.DB_HOST || '127.0.0.1';

const poolConfig = {
    host: dbHost,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cspc_boarding_db',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool = mysql.createPool(poolConfig);

// Test the connection pool with self-healing retry logic and host auto-resolution
async function testConnection(retries = 5, delay = 3000) {
    for (let i = 1; i <= retries; i++) {
        try {
            const connection = await pool.getConnection();
            console.log(`✅ Connected to MySQL database: ${process.env.DB_NAME || 'cspc_boarding_db'} (Host: ${poolConfig.host})`);
            connection.release();
            await ensureSchemaColumns();
            return; // Success!
        } catch (err) {
            console.warn(`⚠️  Database connection attempt ${i}/${retries} failed (${err.message}). Retrying in ${delay / 1000}s...`);

            // Self-healing fallback: If DB_HOST='db' but running outside Docker on host machine
            if (err.code === 'ENOTFOUND' && poolConfig.host === 'db') {
                console.log('🔄 Detected local environment with DB_HOST=db. Automatically falling back to 127.0.0.1...');
                poolConfig.host = '127.0.0.1';
                pool = mysql.createPool(poolConfig);
            }

            if (i === retries) {
                console.error('❌ Database connection failed permanently:', err.message);
            } else {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}

async function ensureSchemaColumns() {
    try {
        const [userCols] = await pool.query("SHOW COLUMNS FROM users LIKE 'dpa_accepted'");
        if (userCols.length === 0) {
            await pool.query("ALTER TABLE users ADD COLUMN dpa_accepted TINYINT(1) DEFAULT 0, ADD COLUMN dpa_accepted_at DATETIME NULL DEFAULT NULL");
            console.log("✅ Auto-migrated: Added dpa_accepted and dpa_accepted_at to users table.");
        }

        const [roomCols] = await pool.query("SHOW COLUMNS FROM rooms LIKE 'deleted_at'");
        if (roomCols.length === 0) {
            await pool.query("ALTER TABLE rooms ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL");
            console.log("✅ Auto-migrated: Added deleted_at to rooms table for soft deletes.");
        }

        const [docCols] = await pool.query("SHOW COLUMNS FROM boarding_houses LIKE 'last_updated_document'");
        if (docCols.length > 0 && docCols[0].Type.toLowerCase().includes('varchar(50)')) {
            await pool.query("ALTER TABLE boarding_houses MODIFY COLUMN last_updated_document VARCHAR(255)");
            console.log("✅ Auto-migrated: Expanded last_updated_document in boarding_houses table to VARCHAR(255).");
        }

        const [archByCols] = await pool.query("SHOW COLUMNS FROM boarding_houses LIKE 'archived_by'");
        if (archByCols.length === 0) {
            await pool.query("ALTER TABLE boarding_houses ADD COLUMN archived_by VARCHAR(50) DEFAULT NULL, ADD COLUMN archive_reason TEXT DEFAULT NULL, ADD COLUMN archived_at DATETIME DEFAULT NULL");
            console.log("✅ Auto-migrated: Added archived_by, archive_reason, and archived_at columns to boarding_houses table.");
        }
    } catch (err) {
        console.warn("⚠️ Auto-migration check warning:", err.message);
    }
    await ensureSiteContentTables();
}

// Landing page content (Admin > Landing page). Defaults are seeded only when the
// features table is first created, so an admin who removes every card is not overridden
// on the next restart. Missing setting keys are filled without touching edited ones.
async function ensureSiteContentTables() {
    try {
        const [featureTables] = await pool.query("SHOW TABLES LIKE 'site_features'");
        if (featureTables.length === 0) {
            await pool.query(`CREATE TABLE IF NOT EXISTS site_features (
                id INT NOT NULL AUTO_INCREMENT,
                title VARCHAR(120) NOT NULL,
                description VARCHAR(500) NOT NULL,
                icon VARCHAR(50) NOT NULL DEFAULT 'shield-halved',
                sort_order INT NOT NULL DEFAULT 0,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`);
            const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM site_features');
            if (count === 0) {
                await pool.query(
                    'INSERT INTO site_features (title, description, icon, sort_order) VALUES ?',
                    [DEFAULT_FEATURES.map((f, i) => [f.title, f.description, f.icon, i + 1])]
                );
            }
            console.log("✅ Auto-migrated: Created site_features with the default landing page features.");
        }

        await pool.query(`CREATE TABLE IF NOT EXISTS site_settings (
            setting_key VARCHAR(64) NOT NULL,
            setting_value TEXT NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (setting_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`);
        await pool.query(
            'INSERT IGNORE INTO site_settings (setting_key, setting_value) VALUES ?',
            [Object.entries(SITE_SETTING_DEFAULTS)]
        );
    } catch (err) {
        console.warn("⚠️ Landing page content tables check warning:", err.message);
    }
}

// Fire the self-healing test on startup
testConnection();

export default pool;