function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function toIsoString(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeTicketTypeInput(ticketType = {}, index = 0) {
    const id = normalizeText(ticketType.id) || null;
    const name = normalizeText(ticketType.name) || `Ticket ${index + 1}`;
    const description = normalizeText(ticketType.description) || null;
    const price = Math.max(0, normalizeNumber(ticketType.price, 0));
    const quotaValue = normalizeText(ticketType.quota);
    const quota =
        quotaValue === ""
            ? null
            : Math.max(1, Math.floor(normalizeNumber(quotaValue, 0))) || null;
    const maxPerBookingValue = normalizeText(ticketType.maxPerBooking);
    const maxPerBooking =
        maxPerBookingValue === ""
            ? null
            : Math.max(1, Math.floor(normalizeNumber(maxPerBookingValue, 0))) || null;
    const sortOrder = Math.max(0, Math.floor(normalizeNumber(ticketType.sortOrder, index)));

    return {
        id,
        name,
        description,
        price,
        currency: "EUR",
        quota,
        maxPerBooking,
        isDefault: Boolean(ticketType.isDefault),
        sortOrder,
    };
}

export function normalizeTicketTypes(input, fallback = {}) {
    const source = Array.isArray(input) ? input : [];
    const normalized = source
        .map((ticketType, index) => normalizeTicketTypeInput(ticketType, index))
        .filter((ticketType) => ticketType.name);

    if (normalized.length === 0) {
        normalized.push({
            name: normalizeText(fallback.name) || "Standard",
            description: normalizeText(fallback.description) || null,
            price: Math.max(0, normalizeNumber(fallback.price, 0)),
            currency: "EUR",
            quota:
                fallback.quota === "" || fallback.quota === null || typeof fallback.quota === "undefined"
                    ? null
                    : Math.max(1, Math.floor(normalizeNumber(fallback.quota, 0))) || null,
            maxPerBooking:
                fallback.maxPerBooking === "" ||
                fallback.maxPerBooking === null ||
                typeof fallback.maxPerBooking === "undefined"
                    ? null
                    : Math.max(1, Math.floor(normalizeNumber(fallback.maxPerBooking, 0))) || null,
            isDefault: true,
            sortOrder: 0,
        });
    }

    let defaultIndex = normalized.findIndex((ticketType) => ticketType.isDefault);
    if (defaultIndex < 0) {
        defaultIndex = 0;
    }

    normalized.forEach((ticketType, index) => {
        ticketType.isDefault = index === defaultIndex;
        ticketType.sortOrder = index;
    });

    return normalized;
}

export function serializeTicketType(ticketType) {
    const quota = ticketType.quota ?? null;
    const soldCount = Number(ticketType.soldCount || 0);

    return {
        id: ticketType.id,
        eventId: ticketType.eventId,
        name: ticketType.name,
        description: ticketType.description ?? null,
        price: Number(ticketType.price || 0),
        currency: ticketType.currency || "EUR",
        quota,
        soldCount,
        remainingQuota: quota === null ? null : Math.max(0, quota - soldCount),
        maxPerBooking: ticketType.maxPerBooking ?? null,
        isDefault: Boolean(ticketType.isDefault),
        sortOrder: Number(ticketType.sortOrder || 0),
        createdAt: toIsoString(ticketType.createdAt),
        updatedAt: toIsoString(ticketType.updatedAt),
    };
}

export function createFallbackTicketType(event) {
    return {
        id: null,
        eventId: event.id,
        name: "Standard",
        description: null,
        price: Number(event.price || 0),
        currency: "EUR",
        quota: event.capacity ?? null,
        soldCount: Number(event.soldTickets || 0),
        remainingQuota:
            event.capacity === null || typeof event.capacity === "undefined"
                ? null
                : Math.max(0, Number(event.capacity || 0) - Number(event.soldTickets || 0)),
        maxPerBooking: null,
        isDefault: true,
        sortOrder: 0,
        createdAt: null,
        updatedAt: null,
    };
}

export function getResolvedTicketTypes(event) {
    const ticketTypes = event.ticketTypes?.length
        ? event.ticketTypes.map((ticketType) => serializeTicketType(ticketType))
        : [createFallbackTicketType(event)];

    return ticketTypes.sort((a, b) => {
        if (a.isDefault !== b.isDefault) {
            return a.isDefault ? -1 : 1;
        }

        if (a.sortOrder !== b.sortOrder) {
            return a.sortOrder - b.sortOrder;
        }

        return String(a.name).localeCompare(String(b.name));
    });
}

export function getDefaultTicketType(event) {
    const ticketTypes = getResolvedTicketTypes(event);
    return ticketTypes[0] ?? createFallbackTicketType(event);
}

export function resolveRequestedTicketType(event, ticketTypeId) {
    const requestedId = normalizeText(ticketTypeId);
    const ticketTypes = getResolvedTicketTypes(event);

    if (!requestedId) {
        return ticketTypes[0] ?? createFallbackTicketType(event);
    }

    const match = ticketTypes.find((ticketType) => ticketType.id === requestedId);
    return match ?? null;
}

export function canReserveTicketType(ticketType, quantity, currentReserved = 0) {
    const quota = ticketType?.quota;
    if (quota === null || typeof quota === "undefined") {
        return true;
    }

    const nextReserved = Number(currentReserved || 0) + Number(quantity || 0);
    return nextReserved <= Number(quota || 0);
}
