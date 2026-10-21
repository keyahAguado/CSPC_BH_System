// Share one script request across visits; a failed load can be retried.
export function createRecaptchaLoader({ window, document, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let pending;
  return function loadRecaptcha() {
    if (typeof window.grecaptcha?.render === 'function') return Promise.resolve(window.grecaptcha);
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      document.getElementById('recaptcha-script')?.remove();
      const script = document.createElement('script');
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimer(timer); script.onerror = null;
        window.__cspcRecaptchaReady = () => {};
        if (error) { script.remove(); pending = undefined; reject(error); }
        else resolve(window.grecaptcha);
      };
      const timer = setTimer(() => finish(new Error('CAPTCHA took too long to load. Check your connection and retry.')), 30000);
      window.__cspcRecaptchaReady = () => finish(typeof window.grecaptcha?.render === 'function' ? null : new Error('CAPTCHA could not start. Please retry.'));
      script.id = 'recaptcha-script';
      script.src = 'https://www.google.com/recaptcha/api.js?onload=__cspcRecaptchaReady&render=explicit';
      script.async = true; script.defer = true;
      script.onerror = () => finish(new Error('CAPTCHA could not load. Check your connection and retry.'));
      document.head.appendChild(script);
    });
    return pending;
  };
}
let loader;
export function loadRecaptcha() {
  loader ||= createRecaptchaLoader({ window, document });
  return loader();
}
