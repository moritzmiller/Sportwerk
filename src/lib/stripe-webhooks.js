import {
    markBookingFailedAndRelease,
    markBookingPaid,
    markBookingRefundedAndRelease,
} from "./payment-state.js";

const PAID_EVENTS = new Set([
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "payment_intent.succeeded",
]);
const PENDING_EVENTS = new Set([
    "payment_intent.processing",
]);
const FAILED_EVENTS = new Set([
    "checkout.session.expired",
    "checkout.session.async_payment_failed",
    "payment_intent.payment_failed",
    "payment_intent.canceled",
]);
const REFUNDED_EVENTS = new Set([
    "charge.refunded",
    "refund.updated",
]);

function getBookingWhere(event) {
    const object = event?.data?.object ?? {};
    const bookingId = object.metadata?.bookingId || object.client_reference_id || null;
    const sessionId = object.object === "checkout.session" ? object.id : null;
    const paymentIntentId =
        object.object === "payment_intent"
            ? object.id
            : typeof object.payment_intent === "string"
                ? object.payment_intent
                : object.payment_intent?.id ?? null;

    const OR = [];
    if (bookingId) OR.push({ id: bookingId });
    if (sessionId) OR.push({ stripeCheckoutSessionId: sessionId });
    if (paymentIntentId) OR.push({ stripePaymentIntentId: paymentIntentId });

    return {
        where: OR.length > 0 ? { OR } : null,
        ids: { bookingId, sessionId, paymentIntentId },
    };
}

function getStripeStatus(event) {
    return event?.data?.object?.payment_status ?? event?.data?.object?.status ?? event?.type ?? null;
}

function isSucceededRefundEvent(event) {
    const object = event?.data?.object ?? {};

    if (event?.type === "charge.refunded") {
        return object.refunded === true;
    }

    if (event?.type === "refund.updated") {
        return object.status === "succeeded";
    }

    return false;
}

async function markBookingStripePending(tx, booking, data = {}) {
    if (!booking?.id) {
        throw new Error("booking is required.");
    }

    if (booking.status !== "AWAITING_PAYMENT") {
        return { action: "ignored", reason: `status-${booking.status}`, bookingId: booking.id };
    }

    const result = await tx.booking.updateMany({
        where: { id: booking.id, status: "AWAITING_PAYMENT" },
        data,
    });

    return {
        action: result.count === 1 ? "pending" : "ignored",
        reason: result.count === 1 ? null : "concurrent-update",
        bookingId: booking.id,
    };
}

export async function processStripeWebhookEvent(tx, event) {
    const eventType = event?.type;

    if (!eventType) {
        return { action: "ignored", reason: "missing-event-type" };
    }

    if (
        !PAID_EVENTS.has(eventType) &&
        !PENDING_EVENTS.has(eventType) &&
        !FAILED_EVENTS.has(eventType) &&
        !REFUNDED_EVENTS.has(eventType)
    ) {
        return { action: "ignored", reason: "unsupported-event-type", eventType };
    }

    if (REFUNDED_EVENTS.has(eventType) && !isSucceededRefundEvent(event)) {
        return { action: "ignored", reason: "refund-not-succeeded", eventType };
    }

    const { where, ids } = getBookingWhere(event);
    if (!where) {
        return { action: "ignored", reason: "missing-booking-id", eventType };
    }

    const booking = await tx.booking.findFirst({ where });
    if (!booking) {
        return { action: "ignored", reason: "booking-not-found", eventType };
    }

    if (PAID_EVENTS.has(eventType)) {
        const status = getStripeStatus(event);
        const isCheckoutCompleted = eventType === "checkout.session.completed";
        const isPaidCheckout = event?.data?.object?.payment_status === "paid";

        if (isCheckoutCompleted && !isPaidCheckout) {
            return markBookingStripePending(tx, booking, {
                paymentProvider: "STRIPE",
                stripeCheckoutSessionId: ids.sessionId ?? booking.stripeCheckoutSessionId,
                stripePaymentIntentId: ids.paymentIntentId ?? booking.stripePaymentIntentId,
                stripeStatus: status,
                providerPayload: event,
            });
        }

        return markBookingPaid(tx, booking, {
            paidAt: new Date(),
            paymentProvider: "STRIPE",
            stripeCheckoutSessionId: ids.sessionId ?? booking.stripeCheckoutSessionId,
            stripePaymentIntentId: ids.paymentIntentId ?? booking.stripePaymentIntentId,
            stripeStatus: status,
            providerPayload: event,
        });
    }

    if (PENDING_EVENTS.has(eventType)) {
        return markBookingStripePending(tx, booking, {
            paymentProvider: "STRIPE",
            stripeCheckoutSessionId: ids.sessionId ?? booking.stripeCheckoutSessionId,
            stripePaymentIntentId: ids.paymentIntentId ?? booking.stripePaymentIntentId,
            stripeStatus: getStripeStatus(event),
            providerPayload: event,
        });
    }

    if (REFUNDED_EVENTS.has(eventType)) {
        return markBookingRefundedAndRelease(tx, booking, {
            paymentCancelledAt: new Date(),
            paymentCancellationReason: "Stripe refund webhook",
            stripeCheckoutSessionId: ids.sessionId ?? booking.stripeCheckoutSessionId,
            stripePaymentIntentId: ids.paymentIntentId ?? booking.stripePaymentIntentId,
            stripeStatus: getStripeStatus(event),
            providerPayload: event,
        });
    }

    return markBookingFailedAndRelease(tx, booking, {
        paymentProvider: "STRIPE",
        stripeCheckoutSessionId: ids.sessionId ?? booking.stripeCheckoutSessionId,
        stripePaymentIntentId: ids.paymentIntentId ?? booking.stripePaymentIntentId,
        stripeStatus: getStripeStatus(event),
        providerPayload: event,
    });
}
