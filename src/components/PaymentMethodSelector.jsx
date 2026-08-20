"use client";

import {
    DEFAULT_ALLOWED_PAYMENT_METHODS,
    getPaymentMethodOptions,
    normalizeAllowedPaymentMethods,
} from "@/lib/payment-methods";
import { calculateGatekeeperFee } from "@/lib/fees";
import { formatMoney } from "@/lib/bookings";

export default function PaymentMethodSelector({
    value = DEFAULT_ALLOWED_PAYMENT_METHODS,
    onChange,
    amount = 0,
}) {
    const selected = normalizeAllowedPaymentMethods(value);
    const options = getPaymentMethodOptions(DEFAULT_ALLOWED_PAYMENT_METHODS, amount);
    const gatekeeperFee = calculateGatekeeperFee(amount, 1);

    function toggle(method) {
        const next = selected.includes(method)
            ? selected.filter((item) => item !== method)
            : [...selected, method];
        onChange(normalizeAllowedPaymentMethods(next));
    }

    return (
        <section className="payment-method-config stack">
            <div className="section-title-row">
                <h3>Zahlungsmittel</h3>
                <span className="text-muted">
                    GateKeeper-Gebuehr: {formatMoney(gatekeeperFee)}
                </span>
            </div>
            <div className="payment-grid">
                {options.map((option) => (
                    <label
                        key={option.value}
                        className={`payment-option ${selected.includes(option.value) ? "is-active" : ""}`}
                    >
                        <input
                            type="checkbox"
                            checked={selected.includes(option.value)}
                            onChange={() => toggle(option.value)}
                        />
                        <span>
                            <strong>{option.label}</strong>
                            <small>{option.description}</small>
                            <small>
                                Provider ca. {formatMoney(option.fee.providerFee)} | GateKeeper{" "}
                                {formatMoney(option.fee.gatekeeperFee)}
                            </small>
                        </span>
                    </label>
                ))}
            </div>
        </section>
    );
}
