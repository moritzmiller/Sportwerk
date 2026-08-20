import Link from "next/link";
import {
    formatMoney,
    getBookingStatusLabel,
    getBookingStatusTone,
    getPaymentMethodLabel,
} from "@/lib/bookings";

export default function BookingRow({ booking }) {
    const createdAt = new Date(booking.createdAt);

    return (
        <div className={`booking-row ${getBookingStatusTone(booking.status)}`}>
            <div className="booking-row__main">
                <div className="booking-row__title">
                    <Link href={`/events/${booking.eventId}`}>
                        {booking.event?.title ?? "Unbekanntes Event"}
                    </Link>
                </div>
                <div className="booking-row__meta">
                    <span>{booking.purchaserName}</span>
                    <span>{booking.quantity} Tickets</span>
                    <span>{getPaymentMethodLabel(booking.paymentMethod)}</span>
                    {booking.checkedInAt ? <span>Eingecheckt</span> : null}
                    <span>
                        {createdAt.toLocaleDateString("de-DE", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                        })}
                    </span>
                </div>
            </div>

            <div className="booking-row__aside">
                <strong>{formatMoney(booking.totalAmount)}</strong>
                <span>{getBookingStatusLabel(booking.status)}</span>
            </div>
        </div>
    );
}
