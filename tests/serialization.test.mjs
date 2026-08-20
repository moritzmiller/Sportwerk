import assert from "node:assert/strict";
import test from "node:test";

import {
    formatEventDateShort,
    formatEventDateTime,
    formatEventTime,
    serializeEvent,
} from "../src/lib/events.js";
import { serializeBooking } from "../src/lib/bookings.js";
import { serializeTicketType } from "../src/lib/ticket-types.js";

test("event serialization tolerates missing and invalid date values", () => {
    const event = serializeEvent({
        id: 1,
        title: "Broken imported event",
        description: null,
        imageUrl: null,
        location: "Dresden",
        city: "Dresden",
        category: "KULTUR",
        status: "PUBLISHED",
        startDate: null,
        price: 0,
        capacity: null,
        soldTickets: 0,
        viewCount: 0,
        publishedAt: "not-a-date",
        cancelledAt: null,
    });

    assert.equal(event.startDate, null);
    assert.equal(event.publishedAt, null);
    assert.equal(formatEventDateTime(event.startDate), "Termin offen");
    assert.equal(formatEventDateShort(event.startDate), "Offen");
    assert.equal(formatEventTime(event.startDate), "");
});

test("booking serialization tolerates partial selected records", () => {
    const booking = serializeBooking({
        id: "booking_1",
        eventId: 1,
        attendeeId: null,
        purchaserName: "Ada",
        purchaserEmail: "ada@example.test",
        purchaserPhone: null,
        notes: null,
        newsletter: false,
        quantity: 1,
        currency: "EUR",
        unitPrice: 0,
        serviceFee: 0,
        totalAmount: 0,
        ticketTypeId: null,
        ticketTypeName: null,
        billingName: null,
        billingStreet: null,
        billingStreet2: null,
        billingPostalCode: null,
        billingCity: null,
        billingCountry: "DE",
        paymentMethod: "PAYPAL",
        status: "AWAITING_PAYMENT",
        paymentProvider: "PAYPAL",
        paymentReference: null,
        paidAt: null,
        paymentReminderCount: 0,
        lastPaymentReminderAt: "invalid",
        paymentCancelledAt: null,
        paymentCancellationReason: null,
        checkedInAt: null,
        checkedInById: null,
        checkedInVia: null,
        transferToName: null,
        transferToEmail: null,
        paypalOrderId: null,
        paypalCaptureId: null,
        paypalApprovalUrl: null,
        paypalStatus: null,
        createdAt: null,
        updatedAt: undefined,
        event: {
            id: 1,
            title: "Broken imported event",
            location: "Dresden",
            city: "Dresden",
            startDate: "invalid",
        },
    });

    assert.equal(booking.createdAt, null);
    assert.equal(booking.updatedAt, null);
    assert.equal(booking.lastPaymentReminderAt, null);
    assert.equal(booking.event.startDate, null);
});

test("ticket type serialization tolerates invalid timestamps", () => {
    const ticketType = serializeTicketType({
        id: "ticket_1",
        eventId: 1,
        name: "Standard",
        description: null,
        price: 12,
        currency: "EUR",
        quota: 10,
        soldCount: 3,
        maxPerBooking: null,
        isDefault: true,
        sortOrder: 0,
        createdAt: "invalid",
        updatedAt: null,
    });

    assert.equal(ticketType.createdAt, null);
    assert.equal(ticketType.updatedAt, null);
    assert.equal(ticketType.remainingQuota, 7);
});
