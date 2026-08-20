import Link from "next/link";
import { redirect } from "next/navigation";

import BookingReminderActions from "@/components/BookingReminderActions";
import AdminPaymentsExportControls from "@/components/AdminPaymentsExportControls";
import BookingStatusActions from "@/components/BookingStatusActions";
import {
    ADMIN_PAYMENT_STATUSES,
    ADMIN_PAYMENT_VIEWS,
    buildAdminPaymentsHref,
    buildAdminPaymentsExportHref,
    filterAdminPayments,
    getAdminPaymentLifecycleState,
    getAdminPaymentQueryWhere,
} from "@/lib/admin-payments";
import { getCurrentUser } from "@/lib/auth";
import {
    formatMoney,
    getBookingStatusLabel,
    getBookingStatusTone,
    getPaymentMethodLabel,
    serializeBooking,
} from "@/lib/bookings";
import {
    getPaymentAutoCancelSummary,
    getPaymentReminderSummary,
} from "@/lib/payment-reminders";
import { isManualPaymentMethod } from "@/lib/manual-payments";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function normalizeOption(options, value, fallback) {
    return options.some((option) => option.value === value) ? value : fallback;
}

export default async function AdminPaymentsPage({ searchParams }) {
    const user = await getCurrentUser();
    if (!user) redirect("/auth");
    if (user.role !== "ADMIN") redirect("/dashboard");

    const resolvedSearchParams = await searchParams;
    const search = typeof resolvedSearchParams?.search === "string" ? resolvedSearchParams.search : "";
    const view = normalizeOption(ADMIN_PAYMENT_VIEWS, resolvedSearchParams?.view, "all");
    const status = normalizeOption(ADMIN_PAYMENT_STATUSES, resolvedSearchParams?.status, "open");

    const rawBookings = await prisma.booking.findMany({
        where: getAdminPaymentQueryWhere(status),
        orderBy: { createdAt: "asc" },
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
    const filtered = filterAdminPayments(bookings, { search, view, status });
    const visibleCount = filtered.length;
    const openCount = bookings.filter(
        (booking) => getAdminPaymentLifecycleState(booking) === "open"
    ).length;
    const overdueCount = bookings.filter(
        (booking) => getAdminPaymentLifecycleState(booking) === "overdue"
    ).length;
    const cancelledCount = bookings.filter(
        (booking) => getAdminPaymentLifecycleState(booking) === "cancelled"
    ).length;
    const refundedCount = bookings.filter(
        (booking) => getAdminPaymentLifecycleState(booking) === "refunded"
    ).length;
    const dueCount = bookings.filter(
        (booking) => getPaymentReminderSummary(booking).kind === "due"
    ).length;
    const cancelCount = bookings.filter(
        (booking) => getPaymentAutoCancelSummary(booking).kind === "cancel"
    ).length;

    const visibleExportHref = buildAdminPaymentsExportHref(
        "/api/admin/payments/export",
        search,
        status,
        view,
        "visible"
    );
    const statusExportHref = buildAdminPaymentsExportHref(
        "/api/admin/payments/export",
        search,
        status,
        view,
        "status"
    );

    return (
        <main className="section">
            <div className="container stack-lg">
                <div className="checkout-page__header">
                    <div>
                        <span className="eyebrow">Admin</span>
                        <h1 className="section-header__title">Offene manuelle Zahlungen</h1>
                        <p className="text-muted">
                            Hier siehst du offene, überfällige und stornierte manuelle Zahlungen mit
                            Reminder-Status, Fälligkeit, Export und Schnellaktionen.
                        </p>
                    </div>
                    <div className="flex wrap">
                        <Link href="/admin" className="btn btn-ghost">
                            Zurück zum Admin
                        </Link>
                        <Link href="/dashboard/bookings" className="btn btn-primary">
                            Vollansicht
                        </Link>
                        <AdminPaymentsExportControls
                            visibleHref={visibleExportHref}
                            statusHref={statusExportHref}
                            statusLabel="gewählten Status"
                        />
                    </div>
                </div>

                <div className="stats">
                    <div className="stat">
                        <div className="stat__value">{visibleCount}</div>
                        <div className="stat__label">Sichtbar</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{openCount}</div>
                        <div className="stat__label">Offen</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{overdueCount}</div>
                        <div className="stat__label">Überfällig</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{cancelledCount}</div>
                        <div className="stat__label">Storniert</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{refundedCount}</div>
                        <div className="stat__label">Erstattet</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{dueCount}</div>
                        <div className="stat__label">Erinnerung fällig</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{cancelCount}</div>
                        <div className="stat__label">Auto-Storno fällig</div>
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
                            placeholder="Name, Event, E-Mail, Referenz oder Rechnungsdaten"
                            defaultValue={search}
                        />
                    </div>

                    <div className="field">
                        <label className="label" htmlFor="status">
                            Zahlungsstatus
                        </label>
                        <select id="status" name="status" className="select" defaultValue={status}>
                            {ADMIN_PAYMENT_STATUSES.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="field">
                        <label className="label" htmlFor="view">
                            Schnellfilter
                        </label>
                        <select id="view" name="view" className="select" defaultValue={view}>
                            {ADMIN_PAYMENT_VIEWS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="booking-toolbar__actions">
                        <button type="submit" className="btn btn-primary">
                            Filtern
                        </button>
                        <Link href="/admin/payments" className="btn btn-ghost">
                            Zurücksetzen
                        </Link>
                    </div>
                </form>

                {(search || view !== "all" || status !== "open") && (
                    <div className="active-tags">
                        <span className="filterbar__count">
                            {visibleCount} von {bookings.length} Einträgen
                        </span>
                        {search ? (
                            <Link
                                href={buildAdminPaymentsHref("/admin/payments", "", status, view)}
                                className="tag-remove"
                            >
                                Suche: &quot;{search}&quot; ✕
                            </Link>
                        ) : null}
                        {status !== "open" ? (
                            <Link
                                href={buildAdminPaymentsHref("/admin/payments", search, "open", view)}
                                className="tag-remove"
                            >
                                {ADMIN_PAYMENT_STATUSES.find((option) => option.value === status)?.label} ✕
                            </Link>
                        ) : null}
                        {view !== "all" ? (
                            <Link
                                href={buildAdminPaymentsHref("/admin/payments", search, status, "all")}
                                className="tag-remove"
                            >
                                {ADMIN_PAYMENT_VIEWS.find((option) => option.value === view)?.label} ✕
                            </Link>
                        ) : null}
                    </div>
                )}

                <div className="field-hint">
                    CSV-Export folgt immer den aktuell sichtbaren Filtern. Der Schnellbutton exportiert
                    zusätzlich den kompletten gewählten Status.
                </div>

                {filtered.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">🟢</div>
                        <p>Keine manuellen Zahlungen für deine Filter gefunden.</p>
                    </div>
                ) : (
                    <div className="stack">
                        {filtered.map((booking) => {
                            const reminderSummary = getPaymentReminderSummary(booking);
                            const cancelSummary = getPaymentAutoCancelSummary(booking);
                            const eventDate = booking.event?.startDate
                                ? new Date(booking.event.startDate)
                                : null;
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
                                                <span>{getPaymentMethodLabel(booking.paymentMethod)}</span>
                                                <span>{booking.quantity} Tickets</span>
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
                                            <span className="label">Erinnerung</span>
                                            <p>
                                                {reminderSummary.label}
                                                {reminderSummary.value ? ` · ${reminderSummary.value}` : ""}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="label">Auto-Storno</span>
                                            <p>
                                                {cancelSummary.label}
                                                {cancelSummary.value ? ` · ${cancelSummary.value}` : ""}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="label">Referenz</span>
                                            <p>{booking.paymentReference ?? "n/a"}</p>
                                        </div>
                                        <div>
                                            <span className="label">Erinnerungen gesendet</span>
                                            <p>{booking.paymentReminderCount || 0}</p>
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
                                                Diese Buchung kann erneut erinnert oder als bezahlt
                                                markiert werden.
                                            </p>
                                        </div>
                                    ) : null}

                                    <div className="flex wrap">
                                        {isManualOpen ? (
                                            <>
                                                <BookingReminderActions bookingId={booking.id} />
                                                <BookingStatusActions
                                                    bookingId={booking.id}
                                                    canMarkPaid
                                                />
                                            </>
                                        ) : null}
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
