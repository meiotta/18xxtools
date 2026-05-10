// js/export-game.js  v20260504a
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
// game.rb slots:   trains  phases  bank  corp_rules  stock_round  or_rules
//                  game_flow  game_end  special  methods
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
function _rbQuote(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}
function _rbColor(c) {
  if (!c || c === 'none') return ':white';
  if (/^#/.test(c)) return _rbQuote(c);
  if (/^[a-zA-Z][a-zA-Z0-9_]*$/.test(c)) return ':' + c;
  return _rbQuote(c);
}
function _rbWhen(w) {
  if (w == null) return null;
  if (Array.isArray(w)) return _grbStrArr(w);
  return _rbQuote(w);
}
function _grbStrArr(arr) {
  if (!arr || !arr.length) return '[]';
  if (arr.every(s => /^[^\s'"]+$/.test(String(s)))) return '%w[' + arr.join(' ') + ']';
  return '[' + arr.map(_rbQuote).join(', ') + ']';
}
function _rbNumArr(arr) {
  if (!arr || !arr.length) return '[]';
  return '[' + arr.join(', ') + ']';
}
function _rbCashNum(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '_');
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
  if (ab.type)        p('type',       _rbQuote(ab.type));
  if (ab.owner_type)  p('owner_type', _rbQuote(ab.owner_type));
  const wen = _rbWhen(ab.when);
  if (wen)            p('when', wen);
  if (ab.hexes?.length)        p('hexes',        _grbStrArr(ab.hexes));
  if (ab.corporations?.length) p('corporations', _grbStrArr(ab.corporations));
  if (ab.count        != null) p('count',        String(ab.count));
  if (ab.count_per_or != null) p('count_per_or', String(ab.count_per_or));
  if (ab.cost         != null) p('cost',         String(ab.cost));
  if (ab.discount     != null) p('discount',     String(ab.discount));
  if (ab.amount       != null) p('amount',       String(ab.amount));
  if (ab.price        != null) p('price',        String(ab.price));
  if (ab.from != null)
    p('from', Array.isArray(ab.from) ? _grbStrArr(ab.from) : _rbQuote(ab.from));
  if (ab.terrain)              p('terrain',      _rbQuote(ab.terrain));
  if (ab.tiles?.length)        p('tiles',        _grbStrArr(ab.tiles));
  if (ab.corporation)          p('corporation',  _rbQuote(ab.corporation));
  if (ab.shares != null)       p('shares', Array.isArray(ab.shares) ? _grbStrArr(ab.shares) : _rbQuote(ab.shares));
  if (ab.description)          p('description',  _rbQuote(ab.description));
  if (ab.on_phase)             p('on_phase',     _rbQuote(ab.on_phase));
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
  lines.push(ii + 'name: '    + _rbQuote(priv.name || ''));
  lines.push(ii + 'value: '   + (priv.cost != null ? priv.cost : (priv.value || 0)));
  const rev = priv.revenue;
  if (Array.isArray(rev)) lines.push(ii + 'revenue: ' + _rbNumArr(rev));
  else                    lines.push(ii + 'revenue: ' + (rev != null ? rev : 0));
  const desc = priv.ability || priv.desc || '';
  if (desc) lines.push(ii + 'desc: ' + _rbQuote(desc));
  lines.push(ii + 'sym: ' + _rbQuote(priv.sym || priv.abbr || ''));
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
  lines.push(ii + 'sym: '  + _rbQuote(co.sym  || ''));
  lines.push(ii + 'name: ' + _rbQuote(co.name || ''));
  if (co.logo)  lines.push(ii + 'logo: ' + _rbQuote(co.logo));
  lines.push(ii + 'color: ' + _rbColor(co.color || '#666666'));
  if (co.textColor && !/^#fff/i.test(co.textColor))
    lines.push(ii + 'text_color: ' + _rbColor(co.textColor));
  lines.push(ii + 'tokens: ' + _rbNumArr(tokens));
  if (co.coordinates)
    lines.push(ii + 'coordinates: ' + _rbQuote(co.coordinates));
  if (co.city && parseInt(co.city) !== 0)
    lines.push(ii + 'city: ' + parseInt(co.city));
  if (co.destinationCoordinates)
    lines.push(ii + 'destination_coordinates: ' + _rbQuote(co.destinationCoordinates));
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

// ── Train/Phase serialisation helpers ────────────────────────────────────────

// Ruby `distance:` literal for a train object.
// Sources consulted before writing:
//   g_1830/game.rb (scalar distance)
//   g_1822/game.rb (nm array — city+town nodes)
//   g_1846/game.rb (xy array — city+offboard pay/visit split)
function _grbDistance(tr) {
  switch (tr.distType) {
    case 'nm':
      // City + town node array (1822 L-train pattern)
      return (
        `[\n` +
        `  { 'nodes' => ['city'], 'pay' => ${tr.n || 1}, 'visit' => ${tr.n || 1} },\n` +
        `  { 'nodes' => ['town'], 'pay' => ${tr.m || 1}, 'visit' => ${tr.m || 1} }\n` +
        `]`
      );
    case 'xy':
      // Pay X stops, visit Y stops — 1846-style split train (e.g. 3/5, 4/6)
      // TODO (Evan Q1): confirm node types — 1846 uses %w[city offboard];
      //   some games use %w[city town], check before extending to non-1846 games.
      return `[{ 'nodes' => %w[city offboard], 'pay' => ${tr.x || 2}, 'visit' => ${tr.y || 4} }]`;
    case 'u':
      // Unlimited/diesel — distance: 999 (g_1830 D-train convention)
      return '999';
    case 'h':
      // Hex-distance trains — TODO: identify tobymao Ruby format (no confirmed pattern)
      return String(tr.h || 4);
    default: // 'n'
      return String(tr.n || 2);
  }
}

// Ruby hash literal for a single TRAINS entry.
// variants: flat array of already-resolved sibling variant train objects (may be empty).
function _grbTrainHash(tr, variants, state) {
  const allTrains = (state && state.trains) || [];
  const label = (typeof calculateTrainLabel === 'function')
    ? calculateTrainLabel(tr) : (tr.label || '?');

  const kv = [];
  kv.push(`name: ${_rbQuote(label)}`);
  kv.push(`distance: ${_grbDistance(tr)}`);
  if (tr.cost != null)   kv.push(`price: ${tr.cost}`);
  // count semantics (see _rbParseTrain comments):
  //   null  → unlimited → emit num: 99
  //   0     → absent in source (dynamic) → omit num: entirely
  //   N > 0 → explicit → emit num: N
  if (tr.count === null)         kv.push('num: 99');
  else if (tr.count > 0)         kv.push(`num: ${tr.count}`);

  if (tr.rusts && tr.rustsOn) {
    const tgt = allTrains.find(t => t.id === tr.rustsOn);
    if (tgt) {
      const tgtLabel = (typeof calculateTrainLabel === 'function')
        ? calculateTrainLabel(tgt) : (tgt.label || '');
      kv.push(`rusts_on: ${_rbQuote(tgtLabel)}`);
    }
  }

  if (tr.events && tr.events.length) {
    const evStr = tr.events.map(ev => `{ 'type' => '${ev.type}' }`).join(', ');
    kv.push(`events: [${evStr}]`);
  }

  if (variants && variants.length) {
    const varLines = variants.map(vtr => {
      const vLabel = (typeof calculateTrainLabel === 'function')
        ? calculateTrainLabel(vtr) : (vtr.label || '?');
      const vKv = [`name: ${_rbQuote(vLabel)}`, `distance: ${_grbDistance(vtr)}`];
      // multiplier: required for E-train / revenue-doubling variants (g_1822 E-train)
      if (vtr.multiplier && vtr.multiplier > 1) vKv.push(`multiplier: ${vtr.multiplier}`);
      if (vtr.cost != null) vKv.push(`price: ${vtr.cost}`);
      if (vtr.rusts && vtr.rustsOn) {
        const vtgt = allTrains.find(t => t.id === vtr.rustsOn);
        if (vtgt) {
          const vtLabel = (typeof calculateTrainLabel === 'function')
            ? calculateTrainLabel(vtgt) : (vtgt.label || '');
          vKv.push(`rusts_on: ${_rbQuote(vtLabel)}`);
        }
      }
      return `    { ${vKv.join(', ')} }`;
    });
    kv.push(`variants: [\n${varLines.join(',\n')}\n  ]`);
  }

  // Single-line if ≤4 flat fields; multi-line otherwise
  const hasNL = kv.some(s => s.includes('\n'));
  if (!hasNL && kv.length <= 4) return `  { ${kv.join(', ')} }`;
  return '  {\n' + kv.map(s => {
    const ind = s.includes('\n')
      ? s.split('\n').map((l, i) => (i === 0 ? '    ' + l : '  ' + l)).join('\n')
      : '    ' + s;
    return ind;
  }).join(',\n') + ',\n  }';
}

// Ruby hash literal for a single PHASES entry.
function _grbPhaseHash(ph, state) {
  const allTrains = (state && state.trains) || [];
  const kv = [];
  kv.push(`name: ${_rbQuote(ph.name || '')}`);

  if (ph.onTrain) {
    const trig = allTrains.find(t => t.id === ph.onTrain);
    if (trig) {
      const tLabel = (typeof calculateTrainLabel === 'function')
        ? calculateTrainLabel(trig) : (trig.label || '');
      kv.push(`on: ${_rbQuote(tLabel)}`);
    }
  }

  // train_limit: integer OR { minor: N, major: M } hash.
  // ph.limitMinor (set by Farrah's parser) is non-null when source used hash form.
  if (ph.limitMinor !== null && ph.limitMinor !== undefined) {
    kv.push(`train_limit: { minor: ${ph.limitMinor}, major: ${ph.limit || 4} }`);
  } else {
    kv.push(`train_limit: ${ph.limit || 4}`);
  }

  // Tiles: cumulative progression — ph.tiles stores highest accessible color.
  // Source: g_1830/game.rb PHASES (each phase includes all lower colors).
  const TILE_PROG = {
    yellow: ['yellow'],
    green:  ['yellow', 'green'],
    brown:  ['yellow', 'green', 'brown'],
    grey:   ['yellow', 'green', 'brown', 'grey'],
    gray:   ['yellow', 'green', 'brown', 'grey'],
    blue:   ['yellow', 'green', 'brown', 'grey', 'blue'],  // 1870-style phases
  };
  const colors = TILE_PROG[ph.tiles] || ['yellow'];
  kv.push(colors.length === 1
    ? `tiles: [:${colors[0]}]`
    : `tiles: %i[${colors.join(' ')}]`
  );

  kv.push(`operating_rounds: ${ph.ors || 2}`);

  // status: string array — tobymao uses %w[...], not %i[...].
  // Source: g_1830/game.rb PHASES, g_1822/game.rb PHASES — confirmed %w usage.
  // TODO (Evan Q3): if any game uses symbol status keys (%i[...]), update here.
  if (ph.status && ph.status.length) {
    kv.push(`status: %w[${ph.status.join(' ')}]`);
  }

  return '  {\n' + kv.map(s => '    ' + s).join(',\n') + ',\n  }';
}

// ── Step-array Ruby literal (Addy, PR1b) ─────────────────────────────────────
// Serializes an ordered array of StepEntry objects into a Ruby array literal,
// matching tobymao formatting verified against:
//   lib/engine/game/g_1830/game.rb:177-202   (operating + stock)
//   lib/engine/game/g_1822/game.rb:1086-1106 (operating)
//   lib/engine/game/g_1822/game.rb:1302-1307 (stock)
//
// StepEntry = { class: string, opts?: object }
//   class: full Ruby class path, e.g. 'Engine::Step::Track' or
//          'G1830::Step::BuySellParShares'. Pass through verbatim — no <game>
//          substitution; caller resolves the game module first.
//   opts:  optional per-entry kwargs hash. Renders as `{ key: value, … }`.
//          Value types: boolean → true/false; number → as-is; string → 'quoted'.
//          For symbols/etc. callers must pre-stringify (e.g. ':foo' as a string).
//
// Returns a multi-line array literal. Entries indented `innerIndent` spaces
// (default 2 — tobymao convention). Trailing comma after every entry. Empty
// input → '[]' (single-line).
//
// Caller owns outer indentation. Typical embed:
//
//   const lit = _grbStepArrayLiteral(rounds.operating.steps);
//   return `def operating_round(round_num)\n` +
//          `  Engine::Round::Operating.new(self, ${lit.replace(/\n/g, '\n  ')}, round_num: round_num)\n` +
//          `end`;
//
// Examples (verified by hand against tobymao output):
//   []
//     → '[]'
//   [{class: 'Engine::Step::Track'}]
//     → '[\n  Engine::Step::Track,\n]'
//   [{class: 'Engine::Step::BuyCompany'},
//    {class: 'Engine::Step::BuyCompany', opts: {blocks: true}}]
//     → '[\n  Engine::Step::BuyCompany,\n' +
//       '  [Engine::Step::BuyCompany, { blocks: true }],\n]'
//   [{class: 'G1822::Step::PendingToken'},
//    {class: 'G1822::Step::PendingToken'}]
//     → '[\n  G1822::Step::PendingToken,\n  G1822::Step::PendingToken,\n]'
//     (duplicates preserved positionally — 1822 OR has PendingToken twice)
function _grbStepArrayLiteral(steps, innerIndent) {
  if (!Array.isArray(steps) || steps.length === 0) return '[]';
  const ind = ' '.repeat(innerIndent != null ? innerIndent : 2);
  const lines = ['['];
  steps.forEach(entry => {
    const cls  = entry.class || '';
    const opts = entry.opts;
    if (opts && Object.keys(opts).length > 0) {
      lines.push(ind + '[' + cls + ', ' + _grbStepOptsHash(opts) + '],');
    } else {
      lines.push(ind + cls + ',');
    }
  });
  lines.push(']');
  return lines.join('\n');
}

// Per-entry opts hash → `{ key: value, … }`. Single-line by tobymao convention
// (only `{ blocks: true }` appears in real games; no multi-line entry-opts hash
// has been observed). Spaces after `{`, before `}`, and after each `:` match
// the canonical formatting in g_1830 and base.rb.
function _grbStepOptsHash(opts) {
  const pairs = Object.entries(opts).map(([k, v]) => {
    let rb;
    if (typeof v === 'boolean')      rb = v ? 'true' : 'false';
    else if (typeof v === 'number')  rb = String(v);
    else if (typeof v === 'string')  rb = _rbQuote(v);
    else                             rb = String(v);  // fallback; symbols pre-stringified
    return k + ': ' + rb;
  });
  return '{ ' + pairs.join(', ') + ' }';
}

// ── Round-method helpers (Tim PR1a) ──────────────────────────────────────────
// Default round factories from tobymao base.rb (lib/engine/game/base.rb).
// Every Ruby literal emitted below traces to a specific source line:
//   init_round                base.rb:2626-2628  (returns new_auction_round)
//   new_auction_round         base.rb:3170-3175  ([CompanyPendingPar, WaterfallAuction])
//   stock_round               base.rb:3183-3190  ([DiscardTrain, Exchange, SpecialTrack,
//                                                  BuySellParShares])
//   operating_round(round_num) base.rb:3198-3212 ([Bankrupt, Exchange, SpecialTrack,
//                                                  BuyCompany, Track, Token, Route,
//                                                  Dividend, DiscardTrain, BuyTrain,
//                                                  [BuyCompany, {blocks: true}]])
//   next_round!               base.rb:2921-2943  (Stock → OR×N → Stock; init_round.class
//                                                  fallthrough)
// Round subclasses (lib/engine/round/):
//   auction.rb     select_entities = @game.players,        short_name 'ISR'
//   stock.rb       select_entities = @game.players.reject(&:bankrupt)
//   operating.rb   select_entities = @game.operating_order
//   draft.rb       opts: reverse_order, snake_order, rotating_order
//   merger.rb      round_name raises NotImplementedError (ABSTRACT — must subclass)
//   choices.rb     no select_entities default — effectively abstract

// Deep-compare a steps array against the base.rb default for a round type.
// Used so that pre-seeded step arrays (Addy's initRoundsState) still inherit
// silently from base.rb when the user hasn't modified them. Compares class
// strings positionally and opts hashes shallowly (sufficient since real
// engine steps use only `{ blocks: true }`-shaped opts).
function _grbStepsMatchDefault(steps, defaults) {
  if (!Array.isArray(steps) || !Array.isArray(defaults)) return false;
  if (steps.length !== defaults.length) return false;
  return steps.every((s, i) => {
    const d = defaults[i];
    if (s.class !== d.class) return false;
    const sOpts = s.opts || {};
    const dOpts = d.opts || {};
    const sKeys = Object.keys(sOpts);
    const dKeys = Object.keys(dOpts);
    if (sKeys.length !== dKeys.length) return false;
    return sKeys.every(k => sOpts[k] === dOpts[k]);
  });
}

// Initial-round class registry — designer choice → engine class.
const _GRB_INITIAL_CLASS = {
  auction:      'Engine::Round::Auction',
  draft:        'Engine::Round::Draft',
  stock_direct: null,                     // delegate to stock_round
  choices:      'Engine::Round::Choices',
};

// Format draft opts hash literal (round/draft.rb:11-15).
function _grbRoundOpts(opts) {
  if (!opts) return '';
  const pairs = [];
  if (opts.reverse_order)  pairs.push('reverse_order: true');
  if (opts.snake_order)    pairs.push('snake_order: true');
  if (opts.rotating_order) pairs.push('rotating_order: true');
  return pairs.join(', ');
}

// Wrap method body in `def name(args)\n  body\nend`. body is multi-line raw Ruby.
function _grbWrapMethod(name, args, body) {
  const head = args ? `def ${name}(${args})` : `def ${name}`;
  const indented = body.split('\n').map(l => l ? '  ' + l : l).join('\n');
  return head + '\n' + indented + '\nend';
}

// Inherit-from-base check. Steps arrays are now pre-seeded by initRoundsState
// from _BASE_RB_DEFAULTS (Addy's catalog) so her renderer is reactive against
// state, not synthesizing defaults at render time. To preserve the "vanilla =
// no Ruby emitted" promise, the emit helpers compare against the same defaults
// and return null when state matches them exactly.
function _grbInheritsBaseDefault(roundType, steps) {
  if (typeof _BASE_RB_DEFAULTS === 'undefined') return false;
  return _grbStepsMatchDefault(steps, _BASE_RB_DEFAULTS[roundType] || []);
}

// init_round — emit only when departing from base.rb:2626 default (which
// returns new_auction_round with [CompanyPendingPar, WaterfallAuction]).
function _grbInitRoundBody(rounds) {
  const r        = rounds.initial || {};
  const cls      = r.class || 'auction';
  const steps    = r.steps || [];
  const optsStr  = _grbRoundOpts(r.opts);
  const subclass = r.subclass;

  // Vanilla auction with no opts/subclass and steps either empty or matching
  // the base.rb default → inherit silently.
  if (cls === 'auction' && !optsStr && !subclass &&
      (steps.length === 0 || _grbInheritsBaseDefault('initial', steps))) {
    return null;
  }

  // No-auction games delegate to stock_round (1822 pattern, g_1822/game.rb:1055-1057).
  if (cls === 'stock_direct') return 'stock_round';

  const className = (subclass && subclass.name) || _GRB_INITIAL_CLASS[cls];
  if (!className) return `# TODO: unknown initial round class '${cls}'`;

  const parts = [_grbStepArrayLiteral(steps)];
  if (optsStr) parts.push(optsStr);
  return `${className}.new(self, ${parts.join(', ')})`;
}

// stock_round — emit only when subclass set or steps differ from base.rb:3183.
function _grbStockRoundBody(rounds) {
  const r        = rounds.stock || {};
  const steps    = r.steps || [];
  const subclass = r.subclass;
  if (!subclass && (steps.length === 0 || _grbInheritsBaseDefault('stock', steps))) return null;
  const className = (subclass && subclass.name) || 'Engine::Round::Stock';
  return `${className}.new(self, ${_grbStepArrayLiteral(steps)})`;
}

// operating_round(round_num) — emit only when subclass set or steps differ
// from base.rb:3198-3211.
function _grbOperatingRoundBody(rounds) {
  const r        = rounds.operating || {};
  const steps    = r.steps || [];
  const subclass = r.subclass;
  if (!subclass && (steps.length === 0 || _grbInheritsBaseDefault('operating', steps))) return null;
  const className = (subclass && subclass.name) || 'Engine::Round::Operating';
  return `${className}.new(self, ${_grbStepArrayLiteral(steps)}, round_num: round_num)`;
}

// new_merger_round — required when merger.enabled. Round::Merger is abstract
// (round/merger.rb:13), so we always reference the named subclass.
function _grbMergerRoundBody(merger) {
  const className = (merger.subclass && merger.subclass.name) || merger.name || 'Merger';
  return `${className}.new(self, ${_grbStepArrayLiteral(merger.steps || [])}, round_num: round_num)`;
}

// next_round! — emit only when departing from base.rb:2921-2943. Triggers:
// merger enabled (must splice merger round into the loop) or customNextRound
// override. For auction/draft/stock_direct/choices initial rounds, base's
// next_round! works as-is (init_round.class fallthrough at L2938 covers them).
function _grbNextRoundBody(rounds) {
  if (rounds.customNextRound && typeof rounds.customNextRound === 'string' && rounds.customNextRound.trim()) {
    return rounds.customNextRound;
  }
  if (!rounds.merger || !rounds.merger.enabled) return null;

  const merger     = rounds.merger;
  const mergerCls  = (merger.subclass && merger.subclass.name) || merger.name || 'Merger';
  const branches   = [];

  // SR → start OR set (mirrors base.rb:2924-2927).
  branches.push(`when Engine::Round::Stock`);
  branches.push(`  @operating_rounds = @phase.operating_rounds`);
  branches.push(`  reorder_players`);
  branches.push(`  new_operating_round`);

  // OR → next OR / merger / SR — branch on merger position+trigger.
  branches.push(`when Engine::Round::Operating`);
  if (merger.position === 'between_ors') {
    // 1817 (always) / 1867 (phase_in) pattern. g_1867/game.rb:905-911.
    branches.push(`  or_round_finished`);
    if (merger.trigger === 'phase_in' && merger.triggerCondition && merger.triggerCondition.phases && merger.triggerCondition.phases.length) {
      const phaseList = merger.triggerCondition.phases.map(p => `'${String(p).replace(/'/g, "\\'")}'`).join(', ');
      branches.push(`  if [${phaseList}].include?(phase.name)`);
      branches.push(`    new_merger_round(@round.round_num)`);
      branches.push(`  elsif @round.round_num < @operating_rounds`);
      branches.push(`    new_operating_round(@round.round_num + 1)`);
      branches.push(`  else`);
      branches.push(`    @turn += 1`);
      branches.push(`    or_set_finished`);
      branches.push(`    new_stock_round`);
      branches.push(`  end`);
    } else {
      // 1817-style — always splice merger after every OR.
      branches.push(`  new_merger_round(@round.round_num)`);
    }
  } else {
    // after_or_set / before_sr — merger fires once before next SR.
    branches.push(`  or_round_finished`);
    branches.push(`  if @round.round_num < @operating_rounds`);
    branches.push(`    new_operating_round(@round.round_num + 1)`);
    branches.push(`  else`);
    branches.push(`    or_set_finished`);
    branches.push(`    new_merger_round`);
    branches.push(`  end`);
  }

  // Merger → return to OR loop or advance to SR.
  branches.push(`when ${mergerCls}`);
  if (merger.position === 'between_ors') {
    branches.push(`  if @round.round_num < @operating_rounds`);
    branches.push(`    new_operating_round(@round.round_num + 1)`);
    branches.push(`  else`);
    branches.push(`    @turn += 1`);
    branches.push(`    or_set_finished`);
    branches.push(`    new_stock_round`);
    branches.push(`  end`);
  } else {
    branches.push(`  @turn += 1`);
    branches.push(`  new_stock_round`);
  }

  // init_round.class fallthrough (base.rb:2938-2941) — covers
  // Auction/Draft/Choices first-round-only transition into SR.
  branches.push(`when init_round.class`);
  branches.push(`  init_round_finished`);
  branches.push(`  reorder_players`);
  branches.push(`  new_stock_round`);

  return `@round =\n  case @round\n  ${branches.join('\n  ')}\n  end`;
}

// Custom subclass class definitions — emitted into round_methods slot before
// the factory methods so the classes are defined when the factories reference
// them. Bodies are user-provided raw Ruby; for merger, an automatic
// `self.round_name` override is supplied if the user didn't include one.
function _grbCustomSubclasses(rounds) {
  const blocks = [];
  const candidates = [
    { key: 'initial',   parent: _GRB_INITIAL_CLASS[(rounds.initial && rounds.initial.class) || 'auction'] || 'Engine::Round::Auction' },
    { key: 'stock',     parent: 'Engine::Round::Stock' },
    { key: 'operating', parent: 'Engine::Round::Operating' },
  ];
  candidates.forEach(({ key, parent }) => {
    const r = rounds[key];
    if (!r || !r.subclass || !r.subclass.body) return;
    const name = r.subclass.name || `Custom${key.charAt(0).toUpperCase() + key.slice(1)}`;
    const body = _grbIndent(2, r.subclass.body);
    blocks.push(`# Custom ${key}-round subclass.\nclass ${name} < ${parent}\n${body}\nend`);
  });
  if (rounds.merger && rounds.merger.enabled) {
    const m = rounds.merger;
    const name = (m.subclass && m.subclass.name) || m.name || 'Merger';
    let body = (m.subclass && m.subclass.body) || '';
    // Merger is abstract — round_name MUST be defined. If user didn't include
    // it, supply the default from m.name.
    if (!/def\s+self\.round_name/.test(body)) {
      const roundName = (m.name || 'Merger').replace(/'/g, "\\'");
      const auto = `def self.round_name\n  '${roundName}'\nend`;
      body = body.trim() ? body.trim() + '\n\n' + auto : auto;
    }
    body = _grbIndent(2, body);
    blocks.push(`# Merger round subclass — Engine::Round::Merger is abstract\n# (round/merger.rb:13 raises NotImplementedError on round_name).\nclass ${name} < Engine::Round::Merger\n${body}\nend`);
  }
  return blocks.length ? blocks.join('\n\n') : null;
}

// ── Module registry ───────────────────────────────────────────────────────────
// Each module: { id: string, emit(state) → { slotName: string, … } | null }
// A module returning { bank: '...', methods: '...' } contributes to two slots.
// Multiple modules targeting the same slot are joined with \n\n.

const _GRB_MODULES = [

  // ── Trains ───────────────────────────────────────────────────────────────────
  // Emits TRAINS = [...].freeze from state.trains[].
  // Variants (flagged isVariant: true on import) are re-nested under their parent.
  // Private/granted trains (privateOnly) are still emitted in TRAINS — the engine
  // requires them there even when they're pre-allocated via @company_trains in setup.
  {
    id: 'trains',
    emit(state) {
      const trains = state.trains || [];
      const topLevel = trains.filter(tr => !tr.isVariant);
      if (!topLevel.length) return null;
      const lines = ['TRAINS = ['];
      topLevel.forEach((tr, i) => {
        const variants = trains.filter(v => v.isVariant && v.parentId === tr.id);
        lines.push(_grbTrainHash(tr, variants, state) + (i < topLevel.length - 1 ? ',' : ''));
      });
      lines.push('].freeze');
      return { trains: lines.join('\n') };
    },
  },

  // ── Phases ───────────────────────────────────────────────────────────────────
  // Emits PHASES = [...].freeze from state.phases[].
  {
    id: 'phases',
    emit(state) {
      const phases = state.phases || [];
      if (!phases.length) return null;
      const lines = ['PHASES = ['];
      phases.forEach((ph, i) => {
        lines.push(_grbPhaseHash(ph, state) + (i < phases.length - 1 ? ',' : ''));
      });
      lines.push('].freeze');
      return { phases: lines.join('\n') };
    },
  },

  // ── Bank & Players ──────────────────────────────────────────────────────────
  {
    id: 'bank',
    emit(state) {
      const m      = state.mechanics || {};
      const min    = m.minPlayers ?? 2;
      const max    = m.maxPlayers ?? 6;
      const pRange = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      const lines  = [];

      lines.push(`PLAYERS_RANGE = [${min}, ${max}]`);
      lines.push(`BANK_CASH = ${_rbCashNum(m.bankCash ?? 12000)}`);
      if (m.currency && m.currency !== '$%s')
        lines.push(`CURRENCY_FORMAT_STR = '${m.currency}'`);

      const sc  = m.startingCash || {};
      lines.push(`STARTING_CASH = { ${pRange.map(p => `${p} => ${sc[p] ?? 0}`).join(', ')} }.freeze`);

      const cl  = m.certLimit || {};
      lines.push(`CERT_LIMIT = { ${pRange.map(p => `${p} => ${cl[p] ?? 0}`).join(', ')} }.freeze`);

      return { bank: lines.join('\n') };
    },
  },

  // ── Corporation Rules ────────────────────────────────────────────────────────
  {
    id: 'corp_rules',
    emit(state) {
      const m = state.mechanics || {};
      // FLOAT_PERCENT is not a real engine constant — float_percent is per-corp in entities.rb.
      const lines = [
        `CAPITALIZATION = :${m.capitalization || 'full'}`,
        `HOME_TOKEN_TIMING = :${m.homeTokenTiming || 'operate'}`,
        `MARKET_SHARE_LIMIT = ${m.marketShareLimit ?? 50}`,
        `TRACK_RESTRICTION = :${m.trackRestriction || 'semi_restrictive'}`,
        `BANKRUPTCY_ALLOWED = ${m.bankruptcyAllowed ?? true}`,
        `BANKRUPTCY_ENDS_GAME_AFTER = :${m.bankruptcyEndsGameAfter || 'one'}`,
      ];
      return { corp_rules: lines.join('\n') };
    },
  },

  // ── Stock Round ──────────────────────────────────────────────────────────────
  {
    id: 'stock_round',
    emit(state) {
      const m = state.mechanics || {};
      const lines = [
        `SELL_BUY_ORDER = :${m.sellBuyOrder || 'sell_buy_or_buy_sell'}`,
        `SELL_MOVEMENT = :${m.sellMovement || 'down_share'}`,
        `POOL_SHARE_DROP = :${m.poolShareDrop || 'none'}`,
        `MUST_SELL_IN_BLOCKS = ${m.mustSellInBlocks ?? false}`,
        `SELL_AFTER = :${m.sellAfter || 'first'}`,
      ];
      // SOLD_OUT_TOP_ROW_MOVEMENT has no panel framework item — keep conditional
      if ((m.soldOutTopRowMovement || 'none') !== 'none')
        lines.push(`SOLD_OUT_TOP_ROW_MOVEMENT = :${m.soldOutTopRowMovement}`);
      return { stock_round: lines.join('\n') };
    },
  },

  // ── Operating Round ──────────────────────────────────────────────────────────
  {
    id: 'or_rules',
    emit(state) {
      const m = state.mechanics || {};
      const loan = m.ebuyCanTakePlayerLoan;
      const loanOn = loan && loan !== 'false' && loan !== false;
      const lines = [
        `MUST_BUY_TRAIN = :${m.mustBuyTrain || 'route'}`,
        `ALLOW_REMOVING_TOWNS = ${m.allowRemovingTowns ?? false}`,
        `EBUY_FROM_OTHERS = :${m.ebuyFromOthers || 'value'}`,
        `EBUY_DEPOT_TRAIN_MUST_BE_CHEAPEST = ${m.ebuyDepotCheapest ?? true}`,
        `MUST_EMERGENCY_ISSUE_BEFORE_EBUY = ${m.mustIssueBeforeEbuy ?? false}`,
        `EBUY_OWNER_MUST_HELP = ${m.ebuyOwnerMustHelp ?? false}`,
        `EBUY_CAN_SELL_SHARES = ${m.ebuyCanSellShares ?? true}`,
        `EBUY_PRES_SWAP = ${m.ebuyPresSwap ?? true}`,
        `EBUY_CAN_TAKE_PLAYER_LOAN = ${loanOn ? ':' + loan : false}`,
      ];
      if (loanOn) {
        lines.push(`PLAYER_LOAN_INTEREST_RATE = ${m.playerLoanInterestRate ?? 50}`);
        lines.push(`PLAYER_LOAN_ENDGAME_PENALTY = ${m.playerLoanEndgamePenalty ?? 0}`);
      }
      lines.push('');
      const defSlots = m.tileLays?.default || [_GRB_DEFAULT_TILE_LAY];
      lines.push(`TILE_LAYS = [${defSlots.map(_rbTileSlot).join(', ')}].freeze`);
      if (m.tileLays?.byType?.major)
        lines.push(`MAJOR_TILE_LAYS = [${m.tileLays.byType.major.map(_rbTileSlot).join(', ')}].freeze`);
      if (m.tileLays?.byType?.minor)
        lines.push(`MINOR_TILE_LAYS = [${m.tileLays.byType.minor.map(_rbTileSlot).join(', ')}].freeze`);
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
        lines.push(`  @${mName} ||= company_by_id(${_rbQuote(priv.sym || priv.abbr || '')})`);
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

  // ── Round Methods (Tim PR1a) ─────────────────────────────────────────────────
  // Emits def init_round / def stock_round / def operating_round / def next_round!
  // and custom round subclass definitions into {{SLOT_ROUND_METHODS}}. Emit only
  // when the user has actively customized a round — empty step lists, vanilla
  // class, no subclass, no merger = no Ruby produced (1830-vanilla case).
  {
    id: 'round_methods',
    emit(state) {
      const rounds = (state.mechanics && state.mechanics.rounds) || {};
      const out = [];

      const subclasses = _grbCustomSubclasses(rounds);
      if (subclasses) out.push(subclasses);

      const initBody = _grbInitRoundBody(rounds);
      if (initBody !== null) out.push(_grbWrapMethod('init_round', null, initBody));

      const stockBody = _grbStockRoundBody(rounds);
      if (stockBody !== null) out.push(_grbWrapMethod('stock_round', null, stockBody));

      const orBody = _grbOperatingRoundBody(rounds);
      if (orBody !== null) out.push(_grbWrapMethod('operating_round', 'round_num', orBody));

      if (rounds.merger && rounds.merger.enabled) {
        const mergerBody = _grbMergerRoundBody(rounds.merger);
        out.push(_grbWrapMethod('new_merger_round', 'round_num = 1', mergerBody));
      }

      const nextBody = _grbNextRoundBody(rounds);
      if (nextBody !== null) out.push(_grbWrapMethod('next_round!', null, nextBody));

      if (!out.length) return null;
      return { round_methods: out.join('\n\n') };
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

        # ── Trains ───────────────────────────────────────────────────────────
{{SLOT_TRAINS}}

        # ── Phases ───────────────────────────────────────────────────────────
{{SLOT_PHASES}}

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

        # ── Round Methods ─────────────────────────────────────────────────────
{{SLOT_ROUND_METHODS}}

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

// ── meta.rb emitter ───────────────────────────────────────────────────────────
// Game::Meta is a Module in tobymao, not a Class — `class Meta < Game::Meta`
// raises TypeError at load time.  Correct pattern: `module Meta; include Game::Meta`.
// Verified against lib/engine/game/g_18_chesapeake/meta.rb in 18xx-master.
function _grbMetaRb(state) {
  const modName = _grbModuleName(state);
  const title   = state?.meta?.title || modName;
  return `# frozen_string_literal: true
# Generated by 18xxtools — edit freely

require_relative '../meta'

module Engine
  module Game
    module ${modName}
      module Meta
        include Game::Meta

        DEV_STAGE = :alpha

        GAME_TITLE = ${_rbQuote(title)}
      end
    end
  end
end
`;
}

function renderMetaRb() {
  if (typeof state === 'undefined')
    return '# No state loaded.\n';
  return _grbMetaRb(state);
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

document.getElementById('exportMetaBtn').addEventListener('click', () => {
  try {
    const src  = renderMetaRb();
    const slug = _grbModuleName(state).toLowerCase();
    _grbDownload(src, slug + '_meta.rb');
    if (typeof updateStatus === 'function') updateStatus('Exported ' + slug + '_meta.rb');
  } catch (err) {
    console.error('[renderMetaRb]', err);
    alert('Export failed: ' + err.message);
  }
});
