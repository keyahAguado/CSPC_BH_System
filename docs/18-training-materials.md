# Training Materials

Content outline for orienting designated system administrators and end-users. Each session references the corresponding manual for hands-on reading material — this document is the **session structure and talking points**, not a replacement for the manuals themselves.

---

## Session 1: Administrator Orientation (SASO / MIS Admin Staff)
**Duration:** ~90 minutes | **Reference:** `docs/08-administrator-manual.md`

| Segment | Time | Content |
|---|---|---|
| 1. First login & security | 10 min | Log in with the bootstrap credential, **change the password immediately** (walk through this live, don't skip it), tour the layout/nav. |
| 2. Dashboard walkthrough | 10 min | Explain each summary tile, the gender-breakdown chart, and the booking trend chart — what data drives each. |
| 3. Accreditation review, live demo | 20 min | Walk through reviewing a real (or staged test) application: opening each of the 8 documents, the checklist, approve vs. reject, and the resubmission-vs-new-application distinction. |
| 4. Archive management | 15 min | Explain critical vs. supplementary permits and why that distinction exists — this is the part most likely to confuse a new admin, so spend real time here. Demo a manual archive + restore. |
| 5. User account management | 10 min | Demo deactivating an account and explain when this is appropriate. |
| 6. Residency Registry (emergency use) | 15 min | This is the highest-stakes module — walk through filtering by barangay and explain this is the tool they'd reach for during an actual emergency/disaster. Make sure trainees understand archived-but-occupied houses still appear here. |
| 7. Reports | 10 min | Generate and print each of the 4 reports live. |

**Hands-on exercise:** have each trainee independently approve one test application and generate one report before the session ends.

---

## Session 2: Owner Orientation
**Duration:** ~45 minutes | **Reference:** `docs/09-user-manual.md` Part 2

| Segment | Time | Content |
|---|---|---|
| 1. Registration & accreditation submission | 15 min | Live demo of submitting all 8 documents and setting the GPS pin — specifically demo the "typed address but didn't select a suggestion" mistake and show the warning that catches it, since this is a common real user error. |
| 2. Listing & room management | 10 min | Adding rooms, setting gender restrictions and capacity. |
| 3. Handling bookings | 15 min | Approve/reject a request; explicitly demo the difference between a cash approval (immediate occupant) and a PayMongo approval (still "Awaiting Payment"). |
| 4. Document renewal | 5 min | Show where to upload a renewed permit before expiry. |

Can be delivered as a **recorded video walkthrough** distributed to owners rather than a live session, given they're an external, distributed audience rather than institutional staff.

---

## Session 3: Student Orientation (Optional / Self-Service)
**Reference:** `docs/09-user-manual.md` Part 1

Given students are the largest and most distributed user group, recommend a **short how-to video or one-page visual guide** rather than a live session, covering: logging in, searching/filtering listings, submitting a booking, and the difference between "Pending Review" and "Confirmed." This can be linked from the landing page or distributed via the institution's usual student-communication channels.

---

## Session 4: MIS Technical Knowledge Transfer
**Duration:** ~2 hours | **Reference:** `docs/14-knowledge-transfer-runbook.md`, `docs/06-installation-guide.md`, `docs/07-configuration-guide.md`

| Segment | Time | Content |
|---|---|---|
| 1. Architecture overview | 20 min | Walk through `docs/05-system-architecture.md` — the diagram, the deployment topology, how the pieces talk to each other. |
| 2. Live deployment walkthrough | 30 min | Actually perform (or screen-share) a deploy — push a trivial change, watch it go through Vercel/Render, verify it live. |
| 3. Configuration | 20 min | Walk through every environment variable and what it controls. |
| 4. Backup & restore, live demo | 20 min | Actually run a `mysqldump` and restore it to a scratch database, so this isn't just theoretical. |
| 5. Troubleshooting | 20 min | Walk through the troubleshooting table in the runbook; if possible, deliberately trigger one issue (e.g. stop a container) and have the trainee diagnose and fix it. |
| 6. Q&A / open floor | 10 min | |

**This session should be recorded** (with the trainees' consent) as a fallback reference, given its technical density.
