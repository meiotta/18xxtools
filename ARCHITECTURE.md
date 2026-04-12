# 18xxtools — Architecture Reference
## DSL-First Tile Registry (target architecture as of 2026-04-12)

---

## Core Principle

**Everything renders from DSL.** There is no pre-parsed tile lookup table. Every tile definition is stored as a DSL string in a pack. The registry assembles packs at runtime, parses DSL on demand, and the renderer draws from normalized `tileDef` objects. One pipeline, no special cases.

---

## The Pipeline

```
PACKS (DSL strings)
  ├── tile-packs.js        — built-in packs (standard, white-features, game-specific)
  ├── localStorage         — user custom pack (survives New Map, persists in browser)
  └── save file            — map-embedded custom tiles (portability)
         ↓
REGISTRY  js/tile-registry.js
  └── getTileDef(id) → normalized tileDef (parsed + cached)
         ↓
DSL PIPELINE  js/tile-geometry.js  (DO NOT MODIFY)
  └── parseDSL(dsl, color) → normalizeTileDef(raw) → tileDef
         ↓
RENDERER  js/renderer.js
  └── draws from tileDef.nodes[], tileDef.paths[], tileDef.svgPath
```

---

## Files and Responsibilities

### `js/tile-geometry.js` — DSL parser + normalizer (READ-ONLY CORE)
- `TILE_GEO.parseDSL(dsl, color)` — converts Toby Mao DSL string to raw tileDef
- `normalizeTileDef(raw)` — computes geometry: townPositions, svgPath, node x/y coords
- Produces: `{ color, nodes[], paths[], townPositions[], svgPath, label }`
- **Do not modify.** Everything else adapts to its output format.

### `js/tile-packs.js` — Pack definitions (DSL source of truth)
- `TILE_PACKS` object: pack name → color → tile ID → `{ dsl, color }`
- `TILE_PACK_ORDER` array: canonical display order
- `getAllRenderableTiles(enabledPacks)` — used only during migration; registry replaces this
- Add new pack: `'White Features'` (always enabled):
  ```js
  'white-blank':     { dsl: '', color: 'white' }
  'white-town':      { dsl: 'town=revenue:0', color: 'white' }
  'white-dual-town': { dsl: 'town=revenue:0;town=revenue:0', color: 'white' }
  'white-city':      { dsl: 'city=revenue:0', color: 'white' }
  'white-oo':        { dsl: 'city=revenue:0;city=revenue:0', color: 'white' }
  ```

### `js/tile-registry.js` — Runtime tile registry (NEW)
Single source of truth for tile lookup. Replaces `TILE_DEFS` entirely.

**API:**
- `TileRegistry.getTileDef(id)` → normalized tileDef or null
- `TileRegistry.getAllTileDefs()` → `{ id: tileDef, ... }`
- `TileRegistry.rebuildRegistry()` → assembles from enabled packs + localStorage + embedded tiles
- `TileRegistry.addCustomTile(id, dsl, color)` → saves to localStorage + rebuilds
- `TileRegistry.setEmbeddedTiles(tiles)` → load map-embedded custom tiles + rebuilds
- `TileRegistry.nextCustomId()` → next available 9000+ ID
- `TileRegistry.exportCustomPack()` → JSON string for download
- `TileRegistry.importCustomPack(jsonString)` → merge into localStorage + rebuilds

**Assembly order (first wins):**
1. Built-in packs (White Features always; others per user toggle)
2. User custom pack from `localStorage['18xxtools-custom-pack']`
3. Map-embedded tiles (from current save file, set by io.js on load)

### `js/constants.js` — Genuine constants only
After refactor, contains ONLY:
```js
const HEX_SIZE = 40;
const LABEL_PAD = 20;
const TERRAIN_COLORS = { ... };
const TILE_HEX_COLORS = { white: '#D4B483', yellow: '#F0D070', green: '#71BF44', brown: '#CB7745', grey: '#BCBDC0' };
const STATIC_BG_COLORS = { ... };
```
**`TILE_DEFS` is removed entirely.** Any `TILE_DEFS[x]` reference after refactor is a bug.

### `js/renderer.js` — Canvas renderer
- **For placed tiles** (`hex.tile` is set): calls `TileRegistry.getTileDef(hex.tile)`, draws from `tileDef.nodes[]` and `tileDef.paths[]`. Does NOT consult `hex.feature`.
- **For static/prebuilt hexes** (`!hex.tile`): consults `hex.feature` for offboard, preprinted city/town, killed hexes. This is the only remaining use of `hex.feature`.
- **No roundRect anywhere.** Cities are circles only.
- **No flag-based branches** (`hex.oo`, `hex.dualTown`, etc.) for placed tiles.

Drawing a city node (from tileDef.nodes):
```js
function drawCityCircle(x, y, sc) {
  ctx.beginPath();
  ctx.arc(x, y, 11 * sc, 0, Math.PI * 2);
  ctx.fillStyle = 'white'; ctx.fill();
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5 * sc; ctx.stroke();
}
```

### `js/palette.js` — Tile swatches + palette UI
- `_injectPackTiles()` is **removed** — registry replaces it
- `makeTileSwatchSvg(id)` reads `TileRegistry.getTileDef(id)` instead of `TILE_DEFS[id]`

### `js/tile-manifest.js` — Tile manifest view
- Reads `TileRegistry.getAllTileDefs()` instead of `TILE_DEFS`

### `js/io.js` — Save/load
**Save:** embed custom tile DSL for any 9000+ tile IDs used in the map:
```json
{
  "meta": { ... },
  "hexes": { ... },
  "customTiles": {
    "9001": { "dsl": "city=revenue:20;path=a:0,b:_0", "color": "yellow" }
  }
}
```
**Load:** `TileRegistry.setEmbeddedTiles(saveData.customTiles || {})`

### `js/setup.js`
Call `TileRegistry.rebuildRegistry()` after state is initialized, before first render.

### `index.html` — Script load order
```html
<script src="js/tile-geometry.js"></script>    <!-- FIRST: parseDSL, normalizeTileDef -->
<script src="js/tile-packs.js"></script>        <!-- TILE_PACKS -->
<script src="js/tile-registry.js"></script>     <!-- TileRegistry — NEW, before constants -->
<script src="js/constants.js"></script>         <!-- HEX_SIZE, colors (no TILE_DEFS) -->
<script src="js/state.js"></script>
<script src="js/renderer.js"></script>
<!-- ... rest unchanged -->
```

---

## Persistence Model

| Where | What | Survives |
|-------|------|---------|
| `tile-packs.js` | Standard tiles | App version |
| `localStorage['18xxtools-custom-pack']` | User custom tiles (9000+ IDs) | New Map, page refresh, browser restart |
| Save file `customTiles` field | Custom tiles used in THIS map | Portable, travels with `.json` |
| Session memory | Currently loaded embedded tiles | Until next page load |

**New Map** resets `state` only. Does not touch `localStorage`. Custom tiles survive.

---

## Tile Editor Integration

When the user completes a tile in `tile-editor.html`:
```js
const id = TileRegistry.nextCustomId();  // e.g. '9001'
const dsl = generateDSL();              // from editor state
TileRegistry.addCustomTile(id, dsl, editorState.color);
// tile immediately appears in manifest and palette
```

Hex-linked mode: tile is also added to the hex's `upgradeIds[]` list in map state.

---

## What Does NOT Change

- `tile-geometry.js` — core DSL parser, untouched
- `tile-packs.js` structure — pack format stays, just add White Features
- `hex.feature` — stays for static hex features where no tile is placed
- `state.hexes` schema — `hex.tile` string ID is still the reference
- Hex panel, companies panel, trains, financials — untouched
- `static-hex-builder.js` — untouched (build-a-hex foundation)

---

## Implementation Order

1. Create `js/tile-registry.js`
2. Add White Features pack to `tile-packs.js`
3. Remove `TILE_DEFS` from `constants.js`
4. Update `index.html` load order
5. Replace all `TILE_DEFS[x]` → `TileRegistry.getTileDef(x)` in renderer.js, palette.js, tile-manifest.js
6. Remove `_injectPackTiles()` from palette.js
7. Simplify renderer: remove roundRect, unify feature drawing to `nodes[]` loop for placed tiles
8. Update io.js for custom tile embed on save + `setEmbeddedTiles()` on load
9. Wire `TileRegistry.rebuildRegistry()` in setup.js
10. Fix renderer bugs: OO node positioning, import path-to-node connection, map bounds/killed hexes

Each step is a separate commit.
