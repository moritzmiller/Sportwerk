import AuthForm from "@/components/AuthForm";

export const metadata = {
    title: "Anmelden - GateKeeper",
};

export default function AuthPage() {
    return (
        <main className="section">
            <div className="container container-narrow stack-lg text-center">
                <div className="stack">
                    <span className="eyebrow">Willkommen</span>
                    <h1 className="section-header__title">Bei GateKeeper anmelden</h1>
                    <p className="text-muted">
                        Melde dich an oder registriere dich als Besucher oder Veranstalter.
                    </p>
                </div>
                <AuthForm />
            </div>
        </main>
    );
}

