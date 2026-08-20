import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/bookings";
import { getEventStatusLabel } from "@/lib/event-management";
import { buildOrganizerAnalytics } from "@/lib/organizer-analytics";
import { getBookingAccessWhere, getEventAccessWhere } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatDate(value) {
    if (!value) return "Termin offen";
    return new Date(value).toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
}

function Percent({ value }) {
    return <>{Number(value || 0)}%</>;
}

export default async function OrganizerAnalyticsPage() {
    const user = await getCurrentUser();

    if (!user) redirect("/auth");
    if (user.role === "VISITOR") redirect("/dashboard");

    const [events, bookings] = await Promise.all([
        prisma.event.findMany({
            where: getEventAccessWhere(user),
            orderBy: { startDate: "asc" },
            select: {
                id: true,
                title: true,
                status: true,
                startDate: true,
                city: true,
                location: true,
                capacity: true,
                viewCount: true,
                organization: {
                    select: {
                        name: true,
                    },
                },
                venue: {
                    select: {
                        name: true,
                    },
                },
                _count: {
                    select: {
                        views: true,
                        favorites: true,
                        impressions: true,
                        interactions: true,
                    },
                },
            },
        }),
        prisma.booking.findMany({
            where: getBookingAccessWhere(user),
            select: {
                id: true,
                eventId: true,
                status: true,
                quantity: true,
                totalAmount: true,
                checkedInAt: true,
            },
        }),
    ]);

    const analytics = buildOrganizerAnalytics({ events, bookings });
    const { totals, topEvents, attentionNeeded, eventPerformance } = analytics;

    return (
        <main className="section">
            <div className="container stack-lg">
                <div className="checkout-page__header">
                    <div>
                        <span className="eyebrow">Analytics</span>
                        <h1 className="section-header__title">Organizer Performance</h1>
                        <p className="text-muted">
                            Umsatz, Nachfrage und Einlassleistung deiner Events auf einen Blick.
                        </p>
                    </div>
                    <div className="flex wrap">
                        <Link href="/dashboard" className="btn btn-ghost">
                            Zurueck zum Dashboard
                        </Link>
                        <Link href="/dashboard/bookings" className="btn btn-primary">
                            Buchungen
                        </Link>
                    </div>
                </div>

                <div className="stats">
                    <div className="stat">
                        <div className="stat__value">{formatMoney(totals.netRevenue)}</div>
                        <div className="stat__label">Netto-Umsatz</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{formatMoney(totals.revenue)}</div>
                        <div className="stat__label">Bezahlter Umsatz</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{formatMoney(totals.refundedAmount)}</div>
                        <div className="stat__label">Erstattet</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{totals.ticketsSold}</div>
                        <div className="stat__label">Tickets verkauft</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">
                            <Percent value={totals.conversionRate} />
                        </div>
                        <div className="stat__label">View zu Kauf</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">
                            <Percent value={totals.checkInRate} />
                        </div>
                        <div className="stat__label">Check-in-Quote</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{totals.views}</div>
                        <div className="stat__label">Views</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{totals.favorites}</div>
                        <div className="stat__label">Favoriten</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{totals.pendingBookings}</div>
                        <div className="stat__label">Offene Buchungen</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{totals.publishedEvents}</div>
                        <div className="stat__label">Live-Events</div>
                    </div>
                </div>

                <div className="dash__grid dash__grid--split">
                    <section className="card stack-lg">
                        <div className="section-title-row">
                            <h2>Top Events</h2>
                            <span className="text-muted">{topEvents.length} sichtbar</span>
                        </div>
                        {topEvents.length === 0 ? (
                            <p className="text-muted">Noch keine Events fuer Analytics vorhanden.</p>
                        ) : (
                            <div className="stack">
                                {topEvents.map((event) => (
                                    <article key={event.id} className="analysis-card">
                                        <strong>{event.title}</strong>
                                        <p>
                                            {formatMoney(event.revenue)} Umsatz &middot;{" "}
                                            {event.ticketsSold} Tickets &middot;{" "}
                                            <Percent value={event.conversionRate} /> Conversion
                                        </p>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="card stack-lg">
                        <div className="section-title-row">
                            <h2>Aufmerksamkeit</h2>
                            <span className="text-muted">{attentionNeeded.length} Hinweise</span>
                        </div>
                        {attentionNeeded.length === 0 ? (
                            <p className="text-muted">
                                Keine auffaelligen Events. Neue Signale erscheinen hier automatisch.
                            </p>
                        ) : (
                            <div className="stack">
                                {attentionNeeded.map((event) => (
                                    <article key={event.id} className="analysis-card">
                                        <strong>{event.title}</strong>
                                        <p>
                                            {event.pendingBookings} offen &middot;{" "}
                                            <Percent value={event.fillRate} /> Auslastung &middot;{" "}
                                            <Percent value={event.conversionRate} /> Conversion
                                        </p>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                <section className="card stack-lg">
                    <div className="section-title-row">
                        <h2>Event Performance</h2>
                        <span className="text-muted">{eventPerformance.length} Events</span>
                    </div>
                    {eventPerformance.length === 0 ? (
                        <p className="text-muted">Noch keine Events vorhanden.</p>
                    ) : (
                        <div className="admin-user-table__scroll">
                            <table className="analytics-table">
                                <thead>
                                    <tr>
                                        <th>Event</th>
                                        <th>Status</th>
                                        <th>Termin</th>
                                        <th>Umsatz</th>
                                        <th>Tickets</th>
                                        <th>Views</th>
                                        <th>Favoriten</th>
                                        <th>Conversion</th>
                                        <th>Check-in</th>
                                        <th>Auslastung</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {eventPerformance.map((event) => (
                                        <tr key={event.id}>
                                            <td>
                                                <strong>{event.title}</strong>
                                                <small>
                                                    {event.venueName || event.organizationName || event.city}
                                                </small>
                                            </td>
                                            <td>{getEventStatusLabel(event.status)}</td>
                                            <td>{formatDate(event.startDate)}</td>
                                            <td>{formatMoney(event.revenue)}</td>
                                            <td>{event.ticketsSold}</td>
                                            <td>{event.views}</td>
                                            <td>{event.favorites}</td>
                                            <td>
                                                <Percent value={event.conversionRate} />
                                            </td>
                                            <td>
                                                <Percent value={event.checkInRate} />
                                            </td>
                                            <td>
                                                {event.capacity ? (
                                                    <Percent value={event.fillRate} />
                                                ) : (
                                                    "n/a"
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
