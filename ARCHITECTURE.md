# Architecture Reference

This document is aimed at developers and AI assistants working on `18xxtools`. It describes the data model, module responsibilities, coordinate conventions, rendering pipeline, and the Ruby import pipeline.

---

## Load Order

Scripts must be loaded in this exact order (see `index.html`):

```
constants.js        → TILE_DEFS, HEX_SIZE, EDGE_MIDPOINTS, TERRAIN_COLORS
state.js            → state{}, activeTool, zoom/pan, canvas/ctx/container
hex-geometry.js     → hexId, getHexCenter, pixelToHex, hexCorners, trackPath
renderer.js         → drawHex, render, resizeCanvas
canvas-input.js     → canvas event listeners, applyTool, ensureHex
context-menu.js     → showContextMenu, removeContextMenu
palette.js          → buildPalette, updateStatus
hex-panel.js        → updateHexPanel, hex tab listeners
companies-panel.js  → renderCompaniesTable, trains, privates, tabs
setup.js            → showSetup, hideSetup, loadPreset, setup listeners
io.js               → save/load/export, autosave, localStorage restore
import-ruby.js      → importRubyMap, parseHexCode, matchTileDef, etc.
```

All scripts use `var`/`let`/`const` at the top level — they are **not** ES modules. Functions must be globally accessible for cross-module calls to work without a bundler, preserving offline/no-server operation.

---

## Coordinate Conventions

### 18xx.games grid coordinates

- Columns are letters: `A`, `B`, `C`, …
- Rows are numbers: `1`, `2`, `3`, …
- **Flat-top layout**: odd columns (B, D, F…) use odd row numbers (1, 3, 5…); even columns (A, C, E…) use even row numbers (2, 4, 6…). Odd columns sit half a row higher.

`hexId(row, col)` converts internal 0-indexed `(row, col)` to the 18xx.games coordinate string:
```
hexId(0, 0) → 'A2'   // even col → coordRow = 2*0+2 = 2
hexId(0, 1) → 'B1'   // odd  col → coordRow = 2*0+1 = 1
hexId(1, 0) → 'A4'
hexId(1, 1) → 'B3'
```

### Tile SVG coordinate space

All tile paths are defined in a coordinate space where:
- The hex is centered at `(0, 0)`
- Circumradius = **50** (i.e. corner points are at distance 50 from center)
- Apothem ≈ **43.3** (distance from center to edge midpoint)
- Y axis points **down** (standard canvas convention)

The 18xx.games manifest SVGs use circumradius = **100**. When porting tile paths from the manifest, divide all coordinates by 2.

### EDGE_MIDPOINTS (constants.js)

6 edge midpoints for flat-top hex at radius 50, indexed 0–5 clockwise from lower-right:
```
0 → lower-right  ( 37.5,  21.65)
1 → bottom       (  0,    43.3 )
2 → lower-left   (-37.5,  21.65)
3 → upper-left   (-37.5, -21.65)
4 → top          (  0,   -43.3 )
5 → upper-right  ( 37.5, -21.65)
```

Note: the import pipeline uses a **different** edge numbering (`IMPORT_EDGE_PTS` in `import-ruby.js`), where 0 = North/top and edges proceed clockwise. Matching tiles during import uses this import space, not `EDGE_MIDPOINTS`.

---

## State Object

`state` in `state.js` is the single source of truth. It is serialized directly to JSON on save:

```js
state = {
  meta: {
    title: string,
    baseGame: 'custom' | '1830' | '1846' | '1822' | '1889',
    rows: number,          // grid row count (0-indexed internally)
    cols: number,          // grid column count
    orientation: 'flat',   // 'pointy' not used in practice
    bank: number,          // bank size in dollars
    playersMin: number,
    playersMax: number,
  },
  hexes: {
    [hexId: string]: HexObject  // e.g. { 'A2': {...}, 'B3': {...} }
  },
  companies: CompanyObject[],
  trains: TrainObject[],
  privates: PrivateObject[],
  terrainCosts: { mountain, hill, water, swamp, forest, desert, pass: number },
  phase: 'setup' | 'design',
}
```

### HexObject

```js
{
  terrain: '' | 'mountain' | 'hill' | 'water' | 'swamp' | 'forest' | 'desert' | 'pass' | 'offmap',
  terrainCost: number,         // dollar cost to build through this hex
  tile: number | 0,            // tile number (0 = no tile placed)
  rotation: 0–5,               // tile rotation in 60° increments
  city: null | {               // standalone city (not OO)
    name: string,
    slots: 1 | 2 | 3,
    home: string,              // company abbreviation or ''
    revenue: { yellow, green, brown, grey: number }
  },
  town: null | { name: string } | false,
  oo: boolean,                 // OO city (dual station)
  ooCityName: string,          // name displayed under OO hex
  dualTown: boolean,           // dual-town (dit×2)
  cityName: string,            // name for placed OO/city tiles
  label: string,               // arbitrary label (e.g. 'NY', 'OO')
  upgradesTo: number[],        // explicit upgrade path (tile numbers)
  overrideUpgrades: boolean,
  riverEdges: number[],        // edge indices (0–5) with river marking
  killed: boolean,             // hex is off-map (dark overlay + X)
}
```

---

## TILE_DEFS Schema

Each entry in `TILE_DEFS` (in `constants.js`) represents one tile variant:

```js
{
  svgPath: string,          // SVG path commands, circumradius=50 space
  color: 'yellow' | 'green' | 'brown' | 'grey',
  city?: true,              // single city circle at center (r=14)
  oo?: true,                // OO station
  town?: true,              // single town bar at center
  townAt?: { x, y, rot, rw, rh },  // off-center positioned town bar
  dualTown?: true,          // two town circles
  cityPositions?: [{x,y}],  // custom OO city circle centers (r=12.5)
  townPositions?: [{x,y}],  // custom dual-town circle centers (r=10.25)
  revenue?: { x, y, v },   // single revenue bubble
  revenues?: [{ x, y, v }],// multiple revenue bubbles (dual-town tiles)
  tileLabel?: 'Y' | 'T',   // small non-rotating letter at hex left edge
}
```

**Adding a new tile**: append an entry to `TILE_DEFS`. The tile will automatically appear in the palette if added to the tile swatch HTML in `index.html`.

---

## Rendering Pipeline

`render()` in `renderer.js`:
1. Clears the canvas
2. Iterates all `(row, col)` in the grid, calls `drawHex(row, col, hex)`
3. Draws axis labels pinned to canvas edges (column letters top, row numbers left)

`drawHex(row, col, hex)`:
1. Compute canvas position: `center = getHexCenter(row, col, HEX_SIZE, orientation)`, apply `panX/panY/zoom`
2. Fill hex polygon with terrain or tile color
3. Stroke hex border (gold if selected, grey otherwise)
4. If `hex.tile` → clip to hex shape, translate/rotate/scale to SVG space, stroke the path, draw city/town/OO/dualTown markers, restore
5. Draw revenue bubble(s) in canvas space (not rotated with tile)
6. Draw city/town/OO/dualTown markers for **un-tiled** hexes (white hexes)
7. Draw terrain cost label, killed overlay, hex label, river edges

Scale relationship: `scale = (HEX_SIZE * zoom) / 50` maps tile SVG coords to canvas pixels.

---

## Ruby Import Pipeline

`importRubyMap(content)` in `import-ruby.js`:

1. **Strip line continuations** — Ruby `'\`\n'` string joins
2. **AXES detection** — reads `AXES = { x: :letter, y: :number }` or `x: :number` (transposed, used by 1882)
3. **LOCATION_NAMES** — extracts `'coord' => 'City Name'` pairs
4. **HEXES block** — extracts white/yellow/green sub-blocks (red/grey skipped)
   - Each pair `%w[A1 B2] => 'code'` or `['A1'] => 'code'` is parsed via `parseHexCode()`
5. **coordToGrid(coord)** — converts 18xx coord string to internal `{row, col}`
   - Standard: letter → col, number → row
   - Transposed: number → col, letter → row
6. **matchTileDef(edges, color, hasCityOrOO)** — tries all TILE_DEFS at all 6 rotations to find an edge-set match
7. **Fill killed hexes** — any grid position not in the `.rb` file becomes a killed hex

**Edge numbering in import space** (IMPORT_EDGE_PTS): 0=N, 1=NE, 2=SE, 3=S, 4=SW, 5=NW — this matches the 18xx.games convention. Tile edges from `TILE_DEFS.svgPath` are auto-converted by `svgPathToEdgeSet()` which maps each `M x y` endpoint to the nearest IMPORT_EDGE_PTS entry.

---

## Adding Game Support (Future)

The current architecture bakes game presets (1830, 1846, 1822, 1889) into `setup.js`. A planned evolution:

1. Add a `games/` folder with one JSON file per game (or `.rb` file + manifest)
2. On the Setup screen, populate the base game `<select>` dynamically from the game list
3. `loadPreset()` fetches the appropriate JSON instead of reading a hardcoded object
4. A separate manifest import tool can populate `TILE_DEFS` from game-specific tile JSON

The `state` schema is already structured to hold companies, trains, and privates — the main gap is a rulesheet/phase/special-power model, which is out of scope for the current map-design tool.

---

## Known Conventions / Gotchas

- **HEX_SIZE = 40** — circumradius used for canvas geometry. Tile SVG paths use radius 50. Scale factor = `zoom * HEX_SIZE / 50`.
- **`activeTile`** can be either an integer (standard tiles like `57`) or a string (custom tiles like `'X3'`). Always use `String(activeTile)` for TILE_DEFS lookup and `parseInt(tileNum)` only for display.
- **Tile 94** is yellow (manually corrected from an initial green classification). The `revenues` array is used instead of a single `revenue` object for dual-town tiles.
- **Revenue bubbles do not rotate** with the tile — they are drawn in canvas space after the tile clip/transform is restored.
- **River edges** use a different numbering (0–5 = lower-right, bottom, lower-left, upper-left, top, upper-right) than IMPORT_EDGE_PTS (0–5 = N, NE, SE, S, SW, NW).
