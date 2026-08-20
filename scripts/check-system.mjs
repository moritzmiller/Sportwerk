import nextEnv from "@next/env";
import pg from "pg";
import nodemailer from "nodemailer";
import { validateEnv } from "../src/lib/env.js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const args = new Set(process.argv.slice(2));
const skipNetwork =
    args.has("--skip-network") ||
    process.env.SYSTEM_CHECK_SKIP_NETWORK === "1" ||
    process.env.SYSTEM_CHECK_SKIP_NETWORK === "true";

const CHECK_TIMEOUT_MS = Number(process.env.SYSTEM_CHECK_TIMEOUT_MS || 6000);

const results = [];

function addResult(area, status, message, details = []) {
    results.push({ area, status, message, details });
}

function statusLabel(status) {
    if (status === "ok") return "OK";
    if (status === "warning") return "WARN";
    if (status === "disabled") return "DISABLED";
    return "ERROR";
}

function timeoutSignal(ms) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);
    return {
        signal: controller.signal,
        clear: () => clearTimeout(timeout),
    };
}

function classifyDatabaseError(error) {
    const code = error?.code || "";
    const message = String(error?.message || "");

    if (code === "ENOTFOUND" || /getaddrinfo|ENOTFOUND/i.test(message)) {
        return "Database host is not reachable or DNS cannot resolve it.";
    }

    if (code === "ECONNREFUSED") {
        return "Database host refused the connection.";
    }

    if (code === "28P01" || /password authentication failed/i.test(message)) {
        return "Database authentication failed.";
    }

    if (/PrismaClientInitializationError|@prisma\/client did not initialize/i.test(message)) {
        return "Prisma Client is not generated correctly. Run `npx prisma generate`.";
    }

    if (/timeout|ETIMEDOUT|AbortError/i.test(message)) {
        return "Database connection timed out.";
    }

    return "Database check failed.";
}

async function checkDatabase(envResult) {
    if (!envResult.config.databaseUrl) {
        addResult("database", "error", "DATABASE_URL is missing.");
        return;
    }

    try {
        const prismaModule = await import("@prisma/client");
        if (typeof prismaModule.PrismaClient !== "function") {
            throw new Error("@prisma/client did not initialize PrismaClient.");
        }
    } catch (error) {
        addResult("database", "error", "Prisma Client is not generated correctly.", [
            "Run `npx prisma generate`.",
        ]);
        return;
    }

    if (skipNetwork) {
        addResult("database", "warning", "Network database probe skipped.");
        return;
    }

    const pool = new pg.Pool({
        connectionString: envResult.config.databaseUrl,
        connectionTimeoutMillis: CHECK_TIMEOUT_MS,
        idleTimeoutMillis: 1000,
        max: 1,
    });

    try {
        const result = await pool.query("SELECT 1 AS ok");
        if (result.rows?.[0]?.ok === 1) {
            addResult("database", "ok", "Database is reachable and accepted SELECT 1.");
        } else {
            addResult("database", "error", "Database responded unexpectedly.");
        }
    } catch (error) {
        addResult("database", "error", classifyDatabaseError(error));
    } finally {
        await pool.end().catch(() => {});
    }
}

async function checkSupabase(envResult) {
    const { supabase } = envResult.config;
    if (!supabase.configured) {
        addResult("supabase", "error", "Supabase URL or anon key is missing.");
        return;
    }

    const details = [];
    details.push(supabase.adminConfigured ? "Service role key is configured for server-only admin operations." : "Service role key is missing.");
    details.push("Auth redirects should include APP_URL/auth and APP_URL/auth/reset-password in Supabase.");

    if (skipNetwork) {
        addResult("supabase", "warning", "Network Supabase probe skipped.", details);
        return;
    }

    const timer = timeoutSignal(CHECK_TIMEOUT_MS);
    try {
        const response = await fetch(`${supabase.url}/auth/v1/health`, {
            headers: {
                apikey: supabase.anonKey,
            },
            signal: timer.signal,
        });

        if (response.ok) {
            addResult("supabase", "ok", "Supabase Auth health endpoint is reachable.", details);
        } else {
            addResult("supabase", "error", `Supabase Auth health returned HTTP ${response.status}.`, details);
        }
    } catch (error) {
        addResult("supabase", "error", `Supabase Auth health check failed: ${error?.name || "request error"}.`, details);
    } finally {
        timer.clear();
    }
}

async function checkPayPal(envResult) {
    const { paypal } = envResult.config;
    if (!paypal.enabled) {
        addResult("paypal", "disabled", "PayPal is disabled because credentials or PAYPAL_ENV are missing.");
        return;
    }

    if (skipNetwork) {
        addResult("paypal", "warning", `PayPal ${paypal.env} network probe skipped.`);
        return;
    }

    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const timer = timeoutSignal(CHECK_TIMEOUT_MS);

    try {
        const response = await fetch(`${paypal.baseUrl}/v1/oauth2/token`, {
            method: "POST",
            headers: {
                Authorization: `Basic ${auth}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials",
            signal: timer.signal,
        });

        if (response.ok) {
            addResult("paypal", "ok", `PayPal ${paypal.env} credentials are accepted.`);
        } else if (response.status === 401) {
            addResult("paypal", "error", `PayPal ${paypal.env} authentication failed.`);
        } else {
            addResult("paypal", "error", `PayPal ${paypal.env} token endpoint returned HTTP ${response.status}.`);
        }
    } catch (error) {
        addResult("paypal", "error", `PayPal ${paypal.env} check failed: ${error?.name || "request error"}.`);
    } finally {
        timer.clear();
    }
}

async function checkStripe(envResult) {
    const { stripe } = envResult.config;
    if (!stripe.enabled) {
        addResult("stripe", "disabled", "Stripe is disabled because STRIPE_SECRET_KEY is missing.");
        return;
    }

    const details = [
        stripe.webhookEnabled
            ? "Webhook secret is configured for /api/stripe/webhook."
            : "Webhook secret is missing; checkout return flow works, webhook reconciliation is disabled.",
    ];

    if (skipNetwork) {
        addResult("stripe", "warning", "Stripe network probe skipped.", details);
        return;
    }

    const timer = timeoutSignal(CHECK_TIMEOUT_MS);
    try {
        const response = await fetch("https://api.stripe.com/v1/account", {
            headers: {
                Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
            },
            signal: timer.signal,
        });

        if (response.ok) {
            addResult("stripe", "ok", "Stripe secret key is accepted.", details);
        } else if (response.status === 401 || response.status === 403) {
            addResult("stripe", "error", "Stripe secret key was rejected.", details);
        } else {
            addResult("stripe", "warning", `Stripe account endpoint returned HTTP ${response.status}.`, details);
        }
    } catch (error) {
        addResult("stripe", "error", `Stripe check failed: ${error?.name || "request error"}.`, details);
    } finally {
        timer.clear();
    }
}

async function checkMail(envResult) {
    const { mail } = envResult.config;
    if (!mail.enabled) {
        addResult("mail", "disabled", "Transactional mail is not configured.");
        return;
    }

    if (skipNetwork) {
        addResult("mail", "warning", "Mail provider network probe skipped.");
        return;
    }

    if (mail.hasSmtp && (mail.provider === "smtp" || mail.provider === "auto")) {
        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_SERVER_HOST,
            port: mail.smtpPort,
            secure: process.env.EMAIL_SERVER_SECURE === "true" || mail.smtpPort === 465,
            auth: {
                user: process.env.EMAIL_SERVER_USER,
                pass: process.env.EMAIL_SERVER_PASSWORD,
            },
            connectionTimeout: CHECK_TIMEOUT_MS,
            greetingTimeout: CHECK_TIMEOUT_MS,
            socketTimeout: CHECK_TIMEOUT_MS,
        });

        try {
            await transporter.verify();
            addResult("mail", "ok", "SMTP provider accepted the connection.");
            return;
        } catch (error) {
            addResult("mail", "error", `SMTP verification failed: ${error?.code || error?.name || "mail error"}.`);
            return;
        }
    }

    if (mail.hasResend) {
        const timer = timeoutSignal(CHECK_TIMEOUT_MS);
        try {
            const response = await fetch("https://api.resend.com/domains", {
                headers: {
                    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                },
                signal: timer.signal,
            });

            if (response.ok) {
                addResult("mail", "ok", "Resend API key is accepted.");
            } else if (response.status === 401 || response.status === 403) {
                addResult("mail", "error", "Resend API key was rejected.");
            } else {
                addResult("mail", "warning", `Resend API returned HTTP ${response.status}; key format is present but domain status needs dashboard verification.`);
            }
        } catch (error) {
            addResult("mail", "error", `Resend check failed: ${error?.name || "request error"}.`);
        } finally {
            timer.clear();
        }
    }
}

function checkRedirects(envResult) {
    const appUrlErrors = envResult.errors.filter((issue) => issue.area === "app-url");
    if (appUrlErrors.length > 0) {
        addResult(
            "redirects",
            "error",
            "Redirect base URL is invalid; fix APP_URL and NEXT_PUBLIC_APP_URL before configuring Supabase redirects."
        );
        return;
    }

    const { appUrl, publicAppUrl } = envResult.config;
    if (!appUrl) {
        addResult("redirects", "error", "APP_URL or NEXT_PUBLIC_APP_URL is missing.");
        return;
    }

    addResult("redirects", "ok", "Redirect base URL is configured.", [
        `Login/confirmation: ${appUrl}/auth`,
        `Password reset: ${appUrl}/auth/reset-password`,
        publicAppUrl === appUrl
            ? "Public and server app URLs match."
            : "Public app URL differs or is not set; validate this before production.",
    ]);
}

function printResults(envResult) {
    console.log("GateKeeper system check");
    console.log(`NODE_ENV=${envResult.nodeEnv}`);
    if (skipNetwork) console.log("Network probes: skipped");
    console.log("");

    for (const result of results) {
        console.log(`[${statusLabel(result.status)}] ${result.area}: ${result.message}`);
        for (const detail of result.details || []) {
            console.log(`  - ${detail}`);
        }
    }

    if (envResult.warnings.length > 0) {
        console.log("");
        console.log("Environment warnings:");
        for (const warning of envResult.warnings) {
            console.log(`- ${warning.area}: ${warning.message}${warning.variable ? ` (${warning.variable})` : ""}`);
        }
    }

    if (envResult.errors.length > 0) {
        console.log("");
        console.log("Environment errors:");
        for (const error of envResult.errors) {
            console.log(`- ${error.area}: ${error.message}${error.variable ? ` (${error.variable})` : ""}`);
        }
    }
}

async function main() {
    const envResult = validateEnv(process.env);

    if (envResult.ok) {
        addResult("environment", "ok", "Environment structure is valid.");
    } else {
        addResult("environment", "error", "Environment structure has critical errors.");
    }

    checkRedirects(envResult);
    await checkDatabase(envResult);
    await checkSupabase(envResult);
    await checkPayPal(envResult);
    await checkStripe(envResult);
    await checkMail(envResult);

    printResults(envResult);

    const hasCriticalResult = results.some((result) => result.status === "error");
    process.exit(hasCriticalResult || !envResult.ok ? 1 : 0);
}

main().catch((error) => {
    console.error("System check crashed without exposing secrets:", error?.message || error);
    process.exit(1);
});
