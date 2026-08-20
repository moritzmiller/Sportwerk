import assert from "node:assert/strict";
import test from "node:test";

import {
    buildLedgerEntries,
    buildPaymentProviderRequest,
    centsToEuros,
    createPaymentIdempotencyKey,
    createWebhookDedupeKey,
    eurosToCents,
    validatePaymentProviderAdapter,
} from "../src/lib/payments/domain.js";

test("money helpers convert via cents without floating point leakage", () => {
    assert.equal(eurosToCents(10.235), 1024);
    assert.equal(centsToEuros(1024), 10.24);
});

test("payment idempotency keys are provider neutral and stable per booking", () => {
    assert.equal(
        createPaymentIdempotencyKey({
            bookingId: "booking_123",
            provider: "stripe",
        }),
        "gatekeeper:stripe:checkout:booking_123"
    );
    assert.equal(createWebhookDedupeKey("mollie", "evt_1"), "MOLLIE:evt_1");
});

test("provider request uses Gatekeeper identifiers and explicit idempotency", () => {
    const request = buildPaymentProviderRequest({
        booking: { id: "booking_123", eventId: 42 },
        provider: "mollie",
        method: "STRIPE",
        amountCents: 3050,
        returnUrl: "https://example.test/return",
        cancelUrl: "https://example.test/cancel",
    });

    assert.equal(request.provider, "MOLLIE");
    assert.equal(request.bookingId, "booking_123");
    assert.equal(request.amountCents, 3050);
    assert.equal(request.currency, "EUR");
    assert.equal(request.idempotencyKey, "gatekeeper:mollie:checkout:booking_123");
    assert.equal(request.webhookUrl, undefined);
    assert.match(request.gatekeeperPaymentId, /^gkp_[a-f0-9]{32}$/);
    assert.deepEqual(request.metadata, {
        bookingId: "booking_123",
        eventId: 42,
    });
});

test("ledger entries balance gross, provider fee, Gatekeeper fee and organizer net", () => {
    const entries = buildLedgerEntries({
        paymentId: "pay_123",
        bookingId: "booking_123",
        amountCents: 3000,
        providerFeeCents: 70,
        gatekeeperFeeCents: 196,
    });

    assert.deepEqual(
        entries.map((entry) => [entry.type, entry.direction, entry.amountCents]),
        [
            ["GROSS_PAYMENT", "CREDIT", 3000],
            ["PROVIDER_FEE", "DEBIT", 70],
            ["GATEKEEPER_FEE", "DEBIT", 196],
            ["ORGANIZER_NET", "CREDIT", 2734],
        ]
    );
});

test("provider adapters must expose all critical operations", () => {
    assert.equal(
        validatePaymentProviderAdapter({
            createPayment() {},
            getPaymentStatus() {},
            refundPayment() {},
            cancelPayment() {},
            handleWebhook() {},
        }),
        true
    );

    assert.throws(
        () => validatePaymentProviderAdapter({ createPayment() {} }),
        /getPaymentStatus, refundPayment, cancelPayment, handleWebhook/
    );
});
