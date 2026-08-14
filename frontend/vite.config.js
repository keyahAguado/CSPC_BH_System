import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        enabled: true, // ◄── force PWA to run on npm run dev (Port 5173)
        suppressWarnings: true //automatically suppress workbox dev warnings
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'], // Automatically caches static files for offline usability
        maximumFileSizeToCacheInBytes: 3000000,
        runtimeCaching: [
          {
            // Caches the public landing page listings (HomeView.vue)
            // Pattern matches both relative /api/... and full cross-origin URLs (production backend)
            urlPattern: /\/api\/boarding-houses\/accredited/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-listings-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 Days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // Caches the student dashboard listings (StudentDashboard.vue → /api/student/houses)
            // Uses a broad pattern that matches the path regardless of the backend domain
            urlPattern: /\/api\/student\/houses(\?.*)?$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'student-houses-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 Days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      manifest: {
        name: 'CSPC Boarding House System',
        short_name: 'CSPC Board',
        description: 'PWA-Integrated Boarding House Selection & Transaction Management for CSPC',
        theme_color: '#2563eb',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ],
        screenshots: [
          {
            src: 'screenshot-desktop.png',
            sizes: '1884x871',
            type: 'image/png',
            form_factor: 'wide',
            label: 'CSPC Boarding House System Desktop View'
          },
          {
            src: 'screenshot-mobile.png',
            sizes: '852x806',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'CSPC Boarding House System Mobile View'
          }
        ]
      }
    })
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});