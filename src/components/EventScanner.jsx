"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function pushRecent(items, entry) {
    return [entry, ...items].slice(0, 8);
}

export default function EventScanner({ event, token, initialTickets }) {
    const readerId = useMemo(() => `scanner-reader-${event.id}`, [event.id]);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const frameRef = useRef(null);
    const lastScanRef = useRef({ code: "", at: 0 });
    const processingRef = useRef(false);
    const resetTimerRef = useRef(null);
    const [tickets, setTickets] = useState(initialTickets);
    const [recentScans, setRecentScans] = useState([]);
    const [cameraState, setCameraState] = useState("starting");
    const [message, setMessage] = useState("Kamera startet...");
    const [isSuccess, setIsSuccess] = useState(false);
    const [feedbackTone, setFeedbackTone] = useState("neutral");
    const [showFeedback, setShowFeedback] = useState(false);
    const [manualCode, setManualCode] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

    const stats = useMemo(() => {
        const paidTickets = tickets.reduce((sum, ticket) => sum + ticket.quantity, 0);
        const checkedInTickets = tickets.reduce(
            (sum, ticket) => sum + (ticket.scanned ? ticket.quantity : 0),
            0
        );

        return {
            paidTickets,
            checkedInTickets,
            remainingTickets: Math.max(0, paidTickets - checkedInTickets),
        };
    }, [tickets]);

    const resetFeedback = useCallback((delay = 1250) => {
        if (resetTimerRef.current) {
            window.clearTimeout(resetTimerRef.current);
        }

        resetTimerRef.current = window.setTimeout(() => {
            setShowFeedback(false);
            setIsSuccess(false);
            setFeedbackTone("neutral");
            setMessage("Bereit für den nächsten Scan");
            processingRef.current = false;
            setIsProcessing(false);
        }, delay);
    }, []);

    const triggerFeedback = useCallback(
        ({ ok, text }) => {
            setIsSuccess(ok);
            setFeedbackTone(ok ? "success" : "error");
            setShowFeedback(true);
            setMessage(text);

            if (navigator.vibrate) {
                navigator.vibrate(ok ? 80 : [50, 40, 50]);
            }

            resetFeedback(ok ? 1250 : 1500);
        },
        [resetFeedback]
    );

    const validateCode = useCallback(
        async (rawCode, via = "camera") => {
            const code = String(rawCode ?? "").trim();
            if (!code || processingRef.current) return;

            const now = Date.now();
            const last = lastScanRef.current;
            if (last.code === code && now - last.at < 2600) {
                return;
            }

            lastScanRef.current = { code, at: now };
            processingRef.current = true;
            setIsProcessing(true);
            setMessage("Ticket wird geprüft...");

            try {
                const response = await fetch(`/api/scanner/events/${event.id}/validate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        code,
                        token,
                        via,
                    }),
                });
                const data = await response.json();

                if (!response.ok) {
                    const errorText = data.error || data.scan?.warning || "Scan abgewiesen";
                    setRecentScans((items) =>
                        pushRecent(items, {
                            id: `${Date.now()}-${code}`,
                            ok: false,
                            text: errorText,
                            status: data.scan?.status || "REJECTED",
                            at: new Date().toISOString(),
                        })
                    );
                    triggerFeedback({ ok: false, text: errorText });
                    return;
                }

                const booking = data.booking;
                const scannedTicketId = booking.ticketId ?? booking.id;
                setTickets((current) =>
                    current.map((ticket) =>
                        ticket.id === scannedTicketId
                            ? {
                                  ...ticket,
                                  scanned: true,
                                  checkedInAt: booking.checkedInAt,
                              }
                            : ticket
                    )
                );
                setRecentScans((items) =>
                    pushRecent(items, {
                        id: `${booking.id}-${Date.now()}`,
                        ok: true,
                        text: `${booking.purchaserName} · ${booking.quantity} Ticket(s)`,
                        status: data.scan?.status || "SCANNED",
                        at: new Date().toISOString(),
                    })
                );
                setManualCode("");
                triggerFeedback({ ok: true, text: "Gültiges Ticket" });
            } catch (error) {
                triggerFeedback({ ok: false, text: "Netzwerkfehler" });
            }
        },
        [event.id, token, triggerFeedback]
    );

    useEffect(() => {
        let cancelled = false;
        let detector = null;
        const videoNode = videoRef.current;
        const canvasNode = canvasRef.current;

        async function startScanner() {
            setCameraState("starting");
            setMessage("Kamera startet...");

            try {
                if (!videoNode || !canvasNode) {
                    setCameraState("error");
                    setMessage("Scanner-Oberfläche konnte nicht initialisiert werden.");
                    return;
                }

                if (!("BarcodeDetector" in window)) {
                    setCameraState("error");
                    setMessage(
                        "Dieser Browser unterstützt keinen Kamera-QR-Scan. Bitte Ticket-Code manuell eingeben."
                    );
                    return;
                }

                detector = new window.BarcodeDetector({ formats: ["qr_code"] });
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: "environment" },
                    },
                    audio: false,
                });

                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }

                streamRef.current = stream;
                videoNode.srcObject = stream;
                await videoNode.play();
                setCameraState("active");
                setMessage("QR-Code ins Bild halten");

                async function tick() {
                    if (cancelled || !videoNode || !canvasNode) {
                        return;
                    }

                    const video = videoNode;
                    if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
                        const canvas = canvasNode;
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        const context = canvas.getContext("2d", { willReadFrequently: true });
                        context.drawImage(video, 0, 0, canvas.width, canvas.height);
                        const codes = await detector.detect(canvas).catch(() => []);
                        const first = codes[0];

                        if (first?.rawValue) {
                            await validateCode(first.rawValue, "camera");
                        }
                    }

                    frameRef.current = requestAnimationFrame(tick);
                }

                frameRef.current = requestAnimationFrame(tick);
            } catch (error) {
                setCameraState("error");
                setMessage(
                    error?.message ||
                        "Kamera konnte nicht gestartet werden. Bitte Berechtigung prüfen."
                );
            }
        }

        void startScanner();

        return () => {
            cancelled = true;
            if (resetTimerRef.current) {
                window.clearTimeout(resetTimerRef.current);
            }
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
            streamRef.current?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
            if (videoNode) {
                videoNode.srcObject = null;
            }
        };
    }, [readerId, validateCode]);

    async function handleManualSubmit(event) {
        event.preventDefault();
        await validateCode(manualCode, "manual");
    }

    return (
        <main className={`scanner-page scanner-page--${feedbackTone}`}>
            <section className="scanner-stage" aria-live="polite">
                <div className="scanner-stage__top">
                    <div>
                        <span className="scanner-stage__label">GateKeeper Scanner</span>
                        <h1>{event.title}</h1>
                    </div>
                    <div className="scanner-stage__counter">
                        <strong>{stats.checkedInTickets}</strong>
                        <span>/ {stats.paidTickets}</span>
                    </div>
                </div>

                <div className="scanner-camera">
                    <div id={readerId} className="scanner-camera__reader">
                        <video
                            ref={videoRef}
                            muted
                            playsInline
                            autoPlay
                            aria-label="Kamera-Stream für Ticket-Scanner"
                        />
                        <canvas ref={canvasRef} className="scanner-camera__canvas" />
                    </div>
                    <div className="scanner-camera__frame" />
                    <div className="scanner-camera__status">
                        <strong>{message}</strong>
                        <span>
                            {cameraState === "active"
                                ? `${stats.remainingTickets} offen`
                                : "Kamera-Berechtigung erforderlich"}
                        </span>
                    </div>
                </div>

                <form className="scanner-manual" onSubmit={handleManualSubmit}>
                    <input
                        value={manualCode}
                        onChange={(event) => setManualCode(event.target.value)}
                        placeholder="Ticket-Code manuell eingeben"
                        aria-label="Ticket-Code manuell eingeben"
                    />
                    <button type="submit" disabled={!manualCode.trim() || isProcessing}>
                        Prüfen
                    </button>
                </form>

                <div className="scanner-ticket-list">
                    <div className="scanner-ticket-list__header">
                        <strong>Tickets</strong>
                        <span>{stats.remainingTickets} offen</span>
                    </div>
                    {tickets.slice(0, 8).map((ticket) => (
                        <article
                            key={ticket.id}
                            className={`scanner-ticket ${ticket.scanned ? "is-scanned" : ""}`}
                        >
                            <div>
                                <strong>{ticket.purchaserName}</strong>
                                <span>{ticket.quantity} Ticket(s)</span>
                            </div>
                            <span>{ticket.scanned ? "gescannt" : "offen"}</span>
                        </article>
                    ))}
                </div>

                {recentScans.length > 0 ? (
                    <div className="scanner-recent">
                        {recentScans.map((scan) => (
                            <div key={scan.id} className={scan.ok ? "is-ok" : "is-error"}>
                                {scan.text}
                            </div>
                        ))}
                    </div>
                ) : null}
            </section>

            {showFeedback ? (
                <div className={`scanner-feedback scanner-feedback--${isSuccess ? "success" : "error"}`}>
                    <strong>{isSuccess ? "OK" : "STOP"}</strong>
                    <span>{message}</span>
                </div>
            ) : null}
        </main>
    );
}
