export const ERICH_ROLES = Object.freeze({
    USER: "USER",
    ADMIN: "ADMIN",
    REGISTRATION_OFFICE: "REGISTRATION_OFFICE",
    SCANNER: "SCANNER",
});

export const ERICH_PERMISSIONS = Object.freeze({
    VIEW_OWN_DATA: "VIEW_OWN_DATA",
    MANAGE_OWN_DRAFTS: "MANAGE_OWN_DRAFTS",
    VIEW_REGISTRATIONS: "VIEW_REGISTRATIONS",
    MANAGE_REGISTRATIONS: "MANAGE_REGISTRATIONS",
    MANAGE_LICENSE_REVIEWS: "MANAGE_LICENSE_REVIEWS",
    MANAGE_RACE_MASTER_DATA: "MANAGE_RACE_MASTER_DATA",
    MANAGE_PRICE_PHASES: "MANAGE_PRICE_PHASES",
    MANAGE_ROLES: "MANAGE_ROLES",
    CONFIGURE_PAYMENTS: "CONFIGURE_PAYMENTS",
    VIEW_AUDIT_LOG: "VIEW_AUDIT_LOG",
    EXPORT_DATA: "EXPORT_DATA",
    SCAN_TICKETS: "SCAN_TICKETS",
    VIEW_SCANNER_DATA: "VIEW_SCANNER_DATA",
    ISSUE_DOCUMENTS: "ISSUE_DOCUMENTS",
    ACTIVATE_EMERGENCY_MODE: "ACTIVATE_EMERGENCY_MODE",
});

const ROLE_PERMISSIONS = Object.freeze({
    [ERICH_ROLES.USER]: new Set([
        ERICH_PERMISSIONS.VIEW_OWN_DATA,
        ERICH_PERMISSIONS.MANAGE_OWN_DRAFTS,
    ]),
    [ERICH_ROLES.SCANNER]: new Set([
        ERICH_PERMISSIONS.SCAN_TICKETS,
        ERICH_PERMISSIONS.VIEW_SCANNER_DATA,
        ERICH_PERMISSIONS.ISSUE_DOCUMENTS,
    ]),
    [ERICH_ROLES.REGISTRATION_OFFICE]: new Set([
        ERICH_PERMISSIONS.VIEW_REGISTRATIONS,
        ERICH_PERMISSIONS.MANAGE_REGISTRATIONS,
        ERICH_PERMISSIONS.MANAGE_LICENSE_REVIEWS,
        ERICH_PERMISSIONS.EXPORT_DATA,
        ERICH_PERMISSIONS.SCAN_TICKETS,
        ERICH_PERMISSIONS.VIEW_SCANNER_DATA,
        ERICH_PERMISSIONS.ISSUE_DOCUMENTS,
    ]),
    [ERICH_ROLES.ADMIN]: new Set(Object.values(ERICH_PERMISSIONS)),
});

function assignmentMatchesEvent(assignment, eventId) {
    return !eventId || assignment.eventId === eventId;
}

export function getErichRoleSet(user, eventId = null) {
    const roles = new Set();
    if (!user) return roles;

    roles.add(ERICH_ROLES.USER);

    if (user.role === "ADMIN") {
        roles.add(ERICH_ROLES.ADMIN);
    }

    for (const assignment of user.erichRoleAssignments ?? []) {
        if (assignmentMatchesEvent(assignment, eventId) && ROLE_PERMISSIONS[assignment.role]) {
            roles.add(assignment.role);
        }
    }

    return roles;
}

export function hasErichRole(user, role, eventId = null) {
    return getErichRoleSet(user, eventId).has(role);
}

export function canErich(user, permission, eventId = null) {
    if (!Object.values(ERICH_PERMISSIONS).includes(permission)) {
        throw new Error(`Unknown ERICH permission: ${permission}`);
    }

    for (const role of getErichRoleSet(user, eventId)) {
        if (ROLE_PERMISSIONS[role]?.has(permission)) return true;
    }

    return false;
}

export function canManageOwnErichRecord(user, record) {
    if (!user || !record) return false;
    if (canErich(user, ERICH_PERMISSIONS.MANAGE_REGISTRATIONS, record.eventId)) return true;
    return record.accountId === user.id && canErich(user, ERICH_PERMISSIONS.MANAGE_OWN_DRAFTS, record.eventId);
}

export function getOwnErichDataWhere(user) {
    if (!user) return { accountId: "" };
    if (hasErichRole(user, ERICH_ROLES.ADMIN)) return {};
    return { accountId: user.id };
}

export function getErichRegistrationAccessWhere(user, eventId) {
    if (!user) return { id: "" };
    if (canErich(user, ERICH_PERMISSIONS.VIEW_REGISTRATIONS, eventId)) {
        return eventId ? { eventId } : {};
    }

    return {
        accountId: user.id,
        ...(eventId ? { eventId } : {}),
    };
}

export function assertErichPermission(user, permission, eventId = null) {
    if (canErich(user, permission, eventId)) return true;

    const error = new Error("ERICH permission denied.");
    error.code = "ERICH_PERMISSION_DENIED";
    error.permission = permission;
    error.eventId = eventId;
    throw error;
}

export function buildScannerAthleteSelect() {
    return {
        id: true,
        firstName: true,
        lastName: true,
        club: {
            select: {
                officialName: true,
            },
        },
        raceEntries: {
            select: {
                raceNumber: true,
                status: true,
                valuations: {
                    select: {
                        level: true,
                        status: true,
                        dependsOnLicenseCheck: true,
                    },
                },
            },
        },
    };
}
