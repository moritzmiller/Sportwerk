import Link from "next/link";

import { summarizeCities } from "@/lib/local-discovery";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Städte | GateKeeper",
    description: "Entdecke Events nach Stadt, mit schnellen Einstiegen in die wichtigsten lokalen Szenen.",
};

async function loadCityHighlights(now) {
    try {
        const upcomingEvents = await prisma.event.findMany({
            where: {
                status: "PUBLISHED",
                startDate: {
                    gte: now,
                },
            },
            select: {
                city: true,
                startDate: true,
                venue: {
                    select: {
                        name: true,
                    },
                },
            },
            orderBy: [{ startDate: "asc" }],
            take: 150,
        });

        const venues = prisma?.venue?.findMany
            ? await prisma.venue.findMany({
                  where: {
                      events: {
                          some: {
                              status: "PUBLISHED",
                              startDate: {
                                  gte: now,
                              },
                          },
                      },
                  },
                  select: {
                      city: true,
                      id: true,
                      name: true,
                  },
                  take: 200,
              })
            : [];

        return {
            events: upcomingEvents,
            venues,
        };
    } catch {
        const upcomingEvents = await prisma.event.findMany({
            where: {
                status: "PUBLISHED",
                startDate: {
                    gte: now,
                },
            },
            select: {
                city: true,
                startDate: true,
                venue: {
                    select: {
                        name: true,
                    },
                },
            },
            orderBy: [{ startDate: "asc" }],
            take: 150,
        });

        return {
            events: upcomingEvents,
            venues: [],
        };
    }
}

export default async function CitiesPage() {
    const now = new Date();
    const { events: upcomingEvents, venues: upcomingVenues } = await loadCityHighlights(now);

    const cities = summarizeCities(
        upcomingEvents.map((event) => ({
            city: event.city,
            startDate: event.startDate,
            venueName: event.venue?.name ?? null,
        })),
        24
    );
    const venueByCity = new Map();
    for (const venue of upcomingVenues) {
        const key = String(venue.city ?? "").trim();
        if (!key) continue;
        venueByCity.set(key, (venueByCity.get(key) ?? 0) + 1);
    }

    return (
        <main className="section">
            <div className="container stack-lg">
                <div className="checkout-page__header">
                    <div>
                        <span className="eyebrow">Lokale Suche</span>
                        <h1 className="section-header__title">Städte entdecken</h1>
                        <p className="text-muted">
                            Spring direkt in die wichtigsten Städte und finde dort passende Events,
                            Orte und Veranstalter.
                        </p>
                    </div>
                    <div className="flex wrap">
                        <Link href="/" className="btn btn-ghost">
                            Zur Startseite
                        </Link>
                        <Link href="/venues" className="btn btn-ghost">
                            Venues entdecken
                        </Link>
                    </div>
                </div>

                {cities.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">Stadt</div>
                        <p>Noch keine öffentlichen Stadtdaten vorhanden.</p>
                    </div>
                ) : (
                    <div className="discovery-hub-grid">
                        {cities.map((city) => (
                            <Link key={city.label} href={city.href} className="card mini-discovery-card">
                                <strong>{city.label}</strong>
                                <span className="text-muted">
                                    {city.count} Events · {venueByCity.get(city.label) ?? city.venueCount} Venues
                                </span>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
