# Administrator's Manual

Audience: SASO / MIS staff operating the **Admin** role.

---

## ⚠️ First-Login Security Action (read before anything else)

The system ships with one bootstrap admin account seeded by the database schema:

- **Email:** `admin@cspc.edu.ph`
- **Password:** `admin_saso_2026`

This password is intentionally simple for first-time setup, but it is also **hardcoded directly in the backend source code** (`backend/routes/auth.js`) as a fallback login path — meaning anyone with access to the source code (which MIS now has, as part of this turnover) can see it. It **must** be changed immediately after the first successful login:

1. Log in with the credentials above.
2. Go to **Profile** → update the password to a strong, unique value.
3. Recommended follow-up: ask the development team to remove the hardcoded fallback comparison in `auth.js` entirely once every real admin account has its own password set, so the bootstrap value stops being a permanently-valid backdoor.

Do not leave this default credential active in a production environment beyond initial setup.

---

## 1. Logging In
Navigate to the system's login page → "Admin" → sign in with a `@cspc.edu.ph` Google account, or the email/password form for the bootstrap account. Admin accounts are domain-restricted (see `docs/07-configuration-guide.md` §4).

## 2. Home (Dashboard)
The landing page after login shows:
- **Summary tiles:** total accredited houses, total active residents, occupancy rate, pending applications.
- **Student Residency Overview** — a bar chart of active residents per boarding house, split by sex (Boys/Girls), with totals in the header.
- **System-Wide Booking Trend** — a 6-month line chart of booking volume.
- **Top-Rated Boarding House** and **Residents by Course** breakdown.
- Quick-navigation cards into every other admin module.

## 3. Reviewing New Applications
**New Applications** lists every boarding house awaiting review — both brand-new registrations and document-resubmissions from already-accredited owners (tagged distinctly in the table so you can tell them apart at a glance).

For each application:
1. Open it to review all 8 submitted legal documents (Business Permit, Cedula, DTI Registration, Barangay Clearance, Building Inspection, Zoning Certificate, Sanitary Permit, Fire Safety Certificate) plus any custom checklist criteria.
2. Tick off each checklist item as verified.
3. **Approve** — the house becomes publicly visible immediately; the owner is notified. If this was a document resubmission on an already-accredited house, its existing status is preserved rather than being treated as a fresh approval.
4. **Reject** — the owner is notified with the reason. For a *new* application, this fully unaccredits it. For a resubmission on an already-accredited house, the house's existing accreditation is **not** revoked by a rejected resubmission — only the specific resubmitted document is declined.

## 4. Registered Boarding Houses
Lists every currently-accredited property. From here you can:
- View the owner's profile and contact details.
- View full listing details (photos, amenities, price, location).
- View all 8 legal documents at any time.
- View the room list and currently-booked students per room.
- **Archive** a listing (with a required reason) — this is a manual action distinct from the automatic compliance-driven archiving described below.

## 5. Archive Management
Lists all archived properties. Archiving (manual or automatic) hides a listing from students/guests but **preserves all its data** — rooms, documents, booking history, and resident records remain intact and admin-visible. From here you can **Restore** a property once its compliance issue is resolved and documents are re-verified.

**Why a house gets archived:**
- **Automatically**, when any of the **4 critical permits** (Business Permit, Barangay Clearance, Sanitary Permit, Fire Safety Certificate) expires without renewal.
- **Manually**, by an admin, for any other reason (owner-requested closure, non-compliance, etc.) via the Archive action in Registered Boarding Houses.

The remaining 4 permits (Cedula, DTI, Building Inspection, Zoning) are **supplementary** — their expiry only sends a warning notification to the owner and never triggers auto-archiving.

## 6. User Account Management
Lists all registered students and owners (admin accounts are intentionally excluded from this list — they are managed separately, not through this screen). From here you can:
- Edit a user's profile information on their behalf.
- **Activate/Deactivate** an account — a deactivated account cannot log in. Use this, for example, to suspend an owner whose accreditation has been revoked for cause.

## 7. Residency Registry (Emergency Monitoring)
A live, filterable directory of every currently-active resident across all accredited **and archived** properties (a resident doesn't disappear from safety tracking just because their property's accreditation status changed) — including contact info, emergency contact, guardian name, and room assignment. Filter by barangay, specific boarding house, or course. Properties that are archived-but-still-occupied are visibly flagged so you understand why they appear here.

This is the system's primary tool for **disaster/emergency response** — e.g., generating a contact list for all students in a specific flood-prone barangay during a typhoon.

## 8. Notifications
A shared inbox showing accreditation decisions, booking activity, and permit expiry warnings relevant to the admin role. This is a read/acknowledge inbox, not a broadcast or configuration tool.

## 9. Reports
All four reports are viewable on-screen and exportable as print-ready PDFs (via the browser's print dialog):

| Report | Contents |
|---|---|
| **Accredited Boarding Houses Masterlist** | Every accredited property, owner contact, room gender split, capacity, current occupant count with Boys/Girls breakdown, status. |
| **Accreditation Compliance Audit** | Every accredited/archived house's compliance status and all 8 permit expiry dates, expired ones visually flagged. |
| **Student Reservation History** (Transactions) | Every booking record system-wide, with status, payment status, and payment method (Cash / Online). |
| **Emergency Residency Registry** — reached from the Residency Registry module's own Print button, not a separate menu page. |

## 10. Managing Courses
Under **Manage Courses**, add, edit, or deactivate the list of academic programs available in the student profile dropdown. Deactivating a course hides it from new selections without breaking any existing student record that already references it.
