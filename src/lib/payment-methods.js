export const PAYMENT_METHODS = Object.freeze(["PAYPAL", "STRIPE", "INVOICE", "BANK_TRANSFER"]);
export const DEFAULT_ALLOWED_PAYMENT_METHODS = Object.freeze(["PAYPAL", "STRIPE", "INVOICE", "BANK_TRANSFER"]);

const PAYMENT_METHOD_LABELS = Object.freeze({
    PAYPAL: "PayPal",
    STRIPE: "Karte oder SEPA",
    INVOICE: "Rechnung",
    BANK_TRANSFER: "Banküberweisung",
});

const PAYMENT_METHOD_DESCRIPTIONS = Object.freeze({
    PAYPAL: "Online-Zahlung über PayPal.",
    STRIPE: "Online-Zahlung per Karte oder SEPA-Lastschrift über Stripe Checkout.",
    INVOICE: "Manuelle Zahlung per Rechnung.",
    BANK_TRANSFER: "Manuelle Zahlung per Banküberweisung.",
});

const PROVIDER_FEE_RULES = Object.freeze({
    PAYPAL: { percent: 2.49, fixed: 0.35 },
    STRIPE: { percent: 1.5, fixed: 0.25 },
    INVOICE: { percent: 0, fixed: 0 },
    BANK_TRANSFER: { percent: 0, fixed: 0 },
});

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

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

export function normalizeEventPaymentMethods(value, ticketTypes = [], fallback = DEFAULT_ALLOWED_PAYMENT_METHODS) {
    const hasPaidTicket = ticketTypes.some((ticketType) => Number(ticketType?.price || 0) > 0);
    return hasPaidTicket ? normalizeAllowedPaymentMethods(value, fallback) : [];
}

export function isManualPaymentMethod(method) {
    return method === "INVOICE" || method === "BANK_TRANSFER";
}

export function isOnlinePaymentMethod(method) {
    return method === "PAYPAL" || method === "STRIPE";
}

export function getPaymentMethodLabel(method) {
    return PAYMENT_METHOD_LABELS[method] ?? method ?? "n/a";
}

export function getPaymentMethodDescription(method) {
    return PAYMENT_METHOD_DESCRIPTIONS[method] ?? "";
}

export function getPaymentMethodFeeEstimate(method, amount) {
    const totalAmount = roundMoney(amount);
    const rule = PROVIDER_FEE_RULES[method] ?? PROVIDER_FEE_RULES.PAYPAL;
    const providerFee = totalAmount > 0 ? roundMoney(totalAmount * (rule.percent / 100) + rule.fixed) : 0;

    return {
        method,
        label: getPaymentMethodLabel(method),
        totalAmount,
        providerPercent: rule.percent,
        providerFixed: rule.fixed,
        providerFee,
        gatekeeperFee: 0,
        customerTotal: totalAmount,
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
