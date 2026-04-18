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
