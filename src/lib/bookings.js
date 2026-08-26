import { getPaymentMethodLabel as getConfiguredPaymentMethodLabel } from "./payment-methods.js";
import { calculateGatekeeperFee } from "./fees.js";

export function calculateBookingTotals(price, quantity, discountAmount = 0) {
    const unitPrice = Number(price) || 0;
    const normalizedQuantity = Math.max(1, Math.min(10, Number(quantity) || 1));
    const subtotal = unitPrice * normalizedQuantity;
    const normalizedDiscount = Math.min(subtotal, Math.max(0, Number(discountAmount) || 0));
    const discountedSubtotal = subtotal - normalizedDiscount;
    const serviceFee = calculateGatekeeperFee(discountedSubtotal, normalizedQuantity);

    return {
        unitPrice,
        quantity: normalizedQuantity,
        subtotal,
        discountAmount: normalizedDiscount,
        discountedSubtotal,
        serviceFee,
        totalAmount: discountedSubtotal + serviceFee,
        currency: "EUR",
    };
}

export function formatMoney(amount) {
    return Number(amount).toLocaleString("de-DE", {
        style: "currency",
        currency: "EUR",
    });
}

function toIsoString(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function serializeBooking(booking) {
    return {
        id: booking.id,
        eventId: booking.eventId,
        attendeeId: booking.attendeeId,
        purchaserName: booking.purchaserName,
        purchaserEmail: booking.purchaserEmail,
        purchaserPhone: booking.purchaserPhone,
        notes: booking.notes,
        newsletter: booking.newsletter,
        quantity: booking.quantity,
        currency: booking.currency,
        unitPrice: booking.unitPrice,
        serviceFee: booking.serviceFee,
        discountAmount: booking.discountAmount ?? 0,
        totalAmount: booking.totalAmount,
        ticketTypeId: booking.ticketTypeId ?? null,
        ticketTypeName: booking.ticketTypeName ?? null,
        promoCodeId: booking.promoCodeId ?? null,
        promoCode: booking.promoCode ?? null,
        billingName: booking.billingName,
        billingStreet: booking.billingStreet,
        billingStreet2: booking.billingStreet2,
        billingPostalCode: booking.billingPostalCode,
        billingCity: booking.billingCity,
        billingCountry: booking.billingCountry,
        paymentMethod: booking.paymentMethod,
        status: booking.status,
        paymentProvider: booking.paymentProvider,
        paymentReference: booking.paymentReference,
        paidAt: toIsoString(booking.paidAt),
        paymentReminderCount: booking.paymentReminderCount,
        lastPaymentReminderAt: toIsoString(booking.lastPaymentReminderAt),
        paymentCancelledAt: toIsoString(booking.paymentCancelledAt),
        paymentCancellationReason: booking.paymentCancellationReason,
        checkedInAt: toIsoString(booking.checkedInAt),
        checkedInById: booking.checkedInById ?? null,
        checkedInVia: booking.checkedInVia ?? null,
        transferToName: booking.transferToName ?? null,
        transferToEmail: booking.transferToEmail ?? null,
        paypalOrderId: booking.paypalOrderId,
        paypalCaptureId: booking.paypalCaptureId,
        paypalApprovalUrl: booking.paypalApprovalUrl,
        paypalStatus: booking.paypalStatus,
        stripeCheckoutSessionId: booking.stripeCheckoutSessionId ?? null,
        stripePaymentIntentId: booking.stripePaymentIntentId ?? null,
        stripeStatus: booking.stripeStatus ?? null,
        stripeCheckoutUrl: booking.providerPayload?.url ?? null,
        registrationData: booking.registrationData ?? null,
        createdAt: toIsoString(booking.createdAt),
        updatedAt: toIsoString(booking.updatedAt),
        event: booking.event
            ? {
                  id: booking.event.id,
                  title: booking.event.title,
                  location: booking.event.location,
                  city: booking.event.city,
                  startDate: toIsoString(booking.event.startDate),
              }
            : null,
        tickets: Array.isArray(booking.tickets)
            ? booking.tickets.map((ticket) => ({
                  id: ticket.id,
                  ticketNumber: ticket.ticketNumber,
                  ticketTypeName: ticket.ticketTypeName ?? booking.ticketTypeName ?? null,
                  holderName: ticket.holderName ?? booking.purchaserName ?? null,
                  status: ticket.status,
                  checkedInAt: toIsoString(ticket.checkedInAt),
              }))
            : [],
    };
}

export function getBookingStatusLabel(status) {
    switch (status) {
        case "PAID":
            return "Bezahlt";
        case "FAILED":
            return "Fehlgeschlagen";
        case "CANCELLED":
            return "Abgebrochen";
        case "REFUNDED":
            return "Erstattet";
        case "AWAITING_PAYMENT":
        default:
            return "Wartet auf Zahlung";
    }
}

export function getBookingStatusTone(status) {
    switch (status) {
        case "PAID":
            return "booking-status--paid";
        case "FAILED":
            return "booking-status--failed";
        case "CANCELLED":
            return "booking-status--cancelled";
        case "REFUNDED":
            return "booking-status--cancelled";
        case "AWAITING_PAYMENT":
        default:
            return "booking-status--pending";
    }
}

export function getPaymentMethodLabel(method) {
    return getConfiguredPaymentMethodLabel(method);
/*
    switch (method) {
        case "PAYPAL":
            return "PayPal";
        case "INVOICE":
            return "Rechnung";
        case "BANK_TRANSFER":
            return "Banküberweisung";
        default:
            return method ?? "n/a";
    }
*/
}
