# Infrastructure Requirements

Two deployment models are supported — sizing guidance is given for both. See `docs/06-installation-guide.md` for setup steps.

---

## 1. Self-Hosted (On-Premises / Institutional Server via Docker)

### Minimum
| Resource | Spec |
|---|---|
| CPU | 2 vCPU |
| RAM | 4 GB |
| Storage | 20 GB (OS + Docker images + database growth + uploaded media) |
| OS | Any Docker-supported 64-bit OS (Ubuntu Server 22.04 LTS recommended; Windows Server with Docker Desktop also supported, as validated during development) |
| Network | Static IP or DNS entry reachable by all client devices; outbound HTTPS access (port 443) for Google/PayMongo API calls |

### Recommended (production institutional use)
| Resource | Spec |
|---|---|
| CPU | 4 vCPU |
| RAM | 8 GB |
| Storage | 50+ GB SSD, with a backup target for database dumps and uploaded media |
| OS | Ubuntu Server 22.04/24.04 LTS |
| Network | HTTPS via a reverse proxy/TLS-terminating load balancer in front of the Docker stack (the app itself expects to sit behind one — see Security Configuration doc), or a valid TLS certificate bound directly if no external proxy is used |

### Ports Required
| Port | Purpose | Expose externally? |
|---|---|---|
| 80 | Frontend (Nginx) | Yes (or via reverse proxy) |
| 3000 | Backend API | Only if the frontend calls it directly without a shared-origin proxy; otherwise internal-only |
| 3306 | MySQL | **No** — internal to the Docker network only |
| 8080 | Media storage (Nginx) | Only if `STORAGE_PROVIDER=local` and files are served directly; otherwise internal-only |

---

## 2. Cloud Deployment (Vercel + Render + Managed MySQL)

No server provisioning is required — this is a fully managed/serverless model. Sizing is governed by the chosen plan tier on each platform:

| Component | Minimum viable tier | Notes |
|---|---|---|
| Vercel (frontend) | Free/Hobby tier | Sufficient for a static SPA build; upgrade only if custom domain/team features are needed. |
| Render (backend) | Free or Starter web service | **Free tier sleeps after inactivity**, causing a 30–50 second cold-start delay on the first request — the built-in 14-minute keep-alive cron job (§7 of the Configuration Guide) mitigates this but is not a substitute for a paid always-on tier in a real production deployment serving actual students. |
| Managed MySQL | Any provider offering MySQL 8.0, minimum 1 GB storage to start | Sizing scales with enrollment/booking volume over time; monitor and increase as needed. |
| Cloudinary | Free tier (25 GB storage/bandwidth) | Sufficient for moderate institutional use; monitor usage as the number of listings/photos grows. |

---

## 3. Database Management System
- **MySQL 8.0** (the schema uses MySQL 8-specific syntax — `ROW_NUMBER() OVER (...)` window functions in reporting queries, `utf8mb4` throughout). Do not substitute MySQL 5.7 or MariaDB without verifying window-function support and syntax compatibility first.

## 4. Web Server
- **Nginx** (bundled in the Docker images) serves the built frontend and, when `STORAGE_PROVIDER=local`, uploaded media. In the cloud model, Vercel's own edge network replaces this role for the frontend.

## 5. Required Software Packages (Host-Level)
- **Self-hosted:** Docker Engine 24+ and the Docker Compose plugin (v2 syntax, as used in `docker-compose.yml`). No other host-level software is required — Node.js, MySQL, and Nginx all run inside containers.
- **Cloud:** none — Vercel and Render manage the runtime entirely.

## 6. Network Requirements
- Outbound HTTPS (443) from the backend to: `accounts.google.com` / `googleapis.com` (OAuth), `api.paymongo.com` (payments), and `api.cloudinary.com` (if using Cloudinary storage).
- Outbound access from the frontend/client browsers to `maps.googleapis.com` (Google Maps).
- Inbound HTTPS from client devices to the frontend and backend.
- If self-hosting behind an institutional firewall, ensure the above outbound destinations are allow-listed.

## 7. Storage Requirements
- **Database:** grows with bookings/users/reviews over time; a few GB is ample for years of typical institutional volume given the schema's row sizes.
- **Media:** grows with the number of boarding house photos and permit documents. Self-hosted local storage should be provisioned with headroom and a backup routine; Cloudinary handles this externally when used.
