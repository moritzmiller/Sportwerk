import assert from "node:assert/strict";
import test from "node:test";

import { markBookingAndTicketsCheckedIn } from "../src/lib/ticket-checkin.js";

function createTx({ bookingCount = 1, ticketCount = 2 } = {}) {
    const calls = [];
    return {
        calls,
        booking: {
            updateMany: async (args) => {
                calls.push(["booking.updateMany", args]);
                return { count: bookingCount };
            },
        },
        ticket: {
            updateMany: async (args) => {
                calls.push(["ticket.updateMany", args]);
                return { count: ticketCount };
            },
        },
    };
}

test("booking-code check-in marks the booking and all still-valid tickets", async () => {
    const now = new Date("2026-09-11T10:00:00.000Z");
    const tx = createTx({ ticketCount: 3 });

    const result = await markBookingAndTicketsCheckedIn(
        tx,
        { id: "booking-1" },
        { now, userId: "scanner-1", via: "camera" }
    );

    assert.deepEqual(result, { action: "checked-in", count: 1, ticketsUpdated: 3 });
    assert.deepEqual(tx.calls[0], [
        "booking.updateMany",
        {
            where: { id: "booking-1", checkedInAt: null },
            data: {
                checkedInAt: now,
                checkedInById: "scanner-1",
                checkedInVia: "camera",
            },
        },
    ]);
    assert.deepEqual(tx.calls[1], [
        "ticket.updateMany",
        {
            where: { bookingId: "booking-1", status: "VALID", checkedInAt: null },
            data: {
                status: "CHECKED_IN",
                checkedInAt: now,
                checkedInById: "scanner-1",
                checkedInVia: "camera",
            },
        },
    ]);
});

test("booking-code check-in does not touch tickets when the booking update loses a race", async () => {
    const tx = createTx({ bookingCount: 0 });

    const result = await markBookingAndTicketsCheckedIn(tx, { id: "booking-1" });

    assert.deepEqual(result, { action: "ignored", count: 0, ticketsUpdated: 0 });
    assert.equal(tx.calls.length, 1);
});
