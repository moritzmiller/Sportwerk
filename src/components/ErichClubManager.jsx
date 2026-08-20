"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function emptyForm() {
    return {
        officialName: "",
        externalFederationId: "",
        countryCode: "DE",
        federalState: "",
        stateRowingAssociation: "",
        stateAssociationMember: true,
        isGermanClub: true,
        isCentralGermanClub: false,
        active: true,
    };
}

function formFromClub(club) {
    return {
        officialName: club.officialName ?? "",
        externalFederationId: club.externalFederationId ?? "",
        countryCode: club.countryCode ?? "DE",
        federalState: club.federalState ?? "",
        stateRowingAssociation: club.stateRowingAssociation ?? "",
        stateAssociationMember: Boolean(club.stateAssociationMember),
        isGermanClub: Boolean(club.isGermanClub),
        isCentralGermanClub: Boolean(club.isCentralGermanClub),
        active: Boolean(club.active),
    };
}

function statusClass(club) {
    if (!club.active) return "admin-status";
    if (club.isCentralGermanClub) return "admin-status admin-status--ok";
    if (club.isGermanClub) return "admin-status admin-status--warning";
    return "admin-status";
}

export default function ErichClubManager({ clubs, events }) {
    const router = useRouter();
    const [form, setForm] = useState(emptyForm);
    const [editingId, setEditingId] = useState("");
    const [eventId, setEventId] = useState(events[0]?.id ?? "");
    const [reason, setReason] = useState("Update ERICH club master data");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState("");

    function updateField(name, value) {
        setForm((current) => ({ ...current, [name]: value }));
    }

    function startEdit(club) {
        setEditingId(club.id);
        setForm(formFromClub(club));
        setMessage("");
    }

    function resetForm() {
        setEditingId("");
        setForm(emptyForm());
    }

    async function submitClub(event) {
        event.preventDefault();
        setMessage("");
        setLoading("save");

        const url = editingId ? `/api/admin/erich/clubs/${editingId}` : "/api/admin/erich/clubs";
        const method = editingId ? "PATCH" : "POST";

        try {
            const response = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ club: form, eventId: eventId || null, reason }),
            });
            const data = await response.json();
            setLoading("");

            if (!response.ok) {
                setMessage(data.error || "Club konnte nicht gespeichert werden.");
                return;
            }

            setMessage(editingId ? "Club aktualisiert." : "Club angelegt.");
            resetForm();
            router.refresh();
        } catch (error) {
            setLoading("");
            setMessage(error.message || "Club konnte nicht gespeichert werden.");
        }
    }

    async function toggleClub(club) {
        setMessage("");
        setLoading(club.id);

        try {
            const response = await fetch(`/api/admin/erich/clubs/${club.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    club: { ...formFromClub(club), active: !club.active },
                    eventId: eventId || null,
                    reason: club.active ? "Deactivate ERICH club master data" : "Reactivate ERICH club master data",
                }),
            });
            const data = await response.json();
            setLoading("");

            if (!response.ok) {
                setMessage(data.error || "Club konnte nicht aktualisiert werden.");
                return;
            }

            setMessage(club.active ? "Club deaktiviert." : "Club aktiviert.");
            router.refresh();
        } catch (error) {
            setLoading("");
            setMessage(error.message || "Club konnte nicht aktualisiert werden.");
        }
    }

    return (
        <div className="erich-club-manager">
            <form className="admin-panel erich-club-form" onSubmit={submitClub}>
                <div className="admin-panel__header">
                    <div>
                        <span className="eyebrow">Club</span>
                        <h2>{editingId ? "Club bearbeiten" : "Club anlegen"}</h2>
                    </div>
                    {editingId ? (
                        <button type="button" className="btn btn-ghost" onClick={resetForm}>
                            Neu
                        </button>
                    ) : null}
                </div>

                <div className="grid checkout-form__grid">
                    <label className="field checkout-form__wide" htmlFor="erich-club-name">
                        <span className="label">Offizieller Name</span>
                        <input
                            id="erich-club-name"
                            className="input"
                            value={form.officialName}
                            onChange={(event) => updateField("officialName", event.target.value)}
                        />
                    </label>
                    <label className="field" htmlFor="erich-club-external-id">
                        <span className="label">Verbands-ID</span>
                        <input
                            id="erich-club-external-id"
                            className="input"
                            value={form.externalFederationId}
                            onChange={(event) => updateField("externalFederationId", event.target.value)}
                        />
                    </label>
                    <label className="field" htmlFor="erich-club-country">
                        <span className="label">Land</span>
                        <input
                            id="erich-club-country"
                            className="input"
                            maxLength={3}
                            value={form.countryCode}
                            onChange={(event) => updateField("countryCode", event.target.value.toUpperCase())}
                        />
                    </label>
                    <label className="field" htmlFor="erich-club-state">
                        <span className="label">Bundesland</span>
                        <input
                            id="erich-club-state"
                            className="input"
                            value={form.federalState}
                            onChange={(event) => updateField("federalState", event.target.value)}
                        />
                    </label>
                    <label className="field" htmlFor="erich-club-association">
                        <span className="label">Landesruderverband</span>
                        <input
                            id="erich-club-association"
                            className="input"
                            value={form.stateRowingAssociation}
                            onChange={(event) => updateField("stateRowingAssociation", event.target.value)}
                        />
                    </label>
                    <label className="field" htmlFor="erich-club-event">
                        <span className="label">Audit-Event</span>
                        <select
                            id="erich-club-event"
                            className="select"
                            value={eventId}
                            onChange={(event) => setEventId(event.target.value)}
                        >
                            <option value="">Ohne Event</option>
                            {events.map((event) => (
                                <option key={event.id} value={event.id}>
                                    {event.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="field checkout-form__wide" htmlFor="erich-club-reason">
                        <span className="label">Audit-Grund</span>
                        <input
                            id="erich-club-reason"
                            className="input"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            maxLength={700}
                        />
                    </label>
                </div>

                <div className="payment-grid">
                    {[
                        ["stateAssociationMember", "Landesverband-Mitglied"],
                        ["isGermanClub", "Deutscher Verein"],
                        ["isCentralGermanClub", "Mitteldeutscher Verein"],
                        ["active", "Aktiv"],
                    ].map(([name, label]) => (
                        <label key={name} className={`payment-option ${form[name] ? "is-active" : ""}`}>
                            <input
                                type="checkbox"
                                checked={form[name]}
                                onChange={(event) => updateField(name, event.target.checked)}
                            />
                            <span>
                                <strong>{label}</strong>
                            </span>
                        </label>
                    ))}
                </div>

                <button type="submit" className="btn btn-primary" disabled={loading === "save"}>
                    {loading === "save" ? "Speichert..." : editingId ? "Club speichern" : "Club anlegen"}
                </button>

                {message ? <p className="auth-message">{message}</p> : null}
            </form>

            <section className="admin-panel">
                <div className="admin-panel__header">
                    <div>
                        <span className="eyebrow">Clubs</span>
                        <h2>ERICH Vereinsliste</h2>
                    </div>
                    <span className="admin-panel__count">{clubs.length} Einträge</span>
                </div>

                {clubs.length === 0 ? (
                    <p className="text-muted">Noch keine ERICH-Clubs vorhanden.</p>
                ) : (
                    <div className="admin-list">
                        {clubs.map((club) => (
                            <article key={club.id} className="admin-list-row erich-club-row">
                                <div className="admin-list-row__main">
                                    <strong>{club.officialName}</strong>
                                    <span>
                                        {club.countryCode}
                                        {club.federalState ? ` · ${club.federalState}` : ""}
                                        {club.externalFederationId ? ` · ${club.externalFederationId}` : ""}
                                    </span>
                                    <span>{club.stateRowingAssociation ?? "Landesverband offen"}</span>
                                </div>
                                <div className="admin-list-row__aside erich-club-row__actions">
                                    <span className={statusClass(club)}>
                                        {club.active ? "Aktiv" : "Inaktiv"}
                                    </span>
                                    {club.stateAssociationMember ? <span className="admin-status">LRV</span> : null}
                                    {club.isGermanClub ? <span className="admin-status">DE</span> : null}
                                    {club.isCentralGermanClub ? <span className="admin-status admin-status--ok">MDM</span> : null}
                                    <button type="button" className="btn btn-ghost" onClick={() => startEdit(club)}>
                                        Bearbeiten
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-ghost"
                                        disabled={loading === club.id}
                                        onClick={() => toggleClub(club)}
                                    >
                                        {club.active ? "Sperren" : "Aktivieren"}
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
