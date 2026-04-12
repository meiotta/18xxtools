// ─── TILE REGISTRY ─────────────────────────────────────────────────────────────
// Single source of truth for tile lookup. Replaces TILE_DEFS entirely.
// Load order: THIRD — after tile-geometry.js and tile-packs.js, before constants.js
//
// API:
//   TileRegistry.getTileDef(id)            → normalized tileDef or null
//   TileRegistry.getAllTileDefs()           → { id: tileDef, ... }
//   TileRegistry.rebuildRegistry()         → assembles from packs + localStorage + embedded
//   TileRegistry.addCustomTile(id,dsl,color) → saves to localStorage + rebuilds
//   TileRegistry.setEmbeddedTiles(tiles)   → load map-embedded custom tiles + rebuilds
//   TileRegistry.nextCustomId()            → next available 9000+ ID string
//   TileRegistry.exportCustomPack()        → JSON string of user custom pack
//   TileRegistry.importCustomPack(json)    → merge into localStorage + rebuilds
//
// Assembly order (first wins):
//   1. Built-in packs (TILE_PACKS, iterated in TILE_PACK_ORDER)
//   2. User custom pack from localStorage['18xxtools-custom-pack']
//   3. Map-embedded tiles (from current save file, set by io.js on load)
//
// Pack format support:
//   Nested:  TILE_PACKS[packName][color][id] = { dsl, color }   (main format)
//   Flat:    TILE_PACKS[packName][id]        = { dsl, color }   (legacy)

'use strict';

const TileRegistry = (() => {
  const CUSTOM_LS_KEY = '18xxtools-custom-pack';
  // Color keys used in the nested pack format
  const COLOR_KEYS = new Set(['yellow', 'green', 'brown', 'gray', 'grey', 'white']);

  let _cache = {};          // id → tileDef (normalized)
  let _embeddedTiles = {};  // from loaded save file; set by setEmbeddedTiles()

  // ── Entry processor ───────────────────────────────────────────────────────
  // Accepts either:
  //   { dsl: string, color: string }  — DSL entry; parsed + normalized
  //   { svgPath, color, ... }         — old-format entry; normalizeTileDef pass-through
  function _processEntry(entry) {
    if (!entry) return null;

    let tileDef;
    let _rawCityCount = 0; // track separate 1-slot city nodes for architecture decision
    if (typeof entry.dsl === 'string') {
      if (entry.dsl === '') {
        tileDef = { color: entry.color || 'white', svgPath: '' };
      } else {
        const raw = TILE_GEO.parseDSL(entry.dsl, entry.color);
        if (!raw) {
          tileDef = { color: entry.color || 'yellow', svgPath: '' };
        } else {
          // ── Canonical multi-city position computation ─────────────────────
          // For tiles with 2+ separate 1-slot city nodes (all at center, no
          // explicit loc:), compute each city's position from path topology
          // before normalizeTileDef — so buildSvgPath routes to the same
          // positions as the city circles. Formula from tobymao track_node_path.rb:
          //   stop_x = -sin(ct_edge * π/3) * full_distance
          //   stop_y =  cos(ct_edge * π/3) * full_distance
          // where full_distance = 50 in tobymao's scale-87 space.
          // At our scale-43.5: full_distance = 50 * (43.5 / 87) = 25.
          if (raw.nodes && raw.paths) {
            // Detect ALL separate 1-slot city nodes regardless of current position.
            // parseDSL may have pre-positioned them via locToPos (inradius or circumradius),
            // but we always want them at CITY_DIST=25 (tobymao full_distance=50 at scale-87,
            // halved for our scale-43.5). We recover the intended edge from each position.
            const separateCityIdxs = raw.nodes.reduce((a, n, i) => {
              if (n.type === 'city' && !(n.slots && n.slots > 1)) a.push(i);
              return a;
            }, []);
            if (separateCityIdxs.length >= 2) {
              _rawCityCount = separateCityIdxs.length;
              const preferred = TILE_GEO.computeCityTownEdges(raw.nodes, raw.paths);
              const CITY_DIST = 25;   // 50 * (43.5 / 87)
              const HEX_INRAD = 43.5; // edgeMidpoint distance (integer loc:N)
              const HEX_CIRC  = 50;   // cornerPosition distance (loc:N.5)
              for (const i of separateCityIdxs) {
                const node = raw.nodes[i];
                const dist = Math.hypot(node.x || 0, node.y || 0);
                let pe;
                if (dist < 0.5) {
                  // City is at center (no loc:) — use topology-based preferred edge
                  pe = preferred[i];
                } else if (Math.abs(dist - HEX_INRAD) < 2.0) {
                  // Integer loc:N → edgeMidpoint(N). Recover N via:
                  //   edgeMidpoint(e) = (-sin(e*π/3)*R, cos(e*π/3)*R)
                  //   atan2(-x, y) = e*π/3  →  e = atan2(-x,y) / (π/3)
                  let theta = Math.atan2(-(node.x || 0), node.y || 0);
                  if (theta < 0) theta += 2 * Math.PI;
                  pe = theta / (Math.PI / 3);
                } else if (Math.abs(dist - HEX_CIRC) < 2.0) {
                  // loc:N.5 → cornerPosition(N.5). Recover N.5 via:
                  //   cornerPosition uses angle = loc*60+90 deg
                  //   x = cos(angle)*R, y = -sin(angle)*R
                  //   → atan2(-x, y) = angle+π/2... simplified recovery:
                  //   atan2(-x, y) gives (loc*60+90)*π/180 mod 2π
                  //   pe = (theta_deg - 90) / 60, where theta_deg from atan2(-x, y)
                  let theta = Math.atan2(-(node.x || 0), node.y || 0);
                  if (theta < 0) theta += 2 * Math.PI;
                  pe = (theta * 180 / Math.PI - 90) / 60;
                  if (pe < 0) pe += 6;
                } else {
                  // Unexpected distance — fall back to topology
                  pe = preferred[i];
                }
                if (pe === null || pe === undefined) continue;
                const a = pe * Math.PI / 3;
                node.x = parseFloat((-Math.sin(a) * CITY_DIST).toFixed(2));
                node.y = parseFloat(( Math.cos(a) * CITY_DIST).toFixed(2));
              }
            }
          }
          tileDef = TILE_GEO.normalizeTileDef(raw);
          if (raw.nodes && raw.nodes.length > 0) tileDef.nodes = raw.nodes;
          if (raw.paths && raw.paths.length > 0) tileDef.paths = raw.paths;
        }
      }
    } else {
      tileDef = TILE_GEO.normalizeTileDef(entry);
    }

    if (!tileDef) return null;

    // Normalize 'gray' → 'grey' for consistent TILE_HEX_COLORS lookup.
    if (tileDef.color === 'gray') tileDef.color = 'grey';

    // ── Multi-city architectural restructuring ────────────────────────────
    // Tobymao iterates @tile.cities independently — each city renders at its
    // own position with its own slot count. Tiles with 2+ separate 1-slot
    // city nodes use tileDef.cities (not tileDef.oo) so the renderer can
    // draw each circle independently, without a connecting rect.
    // tileDef.oo is reserved exclusively for a single city with 2+ slots
    // (the standard OO "double