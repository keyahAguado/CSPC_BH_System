/**
 * offlineHelper.js
 * Provides a shared offline detection utility for all student-facing pages.
 *
 * Uses two signals:
 * 1. navigator.onLine + online/offline events (instant, but unreliable on desktop)
 * 2. Active HEAD probe to a known-fast endpoint every 8 seconds
 *    (catches desktop "connected to router but no internet" cases)
 */

import { ref, onMounted, onUnmounted } from 'vue';

/**
 * Composable that tracks real-time online/offline status.
 * Usage: const { isOffline } = useOfflineStatus()
 */
export function useOfflineStatus() {
    const isOffline = ref(!navigator.onLine);

    let probeInterval = null;

    // Active probe: HEAD request to a reliable, tiny endpoint.
    // Using the app's own API so no CORS issues.
    // Falls back to false (assume online) if the request returns any HTTP response
    // — only a network-level failure (TypeError) means truly offline.
    const probe = async () => {
        try {
            await fetch('/api/boarding-houses/accredited', {
                method: 'HEAD',
                cache: 'no-store',
                signal: AbortSignal.timeout(4000)
            });
            isOffline.value = false;
        } catch {
            isOffline.value = true;
        }
    };

    const onOnline = () => {
        isOffline.value = false;
    };

    const onOffline = () => {
        isOffline.value = true;
    };

    onMounted(() => {
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);

        // Run probe immediately on mount, then every 8 seconds
        probe();
        probeInterval = setInterval(probe, 8000);
    });

    onUnmounted(() => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
        if (probeInterval) clearInterval(probeInterval);
    });

    return { isOffline };
}
