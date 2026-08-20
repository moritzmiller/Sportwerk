import Link from "next/link";

export default function ErichNav() {
    return (
        <nav className="erich-nav" aria-label="ERICH Navigation">
            <div className="erich-container erich-nav__inner">
                <Link href="/erich/register" className="erich-nav__brand">
                    <img src={"/logo.png"} alt={"Logo"} className={"logo"}/>
                </Link>
                <div className="erich-nav__links">
                    <Link href="/erich/register" className="erich-nav__link">
                        Registrierung
                    </Link>
                    <Link href="/admin/erich/readiness" className="erich-nav__link">
                        Readiness
                    </Link>
                    <Link href="/admin/erich/races" className="erich-nav__link">
                        Rennen
                    </Link>
                    <Link href="/admin/erich/clubs" className="erich-nav__link">
                        Vereine
                    </Link>
                    <Link href="/" className="erich-nav__link erich-nav__link--muted">
                        GateKeeper
                    </Link>
                </div>
            </div>
        </nav>
    );
}
