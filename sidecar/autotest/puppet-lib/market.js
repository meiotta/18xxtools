'use strict';

// ── market.js — Puppeteer step library for market-panel operations ───────────
//
// The market UI in this project lives across js/financials-panel.js (sidebar +
// inspector + legend), js/market-painter.js (brush model), js/market-wizard.js
// (auto-solver), and js/market-flags.js (flag defs / parser). There is no file
// literally named market-panel.js; this library targets the rendered market
// view by its DOM (id="marketView", nav-rail button data-lsec="market").
//
// Each exported function:
//   • Takes (page, params).  `page` is a Puppeteer Page already loaded at
//     BASE_URL with state initialised.
//   • Drives the UI by dispatching events on the real controls so the existing
//     change-handlers run (state mutation + render + autosave all happen via
//     the production code path — no shortcuts via direct state writes).
//   • Returns { ok, note, ...extraFields } once the UI settles.

const SETTLE_MS = 250;

async function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Activate the market view and wait for it to become visible. Mirrors the
// _goMechanics helper in mechanics.js.
async function _goMarket(page) {
  await page.evaluate(() => {
    const btn = document.querySelector('.nav-rail-btn[data-lsec="market"]');
    if (btn) btn.click();
  });
  await page.waitForFunction(
    () => {
      const v = document.getElementById('marketView');
      return v && v.style.display !== 'none';
    },
    { timeout: 5000 }
  ).catch(() => { /* non-fatal — view may already be active */ });
  await _sleep(100);
}

// Normalize an incoming type string to one of the three supported values.
// Accepts: '1D', '2D', 'zigzag' (case-insensitive), plus '1.5D' / '15D' as
// aliases for 'zigzag' since that's how the dropdown labels it ("1.5D Zigzag").
function _normalizeType(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === '2d')                       return '2D';
  if (s === '1d')                       return '1D';
  if (s === 'zigzag' || s === '1.5d' ||
      s === '15d'    || s === '1_5d')   return 'zigzag';
  return null;
}

// ---------------------------------------------------------------------------
// setMarketType
// ---------------------------------------------------------------------------
// Explicit setter for the market shape. Drives the #finMarketType <select>
// and dispatches 'change' so the financials-panel handler runs the full path:
//   • updates state.financials.marketType
//   • flips visibility of #finMarket2DConfig / #finMarket1DConfig
//   • calls resetMarketStructure() so state.financials.market is shaped
//     correctly for the new type (2D → array-of-arrays; 1D/zigzag → flat array)
//   • clears selectedCell, re-renders editor + inspector, autosaves
//
// params:
//   type {string}  '1D', '2D', or 'zigzag' (case-insensitive).
//                  '1.5D' is accepted as an alias for 'zigzag'.
//
// returns: { ok, type, previousType, note }
// ---------------------------------------------------------------------------
async function setMarketType(page, { type } = {}) {
  const target = _normalizeType(type);
  if (!target) {
    return { ok: false, note: `Unknown market type '${type}' (use '1D', '2D', or 'zigzag')` };
  }

  await _goMarket(page);

  const result = await page.evaluate((target) => {
    const sel = document.getElementById('finMarketType');
    if (!sel) return { ok: false, note: '#finMarketType not found' };
    const previousType = (typeof state !== 'undefined' && state.financials && state.financials.marketType) || sel.value;
    if (sel.value === target) {
      return { ok: true, type: target, previousType, note: `Already ${target}; no change.` };
    }
    sel.value = target;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, type: target, previousType, note: `Market type ${previousType} → ${target}` };
  }, target);

  await _sleep(SETTLE_MS);
  return result;
}

// ---------------------------------------------------------------------------
// flipMarketType
// ---------------------------------------------------------------------------
// Edit 10 from edit_permutations.md:
//   "Change the market from 2D/1D or vice versa."
//
// Reads the current market type from state.financials.marketType and toggles
// between '2D' and '1D'. If the market is currently 'zigzag' (1.5D), flip to
// '2D' as a sensible default since the prompt is specifically about the 2D↔1D
// axis. Caller can use setMarketType explicitly when zigzag is needed.
//
// returns: { ok, type, previousType, note }
// ---------------------------------------------------------------------------
async function flipMarketType(page) {
  await _goMarket(page);

  const current = await page.evaluate(() => {
    const sel = document.getElementById('finMarketType');
    if (!sel) return null;
    if (typeof state !== 'undefined' && state.financials && state.financials.marketType) {
      return state.financials.marketType;
    }
    return sel.value;
  });

  if (current == null) {
    return { ok: false, note: '#finMarketType not found' };
  }

  // 2D → 1D; anything else (1D, zigzag) → 2D.
  const target = current === '2D' ? '1D' : '2D';
  return setMarketType(page, { type: target });
}

module.exports = { flipMarketType, setMarketType };
