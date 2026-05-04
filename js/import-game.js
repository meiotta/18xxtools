// js/import-game.js  v20260425a
// Lossless game.rb → state.mechanics.functionMap importer.
//
// Architecture
// ────────────
// Runs as a SECOND listener on #importGameFile, after import-ruby.js has
// already populated state.trains, state.phases, and the flat state.mechanics
// keys.  Reads the raw source independently and builds a typed functionMap
// where every constant and method in the file is accounted for:
//
//   known constant  → { type: 'const', emit, default, value }
//   ref constant    → { type: 'ref',   stateKey, ... }
//   known method    → { type: 'method', template, params }
//   anything else   → { type: 'raw',   ruby, label, hint }
//
// This file owns:
//   FM_SCHEMA   — master schema for every constant the mechanics panel controls
//   FM_REFS     — external module ref declarations (TRAINS/PHASES/COMPANIES/…)
//   _rbBuildFunctionMap(src) → functionMap object
//
// Load order: after mechanics-panel.js (needs initMechanicsState).
// Does NOT modify import-ruby.js.

'use strict';

// ── Source preprocessor ───────────────────────────────────────────────────────
// Matches what import-ruby.js does before parsing — strip string continuations
// and comments so scanners work on clean text.
function _igPreprocess(src) {
  return src
    .replace(/'\s*\\\s*\n\s*'/g, '')   // string continuation: '...' \<newline> '...'
    .replace(/#[^\n]*/g, '');           // line comments
}

// ── Bracket balance checker ───────────────────────────────────────────────────
// Returns true when brackets/braces/parens in s are balanced.
// Handles single-quoted and double-quoted strings (no interpolation tracking).
function _igIsBalanced(s) {
  let depth = 0;
  let inStr  = false;
  let strCh  = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === strCh && s[i - 1] !== '\\') inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; strCh = c; continue; }
    if (c === '[' || c === '{' || c === '(') depth++;
    else if (c === ']' || c === '}' || c === ')') depth--;
  }
  return depth === 0;
}

// ── Block depth counter (per line) ───────────────────────────────────────────
// Counts how much the block depth changes on one line.
// Opening keywords must START the trimmed line to avoid counting modifier-if forms.
// e.g. "return x if cond"  →  modifier form, does NOT open a block.
// e.g. "if cond"           →  statement form, opens a block.
function _igLineDepthDelta(line) {
  const t = line.trim();
  if (!t || t.startsWith('#')) return 0;
  let delta = 0;
  // Block openers that start a logical statement
  if (/^(def|class|module)\s/.test(t))                       delta++;
  if (/^(if|unless|while|until|for|begin|case)\b/.test(t))  delta++;
  // do...end at end of line (block argument)
  if (/\bdo\s*(\|[^|]*\|)?\s*$/.test(t))                    delta++;
  if (t === 'do')                                             delta++;
  // Closers
  if (/^end\b/.test(t))                                      delta--;
  return delta;
}

// ── General constant scanner ──────────────────────────────────────────────────
// Walks src line by line, finds every UPPER_CASE_NAME = ... assignment.
// Buffers multi-line values until brackets balance.
// Returns Map<name, rawValueString> — .freeze already stripped.
// Skips module/class/def/include/require lines.
function _igExtractAllConstants(src) {
  const result = new Map();
  const lines  = src.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line    = lines[i];
    const trimmed = line.trim();

    // Skip structural wrappers and method boundaries
    if (!trimmed || /^(require|module|class|include|def|end)\b/.test(trimmed) ||
        trimmed.startsWith('#')) {
      i++;
      continue;
    }

    // CONSTANT_NAME = ...
    const m = line.match(/^[ \t]*([A-Z][A-Z0-9_]*)\s*=(.*)/);
    if (m) {
      const name = m[1];
      let   val  = m[2].trim();

      // Buffer continuation lines until brackets balance
      while (!_igIsBalanced(val) && i + 1 < lines.length) {
        i++;
        val += '\n' + lines[i];
      }

      // Strip trailing .freeze (possibly after whitespace)
      val = val.replace(/\.freeze\s*$/, '').trim();
      // Strip trailing .merge(super).freeze (STATUS_TEXT pattern) — keep literal
      val = val.replace(/\.merge\s*\(super\)\s*$/, '').trim();

      result.set(name, val);
    }

    i++;
  }

  return result;
}

// ── General method scanner ────────────────────────────────────────────────────
// Finds every def name...end block at the class body level.
// Returns Map<name, bodyString> including the def and end lines.
// Limitation: inaccurate for methods containing inline `do`/`end` inside
// single-line blocks, but correct for the patterns in tobymao game.rb files.
function _igExtractAllMethods(src) {
  const result = new Map();
  const lines  = src.split('\n');
  let i = 0;

  while (i < lines.length) {
    const defM = lines[i].match(/^[ \t]*def\s+(\w+[?!]?)/);
    if (defM) {
      const name  = defM[1];
      const start = i;
      let   depth = 0;

      while (i < lines.length) {
        depth += _igLineDepthDelta(lines[i]);
        if (i > start && depth === 0) {
          // This line is the matching 'end'
          result.set(name, lines.slice(start, i + 1).join('\n'));
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    i++;
  }

  return result;
}

// ── Value parsers (operate on the extracted raw value string) ─────────────────

function _parseSymVal(raw)  { return raw.trim().replace(/^:/, ''); }
function _parseBoolVal(raw) { return raw.trim() === 'true'; }
function _parseIntVal(raw)  { return parseInt(raw.trim().replace(/_/g, ''), 10); }
function _parseStrVal(raw)  { return raw.trim().replace(/^['"]|['"]$/g, ''); }

function _parseWordArrVal(raw) {
  const m = raw.trim().match(/^%w\[([^\]]*)\]/);
  if (m) return m[1].trim().split(/\s+/).filter(Boolean);
  // Fallback: plain string array ['A', 'B']
  return (raw.match(/['"]([^'"]+)['"]/g) || []).map(s => s.replace(/^['"]|['"]$/g, ''));
}

function _parseIntHashVal(raw) {
  const result = {};
  const pairs  = raw.match(/(\d+)\s*=>\s*(\d+)/g) || [];
  pairs.forEach(p => {
    const nm = p.match(/(\d+)\s*=>\s*(\d+)/);
    if (nm) result[nm[1]] = parseInt(nm[2], 10);
  });
  return Object.keys(result).length ? result : {};
}

function _parseSymSymHashVal(raw) {
  const result = {};
  let m;
  // colon-key form: key: :val
  const re1 = /(\w+):\s*:(\w+)/g;
  while ((m = re1.exec(raw)) !== null) result[m[1]] = m[2];
  // hashrocket form: :key => :val
  const re2 = /:(\w+)\s*=>\s*:(\w+)/g;
  while ((m = re2.exec(raw)) !== null) result[m[1]] = m[2];
  return result;
}

function _parseTileLayArrVal(raw) {
  const result   = [];
  const hashRe   = /\{([^}]+)\}/g;
  let   hm;
  while ((hm = hashRe.exec(raw)) !== null) {
    const slot = {};
    const h    = hm[1];
    const layM = h.match(/\blay:\s*(true|false|:[\w]+)/);
    if (layM) {
      if      (layM[1] === 'true')  slot.lay = true;
      else if (layM[1] === 'false') slot.lay = false;
      else                          slot.lay = layM[1].slice(1);
    } else { slot.lay = true; }
    const upgM = h.match(/\bupgrade:\s*(true|false)/);
    slot.upgrade = upgM ? upgM[1] === 'true' : true;
    const costM = h.match(/\bcost:\s*(\d+)/);
    if (costM) slot.cost = parseInt(costM[1], 10);
    const ucM   = h.match(/\bupgrade_cost:\s*(\d+)/);
    if (ucM)   slot.upgrade_cost = parseInt(ucM[1], 10);
    if (/\bcannot_reuse_same_hex:\s*true/.test(h)) slot.cannot_reuse_same_hex = true;
    if (/\bhex_must_be_connected:\s*false/.test(h)) slot.hex_must_be_connected = false;
    if (/\bspecial:\s*true/.test(h)) slot.special = true;
    result.push(slot);
  }
  return result.length ? result : null;
}

function _parseGecHashVal(raw) {
  const gecRaw  = _parseSymSymHashVal(raw);
  const TIMING_DEFAULTS = {
    bank:         'full_or',
    bankrupt:     'immediate',
    stock_market: 'current_or',
    all_closed:   'immediate',
    final_train:  'one_more_full_or_set',
    final_round:  'one_more_full_or_set',
    final_or_set: 'one_more_full_or_set',
  };
  const result = {};
  for (const [key, defTiming] of Object.entries(TIMING_DEFAULTS)) {
    result[key] = gecRaw[key]
      ? { enabled: true,  timing: gecRaw[key] }
      : { enabled: false, timing: defTiming };
  }
  return result;
}

function _parseStatusTextVal(raw) {
  const result = {};
  const re     = /['"]([^'"]+)['"]\s*=>\s*\[([^\]]+)\]/g;
  let   m;
  while ((m = re.exec(raw)) !== null) {
    const key  = m[1];
    const vals = (m[2].match(/['"]([^'"]*)['"]/g) || [])
      .map(s => s.replace(/^['"]|['"]$/g, ''));
    result[key] = vals;
  }
  return Object.keys(result).length ? result : null;
}

// ── FM_SCHEMA ─────────────────────────────────────────────────────────────────
// Master schema for every constant the mechanics panel controls.
// Keys match the Ruby constant name exactly.
// emit:    serializer key used by export-game.js
// default: engine default — entry is omitted from export if value === default
// parse:   function(rawValueString) → jsValue

const FM_SCHEMA = {
  // Bank & Players
  'BANK_CASH':                         { emit: 'number_underscored', default: null,                   parse: _parseIntVal },
  'CURRENCY_FORMAT_STR':               { emit: 'string',             default: '$%s',                  parse: _parseStrVal },
  'STARTING_CASH':                     { emit: 'player_hash_num',    default: {},                     parse: _parseIntHashVal },
  'CERT_LIMIT':                        { emit: 'player_hash_num',    default: {},                     parse: _parseIntHashVal },
  // Corporation Rules
  'CAPITALIZATION':                    { emit: 'symbol',             default: 'full',                 parse: _parseSymVal },
  'HOME_TOKEN_TIMING':                 { emit: 'symbol',             default: 'operate',              parse: _parseSymVal },
  'MARKET_SHARE_LIMIT':                { emit: 'number',             default: 50,                     parse: _parseIntVal },
  'TRACK_RESTRICTION':                 { emit: 'symbol',             default: 'semi_restrictive',     parse: _parseSymVal },
  'BANKRUPTCY_ALLOWED':                { emit: 'bool',               default: true,                   parse: _parseBoolVal },
  'BANKRUPTCY_ENDS_GAME_AFTER':        { emit: 'symbol',             default: 'one',                  parse: _parseSymVal },
  // Stock Round
  'SELL_BUY_ORDER':                    { emit: 'symbol',             default: 'sell_buy_or_buy_sell', parse: _parseSymVal },
  'SELL_MOVEMENT':                     { emit: 'symbol',             default: 'down_share',           parse: _parseSymVal },
  'POOL_SHARE_DROP':                   { emit: 'symbol',             default: 'none',                 parse: _parseSymVal },
  'MUST_SELL_IN_BLOCKS':               { emit: 'bool',               default: false,                  parse: _parseBoolVal },
  'SELL_AFTER':                        { emit: 'symbol',             default: 'first',                parse: _parseSymVal },
  'SOLD_OUT_TOP_ROW_MOVEMENT':         { emit: 'symbol',             default: 'none',                 parse: _parseSymVal },
  // Operating Round
  'MUST_BUY_TRAIN':                    { emit: 'symbol',             default: 'route',                parse: _parseSymVal },
  'ALLOW_REMOVING_TOWNS':              { emit: 'bool',               default: false,                  parse: _parseBoolVal },
  'TILE_LAYS':                         { emit: 'tile_lay_array',     default: null,                   parse: _parseTileLayArrVal },
  'MAJOR_TILE_LAYS':                   { emit: 'tile_lay_array',     default: null,                   parse: _parseTileLayArrVal },
  'MINOR_TILE_LAYS':                   { emit: 'tile_lay_array',     default: null,                   parse: _parseTileLayArrVal },
  // Emergency Buy
  'EBUY_FROM_OTHERS':                  { emit: 'symbol',             default: 'value',                parse: _parseSymVal },
  'EBUY_DEPOT_TRAIN_MUST_BE_CHEAPEST': { emit: 'bool',               default: true,                   parse: _parseBoolVal },
  'MUST_EMERGENCY_ISSUE_BEFORE_EBUY':  { emit: 'bool',               default: false,                  parse: _parseBoolVal },
  'EBUY_OWNER_MUST_HELP':              { emit: 'bool',               default: false,                  parse: _parseBoolVal },
  'EBUY_CAN_SELL_SHARES':              { emit: 'bool',               default: true,                   parse: _parseBoolVal },
  'EBUY_PRES_SWAP':                    { emit: 'bool',               default: true,                   parse: _parseBoolVal },
  'EBUY_CAN_TAKE_PLAYER_LOAN':         { emit: 'symbol_or_bool',     default: false,
    parse: raw => { const t = raw.trim(); return t === 'false' ? false : t.replace(/^:/, ''); } },
  'PLAYER_LOAN_INTEREST_RATE':         { emit: 'number',             default: 50,                     parse: _parseIntVal },
  'PLAYER_LOAN_ENDGAME_PENALTY':       { emit: 'number',             default: 0,                      parse: _parseIntVal },
  // Game End
  'GAME_END_CHECK':                    { emit: 'gec_hash',           default: {},                     parse: _parseGecHashVal },
  // Phase status display
  'STATUS_TEXT':                       { emit: 'status_text_hash',   default: {},                     parse: _parseStatusTextVal },
  // Mail contracts (special arrays)
  'PRIVATE_MAIL_CONTRACTS':            { emit: 'word_array',         default: [],                     parse: _parseWordArrVal },
  'PRIVATE_REMOVE_REVENUE':            { emit: 'word_array',         default: [],                     parse: _parseWordArrVal },
};

// ── FM_REFS ───────────────────────────────────────────────────────────────────
// Constants parsed by other modules. Recognised and stored as ref entries;
// NOT passed through as raw.  Parsed by trains-panel.js / companies-panel.js.

const FM_REFS = {
  'TRAINS':       { stateKey: 'trains',    serializer: 'trains' },
  'PHASES':       { stateKey: 'phases',    serializer: 'phases' },
  'COMPANIES':    { stateKey: 'privates',  serializer: 'privates' },
  'CORPORATIONS': { stateKey: 'corpPacks', filter: 'major', serializer: 'corporations' },
  'MINORS':       { stateKey: 'corpPacks', filter: 'minor', serializer: 'corporations' },
};

// Constants that are structurally required by the file but carry no designer
// data — skip silently rather than creating raw entries.
const FM_SKIP = new Set(['DEV_STAGE', 'TITLE']);

// ── Method template matcher ───────────────────────────────────────────────────
// Returns a { type: 'method', template, params } entry if the method body
// matches a known template, or null otherwise.

function _igMatchMethodTemplate(name, body) {
  switch (name) {
    case 'routes_subsidy':
      if (body.includes('mail_contract_bonus'))
        return { type: 'method', template: 'mail_contract_first_last_half', params: {} };
      if (body.includes('PRIVATE_MAIL_CONTRACTS'))
        return { type: 'method', template: 'mail_contract_subsidy_generic', params: {} };
      break;
    case 'subsidy_name': {
      const nm = body.match(/['"]([^'"]+)['"]/);
      return { type: 'method', template: 'mail_contract_subsidy_name',
               params: { name: nm ? nm[1] : 'mail contract' } };
    }
    case 'mail_contract_bonus':
      return { type: 'method', template: 'mail_contract_bonus', params: {} };
    case 'revenue_for_route':
      if (body.includes('PRIVATE_MAIL_CONTRACTS')) {
        const amtM = body.match(/\*\s*(\d+)/);
        return { type: 'method', template: 'mail_contract_per_stop',
                 params: { amount: amtM ? parseInt(amtM[1], 10) : 10 } };
      }
      break;
  }
  return null;
}

// ── Main builder ──────────────────────────────────────────────────────────────
// Parses a raw game.rb string and returns a complete functionMap object.
// Every constant and method in the file is accounted for — nothing is silently
// dropped.  Unrecognised content becomes { type: 'raw', ... }.

function _rbBuildFunctionMap(rawSrc) {
  const src       = _igPreprocess(rawSrc);
  const constants = _igExtractAllConstants(src);
  const methods   = _igExtractAllMethods(src);
  const fmap      = {};

  // ── Process constants ──────────────────────────────────────────────────────

  for (const [name, rawVal] of constants) {
    // Skip ref constants — other agents own their parsing
    if (FM_REFS[name]) {
      fmap[name] = Object.assign({ type: 'ref' }, FM_REFS[name]);
      continue;
    }

    // Skip structural-only constants
    if (FM_SKIP.has(name)) continue;

    const schema = FM_SCHEMA[name];
    if (schema) {
      // Known constant — parse value
      let value;
      try {
        value = schema.parse(rawVal);
      } catch (e) {
        // Parse failed → raw fallback
        fmap[name] = {
          type: 'raw', ruby: `${name} = ${rawVal}`,
          label: name, hint: `parse error: ${e.message}`,
        };
        continue;
      }
      fmap[name] = {
        type: 'const', emit: schema.emit, default: schema.default, value,
      };
    } else {
      // Unknown constant → raw
      fmap[name] = {
        type: 'raw',
        ruby: `${name} = ${rawVal}`,
        label: name,
        hint: 'Unknown constant — not yet configurable in UI',
      };
    }
  }

  // ── Add ref entries for constants not in source (so export knows about them) ─
  // Only add if state is available and the ref's stateKey has content.
  // This handles the case where TRAINS/PHASES were defined in a separate file.
  for (const [name, refDef] of Object.entries(FM_REFS)) {
    if (!fmap[name]) {
      // Not found in source — still record as ref so export can find it
      fmap[name] = Object.assign({ type: 'ref' }, refDef);
    }
  }

  // ── Process methods ────────────────────────────────────────────────────────

  for (const [name, body] of methods) {
    const templateEntry = _igMatchMethodTemplate(name, body);
    if (templateEntry) {
      fmap[name] = templateEntry;
    } else {
      fmap[name] = {
        type: 'raw',
        ruby: body,
        label: `def ${name}`,
        hint: 'Method not yet configurable in UI',
      };
    }
  }

  return fmap;
}

// ── Diagnostic summary ────────────────────────────────────────────────────────
// Returns a human-readable summary of the functionMap for the console.
function _fmapSummary(fmap) {
  const byType = { const: [], ref: [], method: [], raw: [] };
  for (const [key, entry] of Object.entries(fmap)) {
    (byType[entry.type] || byType.raw).push(key);
  }
  return [
    `functionMap: ${Object.keys(fmap).length} entries`,
    `  const:  ${byType.const.length}  (${byType.const.join(', ')})`,
    `  ref:    ${byType.ref.length}   (${byType.ref.join(', ')})`,
    `  method: ${byType.method.length} (${byType.method.join(', ')})`,
    `  raw:    ${byType.raw.length}   (${byType.raw.join(', ')})`,
  ].join('\n');
}

// ── Event wiring ──────────────────────────────────────────────────────────────
// Second listener on #importGameFile — fires after import-ruby.js has already
// processed the file.  Reads the file independently and builds the functionMap.

const _igFileInput = document.getElementById('importGameFile');
if (_igFileInput) {
  _igFileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      try {
        if (typeof state === 'undefined') return;
        if (!state.mechanics) {
          if (typeof initMechanicsState === 'function') initMechanicsState();
          else return;
        }
        const fmap = _rbBuildFunctionMap(ev.target.result);
        state.mechanics.functionMap = fmap;
        console.log('[import-game]', _fmapSummary(fmap));
      } catch (err) {
        console.error('[import-game] functionMap build failed:', err);
      }
    };
    reader.readAsText(file);
  });
}

// ── Exports for testing / external callers ────────────────────────────────────
// (no module system — expose on window so devtools can call them)
window._rbBuildFunctionMap = _rbBuildFunctionMap;
window._fmapSummary        = _fmapSummary;
window.FM_SCHEMA            = FM_SCHEMA;
window.FM_REFS              = FM_REFS;
