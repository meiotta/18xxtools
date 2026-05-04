// js/rounds-panel.js  v20260504a
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
// state.mechanics.rounds is seeded by Evan's initMechanicsState() for fresh
// states. For existing saves that predate the rounds schema, we seed defaults
// here on first access. Step arrays are also seeded from _BASE_RB_DEFAULTS
// (Addy's catalog, defined later in this file — same module scope, so it's
// accessible at call time even though declared below) so her step-list
// renderer can be purely reactive against state without re-deriving defaults.
//
// Legacy-field migration (initialRound, stockRoundsPerSet, mergerRound,
// orSteps → rounds.*) lands in PR1a/PR1b.
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

  // Seed step arrays from _BASE_RB_DEFAULTS (declared in Addy's section below).
  // Same-file module scope — `const _BASE_RB_DEFAULTS` is hoisted at evaluation
  // time and resolves at runtime; only fails inside the temporal dead zone,
  // which doesn't apply here (initRoundsState is called after module load).
  // Defensive deep-copy each entry so user edits don't mutate the catalog.
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
    // merger: no engine default (always game-custom). Initialize as empty array
    // so Addy's renderer can iterate without null-checks.
    if (state.mechanics.rounds.merger && !Array.isArray(state.mechanics.rounds.merger.steps)) {
      state.mechanics.rounds.merger.steps = [];
    }
  }

  // TODO (Tim + Addy, PR1c): migrate legacy state.mechanics.{initialRound,
  // stockRoundsPerSet, mergerRound, orSteps} into state.mechanics.rounds.* and
  // remove the legacy keys.
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
    '  <p class="mech-hint">Class section (Tim) on top, Step list (Addy) below. Empty step lists fall through to base.rb defaults — no Ruby is emitted.</p>',
    `  <div class="rounds-tabs">${tabs}</div>`,
    `  <div class="rounds-tab-content">${_renderRoundSubTab(_activeRoundsTab)}</div>`,
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
  initRoundsState();
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
    lines.push('  <p class="mech-warn" style="color:var(--color-warning-text, #b8860b);font-size:11px;border-left:3px solid var(--color-warning-text, #b8860b);padding:6px 8px;background:var(--color-warning-bg, rgba(255,200,0,0.08));">Engine::Round::Choices has no <code>select_entities</code> default. Provide a custom subclass below.</p>');
  }

  lines.push(_renderSubclassEditor('initial', r));
  lines.push('</div>');
  return lines.join('\n');
}

function _renderVanillaOrCustomClassSection(type, r) {
  const cls = r.class || 'vanilla';
  const sel = v => cls === v ? 'selected' : '';
  const baseClass = type === 'stock' ? 'Engine::Round::Stock' : 'Engine::Round::Operating';
  const lines = [];
  lines.push(`<div class="rounds-class-section" data-round-type="${type}">`);
  lines.push('  <h4 class="rounds-section-title">Class</h4>');
  lines.push(`  <label>${type === 'stock' ? 'Stock' : 'Operating'} round class`);
  lines.push(`    <select data-rkey="${type}.class">`);
  lines.push(`      <option value="vanilla" ${sel('vanilla')}>Vanilla — ${baseClass}</option>`);
  lines.push(`      <option value="custom"  ${sel('custom')}>Custom subclass</option>`);
  lines.push('    </select>');
  lines.push('  </label>');
  if (cls === 'custom') {
    lines.push(_renderSubclassEditor(type, r));
  }
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

  lines.push(_renderSubclassEditor('merger', m));
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
  lines.push('    <select data-step-picker style="background:#1e1e1e;border:1px solid #444;border-radius:4px;color:#ddd;padding:4px 8px;font-size:12px;flex:1;max-width:380px;">');
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
  return `<span class="rounds-step-pill" title="${desc}" style="display:inline-flex;align-items:center;gap:4px;background:#1e1e1e;border:1px solid #3a3a3a;border-radius:14px;padding:3px 4px 3px 10px;font-size:11px;color:#ddd;">` +
    `<span>${name}</span>` +
    (canBlock ? `<button class="rounds-step-blocks-pill${blocksOn ? ' active' : ''}" data-skey="toggle-blocks" data-round-type="${roundType}" data-step-index="${originalIdx}" title="Promote to In-sequence with { blocks: true }" style="background:${blocksOn ? '#4338ca' : 'transparent'};border:1px solid ${blocksOn ? '#6366f1' : '#444'};color:${blocksOn ? '#fff' : '#888'};border-radius:10px;padding:0 6px;font-size:10px;cursor:pointer;line-height:14px;">blocks</button>` : '') +
    `<button class="rounds-step-remove" data-skey="remove" data-round-type="${roundType}" data-step-index="${originalIdx}" title="Remove" style="background:transparent;border:none;color:#888;font-size:14px;cursor:pointer;padding:0 4px;line-height:1;">×</button>` +
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

  return `<li data-step-index="${originalIdx}" style="display:flex;align-items:center;gap:8px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:5px;padding:6px 10px;font-size:12px;color:#ddd;">` +
    `<span style="color:#666;font-size:10px;width:14px;flex-shrink:0;text-align:right;">${visibleIdx + 1}</span>` +
    `<span style="display:flex;flex-direction:column;gap:1px;">` +
      `<button data-skey="move-up" data-round-type="${roundType}" data-step-index="${originalIdx}" ${isFirst ? 'disabled' : ''} title="Move up" style="background:transparent;border:1px solid #333;color:${isFirst ? '#333' : '#888'};border-radius:3px;padding:0 4px;font-size:9px;cursor:${isFirst ? 'default' : 'pointer'};line-height:11px;">▲</button>` +
      `<button data-skey="move-down" data-round-type="${roundType}" data-step-index="${originalIdx}" ${isLast ? 'disabled' : ''} title="Move down" style="background:transparent;border:1px solid #333;color:${isLast ? '#333' : '#888'};border-radius:3px;padding:0 4px;font-size:9px;cursor:${isLast ? 'default' : 'pointer'};line-height:11px;">▼</button>` +
    `</span>` +
    `<span style="font-weight:500;">${name}</span>` +
    (desc ? ` <span style="color:#888;font-size:11px;">— ${desc}</span>` : '') +
    (optsStr ? ` <span style="color:#7a7a7a;font-family:monospace;font-size:10px;">{ ${optsStr} }</span>` : '') +
    `<span style="margin-left:auto;display:flex;gap:4px;">` +
      (canBlock ? `<button class="rounds-step-blocks-pill${blocksOn ? ' active' : ''}" data-skey="toggle-blocks" data-round-type="${roundType}" data-step-index="${originalIdx}" title="Toggle { blocks: true }" style="background:${blocksOn ? '#4338ca' : 'transparent'};border:1px solid ${blocksOn ? '#6366f1' : '#444'};color:${blocksOn ? '#fff' : '#888'};border-radius:10px;padding:1px 8px;font-size:10px;cursor:pointer;">${blocksOn ? 'blocks ✓' : 'blocks'}</button>` : '') +
      `<button data-skey="remove" data-round-type="${roundType}" data-step-index="${originalIdx}" title="Remove" style="background:transparent;border:1px solid #4a2a2a;color:#c88;border-radius:3px;padding:1px 8px;font-size:11px;cursor:pointer;">×</button>` +
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
            <p style="color:#888;font-size:11px;font-style:italic;">Wizard prose is a placeholder. Anthony to co-author final copy.</p>`,
  stock: `<p>Stock rounds let players buy and sell company shares, par new corporations, and (in some games) exchange privates for shares of their linked majors.</p>
          <p>The order of actions matters less here — most stock-round steps are non-blocking interrupts. A player may declare bankruptcy, exchange a company, or trigger a private's special ability at any point during their turn.</p>
          <p style="color:#888;font-size:11px;font-style:italic;">Wizard prose is a placeholder. Anthony to co-author final copy.</p>`,
  operating: `<p>Operating rounds are the heart of every 18xx game. Each company in turn lays track, places station tokens, runs trains, pays or withholds dividends, and buys new trains.</p>
              <p>The <strong>blocking sequence</strong> below (Track → Token → Route → Dividend → Buy Train, etc.) is the play timeline — a company resolves each step in order before the round moves on. The <strong>interrupt menu</strong> above (Bankruptcy, Exchange, Special Track/Token, early BuyCompany, DiscardTrain) is available throughout — a player may take any of those actions at any moment during their turn.</p>
              <p>Bankruptcy isn't "first" in time — it's a non-blocking action available throughout. The button is always offered; the engine only allows it when the corp actually qualifies.</p>
              <p style="color:#888;font-size:11px;font-style:italic;">Wizard prose is a placeholder. Anthony to co-author final copy.</p>`,
  merger: `<p>Merger rounds happen when game mechanics require companies to fold or combine — typically in 1817-style games. The structure depends entirely on the merger flow your game uses.</p>
           <p>Merger rounds are always game-specific; the engine has no default. You'll need a custom round subclass and a step list reflecting your particular merger flow.</p>
           <p style="color:#888;font-size:11px;font-style:italic;">Wizard prose is a placeholder. Anthony to co-author final copy.</p>`,
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

// ── Top-level STEPS panel renderer (replaces #stepsView innerHTML) ──────────
// Called by wireStepsPanel() on icon click and after every state mutation that
// affects step lists. Builds the full panel: title, sub-tabs, wizard, class
// section (Tim), step section (Addy two-tier), live game.rb preview.
function renderStepsPanelView() {
  const view = document.getElementById('stepsView');
  if (!view) return;
  initRoundsState();
  const activeTab = _activeRoundsTab || 'initial';
  const rounds    = (typeof state !== 'undefined' && state.mechanics && state.mechanics.rounds) || {};
  const r         = rounds[activeTab] || {};

  view.innerHTML = [
    '<div style="max-width:980px;margin:0 auto;">',
    `  <h2 style="margin:0 0 4px 0;font-weight:500;letter-spacing:.04em;color:#ddd;">Round Steps</h2>`,
    `  <p class="mech-hint" style="margin:0 0 16px;">Configure the order of actions in each round. Empty step lists fall through to base.rb defaults.</p>`,
    `  <div class="corp-tab-bar" style="margin-bottom:0;">`,
         _ROUND_SUB_TABS.map(t =>
           `    <button type="button" class="corp-tab-btn${t.id === activeTab ? ' active' : ''}" data-rounds-tab="${t.id}">${t.label}</button>`
         ).join('\n'),
    '  </div>',
    `  <div style="border:1px solid var(--border, #2a2a2a);border-top:none;border-radius:0 0 6px 6px;padding:18px 20px;background:var(--bg-panel, #161616);">`,
         _renderWizardCard(activeTab, r),
         _renderRoundClassSection(activeTab, r),
         _renderRoundStepsSection(activeTab, r),
         _renderStepsPreviewPane(activeTab, r),
    '  </div>',
    '</div>',
  ].join('\n');

  _attachStepsListeners(view);
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

  return `<div style="margin-bottom:18px;background:#16213a;border:1px solid #2a3a5a;border-left:4px solid #4a6dc7;border-radius:5px;padding:12px 14px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <strong style="color:#a5b4fc;font-size:13px;letter-spacing:.03em;">ⓘ How the ${label} works</strong>
      <button class="mech-btn-small" data-wizard-toggle="${roundType}" title="Hide this explainer">Hide</button>
    </div>
    <div style="color:#c8d4f0;font-size:12px;line-height:1.6;">${_WIZARD_PROSE[roundType] || ''}</div>
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
    <pre style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:5px;padding:12px 14px;margin:0;font-family:monospace;font-size:11px;line-height:1.55;color:#bbb;overflow-x:auto;white-space:pre;">${escaped}</pre>
  </div>`;
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

// Listener handlers — attached by mechanics-panel.js after each renderRight.
// Tim wires data-rkey writers + sub-tab clicks here in PR1a; Addy will add a
// data-skey listener for step add/remove/reorder in PR1c.

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
