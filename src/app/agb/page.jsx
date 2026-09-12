import Link from "next/link";

export const metadata = {
    title: "AGB und Ticketbedingungen - GateKeeper",
    description: "Buchungs-, Zahlungs- und Stornierungsbedingungen für GateKeeper.",
};

export default function AgbPage() {
    return (
        <main className="legal-page">
            <section className="container legal-page__inner stack-lg">
                <header className="legal-header">
                    <span className="eyebrow">Bedingungen</span>
                    <h1>AGB und Ticketbedingungen</h1>
                    <p>
                        Diese Bedingungen regeln die Nutzung von GateKeeper für
                        Eventsuche, Ticketbuchung, Reservierung, Zahlung und Check-in.
                        Sie sollten vor produktivem Verkauf juristisch final geprüft
                        werden.
                    </p>
                </header>

                <section className="legal-section stack">
                    <h2>Rolle von GateKeeper</h2>
                    <p>
                        GateKeeper stellt technische Infrastruktur für Eventlisting,
                        Ticketbuchung, Zahlungsabwicklung, Reservierungen und QR-Check-in
                        bereit. Vertragspartner für die Durchführung eines Events ist,
                        soweit nicht anders angegeben, der jeweilige Veranstalter.
                    </p>
                </section>

                <section className="legal-section stack">
                    <h2>Buchung und Vertragsschluss</h2>
                    <p>
                        Mit Absenden der Buchung gibt der Nutzer ein verbindliches
                        Buchungsangebot ab. Die Annahme erfolgt durch Anzeige der
                        Buchungsbestätigung, Versand einer Ticket-E-Mail oder
                        Bestätigung durch den Veranstalter.
                    </p>
                </section>

                <section className="legal-section stack">
                    <h2>Zahlung</h2>
                    <p>
                        Je nach Event können PayPal, Stripe, Rechnung oder
                        Banküberweisung verfügbar sein. Eine Buchung kann bis zum
                        vollständigen Zahlungseingang als offen oder reserviert
                        markiert bleiben. Zahlungsanbieter können eigene Bedingungen
                        anwenden.
                    </p>
                </section>

                <section className="legal-section stack">
                    <h2>Tickets und Einlass</h2>
                    <p>
                        Tickets werden elektronisch bereitgestellt und können per
                        QR-Code am Einlass geprüft werden. Der Buchende ist dafür
                        verantwortlich, Ticketdaten nicht unbefugt weiterzugeben.
                        Einlassregeln, Altersbeschränkungen und Hausrecht des
                        Veranstalters bleiben vorbehalten.
                    </p>
                </section>

                <section className="legal-section stack">
                    <h2>Stornierung und Rückerstattung</h2>
                    <p>
                        Stornierungen und Rückerstattungen richten sich nach den
                        Angaben des jeweiligen Events und den Entscheidungen des
                        Veranstalters. Bei abgesagten Events wird über Ersatztermin,
                        Umbuchung oder Rückerstattung informiert.
                    </p>
                </section>

                <section className="legal-section stack">
                    <h2>Widerruf</h2>
                    <p>
                        Für Tickets zu Veranstaltungen mit festem Termin kann das
                        gesetzliche Widerrufsrecht nach § 312g Abs. 2 Nr. 9 BGB
                        ausgeschlossen sein. Soweit ein Widerrufsrecht besteht,
                        informieren wir vor oder während des Buchungsprozesses
                        gesondert darüber.
                    </p>
                </section>

                <section className="legal-section stack">
                    <h2>Kontakt</h2>
                    <p>
                        Fragen zu Buchungen, Stornierungen oder rechtlichen Angaben
                        können über die <Link href="/kontakt" className="inline-link">Kontaktseite</Link>{" "}
                        gestellt werden.
                    </p>
                </section>
            </section>
        </main>
    );
}
