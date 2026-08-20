const ORGANIZATION_ADMIN_ROLES = new Set(["OWNER", "ADMIN"]);
const EVENT_EDIT_ROLES = new Set(["MANAGER", "EDITOR"]);
const EVENT_CHECKIN_ROLES = new Set(["MANAGER", "EDITOR", "CHECKIN"]);

export function getEventAccessWhere(user) {
    if (!user) {
        return { id: -1 };
    }

    if (user.role === "ADMIN") {
        return {};
    }

    return {
        OR: [
            { ownerId: user.id },
            { organization: { ownerId: user.id } },
            {
                organization: {
                    members: {
                        some: {
                            userId: user.id,
                            role: { in: [...ORGANIZATION_ADMIN_ROLES] },
                        },
                    },
                },
            },
            {
                members: {
                    some: {
                        userId: user.id,
                        role: { in: [...EVENT_EDIT_ROLES] },
                    },
                },
            },
        ],
    };
}

export function getBookingAccessWhere(user) {
    if (!user) {
        return { id: "" };
    }

    if (user.role === "ADMIN") {
        return {};
    }

    return {
        event: getEventAccessWhere(user),
    };
}

export function canManageOrganization(user, organization) {
    if (!user || !organization) return false;
    if (user.role === "ADMIN") return true;
    if (organization.ownerId === user.id) return true;

    return Boolean(
        organization.members?.some(
            (member) =>
                member.userId === user.id && ORGANIZATION_ADMIN_ROLES.has(member.role)
        )
    );
}

export function canManageEvent(user, event) {
    if (!user || !event) return false;
    if (user.role === "ADMIN") return true;
    if (event.ownerId === user.id) return true;

    const orgMatch =
        event.organization?.ownerId === user.id ||
        event.organization?.members?.some(
            (member) => member.userId === user.id && ORGANIZATION_ADMIN_ROLES.has(member.role)
        );
    if (orgMatch) return true;

    return Boolean(
        event.members?.some((member) => member.userId === user.id && EVENT_EDIT_ROLES.has(member.role))
    );
}

export function canCheckInEvent(user, event) {
    if (!user || !event) return false;
    if (user.role === "ADMIN") return true;
    if (event.ownerId === user.id) return true;

    const orgMatch =
        event.organization?.ownerId === user.id ||
        event.organization?.members?.some(
            (member) => member.userId === user.id && ORGANIZATION_ADMIN_ROLES.has(member.role)
        );
    if (orgMatch) return true;

    return Boolean(
        event.members?.some(
            (member) => member.userId === user.id && EVENT_CHECKIN_ROLES.has(member.role)
        )
    );
}

export function canManageOrganizationMember(user, organization) {
    return canManageOrganization(user, organization);
}
