"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const SAMPLE_ROWS = `[
  {
    "licenseNumber": "DRV12345",
    "firstName": "Max",
    "lastName": "Mustermann",
    "birthDate": "2010-01-20",
    "clubName": "Ruderverein Test"
  }
]`;

function athleteName(athlete) {
    return [athlete?.firstName, athlete?.lastName].filter(Boolean).join(" ") || "Athlet offen";
}

export default function ErichLicenseReviewPanel({ events, selectedEventId, pendingValuations }) {
    const router = useRouter();
    const [eventId, setEventId] = useState(selectedEventId ?? events[0]?.id ?? "");
    const [recordsText, setRecordsText] = useState(SAMPLE_ROWS);
    const [reason, setReason] = useState("Import ERICH license records");
    const [loading, setLoading] = useState("");
    const [message, setMessage] = useState("");

    async function submitImport(event) {
        event.preventDefault();
        setMessage("");
        setLoading("import");

        let records;
        try {
            records = JSON.parse(recordsText);
        } catch {
            setLoading("");
            setMessage("Lizenzdaten müssen als JSON-Array vorliegen.");
            return;
        }

        try {
            const response = await fetch("/api/admin/erich/licenses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ eventId, records, reason }),
            });
            const data = await response.json();
            setLoading("");

            if (!response.ok) {
                setMessage(data.error || "Lizenzimport fehlgeschlagen.");
                return;
            }

            setMessage(
                `Import angewendet: ${data.recordCount} Datensätze, ${data.matchedAthleteCount} Treffer, ${data.updatedValuationCount} Valuations.`
            );
            router.refresh();
        } catch (error) {
            setLoading("");
            setMessage(error.message || "Lizenzimport fehlgeschlagen.");
        }
    }

    async function decide(entry, status) {
        setMessage("");
        setLoading(entry.id);

        try {
            const response = await fetch("/api/admin/erich/eligibility-decisions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    eventId: entry.raceEntry.eventId,
                    athleteId: entry.raceEntry.athleteId,
                    raceEntryId: entry.raceEntryId,
                    status,
                    reason: status === "MANUAL_CONFIRMED"
                        ? "Manual ERICH license eligibility confirmed"
                        : "Manual ERICH license eligibility rejected",
                }),
            });
            const data = await response.json();
            setLoading("");

            if (!response.ok) {
                setMessage(data.error || "Entscheidung konnte nicht gespeichert werden.");
                return;
            }

            setMessage("Eligibility-Entscheidung gespeichert.");
            router.refresh();
        } catch (error) {
            setLoading("");
            setMessage(error.message || "Entscheidung konnte nicht gespeichert werden.");
        }
    }

    return (
        <div className="erich-license-review">
            <form className="admin-panel erich-license-form" onSubmit={submitImport}>
                <div className="admin-panel__header">
                    <div>
                        <span className="eyebrow">Import</span>
                        <h2>Lizenzdaten importieren</h2>
                    </div>
                </div>

                <div className="grid checkout-form__grid">
                    <label className="field" htmlFor="erich-license-event">
                        <span className="label">Event</span>
                        <select
                            id="erich-license-event"
                            className="select"
                            value={eventId}
                            onChange={(event) => setEventId(event.target.value)}
                        >
                            {events.map((event) => (
                                <option key={event.id} value={event.id}>
                                    {event.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="field checkout-form__wide" htmlFor="erich-license-reason">
                        <span className="label">Audit-Grund</span>
                        <input
                            id="erich-license-reason"
                            className="input"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            maxLength={700}
                        />
                    </label>
                    <label className="field checkout-form__wide" htmlFor="erich-license-records">
                        <span className="label">Records JSON</span>
                        <textarea
                            id="erich-license-records"
                            className="input erich-license-form__textarea"
                            value={recordsText}
                            onChange={(event) => setRecordsText(event.target.value)}
                        />
                    </label>
                </div>

                <button className="btn btn-primary" type="submit" disabled={loading === "import" || !eventId}>
                    {loading === "import" ? "Importiert..." : "Lizenzdaten importieren"}
                </button>
                {message ? <p className="auth-message">{message}</p> : null}
            </form>

            <section className="admin-panel">
                <div className="admin-panel__header">
                    <div>
                        <span className="eyebrow">Review</span>
                        <h2>Pending Eligibility</h2>
                    </div>
                    <span className="admin-panel__count">{pendingValuations.length} offen</span>
                </div>

                {pendingValuations.length === 0 ? (
                    <p className="text-muted">Keine offenen Lizenzprüfungen für dieses Event.</p>
                ) : (
                    <div className="admin-list">
                        {pendingValuations.map((entry) => (
                            <article key={entry.id} className="admin-list-row erich-license-row">
                                <div className="admin-list-row__main">
                                    <strong>
                                        #{entry.raceEntry?.raceNumber} · {athleteName(entry.raceEntry?.athlete)}
                                    </strong>
                                    <span>
                                        {entry.level} · {entry.status} · Lizenz{" "}
                                        {entry.raceEntry?.athlete?.germanLicenseNumber ?? "offen"}
                                    </span>
                                    <span>{entry.raceEntry?.athlete?.club?.officialName ?? "Club offen"}</span>
                                </div>
                                <div className="admin-list-row__aside erich-license-row__actions">
                                    <span className="admin-status admin-status--warning">Pending</span>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        disabled={loading === entry.id}
                                        onClick={() => decide(entry, "MANUAL_CONFIRMED")}
                                    >
                                        Bestätigen
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-ghost"
                                        disabled={loading === entry.id}
                                        onClick={() => decide(entry, "REJECTED")}
                                    >
                                        Ablehnen
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
