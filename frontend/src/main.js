import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './style.css'; // Tailwind CSS
import { registerSW } from 'virtual:pwa-register';

import axios from 'axios';
import { getApiBaseUrl } from './config/api';

axios.defaults.baseURL = getApiBaseUrl();

// ngrok free-tier shows a browser interstitial warning page for all tunnel requests.
// This header tells ngrok to skip that page and return the actual API response.
const baseUrl = getApiBaseUrl();
if (baseUrl.includes('ngrok')) {
  axios.defaults.headers.common['ngrok-skip-browser-warning'] = 'any';
}

// Global response interceptor: redirect to login on expired/invalid token
axios.interceptors.response.use(
  response => response,
  error => {
    const status = error?.response?.status;
    const msg = error?.response?.data?.message || '';
    if ((status === 401 || status === 403) && msg.toLowerCase().includes('token')) {
      localStorage.removeItem('cspc_token');
      localStorage.removeItem('cspc_user');
      router.push('/login');
    }
    return Promise.reject(error);
  }
);

// Register the PWA service worker automatically
registerSW({ immediate: true });

const app = createApp(App);
app.use(router);
app.mount('#app');