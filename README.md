# Dynamic Slicer

A slicer that can change its default value based on RLS filtering.

## Local setup

1. Install project dependencies:
   `npm install`
2. Package the visual with the Node 24-safe command:
   `npm run package:node24`
3. Look for the built `.pbiviz` in `dist/`

Build notes:

- `pbiviz` may still print certificate or webpack logger errors on Node 24 after the package is created, but the built visual still works
- The regular `npm run package` command is kept for compatibility, but use `npm run package:node24`

## Working notes

As of version 1.6.2+, the visual can dynamically adjust its selected value from a second categorical field. The first value received in `Dynamic Selection` is treated as the preferred default. If that value is visible in `Field`, the slicer applies it automatically; otherwise it falls back to the first visible `Field` value.

The visual now supports:

- Dropdown and list display modes
- Optional title display and custom title text
- Clear selection / `All` state
- Filter-state restore from Power BI `jsonFilters`
- Automatic reset of the auto-selection guard when the bound field or preferred value changes

Current limitations:

- Only single-select filtering is implemented
- The dynamic selection strategy is currently fixed to preferred value with first-visible fallback
- Formatting options are still minimal
- Debug output exists in code but is disabled for normal builds

## Next steps

- Add more formatting options; this is essential for most use cases
- Add an option to automatically filter on the current year
- Add more flexible fallback logic / selectable dynamic selection strategies
- Test compatibility in Power BI 2024 and Power BI Report Server 2024 / 2026

## How to use the visual

1) Download the .pbiviz file in the builds folder or build the .pbiviz file with npm (see above), then import it in your powerBI report. 

2) Drag a dimension in "Field" to use it as a regular slicer, then drag the dynamic/default-value field to "Dynamic Selection" to enable the behavior.

## How it works

If you set a default value in the slicer by choosing a value and saving the report with that value, the report opens on the default value unless that value is not visible.

When the default value is filtered out, the visual falls back to the first available value.

In practice, that means you can create a sorted table that gets filtered by RLS. When access is restricted to the default value, the slicer automatically changes to the next visible value; then the user is free to modify the slicer.

## Compatibility

This is only tested in Power BI Jan 2026 Desktop, tests in Power BI 2024 and Power BI Report Server 2024 and 2026 are planned.


