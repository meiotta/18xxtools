// js/validate-game.js  v20260509a
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

// ── Main validator (skeleton — constraint batches added in subsequent commits) ─
// Returns an empty findings array for now. Each seam check below is wired
// in a follow-up commit per STATE_SCHEMA.md §3 grouping.
function validateGame(state) {
  const findings = [];
  if (!state) return findings;

  // Per-seam check functions. Each block is added in its own commit so the
  // wiring stays bisectable — a regression introduced by one batch is easy
  // to isolate.
  // _checkMapCompanies(state, findings);
  // _checkTrainsPhases(state, findings);
  // _checkCompaniesMarket(state, findings);
  // _checkEntitiesMechanics(state, findings);
  // _checkDriftShadows(state, findings);

  return findings;
}

// Expose for browser global access (matches the rest of the panel modules
// which all use top-level function declarations + window-attached aliases
// where needed). The aggregate validateExportCoherence in rounds-panel.js
// picks these up via typeof checks once wired (final commit in this batch).
if (typeof window !== 'undefined') {
  window.validateGame      = validateGame;
  window.getCitySlotCount  = getCitySlotCount;
}
