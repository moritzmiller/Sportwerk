import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
    isAllowedDataImage,
    normalizeSafeText,
    readJsonBody,
    requestBodyErrorResponse,
} from "@/lib/security";

export function jsonError(message, status = 400) {
    return Response.json({ error: message }, { status });
}

export async function requireOfferStudioUser() {
    const user = await getCurrentUser();
    if (!user) return { response: jsonError("Bitte zuerst anmelden.", 401) };
    if (user.role !== "ORGANIZER" && user.role !== "ADMIN") {
        return { response: jsonError("Nur Veranstalter koennen Angebote speichern.", 403) };
    }
    return { user };
}

export async function readOfferStudioBody(request, maxBytes = 3 * 1024 * 1024) {
    try {
        return await readJsonBody(request, { maxBytes });
    } catch (error) {
        const response = requestBodyErrorResponse(error);
        if (response) return { response };
        throw error;
    }
}

function asText(value, maxLength = 1000) {
    return normalizeSafeText(value, { maxLength });
}

function optionalText(value, maxLength = 1000) {
    return asText(value, maxLength) || null;
}

function parseDate(value, fallback = new Date()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function toDateInput(value) {
    if (!value) return "";
    return new Date(value).toISOString().slice(0, 10);
}

function toClientAdjustment(type) {
    return type === "SURCHARGE" ? "surcharge" : "discount";
}

function toDbAdjustment(type) {
    return type === "surcharge" ? "SURCHARGE" : "DISCOUNT";
}

function toClientItemType(type) {
    return String(type || "DETAIL").toLowerCase();
}

function toDbItemType(type) {
    const normalized = String(type || "detail").toUpperCase();
    return ["HEADING", "SEPARATOR", "FLAT", "DETAIL"].includes(normalized) ? normalized : "DETAIL";
}

export function toClientCustomer(customer) {
    return {
        id: customer.id,
        name: customer.name,
        contact: customer.contact || "",
        email: customer.email || "",
        phone: customer.phone || "",
        address: customer.address || "",
        createdAt: customer.createdAt?.toISOString?.() || customer.createdAt,
        updatedAt: customer.updatedAt?.toISOString?.() || customer.updatedAt,
    };
}

export function toClientCompanyProfile(profile) {
    if (!profile) return null;
    return {
        name: profile.name,
        contact: profile.contact || "",
        representedBy: profile.representedBy || "",
        logo: profile.logo || "",
        email: profile.email || "",
        phone: profile.phone || "",
        address: profile.address || "",
        taxId: profile.taxId || "",
        bankName: profile.bankName || "",
        bic: profile.bic || "",
        accountHolder: profile.accountHolder || "",
        iban: profile.iban || "",
    };
}

export function toClientOffer(offer) {
    return {
        id: offer.id,
        number: offer.number,
        date: toDateInput(offer.date),
        validUntil: toDateInput(offer.validUntil),
        title: offer.title,
        intro: offer.intro || "",
        note: offer.note || "",
        showItemDetails: offer.showItemDetails,
        adjustment: {
            type: toClientAdjustment(offer.adjustmentType),
            value: offer.adjustmentValue,
        },
        company: offer.companySnapshot || {},
        customer: offer.customerSnapshot || {},
        legal: offer.legalSnapshot || {},
        totals: offer.totals || null,
        createdAt: offer.createdAt?.toISOString?.() || offer.createdAt,
        updatedAt: offer.updatedAt?.toISOString?.() || offer.updatedAt,
        items: (offer.items || [])
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((item) => ({
                id: item.id,
                type: toClientItemType(item.type),
                title: item.title,
                description: item.description || "",
                quantity: item.quantity,
                unit: item.unit || "",
                unitPrice: item.unitPrice,
                taxRate: item.taxRate,
            })),
    };
}

export function normalizeCustomerPayload(customer = {}) {
    return {
        name: asText(customer.name, 180),
        contact: optionalText(customer.contact, 180),
        email: optionalText(customer.email, 254),
        phone: optionalText(customer.phone, 60),
        address: optionalText(customer.address, 1000),
    };
}

export function normalizeCompanyPayload(company = {}) {
    const logo = optionalText(company.logo, 2 * 1024 * 1024);
    return {
        name: asText(company.name, 180) || "Mein Unternehmen",
        contact: optionalText(company.contact, 180),
        representedBy: optionalText(company.representedBy, 180),
        logo: logo && isAllowedDataImage(logo) ? logo : null,
        email: optionalText(company.email, 254),
        phone: optionalText(company.phone, 60),
        address: optionalText(company.address, 1000),
        taxId: optionalText(company.taxId, 120),
        bankName: optionalText(company.bankName, 180),
        bic: optionalText(company.bic, 40),
        accountHolder: optionalText(company.accountHolder, 180),
        iban: optionalText(company.iban, 80),
    };
}

export function normalizeOfferPayload(offer = {}, items = [], totals = null) {
    const company = normalizeCompanyPayload(offer.company || {});
    const customer = {
        id: optionalText(offer.customer?.id, 120),
        ...normalizeCustomerPayload(offer.customer || {}),
    };
    const legal = {
        paymentTerms: optionalText(offer.legal?.paymentTerms, 1000),
        validity: optionalText(offer.legal?.validity, 1000),
        jurisdiction: optionalText(offer.legal?.jurisdiction, 1000),
        footerLine: optionalText(offer.legal?.footerLine, 1000),
        closingText: optionalText(offer.legal?.closingText, 4000),
    };

    return {
        offer: {
            id: optionalText(offer.id, 120),
            number: asText(offer.number, 40),
            date: parseDate(offer.date),
            validUntil: parseDate(offer.validUntil),
            title: asText(offer.title, 180) || "Angebot",
            intro: optionalText(offer.intro, 4000),
            note: optionalText(offer.note, 2000),
            showItemDetails: offer.showItemDetails !== false,
            adjustmentType: toDbAdjustment(offer.adjustment?.type),
            adjustmentValue: Number(offer.adjustment?.value || 0),
            companySnapshot: company,
            customerSnapshot: customer,
            legalSnapshot: legal,
            totals: totals && typeof totals === "object" ? totals : null,
        },
        customer,
        company,
        items: Array.isArray(items)
            ? items.map((item, index) => ({
                  id: optionalText(item.id, 120),
                  sortOrder: index,
                  type: toDbItemType(item.type),
                  title: asText(item.title, 240) || "Leistung",
                  description: optionalText(item.description, 4000),
                  quantity: Number(item.quantity || 0),
                  unit: optionalText(item.unit, 80),
                  unitPrice: Number(item.unitPrice || 0),
                  taxRate: Number(item.taxRate || 0),
              }))
            : [],
    };
}

function offerSequence(number) {
    const match = /^ANG-(\d{4})-(\d{3,})$/.exec(number || "");
    return match ? Number(match[2]) : 0;
}

export async function nextOfferNumber(ownerId) {
    const year = new Date().getFullYear();
    const offers = await prisma.offer.findMany({
        where: { ownerId, number: { startsWith: `ANG-${year}-` } },
        select: { number: true },
    });
    const maxSequence = offers.reduce((max, offer) => Math.max(max, offerSequence(offer.number)), 0);
    return `ANG-${year}-${String(maxSequence + 1).padStart(3, "0")}`;
}

export async function resolveOfferCustomerId(ownerId, customer) {
    if (customer.id) {
        const existing = await prisma.offerCustomer.findFirst({
            where: { id: customer.id, ownerId },
            select: { id: true },
        });
        if (existing) return existing.id;
    }
    return null;
}
