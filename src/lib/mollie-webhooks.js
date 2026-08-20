import {
    markBookingFailedAndRelease,
    markBookingPaid,
} from "./payment-state.js";

const PAID_STATUSES = new Set(["SUCCEEDED"]);
const FAILED_STATUSES = new Set(["FAILED", "CANCELLED"]);

function molliePaymentId(payment) {
    return payment?.paymentId ?? payment?.id ?? payment?.providerPaymentId ?? null;
}

function bookingIdFromPayment(payment) {
    return payment?.raw?.metadata?.bookingId ?? payment?.metadata?.bookingId ?? null;
}

function whereForMolliePayment(payment) {
    const paymentId = molliePaymentId(payment);
    const bookingId = bookingIdFromPayment(payment);
    const OR = [];

    if (bookingId) OR.push({ id: bookingId });
    if (paymentId) {
        OR.push({
            providerPayload: {
                path: ["paymentId"],
                equals: paymentId,
            },
        });
        OR.push({
            providerPayload: {
                path: ["id"],
                equals: paymentId,
            },
        });
    }

    return OR.length > 0 ? { OR, paymentProvider: "MOLLIE" } : null;
}

export async function processMolliePaymentStatus(tx, payment) {
    const providerPaymentId = molliePaymentId(payment);
    if (!providerPaymentId) {
        return { action: "ignored", reason: "missing-payment-id" };
    }

    const where = whereForMolliePayment(payment);
    if (!where) {
        return { action: "ignored", reason: "missing-booking-id", providerPaymentId };
    }

    const booking = await tx.booking.findFirst({ where });
    if (!booking) {
        return { action: "ignored", reason: "booking-not-found", providerPaymentId };
    }

    const status = payment.status ?? "PENDING";
    if (PAID_STATUSES.has(status)) {
        return markBookingPaid(tx, booking, {
            paidAt: new Date(),
            paymentProvider: "MOLLIE",
            providerPayload: payment,
        });
    }

    if (FAILED_STATUSES.has(status)) {
        return markBookingFailedAndRelease(tx, booking, {
            paymentProvider: "MOLLIE",
            providerPayload: payment,
        });
    }

    return {
        action: "ignored",
        reason: `status-${status}`,
        bookingId: booking.id,
        providerPaymentId,
    };
}
