"use client";

function createEmptyTicketType(index = 0) {
    return {
        id: null,
        name: index === 0 ? "Standard" : `Ticket ${index + 1}`,
        description: "",
        price: "",
        quota: "",
        maxPerBooking: "",
        isDefault: index === 0,
        sortOrder: index,
    };
}

export default function TicketTypeEditor({ value = [], onChange }) {
    const ticketTypes = value.length > 0 ? value : [createEmptyTicketType(0)];

    function updateTicketType(index, field, nextValue) {
        const next = ticketTypes.map((ticketType, currentIndex) =>
            currentIndex === index
                ? {
                      ...ticketType,
                      [field]: nextValue,
                  }
                : ticketType
        );

        if (field === "isDefault" && nextValue) {
            next.forEach((ticketType, currentIndex) => {
                ticketType.isDefault = currentIndex === index;
            });
        }

        onChange(next);
    }

    function addTicketType() {
        onChange([...ticketTypes, createEmptyTicketType(ticketTypes.length)]);
    }

    function removeTicketType(index) {
        const next = ticketTypes.filter((_, currentIndex) => currentIndex !== index);

        if (next.length === 0) {
            next.push(createEmptyTicketType(0));
        }

        if (!next.some((ticketType) => ticketType.isDefault)) {
            next[0].isDefault = true;
        }

        onChange(next.map((ticketType, currentIndex) => ({
            ...ticketType,
            sortOrder: currentIndex,
        })));
    }

    function setDefault(index) {
        onChange(
            ticketTypes.map((ticketType, currentIndex) => ({
                ...ticketType,
                isDefault: currentIndex === index,
            }))
        );
    }

    return (
        <div className="stack">
            <div className="section-title-row">
                <h3>Tickettypen</h3>
                <button type="button" className="btn btn-ghost" onClick={addTicketType}>
                    Typ hinzufügen
                </button>
            </div>

            <p className="field-hint">
                Der Standard-Tickettyp bestimmt den angezeigten Basispreis im Event.
            </p>

            <div className="stack">
                {ticketTypes.map((ticketType, index) => (
                    <div key={ticketType.id || `ticket-type-${index}`} className="card stack">
                        <div className="section-title-row">
                            <strong>{ticketType.isDefault ? "Standard" : `Typ ${index + 1}`}</strong>
                            <div className="flex wrap">
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => setDefault(index)}
                                >
                                    Als Standard
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => removeTicketType(index)}
                                >
                                    Entfernen
                                </button>
                            </div>
                        </div>

                        <div className="grid checkout-form__grid">
                            <div className="field checkout-form__wide">
                                <label className="label">Name</label>
                                <input
                                    className="input"
                                    value={ticketType.name}
                                    onChange={(e) => updateTicketType(index, "name", e.target.value)}
                                    placeholder="Standard, VIP, Early Bird ..."
                                />
                            </div>

                            <div className="field checkout-form__wide">
                                <label className="label">Beschreibung</label>
                                <textarea
                                    className="textarea"
                                    value={ticketType.description}
                                    onChange={(e) =>
                                        updateTicketType(index, "description", e.target.value)
                                    }
                                    placeholder="Optionaler Hinweis zum Tickettyp"
                                />
                            </div>

                            <div className="field">
                                <label className="label">Preis</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className="input"
                                    value={ticketType.price}
                                    onChange={(e) =>
                                        updateTicketType(index, "price", e.target.value)
                                    }
                                    placeholder="0.00"
                                />
                            </div>

                            <div className="field">
                                <label className="label">Kontingent</label>
                                <input
                                    type="number"
                                    min="1"
                                    className="input"
                                    value={ticketType.quota}
                                    onChange={(e) =>
                                        updateTicketType(index, "quota", e.target.value)
                                    }
                                    placeholder="Optional"
                                />
                            </div>

                            <div className="field">
                                <label className="label">Max. pro Buchung</label>
                                <input
                                    type="number"
                                    min="1"
                                    className="input"
                                    value={ticketType.maxPerBooking}
                                    onChange={(e) =>
                                        updateTicketType(index, "maxPerBooking", e.target.value)
                                    }
                                    placeholder="Optional"
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

