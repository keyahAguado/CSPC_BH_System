# Installation Guide

This guide covers two installation paths. Choose one:

- **Path A — Self-hosted via Docker** (recommended for on-premises institutional hosting; no external cloud accounts required for hosting itself).
- **Path B — Cloud deployment** (Vercel + Render + external MySQL + Cloudinary, the configuration this system currently runs on in production).

---

## Path A: Self-Hosted (Docker Compose)

### A.1 Prerequisites
- Docker Desktop (or Docker Engine + Docker Compose plugin on Linux), version supporting Compose file format 3.8+.
- Ports **80**, **3000**, **3306**, and **8080** free on the host machine.
- Google Cloud, Cloudinary (optional if using local storage), and PayMongo API credentials — see §4 of `docs/05-system-architecture.md` for the full variable list.

### A.2 Steps
1. Clone the repository and `cd` into its root.
2. Create `backend/.env` from `backend/.env.example`, filling in real credentials (database password, JWT secret, Google OAuth, PayMongo keys). For self-hosted deployments, set `STORAGE_PROVIDER=local` (no Cloudinary account required).
3. Create a `.env` file at the repository root (used by `docker-compose.yml` for the database container) defining at minimum:
   ```
   MYSQL_ROOT_PASSWORD=<choose a strong password>
   MYSQL_PASSWORD=<choose a strong password>
   DB_PASSWORD=<same as MYSQL_PASSWORD>
   FRONTEND_URL=http://localhost
   JWT_SECRET=<random long string>
   ```
4. From the repository root, run:
   ```bash
   docker compose up -d --build
   ```
5. Wait for all four containers to report healthy:
   ```bash
   docker compose ps
   ```
   The database container includes a healthcheck; the backend won't accept traffic correctly until MySQL reports healthy and `backend/config/init.sql` has finished seeding.
6. Visit `http://localhost` (frontend) — the system is now running. The default bootstrap admin credentials are seeded from `init.sql` (see `docs/08-administrator-manual.md` for first-login instructions).

### A.3 Stopping / Restarting
```bash
docker compose down          # stops containers, PRESERVES data (named volumes untouched)
docker compose up -d --build # restart after any code change, rebuilds images
```
`docker compose down -v` additionally **destroys** the database volume — do not use this in a system holding real data.

### A.4 Common Pitfall
If `docker compose up` fails with a port-binding error (`Only one usage of each socket address is normally permitted` or similar), another process on the host is already using port 80, 3000, 3306, or 8080 — most commonly a local `npm run dev` server left running. Stop that process first, then retry.

---

## Path B: Cloud Deployment (Vercel + Render)

### B.1 Backend (Render)
1. Create a new **Web Service** on Render, pointing at the `backend/` directory of this repository (set the service's Root Directory to `backend`).
2. Build command: `npm install`. Start command: `node index.js`.
3. Under Environment, add every variable listed in `backend/.env.example`, with real production values. Set `STORAGE_PROVIDER=cloudinary` and provide Cloudinary credentials — Render's filesystem does not persist across deploys, so local storage is not viable here.
4. Deploy. Note the resulting service URL (e.g. `https://your-service.onrender.com`) — this is `<BACKEND_URL>` referenced below.

### B.2 Frontend (Vercel)
1. Create a new Vercel project, pointing at the `frontend/` directory (set Root Directory to `frontend`).
2. Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`.
3. Under Environment Variables, set `VITE_GOOGLE_MAPS_API_KEY` and any other `VITE_*` variables referenced in `frontend/.env.production`.
4. Deploy. Note the resulting URL (e.g. `https://your-app.vercel.app`) — this is `<FRONTEND_URL>`.
5. Return to the Render backend's environment variables and set `FRONTEND_URL=<the Vercel URL from step 4>` — this is required for OAuth callback and PayMongo redirect URLs to resolve correctly. Redeploy the backend after setting it.

### B.3 Database
Provision a MySQL 8.0 instance from any managed provider (or a self-managed server reachable from Render). Run the schema:
```bash
mysql -h <host> -u <user> -p < backend/config/init.sql
```
Populate the backend's `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` environment variables on Render accordingly, then redeploy.

### B.4 Google OAuth Console Configuration
In the Google Cloud Console project backing `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, add `<BACKEND_URL>/api/auth/google/callback` (or the exact path in `GOOGLE_CALLBACK_URL`) to the OAuth client's **Authorized redirect URIs**.

### B.5 PayMongo Webhook Configuration
In the PayMongo dashboard, register a webhook pointed at `<BACKEND_URL>/api/payment/webhook`, subscribed to the `checkout_session.payment.paid` event. Copy the webhook's signing secret into `PAYMONGO_WEBHOOK_SECRET` on Render.

### B.6 Verifying the Deployment
```bash
curl -I <BACKEND_URL>/api/test          # expect HTTP 200
curl -I <FRONTEND_URL>/                 # expect HTTP 200
```
Then load `<FRONTEND_URL>` in a browser and confirm the landing page renders and login succeeds for each role.

---

## Post-Installation Checklist (either path)
- [ ] Bootstrap admin account can log in (see `docs/08-administrator-manual.md`)
- [ ] A test student account can register and log in via Google OAuth
- [ ] An owner can submit a new boarding house application with all 8 documents
- [ ] Admin can approve the application and it becomes publicly visible
- [ ] A booking can be created, approved, and (for a cash booking) shows as an active occupant
- [ ] File uploads (a photo or permit) succeed and are retrievable afterward
