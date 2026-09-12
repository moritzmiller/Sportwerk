import Link from "next/link";

export const metadata = {
    title: "Impressum - GateKeeper",
    description: "Anbieterkennzeichnung und Kontaktangaben von GateKeeper.",
};

export default function ImpressumPage() {
    return (
        <main className="legal-page">
            <section className="container legal-page__inner stack-lg">
                <header className="legal-header">
                    <span className="eyebrow">Rechtliches</span>
                    <h1>Impressum</h1>
                    <p>
                        Angaben gemäß § 5 DDG. Bitte ersetze die Platzhalter vor
                        produktivem Betrieb durch die echten Betreiberangaben.
                    </p>
                </header>

                <section className="legal-section stack">
                    <h2>Anbieter</h2>
                    <p>
                        Famous Designs GbR<br/>
                        Moritz Dangrieß<br/>
                        Fabio Lehmberg <br/><br/>
                        Walther-Rathenau Straße 11<br/>
                        01900 Großröhrsdorf.<br/><br/>
                        Deutschland
                    </p>
                </section>

                <section className="legal-section stack">
                    <h2>Kontakt</h2>
                    <p>
                        E-Mail: <a className="inline-link" href="mailto:mail@kontakt@famousdesigns.de">kontakt@famousdesigns.de</a><br />
                    </p>
                    <p>
                        Für Supportanfragen nutze bitte auch die{" "}
                        <Link href="/kontakt" className="inline-link">Kontaktseite</Link>.
                    </p>
                </section>

                <section className="legal-section stack">
                    <h2>Verantwortlich für Inhalte</h2>
                    <p>
                        Verantwortlich nach § 18 Abs. 2 MStV:<br />
                        Moritz Dangrieß
                    </p>
                </section>

                <section className="legal-section stack">
                    <h2>Streitbeilegung</h2>
                    <p>
                        Die Europäische Kommission stellt eine Plattform zur
                        Online-Streitbeilegung bereit. GateKeeper ist nicht
                        verpflichtet und nicht bereit, an Streitbeilegungsverfahren
                        vor einer Verbraucherschlichtungsstelle teilzunehmen, soweit
                        keine gesetzliche Pflicht besteht.
                    </p>
                </section>
            </section>
        </main>
    );
}
