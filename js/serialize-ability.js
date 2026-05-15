// js/serialize-ability.js
// Single canonical ability serializer driven by tobymao's per-type `setup`
// kwarg allowlist. Replaces the two prior parallel emitters (_rbAbility in
// export-game.js and _eiAbilityLine in export-entities.js) that drifted
// independently and required synchronised type-gating patches.
//
// Source of truth: lib/engine/ability/*.rb in 18xx-master. The tables below
// are extracted verbatim from each subclass's `def setup(...)` signature.
//
// API:
//   _serializeAbility(ab, fmt) → string
//     ab  — ability state object
//     fmt — { quote, strArr, when } formatter triple supplied by the caller
//           (lets export-game.js and export-entities.js share this logic while
//           keeping their existing quoting helpers)
//
// Tables exposed so tests can introspect ownership:
//   ABILITY_BASE_KWARGS  — accepted by every ability (Ability::Base#initialize)
//   ABILITY_SETUP_KWARGS — per-type setup kwargs (one entry per subclass)

'use strict';

// ── Base kwargs (lib/engine/ability/base.rb:16-18 + :when at line 23) ────────
// Accepted by Ability::Base#initialize regardless of subclass. Anything not
// listed here that survives into `**opts` gets forwarded to setup(**opts), and
// per-type allowlists below decide whether it's accepted there.
const ABILITY_BASE_KWARGS = new Set([
  'type', 'description', 'desc_detail', 'owner_type', 'count', 'remove',
  'use_across_ors', 'count_per_or', 'passive', 'on_phase', 'after_phase',
  'remove_when_used_up', 'when',
]);

// ── Per-type setup kwargs ────────────────────────────────────────────────────
// Each entry mirrors the `def setup(...)` keyword list in the corresponding
// lib/engine/ability/<type>.rb. Types absent from this map accept only base
// kwargs (additional_token, description, manual_close_company, no_buy,
// sell_company — all base-only in tobymao). NOTE: blocks_hexes_consent is
// NOT base-only — BlocksHexesConsent < BlocksHexes inherits
// setup(hexes:, hidden:) with hexes: required; omitting it crashes Ruby load.
const ABILITY_SETUP_KWARGS = {
  acquire_company:      new Set(['company']),
  assign_corporation:   new Set(['closed_when_used_up']),
  assign_hexes:         new Set(['hexes', 'closed_when_used_up', 'cost']),
  blocks_hexes:         new Set(['hexes', 'hidden']),
  blocks_hexes_consent: new Set(['hexes', 'hidden']),
  blocks_partition:     new Set(['partition_type']),
  borrow_train:       new Set(['train_types']),
  choose_ability:     new Set(['choices']),
  close:              new Set(['corporation', 'silent']),
  exchange:           new Set(['corporations', 'from']),
  generic:            new Set(['subtype']),
  hex_bonus:          new Set(['hexes', 'amount']),
  purchase_train:     new Set(['free']),
  reservation:        new Set(['hex', 'city', 'slot', 'icon']),
  return_token:       new Set(['reimburse']),
  revenue_change:     new Set(['revenue']),
  shares:             new Set(['shares', 'corporations']),
  teleport:           new Set(['hexes', 'tiles', 'cost', 'free_tile_lay',
                               'from_owner', 'extra_action']),
  tile_discount:      new Set(['discount', 'terrain', 'hexes', 'exact_match']),
  tile_income:        new Set(['income', 'owner_only', 'terrain']),
  tile_lay:           new Set(['tiles', 'hexes', 'free', 'discount', 'special',
                               'connect', 'blocks', 'reachable',
                               'must_lay_together', 'cost', 'closed_when_used_up',
                               'must_lay_all', 'consume_tile_lay', 'lay_count',
                               'upgrade_count', 'combo_entities']),
  token:              new Set(['hexes', 'price', 'teleport_price', 'extra_action',
                               'from_owner', 'discount', 'city', 'neutral',
                               'cheater', 'extra_slot', 'special_only',
                               'check_tokenable', 'closed_when_used_up',
                               'connected', 'same_hex_allowed']),
  train_buy:          new Set(['face_value']),
  train_discount:     new Set(['discount', 'trains', 'closed_when_used_up']),
  train_limit:        new Set(['increase', 'constant']),
  train_scrapper:     new Set(['scrap_values']),
};

// True when `key` is acceptable for an ability of `type` — either it's a base
// kwarg or it appears in this type's setup signature.
function _abilityAllowed(type, key) {
  if (ABILITY_BASE_KWARGS.has(key)) return true;
  const setupSet = ABILITY_SETUP_KWARGS[type];
  return !!(setupSet && setupSet.has(key));
}

// Structural-validity gate: false → the ability MUST NOT be emitted because it
// would produce malformed/no-op Ruby. Currently the only rule: a `generic`
// ability with a blank `subtype`. Generic#setup does `@type = subtype.to_sym`,
// so subtype:'' yields the empty symbol :"" — a dead ability that previously
// shipped into g_forge*/entities.rb. The panel now requires a subtype; this is
// the export-time backstop. Exporters filter abilities through this before
// serialization. New structural-invalidity rules belong here, single-source.
function _abilityExportable(ab) {
  if (!ab || !ab.type) return false;
  if (ab.type === 'generic' &&
      !(ab.subtype != null && String(ab.subtype).trim() !== '')) return false;
  return true;
}

// ── Canonical emission order ────────────────────────────────────────────────
// Chosen to preserve byte-for-byte output against the prior _rbAbility for
// every ability shape currently exercised by the forge test suite. Fields
// added beyond _rbAbility's historical set (combo_entities, teleport_price,
// lay_count, etc.) are slotted near their semantic neighbours; they emit only
// when the per-type allowlist permits, so they never leak onto a type that
// pre-fix would have silently filtered them.

function _serializeAbility(ab, fmt) {
  const { quote, strArr, when } = fmt;
  const t  = ab.type;
  const kv = [];
  const p  = (k, v) => kv.push(k + ': ' + v);

  // Field-level helpers. Each checks the per-type allowlist before testing
  // presence on `ab`, so a stray field that the type's setup() doesn't accept
  // is dropped rather than written into invalid Ruby.
  const tryS = (k) => {
    if (_abilityAllowed(t, k) && ab[k]) p(k, quote(ab[k]));
  };
  const tryN = (k) => {
    if (_abilityAllowed(t, k) && ab[k] != null) p(k, String(ab[k]));
  };
  const tryB = (k) => {
    if (_abilityAllowed(t, k) && ab[k] != null) p(k, ab[k] ? 'true' : 'false');
  };
  const tryStrArr = (k) => {
    if (_abilityAllowed(t, k) && ab[k] && ab[k].length) p(k, strArr(ab[k]));
  };

  // type is always emitted (it's the only universally-required kwarg).
  if (t) p('type', quote(t));

  tryS('owner_type');

  // when: may be scalar or array. Caller's `when(...)` formatter handles both.
  if (_abilityAllowed(t, 'when')) {
    const wen = when(ab.when);
    if (wen) p('when', wen);
  }

  tryStrArr('hexes');
  tryStrArr('corporations');
  tryStrArr('combo_entities');

  tryN('count');
  tryN('count_per_or');
  tryN('cost');
  tryN('discount');
  tryN('amount');
  tryN('price');
  tryN('teleport_price');
  tryN('lay_count');
  tryN('upgrade_count');
  tryN('income');
  tryN('slot');
  tryN('city');

  // from: (exchange.rb) accepts scalar OR array. Format depends on shape.
  if (_abilityAllowed(t, 'from') && ab.from != null) {
    p('from', Array.isArray(ab.from) ? strArr(ab.from) : quote(ab.from));
  }

  tryS('terrain');
  tryS('partition_type');

  // hex: required for reservation (reservation.rb:11). Emit unconditionally with '' fallback.
  if (t === 'reservation') p('hex', quote(ab.hex != null ? ab.hex : ''));

  // tiles: required for tile_lay (tile_lay.rb:13) and teleport (teleport.rb:11).
  // Emit unconditionally for those types; for others use the non-empty guard.
  if (t === 'tile_lay' || t === 'teleport') p('tiles', strArr(ab.tiles || []));
  else tryStrArr('tiles');

  tryS('corporation');

  // shares: (shares.rb) — accepted by type='shares' only. Format scalar/array.
  if (_abilityAllowed(t, 'shares') && ab.shares != null) {
    p('shares', Array.isArray(ab.shares) ? strArr(ab.shares) : quote(ab.shares));
  }

  // revenue: (revenue_change.rb) — REQUIRED on type='revenue_change'. Emit
  // unconditionally for that type with 0 fallback so a missing value doesn't
  // block Ruby load with a missing-kwarg error pointing at the wrong file.
  if (t === 'revenue_change') {
    p('revenue', String(ab.revenue != null ? ab.revenue : 0));
  }

  // subtype: (generic.rb:8) — REQUIRED for type='generic'. Emit unconditionally.
  if (t === 'generic') p('subtype', quote(ab.subtype != null ? ab.subtype : ''));

  tryS('description');
  tryS('desc_detail');
  tryS('remove');
  tryS('on_phase');
  tryS('after_phase');

  tryB('closed_when_used_up');
  tryB('free');
  tryB('reachable');
  tryB('special');
  tryB('connect');
  tryB('passive');
  tryB('must_lay_together');
  tryB('must_lay_all');
  tryB('consume_tile_lay');
  tryB('blocks');
  tryB('extra_action');
  tryB('from_owner');
  tryB('special_only');
  tryB('extra_slot');
  tryB('neutral');
  tryB('check_tokenable');
  tryB('connected');
  tryB('same_hex_allowed');
  tryB('use_across_ors');
  tryB('hidden');

  return '{ ' + kv.join(', ') + ' }';
}

// Browser global exposure — consumers (export-game.js, export-entities.js) read
// _serializeAbility directly from the global scope. Node test harnesses see the
// same identifier via concatenated-script evaluation.
if (typeof window !== 'undefined') {
  window._serializeAbility    = _serializeAbility;
  window._abilityAllowed      = _abilityAllowed;
  window._abilityExportable   = _abilityExportable;
  window.ABILITY_BASE_KWARGS  = ABILITY_BASE_KWARGS;
  window.ABILITY_SETUP_KWARGS = ABILITY_SETUP_KWARGS;
}
