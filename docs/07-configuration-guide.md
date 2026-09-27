# Configuration Guide

This guide documents every configurable setting in the system — what it controls, where it's read, and how to change it safely after installation.

---

## 1. Backend Environment Variables (`backend/.env`)

| Variable | Required | Default | Effect |
|---|---|---|---|
| `PORT` | No | `3000` | Port the Express server listens on. |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` | Yes | — | MySQL connection. |
| `JWT_SECRET` | Yes | — | Signs all login tokens. **Changing this invalidates every currently logged-in session.** |
| `FRONTEND_URL` | Yes | — | Used to construct OAuth callback URLs and PayMongo checkout redirect URLs. Must exactly match the live frontend origin (protocol + domain, no trailing slash). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | Yes | — | Google OAuth app credentials, from Google Cloud Console. |
| `STORAGE_PROVIDER` | No | `local` | `local` \| `cloudinary`. Determines where uploaded files (photos, permits, profile pictures) are written — see §2. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Only if `STORAGE_PROVIDER=cloudinary` | — | Cloudinary account credentials. |
| `UPLOADS_DIR` | No | `/app/uploads` (Docker) or `public/uploads` | Overrides where local-disk uploads are written, when `STORAGE_PROVIDER=local`. |
| `PAYMONGO_SECRET_KEY` | Yes (if online payment is enabled) | — | Server-side PayMongo API key for creating checkout sessions. |
| `PAYMONGO_WEBHOOK_SECRET` | Yes (if online payment is enabled) | — | Verifies that incoming `/api/payment/webhook` calls genuinely originate from PayMongo (HMAC signature check). |
| `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` | Docker path only | — | Set at the repository-root `.env`, consumed by `docker-compose.yml` to initialize the MySQL container. |

**A full annotated reference lives in `backend/.env.example` — copy it to `backend/.env` as the starting point for any new environment.**

## 2. Switching Media Storage Provider

Set `STORAGE_PROVIDER`:
- `local` — files are written to disk (`UPLOADS_DIR` or the default path) and served via the Nginx `media_storage` container (self-hosted) or a static file route (if applicable). **Not suitable for Render/Vercel-style hosting where the filesystem doesn't persist across deploys.**
- `cloudinary` — files are uploaded to Cloudinary and referenced by their returned HTTPS URL. Requires the three `CLOUDINARY_*` variables.

No code change is required to switch — `backend/config/upload.js` reads this variable at request time on every upload. Existing files already stored under the previous provider remain accessible at their existing URLs/paths; switching providers only affects *new* uploads going forward.

## 3. Frontend Environment Variables

| File | Purpose |
|---|---|
| `frontend/.env` | Used for local development (`npm run dev`). |
| `frontend/.env.production` | Used when building for production (`npm run build`) — this is the file Vercel reads. |

| Variable | Effect |
|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps JavaScript API key. Baked into the built JS bundle at build time — not a runtime secret (Maps keys are restricted by HTTP referrer/domain in the Google Cloud Console, not by being hidden). |
| `VITE_API_URL` | Backend base URL the frontend's axios client targets, if not using a same-origin proxy. |

**Rebuilding required:** unlike backend env vars (read live per-request), frontend `VITE_*` variables are compiled into the static build. Changing one requires a full `npm run build` (or a new Vercel deploy) to take effect.

## 4. Role & Domain Restrictions

Google OAuth login is domain-gated in `backend/config/passport.js`:
- Student accounts: must end in `@my.cspc.edu.ph`.
- Admin accounts: must end in `@cspc.edu.ph`.
- Owner accounts: any email (institutional or personal), since landlords are not CSPC-affiliated.

To change these domain restrictions (e.g. if the institution's email domain changes), edit the corresponding checks in `passport.js` — this is a code change, not an environment variable, since it's core business logic rather than deployment-specific configuration.

## 5. Compliance / Auto-Archive Thresholds

`backend/config/complianceManager.js` defines:
- Which 4 of the 8 legal permits are **critical** (trigger auto-archiving on expiry) vs. **supplementary** (notification-only).
- The warning window before expiry that triggers a "renewal reminder" notification (currently 30 days).

These are code-level constants, not environment variables, since changing accreditation policy is an institutional decision that should go through the same review as any other code change, not be silently adjustable via configuration.

## 6. Session Timeout

`frontend/src/App.vue` defines `IDLE_LIMIT_MS = 30 * 60 * 1000` (30 minutes) — the client-side inactivity window before an auto-logout. This is a frontend code constant; adjusting it requires a rebuild/redeploy of the frontend.

## 7. Scheduled Jobs

Defined in `backend/index.js` via `node-cron`:
| Job | Schedule | Purpose |
|---|---|---|
| Compliance/expiry sweep | `0 0 * * *` (daily, midnight) | Re-evaluates every accredited house's permit status; auto-archives on critical-permit expiry. |
| Orphaned upload cleanup | `30 0 * * *` (daily, 00:30) | Deletes local-disk files (only relevant when `STORAGE_PROVIDER=local`) no longer referenced by any database record. |
| Render keep-alive ping | `*/14 * * * *` (every 14 min) | Prevents Render's free-tier instance from idling out. **Remove this job if deployed on a paid/always-on tier**, as it becomes unnecessary overhead. |

To change a schedule, edit the corresponding `cron.schedule(...)` expression in `backend/index.js` and redeploy.
