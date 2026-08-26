import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import CheckoutForm from "@/components/CheckoutForm";
import { getOptionalCurrentUser } from "@/lib/auth";
import { verifyBookingAccessToken } from "@/lib/booking-access";
import { prisma } from "@/lib/prisma";
import { getCategory } from "@/lib/categories";
import {
    formatEventDateTime,
    formatEventPrice,
    serializeEvent,
} from "@/lib/events";
import {
    formatMoney,
    getPaymentMethodLabel,
    serializeBooking,
} from "@/lib/bookings";
import { formatManualPaymentDueDate, isManualPaymentMethod } from "@/lib/manual-payments";
import { capturePayPalOrder } from "@/lib/paypal";
import { retrieveStripeCheckoutSession } from "@/lib/stripe";
import { sendTicketEmail } from "@/lib/mail";
import { createIndividualTicketCode, createTicketCode } from "@/lib/tickets";
import {
    cancelBookingAndRelease,
    markBookingFailedAndRelease,
    markBookingPaid,
} from "@/lib/payment-state";

export const dynamic = "force-dynamic";

function getSearchValue(value) {
    if (Array.isArray(value)) return value[0];
    return value;
}

function timeout(ms) {
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error("EVENT_CHECKOUT_TIMEOUT")), ms);
    });
}

const BOOKING_RETURN_INCLUDE = {
    event: true,
    tickets: {
        orderBy: { ticketNumber: "asc" },
    },
};

async function loadEvent(id) {
    try {
        const event = await Promise.race([
            prisma.event.findUnique({
                where: { id },
                include: {
                    ticketTypes: {
                        orderBy: [
                            { isDefault: "desc" },
                            { sortOrder: "asc" },
                            { createdAt: "asc" },
                        ],
                    },
                    owner: {
                        select: {
                            name: true,
                            email: true,
                        },
                    },
                },
            }),
            timeout(5000),
        ]);

        return { event, error: null };
    } catch (error) {
        return {
            event: null,
            error: error?.message ?? "EVENT_CHECKOUT_ERROR",
        };
    }
}

function hasAuthenticatedBookingAccess(currentUser, booking) {
    return Boolean(currentUser?.id && booking?.attendeeId && currentUser.id === booking.attendeeId);
}

async function resolveReturnBooking(searchParams, currentUser) {
    const rawBookingId = getSearchValue(searchParams?.bookingId);
    const bookingId = rawBookingId ? String(rawBookingId) : null;
    const accessToken = getSearchValue(searchParams?.accessToken);
    const token = getSearchValue(searchParams?.token);
    const stripeSessionId = getSearchValue(searchParams?.stripe_session_id);
    const cancelled = getSearchValue(searchParams?.cancelled);

    if (!bookingId) return null;

    const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
            event: {
                include: {
                    owner: {
                        select: {
                            name: true,
                            email: true,
                        },
                    },
                },
            },
            tickets: {
                orderBy: { ticketNumber: "asc" },
            },
        },
    });

    if (!booking) return null;

    const hasAccess =
        verifyBookingAccessToken(accessToken, booking) ||
        hasAuthenticatedBookingAccess(currentUser, booking);
    const hasPayPalProof = Boolean(token && booking.paypalOrderId === token);
    const hasStripeProof = Boolean(
        stripeSessionId && booking.stripeCheckoutSessionId === stripeSessionId
    );

    if (!hasAccess && !hasPayPalProof && !hasStripeProof) {
        return null;
    }

    if (booking.status === "PAID" || booking.paymentProvider === "FREE") {
        return serializeBooking(booking);
    }

    if (cancelled === "1") {
        await prisma.$transaction(async (tx) => {
            const current = await tx.booking.findUnique({
                where: { id: booking.id },
            });

            if (current) {
                await cancelBookingAndRelease(tx, current, {
                    paypalStatus: "CANCELLED_BY_USER",
                });
            }
        });

        const updated = await prisma.booking.findUnique({
            where: { id: booking.id },
            include: BOOKING_RETURN_INCLUDE,
        });
        return serializeBooking(updated);
    }

    if (stripeSessionId) {
        if (
            booking.stripeCheckoutSessionId &&
            booking.stripeCheckoutSessionId !== stripeSessionId
        ) {
            await prisma.$transaction(async (tx) => {
                const current = await tx.booking.findUnique({
                    where: { id: booking.id },
                });

                if (current) {
                    await markBookingFailedAndRelease(tx, current, {
                        stripeStatus: "SESSION_MISMATCH",
                    });
                }
            });

            const failed = await prisma.booking.findUnique({
                where: { id: booking.id },
                include: BOOKING_RETURN_INCLUDE,
            });

            return serializeBooking(failed);
        }

        try {
            const session = await retrieveStripeCheckoutSession(stripeSessionId);
            const paymentIntent =
                typeof session.payment_intent === "string"
                    ? session.payment_intent
                    : session.payment_intent?.id ?? booking.stripePaymentIntentId;

            if (session.payment_status !== "paid") {
                return serializeBooking(booking);
            }

            const paidUpdate = await markBookingPaid(prisma, booking, {
                    paidAt: booking.paidAt ?? new Date(),
                    paymentProvider: "STRIPE",
                    stripeCheckoutSessionId: session.id,
                    stripePaymentIntentId: paymentIntent,
                    stripeStatus: session.payment_status ?? session.status ?? "paid",
                    providerPayload: session,
            });

            if (paidUpdate.action !== "paid") {
                const current = await prisma.booking.findUnique({
                    where: { id: booking.id },
                    include: BOOKING_RETURN_INCLUDE,
                });
                return serializeBooking(current);
            }

            const updatedBooking = await prisma.booking.findUnique({
                where: { id: booking.id },
                include: BOOKING_RETURN_INCLUDE,
            });
            sendTicketEmail(updatedBooking).catch((err) =>
                console.error("Mail-Fehler:", err)
            );
        } catch (error) {
            await prisma.$transaction(async (tx) => {
                const current = await tx.booking.findUnique({
                    where: { id: booking.id },
                });

                if (current) {
                    await markBookingFailedAndRelease(tx, current, {
                        stripeCheckoutSessionId: stripeSessionId,
                        stripeStatus: "CHECKOUT_VERIFY_FAILED",
                        providerPayload: {
                            error: error?.message ?? "Stripe checkout verify failed",
                        },
                    });
                }
            });
        }

        const updated = await prisma.booking.findUnique({
            where: { id: booking.id },
            include: BOOKING_RETURN_INCLUDE,
        });

        return serializeBooking(updated);
    }

    if (!token) {
        return serializeBooking(booking);
    }

    if (booking.status !== "AWAITING_PAYMENT") {
        return serializeBooking(booking);
    }

    if (booking.paypalOrderId && booking.paypalOrderId !== token) {
        await prisma.$transaction(async (tx) => {
            const current = await tx.booking.findUnique({
                where: { id: booking.id },
            });

            if (current) {
                await markBookingFailedAndRelease(tx, current, {
                    paypalStatus: "TOKEN_MISMATCH",
                });
            }
        });

        const failed = await prisma.booking.findUnique({
            where: { id: booking.id },
            include: BOOKING_RETURN_INCLUDE,
        });

        return serializeBooking(failed);
    }

    try {
        const capture = await capturePayPalOrder(token);
        const paypalCapture =
            capture?.purchase_units?.[0]?.payments?.captures?.[0] ?? null;

        const paidUpdate = await markBookingPaid(prisma, booking, {
                paidAt: booking.paidAt ?? new Date(),
                paypalOrderId: token,
                paypalCaptureId: paypalCapture?.id ?? booking.paypalCaptureId,
                paypalStatus: capture?.status ?? "COMPLETED",
                providerPayload: capture,
        });

        if (paidUpdate.action !== "paid") {
            const current = await prisma.booking.findUnique({
                where: { id: booking.id },
                include: BOOKING_RETURN_INCLUDE,
            });
            return serializeBooking(current);
        }

        const updatedBooking = await prisma.booking.findUnique({
            where: { id: booking.id },
            include: BOOKING_RETURN_INCLUDE,
        });
        sendTicketEmail(updatedBooking).catch((err) =>
            console.error("Mail-Fehler:", err)
        );
    } catch (error) {
        await prisma.$transaction(async (tx) => {
            const current = await tx.booking.findUnique({
                where: { id: booking.id },
            });

            if (current) {
                await markBookingFailedAndRelease(tx, current, {
                    paypalOrderId: token,
                    paypalStatus: "CAPTURE_FAILED",
                    providerPayload: {
                        error: error?.message ?? "Capture failed",
                    },
                });
            }
        });
    }

    const updated = await prisma.booking.findUnique({
        where: { id: booking.id },
        include: BOOKING_RETURN_INCLUDE,
    });

    return serializeBooking(updated);
}

async function SuccessState({ booking }) {
    const ticketRecords = Array.isArray(booking.tickets) && booking.tickets.length > 0
        ? booking.tickets
        : [{ id: booking.id, ticketNumber: 1, legacy: true }];
    const ticketCodes = await Promise.all(
        ticketRecords.map(async (ticket) => {
            const code = ticket.legacy
                ? createTicketCode(booking.id)
                : createIndividualTicketCode(ticket.id);
            return {
                ...ticket,
                code,
                qrCodeDataUrl: await QRCode.toDataURL(code),
            };
        })
    );
    const primaryTicket = ticketCodes[0];

    return (
        <section className="card stack-lg">
            <div className="checkout-success__badge">Buchung abgeschlossen</div>
            <h2 className="card__title">Deine Buchung ist bestätigt</h2>
            <p className="text-muted">
                Die Zahlung wurde verarbeitet, dein Ticket ist gesichert und wurde dir per E-Mail zugestellt.
            </p>

            <div className="ticket-visual card">
                <div className="ticket-visual__main">
                    <div className="ticket-visual__header">
                        <span className="ticket-visual__eyebrow">E-Ticket / Eintrittskarte</span>
                        <span className="ticket-visual__id"># {booking.id}</span>
                    </div>

                    <h3 className="ticket-visual__title">{booking.event?.title}</h3>

                    <div className="ticket-visual__details">
                        <div>
                            <span className="label">Datum & Uhrzeit</span>
                            <p>
                                {booking.event?.startDate
                                    ? new Date(booking.event.startDate).toLocaleString("de-DE", {
                                          weekday: "long",
                                          year: "numeric",
                                          month: "long",
                                          day: "numeric",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                      })
                                    : "Siehe Eventseite"}
                            </p>
                        </div>
                        <div>
                            <span className="label">Location</span>
                            <p>
                                {booking.event?.location}, {booking.event?.city}
                            </p>
                        </div>
                    </div>

                    <div className="ticket-visual__footer">
                        <div>
                            <span className="label">Inhaber</span>
                            <p>{booking.purchaserName || "Ticketinhaber"}</p>
                        </div>
                        <div>
                            <span className="label">Anzahl</span>
                            <p>
                                <strong>{booking.quantity}x</strong> Einlass
                            </p>
                        </div>
                    </div>
                </div>

                <div className="ticket-visual__stub">
                    <div className="ticket-visual__stub-content">
                        <span className="label">Einlass-Scan</span>
                        <div className="ticket-visual__barcode-placeholder">
                            <Image
                                src={primaryTicket.qrCodeDataUrl}
                                alt="Ticket QR Code"
                                width={110}
                                height={110}
                                unoptimized
                            />
                            <strong style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>
                                ID: {booking.id}
                            </strong>
                            <span style={{ fontSize: "0.65rem", color: "#64748b", textAlign: "center", wordBreak: "break-all" }}>
                                Code: {primaryTicket.code}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {ticketCodes.length > 1 ? (
                <div className="event-grid">
                    {ticketCodes.map((ticket) => (
                        <article key={ticket.id} className="card stack">
                            <span className="label">Ticket #{ticket.ticketNumber}</span>
                            <Image
                                src={ticket.qrCodeDataUrl}
                                alt={`Ticket ${ticket.ticketNumber} QR Code`}
                                width={110}
                                height={110}
                                unoptimized
                            />
                            <strong>{ticket.ticketTypeName ?? booking.ticketTypeName ?? "Standard"}</strong>
                        </article>
                    ))}
                </div>
            ) : null}

            <div className="flex wrap">
                <Link href={`/events/${booking.event?.id ?? booking.eventId}/ics`} className="btn btn-ghost">
                    Zum Kalender
                </Link>
                <Link href={`/events/${booking.event?.id ?? booking.eventId}`} className="btn btn-ghost">
                    Event ansehen
                </Link>
            </div>
        </section>
    );
}

function CancelState({ eventId }) {
    return (
        <section className="card stack-lg">
            <div className="checkout-success__badge booking-status--cancelled">
                Zahlung abgebrochen
            </div>
            <h2 className="card__title">Die Buchung wurde nicht abgeschlossen</h2>
            <p className="text-muted">
                Du kannst die Buchung jederzeit erneut starten.
            </p>

            <div className="flex wrap">
                <Link href={`/events/${eventId}/checkout`} className="btn btn-primary">
                    Noch einmal versuchen
                </Link>
                <Link href={`/events/${eventId}`} className="btn btn-ghost">
                    Zur Eventseite
                </Link>
            </div>
        </section>
    );
}

function FailureState({ eventId }) {
    return (
        <section className="card stack-lg">
            <div className="checkout-success__badge booking-status--failed">
                Zahlung fehlgeschlagen
            </div>
            <h2 className="card__title">Die Buchung konnte nicht abgeschlossen werden</h2>
            <p className="text-muted">
                Du kannst den Vorgang einfach erneut starten.
            </p>

            <div className="flex wrap">
                <Link href={`/events/${eventId}/checkout`} className="btn btn-primary">
                    Erneut versuchen
                </Link>
                <Link href={`/events/${eventId}`} className="btn btn-ghost">
                    Zur Eventseite
                </Link>
            </div>
        </section>
    );
}

function ClosedState({ eventId, status }) {
    return (
        <section className="card stack-lg">
            <div className="checkout-success__badge booking-status--failed">
                {status === "CANCELLED" ? "Event abgesagt" : "Nicht buchbar"}
            </div>
            <h2 className="card__title">Dieses Event ist aktuell nicht buchbar</h2>
            <p className="text-muted">
                Entwurf, Verschiebung oder ausverkaufte Plätze verhindern die Buchung derzeit.
            </p>

            <div className="flex wrap">
                <Link href={`/events/${eventId}`} className="btn btn-primary">
                    Zur Eventseite
                </Link>
                <Link href="/" className="btn btn-ghost">
                    Zur Startseite
                </Link>
            </div>
        </section>
    );
}

function PendingState({ booking, eventId }) {
    const providerLabel = getPaymentMethodLabel(booking.paymentMethod);
    const approvalUrl = booking.paypalApprovalUrl ?? booking.stripeCheckoutUrl ?? null;

    return (
        <section className="card stack-lg">
            <div className="checkout-success__badge booking-status--pending">
                Zahlung vorbereitet
            </div>
            <h2 className="card__title">Deine Buchung wartet auf {providerLabel}</h2>
            <p className="text-muted">
                Es gibt bereits eine vorbereitete Buchung für diese E-Mail.
                Du kannst direkt zur bestaetigten Zahlung weitergehen.
            </p>

            <div className="checkout-success__summary">
                <div>
                    <span className="label">Buchung</span>
                    <p>{booking.id}</p>
                </div>
                <div>
                    <span className="label">Gesamt</span>
                    <p>{formatMoney(booking.totalAmount)}</p>
                </div>
                <div>
                    <span className="label">Tickets</span>
                    <p>{booking.quantity}</p>
                </div>
            </div>

            <div className="flex wrap">
                {approvalUrl ? (
                    <a href={approvalUrl} className="btn btn-primary">
                        Zu {providerLabel}
                    </a>
                ) : null}
                <Link href={`/events/${eventId}/checkout`} className="btn btn-ghost">
                    Neu starten
                </Link>
            </div>
        </section>
    );
}

function ManualState({ booking, eventId }) {
    const dueDate = formatManualPaymentDueDate(booking.createdAt);

    const bankHolder =
        process.env.BANK_TRANSFER_ACCOUNT_HOLDER || "GateKeeper";
    const bankIban =
        process.env.BANK_TRANSFER_IBAN || "Noch nicht konfiguriert";
    const bankBic =
        process.env.BANK_TRANSFER_BIC || "Noch nicht konfiguriert";

    return (
        <section className="card stack-lg">
            <div className="checkout-success__badge booking-status--pending">
                Zahlung ausstehend
            </div>
            <h2 className="card__title">
                Deine Buchung wartet auf {getPaymentMethodLabel(booking.paymentMethod)}
            </h2>
            <p className="text-muted">
                Die Buchung ist gespeichert. Nutze die Referenz unten für die
                Zahlung und behalte die Bestellmail im Blick.
            </p>

            <div className="checkout-success__summary">
                <div>
                    <span className="label">Buchung</span>
                    <p>{booking.id}</p>
                </div>
                <div>
                    <span className="label">Referenz</span>
                    <p>{booking.paymentReference}</p>
                </div>
                <div>
                    <span className="label">Fällig bis</span>
                    <p>{dueDate}</p>
                </div>
            </div>

            <div className="checkout-summary__note">
                <span className="label">
                    {booking.paymentMethod === "BANK_TRANSFER"
                        ? "Banküberweisung"
                        : "Rechnung"}
                </span>
                {booking.paymentMethod === "BANK_TRANSFER" ? (
                    <p>
                        Kontoinhaber: {bankHolder}
                        <br />
                        IBAN: {bankIban}
                        <br />
                        BIC: {bankBic}
                        <br />
                        Verwendungszweck: {booking.paymentReference}
                    </p>
                ) : (
                    <p>
                        Die Rechnung wurde im Konto gespeichert. Bitte
                        überweise den offenen Betrag mit der Referenz{" "}
                        {booking.paymentReference}.
                    </p>
                )}
            </div>

            <div className="flex wrap">
                <Link href={`/events/${eventId}`} className="btn btn-ghost">
                    Zur Eventseite
                </Link>
                <Link href="/dashboard/orders" className="btn btn-primary">
                    Bestellungen ansehen
                </Link>
            </div>
        </section>
    );
}

function UnavailableState({ id, error }) {
    return (
        <section className="card stack-lg max-narrow">
            <div className="checkout-success__badge booking-status--failed">
                Checkout nicht verfügbar
            </div>
            <h1 className="section-header__title">
                Diese Buchungsseite kann gerade nicht geladen werden
            </h1>
            <p className="text-muted">
                Die Route ist erreichbar, aber die Eventdaten konnten nicht
                rechtzeitig geladen werden.
            </p>
            <p className="text-muted">
                Fehler: {error || "unbekannt"} | Event-ID: {id}
            </p>
            <div className="flex wrap">
                <Link href="/" className="btn btn-primary">
                    Zur Startseite
                </Link>
                <Link href="/#events" className="btn btn-ghost">
                    Events durchsuchen
                </Link>
            </div>
        </section>
    );
}

export default async function EventCheckoutPage({ params, searchParams }) {
    const resolvedParams = await params;
    const resolvedSearchParams = await searchParams;
    const id = Number(resolvedParams.id);

    if (Number.isNaN(id)) {
        notFound();
    }

    const { event, error } = await loadEvent(id);

    if (!event) {
        return (
            <main className="section">
                <div className="container">
                    <UnavailableState id={id} error={error} />
                </div>
            </main>
        );
    }

    const currentUser = await getOptionalCurrentUser();
    const data = serializeEvent(event);
    const cat = getCategory(data.category);
    const price = formatEventPrice(data.price);

    const booking = await resolveReturnBooking(resolvedSearchParams, currentUser);

    const isSuccess =
        booking &&
        (booking.status === "PAID" || booking.paymentProvider === "FREE");
    const isCancelled = booking?.status === "CANCELLED";
    const isFailed = booking?.status === "FAILED";
    const isPending =
        booking?.status === "AWAITING_PAYMENT" &&
        (booking?.paypalApprovalUrl || booking?.stripeCheckoutUrl);
    const isManualPending =
        booking?.status === "AWAITING_PAYMENT" &&
        booking?.paymentMethod &&
        isManualPaymentMethod(booking.paymentMethod);
    const canBookEvent =
        data.status === "PUBLISHED" &&
        (!data.capacity || Number(data.soldTickets || 0) < Number(data.capacity || 0));

    return (
        <main className="section">
            <div className="container checkout-page">
                <div className="checkout-page__header">
                    <div>
                        <span className="eyebrow">
                            {cat.emoji} {cat.label}
                        </span>
                        <h1 className="section-header__title">{data.title}</h1>
                        <p className="text-muted">
                            Finaler Check vor der Buchung. Je nach Auswahl
                            wird die Zahlung direkt online abgewickelt oder als
                            manuelle Zahlung gespeichert.
                        </p>
                    </div>
                    <Link href={`/events/${data.id}`} className="btn btn-ghost">
                        Zur Eventseite
                    </Link>
                </div>

                <div className="checkout-layout">
                    {isSuccess ? (
                        <SuccessState booking={booking} />
                    ) : isCancelled ? (
                        <CancelState eventId={data.id} />
                    ) : isFailed ? (
                        <FailureState eventId={data.id} />
                    ) : isManualPending ? (
                        <ManualState booking={booking} eventId={data.id} />
                    ) : isPending ? (
                        <PendingState booking={booking} eventId={data.id} />
                    ) : !booking && !canBookEvent ? (
                        <ClosedState eventId={data.id} status={data.status} />
                    ) : (
                        <CheckoutForm event={data} initialCustomer={currentUser} />
                    )}

                    <aside className="card stack checkout-summary">
                        <div className="checkout-summary__banner">
                            <span className="label">Dein Event</span>
                            <strong>{data.title}</strong>
                            <p>
                                {data.location}, {data.city}
                            </p>
                        </div>

                        <div className="summary-list">
                            <div>
                                <span className="label">Wann</span>
                                <strong>{formatEventDateTime(data.startDate)}</strong>
                            </div>
                            <div>
                                <span className="label">Preis pro Ticket</span>
                                <strong>{price.text}</strong>
                            </div>
                            <div>
                                <span className="label">Veranstalter</span>
                                <strong>{data.ownerName ?? "GateKeeper Community"}</strong>
                            </div>
                            <div>
                                <span className="label">Zahlung</span>
                                <strong>
                                    {booking?.paymentMethod
                                        ? getPaymentMethodLabel(booking.paymentMethod)
                                        : getPaymentMethodLabel(data.allowedPaymentMethods?.[0] ?? "PAYPAL")}
                                </strong>
                            </div>
                        </div>

                        <div className="checkout-summary__note">
                            <span className="label">Hinweis</span>
                            <p>
                                Online-Zahlungen werden sofort verarbeitet.
                                Manuelle Zahlungen bleiben offen sichtbar und
                                koennen vom Veranstalter bestaetigt werden.
                            </p>
                        </div>
                    </aside>
                </div>
            </div>
        </main>
    );
}
