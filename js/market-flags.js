// ─── MARKET FLAGS — TOBYMAO TYPE_MAP MIRROR ───────────────────────────────────
// Single source of truth for stock-market cell flags.
// Mirrors Engine::SharePrice::TYPE_MAP from lib/engine/share_price.rb.
//
// Cell string format: '<digits><flag-chars>' e.g. '100p', '40y', '100xp', '0c'.
// SharePrice.from_code parses this with /(\d*)([a-zA-Z]*)/ — we mirror it.

// ── Char → canonical type name (long form) ───────────────────────────────────
const FLAG_TYPE_MAP = {
  p: 'par',
  e: 'endgame',
  c: 'close',
  b: 'multiple_buy',
  o: 'unlimited',
  y: 'no_cert_limit',
  l: 'liquidation',
  a: 'acquisition',
  r: 'repar',
  i: 'ignore_one_sale',
  j: 'ignore_two_sales',
  s: 'safe_par',
  P: 'par_overlap',
  x: 'par_1',
  z: 'par_2',
  w: 'par_3',
  C: 'convert_range',
  m: 'max_price',
  n: 'max_price_1',
  u: 'phase_limited',
  t: 'type_limited',
  B: 'pays_bonus',
  W: 'pays_bonus_1',
  X: 'pays_bonus_2',
  Y: 'pays_bonus_3',
  Z: 'pays_bonus_4',
  S: 'share_split',
  f: 'only_president',
};

// ── Per-flag UI metadata ─────────────────────────────────────────────────────
// category:
//   'par'      — par cluster. Stacks (par + par_1 = '100xp' in 1822).
//   'band'     — mutually exclusive zone color (close vs unlimited makes no sense).
//   'special'  — endgame/liquidation/acquisition. Mutually exclusive — one outcome.
//   'modifier' — stackable secondary annotations (repar, safe_par, etc).
//   'bonus'    — pays_bonus tiers. One per cell in practice; treated as modifier with bonus value.
// tier:  1 = always-visible brush. 2 = in 'More flags' popover.
const FLAG_DEFS = {
  // ── Par cluster ───────────────────────
  par:         { char: 'p', label: 'Par',         category: 'par',     color: '#d97070', text: 'Companies par here',                tier: 1 },
  par_1:       { char: 'x', label: 'Par 1',       category: 'par',     color: '#c0392b', text: 'Par range #1 (1822 majors+minors)', tier: 1 },
  par_2:       { char: 'z', label: 'Par 2',       category: 'par',     color: '#a83232', text: 'Par range #2',                      tier: 2 },
  par_3:       { char: 'w', label: 'Par 3',       category: 'par',     color: '#8b1d1d', text: 'Par range #3',                      tier: 2 },
  par_overlap: { char: 'P', label: 'Par overlap', category: 'par',     color: '#7d4040', text: 'Overlapping par range',             tier: 2 },

  // ── Band (mutually exclusive zone) ────
  no_cert_limit: { char: 'y', label: 'No cert limit', category: 'band', color: '#c8b030', text: 'Shares do not count toward cert limit', tier: 1 },
  unlimited:     { char: 'o', label: 'Unlimited',     category: 'band', color: '#c87830', text: 'Holdings may exceed 60%',                tier: 1 },
  multiple_buy:  { char: 'b', label: 'Multiple buy',  category: 'band', color: '#8c5028', text: 'Buy more than one share per turn',       tier: 1 },
  close:         { char: 'c', label: 'Close',         category: 'band', color: '#1d1d1d', text: 'Corporation closes',                     tier: 1 },

  // ── Special triggers (mutex within category) ────
  endgame:     { char: 'e', label: 'Endgame',     category: 'special', color: '#3a78c0', text: 'Reaching this triggers endgame', tier: 1 },
  liquidation: { char: 'l', label: 'Liquidation', category: 'special', color: '#7d2222', text: 'Corporation liquidates',         tier: 2 },
  acquisition: { char: 'a', label: 'Acquisition', category: 'special', color: '#a37820', text: 'Corporation can be acquired',    tier: 2 },

  // ── Modifiers (stackable) ───────────
  repar:            { char: 'r', label: 'Repar',           category: 'modifier', color: '#888888', text: 'Par after bankruptcy',           tier: 1 },
  ignore_one_sale:  { char: 'i', label: 'Ignore 1 sale',   category: 'modifier', color: '#5a8a5a', text: 'Ignore first sale this turn',    tier: 1 },
  ignore_two_sales: { char: 'j', label: 'Ignore 2 sales',  category: 'modifier', color: '#467046', text: 'Ignore first two sales',         tier: 2 },
  safe_par:         { char: 's', label: 'Safe par',        category: 'modifier', color: '#dcdcdc', text: 'Minimum safe par',               tier: 2 },
  max_price:        { char: 'm', label: 'Max price',       category: 'modifier', color: '#7050a0', text: 'Maximum share price',            tier: 2 },
  max_price_1:      { char: 'n', label: 'Max price 1',     category: 'modifier', color: '#5a3e80', text: 'Secondary max price',            tier: 2 },
  share_split:      { char: 'S', label: 'Share split',     category: 'modifier', color: '#5070a0', text: 'Share split point',              tier: 2 },
  convert_range:    { char: 'C', label: 'Convert range',   category: 'modifier', color: '#506080', text: 'Conversion range',               tier: 2 },
  only_president:   { char: 'f', label: 'Pres only',       category: 'modifier', color: '#a04060', text: 'Only president can sell',        tier: 2 },
  phase_limited:    { char: 'u', label: 'Phase limited',   category: 'modifier', color: '#606080', text: 'Limited by phase',               tier: 2 },
  type_limited:     { char: 't', label: 'Type limited',    category: 'modifier', color: '#508080', text: 'Limited by corp type',           tier: 2 },

  // ── Train-run bonuses ───────────────
  pays_bonus:   { char: 'B', label: 'Bonus +',     category: 'bonus', color: '#a8b850', text: 'Train-run bonus tier 1', tier: 1, bonus: true },
  pays_bonus_1: { char: 'W', label: 'Bonus ++',    category: 'bonus', color: '#b89030', text: 'Train-run bonus tier 2', tier: 2, bonus: true },
  pays_bonus_2: { char: 'X', label: 'Bonus +++',   category: 'bonus', color: '#c87838', text: 'Train-run bonus tier 3', tier: 2, bonus: true },
  pays_bonus_3: { char: 'Y', label: 'Bonus ++++',  category: 'bonus', color: '#888030', text: 'Train-run bonus tier 4', tier: 2, bonus: true },
  pays_bonus_4: { char: 'Z', label: 'Bonus +++++', category: 'bonus', color: '#5a7038', text: 'Train-run bonus tier 5', tier: 2, bonus: true },
};

// Stable serialization order (par cluster first, then band, special, modifier, bonus).
// Keeps re-imports stable: parse('100xp') → serialize → '100xp', not '100px'.
const FLAG_SERIALIZE_ORDER = [
  'par_1', 'par_2', 'par_3', 'par_overlap', 'par',
  'no_cert_limit', 'unlimited', 'multiple_buy', 'close',
  'endgame', 'liquidation', 'acquisition',
  'safe_par', 'repar', 'ignore_one_sale', 'ignore_two_sales',
  'max_price', 'max_price_1', 'share_split', 'convert_range',
  'only_president', 'phase_limited', 'type_limited',
  'pays_bonus', 'pays_bonus_1', 'pays_bonus_2', 'pays_bonus_3', 'pays_bonus_4',
];

// ── Parse / serialize ────────────────────────────────────────────────────────
function parseCell(str) {
  if (str == null || str === '') return { price: null, types: [] };
  const m = String(str).match(/^(\d+)([a-zA-Z]*)$/);
  if (!m) return { price: null, types: [], raw: String(str) };
  const price = parseInt(m[1], 10);
  const types = [];
  for (const ch of (m[2] || '')) {
    const type = FLAG_TYPE_MAP[ch];
    if (type && !types.includes(type)) types.push(type);
  }
  return { price, types };
}

function serializeCell(cell) {
  if (!cell || cell.price == null || isNaN(cell.price)) return '';
  const ordered = FLAG_SERIALIZE_ORDER.filter(t => (cell.types || []).includes(t));
  const chars = ordered.map(t => FLAG_DEFS[t].char).join('');
  return `${cell.price}${chars}`;
}

// ── Visual primary picker ────────────────────────────────────────────────────
// Decides which single flag drives the cell background color.
// Priority: par cluster > band > special > bonus > modifier.
const PRIMARY_PRIORITY = [
  'par_1', 'par_overlap', 'par_2', 'par_3', 'par',         // par cluster: par_1 wins to surface 1822 majors-only par
  'close',                                                  // 'close' before other bands so '0c' looks closed not cert-limited
  'no_cert_limit', 'unlimited', 'multiple_buy',             // band
  'endgame', 'liquidation', 'acquisition',                  // special
  'pays_bonus', 'pays_bonus_1', 'pays_bonus_2', 'pays_bonus_3', 'pays_bonus_4', // bonus
];

function cellPrimary(cell) {
  if (!cell || !cell.types || cell.types.length === 0) return null;
  for (const t of PRIMARY_PRIORITY) {
    if (cell.types.includes(t)) return t;
  }
  return null; // modifiers don't drive color on their own
}

function cellSecondaries(cell) {
  if (!cell || !cell.types) return [];
  const primary = cellPrimary(cell);
  return cell.types.filter(t => t !== primary);
}

// ── Flag mutation with category mutex ───────────────────────────────────────
// `band` and `special` enforce mutual exclusion within their category.
// `par` cluster does NOT — par + par_1 stacks ('100xp' in 1822).
// `modifier` and `bonus` stack freely (though one bonus per cell is the norm).
function setCellFlag(cell, type, on) {
  const def = FLAG_DEFS[type];
  if (!def) return cell;
  const types = (cell.types || []).slice();
  const has = types.includes(type);

  if (on === false || (on == null && has)) {
    // Remove
    const i = types.indexOf(type);
    if (i >= 0) types.splice(i, 1);
  } else if (!has) {
    // Add. Enforce mutex for band/special.
    if (def.category === 'band' || def.category === 'special') {
      for (const other of Object.keys(FLAG_DEFS)) {
        if (other === type) continue;
        if (FLAG_DEFS[other].category !== def.category) continue;
        const i = types.indexOf(other);
        if (i >= 0) types.splice(i, 1);
      }
    }
    types.push(type);
  }
  return { price: cell.price, types };
}

function toggleCellFlag(cell, type) { return setCellFlag(cell, type, undefined); }

// ── Cell-string helpers (work on the canonical string in state) ─────────────
function cellStrSetFlag(str, type, on) {
  const cell = parseCell(str);
  if (cell.price == null) {
    if (!on) return str;             // can't add flags to an empty cell
    return serializeCell({ price: 0, types: [type] }); // shouldn't happen via normal UI
  }
  return serializeCell(setCellFlag(cell, type, on));
}

function cellStrToggleFlag(str, type) {
  const cell = parseCell(str);
  if (cell.price == null) return str;
  return serializeCell(toggleCellFlag(cell, type));
}

// Display helpers — return an array of {type, def} for ordered render.
function cellOrderedTypes(cell) {
  if (!cell || !cell.types) return [];
  return FLAG_SERIALIZE_ORDER
    .filter(t => cell.types.includes(t))
    .map(t => ({ type: t, def: FLAG_DEFS[t] }));
}

// ── Par range derivation ────────────────────────────────────────────────────
// Mirrors Engine::SharePrice::PAR_TYPES — the cell flags whose corporations
// can par at this cell. Used by:
//   • the companies panel to constrain / suggest valid parValue.
//   • the bridge to populate @par_prices analogous to tobymao.
//   • the market legend for at-a-glance "Par prices: 60, 70, 80…" display.
const PAR_TYPES = ['par', 'par_overlap', 'par_1', 'par_2', 'par_3'];

// Collect all par-eligible prices from the market grid. Accepts either a 2D
// array-of-arrays or a 1D flat array; returns a sorted ascending unique number list.
// Caller can then offer dropdown options or validate parValue ∈ list.
function getParPrices(market) {
  if (!market) return [];
  const flat = Array.isArray(market[0]) ? market.flat() : market;
  const set  = new Set();
  for (const v of flat) {
    if (!v) continue;
    const cell = parseCell(v);
    if (cell.price == null) continue;
    if (cell.types.some(t => PAR_TYPES.includes(t))) set.add(cell.price);
  }
  return Array.from(set).sort((a, b) => a - b);
}

// Per-par-type breakdown — useful when a game has multiple par categories
// (1822: 'par' for minors, 'par_1' for majors). Returns
//   { par: [60, 70, 80], par_1: [100], ... }
function getParPricesByType(market) {
  if (!market) return {};
  const flat = Array.isArray(market[0]) ? market.flat() : market;
  const buckets = {};
  for (const v of flat) {
    if (!v) continue;
    const cell = parseCell(v);
    if (cell.price == null) continue;
    for (const t of cell.types) {
      if (PAR_TYPES.includes(t)) {
        if (!buckets[t]) buckets[t] = new Set();
        buckets[t].add(cell.price);
      }
    }
  }
  const out = {};
  for (const [t, set] of Object.entries(buckets)) {
    out[t] = Array.from(set).sort((a, b) => a - b);
  }
  return out;
}

// Brush definitions — buttons in the toolbar. Includes non-flag tools.
// Order matters for layout. Tier 1 brushes go in the toolbar; tier 2 in the popover.
const BRUSH_DEFS = {
  // Tools (not flags)
  price:  { kind: 'tool', label: 'Price',  hint: 'Edit price (default)',         icon: '✎' },
  lock:   { kind: 'tool', label: 'Lock',   hint: 'Lock cell from auto-solver',   icon: '⌧' },
  eraser: { kind: 'tool', label: 'Erase',  hint: 'Clear cell flags & price',     icon: '⌫' },
};
// Add flag brushes from FLAG_DEFS
for (const [type, def] of Object.entries(FLAG_DEFS)) {
  BRUSH_DEFS[type] = { kind: 'flag', flag: type, label: def.label, hint: def.text, color: def.color, tier: def.tier, category: def.category };
}

// Categorize brushes for the More-flags popover.
const BRUSH_CATEGORY_ORDER = ['par', 'band', 'special', 'modifier', 'bonus'];
const BRUSH_CATEGORY_LABEL = {
  par: 'Par cluster',
  band: 'Zone band',
  special: 'Special trigger',
  modifier: 'Modifier',
  bonus: 'Train-run bonus',
};

// ── Globals ──────────────────────────────────────────────────────────────────
window.FLAG_TYPE_MAP = FLAG_TYPE_MAP;
window.FLAG_DEFS = FLAG_DEFS;
window.FLAG_SERIALIZE_ORDER = FLAG_SERIALIZE_ORDER;
window.BRUSH_DEFS = BRUSH_DEFS;
window.BRUSH_CATEGORY_ORDER = BRUSH_CATEGORY_ORDER;
window.BRUSH_CATEGORY_LABEL = BRUSH_CATEGORY_LABEL;
window.parseCell = parseCell;
window.serializeCell = serializeCell;
window.cellPrimary = cellPrimary;
window.cellSecondaries = cellSecondaries;
window.cellOrderedTypes = cellOrderedTypes;
window.setCellFlag = setCellFlag;
window.toggleCellFlag = toggleCellFlag;
window.cellStrSetFlag = cellStrSetFlag;
window.cellStrToggleFlag = cellStrToggleFlag;
window.PAR_TYPES = PAR_TYPES;
window.getParPrices = getParPrices;
window.getParPricesByType = getParPricesByType;
