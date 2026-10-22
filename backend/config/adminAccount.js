import bcrypt from 'bcryptjs';

export function createAdminAccountHandlers(pool) {
    const reply = (res, status, message) => res.status(status).json({ success: false, message });
    const permitted = req => req.user?.role === 'admin' && req.user?.status === 'active';
    return {
        async get(req, res) {
            if (!permitted(req)) return reply(res, 403, 'Access denied.');
            try {
                const [[user]] = await pool.query("SELECT id, name, email, google_id FROM users WHERE id = ? AND role = 'admin' AND status = 'active'", [req.user.id]);
                if (!user) return reply(res, 403, 'Access denied.');
                res.set('Cache-Control', 'no-store');
                return res.json({ success: true, account: { name: user.name, email: user.email, googleLinked: Boolean(user.google_id) } });
            } catch {
                return reply(res, 503, 'Unable to load account settings. Please try again.');
            }
        },
        async update(req, res) {
            if (!permitted(req)) return reply(res, 403, 'Access denied.');
            const { name, email, currentPassword, newPassword = '' } = req.body || {};
            if (typeof name !== 'string' || !name.trim() || name.trim().length > 255 ||
                typeof email !== 'string' || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
                typeof currentPassword !== 'string' || !currentPassword || Buffer.byteLength(currentPassword) > 72 ||
                typeof newPassword !== 'string' || (newPassword && (newPassword.length < 12 || Buffer.byteLength(newPassword) > 72))) {
                return reply(res, 400, 'Enter a valid name, email and current password. New passwords must contain at least 12 characters and at most 72 UTF-8 bytes.');
            }
            try {
                const [[user]] = await pool.query("SELECT id, email, password, google_id FROM users WHERE id = ? AND role = 'admin' AND status = 'active'", [req.user.id]);
                if (!user) return reply(res, 403, 'Access denied.');
                if (email.trim().toLowerCase() !== user.email.toLowerCase()) return reply(res, 403, 'The institutional administrator email cannot be changed in account settings. Contact the server administrator for an official account transfer.');
                if (!user.password || !await bcrypt.compare(currentPassword, user.password)) return reply(res, 400, 'Your current password is incorrect.');
                const password = newPassword ? await bcrypt.hash(newPassword, 12) : user.password;
                const [result] = await pool.query("UPDATE users SET name = ?, password = ? WHERE id = ? AND password = ? AND email = ? AND role = 'admin' AND status = 'active'", [name.trim(), password, user.id, user.password, user.email]);
                if (!result.affectedRows) return reply(res, 409, 'The account changed while saving. Reload and try again.');
                res.set('Cache-Control', 'no-store');
                return res.json({ success: true, account: { name: name.trim(), email: user.email, googleLinked: Boolean(user.google_id) }, message: 'Account settings saved.' });
            } catch (error) {
                return reply(res, error.code === 'ER_DUP_ENTRY' ? 409 : 503, error.code === 'ER_DUP_ENTRY' ? 'This email address is already registered.' : 'Unable to save account settings. Please try again.');
            }
        }
    };
}
