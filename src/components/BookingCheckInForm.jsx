"use client";

import { useState } from "react";

export default function BookingCheckInForm() {
    const [bookingCode, setBookingCode] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(event) {
        event.preventDefault();
        setLoading(true);
        setMessage("");

        try {
            const response = await fetch(`/api/bookings/${bookingCode}/checkin`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ via: "scanner" }),
            });
            const data = await response.json();
            setLoading(false);

            if (!response.ok) {
                setMessage(data.error || "Check-in fehlgeschlagen.");
                return;
            }

            setMessage(
                data.alreadyCheckedIn
                    ? `Bereits eingecheckt: ${data.booking.id}`
                    : `Eingecheckt: ${data.booking.id}`
            );
            setBookingCode("");
        } catch (error) {
            setLoading(false);
            setMessage("Ein unerwarteter Fehler ist aufgetreten.");
        }
    }

    return (
        <form className="card stack" onSubmit={handleSubmit}>
            <div className="section-title-row">
                <h2>Check-in Scanner</h2>
                <span className="text-muted">Buchungs-ID oder Ticket-Code</span>
            </div>

            <input
                className="input"
                value={bookingCode}
                onChange={(e) => setBookingCode(e.target.value)}
                placeholder="booking id oder qr code"
                required
            />

            <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Prüfe..." : "Einchecken"}
            </button>

            {message ? <p className="auth-message">{message}</p> : null}
        </form>
    );
}
