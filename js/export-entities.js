// js/export-entities.js
// Converts state.privates + state.companies + state.minors → COMPANIES / CORPORATIONS / MINORS
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
// Thin delegate to the shared serializer in js/serialize-ability.js. The
// per-type allowlist is derived from lib/engine/ability/*.rb `setup`
// signatures, replacing the prior parallel emitters (this and _rbAbility in
// export-game.js) that needed synchronised one-off gating fixes for shares:,
// revenue:, etc. as each new ability type's kwarg leak surfaced.
function _eiAbilityLine(ab) {
  return _serializeAbility(ab, {
    quote:  _eiStr,
    strArr: _eiStrArr,
    when:   _eiWhen,
  });
}

// ── Corporation / Minor entry ─────────────────────────────────────────────────
// gameCap: the game-level capitalization string ('full', 'incremental', …)
//          Per-corp capitalization is only emitted when it differs.
// co: a state.companies or state.minors object.

function _eiCorpEntry(co, gameCap) {
  const i2 = '  ';   // 2-space indent (array element)
  const i4 = '    '; // 4-space indent (hash key)
  const lines = [];

  // Resolve effective values from the corp object directly.
  // tokens may be an array of costs [0,40,100] (majors) or a count (minors → convert).
  const floatPct = co.floatPct != null ? co.floatPct : 60;
  const tokens   = Array.isArray(co.tokens) ? co.tokens
                 : (co.tokens != null && co.tokens < 20) ? new Array(co.tokens).fill(0)
                 : [0, 40, 100];
  const shares   = co.shares || [20, 10, 10, 10, 10, 10, 10, 10, 10];
  const cap      = co.capitalization || 'full';
  const maxOwn   = co.maxOwnershipPct != null ? co.maxOwnershipPct : 60;
  const amp      = co.alwaysMarketPrice || false;

  // Support both tobymao field names (sym, coordinates) and internal aliases (abbr, homeHex).
  const sym         = co.sym  || co.abbr  || '';
  const coordinates = co.coordinates || co.homeHex || '';

  lines.push(i2 + '{');
  lines.push(i4 + 'sym: '   + _eiStr(sym) + ',');
  lines.push(i4 + 'name: '  + _eiStr(co.name || '') + ',');
  if (co.logo)
    lines.push(i4 + 'logo: ' + _eiStr(co.logo) + ',');
  lines.push(i4 + 'color: ' + _eiColor(co.color || '#666666') + ',');
  if (co.textColor && co.textColor !== '#000000' && co.textColor !== '#000000'.toUpperCase())
    lines.push(i4 + 'text_color: ' + _eiStr(co.textColor) + ',');
  lines.push(i4 + 'tokens: ' + _eiNumArr(tokens) + ',');
  if (coordinates)
    lines.push(i4 + 'coordinates: ' + _eiStr(coordinates) + ',');
  if (co.city && parseInt(co.city) !== 0)
    lines.push(i4 + 'city: ' + parseInt(co.city) + ',');
  if (co.destinationCoordinates)
    lines.push(i4 + 'destination_coordinates: ' + _eiStr(co.destinationCoordinates) + ',');

  // Shares — omit if standard 9-share structure [20,10,10,10,10,10,10,10,10]
  if (JSON.stringify(shares) !== _EI_DEFAULT_SHARES)
    lines.push(i4 + 'shares: ' + _eiNumArr(shares) + ',');

  // Float percent — omit if engine default (60)
  if (floatPct !== 60)
    lines.push(i4 + 'float_percent: ' + floatPct + ',');

  // Max ownership — omit if engine default (60)
  if (maxOwn !== 60)
    lines.push(i4 + 'max_ownership_percent: ' + maxOwn + ',');

  // Always market price — omit if false
  if (amp)
    lines.push(i4 + 'always_market_price: true,');

  // Capitalization — omit if matches game-level CAPITALIZATION
  if (cap !== gameCap)
    lines.push(i4 + 'capitalization: :' + cap + ',');

  // Abilities — filter structurally-invalid (e.g. blank-subtype generic)
  const abilities = (co.abilities || []).filter(_abilityExportable);
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
  lines.push(i4 + 'name: '  + _eiStr(priv.name  || '') + ',');
  lines.push(i4 + 'value: ' + (priv.cost || 0) + ',');

  // Revenue — number or phase array
  const rev = priv.revenue;
  if (Array.isArray(rev)) lines.push(i4 + 'revenue: ' + _eiNumArr(rev) + ',');
  else                    lines.push(i4 + 'revenue: ' + (rev != null ? rev : 0) + ',');

  const privDesc = priv.desc ?? priv.ability;
  if (privDesc)
    lines.push(i4 + 'desc: ' + _eiStr(privDesc) + ',');

  lines.push(i4 + 'sym: ' + _eiStr(priv.sym || '') + ',');

  if (priv.minPrice    != null) lines.push(i4 + 'min_price: '   + priv.minPrice   + ',');
  if (priv.maxPrice    != null) lines.push(i4 + 'max_price: '   + priv.maxPrice   + ',');
  if (priv.discount    != null) lines.push(i4 + 'discount: '    + priv.discount   + ',');
  if (priv.minPlayers  != null) lines.push(i4 + 'min_players: ' + priv.minPlayers + ',');

  // Color — omit if it's the default placeholder gray
  if (priv.color && priv.color !== '#666666' && priv.color !== '#000000')
    lines.push(i4 + 'color: ' + _eiColor(priv.color) + ',');

  // Private textColor default is #ffffff — omit if default.
  // Use _eiStr so named colors like 'white' round-trip as quoted strings.
  if (priv.textColor && priv.textColor !== '#ffffff' && priv.textColor !== '#FFFFFF')
    lines.push(i4 + 'text_color: ' + _eiStr(priv.textColor) + ',');

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

  const exportable = abilities.filter(_abilityExportable);
  if (exportable.length) {
    lines.push(i4 + 'abilities: [');
    exportable.forEach(ab => lines.push(i4 + '  ' + _eiAbilityLine(ab) + ','));
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
  // state.companies may contain entries with type:'minor' when the importer
  // places all entities into one array; split here so they land in the right block.
  const allCompanies = state.companies || [];
  const corps   = allCompanies.filter(c => (c.type || 'major') !== 'minor');
  const corpMin = allCompanies.filter(c => c.type === 'minor');

  if (corps.length) {
    out.push('CORPORATIONS = [');
    corps.forEach(co => out.push(_eiCorpEntry(co, gameCap)));
    out.push('].freeze');
    out.push('');
  }

  // ── MINORS ─────────────────────────────────────────────────────────────────
  const minors = [...corpMin, ...(state.minors || [])];

  if (minors.length) {
    out.push('MINORS = [');
    minors.forEach(co => out.push(_eiCorpEntry(co, gameCap)));
    out.push('].freeze');
    out.push('');
  }

  if (!privates.length && !corps.length && !minors.length)
    return [
      '# frozen_string_literal: true',
      '# No companies or corporations defined yet.',
      '# Build your game in the Companies panel first.',
    ].join('\n');

  const modName = (typeof _grbModuleName === 'function')
    ? _grbModuleName(state)
    : (() => { const c = title.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, ''); return c ? 'G' + c : 'GGame'; })();
  const joined    = out.join('\n');
  const allLines  = joined.split('\n');
  const firstBody = allLines.findIndex(l => /^[A-Z_]/.test(l));
  const hdr       = allLines.slice(0, firstBody).join('\n').trimEnd();
  const body      = allLines.slice(firstBody).join('\n').trimEnd();
  const indented  = body.split('\n').map(l => (l.trim() ? '        ' + l : '')).join('\n');
  return `${hdr}\n\nmodule Engine\n  module Game\n    module ${modName}\n      module Entities\n${indented}\n      end\n    end\n  end\nend\n`;
}

// ── Button wiring ─────────────────────────────────────────────────────────────

document.getElementById('exportEntitiesBtn').addEventListener('click', () => {
  if (!state?.meta?.title?.trim()) {
    alert('Set a game title before exporting.\n\nOpen the Config tab (right panel) and enter a title in the "Game Title" field.');
    const inp = document.getElementById('gameTitleInput');
    if (inp) inp.focus();
    return;
  }
  try {
    const src  = exportEntitiesRb();
    const blob = new Blob([src], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const slug = state.meta.title.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
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
