import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { pdfAssets } from './build/pdfAssets.js';

export default defineConfig({
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [
    vue(),
    pdfAssets(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        enabled: true, // ◄── force PWA to run on npm run dev (Port 5173)
        suppressWarnings: true //automatically suppress workbox dev warnings
      },
      workbox: {
        cleanupOutdatedCaches: true,
        // Opening an uploaded file (new tab or PDF frame) or an API URL must reach the server, never the app shell.
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff2}'], // Automatically caches static files for offline usability
        maximumFileSizeToCacheInBytes: 15000000,
        runtimeCaching: [
          {
            // Public landing page listings (HomeView.vue): always try the network first so a
            // newly accredited house appears (list + map) right away; cache is the offline fallback.
            urlPattern: /\/api\/boarding-houses\/accredited/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-listings-cache',
              networkTimeoutSeconds: 5,
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
            urlPattern: /\/api\/student\/houses(\?.*)?$/i,
            handler: 'StaleWhileRevalidate',
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
          },
          {
            // Caches individual boarding house detail pages (HouseDetails.vue → /api/student/house/:id)
            urlPattern: /\/api\/student\/house\/\d+/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'student-house-detail-cache',
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
            // Preserve offline public listing photos. Document viewers fetch validated bytes,
            // rather than image requests, so their private files bypass this image-only cache.
            urlPattern: ({url,request}) => request.destination === 'image' && url.pathname.startsWith('/uploads/') && /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {cacheName:'public-upload-images-v2',expiration:{maxEntries:200,maxAgeSeconds:60*60*24*30},cacheableResponse:{statuses:[200]}}
          },
          {
            // Uploaded documents must never be answered from an old app-shell/image cache.
            urlPattern: /\/uploads\/.+/i,
            handler: 'NetworkOnly'
          }
        ]
      },
      manifest: {
        name: 'CSPC BH Finder',
        short_name: 'CSPC BH Finder',
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
