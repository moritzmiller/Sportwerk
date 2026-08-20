import Link from "next/link";
import { redirect } from "next/navigation";

import BookingReminderActions from "@/components/BookingReminderActions";
import BookingOperations from "@/components/BookingOperations";
import BookingStatusActions from "@/components/BookingStatusActions";
import { getCurrentUser } from "@/lib/auth";
import {
    formatMoney,
    getBookingStatusLabel,
    getBookingStatusTone,
    getPaymentMethodLabel,
    serializeBooking,
} from "@/lib/bookings";
import { formatManualPaymentDueDate, isManualPaymentMethod } from "@/lib/manual-payments";
import { getPaymentReminderSummary } from "@/lib/payment-reminders";
import { prisma } from "@/lib/prisma";
import { getBookingAccessWhere } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function toText(value) {
    return String(value ?? "").trim().toLowerCase();
}

function applyFilters(bookings, search, status) {
    const q = toText(search);

    return bookings.filter((booking) => {
        if (status !== "all" && booking.status !== status) {
            return false;
        }

        if (!q) return true;

        const haystack = [
            booking.id,
            booking.purchaserName,
            booking.purchaserEmail,
            booking.billingName,
            booking.billingCity,
            booking.billingPostalCode,
            booking.paymentMethod,
            booking.paymentReference,
            booking.event?.title,
            booking.event?.location,
            booking.event?.city,
            booking.status,
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        return haystack.includes(q);
    });
}

export default async function OrganizerBookingsPage({ searchParams }) {
    const user = await getCurrentUser();

    if (!user) redirect("/auth");
    if (user.role === "VISITOR") redirect("/dashboard");

    const resolvedSearchParams = await searchParams;
    const search = typeof resolvedSearchParams?.search === "string" ? resolvedSearchParams.search : "";
    const status = typeof resolvedSearchParams?.status === "string" ? resolvedSearchParams.status : "all";

    const rawBookings = await prisma.booking.findMany({
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
    });

    const bookings = rawBookings.map(serializeBooking);
    const filtered = applyFilters(bookings, search, status);

    const totals = {
        bookings: bookings.length,
        paid: bookings.filter((booking) => booking.status === "PAID").length,
        pending: bookings.filter((booking) => booking.status === "AWAITING_PAYMENT").length,
        manual: bookings.filter(
            (booking) => booking.status === "AWAITING_PAYMENT" && isManualPaymentMethod(booking.paymentMethod)
        ).length,
        revenue: bookings
            .filter((booking) => booking.status === "PAID")
            .reduce((sum, booking) => sum + Number(booking.totalAmount || 0), 0),
    };

    return (
        <main className="section">
            <div className="container stack-lg">
                <div className="checkout-page__header">
                    <div>
                        <span className="eyebrow">Buchungen</span>
                        <h1 className="section-header__title">Deine Event-Buchungen</h1>
                        <p className="text-muted">
                            Hier findest du alle Reservierungen deiner Events, inklusive Status,
                            Zahlungsmethode, Referenz und offener Erinnerungen.
                        </p>
                    </div>
                    <div className="flex wrap">
                        <Link href="/dashboard" className="btn btn-ghost">
                            Zurück zum Dashboard
                        </Link>
                        <Link href="/" className="btn btn-primary">
                            Events ansehen
                        </Link>
                    </div>
                </div>

                <div className="stats">
                    <div className="stat">
                        <div className="stat__value">{totals.bookings}</div>
                        <div className="stat__label">Buchungen gesamt</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{totals.paid}</div>
                        <div className="stat__label">Bezahlt</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{totals.pending}</div>
                        <div className="stat__label">Offen</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{totals.manual}</div>
                        <div className="stat__label">Manuell offen</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{formatMoney(totals.revenue)}</div>
                        <div className="stat__label">Umsatz</div>
                    </div>
                </div>

                <form className="booking-toolbar card" method="get">
                    <div className="field">
                        <label className="label" htmlFor="search">
                            Suchen
                        </label>
                        <input
                            id="search"
                            name="search"
                            className="input"
                            placeholder="Name, Event, E-Mail, Referenz oder Buchungscode"
                            defaultValue={search}
                        />
                    </div>

                    <div className="field">
                        <label className="label" htmlFor="status">
                            Status
                        </label>
                        <select id="status" name="status" className="select" defaultValue={status}>
                            <option value="all">Alle</option>
                            <option value="AWAITING_PAYMENT">Wartet auf Zahlung</option>
                            <option value="PAID">Bezahlt</option>
                            <option value="FAILED">Fehlgeschlagen</option>
                            <option value="CANCELLED">Abgebrochen</option>
                            <option value="REFUNDED">Erstattet</option>
                        </select>
                    </div>

                    <div className="booking-toolbar__actions">
                        <button type="submit" className="btn btn-primary">
                            Filtern
                        </button>
                        <Link href="/dashboard/bookings" className="btn btn-ghost">
                            Zurücksetzen
                        </Link>
                    </div>
                </form>

                {filtered.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">🔎</div>
                        <p>Keine Buchungen für deine Filter gefunden.</p>
                    </div>
                ) : (
                    <div className="stack">
                        {filtered.map((booking) => {
                            const createdAt = new Date(booking.createdAt);
                            const eventDate = booking.event?.startDate
                                ? new Date(booking.event.startDate)
                                : null;
                            const dueDate = formatManualPaymentDueDate(booking.createdAt);
                            const reminderSummary = getPaymentReminderSummary(booking);
                            const isManualOpen =
                                booking.status === "AWAITING_PAYMENT" &&
                                isManualPaymentMethod(booking.paymentMethod);

                            return (
                                <article
                                    key={booking.id}
                                    className={`booking-detail card ${getBookingStatusTone(booking.status)}`}
                                >
                                    <div className="booking-detail__top">
                                        <div>
                                            <div className="booking-detail__title">
                                                {booking.event?.title ?? "Unbekanntes Event"}
                                            </div>
                                            <div className="booking-detail__meta">
                                                <span>{booking.purchaserName}</span>
                                                <span>{booking.purchaserEmail}</span>
                                                <span>{booking.quantity} Tickets</span>
                                                <span>{getPaymentMethodLabel(booking.paymentMethod)}</span>
                                            </div>
                                        </div>
                                        <div className="booking-detail__aside">
                                            <strong>{formatMoney(booking.totalAmount)}</strong>
                                            <span>{getBookingStatusLabel(booking.status)}</span>
                                            <small className="text-muted">
                                                #{booking.paymentReference ?? booking.id}
                                            </small>
                                        </div>
                                    </div>

                                    <div className="booking-detail__grid">
                                        <div>
                                            <span className="label">Event</span>
                                            <p>
                                                {booking.event?.location}, {booking.event?.city}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="label">Buchung</span>
                                            <p>
                                                {createdAt.toLocaleDateString("de-DE", {
                                                    day: "2-digit",
                                                    month: "2-digit",
                                                    year: "numeric",
                                                })}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="label">Termin</span>
                                            <p>
                                                {eventDate
                                                    ? eventDate.toLocaleDateString("de-DE", {
                                                          day: "2-digit",
                                                          month: "2-digit",
                                                          year: "numeric",
                                                          hour: "2-digit",
                                                          minute: "2-digit",
                                                      })
                                                    : "n/a"}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="label">PayPal</span>
                                            <p>{booking.paypalStatus ?? "n/a"}</p>
                                        </div>
                                        <div>
                                            <span className="label">Zahlungsmethode</span>
                                            <p>{getPaymentMethodLabel(booking.paymentMethod)}</p>
                                        </div>
                                        <div>
                                            <span className="label">Referenz</span>
                                            <p>{booking.paymentReference ?? "n/a"}</p>
                                        </div>
                                        <div>
                                            <span className="label">Bezahlt am</span>
                                            <p>
                                                {booking.paidAt
                                                    ? new Date(booking.paidAt).toLocaleDateString("de-DE", {
                                                          day: "2-digit",
                                                          month: "2-digit",
                                                          year: "numeric",
                                                          hour: "2-digit",
                                                          minute: "2-digit",
                                                      })
                                                    : "n/a"}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="label">Erinnerungen</span>
                                            <p>
                                                {booking.paymentReminderCount || 0} gesendet
                                                <br />
                                                {booking.lastPaymentReminderAt
                                                    ? `Zuletzt ${new Date(booking.lastPaymentReminderAt).toLocaleDateString("de-DE", {
                                                          day: "2-digit",
                                                          month: "2-digit",
                                                          year: "numeric",
                                                          hour: "2-digit",
                                                          minute: "2-digit",
                                                      })}`
                                                    : `Fällig bis ${dueDate}`}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="label">Nächste Erinnerung</span>
                                            <p>
                                                {isManualOpen
                                                    ? `${reminderSummary.label}${reminderSummary.value ? ` · ${reminderSummary.value}` : ""}`
                                                    : "Nicht erforderlich"}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="label">Rechnung</span>
                                            <p>
                                                {booking.billingName ??
                                                    booking.purchaserName ??
                                                    "Nicht hinterlegt"}
                                                <br />
                                                {booking.billingStreet ?? "Nicht hinterlegt"}
                                                {booking.billingStreet2
                                                    ? `, ${booking.billingStreet2}`
                                                    : ""}
                                                <br />
                                                {booking.billingPostalCode ?? "—"}{" "}
                                                {booking.billingCity ?? "—"}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="booking-detail__footer">
                                        <span className="text-muted">#{booking.id}</span>
                                        <Link href={`/events/${booking.eventId}`} className="nav__link">
                                            Event öffnen
                                        </Link>
                                    </div>

                                    {isManualOpen ? (
                                        <div className="checkout-summary__note">
                                            <span className="label">Offene manuelle Zahlung</span>
                                            <p>
                                                Referenz #{booking.paymentReference} ist aktiv. Du
                                                kannst eine neue Erinnerung senden oder den Status
                                                auf bezahlt setzen, sobald das Geld eingegangen ist.
                                                <br />
                                                {reminderSummary.label}
                                            </p>
                                        </div>
                                    ) : null}

                                    <div className="flex wrap">
                                        {isManualOpen ? (
                                            <>
                                                <BookingStatusActions
                                                    bookingId={booking.id}
                                                    canMarkPaid
                                                />
                                                <BookingReminderActions bookingId={booking.id} />
                                            </>
                                        ) : null}
                                    </div>

                                    {booking.status === "PAID" ? (
                                        <BookingOperations
                                            bookingId={booking.id}
                                            canCheckIn={!booking.checkedInAt}
                                            canTransfer
                                            canRefund
                                        />
                                    ) : null}
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>
        </main>
    );
}
