"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getPaymentMethodOptions } from "@/lib/payment-methods";

/*
const LEGACY_PAYMENT_METHODS = [
    { value: "PAYPAL", label: "PayPal" },
    { value: "INVOICE", label: "Rechnung" },
    { value: "BANK_TRANSFER", label: "Banküberweisung" },
];
*/

function createInitialForm(user) {
    return {
        name: user?.name ?? "",
        paypalEmail: user?.paypalEmail ?? "",
        billingName: user?.billingName ?? user?.name ?? "",
        billingStreet: user?.billingStreet ?? "",
        billingStreet2: user?.billingStreet2 ?? "",
        billingPostalCode: user?.billingPostalCode ?? "",
        billingCity: user?.billingCity ?? "",
        billingCountry: user?.billingCountry ?? "DE",
        preferredPaymentMethod: user?.preferredPaymentMethod ?? "STRIPE",
    };
}

export default function ProfileForm({ user }) {
    const router = useRouter();
    const [form, setForm] = useState(() => createInitialForm(user));
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    function updateField(name, value) {
        setForm((current) => ({ ...current, [name]: value }));
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setLoading(true);
        setMessage("Profil wird gespeichert...");

        try {
            const response = await fetch("/api/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });

            const data = await response.json();
            setLoading(false);

            if (!response.ok) {
                setMessage(data.error || "Profil konnte nicht gespeichert werden.");
                return;
            }

            setMessage("Profil gespeichert.");
            router.refresh();
        } catch (error) {
            setLoading(false);
            setMessage("Ein unerwarteter Fehler ist aufgetreten.");
        }
    }

    return (
        <form className="card stack-lg" onSubmit={handleSubmit}>
            <div className="section-title-row">
                <h2>Profil & Rechnungsdaten</h2>
                <span className="text-muted">Für zukünftige Buchungen vorbefüllt</span>
            </div>

            <div className="grid checkout-form__grid">
                <div className="field">
                    <label className="label" htmlFor="profile-name">
                        Anzeigename
                    </label>
                    <input
                        id="profile-name"
                        className="input"
                        value={form.name}
                        onChange={(e) => updateField("name", e.target.value)}
                        placeholder="Dein Name"
                    />
                </div>

                <div className="field">
                    <label className="label" htmlFor="profile-paypal">
                        PayPal E-Mail
                    </label>
                    <input
                        id="profile-paypal"
                        className="input"
                        type="email"
                        value={form.paypalEmail}
                        onChange={(e) => updateField("paypalEmail", e.target.value)}
                        placeholder="du@beispiel.de"
                    />
                </div>

                <div className="field checkout-form__wide">
                    <label className="label" htmlFor="profile-billing-name">
                        Rechnungsname
                    </label>
                    <input
                        id="profile-billing-name"
                        className="input"
                        value={form.billingName}
                        onChange={(e) => updateField("billingName", e.target.value)}
                        placeholder="Rechnungsempfänger"
                    />
                </div>

                <div className="field checkout-form__wide">
                    <label className="label" htmlFor="profile-billing-street">
                        Straße und Hausnummer
                    </label>
                    <input
                        id="profile-billing-street"
                        className="input"
                        value={form.billingStreet}
                        onChange={(e) => updateField("billingStreet", e.target.value)}
                        placeholder="Musterstraße 12"
                    />
                </div>

                <div className="field">
                    <label className="label" htmlFor="profile-billing-postal">
                        PLZ
                    </label>
                    <input
                        id="profile-billing-postal"
                        className="input"
                        value={form.billingPostalCode}
                        onChange={(e) =>
                            updateField("billingPostalCode", e.target.value)
                        }
                        placeholder="01067"
                    />
                </div>

                <div className="field">
                    <label className="label" htmlFor="profile-billing-city">
                        Ort
                    </label>
                    <input
                        id="profile-billing-city"
                        className="input"
                        value={form.billingCity}
                        onChange={(e) => updateField("billingCity", e.target.value)}
                        placeholder="Dresden"
                    />
                </div>

                <div className="field">
                    <label className="label" htmlFor="profile-billing-country">
                        Land
                    </label>
                    <input
                        id="profile-billing-country"
                        className="input"
                        maxLength={2}
                        value={form.billingCountry}
                        onChange={(e) =>
                            updateField("billingCountry", e.target.value.toUpperCase())
                        }
                        placeholder="DE"
                    />
                </div>

                <div className="field">
                    <label className="label" htmlFor="profile-billing-extra">
                        Zusatz
                    </label>
                    <input
                        id="profile-billing-extra"
                        className="input"
                        value={form.billingStreet2}
                        onChange={(e) => updateField("billingStreet2", e.target.value)}
                        placeholder="Firma, c/o, Etage"
                    />
                </div>
            </div>

            <div className="field">
                <label className="label" htmlFor="profile-payment">
                    Bevorzugte Zahlungsmethode
                </label>
                <select
                    id="profile-payment"
                    className="select"
                    value={form.preferredPaymentMethod}
                    onChange={(e) =>
                        updateField("preferredPaymentMethod", e.target.value)
                    }
                >
                    {getPaymentMethodOptions().map((method) => (
                        <option key={method.value} value={method.value}>
                            {method.label}
                        </option>
                    ))}
                </select>
            </div>

            <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? "Speichert..." : "Profil speichern"}
            </button>

            {message && <p className="auth-message">{message}</p>}
        </form>
    );
}
