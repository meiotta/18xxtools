// erin/puppet-lib/rounds.js — Puppeteer step library for rounds / OR-set
// configuration. Each function takes (page, params) and returns
// { ok: boolean, note: string, ...details }, matching runner.js's
// applyEdit return contract.
//
// Honesty rules (per runner.js header):
//   - Never fabricate state. If the UI cannot configure something, return
//     ok:false with a useful note.
//   - For features where the UI surface doesn't yet exist, write the
//     state field directly and document the gap in the note.
//
// ── Engine background ────────────────────────────────────────────────────
//
// End-of-OR train export in tobymao is driven by two cooperating pieces:
//
//   1. The phase status flag `'export_train'` (a string in `phase.status`).
//      base.rb has no built-in handler — games opt in by overriding
//      `or_round_finished` on the game class to check the flag and call
//      `depot.export!`. 1867's `g_1867/game.rb:879-885` is the canonical
//      shape:
//
//          def or_round_finished
//            return unless @phase.status.include?('export_train')
//            depot.export!
//            post_train_buy
//            game_end_check
//          end
//
//      1817 takes a stricter form (unconditional, every OR — see
//      `g_1817/game.rb:980-988`); 1861 explicitly defines a no-op.
//
//   2. The status flag `'export_train'` itself lives in
//      `state.phases[i].status` for each phase that should trigger
//      export. Adding the flag to every phase makes export fire at every
//      OR end across the game.
//
// In the 18xxtools state model:
//   - `state.mechanics.export_train` is a top-level toggle used by
//     runner.js's setupCustom (mode E) to flag the policy. No current
//     emit code reads it — it is forward-compat scaffolding.
//   - `state.phases[i].status[]` is the canonical engine-bound field.
//   - The rounds panel ships a preset `1867_phase_export` (verbatim from
//     g_1867/game.rb) that the user can paste into the Operating tab's
//     Round End body to wire the actual `or_round_finished` hook.
//
// ── OR vs OR-set terminology ─────────────────────────────────────────────
//
// The requirement in edit_permutations.md reads "export the top unpurchased
// train at the end of every OR set." The tobymao engine has two distinct
// end-of-round hooks:
//
//   `or_round_finished` — fires at the end of *every* OR (called by base.rb
//                         next_round! line 2930/2934 in the Round::Operating
//                         branch). 1817/1867 use this.
//   `or_set_finished`   — fires once at the end of an OR *set* (after the
//                         last OR before transitioning to the next SR).
//                         No tobymao game currently uses this for train
//                         export; the OR-end hook is the convention.
//
// edit_permutations.md uses "OR set" loosely — the engine convention is
// per-OR. setOrSetTrainExport configures the per-OR hook because that is
// what every existing tobymao game does. If the strict OR-*set*-only
// semantic is needed, the user would also need an `or_set_finished` hook
// authored via the Operating tab's Round End body.

'use strict';

// Configure end-of-OR train export. Per engine convention, this is the
// `export_train` phase status applied to all configured phases plus the
// top-level `state.mechanics.export_train` policy flag.
//
// What this does:
//   - Sets state.mechanics.export_train to the requested boolean.
//   - When enabling: pushes 'export_train' onto every phase's status array
//     (dedup-safe). When disabling: removes it from every phase.
//   - Does NOT auto-populate the Operating tab's Round End body — that
//     decision is delegated to the user/test. The corresponding preset
//     id (rounds-panel.js _ROUND_END_PRESETS) is '1867_phase_export'.
//
// Returns:
//   {
//     ok:                  true on successful state update,
//     note:                human-readable summary,
//     mechanicsToggle:     final value of state.mechanics.export_train,
//     phasesUpdated:       number of phase entries modified,
//     phasesWithFlag:      list of phase names that now have 'export_train',
//     hookAuthored:        false (Round End body intentionally untouched),
//     suggestedPresetId:   '1867_phase_export' (apply via Rounds → Operating
//                          → Tier C Round End preset dropdown to author the
//                          actual or_round_finished hook on the game class),
//   }
async function setOrSetTrainExport(page, params) {
  const enabled = !!(params && params.enabled);
  const result  = await page.evaluate((enabled) => {
    if (typeof state === 'undefined') {
      return { ok: false, note: 'no state on page', mechanicsToggle: null, phasesUpdated: 0, phasesWithFlag: [] };
    }
    state.mechanics = state.mechanics || {};
    state.mechanics.export_train = enabled;

    let phasesUpdated  = 0;
    const phasesWithFlag = [];
    const phases = Array.isArray(state.phases) ? state.phases : [];
    phases.forEach(p => {
      if (!p || typeof p !== 'object') return;
      if (!Array.isArray(p.status)) p.status = [];
      const has = p.status.indexOf('export_train') >= 0;
      if (enabled && !has) {
        p.status.push('export_train');
        phasesUpdated++;
      } else if (!enabled && has) {
        p.status = p.status.filter(s => s !== 'export_train');
        phasesUpdated++;
      }
      if (p.status.indexOf('export_train') >= 0 && p.name != null) {
        phasesWithFlag.push(String(p.name));
      }
    });

    // Re-render so the change is visible if a phase panel is open.
    if (typeof renderMechanicsLeft  === 'function') { try { renderMechanicsLeft();  } catch (e) {} }
    if (typeof renderMechanicsRight === 'function') { try { renderMechanicsRight(); } catch (e) {} }
    if (typeof renderTrainsPanel    === 'function') { try { renderTrainsPanel();    } catch (e) {} }
    if (typeof autosave             === 'function') { try { autosave();             } catch (e) {} }

    return {
      ok:              true,
      mechanicsToggle: state.mechanics.export_train,
      phasesUpdated:   phasesUpdated,
      phasesWithFlag:  phasesWithFlag,
    };
  }, enabled);

  if (result.ok) {
    result.note = enabled
      ? `Set state.mechanics.export_train=true and added 'export_train' to ${result.phasesUpdated} phase(s); ${result.phasesWithFlag.length} phase(s) now flagged.`
      : `Set state.mechanics.export_train=false and removed 'export_train' from ${result.phasesUpdated} phase(s).`;
  }
  result.hookAuthored       = false;
  result.suggestedPresetId  = '1867_phase_export';
  return result;
}

// Set the number of operating rounds per OR set. In tobymao games, OR count
// per set is per-phase (`phase.operating_rounds: N`) — base.rb binds
// `@operating_rounds = @phase.operating_rounds` at each SR→OR transition
// (base.rb:2925). This setter writes the same value into every configured
// phase's `operating_rounds` field, giving a uniform OR-per-set across the
// game's phase progression.
//
// Returns:
//   {
//     ok:             true on success,
//     note:           human-readable summary,
//     ors:            the value applied,
//     phasesUpdated:  number of phase entries modified,
//     phasesTotal:    count of phases present in state,
//   }
async function setOrCount(page, params) {
  const ors = Number(params && params.ors);
  if (!Number.isFinite(ors) || ors < 1 || Math.floor(ors) !== ors) {
    return { ok: false, note: `setOrCount: invalid ors=${params && params.ors}; expected positive integer`, ors: null, phasesUpdated: 0, phasesTotal: 0 };
  }

  const result = await page.evaluate((ors) => {
    if (typeof state === 'undefined') {
      return { ok: false, mechanicsBackfilled: false, phasesUpdated: 0, phasesTotal: 0 };
    }
    const phases = Array.isArray(state.phases) ? state.phases : [];
    let phasesUpdated = 0;
    phases.forEach(p => {
      if (!p || typeof p !== 'object') return;
      // Tolerate both snake_case (from .rb import) and camelCase (native
      // state); rewrite to snake_case as the canonical field used by the
      // export emit and the rounds-panel flow diagram.
      if (p.operatingRounds != null) delete p.operatingRounds;
      if (p.operating_rounds !== ors) {
        p.operating_rounds = ors;
        phasesUpdated++;
      }
    });

    // Forward-compat: also stamp a top-level value so callers that read
    // a denormalized field (rare; the canonical source is per-phase) see
    // the same number. The rounds-panel flow diagram and export emit
    // both read from state.phases, not from this field.
    state.mechanics = state.mechanics || {};
    state.mechanics.operatingRoundsPerSet = ors;

    if (typeof renderMechanicsLeft  === 'function') { try { renderMechanicsLeft();  } catch (e) {} }
    if (typeof renderMechanicsRight === 'function') { try { renderMechanicsRight(); } catch (e) {} }
    if (typeof renderTrainsPanel    === 'function') { try { renderTrainsPanel();    } catch (e) {} }
    if (typeof autosave             === 'function') { try { autosave();             } catch (e) {} }

    return { ok: true, phasesUpdated: phasesUpdated, phasesTotal: phases.length };
  }, ors);

  result.ors = ors;
  if (result.ok) {
    result.note = `Set operating_rounds=${ors} on ${result.phasesUpdated} of ${result.phasesTotal} phase(s); mirrored to state.mechanics.operatingRoundsPerSet.`;
  } else {
    result.note = result.note || 'setOrCount: no state on page';
  }
  return result;
}

module.exports = { setOrSetTrainExport, setOrCount };
