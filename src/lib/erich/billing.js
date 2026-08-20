import { writeErichAuditLog } from "./audit.js";
import { assertCentAmount, assertCurrency } from "./money.js";
import { buildRegistrationChargeSummary } from "./registration-batches.js";
import { canManageOwnErichRecord } from "./permissions.js";
import { isValidEmail, normalizeEmail, normalizeSafeText } from "../security.js";

const DEFAULT_TAX_RATE_BASIS_POINTS = 0;
const BILLABLE_RACE_ENTRY_STATUSES = new Set(["ACTIVE"]);
const BILLABLE_TEAM_ENTRY_STATUSES = new Set(["ACTIVE", "TEMPORARY"]);

function structuredError({ code, message, details = {} }) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
}

function requireText(value, fieldName, maxLength = 160) {
    const normalized = normalizeSafeText(value, { maxLength });
    if (!normalized) {
        throw structuredError({
            code: "ERICH_BILLING_PROFILE_INVALID",
            message: `ERICH billing profile field ${fieldName} is required.`,
            details: { field: fieldName },
        });
    }
    return normalized;
}

function normalizeCountryCode(value) {
    const normalized = normalizeSafeText(value || "DE", { maxLength: 2 }).toUpperCase();
    if (!/^[A-Z]{2}$/.test(normalized)) {
        throw structuredError({
            code: "ERICH_BILLING_PROFILE_INVALID",
            message: "ERICH billing profile country code must use ISO-3166 alpha-2 format.",
            details: { field: "countryCode" },
        });
    }
    return normalized;
}

export function normalizeBillingProfileInput(input = {}) {
    const email = normalizeEmail(input.invoiceEmail ?? input.email);
    if (!isValidEmail(email)) {
        throw structuredError({
            code: "ERICH_BILLING_PROFILE_INVALID",
            message: "ERICH billing profile invoice email is invalid.",
            details: { field: "invoiceEmail" },
        });
    }

    const company = normalizeSafeText(input.company, { maxLength: 160 }) || null;

    return {
        recipient: company ? "COMPANY" : "PRIVATE",
        firstName: requireText(input.firstName, "firstName", 100),
        lastName: requireText(input.lastName, "lastName", 100),
        company,
        street: requireText(input.street, "street", 140),
        houseNumber: requireText(input.houseNumber, "houseNumber", 40),
        postalCode: requireText(input.postalCode, "postalCode", 20),
        city: requireText(input.city, "city", 120),
        countryCode: normalizeCountryCode(input.countryCode),
        invoiceEmail: email,
    };
}

export function createBillingProfileSnapshot(profile) {
    if (!profile?.id && !profile?.invoiceEmail) {
        throw new Error("billing profile is required.");
    }

    return {
        id: profile.id ?? null,
        recipient: profile.recipient,
        firstName: profile.firstName,
        lastName: profile.lastName,
        company: profile.company ?? null,
        street: profile.street,
        houseNumber: profile.houseNumber,
        postalCode: profile.postalCode,
        city: profile.city,
        countryCode: profile.countryCode,
        invoiceEmail: profile.invoiceEmail,
    };
}

export function buildErichInvoiceNumber({ eventSlug = "erich", sequence, issuedAt = new Date() }) {
    if (!Number.isInteger(sequence) || sequence <= 0) {
        throw new Error("invoice sequence must be a positive integer.");
    }

    const year = new Date(issuedAt).getUTCFullYear();
    const slug = normalizeSafeText(eventSlug, { maxLength: 40 })
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "ERICH";

    return `${slug}-${year}-${String(sequence).padStart(5, "0")}`;
}

export function calculateIncludedTax({ grossCents, taxRateBasisPoints = DEFAULT_TAX_RATE_BASIS_POINTS }) {
    const gross = assertCentAmount(grossCents, "grossCents");
    if (!Number.isInteger(taxRateBasisPoints) || taxRateBasisPoints < 0) {
        throw new Error("taxRateBasisPoints must be a non-negative integer.");
    }

    if (taxRateBasisPoints === 0 || gross === 0) {
        return {
            netCents: gross,
            taxCents: 0,
            grossCents: gross,
            taxRateBasisPoints,
        };
    }

    const netCents = Math.round((gross * 10000) / (10000 + taxRateBasisPoints));
    return {
        netCents,
        taxCents: gross - netCents,
        grossCents: gross,
        taxRateBasisPoints,
    };
}

function raceEntryDescription(entry) {
    const athleteName = [entry.athlete?.firstName, entry.athlete?.lastName].filter(Boolean).join(" ");
    const race = entry.raceDefinition;
    return [
        `Rennen ${entry.raceNumber}`,
        race?.classLabel,
        race?.distanceLabel,
        race?.gender,
        athleteName || null,
    ].filter(Boolean).join(" - ");
}

function teamEntryDescription(entry) {
    return [`Team Rennen ${entry.raceNumber}`, entry.teamName].filter(Boolean).join(" - ");
}

export function buildInvoiceLinesFromRegistrationBatch(batch, {
    taxRateBasisPoints = DEFAULT_TAX_RATE_BASIS_POINTS,
} = {}) {
    if (!batch?.id) throw new Error("registration batch is required.");

    const raceLines = (batch.raceEntries ?? [])
        .filter((entry) => BILLABLE_RACE_ENTRY_STATUSES.has(entry.status ?? "ACTIVE"))
        .map((entry) => {
            const grossCents = assertCentAmount(entry.priceCents, "raceEntry.priceCents");
            const tax = calculateIncludedTax({ grossCents, taxRateBasisPoints });
            return {
                raceEntryId: entry.id,
                teamEntryId: null,
                description: raceEntryDescription(entry),
                quantity: 1,
                unitGrossCents: grossCents,
                totalGrossCents: grossCents,
                taxRateBasisPoints: tax.taxRateBasisPoints,
                taxCents: tax.taxCents,
                netCents: tax.netCents,
            };
        });

    const teamLines = (batch.teamEntries ?? [])
        .filter((entry) => BILLABLE_TEAM_ENTRY_STATUSES.has(entry.status ?? "ACTIVE"))
        .map((entry) => {
            const grossCents = assertCentAmount(entry.priceCents, "teamEntry.priceCents");
            const tax = calculateIncludedTax({ grossCents, taxRateBasisPoints });
            return {
                raceEntryId: null,
                teamEntryId: entry.id,
                description: teamEntryDescription(entry),
                quantity: 1,
                unitGrossCents: grossCents,
                totalGrossCents: grossCents,
                taxRateBasisPoints: tax.taxRateBasisPoints,
                taxCents: tax.taxCents,
                netCents: tax.netCents,
            };
        });

    return [...raceLines, ...teamLines];
}

export function assertRegistrationBatchCanBeInvoiced(batch) {
    if (!batch?.id) throw new Error("registration batch is required.");

    if (batch.status !== "PAID") {
        throw structuredError({
            code: "ERICH_INVOICE_BATCH_NOT_PAID",
            message: "ERICH invoice can only be issued for paid registration batches.",
            details: { status: batch.status },
        });
    }

    if ((batch.invoices ?? []).length > 0) {
        throw structuredError({
            code: "ERICH_INVOICE_ALREADY_EXISTS",
            message: "ERICH invoice already exists for this registration batch.",
        });
    }

    return true;
}

export function buildInvoiceTotals(lines) {
    const totals = lines.reduce(
        (sum, line) => ({
            net: sum.net + assertCentAmount(line.netCents, "line.netCents"),
            tax: sum.tax + assertCentAmount(line.taxCents, "line.taxCents"),
            gross: sum.gross + assertCentAmount(line.totalGrossCents, "line.totalGrossCents"),
        }),
        { net: 0, tax: 0, gross: 0 }
    );

    if (totals.gross <= 0) {
        throw structuredError({
            code: "ERICH_INVOICE_EMPTY",
            message: "ERICH invoice requires at least one billable line.",
        });
    }

    return {
        totalNetCents: totals.net,
        totalTaxCents: totals.tax,
        totalGrossCents: totals.gross,
    };
}

export function buildInvoiceSnapshot({ event, batch, billingProfile, payment = null, lines, totals }) {
    return {
        schemaVersion: 1,
        event: {
            id: event?.id ?? batch.eventId,
            name: event?.name ?? null,
            slug: event?.slug ?? null,
            startsAt: event?.startsAt ?? null,
        },
        registrationBatch: {
            id: batch.id,
            status: batch.status,
            submittedAt: batch.submittedAt ?? null,
            paidAt: batch.paidAt ?? null,
        },
        billingProfile: createBillingProfileSnapshot(billingProfile),
        payment: payment
            ? {
                  id: payment.id,
                  provider: payment.provider,
                  amountCents: payment.amountCents,
                  feeCents: payment.feeCents,
                  currency: payment.currency,
                  status: payment.status,
              }
            : null,
        lines: lines.map((line) => ({
            raceEntryId: line.raceEntryId,
            teamEntryId: line.teamEntryId,
            description: line.description,
            quantity: line.quantity,
            unitGrossCents: line.unitGrossCents,
            totalGrossCents: line.totalGrossCents,
            taxRateBasisPoints: line.taxRateBasisPoints,
            taxCents: line.taxCents,
        })),
        totals,
    };
}

export function buildInvoiceCreateData({
    event,
    batch,
    billingProfile,
    payment = null,
    invoiceNumber,
    issuedAt = new Date(),
    taxRateBasisPoints = DEFAULT_TAX_RATE_BASIS_POINTS,
}) {
    assertRegistrationBatchCanBeInvoiced(batch);

    const lines = buildInvoiceLinesFromRegistrationBatch(batch, { taxRateBasisPoints });
    const totals = buildInvoiceTotals(lines);
    const currency = assertCurrency(batch.raceEntries?.[0]?.currency ?? batch.teamEntries?.[0]?.currency ?? "EUR");
    const snapshot = buildInvoiceSnapshot({ event, batch, billingProfile, payment, lines, totals });

    return {
        invoice: {
            registrationBatchId: batch.id,
            billingProfileId: billingProfile.id,
            paymentId: payment?.id ?? null,
            invoiceNumber,
            issuedAt,
            totalNetCents: totals.totalNetCents,
            totalTaxCents: totals.totalTaxCents,
            totalGrossCents: totals.totalGrossCents,
            currency,
            immutableSnapshot: snapshot,
            lines: {
                create: lines.map(({ netCents, ...line }) => line),
            },
        },
        lines,
        totals,
        snapshot,
    };
}

export async function createInvoiceForRegistrationBatch(store, {
    user,
    batchId,
    billingProfileInput,
    invoiceNumber,
    taxRateBasisPoints = DEFAULT_TAX_RATE_BASIS_POINTS,
    now = new Date(),
    auditReason = "Issue ERICH invoice for paid registration batch",
}) {
    if (!user?.id) throw new Error("user is required.");
    if (!batchId) throw new Error("batchId is required.");

    return store.$transaction(async (tx) => {
        const batch = await tx.erichRegistrationBatch.findUnique({
            where: { id: batchId },
            include: {
                event: true,
                raceEntries: {
                    include: {
                        athlete: true,
                        raceDefinition: true,
                    },
                    orderBy: [{ raceNumber: "asc" }, { createdAt: "asc" }],
                },
                teamEntries: {
                    orderBy: [{ raceNumber: "asc" }, { createdAt: "asc" }],
                },
                payments: {
                    where: { status: "SUCCESSFUL" },
                    orderBy: { updatedAt: "desc" },
                    take: 1,
                },
                invoices: {
                    select: { id: true, invoiceNumber: true },
                    take: 1,
                },
            },
        });

        if (!batch) {
            throw structuredError({
                code: "ERICH_REGISTRATION_BATCH_NOT_FOUND",
                message: "ERICH registration batch was not found.",
            });
        }

        if (!canManageOwnErichRecord(user, batch)) {
            throw structuredError({
                code: "ERICH_REGISTRATION_BATCH_NOT_FOUND",
                message: "ERICH registration batch was not found.",
            });
        }

        const normalizedProfile = normalizeBillingProfileInput(billingProfileInput);
        const billingProfile = await tx.erichBillingProfile.create({
            data: {
                ...normalizedProfile,
                accountId: batch.accountId,
                registrationBatchId: batch.id,
            },
        });

        const selectedPayment = batch.payments?.[0] ?? null;
        const invoiceData = buildInvoiceCreateData({
            event: batch.event,
            batch,
            billingProfile,
            payment: selectedPayment,
            invoiceNumber,
            issuedAt: now,
            taxRateBasisPoints,
        });

        const invoice = await tx.erichInvoice.create({
            data: invoiceData.invoice,
            include: { lines: true },
        });

        await writeErichAuditLog({
            store: tx,
            eventId: batch.eventId,
            actorId: user.id,
            entityType: "ErichInvoice",
            entityId: invoice.id,
            action: "invoice.issued",
            reason: auditReason,
            oldValue: null,
            newValue: {
                invoiceNumber: invoice.invoiceNumber,
                registrationBatchId: batch.id,
                totalGrossCents: invoice.totalGrossCents,
                currency: invoice.currency,
            },
        });

        return { invoice, billingProfile, snapshot: invoiceData.snapshot };
    });
}

