# Phase 1 local setup (do not apply directly to production)

This phase verifies applicant identity only. Existing notification email functions remain disabled.
No email is sent unless `APPLICANT_EMAIL_ENABLED=true` and the Brevo settings are present.

## 1. Isolated database

Use a disposable development database. Confirm the database host/name and inspect `SELECT DATABASE()` before applying any SQL. Back up any local records you need to keep. Do not connect this setup or a Vercel preview to production.

Apply the existing development migrations required by your schema, then `migrations/2026-10-11_add_applicant_email_verification.sql`. Check whether `users.email_verified_at` already exists before its ALTER statement; skip that statement if it exists. The new migration adds a nullable marker and a verification-token table. It does not replace user/property data. It is intentionally not automatically applied at startup.

## 2. Private backend settings

Place these in the ignored `backend/.env`, without committing the real values:

```dotenv
APPLICANT_EMAIL_ENABLED=true
BREVO_API_KEY=<replacement development API key>
EMAIL_FROM_ADDRESS=<verified sender address>
EMAIL_FROM_NAME=CSPC BH Finder
```

Docker Compose already loads `backend/.env`. No SMTP changes are needed.
Compose overrides `FRONTEND_URL` and `JWT_SECRET` from the root environment: ensure the root `FRONTEND_URL` is the frontend origin you actually use (usually `http://localhost` with Docker), and retain a private JWT secret. Direct backend execution must have those settings in its own environment.

Do not add keys to frontend files or VITE variables. Do not use the key exposed in the screenshot. Nothing here enables production delivery.

After checking the isolated database and applying its migrations, recreate the local services:

```powershell
docker compose up -d --build backend frontend
```

Changing the private backend environment requires container recreation, not only `docker compose restart`.

## 3. Controlled delivery test

Use a test inbox you control. Open `/register`, request verification, inspect Brevo transactional logs and the inbox/spam folder, open the link, and explicitly press Verify email. Verify that the browser opens the correct local frontend. Provider acceptance is not a delivery guarantee.

- Link expiry: 30 minutes; single use.
- Restricted applicant session: two hours; not an owner dashboard login.
- Reference alone no longer grants access. Existing pending applicants verify their stored email.
- Active owners keep normal login; this flow does not verify/change their existing accounts.
- Multiple same-origin tabs can synchronize verification while the original form stays mounted. Different browsers/devices do not share sessions.
- Email must remain the verified email during activation. No activation-page redesign was made.

Check forged/expired/used links, another applicant's reference, multiple properties, API failures, and existing logins. Mock tests do not replace these integration tests.

## Deferred

Submission/status emails, transactional application edits/review decisions, activation eligibility/public-booking gates, total multipart upload budgets, persistent distributed rate limiting, private document delivery, and production deployment remain separate work. Existing database media URLs are not made private by email verification.
