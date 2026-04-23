import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";

import "../style/visual.less";

import DataView = powerbi.DataView;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import FilterAction = powerbi.FilterAction;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

import { VisualFormattingSettingsModel } from "./settings";

interface BasicFilter extends powerbi.IFilter {
    $schema: string;
    target: {
        table: string;
        column: string;
    };
    operator: "In";
    values: powerbi.PrimitiveValue[];
    filterType: 1;
}

interface SlicerItem {
    value: powerbi.PrimitiveValue;
    label: string;
    selected: boolean;
}

type DisplayMode = "dropdown" | "list";

const basicFilterSchema = ["ht", "tp://powerbi.com/product/schema#basic"].join("");

export class Visual implements IVisual {
    private readonly root: HTMLDivElement;
    private readonly formattingSettingsService: FormattingSettingsService;
    private readonly host: IVisualHost;
    private formattingSettings: VisualFormattingSettingsModel;
    private categoryColumn?: DataViewCategoryColumn;
    private selectedValue?: powerbi.PrimitiveValue;

    constructor(options?: VisualConstructorOptions) {
        if (!options) {
            throw new Error("Visual constructor options are required.");
        }

        this.formattingSettingsService = new FormattingSettingsService();
        this.formattingSettings = new VisualFormattingSettingsModel();
        this.host = options.host;
        this.root = document.createElement("div");
        this.root.className = "dynamic-slicer";
        options.element.appendChild(this.root);
    }

    public update(options: VisualUpdateOptions): void {
        const dataView = options.dataViews?.[0];
        this.categoryColumn = dataView?.categorical?.categories?.[0];
        const items = this.getSlicerItems(dataView, options.jsonFilters);
        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
            VisualFormattingSettingsModel,
            dataView
        );
        this.clearElement(this.root);

        if (items.length === 0) {
            const emptyState = document.createElement("div");
            emptyState.className = "dynamic-slicer__empty";
            emptyState.append("Bind a field to ");

            const strong = document.createElement("strong");
            strong.textContent = "Category";
            emptyState.appendChild(strong);
            emptyState.append(" to start inspecting slicer behavior.");

            this.root.appendChild(emptyState);
            return;
        }

        const control = document.createElement("div");
        control.className = "dynamic-slicer__control";

        if (this.formattingSettings.slicerCard.showTitle.value) {
            const title = document.createElement("div");
            title.className = "dynamic-slicer__title";
            title.textContent = this.getTitleText();
            control.appendChild(title);
        }

        if (this.getDisplayMode() === "list") {
            control.appendChild(this.createList(items));
        } else {
            control.appendChild(this.createDropdown(items));
        }

        const clearButton = document.createElement("button");
        clearButton.className = "dynamic-slicer__clear";
        clearButton.type = "button";
        clearButton.title = "Clear selections";
        clearButton.setAttribute("aria-label", "Clear selections");
        clearButton.disabled = this.selectedValue === undefined;
        clearButton.addEventListener("click", () => this.clearFilter());

        this.root.appendChild(control);
        this.root.appendChild(clearButton);
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    private createDropdown(items: SlicerItem[]): HTMLElement {
        const selectWrapper = document.createElement("div");
        selectWrapper.className = "dynamic-slicer__select-wrapper";

        const select = document.createElement("select");
        select.className = "dynamic-slicer__select";
        select.value = this.getSelectedItemIndex(items);
        select.setAttribute("aria-label", this.getTitleText());
        select.addEventListener("change", () => this.handleIndexedSelection(select.value, items));

        const allOption = document.createElement("option");
        allOption.value = "";
        allOption.textContent = "All";
        allOption.selected = this.selectedValue === undefined;
        select.appendChild(allOption);

        items.forEach((slicerItem, index) => {
            const option = document.createElement("option");
            option.value = String(index);
            option.textContent = slicerItem.label;
            option.selected = slicerItem.selected;
            select.appendChild(option);
        });

        selectWrapper.appendChild(select);

        return selectWrapper;
    }

    private createList(items: SlicerItem[]): HTMLElement {
        const list = document.createElement("div");
        list.className = "dynamic-slicer__list";
        list.setAttribute("role", "listbox");
        list.setAttribute("aria-label", this.getTitleText());

        const allButton = this.createListButton("All", this.selectedValue === undefined, () => this.clearFilter());
        list.appendChild(allButton);

        items.forEach((slicerItem) => {
            list.appendChild(this.createListButton(
                slicerItem.label,
                slicerItem.selected,
                () => this.applyFilter(slicerItem.value)
            ));
        });

        return list;
    }

    private createListButton(label: string, selected: boolean, onClick: () => void): HTMLButtonElement {
        const button = document.createElement("button");
        button.className = selected
            ? "dynamic-slicer__list-item dynamic-slicer__list-item--selected"
            : "dynamic-slicer__list-item";
        button.type = "button";
        button.textContent = label;
        button.setAttribute("aria-selected", String(selected));
        button.addEventListener("click", onClick);

        return button;
    }

    private handleIndexedSelection(index: string, items: SlicerItem[]): void {
        if (index === "") {
            this.clearFilter();
            return;
        }

        const item = items[Number(index)];

        if (item) {
            this.applyFilter(item.value);
        }
    }

    private getSlicerItems(dataView?: DataView, jsonFilters?: powerbi.IFilter[]): SlicerItem[] {
        const categoryColumn = dataView?.categorical?.categories?.[0];
        const values = categoryColumn?.values ?? [];
        this.selectedValue = this.getSelectedValue(jsonFilters);

        return values.map((value) => ({
            value,
            label: String(value),
            selected: this.areValuesEqual(value, this.selectedValue)
        }));
    }

    private applyFilter(value: powerbi.PrimitiveValue): void {
        const target = this.getFilterTarget();

        if (!target) {
            return;
        }

        const filter: BasicFilter = {
            $schema: basicFilterSchema,
            target,
            operator: "In",
            values: [value],
            filterType: 1
        };

        this.host.applyJsonFilter(filter, "general", "filter", FilterAction.merge);
    }

    private clearFilter(): void {
        this.host.applyJsonFilter(null as unknown as powerbi.IFilter, "general", "filter", FilterAction.remove);
    }

    private getFilterTarget(): BasicFilter["target"] | undefined {
        const queryName = this.categoryColumn?.source.queryName;

        if (!queryName) {
            return undefined;
        }

        const separatorIndex = queryName.lastIndexOf(".");

        if (separatorIndex < 1 || separatorIndex === queryName.length - 1) {
            return undefined;
        }

        return {
            table: queryName.slice(0, separatorIndex),
            column: queryName.slice(separatorIndex + 1)
        };
    }

    private getSelectedValue(jsonFilters?: powerbi.IFilter[]): powerbi.PrimitiveValue | undefined {
        const target = this.getFilterTarget();

        if (!target || !jsonFilters) {
            return undefined;
        }

        const matchingFilter = jsonFilters.find((filter) => {
            const candidate = filter as BasicFilter;

            return candidate.operator === "In"
                && candidate.target?.table === target.table
                && candidate.target?.column === target.column
                && Array.isArray(candidate.values)
                && candidate.values.length > 0;
        }) as BasicFilter | undefined;

        return matchingFilter?.values[0];
    }

    private areValuesEqual(first: powerbi.PrimitiveValue, second?: powerbi.PrimitiveValue): boolean {
        return second !== undefined && String(first) === String(second);
    }

    private getSelectedItemIndex(items: SlicerItem[]): string {
        const selectedIndex = items.findIndex((item) => item.selected);

        return selectedIndex >= 0 ? String(selectedIndex) : "";
    }

    private getDisplayMode(): DisplayMode {
        const value = this.formattingSettings.slicerCard.displayMode.value;
        const displayMode = typeof value === "object" ? value.value : value;

        return displayMode === "list" ? "list" : "dropdown";
    }

    private getTitleText(): string {
        const customTitle = this.formattingSettings.slicerCard.titleText.value.trim();

        return customTitle || this.categoryColumn?.source.displayName || "Category";
    }

    private clearElement(element: HTMLElement): void {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }
}
