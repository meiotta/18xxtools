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

// ---------------------------------------------------------------------------
// Known phase status vocabulary.
// Source: STATUS_TEXT constants across 18xx-master lib/engine/game/ files.
// Format: { key, label, desc, tier, effects[] }
// Tiers: 'universal' | 'hook' | 'family_1856' | 'family_1822' | 'game_specific'
// Effects: identifiers for which downstream wiring is required.
// ---------------------------------------------------------------------------
const KNOWN_STATUS = [
  // ── Tier A: Universal engine ──────────────────────────────────────────────
  // lib/engine/step/buy_company.rb:26, buy_sell_par_shares.rb:301,
  // single_depot_train_buy.rb:15
  { key: 'can_buy_companies',
    label: 'Can Buy Companies',
    desc: 'All corporations can buy companies from players (OR step)',
    tier: 'universal', effects: ['buy_company_step'] },
  { key: 'can_buy_companies_from_other_players',
    label: 'Interplayer Company Buy',
    desc: 'Companies can be bought between players after first stock round',
    tier: 'universal', effects: [] },
  { key: 'can_buy_companies_operation_round_one',
    label: 'Buy Companies OR1 Only',
    desc: 'Corporations may buy companies during first OR of each set only',
    tier: 'hook', effects: ['buy_company_step'] },
  { key: 'limited_train_buy',
    label: 'Limited Train Buy',
    desc: 'Corporations can only buy one train from the bank per OR',
    tier: 'universal', effects: ['single_depot_train_buy_step'] },
  // ── Tier B: Common hooks ──────────────────────────────────────────────────
  // Require game method or step overrides; editor should generate stub.
  // g_1822/step/buy_train.rb:13, g_1867/game.rb:153, g_18_co/game.rb:1405,
  // g_18_mt/game.rb:145, g_18_fr/game.rb:336, g_18_esp/game.rb:514
  { key: 'can_buy_trains',
    label: 'Buy Trains From Others',
    desc: 'Corporations may buy trains from other corporations',
    tier: 'hook', effects: ['custom_buy_train_step'] },
  { key: 'export_train',
    label: 'Train Export',
    desc: 'At OR end, next available train exported (triggers phase change)',
    tier: 'hook', effects: ['custom_or_end'] },
  { key: 'reduced_tile_lay',
    label: 'Reduced Tile Lay',
    desc: 'Corporations place only one tile per OR',
    tier: 'hook', effects: ['tile_lays_override'] },
  { key: 'extra_tile_lays',
    label: 'Extra Tile Lay',
    desc: 'Corporations receive an additional tile lay slot',
    tier: 'hook', effects: ['tile_lays_override'] },
  { key: 'two_tile_lays',
    label: 'Two Tile Lays',
    desc: 'Corporations lay two tiles per OR (where default is one)',
    tier: 'hook', effects: ['tile_lays_override'] },
  { key: 'lay_second_tile',
    label: 'Second Tile Lay',
    desc: 'Specific corporations can lay a second tile',
    tier: 'hook', effects: ['tile_lays_override'] },
  // ── Tier C: 1856 family — capitalization mode (mutually exclusive) ────────
  // lib/engine/game/g_1856/game.rb:846–891
  { key: 'escrow',
    label: 'Escrow Cap',
    desc: 'New corps capitalize for first 5 shares; last 5 held in escrow until destinated',
    tier: 'family_1856', effects: ['cap_mode_1856'] },
  { key: 'incremental',
    label: 'Incremental Cap',
    desc: 'New corps capitalize for all 10 shares as sold, regardless of destination',
    tier: 'family_1856', effects: ['cap_mode_1856'] },
  { key: 'fullcap',
    label: 'Full Cap',
    desc: 'New corps capitalize 10×par when 60% of IPO is sold',
    tier: 'family_1856', effects: ['cap_mode_1856'] },
  // ── Tier D: 1856 family — float threshold (display-only) ─────────────────
  { key: 'facing_2',  label: '20% to Start', desc: 'Unstarted corp needs 20% sold to start', tier: 'family_1856', effects: ['display_only'] },
  { key: 'facing_3',  label: '30% to Start', desc: 'Unstarted corp needs 30% sold to start', tier: 'family_1856', effects: ['display_only'] },
  { key: 'facing_4',  label: '40% to Start', desc: 'Unstarted corp needs 40% sold to start', tier: 'family_1856', effects: ['display_only'] },
  { key: 'facing_5',  label: '50% to Start', desc: 'Unstarted corp needs 50% sold to start', tier: 'family_1856', effects: ['display_only'] },
  { key: 'facing_6',  label: '60% to Start', desc: 'Unstarted corp needs 60% sold to start', tier: 'family_1856', effects: ['display_only'] },
  { key: 'upgradeable_towns',
    label: 'Towns Can Be Upgraded',
    desc: 'Single town tiles can upgrade to plain track or yellow city',
    tier: 'family_1856', effects: [] },
  { key: 'no_loans',
    label: 'No Loans',
    desc: 'Outstanding loans must be repaid; no new loans may be taken',
    tier: 'family_1856', effects: [] },
  // ── Tier E: 1822 family ───────────────────────────────────────────────────
  // Require 1822 step suite. g_1822/step/buy_sell_par_shares.rb:76,
  // g_1822/step/minor_acquisition.rb:74, g_1822/game.rb:570,883
  { key: 'can_convert_concessions',
    label: 'Convert Concessions',
    desc: 'A concession can be exchanged for a major corp presidency during SR',
    tier: 'family_1822', effects: ['minor_acquisition_step'] },
  { key: 'can_acquire_minor_bidbox',
    label: 'Acquire Minor from Bidbox',
    desc: 'During OR, a major can acquire a minor from the bid box for £200',
    tier: 'family_1822', effects: ['minor_acquisition_step'] },
  { key: 'can_par',
    label: 'Majors 50% Float',
    desc: 'Major corporations require 50% of IPO sold to float',
    tier: 'family_1822', effects: ['minor_acquisition_step'] },
  { key: 'full_capitalisation',
    label: 'Full Capitalisation',
    desc: 'Major companies receive full capitalisation when floated (1822 British spelling)',
    tier: 'family_1822', effects: ['minor_acquisition_step'] },
  { key: 'minors_green_upgrade',
    label: 'Minors Can Upgrade to Green',
    desc: 'Minor companies can lay green tiles this phase',
    tier: 'family_1822', effects: ['minor_acquisition_step'] },
  { key: 'minor_float_phase1',
    label: 'Minors Receive £100',
    desc: 'Minors receive 100 capital with 50 stock value (display only)',
    tier: 'family_1822', effects: ['display_only'] },
  { key: 'minor_float_phase2',
    label: 'Minors Receive 2× Stock Value',
    desc: 'Minors receive 2× stock value as capital (display only)',
    tier: 'family_1822', effects: ['display_only'] },
  { key: 'minor_float_phase3on',
    label: 'Minors Receive Winning Bid',
    desc: 'Minors receive entire winning bid as capital (display only)',
    tier: 'family_1822', effects: ['display_only'] },
  { key: 'l_upgrade',
    label: '£70 L-Train Upgrade',
    desc: 'Cost to upgrade L-train to 2-train reduced from £80 to £70',
    tier: 'family_1822', effects: [] },
  // ── Tier F: Corporation lifecycle (game-specific) ─────────────────────────
  { key: 'national_operates',
    label: 'National Railway Operates',
    desc: 'After minors and majors operate, the national runs trains and withholds',
    tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'closable_corporations',
    label: 'Closable Corporations',
    desc: 'Unparred corps removed if no home token space available',
    tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'corporate_shares_open',
    label: 'Corporate Shares Open',
    desc: 'All corporate shares available for any player to purchase',
    tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'all_corps_available',
    label: 'All Corporations Available',
    desc: 'All railroad companies are now available to start',
    tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'full_capitalization',
    label: 'Full Capitalization',
    desc: 'Corporations float at 60% and receive full capitalization (1868WY American spelling)',
    tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'normal_formation',
    label: 'Full Capitalization (18EU)',
    desc: 'Corps may form without exchanging a minor; 5 remaining shares go to bank pool',
    tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'can_convert_corporation',
    label: 'Convert Corporation',
    desc: 'Corporations can convert from 5 shares to 10 shares',
    tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'can_convert_major',
    label: 'Convert Major National',
    desc: 'President of PRU/K2S can form Germany or Italy Major National',
    tier: 'game_specific', effects: ['custom_ruby'] },
  // ── Tier G: Stock market modifiers ───────────────────────────────────────
  { key: 'blue_zone',
    label: 'Blue Zone Active',
    desc: 'Stock market price movement to/from blue zone cells is permitted',
    tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'no_new_shorts',
    label: 'No New Shorts',
    desc: 'Short selling is not permitted; existing shorts remain',
    tier: 'game_specific', effects: ['custom_ruby'] },
  // ── Tier H: 1862 train kind limits ───────────────────────────────────────
  { key: 'three_per',   label: '3 Per Kind',      desc: 'Limit of 3 trains of each kind (Freight/Local/Express)', tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'two_per',     label: '2 Per Kind',       desc: 'Limit of 2 trains of each kind', tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'three_total', label: '3 Total',           desc: 'Limit of 3 trains total across all kinds', tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'first_rev',   label: 'First Offboard',   desc: 'First offboard/port value used for revenue', tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'middle_rev',  label: 'Middle Offboard',  desc: 'Middle offboard/port value used for revenue', tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'last_rev',    label: 'Last Offboard',    desc: 'Last offboard/port value used for revenue', tier: 'game_specific', effects: ['custom_ruby'] },
  // ── Minor train limits (18EU) ─────────────────────────────────────────────
  { key: 'minor_limit_one',
    label: 'Minor Train Limit: 1',
    desc: 'Minor companies are limited to owning 1 train',
    tier: 'game_specific', effects: [] },
  { key: 'minor_limit_two',
    label: 'Minor Train Limit: 2',
    desc: 'Minor companies are limited to owning 2 trains',
    tier: 'game_specific', effects: [] },
  // ── 18ESP ────────────────────────────────────────────────────────────────
  { key: 'mountain_pass',
    label: 'Mountain Pass',
    desc: 'Can build mountain passes',
    tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'higher_par_prices',
    label: 'Higher Par Prices',
    desc: 'Northern corporations can now par at 95 and 100',
    tier: 'game_specific', effects: ['custom_ruby'] },
  // ── 1824 ─────────────────────────────────────────────────────────────────
  { key: 'may_exchange_mountain_railways',
    label: 'Exchange Mountain Railways',
    desc: 'Mountain railway shares can be exchanged for major corp shares',
    tier: 'game_specific', effects: ['custom_ruby'] },
  { key: 'may_exchange_coal_railways',
    label: 'Exchange Coal Railways',
    desc: 'Coal railway shares can be exchanged for major corp shares',
    tier: 'game_specific', effects: ['custom_ruby'] },
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
  { id: 'home_token_timing',   name: 'Home token timing vs coordinates', desc: 'Minors with no coordinates require HOME_TOKEN_TIMING :par, :float, or :never — not :operate', owner: 'Evan', validate: validateHomeTokenTiming },
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
    // ── Game Flow ──
    initialRound:      'waterfall_auction',
    stockRoundsPerSet: 1,
    mergerRound:       false,

    // ── Bank & Players (base.rb defaults) ──
    minPlayers:   2,
    maxPlayers:   6,
    bankCash:     12000,
    currency:     '$%s',
    startingCash: {},
    certLimit:    {},

    // ── Corporation Rules ──
    capitalization:          'full',      // :full :incremental :none :escrow
    homeTokenTiming:         'operate',   // :par :float :operate :operating_round
    marketShareLimit:        50,
    bankruptcyAllowed:       true,
    bankruptcyEndsGameAfter: 'one',       // :one :all_but_one
    trackRestriction:        'semi_restrictive', // :permissive :semi_restrictive :restrictive

    // ── Stock Round Rules ──
    sellBuyOrder:     'sell_buy',         // :sell_buy :buy_sell :sell_buy_sell :sell_buy_or_buy_sell
    sellMovement:     'down_share',       // :down_share :down_block :left_block :left_block_pres :none
    poolShareDrop:    'none',             // :down_block :none
    mustSellInBlocks: false,
    sellAfter:        'first',            // :first :operate :any_time :p_any_time :p_any_operate :full_or_turn

    // ── OR Rules ──
    allowRemovingTowns:  false,
    mustBuyTrain:        'route',
    ebuyFromOthers:      'value',  // :value :never :always
    ebuyDepotCheapest:   true,     // EBUY_DEPOT_TRAIN_MUST_BE_CHEAPEST
    mustIssueBeforeEbuy: false,    // MUST_EMERGENCY_ISSUE_BEFORE_EBUY
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

    // ── Game End ──
    gameEndCheck: {
      bank:         { enabled: true,  timing: 'full_or' },
      bankrupt:     { enabled: true,  timing: 'immediate' },
      stock_market: { enabled: false, timing: 'current_or' },
      all_closed:   { enabled: false, timing: 'immediate' },
      final_train:  { enabled: false, timing: 'one_more_full_or_set' },
      final_round:  { enabled: false, timing: 'one_more_full_or_set' },
      final_or_set: { enabled: false, timing: 'one_more_full_or_set' },
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
function validateHomeTokenTiming() {
  const errors = [];
  const m = (state && state.mechanics) || {};
  const timing = m.homeTokenTiming || 'operate';
  // Only warn when the constant is still at its engine default (:operate).
  // Any explicit non-default choice (:par, :float, :operating_round, :never)
  // means the designer has consciously changed the timing — don't second-guess.
  const unsafeTiming = timing === 'operate';
  if (!unsafeTiming) return errors;
  const uncoordinated = (state.minors || []).filter(mn => !mn.coordinates || !String(mn.coordinates).trim());
  uncoordinated.forEach(mn => {
    errors.push({
      net: 'home_token_timing',
      message: `Minor "${mn.abbr || mn.name || '?'}" has no coordinates — HOME_TOKEN_TIMING is still at its default (:operate), which will crash on startup. Set it to :par, :float, or :never, or add a home coordinate.`,
    });
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
  const minors   = state.minors   || [];
  const privates = state.privates || [];
  const corps    = (state.companies || []).filter(c => !c.isMinor);

  const orCounts = phases.map(p => p.operating_rounds || p.operatingRounds || 1);
  const orStr = orCounts.length
    ? [...new Set(orCounts)].join('/') + ' OR' + (Math.max(...orCounts) > 1 ? 's' : '')
    : null;

  // Bank cash: may be a flat number or per-player-count hash
  const bankDisplay = m.bankCash
    ? (typeof m.bankCash === 'object'
        ? Object.entries(m.bankCash).map(([p,v]) => p+'p:$'+v).join(' ')
        : '$' + m.bankCash)
    : 'not set';

  return [
    // ── GAME FLOW ──────────────────────────────────────────────────────────
    {
      id: 'game_flow', label: 'Game Flow',
      items: [
        { id: 'initial_round', label: 'Initial Round',       value: formatInitialRound(m.initialRound), status: m.initialRound ? 'green' : 'red' },
        { id: 'stock_rounds',  label: 'Stock Rounds per set', value: String(m.stockRoundsPerSet || 1),   status: 'green' },
        { id: 'or_sequence',   label: 'OR Sequence',          value: orStr || 'from phases',             status: phases.length ? 'green' : 'amber' },
      ],
    },

    // ── BANK & PLAYERS ─────────────────────────────────────────────────────
    {
      id: 'bank_players', label: 'Bank & Players',
      items: [
        { id: 'bank_range',    label: 'Player Count',       value: (m.minPlayers || 2) + '–' + (m.maxPlayers || 6) + ' players', status: 'green' },
        { id: 'bank_cash',     label: 'Bank Cash',          value: bankDisplay,                   status: m.bankCash ? 'green' : 'red' },
        { id: 'bank_currency', label: 'Currency',           value: m.currency || '$%s',           status: 'green' },
        { id: 'bank_start',    label: 'Starting Cash',      value: _summariseCashTable(m.startingCash), status: _cashTableFilled(m.startingCash) ? 'green' : 'red' },
        { id: 'bank_cert',     label: 'Certificate Limit',  value: _summariseCashTable(m.certLimit),    status: _cashTableFilled(m.certLimit)    ? 'green' : 'red' },
      ],
    },

    // ── TRAINS ─────────────────────────────────────────────────────────────
    {
      id: 'trains', label: 'Trains',
      empty: trains.length === 0 ? { label: 'No trains defined — use Trains & Phases screen', status: 'red' } : null,
      items: trains.filter(t => !t._isSpecial).map(t => {
        const ok = t.name && t.cost !== undefined && t.distance !== undefined;
        const dynTag = t.dynamic ? ' · dynamic' : '';
        return { id: 'train_' + t.name, label: (t.name || '?') + '-train', value: (t.cost !== undefined ? '$' + t.cost : '?') + dynTag, status: ok ? 'green' : (t.name ? 'amber' : 'red') };
      }),
    },

    // ── SPECIAL TRAINS (only if present) ───────────────────────────────────
    ...(trains.some(t => t._isSpecial) ? [{
      id: 'special_trains', label: 'Special Trains',
      items: trains.filter(t => t._isSpecial).map(t => {
        const costPart = t.cost !== undefined ? '$' + t.cost : '';
        let note;
        if (t.privateOnly) {
          note = 'private only — not from depot';
        } else if (t.grantedBy && t.grantedBy.length) {
          const granters = t.grantedBy.map(g => g.name || g.sym).join(', ');
          note = 'depot-buyable · linked to ' + granters;
        }
        return {
          id: 'strain_' + t.name, label: t.name,
          value: costPart + (note ? ' · ' + note : ''),
          status: (t.name && t.cost !== undefined) ? 'green' : 'amber', readonly: true,
        };
      }),
    }] : []),

    // ── PHASES ─────────────────────────────────────────────────────────────
    {
      id: 'phases', label: 'Phases',
      empty: phases.length === 0 ? { label: 'No phases defined — use Trains & Phases screen', status: 'red' } : null,
      items: phases.map(p => {
        const trigPart = p.on ? 'on ' + p.on : '';
        // Resolve status[] strings to short labels via KNOWN_STATUS.
        const statusParts = (p.status || []).map(s => {
          const ks = KNOWN_STATUS.find(k => k.key === s);
          return ks ? ks.label : s;   // fall back to raw key if unknown
        });
        const valueParts = [trigPart, ...statusParts].filter(Boolean);
        return {
          id: 'phase_' + p.name, label: 'Phase ' + p.name,
          value: valueParts.join(' · '),
          status: (p.name && p.on) ? 'green' : 'amber', readonly: true,
        };
      }),
    },

    // ── CORPORATIONS ───────────────────────────────────────────────────────
    // Shows game-level corp rules (FLOAT_PERCENT, HOME_TOKEN_TIMING, etc.)
    // Per-corp data (sym, name, tokens, coordinates) lives in the Companies panel.
    {
      id: 'corporations', label: 'Corporations',
      items: [
        { id: 'corp_capitalization', label: 'Capitalization',     value: m.capitalization  || 'full',      status: 'green' },
        { id: 'corp_home_token',  label: 'Home Token Timing',   value: m.homeTokenTiming || 'operate',   status: 'green' },
        { id: 'corp_mkt_limit',   label: 'Market Share Limit',  value: (m.marketShareLimit ?? 50) + '%', status: 'green' },
        { id: 'corp_bankruptcy',  label: 'Bankruptcy',          value: m.bankruptcyAllowed ? 'allowed' : 'disabled', status: 'green' },
        { id: 'corp_track',       label: 'Track Restriction',   value: m.trackRestriction || 'semi_restrictive', status: 'green' },
        ...( corps.length === 0
          ? [{ id: 'corp_roster_empty', label: 'No corporations yet — use Companies screen', value: '', status: 'red' }]
          : [{ id: 'corp_roster', label: corps.length + ' corporations defined', value: '', status: 'green', readonly: true }]
        ),
      ],
    },

    // ── MINOR COMPANIES (only if present) ──────────────────────────────────
    ...(minors.length > 0 ? [{
      id: 'minors', label: 'Minor Companies',
      items: minors.map(m => ({
        id: 'minor_' + m.abbr, label: m.abbr || '?', value: m.name || '',
        status: (m.abbr && m.name) ? 'green' : 'amber', readonly: true,
      })),
    }] : []),

    // ── PRIVATE COMPANIES ──────────────────────────────────────────────────
    // Per-company data (abilities, revenue, desc) lives in the Companies panel.
    // Clicking any private shows the COMPANIES array field reference.
    {
      id: 'private_companies', label: 'Private Companies',
      optional: true,
      empty: privates.length === 0 ? { label: 'None defined — optional', status: 'amber' } : null,
      items: privates.map(p => {
        // Determine if this private grants a train.
        // Path 1: user-built grants_train ability on the private itself.
        const grantAbility = (p.abilities || []).find(a => a.type === 'grants_train');
        // Path 2: import-time linkage — tr.grantedBy contains {sym, name} entries.
        const linkedTrain = !grantAbility
          ? trains.find(tr => tr.grantedBy && tr.grantedBy.some(g => g.sym === p.sym || g.sym === p.abbr))
          : null;

        let grantNote = '';
        if (grantAbility) {
          // trainKindLabel returns e.g. 'L', 'P', '2P' — append '-train' for readability.
          const kindStr = (typeof trainKindLabel === 'function')
            ? trainKindLabel(grantAbility.trainKind, grantAbility.distance) + '-train'
            : (grantAbility.trainKind || '?') + '-train';
          grantNote = ' · grants ' + kindStr;
        } else if (linkedTrain) {
          grantNote = ' · grants ' + linkedTrain.name + '-train';
        }

        return {
          id: 'priv_' + (p.abbr || p.name),
          label: p.abbr
            ? (p.name && p.name !== p.abbr ? p.abbr + ' — ' + p.name : p.abbr)
            : (p.name || '?'),
          value: (p.value !== undefined ? '$' + p.value : '') + grantNote,
          status: (p.abbr && p.value !== undefined) ? 'green' : 'amber',
          readonly: true,
        };
      }),
    },

    // ── STOCK ROUND RULES ─────────────────────────────────────────────────
    {
      id: 'sr_rules', label: 'Stock Round Rules',
      items: [
        { id: 'sr_sell_buy',    label: 'Sell/Buy Order',     value: m.sellBuyOrder || 'sell_buy',  status: 'green' },
        { id: 'sr_sell_move',   label: 'Sell Movement',      value: m.sellMovement || 'down_share',status: 'green' },
        { id: 'sr_pool_drop',   label: 'Pool Share Drop',    value: m.poolShareDrop || 'none',     status: 'green' },
        { id: 'sr_sell_after',  label: 'Sell After',         value: m.sellAfter || 'first',        status: 'green' },
        { id: 'sr_sell_blocks', label: 'Sell in Blocks',     value: m.mustSellInBlocks ? 'yes' : 'no', status: 'green' },
      ],
    },

    // ── OPERATING ROUND RULES ──────────────────────────────────────────────
    {
      id: 'or_rules', label: 'Operating Round Rules',
      items: [
        { id: 'or_tile_lays',   label: 'Tile Lays',          value: describeTileLaySlots((m.tileLays || {}).default || [DEFAULT_TILE_LAY_SLOT]), status: 'green' },
        { id: 'or_train_rules', label: 'Train Requirements', value: m.mustBuyTrain || 'route',    status: 'green' },
        { id: 'or_ebuy',        label: 'Emergency Buy',      value: _describeEbuy(m),             status: 'green' },
        { id: 'or_special',     label: 'Special Mechanics',  value: Object.values(m.orSteps || {}).filter(Boolean).length + ' active', status: 'green' },
      ],
    },

    // ── EVENTS ─────────────────────────────────────────────────────────────
    {
      id: 'events', label: 'Events',
      optional: true,
      empty: (m.events || []).length === 0 ? { label: 'No event triggers defined', status: 'amber' } : null,
      items: (m.events || []).map((ev, i) => ({
        id: 'event_' + i, label: ev.triggerOn + '-train purchase',
        value: (KNOWN_EVENTS.find(e => e.type === ev.eventType)?.desc || ev.eventType),
        status: 'green',
      })),
    },

    // ── GAME END CONDITIONS ────────────────────────────────────────────────
    {
      id: 'game_end', label: 'Game End Conditions',
      items: [
        { id: 'game_end_config', label: 'End triggers', value: _describeGameEnd(m.gameEndCheck), status: _gameEndStatus(m.gameEndCheck) },
      ],
    },
  ];
}

function _summariseCashTable(tbl) {
  if (!tbl) return 'not set';
  const entries = Object.entries(tbl).filter(([,v]) => v > 0);
  if (!entries.length) return 'not set';
  return entries.map(([p, v]) => p + 'p:$' + v).join(' ');
}
function _cashTableFilled(tbl) {
  return tbl && Object.values(tbl).some(v => v > 0);
}
function _describeEbuy(m) {
  return { value: 'at face value', never: 'depot only', always: 'any source' }[m.ebuyFromOthers || 'value'] || m.ebuyFromOthers;
}
const _GEC_LABELS = {
  bank:            'Bank empties',
  bankrupt:        'Player bankrupt',
  stock_market:    'Stock market end cell',
  final_train:     'Final train bought',
  final_phase:     'Final phase reached',
  custom:          'Custom condition',
  all_train:       'All trains bought',
  operating_round: 'Operating round limit',
};
function _describeGameEnd(gec) {
  if (!gec) return 'not set';
  const active = Object.entries(gec).filter(([, v]) => v.enabled)
    .map(([k]) => _GEC_LABELS[k] || k);
  return active.length ? active.join(', ') : 'none';
}
function _gameEndStatus(gec) {
  if (!gec) return 'red';
  return Object.values(gec).some(v => v.enabled) ? 'green' : 'red';
}
function _playerRange() {
  const m = (typeof state !== 'undefined' && state.mechanics) || {};
  const min = m.minPlayers || 2;
  const max = m.maxPlayers || 6;
  const out = [];
  for (let p = min; p <= max; p++) out.push(p);
  return out;
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
  // Game end check inputs (geckey = "trigger.field")
  el.querySelectorAll('[data-geckey]').forEach(input => {
    input.addEventListener('change', e => {
      const [trigger, field] = e.target.dataset.geckey.split('.');
      const gec = state.mechanics.gameEndCheck || (state.mechanics.gameEndCheck = {});
      if (!gec[trigger]) gec[trigger] = { enabled: false, timing: 'full_or' };
      if (field === 'enabled') gec[trigger].enabled = e.target.checked;
      else gec[trigger].timing = e.target.value;
      if (typeof autosave === 'function') autosave();
      renderMechanicsLeft();
      renderMechanicsRight();
    });
  });
  // Dynamic train toggle — writes to state.trains
  el.querySelectorAll('[data-dynamictrain]').forEach(input => {
    input.addEventListener('change', e => {
      const name = e.target.dataset.dynamictrain;
      const train = (state.trains || []).find(t => t.name === name && !t._isSpecial);
      if (!train) return;
      train.dynamic = e.target.checked;
      if (!train.dynamic) { delete train.countByPlayers; }
      if (typeof autosave === 'function') autosave();
      renderMechanicsLeft();
      renderMechanicsRight();
    });
  });
  // countByPlayers cell inputs — writes to state.trains
  el.querySelectorAll('[data-cpbtrain]').forEach(input => {
    input.addEventListener('change', e => {
      const name = e.target.dataset.cpbtrain;
      const p    = Number(e.target.dataset.cpbplayer);
      const train = (state.trains || []).find(t => t.name === name && !t._isSpecial);
      if (!train) return;
      train.countByPlayers = train.countByPlayers || {};
      train.countByPlayers[p] = Number(e.target.value);
      if (typeof autosave === 'function') autosave();
    });
  });
  // Bank cash-table inputs (starting cash + cert limit per player count)
  el.querySelectorAll('[data-cashkey]').forEach(input => {
    input.addEventListener('change', e => {
      const [section, pStr] = e.target.dataset.cashkey.split(':');
      const p = Number(pStr);
      const tbl = section === 'starting' ? 'startingCash' : 'certLimit';
      state.mechanics[tbl] = state.mechanics[tbl] || {};
      state.mechanics[tbl][p] = Number(e.target.value);
      if (typeof autosave === 'function') autosave();
      renderMechanicsLeft();
    });
  });
  // Event add/remove buttons
  const addEvtBtn = el.querySelector('#mechAddEventBtn');
  if (addEvtBtn) addEvtBtn.addEventListener('click', onAddEvent);
  el.querySelectorAll('[data-remove-event]').forEach(btn => {
    btn.addEventListener('click', () => onRemoveEvent(Number(btn.dataset.removeEvent)));
  });
  // Player count chip steppers (minPlayers / maxPlayers)
  el.querySelectorAll('[data-stepper]').forEach(btn => {
    btn.addEventListener('click', e => {
      const key = e.currentTarget.dataset.stepper;
      const dir = Number(e.currentTarget.dataset.dir);
      const cur = state.mechanics[key] || (key === 'minPlayers' ? 2 : 6);
      const lo  = key === 'minPlayers' ? 1 : (state.mechanics.minPlayers || 1);
      const hi  = key === 'maxPlayers' ? 12 : (state.mechanics.maxPlayers || 12);
      state.mechanics[key] = Math.max(lo, Math.min(hi, cur + dir));
      if (typeof autosave === 'function') autosave();
      renderMechanicsLeft();
      renderMechanicsRight();
    });
  });
}

function renderEditorFor(itemId) {
  const m = state.mechanics || {};
  const back = `<button class="mech-editor-back" id="mechEditorBack">← Overview</button>`;

  // ── Game Flow ──
  if (['initial_round','stock_rounds','or_sequence'].includes(itemId))
    return wrap(back, 'Game Flow', renderRoundStructure(m));

  // ── Bank & Players ──
  if (itemId.startsWith('bank_'))
    return wrap(back, 'Bank & Players', renderBankPlayers(m));

  // ── Corporation game-level rules ──
  if (['corp_home_token','corp_mkt_limit','corp_bankruptcy','corp_track'].includes(itemId))
    return wrap(back, 'Corporation Rules', renderCorpRules(m));

  // Corp roster line — show info about CORPORATIONS array
  if (itemId === 'corp_roster' || itemId === 'corp_roster_empty')
    return wrap(back, 'Corporations', renderInfoPanel('corporations'));

  // ── Private Companies — info panel ──
  if (itemId.startsWith('priv_') || itemId === 'private_companies_empty')
    return wrap(back, 'Private Companies', renderInfoPanel('private_companies'));

  // ── Minor roster — info panel ──
  if (itemId.startsWith('minor_'))
    return wrap(back, 'Minor Companies', renderInfoPanel('minors'));

  // ── Stock Round Rules ──
  if (itemId.startsWith('sr_'))
    return wrap(back, 'Stock Round Rules', renderStockRoundRules(m));

  // ── OR Rules ──
  if (itemId === 'or_tile_lays')
    return wrap(back, 'Tile Lays', renderTileLays(m));
  if (itemId === 'or_train_rules')
    return wrap(back, 'Train Requirements', renderTrainRules(m));
  if (itemId === 'or_ebuy')
    return wrap(back, 'Emergency Buy', renderEmergencyBuy(m));
  if (itemId === 'or_special')
    return wrap(back, 'Special Mechanics', renderSpecialMechanics(m));

  // ── Events ──
  if (itemId === 'events' || itemId.startsWith('event_'))
    return wrap(back, 'Event Triggers', renderEventsSection(m));

  // ── Trains: editable for dynamic bank; special trains read-only ──
  if (itemId.startsWith('train_')) {
    const t = (state.trains || []).find(t => t.name === itemId.slice(6) && !t._isSpecial);
    return wrap(back, null, renderTrainEditor(t));
  }
  if (itemId.startsWith('strain_')) {
    const t = (state.trains || []).find(t => t.name === itemId.slice(7) && t._isSpecial);
    return wrap(back, null, renderTrainReadOnly(t));
  }
  if (itemId.startsWith('phase_')) {
    const p = (state.phases || []).find(p => p.name === itemId.slice(6));
    return wrap(back, null, renderPhaseReadOnly(p));
  }

  // ── Game End ──
  if (itemId === 'game_end_config')
    return wrap(back, 'Game End Conditions', renderGameEndEditor(m));

  // ── Empty placeholders ──
  if (itemId.endsWith('_empty'))
    return wrap(back, null, `<p class="mech-hint">Import a game file or add data in the relevant panel to populate this section.</p>`);

  return wrap(back, null, `<p class="mech-hint">No editor for this item yet.</p>`);
}

function wrap(back, title, body) {
  const h = title ? `<h4 style="margin:0 0 14px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#666;border-bottom:1px solid #2a2a2a;padding-bottom:6px;">${title}</h4>` : '';
  return `<div class="mech-editor-wrap">${back}${h}${body}</div>`;
}

// ---------------------------------------------------------------------------
// Info panels — shown when clicking a category that has no direct editor
// ---------------------------------------------------------------------------
const SECTION_INFO = {
  corporations: {
    title: 'CORPORATIONS array — per-corporation fields',
    note: 'Edit individual corporations in the Companies panel. Game-level corp rules (float %, home token timing, etc.) are above.',
    fields: [
      { key: 'sym',         type: 'String',  desc: 'Unique abbreviation used throughout the engine (e.g. "PRR")' },
      { key: 'name',        type: 'String',  desc: 'Full display name' },
      { key: 'logo',        type: 'String',  desc: 'Asset path for the corporation logo image' },
      { key: 'tokens',      type: 'Array',   desc: 'Token costs array — first token is always 0 (home token); subsequent entries are city token placement costs' },
      { key: 'coordinates', type: 'String',  desc: 'Home hex coordinate (e.g. "H12") — where the home token is placed' },
      { key: 'destination_coordinates', type: 'String', desc: '1822-style destination hex for destination token mechanic' },
      { key: 'color',       type: 'Symbol',  desc: 'Token/charter colour — must match a colour defined in the colour palette' },
      { key: 'text_color',  type: 'String',  desc: 'Text colour on the charter (default: black)' },
      { key: 'float_percent', type: 'Integer', desc: 'Float threshold for this corporation (engine default: 60). There is no game-level FLOAT_PERCENT constant — this is always per-corporation.' },
      { key: 'shares',      type: 'Array',   desc: 'Custom share split — defaults to [20,10,10,10,10,10,10,10,10,10] (president + 9)' },
      { key: 'max_ownership_percent', type: 'Integer', desc: 'Maximum % a single player may own — default 60' },
      { key: 'always_market_price', type: 'Boolean', desc: 'If true, shares always sell at market price (no par)' },
      { key: 'abilities',   type: 'Array',   desc: 'Permanent corp-level abilities (e.g. extra tile lay, route bonus)' },
    ],
  },
  private_companies: {
    title: 'COMPANIES array — per-private fields',
    note: 'Edit individual private companies in the Companies panel.',
    fields: [
      { key: 'sym',        type: 'String',  desc: 'Unique abbreviation (e.g. "SV")' },
      { key: 'name',       type: 'String',  desc: 'Full display name' },
      { key: 'value',      type: 'Integer', desc: 'Face/purchase price — used as auction starting price' },
      { key: 'revenue',    type: 'Integer / Array', desc: 'Income paid per OR. Array = phase-variable revenues indexed by phase number' },
      { key: 'desc',       type: 'String',  desc: 'Rules text shown on the company card' },
      { key: 'abilities',  type: 'Array',   desc: 'Ability objects — tile lay, special token, route bonus, exchange, etc.' },
      { key: 'min_price',  type: 'Integer', desc: 'Minimum bid in the auction (often 1 or half value)' },
      { key: 'max_price',  type: 'Integer', desc: 'Maximum bid — omit for no cap' },
      { key: 'color',      type: 'String',  desc: 'Card background colour (nil = default private card style)' },
      { key: 'owner_type', type: 'Symbol',  desc: ':player (default) or :corporation — who can hold this private' },
    ],
  },
  minors: {
    title: 'MINORS array — per-minor fields',
    note: 'Minor companies in 1822-family games. Edit individual minors in the Companies panel.',
    fields: [
      { key: 'sym',         type: 'String', desc: 'Unique abbreviation (e.g. "M1")' },
      { key: 'name',        type: 'String', desc: 'Display name' },
      { key: 'logo',        type: 'String', desc: 'Logo asset path' },
      { key: 'tokens',      type: 'Array',  desc: 'Token costs — minors typically have one token [0]' },
      { key: 'coordinates', type: 'String', desc: 'Home hex coordinate' },
      { key: 'color',       type: 'Symbol', desc: 'Charter colour' },
      { key: 'abilities',   type: 'Array',  desc: 'Minor-level abilities' },
    ],
  },
  game_end: {
    title: 'GAME_END_CHECK — end condition triggers',
    note: 'A hash mapping trigger keys to timing values. Multiple conditions are OR\'d — game ends when the first fires.',
    fields: [
      { key: 'bank',      type: ':current_round / :full_or / :immediate', desc: 'Game ends when the bank runs out. Most common trigger.' },
      { key: 'bankrupt',  type: ':immediate',                             desc: 'Game ends immediately when a player goes bankrupt' },
      { key: 'stock_market', type: ':current_or / :full_or',             desc: 'Game ends when a token reaches the end of the market' },
      { key: 'final_round',  type: ':one_more_full_or_set',              desc: 'Explicit final-round trigger set by a custom step' },
      { key: 'final_or_set', type: ':one_more_full_or_set',              desc: 'Alternative final-OR-set countdown' },
    ],
  },
};

function renderInfoPanel(sectionId) {
  const info = SECTION_INFO[sectionId];
  if (!info) return `<p class="mech-hint">No reference available for this section.</p>`;
  const rows = info.fields.map(f => `
    <tr>
      <td style="color:#a5b4fc;padding:5px 14px 5px 0;font-size:11px;font-family:monospace;vertical-align:top;white-space:nowrap;">${f.key}</td>
      <td style="color:#666;padding:5px 14px 5px 0;font-size:10px;vertical-align:top;white-space:nowrap;">${f.type}</td>
      <td style="color:#999;padding:5px 0;font-size:11px;line-height:1.5;">${f.desc}</td>
    </tr>`).join('');
  return `
    ${info.note ? `<p class="mech-hint" style="margin-bottom:14px;">${info.note}</p>` : ''}
    <table style="border-collapse:collapse;width:100%;">${rows}</table>`;
}

// ---------------------------------------------------------------------------
// New section editors
// ---------------------------------------------------------------------------
function renderBankPlayers(m) {
  const sc      = m.startingCash || {};
  const cl      = m.certLimit    || {};
  const players = _playerRange();
  const scRows  = players.map(p => `
    <div class="mech-row-pair">
      <span class="mech-row-label">${p}p</span>
      <input type="number" min="0" class="mech-num-sm" data-cashkey="starting:${p}" value="${sc[p] || 0}">
    </div>`).join('');
  const clRows  = players.map(p => `
    <div class="mech-row-pair">
      <span class="mech-row-label">${p}p</span>
      <input type="number" min="0" class="mech-num-sm" data-cashkey="cert:${p}" value="${cl[p] || 0}">
    </div>`).join('');
  return `
    <div style="display:flex;gap:20px;align-items:center;margin-bottom:12px;">
      <span class="mech-hint" style="white-space:nowrap;">Min players</span>
      <div class="stepper">
        <button class="axis-handle minus" data-stepper="minPlayers" data-dir="-1">−</button>
        <span style="min-width:22px;text-align:center;color:var(--text-primary);font-size:13px;">${m.minPlayers || 2}</span>
        <button class="axis-handle" data-stepper="minPlayers" data-dir="1">+</button>
      </div>
      <span class="mech-hint" style="white-space:nowrap;">Max players</span>
      <div class="stepper">
        <button class="axis-handle minus" data-stepper="maxPlayers" data-dir="-1">−</button>
        <span style="min-width:22px;text-align:center;color:var(--text-primary);font-size:13px;">${m.maxPlayers || 6}</span>
        <button class="axis-handle" data-stepper="maxPlayers" data-dir="1">+</button>
      </div>
    </div>
    <label style="margin-top:8px;">Bank Cash
      <input type="number" min="0" data-mkey="bankCash" value="${m.bankCash || 12000}">
    </label>
    <label>Currency format <span class="mech-hint-inline">%s = amount (e.g. $%s → $120)</span>
      <input type="text" maxlength="8" data-mkey="currency" value="${m.currency || '$%s'}">
    </label>
    <p class="mech-hint" style="margin-top:10px;">Starting Cash per player count</p>
    <div class="mech-row-group">${scRows}</div>
    <p class="mech-hint" style="margin-top:10px;">Certificate Limit per player count</p>
    <div class="mech-row-group">${clRows}</div>`;
}

function renderCorpRules(m) {
  return `
    <label>Capitalization <span class="mech-hint-inline">CAPITALIZATION — base.rb default: :full</span>
      <select data-mkey="capitalization">
        <option value="full"        ${sel(m.capitalization,'full')}>Full — all IPO cash paid immediately (default)</option>
        <option value="incremental" ${sel(m.capitalization,'incremental')}>Incremental — cash paid as each share is sold</option>
        <option value="escrow"      ${sel(m.capitalization,'escrow')}>Escrow — cash held until destination reached (1856)</option>
        <option value="none"        ${sel(m.capitalization,'none')}>None — no cash paid on float</option>
      </select>
    </label>
    <p class="mech-hint">Per-corporation overrides can be set in the Companies panel.</p>
    <label>Home Token Timing
      <select data-mkey="homeTokenTiming">
        <option value="operate"          ${sel(m.homeTokenTiming,'operate')}>On first operate (default)</option>
        <option value="float"            ${sel(m.homeTokenTiming,'float')}>On float</option>
        <option value="par"              ${sel(m.homeTokenTiming,'par')}>On par (immediate)</option>
        <option value="operating_round"  ${sel(m.homeTokenTiming,'operating_round')}>Start of first OR</option>
        <option value="never"            ${sel(m.homeTokenTiming,'never')}>Never (no home token placed)</option>
      </select>
    <p class="mech-hint">Use <strong>:par</strong> or <strong>:float</strong> when minors choose their home city at placement time (1867-style). Use <strong>:never</strong> for concessions or entities with no home token. Note: blank coordinates with :operate or :operating_round will crash the engine — a home_token_locations override is required in game.rb.</p>
    </label>
    <label>Market Share Limit (%)
      <input type="number" min="0" max="100" data-mkey="marketShareLimit" value="${m.marketShareLimit ?? 50}">
    </label>
    <label>Track Restriction
      <select data-mkey="trackRestriction">
        <option value="semi_restrictive" ${sel(m.trackRestriction,'semi_restrictive')}>Semi-restrictive (default)</option>
        <option value="permissive"       ${sel(m.trackRestriction,'permissive')}>Permissive (1830-style)</option>
        <option value="restrictive"      ${sel(m.trackRestriction,'restrictive')}>Restrictive</option>
      </select>
    </label>
    ${toggle('Bankruptcy Allowed', 'bankruptcyAllowed', m.bankruptcyAllowed ?? true)}
    ${(m.bankruptcyAllowed ?? true)
      ? `<label>Bankruptcy Ends Game After
          <select data-mkey="bankruptcyEndsGameAfter">
            <option value="one"         ${sel(m.bankruptcyEndsGameAfter,'one')}>One bankruptcy (default)</option>
            <option value="all_but_one" ${sel(m.bankruptcyEndsGameAfter,'all_but_one')}>All but one player bankrupt</option>
          </select>
        </label>`
      : `<p class="mech-hint" style="margin:4px 0 0 0;padding:6px 8px;background:rgba(255,200,0,0.08);border-left:3px solid #b8860b;border-radius:3px;font-size:11px;">Bankruptcy disabled — configure how the shortfall resolves in the <strong>Emergency Buy</strong> section (president must help, player loans, share issuance).</p>`
    }`;
}

function renderStockRoundRules(m) {
  return `
    <label>Sell / Buy Order
      <select data-mkey="sellBuyOrder">
        <option value="sell_buy"              ${sel(m.sellBuyOrder,'sell_buy')}>Sell then buy (most games)</option>
        <option value="buy_sell"              ${sel(m.sellBuyOrder,'buy_sell')}>Buy then sell</option>
        <option value="sell_buy_sell"         ${sel(m.sellBuyOrder,'sell_buy_sell')}>Sell, buy, sell (1830)</option>
        <option value="sell_buy_or_buy_sell"  ${sel(m.sellBuyOrder,'sell_buy_or_buy_sell')}>Player chooses order (base default)</option>
      </select>
    </label>
    <label>Sell Movement
      <select data-mkey="sellMovement">
        <option value="down_share"      ${sel(m.sellMovement,'down_share')}>Down one share (default)</option>
        <option value="down_block"      ${sel(m.sellMovement,'down_block')}>Down one block</option>
        <option value="left_block"      ${sel(m.sellMovement,'left_block')}>Left one block</option>
        <option value="left_block_pres" ${sel(m.sellMovement,'left_block_pres')}>Left block (pres share = 2 left)</option>
        <option value="none"            ${sel(m.sellMovement,'none')}>No movement on sale</option>
      </select>
    </label>
    <label>Pool Share Drop
      <select data-mkey="poolShareDrop">
        <option value="none"       ${sel(m.poolShareDrop,'none')}>No drop (default)</option>
        <option value="down_block" ${sel(m.poolShareDrop,'down_block')}>Down one block when pool fills</option>
      </select>
    </label>
    <label>Sell After
      <select data-mkey="sellAfter">
        <option value="first"          ${sel(m.sellAfter,'first')}>After first SR (default)</option>
        <option value="operate"        ${sel(m.sellAfter,'operate')}>After operating once</option>
        <option value="any_time"       ${sel(m.sellAfter,'any_time')}>Any time</option>
        <option value="p_any_time"     ${sel(m.sellAfter,'p_any_time')}>Any time (pres share restricted)</option>
        <option value="p_any_operate"  ${sel(m.sellAfter,'p_any_operate')}>Any time after first operation</option>
        <option value="full_or_turn"   ${sel(m.sellAfter,'full_or_turn')}>After full OR turn</option>
      </select>
    </label>
    ${toggle('Must Sell in Blocks', 'mustSellInBlocks', m.mustSellInBlocks)}
    <label>Top-row sold-out movement <span class="mech-hint-inline">SOLD_OUT_TOP_ROW_MOVEMENT</span>
      <select data-mkey="soldOutTopRowMovement">
        <option value="none"       ${sel(m.soldOutTopRowMovement,'none')}>None — block at top (default)</option>
        <option value="down_right" ${sel(m.soldOutTopRowMovement,'down_right')}>Down-right — wrap to next column (18Neb, 18NY)</option>
      </select>
    </label>`;
}

function renderEmergencyBuy(m) {
  const loansOn = m.ebuyCanTakePlayerLoan && m.ebuyCanTakePlayerLoan !== 'false';
  return `
    <p class="mech-hint" style="margin-bottom:12px;">Emergency buy (ebuy) triggers when a corporation must buy a train it cannot fully afford.</p>
    <label>Buy from others <span class="mech-hint-inline">EBUY_FROM_OTHERS</span>
      <select data-mkey="ebuyFromOthers">
        <option value="value"  ${sel(m.ebuyFromOthers,'value')}>At face value (default)</option>
        <option value="never"  ${sel(m.ebuyFromOthers,'never')}>Never — depot only</option>
        <option value="always" ${sel(m.ebuyFromOthers,'always')}>Always — any source</option>
      </select>
    </label>
    ${toggle('Depot train must be cheapest available', 'ebuyDepotCheapest', m.ebuyDepotCheapest ?? true)}
    <p class="mech-hint" style="margin:2px 0 8px 0;font-size:10px;">EBUY_DEPOT_TRAIN_MUST_BE_CHEAPEST — default true</p>
    ${toggle('Must issue shares before ebuy (if possible)', 'mustIssueBeforeEbuy', m.mustIssueBeforeEbuy ?? false)}
    <p class="mech-hint" style="margin:2px 0 8px 0;font-size:10px;">MUST_EMERGENCY_ISSUE_BEFORE_EBUY — default false</p>
    ${toggle('Company-owned corp: surface ownership chain in emergency buy', 'ebuyOwnerMustHelp', m.ebuyOwnerMustHelp ?? false)}
    <p class="mech-hint" style="margin:2px 0 8px 0;font-size:10px;">EBUY_OWNER_MUST_HELP — default false. Enable when a <em>company</em> (not a player directly) can own corporations — the 1858/1871 pattern. The emergency buy UI will surface the full ownership chain so players can see that the owning company must first sell its shares, and then the company's player-owner must contribute further. Requires an <code>acting_for_entity</code> override in game.rb. Not needed for standard president-contributes behaviour, which always runs via <code>must_buy_train?</code>.</p>
    ${toggle('President can sell shares during ebuy', 'ebuyCanSellShares', m.ebuyCanSellShares ?? true)}
    <p class="mech-hint" style="margin:2px 0 8px 0;font-size:10px;">EBUY_CAN_SELL_SHARES — default true</p>
    ${toggle('Allow presidency swap during ebuy', 'ebuyPresSwap', m.ebuyPresSwap ?? true)}
    <p class="mech-hint" style="margin:2px 0 8px 0;font-size:10px;">EBUY_PRES_SWAP — default true. Another player can take the presidency mid-emergency-buy.</p>
    <label>Player loans <span class="mech-hint-inline">EBUY_CAN_TAKE_PLAYER_LOAN</span>
      <select data-mkey="ebuyCanTakePlayerLoan">
        <option value="false"      ${sel(m.ebuyCanTakePlayerLoan || 'false', 'false')}>Disabled (default)</option>
        <option value="after_sell" ${sel(m.ebuyCanTakePlayerLoan, 'after_sell')}>After selling shares — 1822-style</option>
        <option value="no_sell"    ${sel(m.ebuyCanTakePlayerLoan, 'no_sell')}>Instead of selling shares — 18ESP-style</option>
      </select>
    </label>
    ${loansOn ? `
    <label>Loan interest rate (%) <span class="mech-hint-inline">PLAYER_LOAN_INTEREST_RATE</span>
      <input type="number" min="0" max="200" step="5" data-mkey="playerLoanInterestRate" value="${m.playerLoanInterestRate ?? 50}">
    </label>
    <label>Endgame loan penalty (%) <span class="mech-hint-inline">PLAYER_LOAN_ENDGAME_PENALTY</span>
      <input type="number" min="0" max="200" step="5" data-mkey="playerLoanEndgamePenalty" value="${m.playerLoanEndgamePenalty ?? 0}">
    </label>` : ''}`;
}

function renderGameEndEditor(m) {
  const gec = m.gameEndCheck || {};
  const triggers = [
    { key: 'bank',         label: 'Bank runs out',                       defTiming: 'full_or' },
    { key: 'bankrupt',     label: 'Player goes bankrupt',                defTiming: 'immediate' },
    { key: 'stock_market', label: 'Token reaches end of market',         defTiming: 'current_or' },
    { key: 'all_closed',   label: 'All corps and companies close',       defTiming: 'immediate' },
    { key: 'final_train',  label: 'Final train purchased',               defTiming: 'one_more_full_or_set' },
    { key: 'final_round',  label: 'Final round triggered (custom step)', defTiming: 'one_more_full_or_set' },
    { key: 'final_or_set', label: 'Final OR set countdown',              defTiming: 'one_more_full_or_set' },
  ];
  const timingOpts = [
    { value: 'immediate',            label: 'Immediate' },
    { value: 'current_round',        label: 'End of current round' },
    { value: 'current_or',           label: 'End of next OR' },
    { value: 'full_or',              label: 'End of full OR set' },
    { value: 'one_more_full_or_set', label: '+1 full OR set' },
  ];
  const rows = triggers.map(t => {
    const entry = gec[t.key] || { enabled: false, timing: t.defTiming };
    const opts = timingOpts.map(o =>
      `<option value="${o.value}" ${entry.timing === o.value ? 'selected' : ''}>${o.label}</option>`).join('');
    return `
      <div style="margin-bottom:${entry.enabled ? '12px' : '4px'};">
        ${toggleGec(t.label, `${t.key}.enabled`, entry.enabled)}
        ${entry.enabled ? `<label style="margin-top:4px;font-size:11px;display:block;padding-left:4px;">When to end
          <select data-geckey="${t.key}.timing">${opts}</select>
        </label>` : ''}
      </div>`;
  }).join('');
  return `<p class="mech-hint" style="margin-bottom:12px;">Multiple triggers are OR'd — game ends when the first fires.</p>${rows}`;
}

function renderTrainEditor(train) {
  if (!train) return '<p class="mech-hint">Train not found.</p>';
  const isDynamic = train.dynamic === true;
  const cpb = train.countByPlayers || {};
  const metaKeys = ['name','distance','cost','num','rusts_on','obsolete_on'];
  const metaRows = metaKeys.filter(k => train[k] !== undefined).map(k => `
    <tr>
      <td style="color:#888;padding:3px 16px 3px 0;font-size:11px;">${k}</td>
      <td style="color:#ddd;font-size:12px;">${JSON.stringify(train[k])}</td>
    </tr>`).join('');

  const cells = _playerRange().map(p => `
    <div class="mech-row-pair">
      <span class="mech-row-label">${p}p</span>
      <input type="number" min="0" class="mech-num-sm"
             data-cpbtrain="${train.name}" data-cpbplayer="${p}"
             value="${cpb[p] !== undefined ? cpb[p] : (train.num || 0)}">
    </div>`).join('');

  return `
    <h4 style="margin:0 0 10px;">${train.name || '?'}-train
      <span style="font-weight:400;color:#555;font-size:11px;"> — structure owned by Trains &amp; Phases</span>
    </h4>
    <table style="border-collapse:collapse;margin-bottom:14px;">${metaRows}</table>
    <hr style="border:none;border-top:1px solid #2a2a2a;margin-bottom:14px;">
    ${toggleDynamic('Dynamic bank (count varies by player count)', train.name, isDynamic)}
    ${isDynamic
      ? `<p class="mech-hint" style="margin:8px 0 6px;">Count per player count — fallback num: ${train.num ?? '?'}</p>
         <div class="mech-row-group">${cells}</div>`
      : `<p class="mech-hint" style="margin-top:6px;color:#555;">Fixed — num: ${train.num ?? '?'} copies. Toggle on to set per player count.</p>`
    }
    ${(train.events || []).length
      ? `<p style="color:#aaa;font-size:12px;margin-top:14px;">Events: ${train.events.map(e => `<strong>${e.type}</strong>`).join(', ')}</p>`
      : ''}`;
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
    ${toggle('Merger round (after OR set)', 'mergerRound', m.mergerRound)}`;
}

function renderTileLays(m) {
  const tl = m.tileLays || {};
  return `
    ${toggle('Allow removing town dits', 'allowRemovingTowns', m.allowRemovingTowns)}
    <p class="mech-hint" style="margin-top:12px;">Default (all entity types):</p>
    ${renderSlotEditor(tl.default || [DEFAULT_TILE_LAY_SLOT], 'tileLays.default')}
    <p class="mech-hint" style="margin-top:12px;">Override for major corporations:</p>
    ${renderSlotEditorOrNull(tl.byType && tl.byType.major, 'tileLays.byType.major')}
    <p class="mech-hint" style="margin-top:12px;">Override for minor corporations:</p>
    ${renderSlotEditorOrNull(tl.byType && tl.byType.minor, 'tileLays.byType.minor')}
    <p class="mech-hint" style="margin-top:10px; color:#5a6a5a;">
      Color restrictions (e.g. 1822 minors capped at green) are phase-status flags
      (<code>minors_green_upgrade</code>) + a custom <code>step/tracker.rb</code>
      <code>potential_tiles</code> override — not expressible as a slot field.
    </p>`;
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
      ${toggleSlot("Can't reuse same hex", 'cannot_reuse_same_hex', s.cannot_reuse_same_hex)}
    </div>`).join('');
}

function renderSlotEditorOrNull(slots, keyPrefix) {
  if (!slots) return `<button class="mech-btn-small" data-override-key="${keyPrefix}">+ Add override</button>`;
  return renderSlotEditor(slots, keyPrefix) +
    `<button class="mech-btn-small mech-btn-danger" data-remove-override="${keyPrefix}">✕ Remove override</button>`;
}

function renderTrainRules(m) {
  return `
    <p class="mech-hint" style="margin-bottom:10px;">Capitalization (full / incremental) is set in the Companies panel → Corp Packs.</p>
    <label>Must buy train
      <select data-mkey="mustBuyTrain">
        <option value="route"  ${sel(m.mustBuyTrain,'route')}>If can run a route (default)</option>
        <option value="always" ${sel(m.mustBuyTrain,'always')}>Always (or go bankrupt)</option>
        <option value="never"  ${sel(m.mustBuyTrain,'never')}>Never forced</option>
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
      <span>When first <strong>${ev.triggerOn}</strong>-train bought → <em>${KNOWN_EVENTS.find(e => e.type === ev.eventType)?.desc || ev.eventType}</em></span>
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
  return Object.keys(stepLabels).map(k => toggleOrkey(stepLabels[k], k, steps[k])).join('');
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
// Toggle switch helpers — slide toggle, label left, switch right
// ---------------------------------------------------------------------------
function toggle(label, mkey, checked) {
  return `<div class="mech-toggle-row">
    <span class="mech-toggle-label">${label}</span>
    <label class="mech-toggle">
      <input type="checkbox" data-mkey="${mkey}" ${checked ? 'checked' : ''}>
      <span class="mech-toggle-slider"></span>
    </label>
  </div>`;
}
function toggleOrkey(label, orkey, checked) {
  return `<div class="mech-toggle-row">
    <span class="mech-toggle-label">${label}</span>
    <label class="mech-toggle">
      <input type="checkbox" data-orkey="${orkey}" ${checked ? 'checked' : ''}>
      <span class="mech-toggle-slider"></span>
    </label>
  </div>`;
}
function toggleSlot(label, slotkey, checked) {
  return `<div class="mech-toggle-row">
    <span class="mech-toggle-label">${label}</span>
    <label class="mech-toggle">
      <input type="checkbox" data-slotkey="${slotkey}" ${checked ? 'checked' : ''}>
      <span class="mech-toggle-slider"></span>
    </label>
  </div>`;
}
function toggleDynamic(label, trainName, checked) {
  return `<div class="mech-toggle-row">
    <span class="mech-toggle-label">${label}</span>
    <label class="mech-toggle">
      <input type="checkbox" data-dynamictrain="${trainName}" ${checked ? 'checked' : ''}>
      <span class="mech-toggle-slider"></span>
    </label>
  </div>`;
}
function toggleGec(label, geckey, checked) {
  return `<div class="mech-toggle-row">
    <span class="mech-toggle-label">${label}</span>
    <label class="mech-toggle">
      <input type="checkbox" data-geckey="${geckey}" ${checked ? 'checked' : ''}>
      <span class="mech-toggle-slider"></span>
    </label>
  </div>`;
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
  renderMechanicsRight();
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
// game.rb preview generator
// ---------------------------------------------------------------------------
function slotToRuby(s) {
  const parts = [];
  if (s.lay === true)              parts.push('lay: true');
  else if (s.lay === false)        parts.push('lay: false');
  else if (s.lay)                  parts.push(`lay: :${s.lay}`);
  if (s.upgrade === true)          parts.push('upgrade: true');
  else if (s.upgrade === false)    parts.push('upgrade: false');
  if (s.cost)                      parts.push(`cost: ${s.cost}`);
  if (s.upgrade_cost)              parts.push(`upgrade_cost: ${s.upgrade_cost}`);
  if (s.cannot_reuse_same_hex)     parts.push('cannot_reuse_same_hex: true');
  return `{ ${parts.join(', ')} }`;
}

function generateGameRb() {
  if (typeof state === 'undefined' || !state.mechanics)
    return '# No mechanics state loaded yet.\n# Load or build a game first.';
  const m = state.mechanics;
  const lines = [];

  const sec = name => lines.push(`\n# ── ${name} ${'─'.repeat(Math.max(0, 56 - name.length))}`);
  const def = (name, val) => lines.push(`${name} = ${val}`);

  sec('Bank & Players');
  if (m.bankCash)
    def('BANK_CASH', String(m.bankCash).replace(/\B(?=(\d{3})+(?!\d))/g, '_'));
  if (m.currency && m.currency !== '$%s')
    def('CURRENCY_FORMAT_STR', `'${m.currency}'`);
  if (_cashTableFilled(m.startingCash)) {
    const entries = Object.entries(m.startingCash).filter(([,v]) => v > 0).map(([p,v]) => `${p} => ${v}`).join(', ');
    def('STARTING_CASH', `{ ${entries} }.freeze`);
  }
  if (_cashTableFilled(m.certLimit)) {
    const entries = Object.entries(m.certLimit).filter(([,v]) => v > 0).map(([p,v]) => `${p} => ${v}`).join(', ');
    def('CERT_LIMIT', `{ ${entries} }.freeze`);
  }

  sec('Corporation Rules');
  // CAPITALIZATION — only emit when non-full; per-corp overrides go in entities.rb
  if ((m.capitalization || 'full') !== 'full')
    def('CAPITALIZATION', `:${m.capitalization}`);
  // Note: FLOAT_PERCENT is not a real engine constant. float_percent is always
  // per-corporation in entities.rb (engine default: 60). See export-entities.js.
  if ((m.homeTokenTiming || 'operate') !== 'operate')
    def('HOME_TOKEN_TIMING', `:${m.homeTokenTiming}`);
  if ((m.marketShareLimit ?? 50) !== 50)
    def('MARKET_SHARE_LIMIT', String(m.marketShareLimit ?? 50));
  if ((m.trackRestriction || 'semi_restrictive') !== 'semi_restrictive')
    def('TRACK_RESTRICTION', `:${m.trackRestriction}`);
  if (!(m.bankruptcyAllowed ?? true))
    def('BANKRUPTCY_ALLOWED', 'false');
  if ((m.bankruptcyEndsGameAfter || 'one') !== 'one')
    def('BANKRUPTCY_ENDS_GAME_AFTER', `:${m.bankruptcyEndsGameAfter}`);

  sec('Stock Round Rules');
  // base.rb default is :sell_buy_or_buy_sell
  if ((m.sellBuyOrder || 'sell_buy_or_buy_sell') !== 'sell_buy_or_buy_sell')
    def('SELL_BUY_ORDER', `:${m.sellBuyOrder}`);
  if ((m.sellMovement || 'down_share') !== 'down_share')
    def('SELL_MOVEMENT', `:${m.sellMovement}`);
  if ((m.poolShareDrop || 'none') !== 'none')
    def('POOL_SHARE_DROP', `:${m.poolShareDrop}`);
  if (m.mustSellInBlocks)
    def('MUST_SELL_IN_BLOCKS', 'true');
  if ((m.sellAfter || 'first') !== 'first')
    def('SELL_AFTER', `:${m.sellAfter}`);
  if ((m.soldOutTopRowMovement || 'none') !== 'none')
    def('SOLD_OUT_TOP_ROW_MOVEMENT', `:${m.soldOutTopRowMovement}`);

  sec('Operating Round Rules');
  if ((m.mustBuyTrain || 'route') !== 'route')
    def('MUST_BUY_TRAIN', `:${m.mustBuyTrain}`);
  if (m.allowRemovingTowns)
    def('ALLOW_REMOVING_TOWNS', 'true');
  // Emergency buy
  if ((m.ebuyFromOthers || 'value') !== 'value')
    def('EBUY_FROM_OTHERS', `:${m.ebuyFromOthers}`);
  if (!(m.ebuyDepotCheapest ?? true))
    def('EBUY_DEPOT_TRAIN_MUST_BE_CHEAPEST', 'false');
  if (m.mustIssueBeforeEbuy)
    def('MUST_EMERGENCY_ISSUE_BEFORE_EBUY', 'true');
  if (m.ebuyOwnerMustHelp)
    def('EBUY_OWNER_MUST_HELP', 'true');
  if (!(m.ebuyCanSellShares ?? true))
    def('EBUY_CAN_SELL_SHARES', 'false');
  if (!(m.ebuyPresSwap ?? true))
    def('EBUY_PRES_SWAP', 'false');
  if (m.ebuyCanTakePlayerLoan && m.ebuyCanTakePlayerLoan !== 'false') {
    def('EBUY_CAN_TAKE_PLAYER_LOAN', `:${m.ebuyCanTakePlayerLoan}`);
    if ((m.playerLoanInterestRate ?? 50) !== 50)
      def('PLAYER_LOAN_INTEREST_RATE', String(m.playerLoanInterestRate ?? 50));
    if ((m.playerLoanEndgamePenalty ?? 0) !== 0)
      def('PLAYER_LOAN_ENDGAME_PENALTY', String(m.playerLoanEndgamePenalty ?? 0));
  }
  const defSlots = (m.tileLays && m.tileLays.default) || [DEFAULT_TILE_LAY_SLOT];
  def('TILE_LAYS', `[${defSlots.map(slotToRuby).join(', ')}].freeze`);
  if (m.tileLays && m.tileLays.byType) {
    if (m.tileLays.byType.major) {
      lines.push('');
      def('MAJOR_TILE_LAYS', `[${m.tileLays.byType.major.map(slotToRuby).join(', ')}].freeze`);
    }
    if (m.tileLays.byType.minor) {
      lines.push('');
      def('MINOR_TILE_LAYS', `[${m.tileLays.byType.minor.map(slotToRuby).join(', ')}].freeze`);
    }
  }

  sec('Game Flow');
  lines.push(`# Initial round: ${formatInitialRound(m.initialRound || 'waterfall_auction')} → Companies panel (Auction tab)`);
  if ((m.stockRoundsPerSet || 1) !== 1)
    lines.push(`# ${m.stockRoundsPerSet} stock rounds per set (implement via round order array)`);
  if (m.mergerRound || (m.merger && m.merger.enabled))
    lines.push('# Merger round enabled → G<game>::Round::Merger + custom round order');

  const events = m.events || [];
  if (events.length) {
    sec('Train Events');
    lines.push('# Add to TRAINS entry events: array:');
    events.forEach(ev => lines.push(`#   ${ev.triggerOn}: [{ type: '${ev.eventType}' }]`));
  }

  const activeSteps = Object.entries(m.orSteps || {}).filter(([,v]) => v).map(([k]) => k);
  if (activeSteps.length) {
    sec('Special OR Steps (require custom Ruby)');
    activeSteps.forEach(k => {
      const name = k.replace(/([A-Z])/g, m => `_${m}`).replace(/^_/, '');
      lines.push(`# G<game>::Step::${name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`);
    });
  }

  sec('Game End');
  const gec = m.gameEndCheck || {};
  const gecActive = Object.entries(gec).filter(([, v]) => v.enabled);
  if (gecActive.length) {
    const gecPairs = gecActive.map(([k, v]) => `${k}: :${v.timing}`).join(', ');
    def('GAME_END_CHECK', `{ ${gecPairs} }.freeze`);
  } else {
    lines.push('# GAME_END_CHECK not configured');
  }

  // ── Private company helper methods ──────────────────────────────────────────
  // Abilities that require the company to be referenced directly in custom step
  // code — the base engine's generic ability dispatch isn't sufficient.
  //   :assign_hexes / :assign_corporation  — custom assign step references company
  //   :generic                             — fully custom mechanic
  const HELPER_ABILITY_TYPES = new Set(['assign_hexes', 'assign_corporation', 'generic']);
  const helpPrivates = (state.privates || []).filter(p =>
    (p.abilities || []).some(a => HELPER_ABILITY_TYPES.has(a.type))
  );
  if (helpPrivates.length) {
    sec('Private Company Helpers');
    lines.push('# Paste these inside your game class body.');
    lines.push('# They let custom step code reference companies by name rather than');
    lines.push('# calling company_by_id(\'SYM\') every time.');
    for (const priv of helpPrivates) {
      const mName = _companyHelperName(priv.name, priv.sym);
      lines.push('');
      lines.push(`def ${mName}`);
      lines.push(`  @${mName} ||= company_by_id('${priv.sym}')`);
      lines.push('end');
    }
  }

  return lines.join('\n').replace(/^\n/, '');
}

// Derive a Ruby method name from a private company name + sym.
// Strips trailing company-type words, lowercases, replaces non-alphanumeric with _.
function _companyHelperName(name, sym) {
  let s = (name || '').toLowerCase();
  s = s.replace(/\s+(company|railroad|railway|corp(?:oration)?|co\.?|lines?|inc\.?|limited|ltd\.?)$/i, '');
  s = s.replace(/\s*&\s*/g, '_and_');
  s = s.replace(/[^a-z0-9]+/g, '_');
  s = s.replace(/^_+|_+$/g, '').replace(/_+/g, '_');
  return s || (sym || '').toLowerCase().replace(/[^a-z0-9]/g, '_') || 'company';
}

function showRbPreview() {
  const overlay = document.getElementById('mechRbOverlay');
  const code    = document.getElementById('mechRbCode');
  if (!overlay || !code) return;
  code.textContent = generateGameRb();
  overlay.style.display = 'flex';
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

  // Peek button
  const peekBtn = document.getElementById('mechPeekBtn');
  if (peekBtn) peekBtn.addEventListener('click', showRbPreview);

  // Overlay close
  const overlay = document.getElementById('mechRbOverlay');
  if (overlay) overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.style.display = 'none';
  });
  const closeBtn = document.getElementById('mechRbCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', () => {
    if (overlay) overlay.style.display = 'none';
  });

  // Copy button
  const copyBtn = document.getElementById('mechRbCopyBtn');
  if (copyBtn) copyBtn.addEventListener('click', () => {
    const code = document.getElementById('mechRbCode');
    if (!code) return;
    navigator.clipboard.writeText(code.textContent).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    });
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
    state.mechanics.initialRound     = 'waterfall_auction';
    state.mechanics.orSteps.minorAcquisition = true;
    state.mechanics.orSteps.homeToken = true;
    state.mechanics.merger.enabled   = true;
    state.mechanics.merger.style     = 'minor_to_major';
    state.mechanics.exchangeTokens   = { enabled: true, counts: { LNWR:3, GWR:3, LBSCR:3, SECR:3, CR:3, MR:3, LYR:3, NBR:3, GSWR:3, GNR:3, NER:3, GER:3 } };
  }

  // 1830-specific
  if (name === '1830') {
    state.mechanics.events = [
      { triggerOn: '2', eventType: 'close_companies' },
    ];
  }

  console.log('[mechanics] Loaded test game:', name, '— navigate to Game Mechanics panel');
};
