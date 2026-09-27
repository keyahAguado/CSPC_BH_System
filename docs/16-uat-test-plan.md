# User Acceptance Testing (UAT) Plan

**Purpose:** a concrete checklist for designated ICTU/MIS/SASO testers to execute against a staging or live instance before final acceptance. Each row is a single testable action with a clear pass/fail outcome — record results in the **Result** column and note any issue found.

---

## Part 1 — Guest / Public Access
| # | Test Case | Expected Result | Result |
|---|---|---|---|
| 1.1 | Visit the landing page without logging in | Accredited listings display with photos, price, amenities | ☐ Pass ☐ Fail |
| 1.2 | Toggle to Map View | All accredited listings appear pinned on one map | ☐ Pass ☐ Fail |
| 1.3 | Open a listing as a guest | Full details, photos, reviews visible | ☐ Pass ☐ Fail |
| 1.4 | Click "Book Now" as a guest | Redirected/prompted to log in, booking action blocked | ☐ Pass ☐ Fail |

## Part 2 — Student Role
| # | Test Case | Expected Result | Result |
|---|---|---|---|
| 2.1 | Log in with a `@my.cspc.edu.ph` Google account | Login succeeds, redirected to Student Dashboard | ☐ Pass ☐ Fail |
| 2.2 | Log in with a non-CSPC Gmail account as a "student" | Login rejected (domain restriction) | ☐ Pass ☐ Fail |
| 2.3 | Complete profile (sex, course, emergency contact, etc.) | Saves successfully | ☐ Pass ☐ Fail |
| 2.4 | Filter listings by price and rating | Results narrow correctly | ☐ Pass ☐ Fail |
| 2.5 | Submit a cash booking request | Appears in My Bookings as "Pending Review" with requested check-in date shown | ☐ Pass ☐ Fail |
| 2.6 | Attempt a second booking while one is pending | Blocked with a clear message | ☐ Pass ☐ Fail |
| 2.7 | Cancel a pending booking | Removed from active list, status updates to Cancelled | ☐ Pass ☐ Fail |
| 2.8 | (After owner approval, cash) Confirm booking shows Confirmed | Status updates correctly | ☐ Pass ☐ Fail |
| 2.9 | Submit an online (PayMongo) booking, approve as owner, then cancel before paying | Cancellation succeeds (no payment finalized yet) | ☐ Pass ☐ Fail |
| 2.10 | Complete a PayMongo test payment | Booking becomes an active occupancy, receipt is printable | ☐ Pass ☐ Fail |
| 2.11 | Submit a review for a boarding house | Appears on the listing | ☐ Pass ☐ Fail |
| 2.12 | Leave the app idle for 30+ minutes, then try an action | Session has expired, redirected to login | ☐ Pass ☐ Fail |
| 2.13 | Install the app to home screen (mobile) or desktop (PWA) | Installs successfully, opens like a native app | ☐ Pass ☐ Fail |

## Part 3 — Owner Role
| # | Test Case | Expected Result | Result |
|---|---|---|---|
| 3.1 | Register a new owner account | Completes onboarding | ☐ Pass ☐ Fail |
| 3.2 | Submit accreditation application with all 8 documents and a GPS pin | Submission succeeds, appears in Admin's pending queue | ☐ Pass ☐ Fail |
| 3.3 | Attempt submission with an address typed but no pin confirmed | Blocked with a clear warning | ☐ Pass ☐ Fail |
| 3.4 | (After admin approval) Listing appears publicly | Visible on student/guest landing page | ☐ Pass ☐ Fail |
| 3.5 | Add a room with capacity and gender designation | Room appears, bookable by matching-sex students only | ☐ Pass ☐ Fail |
| 3.6 | Approve a pending cash booking | Student becomes an active occupant immediately | ☐ Pass ☐ Fail |
| 3.7 | Approve a pending PayMongo booking (unpaid) | Shows "Reserved — Awaiting Payment," not yet an occupant | ☐ Pass ☐ Fail |
| 3.8 | Check out an active resident | Room frees up, resident's booking shows Completed | ☐ Pass ☐ Fail |
| 3.9 | Let a critical permit (e.g. Fire Safety) expire (or simulate) | Listing auto-archives, owner notified | ☐ Pass ☐ Fail |
| 3.10 | Upload a renewed permit document | Compliance status updates immediately, not after a delay | ☐ Pass ☐ Fail |

## Part 4 — Admin Role
| # | Test Case | Expected Result | Result |
|---|---|---|---|
| 4.1 | Log in with an `@cspc.edu.ph` admin account | Succeeds | ☐ Pass ☐ Fail |
| 4.2 | Review and approve a new application | Owner notified, listing goes live | ☐ Pass ☐ Fail |
| 4.3 | Reject a document resubmission on an already-accredited house | Existing accreditation is preserved, only the resubmission is declined | ☐ Pass ☐ Fail |
| 4.4 | Manually archive a listing with a reason | Listing hidden from public view, data preserved, reason recorded | ☐ Pass ☐ Fail |
| 4.5 | Restore an archived listing | Reappears publicly | ☐ Pass ☐ Fail |
| 4.6 | Deactivate a user account | That account can no longer log in | ☐ Pass ☐ Fail |
| 4.7 | View Residency Registry, filter by barangay | Correct filtered resident list, including any archived-but-occupied houses | ☐ Pass ☐ Fail |
| 4.8 | Generate and print each of the 4 reports | Each renders correctly and prints/exports as PDF | ☐ Pass ☐ Fail |
| 4.9 | View Dashboard gender breakdown chart | Boys/Girls counts match the actual resident data | ☐ Pass ☐ Fail |

## Part 5 — Cross-Cutting
| # | Test Case | Expected Result | Result |
|---|---|---|---|
| 5.1 | Access an owner-only URL directly while logged in as a student | Blocked | ☐ Pass ☐ Fail |
| 5.2 | Test on both desktop and mobile browsers | Layout is usable on both | ☐ Pass ☐ Fail |
| 5.3 | Test with intermittent/offline connectivity (student browsing) | Previously-loaded listings remain viewable | ☐ Pass ☐ Fail |

---

## Sign-off
| Role | Name | Date | Signature |
|---|---|---|---|
| MIS Tester | | | |
| SASO Tester | | | |
| Development Team Representative | | | |

**Issues found during UAT should be logged separately and resolved (or explicitly accepted as known limitations) before proceeding to Final Acceptance.**
