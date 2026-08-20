import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getAppUrl, getSupabaseConfig } from "@/lib/env";
import { isTrustedWebhookRoute } from "@/lib/webhook-routes";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const RATE_LIMITS = [
    { pattern: /^\/api\/auth\/login$/, limit: 8, windowMs: 60 * 1000 },
    { pattern: /^\/api\/auth\/register$/, limit: 5, windowMs: 60 * 1000 },
    { pattern: /^\/api\/bookings$/, limit: 15, windowMs: 10 * 60 * 1000 },
    { pattern: /^\/api\/events\/[^/]+\/view$/, limit: 40, windowMs: 60 * 1000 },
    { pattern: /^\/api\//, limit: 120, windowMs: 60 * 1000 },
];
const DEFAULT_BODY_LIMIT = 128 * 1024;
const EVENT_BODY_LIMIT = 2 * 1024 * 1024;
const BOOKING_BODY_LIMIT = 64 * 1024;
const AUTH_BODY_LIMIT = 16 * 1024;
const SUSPICIOUS_MUTATION_AGENTS = [
    "curl",
    "wget",
    "python-requests",
    "httpclient",
    "libwww-perl",
    "scrapy",
];

const globalForSecurity = globalThis;
if (!globalForSecurity.rateLimitBuckets) {
    globalForSecurity.rateLimitBuckets = new Map();
}

function applySecurityHeaders(response) {
    const scriptSrc =
        process.env.NODE_ENV === "production"
            ? "script-src 'self' 'unsafe-inline' https://www.paypal.com https://www.paypalobjects.com https://js.stripe.com"
            : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.paypal.com https://www.paypalobjects.com https://js.stripe.com";

    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set(
        "Permissions-Policy",
        "camera=(self), microphone=(), geolocation=(), payment=(self)"
    );
    response.headers.set(
        "Content-Security-Policy",
        [
            "default-src 'self'",
            "base-uri 'self'",
            "object-src 'none'",
            "frame-ancestors 'none'",
            "img-src 'self' data: blob: https:",
            scriptSrc,
            "style-src 'self' 'unsafe-inline'",
            "font-src 'self' data:",
            "connect-src 'self' https://*.supabase.co https://api-m.sandbox.paypal.com https://api-m.paypal.com https://api.stripe.com",
            "frame-src https://www.paypal.com https://*.paypal.com https://js.stripe.com https://checkout.stripe.com",
            "form-action 'self'",
        ].join("; ")
    );

    if (process.env.NODE_ENV === "production") {
        response.headers.set(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains; preload"
        );
    }
}

function jsonError(message, status, extraHeaders = {}) {
    const response = NextResponse.json({ error: message }, { status });
    applySecurityHeaders(response);
    Object.entries(extraHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
    });
    return response;
}

function getClientIp(request) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
        return forwardedFor.split(",")[0].trim();
    }

    return (
        request.headers.get("x-real-ip") ||
        request.headers.get("cf-connecting-ip") ||
        "unknown"
    );
}

function sameHost(url, expectedHost) {
    try {
        return new URL(url).host === expectedHost;
    } catch {
        return false;
    }
}

function isAllowedOrigin(request) {
    const host = request.headers.get("host");
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    const fetchSite = request.headers.get("sec-fetch-site");
    const allowedOrigins = [
        `https://${host}`,
        `http://${host}`,
        getAppUrl(null),
    ].filter(Boolean);

    if (origin && allowedOrigins.includes(origin)) {
        return true;
    }

    if (referer && host && sameHost(referer, host)) {
        return true;
    }

    return fetchSite === "same-origin" || fetchSite === "same-site";
}

function getBodyLimit(pathname) {
    if (pathname === "/api/auth/login" || pathname === "/api/auth/register") {
        return AUTH_BODY_LIMIT;
    }

    if (pathname === "/api/bookings") {
        return BOOKING_BODY_LIMIT;
    }

    if (pathname === "/api/events" || /^\/api\/events\/[^/]+$/.test(pathname)) {
        return EVENT_BODY_LIMIT;
    }

    return DEFAULT_BODY_LIMIT;
}

function checkBodySize(request, pathname) {
    const length = Number(request.headers.get("content-length") || 0);
    const limit = getBodyLimit(pathname);

    if (length > limit) {
        return { ok: false, limit };
    }

    return { ok: true, limit };
}

function getRateLimitPolicy(pathname) {
    return RATE_LIMITS.find((policy) => policy.pattern.test(pathname)) ?? null;
}

function checkRateLimit(request, pathname) {
    const policy = getRateLimitPolicy(pathname);
    if (!policy) {
        return { ok: true };
    }

    const now = Date.now();
    const ip = getClientIp(request);
    const key = `${ip}:${request.method}:${policy.pattern.source}`;
    const buckets = globalForSecurity.rateLimitBuckets;
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + policy.windowMs });
        return { ok: true };
    }

    current.count += 1;

    if (current.count > policy.limit) {
        const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
        return { ok: false, retryAfter };
    }

    if (buckets.size > 2000) {
        for (const [bucketKey, bucket] of buckets.entries()) {
            if (bucket.resetAt <= now) {
                buckets.delete(bucketKey);
            }
        }
    }

    return { ok: true };
}

function isSuspiciousMutationClient(request) {
    const userAgent = (request.headers.get("user-agent") || "").toLowerCase();

    if (!userAgent) {
        return true;
    }

    return SUSPICIOUS_MUTATION_AGENTS.some((agent) => userAgent.includes(agent));
}

async function refreshSupabaseSession(request, response) {
    const supabaseConfig = getSupabaseConfig();
    if (!supabaseConfig.configured) {
        return null;
    }

    const supabase = createServerClient(
        supabaseConfig.url,
        supabaseConfig.anonKey,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    try {
        const {
            data: { user },
        } = await supabase.auth.getUser();

        return user;
    } catch (error) {
        console.error("[Proxy] Supabase session refresh failed:", error);
        return null;
    }
}

function isCronRoute(pathname) {
    return pathname.startsWith("/api/cron/");
}

export async function proxy(request) {
    const path = request.nextUrl.pathname;
    const isApi = path.startsWith("/api/");
    const isMutation = MUTATING_METHODS.has(request.method);
    const response = NextResponse.next({ request });
    applySecurityHeaders(response);

    if (isApi && isMutation && !isCronRoute(path) && !isTrustedWebhookRoute(path)) {
        if (!isAllowedOrigin(request)) {
            return jsonError("Ungültige Anfragequelle.", 403);
        }

        if (isSuspiciousMutationClient(request)) {
            return jsonError("Automatisierte Anfrage blockiert.", 403);
        }

        const bodyCheck = checkBodySize(request, path);
        if (!bodyCheck.ok) {
            return jsonError("Anfrage ist zu gross.", 413, {
                "X-Max-Body-Bytes": String(bodyCheck.limit),
            });
        }

        const rateLimit = checkRateLimit(request, path);
        if (!rateLimit.ok) {
            return jsonError("Zu viele Anfragen. Bitte später erneut versuchen.", 429, {
                "Retry-After": String(rateLimit.retryAfter),
            });
        }
    }

    const user = await refreshSupabaseSession(request, response);

    if (!user && (path.startsWith("/admin") || path.startsWith("/dashboard"))) {
        const url = request.nextUrl.clone();
        url.pathname = "/auth";
        return NextResponse.redirect(url);
    }

    return response;
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
    ],
};
