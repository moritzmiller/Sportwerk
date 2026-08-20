import "../globals.css";
import { prisma } from "@/lib/prisma";

export default async function EventList() {
    const events = await prisma.event.findMany({
        where: {
            startDate: {
                gte: new Date(),
            },
        },
        orderBy: {
            startDate: "asc",
        },
    });

    return (
        <section>
            <h2>Kommende Events</h2>

            {events.length === 0 ? (
                <p>Noch keine kommenden Events vorhanden.</p>
            ) : (
                events.map((event) => (
                    <article key={event.id}>
                        <h3>{event.title}</h3>

                        {event.description && <p>{event.description}</p>}

                        <p>
                            {event.location}, {event.city}
                        </p>

                        <p>
                            {new Date(event.startDate).toLocaleDateString("de-DE", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                            })}
                        </p>

                        <p>ab {event.price} €</p>
                    </article>
                ))
            )}
        </section>
    );
}
