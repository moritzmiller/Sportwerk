export const VERIFICATION_STATUS = {
    PENDING: "PENDING",
    VERIFIED: "VERIFIED",
    REJECTED: "REJECTED",
};

export function isVerifiedStatus(value) {
    return value === VERIFICATION_STATUS.VERIFIED;
}

export function getVerificationLabel(value) {
    switch (value) {
        case VERIFICATION_STATUS.VERIFIED:
            return "Verifiziert";
        case VERIFICATION_STATUS.REJECTED:
            return "Abgelehnt";
        case VERIFICATION_STATUS.PENDING:
        default:
            return "Ausstehend";
    }
}

export function canPublishWithOrganization(organization) {
    if (!organization) return true;
    return isVerifiedStatus(organization.verificationStatus);
}

export function getTrustTone(value) {
    switch (value) {
        case VERIFICATION_STATUS.VERIFIED:
            return "success";
        case VERIFICATION_STATUS.REJECTED:
            return "danger";
        default:
            return "warning";
    }
}
