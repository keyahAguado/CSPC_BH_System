# Admin and Owner interface redesign

Implemented on October 9, 2026, following approval of the source-code audit.

## Scope and changes

The redesign covers all nine Admin views and all nine Owner views, the two role navigation components, and the management branch of the shared Notifications page. No backend, schema, database, router guards, authentication, validation utilities, API configuration, Student view files, package dependencies, or global stylesheet were changed.

- Added a navy management sidebar and top bar, direct access to existing reports and residency management, current-route indicators, mobile/tablet drawer, skip link, and property-context links. Preserved notification polling, logout confirmations, session clearing, and the existing outside-click hooks. The drawer closes on transition to desktop width.
- Added reusable PageHeader, MetricCard, and LoadError components with a management-only stylesheet.
- Reorganized Admin dashboard KPIs using existing fields, clarified their meanings, improved chart label sizing, added chart accessible names, and clarified the residency chart's top-ten scope. Chart datasets and calculations are unchanged.
- Added Owner dashboard metrics using its existing totalListings and pendingBookings fields. Reorganized properties into an adaptive grid and separated listing warnings from property management actions. Renamed the existing active listing tab to Not archived because its predicate includes pending and rejected properties.
- Consolidated Registered and Archived tables from eight columns to four, combining property/date and grouping all existing inspection actions. Preserved owner, property, documents, rooms, occupant checkout, archive, and restore workflows.
- Improved accreditation, user registry, room, reservation, document, profile, and report typography, control sizing, headings, and action hierarchy. Preserved all application steps and criteria, form fields, validation constraints, ledger values, status conditions, and confirmation sequences.
- Converted the property edit presentation from a constrained modal-style form to a page with normal document scrolling.
- Added accessible names to fields and icon controls. Added dialog naming, focus containment, Escape callbacks where an existing close handler is available, focus restoration, scroll locking, and cleanup.
- Added persistent management load-failure messages while retaining existing alerts and error handlers.
- Compacted Admin/Owner notifications and added keyboard activation. The existing Student notification template branch is byte-for-byte unchanged.
- Added responsive styling and reduced-motion support, and hid management chrome from printing.

## Files modified

- `frontend/src/components/partials/AdminNav.vue`
- `frontend/src/components/partials/OwnerNav.vue`
- `frontend/src/views/Notifications.vue`
- `frontend/src/views/admin/AdminDashboard.vue`
- `frontend/src/views/admin/Archived.vue`
- `frontend/src/views/admin/EmergencyMonitoring.vue`
- `frontend/src/views/admin/PendingApplications.vue`
- `frontend/src/views/admin/Registered.vue`
- `frontend/src/views/admin/ReportCompliance.vue`
- `frontend/src/views/admin/ReportMasterlist.vue`
- `frontend/src/views/admin/ReportTransactions.vue`
- `frontend/src/views/admin/Users.vue`
- `frontend/src/views/owner/Bookings.vue`
- `frontend/src/views/owner/Documents.vue`
- `frontend/src/views/owner/EditHouse.vue`
- `frontend/src/views/owner/OwnerAccreditation.vue`
- `frontend/src/views/owner/OwnerDashboard.vue`
- `frontend/src/views/owner/PendingReview.vue`
- `frontend/src/views/owner/Profile.vue`
- `frontend/src/views/owner/RoomDetails.vue`
- `frontend/src/views/owner/Rooms.vue`

## Files added

- `frontend/src/components/management/dialogAccessibility.js`
- `frontend/src/components/management/LoadError.vue`
- `frontend/src/components/management/ManagementNavigation.vue`
- `frontend/src/components/management/MetricCard.vue`
- `frontend/src/components/management/PageHeader.vue`
- `frontend/src/styles/management.css`
- `docs/admin-owner-redesign-report.md` (this report)

## Preservation checks

- Compared the original and final JavaScript syntax trees for 21 existing components. All were equivalent after excluding imports, the added loadError presentation state/assignments, and chart font configuration. Existing API calls, payloads, business handlers, state calculations, validation, and session operations remained equivalent in that comparison.
- Compared original and final event/model bindings and form constraint attributes across all 18 role views: no original bindings or constraints were removed.
- Confirmed no tracked changes in backend/, frontend router, utils, main.js, global style.css, API configuration, or Student view files.
- Confirmed the shared Student notification template branch is unchanged.
- Render fixtures were fictional and existed only in memory. No application server, production API, or database was used for testing.

## Validation results

| Check | Result | Practical limit |
| --- | --- | --- |
| Vue SFC compilation | Passed | Syntax/template validation; does not test browser interactions |
| Production build: node node_modules/vite/bin/vite.js build, from frontend/ | Passed, including PWA generation | Existing large-chunk warning remains; main bundle approximately 3.46 MB before gzip |
| Existing suite: node --test with all backend/tests/*.test.cjs files enumerated | 1,033 passed; zero failed or skipped | Tests use isolated/mock fixtures; not live end-to-end workflows |
| In-memory Vue SSR review of all 18 role views | Populated, empty, and error variants rendered; masterlist error display corrected and rechecked | Not screenshots, CSS layout verification, browser charts, or real API integration |
| Dialog accessibility with isolated DOM fixture | Six checks passed: semantics/focus/scroll lock, first Tab, forward/backward wrap, Escape callback, restoration/cleanup | Not assistive-technology or real-browser validation |
| Existing outside-click handler against new drawer hooks | Toggle and sidebar clicks keep drawer open; outside click closes; markup hooks present | Does not verify touch interactions or viewport rendering |

## Remaining verification and limitations

No browser surfaces were available through the computer-use tool, and creating an in-app browser returned Browser is not available: iab. Consequently, desktop/mobile visual review, measured contrast, viewport overflow, real dialog interactions, rendered Chart.js behavior, print previews, browser-console review, and live form submission/API workflows remain unverified. These are not claimed as tested. No production records were modified.

Existing wide reservation and occupant records still use contained horizontal scrolling; mobile card presentations remain available. A real-browser review should cover 390px, 768px, 1024px, 1366px and wider displays, long names/addresses, large datasets, nested dialogs, and print output.

Two pre-existing behavioral inconsistencies documented in the audit were deliberately left unchanged: Admin expiry/rejection notification contextual links can point to Owner documents, and room-detail mobile/desktop upfront-payment controls differ for online payments. Correcting those conditions requires a separately reviewed behavior change.

## Optional separate work

- Resolve the existing notification destination and online-payment control inconsistencies with explicit workflow regression coverage.
- Add real browser end-to-end coverage against a dedicated test database.
- Consider frontend route code splitting to address the bundle-size warning.
- Dedicated Owner occupancy/revenue analytics, a cross-property occupant directory, or a transaction ledger require separate functional design and data-contract review. No unsupported modules or fictional production KPIs were added.
