import Link from "next/link";
import { redirect } from "next/navigation";

import { getOptionalCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "GateKeeper - Event Operations für Veranstalter",
    description:
        "GateKeeper ist die B2B-Plattform für Ticketing, Einlass, Zahlungen und Veranstaltungssteuerung.",
};

const commandAreas = [
    { label: "Planung", value: "Events" },
    { label: "Verkauf", value: "Tickets" },
    { label: "Einlass", value: "Check-in" },
];

const platformModules = [
    {
        eyebrow: "Planung",
        title: "Veranstaltungen strukturiert aufsetzen",
        text: "Lege Events, Ticketkontingente, Sitzpläne, Veranstaltungsorte und Teams in einem sauberen Arbeitsbereich an.",
    },
    {
        eyebrow: "Verkauf",
        title: "Tickets und Zahlungen kontrolliert abwickeln",
        text: "Behalte Bestellungen, Zahlungsstatus, Rückerstattungen, Promo-Codes und manuelle Zahlungswege zentral im Blick.",
    },
    {
        eyebrow: "Einlass",
        title: "Check-in für schnelle Abläufe am Veranstaltungstag",
        text: "Scanner-Links, Ticketprüfung und Check-in-Übersichten helfen deinem Team, Gäste ohne Reibung einzulassen.",
    },
    {
        eyebrow: "Auswertung",
        title: "Entscheidungen aus echten Signalen treffen",
        text: "Erkenne Nachfrage, Buchungsentwicklung und operative Risiken, bevor sie am Veranstaltungstag teuer werden.",
    },
];

const proofPoints = [
    "Dashboard als zentrale Steuerzentrale für Veranstalter",
    "Rollen, Organisationen und Veranstaltungsorte für B2B-Teams",
    "Workflows für Buchungen, Zahlungen, Check-in und Reporting",
];

const workflowSteps = [
    "Event anlegen",
    "Tickets freigeben",
    "Bestellungen verfolgen",
    "Einlass steuern",
];

export default async function HomePage() {
    const user = await getOptionalCurrentUser();

    if (user) {
        redirect("/dashboard");
    }

    return (
        <main className="b2b-landing">
            <section className="b2b-hero">
                <div className="b2b-hero__image" aria-hidden="true" />
                <div className="container b2b-hero__inner">
                    <div className="b2b-hero__copy">
                        <span className="b2b-kicker">GateKeeper für Veranstalter</span>
                        <h1>
                            <span>Event-Zentrale</span>
                            <span>für Veranstalter.</span>
                        </h1>
                        <p>
                            Verkaufe Tickets, steuere Einlass, verwalte Veranstaltungen und halte dein Team auf einem
                            gemeinsamen Stand - vom ersten Setup bis zum letzten Check-in.
                        </p>
                        <div className="b2b-hero__actions" aria-label="GateKeeper starten">
                            <Link href="/auth" className="btn btn-primary btn-lg">
                                Anmelden und Dashboard öffnen
                            </Link>
                            <Link href="#plattform" className="btn btn-ghost btn-lg">
                                Plattform ansehen
                            </Link>
                        </div>
                    </div>

                    <div className="b2b-command-panel" aria-label="Dashboard Vorschau">
                        <div className="b2b-command-panel__header">
                            <span>Event Operations</span>
                            <strong>Arbeitsbereiche</strong>
                        </div>
                        <div className="b2b-command-panel__metrics">
                            {commandAreas.map((area) => (
                                <div key={area.label}>
                                    <strong>{area.value}</strong>
                                    <span>{area.label}</span>
                                </div>
                            ))}
                        </div>
                        <div className="b2b-command-panel__timeline">
                            {workflowSteps.map((step, index) => (
                                <div key={step} className={index < 3 ? "is-done" : undefined}>
                                    <span>{index + 1}</span>
                                    <strong>{step}</strong>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="b2b-trust-band" aria-label="Produktversprechen">
                <div className="container b2b-trust-band__grid">
                    {proofPoints.map((point) => (
                        <p key={point}>{point}</p>
                    ))}
                </div>
            </section>

            <section className="b2b-section" id="plattform">
                <div className="container">
                    <div className="b2b-section__header">
                        <span className="b2b-kicker">Plattform</span>
                        <h2>Alles, was dein Veranstaltungsteam jeden Tag braucht.</h2>
                    </div>

                    <div className="b2b-module-grid">
                        {platformModules.map((module) => (
                            <article key={module.title} className="b2b-module">
                                <span>{module.eyebrow}</span>
                                <h3>{module.title}</h3>
                                <p>{module.text}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="b2b-workflow">
                <div className="container b2b-workflow__inner">
                    <div>
                        <span className="b2b-kicker">Dashboard zuerst</span>
                        <h2>Angemeldete Nutzer landen direkt dort, wo Arbeit passiert.</h2>
                    </div>
                    <p>
                        Die Startseite ist für Kundenakquise da. Sobald ein Nutzer angemeldet ist, wird GateKeeper zur
                        Arbeitsoberfläche für Veranstaltungen, Bestellungen, Check-in, Organisationen und Auswertung.
                    </p>
                    <Link href="/auth" className="btn btn-primary">
                        Zum Login
                    </Link>
                </div>
            </section>
        </main>
    );
}
