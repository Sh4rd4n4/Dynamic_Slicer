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
    dynamicSelectionValues: string[];
    items: SlicerItem[];
    selectedValue?: powerbi.PrimitiveValue;
}

type DisplayMode = "dropdown" | "list" | "tiles";
const isDebugPanelEnabled = false;

interface DebugState {
    autoSelectedValue?: powerbi.PrimitiveValue;
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
        this.syncInteractionState(viewModel.fieldColumn, viewModel.dynamicSelectionValues[0]);
        const autoSelectedValue = this.resolveAutoSelectedValue(viewModel);
        const renderedItems = this.getRenderedItems(viewModel.items, autoSelectedValue ?? viewModel.selectedValue);
        this.fieldColumn = viewModel.fieldColumn;
        this.selectedValue = autoSelectedValue ?? viewModel.selectedValue;
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

        // Only show the placeholder when no field is bound. A bound field with no
        // visible values (e.g. everything hidden by RLS) still renders an empty slicer.
        if (!viewModel.fieldColumn) {
            this.root.appendChild(this.createPlaceholder());
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

        const displayMode = this.getDisplayMode();

        if (displayMode === "dropdown") {
            control.appendChild(this.createDropdown(renderedItems));
        } else {
            control.appendChild(this.createList(renderedItems, displayMode === "tiles"));
        }

        const clearButton = document.createElement("button");
        clearButton.className = "dynamic-slicer__clear";
        clearButton.appendChild(this.createEraserIcon());
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
        toggle.className = "dynamic-slicer__select";
        toggle.type = "button";
        toggle.textContent = this.getSelectedItemLabel(items);
        toggle.setAttribute("aria-label", this.getHeaderText());
        toggle.setAttribute("aria-haspopup", "listbox");
        toggle.setAttribute("aria-expanded", "false");

        const list = document.createElement("div");
        list.className = "dynamic-slicer__dropdown-list";
        list.setAttribute("role", "listbox");
        list.setAttribute("aria-label", this.getHeaderText());

        if (this.formattingSettings.slicerCard.showSelectAll.value) {
            list.appendChild(this.createListButton("All", this.selectedValue === undefined, () => this.clearFilter(true)));
        }

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

    private createList(items: SlicerItem[], asTiles: boolean): HTMLElement {
        const list = document.createElement("div");
        list.className = asTiles
            ? "dynamic-slicer__list dynamic-slicer__list--tiles"
            : "dynamic-slicer__list";
        list.setAttribute("role", "listbox");
        list.setAttribute("aria-label", this.getHeaderText());

        if (this.formattingSettings.slicerCard.showSelectAll.value) {
            list.appendChild(this.createListButton("All", this.selectedValue === undefined, () => this.clearFilter(true)));
        }

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
            preferredValue,
            fallback: this.getFallbackStrategy()
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
        return second !== undefined && toValueKey(first) === toValueKey(second);
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

        return displayMode === "list" || displayMode === "tiles" ? displayMode : "dropdown";
    }

    private getFallbackStrategy(): FallbackStrategy {
        const value = this.formattingSettings.slicerCard.fallback.value;
        const fallback = typeof value === "object" ? value.value : value;

        return fallback === "latestVisible" ? "latestVisible" : "firstVisible";
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
            const normalized = toValueKey(value);

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
            const key = toValueKey(value);

            if (seenValues.has(key)) {
                return items;
            }

            seenValues.add(key);
            items.push({
                value,
                label: key || "(Blank)",
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

    private trackHover(container: HTMLElement): void {
        // Like the official slicer, the eraser shows while hovering anywhere on the visual.
        // Tracked on the host container because the root may not cover the whole visual area.
        const setHovered = (hovered: boolean) => this.root.classList.toggle("dynamic-slicer--hovered", hovered);

        container.addEventListener("mouseenter", () => setHovered(true));
        container.addEventListener("mousemove", () => setHovered(true));
        container.addEventListener("mouseleave", () => setHovered(false));
    }

    private applyHostTheme(): void {
        const foreground = this.colorPalette.foreground.value;
        const background = this.colorPalette.background.value;
        const neutral = this.colorPalette.foregroundNeutralSecondary.value;
        // The official slicer uses the theme foreground for selection, not a data colour.
        const selected = this.colorPalette.isHighContrast
            ? this.colorPalette.foregroundSelected.value
            : foreground;

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
