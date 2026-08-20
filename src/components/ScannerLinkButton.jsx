"use client";

import { useState } from "react";

export default function ScannerLinkButton({ eventId }) {
    const [status, setStatus] = useState("");
    const [busy, setBusy] = useState(false);
    const [scannerUrl, setScannerUrl] = useState("");
    const [links, setLinks] = useState([]);
    const [showLinks, setShowLinks] = useState(false);
    const [loadingLinks, setLoadingLinks] = useState(false);

    async function loadLinks() {
        setLoadingLinks(true);
        try {
            const response = await fetch(`/api/events/${eventId}/scanner-link`);
            const data = await response.json();
            if (!response.ok) {
                setStatus(data.error || "Scanner-Links konnten nicht geladen werden.");
                return;
            }
            setLinks(data.links || []);
        } catch {
            setStatus("Scanner-Links konnten nicht geladen werden.");
        } finally {
            setLoadingLinks(false);
        }
    }

    async function toggleLinks() {
        const next = !showLinks;
        setShowLinks(next);
        if (next && links.length === 0) {
            await loadLinks();
        }
    }

    async function handleGenerate() {
        setBusy(true);
        setStatus("");
        let createdUrl = "";

        try {
            const response = await fetch(`/api/events/${eventId}/scanner-link`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            const data = await response.json();

            if (!response.ok) {
                setStatus(data.error || "Link konnte nicht erstellt werden.");
                return;
            }

            createdUrl = data.url;
            setScannerUrl(createdUrl);
            if (showLinks) {
                await loadLinks();
            }

            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(createdUrl);
                setStatus(
                    data.expiresAt
                        ? `Link kopiert, gültig bis ${new Date(data.expiresAt).toLocaleString("de-DE")}`
                        : "Link kopiert"
                );
            } else {
                setStatus(
                    data.expiresAt
                        ? `Link erstellt, gültig bis ${new Date(data.expiresAt).toLocaleString("de-DE")}`
                        : "Link erstellt"
                );
            }
        } catch (error) {
            setStatus(
                createdUrl
                    ? "Link erstellt, aber Zwischenablage nicht erreichbar."
                    : "Link konnte nicht erstellt werden."
            );
        } finally {
            setBusy(false);
            window.setTimeout(() => setStatus(""), 6000);
        }
    }

    async function handleRevoke(linkId) {
        setBusy(true);
        setStatus("");
        try {
            const response = await fetch(`/api/events/${eventId}/scanner-link`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: linkId }),
            });
            const data = await response.json();

            if (!response.ok) {
                setStatus(data.error || "Scanner-Link konnte nicht widerrufen werden.");
                return;
            }

            setStatus("Scanner-Link widerrufen.");
            await loadLinks();
        } catch {
            setStatus("Scanner-Link konnte nicht widerrufen werden.");
        } finally {
            setBusy(false);
            window.setTimeout(() => setStatus(""), 6000);
        }
    }

    function statusLabel(value) {
        if (value === "active") return "Aktiv";
        if (value === "expired") return "Abgelaufen";
        if (value === "revoked") return "Widerrufen";
        return value;
    }

    return (
        <div className="scanner-link-action">
            <button
                type="button"
                className="btn btn-ghost"
                onClick={handleGenerate}
                disabled={busy}
            >
                {busy ? "Generiere..." : "Scanner-Link generieren"}
            </button>
            <button
                type="button"
                className="btn btn-ghost"
                onClick={toggleLinks}
                disabled={loadingLinks}
            >
                {showLinks ? "Links ausblenden" : "Links verwalten"}
            </button>
            {scannerUrl ? (
                <a
                    href={scannerUrl}
                    className="btn btn-primary"
                    target="_blank"
                    rel="noreferrer"
                >
                    Scanner öffnen
                </a>
            ) : null}
            {status ? <span className="scanner-link-action__status">{status}</span> : null}
            {showLinks ? (
                <div className="scanner-link-action__panel">
                    {loadingLinks ? (
                        <span className="text-muted">Links werden geladen...</span>
                    ) : links.length === 0 ? (
                        <span className="text-muted">Noch keine Scanner-Links vorhanden.</span>
                    ) : (
                        links.map((link) => (
                            <div key={link.id} className="scanner-link-action__row">
                                <div>
                                    <strong>{statusLabel(link.status)}</strong>
                                    <span>
                                        bis {new Date(link.expiresAt).toLocaleString("de-DE")}
                                    </span>
                                    {link.lastUsedAt ? (
                                        <span>
                                            zuletzt genutzt {new Date(link.lastUsedAt).toLocaleString("de-DE")}
                                        </span>
                                    ) : null}
                                </div>
                                {link.status === "active" ? (
                                    <button
                                        type="button"
                                        className="btn btn-ghost"
                                        onClick={() => handleRevoke(link.id)}
                                        disabled={busy}
                                    >
                                        Widerrufen
                                    </button>
                                ) : null}
                            </div>
                        ))
                    )}
                </div>
            ) : null}
        </div>
    );
}
