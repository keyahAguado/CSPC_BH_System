import mysql from 'mysql2/promise';

// Replaces hardcoded localhost with IPv4 compliant .env variables
const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cspc_boarding_db',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test the connection pool with self-healing retry logic
async function testConnection(retries = 5, delay = 3000) {
    for (let i = 1; i <= retries; i++) {
        try {
            const connection = await pool.getConnection();
            console.log(`✅ Connected to MySQL database: ${process.env.DB_NAME || 'cspc_boarding_db'}`);
            connection.release();
            return; // Success! Exit the retry loop.
        } catch (err) {
            console.warn(`⚠️  Database not ready yet (Attempt ${i}/${retries}). Retrying in ${delay / 1000}s...`);
            if (i === retries) {
                console.error('❌ Database connection failed permanently:', err.message);
            } else {
                // Wait for the specified delay before trying again
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}

// Fire the self-healing test on startup
testConnection();

export default pool;