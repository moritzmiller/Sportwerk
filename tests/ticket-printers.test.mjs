import assert from "node:assert/strict";
import test from "node:test";

import {
    TICKET_PRINTERS,
    getTicketPrinterOption,
    isBocaTicketPrinter,
    normalizeTicketPrinter,
} from "../src/lib/ticket-printers.js";

test("normalizeTicketPrinter accepts known printer ids", () => {
    assert.equal(normalizeTicketPrinter("BOCA_LEMUR"), TICKET_PRINTERS.BOCA_LEMUR);
    assert.equal(normalizeTicketPrinter("browser"), TICKET_PRINTERS.BROWSER);
});

test("normalizeTicketPrinter falls back to browser by default", () => {
    assert.equal(normalizeTicketPrinter("epson"), TICKET_PRINTERS.BROWSER);
    assert.equal(normalizeTicketPrinter(null), TICKET_PRINTERS.BROWSER);
});

test("isBocaTicketPrinter identifies Boca profiles", () => {
    assert.equal(isBocaTicketPrinter("BOCA_LEMUR"), true);
    assert.equal(isBocaTicketPrinter("BROWSER"), false);
});

test("getTicketPrinterOption exposes user-facing metadata", () => {
    const option = getTicketPrinterOption("BOCA_LEMUR");

    assert.equal(option.value, TICKET_PRINTERS.BOCA_LEMUR);
    assert.equal(option.layout, "BOCA_LEMUR_2X5");
});
