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

As of version 1.6.2+, the visual can dynamically adjust its selected value from a second categorical field. The first value received in `Dynamic Selection` is treated as the preferred default. If that value is visible in `Field`, the slicer applies it automatically; otherwise it falls back to the first visible `Field` value (or the latest one, see the "Fallback when default is hidden" option).

The visual now supports:

- Dropdown, list and tiles display modes
- Optional title display and custom title text
- Clear selection / `All` state, with an option to hide the `All` item
- Fallback choice: first visible value or latest visible value (highest number / date / text)
- Matching that works for text, numbers and dates (dates are compared as `YYYY-MM-DD`)
- Filter-state restore from Power BI `jsonFilters`
- Automatic reset of the auto-selection guard when the bound field or preferred value changes

Current limitations:

- Only single-select filtering is implemented
- Formatting options are still minimal
- Debug output exists in code but is disabled for normal builds

## Next steps

- Add more formatting options; this is essential for most use cases
- Add an option to automatically filter on the current year
- Add more flexible fallback logic / selectable dynamic selection strategies
- Test compatibility in Power BI 2024 and Power BI Report Server 2024 / 2026

## TODO

In the order they should be tackled:

- [ ] Handle the 10,000-row data reduction limit on `Field` × `Dynamic Selection` (currently `top: 10000` in `capabilities.json`; rows past it are silently dropped and can trigger a wrong fallback):
  - Switch to `window` reduction and call `host.fetchMoreData(true)` until `dataView.metadata.segment` is undefined
  - Skip auto-selection until all segments are loaded
  - Optionally warn if `Dynamic Selection` has more than one distinct value, since it multiplies the row count
  - Later, with the official-slicer work: load more values as the list scrolls, and make search run a new query instead of filtering loaded rows
- [ ] Respect saved / bookmarked selections on report load instead of always overwriting them with the `Dynamic Selection` value
- [ ] Single select / multi-select (Ctrl + click) toggle
- [ ] Full parity with the official slicer look and options:
  - Expose all the official colour / font / border / background / padding formatting options (header, items, selection)
  - Search box
  - Compare remaining official style modes

Done:

- [x] Aesthetic quick fixes: selection uses the theme foreground colour (checkbox with checkmark, dark selected tiles), SVG eraser icon, official-style empty placeholder, and a bound field with no visible values now renders an empty slicer instead of the "Bind a field" box
- [x] Document that the fallback only triggers when RLS filters the `Field` column itself; RLS on a fact table that doesn't propagate to the slicer's dimension leaves the report empty
- [x] Fix value matching for non-text types (e.g. dates), previously compared via `String(value)`
- [x] Wire up the `firstVisible` / `latestVisible` strategies as the "Fallback when default is hidden" option
- [x] Tiles style mode
- [x] Option to show / hide the "All" item

## How to use the visual

1) Download the .pbiviz file in the builds folder or build the .pbiviz file with npm (see above), then import it in your powerBI report. 

2) Drag a dimension in "Field" to use it as a regular slicer, then drag the dynamic/default-value field to "Dynamic Selection" to enable the behavior.

## How it works

If you set a default value in the slicer by choosing a value and saving the report with that value, the report opens on the default value unless that value is not visible.

When the default value is filtered out, the visual falls back to the first available value (or the latest one, depending on the fallback option).

In practice, that means you can create a sorted table that gets filtered by RLS. When access is restricted to the default value, the slicer automatically changes to the first visible value in that sort order; then the user is free to modify the slicer.

**Important:** the fallback only looks at the values the slicer itself receives. RLS (or other filters) must filter the `Field` column, either directly or through a relationship that propagates to its table. If RLS only restricts a fact table and the filter doesn't reach the slicer's dimension, the default value stays visible in the slicer and the report can still show up empty.

## Compatibility

This is only tested in Power BI Jan 2026 Desktop, tests in Power BI 2024 and Power BI Report Server 2024 and 2026 are planned.


