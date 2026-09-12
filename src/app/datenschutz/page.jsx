import Link from "next/link";

export const metadata = {
    title: "Datenschutz - GateKeeper",
    description: "Datenschutzhinweise für die Nutzung von GateKeeper.",
};

export default function DatenschutzPage() {
    return (
        <main className="legal-page">
            <section className="container legal-page__inner stack-lg">
                <header className="legal-header">
                    <span className="eyebrow">Rechtliches</span>
                    <h1>Datenschutzerklärung</h1>
                    <p>
                        Diese Hinweise beschreiben die Verarbeitung personenbezogener
                        Daten bei der Nutzung von GateKeeper. Betreiberangaben und
                        Auftragsverarbeiter müssen vor dem Livegang final geprüft
                        und ergänzt werden.
                    </p>
                </header>

                <section className="legal-section stack">
                    <h2>Verantwortlicher</h2>
                    <p>
                        Famous Designs GbR, vertreten durch:<br/>
                        Moritz Dangrieß<br/>
                        Fabio Lehmberg <br/><br/>
                        Famous Designs GbR,<br/>
                        Walther-Rathenau Straße 11<br/>
                        01900 Großröhrsdorf.<br/><br/>
                        Kontakt:{" "}
                        <a className="inline-link" href="mailto:mail@your-domain.example">mail@your-domain.example</a>.
                    </p>
                </section>

                <section className="legal-section stack">
                    <h2>Verarbeitete Daten</h2>
                    <ul className="legal-list">
                        <li>Accountdaten wie Name, E-Mail-Adresse und Rolle.</li>
                        <li>Buchungsdaten wie Event, Ticketanzahl, Zahlungsstatus und Ticketcode.</li>
                        <li>Kommunikationsdaten aus Support-, Kontakt- und Systemmails.</li>
                        <li>Nutzungs- und Sicherheitsdaten wie Logdaten, Rate-Limits und Check-in-Scans.</li>
                        <li>Zahlungsbezogene Daten, soweit sie für Reservierung, Rechnung, Rückerstattung oder Zahlungsabgleich erforderlich sind.</li>
                    </ul>
                </section>

                <section className="legal-section stack">
                    <h2>Zwecke und Rechtsgrundlagen</h2>
                    <ul className="legal-list">
                        <li>Bereitstellung der Plattform und Nutzerkonten: Art. 6 Abs. 1 lit. b DSGVO.</li>
                        <li>Ticketbuchung, Zahlung, Einlass und Support: Art. 6 Abs. 1 lit. b DSGVO.</li>
                        <li>Sicherheitslogs, Missbrauchsschutz und Fehleranalyse: Art. 6 Abs. 1 lit. f DSGVO.</li>
                        <li>Gesetzliche Aufbewahrungspflichten: Art. 6 Abs. 1 lit. c DSGVO.</li>
                        <li>Newsletter oder Event-Updates nur mit Einwilligung: Art. 6 Abs. 1 lit. a DSGVO.</li>
                    </ul>
                </section>

                <section className="legal-section stack">
                    <h2>Dienstleister</h2>
                    <p>
                        GateKeeper kann technische Dienstleister für Hosting,
                        Datenbank, Authentifizierung, E-Mail-Versand und Zahlungen
                        einsetzen, zum Beispiel Vercel, Supabase, Resend/SMTP,
                        PayPal oder Stripe. Die konkrete Produktionskonfiguration
                        muss hier vor Launch mit den tatsächlich genutzten Anbietern
                        abgeglichen werden.
                    </p>
                </section>

                <section className="legal-section stack">
                    <h2>Speicherdauer</h2>
                    <p>
                        Daten werden gelöscht, sobald sie für die genannten Zwecke
                        nicht mehr erforderlich sind und keine gesetzlichen
                        Aufbewahrungspflichten entgegenstehen. Buchungs- und
                        Zahlungsdaten können aufgrund steuer- oder handelsrechtlicher
                        Pflichten länger gespeichert werden.
                    </p>
                </section>

                <section className="legal-section stack">
                    <h2>Betroffenenrechte</h2>
                    <p>
                        Du hast nach Maßgabe der DSGVO Rechte auf Auskunft,
                        Berichtigung, Löschung, Einschränkung der Verarbeitung,
                        Datenübertragbarkeit, Widerspruch und Widerruf erteilter
                        Einwilligungen. Außerdem besteht ein Beschwerderecht bei
                        einer Datenschutzaufsichtsbehörde.
                    </p>
                </section>

                <section className="legal-section stack">
                    <h2>Kontakt zum Datenschutz</h2>
                    <p>
                        Datenschutzanfragen kannst du per E-Mail stellen oder über
                        die <Link href="/kontakt" className="inline-link">Kontaktseite</Link> vorbereiten.
                    </p>
                </section>
            </section>
        </main>
    );
}
