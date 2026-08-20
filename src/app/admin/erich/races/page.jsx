import Link from "next/link";
import { redirect } from "next/navigation";

import ErichRaceReviewTable from "@/components/ErichRaceReviewTable";
import { getCurrentUser } from "@/lib/auth";
import {
    buildRaceReviewSummary,
    erichRaceReviewInclude,
} from "@/lib/erich/master-data-review";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "ERICH Rennen - GateKeeper Admin",
};

function serialize(value) {
    return JSON.parse(JSON.stringify(value));
}

function formatDate(value) {
    if (!value) return "Termin offen";
    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(new Date(value));
}

function statusClass(status) {
    if (status === "ACTIVE") return "admin-status admin-status--ok";
    if (status === "REVIEW_REQUIRED") return "admin-status admin-status--warning";
    return "admin-status";
}

export default async function AdminErichRacesPage({ searchParams }) {
    const user = await getCurrentUser();
    if (!user) redirect("/auth");
    if (user.role !== "ADMIN") redirect("/dashboard");

    const resolvedSearchParams = await searchParams;
    const requestedEventId = resolvedSearchParams?.eventId ?? "";

    const events = await prisma.erichEvent.findMany({
        orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
        select: {
            id: true,
            name: true,
            slug: true,
            startsAt: true,
            status: true,
            _count: {
                select: {
                    raceDefinitions: true,
                    pricePhases: true,
                },
            },
        },
    });

    const selectedEvent = events.find((event) => event.id === requestedEventId) ?? events[0] ?? null;
    const races = selectedEvent
        ? await prisma.erichRaceDefinition.findMany({
              where: { eventId: selectedEvent.id },
              include: erichRaceReviewInclude(),
              orderBy: [{ status: "desc" }, { raceNumber: "asc" }],
          })
        : [];

    const raceRows = races.map((race) => ({
        ...race,
        review: buildRaceReviewSummary(race),
    }));

    const activeCount = races.filter((race) => race.status === "ACTIVE").length;
    const reviewCount = races.filter((race) => race.status === "REVIEW_REQUIRED").length;
    const inactiveCount = races.filter((race) => race.status === "INACTIVE").length;
    const canActivateCount = raceRows.filter((race) => race.review.canActivate).length;

    return (
        <main className="admin-shell">
            <section className="admin-hero">
                <div className="container admin-hero__inner">
                    <div className="admin-hero__copy">
                        <span className="eyebrow">ERICH Admin</span>
                        <h1>Race Master Data</h1>
                        <p>
                            Importierte ERICH-Rennen prüfen, unklare Excel-Zeilen zurückhalten und
                            freigabefähige Rennen für den Wizard aktivieren.
                        </p>
                        <div className="admin-hero__meta">
                            <span>{selectedEvent?.name ?? "Kein ERICH-Event"}</span>
                            <span>{selectedEvent ? formatDate(selectedEvent.startsAt) : "Ohne Daten"}</span>
                        </div>
                    </div>
                    <div className="admin-hero__actions">
                        <Link href="/admin" className="btn btn-ghost">
                            Zurück
                        </Link>
                        <Link href="/erich/register" className="btn btn-primary">
                            Wizard öffnen
                        </Link>
                    </div>
                </div>
            </section>

            <div className="container admin-dashboard">
                <section className="admin-metrics" aria-label="ERICH Race Master Kennzahlen">
                    <div className={reviewCount > 0 ? "admin-metric admin-metric--attention" : "admin-metric"}>
                        <span className="admin-metric__label">Review</span>
                        <strong>{reviewCount}</strong>
                        <span>müssen manuell geprüft werden</span>
                    </div>
                    <div className="admin-metric">
                        <span className="admin-metric__label">Aktiv</span>
                        <strong>{activeCount}</strong>
                        <span>im Registrierungswizard sichtbar</span>
                    </div>
                    <div className="admin-metric">
                        <span className="admin-metric__label">Freigabefähig</span>
                        <strong>{canActivateCount}</strong>
                        <span>ohne technische Blocker</span>
                    </div>
                    <div className="admin-metric">
                        <span className="admin-metric__label">Inaktiv</span>
                        <strong>{inactiveCount}</strong>
                        <span>temporär gesperrt</span>
                    </div>
                </section>

                <section className="admin-panel">
                    <div className="admin-panel__header">
                        <div>
                            <span className="eyebrow">Event</span>
                            <h2>ERICH Event auswählen</h2>
                        </div>
                        <span className="admin-panel__count">{events.length} Events</span>
                    </div>
                    {events.length === 0 ? (
                        <p className="text-muted">Noch kein ERICH-Event vorhanden.</p>
                    ) : (
                        <div className="admin-list">
                            {events.map((event) => (
                                <Link
                                    key={event.id}
                                    href={`/admin/erich/races?eventId=${event.id}`}
                                    className="admin-list-row erich-event-row"
                                >
                                    <div className="admin-list-row__main">
                                        <strong>{event.name}</strong>
                                        <span>
                                            {event.slug} · {formatDate(event.startsAt)} ·{" "}
                                            {event._count.raceDefinitions} Rennen ·{" "}
                                            {event._count.pricePhases} Preisphasen
                                        </span>
                                    </div>
                                    <div className="admin-list-row__aside">
                                        <span className={statusClass(event.status)}>{event.status}</span>
                                        {selectedEvent?.id === event.id ? <span className="admin-status">Ausgewählt</span> : null}
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>

                <section className="admin-panel">
                    <div className="admin-panel__header">
                        <div>
                            <span className="eyebrow">Rennen</span>
                            <h2>{selectedEvent?.name ?? "Race Review"}</h2>
                        </div>
                        <span className="admin-panel__count">{races.length} Einträge</span>
                    </div>
                    <ErichRaceReviewTable races={serialize(raceRows)} />
                </section>
            </div>
        </main>
    );
}
