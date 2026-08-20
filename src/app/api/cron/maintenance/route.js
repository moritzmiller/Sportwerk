import { getCronSecret } from "@/lib/env";
import { runMaintenanceCleanup } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

function isAuthorized(request) {
    const secret = getCronSecret();
    if (!secret) return process.env.NODE_ENV !== "production";

    const headerSecret = request.headers.get("x-cron-secret");
    const authorization = request.headers.get("authorization");
    return headerSecret === secret || authorization === `Bearer ${secret}`;
}

async function runJob() {
    const result = await runMaintenanceCleanup();
    return {
        ok: true,
        deleted: result.deleted,
        cutoffs: {
            rateLimitResetBefore: result.cutoffs.rateLimitResetBefore.toISOString(),
            systemEventCreatedBefore: result.cutoffs.systemEventCreatedBefore.toISOString(),
            scannerLinkExpiredBefore: result.cutoffs.scannerLinkExpiredBefore.toISOString(),
            erichTemporaryDraftExpiredBefore:
                result.cutoffs.erichTemporaryDraftExpiredBefore.toISOString(),
        },
    };
}

export async function GET(request) {
    if (!isAuthorized(request)) {
        return Response.json({ error: "Nicht autorisiert." }, { status: 401 });
    }

    return Response.json(await runJob());
}

export async function POST(request) {
    if (!isAuthorized(request)) {
        return Response.json({ error: "Nicht autorisiert." }, { status: 401 });
    }

    return Response.json(await runJob());
}
