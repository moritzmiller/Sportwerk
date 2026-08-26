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

function formatNumber(value, options = {}) {
    return new Intl.NumberFormat("de-DE", {
        maximumFractionDigits: 1,
        ...options,
    }).format(Number(value) || 0);
}

function getBarStyle(value, max) {
    const normalizedMax = Number(max) || 0;
    const normalizedValue = Number(value) || 0;
    const width = normalizedMax > 0 ? (normalizedValue / normalizedMax) * 100 : 0;
    return { "--bar-width": `${Math.max(normalizedValue > 0 ? 6 : 0, Math.round(width))}%` };
}

function getColumnStyle(value, max) {
    const normalizedMax = Number(max) || 0;
    const normalizedValue = Number(value) || 0;
    const height = normalizedMax > 0 ? (normalizedValue / normalizedMax) * 100 : 0;
    return { "--column-height": `${Math.max(normalizedValue > 0 ? 8 : 0, Math.round(height))}%` };
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
                ownerId: true,
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
                serviceFee: true,
                createdAt: true,
                checkedInAt: true,
            },
        }),
    ]);

    const analytics = buildOrganizerAnalytics({ events, bookings });
    const {
        totals,
        topEvents,
        attentionNeeded,
        eventPerformance,
        revenueComposition,
        paymentFunnel,
        monthlyTicketSales,
        chartScales,
    } = analytics;

    return (
        <main className="section analytics-page">
            <div className="container analytics-container stack-lg">
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
                            Zurück zum Dashboard
                        </Link>
                        <Link href="/dashboard/bookings" className="btn btn-primary">
                            Buchungen
                        </Link>
                    </div>
                </div>

                <section className="analytics-finance" aria-labelledby="analytics-finance-title">
                    <div className="analytics-finance__header">
                        <div>
                            <span className="eyebrow">Finanzdashboard</span>
                            <h2 id="analytics-finance-title">Ticketumsatz und Veranstalterleistung</h2>
                        </div>
                        <span className="analytics-finance__badge">{totals.paidBookings} bezahlte Bestellungen</span>
                    </div>

                    <div className="analytics-finance__hero">
                        <article className="analytics-finance__hero-card">
                            <span>Durchschnittlicher Ticketpreis</span>
                            <strong>{formatMoney(totals.averageTicketPrice)}</strong>
                            <small>{formatMoney(totals.averageGrossTicketValue)} inkl. GateKeeper-Gebühr</small>
                        </article>
                        <article className="analytics-finance__hero-card analytics-finance__hero-card--accent">
                            <span>Tickets pro Veranstalter</span>
                            <strong>{formatNumber(totals.averageTicketsPerOrganizer)}</strong>
                            <small>{formatNumber(totals.ticketsSold)} Tickets bei {formatNumber(totals.organizerCount)} Veranstaltern</small>
                        </article>
                        <article className="analytics-finance__mini-card">
                            <span>Bruttoumsatz</span>
                            <strong>{formatMoney(totals.revenue)}</strong>
                            <small>{formatMoney(totals.serviceFees)} Gebühren</small>
                        </article>
                        <article className="analytics-finance__mini-card">
                            <span>Netto nach Erstattung</span>
                            <strong>{formatMoney(totals.netRevenue)}</strong>
                            <small>{formatMoney(totals.refundedAmount)} erstattet</small>
                        </article>
                    </div>

                    <div className="analytics-finance__charts">
                        <article className="analytics-chart analytics-chart--wide">
                            <div className="analytics-chart__header">
                                <div>
                                    <span>Verkaufte Tickets pro Monat</span>
                                    <strong>{formatNumber(totals.ticketsSold)} Tickets im Verlauf</strong>
                                </div>
                                <small>Monatliche PAID-Bookings nach Verkaufsdatum</small>
                            </div>
                            {monthlyTicketSales.length === 0 ? (
                                <p className="text-muted">Noch keine bezahlten Ticketverkäufe im Verlauf vorhanden.</p>
                            ) : (
                                <div className="analytics-month-chart">
                                    {monthlyTicketSales.map((month) => (
                                        <div key={month.key} className="analytics-month-chart__item">
                                            <strong>{formatNumber(month.ticketsSold, { maximumFractionDigits: 0 })}</strong>
                                            <div className="analytics-month-chart__column">
                                                <i style={getColumnStyle(month.ticketsSold, chartScales.monthlyTicketMax)} />
                                            </div>
                                            <span>{month.label}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </article>

                        <article className="analytics-chart">
                            <div className="analytics-chart__header">
                                <div>
                                    <span>Umsatzstruktur</span>
                                    <strong>{formatMoney(totals.revenue)}</strong>
                                </div>
                                <small>Ticketwert, Gebühren, Erstattungen</small>
                            </div>
                            <div className="analytics-bar-list">
                                <div className="analytics-bar-row">
                                    <span>Ticketwert</span>
                                    <div className="analytics-bar-track">
                                        <i style={getBarStyle(revenueComposition.ticketRevenue, chartScales.revenueMax)} />
                                    </div>
                                    <strong>{formatMoney(revenueComposition.ticketRevenue)}</strong>
                                </div>
                                <div className="analytics-bar-row">
                                    <span>Gebühren</span>
                                    <div className="analytics-bar-track analytics-bar-track--fee">
                                        <i style={getBarStyle(revenueComposition.serviceFees, chartScales.revenueMax)} />
                                    </div>
                                    <strong>{formatMoney(revenueComposition.serviceFees)}</strong>
                                </div>
                                <div className="analytics-bar-row">
                                    <span>Erstattet</span>
                                    <div className="analytics-bar-track analytics-bar-track--refund">
                                        <i style={getBarStyle(revenueComposition.refundedAmount, chartScales.revenueMax)} />
                                    </div>
                                    <strong>{formatMoney(revenueComposition.refundedAmount)}</strong>
                                </div>
                            </div>
                        </article>

                        <article className="analytics-chart">
                            <div className="analytics-chart__header">
                                <div>
                                    <span>Zahlungsfunnel</span>
                                    <strong><Percent value={totals.conversionRate} /></strong>
                                </div>
                                <small>Bezahlte Buchungen vs. offene Buchungen</small>
                            </div>
                            <div className="analytics-funnel">
                                <div className="analytics-funnel__row">
                                    <span>Bezahlt</span>
                                    <i style={getBarStyle(paymentFunnel.paid, chartScales.funnelMax)} />
                                    <strong>{paymentFunnel.paid}</strong>
                                </div>
                                <div className="analytics-funnel__row analytics-funnel__row--pending">
                                    <span>Offen</span>
                                    <i style={getBarStyle(paymentFunnel.pending, chartScales.funnelMax)} />
                                    <strong>{paymentFunnel.pending}</strong>
                                </div>
                                <div className="analytics-funnel__row analytics-funnel__row--refund">
                                    <span>Erstattet</span>
                                    <i style={getBarStyle(paymentFunnel.refunded, chartScales.funnelMax)} />
                                    <strong>{paymentFunnel.refunded}</strong>
                                </div>
                            </div>
                        </article>
                    </div>

                    <article className="analytics-chart">
                        <div className="analytics-chart__header">
                            <div>
                                <span>Top-Events nach Ticketmenge</span>
                                <strong>{formatNumber(totals.ticketsSold)} Tickets verkauft</strong>
                            </div>
                            <small><Percent value={totals.checkInRate} /> Check-in-Quote</small>
                        </div>
                        {topEvents.length === 0 ? (
                            <p className="text-muted">Noch keine Ticketverkäufe vorhanden.</p>
                        ) : (
                            <div className="analytics-event-bars">
                                {topEvents.map((event) => (
                                    <div key={event.id} className="analytics-event-row">
                                        <div className="analytics-event-row__label">
                                            <strong>{event.title}</strong>
                                            <span>{formatMoney(event.averageTicketPrice)} Ø Ticketpreis</span>
                                        </div>
                                        <div className="analytics-event-row__bar">
                                            <i style={getBarStyle(event.ticketsSold, chartScales.eventTicketMax)} />
                                        </div>
                                        <div className="analytics-event-row__value">
                                            <strong>{event.ticketsSold} Tickets</strong>
                                            <span>{formatMoney(event.revenue)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </article>
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
