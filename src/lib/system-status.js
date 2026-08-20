import { validateEnv } from "./env.js";

const CHECKS = [
    {
        id: "environment",
        label: "Environment",
        area: "env",
        ok: "Runtime-Modus ist gültig.",
        warning: "Environment hat Warnungen.",
        error: "Environment hat kritische Fehler.",
    },
    {
        id: "database",
        label: "Datenbank",
        area: "database",
        ok: "PostgreSQL-URLs sind konfiguriert.",
        warning: "Datenbank nutzt lokale oder unvollständige Entwicklungswerte.",
        error: "Datenbank-Konfiguration ist unvollständig oder ungültig.",
    },
    {
        id: "redirects",
        label: "Redirects",
        area: "app-url",
        ok: "APP_URL und public App-URL sind gültig.",
        warning: "Redirect-Basis sollte vor Deployment geprüft werden.",
        error: "Redirect-Basis ist ungültig.",
    },
    {
        id: "supabase",
        label: "Supabase Auth",
        area: "supabase",
        ok: "Supabase URL und Keys sind gesetzt.",
        warning: "Supabase ist lokal noch nicht vollständig konfiguriert.",
        error: "Supabase-Konfiguration ist unvollständig.",
    },
    {
        id: "paypal",
        label: "PayPal",
        area: "paypal",
        ok: "PayPal ist inklusive Webhook-Struktur konfiguriert.",
        warning: "PayPal ist deaktiviert oder Webhook fehlt in Development.",
        error: "PayPal-Konfiguration blockiert Produktion.",
    },
    {
        id: "stripe",
        label: "Stripe",
        area: "stripe",
        ok: "Stripe ist inklusive Webhook-Struktur konfiguriert.",
        warning: "Stripe ist deaktiviert oder Webhook fehlt in Development.",
        error: "Stripe-Konfiguration blockiert Produktion.",
    },
    {
        id: "mollie",
        label: "Mollie",
        area: "mollie",
        ok: "Mollie ist deaktiviert oder gueltig konfiguriert.",
        warning: "Mollie-Konfiguration sollte vor Sandbox-Test geprueft werden.",
        error: "Mollie-Konfiguration blockiert Produktion.",
    },
    {
        id: "mail",
        label: "Transaktionsmails",
        area: "mail",
        ok: "Mail-Provider ist konfiguriert.",
        warning: "Transaktionsmails sind lokal deaktiviert oder unvollständig.",
        error: "Mail-Konfiguration ist für Produktion unvollständig.",
    },
    {
        id: "security",
        label: "Secrets",
        area: "security",
        ok: "Ticket- und Scanner-Secrets sind gesetzt.",
        warning: "Lokale Secret-Fallbacks können in Development genutzt werden.",
        error: "Produktions-Secrets fehlen oder sind unsicher.",
    },
    {
        id: "cron",
        label: "Cron",
        area: "cron",
        ok: "Cron-Secret ist gesetzt.",
        warning: "Cron-Secret fehlt lokal.",
        error: "Cron-Secret fehlt in Produktion.",
    },
    {
        id: "manual-payments",
        label: "Manuelle Zahlungen",
        area: "manual-payments",
        ok: "Bankdaten für manuelle Zahlungen sind gesetzt.",
        warning: "Bankdaten sind lokal unvollständig.",
        error: "Bankdaten für angebotene Zahlungsarten fehlen.",
    },
];

function statusFor(check, result) {
    const errors = result.errors.filter((issue) => issue.area === check.area);
    const warnings = result.warnings.filter((issue) => issue.area === check.area);

    if (check.id === "environment" && !result.ok) {
        return {
            status: "error",
            message: check.error,
            issues: result.errors.map((issue) => issue.message),
        };
    }

    if (errors.length > 0) {
        return {
            status: "error",
            message: check.error,
            issues: errors.map((issue) => issue.message),
        };
    }

    if (warnings.length > 0) {
        return {
            status: "warning",
            message: check.warning,
            issues: warnings.map((issue) => issue.message),
        };
    }

    return {
        status: "ok",
        message: check.ok,
        issues: [],
    };
}

export function buildSystemStatus(env = process.env) {
    const result = validateEnv(env);
    const checks = CHECKS.map((check) => ({
        id: check.id,
        label: check.label,
        ...statusFor(check, result),
    }));

    const counts = checks.reduce(
        (acc, check) => {
            acc[check.status] += 1;
            return acc;
        },
        { ok: 0, warning: 0, error: 0 }
    );

    return {
        ok: result.ok,
        nodeEnv: result.nodeEnv,
        production: result.production,
        counts,
        checks,
        summary: {
            appUrl: result.config.appUrl || result.config.publicAppUrl || "nicht gesetzt",
            supabase: result.config.supabase.configured ? "konfiguriert" : "fehlt",
            paypal: result.config.paypal.enabled ? result.config.paypal.env : "deaktiviert",
            paypalWebhook: result.config.paypal.webhookEnabled ? "konfiguriert" : "fehlt",
            stripe: result.config.stripe.enabled ? "konfiguriert" : "deaktiviert",
            stripeWebhook: result.config.stripe.webhookEnabled ? "konfiguriert" : "fehlt",
            mollie: result.config.mollie.enabled ? result.config.mollie.env : "deaktiviert",
            mollieWebhook: result.config.mollie.webhookEnabled ? "konfiguriert" : "status-nachladen",
            mail: result.config.mail.enabled ? "konfiguriert" : "deaktiviert",
        },
    };
}
