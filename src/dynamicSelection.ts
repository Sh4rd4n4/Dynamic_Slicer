import powerbi from "powerbi-visuals-api";

type PrimitiveValue = powerbi.PrimitiveValue;

export type FallbackStrategy = "firstVisible" | "lastVisible" | "smallest" | "largest";

export interface DynamicSelectionInput {
    visibleValues: PrimitiveValue[];
    // Selection restored from the saved report or a bookmark (via jsonFilters).
    currentValue?: PrimitiveValue;
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

// Priority: saved/bookmarked selection if visible, then the preferred (Dynamic Selection)
// value if visible, then the fallback rule.
export function resolveDynamicSelection(input: DynamicSelectionInput): PrimitiveValue | undefined {
    if (input.visibleValues.length === 0) {
        return undefined;
    }

    const findVisible = (key: string) => input.visibleValues.find((value) => toValueKey(value) === key);

    if (input.currentValue !== undefined) {
        const current = findVisible(toValueKey(input.currentValue));

        if (current !== undefined) {
            return current;
        }
    }

    const preferred = findVisible(input.preferredValue);

    if (preferred !== undefined) {
        return preferred;
    }

    switch (input.fallback) {
        case "lastVisible":
            return input.visibleValues[input.visibleValues.length - 1];

        case "smallest":
            return [...input.visibleValues].sort(compareValues)[0];

        case "largest": {
            const sorted = [...input.visibleValues].sort(compareValues);

            return sorted[sorted.length - 1];
        }

        case "firstVisible":
        default:
            return input.visibleValues[0];
    }
}
