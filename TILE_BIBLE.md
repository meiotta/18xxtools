# 18xx Tile System — Reference Bible

## 1. Coordinate System

All tile geometry uses a **flat-top hexagon** with circumradius = 50 units, centered at (0, 0).

- Apothem (center to edge midpoint) = 43.3 units
- Edge midpoints are where track lines terminate at the hex boundary

### Exit Numbering (flat-top, 0-indexed CCW from lower-right)

```
         4 (top)
        / \
  3(UL)   5(UR)
  |           |
  2(LL)   0(LR)
        \ /
         1 (bottom)
```

| Edge | Label | Midpoint (x, y)   | Angle from center |
|------|-------|-------------------|-------------------|
| 0    | LR    | (+37.5, +21.65)   | 30°               |
| 1    | Bot   | (0, +43.3)        | 90°               |
| 2    | LL    | (−37.5, +21.65)   | 150°              |
| 3    | UL    | (−37.5, −21.65)   | 210°              |
| 4    | Top   | (0, −43.3)        | 270°              |
| 5    | UR    | (+37.5, −21.65)   | 330°              |

**Note:** Y-axis is inverted (canvas convention). "Top" in visual space is negative Y.

For **pointy-top** hexes (1830, 1822, many American games), the entire grid is rotated 30°, but individual tile geometries are defined the same way — only staggerParity changes which hexes are offset.

### Track Bar Rotation Rule

Town bars are drawn as rectangles (width=16.93, height=4.23) along the track direction. The `rot` parameter is the **bisector angle of the two exit directions**, mod 180°:

```
rot = ((exitAngle1 + exitAngle2) / 2) mod 180
```

Examples:
- Exits 1(90°) + 4(270°) → bisector 180° → rot=0 (horizontal bar on vertical track)
- Exits 1(90°) + 2(150°) → bisector 120° → rot=120
- Exits 1(90°) + 3(210°) → bisector 150° → rot=−30 (≡ 150°)

---

## 2. Station Types

### Blank Track
No station marker. Just SVG path connecting exits.
```
field: (none)
examples: 7, 8, 9 (yellow); 16-29 (green hostile); 39-47 (brown hostile)
```

### Single Town (Dit) — Two Rendering Modes

The visual form of a town depends on whether the track is **hostile (through-route)** or **permissive (junction)**:

#### Mode A: Bar Town (Hostile Through-Route)
When a town sits on an independent through-route where two exits are connected directly without sharing a center junction. The bar is perpendicular to the track direction, crossing it.

```
field: townAt: { x, y, rot, rw, rh }
  rw = 16.93 (bar length along track direction bisector)
  rh = 4.23  (bar thickness)
examples: 3, 4, 58 (yellow); 141, 142 (green)
```

**Rendering:** Filled black rectangle. No circle. No dot. **NO REVENUE NUMBER INSIDE THE BAR.**

⚠️ **ABSOLUTE RULE**: The revenue value is NEVER rendered inside the town bar rectangle. It lives in a separate small bubble (circle or rounded rect) positioned nearby — offset from the bar, not overlapping it. Any code that draws a revenue number inside a town rect is wrong and must be fixed immediately.

#### Mode B: Dot Town (Permissive Junction)
When a town sits at a shared center junction where 2 paths converge and all exits share that center point (permissive layout). Also used when 3+ exits all meet at one town node.

```
field: junction: true   (or dotTown: true)
       town: { x, y }   — position (usually center)
       revenue: { x, y, v }
examples: standard permissive single-town tiles (e.g. tiles where all paths share one center node)
```

**Rendering:** Small filled black circle, radius ≈ 5 units. No rectangle.

**3-or-more exits rule:** If 3+ exits all connect to a single town node (permissive Y or T or star junction), the town is ALWAYS a black dot, regardless of whether the tile is classified as permissive or hostile elsewhere.

### Dual Town (Two Dits)
Two separate single towns on one hex, each on its own through-route. Two independent revenue stops, no token slots. White (unimproved) dual-town hexes upgrade to these.

```
field: dualTown: true
       townPositions: [{ x, y, rot, rw, rh }, { x, y, rot, rw, rh }]
       revenues: [{ x, y, v }, { x, y, v }]
examples: 1, 2, 55, 56, 69 (yellow)
upgrade targets: 630, 631, 632, 633 (brown/grey — not yet in constants)
```

> **Each town in dualTown is a through-route bar.** They are bars, not circles. If one of the sub-routes had 3+ exits merging at that town, it would become a dot — but dualTown tiles are by definition 2-exit hostile tracks, so always bars.

### Single City
One open white circle where a company can place a station token. Trains that stop here score the city's revenue. Trains that don't stop pass through without scoring.

```
field: city: true
       revenue: { x, y, v }
examples: 5, 6, 57 (yellow); X1, X2 (green); 767, 768, 769 (brown); 915 (grey)
```

### OO (Double City, 180° apart)
Two city token slots arranged in a straight line through the hex, enclosed by a white rectangular/oval frame. Two separate companies can each place a token. Each city scores its revenue independently.

```
field: oo: true
Standard layout (cities at center-left and center-right):
  → draw white rounded rect + two inner circles (no cityPositions needed)
Custom layout (cities off-center, e.g. tiles 1, 2, 94, X3–X5):
  → cityPositions: [{ x, y }, { x, y }]
  → draw a connector line/rect between the two positions, then circles on top
examples: 14, 15, 619, 622 (green); 611 (brown); X20–X23 (all eras)
```

> **OO label:** Standard OO tiles include `label=OO` in their DSL → **render the "OO" text** (top-left, large). The label IS displayed — confirmed by tobymao TILES.md example of Baltimore H6. The frame + two circles + label all appear together.

### C (Double City, 120° apart)
Like OO but the two city slots are arranged at 120° to each other, not 180°. Creates a Y-shaped double-city tile. Relevant to specific game variants. Not yet in constants.

```
field: (planned) c: true
       cityPositions: [{ x, y }, { x, y }]
       — positions are ~25 units from center at 120° offset
```

### Offboard / Terminal
Pre-printed permanent revenue that does not accept tokens. Shown with colored background (usually red/dark red) and revenue arrows pointing inward. These are part of the static hex builder, not the standard tile progression.

---

## 3. Phase Colors

### The Four Upgrade Eras

| Color  | TILE_HEX_COLORS | Meaning                          |
|--------|-----------------|----------------------------------|
| Yellow | #F0D070         | First upgrade from white         |
| Green  | #71BF44         | Second upgrade                   |
| Brown  | #CB7745         | Third upgrade                    |
| Grey   | #BCBDC0         | Final upgrade (some games only)  |

### ⚠️ CRITICAL DISTINCTION: "Grey Phase" vs "Static Gray"

**Grey-phase tiles** (`color: 'grey'` in TILE_DEFS): Standard late-game upgrade tiles. Examples: 60, 169. Cities upgrade FROM brown TO these grey tiles during the grey phase.

**Static/pre-printed hex** (the Build-a-Hex feature): A hex on the physical map with permanent track that NEVER upgrades. This is NOT a "grey tile" in the phase sense. The background color might be gray/tan, but these are:
- Offboard stations
- Blocking hexes
- Pre-printed permanent routes (e.g., Altoona in 1830)
- Grey (permanent) city hexes that don't follow the standard upgrade path

The Build-a-Hex feature should be labeled **"Pre-printed / Static Hex"**, not "grey tile builder," to avoid confusion.

---

## 4. Track Geometry

### Arc Radii (approximate, in SVG units with circumradius=50)

| Route type      | Arc radius | Description                          |
|-----------------|------------|--------------------------------------|
| Sharp curve     | ~25        | 60° turn (adjacent exits, e.g. 0→1)  |
| Gentle curve    | ~75        | 120° turn (alternate exits, e.g. 0→2)|
| Straight        | ∞ (line)   | 180° (opposite exits, e.g. 0→3)      |
| Hostile curve A | ~75        | Non-junction curve through hex        |
| Hostile curve B | ~25        | Tight non-junction curve              |

### Hostile vs Permissive Track

**Permissive** (most tiles): All paths on the tile share a common junction point. Any train entering from any exit can reach any other exit.

**Hostile** (tiles 16–29 green, 39–47 brown): Multiple independent routes that cross the hex without connecting. A train on route A cannot switch to route B at the crossing. In SVG: separate `M` commands that never share an endpoint.

---

## 5. Current TILE_DEFS — Known Issues

| Tile | Issue | Fix |
|------|-------|-----|
| 1    | Classified `oo:true` — should be `dualTown:true` | Change to dualTown, add townPositions with rot angles, split revenue into two ×10 bubbles |
| 2    | Same as tile 1 | Same fix |
| 141  | `town:true` renders bar + white circle — circle is wrong | Remove white circle, keep only black bar |
| 142  | Same as 141 | Same fix |
| 55/56/69 | `dualTown` renders as circles — should be bars | Update townPositions to include rot, rw, rh; update renderer |

### Correct townPositions for dualTown tiles

| Tile | Town | Exits   | rot |
|------|------|---------|-----|
| 55   | 1    | 1,4     | 0   |
| 55   | 2    | 2,5     | 60  |
| 56   | 1    | 1,3     | −30 |
| 56   | 2    | 2,4     | 30  |
| 69   | 1    | 1,4     | 0   |
| 69   | 2    | 3,5     | 90  |
| 1    | 1    | 2,4     | 30  |
| 1    | 2    | 1,5     | 30  |
| 2    | 1    | 1,4     | 0   |
| 2    | 2    | 2,3     | 0   |

---

## 6. Missing Tiles to Add

### Brown/Grey Dual-Town Upgrades
Tiles 1/2/55/56/69 upgrade to these (not yet in constants):
- **630**: brown dual-town (exits TBD per game)
- **631**: brown dual-town
- **632**: grey dual-town
- **633**: grey dual-town

### Standard Missing Yellow
Tiles 7, 8, 9 are blank yellow track tiles (no station). They exist in TILE_DEFS but are missing from the 1822 base set. 1822 has unlimited supply of these (null count).

---

## 7. Architecture Decision: Build-a-Hex vs Full Manifest

### What Build-a-Hex should do (restricted scope)

The static hex builder handles hexes that **never participate in the standard tile upgrade system**:
1. **Offboard stations** — colored terminus hexes with revenue arrows
2. **Pre-printed permanent track** — routes that exist from game start and don't upgrade (Altoona, mountain passes, certain river crossings)
3. **Blocking hexes** — impassable terrain

The builder should NOT pretend to handle grey-phase tiles, exotic multi-city tiles, or the C-configuration. Those belong to the tile manifest.

### What the Tile Manifest should do

The manifest handles the **standard upgrade-path tiles** (yellow → green → brown → grey). Game presets (1830, 1822, etc.) load the correct tile counts. Users can add/remove tiles and set unlimited.

### Recommended next steps

**Option A — Expand TILE_DEFS to cover all common standard tiles**
Add the ~50 tiles that appear across most classic 18xx games but aren't in constants yet. Use game manifest JSON files (1830, 1822, 1846, etc.) as the source list. This covers probably 95% of what users need without trying to import the full 18xx.games catalog.

**Option B — Import tile data from 18xx.games game JSON**
18xx.games publishes game data JSON (e.g., `lib/engine/config/game/g_1830.rb` compiled to JSON). Each game JSON lists its tile set with counts. Import these as base tile sets in tile-manifest.js. Requires either fetching at import time (network) or bundling a subset of game JSONs in the repo.

**Recommendation:** Do Option A first (add missing standard tiles to TILE_DEFS) + restrict Build-a-Hex to offboard/pre-printed only. Option B can be added later as a "load from 18xx.games" button for power users.

---

## 8. Special Tiles — Non-Standard Geometry

These tiles appear in popular games and require exact rendering fidelity matching 18xx.games. They MUST be importable and buildable in Build-a-Hex.

### 8.1 Altoona (1830)

**Tile ID in 1830**: Pre-printed static hex (grey background, never upgrades). PRR home city.

**Configuration**: One city + a bypass. Trains can stop at the city (score revenue) OR take the bypass (skip city, no revenue from it).

**CONFIRMED GEOMETRY (screenshot + circumcircle math, corrected):**

```
Map orientation:  1830 is POINTY-TOP
Exits used:       LEFT (edge 4) and RIGHT (edge 1) — OPPOSITE exits in pointy-top hex
Bypass:           STRAIGHT horizontal line between these two exits. No curve. NO BEZIER.
City:             Slightly above hex center — (0, −cityOffset) in tile coords
Offramp arc:      ONE CIRCULAR ARC from left exit → city (peak) → right exit
                  The arc bows OUTWARD (upward from the bypass chord)
Revenue:          10, positioned to the left of the city circle
```

**Circumcircle geometry:**

The offramp arc is the unique circle passing through all three points: left exit, city, right exit. The center of this circle lies **below the hex** (outside the hex boundary):

```
ir  = inradius ≈ 86.6   (for circumradius 100, 18xx.games units)
cityOffset ≈ 28          (city is 28 units above center)

y_center = (ir² − cityOffset²) / (2·cityOffset)
         = (7499 − 784) / 56
         ≈ +119.9 units below center   ← OUTSIDE the hex (hex edge at ±86.6)

arc_radius ≈ 147.8 units  (≈ 1.7× the hex inradius — wide, shallow dome)
```

The arc sweeps ≈ 66° total (from ≈ −123° through −90° at the peak to ≈ −57°).

**In the tile DSL**, this is two separate path segments sharing the same circumcircle:
```
path=a:4,b:_0;   # left exit → city (left half of arc)
path=a:1,b:_0;   # right exit → city (right half of arc, mirror)
path=a:4,b:1;    # bypass: straight chord, left to right
```

**Implementation field:**
```js
// Static hex definition for 1830 Altoona:
{
  city: true,
  cityOffset: -28,          // city is 28 units above center (negative Y = up)
  revenue: { x: -20, y: -28, v: 10 },
  exits: [3, 5],            // city path exits (in our edge numbering)
  bypass: {
    exits: [3, 5],          // same exits — straight chord, no curve
  }
  // Renderer computes circumcircle of (exit3, city, exit5) automatically
  // and draws the wide dome arc + the straight bypass chord
}
```

**Renderer algorithm:**
1. Resolve positions of exit3, exit5, and city
2. Compute circumcircle of those 3 points → `(arcCenterX, arcCenterY, arcRadius)`
3. Draw arc from exit3 to exit5 (passing through city at the peak)
4. Draw straight bypass line from exit3 to exit5
5. Draw city circle on top (radius ~16 units)
6. Draw revenue bubble

### 8.2 Chicago (1846)

**Tile ID in 1846**: Pre-printed static hex (or very large city)

**Configuration**: Large city with 4 token slots, 5+ exits all converging on the city. No bypass needed — all trains stop.

**Track topology** (tobymao DSL approximation):
```
city=revenue:0,slots:4; path=a:0,b:_0; path=a:1,b:_0; path=a:2,b:_0; path=a:3,b:_0; path=a:4,b:_0; label=Chi
```

**Rendering**: Standard large city circle (expanded radius to accommodate 4 tokens), 5 track lines converging. Revenue bubble at edge. Should be renderable with current city infrastructure once slot count is respected.

### 8.3 London (1861)

**Configuration**: Two cities arranged at opposite edges (OO layout), each serving separate exits.

**Track topology** (tobymao DSL approximation):
```
city=revenue:0,loc:1; city=revenue:0,loc:4; path=a:0,b:_0; path=a:5,b:_0; path=a:2,b:_1; path=a:3,b:_1; label=L
```
- City 0 at loc:1 (edge 1 area) — serves exits 0 and 5
- City 1 at loc:4 (edge 4 area) — serves exits 2 and 3

**Rendering**: Standard OO frame with exit pairings matched to each city position.

### 8.4 Mexico City (1822 MX)

**⚠️ NOT the same as 18MEX Mexico City.** The 1822 MX version is a **London rebrand** — an OO-style layout with two city slots at opposite positions, not a single large multi-slot city. Treat it identically to the London tile geometry (see §8.3).

**Configuration**: Two city slots (OO style), specific exit pairings matched to each city's location.

**Track topology**: Same structure as London — two cities with paths split between them, OO visual frame, label=MC.

### 8.5 tobymao Edge Numbering vs Our System

**SOURCE OF TRUTH**: tobymao's TILES.md (saved as `TILES_tobymao.pdf` in repo root) shows the authoritative flat-top hex diagram:

```
         edge 3 (Top)
        /             \
  edge 2 (UL)     edge 4 (UR)
  |                         |
  edge 1 (LL)     edge 5 (LR)
        \             /
         edge 0 (Bottom)
```

**tobymao flat-top numbering** — clockwise from Bottom:
| tobymao | Direction | Our edge |
|---------|-----------|----------|
| 0       | Bottom    | 1 (Bot)  |
| 1       | Lower-Left| 2 (LL)   |
| 2       | Upper-Left| 3 (UL)   |
| 3       | Top       | 4 (Top)  |
| 4       | Upper-Right| 5 (UR)  |
| 5       | Lower-Right| 0 (LR)  |

**Conversion formula**: `ourEdge = (tobymaoEdge + 1) % 6`

**For pointy-top games** (1830, 1822): tobymao rotates the entire hex 30° but keeps the same numbering scheme in the DSL. The same `(N+1) % 6` conversion applies at import time — the renderer then handles pointy-top orientation via the staggerParity system.

**Audit required**: Verify that `import-ruby.js` actually applies this conversion when parsing `path=a:N,b:M` DSL. If it was using tobymao numbers directly as our numbers, all track has been off-by-one on every edge.

---

## 9. Tile Pack Classification Rules

Pack names come ONLY from `packwriter.txt`. No invented pack names. The only permitted addition beyond the user-defined packs is one catch-all "Unclassified (Review Needed)" pack.

### The Packs

1. **Basic Tile Pack** — standard starter set found across most classic 18xx games
2. **Junctions & Nontraditional Cities** — Lawson junctions + oddball yellow city variants
3. **Limited Exit & Token Cities** — dead-end / placeholder city tiles (revenue:0 cities)
4. **These are dumb and you are dumb but they don't break anything, I think** — exotic / game-specific tiles
5. **Unsupported** — narrow track (`track:narrow`) and dual track (`track:dual`) — excluded entirely from rendering

### Basic Tile Pack — what belongs here

**Yellow (user-defined):** 1, 2, 3, 4, 5, 6, 7, 8, 9, 55, 56, 57, 58, 69, 235

**Green:**
- Standard hostile crossings ("X tiles"): 16–31 (two separate paths crossing, no station)
- Single-city 3-exit: 12, 13
- OO cities (2-slot, ≥2 exits): 14, 15, 52, 59, 619, 622 — **these are normal OO tiles**
- K-label 2-slot cities ("K tiles"): 236, 237, 238
- Lawson junctions: 80, 81, 82, 83
- 4-exit towns: 87, 88
- Double-path short combos: 624, 625, 626

**Brown:**
- 2-city OO with 5 or 6 exits: 35, 36, 37, 64, 65, 66, 67, 68, 118 (and similar)
- Hostile crossings: 39, 40, 41, 42, 43, 44, 45, 46, 47, 70
- Big 2-slot cities: 38, 63
- Lawson junctions: 544, 545, 546
- 4-exit towns: 145, 146, 147, 148

**Gray:**
- 2-city and 3-city tiles with 5 or 6 exits
- Standard crossings: 452, 453, 454, 455
- All-exit junction: 60
- Standard 6-exit multi-slot cities

### "These are dumb..." — what belongs here

- **XX-label tiles** (`label=XX`): tiles 210–215 in green. **XX is NOT the same as X.**
- **Towns with revenue > 10** — any `town=revenue:N` where N > 10 (e.g. rev:20, rev:30)
- Tiles with `icon=` attributes
- Other exotic / game-specific tiles (user pre-filled: 115, 128, 437, 438, 445, 451a, 471–473, 790, 441a, 8850–8857)

### Unsupported — always excluded

- Any tile where any path contains `track:narrow`
- Any tile where any path contains `track:dual`

### Critical terminology

| Term | Meaning | Examples |
|------|---------|---------|
| **X tile** | A hostile crossing tile — two paths crossing, NO station, looks like an X | Tile 16: `path=a:0,b:2;path=a:1,b:3` |
| **K tile** | A city tile with `label=K` | 236, 237, 238 (green) |
| **CF / Chickenfoot** | OO city with 4 exits in a splayed pattern | Tile 619, 622 |
| **OO** | Two city slots in a frame, standard layout | 14, 15, 52, 59, 619 (green) |
| **XX** | label=XX tiles — dual-city exotic routing, NOT the same as X | 210–215 (green) — goes in dumb pack |

---

## 10. tobymao Tile DSL Reference

**SOURCE OF TRUTH**: tobymao TILES.md (`TILES_tobymao.pdf` in repo root). All examples below are verbatim from that document.

Main parts separated by `;`. Sub-parts separated by `,`. Lists separated by `|`.

### Components

- **`city`** — `slots:N` (default 1). Token-bearing city circle.
- **`town`** — `style:rect|dot|hidden`. rect = 1–2 connected paths (bar). dot = 0 or 3+ paths. hidden = invisible (special offboard trick).
- **`offboard`** — Not rendered itself; makes track to it tapered/pointed.
- **`junction`** — Lawson-style center-point node.
- **`path`** — `a:X,b:Y` required (X/Y = edge int or `_N` node ref); `terminal:1` (tapered) or `terminal:2` (short taper); `ignore:1`; `a_lane:W.I`; `b_lane:W.I`; `lanes:N` (auto-creates N parallel paths).
- **`label`** — Large text on tile: "OO", "Chi", "Z", "MC", "H", "P", etc. **Always render if present.**
- **`upgrade`** — `cost:N,terrain:mountain|water,loc:5.5` (corner position).
- **`border`** — `edge:N,type:mountain|water|impassable,cost:N`.
- **`icon`** — `image:name,sticky:1,blocks_lay:1,loc:5.5`.
- **`frame`** — `color:X,color2:Y`.

### Revenue sub-field
`revenue:N` — single integer, or phase-based: `yellow_40|green_50|brown_60|gray_80`. `hide:1` suppresses display.

### Track connections
- Integer `N` → hex edge N (tobymao numbering — convert +1 mod 6 to our system)
- `_N` → Nth city/town/offboard/junction in string order (0-indexed)

### Lane attributes
`a_lane:W.I` — W = total lane width, I = index (0 = most clockwise). `lanes:N` shorthand creates N parallel copies automatically.

### Canonical DSL examples (from TILES.md)

**Tile #1** (dual town, two crossing routes):
```
town=revenue:10;town=revenue:10;path=a:1,b:_0;path=a:_0,b:3;path=a:0,b:_1;path=a:_1,b:4
```
Town _0: edges 1↔3 (LL↔Top in tobymao = LL↔Top in our 2↔4). Town _1: edges 0↔4 (Bot↔UR = 1↔5). Each town has 2 paths → rect/bar. Routes cross.

**Tile #23** (plain track Y-branch):
```
path=a:0,b:3;path=a:0,b:4
```

**Lawson tile #81**:
```
junction;path=a:0,b:_0;path=a:2,b:_0;path=a:4,b:_0
```

**18Chesapeake H6** (Baltimore OO preprinted):
```
city=revenue:30;city=revenue:30;path=a:1,b:_0;path=a:4,b:_1;label=OO;upgrade=cost:40,terrain:water
```
Two cities, OO label rendered (it IS shown on the tile), water terrain symbol.

**18Chesapeake K3** (Trenton & Amboy, two unconnected towns):
```
town=revenue:0;town=revenue:0
```
Zero paths on each town → dot style.

**18MEX Mexico City** (3-slot city + town + double-track):
```
city=revenue:60,slots:3,loc:center;town=revenue:10,loc:2;path=a:0,b:_0;path=a:1,b:_0;path=a:3,b:_0;path=a:2,b:_1;path=a:5,b:_0,lanes:2;path=a:_1,b:_0;label=MC
```
3-slot city (_0), town at loc:2 (_1), double-track from edge 5, town connects to city.

> ⚠️ **This is 18MEX Mexico City — NOT the same as 1822 MX Mexico City.** The 1822 MX version is a London rebrand: OO-style layout with two cities. Treat them as completely separate tiles with different geometry.

**18MEX Puebla** (double-track from one edge):
```
town=revenue:10;path=a:2,b:_0,a_lane:2.1;path=a:5,b:_0;path=a:2,b:4,a_lane:2.0;label=P
```

**1831 tile 301c** (triple-track straight):
```
path=a:0,b:3,lanes:3
```

**18Chesapeake A3+B2** (Pittsburgh split-hex offboard):
```
A3: city=revenue:yellow_40|green_50|brown_60|gray_80,hide:1,groups:Pittsburgh;path=a:5,b:_0;border=edge:4
B2: offboard=revenue:yellow_40|green_50|brown_60|gray_80,groups:Pittsburgh;path=a:0,b:_0;border=edge:1
```
Phase-based revenue, hidden city, border on specific edge, offboard tapered track.

**1889 tile 439** (multi-slot city with label and upgrade):
```
city=revenue:60,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:4,b:_0;label=H;upgrade=cost:80
```

---

*Last updated: 2026-04*
*Maintained by: meiotta / Claude Code sessions*
