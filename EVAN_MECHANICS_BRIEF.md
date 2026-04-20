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
