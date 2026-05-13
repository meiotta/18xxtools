// erin/puppet-lib/companies.js — Puppeteer step library: companies panel operations.
//
// Each exported function takes (page, params) and is async.
// Requires: Puppeteer page object, 18xxtools running at localhost.
//
// State shape (erin/deploy-output branch):
//   state.companies[]  — major / national corps
//   state.minors[]     — minor corps
//   state.privates[]   — private companies
//
// All corp objects: { sym, abbr, name, color, textColor, homeHex, parValue,
//                     tokens, floatPct, shares[], type, abilities[] }
// Private objects:  { name, sym, cost, revenue, desc, color, textColor,
//                     minPrice, maxPrice, discount, minPlayers, abilities[] }

'use strict';

const fs   = require('fs');
const path = require('path');

const TOBYMAO = 'C:/Users/meiot/Rail/18xx-master/lib/engine/game';

const GAME_DIRS = {
  '1882':   'g_1882',
  '1822MX': 'g_1822_mx',
  '1830':   'g_1830',
  '1889':   'g_1889',
  '1856':   'g_1856',
  '1846':   'g_1846',
  '18SJ':   'g_18_sj',
  '1870':   'g_1870',
};

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function _entitiesRbPath(gameName) {
  const dir = GAME_DIRS[gameName];
  if (!dir) throw new Error('importCorpsFromGame: unknown game "' + gameName + '"');
  const p = path.join(TOBYMAO, dir, 'entities.rb');
  if (!fs.existsSync(p)) throw new Error('importCorpsFromGame: entities.rb not found at ' + p);
  return p;
}

// Navigate to the companies panel (no-op if already there).
async function goToCompanies(page) {
  await page.evaluate(() => {
    const btn = document.querySelector('.nav-rail-btn[data-lsec="companies"]');
    if (btn) btn.click();
  });
  await _sleep(200);
}

// Switch to the corps sub-tab inside the companies panel.
async function goToCorpsTab(page) {
  await goToCompanies(page);
  await page.evaluate(() => {
    const btn = document.querySelector('.corp-tab-btn[data-corp-tab="corps"]');
    if (btn) btn.click();
  });
  await _sleep(150);
}

// Switch to the privates sub-tab inside the companies panel.
async function goToPrivatesTab(page) {
  await goToCompanies(page);
  await page.evaluate(() => {
    const btn = document.querySelector('.corp-tab-btn[data-corp-tab="privates"]');
    if (btn) btn.click();
  });
  await _sleep(150);
}

// ── importCorpsFromGame ────────────────────────────────────────────────────────
// Upload a game's entities.rb and optionally filter to specific corp types.
//
// params:
//   gameName  {string}   — key in GAME_DIRS
//   types     {string[]} — optional; if given, keep only corps whose type is in this list
//                          e.g. ['major'], ['minor'], ['major','national']
//
async function importCorpsFromGame(page, { gameName, types }) {
  const rbPath = _entitiesRbPath(gameName);

  const input = await page.$('#importEntitiesFile');
  if (!input) throw new Error('importCorpsFromGame: #importEntitiesFile not found');
  await input.uploadFile(rbPath);
  await _sleep(1500);

  if (types && types.length) {
    await page.evaluate((types) => {
      state.companies = (state.companies || []).filter(c => types.includes(c.type));
      state.minors    = (state.minors    || []).filter(c => types.includes(c.type));
      if (typeof renderCompaniesTable === 'function') renderCompaniesTable();
      if (typeof renderMinorsTable    === 'function') renderMinorsTable();
      if (typeof autosave             === 'function') autosave();
    }, types);
    await _sleep(200);
  }
}

// ── buildMajor ────────────────────────────────────────────────────────────────
// Inject a major corporation directly into state.companies.
//
// params:
//   sym          {string}   — short ticker (also used as abbr)
//   name         {string}   — full name; defaults to "<sym> Railway"
//   homeHex      {string}   — coordinate, e.g. 'E15'
//   color        {string}   — CSS color string; defaults to '#888888'
//   textColor    {string}   — defaults to '#ffffff'
//   tokenCount   {number}   — defaults to 3
//   sharesLayout {number[]} — defaults to standard [20,10×8]
//   floatPct     {number}   — defaults to 60
//   parValue     {number}   — defaults to 100
//
async function buildMajor(page, {
  sym, name, homeHex,
  color = '#888888', textColor = '#ffffff',
  tokenCount = 3, sharesLayout = null,
  floatPct = 60, parValue = 100,
}) {
  await page.evaluate((sym, name, homeHex, color, textColor, tokenCount, sharesLayout, floatPct, parValue) => {
    state.companies = state.companies || [];
    const shares = sharesLayout || [20,10,10,10,10,10,10,10,10];
    state.companies.push({
      sym, abbr: sym,
      name: name || (sym + ' Railway'),
      color, textColor,
      homeHex, parValue, tokens: tokenCount, floatPct,
      shares,
      type: 'major',
      abilities: [],
    });
    if (typeof renderCompaniesTable === 'function') renderCompaniesTable();
    if (typeof autosave             === 'function') autosave();
  }, sym, name, homeHex, color, textColor, tokenCount, sharesLayout, floatPct, parValue);
  await _sleep(200);
}

// ── buildMinor ────────────────────────────────────────────────────────────────
// Inject a minor corporation into state.minors.
//
// params:
//   sym           {string}  — short ticker
//   name          {string}  — full name; defaults to "Minor <sym>"
//   homeHex       {string}  — coordinate
//   color         {string}  — defaults to '#888888'
//   textColor     {string}  — defaults to '#ffffff'
//   shareCount    {number}  — number of equal shares (each = 100/shareCount %); defaults to 2
//   floatPct      {number}  — defaults to 50
//   parValue      {number}  — defaults to 50
//   mergeable     {boolean} — if true, set state.mechanics.merge = true
//   retainsName   {boolean} — if true, set state.mechanics.merge_retain_name = true
//
async function buildMinor(page, {
  sym, name, homeHex,
  color = '#888888', textColor = '#ffffff',
  shareCount = 2, floatPct = 50, parValue = 50,
  mergeable = false, retainsName = false,
}) {
  await page.evaluate((sym, name, homeHex, color, textColor, shareCount, floatPct, parValue, mergeable, retainsName) => {
    state.minors    = state.minors    || [];
    state.mechanics = state.mechanics || {};
    const pct    = Math.round(100 / shareCount);
    const shares = new Array(shareCount).fill(pct);
    state.minors.push({
      sym, abbr: sym,
      name: name || ('Minor ' + sym),
      color, textColor,
      homeHex, parValue, tokens: 1, floatPct,
      shares,
      type: 'minor',
      abilities: [],
    });
    if (mergeable)   state.mechanics.merge             = true;
    if (retainsName) state.mechanics.merge_retain_name = true;
    if (typeof renderMinorsTable === 'function') renderMinorsTable();
    if (typeof autosave          === 'function') autosave();
  }, sym, name, homeHex, color, textColor, shareCount, floatPct, parValue, mergeable, retainsName);
  await _sleep(200);
}

// ── buildNational ─────────────────────────────────────────────────────────────
// Inject a national corporation (isNational: true) into state.companies.
// Nationals typically float at 0 %, hold all 10 × 10% shares, and may receive
// exported permanent trains.
//
// params:
//   sym          {string}   — short ticker
//   name         {string}   — full name; defaults to "National <sym>"
//   homeHex      {string}   — optional coordinate (nationals sometimes have none)
//   color        {string}   — defaults to '#222222'
//   textColor    {string}   — defaults to '#ffffff'
//   tokenConfig  {number[]} — token cost array; defaults to [] (no tokens)
//   receivesExportedTrains {boolean} — sets receivesExportedPermanentTrains; defaults to false
//
async function buildNational(page, {
  sym, name, homeHex = '',
  color = '#222222', textColor = '#ffffff',
  tokenConfig = [], receivesExportedTrains = false,
}) {
  await page.evaluate((sym, name, homeHex, color, textColor, tokenConfig, receivesExportedTrains) => {
    state.companies = state.companies || [];
    const corp = {
      sym, abbr: sym,
      name: name || ('National ' + sym),
      color, textColor,
      homeHex, parValue: 100, tokens: tokenConfig, floatPct: 0,
      shares: [10,10,10,10,10,10,10,10,10,10],
      type: 'major',
      isNational: true,
      abilities: [],
    };
    if (receivesExportedTrains) corp.receivesExportedPermanentTrains = true;
    state.companies.push(corp);
    if (typeof renderCompaniesTable === 'function') renderCompaniesTable();
    if (typeof autosave             === 'function') autosave();
  }, sym, name, homeHex, color, textColor, tokenConfig, receivesExportedTrains);
  await _sleep(200);
}

// ── addMajor ──────────────────────────────────────────────────────────────────
// Alias for buildMajor — adds one major to an existing corps list.
//
async function addMajor(page, params) {
  return buildMajor(page, params);
}

// ── removeMajor ───────────────────────────────────────────────────────────────
// Remove a major corporation from state.companies by sym.
//
// params:
//   sym {string} — ticker of the corp to remove
//
async function removeMajor(page, { sym }) {
  await page.evaluate((sym) => {
    state.companies = state.companies || [];
    const idx = state.companies.findIndex(c => (c.sym || c.abbr) === sym);
    if (idx < 0) throw new Error('removeMajor: sym "' + sym + '" not found in state.companies');
    state.companies.splice(idx, 1);
    if (typeof renderCompaniesTable === 'function') renderCompaniesTable();
    if (typeof autosave             === 'function') autosave();
  }, sym);
  await _sleep(200);
}

// ── replacePrivateWithAbility ─────────────────────────────────────────────────
// Replace the abilities array on an existing private at a given index.
//
// params:
//   targetIndex   {number} — 0-based index into state.privates
//   abilityType   {string} — the ability type string, e.g. 'tile_lay', 'exchange'
//   abilityParams {object} — additional fields merged into the ability object
//
async function replacePrivateWithAbility(page, { targetIndex, abilityType, abilityParams = {} }) {
  await goToPrivatesTab(page);

  await page.evaluate((targetIndex, abilityType, abilityParams) => {
    state.privates = state.privates || [];
    if (targetIndex < 0 || targetIndex >= state.privates.length)
      throw new Error('replacePrivateWithAbility: index ' + targetIndex + ' out of range');
    state.privates[targetIndex].abilities = [Object.assign({ type: abilityType }, abilityParams)];
    // Re-open the detail card for this private so the UI reflects the change.
    const railItem = document.querySelector('.pc-rail-item[data-idx="' + targetIndex + '"]');
    if (railItem) railItem.click();
    if (typeof autosave === 'function') autosave();
  }, targetIndex, abilityType, abilityParams);
  await _sleep(300);
}

// ── addPrivate ────────────────────────────────────────────────────────────────
// Add a new private company. Clicks the "Add Private" button, then injects
// the supplied fields into the last private in state.privates and syncs the
// visible form inputs.
//
// params:
//   name      {string}  — company name
//   sym       {string}  — symbol (optional; defaults to a generated ID)
//   desc      {string}  — description / ability text
//   cost      {number}  — purchase price; defaults to 0
//   revenue   {number}  — income per OR; defaults to 0
//   color     {string}  — charter background color (optional)
//   textColor {string}  — charter text color (optional)
//   minPrice  {number}  — minimum sale price (optional)
//   maxPrice  {number}  — maximum sale price (optional)
//   discount  {number}  — bid discount (optional)
//   minPlayers {number} — minimum players (optional)
//   ability   {object}  — if given, pushed into abilities[]; should have at least { type }
//
async function addPrivate(page, {
  name, sym = '', desc = '', cost = 0, revenue = 0,
  color, textColor, minPrice, maxPrice, discount, minPlayers,
  ability = null,
}) {
  await goToPrivatesTab(page);

  // Click the "Add Private" button to append a blank entry.
  await page.evaluate(() => {
    const btn = document.querySelector('#addPrivateBtn');
    if (!btn) throw new Error('addPrivate: #addPrivateBtn not found');
    btn.click();
  });
  await _sleep(300);

  // Inject the supplied fields into the last private.
  await page.evaluate((name, sym, desc, cost, revenue, color, textColor, minPrice, maxPrice, discount, minPlayers, ability) => {
    state.privates = state.privates || [];
    const priv = state.privates[state.privates.length - 1];
    if (!priv) throw new Error('addPrivate: no private found after clicking Add');

    priv.name    = name    || priv.name  || '';
    priv.sym     = sym     || priv.sym   || '';
    priv.desc    = desc    || priv.desc  || '';
    priv.cost    = cost    != null ? cost    : (priv.cost    || 0);
    priv.revenue = revenue != null ? revenue : (priv.revenue || 0);
    if (color     != null) priv.color     = color;
    if (textColor != null) priv.textColor = textColor;
    if (minPrice  != null) priv.minPrice  = minPrice;
    if (maxPrice  != null) priv.maxPrice  = maxPrice;
    if (discount  != null) priv.discount  = discount;
    if (minPlayers!= null) priv.minPlayers= minPlayers;
    if (ability)           priv.abilities = [ability];

    // Sync visible form inputs in the active detail editor.
    const ed = document.querySelector('.pc-detail-editor');
    if (ed) {
      const set = (sel, val) => {
        const el = ed.querySelector(sel);
        if (el) { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }
      };
      set('.pc-det-name',     priv.name);
      set('.pc-det-sym',      priv.sym);
      set('.pc-det-cost',     priv.cost);
      set('.pc-det-revenue',  priv.revenue);
      set('.pc-desc',         priv.desc);
      if (priv.minPrice  != null) set('.pc-det-min-price',   priv.minPrice);
      if (priv.maxPrice  != null) set('.pc-det-max-price',   priv.maxPrice);
      if (priv.discount  != null) set('.pc-det-discount',    priv.discount);
      if (priv.minPlayers!= null) set('.pc-det-min-players', priv.minPlayers);
    }

    if (typeof autosave === 'function') autosave();
  }, name, sym, desc, cost, revenue, color, textColor, minPrice, maxPrice, discount, minPlayers, ability);
  await _sleep(300);
}

module.exports = {
  goToCompanies,
  goToCorpsTab,
  goToPrivatesTab,
  importCorpsFromGame,
  buildMajor,
  buildMinor,
  buildNational,
  addMajor,
  removeMajor,
  replacePrivateWithAbility,
  addPrivate,
};
