// js/export-game.js  v20260425a
// Skeleton-based exporter: game.rb and entities.rb.
//
// Replaces:  export-entities.js  +  generateGameRb() in mechanics-panel.js
//
// Architecture
// ────────────
// Each mechanic is a Module object:
//   { id: string, emit(state) → { slotName: string, … } | null }
//
// Modules contribute to named slots. The skeleton templates have {{SLOT_XXX}}
// markers.  _grbFill() indents each slot's content to 8 spaces (class body)
// and substitutes it in.  Multiple modules contributing to the same slot are
// joined with a blank line.
//
// game.rb slots:   bank  corp_rules  stock_round  or_rules  game_flow
//                  game_end  special  methods
// entities.rb slots:  companies  corporations  minors
//
// Load order: after mechanics-panel.js (uses state).
// Wires:  #exportGameBtn  #exportEntitiesBtn  (preview via renderGameRb())

'use strict';

// ── Indent helper ─────────────────────────────────────────────────────────────
// Adds n spaces to every non-empty line of str.
function _grbIndent(n, str) {
  if (!str) return '';
  const pad = ' '.repeat(n);
  return str.split('\n').map(l => l === '' ? '' : pad + l).join('\n');
}

// ── Ruby literal helpers ──────────────────────────────────────────────────────
function _rbStr(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}
function _rbColor(c) {
  if (!c || c === 'none') return ':white';
  if (/^#/.test(c)) return _rbStr(c);
  if (/^[a-zA-Z][a-zA-Z0-9_]*$/.test(c)) return ':' + c;
  return _rbStr(c);
}
function _rbWhen(w) {
  if (w == null) return null;
  if (Array.isArray(w)) return _rbStrArr(w);
  return _rbStr(w);
}
function _rbStrArr(arr) {
  if (!arr || !arr.length) return '[]';
  if (arr.every(s => /^[^\s'"]+$/.test(String(s)))) return '%w[' + arr.join(' ') + ']';
  return '[' + arr.map(_rbStr).join(', ') + ']';
}
function _rbNumArr(arr) {
  if (!arr || !arr.length) return '[]';
  return '[' + arr.join(', ') + ']';
}
function _rbCashNum(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '_');
}
function _rbCashTableFilled(tbl) {
  return tbl && Object.values(tbl).some(v => v > 0);
}

// ── Tile-lay slot → Ruby hash literal ────────────────────────────────────────
// Mirrors slotToRuby() that used to live in mechanics-panel.js.
// Keys sourced from lib/engine/step/tracker.rb:34-45.
const _GRB_DEFAULT_TILE_LAY = {
  lay: true, upgrade: true, cost: 0, upgrade_cost: 0, cannot_reuse_same_hex: false,
};

function _rbTileSlot(s) {
  const p = [];
  if (s.lay === true)              p.push('lay: true');
  else if (s.lay === false)        p.push('lay: false');
  else if (s.lay)                  p.push(`lay: :${s.lay}`);
  if (s.upgrade === true)          p.push('upgrade: true');
  else if (s.upgrade === false)    p.push('upgrade: false');
  else if (s.upgrade)              p.push(`upgrade: :${s.upgrade}`);
  if (s.cost)                      p.push(`cost: ${s.cost}`);
  if (s.upgrade_cost)              p.push(`upgrade_cost: ${s.upgrade_cost}`);
  if (s.cannot_reuse_same_hex)     p.push('cannot_reuse_same_hex: true');
  if (s.hex_must_be_connected === false) p.push('hex_must_be_connected: false');
  if (s.special)                   p.push('special: true');
  return '{ ' + p.join(', ') + ' }';
}

// ── Ability hash → Ruby literal ───────────────────────────────────────────────
// Covers all known ability fields used by tobymao ability/*.rb.
function _rbAbility(ab) {
  const kv = [];
  const p  = (k, v) => kv.push(k + ': ' + v);
  if (ab.type)        p('type',       _rbStr(ab.type));
  if (ab.owner_type)  p('owner_type', _rbStr(ab.owner_type));
  const wen = _rbWhen(ab.when);
  if (wen)            p('when', wen);
  if (ab.hexes?.length)        p('hexes',        _rbStrArr(ab.hexes));
  if (ab.corporations?.length) p('corporations', _rbStrArr(ab.corporations));
  if (ab.count        != null) p('count',        String(ab.count));
  if (ab.count_per_or != null) p('count_per_or', String(ab.count_per_or));
  if (ab.cost         != null) p('cost',         String(ab.cost));
  if (ab.discount     != null) p('discount',     String(ab.discount));
  if (ab.amount       != null) p('amount',       String(ab.amount));
  if (ab.price        != null) p('price',        String(ab.price));
  if (ab.from != null)
    p('from', Array.isArray(ab.from) ? _rbStrArr(ab.from) : _rbStr(ab.from));
  if (ab.terrain)              p('terrain',      _rbStr(ab.terrain));
  if (ab.tiles?.length)        p('tiles',        _rbStrArr(ab.tiles));
  if (ab.corporation)          p('corporation',  _rbStr(ab.corporation));
  if (ab.shares?.length)       p('shares',       _rbStrArr(ab.shares));
  if (ab.description)          p('description',  _rbStr(ab.description));
  if (ab.on_phase)             p('on_phase',     _rbStr(ab.on_phase));
  if (ab.closed_when_used_up != null)
    p('closed_when_used_up', ab.closed_when_used_up ? 'true' : 'false');
  if (ab.free      != null) p('free',      ab.free      ? 'true' : 'false');
  if (ab.reachable != null) p('reachable', ab.reachable ? 'true' : 'false');
  return '{ ' + kv.join(', ') + ' }';
}

// ── Entity serializers ────────────────────────────────────────────────────────

// Private company → COMPANIES array entry.
// State field names (Jenny's panel):
//   priv.name, priv.cost (→ value:), priv.revenue, priv.ability||priv.desc (→ desc:),
//   priv.sym||priv.abbr (→ sym:), priv.minPrice, priv.maxPrice, priv.color, priv.abilities
function _rbPrivate(priv) {
  const i  = '  ';
  const ii = '    ';
  const lines = [];
  lines.push(i + '{');
  lines.push(ii + 'name: '    + _rbStr(priv.name || ''));
  lines.push(ii + 'value: '   + (priv.cost != null ? priv.cost : (priv.value || 0)));
  const rev = priv.revenue;
  if (Array.isArray(rev)) lines.push(ii + 'revenue: ' + _rbNumArr(rev));
  else                    lines.push(ii + 'revenue: ' + (rev != null ? rev : 0));
  const desc = priv.ability || priv.desc || '';
  if (desc) lines.push(ii + 'desc: ' + _rbStr(desc));
  lines.push(ii + 'sym: ' + _rbStr(priv.sym || priv.abbr || ''));
  if (priv.minPrice != null) lines.push(ii + 'min_price: ' + priv.minPrice);
  if (priv.maxPrice != null) lines.push(ii + 'max_price: ' + priv.maxPrice);
  if (priv.color && !/^#(000|666)/.test(priv.color))
    lines.push(ii + 'color: ' + _rbColor(priv.color));
  const abs = priv.abilities || [];
  if (abs.length) {
    lines.push(ii + 'abilities: [');
    abs.forEach(ab => lines.push(ii + '  ' + _rbAbility(ab) + ','));
    lines.push(ii + '],');
  }
  lines.push(i + '},');
  return lines.join('\n');
}

// Corporation or Minor → CORPORATIONS / MINORS array entry.
// State structure: co is a company object, pack is the corp-pack it belongs to.
// gameCap: the game-level CAPITALIZATION string ('full', 'incremental', …).
const _RB_DEFAULT_SHARES = JSON.stringify([20, 10, 10, 10, 10, 10, 10, 10, 10]);

function _rbCorp(co, pack, gameCap) {
  const i  = '  ';
  const ii = '    ';
  const lines = [];
  const floatPct = co.floatPctOverride != null ? co.floatPctOverride : (pack.floatPct ?? 60);
  const tokens   = co.tokensOverride   != null ? co.tokensOverride   : (pack.tokens || [0, 40, 100]);
  const shares   = pack.shares || [20, 10, 10, 10, 10, 10, 10, 10, 10];
  const cap      = pack.capitalization  || 'full';
  const maxOwn   = pack.maxOwnershipPct ?? 60;
  const amp      = pack.alwaysMarketPrice || false;
  lines.push(i + '{');
  lines.push(ii + 'sym: '  + _rbStr(co.sym  || ''));
  lines.push(ii + 'name: ' + _rbStr(co.name || ''));
  if (co.logo)  lines.push(ii + 'logo: ' + _rbStr(co.logo));
  lines.push(ii + 'color: ' + _rbColor(co.color || '#666666'));
  if (co.textColor && !/^#fff/i.test(co.textColor))
    lines.push(ii + 'text_color: ' + _rbColor(co.textColor));
  lines.push(ii + 'tokens: ' + _rbNumArr(tokens));
  if (co.coordinates)
    lines.push(ii + 'coordinates: ' + _rbStr(co.coordinates));
  if (co.city && parseInt(co.city) !== 0)
    lines.push(ii + 'city: ' + parseInt(co.city));
  if (co.destinationCoordinates)
    lines.push(ii + 'destination_coordinates: ' + _rbStr(co.destinationCoordinates));
  if (JSON.stringify(shares) !== _RB_DEFAULT_SHARES)
    lines.push(ii + 'shares: ' + _rbNumArr(shares));
  if (floatPct !== 60)
    lines.push(ii + 'float_percent: ' + floatPct);
  if (maxOwn !== 60)
    lines.push(ii + 'max_ownership_percent: ' + maxOwn);
  if (amp)
    lines.push(ii + 'always_market_price: true');
  if (cap !== gameCap)
    lines.push(ii + 'capitalization: :' + cap);
  const abs = co.abilities || [];
  if (abs.length) {
    lines.push(ii + 'abilities: [');
    abs.forEach(ab => lines.push(ii + '  ' + _rbAbility(ab) + ','));
    lines.push(ii + '],');
  }
  lines.push(i + '},');
  return lines.join('\n');
}

// ── Module registry ───────────────────────────────────────────────────────────
// Each module: { id: string, emit(state) → { slotName: string, … } | null }
// A module returning { bank: '...', methods: '...' } contributes to two slots.
// Multiple modules targeting the same slot are joined with \n\n.

const _GRB_MODULES = [

  // ── Bank & Players ──────────────────────────────────────────────────────────
  {
    id: 'bank',
    emit(state) {
      const m = state.mechanics || {};
      const lines = [];
      if (m.bankCash)
        lines.push(`BANK_CASH = ${_rbCashNum(m.bankCash)}`);
      if (m.currency && m.currency !== '$%s')
        lines.push(`CURRENCY_FORMAT_STR = '${m.currency}'`);
      if (_rbCashTableFilled(m.startingCash)) {
        const e = Object.entries(m.startingCash).filter(([,v]) => v > 0)
          .map(([p, v]) => `${p} => ${v}`).join(', ');
        lines.push(`STARTING_CASH = { ${e} }.freeze`);
      }
      if (_rbCashTableFilled(m.certLimit)) {
        const e = Object.entries(m.certLimit).filter(([,v]) => v > 0)
          .map(([p, v]) => `${p} => ${v}`).join(', ');
        lines.push(`CERT_LIMIT = { ${e} }.freeze`);
      }
      return lines.length ? { bank: lines.join('\n') } : null;
    },
  },

  // ── Corporation Rules ────────────────────────────────────────────────────────
  {
    id: 'corp_rules',
    emit(state) {
      const m = state.mechanics || {};
      const lines = [];
      if ((m.capitalization || 'full') !== 'full')
        lines.push(`CAPITALIZATION = :${m.capitalization}`);
      // FLOAT_PERCENT is not a real engine constant — float_percent is per-corp in entities.rb.
      if ((m.homeTokenTiming || 'operate') !== 'operate')
        lines.push(`HOME_TOKEN_TIMING = :${m.homeTokenTiming}`);
      if ((m.marketShareLimit ?? 50) !== 50)
        lines.push(`MARKET_SHARE_LIMIT = ${m.marketShareLimit}`);
      if ((m.trackRestriction || 'semi_restrictive') !== 'semi_restrictive')
        lines.push(`TRACK_RESTRICTION = :${m.trackRestriction}`);
      if (!(m.bankruptcyAllowed ?? true))
        lines.push(`BANKRUPTCY_ALLOWED = false`);
      if ((m.bankruptcyEndsGameAfter || 'one') !== 'one')
        lines.push(`BANKRUPTCY_ENDS_GAME_AFTER = :${m.bankruptcyEndsGameAfter}`);
      return lines.length ? { corp_rules: lines.join('\n') } : null;
    },
  },

  // ── Stock Round ──────────────────────────────────────────────────────────────
  {
    id: 'stock_round',
    emit(state) {
      const m = state.mechanics || {};
      const lines = [];
      if ((m.sellBuyOrder || 'sell_buy_or_buy_sell') !== 'sell_buy_or_buy_sell')
        lines.push(`SELL_BUY_ORDER = :${m.sellBuyOrder}`);
      if ((m.sellMovement || 'down_share') !== 'down_share')
        lines.push(`SELL_MOVEMENT = :${m.sellMovement}`);
      if ((m.poolShareDrop || 'none') !== 'none')
        lines.push(`POOL_SHARE_DROP = :${m.poolShareDrop}`);
      if (m.mustSellInBlocks)
        lines.push(`MUST_SELL_IN_BLOCKS = true`);
      if ((m.sellAfter || 'first') !== 'first')
        lines.push(`SELL_AFTER = :${m.sellAfter}`);
      if ((m.soldOutTopRowMovement || 'none') !== 'none')
        lines.push(`SOLD_OUT_TOP_ROW_MOVEMENT = :${m.soldOutTopRowMovement}`);
      return lines.length ? { stock_round: lines.join('\n') } : null;
    },
  },

  // ── Operating Round ──────────────────────────────────────────────────────────
  {
    id: 'or_rules',
    emit(state) {
      const m = state.mechanics || {};
      const lines = [];
      if ((m.mustBuyTrain || 'route') !== 'route')
        lines.push(`MUST_BUY_TRAIN = :${m.mustBuyTrain}`);
      if (m.allowRemovingTowns)
        lines.push(`ALLOW_REMOVING_TOWNS = true`);
      if ((m.ebuyFromOthers || 'value') !== 'value')
        lines.push(`EBUY_FROM_OTHERS = :${m.ebuyFromOthers}`);
      if (!(m.ebuyDepotCheapest ?? true))
        lines.push(`EBUY_DEPOT_TRAIN_MUST_BE_CHEAPEST = false`);
      if (m.mustIssueBeforeEbuy)
        lines.push(`MUST_EMERGENCY_ISSUE_BEFORE_EBUY = true`);
      if (m.ebuyOwnerMustHelp)
        lines.push(`EBUY_OWNER_MUST_HELP = true`);
      if (!(m.ebuyCanSellShares ?? true))
        lines.push(`EBUY_CAN_SELL_SHARES = false`);
      if (!(m.ebuyPresSwap ?? true))
        lines.push(`EBUY_PRES_SWAP = false`);
      if (m.ebuyCanTakePlayerLoan && m.ebuyCanTakePlayerLoan !== 'false') {
        lines.push(`EBUY_CAN_TAKE_PLAYER_LOAN = :${m.ebuyCanTakePlayerLoan}`);
        if ((m.playerLoanInterestRate ?? 50) !== 50)
          lines.push(`PLAYER_LOAN_INTEREST_RATE = ${m.playerLoanInterestRate}`);
        if ((m.playerLoanEndgamePenalty ?? 0) !== 0)
          lines.push(`PLAYER_LOAN_ENDGAME_PENALTY = ${m.playerLoanEndgamePenalty}`);
      }
      const defSlots = m.tileLays?.default || [_GRB_DEFAULT_TILE_LAY];
      lines.push(`TILE_LAYS = [${defSlots.map(_rbTileSlot).join(', ')}].freeze`);
      if (m.tileLays?.byType?.major) {
        lines.push('');
        lines.push(`MAJOR_TILE_LAYS = [${m.tileLays.byType.major.map(_rbTileSlot).join(', ')}].freeze`);
      }
      if (m.tileLays?.byType?.minor) {
        lines.push('');
        lines.push(`MINOR_TILE_LAYS = [${m.tileLays.byType.minor.map(_rbTileSlot).join(', ')}].freeze`);
      }
      // Always emit TILE_LAYS (required by engine)
      return { or_rules: lines.join('\n') };
    },
  },

  // ── Game Flow (comment block) ─────────────────────────────────────────────────
  {
    id: 'game_flow',
    emit(state) {
      const m = state.mechanics || {};
      const lines = [];
      const irLabel = {
        waterfall_auction: 'Waterfall auction',
        draft:             'Draft',
        stock_round:       'Stock round (no auction)',
      }[m.initialRound || 'waterfall_auction'] || (m.initialRound || 'waterfall_auction');
      lines.push(`# Initial round: ${irLabel} — configure auction in Companies panel`);
      if ((m.stockRoundsPerSet || 1) !== 1)
        lines.push(`# ${m.stockRoundsPerSet} stock rounds per set — implement via round order array`);
      if (m.mergerRound || m.merger?.enabled)
        lines.push(`# Merger round enabled — add G<game>::Round::Merger to round order`);
      const events = m.events || [];
      if (events.length) {
        lines.push('');
        lines.push('# Train events — add events: array to matching TRAINS entry:');
        events.forEach(ev => {
          const desc = (typeof KNOWN_EVENTS !== 'undefined'
            ? KNOWN_EVENTS.find(e => e.type === ev.eventType)?.desc
            : null) || ev.eventType;
          lines.push(`#   ${ev.triggerOn}: [{ type: '${ev.eventType}' }]  # ${desc}`);
        });
      }
      const activeSteps = Object.entries(m.orSteps || {}).filter(([,v]) => v).map(([k]) => k);
      if (activeSteps.length) {
        lines.push('');
        lines.push('# Custom OR steps — implement as G<game>::Step::...:');
        activeSteps.forEach(k => {
          const cls = k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, c => c);
          lines.push(`#   ${cls}`);
        });
      }
      return lines.length ? { game_flow: lines.join('\n') } : null;
    },
  },

  // ── Game End ──────────────────────────────────────────────────────────────────
  {
    id: 'game_end',
    emit(state) {
      const m   = state.mechanics || {};
      const gec = m.gameEndCheck  || {};
      const active = Object.entries(gec).filter(([,v]) => v.enabled);
      if (!active.length) return { game_end: '# GAME_END_CHECK not configured' };
      const pairs = active.map(([k, v]) => `${k}: :${v.timing}`).join(', ');
      return { game_end: `GAME_END_CHECK = { ${pairs} }.freeze` };
    },
  },

  // ── Mail Contracts ────────────────────────────────────────────────────────────
  // Reads priv.mailContract: { enabled, formula, perStopAmount }
  // formula: 'first_last_half' (1822-style, treasury subsidy)
  //          'per_stop'        (1846-style, injected into route revenue)
  // Jenny: add mailContract field to private company state schema + UI toggle.
  // Farrah: on import, detect PRIVATE_MAIL_CONTRACTS constant and back-populate
  //         priv.mailContract = { enabled: true, formula: 'first_last_half' }.
  {
    id: 'mail_contract',
    emit(state) {
      const mcs = (state.privates || []).filter(p => p.mailContract?.enabled);
      if (!mcs.length) return null;
      const syms    = mcs.map(p => p.sym || p.abbr).filter(Boolean);
      const formula = mcs[0].mailContract.formula || 'first_last_half';
      const constant = `PRIVATE_MAIL_CONTRACTS = %w[${syms.join(' ')}].freeze`;
      let methods = '';
      if (formula === 'first_last_half') {
        // 1822-style: (first stop base revenue + last stop base revenue) / 2.
        // Goes to corp treasury only — does not affect dividends or share price.
        // Source: g_1822/game.rb:1831-1853, step/dividend.rb:92,232
        methods = [
          `def routes_subsidy(routes)`,
          `  return 0 if routes.empty?`,
          `  mail_contract_bonus(routes.first.train.owner, routes).sum { |v| v[:subsidy] }`,
          `end`,
          ``,
          `def subsidy_name`,
          `  'mail contract'`,
          `end`,
          ``,
          `def mail_contract_bonus(entity, routes)`,
          `  count = entity.companies.count { |c| self.class::PRIVATE_MAIL_CONTRACTS.include?(c.id) }`,
          `  return [] unless count.positive?`,
          `  bonuses = routes.filter_map do |r|`,
          `    stops = r.visited_stops`,
          `    next if stops.size < 2`,
          `    first = stops.first.route_base_revenue(r.phase, r.train)`,
          `    last  = stops.last.route_base_revenue(r.phase, r.train)`,
          `    { route: r, subsidy: (first + last) / 2 }`,
          `  end`,
          `  bonuses.sort_by { |v| -v[:subsidy] }.take(count)`,
          `end`,
        ].join('\n');
      } else if (formula === 'per_stop') {
        // 1846-style: +$N per city on the owning corp's longest route.
        // Injected at route-revenue level — counts toward dividends and share price.
        // Source: g_1846/game.rb:460-465
        const amt = mcs[0].mailContract.perStopAmount || 10;
        methods = [
          `# Mail contract: +$${amt} per stop on owning corp's longest route.`,
          `# Included in route revenue (affects dividends and share price).`,
          `def revenue_for_route(route)`,
          `  revenue = super`,
          `  if route.train.owner.companies.any? { |c| self.class::PRIVATE_MAIL_CONTRACTS.include?(c.id) }`,
          `    longest = route.routes.max_by { |r| [r.visited_stops.size, r.train.id] }`,
          `    revenue += route.visited_stops.size * ${amt} if route == longest`,
          `  end`,
          `  revenue`,
          `end`,
        ].join('\n');
      }
      const result = { special: constant };
      if (methods) result.methods = methods;
      return result;
    },
  },

  // ── Private Company Helpers ───────────────────────────────────────────────────
  // Emits accessor methods for privates that use assign_hexes, assign_corporation,
  // or generic abilities — these need direct game.rb references in custom step code.
  {
    id: 'private_helpers',
    emit(state) {
      const HELPER_TYPES = new Set(['assign_hexes', 'assign_corporation', 'generic']);
      const helpers = (state.privates || []).filter(p =>
        (p.abilities || []).some(a => HELPER_TYPES.has(a.type))
      );
      if (!helpers.length) return null;
      const lines = ['# Private company accessors — reference by name in custom step code.'];
      for (const priv of helpers) {
        const mName = _grbHelperName(priv.name, priv.sym || priv.abbr);
        lines.push('');
        lines.push(`def ${mName}`);
        lines.push(`  @${mName} ||= company_by_id(${_rbStr(priv.sym || priv.abbr || '')})`);
        lines.push(`end`);
      }
      return { methods: lines.join('\n') };
    },
  },

  // ── COMPANIES (entities.rb) ───────────────────────────────────────────────────
  {
    id: 'companies',
    emit(state) {
      const privates = state.privates || [];
      if (!privates.length) return null;
      const lines = ['COMPANIES = ['];
      privates.forEach(p => lines.push(_rbPrivate(p)));
      lines.push('].freeze');
      return { companies: lines.join('\n') };
    },
  },

  // ── CORPORATIONS (entities.rb) ────────────────────────────────────────────────
  {
    id: 'corporations',
    emit(state) {
      const gameCap = state.mechanics?.capitalization || 'full';
      const packs   = (state.corpPacks || []).filter(pk => pk.type !== 'minor');
      const entries = [];
      packs.forEach(pack => (pack.companies || []).forEach(co => entries.push({ co, pack })));
      if (!entries.length) return null;
      const lines = ['CORPORATIONS = ['];
      entries.forEach(({ co, pack }) => lines.push(_rbCorp(co, pack, gameCap)));
      lines.push('].freeze');
      return { corporations: lines.join('\n') };
    },
  },

  // ── MINORS (entities.rb) ──────────────────────────────────────────────────────
  {
    id: 'minors',
    emit(state) {
      const gameCap = state.mechanics?.capitalization || 'full';
      const packs   = (state.corpPacks || []).filter(pk => pk.type === 'minor');
      const entries = [];
      packs.forEach(pack => (pack.companies || []).forEach(co => entries.push({ co, pack })));
      if (!entries.length) return null;
      const lines = ['MINORS = ['];
      entries.forEach(({ co, pack }) => lines.push(_rbCorp(co, pack, gameCap)));
      lines.push('].freeze');
      return { minors: lines.join('\n') };
    },
  },
];

// ── Helper name deriver ───────────────────────────────────────────────────────
// Strips trailing company-type words, lowercases, replaces non-alnum with _.
// Used for private company accessor method names.
function _grbHelperName(name, sym) {
  let s = (name || '').toLowerCase();
  s = s.replace(/\s+(company|railroad|railway|corp(?:oration)?|co\.?|lines?|inc\.?|limited|ltd\.?)$/i, '');
  s = s.replace(/\s*&\s*/g, '_and_');
  s = s.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/_+/g, '_');
  return s || (sym || '').toLowerCase().replace(/[^a-z0-9]/g, '_') || 'company';
}

// ── Module runner ─────────────────────────────────────────────────────────────
// Runs every module, collects contributions per slot.
function _grbCollect(state) {
  const slots = {};
  for (const mod of _GRB_MODULES) {
    let result;
    try { result = mod.emit(state); } catch (e) {
      console.warn(`[export-game] module '${mod.id}' threw:`, e);
      result = null;
    }
    if (!result) continue;
    for (const [slot, content] of Object.entries(result)) {
      if (!content) continue;
      slots[slot] = slots[slot] ? slots[slot] + '\n\n' + content : content;
    }
  }
  return slots;
}

// ── Skeleton templates ────────────────────────────────────────────────────────
// {{SLOT_XXX}} markers receive slot content indented 8 spaces (class body).
// {{MODULE}} is a plain substitution (no indent).
// Empty slots render as a placeholder comment so the skeleton stays parseable.

const _GAME_RB_SKELETON = `\
# frozen_string_literal: true
# Generated by 18xxtools — edit freely

require_relative '../base'
require_relative 'entities'
require_relative 'map'

module Engine
  module Game
    module G{{MODULE}}
      class Game < Engine::Game::Base
        include Entities
        include Map

        # ── Bank & Players ────────────────────────────────────────────────────
{{SLOT_BANK}}

        # ── Corporation Rules ─────────────────────────────────────────────────
{{SLOT_CORP_RULES}}

        # ── Stock Round ───────────────────────────────────────────────────────
{{SLOT_STOCK_ROUND}}

        # ── Operating Round ───────────────────────────────────────────────────
{{SLOT_OR_RULES}}

        # ── Game Flow ─────────────────────────────────────────────────────────
{{SLOT_GAME_FLOW}}

        # ── Game End ──────────────────────────────────────────────────────────
{{SLOT_GAME_END}}

        # ── Special Constants ─────────────────────────────────────────────────
{{SLOT_SPECIAL}}

        # ── Methods ───────────────────────────────────────────────────────────
{{SLOT_METHODS}}

      end
    end
  end
end
`;

const _ENTITIES_RB_SKELETON = `\
# frozen_string_literal: true
# Generated by 18xxtools — edit freely

module Engine
  module Game
    module G{{MODULE}}
      module Entities
        # ── Private Companies ─────────────────────────────────────────────────
{{SLOT_COMPANIES}}

        # ── Corporations ──────────────────────────────────────────────────────
{{SLOT_CORPORATIONS}}

        # ── Minors ────────────────────────────────────────────────────────────
{{SLOT_MINORS}}

      end
    end
  end
end
`;

// ── Skeleton filler ───────────────────────────────────────────────────────────
function _grbFill(skeleton, moduleName, slots) {
  let out = skeleton.replace(/\{\{MODULE\}\}/g, moduleName || 'Game');
  out = out.replace(/\{\{SLOT_([A-Z_]+)\}\}/g, (_, key) => {
    const content = slots[key.toLowerCase()];
    if (!content) return '        # (nothing to configure)';
    return _grbIndent(8, content);
  });
  // Collapse 3+ blank lines to 2
  return out.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// ── Module name from game title ───────────────────────────────────────────────
// "18 Chesapeake" → "G18Chesapeake"   "1846" → "G1846"
function _grbModuleName(state) {
  const title = state?.meta?.title || '';
  const clean = title.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
  return clean ? 'G' + clean : 'GGame';
}

// ── Public entry points ───────────────────────────────────────────────────────

function renderGameRb() {
  if (typeof state === 'undefined' || !state.mechanics)
    return '# No mechanics state loaded yet.\n# Load or build a game first.\n';
  const slots   = _grbCollect(state);
  const modName = _grbModuleName(state);
  return _grbFill(_GAME_RB_SKELETON, modName, slots);
}

function renderEntitiesRb() {
  if (typeof state === 'undefined')
    return '# No state loaded.\n';
  const slots   = _grbCollect(state);
  const modName = _grbModuleName(state);
  return _grbFill(_ENTITIES_RB_SKELETON, modName, slots);
}

// ── Download helper ───────────────────────────────────────────────────────────
function _grbDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Button wiring ─────────────────────────────────────────────────────────────

document.getElementById('exportGameBtn').addEventListener('click', () => {
  try {
    const src  = renderGameRb();
    const slug = _grbModuleName(state).toLowerCase();
    _grbDownload(src, slug + '_game.rb');
    if (typeof updateStatus === 'function') updateStatus('Exported ' + slug + '_game.rb');
  } catch (err) {
    console.error('[renderGameRb]', err);
    alert('Export failed: ' + err.message);
  }
});

document.getElementById('exportEntitiesBtn').addEventListener('click', () => {
  try {
    const src  = renderEntitiesRb();
    const slug = _grbModuleName(state).toLowerCase();
    _grbDownload(src, slug + '_entities.rb');
    if (typeof updateStatus === 'function') updateStatus('Exported ' + slug + '_entities.rb');
  } catch (err) {
    console.error('[renderEntitiesRb]', err);
    alert('Export failed: ' + err.message);
  }
});
