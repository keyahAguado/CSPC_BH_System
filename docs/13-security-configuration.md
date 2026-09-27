# Security Configuration

This document describes the security mechanisms **as actually implemented** in the current codebase — every claim below was verified by reading the source directly, not written from a generic template — plus a clearly-marked list of gaps worth closing before or shortly after turnover. Where something is a genuine gap, it's stated as exactly that; where something is already handled well, it's stated as exactly that too. Nothing here is inflated in either direction.

---

## 1. Authentication Mechanism

Two independent login paths, both resulting in the same JWT-based session:

1. **Google OAuth 2.0** (`backend/config/passport.js`) — the primary path for students and admins. Domain-restricted at the identity-provider response:
   - Student accounts: must end in `@my.cspc.edu.ph`.
   - Admin accounts: must end in `@cspc.edu.ph`.
   - Owner accounts: any Google account (owners are not CSPC-affiliated, so no domain restriction applies to them).
2. **Email + password** (`backend/routes/auth.js`, `POST /login`) — available to owners, and to any account with a local password set. Passwords are hashed with **bcryptjs** before storage; the plaintext password is never written to the database or to application logs.

Successful login of either kind issues a **JWT** (`jsonwebtoken`, signed with `JWT_SECRET`).

### Where the Token Lives (and what that means)
The frontend stores the JWT in **`sessionStorage`**, not a cookie. This is a deliberate architectural tradeoff worth understanding, not a mistake:
- **Upside:** the token is automatically cleared when the browser tab closes, and — unlike a cookie — it is never automatically attached to a request by the browser, so a malicious third-party site cannot silently make an authenticated request on the user's behalf (the classic CSRF attack) without first stealing the token some other way.
- **Downside:** because JavaScript *can* read `sessionStorage`, any successful Cross-Site Scripting (XSS) vulnerability elsewhere in the frontend would expose the token directly. This makes rigorous output-escaping in every user-facing view (already Vue's default behavior, since Vue auto-escapes template interpolation) the actual line of defense here, not a secondary concern.

### Session Expiration
- **Token-level:** the JWT itself has a server-side expiry (7 days).
- **Client-level (idle timeout):** independent of the token's own lifetime, the frontend enforces a **30-minute inactivity auto-logout** (`frontend/src/App.vue`) — no mouse/keyboard/touch/navigation activity for 30 minutes clears the session and redirects to login. This closes the gap of an unattended, still-open browser staying authenticated indefinitely, which the 7-day token expiry alone would not.

---

## 2. User Roles and Permissions (RBAC)

Three roles — `student`, `owner`, `admin` — stored as a plain column on `users.role` (not a separate roles/permissions table; permissions are role-derived in code, not database-configurable per-user — changing what a role can do requires a code change, not an admin-panel setting).

- **Backend enforcement:** every protected route uses `authenticateToken` middleware to verify the JWT, and role-restricted routes additionally require `verifyOwner` or `verifyAdmin` middleware, which reject the request if `req.user.role` doesn't match — enforced server-side, not merely hidden in the UI.
- **Frontend enforcement:** `frontend/src/router/index.js` defines a `meta.role` per route and a global navigation guard blocks cross-role page access. This is a UX convenience layer — the real security boundary is the backend check above, since a technically capable user could bypass frontend routing entirely (e.g. by calling the API directly) and would still be correctly rejected by the server.

---

## 3. Password Policy

**Current state: no minimum length, complexity, or strength requirement is enforced anywhere** — neither client-side (registration/change-password forms) nor server-side (`auth.js`). Any non-empty string is accepted as a password, including single-character ones. Listed under Recommendations (§8) as a gap worth closing — this is a factual gap, not a hypothetical one.

---

## 4. Network-Level Security

### 4.1 SSL / HTTPS (Application ↔ Browser)
- **Cloud deployment:** HTTPS is provided by Vercel (frontend) and Render + Cloudflare (backend) at the platform/edge level. The backend additionally runs a **self-detecting HTTPS-enforcement middleware** (`backend/index.js`) — it inspects the `x-forwarded-proto` header set by an upstream proxy; if present and not `https`, it 301-redirects, and if `https`, it adds a `Strict-Transport-Security` header. This middleware is a no-op on `localhost` (no proxy header present there), so it never interferes with local development. Verified live against the actual production Cloudflare/Render chain — see `docs/17-system-testing-results.md`.
- **Self-hosted deployment:** the Docker stack itself does **not** terminate TLS — a reverse proxy (Nginx/Caddy with Let's Encrypt, or an institutional load balancer) must be placed in front of it for any deployment reachable outside a trusted local network. See `docs/11-infrastructure-requirements.md` §1.

### 4.2 Database Connection Encryption (Application ↔ MySQL)
`backend/config/db.js` creates the MySQL connection pool with **no `ssl` option configured at all**:
```js
const poolConfig = {
    host: dbHost, user: ..., password: ..., database: ...,
    // no ssl: {...} block present
};
```
This means the application itself neither requests nor requires an encrypted connection to the database. Whether the actual traffic ends up encrypted in practice depends entirely on whether the **database host/provider** enforces TLS on its own side (many managed MySQL providers do this by default at the network layer regardless of client configuration — verify this with your specific database provider). **If self-hosting the database on the same Docker network as the backend** (the default in `docker-compose.yml`), this is a non-issue, since the traffic never leaves the host machine's internal Docker network. **It only becomes relevant if the database is reached over the public internet** (the cloud deployment path, where the database is external to Render). Recommend explicitly confirming — not assuming — that the production database connection is encrypted, and adding an `ssl` option to `db.js` if it is not.

### 4.3 CORS Policy
`backend/index.js` applies CORS with `app.use(cors())` — **no origin restriction configured**. This is the `cors` package's permissive default, meaning the API accepts cross-origin requests from any website, not just the system's own frontend. Because authentication uses a `Bearer` token that must be explicitly attached by JavaScript (§1) rather than a cookie the browser sends automatically, this is a narrower risk than it would be for cookie-based sessions — a third-party site cannot silently ride on a logged-in user's session without first obtaining their token some other way. It is, however, still broader than necessary for a system with one known, fixed frontend origin, and is listed as a gap in §8.

---

## 5. File Upload Handling

- **Size limit:** enforced via Multer, 10MB per file (`backend/config/upload.js`).
- **Type/content validation: none.** No `fileFilter` or MIME-type/extension allowlist is configured on the Multer instance — verified by direct search of `upload.js`. In practice this means the upload endpoints (boarding house photos, the 8 legal permit documents, profile pictures) will accept **any file type**, not just images/PDFs, and store or forward it (to local disk or Cloudinary) exactly as received. This is a real gap, not a hypothetical one, and is listed in §8.

---

## 6. Backup and Recovery Procedures

- **Database:** see `docs/04-database-turnover.md` §5 for the `mysqldump` backup/restore commands. No automated backup job is currently configured in the codebase — backup scheduling (e.g. a cron job, or the managed database provider's built-in automated backups) is an infrastructure-level responsibility to configure post-turnover, not something the application does for itself.
- **Media (uploads):** if `STORAGE_PROVIDER=cloudinary`, Cloudinary retains uploaded files independently of the application. If `STORAGE_PROVIDER=local`, uploaded files live on the host's Docker volume (`media_uploads`) — back this volume up alongside the database, since a local-storage deployment's media has no redundancy otherwise. See `docs/14-knowledge-transfer-runbook.md` §3 for the exact backup command.
- **Orphaned file cleanup:** a daily cron job (`backend/config/upload.js`, `cleanupOrphanedUploads`) removes local-disk files no longer referenced by any database row, with a 24-hour grace period to avoid deleting a just-uploaded file mid-transaction. This only runs when `STORAGE_PROVIDER=local`.

---

## 7. Security Practices Already in Place

Stated plainly, without either overselling or underselling:

- **Parameterized SQL queries throughout** (`mysql2` placeholder syntax `?`) — no string-concatenated SQL found anywhere in the codebase, meaning the application is not exposed to classic SQL injection via user input.
- **PayMongo webhook signature verification** via HMAC-SHA256 with a timing-safe comparison (`backend/routes/payment.js`) — prevents a forged request from falsely triggering a payment confirmation.
- **Domain-restricted OAuth per role** (§1) — enforced at the identity-provider callback, not just a UI hint.
- **Server-side role enforcement on every protected route** (§2) — a role check that actually runs on the server, not one that merely hides a button.
- **Passwords hashed, never stored or logged in plaintext** (§1).
- **Client-side idle timeout** (§1) closing a real gap that token expiry alone leaves open.

---

## 8. Recommendations Before / Shortly After Turnover

Ordered roughly by how much risk each closes relative to how little effort it takes. Every item below is a verified, specific finding — not generic security advisory boilerplate.

1. **Rotate the hardcoded bootstrap admin password immediately.** `admin@cspc.edu.ph` / `admin_saso_2026` is hardcoded as a fallback comparison directly in `backend/routes/auth.js` — anyone with source code access (now including MIS, as part of this turnover) can read it. See `docs/08-administrator-manual.md` for the first-login procedure; once every real admin has their own password, ask the development team to remove this fallback entirely.
2. **Add server-side MIME-type/extension validation to file uploads** (§5) — a `fileFilter` on the existing Multer configuration restricting accepted types per upload field (images for photos, images/PDF for permits) closes this with a small, contained code change.
3. **Enforce a password policy** (§3) — a minimum length (8+ characters is a reasonable baseline) enforced **server-side** in `auth.js`'s registration and change-password handlers; client-side-only validation is not a security control, since it can be trivially bypassed by calling the API directly.
4. **Restrict CORS to the system's actual frontend origin** (§4.3) — replace `cors()` with `cors({ origin: process.env.FRONTEND_URL })`, using the same environment variable already relied on elsewhere in the codebase for this exact purpose.
5. **Wire up the already-installed `helmet` and `express-rate-limit` packages.** Both are present in `backend/package.json` as dependencies but are **not imported or applied anywhere in the code** — verified by direct search. `helmet` would add standard security response headers beyond the HSTS header already set manually; `express-rate-limit` would protect login and other sensitive endpoints from brute-force/abuse attempts. Installing a package does not activate it — this needs an explicit `app.use(helmet())` and a rate-limiter middleware added to `backend/index.js`.
6. **Confirm (don't assume) the production database connection is encrypted** (§4.2) — verify with the database provider, and add an explicit `ssl` option to `backend/config/db.js` if it is not already enforced upstream.
7. **Configure automated database backups** (§6) — no automation currently exists in the application itself; this must be set up at the infrastructure/hosting level.
8. **If self-hosting**, ensure a TLS-terminating reverse proxy is placed in front of the stack before exposing it beyond a trusted local network (§4.1).

None of the above caused a functional failure during development — they are hardening gaps in an already-working system, not broken features. See `docs/17-system-testing-results.md` §4 for how this list relates to formal testing sign-off.
