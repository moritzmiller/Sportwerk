"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const GENDER_OPTIONS = [
    { value: "MALE", label: "Maennlich" },
    { value: "FEMALE", label: "Weiblich" },
];

const PRICE_PRIORITY = ["ERICH", "DM", "MDM"];

function cents(amountCents, currency = "EUR") {
    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency,
    }).format(Number(amountCents || 0) / 100);
}

function birthYearFromDate(value) {
    if (!value) return null;
    return Number(String(value).slice(0, 4)) || null;
}

function eventDate(event) {
    if (!event?.startsAt) return "Termin offen";
    return new Date(event.startsAt).toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
}

function athleteLabel(athlete) {
    return `${athlete.firstName} ${athlete.lastName}`;
}

function raceLabel(race) {
    return `#${race.raceNumber} ${[race.classLabel, race.distanceLabel, race.gender]
        .filter(Boolean)
        .join(" - ")}`;
}

function billableLevel(race) {
    if (race.includesErich) return "ERICH";
    if (race.includesDm) return "DM";
    if (race.includesMdm) return "MDM";
    return null;
}

function priceForRace(race, phaseKey) {
    const level = billableLevel(race);
    if (!level) return null;

    return race.prices?.find(
        (price) => price.valuationLevel === level && price.pricePhase?.name === phaseKey
    );
}

function valuationLabels(race) {
    return PRICE_PRIORITY.filter((level) => {
        if (level === "ERICH") return race.includesErich;
        if (level === "DM") return race.includesDm;
        return race.includesMdm;
    });
}

function createAthleteForm() {
    return {
        firstName: "",
        lastName: "",
        gender: "MALE",
        birthDate: "",
        nationalityCode: "DE",
        clubId: "",
        email: "",
        germanLicenseNumber: "",
        lightweight: false,
        parasport: false,
    };
}

function dateInputValue(value) {
    if (!value) return "";
    return String(value).slice(0, 10);
}

function formFromAthlete(athlete) {
    if (!athlete) return createAthleteForm();

    return {
        firstName: athlete.firstName ?? "",
        lastName: athlete.lastName ?? "",
        gender: athlete.gender ?? "MALE",
        birthDate: dateInputValue(athlete.birthDate),
        nationalityCode: athlete.nationalityCode ?? "DE",
        clubId: athlete.clubId ?? athlete.club?.id ?? "",
        email: athlete.email ?? "",
        germanLicenseNumber: athlete.germanLicenseNumber ?? "",
        lightweight: Boolean(athlete.lightweight),
        parasport: Boolean(athlete.parasport),
    };
}

function activePhaseName(event) {
    const now = Date.now();
    const dateMatchedPhase = event?.pricePhases?.find((phase) => {
        const startsAt = phase.startsAt ? new Date(phase.startsAt).getTime() : null;
        const endsAt = phase.endsAt ? new Date(phase.endsAt).getTime() : null;

        if (startsAt !== null && now < startsAt) return false;
        if (endsAt !== null && now > endsAt) return false;
        return startsAt !== null || endsAt !== null;
    });

    return dateMatchedPhase?.name ?? event?.pricePhases?.find((phase) => phase.active)?.name ?? "";
}

function batchSummary(batch) {
    const raceEntries = batch?.raceEntries ?? [];
    const raceEntryCents = raceEntries
        .filter((entry) => (entry.status ?? "ACTIVE") === "ACTIVE")
        .reduce((sum, entry) => sum + Number(entry.priceCents || 0), 0);

    return {
        count: raceEntries.length,
        totalCents: batch?.summary?.totalCents ?? raceEntryCents,
        currency: batch?.summary?.currency ?? raceEntries[0]?.currency ?? "EUR",
    };
}

function latestPaymentAttempt(batch) {
    return batch?.payments?.[0]?.attempts?.[0] ?? null;
}

function isTemporaryBatchUsable(batch, now = new Date()) {
    if (batch?.status !== "TEMPORARY") return false;
    if (!batch.expiresAt) return true;
    return new Date(batch.expiresAt).getTime() > now.getTime();
}

function isTemporaryBatchExpired(batch, now = new Date()) {
    if (batch?.status !== "TEMPORARY" || !batch.expiresAt) return false;
    return new Date(batch.expiresAt).getTime() <= now.getTime();
}

function checkoutExpiryLabel(value) {
    if (!value) return null;

    return new Date(value).toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
}

function manualPaymentDetails(attempt) {
    return attempt?.providerPayload?.manualPayment ?? null;
}

function thankYouUrl(batchId) {
    return `/erich/thank-you?batchId=${encodeURIComponent(batchId)}`;
}

export default function ErichRegistrationWizard({
    initialEvents,
    initialClubs,
    initialAthletes,
    initialBatches,
    isGuest = false,
}) {
    const router = useRouter();
    const [events] = useState(initialEvents);
    const [clubResults, setClubResults] = useState(initialClubs);
    const [clubSearch, setClubSearch] = useState("");
    const [selectedClub, setSelectedClub] = useState(null);
    const [clubSearchTouched, setClubSearchTouched] = useState(false);
    const [athletes, setAthletes] = useState(initialAthletes);
    const [batches, setBatches] = useState(initialBatches);
    const [selectedEventId, setSelectedEventId] = useState(initialEvents[0]?.id ?? "");
    const [selectedAthleteId, setSelectedAthleteId] = useState("");
    const [selectedRaceId, setSelectedRaceId] = useState("");
    const [phaseKey, setPhaseKey] = useState(() => activePhaseName(initialEvents[0]));
    const [targetTime, setTargetTime] = useState({ minutes: 7, seconds: 0, milliseconds: 0 });
    const [athleteForm, setAthleteForm] = useState(() => createAthleteForm());
    const [checkoutProvider, setCheckoutProvider] = useState("STRIPE");
    const [accountForm, setAccountForm] = useState({
        name: "",
        email: "",
        password: "",
    });
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState("");
    const clubSearchRequestRef = useRef(0);
    const paymentReturnHandledRef = useRef(false);

    const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;
    const selectedAthlete = athletes.find((athlete) => athlete.id === selectedAthleteId) ?? null;
    const selectedExpiredBatch =
        batches.find(
            (batch) => batch.eventId === selectedEventId && isTemporaryBatchExpired(batch)
        ) ?? null;
    const selectedBatch =
        batches.find(
            (batch) => batch.eventId === selectedEventId && isTemporaryBatchUsable(batch)
        ) ?? batches.find(
            (batch) => batch.eventId === selectedEventId && batch.status !== "TEMPORARY"
        ) ?? null;
    const selectedRace = selectedEvent?.raceDefinitions?.find((race) => race.id === selectedRaceId) ?? null;
    const selectedPrice = selectedRace ? priceForRace(selectedRace, phaseKey) : null;
    const summary = batchSummary(selectedBatch);
    const availablePhases = selectedEvent?.pricePhases ?? [];
    const activeCheckoutAttempt = latestPaymentAttempt(selectedBatch);
    const activeManualPayment = manualPaymentDetails(activeCheckoutAttempt);
    const canStartCheckout =
        summary.count > 0 && (!selectedBatch || selectedBatch.status === "TEMPORARY");
    const canContinueCheckout =
        selectedBatch?.status === "CHECKOUT" && Boolean(activeCheckoutAttempt?.checkoutUrl);
    const canUseCheckoutButton = canStartCheckout || canContinueCheckout;
    const canRemoveRaceEntries =
        selectedBatch?.status === "TEMPORARY" || selectedBatch?.status === "CHECKOUT";
    const selectedRaceNumbersForAthlete = new Set(
        (selectedBatch?.raceEntries ?? [])
            .filter((entry) => !selectedAthleteId || entry.athleteId === selectedAthleteId)
            .map((entry) => entry.raceNumber)
    );
    const selectedEntriesForAthlete = (selectedBatch?.raceEntries ?? []).filter(
        (entry) => !selectedAthleteId || entry.athleteId === selectedAthleteId
    );

    const selectableRaces = (() => {
        if (!selectedEvent || !selectedAthlete) return [];
        const birthYear = selectedAthlete.birthYear ?? birthYearFromDate(selectedAthlete.birthDate);

        return (selectedEvent.raceDefinitions ?? []).filter((race) => {
            if (selectedRaceNumbersForAthlete.has(race.raceNumber)) return false;
            if (race.isTeamRace) return false;
            if (race.gender && race.gender !== "MIXED" && race.gender !== selectedAthlete.gender) return false;
            if (race.minimumBirthYear && birthYear && birthYear < race.minimumBirthYear) return false;
            if (race.maximumBirthYear && birthYear && birthYear > race.maximumBirthYear) return false;
            if (race.isLightweight && !selectedAthlete.lightweight) return false;
            if (race.isPara && !selectedAthlete.parasport) return false;
            if (phaseKey && !priceForRace(race, phaseKey)) return false;
            return true;
        });
    })();

    function updateAthleteForm(name, value) {
        setAthleteForm((current) => ({ ...current, [name]: value }));
    }

    function clubDescription(club) {
        return [
            club.countryCode,
            club.federalState,
            club.stateRowingAssociation,
            club.externalFederationId,
        ].filter(Boolean).join(" - ");
    }

    function clubOptionLabel(club) {
        const description = clubDescription(club);
        return description ? `${club.officialName} - ${description}` : club.officialName;
    }

    function selectClub(club) {
        setSelectedClub(club);
        setClubSearch(clubOptionLabel(club));
        setClubResults([]);
        setClubSearchTouched(false);
        updateAthleteForm("clubId", club.id);
        setMessage("");
    }

    function resetAthleteForm() {
        setAthleteForm(createAthleteForm());
        setSelectedClub(null);
        setClubSearch("");
        setClubResults([]);
        setClubSearchTouched(false);
        setSelectedRaceId("");
        setMessage("");
    }

    function editAthlete(athlete) {
        setAthleteForm(formFromAthlete(athlete));
        setSelectedClub(athlete.club ?? null);
        setClubSearch(athlete.club ? clubOptionLabel(athlete.club) : "");
        setClubResults([]);
        setClubSearchTouched(false);
        setSelectedRaceId("");
        setMessage("");
    }

    function selectAthleteForEditing(athleteId) {
        setSelectedAthleteId(athleteId);

        if (!athleteId) {
            resetAthleteForm();
            return;
        }

        const athlete = athletes.find((entry) => entry.id === athleteId);
        if (athlete) editAthlete(athlete);
    }

    const searchClubs = useCallback(async (searchValue = clubSearch) => {
        const normalizedSearch = searchValue.trim();
        const requestId = clubSearchRequestRef.current + 1;
        clubSearchRequestRef.current = requestId;

        if (normalizedSearch.length < 2) {
            setClubResults([]);
            setLoading((current) => (current === "clubs" ? "" : current));
            return;
        }

        setLoading("clubs");
        try {
            const params = new URLSearchParams();
            params.set("q", normalizedSearch);

            const response = await fetch(`/api/erich/clubs?${params.toString()}`);
            const data = await response.json();

            if (requestId !== clubSearchRequestRef.current) return;

            setLoading((current) => (current === "clubs" ? "" : current));

            if (!response.ok) {
                setMessage(data.error || "Vereine konnten nicht geladen werden.");
                return;
            }

            setClubResults(data.clubs ?? []);
        } catch {
            if (requestId !== clubSearchRequestRef.current) return;
            setLoading((current) => (current === "clubs" ? "" : current));
            setMessage("Vereine konnten nicht geladen werden.");
        }
    }, [clubSearch]);

    useEffect(() => {
        const normalizedSearch = clubSearch.trim();

        if (!clubSearchTouched) return undefined;

        if (normalizedSearch.length < 2) {
            return undefined;
        }

        const timeoutId = window.setTimeout(() => {
            void searchClubs(normalizedSearch);
        }, 250);

        return () => window.clearTimeout(timeoutId);
    }, [clubSearch, clubSearchTouched, searchClubs]);

    const refreshBatches = useCallback(async (eventId = selectedEventId) => {
        const response = await fetch(`/api/erich/registration-batches?eventId=${encodeURIComponent(eventId)}`);
        const data = await response.json();
        if (response.ok) setBatches(data.batches ?? []);
        return data.batches ?? [];
    }, [selectedEventId]);

    useEffect(() => {
        if (paymentReturnHandledRef.current) return;

        const params = new URLSearchParams(window.location.search);
        const batchId = params.get("erichBatchId");
        const provider = params.get("paymentProvider");
        const orderId = params.get("token");
        const stripeSessionId = params.get("stripeSessionId");

        if (!batchId || (provider !== "PAYPAL" && provider !== "STRIPE")) return;

        if (provider === "STRIPE") {
            paymentReturnHandledRef.current = true;
            window.setTimeout(() => {
                setLoading("stripe-return");
                setMessage(
                    stripeSessionId
                        ? "Kartenzahlung wird bestaetigt..."
                        : "Kartenzahlung wurde abgebrochen oder nicht abgeschlossen."
                );

                if (!stripeSessionId) {
                    refreshBatches(selectedEventId)
                        .then(() => {
                            setMessage("Kartenzahlung wurde nicht abgeschlossen.");
                            router.replace("/erich/register");
                            router.refresh();
                        })
                        .catch((error) => {
                            setMessage(error.message || "Zahlungsstatus konnte nicht aktualisiert werden.");
                        })
                        .finally(() => {
                            setLoading("");
                        });
                    return;
                }

                fetch(`/api/erich/registration-batches/${batchId}/capture`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        provider: "STRIPE",
                        sessionId: stripeSessionId,
                    }),
                })
                    .then(async (response) => {
                        const data = await response.json();
                        if (!response.ok) {
                            throw new Error(data.error || "Kartenzahlung konnte nicht abgeschlossen werden.");
                        }

                        setBatches((current) => [data.batch, ...current.filter((entry) => entry.id !== data.batch.id)]);
                        setMessage(data.alreadyPaid ? "Kartenzahlung war bereits verbucht." : "Kartenzahlung abgeschlossen.");
                        router.replace(thankYouUrl(data.batch.id));
                        router.refresh();
                    })
                    .catch((error) => {
                        setMessage(error.message || "Kartenzahlung konnte nicht abgeschlossen werden.");
                    })
                    .finally(() => {
                        setLoading("");
                    });
            }, 0);
            return;
        }

        if (!orderId) return;

        paymentReturnHandledRef.current = true;
        window.setTimeout(() => {
            setLoading("paypal-capture");
            setMessage("PayPal-Zahlung wird abgeschlossen...");

            fetch(`/api/erich/registration-batches/${batchId}/capture`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId }),
            })
                .then(async (response) => {
                    const data = await response.json();
                    if (!response.ok) {
                        throw new Error(data.error || "PayPal-Zahlung konnte nicht abgeschlossen werden.");
                    }

                    setBatches((current) => [data.batch, ...current.filter((entry) => entry.id !== data.batch.id)]);
                    setMessage(data.alreadyPaid ? "PayPal-Zahlung war bereits verbucht." : "PayPal-Zahlung abgeschlossen.");
                    router.replace(thankYouUrl(data.batch.id));
                    router.refresh();
                })
                .catch((error) => {
                    setMessage(error.message || "PayPal-Zahlung konnte nicht abgeschlossen werden.");
                })
                .finally(() => {
                    setLoading("");
                });
        }, 0);
    }, [refreshBatches, router, selectedEventId]);

    function updateTargetTime(name, value) {
        setTargetTime((current) => ({
            ...current,
            [name]: Number(value),
        }));
    }

    function updateAccountForm(name, value) {
        setAccountForm((current) => ({ ...current, [name]: value }));
    }

    async function handleCreateAccount(event) {
        event.preventDefault();
        setMessage("");
        setLoading("account");

        try {
            const response = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: accountForm.name,
                    email: accountForm.email,
                    password: accountForm.password,
                    role: "VISITOR",
                    claimErichGuestSession: true,
                }),
            });
            const data = await response.json();
            setLoading("");

            if (!response.ok) {
                setMessage(data.error || "Konto konnte nicht erstellt werden.");
                return;
            }

            setMessage(
                data.erichGuestClaim?.claimed
                    ? "Konto erstellt. Deine ERICH-Anmeldung wurde uebernommen. Bitte bestaetige jetzt den Link in deiner E-Mail."
                    : "Konto erstellt. Bitte bestaetige den Link in deiner E-Mail."
            );
            router.refresh();
        } catch (error) {
            setLoading("");
            setMessage(error.message || "Konto konnte nicht erstellt werden.");
        }
    }

    async function ensureBatch() {
        if (isTemporaryBatchUsable(selectedBatch)) return selectedBatch;
        if (!selectedEventId) throw new Error("Bitte ein ERICH-Event auswaehlen.");

        setLoading("batch");
        const response = await fetch("/api/erich/registration-batches", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId: selectedEventId }),
        });
        const data = await response.json();
        setLoading("");

        if (!response.ok) throw new Error(data.error || "Draft konnte nicht erstellt werden.");

        setBatches((current) => {
            const withoutSame = current.filter((batch) => batch.id !== data.batch.id);
            return [data.batch, ...withoutSame];
        });
        return data.batch;
    }

    async function handleCreateAthlete(event) {
        event.preventDefault();
        setMessage("");
        setLoading("athlete");

        try {
            const isEditingAthlete = Boolean(selectedAthleteId);
            const response = await fetch("/api/erich/athletes", {
                method: isEditingAthlete ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    athlete: athleteForm,
                    athleteId: selectedAthleteId || null,
                    eventId: selectedEventId || null,
                }),
            });
            const data = await response.json();
            setLoading("");

            if (!response.ok) {
                setMessage(data.error || "Athlet konnte nicht gespeichert werden.");
                return;
            }

            setAthletes((current) => {
                if (isEditingAthlete) {
                    return current.map((athlete) =>
                        athlete.id === data.athlete.id ? data.athlete : athlete
                    );
                }

                return [data.athlete, ...current];
            });
            setSelectedAthleteId(data.athlete.id);
            setAthleteForm(formFromAthlete(data.athlete));
            setSelectedClub(data.athlete.club ?? null);
            setClubSearch(data.athlete.club ? clubOptionLabel(data.athlete.club) : "");
            setClubResults([]);
            setClubSearchTouched(false);
            setMessage(isEditingAthlete ? "Athlet aktualisiert." : "Athlet gespeichert.");
            router.refresh();
        } catch {
            setLoading("");
            setMessage("Athlet konnte nicht gespeichert werden.");
        }
    }

    async function handleDeleteAthlete() {
        if (!selectedAthleteId || !selectedAthlete) return;
        const confirmed = window.confirm(
            `${athleteLabel(selectedAthlete)} wirklich loeschen? Das geht nur, wenn noch keine Meldungen oder Tickets an diesem Athleten haengen.`
        );

        if (!confirmed) return;

        setMessage("");
        setLoading("delete-athlete");

        try {
            const response = await fetch("/api/erich/athletes", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    athleteId: selectedAthleteId,
                    eventId: selectedEventId || null,
                    auditReason: "Athlet manuell aus ERICH Registrierung geloescht",
                }),
            });
            const data = await response.json();
            setLoading("");

            if (!response.ok) {
                setMessage(data.error || "Athlet konnte nicht geloescht werden.");
                return;
            }

            setAthletes((current) => current.filter((athlete) => athlete.id !== selectedAthleteId));
            setSelectedAthleteId("");
            resetAthleteForm();
            await refreshBatches(selectedEventId);
            setMessage("Athlet geloescht.");
            router.refresh();
        } catch {
            setLoading("");
            setMessage("Athlet konnte nicht geloescht werden.");
        }
    }

    async function handleCreateRaceEntry(event) {
        event.preventDefault();
        setMessage("");

        if (!selectedAthleteId || !selectedRaceId) {
            setMessage("Bitte Athlet und Rennen auswaehlen.");
            return;
        }

        try {
            const batch = await ensureBatch();
            setLoading("race");
            const response = await fetch(`/api/erich/registration-batches/${batch.id}/race-entries`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    athleteId: selectedAthleteId,
                    raceDefinitionId: selectedRaceId,
                    phaseKey,
                    targetTime,
                }),
            });
            const data = await response.json();
            setLoading("");

            if (!response.ok) {
                if (data.reasonCodes?.includes("ALREADY_REGISTERED") || data.code === "ERICH_DUPLICATE_RACE_ENTRY") {
                    await refreshBatches(selectedEventId);
                    setSelectedRaceId("");
                    setMessage("Dieses Rennen ist fuer diesen Athleten bereits ausgewaehlt.");
                    return;
                }

                setMessage(data.reasonCodes?.join(", ") || data.error || "Rennen konnte nicht gespeichert werden.");
                return;
            }

            await refreshBatches(batch.eventId);
            setSelectedRaceId("");
            setMessage(`Rennen ${data.raceEntry.raceNumber} gespeichert.`);
        } catch (error) {
            setLoading("");
            setMessage(error.message || "Rennen konnte nicht gespeichert werden.");
        }
    }

    async function handleCheckout() {
        setMessage("");

        try {
            if (selectedBatch?.status === "CHECKOUT") {
                if (activeCheckoutAttempt?.checkoutUrl) {
                    window.location.assign(activeCheckoutAttempt.checkoutUrl);
                    return;
                }

                setMessage("Zahlung ist bereits vorbereitet.");
                return;
            }

            const batch = await ensureBatch();
            setLoading("checkout");
            const response = await fetch(`/api/erich/registration-batches/${batch.id}/checkout`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider: checkoutProvider }),
            });
            const data = await response.json();
            setLoading("");

            if (!response.ok) {
                setMessage(data.error || "Checkout konnte nicht gestartet werden.");
                return;
            }

            setBatches((current) => [data.batch, ...current.filter((entry) => entry.id !== data.batch.id)]);
            if (data.checkout?.requiresRedirect && data.checkout.checkoutUrl) {
                window.location.assign(data.checkout.checkoutUrl);
                return;
            }

            setMessage("Zahlung wurde vorbereitet.");
            window.location.assign(thankYouUrl(data.batch.id));
            router.refresh();
        } catch (error) {
            setLoading("");
            setMessage(error.message || "Checkout konnte nicht gestartet werden.");
        }
    }

    async function handleRemoveRaceEntry(entry) {
        if (!selectedBatch?.id || !entry?.id) return;
        setMessage("");
        setLoading(entry.id);

        try {
            const response = await fetch(
                `/api/erich/registration-batches/${selectedBatch.id}/race-entries/${entry.id}`,
                {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        auditReason: "Rennmeldung aus temporaerem ERICH-Draft entfernt",
                    }),
                }
            );
            const data = await response.json();
            setLoading("");

            if (!response.ok) {
                setMessage(data.error || "Rennen konnte nicht entfernt werden.");
                return;
            }

            await refreshBatches(selectedBatch.eventId);
            setMessage(`Rennen ${entry.raceNumber} entfernt.`);
        } catch (error) {
            setLoading("");
            setMessage(error.message || "Rennen konnte nicht entfernt werden.");
        }
    }

    if (events.length === 0) {
        return (
            <div className="erich-empty-state">
                <div className="erich-empty-state__icon">ER</div>
                <p>Aktuell ist kein aktives ERICH-Event fuer die Registrierung freigeschaltet.</p>
            </div>
        );
    }

    return (
        <div className="erich-wizard">
            <aside className="erich-wizard__sidebar erich-panel stack">
                <div>
                    <span className="label">Event</span>
                    <select
                        className="select"
                        value={selectedEventId}
                        onChange={(event) => {
                            const nextEventId = event.target.value;
                            const nextEvent = events.find((entry) => entry.id === nextEventId);
                            setSelectedEventId(nextEventId);
                            setPhaseKey(activePhaseName(nextEvent));
                            setSelectedRaceId("");
                        }}
                    >
                        {events.map((event) => (
                            <option key={event.id} value={event.id}>
                                {event.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="summary-list">
                    <div>
                        <span className="label">Termin</span>
                        <strong>{eventDate(selectedEvent)}</strong>
                    </div>
                    <div>
                        <span className="label">Draft</span>
                        <strong>
                            {selectedBatch
                                ? selectedBatch.status
                                : selectedExpiredBatch
                                  ? "Abgelaufen"
                                  : "Noch keiner"}
                        </strong>
                    </div>
                    <div>
                        <span className="label">Meldungen</span>
                        <strong>{summary.count}</strong>
                    </div>
                    <div>
                        <span className="label">Summe</span>
                        <strong>{cents(summary.totalCents, summary.currency)}</strong>
                    </div>
                    {activeCheckoutAttempt ? (
                        <div>
                            <span className="label">Zahlung</span>
                            <strong>
                                {activeCheckoutAttempt.status}
                                {activeCheckoutAttempt.expiresAt
                                    ? ` bis ${checkoutExpiryLabel(activeCheckoutAttempt.expiresAt)}`
                                    : ""}
                            </strong>
                        </div>
                    ) : null}
                    {activeManualPayment ? (
                        <>
                            <div>
                                <span className="label">Verwendungszweck</span>
                                <strong>{activeManualPayment.paymentReference}</strong>
                            </div>
                            <div>
                                <span className="label">Empfaenger</span>
                                <strong>{activeManualPayment.accountHolder}</strong>
                            </div>
                            {activeManualPayment.iban ? (
                                <div>
                                    <span className="label">IBAN</span>
                                    <strong>{activeManualPayment.iban}</strong>
                                </div>
                            ) : null}
                            {activeManualPayment.bic ? (
                                <div>
                                    <span className="label">BIC</span>
                                    <strong>{activeManualPayment.bic}</strong>
                                </div>
                            ) : null}
                        </>
                    ) : null}
                </div>

                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => ensureBatch().then(() => setMessage("Draft ist bereit.")).catch((error) => setMessage(error.message))}
                    disabled={loading === "batch"}
                >
                    {selectedBatch?.status === "TEMPORARY" ? "Draft bereit" : "Draft starten"}
                </button>

                <div className="erich-provider-switch" aria-label="Zahlungsart">
                    {[
                        { value: "STRIPE", label: "Kredit-/Debitkarte" },
                        { value: "PAYPAL", label: "PayPal" },
                        { value: "BANK_TRANSFER", label: "Ueberweisung" },
                    ].map((provider) => (
                        <button
                            key={provider.value}
                            type="button"
                            className={checkoutProvider === provider.value ? "is-active" : ""}
                            onClick={() => setCheckoutProvider(provider.value)}
                        >
                            {provider.label}
                        </button>
                    ))}
                </div>

                <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleCheckout}
                    disabled={
                        loading === "checkout" ||
                        loading === "paypal-capture" ||
                        loading === "stripe-return" ||
                        !canUseCheckoutButton
                    }
                >
                    {selectedBatch?.status === "CHECKOUT" ? "Zahlung fortsetzen" : "Zahlung vorbereiten"}
                </button>
            </aside>

            <section className="erich-wizard__main stack-lg">
                <form className="erich-panel stack" onSubmit={handleCreateAthlete}>
                    <div className="section-title-row">
                        <h2>Athlet</h2>
                        <span className="text-muted">{athletes.length} gespeichert</span>
                    </div>

                    <div className="field">
                        <label className="label" htmlFor="erich-athlete">
                            Athlet waehlen
                        </label>
                        <select
                            id="erich-athlete"
                            className="select"
                            value={selectedAthleteId}
                            onChange={(event) => selectAthleteForEditing(event.target.value)}
                        >
                            <option value="">Neuer Athlet hinzufuegen</option>
                            {athletes.map((athlete) => (
                                <option key={athlete.id} value={athlete.id}>
                                    {athleteLabel(athlete)} - {athlete.club?.officialName ?? "Club offen"}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid checkout-form__grid">
                        <div className="field">
                            <label className="label" htmlFor="erich-first-name">
                                Vorname
                            </label>
                            <input
                                id="erich-first-name"
                                className="input"
                                value={athleteForm.firstName}
                                onChange={(event) => updateAthleteForm("firstName", event.target.value)}
                                placeholder="Max"
                            />
                        </div>
                        <div className="field">
                            <label className="label" htmlFor="erich-last-name">
                                Nachname
                            </label>
                            <input
                                id="erich-last-name"
                                className="input"
                                value={athleteForm.lastName}
                                onChange={(event) => updateAthleteForm("lastName", event.target.value)}
                                placeholder="Mustermann"
                            />
                        </div>
                        <div className="field">
                            <label className="label" htmlFor="erich-gender">
                                Geschlecht
                            </label>
                            <select
                                id="erich-gender"
                                className="select"
                                value={athleteForm.gender}
                                onChange={(event) => updateAthleteForm("gender", event.target.value)}
                            >
                                {GENDER_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="field">
                            <label className="label" htmlFor="erich-birth-date">
                                Geburtsdatum
                            </label>
                            <input
                                id="erich-birth-date"
                                className="input"
                                type="date"
                                value={athleteForm.birthDate}
                                onChange={(event) => updateAthleteForm("birthDate", event.target.value)}
                            />
                        </div>
                        <div className="field">
                            <label className="label" htmlFor="erich-nationality">
                                Nation
                            </label>
                            <input
                                id="erich-nationality"
                                className="input"
                                maxLength={3}
                                value={athleteForm.nationalityCode}
                                onChange={(event) => updateAthleteForm("nationalityCode", event.target.value.toUpperCase())}
                            />
                        </div>
                        <div className="field checkout-form__wide">
                            <label className="label" htmlFor="erich-club">
                                Verein
                            </label>
                            <div className="erich-club-combobox">
                                <input
                                    id="erich-club"
                                    className="input"
                                    type="text"
                                    value={clubSearch}
                                    onChange={(event) => {
                                        const nextSearch = event.target.value;
                                        setClubSearch(nextSearch);
                                        setClubSearchTouched(true);
                                        setSelectedClub(null);
                                        updateAthleteForm("clubId", "");
                                        if (nextSearch.trim().length < 2) setClubResults([]);
                                    }}
                                    onFocus={() => setClubSearchTouched(true)}
                                    autoComplete="off"
                                    placeholder="Verein eintippen, dann Treffer auswaehlen"
                                />
                                {loading === "clubs" ? (
                                    <span className="erich-club-combobox__status">Sucht...</span>
                                ) : null}
                                {clubSearch ? (
                                    <button
                                        type="button"
                                        className="erich-club-combobox__clear"
                                        aria-label="Vereinssuche zuruecksetzen"
                                        onClick={() => {
                                            setClubSearch("");
                                            setSelectedClub(null);
                                            setClubResults([]);
                                            setClubSearchTouched(false);
                                            updateAthleteForm("clubId", "");
                                        }}
                                    >
                                        x
                                    </button>
                                ) : null}
                                {clubSearchTouched && clubResults.length > 0 ? (
                                    <div className="erich-club-combobox__list" role="listbox">
                                        {clubResults.map((club) => (
                                            <button
                                                key={club.id}
                                                type="button"
                                                className="erich-club-combobox__option"
                                                role="option"
                                                aria-selected={athleteForm.clubId === club.id}
                                                onClick={() => selectClub(club)}
                                            >
                                                <strong>{club.officialName}</strong>
                                                <span>{clubDescription(club) || "Weitere Angaben offen"}</span>
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                            {selectedClub ? (
                                <p className="erich-club-combobox__selected">
                                    Ausgewaehlt: <strong>{selectedClub.officialName}</strong>
                                </p>
                            ) : clubSearch.trim().length >= 2 && loading !== "clubs" && clubResults.length === 0 ? (
                                <p className="erich-club-combobox__hint">Kein Verein gefunden.</p>
                            ) : (
                                <p className="erich-club-combobox__hint">
                                    Mindestens 2 Zeichen eingeben und einen Treffer anklicken.
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="payment-grid">
                        <label className={`payment-option ${athleteForm.lightweight ? "is-active" : ""}`}>
                            <input
                                type="checkbox"
                                checked={athleteForm.lightweight}
                                onChange={(event) => updateAthleteForm("lightweight", event.target.checked)}
                            />
                            <span>
                                <strong>Leichtgewicht</strong>
                                <small>Erforderlich fuer entsprechende Rennen.</small>
                            </span>
                        </label>
                        <label className={`payment-option ${athleteForm.parasport ? "is-active" : ""}`}>
                            <input
                                type="checkbox"
                                checked={athleteForm.parasport}
                                onChange={(event) => updateAthleteForm("parasport", event.target.checked)}
                            />
                            <span>
                                <strong>Parasport</strong>
                                <small>Wird nur fuer passende Rennen verwendet.</small>
                            </span>
                        </label>
                    </div>

                    {!athleteForm.clubId ? (
                        <p className="auth-message">
                            Bitte waehle einen Verein aus der Suche aus, bevor du den Athleten speicherst.
                        </p>
                    ) : null}
                    {message && loading !== "race" ? <p className="auth-message">{message}</p> : null}

                    <button
                        type="submit"
                        className="btn btn-ghost"
                        disabled={loading === "athlete" || loading === "delete-athlete" || !athleteForm.clubId}
                    >
                        {!athleteForm.clubId
                            ? "Verein auswaehlen"
                            : loading === "athlete"
                              ? "Speichert..."
                              : selectedAthleteId
                                ? "Aenderungen speichern"
                                : "Athlet speichern"}
                    </button>
                    {selectedAthleteId ? (
                        <button
                            type="button"
                            className="btn btn-ghost erich-danger-button"
                            onClick={handleDeleteAthlete}
                            disabled={loading === "delete-athlete"}
                        >
                            {loading === "delete-athlete" ? "Loescht..." : "Athlet loeschen"}
                        </button>
                    ) : null}
                </form>

                <form className="erich-panel stack" onSubmit={handleCreateRaceEntry}>
                    <div className="section-title-row">
                        <h2>Rennen</h2>
                        <span className="text-muted">
                            {selectableRaces.length} passend
                            {selectedRaceNumbersForAthlete.size > 0
                                ? `, ${selectedRaceNumbersForAthlete.size} gewaehlt`
                                : ""}
                        </span>
                    </div>

                    <div className="grid checkout-form__grid">
                        <div className="field">
                            <label className="label" htmlFor="erich-phase">
                                Preisphase
                            </label>
                            <select
                                id="erich-phase"
                                className="select"
                                value={phaseKey}
                                onChange={(event) => {
                                    setPhaseKey(event.target.value);
                                    setSelectedRaceId("");
                                }}
                            >
                                <option value="">Aktive Phase automatisch</option>
                                {availablePhases.map((phase) => (
                                    <option key={phase.id} value={phase.name}>
                                        {phase.name}{phase.active ? " - aktiv" : ""}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="field checkout-form__wide">
                            <span className="label">Rennen</span>
                            <div
                                id="erich-race"
                                className="erich-race-picker"
                                role="listbox"
                                aria-label="Rennen waehlen"
                                aria-disabled={!selectedAthlete || selectableRaces.length === 0}
                            >
                                {!selectedAthlete ? (
                                    <p className="erich-race-picker__empty">Erst einen Athleten waehlen.</p>
                                ) : selectableRaces.length === 0 ? (
                                    <p className="erich-race-picker__empty">Keine passenden Rennen gefunden.</p>
                                ) : (
                                    selectableRaces.map((race) => {
                                        const price = phaseKey ? priceForRace(race, phaseKey) : null;
                                        const labels = valuationLabels(race);
                                        const selected = selectedRaceId === race.id;

                                        return (
                                            <button
                                                key={race.id}
                                                type="button"
                                                className={`erich-race-option ${selected ? "is-selected" : ""}`}
                                                role="option"
                                                aria-selected={selected}
                                                onClick={() => setSelectedRaceId(race.id)}
                                            >
                                                <span className="erich-race-option__number">
                                                    #{race.raceNumber}
                                                </span>
                                                <span className="erich-race-option__main">
                                                    <strong>
                                                        {[race.classLabel, race.distanceLabel]
                                                            .filter(Boolean)
                                                            .join(" - ") || "Rennen"}
                                                    </strong>
                                                    <small>
                                                        {[race.gender, race.isLightweight ? "LG" : null, race.isPara ? "Para" : null]
                                                            .filter(Boolean)
                                                            .join(" / ") || "Offene Kategorie"}
                                                    </small>
                                                </span>
                                                <span className="erich-race-option__meta">
                                                    {labels.length > 0 ? (
                                                        <span>{labels.join(" / ")}</span>
                                                    ) : null}
                                                    <strong>
                                                        {price
                                                            ? cents(price.amountCents, price.currency)
                                                            : "Preis offen"}
                                                    </strong>
                                                </span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                    {selectedRace ? (
                        <article className="analysis-card">
                            <strong>{raceLabel(selectedRace)}</strong>
                            <p>
                                {valuationLabels(selectedRace).join(" / ")}
                                {selectedPrice
                                    ? ` - ${cents(selectedPrice.amountCents, selectedPrice.currency)}`
                                    : " - Preisphase wird serverseitig geprueft"}
                            </p>
                        </article>
                    ) : null}

                    {selectedEntriesForAthlete.length > 0 ? (
                        <div className="erich-selected-races">
                            <div className="section-title-row">
                                <h3>Ausgewaehlte Rennen</h3>
                                <span className="text-muted">{selectedEntriesForAthlete.length}</span>
                            </div>
                            {selectedEntriesForAthlete.map((entry) => (
                                <article key={entry.id} className="erich-selected-races__row">
                                    <div>
                                        <strong>
                                            #{entry.raceNumber} - {entry.athlete?.firstName} {entry.athlete?.lastName}
                                        </strong>
                                        <span>
                                            {entry.targetTimeMinutes}:{String(entry.targetTimeSeconds).padStart(2, "0")}.
                                            {String(entry.targetTimeMilliseconds).padStart(3, "0")} -{" "}
                                            {cents(entry.priceCents, entry.currency)}
                                        </span>
                                    </div>
                                    {canRemoveRaceEntries ? (
                                        <button
                                            type="button"
                                            className="btn btn-ghost"
                                            onClick={() => handleRemoveRaceEntry(entry)}
                                            disabled={loading === entry.id}
                                        >
                                            Entfernen
                                        </button>
                                    ) : null}
                                </article>
                            ))}
                        </div>
                    ) : null}

                    <div className="grid checkout-form__grid">
                        <div className="field">
                            <label className="label" htmlFor="erich-target-minutes">
                                Minuten
                            </label>
                            <input
                                id="erich-target-minutes"
                                className="input"
                                type="number"
                                min="0"
                                value={targetTime.minutes}
                                onChange={(event) => updateTargetTime("minutes", event.target.value)}
                            />
                        </div>
                        <div className="field">
                            <label className="label" htmlFor="erich-target-seconds">
                                Sekunden
                            </label>
                            <input
                                id="erich-target-seconds"
                                className="input"
                                type="number"
                                min="0"
                                max="59"
                                value={targetTime.seconds}
                                onChange={(event) => updateTargetTime("seconds", event.target.value)}
                            />
                        </div>
                        <div className="field">
                            <label className="label" htmlFor="erich-target-ms">
                                Millisekunden
                            </label>
                            <input
                                id="erich-target-ms"
                                className="input"
                                type="number"
                                min="0"
                                max="999"
                                value={targetTime.milliseconds}
                                onChange={(event) => updateTargetTime("milliseconds", event.target.value)}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading === "race" || !selectedAthlete || !selectedRaceId}
                    >
                        {loading === "race" ? "Speichert..." : "Rennen hinzufuegen"}
                    </button>
                </form>
            </section>

            <aside className="erich-wizard__summary erich-panel stack">
                <div className="section-title-row">
                    <h2>Summary</h2>
                    <span className="text-muted">{summary.count} Meldungen</span>
                </div>

                {selectedBatch?.raceEntries?.length ? (
                    <div className="stack">
                        {selectedBatch.raceEntries.map((entry) => (
                            <article key={entry.id} className="analysis-card">
                                <div className="erich-wizard__entry-row">
                                    <div>
                                        <strong>
                                            #{entry.raceNumber} - {entry.athlete?.firstName} {entry.athlete?.lastName}
                                        </strong>
                                        <p>
                                            {entry.targetTimeMinutes}:{String(entry.targetTimeSeconds).padStart(2, "0")}.
                                            {String(entry.targetTimeMilliseconds).padStart(3, "0")} -{" "}
                                            {cents(entry.priceCents, entry.currency)}
                                        </p>
                                    </div>
                                    {canRemoveRaceEntries ? (
                                        <button
                                            type="button"
                                            className="btn btn-ghost"
                                            onClick={() => handleRemoveRaceEntry(entry)}
                                            disabled={loading === entry.id}
                                        >
                                            Entfernen
                                        </button>
                                    ) : null}
                                </div>
                            </article>
                        ))}
                    </div>
                ) : (
                    <p className="text-muted">Noch keine Rennen im aktuellen Draft.</p>
                )}

                <div className="summary-list">
                    <div>
                        <span className="label">Gesamt</span>
                        <strong>{cents(summary.totalCents, summary.currency)}</strong>
                    </div>
                </div>

                {message ? <p className="auth-message">{message}</p> : null}

                {isGuest && selectedBatch?.raceEntries?.length ? (
                    <form className="analysis-card stack" onSubmit={handleCreateAccount}>
                        <div>
                            <strong>Konto erstellen</strong>
                            <p>
                                Optional nach der Anmeldung: Konto anlegen und diese ERICH-Buchung
                                direkt uebernehmen.
                            </p>
                        </div>
                        <div className="field">
                            <label className="label" htmlFor="erich-account-name">
                                Name
                            </label>
                            <input
                                id="erich-account-name"
                                className="input"
                                value={accountForm.name}
                                onChange={(event) => updateAccountForm("name", event.target.value)}
                                placeholder="Dein Name"
                            />
                        </div>
                        <div className="field">
                            <label className="label" htmlFor="erich-account-email">
                                E-Mail
                            </label>
                            <input
                                id="erich-account-email"
                                className="input"
                                type="email"
                                required
                                value={accountForm.email}
                                onChange={(event) => updateAccountForm("email", event.target.value)}
                                placeholder="du@beispiel.de"
                            />
                        </div>
                        <div className="field">
                            <label className="label" htmlFor="erich-account-password">
                                Passwort
                            </label>
                            <input
                                id="erich-account-password"
                                className="input"
                                type="password"
                                required
                                minLength={8}
                                value={accountForm.password}
                                onChange={(event) => updateAccountForm("password", event.target.value)}
                                placeholder="Mindestens 8 Zeichen"
                            />
                        </div>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={loading === "account"}
                        >
                            {loading === "account" ? "Erstellt..." : "Konto mit Anmeldung erstellen"}
                        </button>
                    </form>
                ) : null}
            </aside>
        </div>
    );
}
