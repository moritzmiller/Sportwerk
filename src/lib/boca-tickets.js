import { createTicketCode } from "./tickets.js";
import { TICKET_PRINTERS, normalizeTicketPrinter } from "./ticket-printers.js";

const DEFAULT_COPY_LIMIT = 50;
const DEFAULT_BOCA_PRINTER = TICKET_PRINTERS.BOCA_LEMUR;

const BOCA_LAYOUTS = Object.freeze({
    [TICKET_PRINTERS.BOCA_LEMUR]: {
        name: "BOCA_LEMUR_2X5",
        maxLengths: {
            eventTitle: 42,
            startsAt: 24,
            location: 42,
            purchaserName: 34,
            ticketTypeName: 26,
            reference: 28,
        },
        fields: {
            eventTitle: { font: "F3", scale: "HW2,2", x: 40, y: 30 },
            startsAt: { font: "F2", scale: "HW1,1", x: 40, y: 92 },
            location: { font: "F2", scale: "HW1,1", x: 40, y: 122 },
            purchaserName: { font: "F2", scale: "HW1,1", x: 40, y: 165 },
            ticketTypeName: { font: "F2", scale: "HW1,1", x: 40, y: 198 },
            reference: { font: "F1", scale: "HW1,1", x: 40, y: 232 },
            bookingId: { font: "F1", scale: "HW1,1", x: 430, y: 232 },
            qr: { x: 430, y: 42, model: 2, errorCorrection: 4 },
        },
    },
});

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

export function getBocaLayoutProfile(ticketPrinter = DEFAULT_BOCA_PRINTER) {
    const printer = normalizeTicketPrinter(ticketPrinter, DEFAULT_BOCA_PRINTER);
    return BOCA_LAYOUTS[printer] ?? BOCA_LAYOUTS[DEFAULT_BOCA_PRINTER];
}

export function buildBocaTicketRecords(bookings, options = {}) {
    const copyLimit = options.copyLimit ?? DEFAULT_COPY_LIMIT;
    const fallbackPrinter = normalizeTicketPrinter(options.ticketPrinter, DEFAULT_BOCA_PRINTER);

    return bookings.flatMap((booking) => {
        const quantity = clampQuantity(booking.quantity, copyLimit);
        const ticketCode = createTicketCode(booking.id);
        const event = booking.event ?? {};
        const ticketPrinter = normalizeTicketPrinter(event.ticketPrinter, fallbackPrinter);
        const layout = getBocaLayoutProfile(ticketPrinter);
        const maxLengths = layout.maxLengths;

        return Array.from({ length: quantity }, (_, index) => ({
            id: `${booking.id}-${index + 1}`,
            copy: index + 1,
            copies: quantity,
            bookingId: String(booking.id),
            ticketPrinter,
            layoutName: layout.name,
            ticketCode,
            eventTitle: normalizeText(event.title ?? "GateKeeper Event", maxLengths.eventTitle),
            startsAt: normalizeText(formatDateTime(event.startDate), maxLengths.startsAt),
            location: normalizeText(
                [event.location, event.city].filter(Boolean).join(", ") || "Ort offen",
                maxLengths.location
            ),
            purchaserName: normalizeText(booking.purchaserName, maxLengths.purchaserName),
            ticketTypeName: normalizeText(booking.ticketTypeName ?? "Standard", maxLengths.ticketTypeName),
            reference: normalizeText(booking.paymentReference ?? booking.id, maxLengths.reference),
        }));
    });
}

function textCommand(field, value) {
    return `<${field.font}><${field.scale}><VA><X${field.x}><Y${field.y}>${value}`;
}

function fglLine(record) {
    const layout = getBocaLayoutProfile(record.ticketPrinter);
    const fields = layout.fields;
    const copySuffix = record.copies > 1 ? ` ${record.copy}/${record.copies}` : "";

    return [
        "<RC>",
        textCommand(fields.eventTitle, record.eventTitle),
        textCommand(fields.startsAt, record.startsAt),
        textCommand(fields.location, record.location),
        textCommand(fields.purchaserName, record.purchaserName),
        textCommand(fields.ticketTypeName, `${record.ticketTypeName}${copySuffix}`),
        textCommand(fields.reference, record.reference),
        `<BQR><X${fields.qr.x}><Y${fields.qr.y}><M${fields.qr.model}><E${fields.qr.errorCorrection}>${record.ticketCode}`,
        textCommand(fields.bookingId, record.bookingId),
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
