"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function CrmCustomerComposer({ customerEmail }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [noteContent, setNoteContent] = useState("");
    const [taskTitle, setTaskTitle] = useState("");
    const [taskDescription, setTaskDescription] = useState("");
    const [taskDueAt, setTaskDueAt] = useState("");
    const [message, setMessage] = useState("");

    async function submitJson(url, payload, reset) {
        setMessage("Wird gespeichert...");

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || "Aktion fehlgeschlagen.");
        }

        reset?.();
        setMessage("Gespeichert.");
        startTransition(() => router.refresh());
    }

    async function handleNoteSubmit(event) {
        event.preventDefault();

        const content = noteContent.trim();
        if (!content) {
            setMessage("Bitte zuerst eine Notiz eingeben.");
            return;
        }

        try {
            await submitJson(
                `/api/crm/customers/${encodeURIComponent(customerEmail)}/notes`,
                { content },
                () => setNoteContent("")
            );
        } catch (error) {
            setMessage(error?.message ?? "Notiz konnte nicht gespeichert werden.");
        }
    }

    async function handleTaskSubmit(event) {
        event.preventDefault();

        const title = taskTitle.trim();
        if (!title) {
            setMessage("Bitte zuerst einen Aufgabentitel eingeben.");
            return;
        }

        try {
            await submitJson(
                `/api/crm/customers/${encodeURIComponent(customerEmail)}/tasks`,
                {
                    title,
                    description: taskDescription.trim(),
                    dueAt: taskDueAt || null,
                },
                () => {
                    setTaskTitle("");
                    setTaskDescription("");
                    setTaskDueAt("");
                }
            );
        } catch (error) {
            setMessage(error?.message ?? "Aufgabe konnte nicht gespeichert werden.");
        }
    }

    return (
        <div className="stack">
            <form className="card stack" onSubmit={handleNoteSubmit}>
                <h3 className="card__title">Notiz hinzufügen</h3>
                <div className="field">
                    <label className="label" htmlFor="crm-note">
                        Interne Notiz
                    </label>
                    <textarea
                        id="crm-note"
                        className="textarea"
                        value={noteContent}
                        onChange={(event) => setNoteContent(event.target.value)}
                        placeholder="Zum Beispiel: Rückruf nach dem Festival, VIP-Anfrage oder Hinweis zum nächsten Kauf."
                        rows={4}
                    />
                </div>
                <button className="btn btn-primary" type="submit" disabled={isPending}>
                    Notiz speichern
                </button>
            </form>

            <form className="card stack" onSubmit={handleTaskSubmit}>
                <h3 className="card__title">Aufgabe anlegen</h3>
                <div className="field">
                    <label className="label" htmlFor="crm-task-title">
                        Titel
                    </label>
                    <input
                        id="crm-task-title"
                        className="input"
                        value={taskTitle}
                        onChange={(event) => setTaskTitle(event.target.value)}
                        placeholder="Zum Beispiel: Angebot für Gruppenbuchung senden"
                    />
                </div>
                <div className="field">
                    <label className="label" htmlFor="crm-task-due">
                        Fällig am
                    </label>
                    <input
                        id="crm-task-due"
                        type="datetime-local"
                        className="input"
                        value={taskDueAt}
                        onChange={(event) => setTaskDueAt(event.target.value)}
                    />
                </div>
                <div className="field">
                    <label className="label" htmlFor="crm-task-description">
                        Beschreibung
                    </label>
                    <textarea
                        id="crm-task-description"
                        className="textarea"
                        value={taskDescription}
                        onChange={(event) => setTaskDescription(event.target.value)}
                        placeholder="Optional: Was genau soll erledigt werden?"
                        rows={3}
                    />
                </div>
                <button className="btn btn-primary" type="submit" disabled={isPending}>
                    Aufgabe speichern
                </button>
            </form>

            {message ? <p className="auth-message">{message}</p> : null}
        </div>
    );
}
