import assert from "node:assert/strict";
import test from "node:test";
import {
    applyReservationChange,
    isReservationCapacityError,
    releaseBookingReservation,
} from "../src/lib/reservations.js";

function createTx({ eventCapacity = 10, eventUpdateCount = 1, ticketQuota = null, ticketUpdateCount = 1 } = {}) {
    const calls = [];
    return {
        calls,
        event: {
            findUnique: async () => ({ id: 1, capacity: eventCapacity }),
            updateMany: async (args) => {
                calls.push(["event.updateMany", args]);
                return { count: eventUpdateCount };
            },
        },
        eventTicketType: {
            findUnique: async () => ({ id: "ticket-type", quota: ticketQuota }),
            updateMany: async (args) => {
                calls.push(["eventTicketType.updateMany", args]);
                return { count: ticketUpdateCount };
            },
        },
    };
}

test("applies event and ticket type reservation increments atomically", async () => {
    const tx = createTx({ eventCapacity: 10, ticketQuota: 8 });

    await applyReservationChange(tx, {
        eventId: 1,
        previousQuantity: 0,
        nextQuantity: 3,
        previousTicketTypeId: null,
        nextTicketTypeId: "ticket-type",
    });

    assert.equal(tx.calls.length, 2);
    assert.deepEqual(tx.calls[0][1].where, {
        id: 1,
        capacity: 10,
        soldTickets: { lte: 7 },
    });
    assert.deepEqual(tx.calls[1][1].where, {
        id: "ticket-type",
        quota: 8,
        soldCount: { lte: 5 },
    });
});

test("throws a capacity error when event reservation cannot be incremented", async () => {
    const tx = createTx({ eventCapacity: 2, eventUpdateCount: 0 });

    await assert.rejects(
        () =>
            applyReservationChange(tx, {
                eventId: 1,
                previousQuantity: 0,
                nextQuantity: 3,
                nextTicketTypeId: null,
            }),
        (error) => isReservationCapacityError(error)
    );
});

test("releaseBookingReservation decrements event and ticket counters", async () => {
    const tx = createTx();

    await releaseBookingReservation(tx, {
        eventId: 1,
        quantity: 2,
        ticketTypeId: "ticket-type",
    });

    assert.equal(tx.calls.length, 2);
    assert.deepEqual(tx.calls[0][1].where, {
        id: 1,
        soldTickets: { gte: 2 },
    });
    assert.deepEqual(tx.calls[1][1].where, {
        id: "ticket-type",
        soldCount: { gte: 2 },
    });
});
