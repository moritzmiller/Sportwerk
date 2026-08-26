import assert from "node:assert/strict";
import test from "node:test";

import {
    createBookingAccessToken,
    verifyBookingAccessToken,
} from "../src/lib/booking-access.js";

const booking = {
    id: "booking-1",
    createdAt: new Date("2026-08-26T10:00:00.000Z"),
};

test("booking access tokens verify for the matching booking", () => {
    const token = createBookingAccessToken(booking);

    assert.equal(verifyBookingAccessToken(token, booking), true);
});

test("booking access tokens reject tampered booking ids", () => {
    const token = createBookingAccessToken(booking);

    assert.equal(
        verifyBookingAccessToken(token, {
            ...booking,
            id: "booking-2",
        }),
        false
    );
});

test("booking access tokens reject missing or malformed tokens", () => {
    assert.equal(verifyBookingAccessToken("", booking), false);
    assert.equal(verifyBookingAccessToken("gkb1.booking-1.bad.signature", booking), false);
});
