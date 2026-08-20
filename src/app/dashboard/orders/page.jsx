import Link from "next/link";
import { redirect } from "next/navigation";

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

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
    const user = await getCurrentUser();

    if (!user) redirect("/auth");

    const rawBookings = await prisma.booking.findMany({
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
    const completed = bookings.filter((booking) => booking.status === "PAID");
    const open = bookings.filter((booking) => booking.status === "AWAITING_PAYMENT");
    const manualOpen = open.filter((booking) => isManualPaymentMethod(booking.paymentMethod));

    return (
        <main className="section">
            <div className="container stack-lg">
                <div className="checkout-page__header">
                    <div>
                        <span className="eyebrow">Bestellungen</span>
                        <h1 className="section-header__title">Dein Bestellverlauf</h1>
                        <p className="text-muted">
                            Hier siehst du alle Buchungen, die mit deinem Konto oder deiner
                            E-Mail verknüpft sind. Offene Rechnungen und Überweisungen bleiben
                            mit Referenz und Status sichtbar.
                        </p>
                    </div>
                    <div className="flex wrap">
                        <Link href="/dashboard/profile" className="btn btn-ghost">
                            Profil
                        </Link>
                        <Link href="/dashboard" className="btn btn-primary">
                            Zurück zum Dashboard
                        </Link>
                    </div>
                </div>

                <div className="stats">
                    <div className="stat">
                        <div className="stat__value">{bookings.length}</div>
                        <div className="stat__label">Bestellungen gesamt</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{completed.length}</div>
                        <div className="stat__label">Bezahlt</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{open.length}</div>
                        <div className="stat__label">Offen</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{manualOpen.length}</div>
                        <div className="stat__label">Manuell offen</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">
                            {formatMoney(
                                completed.reduce(
                                    (sum, booking) => sum + Number(booking.totalAmount || 0),
                                    0
                                )
                            )}
                        </div>
                        <div className="stat__label">Bezahlt gesamt</div>
                    </div>
                </div>

                {bookings.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">🧾</div>
                        <p>Du hast noch keine Bestellungen aufgegeben.</p>
                        <Link href="/" className="btn btn-primary mt-s">
                            Events entdecken
                        </Link>
                    </div>
                ) : (
                    <div className="stack">
                        {bookings.map((booking) => {
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
                                                <span>{booking.quantity} Tickets</span>
                                                <span>{booking.purchaserEmail}</span>
                                                <span>
                                                    {createdAt.toLocaleDateString("de-DE", {
                                                        day: "2-digit",
                                                        month: "2-digit",
                                                        year: "numeric",
                                                    })}
                                                </span>
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
                                                {booking.billingPostalCode ?? "-"}{" "}
                                                {booking.billingCity ?? "-"}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="label">Zahlung</span>
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
                                            <span className="label">Check-in</span>
                                            <p>
                                                {booking.checkedInAt
                                                    ? `Eingecheckt am ${new Date(booking.checkedInAt).toLocaleDateString("de-DE", {
                                                          day: "2-digit",
                                                          month: "2-digit",
                                                          year: "numeric",
                                                          hour: "2-digit",
                                                          minute: "2-digit",
                                                      })}`
                                                    : "Noch nicht eingecheckt"}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="label">Übertragen an</span>
                                            <p>
                                                {booking.transferToEmail
                                                    ? `${booking.transferToName ?? "Unbekannt"} <${booking.transferToEmail}>`
                                                    : "Nicht übertragen"}
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
                                    </div>

                                    {isManualOpen ? (
                                        <div className="checkout-summary__note">
                                            <span className="label">Offene manuelle Zahlung</span>
                                            <p>
                                                Diese Buchung wartet noch auf Zahlung. Nutze die
                                                Referenz #{booking.paymentReference} und prüfe deine
                                                Mails auf die Zahlungsdetails.
                                            </p>
                                        </div>
                                    ) : null}

                                    <div className="booking-detail__footer">
                                        <span className="text-muted">#{booking.id}</span>
                                        <Link href={`/events/${booking.eventId}`} className="nav__link">
                                            Event öffnen
                                        </Link>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>
        </main>
    );
}
