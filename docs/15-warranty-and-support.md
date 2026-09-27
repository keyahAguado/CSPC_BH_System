# Warranty and Support

**⚠️ Template — the bracketed fields below require input from the development team and the institution before this document is considered final.** The structure and categories are ready; the specific terms are a business/institutional decision, not a technical one.

---

## 1. Warranty Period
The system is warranted against defects in the delivered functionality for **[ NUMBER ] months** from the date of the System Transfer and Acceptance Certificate signature.

**Covered under warranty:**
- Bugs in existing functionality present at the time of turnover (a feature behaving differently than documented in the User/Administrator Manuals).
- Errors surfaced during the resolution of items listed in `docs/17-system-testing-results.md` §3–4, if not already resolved before turnover.

**Not covered under warranty:**
- New feature requests.
- Issues caused by configuration changes made outside the documented procedures in `docs/07-configuration-guide.md`.
- Issues arising from third-party service changes (Google, PayMongo, Cloudinary) outside the development team's control.
- Issues arising from infrastructure not provisioned per `docs/11-infrastructure-requirements.md`.

## 2. Post-Deployment Support Arrangement
**[ Specify: e.g., best-effort email support / a fixed number of support hours per month / on-call arrangement ]**

## 3. Bug-Fixing Procedure
1. MIS reports an issue via **[ specify channel — email, ticketing system, etc. ]**, including: what was expected, what happened, and steps to reproduce.
2. Severity is triaged: **Critical** (system down / data at risk — target response: **[ TIME ]**), **High** (a core feature broken — target response: **[ TIME ]**), **Normal** (a minor or cosmetic issue — target response: **[ TIME ]**).
3. A fix is developed, tested against the relevant checks in `docs/17-system-testing-results.md`, and deployed following the sequence in `docs/14-knowledge-transfer-runbook.md` §2.
4. MIS confirms resolution.

## 4. Modification Requests (Outside Warranty Scope)
Requests for new features or significant behavior changes beyond the warranted scope should be submitted as a separate scoped request. **[ Specify how these are quoted/handled — e.g., time-and-materials, fixed quote per request ]**.

## 5. Contact Information for Technical Support
| Role | Name | Contact |
|---|---|---|
| Primary developer / point of contact | | |
| Secondary contact (if applicable) | | |

## 6. Source Code Access for Future Maintenance
The complete source code is provided as part of Turnover Deliverables (`docs/18-turnover-deliverables-checklist.md`), meaning MIS is **not solely dependent on the original developer** for future maintenance — any competent MEVN-stack developer can maintain the system using the documentation in this `docs/` folder as a starting point. This should be stated explicitly in the final signed agreement, since it materially affects the institution's long-term risk if the original support arrangement ends.
