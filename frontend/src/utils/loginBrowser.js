// Best-effort detection only; ordinary browsers and installed PWAs stay eligible.
export function isEmbeddedLoginBrowser(userAgent = '') {
  return /Instagram|FBAN\/|FBAV\/|FB_IAB|\bLine\/|TikTok|BytedanceWebview|\bwv\b|WebView/i.test(userAgent);
}

export const GOOGLE_LOGIN_FAILURE = 'Google sign-in could not be completed. Open this site directly in Chrome or Safari, use your CSPC student Google account, and try again. If it still fails, contact SASO with the time of the attempt.';
