import assert from "node:assert/strict";
import test from "node:test";
import { buildAuthDiagnostics } from "../src/lib/auth-diagnostics.js";

const COMPLETE_ENV = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:password@db.example.com:5432/gatekeeper",
    APP_URL: "https://gatekeeper.example.com",
    NEXT_PUBLIC_APP_URL: "https://gatekeeper.example.com",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-with-enough-length",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-with-enough-length",
    PAYPAL_ENV: "live",
    PAYPAL_CLIENT_ID: "paypal-client-id",
    PAYPAL_CLIENT_SECRET: "paypal-client-secret",
    PAYPAL_WEBHOOK_ID: "paypal-webhook-id",
    EMAIL_FROM: "mail@gatekeeper.example.com",
    EMAIL_PROVIDER: "smtp",
    EMAIL_SERVER_HOST: "smtp.example.com",
    EMAIL_SERVER_PORT: "587",
    EMAIL_SERVER_USER: "smtp-user",
    EMAIL_SERVER_PASSWORD: "smtp-password",
    TICKET_QR_SECRET: "ticket-secret-with-at-least-24-chars",
    SCANNER_LINK_SECRET: "scanner-secret-with-at-least-24-chars",
    BANK_TRANSFER_ACCOUNT_HOLDER: "GateKeeper",
    BANK_TRANSFER_IBAN: "DE00000000000000000000",
    BANK_TRANSFER_BIC: "EXAMPLED0",
    CRON_SECRET: "cron-secret-with-at-least-24-chars",
};

function createPrisma(profile) {
    return {
        user: {
            findUnique: async () => profile,
        },
    };
}

function createSupabase(user, error = null) {
    return {
        auth: {
            admin: {
                getUserById: async () => ({
                    data: { user },
                    error,
                }),
            },
        },
    };
}

test("buildAuthDiagnostics reports a healthy confirmed account", async () => {
    const diagnostics = await buildAuthDiagnostics({
        email: " USER@example.COM ",
        env: COMPLETE_ENV,
        prismaClient: createPrisma({
            id: "auth-user-1",
            email: "user@example.com",
            name: "User",
            role: "VISITOR",
            disabledAt: null,
            disabledReason: null,
        }),
        supabaseAdminClient: createSupabase({
            id: "auth-user-1",
            email: "user@example.com",
            email_confirmed_at: "2026-07-13T10:00:00.000Z",
            confirmed_at: "2026-07-13T10:00:00.000Z",
            last_sign_in_at: "2026-07-13T11:00:00.000Z",
            identities: [{ provider: "email" }],
        }),
    });

    assert.equal(diagnostics.ok, true);
    assert.equal(diagnostics.email, "user@example.com");
    assert.equal(diagnostics.account.gatekeeperProfile.role, "VISITOR");
    assert.equal(diagnostics.account.supabaseUser.providers[0], "email");
});

test("buildAuthDiagnostics flags disabled GateKeeper profiles", async () => {
    const diagnostics = await buildAuthDiagnostics({
        email: "user@example.com",
        env: COMPLETE_ENV,
        prismaClient: createPrisma({
            id: "auth-user-1",
            email: "user@example.com",
            name: "User",
            role: "VISITOR",
            disabledAt: new Date("2026-07-13T10:00:00.000Z"),
            disabledReason: "manual test",
        }),
        supabaseAdminClient: createSupabase({
            id: "auth-user-1",
            email: "user@example.com",
            email_confirmed_at: "2026-07-13T10:00:00.000Z",
        }),
    });

    assert.equal(diagnostics.ok, false);
    assert.equal(
        diagnostics.checks.find((check) => check.id === "app-profile").status,
        "error"
    );
});

test("buildAuthDiagnostics flags unconfirmed Supabase accounts", async () => {
    const diagnostics = await buildAuthDiagnostics({
        email: "user@example.com",
        env: COMPLETE_ENV,
        prismaClient: createPrisma({
            id: "auth-user-1",
            email: "user@example.com",
            name: "User",
            role: "VISITOR",
            disabledAt: null,
            disabledReason: null,
        }),
        supabaseAdminClient: createSupabase({
            id: "auth-user-1",
            email: "user@example.com",
            email_confirmed_at: null,
            confirmed_at: null,
        }),
    });

    assert.equal(diagnostics.ok, false);
    assert.equal(
        diagnostics.checks.find((check) => check.id === "supabase-account").message,
        "Supabase-Account ist vorhanden, aber noch nicht bestaetigt."
    );
});

test("buildAuthDiagnostics avoids account lookups without service role config", async () => {
    const diagnostics = await buildAuthDiagnostics({
        email: "user@example.com",
        env: {
            ...COMPLETE_ENV,
            SUPABASE_SERVICE_ROLE_KEY: "",
            NODE_ENV: "development",
        },
    });

    assert.equal(diagnostics.account, null);
    assert.equal(
        diagnostics.checks.find((check) => check.id === "account").status,
        "warning"
    );
});
