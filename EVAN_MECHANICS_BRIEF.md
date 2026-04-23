# EVAN MECHANICS BRIEF
## 18xxtools — Game Mechanics Panel Research & Design

*Evan (Event) — SME for game mechanics, game.rb structure, mechanics panel*
*Date: 2026-04-20*

---

## 1. What I Found in game.rb — Major Mechanic Categories by Engine Layer

After reading the base engine and game classes for: g_1830, g_1846, g_1889, g_1861, g_1862, g_1867, g_1870, g_1880, g_1882, g_1889, g_18_india, g_1858_india, g_1868_wy, and all 1822 variants (1822, 1822_CA, 1822_MX, 1822_PNW, 1822_NRS, 1822_MRS, 1822_Africa), I found that game mechanics cluster into four layers with clear seams between them.

### Layer 1 — Pure Configuration (constants only, zero Ruby logic)

These mechanics are fully captured by TRAINS, PHASES, COMPANIES, CORPORATIONS, MINORS arrays and a set of scalar constants. A game that stays in this layer produces about 50 lines of game.rb with almost no methods.

**Captured by TRAINS entries:**
- Train roster (name, distance, price, count)
- Rust triggers (`rusts_on`, `obsolete_on`)
- Available-on gate (`available_on` — train only appears for purchase after another is bought)
- Purchase discounts (`discount:` hash mapping train-name → amount)
- Train variants (sub-types selectable at buy time: `variants:` array)
- Revenue multipliers on variants (`multiplier:` int)
- Phase-transition events (`events: [{'type' => 'xxx'}]` — dispatched to `event_xxx!`)
- Multi-node distance specs (`distance:` as array of `{'nodes'=>[...], 'pay'=>N, 'visit'=>N}`)

**Captured by PHASES entries:**
- Train limit per phase (scalar or `{minor: N, major: N}` hash)
- Available tile colors
- Operating rounds per phase
- Status flags (string array mapping to `STATUS_TEXT`)
- Phase-trigger events (same `events:` key as on trains)

**Captured by COMPANIES entries:**
- All standard ability types via `abilities:` array:
  - `blocks_hexes` — hex array
  - `tile_lay` — with `when:`, `count:`, `hexes:`, `tiles:`, `consume_tile_lay:`, `lay_count:`, `upgrade_count:`, `must_lay_together:`, `must_lay_all:`, `closed_when_used_up:`, `reachable:`, `combo_entities:`
  - `teleport` — hex + tile arrays
  - `exchange` — corporation list + `from:` (ipo/market)
  - `shares` — specific share ID
  - `close` — with `when:` and/or `corporation:` and/or `on_phase:`
  - `no_buy` — blocks purchasing
  - `reservation` — hex reservation
  - `token` — corp + price
  - `assign_hexes`, `assign_corporation`
  - `tile_discount` — terrain + amount
  - `revenue_change` — on_phase
  - `hex_bonus`, `route_bonus` — hex arrays + amounts

**Captured by CORPORATIONS/MINORS entries:**
- Type field (`minor`/`major`/`national`)
- Token stack and costs
- Home coordinates + city index
- Float percent

**Captured by scalar game constants:**
- `CAPITALIZATION` (`:full`, `:incremental`, `:none`)
- `SELL_BUY_ORDER`, `SELL_AFTER`, `SELL_MOVEMENT`, `POOL_SHARE_DROP`
- `MUST_BUY_TRAIN`, `MUST_SELL_IN_BLOCKS`, `EBUY_FROM_OTHERS`, `EBUY_PRES_SWAP`
- `HOME_TOKEN_TIMING`, `TILE_RESERVATION_BLOCKS_OTHERS`, `TRACK_RESTRICTION`
- `BANK_CASH`, `STARTING_CASH`, `CERT_LIMIT`, `CURRENCY_FORMAT_STR`
- `GAME_END_CHECK` (hash of reason → timing)
- `BANKRUPTCY_ENDS_GAME_AFTER`, `BANKRUPTCY_ALLOWED`
- `TILE_LAYS` (array of lay-slot hashes for default entity type)
- `ALLOW_REMOVING_TOWNS` (boolean)
- `STATUS_TEXT`, `EVENTS_TEXT`, `MARKET_TEXT`, `GAME_END_REASONS_TEXT`

**g_1830** is the gold standard for Layer 1 coverage: 95% of its mechanics live here. Its four method overrides are trivial optional-rule wiring.

---

### Layer 2 — Hook Overrides (named Game::Base method overrides)

These require Ruby but follow a clear template: override a named method, replace its return value or behavior. They are predictable enough that a UI could generate the Ruby from structured inputs.

| Hook method | What it controls | Example games |
|---|---|---|
| `tile_lays(entity)` | Lay budget per entity type and/or phase | 1822 (MAJOR_TILE_LAYS), 1846 (two-lay system) |
| `revenue_for(route, stops)` | Route revenue bonus additions | 1846 (mail/meat/boomtown), 1867 (Timmins), 1882 (E-W), 1870 (cattle/port/destination) |
| `revenue_str(route)` | Revenue breakdown string | Same as revenue_for |
| `extra_revenue(entity, routes)` | Per-OR revenue not tied to specific routes | 1822 mail contracts |
| `float_corporation(corp)` | When/how corp receives IPO cash | 1880 (staged), all incremental games |
| `company_bought(company, buyer)` | Side effects when a private is purchased | 1822_mx (P7 double-cash), 1822_pnw (Credit Mobilier) |
| `after_par(corp)` | Action when a corp is parred | 1822_pnw (minor-to-major formation trigger) |
| `must_buy_train?(entity)` | Whether corp is forced to buy | 1846 (:always), games with trainless bankruptcy |
| `upgrades_to?(from, to, ...)` | Custom tile upgrade validation | 1822_ca (big city restrictions), 1880 (blue-blue) |
| `legal_tile_rotation?(hex, tile, rot)` | Tile rotation whitelist | 1822_ca, 1870 (river partitions) |
| `check_distance(route, visits)` | Route validity rules | 1822 (two-node distance), 1862 |
| `check_other(route)` | Extra route validity rules | 1870 (home→destination required) |
| `operating_order` | Order entities operate within a round | 1867 (minors first), 1880 (par-chart slots) |
| `next_round!` | Inter-round sequencing | 1822_pnw (Merger round), 1880 (SR mid-OR), 1862 (Parliament loop) |
| `event_close_companies!` | Base event for phase trigger | All games |
| `event_<name>!` | Any named phase/train event | Per-game (see event library below) |
| `num_trains(train)` | Override train count | 1830 (optional 6-train variant) |
| `sellable_bundles(player, corp)` | What share bundles a player can sell | 1846, 1867 (loans affect bundles) |
| `buying_power(entity)` | Available spending budget | 1846, 1867 (loan room counts) |
| `can_par?(corp, parrer)` | Whether a corp can be parred | 1867 (minors before majors) |
| `setup` | One-time game initialization | Almost all games |
| `init_round` | What round to start with | 1846 (draft), 1880 (auction), 1889 (beginner skip) |
| `new_auction_round` / `stock_round` / `operating_round(round_num)` | Round factory overrides | All non-trivial games |
| `action_processed(action)` | Post-action side effects | 1846 (IL Central subsidy), 1882 (NWR) |
| `active_players` | Who acts for current entity | 1889 (ER company-seller), 1822_mx (NDEM proxy) |

**Known event handler library** (methods that TRAINS/PHASES `events:` strings dispatch to):

| Event name | What it does | Defined in |
|---|---|---|
| `close_companies` | Closes all companies with no owner or owner criteria | base.rb:3214 |
| `remove_reservations` | Removes all unsold home reservations | 1846 game.rb:673 |
| `remove_bonuses` | Removes east-west/bonus tokens | 1846 game.rb:682 |
| `companies_buyable` | Opens company purchases | 1870 game.rb:388 |
| `nwr` | NWR rebellion — reverts yellow tiles | 1882 game.rb:297 |
| `float_30` / `float_40` / `float_60` | Changes float threshold | 1880 game.rb:259,264,269 |
| `permit_b/c/d` | Unlocks building permits | 1880 game.rb:282,287,292 |
| `communist_takeover` | Halts dividends/movement | 1880 game.rb:322 |
| `stock_exchange_reopens` | Reverses communism | 1880 game.rb:330 |
| `receive_capital` | Pays staged IPO remainder | 1880 game.rb:304 |
| `green_minors_available` | Minors can buy green trains | 1867/1861 |
| `majors_can_ipo` | Major corps open for IPO | 1867/1861 |
| `minors_cannot_start` | Minors blocked from starting | 1867/1861 |
| `minors_nationalized` | All remaining minors nationalize | 1867/1861 |
| `trainless_nationalization` | Trainless entities nationalize at end of round | 1867/1861 |
| `nationalize_companies` | Privates absorbed into national | 1867/1861 |
| `close_companies` (base) | Standard private close trigger | all |
| `close_ndem` | Dissolves NDEM auto-corp | 1822_mx |
| `full_capitalisation` | Full cap event (base partially) | 1822, 1880 |
| `phase_revenue` | Changes private revenues by phase | 1822, 1822_africa |
| `open_detroit_duluth` | Removes blocker tokens | 1822_ca |
| `lner_trigger` | Starts LNER formation | 1862 |
| `all_corps_available` | Opens all corps for IPO | 1868_wy |
| `uranium_boom` / `uranium_bust` | Revenue modifier toggle | 1868_wy |
| `trigger_endgame` | Signals game-end countdown | 1868_wy |
| `remove_forts` | Removes fort blockers from map | 1868_wy |

---

### Layer 3 — Custom Step and Round Classes

These require new Ruby files. They cannot be generated purely from config. They represent mechanics that change which *actions* are available inside a round, or change what *order* entities take those actions in.

**Custom Step categories observed:**

| Step category | Representative games | What it changes |
|---|---|---|
| Draft/auction variants | 1846 (DraftDistribution), 1822 (WaterfallAuction+BidBox), 18India (CertificateSelection) | How privates are initially allocated |
| Minor acquisition | 1822 family (MinorAcquisition) | OR step allowing major to absorb a minor |
| Merger/conversion | 1867 (Merge, ReduceTokens, PostMergerShares), 1822_pnw (Merge+Conversion) | Inter-round or OR step for corp merges |
| Emergency issue/buy | 1846 (IssueShares, Bankrupt), 1867 (LoanOperations) | Emergency train purchase flow |
| Price protection | 1870 (PriceProtection) | President buys at old price before drop |
| Receivership | 1846 (ReceivershipSkip mixin) | Skips steps for corps in receivership |
| Special track (game-specific) | All 1822 variants | Ability-gated tile lays with custom validation |
| Connection token/route | 1870 (ConnectionToken, ConnectionRoute, CheckConnection) | Destination-run enforcement |
| Nationalization (auto-step) | 1861 (BuyTrain with auto-buy, Dividend with auto-withhold) | National corp auto-operates |
| Parliament auction | 1862 (CharterAuction) | Pre-game company charter auction |
| Development token | 1868_wy (DevelopmentToken) | Boomtown token placement in Dev round |
| Gauge change | 1858India (GaugeChangeBorder, CollectTokens) | Track gauge conversion + mine/oil collect |

**Custom Round categories observed:**

| Round type | Representative games | What it replaces |
|---|---|---|
| Draft round | 1846, 1880 | Initial auction round |
| Merger round | 1867, 1822_pnw | New round inserted between SR and OR |
| Parliament round | 1862 | New round before first SR |
| Development round | 1868_wy | New round inserted in turn sequence |
| Bust round | 1868_wy | New round at end of OR set |
| Custom Operating | 1867, 1861, 1822_ca, 1870, 1880, 1846 | Extended `start_operating`/`skip_entity?` logic |
| Custom Stock | 1867, 1822_ca, 1822_pnw, 1880 | `sold_out_stock_movement` or `sold_in_sr` tracking |

---

### Layer 4 — Structural Divergence

These mechanics fundamentally rewire the engine in ways that can't be described as an override or a new step.

- **NDEM auto-corporation** (1822_mx): A bank-owned pseudo-corp whose shares grow as minors fold in. Its cert count is dynamic; it's driven by the player with the majority rather than a standard president. Requires `init_share_pool` override, custom `Round::Stock`, `acting_for_entity` override, and a phase-triggered liquidation sub-sequence.
- **Loan pool** (1867): A dedicated `@loans` array of fixed-denomination loan objects; `LoanOperations` step auto-pays interest each OR and triggers nationalization on failure. Requires a new data class (`Engine::Loan`).
- **18India certificate deck** (g_18_india): Shares are proxied as "company cards" dealt to players; IPO rows are separate from standard pool; `CertificateSelection` + `Draft` are pre-SR rounds. The entire share ownership model is replaced.
- **1862 zigzag/ledge market**: `init_stock_market` passes non-standard flags (`zigzag: true, ledge_movement: true`) that require non-default `StockMarket` behavior.
- **1868wy Development/BUST cycle**: A round sequence that doesn't follow SR→OR; Development tokens on hexes drive boomtown/ghost-town state machines across BUST rounds. Track-points budget replaces `TILE_LAYS`.
- **1880 communism + mid-OR stock round**: A mid-OR SR is triggered by train purchases; the suspended OR resumes afterward. Stock market freezes (no movement, no dividends) under communism.
- **1880 building permits** tied to president percent ownership: A corp's track-laying ability depends on what percentage its president holds, not just the phase. No static config can express this.

---

## 2. 1822 Minor Acquisition / Extra Exchange Token — Exact Location

**Primary location:** `lib\engine\game\g_1822\step\minor_acquisition.rb` (354 lines)

This is a custom OR step inserted at `g_1822\game.rb:1101` into the operating round step list. It runs during every OR when a major corporation is the active entity.

**Supporting data and helpers in `g_1822\game.rb`:**
- `EXCHANGE_TOKENS` constant (line 373): hash mapping major corp sym → starting token count
- `setup_exchange_tokens` (line 2242): called from `setup`; creates `Ability::Base` of type `'exchange_token'` on each major
- `exchange_tokens(entity)` (line 1789): query helper returning the ability's count
- `add_exchange_token(entity)` (line 1400): increments count (used by CHPR and P5-LC&DR acquisition)
- `move_exchange_token(entity)` (line 1855): decrements count + places a real Token on the charter
- `remove_exchange_token(entity)` (line 1953): decrements count without placing a token (token goes to the map instead)

**The "extra" in extra exchange token:** When a major acquires a minor whose home city was NOT already tokened by the major, `acquire_entity_minor` (minor_acquisition.rb:150) calls `move_exchange_token` — a normal exchange. When the home city IS already tokened, the major gets the home token for free AND `add_exchange_token` increments its pool — this is the "extra" token, representing the surplus from absorbing an already-tokened location.

**What it is NOT:**
- Not a `company_bought` callback (that method at game.rb:684 handles private-company effects only)
- Not an `event_*` handler (those handle phase transitions)
- Not a static ability on a company entity

**For 1822 CA/MX/PNW/NRS/MRS:** All variants include their own `step/minor_acquisition.rb` subclass with game-specific `entity_connects?`, `token_choices`, and `pay_choices` overrides. The core exchange-token mechanic is preserved in all of them.

---

## 3. Universal Mechanic Taxonomy

### Tier 1 — Config-Only (TRAINS/PHASES/COMPANIES/CORPORATIONS constants)

| Mechanic | Expressible? | Notes |
|---|---|---|
| Train roster (name/distance/price/count) | ✅ Full | |
| Rust triggers (rusts_on/obsolete_on) | ✅ Full | Must cross-ref TRAINS (see Structural Nets) |
| Train variants | ✅ Full | `variants:` array key |
| Phase progression | ✅ Full | `on:` key references train name |
| Phase tile colors | ✅ Full | |
| Phase status flags | ✅ Full | String array into STATUS_TEXT |
| Phase events (named) | ✅ Partial | Name is data; handler must exist in game.rb |
| Company abilities (all standard types) | ✅ Partial | When/count/hex arrays need validation |
| Corp type (minor/major/national) | ✅ Full | |
| Float percent | ✅ Full | |
| Capitalization mode | ✅ Full | Scalar constant |
| Sell rules | ✅ Full | Scalar constants |
| Game-end conditions | ✅ Full | `GAME_END_CHECK` hash |
| Bank/cash/cert limits | ✅ Full | |
| Single tile-lay budget | ✅ Full | `TILE_LAYS` constant |
| Allow removing towns (boolean) | ✅ Full | `ALLOW_REMOVING_TOWNS` constant |

### Tier 2 — Hook Overrides (structured Ruby generation is feasible)

| Mechanic | Expressible? | UI surface needed |
|---|---|---|
| Tile lay budget by entity type/phase | 🟡 Partial | MAJOR_TILE_LAYS / MINOR_TILE_LAYS editor |
| Revenue bonuses (hex-based) | 🟡 Partial | Hex-array + amount + train-type conditions |
| Event handlers from known library | 🟡 Partial | Pick from event library; generates `event_xxx!` |
| Float on N% sold | 🟡 Partial | Float percent threshold (already in state.financials) |
| Must-buy-train rule | 🟡 Partial | Scalar `:always`/`:never`/`:route` |
| Operating order (types or par-chart) | 🟡 Partial | Radio: default / minors-first / by-par-price |
| Destination run requirement | ❌ No | Requires `check_other` custom Ruby |
| Staged capitalization (receive_capital) | ❌ No | Requires `float_corporation`+event override |
| Communism freeze | ❌ No | Layer 4 structural divergence |

### Tier 3 — Custom Step/Round (requires new Ruby class)

| Mechanic | Expressible? | UI surface needed |
|---|---|---|
| Minor acquisition step | ❌ No | Check "enable minor acquisition" → generates step |
| Draft initial round | ❌ No | Pick: Waterfall Auction / Draft / Parliament / Certificate Selection |
| Merger round | ❌ No | Check "enable merger round" + when it fires |
| Share issue/redeem in OR | ❌ No | Check "allow share issuance in OR" |
| Price protection | ❌ No | Check "price protection" → generates PriceProtection step |
| Loan system | ❌ No | Layer 3/4 — requires Loan class |
| Nationalization | ❌ No | Layer 3/4 — requires nationalize! method |

### Tier 4 — Structural Divergence

| Mechanic | Expressible? |
|---|---|
| Auto-corporation (NDEM) | ❌ No |
| Certificate deck (18India) | ❌ No |
| Development/BUST cycle (1868wy) | ❌ No |
| Zigzag/ledge stock market | ❌ No |
| Mid-OR stock round (1880) | ❌ No |
| Building permit system (1880) | ❌ No |

---

## 4. Structural Nets Catalog

**Definition:** A structural net is any mechanic whose Ruby implementation requires one or more arrays/lists that must be consistent with another section of the game definition (tiles, companies, phases, corporations, map). If a designer enables the mechanic without also populating the dependent list, the engine breaks. The UI must enforce cross-section consistency.

This is the "Remove Town" pattern Anthony identified. Here is every net I found:

---

### Net 1: Remove Town ability
**What it is:** Private company that can lay a tile replacing a town-dit with a plain track tile.

**Arrays required in game.rb:**
- `ALLOW_REMOVING_TOWNS = true` (boolean constant)
- `must_remove_town?(entity)` method identifying the company by sym (e.g. `entity.id == 'P1'`)
- Custom `legal_tile_rotation?` override using `old_paths_are_preserved` logic

**Must be consistent with:**
- Tile manifest: target hexes must have tiles with exactly 1 town; destination tiles must be the same layout minus the town
- COMPANIES: the company sym referenced in `must_remove_town?` must exist

**UI behavior:** When designer enables "Remove Town" on a company, the system should:
1. Show a tile-picker filtered to "tiles with exactly 1 town" (before-state)
2. Show a second tile-picker filtered to "same exits, no town" (after-state)
3. Validate both sets exist in the manifest
4. Generate `ALLOW_REMOVING_TOWNS = true` and the predicate method

**Feeds from:** Tile manifest (Max), COMPANIES (Jenny)

---

### Net 2: Exchange ability (company → corporation share)
**What it is:** Private company can be exchanged for a share of a specific corporation.

**Arrays required:**
- `abilities:` entry with `type: 'exchange'`, `corporations: ['NYC']`, `from: %w[ipo market]`

**Must be consistent with:**
- CORPORATIONS: every sym in `corporations:` must exist
- The `from:` values must be `'ipo'`/`'market'`/`'any'`

**UI behavior:** Corporation multi-select filtered to existing CORPORATIONS. `from:` is a validated enum.

**Feeds from:** CORPORATIONS (Jenny)

---

### Net 3: Train rust cross-reference (rusts_on / obsolete_on)
**What it is:** Train A rusts or becomes obsolete when train B is purchased.

**Values required:**
- `rusts_on: 'B'` or `obsolete_on: 'B'` on train A's TRAINS entry

**Must be consistent with:**
- TRAINS: the named train B must exist in TRAINS (or be a variant name within TRAINS)

**UI behavior:** Dropdown/typeahead from existing train names (including variant names). Farrah owns this — she needs to expose variant names separately from main train names.

**Feeds from:** TRAINS (Farrah)

---

### Net 4: Train available_on gate
**What it is:** Train A is not available for purchase until train B is bought.

**Values required:**
- `available_on: 'B'` on train A's TRAINS entry

**Must be consistent with:**
- TRAINS: B must exist

**Feeds from:** TRAINS (Farrah)

---

### Net 5: Train discount by train type
**What it is:** A train can be bought at a discount when upgrading from specific older trains.

**Values required:**
- `discount: {'2' => 30, '3' => 30}` hash on the discounting train's TRAINS entry

**Must be consistent with:**
- TRAINS: every key in the discount hash must be a valid train or variant name

**Feeds from:** TRAINS (Farrah)

---

### Net 6: Phase `on:` trigger
**What it is:** Phase N begins when a specific train name is purchased.

**Values required:**
- `on: '5'` in a PHASES entry

**Must be consistent with:**
- TRAINS: the named train (or variant) must exist in TRAINS

**Feeds from:** TRAINS (Farrah), PHASES (Farrah)

---

### Net 7: Train event → event handler method
**What it is:** When a train is purchased, a named event fires via `@game.send("event_#{type}!")`.

**Values required:**
- `events: [{'type' => 'close_companies'}]` on a TRAINS entry

**Must be consistent with:**
- game.rb: a method named `event_close_companies!` must exist (either in base.rb or in the game's own class)

**UI behavior:** The mechanics panel maintains a library of known event handler names (see event library in section 2). When a designer picks an event, the panel validates it's in the library or warns that custom Ruby is needed.

**Feeds from:** TRAINS (Farrah), Mechanics Panel (Evan)

---

### Net 8: Company close `on_phase:` reference
**What it is:** A company closes when a named phase begins.

**Values required:**
- `abilities: [{type: 'close', on_phase: 'Phase 3'}]`

**Must be consistent with:**
- PHASES: the phase name string must match a `name:` field in PHASES

**UI behavior:** Dropdown from PHASES names.

**Feeds from:** PHASES (Farrah), COMPANIES (Jenny)

---

### Net 9: Company close `corporation:` reference
**What it is:** A company closes when a specific corporation buys its first train.

**Values required:**
- `abilities: [{type: 'close', when: 'bought_train', corporation: 'B&O'}]`

**Must be consistent with:**
- CORPORATIONS: the corporation sym must exist

**Feeds from:** CORPORATIONS (Jenny), COMPANIES (Jenny)

---

### Net 10: `shares` ability — specific share ID
**What it is:** Owning this private grants ownership of a specific named share.

**Values required:**
- `abilities: [{type: 'shares', shares: 'PRR_1'}]`
  where `'PRR_1'` means "PRR's 10% certificate #1"

**Must be consistent with:**
- CORPORATIONS: PRR must exist and have at least 2 shares (since index is 1-based)

**UI behavior:** Corporation + share-index picker.

**Feeds from:** CORPORATIONS (Jenny)

---

### Net 11: EXCHANGE_TOKENS (1822 family)
**What it is:** Each major corporation starts with N exchange tokens, used during minor acquisition.

**Values required:**
- `EXCHANGE_TOKENS = {'LNWR' => 4, 'GWR' => 3, ...}` hash constant in game.rb

**Must be consistent with:**
- CORPORATIONS: every key must be a major corp sym
- Only major-type corps should appear

**UI behavior:** Auto-populated from the CORPORATIONS list filtered to `type: 'major'`, with a numeric input per corp defaulting to 3. Enabled only when "Minor Acquisition" mechanic is enabled.

**Feeds from:** CORPORATIONS (Jenny), Mechanics Panel (Evan)

---

### Net 12: Minor ↔ Major association (1822_pnw)
**What it is:** A pairing table mapping each minor ID to the major corp it will form when merged.

**Values required:**
- `@minor_associations = {'M1' => 'BCR', 'M2' => 'CPR', ...}` initialized in `setup_associated_minors`

**Must be consistent with:**
- MINORS: every key must exist
- CORPORATIONS: every value must be a major corp sym

**UI behavior:** A pairing table in the "Merger" mechanic section. Enabled only with "Associated Minor/Major Mergers" on.

**Feeds from:** MINORS (Jenny), CORPORATIONS (Jenny)

---

### Net 13: Blocks_hexes ability
**What it is:** A company blocks specific hexes from tile development until it's bought.

**Values required:**
- `abilities: [{type: 'blocks_hexes', hexes: ['G15', 'H16']}]`

**Must be consistent with:**
- MAP: every hex ID must exist on the map

**UI behavior:** Multi-hex picker on the map canvas, or text entry with validation against hex registry.

**Feeds from:** MAP (Max), COMPANIES (Jenny)

---

### Net 14: Tile_lay ability with `hexes:` or `tiles:` restriction
**What it is:** A tile-lay ability targeting only specific hexes or tile numbers.

**Values required:**
- `hexes: ['F16']` and/or `tiles: ['57', '58']` within a tile_lay ability

**Must be consistent with:**
- MAP: hex IDs must exist
- Tile manifest: tile numbers must exist in the manifest with count > 0

**UI behavior:** Hex picker for hexes, tile picker from manifest for tiles.

**Feeds from:** MAP (Max), tile manifest (Max), COMPANIES (Jenny)

---

### Net 15: Teleport ability
**What it is:** A company can teleport-place a token on a specific hex using a specific tile.

**Values required:**
- `abilities: [{type: 'teleport', hexes: ['F16'], tiles: ['57']}]`

**Must be consistent with:**
- MAP: hex must exist and be the right color
- Tile manifest: tile must exist

**Feeds from:** MAP (Max), tile manifest (Max), COMPANIES (Jenny)

---

### Net 16: Revenue bonus hex arrays
**What it is:** A bonus paid when a route visits specific hexes (cattle pens, ports, east-west offboards).

**Values required in game.rb:**
- Named hex-ID arrays (e.g. `CATTLE_HEXES = %w[A1 B4]`) referenced in `revenue_for` override

**Must be consistent with:**
- MAP: every hex ID must exist and be an appropriate stop type (offboard/city)
- Amount and train-type conditions must be specified

**UI behavior:** In the Revenue Bonuses section of the mechanics panel: "Add bonus zone" → hex multi-picker + amount + trigger condition (always/specific-train-type/east-west-pair).

**Feeds from:** MAP (Max)

---

### Net 17: National/Green corporation reservation hex list (1861)
**What it is:** Specific hexes are pre-reserved for the national corporation.

**Values required:**
- `NATIONAL_RESERVATIONS = %w[C12 D13 ...]` constant

**Must be consistent with:**
- MAP: hex IDs must exist and be city hexes

**Feeds from:** MAP (Max), CORPORATIONS (Jenny)

---

### Net 18: `combo_entities:` on tile_lay ability (1822)
**What it is:** Using ability P1 also counts as consuming ability P2 simultaneously.

**Values required:**
- `combo_entities: ['P2']` on the tile_lay ability of P1

**Must be consistent with:**
- COMPANIES: every ID in `combo_entities:` must exist

**Feeds from:** COMPANIES (Jenny)

---

### Net 19: Phase-indexed private revenue array (1822 P7/P8/P9, 1822_mx)
**What it is:** A private's revenue changes per phase, specified as an ordered array.

**Values required in game.rb:**
- `P7_REVENUE = [0, 0, 0, 20, 20, 40, 40, 60]` — array length must equal number of phases
- Referenced in `set_private_revenues` override

**Must be consistent with:**
- PHASES: array length = number of phases (or total train-buy-count thresholds)

**UI behavior:** When a company has `type: 'revenue_change'` ability, show a phase-count grid for revenue values.

**Feeds from:** PHASES (Farrah), COMPANIES (Jenny)

---

### Net 20: Tile-specific upgrade restrictions (1822_ca BIG_CITY_ILLEGAL_TILE_UPGRADES)
**What it is:** Specific tile numbers cannot be upgraded to specific other tile numbers.

**Values required:**
- `BIG_CITY_ILLEGAL_TILE_UPGRADES = {'14' => %w[15 887], '15' => %w[14 887]}` hash

**Must be consistent with:**
- Tile manifest: all referenced tile IDs must exist

**Feeds from:** Tile manifest (Max)

---

### Net 21: Train variants `rusts_on` cross-reference
**What it is:** A train variant rusts when a specific other train name is purchased.

**Values required:**
- `variants: [{name: '2+2', rusts_on: '4'}]` within a TRAINS entry

**Must be consistent with:**
- TRAINS: the `rusts_on` value must be a valid train name or variant name in TRAINS

**Feeds from:** TRAINS (Farrah)

---

### Net 22: Token ability `corporation:` reference
**What it is:** Using this private places a token for a specific corporation.

**Values required:**
- `abilities: [{type: 'token', corporation: 'NH', price: 0}]`

**Must be consistent with:**
- CORPORATIONS: sym must exist

**Feeds from:** CORPORATIONS (Jenny)

---

### Net 23: Builder cube terrain cost tables (1822_mx, 1822_pnw)
**What it is:** Upgrade costs can be reduced by placing "builder cubes" on tiles; costs vary by terrain type.

**Values required in game.rb:**
- Per-terrain cost constants (e.g. `TERRAIN_COST = {mountain: 80, hill: 40, water: 80}`)
- `max_builder_cubes(hex)` method reading hex terrain
- `upgrade_cost` override consuming cube counts

**Must be consistent with:**
- MAP: terrain types assigned to hexes must match the keys in the cost table
- `terrainCosts` in state must be aware of which terrain types the cube mechanic targets

**Feeds from:** MAP terrain (Max), state.terrainCosts

---

## 5. Operating Round Structure

### How tile_lays actually works (from `lib\engine\step\tracker.rb`)

The `tile_lays` method on the game class returns an **ordered array of lay-slot hashes**. Each slot in the array represents one available lay action in the operating round, consumed in sequence:

```ruby
[
  { lay: true,   upgrade: true,  cost: 0 },          # slot 0: any lay
  { lay: :not_if_upgraded, upgrade: false, cost: 0 }  # slot 1: yellow only, if no upgrade happened
]
```

**Hash keys (all from `tracker.rb:34-45`):**
- `:lay` — `true` / `false` / `:not_if_upgraded` (only yellow if no upgrade this turn)
- `:upgrade` — `true` / `false` / `:not_if_upgraded`
- `:cost` — additional cost for yellow lays (int, default 0)
- `:upgrade_cost` — additional cost for upgrades (defaults to `:cost`)
- `:cannot_reuse_same_hex` — boolean; prevents laying on a hex already laid this turn

**How lays are consumed:** `@round.num_laid_track` is the index into the array. Each `lay_tile_action` call increments it. When the index exceeds the array length, `get_tile_lay` returns nil and the Track step passes automatically.

**Entity-type routing in 1822 (`g_1822\game.rb:953-960`):**
```ruby
def tile_lays(entity)
  return COMPANY_HSBC_TILE_LAYS if entity.id == COMPANY_HSBC
  operator = entity.company? ? entity.owner : entity
  return MAJOR_TILE_LAYS if @phase.name.to_i >= 3 && operator.type == :major
  super  # → base TILE_LAYS = [{lay:true, upgrade:true}]
end
```

Pattern: minors always get 1 lay; majors get 2 lays from phase 3+.

### How private ability tile lays interact with the budget

From `lib\engine\step\special_track.rb:55-59`:

**Ability with `consume_tile_lay: true`** → routes through `lay_tile_action`, increments `@round.num_laid_track`. The ability *consumes* one of the corporation's normal lay slots.

**Ability without `consume_tile_lay`** → routes through `lay_tile` directly, does NOT increment the counter. The ability is *extra* on top of the normal budget.

Additionally, `tracker.rb:87-92` (`tile_lay_abilities_should_block?`) keeps the normal Track step available even when an extra-type ability is being processed — so the corp can still use its normal lays.

### Timing vocabulary for abilities (`when:` field)

Recognized by `special_track.rb:149-157` and `base.rb#abilities`:

| `when:` value | Meaning |
|---|---|
| `'track'` | During the normal Track step |
| `'special_track'` | During the SpecialTrack step specifically |
| `'owning_corp_or_turn'` | Any time the owning corp is active in an OR |
| `'owning_player_or_turn'` | Any time the owning player is active |
| `'owning_player_track'` | Owning player's track action specifically |
| `'or_between_turns'` | Between entity turns in an OR |
| `'stock_round'` | During SR |
| `'sold'` | At the moment the private is sold to a corp |
| `'any'` | Any time |
| `'bought_train'` | When a train is purchased |
| `'%current_step%'` | Matches current step class name |

Multiple values can be combined as an array.

### How `count:` is enforced (`lib\engine\ability\base.rb:43-52`)

`ability.use!` decrements `@count`. When `!@count.positive? && @remove_when_used_up` (default true), the ability is removed. `TileLay#use!` (`lib\engine\ability\tile_lay.rb:40-67`) separately tracks `lay_count`/`upgrade_count`, removing when either goes to zero.

### Remove Town — what actually happens in the engine

**There is no `remove_town` ability type in the engine.** The mechanic is implemented as:

1. `ALLOW_REMOVING_TOWNS = true` — game-wide boolean enabling towns to disappear on tile upgrade (`tracker.rb:331`)
2. `must_remove_town?(entity)` — game-specific predicate identifying the company
3. Custom `legal_tile_rotation?` in the game's `SpecialTrack` subclass — filters valid rotations to those where old exits are preserved but the town node is gone (`special_track.rb:170-188`)
4. A standard `tile_lay` ability on the company — the actual action is a normal tile lay; the "no town" enforcement happens in rotation validation

**Does it consume the corporation's tile lay?** This depends on `consume_tile_lay:` on the tile_lay ability. In 1822 base, the ability at `g_1822/entities.rb` has `consume_tile_lay: true` on the MTONR company — so yes, using it consumes the corp's tile lay for that turn.

### Proposed OR Structure Editor for the mechanics panel

The mechanics panel should let designers configure:

**1. Tile lay budget by entity type:**
```
[ ] Minors: 1 lay (default)     [ ] override per phase
[ ] Majors: 1 lay (default)     [ ] override per phase
    ↳ Phase 3+: 2 lays (slot 1: any, slot 2: yellow-only-if-no-upgrade)
```
Displayed as a slot editor: each slot has `:lay`, `:upgrade`, `:cost`, `:upgrade_cost`, `:cannot_reuse_same_hex` dropdowns/inputs.

**2. Per-ability timing and replacement:**
For each private company with a tile_lay ability:
```
Company: MTONR "Remove Town"
  When: [track] [special_track]
  Count: 1 per game  □ closed_when_used_up
  Consumes corp's tile lay: ✅  (consume_tile_lay: true)
  Phase restriction: Phase 3+ only  (requires custom legal_tile_rotation? check)
```

**3. Ability action taxonomy:**
| Ability | Consumes tile lay? | Extra? | Auto? |
|---|---|---|---|
| `tile_lay` with `consume_tile_lay: true` | ✅ Yes | ❌ No | ❌ No |
| `tile_lay` without `consume_tile_lay` | ❌ No | ✅ Yes | ❌ No |
| `teleport` | ❌ No | ✅ Yes | ❌ No |
| `blocks_hexes` | N/A | N/A | ✅ Auto |
| `close` with `when: 'bought_train'` | N/A | N/A | ✅ Auto |
| `exchange` | N/A | N/A | ❌ Player chooses |

---

## 6. Coverage Analysis

Given the **current 18xxtools interface** (MAP, COMPANIES, TRAINS, PHASES, MARKET, CORPORATIONS):

### Per-game estimate

| Game | Coverage | Bottleneck |
|---|---|---|
| **g_1830** | ~90% | Optional 6-train variant; inter-player buy gate in turn 1 |
| **g_1889** | ~80% | Beginner variant neuters abilities; ER active-player redirect |
| **g_1882** | ~55% | Neutral tokens require custom corp init; NWR random-train event |
| **g_1870** | ~40% | Price protection step; home→destination route requirement; river partitions |
| **g_1846** | ~45% | Draft round; group removal by player count; minor absorb; all revenue bonuses |
| **g_1822 (base)** | ~60% | Exchange tokens + minor acquisition step; company callbacks |
| **g_1822_NRS/MRS** | ~70% | Near-config variants; only L→2 upgrade cost formula is custom |
| **g_1822_CA** | ~30% | Sawmill, grain trains, QMOO dynamic home, Detroit-Duluth blocker |
| **g_1822_MX** | ~25% | NDEM auto-corp, builder cubes, 3/2P train, Mexico City must-connect |
| **g_1822_PNW** | ~20% | Merger round, regional railways, credit mobilier queue manipulation |
| **g_1822_Africa** | ~20% | Unified bidbox, 2-SR structure, safari trains, game reserves |
| **g_1867** | ~20% | Loan system, merger round, nationalization — all Layer 3/4 |
| **g_1861** | ~15% | Inherits 1867 + RSR auto-operate, Nikolaev priority rule |
| **g_1862** | ~15% | Parliament round, LNER formation, zigzag market, permits |
| **g_1880** | ~10% | Building permits, staged cap, communism, mid-OR SR, foreign investors |
| **g_18_india** | ~10% | Certificate deck, share proxies, gauge markers, commodity concession |
| **g_1858_india** | ~30% | Gauge conversion, mine/oil tokens, mail trains |
| **g_1868_wy** | ~10% | Dev/BUST cycle, track points, double-heading, uranium |

**Overall: current interface can produce a valid, playable game.rb for approximately 15-20% of these games.** The two games closest to complete coverage are 1830 and 1889. Every other game requires at least one custom OR step or revenue hook.

### Highest-leverage additions (in priority order)

1. **Event handler library selector** (~+10% coverage): Let designers pick named event handlers from the known library (close_companies, remove_reservations, float_30, etc.) and generate the `event_xxx!` dispatch automatically. Covers most simple phase-triggered effects without any game-specific Ruby.

2. **Tile lay budget editor by entity type** (~+8%): Expose MAJOR_TILE_LAYS / MINOR_TILE_LAYS as an editable slot array. Most games with custom tile lay rules only differ in how many lays, whether upgrades are allowed in slot 2, and cost modifiers.

3. **Revenue bonus hex-array editor** (~+7%): A simple UI to define "route touching these hexes gets +$X bonus" with train-type conditions. Covers east-west bonuses (1882), cattle/port (1870), mail contracts (1846), Timmins (1867) without requiring `revenue_for` to be hand-coded.

4. **Structural net validation layer** (~+6%): Cross-section validators (rust cross-ref, phase `on:` cross-ref, ability hex/tile validation). Doesn't add coverage but prevents invalid game.rb generation and catches silent failures early.

5. **OR step sequence selector** (~+5%): A menu of well-known optional step classes (IssueShares, SpecialToken, HomeToken, MinorAcquisition) that designers can toggle on/off. Generates the correct `operating_round` factory method.

6. **Ability `consume_tile_lay`/`when:` editor** (~+4%): Expose timing vocab and replace-vs-extra on the ability form in the companies panel. Required for correct generation of any private with a tile-lay effect.

---

## 7. Proposed Data Model for Mechanics Panel

```js
// New field added to state (state.mechanics)
state.mechanics = {
  // Round sequence
  initialRound: 'waterfall_auction',  // 'waterfall_auction' | 'draft' | 'parliament' | 'certificate_selection' | 'none'
  roundSequence: 'standard',          // 'standard' | 'with_merger_round' | 'development_bust' | 'custom'
  stockRoundsPerSet: 1,               // int (Africa uses 2)
  operatingRoundsPerPhase: null,      // null = use PHASES config, otherwise override

  // OR tile lay rules
  tileLays: {
    default: [{lay: true, upgrade: true, cost: 0}],         // base TILE_LAYS
    byType: {
      minor: null,                                           // null = use default
      major: [                                               // array of slot hashes
        {lay: true, upgrade: true, cost: 0},
        {lay: 'not_if_upgraded', upgrade: false, cost: 0, cannot_reuse_same_hex: true}
      ]
    },
    phaseGated: false,                                       // if true, tileLays.byType changes per phase
    phaseOverrides: []                                       // [{phase: '3', type: 'major', slots: [...]}]
  },

  // Allow removing towns globally
  allowRemovingTowns: false,

  // Must-buy-train rule
  mustBuyTrain: 'route',             // 'always' | 'never' | 'route' (default)

  // Capitalization
  capitalization: 'full',            // 'full' | 'incremental' | 'none'

  // Float percent (already in state.financials — cross-reference only)

  // Exchange tokens (1822 family)
  exchangeTokens: {
    enabled: false,
    counts: {}                        // {corpSym: N} — auto-populated from CORPORATIONS type:major
  },

  // Revenue bonuses
  revenueBonuses: [
    // {
    //   name: 'East-West Bonus',
    //   type: 'pair',               // 'pair' | 'zone' | 'single'
    //   hexGroups: [['A1','B2'], ['C3','D4']],  // for pair: routes must touch one from each group
    //   amount: 100,
    //   trainTypes: null,           // null = all, or ['E', '4'] etc.
    // }
  ],

  // Event library
  events: [
    // {
    //   trainOrPhase: 'trains',     // 'trains' | 'phases'
    //   triggerOn: '5',             // train/phase name
    //   eventType: 'close_companies'  // from known library
    // }
  ],

  // OR step options
  orSteps: {
    issueShares: false,
    homeToken: true,
    specialToken: false,
    minorAcquisition: false,       // enables EXCHANGE_TOKENS + step insertion
    priceProtection: false,
    loanOperations: false,
  },

  // Merger mechanic
  merger: {
    enabled: false,
    style: 'minor_to_major',       // 'minor_to_major' | 'major_to_major' | 'nationalization'
    roundTiming: 'after_or',       // 'after_or' | 'after_sr' | 'in_sr'
    associations: []               // [{minorSym: 'M1', majorSym: 'BCR'}]
  },

  // Nationalization (1861/1867)
  nationalization: {
    enabled: false,
    nationalCorpSym: null,         // sym of the national corp
    triggerTrains: [],             // train names that trigger forced nationalization
    reservationHexes: [],          // hex IDs pre-reserved for national
  }
};
```

---

## 8. Panel Name Options

### Option A: "Rulebook"
**Reasoning:** A rulebook is what a board game designer writes before anything else. It's familiar to the target audience (18xx designers), non-technical, and implies completeness — the panel is the designer's living rulebook. The right-hand mechanic log is literally "what your rulebook says."

**Risk:** Could be confused with the printed rulebook PDF that ships with a published game.

### Option B: "Engine"
**Reasoning:** In 18xx games, the engine is the most powerful unit — it drives everything. In software, the "engine" is the core logic. Double meaning lands well for a mechanics panel. Short, unambiguous.

**Risk:** Technical. Non-engineer designers may not resonate.

### Option C: "Mechanics"
**Reasoning:** Exactly what it is. No ambiguity. Matches the vocabulary Anthony used in his brief. Easy to explain: "this is where you configure how your game *mechanically* works."

**Risk:** Generic. Less evocative than Rulebook or Engine.

**Recommendation: "Rulebook"** — it's the most designer-facing and reinforces the panel's purpose as the human-readable layer above raw data. Fallback: "Mechanics" if Anthony wants directness.

---

## 9. Panel Layout Spec

### Two-column layout within the main view

```
┌─────────────────────────────┬──────────────────────────────────────────────┐
│  LEFT: CONFIGURATION        │  RIGHT: MECHANIC LOG                         │
│  (structured editors)       │  (human-readable narrative)                  │
│                             │                                              │
│  ▼ Round Structure          │  ─── Game Flow ───                           │
│    Initial round: [Waterfall│  1. Players bid for private companies in a   │
│    Auction ▾]               │     Waterfall Auction.                       │
│    SRs per set: [1]         │  2. Players take turns buying/selling shares  │
│    Merger round: [ ] off    │     (1 Stock Round per set).                 │
│                             │  3. Corporations operate in order of share   │
│  ▼ Operating Round Rules    │     price (highest first).                   │
│    Tile lays by type:       │                                              │
│    Minor:  [1 lay/upgrade]  │  ─── Operating Round ───                    │
│    Major:  [2 lays (ph3+)]  │  Each corporation, in turn:                 │
│    □ Phase-gated overrides  │  • Lays or upgrades 1 tile (any phase)      │
│                             │  • Majors (phase 3+): a second yellow-only  │
│  ▼ Train Rules              │    tile may be laid if no upgrade happened   │
│    Must buy train: [route]  │  • Runs routes and pays dividends           │
│    Emergency buy: [allowed] │  • May buy trains (must buy if no trains    │
│                             │    and can run a route)                      │
│  ▼ Share / Capitalization   │                                              │
│    Float: [60% sold]        │  ─── Phase Events ───                       │
│    Capitalization: [Full]   │  When the first 5-train is purchased:       │
│    Sell rules: [SBS]        │  → All private companies close               │
│                             │                                              │
│  ▼ Events                   │  ─── Validation Warnings ───                │
│    [+ Add event trigger]    │  ⚠ "close" ability on P4 references phase   │
│    5-train → close_companies│    "Phase 3" which does not exist in your   │
│                             │    PHASES configuration.                     │
│  ▼ Revenue Bonuses          │                                              │
│    [+ Add bonus zone]       │  ─── What Requires Custom Ruby ───          │
│                             │  The following mechanics are enabled but     │
│  ▼ Special Mechanics        │  cannot be generated from config alone —    │
│    □ Minor Acquisition      │  you will need to implement these in         │
│    □ Exchange Tokens        │  game.rb:                                   │
│    □ Merger Round           │  • No items (your game is fully config-     │
│    □ Price Protection       │    expressible ✓)                            │
│    □ Loan System            │                                              │
│    □ Nationalization        │                                              │
│                             │                                              │
│  ▼ Structural Nets          │                                              │
│    [Validate cross-refs]    │                                              │
│    ✅ 5 of 5 nets valid     │                                              │
└─────────────────────────────┴──────────────────────────────────────────────┘
```

### Left column sections (collapsible accordions)

1. **Round Structure** — initial round picker, SR count, merger round toggle
2. **Operating Round Rules** — tile lay slot editor per entity type, phase overrides
3. **Train Rules** — must-buy picker, emergency buy behavior
4. **Share / Capitalization** — float %, capitalization mode, sell rules (cross-references state.financials)
5. **Events** — list of event triggers; add trigger from event library; validates event names
6. **Revenue Bonuses** — list of bonus zones; add hex-group bonus
7. **Special Mechanics** — toggles for OR step options and round classes
8. **Structural Nets** — one-click cross-section validator with per-net status

### Right column (Mechanic Log)

Generated dynamically from state.mechanics + state.trains + state.phases + state.companies. Sections:

1. **Game Flow** — narrative description of round sequence
2. **Operating Round** — bullet-by-bullet OR description including tile lay budget, train rules
3. **Phase Events** — timeline of what happens when each train is purchased
4. **Private Company Effects** — for each company with a tile/token/revenue ability, one-line plain-English description
5. **Validation Warnings** — structural net failures, missing event handlers, broken cross-references
6. **What Requires Custom Ruby** — list of enabled mechanics that cannot be generated from config; the designer must be told what file to write

### Entry point

New nav-rail button: "Rulebook" with a book icon, `data-lsec="mechanics"`. Sits after "Trains & Phases" in the nav rail.

---

## 10. Flags for Jenny and Farrah

### For Farrah (trains panel, phases panel, import-ruby.js TRAINS/PHASES parsing):

1. **TRAINS `variants:` key** — does Farrah's parser capture the full variants array including each variant's `rusts_on`, `available_on`, `multiplier`, and `name`? The mechanics panel needs variant names to cross-reference rusting.
2. **TRAINS `distance:` as array** — multi-node distance specs like `[{'nodes'=>['town','offboard'], 'pay'=>3, 'visit'=>3}]` are used in 1822. Does import-ruby.js handle this, or only scalar distance?
3. **TRAINS `obsolete_on:` key** — distinct from `rusts_on`; obsolete trains stay on the board but pay no revenue. Is this captured?
4. **TRAINS `events:` type strings** — these strings must be validated against the event handler library. Farrah's panel should expose them as a field I can cross-reference.
5. **PHASES `on:` value** — must be validated against existing train names (including variant names). Farrah should expose this for cross-reference.
6. **Phase-indexed revenue arrays** — some games use per-phase revenue arrays for privates (P7_REVENUE in 1822_mx). This data doesn't belong in TRAINS or PHASES directly, but it lives in game.rb constants that reference phase count. Farrah doesn't need to capture this, but she should not generate a phase count mismatch.

### For Jenny (entities.rb, companies, corporations, concessions):

1. **Ability `when:` field** — must be validated as a known timing vocabulary enum, not free text. The known values are listed in section 5 of this brief.
2. **Ability `consume_tile_lay:` boolean** — needs to be captured in the ability schema. Currently unknown if it's exposed in Jenny's editor.
3. **Ability `on_phase:` field** — must reference a phase name from PHASES; add cross-reference validation.
4. **Ability `corporation:`/`corporations:` fields** — must reference corp syms from CORPORATIONS.
5. **Ability `combo_entities:` field** — must reference company syms from COMPANIES.
6. **Ability `shares:` field** — the share ID format is `'CORPSYM_N'` where N is the share index. Jenny's editor needs to generate this format correctly.
7. **`exchange_token` ability** — this is NOT in entities.rb for 1822. Jenny does not need to capture it. The mechanics panel (Evan) generates it via `setup_exchange_tokens` when the Minor Acquisition mechanic is enabled.
8. **COMPANIES `discount:` field** — negative value (used in 1846 for minor companies). Should be captured.
9. **Ability `lay_count:` / `upgrade_count:`** — split counters for tile_lay abilities that allow multiple lays but only some can be upgrades. Needs to be in the ability schema.
10. **Ability `must_lay_together:`/`must_lay_all:`** — boolean flags on tile_lay abilities; need to be in the schema.

---

## 11. Phase Status UI Design

### 11.1 How status works in the engine

Source: `lib/engine/phase.rb:70`

```ruby
@status = phase[:status] || []
```

`status` is a plain Ruby array of strings stored directly on the Phase object. There is no validation — the engine never checks that a status string is "valid". Whether a status string does anything depends entirely on whether game-specific Ruby code calls `phase.status.include?('that_string')`.

**The canonical label map is `STATUS_TEXT`** — a class-level constant on every game class, established at `lib/engine/game/base.rb:360`:

```ruby
STATUS_TEXT = {
  'can_buy_companies' =>
    ['Can Buy Companies', 'All corporations can buy companies from players'],
}.freeze
```

Every game that adds new status strings is expected to extend this via `Base::STATUS_TEXT.merge(...)`. The frontend reads it at `assets/app/view/game/game_info.rb:70`:

```ruby
phase[:status]&.each do |status|
  row_events << @game.class::STATUS_TEXT[status] if @game.class::STATUS_TEXT[status]
end
```

The value format is always `[short_label, long_description]`. A status string that appears in a phase but is NOT in STATUS_TEXT renders nothing in the phase table — it's invisible to players.

**Implication for the editor:** A phase status string that isn't in STATUS_TEXT is a near-certain bug. The editor should warn on any status string not found in its known vocabulary.

---

### 11.2 Full status taxonomy (researched from 18xx-master)

Every entry below was found via `grep -rn "status.include?\|STATUS_TEXT"` across `lib/engine/` and verified by reading the checking code. File:line citations are the first check location.

#### Tier A — Universal engine (base step classes, works in any game with standard wiring)

| Status string | Short label | What it gates | Engine check | Requires |
|---|---|---|---|---|
| `can_buy_companies` | Can Buy Companies | Corporations may buy private companies from players during OR | `lib/engine/step/buy_company.rb:26` | BuyCompany step in OR |
| `can_buy_companies_from_other_players` | Interplayer Company Buy | Players may trade companies between each other in SR | `lib/engine/step/buy_sell_par_shares.rb:301` | Standard BuySellParShares step |
| `limited_train_buy` | Limited Train Buy | One depot train purchase per corporation per OR | `lib/engine/step/single_depot_train_buy.rb:15` | SingleDepotTrainBuy step instead of BuyTrain |

**Why these are universal:** They live in base step files shipped with the engine. Any game that includes the standard steps automatically gets the behavior — the status string is the only switch.

#### Tier B — Common hooks (used by multiple game families, require a step or game method override in game.rb)

| Status string | Short label | What it gates | Engine check | Requires |
|---|---|---|---|---|
| `can_buy_trains` | Buy Trains From Others | Corporations may buy trains from other corporations | `lib/engine/game/g_1822/step/buy_train.rb:13` | Custom BuyTrain step that checks for this before calling super |
| `export_train` | Train Export | At OR end, next available train is exported (given to CN, triggering phase change) | `lib/engine/game/g_1867/game.rb:153` (event dispatch in OR) | Custom `operating_round` that calls `export_train!` at round end |
| `reduced_tile_lay` | Reduced Tile Lay | Corporations place only one tile per OR (overrides normal two-tile budget) | `lib/engine/game/g_18_co/game.rb:1405` | `tile_lays` override returning REDUCED_TILE_LAYS constant |
| `extra_tile_lays` | Extra Tile Lay | Corporations receive an additional tile lay slot | `lib/engine/game/g_18_mt/game.rb:145` | `tile_lays` override returning EXTRA_TILE_LAYS constant |
| `two_tile_lays` | Two Tile Lays | Corporations lay two tiles per OR (where default is one) | `lib/engine/game/g_18_fr/game.rb:336` | `tile_lays` override returning TWO_TILE_LAYS constant |
| `lay_second_tile` | Tile Lay | Specific corporations (e.g. northern corps) can lay a second tile | `lib/engine/game/g_18_esp/game.rb:514` | `tile_lays` override branching on corp type and this status |

**Key insight:** The three tile-lay statuses (`reduced_tile_lay`, `extra_tile_lays`, `two_tile_lays`) do NOT directly change tile lay behavior in the base engine. They are purely phase flags that game-specific `tile_lays` overrides test. A game cannot use these without writing a custom `tile_lays` method. The editor must flag this.

#### Tier C — Capitalization mode (1856 family; mutually exclusive; change corp floatation and cash distribution)

| Status string | Short label | Long description | Engine location |
|---|---|---|---|
| `escrow` | Escrow Cap | New corps capitalize for the first 5 shares sold; last 5 shares held in escrow until corp destinated | `lib/engine/game/g_1856/game.rb:846` (STATUS_TEXT) |
| `incremental` | Incremental Cap | New corps capitalize for all 10 shares as sold, regardless of destination | `lib/engine/game/g_1856/game.rb:851` (STATUS_TEXT) |
| `fullcap` | Full Cap | New corps capitalize 10×par when 60% of IPO is sold | `lib/engine/game/g_1856/game.rb:856` (STATUS_TEXT) |

These statuses are checked in the G1856 round logic that controls how `float_corporation` is called. They are game-family-specific — only 1856/1836jr56 use them. A game not inheriting G1856 cannot use them without implementing the capitalization-mode switching logic.

#### Tier D — Float percentage (1856 family; display-only; records the float threshold in force this phase)

| Status string | Short label | Meaning |
|---|---|---|
| `facing_2` | 20% to start | 20% of IPO must be sold before corp can start |
| `facing_3` | 30% to start | 30% of IPO must be sold |
| `facing_4` | 40% to start | 40% of IPO must be sold |
| `facing_5` | 50% to start | 50% of IPO must be sold |
| `facing_6` | 60% to start | 60% of IPO must be sold |

Source: `lib/engine/game/g_1856/game.rb:860–888`. These are **display-only** in STATUS_TEXT — they exist to show the current float threshold in the phases table. The actual float threshold is enforced separately in G1856's `can_par?` override, not by reading this status string. Including these in a non-1856 game does nothing mechanically.

#### Tier E — 1822 family (require 1822's custom steps and game structure)

| Status string | Short label | What it gates | Check location |
|---|---|---|---|
| `can_convert_concessions` | Convert Concessions | A concession company can be exchanged for a major corp presidency during SR | `lib/engine/game/g_1822/step/buy_sell_par_shares.rb:76` |
| `can_acquire_minor_bidbox` | Acquire Minor from Bidbox | During OR, a major can acquire a minor from the bid box for £200 | `lib/engine/game/g_1822/step/minor_acquisition.rb:74` |
| `can_par` | Majors 50% Float | Major corporations require 50% of IPO sold to float | `lib/engine/game/g_1822/game.rb:570` |
| `full_capitalisation` | Full Capitalisation | Major corps receive full capitalisation when floated (British spelling) | `lib/engine/game/g_1822/game.rb:883` |
| `minors_green_upgrade` | Minors Can Upgrade to Green | Minor companies can lay green tiles | `lib/engine/game/g_1822/step/tracker.rb:54` |
| `minor_float_phase1` | Minors Receive £100 | Minors receive 100 capital with 50 stock value | Display only — STATUS_TEXT label |
| `minor_float_phase2` | Minors Receive 2× Stock Value | Minors receive 2× stock value as capital | Display only — STATUS_TEXT label |
| `minor_float_phase3on` | Minors Receive Winning Bid | Minors receive entire winning bid as capital | Display only — STATUS_TEXT label |
| `l_upgrade` | £70 L-Train Upgrade | Cost to upgrade L-train to 2-train reduced from £80 to £70 | `lib/engine/game/g_1822/game.rb` train pricing logic |

These require the full 1822 step suite (WaterfallAuction, MinorAcquisition, custom BuyTrain, custom BuySellParShares). They cannot be used in isolation.

#### Tier F — Corporation lifecycle (game-specific; each requires a custom game method or step)

| Status string | Short label | What it gates | Check location | Game(s) |
|---|---|---|---|---|
| `closable_corporations` | Closable Corporations | Unparred corps removed if no home token space available | `lib/engine/game/g_18_co/game.rb:1044` STATUS_TEXT | 18CO |
| `corporate_shares_open` | Corporate Shares Open | All corp shares available for any player to purchase | `lib/engine/game/g_18_co/game.rb:1044` STATUS_TEXT | 18CO |
| `can_convert_corporation` | Convert Corporation | Corporations can convert from 5 shares to 10 shares | `lib/engine/game/g_1866/game.rb:95` STATUS_TEXT | 1866 |
| `can_convert_major` | Convert Major National | President of PRU/K2S can form Germany or Italy Major National | `lib/engine/game/g_1866/game.rb:95` STATUS_TEXT | 1866 |
| `national_operates` | National Railway Operates | After minors and majors operate, the national runs trains and withholds | `lib/engine/game/g_1861/game.rb:163` STATUS_TEXT | 1861 |
| `normal_formation` | Full Capitalization (18EU) | Corps may form without exchanging a minor; 5 remaining shares go to bank pool | `lib/engine/game/g_18_eu/game.rb:44` STATUS_TEXT | 18EU |
| `all_corps_available` | All Railroad Companies Available | All corps now available to start | `lib/engine/game/g_1868_wy/game.rb:125` STATUS_TEXT | 1868WY |
| `full_capitalization` | Full Capitalization (1868WY) | Corps float at 60% and receive full capitalization | `lib/engine/game/g_1868_wy/game.rb:125` STATUS_TEXT | 1868WY |

#### Tier G — Stock market modifiers (game-specific; require custom StockMarket or round overrides)

| Status string | Short label | What it gates | Check location | Game(s) |
|---|---|---|---|---|
| `blue_zone` | Blue Zone Active | Price movement to/from restricted blue zone cells is permitted | `lib/engine/game/g_1849/stock_market.rb:24–25` | 1849 |
| `no_new_shorts` | No New Shorts | Short selling is not permitted; existing shorts remain | `lib/engine/game/g_1817/game.rb` | 1817 |
| `no_loans` | Loans May Not Be Taken | Outstanding loans must be repaid; no new loans | `lib/engine/game/g_1856/game.rb:876` STATUS_TEXT | 1856/1836jr56 |

#### Tier H — Train kind limits (1862; require custom train-type tracking in game.rb)

| Status string | Short label | Description | Game |
|---|---|---|---|
| `three_per` | 3 Per Kind | Limit of 3 trains of each kind (Freight/Local/Express) | 1862 |
| `two_per` | 2 Per Kind | Limit of 2 trains of each kind | 1862 |
| `three_total` | 3 Total | Limit of 3 trains total across all kinds | 1862 |
| `first_rev` | First Offboard | First offboard/port value used for revenue | 1862 |
| `middle_rev` | Middle Offboard | Middle offboard/port value used for revenue | 1862 |
| `last_rev` | Last Offboard | Last offboard/port value used for revenue | 1862 |

Source: `lib/engine/game/g_1862/game.rb:472` STATUS_TEXT.

#### Tier I — Miscellaneous game-specific

| Status string | Short label | Game | Notes |
|---|---|---|---|
| `can_buy_companies_operation_round_one` | Buy Companies OR1 | Various | Restricts company purchase to first OR of a set |
| `minor_limit_one` | Minor Train Limit: 1 | 18EU | Minors limited to 1 train |
| `minor_limit_two` | Minor Train Limit: 2 | 18EU | Minors limited to 2 trains |
| `mountain_pass` | Mountain Pass | 18ESP | Can build mountain passes |
| `higher_par_prices` | Higher Par Prices | 18ESP | Northern corps can par at 95/100 |
| `may_exchange_mountain_railways` | Exchange Mountain Railways | 1824 | `lib/engine/game/g_1824/game.rb:454` |
| `may_exchange_coal_railways` | Exchange Coal Railways | 1824 | `lib/engine/game/g_1824/game.rb:472` |
| `upgradeable_towns` | Towns Can Be Upgraded | 1856 | Single town → plain track or yellow city |
| `can_acquire_minor_bidbox` | Acquire Minor from Bidbox | 1822 Africa | `lib/engine/game/g_1822_africa/step/minor_acquisition.rb:42` |

---

### 11.3 UI Design

#### The field type: Tag picker with three-tier vocabulary

The `status:` field on a phase must **not** be free text. Every status string is a behavioral switch in Ruby code; an unrecognized string does nothing and produces a silently-invalid game. The correct widget is a **tag picker** — a multi-select input populated from the known vocabulary — with the ability to add custom strings (flagged as "needs custom Ruby").

```
Phase 3  status: [can_buy_companies ×] [export_train ×]  [+ add status ▾]
                                                          ┌─────────────────────┐
                                                          │ 🔍 Filter...        │
                                                          ├─────────────────────┤
                                                          │ ── UNIVERSAL ─────  │
                                                          │ ✓ can_buy_companies │
                                                          │   limited_train_buy │
                                                          │   can_buy_companies_│
                                                          │   from_other_players│
                                                          ├─────────────────────┤
                                                          │ ── COMMON HOOKS ─── │
                                                          │   can_buy_trains    │
                                                          │   export_train      │
                                                          │   reduced_tile_lay  │
                                                          │   extra_tile_lays   │
                                                          │   two_tile_lays     │
                                                          ├─────────────────────┤
                                                          │ ── GAME-SPECIFIC ── │
                                                          │   escrow            │
                                                          │   incremental       │
                                                          │   fullcap           │
                                                          │   ... (collapsed)   │
                                                          ├─────────────────────┤
                                                          │ + Custom string...  │
                                                          └─────────────────────┘
```

Each tag in the picker displays the **short label** from STATUS_TEXT (`'Can Buy Companies'`), not the raw key. Hovering a tag shows the long description in a tooltip.

#### Tier badges on each option

Every option in the picker carries a tier badge visible on hover:

| Badge | Meaning |
|---|---|
| `UNIVERSAL` | Works with standard step wiring. No custom Ruby needed. |
| `HOOK REQUIRED` | Needs a game-method override (e.g. `tile_lays`). Editor generates a stub. |
| `FAMILY: 1856` | Only useful in games inheriting G1856. Will be ignored otherwise. |
| `FAMILY: 1822` | Only useful in games with 1822 step suite. |
| `CUSTOM RUBY` | Non-trivial engine code required. Editor exports a warning, not a stub. |

The `HOOK REQUIRED` and `CUSTOM RUBY` distinctions matter for the export path — the game.rb exporter must include stubs or refuse to export with an error depending on tier.

#### How the designer knows which statuses are valid for their game

Three filtering levels, progressively narrowing:

1. **Default view**: Shows Tier A (universal) + Tier B (common hooks) only. The designer can add any of these immediately with a clear understanding of what they do.

2. **"Advanced" toggle**: Reveals Tier C–I (family-specific and game-specific) with tier badges. These are hidden by default because using them without the matching game family wiring is a bug.

3. **Context-aware suppression**: If the designer has not enabled "Minor Acquisition" in the OR Steps panel, all Tier E (1822 family) statuses are greyed out with the tooltip "Requires Minor Acquisition step enabled in OR Structure". Similar suppression for 1856 family statuses when capitalization mode is not set to "1856-style phase-gated".

#### Downstream effects — which other editor sections are affected

When a status tag is selected, a small "effects" banner appears below the tag list:

```
can_buy_trains  selected
→  OR Structure: ensure your OR step list includes a BuyTrain step variant that
   checks this status. Standard BuyTrain does NOT check it — you need a custom step.
   [View OR Steps panel]
```

```
reduced_tile_lay  selected
→  OR Structure: this status is only active if your tile_lays() override returns
   REDUCED_TILE_LAYS when this status is present. Standard wiring does not do this.
   [Generate tile_lays stub]
```

```
escrow  selected
→  Capitalization: this status is part of the 1856 phase-gated capitalization system.
   You must also set the capitalization mode to "1856-style" and include escrow, 
   incremental, and fullcap on successive phases.
   [View Capitalization settings]
```

The five effects categories and which statuses trigger them:

| Effect category | Triggered by |
|---|---|
| "Requires BuyTrain step override" | `can_buy_trains` |
| "Requires tile_lays override" | `reduced_tile_lay`, `extra_tile_lays`, `two_tile_lays`, `lay_second_tile` |
| "Part of 1856 capitalization system (all three required)" | `escrow`, `incremental`, `fullcap` |
| "Requires 1822 step suite" | `can_convert_concessions`, `can_acquire_minor_bidbox`, `can_par`, `full_capitalisation`, `minors_green_upgrade`, `l_upgrade` |
| "Display-only — no Ruby behavior" | `facing_2`–`facing_6`, `minor_float_phase1/2/3on` |

#### Structural net: status ↔ export validation

Before emitting game.rb, the exporter checks:

1. Any Tier B status that requires a `tile_lays` override → error unless `tileLays.byType` is set for the relevant entity type, or the designer has acknowledged "will write custom `tile_lays` override".
2. `can_buy_trains` → error unless OR step list includes a BuyTrain variant, or designer acknowledged.
3. Any of `escrow`/`incremental`/`fullcap` → error unless all three appear across the phase sequence exactly once each (they must form a progression).
4. Any Tier E (1822 family) status → error unless `orSteps.minorAcquisition` is enabled.
5. Any custom string (free-text) → warning: "This status will not be displayed to players and will have no effect unless your game.rb includes `phase.status.include?('your_string')` checks and a `STATUS_TEXT` entry."

#### Phase table column in left panel

The existing left-panel phase items (`id: 'phase_N'`) currently show `value: p.on ? 'on ' + p.on : ''`. When a phase has status entries, append them as short labels:

```
Phase 3  ▸ on 3-train  · Can Buy Companies
Phase 4  ▸ on 4-train  · Can Buy Companies · Train Export
Phase 5  ▸ on 5-train
```

Implementation: after resolving short labels from the `KNOWN_STATUS` lookup table (same approach as `KNOWN_EVENTS`), join them with ` · ` and append to the value field. Long statuses truncate to fit; a `title` attribute shows the full list on hover.

#### Data model additions

The existing `state.mechanics` already stores phases via `state.phases`. Status strings are already captured per-phase as `phase.status[]`. No new state fields are needed.

What IS new: the `KNOWN_STATUS` lookup table in `mechanics-panel.js`, mirroring `KNOWN_EVENTS`:

```javascript
const KNOWN_STATUS = [
  // Tier A — Universal
  { key: 'can_buy_companies',
    label: 'Can Buy Companies',
    desc: 'All corporations can buy companies from players',
    tier: 'universal', effects: ['buy_company_step'] },
  { key: 'can_buy_companies_from_other_players',
    label: 'Interplayer Company Buy',
    desc: 'Companies can be bought between players after first stock round',
    tier: 'universal', effects: [] },
  { key: 'limited_train_buy',
    label: 'Limited Train Buy',
    desc: 'Corporations can only buy one train from the bank per OR',
    tier: 'universal', effects: ['single_depot_train_buy_step'] },
  // Tier B — Common hooks
  { key: 'can_buy_trains',
    label: 'Buy Trains From Others',
    desc: 'Corporations may buy trains from other corporations',
    tier: 'hook', effects: ['custom_buy_train_step'] },
  { key: 'export_train',
    label: 'Train Export',
    desc: 'At OR end, next available train exported (triggers phase change)',
    tier: 'hook', effects: ['custom_or_end'] },
  { key: 'reduced_tile_lay',
    label: 'Reduced Tile Lay',
    desc: 'Corporations place only one tile per OR',
    tier: 'hook', effects: ['tile_lays_override'] },
  { key: 'extra_tile_lays',
    label: 'Extra Tile Lay',
    desc: 'Corporations receive an additional tile lay slot',
    tier: 'hook', effects: ['tile_lays_override'] },
  { key: 'two_tile_lays',
    label: 'Two Tile Lays',
    desc: 'Corporations lay two tiles per OR',
    tier: 'hook', effects: ['tile_lays_override'] },
  { key: 'lay_second_tile',
    label: 'Second Tile Lay',
    desc: 'Specific corporations can lay a second tile',
    tier: 'hook', effects: ['tile_lays_override'] },
  // Tier C — 1856 family capitalization
  { key: 'escrow',
    label: 'Escrow Cap',
    desc: 'New corps capitalize for first 5 shares; last 5 held in escrow until destinated',
    tier: 'family_1856', effects: ['cap_mode_1856'] },
  { key: 'incremental',
    label: 'Incremental Cap',
    desc: 'New corps capitalize for all 10 shares as sold',
    tier: 'family_1856', effects: ['cap_mode_1856'] },
  { key: 'fullcap',
    label: 'Full Cap',
    desc: 'New corps capitalize 10×par when 60% of IPO is sold',
    tier: 'family_1856', effects: ['cap_mode_1856'] },
  // Tier D — 1856 family float threshold (display-only)
  { key: 'facing_2', label: '20% to Start',
    desc: 'An unstarted corp needs 20% sold from IPO to start',
    tier: 'family_1856', effects: ['display_only'] },
  { key: 'facing_3', label: '30% to Start',
    desc: 'An unstarted corp needs 30% sold from IPO to start',
    tier: 'family_1856', effects: ['display_only'] },
  { key: 'facing_4', label: '40% to Start', tier: 'family_1856', effects: ['display_only'] },
  { key: 'facing_5', label: '50% to Start', tier: 'family_1856', effects: ['display_only'] },
  { key: 'facing_6', label: '60% to Start', tier: 'family_1856', effects: ['display_only'] },
  { key: 'upgradeable_towns',
    label: 'Towns Can Be Upgraded',
    desc: 'Single town tiles can upgrade to plain track or yellow city',
    tier: 'family_1856', effects: [] },
  { key: 'no_loans',
    label: 'No Loans',
    desc: 'Outstanding loans must be repaid; no new loans may be taken',
    tier: 'family_1856', effects: [] },
  // Tier E — 1822 family
  { key: 'can_convert_concessions',
    label: 'Convert Concessions',
    desc: 'A concession can be exchanged for a major corp presidency during SR',
    tier: 'family_1822', effects: ['minor_acquisition_step'] },
  { key: 'can_acquire_minor_bidbox',
    label: 'Acquire Minor from Bidbox',
    desc: 'During OR, a major can acquire a minor from the bid box for £200',
    tier: 'family_1822', effects: ['minor_acquisition_step'] },
  { key: 'can_par',
    label: 'Majors 50% Float',
    desc: 'Major corporations require 50% of IPO sold to float',
    tier: 'family_1822', effects: ['minor_acquisition_step'] },
  { key: 'full_capitalisation',
    label: 'Full Capitalisation',
    desc: 'Major companies receive full capitalisation when floated',
    tier: 'family_1822', effects: ['minor_acquisition_step'] },
  { key: 'minors_green_upgrade',
    label: 'Minors Can Upgrade to Green',
    desc: 'Minor companies can lay green tiles this phase',
    tier: 'family_1822', effects: ['minor_acquisition_step'] },
  { key: 'minor_float_phase1',
    label: 'Minors Receive £100',
    desc: 'Minors receive 100 capital with 50 stock value',
    tier: 'family_1822', effects: ['display_only'] },
  { key: 'minor_float_phase2',
    label: 'Minors Receive 2× Stock Value',
    desc: 'Minors receive 2× stock value as capital',
    tier: 'family_1822', effects: ['display_only'] },
  { key: 'minor_float_phase3on',
    label: 'Minors Receive Winning Bid',
    desc: 'Minors receive entire winning bid as capital',
    tier: 'family_1822', effects: ['display_only'] },
  { key: 'l_upgrade',
    label: '£70 L-Train Upgrade',
    desc: 'Cost to upgrade L-train to 2-train reduced from £80 to £70',
    tier: 'family_1822', effects: [] },
  // Tier F — Corporation lifecycle (game-specific)
  { key: 'national_operates',
    label: 'National Railway Operates',
    desc: 'After minors and majors operate, the national runs trains and withholds',
    tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'closable_corporations',
    label: 'Closable Corporations',
    desc: 'Unparred corps removed if no home token space available',
    tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'corporate_shares_open',
    label: 'Corporate Shares Open',
    desc: 'All corporate shares available for any player to purchase',
    tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'all_corps_available',
    label: 'All Corporations Available',
    desc: 'All railroad companies are now available to start',
    tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'full_capitalization',
    label: 'Full Capitalization',
    desc: 'Corporations float at 60% and receive full capitalization (1868WY spelling)',
    tier: 'game_specific', effects: ['custom_ruby'] },
  // Tier G — Stock market (game-specific)
  { key: 'blue_zone',
    label: 'Blue Zone Active',
    desc: 'Stock market price movement to/from blue zone cells is permitted',
    tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'no_new_shorts',
    label: 'No New Shorts',
    desc: 'Short selling is not permitted; existing shorts remain',
    tier: 'game_specific', effects: ['custom_ruby'] },
  // Tier H — 1862 train kinds
  { key: 'three_per', label: '3 Per Kind', tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'two_per',   label: '2 Per Kind', tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'three_total', label: '3 Total',  tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'first_rev',  label: 'First Offboard',  tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'middle_rev', label: 'Middle Offboard', tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'last_rev',   label: 'Last Offboard',   tier: 'game_specific', effects: ['custom_ruby'] },
  // 18EU / minor train limits
  { key: 'minor_limit_one',
    label: 'Minor Train Limit: 1',
    desc: 'Minor companies are limited to owning 1 train',
    tier: 'game_specific', effects: [] },
  { key: 'minor_limit_two',
    label: 'Minor Train Limit: 2',
    desc: 'Minor companies are limited to owning 2 trains',
    tier: 'game_specific', effects: [] },
  // 18ESP
  { key: 'mountain_pass',
    label: 'Mountain Pass',
    desc: 'Can build mountain passes',
    tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'higher_par_prices',
    label: 'Higher Par Prices',
    desc: 'Northern corporations can now par at 95 and 100',
    tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'lay_second_tile',
    label: 'Second Tile Lay',
    desc: 'Northern corporations can lay a second tile',
    tier: 'game_specific', effects: ['tile_lays_override'] },
  // 1824
  { key: 'may_exchange_mountain_railways',
    label: 'Exchange Mountain Railways',
    desc: 'Mountain railway shares can be exchanged for major corp shares',
    tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'may_exchange_coal_railways',
    label: 'Exchange Coal Railways',
    desc: 'Coal railway shares can be exchanged for major corp shares',
    tier: 'game_specific', effects: ['custom_ruby'] },
  // 18EU normal_formation
  { key: 'normal_formation',
    label: 'Full Capitalization (18EU)',
    desc: 'Corps may form without exchanging a minor; 5 remaining shares go to bank pool',
    tier: 'game_specific', effects: ['custom_ruby'] },
  // Can buy companies variants
  { key: 'can_buy_companies_operation_round_one',
    label: 'Buy Companies OR1 Only',
    desc: 'Corporations may buy companies during the first OR of each set only',
    tier: 'hook', effects: ['buy_company_step'] },
];
```

#### Where KNOWN_STATUS lives

This constant belongs in `js/mechanics-panel.js`, adjacent to `KNOWN_EVENTS`. It is used in:
1. The Phases panel right-side status tag picker (to be built in a future task)
2. The left-panel phase items (to convert raw status strings to short labels in the tree)
3. The export validator (to flag Tier C/D/E/F/G/H statuses that require additional wiring)

**Note:** The Phases panel (Farrah's domain) is the primary edit surface for status. The mechanics panel reads status from `state.phases` and uses `KNOWN_STATUS` for display and validation. The `KNOWN_STATUS` constant is defined in `mechanics-panel.js` and exposed as a global so Farrah's panel can import it by reference from the same bundle (no module system — global is fine since both load in the same HTML context).
