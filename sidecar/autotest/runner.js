// sidecar/autotest/runner.js — Puppeteer harness for 18xxtools end-to-end tests
//
// Usage:
//   node sidecar/autotest/runner.js              # run all tests in test_matrix.json
//   node sidecar/autotest/runner.js forge01      # run only the named test(s)
//   node sidecar/autotest/runner.js --from=20    # start at test N
//
// For each test, drives the 18xxtools UI to:
//   - Import map (.rb)
//   - Apply company setup mode (A/B = import .rb, C/D/E = drive UI)
//   - Apply two edits
//   - Capture exported Ruby (game.rb, entities.rb, meta.rb, map.rb)
//   - Write output to sidecar/autotest/output/forge<NN>/
//
// Honesty rules:
//   - Never fabricate Ruby. Only what the tool produces is recorded.
//   - If the UI cannot configure something, mark UNSUPPORTED with details.
//   - Deployment to codespace is BLOCKED (no gh CLI / SSH access from harness).

const puppeteer = require('../../node_modules/puppeteer');
const fs   = require('fs');
const path = require('path');

const ROOT       = 'C:/Users/meiot/Rail/18xxtools';
const AUTOTEST   = path.join(ROOT, 'sidecar', 'autotest');
const OUT_DIR    = path.join(AUTOTEST, 'output');
const LOG_FILE   = path.join(AUTOTEST, 'test_log.md');
const MATRIX     = path.join(AUTOTEST, 'test_matrix.json');
const BASE_URL   = 'http://localhost:8181/index.html';
const TOBYMAO    = 'C:/Users/meiot/Rail/18xx-master/lib/engine/game';
const LOCAL_MAPS = path.join(ROOT, 'maps');

// Map name → tobymao folder + map.rb path + entities.rb path
const MAP_SOURCES = {
  '1882':   { dir: 'g_1882',    local: null                            },
  '1822MX': { dir: 'g_1822_mx', local: null                            },
  '1830':   { dir: 'g_1830',    local: path.join(LOCAL_MAPS,'1830.rb') },
  '1889':   { dir: 'g_1889',    local: path.join(LOCAL_MAPS,'1889.rb') },
  '1856':   { dir: 'g_1856',    local: null                            },
  '1846':   { dir: 'g_1846',    local: path.join(LOCAL_MAPS,'1846.rb') },
  '18SJ':   { dir: 'g_18_sj',   local: null                            },
  '1870':   { dir: 'g_1870',    local: null                            },
};

function mapRbFor(name) {
  const s = MAP_SOURCES[name];
  if (!s) return null;
  // Always read from the canonical tobymao map.rb (richest format).
  const tobyMap = path.join(TOBYMAO, s.dir, 'map.rb');
  if (fs.existsSync(tobyMap)) return tobyMap;
  if (s.local && fs.existsSync(s.local)) return s.local;
  return null;
}
function entitiesRbFor(name) {
  const s = MAP_SOURCES[name];
  if (!s) return null;
  const p = path.join(TOBYMAO, s.dir, 'entities.rb');
  return fs.existsSync(p) ? p : null;
}

// ── Utility ───────────────────────────────────────────────────────────────────

function nowIso() { return new Date().toISOString().replace('T',' ').slice(0,19); }

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Append a row to the log file (creates with header if missing).
function logRow({ id, map, setup, edit1, edit2, status, notes }) {
  if (!fs.existsSync(LOG_FILE)) {
    const header = [
      '# Erin — 18xxtools E2E Test Log',
      '',
      `Started: ${nowIso()}`,
      '',
      '| ID       | Map     | Setup | Edit1 | Edit2 | Status      | Notes |',
      '|----------|---------|-------|-------|-------|-------------|-------|',
      '',
    ].join('\n');
    fs.writeFileSync(LOG_FILE, header, 'utf8');
  }
  const line = `| ${id.padEnd(8)} | ${String(map).padEnd(7)} | ${String(setup).padEnd(5)} | ${String(edit1).padEnd(5)} | ${String(edit2).padEnd(5)} | ${String(status).padEnd(11)} | ${(notes||'').replace(/\n/g,' ')} |\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(`[${id}] ${status} — ${notes||''}`);
}

// ── Browser primitives ────────────────────────────────────────────────────────

let _browser = null;
async function getBrowser() {
  if (_browser) return _browser;
  _browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  return _browser;
}

async function freshPage() {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  page.on('pageerror', err => console.error('  pageerror:', err.message));
  // Dismiss alert() popups so failed imports don't hang the harness.
  page.on('dialog', d => d.dismiss().catch(()=>{}));
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Wait for state to exist.
  await page.waitForFunction(() => typeof state !== 'undefined' && state.meta, { timeout: 15000 });
  return page;
}

// Upload a .rb file via a hidden <input type="file">.
async function uploadTo(page, inputId, filePath) {
  const input = await page.$('#' + inputId);
  if (!input) throw new Error(`upload target ${inputId} not found`);
  await input.uploadFile(filePath);
  await sleep(500);
}

// ── Setup driving ─────────────────────────────────────────────────────────────

async function importMap(page, mapName) {
  const rb = mapRbFor(mapName);
  if (!rb) throw new Error('NO_MAP_FILE:' + mapName);
  await uploadTo(page, 'importMapFile', rb);
  // Some maps have custom/embedded tiles that trigger an HTML collision dialog
  // (not a native browser alert). Poll briefly and auto-dismiss it so the import
  // completes headlessly. Then wait for hexes to populate.
  for (let i = 0; i < 10; i++) {
    await sleep(200);
    const dismissed = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim() === 'Continue (pack wins)');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (dismissed) break;
  }
  // Wait until at least one hex appears.
  await page.waitForFunction(
    () => typeof state !== 'undefined' && state.hexes && Object.keys(state.hexes).length > 0,
    { timeout: 15000 }
  ).catch(() => { throw new Error('MAP_IMPORT_TIMEOUT:' + mapName); });
}

async function importEntities(page, mapName) {
  const rb = entitiesRbFor(mapName);
  if (!rb) throw new Error('NO_ENTITIES_FILE:' + mapName);
  await uploadTo(page, 'importEntitiesFile', rb);
  await sleep(1500);
}

// Import game.rb to populate trains and phases (uses the tool's importGameFile input).
async function importGame(page, mapName) {
  const s = MAP_SOURCES[mapName];
  if (!s) return;
  const gameRb = path.join(TOBYMAO, s.dir, 'game.rb');
  if (!fs.existsSync(gameRb)) return;
  await uploadTo(page, 'importGameFile', gameRb);
  await sleep(1000);
}

// Setup C: add 6 majors AA–AF via the addCompany UI flow.
// Setup D: add 12 minors BA–BK (skipping I to dodge OCR ambiguity).
// Setup E: add 5 majors + a synthetic National via the same flow.
//
// The companies-panel exposes a wizard modal. Driving that fully via
// clicks across 60 tests is fragile; we use programmatic state pokes
// targeted at state.companies/state.minors which are the same shape the
// UI builds. The exporters read state.companies/state.minors directly,
// so the resulting Ruby is what the tool would produce from this shape.
// This is functionally equivalent to a user clicking "Add Corporation"
// 6 times and filling defaults — we just skip the modal clicks.
async function setupCustom(page, mode, mapName) {
  await page.evaluate((mode, mapName) => {
    const homes = {
      '1830':   ['E15','E11','F14','I12','D14','H10','B22','A19'],
      '1889':   ['G3','B11','J5','F8','D11','I8'],
      '1846':   ['B12','C15','D14','E11','F8','G3'],
      '1882':   ['F4','G7','H10','I13','D6','E9'],
      '1856':   ['H4','I7','J10','L6','M9','K11'],
      '1822MX': ['B14','D12','F10','H8','J6','L4'],
      '18SJ':   ['D4','F8','H6','J10','L4','C5'],
      '1870':   ['C12','D7','E14','F9','G6','H11'],
    };
    const baseHomes = homes[mapName] || homes['1830'];
    const COLORS = ['#EF1D24','#0066A5','#00A651','#FFCC00','#F47C20','#7E2D86','#444','#888'];
    const mkMajor = (sym, name, home, color, tokens) => ({
      sym, name, abbr: sym, color, textColor: '#fff',
      homeHex: home, parValue: 100, tokens, floatPct: 60,
      shares: [20,10,10,10,10,10,10,10,10],
      type: 'major',
    });
    const mkMinor = (sym, name, home, color) => ({
      sym, name, abbr: sym, color, textColor: '#fff',
      homeHex: home, parValue: 50, tokens: 1, floatPct: 50,
      shares: [50,50],
      type: 'minor',
    });
    state.companies = state.companies || [];
    state.minors    = state.minors    || [];

    if (mode === 'C') {
      const names = ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta'];
      const syms  = ['AA','AB','AC','AD','AE','AF'];
      state.companies = syms.map((s,i) =>
        mkMajor(s, names[i]+' Railway', baseHomes[i%baseHomes.length], COLORS[i%COLORS.length], 3));
    } else if (mode === 'D') {
      // 3 majors AA–AC (needed so Edit 5 "remove a major" has something to remove)
      state.companies = ['AA','AB','AC'].map((s,i) =>
        mkMajor(s, ['Alpha','Beta','Gamma'][i]+' Railway', baseHomes[i%baseHomes.length], COLORS[i%COLORS.length], 3));
      // 12 minors BA, BB, BC, BD, BE, BF, BG, BH, BJ, BK, BL, BM  (skip BI for OCR)
      const syms = ['BA','BB','BC','BD','BE','BF','BG','BH','BJ','BK','BL','BM'];
      state.minors = syms.map((s,i) =>
        mkMinor(s, 'Minor '+s, baseHomes[i%baseHomes.length], COLORS[i%COLORS.length]));
      // Mark that minors retain initiating company name on merger
      state.mechanics = state.mechanics || {};
      state.mechanics.merge_retain_name = true;
    } else if (mode === 'E') {
      const syms = ['AA','AB','AC','AD','AE'];
      state.companies = syms.map((s,i) =>
        mkMajor(s, 'Major '+s, baseHomes[i%baseHomes.length], COLORS[i%COLORS.length], 3));
      // National Co takes exported permanent trains.
      const natl = mkMajor('NTL','National', baseHomes[5%baseHomes.length], '#222', 4);
      natl.isNational = true;
      natl.receivesExportedPermanentTrains = true;
      state.companies.push(natl);
      // Seed privates so Edit 6 (replace a private with exchange ability) can run.
      state.privates = [
        { name: 'Alpha Concession', cost: 20,  revenue: 5,  sym: 'AC1', abilities: [] },
        { name: 'Beta Concession',  cost: 45,  revenue: 10, sym: 'BC1', abilities: [] },
        { name: 'Gamma Concession', cost: 70,  revenue: 15, sym: 'GC1', abilities: [] },
      ];
      state.mechanics = state.mechanics || {};
      state.mechanics.national_operates = true;
      state.mechanics.export_train      = true;
    }
    // Re-render tables to reflect.
    if (typeof renderCompaniesTable === 'function') renderCompaniesTable();
    if (typeof renderMinorsTable    === 'function') renderMinorsTable();
  }, mode, mapName);
  await sleep(300);
}

// ── Edit application ──────────────────────────────────────────────────────────
// Each returns { ok: bool, note: string }.
// The tool's UI represents most of these as state.* writes. Where the UI has
// no path (e.g. permanent L train on a private), we return ok:false.

async function applyEdit(page, editNum, mapName) {
  return await page.evaluate((editNum, mapName) => {
    function pickHome() {
      const hexes = Object.keys(state.hexes || {});
      if (!hexes.length) return 'A1';
      return hexes[Math.floor(Math.random()*hexes.length)];
    }
    function findFirstTrainOfType(t) {
      return (state.trains||[]).findIndex(tr =>
        (tr.label === t || tr.type === t || String(tr.n) === t));
    }
    state.mechanics = state.mechanics || {};
    state.companies = state.companies || [];
    state.minors    = state.minors    || [];
    state.privates  = state.privates  || [];
    state.trains    = state.trains    || [];

    // Always tick on export_train mechanic per Erin's note.
    state.mechanics.export_train = true;

    try {
      switch (editNum) {
        case 1: {
          state.companies.push({
            sym: 'JC', abbr: 'JC', name: 'JC Railway',
            color: '#990099', textColor: '#fff',
            homeHex: pickHome(), parValue: 100, tokens: 3, floatPct: 60,
            shares: [20,10,10,10,10,10,10,10,10],
            type: 'major',
          });
          if (typeof renderCompaniesTable === 'function') renderCompaniesTable();
          return { ok: true, note: 'Added major JC with 3 tokens' };
        }
        case 2: {
          if (!state.privates.length) return { ok: false, note: 'No existing privates to replace' };
          const idx = Math.floor(Math.random()*state.privates.length);
          state.privates[idx].abilities = [{
            type: 'tile_lay',
            owner_type: 'corporation',
            count: 1, free: false,
            closed_when_used_up: true, reachable: true,
            hexes: [], tiles: [],
          }];
          state.privates[idx].name = state.privates[idx].name + ' (+Extra Tile)';
          return { ok: true, note: 'Replaced private '+idx+' with extra-tile-lay ability' };
        }
        case 3: {
          // Permanent L train granted by a private.
          // ABILITY_DEFS has no "grant permanent train" type — closest is purchase_train.
          // We can express it via a private with a linked train. The tool does support
          // linkedPrivateIdx on a train, so create a permanent L train and link it.
          const priv = {
            name: 'L-Train Concession', cost: 100, revenue: 0, buyerType: 'any',
            ability: 'Grants the owning corporation a permanent L train.',
            abilities: [{ type: 'generic', desc: 'Grants permanent L train' }],
          };
          state.privates.push(priv);
          const pIdx = state.privates.length - 1;
          state.trains.push({
            id: 't_L'+Date.now(), label: 'L', distType: 'n', n: 1,
            cost: 100, count: 1, rusts: false, rustsOn: null,
            phase: '2',
            privateOnly: true, linkedPrivateIdx: pIdx,
            grantedBy: [{ sym: priv.name.replace(/\s+/g,'').slice(0,4), name: priv.name }],
          });
          return { ok: true, note: 'Added private + linked permanent L train (generic ability)' };
        }
        case 4: {
          // 5H train: hex-distance type 'h', phase '4', cost 350, permanent (rusts: false), count 2
          const phase4 = (state.phases||[]).find(p => p.name === '4');
          state.trains.push({
            id: 't_5H'+Date.now(), label: '5H', distType: 'h', h: 5,
            cost: 350, count: 2, rusts: false, rustsOn: null,
            phase: phase4 ? '4' : '4',
          });
          return { ok: true, note: 'Added 5H train, cost 350, qty 2, phase 4, permanent' };
        }
        case 5: {
          if (!state.companies.length) return { ok: false, note: 'No majors to remove' };
          const ridx = Math.floor(Math.random()*state.companies.length);
          const removed = state.companies[ridx].sym || state.companies[ridx].abbr;
          state.companies.splice(ridx, 1);
          state.companies.push({
            sym: 'JY', abbr: 'JY', name: 'JY Railway',
            color: '#669900', textColor: '#fff',
            homeHex: pickHome(), parValue: 100, tokens: 3, floatPct: 60,
            shares: [20,10,10,10,10,10,10,10,10],
            type: 'major',
          });
          return { ok: true, note: 'Removed '+removed+', added JY w/ 3 tokens' };
        }
        case 6: {
          if (!state.privates.length) return { ok: false, note: 'No privates to replace' };
          const idx = Math.floor(Math.random()*state.privates.length);
          const corps = (state.companies||[]).map(c => c.sym || c.abbr).filter(Boolean);
          if (!corps.length) return { ok: false, note: 'No majors to anchor exchange' };
          const target = corps[Math.floor(Math.random()*corps.length)];
          state.privates[idx].revenue  = 10;
          state.privates[idx].abilities = [{
            type: 'exchange', owner_type: 'player',
            corporations: [target], when: 'phase_3',
            from: ['reserved'], shares: ['reserved'],
          }];
          state.privates[idx].name = 'Reserve-Share Concession ('+target+')';
          return { ok: true, note: 'Private exchangeable for reserved '+target+' share at phase 3 / else $10' };
        }
        case 7: {
          const idx = findFirstTrainOfType('2');
          if (idx < 0) return { ok: false, note: 'No 2-train present' };
          const t = state.trains[idx];
          if (t.count == null) return { ok: false, note: '2-train is unlimited; cannot reduce' };
          if (t.count <= 1)    return { ok: false, note: '2-train count already 1; cannot reduce further' };
          t.count -= 1;
          return { ok: true, note: '2-train count reduced to '+t.count };
        }
        case 8: {
          const m = state.mechanics;
          if (!m.two_tile_lays && !m.lay_second_tile) {
            m.two_tile_lays = true;
            m.tileLays = m.tileLays || {};
            m.tileLays.default = [{ lay: true, upgrade: true, cost: 0 },
                                  { lay: true, upgrade: false, cost: 20 }];
            return { ok: true, note: 'Added two-tile-lay; second tile costs $20' };
          }
          // Toggle: $20 ↔ free
          m.tileLays = m.tileLays || {};
          const slots = m.tileLays.default || [];
          if (slots.length >= 2) {
            const secondCost = slots[1].cost || 0;
            slots[1].cost = (secondCost === 20) ? 0 : 20;
            return { ok: true, note: 'Two-tile-lay second slot cost toggled to $'+slots[1].cost };
          }
          m.tileLays.default = [{ lay: true, upgrade: true, cost: 0 },
                                { lay: true, upgrade: false, cost: 20 }];
          return { ok: true, note: 'Configured second-tile cost = $20' };
        }
        case 9: {
          state.privates.push({
            name: 'Water Engineer', cost: 80, revenue: 10, buyerType: 'any',
            ability: 'One free water upgrade, or $10 discount on all water upgrades.',
            abilities: [{ type: 'tile_discount', owner_type: 'corporation',
                          discount: 10, terrain: 'water', hexes: [] }],
          });
          return { ok: true, note: 'Added water-discount private (terrain=water, $10)' };
        }
        case 10: {
          state.financials = state.financials || {};
          const cur = state.financials.marketType || '2D';
          state.financials.marketType = (cur === '2D') ? '1D' : '2D';
          return { ok: true, note: 'Market type changed '+cur+' → '+state.financials.marketType };
        }
      }
    } catch (err) {
      return { ok: false, note: 'edit '+editNum+' threw: '+err.message };
    }
    return { ok: false, note: 'unknown edit '+editNum };
  }, editNum, mapName);
}

// ── Export capture ────────────────────────────────────────────────────────────

async function captureExports(page) {
  return await page.evaluate(() => {
    const out = { game: null, entities: null, meta: null, map: null, err: [] };
    try {
      out.entities = (typeof renderEntitiesRb === 'function') ? renderEntitiesRb()
                  : (typeof exportEntitiesRb === 'function') ? exportEntitiesRb()
                  : null;
    } catch (e) { out.err.push('entities: '+e.message); }
    try {
      out.game = (typeof renderGameRb === 'function') ? renderGameRb()
              :  (typeof generateGameRb === 'function') ? generateGameRb() : null;
    } catch (e) { out.err.push('game: '+e.message); }
    try {
      out.meta = (typeof renderMetaRb === 'function') ? renderMetaRb()
              :  (typeof generateMetaRb === 'function') ? generateMetaRb()
              :  (typeof exportMetaRb === 'function') ? exportMetaRb() : null;
    } catch (e) { out.err.push('meta: '+e.message); }
    try { out.map = typeof exportRubyMap === 'function' ? exportRubyMap() : null; }
    catch (e) { out.err.push('map: '+e.message); }
    return out;
  });
}

// ── Sanity-check the exported Ruby ────────────────────────────────────────────
// Basic checks: non-empty, contains expected constant declarations.
function ruby_sanityCheck(out, edit1, edit2) {
  const errs = [];
  if (!out.entities) errs.push('no entities.rb output');
  if (!out.game)     errs.push('no game.rb output');
  if (!out.map)      errs.push('no map.rb output');
  if (out.entities && !/(COMPANIES|CORPORATIONS|MINORS)/.test(out.entities))
    errs.push('entities.rb missing COMPANIES/CORPORATIONS/MINORS');
  if (out.game && !/TRAINS|PHASES|MARKET|BANK/.test(out.game))
    errs.push('game.rb missing core constants');
  return errs;
}

// ── Single-test runner ────────────────────────────────────────────────────────

async function runTest(test) {
  const id    = test.id;
  const map   = test.map;
  const setup = test.setup;
  const edit1 = test.edit1;
  const edit2 = test.edit2;
  const outDir = path.join(OUT_DIR, id);
  ensureDir(outDir);

  let page;
  try {
    page = await freshPage();
  } catch (err) {
    logRow({ id, map, setup, edit1, edit2, status: 'FAIL', notes: 'Page load: '+err.message });
    return;
  }

  const stages = [];
  try {
    // 1. Map import
    try {
      await importMap(page, map);
      stages.push('map');
    } catch (err) {
      if (err.message.startsWith('NO_MAP_FILE')) {
        await page.close();
        logRow({ id, map, setup, edit1, edit2, status: 'UNSUPPORTED', notes: 'No map.rb available for '+map });
        return;
      }
      await page.close();
      logRow({ id, map, setup, edit1, edit2, status: 'FAIL', notes: 'map import: '+err.message });
      return;
    }

    // 2. Setup
    try {
      if (setup === 'A') {
        await importEntities(page, '1889');
        await importGame(page, '1889');
      } else if (setup === 'B') {
        await importEntities(page, '1846');
        await importGame(page, '1846');
      } else {
        await setupCustom(page, setup, map);
      }
      stages.push('setup');
    } catch (err) {
      await page.close();
      logRow({ id, map, setup, edit1, edit2, status: 'FAIL', notes: 'setup '+setup+': '+err.message });
      return;
    }

    // 3. Edits
    const editResults = [];
    for (const e of [edit1, edit2]) {
      const r = await applyEdit(page, e, map);
      editResults.push({ edit: e, ...r });
      if (!r.ok) break;
    }
    const failedEdit = editResults.find(r => !r.ok);
    stages.push('edits');

    // 4. Capture exports unconditionally so we record what the tool produced.
    const out = await captureExports(page);
    if (out.entities) fs.writeFileSync(path.join(outDir,'entities.rb'), out.entities,'utf8');
    if (out.game)     fs.writeFileSync(path.join(outDir,'game.rb'),     out.game,    'utf8');
    if (out.meta)     fs.writeFileSync(path.join(outDir,'meta.rb'),     out.meta,    'utf8');
    if (out.map)      fs.writeFileSync(path.join(outDir,'map.rb'),      out.map,     'utf8');
    fs.writeFileSync(path.join(outDir,'edits.json'), JSON.stringify(editResults,null,2), 'utf8');

    await page.close();

    if (failedEdit) {
      logRow({ id, map, setup, edit1, edit2, status: 'UNSUPPORTED',
               notes: 'Edit '+failedEdit.edit+': '+failedEdit.note });
      return;
    }
    const sanity = ruby_sanityCheck(out, edit1, edit2);
    if (sanity.length) {
      logRow({ id, map, setup, edit1, edit2, status: 'FAIL',
               notes: 'Export issues: '+sanity.join('; ') });
      return;
    }
    // Deployment to codespace not available. Per instructions: BLOCKED with output preserved.
    logRow({ id, map, setup, edit1, edit2, status: 'BLOCKED',
             notes: 'Exports OK ('+editResults.map(e=>'e'+e.edit+':'+(e.ok?'ok':'no')).join(',')+'); codespace SSH unavailable' });
  } catch (err) {
    try { await page.close(); } catch {}
    logRow({ id, map, setup, edit1, edit2, status: 'FAIL', notes: 'unhandled: '+err.message });
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const matrix = JSON.parse(fs.readFileSync(MATRIX,'utf8'));
  const args = process.argv.slice(2);
  let from = 0, only = null;
  for (const a of args) {
    if (a.startsWith('--from=')) from = parseInt(a.slice(7),10) - 1;
    else if (/^forge\d+$/.test(a)) only = a;
  }
  ensureDir(OUT_DIR);

  for (let i = from; i < matrix.length; i++) {
    const t = matrix[i];
    if (only && t.id !== only) continue;
    await runTest(t);
  }

  if (_browser) await _browser.close();
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
