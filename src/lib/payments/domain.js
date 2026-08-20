import crypto from "node:crypto";
import { roundMoney } from "../fees.js";

export const PAYMENT_PROVIDERS = Object.freeze([
    "STRIPE",
    "PAYPAL",
    "MOLLIE",
    "ADYEN",
    "GOCARDLESS",
    "MANUAL",
    "FREE",
]);

export const PAYMENT_STATUSES = Object.freeze([
    "PENDING",
    "REQUIRES_ACTION",
    "PROCESSING",
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
    "REFUNDED",
    "PARTIALLY_REFUNDED",
    "CHARGED_BACK",
]);

export const PAYMENT_LEDGER_ENTRY_TYPES = Object.freeze([
    "GROSS_PAYMENT",
    "PROVIDER_FEE",
    "GATEKEEPER_FEE",
    "ORGANIZER_NET",
    "REFUND",
    "REFUND_FEE",
    "CHARGEBACK",
    "ADJUSTMENT",
]);

export function normalizePaymentProvider(provider, fallback = "STRIPE") {
    const normalized = String(provider ?? "").trim().toUpperCase();
    return PAYMENT_PROVIDERS.includes(normalized) ? normalized : fallback;
}

export function normalizePaymentStatus(status, fallback = "PENDING") {
    const normalized = String(status ?? "").trim().toUpperCase();
    return PAYMENT_STATUSES.includes(normalized) ? normalized : fallback;
}

export function eurosToCents(amount) {
    return Math.round(roundMoney(amount) * 100);
}

export function centsToEuros(cents) {
    return roundMoney((Number(cents) || 0) / 100);
}

export function createPaymentIdempotencyKey({
    bookingId,
    provider,
    purpose = "checkout",
}) {
    if (!bookingId) throw new Error("bookingId is required.");
    const normalizedProvider = normalizePaymentProvider(provider);
    const normalizedPurpose = String(purpose || "checkout").trim().toLowerCase();
    return `gatekeeper:${normalizedProvider.toLowerCase()}:${normalizedPurpose}:${bookingId}`;
}

export function createWebhookDedupeKey(provider, providerEventId) {
    if (!providerEventId) throw new Error("providerEventId is required.");
    return `${normalizePaymentProvider(provider)}:${String(providerEventId)}`;
}

export function createGatekeeperPaymentReference(prefix = "gkp") {
    return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function buildPaymentProviderRequest({
    booking,
    provider,
    method,
    amountCents,
    currency = "EUR",
    returnUrl,
    cancelUrl,
    webhookUrl,
    metadata = {},
}) {
    if (!booking?.id) throw new Error("booking is required.");
    if (!returnUrl || !cancelUrl) throw new Error("returnUrl and cancelUrl are required.");
    const normalizedProvider = normalizePaymentProvider(provider);
    const normalizedAmount = Number(amountCents);
    if (!Number.isInteger(normalizedAmount) || normalizedAmount < 0) {
        throw new Error("amountCents must be a non-negative integer.");
    }

    return {
        gatekeeperPaymentId: createGatekeeperPaymentReference(),
        bookingId: booking.id,
        provider: normalizedProvider,
        method,
        amountCents: normalizedAmount,
        currency: String(currency || "EUR").toUpperCase(),
        idempotencyKey: createPaymentIdempotencyKey({
            bookingId: booking.id,
            provider: normalizedProvider,
        }),
        returnUrl,
        cancelUrl,
        webhookUrl,
        metadata: {
            bookingId: booking.id,
            eventId: booking.eventId ?? null,
            ...metadata,
        },
    };
}

export function buildLedgerEntries({
    paymentId,
    bookingId,
    amountCents,
    providerFeeCents = 0,
    gatekeeperFeeCents = 0,
    currency = "EUR",
    referenceType = "booking",
    referenceId = bookingId,
}) {
    if (!paymentId) throw new Error("paymentId is required.");
    if (!bookingId) throw new Error("bookingId is required.");

    const gross = Number(amountCents) || 0;
    const providerFee = Math.max(0, Number(providerFeeCents) || 0);
    const gatekeeperFee = Math.max(0, Number(gatekeeperFeeCents) || 0);
    const organizerNet = Math.max(0, gross - providerFee - gatekeeperFee);
    const base = {
        paymentId,
        bookingId,
        currency: String(currency || "EUR").toUpperCase(),
        referenceType,
        referenceId,
    };

    return [
        {
            ...base,
            type: "GROSS_PAYMENT",
            direction: "CREDIT",
            amountCents: gross,
            description: "Customer payment gross amount",
        },
        {
            ...base,
            type: "PROVIDER_FEE",
            direction: "DEBIT",
            amountCents: providerFee,
            description: "External payment provider fee",
        },
        {
            ...base,
            type: "GATEKEEPER_FEE",
            direction: "DEBIT",
            amountCents: gatekeeperFee,
            description: "Gatekeeper platform fee",
        },
        {
            ...base,
            type: "ORGANIZER_NET",
            direction: "CREDIT",
            amountCents: organizerNet,
            description: "Organizer net receivable",
        },
    ];
}

export function validatePaymentProviderAdapter(adapter) {
    const required = [
        "createPayment",
        "getPaymentStatus",
        "refundPayment",
        "cancelPayment",
        "handleWebhook",
    ];
    const missing = required.filter((name) => typeof adapter?.[name] !== "function");
    if (missing.length > 0) {
        throw new Error(`Payment provider adapter is missing: ${missing.join(", ")}`);
    }
    return true;
}
