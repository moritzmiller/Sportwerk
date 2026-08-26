import Link from "next/link";
import { redirect } from "next/navigation";

import BookingRow from "@/components/BookingRow";
import EventCard from "@/components/EventCard";
import EventRow from "@/components/EventRow";
import LogoutButton from "@/components/LogoutButton";
import { getCurrentUser } from "@/lib/auth";
import { getAttendanceSnapshot, summarizeAttendance } from "@/lib/attendance";
import {
    formatMoney,
    getBookingStatusLabel,
    getBookingStatusTone,
    getPaymentMethodLabel,
    serializeBooking,
} from "@/lib/bookings";
import { buildCustomerSummaries } from "@/lib/crm";
import { prisma } from "@/lib/prisma";
import { getBookingAccessWhere, getEventAccessWhere } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function serializeEvent(event) {
    return {
        id: event.id,
        title: event.title,
        description: event.description,
        location: event.location,
        city: event.city,
        category: event.category,
        status: event.status ?? "PUBLISHED",
        startDate: event.startDate.toISOString(),
        price: event.price,
        organizationId: event.organizationId ?? null,
        organizationName: event.organization?.name ?? null,
    };
}

function serializeEventWithAttendance(event, attendanceSummary) {
    const base = serializeEvent(event);
    const attendance = getAttendanceSnapshot(attendanceSummary.get(event.id), base);

    return {
        ...base,
        attendance,
    };
}

function firstName(user) {
    if (user.name) return user.name.split(" ")[0];
    return user.email.split("@")[0];
}

function formatEventDate(value) {
    return new Date(value).toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

const DASHBOARD_BOOKING_SELECT = {
    id: true,
    eventId: true,
    attendeeId: true,
    purchaserName: true,
    purchaserEmail: true,
    purchaserPhone: true,
    notes: true,
    newsletter: true,
    quantity: true,
    currency: true,
    unitPrice: true,
    serviceFee: true,
    totalAmount: true,
    billingName: true,
    billingStreet: true,
    billingStreet2: true,
    billingPostalCode: true,
    billingCity: true,
    billingCountry: true,
    paymentMethod: true,
    status: true,
    paymentProvider: true,
    paymentReference: true,
    paidAt: true,
    paymentReminderCount: true,
    lastPaymentReminderAt: true,
    paymentCancelledAt: true,
    paymentCancellationReason: true,
    checkedInAt: true,
    checkedInById: true,
    checkedInVia: true,
    transferToName: true,
    transferToEmail: true,
    paypalOrderId: true,
    paypalCaptureId: true,
    paypalApprovalUrl: true,
    paypalStatus: true,
    stripeCheckoutSessionId: true,
    stripePaymentIntentId: true,
    stripeStatus: true,
    providerPayload: true,
    createdAt: true,
    updatedAt: true,
    event: {
        select: {
            id: true,
            title: true,
            location: true,
            city: true,
            startDate: true,
        },
    },
};

export default async function DashboardPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/auth");

    const isOrganizer = user.role !== "VISITOR";

    return (
        <main className="container dash">
            <header className="dash__header">
                <div>
                    <h1 className="dash__greeting">Hallo, {firstName(user)}</h1>
                    <span
                        className={`dash__role ${
                            isOrganizer ? "dash__role--organizer" : ""
                        }`}
                    >
                        {user.role === "ADMIN"
                            ? "Admin"
                            : isOrganizer
                              ? "Veranstalter"
                              : "Besucher"}
                    </span>
                </div>
                <div className="dash__actions">
                    <Link href="/dashboard/profile" className="btn btn-ghost">
                        Profil
                    </Link>
                    <Link href="/dashboard/orders" className="btn btn-ghost">
                        Bestellungen
                    </Link>
                    {isOrganizer ? (
                        <Link href="/dashboard/bookings" className="btn btn-ghost">
                            Buchungen
                        </Link>
                    ) : null}
                    {user.role === "ADMIN" ? (
                        <Link href="/admin" className="btn btn-ghost">
                            Admin
                        </Link>
                    ) : null}
                    {isOrganizer ? (
                        <Link href="/dashboard/check-in" className="btn btn-ghost">
                            Check-in
                        </Link>
                    ) : null}
                    {isOrganizer ? (
                        <Link href="/dashboard/venues" className="btn btn-ghost">
                            Venues
                        </Link>
                    ) : null}
                    <LogoutButton />
                </div>
            </header>

            {isOrganizer ? <OrganizerView user={user} /> : <VisitorView user={user} />}
        </main>
    );
}

async function OrganizerView({ user }) {
    const [rawEvents, rawBookings, organizations] = await Promise.all([
        prisma.event.findMany({
            where: getEventAccessWhere(user),
            orderBy: { startDate: "asc" },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    location: true,
                    city: true,
                    category: true,
                    startDate: true,
                    price: true,
                    organizationId: true,
                    organization: {
                        select: {
                            id: true,
                            name: true,
                            verificationStatus: true,
                        },
                    },
                    venue: {
                        select: {
                            id: true,
                            name: true,
                            verificationStatus: true,
                        },
                    },
                },
            }),
        prisma.booking.findMany({
            where: getBookingAccessWhere(user),
            orderBy: { createdAt: "desc" },
            select: DASHBOARD_BOOKING_SELECT,
        }),
        prisma.organization.findMany({
            where:
                user.role === "ADMIN"
                    ? {}
                    : {
                          OR: [
                              { ownerId: user.id },
                              { members: { some: { userId: user.id } } },
                          ],
                      },
            orderBy: { createdAt: "desc" },
                include: {
                    members: {
                        include: {
                            user: { select: { id: true, email: true, name: true } },
                        },
                    },
                    venues: {
                        orderBy: { createdAt: "desc" },
                        select: {
                            id: true,
                            name: true,
                            address: true,
                            city: true,
                            notes: true,
                            verificationStatus: true,
                        },
                    },
                    events: {
                        select: {
                            id: true,
                            title: true,
                        status: true,
                        startDate: true,
                    },
                },
            },
        }),
    ]);

    const attendanceSummary = summarizeAttendance(rawBookings);
    const events = rawEvents.map((event) =>
        serializeEventWithAttendance(event, attendanceSummary)
    );
    const bookings = rawBookings.map((booking) => ({
        ...serializeBooking(booking),
        createdAt: booking.createdAt.toISOString(),
        updatedAt: booking.updatedAt.toISOString(),
        event: booking.event
            ? {
                  ...booking.event,
                  startDate: booking.event.startDate.toISOString(),
              }
            : null,
    }));

    const now = new Date();
    const upcoming = events.filter((event) => new Date(event.startDate) >= now);
    const past = events.filter((event) => new Date(event.startDate) < now);
    const drafts = events.filter((event) => event.status === "DRAFT");
    const cancelled = events.filter((event) => event.status === "CANCELLED");
    const paidBookings = bookings.filter((booking) => booking.status === "PAID");
    const pendingBookings = bookings.filter(
        (booking) => booking.status === "AWAITING_PAYMENT"
    );
    const totalPaidTickets = events.reduce(
        (sum, event) => sum + Number(event.attendance?.paidTickets || 0),
        0
    );
    const totalCheckedInTickets = events.reduce(
        (sum, event) => sum + Number(event.attendance?.checkedInTickets || 0),
        0
    );
    const attendanceRate = totalPaidTickets
        ? Math.round((totalCheckedInTickets / totalPaidTickets) * 100)
        : 0;
    const noShowTickets = Math.max(0, totalPaidTickets - totalCheckedInTickets);
    const revenue = paidBookings.reduce(
        (sum, booking) => sum + Number(booking.totalAmount || 0),
        0
    );
    const recentCheckIns = bookings.filter((booking) => booking.checkedInAt).slice(0, 5);
    const customers = buildCustomerSummaries(bookings, [], []);
    const customerCount = customers.length;
    const repeatCustomers = customers.filter((customer) => customer.bookingCount > 1).length;
    const organizationCount = organizations.length;
    const teamMemberCount = organizations.reduce(
        (sum, organization) => sum + organization.members.length,
        0
    );
    const nextEvent = upcoming[0] ?? null;
    const primaryMetrics = [
        {
            label: "Umsatz",
            value: formatMoney(revenue),
            detail: `${paidBookings.length} bezahlte Buchungen`,
            tone: "revenue",
        },
        {
            label: "Check-in",
            value: `${attendanceRate}%`,
            detail: `${totalCheckedInTickets} von ${totalPaidTickets} Tickets`,
            tone: "checkin",
        },
        {
            label: "Offene Buchungen",
            value: pendingBookings.length,
            detail: `${bookings.length} Buchungen gesamt`,
            tone: "pending",
        },
    ];
    const eventMetrics = [
        { label: "Kommend", value: upcoming.length },
        { label: "Entwürfe", value: drafts.length },
        { label: "Vergangen", value: past.length },
        { label: "Abgesagt", value: cancelled.length },
    ];
    const audienceMetrics = [
        { label: "Kontakte", value: customerCount },
        { label: "Wiederkäufer", value: repeatCustomers },
        { label: "No-Shows", value: noShowTickets },
        { label: "Teams", value: teamMemberCount },
    ];

    return (
        <>
            <section className="dashboard-overview" aria-label="Dashboard Kennzahlen">
                <div className="dashboard-command">
                    <div>
                        <span className="eyebrow">Planung</span>
                        <h2>Event erstellen</h2>
                        <p className="text-muted">
                            Neues Event mit Tickets, Zahlungsarten und optionalem Sitzplan anlegen.
                        </p>
                    </div>
                    <Link href="/dashboard/events/new" className="btn btn-primary">
                        Event erstellen
                    </Link>
                </div>

                <div className="dashboard-kpis">
                    {primaryMetrics.map((metric) => (
                        <article
                            key={metric.label}
                            className={`dashboard-kpi dashboard-kpi--${metric.tone}`}
                        >
                            <span>{metric.label}</span>
                            <strong>{metric.value}</strong>
                            <small>{metric.detail}</small>
                        </article>
                    ))}
                </div>

                <div className="dashboard-summary-grid">
                    <section className="dashboard-summary">
                        <div className="section-title-row">
                            <h2>Event-Pipeline</h2>
                            <span className="text-muted">{events.length} gesamt</span>
                        </div>
                        <div className="dashboard-mini-kpis">
                            {eventMetrics.map((metric) => (
                                <div key={metric.label} className="dashboard-mini-kpi">
                                    <strong>{metric.value}</strong>
                                    <span>{metric.label}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="dashboard-summary">
                        <div className="section-title-row">
                            <h2>Publikum</h2>
                            <span className="text-muted">{organizationCount} Organisationen</span>
                        </div>
                        <div className="dashboard-mini-kpis">
                            {audienceMetrics.map((metric) => (
                                <div key={metric.label} className="dashboard-mini-kpi">
                                    <strong>{metric.value}</strong>
                                    <span>{metric.label}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="dashboard-summary">
                        <div className="section-title-row">
                            <h2>Nächstes Event</h2>
                            {nextEvent ? (
                                <Link href={`/dashboard/events/${nextEvent.id}/edit`} className="nav__link">
                                    Bearbeiten
                                </Link>
                            ) : null}
                        </div>
                        {nextEvent ? (
                            <div className="dashboard-next-event">
                                <strong>{nextEvent.title}</strong>
                                <span>{nextEvent.location}, {nextEvent.city}</span>
                                <span>{formatEventDate(nextEvent.startDate)}</span>
                                <span>
                                    {nextEvent.attendance.checkedInTickets} /{" "}
                                    {nextEvent.attendance.paidTickets} eingecheckt
                                </span>
                            </div>
                        ) : (
                            <p className="text-muted">Noch kein kommendes Event geplant.</p>
                        )}
                    </section>
                </div>
            </section>

            <div className="dashboard-workspace">
                <section className="dashboard-panel dashboard-panel--wide">
                    <div className="section-title-row">
                        <h2>Deine Events</h2>
                        <span className="text-muted">{events.length} gesamt</span>
                    </div>

                    <div className="dashboard-panel__body">
                    {events.length === 0 ? (
                        <div className="empty-state">
                            <p>Du hast noch keine Events erstellt.</p>
                            <Link href="/dashboard/events/new" className="btn btn-primary">
                                Erstes Event erstellen
                            </Link>
                        </div>
                    ) : (
                        <div className="stack">
                            {upcoming.length > 0 ? (
                                <>
                                    <p className="eyebrow">Kommende Events</p>
                                    {upcoming.map((event) => (
                                        <EventRow
                                            key={event.id}
                                            event={event}
                                            editHref={`/dashboard/events/${event.id}/edit`}
                                        />
                                    ))}
                                </>
                            ) : null}
                            {past.length > 0 ? (
                                <>
                                    <p className="eyebrow mt-m">Vergangen</p>
                                    {past.map((event) => (
                                        <EventRow
                                            key={event.id}
                                            event={event}
                                            editHref={`/dashboard/events/${event.id}/edit`}
                                        />
                                    ))}
                                </>
                            ) : null}
                        </div>
                    )}
                    </div>
                </section>

                <section className="dashboard-panel">
                    <div className="section-title-row">
                        <h2>Buchungen</h2>
                        <Link href="/dashboard/bookings" className="nav__link">
                            Verwalten →
                        </Link>
                    </div>
                    <div className="dashboard-panel__body">
                        <p className="text-muted">
                            {bookings.length} gesamt, {pendingBookings.length} offen
                        </p>

                    {bookings.length === 0 ? (
                        <div className="empty-state">
                            <p>
                                Hier erscheinen alle Buchungen deiner Events, sobald jemand über
                                GateKeeper reserviert.
                            </p>
                        </div>
                    ) : (
                        <div className="stack">
                            {bookings.slice(0, 6).map((booking) => (
                                <BookingRow key={booking.id} booking={booking} />
                            ))}
                        </div>
                    )}
                    </div>
                </section>

                <section className="dashboard-panel">
                    <div className="section-title-row">
                        <h2>Organisationen</h2>
                        <Link href="/dashboard/organizations" className="nav__link">
                            Verwalten →
                        </Link>
                    </div>

                    <div className="dashboard-panel__body">
                    {organizations.length === 0 ? (
                        <div className="empty-state">
                            <p>Noch keine Organisationen angelegt.</p>
                        </div>
                    ) : (
                        <div className="stack">
                            {organizations.map((organization) => (
                                <article key={organization.id} className="analysis-card">
                                    <strong>{organization.name}</strong>
                                    <p>
                                        {organization.members.length} Teammitglieder ·{" "}
                                        {organization.events.length} Events
                                    </p>
                                </article>
                            ))}
                        </div>
                    )}
                    </div>
                </section>

                <section className="dashboard-panel">
                    <div className="section-title-row">
                        <h2>Letzte Einlass-Scans</h2>
                        <Link href="/dashboard/check-in" className="nav__link">
                            Check-in →
                        </Link>
                    </div>
                    <div className="dashboard-panel__body">
                        <p className="text-muted">{recentCheckIns.length} aktuell</p>

                    {recentCheckIns.length === 0 ? (
                        <div className="empty-state">
                            <p>Noch keine eingecheckten Buchungen vorhanden.</p>
                        </div>
                    ) : (
                        <div className="stack">
                            {recentCheckIns.map((booking) => (
                                <article key={booking.id} className="analysis-card">
                                    <strong>{booking.event?.title ?? "Unbekanntes Event"}</strong>
                                    <p>
                                        {booking.purchaserName} ·{" "}
                                        {new Date(booking.checkedInAt).toLocaleString("de-DE")}
                                    </p>
                                </article>
                            ))}
                        </div>
                    )}
                    </div>
                </section>

                <section className="dashboard-panel dashboard-panel--actions">
                    <div className="section-title-row">
                        <h2>Auswerten</h2>
                        <span className="text-muted">Berichte und Teams</span>
                    </div>
                    <div className="dashboard-action-list">
                        <Link href="/dashboard/analytics" className="btn btn-ghost">
                            Analytics öffnen
                        </Link>
                        <Link href="/dashboard/organizations" className="btn btn-ghost">
                            Organisationen verwalten
                        </Link>
                        <Link href="/dashboard/venues" className="btn btn-ghost">
                            Venues verwalten
                        </Link>
                    </div>
                </section>
            </div>
        </>
    );
}

async function VisitorView({ user }) {
    const now = new Date();
    const favoriteDelegate = prisma.eventFavorite;
    const alertDelegate = prisma.eventAlert;
    const [rawEvents, rawBookings, rawFavorites, rawAlerts] = await Promise.all([
        prisma.event.findMany({
            where: {
                startDate: { gte: now },
            },
            orderBy: { startDate: "asc" },
            take: 6,
            select: {
                id: true,
                title: true,
                description: true,
                location: true,
                city: true,
                category: true,
                startDate: true,
                price: true,
            },
        }),
        prisma.booking.findMany({
            where: {
                OR: [
                    { attendeeId: user.id },
                    {
                        purchaserEmail: {
                            equals: user.email,
                            mode: "insensitive",
                        },
                    },
                ],
            },
            orderBy: { createdAt: "desc" },
            take: 3,
            select: DASHBOARD_BOOKING_SELECT,
        }),
        favoriteDelegate?.findMany?.({
            where: { userId: user.id },
            include: {
                event: {
                    select: {
                        id: true,
                        title: true,
                        location: true,
                        city: true,
                        startDate: true,
                        category: true,
                        price: true,
                        imageUrl: true,
                        status: true,
                        capacity: true,
                        soldTickets: true,
                        viewCount: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            take: 6,
        }) ?? [],
        alertDelegate?.findMany?.({
            where: { userId: user.id },
            orderBy: { createdAt: "desc" },
            take: 6,
        }) ?? [],
    ]);

    const events = rawEvents.map(serializeEvent);
    const bookings = rawBookings.map((booking) => ({
        ...serializeBooking(booking),
        createdAt: booking.createdAt.toISOString(),
    }));
    const favorites = rawFavorites.map((favorite) => ({
        id: favorite.event.id,
        title: favorite.event.title,
        location: favorite.event.location,
        city: favorite.event.city,
        startDate: favorite.event.startDate.toISOString(),
        category: favorite.event.category,
        price: favorite.event.price,
        imageUrl: favorite.event.imageUrl,
        status: favorite.event.status,
        capacity: favorite.event.capacity ?? null,
        soldTickets: favorite.event.soldTickets ?? 0,
        viewCount: favorite.event.viewCount ?? 0,
    }));
    const alerts = rawAlerts;
    const hasBillingProfile =
        user.billingStreet && user.billingPostalCode && user.billingCity;

    return (
        <>
            <div className="dash__grid dash__grid--split">
                <div className="card stack-lg">
                    <div className="section-title-row">
                        <h2>Dein Konto</h2>
                        <span className="text-muted">Schnellzugriff</span>
                    </div>
                    <div className="summary-list">
                        <div>
                            <span className="label">Name</span>
                            <strong>{user.name ?? user.email}</strong>
                        </div>
                        <div>
                            <span className="label">Rechnungsadresse</span>
                            <strong>
                                {hasBillingProfile
                                    ? `${user.billingStreet}, ${user.billingPostalCode} ${user.billingCity}`
                                    : "Noch nicht hinterlegt"}
                            </strong>
                        </div>
                        <div>
                            <span className="label">Zahlungsmethode</span>
                            <strong>{getPaymentMethodLabel(user.preferredPaymentMethod)}</strong>
                        </div>
                    </div>
                    <div className="flex wrap">
                        <Link href="/dashboard/profile" className="btn btn-primary">
                            Profil bearbeiten
                        </Link>
                        <Link href="/dashboard/orders" className="btn btn-ghost">
                            Bestellungen ansehen
                        </Link>
                    </div>
                </div>

                <div className="card stack-lg">
                    <div className="section-title-row">
                        <h2>Letzte Bestellungen</h2>
                        <Link href="/dashboard/orders" className="nav__link">
                            Gesamter Verlauf →
                        </Link>
                    </div>

                    {bookings.length === 0 ? (
                        <p className="text-muted">
                            Noch keine Buchungen vorhanden. Wenn du etwas gekauft hast, erscheint
                            es hier und in deiner Bestellübersicht.
                        </p>
                    ) : (
                        <div className="stack">
                            {bookings.map((booking) => (
                                <article
                                    key={booking.id}
                                    className={`booking-row ${getBookingStatusTone(booking.status)}`}
                                >
                                    <div className="booking-row__main">
                                        <div className="booking-row__title">
                                            <Link href={`/events/${booking.eventId}`}>
                                                {booking.event?.title ?? "Unbekanntes Event"}
                                            </Link>
                                        </div>
                                        <div className="booking-row__meta">
                                            <span>{booking.quantity} Tickets</span>
                                            <span>{getPaymentMethodLabel(booking.paymentMethod)}</span>
                                            <span>
                                                {new Date(booking.createdAt).toLocaleDateString(
                                                    "de-DE",
                                                    {
                                                        day: "2-digit",
                                                        month: "2-digit",
                                                        year: "numeric",
                                                    }
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="booking-row__aside">
                                        <strong>{formatMoney(booking.totalAmount)}</strong>
                                        <span>{getBookingStatusLabel(booking.status)}</span>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="dash__grid dash__grid--split mt-l">
                <div className="card stack-lg">
                    <div className="section-title-row">
                        <h2>Gespeicherte Events</h2>
                        <span className="text-muted">{favorites.length} Favoriten</span>
                    </div>

                    {favorites.length === 0 ? (
                        <p className="text-muted">
                            Du hast noch keine Events gespeichert. Markiere auf einer Eventseite
                            dein erstes Favoriten-Event.
                        </p>
                    ) : (
                        <div className="event-grid">
                            {favorites.map((event) => (
                                <EventCard key={event.id} event={event} />
                            ))}
                        </div>
                    )}
                </div>

                <div className="card stack-lg">
                    <div className="section-title-row">
                        <h2>Suchalarme</h2>
                        <span className="text-muted">{alerts.length} aktiv</span>
                    </div>

                    {alerts.length === 0 ? (
                        <p className="text-muted">
                            Noch keine Alarme gespeichert. Auf einer Eventseite kannst du einen
                            Suchalarm anlegen.
                        </p>
                    ) : (
                        <div className="stack">
                            {alerts.map((alert) => (
                                <article key={alert.id} className="analysis-card">
                                    <strong>{alert.query || alert.city || alert.category || "Alert"}</strong>
                                    <p>
                                        {alert.active ? "Aktiv" : "Inaktiv"} ·{" "}
                                        {new Date(alert.createdAt).toLocaleDateString("de-DE")}
                                    </p>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="cta-banner">
                <h2 className="cta-banner__title">Entdecke, was in Dresden passiert</h2>
                <p className="cta-banner__text">
                    Durchsuche Konzerte, Partys, Kultur und mehr - filtere nach
                    Kategorie, Datum und Preis und finde dein nächstes Erlebnis.
                </p>
                <Link href="/#events" className="btn btn-lg">
                    Events durchsuchen →
                </Link>
            </div>

            <div className="section-title-row mt-l">
                <h2>Bald in Dresden</h2>
                <Link href="/#events" className="nav__link">
                    Alle ansehen →
                </Link>
            </div>

            {events.length === 0 ? (
                <div className="empty-state">
                    <p>Aktuell sind keine kommenden Events eingetragen.</p>
                </div>
            ) : (
                <div className="event-grid">
                    {events.map((event) => (
                        <EventCard key={event.id} event={event} />
                    ))}
                </div>
            )}
        </>
    );
}
