// mechanics-panel.js
// Evan's domain: game mechanics taxonomy, OR structure, structural net validation.
// Reads from: state.mechanics (own state slice), state.trains, state.phases,
//             state.companies, state.privates, state.companies (corps).
// Does NOT touch: renderer.js, palette.js, companies-panel.js, state.js, io.js, import-ruby.js.

'use strict';

// ---------------------------------------------------------------------------
// Known event handler library (dispatched via event_<type>! in game.rb).
// Source: research across base.rb, 1830, 1846, 1867, 1861, 1880, 1882, 1870,
//         1822 family, 1862, 1868wy game classes.
// ---------------------------------------------------------------------------
const KNOWN_EVENTS = [
  { type: 'close_companies',          desc: 'All private companies close',                        layer: 'base' },
  { type: 'remove_reservations',      desc: 'All unsold home reservations are removed',           layer: 'hook' },
  { type: 'remove_bonuses',           desc: 'East-west / route bonus tokens are removed',         layer: 'hook' },
  { type: 'companies_buyable',        desc: 'Private companies become purchasable by corps',      layer: 'hook' },
  { type: 'nwr',                      desc: 'NWR rebellion: yellow tiles on NWR hexes revert',    layer: 'hook' },
  { type: 'float_30',                 desc: 'Float threshold drops to 30%',                       layer: 'hook' },
  { type: 'float_40',                 desc: 'Float threshold drops to 40%',                       layer: 'hook' },
  { type: 'float_60',                 desc: 'Float threshold drops to 60%',                       layer: 'hook' },
  { type: 'permit_b',                 desc: 'Building permit B unlocked',                         layer: 'hook' },
  { type: 'permit_c',                 desc: 'Building permit C unlocked',                         layer: 'hook' },
  { type: 'permit_d',                 desc: 'Building permit D unlocked',                         layer: 'hook' },
  { type: 'communist_takeover',       desc: 'Communism: halts dividends and share price movement',layer: 'hook' },
  { type: 'stock_exchange_reopens',   desc: 'Stock exchange reopens after communist period',      layer: 'hook' },
  { type: 'receive_capital',          desc: 'Corporations receive their remaining IPO capital',   layer: 'hook' },
  { type: 'green_minors_available',   desc: 'Minors may now buy green trains',                    layer: 'hook' },
  { type: 'majors_can_ipo',           desc: 'Major corporations open for IPO',                    layer: 'hook' },
  { type: 'minors_cannot_start',      desc: 'New minors may no longer start',                     layer: 'hook' },
  { type: 'minors_nationalized',      desc: 'All remaining minors are nationalized',              layer: 'hook' },
  { type: 'trainless_nationalization',desc: 'Trainless entities nationalize at round end',        layer: 'hook' },
  { type: 'nationalize_companies',    desc: 'Private companies are absorbed into the national',   layer: 'hook' },
  { type: 'full_capitalisation',      desc: 'Capitalization switches from incremental to full',   layer: 'hook' },
  { type: 'phase_revenue',            desc: 'Private company revenues update for new phase',      layer: 'hook' },
  { type: 'all_corps_available',      desc: 'All corporations are now available to float',        layer: 'hook' },
  { type: 'uranium_boom',             desc: 'Uranium hexes enter boom period (revenue up)',        layer: 'hook' },
  { type: 'uranium_bust',             desc: 'Uranium hexes exit boom period',                     layer: 'hook' },
  { type: 'trigger_endgame',          desc: 'Final OR set countdown begins',                      layer: 'hook' },
  { type: 'remove_forts',             desc: 'Fort blockers are removed from the map',             layer: 'hook' },
  { type: 'lner_trigger',             desc: 'LNER formation process begins',                      layer: 'hook' },
  { type: 'open_detroit_duluth',      desc: 'Detroit–Duluth blocker tokens are removed',          layer: 'hook' },
  { type: 'close_ndem',               desc: 'NDEM auto-corporation dissolves',                    layer: 'hook' },
];

// Timing vocabulary for ability `when:` field.
// Source: special_track.rb:149-157, tracker.rb:87-92, ability/base.rb:23.
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
// lay/upgrade: true | false | 'not_if_upgraded'
// cost, upgrade_cost: int
// cannot_reuse_same_hex: bool
const DEFAULT_TILE_LAY_SLOT = { lay: true, upgrade: true, cost: 0, upgrade_cost: 0, cannot_reuse_same_hex: false };

// Structural net definitions: each net describes a cross-section consistency
// requirement. owner = who populates the source data, validator = function name.
const STRUCTURAL_NETS = [
  {
    id: 'rust_cross_ref',
    name: 'Train rust cross-reference',
    desc: 'Every rusts_on / obsolete_on value must name a valid train or variant',
    owner: 'Farrah',
    validate: validateRustCrossRefs,
  },
  {
    id: 'phase_on_cross_ref',
    name: 'Phase trigger cross-reference',
    desc: 'Every PHASES on: value must match a train name or variant name',
    owner: 'Farrah',
    validate: validatePhaseOnCrossRefs,
  },
  {
    id: 'train_event_library',
    name: 'Train event handler library',
    desc: 'Every events: type on a TRAINS entry must exist in the known event library',
    owner: 'Evan',
    validate: validateTrainEventTypes,
  },
  {
    id: 'ability_on_phase',
    name: 'Ability on_phase reference',
    desc: 'Every ability on_phase: value must match a phase name in PHASES',
    owner: 'Jenny',
    validate: validateAbilityOnPhase,
  },
  {
    id: 'ability_corporation',
    name: 'Ability corporation reference',
    desc: 'Every ability corporation:/corporations: value must exist in CORPORATIONS',
    owner: 'Jenny',
    validate: validateAbilityCorporation,
  },
  {
    id: 'exchange_tokens',
    name: 'Exchange token corps',
    desc: 'Exchange token map must only contain major corporation syms',
    owner: 'Evan',
    validate: validateExchangeTokenCorps,
  },
  {
    id: 'merger_associations',
    name: 'Minor/major merger associations',
    desc: 'Every association must reference an existing minor sym and major corp sym',
    owner: 'Evan',
    validate: validateMergerAssociations,
  },
];

// ---------------------------------------------------------------------------
// State initialisation
// Extends the global `state` object with state.mechanics without touching state.js.
// ---------------------------------------------------------------------------
function initMechanicsState() {
  if (!window.state) return;
  if (state.mechanics) return; // already initialized (e.g. loaded from JSON)
  state.mechanics = {
    initialRound: 'waterfall_auction',
    stockRoundsPerSet: 1,
    mergerRound: false,
    allowRemovingTowns: false,
    mustBuyTrain: 'route',
    capitalization: 'full',
    tileLays: {
      default: [Object.assign({}, DEFAULT_TILE_LAY_SLOT)],
      byType: { minor: null, major: null },
      phaseGated: false,
      phaseOverrides: [],
    },
    exchangeTokens: { enabled: false, counts: {} },
    revenueBonuses: [],
    events: [],
    orSteps: {
      issueShares: false,
      homeToken: true,
      specialToken: false,
      minorAcquisition: false,
      priceProtection: false,
      loanOperations: false,
    },
    merger: {
      enabled: false,
      style: 'minor_to_major',
      roundTiming: 'after_or',
      associations: [],
    },
    nationalization: {
      enabled: false,
      nationalCorpSym: null,
      triggerTrains: [],
      reservationHexes: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Structural net validators
// Each returns an array of {net, message} objects. Empty = no errors.
// ---------------------------------------------------------------------------

function allTrainNames() {
  if (!window.state || !state.trains) return new Set();
  const names = new Set();
  state.trains.forEach(t => {
    names.add(t.name);
    (t.variants || []).forEach(v => v.name && names.add(v.name));
  });
  return names;
}

function allPhaseNames() {
  if (!window.state || !state.phases) return new Set();
  return new Set((state.phases || []).map(p => p.name));
}

function allCorpSyms() {
  if (!window.state) return new Set();
  const syms = new Set();
  (state.companies || []).forEach(c => c.abbr && syms.add(c.abbr));
  return syms;
}

function allMinorSyms() {
  if (!window.state) return new Set();
  const syms = new Set();
  (state.minors || []).forEach(m => m.abbr && syms.add(m.abbr));
  return syms;
}

function majorCorpSyms() {
  if (!window.state) return new Set();
  const syms = new Set();
  (state.companies || []).filter(c => !c.isMinor).forEach(c => c.abbr && syms.add(c.abbr));
  return syms;
}

function validateRustCrossRefs() {
  const errors = [];
  const trains = allTrainNames();
  (state.trains || []).forEach(t => {
    if (t.rusts_on && !trains.has(t.rusts_on))
      errors.push({ net: 'rust_cross_ref', message: `Train "${t.name}" rusts_on "${t.rusts_on}" which does not exist in TRAINS` });
    if (t.obsolete_on && !trains.has(t.obsolete_on))
      errors.push({ net: 'rust_cross_ref', message: `Train "${t.name}" obsolete_on "${t.obsolete_on}" which does not exist in TRAINS` });
    (t.variants || []).forEach(v => {
      if (v.rusts_on && !trains.has(v.rusts_on))
        errors.push({ net: 'rust_cross_ref', message: `Train "${t.name}" variant "${v.name}" rusts_on "${v.rusts_on}" which does not exist` });
    });
  });
  return errors;
}

function validatePhaseOnCrossRefs() {
  const errors = [];
  const trains = allTrainNames();
  (state.phases || []).forEach(p => {
    if (p.on && !trains.has(p.on))
      errors.push({ net: 'phase_on_cross_ref', message: `Phase "${p.name}" on: "${p.on}" does not match any train or variant name` });
  });
  return errors;
}

function validateTrainEventTypes() {
  const errors = [];
  const knownTypes = new Set(KNOWN_EVENTS.map(e => e.type));
  (state.trains || []).forEach(t => {
    (t.events || []).forEach(ev => {
      if (!knownTypes.has(ev.type))
        errors.push({ net: 'train_event_library', message: `Train "${t.name}" event type "${ev.type}" is not in the known event library — custom Ruby required` });
    });
  });
  (state.phases || []).forEach(p => {
    (p.events || []).forEach(ev => {
      if (!knownTypes.has(ev.type))
        errors.push({ net: 'train_event_library', message: `Phase "${p.name}" event type "${ev.type}" is not in the known event library — custom Ruby required` });
    });
  });
  return errors;
}

function validateAbilityOnPhase() {
  const errors = [];
  const phases = allPhaseNames();
  const allCompanies = [...(state.privates || []), ...(state.companies || []), ...(state.minors || [])];
  allCompanies.forEach(co => {
    (co.abilities || []).forEach(ab => {
      if (ab.on_phase && !phases.has(ab.on_phase))
        errors.push({ net: 'ability_on_phase', message: `Company "${co.name}" ability on_phase "${ab.on_phase}" does not match any phase name` });
    });
  });
  return errors;
}

function validateAbilityCorporation() {
  const errors = [];
  const corps = allCorpSyms();
  const allCompanies = [...(state.privates || []), ...(state.companies || []), ...(state.minors || [])];
  allCompanies.forEach(co => {
    (co.abilities || []).forEach(ab => {
      const targets = ab.corporation ? [ab.corporation] : (ab.corporations || []);
      targets.forEach(sym => {
        if (!corps.has(sym))
          errors.push({ net: 'ability_corporation', message: `Company "${co.name}" ability references corporation "${sym}" which does not exist in CORPORATIONS` });
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
      errors.push({ net: 'exchange_tokens', message: `Exchange token entry "${sym}" is not a major corporation` });
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
      errors.push({ net: 'merger_associations', message: `Merger association minor "${pair.minorSym}" does not exist in MINORS` });
    if (!majors.has(pair.majorSym))
      errors.push({ net: 'merger_associations', message: `Merger association major "${pair.majorSym}" does not exist in CORPORATIONS (major type)` });
  });
  return errors;
}

function runAllNets() {
  const allErrors = [];
  STRUCTURAL_NETS.forEach(net => {
    const errs = net.validate();
    allErrors.push(...errs);
  });
  return allErrors;
}

// ---------------------------------------------------------------------------
// Mechanic log — generates plain-English narrative from state.mechanics
// ---------------------------------------------------------------------------

function buildMechanicLog() {
  if (!window.state) return '';
  const m = state.mechanics || {};
  const lines = [];

  // Game flow
  lines.push('<h4>Game Flow</h4><ol>');
  const roundNames = {
    waterfall_auction: 'Players bid for private companies in a Waterfall Auction',
    draft: 'Players draft private companies from a rolling window',
    parliament: 'Companies are auctioned in a Parliament round before the game begins',
    certificate_selection: 'Players are dealt cards and keep a hand (certificate selection + draft)',
    none: 'The game begins directly with Stock Rounds (no initial auction)',
  };
  lines.push(`<li>${roundNames[m.initialRound] || m.initialRound || 'Initial round not configured'}.</li>`);
  const srCount = m.stockRoundsPerSet || 1;
  lines.push(`<li>Players take turns buying and selling shares (${srCount} Stock Round${srCount > 1 ? 's' : ''} per set).</li>`);
  lines.push('<li>Corporations operate in order of share price.</li>');
  if (m.mergerRound || (m.merger && m.merger.enabled))
    lines.push('<li>A Merger Round occurs between Stock and Operating rounds once mergers are available.</li>');
  lines.push('</ol>');

  // OR tile lays
  lines.push('<h4>Operating Round — Tile Lays</h4><ul>');
  const defSlots = (m.tileLays && m.tileLays.default) || [DEFAULT_TILE_LAY_SLOT];
  lines.push(`<li>Default tile lay budget: ${describeTileLaySlots(defSlots)}</li>`);
  const byType = (m.tileLays && m.tileLays.byType) || {};
  if (byType.minor)
    lines.push(`<li>Minors: ${describeTileLaySlots(byType.minor)}</li>`);
  if (byType.major)
    lines.push(`<li>Majors: ${describeTileLaySlots(byType.major)}</li>`);
  if (m.allowRemovingTowns)
    lines.push('<li>Tile upgrades may remove town dits (ALLOW_REMOVING_TOWNS = true).</li>');
  lines.push('</ul>');

  // Train rules
  lines.push('<h4>Train Rules</h4><ul>');
  const mustBuyDesc = {
    always: 'Corporations must buy a train every Operating Round or go bankrupt',
    never: 'Corporations are never forced to buy trains',
    route: 'Corporations must buy a train if they can run a route but have none',
  };
  lines.push(`<li>${mustBuyDesc[m.mustBuyTrain] || 'Must-buy rule not configured'}.</li>`);
  lines.push('</ul>');

  // Phase events
  const events = m.events || [];
  if (events.length) {
    lines.push('<h4>Phase Events</h4><ul>');
    events.forEach(ev => {
      const knownEv = KNOWN_EVENTS.find(e => e.type === ev.eventType);
      const desc = knownEv ? knownEv.desc : `Custom event: ${ev.eventType}`;
      lines.push(`<li>When the first <strong>${ev.triggerOn}</strong>-train is purchased: ${desc}.</li>`);
    });
    lines.push('</ul>');
  }

  // Revenue bonuses
  const bonuses = m.revenueBonuses || [];
  if (bonuses.length) {
    lines.push('<h4>Revenue Bonuses</h4><ul>');
    bonuses.forEach(b => {
      lines.push(`<li><strong>${b.name || 'Unnamed bonus'}</strong>: +$${b.amount} when a route touches ${describeHexGroups(b)}.</li>`);
    });
    lines.push('</ul>');
  }

  // Special mechanics
  const steps = m.orSteps || {};
  const specialOn = Object.keys(steps).filter(k => steps[k]);
  if (specialOn.length) {
    lines.push('<h4>Special Mechanics</h4><ul>');
    const stepDesc = {
      issueShares: 'Corporations may issue or redeem shares during their OR turn',
      homeToken: 'Home token placement is a distinct OR step',
      specialToken: 'Private company special token placement is enabled',
      minorAcquisition: 'Major corporations may acquire minors during their OR turn (exchange token mechanic)',
      priceProtection: 'Price protection: president may buy shares at old price before market drops',
      loanOperations: 'Corporations may take loans; interest is paid automatically each OR',
    };
    specialOn.forEach(k => lines.push(`<li>${stepDesc[k] || k}</li>`));
    lines.push('</ul>');
  }

  // Validation warnings
  const errors = runAllNets();
  if (errors.length) {
    lines.push('<h4 class="mech-warnings">Validation Warnings</h4><ul class="mech-warn-list">');
    errors.forEach(e => lines.push(`<li>⚠ ${e.message}</li>`));
    lines.push('</ul>');
  }

  // What requires custom Ruby
  const customRequired = identifyCustomRubyRequired();
  lines.push('<h4>What Requires Custom Ruby</h4>');
  if (customRequired.length === 0) {
    lines.push('<p class="mech-ok">✓ Your game is fully expressible from configuration — no custom game.rb methods needed.</p>');
  } else {
    lines.push('<ul class="mech-custom-list">');
    customRequired.forEach(item => lines.push(`<li>${item}</li>`));
    lines.push('</ul>');
  }

  return lines.join('\n');
}

function describeTileLaySlots(slots) {
  if (!slots || slots.length === 0) return '(none)';
  return slots.map((s, i) => {
    const parts = [];
    if (s.lay === true && s.upgrade === true) parts.push('lay or upgrade');
    else if (s.lay === true) parts.push('lay only');
    else if (s.upgrade === true) parts.push('upgrade only');
    else if (s.lay === 'not_if_upgraded') parts.push('yellow lay only (if no upgrade this turn)');
    if (s.cost) parts.push(`costs $${s.cost}`);
    if (s.cannot_reuse_same_hex) parts.push('cannot reuse same hex');
    return `[slot ${i + 1}: ${parts.join(', ')}]`;
  }).join(' ');
}

function describeHexGroups(bonus) {
  if (!bonus.hexGroups || bonus.hexGroups.length === 0) return 'specified hexes';
  if (bonus.type === 'pair')
    return `one hex from group A (${bonus.hexGroups[0].join(', ')}) AND one from group B (${bonus.hexGroups[1].join(', ')})`;
  return bonus.hexGroups.flat().join(', ');
}

function identifyCustomRubyRequired() {
  const items = [];
  if (!window.state || !state.mechanics) return items;
  const m = state.mechanics;

  // Check train events against library
  const knownTypes = new Set(KNOWN_EVENTS.map(e => e.type));
  (state.trains || []).forEach(t => {
    (t.events || []).forEach(ev => {
      if (!knownTypes.has(ev.type))
        items.push(`event_${ev.type}! handler — triggered by ${t.name}-train purchase`);
    });
  });

  if (m.orSteps.minorAcquisition)
    items.push('G<game>::Step::MinorAcquisition — custom OR step for minor acquisition');
  if (m.orSteps.priceProtection)
    items.push('G<game>::Step::PriceProtection — custom step preventing market drop until president decides');
  if (m.orSteps.loanOperations)
    items.push('G<game>::Step::LoanOperations + Engine::Loan class + nationalize! method');
  if (m.merger.enabled && m.merger.style === 'nationalization')
    items.push('nationalize!(corp) method + G<game>::Round::Merger');
  if (m.merger.enabled && m.merger.style !== 'nationalization')
    items.push('G<game>::Step::Merge + G<game>::Round::Merger');
  if (m.nationalization.enabled)
    items.push('nationalize!(corp) method + custom G<game>::Round::Operating with skip_entity? phase logic');
  if (m.revenueBonuses.length > 0)
    items.push('revenue_for(route, stops) override — route bonus calculation');

  return items;
}

// ---------------------------------------------------------------------------
// Left panel rendering — accordion sections
// ---------------------------------------------------------------------------

function renderMechanicsLeft() {
  const el = document.getElementById('mechanicsLeft');
  if (!el) return;
  if (!window.state || !state.mechanics) { el.innerHTML = '<p>Loading…</p>'; return; }
  const m = state.mechanics;

  el.innerHTML = `
    ${accordionSection('Round Structure', renderRoundStructure(m))}
    ${accordionSection('Operating Round — Tile Lays', renderTileLays(m))}
    ${accordionSection('Train Rules', renderTrainRules(m))}
    ${accordionSection('Events', renderEventsSection(m))}
    ${accordionSection('Revenue Bonuses', renderRevenueBonuses(m))}
    ${accordionSection('Special Mechanics', renderSpecialMechanics(m))}
    ${accordionSection('Structural Nets', renderStructuralNets())}
  `;

  el.querySelectorAll('.mech-accordion-header').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const body = hdr.nextElementSibling;
      body.classList.toggle('mech-collapsed');
      hdr.classList.toggle('mech-open');
    });
  });

  el.querySelectorAll('[data-mkey]').forEach(input => {
    input.addEventListener('change', onMechanicsInputChange);
  });
}

function accordionSection(title, content) {
  return `
    <div class="mech-accordion">
      <div class="mech-accordion-header mech-open">${title}</div>
      <div class="mech-accordion-body">${content}</div>
    </div>`;
}

function renderRoundStructure(m) {
  return `
    <label>Initial round
      <select data-mkey="initialRound">
        <option value="waterfall_auction" ${sel(m.initialRound,'waterfall_auction')}>Waterfall Auction</option>
        <option value="draft"             ${sel(m.initialRound,'draft')}>Draft</option>
        <option value="parliament"        ${sel(m.initialRound,'parliament')}>Parliament Auction</option>
        <option value="certificate_selection" ${sel(m.initialRound,'certificate_selection')}>Certificate Selection</option>
        <option value="none"              ${sel(m.initialRound,'none')}>None (start with SR)</option>
      </select>
    </label>
    <label>Stock rounds per set
      <input type="number" min="1" max="4" data-mkey="stockRoundsPerSet" value="${m.stockRoundsPerSet || 1}">
    </label>
    <label><input type="checkbox" data-mkey="mergerRound" ${m.mergerRound ? 'checked' : ''}> Merger round (after OR set)</label>
  `;
}

function renderTileLays(m) {
  const tl = m.tileLays || {};
  return `
    <label><input type="checkbox" data-mkey="allowRemovingTowns" ${m.allowRemovingTowns ? 'checked' : ''}> Allow removing town dits</label>
    <p class="mech-hint">Default tile lay (all entity types):</p>
    ${renderSlotEditor(tl.default || [DEFAULT_TILE_LAY_SLOT], 'tileLays.default')}
    <p class="mech-hint">Override for major corporations (null = use default):</p>
    ${renderSlotEditorOrNull(tl.byType && tl.byType.major, 'tileLays.byType.major')}
    <p class="mech-hint">Override for minor corporations (null = use default):</p>
    ${renderSlotEditorOrNull(tl.byType && tl.byType.minor, 'tileLays.byType.minor')}
  `;
}

function renderSlotEditor(slots, keyPrefix) {
  return slots.map((s, i) => `
    <div class="mech-slot" data-slot-prefix="${keyPrefix}.${i}">
      <span class="mech-slot-num">Slot ${i + 1}</span>
      <label>Lay <select data-slotkey="lay">
        <option value="true"             ${sel(String(s.lay),'true')}>Yes</option>
        <option value="false"            ${sel(String(s.lay),'false')}>No</option>
        <option value="not_if_upgraded"  ${sel(String(s.lay),'not_if_upgraded')}>Yellow only (if no upgrade)</option>
      </select></label>
      <label>Upgrade <select data-slotkey="upgrade">
        <option value="true"             ${sel(String(s.upgrade),'true')}>Yes</option>
        <option value="false"            ${sel(String(s.upgrade),'false')}>No</option>
        <option value="not_if_upgraded"  ${sel(String(s.upgrade),'not_if_upgraded')}>Only if no upgrade yet</option>
      </select></label>
      <label>Cost <input type="number" min="0" data-slotkey="cost" value="${s.cost || 0}"></label>
      <label><input type="checkbox" data-slotkey="cannot_reuse_same_hex" ${s.cannot_reuse_same_hex ? 'checked' : ''}> Can't reuse same hex</label>
    </div>`).join('');
}

function renderSlotEditorOrNull(slots, keyPrefix) {
  if (!slots) {
    return `<button class="mech-btn-small" data-override-key="${keyPrefix}">+ Override for this type</button>`;
  }
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
    </label>
  `;
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
    <div class="mech-event-add">
      <label>Train <select id="mechNewEventTrain">${trainNames}</select></label>
      <label>Event <select id="mechNewEventType">${knownTypes}</select></label>
      <button class="mech-btn-small" id="mechAddEventBtn">+ Add trigger</button>
    </div>
  `;
}

function renderRevenueBonuses(m) {
  const rows = (m.revenueBonuses || []).map((b, i) => `
    <div class="mech-bonus-row">
      <span>${b.name || 'Bonus ' + (i+1)}: +$${b.amount}</span>
      <button class="mech-btn-small mech-btn-danger" data-remove-bonus="${i}">✕</button>
    </div>`).join('') || '<p class="mech-hint">No revenue bonuses defined.</p>';

  return `
    ${rows}
    <button class="mech-btn-small" id="mechAddBonusBtn">+ Add bonus zone</button>
    <p class="mech-hint">Hex arrays must match map hex IDs. Use the hex picker on the map.</p>
  `;
}

function renderSpecialMechanics(m) {
  const steps = m.orSteps || {};
  const merger = m.merger || {};
  const nat = m.nationalization || {};

  const stepLabels = {
    issueShares: 'Issue/redeem shares in OR',
    homeToken: 'Explicit home token step',
    specialToken: 'Special token placement step',
    minorAcquisition: 'Minor acquisition step (enables exchange tokens)',
    priceProtection: 'Price protection (president buys at old price)',
    loanOperations: 'Loan operations (auto interest + nationalize on failure)',
  };

  const stepToggles = Object.keys(stepLabels).map(k => `
    <label><input type="checkbox" data-orkey="${k}" ${steps[k] ? 'checked' : ''}> ${stepLabels[k]}</label>`).join('');

  let exchangeSection = '';
  if (steps.minorAcquisition && (m.exchangeTokens || {}).enabled) {
    const counts = (m.exchangeTokens || {}).counts || {};
    const rows = (state.companies || []).filter(c => !c.isMinor).map(c => `
      <label>${c.abbr} <input type="number" min="0" max="10" data-etkey="${c.abbr}" value="${counts[c.abbr] || 3}"></label>`).join('');
    exchangeSection = `<div class="mech-subsection"><strong>Exchange token counts (majors only):</strong>${rows}</div>`;
  }

  const mergerSection = `
    <label><input type="checkbox" data-mkey="merger.enabled" ${merger.enabled ? 'checked' : ''}> Merger/conversion round</label>
    ${merger.enabled ? `
      <label>Merger style
        <select data-mkey="merger.style">
          <option value="minor_to_major" ${sel(merger.style,'minor_to_major')}>Minor → Major formation</option>
          <option value="major_to_major" ${sel(merger.style,'major_to_major')}>Major ↔ Major merge</option>
          <option value="nationalization" ${sel(merger.style,'nationalization')}>Nationalization</option>
        </select>
      </label>
      <label>Round fires
        <select data-mkey="merger.roundTiming">
          <option value="after_or" ${sel(merger.roundTiming,'after_or')}>After OR set</option>
          <option value="after_sr" ${sel(merger.roundTiming,'after_sr')}>After SR</option>
        </select>
      </label>` : ''}
  `;

  const natSection = `
    <label><input type="checkbox" data-mkey="nationalization.enabled" ${nat.enabled ? 'checked' : ''}> Nationalization mechanic</label>
    ${nat.enabled ? `<p class="mech-hint">Requires custom Ruby: nationalize!(corp) + G::Round::Operating override. See brief section 4.</p>` : ''}
  `;

  return `${stepToggles}${exchangeSection}${mergerSection}${natSection}`;
}

function renderStructuralNets() {
  const errors = runAllNets();
  const byNet = {};
  errors.forEach(e => { byNet[e.net] = byNet[e.net] || []; byNet[e.net].push(e.message); });

  const rows = STRUCTURAL_NETS.map(net => {
    const errs = byNet[net.id] || [];
    const status = errs.length ? '❌' : '✅';
    const detail = errs.map(e => `<div class="mech-net-error">${e}</div>`).join('');
    return `
      <div class="mech-net-row">
        <span class="mech-net-status">${status}</span>
        <span class="mech-net-name">${net.name}</span>
        <span class="mech-net-owner">→ ${net.owner}</span>
        ${detail}
      </div>`;
  }).join('');

  const total = STRUCTURAL_NETS.length;
  const passing = total - Object.keys(byNet).length;
  return `
    <p class="mech-hint">${passing} of ${total} nets valid</p>
    ${rows}
    <button class="mech-btn-small" id="mechRevalidateBtn">Re-validate</button>
  `;
}

function sel(current, value) {
  return current === value ? 'selected' : '';
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

function onMechanicsInputChange(e) {
  const key = e.target.dataset.mkey;
  if (!key || !window.state || !state.mechanics) return;
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
  renderMechanicsRight();
  renderMechanicsLeft(); // re-render to show/hide conditional sections
}

function hideMechanicsView() {
  const view = document.getElementById('mechanicsView');
  if (view) view.style.display = 'none';
  const navBtn = document.querySelector('[data-lsec="mechanics"]');
  if (navBtn) navBtn.classList.remove('active');
}

function wireMechanicsPanel() {
  const navBtn = document.querySelector('[data-lsec="mechanics"]');
  if (!navBtn) return;

  navBtn.addEventListener('click', () => {
    // Hide all other main views (setup.js owns these; we just mirror their hide list)
    document.querySelectorAll('#canvasContainer, #marketView, #corpView, #trainsView').forEach(el => {
      el.style.display = 'none';
    });
    // Hide the right panel and its toggle — setup.js only shows these in canvas view
    // (mirrors setup.js:34-39 logic for non-canvas nav sections)
    const rightPanel = document.getElementById('rightPanel');
    if (rightPanel) rightPanel.style.display = 'none';
    const toggleRightBtn = document.getElementById('toggleRightPanelBtn');
    if (toggleRightBtn) toggleRightBtn.style.display = 'none';
    // Remove active from all other nav buttons; mark ours active
    document.querySelectorAll('.nav-rail-btn').forEach(b => b.classList.remove('active'));
    navBtn.classList.add('active');

    const view = document.getElementById('mechanicsView');
    if (view) view.style.display = 'flex';
    initMechanicsState();
    renderMechanicsLeft();
    renderMechanicsRight();
  });

  // When any OTHER nav button is clicked, hide mechanicsView.
  // setup.js handles showing the correct view; we just need to get out of the way.
  document.querySelectorAll('.nav-rail-btn[data-lsec]:not([data-lsec="mechanics"])').forEach(btn => {
    btn.addEventListener('click', hideMechanicsView);
  });

  // Add event handler wiring (delegated)
  document.addEventListener('click', e => {
    if (e.target.id === 'mechAddEventBtn') onAddEvent();
    if (e.target.id === 'mechRevalidateBtn') { renderMechanicsLeft(); renderMechanicsRight(); }
    if (e.target.dataset.removeEvent !== undefined) onRemoveEvent(Number(e.target.dataset.removeEvent));
    if (e.target.dataset.removeBonus !== undefined) onRemoveBonus(Number(e.target.dataset.removeBonus));
    if (e.target.dataset.overrideKey) onEnableOverride(e.target.dataset.overrideKey);
    if (e.target.dataset.removeOverride) onRemoveOverride(e.target.dataset.removeOverride);
  });
}

function onAddEvent() {
  if (!window.state || !state.mechanics) return;
  const trainEl = document.getElementById('mechNewEventTrain');
  const typeEl = document.getElementById('mechNewEventType');
  if (!trainEl || !typeEl) return;
  state.mechanics.events = state.mechanics.events || [];
  state.mechanics.events.push({ triggerOn: trainEl.value, eventType: typeEl.value });
  if (typeof autosave === 'function') autosave();
  renderMechanicsLeft();
  renderMechanicsRight();
}

function onRemoveEvent(idx) {
  if (!window.state || !state.mechanics) return;
  state.mechanics.events.splice(idx, 1);
  if (typeof autosave === 'function') autosave();
  renderMechanicsLeft();
  renderMechanicsRight();
}

function onRemoveBonus(idx) {
  if (!window.state || !state.mechanics) return;
  state.mechanics.revenueBonuses.splice(idx, 1);
  if (typeof autosave === 'function') autosave();
  renderMechanicsLeft();
  renderMechanicsRight();
}

function onEnableOverride(keyPath) {
  if (!window.state || !state.mechanics) return;
  const path = keyPath.split('.');
  let obj = state.mechanics;
  for (let i = 0; i < path.length - 1; i++) { obj = obj[path[i]]; }
  obj[path[path.length - 1]] = [Object.assign({}, DEFAULT_TILE_LAY_SLOT)];
  if (typeof autosave === 'function') autosave();
  renderMechanicsLeft();
}

function onRemoveOverride(keyPath) {
  if (!window.state || !state.mechanics) return;
  const path = keyPath.split('.');
  let obj = state.mechanics;
  for (let i = 0; i < path.length - 1; i++) { obj = obj[path[i]]; }
  obj[path[path.length - 1]] = null;
  if (typeof autosave === 'function') autosave();
  renderMechanicsLeft();
}

// ---------------------------------------------------------------------------
// Right panel — mechanic log
// ---------------------------------------------------------------------------

function renderMechanicsRight() {
  const el = document.getElementById('mechanicsRight');
  if (!el) return;
  if (!window.state || !state.mechanics) { el.innerHTML = '<p>Enable a mechanic on the left to see the log.</p>'; return; }
  el.innerHTML = buildMechanicLog();
}

// ---------------------------------------------------------------------------
// Public init — called from setup.js or self-initializing after DOM ready
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
