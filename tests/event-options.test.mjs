import assert from "node:assert/strict";
import test from "node:test";

import {
    EVENT_TYPES,
    getEventBookingQuestions,
    normalizeEventOptions,
    normalizeEventType,
    normalizeRegistrationAnswers,
} from "../src/lib/event-options.js";
import { serializeEvent } from "../src/lib/events.js";
import { serializeBooking } from "../src/lib/bookings.js";

test("event type normalization keeps unsupported values as standard events", () => {
    assert.equal(normalizeEventType("ERICH"), EVENT_TYPES.ERICH);
    assert.equal(normalizeEventType("unknown"), EVENT_TYPES.STANDARD);
    assert.equal(normalizeEventType(null), EVENT_TYPES.STANDARD);
});

test("ERICH event options default to order-form race registration questions", () => {
    const options = normalizeEventOptions(EVENT_TYPES.ERICH);

    assert.equal(options.features.raceRegistration, true);
    assert.equal(options.raceSelectionMode, "ORDER_FORM");
    assert.equal(options.ageRuleMode, "ORDER_FORM");
    assert.deepEqual(
        options.bookingQuestions.map((question) => question.id),
        ["raceNumber", "athleteBirthDate", "clubName", "ageClass", "targetTime"]
    );
});

test("registration answers validate required ERICH order fields", () => {
    const event = {
        eventType: EVENT_TYPES.ERICH,
        eventOptions: normalizeEventOptions(EVENT_TYPES.ERICH),
    };

    const missing = normalizeRegistrationAnswers(event, {
        raceNumber: "12",
    });
    assert.equal(missing.errors[0], "Geburtsdatum ist erforderlich.");

    const result = normalizeRegistrationAnswers(event, {
        raceNumber: "12",
        athleteBirthDate: "2010-04-12",
        clubName: "  Ruderclub Dresden\u0000 ",
        ageClass: "U17",
        targetTime: "07:30",
    });

    assert.deepEqual(result.errors, []);
    assert.equal(result.data.eventType, EVENT_TYPES.ERICH);
    assert.equal(result.data.answers.raceNumber.value, 12);
    assert.equal(result.data.answers.clubName.value, "Ruderclub Dresden");
});

test("standard events do not require special registration answers", () => {
    const result = normalizeRegistrationAnswers(
        { eventType: EVENT_TYPES.STANDARD, eventOptions: normalizeEventOptions(EVENT_TYPES.STANDARD) },
        {}
    );

    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.data.answers, {});
});

test("event and booking serialization expose the unified special-event payload", () => {
    const event = serializeEvent({
        id: 1,
        title: "Erich Cup",
        location: "Arena",
        city: "Dresden",
        category: "SPORT",
        eventType: "ERICH",
        eventOptions: {
            features: { seatingEnabled: true },
        },
        startDate: new Date("2026-09-01T10:00:00.000Z"),
        price: 10,
        ticketTypes: [],
    });

    assert.equal(event.eventType, EVENT_TYPES.ERICH);
    assert.equal(event.eventOptions.features.seatingEnabled, true);
    assert.equal(getEventBookingQuestions(event).length, 5);

    const booking = serializeBooking({
        id: "booking-1",
        eventId: 1,
        purchaserName: "Ada",
        purchaserEmail: "ada@example.test",
        quantity: 1,
        currency: "EUR",
        unitPrice: 10,
        serviceFee: 0,
        totalAmount: 10,
        paymentMethod: "STRIPE",
        status: "AWAITING_PAYMENT",
        paymentProvider: "STRIPE",
        registrationData: {
            eventType: EVENT_TYPES.ERICH,
            answers: {
                raceNumber: { label: "Rennnummer", value: 12 },
            },
        },
        tickets: [],
    });

    assert.equal(booking.registrationData.eventType, EVENT_TYPES.ERICH);
    assert.equal(booking.registrationData.answers.raceNumber.value, 12);
});
