"use client";

import { useMemo, useState } from "react";

const STATUS_OPTIONS = [
    { value: "VERIFIED", label: "Verifizieren" },
    { value: "REJECTED", label: "Ablehnen" },
    { value: "PENDING", label: "Zurück auf offen" },
];

function formatDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}

function TrustRow({ entityType, item, onUpdate }) {
    const [reviewNotes, setReviewNotes] = useState(item.reviewNotes || "");
    const [loading, setLoading] = useState(false);

    async function submit(status) {
        setLoading(true);
        await onUpdate(entityType, item.id, status, reviewNotes);
        setLoading(false);
    }

    return (
        <article className="card stack-sm">
            <div className="flex-between wrap">
                <div>
                    <strong>{item.name}</strong>
                    <div className="text-muted">
                        {item.owner?.email || "unbekannt"} · {formatDate(item.verificationRequestedAt)}
                    </div>
                </div>
                <span className="tag-remove">{item.verificationStatus}</span>
            </div>
            <div className="text-muted">{item.description || item.notes || item.city || "—"}</div>
            <textarea
                className="textarea"
                placeholder="Review-Notiz"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
            />
            <div className="flex wrap">
                {STATUS_OPTIONS.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        className="btn btn-ghost"
                        disabled={loading}
                        onClick={() => submit(option.value)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </article>
    );
}

export default function TrustReviewPanel({ organizations = [], venues = [] }) {
    const [orgRows, setOrgRows] = useState(organizations);
    const [venueRows, setVenueRows] = useState(venues);
    const [message, setMessage] = useState("");

    const pendingOrganizations = useMemo(
        () => orgRows.filter((item) => item.verificationStatus !== "VERIFIED"),
        [orgRows]
    );
    const pendingVenues = useMemo(
        () => venueRows.filter((item) => item.verificationStatus !== "VERIFIED"),
        [venueRows]
    );

    async function update(entityType, id, status, reviewNotes) {
        setMessage("Prüfung wird gespeichert...");
        const response = await fetch("/api/admin/trust", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entityType, id, status, reviewNotes }),
        });
        const data = await response.json();
        if (!response.ok) {
            setMessage(data.error || "Prüfung fehlgeschlagen.");
            return;
        }

        if (entityType === "organization") {
            setOrgRows((current) =>
                current.map((item) =>
                    item.id === id ? { ...item, verificationStatus: status, reviewNotes } : item
                )
            );
        } else {
            setVenueRows((current) =>
                current.map((item) =>
                    item.id === id ? { ...item, verificationStatus: status, reviewNotes } : item
                )
            );
        }

        setMessage("Prüfung gespeichert.");
    }

    return (
        <section className="stack-lg">
            <div className="section-title-row">
                <h2>Vertrauen & Verifikation</h2>
                <span className="text-muted">
                    {pendingOrganizations.length} Organisationen · {pendingVenues.length} Venues offen
                </span>
            </div>

            {message ? <p className="text-muted">{message}</p> : null}

            <div className="discovery-hub-grid">
                <div className="card stack">
                    <h3 className="card__title">Organisationen</h3>
                    {pendingOrganizations.length === 0 ? (
                        <p className="text-muted">Keine offenen Organisationen.</p>
                    ) : (
                        <div className="stack-sm">
                            {pendingOrganizations.map((item) => (
                                <TrustRow
                                    key={item.id}
                                    entityType="organization"
                                    item={item}
                                    onUpdate={update}
                                />
                            ))}
                        </div>
                    )}
                </div>

                <div className="card stack">
                    <h3 className="card__title">Venues</h3>
                    {pendingVenues.length === 0 ? (
                        <p className="text-muted">Keine offenen Venues.</p>
                    ) : (
                        <div className="stack-sm">
                            {pendingVenues.map((item) => (
                                <TrustRow
                                    key={item.id}
                                    entityType="venue"
                                    item={item}
                                    onUpdate={update}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
