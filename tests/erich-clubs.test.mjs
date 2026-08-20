import assert from "node:assert/strict";
import { test } from "node:test";

import {
    buildErichClubSearchText,
    createErichClub,
    importErichClubs,
    normalizeErichClubInput,
    updateErichClub,
} from "../src/lib/erich/clubs.js";

const admin = { id: "admin-1", role: "ADMIN" };

test("ERICH club input normalizes search text and central German defaults", () => {
    const club = normalizeErichClubInput({
        officialName: "  Ruderclub Leipzig  ",
        externalFederationId: "DRV-123",
        countryCode: "de",
        federalState: "SN",
        stateRowingAssociation: "Sachsen",
    });

    assert.equal(club.officialName, "Ruderclub Leipzig");
    assert.equal(club.countryCode, "DE");
    assert.equal(club.federalState, "SN");
    assert.equal(club.stateAssociationMember, true);
    assert.equal(club.isGermanClub, true);
    assert.equal(club.isCentralGermanClub, true);
    assert.equal(club.active, true);
    assert.equal(buildErichClubSearchText(club), "ruderclub leipzig drv-123 de sn sachsen");
});

test("ERICH club input accepts explicit non-German club values", () => {
    const club = normalizeErichClubInput({
        name: "Paris Indoor Rowing",
        countryCode: "FR",
        stateAssociationMember: false,
    });

    assert.equal(club.officialName, "Paris Indoor Rowing");
    assert.equal(club.isGermanClub, false);
    assert.equal(club.isCentralGermanClub, false);
    assert.equal(club.stateAssociationMember, false);
});

test("ERICH club service creates and audits clubs", async () => {
    const calls = [];
    const store = {
        erichClub: {
            create: async (args) => {
                calls.push(["erichClub.create", args]);
                return { id: "club-1", ...args.data };
            },
        },
        erichAuditLog: {
            create: async (args) => {
                calls.push(["erichAuditLog.create", args]);
                return { id: "audit-1", ...args.data };
            },
        },
    };

    const club = await createErichClub(store, {
        user: admin,
        eventId: "event-1",
        input: { officialName: "Ruderverein Test", countryCode: "DE" },
    });

    assert.equal(club.id, "club-1");
    assert.equal(club.searchText, "ruderverein test de");
    assert.equal(calls[0][0], "erichClub.create");
    assert.equal(calls[1][1].data.action, "club.created");
});

test("ERICH club service updates existing clubs and requires permissions", async () => {
    const existing = {
        id: "club-1",
        officialName: "Old Club",
        countryCode: "DE",
        searchText: "old club de",
    };
    const calls = [];
    const store = {
        erichClub: {
            findUnique: async (args) => {
                calls.push(["erichClub.findUnique", args]);
                return existing;
            },
            update: async (args) => {
                calls.push(["erichClub.update", args]);
                return { id: args.where.id, ...args.data };
            },
        },
        erichAuditLog: {
            create: async (args) => {
                calls.push(["erichAuditLog.create", args]);
                return { id: "audit-1", ...args.data };
            },
        },
    };

    const club = await updateErichClub(store, {
        user: admin,
        clubId: "club-1",
        input: { officialName: "New Club", countryCode: "DE", active: false },
    });

    assert.equal(club.officialName, "New Club");
    assert.equal(club.active, false);
    assert.equal(calls.find(([name]) => name === "erichAuditLog.create")[1].data.action, "club.updated");

    await assert.rejects(
        () =>
            updateErichClub(store, {
                user: { id: "user-1", role: "VISITOR" },
                clubId: "club-1",
                input: { officialName: "New Club", countryCode: "DE" },
            }),
        (error) => {
            assert.equal(error.code, "ERICH_PERMISSION_DENIED");
            return true;
        }
    );
});

test("ERICH club import updates by federation id and creates missing clubs", async () => {
    const calls = [];
    const existing = { id: "club-existing", externalFederationId: "DRV-1" };
    const tx = {
        erichClubImport: {
            create: async (args) => {
                calls.push(["erichClubImport.create", args]);
                return { id: "import-1", ...args.data };
            },
        },
        erichClub: {
            findFirst: async (args) => {
                calls.push(["erichClub.findFirst", args]);
                if (args.where.externalFederationId === "DRV-1") return existing;
                return null;
            },
            update: async (args) => {
                calls.push(["erichClub.update", args]);
                return { id: args.where.id, ...args.data };
            },
            create: async (args) => {
                calls.push(["erichClub.create", args]);
                return { id: "club-new", ...args.data };
            },
        },
        erichAuditLog: {
            create: async (args) => {
                calls.push(["erichAuditLog.create", args]);
                return { id: "audit-1", ...args.data };
            },
        },
    };
    const store = {
        $transaction: async (callback) => callback(tx),
    };

    const result = await importErichClubs(store, {
        user: admin,
        eventId: "event-1",
        rows: [
            { officialName: "Existing Club", externalFederationId: "DRV-1", countryCode: "DE" },
            { officialName: "New Club", externalFederationId: "DRV-2", countryCode: "DE" },
        ],
    });

    assert.equal(result.createdClubCount, 1);
    assert.equal(result.updatedClubCount, 1);
    assert.equal(calls.filter(([name]) => name === "erichClub.update").length, 1);
    assert.equal(calls.filter(([name]) => name === "erichClub.create").length, 1);
    assert.equal(calls.at(-1)[1].data.action, "club.import_applied");
});
