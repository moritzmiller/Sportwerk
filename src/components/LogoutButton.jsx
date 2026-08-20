"use client";

export default function LogoutButton({ className = "btn btn-ghost" }) {
    async function handleLogout() {
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        window.location.href = "/auth";
    }

    return (
        <button type="button" onClick={handleLogout} className={className}>
            Abmelden
        </button>
    );
}
