"use client";

import { useMemo, useState } from "react";

export default function AdminOrganizerManager({ organizers }) {
    const [rows, setRows] = useState(organizers);
    const [form, setForm] = useState({ name: "", email: "", password: "" });
    const [editingId, setEditingId] = useState("");
    const [editingName, setEditingName] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [credentials, setCredentials] = useState(null);

    const sortedRows = useMemo(
        () =>
            [...rows].sort((left, right) =>
                String(left.name || left.email).localeCompare(String(right.name || right.email), "de")
            ),
        [rows]
    );

    async function createOrganizer(event) {
        event.preventDefault();
        setBusy(true);
        setMessage("");
        setCredentials(null);

        try {
            const response = await fetch("/api/admin/organizers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await response.json();

            if (!response.ok) {
                setMessage(data.error || "Veranstalter konnte nicht erstellt werden.");
                return;
            }

            setRows((current) => [data.organizer, ...current]);
            setCredentials(data.credentials);
            setForm({ name: "", email: "", password: "" });
            setMessage("Veranstalter wurde erstellt.");
        } finally {
            setBusy(false);
        }
    }

    async function renameOrganizer(id) {
        const name = editingName.trim();
        if (!name) return;

        setBusy(true);
        setMessage("");

        try {
            const response = await fetch("/api/admin/organizers", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, name }),
            });
            const data = await response.json();

            if (!response.ok) {
                setMessage(data.error || "Name konnte nicht geändert werden.");
                return;
            }

            setRows((current) =>
                current.map((organizer) =>
                    organizer.id === id ? data.organizer : organizer
                )
            );
            setEditingId("");
            setEditingName("");
            setMessage("Veranstalter wurde umbenannt.");
        } finally {
            setBusy(false);
        }
    }

    async function deleteOrganizer(organizer) {
        const confirmed = window.confirm(
            `${organizer.name || organizer.email} deaktivieren? Zugehörige Events werden storniert, Daten bleiben aber erhalten.`
        );
        if (!confirmed) return;

        setBusy(true);
        setMessage("");

        try {
            const response = await fetch("/api/admin/organizers", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: organizer.id }),
            });
            const data = await response.json();

            if (!response.ok) {
                setMessage(data.error || "Veranstalter konnte nicht deaktiviert werden.");
                return;
            }

            setRows((current) =>
                current.map((row) => (row.id === organizer.id ? data.organizer : row))
            );
            setMessage("Veranstalter wurde deaktiviert.");
        } finally {
            setBusy(false);
        }
    }

    async function reactivateOrganizer(organizer) {
        const confirmed = window.confirm(
            `${organizer.name || organizer.email} wieder aktivieren? Events bleiben unverändert.`
        );
        if (!confirmed) return;

        setBusy(true);
        setMessage("");

        try {
            const response = await fetch("/api/admin/organizers", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: organizer.id, action: "reactivate" }),
            });
            const data = await response.json();

            if (!response.ok) {
                setMessage(data.error || "Veranstalter konnte nicht reaktiviert werden.");
                return;
            }

            setRows((current) =>
                current.map((row) => (row.id === organizer.id ? data.organizer : row))
            );
            setMessage("Veranstalter wurde reaktiviert.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="admin-organizers">
            <section className="card stack-lg">
                <div>
                    <span className="eyebrow">Neu</span>
                    <h2>Veranstalter erstellen</h2>
                </div>

                <form className="admin-organizers__form" onSubmit={createOrganizer}>
                    <div className="field">
                        <label className="label" htmlFor="organizer-name">
                            Name
                        </label>
                        <input
                            id="organizer-name"
                            className="input"
                            value={form.name}
                            onChange={(event) =>
                                setForm((current) => ({ ...current, name: event.target.value }))
                            }
                            placeholder="z. B. Konzertagentur Dresden"
                            required
                        />
                    </div>
                    <div className="field">
                        <label className="label" htmlFor="organizer-email">
                            E-Mail
                        </label>
                        <input
                            id="organizer-email"
                            className="input"
                            type="email"
                            value={form.email}
                            onChange={(event) =>
                                setForm((current) => ({ ...current, email: event.target.value }))
                            }
                            placeholder="veranstalter@example.com"
                            required
                        />
                    </div>
                    <div className="field">
                        <label className="label" htmlFor="organizer-password">
                            Passwort
                        </label>
                        <input
                            id="organizer-password"
                            className="input"
                            value={form.password}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    password: event.target.value,
                                }))
                            }
                            placeholder="Leer lassen für Auto-Passwort"
                            minLength={8}
                        />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={busy}>
                        {busy ? "Speichert..." : "Veranstalter erstellen"}
                    </button>
                </form>

                {credentials ? (
                    <div className="admin-organizers__credentials">
                        <span className="label">Zugangsdaten</span>
                        <strong>{credentials.email}</strong>
                        <code>{credentials.password}</code>
                    </div>
                ) : null}
                {message ? <p className="field-hint">{message}</p> : null}
            </section>

            <section className="card stack-lg">
                <div className="section-title-row">
                    <div>
                        <span className="eyebrow">Konten</span>
                        <h2>Veranstalter verwalten</h2>
                    </div>
                    <span className="text-muted">{rows.length} gesamt</span>
                </div>

                {sortedRows.length === 0 ? (
                    <p className="text-muted">Noch keine Veranstalter vorhanden.</p>
                ) : (
                    <div className="admin-organizers__list">
                        {sortedRows.map((organizer) => {
                            const editing = organizer.id === editingId;

                            return (
                                <article key={organizer.id} className="admin-organizer-row">
                                    <div className="admin-organizer-row__main">
                                        {editing ? (
                                            <input
                                                className="input"
                                                value={editingName}
                                                onChange={(event) => setEditingName(event.target.value)}
                                                autoFocus
                                            />
                                        ) : (
                                            <>
                                                <strong>{organizer.name || "Ohne Namen"}</strong>
                                                <span>{organizer.email}</span>
                                                {organizer.disabledAt ? (
                                                    <span>Deaktiviert seit {new Date(organizer.disabledAt).toLocaleDateString("de-DE")}</span>
                                                ) : null}
                                            </>
                                        )}
                                    </div>
                                    <div className="admin-organizer-row__meta">
                                        <span>{organizer.events} Events</span>
                                        <span>{organizer.organizations} Organisationen</span>
                                        <span>{organizer.venues} Venues</span>
                                    </div>
                                    <div className="admin-organizer-row__actions">
                                        {editing ? (
                                            <>
                                                <button
                                                    type="button"
                                                    className="btn btn-primary"
                                                    onClick={() => renameOrganizer(organizer.id)}
                                                    disabled={busy}
                                                >
                                                    Speichern
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost"
                                                    onClick={() => {
                                                        setEditingId("");
                                                        setEditingName("");
                                                    }}
                                                    disabled={busy}
                                                >
                                                    Abbrechen
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                {organizer.disabledAt ? (
                                                    <>
                                                        <span className="admin-status admin-status--warning">
                                                            Deaktiviert
                                                        </span>
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost"
                                                            onClick={() => reactivateOrganizer(organizer)}
                                                            disabled={busy}
                                                        >
                                                            Reaktivieren
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost"
                                                            onClick={() => {
                                                                setEditingId(organizer.id);
                                                                setEditingName(organizer.name || "");
                                                            }}
                                                        >
                                                            Umbenennen
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn btn-danger"
                                                            onClick={() => deleteOrganizer(organizer)}
                                                            disabled={busy}
                                                        >
                                                            Deaktivieren
                                                        </button>
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
