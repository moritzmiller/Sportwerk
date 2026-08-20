const ACTIVE_EVENT_STATUSES = ["DRAFT", "PUBLISHED", "POSTPONED", "SOLD_OUT"];

export async function disableUserAccount(
    tx,
    {
        userId,
        adminId,
        disabledAt = new Date(),
        disabledReason = "Admin-Deaktivierung",
        eventCancellationReason = "Account deaktiviert",
        auditAction = "admin.user.disabled",
        auditDetails = {},
        select,
    }
) {
    await tx.event.updateMany({
        where: {
            ownerId: userId,
            status: { in: ACTIVE_EVENT_STATUSES },
        },
        data: {
            status: "CANCELLED",
            cancelledAt: disabledAt,
            cancellationReason: eventCancellationReason,
        },
    });

    await tx.eventAuditLog.create({
        data: {
            actorId: adminId,
            action: auditAction,
            details: {
                userId,
                ...auditDetails,
            },
        },
    });

    return tx.user.update({
        where: { id: userId },
        data: {
            disabledAt,
            disabledById: adminId,
            disabledReason,
        },
        ...(select ? { select } : {}),
    });
}

export async function reactivateUserAccount(
    tx,
    {
        userId,
        adminId,
        auditAction = "admin.user.reactivated",
        auditDetails = {},
        select,
    }
) {
    await tx.eventAuditLog.create({
        data: {
            actorId: adminId,
            action: auditAction,
            details: {
                userId,
                ...auditDetails,
            },
        },
    });

    return tx.user.update({
        where: { id: userId },
        data: {
            disabledAt: null,
            disabledById: null,
            disabledReason: null,
        },
        ...(select ? { select } : {}),
    });
}
