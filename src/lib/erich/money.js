export function assertCentAmount(value, fieldName = "amountCents") {
    if (!Number.isInteger(value)) {
        throw new TypeError(`${fieldName} must be an integer cent amount.`);
    }

    if (value < 0) {
        throw new RangeError(`${fieldName} must not be negative.`);
    }

    return value;
}

export function assertCurrency(value, fieldName = "currency") {
    if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) {
        throw new TypeError(`${fieldName} must be a three-letter ISO currency code.`);
    }

    return value;
}

export function createMoneySnapshot({ amountCents, currency = "EUR" }) {
    return {
        amountCents: assertCentAmount(amountCents),
        currency: assertCurrency(currency),
    };
}
