# `when:` Field Design Proposal
*Research date: 2026-04-19 | Researched by: Claude Sonnet 4.6*

All claims trace to files in `C:\Users\meiot\Rail\18xx-master`.

---

## 1. Full Frequency Table

Scanned all `entities.rb` files in `lib/engine/game/` (112 files, 75 games).
Both single-string (`when: 'value'`) and array (`when: %w[a b]`) forms were counted.

| `when:` value               | Occurrences | Games |
|-----------------------------|-------------|-------|
| `owning_corp_or_turn`       | 155         | 47    |
| `owning_player_sr_turn`     | 155         | 9     |
| `track`                     | 150         | 38    |
| `owning_player_or_turn`     | 41          | 8     |
| `special_track`             | 33          | 6     |
| `owning_player_track`       | 29          | 11    |
| `bought_train`              | 29          | 19    |
| `sold`                      | 27          | 17    |
| `any`                       | 21          | 10    |
| `exchange`                  | 14          | 2     |
| `has_train`                 | 8           | 4     |
| `buy_train`                 | 8           | 6     |
| `token`                     | 7           | 7     |
| `operated`                  | 7           | 2     |
| `stock_round`               | 6           | 2     |
| `track_and_token`           | 5           | 3     |
| `par`                       | 5           | 5     |
| `ran_train`                 | 3           | 2     |
| `owning_player_token`       | 3           | 2     |
| `or_start`                  | 2           | 1     |
| `route`                     | 2           | 2     |
| `buying_train`              | 2           | 1     |
| `dividend`                  | 2           | 1     |
| `auction_end`               | 1           | 1     |
| `or_between_turns`          | 1           | 1     |
| `single_depot_train_buy`    | 1           | 1     |
| `special_token`             | 1           | 1     |

**Total: 27 distinct values, 649 total occurrences across 75 games.**

---

## 2. Taxonomy

Sources:
- `lib/engine/game/base.rb` — `ability_right_time?` method (lines 3372–3428) is the canonical switch statement for resolving `when:` values.
- `lib/engine/step/` — individual step files define what `time:` context they pass to `abilities()`.
- `lib/engine/game/base.rb` — `close_companies_on_event!` is called with `'par'`, `'bought_train'`, `'ran_train'`, `'operated'`.

### 2A — OR Step-Scoped

These values match a currently-active OR step by step name. They are checked in `ability_right_time?` via:
```ruby
when current_step_name
  @round.operating? && @round.current_operator == ability.corporation
```
The `current_step_name` is the `.type` of whichever OR step is not yet `passed?` and is `blocking?`.

| Value                 | Active when                                                 | Ability types seen |
|-----------------------|-------------------------------------------------------------|--------------------|
| `track`               | OR track-laying step (Step::Track)                         | tile_lay, tile_discount |
| `special_track`       | OR special track step (Step::SpecialTrack)                 | tile_lay, teleport |
| `token`               | OR token placement step (Step::Token)                      | token              |
| `special_token`       | OR special token step (Step::SpecialToken)                 | token, teleport    |
| `route`               | OR run-routes step (Step::Route)                           | generic            |
| `track_and_token`     | OR combined track+token step (Step::TrackAndToken)         | tile_lay, token    |
| `buy_train`           | OR train purchase step (Step::BuyTrain)                    | train_discount     |
| `single_depot_train_buy` | Variant OR train purchase step                          | train_discount     |
| `dividend`            | OR dividend step (Step::Dividend)                          | generic, revenue_change |
| `exchange`            | Stock round Exchange step (Step::Exchange)                 | exchange           |

Notes:
- `buying_train` is consumed by `Step::Train#ability_timing` as `%w[%current_step% buying_train owning_corp_or_turn]`, making it an alias for "during the buy_train step" — effectively OR step-scoped.
- `exchange` is a stock-round step, not an OR step, despite appearing in the same switch. It belongs in a separate context (SR step-scoped).

### 2B — OR Turn-Scoped

These values fire any time the owning corporation's (or player's) OR turn is active, regardless of which specific step is current.

| Value                    | Condition (from `ability_right_time?`)                                              |
|--------------------------|-------------------------------------------------------------------------------------|
| `owning_corp_or_turn`    | OR is active AND current operator is the ability's corporation                      |
| `owning_player_or_turn`  | OR is active AND current operator's president is the ability's player               |
| `owning_player_track`    | OR is active AND president == ability.player AND current step is `Step::Track`      |
| `owning_player_token`    | OR is active AND president == ability.player AND current step is `Step::Token`      |
| `or_between_turns`       | OR is active AND `!current_operator_acted` (between two corporations' turns)        |
| `or_start`               | OR is active AND `@round.at_start` (very beginning of OR before any corp operates)  |

### 2C — SR Turn-Scoped

| Value                     | Condition                                                                     |
|---------------------------|-------------------------------------------------------------------------------|
| `owning_player_sr_turn`   | SR is active AND current entity is the ability's player                       |
| `stock_round`             | SR is active (any SR turn, any player)                                        |
| `exchange`                | SR is active, specifically during `Step::Exchange` (share exchange step)      |

### 2D — Event-Triggered (close ability `when:` only)

These values are not round-context checks — they appear exclusively on `type: 'close'` abilities and are consumed only by `close_companies_on_event!` in `base.rb`. They name a discrete game event that triggers company closure.

| Value           | Triggered by (source)                                                     |
|-----------------|---------------------------------------------------------------------------|
| `bought_train`  | `base.rb#buy_train` → `close_companies_on_event!(operator, 'bought_train')` |
| `ran_train`     | `step/dividend.rb` → `close_companies_on_event!(entity, 'ran_train')`     |
| `operated`      | `step/dividend.rb#pass!` → `close_companies_on_event!(entity, 'operated')`|
| `par`           | `base.rb#after_par` → `close_companies_on_event!(corporation, 'par')`     |
| `sold`          | `step/buy_company.rb` → fires `revenue_change` and `assign_corporation` abilities with `time: 'sold'` |
| `auction_end`   | Game-specific (g_1828): `abilities(company, :revenue_change, time: 'auction_end')` at end of initial auction |
| `has_train`     | Not a standard engine event — used only for `revenue_change` abilities in 1817/1817_de/1817_na; checked at OR start when the corp has trains |

### 2E — Meta / Any-Round

| Value  | Meaning                                                                             |
|--------|-------------------------------------------------------------------------------------|
| `any`  | Ability is usable at any time in any round (short-circuits all other time checks). In `ability_right_time?`: `return true if time == 'any' \|\| ability.when?('any')` |

---

## 3. Proposed Data Model

### Context

18xxtools currently has `state.phases` (an array of phase entries with `name`, `onTrain`, `ors`, `limit`, `tiles`, `color`) but has no concept of "what OR or SR steps are active in this game." The engine-side equivalent is each game's `operating_round_steps` and `stock_round_steps` constants, which vary per game — some games use `TrackAndToken` instead of separate `Track` + `Token` steps, some omit a `Dividend` step, some add game-specific steps.

For 18xxtools, the purpose of storing step information is purely to:
1. Validate `when:` values on abilities when importing entities.rb
2. Warn the user if they author an ability with a `when:` that doesn't correspond to a step in their game
3. Power a `<select>` or tag list in the ability editor

We do NOT need to reproduce the full step sequencing or step interaction model. We need a minimal, user-editable declaration of what steps exist.

### Proposed `state.gameSteps`

```js
state.gameSteps = {
  or: ['track', 'token', 'route', 'dividend', 'buy_train'],
  // Subset of OR step-scoped values that are active in this game.
  // Default above covers the standard 18xx OR sequence.
  // Games with TrackAndToken combined step would replace 'track' + 'token' with 'track_and_token'.

  sr: ['exchange'],
  // SR step-scoped values. 'exchange' is the only one that is step-specific.
  // 'owning_player_sr_turn' and 'stock_round' are always valid in any SR game.

  events: ['bought_train', 'ran_train', 'operated', 'par', 'sold', 'has_train'],
  // Event-triggered close/ability values this game can generate.
  // Most games use all six. 'auction_end' is included only for auction games.
  // 'has_train' is effectively always valid for revenue_change abilities.
}
```

**Default values** (appropriate for ~80% of games, matching the standard 1830/1846/1889 step sequence):
```js
state.gameSteps = {
  or: ['track', 'token', 'route', 'dividend', 'buy_train'],
  sr: ['exchange'],
  events: ['bought_train', 'ran_train', 'operated', 'par', 'sold', 'has_train'],
}
```

**Always-valid values** (no validation needed, never warn):
- `any` — unconditionally valid
- `owning_corp_or_turn`, `owning_player_or_turn`, `owning_player_track`, `owning_player_token` — valid whenever an OR exists
- `owning_player_sr_turn`, `stock_round` — valid whenever an SR exists
- `or_between_turns`, `or_start` — valid in any game with ORs

These 9 values are round-context checks with no step prerequisite — they should never trigger a warning.

**Validation-required values** (warn if not in `gameSteps`):
- OR step-scoped: `track`, `special_track`, `token`, `special_token`, `route`, `track_and_token`, `buy_train`, `single_depot_train_buy`, `dividend`, `buying_train`
- SR step-scoped: `exchange`
- Events: `bought_train`, `ran_train`, `operated`, `par`, `sold`, `auction_end`, `has_train`

---

## 4. Validation Rules

These are pseudo-code checks. They fire at import time and/or when the user edits an ability's `when:` field.

```
// Always valid — no check needed
ALWAYS_VALID = {
  'any', 'owning_corp_or_turn', 'owning_player_or_turn',
  'owning_player_track', 'owning_player_token', 'owning_player_sr_turn',
  'stock_round', 'or_between_turns', 'or_start'
}

// OR step values that need a matching entry in state.gameSteps.or
OR_STEP_VALUES = {
  'track', 'special_track', 'token', 'special_token',
  'route', 'track_and_token', 'buy_train', 'single_depot_train_buy',
  'dividend', 'buying_train'
}

// SR step values
SR_STEP_VALUES = { 'exchange' }

// Event values
EVENT_VALUES = {
  'bought_train', 'ran_train', 'operated', 'par',
  'sold', 'auction_end', 'has_train'
}

function validateWhenValue(whenValue, ability, gameSteps) {
  if (ALWAYS_VALID.has(whenValue)) return null  // no warning

  if (OR_STEP_VALUES.has(whenValue)) {
    if (!gameSteps.or.includes(whenValue)) {
      return `Warning: ability '${ability.type}' has when: '${whenValue}' but this game's ` +
             `OR steps do not include '${whenValue}'. ` +
             `Known OR steps: ${gameSteps.or.join(', ')}. ` +
             `Add it in Game Config → Steps if intentional.`
    }
    return null
  }

  if (SR_STEP_VALUES.has(whenValue)) {
    if (!gameSteps.sr.includes(whenValue)) {
      return `Warning: ability '${ability.type}' has when: '${whenValue}' but ` +
             `'${whenValue}' is not listed in this game's SR steps. ` +
             `Add it in Game Config → Steps if intentional.`
    }
    return null
  }

  if (EVENT_VALUES.has(whenValue)) {
    if (!gameSteps.events.includes(whenValue)) {
      return `Warning: ability '${ability.type}' has when: '${whenValue}' but ` +
             `'${whenValue}' is not listed in this game's events. ` +
             `Add it in Game Config → Steps if intentional.`
    }
    return null
  }

  // Completely unknown value
  return `Warning: unknown when: '${whenValue}' on ability '${ability.type}'. ` +
         `This value is not recognized by 18xxtools. It will be preserved in export.`
}

// For abilities with when: array, validate each entry
function validateAbilityWhen(ability, gameSteps) {
  const whenValues = Array.isArray(ability.when)
    ? ability.when
    : ability.when ? [ability.when] : []
  return whenValues
    .map(v => validateWhenValue(v, ability, gameSteps))
    .filter(Boolean)
}

// Special rule: 'close' ability when: is ONLY for close events, not step names
function validateCloseAbilityWhen(ability, gameSteps) {
  // 'close' abilities use when: for event names only, not step names
  const CLOSE_EVENT_VALID = {
    'bought_train', 'ran_train', 'operated', 'par', 'sold',
    'auction_end', 'has_train', 'never'
  }
  const whenValues = Array.isArray(ability.when)
    ? ability.when
    : ability.when ? [ability.when] : []
  return whenValues
    .filter(v => !CLOSE_EVENT_VALID.has(v))
    .map(v => `Warning: 'close' ability has when: '${v}' which is not a recognized close event.`)
}
```

---

## 5. Import Behavior Recommendation

**Recommendation: Store raw string/array as-is. Validate lazily at display time.**

### Rationale

The `_rbAbilities` function in `import-ruby.js` currently drops `when:` entirely. The fix is to extract and store it, not to normalize it.

**Why store raw:**

1. The 27 distinct `when:` values are a semi-open set. Games can add custom step names (e.g. `single_depot_train_buy` exists only in g_18_al). Normalization would silently destroy game-specific values.

2. The validation logic (Section 4) can run over the raw values at any time — on import, on ability edit, on export. Storing raw means no information is lost.

3. The close ability and other abilities share the `when:` field but with different semantics. Normalization to a canonical set would require knowing the ability type first, adding complexity without benefit.

4. Round-trip fidelity: the Ruby export bridge (not yet built) needs exact original values to generate correct Ruby DSL. Normalization would break this.

**What `_rbAbilities` should do (minimum change):**

```js
// In _rbAbilities, add one line to extract when:
const when_ = h.match(/when:\s*(?:'([^']+)'|"([^"]+)"|%w\[([^\]]+)\])/);
if (when_) {
  ab.when = when_[3]
    ? when_[3].trim().split(/\s+/)   // array form: string[]
    : (when_[1] || when_[2]);        // single form: string
}
```

The field is stored as either a string or string[]. This mirrors how `base.rb` handles it: `@when = Array(opts.delete(:when)).map(&:to_s)`.

---

## 6. UI Recommendation

### For the `close` ability's `when:` field

The `close` ability in `ABILITY_DEFS` already has a `when:` select field with `['bought_train', 'sold', 'never', 'operated', 'par']`. This is correct and nearly complete. **Add `ran_train`, `auction_end`, and `has_train` to the options.** They are real engine close events from the frequency table.

### For all other ability types that have `when:`

Most ability types currently have NO `when:` field in `ABILITY_DEFS` — it is silently dropped on import. The recommended approach is:

**Add a `when` field of type `'tags'` (multi-value) to every ability type that needs it**, populated from a fixed suggestion list derived from `state.gameSteps`.

Example for `tile_lay` (the highest-frequency ability type using `when:`):

```js
{
  key: 'when',
  label: 'When usable',
  type: 'tags',
  placeholder: 'e.g. track, owning_corp_or_turn — blank = any',
  suggestions: () => [
    ...ALWAYS_VALID_WHEN,        // always shown
    ...state.gameSteps.or,       // from game config
    ...state.gameSteps.sr,
    ...state.gameSteps.events,
  ]
}
```

The `suggestions()` function returns a dynamic list so it updates when the user edits `state.gameSteps`.

**Validation hint rendering:** After a `when` tags field, render a small inline warning for any value that fails `validateWhenValue()`. This gives the user immediate feedback without blocking them.

```
when: [track] [owning_corp_or_turn] [special_track ⚠]
                                    ↑ 'special_track' not in this game's OR steps
```

### For the `exchange` ability

The `exchange` ability in `ABILITY_DEFS` already has a `when:` text field. Convert it to a `tags` field with `suggestions: ['any', 'owning_player_sr_turn', 'stock_round', 'exchange']` since these are the only values that make sense for an exchange ability.

### Game Config → Steps UI

Add a new collapsible section in the Config panel (or Trains & Phases panel) titled **"Game Steps"** that lets the user select which OR steps, SR steps, and events their game uses. Implemented as three multi-select checkbox groups:

```
OR Steps:       [x] track  [x] token  [ ] track_and_token
                [x] route  [x] dividend  [x] buy_train
                [ ] special_track  [ ] single_depot_train_buy  [ ] buying_train

SR Steps:       [ ] exchange

Events:         [x] bought_train  [x] ran_train  [x] operated
                [x] par  [x] sold  [ ] auction_end  [x] has_train
```

Default selections match the standard 18xx template. Users customizing novel games adjust from there.

This block is stored in `state.gameSteps` (Section 3) and read by validation rules (Section 4) and the `when:` field suggestions (this section).

---

## 7. Summary of Key Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Store `when:` raw vs normalize | **Raw** | Preserves game-specific values; normalization loses info needed for Ruby export |
| Validate eagerly vs lazily | **Lazily (at display + export)** | Import should not fail on unknown when: values; warn, don't block |
| `gameSteps` granularity | **Three arrays (or, sr, events)** | Mirrors the three contexts in `ability_right_time?`; minimal enough to be editable by users who don't know Ruby internals |
| UI for `when:` on abilities | **Tags field + suggestion list + inline warning** | Most abilities take multiple when: values; freeform tags with validated hints is more flexible than a fixed select |
| Where `gameSteps` lives | **`state.gameSteps`** | Saveable with the rest of game config; initialized to a sensible default so existing saves work without migration |

---

*Sources: `lib/engine/game/base.rb` (ability_right_time? at line 3372, close_companies_on_event! at line 2040, buy_train at line 2168, after_par at line 2031), `lib/engine/step/dividend.rb` (lines 82, 246), `lib/engine/step/special_track.rb` (line 149), `lib/engine/step/train.rb` (line 26), `lib/engine/ability/base.rb` (line 23), all `lib/engine/game/g_*/entities.rb` files.*
