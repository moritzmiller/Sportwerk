import assert from "node:assert/strict";
import { test } from "node:test";

import {
    assertCanManageErichAthlete,
    buildAthleteAuditSnapshot,
    createErichAthlete,
    deleteErichAthlete,
    deriveBirthYear,
    normalizeErichAthleteInput,
    updateErichAthlete,
} from "../src/lib/erich/athletes.js";

const now = new Date("2026-09-01T10:00:00.000Z");
const user = { id: "user-1", role: "VISITOR", erichRoleAssignments: [] };

const athleteInput = {
    clubId: "club-1",
    firstName: "  Max ",
    lastName: " Muster ",
    gender: "male",
    birthDate: "2010-12-31",
    nationalityCode: "de",
    email: " max@example.com ",
    lightweight: true,
    parasport: true,
    germanLicenseNumber: " 12345 ",
};

function createStore() {
    const calls = [];

    return {
        calls,
        erichAthlete: {
            findUnique: async (args) => {
                calls.push(["erichAthlete.findUnique", args]);
                return { id: "athlete-1", ...normalizeErichAthleteInput(athleteInput, { accountId: "user-1", now }) };
            },
            create: async (args) => {
                calls.push(["erichAthlete.create", args]);
                return { id: "athlete-1", ...args.data };
            },
            update: async (args) => {
                calls.push(["erichAthlete.update", args]);
                return { id: args.where.id, ...args.data };
            },
            delete: async (args) => {
                calls.push(["erichAthlete.delete", args]);
                return { id: args.where.id };
            },
        },
        erichConsentAcceptance: {
            deleteMany: async (args) => {
                calls.push(["erichConsentAcceptance.deleteMany", args]);
                return { count: 2 };
            },
        },
        erichAuditLog: {
            create: async (args) => {
                calls.push(["erichAuditLog.create", args]);
                return { id: "audit-1", ...args.data };
            },
        },
    };
}

test("ERICH athlete input is normalized and derives birth year from birth date", () => {
    const data = normalizeErichAthleteInput(athleteInput, { accountId: "user-1", now });

    assert.equal(data.accountId, "user-1");
    assert.equal(data.firstName, "Max");
    assert.equal(data.lastName, "Muster");
    assert.equal(data.gender, "MALE");
    assert.equal(data.birthDate.toISOString(), "2010-12-31T00:00:00.000Z");
    assert.equal(data.birthYear, 2010);
    assert.equal(data.nationalityCode, "DE");
    assert.equal(data.email, "max@example.com");
    assert.equal(data.germanLicenseNumber, "12345");
    assert.equal(deriveBirthYear("2009-01-02"), 2009);
});

test("ERICH athlete service updates athlete and audit entry", async () => {
    const store = createStore();

    const athlete = await updateErichAthlete(store, {
        user,
        athleteId: "athlete-1",
        input: { ...athleteInput, firstName: "Moritz", lightweight: false },
        eventId: "event-1",
        now,
    });

    assert.equal(athlete.id, "athlete-1");
    assert.equal(athlete.firstName, "Moritz");
    assert.equal(athlete.lightweight, false);
    assert.deepEqual(
        store.calls.map(([name]) => name),
        ["erichAthlete.findUnique", "erichAthlete.update", "erichAuditLog.create"]
    );
    assert.equal(store.calls[2][1].data.action, "athlete.updated");
    assert.equal(store.calls[2][1].data.oldValue.firstName, "Max");
    assert.equal(store.calls[2][1].data.newValue.firstName, "Moritz");
});

test("ERICH athlete birth date parsing is stable for date-only form input", () => {
    assert.equal(
        normalizeErichAthleteInput(
            { ...athleteInput, birthDate: "2010-02-28" },
            { accountId: "user-1", now }
        ).birthDate.toISOString(),
        "2010-02-28T00:00:00.000Z"
    );

    assert.throws(
        () =>
            normalizeErichAthleteInput(
                { ...athleteInput, birthDate: "2010-02-31" },
                { accountId: "user-1", now }
            ),
        (error) => {
            assert.equal(error.code, "ERICH_INVALID_BIRTH_DATE");
            return true;
        }
    );
});

test("ERICH athlete service deletes unreferenced athlete with audit entry", async () => {
    const store = createStore();
    store.erichAthlete.findUnique = async (args) => {
        store.calls.push(["erichAthlete.findUnique", args]);
        return {
            id: "athlete-1",
            ...normalizeErichAthleteInput(athleteInput, { accountId: "user-1", now }),
            _count: {
                raceEntries: 0,
                teamMembers: 0,
                tickets: 0,
            },
        };
    };

    const result = await deleteErichAthlete(store, {
        user,
        athleteId: "athlete-1",
        eventId: "event-1",
        auditReason: "Manual cleanup",
    });

    assert.equal(result.athlete.id, "athlete-1");
    assert.equal(result.deletedConsentAcceptanceCount, 2);
    assert.deepEqual(
        store.calls.map(([name]) => name),
        [
            "erichAthlete.findUnique",
            "erichConsentAcceptance.deleteMany",
            "erichAthlete.delete",
            "erichAuditLog.create",
        ]
    );
    assert.equal(store.calls[3][1].data.action, "athlete.deleted");
    assert.equal(store.calls[3][1].data.oldValue.id, "athlete-1");
    assert.equal(store.calls[3][1].data.newValue, null);
});

test("ERICH athlete service refuses to delete referenced athletes", async () => {
    const store = createStore();
    store.erichAthlete.findUnique = async (args) => {
        store.calls.push(["erichAthlete.findUnique", args]);
        return {
            id: "athlete-1",
            ...normalizeErichAthleteInput(athleteInput, { accountId: "user-1", now }),
            _count: {
                raceEntries: 1,
                teamMembers: 0,
                tickets: 0,
            },
        };
    };

    await assert.rejects(
        () =>
            deleteErichAthlete(store, {
                user,
                athleteId: "athlete-1",
                eventId: "event-1",
            }),
        (error) => {
            assert.equal(error.code, "ERICH_ATHLETE_HAS_REGISTRATIONS");
            assert.equal(error.raceEntryCount, 1);
            return true;
        }
    );

    assert.deepEqual(
        store.calls.map(([name]) => name),
        ["erichAthlete.findUnique"]
    );
});

test("ERICH athlete input rejects unusable demographic values", () => {
    assert.throws(
        () => normalizeErichAthleteInput({ ...athleteInput, gender: "mixed" }, { accountId: "user-1", now }),
        (error) => {
            assert.equal(error.code, "ERICH_INVALID_ATHLETE_GENDER");
            return true;
        }
    );

    assert.throws(
        () =>
            normalizeErichAthleteInput(
                { ...athleteInput, birthDate: "2027-01-01" },
                { accountId: "user-1", now }
            ),
        (error) => {
            assert.equal(error.code, "ERICH_BIRTH_DATE_OUT_OF_RANGE");
            return true;
        }
    );

    assert.throws(
        () =>
            normalizeErichAthleteInput(
                { ...athleteInput, nationalityCode: "Germany" },
                { accountId: "user-1", now }
            ),
        (error) => {
            assert.equal(error.code, "ERICH_INVALID_COUNTRY_CODE");
            return true;
        }
    );
});

test("ERICH athlete management is limited to own records unless registration rights are present", () => {
    assert.equal(assertCanManageErichAthlete({ user, accountId: "user-1", eventId: "event-1" }), true);

    assert.throws(
        () => assertCanManageErichAthlete({ user, accountId: "other-user", eventId: "event-1" }),
        (error) => {
            assert.equal(error.code, "ERICH_PERMISSION_DENIED");
            return true;
        }
    );

    const officeUser = {
        id: "office-1",
        role: "VISITOR",
        erichRoleAssignments: [{ eventId: "event-1", role: "REGISTRATION_OFFICE" }],
    };

    assert.equal(
        assertCanManageErichAthlete({
            user: officeUser,
            accountId: "other-user",
            eventId: "event-1",
        }),
        true
    );
});

test("ERICH athlete audit snapshot does not include parasport details", () => {
    const snapshot = buildAthleteAuditSnapshot({
        id: "athlete-1",
        ...normalizeErichAthleteInput(athleteInput, { accountId: "user-1", now }),
    });

    assert.equal(Object.hasOwn(snapshot, "parasport"), false);
    assert.equal(snapshot.germanLicenseNumberPresent, true);
});

test("ERICH athlete service creates athlete and audit entry", async () => {
    const store = createStore();

    const athlete = await createErichAthlete(store, {
        user,
        input: athleteInput,
        eventId: "event-1",
        now,
    });

    assert.equal(athlete.id, "athlete-1");
    assert.deepEqual(
        store.calls.map(([name]) => name),
        ["erichAthlete.create", "erichAuditLog.create"]
    );
    assert.equal(store.calls[0][1].data.birthYear, 2010);
    assert.equal(store.calls[1][1].data.action, "athlete.created");
    assert.equal(store.calls[1][1].data.entityId, "athlete-1");
    assert.equal(Object.hasOwn(store.calls[1][1].data.newValue, "parasport"), false);
});

test("ERICH athlete service maps missing account or club references", async () => {
    const store = createStore();
    store.erichAthlete.create = async (args) => {
        store.calls.push(["erichAthlete.create", args]);
        throw { code: "P2003" };
    };

    await assert.rejects(
        () =>
            createErichAthlete(store, {
                user,
                input: athleteInput,
                eventId: "event-1",
                now,
            }),
        (error) => {
            assert.equal(error.code, "ERICH_ATHLETE_REFERENCE_NOT_FOUND");
            return true;
        }
    );

    assert.deepEqual(
        store.calls.map(([name]) => name),
        ["erichAthlete.create"]
    );
});
