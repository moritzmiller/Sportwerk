const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const VALID_NODE_ENVS = new Set(["development", "test", "production"]);
const VALID_PAYPAL_ENVS = new Set(["sandbox", "live"]);
const VALID_MOLLIE_ENVS = new Set(["test", "live"]);
const VALID_EMAIL_PROVIDERS = new Set(["auto", "resend", "smtp"]);
const DUMMY_VALUES = new Set([
    "change-me",
    "change-me-now",
    "your-secret",
    "your-api-key",
    "example",
    "example-secret",
    "example-password",
    "your-supabase-anon-key",
    "your-supabase-service-role-key",
    "your-paypal-client-id",
    "your-paypal-client-secret",
    "your-stripe-secret-key",
    "your-stripe-webhook-secret",
    "your-mollie-api-key",
    "your-mollie-webhook-secret",
]);

function clean(value) {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function getFirst(env, names) {
    for (const name of names) {
        const value = clean(env[name]);
        if (value) return { name, value };
    }
    return { name: names[0], value: undefined };
}

function isLocalUrl(url) {
    return LOCAL_HOSTS.has(url.hostname);
}

function isDummyValue(value) {
    if (!value) return false;
    const normalized = String(value).trim().toLowerCase();
    return (
        DUMMY_VALUES.has(normalized) ||
        normalized.startsWith("your-") ||
        normalized.startsWith("replace-with-") ||
        normalized.includes("change-me")
    );
}

function isPlaceholderUrl(value, url) {
    const raw = String(value ?? "").trim().toLowerCase();
    const hostname = url?.hostname?.toLowerCase?.() ?? "";
    const username = decodeURIComponent(url?.username ?? "").toLowerCase();
    const password = decodeURIComponent(url?.password ?? "").toLowerCase();

    return (
        isDummyValue(raw) ||
        hostname === "host" ||
        hostname.endsWith(".example") ||
        hostname.includes("your-domain") ||
        username === "user" ||
        username === "username" ||
        password === "password"
    );
}

function mask(value) {
    if (!value) return "";
    const text = String(value);
    if (text.length <= 8) return "[set]";
    return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function addIssue(issues, level, area, message, variable, hint) {
    issues.push({
        level,
        area,
        message,
        variable,
        hint,
    });
}

function parseUrl({ env, issues, names, label, required, production, requireHttps, allowLocalInDev = true, protocols }) {
    const found = getFirst(env, names);
    if (!found.value) {
        if (required) {
            addIssue(issues, "error", label, `${found.name} is required.`, found.name);
        }
        return { value: undefined, source: found.name, url: null };
    }

    let url;
    try {
        url = new URL(found.value);
    } catch {
        addIssue(issues, "error", label, `${found.name} must be a valid URL.`, found.name);
        return { value: found.value, source: found.name, url: null };
    }

    if (protocols && !protocols.includes(url.protocol)) {
        addIssue(
            issues,
            "error",
            label,
            `${found.name} must use one of: ${protocols.join(", ")}.`,
            found.name
        );
    }

    if (requireHttps && production && url.protocol !== "https:") {
        addIssue(issues, "error", label, `${found.name} must use HTTPS in production.`, found.name);
    }

    if (production && isLocalUrl(url)) {
        addIssue(issues, "error", label, `${found.name} must not point to localhost in production.`, found.name);
    } else if (!production && isLocalUrl(url) && allowLocalInDev) {
        addIssue(issues, "warning", label, `${found.name} points to a local service.`, found.name);
    }

    if (production && found.value.endsWith("/")) {
        addIssue(issues, "error", label, `${found.name} must not end with a slash in production.`, found.name);
    }

    if (production && isPlaceholderUrl(found.value, url)) {
        addIssue(issues, "error", label, `${found.name} looks like a placeholder value.`, found.name);
    }

    return { value: found.value.replace(/\/$/, ""), source: found.name, url };
}

function readBool(env, name, fallback = false) {
    const value = clean(env[name]);
    if (!value) return fallback;
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function validateRequiredSecret({ env, issues, name, production, area, minLength = 16 }) {
    const value = clean(env[name]);
    if (!value) {
        if (production) {
            addIssue(issues, "error", area, `${name} is required in production.`, name);
        } else {
            addIssue(issues, "warning", area, `${name} is not set; development fallback may be used.`, name);
        }
        return undefined;
    }

    if (production && value.length < minLength) {
        addIssue(issues, "error", area, `${name} is too short for production.`, name);
    }

    if (production && isDummyValue(value)) {
        addIssue(issues, "error", area, `${name} looks like a placeholder value.`, name);
    }

    return value;
}

function validateMail(env, issues, production) {
    const provider = (clean(env.EMAIL_PROVIDER) || "auto").toLowerCase();
    if (!VALID_EMAIL_PROVIDERS.has(provider)) {
        addIssue(issues, "error", "mail", "EMAIL_PROVIDER must be auto, resend, or smtp.", "EMAIL_PROVIDER");
    }

    const from = clean(env.EMAIL_FROM);
    const resendKey = clean(env.RESEND_API_KEY);
    const smtpHost = clean(env.EMAIL_SERVER_HOST);
    const smtpUser = clean(env.EMAIL_SERVER_USER);
    const smtpPassword = clean(env.EMAIL_SERVER_PASSWORD);
    const smtpPort = clean(env.EMAIL_SERVER_PORT) || "587";
    const smtpSecure = clean(env.EMAIL_SERVER_SECURE);

    const hasResend = Boolean(from && resendKey);
    const smtpParts = [smtpHost, smtpUser, smtpPassword].filter(Boolean).length;
    const hasSmtp = Boolean(from && smtpHost && smtpUser && smtpPassword);

    if (resendKey && !from) {
        addIssue(issues, "error", "mail", "EMAIL_FROM is required when RESEND_API_KEY is set.", "EMAIL_FROM");
    }

    if (smtpParts > 0 && !hasSmtp) {
        addIssue(
            issues,
            "error",
            "mail",
            "SMTP mail config is incomplete; set EMAIL_SERVER_HOST, EMAIL_SERVER_USER, EMAIL_SERVER_PASSWORD, and EMAIL_FROM.",
            "EMAIL_SERVER_HOST"
        );
    }

    if (!/^\d+$/.test(smtpPort) || Number(smtpPort) <= 0 || Number(smtpPort) > 65535) {
        addIssue(issues, "error", "mail", "EMAIL_SERVER_PORT must be a valid TCP port.", "EMAIL_SERVER_PORT");
    }

    if (smtpSecure && !["true", "false"].includes(smtpSecure.toLowerCase())) {
        addIssue(issues, "error", "mail", "EMAIL_SERVER_SECURE must be true or false.", "EMAIL_SERVER_SECURE");
    }

    if (production && !hasResend && !hasSmtp) {
        addIssue(
            issues,
            "error",
            "mail",
            "Transactional mail is required in production; configure Resend or SMTP.",
            "EMAIL_FROM"
        );
    } else if (!hasResend && !hasSmtp) {
        addIssue(issues, "warning", "mail", "Transactional mail is disabled.", "EMAIL_FROM");
    }

    return {
        provider,
        from,
        hasResend,
        hasSmtp,
        enabled: hasResend || hasSmtp,
        smtpPort: Number(smtpPort),
    };
}

function validatePayPal(env, issues, production) {
    const paypalEnv = (clean(env.PAYPAL_ENV) || "").toLowerCase();
    const clientId = clean(env.PAYPAL_CLIENT_ID);
    const clientSecret = clean(env.PAYPAL_CLIENT_SECRET);
    const webhookId = clean(env.PAYPAL_WEBHOOK_ID);
    const currency = (clean(env.PAYPAL_CURRENCY) || "EUR").toUpperCase();
    const allowSandboxInProduction = readBool(env, "PAYPAL_ALLOW_SANDBOX_IN_PRODUCTION", false);

    if (!paypalEnv) {
        if (production) {
            addIssue(issues, "error", "paypal", "PAYPAL_ENV is required in production.", "PAYPAL_ENV");
        } else {
            addIssue(issues, "warning", "paypal", "PAYPAL_ENV is not set; PayPal is disabled.", "PAYPAL_ENV");
        }
    } else if (!VALID_PAYPAL_ENVS.has(paypalEnv)) {
        addIssue(issues, "error", "paypal", "PAYPAL_ENV must be sandbox or live.", "PAYPAL_ENV");
    }

    if (production && paypalEnv === "sandbox" && !allowSandboxInProduction) {
        addIssue(
            issues,
            "error",
            "paypal",
            "PAYPAL_ENV=sandbox is not allowed in production unless PAYPAL_ALLOW_SANDBOX_IN_PRODUCTION=true.",
            "PAYPAL_ENV"
        );
    }

    if ((clientId && !clientSecret) || (!clientId && clientSecret)) {
        addIssue(issues, "error", "paypal", "Both PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set.", "PAYPAL_CLIENT_ID");
    }

    if (production && (!clientId || !clientSecret)) {
        addIssue(issues, "error", "paypal", "PayPal credentials are required in production.", "PAYPAL_CLIENT_ID");
    } else if (!clientId || !clientSecret) {
        addIssue(issues, "warning", "paypal", "PayPal is disabled because credentials are missing.", "PAYPAL_CLIENT_ID");
    }

    if (production && clientId && clientSecret && paypalEnv && !webhookId) {
        addIssue(
            issues,
            "error",
            "paypal",
            "PAYPAL_WEBHOOK_ID is required in production so PayPal payment status can be verified server-side.",
            "PAYPAL_WEBHOOK_ID"
        );
    } else if (clientId && clientSecret && paypalEnv && !webhookId) {
        addIssue(
            issues,
            "warning",
            "paypal",
            "PAYPAL_WEBHOOK_ID is not set; PayPal webhook processing is disabled.",
            "PAYPAL_WEBHOOK_ID"
        );
    }

    if (production && clientId && isDummyValue(clientId)) {
        addIssue(issues, "error", "paypal", "PAYPAL_CLIENT_ID looks like a placeholder.", "PAYPAL_CLIENT_ID");
    }

    if (production && clientSecret && isDummyValue(clientSecret)) {
        addIssue(issues, "error", "paypal", "PAYPAL_CLIENT_SECRET looks like a placeholder.", "PAYPAL_CLIENT_SECRET");
    }

    if (production && webhookId && isDummyValue(webhookId)) {
        addIssue(issues, "error", "paypal", "PAYPAL_WEBHOOK_ID looks like a placeholder.", "PAYPAL_WEBHOOK_ID");
    }

    if (!/^[A-Z]{3}$/.test(currency)) {
        addIssue(issues, "error", "paypal", "PAYPAL_CURRENCY must be a 3-letter ISO currency code.", "PAYPAL_CURRENCY");
    }

    return {
        env: paypalEnv || null,
        enabled: Boolean(clientId && clientSecret && paypalEnv),
        webhookEnabled: Boolean(clientId && clientSecret && paypalEnv && webhookId),
        webhookId,
        currency,
        baseUrl:
            paypalEnv === "live"
                ? "https://api-m.paypal.com"
                : "https://api-m.sandbox.paypal.com",
    };
}

function validateStripe(env, issues, production) {
    const secretKey = clean(env.STRIPE_SECRET_KEY);
    const webhookSecret = clean(env.STRIPE_WEBHOOK_SECRET);
    const currency = (clean(env.STRIPE_CURRENCY) || "EUR").toUpperCase();

    if (production && !secretKey) {
        addIssue(issues, "error", "stripe", "STRIPE_SECRET_KEY is required in production.", "STRIPE_SECRET_KEY");
    } else if (!secretKey) {
        addIssue(issues, "warning", "stripe", "Stripe is disabled because STRIPE_SECRET_KEY is missing.", "STRIPE_SECRET_KEY");
    }

    if (production && secretKey && !webhookSecret) {
        addIssue(
            issues,
            "error",
            "stripe",
            "STRIPE_WEBHOOK_SECRET is required in production so card payments can be verified server-side.",
            "STRIPE_WEBHOOK_SECRET"
        );
    } else if (secretKey && !webhookSecret) {
        addIssue(
            issues,
            "warning",
            "stripe",
            "STRIPE_WEBHOOK_SECRET is not set; Stripe webhook processing is disabled.",
            "STRIPE_WEBHOOK_SECRET"
        );
    }

    if (production && secretKey && isDummyValue(secretKey)) {
        addIssue(issues, "error", "stripe", "STRIPE_SECRET_KEY looks like a placeholder.", "STRIPE_SECRET_KEY");
    }

    if (production && webhookSecret && isDummyValue(webhookSecret)) {
        addIssue(issues, "error", "stripe", "STRIPE_WEBHOOK_SECRET looks like a placeholder.", "STRIPE_WEBHOOK_SECRET");
    }

    if (!/^[A-Z]{3}$/.test(currency)) {
        addIssue(issues, "error", "stripe", "STRIPE_CURRENCY must be a 3-letter ISO currency code.", "STRIPE_CURRENCY");
    }

    return {
        enabled: Boolean(secretKey),
        webhookEnabled: Boolean(secretKey && webhookSecret),
        secretKey,
        webhookSecret,
        currency,
    };
}

function validateMollie(env, issues, production) {
    const mollieEnv = (clean(env.MOLLIE_ENV) || "test").toLowerCase();
    const apiKey = clean(env.MOLLIE_API_KEY);
    const webhookSecret = clean(env.MOLLIE_WEBHOOK_SECRET);
    const currency = (clean(env.MOLLIE_CURRENCY) || "EUR").toUpperCase();
    const allowTestInProduction = readBool(env, "MOLLIE_ALLOW_TEST_IN_PRODUCTION", false);

    if (!VALID_MOLLIE_ENVS.has(mollieEnv)) {
        addIssue(issues, "error", "mollie", "MOLLIE_ENV must be test or live.", "MOLLIE_ENV");
    }

    if (production && mollieEnv === "test" && apiKey && !allowTestInProduction) {
        addIssue(
            issues,
            "error",
            "mollie",
            "MOLLIE_ENV=test is not allowed in production unless MOLLIE_ALLOW_TEST_IN_PRODUCTION=true.",
            "MOLLIE_ENV"
        );
    }

    if (production && apiKey && isDummyValue(apiKey)) {
        addIssue(issues, "error", "mollie", "MOLLIE_API_KEY looks like a placeholder.", "MOLLIE_API_KEY");
    }

    if (production && webhookSecret && isDummyValue(webhookSecret)) {
        addIssue(issues, "error", "mollie", "MOLLIE_WEBHOOK_SECRET looks like a placeholder.", "MOLLIE_WEBHOOK_SECRET");
    }

    if (!/^[A-Z]{3}$/.test(currency)) {
        addIssue(issues, "error", "mollie", "MOLLIE_CURRENCY must be a 3-letter ISO currency code.", "MOLLIE_CURRENCY");
    }

    return {
        env: mollieEnv,
        enabled: Boolean(apiKey),
        webhookEnabled: Boolean(apiKey && webhookSecret),
        apiKey,
        webhookSecret,
        currency,
        baseUrl: "https://api.mollie.com/v2",
    };
}

function validateSupabase(env, issues, production) {
    const project = parseUrl({
        env,
        issues,
        names: ["NEXT_PUBLIC_SUPABASE_URL"],
        label: "supabase",
        required: production,
        production,
        requireHttps: true,
    });
    const anonKey = clean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const serviceRoleKey = clean(env.SUPABASE_SERVICE_ROLE_KEY);

    if (!anonKey) {
        if (production) addIssue(issues, "error", "supabase", "NEXT_PUBLIC_SUPABASE_ANON_KEY is required.", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
        else addIssue(issues, "warning", "supabase", "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }

    if (!serviceRoleKey) {
        if (production) addIssue(issues, "error", "supabase", "SUPABASE_SERVICE_ROLE_KEY is required for admin operations.", "SUPABASE_SERVICE_ROLE_KEY");
        else addIssue(issues, "warning", "supabase", "SUPABASE_SERVICE_ROLE_KEY is missing; admin auth operations will fail.", "SUPABASE_SERVICE_ROLE_KEY");
    }

    if (production && anonKey && isDummyValue(anonKey)) {
        addIssue(issues, "error", "supabase", "NEXT_PUBLIC_SUPABASE_ANON_KEY looks like a placeholder.", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }

    if (production && serviceRoleKey && isDummyValue(serviceRoleKey)) {
        addIssue(issues, "error", "supabase", "SUPABASE_SERVICE_ROLE_KEY looks like a placeholder.", "SUPABASE_SERVICE_ROLE_KEY");
    }

    return {
        url: project.value,
        anonKey,
        serviceRoleKey,
        configured: Boolean(project.value && anonKey),
        adminConfigured: Boolean(project.value && serviceRoleKey),
    };
}

function validateManualPayments(env, issues, production) {
    const holder = clean(env.BANK_TRANSFER_ACCOUNT_HOLDER);
    const iban = clean(env.BANK_TRANSFER_IBAN);
    const bic = clean(env.BANK_TRANSFER_BIC);

    if (production && (!holder || !iban || !bic)) {
        addIssue(
            issues,
            "error",
            "manual-payments",
            "Bank transfer details are required in production because BANK_TRANSFER is offered.",
            "BANK_TRANSFER_IBAN"
        );
    } else if (!holder || !iban || !bic) {
        addIssue(issues, "warning", "manual-payments", "Bank transfer details are incomplete.", "BANK_TRANSFER_IBAN");
    }

    if (production && holder && isDummyValue(holder)) {
        addIssue(issues, "error", "manual-payments", "BANK_TRANSFER_ACCOUNT_HOLDER looks like a placeholder.", "BANK_TRANSFER_ACCOUNT_HOLDER");
    }

    if (production && iban && (isDummyValue(iban) || /^DE0+$/i.test(iban.replace(/\s/g, "")))) {
        addIssue(issues, "error", "manual-payments", "BANK_TRANSFER_IBAN looks like a placeholder.", "BANK_TRANSFER_IBAN");
    }

    if (production && bic && isDummyValue(bic)) {
        addIssue(issues, "error", "manual-payments", "BANK_TRANSFER_BIC looks like a placeholder.", "BANK_TRANSFER_BIC");
    }

    return { holder, iban, bic };
}

function validateDatabasePool(env, issues) {
    const raw = clean(env.DATABASE_POOL_MAX) || "5";
    const value = Number(raw);

    if (!Number.isInteger(value) || value <= 0 || value > 20) {
        addIssue(
            issues,
            "error",
            "database",
            "DATABASE_POOL_MAX must be an integer between 1 and 20.",
            "DATABASE_POOL_MAX"
        );
        return 5;
    }

    return value;
}

export function validateEnv(inputEnv = process.env, options = {}) {
    const env = inputEnv || {};
    const nodeEnv = clean(env.NODE_ENV) || options.nodeEnv || "development";
    const issues = [];

    if (!VALID_NODE_ENVS.has(nodeEnv)) {
        addIssue(issues, "error", "env", "NODE_ENV must be development, test, or production.", "NODE_ENV");
    }

    const production = nodeEnv === "production";
    const database = parseUrl({
        env,
        issues,
        names: ["DATABASE_URL"],
        label: "database",
        required: production,
        production,
        requireHttps: false,
        protocols: ["postgresql:", "postgres:"],
    });
    const directDatabase = parseUrl({
        env,
        issues,
        names: ["DIRECT_URL"],
        label: "database",
        required: production,
        production,
        requireHttps: false,
        protocols: ["postgresql:", "postgres:"],
    });
    const appUrl = parseUrl({
        env,
        issues,
        names: ["APP_URL", "NEXT_PUBLIC_APP_URL", "APP_ORIGIN", "NEXT_PUBLIC_APP_ORIGIN"],
        label: "app-url",
        required: production,
        production,
        requireHttps: true,
    });
    const publicAppUrl = parseUrl({
        env,
        issues,
        names: ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_APP_ORIGIN"],
        label: "app-url",
        required: production,
        production,
        requireHttps: true,
    });

    if (production && appUrl.value && publicAppUrl.value && appUrl.value !== publicAppUrl.value) {
        addIssue(issues, "error", "app-url", "APP_URL and NEXT_PUBLIC_APP_URL must match in production.", "APP_URL");
    }

    const supabase = validateSupabase(env, issues, production);
    const paypal = validatePayPal(env, issues, production);
    const stripe = validateStripe(env, issues, production);
    const mollie = validateMollie(env, issues, production);
    const mail = validateMail(env, issues, production);
    const manualPayments = validateManualPayments(env, issues, production);
    const databasePoolMax = validateDatabasePool(env, issues);

    const ticketSecret = validateRequiredSecret({
        env,
        issues,
        name: "TICKET_QR_SECRET",
        production,
        area: "security",
        minLength: 24,
    });
    const scannerSecret = validateRequiredSecret({
        env,
        issues,
        name: "SCANNER_LINK_SECRET",
        production,
        area: "security",
        minLength: 24,
    });
    const cronSecret = validateRequiredSecret({
        env,
        issues,
        name: "CRON_SECRET",
        production,
        area: "cron",
        minLength: 24,
    });

    const reminderIntervals = clean(env.PAYMENT_REMINDER_INTERVALS) || "3,7,14";
    const autoCancelDays = clean(env.PAYMENT_AUTO_CANCEL_AFTER_DAYS) || "30";
    if (!/^\d+(,\d+)*$/.test(reminderIntervals)) {
        addIssue(issues, "error", "payments", "PAYMENT_REMINDER_INTERVALS must be a comma-separated list of positive integers.", "PAYMENT_REMINDER_INTERVALS");
    }
    if (!/^\d+$/.test(autoCancelDays) || Number(autoCancelDays) <= 0) {
        addIssue(issues, "error", "payments", "PAYMENT_AUTO_CANCEL_AFTER_DAYS must be a positive integer.", "PAYMENT_AUTO_CANCEL_AFTER_DAYS");
    }

    const errors = issues.filter((issue) => issue.level === "error");
    const warnings = issues.filter((issue) => issue.level === "warning");

    return {
        ok: errors.length === 0,
        nodeEnv,
        production,
        errors,
        warnings,
        issues,
        config: {
            databaseUrl: database.value,
            directUrl: directDatabase.value,
            databasePoolMax,
            appUrl: appUrl.value,
            publicAppUrl: publicAppUrl.value,
            supabase,
            paypal,
            stripe,
            mollie,
            mail,
            manualPayments,
            ticketSecret,
            scannerSecret,
            cronSecret,
            paymentReminderIntervals: reminderIntervals,
            paymentAutoCancelAfterDays: Number(autoCancelDays),
        },
    };
}

export function assertEnv(area = "runtime", env = process.env) {
    const result = validateEnv(env);
    if (!result.ok) {
        const detail = result.errors
            .map((issue) => `${issue.area}: ${issue.message}${issue.variable ? ` (${issue.variable})` : ""}`)
            .join("; ");
        throw new Error(`Invalid GateKeeper environment for ${area}: ${detail}`);
    }
    return result.config;
}

function assertArea(result, area, env = process.env) {
    if (result.production && result.errors.some((issue) => issue.area === area)) {
        assertEnv(area, env);
    }
}

export function getEnvConfig(env = process.env) {
    return validateEnv(env).config;
}

function getRequestOrigin(request) {
    if (!request?.headers?.get) return null;

    const proto = request.headers.get("x-forwarded-proto") || "http";
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (!host) return null;

    return `${proto}://${host}`.replace(/\/$/, "");
}

export function getAppUrl(request = null, env = process.env) {
    const result = validateEnv(env);
    assertArea(result, "app-url", env);
    const requestOrigin = getRequestOrigin(request);

    if (!result.production && requestOrigin) {
        return requestOrigin;
    }

    const configured = result.config.appUrl || result.config.publicAppUrl;
    if (configured) return configured;

    if (result.production) {
        assertEnv("app-url", env);
    }

    if (requestOrigin) {
        return requestOrigin;
    }

    return "http://localhost:3000";
}

export function getDatabaseUrl(env = process.env) {
    const result = validateEnv(env);
    assertArea(result, "database", env);
    const configured = result.config.databaseUrl;
    if (configured) return configured;

    if (result.production) {
        assertEnv("database", env);
    }

    return "postgresql://postgres:postgres@localhost:5432/postgres";
}

export function getSupabaseConfig(env = process.env) {
    const result = validateEnv(env);
    assertArea(result, "supabase", env);
    if (result.production && !result.config.supabase.configured) {
        assertEnv("supabase", env);
    }
    return result.config.supabase;
}

export function getPayPalConfig(env = process.env) {
    const result = validateEnv(env);
    assertArea(result, "paypal", env);
    return result.config.paypal;
}

export function getStripeConfig(env = process.env) {
    const result = validateEnv(env);
    assertArea(result, "stripe", env);
    return result.config.stripe;
}

export function getMollieConfig(env = process.env) {
    const result = validateEnv(env);
    assertArea(result, "mollie", env);
    return result.config.mollie;
}

export function getMailConfig(env = process.env) {
    const result = validateEnv(env);
    assertArea(result, "mail", env);
    return result.config.mail;
}

export function getTicketSecret(env = process.env) {
    const result = validateEnv(env);
    if (result.config.ticketSecret) return result.config.ticketSecret;
    if (result.production) assertEnv("ticket security", env);
    return "gatekeeper-local-ticket-secret";
}

export function getScannerSecret(env = process.env) {
    const result = validateEnv(env);
    if (result.config.scannerSecret) return result.config.scannerSecret;
    if (result.production) assertEnv("scanner security", env);
    return "gatekeeper-local-scanner-secret";
}

export function getCronSecret(env = process.env) {
    return clean(env.CRON_SECRET);
}

export function summarizePublicConfig(env = process.env) {
    const result = validateEnv(env);
    return {
        nodeEnv: result.nodeEnv,
        appUrl: result.config.appUrl,
        publicAppUrl: result.config.publicAppUrl,
        database: result.config.databaseUrl ? "configured" : "missing",
        supabase: result.config.supabase.configured ? "configured" : "missing",
        paypal: result.config.paypal.enabled ? `${result.config.paypal.env}` : "disabled",
        stripe: result.config.stripe.enabled ? "configured" : "disabled",
        mollie: result.config.mollie.enabled ? `${result.config.mollie.env}` : "disabled",
        mail: result.config.mail.enabled ? "configured" : "disabled",
        ticketSecret: result.config.ticketSecret ? mask(result.config.ticketSecret) : "missing",
        scannerSecret: result.config.scannerSecret ? mask(result.config.scannerSecret) : "missing",
        cronSecret: result.config.cronSecret ? mask(result.config.cronSecret) : "missing",
    };
}
