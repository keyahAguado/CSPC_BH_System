# System Testing Results

This document distinguishes between testing that **has already been performed** during development (recorded honestly below, with what was actually checked) and testing that **still requires execution** by MIS/ICTU at institutional rigor before final acceptance. Do not treat the former as a substitute for the latter — a clean development-time build check is not equivalent to a formal Security or Performance Testing pass.

---

## 1. Functional & Integration Testing — Performed During Development

The following were directly and repeatedly verified during the development process (not merely assumed):

| Area | What was verified | Method |
|---|---|---|
| Full production build | Frontend compiles with zero errors across every route/component | `npm run build` (Vite), run repeatedly after every change batch |
| Backend syntax integrity | Every route/config file parses without error | `node --check` on all backend files |
| Containerized deployment | All 4 Docker services (frontend, backend, database, media) start healthy together and remain stable | `docker compose up -d --build` + `docker compose ps` + live HTTP checks, run after every change |
| Live endpoint health | Frontend and backend both respond `200 OK` | `curl -I` against both, repeated after every deploy-affecting change |
| Booking lifecycle (cash) | Submit → approve → occupant created → checkout, end-to-end | Manual walkthrough |
| Booking lifecycle (PayMongo) | Submit → approve (unpaid, not yet occupant) → cancel while unpaid → separately, complete payment → occupant created | Manual walkthrough, including the specific edge case of cancelling an approved-but-unpaid booking |
| Transaction integrity | Every early-exit path in the booking route correctly closes its DB transaction before releasing the connection | Code review + verified no behavior change to any response (see `backend/routes/student.js`) |
| Accreditation → auto-archive | Confirmed critical-permit expiry auto-archives a house; supplementary-permit expiry only warns | Manual walkthrough against `backend/config/complianceManager.js` logic |
| Report accuracy (gender data) | Dashboard chart and report totals match underlying `occupants`/`users.sex` data, including case-insensitive matching | Manual walkthrough with live data |
| Emergency registry completeness | Confirmed residents of archived (not just accredited) houses still appear, correctly flagged | Manual walkthrough after the fix, verified against actual data showing an archived property's residents |
| Dead-code removal safety | Confirmed 16 removed files (unused components/assets/duplicate module) had zero references anywhere, via direct grep search, before and after full rebuild | Grep-verified reference search + before/after module-count comparison in the production build |
| HTTPS enforcement | Verified live against the actual production Cloudflare/Render proxy chain — single `200`, correct HSTS header, no redirect loop | Direct `curl -I` against the live production backend URL |

## 2. Areas Verified at "Development Smoke-Test" Depth Only
These were exercised and appeared correct during development but were **not** run through a formal, independently-authored test suite:
- PWA install/offline behavior (manually confirmed installable, not tested across the full device/browser matrix).
- Cross-role access blocking (spot-checked, not exhaustively tested against every route).
- Print/PDF export of all four admin reports (visually confirmed rendering, not tested across printer/browser combinations).

## 3. Testing Not Yet Performed — Required Before Final Acceptance

| Type | Status | Recommendation |
|---|---|---|
| **Formal Functional Testing** (systematic, tester-executed) | Not yet performed by an independent tester | Execute `docs/16-uat-test-plan.md` in full. |
| **Security Testing** (penetration testing, vulnerability scanning) | Not performed | Recommend at minimum: an OWASP-ZAP or similar automated scan against a staging instance, plus manual verification of the items in `docs/13-security-configuration.md` §8 (especially the password-policy, file-upload-validation, CORS, and helmet/rate-limiting gaps, since those are concrete, known-absent protections, not hypothetical risks). |
| **Performance / Load Testing** | Not performed | Recommend a basic load test (e.g. via k6 or Apache JMeter) simulating expected peak concurrent users (e.g. during enrollment-period booking surges) against a staging environment, particularly the booking and payment endpoints. |
| **Browser/Device Compatibility Matrix** | Only spot-checked (Chrome desktop + one mobile device during development) | Recommend testing across the institution's actual expected device/browser mix before rollout. |

## 4. Known Issues Carried Into Turnover (see also Security Configuration §8)
1. Hardcoded bootstrap admin fallback password in source code — must be rotated/removed.
2. No password strength policy enforced.
3. No server-side file-type validation on uploads (size is limited; type is not).
4. CORS is unrestricted (`cors()` with no origin allowlist).
5. `helmet` and `express-rate-limit` installed but not applied.
6. Database connection has no explicit SSL configuration — needs confirming against the actual production database provider's own enforcement.
7. `owner.js` contains two pairs of duplicate route definitions (dead code, not a runtime bug — see `docs/10-api-documentation.md`, "Known Technical Debt").

None of the above caused a functional test failure during development — they are configuration/hardening gaps, not broken features.
