// js/rounds-panel.js  v20260502c
// Rounds panel — round class selection and step list editing.
//
// Co-owned: Tim (round-system) + Addy (step-system).
//
// Each sub-tab (Initial / Stock / Operating / Merger) renders two stacked
// halves with a clear ownership boundary:
//
//   ── Tim PR1a:  _renderRoundClassSection(roundType, r) ────────────────────
//     class selector, constructor opts, custom subclass override editor
//   ── Addy PR1b: _renderRoundStepsSection(roundType, r) ────────────────────
//     ordered list of steps with per-entry options (allows duplicates,
//     e.g. BuyCompany twice in 1830 OR — early non-blocking + late blocks:true)
//
// State source: state.mechanics.rounds.{initial, stock, operating, merger}.
//   Seeded by Evan in initMechanicsState() (mechanics-panel.js, PR0).
//   Tim writes:  rounds.<type>.{class, opts, subclass}
//   Addy writes: rounds.<type>.steps
//   Top-level:   rounds.{loop, customNextRound}
//
// Export consumer: export-game.js (PR1a) emits
//   def init_round / def stock_round / def operating_round / def next_round!
//   into the {{SLOT_ROUND_METHODS}} slot (added by Evan in PR0), calling
//   _grbStepArrayLiteral(stepArr) (Addy, PR1b) to serialize step arrays.
//
// Load order: after mechanics-panel.js (depends on state.mechanics.rounds),
//             before export-game.js (the consumer).

'use strict';

// ── State init / migration ──────────────────────────────────────────────────
// state.mechanics.rounds is seeded by Evan in initMechanicsState() (PR0).
// This function is the migration shim for moving legacy fields (initialRound,
// stockRoundsPerSet, mergerRound, orSteps) into the new nested shape. No-op
// for PR0; called by setup.js / io.js after state load. Filled in PR1a/PR1b.
function initRoundsState() {
  if (typeof state === 'undefined' || !state.mechanics) return;
  if (!state.mechanics.rounds) {
    console.warn('[rounds-panel] state.mechanics.rounds missing — initMechanicsState() did not run or load order is wrong');
    return;
  }
  // TODO (Tim + Addy, PR1a/PR1b): migrate legacy state.mechanics.{initialRound,
  // stockRoundsPerSet, mergerRound, orSteps} into state.mechanics.rounds.* and
  // remove the legacy keys. Out of scope for PR0.
}

// ── Top-level panel renderer ────────────────────────────────────────────────
// Returns the HTML string for the Rounds panel. Stub for PR0; sub-tab nav and
// active-tab dispatch land in PR1a/PR1b.
function renderRoundsPanel() {
  return [
    '<div class="rounds-panel">',
    '  <h3>Rounds</h3>',
    '  <p class="mech-hint">Round panel under construction.</p>',
    '  <p class="mech-hint">Sub-tabs: Initial / Stock / Operating / Merger. Class section (Tim) on top of each, Step list (Addy) below.</p>',
    '</div>',
  ].join('\n');
}

// ── Sub-tab entry points ────────────────────────────────────────────────────
// Each sub-tab renderer is a thin orchestrator: it pulls the round slot from
// state, then composes Tim's class section + Addy's steps section. Editing
// either section's content happens inside its dedicated helper below — this
// orchestrator stays stable to keep diffs scoped.

function renderInitialRoundTab()   { return _renderRoundSubTab('initial'); }
function renderStockRoundTab()     { return _renderRoundSubTab('stock'); }
function renderOperatingRoundTab() { return _renderRoundSubTab('operating'); }
function renderMergerRoundTab()    { return _renderRoundSubTab('merger'); }

function _renderRoundSubTab(roundType) {
  const rounds = (typeof state !== 'undefined' && state.mechanics && state.mechanics.rounds) || {};
  const r = rounds[roundType] || {};
  return [
    _renderRoundClassSection(roundType, r),  // ── Tim ──
    _renderRoundStepsSection(roundType, r),  // ── Addy ──
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Tim's surface (PR1a) ────────────────────────────────────────────────────
// Edits below this line up to the next divider belong to Tim. Addy: please do
// not modify; ping if a change is needed at the boundary.
// ─────────────────────────────────────────────────────────────────────────────

function _renderRoundClassSection(roundType, _r) {
  // TODO PR1a: class selector (Round::Auction / Draft / Stock / Choices for
  // initial; vanilla vs custom subclass for stock/operating/merger),
  // constructor opts (reverse_order, snake_order, rotating_order, round_num),
  // custom subclass override editor (named method bodies as Ruby strings).
  return '<!-- Tim PR1a: ' + roundType + ' class section -->';
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Addy's surface (PR1b) ───────────────────────────────────────────────────
// Edits below this line up to the next divider belong to Addy. Tim: please do
// not modify; ping if a change is needed at the boundary.
// ─────────────────────────────────────────────────────────────────────────────

function _renderRoundStepsSection(roundType, _r) {
  // TODO PR1b: ordered step list editor with per-entry opts. Allows duplicates
  // (BuyCompany twice in 1830 OR). Seeded with engine defaults from
  // base.rb:3198-3212 for OR, base.rb stock_round for SR. Uses Engine::Step::*
  // catalog; emits a custom step stub when the chosen step name isn't engine.
  return '<!-- Addy PR1b: ' + roundType + ' steps section -->';
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Shared (both must agree to edit) ────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// (none yet — top-level panel renderer, init, and orchestrator above are the
//  only shared functions; further shared helpers go here when needed.)
