"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const STATUS_LABELS = {
    ACTIVE: "Aktiv",
    REVIEW_REQUIRED: "Review",
    INACTIVE: "Inaktiv",
};

const STATUS_CLASSES = {
    ACTIVE: "admin-status admin-status--ok",
    REVIEW_REQUIRED: "admin-status admin-status--warning",
    INACTIVE: "admin-status",
};

function cents(amountCents, currency = "EUR") {
    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency,
    }).format(Number(amountCents || 0) / 100);
}

function valuationLevel(race) {
    if (race.includesErich) return "ERICH";
    if (race.includesDm) return "DM";
    if (race.includesMdm) return "MDM";
    return "OFFEN";
}

function blockersForRace(race) {
    const blockers = [];
    if (!race.gender || !race.classLabel || !race.distanceLabel) {
        blockers.push("Stammdaten fehlen");
    }
    if (!race.includesErich && !race.includesDm && !race.includesMdm) {
        blockers.push("Wertung fehlt");
    }
    if (race.review?.blockers?.length) {
        blockers.push(...race.review.blockers);
    }
    return [...new Set(blockers)];
}

function priceSummary(race) {
    if (!race.prices?.length) return "Keine Preise";
    return race.prices
        .map((price) => `${price.valuationLevel}/${price.pricePhase?.name}: ${cents(price.amountCents, price.currency)}`)
        .join(" · ");
}

export default function ErichRaceReviewTable({ races }) {
    const router = useRouter();
    const [reason, setReason] = useState("Reviewed ERICH race master data");
    const [pendingId, setPendingId] = useState("");
    const [message, setMessage] = useState("");
    const sortedRaces = useMemo(() => races ?? [], [races]);

    async function updateRace(race, status) {
        setMessage("");
        setPendingId(race.id);

        try {
            const response = await fetch(`/api/admin/erich/race-definitions/${race.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status, reason }),
            });
            const data = await response.json();
            setPendingId("");

            if (!response.ok) {
                const blockers = data.blockers?.length ? ` (${data.blockers.join(", ")})` : "";
                setMessage(`${data.error || "Status konnte nicht aktualisiert werden."}${blockers}`);
                return;
            }

            setMessage(`Rennen ${race.raceNumber} aktualisiert.`);
            router.refresh();
        } catch (error) {
            setPendingId("");
            setMessage(error.message || "Status konnte nicht aktualisiert werden.");
        }
    }

    if (sortedRaces.length === 0) {
        return <p className="text-muted">Für dieses Event sind noch keine ERICH-Rennen importiert.</p>;
    }

    return (
        <div className="erich-review">
            <div className="erich-review__toolbar">
                <label className="field" htmlFor="erich-review-reason">
                    <span className="label">Audit-Grund</span>
                    <input
                        id="erich-review-reason"
                        className="input"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        maxLength={700}
                    />
                </label>
                {message ? <p className="auth-message">{message}</p> : null}
            </div>

            <div className="admin-list erich-review__list">
                {sortedRaces.map((race) => {
                    const blockers = blockersForRace(race);
                    const canActivate = race.review?.canActivate && blockers.length === 0;

                    return (
                        <article key={race.id} className="admin-list-row erich-review-row">
                            <div className="admin-list-row__main">
                                <strong>
                                    #{race.raceNumber} {race.classLabel ?? "Klasse offen"} ·{" "}
                                    {race.distanceLabel ?? "Distanz offen"}
                                </strong>
                                <span>
                                    {race.gender ?? "Geschlecht offen"} · {valuationLevel(race)} ·{" "}
                                    {race.isTeamRace ? "Team" : "Einzel"}
                                </span>
                                <span>{priceSummary(race)}</span>
                                {race.reviewReason ? <span>{race.reviewReason}</span> : null}
                                {blockers.length ? (
                                    <span className="erich-review-row__blockers">
                                        {blockers.join(" · ")}
                                    </span>
                                ) : null}
                            </div>

                            <div className="admin-list-row__aside erich-review-row__actions">
                                <span className={STATUS_CLASSES[race.status] ?? "admin-status"}>
                                    {STATUS_LABELS[race.status] ?? race.status}
                                </span>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => updateRace(race, "ACTIVE")}
                                    disabled={!canActivate || pendingId === race.id}
                                >
                                    Aktivieren
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => updateRace(race, "REVIEW_REQUIRED")}
                                    disabled={pendingId === race.id}
                                >
                                    Review
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => updateRace(race, "INACTIVE")}
                                    disabled={pendingId === race.id}
                                >
                                    Sperren
                                </button>
                            </div>
                        </article>
                    );
                })}
            </div>
        </div>
    );
}
