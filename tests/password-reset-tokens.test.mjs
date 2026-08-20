import assert from "node:assert/strict";
import test from "node:test";

process.env.SCANNER_LINK_SECRET = "test-reset-secret-with-enough-length";

const { createPasswordResetToken, verifyPasswordResetToken } = await import(
    "../src/lib/password-reset-tokens.js"
);

test("creates and verifies password reset tokens", () => {
    const now = new Date("2026-07-21T12:00:00.000Z");
    const token = createPasswordResetToken({
        userId: "user-1",
        email: "USER@example.com",
        now,
    });

    const parsed = verifyPasswordResetToken(token, new Date("2026-07-21T12:05:00.000Z"));

    assert.equal(parsed.ok, true);
    assert.equal(parsed.userId, "user-1");
    assert.equal(parsed.email, "user@example.com");
    assert.equal(parsed.expiresAt.toISOString(), "2026-07-21T12:30:00.000Z");
});

test("rejects tampered password reset tokens", () => {
    const token = createPasswordResetToken({
        userId: "user-1",
        email: "user@example.com",
        now: new Date("2026-07-21T12:00:00.000Z"),
    });

    const tampered = token.replace("user", "xxxx");

    assert.equal(verifyPasswordResetToken(tampered).ok, false);
});

test("rejects expired password reset tokens", () => {
    const token = createPasswordResetToken({
        userId: "user-1",
        email: "user@example.com",
        now: new Date("2026-07-21T12:00:00.000Z"),
        ttlMs: 1000,
    });

    const parsed = verifyPasswordResetToken(token, new Date("2026-07-21T12:00:02.000Z"));

    assert.equal(parsed.ok, false);
    assert.equal(parsed.reason, "expired");
});
