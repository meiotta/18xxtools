# 18xx Game Designer — Implementation Plan

> **Purpose:** Track the arc from "map + company editor" to "generate a working game.rb."
> Updated after every major session. Check boxes as work ships.

---

## Vision

A designer opens this tool, fills in the map, companies, trains, phases, and auction rules, hits Export, and receives a ZIP that contains a fully playable game module for the tobymao 18xx engine — no hand-editing of Ruby required.

---

## Current State (April 2026)

### ✅ Shipped

| Area | Detail |
|------|--------|
| Map editor | Hex grid, terrain, cities, towns, labels, orientation |
| Tile palette | All tobymao canonical tiles, rotation picker |
| Privates | Ability system (tile lay, teleport, token, blocks, exchange, grants_train, hex bonus, train discount, close, generic) |
| **Concessions** | Type toggle (Private / Concession), linked major field, blocks-hexes field, min-bid-adjust field, rail badge |
| Corporation packs | Type presets (major/minor/coal/national/system/public/custom), share structure editor, token slot editor, float % override per company, charter color chip picker (24 18xx colors) |
| **Associated minors** | `associatedMajor` field on minor-pack companies, rail badge, datalist autocomplete |
| Trains & phases | Train roster with distance types, permanent/pullman/local flags, grants_train link to private |
| Stock market | 2-D grid editor, movement rules (dividend right, withheld left, sold-out up), can-pool toggle |
| Financial rules | Bank size, player count, par types |
| Logic rules | Configurable game-logic rules panel |
| Save / Load | JSON round-trip, ZIP export (map, tiles, game, companies, readme) |
| Autosave | localStorage with restore banner |
| Import | entities.rb Ruby parser (partial — map hexes + tile upgrades) |

---

## Roadmap

### Phase 1 — Game Structure (Next up)

- [ ] **Phases panel** (new tab or section inside Trains tab)
  - Phase name / number
  - Triggering train purchase (e.g. "first 3-train")
  - Tiles unlocked per phase (yellow / green / brown / gray)
  - Operating rounds count for this phase
  - Train limit per corporation in this phase
  - Export shape: `PHASES = [{ name:, train_limit:, tiles:, ... }]`

- [ ] **Events system** (attached to phases)
  - Train-rust events (which phase, which train label rusts)
  - Private-close events (phase trigger)
  - Custom events (e.g. nationalization trigger, terrain changes)
  - Export shape: `TRAINS = [{ name:, distance:, ..., events: [{ type: 'close_companies' }] }]`

- [ ] **Auction / bidding mechanics** (new section in Privates or a dedicated Config tab)
  - Auction type per company: fixed-price, bid-box (1822), waterfall, all-pay, none
  - Initial offering order (alphabetical, face value, custom)
  - Minimum bid increment (default $5)
  - Pass penalty (some games charge for passing)
  - Priority deal card: first to pass vs. lowest bidder, etc.
  - Export shape: drives `AUCTION_COMPANIES`, `COMPANY_ORDERS`, and stock round class choice

### Phase 2 — Operating Mechanics

- [ ] **Round structure definition**
  - Number of stock rounds per set
  - Number of operating rounds per set (or phase-driven)
  - Initial auctions before first SR (1822-style concession round)
  - Export shape: `OPERATING_ROUNDS`, `STOCK_ROUNDS`, round class selection

- [ ] **Minor company merge rules**
  - Minors fold into associated major on float (1822/PNW model)
  - Independent minor dissolution vs. merge
  - Treasury transfer rules (take cash, take trains, both)
  - Export shape: overrides in `merged_into`, `merge_rounds`

- [ ] **Concession → major pipeline** (full roundtrip)
  - Concession win → right to par linked major
  - Par price constraints from concession ownership
  - Blocking hexes released when concession transferred or major parred
  - Export: concession `exchange` ability with `from: 'par'`, `corporations:`, `blocks_hexes_consent`

- [ ] **National / government corporations** (1822MX NDEM model)
  - No home hex, no float requirement
  - 10 free tokens, limited shares
  - Nationalization trigger (absorbs companies that meet a condition)

- [ ] **Train limit enforcement**
  - Phase-specific train limits
  - Forced train sales / discards
  - Emergency train buy rules

### Phase 3 — Export (game.rb generation)

- [ ] **entities.rb export**
  ```ruby
  COMPANIES = [ { sym:, name:, value:, revenue:, abilities: [...] }, ... ]
  MINORS    = [ { sym:, name:, ..., abilities: [{ type: 'description', description: 'Associated minor for XYZ' }] }, ... ]
  CORPORATIONS = [ { sym:, name:, type:, float_percent:, ..., tokens: [...] }, ... ]
  ```

- [ ] **map.rb export**
  - Hex grid with terrain costs, city/town/label attributes
  - Blocked hexes from concessions and minors
  - Offboard cells with phase-dependent values

- [ ] **game.rb template**
  - `BANK`, `CERT_LIMIT`, `STARTING_CASH`
  - Phase and train constants
  - Operating round class (stub with route logic placeholders)
  - Stock round class
  - Merge round class (if minors present)
  - Initial auction / concession round class

- [ ] **game.json export** (tobymao manifest format)
  - `title`, `players`, `bank`, `cert_limit`, etc.

### Phase 4 — Import & Validation

- [ ] **Full entities.rb import**
  - COMPANIES → privates + concessions (detect by `exchange` ability)
  - CORPORATIONS (type: minor) → minor pack companies
  - CORPORATIONS (type: major) → major pack companies
  - Concession `exchange` ability → `linkedMajor` field
  - Minor `description` ability with "Associated minor for XYZ" → `associatedMajor` field
  - 1822MX NDEM-style special corps → national pack

- [ ] **Game validation** (pre-export checks)
  - All majors have a home hex
  - All concessions have a linked major that exists
  - All minors with `associatedMajor` point to a valid major sym
  - Train set non-empty
  - At least one phase defined
  - Share structures sum to 100%
  - Phase count ≥ train tier count
  - Bank amount is a positive integer

---

## Data Model Reference

### Private Company
```json
{
  "name": "G&SWR",
  "companyType": "private | concession",
  "buyerType": "any | player | corporation",
  "cost": 100,
  "revenue": 10,
  "linkedMajor": "GWR",
  "blocksHexes": ["L39"],
  "minBidAdjust": 0,
  "closesOn": "3",
  "abilities": [
    { "type": "exchange", "corporations": ["GWR"], "owner_type": "player", "from": "par" },
    { "type": "blocks_hexes", "owner_type": "player", "hexes": ["L39"] }
  ]
}
```
> `minBidAdjust` is positive; adds to face value for the minimum bid floor.
> 1822MX C1 has `minBidAdjust: 100` because M18 is bundled (min bid $200 on $100 face).

### Minor Company (in a pack)
```json
{
  "id": "co_abc123",
  "sym": "1",
  "name": "Caledonian Railway",
  "color": "#EF1D24",
  "textColor": "#ffffff",
  "coordinates": "D12",
  "city": 0,
  "logo": "1822PNW/CPR_minor",
  "associatedMajor": "CPR",
  "tokens": [0],
  "abilities": []
}
```
> `associatedMajor` maps to the tobymao `description` ability:
> `{ type: 'description', description: 'Associated minor for CPR' }`

### Concession → entities.rb Ruby
```ruby
{
  sym: 'C2', name: 'GWR Concession', value: 100, revenue: 10,
  color: '#008000', text_color: 'white',
  abilities: [
    { type: 'exchange', corporations: ['GWR'], owner_type: 'player', from: 'par' },
    { type: 'blocks_hexes_consent', owner_type: 'player', hexes: %w[L39] },
  ]
}
```

### Associated Minor → entities.rb Ruby
```ruby
# In CORPORATIONS:
{
  sym: '1', name: 'Pacific Great Eastern', type: 'minor',
  float_percent: 100, always_market_price: true,
  tokens: [0], hide_shares: true, shares: [100], max_ownership_percent: 100,
  color: '#EF1D24', text_color: 'white',
  coordinates: 'A8', city: 0,
  abilities: [{ type: 'description', description: 'Associated minor for CPR' }]
}
```

---

## Known Hard Problems

| Problem | Notes |
|---------|-------|
| **1822MX NDEM nationalization** | NDEM absorbs companies; requires game hook `company_bought()` + corp tracking dict. No UI model yet. |
| **Pullman restrictions** | Pullman cannot be the only train on a route. This is route-validation logic in game.rb, not entity data. |
| **Token-city tile sequences** | 1822PNW Portland/Seattle use upgrade sequences X20→X21→X22→X23. Requires special tile manifest + upgrade graph. |
| **3/2-train (1822MX P3)** | Runs like a 3-train but earnings halved. No standard distance field — needs a custom `distance` hash. |
| **Backroom Negotiations (1822PNW P20)** | Lets a non-associated minor steal associated status from another. Very game-specific logic; needs `choose_ability`. |
| **Blocking consent** | `blocks_hexes_consent` (blocking released when owner consents) vs `blocks_hexes` (unconditional). The UI `blocks_hexes` ability maps to `blocks_hexes_consent` in engine for concessions. |
| **1822MX C1 discount: -100** | Min bid is $200 on $100 face. The `discount: -100` field in tobymao means "add $100 to min bid". We store this as `minBidAdjust: 100`. Export must emit `discount: -100`. |

---

## Architecture Notes

- **No build step** — vanilla JS, ES5-compatible globals, single `index.html` entry point
- **State object** — single `state` global, serialized to JSON for all persistence
- **Rendering** — full DOM replacement on each mutation (no virtual DOM); canvas for the map
- **Load order** — scripts must load in numbered order (see comments in each file)
- **tobymao engine compatibility** — target the `tobymao/18xx` Ruby engine; game modules live under `lib/engine/game/`

---

## Session Log

| Date | Work |
|------|------|
| Apr 2026 | Map editor, tile palette, basic companies table |
| Apr 2026 | Private company ability system (grants_train, tile_lay, exchange, etc.) |
| Apr 2026 | Corporation pack system (replace flat Minors/Majors tables) |
| Apr 2026 | Share structure editor, token slot editor, charter band, color chip picker |
| Apr 2026 | **Concessions** — type toggle, linked major, blocks hexes, min bid adjust |
| Apr 2026 | **Associated minors** — `associatedMajor` field, rail badge, datalist autocomplete |
| Apr 2026 | Entities audit — 112 games, 31 ability types catalogued |

---

## Phase 4.5 — entities.rb import completeness
_Based on entities audit 2026-04-19. See ENTITIES_AUDIT.md for full data._

> **Scoring basis:** (frequency × missing_severity), where missing_severity=2 = zero fields past type, 1 = key fields dropped. Implementation within `_rbAbilities` in `js/import-ruby.js` (lines 1026–1048) unless noted.

### Priority 1 — `tile_lay` field extraction (232 occurrences, 59 games)
The most common ability. `_rbAbilities` stores only `type`, `owner_type`, `hexes`. Missing: `count`, `when`, `free`, `tiles`, `closed_when_used_up`, `reachable`.

**Fix:** In `_rbAbilities`, after extracting `owner_type` and `hexes`, also extract:
- `count` via `_rbNum(h, 'count')`
- `when` via `_rbStr(h, 'when')`
- `free` via boolean: `/\bfree:\s*true/.test(h)`
- `tiles` via `_rbStrArr(h, 'tiles')`
- `closed_when_used_up` via boolean: `/\bclosed_when_used_up:\s*true/.test(h)`
- `reachable` via boolean (default true, explicitly false in some files)

Impact: imported `tile_lay` abilities will populate correctly in the ABILITY_DEFS editor.

### Priority 2 — `shares` ability field extraction (124 occurrences, 43 games)
The `shares:` field (e.g. `shares: 'EPP_0'` or `shares: %w[...]`) is never read by `_rbAbilities`. The ABILITY_DEFS UI has a `shares` tags field that remains blank after import.

**Fix:** In `_rbAbilities`, add extraction of `shares` using `_rbStrArr(h, 'shares')` with fallback for single-string form `_rbStr(h, 'shares')`.

Impact: privates that grant initial shares (1817, 1846, 1856, 18EU etc.) will show the correct share identifiers.

### Priority 3 — `close` ability field extraction (108 occurrences, 38 games)
The `when:` and `corporation:` fields are not extracted. A `close` ability after import shows empty defaults in the ABILITY_DEFS `when` select.

**Fix:** In `_rbAbilities`, add `when` via `_rbStr(h, 'when')` and `corporation` via `_rbStr(h, 'corporation')`.

Impact: correct close triggers preserved (e.g. `when: 'bought_train'`, `when: 'operated'`).

### Priority 4 — `exchange` from-array pattern (10 games silently broken)
`_rbStr(h, 'from')` matches only `from: 'string'`. When source uses `from: %w[ipo]` or `from: %i[reserved]`, the `from` value is dropped entirely. Affects `g_1828`, `g_1830`, `g_1836_jr30`, `g_1847_ae`, `g_1850_jr`, `g_1868_wy`, `g_18_mo`, `g_18_neb`, `g_18_nl`, `g_18_oe_uk_fr`.

Also: the `when:` field on exchange abilities is never extracted.

**Fix (a):** Replace `_rbStr(h, 'from')` with a function that also matches `%w[...]` and `%i[...]` array forms. If the result is a single-element array, unwrap to string; if multi-element, store as array (matching `exchange.from` being a tags field in ABILITY_DEFS).
**Fix (b):** Extract `when` via `_rbStr(h, 'when')` for all ability hashes.

Impact: exchange abilities in 10 games regain their `from` value. The ABILITY_DEFS `when` field populates for all exchange/close/tile_lay abilities.

### Priority 5 — `no_buy` → `buyerType` mapping (175 occurrences, 35 games)
`no_buy` is stored as a bare `{ type: 'no_buy' }` in `p.abilities[]`. The data model already has `buyerType: 'no_acquire'` for this concept. The current code only sets `buyerType` via a `desc` regex heuristic, which misses companies that use the ability without a matching description.

**Fix:** In `_rbParseCompany`, after calling `_rbAbilities`, check for any ability with `type === 'no_buy'`. If found, set `buyerType = 'no_acquire'` unconditionally and remove the `no_buy` ability from `p.abilities[]` (it is already expressed by `buyerType`). The desc-regex heuristic can remain as a fallback for games that use the old description-only pattern.

Impact: 35 games will have correct `buyerType` without depending on `desc` text matching.

### Priority 6 — `token` price and count (53 occurrences, 27 games)
`price` and `count` are dropped. After import, token abilities show $0 / 1 use.

**Fix:** In `_rbAbilities`, add `price: _rbNum(h, 'price')` and `count: _rbNum(h, 'count')`.

### Priority 7 — `hex_bonus` amount and `tile_discount` terrain (54 + 44 occurrences)
Both are single missing fields on otherwise-supported types.

**Fix (`hex_bonus`):** Add `amount: _rbNum(h, 'amount')`.
**Fix (`tile_discount`):** Add `terrain: _rbStr(h, 'terrain')`.

### Priority 8 — `revenue_change` ability (92 occurrences, 14 games)
Phase-dependent private revenue changes. Zero fields extracted, no UI def. Affects 14 games including large-company games (1822 family).

**Design note:** `revenue_change` has `revenue:` (new value) and `on_phase:` (trigger phase name). A minimal implementation stores these as raw fields with no UI editor — enough for round-trip export fidelity.

**Fix (import):** In `_rbAbilities`, extract `revenue: _rbNum(h, 'revenue')` and `on_phase: _rbStr(h, 'on_phase')`.
**Fix (UI):** No new ABILITY_DEF required for Phase 4.5 — show the raw object in the generic fallback renderer. A full UI def is Phase 5+ work.

### Priority 9 — `assign_hexes` and `reservation` UI defs (82 + 78 occurrences, 34 + 11 games)
Both have `hexes:` extracted already (it is a global extraction), but no ABILITY_DEFS entry and no downstream rendering. They appear as raw objects in the ability list.

**Fix:** Add minimal ABILITY_DEFS entries for `assign_hexes` and `reservation` with a `hexes` tags field and a `suggest()` that describes the hex list. These need a category entry in `ABILITY_CATEGORIES` too.

### Not in scope for Phase 4.5
The following types are rare (≤10 occurrences), highly game-specific, or require engine logic beyond the importer:
- `choose_ability`, `sell_company`, `manual_close_company`, `train_buy`, `train_limit`, `additional_token`, `acquire_company`, `borrow_train`, `blocks_partition`, `train_scrapper`, `purchase_train`, `base`, `tile_income`

These will be stored as bare `{ type: '...' }` objects and are acceptable for now. A generic "raw ability" display mode in the UI would surface them without requiring individual defs.
