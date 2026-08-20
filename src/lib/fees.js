export const GATEKEEPER_FEE_RULE = Object.freeze({
    percentageFee: 4.9,
    fixedFee: 0.49,
    minimumFee: 0,
    maximumFee: null,
    freeTicketFee: 0,
});

export function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

export function calculateGatekeeperFee(amount, quantity = 1, rule = GATEKEEPER_FEE_RULE) {
    const subtotal = roundMoney(amount);
    const normalizedQuantity = Math.max(1, Number(quantity) || 1);

    if (subtotal <= 0) {
        return roundMoney(rule.freeTicketFee);
    }

    const percentageFee = subtotal * (Number(rule.percentageFee || 0) / 100);
    const fixedFee = Number(rule.fixedFee || 0) * normalizedQuantity;
    let fee = percentageFee + fixedFee;

    if (rule.minimumFee !== null && Number.isFinite(Number(rule.minimumFee))) {
        fee = Math.max(fee, Number(rule.minimumFee));
    }

    if (rule.maximumFee !== null && Number.isFinite(Number(rule.maximumFee))) {
        fee = Math.min(fee, Number(rule.maximumFee));
    }

    return roundMoney(fee);
}
