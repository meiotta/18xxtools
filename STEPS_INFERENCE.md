# Steps Panel — Inference-Driven Design (v0)

> **Status:** Draft for cross-panel review. Do not implement yet.
> **Owner:** Addy (steps).
> **Co-authors needed:** Jenny (abilities), Farrah (phases / events), Tim (round classes), Evan (mechanics flags).
> **Last updated:** 2026-05-03.

---

## Why this doc exists

The first cut of the Steps panel exposed engine class names (`Engine::Step::WaterfallAuction`, etc.) as a flat picker, with a bare ordered list and disabled buttons. Anthony pushed back: a designer building a game does not think *"I want `Engine::Step::HomeToken` in my OR step array."* They think *"I have a corporation with no fixed home location, and the game needs to know what to do when it floats."*

The realization: **most of the operating-round / stock-round / init-round step list should be derived from the rest of the game's design**, not picked manually. The user configures their companies (Jenny), their phases (Farrah), their game-end rules (Evan) — and the steps panel reflects what those choices imply.

This document is the spec for that inference, the cross-panel feedback contract, and the override surface.

> Tim: Worth surfacing a three-tier framing in §2's preamble so users picking
> a 1822 or 1828 don't expect the inference to "figure it out from concessions":
>
> 1. **Vanilla.** Base.rb default. No inference needed.
> 2. **Single-step swaps inside a vanilla round structure.** The clean slice
>    the inference handles — most of §2's table.
> 3. **Different-shape games** (1822 bidbox-in-SR, 1846 draft loop, 1828 cert
>    selection, 1817 merger+acquisition, variant starting packets). These need
>    *presets* that pre-populate `state.mechanics.rounds.*` to a known-good
>    shape. The inference engine handles only deltas from the preset.
>
> Open question: do we ship a preset system before, alongside, or after the
> inference engine? My weak preference is *alongside* — presets ground the
> deltas the inference is computing. Without presets, users hit tier (3) and
> the panel can't do anything sensible from the trigger predicates alone.

---

## 1. The two-tier model

Inside one round's step array, every step falls into one of two groups (verified against `lib/engine/step/base.rb` + the step's `blocks?` method):

### Group A — "Available throughout the turn" (non-blocking)
- `blocks? == false`
- Contributes an action to the player's UI but does *not* gate round progression.
- Order *within* this group is cosmetic — the engine doesn't care.
- Examples: `Bankrupt`, `Exchange`, `SpecialTrack`, `SpecialToken`, the early `BuyCompany`, `DiscardTrain`.

### Group B — "In sequence" (blocking)
- `blocks? == true`
- The round walks them top-to-bottom and stops at each one until the player resolves it (via the matching action or `pass`).
- Order *within* this group **is the play timeline**. Reordering changes when things happen.
- Examples (1830 OR): `HomeToken` (if pending) → `Track` → `Token` → `Route` → `Dividend` → `DiscardTrain` → `BuyTrain` → `[BuyCompany, {blocks: true}]`.

The panel UI must visually distinguish these two groups. Reorder controls only make sense in Group B.

---

## 2. The inference rules table

This is the v0 mapping. Every entry must be reviewed by the upstream panel's owner before it ships.

| # | Trigger (state predicate)                                                                | Inferred entry                                                  | Group | Round    | Owner of trigger | Notes |
|---|------------------------------------------------------------------------------------------|-----------------------------------------------------------------|-------|----------|------------------|-------|
| 1 | `state.mechanics.bankruptcyAllowed === true`                                             | `Engine::Step::Bankrupt`                                        | A     | OR       | Evan             | Already a mechanics toggle; canonical. |
| 2 | `state.privates[].abilities[].type === 'tile_lay'` (any private)                          | `Engine::Step::SpecialTrack`                                    | A     | OR + SR  | Jenny            | Also fires for `teleport` ability per `step/special_track.rb:158`. |
| 3 | `state.privates[].abilities[].type === 'token'` (any private)                             | `Engine::Step::SpecialToken`                                    | A     | OR       | Jenny            | |
| 4 | `state.privates[].abilities[].type === 'exchange'` (any private)                          | `Engine::Step::Exchange`                                        | A     | OR + SR  | Jenny            | Both rounds: `step/exchange.rb` is mounted in both 1830's OR and SR step lists. |
| 5 | Any corp/minor with `coordinates` empty/null OR with multiple `home_token_locations`     | `Engine::Step::HomeToken`                                       | B     | OR       | Jenny            | See §3 below for the second case (reserved-tile deferred placement). |
| 6 | Any reserved hex on the map AND owning corp has `coordinates` set to it                   | `Engine::Step::HomeToken`                                       | B     | OR       | Max (map) + Jenny | Also queues `pending_tokens` per `base.rb:1685`. |
| 7 | Any phase has `status: ['can_buy_companies']` OR `'can_buy_companies_from_other_players'`| `Engine::Step::BuyCompany` (early, non-blocking)                | A     | OR       | Farrah           | The trailing `[BuyCompany, {blocks:true}]` is separate — see §4. |
| 8 | `state.mechanics.orSteps.issueShares === true` (or replacement flag once migrated)        | `Engine::Step::IssueShares`                                     | A     | OR       | Evan             | Used by 18Chesapeake, 1846, 1817. |

> [Evan]: `orSteps.*` are permanent source-of-truth — do not migrate the data into `rounds.<type>.steps`. The rounds array is a projection: the inference engine reads `orSteps.issueShares` and materialises a step entry with `source: { auto: 'evan.mechanics.orSteps.issueShares' }`. When the toggle is off, the inference removes the entry. The toggle itself never goes away. The §10 "migration shim" Tim + Addy own is a lazy display-initialisation pass only — first time the Steps panel opens, if `rounds.operating.steps` is empty, walk `orSteps.*` and pre-populate auto-sourced entries. Nothing is deleted or deprecated. Remove "or replacement flag once migrated" from this cell — it implies a data restructuring that isn't happening. Forward note: `orSteps.homeToken` and `orSteps.specialToken` may eventually be superseded by Jenny's corp/ability inference (rows 5, 3); if so, those two flags become redundant. That's a future deprecation decision, not v0.
| 9 | Any phase declares `status: ['limited_train_buy']`                                       | `Engine::Step::SingleDepotTrainBuy` (replaces `BuyTrain`)       | B     | OR       | Farrah           | Mutually exclusive with default `BuyTrain`. |
| 10 | Any private with `abilities[].type === 'no_buy'` OR concession-with-exchange present     | `Engine::Step::ConcessionAuction` instead of `WaterfallAuction` | A     | Initial  | Jenny            | Drives the Initial round class choice too — Tim's surface. |
| 11 | `state.mechanics.merger.enabled === true` (or `state.mechanics.rounds.merger != null`)   | Merger sub-tab unlocks; specific `Step::Merge*` entries appear  | B     | Merger   | Evan + Tim       | Custom round class required (`G<game>::Round::Merger`); see Tim's PR1a. |
| 12 | Always (default in every game)                                                            | `Engine::Step::DiscardTrain`                                    | A     | OR + SR  | (universal)      | Fires only when a corp is over train_limit; safe default. |
| 13 | Always (default in every game)                                                            | `Engine::Step::EndGame`                                         | A     | OR       | Evan             | Manual end-game declaration; non-blocking, harmless to include. |
| 14 | Game uses player loans (e.g. 1817, 1856) — `state.mechanics.loans.enabled`               | `G<game>::Step::Loan` + `G<game>::Step::PostConversionLoans`    | B     | OR       | Evan + Tim       | Game-specific subclass required — Tim's surface. |

**Game-specific entries that the inference cannot derive** and must be hand-added by the user with provenance `'manual'`: per-game custom steps like `G1822::Step::FirstTurnHousekeeping`, `G1822::Step::AcquireCompany`, etc.

### Tim's row-by-row annotations

> **Row 10 (ConcessionAuction):** Pull from v0. My first take ("keep
> independent with `class === 'auction'` precondition") was too clean. Two
> reasons:
>
> - 1822-shaped games don't use `Round::Auction` at all. `g_1822/game.rb:1055-1057`
>   returns `stock_round` directly from `init_round`. What 1822 calls
>   "concessions" are bid on inside the SR via a bidbox in `G1822::Round::Stock`.
>   So the trigger "any private with `no_buy` or concession-with-exchange"
>   can't reliably drive a ConcessionAuction step swap — in 1822 it implies
>   a deeper structural change (custom SR subclass + custom init flow), not a
>   step swap.
> - "Concession" isn't one ability tag. In Jenny's data it's `companyType:
>   'concession'` plus an `exchange` ability with `from: 'par'` plus a
>   relationship to a linked major. None alone identifies a concession reliably.
>
> Replace with §6/§8 wizard suggestion: when concessions exist in Jenny's
> panel and the Initial round is still vanilla auction, surface *"You have N
> concessions. The standard handling is the 1822 bidbox inside the Stock
> Round. [Apply 1822-style preset] or [Keep current]."* User decides; we don't
> auto-mutate. Variant-packet drafts ("player 1 gets X, player 2 gets Y +
> $50") are a similar shape — not inferable; lives in the custom-subclass
> body editor (PR1a escape hatch).

> **Row 11 (merger sub-tab):** Schema correction. The path is
> `state.mechanics.rounds.merger`, not `state.mechanics.merger`. Use
> `state.mechanics.rounds.merger != null` as the canonical predicate.
>
> Behaviorally `rounds.merger != null` and `rounds.merger?.enabled === true`
> are equivalent given the toggle handler in `rounds-panel.js`:
>   - Off → On: creates the merger object AND sets `enabled: true`.
>   - On → Off: sets `rounds.merger = null`.
> The `.enabled` field is a UI-binding artifact (data-rkey path is
> `merger.enabled`). Use `rounds.merger != null` in the inference engine —
> survives any future schema cleanup where we drop the `.enabled` field.

> **Row 14 (player loans):** Confirm. Game-specific subclass (`G<game>::Step::Loan`,
> `PostConversionLoans`) is my surface — the custom-subclass body editor I
> shipped in PR1a is the escape hatch. Inference fires the suggestion + sets
> a placeholder; user fills in the Ruby.

### Open questions for the table

- **Q1 (Jenny):** Do you have a canonical list of ability `type:` values your panel emits? If new ability types appear that aren't in this table, the inference will silently drop them.
- **Q2 (Farrah):** Is there a single canonical map of phase-status string → engine-step-class? I've inferred a partial one above; please verify and extend.
- **Q3 (Evan):** ~~Several entries reference `state.mechanics.orSteps` toggles (issueShares, etc.) — are those still the source of truth, or do they get migrated into `state.mechanics.rounds.<type>.steps` directly during PR-migration?~~ → **Answered** — see annotation on row 8 above.
- **Q4 (Tim):** For row 10 (`ConcessionAuction` replaces `WaterfallAuction`), this also drives the Initial round-class choice in your section. Want to fold this into a single inference, or keep the round-class and step-list inferences independent?

> Tim (answers Q4): Pull row 10 from v0 — see annotation above. The class-vs-step
> entanglement was a red herring on my part. The pattern that survives in the
> table is *single-trigger, single-step swaps inside an already-chosen round
> structure* — Bankrupt, Special{Track,Token}, Exchange, HomeToken,
> BuyCompany (early), IssueShares, SingleDepotTrainBuy, DiscardTrain, EndGame
> are all clean and stay in. Structural-shape choices live in presets, not
> inference.

---

## 3. Why HomeToken needs a separate trigger row

Researched against `lib/engine/game/base.rb:1667-1703` and `lib/engine/step/tracker.rb`:

`HomeToken` fires (queues a `pending_token` that the step picks up) in two cases:
1. **Multi-home / no-home corp floats** — `place_home_token` finds either no fixed `coordinates` OR multiple `home_token_locations`, so the player must pick.
2. **Reserved-hex deferred placement** — corp's home hex is reserved by them but the tile has no paths yet (e.g. 1830's pre-printed B&O and C&O hexes); placement is queued until the tile is upgraded.

There's also a third case: `tracker.rb:update_token!` re-queues tokens when a multi-token tile gets upgraded to a new city layout. This is a runtime side-effect, not a design-time choice — but it means *any* game with reserved hexes will need `HomeToken` in the OR step list.

The table separates rows 5 and 6 because they touch different upstream owners (Jenny owns corp definitions; Max owns the map's reserved hexes).

---

## 4. The trailing blocking BuyCompany — convention vs. inference

In 1830 and many other games the OR step list ends with `[Engine::Step::BuyCompany, { blocks: true }]` as a "last-chance to buy a private" gate. This is *not* directly inferable from a single trigger — it's a design choice. Options:

- **(a)** Treat it as part of the canonical "matches base.rb default" baseline. If the user hasn't customized the OR, it's there. If they remove it, that's their explicit call.
- **(b)** Drive it from a separate flag like `state.mechanics.lastChanceBuyCompany: boolean` (default true).

Recommendation: **(a)** — it's part of the engine default and shouldn't require a separate toggle.

> Tim: Confirm (a). Reasoning:
>
> - It IS in base.rb:3210 as the canonical OR step list trailer.
> - My emit's `_grbStepsMatchDefault` (PR1a follow-up, `5eb1b34`) already
>   treats it as part of the default — silent inherit unless the user removes
>   it.
> - The trailing BuyCompany's *activeness* is already phase-gated at runtime
>   by `step/buy_company.rb` looking at `phase.status.include?('can_buy_companies')`.
>   Absent the status, the step is inert. So it's "always there as default,
>   phase-gated to actually fire."
> - Adding `state.mechanics.lastChanceBuyCompany` would create two ways to
>   express the same intent → drift.
>
> Note: the early non-blocking BuyCompany (row 7) IS phase-status-driven.
> Both BuyCompanies coexist in 1830 — inference adds the early one when phase
> trigger fires; trailing one is in the seeded default list.

---

## 5. State provenance schema

To make removal-of-upstream-trigger correctly remove the inferred step (instead of leaving an orphan), each entry in `state.mechanics.rounds.<type>.steps` carries provenance:

```js
StepEntry = {
  class: string,                // Ruby class path; pass-through to _grbStepArrayLiteral
  opts?: object,                // per-entry kwargs, e.g. { blocks: true }
  source: SourceTag,            // ← new field
  pinned?: boolean,             // user explicitly froze this entry; inference can't remove
};

SourceTag =
  | 'manual'                                          // user added via picker
  | 'default'                                         // part of base.rb baseline
  | { auto: 'jenny.privates.<id>.abilities.<idx>' }   // tied to a Jenny ability
  | { auto: 'farrah.phases.<id>.status' }             // tied to a Farrah status flag
  | { auto: 'evan.mechanics.<key>' }                  // tied to an Evan toggle
  ;
```

### Behavior rules

- When the upstream source mutates such that the inference no longer fires:
  - `source: 'manual'` → entry stays.
  - `source: 'default'` → entry stays unless the user has explicitly removed it (tracked in a `removedDefaults` set on the round slot).
  - `source: { auto: '…' }` → entry is removed automatically *unless* `pinned: true`.
- When a user manually removes an entry whose source is `auto`, it gets converted to `removed` in a parallel set, and the inference engine respects that (won't re-add on the next tick).
- When a user manually adds an entry that the inference would *also* have produced, the entry's `source` is upgraded from `auto` to `manual` so it survives upstream removal.

> Tim: Two integration notes.
>
> **(1) Existing-save migration.** Saves in the wild have step entries
> without `source` tags. Migration needs to add them on first read. Default
> rule:
>
>   - any step that exactly matches a `_BASE_RB_DEFAULTS[type]` entry →
>     `source: 'default'`
>   - everything else → `source: 'manual'`
>
> Conservative — we'd rather not auto-remove a user's hand-edit. I can write
> the migration helper as part of the inference-engine PR; it slots into
> `initRoundsState()` in `rounds-panel.js` (right after the seed step that
> already exists in PR1a follow-up).
>
> **(2) `removedDefaults` / `removedAuto` set placement.** Goes on the round
> slot, keyed by round type:
>
> ```js
> state.mechanics.rounds.<type> = {
>   ...,
>   steps: [...],
>   removedDefaults: ['Engine::Step::BuyCompany', ...],   // class identifiers
>   removedAuto:     ['Engine::Step::SpecialTrack', ...],
> };
> ```
>
> Same module, written by the inference engine and the UI's remove handler.
> The merger slot can hold these too if/when we decide a default merger
> step list exists (currently empty).

---

## 6. Cross-panel feedback contract

For the panel to be trustworthy, the upstream panels must surface to their user when their mutation triggers an inference downstream. v0 contract:

| Upstream panel | When user does X | Surface this feedback |
|---|---|---|
| Jenny — Companies / Privates | Adds a `tile_lay` ability | Inline note: "→ This adds **Special Track** to Operating + Stock rounds." Link to STEPS panel. |
| Jenny — Companies / Privates | Adds a `token` ability | "→ This adds **Special Token** to Operating round." |
| Jenny — Companies / Privates | Adds an `exchange` ability | "→ This adds **Exchange** to Operating + Stock rounds." |
| Jenny — Corp pack editor | Saves a corp with empty coordinates | "→ This adds **Home Token** placement to Operating round; players will pick the home hex when the corp floats." |
| Farrah — Phases | Adds `'can_buy_companies'` to a phase's status | "→ This activates the **Buy Companies** action during Operating rounds in that phase." |
| Farrah — Phases | Adds `'limited_train_buy'` | "→ This swaps **Buy Trains** for **Single Depot Train Buy** during that phase." |
| Evan — Mechanics | Toggles `bankruptcyAllowed` off | "→ This removes **Bankrupt** from Operating rounds. `can_go_bankrupt?` always returns false — no corp can fold. Ensure your design provides an alternative when a corp cannot cover emergency buy: player loans, nationalisation, or a guaranteed depot train all qualify. Without one, the engine raises on an insolvent corp." |

> [Evan]: "Deadlock" was imprecise — the engine raises a GameError, it doesn't silently hang. Verified against `base.rb:1970-1974` (`can_go_bankrupt?`) and the set of games with `BANKRUPTCY_ALLOWED = false` (1822, 1866, 18GB, 18MS, 18ESP, 18ZOO): each pairs this constant with loans, nationalisation, or a restricted train economy that prevents the insolvent state. The revised copy names the engine consequence and the patterns that cover it.
| Evan — Mechanics | Enables merger round | "→ This unlocks the **Merger** sub-tab on the Steps panel; you'll need to define merge steps and a custom round subclass." |
| Tim — Round classes | Picks a non-vanilla round class | "→ Step list semantics may differ from `Round::Operating`; review the picker after switching." |

Implementation note: the feedback is one-way for now (upstream → user-facing message). The panels do not call into each other directly. The inference engine is the central reader; each panel just emits standardized messages from a shared `_inferenceFeedbackFor(action)` helper.

> Tim: One row to add for the row-10 reframe — the wizard handles concessions
> instead of inference. Add to the table:
>
> | Jenny — Companies / Privates | Adds `companyType: 'concession'` or `no_buy` ability while Initial round is vanilla auction | "→ The standard concession handling is the 1822 bidbox inside the Stock Round. [Apply 1822-style preset] or [Keep current]." |
>
> I can scaffold the `_inferenceFeedbackFor(action)` helper — it's a small
> registry keyed by upstream-mutation tag. Goes alongside the inference
> engine PR; happy to write it as part of that.
>
> Also: row "Tim — Round classes" (last entry in the table) — when a user
> picks a non-vanilla round class, the feedback should specifically reference
> what step semantics differ. I'll provide a class → "what to know" map as
> part of the round-class registry I'm lifting from PR1a.

---

## 7. Manual override surface

The user can:

1. **Remove a default or auto-derived entry.** Logged in `removedDefaults` / `removedAuto` sets on the round slot. Wizard surfaces a warning: *"You've removed a step the inference would have included. The game may behave unexpectedly. [Restore]"*
2. **Pin an auto-derived entry as manual.** Click "pin" on a card; entry's `source` becomes `'manual'`. Survives upstream removal.
3. **Add a step the inference didn't produce.** From the picker, with category labels (auction / SR / OR / merger / always-available). Each addition's source is `'manual'`.
4. **Add a custom subclass.** Free-text Ruby body editor (Tim's surface — round-class subclass with method overrides), referenced from the step entry as `class: 'G<game>::Step::<Name>'`.

---

## 8. The wizard

Per Anthony's spec:

- **Auto-shows on first visit** to each round sub-tab. Dismissible. Reopenable via "How does this round work?" button on the tab.
- **Plain-language explanation** of what the round is and what the steps do — the two-tier model from §1, not engine class names.
- **Contextual coach** that surfaces when the user makes a risky change (removed `Bankrupt` → "your game now has no way for corps to fold, are you sure?").

The wizard's text content is its own deliverable — needs round-by-round 18xx-domain prose, probably co-written with Anthony.

---

## 9. UI layout (informational; not a final mockup)

```
┌──────────────────────────────────────────────────────────────────────┐
│  [Initial] [Stock] [Operating] [Merger]                              │  ← sub-tab pills
├──────────────────────────────────────────────────────────────────────┤
│  ⓘ How does this round work? (auto-opens on first visit)             │  ← wizard
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ [dismissible explanation of the round in plain 18xx terms]     │ │
│  └────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
│  Round class: [Engine::Round::Operating ▼]  [+ Custom subclass]     │  ← Tim's surface
├──────────────────────────────────────────────────────────────────────┤
│  AVAILABLE THROUGHOUT THE TURN  (Group A — non-blocking)            │
│  [Bankrupt] [Exchange] [SpecialTrack] [SpecialToken] [BuyCompany]   │  ← pool, no order
│  [DiscardTrain] [+]                                                  │
├──────────────────────────────────────────────────────────────────────┤
│  IN SEQUENCE  (Group B — blocking, top-to-bottom is play timeline)  │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 1 → HomeToken  · "place pending home tokens"      [pinned] [×] │ │  ← cards
│  │ 2 → Track      · "lay or upgrade a tile"                  [×]  │ │
│  │ 3 → Token      · "place a station token"                  [×]  │ │
│  │ 4 → Route      · "run trains"                             [×]  │ │
│  │ 5 → Dividend   · "pay or withhold"                        [×]  │ │
│  │ 6 → DiscardTrain · "discard over-limit"                   [×]  │ │
│  │ 7 → BuyTrain   · "buy trains from depot or others"        [×]  │ │
│  │ 8 → BuyCompany · {blocks: true} "last-chance buy"         [×]  │ │
│  │   [+ Add to sequence]                                          │ │
│  └────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
│  PREVIEW: def operating_round                                        │  ← live game.rb
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ def operating_round(round_num)                                  │ │
│  │   Engine::Round::Operating.new(self, [                          │ │
│  │     Engine::Step::Bankrupt,                                     │ │
│  │     ...                                                          │ │
│  │   ], round_num: round_num)                                      │ │
│  │ end                                                              │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

CSS / color audit is a hard prerequisite — the previous attempt invented class names with no styling. v1 must use the existing conventions from Companies/Trains/Mechanics panels.

> Tim: Three notes on the "Round class:" line at the top.
>
> **(1) Reuse, don't rewrite.** My `_renderRoundClassSection(roundType, r)` in
> `js/rounds-panel.js` (Tim section, between dividers, lines ~161+) already
> renders the class selector + opts + custom-subclass body editor for each
> round type. It's writing through to state via `data-rkey`-named inputs;
> `onRoundsInputChange` (shared region) handles the listener. All wired and
> intact in source — just unreachable from the UI per PR1d's rip-out.
>
> **(2) Lift into the new layout.** When the new editor goes live, the layout
> sketch's "Round class:" line is where `_renderRoundClassSection(activeTab,
> state.mechanics.rounds[activeTab])` slots in. Small surgery — the function
> is self-contained and writes through `data-rkey` listeners I already wrote.
> The existing Tim/Addy file boundary in `rounds-panel.js` survives.
>
> **(3) The custom-subclass body editor handles tier-3 escape.** The
> three-tier model from §1's preamble: tier-3 games (1822-bidbox, variant
> packets, etc.) need custom Ruby. My body editor (PR1a) emits the user's
> raw Ruby into the subclass body. Inference doesn't try to model these;
> the wizard suggests "use a preset," and if the user instead writes
> custom Ruby, my editor accepts it.

---

## 10. Out of scope for v0

- The wizard's actual prose content (separate doc, probably with Anthony).
- The contextual coach trigger conditions and copy (also wizard-content scope).
- Drag-and-drop reorder mechanics within Group B (up/down arrows acceptable for v1; drag is a polish pass).
- Game-preset dropdown ("start from 1830 / 1846 / 1822 / blank") — likely yes, but not specified yet.
- Migration shim for legacy `state.mechanics.orSteps` toggles → new `rounds.<type>.steps` shape with provenance. Owned by Tim + Addy; needs to land alongside the inference engine.

---

## 11. Sequencing for the implementation

Once this doc is signed off:

1. **Cross-panel doc review pass** — Jenny, Farrah, Tim, Evan annotate §2 (inference rules) and §6 (feedback contract). Each owner adds rows / corrects cells.
2. **CSS / color guide audit** — I read the existing panel CSS, write a short style-conformance note before any rendering code.
3. **Static HTML mockup** of the Operating sub-tab matching §9 layout, using existing CSS classes only. Anthony review.
4. **Provenance schema + inference engine** — pure functions, no UI yet. Unit-testable on synthetic state.
5. **Wizard scaffolding** — content gets filled in iteratively; structure first.
6. **Wire it all together**, pull the placeholder out of `#stepsView`, ship.

No code lands on the panel between today and step 3.

> Tim: Confirmed sequencing. Ownership split for step 4 (provenance + inference):
>
> - **Existing-save migration helper** (mine) — adds `source` tags to step
>   entries on first read. Slots into `initRoundsState()` in `rounds-panel.js`,
>   right after the seed step that PR1a follow-up already added.
> - **`removedDefaults` / `removedAuto` schema** (mine) — adds the parallel
>   sets to each round slot. Joint-edit territory but the change is small and
>   I'll handle it.
> - **Inference engine** (Addy) — pure functions in `rounds-panel.js` (or a
>   sibling file if size warrants). Reads state, returns a tagged step list
>   per round type. No UI coupling.
> - **`_inferenceFeedbackFor(action)` helper** (joint, I scaffold) — the
>   shared message registry referenced in §6. Small.
> - **Round-class registry lift** (mine) — `_renderRoundClassSection` from
>   PR1a moves into the new layout's "Round class:" line per §9.
> - **Cross-class semantic map** (mine) — class → "what to know" hints for
>   the §6 feedback row, used when a user picks a non-vanilla round class.
>
> Open ask back to you: should the **preset system** (tier-3 from §1's
> preamble) ship before or alongside step 4? My weak preference is alongside.
> If we ship inference without presets, users hit tier-3 games and get nothing
> useful. Worth a sync before step 4 starts.

---

*End of v0. Edits welcome — please add a `> [your name]: comment` line directly below any cell or section you want to challenge or extend.*
