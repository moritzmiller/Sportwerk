"use client";

export default function PrintPageButton({ className = "btn btn-primary", children = "Drucken" }) {
    return (
        <button type="button" className={className} onClick={() => window.print()}>
            {children}
        </button>
    );
}
