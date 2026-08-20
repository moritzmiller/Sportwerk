"use client";

import { useEffect, useState } from "react";

export default function AuthForm() {
    const [mode, setMode] = useState("login");
    const [formStartedAt] = useState(() => Date.now());
    const [form, setForm] = useState({
        email: "",
        password: "",
        name: "",
        role: "VISITOR",
        website: "",
    });
    const [message, setMessage] = useState("");
    const [resetLink, setResetLink] = useState("");
    const [loading, setLoading] = useState(false);
    const [resetCooldown, setResetCooldown] = useState(0);

    useEffect(() => {
        if (resetCooldown <= 0) return undefined;

        const timer = window.setInterval(() => {
            setResetCooldown((current) => Math.max(0, current - 1));
        }, 1000);

        return () => window.clearInterval(timer);
    }, [resetCooldown]);

    function handleChange(e) {
        setForm({ ...form, [e.target.name]: e.target.value });
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setLoading(true);
        setMessage("");
        setResetLink("");

        const endpoint =
            mode === "login"
                ? "/api/auth/login"
                : mode === "forgot"
                  ? "/api/auth/password-reset/request"
                  : "/api/auth/register";

        const payload =
            mode === "login"
                ? {
                      email: form.email,
                      password: form.password,
                      website: form.website,
                      formStartedAt,
                  }
                : mode === "forgot"
                  ? {
                        email: form.email,
                        website: form.website,
                        formStartedAt,
                    }
                : { ...form, formStartedAt };

        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const data = await res.json();
        setLoading(false);

        if (!res.ok) {
            if (res.status === 429 && data.retryAfterSeconds) {
                const seconds = Math.max(1, Number(data.retryAfterSeconds) || 60);
                setResetCooldown(seconds);
                setMessage(
                    data.error ||
                        `Bitte warte ${seconds} Sekunden, bevor du erneut eine E-Mail anforderst.`
                );
                return;
            }

            setMessage(data.error || "Ein Fehler ist aufgetreten.");
            return;
        }

        if (mode === "forgot") {
            if (data.resetUrl) {
                setResetLink(data.resetUrl);
                setMessage(
                    data.message ||
                        "Mailversand ist lokal nicht verfuegbar. Nutze den Entwicklungslink."
                );
                return;
            }

            setMessage(
                data.mailSent
                    ? "Wenn die Adresse registriert ist, wurde ein Reset-Link per E-Mail versendet."
                    : "Anfrage verarbeitet. Falls ein Konto existiert, prüft GateKeeper den Mailversand."
            );
            return;
        }

        if (mode === "register") {
            setMessage(
                data.mailSent
                    ? "Registrierung gestartet. Bitte bestätige den Link in deiner E-Mail, danach kannst du dich anmelden."
                    : "Registrierung nicht abgeschlossen. Die Verifizierungs-Mail konnte nicht versendet werden."
            );
            setMode("login");
            return;
        }

        const userRole = data.role;
        window.location.href = userRole === "ADMIN" ? "/admin" : "/dashboard";
    }

    return (
        <div className="card stack-lg auth-card">
            <div className="segmented segmented--subtle">
                <button
                    type="button"
                    onClick={() => {
                        setMode("login");
                        setMessage("");
                        setResetLink("");
                    }}
                    className={`segmented__btn ${mode === "login" ? "is-active" : ""}`}
                >
                    Anmelden
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setMode("register");
                        setMessage("");
                        setResetLink("");
                    }}
                    className={`segmented__btn ${mode === "register" ? "is-active" : ""}`}
                >
                    Registrieren
                </button>
            </div>

            <form onSubmit={handleSubmit} className="stack">
                <input
                    type="text"
                    name="website"
                    value={form.website}
                    onChange={handleChange}
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    className="sr-only"
                />

                {mode === "register" && (
                    <div className="field">
                        <label className="label" htmlFor="name">
                            Name
                        </label>
                        <input
                            id="name"
                            name="name"
                            className="input"
                            placeholder="Dein Name"
                            value={form.name}
                            onChange={handleChange}
                        />
                    </div>
                )}

                {mode === "register" && (
                    <div className="field">
                        <label className="label" htmlFor="role">
                            Kontoart
                        </label>
                        <select
                            id="role"
                            name="role"
                            className="select"
                            value={form.role}
                            onChange={handleChange}
                        >
                            <option value="VISITOR">Besucher</option>
                            <option value="ORGANIZER">Veranstalter</option>
                        </select>
                    </div>
                )}

                <div className="field">
                    <label className="label" htmlFor="email">
                        E-Mail
                    </label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        className="input"
                        placeholder="du@beispiel.de"
                        value={form.email}
                        onChange={handleChange}
                        required
                    />
                </div>

                {mode !== "forgot" ? (
                    <div className="field">
                        <label className="label" htmlFor="password">
                            Passwort
                        </label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            className="input"
                            placeholder="********"
                            value={form.password}
                            onChange={handleChange}
                            required
                        />
                    </div>
                ) : null}

                <button
                    type="submit"
                    className="btn btn-primary w-full"
                    disabled={loading || (mode === "forgot" && resetCooldown > 0)}
                >
                    {loading
                        ? "Bitte warten..."
                        : mode === "login"
                          ? "Anmelden"
                          : mode === "forgot"
                            ? resetCooldown > 0
                                ? `Noch ${resetCooldown}s warten`
                                : "Reset-Link anfordern"
                            : "Registrieren"}
                </button>
            </form>

            {mode === "login" ? (
                <button
                    type="button"
                    className="auth-link-button"
                    onClick={() => {
                        setMode("forgot");
                        setMessage("");
                        setResetLink("");
                    }}
                >
                    Passwort vergessen?
                </button>
            ) : null}
            {mode === "forgot" ? (
                <button
                    type="button"
                    className="auth-link-button"
                    onClick={() => {
                        setMode("login");
                        setMessage("");
                        setResetLink("");
                    }}
                >
                    Zurück zur Anmeldung
                </button>
            ) : null}
            {message && <p className="auth-message">{message}</p>}
            {resetLink ? (
                <a className="auth-link-button" href={resetLink}>
                    Entwicklungslink zum Passwort-Reset oeffnen
                </a>
            ) : null}
            {mode === "register" ? (
                <p className="field-hint">
                    Veranstalter koennen direkt ein Konto erstellen und danach Events verwalten.
                </p>
            ) : null}
        </div>
    );
}
