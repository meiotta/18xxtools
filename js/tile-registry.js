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
    if (typeof entry.dsl === 'string') {
      if (entry.dsl === '') {
        tileDef = { color: entry.color || 'white', svgPath: '' };
      } else {
        const raw = TILE_GEO.parseDSL(entry.dsl, entry.color);
        if (!raw) {
          tileDef = { color: entry.color || 'yellow', svgPath: '' };
        } else {
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

    // Fix OO city positions when both DSL nodes land at (0,0).
    if (tileDef.oo && tileDef.cityPositions &&
        tileDef.cityPositions.length >= 2 &&
        tileDef.cityPositions.every(p => p.x === 0 && p.y === 0)) {
      const n = tileDef.cityPositions.length;
      tileDef.cityPositions = tileDef.cityPositions.map((_, i) => ({
        x: (i - (n - 1) / 2) * 13 * 2,
        y: 0
      }));
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
