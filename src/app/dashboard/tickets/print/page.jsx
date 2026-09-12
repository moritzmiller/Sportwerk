import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import { redirect } from "next/navigation";

import PrintPageButton from "@/components/PrintPageButton";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney, serializeBooking } from "@/lib/bookings";
import { getBookingAccessWhere, getEventAccessWhere } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { createTicketCode } from "@/lib/tickets";

export const dynamic = "force-dynamic";

function toText(value) {
    return String(value ?? "").trim().toLowerCase();
}

function formatDateTime(value) {
    if (!value) return "Termin offen";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Termin offen";

    return date.toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function matchesSearch(booking, search) {
    const q = toText(search);
    if (!q) return true;

    return [
        booking.id,
        booking.paymentReference,
        booking.purchaserName,
        booking.purchaserEmail,
        booking.ticketTypeName,
        booking.event?.title,
        booking.event?.location,
        booking.event?.city,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
}

async function buildPrintableTickets(bookings) {
    return Promise.all(
        bookings.map(async (booking) => {
            const ticketCode = createTicketCode(booking.id);
            const qrCode = await QRCode.toDataURL(ticketCode, {
                margin: 1,
                width: 220,
            });

            return {
                booking,
                ticketCode,
                qrCode,
            };
        })
    );
}

export default async function PhysicalTicketPrintPage({ searchParams }) {
    const user = await getCurrentUser();

    if (!user) redirect("/auth");
    if (user.role === "VISITOR") redirect("/dashboard");

    const resolvedSearchParams = await searchParams;
    const eventId = typeof resolvedSearchParams?.eventId === "string" ? resolvedSearchParams.eventId : "all";
    const search = typeof resolvedSearchParams?.search === "string" ? resolvedSearchParams.search : "";

    const [events, rawBookings] = await Promise.all([
        prisma.event.findMany({
            where: getEventAccessWhere(user),
            orderBy: { startDate: "asc" },
            select: {
                id: true,
                title: true,
                startDate: true,
            },
        }),
        prisma.booking.findMany({
            where: {
                ...getBookingAccessWhere(user),
                status: "PAID",
                ...(eventId !== "all" ? { eventId } : {}),
            },
            orderBy: [{ event: { startDate: "asc" } }, { createdAt: "asc" }],
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
    ]);

    const bookings = rawBookings.map(serializeBooking).filter((booking) => matchesSearch(booking, search));
    const tickets = await buildPrintableTickets(bookings);
    const totalTicketCount = bookings.reduce((sum, booking) => sum + Number(booking.quantity || 0), 0);
    const selectedEvent = events.find((event) => event.id === eventId) ?? null;
    const bocaParams = new URLSearchParams();
    bocaParams.set("eventId", eventId);
    if (search) bocaParams.set("search", search);
    const bocaDownloadHref = `/api/tickets/boca?${bocaParams.toString()}`;

    return (
        <main className="section physical-ticket-page">
            <div className="container stack-lg">
                <div className="checkout-page__header print-hidden">
                    <div>
                        <span className="eyebrow">Physische Tickets</span>
                        <h1 className="section-header__title">Tickets drucken</h1>
                        <p className="text-muted">
                            Drucke bezahlte Buchungen als Einlasskarten mit signiertem QR-Code.
                        </p>
                    </div>
                    <div className="flex wrap">
                        <Link href="/dashboard/bookings" className="btn btn-ghost">
                            Buchungen
                        </Link>
                        <Link href="/dashboard/check-in" className="btn btn-ghost">
                            Check-in
                        </Link>
                        <PrintPageButton>Druckdialog öffnen</PrintPageButton>
                    </div>
                </div>

                <form className="booking-toolbar card print-hidden" method="get">
                    <div className="field">
                        <label className="label" htmlFor="search">
                            Suchen
                        </label>
                        <input
                            id="search"
                            name="search"
                            className="input"
                            placeholder="Name, E-Mail, Buchung, Referenz oder Event"
                            defaultValue={search}
                        />
                    </div>

                    <div className="field">
                        <label className="label" htmlFor="eventId">
                            Event
                        </label>
                        <select id="eventId" name="eventId" className="select" defaultValue={eventId}>
                            <option value="all">Alle Events</option>
                            {events.map((event) => (
                                <option key={event.id} value={event.id}>
                                    {event.title}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="booking-toolbar__actions">
                        <button type="submit" className="btn btn-primary">
                            Filtern
                        </button>
                        <Link href="/dashboard/tickets/print" className="btn btn-ghost">
                            Zurücksetzen
                        </Link>
                    </div>
                </form>

                <div className="stats print-hidden">
                    <div className="stat">
                        <div className="stat__value">{bookings.length}</div>
                        <div className="stat__label">Buchungen</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{totalTicketCount}</div>
                        <div className="stat__label">Tickets</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">
                            {formatMoney(bookings.reduce((sum, booking) => sum + Number(booking.totalAmount || 0), 0))}
                        </div>
                        <div className="stat__label">Bezahlter Wert</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{selectedEvent ? "1" : events.length}</div>
                        <div className="stat__label">Event-Auswahl</div>
                    </div>
                </div>

                <section className="boca-print-panel card print-hidden" aria-labelledby="boca-print-title">
                    <div>
                        <span className="eyebrow">BOCA Drucker</span>
                        <h2 id="boca-print-title">Spezielle Tickets als BOCA-Datei</h2>
                        <p className="text-muted">
                            Lade die gefilterten bezahlten Tickets als FGL-Rohdaten fuer BOCA-Ticketdrucker herunter.
                        </p>
                    </div>
                    <div className="boca-print-panel__summary">
                        <strong>{totalTicketCount}</strong>
                        <span>Ticket-Drucksaetze</span>
                    </div>
                    <a
                        className={`btn btn-primary ${totalTicketCount === 0 ? "is-disabled" : ""}`}
                        href={bocaDownloadHref}
                        aria-disabled={totalTicketCount === 0}
                    >
                        BOCA-Datei herunterladen
                    </a>
                </section>

                {tickets.length === 0 ? (
                    <div className="empty-state print-hidden">
                        <div className="empty-state__icon">DR</div>
                        <p>Keine bezahlten Buchungen für diese Auswahl gefunden.</p>
                    </div>
                ) : (
                    <section className="physical-ticket-sheet" aria-label="Druckbare physische Tickets">
                        {tickets.map(({ booking, ticketCode, qrCode }) => (
                            <article key={booking.id} className="physical-ticket">
                                <div className="physical-ticket__main">
                                    <div className="physical-ticket__kicker">GateKeeper Einlasskarte</div>
                                    <h2>{booking.event?.title ?? "Unbekanntes Event"}</h2>
                                    <div className="physical-ticket__meta">
                                        <span>{formatDateTime(booking.event?.startDate)}</span>
                                        <span>
                                            {booking.event?.location ?? "Ort offen"}
                                            {booking.event?.city ? `, ${booking.event.city}` : ""}
                                        </span>
                                    </div>
                                    <div className="physical-ticket__holder">
                                        <span className="label">Ticketinhaber</span>
                                        <strong>{booking.purchaserName}</strong>
                                        <span>{booking.purchaserEmail}</span>
                                    </div>
                                    <div className="physical-ticket__facts">
                                        <div>
                                            <span className="label">Anzahl</span>
                                            <strong>{booking.quantity} Ticket(s)</strong>
                                        </div>
                                        <div>
                                            <span className="label">Tickettyp</span>
                                            <strong>{booking.ticketTypeName ?? "Standard"}</strong>
                                        </div>
                                        <div>
                                            <span className="label">Referenz</span>
                                            <strong>{booking.paymentReference ?? booking.id}</strong>
                                        </div>
                                    </div>
                                </div>
                                <div className="physical-ticket__qr">
                                    <Image
                                        src={qrCode}
                                        alt={`QR-Code fuer Buchung ${booking.id}`}
                                        width={112}
                                        height={112}
                                        unoptimized
                                    />
                                    <span>{ticketCode}</span>
                                </div>
                            </article>
                        ))}
                    </section>
                )}
            </div>
        </main>
    );
}
