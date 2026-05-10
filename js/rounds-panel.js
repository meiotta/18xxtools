// js/rounds-panel.js  v20260510a
// Rounds panel — round class selection and step list editing.
//
// Each sub-tab (Initial / Stock / Operating / Merger) renders two stacked
// halves:
//
//   _renderRoundClassSection(roundType, r)
//     class selector, constructor opts, custom subclass override editor
//   _renderRoundStepsSection(roundType, r)
//     ordered list of steps with per-entry options (allows duplicates,
//     e.g. BuyCompany twice in 1830 OR — early non-blocking + late blocks:true)
//
// State source: state.mechanics.rounds.{initial, stock, operating, merger}.
//   Seeded by initMechanicsState() in mechanics-panel.js.
//   Class slot writes: rounds.<type>.{class, opts, subclass}
//   Step slot writes:  rounds.<type>.steps
//   Top-level:         rounds.{loop, customNextRound}
//
// Export consumer: export-game.js emits
//   def init_round / def stock_round / def operating_round / def next_round!
//   into the {{SLOT_ROUND_METHODS}} slot, calling _grbStepArrayLiteral(stepArr)
//   to serialize step arrays.
//
// Load order: after mechanics-panel.js (depends on state.mechanics.rounds),
//             before export-game.js (the consumer).

'use strict';

// ── State init / migration ──────────────────────────────────────────────────
// state.mechanics.rounds is seeded by initMechanicsState() (mechanics-panel.js)
// for fresh states. For existing saves that predate the rounds schema, we seed
// defaults here on first access. Step arrays are seeded from _BASE_RB_DEFAULTS
// so the step-list renderer can be purely reactive.
//
// Schema migration (one-way, idempotent):
//   slot.subclass: { name, body } → slot.endHook + slot.transitionHook
//   - `def finish_round` blocks   → endHook.body
//   - `def or_round_finished`     → transitionHook.body
//   - everything else             → endHook.body (free-text fallback)
//
// Legacy-field status for mechanics.{initialRound, stockRoundsPerSet,
// mergerRound, orSteps} is documented in the "Rounds schema" comment block
// at the top of mechanics-panel.js. Migration helper not yet shipped — open
// questions on canonical homes for two of the four fields are tracked there.
function initRoundsState() {
  if (typeof state === 'undefined' || !state.mechanics) return;
  if (!state.mechanics.rounds) {
    state.mechanics.rounds = {
      initial:         {},
      stock:           {},
      operating:       {},
      merger:          null,
      loop:            null,
      customNextRound: false,
    };
  }

  // Seed step arrays from _BASE_RB_DEFAULTS. Defensive deep-copy each entry so
  // user edits don't mutate the catalog.
  if (typeof _BASE_RB_DEFAULTS !== 'undefined') {
    ['initial', 'stock', 'operating'].forEach(type => {
      const slot = state.mechanics.rounds[type] || (state.mechanics.rounds[type] = {});
      if (!Array.isArray(slot.steps)) {
        slot.steps = (_BASE_RB_DEFAULTS[type] || []).map(s => ({
          class: s.class,
          ...(s.opts ? { opts: { ...s.opts } } : {}),
        }));
      }
    });
    if (state.mechanics.rounds.merger && !Array.isArray(state.mechanics.rounds.merger.steps)) {
      state.mechanics.rounds.merger.steps = [];
    }
  }

  // Subclass → endHook / transitionHook migration. Idempotent: skips slots
  // that already have `endHook` (already migrated) or no `subclass` (fresh
  // state). Strips the old `subclass` field after a successful migration.
  ['initial', 'stock', 'operating'].forEach(type => {
    _migrateSubclassToHooks(state.mechanics.rounds[type]);
  });
  _migrateSubclassToHooks(state.mechanics.rounds.merger);

  // Legacy mechanics.{initialRound, stockRoundsPerSet, mergerRound, orSteps}
  // migration is documented (with current schema status and policy) in the
  // "Rounds schema" comment block at the top of mechanics-panel.js. Two of
  // the four flat fields lack a settled nested home, so no migration helper
  // ships yet; that block tracks the open questions.
}

// Mutate a round slot in place: route legacy `subclass.body` content into
// `endHook.body` / `transitionHook.body` per the def-block name found.
// Idempotent — no-op when slot already has `endHook` or no legacy subclass.
//
// Routing rule:
//   - `def finish_round` blocks         → endHook.body (round-subclass method)
//   - `def or_round_finished` blocks    → endHook.body (game-class method,
//                                          emitted via _grbOrRoundFinishedBody;
//                                          NOT a transitionHook because that
//                                          slot's body becomes a `when` branch
//                                          inside `next_round!`, where a `def`
//                                          would be invalid Ruby)
//   - everything else (other def blocks, free-text remainder) → endHook.body
//
// transitionHook is populated only by deliberate user authorship of routing
// logic via the Tier C UI; legacy `subclass.body` content never auto-migrates
// there because legacy bodies wrote method definitions, not branch bodies.
function _migrateSubclassToHooks(slot) {
  if (!slot || typeof slot !== 'object') return;
  if (slot.endHook) return;            // already migrated
  if (!slot.subclass) return;          // never had a subclass

  const sourceName = (slot.subclass && slot.subclass.name) || '';
  const sourceBody = (slot.subclass && slot.subclass.body) || '';

  // Empty legacy body — just plant an empty endHook and clear subclass.
  if (!sourceBody.trim()) {
    slot.endHook = { name: sourceName, body: '', preset: '' };
    delete slot.subclass;
    return;
  }

  // All def blocks plus any non-def remainder go into endHook.body verbatim.
  // The emit module routes by sub-tab: Stock/Init/Merger endHook content
  // wraps inside a round subclass; Operating endHook content emits as
  // `def or_round_finished` on the game class.
  slot.endHook = { name: sourceName, body: sourceBody.trim(), preset: '' };
  delete slot.subclass;
}

// Parse a Ruby blob for top-level `def NAME ... end` blocks and return them
// as `{ name, full }` records. Naive depth tracking — handles common Ruby
// idioms (nested if/case/do-blocks) but assumes no here-docs and no comment
// lines containing `end` at column 0.
function _parseRubyDefBlocks(text) {
  if (!text || typeof text !== 'string') return [];
  const blocks = [];
  const lines  = text.split('\n');

  for (let start = 0; start < lines.length; start++) {
    const m = /^\s*def\s+(?:self\.)?(\w+)/.exec(lines[start]);
    if (!m) continue;

    let depth = 1;
    let endIdx = -1;
    for (let i = start + 1; i < lines.length; i++) {
      const line    = lines[i];
      const trimmed = line.trim();

      // Strip line comments before keyword detection.
      const code = line.replace(/(^|[^"'])#.*$/, '$1');

      // Block-opening keywords (start of a statement).
      if (/^\s*(class|module|def|if|unless|case|begin|while|until|for)\b/.test(code)) depth++;
      // do-blocks (do at end of line, with optional |args| and optional comment).
      if (/\bdo\b\s*(\|[^|]*\|)?\s*(?:#.*)?$/.test(code)) depth++;

      // Closing `end` (standalone or with trailing comment).
      if (/^\s*end\b\s*(?:#.*)?$/.test(line) && trimmed.startsWith('end')) {
        depth--;
        if (depth === 0) { endIdx = i; break; }
      }
    }

    if (endIdx >= 0) {
      blocks.push({
        name: m[1],
        full: lines.slice(start, endIdx + 1).join('\n'),
      });
      start = endIdx;            // skip past closed block
    }
    // Unclosed def: leave it; caller treats remainder as endHook.body.
  }

  return blocks;
}

// ── Top-level panel renderer ────────────────────────────────────────────────
// Sub-tabs: Initial / Stock / Operating / Merger. Active-tab is panel-local
// (not persisted in state) — clicking re-renders the right pane.

const _ROUND_SUB_TABS = [
  { id: 'initial',   label: 'Initial' },
  { id: 'stock',     label: 'Stock' },
  { id: 'operating', label: 'Operating' },
  { id: 'merger',    label: 'Merger' },
];
let _activeRoundsTab = 'initial';

function renderRoundsPanel() {
  const tabs = _ROUND_SUB_TABS.map(t =>
    `<button type="button" class="rounds-tab${t.id === _activeRoundsTab ? ' active' : ''}" data-rounds-tab="${t.id}">${t.label}</button>`
  ).join('');
  return [
    '<div class="rounds-panel">',
    '  <h3>Rounds</h3>',
    '  <p class="mech-hint">Class section on top, step list below. Empty step lists fall through to base.rb defaults — no Ruby is emitted.</p>',
    `  <div class="rounds-tabs">${tabs}</div>`,
    `  <div class="rounds-tab-content">${_renderRoundSubTab(_activeRoundsTab)}</div>`,
    '</div>',
  ].join('\n');
}

// ── Sub-tab entry points ────────────────────────────────────────────────────
// Each sub-tab renderer is a thin orchestrator: it pulls the round slot from
// state, then composes the class section and the step section. Editing either
// section's content happens inside its dedicated helper below — this
// orchestrator stays stable to keep diffs scoped.

function renderInitialRoundTab()   { return _renderRoundSubTab('initial'); }
function renderStockRoundTab()     { return _renderRoundSubTab('stock'); }
function renderOperatingRoundTab() { return _renderRoundSubTab('operating'); }
function renderMergerRoundTab()    { return _renderRoundSubTab('merger'); }

function _renderRoundSubTab(roundType) {
  initRoundsState();
  const rounds = (typeof state !== 'undefined' && state.mechanics && state.mechanics.rounds) || {};
  const r = rounds[roundType] || {};
  return [
    _renderRoundClassSection(roundType, r),
    _renderRoundStepsSection(roundType, r),
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Round-class section ─────────────────────────────────────────────────────
// Class selectors, constructor opts, and custom-subclass override editor for
// each round type. Pairs with the step-list section below.
// ─────────────────────────────────────────────────────────────────────────────

// Tobymao round-class registry. Designer choices map to engine classes:
//   initial.class → 'auction' | 'draft' | 'stock_direct' | 'choices'
//     auction      → Engine::Round::Auction        (round/auction.rb)
//     draft        → Engine::Round::Draft          (round/draft.rb)
//     stock_direct → init_round delegates to stock_round (no auction)
//     choices      → Engine::Round::Choices        (round/choices.rb — abstract)
//   stock/operating.class → 'vanilla' | 'custom'
//   merger.subclass is always required: Engine::Round::Merger is abstract
//   (round/merger.rb:13 raises NotImplementedError on round_name).

const _DRAFT_OPTS = [
  { key: 'reverse_order',  label: 'Reverse order',  desc: 'Last player picks first (round/draft.rb:11)' },
  { key: 'snake_order',    label: 'Snake order',    desc: 'Direction reverses each cycle (round/draft.rb:13)' },
  { key: 'rotating_order', label: 'Rotating order', desc: 'Entity list rotates each cycle (round/draft.rb:15)' },
];

const _MERGER_POSITIONS = [
  { value: 'between_ors',  label: 'Between OR turns',           desc: '1817 / 1867' },
  { value: 'after_or_set', label: 'After OR set, before SR',    desc: '' },
  { value: 'before_sr',    label: 'Before next SR (alias)',     desc: 'same topology' },
];

const _MERGER_TRIGGERS = [
  { value: 'always',   label: 'Always — every loop',  desc: '1817' },
  { value: 'phase_in', label: 'Only in named phases', desc: '1867' },
];

function _renderRoundClassSection(roundType, r) {
  switch (roundType) {
    case 'initial':   return _renderInitialClassSection(r);
    case 'stock':     return _renderVanillaOrCustomClassSection('stock', r);
    case 'operating': return _renderVanillaOrCustomClassSection('operating', r);
    case 'merger':    return _renderMergerClassSection(r);
    default:          return '';
  }
}

function _renderInitialClassSection(r) {
  const cls  = r.class || 'auction';
  const opts = r.opts  || {};
  const sel  = v => cls === v ? 'selected' : '';
  const lines = [];
  lines.push('<div class="rounds-class-section" data-round-type="initial">');
  lines.push('  <h4 class="rounds-section-title">Class</h4>');
  lines.push('  <label>Initial round class');
  lines.push('    <select data-rkey="initial.class">');
  lines.push(`      <option value="auction"      ${sel('auction')}>Waterfall Auction (default — base.rb:3170)</option>`);
  lines.push(`      <option value="draft"        ${sel('draft')}>Draft</option>`);
  lines.push(`      <option value="stock_direct" ${sel('stock_direct')}>Direct to Stock Round (no auction)</option>`);
  lines.push(`      <option value="choices"      ${sel('choices')}>Choices (abstract — requires subclass)</option>`);
  lines.push('    </select>');
  lines.push('  </label>');

  if (cls === 'draft') {
    lines.push('  <p class="mech-hint">Draft order options (round/draft.rb:11&ndash;15):</p>');
    _DRAFT_OPTS.forEach(o => {
      const checked = opts[o.key] ? 'checked' : '';
      lines.push(`  <label class="mech-toggle"><input type="checkbox" data-rkey="initial.opts.${o.key}" ${checked}> <span>${o.label}</span> <span class="mech-hint-inline">${o.desc}</span></label>`);
    });
  }

  if (cls === 'choices') {
    lines.push('  <p class="mech-warn" style="color:var(--color-warning-text, #b8860b);font-size:11px;border-left:3px solid var(--color-warning-text, #b8860b);padding:6px 8px;background:var(--color-warning-bg, rgba(255,200,0,0.08));">Engine::Round::Choices has no <code>select_entities</code> default. Provide a custom subclass body in the "What happens at the end?" section below.</p>');
  }

  // Subclass body editor moved to Tier C (Round End slot inside the
  // accordion). Tier A is now class identity + opts only.
  lines.push('</div>');
  return lines.join('\n');
}

function _renderVanillaOrCustomClassSection(type, r) {
  // No vanilla|custom choice. The engine has one Stock and one Operating
  // round class; the user doesn't pick. Subclass emission becomes implicit
  // from non-empty Round End content in the Tier C accordion below.
  const baseClass = type === 'stock' ? 'Engine::Round::Stock' : 'Engine::Round::Operating';
  const label     = type === 'stock' ? 'Stock' : 'Operating';
  const lines = [];
  lines.push(`<div class="rounds-class-section" data-round-type="${type}">`);
  lines.push(`  <div style="display:flex;align-items:baseline;gap:8px;font-size:12px;">`);
  lines.push(`    <span style="color:var(--text-secondary);">${label} round class:</span>`);
  lines.push(`    <code style="color:var(--text-primary);font-family:monospace;">${baseClass}</code>`);
  lines.push(`  </div>`);
  lines.push(`  <p class="mech-hint" style="margin:4px 0 0;">No options. Customize via the step list (Tier B) or end-of-round behavior (Tier C below).</p>`);
  lines.push('</div>');
  return lines.join('\n');
}

function _renderMergerClassSection(r) {
  const enabled = !!(r && r.enabled);
  const lines = [];
  lines.push('<div class="rounds-class-section" data-round-type="merger">');
  lines.push('  <h4 class="rounds-section-title">Class</h4>');
  lines.push(`  <label class="mech-toggle"><input type="checkbox" data-rkey="merger.enabled" ${enabled ? 'checked' : ''}> <span>Enable merger round</span></label>`);

  if (!enabled) {
    lines.push('  <p class="mech-hint">Engine::Round::Merger is abstract (round/merger.rb:13 raises NotImplementedError on <code>round_name</code>). Enabling generates a custom subclass.</p>');
    lines.push('</div>');
    return lines.join('\n');
  }

  const m = r;
  const sel = (k, v) => m[k] === v ? 'selected' : '';

  lines.push('  <label>Subclass name (becomes <code>round_name</code>)');
  lines.push(`    <input type="text" data-rkey="merger.name" value="${(m.name || 'Merger').replace(/"/g, '&quot;')}" placeholder="Merger">`);
  lines.push('  </label>');

  lines.push('  <label>Position');
  lines.push('    <select data-rkey="merger.position">');
  _MERGER_POSITIONS.forEach(p => lines.push(`      <option value="${p.value}" ${sel('position', p.value)}>${p.label}${p.desc ? ' — ' + p.desc : ''}</option>`));
  lines.push('    </select>');
  lines.push('  </label>');

  lines.push('  <label>Trigger');
  lines.push('    <select data-rkey="merger.trigger">');
  _MERGER_TRIGGERS.forEach(t => lines.push(`      <option value="${t.value}" ${sel('trigger', t.value)}>${t.label}${t.desc ? ' — ' + t.desc : ''}</option>`));
  lines.push('    </select>');
  lines.push('  </label>');

  if (m.trigger === 'phase_in') {
    const phasesValue = (m.triggerCondition && m.triggerCondition.phases || []).join(' ');
    lines.push('  <label>Phases (space-separated)');
    lines.push(`    <input type="text" data-rkey="merger.triggerCondition.phases" value="${phasesValue.replace(/"/g, '&quot;')}" placeholder="3 4 5 6 7">`);
    lines.push('  </label>');
  }

  // Subclass body editor moved to Tier C accordion.
  lines.push('</div>');
  return lines.join('\n');
}

// Custom subclass body editor — single textarea for raw Ruby method
// definitions, emitted verbatim into the subclass body. Escape hatch with no
// validation. Per-method override editor with autocomplete is PR1d work.
function _renderSubclassEditor(roundType, r) {
  const subclass = r && r.subclass;
  const enabled  = !!subclass;
  const lines = [];
  lines.push('  <div class="rounds-subclass-editor">');
  lines.push(`    <label class="mech-toggle"><input type="checkbox" data-rkey="${roundType}.subclass.enabled" ${enabled ? 'checked' : ''}> <span>Custom subclass</span></label>`);
  if (!enabled) {
    lines.push('  </div>');
    return lines.join('\n');
  }
  const name = (subclass && subclass.name) || '';
  const body = (subclass && subclass.body) || '';
  lines.push('    <label>Subclass name (bare — emitted as <code>class &lt;name&gt; &lt; &lt;parent&gt;</code>)');
  lines.push(`      <input type="text" data-rkey="${roundType}.subclass.name" value="${name.replace(/"/g, '&quot;')}" placeholder="Custom${roundType.charAt(0).toUpperCase() + roundType.slice(1)}">`);
  lines.push('    </label>');
  lines.push('    <label>Method overrides (raw Ruby — emitted verbatim)');
  lines.push(`      <textarea data-rkey="${roundType}.subclass.body" rows="6" placeholder="def finish_round&#10;  # ...&#10;end">${body.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</textarea>`);
  lines.push('    </label>');
  lines.push('  </div>');
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Addy's surface (PR1b) ───────────────────────────────────────────────────
// Edits below this line up to the next divider belong to Addy. Tim: please do
// not modify; ping if a change is needed at the boundary.
// ─────────────────────────────────────────────────────────────────────────────

// Step group classification — Group A non-blocking ("interrupt menu, available
// throughout the turn"), Group B blocking ("in sequence, top-to-bottom is the
// play timeline"). Verified against each step's `blocks?` method:
//   bankrupt.rb:20, end_game.rb:21, exchange.rb:19, special_track.rb:31,
//   discard_train.rb (no override → false), issue_shares.rb (no override → defaults vary)
// BuyCompany is conditional: vanilla `blocks?` reads `@opts[:blocks]` so the
// SAME class is Group A by default and Group B when opts.blocks === true.
const _STEP_GROUP = {
  // Group A — non-blocking
  'Engine::Step::Bankrupt':            'A',
  'Engine::Step::EndGame':             'A',
  'Engine::Step::Exchange':            'A',
  'Engine::Step::SpecialTrack':        'A',
  'Engine::Step::SpecialToken':        'A',
  'Engine::Step::DiscardTrain':        'A',
  'Engine::Step::IssueShares':         'A',
  'Engine::Step::BuyCompany':          'A',  // → 'B' when opts.blocks === true
  // Group B — blocking (gates round progression)
  'Engine::Step::HomeToken':           'B',
  'Engine::Step::Track':               'B',
  'Engine::Step::Token':               'B',
  'Engine::Step::Route':               'B',
  'Engine::Step::Dividend':            'B',
  'Engine::Step::BuyTrain':            'B',
  'Engine::Step::TrackAndToken':       'B',
  'Engine::Step::BuySellParShares':    'B',
  'Engine::Step::WaterfallAuction':    'B',
  'Engine::Step::ConcessionAuction':   'B',
  'Engine::Step::SimpleDraft':         'B',
  'Engine::Step::CompanyPendingPar':   'B',
};

// True iff this entry blocks round progression. Conditional on opts.blocks.
function _stepIsBlocking(stepEntry) {
  if (stepEntry && stepEntry.opts && stepEntry.opts.blocks === true) return true;
  return _STEP_GROUP[stepEntry && stepEntry.class] === 'B';
}

// Splits a step list into { groupA: [...], groupB: [...] } preserving each
// entry's index in the original array (so reorder/remove can target it).
function _classifySteps(steps) {
  const groupA = [];
  const groupB = [];
  (steps || []).forEach((entry, originalIdx) => {
    (_stepIsBlocking(entry) ? groupB : groupA).push({ entry, originalIdx });
  });
  return { groupA, groupB };
}

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

// ─────────────────────────────────────────────────────────────────────────────
// ── Step constraint validators (PR per EXPORT_COHERENCE.md §4 + §6) ─────────
// ─────────────────────────────────────────────────────────────────────────────

// Required steps per round type. The list-empty path is silent inherit (engine
// uses base.rb defaults, which always include the required step), so these
// checks only fire when slot.steps is non-empty AND missing the required
// class. matchAny entries are matched by `::<name>` suffix so engine + game-
// local subclasses both qualify (e.g. G1822::Step::BuySellParShares passes
// the BuySellParShares requirement).
const _REQUIRED_STEPS_BY_ROUND = {
  initial: {
    description: 'an auction or draft step (WaterfallAuction / SelectionAuction / ConcessionAuction / SimpleDraft)',
    matchAny: ['WaterfallAuction', 'SelectionAuction', 'ConcessionAuction', 'SimpleDraft'],
  },
  stock: {
    description: 'a share-trading step (BuySellParShares or a subclass)',
    matchAny: ['BuySellParShares', 'BuySellParSharesCompanies', 'BuySellParSharesViaBid'],
  },
  operating: {
    description: 'at least one of Track / TrackAndToken / Route / BuyTrain — the OR cannot do anything without these',
    matchAny: ['Track', 'TrackAndToken', 'Route', 'BuyTrain'],
  },
  merger: {
    description: 'at least one step (Engine::Round::Merger has no engine default)',
    matchAny: null,  // any non-empty list satisfies
  },
};

// Step ordering constraints. Each rule says: if a step matching `before` AND
// a step matching `after` are BOTH present and BOTH blocking (Group B), the
// `before` step must have a lower array index than the `after` step. Match by
// `::<name>` suffix to cover engine + game-local variants.
const _STEP_ORDERING_RULES = [
  { before: 'Track',        after: 'Token',    severity: 'error',
    code: 'STEP_ORDER_TRACK_BEFORE_TOKEN',
    message: 'Track-laying must come before Token placement; tokens target tile cities created by the lay.' },
  { before: 'Route',        after: 'Dividend', severity: 'error',
    code: 'STEP_ORDER_ROUTE_BEFORE_DIVIDEND',
    message: 'Route running must come before Dividend; dividend payout reads route revenue.' },
  { before: 'Route',        after: 'BuyTrain', severity: 'error',
    code: 'STEP_ORDER_ROUTE_BEFORE_BUYTRAIN',
    message: 'Route running must come before BuyTrain; emergency-buy logic depends on whether the corp ran routes this OR.' },
  { before: 'HomeToken',    after: 'Track',    severity: 'warning',
    code: 'STEP_ORDER_HOMETOKEN_BEFORE_TRACK',
    message: 'HomeToken should typically come before Track — newly-floated corps place their home before laying tile.' },
  { before: 'DiscardTrain', after: 'BuyTrain', severity: 'warning',
    code: 'STEP_ORDER_DISCARD_BEFORE_BUYTRAIN',
    message: 'DiscardTrain conventionally comes before BuyTrain so over-limit trains are cleared before purchase.' },
];

// Class-name pattern matchers. Engine::Step::* must be CamelCase after the
// prefix; game-local steps live under G<game>::Step::<Name>.
const _CLASS_PATTERN_ENGINE = /^Engine::Step::[A-Z][A-Za-z0-9]*$/;
const _CLASS_PATTERN_GAME   = /^G[A-Za-z0-9_]+::Step::[A-Z][A-Za-z0-9]*$/;

// Step → required phase-status dependency. The KEY step's actions() method
// in the engine returns [] unless the active phase declares one of the listed
// statuses, which makes the step dead. If the step is in the list and NO
// phase declares any of these statuses, the step never fires → warning.
//
// Sourced from each step's actions() implementation in lib/engine/step/*.rb:
//   buy_company.rb:26 — 'can_buy_companies' / 'can_buy_companies_from_other_players' / 'can_buy_companies_operation_round_one'
//   single_depot_train_buy.rb:15 — 'limited_train_buy'
const _STEP_PHASE_STATUS_DEPS = {
  'Engine::Step::BuyCompany':           ['can_buy_companies', 'can_buy_companies_from_other_players', 'can_buy_companies_operation_round_one'],
  'Engine::Step::SingleDepotTrainBuy':  ['limited_train_buy'],
};

// Ability `when:` value → { round, stepNames }. If a private/company ability
// has when: 'foo', the round's step list must include at least one of the
// listed step-name suffixes for the ability to fire. Step names match by
// '::<name>' suffix, so engine + game-local subclasses both qualify.
//
// Values that are too context-dependent to verify (e.g. 'sold',
// '%current_step%', 'owning_player_track') are intentionally NOT in the map —
// those skip the check rather than false-positive.
const _ABILITY_WHEN_TO_STEPS = {
  // Track-laying time
  'track':         { round: 'operating', stepNames: ['Track', 'TrackAndToken', 'SpecialTrack'] },
  'lay_track':     { round: 'operating', stepNames: ['Track', 'TrackAndToken', 'SpecialTrack'] },
  // Token-placement time
  'token':         { round: 'operating', stepNames: ['Token', 'TrackAndToken', 'SpecialToken', 'HomeToken'] },
  'place_token':   { round: 'operating', stepNames: ['Token', 'TrackAndToken', 'SpecialToken', 'HomeToken'] },
  // Route-running time
  'route':         { round: 'operating', stepNames: ['Route'] },
  'run_routes':    { round: 'operating', stepNames: ['Route'] },
  // Dividend time
  'dividend':      { round: 'operating', stepNames: ['Dividend', 'HalfPay', 'MinorHalfPay', 'MinorWithold'] },
  'pay_dividend':  { round: 'operating', stepNames: ['Dividend', 'HalfPay', 'MinorHalfPay', 'MinorWithold'] },
  // Train-buying time
  'buy_train':     { round: 'operating', stepNames: ['BuyTrain', 'SingleDepotTrainBuy', 'SpecialBuyTrain'] },
  'buying_train':  { round: 'operating', stepNames: ['BuyTrain', 'SingleDepotTrainBuy', 'SpecialBuyTrain'] },
  // Stock-round context — any SR step satisfies (the ability is timed within SR)
  'stock_round':   { round: 'stock',     stepNames: null },  // null = any non-empty step list satisfies
  // OR start / end — any OR step satisfies (the round itself fires; ability piggybacks)
  'or_start':      { round: 'operating', stepNames: null },
  'or_end':        { round: 'operating', stepNames: null },
  'or_round_end':  { round: 'operating', stepNames: null },
};

// Returns one of: 'engine-known' | 'engine-unknown' | 'game-local' | 'malformed'.
// engine-unknown = matches Engine::Step::* pattern but absent from _STEP_CATALOG;
// could be a typo, OR an engine step we haven't catalogued yet. Treated as
// warning by the validator (severity 'warning' rather than 'error').
function _classifyStepClass(className) {
  if (!className || typeof className !== 'string') return 'malformed';
  if (_CLASS_PATTERN_ENGINE.test(className)) {
    return _STEP_CATALOG[className] ? 'engine-known' : 'engine-unknown';
  }
  if (_CLASS_PATTERN_GAME.test(className)) return 'game-local';
  return 'malformed';
}

// Helper: does any step in the array match the given class-name suffix
// (after the final '::')? Catches both Engine::Step::Foo and G<game>::Step::Foo.
function _stepsContainSuffix(steps, name) {
  return (steps || []).some(s => s && typeof s.class === 'string' && s.class.endsWith('::' + name));
}

// Helper: index of the first step whose class ends in '::<name>' AND that
// step is currently classified as blocking (Group B). Returns -1 if none.
function _firstBlockingIndexBySuffix(steps, name) {
  for (let i = 0; i < (steps || []).length; i++) {
    const s = steps[i];
    if (!s || typeof s.class !== 'string') continue;
    if (!s.class.endsWith('::' + name)) continue;
    if (_stepIsBlocking(s)) return i;
  }
  return -1;
}

// Main validator. Returns an array of structured findings:
//   { severity: 'error' | 'warning' | 'info',
//     code:     string,
//     message:  string,
//     path:     string,                                          // dotted state path
//     round?:   'initial' | 'stock' | 'operating' | 'merger',
//     stepIndex?: number,
//     stepClass?: string }
//
// Severity policy:
//   error   — will produce broken Ruby OR break engine load OR break gameplay.
//             Aggregate signal goes red.
//   warning — convention divergence, unrecognized engine class, dead-on-arrival
//             ability. Aggregate signal goes amber unless an error fires too.
//   info    — game-local subclasses (no validation possible; v2 will add
//             custom-step body checks). Doesn't affect aggregate signal.
//
// Six categories:
//   (a) Class recognition — engine-known / engine-unknown / game-local / malformed
//   (b) Required-step presence — initial needs auction step, stock needs
//       BuySellParShares, operating needs Track/Route/BuyTrain, etc.
//   (c) Group B ordering — Track before Token, Route before Dividend, etc.
//   (d) Phase-status references — steps that gate on phase status (BuyCompany,
//       SingleDepotTrainBuy) emit warnings if no phase declares the status
//   (e) Ability when: references — privates' abilities with when: time tags
//       must have a satisfying step in the relevant round's list
//   (f) Step duplicates — same class in the same round multiple times (warn)
function validateStepConstraints(state) {
  const findings = [];
  const rounds  = (state && state.mechanics && state.mechanics.rounds)  || {};
  const phases  = (state && state.mechanics && state.mechanics.phases)  || (state && state.phases) || [];
  const privs   = (state && state.privates)  || [];
  const corps   = (state && state.companies) || [];
  const minors  = (state && state.minors)    || [];

  // Pre-compute the set of all phase status flags declared anywhere, used by
  // check (d). Phase shape from Farrah's panel: { name, on, status: [...] }.
  const declaredPhaseStatuses = new Set();
  (Array.isArray(phases) ? phases : []).forEach(ph => {
    if (ph && Array.isArray(ph.status)) ph.status.forEach(s => declaredPhaseStatuses.add(s));
  });

  ['initial', 'stock', 'operating', 'merger'].forEach(roundType => {
    const slot = rounds[roundType];
    if (!slot) return;

    // Merger slot is special — only validate when enabled. Schema can either
    // mark `enabled: true` or have a non-null slot with a class set.
    const mergerActive = roundType === 'merger' && (slot.enabled === true || !!slot.class);
    if (roundType === 'merger' && !mergerActive) return;

    const steps = Array.isArray(slot.steps) ? slot.steps : [];
    const slotPath = `mechanics.rounds.${roundType}`;

    // ── (a) Class checks (every entry) ─────────────────────────────────────
    steps.forEach((step, i) => {
      const stepPath = `${slotPath}.steps[${i}].class`;
      const c = _classifyStepClass(step && step.class);
      if (c === 'malformed') {
        findings.push({
          severity: 'error',
          code: 'STEP_CLASS_MALFORMED',
          message: `Step class "${step && step.class}" doesn't match Engine::Step::Foo or G<game>::Step::Foo pattern.`,
          path: stepPath,
          round: roundType, stepIndex: i, stepClass: step && step.class,
        });
      } else if (c === 'engine-unknown') {
        findings.push({
          severity: 'warning',
          code: 'STEP_CLASS_UNKNOWN_ENGINE',
          message: `${step.class} is not in the known engine step catalog. May be a typo, or an engine step the catalog hasn't picked up yet.`,
          path: stepPath,
          round: roundType, stepIndex: i, stepClass: step.class,
        });
      } else if (c === 'game-local') {
        findings.push({
          severity: 'info',
          code: 'STEP_CLASS_GAME_LOCAL',
          message: `${step.class} is a game-local subclass; full validation requires the subclass body (v2).`,
          path: stepPath,
          round: roundType, stepIndex: i, stepClass: step.class,
        });
      }
    });

    // ── (b) Required-step checks ───────────────────────────────────────────
    // Only fire when steps is non-empty (empty = silent inherit; engine uses
    // base.rb defaults which contain the required step). Merger is special:
    // empty steps when enabled is itself an error.
    if (steps.length === 0) {
      if (roundType === 'merger' && mergerActive) {
        findings.push({
          severity: 'error',
          code: 'MERGER_ENABLED_NO_STEPS',
          message: 'Merger round is enabled but has no steps. Engine::Round::Merger is abstract — populate the step list with merger logic.',
          path: `${slotPath}.steps`,
          round: roundType,
        });
      }
    } else {
      const req = _REQUIRED_STEPS_BY_ROUND[roundType];
      if (req && req.matchAny) {
        const present = req.matchAny.some(name => _stepsContainSuffix(steps, name));
        if (!present) {
          findings.push({
            severity: 'error',
            code: 'STEP_REQUIRED_MISSING',
            message: `${roundType.charAt(0).toUpperCase() + roundType.slice(1)} round needs ${req.description}.`,
            path: `${slotPath}.steps`,
            round: roundType,
          });
        }
      }
    }

    // ── (c) Ordering checks ────────────────────────────────────────────────
    // Only consider Group B (blocking) members; Group A is interrupt-menu so
    // its position relative to other steps is cosmetic.
    _STEP_ORDERING_RULES.forEach(rule => {
      const beforeIdx = _firstBlockingIndexBySuffix(steps, rule.before);
      const afterIdx  = _firstBlockingIndexBySuffix(steps, rule.after);
      if (beforeIdx === -1 || afterIdx === -1) return;
      if (beforeIdx > afterIdx) {
        findings.push({
          severity: rule.severity,
          code: rule.code,
          message: rule.message,
          path: `${slotPath}.steps[${beforeIdx}]`,
          round: roundType, stepIndex: beforeIdx,
        });
      }
    });

    // ── (d) Phase-status reference checks ──────────────────────────────────
    // Steps that gate on a phase status (BuyCompany, SingleDepotTrainBuy) are
    // dead unless some phase declares one of their accepted statuses. Warn,
    // don't error — the user may still be configuring phases.
    steps.forEach((step, i) => {
      const cls  = step && step.class;
      const deps = _STEP_PHASE_STATUS_DEPS[cls];
      if (!deps || !deps.length) return;
      const satisfied = deps.some(s => declaredPhaseStatuses.has(s));
      if (!satisfied) {
        findings.push({
          severity: 'warning',
          code: 'STEP_PHASE_STATUS_MISSING',
          message: `${cls} requires one of [${deps.join(', ')}] to be declared on at least one phase. Without it the step is dead — its actions() returns [] for every entity.`,
          path: `${slotPath}.steps[${i}]`,
          round: roundType, stepIndex: i, stepClass: cls,
        });
      }
    });

    // ── (f) Step duplicate check (warning only) ────────────────────────────
    // Same class twice in a tab. Some games legitimately do this (1830 OR has
    // BuyCompany twice; 1822 OR has PendingToken twice). Warn so the designer
    // notices it; don't block. Compares by class string only.
    const counts = new Map();
    steps.forEach(s => {
      if (!s || typeof s.class !== 'string') return;
      counts.set(s.class, (counts.get(s.class) || 0) + 1);
    });
    counts.forEach((count, cls) => {
      if (count <= 1) return;
      // Find the index of the SECOND occurrence for the path/jump-target.
      let secondIdx = -1, seen = 0;
      for (let i = 0; i < steps.length; i++) {
        if (steps[i] && steps[i].class === cls) {
          seen++;
          if (seen === 2) { secondIdx = i; break; }
        }
      }
      findings.push({
        severity: 'warning',
        code: 'STEP_DUPLICATE',
        message: `${cls} appears ${count} times in the ${roundType} step list. Some games (1830 OR BuyCompany ×2, 1822 OR PendingToken ×2) legitimately do this; verify the per-entry opts differ if you intended duplicates.`,
        path: `${slotPath}.steps[${secondIdx}]`,
        round: roundType, stepIndex: secondIdx, stepClass: cls,
      });
    });
  });

  // ── (e) Ability `when:` reference checks ─────────────────────────────────
  // Cross-panel: each private/company ability with a recognized `when:` value
  // must have a satisfying step in the relevant round's step list. If the
  // step list is empty the round inherits base.rb defaults — those are
  // checked too (the default OR has Track/Route/Dividend/BuyTrain, default SR
  // has BuySellParShares).
  function _stepsForRound(roundType) {
    const slot = rounds[roundType];
    const userSteps = (slot && Array.isArray(slot.steps)) ? slot.steps : [];
    if (userSteps.length > 0) return userSteps;
    // Empty list → engine inherits base.rb defaults
    return _BASE_RB_DEFAULTS[roundType] || [];
  }

  function _checkOneAbility(entity, entityKind, entityIdx, ability, abilityIdx) {
    const whenField = ability && ability.when;
    if (!whenField) return;
    const values = Array.isArray(whenField) ? whenField : [whenField];
    values.forEach(whenVal => {
      const map = _ABILITY_WHEN_TO_STEPS[whenVal];
      if (!map) return;  // unknown when: value — not a check we run
      const targetSteps = _stepsForRound(map.round);
      let satisfied;
      if (map.stepNames === null) {
        satisfied = targetSteps.length > 0;
      } else {
        satisfied = map.stepNames.some(name => _stepsContainSuffix(targetSteps, name));
      }
      if (!satisfied) {
        const ent = (entity && (entity.sym || entity.abbr || entity.name)) || `#${entityIdx}`;
        const wantList = map.stepNames === null
          ? `any step in the ${map.round} round`
          : `${map.stepNames.join(' / ')} in the ${map.round} round`;
        findings.push({
          severity: 'warning',
          code: 'ABILITY_WHEN_NO_MATCHING_STEP',
          message: `${entityKind} "${ent}" has an ability with when: '${whenVal}' but ${wantList} is not present. The ability will never fire.`,
          path: `${entityKind === 'private' ? 'privates' : entityKind === 'company' ? 'companies' : 'minors'}[${entityIdx}].abilities[${abilityIdx}].when`,
          round: map.round,
        });
      }
    });
  }

  (Array.isArray(privs) ? privs : []).forEach((p, pi) => {
    const abs = (p && Array.isArray(p.abilities)) ? p.abilities : [];
    abs.forEach((ab, ai) => _checkOneAbility(p, 'private', pi, ab, ai));
  });
  (Array.isArray(corps) ? corps : []).forEach((c, ci) => {
    const abs = (c && Array.isArray(c.abilities)) ? c.abilities : [];
    abs.forEach((ab, ai) => _checkOneAbility(c, 'company', ci, ab, ai));
  });
  (Array.isArray(minors) ? minors : []).forEach((m, mi) => {
    const abs = (m && Array.isArray(m.abilities)) ? m.abilities : [];
    abs.forEach((ab, ai) => _checkOneAbility(m, 'minor', mi, ab, ai));
  });

  return findings;
}

function _renderRoundStepsSection(roundType, r) {
  const userSteps  = (r && Array.isArray(r.steps)) ? r.steps : [];
  const defaults   = _BASE_RB_DEFAULTS[roundType] || [];
  const methodName = _stepsRoundMethodName(roundType);
  const matches    = _stepsMatchDefaults(userSteps, defaults);
  const { groupA, groupB } = _classifySteps(userSteps);

  const lines = [];
  lines.push(`<div class="rounds-steps-section" data-round-type="${roundType}" style="margin-top:16px;">`);

  // Inheritance hint
  if (matches) {
    lines.push(`  <p class="mech-hint" style="margin:0 0 12px;">Matches base.rb default — <code>def ${methodName}</code> will be omitted from the export.</p>`);
  } else if (userSteps.length === 0 && roundType === 'merger') {
    lines.push(`  <p class="mech-hint" style="margin:0 0 12px;">Merger rounds have no engine default. Add at least one step.</p>`);
  } else if (userSteps.length === 0) {
    lines.push(`  <p class="mech-hint" style="margin:0 0 12px; font-style:italic;">No steps. Use the picker below to add one.</p>`);
  } else {
    lines.push(`  <p class="mech-hint" style="margin:0 0 12px;">Diverges from base.rb default — <code>def ${methodName}</code> will be emitted with this list.</p>`);
  }

  // ── Group A — pool of pills (non-blocking, "always available") ────────────
  lines.push('  <div class="mech-slot" style="margin-bottom:12px;">');
  lines.push('    <div class="mech-slot-num">Available throughout the turn — non-blocking</div>');
  lines.push('    <p class="mech-hint" style="margin:0 0 6px;">Order doesn\'t matter; the engine treats these as actions a player may take at any moment during their turn.</p>');
  if (groupA.length > 0) {
    lines.push('    <div style="display:flex;flex-wrap:wrap;gap:6px;">');
    groupA.forEach(({ entry, originalIdx }) => {
      lines.push('      ' + _renderStepPillGroupA(entry, originalIdx, roundType));
    });
    lines.push('    </div>');
  } else {
    lines.push('    <p class="mech-hint" style="margin:0;font-style:italic;">No interrupt-menu steps yet.</p>');
  }
  lines.push('  </div>');

  // ── Group B — sequenced cards (blocking, "in play timeline") ──────────────
  lines.push('  <div class="mech-slot" style="margin-bottom:12px;">');
  lines.push('    <div class="mech-slot-num">In sequence — blocking, top-to-bottom is play timeline</div>');
  lines.push('    <p class="mech-hint" style="margin:0 0 8px;">The round walks these top-to-bottom and stops at each one until the player acts. Order is the play sequence.</p>');
  if (groupB.length > 0) {
    lines.push('    <ol style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px;">');
    groupB.forEach(({ entry, originalIdx }, visibleIdx) => {
      lines.push('      ' + _renderStepCardGroupB(entry, originalIdx, roundType, visibleIdx, groupB.length));
    });
    lines.push('    </ol>');
  } else {
    lines.push('    <p class="mech-hint" style="margin:0;font-style:italic;">No sequenced steps yet.</p>');
  }
  lines.push('  </div>');

  // Add-step picker. Group placement is automatic via _stepIsBlocking().
  lines.push('  <div class="rounds-steps-picker" style="display:flex;gap:8px;align-items:center;margin-top:8px;">');
  lines.push('    <select data-step-picker style="background:var(--bg-surface);border:1px solid var(--border-mid);border-radius:4px;color:var(--text-primary);padding:4px 8px;font-size:12px;flex:1;max-width:380px;">');
  lines.push('      <option value="">Select a step to add…</option>');
  Object.keys(_STEP_CATALOG).sort().forEach(cls => {
    const short = _stepShortName(cls);
    const desc  = _STEP_CATALOG[cls];
    const grp   = _STEP_GROUP[cls] === 'B' ? '◆' : '○';
    lines.push(`      <option value="${cls}">${grp} ${short} — ${desc}</option>`);
  });
  lines.push('    </select>');
  lines.push(`    <button class="mech-btn-small" data-skey="add" data-round-type="${roundType}">+ Add step</button>`);
  lines.push('    <span class="mech-hint-inline">○ non-blocking · ◆ blocking</span>');
  lines.push('  </div>');

  lines.push(`</div>`);
  return lines.join('\n');
}

// Group A pill — small inline chip with name + remove. Order is irrelevant.
// BuyCompany shows a "blocks" toggle so the user can promote it to Group B.
function _renderStepPillGroupA(stepEntry, originalIdx, roundType) {
  const name      = _stepShortName(stepEntry.class);
  const desc      = _STEP_CATALOG[stepEntry.class] || '';
  const canBlock  = stepEntry.class === 'Engine::Step::BuyCompany';
  const blocksOn  = !!(stepEntry.opts && stepEntry.opts.blocks);
  return `<span class="rounds-step-pill" title="${desc}" style="display:inline-flex;align-items:center;gap:4px;background:var(--bg-surface);border:1px solid var(--border);border-radius:14px;padding:3px 4px 3px 10px;font-size:11px;color:var(--text-primary);">` +
    `<span>${name}</span>` +
    (canBlock ? `<button class="rounds-step-blocks-pill${blocksOn ? ' active' : ''}" data-skey="toggle-blocks" data-round-type="${roundType}" data-step-index="${originalIdx}" title="Promote to In-sequence with { blocks: true }" style="background:${blocksOn ? 'var(--accent)' : 'transparent'};border:1px solid ${blocksOn ? 'var(--accent)' : 'var(--border-mid)'};color:${blocksOn ? '#fff' : 'var(--text-dim)'};border-radius:10px;padding:0 6px;font-size:10px;cursor:pointer;line-height:14px;">blocks</button>` : '') +
    `<button class="rounds-step-remove" data-skey="remove" data-round-type="${roundType}" data-step-index="${originalIdx}" title="Remove" style="background:transparent;border:none;color:var(--text-dim);font-size:14px;cursor:pointer;padding:0 4px;line-height:1;">×</button>` +
  `</span>`;
}

// Group B card — numbered, with reorder and remove. BuyCompany shows the
// blocks toggle here too (active by default since it's already in Group B).
function _renderStepCardGroupB(stepEntry, originalIdx, roundType, visibleIdx, total) {
  const name     = _stepShortName(stepEntry.class);
  const desc     = _STEP_CATALOG[stepEntry.class] || '';
  const optsStr  = _formatStepOptsInline(stepEntry.opts);
  const isFirst  = visibleIdx === 0;
  const isLast   = visibleIdx === total - 1;
  const canBlock = stepEntry.class === 'Engine::Step::BuyCompany';
  const blocksOn = !!(stepEntry.opts && stepEntry.opts.blocks);
  // The Dividend step gets a "Rules" pill that opens the dividend-rules modal.
  // Owned by js/dividend-rules.js (market-mechanics SME). State lives on
  // stepEntry.priceMovement (recipe + half-pay + minor branch + price floor).
  const isDividend = stepEntry.class === 'Engine::Step::Dividend' || /::Dividend$/.test(stepEntry.class || '');
  const ruleBadge  = isDividend && typeof priceMovementBadge === 'function'
    ? priceMovementBadge(stepEntry) : null;
  const rulesOn    = !!ruleBadge;

  return `<li data-step-index="${originalIdx}" style="display:flex;align-items:center;gap:8px;background:var(--bg-surface);border:1px solid var(--border);border-radius:5px;padding:6px 10px;font-size:12px;color:var(--text-primary);">` +
    `<span style="color:var(--text-muted);font-size:10px;width:14px;flex-shrink:0;text-align:right;">${visibleIdx + 1}</span>` +
    `<span style="display:flex;flex-direction:column;gap:1px;">` +
      `<button data-skey="move-up" data-round-type="${roundType}" data-step-index="${originalIdx}" ${isFirst ? 'disabled' : ''} title="Move up" style="background:transparent;border:1px solid var(--border);color:${isFirst ? 'var(--border)' : 'var(--text-dim)'};border-radius:3px;padding:0 4px;font-size:9px;cursor:${isFirst ? 'default' : 'pointer'};line-height:11px;">▲</button>` +
      `<button data-skey="move-down" data-round-type="${roundType}" data-step-index="${originalIdx}" ${isLast ? 'disabled' : ''} title="Move down" style="background:transparent;border:1px solid var(--border);color:${isLast ? 'var(--border)' : 'var(--text-dim)'};border-radius:3px;padding:0 4px;font-size:9px;cursor:${isLast ? 'default' : 'pointer'};line-height:11px;">▼</button>` +
    `</span>` +
    `<span style="font-weight:500;">${name}</span>` +
    (desc ? ` <span style="color:var(--text-dim);font-size:11px;">— ${desc}</span>` : '') +
    (optsStr ? ` <span style="color:var(--text-muted);font-family:monospace;font-size:10px;">{ ${optsStr} }</span>` : '') +
    `<span style="margin-left:auto;display:flex;gap:4px;">` +
      (isDividend ? `<button data-skey="edit-rules" data-round-type="${roundType}" data-step-index="${originalIdx}" title="Configure price movement and half-pay" style="background:${rulesOn ? 'var(--accent)' : 'transparent'};border:1px solid ${rulesOn ? 'var(--accent)' : 'var(--border-mid)'};color:${rulesOn ? '#fff' : 'var(--text-dim)'};border-radius:10px;padding:1px 8px;font-size:10px;cursor:pointer;">Rules${rulesOn ? `: ${ruleBadge}` : ''}</button>` : '') +
      (canBlock ? `<button class="rounds-step-blocks-pill${blocksOn ? ' active' : ''}" data-skey="toggle-blocks" data-round-type="${roundType}" data-step-index="${originalIdx}" title="Toggle { blocks: true }" style="background:${blocksOn ? 'var(--accent)' : 'transparent'};border:1px solid ${blocksOn ? 'var(--accent)' : 'var(--border-mid)'};color:${blocksOn ? '#fff' : 'var(--text-dim)'};border-radius:10px;padding:1px 8px;font-size:10px;cursor:pointer;">${blocksOn ? 'blocks ✓' : 'blocks'}</button>` : '') +
      `<button data-skey="remove" data-round-type="${roundType}" data-step-index="${originalIdx}" title="Remove" style="background:transparent;border:1px solid var(--border);color:var(--text-secondary);border-radius:3px;padding:1px 8px;font-size:11px;cursor:pointer;">×</button>` +
    `</span>` +
  `</li>`;
}

// (Old `_renderStepCardEditable` was a single flat-list card — superseded by
// the two-tier rendering above. Group A entries render as pills, Group B as
// numbered cards.)

// Compares two step arrays for content equality. Used to decide whether the
// user has diverged from base.rb defaults (controls the inheritance hint).
// Treats { opts: undefined } and { opts: {} } as equivalent (canonical form).
function _stepsMatchDefaults(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].class !== b[i].class) return false;
    const ao = a[i].opts || {};
    const bo = b[i].opts || {};
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    for (const k of ak) if (ao[k] !== bo[k]) return false;
  }
  return true;
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

// ── Step-action dispatcher (wired by mechanics-panel.js after each render) ───
// Fires on click of any [data-skey] button in the rounds-steps-section. Reads
// data-skey (action name), data-round-type (which slot), data-step-index (when
// relevant). Mutates state.mechanics.rounds[roundType].steps in place, then
// triggers re-render + preview refresh + autosave — same surface as Tim's
// onRoundsInputChange handler in the shared region below.
function onRoundsStepAction(e) {
  const btn = e.currentTarget;
  if (!btn || !btn.dataset) return;
  const action    = btn.dataset.skey;
  const roundType = btn.dataset.roundType;
  if (!action || !roundType) return;
  if (typeof state === 'undefined' || !state.mechanics) return;
  if (!state.mechanics.rounds) return;

  const slot = state.mechanics.rounds[roundType];
  if (!slot) return;
  if (!Array.isArray(slot.steps)) slot.steps = [];

  const idx = btn.dataset.stepIndex != null ? parseInt(btn.dataset.stepIndex, 10) : -1;

  switch (action) {
    case 'add': {
      // Picker is the data-step-picker <select> sibling inside the same .rounds-steps-picker.
      const picker = btn.parentElement && btn.parentElement.querySelector('[data-step-picker]');
      const cls    = picker && picker.value;
      if (!cls) return;  // no selection — silent no-op
      slot.steps.push({ class: cls });
      break;
    }
    case 'remove': {
      if (Number.isNaN(idx) || idx < 0 || idx >= slot.steps.length) return;
      slot.steps.splice(idx, 1);
      break;
    }
    case 'move-up': {
      if (Number.isNaN(idx) || idx <= 0 || idx >= slot.steps.length) return;
      const tmp = slot.steps[idx - 1];
      slot.steps[idx - 1] = slot.steps[idx];
      slot.steps[idx] = tmp;
      break;
    }
    case 'move-down': {
      if (Number.isNaN(idx) || idx < 0 || idx >= slot.steps.length - 1) return;
      const tmp = slot.steps[idx + 1];
      slot.steps[idx + 1] = slot.steps[idx];
      slot.steps[idx] = tmp;
      break;
    }
    case 'toggle-blocks': {
      if (Number.isNaN(idx) || idx < 0 || idx >= slot.steps.length) return;
      const entry = slot.steps[idx];
      const opts  = Object.assign({}, entry.opts || {});
      if (opts.blocks) {
        delete opts.blocks;
        if (Object.keys(opts).length === 0) delete entry.opts;
        else entry.opts = opts;
      } else {
        opts.blocks = true;
        entry.opts = opts;
      }
      break;
    }
    case 'edit-rules': {
      // Open the dividend rules modal (owned by js/dividend-rules.js).
      // Modal manages its own state — return early so we don't double-render.
      if (Number.isNaN(idx) || idx < 0 || idx >= slot.steps.length) return;
      const entry = slot.steps[idx];
      if (typeof openDividendRulesModal !== 'function') return;
      openDividendRulesModal(entry, () => {
        if (typeof autosave === 'function') autosave();
        if (_stepsViewIsVisible() && typeof renderStepsPanelView === 'function') renderStepsPanelView();
        if (typeof renderMechanicsRight === 'function') renderMechanicsRight();
        if (typeof _refreshRbPreviewIfOpen === 'function') _refreshRbPreviewIfOpen();
      });
      return;
    }
    default:
      return;  // unknown action — no-op rather than throw
  }

  if (typeof autosave              === 'function') autosave();
  // Re-render whichever main view is currently active.
  if (_stepsViewIsVisible() && typeof renderStepsPanelView === 'function') renderStepsPanelView();
  if (typeof renderMechanicsRight  === 'function') renderMechanicsRight();
  if (typeof renderMechanicsLeft   === 'function') renderMechanicsLeft();
  if (typeof _refreshRbPreviewIfOpen === 'function') _refreshRbPreviewIfOpen();
}

// Re-renders the game.rb preview overlay if it's currently open. Safe no-op
// otherwise. Lets step mutations show up live in the preview without forcing
// a re-open. Reads the same DOM ids showRbPreview() writes (mechanics-panel.js).
function _refreshRbPreviewIfOpen() {
  const overlay = document.getElementById('mechRbOverlay');
  const code    = document.getElementById('mechRbCode');
  if (!overlay || !code) return;
  if (overlay.style.display !== 'flex') return;
  code.textContent = (typeof renderGameRb === 'function')
    ? renderGameRb()
    : '# export-game.js not loaded yet.\n';
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Shared (both must agree to edit) ────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// ── Wizard prose (placeholder content; co-write with Anthony for v1.x) ──────
// Each tab's "How does this round work?" card opens with this copy. Plain 18xx
// terms, no engine class names. Real prose is its own deliverable per
// STEPS_INFERENCE.md §10.
const _WIZARD_PROSE = {
  initial: `<p>The Initial round runs once at game start. Players acquire the private companies that will be available — by bidding (1830), drafting (1846), or face-value purchase (1822 bidbox). The round ends when every private has an owner.</p>
            <p>Most games inherit the engine default (Waterfall Auction). Change the round class above only if your game uses a different startup mechanism — draft, certificate selection, or a fully custom flow.</p>
            <p style="color:var(--text-dim);font-size:11px;font-style:italic;">Wizard prose is a placeholder. Anthony to co-author final copy.</p>`,
  stock: `<p>Stock rounds let players buy and sell company shares, par new corporations, and (in some games) exchange privates for shares of their linked majors.</p>
          <p>The order of actions matters less here — most stock-round steps are non-blocking interrupts. A player may declare bankruptcy, exchange a company, or trigger a private's special ability at any point during their turn.</p>
          <p style="color:var(--text-dim);font-size:11px;font-style:italic;">Wizard prose is a placeholder. Anthony to co-author final copy.</p>`,
  operating: `<p>Operating rounds are the heart of every 18xx game. Each company in turn lays track, places station tokens, runs trains, pays or withholds dividends, and buys new trains.</p>
              <p>The <strong>blocking sequence</strong> below (Track → Token → Route → Dividend → Buy Train, etc.) is the play timeline — a company resolves each step in order before the round moves on. The <strong>interrupt menu</strong> above (Bankruptcy, Exchange, Special Track/Token, early BuyCompany, DiscardTrain) is available throughout — a player may take any of those actions at any moment during their turn.</p>
              <p>Bankruptcy isn't "first" in time — it's a non-blocking action available throughout. The button is always offered; the engine only allows it when the corp actually qualifies.</p>
              <p style="color:var(--text-dim);font-size:11px;font-style:italic;">Wizard prose is a placeholder. Anthony to co-author final copy.</p>`,
  merger: `<p>Merger rounds happen when game mechanics require companies to fold or combine — typically in 1817-style games. The structure depends entirely on the merger flow your game uses.</p>
           <p>Merger rounds are always game-specific; the engine has no default. You'll need a custom round subclass and a step list reflecting your particular merger flow.</p>
           <p style="color:var(--text-dim);font-size:11px;font-style:italic;">Wizard prose is a placeholder. Anthony to co-author final copy.</p>`,
};

// Per-round wizard collapsed state. Module-local; not persisted to state.
// Default: open on first visit so users see the explanation. Closing it
// remembers the choice for the duration of the session.
let _wizardCollapsed = { initial: false, stock: false, operating: false, merger: false };

const _ROUND_LABELS = {
  initial:   'Initial Round',
  stock:     'Stock Round',
  operating: 'Operating Round',
  merger:    'Merger Round',
};

// ── Export-validity signal (per EXPORT_COHERENCE.md §4) ─────────────────────
// Aggregate validator across all three concerns:
//   - validateStepConstraints  — this file, takes (state), returns flat findings.
//   - _validateRoundClass      — mechanics-panel.js:532, takes (slot) per round.
//                                Returns slot-scoped findings; aggregate tags
//                                each with `round` and a `path` so they sort
//                                into the same buckets as step findings.
//   - _validateEndHook         — mechanics-panel.js:570, takes (slot, roundType)
//                                per round. Returns slot-scoped findings; tagged
//                                the same way.
// All three helpers are optional — picked up via `typeof` so the aggregate
// stays tolerant of partial implementation. Each helper is called inside a
// try/catch so a crashing validator becomes a finding, not a blank panel.
//
// Severity normalisation: round-system uses 'warn'; step-system uses
// 'warning'. The aggregate translates 'warn' → 'warning' so _signalSeverity's
// downstream comparisons don't have to handle both spellings.
function validateExportCoherence(state) {
  const findings = [];

  // Step-system validator — already takes (state) and emits per-step findings.
  if (typeof validateStepConstraints === 'function') {
    try { findings.push(...(validateStepConstraints(state) || [])); }
    catch (e) { findings.push({ severity: 'error', code: 'VALIDATOR_THREW',
      path: 'validateStepConstraints',
      message: 'validateStepConstraints crashed: ' + (e && e.message) }); }
  }

  // Cross-panel validator (validate-game.js) — Map ↔ Companies, Trains ↔
  // Phases, Companies ↔ Market, Entities ↔ Mechanics, drift shadows.
  // Findings already match this aggregate's shape (severity / code /
  // message / path / hexId? / corpSym?).
  if (typeof validateGame === 'function') {
    try { findings.push(...(validateGame(state) || [])); }
    catch (e) { findings.push({ severity: 'error', code: 'VALIDATOR_THREW',
      path: 'validateGame',
      message: 'validateGame crashed: ' + (e && e.message) }); }
  }

  // Round-system validators — per-slot fanout. Iterate over each round slot,
  // call each helper, normalise the returned findings to the aggregate shape
  // (severity, code, message, path, round).
  const rounds = (state && state.mechanics && state.mechanics.rounds) || {};
  ['initial', 'stock', 'operating', 'merger'].forEach(roundType => {
    const slot = rounds[roundType];
    if (!slot) return;
    // Skip merger when not enabled — _validateEndHook bails on missing
    // endHook anyway, but _validateRoundClass would emit a "class is null"
    // finding for the disabled merger slot.
    const mergerActive = roundType === 'merger' && (slot.enabled === true || !!slot.class);
    if (roundType === 'merger' && !mergerActive) return;

    const slotPath = `mechanics.rounds.${roundType}`;

    if (typeof _validateRoundClass === 'function') {
      try {
        (_validateRoundClass(slot) || []).forEach(f => {
          findings.push({
            severity: f.severity === 'warn' ? 'warning' : f.severity,
            code:     f.code || 'ROUND_CLASS',
            message:  f.message,
            path:     slotPath + (slot && slot.class === null ? '.class' : ''),
            round:    roundType,
          });
        });
      } catch (e) {
        findings.push({ severity: 'error', code: 'VALIDATOR_THREW',
          path: slotPath, round: roundType,
          message: `_validateRoundClass(${roundType}) crashed: ` + (e && e.message) });
      }
    }

    if (typeof _validateEndHook === 'function') {
      try {
        (_validateEndHook(slot, roundType) || []).forEach(f => {
          findings.push({
            severity: f.severity === 'warn' ? 'warning' : f.severity,
            code:     f.code || 'END_HOOK',
            message:  f.message,
            path:     `${slotPath}.endHook`,
            round:    roundType,
          });
        });
      } catch (e) {
        findings.push({ severity: 'error', code: 'VALIDATOR_THREW',
          path: `${slotPath}.endHook`, round: roundType,
          message: `_validateEndHook(${roundType}) crashed: ` + (e && e.message) });
      }
    }
  });

  return findings;
}

// Reduces a findings list to a single severity bucket: 'red' | 'amber' | 'green'.
// 'info' findings don't affect the bucket — they're acknowledgements, not issues.
function _signalSeverity(findings) {
  if (!findings || findings.length === 0) return 'green';
  if (findings.some(f => f.severity === 'error'))   return 'red';
  if (findings.some(f => f.severity === 'warning')) return 'amber';
  return 'green';
}

// Per-tab severity — filters findings with `round === <tab>` (plus untagged
// findings, which apply globally) and runs _signalSeverity over the subset.
function _perTabSeverity(findings, tab) {
  return _signalSeverity((findings || []).filter(f => !f.round || f.round === tab));
}

// Counts of error / warning findings, for the header label.
function _signalCounts(findings) {
  const f = findings || [];
  return {
    errors:   f.filter(x => x.severity === 'error').length,
    warnings: f.filter(x => x.severity === 'warning').length,
    infos:    f.filter(x => x.severity === 'info').length,
  };
}

// Header dot + label rendered next to the panel title. Always shown — green
// when nothing is wrong, amber for warnings, red for blocking errors. When
// findings exist (sev is amber or red), the dot+label is a clickable button
// that expands the validity-detail accordion and scrolls it into view. When
// green, it's an inert label (nothing to expand to).
function _renderExportValiditySignal(findings) {
  const sev = _signalSeverity(findings);
  const c   = _signalCounts(findings);
  let label;
  if (sev === 'red') {
    label = c.errors === 1 ? '1 error — will not load' : `${c.errors} errors — will not load`;
  } else if (sev === 'amber') {
    label = c.warnings === 1 ? '1 warning' : `${c.warnings} warnings`;
  } else {
    label = 'Export ready';
  }
  const dotHTML   = `<span class="mech-status-dot ${sev}" style="display:inline-block;vertical-align:middle;margin:0 6px 0 4px;" title="${label}"></span>`;
  const labelHTML = `<span style="font-size:11px;color:var(--text-dim);font-weight:400;letter-spacing:0;">${label}</span>`;
  if (sev === 'green') {
    return dotHTML + labelHTML;
  }
  // Clickable: expand + scroll the accordion. Inline button styling so the
  // affordance reads as part of the title rather than a competing element.
  return `<button type="button" data-validity-expand title="Click to view ${sev === 'red' ? 'errors' : 'warnings'}" style="background:transparent;border:none;cursor:pointer;padding:0;display:inline-flex;align-items:center;font:inherit;color:inherit;">${dotHTML}${labelHTML}<span style="margin-left:4px;font-size:10px;color:var(--text-muted);">▾</span></button>`;
}

// Module state for the validity-detail accordion at the bottom of the panel.
// Default-open the first time findings appear; once dismissed, stays closed
// until next render with new findings.
let _validityAccordionCollapsed = false;

function _renderExportValidityAccordion(findings) {
  if (!findings || findings.length === 0) return '';
  const sev = _signalSeverity(findings);
  if (sev === 'green') return '';  // info-only — nothing actionable

  // Group findings by round, with un-tagged findings under "(global)".
  const byRound = { initial: [], stock: [], operating: [], merger: [], _global: [] };
  findings.forEach(f => {
    if (f.severity === 'info') return;  // info doesn't show in the issues list
    const bucket = f.round && byRound[f.round] ? byRound[f.round] : byRound._global;
    bucket.push(f);
  });

  const collapsed = _validityAccordionCollapsed;
  const lines = [];
  lines.push('<div style="margin-top:18px;border:1px solid var(--border);border-radius:5px;background:var(--bg-surface);">');
  lines.push(`  <button type="button" data-validity-toggle style="width:100%;background:transparent;border:none;color:var(--text-secondary);text-align:left;padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;letter-spacing:.02em;">`);
  lines.push(`    <span style="font-size:9px;width:10px;display:inline-block;transform:${collapsed ? 'none' : 'rotate(90deg)'};transition:transform .15s;">▶</span>`);
  lines.push(`    <span class="mech-status-dot ${sev}" style="display:inline-block;"></span>`);
  lines.push(`    <span>Export validity — ${_signalCounts(findings).errors + _signalCounts(findings).warnings} issue${(_signalCounts(findings).errors + _signalCounts(findings).warnings) === 1 ? '' : 's'} to review</span>`);
  lines.push('  </button>');

  if (!collapsed) {
    lines.push('  <div style="padding:8px 14px 12px;border-top:1px solid var(--border);">');
    const labels = { initial: 'Initial', stock: 'Stock', operating: 'Operating', merger: 'Merger', _global: '(panel-wide)' };
    ['initial', 'stock', 'operating', 'merger', '_global'].forEach(key => {
      const items = byRound[key];
      if (!items || items.length === 0) return;
      lines.push(`    <div style="margin-top:6px;font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.04em;">${labels[key]}</div>`);
      lines.push('    <ul style="list-style:none;padding:0;margin:4px 0 0;display:flex;flex-direction:column;gap:4px;">');
      items.forEach(f => {
        const dotSev = f.severity === 'error' ? 'red' : (f.severity === 'warning' ? 'amber' : 'green');
        const indexHint = (f.stepIndex != null) ? ` <span style="color:var(--text-muted);font-family:monospace;font-size:10px;">[step ${f.stepIndex}]</span>` : '';
        const codeBadge = `<code style="color:var(--text-muted);font-size:10px;font-family:monospace;">${f.code}</code>`;
        lines.push(`      <li style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--text-secondary);line-height:1.5;">`);
        lines.push(`        <span class="mech-status-dot ${dotSev}" style="margin-top:5px;flex-shrink:0;"></span>`);
        lines.push(`        <span>${f.message}${indexHint}<br>${codeBadge}</span>`);
        lines.push('      </li>');
      });
      lines.push('    </ul>');
    });
    lines.push('  </div>');
  }
  lines.push('</div>');
  return lines.join('\n');
}

function onValidityAccordionToggle(_e) {
  _validityAccordionCollapsed = !_validityAccordionCollapsed;
  renderStepsPanelView();
}

// Header-signal click — always EXPAND the accordion (regardless of prior
// state), then scroll it into view so the user sees the issue list without
// having to scroll the panel manually. Wired separately from the accordion's
// own toggle button so the header is "show me" while the accordion header
// is "toggle".
function onValidityHeaderExpand(_e) {
  _validityAccordionCollapsed = false;
  renderStepsPanelView();
  // Scroll the accordion into view after the re-render. Defer to next tick
  // so the new DOM is in place before scrollIntoView runs.
  setTimeout(() => {
    const view = document.getElementById('stepsView');
    if (!view) return;
    const accordion = view.querySelector('[data-validity-toggle]');
    if (accordion && accordion.scrollIntoView) {
      accordion.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 0);
}

// ── Top-level STEPS panel renderer (replaces #stepsView innerHTML) ──────────
// Called by wireStepsPanel() on icon click and after every state mutation that
// affects step lists. Builds the full panel:
//   title + sub-tabs
//   wizard card (collapsible explainer)
//   Tier A — "When does this round run, and what kind of round is it?"
//     (round class identity + opts; subclass body lives in Tier C)
//   Tier B — "What can players do during it?"
//     (Group A non-blocking pool + Group B sequenced timeline)
//   Tier C — "What happens at the end?" (collapsed accordion)
//     two slots: Round End (subclass-level finish_round / setup /
//     or_round_finished) and Round Transition (game-class next_round! branch)
//   live game.rb preview pane
//
// Step rendering inside Tier B is unchanged this PR — the Dividend "Rules"
// pill hook from dividend-rules.js stays intact.
function renderStepsPanelView() {
  const view = document.getElementById('stepsView');
  if (!view) return;
  initRoundsState();
  const activeTab = _activeRoundsTab || 'initial';
  const rounds    = (typeof state !== 'undefined' && state.mechanics && state.mechanics.rounds) || {};
  const r         = rounds[activeTab] || {};

  // Run validators once per render. Findings drive the header dot,
  // per-tab dots on the sub-tab bar, and the click-through detail accordion.
  const findings   = validateExportCoherence(typeof state !== 'undefined' ? state : {});
  const headerDot  = _renderExportValiditySignal(findings);

  view.innerHTML = [
    '<div style="max-width:980px;margin:0 auto;">',
    `  <h2 style="margin:0 0 4px 0;font-weight:500;letter-spacing:.04em;color:var(--text-primary);">Round Steps${headerDot}</h2>`,
    `  <p class="mech-hint" style="margin:0 0 12px;">Configure the order of actions in each round. Empty step lists fall through to base.rb defaults.</p>`,
       _renderRoundFlowDiagram(rounds, activeTab),
    `  <div class="corp-tab-bar" style="margin-bottom:0;">`,
         _ROUND_SUB_TABS.map(t => {
           const tabSev = _perTabSeverity(findings, t.id);
           const dot    = tabSev !== 'green'
             ? `<span class="mech-status-dot ${tabSev}" style="display:inline-block;margin-left:6px;vertical-align:middle;" title="${tabSev === 'red' ? 'Errors on this tab' : 'Warnings on this tab'}"></span>`
             : '';
           return `    <button type="button" class="corp-tab-btn${t.id === activeTab ? ' active' : ''}" data-rounds-tab="${t.id}">${t.label}${dot}</button>`;
         }).join('\n'),
    '  </div>',
    `  <div style="border:1px solid var(--border);border-top:none;border-radius:0 0 6px 6px;padding:18px 20px;background:var(--bg-elevated);">`,
         _renderWizardCard(activeTab, r),
         _renderTierHeading('When does this round run, and what kind of round is it?'),
         _renderRoundClassSection(activeTab, r),
         _renderTierHeading('What can players do during it?'),
         _renderRoundStepsSection(activeTab, r),
         _renderTierC(activeTab, r),
         _renderStepsPreviewPane(activeTab, r),
         _renderExportValidityAccordion(findings),
    '  </div>',
    '</div>',
  ].join('\n');

  _attachStepsListeners(view);
}

// Question-form heading shown above each tier. Compact, no borders — the
// existing tier content provides its own visual container.
function _renderTierHeading(question) {
  return `<h3 style="margin:14px 0 8px 0;font-size:12px;font-weight:600;color:var(--text-secondary);letter-spacing:.02em;">${question}</h3>`;
}

// Wizard card — collapsible explainer. Auto-open on first visit per session;
// dismissible; reopenable via the "How does this round work?" pill button.
function _renderWizardCard(roundType, _r) {
  const collapsed = !!_wizardCollapsed[roundType];
  const label     = _ROUND_LABELS[roundType] || 'Round';

  if (collapsed) {
    return `<div style="margin-bottom:16px;">
      <button class="mech-btn-small" data-wizard-toggle="${roundType}" title="Show the wizard explainer for this round">ⓘ How does the ${label} work?</button>
    </div>`;
  }

  return `<div style="margin-bottom:18px;background:var(--accent-dim);border:1px solid var(--accent-dim);border-left:4px solid var(--accent);border-radius:5px;padding:12px 14px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <strong style="color:var(--accent);font-size:13px;letter-spacing:.03em;">ⓘ How the ${label} works</strong>
      <button class="mech-btn-small" data-wizard-toggle="${roundType}" title="Hide this explainer">Hide</button>
    </div>
    <div style="color:var(--text-secondary);font-size:12px;line-height:1.6;">${_WIZARD_PROSE[roundType] || ''}</div>
  </div>`;
}

// Live game.rb preview — shows the actual `def <round>` block this tab's
// configuration will emit. Updates on every state mutation.
function _renderStepsPreviewPane(roundType, _r) {
  const methodName = _stepsRoundMethodName(roundType);
  let body = '';
  try {
    if (typeof renderGameRb === 'function') {
      const full = renderGameRb();
      // Best-effort extract of the round method body. Falls back to full game.rb.
      const re = new RegExp('def\\s+' + methodName + '[^\\n]*\\n[\\s\\S]*?\\n\\s*end', 'm');
      const m = full.match(re);
      body = m ? m[0] : `# def ${methodName} not emitted — likely matches base.rb default (silent inherit).`;
    } else {
      body = '# export-game.js not loaded yet.';
    }
  } catch (e) {
    body = '# Preview render error: ' + (e && e.message);
  }

  const escaped = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<div style="margin-top:16px;">
    <div class="mech-slot-num" style="margin-bottom:6px;">Live preview — game.rb output for this round</div>
    <pre style="background:var(--bg-card);border:1px solid var(--border);border-radius:5px;padding:12px 14px;margin:0;font-family:monospace;font-size:11px;line-height:1.55;color:var(--text-secondary);overflow-x:auto;white-space:pre;">${escaped}</pre>
  </div>`;
}

// ── Tier C — "What happens at the end?" accordion ───────────────────────────
// Two named slots inside one collapsed-by-default accordion:
//   - Round End  — endHook  (subclass-level finish_round / setup; for the
//                  Operating tab, becomes a game-class or_round_finished)
//   - Round Transition — transitionHook  (per-tab branch contributing to a
//                  single game-class def next_round!)
//
// Per-tab emission targets (matches the per-system-review annotation in
// EXPORT_COHERENCE.md §2):
//   tab        | endHook becomes               | name field?
//   ───────────┼───────────────────────────────┼────────────
//   initial    | def setup (subclass)          | yes
//   stock      | def finish_round (subclass)   | yes
//   operating  | def or_round_finished (game)  | NO — game-class method
//   merger     | def finish_round (subclass)   | yes

// Per-tab metadata for the Round End slot. method = the Ruby method name the
// body wraps as. subclass = whether non-empty body triggers a round-subclass
// (and thus a name field). hint = user-facing description.
const _END_HOOK_TARGETS = {
  initial:   { method: 'setup',              subclass: true,  hint: 'Round-subclass setup hook (rare).' },
  stock:     { method: 'finish_round',       subclass: true,  hint: 'Bidbox settlement, train export, loan interest, etc.' },
  operating: { method: 'or_round_finished',  subclass: false, hint: 'Game-class hook — fires after each OR. 1817 train-export, 1867 phase-gated export.' },
  merger:    { method: 'finish_round',       subclass: true,  hint: 'Per-game merger cleanup logic.' },
};

// Round End preset catalog. Each entry is a starting-point body the designer
// can paste into endHook.body via the preset dropdown in the Tier C accordion.
// Bodies are bare statements (no `def` wrapper) — the emit module wraps them
// per the per-tab method name from _END_HOOK_TARGETS.
//
// applicableTabs gates which preset shows up in which sub-tab's dropdown:
//   round-subclass targets (Stock/Init/Merger): finish_round / setup bodies
//   game-class targets    (Operating):          or_round_finished bodies
//
// Every body is ported verbatim from a tobymao source file — see `source` for
// the file:line reference. RCA discipline: read source first, no invention.
const _ROUND_END_PRESETS = [
  {
    id:    '1822_stock_bidbox',
    label: '1822-style bidbox settlement',
    description:
      'Float minors, settle concession/private bids, refill bidbox, accrue ' +
      'player loan interest. Calls round-subclass helpers (highest_bid, ' +
      'buy_company, float_minor, remove_l_trains, remove_minor_and_first_train) ' +
      'that you must port from g_1822/round/stock.rb.',
    applicableTabs: ['stock', 'initial', 'merger'],
    source: 'lib/engine/game/g_1822/round/stock.rb:45-97',
    body:
      "return @game.end_game!(:dnf) if @game.class::GAME_END_ON_NOTHING_SOLD_IN_SR1 && @game.nothing_sold_in_sr?\n" +
      "\n" +
      "float_minors = []\n" +
      "minor_count = 0\n" +
      "remove_l_count = 0\n" +
      "remove_minor = nil\n" +
      "@game.bidbox_minors.each_with_index do |minor, index|\n" +
      "  if (bid = highest_bid(minor))\n" +
      "    float_minors << [bid, index]\n" +
      "  else\n" +
      "    minor.owner = nil\n" +
      "    remove_l_count += 1\n" +
      "    remove_minor = minor if index.zero?\n" +
      "  end\n" +
      "  minor_count += 1\n" +
      "end\n" +
      "\n" +
      "@game.bidbox_concessions.each do |concessions|\n" +
      "  if (bid = highest_bid(concessions))\n" +
      "    buy_company(bid)\n" +
      "  else\n" +
      "    concessions.owner = nil\n" +
      "  end\n" +
      "end\n" +
      "\n" +
      "@game.bidbox_privates.each do |company|\n" +
      "  if (bid = highest_bid(company))\n" +
      "    buy_company(bid)\n" +
      "  else\n" +
      "    company.owner = nil\n" +
      "  end\n" +
      "end\n" +
      "\n" +
      "# Sort the minors first according to bid price, highest first. If a tie, lowest index first\n" +
      "float_minors.sort_by { |m| [m[0].price, minor_count - m[1]] }.reverse_each do |arr|\n" +
      "  float_minor(arr[0])\n" +
      "end\n" +
      "\n" +
      "# Every minor with no bids will export a L/2 train. If no bid on first minors bidbox an additional\n" +
      "# train will be exported, additionally the minor is also removed from the game.\n" +
      "remove_l_trains(remove_l_count) if remove_l_count.positive? && @game.depot.upcoming.first.name == 'L'\n" +
      "remove_minor_and_first_train(remove_minor) if remove_minor\n" +
      "\n" +
      "# Refill the minors bidbox\n" +
      "@game.bidbox_minors_refill!\n" +
      "\n" +
      "# Increase player loans with 50% interest\n" +
      "@game.add_interest_player_loans!\n" +
      "\n" +
      "super",
  },
  {
    id:    '1817_or_export',
    label: '1817-style train export every OR',
    description:
      'Unconditional end-of-OR train export. Exports all 2-trains when the ' +
      'next train is a 2; otherwise exports one train. Ported from ' +
      'g_1817/game.rb#or_round_finished.',
    applicableTabs: ['operating'],
    source: 'lib/engine/game/g_1817/game.rb:980-988',
    body:
      "return if @depot.upcoming.empty?\n" +
      "\n" +
      "if @depot.upcoming.first.name == '2'\n" +
      "  depot.export_all!('2')\n" +
      "else\n" +
      "  depot.export!\n" +
      "end",
  },
  {
    id:    '1867_phase_export',
    label: '1867-style phase-gated train export',
    description:
      'End-of-OR train export gated on the `export_train` phase status. ' +
      'When active, exports one train, processes the post-train-buy hook, ' +
      'and runs game-end check. Ported from g_1867/game.rb#or_round_finished.',
    applicableTabs: ['operating'],
    source: 'lib/engine/game/g_1867/game.rb:879-885',
    body:
      "return unless @phase.status.include?('export_train')\n" +
      "\n" +
      "depot.export!\n" +
      "post_train_buy\n" +
      "game_end_check",
  },
  {
    id:    '1861_noop',
    label: '1861-style explicit no-op',
    description:
      'Explicit empty `or_round_finished` — equivalent to inheriting the ' +
      'engine default but documents intent. Use when the parent class would ' +
      'otherwise inherit a hook you want to disable. Ported from ' +
      'g_1861/game.rb#or_round_finished.',
    applicableTabs: ['operating'],
    source: 'lib/engine/game/g_1861/game.rb:288',
    body: '',
  },
];

// Filter presets for a sub-tab. Returns presets whose applicableTabs includes
// the round type. Used by the Tier C dropdown.
function _presetsForTab(roundType) {
  return _ROUND_END_PRESETS.filter(p => p.applicableTabs.includes(roundType));
}

// Lookup a preset by id. Returns null when not found.
function _findPresetById(id) {
  if (!id) return null;
  return _ROUND_END_PRESETS.find(p => p.id === id) || null;
}

// Tier C accordion collapsed-state per round. Module-local; not persisted.
// Defaults to collapsed (advanced section).
let _tierCCollapsed = { initial: true, stock: true, operating: true, merger: true };

// Reads either the new slot.endHook or the legacy slot.subclass during the
// migration window. Returns { name, body } or null.
function _readEndHook(slot) {
  if (slot && slot.endHook) return { name: slot.endHook.name || '', body: slot.endHook.body || '' };
  if (slot && slot.subclass) return { name: slot.subclass.name || '', body: slot.subclass.body || '' };
  return null;
}

function _readTransitionHook(slot) {
  if (slot && slot.transitionHook) return { body: slot.transitionHook.body || '' };
  return null;
}

function _renderTierC(roundType, slot) {
  const collapsed = !!_tierCCollapsed[roundType];
  const endHook   = _readEndHook(slot);
  const transHook = _readTransitionHook(slot);
  const hasContent = !!((endHook && endHook.body) || (transHook && transHook.body));
  const hint = hasContent
    ? '<span class="mech-status-dot amber" style="display:inline-block;margin-left:6px;vertical-align:middle;" title="Custom Ruby will be emitted"></span>'
    : '';

  const lines = [];
  lines.push('<div style="margin-top:14px;border:1px solid var(--border);border-radius:5px;background:var(--bg-surface);">');
  lines.push(`  <button type="button" data-tierc-toggle="${roundType}" style="width:100%;background:transparent;border:none;color:var(--text-secondary);text-align:left;padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;letter-spacing:.02em;">`);
  lines.push(`    <span style="font-size:9px;width:10px;display:inline-block;transform:${collapsed ? 'none' : 'rotate(90deg)'};transition:transform .15s;">▶</span>`);
  lines.push(`    <span>What happens at the end? <span class="mech-hint-inline" style="font-weight:400;">— advanced; Ruby method bodies for round end + transition</span></span>`);
  lines.push(`    ${hint}`);
  lines.push('  </button>');

  if (!collapsed) {
    lines.push('  <div style="padding:6px 14px 14px;border-top:1px solid var(--border);">');
    lines.push(_renderEndHookEditor(roundType, endHook));
    lines.push(_renderTransitionHookEditor(roundType, transHook));
    lines.push('  </div>');
  }

  lines.push('</div>');
  return lines.join('\n');
}

// Round End editor — preset dropdown (placeholder for v2), optional name
// field for tabs whose endHook becomes a subclass method, body textarea.
function _renderEndHookEditor(roundType, endHook) {
  const target = _END_HOOK_TARGETS[roundType] || { method: 'finish_round', subclass: false, hint: '' };
  const body   = (endHook && endHook.body) || '';
  const name   = (endHook && endHook.name) || '';
  const hasBody = body.trim().length > 0;

  // Default name = parent simple name (Stock / Operating / etc.) — only
  // shown for tabs whose endHook generates a round subclass.
  const defaultName = roundType.charAt(0).toUpperCase() + roundType.slice(1);

  // For subclass-bearing tabs, surface the implicit class declaration so the
  // designer sees what's being generated when body is non-empty.
  const derivedClassLine = (target.subclass && hasBody)
    ? `<div class="mech-hint" style="margin:0 0 6px;font-family:monospace;font-size:10px;color:var(--text-dim);">Will emit: <span style="color:var(--text-secondary);">G&lt;game&gt;::Round::<strong style="color:var(--accent);">${(name || defaultName).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</strong> &lt; Engine::Round::${defaultName}</span></div>`
    : '';

  const lines = [];
  lines.push('<div class="mech-slot" style="margin-bottom:10px;">');
  lines.push(`  <div class="mech-slot-num">Round End — <code>def ${target.method}</code> ${target.subclass ? 'on the round subclass' : 'on the game class'}</div>`);
  lines.push(`  <p class="mech-hint" style="margin:0 0 8px;">${target.hint}</p>`);

  // Preset picker — filtered to presets whose target matches this sub-tab.
  // Selecting a preset populates the body textarea below if currently empty
  // (see onRoundsInputChange's preset handling). Bodies are ported verbatim
  // from tobymao source — see _ROUND_END_PRESETS for file:line refs.
  const presets    = _presetsForTab(roundType);
  const currentPid = (endHook && endHook.preset) || '';
  if (presets.length > 0) {
    lines.push('  <label style="font-size:11px;color:var(--text-dim);">Starting from a preset');
    lines.push(`    <select data-rkey="${roundType}.endHook.preset" style="background:var(--bg-elevated);border:1px solid var(--border-mid);border-radius:4px;color:var(--text-primary);padding:3px 6px;font-size:11px;max-width:280px;">`);
    lines.push(`      <option value="" ${currentPid === '' ? 'selected' : ''}>Custom (start blank)</option>`);
    presets.forEach(p => {
      const sel = currentPid === p.id ? 'selected' : '';
      lines.push(`      <option value="${p.id}" ${sel}>${p.label}</option>`);
    });
    lines.push('    </select>');
    lines.push('  </label>');
    // Description for the currently-picked preset (helps users understand
    // what they're getting before they apply / edit).
    const activePreset = _findPresetById(currentPid);
    if (activePreset) {
      lines.push(`  <p class="mech-hint" style="margin:4px 0 6px;font-size:10px;line-height:1.5;">${activePreset.description} <span style="color:var(--text-dim);">Source: <code>${activePreset.source}</code></span></p>`);
    }
  }

  // Subclass name field — only on tabs whose endHook generates a subclass.
  if (target.subclass) {
    lines.push('  <label style="font-size:11px;color:var(--text-dim);">Subclass name <span class="mech-hint-inline">(default = parent class simple name)</span>');
    lines.push(`    <input type="text" data-rkey="${roundType}.endHook.name" value="${(name).replace(/"/g, '&quot;')}" placeholder="${defaultName}" style="font-family:monospace;max-width:240px;">`);
    lines.push('  </label>');
  }

  if (derivedClassLine) lines.push('  ' + derivedClassLine);

  // Method body textarea — raw Ruby, emitted verbatim. Lazy: no parsing.
  lines.push(`  <label style="font-size:11px;color:var(--text-dim);">Method body <span class="mech-hint-inline">(raw Ruby — emitted verbatim inside <code>def ${target.method}</code>)</span>`);
  lines.push(`    <textarea data-rkey="${roundType}.endHook.body" rows="6" placeholder="# e.g. minor.close! if minor.trains.empty?\n# @bidbox.refill!\n# @depot.export! if @phase.status.include?('export_train')" style="font-family:monospace;font-size:11px;line-height:1.5;background:var(--bg-elevated);border:1px solid var(--border-mid);border-radius:4px;color:var(--text-primary);padding:6px 8px;resize:vertical;min-height:80px;width:100%;box-sizing:border-box;">${body.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</textarea>`);
  lines.push('  </label>');
  lines.push('</div>');
  return lines.join('\n');
}

// Round Transition editor — body only; appends one when-branch to the
// generated def next_round! on the game class. No name field (next_round! is
// always a single game-class method, never a subclass).
function _renderTransitionHookEditor(roundType, transHook) {
  const body    = (transHook && transHook.body) || '';
  const lines   = [];
  lines.push('<div class="mech-slot" style="margin-bottom:0;">');
  lines.push('  <div class="mech-slot-num">Round Transition — branch in <code>def next_round!</code> on the game class</div>');
  lines.push('  <p class="mech-hint" style="margin:0 0 8px;">Per-tab routing override. The emit module merges all four tabs\' transitionHook bodies into a single <code>def next_round!</code> with one <code>when</code> branch per non-null slot. 1846 player-count branching at init, 1867 merger insertion between OR sets, 1822 SR→Choices nominate.</p>');
  lines.push(`  <label style="font-size:11px;color:var(--text-dim);">Branch body <span class="mech-hint-inline">(raw Ruby — runs when current round is ${roundType})</span>`);
  lines.push(`    <textarea data-rkey="${roundType}.transitionHook.body" rows="4" placeholder="# e.g. @round_history.last.is_a?(Round::Operating) ? new_stock_round : new_operating_round(@round.round_num + 1)" style="font-family:monospace;font-size:11px;line-height:1.5;background:var(--bg-elevated);border:1px solid var(--border-mid);border-radius:4px;color:var(--text-primary);padding:6px 8px;resize:vertical;min-height:60px;width:100%;box-sizing:border-box;">${body.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</textarea>`);
  lines.push('  </label>');
  lines.push('</div>');
  return lines.join('\n');
}

function onTierCToggle(e) {
  const t = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tiercToggle;
  if (!t) return;
  _tierCCollapsed[t] = !_tierCCollapsed[t];
  renderStepsPanelView();
}

// Re-attach event listeners after every render. Mirror of mechanics-panel.js's
// approach — innerHTML wipe destroys old listeners, so re-bind here.
function _attachStepsListeners(root) {
  if (!root) return;
  root.querySelectorAll('[data-rkey]').forEach(input => {
    input.addEventListener('change', onRoundsInputChange);
  });
  root.querySelectorAll('[data-rounds-tab]').forEach(btn => {
    btn.addEventListener('click', onRoundsTabClick);
  });
  root.querySelectorAll('[data-skey]').forEach(btn => {
    btn.addEventListener('click', onRoundsStepAction);
  });
  root.querySelectorAll('[data-tierc-toggle]').forEach(btn => {
    btn.addEventListener('click', onTierCToggle);
  });
  root.querySelectorAll('[data-validity-toggle]').forEach(btn => {
    btn.addEventListener('click', onValidityAccordionToggle);
  });
  root.querySelectorAll('[data-validity-expand]').forEach(btn => {
    btn.addEventListener('click', onValidityHeaderExpand);
  });
  root.querySelectorAll('[data-wizard-toggle]').forEach(btn => {
    btn.addEventListener('click', onWizardToggle);
  });
}

function onWizardToggle(e) {
  const t = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.wizardToggle;
  if (!t) return;
  _wizardCollapsed[t] = !_wizardCollapsed[t];
  renderStepsPanelView();
}

// Returns true if the STEPS panel is the currently-visible main view. Used by
// rounds mutation handlers to decide whether to re-render this view.
function _stepsViewIsVisible() {
  const view = document.getElementById('stepsView');
  return !!(view && view.style.display !== 'none' && view.style.display !== '');
}

// ── Top-level STEPS panel wiring ────────────────────────────────────────────
// The Rounds editor lived inside Mechanics through PR1c. Per Anthony's spec,
// it now gets its own top-level icon in the left rail (data-lsec="steps") and
// its own view container (#stepsView in index.html). The panel is currently a
// placeholder ("Redesign in progress") while the inference-driven redesign is
// drafted in STEPS_INFERENCE.md.
//
// Pattern mirrors wireMechanicsPanel: when STEPS is clicked, hide every other
// main view and show #stepsView. When any other nav button is clicked, hide
// #stepsView so the next view can take over cleanly.
function wireStepsPanel() {
  const navBtn = document.querySelector('[data-lsec="steps"]');
  if (!navBtn) return;

  navBtn.addEventListener('click', () => {
    // setup.js's nav-rail handler runs first and falls through to
    // showMainView('canvas'). Undo that here so #stepsView can take over.
    const navContentEl   = document.getElementById('navContent');
    const toggleLeftBtn  = document.getElementById('toggleLeftPanelBtn');
    const rightPanel     = document.getElementById('rightPanel');
    const toggleRightBtn = document.getElementById('toggleRightPanelBtn');

    if (navContentEl)   navContentEl.style.display   = 'none';
    if (toggleLeftBtn)  toggleLeftBtn.style.display  = 'none';
    if (rightPanel)     rightPanel.style.display     = 'none';
    if (toggleRightBtn) toggleRightBtn.style.display = 'none';

    ['canvasContainer','marketView','corpView','trainsView','mechanicsView'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    document.querySelectorAll('.nav-rail-btn').forEach(b => b.classList.remove('active'));
    navBtn.classList.add('active');

    const view = document.getElementById('stepsView');
    if (view) view.style.display = 'flex';

    // Render the panel content. innerHTML is rewritten on every show so the
    // user always sees current state (post-import, post-state-mutation, etc.).
    renderStepsPanelView();
  });

  // Other nav buttons should hide stepsView the same way they hide mechanicsView.
  document.querySelectorAll('.nav-rail-btn[data-lsec]:not([data-lsec="steps"])').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = document.getElementById('stepsView');
      if (view) view.style.display = 'none';
    });
  });
}

// Auto-wire on DOMContentLoaded (matches the pattern other panels use).
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireStepsPanel);
  } else {
    wireStepsPanel();
  }
}

// ── Round-flow diagram ──────────────────────────────────────────────────────
// Pill row above the sub-tabs. Renders the assembled `next_round!` topology:
// Init → SR → OR×N → (Merger if present) → ↻ SR. Each node is a click-to-tab
// shortcut (uses the existing data-rounds-tab handler), and gets a "*" suffix
// + accent border when its tab has a non-empty transitionHook (i.e. its
// when-branch in the assembled `def next_round!` has been customized).
//
// Merger node gate: `state.mechanics.rounds.merger != null`. The slot is set
// to null when disabled and an object when enabled (toggle handler pattern in
// onRoundsInputChange).
//
// OR×N count: derived from state.phases[].operating_rounds at render time.
// 18xx games configure OR count per-phase (`phase.operating_rounds: N`); the
// engine binds `@operating_rounds = @phase.operating_rounds` at each
// SR→OR transition (base.rb:2925). The diagram displays:
//   "OR"        when no phases or all phases have 1 OR
//   "OR×N"      when all configured phases have the same N>1
//   "OR×N–M"    when phases vary
function _renderRoundFlowDiagram(rounds, activeTab) {
  const initTrans     = _slotHasTransition(rounds.initial);
  const stockTrans    = _slotHasTransition(rounds.stock);
  const opTrans       = _slotHasTransition(rounds.operating);
  const mergerPresent = rounds.merger != null;
  const mergerTrans   = mergerPresent && _slotHasTransition(rounds.merger);
  const orLabel       = _orFlowLabel();

  const node = (label, modified, type) => {
    const isActive = type === activeTab;
    const baseStyle = modified
      ? 'background:var(--accent-dim);border:1px solid var(--accent);color:var(--accent);'
      : 'background:var(--bg-elevated);border:1px solid var(--border);color:var(--text-secondary);';
    const weightStyle = isActive ? 'font-weight:700;' : 'font-weight:400;';
    return `<button type="button" data-rounds-tab="${type}" style="${baseStyle}${weightStyle}padding:3px 9px;border-radius:4px;font-family:monospace;font-size:11px;cursor:pointer;">${label}${modified ? ' *' : ''}</button>`;
  };
  const arrow = '<span style="color:var(--text-dim);font-family:monospace;">→</span>';

  const parts = [
    node('Init', initTrans, 'initial'),
    arrow,
    node('SR', stockTrans, 'stock'),
    arrow,
    node(orLabel, opTrans, 'operating'),
  ];
  if (mergerPresent) {
    parts.push(arrow, node('Merger', mergerTrans, 'merger'));
  }
  parts.push('<span style="color:var(--text-dim);font-family:monospace;">↻ SR</span>');

  return [
    '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 12px;padding:8px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:5px;">',
    '  <span style="color:var(--text-dim);font-size:10px;letter-spacing:0.05em;text-transform:uppercase;margin-right:4px;">Round flow</span>',
    '  ' + parts.join(' '),
    '  <span style="margin-left:auto;color:var(--text-dim);font-size:10px;">* = custom transition</span>',
    '</div>',
  ].join('\n');
}

function _slotHasTransition(slot) {
  return !!(slot && slot.transitionHook && slot.transitionHook.body && slot.transitionHook.body.trim());
}

// Compute the OR-node label from configured phases. Tolerates both
// `operating_rounds` (snake_case from .rb import) and `operatingRounds`
// (camelCase from native state) per the existing pattern in mechanics-panel.js.
function _orFlowLabel() {
  const phases = (typeof state !== 'undefined' && state.phases) || [];
  if (!phases.length) return 'OR';
  const counts = phases
    .map(p => Number(p && (p.operating_rounds != null ? p.operating_rounds : p.operatingRounds)))
    .filter(n => Number.isFinite(n) && n > 0);
  if (!counts.length) return 'OR';
  const min = Math.min.apply(null, counts);
  const max = Math.max.apply(null, counts);
  if (max <= 1) return 'OR';
  if (min === max) return `OR×${max}`;
  return `OR×${min}–${max}`;
}

// Listener handlers — attached by mechanics-panel.js after each renderRight,
// and by _attachStepsListeners after each STEPS panel render. Wires data-rkey
// writers (round class, opts, subclass) and sub-tab click navigation.

function onRoundsTabClick(e) {
  const tab = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.roundsTab;
  if (!tab) return;
  _activeRoundsTab = tab;
  if (_stepsViewIsVisible() && typeof renderStepsPanelView === 'function') renderStepsPanelView();
  if (typeof renderMechanicsRight === 'function') renderMechanicsRight();
}

function onRoundsInputChange(e) {
  if (typeof state === 'undefined' || !state.mechanics) return;
  const rounds = state.mechanics.rounds || (state.mechanics.rounds = {});
  const path   = e.target.dataset.rkey;
  if (!path) return;
  const value  = _coerceRoundsFormValue(e.target);
  const segs   = path.split('.');

  // ── Special-case writers ─────────────────────────────────────────────────
  // merger.enabled toggles the whole merger object on/off.
  if (path === 'merger.enabled') {
    rounds.merger = value ? Object.assign(_defaultMergerRound(), rounds.merger || {}, { enabled: true }) : null;
  }
  // <type>.subclass.enabled toggles the subclass slot. Body/name remain across
  // toggle so an accidental click doesn't lose the user's typed Ruby.
  else if (segs.length === 3 && segs[1] === 'subclass' && segs[2] === 'enabled') {
    const slot = _ensureRoundSlot(segs[0]);
    if (!slot) return;
    if (value) {
      slot.subclass = slot.subclass || _defaultSubclass();
    } else {
      slot.subclass = null;
    }
  }
  // merger.triggerCondition.phases — split whitespace into array.
  else if (path === 'merger.triggerCondition.phases') {
    if (!rounds.merger) return;
    rounds.merger.triggerCondition = rounds.merger.triggerCondition || {};
    rounds.merger.triggerCondition.phases = String(value).trim().split(/\s+/).filter(Boolean);
  }
  // <type>.endHook.preset — populate the body textarea with the preset's
  // template when a preset is picked AND the body is currently empty. Don't
  // overwrite typed content; user can clear the textarea first if they want
  // to switch presets destructively.
  else if (segs.length === 3 && segs[1] === 'endHook' && segs[2] === 'preset') {
    const slot = _ensureRoundSlot(segs[0]);
    if (!slot) return;
    slot.endHook = slot.endHook || { name: '', body: '', preset: '' };
    slot.endHook.preset = value || '';
    const preset = _findPresetById(value);
    if (preset && !slot.endHook.body.trim()) {
      slot.endHook.body = preset.body;
    }
  }
  // ── Generic walker for everything else ───────────────────────────────────
  else {
    let obj = rounds;
    for (let i = 0; i < segs.length - 1; i++) {
      const seg = segs[i];
      if (obj[seg] == null || typeof obj[seg] !== 'object') obj[seg] = {};
      obj = obj[seg];
    }
    obj[segs[segs.length - 1]] = value;
  }

  if (typeof autosave === 'function') autosave();
  // Re-render whichever main view is currently active.
  if (_stepsViewIsVisible() && typeof renderStepsPanelView === 'function') renderStepsPanelView();
  if (typeof renderMechanicsRight === 'function') renderMechanicsRight();
  if (typeof renderMechanicsLeft  === 'function') renderMechanicsLeft();
  if (typeof _refreshRbPreviewIfOpen === 'function') _refreshRbPreviewIfOpen();
}

function _coerceRoundsFormValue(input) {
  if (input.type === 'checkbox') return input.checked;
  if (input.type === 'number')   return Number(input.value);
  const v = input.value;
  if (v === 'true')  return true;
  if (v === 'false') return false;
  return v;
}

function _ensureRoundSlot(roundType) {
  const rounds = state.mechanics.rounds;
  if (!rounds) return null;
  if (roundType === 'merger') return rounds.merger;
  if (rounds[roundType] == null) rounds[roundType] = {};
  return rounds[roundType];
}

function _defaultMergerRound() {
  return {
    enabled:          false,
    name:             'Merger',
    position:         'between_ors',
    trigger:          'always',
    triggerCondition: {},
    subclass:         null,
    steps:            [],
  };
}

function _defaultSubclass() {
  return { name: '', body: '' };
}
