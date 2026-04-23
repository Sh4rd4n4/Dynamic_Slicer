# Tool Versions

This file lists the tool versions currently used and tested for this repo.

## Runtime

- Node.js: `24.14.1`
- npm: `11.11.0`

## Power BI tooling

- `powerbi-visuals-tools` / `pbiviz`: `7.0.3`
- `powerbi-visuals-api`: `~5.3.0`
- `powerbi-visuals-utils-formattingmodel`: `^6.2.2`

## Notes

- On Node 24, use `npm run package:node24`.
- `pbiviz` may exit with noisy certificate or webpack logger errors even when packaging succeeds.
- The real success signal is the generated `.pbiviz` file in `dist/`.

