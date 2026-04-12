# 18xx Game Designer

A browser-based map editor for designing custom 18xx-family board games. Works offline with no build step — just open `index.html`.

## Features

- **Hex grid editor** — flat-top hexagonal grid, configurable size (up to 26 cols × unlimited rows)
- **Terrain tools** — paint terrain types (mountain, hill, water, swamp, forest, desert, pass, offmap) with per-hex cost labels
- **Tile placement** — place and rotate standard 18xx track tiles (yellow/green/brown/grey) from the tile palette
- **City & town tools** — single city, OO city (dual station), town, dual-town (dit×2), with river edge marking
- **Right-click context menu** — add city/town, terrain submenu, copy/paste/clear/kill hex
- **Companies panel** — define railroad companies with colors, home hexes, par values, token counts
- **Trains panel** — define train types with costs, distances, rust/obsolete conditions, counts
- **Privates panel** — define private companies
- **Config panel** — per-terrain cost overrides
- **Import Ruby map** — parse 18xx.games `.rb` source files to pre-populate the map (white/yellow/green hexes, LOCATION_NAMES, AXES detection)
- **Export ZIP** — export map, tiles, game, and companies as separate JSON files
- **Autosave** — session saved to localStorage automatically

## Usage

1. Open `index.html` in any modern browser (Chrome, Firefox, Safari, Edge)
2. Configure your game on the Setup screen, or pick a base game preset
3. Use the left panel to select terrain/tile tools, or right-click any hex for the context menu
4. Click any hex with a tile to rotate it 60°
5. Ctrl/Cmd + scroll to zoom; scroll to pan; Shift + scroll to pan horizontally
6. Use **Save JSON** to save your session; **Load JSON** to restore it
7. Use **Export ZIP** for a multi-file export suitable for further development

## Tile Reference

Tiles are numbered per the [18xx tile database](https://www.18xx.games). Custom tiles used in this project are prefixed with `X`:

| Tile | Color  | Type      | Description |
|------|--------|-----------|-------------|
| 55   | Yellow | Dual-town | 3-exit dual dit (bottom, top, upper-left) |
| 56   | Yellow | Dual-town | 4-exit dual dit (bottom+upper-left, upper-left+top) |
| 69   | Yellow | Dual-town | 4-exit dual dit (bottom+top, upper-left+upper-right) |
| 94   | Yellow | OO        | 2-exit OO, 30/30 |
| X3   | Green  | OO        | Curved 4-exit OO |
| X4   | Green  | OO        | Fork 4-exit OO |
| X5   | Green  | OO        | Curved 4-exit OO (mirror of X3) |
| X7   | Brown  | OO        | 5-exit OO to center |

## File Structure

```
index.html          — HTML shell + tile swatch markup
css/
  editor.css        — all styles
js/
  constants.js      — HEX_SIZE, TERRAIN_COLORS, EDGE_MIDPOINTS, TILE_HEX_COLORS, TILE_DEFS
  state.js          — mutable app state + UI variable declarations
  hex-geometry.js   — hexCorners, getHexCenter, pixelToHex, hexId, trackPath
  renderer.js       — drawHex, render, resizeCanvas
  canvas-input.js   — canvas event listeners, applyTool, ensureHex
  context-menu.js   — showContextMenu, removeContextMenu
  palette.js        — buildPalette, updateStatus, left-panel listeners
  hex-panel.js      — updateHexPanel, hex tab field listeners
  companies-panel.js— renderCompaniesTable, trains, privates, config, tab listeners
  setup.js          — showSetup/hideSetup, loadPreset, setup screen listeners
  io.js             — toolbar handlers, autosave, localStorage restore
  import-ruby.js    — importRubyMap and all Ruby parsing helpers
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for a deeper technical reference.
