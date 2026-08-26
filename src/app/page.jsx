import Link from "next/link";
import { redirect } from "next/navigation";

import { getOptionalCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "GateKeeper - Event Operations fuer Veranstalter",
    description:
        "GateKeeper ist die B2B-Plattform fuer Ticketing, Einlass, Zahlungen und Veranstaltungssteuerung.",
};

const operatingMetrics = [
    { label: "Live Events", value: "24" },
    { label: "Check-ins heute", value: "3.842" },
    { label: "Auslastung", value: "91%" },
];

const platformModules = [
    {
        eyebrow: "Planung",
        title: "Veranstaltungen strukturiert aufsetzen",
        text: "Lege Events, Ticketkontingente, Sitzplaene, Veranstaltungsorte und Teams in einem sauberen Arbeitsbereich an.",
    },
    {
        eyebrow: "Verkauf",
        title: "Tickets und Zahlungen kontrolliert abwickeln",
        text: "Behalte Bestellungen, Zahlungsstatus, Rueckerstattungen und manuelle Zahlungswege zentral im Blick.",
    },
    {
        eyebrow: "Einlass",
        title: "Check-in fuer schnelle Abendablaeufe",
        text: "Scanner-Links, Ticketpruefung und Live-Statistiken helfen deinem Team, Gaeste ohne Reibung einzulassen.",
    },
    {
        eyebrow: "Auswertung",
        title: "Entscheidungen aus echten Signalen treffen",
        text: "Erkenne Nachfrage, Buchungsentwicklung und operative Risiken, bevor sie am Veranstaltungstag teuer werden.",
    },
];

const proofPoints = [
    "Dashboard als zentrale Steuerzentrale fuer Veranstalter",
    "Rollen, Organisationen und Veranstaltungsorte fuer B2B-Teams",
    "Operative Workflows fuer Buchungen, Check-in und Reporting",
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
                        <span className="b2b-kicker">GateKeeper fuer Veranstalter</span>
                        <h1>Die Betriebszentrale fuer professionelle Events.</h1>
                        <p>
                            Verkaufe Tickets, steuere Einlass, verwalte Veranstaltungen und halte dein Team auf einem
                            gemeinsamen Stand - vom ersten Setup bis zum letzten Check-in.
                        </p>
                        <div className="b2b-hero__actions" aria-label="GateKeeper starten">
                            <Link href="/auth" className="btn btn-primary btn-lg">
                                Anmelden und Dashboard oeffnen
                            </Link>
                            <Link href="#plattform" className="btn btn-ghost btn-lg">
                                Plattform ansehen
                            </Link>
                        </div>
                    </div>

                    <div className="b2b-command-panel" aria-label="Dashboard Vorschau">
                        <div className="b2b-command-panel__header">
                            <span>Event Operations</span>
                            <strong>Heute live</strong>
                        </div>
                        <div className="b2b-command-panel__metrics">
                            {operatingMetrics.map((metric) => (
                                <div key={metric.label}>
                                    <strong>{metric.value}</strong>
                                    <span>{metric.label}</span>
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
                        Die Mainpage ist fuer Kundenakquise da. Sobald ein Nutzer angemeldet ist, wird GateKeeper zur
                        Arbeitsoberflaeche fuer Veranstaltungen, Bestellungen, Check-in, Organisationen und Auswertung.
                    </p>
                    <Link href="/auth" className="btn btn-primary">
                        Zum Login
                    </Link>
                </div>
            </section>
        </main>
    );
}
