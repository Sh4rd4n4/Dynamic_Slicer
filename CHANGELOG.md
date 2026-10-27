# Changelog

## 1.0.0.0

First public release.

**Dynamic default selection**

- Default value from the `Dynamic Selection` column, with a selectable fallback rule when it's hidden: first or last in the list, or smallest / largest, labelled for numbers, dates and text
- Saved and bookmarked selections win when the user can see them; without a `Dynamic Selection` column the slicer never changes its selection on its own
- Auto-selection waits until all values have loaded, so a default in a later segment isn't mistaken for hidden

**Slicer features**

- Dropdown, list and tile styles; optional search
- Single select (default), multi-select with or without CTRL, and a "Select all" option
- Format pane matching the built-in slicer: "Slicer settings", "Slicer header" and "Values" cards with fonts, colours, borders and spacing, following the report theme until overridden
- Values formatted with the model's format strings and the Power BI language
- No row limit: values load in segments of 10,000 rows
- Eraser to clear selections, shown on hover and always on touch devices
- Keyboard navigation (arrow keys, Home / End, Escape), screen-reader roles and high contrast
- Taps add / remove values on touch devices in multi-select
- The dropdown fits the visual's height and closes when the user clicks elsewhere on the report
- The filter is cleared when the `Field` column is removed or replaced

**Quality**

- Built on Power BI visuals API 5.11 and the latest `powerbi-visuals-tools`
- Passes the checks for certified Power BI visuals: Power BI ESLint rules, clean `npm audit`, no external requests
- Supports rendering events and the context menu
- Reports saved with earlier versions keep their slicer header settings

## Earlier versions

Versions 0.1.x and 0.2.x were internal development builds.
