'use strict';

// ── mechanics.js — Puppeteer step library for mechanics-panel operations ──────
//
// Each exported function:
//   • Takes (page, params) where page is a Puppeteer Page already loaded at
//     BASE_URL with state initialised.
//   • Mutates state.mechanics directly (same pattern as runner.js applyEdit),
//     calls renderMechanicsLeft/Right so the panel reflects the change, then
//     navigates the UI to the relevant section so screenshots / follow-up
//     assertions can verify the result visually.
//   • Returns a plain object { ok, note, ...extraFields } once the UI settles.

const SETTLE_MS = 250;

async function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Click the mechanics nav button and wait for mechanicsView to become visible.
async function _goMechanics(page) {
  await page.evaluate(() => {
    const btn = document.querySelector('.nav-rail-btn[data-lsec="mechanics"]');
    if (btn) btn.click();
  });
  await page.waitForFunction(
    () => {
      const v = document.getElementById('mechanicsView');
      return v && v.style.display !== 'none';
    },
    { timeout: 5000 }
  ).catch(() => { /* non-fatal — panel may already be active */ });
  await _sleep(100);
}

// Select a left-panel row by itemId so the right pane shows its editor.
async function _openMechItem(page, itemId) {
  await page.evaluate((id) => {
    const row = document.querySelector(`.mech-item-row[data-item-id="${id}"]`);
    if (row) row.click();
  }, itemId);
  await _sleep(150);
}

// ---------------------------------------------------------------------------
// setTileLayRule
// ---------------------------------------------------------------------------
// Implements edit 8 from edit_permutations.md:
//   "If there is a mechanism for laying 2 yellow tiles, make the second one
//    cost 20.  If there isn't, add it.  If there already is and the second
//    one costs 20, make it free instead."
//
// params:
//   count     {number}  Total tile-lay slots desired (default 2). Currently
//                       only count=2 is meaningful; higher counts are not
//                       implemented by this function.
//   extraCost {number}  Cost to assign to the second slot when adding or
//                       setting (default 20). If the second slot already
//                       carries exactly this cost, it is set to 0 (free).
//
// returns: { ok, cost, note }
// ---------------------------------------------------------------------------
async function setTileLayRule(page, { count = 2, extraCost = 20 } = {}) {
  const result = await page.evaluate((extraCost) => {
    state.mechanics = state.mechanics || {};
    const m = state.mechanics;
    m.tileLays = m.tileLays || {};
    const slots = m.tileLays.default;

    if (!slots || slots.length < 2) {
      // No mechanism or only one slot — add the second slot.
      m.tileLays.default = [
        { lay: true, upgrade: true,  cost: 0,        upgrade_cost: 0, cannot_reuse_same_hex: false },
        { lay: true, upgrade: false, cost: extraCost, upgrade_cost: 0, cannot_reuse_same_hex: false },
      ];
      if (typeof autosave          === 'function') autosave();
      if (typeof renderMechanicsLeft  === 'function') renderMechanicsLeft();
      if (typeof renderMechanicsRight === 'function') renderMechanicsRight();
      return { ok: true, cost: extraCost, note: `Added two-tile-lay; second slot cost $${extraCost}` };
    }

    // Second slot exists — toggle: extraCost → 0, anything-else → extraCost.
    const prev = slots[1].cost ?? 0;
    slots[1].cost = (prev === extraCost) ? 0 : extraCost;
    if (typeof autosave          === 'function') autosave();
    if (typeof renderMechanicsLeft  === 'function') renderMechanicsLeft();
    if (typeof renderMechanicsRight === 'function') renderMechanicsRight();
    return { ok: true, cost: slots[1].cost, note: `Second tile-lay slot cost → $${slots[1].cost}` };
  }, extraCost);

  // Navigate to the Tile Lays editor so the UI settles in the right state.
  await _goMechanics(page);
  await _openMechItem(page, 'or_tile_lays');
  await _sleep(SETTLE_MS);

  return result;
}

// ---------------------------------------------------------------------------
// setOrExportRule
// ---------------------------------------------------------------------------
// Sets the "export top unpurchased train at end of every OR set" flag.
//
// UI note: there is no dedicated toggle for this in mechanics-panel.js.
// state.mechanics.export_train is consumed by export-game.js's or_rules
// module, which emits the relevant constant (e.g. MUST_BUY_TRAIN_PRIORITY)
// into game.rb.  A future UI home for this toggle would be the "OR Rules"
// section (itemId "or_special" or "or_train_rules") in mechanics-panel.js —
// specifically inside renderTrainRules(m) or renderSpecialMechanics(m).
//
// params:
//   exportTopTrain {boolean}  true to enable, false to disable (default true).
//
// returns: { ok, note }
// ---------------------------------------------------------------------------
async function setOrExportRule(page, { exportTopTrain = true } = {}) {
  const result = await page.evaluate((flag) => {
    state.mechanics = state.mechanics || {};
    state.mechanics.export_train = flag;
    if (typeof autosave          === 'function') autosave();
    if (typeof renderMechanicsLeft  === 'function') renderMechanicsLeft();
    return { ok: true, note: `export_train = ${flag}` };
  }, exportTopTrain);

  await _sleep(SETTLE_MS);
  return result;
}

module.exports = { setTileLayRule, setOrExportRule };
