export const ERICH_VALUATION_LEVELS = Object.freeze({
    ERICH: "ERICH",
    DM: "DM",
    MDM: "MDM",
});

export const ERICH_ELIGIBILITY_STATUS = Object.freeze({
    NOT_REQUIRED: "NOT_REQUIRED",
    PENDING_IMPORT: "PENDING_IMPORT",
    REJECTED: "REJECTED",
});

function hasStateAssociationMembership(club) {
    return Boolean(club?.stateAssociationMember);
}

function evaluateErich(race) {
    if (!race?.includesErich) return null;

    return {
        level: ERICH_VALUATION_LEVELS.ERICH,
        included: true,
        eligibilityStatus: ERICH_ELIGIBILITY_STATUS.NOT_REQUIRED,
        dependsOnLicenseCheck: false,
        reasonCodes: [],
    };
}

function evaluateDm(race, club) {
    if (!race?.includesDm) return null;

    const reasonCodes = [];
    if (!club?.isGermanClub) reasonCodes.push("CLUB_NOT_GERMAN");
    if (!hasStateAssociationMembership(club)) reasonCodes.push("CLUB_NOT_STATE_ASSOCIATION_MEMBER");

    return {
        level: ERICH_VALUATION_LEVELS.DM,
        included: reasonCodes.length === 0,
        eligibilityStatus:
            reasonCodes.length === 0
                ? ERICH_ELIGIBILITY_STATUS.PENDING_IMPORT
                : ERICH_ELIGIBILITY_STATUS.REJECTED,
        dependsOnLicenseCheck: reasonCodes.length === 0,
        reasonCodes,
    };
}

function evaluateMdm(race, club) {
    if (!race?.includesMdm) return null;

    const reasonCodes = [];
    if (!club?.isCentralGermanClub) reasonCodes.push("CLUB_NOT_CENTRAL_GERMAN");
    if (!hasStateAssociationMembership(club)) reasonCodes.push("CLUB_NOT_STATE_ASSOCIATION_MEMBER");

    return {
        level: ERICH_VALUATION_LEVELS.MDM,
        included: reasonCodes.length === 0,
        eligibilityStatus:
            reasonCodes.length === 0
                ? ERICH_ELIGIBILITY_STATUS.PENDING_IMPORT
                : ERICH_ELIGIBILITY_STATUS.REJECTED,
        dependsOnLicenseCheck: reasonCodes.length === 0,
        reasonCodes,
    };
}

export function evaluateChampionshipValuations({ race, club }) {
    if (!race) throw new Error("race is required.");

    return [evaluateErich(race), evaluateDm(race, club), evaluateMdm(race, club)].filter(Boolean);
}

export function includedValuationLevels(decisions) {
    return decisions.filter((decision) => decision.included).map((decision) => decision.level);
}
