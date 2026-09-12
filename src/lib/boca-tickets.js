import { createTicketCode } from "./tickets.js";

const DEFAULT_COPY_LIMIT = 50;

function normalizeText(value, maxLength = 48) {
    return String(value ?? "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\x20-\x7e]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
}

function formatDateTime(value) {
    if (!value) return "TERMIN OFFEN";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "TERMIN OFFEN";

    return date.toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function clampQuantity(value, limit = DEFAULT_COPY_LIMIT) {
    const quantity = Math.floor(Number(value) || 0);
    if (quantity <= 0) return 0;
    return Math.min(quantity, limit);
}

export function buildBocaTicketRecords(bookings, options = {}) {
    const copyLimit = options.copyLimit ?? DEFAULT_COPY_LIMIT;

    return bookings.flatMap((booking) => {
        const quantity = clampQuantity(booking.quantity, copyLimit);
        const ticketCode = createTicketCode(booking.id);
        const event = booking.event ?? {};

        return Array.from({ length: quantity }, (_, index) => ({
            id: `${booking.id}-${index + 1}`,
            copy: index + 1,
            copies: quantity,
            bookingId: String(booking.id),
            ticketCode,
            eventTitle: normalizeText(event.title ?? "GateKeeper Event", 42),
            startsAt: normalizeText(formatDateTime(event.startDate), 24),
            location: normalizeText([event.location, event.city].filter(Boolean).join(", ") || "Ort offen", 42),
            purchaserName: normalizeText(booking.purchaserName, 34),
            ticketTypeName: normalizeText(booking.ticketTypeName ?? "Standard", 26),
            reference: normalizeText(booking.paymentReference ?? booking.id, 28),
        }));
    });
}

function fglLine(record) {
    const copySuffix = record.copies > 1 ? ` ${record.copy}/${record.copies}` : "";

    return [
        "<RC>",
        `<F3><HW2,2><VA><X40><Y30>${record.eventTitle}`,
        `<F2><HW1,1><VA><X40><Y92>${record.startsAt}`,
        `<F2><HW1,1><VA><X40><Y122>${record.location}`,
        `<F2><HW1,1><VA><X40><Y165>${record.purchaserName}`,
        `<F2><HW1,1><VA><X40><Y198>${record.ticketTypeName}${copySuffix}`,
        `<F1><HW1,1><VA><X40><Y232>${record.reference}`,
        `<BQR><X430><Y42><M2><E4>${record.ticketCode}`,
        `<F1><HW1,1><VA><X430><Y232>${record.bookingId}`,
        "<p>",
    ].join("\r\n");
}

export function buildBocaFgl(bookings, options = {}) {
    const records = buildBocaTicketRecords(bookings, options);
    return `${records.map(fglLine).join("\r\n")}\r\n`;
}

export function buildBocaFilename({ eventId = "all", search = "" } = {}) {
    const eventPart = normalizeText(eventId, 24).replace(/[^A-Za-z0-9_-]+/g, "-") || "all";
    const searchPart = normalizeText(search, 24).replace(/[^A-Za-z0-9_-]+/g, "-");
    return searchPart ? `gatekeeper-boca-${eventPart}-${searchPart}.fgl` : `gatekeeper-boca-${eventPart}.fgl`;
}
