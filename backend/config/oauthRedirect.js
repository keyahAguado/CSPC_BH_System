// Match the frontend origins already supported by the application's CORS policy.
const KNOWN_FRONTEND_ORIGINS = [
    'http://localhost',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'https://cspc-bh-system.vercel.app',
    'https://boardinghouse.cspc.edu.ph'
];

const parseOrigin = (value) => {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
        return url.origin;
    } catch {
        return null;
    }
};

export function getTrustedOAuthOrigin(candidate, configuredFrontend = process.env.FRONTEND_URL) {
    const configuredOrigin = parseOrigin(configuredFrontend);
    const allowed = new Set(KNOWN_FRONTEND_ORIGINS);
    if (configuredOrigin) allowed.add(configuredOrigin);
    const candidateOrigin = parseOrigin(candidate);
    return candidateOrigin && allowed.has(candidateOrigin)
        ? candidateOrigin
        : (configuredOrigin || 'http://localhost');
}
