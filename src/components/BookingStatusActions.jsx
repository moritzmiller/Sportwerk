"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function BookingStatusActions({ bookingId, canMarkPaid }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    async function updateStatus(status) {
        setLoading(true);
        setMessage("");

        try {
            const response = await fetch(`/api/bookings/${bookingId}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });

            const data = await response.json();
            setLoading(false);

            if (!response.ok) {
                setMessage(data.error || "Status konnte nicht geändert werden.");
                return;
            }

            router.refresh();
        } catch (error) {
            setLoading(false);
            setMessage("Ein unerwarteter Fehler ist aufgetreten.");
        }
    }

    if (!canMarkPaid) {
        return null;
    }

    return (
        <div className="booking-toolbar__actions">
            <button
                type="button"
                className="btn btn-primary"
                disabled={loading}
                onClick={() => updateStatus("PAID")}
            >
                Als bezahlt markieren
            </button>
            <button
                type="button"
                className="btn btn-ghost"
                disabled={loading}
                onClick={() => updateStatus("CANCELLED")}
            >
                Stornieren
            </button>
            {message && <p className="auth-message">{message}</p>}
        </div>
    );
}
