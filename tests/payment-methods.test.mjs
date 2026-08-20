import assert from "node:assert/strict";
import test from "node:test";

import { calculateBookingTotals } from "../src/lib/bookings.js";
import {
    getPaymentMethodFeeEstimate,
    isManualPaymentMethod,
    isPaymentMethodAllowed,
    normalizeAllowedPaymentMethods,
    normalizePaymentMethod,
} from "../src/lib/payment-methods.js";

test("booking totals add the central GateKeeper service fee", () => {
    assert.deepEqual(calculateBookingTotals(12, 2), {
        unitPrice: 12,
        quantity: 2,
        subtotal: 24,
        discountAmount: 0,
        discountedSubtotal: 24,
        serviceFee: 2.16,
        totalAmount: 26.16,
        currency: "EUR",
    });
});

test("free tickets do not add a GateKeeper service fee", () => {
    assert.deepEqual(calculateBookingTotals(0, 2), {
        unitPrice: 0,
        quantity: 2,
        subtotal: 0,
        discountAmount: 0,
        discountedSubtotal: 0,
        serviceFee: 0,
        totalAmount: 0,
        currency: "EUR",
    });
});

test("payment methods include Stripe and keep manual methods distinct", () => {
    assert.equal(normalizePaymentMethod("stripe"), "STRIPE");
    assert.equal(normalizePaymentMethod("mollie_pay_by_bank"), "MOLLIE_PAY_BY_BANK");
    assert.equal(isManualPaymentMethod("STRIPE"), false);
    assert.equal(isManualPaymentMethod("MOLLIE_PAY_BY_BANK"), false);
    assert.equal(isManualPaymentMethod("INVOICE"), true);
});

test("event allowed payment methods are normalized and enforced", () => {
    const methods = normalizeAllowedPaymentMethods(["stripe", "mollie_pay_by_bank", "stripe", "invoice"]);

    assert.deepEqual(methods, ["STRIPE", "MOLLIE_PAY_BY_BANK", "INVOICE"]);
    assert.equal(isPaymentMethodAllowed({ allowedPaymentMethods: methods }, "STRIPE"), true);
    assert.equal(isPaymentMethodAllowed({ allowedPaymentMethods: methods }, "MOLLIE_PAY_BY_BANK"), true);
    assert.equal(isPaymentMethodAllowed({ allowedPaymentMethods: methods }, "PAYPAL"), false);
});

test("provider fee estimates include the central GateKeeper fee", () => {
    const stripe = getPaymentMethodFeeEstimate("STRIPE", 20);
    const molliePayByBank = getPaymentMethodFeeEstimate("MOLLIE_PAY_BY_BANK", 20);
    const paypal = getPaymentMethodFeeEstimate("PAYPAL", 20);
    const invoice = getPaymentMethodFeeEstimate("INVOICE", 20);

    assert.equal(stripe.providerFee, 0.55);
    assert.equal(molliePayByBank.providerFee, 0.43);
    assert.equal(paypal.providerFee, 0.99);
    assert.equal(invoice.providerFee, 0);
    assert.equal(stripe.gatekeeperFee, 1.47);
    assert.equal(paypal.customerTotal, 21.47);
});
