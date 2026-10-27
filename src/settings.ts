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

export const borderPositionItems = [
    { displayName: "None", value: "none" },
    { displayName: "Bottom only", value: "bottom" },
    { displayName: "Top only", value: "top" },
    { displayName: "Top and bottom", value: "topBottom" },
    { displayName: "Left only", value: "left" },
    { displayName: "Right only", value: "right" },
    { displayName: "Frame", value: "frame" }
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

function createFont(fontSize: number, bold: boolean): formattingSettings.FontControl {
    return new formattingSettings.FontControl({
        name: "font",
        displayName: "Font",
        fontFamily: new formattingSettings.FontPicker({
            name: "fontFamily",
            value: "Segoe UI, wf_segoe-ui_normal, helvetica, arial, sans-serif"
        }),
        fontSize: new formattingSettings.NumUpDown({ name: "fontSize", value: fontSize }),
        bold: new formattingSettings.ToggleSwitch({ name: "bold", value: bold }),
        italic: new formattingSettings.ToggleSwitch({ name: "italic", value: false }),
        underline: new formattingSettings.ToggleSwitch({ name: "underline", value: false })
    });
}

// Colours default to empty; the visual fills in theme colours for anything not set
// (see Visual.applyThemeDefaults), so reports follow the report theme until overridden.
function createColor(name: string, displayName: string, isNoFillItemSupported = false): formattingSettings.ColorPicker {
    return new formattingSettings.ColorPicker({
        name,
        displayName,
        value: { value: "" },
        isNoFillItemSupported
    });
}

function createBorderPosition(value: string): formattingSettings.ItemDropdown {
    const item = borderPositionItems.find((position) => position.value === value) ?? borderPositionItems[0];

    return new formattingSettings.ItemDropdown({
        name: "borderPosition",
        displayName: "Position",
        items: borderPositionItems,
        value: item
    });
}

function createBorderWidth(): formattingSettings.NumUpDown {
    return new formattingSettings.NumUpDown({
        name: "borderWidth",
        displayName: "Width",
        value: 1,
        options: {
            minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
            maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 10 }
        }
    });
}

function createPadding(name: string, displayName: string, value: number): formattingSettings.NumUpDown {
    return new formattingSettings.NumUpDown({
        name,
        displayName,
        value,
        options: {
            minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
            maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 40 }
        }
    });
}

class SlicerSettingsCard extends FormattingSettingsCompositeCard {
    displayMode = new formattingSettings.ItemDropdown({
        name: "displayMode",
        displayName: "Style",
        items: displayModeItems,
        value: displayModeItems[0]
    });

    // The official slicer offers search through its "..." menu, which custom visuals
    // can't extend, so it is a format option here.
    search = new formattingSettings.ToggleSwitch({
        name: "search",
        displayName: "Search",
        value: false
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

    fallback = new formattingSettings.ItemDropdown({
        name: "fallback",
        displayName: "Fallback when default is hidden",
        items: fallbackItems,
        value: fallbackItems[0]
    });

    optionsGroup = new FormattingSettingsGroup({
        name: "options",
        displayName: "Options",
        slices: [this.displayMode, this.search]
    });

    selectionGroup = new FormattingSettingsGroup({
        name: "selection",
        displayName: "Selection",
        slices: [this.singleSelect, this.multiSelectWithCtrl, this.showSelectAll]
    });

    dynamicSelectionGroup = new FormattingSettingsGroup({
        name: "dynamicSelection",
        displayName: "Dynamic selection",
        slices: [this.fallback]
    });

    name = "slicer";
    displayName = "Slicer settings";
    groups: FormattingSettingsGroup[] = [this.optionsGroup, this.selectionGroup, this.dynamicSelectionGroup];

    onPreProcess(): void {
        // As in the official slicer, these only apply when single select is off.
        this.multiSelectWithCtrl.visible = !this.singleSelect.value;
        this.showSelectAll.visible = !this.singleSelect.value;
    }
}

class HeaderCard extends FormattingSettingsCompositeCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Slicer header",
        value: true
    });

    text = new formattingSettings.TextInput({
        name: "text",
        displayName: "Title text",
        placeholder: "Use field name",
        value: ""
    });

    font = createFont(10, false);
    fontColor = createColor("fontColor", "Font color");
    background = createColor("background", "Background", true);
    borderPosition = createBorderPosition("none");
    borderColor = createColor("borderColor", "Color");
    borderWidth = createBorderWidth();
    paddingBottom = createPadding("paddingBottom", "Space below", 4);

    textGroup = new FormattingSettingsGroup({
        name: "headerText",
        displayName: "Text",
        slices: [this.text, this.font, this.fontColor, this.background]
    });

    borderGroup = new FormattingSettingsGroup({
        name: "headerBorder",
        displayName: "Border",
        slices: [this.borderPosition, this.borderColor, this.borderWidth]
    });

    spacingGroup = new FormattingSettingsGroup({
        name: "headerSpacing",
        displayName: "Spacing",
        slices: [this.paddingBottom]
    });

    topLevelSlice = this.show;
    name = "header";
    displayName = "Slicer header";
    groups: FormattingSettingsGroup[] = [this.textGroup, this.borderGroup, this.spacingGroup];
}

class ValuesCard extends FormattingSettingsCompositeCard {
    font = createFont(10, false);
    fontColor = createColor("fontColor", "Font color");
    background = createColor("background", "Background", true);
    selectedColor = createColor("selectedColor", "Selection color");
    borderPosition = createBorderPosition("frame");
    borderColor = createColor("borderColor", "Color");
    borderWidth = createBorderWidth();
    paddingLeft = createPadding("paddingLeft", "Left padding", 6);

    textGroup = new FormattingSettingsGroup({
        name: "valuesText",
        displayName: "Values",
        slices: [this.font, this.fontColor, this.background, this.selectedColor]
    });

    borderGroup = new FormattingSettingsGroup({
        name: "valuesBorder",
        displayName: "Border",
        slices: [this.borderPosition, this.borderColor, this.borderWidth]
    });

    spacingGroup = new FormattingSettingsGroup({
        name: "valuesSpacing",
        displayName: "Spacing",
        slices: [this.paddingLeft]
    });

    name = "items";
    displayName = "Values";
    groups: FormattingSettingsGroup[] = [this.textGroup, this.borderGroup, this.spacingGroup];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    slicerCard = new SlicerSettingsCard();
    headerCard = new HeaderCard();
    valuesCard = new ValuesCard();

    cards = [this.slicerCard, this.headerCard, this.valuesCard];
}
