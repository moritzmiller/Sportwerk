import { getBookingAccessWhere } from "./permissions.js";

export function normalizeCustomerEmail(value) {
    return String(value ?? "").trim().toLowerCase();
}

export function formatCustomerDisplayName(customer = {}) {
    if (customer.name) return customer.name;

    const email = normalizeCustomerEmail(customer.email);
    if (!email) return "Unbekannter Kontakt";

    return email.split("@")[0] || email;
}

function createCustomerBucket(email) {
    return {
        email,
        name: "",
        phone: "",
        bookingCount: 0,
        paidBookings: 0,
        openBookings: 0,
        totalTickets: 0,
        totalSpent: 0,
        firstBookingAt: null,
        lastBookingAt: null,
        lastEventTitle: null,
        lastEventDate: null,
        notes: [],
        tasks: [],
        latestBooking: null,
    };
}

export function buildCustomerSummaries(bookings = [], notes = [], tasks = []) {
    const buckets = new Map();

    for (const booking of bookings) {
        const email = normalizeCustomerEmail(booking.purchaserEmail);
        if (!email) continue;

        const current = buckets.get(email) ?? createCustomerBucket(email);
        const bookingDate = booking.createdAt ? new Date(booking.createdAt) : null;
        const eventDate = booking.event?.startDate ? new Date(booking.event.startDate) : null;
        const totalAmount = Number(booking.totalAmount || 0);
        const quantity = Math.max(1, Number(booking.quantity || 1));

        current.bookingCount += 1;
        current.totalTickets += quantity;
        current.totalSpent += totalAmount;
        current.name = current.name || booking.purchaserName || "";
        current.phone = current.phone || booking.purchaserPhone || "";

        if (booking.status === "PAID") {
            current.paidBookings += 1;
        } else {
            current.openBookings += 1;
        }

        if (!current.firstBookingAt || (bookingDate && bookingDate < current.firstBookingAt)) {
            current.firstBookingAt = bookingDate;
        }

        if (!current.lastBookingAt || (bookingDate && bookingDate > current.lastBookingAt)) {
            current.lastBookingAt = bookingDate;
            current.latestBooking = booking;
        }

        if (!current.lastEventDate || (eventDate && eventDate > current.lastEventDate)) {
            current.lastEventDate = eventDate;
            current.lastEventTitle = booking.event?.title ?? current.lastEventTitle;
        }

        buckets.set(email, current);
    }

    for (const note of notes) {
        const email = normalizeCustomerEmail(note.customerEmail);
        if (!email) continue;

        const bucket = buckets.get(email) ?? createCustomerBucket(email);
        bucket.notes.push(note);
        if (!bucket.lastBookingAt && note.createdAt) {
            bucket.lastBookingAt = new Date(note.createdAt);
        }
        buckets.set(email, bucket);
    }

    for (const task of tasks) {
        const email = normalizeCustomerEmail(task.customerEmail);
        if (!email) continue;

        const bucket = buckets.get(email) ?? createCustomerBucket(email);
        bucket.tasks.push(task);
        if (!bucket.lastBookingAt && task.createdAt) {
            bucket.lastBookingAt = new Date(task.createdAt);
        }
        buckets.set(email, bucket);
    }

    return [...buckets.values()]
        .map((bucket) => ({
            ...bucket,
            notesCount: bucket.notes.length,
            tasksCount: bucket.tasks.length,
            openTasksCount: bucket.tasks.filter((task) => !task.completedAt).length,
            completedTasksCount: bucket.tasks.filter((task) => Boolean(task.completedAt)).length,
            latestNoteAt: bucket.notes[0]?.createdAt ? new Date(bucket.notes[0].createdAt) : null,
            nextTaskDueAt:
                bucket.tasks
                    .filter((task) => !task.completedAt && task.dueAt)
                    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))[0]?.dueAt ?? null,
        }))
        .sort((a, b) => {
            const aDate = a.lastBookingAt ? new Date(a.lastBookingAt).getTime() : 0;
            const bDate = b.lastBookingAt ? new Date(b.lastBookingAt).getTime() : 0;
            return bDate - aDate;
        });
}

export function findCustomerSummary(customers, email) {
    const normalized = normalizeCustomerEmail(email);
    return customers.find((customer) => customer.email === normalized) ?? null;
}

export function getCrmCustomerBookingWhere(user, email) {
    const normalizedEmail = normalizeCustomerEmail(email);

    return {
        ...getBookingAccessWhere(user),
        purchaserEmail: {
            equals: normalizedEmail,
            mode: "insensitive",
        },
    };
}

export async function hasCrmCustomerAccess(prismaClient, user, email) {
    if (!user || user.role === "VISITOR") return false;

    const normalizedEmail = normalizeCustomerEmail(email);
    if (!normalizedEmail) return false;

    const booking = await prismaClient.booking.findFirst({
        where: getCrmCustomerBookingWhere(user, normalizedEmail),
        select: { id: true },
    });

    return Boolean(booking);
}
