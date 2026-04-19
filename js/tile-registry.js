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

    // Accept both 'dsl' (standard) and 'code' (import-ruby.js legacy key) as the DSL string.
    if (typeof entry.code === 'string' && typeof entry.dsl !== 'string') {
      entry = Object.assign({}, entry, { dsl: entry.code });
    }

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
            // Position all separate city nodes (any slot count) at CITY_DIST=25
            // from the hex centre.  This matches tobymao full_distance=50 at scale-87
            // halved for our scale-43.5.
            //
            // Source for CITY_DIST: tobymao track_node_path.rb:
            //   stop_x = -sin(ct_edge * π/3) * 50;  stop_y = cos(ct_edge * π/3) * 50
            //   (in tobymao's 87-unit space → × 0.5 → 25 in our 43.5-unit space)
            //
            // Strategy:
            //   • Center cities (no explicit loc:, dist ≈ 0): use topology-based preferred
            //     edge from computeCityTownEdges, then apply the CITY_DIST formula.
            //   • Explicitly-located cities (parseDSL placed them via locToPos at distance
            //     43.5 for integer loc:N, or 50 for corner loc:N.5): normalise to CITY_DIST
            //     by scaling in the same direction (node *= CITY_DIST / dist).  This is
            //     correct for both edge-midpoint and corner positions without any pe-recovery.
            //
            // The earlier pe-recovery approach for corner cities was incorrect:
            //   atan2(-x, y) does NOT invert cornerPosition(N.5) = (cos((N.5·60+90)°)·R,
            //   -sin((N.5·60+90)°)·R).  The correct inverse is atan2(-y, x), but even that
            //   is unnecessary — simple scaling is exact.

            const allCityIdxs = raw.nodes.reduce((a, n, i) => {
              if (n.type === 'city') a.push(i);
              return a;
            }, []);

            if (allCityIdxs.length >= 2) {
              // Count separate 1-slot cities for the OO-vs-cities architecture decision
              _rawCityCount = allCityIdxs.filter(i => !(raw.nodes[i].slots && raw.nodes[i].slots > 1)).length;

              const preferred = TILE_GEO.computeCityTownEdges(raw.nodes, raw.paths);
              const CITY_DIST = 25;

              for (const i of allCityIdxs) {
                const node = raw.nodes[i];
                const dist = Math.hypot(node.x || 0, node.y || 0);
                if (dist < 0.5) {
                  // Center city (no explicit loc:) — place at preferred edge
                  const pe = preferred[i];
                  if (pe === null || pe === undefined) continue;
                  const a = pe * Math.PI / 3;
                  node.x = parseFloat((-Math.sin(a) * CITY_DIST).toFixed(2));
                  node.y = parseFloat(( Math.cos(a) * CITY_DIST).toFixed(2));
                } else {
                  // Explicitly located (locToPos put it at 43.5 or 50) — scale to CITY_DIST.
                  // Same direction, correct magnitude.  Works for integer and corner locs.
                  const scale = CITY_DIST / dist;
                  node.x = parseFloat((node.x * scale).toFixed(2));
                  node.y = parseFloat((node.y * scale).toFixed(2));
                }
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
    // (the standard OO "double bubble" with the white background rect).
    if (_rawCityCount >= 2 && tileDef.oo && tileDef.cityPositions) {
      tileDef.cities = tileDef.cityPositions;
      delete tileDef.oo;
      delete tileDef.cityPositions;
    }

    // Ruby town.rect? = exits.size == 2 (bar). 0 exits or 3+ exits = dot.
    // tile-geometry.js uses isBar = pathCount < 3, which incorrectly makes
    // 0-exit unconnected towns into bars. Fix: convert 0-exit bar entries to dots.
    if (tileDef.townPositions && Array.isArray(tileDef.townPositions)) {
      tileDef.townPositions = tileDef.townPositions.map(p =>
        (!p.dot && p.rw > 0 && !tileDef.svgPath)
          ? { x: p.x, y: p.y, dot: true }
          : p
      );
    }
    if (tileDef.townAt && !tileDef.svgPath) {
      // Single unconnected town — should be a center dot, not a positioned bar
      tileDef.town = true;
      delete tileDef.townAt;
    }

    // Spread overlapping town dots (e.g. dual-town with no exits: both land at 0,0).
    if (tileDef.townPositions && tileDef.townPositions.length >= 2) {
      const first = tileDef.townPositions[0];
      const allSame = tileDef.townPositions.every(
        p => Math.abs(p.x - first.x) < 1 && Math.abs(p.y - first.y) < 1
      );
      if (allSame) {
        const n = tileDef.townPositions.length;
        tileDef.townPositions = tileDef.townPositions.map((p, i) => ({
          ...p, x: (i - (n - 1) / 2) * 28, y: 0
        }));
      }
    }

    // ── Enrich tileDef.nodes with canonical rendered positions + normalize paths ──
    // normalizeTileDef computes final stop positions via townPosition() / cityEdgePos()
    // but stores them in tileDef.townPositions / tileDef.cities / tileDef.cityX,Y etc.
    // Copy them back onto tileDef.nodes[] so hexToSvgInner's unified DSL rendering
    // pipeline can use node.x/y directly — exactly as it does for DSL map hexes.
    // Mark node._tileComputed=true → renderer skips locStr-based position lookup.
    //
    // Path endpoints are normalized from tile-geometry format (integer edge or {node:N})
    // to the DSL format ({type:'edge'|'node', n:int}) that import-ruby.js produces, so
    // hexToSvgInner handles both tile defs and map hexes through identical code.
    if (tileDef.nodes && tileDef.nodes.length > 0) {
      let _twnI = 0;
      for (const _nd of tileDef.nodes) {
        if (_nd.type === 'town') {
          // Final position comes from townPositions[] (post dot-fix + post spread-fix).
          // Centered dot town (tileDef.town=true) has no townPositions entry → (0,0,0).
          const _tp = tileDef.townPositions?.[_twnI]
                   ?? (tileDef.townAt && _twnI === 0 ? tileDef.townAt : null)
                   ?? { x: 0, y: 0, rot: 0 };
          _nd.x = _tp.x ?? 0;  _nd.y = _tp.y ?? 0;  _nd.rot = _tp.rot ?? 0;
          _nd._tileComputed = true;
          _twnI++;
        } else if (_nd.type === 'city' || _nd.type === 'offboard') {
          // City center: tile-geometry already wrote the correct value onto node.x/y
          // (via locToPos for explicit loc:, or tile-registry multi-city edge placement).
          // Nothing to recompute — just mark as pre-computed.
          _nd._tileComputed = true;
        } else if (_nd.type === 'junction') {
          _nd.x = 0;  _nd.y = 0;  _nd._tileComputed = true;
        }
      }
      // Normalize path endpoints to {type:'edge'|'node', n:int}.
      if (tileDef.paths) {
        const _ne = ep =>
          typeof ep === 'number' ? { type: 'edge', n: ep }
          : (ep && 'node' in ep) ? { type: 'node', n: ep.node }
          : ep;  // already {type,n} — pass through
        tileDef.paths = tileDef.paths.map(p => ({ ...p, a: _ne(p.a), b: _ne(p.b) }));
      }
    }

    return tileDef;
  }

  // ── Register a single tile (id + entry) ──────────────────────────────────
  function _register(id, entry) {
    if (_cache[id]) return; // first wins
    const td = _processEntry(entry);
    if (td) _cache[id] = td;
  }

  // ── Iterate a pack and register all its tiles ─────────────────────────────
  // Handles both nested { color: { id: entry } } and flat { id: entry } formats.
  function _registerPack(pack) {
    for (const [key, val] of Object.entries(pack)) {
      if (COLOR_KEYS.has(key) && val && typeof val === 'object' && !Array.isArray(val)) {
        // Nested color group: key is a color name, val is { id: entry, ... }
        for (const [id, entry] of Object.entries(val)) {
          _register(id, entry);
        }
      } else {
        // Flat format: key is tile id, val is the entry
        _register(key, val);
      }
    }
  }

  // ── rebuildRegistry ───────────────────────────────────────────────────────
  function rebuildRegistry() {
    _cache = {};

    // 1. Built-in packs (in TILE_PACK_ORDER)
    if (typeof TILE_PACKS !== 'undefined') {
      const order = (typeof TILE_PACK_ORDER !== 'undefined')
        ? TILE_PACK_ORDER
        : Object.keys(TILE_PACKS);
      for (const packName of order) {
        const pack = TILE_PACKS[packName];
        if (!pack) continue;
        _registerPack(pack);
      }
    }

    // 2. User custom pack from localStorage
    try {
      const raw = localStorage.getItem(CUSTOM_LS_KEY);
      if (raw) {
        const customPack = JSON.parse(raw);
        for (const [id, entry] of Object.entries(customPack)) {
          _register(id, entry);
        }
      }
    } catch (_) { /* ignore localStorage errors */ }

    // 3. Map-embedded tiles
    for (const [id, entry] of Object.entries(_embeddedTiles)) {
      _register(id, entry);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function getTileDef(id) {
    if (id === null || id === undefined || id === 0 || id === '' || id === '0') return null;
    return _cache[String(id)] || null;
  }

  function getAllTileDefs() {
    return Object.assign({}, _cache);
  }

  function setEmbeddedTiles(tiles) {
    _embeddedTiles = tiles || {};
    rebuildRegistry();
  }

  function addCustomTile(id, dsl, color) {
    try {
      const raw = localStorage.getItem(CUSTOM_LS_KEY);
      const pack = raw ? JSON.parse(raw) : {};
      pack[String(id)] = { dsl, color };
      localStorage.setItem(CUSTOM_LS_KEY, JSON.stringify(pack));
    } catch (_) { /* ignore */ }
    rebuildRegistry();
  }

  function nextCustomId() {
    const ids = Object.keys(_cache)
      .map(id => parseInt(id, 10))
      .filter(n => !isNaN(n) && n >= 9000);
    return String(ids.length === 0 ? 9001 : Math.max(...ids) + 1);
  }

  function exportCustomPack() {
    try { return localStorage.getItem(CUSTOM_LS_KEY) || '{}'; }
    catch (_) { return '{}'; }
  }

  function importCustomPack(jsonString) {
    try {
      const incoming = JSON.parse(jsonString);
      const raw = localStorage.getItem(CUSTOM_LS_KEY);
      const existing = raw ? JSON.parse(raw) : {};
      Object.assign(existing, incoming);
      localStorage.setItem(CUSTOM_LS_KEY, JSON.stringify(existing));
    } catch (_) { /* ignore */ }
    rebuildRegistry();
  }

  return {
    getTileDef,
    getAllTileDefs,
    rebuildRegistry,
    addCustomTile,
    setEmbeddedTiles,
    nextCustomId,
    exportCustomPack,
    importCustomPack,
  };
})();