import Link from "next/link";
import { redirect } from "next/navigation";

import AdminUserTable from "@/components/AdminUserTable";
import LogoutButton from "@/components/LogoutButton";
import TrustReviewPanel from "@/components/TrustReviewPanel";
import { getCurrentUser } from "@/lib/auth";
import {
    getPaymentAutoCancelSummary,
    getPaymentReminderSummary,
} from "@/lib/payment-reminders";
import { prisma } from "@/lib/prisma";
import { getSafeUserQueryConfig } from "@/lib/user-schema";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Admin - GateKeeper",
};

function formatDate(value) {
    if (!value) return "Noch nicht terminiert";
    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(new Date(value));
}

function formatDateTime(value) {
    if (!value) return "Unbekannt";
    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}

export default async function AdminPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/auth");
    if (user.role !== "ADMIN") redirect("/dashboard");

    const { select: userSelect } = await getSafeUserQueryConfig();
    const [users, events, manualBookings, auditLog, pendingOrganizations, pendingVenues] = await Promise.all([
        prisma.user.findMany({
            orderBy: { createdAt: "asc" },
            select: {
                ...userSelect,
                createdAt: true,
                _count: { select: { events: true } },
            },
        }),
        prisma.event.findMany({
            orderBy: { startDate: "asc" },
            include: { owner: { select: { email: true } } },
        }),
        prisma.booking.findMany({
            where: {
                status: "AWAITING_PAYMENT",
                paymentMethod: {
                    in: ["INVOICE", "BANK_TRANSFER"],
                },
            },
            orderBy: { createdAt: "desc" },
            include: {
                event: {
                    select: {
                        id: true,
                        title: true,
                        location: true,
                        city: true,
                        startDate: true,
                    },
                },
            },
        }),
        prisma.eventAuditLog.findMany({
            orderBy: { createdAt: "desc" },
            take: 20,
            include: {
                event: { select: { id: true, title: true } },
                actor: { select: { email: true } },
            },
        }),
        prisma.organization.findMany({
            where: {
                verificationStatus: {
                    not: "VERIFIED",
                },
            },
            orderBy: [{ updatedAt: "desc" }],
            include: {
                owner: { select: { id: true, email: true, name: true } },
            },
        }),
        prisma.venue.findMany({
            where: {
                verificationStatus: {
                    not: "VERIFIED",
                },
            },
            orderBy: [{ updatedAt: "desc" }],
            include: {
                owner: { select: { id: true, email: true, name: true } },
                organization: {
                    select: {
                        id: true,
                        name: true,
                        verificationStatus: true,
                    },
                },
            },
        }),
    ]);

    const manualOpen = manualBookings.length;
    const manualDue = manualBookings.filter((booking) => getPaymentReminderSummary(booking).kind === "due").length;
    const manualCancel = manualBookings.filter((booking) => getPaymentAutoCancelSummary(booking).kind === "cancel").length;
    const trustOpen = pendingOrganizations.length + pendingVenues.length;
    const organizers = users.filter((entry) => entry.role === "ORGANIZER").length;
    const admins = users.filter((entry) => entry.role === "ADMIN").length;
    const visitors = users.filter((entry) => entry.role === "VISITOR").length;
    const upcomingEvents = events.filter((event) => new Date(event.startDate) >= new Date()).length;
    const draftEvents = events.filter((event) => event.status === "DRAFT").length;
    const recentEvents = events.slice(0, 6);
    const recentManualBookings = manualBookings.slice(0, 6);

    return (
        <main className="admin-shell">
            <section className="admin-hero">
                <div className="container admin-hero__inner">
                    <div className="admin-hero__copy">
                        <span className="eyebrow">Admin</span>
                        <h1>GateKeeper Verwaltung</h1>
                        <p>
                            Operatives Cockpit für Konten, Events, Verifikationen und offene
                            Zahlungsabläufe.
                        </p>
                        <div className="admin-hero__meta">
                            <span>{user.email}</span>
                            <span>ADMIN</span>
                        </div>
                    </div>
                    <div className="admin-hero__actions">
                        <Link href="/admin/payments" className="btn btn-primary">
                            Zahlungen prüfen
                        </Link>
                        <Link href="/admin/organizers" className="btn btn-ghost">
                            Veranstalter verwalten
                        </Link>
                        <LogoutButton />
                    </div>
                </div>
            </section>

            <div className="container admin-dashboard">
                <section className="admin-metrics" aria-label="Admin Kennzahlen">
                    <div className="admin-metric admin-metric--attention">
                        <span className="admin-metric__label">Offene Zahlungen</span>
                        <strong>{manualOpen}</strong>
                        <span>{manualDue} fällige Erinnerungen</span>
                    </div>
                    <div className="admin-metric">
                        <span className="admin-metric__label">Verifikationen</span>
                        <strong>{trustOpen}</strong>
                        <span>{pendingOrganizations.length} Organisationen, {pendingVenues.length} Venues</span>
                    </div>
                    <div className="admin-metric">
                        <span className="admin-metric__label">Events</span>
                        <strong>{events.length}</strong>
                        <span>{upcomingEvents} anstehend, {draftEvents} Entwuerfe</span>
                    </div>
                    <div className="admin-metric">
                        <span className="admin-metric__label">Konten</span>
                        <strong>{users.length}</strong>
                        <span>{organizers} Veranstalter, {visitors} Besucher, {admins} Admins</span>
                    </div>
                </section>

                <section className="admin-action-grid" aria-label="Schnellzugriff">
                    <Link href="/admin/payments" className="admin-action">
                        <span className="admin-action__icon" aria-hidden="true">EUR</span>
                        <strong>Manuelle Zahlungen</strong>
                        <span>{manualCancel} Auto-Stornos aktuell kritisch</span>
                    </Link>
                    <Link href="/admin/organizers" className="admin-action">
                        <span className="admin-action__icon" aria-hidden="true">ORG</span>
                        <strong>Veranstalter</strong>
                        <span>Zugänge erstellen, umbenennen und deaktivieren</span>
                    </Link>
                    <a href="#admin-users" className="admin-action">
                        <span className="admin-action__icon" aria-hidden="true">USR</span>
                        <strong>Nutzerrollen</strong>
                        <span>Besucher, Veranstalter und Admins verwalten</span>
                    </a>
                    <Link href="/admin/system" className="admin-action">
                        <span className="admin-action__icon" aria-hidden="true">SYS</span>
                        <strong>Systemstatus</strong>
                        <span>Deployment, PayPal, Mail und Auth-Konfiguration prüfen</span>
                    </Link>
                    <Link href="/admin/erich/races" className="admin-action">
                        <span className="admin-action__icon" aria-hidden="true">ERI</span>
                        <strong>ERICH Rennen</strong>
                        <span>Race Master Data prüfen und freigeben</span>
                    </Link>
                    <Link href="/admin/erich/clubs" className="admin-action">
                        <span className="admin-action__icon" aria-hidden="true">CLB</span>
                        <strong>ERICH Clubs</strong>
                        <span>Vereine und DM/MDM-Zugehörigkeit pflegen</span>
                    </Link>
                    <Link href="/admin/erich/licenses" className="admin-action">
                        <span className="admin-action__icon" aria-hidden="true">LIC</span>
                        <strong>ERICH Lizenzen</strong>
                        <span>Lizenzimporte und Eligibility-Reviews steuern</span>
                    </Link>
                    <Link href="/admin/erich/readiness" className="admin-action">
                        <span className="admin-action__icon" aria-hidden="true">RDY</span>
                        <strong>ERICH Readiness</strong>
                        <span>Daten, Rechnungen, Tickets und Exporte vor Live-Daten pruefen</span>
                    </Link>
                </section>

                <TrustReviewPanel
                    organizations={pendingOrganizations}
                    venues={pendingVenues}
                />

                <section id="admin-users" className="admin-panel">
                    <div className="admin-panel__header">
                        <div>
                            <span className="eyebrow">Konten</span>
                            <h2>Alle Nutzer</h2>
                        </div>
                        <span className="admin-panel__count">{users.length} Einträge</span>
                    </div>
                    <AdminUserTable
                        users={users.map((u) => ({
                            id: u.id,
                            email: u.email,
                            name: u.name,
                            role: u.role,
                            disabledAt: u.disabledAt,
                            events: u._count.events,
                            createdAt: u.createdAt,
                        }))}
                        currentUserId={user.id}
                    />
                </section>

                <div className="admin-overview-grid">
                    <section className="admin-panel">
                        <div className="admin-panel__header">
                            <div>
                                <span className="eyebrow">Events</span>
                                <h2>Aktuelle Event-Lage</h2>
                            </div>
                            <span className="admin-panel__count">{events.length} gesamt</span>
                        </div>
                        {recentEvents.length === 0 ? (
                            <p className="text-muted">Noch keine Events vorhanden.</p>
                        ) : (
                            <div className="admin-list">
                                {recentEvents.map((event) => (
                                    <article key={event.id} className="admin-list-row">
                                        <div className="admin-list-row__main">
                                            <strong>{event.title}</strong>
                                            <span>
                                                {event.location}, {event.city} - {formatDate(event.startDate)}
                                            </span>
                                            <span>{event.owner?.email ?? "Unbekannter Veranstalter"}</span>
                                        </div>
                                        <div className="admin-list-row__aside">
                                            <span className="admin-status">{event.status ?? "PUBLISHED"}</span>
                                            <Link href={`/dashboard/events/${event.id}/edit`}>Bearbeiten</Link>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="admin-panel">
                        <div className="admin-panel__header">
                            <div>
                                <span className="eyebrow">Zahlungen</span>
                                <h2>Manuelle Zahlungen</h2>
                            </div>
                            <Link href="/admin/payments" className="admin-panel__link">
                                Alle anzeigen
                            </Link>
                        </div>
                        {recentManualBookings.length === 0 ? (
                            <p className="text-muted">Keine offenen manuellen Zahlungen.</p>
                        ) : (
                            <div className="admin-list">
                                {recentManualBookings.map((booking) => {
                                    const reminderSummary = getPaymentReminderSummary(booking);
                                    const cancelSummary = getPaymentAutoCancelSummary(booking);

                                    return (
                                        <article key={booking.id} className="admin-list-row">
                                            <div className="admin-list-row__main">
                                                <strong>{booking.event?.title ?? "Unbekanntes Event"}</strong>
                                                <span>{booking.purchaserEmail}</span>
                                                <span>{booking.paymentMethod}</span>
                                            </div>
                                            <div className="admin-list-row__aside">
                                                <span className="admin-status admin-status--warning">
                                                    {reminderSummary.label}
                                                </span>
                                                <span>{cancelSummary.label}</span>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                </div>

                <section className="admin-panel">
                    <div className="admin-panel__header">
                        <div>
                            <span className="eyebrow">Audit</span>
                            <h2>Letzte Aktivitäten</h2>
                        </div>
                        <span className="admin-panel__count">{auditLog.length} Einträge</span>
                    </div>
                    {auditLog.length === 0 ? (
                        <p className="text-muted">Noch keine Audit-Einträge vorhanden.</p>
                    ) : (
                        <div className="admin-timeline">
                            {auditLog.map((entry) => (
                                <article key={entry.id} className="admin-timeline__item">
                                    <time>{formatDateTime(entry.createdAt)}</time>
                                    <div>
                                        <strong>{entry.action}</strong>
                                        <span>
                                            {entry.event?.title ?? "Ohne Event"} - {entry.actor?.email ?? "System"}
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

