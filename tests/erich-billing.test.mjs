import assert from "node:assert/strict";
import { test } from "node:test";

import {
    buildErichInvoiceNumber,
    buildInvoiceCreateData,
    calculateIncludedTax,
    createInvoiceForRegistrationBatch,
    normalizeBillingProfileInput,
} from "../src/lib/erich/billing.js";

const now = new Date("2026-09-01T10:00:00.000Z");
const user = { id: "user-1", role: "VISITOR", erichRoleAssignments: [] };

function paidBatch(overrides = {}) {
    return {
        id: "batch-1",
        eventId: "event-1",
        accountId: "user-1",
        status: "PAID",
        submittedAt: new Date("2026-09-01T09:30:00.000Z"),
        paidAt: now,
        event: {
            id: "event-1",
            name: "European Rowing Indoor Championships",
            slug: "erich-2026",
            startsAt: new Date("2026-12-12T09:00:00.000Z"),
        },
        raceEntries: [
            {
                id: "entry-1",
                athleteId: "athlete-1",
                raceNumber: 101,
                status: "ACTIVE",
                priceCents: 4000,
                currency: "EUR",
                athlete: { firstName: "Ada", lastName: "Lovelace" },
                raceDefinition: {
                    classLabel: "Open",
                    distanceLabel: "2000 m",
                    gender: "W",
                },
            },
            {
                id: "entry-cancelled",
                athleteId: "athlete-1",
                raceNumber: 102,
                status: "CANCELLED",
                priceCents: 4000,
                currency: "EUR",
            },
        ],
        teamEntries: [],
        payments: [
            {
                id: "payment-1",
                provider: "SIMULATED",
                amountCents: 4000,
                feeCents: 0,
                currency: "EUR",
                status: "SUCCESSFUL",
            },
        ],
        invoices: [],
        ...overrides,
    };
}

function billingProfile(overrides = {}) {
    return {
        id: "billing-1",
        recipient: "PRIVATE",
        firstName: "Ada",
        lastName: "Lovelace",
        company: null,
        street: "Main Street",
        houseNumber: "1",
        postalCode: "01067",
        city: "Dresden",
        countryCode: "DE",
        invoiceEmail: "ada@example.com",
        ...overrides,
    };
}

test("ERICH billing profile input normalizes invoice recipients", () => {
    assert.deepEqual(
        normalizeBillingProfileInput({
            firstName: " Ada ",
            lastName: " Lovelace ",
            company: " Analytical Engines Ltd ",
            street: " Main Street ",
            houseNumber: " 1a ",
            postalCode: " 01067 ",
            city: " Dresden ",
            countryCode: " de ",
            invoiceEmail: " ADA@EXAMPLE.COM ",
        }),
        {
            recipient: "COMPANY",
            firstName: "Ada",
            lastName: "Lovelace",
            company: "Analytical Engines Ltd",
            street: "Main Street",
            houseNumber: "1a",
            postalCode: "01067",
            city: "Dresden",
            countryCode: "DE",
            invoiceEmail: "ada@example.com",
        }
    );

    assert.throws(
        () => normalizeBillingProfileInput({ invoiceEmail: "broken" }),
        (error) => {
            assert.equal(error.code, "ERICH_BILLING_PROFILE_INVALID");
            return true;
        }
    );
});

test("ERICH invoice numbers are stable and scoped by event slug", () => {
    assert.equal(
        buildErichInvoiceNumber({
            eventSlug: "erich 2026",
            sequence: 12,
            issuedAt: now,
        }),
        "ERICH-2026-2026-00012"
    );
});

test("ERICH invoice data snapshots paid batch lines without cancelled entries", () => {
    const invoiceData = buildInvoiceCreateData({
        event: paidBatch().event,
        batch: paidBatch(),
        billingProfile: billingProfile(),
        payment: paidBatch().payments[0],
        invoiceNumber: "ERICH-2026-00001",
        issuedAt: now,
        taxRateBasisPoints: 1900,
    });

    assert.equal(invoiceData.lines.length, 1);
    assert.equal(invoiceData.invoice.totalGrossCents, 4000);
    assert.equal(invoiceData.invoice.totalNetCents, 3361);
    assert.equal(invoiceData.invoice.totalTaxCents, 639);
    assert.equal(invoiceData.invoice.lines.create[0].description, "Rennen 101 - Open - 2000 m - W - Ada Lovelace");
    assert.equal(invoiceData.snapshot.billingProfile.invoiceEmail, "ada@example.com");
    assert.equal(invoiceData.snapshot.payment.provider, "SIMULATED");
});

test("ERICH invoice creation refuses unpaid or already invoiced batches", () => {
    assert.throws(
        () =>
            buildInvoiceCreateData({
                event: paidBatch().event,
                batch: paidBatch({ status: "CHECKOUT" }),
                billingProfile: billingProfile(),
                invoiceNumber: "ERICH-2026-00001",
            }),
        (error) => {
            assert.equal(error.code, "ERICH_INVOICE_BATCH_NOT_PAID");
            return true;
        }
    );

    assert.throws(
        () =>
            buildInvoiceCreateData({
                event: paidBatch().event,
                batch: paidBatch({ invoices: [{ id: "invoice-existing" }] }),
                billingProfile: billingProfile(),
                invoiceNumber: "ERICH-2026-00001",
            }),
        (error) => {
            assert.equal(error.code, "ERICH_INVOICE_ALREADY_EXISTS");
            return true;
        }
    );
});

test("ERICH included tax calculation keeps cent totals stable", () => {
    assert.deepEqual(calculateIncludedTax({ grossCents: 11900, taxRateBasisPoints: 1900 }), {
        netCents: 10000,
        taxCents: 1900,
        grossCents: 11900,
        taxRateBasisPoints: 1900,
    });
});

test("ERICH invoice service writes profile, immutable invoice and audit in a transaction", async () => {
    const calls = [];
    const state = { batch: paidBatch(), profile: null, invoice: null };
    const store = {
        calls,
        erichRegistrationBatch: {
            findUnique: async (args) => {
                calls.push(["erichRegistrationBatch.findUnique", args]);
                return state.batch;
            },
        },
        erichBillingProfile: {
            create: async (args) => {
                calls.push(["erichBillingProfile.create", args]);
                state.profile = { id: "billing-created", ...args.data };
                return state.profile;
            },
        },
        erichInvoice: {
            create: async (args) => {
                calls.push(["erichInvoice.create", args]);
                state.invoice = {
                    id: "invoice-1",
                    ...args.data,
                    lines: args.data.lines.create,
                };
                return state.invoice;
            },
        },
        erichAuditLog: {
            create: async (args) => {
                calls.push(["erichAuditLog.create", args]);
                return { id: "audit-1", ...args.data };
            },
        },
        $transaction: async (callback) => callback(store),
    };

    const result = await createInvoiceForRegistrationBatch(store, {
        user,
        batchId: "batch-1",
        billingProfileInput: {
            firstName: "Ada",
            lastName: "Lovelace",
            street: "Main Street",
            houseNumber: "1",
            postalCode: "01067",
            city: "Dresden",
            invoiceEmail: "ada@example.com",
        },
        invoiceNumber: "ERICH-2026-00001",
        now,
    });

    assert.equal(result.invoice.id, "invoice-1");
    assert.equal(result.billingProfile.registrationBatchId, "batch-1");
    assert.equal(result.invoice.immutableSnapshot.registrationBatch.id, "batch-1");
    assert.deepEqual(
        calls.map(([name]) => name),
        [
            "erichRegistrationBatch.findUnique",
            "erichBillingProfile.create",
            "erichInvoice.create",
            "erichAuditLog.create",
        ]
    );
});

