export const EVENT_STATUS_LABELS = {
    DRAFT: "Entwurf",
    PUBLISHED: "Veröffentlicht",
    CANCELLED: "Abgesagt",
    POSTPONED: "Verschoben",
    SOLD_OUT: "Ausverkauft",
};

export const EVENT_STATUS_TONES = {
    DRAFT: "booking-status--cancelled",
    PUBLISHED: "booking-status--paid",
    CANCELLED: "booking-status--failed",
    POSTPONED: "booking-status--pending",
    SOLD_OUT: "booking-status--failed",
};

export function normalizeEventStatus(value, fallback = "PUBLISHED") {
    const normalized = String(value ?? "").trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(EVENT_STATUS_LABELS, normalized)
        ? normalized
        : fallback;
}

export function getEventStatusLabel(value) {
    return EVENT_STATUS_LABELS[normalizeEventStatus(value)] ?? "Unbekannt";
}

export function getEventStatusTone(value) {
    return EVENT_STATUS_TONES[normalizeEventStatus(value)] ?? "booking-status--pending";
}

export function isEventBookable(event) {
    return event.status === "PUBLISHED" && event.startDate && new Date(event.startDate) >= new Date();
}

export function getEventRemainingCapacity(event) {
    if (!event.capacity) return null;
    return Math.max(0, Number(event.capacity || 0) - Number(event.soldTickets || 0));
}

export function isEventSoldOut(event) {
    const remaining = getEventRemainingCapacity(event);
    return remaining !== null && remaining <= 0;
}

export function buildEventAuditDetails(payload = {}) {
    return {
        ...payload,
        at: new Date().toISOString(),
    };
}
