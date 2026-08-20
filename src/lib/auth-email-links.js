export function getGeneratedAuthActionLink(data) {
    return (
        data?.properties?.action_link ||
        data?.properties?.actionLink ||
        data?.action_link ||
        data?.actionLink ||
        ""
    );
}

export function isAuthUserNotFoundError(error) {
    const text = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
    return (
        error?.status === 404 ||
        text.includes("user not found") ||
        text.includes("user_not_found") ||
        text.includes("not found")
    );
}

export function isAuthEmailRateLimit(error) {
    return (
        error?.status === 429 ||
        error?.code === "over_email_send_rate_limit" ||
        /rate limit|too many/i.test(error?.message || "")
    );
}

export function isMailNotConfiguredError(error) {
    return (
        error?.code === "MAIL_NOT_CONFIGURED" ||
        /No mail provider configured|MAIL_NOT_CONFIGURED/i.test(error?.message || "")
    );
}

export function passwordResetRedirectTo(baseUrl) {
    return `${baseUrl}/auth/reset-password`;
}
