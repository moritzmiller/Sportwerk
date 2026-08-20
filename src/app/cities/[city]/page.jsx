import Link from "next/link";
import { notFound } from "next/navigation";

import EventCard from "@/components/EventCard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function decodeCityParam(value) {
    try {
        return decodeURIComponent(String(value ?? "").trim());
    } catch {
        return String(value ?? "").trim();
    }
}

async function loadCityPageData(city, now) {
    try {
        const [events, venues] = await Promise.all([
            prisma.event.findMany({
                where: {
                    city,
                    status: "PUBLISHED",
                    startDate: {
                        gte: now,
                    },
                },
                include: {
                    venue: {
                        select: {
                            id: true,
                            name: true,
                            verificationStatus: true,
                        },
                    },
                    organization: {
                        select: {
                            verificationStatus: true,
                        },
                    },
                },
                orderBy: [{ startDate: "asc" }],
                take: 48,
            }),
            prisma?.venue?.findMany
                ? prisma.venue.findMany({
                      where: {
                          city,
                          events: {
                              some: {
                                  status: "PUBLISHED",
                                  startDate: {
                                      gte: now,
                                  },
                              },
                          },
                      },
                      include: {
                          organization: {
                              select: {
                                  name: true,
                              },
                          },
                          events: {
                              where: {
                                  status: "PUBLISHED",
                                  startDate: {
                                      gte: now,
                                  },
                              },
                              orderBy: [{ startDate: "asc" }],
                              select: {
                                  startDate: true,
                              },
                              take: 3,
                          },
                      },
                      orderBy: [{ name: "asc" }],
                      take: 12,
                  })
                : Promise.resolve([]),
        ]);

        return { events, venues };
    } catch {
        const events = await prisma.event.findMany({
            where: {
                city,
                status: "PUBLISHED",
                startDate: {
                    gte: now,
                },
            },
            include: {
                venue: {
                    select: {
                        id: true,
                        name: true,
                        verificationStatus: true,
                    },
                },
                organization: {
                    select: {
                        verificationStatus: true,
                    },
                },
            },
            orderBy: [{ startDate: "asc" }],
            take: 48,
        });

        const venueMap = new Map();
        for (const event of events) {
            if (!event.venue?.id) continue;
            const current =
                venueMap.get(event.venue.id) ?? {
                    id: event.venue.id,
                    name: event.venue.name,
                    organization: null,
                    events: [],
                };
            current.events.push({ startDate: event.startDate });
            venueMap.set(event.venue.id, current);
        }

        return { events, venues: [...venueMap.values()] };
    }
}

export async function generateMetadata({ params }) {
    const resolvedParams = await params;
    const city = decodeCityParam(resolvedParams.city);

    if (!city) return {};

    return {
        title: `${city} | GateKeeper`,
        description: `Entdecke Events, Venues und Veranstalter in ${city}.`,
    };
}

export default async function CityPage({ params }) {
    const resolvedParams = await params;
    const city = decodeCityParam(resolvedParams.city);

    if (!city) {
        notFound();
    }

    const now = new Date();
    const { events, venues } = await loadCityPageData(city, now);

    const totalEvents = events.length;
    const totalVenues = venues.length;

    return (
        <main className="section">
            <div className="container stack-lg">
                <div className="checkout-page__header">
                    <div>
                        <span className="eyebrow">City Page</span>
                        <h1 className="section-header__title">{city}</h1>
                        <p className="text-muted">
                            {totalEvents} kommende Events in {city} · {totalVenues} aktive Venues.
                        </p>
                    </div>
                    <div className="flex wrap">
                        <Link href="/cities" className="btn btn-ghost">
                            Zur Übersicht
                        </Link>
                        <Link href="/venues" className="btn btn-ghost">
                            Venues entdecken
                        </Link>
                    </div>
                </div>

                <section className="card stack">
                    <div className="flex-between wrap">
                        <div>
                            <h2 className="card__title">Beliebte Venues in {city}</h2>
                            <p className="text-muted">
                                Die wichtigsten Orte mit aktuellen Veranstaltungen und lokalem Bezug.
                            </p>
                        </div>
                    </div>

                    {venues.length === 0 ? (
                        <p className="text-muted">Noch keine aktiven Venues für diese Stadt vorhanden.</p>
                    ) : (
                        <div className="discovery-hub-grid">
                            {venues.map((venue) => (
                                <Link key={venue.id} href={`/venues/${venue.id}`} className="mini-discovery-card">
                                    <strong>{venue.name}</strong>
                                    <span className="text-muted">
                                        {venue.events.length} kommende Events
                                        {venue.organization?.name ? ` · ${venue.organization.name}` : ""}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>

                <section className="stack">
                    <div className="flex-between wrap">
                        <div>
                            <h2 className="card__title">Events in {city}</h2>
                            <p className="text-muted">
                                Aktuelle Events mit Datum, Ort und direktem Ticketzugang.
                            </p>
                        </div>
                    </div>

                    {events.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state__icon">Keine Treffer</div>
                            <p>Für diese Stadt sind im Moment keine kommenden Events veröffentlicht.</p>
                        </div>
                    ) : (
                        <div className="event-grid">
                            {events.map((event) => (
                                <EventCard
                                    key={event.id}
                                    event={{
                                        id: event.id,
                                        title: event.title,
                                        description: event.description,
                                        imageUrl: event.imageUrl ?? null,
                                        location: event.location,
                                        city: event.city,
                                        category: event.category,
                                        status: event.status,
                                        startDate: event.startDate,
                                        price: event.price,
                                        organizationVerificationStatus:
                                            event.organization?.verificationStatus ?? null,
                                        venueVerificationStatus: event.venue?.verificationStatus ?? null,
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
