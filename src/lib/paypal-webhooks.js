import {
    markBookingFailedAndRelease,
    markBookingPaid,
    markBookingRefundedAndRelease,
} from "./payment-state.js";

const PAID_EVENTS = new Set(["PAYMENT.CAPTURE.COMPLETED", "CHECKOUT.ORDER.COMPLETED"]);
const FAILED_EVENTS = new Set([
    "PAYMENT.CAPTURE.DECLINED",
    "PAYMENT.CAPTURE.DENIED",
    "CHECKOUT.ORDER.VOIDED",
]);
const REFUNDED_EVENTS = new Set(["PAYMENT.CAPTURE.REFUNDED"]);

function firstDefined(...values) {
    return values.find((value) => typeof value === "string" && value.trim().length > 0) || null;
}

export function extractPayPalWebhookIds(event) {
    const resource = event?.resource || {};
    const firstPurchaseUnit = resource.purchase_units?.[0] || {};
    const firstCapture = firstPurchaseUnit.payments?.captures?.[0] || {};
    const relatedIds = resource.supplementary_data?.related_ids || {};
    const eventType = event?.event_type || "";
    const resourceIsOrder = eventType.startsWith("CHECKOUT.ORDER.");

    return {
        orderId: firstDefined(relatedIds.order_id, resourceIsOrder ? resource.id : null),
        captureId: firstDefined(firstCapture.id, relatedIds.capture_id, resourceIsOrder ? null : resource.id),
    };
}

function whereForPayPalIds({ orderId, captureId }) {
    const OR = [];
    if (orderId) OR.push({ paypalOrderId: orderId });
    if (captureId) OR.push({ paypalCaptureId: captureId });
    return OR.length > 0 ? { OR } : null;
}

async function findBooking(tx, ids) {
    const where = whereForPayPalIds(ids);
    if (!where) return null;
    return tx.booking.findFirst({ where });
}

async function markPaid(tx, booking, event, ids) {
    if (booking.status === "PAID") {
        return { action: "ignored", reason: "already-paid", bookingId: booking.id };
    }

    if (booking.status !== "AWAITING_PAYMENT") {
        return { action: "ignored", reason: `status-${booking.status}`, bookingId: booking.id };
    }

    return markBookingPaid(tx, booking, {
            paidAt: new Date(),
            paypalOrderId: ids.orderId ?? booking.paypalOrderId,
            paypalCaptureId: ids.captureId ?? booking.paypalCaptureId,
            paypalStatus: event?.resource?.status ?? event?.event_type ?? "COMPLETED",
            providerPayload: event,
    });
}

async function markFailed(tx, booking, event, ids) {
    if (booking.status !== "AWAITING_PAYMENT") {
        return { action: "ignored", reason: `status-${booking.status}`, bookingId: booking.id };
    }

    return markBookingFailedAndRelease(tx, booking, {
            paypalOrderId: ids.orderId ?? booking.paypalOrderId,
            paypalCaptureId: ids.captureId ?? booking.paypalCaptureId,
            paypalStatus: event?.resource?.status ?? event?.event_type ?? "FAILED",
            providerPayload: event,
    });
}

async function markRefunded(tx, booking, event, ids) {
    return markBookingRefundedAndRelease(tx, booking, {
            paymentCancelledAt: new Date(),
            paymentCancellationReason: "PayPal refund webhook",
            paypalOrderId: ids.orderId ?? booking.paypalOrderId,
            paypalCaptureId: ids.captureId ?? booking.paypalCaptureId,
            paypalStatus: event?.resource?.status ?? event?.event_type ?? "REFUNDED",
            providerPayload: event,
    });
}

export async function processPayPalWebhookEvent(tx, event) {
    const eventType = event?.event_type;

    if (!eventType) {
        return { action: "ignored", reason: "missing-event-type" };
    }

    if (!PAID_EVENTS.has(eventType) && !FAILED_EVENTS.has(eventType) && !REFUNDED_EVENTS.has(eventType)) {
        return { action: "ignored", reason: "unsupported-event-type", eventType };
    }

    const ids = extractPayPalWebhookIds(event);
    const booking = await findBooking(tx, ids);
    if (!booking) {
        return { action: "ignored", reason: "booking-not-found", eventType };
    }

    if (PAID_EVENTS.has(eventType)) {
        return markPaid(tx, booking, event, ids);
    }

    if (FAILED_EVENTS.has(eventType)) {
        return markFailed(tx, booking, event, ids);
    }

    return markRefunded(tx, booking, event, ids);
}
