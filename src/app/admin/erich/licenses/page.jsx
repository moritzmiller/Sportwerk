import Link from "next/link";
import { redirect } from "next/navigation";

import ErichLicenseReviewPanel from "@/components/ErichLicenseReviewPanel";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "ERICH Lizenzen - GateKeeper Admin",
};

function serialize(value) {
    return JSON.parse(JSON.stringify(value));
}

function formatDateTime(value) {
    if (!value) return "Offen";
    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}

export default async function AdminErichLicensesPage({ searchParams }) {
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
            status: true,
        },
    });
    const selectedEvent = events.find((event) => event.id === requestedEventId) ?? events[0] ?? null;

    const [imports, pendingValuations] = selectedEvent
        ? await Promise.all([
              prisma.erichLicenseImport.findMany({
                  where: { eventId: selectedEvent.id },
                  orderBy: { createdAt: "desc" },
                  take: 10,
                  include: {
                      _count: {
                          select: {
                              records: true,
                              decisions: true,
                          },
                      },
                  },
              }),
              prisma.erichRaceEntryValuation.findMany({
                  where: {
                      status: "PENDING_IMPORT",
                      dependsOnLicenseCheck: true,
                      raceEntry: {
                          eventId: selectedEvent.id,
                      },
                  },
                  orderBy: [{ level: "asc" }, { createdAt: "asc" }],
                  take: 100,
                  include: {
                      raceEntry: {
                          select: {
                              id: true,
                              eventId: true,
                              athleteId: true,
                              raceNumber: true,
                              athlete: {
                                  select: {
                                      id: true,
                                      firstName: true,
                                      lastName: true,
                                      birthDate: true,
                                      germanLicenseNumber: true,
                                      club: {
                                          select: {
                                              officialName: true,
                                          },
                                      },
                                  },
                              },
                          },
                      },
                  },
              }),
          ])
        : [[], []];

    const confirmedImportDecisions = imports.reduce((sum, entry) => sum + entry._count.decisions, 0);

    return (
        <main className="admin-shell">
            <section className="admin-hero">
                <div className="container admin-hero__inner">
                    <div className="admin-hero__copy">
                        <span className="eyebrow">ERICH Admin</span>
                        <h1>License Review</h1>
                        <p>
                            Lizenzdaten importieren, automatische Treffer anwenden und offene
                            DM/MDM-Eligibility manuell entscheiden.
                        </p>
                        <div className="admin-hero__meta">
                            <span>{selectedEvent?.name ?? "Kein ERICH-Event"}</span>
                            <span>{pendingValuations.length} pending</span>
                        </div>
                    </div>
                    <div className="admin-hero__actions">
                        <Link href="/admin" className="btn btn-ghost">
                            Zurück
                        </Link>
                        <Link href="/admin/erich/clubs" className="btn btn-primary">
                            Clubs prüfen
                        </Link>
                    </div>
                </div>
            </section>

            <div className="container admin-dashboard">
                <section className="admin-metrics" aria-label="ERICH Lizenz Kennzahlen">
                    <div className={pendingValuations.length ? "admin-metric admin-metric--attention" : "admin-metric"}>
                        <span className="admin-metric__label">Pending</span>
                        <strong>{pendingValuations.length}</strong>
                        <span>offene Lizenzprüfungen</span>
                    </div>
                    <div className="admin-metric">
                        <span className="admin-metric__label">Imports</span>
                        <strong>{imports.length}</strong>
                        <span>letzte Lizenzimporte</span>
                    </div>
                    <div className="admin-metric">
                        <span className="admin-metric__label">Auto</span>
                        <strong>{confirmedImportDecisions}</strong>
                        <span>Import-Entscheidungen</span>
                    </div>
                    <div className="admin-metric">
                        <span className="admin-metric__label">Events</span>
                        <strong>{events.length}</strong>
                        <span>ERICH Events verfügbar</span>
                    </div>
                </section>

                <section className="admin-panel">
                    <div className="admin-panel__header">
                        <div>
                            <span className="eyebrow">Event</span>
                            <h2>Event auswählen</h2>
                        </div>
                    </div>
                    <div className="admin-list">
                        {events.map((event) => (
                            <Link
                                key={event.id}
                                href={`/admin/erich/licenses?eventId=${event.id}`}
                                className="admin-list-row erich-event-row"
                            >
                                <div className="admin-list-row__main">
                                    <strong>{event.name}</strong>
                                    <span>{event.status}</span>
                                </div>
                                <div className="admin-list-row__aside">
                                    {selectedEvent?.id === event.id ? <span className="admin-status">Ausgewählt</span> : null}
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>

                <ErichLicenseReviewPanel
                    events={serialize(events)}
                    selectedEventId={selectedEvent?.id ?? ""}
                    pendingValuations={serialize(pendingValuations)}
                />

                <section className="admin-panel">
                    <div className="admin-panel__header">
                        <div>
                            <span className="eyebrow">Historie</span>
                            <h2>Letzte Lizenzimporte</h2>
                        </div>
                        <span className="admin-panel__count">{imports.length} Einträge</span>
                    </div>
                    {imports.length === 0 ? (
                        <p className="text-muted">Noch keine Lizenzimporte vorhanden.</p>
                    ) : (
                        <div className="admin-list">
                            {imports.map((entry) => (
                                <article key={entry.id} className="admin-list-row">
                                    <div className="admin-list-row__main">
                                        <strong>{entry.sheetName ?? "Lizenzimport"}</strong>
                                        <span>
                                            {entry.status} · {formatDateTime(entry.importedAt ?? entry.createdAt)}
                                        </span>
                                        <span>
                                            {entry._count.records} Records · {entry._count.decisions} Decisions
                                        </span>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
