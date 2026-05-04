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
    private readonly selectionManager: ISelectionManager;
    private readonly tooltipService: ITooltipService;
    private readonly eventService: IVisualEventService;
    private readonly colorPalette: ISandboxExtendedColorPalette;
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

        this.host = options.host;
        this.selectionManager = this.host.createSelectionManager();
        this.tooltipService = this.host.tooltipService;
        this.eventService = this.host.eventService;
        this.colorPalette = this.host.colorPalette;
        this.formattingSettingsService = new FormattingSettingsService(this.host.createLocalizationManager());
        this.formattingSettings = new VisualFormattingSettingsModel();
        this.hasUserInteracted = false;
        this.root = document.createElement("div");
        this.root.className = "dynamic-slicer";
        this.applyHostTheme();
        this.selectionManager.registerOnSelectCallback(() => {
            // Bookmark and slicer filter state is restored through jsonFilters on update.
        });
        this.root.addEventListener("contextmenu", (event) => this.showContextMenu(event));
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
        this.syncInteractionState(viewModel.fieldColumn, viewModel.dynamicSelectionValues[0]);
        const autoSelectedValue = this.resolveAutoSelectedValue(viewModel);
        const renderedItems = this.getRenderedItems(viewModel.items, autoSelectedValue ?? viewModel.selectedValue);
        this.fieldColumn = viewModel.fieldColumn;
        this.selectedValue = autoSelectedValue ?? viewModel.selectedValue;
        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
            VisualFormattingSettingsModel,
            dataView
        );
        this.applyHostTheme();
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

        if (this.formattingSettings.slicerCard.showHeader.value) {
            const header = document.createElement("div");
            header.className = "dynamic-slicer__header";
            header.textContent = this.getHeaderText();
            control.appendChild(header);
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
        this.addTooltip(clearButton, "Clear selections");

        this.root.appendChild(control);
        this.root.appendChild(clearButton);
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    private createDropdown(items: SlicerItem[]): HTMLElement {
        const selectWrapper = document.createElement("div");
        selectWrapper.className = "dynamic-slicer__select-wrapper";

        const toggle = document.createElement("button");
        toggle.className = "dynamic-slicer__select dynamic-slicer__select--selected";
        toggle.type = "button";
        toggle.textContent = this.getSelectedItemLabel(items);
        toggle.setAttribute("aria-label", this.getHeaderText());
        toggle.setAttribute("aria-haspopup", "listbox");
        toggle.setAttribute("aria-expanded", "false");

        const list = document.createElement("div");
        list.className = "dynamic-slicer__dropdown-list";
        list.setAttribute("role", "listbox");
        list.setAttribute("aria-label", this.getHeaderText());

        list.appendChild(this.createListButton("All", this.selectedValue === undefined, () => this.clearFilter(true)));

        items.forEach((slicerItem) => {
            list.appendChild(this.createListButton(
                slicerItem.label,
                slicerItem.selected,
                () => this.applyFilter(slicerItem.value, true)
            ));
        });

        toggle.addEventListener("click", (event) => {
            event.stopPropagation();

            const isOpen = selectWrapper.classList.toggle("dynamic-slicer__select-wrapper--open");
            toggle.setAttribute("aria-expanded", String(isOpen));
        });

        selectWrapper.addEventListener("click", (event) => event.stopPropagation());

        const closeDropdown = () => {
            selectWrapper.classList.remove("dynamic-slicer__select-wrapper--open");
            toggle.setAttribute("aria-expanded", "false");
            document.removeEventListener("click", closeDropdown);
        };

        toggle.addEventListener("click", () => {
            if (selectWrapper.classList.contains("dynamic-slicer__select-wrapper--open")) {
                document.addEventListener("click", closeDropdown);
            } else {
                document.removeEventListener("click", closeDropdown);
            }
        });

        selectWrapper.appendChild(toggle);
        selectWrapper.appendChild(list);

        return selectWrapper;
    }

    private createList(items: SlicerItem[]): HTMLElement {
        const list = document.createElement("div");
        list.className = "dynamic-slicer__list";
        list.setAttribute("role", "listbox");
        list.setAttribute("aria-label", this.getHeaderText());

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
        this.addTooltip(button, label);

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
            values: [value],
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

    private getSelectedItemLabel(items: SlicerItem[]): string {
        const selectedItem = items.find((item) => item.selected);

        return selectedItem?.label ?? "All";
    }

    private getDisplayMode(): DisplayMode {
        const value = this.formattingSettings.slicerCard.displayMode.value;
        const displayMode = typeof value === "object" ? value.value : value;

        return displayMode === "list" ? "list" : "dropdown";
    }

    private getHeaderText(): string {
        const customHeader = this.formattingSettings.slicerCard.headerText.value.trim();

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

    private applyHostTheme(): void {
        const foreground = this.colorPalette.foreground.value;
        const background = this.colorPalette.background.value;
        const neutral = this.colorPalette.foregroundNeutralSecondary.value;
        const selected = this.colorPalette.isHighContrast
            ? this.colorPalette.foregroundSelected.value
            : this.colorPalette.getColor("DynamicSlicerSelection").value;

        this.root.classList.toggle("dynamic-slicer--high-contrast", this.colorPalette.isHighContrast);
        this.root.style.setProperty("--dynamic-slicer-foreground", foreground);
        this.root.style.setProperty("--dynamic-slicer-background", background);
        this.root.style.setProperty("--dynamic-slicer-border", neutral);
        this.root.style.setProperty("--dynamic-slicer-selected", selected);
    }

    private clearElement(element: HTMLElement): void {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }
}
