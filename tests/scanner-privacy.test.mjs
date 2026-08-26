import assert from "node:assert/strict";
import test from "node:test";

import {
    serializeScannerBooking,
    serializeScannerTicket,
    serializeScannerTicketRecord,
} from "../src/lib/scanner-privacy.js";

test("scanner ticket serialization omits purchaser email addresses", () => {
    const ticket = serializeScannerTicket({
        id: "booking-1",
        eventId: 42,
        purchaserName: "Ada Lovelace",
        purchaserEmail: "ada@example.test",
        quantity: 2,
        checkedInAt: new Date("2026-08-26T09:00:00.000Z"),
    });

    assert.deepEqual(ticket, {
        id: "booking-1",
        purchaserName: "Ada Lovelace",
        quantity: 2,
        scanned: true,
        checkedInAt: "2026-08-26T09:00:00.000Z",
    });
    assert.equal("purchaserEmail" in ticket, false);
});

test("scanner ticket record serialization omits purchaser email addresses", () => {
    const ticket = serializeScannerTicketRecord({
        id: "ticket-1",
        bookingId: "booking-1",
        holderName: "Ada Lovelace",
        status: "CHECKED_IN",
        checkedInAt: new Date("2026-08-26T09:00:00.000Z"),
        booking: {
            purchaserName: "Ada Buyer",
            purchaserEmail: "ada@example.test",
        },
    });

    assert.deepEqual(ticket, {
        id: "ticket-1",
        bookingId: "booking-1",
        purchaserName: "Ada Lovelace",
        quantity: 1,
        scanned: true,
        checkedInAt: "2026-08-26T09:00:00.000Z",
    });
    assert.equal("purchaserEmail" in ticket, false);
    assert.equal(JSON.stringify(ticket).includes("ada@example.test"), false);
});

test("scanner check-in response serialization omits purchaser email addresses", () => {
    const booking = serializeScannerBooking({
        id: "booking-1",
        eventId: 42,
        ticketId: "ticket-1",
        purchaserName: "Ada Lovelace",
        purchaserEmail: "ada@example.test",
        quantity: 2,
        checkedInAt: new Date("2026-08-26T09:00:00.000Z"),
        checkedInVia: "scanner-link",
    }, { quantity: 1 });

    assert.deepEqual(booking, {
        id: "booking-1",
        eventId: 42,
        ticketId: "ticket-1",
        purchaserName: "Ada Lovelace",
        quantity: 1,
        checkedInAt: "2026-08-26T09:00:00.000Z",
        checkedInVia: "scanner-link",
    });
    assert.equal("purchaserEmail" in booking, false);
});
