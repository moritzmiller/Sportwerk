"use client";

import { useState } from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function CrmTaskToggle({ taskId, completed }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState("");

    async function toggle() {
        setMessage("");

        try {
            const response = await fetch(`/api/crm/tasks/${taskId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ completed: !completed }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setMessage(data.error || "Aufgabe konnte nicht geÃ¤ndert werden.");
                return;
            }
        } catch (error) {
            setMessage("Ein unerwarteter Fehler ist aufgetreten.");
            return;
        }

        startTransition(() => router.refresh());
    }

    return (
        <span className="stack">
            <button type="button" className="btn btn-ghost" onClick={toggle} disabled={isPending}>
                {completed ? "Wieder offen" : "Erledigt"}
            </button>
            {message ? <span className="field-hint">{message}</span> : null}
        </span>
    );
}
