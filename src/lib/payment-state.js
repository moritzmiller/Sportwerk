import { releaseBookingReservation } from "./reservations.js";
import {
    ensureTicketsForBooking,
    markTicketsForBooking,
} from "./tickets.js";

export const BOOKING_PAYMENT_STATUS = Object.freeze({
    AWAITING_PAYMENT: "AWAITING_PAYMENT",
    PAID: "PAID",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    REFUNDED: "REFUNDED",
});

function bookingId(booking) {
    return booking?.id ?? null;
}

function transitionResult(action, booking, result, successReason = null) {
    return {
        action: result.count === 1 ? action : "ignored",
        reason: result.count === 1 ? successReason : "concurrent-update",
        bookingId: bookingId(booking),
    };
}

export async function markBookingPaid(tx, booking, data = {}) {
    if (!booking?.id) {
        throw new Error("booking is required.");
    }

    if (booking.status === BOOKING_PAYMENT_STATUS.PAID) {
        return { action: "ignored", reason: "already-paid", bookingId: booking.id };
    }

    if (booking.status !== BOOKING_PAYMENT_STATUS.AWAITING_PAYMENT) {
        return { action: "ignored", reason: `status-${booking.status}`, bookingId: booking.id };
    }

    const result = await tx.booking.updateMany({
        where: { id: booking.id, status: BOOKING_PAYMENT_STATUS.AWAITING_PAYMENT },
        data: {
            ...data,
            status: BOOKING_PAYMENT_STATUS.PAID,
            paidAt: data.paidAt ?? booking.paidAt ?? new Date(),
        },
    });

    if (result.count === 1) {
        if (booking.promoCodeId) {
            await tx.promoCode.updateMany({
                where: { id: booking.promoCodeId },
                data: { redeemedCount: { increment: 1 } },
            });
        }
        await ensureTicketsForBooking(tx, { ...booking, ...data, status: BOOKING_PAYMENT_STATUS.PAID });
    }

    return transitionResult("paid", booking, result);
}

export async function markBookingFailedAndRelease(tx, booking, data = {}) {
    if (!booking?.id) {
        throw new Error("booking is required.");
    }

    if (booking.status !== BOOKING_PAYMENT_STATUS.AWAITING_PAYMENT) {
        return { action: "ignored", reason: `status-${booking.status}`, bookingId: booking.id };
    }

    const result = await tx.booking.updateMany({
        where: { id: booking.id, status: BOOKING_PAYMENT_STATUS.AWAITING_PAYMENT },
        data: {
            ...data,
            status: BOOKING_PAYMENT_STATUS.FAILED,
        },
    });

    if (result.count === 1) {
        await releaseBookingReservation(tx, booking);
        await markTicketsForBooking(tx, booking.id, "CANCELLED", {
            checkedInAt: null,
            checkedInById: null,
            checkedInVia: null,
        });
    }

    return transitionResult("failed", booking, result);
}

export async function cancelBookingAndRelease(tx, booking, data = {}) {
    if (!booking?.id) {
        throw new Error("booking is required.");
    }

    if (booking.status === BOOKING_PAYMENT_STATUS.CANCELLED) {
        return { action: "ignored", reason: "already-cancelled", bookingId: booking.id };
    }

    if (
        booking.status !== BOOKING_PAYMENT_STATUS.AWAITING_PAYMENT &&
        booking.status !== BOOKING_PAYMENT_STATUS.PAID
    ) {
        return { action: "ignored", reason: `status-${booking.status}`, bookingId: booking.id };
    }

    const result = await tx.booking.updateMany({
        where: {
            id: booking.id,
            status: booking.status,
        },
        data: {
            ...data,
            status: BOOKING_PAYMENT_STATUS.CANCELLED,
            paymentCancelledAt: data.paymentCancelledAt ?? new Date(),
        },
    });

    if (result.count === 1) {
        await releaseBookingReservation(tx, booking);
        if (booking.status === BOOKING_PAYMENT_STATUS.PAID && booking.promoCodeId) {
            await tx.promoCode.updateMany({
                where: { id: booking.promoCodeId, redeemedCount: { gt: 0 } },
                data: { redeemedCount: { decrement: 1 } },
            });
        }
        await markTicketsForBooking(tx, booking.id, "REFUNDED", {
            checkedInAt: null,
            checkedInById: null,
            checkedInVia: null,
        });
    }

    return transitionResult("cancelled", booking, result);
}

export async function markBookingRefundedAndRelease(tx, booking, data = {}) {
    if (!booking?.id) {
        throw new Error("booking is required.");
    }

    if (booking.status === BOOKING_PAYMENT_STATUS.REFUNDED) {
        return { action: "ignored", reason: "already-refunded", bookingId: booking.id };
    }

    if (booking.status !== BOOKING_PAYMENT_STATUS.PAID) {
        return { action: "ignored", reason: `status-${booking.status}`, bookingId: booking.id };
    }

    const result = await tx.booking.updateMany({
        where: {
            id: booking.id,
            status: BOOKING_PAYMENT_STATUS.PAID,
        },
        data: {
            ...data,
            status: BOOKING_PAYMENT_STATUS.REFUNDED,
            paymentCancelledAt: data.paymentCancelledAt ?? new Date(),
        },
    });

    if (result.count === 1) {
        await releaseBookingReservation(tx, booking);
        if (booking.promoCodeId) {
            await tx.promoCode.updateMany({
                where: { id: booking.promoCodeId, redeemedCount: { gt: 0 } },
                data: { redeemedCount: { decrement: 1 } },
            });
        }
        await markTicketsForBooking(tx, booking.id, "REFUNDED", {
            checkedInAt: null,
            checkedInById: null,
            checkedInVia: null,
        });
    }

    return transitionResult("refunded", booking, result);
}
