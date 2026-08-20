import Link from "next/link";

import ErichNewsletterForm from "@/components/ErichNewsletterForm";
import { getCurrentErichUserOrGuest } from "@/lib/erich/guest-session";
import { getRegistrationBatch } from "@/lib/erich/registration-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Danke fuer deine ERICH Bestellung - GateKeeper",
};

function cents(amountCents, currency = "EUR") {
    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency,
    }).format(Number(amountCents || 0) / 100);
}

function entryTime(entry) {
    return `${entry.targetTimeMinutes}:${String(entry.targetTimeSeconds).padStart(2, "0")}.${String(
        entry.targetTimeMilliseconds
    ).padStart(3, "0")}`;
}

function raceTitle(entry) {
    return [
        entry.raceDefinition?.classLabel,
        entry.raceDefinition?.distanceLabel,
        entry.raceDefinition?.gender,
    ].filter(Boolean).join(" - ");
}

function primaryEmail(batch) {
    return batch?.raceEntries?.find((entry) => entry.athlete?.email)?.athlete?.email ?? "";
}

export default async function ErichThankYouPage({ searchParams }) {
    const { user } = await getCurrentErichUserOrGuest();
    const resolvedSearchParams = await searchParams;
    const batchId = resolvedSearchParams?.batchId ?? "";

    let batch = null;
    let error = "";

    if (!user) {
        error = "Diese Bestellung konnte ohne aktive Sitzung nicht geladen werden.";
    } else if (!batchId) {
        error = "Keine ERICH-Bestellung ausgewaehlt.";
    } else {
        try {
            batch = await getRegistrationBatch(prisma, { user, batchId });
        } catch {
            error = "Diese ERICH-Bestellung konnte nicht geladen werden.";
        }
    }

    return (
        <main className="erich-page">
            <div className="erich-container">
                <div className="erich-page__header">
                    <div>
                        <span className="erich-eyebrow">ERICH Bestellung</span>
                        <h1>Danke fuer deine Bestellung</h1>
                        <p>
                            Deine Anmeldung wurde entgegengenommen. Hier findest du noch einmal
                            die gebuchten Athleten und Rennen.
                        </p>
                    </div>
                    <div className="erich-page__status" aria-label="Bestellstatus">
                        <span>Status</span>
                        <strong>{batch?.status ?? "Offen"}</strong>
                    </div>
                </div>

                {error ? (
                    <section className="erich-panel stack">
                        <p className="auth-message">{error}</p>
                        <Link href="/erich/register" className="btn btn-primary">
                            Zur Registrierung
                        </Link>
                    </section>
                ) : (
                    <div className="erich-thank-you-grid">
                        <section className="erich-panel stack">
                            <div className="section-title-row">
                                <h2>Gebuchte Rennen</h2>
                                <span className="text-muted">{batch.raceEntries.length} Meldungen</span>
                            </div>

                            <div className="stack">
                                {batch.raceEntries.map((entry) => (
                                    <article key={entry.id} className="analysis-card">
                                        <div className="erich-thank-you-entry">
                                            <div>
                                                <strong>
                                                    {entry.athlete?.firstName} {entry.athlete?.lastName}
                                                </strong>
                                                <p>
                                                    Rennen #{entry.raceNumber}
                                                    {raceTitle(entry) ? ` - ${raceTitle(entry)}` : ""}
                                                </p>
                                            </div>
                                            <div>
                                                <span>{entryTime(entry)}</span>
                                                <strong>{cents(entry.priceCents, entry.currency)}</strong>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>

                            <div className="summary-list">
                                <div>
                                    <span className="label">Gesamt</span>
                                    <strong>{cents(batch.summary.totalCents, batch.summary.currency)}</strong>
                                </div>
                            </div>
                        </section>

                        <aside className="erich-panel stack">
                            <div>
                                <h2>Newsletter</h2>
                                <p className="text-muted">
                                    Erhalte Neuigkeiten zur ERICH-Veranstaltung und organisatorische Hinweise.
                                </p>
                            </div>
                            <ErichNewsletterForm batchId={batch.id} defaultEmail={primaryEmail(batch)} />
                            <Link href="/erich/register" className="btn btn-ghost">
                                Weitere Anmeldung starten
                            </Link>
                        </aside>
                    </div>
                )}
            </div>
        </main>
    );
}
