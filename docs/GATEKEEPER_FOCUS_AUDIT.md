# GateKeeper Focus Audit

Date: 2026-08-17

Goal: focus GateKeeper on independent organizers who run recurring events and need fast, reliable ticketing administration.

## Decision Matrix

| Function | Current Status | Decision | Reason |
| --- | --- | --- | --- |
| Organizer accounts and organizations | Present via `User`, `Organization`, `OrganizationMember` | KEEP | Core product area for recurring organizers and teams. |
| Organization billing/contact defaults | Partial: user billing exists, organization has limited profile fields | MISSING | Organizers need reusable company/contact defaults beyond a name/description. |
| Event creation | Present | REWORK | Useful, but default publish is too eager and form is still discovery/category oriented. |
| Event duplication | Present via `/api/events/[id]/duplicate` and edit UI | KEEP / REWORK | Strategic core exists and copies event + ticket types as draft, but should support date-first duplication UX and reusable defaults. |
| Event series | Not present | MISSING | Needed later for recurring formats; duplicate-first is the right MVP step. |
| Ticket types | Present via `EventTicketType` | REWORK | Name, price, quota, order and max-per-booking exist; sales windows and active/inactive are missing. |
| Ticket phases | Partial through multiple ticket types | SIMPLIFY | Keep phase support as ordered ticket types; avoid complex phase engine for now. |
| Promo codes | Not present | MISSING | Important low-complexity ticketing feature. |
| Guest list / free tickets | Not present as dedicated feature | MISSING | Important operational organizer workflow; free bookings exist but no guestlist workflow. |
| Guest checkout | Present | REWORK | Buyers can buy without account, but billing address is mandatory and too much friction for normal ticket checkout. |
| Payment methods | Present: PayPal, Stripe, invoice, bank transfer | KEEP | Existing provider work should stay. |
| Payment state transitions | Present in `payment-state.js` | KEEP / REWORK | Good idempotent transitions and reservation release, but order/ticket modeling is too coarse. |
| Refunds | Present | KEEP / REWORK | Full refunds exist; partial refunds and per-ticket invalidation require ticket entity work. |
| Orders/bookings | Present as `Booking` | REWORK | Works for current flow, but one booking can contain quantity > 1 without individual ticket records. |
| Individual tickets | Missing for GateKeeper | MISSING | Required for per-ticket QR, status, partial refund, and individual scan accuracy. |
| QR ticket delivery | Present via signed code, success page, email PDF | KEEP / REWORK | Useful, but QR represents booking, not individual ticket. |
| Check-in | Present with mobile scanner, signed code verification, scanner links, duplicate detection | KEEP / REWORK | Strong base; needs per-ticket model and offline-readiness later. |
| Offline check-in | Not present for GateKeeper | MISSING | Long-term important; document/prep before full offline sync. |
| Dashboard | Present but broad | SIMPLIFY | Too many stats and links; should focus on today, upcoming events, sales, check-ins. |
| Analytics/reporting | Present | SIMPLIFY | Keep event performance, but reduce discovery metrics and add ticket type/refund/promo/no-show focus. |
| Buyer management | Present as CRM | SIMPLIFY / DISABLE | Search/export buyer history is useful; notes/tasks are not MVP. |
| CRM notes/tasks | Present | DISABLE | Full CRM/tasks are outside focused ticketing MVP. |
| Discovery pages | Present: home feed, cities, venues, favorites, alerts, recommendations | SIMPLIFY / DISABLE | Public event pages can stay; B2C feed, alerts and personalization are not core. |
| Recommendations/signals | Present | DISABLE | Not MVP and distracts from reliability. |
| Favorites/search alerts | Present | DISABLE | Consumer retention feature, not core recurring-organizer workflow. |
| Venues | Present | KEEP / SIMPLIFY | Reusable venues help recurring organizers; keep management simple. |
| Team roles | Present via org/event roles | REWORK | Existing roles are close, but should map clearly to OWNER, ADMIN, CHECK-IN. |
| Admin/system pages | Present | KEEP | Needed for reliability, trust, users, payments and diagnostics. |
| ERICH special registration area | Present and large | DISABLE from core nav | Domain-specific feature is valuable only as separate vertical, not GateKeeper MVP surface. |
| Event recommendation API | Present | DISABLE | Outside MVP. |
| Fee calculation | Present but zero GateKeeper fee | REWORK | Must become central 4.9% + 0.49 EUR, with free tickets = 0 and tests. |
| Payment provider fee estimates | Present | KEEP / REWORK | Useful, but separate from GateKeeper product fee source of truth. |
| Rate limiting/security helpers | Present | KEEP | Important for auth, bookings and scanning. |
| Mail delivery | Present with Resend/SMTP fallback | KEEP / REWORK | Critical; current live blocker is provider configuration. |
| Event audit log | Present | KEEP | Good for reliability and support. |
| Exports | Partial: scan CSV, admin payment export | REWORK | Add focused buyer/order/event report exports later. |

## Highest-Risk Gaps

1. GateKeeper has no individual `Ticket` model; a booking with `quantity: 2` scans as one unit.
2. Checkout requires full billing address, which conflicts with low-friction ticket checkout.
3. GateKeeper fee is hardcoded to zero in booking totals and UI messaging.
4. Promo codes and guestlist/free-ticket workflows are missing.
5. Main navigation and dashboard still present GateKeeper as discovery/social/CRM-heavy.
6. Offline check-in is not implemented for GateKeeper.
7. The feature branch `origin/feature/gatekeeper` contains nested `gatekeeper/` changes and should not be merged blindly.

## Implementation Order

1. Remove non-core navigation and dashboard shortcuts from the active product surface.
2. Make event creation draft-first and duplicate-first for recurring organizers.
3. Centralize GateKeeper fee calculation and update tests/UI.
4. Add individual ticket records and migrate QR/check-in/refund logic to tickets.
5. Add guestlist/free-ticket workflow.
6. Add simple promo codes.
7. Simplify reports around sales, check-ins, no-shows, refunds and ticket types.
8. Prepare offline check-in architecture notes and sync constraints.
