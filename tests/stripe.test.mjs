import assert from "node:assert/strict";
import test from "node:test";

import { getBookingStripePaymentMethodTypes } from "../src/lib/stripe.js";

test("booking Stripe checkout supports card and SEPA debit", () => {
    assert.deepEqual(getBookingStripePaymentMethodTypes(), ["card", "sepa_debit"]);
});
