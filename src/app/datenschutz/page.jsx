import Link from "next/link";

export const metadata = {
    title: "Datenschutz - GateKeeper",
    description: "Datenschutzhinweise für Gäste, Ticketkäufer und Veranstalter bei GateKeeper.",
};

const dataCategories = [
    {
        title: "Konto- und Profildaten",
        text: "Name, E-Mail-Adresse, Rolle, Login-Status, Organisationszuordnung und sicherheitsrelevante Kontoinformationen.",
    },
    {
        title: "Veranstaltungs- und Veranstalterdaten",
        text: "Eventtitel, Beschreibungen, Zeiten, Orte, Kontingente, Ticketarten, Veranstaltungsstatus, Organisationsmitglieder und Veranstaltungsorte.",
    },
    {
        title: "Buchungs- und Ticketdaten",
        text: "Buchungsnummern, Ticketmengen, Ticketstatus, QR- oder Prüfcodes, Check-in-Status, Käuferdaten und veranstaltungsbezogene Kommunikation.",
    },
    {
        title: "Zahlungs- und Abrechnungsdaten",
        text: "Zahlungsstatus, Zahlungsart, Transaktionsreferenzen, Gebühren, Erstattungen und für Zahlungsanbieter notwendige Abwicklungsdaten.",
    },
    {
        title: "Technische Daten",
        text: "IP-Adresse, Zeitstempel, Browserinformationen, Serverlogs, Sicherheitsereignisse, Rate-Limit-Daten und Fehlermeldungen.",
    },
];

export default function DatenschutzPage() {
    return (
        <main className="legal-page">
            <section className="container legal-page__inner">
                <div className="legal-page__header">
                    <span className="legal-page__eyebrow">Stand: 08.09.2026</span>
                    <h1>Datenschutz</h1>
                    <p>
                        Diese Datenschutzhinweise gelten für GateKeeper, wenn Gäste Tickets buchen oder verwalten und
                        wenn Veranstalter Events, Organisationen, Zahlungen und Check-in-Prozesse über die Plattform
                        steuern.
                    </p>
                </div>

                <div className="legal-notice">
                    <strong>Verantwortlichen ergänzen</strong>
                    <p>
                        Name, Anschrift und Kontakt des datenschutzrechtlich Verantwortlichen müssen vor einer
                        Veröffentlichung im Impressum und hier ergänzt werden.
                    </p>
                </div>

                <section className="legal-card">
                    <h2>1. Verantwortlicher</h2>
                    <p>
                        Verantwortlich für die Verarbeitung personenbezogener Daten ist: [Betreibername, Anschrift und
                        Kontakt ergänzen]. Datenschutzanfragen können an [Datenschutz-Kontakt ergänzen] gerichtet
                        werden.
                    </p>
                </section>

                <section className="legal-card">
                    <h2>2. Zwecke der Verarbeitung</h2>
                    <p>GateKeeper verarbeitet personenbezogene Daten insbesondere, um:</p>
                    <ul className="legal-list">
                        <li>Nutzerkonten für Gäste, Ticketkäufer, Veranstalter und Administratoren bereitzustellen.</li>
                        <li>Veranstaltungen zu veröffentlichen, zu verwalten und auffindbar zu machen.</li>
                        <li>Buchungen, Tickets, QR-Codes, Check-ins, Erstattungen und Statusmeldungen abzuwickeln.</li>
                        <li>Zahlungen vorzubereiten, Zahlungsstatus zu prüfen und Abrechnungsdaten zu dokumentieren.</li>
                        <li>Veranstalter bei Organisationen, Teams, Veranstaltungsorten und Reporting zu unterstützen.</li>
                        <li>Sicherheit, Missbrauchsschutz, Fehleranalyse und Systembetrieb zu gewährleisten.</li>
                        <li>gesetzliche Aufbewahrungs-, Nachweis- und Auskunftspflichten zu erfüllen.</li>
                    </ul>
                </section>

                <section className="legal-card">
                    <h2>3. Kategorien personenbezogener Daten</h2>
                    <div className="legal-grid">
                        {dataCategories.map((item) => (
                            <article key={item.title}>
                                <h3>{item.title}</h3>
                                <p>{item.text}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="legal-card">
                    <h2>4. Rechtsgrundlagen</h2>
                    <p>
                        Die Verarbeitung erfolgt, soweit anwendbar, zur Vertragserfüllung oder Durchführung
                        vorvertraglicher Maßnahmen, zur Erfüllung gesetzlicher Pflichten, aufgrund berechtigter
                        Interessen an sicherem Plattformbetrieb und Missbrauchsschutz sowie auf Grundlage einer
                        Einwilligung, wenn GateKeeper eine solche gesondert einholt.
                    </p>
                </section>

                <section className="legal-card">
                    <h2>5. Empfänger und Dienstleister</h2>
                    <p>
                        Daten können an Veranstalter weitergegeben werden, soweit dies für Buchung, Teilnehmerlisten,
                        Einlass, Rückfragen oder Veranstaltungsdurchführung erforderlich ist. Zahlungsdaten können an
                        angebundene Zahlungsdienstleister übermittelt werden. Technische Dienstleister für Hosting,
                        Datenbank, Authentifizierung, E-Mail-Versand, Monitoring oder Zahlungsabwicklung können als
                        Auftragsverarbeiter oder eigenständige Verantwortliche eingebunden sein.
                    </p>
                </section>

                <section className="legal-card">
                    <h2>6. E-Mail und Benachrichtigungen</h2>
                    <p>
                        GateKeeper kann transaktionale E-Mails versenden, etwa zur Registrierung, Passwort-Zurücksetzung,
                        Buchungsbestätigung, Ticketzustellung, Zahlungserinnerung, Stornierung, Erstattung oder
                        veranstaltungsbezogenen Aktualisierung. Marketing- oder Newsletter-Kommunikation erfolgt nur,
                        wenn eine entsprechende Einwilligung vorliegt oder eine gesetzliche Grundlage besteht.
                    </p>
                </section>

                <section className="legal-card">
                    <h2>7. Cookies, lokale Speicherung und Sicherheit</h2>
                    <p>
                        GateKeeper kann technisch notwendige Cookies oder vergleichbare Speichertechniken einsetzen, um
                        Login, Sitzungen, Sicherheit und Plattformfunktionen bereitzustellen. Sicherheitslogs,
                        Rate-Limit-Daten und Systemereignisse werden verarbeitet, um unbefugte Zugriffe, Missbrauch und
                        technische Störungen zu erkennen.
                    </p>
                </section>

                <section className="legal-card">
                    <h2>8. Speicherdauer</h2>
                    <p>
                        Daten werden nur so lange gespeichert, wie sie für die genannten Zwecke erforderlich sind.
                        Buchungs-, Zahlungs-, Rechnungs- und Nachweisdaten können aufgrund gesetzlicher Pflichten
                        länger aufbewahrt werden. Veranstalterdaten bleiben gespeichert, solange ein Konto, eine
                        Organisation oder gesetzliche Nachweispflichten bestehen.
                    </p>
                </section>

                <section className="legal-card">
                    <h2>9. Rechte betroffener Personen</h2>
                    <p>
                        Betroffene Personen haben nach Maßgabe der DSGVO Rechte auf Auskunft, Berichtigung, Löschung,
                        Einschränkung der Verarbeitung, Datenübertragbarkeit, Widerspruch und Widerruf erteilter
                        Einwilligungen. Zudem besteht ein Beschwerderecht bei einer zuständigen Aufsichtsbehörde.
                    </p>
                </section>

                <section className="legal-card">
                    <h2>10. Besonderheiten für Veranstalter</h2>
                    <p>
                        Veranstalter dürfen personenbezogene Daten von Gästen und Ticketkäufern nur für die
                        jeweilige Veranstaltung, Abwicklung, Einlasskontrolle, gesetzliche Pflichten und berechtigte
                        Rückfragen nutzen. Eine darüber hinausgehende Verwendung, etwa für eigene Werbung, erfordert
                        eine eigene Rechtsgrundlage oder Einwilligung.
                    </p>
                </section>

                <section className="legal-card">
                    <h2>11. Aktualisierung dieser Hinweise</h2>
                    <p>
                        GateKeeper kann diese Datenschutzhinweise anpassen, wenn sich Funktionen, Dienstleister,
                        Rechtslage oder Verarbeitungsabläufe ändern. Die jeweils aktuelle Fassung ist auf dieser Seite
                        abrufbar.
                    </p>
                </section>

                <nav className="legal-page__links" aria-label="Weitere Rechtstexte">
                    <Link href="/impressum">Impressum</Link>
                    <Link href="/agb">AGB</Link>
                </nav>
            </section>
        </main>
    );
}
