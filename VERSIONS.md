# Tool Versions

This file lists the tool versions currently used and tested for this repo.

## Runtime

- Node.js: `24.14.1`
- npm: `11.11.0`

## Power BI tooling

- `powerbi-visuals-tools` / `pbiviz`: `7.2.1`
- `powerbi-visuals-api`: `~5.11.1`
- `powerbi-visuals-utils-formattingmodel`: `^7.1.0`
- `powerbi-visuals-utils-formattingutils`: `^6.1.2` (7.0.0 ships its locale file as an ES module, which the `pbiviz` 7.2.1 localization loader can't read; move to 7.x once the tools support it)
- `typescript`: `^5.9.3`
- `eslint`: `^10.13.0` with `eslint-plugin-powerbi-visuals` `^1.1.1`

## Notes

- `npm run package` builds on Node 22 and 24 and exits without errors.
- `pbiviz` prints a Node `DEP0187` deprecation warning; it is harmless.

