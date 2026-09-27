# API Documentation

**Base URL (production):** `https://<your-render-service>.onrender.com/api`
**Base URL (self-hosted):** `http://localhost:3000/api`

All endpoints return JSON in the shape `{ success: boolean, ...data }` on success, or `{ success: false, message: string }` on failure, unless noted otherwise.

**Authentication:** unless marked *Public*, every endpoint requires a `Authorization: Bearer <JWT>` header. The token is obtained from `/auth/login`, `/auth/google/callback`, or `/auth/exchange`. Role-restricted endpoints (`verifyOwner`, `verifyAdmin` middleware) additionally reject a valid token whose account role doesn't match.

This document is in two parts: **Part 1** below is this system's own API (what the frontend calls, and what any future integration would call). **Part 2** documents the **external, third-party APIs this system itself depends on** — a separate concern, since those aren't ours to redesign, but MIS needs to know exactly which outside calls exist, since an outage or credential expiry on any one of them degrades a specific, identifiable feature rather than the whole system.

---

# Part 1 — This System's Own API

---

## `/auth` — Authentication

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/login` | Public | Email + password login (owners, or any account with a local password set). |
| GET | `/google` | Public | Initiates Google OAuth redirect flow. |
| GET | `/google/callback` | Public | Google OAuth callback — issues a JWT and redirects to the frontend. |
| POST | `/exchange` | Public | Exchanges a short-lived OAuth handoff code for the actual JWT (used by the frontend's `AuthSuccess` page). |
| POST | `/register/owner` | Public | Step 1 of owner registration. |
| POST | `/register/owner-complete` | Public | Step 2 — completes an owner's profile after OAuth. |
| POST | `/change-password` | Required | Authenticated user changes their own password. |

**Example — POST `/auth/login`**
```json
// Request
{ "email": "owner@example.com", "password": "••••••••" }

// Response 200
{ "success": true, "token": "<JWT>", "user": { "id": 12, "role": "owner", "name": "...", "houseStatus": "accredited" } }
```

---

## `/student` — Student Portal

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/courses` | Student | List active courses for the profile dropdown. |
| GET | `/profile` | Student | Fetch own profile. |
| POST | `/update-profile` | Student | Update profile fields + optional photo upload. |
| GET | `/houses` | Public | List all accredited houses (student-facing search/filter view). |
| GET | `/house/:id` | Public | Full detail for one listing (rooms, reviews, gallery). |
| POST | `/review/:id` | Student | Submit a rating/review for a house. |
| POST | `/book/:houseId` | Student | Submit a reservation request. See §"Booking Flow" below. |
| GET | `/bookings` | Student | List the caller's own bookings. |
| POST | `/bookings/cancel/:id` | Student | Cancel a booking — only permitted while `pending`, or `confirmed` + unpaid PayMongo (see Data Dictionary §3.9). |
| POST | `/bookings/extend/:id` | Student | Request a stay extension. |

---

## `/owner` — Owner Portal

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET / POST | `/profile`, `/update-profile` | Owner | View/update own profile. |
| GET | `/dashboard` | Owner | Owner's own summary stats. |
| GET / POST | `/edit/:id` | Owner | View/update a listing's details and media. |
| GET | `/rooms/:houseId` | Owner | List rooms for a house. |
| POST | `/rooms/add/:houseId` | Owner | Add a room. |
| PUT | `/rooms/edit/:roomId` | Owner | Edit a room. |
| DELETE | `/rooms/delete/:roomId` | Owner | Delete a room (blocked if it has active occupants). |
| DELETE | `/boarding-houses/:houseId` | Owner | Delete an entire listing. |
| GET | `/rooms/details/:roomId` | Owner | Full boarder list + pending requests for one room. |
| POST | `/rooms/occupants/add/:roomId` | Owner | Manually add a non-CSPC occupant. |
| POST | `/rooms/occupants/payment/:id` | Owner | Toggle an occupant's payment status. |
| POST | `/rooms/occupants/checkout/:id` | Owner | Check out a resident, freeing their room slot. |
| GET | `/bookings` | Owner | List reservation requests across all of the owner's properties. |
| POST | `/bookings/approve/:id` | Owner | Approve a booking. See §"Booking Flow" below. |
| POST | `/bookings/reject/:id` | Owner | Reject a booking. |
| POST | `/bookings/approve-extension/:id`, `/bookings/reject-extension/:id` | Owner | Decide a stay-extension request. |
| POST | `/bookings/payment/:id` | Owner | Manually mark a cash booking's payment status. |

---

## `/boarding-houses` — Shared Listings & Accreditation

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/accredited`, `/search` | Public | Public listing search (landing page, guest browsing). |
| GET | `/details/:id` | Required | Authenticated detail fetch (used internally by owner/admin views). |
| GET | `/my-property` | Owner | The calling owner's own property record. |
| GET | `/documents/:id`, `/documents` | Required | Fetch a house's legal documents. |
| POST | `/documents/update/:id` | Owner | Upload/replace a single permit document (triggers immediate re-evaluation of compliance status). |
| POST | `/accreditation` | Owner | Submit a full new accreditation application (all 8 documents + listing details). |

---

## `/admin` — Administration

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard` | Summary stats, charts, gender breakdown. |
| GET/POST | `/courses`, `/courses/add`, `/courses/update/:id`, `/courses/toggle/:id`, `/courses/delete/:id` | Course reference-list management. |
| GET | `/reports/courses` | Course-breakdown report data. |
| GET | `/pending-applications` | New/resubmitted applications awaiting review. |
| GET | `/applications/registered`, `/applications/archived` | Accredited / archived house lists. |
| POST | `/archive/:id`, `/restore/:id` | Manual archive (with reason) / restore. |
| GET | `/reviews/:houseId` | A house's reviews. |
| GET | `/rooms/:houseId`, `/rooms/occupants/:roomId` | Room and occupant lookups. |
| POST | `/rooms/occupants/checkout/:id` | Admin-initiated checkout override. |
| POST | `/approve/:id`, `/reject/:id` | Accreditation decision (new applications and resubmissions). |
| POST | `/criteria/add`, `/criteria/update/:id`, `/criteria/delete/:id` | Manage accreditation checklist criteria. |
| GET | `/users` | List students + owners. |
| POST | `/users/update/:id`, `/users/reset-password/:id`, `/users/toggle-status/:id` | User account management. |
| GET | `/reports/masterlist`, `/reports/compliance`, `/reports/emergency-registry`, `/reports/transactions` | The four institutional reports. |

---

## `/payment` — PayMongo Integration

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/checkout` | Student | Creates a PayMongo Checkout Session for a booking's move-in cost; returns a `checkoutUrl` to redirect the student to. |
| POST | `/verify-payment` | Student | Called when the student returns from a successful checkout; settles payment and creates the `occupants` record. |
| POST | `/webhook` | Public (HMAC-verified) | PayMongo server-to-server payment confirmation — the authoritative settlement path, independent of the student's browser redirect. |

---

## `/notifications` — Shared Inbox

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | List the caller's notifications. |
| POST | `/read/:id` | Mark one notification read. |
| GET | `/unread-count` | Badge count for the nav bar. |

---

## Booking Flow (cross-endpoint sequence)

1. `POST /student/book/:houseId` → creates a `bookings` row, `status = 'pending'`.
2. `POST /owner/bookings/approve/:id` → `status = 'confirmed'`.
   - If `payment_method = 'cash'`: an `occupants` row is created in the same transaction — the student is immediately an active resident.
   - If `payment_method = 'paymongo'`: no `occupants` row yet.
3. *(PayMongo path only)* `POST /payment/checkout` → student redirected to PayMongo → `POST /payment/verify-payment` (on redirect back) or `POST /payment/webhook` (server-side, authoritative) → `occupants` row created, `payment_status = 'paid'`.

## Known Technical Debt (worth knowing before extending this API)
`backend/routes/owner.js` defines `PUT /rooms/edit/:roomId` and `DELETE /rooms/delete/:roomId` **twice each** (lines ~349/484 and ~394/548 respectively, at time of writing). Express registers routes in file order and the first match wins, so the second definition of each is dead code — never reached, but not harmless clutter either, since a future edit to the "wrong" copy would silently have no effect. Recommend consolidating each pair into a single handler.

---

# Part 2 — External API Dependencies

These are third-party APIs the system calls **out** to. We don't control their behavior or uptime — this section documents exactly *where* and *why* this system depends on each one, so an outage or expired credential can be traced to a specific feature quickly, and links to each provider's own official reference rather than duplicating it.

## Google Cloud OAuth 2.0
- **Used for:** login, all three roles.
- **Where in our code:** `backend/config/passport.js` (strategy setup, domain restriction per role), `backend/routes/auth.js` (`/google`, `/google/callback`).
- **Credentials needed:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` — provisioned in Google Cloud Console.
- **If this API is unreachable:** Google-based login fails for students/admins; owners can still fall back to email+password if they have one set.
- **Official docs:** https://developers.google.com/identity/protocols/oauth2

## Google Maps JavaScript API (+ Places, Geocoding, Directions libraries)
- **Used for:** the aggregate map on the landing page, per-listing maps, address autocomplete during owner listing setup, reverse-geocoding a dropped pin to an address, and the walking-directions/distance display on a listing's detail page.
- **Where in our code:** loaded client-side via `@googlemaps/js-api-loader` throughout `frontend/src/views/**` — notably `HomeView.vue` (aggregate map), `HouseDetails.vue` (Directions), `EditHouse.vue`/`OwnerAccreditation.vue` (Places autocomplete + Geocoding on pin placement).
- **Credentials needed:** `VITE_GOOGLE_MAPS_API_KEY`, domain-restricted in Google Cloud Console (not a server-side secret — restricted by HTTP referrer, not by being hidden).
- **Important distinction:** these are **4 separate API products** in Google Cloud Console's API library (Maps JavaScript API, Places API, Geocoding API, Directions API) — all four must be individually enabled on the Cloud project, even though the frontend loads them through one SDK loader.
- **If this API is unreachable/quota-exceeded:** maps fail to render; address autocomplete and walking-distance features stop working; the rest of the system (login, bookings, reports) is unaffected since Maps is frontend-only and not called from the backend.
- **Official docs:** https://developers.google.com/maps/documentation/javascript

## PayMongo
- **Used for:** online payment (GCash/Card) for a booking's move-in cost.
- **Where in our code:** `backend/routes/payment.js` — `POST /checkout` (creates a Checkout Session via PayMongo's REST API), `POST /webhook` (receives PayMongo's server-to-server payment confirmation, HMAC-signature-verified).
- **Credentials needed:** `PAYMONGO_SECRET_KEY` (API calls), `PAYMONGO_WEBHOOK_SECRET` (verifying incoming webhook authenticity).
- **External configuration required:** a webhook subscribed to the `checkout_session.payment.paid` event must be registered in the PayMongo dashboard, pointed at this backend's `/api/payment/webhook` — this is a one-time setup step per environment (see `docs/06-installation-guide.md` §B.5), not something the application configures itself.
- **If this API is unreachable:** online payment is unavailable; **cash payment is unaffected**, since it's a completely separate, PayMongo-independent code path.
- **Official docs:** https://developers.paymongo.com/

## Cloudinary (conditional — only when `STORAGE_PROVIDER=cloudinary`)
- **Used for:** production media storage (boarding house photos, legal permit documents, profile pictures) — necessary specifically because Render's filesystem doesn't persist across deploys; see `docs/05-system-architecture.md` §2.1.
- **Where in our code:** `backend/config/upload.js`, `saveUploadedFile()`.
- **Credentials needed:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- **If this API is unreachable:** new file uploads fail; previously-uploaded files already on Cloudinary remain accessible (they're served directly from Cloudinary's own CDN, independent of our backend being up).
- **Not used at all** when `STORAGE_PROVIDER=local` (self-hosted default) — files go to local disk instead, no external dependency.
- **Official docs:** https://cloudinary.com/documentation

## Summary: Blast Radius if Each External Service Goes Down
| Service down | What breaks | What still works |
|---|---|---|
| Google OAuth | Google-based login | Owner email/password login, all already-logged-in sessions |
| Google Maps (any of the 4 APIs) | Maps, address autocomplete, walking directions | Everything else — login, bookings, payments, reports |
| PayMongo | New online payments | Cash bookings, all existing data, everything else |
| Cloudinary (cloud deployment only) | New file uploads | Already-uploaded files (served from Cloudinary's CDN directly), everything else |
