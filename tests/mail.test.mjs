import assert from "node:assert/strict";
import test from "node:test";

import { sendTransactionalMail } from "../src/lib/mail.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function restoreGlobals() {
    process.env = { ...ORIGINAL_ENV };
    globalThis.fetch = ORIGINAL_FETCH;
}

test.afterEach(restoreGlobals);

test("sends Resend mail with a plain EMAIL_FROM address", async () => {
    let payload;
    process.env.EMAIL_PROVIDER = "resend";
    process.env.EMAIL_FROM = "noreply@gatekeeper.example.com";
    process.env.RESEND_API_KEY = "re_test";
    globalThis.fetch = async (_url, options) => {
        payload = JSON.parse(options.body);
        return { ok: true };
    };

    const result = await sendTransactionalMail({
        to: "moritz@example.com",
        subject: "GateKeeper Resend Test",
        html: "<p>ok</p>",
    });

    assert.deepEqual(result, { ok: true, provider: "resend" });
    assert.equal(payload.from, "\"GateKeeper\" <noreply@gatekeeper.example.com>");
});

test("does not wrap an EMAIL_FROM address that already has a display name", async () => {
    let payload;
    process.env.EMAIL_PROVIDER = "resend";
    process.env.EMAIL_FROM = "GateKeeper <noreply@gatekeeper.example.com>";
    process.env.RESEND_API_KEY = "re_test";
    globalThis.fetch = async (_url, options) => {
        payload = JSON.parse(options.body);
        return { ok: true };
    };

    const result = await sendTransactionalMail({
        to: "moritz@example.com",
        subject: "GateKeeper Resend Test",
        html: "<p>ok</p>",
    });

    assert.deepEqual(result, { ok: true, provider: "resend" });
    assert.equal(payload.from, "GateKeeper <noreply@gatekeeper.example.com>");
});
