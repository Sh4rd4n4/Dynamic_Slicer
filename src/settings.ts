import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsModel = formattingSettings.Model;
import FormattingSettingsSlice = formattingSettings.Slice;

export const displayModeItems = [
    { displayName: "Dropdown", value: "dropdown" },
    { displayName: "List", value: "list" }
];

class SlicerCardSettings extends FormattingSettingsCard {
    displayMode = new formattingSettings.ItemDropdown({
        name: "displayMode",
        displayName: "Style",
        items: displayModeItems,
        value: displayModeItems[0]
    });

    showTitle = new formattingSettings.ToggleSwitch({
        name: "showTitle",
        displayName: "Show title",
        value: true
    });

    titleText = new formattingSettings.TextInput({
        name: "titleText",
        displayName: "Title text",
        placeholder: "Use field name",
        value: ""
    });

    name = "slicer";
    displayName = "Slicer";
    slices: FormattingSettingsSlice[] = [this.displayMode, this.showTitle, this.titleText];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    slicerCard = new SlicerCardSettings();

    cards = [this.slicerCard];
}
