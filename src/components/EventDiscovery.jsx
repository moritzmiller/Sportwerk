"use client";

import { useEffect, useMemo, useState } from "react";

import EventCard from "@/components/EventCard";
import { CATEGORIES, getCategory } from "@/lib/categories";

const TIME_FILTERS = [
    { value: "all", label: "Alle", short: "Alles" },
    { value: "today", label: "Heute", short: "Heute" },
    { value: "weekend", label: "Wochenende", short: "Weekend" },
    { value: "week", label: "7 Tage", short: "7 Tage" },
    { value: "month", label: "Monat", short: "Monat" },
];

const SORTS = [
    { value: "for-you", label: "Für dich" },
    { value: "popular", label: "Beliebt" },
    { value: "date-asc", label: "Nächste" },
    { value: "date-desc", label: "Spätere" },
    { value: "price-asc", label: "Guenstig" },
    { value: "price-desc", label: "Premium" },
];

function isSameDay(a, b) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function matchesTime(dateStr, filter) {
    if (filter === "all") return true;
    const d = new Date(dateStr);
    const now = new Date();

    if (filter === "today") return isSameDay(d, now);

    if (filter === "weekend") {
        const day = now.getDay();
        const sat = new Date(now);
        sat.setDate(now.getDate() + ((6 - day + 7) % 7));
        sat.setHours(0, 0, 0, 0);
        const sun = new Date(sat);
        sun.setDate(sat.getDate() + 1);
        sun.setHours(23, 59, 59, 999);
        return d >= sat && d <= sun;
    }

    if (filter === "week") {
        const end = new Date(now);
        end.setDate(now.getDate() + 7);
        return d >= now && d <= end;
    }

    if (filter === "month") {
        const end = new Date(now);
        end.setMonth(now.getMonth() + 1);
        return d >= now && d <= end;
    }

    return true;
}

function getPulseScore(event) {
    return Math.max(12, Math.min(99, Number(event.pulseScore ?? event.matchScore ?? 28)));
}

function getEnergyLabel(score) {
    if (score >= 80) return "Sehr passend";
    if (score >= 62) return "Passend";
    if (score >= 42) return "Solide";
    return "Neu";
}

export default function EventDiscovery({
    events,
    initialQuery = "",
    initialCategory = "all",
    initialTime = "all",
    initialFreeOnly = false,
    initialSort = "for-you",
    profileSummary = null,
    isPersonalized = false,
    useRecommendedApi = false,
    recommendedApiSource = "mainpage-feed",
}) {
    const [query, setQuery] = useState(initialQuery);
    const [category, setCategory] = useState(initialCategory);
    const [time, setTime] = useState(initialTime);
    const [freeOnly, setFreeOnly] = useState(initialFreeOnly);
    const [sort, setSort] = useState(initialSort);
    const [apiEvents, setApiEvents] = useState(null);
    const [apiSummary, setApiSummary] = useState(null);
    const [apiPersonalized, setApiPersonalized] = useState(null);
    const [feedLoading, setFeedLoading] = useState(false);
    const feedEvents = apiEvents ?? events;
    const feedSummary = apiSummary ?? profileSummary;
    const feedPersonalized = apiPersonalized ?? isPersonalized;

    useEffect(() => {
        if (!useRecommendedApi) return undefined;

        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            const params = new URLSearchParams({
                sort,
                time,
                limit: "14",
                source: recommendedApiSource,
                recordImpressions: "true",
            });

            if (query.trim()) params.set("query", query.trim());
            if (category !== "all") params.set("category", category);
            if (freeOnly) params.set("freeOnly", "true");

            setFeedLoading(true);

            try {
                const response = await fetch(`/api/events/recommended?${params.toString()}`, {
                    cache: "no-store",
                    signal: controller.signal,
                });

                if (!response.ok) return;

                const data = await response.json();
                if (!Array.isArray(data.events)) return;

                setApiEvents(data.events);
                setApiSummary(data.profileSummary ?? null);
                setApiPersonalized(Boolean(data.personalized));
            } catch (error) {
                if (error?.name !== "AbortError") {
                    console.error("[EventDiscovery] Recommended feed update failed:", error);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setFeedLoading(false);
                }
            }
        }, 220);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [
        category,
        freeOnly,
        query,
        recommendedApiSource,
        sort,
        time,
        useRecommendedApi,
    ]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();

        let result = feedEvents.filter((event) => {
            if (category !== "all" && event.category !== category) return false;
            if (freeOnly && Number(event.price) > 0) return false;
            if (!matchesTime(event.startDate, time)) return false;

            if (q) {
                const haystack = `${event.title} ${event.description ?? ""} ${event.location} ${event.city}`.toLowerCase();
                if (!haystack.includes(q)) return false;
            }

            return true;
        });

        result = [...result].sort((a, b) => {
            switch (sort) {
                case "for-you": {
                    const scoreDelta = getPulseScore(b) - getPulseScore(a);
                    if (scoreDelta !== 0) return scoreDelta;
                    return new Date(a.startDate) - new Date(b.startDate);
                }
                case "popular":
                    return Number(b.viewCount || 0) - Number(a.viewCount || 0);
                case "date-desc":
                    return new Date(b.startDate) - new Date(a.startDate);
                case "price-asc":
                    return Number(a.price) - Number(b.price);
                case "price-desc":
                    return Number(b.price) - Number(a.price);
                case "date-asc":
                default:
                    return new Date(a.startDate) - new Date(b.startDate);
            }
        });

        return result;
    }, [feedEvents, query, category, time, freeOnly, sort]);

    const featured = filtered[0] ?? null;
    const hotStrip = filtered.slice(0, 5);
    const rest = sort === "for-you" ? filtered.slice(1) : filtered;
    const currentCategory = category === "all" ? null : getCategory(category);
    const hasActiveFilters =
        query || category !== "all" || time !== "all" || freeOnly || sort !== "for-you";

    function resetAll() {
        setQuery("");
        setCategory("all");
        setTime("all");
        setFreeOnly(false);
        setSort("for-you");
    }

    return (
        <div className="discovery-lab">
            <div className="discovery-console" id="event-feed-controls">
                <div className="discovery-console__main">
                    <span className="home-kicker">
                        {feedPersonalized ? "Persönliche Reihenfolge" : "Lokale Empfehlungen"}
                    </span>
                    <h2>{feedSummary?.title ?? "Für dich"}</h2>
                    <p>
                        {feedSummary?.text ??
                            "Events werden nach Timing, Nachfrage, Nähe und Vertrauen sortiert."}
                    </p>
                </div>

                <div className="discovery-console__meter" aria-label="Buchungsvertrauen">
                    <span>klar</span>
                    <strong>Preise, Ticket, Check-in</strong>
                </div>

                <div className="searchbar discovery-search">
                    <span className="searchbar__icon" aria-hidden="true">
                        Suche
                    </span>
                    <input
                        className="searchbar__input"
                        type="search"
                        placeholder="Event, Ort, Kuenstler oder Thema..."
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        aria-label="Events durchsuchen"
                    />
                </div>

                <div className="time-dial" aria-label="Zeitraum filtern">
                    {TIME_FILTERS.map((filter) => (
                        <button
                            key={filter.value}
                            type="button"
                            className={`time-dial__button ${time === filter.value ? "is-active" : ""}`}
                            aria-pressed={time === filter.value}
                            onClick={() => setTime(filter.value)}
                        >
                            <span>{filter.short}</span>
                        </button>
                    ))}
                </div>

                <div className="mood-rail" aria-label="Kategorie wählen">
                    <button
                        type="button"
                        className={`mood-pill ${category === "all" ? "is-active" : ""}`}
                        aria-pressed={category === "all"}
                        onClick={() => setCategory("all")}
                    >
                        <span>Alle</span>
                        <strong>Kategorien</strong>
                    </button>
                    {CATEGORIES.map((item) => (
                        <button
                            key={item.value}
                            type="button"
                            className={`mood-pill ${category === item.value ? "is-active" : ""}`}
                            style={{ "--cat-color": item.color }}
                            aria-pressed={category === item.value}
                            onClick={() => setCategory((current) => (current === item.value ? "all" : item.value))}
                        >
                            <span>{item.emoji}</span>
                            <strong>{item.label}</strong>
                        </button>
                    ))}
                </div>

                <div className="discovery-toggles">
                    <button
                        type="button"
                        className={`chip ${freeOnly ? "is-active" : ""}`}
                        aria-pressed={freeOnly}
                        onClick={() => setFreeOnly((value) => !value)}
                    >
                        Kostenlos
                    </button>
                    <select
                        className="select-inline"
                        value={sort}
                        onChange={(event) => setSort(event.target.value)}
                        aria-label="Sortierung"
                    >
                        {SORTS.map((item) => (
                            <option key={item.value} value={item.value}>
                                {item.label}
                            </option>
                        ))}
                    </select>
                    {hasActiveFilters ? (
                    <button type="button" className="chip" onClick={resetAll}>
                            Zurücksetzen
                        </button>
                    ) : null}
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="empty-state discovery-empty">
                    <div className="empty-state__icon">0</div>
                    <h3>Keine passenden Events gefunden.</h3>
                    <p>Öffne den Zeitraum oder entferne einen Filter.</p>
                    {hasActiveFilters ? (
                        <button type="button" className="btn btn-ghost mt-s" onClick={resetAll}>
                            Filter zurücksetzen
                        </button>
                    ) : null}
                </div>
            ) : (
                <>
                    <div className="pulse-strip" aria-label="Schnelle Event-Auswahl">
                        <div className="pulse-strip__meta">
                            <span>{filtered.length} Treffer</span>
                            <strong>{currentCategory?.label ?? "Alle Kategorien"}</strong>
                        </div>
                        <div className="pulse-strip__items">
                            {hotStrip.map((event) => (
                                <a key={event.id} href={`#event-${event.id}`} className="pulse-chip">
                                    <span>{getEnergyLabel(getPulseScore(event))}</span>
                                    <strong>{event.title}</strong>
                                </a>
                            ))}
                            {feedLoading ? <span className="pulse-chip pulse-chip--loading">Aktualisiert</span> : null}
                        </div>
                    </div>

                    {sort === "for-you" && featured ? (
                        <div className="event-feed event-feed--pulse">
                            <EventCard event={featured} variant="feature" rank={1} />
                            <div className="event-feed__rest">
                                {rest.map((event, index) => (
                                    <EventCard key={event.id} event={event} rank={index + 2} />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="event-grid event-grid--pulse">
                            {rest.map((event, index) => (
                                <EventCard key={event.id} event={event} rank={index + 1} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
