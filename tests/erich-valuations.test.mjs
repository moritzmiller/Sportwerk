import assert from "node:assert/strict";
import { test } from "node:test";

import {
    evaluateChampionshipValuations,
    includedValuationLevels,
} from "../src/lib/erich/valuations.js";

const allChampionshipRace = {
    raceNumber: 17,
    includesErich: true,
    includesDm: true,
    includesMdm: true,
};

test("ERICH valuation is included regardless of club nationality when race is marked ERICH", () => {
    const decisions = evaluateChampionshipValuations({
        race: { raceNumber: 33, includesErich: true, includesDm: false, includesMdm: false },
        club: { isGermanClub: false, isCentralGermanClub: false, stateAssociationMember: false },
    });

    assert.deepEqual(includedValuationLevels(decisions), ["ERICH"]);
    assert.equal(decisions[0].eligibilityStatus, "NOT_REQUIRED");
    assert.equal(decisions[0].dependsOnLicenseCheck, false);
});

test("DM valuation follows the German club and association membership, not nationality", () => {
    const decisions = evaluateChampionshipValuations({
        race: allChampionshipRace,
        club: {
            isGermanClub: true,
            isCentralGermanClub: false,
            stateAssociationMember: true,
        },
    });

    assert.deepEqual(includedValuationLevels(decisions), ["ERICH", "DM"]);
    assert.equal(decisions.find((decision) => decision.level === "DM").eligibilityStatus, "PENDING_IMPORT");
    assert.equal(decisions.find((decision) => decision.level === "DM").dependsOnLicenseCheck, true);
});

test("DM valuation is rejected for foreign clubs even when race has DM marker", () => {
    const decisions = evaluateChampionshipValuations({
        race: { raceNumber: 9, includesErich: false, includesDm: true, includesMdm: true },
        club: {
            isGermanClub: false,
            isCentralGermanClub: false,
            stateAssociationMember: false,
        },
    });

    const dm = decisions.find((decision) => decision.level === "DM");
    assert.equal(dm.included, false);
    assert.deepEqual(dm.reasonCodes, ["CLUB_NOT_GERMAN", "CLUB_NOT_STATE_ASSOCIATION_MEMBER"]);
});

test("MDM valuation requires central German club and association membership", () => {
    const decisions = evaluateChampionshipValuations({
        race: allChampionshipRace,
        club: {
            isGermanClub: true,
            isCentralGermanClub: true,
            stateAssociationMember: true,
        },
    });

    assert.deepEqual(includedValuationLevels(decisions), ["ERICH", "DM", "MDM"]);
    assert.equal(decisions.find((decision) => decision.level === "MDM").dependsOnLicenseCheck, true);
});
