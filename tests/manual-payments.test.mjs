import assert from "node:assert/strict";
import test from "node:test";
import {
    createPaymentReference,
    formatManualPaymentDueDate,
    getManualPaymentDetails,
    getManualPaymentDueDate,
    isManualPaymentMethod,
    normalizePaymentMethod,
} from "../src/lib/manual-payments.js";

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
});

test("normalizePaymentMethod accepts supported methods and falls back for unknown values", () => {
    assert.equal(normalizePaymentMethod("paypal"), "PAYPAL");
    assert.equal(normalizePaymentMethod(" invoice "), "INVOICE");
    assert.equal(normalizePaymentMethod("bank_transfer"), "BANK_TRANSFER");
    assert.equal(normalizePaymentMethod("cash"), "STRIPE");
    assert.equal(normalizePaymentMethod(null, "INVOICE"), "INVOICE");
});

test("createPaymentReference creates stable short booking references", () => {
    assert.equal(createPaymentReference("booking-abcdef-123"), "GK-BOOKING-");
    assert.equal(createPaymentReference("abc123"), "GK-ABC123");
});

test("isManualPaymentMethod identifies invoice and bank transfer only", () => {
    assert.equal(isManualPaymentMethod("INVOICE"), true);
    assert.equal(isManualPaymentMethod("BANK_TRANSFER"), true);
    assert.equal(isManualPaymentMethod("PAYPAL"), false);
});

test("manual payment due date is fourteen days after creation", () => {
    const createdAt = new Date("2026-07-13T10:00:00.000Z");
    const dueDate = getManualPaymentDueDate(createdAt);

    assert.equal(dueDate.toISOString(), "2026-07-27T10:00:00.000Z");
    assert.equal(formatManualPaymentDueDate(createdAt), "27.07.2026");
});

test("getManualPaymentDetails uses configured bank details without leaking defaults", () => {
    process.env.BANK_TRANSFER_IBAN = "DE00000000000000000000";
    process.env.BANK_TRANSFER_BIC = "EXAMPLED0";
    process.env.BANK_TRANSFER_ACCOUNT_HOLDER = "GateKeeper GmbH";

    const details = getManualPaymentDetails({
        booking: {
            paymentMethod: "BANK_TRANSFER",
            paymentReference: "GK-BOOKING1",
            createdAt: new Date("2026-07-13T10:00:00.000Z"),
        },
        event: { owner: { name: "Event Owner" } },
    });

    assert.deepEqual(details, {
        paymentMethod: "BANK_TRANSFER",
        paymentMethodLabel: "Bank\u00fcberweisung",
        paymentReference: "GK-BOOKING1",
        dueDate: "27.07.2026",
        iban: "DE00000000000000000000",
        bic: "EXAMPLED0",
        accountHolder: "GateKeeper GmbH",
    });
});

test("getManualPaymentDetails falls back to event owner for account holder", () => {
    delete process.env.BANK_TRANSFER_ACCOUNT_HOLDER;

    const details = getManualPaymentDetails({
        booking: {
            paymentMethod: "INVOICE",
            paymentReference: "GK-BOOKING2",
            createdAt: new Date("2026-07-13T10:00:00.000Z"),
        },
        event: { owner: { name: "Organizer Name" } },
    });

    assert.equal(details.paymentMethodLabel, "Rechnung");
    assert.equal(details.accountHolder, "Organizer Name");
});
