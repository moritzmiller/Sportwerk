"use client";

import { useState } from "react";

export default function EventShareActions({ eventTitle, eventUrl, icsUrl }) {
    const [message, setMessage] = useState("");

    async function handleShare() {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: eventTitle,
                    url: eventUrl,
                });
                setMessage("Teilen bereitgestellt.");
                return;
            } catch (error) {
                if (error?.name === "AbortError") return;
            }
        }

        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(eventUrl);
            setMessage("Link in die Zwischenablage kopiert.");
            return;
        }

        setMessage("Teilen wird von diesem Browser nicht unterstützt.");
    }

    return (
        <div className="flex wrap">
            <button type="button" className="btn btn-ghost" onClick={handleShare}>
                Teilen
            </button>
            <a href={eventUrl} className="btn btn-ghost">
                Link öffnen
            </a>
            <a href={icsUrl} className="btn btn-ghost">
                Kalender
            </a>
            {message ? <span className="field-hint">{message}</span> : null}
        </div>
    );
}
