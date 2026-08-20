import assert from "node:assert/strict";
import test from "node:test";

import {
    getMissingPublicTables,
    hasPublicTable,
    isMissingPrismaTableError,
    isPrismaSchemaMismatchError,
} from "../src/lib/prisma-errors.js";

test("detects Prisma missing table errors", () => {
    assert.equal(
        isMissingPrismaTableError({
            code: "P2021",
            meta: { table: "public.ErichRoleAssignment" },
        }),
        true
    );
});

test("matches missing table errors by table name", () => {
    assert.equal(
        isMissingPrismaTableError(
            {
                code: "P2021",
                message: "The table `public.ErichRoleAssignment` does not exist.",
            },
            ["ErichRoleAssignment"]
        ),
        true
    );

    assert.equal(
        isMissingPrismaTableError(
            {
                code: "P2021",
                meta: { table: "public.OtherTable" },
            },
            ["ErichRoleAssignment"]
        ),
        false
    );
});

test("ignores unrelated Prisma errors", () => {
    assert.equal(isMissingPrismaTableError({ code: "P2002" }), false);
    assert.equal(isMissingPrismaTableError(new Error("connection failed")), false);
});

test("detects Prisma schema mismatch errors", () => {
    assert.equal(
        isPrismaSchemaMismatchError({ name: "PrismaClientKnownRequestError" }),
        true
    );
    assert.equal(isPrismaSchemaMismatchError({ code: "P2021" }), true);
    assert.equal(isPrismaSchemaMismatchError({ code: "P2022" }), true);
    assert.equal(isPrismaSchemaMismatchError({ code: "P2023" }), true);
    assert.equal(isPrismaSchemaMismatchError({ code: "P2032" }), true);
    assert.equal(isPrismaSchemaMismatchError({ code: "P2002" }), false);
    assert.equal(isPrismaSchemaMismatchError(new Error("connection failed")), false);
});

function createPrismaWithTables(existingTables) {
    return {
        $queryRaw: async (_strings, tableName) => [
            {
                exists: existingTables.includes(tableName),
            },
        ],
    };
}

test("reports missing public tables before model queries run", async () => {
    const missingTables = await getMissingPublicTables(
        createPrismaWithTables(["ErichEvent"]),
        ["ErichEvent", "ErichClub", "ErichRoleAssignment"]
    );

    assert.deepEqual(missingTables, ["ErichClub", "ErichRoleAssignment"]);
});

test("checks a single public table", async () => {
    assert.equal(
        await hasPublicTable(
            createPrismaWithTables(["ErichRoleAssignment"]),
            "ErichRoleAssignment"
        ),
        true
    );
    assert.equal(
        await hasPublicTable(createPrismaWithTables([]), "ErichRoleAssignment"),
        false
    );
});
