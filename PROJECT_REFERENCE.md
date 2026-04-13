# 18xxtools — Complete Project Reference
*Last updated: 2026-04 | Maintained by: meiotta / Claude sessions*

---

## 0. Ground Rules for AI Sessions Working on This Project

**CRITICAL: Do not touch `18xx-master`.** The `C:\Users\meiot\Rail\18xx-master` directory is Toby Mao's reference Ruby engine. It is a read-only reference. Every editable file in this project lives under `C:\Users\meiot\Rail\18xxtools`. The `.rb` files inside `18xxtools/maps/` and `18xxtools/g*_map.rb` are output artifacts — they are generated Ruby files that describe preprinted game maps, not renderers. The renderer is JavaScript.

The live JS source files are in `18xxtools/.claude/worktrees/<worktree-name>/js/`. The worktree names change; always confirm the active worktree before editing. Do not edit `recovery_sandbox/` copies.

Before any coding task, read `ARCHITECTURE.md` and this file. Confirm which JS file you are changing. Make the minimum necessary edit. Never spawn a sub-agent and let it roam unsupervised across the codebase.

**RCA required for every bug.** Before implementing any bug fix, you must perform a root cause analysis: (a) what was wrong, (b) why the wrong implementation was written — which tobymao source file was not consulted, (c) confirm the correct tobymao behavior by reading the actual source. This requirement stays in effect until explicitly lifted by the user.

---

## 1. What This Project Is

**18xxtools** is a vanilla JavaScript single-page application (SPA) — zero build step, zero bundler, no npm dependency for runtime. It opens directly in a browser from disk (`index.html`). Its purpose is to let a user visually design a custom 18xx board game, covering:

- **Map design** — placing and configuring hexes, terrain, tiles, cities, rivers, borders
- **Tile manifest** — selecting which standard tiles are in the box and in what quantities
- **Companies** — configuring major companies with name, abbreviation, color, home hex, par value, token count, float percentage
- **Trains** — defining train types, costs, distances, rust/obsolescence triggers, counts
- **Private companies** — defining privates with name, face value, revenue, and ability description

The tool currently exports a ZIP archive containing JSON files (`map.json`, `tiles.json`, `game.json`, `companies.json`). These are intermediate design files — they are NOT directly consumable by 18xx-master without a separate translation/bridge step that converts them into the appropriate Ruby configuration format. That bridge is a future pipeline, not yet built.

The tool is NOT a game player, NOT a rules engine, and NOT a fork of 18xx-master. It is purely a design-time visual editor. Unbuilt but planned modules include: market/stock price configuration, phase definitions, and the Ruby export bridge.

---

## 2. File and Module Structure

All scripts are loaded via `<script>` tags in `index.html` in a strict dependency order. There are no ES modules. Every function and variable declared at the top level is globally accessible — this is intentional to keep the tool usable without a server or bundler.

### Load Order (MUST be maintained)

```
constants.js        — TILE_DEFS, HEX_SIZE, EDGE_MIDPOINTS, TERRAIN_COLORS, TILE_HEX_COLORS
state.js            — state{}, activeTool, zoom, pan, canvas/ctx/container references
hex-geometry.js     — hexId(), getHexCenter(), pixelToHex(), hexCorners(), trackPath()
renderer.js         — drawHex(), drawStaticHex(), render(), resizeCanvas()
canvas-input.js     — canvas event listeners, applyTool(), ensureHex()
context-menu.js     — showContextMenu(), removeContextMenu()
palette.js          — buildPalette(), updateStatus()
hex-panel.js        — updateHexPanel(), hex tab listeners
companies-panel.js  — renderCompaniesTable(), renderTrainsTable(), renderPrivatesTable(), tabs
setup.js            — showSetup(), hideSetup(), loadPreset(), setup listeners
io.js               — save/load/export, autosave, localStorage restore
import-ruby.js      — importRubyMap(), parseHexCode(), matchTileDef()
static-hex-builder.js — UI for composing pre-printed / offboard hexes
tile-manifest.js    — tile box configuration panel, BASE_TILE_SETS per game
```

Every module that calls another module's function must be loaded after it. If you add a new cross-module call, update this order and the corresponding `<script>` tags in `index.html`.

### Additional files

`maps/*.rb` — reference Ruby map files for 1830, 1846, 1822, 1889, 1861, 18Chesapeake. These were added so that `importRubyMap()` could be exercised against real game data, verifying that the renderer handles real DSL correctly and that tiles from those maps are parseable even if not all were explicitly defined in `TILE_DEFS` before. They are NOT edited by the tool.

`g1889_map.rb`, `g1882_map.rb` — example exported Ruby map output files showing the intended export format.

`TILE_BIBLE.md` — tile geometry and terminology reference. Authoritative for station types, arc radii, hostile vs permissive track, and edge numbering.

`TILES_tobymao.pdf` — a saved copy of the official 18xx.games TILES.md. Source of truth for tobymao DSL syntax and tile definitions.

`for_claude.txt` — a context document written during a period when Gemini was being used as a collaborator on the companies/financials schema design. That Gemini tool use has been suspended. The document describes a proposed JSON schema for companies and stock markets that was aspirational at the time of writing and has not been fully implemented.

`ARCHITECTURE.md` — shorter module reference, maintained separately from this file.

---

## 3. Coordinate Systems — Read This Carefully

There are three distinct coordinate systems in play. Confusion between them is the most common source of bugs.

### 3a. Canvas coordinate space (runtime rendering)

`EDGE_MIDPOINTS` in `constants.js` defines the six edge midpoints of a flat-top hexagon with circumradius = 50, centered at origin, Y-axis pointing down:

```
Edge 0 → lower-right  ( 37.5,  21.65)
Edge 1 → bottom       (  0.0,  43.30)
Edge 2 → lower-left   (-37.5,  21.65)
Edge 3 → upper-left   (-37.5, -21.65)
Edge 4 → top          (  0.0, -43.30)
Edge 5 → upper-right  ( 37.5, -21.65)
```

All `svgPath` strings in `TILE_DEFS` use this coordinate space. The canvas draws tiles at `HEX_SIZE = 40` pixels, so the scale factor is `(HEX_SIZE * zoom) / 50`. A tile path defined at radius 50 is scaled by this factor when drawn.

The 18xx.games manifest SVGs use circumradius = 100. When porting paths from the manifest, divide all coordinates by 2.

### 3b. Import edge space (used only in `import-ruby.js`)

`import-ruby.js` introduces `IMPORT_EDGE_PTS` with a different edge numbering than `EDGE_MIDPOINTS`. It is worth noting that since the Ruby files being imported use tobymao DSL format (which has its own edge numbering — see 3c), a dedicated import edge space is a questionable abstraction that may not be necessary. The current implementation uses it as an intermediate for the `svgPathToEdgeSet()` matching process:

```
0 → North (top)         ( 0,   -43.3)
1 → North-East          ( 37.5, -21.65)
2 → South-East          ( 37.5,  21.65)
3 → South (bottom)      ( 0,    43.3)
4 → South-West          (-37.5,  21.65)
5 → North-West          (-37.5, -21.65)
```

### 3c. Tobymao DSL edge numbering (in `.rb` source files)

The tobymao DSL `path=a:N,b:M` uses: 0 = Bottom, 1 = Lower-Left, 2 = Upper-Left, 3 = Top, 4 = Upper-Right, 5 = Lower-Right (clockwise from bottom for flat-top).

Conversion to our canvas system: `ourEdge = (tobymaoEdge + 1) % 6`

This conversion must be applied in `import-ruby.js` when parsing `path=a:N,b:M` DSL. If `import-ruby.js` is using tobymao edge numbers directly as canvas edge numbers, every imported track connection is off-by-one — this is a known audit item.

### 3d. 18xx grid coordinate space

Grid coordinates are letter+number strings like `A2`, `B3`. Columns are letters (A=col 0, B=col 1, …), rows are numbers. Even columns (B, D, F) use odd row numbers; odd columns (A, C, E) use even row numbers. Odd columns sit half a row higher visually.

`hexId(row, col)` converts internal 0-indexed `(row, col)` to an 18xx coordinate string:
- Even col: `coordRow = 2*row + 2`
- Odd col: `coordRow = 2*row + 1`

### 3e. Stagger parity

`meta.staggerParity` controls which set of internal columns receives the half-row downward offset in the flat-top hex grid:

`0` (default) — even internal cols (0, 2, 4…) are staggered/tall. Standard 18xx.games convention.

`1` — odd internal cols (1, 3, 5…) are staggered. Set automatically when importing Ruby files that declare `AXES = { x: :number, y: :letter }` (e.g. 1882 Saskatchewan). In those files the coord letter encodes the ROW and the number encodes the COLUMN, so after `coordToGrid()` transposes them, the stagger direction reverses. The 18xx map corpus is notoriously inconsistent on this — the current implementation carries `staggerParity` in the save file rather than normalizing at import time. This is an open design question.

---

## 4. The State Object

`state` in `state.js` is the single source of truth for everything displayed in the editor. It is serialized directly to JSON for save/load. Do not cache or copy parts of state in other modules — always read from `state` directly.

```js
state = {
  meta: {
    title: string,
    baseGame: 'custom' | '1830' | '1846' | '1822' | '1889' | '1856' | '1861' | '1882' | '1889',
    rows: number,
    cols: number,
    orientation: 'flat',
    staggerParity: 0 | 1,
    maxRowPerCol: null | number[],  // per-column height clipping (e.g. 1889 Shikoku)
    bank: number,
    playersMin: number,
    playersMax: number,
  },
  hexes: {
    [hexId: string]: HexObject
  },
  companies: CompanyObject[],
  trains: TrainObject[],
  privates: PrivateObject[],
  terrainCosts: { ... },  // PENDING REMOVAL — terrain costs belong on individual hexes per DSL convention, not as global defaults
  phase: 'setup' | 'design',
}
```

`meta.maxRowPerCol` is set by `importRubyMap()` to record the maximum valid internal row for each column, enabling non-rectangular map shapes. `null` means no per-column clipping.

### HexObject fields

```js
{
  terrain: '' | 'mountain' | 'hill' | 'water' | 'swamp' | 'forest' | 'desert' | 'pass' | 'offmap',
  terrainCost: number,         // cost to build through this hex (per DSL convention, lives on the hex)
  tile: number | string | 0,   // tile number; 0 = no tile; string for custom tiles like 'X3'
  rotation: 0–5,               // 60° increments
  city: null | {
    name: string,
    slots: 1 | 2 | 3,
    home: string,              // company abbreviation or ''
    revenue: { yellow, green, brown, grey: number }
  },
  town: null | { name: string } | false,
  oo: boolean,
  ooCityName: string,
  dualTown: boolean,
  cityName: string,
  label: string,
  upgradesTo: number[],
  overrideUpgrades: boolean,
  riverEdges: number[],        // 0–5, canvas edge numbering
  killed: boolean,
  // Static hex fields (used when hex.static === true):
  // These verbose fields are needed while the user is composing the hex in the builder UI.
  // Eventually they will need to be collapsible to standard tobymao DSL syntax for export.
  static: boolean,
  bg: 'white' | 'yellow' | 'green' | 'brown' | 'gray' | 'red' | 'blue',
  feature: 'offboard' | 'city' | 'town' | 'oo' | 'c' | 'm' | 'none',
  exits: number[],
  exitPairs: number[][],
  revenues: PhaseRevenue[],
  hidden: boolean,
  borders: [{ edge: number, type: 'impassable'|'water'|'mountain', cost: number }],
}
```

### CompanyObject (actual fields as of current code)

```js
{
  name: string,       // full company name
  abbr: string,       // abbreviation, max 4 chars
  color: string,      // hex color string e.g. '#EF1D24'
  homeHex: string,    // grid coordinate e.g. 'A8', or ''
  parValue: number,   // starting par price
  tokens: number,     // number of station tokens
  floatPct: number,   // percentage of shares sold required to float
}
```

Note: the more elaborate schema described in `for_claude.txt` (locationMechanism, trainPurchaseTiming, etc.) was aspirational design from the Gemini collaboration period. The current implementation is the simpler version above.

### TrainObject

```js
{
  type: string,       // e.g. '2', '3', '4', 'D'
  cost: number,
  distance: number,   // cities/towns this train can run through
  rustsOn: string,    // train type whose introduction rusts this train, e.g. '4'
  obsoleteOn: string, // train type that makes this train obsolete
  count: number,      // quantity in the game box
}
```

### PrivateObject

```js
{
  name: string,
  cost: number,       // face value / purchase price
  revenue: number,    // fixed revenue per operating round
  ability: string,    // free text description of special ability
}
```

---

## 5. TILE_DEFS Schema

`TILE_DEFS` in `constants.js` is an object keyed by tile number (always a string, even for numeric tiles). Each entry describes exactly how to render one tile variant.

```js
{
  svgPath: string,           // SVG M/L/A commands, circumradius=50 space
  color: 'yellow'|'green'|'brown'|'grey',
  city?: true,               // single city circle at (0,0), r=14
  oo?: true,                 // two city circles (OO layout)
  town?: true,               // single town bar at center
  townAt?: {
    x: number, y: number,
    rot: number,             // bisector angle mod 180
    rw: number,              // bar half-length (= 16.93)
    rh: number,              // bar half-height (= 4.23)
  },
  dualTown?: true,           // two separate town stops
  cityPositions?: [{x,y}],   // custom city circle centers for non-standard OO layout
  townPositions?: [{x,y}],   // custom town circle centers for dualTown
  revenue?: { x, y, v },    // single revenue bubble
  revenues?: [{ x, y, v }], // multiple revenue bubbles (dualTown tiles)
  tileLabel?: 'Y' | 'T',    // small non-rotating letter drawn at left edge
}
```

Key facts: `activeTile` can be an integer or string (e.g., `'X3'`). Always use `String(activeTile)` for `TILE_DEFS` lookup. Tile `94` is yellow (manually corrected from an initial green misclassification).

Revenue bubbles do not rotate with the tile. They are drawn in canvas space after the tile clip/transform is restored.

### Known incorrect TILE_DEFS entries

The tile-packs classification in `tile-manifest.js` may already account for some of these correctly — verify before changing both files independently.

| Tile | Issue | Fix |
|------|-------|-----|
| 1, 2 | `oo: true` — these are dual-town tiles, not OO cities | Change to `dualTown: true`, add `townPositions` with rot/rw/rh, split revenue into `revenues` array |
| 55, 56, 69 | `dualTown: true` but `townPositions` render as circles — should be bars | Add rot/rw/rh to each `townPosition` entry |
| 141, 142 | `town: true` draws bar + white circle — circle is wrong | Render bar only, no white circle |

Correct townPosition rot values:

| Tile | Town | Exits | rot |
|------|------|-------|-----|
| 55 | 1 | 1,4 | 0 |
| 55 | 2 | 2,5 | 60 |
| 56 | 1 | 1,3 | −30 |
| 56 | 2 | 2,4 | 30 |
| 69 | 1 | 1,4 | 0 |
| 69 | 2 | 3,5 | 90 |
| 1 | 1 | 2,4 | 30 |
| 1 | 2 | 1,5 | 30 |
| 2 | 1 | 1,4 | 0 |
| 2 | 2 | 2,3 | 0 |

### Town bar geometry

A town bar is a filled black rectangle. `rot` is the bisector angle of the two exit directions, mod 180°: `rot = ((exitAngle1 + exitAngle2) / 2) % 180`. Exit angles: edge 1 = 90°, edge 2 = 150°, edge 3 = 210°, edge 4 = 270°.

ABSOLUTE RULE: revenue numbers are NEVER drawn inside a town bar. They live in a separate bubble offset from the bar.

---

## 6. Color Constants

```js
// Tile background colors by upgrade era
const TILE_HEX_COLORS = {
  yellow: '#F0D070',
  green:  '#71BF44',
  brown:  '#CB7745',
  grey:   '#BCBDC0'    // key is 'grey'
};

// Static hex background colors
const STATIC_BG_COLORS = {
  white:  '#D4B483',
  yellow: '#F0D070',
  green:  '#71BF44',
  brown:  '#CB7745',
  gray:   '#BCBDC0',   // key is 'gray' — NOTE different spelling from TILE_HEX_COLORS
  red:    '#E05050',
  blue:   '#35A7FF',
};

// Terrain hex colors — PENDING REVIEW
// The user intends terrain cost to live on the hex itself (per DSL convention),
// not as global defaults. The terrain color palette may be simplified or removed.
const TERRAIN_COLORS = {
  '':        '#c8a87a',
  mountain:  '#c8a87a',  // icon overlay; background stays plains
  hill:      '#c8a87a',
  water:     '#c8a87a',
  swamp:     '#556644',
  forest:    '#336633',
  desert:    '#cc9944',
  pass:      '#8b7355',
  offmap:    '#1a1a1a'
};
```

The 'grey'/'gray' key mismatch between `TILE_HEX_COLORS` and `STATIC_BG_COLORS` is a live footgun. Code that looks up colors must use the correct key for the correct context. The canonical color values come from the 18xx.games source — if there is ever a discrepancy, treat the source game's rendering as authoritative.

---

## 7. The Rendering Pipeline

`render()` in `renderer.js`:
1. Clears the entire canvas
2. Iterates all `(row, col)` in the grid; skips positions beyond `maxRowPerCol[col]` if set
3. For each cell, calls `drawStaticHex()` if `hex.static === true`, otherwise `drawHex()`
4. After all hexes, draws axis labels (column letters top, row numbers left)

`drawHex(row, col, hex)` draw order:

1. Canvas position: `cx/cy` from `getHexCenter()` with pan and zoom applied
2. Hex background fill (terrain color or tile era color)
3. Hex border (gold if selected, cyan dashed if multi-selected, grey otherwise)
4. Tile rendering (if `hex.tile !== 0`): clip to hex polygon → translate/rotate/scale → stroke `svgPath` → draw station markers → restore
5. Revenue bubble(s) — in canvas space, NOT rotated with tile
6. Untiled hex features (city/town markers when no tile is placed)
7. Overlay elements: terrain cost labels, hex label, river edges, killed overlay

**Known render order bug (not yet fixed):** Terrain upgrade cost icons and some labels are drawing at the wrong Z-level. Correct bottom-to-top order: background → track path → partition lines → station markers → border/terrain icons → revenue bubbles → text labels.

`drawStaticHex()` draw order: background fill → hex border → hex clip → track stubs → station markers → revenue labels → border markers (`drawBorders()`) → hex label.

Scale relationship: `scale = (HEX_SIZE * zoom) / 50`.

---

## 8. Track Elements and Their Rendering Rules

Note on terminology: "station" in 18xx refers specifically to a token that a company places in a city slot. It does not describe track geometry elements. The section below describes the visual elements found on tiles — cities, towns, and track — not "station types."

### Blank track
No city or town element. Only the `svgPath` is stroked. Examples: tiles 7, 8, 9 (yellow), 16–29 (green), 39–47 (brown).

### Single town (dit) — bar rendering
A town on a 2-exit tile is rendered as a filled black rectangle (the bar) crossing the track. The bar is not intrinsically "hostile" — that describes the route topology, not the town itself. Some bar-town yellow tiles never upgrade; others do. When a tile with a 2-exit bar town upgrades to have 3+ exits meeting at that town, it transitions to dot rendering.

`townAt` field specifies position and rotation. Examples: tiles 3, 4, 58.

### Single town (dit) — dot rendering
A small filled black circle, radius ≈ 5 units. Used when 3+ exits all converge at one town node (a junction). No bar. When a 2-exit town tile upgrades, the green/brown replacement tile generally has 3 exits and renders the town as a dot at center.

The bar vs dot decision: 2-exit path through the town → bar. 3+ exits meeting at the town node → dot.

**Tobymao dit rendering (`town_dot.rb`):** A dit is a town with `paths.empty?` (0 exits). `Town#rect?` returns false when paths are empty, routing to `TownDot`. Canonical appearance: small black circle, white stroke, stroke-width ~4 at 100-unit scale (r=5, stroke-width=2 at our 50-unit scale). Opposite of a city slot (white fill, black stroke). Do not use `DSL_SLOT_R` for dits. `Town#rect?` logic: `@style ? (@style == :rect) : (!paths.empty? && paths.size < 3)` — 0 paths = dit dot, 1-2 paths = bar, 3+ paths = junction dot.

### Tobymao dit rendering (`town_dot.rb`)
A "dit" is a town with `paths.empty?` (0 exits). `Town#rect?` returns false when paths are empty, which routes rendering to `TownDot`. The canonical dit appearance: small black circle, white stroke, stroke-width ~4 at 100-unit scale (use r=5, stroke-width=2 at our 50-unit scale). This is the OPPOSITE of a city slot (white fill, black stroke). Do not use `DSL_SLOT_R` (city radius) for dits.

`Town#rect?` logic: `@style ? (@style == :rect) : (!paths.empty? && paths.size < 3)` — so: 0 paths = dit dot, 1–2 paths = bar, 3+ paths = junction dot.

### Dual town (two dits)
Two separate through-route towns on one hex, each on its own track. Two independent revenue stops. The `dualTown` flag in `TILE_DEFS` is sufficient to describe this — no need for a separate flag in the DSL. The tobymao DSL represents these as two `town` components, each connected to exactly 2 paths. `revenues` array (plural) provides a bubble for each. Examples: tiles 55, 56, 69. Tiles 1 and 2 are also dual-town tiles despite being misclassified as `oo` in the current `TILE_DEFS`.

### Single city
One open white circle where a company can place a token. Drawn at center (radius 14) or at `cityPositions[0]` if custom. Examples: tiles 5, 6, 57.

### OO city — IMPORTANT DEFINITION

An OO tile is specifically a tile with `label=OO` in the tobymao DSL. This label appears on the physical tile and in the map rendering. OO tiles have two unconnected city token slots. Examples: tile 235, tiles in the 8860 range.

Tiles 14, 15, 619, and 622 are NOT OO tiles — they are standard green city tiles with two token slots but without the OO label. The distinction matters for the map builder because white hexes are placed to indicate the upgrade pathway available to players. When a user places a white hex with a 2-slot city designation, they are indicating which upgrade tiles are valid — conflating OO tiles with standard 2-slot city tiles would mislead players about the upgrade options.

OO tiles with `cityPositions` specified draw circles at the given positions with a connector between them. The `OO` text label is always rendered visibly on the tile (confirmed by Baltimore H6 in 18Chesapeake).

### Revenue rendering
Revenue bubbles always render in canvas space after restoring the tile transform — they do not rotate with the tile. A `revenue` field gives one bubble; `revenues` gives multiple. The bubble is a circle with black border and black centered text.

---

## 9. The Ruby Import Pipeline

`importRubyMap(content)` in `import-ruby.js` parses a Ruby game file and populates `state.hexes`.

1. **Strip line continuations** — Ruby `\` at end of line.
2. **AXES detection** — `AXES = { x: :letter, y: :number }` (standard) or `x: :number` (transposed). Sets `transposed` flag.
3. **LOCATION_NAMES extraction** — `'coord' => 'City Name'` pairs become hex labels.
4. **HEXES block parsing** — white, yellow, green sub-blocks. Red and grey blocks are currently skipped. Each pair `%w[A1 B2] => 'code'` or `['A1'] => 'code'` is parsed by `parseHexCode(code)`.
5. **`parseHexCode(code)`** — extracts exits and feature type from the DSL string.
6. **`matchTileDef(edges, color, hasCityOrOO)`** — tries all `TILE_DEFS` entries at all 6 rotations via `svgPathToEdgeSet()`. Returns first match with rotation.
7. **`svgPathToEdgeSet(svgPath)`** — maps each `M x y` path endpoint to nearest `IMPORT_EDGE_PTS` entry.
8. **Fill killed hexes** — grid positions not in the `.rb` file become `killed: true`.

---

## 10. The Static Hex Builder

`static-hex-builder.js` provides the UI for composing pre-printed / offboard hexes that never participate in the standard tile upgrade system.

Valid use cases: offboard terminal stations (red hexes with revenue arrows), pre-printed permanent routes (e.g., Altoona bypass in 1830), blocking hexes.

This should NOT be called a "grey tile builder." Grey-phase tiles are part of the tile manifest, not the static hex builder.

### Deferred feature: custom code escape hatch

A planned but not yet implemented escape hatch for exotic layouts (e.g., tile #1167) that can't be expressed with the current exit+feature model. Design: a raw string input field accepting tobymao DSL syntax directly, with a generic renderer that parses and draws it. Not yet built.

### Static hex fields

`bg` — key from `STATIC_BG_COLORS` ('white', 'yellow', 'green', 'brown', 'gray', 'red', 'blue').
`feature` — `'offboard'|'city'|'town'|'oo'|'c'|'m'|'none'`.
`exits` — edge numbers (canvas numbering, 0–5).
`exitPairs` — for OO/C/M: which exits feed which city node.
`revenues` — for offboard: `[{phase, value}]` for phase-based revenue.
`borders` — `[{edge, type, cost}]`.
`hidden` — solid fill only, no features drawn.

These verbose fields are needed during composition. The eventual export pipeline will need to collapse them back to tobymao DSL syntax.
<!-- i don't know if there's a better way to implement hex/tile building that doesn't rely on these fragile fields, but i also understand that TOBYMAO's reference will draw a track to an element on the tile when you reference in the DSL, but you would have to build the tile incrementally to get here. I have an idea on how to execute this,  -->
---

## 11. Tile Manifest and Pack Classification

The tile manifest panel (`tile-manifest.js`) lets users configure which tiles are in the game box and in what quantities. `BASE_TILE_SETS` provides presets for 1822, 1830, 1846, 1856, 1861, 1882, 1889, and a generic `manifest` set.

The classification of tiles into named packs came from `packwriter.txt` (the original tile definitions from the 18xx.games source repo) — a previous Claude session wrote a classification schema from it. Pack names come only from that source.

The four packs defined are:

**Basic Tile Pack** — standard tiles found across most classic 18xx games. Yellow: 1, 2, 3, 4, 5, 6, 7, 8, 9, 55, 56, 57, 58, 69, 235. Green: hostile X-tiles (16–31), single-city 3-exit (12, 13), standard 2-slot city tiles (14, 15, 52, 59, 619, 622), K-label cities (236, 237, 238), Lawson junctions (80–83), 4-exit towns (87, 88), double-path combos (624, 625, 626). Brown: 2-slot city tiles (35–38, 63–68, 118), hostile crossings (39–47, 70), Lawson junctions (544–546), 4-exit towns (145–148). Grey: multi-city and crossing tiles (452–455), all-exit junction (60), large multi-slot cities.

**Junctions & Nontraditional Cities** — Lawson junctions and oddball yellow city variants.

**Limited Exit & Token Cities** — dead-end / placeholder city tiles with `revenue:0`.

**These are dumb and you are dumb but they don't break anything, I think** — exotic and game-specific tiles. Includes: XX-label tiles (210–215, `label=XX`), towns with revenue > 10, tiles with `icon=` attributes, and the pre-defined set: 115, 128, 437, 438, 445, 451a, 471–473, 790, 441a, 8850–8857.

**Unsupported** — any tile with `track:narrow` or `track:dual` in any path. Excluded from rendering and the palette.
<!-- these tile packs, especially the basic ones and your terminology 'lawson junctions' and k-label cities are badly misleading. Just correct your description to the following and say that you're not smart enough to intuit these rules

1) basic tiles are yellow tiles with revenue and behavior appropriate to the first generation of 18xx titles, up through brown and gray
2) junctions & nontraditional cities these are the second generation and well-used 'weird' track
3) these are tiles that are more unique and in the popular 'exotic variants'
4) these are exotic tiles that probably can import into the tool without fuss but basically nobody uses them and they are in obscure games with no plays
5) these are tiles with game-time behaviors we are not currently supporting-->
---

## 12. Special Tiles — DSL Render Compatibility Tests

The tiles below were used as functionality checks to verify that the tool can correctly render hexes from raw DSL strings, even when those hexes have no official tile number in the standard manifest or tile packs. They are preprinted static hexes that live on specific game maps, not upgrade tiles.

### Altoona (1830)

PRR home city. One city plus a bypass. DSL: `city=revenue:10,loc:2.5;path=a:1,b:_0;path=a:4,b:_0;path=a:1,b:4`

**loc: on a map DSL city IS the visual position** (not merely a routing hint). `loc:2.5` → angle=150° → flat-top coords: cityLocX=-12.5, cityLocY=-21.65. After the SVG rotate(30°) wrapper for pointy-top orientation, this resolves to (0, -25) in screen space — horizontally centered, 25 units above center. This matches the reference rendering exactly.

Two exits (edges 1+4 = left+right after rotation). Tracks: straight lines from left/right edge midpoints up to the city circle at (0,-25). Bypass track (path=a:1,b:4, diff=3): straight horizontal line from left to right midpoint. Result: horizontal bypass at center height, two angled lines going up to the city circle above.

**rotateLocPos() must NOT be applied to cityLocX/Y** — the SVG rotate(orientDeg) wrapper already handles orientation. Applying rotateLocPos was a double-rotation bug.

### Chicago (1846)

4 token slots, 5+ exits converging. Large city circle, expanded radius to accommodate 4 tokens. Tests multi-slot city rendering.

### London (1822) / 1822 MX Mexico City

Two separate city slots at opposite positions, each serving a distinct set of exits. Tests OO-style layout with non-default city positions and exit pairing. These two tiles are geometrically identical — the 1822 MX version is a London rebrand, not related to 18MEX Mexico City.

18MEX Mexico City is a different, more complex hex: a 3-slot city with a town, double-track from one edge, and label=MC. Used to test multi-component DSL parsing.

---

## 13. Tobymao DSL Reference (for import-ruby.js)

The tobymao DSL is the format used in `.rb` game files. Main components separated by `;`, sub-fields by `,`, lists by `|`.

`city` — `slots:N` (default 1). Token-bearing city.
`town` — `style:rect|dot|hidden`. rect = bar. dot = circle. hidden = invisible.
`offboard` — marks a node as an offboard terminal (track to it is tapered/pointed).
`junction` — Lawson-style center-point node.
`path` — `a:X,b:Y` required (X/Y = edge int or `_N` node ref). Optional: `terminal:1` (tapered), `terminal:2` (short taper), `ignore:1`, `a_lane:W.I`, `b_lane:W.I`, `lanes:N`.
`label` — large text overlay. Always render when present.
`upgrade` — `cost:N,terrain:mountain|water,loc:5.5`.
`border` — `edge:N,type:mountain|water|impassable,cost:N`.
`icon` — `image:name,sticky:1,blocks_lay:1,loc:5.5`. Tiles with icons go in the dumb pack.
`frame` — `color:X,color2:Y`.

Revenue: `revenue:N` (single integer) or phase-based `yellow_40|green_50|brown_60|gray_80`. `hide:1` suppresses display.

Track references: integer N = hex edge in tobymao numbering (apply `(N+1)%6` to get canvas numbering). `_N` = Nth city/town/offboard/junction in string order (0-indexed).

Lane attributes: `a_lane:W.I` — W = total lane width, I = lane index. The exact semantics of lane attributes are not fully verified in the current import implementation — treat as uncertain until audited.

---

## 14. Companies, Trains, Privates, and Markets

### Load order addition

The live JS directory (`18xxtools/js/`) contains more modules than the older worktree. The complete current load order includes: `financials-panel.js` (TENTH), `rule-builder.js` (ELEVENTH), `market-wizard.js`, `market-painter.js`, `config-panel.js`, `tile-geometry.js`, `tile-packs.js`, `trains-panel.js`. Always read from `18xxtools/js/` — not from `.claude/worktrees/*/js/`.

### Companies panel (`companies-panel.js`)

Tabular editor for companies, trains, and privates. Actual state schema from code:

**CompanyObject:** `{ name, abbr, color, homeHex, parValue, tokens, floatPct }`

**TrainObject:** `{ type, cost, distance, rustsOn, obsoleteOn, count }`

**PrivateObject:** `{ name, cost, revenue, ability }`

### Export (`io.js`)

Produces a ZIP: `map.json` (hex grid), `tiles.json` (train types), `game.json` (meta + terrain costs), `companies.json` (companies + privates). These are intermediate design JSON files — not directly consumable by 18xx-master. A future Ruby bridge translation step is required.

---

## 15. The Financials / Market System — What Is Actually Built

The market IS implemented. It spans four JS files: `financials-panel.js`, `market-wizard.js`, `market-painter.js`, and `rule-builder.js`. The "Logic Builder" visible in the right panel of the UI is `rule-builder.js`.

### `state.financials` schema

```js
state.financials = {
  bank:        12000,
  marketType:  '2D' | '1D' | 'zigzag',
  market:      [],          // 2D: array of row arrays; 1D/zigzag: flat array of strings
  marketRows:  11,
  marketCols:  19,
  rules: {
    dividend: 'right',      // share price direction on dividend payment
    withheld: 'left',       // share price direction on withhold
    soldOut:  'up',         // share price direction when sold out at end of SR
    canPool:  true          // whether shares can be placed in bank pool
  },
  logicRules: [],           // array of rule objects from the Logic Builder
  locks: {}                 // { 'r,c': price } — cells the wizard must not overwrite
}
```

Each cell in `market` is a string like `'100'`, `'80p'`, `'40y'`, `'60b'`, `''` (empty/inactive).

### `financials-panel.js` — market grid editor

Handles bank config, market type selector (2D/1D/zigzag), grid dimension inputs (rows/cols), and the cell-by-cell market editor. Three template presets are wired in: 18Chesapeake, 1846, and 1862. Provides context menus on right-click for cell operations. Functions: `initFinancialsListeners()`, `resetMarketStructure()`, `resizeMarketStructure()`, `renderMarketEditor()`, `syncFinancialsUI()`.

### `market-wizard.js` — price solver

Auto-generates market prices using interpolation (Row 0) and downward propagation (lower rows, standard 18xx staircase). Respects manually locked cells. Algorithm: anchors from locked cells + min/max inputs → interpolate gaps in Row 0 → propagate each lower row from the row above using `getPrev18xxPrice()` with standard 18xx increments (5 below 100, 10 up to 200, 20 up to 500, 50 above). `roundTo18xxIncrement()` snaps values to nearest 5/10/20.

### `market-painter.js` — zone/lock brush tool

Painter with brushes: `price` (default, text input), `locked` (toggle lock on a cell), `eraser` (clear cell and lock), and zone brushes `p`/`y`/`o`/`b`/`c`. Painting appends the suffix character to the numeric value (e.g., `'80'` → `'80y'`). `enforceContiguity()` left-packs filled cells in each row (removes holes) and clears all locks.

### Cell suffix legend

`p` — par value (companies float from here). `y` — yellow zone. `o` — orange zone. `b` — brown zone. `c` — (custom, game-specific). Empty cell = inactive (staircase step).

### `rule-builder.js` — Logic Builder (drag-and-drop)

Drag-and-drop pill system for constructing stock price movement rules. A rule has: one trigger → zero or more AND conditions → one action. Rules are stored in `state.financials.logicRules[]`.

**Triggers** (purple pills): `if_paid` (Pays Dividend), `if_withheld` (Withholds), `if_sold_out` (Sold Out), `if_shares_sold` (Shares Sold), `if_no_run` (Doesn't Run).

**Condition fields** (blue = entity_type, green = revenue/revenue_calc, grey = others): `entity_type`, `price`, `bank`, `revenue`, `revenue_calc`, `sold_out_timing`, `sold_by`, `dividend`. Each condition is `{ field, op, value, unit }` where unit is `'percent'` or `'value'`.

**Actions** (teal pills): `move` (right/left/up/down/up_twice/right_twice), `end_game`, `bankrupt`.

Rules can be reordered by drag handle, edited (restored to builder), or deleted. `renderLogicRules()` rebuilds the committed rules list below the market grid.

### 18xx market mechanics context

The market grid is a 2D staircase — Row 0 is the longest (all columns active), each successive row is one column shorter from the right. A company whose price reaches the end of a short row and needs to move left will instead move up to the longer row above (the "bumping up" behavior). This is what `enforceContiguity()` enforces structurally — empty cells must be at the right end of each row.
<!-- THIS IS SO WRONG Markets have various shapes, 1D, 1.5D, and 2D, you don't understand this, so do research, you mention it in the financial panels.js notes but you clearly don't know how to relate these concepts-->
Price movement semantics: right = price increase, left = decrease, up = move to higher row (better position), down = move to lower row. The `rules` object in `state.financials` captures the base movement directions for the four main triggers. `logicRules` captures conditional overrides (e.g., pay ≥ 200% → move right twice instead of once).


---

## 16. Known Issues and Open Questions

**Active renderer bugs:** Render order (terrain icons/labels at wrong Z-level), revenue bubbles duplicating across `loc` groups, grey tiles appearing yellow due to 'grey'/'gray' key mismatch.

**Pending removal:** `terrainCosts` global config and `TERRAIN_COLORS` palette — terrain costs belong on individual hexes per DSL convention.

**Open design question:** Whether transposed-axes imports should normalize `staggerParity` at import time or carry it at runtime.

**Missing tiles:** Brown/grey dual-town upgrades 630–633 not yet in `TILE_DEFS`. These are upgrade targets for tiles 1, 2, 55, 56, 69.

**TILE_DEFS misclassifications:** Tiles 1, 2 (oo→dualTown), 141, 142 (bar + wrong circle), 55, 56, 69 (circles→bars).

**Not yet built:** Market configuration UI, phase definitions, Ruby export bridge.

---

## 17. What the Tool Does NOT Do

It does not play games. It does not validate game rules. It does not connect to the internet or 18xx.games server. It does not modify `18xx-master` in any way. It does not currently produce Ruby files directly — it produces intermediate JSON that requires a future translation step.

---

*End of reference document. Correct inaccuracies and return — this document will be updated accordingly.*
