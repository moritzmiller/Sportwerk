import Link from "next/link";
import { redirect } from "next/navigation";

import ProfileForm from "@/components/ProfileForm";
import { getCurrentUser } from "@/lib/auth";
import { getPaymentMethodLabel } from "@/lib/bookings";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
    const user = await getCurrentUser();

    if (!user) redirect("/auth");

    const hasBillingAddress =
        user.billingStreet && user.billingPostalCode && user.billingCity;

    return (
        <main className="section">
            <div className="container dash">
                <div className="checkout-page__header">
                    <div>
                        <span className="eyebrow">Konto</span>
                        <h1 className="section-header__title">Dein Profil</h1>
                        <p className="text-muted">
                            Hier verwaltest du deinen Anzeigenamen, deine
                            Rechnungsadresse und die bevorzugte Zahlungsmethode.
                        </p>
                    </div>
                    <div className="flex wrap">
                        <Link href="/dashboard/orders" className="btn btn-ghost">
                            Bestellungen
                        </Link>
                        <Link href="/dashboard" className="btn btn-primary">
                            Zurück zum Dashboard
                        </Link>
                    </div>
                </div>

                <div className="dash__grid dash__grid--split">
                    <ProfileForm user={user} />

                    <aside className="card stack">
                        <h2 className="card__title">Kurzüberblick</h2>
                        <div className="summary-list">
                            <div>
                                <span className="label">E-Mail</span>
                                <strong>{user.email}</strong>
                            </div>
                            <div>
                                <span className="label">Zahlungsmethode</span>
                                <strong>{getPaymentMethodLabel(user.preferredPaymentMethod)}</strong>
                            </div>
                            <div>
                                <span className="label">Rechnungsadresse</span>
                                <strong>
                                    {hasBillingAddress
                                        ? `${user.billingStreet}, ${user.billingPostalCode} ${user.billingCity}`
                                        : "Noch nicht vollständig hinterlegt"}
                                </strong>
                            </div>
                            <div>
                                <span className="label">PayPal Kontakt</span>
                                <strong>{user.paypalEmail ?? "Nicht angegeben"}</strong>
                            </div>
                        </div>

                        <div className="checkout-success__summary">
                            <div>
                                <span className="label">Name</span>
                                <p>{user.name ?? "Nicht gesetzt"}</p>
                            </div>
                            <div>
                                <span className="label">Land</span>
                                <p>{user.billingCountry ?? "DE"}</p>
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
        </main>
    );
}
