import assert from "node:assert/strict";
import test from "node:test";

import {
    createScannerToken,
    hashScannerToken,
    isScannerLinkUsable,
    parseScannerToken,
} from "../src/lib/scanner-links.js";

test("creates and parses scanner session tokens", () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const token = createScannerToken({
        eventId: 42,
        scannerLinkId: "scanner-session-id",
        expiresAt,
    });
    const parsed = parseScannerToken(token, 42);

    assert.equal(parsed.eventId, 42);
    assert.equal(parsed.scannerLinkId, "scanner-session-id");
    assert.equal(parsed.expiresAt.getTime(), expiresAt.getTime());
    assert.equal(parsed.tokenHash, hashScannerToken(token));
});

test("rejects scanner session tokens for a different event", () => {
    const token = createScannerToken({
        eventId: 42,
        scannerLinkId: "scanner-session-id",
        expiresAt: new Date(Date.now() + 60_000),
    });

    assert.equal(parseScannerToken(token, 43), null);
});

test("rejects tampered scanner session tokens", () => {
    const token = createScannerToken({
        eventId: 42,
        scannerLinkId: "scanner-session-id",
        expiresAt: new Date(Date.now() + 60_000),
    });
    const tampered = token.replace("scanner-session-id", "another-session-id");

    assert.equal(parseScannerToken(tampered, 42), null);
});

test("accepts usable scanner link records", () => {
    const now = new Date("2026-07-13T10:00:00.000Z");
    const expiresAt = new Date("2026-07-13T11:00:00.000Z");
    const token = createScannerToken({
        eventId: 42,
        scannerLinkId: "scanner-session-id",
        expiresAt,
    });
    const parsed = parseScannerToken(token, 42);

    assert.equal(
        isScannerLinkUsable(
            parsed,
            {
                id: "scanner-session-id",
                eventId: 42,
                tokenHash: hashScannerToken(token),
                expiresAt,
                revokedAt: null,
            },
            now
        ),
        true
    );
});

test("rejects revoked, expired or mismatched scanner link records", () => {
    const now = new Date("2026-07-13T10:00:00.000Z");
    const expiresAt = new Date("2026-07-13T11:00:00.000Z");
    const token = createScannerToken({
        eventId: 42,
        scannerLinkId: "scanner-session-id",
        expiresAt,
    });
    const parsed = parseScannerToken(token, 42);
    const link = {
        id: "scanner-session-id",
        eventId: 42,
        tokenHash: hashScannerToken(token),
        expiresAt,
        revokedAt: null,
    };

    assert.equal(isScannerLinkUsable(parsed, { ...link, revokedAt: now }, now), false);
    assert.equal(
        isScannerLinkUsable(
            parsed,
            { ...link, expiresAt: new Date("2026-07-13T09:00:00.000Z") },
            now
        ),
        false
    );
    assert.equal(isScannerLinkUsable(parsed, { ...link, tokenHash: "wrong" }, now), false);
    assert.equal(isScannerLinkUsable(null, link, now), false);
});
