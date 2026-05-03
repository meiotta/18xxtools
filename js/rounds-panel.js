// js/rounds-panel.js  v20260503b
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
    lines.push('  <p class="mech-warn" style="color:#b8860b;font-size:11px;border-left:3px solid #b8860b;padding:6px 8px;background:rgba(255,200,0,0.08);">Engine::Round::Choices has no <code>select_entities</code> default. Provide a custom subclass below.</p>');
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

  const lines = [];
  lines.push(`<div class="rounds-steps-section" data-round-type="${roundType}">`);
  lines.push(`  <h4 class="rounds-section-title">Steps</h4>`);

  // Inheritance hint — if the array exactly matches base.rb defaults, the
  // emitter omits the round method entirely (silent inherit). Lets the designer
  // know they're on the canonical path.
  if (matches) {
    lines.push(`  <p class="mech-hint">Matches base.rb default — <code>def ${methodName}</code> will be omitted from the export.</p>`);
  } else if (userSteps.length === 0 && roundType === 'merger') {
    lines.push(`  <p class="mech-hint">Merger rounds have no engine default. Add at least one step.</p>`);
  } else if (userSteps.length === 0) {
    lines.push(`  <p class="mech-hint" style="font-style:italic;">No steps. Use the picker below to add one.</p>`);
  } else {
    lines.push(`  <p class="mech-hint">Diverges from base.rb default — <code>def ${methodName}</code> will be emitted with this list.</p>`);
  }

  // Editable step list — always editable. Cards render with up/down/blocks/×.
  if (userSteps.length > 0) {
    lines.push(`  <ol class="rounds-steps-list">`);
    userSteps.forEach((s, i) => lines.push('    ' + _renderStepCardEditable(s, i, roundType, userSteps.length)));
    lines.push(`  </ol>`);
  }

  // Add-step picker: <select> populated from _STEP_CATALOG + "+ Add" button.
  // Same class can be selected twice (BuyCompany twice in 1830 OR pattern).
  lines.push('  <div class="rounds-steps-picker">');
  lines.push('    <select data-step-picker>');
  lines.push('      <option value="">Select a step…</option>');
  Object.keys(_STEP_CATALOG).sort().forEach(cls => {
    const short = _stepShortName(cls);
    const desc  = _STEP_CATALOG[cls];
    lines.push(`      <option value="${cls}">${short} — ${desc}</option>`);
  });
  lines.push('    </select>');
  lines.push(`    <button class="mech-btn-small" data-skey="add" data-round-type="${roundType}">+ Add step</button>`);
  lines.push('  </div>');

  lines.push(`</div>`);
  return lines.join('\n');
}

// One step card rendered as an editable entry. Controls (left → right):
//   ▲▼ reorder | name + desc | { opts } | blocks toggle | × remove
// All buttons carry data-skey + data-round-type + data-step-index for the
// onRoundsStepAction dispatcher (in the shared section below).
function _renderStepCardEditable(stepEntry, index, roundType, total) {
  const name     = _stepShortName(stepEntry.class);
  const desc     = _STEP_CATALOG[stepEntry.class] || '';
  const optsStr  = _formatStepOptsInline(stepEntry.opts);
  const blocksOn = !!(stepEntry.opts && stepEntry.opts.blocks);
  const isFirst  = index === 0;
  const isLast   = index === total - 1;

  return `<li class="rounds-step-card" data-step-index="${index}">` +
    `<span class="rounds-step-reorder">` +
      `<button class="rounds-step-up" data-skey="move-up" data-round-type="${roundType}" data-step-index="${index}"${isFirst ? ' disabled' : ''} title="Move up">▲</button>` +
      `<button class="rounds-step-down" data-skey="move-down" data-round-type="${roundType}" data-step-index="${index}"${isLast ? ' disabled' : ''} title="Move down">▼</button>` +
    `</span>` +
    `<span class="rounds-step-name">${name}</span>` +
    (desc ? ` <span class="rounds-step-desc">— ${desc}</span>` : '') +
    (optsStr ? ` <span class="rounds-step-opts">{ ${optsStr} }</span>` : '') +
    `<button class="rounds-step-blocks${blocksOn ? ' active' : ''}" data-skey="toggle-blocks" data-round-type="${roundType}" data-step-index="${index}" title="Toggle { blocks: true } — gates round progression on explicit pass (e.g. 1830 OR's trailing BuyCompany)">${blocksOn ? 'blocks ✓' : 'blocks'}</button>` +
    `<button class="rounds-step-remove" data-skey="remove" data-round-type="${roundType}" data-step-index="${index}" title="Remove">×</button>` +
  `</li>`;
}

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

// Listener handlers — attached by mechanics-panel.js after each renderRight.
// Tim wires data-rkey writers + sub-tab clicks here in PR1a; Addy will add a
// data-skey listener for step add/remove/reorder in PR1c.

function onRoundsTabClick(e) {
  const tab = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.roundsTab;
  if (!tab) return;
  _activeRoundsTab = tab;
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
  if (typeof renderMechanicsRight === 'function') renderMechanicsRight();
  if (typeof renderMechanicsLeft  === 'function') renderMechanicsLeft();
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
