import Link from "next/link";
import { redirect } from "next/navigation";

import MobileCheckInScanner from "@/components/MobileCheckInScanner";
import { getCurrentUser } from "@/lib/auth";
import { summarizeAttendance } from "@/lib/attendance";
import {
    buildCheckinScanStats,
    getScanStatusLabel,
    getScanTone,
    summarizeRecentWarnings,
} from "@/lib/checkin-scans";
import { prisma } from "@/lib/prisma";
import { getBookingAccessWhere, getEventAccessWhere } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function serializeEvent(event, attendanceSummary = null) {
    const attendance = attendanceSummary?.get(event.id) ?? null;

    return {
        id: event.id,
        title: event.title,
        description: event.description,
        imageUrl: event.imageUrl ?? null,
        location: event.location,
        city: event.city,
        category: event.category,
        status: event.status,
        startDate: event.startDate.toISOString(),
        price: event.price,
        capacity: event.capacity ?? null,
        soldTickets: event.soldTickets ?? 0,
        attendance: attendance
            ? {
                  paidBookings: attendance.paidBookings,
                  paidTickets: attendance.paidTickets,
                  checkedInBookings: attendance.checkedInBookings,
                  checkedInTickets: attendance.checkedInTickets,
              }
            : {
                  paidBookings: 0,
                  paidTickets: 0,
                  checkedInBookings: 0,
                  checkedInTickets: 0,
              },
    };
}

export default async function CheckInPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/auth");
    if (user.role === "VISITOR") redirect("/dashboard");

    const [rawEvents, rawBookings] = await Promise.all([
        prisma.event.findMany({
            where: {
                AND: [
                    getEventAccessWhere(user),
                    { status: { not: "CANCELLED" } },
                ],
            },
            orderBy: { startDate: "asc" },
            include: {
                organization: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        }),
        prisma.booking.findMany({
            where: getBookingAccessWhere(user),
            select: {
                eventId: true,
                quantity: true,
                status: true,
                checkedInAt: true,
            },
        }),
    ]);

    const scanWhere = user.role === "ADMIN" ? {} : { event: getEventAccessWhere(user) };
    const rawScans = await prisma.bookingScan.findMany({
        where: scanWhere,
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
            booking: {
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
            },
            event: {
                select: {
                    id: true,
                    title: true,
                    location: true,
                    city: true,
                },
            },
            scanner: {
                select: {
                    id: true,
                    email: true,
                    name: true,
                },
            },
        },
    });

    const attendanceSummary = summarizeAttendance(rawBookings);
    const events = rawEvents.map((event) => serializeEvent(event, attendanceSummary));
    const scanStats = buildCheckinScanStats(rawScans);
    const recentWarnings = summarizeRecentWarnings(rawScans);

    return (
        <main className="section">
            <div className="container stack-lg">
                <div className="checkout-page__header">
                    <div>
                        <span className="eyebrow">Einlass</span>
                        <h1 className="section-header__title">Mobiler QR-Scanner</h1>
                        <p className="text-muted">
                            Öffne diese Seite auf deinem Handy, starte die Kamera und scanne
                            die Tickets direkt am Eingang.
                        </p>
                    </div>
                    <div className="flex wrap">
                        <Link href="/dashboard/bookings" className="btn btn-ghost">
                            Buchungen
                        </Link>
                        <Link href="/dashboard" className="btn btn-primary">
                            Dashboard
                        </Link>
                    </div>
                </div>

                <div className="stats">
                    <div className="stat">
                        <div className="stat__value">{scanStats.totalAttempts}</div>
                        <div className="stat__label">Scanversuche</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{scanStats.successfulScans}</div>
                        <div className="stat__label">Eingecheckt</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{scanStats.duplicateScans}</div>
                        <div className="stat__label">Bereits gescannt</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{scanStats.invalidScans}</div>
                        <div className="stat__label">Ungültig</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{scanStats.rejectedScans}</div>
                        <div className="stat__label">Abgewiesen</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{scanStats.uniqueBookings}</div>
                        <div className="stat__label">Einzigartige Tickets</div>
                    </div>
                </div>

                <div className="checkout-summary__note">
                    <span className="label">Export</span>
                    <p>
                        Die komplette Scan-Historie kannst du als CSV exportieren. Der Export
                        enthält Zeitpunkt, Status, Warnungen, Ticket, Event und Scanner.
                    </p>
                    <div className="flex wrap">
                        <Link href="/api/checkin/scans/export" className="btn btn-primary">
                            Scan-Historie exportieren
                        </Link>
                    </div>
                </div>

                <MobileCheckInScanner events={events} />

                {recentWarnings.length > 0 ? (
                    <section className="card stack-lg">
                        <div className="section-title-row">
                            <h2>Letzte Warnungen</h2>
                            <span className="text-muted">{recentWarnings.length} sichtbar</span>
                        </div>
                        <div className="stack">
                            {recentWarnings.map((scan) => (
                                <article key={scan.id} className={`analysis-card ${getScanTone(scan.status)}`}>
                                    <strong>{getScanStatusLabel(scan.status)}</strong>
                                    <p>{scan.warning}</p>
                                    <small className="text-muted">
                                        {new Date(scan.createdAt).toLocaleString("de-DE")} · Ticket {scan.bookingId}
                                    </small>
                                </article>
                            ))}
                        </div>
                    </section>
                ) : null}
            </div>
        </main>
    );
}
