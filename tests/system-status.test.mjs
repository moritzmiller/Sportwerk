import assert from "node:assert/strict";
import test from "node:test";
import { buildSystemStatus } from "../src/lib/system-status.js";

const productionEnv = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://gatekeeper_app:strong-db-pass@app-db.internal:5432/gatekeeper",
    DIRECT_URL: "postgresql://gatekeeper_direct:strong-direct-pass@app-db.internal:5432/gatekeeper",
    APP_URL: "https://gatekeeper.testdomain.dev",
    NEXT_PUBLIC_APP_URL: "https://gatekeeper.testdomain.dev",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-with-enough-length",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-with-enough-length",
    PAYPAL_ENV: "live",
    PAYPAL_CLIENT_ID: "paypal-live-client-id",
    PAYPAL_CLIENT_SECRET: "paypal-live-client-secret",
    PAYPAL_WEBHOOK_ID: "paypal-live-webhook-id",
    PAYPAL_CURRENCY: "EUR",
    STRIPE_SECRET_KEY: "sk_live_test_secret_key",
    STRIPE_WEBHOOK_SECRET: "whsec_live_test_secret",
    STRIPE_CURRENCY: "EUR",
    EMAIL_FROM: "mail@gatekeeper.testdomain.dev",
    EMAIL_PROVIDER: "smtp",
    EMAIL_SERVER_HOST: "smtp.testdomain.dev",
    EMAIL_SERVER_PORT: "587",
    EMAIL_SERVER_USER: "smtp-user",
    EMAIL_SERVER_PASSWORD: "smtp-password",
    EMAIL_SERVER_SECURE: "false",
    TICKET_QR_SECRET: "ticket-secret-with-at-least-24-chars",
    SCANNER_LINK_SECRET: "scanner-secret-with-at-least-24-chars",
    BANK_TRANSFER_ACCOUNT_HOLDER: "GateKeeper",
    BANK_TRANSFER_IBAN: "DE89370400440532013000",
    BANK_TRANSFER_BIC: "COBADEFFXXX",
    PAYMENT_REMINDER_INTERVALS: "3,7,14",
    PAYMENT_AUTO_CANCEL_AFTER_DAYS: "30",
    CRON_SECRET: "cron-secret-with-at-least-24-chars",
};

test("buildSystemStatus summarizes a complete production config without secrets", () => {
    const status = buildSystemStatus(productionEnv);
    const serialized = JSON.stringify(status);

    assert.equal(status.ok, true);
    assert.equal(status.counts.error, 0);
    assert.equal(status.summary.paypalWebhook, "konfiguriert");
    assert.equal(status.summary.stripeWebhook, "konfiguriert");
    assert.equal(status.summary.mollie, "deaktiviert");
    assert.equal(serialized.includes(productionEnv.PAYPAL_CLIENT_SECRET), false);
    assert.equal(serialized.includes(productionEnv.STRIPE_SECRET_KEY), false);
    assert.equal(serialized.includes(productionEnv.SUPABASE_SERVICE_ROLE_KEY), false);
});

test("buildSystemStatus marks missing PayPal webhook as production error", () => {
    const status = buildSystemStatus({
        ...productionEnv,
        PAYPAL_WEBHOOK_ID: "",
    });
    const paypal = status.checks.find((check) => check.id === "paypal");

    assert.equal(status.ok, false);
    assert.equal(paypal.status, "error");
    assert.match(paypal.issues.join("\n"), /PAYPAL_WEBHOOK_ID/);
});

test("buildSystemStatus marks missing Stripe webhook as production error", () => {
    const status = buildSystemStatus({
        ...productionEnv,
        STRIPE_WEBHOOK_SECRET: "",
    });
    const stripe = status.checks.find((check) => check.id === "stripe");

    assert.equal(status.ok, false);
    assert.equal(stripe.status, "error");
    assert.match(stripe.issues.join("\n"), /STRIPE_WEBHOOK_SECRET/);
});
