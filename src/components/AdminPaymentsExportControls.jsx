"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "gatekeeper-admin-payments-last-export";
const STORAGE_EVENT = "gatekeeper-admin-payments-last-export-updated";

function formatRelativeTime(timestamp) {
    if (!timestamp) return "noch nie";

    const diffMs = Date.now() - timestamp;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return "gerade eben";
    if (diffMinutes < 60) return `vor ${diffMinutes} Min.`;
    if (diffHours < 24) return `vor ${diffHours} Std.`;
    return `vor ${diffDays} Tag${diffDays === 1 ? "" : "en"}`;
}

export default function AdminPaymentsExportControls({
    visibleHref,
    statusHref,
    statusLabel = "Status",
}) {
    const lastExportAt = useSyncExternalStore(
        (callback) => {
            window.addEventListener("storage", callback);
            window.addEventListener(STORAGE_EVENT, callback);
            return () => {
                window.removeEventListener("storage", callback);
                window.removeEventListener(STORAGE_EVENT, callback);
            };
        },
        () => {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            const parsed = Number(raw);
            return Number.isFinite(parsed) ? parsed : null;
        },
        () => null
    );

    const hint = formatRelativeTime(lastExportAt);

    function rememberExport() {
        const now = Date.now();
        window.localStorage.setItem(STORAGE_KEY, String(now));
        window.dispatchEvent(new Event(STORAGE_EVENT));
    }

    return (
        <div className="stack">
            <div className="booking-toolbar__actions">
                <a href={visibleHref} className="btn btn-ghost" onClick={rememberExport}>
                    CSV aktuelle Ansicht
                </a>
                <a href={statusHref} className="btn btn-ghost" onClick={rememberExport}>
                    CSV {statusLabel}
                </a>
            </div>
            <p className="field-hint">Zuletzt exportiert: {hint}</p>
        </div>
    );
}
