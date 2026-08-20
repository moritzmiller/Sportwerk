import assert from "node:assert/strict";
import test from "node:test";
import {
    cancelBookingAndRelease,
    markBookingFailedAndRelease,
    markBookingPaid,
    markBookingRefundedAndRelease,
} from "../src/lib/payment-state.js";

function createTx(booking) {
    const state = { booking: { ...booking } };
    const calls = [];

    return {
        calls,
        state,
        booking: {
            updateMany: async ({ where, data }) => {
                calls.push(["booking.updateMany", { where, data }]);
                if (where.id !== state.booking.id || where.status !== state.booking.status) {
                    return { count: 0 };
                }
                state.booking = { ...state.booking, ...data };
                return { count: 1 };
            },
        },
        event: {
            updateMany: async (args) => {
                calls.push(["event.updateMany", args]);
                return { count: 1 };
            },
        },
        eventTicketType: {
            updateMany: async (args) => {
                calls.push(["eventTicketType.updateMany", args]);
                return { count: 1 };
            },
        },
    };
}

const awaitingBooking = {
    id: "booking-1",
    eventId: 12,
    ticketTypeId: "ticket-type-1",
    quantity: 2,
    status: "AWAITING_PAYMENT",
    paidAt: null,
};

test("markBookingPaid moves awaiting bookings to paid idempotently", async () => {
    const tx = createTx(awaitingBooking);

    const result = await markBookingPaid(tx, awaitingBooking, {
        paymentProvider: "FREE",
        paypalStatus: "NOT_REQUIRED",
    });

    assert.equal(result.action, "paid");
    assert.equal(tx.state.booking.status, "PAID");
    assert.equal(tx.state.booking.paymentProvider, "FREE");
    assert.ok(tx.state.booking.paidAt instanceof Date);
});

test("markBookingPaid ignores bookings that are already paid", async () => {
    const tx = createTx({ ...awaitingBooking, status: "PAID" });

    const result = await markBookingPaid(tx, { ...awaitingBooking, status: "PAID" });

    assert.deepEqual(result, {
        action: "ignored",
        reason: "already-paid",
        bookingId: "booking-1",
    });
    assert.equal(tx.calls.length, 0);
});

test("markBookingFailedAndRelease fails awaiting bookings and releases reservation", async () => {
    const tx = createTx(awaitingBooking);

    const result = await markBookingFailedAndRelease(tx, awaitingBooking, {
        paypalStatus: "CAPTURE_FAILED",
    });

    assert.equal(result.action, "failed");
    assert.equal(tx.state.booking.status, "FAILED");
    assert.ok(tx.calls.some(([name]) => name === "event.updateMany"));
    assert.ok(tx.calls.some(([name]) => name === "eventTicketType.updateMany"));
});

test("cancelBookingAndRelease cancels paid bookings and releases reservation", async () => {
    const paidBooking = { ...awaitingBooking, status: "PAID" };
    const tx = createTx(paidBooking);

    const result = await cancelBookingAndRelease(tx, paidBooking, {
        paymentCancellationReason: "Refund",
    });

    assert.equal(result.action, "cancelled");
    assert.equal(tx.state.booking.status, "CANCELLED");
    assert.equal(tx.state.booking.paymentCancellationReason, "Refund");
    assert.ok(tx.state.booking.paymentCancelledAt instanceof Date);
    assert.ok(tx.calls.some(([name]) => name === "event.updateMany"));
});

test("cancelBookingAndRelease ignores terminal failed bookings", async () => {
    const failedBooking = { ...awaitingBooking, status: "FAILED" };
    const tx = createTx(failedBooking);

    const result = await cancelBookingAndRelease(tx, failedBooking);

    assert.deepEqual(result, {
        action: "ignored",
        reason: "status-FAILED",
        bookingId: "booking-1",
    });
    assert.equal(tx.calls.length, 0);
});

test("markBookingRefundedAndRelease refunds paid bookings and releases reservation", async () => {
    const paidBooking = { ...awaitingBooking, status: "PAID" };
    const tx = createTx(paidBooking);

    const result = await markBookingRefundedAndRelease(tx, paidBooking, {
        paymentCancellationReason: "Refund",
        paypalStatus: "COMPLETED",
    });

    assert.equal(result.action, "refunded");
    assert.equal(tx.state.booking.status, "REFUNDED");
    assert.equal(tx.state.booking.paymentCancellationReason, "Refund");
    assert.equal(tx.state.booking.paypalStatus, "COMPLETED");
    assert.ok(tx.state.booking.paymentCancelledAt instanceof Date);
    assert.ok(tx.calls.some(([name]) => name === "event.updateMany"));
    assert.ok(tx.calls.some(([name]) => name === "eventTicketType.updateMany"));
});

test("markBookingRefundedAndRelease ignores already refunded bookings", async () => {
    const refundedBooking = { ...awaitingBooking, status: "REFUNDED" };
    const tx = createTx(refundedBooking);

    const result = await markBookingRefundedAndRelease(tx, refundedBooking);

    assert.deepEqual(result, {
        action: "ignored",
        reason: "already-refunded",
        bookingId: "booking-1",
    });
    assert.equal(tx.calls.length, 0);
});

test("markBookingRefundedAndRelease does not refund unpaid bookings", async () => {
    const tx = createTx(awaitingBooking);

    const result = await markBookingRefundedAndRelease(tx, awaitingBooking);

    assert.deepEqual(result, {
        action: "ignored",
        reason: "status-AWAITING_PAYMENT",
        bookingId: "booking-1",
    });
    assert.equal(tx.calls.length, 0);
});
