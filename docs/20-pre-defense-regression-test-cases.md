# Pre-defense system test cases

Use this pack to test the current system as a group. It covers ordinary workflows, the recent fixes, and important failure conditions. These are tests to execute, not a claim that every case has already passed.

Record each result in [the results sheet](21-pre-defense-test-results.md). Leave the older UAT document unchanged; use this pack for the current regression run.

## How to run the tests

- **P0: must pass before defense.** Start here. A failed valid submission, wrong occupancy, wrong payment result, unauthorized access, missing property details, or blank page is a release blocker.
- **P1: extended regression.** Run after P0, including invalid inputs and less common states.
- **P2: developer-assisted checks.** Some need provider access, special fixtures, or coordinated browser sessions. Record **Blocked** when the setup is unavailable; never mark an untested case Pass.
- Status options: **Not run / Pass / Fail / Blocked / N/A**. Explain Blocked and N/A. Repeat a failed case after a fix and keep both results.
- For every save: check the message, refresh the page, then check the other affected role. A success message alone is insufficient.
- Use **designated test accounts and properties**. Prefer local or staging. On hosted production, touch only test records approved by the project lead. Do not use actual residents' accounts or documents.
- Perform expiry, archive, checkout, account deactivation, and password-reset tests last on each fixture. They change its state. The project lead should restore test fixtures through the normal UI afterward.
- Do not run SQL, change server time, modify environment settings, delete real records, or fabricate payment-success URLs/events to make a case pass.
- Payment cases require the configured provider's authorized test setup. If only live checkout is available, stop before paying and mark payment completion **Blocked** until the project lead approves a specific controlled payment. Never share card details, passwords, tokens, Authorization headers, or unredacted personal documents in evidence.

## Assignments and coordination

| Tester | Responsibility | Collaborates with |
|---|---|---|
| Tester A | Admin: applications, documents, archives, users, reports, courses | Owners and students |
| Tester B | Owner A: applications, property edits, rooms, occupants, approvals | Tester A and students |
| Tester C | Students: browsing, profiles, bookings, cancellation, receipts, reviews | Owners |
| Tester D | Owner B, mobile/PWA, network failures, cross-owner access, concurrency | All testers |

One person can perform several roles, but use separate browser profiles or private windows. The system uses session storage; do not assume a new browser tab automatically carries the same login. Record the role actually shown before acting.

Do not run conflicting edits on the same room/property at the same time except in the concurrency cases. Assign each tester separate fixtures for validation tests.

## Test fixtures to prepare through the UI

Use a unique prefix such as `QA-2026-10-03-Team1` in test property names. Record real IDs and room numbers in the results sheet. Never put account passwords in the sheet.

| Fixture | Setup |
|---|---|
| Admin A | Existing authorized admin account |
| Owner A | Owner with at least one accredited test property |
| Owner B | Different owner, with a separate accredited test property |
| New owner | Fresh owner account for onboarding and first approval |
| Students F1/F2 | Authorized student accounts with female profile, valid contact details, no active/pending booking |
| Student M1 | Authorized student account with male profile, no active/pending booking |
| House A | Owner A, accredited, valid coordinates, required permits more than 30 days away, known advance/deposit terms |
| House B | Owner B, accredited, known terms and different rooms |
| House P | New owner's pending application; prepare a second pending house for the multiple-house test |
| House X | Disposable accredited house for pause, archive, permit-expiry, and restoration tests; keep separate from booking fixtures |
| Room F | Female, capacity 2, known monthly rent; start empty |
| Room M | Male, capacity 2, known monthly rent; start empty |
| Room L | Capacity 1, matching the test students; reserved-slot/concurrency fixture |
| Manual boarders | Fictional non-CSPC names and test contact numbers |
| Files | Small real JPG/PNG/WEBP images; a genuine HEIC if available; an image over 10 MB; an unsupported file; up to 10 gallery photos |

Relative date examples: **T** = today's date in the Philippines, **T+10** = ten days ahead, **T+100** = one hundred days ahead, **T-1** = yesterday. Use actual calendar dates. Do not reuse an old fixed test date that is now expired.

Use ordinary rent such as PHP 1,500.50 and a short duration such as two months for valid-input tests. Large-value tests belong only on disposable local/staging fixtures.

## First run: coordinated defense rehearsal

Run this sequence before the extended cases. Use the detailed case IDs below for recording results.

1. Guest opens listings and a working map popup: G01-G04.
2. New owner completes onboarding and submits a valid application: A03, O01-O03.
3. Admin opens every document and accredits the application: D01-D03.
4. Owner refreshes Pending Review and opens the dashboard without re-login: O05-O06.
5. Owner adds rooms; student completes their profile and opens complete property details: R01, S01, G06.
6. Student submits a booking; owner approves it: B01-B04 for cash, then use a different eligible student/fixture for P01-P03 online.
7. Confirm room occupancy, notifications, receipt, and report values: N01-N03, P04/P06, Q01-Q04.
8. Complete a manual non-CSPC addition and independent payment toggles: M01-M04.
9. Check out a designated test resident and confirm the slot becomes available: C01-C03.
10. Repeat key screens on a phone and refresh protected pages: U01-U03, A07.

## A. Login, sessions, account access

| ID | Priority | Setup / action | Expected result |
|---|---|---|---|
| A01 | P0 | Log in using the existing authorized admin account and its actual sign-in method. | Admin dashboard opens; admin navigation and data load. |
| A02 | P0 | Sign in with an authorized institutional student Google account; repeat as a returning student. | Correct student account and dashboard; no duplicate account or wrong role. |
| A03 | P0 | New personal-account owner completes Google onboarding with valid phone/address. | Owner account is created once; accreditation application flow opens. |
| A04 | P0 | Sign in as a returning accredited owner. | Correct owner dashboard, properties, and identity. |
| A05 | P0 | Sign in as an owner with only a pending application. | Review/application screens remain available; full accredited dashboard access is restricted. |
| A06 | P0 | Log out, then use Back and reload a protected URL. | Protected data/actions require login; the previous session cannot perform saves. A transient browser history image is not proof of access—reload it. |
| A07 | P0 | Reload admin, owner, and student protected pages while logged in. | Correct session/role is retained; no loop, blank page, or forced re-login during a valid session. |
| A08 | P0 | Open `/admin/dashboard` as a student; open an owner management URL as a student; open a student booking URL as an owner. | No access to another role's protected management/action screens. |
| A09 | P1 | Submit empty login fields and a wrong local password. | Clear validation/authentication feedback; no login. |
| A10 | P1 | Cancel Google sign-in or deny consent; then retry normally. | No partial login or endless loading; normal retry works. |
| A11 | P0 | Admin deactivates a disposable account that is currently logged in. That account refreshes or makes its next API-backed action. | Formal deactivation notice, session cleared/access blocked; no usable protected saves. Do not require an instantaneous push logout while idle. |
| A12 | P0 | Try signing in to that inactive account. Admin reactivates it; retry. | Inactive login is blocked; reactivated account can log in with its correct role. |
| A13 | P1 | Owner with a local password changes it using the correct current password; log out/in. | New password works; old password fails. Wrong current password does not change anything. |
| A14 | P1 | On a designated account, admin updates user details or performs the existing password reset. | Only that account changes; next login uses the intended credentials. Coordinate the reset with the project lead. |
| A15 | P2 | Developer supplies a genuinely expired test session; request a protected action. | Access is denied and a understandable session message/sign-in path is available. Do not assume that 30 minutes of inactivity expires a seven-day token. |

## G. Guest/student browsing, property details, maps

| ID | Priority | Setup / action | Expected result |
|---|---|---|---|
| G01 | P0 | Open Home and the student listing view as a guest. | Accredited public listings load; no private document-management data is exposed on the public page. |
| G02 | P0 | Search a known property, then a term with no match; clear search. | Correct results, understandable empty state, original list restored. |
| G03 | P0 | Use available listing filters/sort controls one at a time and together. | Visible results match the selected filters; clearing them restores results. |
| G04 | P0 | Open Map View, click a system property marker, then its View Details action. | Correct popup and working details navigation, including the previously restored popup action. |
| G05 | P0 | Guest clicks Book Now. | Login prompt/redirect; no booking is submitted as a guest. |
| G06 | P0 | Student opens House A details from the listing, map, and a direct URL; refresh. | Name, address, rent, terms, rooms, photos, owner contact, reviews, and location match House A. No blank property page with misleading PHP 0 defaults. |
| G07 | P0 | Open gallery images and available document-free property detail modals. | Correct images, usable controls, clean close/reopen. |
| G08 | P1 | Test From CSPC directions; test From Me with location permission granted. | Directions/proximity are usable for the real property pin; no unrelated destination. |
| G09 | P1 | Deny location permission or use a device without GPS permission. | Understandable location feedback; property details and other actions remain usable. |
| G10 | P1 | Use a prepared local property with missing/invalid map coordinates. | Location-unavailable guidance; remaining property details still load. If no fixture exists, mark Blocked instead of damaging a valid property. |
| G11 | P1 | Open a nonexistent property ID. | Clear unavailable/retry/back-navigation handling; no blank page or bookable fake data. |
| G12 | P0 | Admin/owner unlists House X; refresh the public/student directory. | It is removed from bookable public listings. Existing resident/history records are not deleted. |

## O. Owner onboarding and property applications

| ID | Priority | Setup / action | Expected result |
|---|---|---|---|
| O01 | P0 | New owner submits all required application steps, genuine image files, valid permit dates, confirmed map pin, and valid financial terms. | Clear success; one application appears in owner Pending Review and admin Pending Applications. |
| O02 | P0 | Refresh owner Pending Review; admin opens the same application. | Same property, owner, photos, documents, terms, and location. |
| O03 | P0 | Admin views every uploaded standard document and facade/gallery photo. | Each opens the correct file, including after reload. |
| O04 | P0 | Submit a new property using the same owner's existing property name with only case/spacing differences. | Clear duplicate feedback; original property and files are not overwritten. |
| O05 | P0 | Owner has two pending houses. Admin accredits only the first; owner refreshes Pending Review. | Owner recognizes accreditation and can access the full dashboard without logging out/in. |
| O06 | P0 | In that dashboard, inspect both houses and the appropriate pending-property navigation. | Accredited property is manageable; the second application's pending state is retained and accessible through the intended UI. It is not silently accredited or lost. |
| O07 | P0 | Accredited owner adds a second, differently named property. | New property enters review; existing property's accreditation and room/bookings remain unchanged. |
| O08 | P0 | Edit House A name, description, contact, a normal two-decimal rent, and valid confirmed location; save/reload. | Edited values persist on owner/admin/student views; only House A changes. |
| O09 | P0 | Edit without selecting replacement photos/documents. | Existing files remain intact; no accidental clearing. |
| O10 | P1 | Replace featured image and gallery photos, keeping total gallery at or below ten. | Correct images persist, including public view and reload. |
| O11 | P1 | Change address text without confirming the map pin; try saving. | Clear pin-confirmation feedback; mismatched address/pin is not saved. |
| O12 | P1 | Submit with a missing required field/file or invalid core field from section V. | Clear correction message; no successful incomplete application or replacement of the original record. |
| O13 | P1 | Double-click Submit/Save and repeat after a slow response. | At most one application/save outcome; no duplicate application or partial gallery. Reload to verify. |
| O14 | P1 | Owner B opens Owner A's edit/documents/rooms URLs using known test IDs. | Other owner's private data/actions are denied; no changes to Owner A's property. |
| O15 | P1 | On a separate property with no bookings, save each available advance/deposit choice and deposit type. | Values match the selected choices in property details/booking summary. Do not alter terms on an existing paid booking to test historical repricing. |

## D. Admin review, rejection, document resubmission

| ID | Priority | Setup / action | Expected result |
|---|---|---|---|
| D01 | P0 | Open Pending Applications and its details/checklist/document viewer. | Correct owner/property data and files; no mixing between applications. |
| D02 | P0 | Attempt approval while a UI-required checklist item is unchecked. | Required-item feedback; no accidental approval. |
| D03 | P0 | Check applicable requirements and approve House P. Refresh all three roles. | Property is accredited, owner notified, removed from active pending queue, and publicly visible. |
| D04 | P0 | Reject a never-accredited pending application with feedback. | Owner sees rejection/reason; property disappears from active pending review and is not publicly bookable. |
| D05 | P0 | Look for D04's rejected property in the actual Archive list. | Rejection alone does not classify it as archived. |
| D06 | P0 | Owner resubmits corrected documents for D04; admin refreshes pending review. | Same property/ID returns for recheck; badge says Document Recheck without falsely claiming previously archived/accredited. |
| D07 | P0 | Approve D06's corrected application. | Accreditation and owner dashboard access work; previous feedback does not leave a stale rejected state. |
| D08 | P0 | Owner replaces a document on an already accredited House A. | Correct update is flagged for admin recheck; it remains distinguishable from a new application. |
| D09 | P0 | Admin rejects that document recheck while House A is still accredited. | Existing house accreditation is preserved; document feedback is shown for correction. A rejection alone must not unlist the live property. |
| D10 | P0 | Owner corrects D09's document; admin approves the recheck. | Correct file/date persist; review flags resolve; house stays accredited. |
| D11 | P1 | Resubmit two different documents before admin refreshes. | Both changes are available to review; correct files are retained. |
| D12 | P1 | Add, rename, and delete a disposable house-specific custom requirement; submit its document as that owner. | Requirement is scoped to the correct house; correct label/file/date are used. |
| D13 | P1 | Try changing a locked institutional/global requirement through the UI. | Protected action is unavailable/blocked; defaults remain intact. |
| D14 | P1 | Reject without meaningful feedback. | Clear feedback-required message; no status change. |
| D15 | P1 | Double-click approval/rejection, refresh, and inspect notifications/property state. | No contradictory final status, duplicate occupants, or corrupted checklist; record duplicate notifications if observed. |
| D16 | P2 | Developer tests malformed/duplicate checklist IDs and IDs belonging to another property's custom requirement. | Clear rejection before accreditation/checklist writes; applicable/global IDs still work. |

## H. Property archival, restoration, compliance

| ID | Priority | Setup / action | Expected result |
|---|---|---|---|
| H01 | P0 | Owner pauses/unlists an accredited House X with valid permits. | House becomes owner-paused/unlisted; public booking is unavailable; historical data remain. |
| H02 | P0 | Owner reactivates H01 without admin restriction and with valid required permits. | Same eligible house returns to accredited/public state. |
| H03 | P0 | Inspect pending/rejected property actions; attempt any visible owner reactivation path. | Owner cannot self-accredit a never-accredited property. Unlist/reactivate action is not offered as an accreditation shortcut. |
| H04 | P0 | Admin archives House X with a reason. | Correct Archive list entry/reason; public listing removed; owner informed. |
| H05 | P0 | Owner tries to reactivate the admin-archived house. | Self-reactivation is unavailable/blocked; admin/review authority is retained. |
| H06 | P0 | Admin restores H04 while required permits are valid beyond 30 days. | Accredited listing returns; live compliance is active, not stale expired. |
| H07 | P1 | Prepare an archived House X whose critical permit expires at T+10; restore as admin. | Restoration succeeds with warning compliance. Verify the compliance report/permit status; a special warning in the success popup is not required. |
| H08 | P0 | Prepare an archived fixture with a critical permit dated T or T-1; admin attempts restore. | Clear expired-permit block; house remains archived. |
| H09 | P1 | On disposable House X, submit a document with a critical expiry of T-1; refresh after the save-triggered compliance evaluation. | Critical expiry results in system archival/expired compliance and appropriate notification; no claim that the property was manually archived. |
| H10 | P0 | Owner renews H09's expired critical document with T+100; admin reviews it. | Review flow preserves actual prior archive history. Badge may say Previously Archived, even if resubmission moves the current status into Pending Review and removes it from the current Archive list. |
| H11 | P0 | Admin approves H10's eligible renewed documents; refresh owner/student views. | Property becomes accredited/bookable again; old archive/compliance state does not leave misleading controls. |
| H12 | P1 | On an otherwise compliant disposable property, expire only a supplementary document. | Supplementary warning/expired feedback; it does not alone trigger critical-permit archival. |
| H13 | P1 | Renew an expiring critical document to T+100 and refresh the compliance report. | Warning resolves based on current date; no re-login required to see current server state. |
| H14 | P1 | Archive a designated house with existing test residents; view history/reports. | Listing availability changes; resident/history records are retained. Owner-facing pause may be allowed even with residents—do not expect a deletion. |
| H15 | P2 | Developer provides an old owner archive with unknown pre-archive status. Owner attempts self-reactivation. | Unknown history does not grant accreditation; use the permitted admin/review path. |

Critical documents: Business Permit, Barangay Clearance, Sanitary Permit, Fire Safety. Supplementary: Cedula, DTI, Building, Zoning. Expiry on today's date is treated as expired. Perform these tests on disposable local/staging fixtures; do not alter real permits or the server clock.

## R. Rooms, capacity, reserved places

| ID | Priority | Setup / action | Expected result |
|---|---|---|---|
| R01 | P0 | Add female and male rooms with valid numbers, capacity, and rent. | Correct rooms appear under the correct property/gender; details and booking selection work. |
| R02 | P0 | Leave new room rent blank. | Existing property base-rate fallback is preserved. |
| R03 | P0 | Edit a room number, rent, and increase capacity; reload. | Values persist; occupants/history remain attached to the same room. |
| R04 | P0 | Add/rename to a duplicate room number within the same property, including case/spaces and an archived room's number. | Clear duplicate block; original room stays unchanged. |
| R05 | P1 | Use the same room number in a different owner's/property's room. | Allowed; uniqueness is per property. |
| R06 | P0 | Reduce capacity below the number of active occupants. | Clear block; capacity and occupants unchanged. |
| R07 | P0 | Room has three active occupants and one approved unpaid online reservation. Try capacity 3, then 4. | Three is blocked with a useful reason; four is allowed. |
| R08 | P0 | Archive an empty room, inspect Archived Rooms, then restore it. | Room leaves active/booking choices, is retained for records, and restores to the correct property. |
| R09 | P0 | Attempt to archive a room with active occupants. | Clear block; residents are not removed. |
| R10 | P0 | Attempt to archive a room with an approved unpaid online reservation. | Clear reserved-payment block; reservation and room remain intact. |
| R11 | P0 | In Room L, owner approves an online request without payment. Try adding a manual occupant or approving another student. | Reserved slot is respected; extra occupancy/approval is blocked although no paid occupant exists yet. |
| R12 | P0 | Cancel the approved unpaid reservation as its student, then retry R11's blocked action. | Reservation no longer consumes the slot; a newly eligible action can proceed. |
| R13 | P1 | On desktop/mobile, open room details before/after occupant add, payment, and checkout; reload. | Correct room, occupancy, resident details, and status; no stale count after reload. |
| R14 | P1 | Test invalid capacity, room number, gender, and price from V. | Helpful feedback; no room created/edited. |

## S. Profiles and student booking

| ID | Priority | Setup / action | Expected result |
|---|---|---|---|
| S01 | P0 | Student saves valid sex, course, DOB/age, phone, emergency contact, address, and profile photo. | Values persist after refresh; automatic age is consistent with DOB. |
| S02 | P0 | Open booking form after S01. | Correct property/room data and saved student details are prefilled; user can correct editable fields. |
| S03 | P1 | Save a newly selected active course; retain an existing historical course unchanged. | Active choice saves; unchanged historical value is not unnecessarily blocked. New unknown/inactive choice is not accepted. |
| S04 | P1 | Owner saves valid profile details and a replacement image; then saves again without another image. | Correct profile details; replacement photo is retained. |
| S05 | P1 | Run invalid DOB, contact, text-length, and password cases from V. | Clear correction feedback; previous valid profile/password remains intact. |
| B01 | P0 | Eligible student chooses a matching room, date T or later, two months, valid details, and cash; open Review Your Booking. | Correct property, room, dates, duration, rent, upfront/deposit terms, and method. Check-in/check-out use the same display style. |
| B02 | P0 | Close review modal, change a field, reopen, and confirm once. | Latest values appear; exactly one pending request in student and owner views. |
| B03 | P0 | With B02 pending, try another property/room booking. | Blocked with a clear pending-reservation notice and usable My Bookings link. |
| B04 | P0 | Owner approves the cash request; refresh student, owner room details, and reports. | Booking confirmed; exactly one occupant is created by approval; dates, rent, and reference are consistent. |
| B05 | P0 | Student with a confirmed booking/active stay tries another reservation. | Blocked; no second pending booking created. |
| B06 | P0 | Owner rejects a pending request; student checks reason/status and books again. | Rejected status is shown; no occupant created; student becomes eligible if no other pending/confirmed/active stay exists. |
| B07 | P0 | Student cancels a pending request; refresh both roles; create a replacement request. | Old request cancelled, no occupancy, replacement permitted when otherwise eligible. |
| B08 | P0 | Female student selects a male-only room, then reverse with M1. | Wrong-gender room is unavailable or submission blocked; matching-gender selection still works. |
| B09 | P0 | Try booking an actually full room or one just archived/unlisted in another session. | No successful unavailable-room reservation; understandable feedback/reload path. |
| B10 | P0 | Two different eligible students send pending requests to an empty Room L before either is approved. | Requests may coexist; pending count is advisory, not occupied capacity. Once one is approved, the other cannot exceed capacity. |
| B11 | P0 | Check the room selection pending-request badge before/after request submission, rejection, cancellation, and approval. | Badge counts pending requests only; approved awaiting-payment reservations are a separate state, not pending requests. |
| B12 | P1 | Try zero/negative/fractional months, malformed date year, invalid contacts, and whitespace name; correct them and retry. | Invalid values blocked; corrected valid booking works without re-login or form deadlock. |
| B13 | P1 | Double-click booking confirmation or submit from two student browser sessions. | At most one active pending booking; clear feedback for the second attempt. |
| B14 | P1 | Try self-cancelling confirmed cash occupancy or a paid online stay. | Cannot orphan an active occupant through self-cancellation; owner checkout path is used. |
| B15 | P1 | Where consent is requested, accept then complete the booking; reload/login later. | Consent flow is usable and booking completes. Record repeated consent prompts or missing persistence as a finding; do not assume the modal alone proves consent was saved. |

## P. Online/cash payments and receipts

| ID | Priority | Setup / action | Expected result |
|---|---|---|---|
| P01 | P0 | Eligible student submits a PayMongo booking; owner approves. | Confirmed/reserved awaiting payment; no occupant before verified payment; slot is protected. |
| P02 | P0 | Student starts checkout for P01. | Correct booking, PHP amount, room/property description, and supported provider choices. |
| P03 | P0 | Complete an authorized provider test payment; return and refresh. | Verified paid status; one occupant; slot changes from reservation to occupancy, not two occupied places. If no authorized payment setup exists, mark Blocked. |
| P04 | P0 | Refresh payment return/My Bookings several times after P03. | No duplicate occupant, payment record, or repeated settlement effect. |
| P05 | P0 | Open online checkout, cancel/back out without paying, return and refresh. | Not shown as paid; unpaid reservation remains until the student cancels it or another supported resolution occurs. |
| P06 | P0 | On an approved cash booking, inspect receipt and payment labels; update monthly rent through the owner UI. | Correct cash method and current display; monthly rent changes do not masquerade as a verified online payment. Log unexpected initial cash-upfront assumptions for review. |
| P07 | P0 | Student cancels approved unpaid PayMongo reservation; refresh owner/student and room state. | Cancelled status; protected slot released; no new occupant. |
| P08 | P1 | Reload/double-click Pay Now before completing payment. | Checkout remains tied to the same booking; no duplicate occupancy or incorrect paid state. |
| P09 | P0 | Print online and cash receipts; compare name, reference, room, dates, rent, advance/deposit, method, and total against the booking. | Legible receipt with matching details/amounts; print preview works. |
| P10 | P1 | On a separate no-booking fixture, choose No Advance, create a new booking, then inspect its move-in breakdown/receipt. | First Month Rent wording and correct minimum first-month rent calculation. No need to change terms on an existing booking. |
| P11 | P1 | Print a receipt with a long test name/address and apostrophe/ampersand. | Text remains readable and escaped; no broken HTML or script execution. |
| P12 | P1 | Try owner payment toggles on online-provider payment state. | Verified online move-in payment is protected; monthly rent remains its separate supported operation. |
| P13 | P2 | Authorized developer delivers/replays the same verified provider event and repeats verification. | One settlement/occupant only; evidence must come from the real verification path, not a manually set paid field. |
| P14 | P2 | Payment completes after student cancellation or after a room becomes ineligible. | Payment is recorded/flagged for review; no unauthorized/over-capacity occupancy or silent loss of paid funds. Record provider evidence; do not simulate live events as a groupmate. |
| P15 | P1 | Leave an approved online booking unpaid for more than an hour on a disposable fixture. | It is not assumed to auto-expire or gain an owner cancellation button. Those features are not implemented; resolve through the currently supported student cancellation path. |

## M. Non-CSPC occupants and separate payments

| ID | Priority | Setup / action | Expected result |
|---|---|---|---|
| M01 | P0 | Owner manually adds a valid non-CSPC boarder, monthly rent Not Paid and upfront Unpaid. | One manual occupant; monthly Rent Due and upfront not-collected/unpaid indication, not automatically collected cash. |
| M02 | P0 | Add a different boarder with monthly Paid and upfront Unpaid. | Monthly rent paid; upfront still uncollected. Separate obligations remain independent. |
| M03 | P0 | Add another with monthly Not Paid and upfront Paid; inspect desktop/mobile. | Upfront collected; monthly rent due. This combination is allowed. |
| M04 | P0 | Toggle monthly status, then toggle upfront status independently. | Only the intended obligation changes; reload preserves both choices. |
| M05 | P0 | Add to a room with no remaining places, including reserved online places. | Clear block; no extra occupant or misleading success message. |
| M06 | P1 | Leave optional phone/emergency/guardian fields blank; leave manual check-in blank and use a valid duration. | Existing optional/default behavior is preserved; no unexpected required-field failure. |
| M07 | P1 | Use a valid past manual check-in date on a disposable fixture. | Valid historical manual entry is supported; student future-date restriction is not copied onto manual occupants. |
| M08 | P1 | Submit invalid name, age, date, duration, or phone, then correct and retry. | Helpful correction message; one valid occupant after retry. |
| M09 | P1 | Double-click manual Save. | One occupant; loading state prevents repeated submission from that UI. |
| M10 | P2 | Developer supplies an older occupant with missing upfront history. | It is not incorrectly presented as a provider-verified payment. Record the actual wording/state and any legacy assumption separately. |

## C. Checkout and stay extensions

| ID | Priority | Setup / action | Expected result |
|---|---|---|---|
| C01 | P0 | Owner checks out a designated CSPC occupant. | Occupant becomes inactive; associated booking becomes completed; student is notified; slot becomes available. |
| C02 | P0 | Checked-out student tries a fresh booking. | Allowed if no other pending/confirmed booking or active occupancy remains. |
| C03 | P0 | Owner checks out a manual non-CSPC boarder. | Active occupancy decreases; record/history remains; no unrelated student booking changes. |
| C04 | P1 | Refresh/back/repeat after checkout. | No duplicate or unrelated checkout; counts remain correct. |
| C05 | P0 | Student with a confirmed booking requests a one-month extension. | Request awaits owner; official duration, rent total, and checkout date do not change before approval. |
| C06 | P0 | Owner approves C05; refresh both roles. | Duration/amount/checkout date update once; request flag resolves; student notified. |
| C07 | P0 | Request another extension; owner rejects it. | Existing approved dates/amount stay unchanged; request resolves with appropriate feedback. |
| C08 | P1 | Repeat extension request while one is pending; repeat approve/reject. | Duplicate/stale actions blocked; no double increase. |
| C09 | P1 | Attempt extension for cancelled/rejected/completed booking or invalid duration. | Blocked clearly; no date/amount changes. |
| C10 | P1 | Use a month-end check-in, such as January 31, on a permitted test fixture; compare calculated dates on review, bookings, and receipt. | Same calendar calculation across screens; shorter-month end is handled consistently. Do not change system time. |
| C11 | P2 | Developer tests oversized extension totals/year limits. | Clear correction message; no out-of-range database write or partial update. |
| C12 | P0 | Open admin's resident view. | Existing intended read-only/admin controls are preserved; do not assume admin is the normal checkout actor. |

## N. Notifications and reviews

| ID | Priority | Setup / action | Expected result |
|---|---|---|---|
| N01 | P0 | Submit application/booking and review each role's notification list. | Notifications reach the intended account with the correct property/reference. |
| N02 | P0 | Approve/reject, archive, pay, extend, and check out test records. | Corresponding notifications are understandable; no other owner's/student's private message appears. |
| N03 | P0 | Open/read a notification and refresh unread badge. | Read state persists; unread count matches the account's unread messages. |
| N04 | P1 | Follow any notification action/link that is actually offered. | Appropriate screen/context; flag misleading routing. Do not expect every message to have a deep link. |
| N05 | P0 | Eligible student with booking/residency history submits an integer star rating/comment. | Review appears on the correct property's student/admin review views. |
| N06 | P0 | Student with no eligible history tries reviewing another test property. | Review is denied; no review created. |
| N07 | P1 | Empty rating, oversized comment, repeated click, special characters, and mobile review modal. | Invalid values rejected; valid text displays safely; no duplicate review from a double-click. |
| N08 | P1 | Reload notification/review pages with no entries. | Understandable empty state; no runtime error. |

Email dispatch is disabled in the current defense setup. Do not fail notification cases merely because no email arrived; check in-app notifications.

## Q. Dashboards, reports, courses, users

| ID | Priority | Setup / action | Expected result |
|---|---|---|---|
| Q01 | P0 | Compare admin/owner dashboard counts against designated fixtures after approval, payment, manual add, checkout, and archival. | Counts reflect their stated definitions; approved unpaid reservations are not paid occupants. |
| Q02 | P0 | Open Masterlist, Compliance, Transactions, and Emergency Monitoring/registry views. | Relevant data load; names, property, room, dates, and payment labels are consistent with source records. |
| Q03 | P0 | Exercise each report's available filters/search, including no-result selections. | Correct filtered records and clear empty results; no silent filter loss. |
| Q04 | P0 | Print/export every report using the controls actually present. | Legible print preview/output; filters and column values preserved; no blank document. |
| Q05 | P1 | Check emergency/resident report for an archived property with retained active residents. | Residents are not silently lost because the property was unlisted; addresses/contacts match the records. |
| Q06 | P1 | Use small data sets and long test names/addresses; inspect charts, tables, totals. | No NaN/undefined, overlapping critical content, or incorrect empty totals. |
| Q07 | P1 | Admin creates/edits a disposable course, then tries a duplicate code and invalid department. | Valid edits persist; duplicate/invalid entries blocked clearly. |
| Q08 | P1 | Deactivate/reactivate a test course; try deleting a course referenced by a test student. | Course-choice availability changes appropriately; referenced course deletion is blocked; historical records remain. |
| Q09 | P0 | Admin edits a test user's name/contact/email; try another user's email. | Correct account updated; duplicate email blocked; other account unchanged. |
| Q10 | P1 | Search users and switch available role/status filters. | Correct records; no empty-data crash. |
| Q11 | P1 | Revisit reports after a save and refresh. | Current server values, not a stale pre-change snapshot. |

## V. Input validation matrix

For each row, first try invalid input on a disposable record, confirm the correction message/no successful save, then correct it and save a valid value. Native browser validation is a valid UI block. If a date browser only offers a calendar and cannot enter the malformed year, record that limitation; the developer must cover the backend case separately rather than asking you to alter production requests.

Do not mark every row Pass just because one date field was tested. Test the listed form(s). For multi-form rows, list each tested form in the Notes field.

| ID | Priority | Form / invalid input | Expected result |
|---|---|---|---|
| V01 | P0 | All standard permit expiry inputs: year `20226` and `0026`; repeat document update/custom expiry. | Real four-digit supported date required; no 500/save/upload persistence from the invalid request. |
| V02 | P0 | Student booking/manual check-in: malformed year and impossible date. | Correction message/browser block; malformed booking date is not silently replaced with today and submitted. |
| V03 | P1 | Calendar cases: Feb 29 in non-leap year, April 31; then a real leap-day date where the workflow permits it. | Impossible date rejected; real date accepted if its workflow date rules are also satisfied. |
| V04 | P0 | Valid expired permit date T-1 versus malformed year. | Real expired date follows compliance rules; malformed input is a validation error. |
| V05 | P0 | Property application/edit and room add/edit: negative rent. | Rejected; previous valid rent unchanged. |
| V06 | P1 | Rent with three decimal places; value exceeding PHP 99,999,999.99; then valid two-decimal rent. | Invalid precision/range blocked; valid monetary value persists accurately. |
| V07 | P1 | Blank room rent versus blank required property rent. | Room fallback works; required property rent is blocked. Zero room rent remains permitted by current rules; do not assume it means a fully paid stay. |
| V08 | P0 | Booking/manual duration: `0`, `-1`, and fractional months. | Positive whole duration required; no negative contract amount. |
| V09 | P1 | Very large duration/total; valid duration reaching an unsupported checkout year. | Supported date/amount limits enforced before a write. Developer assistance may be needed for upper-bound cases. |
| V10 | P0 | Manual/full names consisting only of spaces; blank required house/profile name. | Nonblank meaningful text required; no blank-looking record. |
| V11 | P1 | Names longer than 255 characters; room number longer than 50. | Clear field-length message; original record intact. |
| V12 | P0 | Negative/fractional age; valid age. | Whole supported age required; valid value saves. |
| V13 | P1 | Student DOB in future, implausibly old/young, malformed year, mismatch with displayed age. | DOB/age guidance; current auto-age calculation remains usable. |
| V14 | P0 | Student/owner/manual phone with wrong prefix or digit count; emergency contact separately. | Existing PH mobile format enforced; optional fields can remain blank where supported. |
| V15 | P1 | Property phone list, e.g. two valid numbers separated by `/`. | Supported property-contact list saves; it is not incorrectly restricted to one mobile number. |
| V16 | P1 | Property address over 255 characters; profile/description/feedback beyond stated text limit. | Clear limit message; no database truncation error. |
| V17 | P1 | Invalid map coordinates or unconfirmed edited address. | Correct map-pin guidance; existing valid location remains. Developer assists if coordinates cannot be edited directly. |
| V18 | P1 | Unsupported advance/deposit months/type. | Supported dropdown values required; normal 0/1/2 choices still save. |
| V19 | P1 | Unsupported booking method or monthly/upfront status. | Invalid choice rejected; cash/PayMongo and independent supported statuses still work. Use developer tests if UI prevents arbitrary choices. |
| V20 | P1 | Student ID over 50, course over 100, year/section over 50 characters. | Field-length guidance; no failed database save. |
| V21 | P1 | Admin user invalid/duplicate email; short new password; a password over 72 UTF-8 bytes. | Helpful rejection; existing credentials unchanged. Byte limits differ from character counts for emoji/non-ASCII text. |
| V22 | P1 | Whitespace/oversized course code/name or custom requirement label. | Clear feedback; no blank administrative entry. |
| V23 | P1 | Rating outside 1-5, fractional/nonnumeric rating; oversized comment. | Integer rating and comment limits enforced. Normal star UI may require backend-assisted negative tests. |
| V24 | P0 | Genuine supported JPG/PNG/WEBP, plus a genuine HEIC where available. | Normal uploads still work and display after reload. HEIC unavailable = Blocked for that variant, not Pass. |
| V25 | P1 | File over 10 MB; unsupported file; renamed non-image with `.jpg` extension. | Helpful upload/type/size feedback; no technical error page. Do not use malicious content. |
| V26 | P1 | Combined existing/new gallery exceeds ten; then exactly ten. | Too many blocked; valid ten retained without silent loss. |
| V27 | P1 | Replace one file, save, reload twice, then sign in again and inspect old/new unrelated files. | Replacement retained; other document/gallery/profile files remain accessible. |
| V28 | P2 | Developer tests arrays/objects instead of expected scalar fields, malformed JSON, invalid record IDs, and malformed photo/amenity lists. | Friendly 400 response before writes/storage; no unhandled technical response. Never put tokens into the results sheet. |

## U. Mobile, refresh, network, PWA

| ID | Priority | Setup / action | Expected result |
|---|---|---|---|
| U01 | P0 | Repeat details, booking/review modal, owner room/manual occupant modal, and admin review on Android and iPhone where available. | Essential text/buttons are visible, scrollable, and tappable; payment and occupancy labels remain clear. |
| U02 | P0 | Rotate phone; use narrow portrait and desktop widths. | No unusable horizontal overflow or clipped save/close controls. |
| U03 | P0 | Use each device's native date picker for a valid booking and permit date. | Correct calendar value is saved/displayed. Keyboard typing and dd/mm/yyyy placeholders may differ by browser; calendar-only input is not itself a defect. |
| U04 | P1 | Open/close/reopen modals; use browser Back/Forward and direct page URLs. | No trapped navigation, incorrect selected record, or stuck overlay. Record failures rather than assuming navigation is perfect. |
| U05 | P1 | Temporarily go offline while opening property details/booking. Reconnect and use Retry. | No fake empty successful property; clear fallback/error where supported, booking not submitted offline, retry recovers. Cached data must not be mistaken for verified availability. |
| U06 | P1 | Go offline during a disposable form save, then reconnect/reload before retrying. | Clear failure/uncertainty feedback; check whether it saved before retry; no duplicate record or stuck spinner. |
| U07 | P1 | Use slow network on login, uploads, listing/details, booking submission, and checkout start. | Loading feedback; no contradictory success/failure, double submission, or indefinite blank page. Record external provider delays separately. |
| U08 | P1 | Install PWA using the browser's supported control; launch from home screen, sign in, navigate. | Correct app screens/session behavior; no missing assets or broken navigation. If install unavailable, record device/browser and Blocked/N/A reason. |
| U09 | P1 | Open previously viewed pages offline in installed PWA; attempt a save. | No assumption that offline data are live; unsupported online saves fail understandably. Record stale/misleading behavior. |
| U10 | P0 | After deployment, open installed PWA and ordinary browser; refresh/relaunch and repeat a corrected validation/details case. | Both run the intended deployed behavior; no stale old bundle. Use the existing update prompt if offered; record any cache mismatch. |
| U11 | P1 | Refresh midway through an unsaved form, then repeat the workflow normally. | No server record without a completed save; user can resume through normal navigation. Unsaved form persistence is not assumed. |
| U12 | P0 | Desktop print preview and phone-readable receipt/report output. | Essential values visible; no blank output, clipped totals, or unreadable labels. |

## X. Coordinated/developer-assisted edge cases

These are important checks, not instructions to manipulate live records or provider messages.

| ID | Priority | Setup / action | Expected result |
|---|---|---|---|
| X01 | P1 | Same student submits two reservations in different sessions at nearly the same time. | One pending request only; other attempt blocked. |
| X02 | P1 | Room L has two different students' pending requests. Owner opens two approval sessions and approves simultaneously. | Only one consumes the single available slot; other approval blocked; no over-capacity occupancy/reservation. |
| X03 | P1 | Owner approves an online request while another session tries manual addition to the last slot. | At most one slot-consuming action succeeds; accurate remaining occupancy/reservation. |
| X04 | P1 | Student cancels while owner attempts approval of the same pending request. | One coherent final outcome; cancelled booking cannot also create an orphan active occupant. Log any mismatch. |
| X05 | P1 | Two owner sessions approve/reject the same extension nearly simultaneously. | One decision, no double duration/amount increase. |
| X06 | P2 | Developer tests authenticated cross-owner mutation with another property's/room's/document's ID. | Backend rejects independently of hidden UI controls; other records unchanged. |
| X07 | P2 | Developer inspects public responses and authenticated private document endpoints. | Public property data support the page; private permit-management data are role/ownership restricted. Direct file-link privacy is a separate known audit area, not proven by route checks. |
| X08 | P2 | Developer simulates upload-provider/database failure during application save with the existing mocked tests. | No partial committed property/gallery; formal retry response. Do not stop production services to reproduce this. |
| X09 | P2 | Developer checks schema prerequisites read-only on the deployment database. | Required deployed columns exist; no initialization dump or destructive setup script is run. |
| X10 | P2 | Developer runs the repository's offline test suite and frontend build at the exact release revision. | All tests/build pass; record revision and totals. These supplement—not replace—manual results. |

## How to report a failure

Send one report per issue, using this format:

```text
Case ID:
Tester / date and time:
Environment / deployed revision if known:
Role / test account alias (no password):
Device / browser:
Test property / room / booking reference:
Starting state:
Exact steps:
Expected result:
Actual result / exact on-screen message:
Did it persist after refresh?
Screenshot or short recording:
Network response status/message if available (omit Authorization/tokens):
Reproducible every time or intermittent?
Impact: blocks main flow / incorrect data or payment / confusing display / minor layout
```

For uncertain saves, refresh the appropriate list before submitting again. For financial or occupancy mismatches, stop further actions on that fixture and report the references to the project lead.

## Before declaring the build ready

- Every P0 case is Pass, or explicitly reviewed by the project lead with a documented reason and workaround. A blocked real payment test remains an unverified payment path.
- Valid-input workflows pass after the negative-input tests; no form stays permanently blocked/loading.
- Cross-role status, occupancy, amounts, files, and references agree after refresh.
- Local results and hosted results are recorded separately. A local Pass does not automatically mean hosted Pass.
- Record unresolved P1/P2 failures and limitations rather than hiding them. Prioritize reproducible workflow/data failures before cosmetic polish.
- Perform the coordinated defense rehearsal again on the exact hosted revision/device intended for defense.

This pack covers the major implemented workflows and regression risks identified in code. Passing it improves confidence; it is not a guarantee against every future dataset, provider outage, or security issue.
