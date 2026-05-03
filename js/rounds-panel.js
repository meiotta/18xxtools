// js/rounds-panel.js  v20260502d
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

// Catalog of vanilla Engine::Step::* classes — full class name → short
// description (matches each step's `description` method in lib/engine/step/*.rb).
// Used for inline labels in step cards. Custom G<game>::Step::* names fall
// through and render with no description (full namespace shown instead).
const _STEP_CATALOG = {
  'Engine::Step::Bankrupt':            'Declare bankruptcy',
  'Engine::Step::BuyCompany':          'Buy a private company',
  'Engine::Step::BuySellParShares':    'Buy / sell / par shares',
  'Engine::Step::BuyTrain':            'Buy trains',
  'Engine::Step::CompanyPendingPar':   'Resolve pending par from company',
  'Engine::Step::ConcessionAuction':   'Bid on selected concession',
  'Engine::Step::DiscardTrain':        'Discard over-limit trains',
  'Engine::Step::Dividend':            'Pay or withhold dividends',
  'Engine::Step::EndGame':             'Manual end-game declaration',
  'Engine::Step::Exchange':            'Exchange company for share',
  'Engine::Step::HomeToken':           'Place pending home token',
  'Engine::Step::IssueShares':         'Issue or redeem shares',
  'Engine::Step::Route':               'Run trains',
  'Engine::Step::SimpleDraft':         'Draft one company per turn',
  'Engine::Step::SpecialToken':        'Place private-granted token',
  'Engine::Step::SpecialTrack':        'Lay private-granted track',
  'Engine::Step::Token':               'Place a station token',
  'Engine::Step::Track':               'Lay or upgrade tile',
  'Engine::Step::TrackAndToken':       'Lay tile or place token',
  'Engine::Step::WaterfallAuction':    'Bid on cheapest company',
};

// Default step arrays from tobymao base.rb — the silent-inherit baseline. When
// state.mechanics.rounds.<type>.steps is empty, the export omits the round
// method entirely and the engine inherits these. Verified against:
//   init_round    → base.rb:3170 (new_auction_round)
//   stock_round   → base.rb:3183
//   operating     → base.rb:3198-3211 (NB: SpecialToken/HomeToken NOT in base
//                   default — those are added by g_1830/game.rb's override)
//   merger        → no engine default; merger rounds are always game-custom
const _BASE_RB_DEFAULTS = {
  initial: [
    { class: 'Engine::Step::CompanyPendingPar' },
    { class: 'Engine::Step::WaterfallAuction' },
  ],
  stock: [
    { class: 'Engine::Step::DiscardTrain' },
    { class: 'Engine::Step::Exchange' },
    { class: 'Engine::Step::SpecialTrack' },
    { class: 'Engine::Step::BuySellParShares' },
  ],
  operating: [
    { class: 'Engine::Step::Bankrupt' },
    { class: 'Engine::Step::Exchange' },
    { class: 'Engine::Step::SpecialTrack' },
    { class: 'Engine::Step::BuyCompany' },
    { class: 'Engine::Step::Track' },
    { class: 'Engine::Step::Token' },
    { class: 'Engine::Step::Route' },
    { class: 'Engine::Step::Dividend' },
    { class: 'Engine::Step::DiscardTrain' },
    { class: 'Engine::Step::BuyTrain' },
    { class: 'Engine::Step::BuyCompany', opts: { blocks: true } },
  ],
  merger: [],
};

function _renderRoundStepsSection(roundType, r) {
  const userSteps    = (r && r.steps) || [];
  const defaults     = _BASE_RB_DEFAULTS[roundType] || [];
  const inheriting   = userSteps.length === 0 && defaults.length > 0;
  const methodName   = _stepsRoundMethodName(roundType);

  const lines = [];
  lines.push(`<div class="rounds-steps-section" data-round-type="${roundType}">`);
  lines.push(`  <h4 class="rounds-section-title">Steps</h4>`);

  if (inheriting) {
    lines.push(`  <p class="mech-hint">Inherits base.rb default (${defaults.length} step${defaults.length === 1 ? '' : 's'}). <code>def ${methodName}</code> will be omitted from the export.</p>`);
    lines.push(`  <ol class="rounds-steps-list rounds-steps-inherited">`);
    defaults.forEach(s => lines.push('    ' + _renderStepCardInherited(s)));
    lines.push(`  </ol>`);
  } else if (userSteps.length === 0) {
    lines.push(`  <p class="mech-hint">No steps configured. ${roundType === 'merger' ? 'Merger rounds have no engine default — add at least one step.' : ''}</p>`);
  } else {
    lines.push(`  <ol class="rounds-steps-list">`);
    userSteps.forEach((s, i) => lines.push('    ' + _renderStepCardEditable(s, i)));
    lines.push(`  </ol>`);
  }

  // Add-step button: palette + add wiring lands in PR1c. Disabled stub here so
  // the visual placeholder is in place without behavior coupling.
  lines.push(`  <button class="mech-btn-small" disabled title="Step palette + add wiring lands in PR1c">+ Add step</button>`);

  lines.push(`</div>`);
  return lines.join('\n');
}

// One step card rendered as an inherited default (dimmed, no controls).
function _renderStepCardInherited(stepEntry) {
  const name    = _stepShortName(stepEntry.class);
  const desc    = _STEP_CATALOG[stepEntry.class] || '';
  const optsStr = _formatStepOptsInline(stepEntry.opts);
  return `<li class="rounds-step-card rounds-step-inherited"><span class="rounds-step-name">${name}</span>${desc ? ` <span class="rounds-step-desc">— ${desc}</span>` : ''}${optsStr ? ` <span class="rounds-step-opts">{ ${optsStr} }</span>` : ''}</li>`;
}

// One step card rendered as a user-editable entry (drag handle, remove button).
// Drag-reorder and remove handlers wire in PR1c — buttons are visual stubs.
function _renderStepCardEditable(stepEntry, index) {
  const name    = _stepShortName(stepEntry.class);
  const desc    = _STEP_CATALOG[stepEntry.class] || '';
  const optsStr = _formatStepOptsInline(stepEntry.opts);
  return `<li class="rounds-step-card" data-step-index="${index}"><span class="rounds-step-drag" title="Drag to reorder (PR1c)">⋮⋮</span><span class="rounds-step-name">${name}</span>${desc ? ` <span class="rounds-step-desc">— ${desc}</span>` : ''}${optsStr ? ` <span class="rounds-step-opts">{ ${optsStr} }</span>` : ''}<button class="rounds-step-remove" disabled title="Remove (PR1c)">×</button></li>`;
}

// 'Engine::Step::BuyCompany' → 'BuyCompany'   (vanilla — strip namespace)
// 'G18Foo::Step::Bar'        → 'G18Foo::Step::Bar'   (custom — keep full name)
function _stepShortName(fullName) {
  if (!fullName) return '';
  const VANILLA_PREFIX = 'Engine::Step::';
  return fullName.startsWith(VANILLA_PREFIX) ? fullName.slice(VANILLA_PREFIX.length) : fullName;
}

// { blocks: true, foo: 5 } → 'blocks: true, foo: 5'
function _formatStepOptsInline(opts) {
  if (!opts || Object.keys(opts).length === 0) return '';
  return Object.entries(opts).map(([k, v]) => `${k}: ${v}`).join(', ');
}

// 'initial' → 'init_round'; 'stock' → 'stock_round'; 'operating' → 'operating_round'.
// Used in the "will be omitted" hint and (later) by the export module.
function _stepsRoundMethodName(roundType) {
  return roundType === 'initial' ? 'init_round' : `${roundType}_round`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Shared (both must agree to edit) ────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// (none yet — top-level panel renderer, init, and orchestrator above are the
//  only shared functions; further shared helpers go here when needed.)
