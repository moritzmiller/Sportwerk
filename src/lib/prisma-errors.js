export function isMissingPrismaTableError(error, tableNames = []) {
    if (!error || error.code !== "P2021") return false;

    if (tableNames.length === 0) return true;

    const haystack = [
        error.message,
        error.meta?.table,
        error.meta?.modelName,
    ]
        .filter(Boolean)
        .join(" ");

    return tableNames.some((tableName) => haystack.includes(tableName));
}

export function isPrismaSchemaMismatchError(error) {
    if (!error) return false;

    return (
        error.name === "PrismaClientKnownRequestError" ||
        ["P2021", "P2022", "P2023", "P2032"].includes(error.code)
    );
}

export async function getMissingPublicTables(prismaClient, tableNames) {
    if (!Array.isArray(tableNames) || tableNames.length === 0) return [];

    const checks = await Promise.all(
        tableNames.map(async (tableName) => {
            const rows = await prismaClient.$queryRaw`
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name = ${tableName}
                ) AS "exists"
            `;

            return rows[0]?.exists ? null : tableName;
        })
    );

    return checks.filter(Boolean);
}

export async function hasPublicTable(prismaClient, tableName) {
    const missingTables = await getMissingPublicTables(prismaClient, [tableName]);
    return missingTables.length === 0;
}
