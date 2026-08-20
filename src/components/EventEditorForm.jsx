"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CATEGORIES } from "@/lib/categories";
import ImageCropper from "@/components/ImageCropper";
import PaymentMethodSelector from "@/components/PaymentMethodSelector";
import TicketTypeEditor from "@/components/TicketTypeEditor";
import { DEFAULT_ALLOWED_PAYMENT_METHODS } from "@/lib/payment-methods";

const MAX_IMAGE_BYTES = 1500 * 1024;

function toFormValue(event) {
    if (!event) {
        return {
            title: "",
            description: "",
            imageUrl: "",
            location: "",
            city: "Dresden",
            category: "SONSTIGES",
            startDate: "",
            capacity: "",
            status: "PUBLISHED",
            cancellationReason: "",
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
            allowedPaymentMethods: [...DEFAULT_ALLOWED_PAYMENT_METHODS],
        };
    }

    const startDate = event.startDate ? new Date(event.startDate) : null;
    const localValue = startDate
        ? `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}T${String(startDate.getHours()).padStart(2, "0")}:${String(startDate.getMinutes()).padStart(2, "0")}`
        : "";

    return {
        title: event.title ?? "",
        description: event.description ?? "",
        imageUrl: event.imageUrl ?? "",
        location: event.location ?? "",
        city: event.city ?? "Dresden",
        category: event.category ?? "SONSTIGES",
        startDate: localValue,
        capacity: event.capacity ? String(event.capacity) : "",
        status: event.status ?? "PUBLISHED",
        cancellationReason: event.cancellationReason ?? "",
        organizationId: event.organizationId ?? "",
        venueId: event.venueId ?? "",
        ticketTypes:
            event.ticketTypes?.length > 0
                ? event.ticketTypes.map((ticketType) => ({
                      id: ticketType.id,
                      name: ticketType.name ?? "Standard",
                      description: ticketType.description ?? "",
                      price: String(ticketType.price ?? ""),
                      quota: ticketType.quota ? String(ticketType.quota) : "",
                      maxPerBooking: ticketType.maxPerBooking
                          ? String(ticketType.maxPerBooking)
                          : "",
                      isDefault: Boolean(ticketType.isDefault),
                      sortOrder: Number(ticketType.sortOrder ?? 0),
                  }))
                : [
                      {
                          id: null,
                          name: "Standard",
                          description: "",
                          price: String(event.price ?? 0),
                          quota: event.capacity ? String(event.capacity) : "",
                          maxPerBooking: "",
                          isDefault: true,
                          sortOrder: 0,
                      },
                  ],
        allowedPaymentMethods:
            event.allowedPaymentMethods?.length > 0
                ? event.allowedPaymentMethods
                : [...DEFAULT_ALLOWED_PAYMENT_METHODS],
    };
}

export default function EventEditorForm({ event, organizations = [] }) {
    const router = useRouter();
    const [form, setForm] = useState(() => toFormValue(event));
    const [imageName, setImageName] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const selectedOrganization = organizations.find((organization) => organization.id === form.organizationId);
    const orgStatus = selectedOrganization?.verificationStatus || "PENDING";
    const defaultTicket = form.ticketTypes.find((ticketType) => ticketType.isDefault) ?? form.ticketTypes[0];
    const paymentEstimateAmount = Number(defaultTicket?.price || 0);

    function updateField(name, value) {
        setForm((current) => ({ ...current, [name]: value }));
    }

    async function save(nextStatus = form.status) {
        setLoading(true);
        setMessage("Event wird gespeichert.");

        try {
            const response = await fetch(`/api/events/${event.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    status: nextStatus,
                }),
            });

            const data = await response.json();
            setLoading(false);

            if (!response.ok) {
                setMessage(data.error || "Das Event konnte nicht gespeichert werden.");
                return;
            }

            if (data.moderation?.blocked) {
                setMessage(`${data.moderation.reason} Das Event bleibt ein Entwurf.`);
            } else {
                setMessage("Änderungen wurden gespeichert.");
            }
            router.refresh();
        } catch (error) {
            setLoading(false);
            setMessage("Beim Speichern ist ein Fehler aufgetreten.");
        }
    }

    async function duplicate() {
        setLoading(true);
        setMessage("Kopie wird erstellt.");
        try {
            const response = await fetch(`/api/events/${event.id}/duplicate`, {
                method: "POST",
            });
            const data = await response.json();
            setLoading(false);

            if (!response.ok) {
                setMessage(data.error || "Die Kopie konnte nicht erstellt werden.");
                return;
            }

            router.push(`/dashboard/events/${data.event.id}/edit`);
        } catch (error) {
            setLoading(false);
            setMessage("Beim Duplizieren ist ein Fehler aufgetreten.");
        }
    }

    async function changeStatus(nextStatus) {
        setLoading(true);
        setMessage("Status wird aktualisiert.");
        try {
            const response = await fetch(`/api/events/${event.id}/status`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: nextStatus,
                    cancellationReason: form.cancellationReason,
                }),
            });
            const data = await response.json();
            setLoading(false);

            if (!response.ok) {
                setMessage(data.error || "Der Status konnte nicht geändert werden.");
                return;
            }

            if (data.moderation?.blocked) {
                setMessage(`${data.moderation.reason} Der Status wurde auf Entwurf gesetzt.`);
            }
            setForm((current) => ({ ...current, status: data.event?.status ?? nextStatus }));
            router.refresh();
        } catch (error) {
            setLoading(false);
            setMessage("Beim Ändern des Status ist ein Fehler aufgetreten.");
        }
    }

    return (
        <form
            className="card stack-lg"
            onSubmit={(e) => {
                e.preventDefault();
                save();
            }}
        >
            <div className="section-title-row">
                <h2>Event bearbeiten</h2>
                <span className="text-muted">ID {event.id}</span>
            </div>

            <div className="field">
                <label className="label" htmlFor="event-status">
                    Status
                </label>
                <select
                    id="event-status"
                    className="select"
                    value={form.status}
                    onChange={(e) => updateField("status", e.target.value)}
                >
                    <option value="DRAFT">Entwurf</option>
                    <option value="PUBLISHED">Veröffentlicht</option>
                    <option value="POSTPONED">Verschoben</option>
                    <option value="SOLD_OUT">Ausverkauft</option>
                    <option value="CANCELLED">Abgesagt</option>
                </select>
            </div>

            <div className="grid checkout-form__grid">
                <div className="field checkout-form__wide">
                    <label className="label" htmlFor="event-title">
                        Titel
                    </label>
                    <input
                        id="event-title"
                        className="input"
                        value={form.title}
                        onChange={(e) => updateField("title", e.target.value)}
                        required
                    />
                </div>

                <div className="field checkout-form__wide">
                    <label className="label" htmlFor="event-description">
                        Beschreibung
                    </label>
                    <textarea
                        id="event-description"
                        className="textarea"
                        value={form.description}
                        onChange={(e) => updateField("description", e.target.value)}
                    />
                </div>

                <div className="field checkout-form__wide">
                    <label className="label" htmlFor="event-image">
                        Bild-URL
                    </label>
                    <input
                        id="event-image"
                        className="input"
                        value={form.imageUrl}
                        onChange={(e) => updateField("imageUrl", e.target.value)}
                        placeholder="https://..."
                        required
                    />
                    <ImageCropper
                        id="event-image-upload"
                        value={form.imageUrl}
                        maxOutputBytes={MAX_IMAGE_BYTES}
                        clearOnReset={false}
                        onChange={(imageUrl, fileName) => {
                            updateField("imageUrl", imageUrl);
                            setImageName(fileName);
                            setMessage("");
                        }}
                        onError={setMessage}
                    />
                    {imageName ? <p className="field-hint">Zugeschnitten: {imageName}</p> : null}
                </div>

                <div className="field">
                    <label className="label" htmlFor="event-category">
                        Kategorie
                    </label>
                    <select
                        id="event-category"
                        className="select"
                        value={form.category}
                        onChange={(e) => updateField("category", e.target.value)}
                    >
                        {CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>
                                {c.emoji} {c.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="field">
                    <label className="label" htmlFor="event-city">
                        Stadt
                    </label>
                    <input
                        id="event-city"
                        className="input"
                        value={form.city}
                        onChange={(e) => updateField("city", e.target.value)}
                        required
                    />
                </div>

                <div className="field checkout-form__wide">
                    <label className="label" htmlFor="event-location">
                        Veranstaltungsort
                    </label>
                    <input
                        id="event-location"
                        className="input"
                        value={form.location}
                        onChange={(e) => updateField("location", e.target.value)}
                        required
                    />
                </div>

                <TicketTypeEditor
                    value={form.ticketTypes}
                    onChange={(ticketTypes) =>
                        setForm((current) => ({ ...current, ticketTypes }))
                    }
                />

                <div className="field checkout-form__wide">
                    <PaymentMethodSelector
                        value={form.allowedPaymentMethods}
                        amount={paymentEstimateAmount}
                        onChange={(allowedPaymentMethods) =>
                            setForm((current) => ({ ...current, allowedPaymentMethods }))
                        }
                    />
                </div>

                {organizations.length > 0 ? (
                    <div className="field checkout-form__wide">
                        <label className="label" htmlFor="event-organization">
                            Organisation
                        </label>
                        <select
                            id="event-organization"
                            className="select"
                            value={form.organizationId}
                            onChange={(e) => {
                                updateField("organizationId", e.target.value);
                                updateField("venueId", "");
                            }}
                        >
                            <option value="">Persönlich / keine Organisation</option>
                            {organizations.map((organization) => (
                                <option key={organization.id} value={organization.id}>
                                    {organization.name}
                                </option>
                            ))}
                        </select>
                    </div>
                ) : null}

                {selectedOrganization ? (
                    <div className={`trust-banner checkout-form__wide ${orgStatus !== "VERIFIED" ? "trust-banner--warning" : ""}`}>
                        <strong>Organisation: {orgStatus}</strong>
                        <span>
                            {orgStatus === "VERIFIED"
                                ? "Diese Organisation ist verifiziert."
                                : "Diese Organisation ist noch nicht verifiziert. Veröffentlichungen werden vorerst als Entwurf behandelt."}
                        </span>
                    </div>
                ) : null}

                {form.organizationId ? (
                    <div className="field checkout-form__wide">
                        <label className="label" htmlFor="event-venue">
                            Venue
                        </label>
                        <select
                            id="event-venue"
                            className="select"
                            value={form.venueId}
                            onChange={(e) => updateField("venueId", e.target.value)}
                        >
                            <option value="">Ohne Venue</option>
                            {(organizations.find((organization) => organization.id === form.organizationId)?.venues || []).map(
                                (venue) => (
                                    <option key={venue.id} value={venue.id}>
                                        {venue.name}
                                    </option>
                                )
                            )}
                        </select>
                    </div>
                ) : null}

                <div className="field">
                    <label className="label" htmlFor="event-start">
                        Datum und Uhrzeit
                    </label>
                    <input
                        id="event-start"
                        type="datetime-local"
                        className="input"
                        value={form.startDate}
                        onChange={(e) => updateField("startDate", e.target.value)}
                        required
                    />
                </div>

                <div className="field">
                    <label className="label" htmlFor="event-capacity">
                        Kapazität
                    </label>
                    <input
                        id="event-capacity"
                        type="number"
                        min="1"
                        className="input"
                        value={form.capacity}
                        onChange={(e) => updateField("capacity", e.target.value)}
                        placeholder="Optional"
                    />
                </div>

                <div className="field checkout-form__wide">
                    <label className="label" htmlFor="event-cancellation">
                        Storno- oder Verschiebungsgrund
                    </label>
                    <input
                        id="event-cancellation"
                        className="input"
                        value={form.cancellationReason}
                        onChange={(e) => updateField("cancellationReason", e.target.value)}
                        placeholder="Optional"
                    />
                </div>
            </div>

            <div className="flex wrap">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? "Speichert..." : "Änderungen speichern"}
                </button>
                <button type="button" className="btn btn-ghost" disabled={loading} onClick={() => save("PUBLISHED")}>
                    Veröffentlichen
                </button>
                <button type="button" className="btn btn-ghost" disabled={loading} onClick={() => changeStatus("DRAFT")}>
                    Als Entwurf speichern
                </button>
                <button type="button" className="btn btn-ghost" disabled={loading} onClick={() => changeStatus("POSTPONED")}>
                    Verschieben
                </button>
                <button type="button" className="btn btn-ghost" disabled={loading} onClick={() => changeStatus("SOLD_OUT")}>
                    Als ausverkauft markieren
                </button>
                <button type="button" className="btn btn-ghost" disabled={loading} onClick={() => changeStatus("CANCELLED")}>
                    Absagen
                </button>
                <button type="button" className="btn btn-ghost" disabled={loading} onClick={duplicate}>
                    Duplizieren
                </button>
            </div>

            {message ? <p className="auth-message">{message}</p> : null}
        </form>
    );
}
