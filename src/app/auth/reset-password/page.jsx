import ResetPasswordForm from "@/components/ResetPasswordForm";

export const metadata = {
    title: "Passwort zurücksetzen - GateKeeper",
};

export default function ResetPasswordPage() {
    return (
        <main className="section">
            <div className="container container-narrow stack-lg text-center">
                <div className="stack">
                    <span className="eyebrow">Sicherheit</span>
                    <h1 className="section-header__title">Neues Passwort setzen</h1>
                    <p className="text-muted">
                        Öffne diese Seite über den Link aus deiner GateKeeper-Mail und
                        wähle ein neues Passwort.
                    </p>
                </div>
                <ResetPasswordForm />
            </div>
        </main>
    );
}
