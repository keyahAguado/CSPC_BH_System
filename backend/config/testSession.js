// Test sessions for the booking test calendar. Starting a session copies every table into zz_snap_<table>
// inside the same database; ending it either restores those copies (undoing everything done while testing,
// including bookings, payments recorded, notifications and accounts) or discards them. Uploaded files are not touched.
const PREFIX = 'zz_snap_';
const META = PREFIX + 'meta';
const fail = (status, message) => Object.assign(new Error(message), { status });

async function baseTables(c) {
    const [rows] = await c.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
    return rows.map(r => Object.values(r)[0]).filter(t => !t.startsWith(PREFIX));
}

export async function testSessionState(pool) {
    try {
        const [rows] = await pool.query('SELECT taken_at, tables FROM ' + META + ' WHERE id = 1');
        return rows.length ? { active: true, startedAt: rows[0].taken_at, tables: Number(rows[0].tables) } : { active: false };
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') return { active: false };
        throw error;
    }
}

export async function startTestSession(pool) {
    if ((await testSessionState(pool)).active) throw fail(409, 'A test session is already running. Restore or discard it first.');
    const c = await pool.getConnection();
    try {
        const tables = await baseTables(c);
        for (const table of tables) {
            const copy = c.escapeId(PREFIX + table), source = c.escapeId(table);
            await c.query('DROP TABLE IF EXISTS ' + copy);
            await c.query('CREATE TABLE ' + copy + ' LIKE ' + source);
            await c.query('INSERT INTO ' + copy + ' SELECT * FROM ' + source);
        }
        // Written last: a session only counts as started once every copy exists.
        await c.query('CREATE TABLE IF NOT EXISTS ' + META + ' (id TINYINT PRIMARY KEY, taken_at DATETIME NOT NULL, tables INT NOT NULL)');
        await c.query('REPLACE INTO ' + META + ' (id, taken_at, tables) VALUES (1, UTC_TIMESTAMP(), ?)', [tables.length]);
        return { ...(await testSessionState(pool)), message: 'Test session started. A copy of all data was saved; restore it when you finish testing.' };
    } finally { c.release(); }
}

async function dropCopies(c) {
    const [rows] = await c.query('SHOW TABLES LIKE ?', [PREFIX.replace(/_/g, '\\_') + '%']);
    for (const r of rows) await c.query('DROP TABLE IF EXISTS ' + c.escapeId(Object.values(r)[0]));
}

export async function endTestSession(pool, { restore }) {
    if (!(await testSessionState(pool)).active) throw fail(409, 'No test session is running.');
    const c = await pool.getConnection();
    try {
        if (restore) {
            const tables = await baseTables(c);
            const [copies] = await c.query('SHOW TABLES LIKE ?', [PREFIX.replace(/_/g, '\\_') + '%']);
            const saved = new Set(copies.map(r => Object.values(r)[0]));
            await c.beginTransaction();
            try {
                await c.query('SET FOREIGN_KEY_CHECKS = 0');
                for (const table of tables) {
                    if (!saved.has(PREFIX + table)) continue; // created during the session: left as it is
                    await c.query('DELETE FROM ' + c.escapeId(table));
                    await c.query('INSERT INTO ' + c.escapeId(table) + ' SELECT * FROM ' + c.escapeId(PREFIX + table));
                }
                await c.commit();
            } catch (error) { await c.rollback(); throw error; }
            finally { await c.query('SET FOREIGN_KEY_CHECKS = 1'); }
        }
        await dropCopies(c);
        return { active: false, message: restore ? 'Test session ended. All data was restored to how it was when the session started.' : 'Test session ended. Changes made while testing were kept.' };
    } finally { c.release(); }
}
