import powerbi from "powerbi-visuals-api";

type PrimitiveValue = powerbi.PrimitiveValue;

export type DynamicSelectionStrategy =
    | "none"
    | "firstVisible"
    | "preferredValue"
    | "latestVisible";

export interface DynamicSelectionInput {
    visibleValues: PrimitiveValue[];
    selectedValue?: PrimitiveValue;
    strategy: DynamicSelectionStrategy;
    preferredValue?: string;
}

export function resolveDynamicSelection(input: DynamicSelectionInput): PrimitiveValue | undefined {
    if (input.selectedValue !== undefined) {
        return undefined;
    }

    if (input.visibleValues.length === 0) {
        return undefined;
    }

    switch (input.strategy) {
        case "none":
            return undefined;

        case "firstVisible":
            return input.visibleValues[0];

        case "preferredValue": {
            const match = input.visibleValues.find(
                (value) => String(value) === input.preferredValue
            );

            return match ?? input.visibleValues[0];
        }

        case "latestVisible": {
            const sorted = [...input.visibleValues].sort((a, b) =>
                String(a).localeCompare(String(b), undefined, { numeric: true })
            );

            return sorted[sorted.length - 1];
        }

        default:
            return undefined;
    }
}
