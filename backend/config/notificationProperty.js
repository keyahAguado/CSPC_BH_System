// Which real boarding house a notification is about, for the inbox "Property" column and filter.
// Only properties the signed-in account may see are candidates, and a quoted name in the message
// counts only when it exactly matches one of them. Names of deleted or unrelated properties, and
// other quoted text (document labels, old wording), are never shown as a property.

export async function visiblePropertyNames(db, user) {
    if (user.role === 'admin') {
        const [rows] = await db.query('SELECT name FROM boarding_houses');
        return rows.map(r => r.name);
    }
    if (user.role === 'owner') {
        const [rows] = await db.query('SELECT name FROM boarding_houses WHERE owner_id = ?', [user.id]);
        return rows.map(r => r.name);
    }
    const [rows] = await db.query('SELECT DISTINCT bh.name FROM bookings b JOIN boarding_houses bh ON bh.id = b.house_id WHERE b.student_id = ?', [user.id]);
    return rows.map(r => r.name);
}

const key = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

export function propertyMatcher(names) {
    const byKey = new Map();
    for (const name of names) if (key(name)) byKey.set(key(name), String(name).trim());
    // First quoted text in the message that is one of the account's properties
    return (message) => {
        for (const [, quoted] of String(message || '').matchAll(/"([^"]{1,255})"/g)) {
            const found = byKey.get(key(quoted));
            if (found) return found;
        }
        return null;
    };
}
