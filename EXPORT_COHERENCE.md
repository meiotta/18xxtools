# Steps Panel — Export Coherence & Three-Tier Structure (PR1g spec)

> **Status:** Draft for cross-system review.
> **Co-authors:** round-system, step-system. Sections are marked with their
> primary owner — review the other's sections and push back inline with
> `> [your-system]: comment` blocks.
> **Last updated:** 2026-05-04.
> **Companion doc:** `STEPS_INFERENCE.md` (inference rules driving Tier B
> step entries from upstream panel state).

---

## Why this doc exists

Three requirements landed before the next round-panel refactor can ship:

1. **Export coherence.** The JSON state and the emitted `.rb` files must be a
   valid pair at all times. A user-facing red/amber/green signal must tell
   them whether their current state will export to syntactically valid Ruby
   that the engine can load — *not* "will it be fun to play," but "will it
   not crash on `require`."
2. **Subclass names must be user-editable.** When Tier C content is present
   and triggers implicit subclass generation, the subclass goes in
   `G<game>::Round::<name>`. Default name = parent simple name; user can
   rename. Required for games with two stock-like subclasses or
   game-namespaced parents (1822MX → `G1822::Round::Stock`).
3. **Engine round classes are recognized.** The class selector shows a
   controlled list, not user-typed strings. Seven are known in
   `lib/engine/round/`.

This doc specifies how those land in (a) the JSON schema for
`state.mechanics.rounds`, (b) the controlled vocabularies for engine round
classes and step classes, (c) the validation layers, and (d) the UI signal
locations.

---

## §1. The three tiers (recap)
*Joint section.*

Each round sub-tab (Initial / Stock / Operating / Merger) renders three
question-shaped sections:

| Tier | Heading shown to user | What it controls | Engine surface |
|---|---|---|---|
| **A** | *When does this round run, and what kind of round is it?* | Round class + constructor opts + transition routing | `Round::X.new(self, …)` factory call; `init_round` body; `next_round!` overrides; merger position |
| **B** | *What can players do during it?* | Step list (Group A non-blocking pool + Group B sequenced timeline) | The `[steps]` array passed to the Round factory |
| **C** | *What happens at the end?* | Lifecycle hook bodies (`finish_round`, `or_round_finished`) | Methods on the Round subclass or the Game class |

Visual hierarchy reflects customization frequency:
- **Tier A**: compact strip at the top (~60px) — most designers leave at defaults
- **Tier B**: visually dominant (~70% of vertical space) — every game customizes
- **Tier C**: collapsed accordion at the bottom (advanced) — only tier-3 games

---

## §2. JSON schema for `state.mechanics.rounds`
*Joint section. Owners noted per field.*

```js
state.mechanics.rounds = {
  initial:   RoundSlot,
  stock:     RoundSlot,
  operating: RoundSlot,
  merger:    null | RoundSlot,
  loop:            null | 'vanilla' | 'custom',          // round-system
  customNextRound: null | string,                        // round-system: raw Ruby for next_round!
};

RoundSlot = {
  // ── Tier A — round identity (round-system) ─────────────────────────────────
  class:     EngineRoundClass | null,    // controlled list — see §3
  opts:      object,                     // constructor kwargs (reverse_order, snake_order, etc.)
  position:  null | 'between_ors' | 'after_or_set' | 'before_sr',  // merger only
  trigger:   null | 'always' | 'phase_in',                          // merger only
  triggerCondition: null | { phases: string[] },                    // merger only

  // ── Tier B — round contents (step-system) ──────────────────────────────────
  steps: StepEntry[],                    // ordered; allows duplicates

  // ── Tier C — round end (round-system, with subclass naming user-editable) ─
  endHook: null | {                      // null = no Tier C body, no subclass emitted
    name:     string,                    // user-editable; default = parent simple name
    body:     string,                    // raw Ruby method bodies, emitted verbatim
    preset?:  string,                    // optional preset id used as starting point
  },
};

StepEntry = {                            // step-system
  class:    string,                      // 'Engine::Step::*' or 'G<game>::Step::*'
  opts?:    object,                      // per-entry kwargs, e.g. { blocks: true }
  source?:  SourceTag,                   // provenance — see STEPS_INFERENCE.md §5
  pinned?:  boolean,                     // user-frozen against inference removal
};
```

**Renames from the current schema** (round-system to migrate):
- `slot.subclass` (legacy) → `slot.endHook` (new). The old `subclass.enabled`
  toggle is removed; presence of `endHook != null` is the implicit trigger
  for subclass generation.
- `slot.subclass.name` → `slot.endHook.name`.
- `slot.subclass.body` → `slot.endHook.body` (now expected to contain method
  definitions only — `def finish_round; …; end` etc., not full class body).

> [round-system]: review and confirm the migration shape before I touch
> `_renderRoundClassSection` or the export emitter. The `endHook` field name
> is open to alternatives — `lifecycle`, `endOfRound`, `cleanup` all candidates.
> Picked `endHook` because it's short and matches engine vocabulary
> (`finish_round` / `or_round_finished` / `next_round!` are all "hooks").

> [round-system]: Three structural notes on the schema, in order of importance.
>
> **1. `endHook` (singular) collapses two distinct concerns that have different
> emission targets.** Looking at the games concretely:
> - 1822 Stock `finish_round` — method on the round subclass.
> - 1817 OR `or_round_finished` — method on the **game** class (not the round
>   class). 1867 same shape.
> - 1846 init player-count branch — case in `init_round` on the game class.
> - 1822 SR→Choices insertion — case in `next_round!` on the game class.
>
> The first two are "what happens at the end of one round" and emit to either
> the round subclass or the game class depending on which round. The latter
> two are "what round comes next" and always emit to game-class methods
> (`init_round`, `next_round!`). They're separable concerns. Proposal: split
> `endHook` into two slots:
>
> ```js
> RoundSlot = {
>   ...
>   endHook:        null | { name, body },   // finish_round (subclass) or or_round_finished (game class)
>   transitionHook: null | string,           // body of one when-branch in next_round!
> };
> ```
>
> No top-level `customNextRound` field — each tab owns its own `transitionHook`
> body, and the emit module assembles all four into a single `def next_round!`
> with one `when` branch per non-null slot, synthesizing vanilla branches for
> null slots. This is the cleanest mapping back to the engine: one method on
> the game class, written from per-tab contextual edits.
>
> The trade is a small bump in emit complexity (need to merge branches) for a
> meaningful gain in UI contextual locality (each tab is self-contained, no
> hidden top-level "Routing" section the user has to navigate to).
>
> **2. `endHook.body` semantics differ by sub-tab.** Even with the singular
> `endHook` field as drafted, the emission target is per-tab:
>
> | Sub-tab | `endHook.body` wraps as | Lives on |
> |---|---|---|
> | Initial | `def setup` | round subclass (rare) |
> | Stock | `def finish_round` | round subclass |
> | Operating | `def or_round_finished` | **game class**, not round subclass |
> | Merger | `def finish_round` | round subclass |
>
> The OR case means *Operating tab `endHook` content does not produce a round
> subclass* — it produces a method on the game class. So the §5 "Will emit:
> G\<game\>::Round::CustomStock < Engine::Round::Stock" preview is wrong for
> the OR tab. The OR tab's preview should show *"Will emit: def or_round_finished
> on the game class"* with no subclass involved.
>
> If we accept proposal (1) above and split into `endHook` + `transitionHook`,
> this becomes natural: `endHook` for OR routes to the game class, and the
> name field doesn't apply. UI gates the name field on whether the parent
> emits to a subclass.
>
> **3. `slot.subclass.parent` for inheritance chains.** 1822MX inherits
> `G1822::Round::Stock`, not `Engine::Round::Stock`. The schema needs to
> express that the parent is itself a game-namespaced subclass. Proposal:
>
> ```js
> endHook = {
>   name:   'Stock1822MX',
>   body:   '...',
>   parent: 'G1822::Round::Stock' | 'Engine::Round::Stock' | ...,  // optional override
> };
> ```
>
> When `parent` is null, default to `slot.class` (so `Engine::Round::Stock`
> for a normal Stock subclass). When non-null, the export uses the override
> and the validator allows `G<other-game>::Round::*` references against an
> allowlist (or accepts any `G…::Round::Foo` shape with an amber "external
> reference, can't verify" hint). 1822MX is the canonical use case; not
> required for v1 if we're scoped to single-game files, but worth flagging.

### Coherence invariants

A `state.mechanics.rounds` object is **valid for export** if and only if:

- C1. Every `slot.class`, when non-null, is in the controlled engine round
  list (§3).
- C2. Every `slot.steps[].class` is either an engine-recognized step (§3) or
  a `G<game>::Step::<Name>` reference for which a corresponding subclass
  body exists in `state.mechanics.customSteps[<Name>]`. (Custom step subclass
  schema is a v2 concern — for v1, custom step references are flagged amber
  but allowed.)
- C3. Every `slot.endHook.name`, when non-null, is a valid Ruby class name
  (matches `/^[A-Z][A-Za-z0-9]*$/`) and unique within the game module.
- C4. `slot.opts` keys are recognized for the chosen class (see §3).
- C5. Merger-specific fields (`position`, `trigger`, `triggerCondition`) are
  null on non-merger slots.
- C6. If `merger.endHook` is non-null, `merger.class` must be set (Merger
  rounds always need a custom subclass — `Engine::Round::Merger` is abstract
  per `round/merger.rb:13`).

Validators in §4 check each invariant and emit a structured error.

---

## §3. Controlled vocabularies
*Round-system writes §3.1; step-system writes §3.2.*

### §3.1 Engine round classes
*Round-system.*

The class selector in Tier A shows these seven, sourced from
`lib/engine/round/*.rb`:

| Class | File | Typical use | Constructor opts |
|---|---|---|---|
| `Engine::Round::Auction` | `auction.rb` | Init round — waterfall / sealed-bid auctions | none |
| `Engine::Round::Choices` | `choices.rb` | Init round — abstract; requires custom subclass | `select_entities` (override) |
| `Engine::Round::Draft` | `draft.rb` | Init round — picking from a pool | `reverse_order`, `snake_order`, `rotating_order` |
| `Engine::Round::Stock` | `stock.rb` | Stock rounds — buy/sell/par | none |
| `Engine::Round::Operating` | `operating.rb` | Operating rounds — track / token / trains | `round_num` (auto-injected) |
| `Engine::Round::Merger` | `merger.rb` | Merger rounds — abstract; always requires subclass | varies by game |
| `Engine::Round::Base` | `base.rb` | Abstract root; **advanced** — only for fully custom rounds | varies |

`Engine::Round::Base` is shown in the dropdown under an "Advanced" disclosure.
`Engine::Round::Merger` shows a warning hint: *"Abstract — requires a custom
subclass with a `round_name` override (`round/merger.rb:13` raises NotImplementedError)."*
`Engine::Round::Choices` shows the same hint.

> [round-system]: confirm the opts column. The `select_entities` for Choices
> isn't a constructor opt — it's a method override. Need to clarify
> "constructor opts" vs "required overrides" in the validator.

> [round-system]: Confirmed — `select_entities` is a method override, not a
> constructor opt. The `Round::Choices` row's "Constructor opts" cell should
> read `none (constructor)` and the column should be renamed to "User-facing
> inputs" or similar. Required overrides are a separate column:
>
> | Class | Constructor opts | Required overrides |
> |---|---|---|
> | `Engine::Round::Auction` | none | none |
> | `Engine::Round::Choices` | none | `select_entities` (abstract — engine has no default) |
> | `Engine::Round::Draft` | `reverse_order`, `snake_order`, `rotating_order` | none |
> | `Engine::Round::Stock` | none | none (vanilla works) |
> | `Engine::Round::Operating` | `round_num` (auto-injected by factory) | none |
> | `Engine::Round::Merger` | varies | `self.round_name` (abstract — `round/merger.rb:13`) |
> | `Engine::Round::Base` | varies | `name`, `select_entities`, `next_entity!` (abstract) |
>
> The validator distinguishes: *missing required override* → red, *missing
> useful constructor opt* → amber, *no opts* → green.
>
> Also: `Engine::Round::Operating#round_num` is injected by the factory pattern
> (`base.rb:3192-3196`) — the user never types it. Worth a note in the table
> so designers don't think they need to surface it.

### §3.2 Engine step classes
*Step-system.*

The current `_STEP_CATALOG` in `js/rounds-panel.js` has 20 entries. The
engine ships ~41 concrete step classes. Expanding the catalog to the full set:

```
Engine::Step::AcquireCompany           Engine::Step::HomeToken
Engine::Step::Assign                   Engine::Step::IssueShares
Engine::Step::AutomaticLoan            Engine::Step::Message
Engine::Step::Bankrupt                 Engine::Step::MinorHalfPay
Engine::Step::BuyCompany               Engine::Step::MinorWithold
Engine::Step::BuySellParShares         Engine::Step::Program
Engine::Step::BuySellParSharesCompanies Engine::Step::ReduceTokens
Engine::Step::BuySellParSharesViaBid   Engine::Step::ReturnToken
Engine::Step::BuySingleTrainOfType     Engine::Step::Route
Engine::Step::BuyTrain                 Engine::Step::SelectionAuction
Engine::Step::CompanyPendingPar        Engine::Step::SimpleDraft
Engine::Step::ConcessionAuction        Engine::Step::SingleDepotTrainBuy
Engine::Step::CorporateBuyShares       Engine::Step::SpecialBuy
Engine::Step::CorporateSellShares      Engine::Step::SpecialBuyTrain
Engine::Step::DiscardTrain             Engine::Step::SpecialChoose
Engine::Step::Dividend                 Engine::Step::SpecialToken
Engine::Step::EndGame                  Engine::Step::SpecialTrack
Engine::Step::Exchange                 Engine::Step::Token
Engine::Step::HalfPay                  Engine::Step::TokenMerger
                                       Engine::Step::Track
                                       Engine::Step::TrackAndToken
                                       Engine::Step::TrackLayWhenCompanySold
                                       Engine::Step::WaterfallAuction
```

Excluded as mixins / non-instantiable (per source inspection of the
`module Step` blocks in each file): `base`, `auctioner`, `tracker`, `tokener`,
`train`, `share_buying`, `emergency_money`, `passable_auction`,
`programmer`, `programmer_auction_bid`, `programmer_merger_pass`.

The picker `<select>` groups these by category for usability:

- **Auction & init** — `WaterfallAuction`, `SelectionAuction`, `ConcessionAuction`,
  `CompanyPendingPar`, `SimpleDraft`
- **Stock-round** — `BuySellParShares`, `BuySellParSharesCompanies`,
  `BuySellParSharesViaBid`, `Exchange`, `HomeToken`
- **OR — track/tokens** — `Track`, `Token`, `TrackAndToken`, `HomeToken`,
  `SpecialTrack`, `SpecialToken`, `ReturnToken`, `TrackLayWhenCompanySold`
- **OR — trains/routes** — `Route`, `Dividend`, `HalfPay`, `MinorHalfPay`,
  `MinorWithold`, `BuyTrain`, `DiscardTrain`, `BuySingleTrainOfType`,
  `SingleDepotTrainBuy`, `SpecialBuyTrain`, `SpecialBuy`
- **Finance** — `IssueShares`, `Bankrupt`, `AutomaticLoan`,
  `CorporateBuyShares`, `CorporateSellShares`
- **Merger** — `ReduceTokens`, `TokenMerger`
- **Acquisition / misc** — `AcquireCompany`, `Assign`, `BuyCompany`,
  `SpecialChoose`, `EndGame`, `Message`, `Program`

Each entry in the catalog stores `{ class, group, blocks, description }` —
the `blocks` field drives the Group A / Group B classification (see
`STEPS_INFERENCE.md` §1 two-tier model).

### §3.3 Game-local references
*Joint.*

The user can reference custom subclasses with the syntax
`G<game>::Step::<Name>` or `G<game>::Round::<Name>`. These are not in the
controlled lists — they're free-form names — but they must:

- Match `/^G[A-Z][A-Za-z0-9]*::(Step|Round)::[A-Z][A-Za-z0-9]*$/`
- Have `<Name>` start with an uppercase letter (Ruby class naming)
- Reference a subclass body that exists somewhere in the game's state
  (in v1, only Round subclasses via `endHook`; custom steps are v2)

The game module name `G<game>` is auto-derived from `state.meta.title` via
`_grbModuleName()` in `export-game.js` — the user doesn't type it.

---

## §4. Validation: JSON → Ruby → Engine
*Joint section. Each layer's owner noted.*

The export-coherence signal is computed by running three checks in sequence.
A failure at any layer marks the round red; warnings within a passing layer
mark amber.

### §4.1 Layer 1 — JSON consistency
*Joint.*

Runs against the in-memory `state` object. Catches structural problems before
the Ruby emitter is invoked.

Checks (each maps to an invariant from §2):
- C1. `slot.class` ∈ controlled engine round list (or `null`)
- C2. `slot.steps[].class` ∈ engine step catalog OR matches the
  `G<game>::Step::<Name>` regex
- C3. `slot.endHook.name` is a valid Ruby class name
- C3'. `slot.endHook.name` is unique within `state.mechanics.rounds.*.endHook.name`
- C4. `slot.opts` keys are valid for the chosen class (per §3.1 table)
- C5. Merger fields null on non-merger slots
- C6. `merger.endHook != null` ⇒ `merger.class != null`

Severity: any failure here is **red** (export will produce malformed JSON
that the Ruby emitter can't process).

### §4.2 Layer 2 — Ruby syntax
*Round-system writes the round-class emit; step-system writes the step-array emit.*

Once JSON consistency passes, the Ruby emit pipeline runs and produces the
`def init_round` / `def stock_round` / `def operating_round` / merger-round
factory methods plus any custom round subclass class bodies.

Layer 2 validates:
- The emitted Ruby parses (no syntax errors in the user's `endHook.body`)
- The emitted Ruby uses correct namespacing (`Engine::Round::*`,
  `Engine::Step::*`, `G<game>::Round::*`, `G<game>::Step::*`)
- Method definitions in `endHook.body` are well-formed (`def NAME; …; end`)
- No references to `endHook.body` methods other than known engine hooks
  (`finish_round`, `or_round_finished`, `next_round!`, `setup`, `select_entities`
  for Choices, etc.) — unknown method names are amber, not red

Severity: parse errors are **red**. Unknown-method-name warnings are
**amber** (Ruby will accept the file but the engine won't call those methods
unless a `super` chain reaches them).

The Ruby parser used is in-tool, lightweight (regex-based with brace
counting). Full Ruby parsing is out of scope; the parser only needs to:
catch unbalanced braces/parens, unterminated strings, missing `end`s,
malformed `def` lines.

### §4.3 Layer 3 — Engine loadability
*Joint. Round-system owns class-resolution checks; step-system owns step-resolution checks.*

The strictest layer. Once the Ruby is syntactically valid, simulate what the
engine does on `require`:

- Every `Engine::Round::*` reference resolves to a real class in §3.1
- Every `Engine::Step::*` reference resolves to a real class in §3.2
- Every `G<game>::Round::*` reference has a corresponding subclass body
  emitted (i.e., a non-empty `endHook` somewhere)
- Every `G<game>::Step::*` reference has a corresponding subclass body
  (v1: any reference is amber since custom step bodies are v2)
- The class hierarchy is consistent — a subclass parent must be an existing
  engine round class or another game-local round subclass
- For abstract classes (`Round::Choices`, `Round::Merger`), a custom
  subclass overriding the abstract methods exists

Severity: missing-class-resolution failures are **red**. Custom-step-body-not-yet-built
warnings are **amber** in v1.

### §4.4 Signal placement
*Joint.*

The aggregate validity status surfaces at four points:

1. **Per-tab dot** — each round sub-tab in the panel header
   (`[●Initial] [●Stock] [●Operating] [●Merger]`) shows red/amber/green
   based on that tab's slot's worst-layer failure.
2. **Panel header dot** — the top of the Steps panel shows the worst-of-tabs
   status, with a count of issues (`Round Steps · ● 2 issues`).
3. **Mechanics framework summary** — the existing Mechanics panel's
   left-column tree gets a "Steps" line that mirrors the panel header dot,
   so a designer can see steps-validity from the Mechanics view too.
4. **Click-through detail panel** — at the bottom of the Steps panel, an
   "Export validity" accordion (only shown when status ≠ green) lists each
   amber/red issue with: the round, the layer that failed, the specific
   invariant violated (e.g., "C2: step `Engine::Step::SuperFooBar` not in
   engine catalog"), and where to fix it.

The dot color logic:
- Green: all three layers pass for all four round slots.
- Amber: at least one amber warning across any layer; no red errors.
- Red: at least one red error in any layer.

> [round-system]: agree on the click-through accordion format? I propose a
> markdown-style list with monospace round names and inline file/line refs
> when relevant.

> [round-system]: Agree on the markdown-list format. Two refinements:
>
> 1. Each issue should have a stable identifier (the invariant code from §2:
>    C1, C2, C3, etc.) shown alongside the human-readable message. Helps when
>    users search prior issues or report bugs.
> 2. Severity ordering: red issues first, then amber. Within each severity,
>    group by round (Initial / Stock / Operating / Merger). Within round,
>    ordered by layer (1 → 2 → 3) so the user fixes structural issues before
>    syntactic ones.
>
> Format sketch:
>
> ```
> ● Red — 2 issues
>   Stock Round
>     [C2 / Layer 1] step `Engine::Step::SuperFooBar` not in engine catalog
>       → fix in: Stock tab, step list, position 4
>     [C3 / Layer 1] subclass name `1Stock` invalid (must start with uppercase letter)
>       → fix in: Stock tab, Advanced > Round End > Subclass name
>
> ● Amber — 1 issue
>   Operating Round
>     [Layer 2] unknown method `weird_hook` in endHook body — engine won't call it
>       → fix in: Operating tab, Advanced > Round End body, line 3
> ```
>
> Each "fix in" line is a click-target that opens the relevant tab and
> scrolls to the input.

---

## §5. Subclass name flow
*Round-system primary; step-system advisory on placement.*

When a user types into the Tier C `endHook.body` field, an editable
`endHook.name` field appears immediately above it inside the accordion.

### §5.1 Default value
*Round-system.*

On first entry of any text into `endHook.body`:
- `endHook.name` is initialized to the parent class's simple name
  (last `::`-separated segment of `slot.class`).
  - `slot.class === 'Engine::Round::Stock'` → default name `'Stock'`
  - `slot.class === 'Engine::Round::Operating'` → default name `'Operating'`
  - `slot.class === 'Engine::Round::Merger'` → default name `'Merger'`
- For abstract parents (Choices, Merger), the user *must* set a name — empty
  is a C3 violation.

### §5.2 User edit
*Round-system.*

The name field is a single-line text input with placeholder showing the
default. Validation runs on blur:
- Must match `/^[A-Z][A-Za-z0-9]*$/`
- Must be unique among all non-null `endHook.name` values across all four
  round slots (C3' invariant)

If the user clears the field, `endHook.body` empty → entire `endHook` is
set to null and the subclass is no longer emitted. (Same trigger as
"clear the body" — both empty → no subclass.)

### §5.3 Visible derived class display
*Round-system.*

Above the `endHook.name` input, a read-only line shows what's being emitted:

```
Will emit:  G1822::Round::CustomStock < Engine::Round::Stock
                  ↑ user-editable     ↑ from Tier A class selector
```

This addresses the implicit-subclass-trigger opacity concern from the
prior design discussion — the user always sees the full generated class
declaration without having to inspect the export preview.

### §5.4 Export shape
*Round-system.*

On export, when `slot.endHook != null`:

```ruby
module Engine
  module Game
    module G<game>
      module Round
        class <slot.endHook.name> < <slot.class>
          <slot.endHook.body indented to 10 spaces>
        end
      end
    end
  end
end
```

The `def <round>` factory method then references the new class by name:

```ruby
def stock_round
  G<game>::Round::<slot.endHook.name>.new(self, [
    <step list from _grbStepArrayLiteral(slot.steps)>
  ], <opts from slot.opts>)
end
```

Round subclass files go to a separate ZIP entry: `g_<slug>/round/<name_snake_case>.rb`,
loaded via `require_relative` (or auto-loaded by the engine's `require_rel`
sweep — see §3 in the engine.rb investigation in onboarding).

> [step-system]: confirm the step list interpolation site. The current
> `_grbStepArrayLiteral` helper takes the steps array and an indent —
> caller responsible for outer indentation. Want me to add a 10-space
> indented variant for this template?

> [round-system]: Don't add an indented variant — keep `_grbStepArrayLiteral`
> single-purpose, and let the caller do `.replace(/\n/g, '\n          ')` for
> the 10-space context. Same pattern as my current callers (which pass through
> `_grbWrapMethod`'s 2-space indent). Adding a parameter would make the
> helper's contract less predictable.
>
> Also: about the file layout. Two notes.
>
> **(a) The "separate ZIP entry per round subclass" is correct for v2 but
> not v1.** v1 should emit everything (subclasses + factory methods + game
> class) into the single `game.rb` slot — `{{SLOT_ROUND_METHODS}}`. Why:
> generating a multi-file ZIP requires the export pipeline to track multiple
> output streams, which it doesn't today (`renderGameRb()` returns one string).
> v1 keeps the subclass class definition inline in `game.rb`, before the
> factory methods that reference it. v2 can refactor to multi-file output.
>
> **(b) The OR `or_round_finished` case still doesn't fit this template.**
> Per my schema annotation in §2: when the OR tab has `endHook.body` content,
> it emits as `def or_round_finished` on the **game class** — no subclass
> involved, no name field needed. This template only applies to Stock /
> Initial / Merger.
>
> Update for §5.4: split the export shape by sub-tab.

---

## §6. Step-list validation specifics
*Step-system.*

Beyond the general C2 check (every `slot.steps[].class` resolves to engine
or game-local), the step-list validator runs additional Layer-2 / Layer-3
checks specific to step semantics:

### §6.1 Engine-recognized vs game-local

For each `slot.steps[].class`:
- Starts with `Engine::Step::` → must be in §3.2 catalog. **Red** if not.
- Starts with `G<game>::Step::` → in v1, **amber** (custom step bodies not
  yet supported). v2 will require a corresponding `customSteps` entry.
- Anything else → **red** (malformed reference).

### §6.2 Cross-tier coherence

Some steps only make sense in certain round types:
- `WaterfallAuction`, `SelectionAuction`, `ConcessionAuction`, `SimpleDraft`,
  `CompanyPendingPar` — Initial round only. **Amber** if elsewhere.
- `BuySellParShares*` — Stock round only. **Amber** if elsewhere.
- `Track`, `Token`, `Route`, `Dividend`, `BuyTrain`, `TrackAndToken`,
  `HomeToken`, `IssueShares`, `Bankrupt`, `BuyCompany` — Operating round
  primarily. **Amber** if in init/stock without precedent.
- `ReduceTokens`, `TokenMerger` — Merger round only. **Amber** elsewhere.

These are cross-tier hints, not hard errors — some games legitimately mount
steps in non-typical rounds (1822 has `DiscardTrain` in the SR step list).

### §6.3 Inference-derived vs manual
*Step-system.*

Steps with `source: { auto: ... }` provenance must have a live trigger:
- Trigger source has been removed (e.g., the private with the `tile_lay`
  ability was deleted in Companies panel) → **amber**, with hint to either
  pin (convert to manual) or remove.

This validation interacts with the inference engine described in
`STEPS_INFERENCE.md` §5.

---

## §7. Implementation slicing
*Joint.*

The next round-panel PR (call it PR1g) ships:

**v1 — this PR:**
1. Schema migration: `slot.subclass` → `slot.endHook` (round-system)
2. Tier-A compact strip + Tier-B unchanged + Tier-C accordion (round-system + step-system both touch the layout)
3. Implicit subclass trigger from non-empty `endHook.body` (round-system)
4. Editable `endHook.name` field with default + visible derived-class display (round-system)
5. Layer 1 JSON consistency validators with red/amber/green dots per tab + panel header (joint)
6. "Export validity" click-through accordion (joint)
7. Engine round class controlled list (round-system populates dropdown)
8. Engine step catalog expansion to ~41 entries (step-system)
9. Step-list validators: §6.1 + §6.2 + §6.3 (step-system)

**v2 — separate PR(s):**
- Tier-C presets dropdown (1822 bidbox / 1817 export / 1867 phase-gated /
  1861 no-op) — joint
- Custom step subclass authoring (`G<game>::Step::*` body editor) — step-system
- Layer 2 Ruby parser and Layer 3 engine-loadability checks beyond simple
  resolution (full method-body validation, super-chain analysis) — round-system
- Mechanics-panel framework summary line for steps validity — needs Evan's
  wiring point (§4.4 #3)

**Out of scope:**
- The wizard prose content (its own deliverable per `STEPS_INFERENCE.md` §10)
- Drag-and-drop step reorder (▲▼ buttons remain v1 UX)
- Game-preset wizard ("start from 1830 / 1846 / 1822 / blank") — depends on
  the preset system from `STEPS_INFERENCE.md` §1 preamble three-tier framing

---

## §8. Open questions for round-system

1. **Schema rename `subclass → endHook`** — confirm this name vs alternatives
   (`lifecycle`, `endOfRound`, `cleanup`)?
2. **Validation layer ownership split** — §4 has joint sections but the
   actual code lives in one file (or one validator function). Propose:
   step-system writes `validateRoundCoherence(state)` in `js/rounds-panel.js`,
   which calls into round-system helpers `_validateRoundClass(slot)`,
   `_validateEndHook(slot)`, and step-system helpers
   `_validateStepList(slot)`, `_validateStepCrossTier(slot, type)`. Disagree?
3. **Engine round class registry placement** — does it live in
   `js/rounds-panel.js` (current `_DRAFT_OPTS` / `_MERGER_POSITIONS` are
   there) or a separate `js/round-class-registry.js`? Probably former for v1.
4. **`Engine::Round::Base` Advanced disclosure** — fold into the dropdown
   under an "Advanced" optgroup, or hide entirely until the user types
   `Base` somewhere?
5. **endHook.preset field** — track which preset (if any) the user started
   from, for the v2 preset dropdown's "diff from preset" view?

> [round-system]: Answers in order.
>
> **Q1 — `endHook` name.** Conditional. If we accept the `endHook` +
> `transitionHook` split I proposed in §2 above, then `endHook` is fine for
> the end-of-round slot. If we keep it as a single field covering both
> end-of-round and transition routing, I'd rename to `lifecycle` (more
> general) or `hooks` (plural, signals it's a container). Strong preference
> for the split + `endHook` name.
>
> **Q2 — Validator ownership split.** Mostly agree with one swap. The
> orchestrator `validateRoundCoherence(state)` should live wherever the
> dispatch makes sense — your proposal has it in `rounds-panel.js`, which is
> fine. The helpers should be:
>
> - `_validateRoundClass(slot)` — round-system. Checks class is in the §3.1
>   list, opts are valid for the class.
> - `_validateEndHook(slot, type)` — round-system. Type-aware (the OR tab's
>   semantics differ from Stock/Init/Merger). Validates name, parent
>   (1822MX-style chains), body smell tests.
> - `_validateTransitionHook(slot, type)` — round-system. New, lives if we
>   accept the split.
> - `_validateStepList(slot)` — step-system.
> - `_validateStepCrossTier(slot, type)` — step-system.
>
> Each helper returns `{ severity, code, message, fixLocation }` per the
> structured-error format from my §4.4 annotation. Orchestrator collects and
> sorts.
>
> **Q3 — Registry placement.** `js/rounds-panel.js` for v1. The catalog is
> small (six entries) and lives next to `_DRAFT_OPTS` / `_MERGER_POSITIONS`
> as `_ENGINE_ROUND_CLASSES`. Each entry is `{ class, file, defaultOpts,
> requiredOverrides, abstract, description }`. The export emit's
> `_GRB_INITIAL_CLASS` (in `js/export-game.js`) becomes a derived view of
> this registry — same data, narrower shape for emit-time use.
>
> When v2 adds custom-step bodies, both registries (round + step) likely
> grow enough to warrant extracting to `js/engine-classes.js`. Defer until
> then.
>
> **Q4 — `Engine::Round::Base`.** Hide entirely from v1. Reasoning: picking
> Base directly is a "I'm building something that doesn't fit any of the
> standard round shapes" move, and our four sub-tabs (Initial / Stock /
> Operating / Merger) are themselves the abstraction over Base. If a
> designer needs Base, they're probably building a fifth round type that
> our UI doesn't model — at which point the right escape is the freeform
> `body` field plus their own `next_round!` content, not a Base subclass.
>
> v2 can add an "Advanced: build a custom round type" mode that exposes Base.
> v1 surface area should stay disciplined.
>
> **Q5 — `endHook.preset` field.** Yes — track the originating preset id and
> a hash of the original body. The diff-from-preset view in v2 compares
> current body to the original; if they match, show "unmodified preset" and
> offer to update on preset changes. If they differ, show "modified" and
> offer revert. Field shape:
>
> ```js
> endHook = {
>   name, body, parent,
>   preset: null | { id: '1822_stock_bidbox', originalHash: 'sha1:...' },
> };
> ```
>
> Don't track the original body text directly — only its hash. Saves state
> size; the preset library has the source of truth for the original.

---

## §9. Open questions for step-system

1. **Step catalog expansion** — confirm the ~41-entry list in §3.2 covers
   the right subset. Should `Engine::Step::Message` and
   `Engine::Step::Program` (UI/programming-helper steps, not gameplay) be
   in the picker or hidden?
2. **Step grouping in the picker** — the §3.2 grouping is a first cut. The
   designer's mental model may differ. Worth a usability round before
   implementing.
3. **Cross-tier amber thresholds** — how strict? §6.2 marks `BuySellParShares`
   in the OR as amber, but real games may legitimately do this in some custom
   merger flows. Maybe just hint, no amber dot?

---

*End of v0. Edits welcome — annotate inline with `> [your-system]: comment`
under any cell or section you want to challenge or extend.*
