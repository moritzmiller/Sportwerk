import assert from "node:assert/strict";
import test from "node:test";

import {
    buildCheckinScanStats,
    buildCheckinScansCsv,
    getScanTicketLabel,
    summarizeRecentWarnings,
} from "../src/lib/checkin-scans.js";

test("check-in scan stats count individual tickets before bookings", () => {
    const stats = buildCheckinScanStats([
        { status: "SCANNED", bookingId: "booking-1", ticketId: "ticket-1" },
        { status: "ALREADY_SCANNED", bookingId: "booking-1", ticketId: "ticket-1" },
        { status: "SCANNED", bookingId: "booking-1", ticketId: "ticket-2" },
        { status: "INVALID", rawInput: "broken" },
    ]);

    assert.equal(stats.totalAttempts, 4);
    assert.equal(stats.successfulScans, 2);
    assert.equal(stats.duplicateScans, 1);
    assert.equal(stats.invalidScans, 1);
    assert.equal(stats.uniqueTickets, 2);
    assert.equal(stats.uniqueBookings, 1);
});

test("check-in scan CSV includes ticket identity and holder data", () => {
    const csv = buildCheckinScansCsv([
        {
            createdAt: new Date("2026-08-26T10:00:00.000Z"),
            status: "SCANNED",
            warning: "",
            ticketId: "ticket-1",
            bookingId: "booking-1",
            eventId: 42,
            ticket: {
                holderName: "Ada Lovelace",
                ticketTypeName: "Startplatz",
            },
            booking: {
                purchaserName: "Ada Buyer",
                purchaserEmail: "buyer@example.test",
                quantity: 2,
            },
            event: {
                title: "ERICH Lauf",
            },
            source: "scanner-link",
            scannerName: "Scanner One",
            scannerEmail: "scanner@example.test",
            rawInput: "gkt1.ticket-1.sig",
            details: { source: "test" },
        },
    ]);

    assert.match(csv, /"ticket_id";"ticket_holder_name";"ticket_type";"booking_id"/);
    assert.match(csv, /"ticket-1";"Ada Lovelace";"Startplatz";"booking-1"/);
});

test("recent warnings expose ticket labels for individual ticket scans", () => {
    const scans = [
        {
            id: "scan-1",
            status: "ALREADY_SCANNED",
            warning: "Schon drin",
            createdAt: new Date("2026-08-26T10:00:00.000Z"),
            bookingId: "booking-1",
            ticketId: "ticket-1",
            ticket: { holderName: "Ada Lovelace" },
            booking: { purchaserName: "Ada Buyer" },
        },
    ];

    assert.equal(getScanTicketLabel(scans[0]), "Ada Lovelace");
    assert.deepEqual(summarizeRecentWarnings(scans), [
        {
            id: "scan-1",
            status: "ALREADY_SCANNED",
            warning: "Schon drin",
            createdAt: new Date("2026-08-26T10:00:00.000Z"),
            bookingId: "booking-1",
            ticketId: "ticket-1",
            ticketLabel: "Ada Lovelace",
        },
    ]);
});
