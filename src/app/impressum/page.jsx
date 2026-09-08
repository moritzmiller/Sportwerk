import Link from "next/link";

export const metadata = {
    title: "Impressum - GateKeeper",
    description: "Anbieterkennzeichnung und Kontaktangaben für GateKeeper.",
};

const operatorRows = [
    ["Anbieter", "[Betreibername ergänzen]"],
    ["Rechtsform", "[Rechtsform ergänzen, falls vorhanden]"],
    ["Vertreten durch", "[vertretungsberechtigte Person ergänzen]"],
    ["Anschrift", "[ladungsfähige Anschrift ergänzen]"],
    ["E-Mail", "[Kontakt-E-Mail ergänzen]"],
    ["Telefon", "[Telefonnummer ergänzen, falls vorhanden]"],
    ["Umsatzsteuer-ID", "[falls vorhanden ergänzen, sonst entfernen]"],
];

export default function ImpressumPage() {
    return (
        <main className="legal-page">
            <section className="container legal-page__inner">
                <div className="legal-page__header">
                    <span className="legal-page__eyebrow">GateKeeper</span>
                    <h1>Impressum</h1>
                    <p>
                        Anbieterkennzeichnung nach den gesetzlichen Informationspflichten. Diese Seite gilt für
                        GateKeeper als Plattform für Veranstalter, Gäste und Ticketkäufer.
                    </p>
                </div>

                <div className="legal-notice">
                    <strong>Betreiberangaben ergänzen</strong>
                    <p>
                        Die folgenden Pflichtangaben müssen vor einer Veröffentlichung mit den echten Betreiber-,
                        Adress- und Kontaktangaben ersetzt werden.
                    </p>
                </div>

                <section className="legal-card" aria-labelledby="anbieter">
                    <h2 id="anbieter">Anbieter</h2>
                    <dl className="legal-definition-list">
                        {operatorRows.map(([label, value]) => (
                            <div key={label}>
                                <dt>{label}</dt>
                                <dd>{value}</dd>
                            </div>
                        ))}
                    </dl>
                </section>

                <section className="legal-card" aria-labelledby="plattform">
                    <h2 id="plattform">Plattform und Rollen</h2>
                    <p>
                        GateKeeper stellt technische Funktionen für Eventveröffentlichung, Ticketbuchung,
                        Zahlungsabwicklung, Einlasskontrolle, Veranstalterverwaltung und Kommunikation bereit.
                        Veranstalter nutzen GateKeeper zur Organisation und Abwicklung eigener Veranstaltungen.
                        Gäste und Ticketkäufer nutzen GateKeeper zur Buchung, Verwaltung und Vorlage von Tickets.
                    </p>
                    <p>
                        Soweit nicht ausdrücklich anders angegeben, bleibt der jeweilige Veranstalter für die
                        Durchführung der Veranstaltung, die inhaltliche Beschreibung, Preise, Kapazitäten,
                        Einlassregeln und veranstaltungsbezogene Pflichten verantwortlich.
                    </p>
                </section>

                <section className="legal-card" aria-labelledby="streitbeilegung">
                    <h2 id="streitbeilegung">Streitbeilegung</h2>
                    <p>
                        Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung bereit. Der Link
                        zur Plattform kann bei Bedarf hier ergänzt werden. Eine Pflicht oder Bereitschaft zur Teilnahme
                        an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle besteht nur, soweit dies
                        gesetzlich vorgeschrieben oder vom Anbieter ausdrücklich erklärt wird.
                    </p>
                </section>

                <section className="legal-card" aria-labelledby="haftung">
                    <h2 id="haftung">Hinweise zur Haftung</h2>
                    <p>
                        GateKeeper bemüht sich um richtige und aktuelle Informationen. Für Inhalte, die Veranstalter
                        selbst einstellen, ist grundsätzlich der jeweilige Veranstalter verantwortlich. Nach Kenntnis
                        rechtswidriger Inhalte werden angemessene Maßnahmen zur Prüfung und Entfernung getroffen.
                    </p>
                </section>

                <nav className="legal-page__links" aria-label="Weitere Rechtstexte">
                    <Link href="/datenschutz">Datenschutz</Link>
                    <Link href="/agb">AGB</Link>
                </nav>
            </section>
        </main>
    );
}
