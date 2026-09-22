import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { execSync } from "node:child_process";
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

function getAppVersion() {
    if (process.env.NEXT_PUBLIC_APP_VERSION) return process.env.NEXT_PUBLIC_APP_VERSION;
    if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);

    try {
        const commit = execSync("git rev-parse --short HEAD", {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        const dirty = execSync("git status --short", {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        return dirty ? `${commit}-dirty` : commit;
    } catch {
        return "local";
    }
}

export default function RootLayout({ children }) {
    const appVersion = getAppVersion();

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
                        <span>Version {appVersion}</span>
                    </div>
                </footer>
            </body>
        </html>
    );
}
