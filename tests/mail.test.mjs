import assert from "node:assert/strict";
import test from "node:test";
import QRCode from "qrcode";

import {
    generateTicketPDF,
    sendAccountVerificationEmail,
    sendContactRequestEmail,
} from "../src/lib/mail.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function restoreGlobals() {
    process.env = { ...ORIGINAL_ENV };
    globalThis.fetch = ORIGINAL_FETCH;
}

function configureResendCapture() {
    let payload;
    process.env = {
        ...ORIGINAL_ENV,
        NODE_ENV: "development",
        APP_URL: "https://gatekeeper.example.com",
        EMAIL_PROVIDER: "resend",
        EMAIL_FROM: "noreply@gatekeeper.example.com",
        RESEND_API_KEY: "re_test",
    };
    globalThis.fetch = async (_url, options) => {
        payload = JSON.parse(options.body);
        return { ok: true };
    };
    return () => payload;
}

test.afterEach(restoreGlobals);

test("ticket PDF generation embeds standard fonts without external AFM files", async () => {
    const ticketCode = "GK-TEST-TICKET";
    const qrCodeDataUrl = await QRCode.toDataURL(ticketCode);

    const pdf = await generateTicketPDF(
        {
            id: "booking-test-1",
            purchaserName: "Ada Lovelace",
            quantity: 2,
            event: {
                title: "Gatekeeper Test Event",
                startDate: new Date("2026-09-01T10:00:00.000Z"),
                location: "Testhalle",
                city: "Dresden",
            },
        },
        qrCodeDataUrl,
        ticketCode
    );

    assert.ok(Buffer.isBuffer(pdf));
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    assert.ok(pdf.length > 1000);
});

test("account verification mail uses the shared Gatekeeper design", async () => {
    const getPayload = configureResendCapture();

    const result = await sendAccountVerificationEmail(
        { email: "ada@example.com", name: "Ada" },
        "https://gatekeeper.example.com/auth/verify?token=abc"
    );
    const payload = getPayload();

    assert.deepEqual(result, { ok: true, provider: "resend" });
    assert.equal(payload.from, "\"Gatekeeper Sicherheit\" <noreply@gatekeeper.example.com>");
    assert.equal(payload.subject, "Gatekeeper Konto aktivieren");
    assert.match(payload.html, /Gatekeeper Sicherheit/);
    assert.match(payload.html, /E-Mail best/);
    assert.match(payload.html, /Konto aktivieren/);
    assert.match(payload.html, /#C8FF2E/);
    assert.doesNotMatch(payload.html, new RegExp("linear-gradient|\\\\u00|\\u00c3|\\u00e2"));
});

test("contact request mail keeps reply-to and uses the shared design", async () => {
    const getPayload = configureResendCapture();
    process.env.CONTACT_EMAIL = "support@gatekeeper.example.com";

    await sendContactRequestEmail({
        topic: "technical",
        name: "Ada Lovelace",
        email: "ada@example.com",
        bookingNumber: "GK-42",
        message: "Hallo <Team>,\nich brauche Hilfe.",
    });
    const payload = getPayload();

    assert.equal(payload.to[0], "support@gatekeeper.example.com");
    assert.equal(payload.reply_to, "ada@example.com");
    assert.equal(payload.subject, "Kontaktanfrage: Technisches Problem");
    assert.match(payload.html, /Gatekeeper Kontakt/);
    assert.match(payload.html, /Neue Kontaktanfrage/);
    assert.match(payload.html, /Hallo &lt;Team&gt;/);
    assert.doesNotMatch(payload.html, new RegExp("linear-gradient|\\\\u00|\\u00c3|\\u00e2"));
});
