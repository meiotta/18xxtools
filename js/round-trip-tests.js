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
      trainCount:  14,   // L, 2, 3, 4, 5, 6, 7, E (+ 2P, P+, LP variants expanded flat)
      phaseCount:   8,
      topLevelTrainCount: 10, // non-isVariant entries (L+2-variant = 1 top-level, etc.)
      sample: { trainLabel: 'L', trainCost: 60, phaseLabel: '5', phaseTiles: 'brown' },
    },
  },
  {
    name: '1822PNW',
    tobymaoPath: 'g_1822_pnw/game.rb',
    expect: {
      trainCount:  null,   // TBD — run import once and record
      phaseCount:  null,
      topLevelTrainCount: null,
      sample: null,
    },
  },
  {
    name: '1830',
    tobymaoPath: 'g_1830/game.rb',
    expect: {
      trainCount:   6,   // 2, 3, 4, 5, 6, D
      phaseCount:   6,
      topLevelTrainCount: 6,
      sample: { trainLabel: '2', trainCost: 80, phaseLabel: '5', phaseTiles: 'brown' },
    },
  },
  {
    name: '1846',
    tobymaoPath: 'g_1846/game.rb',
    expect: {
      trainCount:  null,   // 2, 4, 5, 6 top-level + 3/5, 4/6, 7/8 variants expanded
      phaseCount:  null,
      topLevelTrainCount: 4,
      sample: { trainLabel: '2', trainCost: 80 },
    },
  },
  {
    name: '1889',
    tobymaoPath: 'g_1889/game.rb',
    expect: {
      trainCount:  null,
      phaseCount:  null,
      topLevelTrainCount: null,
      sample: null,
    },
  },
  {
    name: '1882',
    tobymaoPath: 'g_1882/game.rb',
    expect: {
      trainCount:  null,
      phaseCount:  null,
      topLevelTrainCount: null,
      sample: null,
    },
  },
  {
    name: '1822MX',
    tobymaoPath: 'g_1822_mx/game.rb',
    expect: {
      trainCount:  null,
      phaseCount:  null,
      topLevelTrainCount: null,
      sample: null,
    },
  },
  {
    name: '1870',
    tobymaoPath: 'g_1870/game.rb',
    expect: {
      trainCount:  null,
      phaseCount:  null,
      topLevelTrainCount: null,
      sample: null,
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
