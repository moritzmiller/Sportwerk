"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { getCategory } from "@/lib/categories";
import { getEventRemainingCapacity, getEventStatusLabel } from "@/lib/event-management";
import { formatEventPrice, formatEventTime } from "@/lib/events";
import { getVerificationLabel, isVerifiedStatus } from "@/lib/verification";

function getPulseScore(event) {
    return Math.max(12, Math.min(99, Number(event.pulseScore ?? event.matchScore ?? 28)));
}

function getMatchLabel(score) {
    if (score >= 80) return "Sehr passend";
    if (score >= 62) return "Passend";
    if (score >= 42) return "Interessant";
    return "Neu";
}

function getCapacityText(remaining) {
    if (remaining === null) return "offen";
    if (remaining <= 0) return "voll";
    if (remaining <= 8) return `${remaining} frei`;
    return "verfuegbar";
}

function sendEventCardInteraction(event, type, rank, variant) {
    const payload = JSON.stringify({
        type,
        source: "event-card",
        rank,
        variant,
    });
    const url = `/api/events/${event.id}/interaction`;

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const body = new Blob([payload], { type: "application/json" });
        if (navigator.sendBeacon(url, body)) return;
    }

    fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
    }).catch(() => {});
}

export default function EventCard({ event, variant = "default", rank = null }) {
    const [hidden, setHidden] = useState(false);
    const cat = getCategory(event.category);
    const price = formatEventPrice(event.price);
    const date = new Date(event.startDate);
    const day = date.getDate();
    const month = date.toLocaleDateString("de-DE", { month: "short" });
    const weekday = date.toLocaleDateString("de-DE", { weekday: "short" });
    const remaining = getEventRemainingCapacity(event);
    const isSoldOut = remaining !== null && remaining <= 0;
    const isVerified =
        isVerifiedStatus(event.organizationVerificationStatus) ||
        isVerifiedStatus(event.venueVerificationStatus);
    const matchReasons = Array.isArray(event.matchReasons) ? event.matchReasons : [];
    const pulseScore = getPulseScore(event);
    const isFeature = variant === "feature";

    if (hidden) return null;

    function handleHide(clickEvent) {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        setHidden(true);
        sendEventCardInteraction(event, "HIDE", rank, variant);
    }

    return (
        <article
            id={`event-${event.id}`}
            className={`event-card event-card--pulse ${isFeature ? "event-card--feature" : ""}`}
            style={{ "--cat-color": cat.color, "--pulse": `${pulseScore}%` }}
        >
            <button
                type="button"
                className="event-card__hide"
                aria-label="Nicht interessiert"
                title="Nicht interessiert"
                onClick={handleHide}
            >
                X
            </button>

            <Link
                href={`/events/${event.id}`}
                className="event-card__link"
                aria-label={`${event.title} ansehen`}
                onClick={() => sendEventCardInteraction(event, "CLICK", rank, variant)}
            >
                <div className="event-card__banner">
                    {event.imageUrl ? (
                        <Image
                            src={event.imageUrl}
                            alt=""
                            fill
                            className="event-card__image"
                            sizes={isFeature ? "(max-width: 900px) 100vw, 760px" : "(max-width: 768px) 100vw, 33vw"}
                            unoptimized
                        />
                    ) : (
                        <div className="event-card__fallback" aria-hidden="true" />
                    )}
                    <div className="event-card__shade" aria-hidden="true" />

                    <div className="event-card__topline">
                        <span className="event-card__rank">{rank ? `#${rank}` : "Live"}</span>
                        <span className="event-card__pulse">{getMatchLabel(pulseScore)}</span>
                    </div>

                    <span className="event-card__cat">
                        {cat.emoji} {cat.label}
                    </span>
                    {isVerified ? (
                        <span className="event-card__trust">
                            {getVerificationLabel("VERIFIED")}
                        </span>
                    ) : null}
                    <span className="event-card__status">{getEventStatusLabel(event.status ?? "PUBLISHED")}</span>
                    <div className="event-card__date">
                        <span className="w">{weekday}</span>
                        <span className="d">{day}</span>
                        <span className="m">{month}</span>
                    </div>
                </div>

                <div className="event-card__body">
                    <div className="event-card__body-head">
                        <h3 className="event-card__title">{event.title}</h3>
                        <span className="event-card__mini-meter" aria-hidden="true" />
                    </div>

                    {matchReasons.length > 0 ? (
                        <div className="event-card__reasons" aria-label="Warum dieses Event angezeigt wird">
                            {matchReasons.map((reason) => (
                                <span key={reason}>{reason}</span>
                            ))}
                        </div>
                    ) : null}

                    {event.description ? <p className="event-card__desc">{event.description}</p> : null}

                    <div className="event-card__meta">
                        <span>{event.location}, {event.city}</span>
                        <span>{formatEventTime(event.startDate)} Uhr</span>
                        <span>{getCapacityText(remaining)}</span>
                    </div>
                </div>

                <div className="event-card__footer">
                    <span className={`event-card__price ${price.free ? "is-free" : ""}`}>
                        {isSoldOut ? "Ausverkauft" : price.text}
                    </span>
                    <span className="event-card__cta">Oeffnen</span>
                </div>
            </Link>
        </article>
    );
}
