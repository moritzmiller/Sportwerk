import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
    buildRaceEntryUniqueKey,
    parseTargetTimeToMilliseconds,
    prepareRaceEntryInput,
} from "../src/lib/erich/race-entries.js";

const activeRace = {
    id: "race-1",
    raceNumber: 17,
    status: "ACTIVE",
};

test("ERICH target times are stored as sortable milliseconds", () => {
    assert.equal(
        parseTargetTimeToMilliseconds({ minutes: 6, seconds: 12, milliseconds: 345 }),
        372345
    );

    assert.throws(
        () => parseTargetTimeToMilliseconds({ minutes: 0, seconds: 60, milliseconds: 0 }),
        /seconds/
    );
    assert.throws(
        () => parseTargetTimeToMilliseconds({ minutes: 0, seconds: 0, milliseconds: 1000 }),
        /milliseconds/
    );
});

test("ERICH race entry input rejects inactive and review-required races", () => {
    const base = {
        eventId: "event-1",
        registrationBatchId: "batch-1",
        athleteId: "athlete-1",
        targetTime: { minutes: 7, seconds: 1, milliseconds: 23 },
        priceCents: 4000,
    };

    assert.throws(
        () =>
            prepareRaceEntryInput({
                ...base,
                raceDefinition: { ...activeRace, status: "REVIEW_REQUIRED", reviewReason: "missing price" },
            }),
        /not active/
    );

    assert.throws(
        () =>
            prepareRaceEntryInput({
                ...base,
                raceDefinition: { ...activeRace, status: "INACTIVE" },
            }),
        /not active/
    );

    assert.equal(prepareRaceEntryInput({ ...base, raceDefinition: activeRace }).targetTimeTotalMs, 421023);
});

test("ERICH duplicate race entry key uses athlete, event and race number", () => {
    assert.equal(
        buildRaceEntryUniqueKey({
            athleteId: "athlete-1",
            eventId: "event-1",
            raceNumber: 17,
        }),
        "event-1:athlete-1:17"
    );

    assert.throws(
        () => buildRaceEntryUniqueKey({ athleteId: "athlete-1", eventId: "event-1", raceNumber: "17" }),
        /integer raceNumber/
    );
});

test("ERICH Prisma schema contains database constraints for critical duplicates", () => {
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

    assert.match(schema, /@@unique\(\[athleteId, eventId, raceNumber\]\)/);
    assert.match(schema, /@@unique\(\[provider, providerEventId\]\)/);
    assert.match(schema, /invoiceNumber\s+String\s+@unique/);
    assert.match(schema, /ticketId\s+String\s+@unique/);
    assert.match(schema, /@@unique\(\[ticketId, status\]\)/);
});
