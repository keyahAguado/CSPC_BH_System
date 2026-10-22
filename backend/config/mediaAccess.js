import jwt from 'jsonwebtoken';
import { readVerifiedApplicant, isTrackingSessionActive } from './applicantVerification.js';
import { isPendingApplicant } from './applicationWorkflow.js';

// Only the owning account, its verified applicant, or a current admin may open permits.
export function createDocumentAccess({ pool, verifyLogin = token => jwt.verify(token, process.env.JWT_SECRET), readApplicant = readVerifiedApplicant, trackingActive = isTrackingSessionActive }) {
    return async (header, filePath) => {
        if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
        let identity, applicant = false;
        try { identity = verifyLogin(header.slice(7)); }
        catch { try { identity = readApplicant(header); applicant = true; } catch { return false; } }
        let rows;
        if (applicant) {
            [rows] = await pool.query('SELECT id, email, role, status, password, google_id FROM users WHERE email = ?', [identity.email]);
            if (!isPendingApplicant(rows[0]) || (identity.applicantId && identity.applicantId !== rows[0].id)) return false;
            if (identity.sid && !(await trackingActive(pool, identity.sid, identity.email))) return false;
        } else {
            if (!Number.isInteger(identity.id)) return false;
            [rows] = await pool.query('SELECT id, email, role, status, password, google_id FROM users WHERE id = ?', [identity.id]);
            if (!rows[0] || rows[0].status !== 'active' || !['owner', 'admin'].includes(rows[0].role)) return false;
            if (rows[0].role === 'admin') return true;
        }
        const permitColumns = ['business_form', 'cedula', 'dti', 'barangay', 'building', 'zoning', 'sanitary', 'fire'];
        const [houses] = await pool.query(
            'SELECT bh.id FROM boarding_houses bh LEFT JOIN house_permit_files pf ON pf.house_id = bh.id LEFT JOIN house_documents hd ON hd.house_id = bh.id WHERE bh.owner_id = ? AND (' +
            permitColumns.map(key => 'bh.permit_' + key + ' = ?').join(' OR ') +
            ' OR pf.file_path = ? OR hd.file_path = ? OR JSON_CONTAINS(COALESCE(hd.file_paths, JSON_ARRAY()), JSON_QUOTE(?))) LIMIT 1',
            [rows[0].id, ...Array(permitColumns.length + 3).fill(filePath)]
        );
        return houses.length > 0;
    };
}
