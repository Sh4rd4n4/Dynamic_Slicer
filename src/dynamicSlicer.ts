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
import { resolveDynamicSelection } from "./dynamicSelection";

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

interface VisualViewModel {
    fieldColumn?: DataViewCategoryColumn;
    dynamicSelectionValues: string[];
    items: SlicerItem[];
    selectedValue?: powerbi.PrimitiveValue;
}

type DisplayMode = "dropdown" | "list";
const isDebugPanelEnabled = false;

interface DebugState {
    autoSelectedValue?: powerbi.PrimitiveValue;
    jsonFilters?: powerbi.IFilter[];
    viewModel: VisualViewModel;
}

const basicFilterSchema = ["ht", "tp://powerbi.com/product/schema#basic"].join(""); // Avoids lint issue with "http"
export class Visual implements IVisual {
    private readonly root: HTMLDivElement;
    private readonly formattingSettingsService: FormattingSettingsService;
    private readonly host: IVisualHost;
    private formattingSettings: VisualFormattingSettingsModel;
    private fieldColumn?: DataViewCategoryColumn;
    private selectedValue?: powerbi.PrimitiveValue;
    private hasUserInteracted: boolean;
    private filterTargetKey?: string;
    private preferredSelectionKey?: string;

    constructor(options?: VisualConstructorOptions) {
        if (!options) {
            throw new Error("Visual constructor options are required.");
        }

        this.formattingSettingsService = new FormattingSettingsService();
        this.formattingSettings = new VisualFormattingSettingsModel();
        this.host = options.host;
        this.hasUserInteracted = false;
        this.root = document.createElement("div");
        this.root.className = "dynamic-slicer";
        options.element.appendChild(this.root);
    }

    public update(options: VisualUpdateOptions): void {
        const dataView = options.dataViews?.[0];

        // Makes the dataview for the vidsual from power bi raw datamodel 
        const viewModel = this.getViewModel(dataView, options.jsonFilters);
        this.syncInteractionState(viewModel.fieldColumn, viewModel.dynamicSelectionValues[0]);
        const autoSelectedValue = this.resolveAutoSelectedValue(viewModel);
        const renderedItems = this.getRenderedItems(viewModel.items, autoSelectedValue ?? viewModel.selectedValue);
        this.fieldColumn = viewModel.fieldColumn;
        this.selectedValue = autoSelectedValue ?? viewModel.selectedValue;
        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
            VisualFormattingSettingsModel,
            dataView
        );
        this.clearElement(this.root);

        if (isDebugPanelEnabled) {
            this.root.appendChild(this.createDebugPanel({
                autoSelectedValue,
                jsonFilters: options.jsonFilters,
                viewModel
            }));
        }

        if (
            autoSelectedValue !== undefined
            && !this.areValuesEqual(autoSelectedValue, viewModel.selectedValue)
        ) {
            this.applyFilter(autoSelectedValue, false);
        }

        if (renderedItems.length === 0) {
            const emptyState = document.createElement("div");
            emptyState.className = "dynamic-slicer__empty";
            emptyState.append("Bind a field to ");

            const strong = document.createElement("strong");
            strong.textContent = "Field";
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
            control.appendChild(this.createList(renderedItems));
        } else {
            control.appendChild(this.createDropdown(renderedItems));
        }

        const clearButton = document.createElement("button");
        clearButton.className = "dynamic-slicer__clear";
        clearButton.type = "button";
        clearButton.title = "Clear selections";
        clearButton.setAttribute("aria-label", "Clear selections");
        clearButton.disabled = this.selectedValue === undefined;
        clearButton.addEventListener("click", () => this.clearFilter(true));

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

        const allButton = this.createListButton("All", this.selectedValue === undefined, () => this.clearFilter(true));
        list.appendChild(allButton);

        items.forEach((slicerItem) => {
            list.appendChild(this.createListButton(
                slicerItem.label,
                slicerItem.selected,
                () => this.applyFilter(slicerItem.value, true)
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

    private createDebugPanel(debugState: DebugState): HTMLElement {
        const panel = document.createElement("details");
        panel.className = "dynamic-slicer__debug";
        panel.open = true;

        const summary = document.createElement("summary");
        summary.textContent = "Debug";
        panel.appendChild(summary);

        const pre = document.createElement("pre");
        pre.textContent = JSON.stringify(this.getDebugPayload(debugState), null, 2);
        panel.appendChild(pre);

        return panel;
    }

    private getDebugPayload(debugState: DebugState): Record<string, unknown> {
        const fieldColumn = debugState.viewModel.fieldColumn;

        return {
            field: {
                displayName: fieldColumn?.source.displayName,
                queryName: fieldColumn?.source.queryName,
                filterTarget: this.getFilterTargetFromColumn(fieldColumn),
                valuesReceived: debugState.viewModel.items.map((item) => item.label)
            },
            dynamicSelection: {
                valuesReceived: debugState.viewModel.dynamicSelectionValues,
                firstPreferredValue: debugState.viewModel.dynamicSelectionValues[0]
            },
            filterState: {
                selectedValueFromJsonFilters: this.stringifyPrimitive(debugState.viewModel.selectedValue),
                autoSelectedValue: this.stringifyPrimitive(debugState.autoSelectedValue),
                hasUserInteracted: this.hasUserInteracted,
                filterTargetKey: this.filterTargetKey,
                preferredSelectionKey: this.preferredSelectionKey
            },
            jsonFilters: debugState.jsonFilters ?? []
        };
    }

    private handleIndexedSelection(index: string, items: SlicerItem[]): void {
        // In dropdown mode the empty option means "All", so clearing the filter
        // is the equivalent of selecting no specific value.
        if (index === "") {
            this.clearFilter(true);
            return;
        }

        const item = items[Number(index)];

        if (item) {
            this.applyFilter(item.value, true);
        }
    }

    private getViewModel(dataView?: DataView, jsonFilters?: powerbi.IFilter[]): VisualViewModel {
        // Resolve columns by role name instead of position so the code stays in
        // sync with capabilities.json even if more roles are added later.
        const fieldColumn = this.getCategoryColumnByRole(dataView, "field");
        const dynamicSelectionColumn = this.getCategoryColumnByRole(dataView, "dynamicSelection");
        const selectedValue = this.getSelectedValue(fieldColumn, jsonFilters);
        const items = this.getDistinctItems(fieldColumn?.values ?? [], selectedValue);

        return {
            fieldColumn,
            dynamicSelectionValues: this.getColumnValues(dynamicSelectionColumn),
            items,
            selectedValue
        };
    }

    private resolveAutoSelectedValue(viewModel: VisualViewModel): powerbi.PrimitiveValue | undefined {
        if (this.hasUserInteracted) {
            return undefined;
        }

        const preferredValue = viewModel.dynamicSelectionValues[0];

        if (!preferredValue) {
            return undefined;
        }

        const autoSelectedValue = resolveDynamicSelection({
            visibleValues: viewModel.items.map((item) => item.value),
            selectedValue: undefined,
            strategy: "preferredValue",
            preferredValue
        });

        if (autoSelectedValue === undefined) {
            return undefined;
        }

        return this.areValuesEqual(autoSelectedValue, viewModel.selectedValue)
            ? undefined
            : autoSelectedValue;
    }

    private getRenderedItems(
        items: SlicerItem[],
        selectedValue?: powerbi.PrimitiveValue
    ): SlicerItem[] {
        return items.map((item) => ({
            ...item,
            selected: this.areValuesEqual(item.value, selectedValue)
        }));
    }

    private applyFilter(value: powerbi.PrimitiveValue, isUserInteraction: boolean): void {
        // Power BI expects a JSON filter object that targets the bound field.
        const target = this.getFilterTarget();

        if (!target) {
            return;
        }

        if (isUserInteraction) {
            this.hasUserInteracted = true;
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

    private clearFilter(isUserInteraction: boolean): void {
        // Removing the filter is how the visual returns to the "All" state.
        if (isUserInteraction) {
            this.hasUserInteracted = true;
        }

        this.host.applyJsonFilter(null as unknown as powerbi.IFilter, "general", "filter", FilterAction.merge);
    }

    private getFilterTarget(): BasicFilter["target"] | undefined {
        return this.getFilterTargetFromColumn(this.fieldColumn);
    }

    private getSelectedValue(
        fieldColumn?: DataViewCategoryColumn,
        jsonFilters?: powerbi.IFilter[]
    ): powerbi.PrimitiveValue | undefined {
        // Power BI sends existing filter state back through jsonFilters, so this
        // method restores which item is currently selected when the visual rerenders.
        const target = this.getFilterTargetFromColumn(fieldColumn);

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

    private getFilterTargetFromColumn(fieldColumn?: DataViewCategoryColumn): BasicFilter["target"] | undefined {
        const queryName = fieldColumn?.source.queryName;

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

    private areValuesEqual(first: powerbi.PrimitiveValue, second?: powerbi.PrimitiveValue): boolean {
        return second !== undefined && String(first) === String(second);
    }

    private stringifyPrimitive(value?: powerbi.PrimitiveValue): string | undefined {
        return value === undefined ? undefined : String(value);
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

        return customTitle || this.fieldColumn?.source.displayName || "Field";
    }

    private getCategoryColumnByRole(dataView: DataView | undefined, roleName: string): DataViewCategoryColumn | undefined {
        const categories = dataView?.categorical?.categories;

        // Role matching is based on capabilities.json dataRoles names.
        return categories?.find((category) => this.hasRole(category, roleName));
    }

    private hasRole(categoryColumn: DataViewCategoryColumn | undefined, roleName: string): boolean {
        return Boolean(categoryColumn?.source.roles?.[roleName]);
    }

    private getColumnValues(column?: DataViewCategoryColumn): string[] {
        const uniqueValues = new Set<string>();

        (column?.values ?? []).forEach((value) => {
            const normalized = String(value).trim();

            if (normalized) {
                uniqueValues.add(normalized);
            }
        });

        return [...uniqueValues];
    }

    private getDistinctItems(
        values: powerbi.PrimitiveValue[],
        selectedValue?: powerbi.PrimitiveValue
    ): SlicerItem[] {
        const seenValues = new Set<string>();

        return values.reduce<SlicerItem[]>((items, value) => {
            const key = String(value);

            if (seenValues.has(key)) {
                return items;
            }

            seenValues.add(key);
            items.push({
                value,
                label: key,
                selected: this.areValuesEqual(value, selectedValue)
            });

            return items;
        }, []);
    }

    private syncInteractionState(fieldColumn?: DataViewCategoryColumn, preferredValue?: string): void {
        const nextTarget = this.getFilterTargetFromColumn(fieldColumn);
        const nextTargetKey = nextTarget ? `${nextTarget.table}.${nextTarget.column}` : undefined;
        const nextPreferredSelectionKey = preferredValue || undefined;

        if (
            this.filterTargetKey !== nextTargetKey
            || this.preferredSelectionKey !== nextPreferredSelectionKey
        ) {
            this.filterTargetKey = nextTargetKey;
            this.preferredSelectionKey = nextPreferredSelectionKey;
            this.hasUserInteracted = false;
        }
    }

    private clearElement(element: HTMLElement): void {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }
}
