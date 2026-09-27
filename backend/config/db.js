import mysql from 'mysql2/promise';

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
    } catch (err) {
        console.warn("⚠️ Auto-migration check warning:", err.message);
    }
}

// Fire the self-healing test on startup
testConnection();

export default pool;