// Largest value a Postgres INTEGER (and so a SERIAL id) can hold
const MAX_INTEGER = 2147483647;

// True for an id Postgres will accept as INTEGER: a whole number from 1 up, sent as a number or digits.
// Number() alone lets "", "  ", "1e3" and true through, and those made Postgres throw (500).
export const isValidId = (value: unknown): boolean => {
    const id = typeof value === "number" ? value
        : typeof value === "string" && /^\d+$/.test(value) ? Number(value)
        : NaN;
    return Number.isInteger(id) && id >= 1 && id <= MAX_INTEGER;
}
