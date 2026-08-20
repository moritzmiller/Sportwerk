import Link from "next/link";

import { summarizeVenues } from "@/lib/local-discovery";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Venues | GateKeeper",
    description: "Entdecke die wichtigsten Veranstaltungsorte mit kommenden Events und lokalem Kontext.",
};

async function loadVenueHighlights(now) {
    const venueDelegate = prisma?.venue;

    if (venueDelegate?.findMany) {
        return venueDelegate.findMany({
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
                },
            },
            orderBy: [{ city: "asc" }, { name: "asc" }],
            take: 60,
        });
    }

    const events = await prisma.event.findMany({
        where: {
            status: "PUBLISHED",
            startDate: {
                gte: now,
            },
        },
        select: {
            venueId: true,
            startDate: true,
            location: true,
            city: true,
            venue: {
                select: {
                    id: true,
                    name: true,
                    address: true,
                    city: true,
                    notes: true,
                    organization: {
                        select: {
                            name: true,
                        },
                    },
                },
            },
        },
        orderBy: [{ startDate: "asc" }],
        take: 150,
    });

    const venuesById = new Map();
    for (const event of events) {
        if (event.venue?.id) {
            const current = venuesById.get(event.venue.id) ?? {
                ...event.venue,
                events: [],
            };
            current.events.push({ startDate: event.startDate });
            venuesById.set(event.venue.id, current);
        }
    }

    return [...venuesById.values()];
}

export default async function VenuesPage() {
    const now = new Date();
    const venues = await loadVenueHighlights(now);

    const highlightedVenues = summarizeVenues(venues, 30);

    return (
        <main className="section">
            <div className="container stack-lg">
                <div className="checkout-page__header">
                    <div>
                        <span className="eyebrow">Lokale Orte</span>
                        <h1 className="section-header__title">Venues entdecken</h1>
                        <p className="text-muted">
                            Die wichtigsten Orte mit kommenden Events, organisiert nach Aktivität und Stadt.
                        </p>
                    </div>
                    <div className="flex wrap">
                        <Link href="/" className="btn btn-ghost">
                            Zur Startseite
                        </Link>
                        <Link href="/cities" className="btn btn-ghost">
                            Städte entdecken
                        </Link>
                    </div>
                </div>

                {highlightedVenues.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">Venue</div>
                        <p>Noch keine aktiven Venues mit kommenden Events vorhanden.</p>
                    </div>
                ) : (
                    <div className="discovery-hub-grid">
                        {highlightedVenues.map((venue) => (
                            <Link key={venue.id} href={venue.href} className="card mini-discovery-card">
                                <strong>{venue.label}</strong>
                                <span className="text-muted">
                                    {venue.city || "Ohne Stadt"} · {venue.count} kommende Events
                                </span>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
