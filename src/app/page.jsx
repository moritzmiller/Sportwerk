import Link from "next/link";

import EventDiscovery from "@/components/EventDiscovery";
import {
    buildDiscoveryFallbackWhere,
    buildDiscoveryOrderBy,
    buildDiscoveryPageHref,
    buildDiscoveryWhere,
    getDiscoveryPageSize,
    getDiscoveryProfileSummary,
    getPersonalizedCandidateLimit,
    normalizeDiscoveryParams,
} from "@/lib/discovery";
import { getCurrentUser } from "@/lib/auth";
import { getCategory } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import {
    buildRecommendationProfile,
    rankRecommendedEvents,
} from "@/lib/recommendations";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "GateKeeper - Events in Dresden",
    description:
        "Entdecke Konzerte, Partys, Kultur und Sport in Dresden - sortiert nach Datum, Beliebtheit und Preis.",
};

function timeout(ms) {
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error("EVENT_QUERY_TIMEOUT")), ms);
    });
}

function isEventQueryTimeout(error) {
    return error?.message === "EVENT_QUERY_TIMEOUT";
}

async function withEventQueryTimeout(query, ms) {
    try {
        return {
            ok: true,
            value: await Promise.race([query, timeout(ms)]),
            timedOut: false,
            error: null,
        };
    } catch (error) {
        return {
            ok: false,
            value: null,
            timedOut: isEventQueryTimeout(error),
            error,
        };
    }
}

const EVENT_DISCOVERY_SELECT = {
    id: true,
    title: true,
    description: true,
    imageUrl: true,
    location: true,
    city: true,
    category: true,
    status: true,
    startDate: true,
    price: true,
    capacity: true,
    soldTickets: true,
    viewCount: true,
    organization: {
        select: {
            verificationStatus: true,
        },
    },
    venue: {
        select: {
            verificationStatus: true,
        },
    },
};

function serializeEvent(e) {
    return {
        id: e.id,
        title: e.title,
        description: e.description,
        imageUrl: e.imageUrl,
        location: e.location,
        city: e.city,
        category: e.category,
        status: e.status ?? "PUBLISHED",
        startDate: e.startDate.toISOString(),
        price: e.price,
        capacity: e.capacity ?? null,
        soldTickets: e.soldTickets ?? 0,
        viewCount: e.viewCount ?? 0,
        organizationVerificationStatus: e.organization?.verificationStatus ?? null,
        venueVerificationStatus: e.venue?.verificationStatus ?? null,
    };
}

function formatCompactDate(value) {
    return new Date(value).toLocaleDateString("de-DE", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
    });
}

function formatCompactTime(value) {
    return new Date(value).toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatCompactPrice(value) {
    const price = Number(value || 0);
    if (price <= 0) return "Kostenlos";
    return `${price.toFixed(2).replace(".", ",")} EUR`;
}

function buildIntentLinks(filters) {
    return [
        {
            icon: "⚡",
            label: "Heute am Start",
            text: "jetzt raus",
            href: buildDiscoveryPageHref("/", { ...filters, time: "today", sort: "for-you" }, 1),
        },
        {
            icon: "🔥",
            label: "Nischen & Geheimtipps",
            text: "nicht jeder kennt's",
            href: buildDiscoveryPageHref("/", { ...filters, sort: "for-you" }, 1),
        },
        {
            icon: "🏆",
            label: "Sport & Action",
            text: "mitmachen statt zusehen",
            href: buildDiscoveryPageHref("/", { ...filters, category: "SPORT", sort: "for-you" }, 1),
        },
    ];
}

function getBoardLane(index) {
    const labels = ["Könnte passen", "Neu im Blick", "Bald los", "Viele schauen hin"];

    return {
        label: labels[index % labels.length],
    };
}

function isTodayEvent(event) {
    const date = new Date(event.startDate);
    const now = new Date();

    return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
    );
}

function getSpot(event) {
    return event.location || event.city || "Dresden";
}

function getLiveSignal(event) {
    if (event.capacity && event.soldTickets) {
        const remaining = Number(event.capacity) - Number(event.soldTickets);
        if (remaining > 0 && remaining <= 12) return `nur noch ${remaining} Plätze`;
    }

    if (Number(event.viewCount || 0) > 0) return `${event.viewCount} schauen hin`;

    return "neu im Feed";
}

async function loadDiscoveryProfile(user) {
    if (!user) {
        return buildRecommendationProfile();
    }

    try {
        const [views, favorites, bookings, alerts, preferences] = await Promise.all([
            Promise.race([
                prisma.eventView.findMany({
                    where: { userId: user.id },
                    orderBy: { viewedAt: "desc" },
                    take: 40,
                    include: {
                        event: {
                            select: {
                                category: true,
                                city: true,
                                location: true,
                                price: true,
                            },
                        },
                    },
                }),
                timeout(3000),
            ]),
            Promise.race([
                prisma.eventFavorite.findMany({
                    where: { userId: user.id },
                    orderBy: { createdAt: "desc" },
                    take: 40,
                    include: {
                        event: {
                            select: {
                                category: true,
                                city: true,
                                location: true,
                                price: true,
                            },
                        },
                    },
                }),
                timeout(3000),
            ]),
            Promise.race([
                prisma.booking.findMany({
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
                    take: 40,
                    include: {
                        event: {
                            select: {
                                category: true,
                                city: true,
                                location: true,
                                price: true,
                            },
                        },
                    },
                }),
                timeout(3000),
            ]),
            Promise.race([
                prisma.eventAlert.findMany({
                    where: { userId: user.id, active: true },
                    orderBy: { createdAt: "desc" },
                    take: 30,
                    select: {
                        category: true,
                        city: true,
                    },
                }),
                timeout(3000),
            ]),
            Promise.race([
                prisma.userEventPreference?.findMany
                    ? prisma.userEventPreference.findMany({
                        where: { userId: user.id },
                        orderBy: [{ weight: "desc" }, { updatedAt: "desc" }],
                        take: 120,
                        select: {
                            scope: true,
                            target: true,
                            weight: true,
                        },
                    })
                    : [],
                timeout(3000),
            ]),
        ]);

        return buildRecommendationProfile({ user, views, favorites, bookings, alerts, preferences });
    } catch {
        return buildRecommendationProfile({ user });
    }
}

async function loadEvents(filters, profile) {
    const now = new Date();
    const where = buildDiscoveryWhere(filters, now);
    const orderBy = buildDiscoveryOrderBy(filters.sort);
    const pageSize = getDiscoveryPageSize();
    const skip = (filters.page - 1) * pageSize;
    const personalized = filters.sort === "for-you";
    const take = personalized
        ? Math.max(pageSize, Math.min(getPersonalizedCandidateLimit(), skip + pageSize))
        : pageSize;

    const [countResult, eventResult] = await Promise.all([
        withEventQueryTimeout(prisma.event.count({ where }), 4500),
        withEventQueryTimeout(
            prisma.event.findMany({
                where,
                orderBy,
                skip: personalized ? 0 : skip,
                take,
                select: EVENT_DISCOVERY_SELECT,
            }),
            9000
        ),
    ]);

    if (!eventResult.ok) {
        return {
            events: [],
            totalCount: 0,
            pageSize: getDiscoveryPageSize(),
            fallback:
                eventResult.timedOut
                    ? "Die Eventsuche braucht gerade zu lange. Bitte lade die Seite gleich erneut."
                    : "Die Eventdaten konnten gerade nicht geladen werden. Die Seite bleibt trotzdem erreichbar.",
            relaxedTime: false,
        };
    }

    const totalCount = countResult.ok ? countResult.value : eventResult.value.length;

    if (totalCount === 0) {
        const fallbackWhere = buildDiscoveryFallbackWhere(filters);
        const [fallbackCountResult, fallbackEventsResult] = await Promise.all([
            withEventQueryTimeout(prisma.event.count({ where: fallbackWhere }), 4500),
            withEventQueryTimeout(
                prisma.event.findMany({
                    where: fallbackWhere,
                    orderBy: [{ startDate: "desc" }, { viewCount: "desc" }],
                    take,
                    select: EVENT_DISCOVERY_SELECT,
                }),
                9000
            ),
        ]);

        if (!fallbackEventsResult.ok) {
            return {
                events: [],
                totalCount: 0,
                pageSize,
                fallback:
                    fallbackEventsResult.timedOut
                        ? "Die Eventsuche braucht gerade zu lange. Bitte lade die Seite gleich erneut."
                        : "Die Eventdaten konnten gerade nicht geladen werden. Die Seite bleibt trotzdem erreichbar.",
                relaxedTime: false,
            };
        }

        const fallbackCount = fallbackCountResult.ok
            ? fallbackCountResult.value
            : fallbackEventsResult.value.length;
        const fallbackEvents = fallbackEventsResult.value.map(serializeEvent);
        const rankedFallbackEvents = personalized
            ? rankRecommendedEvents(fallbackEvents, profile, now).slice(0, pageSize)
            : fallbackEvents.slice(0, pageSize);

        return {
            events: rankedFallbackEvents,
            totalCount: rankedFallbackEvents.length,
            pageSize,
            fallback: fallbackCount > 0
                ? "Aktuell gibt es keine kommenden Treffer. Wir zeigen dir zuletzt veröffentlichte Events."
                : null,
            relaxedTime: fallbackCount > 0,
        };
    }

    const events = eventResult.value.map(serializeEvent);
    const rankedEvents = personalized
        ? rankRecommendedEvents(events, profile, now).slice(skip, skip + pageSize)
        : events;

    return {
        events: rankedEvents,
        totalCount,
        pageSize,
        fallback: countResult.timedOut
            ? "Die Trefferzahl konnte gerade nicht geladen werden. Die angezeigten Events sind aktuell."
            : null,
        relaxedTime: false,
    };
}

export default async function HomePage({ searchParams }) {
    const filters = normalizeDiscoveryParams(await searchParams);
    const user = await getCurrentUser().catch(() => null);
    const profile = await loadDiscoveryProfile(user);
    const profileSummary = getDiscoveryProfileSummary(profile);
    const { events, totalCount, pageSize, fallback, relaxedTime } = await loadEvents(filters, profile);
    const discoveryFilters = relaxedTime ? { ...filters, time: "all" } : filters;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const currentPage = Math.min(filters.page, totalPages);
    const previousHref = currentPage > 1 ? buildDiscoveryPageHref("/", filters, currentPage - 1) : null;
    const nextHref = currentPage < totalPages ? buildDiscoveryPageHref("/", filters, currentPage + 1) : null;
    const intentLinks = buildIntentLinks(filters);
    const spotlightEvents = events.slice(0, 4);
    const leadEvent = spotlightEvents[0] ?? null;
    const liveEvents = events.filter(isTodayEvent).slice(0, 8);
    const liveRailEvents = (liveEvents.length > 0 ? liveEvents : events).slice(0, 8);
    const hiddenGem =
        events.find((event) => Number(event.viewCount || 0) < 10 && event.id !== leadEvent?.id) ??
        events[2] ??
        leadEvent;
    const vibeTiles = [
        {
            label: "Subkultur & Underground",
            text: "Neustadt, Hinterhöfe, kleine Räume",
            href: buildDiscoveryPageHref("/#events", { ...filters, category: "KULTUR", sort: "for-you" }, 1),
            tone: "underground",
        },
        {
            label: "Spike & Sweat",
            text: "Turniere, Teams, Bewegung",
            href: buildDiscoveryPageHref("/#events", { ...filters, category: "SPORT", sort: "for-you" }, 1),
            tone: "sport",
        },
        {
            label: "Draussen & entspannt",
            text: "Gruen, Markt, Sommerabend",
            href: buildDiscoveryPageHref("/#events", { ...filters, category: "MARKT", sort: "for-you" }, 1),
            tone: "outside",
        },
        {
            label: "Kleine Buehnen",
            text: "Konzerte, Comedy, neue Stimmen",
            href: buildDiscoveryPageHref("/#events", { ...filters, category: "KONZERT", sort: "for-you" }, 1),
            tone: "stage",
        },
        {
            label: "Lernen & Machen",
            text: "Workshops statt Scrollen",
            href: buildDiscoveryPageHref("/#events", { ...filters, category: "WORKSHOP", sort: "for-you" }, 1),
            tone: "workshop",
        },
        {
            label: "Familienzeit",
            text: "einfach raus mit allen",
            href: buildDiscoveryPageHref("/#events", { ...filters, category: "FAMILIE", sort: "for-you" }, 1),
            tone: "family",
        },
    ];

    return (
        <main className="home-shell">
            <section className="home-hero home-hero--visitor">
                <div className="home-hero__media" aria-hidden="true" />
                <div className="container home-hero__grid">
                    <div className="home-hero__copy">
                        <span className="home-kicker">Dresden heute</span>
                        <h1>Dein Abend wartet irgendwo.</h1>
                        <p>Finde ihn, bevor er voll ist.</p>

                        <div className="home-hero__actions" aria-label="Startaktionen">
                            <Link
                                href={buildDiscoveryPageHref("/#events", { ...filters, sort: "for-you" }, 1)}
                                className="btn btn-primary"
                            >
                                Events entdecken
                            </Link>
                            <Link
                                href={buildDiscoveryPageHref("/#events", { ...filters, time: "today", sort: "for-you" }, 1)}
                                className="btn btn-ghost"
                            >
                                Heute ansehen
                            </Link>
                        </div>

                        <div className="home-quick-actions" aria-label="Schnellfilter">
                            {intentLinks.map((intent) => (
                                <Link key={intent.label} href={intent.href} className="home-quick-filter">

                                    <strong>{intent.label}</strong>
                                    <small>{intent.text}</small>
                                </Link>
                            ))}
                        </div>
                    </div>

                    <aside className="home-tonight-card" aria-label="Empfohlenes Event">
                        {leadEvent ? (
                            <Link href={`/events/${leadEvent.id}`} className="home-tonight-card__link">
                                <span className="home-tonight-card__label">Heute im Blick</span>
                                <strong>{leadEvent.title}</strong>
                                <small>
                                    {formatCompactTime(leadEvent.startDate)} | {getSpot(leadEvent)} |{" "}
                                    {formatCompactPrice(leadEvent.price)}
                                </small>
                                <em>{getLiveSignal(leadEvent)}</em>
                            </Link>
                        ) : (
                            <>
                                <span className="home-tonight-card__label">Heute im Blick</span>
                                <strong>Dresden wartet auf die ersten Drops.</strong>
                                <small>Neue Events erscheinen hier als erstes.</small>
                            </>
                        )}
                    </aside>
                </div>
            </section>

            <section className="live-now-section" aria-label="Live und jetzt">
                <div className="container">
                    <div className="home-section-bar">
                        <div>
                            <span className="eyebrow">Live & jetzt</span>
                            <h2>Heute am Start</h2>
                        </div>
                        <Link href={buildDiscoveryPageHref("/", { ...filters, time: "today", sort: "for-you" }, 1)}>
                            Alles heute
                        </Link>
                    </div>

                    <div className="live-now-rail">
                        {liveRailEvents.length > 0 ? (
                            liveRailEvents.map((event) => (
                                <Link
                                    key={event.id}
                                    href={`/events/${event.id}`}
                                    className="live-now-card"
                                >
                                    <span>{getLiveSignal(event)}</span>
                                    <strong>{event.title}</strong>
                                    <small>{formatCompactTime(event.startDate)} | {getSpot(event)}</small>
                                </Link>
                            ))
                        ) : (
                            ["Neustadt", "Pieschen", "Grosser Garten", "Radeberg"].map((spot) => (
                                <div key={spot} className="live-now-card live-now-card--empty">
                                    <span>bald live</span>
                                    <strong>{spot}</strong>
                                    <small>Events erscheinen hier zuerst</small>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </section>

            <section className="vibe-check-section">
                <div className="container">
                    <div className="home-section-bar">
                        <div>
                            <span className="eyebrow">Vibe-Check</span>
                            <h2>Tippen statt suchen</h2>
                        </div>
                    </div>

                    <div className="vibe-grid">
                        {vibeTiles.map((tile) => (
                            <Link key={tile.label} href={tile.href} className={`vibe-tile vibe-tile--${tile.tone}`}>
                                <span>{tile.text}</span>
                                <strong>{tile.label}</strong>
                                <em>Events ansehen</em>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            <section className="hidden-gem-section">
                <div className="container hidden-gem-card">
                    <div className="hidden-gem-card__copy">
                        <span className="eyebrow">Hidden Gem Radar</span>
                        <h2>{hiddenGem ? hiddenGem.title : "Das kleine Ding, das sonst keiner findet."}</h2>
                        <p>
                            {hiddenGem
                                ? `"Genau solche Events gehen sonst zwischen Kalendern und Social Feeds verloren."`
                                : "\"Sobald die ersten Nischen-Events live sind, bekommen sie hier die grosse Buehne.\""}
                        </p>
                        {hiddenGem ? (
                            <Link href={`/events/${hiddenGem.id}`} className="btn btn-primary">
                                Bin dabei
                            </Link>
                        ) : (
                            <Link href="/dashboard" className="btn btn-primary">
                                Event droppen
                            </Link>
                        )}
                    </div>
                    <div
                        className="hidden-gem-card__visual"
                        style={
                            hiddenGem?.imageUrl
                                ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.68)), url(${hiddenGem.imageUrl})` }
                                : undefined
                        }
                    >
                        <span>{hiddenGem ? getCategory(hiddenGem.category).label : "Community"}</span>
                        <strong>{hiddenGem ? getSpot(hiddenGem) : "Dresden"}</strong>
                    </div>
                </div>
            </section>

            <section className="home-discovery" id="events">
                <div className="container">
                    {fallback && <div className="home-fallback card">{fallback}</div>}

                    <EventDiscovery
                        events={events}
                        initialQuery={filters.query}
                        initialCategory={filters.category}
                        initialTime={discoveryFilters.time}
                        initialFreeOnly={discoveryFilters.freeOnly}
                        initialSort={discoveryFilters.sort}
                        profileSummary={profileSummary}
                        isPersonalized={Boolean(user)}
                        useRecommendedApi
                        recommendedApiSource="home-discovery"
                    />

                    {totalPages > 1 ? (
                        <div className="pager">
                            <span className="text-muted">
                                Seite {currentPage} von {totalPages}
                            </span>
                            <div className="flex wrap">
                                {previousHref ? (
                                    <Link href={previousHref} className="btn btn-ghost">
                                        Zurück
                                    </Link>
                                ) : null}
                                {nextHref ? (
                                    <Link href={nextHref} className="btn btn-primary">
                                        Weiter
                                    </Link>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                </div>
            </section>

            <section className="community-drop-section">
                <div className="container community-drop-card">
                    <h2>Selbst ein Event am Start?</h2>
                    <p>Bring deine Community auf die Map. Kostenlos droppen, sichtbar werden, Tickets sauber abwickeln.</p>
                    <Link href="/dashboard" className="btn btn-primary">
                        Event droppen (Kostenlos)
                    </Link>
                </div>
            </section>
        </main>
    );
}

