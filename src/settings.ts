import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsModel = formattingSettings.Model;
import FormattingSettingsSlice = formattingSettings.Slice;

export const displayModeItems = [
    { displayName: "Dropdown", value: "dropdown" },
    { displayName: "List", value: "list" },
    { displayName: "Tiles", value: "tiles" }
];

export const fallbackItems = [
    { displayName: "First in list", value: "firstVisible" },
    { displayName: "Last in list", value: "lastVisible" },
    { displayName: "Smallest value", value: "smallest" },
    { displayName: "Largest value", value: "largest" }
];

// Labels the smallest / largest rules for the bound field's data type.
export function getFallbackItems(fieldType?: powerbi.ValueTypeDescriptor): powerbi.IEnumMember[] {
    let smallest = "First alphabetically";
    let largest = "Last alphabetically";

    if (fieldType?.dateTime) {
        smallest = "Earliest date";
        largest = "Latest date";
    } else if (fieldType?.numeric || fieldType?.integer) {
        smallest = "Smallest value";
        largest = "Largest value";
    }

    return [
        fallbackItems[0],
        fallbackItems[1],
        { displayName: smallest, value: "smallest" },
        { displayName: largest, value: "largest" }
    ];
}

class SlicerCardSettings extends FormattingSettingsCard {
    displayMode = new formattingSettings.ItemDropdown({
        name: "displayMode",
        displayName: "Style",
        items: displayModeItems,
        value: displayModeItems[0]
    });

    showHeader = new formattingSettings.ToggleSwitch({
        name: "showTitle",
        displayName: "Show slicer header",
        value: true
    });

    headerText = new formattingSettings.TextInput({
        name: "titleText",
        displayName: "Slicer header",
        placeholder: "Use field name",
        value: ""
    });

    showSelectAll = new formattingSettings.ToggleSwitch({
        name: "showSelectAll",
        displayName: "Show \"All\" option",
        value: true
    });

    fallback = new formattingSettings.ItemDropdown({
        name: "fallback",
        displayName: "Fallback when default is hidden",
        items: fallbackItems,
        value: fallbackItems[0]
    });

    name = "slicer";
    displayName = "Slicer";
    slices: FormattingSettingsSlice[] = [
        this.displayMode,
        this.showHeader,
        this.headerText,
        this.showSelectAll,
        this.fallback
    ];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    slicerCard = new SlicerCardSettings();

    cards = [this.slicerCard];
}
