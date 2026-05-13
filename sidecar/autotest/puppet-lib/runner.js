// erin/puppet-lib/runner.js — Permutation assembler.
//
// Drives a single 18xxtools UI sequence end-to-end:
//   1. Launch a Puppeteer page (or accept an existing one)
//   2. selectMap for the chosen map
//   3. Dispatch the companySetup mode to companies.js
//   4. Apply each edit in sequence by dispatching to the right library function
//   5. (optional) wire up phase-export-train + OR-export rule
//   6. Capture entities.rb and game.rb via the page
//   7. Return { entitiesRb, gameRb }
//
// Permutation config:
//
//   {
//     map: '1889',
//     companySetup: 'import_1889_majors'
//                 | 'import_1846_majors_minors'
//                 | 'build_6_majors'
//                 | 'build_12_minors'
//                 | 'build_nationals',
//     edits: [
//       { type: 'add_major',       params: { sym, tokenCount, ... } },
//       { type: 'remove_major',    params: { sym } },
//       { type: 'replace_private', params: { targetIndex, abilityType, abilityParams? } },
//       { type: 'add_private',     params: { name, desc, cost, revenue, ability?, ... } },
//       { type: 'add_train',       params: { label, cost, count, phase, permanent, distType?, n? } },
//       { type: 'reduce_train',    params: { label, by } },
//       { type: 'tile_lay_rule',   params: { count?, extraCost? } },
//       { type: 'flip_market',     params: {} },
//       { type: 'set_market',      params: { type: '1D'|'2D'|'zigzag' } },
//       { type: 'or_export',       params: { exportTopTrain? } },
//       { type: 'water_upgrade',   params: { corpSym, freeFirst?, discount? } },
//       { type: 'set_or_count',    params: { ... per rounds.js setOrCount } },
//     ],
//     orExport: true,            // shortcut for setOrSetTrainExport + setOrExportRule
//   }
//
// Options (second arg):
//   { page?, browser?, baseUrl?, keepOpen?, mapName? }
//
//   page      — reuse a pre-loaded Puppeteer page; runner won't navigate/close it
//   browser   — reuse a Puppeteer browser instance; runner will create + close pages
//   baseUrl   — override the default URL (else BASE_URL env / http://localhost:8080)
//   keepOpen  — don't close the page after capture; caller takes ownership
//   mapName   — alias for config.map, useful for orchestrators that pass map separately
//
// Established patterns mirrored:
//   • freshPage shape lifted from erin/runner.js:91-111
//   • BASE_URL env-var fallback from erin/runner_linux.js:47
//   • captureExports fallback chain from erin/runner.js:452-473
//   • title + corpPacks sync from erin/runner.js:553-563

'use strict';

const path = require('path');

const map        = require('./map');
const companies  = require('./companies');
const trains     = require('./trains');
const mechanics  = require('./mechanics');
const market     = require('./market');
const rounds     = require('./rounds');

const DEFAULT_BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

// ── Puppeteer plumbing ──────────────────────────────────────────────────────
// Caller can supply { browser } or { page }. When neither is supplied we launch
// a new Puppeteer (resolved lazily via require) and tear it down at exit.

let _sharedBrowser = null;

async function _getPuppeteer() {
  // Resolve relative to the repo root (sibling node_modules), mirroring how
  // erin/runner.js does it. Falls back to plain require('puppeteer') so a
  // caller that has puppeteer in their own node_modules can use this lib too.
  try { return require(path.join(__dirname, '..', '..', 'node_modules', 'puppeteer')); }
  catch (_) { return require('puppeteer'); }
}

async function _launchBrowser() {
  if (_sharedBrowser) return _sharedBrowser;
  const puppeteer = await _getPuppeteer();
  _sharedBrowser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  return _sharedBrowser;
}

async function _openPage(browser, baseUrl) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  page.on('pageerror', err => console.error('[puppet-lib]   pageerror:', err.message));
  page.on('dialog',    d   => d.dismiss().catch(() => {}));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () => typeof state !== 'undefined' && state.meta,
    { timeout: 15000 }
  );
  return page;
}

// ── companySetup dispatch ───────────────────────────────────────────────────
// Five named modes from the permutation spec. The build_* modes pick homes
// dynamically via map.getValidHomeHexes — the assembler doesn't bake in
// per-map home tables; that's the library's job.

const COLORS = ['#EF1D24', '#0066A5', '#00A651', '#FFCC00',
                '#F47C20', '#7E2D86', '#444444', '#888888',
                '#990099', '#669900', '#006666', '#cc6600'];

async function _setupImport1889Majors(page) {
  return companies.importCorpsFromGame(page, { gameName: '1889', types: ['major'] });
}

async function _setupImport1846MajorsMinors(page) {
  return companies.importCorpsFromGame(page, { gameName: '1846', types: ['major', 'minor'] });
}

async function _setupBuild6Majors(page) {
  const homes = await map.getValidHomeHexes(page, { type: 'major' });
  if (!homes.length) throw new Error('build_6_majors: no valid home hexes on this map');
  const syms  = ['AA', 'AB', 'AC', 'AD', 'AE', 'AF'];
  const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'];
  for (let i = 0; i < syms.length; i++) {
    await companies.buildMajor(page, {
      sym:        syms[i],
      name:       names[i] + ' Railway',
      homeHex:    homes[i % homes.length],
      color:      COLORS[i % COLORS.length],
      tokenCount: 3,
    });
  }
}

async function _setupBuild12Minors(page) {
  const homes = await map.getValidHomeHexes(page, { type: 'minor' });
  if (!homes.length) throw new Error('build_12_minors: no valid home hexes on this map');
  // Skip BI to match the OCR-avoidance pattern from erin/runner.js:222
  const syms = ['BA', 'BB', 'BC', 'BD', 'BE', 'BF',
                'BG', 'BH', 'BJ', 'BK', 'BL', 'BM'];
  for (let i = 0; i < syms.length; i++) {
    await companies.buildMinor(page, {
      sym:     syms[i],
      name:    'Minor ' + syms[i],
      homeHex: homes[i % homes.length],
      color:   COLORS[i % COLORS.length],
    });
  }
}

async function _setupBuildNationals(page) {
  const homes = await map.getValidHomeHexes(page, { type: 'national' });
  if (!homes.length) throw new Error('build_nationals: no valid home hexes on this map');
  await companies.buildNational(page, {
    sym:                    'NTL',
    name:                   'National',
    homeHex:                homes[0],
    color:                  '#222222',
    tokenConfig:            [0, 0, 0, 0],
    receivesExportedTrains: true,
  });
}

const SETUP_DISPATCH = {
  import_1889_majors:        _setupImport1889Majors,
  import_1846_majors_minors: _setupImport1846MajorsMinors,
  build_6_majors:            _setupBuild6Majors,
  build_12_minors:           _setupBuild12Minors,
  build_nationals:           _setupBuildNationals,
};

// ── edit dispatch ───────────────────────────────────────────────────────────
// One entry per edit.type from the permutation spec. Each handler receives
// (page, params) and may return whatever the underlying library returns —
// the assembler does not interpret return values (caller can introspect via
// the collected edit-results array if it wants).

const EDIT_DISPATCH = {
  add_major:       (page, p) => companies.addMajor(page, p),
  remove_major:    (page, p) => companies.removeMajor(page, p),
  replace_private: (page, p) => companies.replacePrivateWithAbility(page, p),
  add_private:     (page, p) => companies.addPrivate(page, p),

  add_train:       (page, p) => trains.addTrain(page, p),
  reduce_train:    (page, p) => trains.reduceTrainCount(page, p),

  tile_lay_rule:   (page, p) => mechanics.setTileLayRule(page, p || {}),

  flip_market:     (page, _p) => market.flipMarketType(page),
  set_market:      (page, p)  => market.setMarketType(page, p || {}),

  or_export:       (page, p) => mechanics.setOrExportRule(page, p || {}),

  water_upgrade:   (page, p) => map.addWaterUpgradeAbility(page, p),

  set_or_count:    (page, p) => rounds.setOrCount(page, p || {}),
};

// ── capture ─────────────────────────────────────────────────────────────────
// Lifted from erin/runner.js:452-473. Uses the renderEntitiesRb / renderGameRb
// pairs (the canonical names) with exportEntitiesRb / generateGameRb as
// fallbacks for older builds.

async function _captureExports(page) {
  return page.evaluate(() => {
    const out = { entitiesRb: null, gameRb: null, errors: [] };
    try {
      out.entitiesRb = (typeof renderEntitiesRb === 'function') ? renderEntitiesRb()
                     : (typeof exportEntitiesRb === 'function') ? exportEntitiesRb()
                     : null;
    } catch (e) { out.errors.push('entities: ' + e.message); }
    try {
      out.gameRb = (typeof renderGameRb === 'function') ? renderGameRb()
                 : (typeof generateGameRb === 'function') ? generateGameRb()
                 : null;
    } catch (e) { out.errors.push('game: ' + e.message); }
    return out;
  });
}

// Mirrors erin/runner.js:553-563 — set a unique meta.title so the exported
// Ruby module name isn't 'GGame', and ensure corpPacks is populated from
// state.companies/minors so export-game.js readers always find data.
async function _stampMetaAndSyncPacks(page, mapName) {
  await page.evaluate((title) => {
    if (typeof state !== 'undefined' && state.meta) state.meta.title = title;
  }, mapName);
  await page.evaluate(() => {
    const all = [...(state.companies || []), ...(state.minors || [])];
    if (all.length && !(state.corpPacks || []).length) {
      state.corpPacks = all.map(c => ({ ...c }));
    }
  });
}

// ── main entry point ────────────────────────────────────────────────────────

async function runPermutation(config, options = {}) {
  if (!config || typeof config !== 'object') {
    throw new Error('runPermutation: config required');
  }
  const mapName = config.map || options.mapName;
  if (!mapName) throw new Error('runPermutation: config.map required');

  const setupKey = config.companySetup;
  if (setupKey && !SETUP_DISPATCH[setupKey]) {
    throw new Error('runPermutation: unknown companySetup "' + setupKey + '"');
  }

  // ── Page acquisition ────────────────────────────────────────────────────
  let page          = options.page || null;
  let ownedPage     = false;
  let ownedBrowser  = false;
  let browser       = options.browser || null;

  if (!page) {
    if (!browser) {
      browser     = await _launchBrowser();
      ownedBrowser = (browser === _sharedBrowser);  // we keep _sharedBrowser alive
    }
    const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    page          = await _openPage(browser, baseUrl);
    ownedPage     = true;
  }

  const editResults = [];

  try {
    // ── Step 1: map ────────────────────────────────────────────────────────
    await map.selectMap(page, { gameName: mapName });

    // ── Step 2: companySetup ───────────────────────────────────────────────
    if (setupKey) {
      await SETUP_DISPATCH[setupKey](page);
    }

    // ── Step 3: edits ──────────────────────────────────────────────────────
    const edits = Array.isArray(config.edits) ? config.edits : [];
    for (let i = 0; i < edits.length; i++) {
      const e        = edits[i];
      const handler  = EDIT_DISPATCH[e.type];
      if (!handler) {
        throw new Error(`runPermutation: edit[${i}] unknown type "${e.type}"`);
      }
      try {
        const r = await handler(page, e.params || {});
        editResults.push({ index: i, type: e.type, ok: true, result: r });
      } catch (err) {
        editResults.push({ index: i, type: e.type, ok: false, error: err.message });
        // Surface edit-level failures with positional context. The caller can
        // catch and inspect editResults via the thrown error's .editResults
        // property.
        const wrapped     = new Error(`edit[${i}] "${e.type}" failed: ${err.message}`);
        wrapped.editIndex = i;
        wrapped.editType  = e.type;
        wrapped.editResults = editResults;
        throw wrapped;
      }
    }

    // ── Step 4: orExport shortcut ──────────────────────────────────────────
    // Equivalent to two explicit edits: phase-flagging via setOrSetTrainExport
    // and the mechanics-panel toggle via setOrExportRule. Order matches the
    // existing erin/runner.js convention (mechanics flag first, then phases).
    if (config.orExport) {
      await mechanics.setOrExportRule(page, { exportTopTrain: true });
      await rounds.setOrSetTrainExport(page, { enabled: true });
    }

    // ── Step 5: meta + corpPacks sync, then capture ────────────────────────
    await _stampMetaAndSyncPacks(page, mapName);
    const captured = await _captureExports(page);

    return {
      entitiesRb:  captured.entitiesRb,
      gameRb:      captured.gameRb,
      errors:      captured.errors,
      editResults,
    };
  } finally {
    if (ownedPage && !options.keepOpen) {
      try { await page.close(); } catch (_) {}
    }
    // _sharedBrowser is intentionally kept alive across calls — callers that
    // want to tear it down can call closeSharedBrowser() at suite end.
    void ownedBrowser;
  }
}

// Optional teardown for orchestrators that own the suite lifecycle. Safe to
// call when no shared browser is open.
async function closeSharedBrowser() {
  if (_sharedBrowser) {
    try { await _sharedBrowser.close(); } catch (_) {}
    _sharedBrowser = null;
  }
}

module.exports = {
  runPermutation,
  closeSharedBrowser,
  // Re-exposed for tests / callers that want to register custom edit handlers
  // before invocation (e.g. shim a library function during a probe run).
  EDIT_DISPATCH,
  SETUP_DISPATCH,
};
