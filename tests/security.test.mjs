import assert from "node:assert/strict";
import test from "node:test";
import {
    InvalidJsonError,
    RequestBodyTooLargeError,
    isBotTrapTriggered,
    isValidEmail,
    normalizeEmail,
    normalizeSafeText,
    readJsonBody,
    requestBodyErrorResponse,
} from "../src/lib/security.js";

function jsonRequest(body, headers = {}) {
    return new Request("https://gatekeeper.test/api", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...headers,
        },
        body,
    });
}

test("readJsonBody parses valid JSON request bodies", async () => {
    const body = await readJsonBody(jsonRequest('{"email":"test@example.com","count":2}'));

    assert.deepEqual(body, {
        email: "test@example.com",
        count: 2,
    });
});

test("readJsonBody returns an empty object for empty request bodies", async () => {
    const body = await readJsonBody(new Request("https://gatekeeper.test/api", { method: "POST" }));

    assert.deepEqual(body, {});
});

test("readJsonBody rejects content-length values above the configured limit", async () => {
    await assert.rejects(
        readJsonBody(jsonRequest("{}", { "content-length": "20" }), { maxBytes: 8 }),
        RequestBodyTooLargeError
    );
});

test("readJsonBody rejects streamed bodies above the configured limit", async () => {
    await assert.rejects(
        readJsonBody(jsonRequest('{"message":"too large"}'), { maxBytes: 8 }),
        RequestBodyTooLargeError
    );
});

test("readJsonBody rejects invalid JSON", async () => {
    await assert.rejects(readJsonBody(jsonRequest("{invalid")), InvalidJsonError);
});

test("requestBodyErrorResponse maps body errors without exposing raw input", async () => {
    const tooLarge = requestBodyErrorResponse(new RequestBodyTooLargeError(12));
    assert.equal(tooLarge.status, 413);
    assert.equal(tooLarge.headers.get("X-Max-Body-Bytes"), "12");
    assert.deepEqual(await tooLarge.json(), { error: "Anfrage ist zu gross." });

    const invalid = requestBodyErrorResponse(new InvalidJsonError());
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: "Ung\u00fcltiges JSON." });
});

test("normalizeSafeText strips control characters, trims and limits text", () => {
    assert.equal(normalizeSafeText(" \u0000Hello\u0007 world  ", { maxLength: 8 }), "Hello wo");
    assert.equal(normalizeSafeText(null, { fallback: " fallback " }), "fallback");
});

test("email helpers normalize valid addresses and reject invalid ones", () => {
    assert.equal(normalizeEmail("  USER@Example.COM "), "user@example.com");
    assert.equal(isValidEmail("user@example.com"), true);
    assert.equal(isValidEmail("not-an-email"), false);
});

test("isBotTrapTriggered catches honeypot fields and too-fast submissions", () => {
    const now = Date.now();

    assert.equal(isBotTrapTriggered({ website: "filled" }), true);
    assert.equal(isBotTrapTriggered({ formStartedAt: now }), true);
    assert.equal(isBotTrapTriggered({ formStartedAt: now - 2000 }), false);
});
