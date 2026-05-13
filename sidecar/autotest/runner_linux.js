// sidecar/autotest/runner_linux.js — E2E forge test suite
// Pipeline: export (Puppeteer) → deploy to engine dir → Ruby verify → PASS/FAIL
//
// All paths auto-detected; override via env vars:
//   ERIN_ROOT        — 18xxtools repo root (default: one dir above this file)
//   ERIN_WORKTREE    — dir containing index.html (default: auto-discovers .claude/worktrees/*)
//   ERIN_ENGINE_DIR  — path to lib/engine/game in the tobymao repo
//   ERIN_DOCKER      — docker container name for ruby verify (default: 18xx-rack-1)
//   ERIN_BASE_URL    — override the file:// URL for Puppeteer

const puppeteer    = require('../../node_modules/puppeteer');
const fs           = require('fs');
const path         = require('path');
const { execSync } = require('child_process');

// ── Path resolution ──────────────────────────────────────────────────────────

const ROOT = process.env.ERIN_ROOT || path.resolve(__dirname, '../..');

// Auto-discover worktree: pick the most-recently-modified one with index.html.
// Falls back to ROOT itself if no worktrees contain index.html.
function findWorktree(root) {
  if (process.env.ERIN_WORKTREE) return process.env.ERIN_WORKTREE;
  const wtBase = path.join(root, '.claude', 'worktrees');
  if (fs.existsSync(wtBase)) {
    const candidates = fs.readdirSync(wtBase)
      .map(e => path.join(wtBase, e))
      .filter(p => fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'js', 'export-entities.js')))
      .sort((a, b) => {
        // Sort descending by mtime of export-entities.js (newest Evan fix wins)
        const ma = fs.statSync(path.join(a, 'js', 'export-entities.js')).mtimeMs;
        const mb = fs.statSync(path.join(b, 'js', 'export-entities.js')).mtimeMs;
        return mb - ma;
      });
    if (candidates.length) return candidates[0];
  }
  if (fs.existsSync(path.join(root, 'index.html'))) return root;
  throw new Error('Cannot find a worktree with export-entities.js. Set ERIN_WORKTREE env var.');
}

const WORKTREE    = findWorktree(ROOT);
const ERIN_DIR    = __dirname;
const OUT_DIR     = path.join(ERIN_DIR, 'output');
const LOG_FILE    = path.join(ERIN_DIR, 'test_log.md');
const MATRIX      = path.join(ERIN_DIR, 'test_matrix.json');
const LOCAL_MAPS  = path.join(ROOT, 'maps');
const BASE_URL    = process.env.ERIN_BASE_URL || ('file://' + WORKTREE.replace(/\\/g, '/') + '/index.html');
// Auto-discover engine game dir: check env var, then common codespace layouts
function findEngineDir() {
  if (process.env.ERIN_ENGINE_DIR) return process.env.ERIN_ENGINE_DIR;
  const candidates = [
    // Sibling repo in same workspace root
    path.join(ROOT, '..', '18xx-master', 'lib', 'engine', 'game'),
    path.join(ROOT, '..', '18xx',        'lib', 'engine', 'game'),
    // Parent-of-parent contains a Rail or workspace folder (Claude sandbox layout)
    path.join(ROOT, '..', 'Rail', '18xx-master', 'lib', 'engine', 'game'),
    path.join(ROOT, '..', 'Rail', '18xx',        'lib', 'engine', 'game'),
    // Codespace /workspaces
    '/workspaces/18xx-master/lib/engine/game',
    '/workspaces/18xx/lib/engine/game',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;  // will export-only, no deploy/verify
}
const ENGINE_DIR  = findEngineDir();   // e.g. /workspaces/18xx/lib/engine/game
const DOCKER_CTR  = process.env.ERIN_DOCKER      || '18xx-rack-1';

const MAP_SOURCES = {
  '1882':         { dir: 'g_1882',          local: path.join(LOCAL_MAPS, '1882.rb')         },
  '1822MX':       { dir: 'g_1822_mx',       local: null                                      },
  '18Chesapeake': { dir: 'g_18_chesapeake', local: path.join(LOCAL_MAPS, '18chesapeake.rb') },
  '1830':         { dir: 'g_1830',          local: path.join(LOCAL_MAPS, '1830.rb')         },
  '1889':         { dir: 'g_1889',          local: path.join(LOCAL_MAPS, '1889.rb')         },
  '1856':         { dir: 'g_1856',          local: path.join(LOCAL_MAPS, '1856.rb')         },
  '1846':         { dir: 'g_1846',          local: path.join(LOCAL_MAPS, '1846.rb')         },
  '18SJ':         { dir: 'g_18_sj',         local: path.join(LOCAL_MAPS, '18SJ.rb')        },
  '1870':         { dir: 'g_1870',          local: path.join(LOCAL_MAPS, '1870.rb')         },
};

function mapRbFor(name) {
  const s = MAP_SOURCES[name];
  if (!s) return null;
  if (ENGINE_DIR) {
    const p = path.join(ENGINE_DIR, s.dir, 'map.rb');
    if (fs.existsSync(p)) return p;
  }
  if (s.local && fs.existsSync(s.local)) return s.local;
  return null;
}
function entitiesRbFor(name) {
  const s = MAP_SOURCES[name];
  if (!s) return null;
  const local = path.join(LOCAL_MAPS, s.dir + '_entities.rb');
  if (fs.existsSync(local)) return local;
  if (ENGINE_DIR) {
    const p = path.join(ENGINE_DIR, s.dir, 'entities.rb');
    if (fs.existsSync(p)) return p;
  }
  return null;
}
async function importGame(page, mapName) {
  const s = MAP_SOURCES[mapName];
  if (!s) return;
  const local = path.join(LOCAL_MAPS, s.dir + '_game.rb');
  const gameRb = fs.existsSync(local) ? local
    : (ENGINE_DIR ? (() => { const p = path.join(ENGINE_DIR, s.dir, 'game.rb'); return fs.existsSync(p) ? p : null; })() : null);
  if (!gameRb) return;
  await uploadTo(page, 'importGameFile', gameRb);
  await sleep(1000);
}

// ── Logging ──────────────────────────────────────────────────────────────────

function nowIso() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function logRow({ id, map, setup, edit1, edit2, status, notes }) {
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, [
      '# Erin — 18xxtools E2E Test Log', '',
      `Started: ${nowIso()}`, '',
      '| ID       | Map          | Setup | Edit1 | Edit2 | Status      | Notes |',
      '|----------|--------------|-------|-------|-------|-------------|-------|', '',
    ].join('\n'), 'utf8');
  }
  const row = `| ${id.padEnd(8)} | ${String(map).padEnd(12)} | ${String(setup).padEnd(5)} | ${String(edit1).padEnd(5)} | ${String(edit2).padEnd(5)} | ${String(status).padEnd(11)} | ${(notes || '').replace(/\n/g, ' ')} |\n`;
  fs.appendFileSync(LOG_FILE, row);
  console.log(`[${id}] ${status} — ${notes || ''}`);
}

// ── Browser ──────────────────────────────────────────────────────────────────

let _browser = null;
async function getBrowser() {
  if (_browser) return _browser;
  _browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files', '--disable-web-security'],
  });
  return _browser;
}

async function freshPage() {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  page.on('pageerror', err => console.error('  pageerror:', err.message));
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => typeof state !== 'undefined' && state.meta, { timeout: 15000 });
  return page;
}

async function uploadTo(page, inputId, filePath) {
  const input = await page.$('#' + inputId);
  if (!input) throw new Error(`upload target ${inputId} not found`);
  await input.uploadFile(filePath);
  await sleep(500);
}

// ── Import helpers ────────────────────────────────────────────────────────────

async function importMap(page, mapName) {
  const rb = mapRbFor(mapName);
  if (!rb) throw new Error('NO_MAP_FILE:' + mapName);
  const content  = fs.readFileSync(rb, 'utf8');
  const fileName = path.basename(rb);
  const ok = await page.evaluate((mapContent, name) => {
    window.__erinSkipCollisionDialog = true;
    try { applyMapImport(mapContent, name); } catch (e) { console.error('[erin] importMap note:', e.message); }
    window.__erinSkipCollisionDialog = false;
    return typeof state !== 'undefined' && !!state.hexes && Object.keys(state.hexes).length > 0;
  }, content, fileName);
  if (!ok) throw new Error('MAP_IMPORT_TIMEOUT:' + mapName);
}

async function importEntities(page, mapName) {
  const rb = entitiesRbFor(mapName);
  if (!rb) throw new Error('NO_ENTITIES_FILE:' + mapName);
  await uploadTo(page, 'importEntitiesFile', rb);
  await sleep(1500);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

async function setupCustom(page, mode, mapName) {
  await page.evaluate((mode, mapName) => {
    const homes = {
      '1830':         ['E15', 'E11', 'F14', 'I12', 'D14', 'H10', 'B22', 'A19'],
      '1889':         ['G3',  'B11', 'J5',  'F8',  'D11', 'I8'],
      '1846':         ['B12', 'C15', 'D14', 'E11', 'F8',  'G3'],
      '1882':         ['F4',  'G7',  'H10', 'I13', 'D6',  'E9'],
      '1856':         ['H4',  'I7',  'J10', 'L6',  'M9',  'K11'],
      '1822MX':       ['B14', 'D12', 'F10', 'H8',  'J6',  'L4'],
      '18Chesapeake': ['D2',  'B4',  'G3',  'H4',  'J2',  'C5'],
      '18SJ':         ['D4',  'F8',  'H6',  'J10', 'L4',  'C5'],
      '1870':         ['C12', 'D7',  'E14', 'F9',  'G6',  'H11'],
    };
    const baseHomes = homes[mapName] || homes['1830'];
    const COLORS = ['#EF1D24', '#0066A5', '#00A651', '#FFCC00', '#F47C20', '#7E2D86', '#444', '#888'];
    const mkMajor = (sym, name, home, color, tokens) => ({
      sym, name, abbr: sym, color, textColor: '#fff',
      homeHex: home, parValue: 100, tokens, floatPct: 60,
      shares: [20, 10, 10, 10, 10, 10, 10, 10, 10], type: 'major',
    });
    const mkMinor = (sym, name, home, color) => ({
      sym, name, abbr: sym, color, textColor: '#fff',
      homeHex: home, parValue: 50, tokens: 1, floatPct: 50,
      shares: [50, 50], type: 'minor',
    });
    state.companies = state.companies || [];
    state.minors    = state.minors    || [];
    if (mode === 'C') {
      const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'];
      const syms  = ['AA', 'AB', 'AC', 'AD', 'AE', 'AF'];
      state.companies = syms.map((s, i) =>
        mkMajor(s, names[i] + ' Railway', baseHomes[i % baseHomes.length], COLORS[i % COLORS.length], 3));
    } else if (mode === 'D') {
      state.companies = ['AA', 'AB', 'AC'].map((s, i) =>
        mkMajor(s, ['Alpha', 'Beta', 'Gamma'][i] + ' Railway', baseHomes[i % baseHomes.length], COLORS[i % COLORS.length], 3));
      const syms = ['BA', 'BB', 'BC', 'BD', 'BE', 'BF', 'BG', 'BH', 'BJ', 'BK', 'BL', 'BM'];
      state.minors = syms.map((s, i) =>
        mkMinor(s, 'Minor ' + s, baseHomes[i % baseHomes.length], COLORS[i % COLORS.length]));
      state.mechanics = state.mechanics || {};
      state.mechanics.merge_retain_name = true;
    } else if (mode === 'E') {
      const syms = ['AA', 'AB', 'AC', 'AD', 'AE'];
      state.companies = syms.map((s, i) =>
        mkMajor(s, 'Major ' + s, baseHomes[i % baseHomes.length], COLORS[i % COLORS.length], 3));
      const natl = mkMajor('NTL', 'National', baseHomes[5 % baseHomes.length], '#222', 4);
      natl.isNational = true;
      natl.receivesExportedPermanentTrains = true;
      state.companies.push(natl);
      state.privates = [
        { name: 'Alpha Concession', cost: 20,  revenue: 5,  sym: 'AC1', abilities: [] },
        { name: 'Beta Concession',  cost: 45,  revenue: 10, sym: 'BC1', abilities: [] },
        { name: 'Gamma Concession', cost: 70,  revenue: 15, sym: 'GC1', abilities: [] },
      ];
      state.mechanics = state.mechanics || {};
      state.mechanics.national_operates = true;
      state.mechanics.export_train      = true;
    }
    if (typeof renderCompaniesTable === 'function') renderCompaniesTable();
    if (typeof renderMinorsTable    === 'function') renderMinorsTable();
  }, mode, mapName);
  await sleep(300);
}

// ── Edits ─────────────────────────────────────────────────────────────────────

async function applyEdit(page, editNum, mapName) {
  return await page.evaluate((editNum, mapName) => {
    function pickHome() {
      const hexes = Object.keys(state.hexes || {});
      if (!hexes.length) return 'A1';
      return hexes[Math.floor(Math.random() * hexes.length)];
    }
    function findFirstTrainOfType(t) {
      return (state.trains || []).findIndex(tr =>
        (tr.label === t || tr.type === t || String(tr.n) === t));
    }
    state.mechanics = state.mechanics || {};
    state.companies = state.companies || [];
    state.minors    = state.minors    || [];
    state.privates  = state.privates  || [];
    state.trains    = state.trains    || [];
    state.mechanics.export_train = true;
    try {
      switch (editNum) {
        case 1: {
          state.companies.push({
            sym: 'JC', abbr: 'JC', name: 'JC Railway',
            color: '#990099', textColor: '#fff',
            homeHex: pickHome(), parValue: 100, tokens: 3, floatPct: 60,
            shares: [20, 10, 10, 10, 10, 10, 10, 10, 10], type: 'major',
          });
          if (typeof renderCompaniesTable === 'function') renderCompaniesTable();
          return { ok: true, note: 'Added major JC with 3 tokens' };
        }
        case 2: {
          if (!state.privates.length) return { ok: false, note: 'No existing privates to replace' };
          const idx = Math.floor(Math.random() * state.privates.length);
          state.privates[idx].abilities = [{
            type: 'tile_lay', owner_type: 'corporation',
            count: 1, free: false, closed_when_used_up: true, reachable: true,
            hexes: [], tiles: [],
          }];
          state.privates[idx].name = state.privates[idx].name + ' (+Extra Tile)';
          return { ok: true, note: 'Replaced private ' + idx + ' with extra-tile-lay ability' };
        }
        case 3: {
          const priv = {
            name: 'L-Train Concession', cost: 100, revenue: 0, buyerType: 'any',
            ability: 'Grants the owning corporation a permanent L train.',
            abilities: [{ type: 'generic', desc: 'Grants permanent L train' }],
          };
          state.privates.push(priv);
          const pIdx = state.privates.length - 1;
          state.trains.push({
            id: 't_L' + Date.now(), label: 'L', distType: 'n', n: 1,
            cost: 100, count: 1, rusts: false, rustsOn: null,
            phase: '2', privateOnly: true, linkedPrivateIdx: pIdx,
            grantedBy: [{ sym: priv.name.replace(/\s+/g, '').slice(0, 4), name: priv.name }],
          });
          return { ok: true, note: 'Added private + linked permanent L train (generic ability)' };
        }
        case 4: {
          state.trains.push({
            id: 't_5H' + Date.now(), label: '5H', distType: 'h', h: 5,
            cost: 350, count: 2, rusts: false, rustsOn: null, phase: '4',
          });
          return { ok: true, note: 'Added 5H train, cost 350, qty 2, phase 4, permanent' };
        }
        case 5: {
          if (!state.companies.length) {
            const bh = {
              '1830': ['E15', 'E11', 'F14'], '1889': ['G3', 'B11', 'J5'],
              '1846': ['B12', 'C15', 'D14'], '1882': ['F4', 'G7', 'H10'],
              '1822MX': ['B14', 'D12', 'F10'], '1856': ['H4', 'I7', 'J10'],
              '18SJ': ['D4', 'F8', 'H6'], '1870': ['C12', 'D7', 'E14'],
              '18Chesapeake': ['D2', 'B4', 'H4'],
            };
            const homes = (bh[mapName] || ['A1', 'B2', 'C3']);
            ['AA', 'AB', 'AC'].forEach((s, i) => state.companies.push({
              sym: s, name: ['Alpha', 'Beta', 'Gamma'][i] + ' Railway', abbr: s,
              color: ['#EF1D24', '#0066A5', '#00A651'][i], textColor: '#fff',
              homeHex: homes[i % homes.length], parValue: 100, tokens: 3, floatPct: 60,
              shares: [20, 10, 10, 10, 10, 10, 10, 10, 10], type: 'major',
            }));
          }
          const ridx = Math.floor(Math.random() * state.companies.length);
          const removed = state.companies[ridx].sym || state.companies[ridx].abbr;
          state.companies.splice(ridx, 1);
          state.companies.push({
            sym: 'JY', abbr: 'JY', name: 'JY Railway',
            color: '#669900', textColor: '#fff',
            homeHex: pickHome(), parValue: 100, tokens: 3, floatPct: 60,
            shares: [20, 10, 10, 10, 10, 10, 10, 10, 10], type: 'major',
          });
          return { ok: true, note: 'Removed ' + removed + ', added JY w/ 3 tokens' };
        }
        case 6: {
          if (!state.privates.length) {
            state.privates.push(
              { name: 'Alpha Concession', cost: 20, revenue: 5,  sym: 'AC1', abilities: [] },
              { name: 'Beta Concession',  cost: 45, revenue: 10, sym: 'BC1', abilities: [] }
            );
          }
          if (!state.companies.length) {
            const bh = {
              '1830': ['E15', 'E11', 'F14'], '1889': ['G3', 'B11', 'J5'],
              '1846': ['B12', 'C15', 'D14'], '1882': ['F4', 'G7', 'H10'],
              '1822MX': ['B14', 'D12', 'F10'], '1856': ['H4', 'I7', 'J10'],
              '18SJ': ['D4', 'F8', 'H6'], '1870': ['C12', 'D7', 'E14'],
              '18Chesapeake': ['D2', 'B4', 'H4'],
            };
            const homes = (bh[mapName] || ['A1', 'B2', 'C3']);
            ['AA', 'AB', 'AC'].forEach((s, i) => state.companies.push({
              sym: s, name: ['Alpha', 'Beta', 'Gamma'][i] + ' Railway', abbr: s,
              color: ['#EF1D24', '#0066A5', '#00A651'][i], textColor: '#fff',
              homeHex: homes[i % homes.length], parValue: 100, tokens: 3, floatPct: 60,
              shares: [20, 10, 10, 10, 10, 10, 10, 10, 10], type: 'major',
            }));
          }
          if (!state.privates.length) return { ok: false, note: 'No privates to replace' };
          const idx = Math.floor(Math.random() * state.privates.length);
          const corps = (state.companies || []).map(c => c.sym || c.abbr).filter(Boolean);
          if (!corps.length) return { ok: false, note: 'No majors to anchor exchange' };
          const target = corps[Math.floor(Math.random() * corps.length)];
          state.privates[idx].revenue  = 10;
          state.privates[idx].abilities = [{
            type: 'exchange', owner_type: 'player',
            corporations: [target], when: 'phase_3',
            from: ['reserved'], shares: ['reserved'],
          }];
          state.privates[idx].name = 'Reserve-Share Concession (' + target + ')';
          return { ok: true, note: 'Private exchangeable for reserved ' + target + ' share at phase 3 / else $10' };
        }
        case 7: {
          const idx = findFirstTrainOfType('2');
          if (idx < 0) return { ok: false, note: 'No 2-train present' };
          const t = state.trains[idx];
          t.count = t.count != null ? t.count + 1 : 7;
          return { ok: true, note: '2-train count increased to ' + t.count };
        }
        case 8: {
          const m = state.mechanics;
          if (!m.two_tile_lays && !m.lay_second_tile) {
            m.two_tile_lays = true;
            m.tileLays = m.tileLays || {};
            m.tileLays.default = [
              { lay: true, upgrade: true,  cost: 0  },
              { lay: true, upgrade: false, cost: 20 },
            ];
            return { ok: true, note: 'Added two-tile-lay; second tile costs $20' };
          }
          m.tileLays = m.tileLays || {};
          const slots = m.tileLays.default || [];
          if (slots.length >= 2) {
            slots[1].cost = (slots[1].cost || 0) === 20 ? 0 : 20;
            return { ok: true, note: 'Two-tile-lay second slot cost toggled to $' + slots[1].cost };
          }
          m.tileLays.default = [{ lay: true, upgrade: true, cost: 0 }, { lay: true, upgrade: false, cost: 20 }];
          return { ok: true, note: 'Configured second-tile cost = $20' };
        }
        case 9: {
          state.privates.push({
            name: 'Water Engineer', cost: 80, revenue: 10, buyerType: 'any',
            ability: 'One free water upgrade, or $10 discount on all water upgrades.',
            abilities: [{ type: 'tile_discount', owner_type: 'corporation', discount: 10, terrain: 'water', hexes: [] }],
          });
          return { ok: true, note: 'Added water-discount private (terrain=water, $10)' };
        }
        case 10: {
          state.financials = state.financials || {};
          const cur = state.financials.marketType || '2D';
          state.financials.marketType = (cur === '2D') ? '1D' : '2D';
          return { ok: true, note: 'Market type changed ' + cur + ' → ' + state.financials.marketType };
        }
      }
    } catch (err) {
      return { ok: false, note: 'edit ' + editNum + ' threw: ' + err.message };
    }
    return { ok: false, note: 'unknown edit ' + editNum };
  }, editNum, mapName);
}

// ── Export ────────────────────────────────────────────────────────────────────

async function captureExports(page) {
  return await page.evaluate(() => {
    const out = { game: null, entities: null, meta: null, map: null, err: [] };
    try { out.entities = (typeof renderEntitiesRb === 'function') ? renderEntitiesRb() : null; }
    catch (e) { out.err.push('entities: ' + e.message); }
    try {
      out.game = (typeof renderGameRb === 'function') ? renderGameRb()
               : (typeof generateGameRb === 'function') ? generateGameRb() : null;
    } catch (e) { out.err.push('game: ' + e.message); }
    try {
      out.meta = (typeof renderMetaRb === 'function') ? renderMetaRb()
               : (typeof generateMetaRb === 'function') ? generateMetaRb()
               : (typeof exportMetaRb === 'function') ? exportMetaRb() : null;
    } catch (e) { out.err.push('meta: ' + e.message); }
    try { out.map = (typeof exportRubyMap === 'function') ? exportRubyMap() : null; }
    catch (e) { out.err.push('map: ' + e.message); }
    return out;
  });
}

// Extract the game-specific module name — the first segment that isn't a
// reserved wrapper (Engine/Game/Map/Meta/Entities). Handles both nested
// `module X` and inline `module A::B::C` declarations.
function extractGameModuleName(rbText) {
  if (!rbText) return null;
  const reserved = new Set(['Engine', 'Game', 'Map', 'Meta', 'Entities']);
  const re = /^\s*module\s+([\w:]+)/gm;
  let m;
  while ((m = re.exec(rbText)) !== null) {
    for (const part of m[1].split('::')) {
      if (!reserved.has(part)) return part;
    }
  }
  return null;
}

// Sanity-check the raw string output before writing files.
// Does NOT fail on empty CORPORATIONS/COMPANIES/MINORS — base.rb supplies defaults.
function ruby_sanityCheck(out) {
  const errs = [];
  if (!out.entities) errs.push('no entities.rb output');
  if (!out.game)     errs.push('no game.rb output');
  if (!out.map)      errs.push('no map.rb output');
  if (out.game && !/TRAINS|PHASES|MARKET|BANK/.test(out.game))
    errs.push('game.rb missing core constants (TRAINS/PHASES/MARKET/BANK)');

  const files = { 'game.rb': out.game, 'entities.rb': out.entities,
                  'meta.rb': out.meta,  'map.rb':      out.map };
  const modules = {};
  for (const [name, text] of Object.entries(files)) {
    if (!text) continue;
    const mod = extractGameModuleName(text);
    if (!mod) errs.push(`${name}: no game module declaration found`);
    else      modules[name] = mod;
  }
  const distinct = [...new Set(Object.values(modules))];
  if (distinct.length > 1) {
    const pairs = Object.entries(modules).map(([f, m]) => `${f}=${m}`).join(', ');
    errs.push(`module name mismatch across exports (${pairs}) — deploy aborted`);
  }
  return errs;
}

// ── Deploy ────────────────────────────────────────────────────────────────────

function deployGame(id, outDir) {
  if (!ENGINE_DIR) return { ok: false, note: 'ERIN_ENGINE_DIR not set — skipping deploy' };
  const num     = id.replace('forge', '').replace(/^0+/, '');
  const dirName = 'g_forge' + num.padStart(2, '0');
  const destDir = path.join(ENGINE_DIR, dirName);
  ensureDir(destDir);
  for (const f of ['game.rb', 'entities.rb', 'meta.rb', 'map.rb']) {
    const src = path.join(outDir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(destDir, f));
  }
  return { ok: true, dir: dirName };
}

// ── Ruby verify ───────────────────────────────────────────────────────────────

function verifyGame(modName) {
  const rubySnippet = `require_relative 'lib/engine'; Engine::Game::${modName}::Game.new(%w[Alice Bob Charlie])`;
  try {
    execSync(`docker exec -w /18xx ${DOCKER_CTR} ruby -e "${rubySnippet.replace(/"/g, '\\"')}"`, {
      timeout: 30000,
      stdio:   'pipe',
    });
    return { ok: true };
  } catch (e) {
    const raw = ((e.stderr || e.stdout || '') + '').trim();
    const note = raw.split('\n').find(l => l.trim()) || e.message || 'unknown error';
    return { ok: false, note: note.slice(0, 200) };
  }
}

// ── Test runner ───────────────────────────────────────────────────────────────

async function runTest(test) {
  const { id, map, setup, edit1, edit2 } = test;
  const num     = id.replace('forge', '').replace(/^0+/, '');
  const modName = 'GForge' + num.padStart(2, '0');
  const dirName = 'g_forge' + num.padStart(2, '0');
  const outDir  = path.join(OUT_DIR, id);
  ensureDir(outDir);

  let page;
  try { page = await freshPage(); }
  catch (err) {
    logRow({ id, map, setup, edit1, edit2, status: 'FAIL', notes: 'Page load: ' + err.message });
    return;
  }

  try {
    // 1. Map import
    try {
      await importMap(page, map);
    } catch (err) {
      await page.close();
      const status = err.message.startsWith('NO_MAP_FILE') ? 'UNSUPPORTED' : 'FAIL';
      logRow({ id, map, setup, edit1, edit2, status, notes: 'map import: ' + err.message });
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
    } catch (err) {
      await page.close();
      logRow({ id, map, setup, edit1, edit2, status: 'FAIL', notes: 'setup ' + setup + ': ' + err.message });
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

    // 3b. Set unique title → module = GForgeNN
    await page.evaluate((testId) => {
      const n = testId.replace('forge', '').replace(/^0+/, '');
      state.meta = state.meta || {};
      state.meta.title = 'Forge' + n.padStart(2, '0');
    }, id);

    // 3c. Sync corpPacks for any legacy export-game.js readers
    await page.evaluate(() => {
      const all = [...(state.companies || []), ...(state.minors || [])];
      if (all.length && !(state.corpPacks || []).length)
        state.corpPacks = all.map(c => ({ ...c }));
    });

    // 4. Export to disk
    const out = await captureExports(page);
    if (out.entities) fs.writeFileSync(path.join(outDir, 'entities.rb'), out.entities, 'utf8');
    if (out.game)     fs.writeFileSync(path.join(outDir, 'game.rb'),     out.game,     'utf8');
    if (out.meta)     fs.writeFileSync(path.join(outDir, 'meta.rb'),     out.meta,     'utf8');
    if (out.map)      fs.writeFileSync(path.join(outDir, 'map.rb'),      out.map,      'utf8');
    fs.writeFileSync(path.join(outDir, 'edits.json'), JSON.stringify(editResults, null, 2), 'utf8');

    await page.close();

    if (failedEdit) {
      logRow({ id, map, setup, edit1, edit2, status: 'UNSUPPORTED',
               notes: 'Edit ' + failedEdit.edit + ': ' + failedEdit.note });
      return;
    }

    const sanity = ruby_sanityCheck(out);
    if (sanity.length) {
      logRow({ id, map, setup, edit1, edit2, status: 'FAIL',
               notes: 'Export issues: ' + sanity.join('; ') });
      return;
    }

    // 5. Deploy to engine directory
    const deployed = deployGame(id, outDir);
    if (!deployed.ok) {
      // No engine dir configured — still counts as export success, just not verified
      logRow({ id, map, setup, edit1, edit2, status: 'EXPORTED',
               notes: 'Exports OK; ' + deployed.note + ' module=' + modName });
      return;
    }

    // 6. Ruby verify
    const verified = verifyGame(modName);
    const editTag  = editResults.map(e => 'e' + e.edit + ':' + (e.ok ? 'ok' : 'no')).join(',');
    logRow({
      id, map, setup, edit1, edit2,
      status: verified.ok ? 'PASS' : 'FAIL',
      notes: verified.ok
        ? ('Ruby OK (' + editTag + ') module=' + modName + ' dir=' + dirName)
        : ('Ruby FAIL: ' + verified.note),
    });

  } catch (err) {
    try { await page.close(); } catch {}
    logRow({ id, map, setup, edit1, edit2, status: 'FAIL', notes: 'unhandled: ' + err.message });
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[erin] ROOT       =', ROOT);
  console.log('[erin] WORKTREE   =', WORKTREE);
  console.log('[erin] BASE_URL   =', BASE_URL);
  console.log('[erin] ENGINE_DIR =', ENGINE_DIR || '(not set — will export only, no deploy/verify)');
  console.log('[erin] DOCKER_CTR =', DOCKER_CTR);

  const matrix = JSON.parse(fs.readFileSync(MATRIX, 'utf8'));
  const args   = process.argv.slice(2);
  const ids    = args.filter(a => /^forge\d+$/.test(a));
  ensureDir(OUT_DIR);

  // Clear log for a fresh run (or specific IDs if filtering)
  if (!ids.length && fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);

  for (const t of matrix) {
    if (ids.length && !ids.includes(t.id)) continue;
    await runTest(t);
  }
  if (_browser) await _browser.close();
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
