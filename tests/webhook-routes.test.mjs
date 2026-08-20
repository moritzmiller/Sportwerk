import test from "node:test";
import assert from "node:assert/strict";

import { isTrustedWebhookRoute } from "../src/lib/webhook-routes.js";

test("trusted webhook routes include all provider callbacks", () => {
    assert.equal(isTrustedWebhookRoute("/api/paypal/webhook"), true);
    assert.equal(isTrustedWebhookRoute("/api/stripe/webhook"), true);
    assert.equal(isTrustedWebhookRoute("/api/payments/mollie/webhook"), true);
});

test("trusted webhook routes reject adjacent API paths", () => {
    assert.equal(isTrustedWebhookRoute("/api/payments/mollie"), false);
    assert.equal(isTrustedWebhookRoute("/api/payments/mollie/webhook/extra"), false);
    assert.equal(isTrustedWebhookRoute("/api/bookings"), false);
});
