function normalizePlaceName(value) {
    return String(value ?? "").trim();
}

function compareByCountThenName(a, b) {
    return Number(b.count || 0) - Number(a.count || 0) || a.label.localeCompare(b.label, "de");
}

export function summarizeCities(events = [], limit = 6) {
    const map = new Map();

    for (const event of events) {
        const label = normalizePlaceName(event.city);
        if (!label) continue;

        const current = map.get(label) ?? {
            label,
            count: 0,
            nextDate: null,
            venues: new Set(),
        };

        current.count += 1;
        const date = event.startDate ? new Date(event.startDate) : null;
        if (date && (!current.nextDate || date < current.nextDate)) {
            current.nextDate = date;
        }
        if (event.venueName) {
            current.venues.add(event.venueName);
        }

        map.set(label, current);
    }

    return [...map.values()]
        .map((entry) => ({
            label: entry.label,
            count: entry.count,
            nextDate: entry.nextDate,
            venueCount: entry.venues.size,
            href: `/cities/${encodeURIComponent(entry.label)}`,
        }))
        .sort(compareByCountThenName)
        .slice(0, limit);
}

export function summarizeVenues(venues = [], limit = 6) {
    return venues
        .map((venue) => ({
            id: venue.id,
            label: venue.name,
            city: normalizePlaceName(venue.city),
            organizationName: venue.organization?.name ?? venue.organizationName ?? null,
            count: Array.isArray(venue.events) ? venue.events.length : Number(venue.eventCount || 0),
            nextDate: Array.isArray(venue.events) && venue.events.length > 0 ? new Date(venue.events[0].startDate) : null,
            href: `/venues/${venue.id}`,
        }))
        .filter((venue) => venue.count > 0)
        .sort(compareByCountThenName)
        .slice(0, limit);
}
