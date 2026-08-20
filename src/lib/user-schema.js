import { prisma } from "@/lib/prisma";

const USER_DEFAULT_COLUMNS = [
    "id",
    "email",
    "name",
    "paypalEmail",
    "billingName",
    "billingStreet",
    "billingStreet2",
    "billingPostalCode",
    "billingCity",
    "billingCountry",
    "preferredPaymentMethod",
    "disabledAt",
    "disabledById",
    "disabledReason",
    "role",
];

let userColumnsPromise;

async function loadUserColumns() {
    if (!userColumnsPromise) {
        userColumnsPromise = prisma.$queryRaw`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'User'
        `
            .then((rows) => new Set(rows.map((row) => row.column_name)))
            .catch(() => new Set(["id", "email", "name", "role"]));
    }

    return userColumnsPromise;
}

function buildSelect(columns) {
    return Object.fromEntries(
        USER_DEFAULT_COLUMNS.filter((column) => columns.has(column)).map((column) => [column, true])
    );
}

function pickExisting(data, columns) {
    return Object.fromEntries(
        Object.entries(data).filter(([key, value]) => columns.has(key) && value !== undefined)
    );
}

function normalizeUserRecord(user, columns) {
    return {
        ...user,
        paypalEmail: columns.has("paypalEmail") ? user.paypalEmail ?? null : null,
        billingName: columns.has("billingName") ? user.billingName ?? null : null,
        billingStreet: columns.has("billingStreet") ? user.billingStreet ?? null : null,
        billingStreet2: columns.has("billingStreet2") ? user.billingStreet2 ?? null : null,
        billingPostalCode: columns.has("billingPostalCode") ? user.billingPostalCode ?? null : null,
        billingCity: columns.has("billingCity") ? user.billingCity ?? null : null,
        billingCountry: columns.has("billingCountry") ? user.billingCountry ?? "DE" : "DE",
        preferredPaymentMethod: columns.has("preferredPaymentMethod")
            ? user.preferredPaymentMethod ?? "STRIPE"
            : "STRIPE",
        disabledAt: columns.has("disabledAt") ? user.disabledAt ?? null : null,
        disabledById: columns.has("disabledById") ? user.disabledById ?? null : null,
        disabledReason: columns.has("disabledReason") ? user.disabledReason ?? null : null,
        role: user.role ?? "VISITOR",
    };
}

export async function getSafeUserQueryConfig() {
    const columns = await loadUserColumns();
    return {
        columns,
        select: buildSelect(columns),
    };
}

export async function selectExistingUserFields(data) {
    const columns = await loadUserColumns();
    return pickExisting(data, columns);
}

export async function normalizeExistingUser(user) {
    const columns = await loadUserColumns();
    return normalizeUserRecord(user, columns);
}
