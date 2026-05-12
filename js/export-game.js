// js/export-game.js  v20260509l
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

// MARKET row → Ruby literal. Picks %w[…] when every cell is non-empty and
// contains no whitespace/quotes (the safe characters for a %w array). Falls
// back to ['', 'cell', …] when the row contains LEADING empties (1822-style
// sparse top rows). Trailing empties are trimmed — tobymao's convention is
// variable-length rows where missing right-side columns simply don't exist.
function _grbMarketRow(row) {
  let cells = (row || []).map(c => c == null ? '' : String(c));
  // Strip trailing empties so the emitted row matches tobymao source shape.
  while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
  if (cells.length === 0) return '[]';
  const hasEmpty = cells.some(c => c === '');
  const hasUnsafe = cells.some(c => /[\s'"]/.test(c));
  if (!hasEmpty && !hasUnsafe) {
    return '%w[' + cells.join(' ') + ']';
  }
  return '[' + cells.map(c => `'${c.replace(/'/g, "\\'")}'`).join(', ') + ']';
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
  if (s.cost != null)              p.push(`cost: ${s.cost}`);
  if (s.upgrade_cost != null)      p.push(`upgrade_cost: ${s.upgrade_cost}`);
  if (s.cannot_reuse_same_hex)     p.push('cannot_reuse_same_hex: true');
  if (s.hex_must_be_connected === false) p.push('hex_must_be_connected: false');
  if (s.special)                   p.push('special: true');
  return '{ ' + p.join(', ') + ' }';
}

// ── Ability hash → Ruby literal ───────────────────────────────────────────────
// Thin delegate to the shared serializer in js/serialize-ability.js. The
// serializer's per-type allowlist is derived from lib/engine/ability/*.rb
// `setup` signatures, replacing the prior pattern of two parallel emitters
// (this and _eiAbilityLine in export-entities.js) that drifted independently
// and required synchronised type-gating patches for shares:, revenue:, etc.
function _rbAbility(ab) {
  return _serializeAbility(ab, {
    quote:  _rbQuote,
    strArr: _grbStrArr,
    when:   _rbWhen,
  });
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
  lines.push(ii + 'name: '    + _rbQuote(priv.name || '') + ',');
  lines.push(ii + 'value: '   + (priv.cost != null ? priv.cost : (priv.value || 0)) + ',');
  const rev = priv.revenue;
  if (Array.isArray(rev)) lines.push(ii + 'revenue: ' + _rbNumArr(rev) + ',');
  else                    lines.push(ii + 'revenue: ' + (rev != null ? rev : 0) + ',');
  const desc = priv.ability || priv.desc || '';
  if (desc) lines.push(ii + 'desc: ' + _rbQuote(desc) + ',');
  lines.push(ii + 'sym: ' + _rbQuote(priv.sym || priv.abbr || '') + ',');
  if (priv.minPrice != null) lines.push(ii + 'min_price: ' + priv.minPrice + ',');
  if (priv.maxPrice != null) lines.push(ii + 'max_price: ' + priv.maxPrice + ',');
  if (priv.color && !/^#(000|666)/.test(priv.color))
    lines.push(ii + 'color: ' + _rbColor(priv.color) + ',');
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
  const rawTok   = co.tokensOverride   != null ? co.tokensOverride   : (pack.tokens || [0, 40, 100]);
  // tokens may arrive as a count (e.g. 3) rather than a cost array — normalize
  const tokens   = Array.isArray(rawTok) ? rawTok
                 : (typeof rawTok === 'number' && rawTok < 20) ? new Array(rawTok).fill(0)
                 : rawTok;
  const shares   = pack.shares || [20, 10, 10, 10, 10, 10, 10, 10, 10];
  const cap      = pack.capitalization  || 'full';
  const maxOwn   = pack.maxOwnershipPct ?? 60;
  const amp      = pack.alwaysMarketPrice || false;
  const coord    = co.coordinates || co.homeHex || '';
  lines.push(i + '{');
  lines.push(ii + 'sym: '  + _rbQuote(co.sym  || '') + ',');
  lines.push(ii + 'name: ' + _rbQuote(co.name || '') + ',');
  if (co.logo)  lines.push(ii + 'logo: ' + _rbQuote(co.logo) + ',');
  lines.push(ii + 'color: ' + _rbColor(co.color || '#666666') + ',');
  if (co.textColor && !/^#fff/i.test(co.textColor))
    lines.push(ii + 'text_color: ' + _rbColor(co.textColor) + ',');
  lines.push(ii + 'tokens: ' + _rbNumArr(tokens) + ',');
  if (co.coordinates)
    lines.push(ii + 'coordinates: ' + _rbQuote(co.coordinates) + ',');
  if (co.city && parseInt(co.city) !== 0)
    lines.push(ii + 'city: ' + parseInt(co.city) + ',');
  if (co.destinationCoordinates)
    lines.push(ii + 'destination_coordinates: ' + _rbQuote(co.destinationCoordinates) + ',');
  if (JSON.stringify(shares) !== _RB_DEFAULT_SHARES)
    lines.push(ii + 'shares: ' + _rbNumArr(shares) + ',');
  if (floatPct !== 60)
    lines.push(ii + 'float_percent: ' + floatPct + ',');
  if (maxOwn !== 60)
    lines.push(ii + 'max_ownership_percent: ' + maxOwn + ',');
  if (amp)
    lines.push(ii + 'always_market_price: true,');
  if (cap !== gameCap)
    lines.push(ii + 'capitalization: :' + cap + ',');
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
      return String(tr.n != null ? tr.n : 2);
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
  //   0     → absent in source (count unknown) → emit num: 99 as safe default
  //           (omitting num: entirely causes Array.new(nil) TypeError in base.rb:2661)
  //   N > 0 → explicit → emit num: N
  if (tr.count === null)         kv.push('num: 99');
  else if (tr.count === 0)       kv.push('num: 99');
  else                           kv.push(`num: ${tr.count}`);

  if (tr.multiplier && tr.multiplier > 1) kv.push(`multiplier: ${tr.multiplier}`);

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
      if (vtr.count === null)  vKv.push('num: 99');
      else if (vtr.count > 0)  vKv.push(`num: ${vtr.count}`);
      if (vtr.cost != null) vKv.push(`price: ${vtr.cost}`);
      if (vtr.rusts && vtr.rustsOn) {
        const vtgt = allTrains.find(t => t.id === vtr.rustsOn);
        if (vtgt) {
          const vtLabel = (typeof calculateTrainLabel === 'function')
            ? calculateTrainLabel(vtgt) : (vtgt.label || '');
          vKv.push(`rusts_on: ${_rbQuote(vtLabel)}`);
        }
      }
      if (vtr.available_on) vKv.push(`available_on: ${_rbQuote(vtr.available_on)}`);
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
    // Use quoted array when any value contains a space (%w[] would split on it)
    if (ph.status.some(s => String(s).includes(' ')))
      kv.push(`status: [${ph.status.map(s => `'${s}'`).join(', ')}]`);
    else
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
// Returns the user-typed Round End body for a slot (post-migration), or '' if
// the slot has no endHook / empty body. Cutover-tolerant: also reads the
// legacy `slot.subclass.body` if `slot.endHook` is missing.
function _grbReadEndHookBody(slot) {
  if (!slot) return '';
  if (slot.endHook && typeof slot.endHook.body === 'string')   return slot.endHook.body;
  if (slot.subclass && typeof slot.subclass.body === 'string') return slot.subclass.body;
  return '';
}

function _grbReadEndHookName(slot, fallback) {
  if (!slot) return fallback || '';
  if (slot.endHook && slot.endHook.name)  return slot.endHook.name;
  if (slot.subclass && slot.subclass.name) return slot.subclass.name;
  return fallback || '';
}

function _grbReadTransitionHookBody(slot) {
  if (!slot) return '';
  if (slot.transitionHook && typeof slot.transitionHook.body === 'string') return slot.transitionHook.body;
  return '';
}

// init_round — emit when class != auction, opts non-default, endHook present,
// or steps differ from base.rb:3170 default.
function _grbInitRoundBody(rounds) {
  const r           = rounds.initial || {};
  const cls         = r.class || 'auction';
  const steps       = r.steps || [];
  const optsStr     = _grbRoundOpts(r.opts);
  const endBody     = _grbReadEndHookBody(r).trim();
  const hasEndHook  = !!endBody;

  // Vanilla auction with no opts, no endHook, and steps either empty or
  // matching base.rb default → inherit silently.
  if (cls === 'auction' && !optsStr && !hasEndHook &&
      (steps.length === 0 || _grbInheritsBaseDefault('initial', steps))) {
    return null;
  }

  // No-auction games delegate to stock_round (1822 pattern, g_1822/game.rb:1055-1057).
  if (cls === 'stock_direct') return 'stock_round';

  // Subclass naming: when endHook content exists, the factory references the
  // user-named subclass. Otherwise it references the engine class directly.
  const className = hasEndHook
    ? _grbReadEndHookName(r, _grbCapitalize(cls))
    : _GRB_INITIAL_CLASS[cls];
  if (!className) {
    return `raise NotImplementedError, "Unknown initial round class '${cls}'. Edit Tier A on the Initial sub-tab or paste a custom subclass body."`;
  }

  const parts = [_grbStepArrayLiteral(steps)];
  if (optsStr) parts.push(optsStr);
  return `${className}.new(self, ${parts.join(', ')})`;
}

// stock_round — emit when endHook present or steps differ from base.rb:3183.
function _grbStockRoundBody(rounds) {
  const r           = rounds.stock || {};
  const steps       = r.steps || [];
  const endBody     = _grbReadEndHookBody(r).trim();
  const hasEndHook  = !!endBody;
  if (!hasEndHook && (steps.length === 0 || _grbInheritsBaseDefault('stock', steps))) return null;
  const className   = hasEndHook ? _grbReadEndHookName(r, 'Stock') : 'Engine::Round::Stock';
  return `${className}.new(self, ${_grbStepArrayLiteral(steps)})`;
}

// operating_round(round_num) — emit when steps differ from base.rb:3198-3211.
// NOTE: OR endHook routes to `def or_round_finished` on the GAME class (see
// _grbOrRoundFinishedBody), not a round subclass. So an OR-tab endHook by
// itself does NOT trigger factory emission — only step-list customization does.
function _grbOperatingRoundBody(rounds) {
  const r     = rounds.operating || {};
  const steps = r.steps || [];
  if (steps.length === 0 || _grbInheritsBaseDefault('operating', steps)) return null;
  return `Engine::Round::Operating.new(self, ${_grbStepArrayLiteral(steps)}, round_num: round_num)`;
}

// new_merger_round — emitted when merger.enabled. Round::Merger is abstract
// (round/merger.rb:13), so we always reference the named subclass.
function _grbMergerRoundBody(merger) {
  const className = _grbReadEndHookName(merger, merger.name || 'Merger');
  return `${className}.new(self, ${_grbStepArrayLiteral(merger.steps || [])}, round_num: round_num)`;
}

// or_round_finished — emit on the GAME class (not a round subclass) when the
// Operating tab's endHook.body is non-empty. 1817/1867 pattern.
function _grbOrRoundFinishedBody(rounds) {
  const body = _grbReadEndHookBody(rounds.operating).trim();
  if (!body) return null;
  // If the user typed the full def-block (post-migration content), strip the
  // outer `def or_round_finished ... end` so _grbWrapMethod can re-wrap it.
  // Otherwise emit the bare body verbatim.
  return _grbStripOuterDefIfMatches(body, 'or_round_finished');
}

function _grbCapitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// If `body` consists of a single `def NAME ... end` block (post-migration
// shape), return the unwrapped inner body so callers can re-wrap with their
// own `def`. Otherwise return body unchanged. Conservative — only strips if
// the outer block is unambiguous and matches the expected method name.
function _grbStripOuterDefIfMatches(body, methodName) {
  const re = new RegExp('^\\s*def\\s+(?:self\\.)?' + methodName + '\\b[^\\n]*\\n([\\s\\S]*)\\n\\s*end\\s*$');
  const m = body.match(re);
  if (!m) return body;
  // Strip 2 leading spaces from each line (the indent _grbWrapMethod will re-add).
  return m[1].split('\n').map(l => l.replace(/^ {2}/, '')).join('\n');
}

// next_round! — emit only when departing from base.rb:2921-2943. Triggers:
//   - any tab has transitionHook.body content (per-tab override)
//   - merger enabled (must splice merger round into the loop)
//   - legacy customNextRound override
// For auction/draft/stock_direct/choices initial rounds with no other
// customization, base's next_round! works as-is.
//
// Per-tab transitionHook bodies become individual `when` branches in the
// assembled `def next_round!`. Tabs without transitionHook content fall back
// to a synthesized vanilla branch.
function _grbNextRoundBody(rounds) {
  // Legacy escape hatch: if a fully-formed customNextRound string is present,
  // emit it verbatim. Pre-migration saves may carry this; post-migration the
  // user authors via per-tab transitionHook.
  if (rounds.customNextRound && typeof rounds.customNextRound === 'string' && rounds.customNextRound.trim()) {
    return rounds.customNextRound;
  }

  const initTrans   = _grbReadTransitionHookBody(rounds.initial).trim();
  const stockTrans  = _grbReadTransitionHookBody(rounds.stock).trim();
  const opTrans     = _grbReadTransitionHookBody(rounds.operating).trim();
  const mergerTrans = _grbReadTransitionHookBody(rounds.merger).trim();
  const anyTrans    = !!(initTrans || stockTrans || opTrans || mergerTrans);

  const mergerEnabled = !!(rounds.merger && rounds.merger.enabled);
  if (!anyTrans && !mergerEnabled) return null;

  const mergerCls = mergerEnabled
    ? _grbReadEndHookName(rounds.merger, rounds.merger.name || 'Merger')
    : null;

  const branches = [];

  // ── when Engine::Round::Stock ─────────────────────────────────────────────
  branches.push(`when Engine::Round::Stock`);
  if (stockTrans) {
    stockTrans.split('\n').forEach(l => branches.push('  ' + l));
  } else {
    // Vanilla SR → start OR set (base.rb:2924-2927).
    branches.push(`  @operating_rounds = @phase.operating_rounds`);
    branches.push(`  reorder_players`);
    branches.push(`  new_operating_round`);
  }

  // ── when Engine::Round::Operating ─────────────────────────────────────────
  branches.push(`when Engine::Round::Operating`);
  if (opTrans) {
    opTrans.split('\n').forEach(l => branches.push('  ' + l));
  } else if (mergerEnabled && rounds.merger.position === 'between_ors') {
    // 1817 / 1867 pattern. g_1867/game.rb:905-911.
    branches.push(`  or_round_finished`);
    if (rounds.merger.trigger === 'phase_in' && rounds.merger.triggerCondition && rounds.merger.triggerCondition.phases && rounds.merger.triggerCondition.phases.length) {
      const phaseList = rounds.merger.triggerCondition.phases.map(p => `'${String(p).replace(/'/g, "\\'")}'`).join(', ');
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
      branches.push(`  new_merger_round(@round.round_num)`);
    }
  } else if (mergerEnabled) {
    // after_or_set / before_sr — merger fires once before next SR.
    branches.push(`  or_round_finished`);
    branches.push(`  if @round.round_num < @operating_rounds`);
    branches.push(`    new_operating_round(@round.round_num + 1)`);
    branches.push(`  else`);
    branches.push(`    or_set_finished`);
    branches.push(`    new_merger_round`);
    branches.push(`  end`);
  } else {
    // Vanilla (base.rb:2929-2937).
    branches.push(`  if @round.round_num < @operating_rounds`);
    branches.push(`    or_round_finished`);
    branches.push(`    new_operating_round(@round.round_num + 1)`);
    branches.push(`  else`);
    branches.push(`    @turn += 1`);
    branches.push(`    or_round_finished`);
    branches.push(`    or_set_finished`);
    branches.push(`    new_stock_round`);
    branches.push(`  end`);
  }

  // ── when <MergerClass> (when merger enabled) ─────────────────────────────
  if (mergerEnabled) {
    branches.push(`when ${mergerCls}`);
    if (mergerTrans) {
      mergerTrans.split('\n').forEach(l => branches.push('  ' + l));
    } else if (rounds.merger.position === 'between_ors') {
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
  }

  // ── when init_round.class — fallthrough for first-round transition ───────
  branches.push(`when init_round.class`);
  if (initTrans) {
    initTrans.split('\n').forEach(l => branches.push('  ' + l));
  } else {
    branches.push(`  init_round_finished`);
    branches.push(`  reorder_players`);
    branches.push(`  new_stock_round`);
  }

  return `@round =\n  case @round\n  ${branches.join('\n  ')}\n  end`;
}

// Custom round-subclass class definitions — emitted into the round_methods
// slot before the factory methods so the classes are defined when the
// factories reference them.
//
// Per-tab routing (matches js/rounds-panel.js _END_HOOK_TARGETS):
//   initial   → def setup        on G<game>::Round::<Name> < Engine::Round::<Class>
//   stock     → def finish_round on G<game>::Round::<Name> < Engine::Round::Stock
//   merger    → def finish_round on G<game>::Round::<Name> < Engine::Round::Merger
//   operating → NOT in this function — emits as def or_round_finished on the
//               game class via _grbOrRoundFinishedBody (no subclass).
//
// endHook.body shape: bare statements (Addy's UI placeholder convention) OR
// pre-wrapped def-blocks (post-migration content). We detect via a regex and
// either pass through or wrap with the per-tab method name.
function _grbCustomSubclasses(rounds) {
  const blocks = [];

  const tabs = [
    { key: 'initial',   wrapMethod: 'setup',        parentResolve: r => _GRB_INITIAL_CLASS[(r && r.class) || 'auction'] || 'Engine::Round::Auction' },
    { key: 'stock',     wrapMethod: 'finish_round', parentResolve: () => 'Engine::Round::Stock' },
    // operating is intentionally absent — its endHook routes to or_round_finished on the game class.
  ];

  tabs.forEach(({ key, wrapMethod, parentResolve }) => {
    const r       = rounds[key];
    const endBody = _grbReadEndHookBody(r).trim();
    if (!endBody) return;
    const parent  = parentResolve(r);
    const name    = _grbReadEndHookName(r, _grbCapitalize(key));
    const wrapped = _grbWrapAsMethodBody(endBody, wrapMethod);
    const indented = _grbIndent(2, wrapped);
    blocks.push(`# Custom ${key}-round subclass.\nclass ${name} < ${parent}\n${indented}\nend`);
  });

  if (rounds.merger && rounds.merger.enabled) {
    const m       = rounds.merger;
    const name    = _grbReadEndHookName(m, m.name || 'Merger');
    let endBody   = _grbReadEndHookBody(m);
    let wrapped   = _grbWrapAsMethodBody(endBody, 'finish_round', { allowEmpty: true });

    // Merger is abstract — round_name MUST be defined. Auto-supply if missing.
    if (!/def\s+self\.round_name/.test(wrapped)) {
      const roundName = (m.name || 'Merger').replace(/'/g, "\\'");
      const auto = `def self.round_name\n  '${roundName}'\nend`;
      wrapped = wrapped.trim() ? wrapped.trim() + '\n\n' + auto : auto;
    }

    const indented = _grbIndent(2, wrapped);
    blocks.push(`# Merger round subclass — Engine::Round::Merger is abstract\n# (round/merger.rb:13 raises NotImplementedError on round_name).\nclass ${name} < Engine::Round::Merger\n${indented}\nend`);
  }

  return blocks.length ? blocks.join('\n\n') : null;
}

// Wrap user-typed body content as a Ruby method definition, OR pass through
// verbatim if the body already contains one or more `def NAME ... end` blocks.
// Used for both Round End emission (subclass body) and OR or_round_finished.
//
// opts.allowEmpty: if true, return '' on empty/whitespace input rather than
// emitting a method with an empty body. Used for merger where the auto
// round_name override may be the only required content.
function _grbWrapAsMethodBody(body, methodName, opts) {
  const text = (body || '').trim();
  if (!text) return (opts && opts.allowEmpty) ? '' : `def ${methodName}\nend`;
  // If the body already has at least one top-level method def, emit verbatim.
  if (/^\s*def\s+/m.test(body)) return text;
  // Bare statements — wrap in `def methodName ... end` with 2-space indent.
  return `def ${methodName}\n${_grbIndent(2, text)}\nend`;
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

  // ── Market ──────────────────────────────────────────────────────────────────
  // Emits MARKET = [...].freeze from state.financials.market.
  // Row form follows tobymao convention:
  //   • %w[a b c]      when no row cell is empty (1830, 1846, 1862 typical rows)
  //   • ['', 'a', '', 'b']  when the row contains empty cells (1822 sparse top rows)
  // For 1D / zigzag markets (state.financials.market is a flat array), wrap as
  // a single-row 2D so the array literal matches the engine's `market.map.with_index`.
  // Also emits init_stock_market override when marketType is 'zigzag' or hex_market
  // is set, since those movement classes are opt-in via the constructor (not a constant).
  {
    id: 'market',
    emit(state) {
      const f = state.financials || {};
      const m = f.market;
      if (!Array.isArray(m) || m.length === 0) return null;

      const rows = Array.isArray(m[0]) ? m : [m];   // promote 1D to single-row 2D
      const lines = ['MARKET = ['];
      rows.forEach((row, i) => {
        lines.push('  ' + _grbMarketRow(row) + (i < rows.length - 1 ? ',' : ''));
      });
      lines.push('].freeze');
      const out = { market: lines.join('\n') };

      // Movement-class override.  For zigzag, pass `zigzag: true` and
      // `ledge_movement: true` (which we capture on import). For hex_market,
      // pass `hex_market: true`. Standard 2D / 1D inherit the engine default.
      const wantZigzag = f.marketType === 'zigzag';
      const wantHex    = !!f.hexMarket;
      if (wantZigzag || wantHex) {
        const opts = [];
        if (wantHex)    opts.push('hex_market: true');
        if (wantZigzag) {
          opts.push('zigzag: true');
          if (f.ledgeMovement) opts.push('ledge_movement: true');
        }
        const body = `StockMarket.new(self.class::MARKET, self.class::CERT_LIMIT_TYPES, ${opts.join(', ')})`;
        out.market += '\n\n' + `def init_stock_market\n  ${body}\nend`;
      }

      // pays_bonus_*: emit a stock_market_bonus method so the dividend step's
      // bonus-cell ladder is wired. Skip when no pays_bonus values configured.
      const bonus = f.bonusPerShare || {};
      const bonusEntries = Object.entries(bonus).filter(([_, v]) => typeof v === 'number');
      if (bonusEntries.length) {
        const cases = bonusEntries.map(([flag, v]) => `  when :${flag}\n    ${v}`).join('\n');
        out.market += '\n\n' + `def stock_market_bonus(corporation)\n  case corporation.share_price&.type\n${cases}\n  else\n    0\n  end\nend`;
      }

      return out;
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

      const cl    = m.certLimit || {};
      const clRng = Object.keys(cl).map(Number).sort((a, b) => a - b);
      const clRange = clRng.length ? clRng : pRange;
      lines.push(`CERT_LIMIT = { ${clRange.map(p => `${p} => ${cl[p] ?? 0}`).join(', ')} }.freeze`);

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
      if (m.statusText && Object.keys(m.statusText).length) {
        const entries = Object.entries(m.statusText)
          .map(([k, [short, long]]) => `'${k}' => ['${short}', '${long}']`)
          .join(',\n  ');
        lines.push(`STATUS_TEXT = Base::STATUS_TEXT.merge(\n  ${entries},\n).freeze`);
      }
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

  // ── Market ───────────────────────────────────────────────────────────────────
  {
    id: 'market',
    emit(state) {
      const f = state.financials || {};
      const rows = f.market || [];
      if (!rows.length) {
        return { stock_round: "MARKET = [\n          [100,110,120,130,140,150,160,170,180,190,200]\n        ].freeze" };
      }
      const oneD = !Array.isArray(rows[0]);
      if (oneD) {
        const cells = rows.map(c => {
          if (typeof c === 'object' && c !== null) {
            const v = c.value || c.price || c;
            const suffix = c.type ? `_${c.type}` : '';
            return `'${v}${suffix}'`;
          }
          return String(c);
        });
        return { stock_round: `MARKET = [\n          [${cells.join(', ')}]\n        ].freeze` };
      }
      const rbRows = rows.map(row => {
        if (!Array.isArray(row)) return '          []';
        const cells = row.map(c => {
          if (c === null || c === undefined) return 'nil';
          if (typeof c === 'object') {
            const v = c.value || c.price || c;
            const suffix = c.type ? `_${c.type}` : '';
            return `'${v}${suffix}'`;
          }
          return String(c);
        });
        return `          [${cells.join(', ')}]`;
      });
      return { stock_round: `MARKET = [\n${rbRows.join(',\n')}\n        ].freeze` };
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
        `EBUY_CAN_TAKE_PLAYER_LOAN = ${loanOn ? (loan === true ? 'true' : ':' + loan) : false}`,
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
      const m       = state.mechanics || {};
      const gec     = m.gameEndCheck     || {};
      const gecKeys = m.gameEndCheckKeys || null;
      if (!gecKeys) return { game_end: '# GAME_END_CHECK not configured' };
      const pairs = gecKeys.map(k => {
        const v = gec[k];
        return v?.enabled ? `${k}: :${v.timing}` : `${k}: nil`;
      }).join(', ');
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

  // ── Minor phase-conditional capitalization (1822-style) ─────────────────────
  // When a minor pack has floatBehavior.type === 'phase_conditional', emit the
  // game-class constants + helper methods that the round/stock.rb subclass's
  // float_minor calls into. Mirrors g_1822/game.rb:756-772 (minor_float_*) and
  // adds find_corporation / MINOR_START_PAR_PRICE / COMPANY_MINOR_PREFIX which
  // tobymao 1822 declares at game-class level alongside.
  //
  // Generalization vs. tobymao:
  //   - tobymao: phase.name.to_i == 1 → fixed par; >1 → bid/2
  //     here:    phase.name.to_i <= fixedParPhase → fixed par; >  → bid/2
  //   - tobymao: phase.name.to_i < 3 → presidency; >=3 → bid
  //     here:    phase.name.to_i <= fixedTreasuryPhase → presidency; > → bid
  // The phase-cutoff fields are designer inputs so non-1822 games can use the
  // same capitalization mechanism with different cutoffs.
  //
  // Only the first qualifying pack drives game-class constants (they're
  // singletons). If multiple packs declare phase_conditional, downstream packs
  // are silently skipped — flag in validateGame later if this is misconfigured.
  {
    id: 'minor_phase_capitalization',
    emit(state) {
      const packs = (state.corpPacks || []).filter(pk =>
        pk.type === 'minor' && pk.floatBehavior && pk.floatBehavior.type === 'phase_conditional'
      );
      if (!packs.length) return null;
      const fb = packs[0].floatBehavior;
      const parPrice           = Number.isFinite(fb.parPrice)           ? fb.parPrice           : 50;
      const fixedParPhase      = Number.isFinite(fb.fixedParPhase)      ? fb.fixedParPhase      : 1;
      const fixedTreasuryPhase = Number.isFinite(fb.fixedTreasuryPhase) ? fb.fixedTreasuryPhase : 2;
      const proxyPrefix        = (typeof fb.proxyPrefix === 'string' && fb.proxyPrefix.length > 0) ? fb.proxyPrefix : 'M';

      const constant = [
        `MINOR_START_PAR_PRICE = ${parPrice}`,
        `COMPANY_MINOR_PREFIX  = ${_rbQuote(proxyPrefix)}`,
      ].join('\n');

      const methods = [
        `def find_corporation(company)`,
        `  minor_sym = company.id.delete_prefix(self.class::COMPANY_MINOR_PREFIX)`,
        `  corporation_by_id(minor_sym)`,
        `end`,
        ``,
        `def minor_float_share_price(bid)`,
        `  if @phase.name.to_i <= ${fixedParPhase}`,
        `    @stock_market.par_prices.find { |p| p.price == self.class::MINOR_START_PAR_PRICE }`,
        `  else`,
        `    price = bid.price / 2`,
        `    @stock_market.par_prices.select { |p| p.price <= price }.max_by(&:price)`,
        `  end`,
        `end`,
        ``,
        `def minor_float_starting_cash(bid_amount, presidency_price)`,
        `  if @phase.name.to_i <= ${fixedTreasuryPhase}`,
        `    presidency_price`,
        `  else`,
        `    bid_amount`,
        `  end`,
        `end`,
      ].join('\n');

      return { special: constant, methods };
    },
  },

  // ── COMPANIES (entities.rb) ───────────────────────────────────────────────────
  // Includes:
  //   1. state.privates[]  — designer-defined private companies
  //   2. proxy entries for every minor in a pack with floatBehavior.type ===
  //      'phase_conditional'. The proxies are auctioned and resolved by
  //      Round::Stock#float_minor (round/stock.rb), which calls
  //      find_corporation(company) on the game class to map proxy id back to
  //      the real minor. Per Anthony's spec: { sym: '<prefix><minorSym>',
  //      name: '<minor name>', value: 0, revenue: 0, desc: '' }.
  //
  //   The proxies use value:0 / revenue:0 because price is set by the bid,
  //   not by the COMPANIES entry; revenue should not accrue. Empty desc
  //   keeps them invisible in the company-tooltip UI without losing their
  //   id (Tobymao engine still requires a non-nil string for desc).
  {
    id: 'companies',
    emit(state) {
      const privates = state.privates || [];
      const proxyPacks = (state.corpPacks || []).filter(pk =>
        pk && pk.type === 'minor' && pk.floatBehavior && pk.floatBehavior.type === 'phase_conditional'
      );
      if (!privates.length && !proxyPacks.length) return null;

      const lines = ['COMPANIES = ['];
      privates.forEach(p => lines.push(_rbPrivate(p)));

      proxyPacks.forEach(pack => {
        const prefix = (typeof pack.floatBehavior.proxyPrefix === 'string' && pack.floatBehavior.proxyPrefix.length > 0)
          ? pack.floatBehavior.proxyPrefix : 'M';
        (pack.companies || []).forEach(co => {
          if (!co || !co.sym) return;
          const sym  = prefix + co.sym;
          const name = co.name || co.sym;
          // Single-line hash literal — matches the proxy-shape spec exactly.
          // Indentation matches _rbPrivate's two-space prefix for visual consistency.
          lines.push(`  { sym: ${_rbQuote(sym)}, name: ${_rbQuote(name)}, value: 0, revenue: 0, desc: '' },`);
        });
      });

      lines.push('].freeze');
      return { companies: lines.join('\n') };
    },
  },

  // ── CORPORATIONS (entities.rb) ────────────────────────────────────────────────
  {
    id: 'corporations',
    emit(state) {
      const gameCap = state.mechanics?.capitalization || 'full';
      const corps   = (state.companies || []).filter(c => (c.type || 'major') !== 'minor');
      if (!corps.length) return null;
      const lines = ['CORPORATIONS = ['];
      corps.forEach(co => lines.push(_rbCorp(co, co, gameCap)));
      lines.push('].freeze');
      return { corporations: lines.join('\n') };
    },
  },

  // ── Round Methods ────────────────────────────────────────────────────────────
  // Emits round-class subclasses + factory methods + game-class hooks
  // (or_round_finished, next_round!) into {{SLOT_ROUND_METHODS}}. Emits only
  // when state actively departs from base.rb defaults — vanilla 1830 produces
  // no Ruby here.
  //
  // Order in the slot:
  //   1. Custom round subclasses (from non-OR endHook content)
  //   2. Round factory methods (init_round / stock_round / operating_round)
  //   3. Merger factory method (when merger enabled)
  //   4. or_round_finished (game-class hook from OR endHook)
  //   5. next_round! (game-class loop control from per-tab transitionHook +
  //      merger position/trigger)
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

      const orFinishedBody = _grbOrRoundFinishedBody(rounds);
      if (orFinishedBody !== null) out.push(_grbWrapMethod('or_round_finished', null, orFinishedBody));

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
      const minors  = [
        ...(state.companies || []).filter(c => c.type === 'minor'),
        ...(state.minors    || []),
      ];
      if (!minors.length) return null;
      const lines = ['MINORS = ['];
      minors.forEach(co => lines.push(_rbCorp(co, co, gameCap)));
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
    module {{MODULE}}
      class Game < Engine::Game::Base
        include Entities
        include Map

        # ── Trains ───────────────────────────────────────────────────────────
{{SLOT_TRAINS}}

        # ── Phases ───────────────────────────────────────────────────────────
{{SLOT_PHASES}}

        # ── Bank & Players ────────────────────────────────────────────────────
{{SLOT_BANK}}

        # ── Stock Market ──────────────────────────────────────────────────────
{{SLOT_MARKET}}

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
    module {{MODULE}}
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

// ── round/stock.rb file body (1822-style minor capitalization) ─────────────
// Emitted as a separate file because Tobymao engine convention places round
// subclasses under <game>/round/<name>.rb and autoloads via Zeitwerk; the
// game.rb references it as `G<Sym>::Round::Stock` without an explicit
// require. Returns null when no minor pack uses phase_conditional float.
//
// Body is a fixed template — the only designer-facing variable is the module
// name. The float_minor body is verbatim from g_1822/round/stock.rb:113-158
// minus 1822-specific bidbox-removal and L-train logging, which don't apply
// to a generic phase-conditional float.
function renderRoundStockRb() {
  if (typeof state === 'undefined' || !state) return null;
  const usesPhaseConditional = (state.corpPacks || []).some(pk =>
    pk && pk.type === 'minor' && pk.floatBehavior && pk.floatBehavior.type === 'phase_conditional'
  );
  if (!usesPhaseConditional) return null;
  const modName = _grbModuleName(state);
  return `# frozen_string_literal: true

require_relative '../../../round/stock'

module Engine
  module Game
    module ${modName}
      module Round
        class Stock < Engine::Round::Stock
          def float_minor(bid)
            player           = bid.entity
            company          = bid.company
            bid_amount       = bid.price
            minor            = @game.find_corporation(company)
            minor.reservation_color = :white

            share_price      = @game.minor_float_share_price(bid)
            presidency_price = share_price.price * 2

            @game.stock_market.set_par(minor, share_price)
            @game.share_pool.buy_shares(player, minor.shares.first.to_bundle)
            @game.after_par(minor)

            minor.spend(minor.cash, @game.bank)
            treasury = @game.minor_float_starting_cash(bid_amount, presidency_price)
            excess   = bid_amount - presidency_price
            player.spend(excess, @game.bank) unless excess.zero?
            @game.bank.spend(treasury, minor)
            @game.companies.delete(company)
          end
        end
      end
    end
  end
end
`;
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

function _requireTitle() {
  if (!state?.meta?.title?.trim()) {
    alert('Set a game title before exporting.\n\nOpen the Config tab (right panel) and enter a title in the "Game Title" field.');
    const inp = document.getElementById('gameTitleInput');
    if (inp) inp.focus();
    return false;
  }
  return true;
}

document.getElementById('exportGameBtn').addEventListener('click', () => {
  if (!_requireTitle()) return;
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
  if (!_requireTitle()) return;
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

// ── Slug + namespace + meta helpers (shared by single-file & bundle exports) ─
// Slug is the lowercase suffix that ties the engine paths together:
//   _grbModuleName(state) = 'G1822'   →   slug = '1822'   →   files: g_1822.rb,
//   g_1822/game.rb, g_1822/entities.rb, g_1822/round/stock.rb
// Engine convention is to strip the leading 'G' for the file slug. If the
// derived module name is exactly 'GGame' (no title set) we fall back to 'game'
// so the path is still valid.
function _grbSlug(state) {
  const mn = _grbModuleName(state);
  if (!mn || mn === 'GGame') return 'game';
  return mn.replace(/^G/, '').toLowerCase();
}

// Namespace one-liner: lib/engine/game/g_<slug>.rb. Just the empty module — its
// only job is to declare the namespace so Zeitwerk can autoload children.
function _grbNamespaceRb(state) {
  const modName = _grbModuleName(state);
  return `# frozen_string_literal: true
# Generated by 18xxtools

module Engine
  module Game
    module ${modName}
    end
  end
end
`;
}

// meta.rb stub: GAME_TITLE is required, DEV_STAGE :alpha keeps fresh exports
// from showing in 18xx.games' production list. state.meta has no description
// field today (per js/setup.js inspection on 2026-05-10), so the stub is
// minimal — designers can flesh it out post-export.
function _grbMetaRb(state) {
  const modName = _grbModuleName(state);
  const title   = (state && state.meta && state.meta.title) || modName;
  return `# frozen_string_literal: true

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

// ── Bundled export for 18xx.games ────────────────────────────────────────────
// Calls every Ruby emitter, packages them under the engine's expected paths
// inside a single zip. Skips round/stock.rb when no minor pack uses
// phase_conditional float (renderRoundStockRb already returns null in that
// case). Skips entities.rb if it has no content.
const _exportFor18xxBtn = document.getElementById('exportFor18xxBtn');
if (_exportFor18xxBtn) {
  _exportFor18xxBtn.addEventListener('click', async () => {
    if (!_requireTitle()) return;
    try {
      if (typeof JSZip === 'undefined') {
        alert('JSZip not loaded — cannot bundle export. Refresh the page.');
        return;
      }
      const slug    = _grbSlug(state);
      const dirName = `g_${slug}`;
      const zip     = new JSZip();
      const root    = zip.folder('lib').folder('engine').folder('game');

      // 1. Namespace one-liner sits next to the directory.
      root.file(`${dirName}.rb`, _grbNamespaceRb(state));

      // 2. Subdirectory contents.
      const sub = root.folder(dirName);
      sub.file('game.rb',     renderGameRb());
      sub.file('entities.rb', renderEntitiesRb());
      sub.file('meta.rb',     _grbMetaRb(state));

      // 3. Round subclass — only when phase_conditional float is configured.
      const stockRb = renderRoundStockRb();
      if (stockRb) sub.folder('round').file('stock.rb', stockRb);

      // Inline download — _grbDownload re-wraps content in a text/plain Blob,
      // which would corrupt the zip. Use the same pattern as io.js exportBtn.
      const blob = await zip.generateAsync({ type: 'blob' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${dirName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (typeof updateStatus === 'function') {
        updateStatus(`Exported ${dirName}.zip — drop into 18xx-master/lib/engine/game/`);
      }
    } catch (err) {
      console.error('[exportFor18xxBtn]', err);
      alert('Bundle export failed: ' + err.message);
    }
  });
}

// renderMetaRb() — public entry point, mirrors renderGameRb() / renderEntitiesRb()
function renderMetaRb() {
  if (typeof state === 'undefined')
    return '# No state loaded.\n';
  return _grbMetaRb(state);
}

const _exportMetaBtn = document.getElementById('exportMetaBtn');
if (_exportMetaBtn) {
  _exportMetaBtn.addEventListener('click', () => {
    if (!_requireTitle()) return;
    try {
      const src  = renderMetaRb();
      const slug = _grbSlug(state);
      _grbDownload(src, slug + '_meta.rb');
      if (typeof updateStatus === 'function') updateStatus('Exported ' + slug + '_meta.rb');
    } catch (err) {
      console.error('[renderMetaRb]', err);
      alert('Export failed: ' + err.message);
    }
  });
}

const _exportStockBtn = document.getElementById('exportRoundStockBtn');
if (_exportStockBtn) {
  _exportStockBtn.addEventListener('click', () => {
    try {
      const src = renderRoundStockRb();
      if (!src) {
        alert('No minor pack uses phase-conditional float — round/stock.rb not needed.');
        return;
      }
      const slug = _grbModuleName(state).toLowerCase();
      // Filename hints at the engine convention path: g_<sym>/round/stock.rb
      _grbDownload(src, slug + '_round_stock.rb');
      if (typeof updateStatus === 'function') updateStatus('Exported ' + slug + '_round_stock.rb (place at lib/engine/game/' + slug + '/round/stock.rb)');
    } catch (err) {
      console.error('[renderRoundStockRb]', err);
      alert('Export failed: ' + err.message);
    }
  });
}
