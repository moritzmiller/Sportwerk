"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function BookingOperations({ bookingId, canCheckIn = false, canTransfer = false, canRefund = false }) {
    const router = useRouter();
    const [transferToName, setTransferToName] = useState("");
    const [transferToEmail, setTransferToEmail] = useState("");
    const [refundReason, setRefundReason] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    async function postJson(path, body) {
        setLoading(true);
        setMessage("");
        try {
            const response = await fetch(path, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await response.json();
            setLoading(false);

            if (!response.ok) {
                setMessage(data.error || "Aktion fehlgeschlagen.");
                return false;
            }

            router.refresh();
            return true;
        } catch (error) {
            setLoading(false);
            setMessage("Ein unerwarteter Fehler ist aufgetreten.");
            return false;
        }
    }

    return (
        <div className="stack">
            {canCheckIn ? (
                <button
                    type="button"
                    className="btn btn-primary"
                    disabled={loading}
                    onClick={() => postJson(`/api/bookings/${bookingId}/checkin`, { via: "dashboard" })}
                >
                    Einchecken
                </button>
            ) : null}

            {canTransfer ? (
                <div className="card stack">
                    <strong>Ticket übertragen</strong>
                    <input
                        className="input"
                        placeholder="Neuer Name"
                        value={transferToName}
                        onChange={(e) => setTransferToName(e.target.value)}
                    />
                    <input
                        className="input"
                        placeholder="Neue E-Mail"
                        type="email"
                        value={transferToEmail}
                        onChange={(e) => setTransferToEmail(e.target.value)}
                    />
                    <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={loading}
                        onClick={() =>
                            postJson(`/api/bookings/${bookingId}/transfer`, {
                                transferToName,
                                transferToEmail,
                            })
                        }
                    >
                        Übertragen
                    </button>
                </div>
            ) : null}

            {canRefund ? (
                <div className="card stack">
                    <strong>Rückerstattung / Storno</strong>
                    <input
                        className="input"
                        placeholder="Grund"
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                    />
                    <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={loading}
                        onClick={() =>
                            postJson(`/api/bookings/${bookingId}/refund`, {
                                reason: refundReason,
                            })
                        }
                    >
                        Rückerstatten
                    </button>
                </div>
            ) : null}

            {message ? <p className="auth-message">{message}</p> : null}
        </div>
    );
}

