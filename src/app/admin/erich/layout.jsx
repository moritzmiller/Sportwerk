import ErichNav from "@/components/ErichNav";
import "@/app/erich/erich.css";

export default function AdminErichLayout({ children }) {
    return (
        <div className="erich-shell">
            <ErichNav />
            {children}
        </div>
    );
}
