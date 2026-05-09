// js/round-trip-tests.js  — dev-only, NOT loaded by index.html automatically
//
// Round-trip fidelity tests for the TRAINS/PHASES export pipeline.
// Covers the 8 games listed in Anthony's architecture brief.
//
// Usage (browser console, after manually loading this file):
//   runRoundTripTest('1830', gameRbText)   // single game
//   runAllRoundTripTests()                  // prompts for each file in sequence
//
// Each test:
//   1. Imports game.rb → state clone
//   2. Exports TRAINS + PHASES back to Ruby via renderGameRb()
//   3. Re-imports the export output
//   4. Compares structural fields (counts, key values) between original and roundtrip
//
// "Fidelity" here means structural equivalence, not byte identity —
// Ruby whitespace and field ordering may differ but the semantic content must match.
//
// Tobymao source paths for reference:
//   C:\Users\meiot\Rail\18xx-master\lib\engine\game\g_1822\game.rb
//   C:\Users\meiot\Rail\18xx-master\lib\engine\game\g_1822_pnw\game.rb
//   C:\Users\meiot\Rail\18xx-master\lib\engine\game\g_1830\game.rb
//   C:\Users\meiot\Rail\18xx-master\lib\engine\game\g_1846\game.rb
//   C:\Users\meiot\Rail\18xx-master\lib\engine\game\g_1889\game.rb
//   C:\Users\meiot\Rail\18xx-master\lib\engine\game\g_1882\game.rb
//   C:\Users\meiot\Rail\18xx-master\lib\engine\game\g_1822_mx\game.rb
//   C:\Users\meiot\Rail\18xx-master\lib\engine\game\g_1870\game.rb

'use strict';

// ── Known-good expected values ─────────────────────────────────────────────────
// Hand-verified against tobymao source files.  Used as structural assertions.
// Each entry: { trains: N, phases: N, sample: { trainLabel, cost, phaseLabel, tiles } }
const ROUND_TRIP_GAMES = [
  {
    name: '1822',
    tobymaoPath: 'g_1822/game.rb',
    expect: {
      // L(+2-variant), 3, 4, 5, 6, 7(+E-variant), 2P, LP, 5P, P+ = 10 top-level
      // Variants expanded flat: 2-variant of L, E-variant of 7 → 12 total in state.trains
      trainCount:  12,
      phaseCount:   7,
      topLevelTrainCount: 10,
      // known limitation: Phase 2 on:%w[2 3] → truncated to '2'; train_limit hash → integer
      sample: { trainLabel: 'L', trainCost: 60, phaseLabel: '5', phaseTiles: 'brown' },
    },
  },
  {
    name: '1822PNW',
    tobymaoPath: 'g_1822_pnw/game.rb',
    expect: {
      // Same structure as 1822: L(+2-variant), 3, 4, 5, 6, 7(+E-variant), 2P, LP, P+
      trainCount:  11,
      phaseCount:   7,
      topLevelTrainCount: 9,
      sample: { trainLabel: 'L', trainCost: 60 },
    },
  },
  {
    name: '1830',
    tobymaoPath: 'g_1830/game.rb',
    expect: {
      trainCount:   6,   // 2, 3, 4, 5, 6, D — all top-level, no variants
      phaseCount:   6,
      topLevelTrainCount: 6,
      // known loss: D-train loses available_on:'6' and discount hash (P3 fields)
      // known loss: 6-train and D-train have no explicit num: — count=0 → num: omitted in export
      sample: { trainLabel: '2', trainCost: 80, phaseLabel: '5', phaseTiles: 'brown' },
    },
  },
  {
    name: '1846',
    tobymaoPath: 'g_1846/game.rb',
    expect: {
      // 2, 4(+3/5-variant), 5(+4/6-variant), 6(+7/8-variant) = 4 top-level + 3 variants = 7 total
      trainCount:   7,
      phaseCount:   4,   // I, II, III, IV
      topLevelTrainCount: 4,
      // known limitation: no explicit num: on any train → count=0 → num: omitted in export
      // known limitation: obsolete_on not captured
      sample: { trainLabel: '2', trainCost: 80, phaseLabel: 'I', phaseTiles: 'yellow' },
    },
  },
  {
    name: '1889',
    tobymaoPath: 'g_1889/game.rb',
    expect: {
      trainCount:   6,   // 2, 3, 4, 5, 6, D — all top-level
      phaseCount:   6,
      topLevelTrainCount: 6,
      // fixed: D-train num:'unlimited' → count:null → exports as num: 99
      sample: { trainLabel: '2', trainCost: 80, phaseLabel: '5', phaseTiles: 'brown' },
    },
  },
  {
    name: '1882',
    tobymaoPath: 'g_1882/game.rb',
    expect: {
      trainCount:   6,   // 2, 3, 4, 5, 6, D — all top-level, clean structure
      phaseCount:   6,
      topLevelTrainCount: 6,
      sample: { trainLabel: '2', trainCost: 80, phaseLabel: '2', phaseTiles: 'yellow' },
    },
  },
  {
    name: '1822MX',
    tobymaoPath: 'g_1822_mx/game.rb',
    expect: {
      // L(+2-variant), 3, 4, 5, 6, 7(+E-variant), 2P, LP, 5P, P+, 3/2P = 11 top-level + 2 variants
      trainCount:  13,
      phaseCount:   0,   // No PHASES constant — inherits from g_1822 (correct behaviour)
      topLevelTrainCount: 11,
      sample: { trainLabel: 'L', trainCost: 60 },
    },
  },
  {
    name: '1870',
    tobymaoPath: 'g_1870/game.rb',
    expect: {
      // fixed: falls back to STANDARD_TRAINS / STANDARD_PHASES
      trainCount:   8,   // 2, 3, 4, 5, 6, 8, 10, 12 — all top-level, no variants
      phaseCount:   8,
      topLevelTrainCount: 8,
      // known limitation: DIESEL_VARIANT_TRAINS silently ignored (game_trains() selection not modelled)
      sample: { trainLabel: '2', trainCost: 80 },
    },
  },
];

// ── Core test runner ──────────────────────────────────────────────────────────

function runRoundTripTest(gameName, originalSrc) {
  const result = { game: gameName, pass: [], fail: [], warn: [] };
  const log  = (msg) => result.pass.push(msg);
  const fail = (msg) => result.fail.push(msg);
  const warn = (msg) => result.warn.push(msg);

  // ── Pass 1: original import ──────────────────────────────────────────────
  let orig;
  try {
    orig = importGameRb(originalSrc);
  } catch (e) {
    fail(`importGameRb threw on original: ${e.message}`);
    return _rtReport(result);
  }

  const origTopLevel = (orig.trains || []).filter(t => !t.isVariant);

  // ── Pass 2: export ───────────────────────────────────────────────────────
  // Temporarily splice state so renderGameRb() uses the imported data
  const savedTrains  = state.trains;
  const savedPhases  = state.phases;
  const savedMechs   = state.mechanics;
  state.trains   = orig.trains || [];
  state.phases   = orig.phases || [];
  state.mechanics = orig.mechanics || {};
  let exported;
  try {
    exported = renderGameRb();
  } catch (e) {
    fail(`renderGameRb threw: ${e.message}`);
    state.trains   = savedTrains;
    state.phases   = savedPhases;
    state.mechanics = savedMechs;
    return _rtReport(result);
  }
  state.trains   = savedTrains;
  state.phases   = savedPhases;
  state.mechanics = savedMechs;

  // ── Pass 3: re-import the export ─────────────────────────────────────────
  let rt;
  try {
    rt = importGameRb(exported);
  } catch (e) {
    fail(`importGameRb threw on re-import: ${e.message}`);
    return _rtReport(result);
  }

  const rtTopLevel = (rt.trains || []).filter(t => !t.isVariant);

  // ── Structural checks ─────────────────────────────────────────────────────

  // Train count
  if (orig.trains.length === rt.trains.length) {
    log(`train count preserved: ${orig.trains.length}`);
  } else {
    fail(`train count: original=${orig.trains.length} round-trip=${rt.trains.length}`);
  }

  // Top-level train count
  if (origTopLevel.length === rtTopLevel.length) {
    log(`top-level train count preserved: ${origTopLevel.length}`);
  } else {
    fail(`top-level trains: original=${origTopLevel.length} round-trip=${rtTopLevel.length}`);
  }

  // Variant train count — separate from top-level; previously not checked explicitly
  const origVariants = (orig.trains || []).filter(t => t.isVariant);
  const rtVariants   = (rt.trains  || []).filter(t => t.isVariant);
  if (origVariants.length === rtVariants.length) {
    log(`variant train count preserved: ${origVariants.length}`);
  } else {
    fail(`variant trains: original=${origVariants.length} round-trip=${rtVariants.length}`);
  }

  // Phase count
  if (orig.phases.length === rt.phases.length) {
    log(`phase count preserved: ${orig.phases.length}`);
  } else {
    fail(`phase count: original=${orig.phases.length} round-trip=${rt.phases.length}`);
  }

  // Per-train label + cost check
  origTopLevel.forEach((tr, i) => {
    const rt_tr = rtTopLevel[i];
    if (!rt_tr) { fail(`missing train at index ${i} (${tr.label || '?'})`); return; }
    const origLabel = _rtLabel(tr);
    const rtLabel   = _rtLabel(rt_tr);
    if (origLabel === rtLabel) {
      log(`train[${i}] label preserved: '${origLabel}'`);
    } else {
      fail(`train[${i}] label: original='${origLabel}' round-trip='${rtLabel}'`);
    }
    if (tr.cost === rt_tr.cost) {
      log(`train[${i}] '${origLabel}' cost preserved: ${tr.cost}`);
    } else {
      fail(`train[${i}] '${origLabel}' cost: original=${tr.cost} round-trip=${rt_tr.cost}`);
    }
    if (tr.count === rt_tr.count) {
      log(`train[${i}] '${origLabel}' count preserved: ${tr.count === null ? 'unlimited' : tr.count}`);
    } else {
      warn(`train[${i}] '${origLabel}' count: original=${tr.count} round-trip=${rt_tr.count} (may be unlimited normalisation)`);
    }
  });

  // Per-phase name + tiles check
  orig.phases.forEach((ph, i) => {
    const rt_ph = rt.phases[i];
    if (!rt_ph) { fail(`missing phase at index ${i} (${ph.name || '?'})`); return; }
    if (ph.name === rt_ph.name) {
      log(`phase[${i}] name preserved: '${ph.name}'`);
    } else {
      fail(`phase[${i}] name: original='${ph.name}' round-trip='${rt_ph.name}'`);
    }
    if (ph.tiles === rt_ph.tiles) {
      log(`phase[${i}] '${ph.name}' tiles preserved: ${ph.tiles}`);
    } else {
      fail(`phase[${i}] '${ph.name}' tiles: original=${ph.tiles} round-trip=${rt_ph.tiles}`);
    }
    if ((ph.ors || 2) === (rt_ph.ors || 2)) {
      log(`phase[${i}] '${ph.name}' operating_rounds preserved: ${ph.ors || 2}`);
    } else {
      fail(`phase[${i}] '${ph.name}' ors: original=${ph.ors} round-trip=${rt_ph.ors}`);
    }
    // Status round-trip
    const origStatus = (ph.status || []).slice().sort().join(',');
    const rtStatus   = (rt_ph.status || []).slice().sort().join(',');
    if (origStatus === rtStatus) {
      log(`phase[${i}] '${ph.name}' status preserved: [${origStatus || '—'}]`);
    } else {
      fail(`phase[${i}] '${ph.name}' status: original=[${origStatus}] round-trip=[${rtStatus}]`);
    }
  });

  // Known-expected assertions
  const spec = ROUND_TRIP_GAMES.find(g => g.name === gameName);
  if (spec && spec.expect) {
    const ex = spec.expect;
    if (ex.trainCount !== null && orig.trains.length !== ex.trainCount)
      warn(`expected ${ex.trainCount} trains from spec, got ${orig.trains.length}`);
    if (ex.phaseCount !== null && orig.phases.length !== ex.phaseCount)
      warn(`expected ${ex.phaseCount} phases from spec, got ${orig.phases.length}`);
    if (ex.topLevelTrainCount !== null && origTopLevel.length !== ex.topLevelTrainCount)
      warn(`expected ${ex.topLevelTrainCount} top-level trains from spec, got ${origTopLevel.length}`);
  }

  return _rtReport(result);
}

function _rtLabel(tr) {
  return (typeof calculateTrainLabel === 'function') ? calculateTrainLabel(tr) : (tr.label || '?');
}

function _rtReport(result) {
  const ok     = result.fail.length === 0;
  const prefix = `[round-trip ${result.game}]`;
  if (ok) {
    console.log(`${prefix} ✓ ALL ${result.pass.length} checks passed${result.warn.length ? ` (${result.warn.length} warnings)` : ''}`);
  } else {
    console.error(`${prefix} ✗ ${result.fail.length} FAILURES, ${result.pass.length} passed, ${result.warn.length} warnings`);
    result.fail.forEach(m => console.error(`  FAIL: ${m}`));
  }
  result.warn.forEach(m => console.warn(`  WARN: ${m}`));
  return result;
}

// ── Batch runner ──────────────────────────────────────────────────────────────
// Prompts the user to pick a game.rb file for each of the 8 games in sequence.
// Results accumulate in the returned array.

function runAllRoundTripTests() {
  console.log('[round-trip] Starting 8-game suite. You will be prompted for each game.rb file.');
  const results = [];
  let idx = 0;

  function nextGame() {
    if (idx >= ROUND_TRIP_GAMES.length) {
      const failed = results.filter(r => r.fail.length > 0).length;
      console.log(`[round-trip] Suite complete: ${results.length - failed}/${results.length} games passed`);
      return;
    }
    const spec = ROUND_TRIP_GAMES[idx++];
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.rb';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) { console.warn(`[round-trip] Skipped ${spec.name}`); nextGame(); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const r = runRoundTripTest(spec.name, ev.target.result);
        results.push(r);
        nextGame();
      };
      reader.readAsText(file);
    };
    console.log(`[round-trip] Pick game.rb for ${spec.name} (tobymao: ${spec.tobymaoPath})`);
    input.click();
  }

  nextGame();
  return results;
}

console.log('[round-trip-tests.js] loaded — call runAllRoundTripTests() or runRoundTripTest(name, src)');

// ── Map pipeline unit tests ───────────────────────────────────────────────────
// Self-contained: no file loading, no state mutation.
// Covers parseTilesBlock, parseDslHex, staticHexCode, and their interactions.
//
// Usage (browser console, after loading this file):
//   runMapUnitTests()

// ── Shared infrastructure ─────────────────────────────────────────────────────

function _uSuite(name) { return { suite: name, pass: [], fail: [], warn: [] }; }

function _u(r, cond, label, got, expected) {
  if (cond) { r.pass.push(label); }
  else { r.fail.push(`${label} — got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`); }
}

function _uReport(r) {
  const ok = r.fail.length === 0;
  const pf = `[unit ${r.suite}]`;
  if (ok) {
    console.log(`${pf} ✓ ALL ${r.pass.length} checks passed${r.warn.length ? ` (${r.warn.length} warnings)` : ''}`);
  } else {
    console.error(`${pf} ✗ ${r.fail.length} FAILURES, ${r.pass.length} passed`);
    r.fail.forEach(m => console.error(`  FAIL: ${m}`));
  }
  r.warn.forEach(m => console.warn(`  WARN: ${m}`));
  return r;
}

// ── Suite 1: parseTilesBlock ──────────────────────────────────────────────────
// Covers the TILES = { ... } block parser in import-ruby.js.
// Key regression: 'id' => 'unlimited' was silently dropped (fixed this session).

function _testParseTilesBlock() {
  const r = _uSuite('parseTilesBlock');

  function parse(body) {
    return parseTilesBlock(`TILES = {\n${body}\n}.freeze`);
  }

  // Simple numeric count
  {
    const { manifest } = parse(`  '4' => 6,`);
    _u(r, manifest['4'] === 6, 'simple numeric → integer', manifest['4'], 6);
  }

  // Simple unlimited — the bug fixed this session
  {
    const { manifest } = parse(`  '3' => 'unlimited',`);
    _u(r, manifest['3'] === null, "simple 'unlimited' → null", manifest['3'], null);
  }

  // Mixed simple: numeric and unlimited in one block
  {
    const { manifest } = parse(`  '7' => 'unlimited',\n  '8' => 3,\n  '9' => 'unlimited',`);
    _u(r, manifest['7'] === null, "mixed '7' unlimited → null", manifest['7'], null);
    _u(r, manifest['8'] === 3,    "mixed '8' numeric  → 3",    manifest['8'], 3);
    _u(r, manifest['9'] === null, "mixed '9' unlimited → null", manifest['9'], null);
  }

  // Complex form with numeric count
  {
    const { manifest } = parse(`  'X1' => { 'count' => 5, 'color' => 'yellow', 'code' => 'city=revenue:0' },`);
    _u(r, manifest['X1'] === 5, 'complex numeric count → 5', manifest['X1'], 5);
  }

  // Complex form with unlimited count
  {
    const { manifest } = parse(`  'X2' => { 'count' => 'unlimited', 'color' => 'green', 'code' => 'city=revenue:20' },`);
    _u(r, manifest['X2'] === null, "complex 'unlimited' → null", manifest['X2'], null);
  }

  // Complex + simple in same block (ID collision suppression: complex wins)
  {
    const { manifest } = parse(
      `  'X3' => { 'count' => 'unlimited', 'color' => 'yellow', 'code' => 'city=revenue:0' },\n` +
      `  '57' => 8,\n`
    );
    _u(r, manifest['X3'] === null, 'complex unlimited coexists with simple', manifest['X3'], null);
    _u(r, manifest['57'] === 8,    'simple alongside complex', manifest['57'], 8);
  }

  // No TILES block → empty manifest
  {
    const { manifest } = parseTilesBlock('HEXES = { white: { } }.freeze');
    _u(r, Object.keys(manifest).length === 0, 'no TILES block → empty manifest', Object.keys(manifest).length, 0);
  }

  // Exact export-style round-trip: exportRubyMap emits  '3' => 'unlimited',
  {
    const exportedBlock = `  '3' => 'unlimited',\n  '4' => 6,\n  '57' => 'unlimited',`;
    const { manifest } = parse(exportedBlock);
    _u(r, manifest['3']  === null, 'export rt: unlimited (3) → null',  manifest['3'],  null);
    _u(r, manifest['4']  === 6,    'export rt: numeric (4) → 6',       manifest['4'],  6);
    _u(r, manifest['57'] === null, 'export rt: unlimited (57) → null', manifest['57'], null);
  }

  return _uReport(r);
}

// ── Suite 2: parseDslHex ──────────────────────────────────────────────────────
// Covers the DSL-to-hex-model parser in import-ruby.js.
// Regressions covered: groups: silently dropped (fixed), terminal on paths (fixed).

function _testParseDslHex() {
  const r = _uSuite('parseDslHex');

  // city with groups:Memphis
  {
    const hex  = parseDslHex('city=revenue:0,groups:Memphis', 'white', '');
    const node = hex.nodes[0];
    _u(r, !!node,                         'city+groups: node created',        !!node, true);
    _u(r, node?.groups === 'Memphis',     'city groups:Memphis → node.groups', node?.groups, 'Memphis');
    _u(r, node?.type   === 'city',        'city+groups: type city',            node?.type, 'city');
    _u(r, node?.flat   === 0,             'city+groups: revenue 0',            node?.flat, 0);
  }

  // city without groups → undefined
  {
    const hex  = parseDslHex('city=revenue:20', 'yellow', '');
    const node = hex.nodes[0];
    _u(r, node?.groups === undefined, 'city without groups → undefined', node?.groups, undefined);
    _u(r, node?.flat   === 20,        'city without groups: revenue 20', node?.flat, 20);
  }

  // town with groups:London
  {
    const hex  = parseDslHex('town=revenue:0,groups:London', 'white', '');
    const node = hex.nodes[0];
    _u(r, node?.groups === 'London', 'town groups:London preserved', node?.groups, 'London');
    _u(r, node?.type   === 'town',   'town+groups: type town',        node?.type, 'town');
  }

  // path with terminal:1 (blue junction spike)
  {
    const hex  = parseDslHex('junction;path=a:3,b:_0,terminal:1', 'blue', '');
    const path = hex.paths[0];
    _u(r, !!path,                              'terminal path created',         !!path, true);
    _u(r, path?.terminal === 1,                'terminal:1 on path',            path?.terminal, 1);
    _u(r, path?.a?.type === 'edge' && path?.a?.n === 3, 'terminal path a=edge:3', path?.a, {type:'edge',n:3});
    _u(r, path?.b?.type === 'node' && path?.b?.n === 0, 'terminal path b=node:0', path?.b, {type:'node',n:0});
    _u(r, hex.nodes[0]?.type === 'junction',   'junction node type',            hex.nodes[0]?.type, 'junction');
  }

  // path without terminal → 0
  {
    const hex  = parseDslHex('path=a:0,b:3', 'white', '');
    const path = hex.paths[0];
    _u(r, path?.terminal === 0, 'no terminal → terminal=0', path?.terminal, 0);
  }

  // phase revenue on city
  {
    const hex  = parseDslHex('city=revenue:yellow_10|green_20|brown_30|gray_40', 'white', '');
    const node = hex.nodes[0];
    _u(r, node?.phaseRevenue?.yellow === 10, 'phase yellow=10', node?.phaseRevenue?.yellow, 10);
    _u(r, node?.phaseRevenue?.green  === 20, 'phase green=20',  node?.phaseRevenue?.green,  20);
    _u(r, node?.phaseRevenue?.brown  === 30, 'phase brown=30',  node?.phaseRevenue?.brown,  30);
    _u(r, node?.phaseRevenue?.gray   === 40, 'phase gray=40',   node?.phaseRevenue?.gray,   40);
  }

  // Memphis Y6: 6 cities all groups:Memphis, 6 edge→node paths, label=L
  {
    const dsl = [
      'city=revenue:20,groups:Memphis', 'city=revenue:20,groups:Memphis',
      'city=revenue:20,groups:Memphis', 'city=revenue:20,groups:Memphis',
      'city=revenue:20,groups:Memphis', 'city=revenue:20,groups:Memphis',
      'path=a:0,b:_0', 'path=a:1,b:_1', 'path=a:2,b:_2',
      'path=a:3,b:_3', 'path=a:4,b:_4', 'path=a:5,b:_5',
      'upgrade=cost:20', 'label=L',
    ].join(';');
    const hex = parseDslHex(dsl, 'white', 'Memphis');
    _u(r, hex.nodes.length === 6,
       'Memphis: 6 city nodes', hex.nodes.length, 6);
    _u(r, hex.nodes.every(n => n.groups === 'Memphis'),
       'Memphis: all nodes groups:Memphis', hex.nodes.map(n => n.groups), Array(6).fill('Memphis'));
    _u(r, hex.paths.length === 6,
       'Memphis: 6 paths', hex.paths.length, 6);
    _u(r, hex.label === 'L',
       'Memphis: label=L', hex.label, 'L');
    _u(r, hex.upgradeCost === 20,
       'Memphis: upgradeCost=20', hex.upgradeCost, 20);
  }

  // offboard phase revenue + terminal paths
  {
    const dsl = 'offboard=revenue:yellow_20|green_30|brown_50|gray_70;path=a:3,b:_0,terminal:1;path=a:4,b:_0,terminal:1';
    const hex = parseDslHex(dsl, 'gray', '');
    _u(r, hex.feature === 'offboard',          'offboard: feature set',         hex.feature, 'offboard');
    _u(r, hex.phaseRevenue?.yellow === 20,     'offboard: yellow=20',           hex.phaseRevenue?.yellow, 20);
    _u(r, hex.phaseRevenue?.gray   === 70,     'offboard: gray=70',             hex.phaseRevenue?.gray, 70);
    _u(r, hex.paths.length === 2,              'offboard: 2 terminal paths',    hex.paths.length, 2);
    _u(r, hex.paths.every(p => p.terminal===1),'offboard: all paths terminal',  hex.paths.map(p=>p.terminal), [1,1]);
  }

  return _uReport(r);
}

// ── Suite 3: staticHexCode ────────────────────────────────────────────────────
// Covers the DSL emitter (window.staticHexCode) in static-hex-builder.js.
// Regressions covered: groups: not emitted (fixed), terminal on paths (fixed).

function _testStaticHexCode() {
  const r = _uSuite('staticHexCode');

  function mkHex(overrides) {
    return Object.assign({
      static: true, bg: 'white', rotation: 0,
      nodes: [], paths: [], borders: [],
      terrain: '', terrainCost: 0, label: '',
    }, overrides);
  }

  function mkCity(overrides) {
    return Object.assign({ type: 'city', slots: 1, flat: 0,
      phaseRevenue: null, phaseMode: false, terminal: false,
      groups: undefined, locStr: undefined }, overrides);
  }

  function mkTown(overrides) {
    return Object.assign({ type: 'town', slots: 1, flat: 0,
      phaseRevenue: null, phaseMode: false, terminal: false,
      groups: undefined, locStr: undefined }, overrides);
  }

  // City with groups:Memphis
  {
    const code = staticHexCode(mkHex({ nodes: [mkCity({ flat: 20, groups: 'Memphis' })] }));
    _u(r, code.includes('groups:Memphis'),      'city groups:Memphis emitted',   code.includes('groups:Memphis'), true);
    _u(r, code.startsWith('city=revenue:20'),   'city revenue:20 emitted',       code.slice(0, 15), 'city=revenue:20');
  }

  // City without groups → no groups: attr
  {
    const code = staticHexCode(mkHex({ nodes: [mkCity({ flat: 30 })] }));
    _u(r, !code.includes('groups:'), 'city without groups: no groups attr', code.includes('groups:'), false);
  }

  // Town with groups:London
  {
    const code = staticHexCode(mkHex({ nodes: [mkTown({ groups: 'London' })] }));
    _u(r, code.includes('groups:London'), 'town groups:London emitted', code.includes('groups:London'), true);
    _u(r, code.startsWith('town='),       'town= prefix emitted',       code.slice(0, 5), 'town=');
  }

  // Junction + terminal path → junction;path=a:3,b:_0,terminal:1
  {
    const hex = mkHex({
      bg: 'blue',
      nodes: [{ type: 'junction', terminal: false, locStr: undefined }],
      paths: [{ a: { type: 'edge', n: 3 }, b: { type: 'node', n: 0 }, terminal: 1 }],
    });
    const code = staticHexCode(hex);
    _u(r, code.startsWith('junction'),       'junction+terminal: junction first',      code.slice(0, 8), 'junction');
    _u(r, code.includes('terminal:1'),       'junction+terminal: terminal:1 in path',  code.includes('terminal:1'), true);
    _u(r, code.includes('path=a:3,b:_0'),   'junction+terminal: path=a:3,b:_0',       code.includes('path=a:3,b:_0'), true);
  }

  // City with slots:2
  {
    const code = staticHexCode(mkHex({ nodes: [mkCity({ slots: 2, flat: 30 })] }));
    _u(r, code.includes('slots:2'), 'city slots:2 emitted', code.includes('slots:2'), true);
  }

  // Phase revenue city
  {
    const code = staticHexCode(mkHex({ nodes: [mkCity({
      flat: null, phaseMode: true,
      phaseRevenue: { yellow: 10, green: 20, brown: 30, gray: 40 },
    })] }));
    _u(r, code.includes('yellow_10'), 'phase revenue yellow_10', code.includes('yellow_10'), true);
    _u(r, code.includes('green_20'),  'phase revenue green_20',  code.includes('green_20'),  true);
    _u(r, code.includes('brown_30'),  'phase revenue brown_30',  code.includes('brown_30'),  true);
    _u(r, code.includes('gray_40'),   'phase revenue gray_40',   code.includes('gray_40'),   true);
  }

  // Terrain / upgrade cost
  {
    const code = staticHexCode(mkHex({ terrain: 'hill', terrainCost: 40 }));
    _u(r, code.includes('upgrade=cost:40,terrain:hill'),
       'terrain: upgrade=cost:40,terrain:hill emitted', code.includes('upgrade=cost:40,terrain:hill'), true);
  }

  // label=Y
  {
    const code = staticHexCode(mkHex({ nodes: [mkCity({ flat: 30, slots: 2 })], label: 'Y' }));
    _u(r, code.includes('label=Y'), 'label=Y emitted', code.includes('label=Y'), true);
  }

  // Non-static hex → empty string
  {
    const code = staticHexCode({ static: false });
    _u(r, code === '', 'non-static → empty string', code, '');
  }

  return _uReport(r);
}

// ── Suite 4: parseDslHex → staticHexCode round-trips ─────────────────────────
// Parses DSL that comes from a real map.rb and verifies the key attributes
// survive the full parse → emit cycle.

function _testDslRoundTrip() {
  const r = _uSuite('parseDslHex→staticHexCode');

  function rt(dsl, bg) {
    const hex = parseDslHex(dsl, bg, '');
    hex.static = true;
    return staticHexCode(hex);
  }

  // Blue junction with terminal (Y30 style)
  {
    const orig   = 'junction;path=a:3,b:_0,terminal:1';
    const result = rt(orig, 'blue');
    _u(r, result.includes('junction'),      'junction+terminal rt: junction',   result.includes('junction'), true);
    _u(r, result.includes('terminal:1'),    'junction+terminal rt: terminal:1', result.includes('terminal:1'), true);
    _u(r, result.includes('path=a:3,b:_0'),'junction+terminal rt: path',        result.includes('path=a:3,b:_0'), true);
  }

  // Multi-exit blue junction (M32/M38 style: path=a:2,b:_0,terminal:1)
  {
    const orig   = 'junction;path=a:2,b:_0,terminal:1';
    const result = rt(orig, 'blue');
    _u(r, result.includes('path=a:2,b:_0'), 'junction edge:2 rt: path', result.includes('path=a:2,b:_0'), true);
    _u(r, result.includes('terminal:1'),    'junction edge:2 rt: terminal', result.includes('terminal:1'), true);
  }

  // City with groups (single-city groups form)
  {
    const orig   = 'city=revenue:20,groups:Memphis;path=a:0,b:_0';
    const result = rt(orig, 'white');
    _u(r, result.includes('groups:Memphis'), 'groups rt: groups:Memphis preserved', result.includes('groups:Memphis'), true);
    _u(r, result.includes('city=revenue:20'),'groups rt: revenue preserved',        result.includes('city=revenue:20'), true);
  }

  // Multi-slot Y city (N15/Y28 style)
  {
    const orig   = 'city=revenue:30,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;label=Y';
    const result = rt(orig, 'yellow');
    _u(r, result.includes('slots:2'), 'Y-city rt: slots:2 preserved', result.includes('slots:2'), true);
    _u(r, result.includes('label=Y'), 'Y-city rt: label=Y preserved', result.includes('label=Y'), true);
    _u(r, result.includes('city=revenue:30'), 'Y-city rt: revenue preserved', result.includes('city=revenue:30'), true);
  }

  // Terrain / upgrade cost
  {
    const orig   = 'upgrade=cost:40,terrain:hill';
    const result = rt(orig, 'white');
    _u(r, result.includes('cost:40'),      'terrain rt: cost:40',      result.includes('cost:40'), true);
    _u(r, result.includes('terrain:hill'), 'terrain rt: terrain:hill', result.includes('terrain:hill'), true);
  }

  // River terrain
  {
    const orig   = 'city=revenue:0;upgrade=cost:40,terrain:river';
    const result = rt(orig, 'white');
    _u(r, result.includes('terrain:river'), 'river rt: terrain:river', result.includes('terrain:river'), true);
  }

  // Phase revenue offboard → no exception, terminal paths survive
  {
    const orig = 'offboard=revenue:yellow_20|green_30|brown_50|gray_70;path=a:3,b:_0,terminal:1;path=a:4,b:_0,terminal:1';
    let threw = false, result = '';
    try { result = rt(orig, 'gray'); } catch (e) { threw = true; }
    _u(r, !threw,                          'offboard rt: no exception',   threw, false);
    _u(r, result.includes('terminal:1'),   'offboard rt: terminal:1 in output', result.includes('terminal:1'), true);
  }

  // Memphis Y6 full DSL: 6 cities with groups, 6 paths, label, terrain
  {
    const orig = [
      'city=revenue:20,groups:Memphis', 'city=revenue:20,groups:Memphis',
      'city=revenue:20,groups:Memphis', 'city=revenue:20,groups:Memphis',
      'city=revenue:20,groups:Memphis', 'city=revenue:20,groups:Memphis',
      'path=a:0,b:_0', 'path=a:1,b:_1', 'path=a:2,b:_2',
      'path=a:3,b:_3', 'path=a:4,b:_4', 'path=a:5,b:_5',
      'upgrade=cost:20', 'label=L',
    ].join(';');
    const result = rt(orig, 'white');
    const groupCount = (result.match(/groups:Memphis/g) || []).length;
    _u(r, groupCount === 6,            'Memphis rt: 6× groups:Memphis', groupCount, 6);
    _u(r, result.includes('label=L'), 'Memphis rt: label=L',            result.includes('label=L'), true);
    _u(r, result.includes('cost:20'), 'Memphis rt: upgrade cost:20',    result.includes('cost:20'), true);
  }

  return _uReport(r);
}

// ── Top-level runner ──────────────────────────────────────────────────────────

function runMapUnitTests() {
  console.log('[map-unit-tests] Running map pipeline unit tests...');
  const suites = [
    _testParseTilesBlock,
    _testParseDslHex,
    _testStaticHexCode,
    _testDslRoundTrip,
  ];
  const results = suites.map(fn => fn());
  const failed  = results.filter(r => r.fail.length > 0).length;
  const total   = results.reduce((s, r) => s + r.pass.length + r.fail.length, 0);
  const pass    = results.reduce((s, r) => s + r.pass.length, 0);
  if (failed === 0) {
    console.log(`[map-unit-tests] ✓ ALL ${total} checks passed across ${results.length} suites`);
  } else {
    console.error(`[map-unit-tests] ✗ ${failed}/${results.length} suite(s) failed — ${pass}/${total} checks passed`);
  }
  return results;
}

console.log('[round-trip-tests.js] map tests ready — call runMapUnitTests()');
