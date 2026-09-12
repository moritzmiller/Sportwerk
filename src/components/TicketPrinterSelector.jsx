import { TICKET_PRINTER_OPTIONS, normalizeTicketPrinter } from "@/lib/ticket-printers";

export default function TicketPrinterSelector({ value, onChange }) {
    const selected = normalizeTicketPrinter(value);

    return (
        <div className="field checkout-form__wide">
            <label className="label" htmlFor="ticketPrinter">
                Ticketdrucker
            </label>
            <select
                id="ticketPrinter"
                className="select"
                value={selected}
                onChange={(event) => onChange?.(normalizeTicketPrinter(event.target.value))}
            >
                {TICKET_PRINTER_OPTIONS.map((printer) => (
                    <option key={printer.value} value={printer.value}>
                        {printer.label}
                    </option>
                ))}
            </select>
            <p className="field-hint">
                {TICKET_PRINTER_OPTIONS.find((printer) => printer.value === selected)?.description}
            </p>
        </div>
    );
}
