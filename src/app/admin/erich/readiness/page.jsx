import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { loadErichReadinessReport } from "@/lib/erich/readiness";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "ERICH Readiness - GateKeeper Admin",
};

function formatDate(value) {
    if (!value) return "Termin offen";
    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(new Date(value));
}

function issueClass(level) {
    if (level === "ERROR") return "admin-status admin-status--danger";
    if (level === "WARNING") return "admin-status admin-status--warning";
    return "admin-status";
}

export default async function AdminErichReadinessPage({ searchParams }) {
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
        },
    });
    const selectedEvent = events.find((event) => event.id === requestedEventId) ?? events[0] ?? null;
    const report = await loadErichReadinessReport(prisma, { eventId: selectedEvent?.id ?? null });
    const errorCount = report.issues.filter((issue) => issue.level === "ERROR").length;
    const warningCount = report.issues.filter((issue) => issue.level === "WARNING").length;

    return (
        <main className="admin-shell">
            <section className="admin-hero">
                <div className="container admin-hero__inner">
                    <div className="admin-hero__copy">
                        <span className="eyebrow">ERICH Admin</span>
                        <h1>Readiness</h1>
                        <p>
                            Technischer Vorabcheck fuer echte ERICH-Daten, Registrierung, Rechnung,
                            Tickets, Check-in und Exporte.
                        </p>
                        <div className="admin-hero__meta">
                            <span>{selectedEvent?.name ?? "Kein ERICH-Event"}</span>
                            <span>{selectedEvent ? formatDate(selectedEvent.startsAt) : "Ohne Daten"}</span>
                        </div>
                    </div>
                    <div className="admin-hero__actions">
                        <Link href="/admin" className="btn btn-ghost">
                            Zurueck
                        </Link>
                        <Link href="/admin/erich/races" className="btn btn-primary">
                            Rennen pruefen
                        </Link>
                    </div>
                </div>
            </section>

            <div className="container admin-dashboard">
                <section className="admin-metrics" aria-label="ERICH Readiness Kennzahlen">
                    <div className={report.ready ? "admin-metric" : "admin-metric admin-metric--attention"}>
                        <span className="admin-metric__label">Status</span>
                        <strong>{report.ready ? "Bereit" : "Blockiert"}</strong>
                        <span>{errorCount} Fehler, {warningCount} Warnungen</span>
                    </div>
                    <div className="admin-metric">
                        <span className="admin-metric__label">Rennen</span>
                        <strong>{report.metrics.activeRaceCount}</strong>
                        <span>{report.metrics.reviewRaceCount} im Review</span>
                    </div>
                    <div className="admin-metric">
                        <span className="admin-metric__label">Clubs</span>
                        <strong>{report.metrics.activeClubCount}</strong>
                        <span>{report.metrics.clubs} gesamt</span>
                    </div>
                    <div className="admin-metric">
                        <span className="admin-metric__label">Folgeprozesse</span>
                        <strong>{report.metrics.invoices + report.metrics.tickets}</strong>
                        <span>{report.metrics.exportJobs} Exporte vorbereitet</span>
                    </div>
                    <div className="admin-metric">
                        <span className="admin-metric__label">GateKeeper Event</span>
                        <strong>{report.metrics.unifiedBookings}</strong>
                        <span>
                            {report.metrics.unifiedEventStatus ?? "Kein Mapping"} ·{" "}
                            {report.metrics.unifiedTickets} Tickets
                        </span>
                    </div>
                </section>

                <section className="admin-panel">
                    <div className="admin-panel__header">
                        <div>
                            <span className="eyebrow">Event</span>
                            <h2>ERICH Event auswaehlen</h2>
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
                                    href={`/admin/erich/readiness?eventId=${event.id}`}
                                    className="admin-list-row erich-event-row"
                                >
                                    <div className="admin-list-row__main">
                                        <strong>{event.name}</strong>
                                        <span>{event.slug} - {formatDate(event.startsAt)}</span>
                                    </div>
                            <div className="admin-list-row__aside">
                                <span className="admin-status">{event.status}</span>
                                        {selectedEvent?.id === event.id ? <span className="admin-status">Ausgewaehlt</span> : null}
                            </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>

                <section className="admin-panel">
                    <div className="admin-panel__header">
                        <div>
                            <span className="eyebrow">Checks</span>
                            <h2>Daten- und Prozessbereitschaft</h2>
                        </div>
                        <span className="admin-panel__count">{report.issues.length} Hinweise</span>
                    </div>
                    {report.issues.length === 0 ? (
                        <p className="text-muted">Keine offenen ERICH-Readiness-Hinweise.</p>
                    ) : (
                        <div className="admin-list">
                            {report.issues.map((issue, index) => (
                                <article key={`${issue.area}-${index}`} className="admin-list-row">
                                    <div className="admin-list-row__main">
                                        <strong>{issue.message}</strong>
                                        <span>{issue.area}</span>
                                    </div>
                                    <div className="admin-list-row__aside">
                                        <span className={issueClass(issue.level)}>{issue.level}</span>
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
