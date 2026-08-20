// Zentrale Kategorie-Definitionen (Labels, Farben, Emojis).
// Werte müssen mit dem Prisma-Enum "Category" übereinstimmen.
export const CATEGORIES = [
    { value: "KONZERT", label: "Konzert", emoji: "🎵", color: "var(--cat-konzert)" },
    { value: "PARTY", label: "Party", emoji: "🎉", color: "var(--cat-party)" },
    { value: "KULTUR", label: "Kultur", emoji: "🎭", color: "var(--cat-kultur)" },
    { value: "SPORT", label: "Sport", emoji: "⚽", color: "var(--cat-sport)" },
    { value: "FAMILIE", label: "Familie", emoji: "👨‍👩‍👧", color: "var(--cat-familie)" },
    { value: "WORKSHOP", label: "Workshop", emoji: "🛠️", color: "var(--cat-workshop)" },
    { value: "MARKT", label: "Markt", emoji: "🛍️", color: "var(--cat-markt)" },
    { value: "SONSTIGES", label: "Sonstiges", emoji: "✨", color: "var(--cat-sonstiges)" },
];

export const CATEGORY_MAP = Object.fromEntries(
    CATEGORIES.map((c) => [c.value, c])
);

export function getCategory(value) {
    return CATEGORY_MAP[value] ?? CATEGORY_MAP.SONSTIGES;
}
