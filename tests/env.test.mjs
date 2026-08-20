import assert from "node:assert/strict";
import test from "node:test";
import { validateEnv, summarizePublicConfig, getAppUrl } from "../src/lib/env.js";

const baseProductionEnv = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://gatekeeper_app:strong-db-pass@app-db.internal:5432/gatekeeper",
    DIRECT_URL: "postgresql://gatekeeper_direct:strong-direct-pass@app-db.internal:5432/gatekeeper",
    DATABASE_POOL_MAX: "5",
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

function withEnv(overrides = {}) {
    return {
        ...baseProductionEnv,
        ...overrides,
    };
}

function messages(result) {
    return result.errors.map((issue) => issue.message).join("\n");
}

function requestFor(origin) {
    const url = new URL(origin);
    return {
        headers: {
            get(name) {
                if (name === "host") return url.host;
                if (name === "x-forwarded-proto") return url.protocol.replace(":", "");
                return null;
            },
        },
    };
}

test("reports missing required production variables", () => {
    const result = validateEnv({ NODE_ENV: "production" });

    assert.equal(result.ok, false);
    assert.match(messages(result), /DATABASE_URL is required/);
    assert.match(messages(result), /APP_URL is required|APP_URL/);
    assert.match(messages(result), /NEXT_PUBLIC_SUPABASE_ANON_KEY is required/);
});

test("treats empty strings as missing values", () => {
    const result = validateEnv(withEnv({ DATABASE_URL: "   " }));

    assert.equal(result.ok, false);
    assert.match(messages(result), /DATABASE_URL is required/);
});

test("rejects invalid URLs", () => {
    const result = validateEnv(withEnv({ APP_URL: "not-a-url" }));

    assert.equal(result.ok, false);
    assert.match(messages(result), /APP_URL must be a valid URL/);
});

test("rejects localhost URLs in production", () => {
    const result = validateEnv(
        withEnv({
            APP_URL: "http://localhost:3000",
            NEXT_PUBLIC_APP_URL: "http://localhost:3000",
            DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/postgres",
        })
    );

    assert.equal(result.ok, false);
    assert.match(messages(result), /localhost in production/);
    assert.match(messages(result), /HTTPS in production/);
});

test("allows localhost URLs in development with warnings", () => {
    const result = validateEnv({
        NODE_ENV: "development",
        APP_URL: "http://localhost:3000",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/postgres",
    });

    assert.equal(result.ok, true);
    assert.ok(result.warnings.some((issue) => /local service/.test(issue.message)));
});

test("uses the current request origin for auth redirects in development", () => {
    const appUrl = getAppUrl(requestFor("http://localhost:3001"), {
        NODE_ENV: "development",
        APP_URL: "http://localhost:3000",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });

    assert.equal(appUrl, "http://localhost:3001");
});

test("uses configured app url for auth redirects in production", () => {
    const appUrl = getAppUrl(requestFor("http://localhost:3001"), baseProductionEnv);

    assert.equal(appUrl, "https://gatekeeper.testdomain.dev");
});

test("reports missing database configuration", () => {
    const result = validateEnv(withEnv({ DATABASE_URL: undefined }));

    assert.equal(result.ok, false);
    assert.match(messages(result), /DATABASE_URL is required/);
});

test("rejects invalid database pool sizes", () => {
    const result = validateEnv(withEnv({ DATABASE_POOL_MAX: "200" }));

    assert.equal(result.ok, false);
    assert.match(messages(result), /DATABASE_POOL_MAX must be an integer/);
});

test("rejects PayPal sandbox in production unless explicitly allowed", () => {
    const result = validateEnv(withEnv({ PAYPAL_ENV: "sandbox" }));

    assert.equal(result.ok, false);
    assert.match(messages(result), /PAYPAL_ENV=sandbox is not allowed/);
});

test("allows explicit PayPal sandbox exception in production", () => {
    const result = validateEnv(
        withEnv({
            PAYPAL_ENV: "sandbox",
            PAYPAL_ALLOW_SANDBOX_IN_PRODUCTION: "true",
        })
    );

    assert.equal(result.ok, true);
});

test("requires PayPal webhook ID in production when PayPal is enabled", () => {
    const result = validateEnv(withEnv({ PAYPAL_WEBHOOK_ID: "" }));

    assert.equal(result.ok, false);
    assert.match(messages(result), /PAYPAL_WEBHOOK_ID is required/);
});

test("requires Stripe secret and webhook secret in production", () => {
    const result = validateEnv(
        withEnv({
            STRIPE_SECRET_KEY: "",
            STRIPE_WEBHOOK_SECRET: "",
        })
    );

    assert.equal(result.ok, false);
    assert.match(messages(result), /STRIPE_SECRET_KEY is required/);
});

test("requires Stripe webhook secret when card checkout is enabled", () => {
    const result = validateEnv(withEnv({ STRIPE_WEBHOOK_SECRET: "" }));

    assert.equal(result.ok, false);
    assert.match(messages(result), /STRIPE_WEBHOOK_SECRET is required/);
});

test("allows Mollie to be disabled and validates enabled production config", () => {
    const disabled = validateEnv(baseProductionEnv);
    assert.equal(disabled.ok, true);
    assert.equal(disabled.config.mollie.enabled, false);

    const enabled = validateEnv(
        withEnv({
            MOLLIE_ENV: "live",
            MOLLIE_API_KEY: "live_mollie_key_with_enough_length",
            MOLLIE_WEBHOOK_SECRET: "mollie-webhook-secret",
        })
    );
    assert.equal(enabled.ok, true);
    assert.equal(enabled.config.mollie.enabled, true);
    assert.equal(enabled.config.mollie.env, "live");
});

test("rejects Mollie test mode in production when enabled without exception", () => {
    const result = validateEnv(
        withEnv({
            MOLLIE_ENV: "test",
            MOLLIE_API_KEY: "test_mollie_key_with_enough_length",
            MOLLIE_WEBHOOK_SECRET: "mollie-webhook-secret",
        })
    );

    assert.equal(result.ok, false);
    assert.match(messages(result), /MOLLIE_ENV=test is not allowed/);
});

test("reports incomplete mail configuration", () => {
    const result = validateEnv(
        withEnv({
            EMAIL_PROVIDER: "smtp",
            EMAIL_FROM: "mail@gatekeeper.testdomain.dev",
            EMAIL_SERVER_HOST: "smtp.testdomain.dev",
            EMAIL_SERVER_USER: "",
            EMAIL_SERVER_PASSWORD: "smtp-password",
        })
    );

    assert.equal(result.ok, false);
    assert.match(messages(result), /SMTP mail config is incomplete/);
});

test("does not expose secrets in errors or summaries", () => {
    const secret = "super-secret-value-that-must-not-leak";
    const result = validateEnv(
        withEnv({
            PAYPAL_ENV: "invalid",
            PAYPAL_CLIENT_SECRET: secret,
            TICKET_QR_SECRET: secret,
        })
    );
    const publicSummary = JSON.stringify(summarizePublicConfig(withEnv({ TICKET_QR_SECRET: secret })));
    const errorText = JSON.stringify(result.errors);

    assert.equal(errorText.includes(secret), false);
    assert.equal(publicSummary.includes(secret), false);
});

test("rejects production placeholder values from the env template", () => {
    const result = validateEnv(
        withEnv({
            DATABASE_URL: "postgresql://USER:PASSWORD@HOST:5432/gatekeeper",
            APP_URL: "https://your-domain.example",
            NEXT_PUBLIC_APP_URL: "https://your-domain.example",
            PAYPAL_CLIENT_ID: "replace-with-paypal-client-id",
            STRIPE_SECRET_KEY: "replace-with-stripe-secret-key",
            BANK_TRANSFER_IBAN: "DE00 0000 0000 0000 0000 00",
        })
    );

    assert.equal(result.ok, false);
    assert.match(messages(result), /DATABASE_URL looks like a placeholder/);
    assert.match(messages(result), /APP_URL looks like a placeholder/);
    assert.match(messages(result), /PAYPAL_CLIENT_ID looks like a placeholder/);
    assert.match(messages(result), /STRIPE_SECRET_KEY looks like a placeholder/);
    assert.match(messages(result), /BANK_TRANSFER_IBAN looks like a placeholder/);
});

test("accepts a complete production configuration", () => {
    const result = validateEnv(baseProductionEnv);

    assert.equal(result.ok, true);
    assert.equal(result.config.appUrl, "https://gatekeeper.testdomain.dev");
    assert.equal(result.config.databasePoolMax, 5);
    assert.equal(result.config.paypal.enabled, true);
    assert.equal(result.config.stripe.enabled, true);
    assert.equal(result.config.mail.enabled, true);
});
