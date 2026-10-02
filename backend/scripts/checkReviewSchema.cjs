// Read-only readiness check. Does not import db.js or run migrations.
const path = require('node:path');

function getSchemaIssues(rows) {
    const fields = new Map(rows.map(row => [row.COLUMN_NAME, row]));
    const issues = [];
    const resubmitted = fields.get('resubmitted_at');
    const previous = fields.get('status_before_archive');
    if (!resubmitted) issues.push('Missing boarding_houses.resubmitted_at; review the 2026-09-30 migration.');
    else if (!/^datetime(?:\(\d+\))?$/i.test(resubmitted.COLUMN_TYPE) || resubmitted.IS_NULLABLE !== 'YES') issues.push('resubmitted_at must be a nullable DATETIME; review its definition without resetting data.');
    if (!previous) issues.push('Missing boarding_houses.status_before_archive; review the 2026-10-02 migration.');
    else {
        const length = /^varchar\((\d+)\)$/i.exec(previous.COLUMN_TYPE);
        if (!length || Number(length[1]) < 20 || previous.IS_NULLABLE !== 'YES') issues.push('status_before_archive must be nullable VARCHAR(20) or wider; review its definition without resetting data.');
    }
    return issues;
}

async function main() {
    require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
    const mysql = require('mysql2/promise');
    let connection;
    try {
        const host = process.argv.includes('--local') && process.env.DB_HOST === 'db' ? '127.0.0.1' : process.env.DB_HOST || '127.0.0.1';
        connection = await mysql.createConnection({
            host, user: process.env.DB_USER || 'root', password: process.env.DB_PASS || process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'cspc_boarding_db', port: process.env.DB_PORT || 3306, connectTimeout: 10000
        });
        await connection.query('START TRANSACTION READ ONLY');
        const [rows] = await connection.query(
            'SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME IN (?, ?)',
            ['boarding_houses', 'resubmitted_at', 'status_before_archive']
        );
        await connection.rollback();
        const issues = getSchemaIssues(rows);
        if (issues.length) {
            console.error('Review/archive schema is not ready. No data was changed.');
            issues.forEach(issue => console.error(issue));
            process.exitCode = 1;
        } else console.log('Review/archive schema is ready. Both required columns are compatible. No data was changed.');
    } catch (error) {
        console.error('Unable to check schema readiness (' + (error.code || 'connection_error') + '). Verify database availability; no migrations were run.');
        process.exitCode = 1;
    } finally {
        if (connection) await connection.end();
    }
}

module.exports = { getSchemaIssues };
if (require.main === module) main();
