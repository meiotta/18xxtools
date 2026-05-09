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
