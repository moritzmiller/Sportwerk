"use client";

import { useEffect, useState } from "react";

import { getPasswordResetLinkState } from "@/lib/auth-reset-flow";
import { createClient } from "@/lib/supabase/client";

function initialState() {
    return {
        ready: false,
        mode: "",
        token: "",
        message: "Reset-Link wird geprüft...",
    };
}

function tokenState(token) {
    return {
        ready: true,
        mode: "gatekeeper-token",
        token,
        message: "Lege jetzt dein neues Passwort fest.",
    };
}

function invalidState(message = "Der Reset-Link ist ungültig oder abgelaufen. Fordere bitte einen neuen Link an.") {
    return {
        ready: false,
        mode: "",
        token: "",
        message,
    };
}

function supabaseReadyState() {
    return {
        ready: true,
        mode: "supabase-session",
        token: "",
        message: "Lege jetzt dein neues Passwort fest.",
    };
}

function cleanResetUrl() {
    window.history.replaceState({}, "", "/auth/reset-password");
}

export default function ResetPasswordForm() {
    const [resetState, setResetState] = useState(initialState);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let isCurrent = true;

        async function prepareResetSession() {
            const url = new URL(window.location.href);
            const legacyToken = url.searchParams.get("token") || "";

            if (legacyToken) {
                setResetState(tokenState(legacyToken));
                return;
            }

            const linkState = getPasswordResetLinkState(window.location.href);
            if (linkState.error) {
                setResetState(
                    invalidState(
                        linkState.errorDescription ||
                            "Der Reset-Link wurde von Supabase abgelehnt. Fordere bitte einen neuen Link an."
                    )
                );
                return;
            }

            if (!linkState.hasRecoverySignal) {
                setResetState(invalidState());
                return;
            }

            try {
                const supabase = createClient();

                if (linkState.code) {
                    const { error } = await supabase.auth.exchangeCodeForSession(linkState.code);
                    if (error) throw error;
                } else if (linkState.tokenHash) {
                    const { error } = await supabase.auth.verifyOtp({
                        type: "recovery",
                        token_hash: linkState.tokenHash,
                    });
                    if (error) throw error;
                } else if (linkState.accessToken && linkState.refreshToken) {
                    const { error } = await supabase.auth.setSession({
                        access_token: linkState.accessToken,
                        refresh_token: linkState.refreshToken,
                    });
                    if (error) throw error;
                } else {
                    setResetState(invalidState());
                    return;
                }

                if (!isCurrent) return;
                cleanResetUrl();
                setResetState(supabaseReadyState());
            } catch (error) {
                if (!isCurrent) return;
                setResetState(
                    invalidState(
                        error?.message
                            ? `Reset-Link konnte nicht geprüft werden: ${error.message}`
                            : "Reset-Link konnte nicht geprüft werden."
                    )
                );
            }
        }

        prepareResetSession();

        return () => {
            isCurrent = false;
        };
    }, []);

    async function completeWithGateKeeperToken() {
        const response = await fetch("/api/auth/password-reset/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: resetState.token, password }),
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || "Passwort konnte nicht geändert werden.");
        }
    }

    async function completeWithSupabaseSession() {
        const supabase = createClient();
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        await supabase.auth.signOut().catch(() => {});
    }

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
                message: "Die Passwörter stimmen nicht überein.",
            }));
            return;
        }

        setLoading(true);

        try {
            if (resetState.mode === "gatekeeper-token") {
                await completeWithGateKeeperToken();
            } else if (resetState.mode === "supabase-session") {
                await completeWithSupabaseSession();
            } else {
                throw new Error("Der Reset-Link ist ungültig oder abgelaufen.");
            }

            cleanResetUrl();
            setResetState({
                ready: false,
                mode: "",
                token: "",
                message: "Passwort geändert. Du kannst dich jetzt mit dem neuen Passwort anmelden.",
            });
            setPassword("");
            setConfirmPassword("");
        } catch (error) {
            setResetState((current) => ({
                ...current,
                message: error?.message || "Passwort konnte nicht geändert werden.",
            }));
        } finally {
            setLoading(false);
        }
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
