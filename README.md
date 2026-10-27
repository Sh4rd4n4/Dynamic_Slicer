# Dynamic Slicer

A Power BI slicer with a **default selection that adapts to what each user is allowed to see**.

Row-level security (RLS) hides data per user, but a regular slicer keeps the value the report was saved with. When that value is hidden for someone, their report opens empty. Dynamic Slicer checks which values the current user can see and, when the default is hidden, falls back to a visible one, following a rule you choose. Everything else works like the built-in slicer.

<!-- Demo: record the fallback in action and save it as docs/demo.gif, then uncomment:
![Dynamic Slicer picking a visible value for a user whose default is hidden by RLS](docs/demo.gif)
-->

## Features

**Dynamic default selection**

- A default value from a second column (`Dynamic Selection`), e.g. a calculated column holding the current period
- A fallback rule for when that default is hidden: first or last in the list, or smallest / largest (shown as earliest / latest for dates and first / last alphabetically for text)
- Saved and bookmarked selections are respected when the user can see them
- Without a `Dynamic Selection` field it behaves exactly like a regular slicer, so bookmark buttons keep full control

**Parity with the built-in slicer**

- Dropdown, list and tile styles, with optional search
- Single select, multi-select (with or without CTRL) and a "Select all" option
- Format pane laid out like the built-in slicer: header, values, fonts, colours, borders and spacing, following the report theme until overridden
- Values formatted with the model's format strings
- Clear selections with the eraser, sync slicers, bookmarks, tooltips and the context menu
- Keyboard navigation, screen-reader roles, high contrast and touch devices
- No row limit: values load in segments of 10,000 rows until all have arrived (tested with 20,000+)

## Install

1. Download the `.pbiviz` file from the [latest release](https://github.com/Sh4rd4n4/Dynamic_Slicer/releases/latest).
2. In Power BI Desktop, select **…** in the Visualizations pane > **Import a visual from a file**, and pick the downloaded file.

## Use

1. Add Dynamic Slicer to the page and drag the column to filter into **Field**.
2. Drag the column holding the default value into **Dynamic Selection**. Only its first value is used.
3. In the Format pane, under **Slicer settings > Dynamic selection**, choose the fallback rule.
4. Save the report with **All** (or your default) selected.

## How it works

Until the user clicks a value, the slicer picks its selection in this order:

1. **The saved or bookmarked selection**, if the user can see it. With several values selected, the visible ones are kept; in single select, only the first.
2. **The `Dynamic Selection` value**, if the user can see it.
3. **The fallback rule**, applied to the values the user can see.

Once the user picks a value themselves, the slicer leaves their choice alone.

**Note:** the slicer only knows about the values it receives itself. RLS has to filter the **Field** column, directly or through a relationship that reaches its table. If RLS only filters a fact table, the default stays visible in the slicer and the report can still open empty.

## Limitations

- **Dropdown height:** custom visuals are drawn inside a frame the size of the visual, so the open dropdown can't extend over the rest of the report like the built-in one. It fits the space below the box and scrolls. Give the visual extra height, or use the list or tile style.
- **Number and date format:** values follow the Power BI language (the installed Desktop language, or the display language in the service), not the regional format the built-in visuals use. The visuals API doesn't expose the regional format.
- **Range styles:** the built-in Between, Before, After and Relative date styles aren't available.

## Compatibility

Tested in Power BI Desktop and Power BI Report Server (January 2026). Built on Power BI visuals API 5.11.

## Build from source

Requires Node.js 22 or later.

```sh
npm install
npm run package     # builds dist/*.pbiviz
```

The project passes the checks Microsoft runs for [certified Power BI visuals](https://learn.microsoft.com/power-bi/developer/visuals/power-bi-custom-visuals-certified):

```sh
npm run eslint                              # Power BI recommended lint rules
npm audit                                   # no moderate or higher vulnerabilities
npx pbiviz package --certification-audit    # no external requests
```

Notes for contributors:

- Keep `outDir` in `tsconfig.json`. Without it, `powerbi-visuals-webpack-plugin` runs the build twice and `pbiviz` exits with a webpack `timeEnd` error.
- `package.json` overrides `qs` and `uuid`, which `powerbi-visuals-tools` pulls in at vulnerable versions through its dev server. Remove the overrides once the tools ship fixed versions.
- Tool versions are listed in [VERSIONS.md](VERSIONS.md), and changes in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE) © 2026 Matteo Murru.

The eraser icon is from [Fluent UI System Icons](https://github.com/microsoft/fluentui-system-icons) (MIT, © Microsoft Corporation); see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
