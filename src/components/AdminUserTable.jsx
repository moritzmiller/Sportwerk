"use client";

import { useState } from "react";

const ROLES = ["VISITOR", "ORGANIZER", "ADMIN"];
const ROLE_LABELS = {
    VISITOR: "Besucher",
    ORGANIZER: "Veranstalter",
    ADMIN: "Admin",
};

function formatDate(value) {
    if (!value) return "Unbekannt";
    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(new Date(value));
}

export default function AdminUserTable({ users, currentUserId }) {
    const [rows, setRows] = useState(users);
    const [msg, setMsg] = useState("");

    async function changeRole(id, role) {
        setMsg("");
        const res = await fetch("/api/admin/users", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, role }),
        });
        const data = await res.json();
        if (!res.ok) {
            setMsg(data.error || "Fehler beim Aktualisieren.");
            return;
        }
        setRows((r) => r.map((u) => (u.id === id ? { ...u, role } : u)));
    }

    async function deleteUser(id) {
        if (!confirm("Diesen Account deaktivieren? Events des Accounts werden storniert, aber Daten bleiben erhalten.")) return;
        setMsg("");
        const res = await fetch("/api/admin/users", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        const data = await res.json();
        if (!res.ok) {
            setMsg(data.error || "Fehler beim Deaktivieren.");
            return;
        }
        setRows((r) =>
            r.map((u) => (u.id === id ? { ...u, disabledAt: data.disabledAt } : u))
        );
        setMsg("Account wurde deaktiviert.");
    }

    async function reactivateUser(id) {
        if (!confirm("Diesen Account wieder aktivieren? Events bleiben unverändert.")) return;
        setMsg("");
        const res = await fetch("/api/admin/users", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, action: "reactivate" }),
        });
        const data = await res.json();
        if (!res.ok) {
            setMsg(data.error || "Fehler beim Reaktivieren.");
            return;
        }
        setRows((r) =>
            r.map((u) => (u.id === id ? { ...u, disabledAt: data.user.disabledAt } : u))
        );
        setMsg("Account wurde reaktiviert.");
    }

    return (
        <div className="admin-user-table">
            {msg ? <p className="admin-user-table__message">{msg}</p> : null}
            <div className="admin-user-table__scroll">
                <table>
                    <thead>
                        <tr>
                            <th>E-Mail</th>
                            <th>Name</th>
                            <th>Rolle</th>
                            <th>Events</th>
                            <th>Erstellt</th>
                            <th>Aktionen</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((u) => (
                            <tr key={u.id}>
                                <td>
                                    <div className="admin-user-table__identity">
                                        <span>{u.email}</span>
                                        {u.id === currentUserId ? <small>Aktuelle Sitzung</small> : null}
                                        {u.disabledAt ? <small>Deaktiviert</small> : null}
                                    </div>
                                </td>
                                <td>{u.name || "-"}</td>
                                <td>
                                    <select
                                        className="select admin-user-table__select"
                                        value={u.role}
                                        onChange={(e) => changeRole(u.id, e.target.value)}
                                        aria-label={`Rolle für ${u.email}`}
                                        disabled={Boolean(u.disabledAt)}
                                    >
                                        {ROLES.map((r) => (
                                            <option key={r} value={r}>
                                                {ROLE_LABELS[r]}
                                            </option>
                                        ))}
                                    </select>
                                </td>
                                <td>
                                    <span className="admin-user-table__events">{u.events}</span>
                                </td>
                                <td>{formatDate(u.createdAt)}</td>
                                <td>
                                    {u.disabledAt ? (
                                        <button
                                            type="button"
                                            className="btn btn-ghost admin-user-table__delete"
                                            onClick={() => reactivateUser(u.id)}
                                        >
                                            Reaktivieren
                                        </button>
                                    ) : u.id !== currentUserId ? (
                                        <button
                                            type="button"
                                            className="btn btn-ghost admin-user-table__delete"
                                            onClick={() => deleteUser(u.id)}
                                        >
                                            Deaktivieren
                                        </button>
                                    ) : (
                                        <span className="admin-status">Du</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
