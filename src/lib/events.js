import { serializeTicketType } from "./ticket-types.js";

function toIsoString(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function serializeEvent(event) {
    return {
        id: event.id,
        title: event.title,
        description: event.description,
        imageUrl: event.imageUrl ?? null,
        location: event.location,
        city: event.city,
        category: event.category,
        status: event.status ?? "PUBLISHED",
        allowedPaymentMethods: event.allowedPaymentMethods ?? null,
        startDate: toIsoString(event.startDate),
        price: event.price,
        capacity: event.capacity ?? null,
        soldTickets: event.soldTickets ?? 0,
        viewCount: event.viewCount ?? 0,
        publishedAt: toIsoString(event.publishedAt),
        cancelledAt: toIsoString(event.cancelledAt),
        cancellationReason: event.cancellationReason ?? null,
        duplicateOfId: event.duplicateOfId ?? null,
        organizationId: event.organizationId ?? null,
        venueId: event.venueId ?? null,
        venueName: event.venue?.name ?? null,
        venueCity: event.venue?.city ?? null,
        venueAddress: event.venue?.address ?? null,
        venueVerificationStatus: event.venue?.verificationStatus ?? null,
        organizationVerificationStatus: event.organization?.verificationStatus ?? null,
        ownerName: event.owner?.name ?? event.owner?.email ?? null,
        ownerEmail: event.owner?.email ?? null,
        ticketTypes: Array.isArray(event.ticketTypes)
            ? event.ticketTypes.map((ticketType) => serializeTicketType(ticketType))
            : [],
    };
}

export function formatEventDateTime(dateValue) {
    if (!dateValue) return "Termin offen";
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "Termin offen";

    return new Intl.DateTimeFormat("de-DE", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

export function formatEventDateShort(dateValue) {
    if (!dateValue) return "Offen";
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "Offen";

    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "short",
    }).format(date);
}

export function formatEventTime(dateValue) {
    if (!dateValue) return "";
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

export function formatEventPrice(price) {
    const amount = Number(price);

    if (!amount) {
        return { text: "Kostenlos", free: true, amount: 0 };
    }

    return {
        text: amount.toLocaleString("de-DE", {
            style: "currency",
            currency: "EUR",
        }),
        free: false,
        amount,
    };
}

export function buildEventInsights(event) {
    const price = formatEventPrice(event.price);
    const start = new Date(event.startDate);
    const insights = [];

    if (Array.isArray(event.ticketTypes) && event.ticketTypes.length > 1) {
        insights.push(`${event.ticketTypes.length} Ticketoptionen stehen zur Auswahl.`);
    }

    if (price.free) {
        insights.push("Eintritt ohne Ticketkosten, ideal für spontane Besuche.");
    } else {
        insights.push(`Ab ${price.text} pro Ticket, mit klarer Preisstruktur.`);
    }

    if (start.getHours() >= 18) {
        insights.push("Abendtermin mit gutem Potenzial für After-Work oder Date-Night.");
    } else {
        insights.push("Früher Termin, gut planbar für Familien, Gruppen oder Tagesausflüge.");
    }

    if (event.capacity) {
        const sold = Number(event.soldTickets || 0);
        const capacity = Number(event.capacity || 0);
        const remaining = Math.max(0, capacity - sold);

        if (remaining === 0) {
            insights.push("Das Event ist aktuell ausverkauft.");
        } else if (remaining <= Math.max(5, Math.ceil(capacity * 0.1))) {
            insights.push(`Nur noch ${remaining} Plätze verfügbar.`);
        } else {
            insights.push(`${remaining} von ${capacity} Plätzen sind noch frei.`);
        }
    }

    if (event.viewCount && Number(event.viewCount) > 0) {
        insights.push(`${Number(event.viewCount)} Aufrufe zeigen bereits Interesse.`);
    }

    switch (event.category) {
        case "KONZERT":
            insights.push("Starker Fokus auf Atmosphäre, Sound und Live-Erlebnis.");
            break;
        case "PARTY":
            insights.push("Passt besonders gut, wenn du bis spät bleiben willst.");
            break;
        case "KULTUR":
            insights.push("Eignet sich für einen entspannten Abend mit Inhalt statt Trubel.");
            break;
        case "SPORT":
            insights.push("Gut, wenn du Bewegung, Spannung und Live-Energie suchst.");
            break;
        case "FAMILIE":
            insights.push("Familienfreundlich und gut für einen gemeinsamen Ausflug.");
            break;
        case "WORKSHOP":
            insights.push("Praktisch, wenn du etwas lernen oder direkt ausprobieren willst.");
            break;
        case "MARKT":
            insights.push("Ideal zum Stöbern, Probieren und spontanen Entdecken.");
            break;
        default:
            insights.push("Flexibles Event mit breitem Publikum und wenig Einstiegshürden.");
            break;
    }

    return insights;
}
