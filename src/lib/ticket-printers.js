export const TICKET_PRINTERS = Object.freeze({
    BROWSER: "BROWSER",
    BOCA_LEMUR: "BOCA_LEMUR",
});

export const DEFAULT_TICKET_PRINTER = TICKET_PRINTERS.BROWSER;

export const TICKET_PRINTER_OPTIONS = Object.freeze([
    {
        value: TICKET_PRINTERS.BROWSER,
        label: "Browser / PDF",
        description: "Standardlayout fuer normale Druckdialoge und PDF-Tickets.",
        layout: "BROWSER_A6",
    },
    {
        value: TICKET_PRINTERS.BOCA_LEMUR,
        label: "BOCA FGL",
        description: "FGL-Rohdaten fuer BOCA-Ticketdrucker mit automatisch angepasstem Layout.",
        layout: "BOCA_LEMUR_2X5",
    },
]);

const VALID_PRINTERS = new Set(TICKET_PRINTER_OPTIONS.map((printer) => printer.value));

export function normalizeTicketPrinter(value, fallback = DEFAULT_TICKET_PRINTER) {
    const normalized = String(value ?? "").trim().toUpperCase();
    if (VALID_PRINTERS.has(normalized)) return normalized;
    return VALID_PRINTERS.has(fallback) ? fallback : DEFAULT_TICKET_PRINTER;
}

export function getTicketPrinterOption(value) {
    const printer = normalizeTicketPrinter(value);
    return TICKET_PRINTER_OPTIONS.find((option) => option.value === printer) ?? TICKET_PRINTER_OPTIONS[0];
}

export function isBocaTicketPrinter(value) {
    return normalizeTicketPrinter(value) === TICKET_PRINTERS.BOCA_LEMUR;
}
