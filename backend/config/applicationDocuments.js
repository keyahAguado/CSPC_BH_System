import { validDate } from './inputValidation.js';

export const customField = id => `custom_document_${id}`;
export async function applicationCriteria(db, houseId = null) {
    const [rows] = await db.query(
        'SELECT id, label, requirement_type, house_id FROM checklist_criteria WHERE is_active = 1 AND permit_key IS NULL AND id NOT BETWEEN 30 AND 37 AND (house_id IS NULL OR house_id = ?)',
        [houseId]
    );
    return rows;
}

export function customDocumentError(criteria, files, body, existing = []) {
    const allowed = new Set(criteria.map(c => customField(c.id)));
    if (Object.keys(files || {}).some(key => key.startsWith('custom_document_') && !allowed.has(key))) return 'A document requirement changed. Refresh the application before submitting.';
    for (const c of criteria) {
        const key = customField(c.id);
        const uploaded = files?.[key]?.length > 0;
        const saved = existing.find(d => Number(d.criteria_id) === Number(c.id));
        const hasFile = uploaded || !!saved?.file_path;
        if (c.requirement_type === 'required' && !hasFile) return `${c.label} document is required.`;
        const savedExpiry = saved?.expiry_date instanceof Date ? saved.expiry_date.toISOString().slice(0, 10) : String(saved?.expiry_date || '').slice(0, 10);
        const expiry = body[`expiry_${key}`] || (!uploaded ? savedExpiry : null);
        if (hasFile && (!expiry || !validDate(expiry))) return `A valid expiration date is required for ${c.label}.`;
    }
    return null;
}

export async function saveCustomDocuments(db, houseId, criteria, files, body, saveFile) {
    for (const c of criteria) {
        const key = customField(c.id);
        if (!files?.[key]?.length) {
            if (body[`expiry_${key}`]) await db.query('UPDATE house_documents SET expiry_date = ? WHERE house_id = ? AND criteria_id = ?', [body[`expiry_${key}`], houseId, c.id]);
            continue;
        }
        const paths = await Promise.all(files[key].map(f => saveFile(f.buffer, f.originalname, 'permits')));
        const [existing] = await db.query('SELECT id FROM house_documents WHERE house_id = ? AND criteria_id = ? FOR UPDATE', [houseId, c.id]);
        if (existing.length) {
            await db.query('UPDATE house_documents SET file_path = ?, file_paths = ?, expiry_date = ? WHERE house_id = ? AND criteria_id = ?', [paths[0], JSON.stringify(paths), body[`expiry_${key}`], houseId, c.id]);
        } else {
            await db.query('INSERT INTO house_documents (house_id, criteria_id, file_path, file_paths, expiry_date) VALUES (?, ?, ?, ?, ?)', [houseId, c.id, paths[0], JSON.stringify(paths), body[`expiry_${key}`]]);
        }
    }
}
