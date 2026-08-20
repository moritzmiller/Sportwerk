"use client";

import { useState } from "react";

const ROLE_OPTIONS = [
    { value: "OWNER", label: "Owner" },
    { value: "ADMIN", label: "Admin" },
    { value: "MEMBER", label: "Member" },
    { value: "VIEWER", label: "Viewer" },
];

function mapOrgs(initialOrgs = []) {
    return initialOrgs.map((organization) => ({
        ...organization,
        events: organization.events || [],
        venues: organization.venues || [],
        memberDraft: "",
        memberRole: "MEMBER",
        venueName: "",
        venueAddress: "",
        venueCity: "",
        venueNotes: "",
    }));
}

export default function OrganizationManager({ initialOrgs = [] }) {
    const [organizations, setOrganizations] = useState(() => mapOrgs(initialOrgs));
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({ name: "", slug: "", description: "" });

    function updateOrganization(organizationId, updater) {
        setOrganizations((current) =>
            current.map((organization) =>
                organization.id === organizationId ? updater(organization) : organization
            )
        );
    }

    async function createOrganization(event) {
        event.preventDefault();
        setLoading(true);
        setMessage("Organisation wird erstellt...");

        const response = await fetch("/api/organizations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
        });
        const data = await response.json();
        setLoading(false);

        if (!response.ok) {
            setMessage(data.error || "Organisation konnte nicht erstellt werden.");
            return;
        }

        setOrganizations((current) => [
            {
                ...data.organization,
                events: [],
                venues: [],
                memberDraft: "",
                memberRole: "MEMBER",
                venueName: "",
                venueAddress: "",
                venueCity: "",
                venueNotes: "",
            },
            ...current,
        ]);
        setForm({ name: "", slug: "", description: "" });
        setMessage("Organisation erstellt.");
    }

    async function addMember(organizationId) {
        const organization = organizations.find((entry) => entry.id === organizationId);
        if (!organization?.memberDraft) return;

        setLoading(true);
        const response = await fetch(`/api/organizations/${organizationId}/members`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: organization.memberDraft,
                role: organization.memberRole,
            }),
        });
        const data = await response.json();
        setLoading(false);

        if (!response.ok) {
            setMessage(data.error || "Mitglied konnte nicht hinzugefügt werden.");
            return;
        }

        updateOrganization(organizationId, (current) => ({
            ...current,
            members: [
                ...(current.members || []).filter((member) => member.userId !== data.member.userId),
                data.member,
            ],
            memberDraft: "",
            memberRole: "MEMBER",
        }));
        setMessage("Mitglied hinzugefügt.");
    }

    async function updateMemberRole(organizationId, memberId, role) {
        setLoading(true);
        const response = await fetch(`/api/organizations/${organizationId}/members`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ memberId, role }),
        });
        const data = await response.json();
        setLoading(false);

        if (!response.ok) {
            setMessage(data.error || "Rolle konnte nicht aktualisiert werden.");
            return;
        }

        updateOrganization(organizationId, (current) => ({
            ...current,
            members: (current.members || []).map((member) =>
                member.userId === memberId ? data.member : member
            ),
        }));
        setMessage("Rolle aktualisiert.");
    }

    async function removeMember(organizationId, memberId) {
        setLoading(true);
        const response = await fetch(`/api/organizations/${organizationId}/members`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ memberId }),
        });
        const data = await response.json();
        setLoading(false);

        if (!response.ok) {
            setMessage(data.error || "Mitglied konnte nicht entfernt werden.");
            return;
        }

        updateOrganization(organizationId, (current) => ({
            ...current,
            members: (current.members || []).filter((member) => member.userId !== memberId),
        }));
        setMessage("Mitglied entfernt.");
    }

    async function addVenue(organizationId) {
        const organization = organizations.find((entry) => entry.id === organizationId);
        if (!organization?.venueName?.trim()) return;

        setLoading(true);
        const response = await fetch(`/api/organizations/${organizationId}/venues`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: organization.venueName,
                address: organization.venueAddress,
                city: organization.venueCity,
                notes: organization.venueNotes,
            }),
        });
        const data = await response.json();
        setLoading(false);

        if (!response.ok) {
            setMessage(data.error || "Venue konnte nicht erstellt werden.");
            return;
        }

        updateOrganization(organizationId, (current) => ({
            ...current,
            venues: [data.venue, ...(current.venues || [])],
            venueName: "",
            venueAddress: "",
            venueCity: "",
            venueNotes: "",
        }));
        setMessage("Venue erstellt.");
    }

    async function removeVenue(organizationId, venueId) {
        setLoading(true);
        const response = await fetch(`/api/organizations/${organizationId}/venues`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ venueId }),
        });
        const data = await response.json();
        setLoading(false);

        if (!response.ok) {
            setMessage(data.error || "Venue konnte nicht entfernt werden.");
            return;
        }

        updateOrganization(organizationId, (current) => ({
            ...current,
            venues: (current.venues || []).filter((venue) => venue.id !== venueId),
        }));
        setMessage("Venue entfernt.");
    }

    return (
        <div className="stack-lg">
            <section className="card stack">
                <h2 className="card__title">Organisation anlegen</h2>
                <div className="grid checkout-form__grid">
                    <div className="field checkout-form__wide">
                        <label className="label" htmlFor="org-name">Name</label>
                        <input
                            id="org-name"
                            className="input"
                            value={form.name}
                            onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                            placeholder="z. B. Dresden Live UG"
                        />
                    </div>
                    <div className="field checkout-form__wide">
                        <label className="label" htmlFor="org-slug">Slug</label>
                        <input
                            id="org-slug"
                            className="input"
                            value={form.slug}
                            onChange={(e) => setForm((current) => ({ ...current, slug: e.target.value }))}
                            placeholder="optional, z. B. dresden-live"
                        />
                    </div>
                    <div className="field checkout-form__wide">
                        <label className="label" htmlFor="org-description">Beschreibung</label>
                        <textarea
                            id="org-description"
                            className="textarea"
                            value={form.description}
                            onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
                            placeholder="Wofür steht die Organisation?"
                        />
                    </div>
                </div>
                <button type="button" className="btn btn-primary" disabled={loading} onClick={createOrganization}>
                    {loading ? "Speichert..." : "Organisation erstellen"}
                </button>
            </section>

            <div className="stack">
                {organizations.map((organization) => (
                    <section key={organization.id} className="card stack">
                        <div className="section-title-row">
                            <div>
                                <h2>{organization.name}</h2>
                                <p className="text-muted">
                                    {organization.slug} · {organization.members?.length ?? 0} Mitglieder
                                </p>
                            </div>
                            <div className="stack-sm" style={{ alignItems: "flex-end" }}>
                                <span className="label">ID {organization.id}</span>
                                <span className="tag-remove">
                                    {organization.verificationStatus || "PENDING"}
                                </span>
                            </div>
                        </div>

                        <div className="summary-list">
                            <div>
                                <span className="label">Events</span>
                                <p>{organization.events?.length ?? 0}</p>
                            </div>
                            <div>
                                <span className="label">Rolle</span>
                                <p>{organization.members?.find((member) => member.userId === organization.ownerId)?.role ?? "OWNER"}</p>
                            </div>
                            <div>
                                <span className="label">Verifikation</span>
                                <p>{organization.verificationStatus || "PENDING"}</p>
                            </div>
                        </div>

                        <div className="stack">
                            {(organization.members || []).map((member) => (
                                <article key={member.id} className="analysis-card">
                                    <strong>{member.user?.name ?? member.user?.email ?? "Unbekannt"}</strong>
                                    <p>{member.user?.email}</p>
                                    <div className="flex wrap">
                                        <select
                                            className="select"
                                            value={member.role}
                                            onChange={(e) => updateMemberRole(organization.id, member.userId, e.target.value)}
                                            disabled={loading || member.userId === organization.ownerId}
                                        >
                                            {ROLE_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                        {member.userId !== organization.ownerId ? (
                                            <button
                                                type="button"
                                                className="btn btn-ghost"
                                                onClick={() => removeMember(organization.id, member.userId)}
                                                disabled={loading}
                                            >
                                                Entfernen
                                            </button>
                                        ) : null}
                                    </div>
                                </article>
                            ))}
                        </div>

                        <section className="card stack">
                            <div className="section-title-row">
                                <h3>Venues</h3>
                                <span className="text-muted">{organization.venues?.length ?? 0} Orte</span>
                            </div>

                            {organization.venues?.length ? (
                                <div className="stack">
                                    {organization.venues.map((venue) => (
                                        <article key={venue.id} className="analysis-card">
                                            <strong>{venue.name}</strong>
                                            <p>
                                                {[venue.address, venue.city].filter(Boolean).join(", ") || "Ohne Adresse"}
                                            </p>
                                            {venue.notes ? <p>{venue.notes}</p> : null}
                                            <small className="text-muted">
                                                {venue.events?.length ?? 0} verknuepfte Events
                                            </small>
                                            <div className="flex wrap">
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost"
                                                    onClick={() => removeVenue(organization.id, venue.id)}
                                                    disabled={loading}
                                                >
                                                    Entfernen
                                                </button>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-muted">Noch keine Venues angelegt.</p>
                            )}

                            <div className="grid checkout-form__grid">
                                <div className="field checkout-form__wide">
                                    <label className="label">Venue-Name</label>
                                    <input
                                        className="input"
                                        value={organization.venueName}
                                        onChange={(e) =>
                                            updateOrganization(organization.id, (current) => ({
                                                ...current,
                                                venueName: e.target.value,
                                            }))
                                        }
                                        placeholder="z. B. Alter Schlachthof"
                                    />
                                </div>
                                <div className="field checkout-form__wide">
                                    <label className="label">Adresse</label>
                                    <input
                                        className="input"
                                        value={organization.venueAddress}
                                        onChange={(e) =>
                                            updateOrganization(organization.id, (current) => ({
                                                ...current,
                                                venueAddress: e.target.value,
                                            }))
                                        }
                                        placeholder="Straße, Hausnummer"
                                    />
                                </div>
                                <div className="field">
                                    <label className="label">Stadt</label>
                                    <input
                                        className="input"
                                        value={organization.venueCity}
                                        onChange={(e) =>
                                            updateOrganization(organization.id, (current) => ({
                                                ...current,
                                                venueCity: e.target.value,
                                            }))
                                        }
                                        placeholder="Dresden"
                                    />
                                </div>
                                <div className="field checkout-form__wide">
                                    <label className="label">Notizen</label>
                                    <textarea
                                        className="textarea"
                                        value={organization.venueNotes}
                                        onChange={(e) =>
                                            updateOrganization(organization.id, (current) => ({
                                                ...current,
                                                venueNotes: e.target.value,
                                            }))
                                        }
                                        placeholder="Infos zu Zugang, Parken, Technik..."
                                    />
                                </div>
                            </div>

                            <button
                                type="button"
                                className="btn btn-ghost"
                                disabled={loading}
                                onClick={() => addVenue(organization.id)}
                            >
                                Venue hinzufügen
                            </button>
                        </section>

                        <div className="grid checkout-form__grid">
                            <div className="field checkout-form__wide">
                                <label className="label">Mitglied per E-Mail hinzufügen</label>
                                <input
                                    className="input"
                                    value={organization.memberDraft}
                                    onChange={(e) =>
                                        updateOrganization(organization.id, (current) => ({
                                            ...current,
                                            memberDraft: e.target.value,
                                        }))
                                    }
                                    placeholder="name@beispiel.de"
                                />
                            </div>
                            <div className="field">
                                <label className="label">Rolle</label>
                                <select
                                    className="select"
                                    value={organization.memberRole}
                                    onChange={(e) =>
                                        updateOrganization(organization.id, (current) => ({
                                            ...current,
                                            memberRole: e.target.value,
                                        }))
                                    }
                                >
                                    {ROLE_OPTIONS.filter((option) => option.value !== "OWNER").map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={loading}
                            onClick={() => addMember(organization.id)}
                        >
                            Mitglied hinzufügen
                        </button>
                    </section>
                ))}
            </div>

            {message ? <p className="auth-message">{message}</p> : null}
        </div>
    );
}
