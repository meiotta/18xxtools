// erin/puppet-lib/map.js — Puppeteer step library: map selection and tile operations.
//
// Each exported function takes (page, params) and is async.
// Requires: Puppeteer page object, 18xxtools running at localhost.

'use strict';

const fs   = require('fs');
const path = require('path');

const TOBYMAO = 'C:/Users/meiot/Rail/18xx-master/lib/engine/game';

// Map name → tobymao directory
const MAP_DIRS = {
  '1882':         'g_1882',
  '18Chesapeake': 'g_18_chesapeake',
  '1830':         'g_1830',
  '1889':         'g_1889',
  '1856':         'g_1856',
  '1846':         'g_1846',
  '18SJ':         'g_18_sj',
  '1870':         'g_1870',
};

function _mapRbPath(gameName) {
  const dir = MAP_DIRS[gameName];
  if (!dir) throw new Error('selectMap: unknown game "' + gameName + '"');
  const p = path.join(TOBYMAO, dir, 'map.rb');
  if (!fs.existsSync(p)) throw new Error('selectMap: map.rb not found at ' + p);
  return p;
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── selectMap ─────────────────────────────────────────────────────────────────
// Load a map from the tobymao source tree by uploading its map.rb.
// Waits until state.hexes is non-empty before resolving.
//
// Supported games: 1882, 18Chesapeake, 1830, 1889, 1856, 1846, 18SJ, 1870.
async function selectMap(page, { gameName }) {
  const rbPath = _mapRbPath(gameName);

  const input = await page.$('#importMapFile');
  if (!input) throw new Error('selectMap: #importMapFile not found on page');
  await input.uploadFile(rbPath);
  await _sleep(500);

  // Dismiss the custom-tile collision dialog if it appears (same logic as runner.js).
  for (let i = 0; i < 10; i++) {
    await _sleep(200);
    const dismissed = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim() === 'Continue (pack wins)');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (dismissed) break;
  }

  await page.waitForFunction(
    () => typeof state !== 'undefined' && state.hexes && Object.keys(state.hexes).length > 0,
    { timeout: 15000 }
  ).catch(() => { throw new Error('selectMap: timeout waiting for hexes (' + gameName + ')'); });
}

// ── getValidHomeHexes ─────────────────────────────────────────────────────────
// Returns an array of hex coordinate strings that are valid home locations
// for a company of the given type ('major' | 'minor' | 'national').
//
// A hex is valid when it has at least one city node and is not an offboard.
// All three corp types share this requirement; type is accepted for future
// specialisation but does not alter the filter today.
async function getValidHomeHexes(page, { type } = {}) {
  return page.evaluate(() => {
    const hexes = state.hexes || {};
    return Object.entries(hexes)
      .filter(([, hex]) => {
        if (hex.feature === 'offboard') return false;
        return (hex.nodes || []).some(n => n.type === 'city');
      })
      .map(([id]) => id)
      .sort();
  });
}

// ── addWaterUpgradeAbility ────────────────────────────────────────────────────
// Adds a water-terrain upgrade ability to the private company identified by
// corpSym (matched against priv.sym first, then priv.name).
//
//   freeFirst: true   — ability.free = true  (first water upgrade costs nothing)
//   discount:  N      — ability.discount = N ($N off each water upgrade)
//
// The ability is appended to priv.abilities; existing abilities are preserved.
// Throws if no matching private is found in state.privates.
async function addWaterUpgradeAbility(page, { corpSym, freeFirst = false, discount = 0 }) {
  const result = await page.evaluate(({ corpSym, freeFirst, discount }) => {
    const privates = state.privates || [];
    const priv = privates.find(p => p.sym === corpSym || p.name === corpSym);
    if (!priv) return { ok: false, err: 'Private not found: ' + corpSym };

    const ability = {
      type:       'tile_discount',
      owner_type: 'corporation',
      terrain:    'water',
      hexes:      [],
    };
    if (discount)  ability.discount = discount;
    if (freeFirst) ability.free     = true;

    priv.abilities = priv.abilities || [];
    priv.abilities.push(ability);
    return { ok: true };
  }, { corpSym, freeFirst, discount });

  if (!result.ok) throw new Error('addWaterUpgradeAbility: ' + result.err);
}

module.exports = { selectMap, getValidHomeHexes, addWaterUpgradeAbility };
