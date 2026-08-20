import assert from "node:assert/strict";
import test from "node:test";

import {
    getGeneratedAuthActionLink,
    isAuthEmailRateLimit,
    isAuthUserNotFoundError,
    isMailNotConfiguredError,
    passwordResetRedirectTo,
} from "../src/lib/auth-email-links.js";

test("extracts generated Supabase auth action links", () => {
    assert.equal(
        getGeneratedAuthActionLink({
            properties: {
                action_link: "https://gatekeeper.test/auth/reset-password?code=abc",
            },
        }),
        "https://gatekeeper.test/auth/reset-password?code=abc"
    );

    assert.equal(
        getGeneratedAuthActionLink({
            actionLink: "https://gatekeeper.test/auth/reset-password?code=def",
        }),
        "https://gatekeeper.test/auth/reset-password?code=def"
    );
});

test("returns an empty action link for incomplete Supabase responses", () => {
    assert.equal(getGeneratedAuthActionLink(null), "");
    assert.equal(getGeneratedAuthActionLink({ properties: {} }), "");
});

test("detects Supabase user-not-found errors without exposing account state", () => {
    assert.equal(isAuthUserNotFoundError({ status: 404, message: "User not found" }), true);
    assert.equal(isAuthUserNotFoundError({ code: "user_not_found" }), true);
    assert.equal(isAuthUserNotFoundError({ status: 500, message: "SMTP failed" }), false);
});

test("detects auth provider rate limits", () => {
    assert.equal(isAuthEmailRateLimit({ status: 429 }), true);
    assert.equal(isAuthEmailRateLimit({ code: "over_email_send_rate_limit" }), true);
    assert.equal(isAuthEmailRateLimit({ message: "Too many requests" }), true);
    assert.equal(isAuthEmailRateLimit({ message: "SMTP failed" }), false);
});

test("detects missing GateKeeper mail configuration", () => {
    assert.equal(isMailNotConfiguredError({ code: "MAIL_NOT_CONFIGURED" }), true);
    assert.equal(
        isMailNotConfiguredError({
            message:
                "No mail provider configured. Set RESEND_API_KEY + EMAIL_FROM or EMAIL_SERVER_HOST/USER/PASSWORD + EMAIL_FROM.",
        }),
        true
    );
    assert.equal(isMailNotConfiguredError({ message: "SMTP failed" }), false);
});

test("builds the password reset redirect URL", () => {
    assert.equal(
        passwordResetRedirectTo("https://gatekeeper.test"),
        "https://gatekeeper.test/auth/reset-password"
    );
});
