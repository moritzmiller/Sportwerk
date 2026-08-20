const TRUSTED_WEBHOOK_ROUTES = new Set([
    "/api/paypal/webhook",
    "/api/stripe/webhook",
    "/api/payments/mollie/webhook",
]);

export function isTrustedWebhookRoute(pathname) {
    return TRUSTED_WEBHOOK_ROUTES.has(pathname);
}
