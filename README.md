# Dynamic Slicer

The goal of this project is to build a slicer for Power BI that allows for dynamic default values instead of fixed ones

## Use cases ##

- Dynamically set the current year as default without DAX tricks, and then optionallly change years
- Allow different users to see different default values on the filters based on RDL or tables/measures 

## Base Content

- Minimal Power BI custom visual scaffold
- TypeScript source for a basic slicer-like placeholder visual
- Packaging metadata for `pbiviz`
- Toolchain reference in `VERSIONS.md`

## Local setup

This repo works with the current Node version in this environment, but `pbiviz` needs a small workaround when packaging.

1. Install project dependencies:
   `npm install`
2. Package the visual with the Node 24-safe command:
   `npm run package:node24`
3. Look for the built `.pbiviz` in `dist/`

Notes:

- `pbiviz` may still print certificate or webpack logger errors on Node 24 after the package is created.
- If `dist/*.pbiviz` exists, treat that as the real success signal.
- The regular `npm run package` command is kept for compatibility, but `npm run package:node24` is the reliable one in this repo.

