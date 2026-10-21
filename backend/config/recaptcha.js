// Verify password-login challenges before looking up an account.
export function createRecaptchaVerifier({ env = process.env, fetcher = globalThis.fetch } = {}) {
    return async function verifyLoginRecaptcha(req, res, next) {
        const unavailable = () => res.status(503).json({ success: false, message: 'Login verification is temporarily unavailable. Please try again later.', code: 'CAPTCHA_UNAVAILABLE' });
        const rejected = () => res.status(403).json({ success: false, message: 'Please complete a new CAPTCHA verification and try again.', code: 'CAPTCHA_REQUIRED' });
        const secret = env.RECAPTCHA_SECRET_KEY?.trim();
        let hostname;
        try { const origin = new URL(env.FRONTEND_URL); if (!['http:', 'https:'].includes(origin.protocol)) return unavailable(); hostname = origin.hostname.toLowerCase(); } catch { return unavailable(); }
        if (!secret) return unavailable();
        const token = req.body?.recaptchaToken;
        if (typeof token !== 'string' || !token.trim() || token.length > 8192) return rejected();
        try {
            const response = await fetcher('https://www.google.com/recaptcha/api/siteverify', {
                method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ secret, response: token }), signal: AbortSignal.timeout(10000)
            });
            if (!response.ok) return unavailable();
            const result = await response.json();
            if (Array.isArray(result?.['error-codes']) && result['error-codes'].some(code => ['missing-input-secret', 'invalid-input-secret', 'bad-request'].includes(code))) return unavailable();
            if (result?.success !== true || typeof result.hostname !== 'string' || result.hostname.toLowerCase() !== hostname) return rejected();
        } catch {
            // Request errors may contain secrets or challenge tokens; do not log them.
            return unavailable();
        }
        return next();
    };
}
export const verifyLoginRecaptcha = createRecaptchaVerifier();
