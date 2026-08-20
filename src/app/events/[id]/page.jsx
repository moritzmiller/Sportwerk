import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import EventEngagement from "@/components/EventEngagement";
import EventShareActions from "@/components/EventShareActions";
import { getOptionalCurrentUser } from "@/lib/auth";
import { getCategory } from "@/lib/categories";
import { getEventRemainingCapacity, getEventStatusLabel } from "@/lib/event-management";
import { prisma } from "@/lib/prisma";
import {
    buildEventInsights,
    formatEventDateTime,
    formatEventPrice,
    serializeEvent,
} from "@/lib/events";
import { getAppUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

function timeout(ms) {
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error("EVENT_DETAIL_TIMEOUT")), ms);
    });
}

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
                    venue: {
                        select: {
                            id: true,
                            name: true,
                            address: true,
                            city: true,
                            notes: true,
                            verificationStatus: true,
                        },
                    },
                    organization: {
                        select: {
                            id: true,
                            name: true,
                            verificationStatus: true,
                        },
                    },
                    owner: {
                        select: {
                            id: true,
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
            error: error?.message ?? "EVENT_DETAIL_ERROR",
        };
    }
}

export async function generateMetadata({ params }) {
    const resolvedParams = await params;
    const id = Number(resolvedParams.id);

    if (Number.isNaN(id)) {
        return {};
    }

    const { event } = await loadEvent(id);

    if (!event) {
        return {};
    }

    return {
        title: `${event.title} | GateKeeper`,
        description: event.description ?? `${event.title} in ${event.city}`,
        openGraph: {
            title: event.title,
            description: event.description ?? `${event.title} in ${event.city}`,
            images: event.imageUrl ? [event.imageUrl] : [],
        },
        twitter: {
            card: event.imageUrl ? "summary_large_image" : "summary",
            title: event.title,
            description: event.description ?? `${event.title} in ${event.city}`,
            images: event.imageUrl ? [event.imageUrl] : [],
        },
    };
}

function UnavailableState({ id, error }) {
    return (
        <main className="section">
            <div className="container">
                <section className="card stack-lg max-narrow">
                    <div className="checkout-success__badge booking-status--failed">
                        Event nicht verfügbar
                    </div>
                    <h1 className="section-header__title">
                        Diese Eventseite kann gerade nicht geladen werden
                    </h1>
                    <p className="text-muted">
                        Die Route ist erreichbar, aber die Eventdaten konnten
                        nicht rechtzeitig geladen werden. Bitte versuche es in
                        einem Moment erneut.
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
            </div>
        </main>
    );
}

export default async function EventDetailPage({ params }) {
    const resolvedParams = await params;
    const id = Number(resolvedParams.id);

    if (Number.isNaN(id)) {
        notFound();
    }

    const currentUser = await getOptionalCurrentUser();
    const { event, error } = await loadEvent(id);

    if (!event) {
        return <UnavailableState id={id} error={error} />;
    }

    const data = serializeEvent(event);
    const isOwnerOrAdmin =
        currentUser?.role === "ADMIN" || currentUser?.id === event.ownerId;

    if (data.status === "DRAFT" && !isOwnerOrAdmin) {
        return <UnavailableState id={id} error="Entwurf nicht freigegeben" />;
    }

    const favorite = currentUser
        ? (await prisma.eventFavorite?.findUnique?.({
              where: {
                  userId_eventId: {
                      userId: currentUser.id,
                      eventId: event.id,
                  },
              },
          })) ?? null
        : null;

    const alert = currentUser
        ? (await prisma.eventAlert?.findFirst?.({
              where: {
                userId: currentUser.id,
                eventId: event.id,
              },
          })) ?? null
        : null;

    const cat = getCategory(data.category);
    const price = formatEventPrice(data.price);
    const insights = buildEventInsights(data);
    const remaining = getEventRemainingCapacity(data);
    const baseUrl = getAppUrl();
    const eventUrl = `${baseUrl}/events/${data.id}`;
    const icsUrl = `${baseUrl}/api/events/${data.id}/ics`;
    const venueHref = data.venueId ? `/venues/${data.venueId}` : null;
    const cityHref = data.city ? `/cities/${encodeURIComponent(data.city)}` : null;
    const isVerified =
        data.organizationVerificationStatus === "VERIFIED" ||
        data.venueVerificationStatus === "VERIFIED";

    return (
        <main>
            <section className="hero hero--event">
                <div className="hero__blob" aria-hidden="true" />
                <div className="container stack-lg">
                    <div className="event-hero__banner card">
                        {data.imageUrl ? (
                            <Image
                                src={data.imageUrl}
                                alt={data.title}
                                fill
                                className="event-hero__image"
                                sizes="100vw"
                                priority
                                unoptimized
                            />
                        ) : (
                            <div className="event-hero__fallback" aria-hidden="true" />
                        )}
                        <div className="event-hero__shade" aria-hidden="true" />
                        <div className="event-hero__banner-content">
                            <span className="eyebrow">
                                {cat.emoji} {cat.label}
                            </span>
                            <h1 className="hero__title">{data.title}</h1>
                            <p className="hero__subtitle">
                                {data.description ??
                                    "Dieses Event hat noch keine Beschreibung, aber die wichtigsten Eckdaten stehen bereit."}
                            </p>
                        </div>
                    </div>

                    <div className="event-detail-grid">
                        <article className="card stack-lg">
                            <div className="event-meta-grid">
                                <div className="event-meta-card">
                                    <span className="label">Status</span>
                                    <strong>{getEventStatusLabel(data.status)}</strong>
                                </div>
                                <div className="event-meta-card">
                                    <span className="label">Wann</span>
                                    <strong>{formatEventDateTime(data.startDate)}</strong>
                                </div>
                                <div className="event-meta-card">
                                    <span className="label">Wo</span>
                                    <strong>
                                        {data.location}, {data.city}
                                    </strong>
                                    <span className="text-muted">
                                        {data.venueName ? `Venue: ${data.venueName}` : "Kein fester Ort hinterlegt"}
                                    </span>
                                </div>
                                <div className="event-meta-card">
                                    <span className="label">Preis</span>
                                    <strong>{price.text}</strong>
                                </div>
                                <div className="event-meta-card">
                                    <span className="label">Tickets</span>
                                    <strong>
                                        {data.ticketTypes?.length > 1
                                            ? `${data.ticketTypes.length} Typen`
                                            : "1 Standardtyp"}
                                    </strong>
                                </div>
                                <div className="event-meta-card">
                                    <span className="label">Veranstalter</span>
                                    <strong>{data.ownerName ?? "GateKeeper Community"}</strong>
                                    <span className="text-muted">
                                        {data.organizationVerificationStatus === "VERIFIED"
                                            ? "Organisation verifiziert"
                                            : data.organizationVerificationStatus === "REJECTED"
                                                ? "Organisation abgelehnt"
                                                : "Organisation noch nicht verifiziert"}
                                    </span>
                                </div>
                                <div className="event-meta-card">
                                    <span className="label">Verfügbar</span>
                                    <strong>
                                        {remaining === null
                                            ? "Unbegrenzt"
                                            : `${remaining} Plätze frei`}
                                    </strong>
                                </div>
                            </div>

                            {(venueHref || cityHref) ? (
                                <div className="flex wrap">
                                    {venueHref ? (
                                        <Link href={venueHref} className="btn btn-ghost">
                                            Venue ansehen
                                        </Link>
                                    ) : null}
                                    {cityHref ? (
                                        <Link href={cityHref} className="btn btn-ghost">
                                            Mehr in {data.city}
                                        </Link>
                                    ) : null}
                                </div>
                            ) : null}

                            {isVerified ? (
                                <div className="trust-banner">
                                    <strong>Verifiziertes Angebot</strong>
                                    <span>
                                        Dieses Event ist mit einer verifizierten Organisation oder Venue verknüpft.
                                    </span>
                                </div>
                            ) : (
                                <div className="trust-banner trust-banner--warning">
                                    <strong>Noch nicht verifiziert</strong>
                                    <span>
                                        Die zugehörige Organisation oder Venue ist noch in Prüfung.
                                    </span>
                                </div>
                            )}

                            <EventEngagement
                                eventId={data.id}
                                isAuthenticated={Boolean(currentUser)}
                                initialFavorited={Boolean(favorite)}
                                initialAlerted={Boolean(alert)}
                            />

                            <div className="hero__actions">
                                {data.status === "PUBLISHED" && remaining !== 0 ? (
                                    <Link
                                        href={`/events/${data.id}/checkout`}
                                        className="btn btn-primary btn-lg"
                                    >
                                        Zur Buchung
                                    </Link>
                                ) : (
                                    <span className="btn btn-ghost btn-lg" aria-disabled="true">
                                        Nicht buchbar
                                    </span>
                                )}
                                <Link href="/#events" className="btn btn-ghost btn-lg">
                                    Zurück zur Liste
                                </Link>
                                {isOwnerOrAdmin ? (
                                    <Link
                                        href={`/dashboard/events/${data.id}/edit`}
                                        className="btn btn-ghost btn-lg"
                                    >
                                        Event bearbeiten
                                    </Link>
                                ) : null}
                            </div>
                        </article>

                        <aside className="event-hero__aside card stack">
                            <p className="eyebrow mt-0">Schnellcheck</p>
                            <h2 className="card__title">
                                Warum dieses Event interessant ist
                            </h2>
                            <ul className="detail-list">
                                {insights.map((insight) => (
                                    <li key={insight}>{insight}</li>
                                ))}
                            </ul>

                            {data.ticketTypes?.length > 0 ? (
                                <div className="stack-sm">
                                    <h3 className="card__title">Tickettypen</h3>
                                    <ul className="detail-list">
                                        {data.ticketTypes.map((ticketType) => (
                                            <li key={ticketType.id || ticketType.name}>
                                                <strong>{ticketType.name}</strong>{" "}
                                                -{" "}
                                                {ticketType.price === 0
                                                    ? "Kostenlos"
                                                    : ticketType.price.toLocaleString("de-DE", {
                                                          style: "currency",
                                                          currency: "EUR",
                                                      })}
                                                {ticketType.remainingQuota === null
                                                    ? ""
                                                    : `, ${ticketType.remainingQuota} frei`}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}

                            <div className="stack-sm">
                                <EventShareActions
                                    eventTitle={data.title}
                                    eventUrl={eventUrl}
                                    icsUrl={icsUrl}
                                />
                            </div>
                        </aside>
                    </div>
                </div>
            </section>
        </main>
    );
}
