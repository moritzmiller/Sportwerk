"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const EMPTY_CREATE = {
    organizationId: "",
    name: "",
    address: "",
    city: "",
    notes: "",
};

function mapOrganizations(initialOrganizations = []) {
    return initialOrganizations.map((organization) => ({
        ...organization,
        events: organization.events || [],
        venues: (organization.venues || []).map((venue) => ({
            ...venue,
            events: venue.events || [],
            draftName: venue.name ?? "",
            draftAddress: venue.address ?? "",
            draftCity: venue.city ?? "",
            draftNotes: venue.notes ?? "",
            assignmentEventId: "",
        })),
    }));
}

function formatEventDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}

function normalizeText(value) {
    return String(value ?? "").trim().toLowerCase();
}

export default function VenueManager({ initialOrganizations = [] }) {
    const router = useRouter();
    const [organizations, setOrganizations] = useState(() => mapOrganizations(initialOrganizations));
    const [createForm, setCreateForm] = useState(EMPTY_CREATE);
    const [search, setSearch] = useState("");
    const [selectedOrgId, setSelectedOrgId] = useState("all");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    const orgById = useMemo(() => new Map(organizations.map((org) => [org.id, org])), [organizations]);

    const allVenues = useMemo(
        () =>
            organizations.flatMap((organization) =>
                organization.venues.map((venue) => ({
                    ...venue,
                    organizationId: organization.id,
                    organizationName: organization.name,
                    organizationSlug: organization.slug,
                    linkedEvents: venue.events || [],
                }))
            ),
        [organizations]
    );

    const allEvents = useMemo(
        () =>
            organizations.flatMap((organization) =>
                (organization.events || []).map((event) => ({
                    ...event,
                    organizationId: organization.id,
                    organizationName: organization.name,
                }))
            ),
        [organizations]
    );

    const filteredVenues = useMemo(() => {
        const q = normalizeText(search);

        return allVenues.filter((venue) => {
            if (selectedOrgId !== "all" && venue.organizationId !== selectedOrgId) {
                return false;
            }

            if (!q) return true;

            const haystack = [
                venue.name,
                venue.address,
                venue.city,
                venue.notes,
                venue.organizationName,
                ...(venue.linkedEvents || []).map((event) => event.title),
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return haystack.includes(q);
        });
    }, [allVenues, search, selectedOrgId]);

    const stats = useMemo(
        () => ({
            organizations: organizations.length,
            venues: allVenues.length,
            linkedEvents: allEvents.filter((event) => Boolean(event.venueId)).length,
            unassignedEvents: allEvents.filter((event) => !event.venueId).length,
            cities: new Set(allVenues.map((venue) => venue.city).filter(Boolean)).size,
        }),
        [allVenues, allEvents, organizations.length]
    );

    function updateOrganizationVenue(organizationId, venueId, updater) {
        setOrganizations((current) =>
            current.map((organization) => {
                if (organization.id !== organizationId) return organization;
                return {
                    ...organization,
                    venues: organization.venues.map((venue) =>
                        venue.id === venueId ? updater(venue) : venue
                    ),
                };
            })
        );
    }

    function updateCreateForm(field, value) {
        setCreateForm((current) => ({ ...current, [field]: value }));
    }

    async function createVenue(event) {
        event.preventDefault();
        if (!createForm.organizationId || !createForm.name.trim()) return;

        setLoading(true);
        setMessage("Venue wird angelegt...");

        const response = await fetch(`/api/organizations/${createForm.organizationId}/venues`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(createForm),
        });
        const data = await response.json();
        setLoading(false);

        if (!response.ok) {
            setMessage(data.error || "Venue konnte nicht angelegt werden.");
            return;
        }

        setOrganizations((current) =>
            current.map((organization) =>
                organization.id === createForm.organizationId
                    ? {
                          ...organization,
                          venues: [
                              {
                                  ...data.venue,
                                  events: data.venue.events || [],
                                  draftName: data.venue.name ?? "",
                                  draftAddress: data.venue.address ?? "",
                                  draftCity: data.venue.city ?? "",
                                  draftNotes: data.venue.notes ?? "",
                                  assignmentEventId: "",
                              },
                              ...organization.venues,
                          ],
                      }
                    : organization
            )
        );
        setCreateForm(EMPTY_CREATE);
        setMessage("Venue erstellt.");
    }

    async function saveVenue(organizationId, venue) {
        setLoading(true);
        setMessage("Venue wird gespeichert...");

        const response = await fetch(`/api/organizations/${organizationId}/venues`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                venueId: venue.id,
                name: venue.draftName,
                address: venue.draftAddress,
                city: venue.draftCity,
                notes: venue.draftNotes,
            }),
        });
        const data = await response.json();
        setLoading(false);

        if (!response.ok) {
            setMessage(data.error || "Venue konnte nicht gespeichert werden.");
            return;
        }

        updateOrganizationVenue(organizationId, venue.id, (current) => ({
            ...current,
            ...data.venue,
            events: data.venue.events || current.events || [],
            draftName: data.venue.name ?? "",
            draftAddress: data.venue.address ?? "",
            draftCity: data.venue.city ?? "",
            draftNotes: data.venue.notes ?? "",
        }));
        setMessage("Venue gespeichert.");
    }

    async function deleteVenue(organizationId, venueId) {
        const organization = orgById.get(organizationId);
        const venue = organization?.venues.find((entry) => entry.id === venueId);

        if (
            !window.confirm(
                `Venue "${venue?.name ?? venueId}" wirklich entfernen? Zugeordnete Events behalten ihre Daten und verlieren nur die Venue-Verknüpfung.`
            )
        ) {
            return;
        }

        setLoading(true);
        setMessage("Venue wird entfernt...");

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

        setOrganizations((current) =>
            current.map((organization) =>
                organization.id === organizationId
                    ? {
                          ...organization,
                          venues: organization.venues.filter((venue) => venue.id !== venueId),
                      }
                    : organization
            )
        );
        setMessage("Venue entfernt.");
    }

    async function assignEventToVenue(organizationId, venueId, eventId) {
        if (!eventId) return;

        setLoading(true);
        setMessage("Event wird zugewiesen...");

        const response = await fetch(`/api/events/${eventId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                venueId,
                organizationId,
            }),
        });
        const data = await response.json();
        setLoading(false);

        if (!response.ok) {
            setMessage(data.error || "Event konnte nicht zugewiesen werden.");
            return;
        }

        router.refresh();
    }

    const venueCountByOrg = useMemo(() => {
        const counts = new Map();
        for (const organization of organizations) {
            counts.set(organization.id, organization.venues.length);
        }
        return counts;
    }, [organizations]);

    return (
        <div className="stack-lg">
            <section className="stats">
                <div className="stat">
                    <div className="stat__value">{stats.organizations}</div>
                    <div className="stat__label">Organisationen</div>
                </div>
                <div className="stat">
                    <div className="stat__value">{stats.venues}</div>
                    <div className="stat__label">Venues</div>
                </div>
                <div className="stat">
                    <div className="stat__value">{stats.linkedEvents}</div>
                    <div className="stat__label">Verknüpfte Events</div>
                </div>
                <div className="stat">
                    <div className="stat__value">{stats.unassignedEvents}</div>
                    <div className="stat__label">Events ohne Venue</div>
                </div>
                <div className="stat">
                    <div className="stat__value">{stats.cities}</div>
                    <div className="stat__label">Städte</div>
                </div>
            </section>

            <section className="card stack-lg">
                <div className="section-title-row">
                    <div>
                        <h2 className="card__title">Venue anlegen</h2>
                        <p className="text-muted">
                            Lege neue Orte an und ordne sie direkt einer Organisation zu.
                        </p>
                    </div>
                    <Link href="/dashboard/organizations" className="nav__link">
                        Organisationen
                    </Link>
                </div>

                <form className="grid checkout-form__grid" onSubmit={createVenue}>
                    <div className="field checkout-form__wide">
                        <label className="label" htmlFor="venue-org">
                            Organisation
                        </label>
                        <select
                            id="venue-org"
                            className="select"
                            value={createForm.organizationId}
                            onChange={(e) => updateCreateForm("organizationId", e.target.value)}
                        >
                            <option value="">Organisation auswählen</option>
                            {organizations.map((organization) => (
                                <option key={organization.id} value={organization.id}>
                                    {organization.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="field checkout-form__wide">
                        <label className="label" htmlFor="venue-name">
                            Name
                        </label>
                        <input
                            id="venue-name"
                            className="input"
                            value={createForm.name}
                            onChange={(e) => updateCreateForm("name", e.target.value)}
                            placeholder="z. B. Alter Schlachthof"
                            required
                        />
                    </div>
                    <div className="field checkout-form__wide">
                        <label className="label" htmlFor="venue-address">
                            Adresse
                        </label>
                        <input
                            id="venue-address"
                            className="input"
                            value={createForm.address}
                            onChange={(e) => updateCreateForm("address", e.target.value)}
                            placeholder="Straße, Hausnummer"
                        />
                    </div>
                    <div className="field">
                        <label className="label" htmlFor="venue-city">
                            Stadt
                        </label>
                        <input
                            id="venue-city"
                            className="input"
                            value={createForm.city}
                            onChange={(e) => updateCreateForm("city", e.target.value)}
                            placeholder="Dresden"
                        />
                    </div>
                    <div className="field checkout-form__wide">
                        <label className="label" htmlFor="venue-notes">
                            Notizen
                        </label>
                        <textarea
                            id="venue-notes"
                            className="textarea"
                            value={createForm.notes}
                            onChange={(e) => updateCreateForm("notes", e.target.value)}
                            placeholder="Zugang, Bühne, Parken, Besonderheiten..."
                        />
                    </div>
                    <div className="field checkout-form__wide">
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? "Speichert..." : "Venue erstellen"}
                        </button>
                    </div>
                </form>
            </section>

            <section className="card stack-lg">
                <div className="section-title-row">
                    <div>
                        <h2 className="card__title">Venues durchsuchen</h2>
                        <p className="text-muted">
                            Suche über Name, Adresse, Stadt, Notizen oder zugeordnete Events.
                        </p>
                    </div>
                    <div className="flex wrap">
                        <input
                            className="input"
                            style={{ minWidth: 240 }}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Suchen..."
                        />
                        <select
                            className="select"
                            value={selectedOrgId}
                            onChange={(e) => setSelectedOrgId(e.target.value)}
                        >
                            <option value="all">Alle Organisationen</option>
                            {organizations.map((organization) => (
                                <option key={organization.id} value={organization.id}>
                                    {organization.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {filteredVenues.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">🏠</div>
                        <p>Keine Venues gefunden.</p>
                    </div>
                ) : (
                    <div className="stack-lg">
                        {organizations
                            .filter(
                                (organization) =>
                                    selectedOrgId === "all" || organization.id === selectedOrgId
                            )
                            .map((organization) => {
                                const orgVenues = organization.venues.filter((venue) => {
                                    const q = normalizeText(search);
                                    if (!q) return true;
                                    const haystack = [
                                        venue.name,
                                        venue.address,
                                        venue.city,
                                        venue.notes,
                                        organization.name,
                                        ...(venue.events || []).map((event) => event.title),
                                    ]
                                        .filter(Boolean)
                                        .join(" ")
                                        .toLowerCase();
                                    return haystack.includes(q);
                                });

                                if (orgVenues.length === 0) return null;

                                return (
                                    <section key={organization.id} className="stack">
                                        <div className="section-title-row">
                                            <div>
                                                <h3>{organization.name}</h3>
                                                <p className="text-muted">
                                                    {organization.slug} ·{" "}
                                                    {venueCountByOrg.get(organization.id) || 0} Venues
                                                </p>
                                            </div>
                                            <div className="stack-sm" style={{ alignItems: "flex-end" }}>
                                                <span className="label">
                                                    {organization.events?.length || 0} Events
                                                </span>
                                                <span className="tag-remove">
                                                    {organization.verificationStatus || "PENDING"}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="stack">
                                            {orgVenues.map((venue) => {
                                                const assignableEvents = (organization.events || []).filter(
                                                    (event) => String(event.venueId ?? "") !== venue.id
                                                );

                                                return (
                                                    <article key={venue.id} className="card stack-lg">
                                                        <div className="booking-detail__top">
                                                            <div>
                                                                <div className="booking-detail__title">
                                                                    {venue.draftName || venue.name}
                                                                </div>
                                                                <div className="booking-detail__meta">
                                                                    <span>{organization.name}</span>
                                                                    {venue.draftCity ? (
                                                                        <span>{venue.draftCity}</span>
                                                                    ) : null}
                                                                    <span>
                                                                        {venue.linkedEvents?.length || 0} Events
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="booking-detail__aside">
                                                                <strong>{venue.id}</strong>
                                                                <span>Venue-ID</span>
                                                            </div>
                                                        </div>

                                                        <div className="grid checkout-form__grid">
                                                            <div className="field checkout-form__wide">
                                                                <label className="label">Name</label>
                                                                <input
                                                                    className="input"
                                                                    value={venue.draftName}
                                                                    onChange={(e) =>
                                                                        updateOrganizationVenue(
                                                                            organization.id,
                                                                            venue.id,
                                                                            (current) => ({
                                                                                ...current,
                                                                                draftName: e.target.value,
                                                                            })
                                                                        )
                                                                    }
                                                                />
                                                            </div>
                                                            <div className="field checkout-form__wide">
                                                                <label className="label">Adresse</label>
                                                                <input
                                                                    className="input"
                                                                    value={venue.draftAddress}
                                                                    onChange={(e) =>
                                                                        updateOrganizationVenue(
                                                                            organization.id,
                                                                            venue.id,
                                                                            (current) => ({
                                                                                ...current,
                                                                                draftAddress: e.target.value,
                                                                            })
                                                                        )
                                                                    }
                                                                />
                                                            </div>
                                                            <div className="field">
                                                                <label className="label">Stadt</label>
                                                                <input
                                                                    className="input"
                                                                    value={venue.draftCity}
                                                                    onChange={(e) =>
                                                                        updateOrganizationVenue(
                                                                            organization.id,
                                                                            venue.id,
                                                                            (current) => ({
                                                                                ...current,
                                                                                draftCity: e.target.value,
                                                                            })
                                                                        )
                                                                    }
                                                                />
                                                            </div>
                                                            <div className="field checkout-form__wide">
                                                                <label className="label">Notizen</label>
                                                                <textarea
                                                                    className="textarea"
                                                                    value={venue.draftNotes}
                                                                    onChange={(e) =>
                                                                        updateOrganizationVenue(
                                                                            organization.id,
                                                                            venue.id,
                                                                            (current) => ({
                                                                                ...current,
                                                                                draftNotes: e.target.value,
                                                                            })
                                                                        )
                                                                    }
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="flex wrap">
                                                            <button
                                                                type="button"
                                                                className="btn btn-primary"
                                                                disabled={loading}
                                                                onClick={() => saveVenue(organization.id, venue)}
                                                            >
                                                                Speichern
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn btn-ghost"
                                                                disabled={loading}
                                                                onClick={() => deleteVenue(organization.id, venue.id)}
                                                            >
                                                                Löschen
                                                            </button>
                                                        </div>

                                                        <div className="summary-list">
                                                            <div>
                                                                <span className="label">Adresse</span>
                                                                <strong>
                                                                    {[venue.draftAddress, venue.draftCity]
                                                                        .filter(Boolean)
                                                                        .join(", ") || "Nicht hinterlegt"}
                                                                </strong>
                                                            </div>
                                                            <div>
                                                                <span className="label">Zugeordnete Events</span>
                                                                <strong>{venue.linkedEvents?.length || 0}</strong>
                                                            </div>
                                                            <div>
                                                                <span className="label">Organisation</span>
                                                                <strong>{organization.name}</strong>
                                                            </div>
                                                            <div>
                                                                <span className="label">Verifikation</span>
                                                                <strong>{venue.verificationStatus || "PENDING"}</strong>
                                                            </div>
                                                        </div>

                                                        <div className="stack">
                                                            <div className="section-title-row">
                                                                <h4 className="card__title">Events an diesem Ort</h4>
                                                                <span className="text-muted">
                                                                    {venue.linkedEvents?.length || 0} aktuell
                                                                </span>
                                                            </div>

                                                            {venue.linkedEvents?.length ? (
                                                                <div className="stack">
                                                                    {venue.linkedEvents.map((event) => (
                                                                        <article
                                                                            key={event.id}
                                                                            className="analysis-card"
                                                                        >
                                                                            <strong>{event.title}</strong>
                                                                            <p>
                                                                                {formatEventDate(event.startDate)} ·{" "}
                                                                                {event.status}
                                                                            </p>
                                                                            <Link
                                                                                href={`/dashboard/events/${event.id}/edit`}
                                                                                className="nav__link"
                                                                            >
                                                                                Event bearbeiten →
                                                                            </Link>
                                                                        </article>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <p className="text-muted">
                                                                    Hier sind noch keine Events verknüpft.
                                                                </p>
                                                            )}
                                                        </div>

                                                        <div className="grid checkout-form__grid">
                                                            <div className="field checkout-form__wide">
                                                                <label className="label">
                                                                    Event zuweisen
                                                                </label>
                                                                <select
                                                                    className="select"
                                                                    value={venue.assignmentEventId}
                                                                    onChange={(e) =>
                                                                        updateOrganizationVenue(
                                                                            organization.id,
                                                                            venue.id,
                                                                            (current) => ({
                                                                                ...current,
                                                                                assignmentEventId: e.target.value,
                                                                            })
                                                                        )
                                                                    }
                                                                >
                                                                    <option value="">
                                                                        Event auswählen
                                                                    </option>
                                                                    {assignableEvents.map((event) => (
                                                                        <option key={event.id} value={event.id}>
                                                                            {event.title} ·{" "}
                                                                            {event.venueId
                                                                                ? `aktuell: ${orgById.get(
                                                                                      organization.id
                                                                                  )?.venues.find(
                                                                                      (entry) =>
                                                                                          entry.id === event.venueId
                                                                                  )?.name || "andere Venue"}`
                                                                                : "ohne Venue"}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            <div className="field">
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-ghost"
                                                                    disabled={
                                                                        loading || !venue.assignmentEventId
                                                                    }
                                                                    onClick={() =>
                                                                        assignEventToVenue(
                                                                            organization.id,
                                                                            venue.id,
                                                                            venue.assignmentEventId
                                                                        )
                                                                    }
                                                                >
                                                                    Zuweisen
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </article>
                                                );
                                            })}
                                        </div>
                                    </section>
                                );
                            })}
                    </div>
                )}
            </section>

            {message ? <p className="auth-message">{message}</p> : null}
        </div>
    );
}
