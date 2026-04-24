# Dynamic Slicer

A slicer that can change its default value based on RLS filtering.

## Local setup

1. Install project dependencies:
   `npm install`
2. Package the visual with the Node 24-safe command:
   `npm run package:node24`
3. Look for the built `.pbiviz` in `dist/`

Notes:

- `pbiviz` may still print certificate or webpack logger errors on Node 24 after the package is created, but the built visual still works
- The regular `npm run package` command is kept for compatibility, but use `npm run package:node24`

## Current Status

As of version 1.6.2+ the visual can dynamically adjust its default value, this is a first implementation and it's missing many features

## Next steps

- more formatting options (upcoming, essential for most use cases)
- option to utomatically filter on currentyear
- more flexible fallback logic

## How to use the visual

1) Download the .pbiviz file in the builds folder or build the .pbiviz file with npm (see above), then import it in your powerBI report. 

2) Drag a dimension in "Field" to use it as a regular slicer, drag the same dimension also to "Dynamic Selection" to enable te behaviour. 

## How it works

If you set a default value in the slcier (by choosing a value and saving the report with that value), the report will open on the default value unless the default value isn't visibile.

When the default value is filtered out the visual falls back to the first available value. 

In practice, that means that you can create sorted table that gets filtered by RLS, when access is restricted to the default value the slcier automatically changes to the next visible value, then the user is free to modify the slicer.

## Compatibility

This is only tested in Power BI Jan 2026 Desktop, tests in Power BI 2024 and Power BI Report Server 2024 and 2026 are planned.


