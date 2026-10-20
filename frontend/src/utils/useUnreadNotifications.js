import { ref, onMounted, onUnmounted } from 'vue';
import axios from 'axios';

// Schedule after completion so a slow/offline server cannot accumulate requests.
export function useUnreadNotifications() {
  const count = ref(0);
  let timer, controller, stopped = false, failures = 0;
  async function refresh() {
    if (stopped || controller) return;
    clearTimeout(timer);
    const token = sessionStorage.getItem('cspc_token');
    if (!token) return;
    if (document.hidden || !navigator.onLine) { schedule(); return; }
    controller = new AbortController();
    try {
      const response = await axios.get('/api/notifications/unread-count', {
        headers: { Authorization: 'Bearer ' + token },
        signal: controller.signal, timeout: 10000
      });
      if (!stopped && response.data.success) count.value = response.data.count || 0;
      failures = 0;
    } catch (error) {
      if (!stopped && error.code !== 'ERR_CANCELED') failures = Math.min(failures + 1, 4);
    } finally {
      controller = null;
      schedule();
    }
  }
  function schedule() {
    if (!stopped) timer = setTimeout(refresh, Math.min(120000, 15000 * 2 ** failures));
  }
  onMounted(() => {
    void refresh();
    window.addEventListener('notification-updated', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
  });
  onUnmounted(() => {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
    window.removeEventListener('notification-updated', refresh);
    window.removeEventListener('online', refresh);
    document.removeEventListener('visibilitychange', refresh);
  });
  return count;
}
