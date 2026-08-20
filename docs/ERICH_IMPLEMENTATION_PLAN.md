# ERICH implementation plan

Status: draft for technical alignment.
Date: 2026-07-19.
Base project: GateKeeper.

## Objective

Build the European Rowing Indoor Championships registration system on top of the existing GateKeeper codebase without weakening the financial, eligibility, audit, and data protection requirements.

GateKeeper remains the technical foundation for authentication, admin shell, environment validation, basic payment/webhook patterns, QR/scanner primitives, system events, rate limiting, and test infrastructure. ERICH gets its own explicit domain model instead of stretching the existing generic event booking model beyond its fit.

## Current GateKeeper assets to reuse

- Next.js application shell and route structure.
- Prisma and PostgreSQL migration workflow.
- Supabase authentication integration.
- Production environment validation in `src/lib/env.js`.
- System status and operational event patterns.
- Existing security helpers and request body validation.
- Rate limiting infrastructure.
- Existing booking payment transition pattern in `src/lib/payment-state.js`.
- PayPal webhook verification pattern and idempotent processing tests.
- QR and scanner link primitives.
- Existing test runner and node test style.

## Current GateKeeper gaps for ERICH

- Existing `Event`, `Booking`, and `EventTicketType` models are generic ticketing models, not rowing registration models.
- Existing money fields use `Float`; ERICH money must be stored as integer cents.
- Existing roles are `VISITOR`, `ORGANIZER`, and `ADMIN`; ERICH requires least-privilege roles such as user, administrator, registration office, and scanner.
- Existing audit is event-oriented and not sufficient for critical ERICH changes with old value, new value, reason, actor, and impact.
- Existing scanner flow is online booking check-in, not offline-capable event document issue with encrypted snapshots and conflict sync.
- Existing payment integration is PayPal-specific and not yet suitable as the final PSP abstraction.
- Existing invoice, credit note, license import, club import, race eligibility, team entry, and export models do not exist.

## Guiding implementation decision

Do not replace GateKeeper with a new stack.

Use the existing Next.js + Prisma + PostgreSQL foundation, but introduce ERICH as a bounded domain area:

- `src/lib/erich/*` for domain logic.
- `src/app/erich/*` for user-facing registration UI.
- `src/app/admin/erich/*` for administrative workflows.
- `src/app/api/erich/*` for server APIs.
- ERICH-specific Prisma models instead of reusing `Booking` as the primary registration entity.

Existing generic GateKeeper models may be referenced or gradually bridged where useful, but they must not become the source of truth for ERICH race entries, prices, eligibility, invoices, or tickets.

## Initial ERICH domain model

The first migration should introduce only the foundation needed to model races, athletes, registrations, prices, and audit safely. Payment-provider-specific and offline-sync-specific tables can follow after the core invariants are testable.

### Core identity and roles

- Extend or map `User.role` to support ERICH permissions.
- Add explicit ERICH permission checks rather than relying only on broad global roles.
- Required roles:
  - `USER`
  - `ADMIN`
  - `REGISTRATION_OFFICE`
  - `SCANNER`

Open decision: whether to replace the current `Role` enum or add ERICH-specific role/permission tables. Recommendation: add permission tables or ERICH role assignments first, then migrate global roles later if needed.

### Event and master data

Entities:

- `ErichEvent`
- `ErichChampionship`
- `ErichClub`
- `ErichClubImport`
- `ErichRaceDefinition`
- `ErichRaceVersion`
- `ErichRaceEligibilityRule`
- `ErichPricePhase`
- `ErichRacePrice`

Key rules:

- Race numbers are business attributes, not primary keys.
- Race definitions are versioned.
- The initial Excel import creates editable master data.
- Championship flags from `Rennauswertung` are stored as explicit fields.
- Race activation is blocked when mandatory rules or prices are unclear.

### People and registrations

Entities:

- `ErichAthlete`
- `ErichTrainer`
- `ErichRegistrationBatch`
- `ErichRaceEntry`
- `ErichRaceEntryValuation`
- `ErichTeamEntry`
- `ErichTeamMember`

Key rules:

- Account and athlete are separate records.
- An athlete can be the account holder, but does not have to be.
- `birthYear` is derived and indexed.
- German license number is a string.
- Target time belongs to the race entry and is also stored as sortable milliseconds.
- Unique constraint: athlete + event + race number.
- Paid entries are immutable for user-facing edits.

### Financial records

Entities:

- `ErichBillingProfile`
- `ErichPayment`
- `ErichPaymentAttempt`
- `ErichPaymentWebhook`
- `ErichInvoice`
- `ErichInvoiceLine`
- `ErichCreditNote`
- `ErichRefundCase`

Key rules:

- All amounts use integer cent fields.
- Payment state is separate from registration state.
- Webhooks are uniquely processed by provider and webhook event id.
- Invoices are immutable after issue.
- Credit notes create new records and never overwrite invoices.

### Eligibility, tickets, and documents

Entities:

- `ErichLicenseImport`
- `ErichLicenseRecord`
- `ErichEligibilityDecision`
- `ErichTicket`
- `ErichTicketReplacement`
- `ErichCheckIn`
- `ErichDocumentIssue`
- `ErichScheduleAssignment`
- `ErichConsentDocument`
- `ErichConsentAcceptance`
- `ErichEmailMessage`
- `ErichExportJob`
- `ErichImportJob`
- `ErichAuditLog`
- `ErichFileAsset`
- `ErichSystemConfiguration`

Key rules:

- Tickets contain only random non-guessable ticket ids.
- Scanner role sees only reduced check-in data.
- Document issue is idempotent and auditable.
- License import structure is configurable and not hard-coded.
- Sensitive fields such as parasport status are excluded from generic logs and exports.

## Excel findings to encode as migration/import tests

Source workbook: `Aufstellung_Alterklassen_Strecken_Startgeld.xlsx`.

Relevant sheets:

- `Rennauswertung`
- `Startgeld`
- `Formular`

Findings:

- 169 unique race numbers exist, 1 through 169.
- No duplicate race numbers were found.
- 12 race numbers have no primary race definition in the main `Rennauswertung` columns: 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32.
- Race 132 exists as `Freizeit-Vierer (Fitness + Firmen)` but no price was found in `Startgeld`.
- Race 169 exists as `SpecialOlympics`, M/W, 500 m, MDM, but no price was found in `Startgeld`.
- Known base price triples:
  - ERICH: 2800, 3400, 4000 cents.
  - DM: 1400, 1700, 2000 cents.
  - MDM: 1050, 1275, 1500 cents.
- Known team price triples:
  - MDM four: 4200, 5100, 6000 cents.
  - MDM eight: 8400, 10200, 12000 cents.
  - DM eight: 11200, 13600, 16000 cents.

These unclear rows must be imported as inactive or review-required, not silently activated.

## First implementation priorities

### Priority 1: ERICH schema foundation

Create the first ERICH Prisma migration with:

- event, championship, club, race, price, athlete, registration batch, race entry, valuation, team, billing, audit, and import job foundations;
- integer cent money fields only;
- explicit status enums;
- unique constraints for duplicate race entries, invoices, webhooks, ticket ids, and document issue;
- indexes for search and operational dashboards.

Acceptance criteria:

- `prisma generate` succeeds.
- Migration applies locally.
- Tests verify that duplicate athlete + event + race number race entries are rejected.
- Tests verify money values are integer cents.
- Tests verify inactive/review-required races cannot be registered.

### Priority 2: Excel import parser and master-data dry run

Create a development import script or library that reads `Rennauswertung` and `Startgeld` and produces normalized JSON for review.

Acceptance criteria:

- 169 race numbers are detected.
- Championship flags are preserved.
- Missing primary race definitions are reported.
- Missing prices are reported.
- Prices are emitted as cents.
- No text-derived runtime rules are treated as final eligibility rules.

### Priority 3: Race and price engine tests

Implement pure domain functions before UI:

- championship valuation determination;
- price basis determination;
- target-time parsing to milliseconds;
- duplicate-entry rejection strategy;
- high-level eligibility result shape with reasons.

Acceptance criteria:

- ERICH/DM/MDM price priority is tested.
- Multiple valuations do not multiply price.
- Target times are sortable milliseconds.
- ineligible races return structured reasons.

### Priority 4: ERICH permission and audit layer

Introduce ERICH-specific permission helpers and audit functions.

Acceptance criteria:

- user sees only own ERICH data.
- scanner sees only reduced check-in data.
- registration office cannot manage system administrators.
- admin critical changes require reason.
- audit entries include actor, timestamp, entity, action, old value, new value, and reason.

### Priority 5: Registration batch flow without live payment

Build the user-facing registration data flow only after the schema and engine are stable.

Acceptance criteria:

- account can create athletes;
- eligible races are suggested;
- race entries require target times;
- summaries show expected valuations;
- final checkout can be simulated without real PSP.

## Blockers not to implement around

- Exact price phase dates.
- Exact registration period.
- Race rules for unclear race numbers.
- Race 132 and race 169 prices.
- Full team rule matrix.
- Payment provider decision.
- Legal decision on payment fee pass-through.
- Sportwerk invoice and tax data.
- Storage periods.
- Hosting location and RPO/RTO.
- Final start document fields.

## Test strategy

Use pure domain tests first, then integration tests.

Required first test files:

- `tests/erich-money.test.mjs`
- `tests/erich-excel-import.test.mjs`
- `tests/erich-race-pricing.test.mjs`
- `tests/erich-race-entry-constraints.test.mjs`
- `tests/erich-permissions.test.mjs`

Do not use production personal data in tests. Synthetic athletes, clubs, and race data only.

## Immediate next task

Implement Priority 1:

1. Add ERICH Prisma models and enums.
2. Generate a migration.
3. Add focused tests for duplicate race entries, integer cent amounts, and inactive races.
4. Run `npm test`.

