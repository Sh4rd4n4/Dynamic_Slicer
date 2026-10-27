import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";

import "../style/visual.less";

import DataView = powerbi.DataView;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import FilterAction = powerbi.FilterAction;
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ITooltipService = powerbi.extensibility.ITooltipService;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";

import { VisualFormattingSettingsModel, getFallbackItems } from "./settings";
import { FallbackStrategy, resolveDynamicSelection, toValueKey } from "./dynamicSelection";

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
    hasDynamicSelection: boolean;
    dynamicSelectionValues: string[];
    items: SlicerItem[];
    selectedValues: powerbi.PrimitiveValue[];
}

type DisplayMode = "dropdown" | "list" | "tiles";
const isDebugPanelEnabled = false;

interface DebugState {
    autoSelectedValues?: powerbi.PrimitiveValue[];
    jsonFilters?: powerbi.IFilter[];
    viewModel: VisualViewModel;
}

const fluentEraserPath = "M11.197 2.43934C11.7828 1.85355 12.7326 1.85355 13.3184 2.43934L17.561 6.68198C18.1468 7.26777 18.1468 8.21751 17.561 8.8033L9.36408 17.0002H14.5001C14.7763 17.0002 15.0001 17.2241 15.0001 17.5002C15.0001 17.7764 14.7763 18.0002 14.5001 18.0002H7.81974C7.40996 18.0217 6.99303 17.876 6.68003 17.5629L2.43739 13.3203C1.8516 12.7345 1.8516 11.7848 2.43739 11.199L11.197 2.43934ZM12.6112 3.14645C12.416 2.95118 12.0994 2.95118 11.9041 3.14645L5.53846 9.51212L10.4882 14.4619L16.8539 8.09619C17.0491 7.90093 17.0491 7.58435 16.8539 7.38909L12.6112 3.14645ZM9.7811 15.169L4.83135 10.2192L3.14449 11.9061C2.94923 12.1014 2.94923 12.4179 3.14449 12.6132L7.38713 16.8558C7.5824 17.0511 7.89898 17.0511 8.09424 16.8558L9.7811 15.169Z";
const basicFilterSchema = ["ht", "tp://powerbi.com/product/schema#basic"].join(""); // Avoids lint issue with "http"
export class Visual implements IVisual {
    private readonly root: HTMLDivElement;
    private readonly formattingSettingsService: FormattingSettingsService;
    private readonly host: IVisualHost;
    private readonly selectionManager: ISelectionManager;
    private readonly tooltipService: ITooltipService;
    private readonly eventService: IVisualEventService;
    private readonly colorPalette: ISandboxExtendedColorPalette;
    private formattingSettings: VisualFormattingSettingsModel;
    private fieldColumn?: DataViewCategoryColumn;
    private selectedValues: powerbi.PrimitiveValue[];
    private hasUserInteracted: boolean;
    private isDropdownOpen: boolean;
    private filterTargetKey?: string;
    private preferredSelectionKey?: string;
    private isLoadingMoreData: boolean;
    private searchText: string;
    private lastPointerType: string;
    private orphanedFilterKey?: string;

    constructor(options?: VisualConstructorOptions) {
        if (!options) {
            throw new Error("Visual constructor options are required.");
        }

        this.host = options.host;
        this.selectionManager = this.host.createSelectionManager();
        this.tooltipService = this.host.tooltipService;
        this.eventService = this.host.eventService;
        this.colorPalette = this.host.colorPalette;
        this.formattingSettingsService = new FormattingSettingsService(this.host.createLocalizationManager());
        this.formattingSettings = new VisualFormattingSettingsModel();
        this.selectedValues = [];
        this.hasUserInteracted = false;
        this.isDropdownOpen = false;
        this.isLoadingMoreData = false;
        this.searchText = "";
        this.lastPointerType = "";
        this.root = document.createElement("div");
        this.root.className = "dynamic-slicer";
        this.applyHostTheme();
        this.selectionManager.registerOnSelectCallback(() => {
            // Bookmark and slicer filter state is restored through jsonFilters on update.
        });
        this.root.addEventListener("contextmenu", (event) => this.showContextMenu(event));
        // Remembered so item clicks can tell taps from mouse clicks (see onItemClick).
        this.root.addEventListener("pointerdown", (event) => {
            this.lastPointerType = event.pointerType;
        });
        this.trackHover(options.element);
        options.element.appendChild(this.root);
    }

    public update(options: VisualUpdateOptions): void {
        this.eventService.renderingStarted(options);

        try {
            this.render(options);
            this.eventService.renderingFinished(options);
        } catch (error) {
            this.eventService.renderingFailed(options, error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    private render(options: VisualUpdateOptions): void {
        const dataView = options.dataViews?.[0];

        // Makes the dataview for the vidsual from power bi raw datamodel 
        const viewModel = this.getViewModel(dataView, options.jsonFilters);
        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
            VisualFormattingSettingsModel,
            dataView
        );
        this.applyLegacySettings(dataView);
        this.applyThemeDefaults(dataView);
        this.updateFallbackSetting(viewModel);
        this.syncInteractionState(viewModel.fieldColumn, viewModel.dynamicSelectionValues[0]);
        this.requestMoreData(options, dataView);
        // Wait for all rows before auto-selecting, otherwise a default value that sits in a
        // later segment would look hidden and trigger the fallback.
        const autoSelectedValues = this.isLoadingMoreData ? undefined : this.resolveAutoSelectedValues(viewModel);
        const selectedValues = autoSelectedValues ?? viewModel.selectedValues;
        const renderedItems = this.getRenderedItems(viewModel.items, selectedValues);
        this.fieldColumn = viewModel.fieldColumn;
        this.selectedValues = selectedValues;
        this.applyHostTheme();
        this.clearElement(this.root);

        if (isDebugPanelEnabled) {
            this.root.appendChild(this.createDebugPanel({
                autoSelectedValues,
                jsonFilters: options.jsonFilters,
                viewModel
            }));
        }

        if (autoSelectedValues) {
            this.applyFilter(autoSelectedValues, false);
        } else if (options.type & powerbi.VisualUpdateType.Data) {
            this.clearOrphanedFilter(viewModel.fieldColumn, options.jsonFilters);
        }

        // Only show the placeholder when no field is bound. A bound field with no
        // visible values (e.g. everything hidden by RLS) still renders an empty slicer.
        if (!viewModel.fieldColumn) {
            this.root.appendChild(this.createPlaceholder());
            return;
        }

        const control = document.createElement("div");
        control.className = "dynamic-slicer__control";

        if (this.formattingSettings.headerCard.show.value) {
            const header = document.createElement("div");
            header.className = "dynamic-slicer__header";
            header.textContent = this.getHeaderText();
            control.appendChild(header);
        }

        const displayMode = this.getDisplayMode();

        if (displayMode === "dropdown") {
            control.appendChild(this.createDropdown(renderedItems));
        } else {
            if (this.isSearchEnabled()) {
                control.appendChild(this.createSearchBox(control));
            }

            control.appendChild(this.createList(renderedItems, displayMode === "tiles"));
        }

        this.filterItems(control);
        this.root.appendChild(control);
        this.fitDropdownList();

        // Single select always keeps one value, so there is nothing to clear.
        if (!this.isSingleSelect()) {
            const clearButton = document.createElement("button");
            clearButton.className = "dynamic-slicer__clear";
            clearButton.appendChild(this.createEraserIcon());
            clearButton.type = "button";
            clearButton.title = "Clear selections";
            clearButton.setAttribute("aria-label", "Clear selections");
            clearButton.disabled = this.selectedValues.length === 0;
            clearButton.addEventListener("click", () => this.clearFilter(true));
            this.addTooltip(clearButton, "Clear selections");
            this.root.appendChild(clearButton);
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    private createDropdown(items: SlicerItem[]): HTMLElement {
        const selectWrapper = document.createElement("div");
        selectWrapper.className = "dynamic-slicer__select-wrapper";

        const toggle = document.createElement("button");
        toggle.className = "dynamic-slicer__select";
        toggle.type = "button";
        toggle.textContent = this.getSelectedItemLabel(items);
        toggle.setAttribute("aria-label", this.getHeaderText());
        toggle.setAttribute("aria-haspopup", "listbox");

        const list = document.createElement("div");
        list.className = "dynamic-slicer__dropdown-list";
        list.setAttribute("role", "listbox");
        list.setAttribute("aria-label", this.getHeaderText());
        list.setAttribute("aria-multiselectable", String(!this.isSingleSelect()));

        if (this.isSearchEnabled()) {
            list.appendChild(this.createSearchBox(list));
        }

        this.appendItems(list, items);

        const closeDropdown = () => {
            this.setDropdownOpen(selectWrapper, toggle, false);
            document.removeEventListener("click", closeDropdown);
        };

        // The DOM is rebuilt on every update, so the open state is kept on the visual.
        // This keeps the dropdown open while picking several values in multi-select.
        this.setDropdownOpen(selectWrapper, toggle, this.isDropdownOpen);

        if (this.isDropdownOpen) {
            document.addEventListener("click", closeDropdown);
        }

        toggle.addEventListener("click", () => {
            const isOpen = !this.isDropdownOpen;

            this.setDropdownOpen(selectWrapper, toggle, isOpen);

            if (isOpen) {
                document.addEventListener("click", closeDropdown);
            } else {
                document.removeEventListener("click", closeDropdown);
            }
        });

        selectWrapper.addEventListener("click", (event) => event.stopPropagation());
        selectWrapper.appendChild(toggle);
        selectWrapper.appendChild(list);

        return selectWrapper;
    }

    private setDropdownOpen(selectWrapper: HTMLElement, toggle: HTMLElement, isOpen: boolean): void {
        this.isDropdownOpen = isOpen;
        selectWrapper.classList.toggle("dynamic-slicer__select-wrapper--open", isOpen);
        toggle.setAttribute("aria-expanded", String(isOpen));
        this.fitDropdownList();
    }

    private fitDropdownList(): void {
        // Custom visuals live in an iframe the size of the visual, so the list can't
        // overflow onto the report like the official slicer's. Fit it to the space left
        // below the box instead, so it scrolls rather than being cut off.
        const list = this.root.querySelector<HTMLElement>(".dynamic-slicer__select-wrapper--open .dynamic-slicer__dropdown-list");

        if (!list) {
            return;
        }

        const available = this.root.getBoundingClientRect().bottom - list.getBoundingClientRect().top - 2;

        list.style.maxHeight = `${Math.max(24, Math.min(200, available))}px`;
    }

    private createList(items: SlicerItem[], asTiles: boolean): HTMLElement {
        const list = document.createElement("div");
        list.className = asTiles
            ? "dynamic-slicer__list dynamic-slicer__list--tiles"
            : "dynamic-slicer__list";
        list.setAttribute("role", "listbox");
        list.setAttribute("aria-label", this.getHeaderText());
        list.setAttribute("aria-multiselectable", String(!this.isSingleSelect()));
        this.appendItems(list, items);

        return list;
    }

    private appendItems(list: HTMLElement, items: SlicerItem[]): void {
        if (this.isSelectAllShown()) {
            list.appendChild(this.createListButton("All", this.selectedValues.length === 0, () => this.clearFilter(true)));
        }

        items.forEach((slicerItem) => {
            const button = this.createListButton(
                slicerItem.label,
                slicerItem.selected,
                (event) => this.onItemClick(slicerItem.value, event)
            );

            button.dataset.searchLabel = slicerItem.label.toLowerCase();
            list.appendChild(button);
        });
    }

    private onItemClick(value: powerbi.PrimitiveValue, event: MouseEvent): void {
        if (this.isSingleSelect()) {
            // Close right away: re-selecting the current value triggers no update/re-render.
            this.isDropdownOpen = false;
            this.root.querySelector(".dynamic-slicer__select-wrapper--open")
                ?.classList.remove("dynamic-slicer__select-wrapper--open");
            this.applyFilter([value], true);
            return;
        }

        // Same rules as the official slicer: with "Multi-select with CTRL" a plain click
        // replaces the selection and Ctrl + click adds / removes; without it every click
        // adds / removes.
        const isSelected = this.selectedValues.some((selected) => this.areValuesEqual(selected, value));
        // Touch devices have no Ctrl key, so taps always add / remove.
        const isToggleClick = !this.formattingSettings.slicerCard.multiSelectWithCtrl.value
            || event.ctrlKey
            || event.metaKey
            || this.lastPointerType === "touch";
        let nextValues: powerbi.PrimitiveValue[];

        if (isToggleClick) {
            nextValues = isSelected
                ? this.selectedValues.filter((selected) => !this.areValuesEqual(selected, value))
                : [...this.selectedValues, value];
        } else {
            nextValues = isSelected && this.selectedValues.length === 1 ? [] : [value];
        }

        if (nextValues.length === 0) {
            this.clearFilter(true);
        } else {
            this.applyFilter(nextValues, true);
        }
    }

    private createSearchBox(scope: HTMLElement): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.className = "dynamic-slicer__search";

        const input = document.createElement("input");
        input.className = "dynamic-slicer__search-input";
        input.type = "search";
        input.placeholder = "Search";
        input.setAttribute("aria-label", "Search");
        input.value = this.searchText;
        input.addEventListener("input", () => {
            this.searchText = input.value;
            this.filterItems(scope);
        });

        wrapper.appendChild(input);

        return wrapper;
    }

    private filterItems(scope: HTMLElement): void {
        // Filters the rendered items in place, so typing doesn't rebuild the visual.
        // All values are already loaded (see requestMoreData), so no new query is needed.
        const query = this.isSearchEnabled() ? this.searchText.trim().toLowerCase() : "";

        scope.querySelectorAll<HTMLElement>("[data-search-label]").forEach((item) => {
            item.hidden = query !== "" && !(item.dataset.searchLabel ?? "").includes(query);
        });
    }

    private isSearchEnabled(): boolean {
        return this.formattingSettings.slicerCard.search.value;
    }

    private createListButton(label: string, selected: boolean, onClick: (event: MouseEvent) => void): HTMLButtonElement {
        const button = document.createElement("button");
        button.className = selected
            ? "dynamic-slicer__list-item dynamic-slicer__list-item--selected"
            : "dynamic-slicer__list-item";
        button.type = "button";
        button.textContent = label;
        button.setAttribute("aria-selected", String(selected));
        button.addEventListener("click", onClick);
        this.addTooltip(button, label);

        return button;
    }

    private createSvgElement(tagName: string, attributes: Record<string, string>): SVGElement {
        const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);

        Object.keys(attributes).forEach((name) => element.setAttribute(name, attributes[name]));

        return element;
    }

    private createEraserIcon(): SVGElement {
        // "Eraser" (20 regular) from Fluent UI System Icons, MIT licensed:
        // https://github.com/microsoft/fluentui-system-icons
        const icon = this.createSvgElement("svg", {
            "aria-hidden": "true",
            class: "dynamic-slicer__clear-icon",
            fill: "currentColor",
            height: "16",
            viewBox: "0 0 20 20",
            width: "16"
        });

        icon.appendChild(this.createSvgElement("path", { d: fluentEraserPath }));

        return icon;
    }

    private createPlaceholder(): HTMLElement {
        // Mimics the grey slicer outline Power BI shows for an empty slicer.
        const placeholder = document.createElement("div");
        placeholder.className = "dynamic-slicer__placeholder";

        const icon = this.createSvgElement("svg", {
            "aria-hidden": "true",
            fill: "none",
            stroke: "currentColor",
            "stroke-width": "1.5",
            viewBox: "0 0 48 48"
        });

        icon.appendChild(this.createSvgElement("path", { d: "M8 8h20", "stroke-linecap": "round" }));
        [16, 26, 36].forEach((y) => {
            icon.appendChild(this.createSvgElement("rect", { x: "8", y: String(y), width: "6", height: "6" }));
            icon.appendChild(this.createSvgElement("path", { d: `M19 ${y + 3}h21`, "stroke-linecap": "round" }));
        });

        placeholder.appendChild(icon);

        return placeholder;
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
                selectedValuesFromJsonFilters: debugState.viewModel.selectedValues.map((value) => toValueKey(value)),
                autoSelectedValues: debugState.autoSelectedValues?.map((value) => toValueKey(value)),
                hasUserInteracted: this.hasUserInteracted,
                isLoadingMoreData: this.isLoadingMoreData,
                filterTargetKey: this.filterTargetKey,
                preferredSelectionKey: this.preferredSelectionKey
            },
            jsonFilters: debugState.jsonFilters ?? []
        };
    }

    private getViewModel(dataView?: DataView, jsonFilters?: powerbi.IFilter[]): VisualViewModel {
        // Resolve columns by role name instead of position so the code stays in
        // sync with capabilities.json even if more roles are added later.
        const fieldColumn = this.getCategoryColumnByRole(dataView, "field");
        const dynamicSelectionColumn = this.getCategoryColumnByRole(dataView, "dynamicSelection");
        const selectedValues = this.getSelectedValues(fieldColumn, jsonFilters);
        const items = this.getDistinctItems(fieldColumn);

        return {
            fieldColumn,
            hasDynamicSelection: dynamicSelectionColumn !== undefined,
            dynamicSelectionValues: this.getColumnValues(dynamicSelectionColumn),
            items,
            selectedValues
        };
    }

    private requestMoreData(options: VisualUpdateOptions, dataView?: DataView): void {
        // With "window" data reduction Power BI sends rows in segments; a segment in the
        // metadata means more rows are available. fetchMoreData(true) merges them into the
        // next update's dataView. It returns false when Power BI refuses (memory limit),
        // in which case we continue with the rows we have.
        if (!dataView?.metadata?.segment) {
            this.isLoadingMoreData = false;
            return;
        }

        // Only request on data updates, so resizes don't send duplicate requests.
        if (options.type & powerbi.VisualUpdateType.Data) {
            this.isLoadingMoreData = this.host.fetchMoreData(true);
        }
    }

    // Returns the selection to apply, or undefined when the current one should stay.
    private resolveAutoSelectedValues(viewModel: VisualViewModel): powerbi.PrimitiveValue[] | undefined {
        if (this.hasUserInteracted) {
            return undefined;
        }

        const preferredValue = viewModel.dynamicSelectionValues[0];

        if (!preferredValue) {
            return undefined;
        }

        let autoSelectedValues = resolveDynamicSelection({
            visibleValues: viewModel.items.map((item) => item.value),
            currentValues: viewModel.selectedValues,
            preferredValue,
            fallback: this.getFallbackStrategy()
        });

        if (this.isSingleSelect()) {
            autoSelectedValues = autoSelectedValues.slice(0, 1);
        }

        if (autoSelectedValues.length === 0) {
            return undefined;
        }

        return this.isSameSelection(autoSelectedValues, viewModel.selectedValues)
            ? undefined
            : autoSelectedValues;
    }

    private getRenderedItems(
        items: SlicerItem[],
        selectedValues: powerbi.PrimitiveValue[]
    ): SlicerItem[] {
        const selectedKeys = new Set(selectedValues.map((value) => toValueKey(value)));

        return items.map((item) => ({
            ...item,
            selected: selectedKeys.has(toValueKey(item.value))
        }));
    }

    private applyFilter(values: powerbi.PrimitiveValue[], isUserInteraction: boolean): void {
        // Power BI expects a JSON filter object that targets the bound field.
        if (isUserInteraction && this.host.hostCapabilities?.allowInteractions === false) {
            return;
        }

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
            values,
            filterType: 1
        };

        this.host.applyJsonFilter(filter, "general", "filter", FilterAction.merge);
    }

    private clearFilter(isUserInteraction: boolean): void {
        // Removing the filter is how the visual returns to the "All" state.
        if (isUserInteraction && this.host.hostCapabilities?.allowInteractions === false) {
            return;
        }

        if (isUserInteraction) {
            this.hasUserInteracted = true;
        }

        this.host.applyJsonFilter(null as unknown as powerbi.IFilter, "general", "filter", FilterAction.merge);
    }

    private clearOrphanedFilter(fieldColumn?: DataViewCategoryColumn, jsonFilters?: powerbi.IFilter[]): void {
        // When Field is removed or replaced, the filter on the old column would keep
        // filtering the report with nothing in the slicer showing it. Drop it, like the
        // official slicer. Tried once per filter, so a host that keeps it can't cause a loop.
        const target = this.getFilterTargetFromColumn(fieldColumn);
        const orphaned = (jsonFilters ?? []).find((filter) => {
            const candidate = (filter as BasicFilter).target;

            return candidate !== undefined
                && (!target || candidate.table !== target.table || candidate.column !== target.column);
        });

        if (!orphaned) {
            this.orphanedFilterKey = undefined;
            return;
        }

        const key = JSON.stringify((orphaned as BasicFilter).target);

        if (this.orphanedFilterKey !== key) {
            this.orphanedFilterKey = key;
            this.clearFilter(false);
        }
    }

    private getFilterTarget(): BasicFilter["target"] | undefined {
        return this.getFilterTargetFromColumn(this.fieldColumn);
    }

    private getSelectedValues(
        fieldColumn?: DataViewCategoryColumn,
        jsonFilters?: powerbi.IFilter[]
    ): powerbi.PrimitiveValue[] {
        // Power BI sends existing filter state back through jsonFilters, so this
        // method restores which item is currently selected when the visual rerenders.
        const target = this.getFilterTargetFromColumn(fieldColumn);

        if (!target || !jsonFilters) {
            return [];
        }

        const matchingFilter = jsonFilters.find((filter) => {
            const candidate = filter as BasicFilter;

            return candidate.operator === "In"
                && candidate.target?.table === target.table
                && candidate.target?.column === target.column
                && Array.isArray(candidate.values)
                && candidate.values.length > 0;
        }) as BasicFilter | undefined;

        return matchingFilter?.values ?? [];
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
        return second !== undefined && toValueKey(first) === toValueKey(second);
    }

    private isSameSelection(first: powerbi.PrimitiveValue[], second: powerbi.PrimitiveValue[]): boolean {
        const secondKeys = new Set(second.map((value) => toValueKey(value)));

        return first.length === second.length && first.every((value) => secondKeys.has(toValueKey(value)));
    }

    private isSingleSelect(): boolean {
        return this.formattingSettings.slicerCard.singleSelect.value;
    }

    private isSelectAllShown(): boolean {
        return !this.isSingleSelect() && this.formattingSettings.slicerCard.showSelectAll.value;
    }

    private getSelectedItemLabel(items: SlicerItem[]): string {
        const selectedItems = items.filter((item) => item.selected);

        if (selectedItems.length > 1) {
            return "Multiple selections";
        }

        return selectedItems[0]?.label ?? "All";
    }

    private getDisplayMode(): DisplayMode {
        const value = this.formattingSettings.slicerCard.displayMode.value;
        const displayMode = typeof value === "object" ? value.value : value;

        return displayMode === "list" || displayMode === "tiles" ? displayMode : "dropdown";
    }

    private getFallbackStrategy(): FallbackStrategy {
        const value = this.formattingSettings.slicerCard.fallback.value;
        const fallback = typeof value === "object" ? value.value : value;

        switch (fallback) {
            case "lastVisible":
            case "smallest":
            case "largest":
                return fallback;
            default:
                return "firstVisible";
        }
    }

    private updateFallbackSetting(viewModel: VisualViewModel): void {
        // The fallback rule only matters with a Dynamic Selection field, and its
        // smallest / largest labels depend on the Field data type.
        const fallback = this.formattingSettings.slicerCard.fallback;
        const items = getFallbackItems(viewModel.fieldColumn?.source.type);
        const selectedValue = this.getFallbackStrategy();

        fallback.items = items;
        fallback.value = items.find((item) => item.value === selectedValue) ?? items[0];
        fallback.visible = viewModel.hasDynamicSelection;
    }

    private getHeaderText(): string {
        const customHeader = this.formattingSettings.headerCard.text.value.trim();

        return customHeader || this.fieldColumn?.source.displayName || "Field";
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
            const normalized = toValueKey(value);

            if (normalized) {
                uniqueValues.add(normalized);
            }
        });

        return [...uniqueValues];
    }

    private getDistinctItems(fieldColumn?: DataViewCategoryColumn): SlicerItem[] {
        const seenValues = new Set<string>();
        const formatLabel = this.createLabelFormatter(fieldColumn);

        return (fieldColumn?.values ?? []).reduce<SlicerItem[]>((items, value) => {
            const key = toValueKey(value);

            if (seenValues.has(key)) {
                return items;
            }

            seenValues.add(key);
            items.push({
                value,
                label: key ? formatLabel(value) : "(Blank)",
                selected: false
            });

            return items;
        }, []);
    }

    private createLabelFormatter(fieldColumn?: DataViewCategoryColumn): (value: powerbi.PrimitiveValue) => string {
        // Labels use the model's format string and the report locale, like the official
        // slicer. Matching and filtering keep using the raw value (see toValueKey).
        const formatter = valueFormatter.create({
            // Falls back to a default per type when the column has no format string
            // (e.g. short date, and no thousands separator for years).
            format: fieldColumn ? valueFormatter.getFormatStringByColumn(fieldColumn.source) : undefined,
            columnType: fieldColumn?.source.type,
            cultureSelector: this.host.locale
        });

        return (value) => {
            try {
                return formatter.format(value) || toValueKey(value);
            } catch {
                return toValueKey(value);
            }
        };
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
            this.searchText = "";
        }
    }

    private addTooltip(element: HTMLElement, value: string): void {
        element.addEventListener("mouseenter", (event) => this.showTooltip(event, value));
        element.addEventListener("mousemove", (event) => this.moveTooltip(event, value));
        element.addEventListener("mouseleave", () => this.hideTooltip());
    }

    private showTooltip(event: MouseEvent, value: string): void {
        if (!this.tooltipService.enabled()) {
            return;
        }

        this.tooltipService.show({
            coordinates: [event.clientX, event.clientY],
            isTouchEvent: false,
            dataItems: [{
                displayName: this.getHeaderText(),
                value
            }],
            identities: []
        });
    }

    private moveTooltip(event: MouseEvent, value: string): void {
        if (!this.tooltipService.enabled()) {
            return;
        }

        this.tooltipService.move({
            coordinates: [event.clientX, event.clientY],
            isTouchEvent: false,
            dataItems: [{
                displayName: this.getHeaderText(),
                value
            }],
            identities: []
        });
    }

    private hideTooltip(): void {
        if (this.tooltipService.enabled()) {
            this.tooltipService.hide({
                isTouchEvent: false,
                immediately: false
            });
        }
    }

    private showContextMenu(event: MouseEvent): void {
        event.preventDefault();

        const selectionId = this.host.createSelectionIdBuilder().createSelectionId();
        this.selectionManager.showContextMenu(selectionId, {
            x: event.clientX,
            y: event.clientY
        });
    }

    private trackHover(container: HTMLElement): void {
        // Like the official slicer, the eraser shows while hovering anywhere on the visual.
        // Tracked on the host container because the root may not cover the whole visual area.
        const setHovered = (hovered: boolean) => this.root.classList.toggle("dynamic-slicer--hovered", hovered);

        container.addEventListener("mouseenter", () => setHovered(true));
        container.addEventListener("mousemove", () => setHovered(true));
        container.addEventListener("mouseleave", () => setHovered(false));
    }

    private applyLegacySettings(dataView?: DataView): void {
        // Before 0.2.0 the header toggle and text lived in the "slicer" object. Use them
        // until the new "Slicer header" settings are changed, so older reports keep them.
        const objects = dataView?.metadata?.objects;
        const legacy = objects?.slicer;
        const header = this.formattingSettings.headerCard;

        if (legacy?.showTitle !== undefined && objects?.header?.show === undefined) {
            header.show.value = Boolean(legacy.showTitle);
        }

        if (typeof legacy?.titleText === "string" && objects?.header?.text === undefined) {
            header.text.value = legacy.titleText;
        }
    }

    private applyThemeDefaults(dataView?: DataView): void {
        // Colours not set in the format pane follow the report theme, like the official
        // slicer. The resolved colour is also what the format pane shows.
        const palette = this.colorPalette;
        const foreground = palette.foreground.value;
        const border = palette.foregroundNeutralSecondary.value;
        const selected = palette.isHighContrast ? palette.foregroundSelected.value : foreground;
        const objects = dataView?.metadata?.objects;
        const { headerCard, valuesCard } = this.formattingSettings;
        const defaults: [formattingSettings.ColorPicker, string, string][] = [
            [headerCard.fontColor, "header", foreground],
            [headerCard.borderColor, "header", border],
            [valuesCard.fontColor, "items", foreground],
            [valuesCard.selectedColor, "items", selected],
            [valuesCard.borderColor, "items", border]
        ];

        defaults.forEach(([slice, objectName, color]) => {
            if (objects?.[objectName]?.[slice.name] === undefined || !slice.value?.value) {
                slice.value = { value: color };
            }
        });
    }

    private applyHostTheme(): void {
        const palette = this.colorPalette;
        const { headerCard, valuesCard } = this.formattingSettings;

        this.root.classList.toggle("dynamic-slicer--high-contrast", palette.isHighContrast);
        this.setStyle("--dynamic-slicer-foreground", valuesCard.fontColor.value?.value || palette.foreground.value);
        this.setStyle("--dynamic-slicer-surface", palette.background.value);
        this.setStyle("--dynamic-slicer-border", palette.foregroundNeutralSecondary.value);
        this.setStyle("--dynamic-slicer-selected", valuesCard.selectedColor.value?.value || palette.foreground.value);
        // The open dropdown list covers other values, so it can't be transparent: it uses
        // the values background, or the theme background when that is not set.
        this.setStyle("--dynamic-slicer-dropdown-background", valuesCard.background.value?.value || palette.background.value);

        this.applyTextStyles("header", headerCard);
        this.setStyle("--dynamic-slicer-header-padding-bottom", `${headerCard.paddingBottom.value}px`);
        this.applyBorderStyles("header", headerCard);

        this.applyTextStyles("values", valuesCard);
        this.setStyle("--dynamic-slicer-values-padding-left", `${valuesCard.paddingLeft.value}px`);
        this.applyBorderStyles("values", valuesCard);
    }

    private applyTextStyles(
        prefix: string,
        card: {
            font: formattingSettings.FontControl;
            fontColor: formattingSettings.ColorPicker;
            background: formattingSettings.ColorPicker;
        }
    ): void {
        const font = card.font;

        this.setStyle(`--dynamic-slicer-${prefix}-font-family`, font.fontFamily.value);
        this.setStyle(`--dynamic-slicer-${prefix}-font-size`, `${font.fontSize.value}pt`);
        this.setStyle(`--dynamic-slicer-${prefix}-font-weight`, font.bold?.value ? "700" : "400");
        this.setStyle(`--dynamic-slicer-${prefix}-font-style`, font.italic?.value ? "italic" : "normal");
        this.setStyle(`--dynamic-slicer-${prefix}-text-decoration`, font.underline?.value ? "underline" : "none");
        this.setStyle(`--dynamic-slicer-${prefix}-color`, card.fontColor.value?.value || this.colorPalette.foreground.value);
        this.setStyle(`--dynamic-slicer-${prefix}-background`, card.background.value?.value || "transparent");
    }

    private applyBorderStyles(
        prefix: string,
        card: {
            borderPosition: formattingSettings.ItemDropdown;
            borderColor: formattingSettings.ColorPicker;
            borderWidth: formattingSettings.NumUpDown;
        }
    ): void {
        const value = card.borderPosition.value;
        const position = typeof value === "object" ? String(value.value) : String(value);
        const width = `${Math.max(0, card.borderWidth.value)}px`;
        const sides: Record<string, string[]> = {
            none: [],
            bottom: ["bottom"],
            top: ["top"],
            topBottom: ["top", "bottom"],
            left: ["left"],
            right: ["right"],
            frame: ["top", "right", "bottom", "left"]
        };
        const activeSides = sides[position] ?? [];

        this.setStyle(
            `--dynamic-slicer-${prefix}-border-color`,
            card.borderColor.value?.value || this.colorPalette.foregroundNeutralSecondary.value
        );
        ["top", "right", "bottom", "left"].forEach((side) => {
            this.setStyle(`--dynamic-slicer-${prefix}-border-${side}`, activeSides.includes(side) ? width : "0px");
        });
    }

    private setStyle(name: string, value: string): void {
        this.root.style.setProperty(name, value);
    }

    private clearElement(element: HTMLElement): void {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }
}
