"use client";

import { useState } from "react";

const INITIAL_FORM = {
    name: "",
    email: "",
    topic: "general",
    bookingNumber: "",
    message: "",
};

const TOPICS = [
    { value: "general", label: "Allgemeine Anfrage" },
    { value: "booking", label: "Buchung" },
    { value: "organizer", label: "Veranstalter" },
    { value: "technical", label: "Technisches Problem" },
    { value: "privacy", label: "Datenschutz" },
    { value: "legal", label: "Rechtliches" },
];

export default function ContactForm() {
    const [formStartedAt] = useState(() => Date.now());
    const [form, setForm] = useState(INITIAL_FORM);
    const [website, setWebsite] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [messageType, setMessageType] = useState("info");

    const isBookingRequest = form.topic === "booking";

    function updateField(name, value) {
        setForm((current) => ({
            ...current,
            [name]: value,
        }));
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setLoading(true);
        setMessage("");
        setMessageType("info");

        try {
            const response = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    website,
                    formStartedAt,
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setMessage(data.error || "Die Anfrage konnte nicht gesendet werden.");
                setMessageType("error");
                setLoading(false);
                return;
            }

            setForm(INITIAL_FORM);
            setWebsite("");
            setMessage("Danke, deine Anfrage wurde gesendet.");
            setMessageType("success");
            setLoading(false);
        } catch {
            setMessage("Die Anfrage konnte nicht gesendet werden.");
            setMessageType("error");
            setLoading(false);
        }
    }

    return (
        <form className="contact-form stack-lg" onSubmit={handleSubmit}>
            <input
                className="hidden"
                tabIndex="-1"
                autoComplete="off"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                aria-hidden="true"
            />

            <div className="grid checkout-form__grid">
                <label className="field" htmlFor="contact-name">
                    <span className="label">Name</span>
                    <input
                        id="contact-name"
                        className="input"
                        type="text"
                        required
                        autoComplete="name"
                        value={form.name}
                        onChange={(event) => updateField("name", event.target.value)}
                    />
                </label>

                <label className="field" htmlFor="contact-email">
                    <span className="label">E-Mail</span>
                    <input
                        id="contact-email"
                        className="input"
                        type="email"
                        required
                        autoComplete="email"
                        value={form.email}
                        onChange={(event) => updateField("email", event.target.value)}
                    />
                </label>

                <label className="field checkout-form__wide" htmlFor="contact-topic">
                    <span className="label">Anliegen</span>
                    <select
                        id="contact-topic"
                        className="select"
                        value={form.topic}
                        onChange={(event) => updateField("topic", event.target.value)}
                    >
                        {TOPICS.map((topic) => (
                            <option key={topic.value} value={topic.value}>
                                {topic.label}
                            </option>
                        ))}
                    </select>
                </label>

                {isBookingRequest ? (
                    <label className="field checkout-form__wide" htmlFor="contact-booking-number">
                        <span className="label">Buchungsnummer</span>
                        <input
                            id="contact-booking-number"
                            className="input"
                            type="text"
                            inputMode="text"
                            autoComplete="off"
                            value={form.bookingNumber}
                            onChange={(event) => updateField("bookingNumber", event.target.value)}
                            placeholder="Zum Beispiel GK-12345 oder die Buchungs-ID"
                        />
                        <span className="field-hint">
                            Falls du sie gerade nicht findest, kannst du die Anfrage auch ohne Nummer senden.
                        </span>
                    </label>
                ) : null}

                <label className="field checkout-form__wide" htmlFor="contact-message">
                    <span className="label">Nachricht</span>
                    <textarea
                        id="contact-message"
                        className="textarea contact-form__textarea"
                        required
                        value={form.message}
                        onChange={(event) => updateField("message", event.target.value)}
                        placeholder="Beschreibe kurz, wobei wir helfen können."
                    />
                </label>
            </div>

            <div className="contact-form__actions">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? "Sendet..." : "Anfrage senden"}
                </button>
                {message ? (
                    <p className={`auth-message contact-form__message is-${messageType}`}>
                        {message}
                    </p>
                ) : null}
            </div>
        </form>
    );
}
