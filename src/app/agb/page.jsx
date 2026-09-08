import Link from "next/link";

export const metadata = {
    title: "AGB - GateKeeper",
    description: "Allgemeine Geschäftsbedingungen für Gäste, Ticketkäufer und Veranstalter bei GateKeeper.",
};

export default function AgbPage() {
    return (
        <main className="legal-page">
            <section className="container legal-page__inner">
                <div className="legal-page__header">
                    <span className="legal-page__eyebrow">Stand: 08.09.2026</span>
                    <h1>AGB</h1>
                    <p>
                        Diese AGB regeln die Nutzung von GateKeeper durch Veranstalter, Gäste und Ticketkäufer. Sie
                        gelten für Eventverwaltung, Ticketbuchung, Zahlungsabwicklung, Einlass und damit verbundene
                        Plattformfunktionen.
                    </p>
                </div>

                <div className="legal-notice">
                    <strong>Rechtliche Finalprüfung nötig</strong>
                    <p>
                        Diese AGB sind ein vollständiger Arbeitsstand für die Plattform, ersetzen aber keine Prüfung
                        durch eine rechtskundige Stelle. Betreiberangaben, Zahlungsanbieter, Gebührenmodell und
                        Verbraucherinformationen müssen vor Livegang final bestätigt werden.
                    </p>
                </div>

                <section className="legal-card">
                    <h2>1. Geltungsbereich</h2>
                    <p>
                        GateKeeper ist eine Plattform für Veranstaltungserstellung, Ticketverkauf, Buchungsverwaltung,
                        Zahlungsstatus, Check-in und Reporting. Diese Bedingungen gelten für alle Nutzer, insbesondere
                        für Veranstalter, Organisationsmitglieder, Gäste und Ticketkäufer.
                    </p>
                </section>

                <section className="legal-card">
                    <h2>2. Vertragspartner und Rolle von GateKeeper</h2>
                    <p>
                        Der Vertrag über den Besuch einer Veranstaltung kommt grundsätzlich zwischen dem Gast oder
                        Ticketkäufer und dem jeweiligen Veranstalter zustande. GateKeeper stellt die technische
                        Plattform bereit und kann Buchung, Zahlungsstatus, Ticketzustellung und Einlassprüfung
                        unterstützen. Sofern GateKeeper selbst ausdrücklich als Veranstalter auftritt, gelten die
                        jeweiligen Angaben auf der Eventseite.
                    </p>
                </section>

                <section className="legal-card">
                    <h2>3. Nutzerkonten</h2>
                    <p>
                        Nutzer müssen bei Registrierung und Buchung richtige, aktuelle und erreichbare Angaben machen.
                        Zugangsdaten sind vertraulich zu behandeln. GateKeeper darf Konten einschränken oder sperren,
                        wenn ein Missbrauchsverdacht, Sicherheitsrisiko, Verstoß gegen diese AGB oder eine gesetzliche
                        Pflicht besteht.
                    </p>
                </section>

                <section className="legal-card">
                    <h2>4. Pflichten der Veranstalter</h2>
                    <ul className="legal-list">
                        <li>Veranstalter müssen alle Eventinformationen wahr, aktuell und vollständig pflegen.</li>
                        <li>Preise, Kapazitäten, Zeiten, Orte, Altersgrenzen, Einlassregeln und Stornoregeln müssen klar angegeben werden.</li>
                        <li>Veranstalter sind für Durchführung, Sicherheit, Genehmigungen, Steuern, Abgaben und eigene Informationspflichten verantwortlich.</li>
                        <li>Veranstalter dürfen GateKeeper nicht für rechtswidrige, irreführende oder diskriminierende Inhalte nutzen.</li>
                        <li>Personenbezogene Daten von Gästen dürfen nur für zulässige veranstaltungsbezogene Zwecke verwendet werden.</li>
                    </ul>
                </section>

                <section className="legal-card">
                    <h2>5. Pflichten von Gästen und Ticketkäufern</h2>
                    <ul className="legal-list">
                        <li>Gäste müssen Buchungs- und Kontaktdaten richtig angeben.</li>
                        <li>Tickets, QR-Codes und Buchungslinks dürfen nicht missbräuchlich vervielfältigt oder verändert werden.</li>
                        <li>Beim Einlass können Ticketprüfung, Identitätsprüfung oder veranstaltungsbezogene Nachweise erforderlich sein.</li>
                        <li>Hausrecht, Sicherheitsregeln und Hinweise des Veranstalters sind einzuhalten.</li>
                    </ul>
                </section>

                <section className="legal-card">
                    <h2>6. Tickets, Buchungen und Einlass</h2>
                    <p>
                        Ein Ticket berechtigt nur nach erfolgreicher Buchung und nach Maßgabe der jeweiligen Eventseite
                        zum Einlass. Der Einlass kann verweigert werden, wenn ein Ticket ungültig, bereits verwendet,
                        storniert, erstattet, manipuliert oder nicht den Eventbedingungen entsprechend genutzt wird.
                        GateKeeper kann den technischen Check-in dokumentieren.
                    </p>
                </section>

                <section className="legal-card">
                    <h2>7. Preise, Gebühren und Zahlung</h2>
                    <p>
                        Preise und etwaige Gebühren werden vor Abschluss der Buchung angezeigt. Zahlungsarten können
                        je nach Veranstaltung und Veranstalter variieren. Zahlungsanbieter können eigene Bedingungen
                        anwenden. Eine Buchung kann abhängig von Zahlungsstatus, Verfügbarkeit und Prüfung bestätigt,
                        offen, fehlgeschlagen, storniert oder erstattet sein.
                    </p>
                </section>

                <section className="legal-card">
                    <h2>8. Stornierung, Ausfall und Erstattung</h2>
                    <p>
                        Stornierungen, Umbuchungen und Erstattungen richten sich nach den Angaben des jeweiligen
                        Veranstalters, zwingenden gesetzlichen Rechten und dem Zahlungsstatus. Fällt eine Veranstaltung
                        aus oder wird sie wesentlich geändert, ist grundsätzlich der Veranstalter für Information und
                        Abwicklung verantwortlich. GateKeeper kann technische Funktionen zur Kommunikation und
                        Erstattung bereitstellen.
                    </p>
                </section>

                <section className="legal-card">
                    <h2>9. Inhalte und Rechte</h2>
                    <p>
                        Veranstalter räumen GateKeeper die zur Darstellung, Bewerbung, Verwaltung und technischen
                        Abwicklung der Veranstaltung notwendigen Nutzungsrechte an hochgeladenen Texten, Bildern und
                        sonstigen Inhalten ein. Veranstalter sichern zu, dass sie über die erforderlichen Rechte
                        verfügen und keine Rechte Dritter verletzen.
                    </p>
                </section>

                <section className="legal-card">
                    <h2>10. Verfügbarkeit und Änderungen</h2>
                    <p>
                        GateKeeper bemüht sich um stabile Verfügbarkeit, schuldet aber keine unterbrechungsfreie
                        Erreichbarkeit. Wartung, Sicherheitsmaßnahmen, Störungen bei Dienstleistern oder höhere
                        Gewalt können Funktionen einschränken. GateKeeper darf Funktionen weiterentwickeln, ändern
                        oder einstellen, sofern berechtigte Nutzerinteressen angemessen berücksichtigt werden.
                    </p>
                </section>

                <section className="legal-card">
                    <h2>11. Haftung</h2>
                    <p>
                        GateKeeper haftet unbeschränkt bei Vorsatz, grober Fahrlässigkeit, Verletzung von Leben,
                        Körper oder Gesundheit sowie nach zwingenden gesetzlichen Vorschriften. Im Übrigen haftet
                        GateKeeper nur nach Maßgabe des anwendbaren Rechts. Für die Durchführung, Sicherheit,
                        Beschreibung und Organisation einer Veranstaltung bleibt grundsätzlich der jeweilige
                        Veranstalter verantwortlich.
                    </p>
                </section>

                <section className="legal-card">
                    <h2>12. Datenschutz</h2>
                    <p>
                        Informationen zur Verarbeitung personenbezogener Daten stehen in der Datenschutzerklärung.
                        Veranstalter müssen eigene datenschutzrechtliche Pflichten beachten, wenn sie Daten von
                        Gästen, Ticketkäufern oder Teammitgliedern über GateKeeper verarbeiten.
                    </p>
                </section>

                <section className="legal-card">
                    <h2>13. Schlussbestimmungen</h2>
                    <p>
                        Es gilt deutsches Recht, soweit dem keine zwingenden Verbraucherschutzvorschriften
                        entgegenstehen. Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der
                        übrigen Bestimmungen unberührt. GateKeeper kann diese AGB mit Wirkung für die Zukunft
                        anpassen, wenn dies wegen neuer Funktionen, rechtlicher Entwicklungen oder betrieblicher
                        Anforderungen erforderlich ist.
                    </p>
                </section>

                <nav className="legal-page__links" aria-label="Weitere Rechtstexte">
                    <Link href="/impressum">Impressum</Link>
                    <Link href="/datenschutz">Datenschutz</Link>
                </nav>
            </section>
        </main>
    );
}
