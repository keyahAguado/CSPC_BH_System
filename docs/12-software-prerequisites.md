# Software Prerequisites

## 1. Runtime Environments
| Component | Version | Notes |
|---|---|---|
| Node.js (backend) | 18 (Alpine) | Pinned in `backend/Dockerfile`. |
| Node.js (frontend build) | 20 (Alpine) | Pinned in `frontend/Dockerfile`; only needed at build time, not at runtime (the served output is static). |
| MySQL | 8.0 | Schema uses MySQL 8-specific window functions — see `docs/11-infrastructure-requirements.md` §3. |
| Nginx | Alpine (latest) | Serves the built frontend and, optionally, local media. |

## 2. Backend Dependencies (`backend/package.json`)
| Package | Version | Purpose |
|---|---|---|
| express | ^5.2.1 | Web framework. |
| mysql2 | ^3.22.4 | Database driver (promise-based pool). |
| jsonwebtoken | ^9.0.3 | JWT issuance/verification. |
| bcryptjs | ^3.0.3 | Password hashing (pure-JS implementation, no native build step required — chosen for portability across host environments). |
| passport, passport-google-oauth20 | ^0.7.0, ^2.0.0 | Google OAuth. |
| multer | ^2.1.1 | Multipart file upload handling (memory storage). |
| cloudinary | ^2.6.1 | Media storage SDK (used when `STORAGE_PROVIDER=cloudinary`). |
| axios | ^1.18.1 | Outbound HTTP calls (PayMongo API, Google Maps short-link resolution). |
| node-cron | ^4.2.1 | Scheduled jobs (compliance sweep, upload cleanup, keep-alive). |
| cors | ^2.8.6 | Cross-origin request handling. |
| dotenv | ^17.4.2 | Environment variable loading. |
| express-rate-limit | ^8.7.0 | **Installed but not currently applied anywhere in the codebase** — see `docs/13-security-configuration.md`. |
| helmet | ^8.3.0 | **Installed but not currently applied anywhere in the codebase** — see `docs/13-security-configuration.md`. |

Dev-only: `nodemon` (auto-restart during development), `selfsigned` (local HTTPS cert generation for dev, unused in production where Vercel/Render/Cloudflare terminate TLS).

## 3. Frontend Dependencies (`frontend/package.json`)
| Package | Version | Purpose |
|---|---|---|
| vue | ^3.5.34 | Core framework. |
| vue-router | ^4.6.4 | Client-side routing + role guards. |
| axios | ^1.16.1 | API calls. |
| chart.js, chartjs-plugin-datalabels | ^4.5.1, ^2.2.0 | Admin dashboard charts. |
| @googlemaps/js-api-loader | ^2.0.2 | Google Maps JS API loader. |
| heic2any | ^0.0.4 | Converts iPhone HEIC photo uploads to a web-compatible format client-side. |

Dev-only (build tooling): `vite` ^8.0.12, `@vitejs/plugin-vue`, `vite-plugin-pwa` ^1.3.0 (service worker/manifest generation), `tailwindcss` ^3.4.19, `postcss`, `autoprefixer`, `@vitejs/plugin-basic-ssl` (local HTTPS dev only).

## 4. Third-Party Accounts / API Credentials Required
| Service | Required for | Free tier viable? |
|---|---|---|
| Google Cloud Platform | OAuth 2.0 login (all roles), Maps JavaScript API, Places API, Geocoding API, Directions API | Yes, with usage caps — monitor Maps API billing as usage scales. |
| PayMongo | Online payment (GCash/Card) | Yes for testing (sandbox mode); a live/verified merchant account is required to accept real payments. |
| Cloudinary | Media storage — **only required if `STORAGE_PROVIDER=cloudinary`** (i.e., cloud deployment; not needed for self-hosted with local storage) | Yes, free tier sufficient for moderate volume. |

## 5. Licenses
All direct dependencies listed above are MIT-licensed (standard for the Node/Vue ecosystem packages used here) — no GPL or other copyleft/commercial-license dependencies are introduced by this project. No license fees are required to run the software itself; the only recurring costs are optional paid tiers of the third-party services in §4 if usage exceeds free-tier limits.

## 6. Browser Support (Client-Side)
Any modern evergreen browser (Chrome, Edge, Firefox, Safari) with Service Worker support for full PWA install/offline functionality. Internet Explorer is not supported (Vue 3 itself does not support IE11).
