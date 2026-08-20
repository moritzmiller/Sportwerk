import assert from "node:assert/strict";
import test from "node:test";

import {
    createIndividualTicketCode,
    ensureTicketsForBooking,
    verifyTicketCode,
} from "../src/lib/tickets.js";

test("individual ticket codes verify to ticket ids without exposing booking ids", () => {
    const code = createIndividualTicketCode("ticket-1");
    const verified = verifyTicketCode(code);

    assert.equal(verified.ok, true);
    assert.equal(verified.ticketId, "ticket-1");
    assert.equal(verified.bookingId, null);
});

test("ensureTicketsForBooking creates only missing ticket numbers", async () => {
    const created = [];
    const tx = {
        ticket: {
            findMany: async () => [{ ticketNumber: 1 }],
            createMany: async ({ data, skipDuplicates }) => {
                created.push(...data);
                assert.equal(skipDuplicates, true);
                return { count: data.length };
            },
        },
    };

    const result = await ensureTicketsForBooking(tx, {
        id: "booking-1",
        eventId: 1,
        ticketTypeId: "type-1",
        ticketTypeName: "Regular",
        purchaserName: "Ada Lovelace",
        quantity: 3,
    });

    assert.deepEqual(result, { action: "created", count: 2 });
    assert.deepEqual(
        created.map((ticket) => ticket.ticketNumber),
        [2, 3]
    );
    assert.equal(created[0].status, "VALID");
    assert.equal(created[0].holderName, "Ada Lovelace");
});
