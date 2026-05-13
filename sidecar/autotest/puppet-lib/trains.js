// erin/puppet-lib/trains.js — Puppeteer step library: trains & phases
//
// Each exported function takes (page, params) and mutates 18xxtools state,
// then calls the relevant render function so the UI reflects the change.
//
// Convention matches runner.js: state mutations via page.evaluate for
// reliability. UI navigation (nav-rail click) is done when the function
// needs to confirm the panel is active before subsequent selector-based steps.
//
// Return shape: { ok: boolean, note: string }

'use strict';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Navigate to the Trains & Phases panel.
async function _navTrains(page) {
  await page.evaluate(() => {
    const btn = document.querySelector('button[data-lsec="trains"]');
    if (btn) btn.click();
  });
  await sleep(150);
}

// ── addTrain ─────────────────────────────────────────────────────────────────
//
// Adds a new train entry to state.trains and re-renders the trains table.
//
// params:
//   label      {string}  Custom display name (e.g. '5H'). If omitted, the panel
//                        auto-computes the label from distType+n.
//   distType   {string}  'n' | 'xy' | 'nm' | 'h' | 'u'  (default: 'n')
//   n          {number}  Primary distance value. Mapped as:
//                          n→n for distType 'n',  n→h for 'h',
//                          n→n (cities) for 'nm', n→x for 'xy'
//   m          {number}  Town count for distType 'nm'  (default 1)
//   x          {number}  Visit limit for distType 'xy' (default n)
//   y          {number}  Pay  limit  for distType 'xy' (default 1)
//   isExpress  {boolean} Diesel variant for distType 'u'
//   multiplier {number}  Revenue multiplier for distType 'u'
//   cost       {number}  Purchase price (default 100)
//   count      {number|null} Quantity; null = unlimited (default 1)
//   phase      {string}  Phase name this train belongs to (matched by name)
//   permanent  {boolean} true → rusts:false, no rusts_on (default false)
//   rustsOn    {string}  Label of the train this one rusts on (ignored if permanent)
//
// Mirrors edit 4 in runner.js applyEdit (state-poke approach) but accepts
// the full parameter surface the trains-panel exposes.
async function addTrain(page, params) {
  const result = await page.evaluate((p) => {
    state.trains = state.trains || [];
    state.phases = state.phases || [];

    const distType = p.distType || 'n';
    const n        = (p.n != null) ? p.n : 2;
    const distFields = {};

    switch (distType) {
      case 'n':
        distFields.n = n;
        break;
      case 'h':
        distFields.h = n;
        break;
      case 'nm':
        distFields.n = n;
        distFields.m = (p.m != null) ? p.m : 1;
        break;
      case 'xy':
        distFields.x = (p.x != null) ? p.x : n;
        distFields.y = (p.y != null) ? p.y : 1;
        break;
      case 'u':
        distFields.isExpress  = !!p.isExpress;
        distFields.multiplier = (p.multiplier != null) ? p.multiplier : 1;
        break;
    }

    // Resolve phase assignment.
    const phaseName = p.phase ? String(p.phase) : '';
    if (phaseName && !state.phases.find(ph => ph.name === phaseName)) {
      return { ok: false, note: 'phase "' + phaseName + '" not found in state.phases' };
    }

    // Rust relationship.
    let rusts   = false;
    let rustsOn = '';
    if (!p.permanent && p.rustsOn) {
      const target = state.trains.find(t =>
        t.label === p.rustsOn ||
        (typeof calculateTrainLabel === 'function' && calculateTrainLabel(t) === p.rustsOn)
      );
      if (!target) return { ok: false, note: 'rustsOn target "' + p.rustsOn + '" not found in state.trains' };
      rusts   = true;
      rustsOn = target.id;
    }

    const tr = Object.assign(
      {
        id:      't_' + Math.random().toString(36).substr(2, 6),
        distType,
        label:   p.label || '',
        cost:    (p.cost  != null) ? p.cost  : 100,
        count:   (p.count !== undefined) ? p.count : 1,
        rusts,
        rustsOn,
        phase:   phaseName,
        variants: [],
      },
      distFields
    );

    state.trains.push(tr);
    if (typeof renderTrainsTable === 'function') renderTrainsTable();
    if (typeof autosave          === 'function') autosave();

    const displayLabel = p.label || ('[' + distType + ':' + n + ']');
    return { ok: true, note: 'Added ' + displayLabel + ' train, cost ' + tr.cost + ', qty ' + (tr.count === null ? '∞' : tr.count) + (phaseName ? ', phase ' + phaseName : '') };
  }, params);

  await sleep(150);
  return result;
}

// ── reduceTrainCount ──────────────────────────────────────────────────────────
//
// Decrements state.trains[label].count by `by`.
//
// params:
//   label  {string}  Train label to target (e.g. '2')
//   by     {number}  How much to subtract (default 1)
//
// Fails if:
//   - no train with that label exists
//   - train is unlimited (count === null)
//   - reduction would drop count below 1
//
// Mirrors edit 7 in runner.js applyEdit.
async function reduceTrainCount(page, params) {
  const result = await page.evaluate((p) => {
    const label = String(p.label);
    const by    = (p.by != null) ? p.by : 1;

    const tr = (state.trains || []).find(t =>
      t.label === label ||
      t.type  === label ||
      (typeof calculateTrainLabel === 'function' && calculateTrainLabel(t) === label)
    );

    if (!tr) return { ok: false, note: 'No train with label "' + label + '" found' };
    if (tr.count == null) return { ok: false, note: '"' + label + '" is unlimited; cannot reduce count' };
    if (tr.count - by < 1) return { ok: false, note: '"' + label + '" count ' + tr.count + ' − ' + by + ' would be < 1' };

    const prev  = tr.count;
    tr.count   -= by;

    if (typeof renderTrainsTable === 'function') renderTrainsTable();
    if (typeof autosave          === 'function') autosave();

    return { ok: true, note: '"' + label + '" count ' + prev + ' → ' + tr.count };
  }, params);

  await sleep(150);
  return result;
}

// ── setNationalTrainRule ──────────────────────────────────────────────────────
//
// Marks a company as the National Railway and wires it to receive exported
// permanent trains.
//
// UI surface: no single dedicated control exists for this combination.
// The three state fields involved are:
//   company.isNational                        — marks corp as national
//   company.receivesExportedPermanentTrains   — grants exported permanents
//   state.mechanics.national_operates        — national runs after majors
//
// These fields are read by export-game.js and runner.js; they correspond
// to the 'national_operates' KNOWN_STATUS entry (mechanics-panel, tier
// game_specific) and the company shape built by setupCustom mode E.
//
// params:
//   corpSym             {string}   Symbol of the target company (e.g. 'NTL')
//   takesFirstPermanent {boolean}  Wire receivesExportedPermanentTrains
async function setNationalTrainRule(page, params) {
  const result = await page.evaluate((p) => {
    state.companies = state.companies || [];
    state.mechanics = state.mechanics || {};

    const corp = state.companies.find(c =>
      (c.sym || c.abbr || '') === p.corpSym
    );
    if (!corp) {
      return { ok: false, note: 'Company "' + p.corpSym + '" not found in state.companies' };
    }

    corp.isNational = true;
    if (p.takesFirstPermanent) {
      corp.receivesExportedPermanentTrains = true;
    }

    // National operates mechanic — corresponds to 'national_operates' KNOWN_STATUS hook.
    state.mechanics.national_operates = true;

    // export_train must be active so the engine actually exports trains
    // (permanent trains flow to the National only once export_train is on).
    state.mechanics.export_train = true;

    if (typeof renderCompaniesTable === 'function') renderCompaniesTable();
    if (typeof autosave             === 'function') autosave();

    return {
      ok: true,
      note: p.corpSym + ' flagged isNational' +
            (p.takesFirstPermanent ? ' + receivesExportedPermanentTrains' : '') +
            '; mechanics.national_operates + export_train enabled',
    };
  }, params);

  await sleep(150);
  return result;
}

// ── exportTopUnpurchasedTrain ─────────────────────────────────────────────────
//
// Configures the game to export the top unpurchased train at the end of every
// OR set. This is a persistent game rule, not a one-time action button.
//
// Where this config lives:
//   state.mechanics.export_train = true
//     → read by export-game.js and wired to the 'export_train' KNOWN_STATUS
//       hook (tier: hook) defined in mechanics-panel.js:82–85.
//     → corresponds to the 1867-style or_round_finished logic in
//       rounds-panel.js:1774–1782: `depot.export!` fires when any phase
//       carries the `export_train` status string.
//
// No single UI button triggers this. To activate it via the panel UI:
//   1. Open Trains & Phases panel.
//   2. On each phase where export should be active, open the status picker
//      and select "Train Export" (key: export_train, tier: hook).
//   3. The mechanics flag is the game-level switch; phase statuses gate it
//      per-phase for the 1867 pattern.
//
// This function sets the mechanics flag (enabling it for all OR sets) and
// also stamps 'export_train' onto any phases that don't yet carry it, so
// the per-phase gating matches from the first phase onward.
async function exportTopUnpurchasedTrain(page) {
  const result = await page.evaluate(() => {
    state.mechanics        = state.mechanics || {};
    state.mechanics.export_train = true;

    // Stamp export_train status on all phases so the 1867-style phase-gated
    // logic fires in every OR from the start.
    let stamped = 0;
    (state.phases || []).forEach(ph => {
      ph.status = ph.status || [];
      if (!ph.status.includes('export_train')) {
        ph.status.push('export_train');
        stamped++;
      }
    });

    if (typeof renderPhasesTable === 'function') renderPhasesTable();
    if (typeof autosave          === 'function') autosave();

    return {
      ok: true,
      note: 'export_train enabled on mechanics' +
            (stamped > 0 ? ' + stamped onto ' + stamped + ' phase(s)' : ' (phases already stamped)'),
    };
  });

  await sleep(150);
  return result;
}

module.exports = {
  addTrain,
  reduceTrainCount,
  setNationalTrainRule,
  exportTopUnpurchasedTrain,
};
