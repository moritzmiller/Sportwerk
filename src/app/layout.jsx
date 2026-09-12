import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import "@/components/OfferStudio.css";

import Nav from "@/app/global/nav.jsx";
import AuthRecoveryRedirect from "@/components/AuthRecoveryRedirect";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata = {
    title: "GateKeeper - Events in Dresden",
    description: "Entdecke aktuelle Events in Dresden, buche Tickets und verwalte deine Buchungen.",
};

export default function RootLayout({ children }) {
    return (
        <html lang="de">
            <body className={`${geistSans.variable} ${geistMono.variable}`}>
                <AuthRecoveryRedirect />
                <Nav />
                {children}
                <footer className="footer">
                    <div className="container flex-between">
                        <span>&copy; {new Date().getFullYear()} GateKeeper</span>
                        <ul className="footer__links" aria-label="Rechtliches">
                            <li><Link href="/kontakt">Kontakt</Link></li>
                            <li><Link href="/impressum">Impressum</Link></li>
                            <li><Link href="/datenschutz">Datenschutz</Link></li>
                            <li><Link href="/agb">AGB</Link></li>
                        </ul>
                    </div>
                </footer>
            </body>
        </html>
    );
}
