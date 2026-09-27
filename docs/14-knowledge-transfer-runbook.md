# Knowledge Transfer Runbook

Operational reference for MIS personnel maintaining the system after turnover. For initial setup, see `docs/06-installation-guide.md`; for configuration options, see `docs/07-configuration-guide.md`. This document covers what happens *after* the system is already running.

---

## 1. Day-to-Day Maintenance

Nothing requires manual daily intervention. Two automated jobs run on their own schedule (`backend/index.js`, via `node-cron`):
- **00:00 daily** — compliance/permit-expiry sweep (auto-archives houses with an expired critical permit, sends warning notifications).
- **00:30 daily** — orphaned upload cleanup (local storage only).

**What to check periodically (weekly/monthly, not automated):**
- Cloudinary usage (if used) against free-tier limits, to avoid unexpected service interruption.
- Database size/growth, to plan storage upgrades ahead of need.
- Render service logs (cloud deployment) for recurring errors.
- PayMongo dashboard for any failed/disputed transactions requiring manual follow-up.

## 2. Updating the System (Deploying Code Changes)

### Cloud deployment (Vercel + Render)
Both platforms auto-deploy on push to the `main` branch. The sequence for a change that includes a database migration:
1. Run any new SQL migration file (`backend/migrations/*.sql`) against the production database **first**.
2. Push the code to `main`.
3. Watch both platforms' deploy logs for a clean build.
4. Smoke-test the live site (login, one booking action, one report).

A change with **no** migration is lower-risk — push and verify, no ordering concern.

### Self-hosted (Docker)
```bash
git pull
docker compose up -d --build
docker compose ps      # confirm all 4 containers report healthy
```
As above, run any pending migration against the database before rebuilding, if the change requires one.

**Never skip the migration-first step for a change that needs one** — deploying code that expects a column/table before it exists will cause the affected feature (not the whole system) to fail with clear "Unknown column" errors in the backend logs, resolving itself the instant the migration is applied.

## 3. Backup and Restore

See `docs/04-database-turnover.md` §5 for the exact `mysqldump`/restore commands. **Recommendation:** schedule this as a recurring job (cron, or your managed database provider's built-in automated backup feature) — the application does not back up its own database automatically.

If self-hosting with `STORAGE_PROVIDER=local`, also back up the `media_uploads` Docker volume:
```bash
docker run --rm -v cspc-main_media_uploads:/data -v $(pwd):/backup alpine tar czf /backup/media_backup_$(date +%Y%m%d).tar.gz -C /data .
```

## 4. Troubleshooting Guide

| Symptom | Likely Cause | Fix |
|---|---|---|
| `docker compose up` fails with a port-binding error | Another process already holds port 80/3000/3306/8080 (commonly a local `npm run dev` left running) | Stop the conflicting process, retry. |
| A container shows `Created` but never `Up` | Startup was interrupted (terminal closed, Docker Desktop restarted mid-boot) | `docker compose down` then `docker compose up -d --build` — a clean recreate resolves this category regardless of root cause. |
| Backend logs show `Unknown column '...' in 'field list'` after a deploy | A required migration wasn't run before deploying the new code | Run the missing migration; the error resolves immediately, no rollback needed. |
| File uploads fail | `STORAGE_PROVIDER=cloudinary` but Cloudinary credentials are missing/incorrect, or `local` on a host with no writable uploads directory | Check the three `CLOUDINARY_*` env vars, or `UPLOADS_DIR` permissions. |
| A student can't log in via Google | Their email doesn't match the expected domain (`@my.cspc.edu.ph`) | Expected behavior, not a bug — see Configuration Guide §4. |
| PayMongo payments never confirm | Webhook not registered/misconfigured in the PayMongo dashboard, or `PAYMONGO_WEBHOOK_SECRET` mismatch | Verify the webhook URL and secret; the student-side `verify-payment` return-flow is a secondary path but the webhook is the authoritative one. |
| Render backend is slow to respond after idling | Expected on the free tier — cold start after inactivity | Upgrade to a paid always-on tier for real production use (see Infrastructure Requirements §2). |

## 5. Monitoring / Health Checks

No dedicated monitoring dashboard is built into the application. Basic manual health checks:
```bash
curl -I <BACKEND_URL>/api/test      # expect 200
curl -I <FRONTEND_URL>/             # expect 200
docker compose ps                    # self-hosted: confirm all containers "healthy"/"Up"
```
Recommend configuring uptime monitoring (e.g. UptimeRobot, or Render's/your infra provider's built-in monitoring) against `<BACKEND_URL>/api/test` for early warning of an outage — this is an infrastructure add-on, not something shipped with the application.

## 6. Rolling Back a Bad Deploy
- **Cloud:** both Vercel and Render keep a history of previous deploys in their dashboards — use the platform's "redeploy previous version" / "rollback" action.
- **Self-hosted:** `git checkout <previous-commit>` then `docker compose up -d --build`.
- If the bad deploy included a migration that's now causing issues, do **not** blindly reverse it without checking whether data written under the new schema would be lost — evaluate case by case.

## 7. Key Contacts / Escalation
See `docs/15-warranty-and-support.md` for support contact information and warranty terms.
