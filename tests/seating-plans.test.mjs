import assert from "node:assert/strict";
import test from "node:test";

import {
    buildSimpleBlockLayout,
    normalizeSeatingLayout,
    normalizeSeatingPlanPayload,
    summarizeSeatingLayout,
} from "../src/lib/seating-plans.js";

test("simple block layout creates rows and seats for a stadium seating plan", () => {
    const layout = buildSimpleBlockLayout({
        sectionName: "Haupttribuene",
        rowPrefix: "A",
        rowCount: 3,
        seatsPerRow: 4,
    });

    assert.equal(layout.version, 1);
    assert.equal(layout.venueType, "STADIUM");
    assert.equal(layout.sections.length, 1);
    assert.equal(layout.sections[0].rows.length, 3);
    assert.equal(layout.sections[0].rows[0].label, "A1");
    assert.equal(layout.sections[0].rows[0].seats.length, 4);
    assert.equal(layout.summary.seats, 12);
});

test("seating plan payload strips control characters and counts available seats", () => {
    const result = normalizeSeatingPlanPayload({
        name: "  Stadion\u0000 Nord  ",
        description: "  Eingang C  ",
        layout: {
            sections: [
                {
                    id: "block-nord",
                    name: "Nord",
                    rows: [
                        {
                            id: "row-1",
                            label: "1",
                            seats: [
                                { id: "seat-1", label: "1" },
                                { id: "seat-2", label: "2", status: "BLOCKED" },
                            ],
                        },
                    ],
                },
            ],
        },
    });

    assert.deepEqual(result.errors, []);
    assert.equal(result.data.name, "Stadion Nord");
    assert.equal(result.data.description, "Eingang C");
    assert.equal(result.data.seatCount, 2);
    assert.equal(result.data.layout.summary.byStatus.AVAILABLE, 1);
    assert.equal(result.data.layout.summary.byStatus.BLOCKED, 1);
});

test("empty seating layouts are rejected", () => {
    const result = normalizeSeatingPlanPayload({
        name: "Leerer Plan",
        layout: { sections: [] },
    });

    assert.equal(result.errors.includes("Mindestens ein Block ist erforderlich."), true);
    assert.equal(result.errors.includes("Mindestens ein Sitzplatz ist erforderlich."), true);
});

test("layout summaries stay stable for normalized layouts", () => {
    const normalized = normalizeSeatingLayout({
        sections: [
            {
                name: "VIP",
                type: "VIP",
                rows: [
                    {
                        label: "1",
                        seats: [{ label: "1", status: "ACCESSIBLE" }],
                    },
                ],
            },
        ],
    });

    assert.deepEqual(summarizeSeatingLayout(normalized.layout), normalized.summary);
});
