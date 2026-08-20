import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import CrmCustomerComposer from "@/components/CrmCustomerComposer";
import CrmTaskToggle from "@/components/CrmTaskToggle";
import { getCurrentUser } from "@/lib/auth";
import { buildCustomerSummaries, normalizeCustomerEmail } from "@/lib/crm";
import { formatMoney, getBookingStatusLabel, getBookingStatusTone } from "@/lib/bookings";
import { prisma } from "@/lib/prisma";
import { getBookingAccessWhere } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }) {
    const user = await getCurrentUser();

    if (!user) redirect("/auth");
    if (user.role === "VISITOR") redirect("/dashboard");

    const resolvedParams = await params;
    const email = normalizeCustomerEmail(decodeURIComponent(resolvedParams.email ?? ""));

    if (!email) notFound();

    const [rawBookings, notes, tasks] = await Promise.all([
        prisma.booking.findMany({
            where: {
                ...getBookingAccessWhere(user),
                purchaserEmail: {
                    equals: email,
                    mode: "insensitive",
                },
            },
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
            where: {
                organizerId: user.id,
                customerEmail: email,
            },
            orderBy: { createdAt: "desc" },
        }),
        prisma.customerTask.findMany({
            where: {
                organizerId: user.id,
                customerEmail: email,
            },
            orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
        }),
    ]);

    if (rawBookings.length === 0 && notes.length === 0 && tasks.length === 0) {
        notFound();
    }

    const customers = buildCustomerSummaries(
        rawBookings.map((booking) => ({
            ...booking,
            createdAt: booking.createdAt.toISOString(),
            event: booking.event
                ? {
                      ...booking.event,
                      startDate: booking.event.startDate.toISOString(),
                  }
                : null,
        })),
        notes,
        tasks
    );
    const customer = customers[0] ?? {
        email,
        name: "",
        phone: "",
        bookingCount: 0,
        paidBookings: 0,
        openBookings: 0,
        totalTickets: 0,
        totalSpent: 0,
        notes: [],
        tasks: [],
        notesCount: 0,
        openTasksCount: 0,
        completedTasksCount: 0,
        latestBooking: null,
    };

    return (
        <main className="section">
            <div className="container stack-lg">
                <div className="checkout-page__header">
                    <div>
                        <span className="eyebrow">CRM</span>
                        <h1 className="section-header__title">
                            {customer.name || customer.email}
                        </h1>
                        <p className="text-muted">{customer.email}</p>
                    </div>
                    <div className="flex wrap">
                        <Link href="/dashboard/crm" className="btn btn-ghost">
                            Zurück zur Übersicht
                        </Link>
                        <Link href="/dashboard" className="btn btn-primary">
                            Dashboard öffnen
                        </Link>
                    </div>
                </div>

                <div className="stats">
                    <div className="stat">
                        <div className="stat__value">{customer.bookingCount}</div>
                        <div className="stat__label">Buchungen</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{customer.paidBookings}</div>
                        <div className="stat__label">Bezahlt</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{customer.openTasksCount}</div>
                        <div className="stat__label">Offene Aufgaben</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{customer.notesCount}</div>
                        <div className="stat__label">Notizen</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{formatMoney(customer.totalSpent)}</div>
                        <div className="stat__label">Umsatz</div>
                    </div>
                </div>

                <div className="dash__grid dash__grid--split">
                    <section className="card stack-lg">
                        <div className="section-title-row">
                            <h2>Kontaktübersicht</h2>
                            <span className="text-muted">
                                {customer.lastBookingAt
                                    ? `Letzte Aktivität am ${new Date(customer.lastBookingAt).toLocaleDateString("de-DE")}`
                                    : "Noch keine Aktivität"}
                            </span>
                        </div>

                        <div className="summary-list">
                            <div>
                                <span className="label">Telefon</span>
                                <strong>{customer.phone || "Nicht hinterlegt"}</strong>
                            </div>
                            <div>
                                <span className="label">Wiederkäufer</span>
                                <strong>{customer.bookingCount > 1 ? "Ja" : "Nein"}</strong>
                            </div>
                            <div>
                                <span className="label">Letztes Event</span>
                                <strong>{customer.lastEventTitle ?? "Keine Buchung"}</strong>
                            </div>
                            <div>
                                <span className="label">Gesamttickets</span>
                                <strong>{customer.totalTickets}</strong>
                            </div>
                        </div>

                        <div className="section-title-row">
                            <h3 className="card__title">Buchungen</h3>
                            <span className="text-muted">{rawBookings.length} Einträge</span>
                        </div>

                        {rawBookings.length === 0 ? (
                            <p className="text-muted">
                                Für diesen Kontakt liegen noch keine Buchungen vor.
                            </p>
                        ) : (
                            <div className="stack">
                                {rawBookings.map((booking) => (
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
                                                    <span>{booking.event?.city ?? "Ort offen"}</span>
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
                                            <div className="booking-detail__aside">
                                                <strong>{formatMoney(booking.totalAmount)}</strong>
                                                <span>{getBookingStatusLabel(booking.status)}</span>
                                            </div>
                                        </div>

                                        <div className="booking-detail__footer">
                                            <Link href={`/events/${booking.eventId}`} className="nav__link">
                                                Event öffnen
                                            </Link>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>

                    <aside className="stack-lg">
                        <CrmCustomerComposer customerEmail={email} />

                        <section className="card stack">
                            <div className="section-title-row">
                                <h2>Notizen</h2>
                                <span className="text-muted">{notes.length} gesamt</span>
                            </div>

                            {notes.length === 0 ? (
                                <p className="text-muted">
                                    Noch keine internen Notizen für diesen Kontakt.
                                </p>
                            ) : (
                                <div className="stack">
                                    {notes.map((note) => (
                                        <article key={note.id} className="analysis-card">
                                            <strong>
                                                {new Date(note.createdAt).toLocaleDateString("de-DE", {
                                                    day: "2-digit",
                                                    month: "2-digit",
                                                    year: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })}
                                            </strong>
                                            <p>{note.content}</p>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className="card stack">
                            <div className="section-title-row">
                                <h2>Aufgaben</h2>
                                <span className="text-muted">{tasks.length} gesamt</span>
                            </div>

                            {tasks.length === 0 ? (
                                <p className="text-muted">Noch keine Aufgaben angelegt.</p>
                            ) : (
                                <div className="stack">
                                    {tasks.map((task) => (
                                        <article key={task.id} className="analysis-card">
                                            <div className="booking-detail__top">
                                                <div>
                                                    <strong>{task.title}</strong>
                                                    {task.description ? <p>{task.description}</p> : null}
                                                    <p className="text-muted">
                                                        {task.dueAt
                                                            ? `Fällig am ${new Date(task.dueAt).toLocaleDateString("de-DE", {
                                                                  day: "2-digit",
                                                                  month: "2-digit",
                                                                  year: "numeric",
                                                                  hour: "2-digit",
                                                                  minute: "2-digit",
                                                              })}`
                                                            : "Ohne Fälligkeitsdatum"}
                                                    </p>
                                                </div>
                                                <div className="booking-detail__aside">
                                                    <span>
                                                        {task.completedAt ? "Erledigt" : "Offen"}
                                                    </span>
                                                </div>
                                            </div>
                                            <CrmTaskToggle taskId={task.id} completed={Boolean(task.completedAt)} />
                                        </article>
                                    ))}
                                </div>
                            )}
                        </section>
                    </aside>
                </div>
            </div>
        </main>
    );
}
