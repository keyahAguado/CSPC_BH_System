import { simulatedBookingTime } from './utils/bookingClock.js';
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './style.css'; // Tailwind CSS
import './styles/owner-design-system.css';
import './styles/print-actions.css';
import './styles/search-fields.css';
import './styles/popup.css';
import { registerSW } from 'virtual:pwa-register';

import axios from 'axios';
import { getApiBaseUrl } from './config/api';

// Evaluate the base URL once at startup — correct for all standard environments.
// The request interceptor below re-evaluates it lazily per request, which guarantees
// correctness even on first-load in LAN/ngrok scenarios where the hostname is already
// known to the browser at module evaluation time.
axios.defaults.baseURL = getApiBaseUrl();

// Per-request base URL re-evaluation: prevents stale localhost URLs on first load
// by recalculating the correct API base every time a request is dispatched.
axios.interceptors.request.use(config => {
  const dynamicBase = getApiBaseUrl();
  // Only override if the URL is relative (no protocol), ensuring absolute URLs are untouched
  if (config.url && !config.url.startsWith('http')) {
    config.baseURL = dynamicBase;
  }
  return config;
});

// ngrok free-tier shows a browser interstitial warning page for all tunnel requests.
// This header tells ngrok to skip that page and return the actual API response.
const baseUrl = getApiBaseUrl();
if (baseUrl.includes('ngrok')) {
  axios.defaults.headers.common['ngrok-skip-browser-warning'] = 'any';
}

// Global response interceptor: handle deactivated accounts and expired tokens.
let isRedirectingToAccountNotice = false;
axios.interceptors.response.use(
  response => {simulatedBookingTime.value=response.headers['x-booking-test-time'] || null;return response;},
  error => {
    const status = error?.response?.status;
    const msg = error?.response?.data?.message || '';
    const isInactive = (status === 401 || status === 403) &&
      (error?.response?.data?.code === 'ACCOUNT_INACTIVE' || msg === 'Your account has been deactivated by SASO.');
    if (isInactive) {
      sessionStorage.removeItem('cspc_token');
      sessionStorage.removeItem('cspc_user');
      if (!isRedirectingToAccountNotice && router.currentRoute.value.name !== 'AccountDeactivated') {
        isRedirectingToAccountNotice = true;
        router.replace('/account-deactivated').finally(() => { isRedirectingToAccountNotice = false; });
      }
    } else if (!isRedirectingToAccountNotice && router.currentRoute.value.name !== 'AccountDeactivated' &&
      (status === 401 || status === 403) && msg.toLowerCase().includes('token')) {
      sessionStorage.removeItem('cspc_token');
      sessionStorage.removeItem('cspc_user');
      router.push('/login');
    }
    return Promise.reject(error);
  }
);

// Register the PWA service worker automatically
registerSW({ immediate: true });

// Auto-reload the PWA when a new version is deployed and the service worker updates.
// This ensures installed phone apps pick up changes without needing a manual refresh.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

const app = createApp(App);
app.use(router);
app.mount('#app');
