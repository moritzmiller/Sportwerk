"use client";

import { useEffect } from "react";

import {
    markPasswordResetIntent,
    passwordResetRedirectTarget,
    shouldRedirectToPasswordReset,
} from "@/lib/auth-reset-flow";

export default function AuthRecoveryRedirect() {
    useEffect(() => {
        if (!shouldRedirectToPasswordReset(window.location.href)) {
            return;
        }

        markPasswordResetIntent(window.sessionStorage);
        window.location.replace(passwordResetRedirectTarget(window.location.href));
    }, []);

    return null;
}
