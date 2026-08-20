import assert from "node:assert/strict";
import test from "node:test";

import {
    PASSWORD_RESET_INTENT_KEY,
    clearPasswordResetIntent,
    getPasswordResetLinkState,
    hasPasswordResetIntent,
    markPasswordResetIntent,
    passwordResetRedirectTarget,
    shouldRedirectToPasswordReset,
} from "../src/lib/auth-reset-flow.js";

function memoryStorage() {
    const values = new Map();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
    };
}

test("detects Supabase recovery code links", () => {
    const state = getPasswordResetLinkState(
        "https://gatekeeper.test/auth/reset-password?code=abc&type=recovery"
    );

    assert.equal(state.hasRecoverySignal, true);
    assert.equal(state.code, "abc");
    assert.equal(state.type, "recovery");
});

test("detects Supabase hash token recovery links", () => {
    const state = getPasswordResetLinkState(
        "https://gatekeeper.test/auth/reset-password#access_token=at&refresh_token=rt&type=recovery"
    );

    assert.equal(state.hasRecoverySignal, true);
    assert.equal(state.accessToken, "at");
    assert.equal(state.refreshToken, "rt");
    assert.equal(state.type, "recovery");
});

test("detects token_hash recovery links without falling back to email verification", () => {
    const state = getPasswordResetLinkState(
        "https://gatekeeper.test/auth/reset-password?token_hash=hash&type=recovery"
    );

    assert.equal(state.hasRecoverySignal, true);
    assert.equal(state.tokenHash, "hash");
});

test("redirects recovery links from homepage to password reset page without losing hash", () => {
    const href = "https://gatekeeper.test/#access_token=at&refresh_token=rt&type=recovery";

    assert.equal(shouldRedirectToPasswordReset(href), true);
    assert.equal(
        passwordResetRedirectTarget(href),
        "/auth/reset-password#access_token=at&refresh_token=rt&type=recovery"
    );
});

test("does not redirect normal auth pages without recovery tokens", () => {
    assert.equal(shouldRedirectToPasswordReset("https://gatekeeper.test/auth"), false);
    assert.equal(shouldRedirectToPasswordReset("https://gatekeeper.test/auth/reset-password"), false);
});

test("tracks password reset intent in session storage", () => {
    const storage = memoryStorage();

    assert.equal(hasPasswordResetIntent(storage), false);
    markPasswordResetIntent(storage);
    assert.equal(storage.getItem(PASSWORD_RESET_INTENT_KEY), "1");
    assert.equal(hasPasswordResetIntent(storage), true);
    clearPasswordResetIntent(storage);
    assert.equal(hasPasswordResetIntent(storage), false);
});
