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

As of version 1.6.2+, the visual can dynamically adjust its selected value from a second categorical field. The first value received in `Dynamic Selection` is treated as the preferred default. If that value is visible in `Field`, the slicer applies it automatically; otherwise it falls back to another visible value, chosen by the "Fallback when default is hidden" rule. A selection saved in the report or applied by a bookmark takes priority when it is visible. Other values in `Dynamic Selection` are ignored.

The visual now supports:

- Dropdown, list and tiles display modes
- Optional title display and custom title text
- Clear selection / `All` state, with an option to hide the `All` item
- Fallback rule: first in list, last in list, or smallest / largest (labelled for the field type: number, date or text); only shown when `Dynamic Selection` is bound
- Saved and bookmarked selections are kept when visible to the user
- Matching that works for text, numbers and dates (dates are compared as `YYYY-MM-DD`)
- Filter-state restore from Power BI `jsonFilters`
- Automatic reset of the auto-selection guard when the bound field or preferred value changes

Current limitations:

- Only single-select filtering is implemented
- Formatting options are still minimal
- Debug output exists in code but is disabled for normal builds
- All slicer values are loaded up front, in segments of 10,000 rows. Power BI caps this at about 100 MB of data; if it refuses more, the slicer works with the values loaded so far

## Next steps

- Add more formatting options; this is essential for most use cases
- Add an option to automatically filter on the current year
- Test compatibility in Power BI 2024 and Power BI Report Server 2024 / 2026

## TODO

In the order they should be tackled:

- [ ] Single select / multi-select (Ctrl + click) toggle
- [ ] Full parity with the official slicer look and options:
  - Expose all the official colour / font / border / background / padding formatting options (header, items, selection)
  - Search box (official: "..." menu > Search); load more values as the list scrolls, and make search run a new query instead of filtering loaded rows
  - Compare remaining official style modes

Done:

- [x] Saved / bookmarked selections win when visible to the user; otherwise the `Dynamic Selection` default, then the fallback rule. Without a `Dynamic Selection` field the slicer never auto-selects
- [x] Fallback rule selectable in the format pane, with type-aware smallest / largest options (replaces the "warn on multiple `Dynamic Selection` values" idea)
- [x] Removed the 10,000-row limit: data is loaded in segments of 10,000 rows (`window` reduction + `fetchMoreData`) until everything has arrived, and auto-selection waits for the last segment
- [x] Aesthetic quick fixes: selection uses the theme foreground colour (checkbox with checkmark, dark selected tiles), eraser icon from Fluent UI System Icons (shown on hover anywhere on the slicer, also when nothing is selected), official-style empty placeholder, and a bound field with no visible values now renders an empty slicer instead of the "Bind a field" box
- [x] Document that the fallback only triggers when RLS filters the `Field` column itself; RLS on a fact table that doesn't propagate to the slicer's dimension leaves the report empty
- [x] Fix value matching for non-text types (e.g. dates), previously compared via `String(value)`
- [x] Tiles style mode
- [x] Option to show / hide the "All" item

## How to use the visual

1) Download the .pbiviz file in the builds folder or build the .pbiviz file with npm (see above), then import it in your powerBI report. 

2) Drag a dimension in "Field" to use it as a regular slicer, then drag the dynamic/default-value field to "Dynamic Selection" to enable the behavior.

## How it works

Until the user clicks a value (or "All") in the slicer, it picks its selection in this order:

1. **Saved or bookmarked selection**, if the user can see that value. This is the value the report was saved with, or the one a bookmark (e.g. a bookmark button) applied.
2. **The `Dynamic Selection` value**, if the user can see it.
3. **The fallback rule** ("Fallback when default is hidden" in the format pane): first in list, last in list, or smallest / largest. For dates this reads earliest / latest; for text, first / last alphabetically.

If nothing is in `Dynamic Selection`, the slicer never changes its selection on its own; it behaves like a regular slicer and keeps saved and bookmarked values as they are, even when they are not visible. Use this for slicers driven by bookmark buttons.

Because the saved selection now wins, save the report with "All" (or the value you want as default) selected.

In practice, that means you can create a sorted table that gets filtered by RLS. When access is restricted to the default value, the slicer automatically changes to a visible value according to the fallback rule; then the user is free to modify the slicer.

**Important:** the fallback only looks at the values the slicer itself receives. RLS (or other filters) must filter the `Field` column, either directly or through a relationship that propagates to its table. If RLS only restricts a fact table and the filter doesn't reach the slicer's dimension, the default value stays visible in the slicer and the report can still show up empty.

## Third-party assets

The clear selection (eraser) icon is the "Eraser" icon from [Fluent UI System Icons](https://github.com/microsoft/fluentui-system-icons), Copyright (c) 2020 Microsoft Corporation, used under the MIT License.

## Compatibility

This is only tested in Power BI Jan 2026 Desktop, tests in Power BI 2024 and Power BI Report Server 2024 and 2026 are planned.


