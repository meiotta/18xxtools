// mechanics-panel.js
// Evan's domain: game mechanics taxonomy, OR structure, structural net validation.
// Reads from: state.mechanics (own state slice), state.trains, state.phases,
//             state.companies, state.minors, state.privates, state.hexes, state.market.
// Does NOT touch: renderer.js, palette.js, companies-panel.js, state.js, io.js, import-ruby.js.

'use strict';

// ---------------------------------------------------------------------------
// Known event handler library (dispatched via event_<type>! in game.rb).
// Source: research across base.rb, 1830, 1846, 1867, 1861, 1880, 1882, 1870,
//         1822 family, 1862, 1868wy game classes.
// ---------------------------------------------------------------------------
const KNOWN_EVENTS = [
  { type: 'close_companies',           desc: 'All private companies close',                         layer: 'base' },
  { type: 'remove_reservations',       desc: 'All unsold home reservations are removed',            layer: 'hook' },
  { type: 'remove_bonuses',            desc: 'East-west / route bonus tokens are removed',          layer: 'hook' },
  { type: 'companies_buyable',         desc: 'Private companies become purchasable by corps',       layer: 'hook' },
  { type: 'nwr',                       desc: 'NWR rebellion: yellow tiles on NWR hexes revert',     layer: 'hook' },
  { type: 'float_30',                  desc: 'Float threshold drops to 30%',                        layer: 'hook' },
  { type: 'float_40',                  desc: 'Float threshold drops to 40%',                        layer: 'hook' },
  { type: 'float_60',                  desc: 'Float threshold drops to 60%',                        layer: 'hook' },
  { type: 'permit_b',                  desc: 'Building permit B unlocked',                          layer: 'hook' },
  { type: 'permit_c',                  desc: 'Building permit C unlocked',                          layer: 'hook' },
  { type: 'permit_d',                  desc: 'Building permit D unlocked',                          layer: 'hook' },
  { type: 'communist_takeover',        desc: 'Communism: halts dividends and share price movement', layer: 'hook' },
  { type: 'stock_exchange_reopens',    desc: 'Stock exchange reopens after communist period',       layer: 'hook' },
  { type: 'receive_capital',           desc: 'Corporations receive their remaining IPO capital',    layer: 'hook' },
  { type: 'green_minors_available',    desc: 'Minors may now buy green trains',                     layer: 'hook' },
  { type: 'majors_can_ipo',            desc: 'Major corporations open for IPO',                     layer: 'hook' },
  { type: 'minors_cannot_start',       desc: 'New minors may no longer start',                      layer: 'hook' },
  { type: 'minors_nationalized',       desc: 'All remaining minors are nationalized',               layer: 'hook' },
  { type: 'trainless_nationalization', desc: 'Trainless entities nationalize at round end',         layer: 'hook' },
  { type: 'nationalize_companies',     desc: 'Private companies are absorbed into the national',    layer: 'hook' },
  { type: 'full_capitalisation',       desc: 'Capitalization switches from incremental to full',    layer: 'hook' },
  { type: 'phase_revenue',             desc: 'Private company revenues update for new phase',       layer: 'hook' },
  { type: 'all_corps_available',       desc: 'All corporations are now available to float',         layer: 'hook' },
  { type: 'uranium_boom',              desc: 'Uranium hexes enter boom period (revenue up)',         layer: 'hook' },
  { type: 'uranium_bust',              desc: 'Uranium hexes exit boom period',                      layer: 'hook' },
  { type: 'trigger_endgame',           desc: 'Final OR set countdown begins',                       layer: 'hook' },
  { type: 'remove_forts',              desc: 'Fort blockers are removed from the map',              layer: 'hook' },
  { type: 'lner_trigger',              desc: 'LNER formation process begins',                       layer: 'hook' },
  { type: 'open_detroit_duluth',       desc: 'Detroit–Duluth blocker tokens are removed',           layer: 'hook' },
  { type: 'close_ndem',               desc: 'NDEM auto-corporation dissolves',                      layer: 'hook' },
];

// Timing vocabulary for ability `when:` field.
const ABILITY_TIMING = [
  { value: 'track',                   desc: 'During the normal Track step' },
  { value: 'special_track',           desc: 'During the SpecialTrack step' },
  { value: 'owning_corp_or_turn',     desc: 'Any time the owning corporation is active in an OR' },
  { value: 'owning_player_or_turn',   desc: 'Any time the owning player is active' },
  { value: 'owning_player_track',     desc: "Owning player's track action" },
  { value: 'or_between_turns',        desc: 'Between entity turns in an OR' },
  { value: 'stock_round',             desc: 'During stock round' },
  { value: 'sold',                    desc: 'At the moment the private is sold to a corp' },
  { value: 'any',                     desc: 'Any time' },
  { value: 'bought_train',            desc: 'When a train is purchased' },
];

// Tile lay slot schema — hash keys recognized by tracker.rb:34-45.
const DEFAULT_TILE_LAY_SLOT = { lay: true, upgrade: true, cost: 0, upgrade_cost: 0, cannot_reuse_same_hex: false };

// Structural net definitions.
const STRUCTURAL_NETS = [
  { id: 'rust_cross_ref',       name: 'Train rust cross-reference',       desc: 'Every rusts_on / obsolete_on value must name a valid train or variant',        owner: 'Farrah', validate: validateRustCrossRefs },
  { id: 'phase_on_cross_ref',   name: 'Phase trigger cross-reference',    desc: 'Every PHASES on: value must match a train name or variant name',                owner: 'Farrah', validate: validatePhaseOnCrossRefs },
  { id: 'train_event_library',  name: 'Train event handler library',      desc: 'Every events: type on a TRAINS entry must exist in the known event library',    owner: 'Evan',   validate: validateTrainEventTypes },
  { id: 'ability_on_phase',     name: 'Ability on_phase reference',       desc: 'Every ability on_phase: value must match a phase name in PHASES',               owner: 'Jenny',  validate: validateAbilityOnPhase },
  { id: 'ability_corporation',  name: 'Ability corporation reference',    desc: 'Every ability corporation:/corporations: value must exist in CORPORATIONS',      owner: 'Jenny',  validate: validateAbilityCorporation },
  { id: 'exchange_tokens',      name: 'Exchange token corps',             desc: 'Exchange token map must only contain major corporation syms',                    owner: 'Evan',   validate: validateExchangeTokenCorps },
  { id: 'merger_associations',  name: 'Minor/major merger associations',  desc: 'Every association must reference an existing minor sym and major corp sym',      owner: 'Evan',   validate: validateMergerAssociations },
];

// ---------------------------------------------------------------------------
// Framework UI state — persists across re-renders within a session
// ---------------------------------------------------------------------------
let _selectedFrameworkItem = null;
let _collapsedSections = new Set();

// ---------------------------------------------------------------------------
// State initialisation
// ---------------------------------------------------------------------------
function initMechanicsState() {
  if (typeof state === 'undefined') return;
  if (state.mechanics) return;
  state.mechanics = {
    initialRound:      'waterfall_auction',
    stockRoundsPerSet: 1,
    mergerRound:       false,
    allowRemovingTowns: false,
    mustBuyTrain:      'route',
    capitalization:    'full',
    tileLays: {
      default:       [Object.assign({}, DEFAULT_TILE_LAY_SLOT)],
      byType:        { minor: null, major: null },
      phaseGated:    false,
      phaseOverrides: [],
    },
    exchangeTokens:  { enabled: false, counts: {} },
    revenueBonuses:  [],
    events:          [],
    orSteps: {
      issueShares:      false,
      homeToken:        true,
      specialToken:     false,
      minorAcquisition: false,
      priceProtection:  false,
      loanOperations:   false,
    },
    merger: {
      enabled:     false,
      style:       'minor_to_major',
      roundTiming: 'after_or',
      associations: [],
    },
    nationalization: {
      enabled:          false,
      nationalCorpSym:  null,
      triggerTrains:    [],
      reservationHexes: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Structural net validators
// ---------------------------------------------------------------------------
function allTrainNames() {
  if (typeof state === 'undefined' || !state.trains) return new Set();
  const names = new Set();
  state.trains.forEach(t => {
    names.add(t.name);
    (t.variants || []).forEach(v => v.name && names.add(v.name));
  });
  return names;
}
function allPhaseNames() {
  if (typeof state === 'undefined' || !state.phases) return new Set();
  return new Set((state.phases || []).map(p => p.name));
}
function allCorpSyms() {
  if (typeof state === 'undefined') return new Set();
  const syms = new Set();
  (state.companies || []).forEach(c => c.abbr && syms.add(c.abbr));
  return syms;
}
function allMinorSyms() {
  if (typeof state === 'undefined') return new Set();
  const syms = new Set();
  (state.minors || []).forEach(m => m.abbr && syms.add(m.abbr));
  return syms;
}
function majorCorpSyms() {
  if (typeof state === 'undefined') return new Set();
  const syms = new Set();
  (state.companies || []).filter(c => !c.isMinor).forEach(c => c.abbr && syms.add(c.abbr));
  return syms;
}

function validateRustCrossRefs() {
  const errors = [];
  const trains = allTrainNames();
  (state.trains || []).forEach(t => {
    if (t.rusts_on && !trains.has(t.rusts_on))
      errors.push({ net: 'rust_cross_ref', message: `Train "${t.name}" rusts_on "${t.rusts_on}" — not in TRAINS` });
    if (t.obsolete_on && !trains.has(t.obsolete_on))
      errors.push({ net: 'rust_cross_ref', message: `Train "${t.name}" obsolete_on "${t.obsolete_on}" — not in TRAINS` });
    (t.variants || []).forEach(v => {
      if (v.rusts_on && !trains.has(v.rusts_on))
        errors.push({ net: 'rust_cross_ref', message: `Train "${t.name}" variant "${v.name}" rusts_on "${v.rusts_on}" — not in TRAINS` });
    });
  });
  return errors;
}
function validatePhaseOnCrossRefs() {
  const errors = [];
  const trains = allTrainNames();
  (state.phases || []).forEach(p => {
    if (p.on && !trains.has(p.on))
      errors.push({ net: 'phase_on_cross_ref', message: `Phase "${p.name}" on: "${p.on}" — not in TRAINS` });
  });
  return errors;
}
function validateTrainEventTypes() {
  const errors = [];
  const knownTypes = new Set(KNOWN_EVENTS.map(e => e.type));
  (state.trains || []).forEach(t => {
    (t.events || []).forEach(ev => {
      if (!knownTypes.has(ev.type))
        errors.push({ net: 'train_event_library', message: `Train "${t.name}" event "${ev.type}" — not in known library (custom Ruby required)` });
    });
  });
  (state.phases || []).forEach(p => {
    (p.events || []).forEach(ev => {
      if (!knownTypes.has(ev.type))
        errors.push({ net: 'train_event_library', message: `Phase "${p.name}" event "${ev.type}" — not in known library` });
    });
  });
  return errors;
}
function validateAbilityOnPhase() {
  const errors = [];
  const phases = allPhaseNames();
  [...(state.privates || []), ...(state.companies || []), ...(state.minors || [])].forEach(co => {
    (co.abilities || []).forEach(ab => {
      if (ab.on_phase && !phases.has(ab.on_phase))
        errors.push({ net: 'ability_on_phase', message: `Company "${co.name}" ability on_phase "${ab.on_phase}" — not in PHASES` });
    });
  });
  return errors;
}
function validateAbilityCorporation() {
  const errors = [];
  const corps = allCorpSyms();
  [...(state.privates || []), ...(state.companies || []), ...(state.minors || [])].forEach(co => {
    (co.abilities || []).forEach(ab => {
      const targets = ab.corporation ? [ab.corporation] : (ab.corporations || []);
      targets.forEach(sym => {
        if (!corps.has(sym))
          errors.push({ net: 'ability_corporation', message: `Company "${co.name}" ability references corp "${sym}" — not in CORPORATIONS` });
      });
    });
  });
  return errors;
}
function validateExchangeTokenCorps() {
  const errors = [];
  if (!state.mechanics || !state.mechanics.exchangeTokens.enabled) return errors;
  const majors = majorCorpSyms();
  Object.keys(state.mechanics.exchangeTokens.counts).forEach(sym => {
    if (!majors.has(sym))
      errors.push({ net: 'exchange_tokens', message: `Exchange token entry "${sym}" — not a major corporation` });
  });
  return errors;
}
function validateMergerAssociations() {
  const errors = [];
  if (!state.mechanics || !state.mechanics.merger.enabled) return errors;
  const minors = allMinorSyms();
  const majors = majorCorpSyms();
  state.mechanics.merger.associations.forEach(pair => {
    if (!minors.has(pair.minorSym))
      errors.push({ net: 'merger_associations', message: `Merger minor "${pair.minorSym}" — not in MINORS` });
    if (!majors.has(pair.majorSym))
      errors.push({ net: 'merger_associations', message: `Merger major "${pair.majorSym}" — not in CORPORATIONS` });
  });
  return errors;
}
function runAllNets() {
  const all = [];
  STRUCTURAL_NETS.forEach(net => all.push(...net.validate()));
  return all;
}

// ---------------------------------------------------------------------------
// Framework builder — returns the section+item tree driving the left panel
// ---------------------------------------------------------------------------
function buildFramework() {
  const m = state.mechanics || {};
  const trains   = state.trains   || [];
  const phases   = state.phases   || [];
  const corps    = (state.companies || []).filter(c => !c.isMinor);
  const minors   = state.minors   || [];
  const privates = state.privates || [];
  const hexCount = Object.keys(state.hexes || {}).filter(k => !(state.hexes[k] || {}).killed).length;
  const hasMarket = !!(state.market && state.market.length);

  // OR count string derived from phases
  const orCounts = phases.map(p => p.operating_rounds || p.operatingRounds || 1);
  const orStr = orCounts.length
    ? [...new Set(orCounts)].join('/') + ' OR' + (Math.max(...orCounts) > 1 ? 's' : '')
    : null;

  return [
    // ── GAME FLOW ──────────────────────────────────────────────────────────
    {
      id: 'game_flow', label: 'Game Flow',
      items: [
        {
          id: 'initial_round',
          label: 'Initial Round',
          value: formatInitialRound(m.initialRound),
          status: m.initialRound ? 'green' : 'red',
        },
        {
          id: 'stock_rounds',
          label: 'Stock Rounds per set',
          value: String(m.stockRoundsPerSet || 1),
          status: 'green',
        },
        {
          id: 'or_sequence',
          label: 'OR Sequence',
          value: orStr || 'from phases',
          status: phases.length ? 'green' : 'amber',
        },
      ],
    },

    // ── TRAINS ─────────────────────────────────────────────────────────────
    {
      id: 'trains', label: 'Trains',
      empty: trains.length === 0 ? { label: 'No trains defined — use Trains & Phases screen', status: 'red' } : null,
      items: trains
        .filter(t => !t._isSpecial)  // standard trains only; special shown separately
        .map(t => {
          const ok = t.name && t.cost !== undefined && t.distance !== undefined;
          return {
            id: 'train_' + t.name,
            label: t.name ? t.name + '-train' : '(unnamed)',
            value: t.cost !== undefined ? '$' + t.cost : '?',
            status: ok ? 'green' : (t.name ? 'amber' : 'red'),
            readonly: true,
          };
        }),
    },

    // ── SPECIAL TRAINS ─────────────────────────────────────────────────────
    ...(trains.some(t => t._isSpecial) ? [{
      id: 'special_trains', label: 'Special Trains',
      items: trains.filter(t => t._isSpecial).map(t => ({
        id: 'strain_' + t.name,
        label: t.name,
        value: t.cost !== undefined ? '$' + t.cost : '',
        status: (t.name && t.cost !== undefined) ? 'green' : 'amber',
        readonly: true,
      })),
    }] : []),

    // ── PHASES ─────────────────────────────────────────────────────────────
    {
      id: 'phases', label: 'Phases',
      empty: phases.length === 0 ? { label: 'No phases defined — use Trains & Phases screen', status: 'red' } : null,
      items: phases.map(p => ({
        id: 'phase_' + p.name,
        label: 'Phase ' + p.name,
        value: p.on ? 'on ' + p.on : '',
        status: (p.name && p.on) ? 'green' : 'amber',
        readonly: true,
      })),
    },

    // ── CORPORATIONS ───────────────────────────────────────────────────────
    {
      id: 'corporations', label: 'Corporations',
      empty: corps.length === 0 ? { label: 'No corporations defined — use Companies screen', status: 'red' } : null,
      items: corps.map(c => ({
        id: 'corp_' + c.abbr,
        label: c.abbr || '?',
        value: c.name || '',
        status: (c.abbr && c.name) ? 'green' : 'amber',
        readonly: true,
      })),
    },

    // ── MINORS (only if any defined) ───────────────────────────────────────
    ...(minors.length > 0 ? [{
      id: 'minors', label: 'Minor Companies',
      items: minors.map(m => ({
        id: 'minor_' + m.abbr,
        label: m.abbr || '?',
        value: m.name || '',
        status: (m.abbr && m.name) ? 'green' : 'amber',
        readonly: true,
      })),
    }] : []),

    // ── PRIVATE COMPANIES ──────────────────────────────────────────────────
    {
      id: 'private_companies', label: 'Private Companies',
      optional: true,
      empty: privates.length === 0 ? { label: 'None defined', status: 'amber' } : null,
      items: privates.map(p => ({
        id: 'priv_' + (p.abbr || p.name),
        label: p.abbr || p.name || '?',
        value: p.value !== undefined ? '$' + p.value : '',
        status: (p.abbr && p.value !== undefined) ? 'green' : 'amber',
        readonly: true,
      })),
    },

    // ── OPERATING ROUND RULES ──────────────────────────────────────────────
    {
      id: 'or_rules', label: 'Operating Round Rules',
      items: [
        {
          id: 'or_tile_lays',
          label: 'Tile Lays',
          value: describeTileLaySlots((m.tileLays || {}).default || [DEFAULT_TILE_LAY_SLOT]),
          status: 'green',
        },
        {
          id: 'or_train_rules',
          label: 'Train Requirements',
          value: m.mustBuyTrain || 'route',
          status: 'green',
        },
        {
          id: 'or_capitalization',
          label: 'Capitalization',
          value: m.capitalization || 'full',
          status: 'green',
        },
        {
          id: 'or_special',
          label: 'Special Mechanics',
          value: Object.values(m.orSteps || {}).filter(Boolean).length + ' active',
          status: 'green',
        },
      ],
    },

    // ── EVENTS ─────────────────────────────────────────────────────────────
    {
      id: 'events', label: 'Events',
      optional: true,
      empty: (m.events || []).length === 0 ? { label: 'No event triggers defined', status: 'amber' } : null,
      items: (m.events || []).map((ev, i) => ({
        id: 'event_' + i,
        label: ev.triggerOn + '-train purchase',
        value: ev.eventType,
        status: 'green',
      })),
    },

    // ── GAME END CONDITIONS ────────────────────────────────────────────────
    {
      id: 'game_end', label: 'Game End Conditions',
      items: [],
      empty: { label: 'Not yet configurable in this tool', status: 'red' },
    },

    // ── MAP ────────────────────────────────────────────────────────────────
    {
      id: 'map', label: 'Map',
      readonly: true,
      items: [{
        id: 'map_hexes',
        label: 'Hex count',
        value: hexCount > 0 ? hexCount + ' hexes' : 'empty',
        status: hexCount > 0 ? 'green' : 'red',
        readonly: true,
      }],
    },

    // ── STOCK MARKET ───────────────────────────────────────────────────────
    {
      id: 'stock_market', label: 'Stock Market',
      readonly: true,
      items: [{
        id: 'market_grid',
        label: 'Market grid',
        value: hasMarket
          ? (state.marketType || '2D') + ' · ' + (state.marketRows || '?') + '×' + (state.marketCols || '?')
          : 'not configured',
        status: hasMarket ? 'green' : 'red',
        readonly: true,
      }],
    },
  ];
}

function formatInitialRound(val) {
  return {
    waterfall_auction:    'Waterfall Auction',
    draft:                'Draft',
    parliament:           'Parliament Auction',
    certificate_selection:'Certificate Selection',
    none:                 'None (start with SR)',
  }[val] || val || '—';
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
function statusDot(status) {
  return `<span class="mech-status-dot ${status || 'red'}"></span>`;
}

function sectionOverallStatus(sec) {
  if (sec.items.length === 0) {
    if (sec.empty) return sec.empty.status;
    return sec.optional ? 'green' : 'red';
  }
  const statuses = sec.items.map(i => i.status);
  if (statuses.every(s => s === 'green')) return 'green';
  if (statuses.some(s => s === 'green' || s === 'amber')) return 'amber';
  return 'red';
}

// ---------------------------------------------------------------------------
// Left panel — framework tree
// ---------------------------------------------------------------------------
function renderMechanicsLeft() {
  const el = document.getElementById('mechanicsLeft');
  if (!el) return;
  if (typeof state === 'undefined') { el.innerHTML = '<p style="color:#666;padding:16px;">Waiting for state…</p>'; return; }

  const sections = buildFramework();

  el.innerHTML = `<div class="mech-framework">${sections.map(renderFrameworkSection).join('')}</div>`;

  el.querySelectorAll('.mech-sec-header').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const id = hdr.dataset.secId;
      if (_collapsedSections.has(id)) _collapsedSections.delete(id);
      else _collapsedSections.add(id);
      renderMechanicsLeft();
    });
  });

  el.querySelectorAll('.mech-item-row[data-item-id]').forEach(row => {
    row.addEventListener('click', () => {
      _selectedFrameworkItem = row.dataset.itemId;
      el.querySelectorAll('.mech-item-row').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      renderMechanicsRight();
    });
  });
}

function renderFrameworkSection(sec) {
  const collapsed = _collapsedSections.has(sec.id);
  const overallStatus = sectionOverallStatus(sec);
  const readonlyBadge = sec.readonly ? '<span class="mech-readonly-badge">map/market</span>' : '';

  const itemsHtml = sec.items.length === 0 && sec.empty
    ? `<div class="mech-item-row" data-item-id="${sec.id}_empty">
         ${statusDot(sec.empty.status)}
         <span class="mech-item-label mech-empty-label">${sec.empty.label}</span>
       </div>`
    : sec.items.map(item => `
        <div class="mech-item-row${_selectedFrameworkItem === item.id ? ' selected' : ''}" data-item-id="${item.id}">
          ${statusDot(item.status)}
          <span class="mech-item-label">${item.label}</span>
          <span class="mech-item-value">${item.value || ''}</span>
        </div>`).join('');

  return `
    <div class="mech-section">
      <div class="mech-sec-header" data-sec-id="${sec.id}">
        <span class="mech-sec-chevron">${collapsed ? '›' : '⌄'}</span>
        ${statusDot(overallStatus)}
        <span class="mech-sec-label">${sec.label}</span>
        ${readonlyBadge}
      </div>
      ${collapsed ? '' : `<div class="mech-sec-items">${itemsHtml}</div>`}
    </div>`;
}

// ---------------------------------------------------------------------------
// Right panel — editor or narrative log
// ---------------------------------------------------------------------------
function renderMechanicsRight() {
  const el = document.getElementById('mechanicsRight');
  if (!el) return;

  if (typeof state === 'undefined' || !state.mechanics) {
    el.innerHTML = '<p style="color:#666;">Select a section on the left to begin configuring your game mechanics.</p>';
    return;
  }

  if (!_selectedFrameworkItem) {
    el.innerHTML = buildMechanicLog();
    return;
  }

  el.innerHTML = renderEditorFor(_selectedFrameworkItem);

  // Wire change handlers for any inputs rendered in the editor
  el.querySelectorAll('[data-mkey]').forEach(input => {
    input.addEventListener('change', onMechanicsInputChange);
  });
  el.querySelectorAll('[data-orkey]').forEach(cb => {
    cb.addEventListener('change', e => {
      state.mechanics.orSteps[e.target.dataset.orkey] = e.target.checked;
      if (typeof autosave === 'function') autosave();
      renderMechanicsLeft();
      renderMechanicsRight();
    });
  });
  // Event add/remove buttons
  const addEvtBtn = el.querySelector('#mechAddEventBtn');
  if (addEvtBtn) addEvtBtn.addEventListener('click', onAddEvent);
  el.querySelectorAll('[data-remove-event]').forEach(btn => {
    btn.addEventListener('click', () => onRemoveEvent(Number(btn.dataset.removeEvent)));
  });
}

function renderEditorFor(itemId) {
  const m = state.mechanics || {};
  const backBtn = `<button class="mech-editor-back" id="mechEditorBack">← Overview</button>`;

  // Game flow items
  if (['initial_round','stock_rounds','or_sequence'].includes(itemId)) {
    return `<div class="mech-editor-wrap">${backBtn}<h4>Game Flow</h4>${renderRoundStructure(m)}</div>`;
  }
  // OR rules items
  if (itemId === 'or_tile_lays') {
    return `<div class="mech-editor-wrap">${backBtn}<h4>Tile Lays</h4>${renderTileLays(m)}</div>`;
  }
  if (itemId === 'or_train_rules' || itemId === 'or_capitalization') {
    return `<div class="mech-editor-wrap">${backBtn}<h4>Train Rules & Capitalization</h4>${renderTrainRules(m)}</div>`;
  }
  if (itemId === 'or_special') {
    return `<div class="mech-editor-wrap">${backBtn}<h4>Special Mechanics</h4>${renderSpecialMechanics(m)}</div>`;
  }
  // Events
  if (itemId === 'events' || itemId.startsWith('event_')) {
    return `<div class="mech-editor-wrap">${backBtn}<h4>Event Triggers</h4>${renderEventsSection(m)}</div>`;
  }
  // Train / phase read-only (Farrah's domain)
  if (itemId.startsWith('train_')) {
    const name = itemId.slice(6);
    const train = (state.trains || []).find(t => t.name === name);
    return `<div class="mech-editor-wrap">${backBtn}${renderTrainReadOnly(train)}</div>`;
  }
  if (itemId.startsWith('strain_')) {
    const name = itemId.slice(7);
    const train = (state.trains || []).find(t => t.name === name);
    return `<div class="mech-editor-wrap">${backBtn}${renderTrainReadOnly(train)}</div>`;
  }
  if (itemId.startsWith('phase_')) {
    const name = itemId.slice(6);
    const phase = (state.phases || []).find(p => p.name === name);
    return `<div class="mech-editor-wrap">${backBtn}${renderPhaseReadOnly(phase)}</div>`;
  }
  // Corp / private / minor — cross-panel
  if (itemId.startsWith('corp_') || itemId.startsWith('minor_') || itemId.startsWith('priv_')) {
    const panelName = itemId.startsWith('priv_') ? 'Private Companies' : 'Corporations';
    return `<div class="mech-editor-wrap">${backBtn}
      <p class="mech-hint" style="margin-top:12px;">Edit in the <strong>${panelName}</strong> panel.<br>Structural validation runs automatically.</p>
      ${renderStructuralNets()}
    </div>`;
  }
  // Map / market — cross-panel
  if (itemId.startsWith('map_') || itemId.startsWith('market_')) {
    return `<div class="mech-editor-wrap">${backBtn}
      <p class="mech-hint" style="margin-top:12px;">Configured in the <strong>Map</strong> and <strong>Market</strong> panels.</p>
    </div>`;
  }
  // Empty-state placeholders
  if (itemId.endsWith('_empty')) {
    return `<div class="mech-editor-wrap">${backBtn}
      <p class="mech-hint" style="margin-top:12px;">This section is empty. Import a game file or add data in the relevant panel.</p>
    </div>`;
  }

  return `<div class="mech-editor-wrap">${backBtn}
    <p class="mech-hint" style="margin-top:12px;">No editor for this item yet.</p>
  </div>`;
}

function renderTrainReadOnly(train) {
  if (!train) return '<p class="mech-hint">Train not found.</p>';
  const rows = Object.entries(train)
    .filter(([k]) => !['events', '_isSpecial'].includes(k))
    .map(([k, v]) => `<tr>
      <td style="color:#888;padding:3px 16px 3px 0;font-size:11px;">${k}</td>
      <td style="color:#ddd;font-size:12px;">${JSON.stringify(v)}</td>
    </tr>`).join('');
  const evts = (train.events || []);
  return `
    <h4>${train.name || '?'}-train <span style="font-weight:400;color:#666;font-size:11px;">(Trains &amp; Phases screen)</span></h4>
    <table style="border-collapse:collapse;margin-bottom:12px;">${rows}</table>
    ${evts.length ? `<p style="color:#aaa;font-size:12px;">Events: ${evts.map(e => `<strong>${e.type}</strong>`).join(', ')}</p>` : ''}`;
}

function renderPhaseReadOnly(phase) {
  if (!phase) return '<p class="mech-hint">Phase not found.</p>';
  const rows = Object.entries(phase)
    .filter(([k]) => k !== 'events')
    .map(([k, v]) => `<tr>
      <td style="color:#888;padding:3px 16px 3px 0;font-size:11px;">${k}</td>
      <td style="color:#ddd;font-size:12px;">${JSON.stringify(v)}</td>
    </tr>`).join('');
  return `
    <h4>Phase ${phase.name || '?'} <span style="font-weight:400;color:#666;font-size:11px;">(Trains &amp; Phases screen)</span></h4>
    <table style="border-collapse:collapse;">${rows}</table>`;
}

// ---------------------------------------------------------------------------
// Mechanic log — full narrative (shown when nothing selected)
// ---------------------------------------------------------------------------
function buildMechanicLog() {
  if (typeof state === 'undefined') return '';
  const m = state.mechanics || {};
  const lines = [];

  const netErrors = runAllNets();
  if (netErrors.length) {
    lines.push(`<div class="mech-warn-banner">⚠ ${netErrors.length} structural validation warning${netErrors.length > 1 ? 's' : ''} — click items below for details</div>`);
  }

  lines.push('<p style="color:#666;font-size:12px;margin-bottom:16px;">Click any item on the left to edit it. This panel shows a summary of your current configuration.</p>');

  lines.push('<h4>Game Flow</h4><ol>');
  const roundNames = {
    waterfall_auction:    'Players bid for private companies in a Waterfall Auction',
    draft:                'Players draft private companies from a rolling window',
    parliament:           'Companies are auctioned in a Parliament round',
    certificate_selection:'Players are dealt cards and keep a hand (certificate selection)',
    none:                 'The game begins directly with Stock Rounds (no initial auction)',
  };
  lines.push(`<li>${roundNames[m.initialRound] || m.initialRound || 'Initial round not configured'}.</li>`);
  const srCount = m.stockRoundsPerSet || 1;
  lines.push(`<li>${srCount} Stock Round${srCount > 1 ? 's' : ''} per set.</li>`);
  lines.push('<li>Corporations operate in order of share price.</li>');
  if (m.mergerRound || (m.merger && m.merger.enabled))
    lines.push('<li>A Merger Round occurs between sets once mergers are available.</li>');
  lines.push('</ol>');

  const trains = state.trains || [];
  if (trains.length) {
    lines.push(`<h4>Trains (${trains.length})</h4><ul>`);
    trains.forEach(t => lines.push(`<li><strong>${t.name || '?'}</strong>${t.cost !== undefined ? ' — $' + t.cost : ''}</li>`));
    lines.push('</ul>');
  }

  const phases = state.phases || [];
  if (phases.length) {
    lines.push(`<h4>Phases (${phases.length})</h4><ul>`);
    phases.forEach(p => lines.push(`<li><strong>Phase ${p.name}</strong>${p.on ? ' — triggered by first ' + p.on + '-train' : ''}</li>`));
    lines.push('</ul>');
  }

  lines.push('<h4>Operating Round — Tile Lays</h4><ul>');
  const defSlots = (m.tileLays && m.tileLays.default) || [DEFAULT_TILE_LAY_SLOT];
  lines.push(`<li>Default: ${describeTileLaySlots(defSlots)}</li>`);
  if ((m.tileLays || {}).byType && (m.tileLays.byType.minor || m.tileLays.byType.major)) {
    if (m.tileLays.byType.minor) lines.push(`<li>Minors: ${describeTileLaySlots(m.tileLays.byType.minor)}</li>`);
    if (m.tileLays.byType.major) lines.push(`<li>Majors: ${describeTileLaySlots(m.tileLays.byType.major)}</li>`);
  }
  if (m.allowRemovingTowns) lines.push('<li>Tile upgrades may remove town dits.</li>');
  lines.push('</ul>');

  const customRequired = identifyCustomRubyRequired();
  lines.push('<h4>What Requires Custom Ruby</h4>');
  if (customRequired.length === 0) {
    lines.push('<p class="mech-ok">✓ Fully expressible from configuration — no custom game.rb methods needed.</p>');
  } else {
    lines.push('<ul class="mech-custom-list">');
    customRequired.forEach(item => lines.push(`<li>${item}</li>`));
    lines.push('</ul>');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Accordion editors (used in the right panel when an item is selected)
// ---------------------------------------------------------------------------
function renderRoundStructure(m) {
  return `
    <label>Initial round
      <select data-mkey="initialRound">
        <option value="waterfall_auction"     ${sel(m.initialRound,'waterfall_auction')}>Waterfall Auction</option>
        <option value="draft"                 ${sel(m.initialRound,'draft')}>Draft</option>
        <option value="parliament"            ${sel(m.initialRound,'parliament')}>Parliament Auction</option>
        <option value="certificate_selection" ${sel(m.initialRound,'certificate_selection')}>Certificate Selection</option>
        <option value="none"                  ${sel(m.initialRound,'none')}>None (start with SR)</option>
      </select>
    </label>
    <label>Stock rounds per set
      <input type="number" min="1" max="4" data-mkey="stockRoundsPerSet" value="${m.stockRoundsPerSet || 1}">
    </label>
    <label><input type="checkbox" data-mkey="mergerRound" ${m.mergerRound ? 'checked' : ''}> Merger round (after OR set)</label>`;
}

function renderTileLays(m) {
  const tl = m.tileLays || {};
  return `
    <label><input type="checkbox" data-mkey="allowRemovingTowns" ${m.allowRemovingTowns ? 'checked' : ''}> Allow removing town dits</label>
    <p class="mech-hint">Default (all entity types):</p>
    ${renderSlotEditor(tl.default || [DEFAULT_TILE_LAY_SLOT], 'tileLays.default')}
    <p class="mech-hint">Override for major corporations:</p>
    ${renderSlotEditorOrNull(tl.byType && tl.byType.major, 'tileLays.byType.major')}
    <p class="mech-hint">Override for minor corporations:</p>
    ${renderSlotEditorOrNull(tl.byType && tl.byType.minor, 'tileLays.byType.minor')}`;
}

function renderSlotEditor(slots, keyPrefix) {
  return slots.map((s, i) => `
    <div class="mech-slot" data-slot-prefix="${keyPrefix}.${i}">
      <span class="mech-slot-num">Slot ${i + 1}</span>
      <label>Lay <select data-slotkey="lay">
        <option value="true"            ${sel(String(s.lay),'true')}>Yes</option>
        <option value="false"           ${sel(String(s.lay),'false')}>No</option>
        <option value="not_if_upgraded" ${sel(String(s.lay),'not_if_upgraded')}>Yellow only</option>
      </select></label>
      <label>Upgrade <select data-slotkey="upgrade">
        <option value="true"            ${sel(String(s.upgrade),'true')}>Yes</option>
        <option value="false"           ${sel(String(s.upgrade),'false')}>No</option>
      </select></label>
      <label>Cost <input type="number" min="0" data-slotkey="cost" value="${s.cost || 0}"></label>
      <label><input type="checkbox" data-slotkey="cannot_reuse_same_hex" ${s.cannot_reuse_same_hex ? 'checked' : ''}> Can't reuse same hex</label>
    </div>`).join('');
}

function renderSlotEditorOrNull(slots, keyPrefix) {
  if (!slots) return `<button class="mech-btn-small" data-override-key="${keyPrefix}">+ Add override</button>`;
  return renderSlotEditor(slots, keyPrefix) +
    `<button class="mech-btn-small mech-btn-danger" data-remove-override="${keyPrefix}">✕ Remove override</button>`;
}

function renderTrainRules(m) {
  return `
    <label>Must buy train
      <select data-mkey="mustBuyTrain">
        <option value="route"  ${sel(m.mustBuyTrain,'route')}>If can run a route (default)</option>
        <option value="always" ${sel(m.mustBuyTrain,'always')}>Always (or go bankrupt)</option>
        <option value="never"  ${sel(m.mustBuyTrain,'never')}>Never forced</option>
      </select>
    </label>
    <label>Capitalization
      <select data-mkey="capitalization">
        <option value="full"        ${sel(m.capitalization,'full')}>Full (on float)</option>
        <option value="incremental" ${sel(m.capitalization,'incremental')}>Incremental (per share sold)</option>
        <option value="none"        ${sel(m.capitalization,'none')}>None</option>
      </select>
    </label>`;
}

function renderEventsSection(m) {
  const knownTypes = KNOWN_EVENTS.map(e =>
    `<option value="${e.type}">${e.type} — ${e.desc}</option>`).join('');
  const trainNames = (state.trains || []).map(t =>
    `<option value="${t.name}">${t.name}</option>`).join('');

  const rows = (m.events || []).map((ev, i) => `
    <div class="mech-event-row">
      <span>When first <strong>${ev.triggerOn}</strong>-train bought → <em>${ev.eventType}</em></span>
      <button class="mech-btn-small mech-btn-danger" data-remove-event="${i}">✕</button>
    </div>`).join('') || '<p class="mech-hint">No event triggers defined.</p>';

  return `
    ${rows}
    <div class="mech-event-add" style="margin-top:12px;">
      <label>Train <select id="mechNewEventTrain">${trainNames || '<option>—</option>'}</select></label>
      <label>Event <select id="mechNewEventType">${knownTypes}</select></label>
      <button class="mech-btn-small" id="mechAddEventBtn">+ Add trigger</button>
    </div>`;
}

function renderSpecialMechanics(m) {
  const steps = m.orSteps || {};
  const stepLabels = {
    issueShares:      'Issue/redeem shares in OR',
    homeToken:        'Explicit home token step',
    specialToken:     'Special token placement step',
    minorAcquisition: 'Minor acquisition step (enables exchange tokens)',
    priceProtection:  'Price protection (president buys at old price)',
    loanOperations:   'Loan operations (auto interest + nationalize on failure)',
  };
  return Object.keys(stepLabels).map(k => `
    <label><input type="checkbox" data-orkey="${k}" ${steps[k] ? 'checked' : ''}> ${stepLabels[k]}</label>`).join('');
}

function renderStructuralNets() {
  const errors = runAllNets();
  const byNet = {};
  errors.forEach(e => { byNet[e.net] = byNet[e.net] || []; byNet[e.net].push(e.message); });

  const rows = STRUCTURAL_NETS.map(net => {
    const errs = byNet[net.id] || [];
    const dot = statusDot(errs.length ? 'red' : 'green');
    return `<div class="mech-net-row">
      ${dot}<span class="mech-net-name">${net.name}</span><span class="mech-net-owner">→ ${net.owner}</span>
      ${errs.map(e => `<div class="mech-net-error">${e}</div>`).join('')}
    </div>`;
  }).join('');

  return `<div style="margin-top:8px;">${rows}</div>`;
}

function describeTileLaySlots(slots) {
  if (!slots || slots.length === 0) return '(none)';
  return slots.map((s, i) => {
    const parts = [];
    if (s.lay === true && s.upgrade === true) parts.push('lay or upgrade');
    else if (s.lay === true) parts.push('lay only');
    else if (s.upgrade === true) parts.push('upgrade only');
    else if (s.lay === 'not_if_upgraded') parts.push('yellow lay only');
    if (s.cost) parts.push('$' + s.cost);
    if (s.cannot_reuse_same_hex) parts.push('no reuse');
    return `[${parts.join(', ')}]`;
  }).join(' ');
}

function identifyCustomRubyRequired() {
  const items = [];
  if (typeof state === 'undefined' || !state.mechanics) return items;
  const m = state.mechanics;
  const knownTypes = new Set(KNOWN_EVENTS.map(e => e.type));
  (state.trains || []).forEach(t => {
    (t.events || []).forEach(ev => {
      if (!knownTypes.has(ev.type))
        items.push(`event_${ev.type}! handler — triggered by ${t.name}-train purchase`);
    });
  });
  if (m.orSteps.minorAcquisition) items.push('G<game>::Step::MinorAcquisition');
  if (m.orSteps.priceProtection)  items.push('G<game>::Step::PriceProtection');
  if (m.orSteps.loanOperations)   items.push('G<game>::Step::LoanOperations + Engine::Loan');
  if (m.merger.enabled && m.merger.style === 'nationalization') items.push('nationalize!(corp) + G<game>::Round::Merger');
  else if (m.merger.enabled) items.push('G<game>::Step::Merge + G<game>::Round::Merger');
  if (m.nationalization.enabled) items.push('nationalize!(corp) + custom G<game>::Round::Operating');
  if ((m.revenueBonuses || []).length > 0) items.push('revenue_for(route, stops) override');
  return items;
}

function sel(current, value) {
  return current === value ? 'selected' : '';
}

// ---------------------------------------------------------------------------
// Input change handler
// ---------------------------------------------------------------------------
function onMechanicsInputChange(e) {
  const key = e.target.dataset.mkey;
  if (!key || typeof state === 'undefined' || !state.mechanics) return;
  const path = key.split('.');
  let obj = state.mechanics;
  for (let i = 0; i < path.length - 1; i++) {
    if (!obj[path[i]]) obj[path[i]] = {};
    obj = obj[path[i]];
  }
  const last = path[path.length - 1];
  if (e.target.type === 'checkbox') obj[last] = e.target.checked;
  else if (e.target.type === 'number') obj[last] = Number(e.target.value);
  else obj[last] = e.target.value;

  if (typeof autosave === 'function') autosave();
  renderMechanicsLeft();
  renderMechanicsRight();
}

// ---------------------------------------------------------------------------
// Event add/remove handlers
// ---------------------------------------------------------------------------
function onAddEvent() {
  if (typeof state === 'undefined' || !state.mechanics) return;
  const trainEl = document.getElementById('mechNewEventTrain');
  const typeEl  = document.getElementById('mechNewEventType');
  if (!trainEl || !typeEl || !trainEl.value) return;
  state.mechanics.events = state.mechanics.events || [];
  state.mechanics.events.push({ triggerOn: trainEl.value, eventType: typeEl.value });
  if (typeof autosave === 'function') autosave();
  renderMechanicsLeft();
  renderMechanicsRight();
}
function onRemoveEvent(idx) {
  if (typeof state === 'undefined' || !state.mechanics) return;
  state.mechanics.events.splice(idx, 1);
  if (typeof autosave === 'function') autosave();
  renderMechanicsLeft();
  renderMechanicsRight();
}
function onEnableOverride(keyPath) {
  if (typeof state === 'undefined' || !state.mechanics) return;
  const path = keyPath.split('.');
  let obj = state.mechanics;
  for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
  obj[path[path.length - 1]] = [Object.assign({}, DEFAULT_TILE_LAY_SLOT)];
  if (typeof autosave === 'function') autosave();
  renderMechanicsLeft();
}
function onRemoveOverride(keyPath) {
  if (typeof state === 'undefined' || !state.mechanics) return;
  const path = keyPath.split('.');
  let obj = state.mechanics;
  for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
  obj[path[path.length - 1]] = null;
  if (typeof autosave === 'function') autosave();
  renderMechanicsLeft();
}

// ---------------------------------------------------------------------------
// Show / hide
// ---------------------------------------------------------------------------
function hideMechanicsView() {
  const view = document.getElementById('mechanicsView');
  if (view) view.style.display = 'none';
  const navBtn = document.querySelector('[data-lsec="mechanics"]');
  if (navBtn) navBtn.classList.remove('active');
  _selectedFrameworkItem = null;
}

// ---------------------------------------------------------------------------
// Nav wiring
// ---------------------------------------------------------------------------
function wireMechanicsPanel() {
  const navBtn = document.querySelector('[data-lsec="mechanics"]');
  if (!navBtn) return;

  navBtn.addEventListener('click', () => {
    // setup.js showMainView('canvas') fires first (mechanics falls into the else branch),
    // re-showing navContent and toggle buttons. We explicitly undo that here.
    const navContentEl   = document.getElementById('navContent');
    const toggleLeftBtn  = document.getElementById('toggleLeftPanelBtn');
    const rightPanel     = document.getElementById('rightPanel');
    const toggleRightBtn = document.getElementById('toggleRightPanelBtn');

    if (navContentEl)   navContentEl.style.display   = 'none';
    if (toggleLeftBtn)  toggleLeftBtn.style.display   = 'none';
    if (rightPanel)     rightPanel.style.display      = 'none';
    if (toggleRightBtn) toggleRightBtn.style.display  = 'none';

    // Hide every other main view
    ['canvasContainer','marketView','corpView','trainsView'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    document.querySelectorAll('.nav-rail-btn').forEach(b => b.classList.remove('active'));
    navBtn.classList.add('active');

    const view = document.getElementById('mechanicsView');
    if (view) view.style.display = 'flex';

    initMechanicsState();
    renderMechanicsLeft();
    renderMechanicsRight();
  });

  // When any OTHER nav button is clicked, hide our view.
  // setup.js will then restore navContent / toggleButtons correctly for its section.
  document.querySelectorAll('.nav-rail-btn[data-lsec]:not([data-lsec="mechanics"])').forEach(btn => {
    btn.addEventListener('click', hideMechanicsView);
  });

  // Delegated event handlers
  document.addEventListener('click', e => {
    if (e.target.id === 'mechEditorBack') {
      _selectedFrameworkItem = null;
      document.querySelectorAll('.mech-item-row').forEach(r => r.classList.remove('selected'));
      renderMechanicsRight();
    }
    if (e.target.id === 'mechAddEventBtn')            onAddEvent();
    if (e.target.dataset.removeEvent !== undefined)   onRemoveEvent(Number(e.target.dataset.removeEvent));
    if (e.target.dataset.overrideKey)                 onEnableOverride(e.target.dataset.overrideKey);
    if (e.target.dataset.removeOverride)              onRemoveOverride(e.target.dataset.removeOverride);
  });
}

// ---------------------------------------------------------------------------
// Public init
// ---------------------------------------------------------------------------
function initMechanicsPanel() {
  initMechanicsState();
  wireMechanicsPanel();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMechanicsPanel);
} else {
  initMechanicsPanel();
}

// ---------------------------------------------------------------------------
// Dev: test game data for screenshot validation
// Call window._loadTestGame('1830') / ('1889') / ('1822') from the console
// then navigate to the Game Mechanics panel to see the framework populated.
// ---------------------------------------------------------------------------
window._loadTestGame = function(name) {
  if (typeof state === 'undefined') { console.warn('state not ready'); return; }

  const games = {
    '1889': {
      trains: [
        { name: '2', distance: 2, cost: 80,  rusts_on: '4',  num: 6, events: [{ type: 'close_companies' }] },
        { name: '3', distance: 3, cost: 180, rusts_on: '6',  num: 4 },
        { name: '4', distance: 4, cost: 300, rusts_on: 'D',  num: 3 },
        { name: '5', distance: 5, cost: 450,                 num: 2 },
        { name: '6', distance: 6, cost: 630,                 num: 2 },
        { name: 'D', distance: 999, cost: 1100,              num: 20 },
      ],
      phases: [
        { name: '2', on: '2', operating_rounds: 1, tiles: ['yellow'] },
        { name: '3', on: '3', operating_rounds: 2, tiles: ['yellow','green'] },
        { name: '4', on: '4', operating_rounds: 2, tiles: ['yellow','green'] },
        { name: '5', on: '5', operating_rounds: 3, tiles: ['yellow','green','brown'] },
        { name: '6', on: '6', operating_rounds: 3, tiles: ['yellow','green','brown'] },
        { name: 'D', on: 'D', operating_rounds: 3, tiles: ['yellow','green','brown','gray'] },
      ],
      companies: [
        { abbr: 'AR', name: 'Awa Railway', color: '#FF0000' },
        { abbr: 'IR', name: 'Iyo Railway', color: '#FF7F00' },
        { abbr: 'SR', name: 'Sanuki Railway', color: '#FFFF00' },
        { abbr: 'KO', name: "Kotohira Kanko-Kisen", color: '#00FF00' },
        { abbr: 'TR', name: 'Takamatsu Railway', color: '#0000FF' },
        { abbr: 'KU', name: 'Kumage Kisen', color: '#8B00FF' },
        { abbr: 'UR', name: 'Uwa Railway', color: '#964B00' },
        { abbr: 'TR2',name: 'Tosa Electric Railway', color: '#808080' },
      ],
      privates: [
        { abbr: 'Sone', name: 'Sone Tramway', value: 30, revenue: 5 },
        { abbr: 'ER',   name: 'Ehime Railway', value: 40, revenue: 10 },
        { abbr: 'Toyo', name: 'Toyo Steamship', value: 40, revenue: 10 },
        { abbr: 'YSK',  name: 'Yoshino Steamship', value: 50, revenue: 10 },
        { abbr: 'IHR',  name: 'Iyo-Hojo Railway', value: 60, revenue: 15 },
        { abbr: 'CF',   name: 'Nishiyama Coal Field', value: 80, revenue: 20 },
      ],
    },
    '1830': {
      trains: [
        { name: '2',  distance: 2,   cost: 80,   rusts_on: '4',  num: 6, events: [{ type: 'close_companies' }] },
        { name: '3',  distance: 3,   cost: 180,  rusts_on: '6',  num: 5 },
        { name: '4',  distance: 4,   cost: 300,  rusts_on: 'D',  num: 4 },
        { name: '5',  distance: 5,   cost: 450,                  num: 3 },
        { name: '6',  distance: 6,   cost: 630,                  num: 2 },
        { name: 'D',  distance: 999, cost: 1100,                 num: 20 },
      ],
      phases: [
        { name: '2', on: '2', operating_rounds: 1, tiles: ['yellow'] },
        { name: '3', on: '3', operating_rounds: 2, tiles: ['yellow','green'] },
        { name: '4', on: '4', operating_rounds: 2, tiles: ['yellow','green'] },
        { name: '5', on: '5', operating_rounds: 3, tiles: ['yellow','green','brown'] },
        { name: '6', on: '6', operating_rounds: 3, tiles: ['yellow','green','brown'] },
        { name: 'D', on: 'D', operating_rounds: 3, tiles: ['yellow','green','brown','gray'] },
      ],
      companies: [
        { abbr: 'PRR', name: 'Pennsylvania',        color: '#286318' },
        { abbr: 'NYC', name: 'New York Central',    color: '#595959' },
        { abbr: 'CPR', name: 'Canadian Pacific',    color: '#d1232a' },
        { abbr: 'B&O', name: 'Baltimore & Ohio',    color: '#0189d1' },
        { abbr: 'C&O', name: 'Chesapeake & Ohio',   color: '#98c3e3' },
        { abbr: 'ERIE',name: 'Erie',                color: '#ffd9eb' },
        { abbr: 'NNH', name: 'New Haven',           color: '#f4722b' },
        { abbr: 'B&M', name: 'Boston & Maine',      color: '#95c272' },
      ],
      privates: [
        { abbr: 'SV',  name: 'Schuylkill Valley',    value: 20,  revenue: 5 },
        { abbr: 'CS',  name: 'Champlain & St. Lawrence', value: 40, revenue: 10 },
        { abbr: 'DH',  name: 'Delaware & Hudson',    value: 70,  revenue: 15 },
        { abbr: 'M&H', name: 'Mohawk & Hudson',      value: 110, revenue: 20 },
        { abbr: 'ERIE_P', name: 'Camden & Amboy',    value: 160, revenue: 25 },
        { abbr: 'B&O_P',  name: 'Baltimore & Ohio',  value: 220, revenue: 30 },
      ],
    },
    '1822': {
      trains: [
        { name: 'L',  distance: 1,   cost: 60,   rusts_on: '3',  num: 4, events: [{ type: 'close_companies' }] },
        { name: '2',  distance: 2,   cost: 120,  rusts_on: '4',  num: 5 },
        { name: '3',  distance: 3,   cost: 200,  rusts_on: '6',  num: 4 },
        { name: '4',  distance: 4,   cost: 300,  rusts_on: 'D',  num: 3 },
        { name: '5',  distance: 5,   cost: 500,                  num: 2, events: [{ type: 'minors_cannot_start' }] },
        { name: '6',  distance: 6,   cost: 600,                  num: 2 },
        { name: '7',  distance: 7,   cost: 750,                  num: 2 },
        { name: 'E',  distance: 99,  cost: 1000,                 num: 10 },
        { name: 'L',  distance: 1,   cost: 60,   _isSpecial: true, num: 4 },
        { name: '2',  distance: 2,   cost: 120,  _isSpecial: true, num: 4 },
        { name: '3',  distance: 3,   cost: 200,  _isSpecial: true, num: 4 },
      ],
      phases: [
        { name: '1', on: 'L',  operating_rounds: 1, tiles: ['yellow'] },
        { name: '2', on: '2',  operating_rounds: 2, tiles: ['yellow','green'] },
        { name: '3', on: '3',  operating_rounds: 2, tiles: ['yellow','green'] },
        { name: '4', on: '4',  operating_rounds: 2, tiles: ['yellow','green','brown'], events: [{ type: 'majors_can_ipo' }] },
        { name: '5', on: '5',  operating_rounds: 3, tiles: ['yellow','green','brown'] },
        { name: '6', on: '6',  operating_rounds: 3, tiles: ['yellow','green','brown'] },
        { name: '7', on: '7',  operating_rounds: 3, tiles: ['yellow','green','brown','gray'] },
        { name: 'E', on: 'E',  operating_rounds: 3, tiles: ['yellow','green','brown','gray'] },
      ],
      companies: [
        { abbr: 'LNWR', name: 'London and North Western Railway', color: '#000000' },
        { abbr: 'GWR',  name: 'Great Western Railway',            color: '#165016' },
        { abbr: 'LBSCR',name: 'London Brighton and South Coast',  color: '#fe7f01' },
        { abbr: 'SECR', name: 'South Eastern and Chatham Railway', color: '#ffd900' },
        { abbr: 'CR',   name: 'Caledonian Railway',               color: '#61a2e4' },
        { abbr: 'MR',   name: 'Midland Railway',                  color: '#e94040' },
        { abbr: 'LYR',  name: 'Lancashire and Yorkshire Railway',  color: '#b3b3b3' },
        { abbr: 'NBR',  name: 'North British Railway',             color: '#a2dced' },
        { abbr: 'GSWR', name: 'Glasgow and South Western Railway', color: '#fdfea1' },
        { abbr: 'GNR',  name: 'Great Northern Railway',            color: '#ffffff' },
        { abbr: 'NER',  name: 'North Eastern Railway',             color: '#f1c27d' },
        { abbr: 'GER',  name: 'Great Eastern Railway',             color: '#c9b99a' },
      ],
      minors: [
        { abbr: 'M1',  name: 'Minor 1 — London' },
        { abbr: 'M2',  name: 'Minor 2 — Bristol' },
        { abbr: 'M3',  name: 'Minor 3 — Birmingham' },
        { abbr: 'M4',  name: 'Minor 4 — Manchester' },
        { abbr: 'M5',  name: 'Minor 5 — Liverpool' },
        { abbr: 'M6',  name: 'Minor 6 — Leeds' },
        { abbr: 'M7',  name: 'Minor 7 — Sheffield' },
        { abbr: 'M8',  name: 'Minor 8 — Newcastle' },
        { abbr: 'M9',  name: 'Minor 9 — Edinburgh' },
        { abbr: 'M10', name: 'Minor 10 — Glasgow' },
      ],
      privates: [
        { abbr: 'P1',  name: 'The Caledonian Railway',          value: 110, revenue: 0 },
        { abbr: 'P2',  name: 'Midland Railway',                 value: 100, revenue: 10 },
        { abbr: 'P3',  name: 'North Eastern Railway train',     value: 100, revenue: 0 },
        { abbr: 'P4',  name: 'North British Railway train',     value: 100, revenue: 0 },
        { abbr: 'P5',  name: 'Great North of Scotland Railway', value: 60,  revenue: 10 },
        { abbr: 'P6',  name: 'Midland & Great Northern Joint',  value: 80,  revenue: 15 },
        { abbr: 'P7',  name: 'South Eastern and Chatham Rly',  value: 70,  revenue: 10 },
      ],
    },
  };

  const g = games[name];
  if (!g) { console.warn('Unknown game:', name); return; }

  state.trains   = g.trains   || [];
  state.phases   = g.phases   || [];
  state.companies = g.companies || [];
  state.minors   = g.minors   || [];
  state.privates = g.privates || [];
  state.mechanics = null; // reset so initMechanicsState re-runs
  initMechanicsState();

  // 1822-specific mechanics
  if (name === '1822') {
    state.mechanics.capitalization   = 'incremental';
    state.mechanics.initialRound     = 'waterfall_auction';
    state.mechanics.orSteps.minorAcquisition = true;
    state.mechanics.orSteps.homeToken = true;
    state.mechanics.merger.enabled   = true;
    state.mechanics.merger.style     = 'minor_to_major';
    state.mechanics.exchangeTokens   = { enabled: true, counts: { LNWR:3, GWR:3, LBSCR:3, SECR:3, CR:3, MR:3, LYR:3, NBR:3, GSWR:3, GNR:3, NER:3, GER:3 } };
  }

  // 1830-specific
  if (name === '1830') {
    state.mechanics.capitalization = 'full';
    state.mechanics.events = [
      { triggerOn: '2', eventType: 'close_companies' },
    ];
  }

  console.log('[mechanics] Loaded test game:', name, '— navigate to Game Mechanics panel');
};
