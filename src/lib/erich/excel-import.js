import * as XLSX from "@e965/xlsx";
import { readFileSync } from "node:fs";

import { assertCentAmount } from "./money.js";

export const ERICH_REQUIRED_SHEETS = Object.freeze({
    RACES: "Rennauswertung",
    PRICES: "Startgeld",
});

const SHEET_ALIASES = Object.freeze({
    [ERICH_REQUIRED_SHEETS.PRICES]: ["Startgeld", "Startgelder"],
});

export const ERICH_PRICE_PHASE_KEYS = Object.freeze(["SEPT", "OCT_NOV", "DEC_JAN"]);

const PRICE_BLOCKS = Object.freeze([
    { level: "ERICH", startIndex: 11 },
    { level: "DM", startIndex: 18 },
    { level: "MDM", startIndex: 26 },
]);

function cell(row, index) {
    return row?.[index] ?? null;
}

function normalizeText(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text || null;
}

function normalizeRaceNumber(value) {
    if (typeof value === "number" && Number.isInteger(value)) return value;
    if (typeof value === "number" && Number.isInteger(Math.trunc(value))) return Math.trunc(value);
    if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
    return null;
}

function isMarked(value) {
    return normalizeText(value)?.toLowerCase() === "x";
}

function parseNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const normalized = value.trim().replace(",", ".");
        if (normalized && !Number.isNaN(Number(normalized))) return Number(normalized);
    }
    return null;
}

function dateOnly(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseDateValue(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return dateOnly(value);
    }

    const text = normalizeText(value);
    if (!text) return null;

    const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        const [, year, month, day] = isoMatch.map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        return Number.isNaN(date.getTime()) ? null : dateOnly(date);
    }

    const germanMatch = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (germanMatch) {
        const [, day, month, year] = germanMatch.map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        return Number.isNaN(date.getTime()) ? null : dateOnly(date);
    }

    return null;
}

function parseDatesFromText(value) {
    const text = normalizeText(value);
    if (!text) return [];

    const matches = [
        ...text.matchAll(/(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})/g),
    ];

    return matches.map((match) => parseDateValue(match[1])).filter(Boolean);
}

function parsePhaseWindow(value) {
    const text = normalizeText(value);
    if (!text) return { startsAt: null, endsAt: null };

    if (value instanceof Date) {
        return { startsAt: parseDateValue(value), endsAt: null };
    }

    const dates = parseDatesFromText(text);
    const lower = text.toLowerCase();

    if (dates.length >= 2) {
        return { startsAt: dates[0], endsAt: dates[1] };
    }

    if (dates.length === 1) {
        if (lower.includes("bis") || lower.includes("until")) {
            return { startsAt: null, endsAt: dates[0] };
        }

        return { startsAt: dates[0], endsAt: null };
    }

    return { startsAt: null, endsAt: null };
}

function parseInteger(value) {
    const number = parseNumber(value);
    if (number === null) return null;
    const integer = Math.trunc(number);
    return Number.isInteger(integer) ? integer : null;
}

function optionalMarked(value) {
    if (!normalizeText(value)) return null;
    return isMarked(value);
}

export function euroValueToCents(value) {
    const number = parseNumber(value);
    if (number === null) return null;
    return assertCentAmount(Math.round(number * 100));
}

export function normalizeRaceGender(genderLabel) {
    const label = normalizeText(genderLabel);
    if (!label) return { gender: null, lightweight: false };

    if (label === "M/W") return { gender: "MIXED", lightweight: false };
    if (label === "M LG") return { gender: "MALE", lightweight: true };
    if (label === "W LG") return { gender: "FEMALE", lightweight: true };
    if (label === "M") return { gender: "MALE", lightweight: false };
    if (label === "W") return { gender: "FEMALE", lightweight: false };

    return { gender: null, lightweight: false };
}

export function getExpectedPriceLevel(race) {
    if (race.includesErich) return "ERICH";
    if (race.includesDm) return "DM";
    if (race.includesMdm) return "MDM";
    return null;
}

export function parseRennauswertungRows(rows) {
    const races = [];

    rows.slice(2).forEach((row, rowIndex) => {
        const raceNumber = normalizeRaceNumber(cell(row, 0));
        if (!raceNumber) return;

        const genderLabel = normalizeText(cell(row, 1));
        const classLabel = normalizeText(cell(row, 2));
        const distanceLabel = normalizeText(cell(row, 3));
        const genderInfo = normalizeRaceGender(genderLabel);

        races.push({
            raceNumber,
            sourceSheet: ERICH_REQUIRED_SHEETS.RACES,
            sourceRow: rowIndex + 3,
            genderLabel,
            gender: genderInfo.gender,
            classLabel: classLabel === null ? null : String(classLabel),
            distanceLabel,
            includesErich: isMarked(cell(row, 4)),
            includesDm: isMarked(cell(row, 5)),
            includesMdm: isMarked(cell(row, 6)),
            projectedStarters: parseNumber(cell(row, 7)),
            minimumBirthYear: parseInteger(cell(row, 8)),
            maximumBirthYear: parseInteger(cell(row, 9)),
            higherAgeClassAllowed: isMarked(cell(row, 10)),
            higherAgeMinimumBirthYear: parseInteger(cell(row, 11)),
            requiredTeamSize: parseInteger(cell(row, 12)),
            sameClubRequired: optionalMarked(cell(row, 13)),
            mixedClubsAllowed: optionalMarked(cell(row, 14)),
            maleCount: parseInteger(cell(row, 15)),
            femaleCount: parseInteger(cell(row, 16)),
            isLightweight: genderInfo.lightweight,
            isTeamRace: Boolean(distanceLabel?.includes("(4x)") || distanceLabel?.includes("(8x)")),
            isPara: Boolean(String(classLabel ?? "").toUpperCase().startsWith("PR")),
            raw: row,
        });
    });

    return races;
}

export function parseStartgeldRows(rows) {
    const pricesByRaceNumber = new Map();

    rows.slice(4).forEach((row, rowIndex) => {
        const raceNumber = normalizeRaceNumber(cell(row, 0));
        if (!raceNumber) return;

        const prices = [];

        PRICE_BLOCKS.forEach(({ level, startIndex }) => {
            const phaseValues = ERICH_PRICE_PHASE_KEYS.map((phaseKey, phaseIndex) => ({
                phaseKey,
                amountCents: euroValueToCents(cell(row, startIndex + phaseIndex)),
            }));

            if (phaseValues.some((phase) => phase.amountCents !== null)) {
                prices.push({
                    level,
                    sourceSheet: ERICH_REQUIRED_SHEETS.PRICES,
                    sourceRow: rowIndex + 5,
                    phases: phaseValues,
                });
            }
        });

        pricesByRaceNumber.set(raceNumber, prices);
    });

    return pricesByRaceNumber;
}

export function parsePricePhases(rows) {
    const periodRow = rows[1] ?? [];

    return ERICH_PRICE_PHASE_KEYS.map((phaseKey, phaseIndex) => {
        const { startsAt, endsAt } = parsePhaseWindow(cell(periodRow, 11 + phaseIndex));

        return {
            name: phaseKey,
            sortOrder: phaseIndex + 1,
            startsAt,
            endsAt,
        };
    });
}

function buildRaceIssues(race, prices) {
    const issues = [];
    const expectedPriceLevel = getExpectedPriceLevel(race);

    if (!race.genderLabel || !race.classLabel || !race.distanceLabel) {
        issues.push({
            code: "MISSING_PRIMARY_RACE_DEFINITION",
            severity: "blocker",
            message: "Race number exists but primary race fields are incomplete.",
        });
    }

    if (!race.includesErich && !race.includesDm && !race.includesMdm) {
        issues.push({
            code: "MISSING_CHAMPIONSHIP_FLAG",
            severity: "blocker",
            message: "Race has no ERICH, DM or MDM marker in the primary race columns.",
        });
    }

    if (expectedPriceLevel && !prices.some((price) => price.level === expectedPriceLevel)) {
        issues.push({
            code: "MISSING_EXPECTED_PRICE_BLOCK",
            severity: "blocker",
            message: `Expected ${expectedPriceLevel} price block is missing for this race.`,
        });
    }

    prices
        .filter((price) => {
            if (price.level === "ERICH") return !race.includesErich;
            if (price.level === "DM") return !race.includesDm;
            if (price.level === "MDM") return !race.includesMdm;
            return true;
        })
        .forEach((price) => {
            issues.push({
                code: "PRICE_BLOCK_WITHOUT_MATCHING_FLAG",
                severity: "warning",
                message: `${price.level} price block exists although the primary race flag is not marked.`,
            });
        });

    return issues;
}

export function buildErichExcelDryRun({ rennauswertungRows, startgeldRows }) {
    const races = parseRennauswertungRows(rennauswertungRows);
    const pricesByRaceNumber = parseStartgeldRows(startgeldRows);
    const pricePhases = parsePricePhases(startgeldRows);

    const normalizedRaces = races.map((race) => {
        const prices = pricesByRaceNumber.get(race.raceNumber) ?? [];
        const issues = buildRaceIssues(race, prices);

        return {
            ...race,
            expectedPriceLevel: getExpectedPriceLevel(race),
            prices,
            importStatus: issues.some((issue) => issue.severity === "blocker")
                ? "REVIEW_REQUIRED"
                : "ACTIVE",
            issues,
        };
    });

    const raceNumbers = normalizedRaces.map((race) => race.raceNumber);
    const duplicateRaceNumbers = raceNumbers.filter(
        (raceNumber, index) => raceNumbers.indexOf(raceNumber) !== index
    );
    const issueCounts = normalizedRaces.reduce((counts, race) => {
        race.issues.forEach((issue) => {
            counts[issue.code] = (counts[issue.code] ?? 0) + 1;
        });
        return counts;
    }, {});

    return {
        sheets: ERICH_REQUIRED_SHEETS,
        summary: {
            raceCount: normalizedRaces.length,
            minRaceNumber: raceNumbers.length ? Math.min(...raceNumbers) : null,
            maxRaceNumber: raceNumbers.length ? Math.max(...raceNumbers) : null,
            duplicateRaceNumbers: [...new Set(duplicateRaceNumbers)],
            activeRaceCount: normalizedRaces.filter((race) => race.importStatus === "ACTIVE").length,
            reviewRequiredRaceCount: normalizedRaces.filter(
                (race) => race.importStatus === "REVIEW_REQUIRED"
            ).length,
            issueCounts,
        },
        pricePhases,
        races: normalizedRaces,
    };
}

export async function readErichExcelDryRun(filePath) {
    const workbook = XLSX.read(readFileSync(filePath), {
        cellDates: true,
        dense: true,
        type: "buffer",
    });

    const readSheetRows = (sheetName) => {
        const names = SHEET_ALIASES[sheetName] ?? [sheetName];
        const matchedSheetName = names.find((name) => workbook.Sheets[name]);
        const worksheet = matchedSheetName ? workbook.Sheets[matchedSheetName] : null;
        if (!worksheet) {
            throw new Error(`Required workbook sheet is missing: ${names.join(" or ")}`);
        }

        return XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            blankrows: true,
            defval: null,
            raw: true,
        });
    };

    const rennauswertungRows = readSheetRows(ERICH_REQUIRED_SHEETS.RACES);
    const startgeldRows = readSheetRows(ERICH_REQUIRED_SHEETS.PRICES);

    return buildErichExcelDryRun({ rennauswertungRows, startgeldRows });
}
