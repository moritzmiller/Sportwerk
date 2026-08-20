"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function BookingReminderActions({ bookingId }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    async function sendReminder() {
        setLoading(true);
        setMessage("");

        try {
            const response = await fetch(`/api/bookings/${bookingId}/reminder`, {
                method: "POST",
            });
            const data = await response.json();
            setLoading(false);

            if (!response.ok) {
                setMessage(data.error || "Erinnerung konnte nicht gesendet werden.");
                return;
            }

            router.refresh();
        } catch (error) {
            setLoading(false);
            setMessage("Ein unerwarteter Fehler ist aufgetreten.");
        }
    }

    return (
        <div className="booking-toolbar__actions">
            <button
                type="button"
                className="btn btn-ghost"
                disabled={loading}
                onClick={sendReminder}
            >
                {loading ? "Erinnerung wird gesendet..." : "Zahlungserinnerung senden"}
            </button>
            {message ? <p className="auth-message">{message}</p> : null}
        </div>
    );
}
