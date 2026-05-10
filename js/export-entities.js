// js/export-entities.js
// Converts state.privates + state.corpPacks → COMPANIES / CORPORATIONS / MINORS
// Wired to #exportEntitiesBtn (⬆ Export → Entities (.rb)).
//
// Field names follow tobymao lib/engine/corporation.rb exactly.
//
// Capitalization logic (from base.rb / corporation.rb):
//   - CAPITALIZATION is a game-level Ruby constant (default: :full).
//     Set via mechanics panel → state.mechanics.capitalization.
//   - Per-corp capitalization: emitted only when it differs from the game default.
//     Comes from pack.capitalization (all corps in a pack share the same default).
//
// Float percent (from corporation.rb:66 — opts[:float_percent] || 60):
//   - There is NO FLOAT_PERCENT game-level constant in the engine.
//   - It is always per-corporation; engine default is 60.
//   - Emitted as float_percent: N when it differs from 60.

// ── Ruby literal helpers ──────────────────────────────────────────────────────

function _eiStr(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

function _eiColor(c) {
  // '#RRGGBB' → quoted string; bare word → :symbol
  if (!c || c === 'none') return ':white';
  if (/^#/.test(c)) return _eiStr(c);
  if (/^[a-zA-Z][a-zA-Z0-9_]*$/.test(c)) return ':' + c;
  return _eiStr(c);
}

function _eiWhen(w) {
  if (w == null) return null;
  if (Array.isArray(w)) return _eiStrArr(w);
  return _eiStr(w);
}

function _eiStrArr(arr) {
  if (!arr || !arr.length) return '[]';
  // %w[] if all elements are simple tokens (no spaces or quote chars)
  if (arr.every(s => /^[^\s'"]+$/.test(s))) return '%w[' + arr.join(' ') + ']';
  return '[' + arr.map(_eiStr).join(', ') + ']';
}

function _eiNumArr(arr) {
  if (!arr || !arr.length) return '[]';
  return '[' + arr.join(', ') + ']';
}

// Engine default share structure (corporation.rb SHARES): [20,10×8]
// Skip shares: when the pack uses this exact structure.
const _EI_DEFAULT_SHARES = JSON.stringify([20, 10, 10, 10, 10, 10, 10, 10, 10]);

// ── Ability serializer ────────────────────────────────────────────────────────
// Emits a compact single-line Ruby hash: { type: 'foo', hexes: %w[A1 B2], ... }

function _eiAbilityLine(ab) {
  const kv = [];
  const push  = (k, v) => kv.push(k + ': ' + v);
  const pushB = (k)    => { if (ab[k] != null) push(k, ab[k] ? 'true' : 'false'); };
  const pushN = (k)    => { if (ab[k] != null) push(k, String(ab[k])); };
  const pushS = (k)    => { if (ab[k])         push(k, _eiStr(ab[k])); };

  if (ab.type)                                    push('type',             _eiStr(ab.type));
  if (ab.owner_type)                              push('owner_type',       _eiStr(ab.owner_type));
  const wen = _eiWhen(ab.when);
  if (wen)                                        push('when',             wen);
  if (ab.hexes && ab.hexes.length)                push('hexes',            _eiStrArr(ab.hexes));
  if (ab.corporations && ab.corporations.length)  push('corporations',     _eiStrArr(ab.corporations));
  if (ab.combo_entities && ab.combo_entities.length) push('combo_entities', _eiStrArr(ab.combo_entities));
  pushN('count');        pushN('count_per_or');
  pushN('cost');         pushN('discount');      pushN('amount');
  pushN('price');        pushN('teleport_price');
  pushN('lay_count');    pushN('upgrade_count');
  pushN('income');       pushN('slot');          pushN('city');
  if (ab.from != null) {
    push('from', Array.isArray(ab.from) ? _eiStrArr(ab.from) : _eiStr(ab.from));
  }
  pushS('terrain');      pushS('partition_type');  pushS('hex');
  if (ab.tiles && ab.tiles.length)                push('tiles',            _eiStrArr(ab.tiles));
  pushS('corporation');
  if (ab.shares != null) push('shares', Array.isArray(ab.shares) ? _eiStrArr(ab.shares) : _eiStr(ab.shares));
  pushS('description');  pushS('desc_detail');
  pushS('remove');       pushS('on_phase');       pushS('after_phase');
  pushB('closed_when_used_up');  pushB('free');        pushB('reachable');
  pushB('special');      pushB('connect');        pushB('passive');
  pushB('must_lay_together');    pushB('must_lay_all');
  pushB('consume_tile_lay');     pushB('blocks');
  pushB('extra_action');         pushB('from_owner');  pushB('special_only');
  pushB('extra_slot');           pushB('neutral');     pushB('check_tokenable');
  pushB('connected');            pushB('same_hex_allowed');
  pushB('use_across_ors');       pushB('hidden');

  return '{ ' + kv.join(', ') + ' }';
}

// ── Corporation / Minor entry ─────────────────────────────────────────────────
// gameCap: the game-level capitalization string ('full', 'incremental', …)
//          Per-corp capitalization is only emitted when it differs.

function _eiCorpEntry(co, pack, gameCap) {
  const i2 = '  ';   // 2-space indent (array element)
  const i4 = '    '; // 4-space indent (hash key)
  const lines = [];

  // Resolve effective values: per-corp override → pack value → engine default
  const floatPct = co.floatPctOverride != null ? co.floatPctOverride
                 : (pack.floatPct      != null ? pack.floatPct : 60);
  const tokens   = co.tokensOverride   != null ? co.tokensOverride
                 : (pack.tokens || [0, 40, 100]);
  const shares   = pack.shares || [20, 10, 10, 10, 10, 10, 10, 10, 10];
  const cap      = pack.capitalization || 'full';
  const maxOwn   = pack.maxOwnershipPct != null ? pack.maxOwnershipPct : 60;
  const amp      = pack.alwaysMarketPrice || false;

  lines.push(i2 + '{');
  lines.push(i4 + 'sym: '   + _eiStr(co.sym  || ''));
  lines.push(i4 + 'name: '  + _eiStr(co.name || ''));
  if (co.logo)
    lines.push(i4 + 'logo: ' + _eiStr(co.logo));
  lines.push(i4 + 'color: ' + _eiColor(co.color || '#666666'));
  // Corp textColor default is #000000 — omit if default.
  // Use _eiStr (not _eiColor) so named colors like 'black' round-trip as quoted strings.
  if (co.textColor && co.textColor !== '#000000' && co.textColor !== '#000000'.toUpperCase())
    lines.push(i4 + 'text_color: ' + _eiStr(co.textColor));
  lines.push(i4 + 'tokens: ' + _eiNumArr(tokens));
  if (co.coordinates)
    lines.push(i4 + 'coordinates: ' + _eiStr(co.coordinates));
  if (co.city && parseInt(co.city) !== 0)
    lines.push(i4 + 'city: ' + parseInt(co.city));
  if (co.destinationCoordinates)
    lines.push(i4 + 'destination_coordinates: ' + _eiStr(co.destinationCoordinates));

  // Shares — omit if standard 9-share structure [20,10,10,10,10,10,10,10,10]
  if (JSON.stringify(shares) !== _EI_DEFAULT_SHARES)
    lines.push(i4 + 'shares: ' + _eiNumArr(shares));

  // Float percent — omit if engine default (60)
  if (floatPct !== 60)
    lines.push(i4 + 'float_percent: ' + floatPct);

  // Max ownership — omit if engine default (60)
  if (maxOwn !== 60)
    lines.push(i4 + 'max_ownership_percent: ' + maxOwn);

  // Always market price — omit if false
  if (amp)
    lines.push(i4 + 'always_market_price: true');

  // Capitalization — omit if matches game-level CAPITALIZATION
  if (cap !== gameCap)
    lines.push(i4 + 'capitalization: :' + cap);

  // Abilities
  const abilities = co.abilities || [];
  if (abilities.length) {
    lines.push(i4 + 'abilities: [');
    abilities.forEach(ab => lines.push(i4 + '  ' + _eiAbilityLine(ab) + ','));
    lines.push(i4 + '],');
  }

  lines.push(i2 + '},');
  return lines.join('\n');
}

// ── Private company entry ─────────────────────────────────────────────────────

function _eiPrivateEntry(priv) {
  const i2 = '  ';
  const i4 = '    ';
  const lines = [];

  lines.push(i2 + '{');
  lines.push(i4 + 'name: '  + _eiStr(priv.name  || ''));
  lines.push(i4 + 'value: ' + (priv.cost || 0));

  // Revenue — number or phase array
  const rev = priv.revenue;
  if (Array.isArray(rev)) lines.push(i4 + 'revenue: ' + _eiNumArr(rev));
  else                    lines.push(i4 + 'revenue: ' + (rev != null ? rev : 0));

  const privDesc = priv.desc ?? priv.ability;
  if (privDesc)
    lines.push(i4 + 'desc: ' + _eiStr(privDesc));

  lines.push(i4 + 'sym: ' + _eiStr(priv.sym || ''));

  if (priv.minPrice    != null) lines.push(i4 + 'min_price: '   + priv.minPrice);
  if (priv.maxPrice    != null) lines.push(i4 + 'max_price: '   + priv.maxPrice);
  if (priv.discount    != null) lines.push(i4 + 'discount: '    + priv.discount);
  if (priv.minPlayers  != null) lines.push(i4 + 'min_players: ' + priv.minPlayers);

  // Color — omit if it's the default placeholder gray
  if (priv.color && priv.color !== '#666666' && priv.color !== '#000000')
    lines.push(i4 + 'color: ' + _eiColor(priv.color));

  // Private textColor default is #ffffff — omit if default.
  // Use _eiStr so named colors like 'white' round-trip as quoted strings.
  if (priv.textColor && priv.textColor !== '#ffffff' && priv.textColor !== '#FFFFFF')
    lines.push(i4 + 'text_color: ' + _eiStr(priv.textColor));

  // Abilities — for concessions, reconstruct the exchange ability that was
  // extracted at import time into linkedMajor / blocksHexes.
  const abilities = (priv.abilities || []).slice();
  if (priv.companyType === 'concession') {
    if (priv.linkedMajor) {
      abilities.unshift({
        type: 'exchange', from: 'par', owner_type: 'player',
        corporations: [priv.linkedMajor],
      });
    }
    if (priv.blocksHexes && priv.blocksHexes.length) {
      abilities.push({ type: 'blocks_hexes', owner_type: 'player', hexes: priv.blocksHexes });
    }
  }

  if (abilities.length) {
    lines.push(i4 + 'abilities: [');
    abilities.forEach(ab => lines.push(i4 + '  ' + _eiAbilityLine(ab) + ','));
    lines.push(i4 + '],');
  }

  lines.push(i2 + '},');
  return lines.join('\n');
}

// ── Main export ───────────────────────────────────────────────────────────────

function exportEntitiesRb() {
  if (typeof state === 'undefined')
    return '# No state loaded.\n';

  const gameCap = (state.mechanics && state.mechanics.capitalization) || 'full';
  const title   = (state.meta && state.meta.title) || 'Game';
  const privates = state.privates  || [];
  const out      = [];

  out.push('# frozen_string_literal: true');
  out.push('# Entities for ' + title + ' — generated by 18xxtools');
  out.push('# Wrap in: module Engine; module Game; module G_XXXX; module Entities');
  out.push('# Game-level CAPITALIZATION: :' + gameCap + ' (set in Mechanics panel)');
  out.push('');

  // ── COMPANIES ──────────────────────────────────────────────────────────────
  if (privates.length) {
    out.push('COMPANIES = [');
    privates.forEach(p => out.push(_eiPrivateEntry(p)));
    out.push('].freeze');
    out.push('');
  }

  // ── CORPORATIONS ───────────────────────────────────────────────────────────
  const corpPacks = (state.corpPacks || []).filter(pk => pk.type !== 'minor');
  const corps = [];
  corpPacks.forEach(pack => (pack.companies || []).forEach(co => corps.push({ co, pack })));

  if (corps.length) {
    out.push('CORPORATIONS = [');
    corps.forEach(({ co, pack }) => out.push(_eiCorpEntry(co, pack, gameCap)));
    out.push('].freeze');
    out.push('');
  }

  // ── MINORS ─────────────────────────────────────────────────────────────────
  const minorPacks = (state.corpPacks || []).filter(pk => pk.type === 'minor');
  const minors = [];
  minorPacks.forEach(pack => (pack.companies || []).forEach(co => minors.push({ co, pack })));

  if (minors.length) {
    out.push('MINORS = [');
    minors.forEach(({ co, pack }) => out.push(_eiCorpEntry(co, pack, gameCap)));
    out.push('].freeze');
    out.push('');
  }

  if (!privates.length && !corps.length && !minors.length)
    return [
      '# frozen_string_literal: true',
      '# No companies or corporations defined yet.',
      '# Build your game in the Companies panel first.',
    ].join('\n');

  return out.join('\n');
}

// ── Button wiring ─────────────────────────────────────────────────────────────

document.getElementById('exportEntitiesBtn').addEventListener('click', () => {
  try {
    const src  = exportEntitiesRb();
    const blob = new Blob([src], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const slug = ((state.meta && state.meta.title) || 'game')
      .replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    a.download = slug + '_entities.rb';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (typeof updateStatus === 'function') updateStatus('Exported ' + a.download);
  } catch (err) {
    console.error('[exportEntitiesRb]', err);
    alert('Export failed: ' + err.message);
  }
});
