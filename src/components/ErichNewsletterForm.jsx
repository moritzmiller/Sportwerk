"use client";

import { useState } from "react";

export default function ErichNewsletterForm({ batchId, defaultEmail = "" }) {
    const [email, setEmail] = useState(defaultEmail);
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(event) {
        event.preventDefault();
        setMessage("");
        setLoading(true);

        try {
            const response = await fetch("/api/erich/newsletter", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ batchId, email }),
            });
            const data = await response.json();
            setLoading(false);

            if (!response.ok) {
                setMessage(data.error || "Newsletter-Anmeldung konnte nicht gespeichert werden.");
                return;
            }

            setMessage("Newsletter-Anmeldung gespeichert.");
        } catch {
            setLoading(false);
            setMessage("Newsletter-Anmeldung konnte nicht gespeichert werden.");
        }
    }

    return (
        <form className="erich-newsletter-form" onSubmit={handleSubmit}>
            <div className="field">
                <label className="label" htmlFor="erich-newsletter-email">
                    Newsletter
                </label>
                <input
                    id="erich-newsletter-email"
                    className="input"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="E-Mail fuer Neuigkeiten"
                />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Speichert..." : "Zum Newsletter anmelden"}
            </button>
            {message ? <p className="auth-message">{message}</p> : null}
        </form>
    );
}
