# 18xxtools Entities Import Audit
_Generated: 2026-04-19_

## 1. Coverage

- **112** entities.rb files found under `lib/engine/game/` (no files in `lib/engine/config/game/`)
- **1,111** total COMPANIES entries (sym: occurrences across all COMPANIES arrays)
- **1,241** total CORPORATIONS entries (sym: occurrences across all CORPORATIONS arrays)

### Methodology note
All counts were derived by walking every `abilities: [ ... ]` block character-by-character to extract the nested `{ ... }` hashes, then regex-matching `type:` within those hashes. This is precise: corporation `type:` fields (e.g. `type: 'minor'`) are in a different structural context and were not counted as ability types. COMPANIES and CORPORATIONS counts used sym: as a proxy for one entry per hash.

---

## 2. Ability Type Frequency Table

The following ability types were found inside `abilities:` arrays across all 112 files.

| Ability type | Occurrences | Games | Import (`_rbAbilities`) | UI (`ABILITY_DEFS`) |
|---|---|---|---|---|
| `exchange` | 260 | 31 | ⚠️ Partial | ✅ Has def |
| `tile_lay` | 232 | 59 | ⚠️ Partial | ✅ Has def |
| `blocks_hexes` | 180 | 40 | ⚠️ Partial | ✅ Has def |
| `no_buy` | 175 | 35 | ⚠️ Type stored, no fields (type has none) | ❌ No def |
| `shares` | 124 | 43 | ❌ `shares:` field not extracted | ✅ Has def (stores `shares`) |
| `close` | 108 | 38 | ⚠️ Partial | ✅ Has def |
| `revenue_change` | 92 | 14 | ❌ Type stored, no fields extracted | ❌ No def |
| `assign_hexes` | 82 | 34 | ⚠️ Partial (`hexes` extracted) | ❌ No def |
| `reservation` | 78 | 11 | ⚠️ Partial (`hexes` extracted) | ❌ No def |
| `hex_bonus` | 54 | 10 | ⚠️ Partial | ✅ Has def |
| `token` | 53 | 27 | ⚠️ Partial | ✅ Has def |
| `base` | 50 | 8 | ⚠️ Partial (`description` extracted) | ❌ No def |
| `tile_discount` | 44 | 28 | ⚠️ Partial | ✅ Has def |
| `assign_corporation` | 34 | 21 | ⚠️ Partial (`corporations` extracted) | ❌ No def |
| `blocks_hexes_consent` | 32 | 4 | ✅ Used (detected for concession) | ❌ No standalone def |
| `description` | 21 | 8 | ✅ `description` extracted, used for associatedMajor | ❌ No standalone def |
| `choose_ability` | 19 | 6 | ❌ Type stored, no fields extracted | ❌ No def |
| `manual_close_company` | 19 | 1 | ❌ Type stored, no fields extracted | ❌ No def |
| `sell_company` | 19 | 2 | ❌ Type stored, no fields extracted | ❌ No def |
| `train_discount` | 16 | 12 | ⚠️ Partial | ✅ Has def |
| `teleport` | 16 | 12 | ⚠️ Partial | ✅ Has def |
| `tile_income` | 10 | 9 | ❌ Type stored, no fields extracted | ❌ No def |
| `train_limit` | 9 | 6 | ❌ Type stored, no fields extracted | ❌ No def |
| `generic` | 8 | 1 | ❌ Type stored, no fields extracted | ✅ Has def (stores `desc`) |
| `additional_token` | 7 | 7 | ❌ Type stored, no fields extracted | ❌ No def |
| `train_buy` | 6 | 6 | ❌ Type stored, no fields extracted | ❌ No def |
| `acquire_company` | 6 | 2 | ❌ Type stored, no fields extracted | ❌ No def |
| `borrow_train` | 2 | 2 | ❌ Type stored, no fields extracted | ❌ No def |
| `blocks_partition` | 2 | 2 | ❌ Type stored, no fields extracted | ❌ No def |
| `train_scrapper` | 1 | 1 | ❌ Type stored, no fields extracted | ❌ No def |
| `purchase_train` | 1 | 1 | ❌ Type stored, no fields extracted | ❌ No def |

**Import key:**
- ✅ Supported: field is extracted and stored
- ⚠️ Partial: type is recognized but key fields are dropped (see Section 3)
- ❌ Unsupported: type string stored but no fields, OR type not handled

---

## 3. Ability Field Coverage

The `_rbAbilities` function (in `js/import-ruby.js`, lines 1026–1048) extracts exactly these fields from each ability hash:

| Field | Extracted |
|---|---|
| `type` | ✅ |
| `from` | ✅ |
| `owner_type` | ✅ |
| `description` | ✅ |
| `corporations` | ✅ |
| `hexes` | ✅ |
| `discount` | ✅ |

### Fields dropped by `_rbAbilities` vs. what ABILITY_DEFS uses

| Ability type | Fields dropped (UI uses them, import drops them) |
|---|---|
| `tile_lay` | `count`, `when`, `free`, `closed_when_used_up`, `reachable`, `tiles` |
| `tile_discount` | `terrain` |
| `token` | `count`, `price` |
| `teleport` | `tiles` |
| `exchange` | `when` |
| `shares` | `shares` (the list of share identifiers) |
| `hex_bonus` | `amount` |
| `train_discount` | `trains` |
| `close` | `when`, `corporation` |
| `generic` | `desc` |

### High-frequency wild fields NOT extracted by _rbAbilities

(Sourced from Python scan of all ability hash field names)

| Field | Occurrences | Games |
|---|---|---|
| `when` | 649 | 75 |
| `count` | 393 | 69 |
| `tiles` | 248 | 62 |
| `on_phase` | 143 | 21 |
| `reachable` | 138 | 30 |
| `closed_when_used_up` | 112 | 30 |
| `special` | 97 | 38 |
| `revenue` | 92 | 14 |
| `consume_tile_lay` | 73 | 25 |
| `free` | 65 | 33 |
| `teleport_price` | 37 | 20 |
| `remove` | 37 | 12 |
| `price` | 49 | 25 |
| `terrain` | 41 | 26 |
| `amount` | 54 | 10 |
| `trains` | 16 | 12 |
| `shares` (in `shares` ability) | 124 | 43 |

---

## 4. Concession Detection

### exchange + `from: 'par'` (tobymao concession pattern)

These 7 games use the canonical `{ type: 'exchange', from: 'par', corporations: ['XYZ'] }` pattern that `importEntitiesRb` uses to detect concessions:

- `g_1822`
- `g_1822_africa`
- `g_1822_ca`
- `g_1822_mx`
- `g_1866`
- `g_1882`
- `g_18_cuba`

The importer correctly identifies these 7 games' concessions and sets `companyType: 'concession'`.

### exchange + `from: 'ipo'` (exchange for IPO share — a different mechanic)

7 games: `g_1832`, `g_1835`, `g_1858`, `g_1858_india`, `g_1858_switzerland`, `g_1860`, `g_1889`

These are NOT concessions. The private can be exchanged for a share from the IPO (initial offering) at a fixed price. The importer treats these as plain `exchange` abilities and stores them on the `abilities:` array, **not** as concessions. This is correct behavior.

### exchange + `from: 'market'`

2 games: `g_2038`, `g_21_moon`

Exchange for a share from the secondary market. Stored as plain exchange ability. Correct.

### exchange + `from: %w[ipo ...]` or `from: %i[reserved]` (Ruby array notation)

10 games: `g_1828`, `g_1830`, `g_1836_jr30`, `g_1847_ae`, `g_1850_jr`, `g_1868_wy`, `g_18_mo`, `g_18_neb`, `g_18_nl`, `g_18_oe_uk_fr`

These use Ruby word-array syntax (`%w[ipo]`, `%i[reserved]`). The `_rbAbilities` function calls `_rbStr(h, 'from')` which only matches `from: 'string'` patterns — it **silently drops** the `from` value for these 10 games because `%w[...]` does not match a single-quoted string. This means the importer fails to read `from:` for these exchanges.

---

## 5. Gaps and Risk

Ranked by: (frequency × missing severity). "Missing severity" = 2 if zero fields extracted past `type`, 1 if key fields dropped.

### Critical — high frequency, key fields silently dropped

1. **`tile_lay` — 232 occurrences, 59 games**: The most common ability. `_rbAbilities` stores only `type`, `owner_type`, `hexes`. Drops `count` (how many extra lays), `when` (which round), `free` (waives tile cost), `tiles` (which tiles are allowed), `closed_when_used_up`, `reachable`. The ABILITY_DEFS UI has all these fields, so imported tile_lay abilities will always show empty defaults.

2. **`shares` — 124 occurrences, 43 games**: The `shares:` field (list of share identifiers) is never extracted — only `type: 'shares'` is stored. The ABILITY_DEFS UI displays a `shares` tags field but it will always be blank after import.

3. **`close` — 108 occurrences, 38 games**: The `when:` field (e.g. `'bought_train'`, `'operated'`, `'par'`) is not extracted. Without it the UI close editor cannot render the imported condition. The `corporation:` field (for `when: 'bought_train'`) is also dropped.

4. **`exchange` `from: %w[...]` pattern — 10 games**: The `from:` value is silently dropped when the Ruby source uses array notation (`%w[ipo]`, `%i[reserved]`). The exchange ability is stored without `from`, making it impossible to detect exchange-type and direction correctly. The `when:` field is also never extracted.

5. **`token` — 53 occurrences, 27 games**: `price` and `count` are dropped. An imported token ability will show $0 cost and 1 use regardless of source.

### Significant — high frequency, zero support

6. **`no_buy` — 175 occurrences, 35 games**: Type is stored but there is no ABILITY_DEFS entry. On import, these end up in `p.abilities[]` with only `{ type: 'no_buy' }`. In tobymao this prevents corporations from buying the private. The `buyerType: 'no_acquire'` field exists in the data model and is set by the `desc` heuristic, but the `no_buy` ability should drive it directly and the ability should then be stripped (it is already expressed by `buyerType`).

7. **`revenue_change` — 92 occurrences, 14 games**: Type stored, no fields. The `revenue:` and `on_phase:` fields (phase-dependent revenue changes for privates) are dropped entirely. No UI support. Affects 14 games.

8. **`assign_hexes` — 82 occurrences, 34 games**: The `hexes:` field IS extracted (since `_rbAbilities` extracts all `hexes:`), but there is no ABILITY_DEFS entry and no downstream use. 34 games affected.

9. **`reservation` — 78 occurrences, 11 games**: Same — `hexes:` extracted but no UI and no downstream use.

10. **`tile_discount` `terrain` field — 44 occurrences, 28 games**: The `terrain:` field is not extracted. Tile discount abilities lose their terrain restriction on import.

### Lower risk

11. **`hex_bonus` `amount` — 54 occurrences, 10 games**: The bonus amount is dropped; UI shows $0.
12. **`teleport` `tiles` — 16 occurrences**: Required tile list dropped.
13. **`train_discount` `trains` — 16 occurrences**: Train type restriction dropped; appears as "all trains" in UI.
14. **`choose_ability` / `sell_company` / `manual_close_company` / `tile_income` / `additional_token` / `train_buy` / `train_limit`**: No import fields, no UI defs. Collectively 99 occurrences across ~40 games. These are stored as bare `{ type: '...' }` objects in `p.abilities[]` and round-trip through export as generic ability shells only.
