import { calculateGatekeeperFee, roundMoney } from "./fees.js";

export const PAYMENT_METHODS = Object.freeze([
    "STRIPE",
    "MOLLIE_PAY_BY_BANK",
    "PAYPAL",
    "INVOICE",
    "BANK_TRANSFER",
]);
export const DEFAULT_ALLOWED_PAYMENT_METHODS = Object.freeze([
    "STRIPE",
    "MOLLIE_PAY_BY_BANK",
    "PAYPAL",
    "INVOICE",
    "BANK_TRANSFER",
]);

const PAYMENT_METHOD_LABELS = Object.freeze({
    STRIPE: "Kreditkarte",
    MOLLIE_PAY_BY_BANK: "Pay by Bank",
    PAYPAL: "PayPal",
    INVOICE: "Rechnung",
    BANK_TRANSFER: "Banküberweisung",
});

const PAYMENT_METHOD_DESCRIPTIONS = Object.freeze({
    STRIPE: "Kartenzahlung über Stripe Checkout.",
    MOLLIE_PAY_BY_BANK: "Bankzahlung über Mollie Pay by Bank.",
    PAYPAL: "Online-Zahlung über PayPal.",
    INVOICE: "Manuelle Zahlung per Rechnung.",
    BANK_TRANSFER: "Manuelle Zahlung per Banküberweisung.",
});

const PROVIDER_FEE_RULES = Object.freeze({
    STRIPE: { percent: 1.5, fixed: 0.25 },
    MOLLIE_PAY_BY_BANK: { percent: 0.9, fixed: 0.25 },
    PAYPAL: { percent: 2.99, fixed: 0.39 },
    INVOICE: { percent: 0, fixed: 0 },
    BANK_TRANSFER: { percent: 0, fixed: 0 },
});

export function normalizePaymentMethod(value, fallback = "STRIPE") {
    const upper = String(value ?? "").trim().toUpperCase();
    return PAYMENT_METHODS.includes(upper) ? upper : fallback;
}

export function normalizeAllowedPaymentMethods(value, fallback = DEFAULT_ALLOWED_PAYMENT_METHODS) {
    const raw = Array.isArray(value) ? value : [];
    const methods = raw
        .map((method) => normalizePaymentMethod(method, null))
        .filter(Boolean)
        .filter((method, index, items) => items.indexOf(method) === index);

    return methods.length > 0 ? methods : [...fallback];
}

export function isManualPaymentMethod(method) {
    return method === "INVOICE" || method === "BANK_TRANSFER";
}

export function isOnlinePaymentMethod(method) {
    return method === "PAYPAL" || method === "STRIPE" || method === "MOLLIE_PAY_BY_BANK";
}

export function getPaymentMethodLabel(method) {
    return PAYMENT_METHOD_LABELS[method] ?? method ?? "n/a";
}

export function getPaymentMethodDescription(method) {
    return PAYMENT_METHOD_DESCRIPTIONS[method] ?? "";
}

export function getPaymentMethodFeeEstimate(method, amount) {
    const totalAmount = roundMoney(amount);
    const rule = PROVIDER_FEE_RULES[method] ?? PROVIDER_FEE_RULES.STRIPE;
    const providerFee = totalAmount > 0 ? roundMoney(totalAmount * (rule.percent / 100) + rule.fixed) : 0;

    const gatekeeperFee = calculateGatekeeperFee(totalAmount, 1);

    return {
        method,
        label: getPaymentMethodLabel(method),
        totalAmount,
        providerPercent: rule.percent,
        providerFixed: rule.fixed,
        providerFee,
        gatekeeperFee,
        customerTotal: roundMoney(totalAmount + gatekeeperFee),
        organizerNetEstimate: roundMoney(totalAmount - providerFee),
    };
}

export function getPaymentMethodOptions(methods = DEFAULT_ALLOWED_PAYMENT_METHODS, amount = 0) {
    return normalizeAllowedPaymentMethods(methods).map((method) => ({
        value: method,
        label: getPaymentMethodLabel(method),
        description: getPaymentMethodDescription(method),
        fee: getPaymentMethodFeeEstimate(method, amount),
    }));
}

export function isPaymentMethodAllowed(event, method) {
    const allowed = normalizeAllowedPaymentMethods(event?.allowedPaymentMethods);
    return allowed.includes(normalizePaymentMethod(method, null));
}
