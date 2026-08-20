import { buildRaceReviewSummary, erichRaceReviewInclude } from "./master-data-review.js";

const BLOCKING_LEVELS = Object.freeze({
    ERROR: "ERROR",
    WARNING: "WARNING",
    INFO: "INFO",
});

function addIssue(issues, level, area, message, details = {}) {
    issues.push({ level, area, message, details });
}

function countBy(items, key) {
    return items.reduce((counts, item) => {
        const value = item?.[key] ?? "UNKNOWN";
        counts[value] = (counts[value] ?? 0) + 1;
        return counts;
    }, {});
}

export function buildErichReadinessReport({
    event,
    races = [],
    pricePhases = [],
    clubs = [],
    registrationBatches = [],
    licenses = [],
    invoices = [],
    tickets = [],
    exportJobs = [],
}) {
    const issues = [];

    if (!event) {
        addIssue(issues, BLOCKING_LEVELS.ERROR, "event", "No ERICH event is configured.");
    } else if (event.status !== "ACTIVE") {
        addIssue(issues, BLOCKING_LEVELS.ERROR, "event", "ERICH event is not active.", {
            status: event.status,
        });
    }

    const activePricePhaseCount = pricePhases.filter((phase) => phase.active).length;
    if (pricePhases.length === 0) {
        addIssue(issues, BLOCKING_LEVELS.ERROR, "pricing", "No ERICH price phases are configured.");
    } else if (activePricePhaseCount !== 1) {
        addIssue(issues, BLOCKING_LEVELS.ERROR, "pricing", "Exactly one active ERICH price phase is required.", {
            activePricePhaseCount,
        });
    }

    const raceSummaries = races.map((race) => ({ race, review: buildRaceReviewSummary(race) }));
    const activeRaceCount = races.filter((race) => race.status === "ACTIVE").length;
    const reviewRaceCount = races.filter((race) => race.status === "REVIEW_REQUIRED").length;
    const blockedActiveRaces = raceSummaries.filter(
        ({ race, review }) => race.status === "ACTIVE" && !review.canActivate
    );

    if (races.length === 0) {
        addIssue(issues, BLOCKING_LEVELS.ERROR, "races", "No ERICH race definitions are configured.");
    }
    if (activeRaceCount === 0) {
        addIssue(issues, BLOCKING_LEVELS.ERROR, "races", "No active ERICH races are available for registration.");
    }
    if (reviewRaceCount > 0) {
        addIssue(issues, BLOCKING_LEVELS.WARNING, "races", "Some ERICH races still require review.", {
            reviewRaceCount,
        });
    }
    if (blockedActiveRaces.length > 0) {
        addIssue(issues, BLOCKING_LEVELS.ERROR, "races", "Active ERICH races still have activation blockers.", {
            raceNumbers: blockedActiveRaces.map(({ race }) => race.raceNumber),
        });
    }

    const activeClubCount = clubs.filter((club) => club.active).length;
    if (activeClubCount === 0) {
        addIssue(issues, BLOCKING_LEVELS.ERROR, "clubs", "No active ERICH clubs are configured.");
    }

    const paidWithoutInvoice = registrationBatches.filter(
        (batch) => batch.status === "PAID" && (batch.invoices?.length ?? 0) === 0
    );
    const paidWithoutTickets = registrationBatches.filter(
        (batch) => batch.status === "PAID" &&
            (batch.raceEntries ?? []).some((entry) => (entry.tickets?.length ?? 0) === 0)
    );
    const checkoutExpired = registrationBatches.filter(
        (batch) => batch.status === "CHECKOUT" &&
            batch.checkoutExpiresAt &&
            new Date(batch.checkoutExpiresAt).getTime() <= Date.now()
    );

    if (paidWithoutInvoice.length > 0) {
        addIssue(issues, BLOCKING_LEVELS.WARNING, "billing", "Paid ERICH batches without invoices exist.", {
            count: paidWithoutInvoice.length,
        });
    }
    if (paidWithoutTickets.length > 0) {
        addIssue(issues, BLOCKING_LEVELS.WARNING, "tickets", "Paid ERICH batches without complete tickets exist.", {
            count: paidWithoutTickets.length,
        });
    }
    if (checkoutExpired.length > 0) {
        addIssue(issues, BLOCKING_LEVELS.WARNING, "checkout", "Expired checkout batches should be invalidated.", {
            count: checkoutExpired.length,
        });
    }

    const pendingLicenseImports = licenses.filter((license) =>
        ["UPLOADED", "VALIDATED"].includes(license.status)
    ).length;
    if (pendingLicenseImports > 0) {
        addIssue(issues, BLOCKING_LEVELS.WARNING, "licenses", "License imports are not fully applied yet.", {
            pendingLicenseImports,
        });
    }

    const hasCriticalExport = exportJobs.some((job) =>
        ["REGISTRATION_LIST", "FINANCE", "CHECK_IN"].includes(job.exportType) &&
        job.status === "PREPARED"
    );
    if (!hasCriticalExport && registrationBatches.some((batch) => batch.status === "PAID")) {
        addIssue(issues, BLOCKING_LEVELS.INFO, "exports", "No prepared ERICH operational export exists yet.");
    }

    return {
        ready: issues.every((issue) => issue.level !== BLOCKING_LEVELS.ERROR),
        issues,
        metrics: {
            pricePhases: pricePhases.length,
            activePricePhaseCount,
            races: races.length,
            activeRaceCount,
            reviewRaceCount,
            clubs: clubs.length,
            activeClubCount,
            registrationBatchesByStatus: countBy(registrationBatches, "status"),
            licenseImportsByStatus: countBy(licenses, "status"),
            invoices: invoices.length,
            tickets: tickets.length,
            exportJobs: exportJobs.length,
        },
    };
}

export function erichReadinessRaceInclude() {
    return erichRaceReviewInclude();
}

export async function loadErichReadinessReport(store, { eventId = null } = {}) {
    const event = eventId
        ? await store.erichEvent.findUnique({ where: { id: eventId } })
        : await store.erichEvent.findFirst({ orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }] });

    if (!event) {
        return buildErichReadinessReport({ event: null });
    }

    const [
        races,
        pricePhases,
        clubs,
        registrationBatches,
        licenses,
        invoices,
        tickets,
        exportJobs,
    ] = await Promise.all([
        store.erichRaceDefinition.findMany({
            where: { eventId: event.id },
            include: erichReadinessRaceInclude(),
        }),
        store.erichPricePhase.findMany({ where: { eventId: event.id } }),
        store.erichClub.findMany({ take: 1000 }),
        store.erichRegistrationBatch.findMany({
            where: { eventId: event.id },
            include: {
                invoices: { select: { id: true } },
                raceEntries: {
                    select: {
                        id: true,
                        tickets: { select: { id: true } },
                    },
                },
            },
        }),
        store.erichLicenseImport.findMany({ where: { eventId: event.id } }),
        store.erichInvoice.findMany({ where: { registrationBatch: { eventId: event.id } } }),
        store.erichTicket.findMany({ where: { eventId: event.id } }),
        store.erichExportJob.findMany({ where: { eventId: event.id } }),
    ]);

    return buildErichReadinessReport({
        event,
        races,
        pricePhases,
        clubs,
        registrationBatches,
        licenses,
        invoices,
        tickets,
        exportJobs,
    });
}

