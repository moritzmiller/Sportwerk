export const PASSWORD_RESET_INTENT_KEY = "gatekeeper:password-reset-intent";

function paramsFromHash(hash) {
    return new URLSearchParams(String(hash || "").replace(/^#/, ""));
}

export function getPasswordResetLinkState(href) {
    const url = new URL(href);
    const hashParams = paramsFromHash(url.hash);
    const queryType = url.searchParams.get("type");
    const hashType = hashParams.get("type");
    const type = queryType || hashType || "";

    const code = url.searchParams.get("code") || hashParams.get("code") || "";
    const tokenHash = url.searchParams.get("token_hash") || hashParams.get("token_hash") || "";
    const accessToken = hashParams.get("access_token") || url.searchParams.get("access_token") || "";
    const refreshToken = hashParams.get("refresh_token") || url.searchParams.get("refresh_token") || "";
    const error = url.searchParams.get("error") || hashParams.get("error") || "";
    const errorDescription =
        url.searchParams.get("error_description") || hashParams.get("error_description") || "";

    return {
        path: url.pathname,
        code,
        tokenHash,
        type,
        accessToken,
        refreshToken,
        error,
        errorDescription,
        hasRecoverySignal:
            type === "recovery" ||
            Boolean(code) ||
            Boolean(tokenHash) ||
            Boolean(accessToken && refreshToken),
    };
}

export function shouldRedirectToPasswordReset(href) {
    const state = getPasswordResetLinkState(href);
    return state.path !== "/auth/reset-password" && state.hasRecoverySignal;
}

export function passwordResetRedirectTarget(href) {
    const url = new URL(href);
    return `/auth/reset-password${url.search}${url.hash}`;
}

export function markPasswordResetIntent(storage) {
    try {
        storage?.setItem(PASSWORD_RESET_INTENT_KEY, "1");
    } catch {
        // Storage can be blocked in hardened browsers. The URL token still works.
    }
}

export function hasPasswordResetIntent(storage) {
    try {
        return storage?.getItem(PASSWORD_RESET_INTENT_KEY) === "1";
    } catch {
        return false;
    }
}

export function clearPasswordResetIntent(storage) {
    try {
        storage?.removeItem(PASSWORD_RESET_INTENT_KEY);
    } catch {
        // Best effort cleanup only.
    }
}
