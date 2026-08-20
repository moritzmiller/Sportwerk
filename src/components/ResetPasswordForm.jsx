"use client";

import { useState } from "react";

function getInitialResetState() {
    if (typeof window === "undefined") {
        return {
            ready: false,
            token: "",
            message: "Reset-Link wird geprueft...",
        };
    }

    const url = new URL(window.location.href);
    const token = url.searchParams.get("token") || "";

    if (!token) {
        return {
            ready: false,
            token: "",
            message: "Der Reset-Link ist ungueltig oder abgelaufen. Fordere bitte einen neuen Link an.",
        };
    }

    return {
        ready: true,
        token,
        message: "Lege jetzt dein neues Passwort fest.",
    };
}

export default function ResetPasswordForm() {
    const [resetState, setResetState] = useState(getInitialResetState);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(event) {
        event.preventDefault();
        setResetState((current) => ({ ...current, message: "" }));

        if (password.length < 8 || password.length > 200) {
            setResetState((current) => ({
                ...current,
                message: "Bitte verwende mindestens 8 Zeichen.",
            }));
            return;
        }

        if (password !== confirmPassword) {
            setResetState((current) => ({
                ...current,
                message: "Die Passwoerter stimmen nicht ueberein.",
            }));
            return;
        }

        setLoading(true);

        let data = {};
        let ok = false;
        try {
            const response = await fetch("/api/auth/password-reset/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: resetState.token, password }),
            });
            ok = response.ok;
            data = await response.json();
        } catch {
            data = { error: "Passwort konnte nicht geaendert werden." };
        }

        setLoading(false);

        if (!ok) {
            setResetState((current) => ({
                ...current,
                message: data.error || "Passwort konnte nicht geaendert werden.",
            }));
            return;
        }

        window.history.replaceState({}, "", "/auth/reset-password");
        setResetState({
            ready: false,
            token: "",
            message: "Passwort geaendert. Du kannst dich jetzt mit dem neuen Passwort anmelden.",
        });
        setPassword("");
        setConfirmPassword("");
    }

    return (
        <div className="card stack-lg auth-card">
            <form className="stack" onSubmit={handleSubmit}>
                <div className="field">
                    <label className="label" htmlFor="new-password">
                        Neues Passwort
                    </label>
                    <input
                        id="new-password"
                        className="input"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        disabled={!resetState.ready || loading}
                        minLength={8}
                        autoComplete="new-password"
                        required
                    />
                </div>
                <div className="field">
                    <label className="label" htmlFor="confirm-password">
                        Passwort wiederholen
                    </label>
                    <input
                        id="confirm-password"
                        className="input"
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        disabled={!resetState.ready || loading}
                        minLength={8}
                        autoComplete="new-password"
                        required
                    />
                </div>
                <button type="submit" className="btn btn-primary w-full" disabled={!resetState.ready || loading}>
                    {loading ? "Speichert..." : "Passwort speichern"}
                </button>
            </form>
            {resetState.message ? <p className="auth-message">{resetState.message}</p> : null}
        </div>
    );
}
