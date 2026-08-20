"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SystemEventResolveButton({ eventId }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    async function resolveEvent() {
        setBusy(true);
        try {
            const response = await fetch("/api/admin/system-events", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: eventId }),
            });

            if (response.ok) {
                router.refresh();
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <button
            type="button"
            className="btn btn-ghost system-event-row__resolve"
            onClick={resolveEvent}
            disabled={busy}
        >
            {busy ? "Speichert..." : "Erledigt"}
        </button>
    );
}
