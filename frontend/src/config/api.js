/**
 * Centralized API Base URL Resolver.
 * Dynamically resolves the backend API endpoint URL:
 * - If VITE_API_URL is configured to a non-localhost endpoint (e.g. production domain), it is used as-is.
 * - If accessed from a mobile phone or another device on LAN (window.location.hostname is an IP like 192.168.x.x),
 *   it dynamically binds to http://<window.location.hostname>:3000.
 * - Otherwise defaults to VITE_API_URL or 'http://localhost:3000'.
 */
export const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;

  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isNgrok = hostname.includes('ngrok');
    const isVercel = hostname.includes('vercel.app');
    // Private IPv4 ranges only (192.168.x.x, 10.x.x.x, 172.16-31.x.x) — actual LAN/mobile dev-testing,
    // not just "any hostname that isn't localhost" (that used to also catch real public domains).
    const isPrivateLanIp = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);

    // On Vercel production, use relative paths so requests go through the Vercel proxy
    // and stay same-origin — required for the service worker to intercept and cache them
    if (isVercel) {
      return '';
    }

    // When accessing via Ngrok, return origin so requests use Vite proxy without invalid :3000 port
    if (isNgrok) {
      return window.location.origin;
    }

    // Served on the standard web port (80/443) means the Docker/nginx setup: stay same-origin so /api and
    // /uploads go through nginx (also required by the Content Security Policy). Vite dev (:5173) is unaffected.
    const onStandardPort = !window.location.port || window.location.port === '80' || window.location.port === '443';
    if (onStandardPort && (!envUrl || envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))) {
      return '';
    }

    // When accessing over LAN IP on mobile/other device (e.g. 192.168.x.x), target laptop's IP on port 3000
    if (isPrivateLanIp && (!envUrl || envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))) {
      const protocol = window.location.protocol;
      return `${protocol}//${hostname}:3000`;
    }

    // Any other real domain (self-hosted Docker Compose deployment without an
    // explicit absolute VITE_API_URL override: stay same-origin so requests route through the Nginx
    // /api/ reverse proxy instead of assuming a directly-reachable backend port on that domain.
    if (!isLocalhost && !envUrl) {
      return '';
    }
  }

  return envUrl || 'http://localhost:3000';
};

export const API_BASE_URL = getApiBaseUrl();

/**
 * Helper to get the full, accessible image URL across desktop and mobile LAN devices.
 * Handles filenames, relative paths (/uploads/...), and full URLs (rewriting localhost to LAN IP on mobile).
 */
export const getImageUrl = (imagePath) => {
  if (!imagePath) return '';
  
  // Return data URLs or blob URLs as-is (used for instant image previews during file uploads)
  if (typeof imagePath === 'string' && (imagePath.startsWith('data:') || imagePath.startsWith('blob:'))) {
    return imagePath;
  }
  
  const baseUrl = getApiBaseUrl();

  // If already a full http:// or https:// URL
  if (typeof imagePath === 'string' && /^https?:\/\//i.test(imagePath)) {
    try {
      const urlObj = new URL(imagePath);
      // Rewrite localhost/127.0.0.1 to current accessible host/port if accessed from mobile/LAN
      if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1' || urlObj.hostname === '[::1]') {
        const baseObj = new URL(baseUrl || window.location.origin, window.location.origin);
        if(urlObj.pathname.startsWith('/public/uploads/'))urlObj.pathname=urlObj.pathname.replace('/public/uploads/','/uploads/');
        urlObj.protocol = baseObj.protocol;
        urlObj.hostname = baseObj.hostname;
        urlObj.port = baseObj.port;
        return urlObj.toString();
      }
    } catch (e) {
      // Fallback if URL parsing fails
    }
    return imagePath;
  }

  let cleanPath = String(imagePath).trim();

  // Normalize public/uploads/ prefixes
  if (cleanPath.startsWith('/public/uploads/')) {
    cleanPath = cleanPath.replace('/public/uploads/', '/uploads/');
  } else if (cleanPath.startsWith('public/uploads/')) {
    cleanPath = cleanPath.replace('public/uploads/', '/uploads/');
  }

  // Format relative paths vs filenames
  if (!cleanPath.startsWith('/uploads/') && !cleanPath.startsWith('uploads/')) {
    if (cleanPath.startsWith('/')) {
      // Static frontend asset (e.g. /img/profile.jpg)
      return cleanPath;
    } else {
      // Raw filename like "house_img-123.jpg"
      cleanPath = `/uploads/${cleanPath}`;
    }
  } else if (cleanPath.startsWith('uploads/')) {
    cleanPath = `/${cleanPath}`;
  }

  return `${baseUrl}${cleanPath}`;
};

