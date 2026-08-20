import Link from "next/link";
import { redirect } from "next/navigation";

import BookingRow from "@/components/BookingRow";
import CreateEventForm from "@/components/CreateEventForm";
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

export default async function DashboardPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/auth");
    if (user.role === "ADMIN") redirect("/admin");

    const isOrganizer = user.role === "ORGANIZER";

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
                        {isOrganizer ? "Veranstalter" : "Besucher"}
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
    const free = events.filter((event) => Number(event.price) === 0);
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

    return (
        <>
            <div className="stats">
                <div className="stat">
                    <div className="stat__value">{events.length}</div>
                    <div className="stat__label">Events gesamt</div>
                </div>
                <div className="stat">
                    <div className="stat__value">{upcoming.length}</div>
                    <div className="stat__label">Kommend</div>
                </div>
                <div className="stat">
                    <div className="stat__value">{past.length}</div>
                    <div className="stat__label">Vergangen</div>
                </div>
                <div className="stat">
                    <div className="stat__value">{free.length}</div>
                    <div className="stat__label">Kostenlos</div>
                </div>
                <div className="stat">
                    <div className="stat__value">{drafts.length}</div>
                    <div className="stat__label">Entwürfe</div>
                </div>
                <div className="stat">
                    <div className="stat__value">{cancelled.length}</div>
                    <div className="stat__label">Abgesagt</div>
                </div>
                <div className="stat">
                    <div className="stat__value">{bookings.length}</div>
                    <div className="stat__label">Buchungen</div>
                </div>
                <div className="stat">
                    <div className="stat__value">{paidBookings.length}</div>
                    <div className="stat__label">Bezahlt</div>
                </div>
                <div className="stat">
                    <div className="stat__value">{formatMoney(revenue)}</div>
                    <div className="stat__label">Umsatz</div>
                </div>
                <div className="stat">
                    <div className="stat__value">{totalCheckedInTickets}</div>
                    <div className="stat__label">Anwesend</div>
                </div>
                <div className="stat">
                    <div className="stat__value">{attendanceRate}%</div>
                    <div className="stat__label">Check-in-Quote</div>
                </div>
                <div className="stat">
                    <div className="stat__value">{noShowTickets}</div>
                    <div className="stat__label">No-Show</div>
                </div>
                <div className="stat">
                    <div className="stat__value">{customerCount}</div>
                    <div className="stat__label">Kontakte</div>
                </div>
                <div className="stat">
                    <div className="stat__value">{repeatCustomers}</div>
                    <div className="stat__label">Wiederkäufer</div>
                </div>
                <div className="stat">
                    <div className="stat__value">{organizationCount}</div>
                    <div className="stat__label">Organisationen</div>
                </div>
                <div className="stat">
                    <div className="stat__value">{teamMemberCount}</div>
                    <div className="stat__label">Teammitglieder</div>
                </div>
            </div>

            <div className="dash__grid dash__grid--split">
                <div className="dash__sticky">
                    <CreateEventForm organizations={organizations} />
                </div>

                <div>
                    <div className="section-title-row">
                        <h2>Deine Events</h2>
                        <span className="text-muted">{events.length} gesamt</span>
                    </div>

                    {events.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state__icon">📅</div>
                            <p>Du hast noch keine Events erstellt. Leg links dein erstes an!</p>
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
            </div>

            <div className="section-title-row mt-l">
                <h2>Buchungen</h2>
                <span className="text-muted">
                    {bookings.length} gesamt, {pendingBookings.length} offen
                </span>
            </div>

                <div className="dash__actions mb-s">
                    <Link href="/dashboard/bookings" className="btn btn-primary">
                        Buchungen verwalten
                    </Link>
                    <Link href="/dashboard/analytics" className="btn btn-ghost">
                        Analytics
                    </Link>
                    <Link href="/dashboard/organizations" className="btn btn-ghost">
                        Organisationen
                    </Link>
                </div>

            <div className="section-title-row mt-l">
                <h2>Organisationen</h2>
                <Link href="/dashboard/organizations" className="nav__link">
                    Verwalten →
                </Link>
            </div>

            {organizations.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state__icon">👥</div>
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

            {bookings.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state__icon">💳</div>
                    <p>
                        Hier erscheinen alle Buchungen deiner Events, sobald jemand über
                        PayPal reserviert.
                    </p>
                </div>
            ) : (
                <div className="stack">
                    {bookings.slice(0, 8).map((booking) => (
                        <BookingRow key={booking.id} booking={booking} />
                    ))}
                </div>
            )}

            <div className="section-title-row mt-l">
                <h2>Letzte Einlass-Scans</h2>
                <span className="text-muted">{recentCheckIns.length} aktuell</span>
            </div>

            {recentCheckIns.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state__icon">🎟️</div>
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
                    <div className="empty-state__icon">🗓️</div>
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
