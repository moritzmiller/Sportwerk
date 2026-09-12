import ContactForm from "@/components/ContactForm";

export const metadata = {
    title: "Kontakt - GateKeeper",
    description: "Kontaktformular für GateKeeper Support, Buchungen, Veranstalter und Datenschutzanfragen.",
};

export default function KontaktPage() {
    return (
        <main className="legal-page">
            <section className="container legal-page__inner stack-lg">
                <header className="legal-header">
                    <span className="eyebrow">Kontakt</span>
                    <h1>Wie können wir helfen?</h1>
                    <p>
                        Schreib uns deine Anfrage direkt über das Formular. Wenn
                        es um eine Buchung geht, kannst du deine Buchungsnummer
                        ergänzen.
                    </p>
                </header>

                <section className="legal-section stack">
                    <h2>Anfrage senden</h2>
                    <p>
                        Je genauer du Event, Buchung oder Problem beschreibst,
                        desto schneller können wir antworten.
                    </p>
                    <ContactForm />
                </section>

                <section className="legal-section stack">
                    <h2>Datenschutz und Rechtliches</h2>
                    <p>
                        Datenschutzanfragen, Auskunftsersuchen und rechtliche
                        Hinweise kannst du ebenfalls über dieses Formular
                        senden. Wähle dafür einfach das passende Anliegen aus.
                    </p>
                </section>
            </section>
        </main>
    );
}
