# CSPC Boarding House System — Turnover Documentation

This folder contains the complete documentation package for handing the CSPC Boarding House Selection and Transaction Management System over to the ICTU Head and MIS Section, per the institution's system turnover requirements.

## Index

| Doc | Title | Turnover requirement covered |
|---|---|---|
| [04-database-turnover.md](04-database-turnover.md) | Database Turnover | #4 — schema, ERD, data dictionary, dump instructions |
| [05-system-architecture.md](05-system-architecture.md) | System Architecture | #5 |
| [06-installation-guide.md](06-installation-guide.md) | Installation Guide | #5 |
| [07-configuration-guide.md](07-configuration-guide.md) | Configuration Guide | #5 |
| [08-administrator-manual.md](08-administrator-manual.md) | Administrator's Manual | #5 |
| [09-user-manual.md](09-user-manual.md) | User Manual (Student + Owner) | #5 |
| [10-api-documentation.md](10-api-documentation.md) | API Documentation — this system's own API, **and** the external third-party APIs it depends on (Google OAuth, Google Maps, PayMongo, Cloudinary) | #5 |
| [11-infrastructure-requirements.md](11-infrastructure-requirements.md) | Infrastructure Requirements | #6 |
| [12-software-prerequisites.md](12-software-prerequisites.md) | Software Prerequisites | #7 |
| [13-security-configuration.md](13-security-configuration.md) | Security Configuration | #8 |
| [14-knowledge-transfer-runbook.md](14-knowledge-transfer-runbook.md) | Knowledge Transfer Runbook | #13 |
| [15-warranty-and-support.md](15-warranty-and-support.md) | Warranty and Support (template) | #14 |
| [16-uat-test-plan.md](16-uat-test-plan.md) | UAT Test Plan | #10 |
| [17-system-testing-results.md](17-system-testing-results.md) | System Testing Results | #11 |
| [18-training-materials.md](18-training-materials.md) | Training Materials | #9 |
| [19-turnover-deliverables-checklist.md](19-turnover-deliverables-checklist.md) | Turnover Deliverables Checklist | #15 |

## What's Outside This Folder's Scope
Requirements #1 (Initial Coordination Meeting) and #2 (System Demonstration) were already completed before this documentation was written. Requirement #12 (Data Migration) is **not applicable** — this is a fresh deployment with no legacy system data to migrate. Requirement #16 (Final Acceptance) is a signature event that occurs after everything above is reviewed and accepted — it isn't a document to produce.

## Reading Order for a New MIS Staff Member
1. `05-system-architecture.md` — understand the big picture first.
2. `04-database-turnover.md` — the data model everything else builds on.
3. `06-installation-guide.md` + `07-configuration-guide.md` — how to actually run it.
4. `08-administrator-manual.md` / `09-user-manual.md` — how it's actually used.
5. `13-security-configuration.md` — read this before going live, not after.
6. `14-knowledge-transfer-runbook.md` — keep this bookmarked for ongoing operations.

## ⚠️ Two Action Items That Need You, Not Just Reading
1. **Rotate the bootstrap admin password** immediately after first login — see `08-administrator-manual.md`. It's currently hardcoded in source and MIS now has source access.
2. **Fill in `15-warranty-and-support.md`** — the bracketed fields (support duration, contact info, response times) require an institutional decision, not a technical one.
