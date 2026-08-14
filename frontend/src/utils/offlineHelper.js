/**
 * offlineHelper.js
 * Provides a shared offline detection utility and a consistent
 * friendly offline banner component for all student-facing pages.
 */

import { ref, onMounted, onUnmounted } from 'vue';

/**
 * Composable that tracks real-time online/offline status.
 * Usage: const { isOffline } = useOfflineStatus()
 */
export function useOfflineStatus() {
    const isOffline = ref(!navigator.onLine);

    const onOnline = () => { isOffline.value = false; };
    const onOffline = () => { isOffline.value = true; };

    onMounted(() => {
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
    });

    onUnmounted(() => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
    });

    return { isOffline };
}
