import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { buildCustomerSummaries, normalizeCustomerEmail } from "@/lib/crm";
import { formatMoney, serializeBooking } from "@/lib/bookings";
import { prisma } from "@/lib/prisma";
import { getBookingAccessWhere } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function matchesSearch(customer, query) {
    if (!query) return true;
    const haystack = [
        customer.email,
        customer.name,
        customer.phone,
        customer.lastEventTitle,
        customer.latestBooking?.event?.title,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return haystack.includes(query);
}

export default async function CrmPage({ searchParams }) {
    const user = await getCurrentUser();

    if (!user) redirect("/auth");
    if (user.role === "VISITOR") redirect("/dashboard");

    const resolvedSearchParams = await searchParams;
    const search = String(resolvedSearchParams?.search ?? "").trim().toLowerCase();

    const [rawBookings, notes, tasks] = await Promise.all([
        prisma.booking.findMany({
            where: getBookingAccessWhere(user),
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                eventId: true,
                purchaserName: true,
                purchaserEmail: true,
                purchaserPhone: true,
                quantity: true,
                totalAmount: true,
                status: true,
                createdAt: true,
                event: {
                    select: {
                        id: true,
                        title: true,
                        location: true,
                        city: true,
                        startDate: true,
                        price: true,
                        category: true,
                    },
                },
            },
        }),
        prisma.customerNote.findMany({
            where: { organizerId: user.id },
            orderBy: { createdAt: "desc" },
        }),
        prisma.customerTask.findMany({
            where: { organizerId: user.id },
            orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
        }),
    ]);

    const bookings = rawBookings.map((booking) =>
        serializeBooking({
            ...booking,
            billingName: null,
            billingStreet: null,
            billingStreet2: null,
            billingPostalCode: null,
            billingCity: null,
            billingCountry: null,
            paymentMethod: booking.paymentMethod ?? "PAYPAL",
            paymentReference: booking.paymentReference ?? null,
            paidAt: booking.paidAt ?? null,
            paymentReminderCount: booking.paymentReminderCount ?? 0,
            lastPaymentReminderAt: booking.lastPaymentReminderAt ?? null,
            paymentCancelledAt: booking.paymentCancelledAt ?? null,
            paymentCancellationReason: booking.paymentCancellationReason ?? null,
            checkedInAt: booking.checkedInAt ?? null,
            checkedInById: booking.checkedInById ?? null,
            checkedInVia: booking.checkedInVia ?? null,
            transferToName: booking.transferToName ?? null,
            transferToEmail: booking.transferToEmail ?? null,
            paypalOrderId: booking.paypalOrderId ?? null,
            paypalCaptureId: booking.paypalCaptureId ?? null,
            paypalApprovalUrl: booking.paypalApprovalUrl ?? null,
            paypalStatus: booking.paypalStatus ?? null,
            updatedAt: booking.updatedAt ?? booking.createdAt,
        })
    );

    const customers = buildCustomerSummaries(bookings, notes, tasks).filter((customer) =>
        matchesSearch(customer, search)
    );

    const totalRevenue = customers.reduce((sum, customer) => sum + Number(customer.totalSpent || 0), 0);
    const repeatCustomers = customers.filter((customer) => customer.bookingCount > 1).length;
    const activeTasks = tasks.filter((task) => !task.completedAt).length;
    const noteCount = notes.length;

    return (
        <main className="section">
            <div className="container stack-lg">
                <div className="checkout-page__header">
                    <div>
                        <span className="eyebrow">CRM</span>
                        <h1 className="section-header__title">Kunden und Kontakte</h1>
                        <p className="text-muted">
                            Hier siehst du alle Kontakte aus deinen Buchungen, ergänzt um
                            interne Notizen und Aufgaben. So behältst du Wiederkäufer, offene
                            Follow-ups und wertvolle Stammkunden im Blick.
                        </p>
                    </div>
                    <div className="flex wrap">
                        <Link href="/dashboard" className="btn btn-ghost">
                            Zurück zum Dashboard
                        </Link>
                        <Link href="/dashboard/bookings" className="btn btn-primary">
                            Buchungen prüfen
                        </Link>
                    </div>
                </div>

                <div className="stats">
                    <div className="stat">
                        <div className="stat__value">{customers.length}</div>
                        <div className="stat__label">Kontakte</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{repeatCustomers}</div>
                        <div className="stat__label">Wiederkäufer</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{activeTasks}</div>
                        <div className="stat__label">Offene Aufgaben</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{noteCount}</div>
                        <div className="stat__label">Notizen</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{formatMoney(totalRevenue)}</div>
                        <div className="stat__label">Umsatz aus Kontakten</div>
                    </div>
                </div>

                <form className="booking-toolbar card" method="get">
                    <div className="field">
                        <label className="label" htmlFor="search">
                            Kontakt suchen
                        </label>
                        <input
                            id="search"
                            name="search"
                            className="input"
                            placeholder="Name, E-Mail, Event oder Notizinhalt"
                            defaultValue={resolvedSearchParams?.search ?? ""}
                        />
                    </div>

                    <div className="booking-toolbar__actions">
                        <button type="submit" className="btn btn-primary">
                            Suchen
                        </button>
                        <Link href="/dashboard/crm" className="btn btn-ghost">
                            Zurücksetzen
                        </Link>
                    </div>
                </form>

                {customers.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">✉️</div>
                        <p>Zu dieser Suche gibt es noch keine passenden Kontakte.</p>
                    </div>
                ) : (
                    <div className="stack">
                        {customers.map((customer) => (
                            <article key={customer.email} className="analysis-card">
                                <div className="booking-detail__top">
                                    <div>
                                        <div className="booking-detail__title">
                                            {customer.name || customer.email}
                                        </div>
                                        <div className="booking-detail__meta">
                                            <span>{customer.email}</span>
                                            {customer.phone ? <span>{customer.phone}</span> : null}
                                            <span>{customer.bookingCount} Buchungen</span>
                                        </div>
                                    </div>
                                    <div className="booking-detail__aside">
                                        <strong>{formatMoney(customer.totalSpent)}</strong>
                                        <span>{customer.openTasksCount} offene Aufgaben</span>
                                    </div>
                                </div>

                                <div className="summary-list">
                                    <div>
                                        <span className="label">Letztes Event</span>
                                        <strong>{customer.lastEventTitle ?? "Keine Buchung"}</strong>
                                    </div>
                                    <div>
                                        <span className="label">Letzte Aktivität</span>
                                        <strong>
                                            {customer.lastBookingAt
                                                ? new Date(customer.lastBookingAt).toLocaleDateString(
                                                      "de-DE",
                                                      {
                                                          day: "2-digit",
                                                          month: "2-digit",
                                                          year: "numeric",
                                                      }
                                                  )
                                                : "Noch keine"}
                                        </strong>
                                    </div>
                                    <div>
                                        <span className="label">Notizen</span>
                                        <strong>{customer.notesCount}</strong>
                                    </div>
                                    <div>
                                        <span className="label">Erledigt</span>
                                        <strong>{customer.completedTasksCount}</strong>
                                    </div>
                                </div>

                                <div className="flex wrap">
                                    <Link
                                        href={`/dashboard/crm/${encodeURIComponent(
                                            normalizeCustomerEmail(customer.email)
                                        )}`}
                                        className="btn btn-primary"
                                    >
                                        Profil öffnen
                                    </Link>
                                    {customer.latestBooking ? (
                                        <Link
                                            href={`/events/${customer.latestBooking.eventId}`}
                                            className="btn btn-ghost"
                                        >
                                            Letztes Event öffnen
                                        </Link>
                                    ) : null}
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
