import {
    getPaymentMethodLabel,
    isManualPaymentMethod,
    normalizePaymentMethod,
} from "./payment-methods.js";

export { isManualPaymentMethod, normalizePaymentMethod };

export function createPaymentReference(bookingId) {
    return `GK-${String(bookingId).slice(0, 8).toUpperCase()}`;
}

export function getManualPaymentDueDate(createdAt = new Date()) {
    const dueDate = new Date(createdAt);
    dueDate.setDate(dueDate.getDate() + 14);
    return dueDate;
}

export function formatManualPaymentDueDate(createdAt = new Date()) {
    return getManualPaymentDueDate(createdAt).toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
}

export function getManualPaymentDetails({ booking, event }) {
    return {
        paymentMethod: booking.paymentMethod,
        paymentMethodLabel: getPaymentMethodLabel(booking.paymentMethod),
        paymentReference: booking.paymentReference,
        dueDate: formatManualPaymentDueDate(booking.createdAt),
        iban: process.env.BANK_TRANSFER_IBAN || null,
        bic: process.env.BANK_TRANSFER_BIC || null,
        accountHolder:
            process.env.BANK_TRANSFER_ACCOUNT_HOLDER ||
            event.owner?.name ||
            "GateKeeper",
    };
}
