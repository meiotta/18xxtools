// Round-trip test: import entities.rb → export → re-import → compare fields.
// Run with: node js/rt-test.js  (from worktree root)
'use strict';
const fs = require('fs');
const path = require('path');

// ── Extract source slices ────────────────────────────────────────────────────
const importSrc = fs.readFileSync(path.join(__dirname, 'import-ruby.js'), 'utf8');
const exportSrc = fs.readFileSync(path.join(__dirname, 'export-entities.js'), 'utf8');

const importSlice = importSrc.slice(
  importSrc.indexOf('// ─── IMPORT ENTITIES.RB'),
  importSrc.indexOf('// ─── IMPORT GAME.RB')
);
const exportSlice = exportSrc.slice(
  0,
  exportSrc.indexOf('// ── Button wiring')
);

// ── Minimal stubs ────────────────────────────────────────────────────────────
const stubs = `
'use strict';
let state = {};
function _cpRandId(prefix) { return prefix + '_' + Math.random().toString(36).slice(2,7); }
function _packDefaults(type) {
  const D = {
    major:    { floatPct:60,  maxOwnershipPct:60,  capitalization:'full',        alwaysMarketPrice:false, shares:[20,10,10,10,10,10,10,10,10], tokens:[0,40,100] },
    minor:    { floatPct:100, maxOwnershipPct:100, capitalization:'incremental', alwaysMarketPrice:true,  shares:[100],                        tokens:[0] },
    coal:     { floatPct:100, maxOwnershipPct:100, capitalization:'full',        alwaysMarketPrice:true,  shares:[100],                        tokens:[0] },
    national: { floatPct:0,   maxOwnershipPct:100, capitalization:'full',        alwaysMarketPrice:true,  shares:[10,10,10,10,10,10,10,10,10,10], tokens:[] },
    system:   { floatPct:20,  maxOwnershipPct:100, capitalization:'full',        alwaysMarketPrice:true,  shares:[20,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5], tokens:[0,20,20,20] },
    public:   { floatPct:20,  maxOwnershipPct:100, capitalization:'full',        alwaysMarketPrice:true,  shares:[20,10,10,10,10,10,10,10,10], tokens:[0,20,20,20] },
    custom:   { floatPct:60,  maxOwnershipPct:100, capitalization:'full',        alwaysMarketPrice:false, shares:[10,10,10,10,10,10,10,10,10,10], tokens:[0,40] },
  };
  return D[type] || { floatPct:60, maxOwnershipPct:60, capitalization:'full', alwaysMarketPrice:false, shares:[20,10,10,10,10,10,10,10,10], tokens:[0,40,100] };
}
`;

// Build module
const code = stubs + '\n' + importSlice + '\n' + exportSlice + '\nmodule.exports = { importEntitiesRb, exportEntitiesRb, _get_state: () => state, _set_state: (s) => { state = s; } };';
const tmpFile = path.join(__dirname, '_rt_tmp.js');
fs.writeFileSync(tmpFile, code);
let mod;
try {
  mod = require(tmpFile);
} finally {
  fs.unlinkSync(tmpFile);
}
const { importEntitiesRb, exportEntitiesRb, _get_state, _set_state } = mod;

// ── All ability fields the importer can produce ──────────────────────────────
const ALL_AB_FIELDS = [
  // strings
  'type','owner_type','from','description','desc_detail','remove','on_phase','after_phase',
  'terrain','partition_type','corporation','shares','hex',
  // integers
  'count','count_per_or','discount','price','teleport_price','lay_count','upgrade_count',
  'cost','income','slot','city','amount',
  // booleans
  'free','special','connect','reachable','must_lay_together','closed_when_used_up',
  'consume_tile_lay','must_lay_all','blocks','extra_action','from_owner','special_only',
  'extra_slot','neutral','check_tokenable','connected','same_hex_allowed','passive',
  'use_across_ors','hidden',
  // arrays / when
  'hexes','tiles','corporations','combo_entities','when',
];

// ── Game list ────────────────────────────────────────────────────────────────
const GAMES = [
  { name: '1830',         dir: 'g_1830' },
  { name: '1846',         dir: 'g_1846' },
  { name: '1867',         dir: 'g_1867' },
  { name: '1882',         dir: 'g_1882' },
  { name: '1822',         dir: 'g_1822' },
  { name: '1822PNW',      dir: 'g_1822_pnw' },
  { name: '18Chesapeake', dir: 'g_18_chesapeake' },
  { name: '1889',         dir: 'g_1889' },
];
const BASE = 'C:/Users/meiot/Rail/18xx-master/lib/engine/game/';

// ── Test runner ──────────────────────────────────────────────────────────────
let totalFail = 0;
const report = {};

for (const { name, dir } of GAMES) {
  const content  = fs.readFileSync(BASE + dir + '/entities.rb', 'utf8');
  const imported = importEntitiesRb(content);

  // Load state for exportEntitiesRb
  _set_state({
    privates:  imported.privates,
    corpPacks: imported.packs,
    mechanics: { capitalization: 'full' },
    meta:      { title: name },
  });

  const exported   = exportEntitiesRb();
  const reimported = importEntitiesRb(exported);
  const fails      = [];

  // ── Privates ──
  for (let i = 0; i < imported.privates.length; i++) {
    const orig = imported.privates[i];
    const re   = reimported.privates[i];
    if (!re) { fails.push(`private[${i}] (${orig.sym}): missing after re-import`); continue; }

    for (const f of ['sym','name','cost','revenue','companyType','buyerType','desc','color','textColor','discount','minPlayers','coordinates','minPrice','maxPrice']) {
      if (orig[f] !== undefined && JSON.stringify(orig[f]) !== JSON.stringify(re[f]))
        fails.push(`private ${orig.sym} .${f}: ${JSON.stringify(orig[f])} → ${JSON.stringify(re[f])}`);
    }

    const oAbs = orig.abilities || [];
    const rAbs = re.abilities   || [];
    for (let j = 0; j < oAbs.length; j++) {
      const oa = oAbs[j];
      const ra = rAbs[j];
      if (!ra) { fails.push(`private ${orig.sym} ability[${j}]: missing after re-import`); continue; }
      for (const f of ALL_AB_FIELDS) {
        if (oa[f] !== undefined && JSON.stringify(oa[f]) !== JSON.stringify(ra[f]))
          fails.push(`private ${orig.sym} ability[${j}].${f}: ${JSON.stringify(oa[f])} → ${JSON.stringify(ra[f])}`);
      }
    }
  }

  // ── Corps ──
  // Compare by sym, not by index — packs may reorder between import passes
  // (e.g. CORPORATIONS block parsed first, then MINORS appended, vs. the original
  //  file having minors interleaved). A sym-keyed lookup is the right invariant.
  const origCorps = imported.packs.flatMap(p => p.companies);
  const reCorpBySym = {};
  reimported.packs.flatMap(p => p.companies).forEach(co => { reCorpBySym[co.sym] = co; });

  for (const orig of origCorps) {
    const re = reCorpBySym[orig.sym];
    if (!re) { fails.push(`corp (${orig.sym}): missing after re-import`); continue; }

    for (const f of ['sym','name','color','textColor','coordinates','city','logo','floatPctOverride','destinationCoordinates']) {
      if (orig[f] !== undefined && JSON.stringify(orig[f]) !== JSON.stringify(re[f]))
        fails.push(`corp ${orig.sym} .${f}: ${JSON.stringify(orig[f])} → ${JSON.stringify(re[f])}`);
    }
    if (JSON.stringify(orig.tokensOverride) !== JSON.stringify(re.tokensOverride))
      fails.push(`corp ${orig.sym} .tokensOverride: ${JSON.stringify(orig.tokensOverride)} → ${JSON.stringify(re.tokensOverride)}`);

    const oAbs = orig.abilities || [];
    const rAbs = re.abilities   || [];
    for (let j = 0; j < oAbs.length; j++) {
      const oa = oAbs[j];
      const ra = rAbs[j];
      if (!ra) { fails.push(`corp ${orig.sym} ability[${j}]: missing after re-import`); continue; }
      for (const f of ALL_AB_FIELDS) {
        if (oa[f] !== undefined && JSON.stringify(oa[f]) !== JSON.stringify(ra[f]))
          fails.push(`corp ${orig.sym} ability[${j}].${f}: ${JSON.stringify(oa[f])} → ${JSON.stringify(ra[f])}`);
      }
    }
  }

  report[name] = fails;
  totalFail += fails.length;
}

// ── Print report ─────────────────────────────────────────────────────────────
for (const [game, fails] of Object.entries(report)) {
  if (fails.length === 0) {
    console.log('PASS  ' + game);
  } else {
    console.log('FAIL  ' + game + '  (' + fails.length + ' failure' + (fails.length !== 1 ? 's' : '') + ')');
    fails.forEach(f => console.log('      ' + f));
  }
}
console.log('');
console.log('Total failures: ' + totalFail);
