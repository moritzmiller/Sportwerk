"use client";

import { useState } from "react";
import { calculateBookingTotals, formatMoney } from "@/lib/bookings";
import { formatEventPrice } from "@/lib/events";
import {
    getPaymentMethodOptions,
    normalizeAllowedPaymentMethods,
} from "@/lib/payment-methods";
import { createFallbackTicketType } from "@/lib/ticket-types";

function createInitialForm(initialCustomer, allowedPaymentMethods) {
    const preferred = initialCustomer?.preferredPaymentMethod;
    const paymentMethod = allowedPaymentMethods.includes(preferred)
        ? preferred
        : allowedPaymentMethods[0] ?? "PAYPAL";

    return {
        purchaserName: initialCustomer?.name ?? "",
        purchaserEmail: initialCustomer?.email ?? "",
        purchaserPhone: initialCustomer?.phone ?? "",
        notes: "",
        newsletter: true,
        termsAccepted: false,
        billingName: initialCustomer?.billingName ?? initialCustomer?.name ?? "",
        billingStreet: initialCustomer?.billingStreet ?? "",
        billingStreet2: initialCustomer?.billingStreet2 ?? "",
        billingPostalCode: initialCustomer?.billingPostalCode ?? "",
        billingCity: initialCustomer?.billingCity ?? "",
        billingCountry: initialCustomer?.billingCountry ?? "DE",
        paymentMethod,
        promoCode: "",
    };
}

export default function CheckoutForm({ event, initialCustomer }) {
    const allowedPaymentMethods = normalizeAllowedPaymentMethods(event.allowedPaymentMethods);
    const ticketTypes =
        event.ticketTypes?.length > 0
            ? event.ticketTypes
            : [createFallbackTicketType(event)];
    const [selectedTicketTypeId, setSelectedTicketTypeId] = useState(
        ticketTypes.find((ticketType) => ticketType.isDefault)?.id ?? ticketTypes[0]?.id ?? ""
    );
    const [formStartedAt] = useState(() => Date.now());
    const [quantity, setQuantity] = useState(1);
    const [form, setForm] = useState(() => createInitialForm(initialCustomer, allowedPaymentMethods));
    const [website, setWebsite] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    const selectedTicketType =
        ticketTypes.find((ticketType) => ticketType.id === selectedTicketTypeId) ??
        ticketTypes[0];
    const basePrice = formatEventPrice(selectedTicketType?.price ?? event.price);
    const eventRemaining =
        event.capacity && Number.isFinite(Number(event.capacity))
            ? Math.max(0, Number(event.capacity || 0) - Number(event.soldTickets || 0))
            : null;
    const typeRemaining = selectedTicketType?.remainingQuota ?? null;
    const maxQuantity = Math.max(
        1,
        Math.min(
            10,
            selectedTicketType?.maxPerBooking ? Number(selectedTicketType.maxPerBooking) : 10,
            eventRemaining === null ? 10 : Math.max(1, eventRemaining),
            typeRemaining === null ? 10 : Math.max(1, typeRemaining)
        )
    );
    const normalizedQuantity = Math.min(quantity, maxQuantity);
    const totals = calculateBookingTotals(selectedTicketType?.price ?? event.price, normalizedQuantity);
    const paymentMethods = getPaymentMethodOptions(allowedPaymentMethods, totals.totalAmount);

    function updateField(name, value) {
        setForm((current) => ({
            ...current,
            [name]: value,
        }));
    }

    async function handleSubmit(eventSubmit) {
        eventSubmit.preventDefault();

        if (!form.termsAccepted) {
            setMessage("Bitte akzeptiere die Bedingungen.");
            return;
        }

        setLoading(true);
        setMessage("Buchung wird vorbereitet...");

        try {
            const response = await fetch("/api/bookings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    eventId: event.id,
                    quantity: normalizedQuantity,
                    ticketTypeId: selectedTicketType?.id ?? null,
                    website,
                    formStartedAt,
                    ...form,
                }),
            });

            const data = await response.json();
            setLoading(false);

            if (!response.ok) {
                setMessage(
                    data.error || "Die Buchung konnte nicht vorbereitet werden."
                );
                return;
            }

            if (data.directComplete) {
                window.location.href = `/events/${event.id}/checkout?bookingId=${data.bookingId}`;
                return;
            }

            if (data.manualComplete) {
                setMessage("Deine Buchung wurde gespeichert. Zahlungsdetails folgen.");
                window.location.href = `/events/${event.id}/checkout?bookingId=${data.bookingId}`;
                return;
            }

            if (data.approvalUrl) {
                setMessage(
                    form.paymentMethod === "STRIPE"
                        ? "Weiterleitung zu Stripe..."
                        : "Weiterleitung zu PayPal..."
                );
                window.location.href = data.approvalUrl;
                return;
            }

            setMessage("Die Zahlung konnte nicht gestartet werden.");
        } catch (error) {
            setLoading(false);
            setMessage("Ein unerwarteter Fehler ist aufgetreten.");
        }
    }

    return (
        <form className="checkout-form stack-lg" onSubmit={handleSubmit}>
            <input
                type="text"
                name="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="sr-only"
            />

            <section className="card stack">
                <div className="section-title-row">
                    <h2>Deine Daten</h2>
                    <span className="text-muted">Sichere Buchung ohne GateKeeper-Gebühr</span>
                </div>

                <div className="grid checkout-form__grid">
                    <div className="field">
                        <label className="label" htmlFor="purchaserName">
                            Voller Name
                        </label>
                        <input
                            id="purchaserName"
                            className="input"
                            value={form.purchaserName}
                            onChange={(e) => updateField("purchaserName", e.target.value)}
                            placeholder="Max Mustermann"
                            required
                        />
                    </div>

                    <div className="field">
                        <label className="label" htmlFor="purchaserEmail">
                            E-Mail
                        </label>
                        <input
                            id="purchaserEmail"
                            type="email"
                            className="input"
                            value={form.purchaserEmail}
                            onChange={(e) =>
                                updateField("purchaserEmail", e.target.value)
                            }
                            placeholder="max@beispiel.de"
                            required
                        />
                    </div>

                    <div className="field">
                        <label className="label" htmlFor="purchaserPhone">
                            Telefon
                        </label>
                        <input
                            id="purchaserPhone"
                            type="tel"
                            className="input"
                            value={form.purchaserPhone}
                            onChange={(e) =>
                                updateField("purchaserPhone", e.target.value)
                            }
                            placeholder="+49 ..."
                        />
                    </div>

                    <div className="field checkout-form__wide">
                        <label className="label" htmlFor="notes">
                            Hinweise
                        </label>
                        <textarea
                            id="notes"
                            className="textarea"
                            value={form.notes}
                            onChange={(e) => updateField("notes", e.target.value)}
                            placeholder="Zum Beispiel: barrierefreier Zugang oder Ankunftszeit."
                        />
                    </div>
                </div>
            </section>

            <section className="card stack">
                <div className="section-title-row">
                    <h2>Tickettyp</h2>
                    <span className="text-muted">Preis und Kontingent je Typ</span>
                </div>

                <div className="stack-sm">
                    {ticketTypes.map((ticketType) => (
                        <label
                            key={ticketType.id || ticketType.name}
                            className={`payment-option ${
                                selectedTicketType?.id === ticketType.id ? "is-active" : ""
                            }`}
                        >
                            <input
                                type="radio"
                                name="ticketType"
                                value={ticketType.id ?? ""}
                                checked={selectedTicketType?.id === ticketType.id}
                                onChange={() => {
                                    setSelectedTicketTypeId(ticketType.id ?? "");
                                    setQuantity(1);
                                }}
                            />
                            <span>
                                <strong>{ticketType.name}</strong>
                                <small>
                                    {ticketType.description ||
                                        `Preis ${formatMoney(ticketType.price || 0)}${
                                            ticketType.remainingQuota === null
                                                ? ""
                                                : `, noch ${ticketType.remainingQuota} verfügbar`
                                        }`}
                                </small>
                            </span>
                        </label>
                    ))}
                </div>
            </section>

            <section className="card stack">
                <div className="section-title-row">
                    <h2>Rechnungsadresse</h2>
                    <span className="text-muted">
                        Wird mit der Bestellung gespeichert
                    </span>
                </div>

                <div className="grid checkout-form__grid">
                    <div className="field checkout-form__wide">
                        <label className="label" htmlFor="billingName">
                            Rechnungsname
                        </label>
                        <input
                            id="billingName"
                            className="input"
                            value={form.billingName}
                            onChange={(e) => updateField("billingName", e.target.value)}
                            placeholder="Rechnungsempfänger"
                            required
                        />
                    </div>

                    <div className="field checkout-form__wide">
                        <label className="label" htmlFor="billingStreet">
                            Straße und Hausnummer
                        </label>
                        <input
                            id="billingStreet"
                            className="input"
                            value={form.billingStreet}
                            onChange={(e) =>
                                updateField("billingStreet", e.target.value)
                            }
                            placeholder="Musterstraße 12"
                            required
                        />
                    </div>

                    <div className="field">
                        <label className="label" htmlFor="billingPostalCode">
                            PLZ
                        </label>
                        <input
                            id="billingPostalCode"
                            className="input"
                            value={form.billingPostalCode}
                            onChange={(e) =>
                                updateField("billingPostalCode", e.target.value)
                            }
                            placeholder="01067"
                            required
                        />
                    </div>

                    <div className="field">
                        <label className="label" htmlFor="billingCity">
                            Ort
                        </label>
                        <input
                            id="billingCity"
                            className="input"
                            value={form.billingCity}
                            onChange={(e) => updateField("billingCity", e.target.value)}
                            placeholder="Dresden"
                            required
                        />
                    </div>

                    <div className="field">
                        <label className="label" htmlFor="billingCountry">
                            Land
                        </label>
                        <input
                            id="billingCountry"
                            className="input"
                            value={form.billingCountry}
                            onChange={(e) =>
                                updateField("billingCountry", e.target.value.toUpperCase())
                            }
                            placeholder="DE"
                            maxLength={2}
                            required
                        />
                    </div>

                    <div className="field">
                        <label className="label" htmlFor="billingStreet2">
                            Zusatz
                        </label>
                        <input
                            id="billingStreet2"
                            className="input"
                            value={form.billingStreet2}
                            onChange={(e) =>
                                updateField("billingStreet2", e.target.value)
                            }
                            placeholder="Etage, Firma, c/o"
                        />
                    </div>
                </div>
            </section>

            <section className="card stack">
                <div className="section-title-row">
                    <h2>Zahlungsmethode</h2>
                    <span className="text-muted">
                        Wird im Profil und in der Bestellung gespeichert
                    </span>
                </div>

                <p className="text-muted">
                    Online-Zahlungen werden direkt verarbeitet. Manuelle
                    Zahlungsmethoden bleiben als offene Zahlung mit Referenz
                    gespeichert.
                </p>

                <div className="payment-grid">
                    {paymentMethods.map((method) => (
                        <label
                            key={method.value}
                            className={`payment-option ${
                                form.paymentMethod === method.value ? "is-active" : ""
                            }`}
                        >
                            <input
                                type="radio"
                                name="paymentMethod"
                                value={method.value}
                                checked={form.paymentMethod === method.value}
                                onChange={() => updateField("paymentMethod", method.value)}
                            />
                            <span>
                                <strong>{method.label}</strong>
                                <small>{method.description}</small>
                                <small>
                                    GateKeeper-Gebühr: {formatMoney(method.fee.gatekeeperFee)}
                                </small>
                            </span>
                        </label>
                    ))}
                </div>
            </section>

            <section className="card stack">
                <div className="section-title-row">
                    <h2>Tickets</h2>
                    <span className="text-muted">
                        Bis zu {maxQuantity} auf einmal
                    </span>
                </div>

                <div className="ticket-stepper">
                    <button
                        type="button"
                        className="ticket-stepper__btn"
                        onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                        aria-label="Ein Ticket weniger"
                    >
                        -
                    </button>
                    <div className="ticket-stepper__value">
                        <strong>{normalizedQuantity}</strong>
                        <span>{normalizedQuantity === 1 ? "Ticket" : "Tickets"}</span>
                    </div>
                    <button
                        type="button"
                        className="ticket-stepper__btn"
                        onClick={() => setQuantity((current) => Math.min(maxQuantity, current + 1))}
                        aria-label="Ein Ticket mehr"
                    >
                        +
                    </button>
                </div>

                <label className="checkline">
                    <input
                        type="checkbox"
                        checked={form.newsletter}
                        onChange={(e) => updateField("newsletter", e.target.checked)}
                    />
                    <span>Ich möchte Event-Updates per E-Mail erhalten.</span>
                </label>
            </section>

            <section className="card stack">
                <div className="section-title-row">
                    <h2>Promo-Code</h2>
                    <span className="text-muted">Optional</span>
                </div>

                <div className="field">
                    <label className="label" htmlFor="promoCode">
                        Code
                    </label>
                    <input
                        id="promoCode"
                        className="input"
                        value={form.promoCode}
                        onChange={(e) => updateField("promoCode", e.target.value.toUpperCase())}
                        placeholder="EARLY10"
                        autoComplete="off"
                    />
                </div>
            </section>

            <section className="card stack">
                <div className="section-title-row">
                    <h2>Zahlungsabschluss</h2>
                    <span className="text-muted">Schritt 3 von 3</span>
                </div>

                <p className="text-muted">
                    Je nach Auswahl wirst du zum Zahlungsanbieter weitergeleitet
                    oder erhältst eine Bestätigung mit Zahlungsreferenz.
                </p>

                <label className="checkline">
                    <input
                        type="checkbox"
                        checked={form.termsAccepted}
                        onChange={(e) => updateField("termsAccepted", e.target.checked)}
                        required
                    />
                    <span>
                        Ich akzeptiere die Buchungs- und Stornierungsbedingungen.
                    </span>
                </label>

                <button
                    type="submit"
                    className="btn btn-primary btn-lg w-full"
                    disabled={loading}
                >
                    {loading
                        ? "Zahlung wird vorbereitet..."
                        : basePrice.free
                        ? "Kostenlos reservieren"
                        : `Mit ${paymentMethods.find((method) => method.value === form.paymentMethod)?.label ?? "Zahlung"} ${formatMoney(totals.totalAmount)} buchen`}
                </button>
            </section>

            <div className="checkout-form__totals card">
                <div className="summary-list">
                    <div>
                        <span className="label">Ticketpreis</span>
                        <strong>{basePrice.text}</strong>
                    </div>
                    <div>
                        <span className="label">Tickettyp</span>
                        <strong>{selectedTicketType?.name ?? "Standard"}</strong>
                    </div>
                    <div>
                        <span className="label">Tickets</span>
                        <strong>{normalizedQuantity}</strong>
                    </div>
                    <div>
                        <span className="label">Gesamt</span>
                        <strong>{formatMoney(totals.totalAmount)}</strong>
                    </div>
                    {form.promoCode && (
                        <div>
                            <span className="label">Promo-Code</span>
                            <strong>{form.promoCode}</strong>
                        </div>
                    )}
                    <div>
                        <span className="label">GateKeeper-Gebühr</span>
                        <strong>{formatMoney(totals.serviceFee)}</strong>
                    </div>
                </div>
            </div>

            {message && <p className="auth-message">{message}</p>}
        </form>
    );
}
