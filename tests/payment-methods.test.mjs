import assert from "node:assert/strict";
import test from "node:test";

import { calculateBookingTotals } from "../src/lib/bookings.js";
import {
    getPaymentMethodLabel,
    getPaymentMethodFeeEstimate,
    isManualPaymentMethod,
    isPaymentMethodAllowed,
    normalizeAllowedPaymentMethods,
    normalizeEventPaymentMethods,
    normalizePaymentMethod,
} from "../src/lib/payment-methods.js";

test("booking totals never add a GateKeeper service fee", () => {
    assert.deepEqual(calculateBookingTotals(12, 2), {
        unitPrice: 12,
        quantity: 2,
        subtotal: 24,
        serviceFee: 0,
        totalAmount: 24,
        currency: "EUR",
    });
});

test("payment methods include Stripe and keep manual methods distinct", () => {
    assert.equal(normalizePaymentMethod("stripe"), "STRIPE");
    assert.equal(getPaymentMethodLabel("STRIPE"), "Karte oder SEPA");
    assert.equal(isManualPaymentMethod("STRIPE"), false);
    assert.equal(isManualPaymentMethod("INVOICE"), true);
});

test("event allowed payment methods are normalized and enforced", () => {
    const methods = normalizeAllowedPaymentMethods(["stripe", "stripe", "invoice"]);

    assert.deepEqual(methods, ["STRIPE", "INVOICE"]);
    assert.equal(isPaymentMethodAllowed({ allowedPaymentMethods: methods }, "STRIPE"), true);
    assert.equal(isPaymentMethodAllowed({ allowedPaymentMethods: methods }, "PAYPAL"), false);
});

test("free-only events do not require payment methods", () => {
    const methods = normalizeEventPaymentMethods(["paypal", "stripe"], [
        { name: "Standard", price: 0 },
        { name: "Community", price: "" },
    ]);

    assert.deepEqual(methods, []);
});

test("paid events keep normalized payment methods", () => {
    const methods = normalizeEventPaymentMethods(["stripe", "invoice"], [
        { name: "Standard", price: 0 },
        { name: "Supporter", price: 5 },
    ]);

    assert.deepEqual(methods, ["STRIPE", "INVOICE"]);
});

test("provider fee estimates keep GateKeeper fees at zero", () => {
    const stripe = getPaymentMethodFeeEstimate("STRIPE", 20);
    const paypal = getPaymentMethodFeeEstimate("PAYPAL", 20);
    const invoice = getPaymentMethodFeeEstimate("INVOICE", 20);

    assert.equal(stripe.providerFee, 0.55);
    assert.equal(paypal.providerFee, 0.85);
    assert.equal(invoice.providerFee, 0);
    assert.equal(stripe.gatekeeperFee, 0);
    assert.equal(paypal.customerTotal, 20);
});
