// js/validate-game.js  v20260509e
// Cross-panel game validator — sibling to validateStepConstraints in
// rounds-panel.js. Returns flat findings array consumable by the existing
// export-validity signal in renderStepsPanelView.
//
// Schema reference: STATE_SCHEMA.md (root). Cross-panel join keys are
// documented in §3; current schema gaps in §4 (some checks blocked until
// upstream helpers land — those are skipped with TODO comments).
//
// Findings shape (matches PR1i validateStepConstraints):
//   { severity: 'error' | 'warning' | 'info',
//     code:     string,                    // e.g. 'C-MAP-1'
//     message:  string,                    // user-facing
//     path:     string,                    // dotted state path
//     hexId?:   string,                    // when relevant
//     corpSym?: string }                   // when relevant
//
// Code namespacing by seam (matches STATE_SCHEMA.md §3):
//   C-MAP-N      Map ↔ Companies cross-checks (§3.1)
//   C-TRAIN-N    Trains ↔ Phases (§3.2)
//   C-MARKET-N   Companies ↔ Market (§3.3)
//   C-MECH-N     Entities ↔ Mechanics (§3.4)
//   C-DRIFT-N    Three-way shadow drift (§4.6, §4.7, §4.8)
//
// Load order: anywhere after state.js, tile-registry.js, and the panel files
// it needs to read. Wired into the export-validity aggregate in a later commit.

'use strict';

// ── City-slot parser helper ─────────────────────────────────────────────────
// Returns the count of city slots on the placed tile at hexId, defaulting to
// 1 per `city=` component if the DSL has no `slots:N` modifier. Static hexes
// (hex.static === true with hex.nodes[]) sum slots across the nodes array
// instead. Hexes with no tile placed return 0.
//
// DSL shape from tile-packs.js — examples:
//   '5':  'city=revenue:20;path=a:0,b:_0;path=a:1,b:_0'              → 1 slot
//   '14': 'city=revenue:30,slots:2;path=a:0,b:_0;...'                 → 2 slots
//   '235':'city=revenue:30;city=revenue:30;path=a:0,b:_0;label=OO'    → 2 cities × 1 slot = 2 total
//
// Algorithm:
//   1. If hex.static AND hex.nodes — sum (n.type === 'city') × (n.slots ?? 1).
//   2. Else if hex.tile is set — fetch tile DSL via TileRegistry, parse.
//   3. Else 0.
//
// Resolves STATE_SCHEMA.md §4.1 (the central blocker for home-slot capacity
// and OO-tile validation). Used by C-MAP-2 below; exposed as a top-level
// global for any future caller.
function getCitySlotCount(hexId, state) {
  if (!state || !state.hexes) return 0;
  const hex = state.hexes[hexId];
  if (!hex) return 0;

  // Static-hex shape (static-hex-builder.js writes hex.nodes[])
  if (hex.static && Array.isArray(hex.nodes)) {
    return hex.nodes.reduce((sum, n) => {
      if (!n || n.type !== 'city') return sum;
      return sum + (n.slots || 1);
    }, 0);
  }

  // Tile-placed: look up via TileRegistry, parse DSL.
  if (!hex.tile || hex.tile === 0) return 0;
  if (typeof TileRegistry === 'undefined' || typeof TileRegistry.getTileDef !== 'function') return 0;
  const tileDef = TileRegistry.getTileDef(String(hex.tile));
  if (!tileDef || !tileDef.dsl) return 0;

  return _parseSlotsFromDsl(tileDef.dsl);
}

// Parses 'city=...,slots:2;path=...' style DSL strings. Each `city=`
// component contributes its `slots:N` count (default 1 if absent). Other
// component types (path, town, junction, label) are ignored. Returns
// integer total across all city components on the tile.
function _parseSlotsFromDsl(dsl) {
  if (!dsl || typeof dsl !== 'string') return 0;
  let total = 0;
  dsl.split(';').forEach(component => {
    const trimmed = component.trim();
    if (!trimmed.startsWith('city=')) return;
    // slots: appears as either ',slots:N' (after city=) or '=slots:N' (start of pairs)
    const match = trimmed.match(/[,=]slots:(\d+)/);
    total += match ? parseInt(match[1], 10) : 1;
  });
  return total;
}

// ── Main validator (constraint batches landing one per commit) ──────────────
function validateGame(state) {
  const findings = [];
  if (!state) return findings;

  _checkMapCompanies(state, findings);
  _checkTrainsPhases(state, findings);
  _checkCompaniesMarket(state, findings);
  _checkEntitiesMechanics(state, findings);
  // _checkDriftShadows(state, findings);

  return findings;
}

// ── Seam: Entities ↔ Mechanics (STATE_SCHEMA.md §3.4) ───────────────────────
// Four checks against the join keys:
//   C-MECH-1   corp with empty coordinates requires homeTokenTiming != 'operate'
//   C-MECH-2   exchangeTokens.counts keys must match a corp sym
//   C-MECH-3   merger.associations references must resolve to existing
//              minor + major syms (mirrors validateMergerAssociations
//              in mechanics-panel.js but reports through this aggregate)
//   C-MECH-4   nationalization.nationalCorpSym, when set, must match
//              an existing corp sym
//
// Note: bankruptcyAllowed → Bankrupt step requirement is already covered
// by validateStepConstraints (PR1i) Check (a). Not duplicated here.
function _checkEntitiesMechanics(state, findings) {
  const corpPacks = state.corpPacks || [];
  const mechanics = state.mechanics || {};

  // C-MECH-1 — corps with empty coordinates require non-default homeTokenTiming.
  // The default 'operate' crashes the engine when a corp without coordinates
  // tries to place its home token (no hex to target). 'par'/'float'/'never'
  // either place the token earlier or skip the placement entirely.
  const homeTokenTiming = mechanics.homeTokenTiming || 'operate';
  if (homeTokenTiming === 'operate') {
    corpPacks.forEach((pack, pi) => {
      (pack.companies || []).forEach((co, ci) => {
        if (co && (!co.coordinates || co.coordinates === '')) {
          findings.push({
            severity: 'error',
            code: 'C-MECH-1',
            message: `Corporation ${co.sym || '?'} has no coordinates but homeTokenTiming is "operate" — this crashes the engine on float. Set timing to 'par', 'float', or 'never', or assign coordinates.`,
            path: `corpPacks[${pi}].companies[${ci}].coordinates`,
            corpSym: co.sym,
          });
        }
      });
    });
  }

  // Build the universe of valid syms across major + minor packs once.
  const allSyms = new Set();
  corpPacks.forEach(pack => {
    (pack.companies || []).forEach(co => { if (co && co.sym) allSyms.add(co.sym); });
  });
  // Legacy minors table — also a sym source
  (state.minors || []).forEach(m => { if (m && m.abbr) allSyms.add(m.abbr); });

  // C-MECH-2 — exchangeTokens.counts keys must match a known sym
  const tokenCounts = (mechanics.exchangeTokens && mechanics.exchangeTokens.counts) || {};
  Object.keys(tokenCounts).forEach(sym => {
    if (!allSyms.has(sym)) {
      findings.push({
        severity: 'warning',
        code: 'C-MECH-2',
        message: `exchangeTokens.counts has entry for "${sym}" but no corporation or minor with that symbol exists.`,
        path: `mechanics.exchangeTokens.counts.${sym}`,
        corpSym: sym,
      });
    }
  });

  // C-MECH-3 — merger.associations entries must reference real minor + major syms.
  // Pair shape (per mechanics-panel.js merger config): { minorSym, majorSym }.
  const associations = (mechanics.merger && mechanics.merger.associations) || [];
  // Build separate major/minor sym sets so we can give precise errors.
  const majorSyms = new Set();
  const minorSyms = new Set();
  corpPacks.forEach(pack => {
    if (!pack || !Array.isArray(pack.companies)) return;
    if (pack.type === 'major' || pack.type === 'public' || pack.type === 'system' || pack.type === 'national') {
      pack.companies.forEach(co => { if (co && co.sym) majorSyms.add(co.sym); });
    }
    if (pack.type === 'minor' || pack.type === 'coal') {
      pack.companies.forEach(co => { if (co && co.sym) minorSyms.add(co.sym); });
    }
  });
  (state.minors || []).forEach(m => { if (m && m.abbr) minorSyms.add(m.abbr); });

  associations.forEach((pair, ai) => {
    if (!pair) return;
    if (pair.minorSym && !minorSyms.has(pair.minorSym)) {
      findings.push({
        severity: 'error',
        code: 'C-MECH-3',
        message: `Merger association references minor "${pair.minorSym}" which is not in the corp packs or minors table.`,
        path: `mechanics.merger.associations[${ai}].minorSym`,
        corpSym: pair.minorSym,
      });
    }
    if (pair.majorSym && !majorSyms.has(pair.majorSym)) {
      findings.push({
        severity: 'error',
        code: 'C-MECH-3',
        message: `Merger association references major "${pair.majorSym}" which is not in any major-type corp pack.`,
        path: `mechanics.merger.associations[${ai}].majorSym`,
        corpSym: pair.majorSym,
      });
    }
  });

  // C-MECH-4 — nationalization national corp sym
  const nat = mechanics.nationalization;
  if (nat && nat.enabled && nat.nationalCorpSym) {
    if (!allSyms.has(nat.nationalCorpSym)) {
      findings.push({
        severity: 'error',
        code: 'C-MECH-4',
        message: `Nationalization is enabled with national corp sym "${nat.nationalCorpSym}" but no corporation with that symbol exists.`,
        path: 'mechanics.nationalization.nationalCorpSym',
        corpSym: nat.nationalCorpSym,
      });
    }
  }

  // TODO: C-MECH-5 — requires state.mechanics.loans flag (not yet in state).
  //   Validate that any corp with loans-related ability has the game-wide
  //   loans config populated.
}

// ── Seam: Companies ↔ Market (STATE_SCHEMA.md §3.3) ─────────────────────────
// Three checks against the join keys:
//   C-MARKET-1  par-eligible corps require at least one cell with 'p' suffix
//   C-MARKET-2  pack-level capitalization override differs from game-wide
//   C-MARKET-3  no market grid configured at all (empty market with corps)
function _checkCompaniesMarket(state, findings) {
  const corpPacks = state.corpPacks || [];
  const fin       = state.financials || {};
  const market    = fin.market || [];
  const mech      = state.mechanics || {};

  // Detect par-eligible packs — those whose alwaysMarketPrice is false (or
  // unset) AND have at least one corp. Per CORP_TYPE_DEFAULTS in
  // companies-panel.js: 'major' and 'custom' are par-eligible; 'minor',
  // 'coal', 'national', 'system', 'public' default to alwaysMarketPrice=true.
  const parEligiblePacks = corpPacks.filter(pack => {
    if (!pack || !Array.isArray(pack.companies) || pack.companies.length === 0) return false;
    return !pack.alwaysMarketPrice;
  });

  // C-MARKET-3 — corps exist but market grid is empty
  const flatCells = Array.isArray(market[0]) ? market.flat() : market;
  const hasAnyCell = flatCells.some(c => typeof c === 'string' && c.length > 0);

  if (parEligiblePacks.length > 0 && !hasAnyCell) {
    findings.push({
      severity: 'error',
      code: 'C-MARKET-3',
      message: `Game has ${parEligiblePacks.length} par-eligible corporation pack${parEligiblePacks.length === 1 ? '' : 's'} but the market grid is empty. Configure the market in the Market panel.`,
      path: 'financials.market',
    });
    // Skip C-MARKET-1 — it would re-emit the same problem.
  } else if (parEligiblePacks.length > 0) {
    // C-MARKET-1 — at least one cell must end in 'p' (par-eligible)
    const hasParCell = flatCells.some(c => typeof c === 'string' && /p$/.test(c));
    if (!hasParCell) {
      findings.push({
        severity: 'error',
        code: 'C-MARKET-1',
        message: `Game has par-eligible corporations but no market cell is marked as par (suffix 'p'). Mark at least one cell as par in the Market panel's Painter tab.`,
        path: 'financials.market',
      });
    }
  }

  // C-MARKET-2 — info-level pack capitalization mismatch with game-wide.
  // Not an error per se (the export honors the override) but worth flagging
  // so the designer knows the game-wide CAPITALIZATION constant won't apply
  // to that pack's corps.
  const gameCap = mech.capitalization;
  if (gameCap) {
    corpPacks.forEach((pack, pi) => {
      if (!pack || !pack.capitalization) return;
      if (pack.capitalization !== gameCap) {
        findings.push({
          severity: 'info',
          code: 'C-MARKET-2',
          message: `Pack "${pack.label || `#${pi}`}" uses ${pack.capitalization} capitalization, overriding the game-wide ${gameCap}.`,
          path: `corpPacks[${pi}].capitalization`,
        });
      }
    });
  }
}

// ── Seam: Trains ↔ Phases (STATE_SCHEMA.md §3.2) ────────────────────────────
// Three checks against the join keys:
//   C-TRAIN-1  phase.onTrain must reference an existing train id
//   C-TRAIN-2  train.rustsOn (when rusts) must match another train's
//              type or id (per trains-panel.js:317 fallback chain)
//   C-TRAIN-3  no train sets itself as its own rust target (cycle guard)
function _checkTrainsPhases(state, findings) {
  const trains = state.trains || [];
  const phases = state.phases || [];

  // Build lookups. trainKeys = type-or-id (rustsOn matches either).
  const trainIds = new Set();
  const trainKeys = new Set();
  trains.forEach(t => {
    if (!t) return;
    if (t.id)   { trainIds.add(t.id);  trainKeys.add(t.id); }
    if (t.type) { trainKeys.add(t.type); }
  });

  // C-TRAIN-1 — phase.onTrain
  phases.forEach((ph, pi) => {
    if (!ph) return;
    if (!ph.onTrain) {
      findings.push({
        severity: 'warning',
        code: 'C-TRAIN-1',
        message: `Phase "${ph.name || `#${pi}`}" has no onTrain set. Phase trigger is undefined; the engine cannot advance to this phase.`,
        path: `phases[${pi}].onTrain`,
      });
      return;
    }
    if (!trainIds.has(ph.onTrain)) {
      findings.push({
        severity: 'error',
        code: 'C-TRAIN-1',
        message: `Phase "${ph.name || `#${pi}`}" triggers on train id "${ph.onTrain}" but no such train exists.`,
        path: `phases[${pi}].onTrain`,
      });
    }
  });

  // C-TRAIN-2, C-TRAIN-3 — train rust references
  trains.forEach((tr, ti) => {
    if (!tr || !tr.rusts || !tr.rustsOn) return;

    // C-TRAIN-3 — self-reference guard
    if (tr.rustsOn === tr.id || tr.rustsOn === tr.type) {
      findings.push({
        severity: 'error',
        code: 'C-TRAIN-3',
        message: `Train "${tr.type || tr.id}" rusts on itself. Pick a different rust trigger or unset rusts.`,
        path: `trains[${ti}].rustsOn`,
      });
      return;
    }

    // C-TRAIN-2 — must reference an existing train (by type preferred, else id)
    if (!trainKeys.has(tr.rustsOn)) {
      findings.push({
        severity: 'error',
        code: 'C-TRAIN-2',
        message: `Train "${tr.type || tr.id}" rusts on "${tr.rustsOn}" but no train with that type or id exists.`,
        path: `trains[${ti}].rustsOn`,
      });
    }
  });
}

// ── Seam: Map ↔ Companies (STATE_SCHEMA.md §3.1) ────────────────────────────
// Six checks against the join keys documented in §3.1:
//   C-MAP-1  corp/minor home hex must exist on the map and not be killed
//   C-MAP-2  home hex must have at least one city slot (uses getCitySlotCount)
//   C-MAP-3  if co.city index is set, hex must have that many cities
//   C-MAP-4  minor's homeHex (when locationMechanism === 'fixed') must exist
//   C-MAP-5  privates' blocksHexes must reference existing hexes
//   C-MAP-6  private/company ability hexes[] must reference existing hexes
function _checkMapCompanies(state, findings) {
  const hexes     = state.hexes     || {};
  const corpPacks = state.corpPacks || [];
  const minors    = state.minors    || [];
  const privates  = state.privates  || [];

  // C-MAP-1, C-MAP-2, C-MAP-3 — corps from corpPacks
  corpPacks.forEach((pack, pi) => {
    (pack.companies || []).forEach((co, ci) => {
      const sym  = co.sym || '';
      const path = `corpPacks[${pi}].companies[${ci}]`;

      // Empty coordinates handled by C-MECH-1 in a later commit (paired with
      // homeTokenTiming). Here we only validate when coordinates IS set.
      if (!co.coordinates) return;

      const hex = hexes[co.coordinates];
      if (!hex) {
        findings.push({
          severity: 'error',
          code: 'C-MAP-1',
          message: `Corporation ${sym || '?'} home hex "${co.coordinates}" doesn't exist on the map.`,
          path: `${path}.coordinates`,
          hexId: co.coordinates,
          corpSym: sym,
        });
        return;
      }
      if (hex.killed) {
        findings.push({
          severity: 'error',
          code: 'C-MAP-1',
          message: `Corporation ${sym || '?'} home hex "${co.coordinates}" is killed (out of map bounds).`,
          path: `${path}.coordinates`,
          hexId: co.coordinates,
          corpSym: sym,
        });
        return;
      }

      const slots = getCitySlotCount(co.coordinates, state);
      if (slots === 0) {
        findings.push({
          severity: 'error',
          code: 'C-MAP-2',
          message: `Corporation ${sym || '?'} home hex "${co.coordinates}" has no city slots. Place a tile with a city or define a static city node.`,
          path: `${path}.coordinates`,
          hexId: co.coordinates,
          corpSym: sym,
        });
        return;
      }

      // C-MAP-3: co.city index points beyond available cities. Slot count
      // here is total slots across all cities on the tile (e.g. an OO tile
      // returns 2). For exact city-index validation we'd need per-city
      // slot info — STATE_SCHEMA §4.1 future helper. Conservative check:
      // if co.city is set and exceeds total slot count, it's definitely wrong.
      if (co.city != null && parseInt(co.city) >= slots) {
        findings.push({
          severity: 'error',
          code: 'C-MAP-3',
          message: `Corporation ${sym || '?'} city index ${co.city} on hex "${co.coordinates}" exceeds the ${slots} slot${slots === 1 ? '' : 's'} available on the placed tile.`,
          path: `${path}.city`,
          hexId: co.coordinates,
          corpSym: sym,
        });
      }
    });
  });

  // C-MAP-4 — minors with fixed home location
  minors.forEach((m, mi) => {
    if (!m) return;
    if (m.locationMechanism !== 'fixed') return;
    if (!m.homeHex) return;
    const hex = hexes[m.homeHex];
    if (!hex) {
      findings.push({
        severity: 'error',
        code: 'C-MAP-4',
        message: `Minor ${m.abbr || m.name || `#${mi}`} home hex "${m.homeHex}" doesn't exist on the map.`,
        path: `minors[${mi}].homeHex`,
        hexId: m.homeHex,
        corpSym: m.abbr,
      });
      return;
    }
    if (hex.killed) {
      findings.push({
        severity: 'error',
        code: 'C-MAP-4',
        message: `Minor ${m.abbr || m.name || `#${mi}`} home hex "${m.homeHex}" is killed.`,
        path: `minors[${mi}].homeHex`,
        hexId: m.homeHex,
        corpSym: m.abbr,
      });
      return;
    }
    const slots = getCitySlotCount(m.homeHex, state);
    if (slots === 0) {
      findings.push({
        severity: 'error',
        code: 'C-MAP-2',
        message: `Minor ${m.abbr || m.name || `#${mi}`} home hex "${m.homeHex}" has no city slots.`,
        path: `minors[${mi}].homeHex`,
        hexId: m.homeHex,
        corpSym: m.abbr,
      });
    }
  });

  // C-MAP-5 — privates blocksHexes must exist
  privates.forEach((priv, pi) => {
    if (!priv) return;
    const blocked = priv.blocksHexes || [];
    blocked.forEach((hexId, hi) => {
      if (!hexes[hexId]) {
        findings.push({
          severity: 'warning',
          code: 'C-MAP-5',
          message: `Private "${priv.sym || priv.abbr || priv.name || `#${pi}`}" blocks hex "${hexId}" which doesn't exist on the map.`,
          path: `privates[${pi}].blocksHexes[${hi}]`,
          hexId,
        });
      }
    });
  });

  // C-MAP-6 — private/company ability hexes[] must exist
  // Covers ability types: tile_lay, teleport, blocks_hexes, blocks_hexes_consent,
  // assign_hexes, reservation, hex_bonus, token (when ability.hexes set)
  function _checkAbilityHexes(entity, entityKind, entityIdx) {
    if (!entity) return;
    const ents = (entity.abilities || []);
    const ent  = entity.sym || entity.abbr || entity.name || `#${entityIdx}`;
    ents.forEach((ab, ai) => {
      if (!ab || !Array.isArray(ab.hexes)) return;
      ab.hexes.forEach((hexId, hi) => {
        if (!hexes[hexId]) {
          findings.push({
            severity: 'warning',
            code: 'C-MAP-6',
            message: `${entityKind} "${ent}" ability ${ab.type || 'unknown'} references hex "${hexId}" which doesn't exist on the map.`,
            path: `${entityKind === 'private' ? 'privates' : entityKind === 'minor' ? 'minors' : 'companies'}[${entityIdx}].abilities[${ai}].hexes[${hi}]`,
            hexId,
          });
        }
      });
    });
  }
  privates.forEach((p, pi) => _checkAbilityHexes(p, 'private', pi));
  minors.forEach((m, mi)   => _checkAbilityHexes(m, 'minor', mi));
  // Corp abilities live inside corpPacks[].companies[].abilities — handled per-pack
  corpPacks.forEach((pack, pi) => {
    (pack.companies || []).forEach((co, ci) => {
      _checkAbilityHexes(co, 'company', `${pi}.companies.${ci}`);
    });
  });
}

// Expose for browser global access (matches the rest of the panel modules
// which all use top-level function declarations + window-attached aliases
// where needed). The aggregate validateExportCoherence in rounds-panel.js
// picks these up via typeof checks once wired (final commit in this batch).
if (typeof window !== 'undefined') {
  window.validateGame      = validateGame;
  window.getCitySlotCount  = getCitySlotCount;
}
