import Link from "next/link";
import { notFound } from "next/navigation";

import EventCard from "@/components/EventCard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function loadVenue(id) {
    try {
        if (prisma?.venue?.findUnique) {
            return await prisma.venue.findUnique({
                where: { id },
                include: {
                    organization: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                    events: {
                        where: {
                            status: "PUBLISHED",
                        },
                        orderBy: [{ startDate: "asc" }],
                        select: {
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
                        },
                    },
                },
            });
        }
    } catch {
        // Fallback below.
    }

    const fallbackEvents = await prisma.event.findMany({
        where: {
            venueId: id,
            status: "PUBLISHED",
        },
        include: {
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
        },
        orderBy: [{ startDate: "asc" }],
    });

    if (fallbackEvents.length === 0) {
        return null;
    }

    const firstEvent = fallbackEvents[0];
    return {
        id,
        name: firstEvent.venueId ? firstEvent.location : "Venue",
        address: null,
        city: firstEvent.city ?? null,
        notes: null,
        organization: null,
        events: fallbackEvents,
    };
}

export async function generateMetadata({ params }) {
    const resolvedParams = await params;
    const venue = await loadVenue(resolvedParams.id);

    if (!venue) return {};

    return {
        title: `${venue.name} | GateKeeper`,
        description: `${venue.name} in ${venue.city || "Dresden"} mit kommenden Events und lokalen Verbindungen.`,
    };
}

export default async function VenuePage({ params }) {
    const resolvedParams = await params;
    const venue = await loadVenue(resolvedParams.id);

    if (!venue) {
        notFound();
    }

    const now = new Date();
    const upcomingEvents = venue.events.filter((event) => new Date(event.startDate) >= now);
    const pastEvents = venue.events.filter((event) => new Date(event.startDate) < now);

    return (
        <main className="section">
            <div className="container stack-lg">
                <div className="checkout-page__header">
                    <div>
                        <span className="eyebrow">Venue Detail</span>
                        <h1 className="section-header__title">{venue.name}</h1>
                        <p className="text-muted">
                            {venue.address ? `${venue.address}, ` : ""}
                            {venue.city || "Dresden"}
                            {venue.organization?.name ? ` · ${venue.organization.name}` : ""}
                        </p>
                    </div>
                    <div className="flex wrap">
                        <Link href="/venues" className="btn btn-ghost">
                            Zur Übersicht
                        </Link>
                        {venue.city ? (
                            <Link href={`/cities/${encodeURIComponent(venue.city)}`} className="btn btn-ghost">
                                Mehr in {venue.city}
                            </Link>
                        ) : null}
                    </div>
                </div>

                <section className="card stack">
                    <h2 className="card__title">Ort und Kontext</h2>
                    <div className="event-meta-grid">
                        <div className="event-meta-card">
                            <span className="label">Stadt</span>
                            <strong>{venue.city || "Nicht angegeben"}</strong>
                        </div>
                        <div className="event-meta-card">
                            <span className="label">Adresse</span>
                            <strong>{venue.address || "Nicht angegeben"}</strong>
                        </div>
                        <div className="event-meta-card">
                            <span className="label">Veranstalter</span>
                            <strong>{venue.organization?.name || "Persönliche Venue"}</strong>
                        </div>
                        <div className="event-meta-card">
                            <span className="label">Kommende Events</span>
                            <strong>{upcomingEvents.length}</strong>
                        </div>
                    </div>
                    {venue.notes ? <p className="text-muted">{venue.notes}</p> : null}
                </section>

                <section className="stack">
                    <div className="flex-between wrap">
                        <div>
                            <h2 className="card__title">Kommende Events</h2>
                            <p className="text-muted">Aktuelle Veranstaltungen an diesem Ort.</p>
                        </div>
                    </div>

                    {upcomingEvents.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state__icon">Keine Events</div>
                            <p>Für diesen Ort sind gerade keine kommenden Events veröffentlicht.</p>
                        </div>
                    ) : (
                        <div className="event-grid">
                            {upcomingEvents.map((event) => (
                                <EventCard
                                    key={event.id}
                                    event={{
                                        ...event,
                                        organizationVerificationStatus:
                                            event.organization?.verificationStatus ?? null,
                                        venueVerificationStatus: event.venue?.verificationStatus ?? null,
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </section>

                {pastEvents.length > 0 ? (
                    <section className="card stack">
                        <h2 className="card__title">Vergangene Events</h2>
                        <div className="stack-sm">
                            {pastEvents.slice(0, 6).map((event) => (
                                <Link key={event.id} href={`/events/${event.id}`} className="mini-discovery-card">
                                    <strong>{event.title}</strong>
                                    <span className="text-muted">
                                        {new Date(event.startDate).toLocaleDateString("de-DE", {
                                            day: "2-digit",
                                            month: "2-digit",
                                            year: "numeric",
                                        })}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </section>
                ) : null}
            </div>
        </main>
    );
}
