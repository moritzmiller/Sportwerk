import assert from "node:assert/strict";
import test from "node:test";

import {
    buildDiscoveryFallbackWhere,
    buildDiscoveryPageHref,
    buildDiscoveryWhere,
    normalizeDiscoveryParams,
} from "../src/lib/discovery.js";

test("buildDiscoveryPageHref keeps query params before the hash anchor", () => {
    const href = buildDiscoveryPageHref(
        "/#events",
        { category: "KONZERT", time: "today", sort: "popular", freeOnly: true },
        2
    );

    assert.equal(href, "/?category=KONZERT&time=today&sort=popular&freeOnly=true&page=2#events");
});

test("discovery params default to all categories instead of filtering by accident", () => {
    const filters = normalizeDiscoveryParams({});

    assert.equal(filters.category, "all");
    assert.equal(filters.time, "all");
    assert.equal(filters.sort, "for-you");
});

test("primary discovery only returns upcoming published events", () => {
    const now = new Date("2026-07-13T10:00:00.000Z");
    const where = buildDiscoveryWhere({ category: "SPORT" }, now);

    assert.deepEqual(where, {
        status: "PUBLISHED",
        startDate: { gte: now },
        category: "SPORT",
    });
});

test("fallback discovery stays public but does not require future dates", () => {
    const where = buildDiscoveryFallbackWhere({
        category: "KULTUR",
        query: "jazz",
        freeOnly: true,
        time: "today",
    });

    assert.deepEqual(where, {
        status: {
            in: ["PUBLISHED", "POSTPONED", "SOLD_OUT"],
        },
        category: "KULTUR",
        price: 0,
        OR: [
            { title: { contains: "jazz", mode: "insensitive" } },
            { description: { contains: "jazz", mode: "insensitive" } },
            { location: { contains: "jazz", mode: "insensitive" } },
            { city: { contains: "jazz", mode: "insensitive" } },
        ],
    });
});
