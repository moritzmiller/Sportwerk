import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import EventEditorForm from "@/components/EventEditorForm";
import { getCurrentUser } from "@/lib/auth";
import { getAttendanceSnapshot } from "@/lib/attendance";
import { getEventStatusLabel } from "@/lib/event-management";
import { serializeEvent } from "@/lib/events";
import { canManageEvent } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditEventPage({ params }) {
    const user = await getCurrentUser();
    if (!user) redirect("/auth");

    const resolvedParams = await params;
    const id = Number(resolvedParams.id);
    if (Number.isNaN(id)) notFound();

    const event = await prisma.event.findUnique({
        where: { id },
        select: {
            id: true,
            title: true,
            description: true,
            location: true,
            city: true,
            category: true,
            eventType: true,
            eventOptions: true,
            status: true,
            allowedPaymentMethods: true,
            startDate: true,
            price: true,
            capacity: true,
            soldTickets: true,
            cancellationReason: true,
            ownerId: true,
            organizationId: true,
            venueId: true,
            organization: {
                select: {
                    id: true,
                    name: true,
                },
            },
            venue: {
                select: {
                    id: true,
                    name: true,
                },
            },
            owner: { select: { id: true, email: true, name: true } },
            ticketTypes: {
                orderBy: [
                    { isDefault: "desc" },
                    { sortOrder: "asc" },
                    { createdAt: "asc" },
                ],
            },
        },
    });

    if (!event) notFound();
    const accessEvent = await prisma.event.findUnique({
        where: { id },
        include: {
            organization: { include: { members: true } },
            members: true,
        },
    });
    if (!canManageEvent(user, accessEvent)) redirect("/dashboard");

    const organizations = await prisma.organization.findMany({
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
        select: {
            id: true,
            name: true,
            verificationStatus: true,
            venues: {
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    name: true,
                    address: true,
                    city: true,
                    notes: true,
                    organizationId: true,
                    verificationStatus: true,
                },
            },
        },
    });

    const [favoriteCount, viewCount, bookingCount, paidCount, ticketSummary] = await Promise.all([
        prisma.eventFavorite?.count?.({ where: { eventId: event.id } }) ?? 0,
        prisma.eventView?.count?.({ where: { eventId: event.id } }) ?? 0,
        prisma.booking.count({ where: { eventId: event.id } }),
        prisma.booking.count({ where: { eventId: event.id, status: "PAID" } }),
        prisma.booking.aggregate({
            where: { eventId: event.id, status: "PAID" },
            _sum: { quantity: true },
        }),
    ]);

    const paidTickets = ticketSummary._sum.quantity ?? 0;
    const attendance = getAttendanceSnapshot({
        paidBookings: paidCount,
        paidTickets,
        checkedInBookings: 0,
        checkedInTickets: 0,
    });

    const data = serializeEvent(event);

    return (
        <main className="section">
            <div className="container stack-lg">
                <div className="checkout-page__header">
                    <div>
                        <span className="eyebrow">Eventverwaltung</span>
                        <h1 className="section-header__title">{data.title}</h1>
                        <p className="text-muted">
                            Status: {getEventStatusLabel(data.status)} | {data.location},{" "}
                            {data.city}
                        </p>
                    </div>
                    <div className="flex wrap">
                        <Link href={`/events/${data.id}`} className="btn btn-ghost">
                            Event ansehen
                        </Link>
                        <Link href="/dashboard" className="btn btn-primary">
                            Zurück zum Dashboard
                        </Link>
                    </div>
                </div>

                <div className="dash__grid dash__grid--split">
                    <EventEditorForm event={data} organizations={organizations} />

                    <aside className="card stack-lg">
                        <div className="stats">
                            <div className="stat">
                                <div className="stat__value">{viewCount}</div>
                                <div className="stat__label">Aufrufe</div>
                            </div>
                            <div className="stat">
                                <div className="stat__value">{favoriteCount}</div>
                                <div className="stat__label">Favoriten</div>
                            </div>
                            <div className="stat">
                                <div className="stat__value">{bookingCount}</div>
                                <div className="stat__label">Buchungen</div>
                            </div>
                            <div className="stat">
                                <div className="stat__value">{paidCount}</div>
                                <div className="stat__label">Bezahlt</div>
                            </div>
                            <div className="stat">
                                <div className="stat__value">{attendance.checkedInTickets}</div>
                                <div className="stat__label">Anwesend</div>
                            </div>
                            <div className="stat">
                                <div className="stat__value">
                                    {attendance.paidTickets
                                        ? `${Math.round(attendance.attendanceRate * 100)}%`
                                        : "0%"}
                                </div>
                                <div className="stat__label">Check-in-Quote</div>
                            </div>
                        </div>

                        <h2 className="card__title">Verlauf</h2>
                        <p className="text-muted">
                            Der Änderungsverlauf wird in dieser Datenbankkonfiguration nicht
                            gespeichert.
                        </p>
                    </aside>
                </div>
            </div>
        </main>
    );
}
