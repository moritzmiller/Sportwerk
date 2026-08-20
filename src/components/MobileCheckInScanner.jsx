"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getAttendanceSnapshot } from "@/lib/attendance";
import { formatEventDateTime } from "@/lib/events";

function parseBookingCode(raw) {
    const text = String(raw ?? "").trim();
    if (!text) return null;

    const urlMatch = text.match(/\/booking\/([^/?#]+)/i);
    if (urlMatch?.[1]) return urlMatch[1];

    if (text.startsWith("gatekeeper-ticket-")) {
        return text.slice("gatekeeper-ticket-".length).trim() || null;
    }

    return text;
}

function pushRecent(items, entry) {
    return [entry, ...items].slice(0, 6);
}

export default function MobileCheckInScanner({ events }) {
    const [rows, setRows] = useState(events);
    const [selectedEventId, setSelectedEventId] = useState(
        events[0]?.id?.toString() ?? ""
    );
    const [isScanning, setIsScanning] = useState(false);
    const [status, setStatus] = useState("Scanner bereit.");
    const [warning, setWarning] = useState("");
    const [manualCode, setManualCode] = useState("");
    const [recentScans, setRecentScans] = useState([]);
    const [busy, setBusy] = useState(false);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const frameRef = useRef(null);
    const wakeLockRef = useRef(null);
    const lastScanRef = useRef({ code: "", at: 0 });
    const rowsRef = useRef(rows);
    const [torchAvailable, setTorchAvailable] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const [fullScreen, setFullScreen] = useState(false);

    useEffect(() => {
        rowsRef.current = rows;
    }, [rows]);

    useEffect(() => {
        function handleFullscreenChange() {
            setFullScreen(Boolean(document.fullscreenElement));
        }

        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
    }, []);

    const selectedEvent = useMemo(
        () => rows.find((event) => String(event.id) === String(selectedEventId)) ?? rows[0] ?? null,
        [rows, selectedEventId]
    );

    const selectedSnapshot = useMemo(
        () => getAttendanceSnapshot(selectedEvent?.attendance, selectedEvent),
        [selectedEvent]
    );

    const stopScanner = useCallback(() => {
        if (frameRef.current) {
            cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }
        if (wakeLockRef.current) {
            wakeLockRef.current.release?.().catch(() => {});
            wakeLockRef.current = null;
        }
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setTorchAvailable(false);
        setTorchOn(false);
        setIsScanning(false);
        setWarning("");
    }, []);

    const requestFullscreen = useCallback(async () => {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
        }
        setFullScreen(Boolean(document.fullscreenElement));
    }, []);

    const toggleTorch = useCallback(async () => {
        const track = streamRef.current?.getVideoTracks?.()[0];
        const capabilities = track?.getCapabilities?.();
        if (!track || !capabilities?.torch) {
            setTorchAvailable(false);
            setTorchOn(false);
            return;
        }

        const nextValue = !torchOn;
        await track.applyConstraints({
            advanced: [{ torch: nextValue }],
        });
        setTorchOn(nextValue);
    }, [torchOn]);

    const registerScan = useCallback(async (rawCode, source) => {
        const bookingId = parseBookingCode(rawCode);

        if (!bookingId) {
            setStatus("Kein gültiger QR-Code erkannt.");
            setWarning("");
            return;
        }

        const now = Date.now();
        const last = lastScanRef.current;
        if (last.code === bookingId && now - last.at < 2500) {
            return;
        }
        lastScanRef.current = { code: bookingId, at: now };

        setBusy(true);
        setStatus(`Prüfe ${bookingId} ...`);
        setWarning("");

        try {
            const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/checkin`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ via: source }),
            });
            const data = await response.json();

            if (!response.ok) {
                setStatus(data.error || "Check-in fehlgeschlagen.");
                setWarning(data.scan?.warning || "");
                setRecentScans((items) =>
                    pushRecent(items, {
                        id: `${bookingId}-${Date.now()}`,
                        bookingId,
                        ok: false,
                        message: data.error || "Check-in fehlgeschlagen.",
                        status: data.scan?.status || "REJECTED",
                        warning: data.scan?.warning || "",
                        at: new Date().toISOString(),
                    })
                );
                return;
            }

            const booking = data.booking;
            const eventId = String(booking.eventId);
            const quantity = Number(booking.quantity || 1);
            const alreadyCheckedIn = Boolean(data.alreadyCheckedIn);

            const eventTitle =
                rowsRef.current.find((event) => String(event.id) === eventId)?.title ??
                `Event #${eventId}`;

            setRows((current) =>
                current.map((event) => {
                    if (String(event.id) !== eventId) return event;
                    const attendance = getAttendanceSnapshot(event.attendance, event);
                    const nextCheckedIn = alreadyCheckedIn
                        ? attendance.checkedInTickets
                        : Math.min(attendance.paidTickets, attendance.checkedInTickets + quantity);

                    return {
                        ...event,
                        attendance: {
                            ...attendance,
                            checkedInTickets: nextCheckedIn,
                            checkedInBookings: alreadyCheckedIn
                                ? attendance.checkedInBookings
                                : attendance.checkedInBookings + 1,
                        },
                    };
                })
            );
            setSelectedEventId(eventId);

            setRecentScans((items) =>
                pushRecent(items, {
                    id: `${booking.id}-${Date.now()}`,
                    bookingId: booking.id,
                    eventId,
                    eventTitle,
                    quantity,
                    ok: true,
                    alreadyCheckedIn,
                    checkedInAt: booking.checkedInAt,
                    checkedInVia: booking.checkedInVia ?? source,
                    status: data.scan?.status || (alreadyCheckedIn ? "ALREADY_SCANNED" : "SCANNED"),
                    warning: data.scan?.warning || "",
                    at: new Date().toISOString(),
                })
            );
            setWarning(data.scan?.warning || "");
            setStatus(
                alreadyCheckedIn
                    ? `${booking.id} ist bereits eingecheckt.`
                    : `${quantity} Ticket(s) für ${eventTitle} eingecheckt.`
            );
            setManualCode("");
            if (navigator.vibrate) {
                navigator.vibrate(alreadyCheckedIn ? [20, 20, 20] : 60);
            }
        } catch (error) {
            setStatus("Unbekannter Fehler beim Check-in.");
            setWarning("");
        } finally {
            setBusy(false);
        }
    }, []);

    useEffect(() => {
        if (!isScanning) {
            return undefined;
        }

        let cancelled = false;
        let detector = null;

        async function startCamera() {
            try {
                if (!("BarcodeDetector" in window)) {
                    setStatus(
                        "Dieser Browser unterstuetzt keinen Kamera-QR-Scan. Bitte die Buchungs-ID manuell eingeben."
                    );
                    setWarning("");
                    setIsScanning(false);
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
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
                setFullScreen(Boolean(document.fullscreenElement));
                const track = stream.getVideoTracks()[0];
                const capabilities = track?.getCapabilities?.();
                setTorchAvailable(Boolean(capabilities?.torch));
                if (navigator.wakeLock?.request) {
                    wakeLockRef.current = await navigator.wakeLock.request("screen");
                }
                setStatus("Kamera aktiv. QR-Code ins Bild halten.");
                setWarning("");

                async function tick() {
                    if (cancelled || !videoRef.current || !canvasRef.current) {
                        return;
                    }

                    const video = videoRef.current;
                    if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
                        const canvas = canvasRef.current;
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        const context = canvas.getContext("2d", { willReadFrequently: true });
                        context.drawImage(video, 0, 0, canvas.width, canvas.height);
                        const codes = await detector.detect(canvas).catch(() => []);
                        const first = codes[0];

                        if (first?.rawValue) {
                            await registerScan(first.rawValue, "camera");
                        }
                    }

                    frameRef.current = requestAnimationFrame(tick);
                }

                frameRef.current = requestAnimationFrame(tick);
            } catch (error) {
                setStatus(
                    error?.message ||
                        "Kamera konnte nicht gestartet werden. Bitte Browser-Berechtigung prüfen."
                );
                setWarning("");
                setIsScanning(false);
            }
        }

        void startCamera();

        return () => {
            cancelled = true;
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
            if (wakeLockRef.current) {
                wakeLockRef.current.release?.().catch(() => {});
                wakeLockRef.current = null;
            }
            streamRef.current?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        };
    }, [isScanning, registerScan]);

    const overall = useMemo(() => {
        return rows.reduce(
            (acc, event) => {
                const snapshot = getAttendanceSnapshot(event.attendance, event);
                acc.paidTickets += snapshot.paidTickets;
                acc.checkedInTickets += snapshot.checkedInTickets;
                acc.paidBookings += snapshot.paidBookings;
                acc.checkedInBookings += snapshot.checkedInBookings;
                return acc;
            },
            {
                paidTickets: 0,
                checkedInTickets: 0,
                paidBookings: 0,
                checkedInBookings: 0,
            }
        );
    }, [rows]);

    const overallRate = overall.paidTickets
        ? Math.round((overall.checkedInTickets / overall.paidTickets) * 100)
        : 0;

    async function handleManualSubmit(event) {
        event.preventDefault();
        await registerScan(manualCode, "manual");
    }

    if (rows.length === 0) {
        return (
            <div className="empty-state">
                <div className="empty-state__icon">🎟️</div>
                <p>Du hast noch keine veröffentlichten Events für den Einlass.</p>
            </div>
        );
    }

    return (
        <div className="checkin-shell">
            <section className="card checkin-hero stack-lg">
                <div className="checkout-success__badge booking-status--paid">
                    Mobiler Einlass
                </div>
                <div className="checkin-hero__top">
                    <div>
                        <h2 className="card__title">QR-Codes scannen</h2>
                        <p className="text-muted">
                            Öffne diese Seite auf deinem Handy, starte die Kamera und scanne
                            die QR-Codes der Tickets vor Ort.
                        </p>
                    </div>
                    <div className="flex wrap">
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => {
                                if (isScanning) {
                                    stopScanner();
                                    setStatus("Scanner gestoppt.");
                                    return;
                                }

                                setStatus("Kamera startet ...");
                                setIsScanning(true);
                            }}
                        >
                            {isScanning ? "Scanner stoppen" : "Scanner starten"}
                        </button>
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={requestFullscreen}
                            disabled={!isScanning}
                        >
                            Vollbild
                        </button>
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={toggleTorch}
                            disabled={!isScanning || !torchAvailable}
                        >
                            Licht {torchOn ? "aus" : "an"}
                        </button>
                    </div>
                </div>

                <div className="checkin-stats">
                    <div className="stat">
                        <div className="stat__value">{overall.checkedInTickets}</div>
                        <div className="stat__label">Anwesend</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{overall.paidTickets}</div>
                        <div className="stat__label">Verkaufte Tickets</div>
                    </div>
                    <div className="stat">
                        <div className="stat__value">{overallRate}%</div>
                        <div className="stat__label">Quote</div>
                    </div>
                </div>

                <div className="checkin-camera card">
                    <video
                        ref={videoRef}
                        className="checkin-camera__video"
                        muted
                        playsInline
                        autoPlay
                    />
                    <canvas ref={canvasRef} className="checkin-camera__canvas" />
                    <div className="checkin-camera__overlay">
                        <span className="label">Scanner</span>
                        <strong>{status}</strong>
                        <p className="text-muted">
                            {isScanning
                                ? fullScreen
                                    ? "Halte den QR-Code mittig ins Bild."
                                    : "Vollbild hilft beim Scannen am Eingang."
                                : "Tippe auf Scanner starten, um die Kamera zu aktivieren."}
                        </p>
                        {warning ? <p className="field-hint">{warning}</p> : null}
                    </div>
                </div>

                <form className="checkin-manual" onSubmit={handleManualSubmit}>
                    <div className="field">
                        <label className="label" htmlFor="booking-code">
                            Manuell einchecken
                        </label>
                        <input
                            id="booking-code"
                            className="input"
                            value={manualCode}
                            onChange={(event) => setManualCode(event.target.value)}
                            placeholder="QR-Text oder Buchungs-ID"
                        />
                    </div>
                    <button type="submit" className="btn btn-ghost" disabled={busy}>
                        {busy ? "Prüfe..." : "Einchecken"}
                    </button>
                </form>
            </section>

            <aside className="stack-lg">
                <section className="card stack">
                    <div className="section-title-row">
                        <h2>Ausgewähltes Event</h2>
                        <span className="text-muted">
                            {selectedEvent?.attendance?.checkedInTickets ?? 0} von{" "}
                            {selectedEvent?.attendance?.paidTickets ?? 0}
                        </span>
                    </div>
                    {selectedEvent ? (
                        <>
                            <strong>{selectedEvent.title}</strong>
                            <p className="text-muted">
                                {formatEventDateTime(selectedEvent.startDate)} ·{" "}
                                {selectedEvent.location}, {selectedEvent.city}
                            </p>
                            <div className="summary-list">
                                <div>
                                    <span className="label">Tickets verkauft</span>
                                    <p>{selectedSnapshot.paidTickets}</p>
                                </div>
                                <div>
                                    <span className="label">Bereits anwesend</span>
                                    <p>{selectedSnapshot.checkedInTickets}</p>
                                </div>
                                <div>
                                    <span className="label">Noch offen</span>
                                    <p>{selectedSnapshot.remainingTickets}</p>
                                </div>
                            </div>
                        </>
                    ) : null}
                </section>

                <section className="card stack">
                    <div className="section-title-row">
                        <h2>Deine Events</h2>
                        <span className="text-muted">Zum Umschalten antippen</span>
                    </div>
                    <div className="checkin-event-list">
                        {rows.map((event) => {
                            const snapshot = getAttendanceSnapshot(event.attendance, event);
                            const active = String(event.id) === String(selectedEventId);
                            const percent = snapshot.paidTickets
                                ? Math.round((snapshot.checkedInTickets / snapshot.paidTickets) * 100)
                                : 0;

                            return (
                                <button
                                    type="button"
                                    key={event.id}
                                    className={`checkin-event ${active ? "is-active" : ""}`}
                                    onClick={() => setSelectedEventId(String(event.id))}
                                >
                                    <div>
                                        <strong>{event.title}</strong>
                                        <p>
                                            {formatEventDateTime(event.startDate)} · {event.location}
                                        </p>
                                    </div>
                                    <div className="checkin-event__meta">
                                        <span>
                                            {snapshot.checkedInTickets} / {snapshot.paidTickets}
                                        </span>
                                        <small>{percent}% anwesend</small>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </section>

                <section className="card stack">
                    <div className="section-title-row">
                        <h2>Letzte Scans</h2>
                        <span className="text-muted">{recentScans.length} Einträge</span>
                    </div>
                    {recentScans.length === 0 ? (
                        <p className="text-muted">
                            Hier erscheinen die zuletzt gescannten Tickets.
                        </p>
                    ) : (
                        <div className="stack">
                            {recentScans.map((entry) => (
                                <article key={entry.id} className="analysis-card">
                                    <strong>
                                        {entry.ok
                                            ? entry.alreadyCheckedIn
                                                ? "Bereits eingecheckt"
                                                : "Eingecheckt"
                                            : "Fehlgeschlagen"}
                                    </strong>
                                    <p>
                                        {entry.ok
                                            ? `${entry.eventTitle} · ${entry.quantity} Ticket(s)`
                                            : entry.message}
                                    </p>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </aside>
        </div>
    );
}
