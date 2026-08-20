"use client";

import { useEffect, useState } from "react";

export default function EventEngagement({
    eventId,
    isAuthenticated,
    initialFavorited = false,
    initialAlerted = false,
}) {
    const [favorited, setFavorited] = useState(initialFavorited);
    const [alerted, setAlerted] = useState(initialAlerted);
    const [message, setMessage] = useState("");

    useEffect(() => {
        fetch(`/api/events/${eventId}/view`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                source: "event-detail",
                referrer: document.referrer || null,
            }),
        }).catch(() => {});
    }, [eventId]);

    async function toggleFavorite() {
        if (!isAuthenticated) {
            setMessage("Bitte zuerst anmelden, um Events zu speichern.");
            return;
        }

        const response = await fetch(`/api/events/${eventId}/favorite`, {
            method: "POST",
        });
        const data = await response.json();
        if (!response.ok) {
            setMessage(data.error || "Konnte Favorit nicht speichern.");
            return;
        }

        setFavorited(Boolean(data.favorited));
        setMessage(data.favorited ? "Als Favorit gespeichert." : "Favorit entfernt.");
    }

    async function saveAlert() {
        if (!isAuthenticated) {
            setMessage("Bitte zuerst anmelden, um einen Alert zu speichern.");
            return;
        }

        const response = await fetch(`/api/events/${eventId}/alerts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
        });
        const data = await response.json();
        if (!response.ok) {
            setMessage(data.error || "Alert konnte nicht gespeichert werden.");
            return;
        }

        setAlerted(true);
        setMessage("Suchalarm gespeichert.");
    }

    return (
        <div className="flex wrap">
            <button type="button" className="btn btn-ghost" onClick={toggleFavorite}>
                {favorited ? "Favorit entfernt" : "Als Favorit speichern"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={saveAlert} disabled={alerted}>
                {alerted ? "Alarm gespeichert" : "Suchalarm speichern"}
            </button>
            {message ? <span className="field-hint">{message}</span> : null}
        </div>
    );
}
