# 18xxtools Map Editor — Gap Analysis

Analysis of six production 18xx game map files against the current 18xxtools editor.
Goal: pixel-perfect import and export parity with 18xx.games `map.rb` format.

**Files analysed**

| File | Game |
|------|------|
| `lib/engine/game/g_1889/map.rb` | 1889 |
| `lib/engine/game/g_1822/map.rb` | 1822 |
| `lib/engine/game/g_1830/map.rb` | 1830 |
| `lib/engine/game/g_1846/map.rb` | 1846 |
| `lib/engine/game/g_18_chesapeake/map.rb` | 18Chesapeake |
| `lib/engine/game/g_1861/map.rb` | 1861 |

---

## What the tool already handles

- Hex background colors: white, yellow, green, brown, gray, red, blue
- `city=revenue:N` — single city (1–4 slots)
- `city=revenue:N;city=revenue:N;label=OO` — two-node OO city (simple exits only)
- `town=revenue:N` and `town=revenue:N;town=revenue:N` (dual town)
- `offboard=revenue:yellow_N|green_N|brown_N|gray_N` — phase-based offboard
- `upgrade=cost:N,terrain:T` — terrain upgrade cost
- `border=edge:N,type:water,cost:N` and `border=edge:N,type:impassable`
- `path=a:E,b:_0,terminal:1` — terminal path flag on offboards and cities
- `path=a:E,b:_0` and `path=a:E,b:_1` — standard city paths
- `label=X` — hex labels (B, NY, OO, Chi, etc.)
- `icon=image:X,sticky:1` — single icon per hex
- Kill/blank hexes (water, non-playable grid cells)
- Company home token assignment
- Static gray/brown hex code passthrough

---

## Missing features by category

### 1. Shorthand hex keywords

**Found in:** 1830

Ruby accepts bare keywords (no attributes) as shorthand:

```ruby
# 1830 map.rb — multiple hexes
%w[I13 D18 B12 ...] => 'blank'
%w[B20 D4 F10]      => 'town'
%w[E19 H4 B10 ...]  => 'city'
```

`blank` means an unplayable grid cell (same as kill/water in the tool).
`town` is equivalent to `town=revenue:0`.
`city` is equivalent to `city=revenue:0`.

**What to build:** Import parser must recognise these bare keywords and expand them.

---

### 2. `loc:X` and `loc:X.Y` — city node position specifier

**Found in:** 1830, 1822, 1846

Specifies where on the hex a city node is rendered. Integer values (0–5) place the node at that edge's midpoint. Fractional `.5` values place it between two edges.

```ruby
# 1830 — single city at non-centre position
'H12' => 'city=revenue:10,loc:2.5;path=a:1,b:_0;path=a:4,b:_0;path=a:1,b:4'

# 1822 — large terminal city (Aberdeen), loc:1.5
'city=revenue:yellow_10|green_20|brown_20|gray_30,slots:3,loc:1.5;'\
'path=a:0,b:_0,lanes:2,terminal:1;path=a:3,b:_0,lanes:2,terminal:1;'\
'path=a:4,b:_0,lanes:2,terminal:1;path=a:5,b:_0,lanes:2,terminal:1'

# 1861 — tri-city tile (Kyiv), three nodes at triangle corners
'city=revenue:40,loc:0.5;city=revenue:40,loc:2.5;city=revenue:40,loc:4.5;'\
'path=a:0,b:_0;path=a:_0,b:1;path=a:4,b:_2;path=a:_2,b:5;'\
'path=a:2,b:_1;path=a:_1,b:3;label=K;upgrade=cost:40,terrain:water'
```

`loc:1.5` positions the node between edges 1 and 2 (peninsula/terminal cities like Aberdeen that hang off one corner). `loc:0.5`, `loc:2.5`, `loc:4.5` form an equilateral triangle (Kyiv-style tri-city tiles).

**What to build:** Parser must read `loc` from city directives and store it; renderer must use it to place the node SVG element off-centre; exporter must emit it.

---

### 3. `path=a:E,b:E` — edge-to-edge bypass paths

**Found in:** 1830, 1822

A path where *both* endpoints are hex edges (no `_N` city reference). Used for pre-printed straight-through routes that do not stop at the city on the same hex.

```ruby
# 1830 — gray hex with bypass route alongside city
'H12' => 'city=revenue:10,loc:2.5;path=a:1,b:_0;path=a:4,b:_0;path=a:1,b:4'
#                                                                ^^^^^^^^^^
#                              direct edge-1→edge-4 route (bypasses the city)

# 1830 — plain through-route hexes (no city)
'E9'  => 'path=a:2,b:3'
'A17' => 'path=a:0,b:5'
'D24' => 'path=a:1,b:0'

# 1822 — dual-lane through route
'path=a:0,b:4,lanes:2'
'path=a:3,b:5,lanes:2'
```

**What to build:** Static hex code for hexes that contain only edge-to-edge paths (no city/town). The tool's path builder always terminates at `_0`/`_1`; it needs a "through route" mode for pre-printed gray tiles.

---

### 4. `path=a:_N,b:E` — city-node-to-edge directed path segment

**Found in:** 18Chesapeake, 1846, 1861

In complex multi-city tiles, each city node is threaded by splitting the path into two directed segments: one inbound (`a:E,b:_N`) and one outbound (`a:_N,b:E`). This makes a city a *through station* with two distinct exits.

```ruby
# 18Chesapeake — OO through-tile X3
'city=revenue:40;city=revenue:40;'\
'path=a:0,b:_0;path=a:_0,b:2;'\   # city _0: enters edge 0, exits edge 2
'path=a:3,b:_1;path=a:_1,b:5;'\   # city _1: enters edge 3, exits edge 5
'label=OO'

# 18Chesapeake — OO through-tile X4
'city=revenue:40;city=revenue:40;'\
'path=a:0,b:_0;path=a:_0,b:1;path=a:2,b:_1;path=a:_1,b:3;label=OO'

# 1846 — Chicago 4-city tile (green 298)
'city=revenue:40;city=revenue:40;city=revenue:40;city=revenue:40;'\
'path=a:0,b:_0;path=a:_0,b:2;'\
'path=a:3,b:_1;path=a:_1,b:2;'\
'path=a:4,b:_2;path=a:_2,b:2;'\
'path=a:5,b:_3;path=a:_3,b:2;'\
'label=Chi'

# 1861 — Kyiv three-city tile (green 635)
'city=revenue:40,loc:0.5;city=revenue:40,loc:2.5;city=revenue:40,loc:4.5;'\
'path=a:0,b:_0;path=a:_0,b:1;'\
'path=a:4,b:_2;path=a:_2,b:5;'\
'path=a:2,b:_1;path=a:_1,b:3'
```

Important: in `path=a:_0,b:2` the `b:2` is an *edge number* (integer 0–5), not `b:_2` (city node). The current tool never emits the `a:_N,b:E` form.

**What to build:** The static hex code generator must support per-city-node exit pairing for pre-printed tiles. The OO wizard already collects `exitPairs`; it needs to emit the `a:_N,b:E` directed form when an OO tile has paired exits per node.

---

### 5. `groups:NAME` — logical location grouping

**Found in:** 1830, 1846, 18Chesapeake, 1861

Groups multiple hexes (cities or offboards) into a single named location. The engine treats all hexes in the group as the same stop for revenue/routing purposes; only non-hidden hexes are displayed.

```ruby
# 1846 — Chicago split across 4 city nodes on one hex
'city=revenue:10,groups:Chicago;city=revenue:10,groups:Chicago;...'

# 1846 — Eastern US offboards (hide:1 siblings share the group)
'offboard=revenue:yellow_30|brown_60,hide:1,groups:E;...'
'offboard=revenue:yellow_30|brown_70,groups:E;...'

# 1861 — Poland cluster
'offboard=revenue:yellow_30|green_40|brown_50|gray_70,groups:Poland;...'
'offboard=revenue:yellow_30|green_40|brown_50|gray_70,hide:1,groups:Poland;...'

# 18Chesapeake — Pittsburgh split
'offboard=revenue:yellow_40|green_50|brown_60|gray_80,groups:Pittsburgh;...'
'offboard=revenue:yellow_40|green_50|brown_60|gray_80,hide:1,groups:Pittsburgh;...'

# 1830 — Gulf and Canada groups
'offboard=revenue:yellow_30|brown_60,hide:1,groups:Gulf;path=a:4,b:_0;border=edge:5'
'offboard=revenue:yellow_30|brown_50,hide:1,groups:Canada;path=a:5,b:_0;border=edge:4'
'offboard=revenue:yellow_30|brown_50,groups:Canada;path=a:5,b:_0;path=a:0,b:_0;border=edge:1'
```

**What to build:** A `groups` string field on hex/node data. Import parser must read it. Export must emit `groups:NAME` on city/offboard directives. No special rendering required beyond what `hide:1` provides.

---

### 6. `hide:1` — suppress hex from revenue display

**Found in:** 1830, 1846, 18Chesapeake, 1861

Marks an offboard (or city) hex as hidden — it is part of a group but is not the canonical display hex. Hidden hexes typically sit at the map edge with a single border exit and no visible revenue label.

```ruby
# 1830
'offboard=revenue:yellow_30|brown_60,hide:1,groups:Gulf;path=a:4,b:_0;border=edge:5'
'offboard=revenue:yellow_30|brown_50,hide:1,groups:Canada;path=a:5,b:_0;border=edge:4'

# 1846
'offboard=revenue:yellow_30|brown_60,hide:1,groups:E;icon=image:1846/20;border=edge:5'

# 18Chesapeake — hide:1 on a city= directive (not offboard)
'city=revenue:yellow_40|green_50|brown_60|gray_80,hide:1,groups:Pittsburgh;path=a:5,b:_0;border=edge:4'

# 1861
'offboard=revenue:yellow_30|green_40|brown_50|gray_70,hide:1,groups:Poland;border=edge:0'
```

Note: `hide:1` can appear on `city=` as well as `offboard=` (Chesapeake Pittsburgh case).

**What to build:** `hide` boolean on hex data; import/export round-trip. Render hidden hexes with reduced opacity or no revenue badge.

---

### 7. Phase-based revenue on `city=`

**Found in:** 18Chesapeake, 1822

The `yellow_N|green_N|brown_N|gray_N` pipe syntax is already supported on `offboard=`, but also appears on `city=` for pre-printed fixed-income cities.

```ruby
# 18Chesapeake — hidden Pittsburgh city
'city=revenue:yellow_40|green_50|brown_60|gray_80,hide:1,groups:Pittsburgh;path=a:5,b:_0'

# 1822 — Aberdeen terminus (gray pre-printed)
'city=revenue:yellow_10|green_20|brown_20|gray_30,slots:3,loc:1.5;'\
'path=a:0,b:_0,lanes:2,terminal:1;...'
```

**What to build:** The importer already parses phase-based revenue for offboards; apply the same logic when the directive is `city=`.

---

### 8. `future_label=label:X,color:Y` — phase-triggered label

**Found in:** 1822, 1861

A label that only appears once the map reaches a given phase color. Used when a city gains a special identity in a later phase.

```ruby
# 1822
'future_label=label:S,color:green'
'city=revenue:0;future_label=label:T,color:green'

# 1861
'city=revenue:0;label=Y;future_label=label:Kh,color:gray'
```

**What to build:** A `futureLabel: {label, color}` object on hex data. Import/export support. Display as a greyed-out overlay label in the editor.

---

### 9. `stub=edge:N` — dead-end edge segment

**Found in:** 1822

A short track stub protruding from one edge with no connection on the other side (river/estuary approaches, or impassable border stubs).

```ruby
# 1822 — Irish coast hexes
'stub=edge:5'
'stub=edge:4'
'stub=edge:3'
'border=edge:0,type:water,cost:40;border=edge:5,type:water,cost:40;stub=edge:1'
'upgrade=cost:20,terrain:swamp;border=edge:3,type:water,cost:40;stub=edge:2'
'town=revenue:0;stub=edge:0'
```

**What to build:** A `stubs: [N, ...]` array on hex data. Import/export. Renderer draws a short track nub on each stub edge.

---

### 10. `junction` — passthrough junction node

**Found in:** 1822

A special non-revenue node type. Routes pass through freely; displayed as a small interchange marker.

```ruby
# 1822 — center junction tile (tile 169 — 5-way junction)
'junction;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0'

# 1822 — blue sea hexes (terminal ferry approach)
'junction;path=a:2,b:_0,terminal:1'
'junction;path=a:4,b:_0,terminal:1'
'junction;path=a:5,b:_0,terminal:1'
```

**What to build:** A `junction` boolean feature type. Render as a small hollow circle. Used for 1822's ferry/port system.

---

### 11. `lanes:N` — multi-lane path capacity

**Found in:** 1822

Indicates a path carries N parallel tracks, affecting E-train routing in 1822.

```ruby
# 1822 — dual-track through routes
'path=a:0,b:4,lanes:2'
'path=a:3,b:5,lanes:2'

# 1822 — terminal with dual lanes
'path=a:0,b:_0,lanes:2,terminal:1;path=a:3,b:_0,lanes:2,terminal:1'

# 1822 — offboard with dual-lane path
'offboard=revenue:yellow_0|green_60|brown_90|gray_120,visit_cost:0;path=a:2,b:_0,lanes:2'
```

**What to build:** `lanes` attribute on path directives. Import/export pass-through. Optional double-line rendering.

---

### 12. `a_lane:X.Y` — lane splitting at a shared edge

**Found in:** 1822

When two paths share the same source edge but diverge to different destinations, `a_lane` disambiguates them. `2.0` = first lane, `2.1` = second lane (the leading `2` is the total lane count).

```ruby
# 1822 — gray diverging junction tiles
'path=a:1,b:4,a_lane:2.0;path=a:1,b:5,a_lane:2.1'
'path=a:2,b:4,a_lane:2.0;path=a:2,b:5,a_lane:2.1'
```

**What to build:** `a_lane` attribute on path directives. Import/export pass-through. Rendering can treat these as ordinary paths.

---

### 13. `visit_cost:N` — offboard visit cost override

**Found in:** 1822

Overrides the normal cost to visit an offboard. `visit_cost:0` makes it free regardless of train type or terrain.

```ruby
# 1822
'offboard=revenue:yellow_0|green_60|brown_90|gray_120,visit_cost:0;path=a:2,b:_0,lanes:2'
```

**What to build:** `visitCost` field on offboard hex data. Import/export pass-through.

---

### 14. `ignore:1` — mark path as non-routing

**Found in:** 1822

Marks a path as ignored during route calculation. Visual track only; not counted as a legal route.

```ruby
# 1822
'path=a:4,b:_0,terminal:1,ignore:1;path=a:5,b:_0'
'path=a:2,b:_0,terminal:1,ignore:1;path=a:5,b:_0'
```

**What to build:** `ignore` flag on path directives. Import/export pass-through only.

---

### 15. Multiple `icon=` directives per hex

**Found in:** 1846

The tool supports one icon per hex. Multiple icons appear on resource-rich offboards and some cities.

```ruby
# 1846 — St. Louis offboard (three icons)
'offboard=revenue:yellow_50|brown_70,groups:St. Louis;path=a:3,b:_0;'\
'path=a:4,b:_0;label=W;icon=image:port;icon=image:1846/meat;icon=image:1846/20'

# 1846 — city with two sticky icons
'city=revenue:0;icon=image:port,sticky:1;icon=image:1846/lsl,sticky:1'

# 1846 — city with two different sticky icons
'city=revenue:0;label=Z;border=edge:0,type:water,cost:40;'\
'icon=image:1846/lm,sticky:1;icon=image:1846/boom,sticky:1'
```

**What to build:** Change `icon` from a single value to an array of `{image, sticky}` objects. Import/export both forms.

---

### 16. `border=edge:N,type:mountain,cost:N`

**Found in:** 1846

The tool handles `type:water` and `type:impassable`. Mountain borders also exist.

```ruby
# 1846
'border=edge:5,type:mountain,cost:40'
'city=revenue:0;border=edge:4,type:mountain,cost:40'
'upgrade=cost:40,terrain:mountain;border=edge:5,type:water,cost:40'

# 1846 — on offboard
'offboard=revenue:yellow_30|brown_50,groups:E;'\
'icon=image:1846/20;path=a:1,b:_0;label=E;border=edge:1,type:mountain,cost:40'
```

**What to build:** Add `mountain` to the border type enum. Visual rendering: jagged/brown border line distinct from blue water border.

---

## Per-game summary

### 1889

No unsupported directives in the main HEXES map. All features are already handled. Minor note: some gray hexes use `upgrade=cost:N` without a `terrain:` qualifier — verify the import parser handles a bare upgrade cost (no terrain type) correctly.

---

### 1822

Most complex game in the set.

| Feature | Hexes affected |
|---------|---------------|
| `stub=edge:N` | 5+ (N37, L37, L39, M40, N39, …) |
| `junction` node type | 7+ (tile 169, blue sea hexes L11, J43, Q36, Q42, R31, …) |
| `lanes:N` on paths | ~8 gray hexes |
| `a_lane:X.Y` | 4 gray hexes (F25, F27, F29, F31) |
| `visit_cost:N` on offboard | 1 (Q44) |
| `ignore:1` on path | 2 (E34, F35) |
| `future_label` | 2 (D35, area around E36) |
| `loc:1.5` on city | 1 (Aberdeen E28) |
| Phase-based revenue on `city=` | 1 (Aberdeen E28) |

---

### 1830

| Feature | Hexes affected |
|---------|---------------|
| `blank` keyword | ~15 |
| `town` keyword (no params) | 3 (B20, D4, F10) |
| `city` keyword (no params) | 5 (E19, H4, B10, H10, H16) |
| `loc:2.5` on gray city | 1 (H12) |
| `path=a:E,b:E` bypass path | 4 (E9, H12, A17, D24) |
| `hide:1` on offboard | 2 (Gulf, Canada) |
| `groups:NAME` | 3 groups (Gulf, Canada, …) |

---

### 1846

| Feature | Hexes affected |
|---------|---------------|
| `groups:NAME` | 20+ hexes across 6 groups |
| `hide:1` | ~8 hexes |
| 4-city-node hex (Chicago) | 3 tiles (yellow/green/brown D6) |
| `path=a:_N,b:E` directed paths | 3 Chicago tiles |
| Multiple icons | ~10 hexes |
| `border=edge:N,type:mountain` | 8 hexes |

---

### 18Chesapeake

| Feature | Hexes affected |
|---------|---------------|
| `groups:NAME` | 4 groups (Pittsburgh, West Virginia Coal, …) |
| `hide:1` | 4 hexes |
| `path=a:_N,b:E` (OO through-tiles) | 3 custom tiles (X3, X4, X5) |
| Phase-based revenue on `city=` | 1 (hidden Pittsburgh) |

---

### 1861

| Feature | Hexes affected |
|---------|---------------|
| `groups:NAME` | 5 groups (Poland, Romania, Caucasus, CentralAsia, …) |
| `hide:1` | 10+ offboard hexes |
| `loc:0.5/2.5/4.5` on multi-city | 2 custom tiles (635, 637) |
| `path=a:_N,b:E` directed paths | 2 custom tiles (635, 637) |
| `future_label` | 1 (G15 — Kharkiv label appears in gray phase) |

---

## Implementation priority

### Phase 1 — Round-trip basics (affects 4–6 games)

1. **Bare keywords** (`blank`, `town`, `city`): trivial import expansion, no new data model needed.
2. **`groups:NAME`**: add `groups` string to hex/node data; import/export.
3. **`hide:1`**: add `hide` boolean; import/export; render with reduced opacity.
4. **`path=a:E,b:E`** bypass paths: new path type with no city node; import/export; render as straight track.
5. **Multiple icons**: change icon to `[{image, sticky}]` array; import/export both single and multiple.
6. **`border=edge:N,type:mountain,cost:N`**: extend border type enum; add distinct SVG style.

### Phase 2 — Pre-printed tile accuracy (affects 3–4 games)

7. **`loc:X.Y`**: store on each city node, translate to SVG position offset.
8. **`path=a:_N,b:E`** directed paths: emit when OO exit pairs define two exits per node (data already collected by wizard).
9. **Phase-based revenue on `city=`**: share the existing offboard revenue parser.
10. **`future_label`**: store `{label, color}`, round-trip import/export; render as greyed overlay.

### Phase 3 — 1822-specific features

11. **`stub=edge:N`**: `stubs` array on hex data; render short track nubs.
12. **`junction`** feature type: boolean; render as hollow circle node.
13. **`lanes:N`** and **`a_lane:X.Y`**: path attributes, import/export pass-through.
14. **`visit_cost:N`** and **`ignore:1`**: offboard/path attributes, import/export pass-through only.

---

## Notes on company home tokens

Home tokens are not in `map.rb`; they live in `corporations.rb` (`:coordinates` and `:city` fields). The editor already supports assigning a company to a hex coordinate. No gap in the map layer — a future import of `corporations.rb` would pre-populate home tokens automatically.

---

## Notes on custom tile definitions

All six games define custom pre-printed tiles in a `TILES` hash (in `game.rb` or a companion file), not inline in `map.rb`. The HEXES map references them by tile number (`'290'`, `'X3'`, `'635'`). The tool currently receives the expanded inline code via the static import path and does not need the tile catalogue for rendering. For a full round-trip that emits tile numbers instead of inline code strings, a reverse tile-catalogue lookup would be required.
