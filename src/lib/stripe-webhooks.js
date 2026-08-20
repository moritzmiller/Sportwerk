import {
    markBookingFailedAndRelease,
    markBookingPaid,
} from "./payment-state.js";

const PAID_EVENTS = new Set([
    "checkout.session.completed",
    "payment_intent.succeeded",
]);
const FAILED_EVENTS = new Set([
    "checkout.session.expired",
    "payment_intent.payment_failed",
    "payment_intent.canceled",
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

export async function processStripeWebhookEvent(tx, event) {
    const eventType = event?.type;

    if (!eventType) {
        return { action: "ignored", reason: "missing-event-type" };
    }

    if (!PAID_EVENTS.has(eventType) && !FAILED_EVENTS.has(eventType)) {
        return { action: "ignored", reason: "unsupported-event-type", eventType };
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
        return markBookingPaid(tx, booking, {
            paidAt: new Date(),
            paymentProvider: "STRIPE",
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
