import assert from "node:assert/strict";
import test from "node:test";

import {
    buildCheckoutReturnUrl,
    buildHostedCheckoutUrls,
} from "../src/lib/checkout-payments.js";

test("checkout return URLs keep event booking compatibility", () => {
    assert.equal(
        buildCheckoutReturnUrl({
            returnPath: "/events/42/checkout",
            referenceId: "booking_123",
            accessToken: "access-token",
        }),
        "/events/42/checkout?bookingId=booking_123&accessToken=access-token"
    );
});

test("checkout return URLs can name future non-booking references", () => {
    assert.equal(
        buildCheckoutReturnUrl({
            returnPath: "/locations/court-7/rent",
            referenceId: "rental_123",
            referenceParamName: "rentalId",
            accessToken: "rental-token",
        }),
        "/locations/court-7/rent?rentalId=rental_123&accessToken=rental-token"
    );
});

test("hosted checkout URLs centralize provider return and cancel targets", () => {
    const urls = buildHostedCheckoutUrls({
        origin: "https://gatekeeper.test",
        returnPath: "/events/42/checkout",
        referenceId: "booking_123",
        accessToken: "access-token",
    });

    assert.equal(
        urls.returnUrl,
        "https://gatekeeper.test/events/42/checkout?bookingId=booking_123&accessToken=access-token"
    );
    assert.equal(
        urls.cancelUrl,
        "https://gatekeeper.test/events/42/checkout?bookingId=booking_123&accessToken=access-token&cancelled=1"
    );
    assert.equal(
        urls.stripeSuccessUrl,
        "https://gatekeeper.test/events/42/checkout?bookingId=booking_123&accessToken=access-token&stripe_session_id={CHECKOUT_SESSION_ID}"
    );
});
