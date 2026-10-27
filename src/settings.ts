import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCompositeCard = formattingSettings.CompositeCard;
import FormattingSettingsGroup = formattingSettings.Group;
import FormattingSettingsModel = formattingSettings.Model;

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

class SlicerCardSettings extends FormattingSettingsCompositeCard {
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

    fallback = new formattingSettings.ItemDropdown({
        name: "fallback",
        displayName: "Fallback when default is hidden",
        items: fallbackItems,
        value: fallbackItems[0]
    });

    // Selection options mirror the official slicer. Single select defaults to on (unlike
    // the official slicer) so reports built before multi-select keep their behaviour.
    singleSelect = new formattingSettings.ToggleSwitch({
        name: "singleSelect",
        displayName: "Single select",
        value: true
    });

    multiSelectWithCtrl = new formattingSettings.ToggleSwitch({
        name: "multiSelectWithCtrl",
        displayName: "Multi-select with CTRL",
        value: true
    });

    showSelectAll = new formattingSettings.ToggleSwitch({
        name: "showSelectAll",
        displayName: "Show \"All\" option",
        value: false
    });

    optionsGroup = new FormattingSettingsGroup({
        name: "options",
        displayName: "Options",
        slices: [this.displayMode, this.showHeader, this.headerText, this.fallback]
    });

    selectionGroup = new FormattingSettingsGroup({
        name: "selection",
        displayName: "Selection",
        slices: [this.singleSelect, this.multiSelectWithCtrl, this.showSelectAll]
    });

    name = "slicer";
    displayName = "Slicer";
    groups: FormattingSettingsGroup[] = [this.optionsGroup, this.selectionGroup];

    onPreProcess(): void {
        // As in the official slicer, these only apply when single select is off.
        this.multiSelectWithCtrl.visible = !this.singleSelect.value;
        this.showSelectAll.visible = !this.singleSelect.value;
    }
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    slicerCard = new SlicerCardSettings();

    cards = [this.slicerCard];
}
