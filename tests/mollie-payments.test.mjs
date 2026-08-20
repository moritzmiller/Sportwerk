import assert from "node:assert/strict";
import test from "node:test";

import {
    buildMolliePaymentPayload,
    createMollieAdapter,
    normalizeMollieStatus,
} from "../src/lib/payments/mollie.js";

const config = {
    enabled: true,
    apiKey: "test_mollie_key",
    currency: "EUR",
    baseUrl: "https://api.mollie.com/v2",
};

test("Mollie payload uses paybybank and exact cent formatting", () => {
    const payload = buildMolliePaymentPayload(
        {
            gatekeeperPaymentId: "gkp_123",
            bookingId: "booking_123",
            method: "MOLLIE_PAY_BY_BANK",
            amountCents: 3050,
            currency: "EUR",
            returnUrl: "https://gatekeeper.test/return",
            cancelUrl: "https://gatekeeper.test/cancel",
            webhookUrl: "https://gatekeeper.test/api/payments/mollie/webhook",
            metadata: {
                eventId: 42,
                description: "Sommerlauf",
            },
        },
        config
    );

    assert.deepEqual(payload, {
        amount: {
            currency: "EUR",
            value: "30.50",
        },
        description: "Sommerlauf",
        method: "paybybank",
        redirectUrl: "https://gatekeeper.test/return",
        cancelUrl: "https://gatekeeper.test/cancel",
        webhookUrl: "https://gatekeeper.test/api/payments/mollie/webhook",
        metadata: {
            gatekeeperPaymentId: "gkp_123",
            bookingId: "booking_123",
            eventId: 42,
        },
    });
});

test("Mollie status normalization maps provider states into GateKeeper states", () => {
    assert.equal(normalizeMollieStatus("open"), "PENDING");
    assert.equal(normalizeMollieStatus("pending"), "PROCESSING");
    assert.equal(normalizeMollieStatus("paid"), "SUCCEEDED");
    assert.equal(normalizeMollieStatus("expired"), "CANCELLED");
    assert.equal(normalizeMollieStatus("unknown"), "PENDING");
});

test("Mollie adapter creates checkout payments through the provider contract", async () => {
    const calls = [];
    const adapter = createMollieAdapter({
        config,
        async fetchPayment(path, options) {
            calls.push({ path, options });
            return {
                id: "tr_mollie_123",
                status: "open",
                _links: {
                    checkout: {
                        href: "https://www.mollie.com/checkout/test",
                    },
                },
            };
        },
    });

    const result = await adapter.createPayment({
        gatekeeperPaymentId: "gkp_123",
        bookingId: "booking_123",
        method: "MOLLIE_PAY_BY_BANK",
        amountCents: 2000,
        returnUrl: "https://gatekeeper.test/return",
        cancelUrl: "https://gatekeeper.test/cancel",
        metadata: {},
    });

    assert.equal(result.paymentId, "tr_mollie_123");
    assert.equal(result.checkoutUrl, "https://www.mollie.com/checkout/test");
    assert.equal(result.status, "PENDING");
    assert.equal(calls[0].path, "/payments");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.body.method, "paybybank");
});
