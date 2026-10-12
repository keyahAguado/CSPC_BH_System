# Notification email setup

This worker mirrors newly committed in-app notification records through the Brevo HTTPS API. It is separate from applicant email verification and from booking/payment/review transactions. No real emails are sent by the automated tests.

## Local enablement

1. Back up the intended database and confirm its selected name.
2. Review and manually run `migrations/2026-10-11_add_notification_email_queue.sql` on the local database. This creates two new tables only. It records the current highest notification ID, so older messages are excluded. Rerunning preserves that cutoff.
3. Configure backend-only `NOTIFICATION_EMAIL_ENABLED=true`, `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, and a browser-accessible `FRONTEND_URL`. Retain `APPLICANT_EMAIL_ENABLED=true` independently for verification. Do not commit secrets. The current Docker Compose reads `backend/.env` through `env_file`, so put the new switch there. Its explicit `FRONTEND_URL` override still comes from the root Compose environment. For Render, set the variables in its backend environment settings when you are ready to deploy.
4. Rebuild/restart the backend with the revised environment. Generate a new local application or other notification yourself. Check the recipient inbox and spam folder.
5. Queue processing runs once per minute, ten messages per batch. A sleeping/offline backend delays delivery. Brevo acceptance is recorded as `accepted`, not proof of inbox delivery. Inspect Brevo delivery logs separately.

## Read-only diagnostics

```sql
SELECT notification_id, status, attempts, next_attempt_at, accepted_at
FROM notification_email_deliveries ORDER BY notification_id DESC LIMIT 30;
```

Temporary failures retry with increasing delays, stopping after five failed attempts. Invalid/legacy placeholder recipients are skipped. Failed rows need review; there is no resend UI yet. No raw provider errors, tokens, recipients or message bodies are logged by the worker.

The queue uses unique notification IDs, a database worker lock and provider idempotency headers. A provider acceptance followed by a connection/database failure can still cause an ambiguous result; do not promise universal exactly-once delivery. Multiple distinct in-app records still produce multiple emails. Email delays mean older event emails can arrive after the current state has changed: links always lead to the system's current information.

Pending applicants receive a tracking link, not a bearer activation token in an approval email. Tracking verifies their email and offers a fresh seven-day activation link. Approval itself is not seven-day-limited. Existing activated users receive their role's notifications link.

## Rollback / production

Set `NOTIFICATION_EMAIL_ENABLED=false` to stop the worker without affecting in-app notifications. Do not delete users, notification records or queue tables. No production migration/deployment has been performed by this change. Review a production backup and configuration before enabling it there; applying this migration sets the historical cutoff at that moment.
