import powerbi from "powerbi-visuals-api";

type PrimitiveValue = powerbi.PrimitiveValue;

export type FallbackStrategy = "firstVisible" | "latestVisible";

export interface DynamicSelectionInput {
    visibleValues: PrimitiveValue[];
    preferredValue: string;
    fallback: FallbackStrategy;
}

const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

function pad(value: number): string {
    return String(value).padStart(2, "0");
}

function getDateKey(date: Date): string {
    // Local components, so a date at local midnight doesn't shift a day when converted to UTC.
    const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

    if (date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0) {
        return day;
    }

    return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Normalizes values so the same value compares equal whether it arrives as a Date,
// a number, or a string (e.g. from the Dynamic Selection column or from jsonFilters).
export function toValueKey(value: PrimitiveValue | undefined): string {
    if (value === undefined || value === null) {
        return "";
    }

    if (value instanceof Date) {
        return getDateKey(value);
    }

    if (typeof value === "string") {
        const trimmed = value.trim();

        // Dates restored from jsonFilters come back as serialized ISO timestamps.
        if (isoTimestampPattern.test(trimmed)) {
            const parsed = new Date(trimmed);

            if (!isNaN(parsed.getTime())) {
                return getDateKey(parsed);
            }
        }

        return trimmed;
    }

    return String(value);
}

function compareValues(a: PrimitiveValue, b: PrimitiveValue): number {
    if (typeof a === "number" && typeof b === "number") {
        return a - b;
    }

    if (a instanceof Date && b instanceof Date) {
        return a.getTime() - b.getTime();
    }

    return toValueKey(a).localeCompare(toValueKey(b), undefined, { numeric: true });
}

export function resolveDynamicSelection(input: DynamicSelectionInput): PrimitiveValue | undefined {
    if (input.visibleValues.length === 0) {
        return undefined;
    }

    const match = input.visibleValues.find(
        (value) => toValueKey(value) === input.preferredValue
    );

    if (match !== undefined) {
        return match;
    }

    switch (input.fallback) {
        case "latestVisible": {
            const sorted = [...input.visibleValues].sort(compareValues);

            return sorted[sorted.length - 1];
        }

        case "firstVisible":
        default:
            return input.visibleValues[0];
    }
}
