"use client";

import { useState } from "react";
import { CATEGORIES } from "@/lib/categories";
import ImageCropper from "@/components/ImageCropper";
import PaymentMethodSelector from "@/components/PaymentMethodSelector";
import TicketTypeEditor from "@/components/TicketTypeEditor";
import { EVENT_TYPES, normalizeEventOptions, normalizeEventType } from "@/lib/event-options";

const EMPTY = {
    title: "",
    description: "",
    imageUrl: "",
    location: "",
    city: "Dresden",
    category: "SONSTIGES",
    eventType: EVENT_TYPES.STANDARD,
    eventOptions: normalizeEventOptions(EVENT_TYPES.STANDARD),
    startDate: "",
    capacity: "",
    status: "DRAFT",
    organizationId: "",
    venueId: "",
    ticketTypes: [
        {
            id: null,
            name: "Standard",
            description: "",
            price: "",
            quota: "",
            maxPerBooking: "",
            isDefault: true,
            sortOrder: 0,
        },
    ],
    allowedPaymentMethods: ["STRIPE", "MOLLIE_PAY_BY_BANK", "PAYPAL", "INVOICE", "BANK_TRANSFER"],
};
const MAX_IMAGE_BYTES = 1500 * 1024;

export default function CreateEventForm({ organizations = [] }) {
    const [form, setForm] = useState(EMPTY);
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const [imageName, setImageName] = useState("");

    function handleChange(e) {
        const { name, value } = e.target;
        setForm((current) => {
            if (name === "organizationId") {
                return {
                    ...current,
                    organizationId: value,
                    venueId: "",
                };
            }

            return { ...current, [name]: value };
        });
    }

    function updateEventType(eventType) {
        const normalized = normalizeEventType(eventType);
        setForm((current) => ({
            ...current,
            eventType: normalized,
            eventOptions: normalizeEventOptions(normalized, current.eventOptions),
        }));
    }

    function updateEventFeature(name, value) {
        setForm((current) => ({
            ...current,
            eventOptions: normalizeEventOptions(current.eventType, {
                ...current.eventOptions,
                features: {
                    ...(current.eventOptions?.features ?? {}),
                    [name]: value,
                },
            }),
        }));
    }

    async function handleSubmit(e) {
        e.preventDefault();

        if (!form.imageUrl) {
            setMessage("Bitte ein Bild für das Event hochladen.");
            return;
        }

        setLoading(true);
        setMessage("Event wird gespeichert...");

        const response = await fetch("/api/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
        });

        const data = await response.json();
        setLoading(false);

        if (!response.ok) {
            setMessage(data.error || "Fehler beim Speichern.");
            return;
        }

        if (data.moderation?.blocked) {
            setMessage(`${data.moderation.reason} Das Event wurde als Entwurf gespeichert.`);
        } else {
            setMessage("Event wurde erstellt.");
        }
        setForm(EMPTY);
        setImageName("");
        window.location.reload();
    }

    const selectedOrganization = organizations.find((organization) => organization.id === form.organizationId);
    const availableVenues = selectedOrganization?.venues ?? [];
    const orgStatus = selectedOrganization?.verificationStatus || "PENDING";
    const defaultTicket = form.ticketTypes.find((ticketType) => ticketType.isDefault) ?? form.ticketTypes[0];
    const paymentEstimateAmount = Number(defaultTicket?.price || 0);

    return (
        <form onSubmit={handleSubmit} className="card stack">
            <h2 className="card__title">Event erstellen</h2>

            <div className="field">
                <label className="label" htmlFor="title">Eventname</label>
                <input
                    id="title"
                    name="title"
                    className="input"
                    placeholder="z. B. Sommerkonzert am Elbufer"
                    value={form.title}
                    onChange={handleChange}
                    required
                />
            </div>

            <div className="field">
                <label className="label" htmlFor="image">Titelbild</label>
                <ImageCropper
                    id="image"
                    value={form.imageUrl}
                    maxOutputBytes={MAX_IMAGE_BYTES}
                    required
                    onChange={(imageUrl, fileName) => {
                        setForm((current) => ({ ...current, imageUrl }));
                        setImageName(fileName);
                        setMessage("");
                    }}
                    onError={setMessage}
                />
                <p className="field-hint">
                    Das Bild erscheint auf der Eventseite und im Checkout.
                </p>
                {imageName ? <p className="field-hint">Ausgewählt: {imageName}</p> : null}
            </div>

            <div className="field">
                <label className="label" htmlFor="description">Beschreibung</label>
                <textarea
                    id="description"
                    name="description"
                    className="textarea"
                    placeholder="Worum geht es?"
                    value={form.description}
                    onChange={handleChange}
                />
            </div>

            <div className="field">
                <label className="label" htmlFor="category">Kategorie</label>
                <select
                    id="category"
                    name="category"
                    className="select"
                    value={form.category}
                    onChange={handleChange}
                >
                    {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                            {c.emoji} {c.label}
                        </option>
                    ))}
                </select>
            </div>

            <div className="field">
                <label className="label" htmlFor="eventType">Event-Art</label>
                <select
                    id="eventType"
                    name="eventType"
                    className="select"
                    value={form.eventType}
                    onChange={(e) => updateEventType(e.target.value)}
                >
                    <option value={EVENT_TYPES.STANDARD}>Standard</option>
                    <option value={EVENT_TYPES.ERICH}>Erich / Rennen</option>
                </select>
            </div>

            <label className="checkline">
                <input
                    type="checkbox"
                    checked={Boolean(form.eventOptions?.features?.seatingEnabled)}
                    onChange={(e) => updateEventFeature("seatingEnabled", e.target.checked)}
                />
                <span>Sitzplan fuer dieses Event verwenden</span>
            </label>

            {form.eventType === EVENT_TYPES.ERICH ? (
                <div className="trust-banner">
                    <strong>Erich-Event</strong>
                    <span>
                        Rennnummer, Geburtsdatum, Verein, Altersklasse und Zielzeit werden im
                        normalen Checkout abgefragt.
                    </span>
                </div>
            ) : null}

            <div className="field">
                <label className="label" htmlFor="location">Location</label>
                <input
                    id="location"
                    name="location"
                    className="input"
                    placeholder="z. B. Alter Schlachthof"
                    value={form.location}
                    onChange={handleChange}
                    required
                />
            </div>

            <div className="field">
                <label className="label" htmlFor="city">Stadt</label>
                <input
                    id="city"
                    name="city"
                    className="input"
                    value={form.city}
                    onChange={handleChange}
                    required
                />
            </div>

            <div className="field">
                <label className="label" htmlFor="startDate">Datum & Uhrzeit</label>
                <input
                    id="startDate"
                    name="startDate"
                    type="datetime-local"
                    className="input"
                    value={form.startDate}
                    onChange={handleChange}
                    required
                />
            </div>

            <TicketTypeEditor
                value={form.ticketTypes}
                onChange={(ticketTypes) =>
                    setForm((current) => ({ ...current, ticketTypes }))
                }
            />

            <PaymentMethodSelector
                value={form.allowedPaymentMethods}
                amount={paymentEstimateAmount}
                onChange={(allowedPaymentMethods) =>
                    setForm((current) => ({ ...current, allowedPaymentMethods }))
                }
            />

            <div className="field">
                <label className="label" htmlFor="capacity">Kapazität</label>
                <input
                    id="capacity"
                    name="capacity"
                    type="number"
                    min="1"
                    className="input"
                    placeholder="Optional"
                    value={form.capacity}
                    onChange={handleChange}
                />
            </div>

            <div className="field">
                <label className="label" htmlFor="status">Status</label>
                <select
                    id="status"
                    name="status"
                    className="select"
                    value={form.status}
                    onChange={handleChange}
                >
                    <option value="PUBLISHED">Veröffentlicht</option>
                    <option value="DRAFT">Entwurf</option>
                </select>
            </div>

            {organizations.length > 0 ? (
                <div className="field">
                    <label className="label" htmlFor="organizationId">Organisation</label>
                    <select
                        id="organizationId"
                        name="organizationId"
                        className="select"
                        value={form.organizationId}
                        onChange={handleChange}
                    >
                        <option value="">Persönlich / keine Organisation</option>
                        {organizations.map((organization) => (
                            <option key={organization.id} value={organization.id}>
                                {organization.name}
                            </option>
                        ))}
                    </select>
                    <p className="field-hint">
                        Ordnet das Event der gewählten Organisation zu.
                    </p>
                </div>
            ) : null}

            {selectedOrganization ? (
                <div className={`trust-banner ${orgStatus !== "VERIFIED" ? "trust-banner--warning" : ""}`}>
                    <strong>Organisation: {orgStatus}</strong>
                    <span>
                        {orgStatus === "VERIFIED"
                            ? "Diese Organisation kann Events direkt veröffentlichen."
                            : "Diese Organisation ist noch in Prüfung. Veröffentlichen wird vorerst als Entwurf gespeichert."}
                    </span>
                </div>
            ) : null}

            {form.organizationId ? (
                <div className="field">
                    <label className="label" htmlFor="venueId">Venue</label>
                    <select
                        id="venueId"
                        name="venueId"
                        className="select"
                        value={form.venueId}
                        onChange={handleChange}
                    >
                        <option value="">Ohne Venue</option>
                        {availableVenues.map((venue) => (
                            <option key={venue.id} value={venue.id}>
                                {venue.name}
                            </option>
                        ))}
                    </select>
                    <p className="field-hint">
                        {availableVenues.length > 0
                            ? "Wähle einen Ort für das Event aus."
                            : "Für diese Organisation gibt es noch keine Venues."}
                    </p>
                </div>
            ) : null}

            <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Speichert..." : "Event-Entwurf speichern"}
            </button>

            {message ? <p className="auth-message">{message}</p> : null}
        </form>
    );
}
