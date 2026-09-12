import assert from "node:assert/strict";
import test from "node:test";

import {
    buildBocaFgl,
    buildBocaFilename,
    buildBocaTicketRecords,
    getBocaLayoutProfile,
} from "../src/lib/boca-tickets.js";

process.env.TICKET_QR_SECRET = "ticket-secret-with-at-least-24-chars";

const booking = {
    id: "booking_123",
    quantity: 2,
    purchaserName: "Jorg Muller",
    purchaserEmail: "joerg@example.test",
    ticketTypeName: "VIP Spezial",
    paymentReference: "INV-42",
    event: {
        title: "Sommerfest Koln",
        location: "Halle 1",
        city: "Koln",
        startDate: "2026-08-31T18:30:00.000Z",
        ticketPrinter: "BOCA_LEMUR",
    },
};

test("buildBocaTicketRecords creates one physical ticket per booking quantity", () => {
    const records = buildBocaTicketRecords([booking]);

    assert.equal(records.length, 2);
    assert.equal(records[0].copy, 1);
    assert.equal(records[1].copy, 2);
    assert.equal(records[0].copies, 2);
    assert.equal(records[0].layoutName, "BOCA_LEMUR_2X5");
    assert.equal(records[0].ticketPrinter, "BOCA_LEMUR");
    assert.match(records[0].ticketCode, /^gk1\.booking_123\./);
});

test("buildBocaTicketRecords normalizes text to printer-safe ascii", () => {
    const records = buildBocaTicketRecords([
        {
            ...booking,
            purchaserName: "J\u00f6rg M\u00fcller",
            event: { ...booking.event, title: "Sommerfest K\u00f6ln" },
        },
    ]);

    assert.equal(records[0].purchaserName, "Jorg Muller");
    assert.equal(records[0].eventTitle, "Sommerfest Koln");
});

test("buildBocaFgl contains BOCA command text, ticket data, and qr payload", () => {
    const fgl = buildBocaFgl([booking]);

    assert.match(fgl, /<RC>/);
    assert.match(fgl, /<BQR>/);
    assert.match(fgl, /Sommerfest Koln/);
    assert.match(fgl, /VIP Spezial 1\/2/);
    assert.match(fgl, /gk1\.booking_123\./);
    assert.equal((fgl.match(/<p>/g) ?? []).length, 2);
});

test("getBocaLayoutProfile falls back to the Boca layout for unknown values", () => {
    assert.equal(getBocaLayoutProfile("BOCA_LEMUR").name, "BOCA_LEMUR_2X5");
    assert.equal(getBocaLayoutProfile("unknown").name, "BOCA_LEMUR_2X5");
});

test("buildBocaFilename keeps download names stable and safe", () => {
    assert.equal(
        buildBocaFilename({ eventId: "evt 42", search: "Muller/VIP" }),
        "gatekeeper-boca-evt-42-Muller-VIP.fgl"
    );
    assert.equal(buildBocaFilename({ eventId: "all" }), "gatekeeper-boca-all.fgl");
});
