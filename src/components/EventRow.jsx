import { getCategory } from "@/lib/categories";
import { getEventRemainingCapacity, getEventStatusLabel } from "@/lib/event-management";
import ScannerLinkButton from "@/components/ScannerLinkButton";

const MONTHS = ["Jan", "Feb", "Maer", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function formatPrice(price) {
    if (!price || Number(price) === 0) return "Kostenlos";
    return Number(price).toLocaleString("de-DE", {
        style: "currency",
        currency: "EUR",
    });
}

export default function EventRow({ event, editHref }) {
    const cat = getCategory(event.category);
    const d = new Date(event.startDate);
    const remaining = getEventRemainingCapacity(event);

    return (
        <div className="event-row" style={{ "--cat-color": cat.color }}>
            <div className="event-row__date">
                <span className="d">{d.getDate()}</span>
                <span className="m">{MONTHS[d.getMonth()]}</span>
            </div>
            <div className="event-row__main">
                <div className="event-row__title">{event.title}</div>
                <div className="event-row__meta">
                    <span>
                        {cat.emoji} {cat.label}
                    </span>
                    <span>{event.location}</span>
                    <span>
                        {d.toLocaleTimeString("de-DE", {
                            hour: "2-digit",
                            minute: "2-digit",
                        })}{" "}
                        Uhr
                    </span>
                    <span>{getEventStatusLabel(event.status)}</span>
                    {event.attendance?.paidTickets ? (
                        <span>
                            {event.attendance.checkedInTickets} / {event.attendance.paidTickets}{" "}
                            anwesend
                        </span>
                    ) : null}
                    {remaining !== null ? <span>{remaining} Plätze frei</span> : null}
                </div>
            </div>
            <div className="flex wrap" style={{ justifyContent: "flex-end" }}>
                <span className="event-row__badge">{formatPrice(event.price)}</span>
                {editHref ? (
                    <a href={editHref} className="btn btn-ghost">
                        Bearbeiten
                    </a>
                ) : null}
                <ScannerLinkButton eventId={event.id} />
            </div>
        </div>
    );
}
