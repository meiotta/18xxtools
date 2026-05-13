// sidecar/autotest/gen_preview.js
// Node-only preview generator — no Puppeteer, no browser.
//
// Loads the four Ruby exporters into a vm sandbox, builds synthetic state for
// four representative forge-style configurations (setups C / D / E and a
// transposed map variant), calls renderGameRb() / renderEntitiesRb() /
// renderMetaRb() / exportRubyMap(), writes .rb files to
//   sidecar/autotest/preview/<id>/
// then attempts `ruby -c` on each generated file (skips silently if Ruby is
// not installed).
//
// Run: node sidecar/autotest/gen_preview.js
// No dependencies beyond Node built-ins; no npm install required.

'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// ── Paths ─────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '../..');
const JS   = path.join(ROOT, 'js');
const OUT  = path.join(__dirname, 'preview');

// ── Browser global shims ──────────────────────────────────────────────────────
// The exporter scripts wire DOM button listeners at load time.  A stub element
// with a no-op addEventListener silences those wiring calls safely.

function _stubEl() { return { addEventListener: () => {}, href: '', download: '', click: () => {} }; }

const BROWSER_SHIMS = {
  document: {
    getElementById:  () => _stubEl(),
    createElement:   () => _stubEl(),
    body: { appendChild: () => {}, removeChild: () => {} },
  },
  window: {
    staticHexCode: () => '',
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
  },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  URL:   { createObjectURL: () => '', revokeObjectURL: () => {} },
  alert: () => {},
  console,
};

// ── Build the vm context and load exporter scripts ────────────────────────────
//
// Load order matters:
//   1. hex-geometry.js   — hexId() for exportRubyMap
//   2. serialize-ability.js — _serializeAbility() for export-game / export-entities
//   3. export-ruby.js    — exportRubyMap()
//   4. export-game.js    — renderGameRb() / renderEntitiesRb() / renderMetaRb()
//
// Function declarations (function foo(){}) ARE hoisted to the vm context global.
// Top-level const/let stay in the script's own closure scope — fine for internal
// state like _GRB_MODULES, ABILITY_BASE_KWARGS, _GAME_RB_SKELETON.

function buildContext() {
  const ctx = vm.createContext(Object.assign({}, BROWSER_SHIMS));

  const files = [
    'hex-geometry.js',
    'serialize-ability.js',
    'export-ruby.js',
    'export-game.js',
  ];
  for (const f of files) {
    const src = fs.readFileSync(path.join(JS, f), 'utf8');
    try {
      vm.runInContext(src, ctx, { filename: f });
    } catch (e) {
      console.error(`[gen_preview] failed to load ${f}: ${e.message}`);
      process.exit(1);
    }
  }
  return ctx;
}

// ── Hex-grid builder ──────────────────────────────────────────────────────────
// Builds a flat coordParity=0 hex grid (state.hexes) with a handful of
// interesting features without loading a real map file.
//
//   hexKey(row, col, cp=0) → tobymao coordinate string for flat orientation
//     cp=0 (default, e.g. 1889): even cols A2,A4… odd cols B1,B3…
//     cp=1 (e.g. 1830):          even cols A1,A3… odd cols B2,B4…

function hexKey(row, col, cp = 0) {
  const letter  = String.fromCharCode(65 + col);
  const evenCol = (col % 2 === 0);
  const coordRow = (evenCol === (cp === 0)) ? (2 * row + 2) : (2 * row + 1);
  return letter + coordRow;
}

// Build a 5×4 grid (rows=5, cols=4).  Populates a sparse handful of hexes so
// every color bucket and node type gets exercised.
function buildHexes(cp = 0) {
  const h = {};

  // (0,0) white city, single slot
  h[hexKey(0, 0, cp)] = {
    bg: 'white',
    nodes: [{ type: 'city', originalType: 'city', flat: 0, slots: 1, locStr: 'center' }],
    paths: [],
  };

  // (1,0) white town
  h[hexKey(1, 0, cp)] = {
    bg: 'white',
    nodes: [{ type: 'town', originalType: 'town', flat: 0, locStr: 'center' }],
    paths: [],
  };

  // (0,1) white 2-city
  h[hexKey(0, 1, cp)] = {
    bg: 'white',
    nodes: [
      { type: 'city', originalType: 'city', flat: 0, slots: 2, locStr: 'center' },
    ],
    paths: [],
  };

  // (2,0) yellow upgrade hex (blank yellow)
  h[hexKey(2, 0, cp)] = {
    bg: 'yellow',
    nodes: [],
    paths: [
      { a: { type: 'edge', n: 0 }, b: { type: 'edge', n: 3 } },
    ],
  };

  // (2,1) green upgrade hex
  h[hexKey(2, 1, cp)] = {
    bg: 'green',
    nodes: [{ type: 'town', originalType: 'town', flat: 10, locStr: 'center' }],
    paths: [
      { a: { type: 'edge', n: 0 }, b: { type: 'node', n: 0 } },
      { a: { type: 'edge', n: 3 }, b: { type: 'node', n: 0 } },
    ],
  };

  // (3,2) red offboard
  h[hexKey(3, 2, cp)] = {
    bg: 'red',
    feature: 'offboard',
    phaseRevenue: { yellow: 20, green: 30, brown: 40, gray: 50 },
    activePhases: { yellow: true, green: true, brown: true, gray: true },
    nodes: [],
    paths: [
      { a: { type: 'edge', n: 0 }, b: { type: 'edge', n: 1 } },
    ],
  };

  // (1,2) gray terminal city
  h[hexKey(1, 2, cp)] = {
    bg: 'gray',
    nodes: [{ type: 'city', originalType: 'city', flat: 40, slots: 2, locStr: 'center' }],
    paths: [
      { a: { type: 'edge', n: 2 }, b: { type: 'node', n: 0 } },
      { a: { type: 'edge', n: 4 }, b: { type: 'node', n: 0 } },
    ],
    cityName: 'Terminus',
  };

  // Remaining hexes are absent from the map (null/undefined → blank white in export)
  return h;
}

// ── Common trains / phases / market ──────────────────────────────────────────

const TRAINS = [
  { id: 't2', label: '2', distType: 'n', n: 2, cost: 100, count: 6, rusts: true,  rustsOn: 't4' },
  { id: 't3', label: '3', distType: 'n', n: 3, cost: 200, count: 5, rusts: true,  rustsOn: 't6' },
  { id: 't4', label: '4', distType: 'n', n: 4, cost: 300, count: 4, rusts: false, rustsOn: null },
  { id: 't6', label: '6', distType: 'n', n: 6, cost: 600, count: 2, rusts: false, rustsOn: null },
];

const PHASES = [
  { name: '2', onTrain: 't2', limit: 4, tiles: 'yellow', ors: 2, status: [] },
  { name: '3', onTrain: 't3', limit: 4, tiles: 'green',  ors: 2, status: [] },
  { name: '4', onTrain: 't4', limit: 3, tiles: 'brown',  ors: 2, status: [] },
  { name: '6', onTrain: 't6', limit: 2, tiles: 'grey',   ors: 3, status: [] },
];

const MARKET_2D = [
  [60,  67,  71,  76,  82,  90, 100, 112, 126, 142, 160, 180],
  [53,  60,  66,  70,  76,  82,  90, 100, 112, 126, 142, 160],
  [46,  55,  60,  65,  70,  76,  82,  90, 100, 112, 126, 142],
  [39,  48,  54,  60,  66,  71,  76,  82,  90, 100, 112, 126],
  [ '', 41,  48,  55,  62,  67,  71,  76,  82,  90, 100, 112],
  [ '', '',  41,  48,  55,  62,  67,  71,  76,  82,  90, 100],
];

function baseMechanics() {
  return {
    minPlayers: 2, maxPlayers: 6,
    bankCash: 12000,
    startingCash: { 2: 1200, 3: 800, 4: 600, 5: 480, 6: 400 },
    certLimit:    { 2: 28,   3: 20,  4: 16,  5: 13,  6: 11  },
    capitalization:        'full',
    homeTokenTiming:       'operate',
    marketShareLimit:      50,
    trackRestriction:      'semi_restrictive',
    bankruptcyAllowed:     true,
    bankruptcyEndsGameAfter: 'one',
    sellBuyOrder:    'sell_buy_or_buy_sell',
    sellMovement:    'down_share',
    poolShareDrop:   'none',
    mustSellInBlocks: false,
    sellAfter:       'first',
    mustBuyTrain:    'route',
    allowRemovingTowns: false,
    ebuyFromOthers:  'value',
    ebuyDepotCheapest: true,
    export_train: true,
    rounds: {},
  };
}

// ── Corp builders ─────────────────────────────────────────────────────────────
// corporations/minors modules read state.companies[] and state.minors[] as flat
// arrays.  _rbCorp(co, co, gameCap) passes the corp object as both corp and pack,
// so pack-level fields (tokens, shares, floatPct, capitalization) must live on
// the company object itself.

const COLORS = ['#EF1D24', '#0066A5', '#00A651', '#FFCC00', '#F47C20', '#7E2D86'];

function mkMajors(defs) {
  return defs.map((c, i) => ({
    type: 'major',
    sym: c.sym,
    name: c.name,
    color: c.color || COLORS[i % COLORS.length],
    textColor: '#fff',
    coordinates: c.home,
    tokens: [0, 40, 100],
    shares: [20, 10, 10, 10, 10, 10, 10, 10, 10],
    floatPct: 60,
    capitalization: 'full',
    abilities: [],
  }));
}

function mkMinors(defs) {
  return defs.map((c, i) => ({
    type: 'minor',
    sym: c.sym,
    name: c.name,
    color: c.color || COLORS[i % COLORS.length],
    textColor: '#fff',
    coordinates: c.home,
    tokens: [0],
    shares: [100],
    floatPct: 50,
    capitalization: 'full',
    abilities: [],
  }));
}

// ── Preview configurations ────────────────────────────────────────────────────

const CONFIGS = [
  {
    id: 'preview_C',
    desc: 'setup C — 6 majors, flat 1830-like (5×4 grid)',
    state: (cp) => ({
      meta: { title: 'PreviewC', rows: 5, cols: 4, orientation: 'flat', coordParity: cp },
      hexes: buildHexes(cp),
      trains: TRAINS,
      phases: PHASES,
      financials: { market: MARKET_2D },
      mechanics: baseMechanics(),
      companies: mkMajors([
        { sym: 'AA', name: 'Alpha Railway',   home: 'A1' },
        { sym: 'AB', name: 'Beta Railway',    home: 'C2' },
        { sym: 'AC', name: 'Gamma Railway',   home: 'B2' },
        { sym: 'AD', name: 'Delta Railway',   home: 'D1' },
        { sym: 'AE', name: 'Epsilon Railway', home: 'A3' },
        { sym: 'AF', name: 'Zeta Railway',    home: 'C4' },
      ]),
      minors: [],
      privates: [],
    }),
    coordParity: 1,
  },

  {
    id: 'preview_D',
    desc: 'setup D — 3 majors + 8 minors, flat',
    state: (cp) => ({
      meta: { title: 'PreviewD', rows: 5, cols: 4, orientation: 'flat', coordParity: cp },
      hexes: buildHexes(cp),
      trains: TRAINS,
      phases: PHASES,
      financials: { market: MARKET_2D },
      mechanics: Object.assign(baseMechanics(), { capitalization: 'incremental' }),
      companies: mkMajors([
        { sym: 'AA', name: 'Alpha Railway', home: 'A2' },
        { sym: 'AB', name: 'Beta Railway',  home: 'C2' },
        { sym: 'AC', name: 'Gamma Railway', home: 'B1' },
      ]),
      minors: mkMinors([
        { sym: 'MA', name: 'Minor MA', home: 'D1' },
        { sym: 'MB', name: 'Minor MB', home: 'A4' },
        { sym: 'MC', name: 'Minor MC', home: 'C4' },
        { sym: 'MD', name: 'Minor MD', home: 'B3' },
        { sym: 'ME', name: 'Minor ME', home: 'D3' },
        { sym: 'MF', name: 'Minor MF', home: 'A6' },
        { sym: 'MG', name: 'Minor MG', home: 'C6' },
        { sym: 'MH', name: 'Minor MH', home: 'B5' },
      ]),
      privates: [],
    }),
    coordParity: 0,
  },

  {
    id: 'preview_E',
    desc: 'setup E — 5 majors + national + 3 privates',
    state: (cp) => ({
      meta: { title: 'PreviewE', rows: 5, cols: 4, orientation: 'flat', coordParity: cp },
      hexes: buildHexes(cp),
      trains: TRAINS,
      phases: PHASES,
      financials: { market: MARKET_2D },
      mechanics: Object.assign(baseMechanics(), {
        national_operates: true,
        export_train: true,
      }),
      companies: mkMajors([
        { sym: 'AA', name: 'Alpha Railway',    home: 'A2', color: '#EF1D24' },
        { sym: 'AB', name: 'Beta Railway',     home: 'C2', color: '#0066A5' },
        { sym: 'AC', name: 'Gamma Railway',    home: 'B1', color: '#00A651' },
        { sym: 'AD', name: 'Delta Railway',    home: 'D1', color: '#FFCC00' },
        { sym: 'AE', name: 'Epsilon Railway',  home: 'A4', color: '#F47C20' },
        { sym: 'NTL', name: 'National Railway', home: 'C4', color: '#222222' },
      ]),
      minors: [],
      privates: [
        { sym: 'AC1', name: 'Alpha Concession', cost: 20,  revenue: 5,  abilities: [] },
        { sym: 'BC1', name: 'Beta Concession',  cost: 45,  revenue: 10, abilities: [] },
        { sym: 'GC1', name: 'Gamma Concession', cost: 70,  revenue: 15, abilities: [
          { type: 'tile_lay', owner_type: 'corporation',
            count: 1, free: false, closed_when_used_up: true, reachable: true,
            hexes: [], tiles: [] },
        ]},
      ],
    }),
    coordParity: 1,
  },

  {
    id: 'preview_T',
    desc: 'setup C + transposed axes (staggerParity=1) — exercises AXES emission',
    state: (cp) => ({
      meta: {
        title: 'PreviewT', rows: 5, cols: 4,
        orientation: 'flat', coordParity: cp, staggerParity: 1,
      },
      hexes: buildHexes(cp),
      trains: TRAINS,
      phases: PHASES,
      financials: { market: MARKET_2D },
      mechanics: baseMechanics(),
      companies: mkMajors([
        { sym: 'AA', name: 'Alpha Railway', home: 'A2' },
        { sym: 'AB', name: 'Beta Railway',  home: 'C2' },
        { sym: 'AC', name: 'Gamma Railway', home: 'B1' },
        { sym: 'AD', name: 'Delta Railway', home: 'D1' },
      ]),
      minors: [],
      privates: [],
    }),
    coordParity: 0,
  },
];

// ── Export runner ─────────────────────────────────────────────────────────────

function runConfig(ctx, cfg) {
  const state = cfg.state(cfg.coordParity);
  ctx.state   = state;

  const out = {};
  for (const [fn, key] of [
    ['renderGameRb',      'game.rb'],
    ['renderEntitiesRb',  'entities.rb'],
    ['renderMetaRb',      'meta.rb'],
    ['exportRubyMap',     'map.rb'],
    ['renderNamespaceRb', 'namespace.rb'],
  ]) {
    try {
      out[key] = vm.runInContext(`${fn}()`, ctx);
    } catch (e) {
      out[key] = `# ERROR in ${fn}: ${e.message}\n`;
      console.error(`  [${cfg.id}] ${fn}() threw:`, e.message);
    }
  }
  return out;
}

// ── ruby -c check ─────────────────────────────────────────────────────────────

function rubyCheck(filePath) {
  const r = spawnSync('ruby', ['-c', filePath], { encoding: 'utf8' });
  if (r.error) return { ok: null, note: 'ruby not found' };
  if (r.status === 0) return { ok: true,  note: 'Syntax OK' };
  return { ok: false, note: (r.stderr || r.stdout || '').trim().split('\n')[0] };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const ctx = buildContext();

let totalFiles = 0, passed = 0, failed = 0, noRuby = false;
const results = [];

for (const cfg of CONFIGS) {
  const dir = path.join(OUT, cfg.id);
  fs.mkdirSync(dir, { recursive: true });

  console.log(`\n[${cfg.id}] ${cfg.desc}`);
  const out = runConfig(ctx, cfg);

  for (const [filename, content] of Object.entries(out)) {
    const p = path.join(dir, filename);
    fs.writeFileSync(p, content, 'utf8');
    totalFiles++;

    const check = rubyCheck(p);
    if (check.ok === null) { noRuby = true; }
    else if (check.ok)     { passed++; }
    else                   { failed++; }

    const tag = check.ok === null ? 'SKIP' : (check.ok ? 'PASS' : 'FAIL');
    console.log(`  ${tag}  ${filename}  ${check.ok === false ? '→ ' + check.note : ''}`);
    results.push({ id: cfg.id, file: filename, tag, note: check.note });
  }
}

console.log(`\n─────────────────────────────────────────`);
console.log(`Files written : ${totalFiles}  (${CONFIGS.length} configs × 4)`);
if (noRuby) {
  console.log(`ruby -c       : skipped (ruby not in PATH)`);
} else {
  console.log(`ruby -c       : ${passed} PASS  ${failed} FAIL`);
}
console.log(`Preview dir   : ${OUT}`);
