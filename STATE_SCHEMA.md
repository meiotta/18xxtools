# `state` schema reference for `validateGame` (PR1j prerequisite)

> **Status:** Mapping-pass for the `validateGame(state)` cross-panel
> validator. Audited against current source on `claude/awesome-shamir-a0ec27`
> (head `c6c2bda`). Shapes here reflect what each panel actually *writes*,
> not what it *aspires to*.
> **Scope:** schema only. Constraint logic ships separately (per
> Evan's audit of the 8 target games).
> **Last updated:** 2026-05-09.
> **Companion docs:** `STEPS_INFERENCE.md`, `EXPORT_COHERENCE.md`.

---

## §0. How to read this doc

Every panel's section has three parts:

1. **Shape** — the fields a validator can read today, sourced from each
   panel's `init*State` / `push({...})` / mutation sites in the live JS.
2. **Owner** — which JS file writes the field. Validators that mutate state
   should NOT exist; validators read only.
3. **Validator hooks** — what cross-checks a `validateGame` can run *given
   the current schema*. Where it can't, §4 captures the gap.

`?` = optional / sometimes-undefined. `Set<X>` = JavaScript Set. Anything not
in this doc is by definition outside the validator's read surface.

---

## §1. Top-level state shape

Defined in `js/state.js:40–89` and extended by panel-init functions on first
use. The save-file format is `JSON.stringify(state)` (per `js/io.js`).

```js
state = {
  meta:          { ... },          // map metadata + game-wide knobs (see §2.1)
  hexes:         { [hexId]: HexObject },        // map data — keyed by '<col><row>' string (e.g. 'B12')
  enabledPacks:  null | string[],  // tile-pack identifiers active in the manifest
  companies:     CompanyObject[],  // legacy major-company table (still written by Wizard; see §2.2)
  minors:        MinorObject[],    // minor companies (Companies → Minors tab)
  corpPacks:     CorpPack[],       // canonical corporation registry (Companies → Corps tab)
  trains:        TrainObject[],    // Trains & Phases panel — train roster
  phases:        PhaseObject[],    // Trains & Phases panel — phase definitions
  privates:      PrivateObject[],  // private companies (Companies → Privates tab)
  auction:       { ... },          // initial auction config (Companies → Auction tab)
  terrainCosts:  { ... },          // legacy global terrain cost defaults (PENDING REMOVAL)
  financials:    { ... },          // bank + market + logic rules (Market panel)
  phase:         'setup' | 'design',  // app mode flag, not gameplay phase
  mechanics:     { ... },          // game-wide mechanics + functionMap (Mechanics panel; see §2.6)
};
```

The two slots that look ambiguous and *should* be flagged for the wider
team:
- `state.companies` and `state.corpPacks` BOTH exist. `companies` is the
  legacy "major company" table, written by the Companies Wizard at
  `companies-panel.js:225`. `corpPacks` is the new pack-based corp registry
  (`companies-panel.js:2244`). Most importers/exporters now read `corpPacks`;
  the legacy `companies` array survives because the Wizard hasn't been
  ported. **A validator should treat `corpPacks` as authoritative for
  corporation data and treat `companies` as a possibly-stale shadow.**
- `state.enabledPacks` is declared twice in `state.js` (lines 43 and 80).
  Both default to `null`. JS object-literal duplicate keys keep the second
  one — so the line-80 declaration is the actual binding. Cosmetic but
  worth knowing.

---

## §2. Per-panel field maps

### §2.1 Map (`state.meta`, `state.hexes`)

**Owner:** `state.js` (init), `canvas-input.js` (writes), `import-ruby.js`
(bulk writes on import), `static-hex-builder.js` (composition writes).

**`state.meta` shape:**

| Field | Type | Notes |
|---|---|---|
| `title` | string | Free text — the game's display title |
| `baseGame` | `'custom' \| '1830' \| '1846' \| '1822' \| '1889' \| '1856' \| '1861' \| '1882'` | Base-game preset key |
| `rows` | number | Internal grid row count |
| `cols` | number | Internal grid col count |
| `orientation` | `'flat'` | Always flat-top in this tool |
| `staggerParity` | `0 \| 1` | Which internal cols are staggered |
| `coordParity` | number | Coordinate-system flag (transposed-axes import marker) |
| `maxRowPerCol` | `null \| number[]` | Per-column row clipping (1889-style) |
| `bank` | number | Game-wide starting bank cash (legacy — `state.financials.bank` is canonical) |
| `playersMin` | number | Minimum player count |
| `playersMax` | number | Maximum player count |

**`state.hexes` — keyed by hex coordinate string (e.g. `'B12'`).** Default
shape from `canvas-input.js:451–459`:

| Field | Type | Notes |
|---|---|---|
| `terrain` | `'' \| 'mountain' \| 'hill' \| 'water' \| 'swamp' \| 'forest' \| 'desert' \| 'pass' \| 'offmap'` | Terrain class |
| `terrainCost` | number | Per-hex terrain cost ($, additive on tile lay) |
| `tile` | `0 \| number \| string` | Tile number (string for `'X3'` etc); `0` = no tile |
| `rotation` | `0–5` | 60° increments |
| `city` | `null \| { name, slots: 1\|2\|3, home: <abbr>, revenue: { yellow, green, brown, grey } }` | Pre-printed city when set; hex's tile may add more slots dynamically (see §4) |
| `town` | `null \| { name } \| false` | Pre-printed town; the `false` value is legacy |
| `oo` | boolean | OO tile flag (only on hexes with `oo: true` in TILE_DEFS — note the OO definition warning in PROJECT_REFERENCE.md §8) |
| `ooCityName` | string | Display name for OO cities |
| `dualTown` | boolean | Dual-town flag |
| `cityName` | string | Free-text city name override |
| `label` | string | Hex label (e.g. `'NY'`, `'OO'`, `'Y'`) |
| `upgradesTo` | number[] | Override list of valid upgrade tile numbers |
| `overrideUpgrades` | boolean | If true, `upgradesTo` replaces the default upgrade graph; else additive |
| `riverEdges` | number[] | Edges (0–5) with rivers drawn |
| `borders` | `{ edge, type, cost }[]` | Per-edge border markers (impassable/water/mountain) |
| `killed` | boolean | Hex is "killed" (dropped from valid map) — set by `importRubyMap` for non-rectangular maps |
| `static` | boolean? | When `true`, hex uses the static-hex-builder model (offboard / preprinted) |
| `bg` | `'white'\|'yellow'\|'green'\|'brown'\|'gray'\|'red'\|'blue'`? | Static-hex background color |
| `feature` | `'offboard'\|'city'\|'town'\|'oo'\|'c'\|'m'\|'none'`? | Static-hex feature type |
| `exits` | number[]? | Static-hex track exit edges |
| `exitPairs` | number[][]? | Static-hex multi-city exit-to-node mapping |
| `revenues` | `{ phase, value }[]`? | Static-hex phase-conditional revenue (offboard) |
| `hidden` | boolean? | Static-hex solid-fill mode |
| `nodes` | `{ type: 'city'\|'town'\|'junction', slots?, locStr? }[]`? | Free-form node array (used by static-hex-builder) |
| `paths` | `{ a: {type, n}, b: {type, n}, terminal? }[]`? | Free-form path array |
| `cityRevenues` | number[]? | Legacy save-file format for multi-city per-color revenue |
| `townRevenues` | number[]? | Legacy save-file format for town revenue |

**Validator hooks:** can read every hex's tile number, rotation, terrain
cost, label, riverEdges, borders, killed flag. Can read pre-printed city/
town fields when explicitly set. Can read `nodes`/`paths` when the
static-hex-builder was used. **CANNOT** read tile-derived city slot count
without a separate DSL parser (see §4.1).

---

### §2.2 Companies — Privates / Minors / Corps / Auction

**Owner:** `js/companies-panel.js`. Four sub-tabs, each writes its own slice.

#### `state.privates[]` (Privates tab)
Shape from `companies-panel.js:694, 1148`:

| Field | Type | Notes |
|---|---|---|
| `name` | string | Company name |
| `sym` / `abbr` | string | Symbol used in COMPANIES export and as cross-panel join key |
| `cost` (or `value`) | number | Face value at start |
| `revenue` | `number \| number[]` | Per-OR revenue (number) or phase-conditional (array) |
| `ability` / `desc` | string | Free-text description |
| `buyerType` | `'any'\|'player'\|'corporation'\|'no_acquire'` | Who can purchase |
| `closesOn` | `null \| string` | Train name that closes the company |
| `companyType` | `'private'\|'concession'`? | Concession flag for 1822-family games |
| `linkedMajor` | string? | Major sym this concession links to |
| `blocksHexes` | string[]? | Hex coords this private blocks |
| `minBidAdjust` | number? | Add to face value for min bid floor (1822MX C1) |
| `color` | string? | Hex color of charter card |
| `mailContract` | `{ enabled, formula, perStopAmount }`? | Mail-contract config |
| `priceMovement` | object? | **Mark's surface** — Dividend step rules per `dividend-rules.js` |
| `abilities` | `Ability[]` | Structured ability list — see ability shape below |

**Ability shape** (each entry in `priv.abilities[]`):
- `type` (string — `'tile_lay'`, `'token'`, `'exchange'`, `'blocks_hexes'`, `'grants_train'`, `'hex_bonus'`, `'train_discount'`, `'close'`, `'tile_discount'`, `'reservation'`, `'assign_hexes'`, `'description'`, `'no_buy'`, `'revenue_change'`, `'choose_ability'`, …)
- `owner_type` (`'player'` | `'corporation'`)
- `when` — string or string[]; **referenced by `validateStepConstraints` Check (e)**
- `hexes`, `corporations`, `count`, `count_per_or`, `cost`, `discount`, `amount`, `price`, `from`, `terrain`, `tiles`, `corporation`, `shares`, `description`, `on_phase`, `closed_when_used_up`, `free`, `reachable`
- (per `_rbAbility` in `export-game.js:86` and `import-ruby.js`'s `_rbAbilities`)

#### `state.minors[]` (Minors tab — old wizard path)
Shape from `companies-panel.js:246–255`:

| Field | Type | Notes |
|---|---|---|
| `name` | string | Minor name |
| `abbr` | string | Symbol — **cross-panel join key** |
| `color` | string | Hex color |
| `homeHex` | string | Hex coord (e.g. `'F8'`) — **map join key**; empty when `locationMechanism != 'fixed'` |
| `tokens` | number[] | Token costs by slot |
| `locationMechanism` | `'fixed'\|'draft'\|'choose'` | How home location is determined |
| `trainPurchaseTiming` | string | When minor can buy trains |
| `minBid` | number | Auction floor |

#### `state.corpPacks[]` (Corps tab — canonical)
Each pack has pack-level defaults plus a `companies[]` array of corps that
inherit them. Pack shape from `companies-panel.js:1171–1179, 2244`:

| Pack field | Type | Notes |
|---|---|---|
| `id` | string | Pack identifier (`pk_<rand>`) |
| `label` | string | Display name |
| `type` | `'major'\|'minor'\|'coal'\|'national'\|'system'\|'public'\|'custom'` | Drives defaults |
| `floatPct` | number | % of shares sold to float |
| `maxOwnershipPct` | number | Cap on share ownership |
| `capitalization` | `'full'\|'incremental'\|'none'\|'escrow'` | Cap mode |
| `alwaysMarketPrice` | boolean | Skip par market |
| `shares` | number[] | Share-distribution percentages |
| `tokens` | number[] | Default token costs |
| `companies` | `CompanyObject[]` | Corps inheriting these defaults |

Per-company shape inside `pack.companies[]`:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Internal id |
| `sym` | string | Symbol — **cross-panel join key** |
| `name` | string | Display name |
| `color` | string | Charter hex |
| `textColor` | string | Charter text color |
| `coordinates` | string | Home hex (e.g. `'A19'`) — **map join key**; empty for nationals/etc. |
| `city` | number? | City index for multi-city home hex |
| `logo` | string? | Logo asset path |
| `destinationCoordinates` | string? | Destination hex |
| `floatPctOverride` | number? | Override pack `floatPct` |
| `tokensOverride` | number[]? | Override pack `tokens` |
| `abilities` | `Ability[]` | Same shape as private abilities |
| `associatedMajor` | string? | Minor's linked major sym |

#### Legacy `state.companies[]` (old Wizard path — flagged for migration)
Shape from `companies-panel.js:225–230`:

| Field | Type | Notes |
|---|---|---|
| `name`, `abbr`, `color`, `homeHex`, `parValue`, `tokens`, `floatPct` | per-field as expected | **Stale shadow of `corpPacks` — validators should prefer `corpPacks`.** |

#### `state.auction` (Auction tab)
Shape from `state.js:50–62`:

| Field | Type | Notes |
|---|---|---|
| `hasInitialRound` | boolean | Whether the game has an auction round at all |
| `mechanism` | `'waterfall'\|'bid_box'\|'draft'\|'fixed'\|'none'` | Auction style |
| `bidIncrement` | number | Min bid increment ($) |
| `mustBeMultiple` | boolean | Bids must be exact multiples |
| `companyOrder` | `'value_asc'\|'value_desc'\|'custom'` | Waterfall ordering |
| `passDecreases` / `passAmount` | boolean / number | Waterfall: price drops if all pass |
| `privateSlots` / `minorSlots` / `concessionSlots` | number | Bid-box visible counts |
| `draftOrder` | `'snake'\|'sequential'` | Draft ordering |

---

### §2.3 Trains & Phases (`state.trains`, `state.phases`)

**Owner:** `js/trains-panel.js`.

#### `state.trains[]`
Shape from `trains-panel.js:294–302`:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Auto-generated `t_<rand>` — used as cross-train reference |
| `type` | string? | User-supplied label (e.g. `'2'`, `'3'`, `'D'`); falls back to `id` for `rustsOn` matching |
| `distType` | `'n'\|'nm'\|'xy'\|'u'\|'h'` | Distance type — n=cities, nm=city+town, xy=pay/visit, u=unlimited, h=hex |
| `n`, `m`, `x`, `y`, `h` | number? | Distance parameters per `distType` |
| `cost` | number | Purchase price |
| `count` | number | Quantity in the box |
| `rusts` | boolean | Does this train rust? |
| `rustsOn` | string? | Train `type` (preferred) or `id` whose introduction rusts this train |
| `phase` | string? | (Currently unused — phase trigger is on the phase, not the train) |
| `events` | `{ type: string }[]`? | Event triggers fired when this train is bought |
| `variants` | `Variant[]` | E-train / multiplier variants |
| `isVariant` | boolean? | Set on import — flagged variant rows |
| `parentId` | string? | Set on import — parent train id when `isVariant: true` |
| `multiplier` | number? | Revenue multiplier (variant only) |
| `dynamic` | boolean? | Phase-driven train (Mechanics panel toggle) |
| `_isSpecial` | boolean? | Internal flag (private-granted / pullman / permanent) |
| `privateOnly` | boolean? | Private-granted; not from depot |
| `grantedBy` | `{ sym, name }[]`? | Privates that grant this train |

#### `state.phases[]`
Shape from `trains-panel.js:479`:

| Field | Type | Notes |
|---|---|---|
| `name` | string | Phase name (e.g. `'2'`, `'3'`) |
| `onTrain` | string | Train `id` that triggers this phase — **train join key** |
| `ors` | number | Operating rounds in this phase |
| `limit` | number | Train limit |
| `tiles` | `'yellow'\|'green'\|'brown'\|'grey'\|'gray'\|'blue'` | Highest tile color unlocked |
| `color` | string | Phase chip color |
| `status` | string[]? | Phase-status flags (`'can_buy_companies'`, `'limited_train_buy'`, etc.) — **referenced by `validateStepConstraints` Check (d)** |

---

### §2.4 Market / Financials (`state.financials`)

**Owner:** `js/financials-panel.js`. Init at `financials-panel.js:6–25`.

| Field | Type | Notes |
|---|---|---|
| `bank` | number | Bank cash (canonical — `state.meta.bank` is legacy) |
| `marketType` | `'1D'\|'1.5D'\|'2D'\|'zigzag'` | Grid topology |
| `market` | `string[][] \| string[]` | Cell strings (`'100'`, `'80p'`, `'40y'`, `''`) |
| `marketRows` / `marketCols` | number | Grid dimensions for 2D / zigzag |
| `rules` | `{ dividend, withheld, soldOut, canPool }` | Top-level price-movement rules |
| `logicRules` | object[] | Drag-and-drop rule pills (see `rule-builder.js`) |
| `locks` | `{ "<r>,<c>": price }` | Cells the wizard must not overwrite |
| `bonusPerShare` | object | Per-share bonus rules |
| `soldOutIncrease` | boolean | Sold-out share-price movement enabled |
| `unlimitedTypes` | string[] | Cell suffix codes treated as no-cert-limit |
| `multipleBuyTypes` | string[] | Cell suffix codes treated as multiple-buy |
| `selectedCell` | `null \| { r, c }` | Transient inspector selection |

**Cell suffix legend** (after the numeric value): `p` par, `y` yellow zone,
`o` orange zone, `b` brown zone, `c` custom. Empty cell = inactive.

---

### §2.5 Mechanics (`state.mechanics`)

**Owner:** `js/mechanics-panel.js`. Init at `mechanics-panel.js:269–368`.

| Field | Type | Notes |
|---|---|---|
| `functionMap` | `{ [rubyName]: { type: 'const'\|'ref'\|'method'\|'raw', ... } }` | Imported game.rb constants/methods (`import-game.js`) |
| `initialRound` | `'waterfall_auction'\|'draft'\|'parliament'\|'certificate_selection'\|'none'` | Legacy — duplicates `state.auction.mechanism`; both panels currently write |
| `stockRoundsPerSet` | number | SR count per loop |
| `mergerRound` | boolean | Legacy merger-enable flag (now mirrored at `state.mechanics.rounds.merger`) |
| `minPlayers` / `maxPlayers` | number | Player range — **shadows `state.meta.playersMin/Max`** |
| `bankCash` | number | Bank cash — **shadows `state.financials.bank` and `state.meta.bank`** |
| `currency` | string | `printf` format string for currency |
| `startingCash` | `{ [playerCount]: amount }` | Per-player-count starting cash |
| `certLimit` | `{ [playerCount]: limit }` | Per-player-count certificate limit |
| `capitalization` | `'full'\|'incremental'\|'none'\|'escrow'` | Game-level cap mode |
| `homeTokenTiming` | `'par'\|'float'\|'operate'\|'operating_round'\|'never'` | When home tokens are placed |
| `marketShareLimit` | number | % cap on market shares |
| `bankruptcyAllowed` | boolean | **Referenced by inference rule 1 in `STEPS_INFERENCE.md`** |
| `bankruptcyEndsGameAfter` | `'one'\|'all_but_one'` | Bankruptcy game-end trigger |
| `trackRestriction` | `'permissive'\|'semi_restrictive'\|'restrictive'\|'city_permissive'\|'station_restrictive'` | Track-lay rule |
| `sellBuyOrder` | `'sell_buy'\|'buy_sell'\|'sell_buy_sell'\|'sell_buy_or_buy_sell'` | SR phase order |
| `sellMovement` | `'down_share'\|'down_block'\|'left_block'\|'left_block_pres'\|'none'` | Share-sale price movement |
| `poolShareDrop` | `'down_block'\|'none'` | Pool share drop rules |
| `mustSellInBlocks` | boolean | Block-sell constraint |
| `sellAfter` | `'first'\|'operate'\|'any_time'\|'p_any_time'\|'p_any_operate'\|'full_or_turn'` | Sell-share timing |
| `allowRemovingTowns` | boolean | OR town-removal rule |
| `mustBuyTrain` | `'route'\|'always'\|'never'` | Mandatory train purchase |
| `ebuyFromOthers` | `'value'\|'never'\|'always'` | Emergency buy source rules |
| `ebuyDepotCheapest` | boolean | EBUY must be cheapest |
| `mustIssueBeforeEbuy` | boolean | Issue shares before EBUY |
| `tileLays` | `{ default, byType, phaseGated, phaseOverrides }` | Per-OR tile-lay slot config |
| `exchangeTokens` | `{ enabled, counts }` | Exchange token availability |
| `revenueBonuses` | object[] | Revenue bonus rules |
| `events` | object[] | Train-trigger event bindings |
| `orSteps` | `{ issueShares, homeToken, specialToken, minorAcquisition, priceProtection, loanOperations }` | **Permanent source-of-truth per Evan's annotation in `STEPS_INFERENCE.md`** |
| `merger` | `{ enabled, style, roundTiming, associations }` | Merger config |
| `nationalization` | `{ enabled, nationalCorpSym, triggerTrains, reservationHexes }` | 1822MX-style national-corp rules |
| `rounds` | RoundSlot map (see §2.6) | Round identity / steps / endHook / transitionHook |
| `gameEndCheck` | `{ [trigger]: { enabled, timing } }` | End-game triggers |

> **Bug to flag:** `functionMap` is declared twice in `initMechanicsState`
> (lines 276 and 366). JS keeps the second; both default to `{}`, so this
> is currently cosmetic — but worth deduplicating before the validator
> starts cross-checking it.

---

### §2.6 Rounds (`state.mechanics.rounds`)

**Owner:** `js/rounds-panel.js`. Schema per `EXPORT_COHERENCE.md §2`.

```js
state.mechanics.rounds = {
  initial:   RoundSlot,
  stock:     RoundSlot,
  operating: RoundSlot,
  merger:    null | RoundSlot,
  loop:            null | 'vanilla' | 'custom',
  customNextRound: null | string,
};
```

| RoundSlot field | Type | Notes |
|---|---|---|
| `class` | `null \| string` | Engine round class (`'Engine::Round::Stock'`, etc.) |
| `opts` | object | Constructor kwargs (`reverse_order`, `snake_order`, `rotating_order`) |
| `position` | `null\|'between_ors'\|'after_or_set'\|'before_sr'` | Merger only |
| `trigger` | `null\|'always'\|'phase_in'` | Merger only |
| `triggerCondition` | `null \| { phases: string[] }` | Merger only |
| `steps` | `StepEntry[]` | Ordered step list (Tier B) |
| `endHook` | `null \| { name, body, preset? }` | Round-end Ruby (Tier C) |
| `transitionHook` | `null \| string` | Per-tab `next_round!` branch body |
| `subclass` | legacy (pre-migration shape) | Tolerated in readers; converted to `endHook` on init |

**StepEntry** (each entry in `slot.steps[]`):

| Field | Type | Notes |
|---|---|---|
| `class` | string | `'Engine::Step::Foo'` or `'G<game>::Step::Foo'` |
| `opts` | object? | Per-entry kwargs (`{ blocks: true }`) |
| `source` | `'manual' \| 'default' \| { auto: '...' }`? | Provenance per `STEPS_INFERENCE.md §5` |
| `pinned` | boolean? | User-frozen against inference removal |
| `priceMovement` | object? | **Mark's surface — Dividend-step rules from `dividend-rules.js`** |

---

## §3. Cross-panel join keys

The seams a `validateGame` validator crosses, with the field on each side
that links them. "Validator can do today" notes whether the join is
queryable from current state.

### §3.1 Map ↔ Companies (corps + minors)

| Companies field | Map field | Validator can today |
|---|---|---|
| `corpPacks[].companies[].coordinates` (corp home) | `state.hexes[<coords>]` (existence) | ✓ Check that the hex exists at all |
| `corpPacks[].companies[].coordinates` | `state.hexes[<coords>].killed` | ✓ Check hex isn't killed |
| `corpPacks[].companies[].coordinates` + `.city` (city index) | `state.hexes[<coords>]` city slot count | ✗ Slot count is tile-DSL-derived (see §4.1) |
| `minors[].homeHex` (when `locationMechanism === 'fixed'`) | `state.hexes[<homeHex>]` | ✓ Existence; ✗ slot capacity |
| `companies[].homeHex` (legacy) | `state.hexes[<homeHex>]` | Same as above; legacy table flagged for migration |
| `privates[].blocksHexes[]` | `state.hexes[<each>]` | ✓ Existence check |
| `privates[].abilities[].hexes[]` (`tile_lay`, `assign_hexes`, `reservation`, `blocks_hexes`) | `state.hexes[<each>]` | ✓ Existence check |

### §3.2 Trains ↔ Phases

| Phase field | Train field | Validator can today |
|---|---|---|
| `phases[].onTrain` | `trains[].id` | ✓ Direct equality |
| `trains[].rustsOn` | `trains[].type` (preferred) or `.id` | ✓ Match by `type` first then `id`, per `trains-panel.js:317` |
| `trains[].grantedBy[].sym` | `privates[].sym` or `privates[].abbr` | ✓ Direct match (multi-fallback) |
| `mechanics.events[].triggerOn` | `trains[].name` | ✓ Direct match |

### §3.3 Companies ↔ Market

| Companies field | Market field | Validator can today |
|---|---|---|
| `corpPacks[].companies[]` (par-eligible corp) | `state.financials.market` cells with `'p'` suffix | ✓ Scan grid for any cell ending `'p'`; flag if none and any corp has a `parValue` |
| `corpPacks[].companies[].alwaysMarketPrice` | (no market grid — these skip par) | ✓ No cross-check needed; flag is independent |
| `corpPacks[].pack.capitalization` | `state.mechanics.capitalization` | ✓ Per-pack override against game-wide setting; flag mismatches if game-wide is `'incremental'` but pack is `'full'` (or vice versa) |

### §3.4 Entities (companies/privates) ↔ Mechanics

| Entities field | Mechanics field | Validator can today |
|---|---|---|
| `corpPacks[].companies[].coordinates` empty/null | `state.mechanics.homeTokenTiming` | ✓ If any corp has empty coordinates, `homeTokenTiming` should be `'par'`/`'float'`/`'never'` (already enforced by `validateHomeTokenTiming` in `mechanics-panel.js:494`) |
| `privates[].abilities[].type` | `state.mechanics.orSteps.*` toggles | ✓ `tile_lay` ability ↔ `orSteps.specialToken=true` (currently inverted: orSteps drives inference, not the other way) |
| `corpPacks[].companies[].associatedMajor` | `corpPacks[].companies[].sym` (matching major in some pack) | ✓ Resolved by `validateMergerAssociations` in `mechanics-panel.js:481` |
| `mechanics.exchangeTokens.counts[<sym>]` | `corpPacks[].companies[].sym` | ✓ Resolved by `validateExchangeTokenCorps` in `mechanics-panel.js:471` |

### §3.5 Phases ↔ Steps (Mechanics → Rounds)

| Phases field | Rounds field | Validator can today |
|---|---|---|
| `phases[].status[]` (`'can_buy_companies'`, `'limited_train_buy'`) | `rounds.<type>.steps[].class` (`BuyCompany`, `SingleDepotTrainBuy`) | ✓ Already implemented in `validateStepConstraints` Check (d) `STEP_PHASE_STATUS_MISSING` |
| `mechanics.events[].eventType` | `KNOWN_EVENTS` catalog (mechanics-panel.js) | ✓ Resolved by `validateTrainEventTypes` in `mechanics-panel.js:429` |
| `phases[].onTrain` | `trains[].id` | ✓ Already implemented in `validatePhaseOnCrossRefs` in `mechanics-panel.js:420` |

### §3.6 Privates/abilities ↔ Steps

| Ability field | Step field | Validator can today |
|---|---|---|
| `priv.abilities[].when` | `rounds.<type>.steps[].class` | ✓ Already implemented in `validateStepConstraints` Check (e) `ABILITY_WHEN_NO_MATCHING_STEP` |
| `priv.abilities[].on_phase` | `phases[].name` | ✓ Already implemented in `validateAbilityOnPhase` (mechanics-panel.js:446) |
| `priv.abilities[].corporation` | `corpPacks[].companies[].sym` | ✓ Already implemented in `validateAbilityCorporation` (mechanics-panel.js:457) |

---

## §4. Schema gaps — what `validateGame` cannot do today

These are the validator surfaces where the data simply isn't in `state` in
queryable form. Each gap has either a (a) workaround using a new helper,
(b) panel write the relevant data into state, or (c) accept the gap as
out-of-scope.

### §4.1 Tile-derived city/town slot counts

**Problem:** A corp's `coordinates` points to a hex. The hex has a `tile`
number. To validate "the corp's home hex has at least 1 token slot," we
need to know how many city slots the placed tile provides. Slot data is
encoded in **tile DSL strings** like `'city=revenue:30,slots:2;path=...'`
(per `tile-packs.js:70`), not on a structured field.

**Workaround:** add a helper `getTileSlots(tileNumber): { cities: [{slots, ...}], towns, junctions }`
in `tile-registry.js` that parses the DSL and exposes a structured shape.
The validator then queries the helper rather than parsing inline.

**Severity:** blocks city-capacity validation entirely. Required for the
"home hex has a slot" and "OO tile has 2 slots" checks.

### §4.2 Token placement vs. slot capacity

**Problem:** Even with §4.1 resolved, `state` doesn't track which tokens
are *currently placed* on which hex (this is gameplay state, not design
state). For design-time validation that's fine — the question is "does the
home hex have *any* slot?" not "is the home slot taken?"

**Severity:** none. Out of scope by design.

### §4.3 Static-hex `nodes` vs. tile-derived nodes

**Problem:** Static hexes (offboard, preprinted) have `hex.nodes[]` and
`hex.paths[]` arrays. Tile-placed hexes derive their nodes from
`TileRegistry.getTileDef(tile).dsl`. A validator needs to read both
uniformly.

**Workaround:** wrap the lookup in `getHexNodes(hexId): { type, slots }[]`
that branches on `hex.static`. Returns merged shape regardless of source.

**Severity:** medium. Without it, every cross-check has to handle two
shapes. With it, validators are clean.

### §4.4 Reserved-hex tokens

**Problem:** 1830's B&O / C&O / CPR have *reserved* home hexes — the tile
is marked as reserved-by-corp before the corp floats. Reservation lives in
`hex.feature === 'c'` for static hexes (per `static-hex-builder.js`),
plus an implicit reservation when a tile-placed hex has a corporation in
its `city.home` field. There's no single normalized "is this hex reserved
for corp X?" query.

**Workaround:** helper `getHomeReservations(hexId): string[]` that returns
corp syms reserving the hex.

**Severity:** medium. Required for cross-check "every reserved hex has a
corresponding corp with this hex as `coordinates`".

### §4.5 `state.companies` (legacy) vs. `state.corpPacks` (canonical)

**Problem:** `state.companies` is still written by the Wizard
(`companies-panel.js:225`). Most other code paths (importers, exporters,
panels) read from `state.corpPacks`. A validator running on imported state
won't see `companies` populated; one running on Wizard-created state will
see both, possibly inconsistently.

**Workaround:** validator uses `state.corpPacks` as authoritative;
optionally emits an info-level finding when `state.companies` is non-empty
but doesn't match a derived view of `corpPacks`.

**Severity:** low. Migration pending; a `companies → corpPacks` shim in
`io.js` on load would close this gap.

### §4.6 Three-way bank shadowing

**Problem:** Bank cash lives in three places — `state.meta.bank`,
`state.financials.bank`, `state.mechanics.bankCash`. Each panel may read a
different one. There's no canonical reconciliation; the values can diverge.

**Workaround:** validator emits a warning when any two disagree, with a
hint on which is canonical (proposal: `state.financials.bank`).

**Severity:** low. Doesn't block validation, but user-facing diagnostic
worth shipping early to flag drift before export.

### §4.7 Player range shadowing

**Problem:** Same shape as §4.6 — `state.meta.playersMin/Max` shadows
`state.mechanics.minPlayers/maxPlayers`. Both are written by different
panels.

**Workaround:** same as §4.6.

**Severity:** low.

### §4.8 `state.mechanics.initialRound` vs `state.auction.mechanism`

**Problem:** The auction mechanism is set in TWO independent state slots
that are not synced — `state.mechanics.initialRound` (Mechanics → Game
Flow → Initial Round dropdown) and `state.auction.mechanism` (Companies
→ Auction tab pill picker), with overlapping but slightly different
vocabularies (`'waterfall_auction'` vs `'waterfall'`). Setting one does
NOT update the other. Already flagged in earlier design discussion as the
"three places this is set" issue (now `state.mechanics.rounds.initial.class`
joined the family).

**Workaround:** validator emits a warning on mismatch; pick a canonical
slot (proposal: `state.mechanics.rounds.initial.class` per the
EXPORT_COHERENCE.md schema migration).

**Severity:** medium. Real user-facing inconsistency that produces
incoherent exports today.

### §4.9 Train rust references

**Problem:** `train.rustsOn` references another train by `type` OR `id`,
with `type` preferred (per `trains-panel.js:317` fallback chain). If the
target train is later renamed or its `type` changed without updating
`rustsOn`, validation has to run BOTH lookups (try `type === rustsOn`
first, then `id === rustsOn`).

**Workaround:** existing `validateRustCrossRefs`
(`mechanics-panel.js:405`) already handles this — validator just calls it.

**Severity:** none. Already covered.

### §4.10 Tile-pack manifest vs. placed tiles

**Problem:** `state.enabledPacks` is `null \| string[]` of pack identifiers
(from `tile-packs.js`) that are active in the game's manifest. A validator
should check that every `state.hexes[id].tile` number is provided by an
enabled pack — but the pack→tile mapping lives in `tile-registry.js` /
`tile-packs.js` and isn't a pure-state lookup.

**Workaround:** `TileRegistry.getTileDef(tileNumber)` returns null for
unrecognized tiles. Use that.

**Severity:** medium. Required for the "tile manifest is sufficient for
the placed map" check.

---

## §5. Recommended additions for full validator coverage

In priority order, these schema additions / helpers would unblock checks
that are currently blocked:

1. **`getTileSlots(tileNumber)`** in `tile-registry.js` — parses the DSL
   once, exposes structured `{ cities: [{slots, exits}], towns, junctions }`.
   Unblocks home-slot capacity, OO tile validation, dual-town consistency.
2. **`getHexNodes(hexId)`** wrapper across static-hex `nodes[]` and
   tile-derived nodes. Unblocks every node-aware check from one entry point.
3. **`getHomeReservations(hexId)`** for the reserved-hex case.
4. **Bank/player-range/initial-round canonicalization**. Pick a canonical
   slot per pair, mirror reads through it, surface drift as warnings until
   the legacy slots are removed.
5. **`state.companies` → `state.corpPacks` migration** in `io.js` on load,
   so the legacy table becomes a derived view.

None of these are in scope for the validator itself — they're foundation
work that should land before or alongside Evan's constraint set lands.

---

## §6. Findings shape (carried over from EXPORT_COHERENCE.md §4)

`validateGame` returns an array of findings matching the existing shape:

```js
{
  severity: 'error' | 'warning' | 'info',
  code:     string,                    // e.g. 'CORP_HOME_HEX_KILLED'
  message:  string,                    // user-facing
  path:     string,                    // dotted state path, e.g. 'corpPacks[2].companies[3].coordinates'
  // optional context:
  round?:   'initial' | 'stock' | 'operating' | 'merger',
  stepIndex?: number,
  stepClass?: string,
  hexId?:   string,
  corpSym?: string,
}
```

The aggregate `validateExportCoherence(state)` already exists in
`rounds-panel.js:1178` and fans out to the round-system's
`_validateRoundClass` and `_validateEndHook`. `validateGame(state)` would
either: (a) extend `validateExportCoherence` to also call cross-panel
constraint checks, or (b) be a sibling that calls `validateExportCoherence`
and adds Evan's checks. **Recommendation: (b)** — keep the cross-panel
validator separable from the export-coherence one so each can be unit-tested
in isolation.

---

*End of v0. Edits welcome — annotate inline with `> [your-system]: comment`
under any cell or section you want to challenge or extend.*
