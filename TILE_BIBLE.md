# 18xxtools Tile Bible
## Tobymao Rendering Stack Reference and Porting Specification

**Source of truth:** `18xx-master/assets/app/view/game/`
**Scale:** Tobymao works in 100-unit space. 18xxtools uses 50-unit space — halve every coordinate.

---

## 1. Build Cycle: Tobymao's Full Rendering Pipeline

The tile renderer (`tile.rb`) assembles a list of SVG children in this exact order. Draw order = DOM order = later items render on top.

### Pass 0 — Track borders
For every `path` on the tile (including stubs and future_paths), draw a wider, lighter-colored stroke behind the track line. This creates the white outline/border that makes track switches look correct. Dispatched via `TrackNodePath pass=0`.

### Pass 1 — Track main
For every `path`, draw the actual track line. Four path types handled by `TrackNodePath`:
- **edge → edge**: straight or arc between two hex edges
- **edge → junction**: edge to center (0,0), straight or arc
- **edge → city/town**: edge to the city/town's computed position
- **city/town → city/town**: between two stop positions

`TrackNodePath.load_from_tile` (`track_node_path.rb`) computes:
- `begin_x/y`: edge position at distance 87 in tobymao (→ 43.5 in 50-unit space)
- `end_x/y`: city/town position from `preferred_city_town_edges`, or (0,0) for junctions
- `need_arc`: true when the line from begin to end does not pass through (0,0) — `colinear?` check
- `arc_parameters`: radius + sweep from `calculate_arc_parameters`

**Terminal path** (`path.terminal == '1'`): instead of a line, draws a filled pentagon spike:
```
M d_w 70 L d_w 87 L -d_w 87 L -d_w 70 L 0 35 Z
```
(`d_w` = half of track width = 4.5 in tobymao, rotated to the exit edge).
In 50-unit space: `M d_w 35 L d_w 43.5 L -d_w 43.5 L -d_w 35 L 0 17.5 Z`.

**Stub** (`path.stub?`): short track from edge inward, `M 0 87 L 0 65` rotated to edge.
In 50-unit space: `M 0 43.5 L 0 32.5`. Source: `track_stub.rb`.

**Future paths** (`track: :future`): color `#888888`, width 6/3, dash `9 3`. Rendered via `TrackNodePath` pass 1 only (no border pass).

### Pass 2 — Track inner (narrow gauge only)
Draws a dashed white center line for `:narrow` track type.

### Pass 3 — Partitions (skip for now)
Hex-divider lines (rare, only a few games).

### Pass 4 — Cities
`Cities` iterates `@tile.cities` and renders each independently via `City` (`city.rb`).

**`City.preferred_render_locations`** (city.rb line 248):
- If `@edge` is set (from `preferred_city_town_edges`): position at distance 50 (tobymao) = 25 (50-unit):
  - `x = -sin(edge × 60° × π/180) × 25`
  - `y = cos(edge × 60° × π/180) × 25`
- If no edge (single center city, no loc:): position at (0, 0)

**City visual components** (rendered in order):
1. **Box** (`BOX_ATTRS`, city.rb line 87): white background shape behind the slots
   - 1 slot: no box
   - 2 slots: white rect 50×50 centered (→ 25×25 in 50-unit)
   - 3 slots: white hexagon `45.8,0 22.9,-39.846 -22.9,-39.846 -45.8,0 -22.9,39.846 22.9,39.846` (→ halve all)
   - 4 slots: white rect 100×100 rx=25 (→ 50×50 rx=12.5 in 50-unit)
   - 5+ slots: white circle r = 1.36×50 (5 slots), r = 1.5×50 (6-9 slots) (→ halve)
2. **Slots**: one slot circle per slot, rotated around center
   - `CITY_SLOT_POSITION[n]` gives offset for slot 0 (tobymao → 50-unit):
     - 1: [0, 0]
     - 2: [-25, 0] → [-12.5, 0]
     - 3: [0, -29] → [0, -14.5]
     - 4: [-25, -25] → [-12.5, -12.5]
   - Slot radius = 25 (tobymao) = 12.5 (50-unit)
   - Each slot: white fill circle, black stroke, stroke-width 2, rotated by `(360/n) × slot_index`
   - Inside each slot: either empty, a reservation text (company id), or a token image
3. **Revenue circle**: white circle with black number (see section 6)

### Pass 5 — Towns
`Towns` iterates `@tile.towns` and renders each independently. Source: `towns.rb`.

**Town type dispatch**:
- `town.rect?` → `TownRect` (standard black rectangle). Source: `town_rect.rb`
- else → `TownDot` (small filled circle). Source: `town_dot.rb`

**Standard town rectangle: `TownRect`**
Dimensions (tobymao / 50-unit): height = 8.5 / 4.25, width = 34 / 17. Black fill.
Position from `town_position` (town_location.rb line 217):
- **center_town?** (2-exit town, tile exits ≤ 3):
  - **straight** (exits differ by 3): position (0,0), angle = min_edge × 60
  - **sharp** (exits differ by 1): position = dist 50/25 at angle (min_edge+0.5)×60°; rect angle = (min_edge+2)×60
  - **gentle** (exits differ by 2): position = dist 23.2/11.6 at angle (min_edge+1)×60°; rect angle = (min_edge×60)−30
- Edge/off-center town: position at dist 50/25 toward edge, angle = edge×60
- Default (no exits, no loc): position (0,0)

**`TownDot`**: filled circle radius ≈ 10/5, black fill, white stroke, stroke-width 4.

### Pass 6 — Borders
Edge cost/impassable markers. Source: `borders.rb`. Already implemented in `drawBorders()`.

### Pass 7 — Location Name
`LocationName` renders the city/town name string with a semi-transparent white background rect.
Source: `location_name.rb`. Uses `preferred_render_locations` with up to 12 candidate positions, picking the least-crowded one via the region cost system.

### Pass 8 — Revenue (standalone)
Only rendered when `should_render_revenue?` is true. Source: `revenue.rb`.
Dispatches to `MultiRevenue` (colored phase boxes) or `SingleRevenue` (plain white circle).

### Pass 9 — Labels
Letter labels (`Z`, `OO`, `B`, `NY`, `P`, `HALT`). Source: `label.rb`.
`<text>` scaled ×1.5. Positioned by `preferred_render_locations` into least-crowded corner.

### Pass 10 — Upgrades
Terrain icon + cost number. Source: `upgrade.rb` / `upgrades.rb`.
Currently drawn on canvas in `drawHex()`; positionally approximate.

### Pass 11 — Blocker
Company blocking indicator (barbell + company sym text). Source: `blocker.rb`. Game-state only.

### Pass 12 — Reservations (standalone)
Company abbreviation text positioned near a city, showing home city reservation.
Source: `reservation.rb`. Separate from slot content — rendered as an adjacent text element.

---

## 2. The Collision Avoidance System (`base.rb`)

**Source:** `assets/app/view/game/part/base.rb`

Every part of a tile renders into a shared coordinate space. To prevent revenue circles, labels, terrain icons, and location names from overlapping each other or landing on top of track, tobymao uses a 24-region scoring system.

### The 24-region grid

The hex is divided into a 4-row grid of 24 named sub-regions:

```
         [0]  [1]  [2]  [3]  [4]          ← TOP_ROW
      [5][6]  [7]  [8]  [9] [10][11]      ← 7 cells
     [12][13] [14] [15] [16] [17][18]     ← 7 cells
         [19] [20] [21] [22] [23]         ← BOTTOM_ROW
```

Named groups (from `base.rb`):
```
CENTER           = [7, 8, 9, 14, 15, 16]
LEFT_CORNER      = [5, 12]
RIGHT_CORNER     = [11, 18]
LEFT_MID         = [6, 13]
RIGHT_MID        = [10, 17]
LEFT_CENTER      = [7, 14]
RIGHT_CENTER     = [9, 16]
UPPER_LEFT_CORNER  = [0, 1]
UPPER_RIGHT_CORNER = [3, 4]
BOTTOM_LEFT_CORNER = [19, 20]
BOTTOM_RIGHT_CORNER = [22, 23]
TOP_ROW          = [0, 1, 2, 3, 4]
TOP_MIDDLE_ROW   = [6, 7, 8, 9, 10]
BOTTOM_MIDDLE_ROW = [13, 14, 15, 16, 17]
BOTTOM_ROW       = [19, 20, 21, 22, 23]

Track corridors:
TRACK_TO_EDGE_0  = [15, 21]   ← bottom
TRACK_TO_EDGE_1  = [13, 14]   ← SW
TRACK_TO_EDGE_2  = [6, 7]     ← NW
TRACK_TO_EDGE_3  = [2, 8]     ← top
TRACK_TO_EDGE_4  = [9, 10]    ← NE
TRACK_TO_EDGE_5  = [16, 17]   ← SE
```

### How it works

`@region_use` is a `Hash.new(0)` — starts at zero for every region on every hex render. It is passed to every part in the render order.

Each part class implements **`preferred_render_locations`** returning an ordered list of candidate positions. Each candidate is a hash:
```ruby
{
  region_weights:     [7, 8, 9],  # OR a Hash of {[regions] => weight}
  region_weights_in:  ...,        # optional: regions to CHECK for cost (what this part cares about)
  region_weights_out: ...,        # optional: regions to MARK as used after rendering
  x: 0,
  y: 0,
  angle: 0,   # optional rotation
  scale: 1.0, # optional scale
}
```

**`render_location`** (base.rb line 155): picks the candidate with the lowest `combined_cost`:
```ruby
locations.min_by.with_index { |t, i| [combined_cost(t[:region_weights_in] || t[:region_weights]), i] }
```
`combined_cost` = sum over all regions of `weight × @region_use[region]`.
Ties broken by list order — earlier candidates win.

**`increment_cost`** (base.rb line 139): after the part renders, marks its occupied regions:
```ruby
region_weights = render_location[:region_weights_out] || render_location[:region_weights]
# increments @region_use[region] += weight for each region
```

**The key distinction**:
- `region_weights_in`: what this part needs to be clear (used for cost scoring)
- `region_weights_out`: what this part actually blocks (used to increment @region_use)
- When only `region_weights` is given, both are the same

### Why pass order matters

Parts are rendered in tile.rb order. Track is rendered first, marking its corridor regions. When a city renders its revenue circle, it checks all candidate positions and picks the one with the lowest cost — which is never on a track corridor. When a label renders, all the track and revenue regions are already marked, pushing the label to a corner.

**Render order effect on region_use:**
1. `TrackNodePath` mark their edge corridors (TRACK_TO_EDGE_* regions)
2. `City` marks CENTER or edge position regions
3. `Town` marks its position regions
4. `Revenue`, `Label`, `Upgrade` find the cleanest uncrowded corners

### Porting this to 18xxtools

The full port requires:
1. A `regionUse` object (JS `{}` defaulting to 0) initialized per hex render
2. Each renderer function accepts and mutates `regionUse`
3. Track drawing marks edge corridor regions before cities/towns render
4. City/town pick positions from their candidate lists using `combinedCost(regionUse)`
5. Revenue, label, upgrade pick from corner candidates in cost order

For the `SmallItem` mixin (used by Revenue and Upgrade), the candidate corner positions in 50-unit space are:

| Name | Regions | x | y |
|---|---|---|---|
| P_RIGHT_CORNER | [11,18] | 37.5 | 0 |
| P_LEFT_CORNER | [5,12] | -37.5 | 0 |
| P_UPPER_LEFT_CORNER | [0,1] | -17.5 | -30.3 |
| P_UPPER_RIGHT_CORNER | [3,4] | 17.5 | -30.3 |
| P_BOTTOM_LEFT_CORNER | [19,20] | -17.5 | 30.3 |
| P_BOTTOM_RIGHT_CORNER | [22,23] | 17.5 | 30.3 |

(All tobymao coordinates halved for 50-unit space.)

---

## 3. The Correct Hex Data Model

**What 18xxtools import-ruby.js must produce per hex** (mirroring tobymao tile model):

```js
{
  bg:        'white',
  static:    true,
  killed:    false,
  rotation:  0,
  exits:     [0, 3],
  borders:   [{ edge, type, cost }],
  icons:     [{ image }],
  name:      'Altoona',

  // Tobymao-parallel arrays — NO feature field
  paths: [
    {
      a: 0,             // edge number (0-5) OR { node: n } for city/town ref
      b: { node: 0 },
      terminal: false,
      track: 'normal',  // 'normal'|'narrow'|'dual'|'thin'|'future'|'stub'
    },
  ],

  cities: [
    {
      slots:        1,
      loc:          null,    // raw loc: float or null
      flatRevenue:  20,
      phaseRevenue: { yellow: 20, green: 20, brown: 40, gray: 40 },
      activePhases: { yellow: true, green: true, brown: true, gray: true },
      reservations: ['GWR'],   // company IDs for home city reservations
    },
  ],

  towns: [
    {
      exits:   [0, 3],
      loc:     null,
      revenue: 10,
    },
  ],

  labels:   ['Z'],
  upgrades: [{ cost: 80, terrains: ['mountain'] }],
}
```

---

## 4. Preferred City/Town Edge Computation (render time)

Port of `compute_city_town_edges` from `lib/engine/tile.rb` line 437:

```
1. Single city + no towns + no loc: → center (edge = null)
2. No cities + single town ≤1 exit + no loc: → center (edge = null)
3. For each city/town: collect exit edges from paths where path.a or path.b = this node
4. If city/town has loc: → edge = (loc + hex.rotation) % 6
   Else → edge = collected edge with lowest edge_count (least congested)
5. Position: x = -sin(edge × π/3) × 25,  y = cos(edge × π/3) × 25  (50-unit space)
6. Junction terminus: position = (0,0), edge = null
```

---

## 5. Complete Element Reference Table

All tobymao source files, current status in 18xxtools, and what is needed.

| Element | Tobymao source | Current status | Needed for |
|---|---|---|---|
| Track (edge→edge, arc/straight) | `track_node_path.rb` | ✅ Correct | All maps |
| Track border stroke | `track_node_path.rb` (pass=0) | ✅ Correct | All maps |
| Terminal spike | `track_node_path.rb` (build_props, terminal) | ✅ Correct | Harbor/junction hexes |
| Track stub | `track_stub.rb` | ❓ Unconfirmed | Partial-track hexes |
| Future paths | `track.rb` (track: :future) | ❌ Not distinguished | Some games |
| Narrow gauge inner | `track_node_path.rb` (pass=2) | ❌ Missing | Narrow gauge games |
| City box (1-9 slots) | `city.rb` (BOX_ATTRS, CITY_SLOT_POSITION) | ⚠️ Partial | All city maps |
| City slot circles | `city_slot.rb` | ⚠️ Partial (blank white only) | All city maps |
| City slot reservation text | `city_slot.rb` (reservation method) | ❌ Missing | Preprinted home cities |
| City slot token image | `token.rb` | ❌ Missing | Game state |
| Town rectangle | `town_rect.rb` | ✅ Correct | All town maps |
| Town dot | `town_dot.rb` | ❓ Unconfirmed | Halt hexes |
| Single revenue circle | `single_revenue.rb` | ⚠️ Partial (cities only) | All revenue hexes |
| Phase revenue boxes | `multi_revenue.rb` | ❌ Missing | Offboards, phase hexes |
| Standalone revenue | `revenue.rb` | ❌ Missing | OO, multi-revenue tiles |
| Town revenue circle | `town_dot.rb` / `town_rect.rb` (render_revenue) | ❌ Missing | Town hexes |
| Letter labels (Z, OO, B…) | `label.rb` | ❌ Missing | Many maps |
| Location name text | `location_name.rb` | ⚠️ Canvas approx. | All named cities |
| Standalone reservations | `reservation.rb` | ❌ Missing | Preprinted home cities |
| Upgrade terrain icon + cost | `upgrade.rb` | ⚠️ Canvas approx. | Terrain hexes |
| Blocker (company sym) | `blocker.rb` | ❌ Missing | Game state only |
| Collision avoidance (24-region) | `base.rb` | ❌ Missing | Revenue/label placement |

---

## 6. What Is Incompatible (must change)

| Existing | Problem | Fix |
|---|---|---|
| `hex.feature` | Does not exist in tobymao. Mutually-exclusive gate. | Delete entirely. |
| `feature = 'cityTown'` | No such concept. Cities and towns render independently. | Remove. |
| `feature = 'oo'` | OO = two independent city objects. | Replace with `hex.cities = [{slots:1,...},{slots:1,...}]`. |
| `feature = 'dualTown'` | Two independent town objects. | Replace with `hex.towns = [{...},{...}]`. |
| `hex.cityLocX/Y` flat props | Should live inside city object | Move to `hex.cities[0].loc`. |
| `hex.townLocX/Y` flat props | Should live inside town object | Move to `hex.towns[0].loc`. |
| `hex.slots` flat prop | Should be `hex.cities[0].slots` | Move. |
| `hex.ooFlatRevenues[]` | Per-city revenue belongs inside city object | Move to `hex.cities[n].flatRevenue`. |
| `hex.exitPairs[]` | Should be `exits[]` per individual town object | Move. |
| `hexToSvgInner` feature switch | Prevents additive rendering. | Refactor to 3 passes: paths → cities → towns. |

---

## 7. What Is Compatible (keep)

| What | Status |
|---|---|
| `computeTownPos(exits)` | **Keep.** Direct port of `town_position` from `town_location.rb`. |
| `checkColinear(x0,y0,x1,y1)` | **Keep.** Port of `colinear?`. |
| `calcArc(bx,by,ex,ey)` | **Keep.** Port of `calculate_arc_parameters`. |
| `edgePos(edge, dist)` | **Keep.** Correct edge midpoint formula. |
| `STATIC_BG_COLORS` | **Keep.** Background hex colors. |
| Track arc + straight drawing | **Keep.** Correctly ported. |
| Terminal spike shape | **Keep.** Correct tobymao port. |
| `drawBorders()` | **Keep.** Correct. |
| Terrain icons in `drawHex()` | **Keep for now.** Equivalent to tobymao Upgrade part. |
| Canvas + SVG hybrid | **Keep.** drawHex() = background; renderTilesSVG() = tile contents. |
| Expanded clip (×1.06 for DSL hexes) | **Keep.** Needed for off-center clusters. |

---

## 8. Revenue Circle Placement Reference

From `city.rb` `render_revenue` and `REVENUE_DISPLACEMENT`:

Displacement (tobymao / 50-unit) from city center by slot count:
- 1 slot: 42 / 21
- 2 slots: 67 / 33.5
- 3 slots: 65 / 32.5
- 4 slots: 67 / 33.5

Revenue circle: white fill, r = 15/7.5 (standard), 17/8.5 (>99). Stroke `#777`. Black text centered.
For revenues ≤ 0 on a non-pass city: do not render.

**MultiRevenue** (phase boxes, `multi_revenue.rb`):
- One colored rectangle per active phase, arranged in a row, centered
- Rect height = 27/13.5. Rect width = character_count × 16/8
- Fill colors: yellow `#F0D070`, green `#71BF44`, brown `#CB7745`, gray `#BCBDC0`
- Text: revenue number in contrasting color (black on yellow, white on brown/green/gray)
- For multi-row (offboards with `rows > 1`): stack rectangles vertically, each row `HEIGHT` apart

---

## 9. Track Width Reference (tobymao / 50-unit)

| Track type | Width | Border add | Inner subtract | Inner dash |
|---|---|---|---|---|
| normal/broad | 9 / 4.5 | +3 white / +1.5 | — | — |
| narrow | 12 / 6 | +2 white / +1 | −4 white / −2 | `12` |
| dual | 10 / 5 | +3 black / +1.5 | — | — |
| thin | 2 / 1 | 0 | — | `12` |
| future | 6 / 3 | 0 (no border pass) | — | `9 3` |
| stub | 9 / 4.5 | +3 white | — | — |

---

## 10. Implementation Order

1. **Refactor import-ruby.js** — produce `hex.cities[]`, `hex.towns[]`, `hex.paths[]`. Remove `hex.feature` and all flat derived props.
2. **Refactor `hexToSvgInner`** — three independent passes: paths → cities → towns. No feature switch.
3. **Port `compute_city_town_edges`** as a standalone function operating on the new data model.
4. **Port 24-region collision system** from `base.rb` — `regionUse` object, `combinedCost`, `incrementCost`.
5. **Phase revenue boxes** (`multi_revenue.rb`) — colored rectangles for offboards and multi-phase hexes.
6. **Letter labels** (`label.rb`) — text positioned by region cost system.
7. **Town revenue** (`town_rect.rb` / `town_dot.rb` render_revenue) — revenue circles on towns.
8. **Standalone revenue** (`revenue.rb`) — for OO tiles, multi-revenue, high-slot-count cities.
9. **Reservations** (`reservation.rb`) / **slot content** (`city_slot.rb`) — home city text.
10. **Verify** D35 (city+town), Glasgow (3-slot off-center), London (6-city), blue harbors, Altoona.
