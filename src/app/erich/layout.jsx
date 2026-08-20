import ErichNav from "@/components/ErichNav";

import "./erich.css";

export default function ErichLayout({ children }) {
    return (
        <div className="erich-shell">
            <ErichNav />
            {children}
        </div>
    );
}
