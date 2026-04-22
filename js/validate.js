// validate.js — pre-export map validation
// Runs a set of checks on the current map state and reports issues that would
// cause the exported map.rb to render differently (or incorrectly) in tobymao.
//
// Each check returns zero or more issue objects:
//   { coord, severity: 'error'|'warning'|'info', message }
//
// Usage: validateMapState() → [{ coord, severity, message }, ...]
// v=20260421a

// ── Helpers ───────────────────────────────────────────────────────────────────

function _phaseRevIsAllZero(pr) {
  if (!pr || typeof pr !== 'object') return true;
  return ['yellow', 'green', 'brown', 'gray'].every(p => !pr[p]);
}

function _phaseRevHasValue(pr) {
  return !_phaseRevIsAllZero(pr);
}

// Return DSL string for a static hex (re-exported) for round-trip checks.
// Uses the same exportHexDsl path as export-ruby.js.
function _hexDsl(hex) {
  if (typeof exportHexDsl === 'function') return exportHexDsl(hex);
  return null;
}

// ── Check registry ────────────────────────────────────────────────────────────

const _CHECKS = [];

function _addCheck(fn) { _CHECKS.push(fn); }

// ── Check: offboard with zero or missing phase revenue ────────────────────────
// An offboard hex (red/gray fixed hex with the offboard= DSL feature) should
// always carry phase revenues (yellow/green/brown/gray values).  If they are
// all zero the hex will render a blank revenue badge — almost certainly wrong.
_addCheck(function checkOffboardRevenue(coord, hex) {
  if (!hex.static || hex.killed) return [];
  if (hex.feature !== 'offboard') return [];
  if (_phaseRevIsAllZero(hex.phaseRevenue)) {
    return [{
      coord, severity: 'warning',
      message: 'Offboard hex has no phase revenue — revenue badge will be blank. ' +
               'Check that offboard=revenue:yellow_N|green_N|… is set in the DSL.',
    }];
  }
  return [];
});

// ── Check: offboard with city nodes but city revenue > 0 ─────────────────────
// When offboard= and city= coexist, tobymao displays the offboard revenue badge
// and the city slots.  City revenue is expected to be 0 (the offboard badge is
// the revenue source).  A city with revenue > 0 alongside an offboard would
// cause tobymao to display BOTH a revenue bubble and the offboard badge.
_addCheck(function checkOffboardCityRevenue(coord, hex) {
  if (!hex.static || hex.killed) return [];
  if (hex.feature !== 'offboard') return [];
  if (!hex.nodes || hex.nodes.length === 0) return [];
  const issues = [];
  for (const node of hex.nodes) {
    if (node.type !== 'city' && node.type !== 'town') continue;
    const flat = node.flat;
    const phaseNonZero = _phaseRevHasValue(node.phaseRevenue);
    if ((flat !== null && flat !== undefined && flat !== 0) || phaseNonZero) {
      issues.push({
        coord, severity: 'warning',
        message: `Offboard hex has a ${node.type} node with non-zero revenue (${flat ?? 'phase'}). ` +
                 'In tobymao, offboard+city hexes show the offboard revenue badge; ' +
                 'city revenue is expected to be 0.',
      });
    }
  }
  return issues;
});

// ── Check: OO hex (two cities) with unequal slot counts ──────────────────────
// OO tiles can have slots:1 or slots:2 on each city, but asymmetric slot counts
// are unusual and may indicate a data entry mistake.
_addCheck(function checkOOSlots(coord, hex) {
  if (!hex.static || hex.killed) return [];
  if (hex.feature !== 'oo') return [];
  const cities = (hex.nodes || []).filter(n => n.type === 'city');
  if (cities.length === 2) {
    const s0 = cities[0].slots ?? 1;
    const s1 = cities[1].slots ?? 1;
    if (s0 !== s1) {
      return [{
        coord, severity: 'info',
        message: `OO hex has asymmetric city slots (${s0} vs ${s1}).`,
      }];
    }
  }
  return [];
});

// ── Check: phase revenue with only some phases active ────────────────────────
// If hex.activePhases has some phases false, the revenue block will skip those
// phases.  This is intentional for some games (e.g., AD1 in 18OE has only
// green/brown/gray), but a hex with yellow inactive and yellow revenue > 0 is
// suspicious.
_addCheck(function checkActivePhasesMismatch(coord, hex) {
  if (!hex.static || hex.killed) return [];
  if (!hex.phaseRevenue || !hex.activePhases) return [];
  const issues = [];
  for (const ph of ['yellow', 'green', 'brown', 'gray']) {
    if (!hex.activePhases[ph] && (hex.phaseRevenue[ph] ?? 0) > 0) {
      issues.push({
        coord, severity: 'info',
        message: `Phase "${ph}" is inactive but has revenue ${hex.phaseRevenue[ph]}. ` +
                 'That phase will be hidden in the revenue badge.',
      });
    }
  }
  return issues;
});

// ── Check: paths referencing out-of-range node indices ───────────────────────
// path=a:_N,b:M where N >= nodes.length will silently lose that endpoint.
_addCheck(function checkPathNodeIndices(coord, hex) {
  if (!hex.static || hex.killed) return [];
  const nodes = hex.nodes || [];
  const paths = hex.paths || [];
  const issues = [];
  for (const path of paths) {
    for (const ep of [path.a, path.b]) {
      if (ep && ep.type === 'node' && ep.n >= nodes.length) {
        issues.push({
          coord, severity: 'error',
          message: `Path references node _${ep.n} but hex only has ${nodes.length} node(s). ` +
                   'This path endpoint will be ignored.',
        });
      }
    }
  }
  return issues;
});

// ── Check: static hex with no feature and no tile reference ──────────────────
// A fully blank live static hex (no terrain, no city, no town, no paths, no
// tile, no label, no borders) is probably an oversight — it exports as a blank
// hex and renders as plain background color.
_addCheck(function checkBlankLiveHex(coord, hex) {
  if (!hex.static || hex.killed) return [];
  if (hex.tile) return [];
  if (hex.feature && hex.feature !== 'none') return [];
  if (hex.terrain && hex.terrain !== '') return [];
  if (hex.label && hex.label !== '') return [];
  if ((hex.nodes && hex.nodes.length > 0) || (hex.paths && hex.paths.length > 0)) return [];
  if (hex.borders && hex.borders.length > 0) return [];
  // Completely blank live static hex
  return [{
    coord, severity: 'info',
    message: 'Static hex is completely blank (no terrain, city, town, paths, or label). ' +
             'Did you mean to mark it as impassable/killed?',
  }];
});

// ── Check: borders with unknown type ─────────────────────────────────────────
_addCheck(function checkBorderTypes(coord, hex) {
  if (!hex.static || hex.killed) return [];
  if (!hex.borders || hex.borders.length === 0) return [];
  const known = new Set(['impassable', 'water', 'province']);
  const issues = [];
  for (const b of hex.borders) {
    if (!known.has(b.type)) {
      issues.push({
        coord, severity: 'warning',
        message: `Border on edge ${b.edge} has unknown type "${b.type}". ` +
                 'It will be exported as-is but may not render.',
      });
    }
  }
  return issues;
});

// ── Main validate function ────────────────────────────────────────────────────

function validateMapState() {
  const issues = [];
  if (!state || !state.hexes) return issues;

  for (const [coord, hex] of Object.entries(state.hexes)) {
    for (const check of _CHECKS) {
      const found = check(coord, hex);
      if (found && found.length) issues.push(...found);
    }
  }

  // Sort: errors first, then warnings, then info; within each group by coord.
  const order = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => {
    const sd = (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
    if (sd !== 0) return sd;
    return a.coord < b.coord ? -1 : a.coord > b.coord ? 1 : 0;
  });

  return issues;
}

// ── Modal UI ──────────────────────────────────────────────────────────────────

function showValidateModal(issues) {
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:9999',
    'background:rgba(0,0,0,0.72)',
    'display:flex;align-items:center;justify-content:center',
  ].join(';');

  const modal = document.createElement('div');
  modal.style.cssText = [
    'background:#1e1e1e;color:#ddd;font-family:monospace;font-size:13px',
    'border:1px solid #555;border-radius:6px',
    'padding:20px 24px;max-width:620px;width:90%',
    'max-height:80vh;display:flex;flex-direction:column',
    'box-shadow:0 8px 32px rgba(0,0,0,0.7)',
  ].join(';');

  const severityColor = { error: '#f44336', warning: '#ff9800', info: '#64b5f6' };
  const severityIcon  = { error: '✖', warning: '⚠', info: 'ℹ' };

  const errors   = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  const infos    = issues.filter(i => i.severity === 'info').length;

  let headerColor = '#4caf50';   // all clear — green
  let headerText  = '✔ No issues found';
  if (errors)        { headerColor = '#f44336'; headerText = `✖ ${errors} error${errors>1?'s':''}${warnings?' + '+warnings+' warning'+(warnings>1?'s':''):''}${infos?' + '+infos+' note'+(infos>1?'s':''):''}` ; }
  else if (warnings) { headerColor = '#ff9800'; headerText = `⚠ ${warnings} warning${warnings>1?'s':''}${infos?' + '+infos+' note'+(infos>1?'s':''):''}` ; }
  else if (infos)    { headerColor = '#64b5f6'; headerText = `ℹ ${infos} note${infos>1?'s':''}` ; }

  const header = document.createElement('div');
  header.style.cssText = `font-size:15px;font-weight:bold;color:${headerColor};margin-bottom:14px;flex-shrink:0`;
  header.textContent = `Map validation — ${headerText}`;
  modal.appendChild(header);

  if (issues.length === 0) {
    const ok = document.createElement('div');
    ok.style.cssText = 'color:#aaa;margin-bottom:16px;font-size:13px';
    ok.textContent = 'The map looks good. No known issues detected.';
    modal.appendChild(ok);
  } else {
    const sub = document.createElement('div');
    sub.style.cssText = 'color:#aaa;margin-bottom:12px;font-size:12px;flex-shrink:0';
    sub.textContent = 'Fix errors before exporting. Warnings may indicate rendering differences vs tobymao.';
    modal.appendChild(sub);

    const list = document.createElement('div');
    list.style.cssText = 'overflow-y:auto;flex:1 1 auto;display:flex;flex-direction:column;gap:8px';

    for (const issue of issues) {
      const row = document.createElement('div');
      const col = severityColor[issue.severity] || '#aaa';
      row.style.cssText = `padding:8px 10px;background:#2a2a2a;border-radius:4px;border-left:3px solid ${col};display:flex;gap:8px;align-items:flex-start`;

      const icon = document.createElement('span');
      icon.style.cssText = `color:${col};font-size:14px;flex-shrink:0;margin-top:1px`;
      icon.textContent = severityIcon[issue.severity] || '•';

      const body = document.createElement('div');
      body.style.cssText = 'min-width:0';

      const coordBadge = document.createElement('span');
      coordBadge.style.cssText = 'font-weight:bold;color:#fff;margin-right:8px';
      coordBadge.textContent = issue.coord;

      const msg = document.createElement('span');
      msg.style.cssText = 'color:#ccc;font-size:12px';
      msg.textContent = issue.message;

      body.appendChild(coordBadge);
      body.appendChild(msg);
      row.appendChild(icon);
      row.appendChild(body);
      list.appendChild(row);
    }
    modal.appendChild(list);
  }

  // Footer
  const footer = document.createElement('div');
  footer.style.cssText = 'margin-top:16px;display:flex;justify-content:flex-end;flex-shrink:0';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = 'padding:6px 20px;background:#444;color:#ddd;border:none;border-radius:4px;cursor:pointer;font-size:13px';
  closeBtn.addEventListener('click', () => overlay.remove());
  footer.appendChild(closeBtn);
  modal.appendChild(footer);

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

// ── Wire up buttons ───────────────────────────────────────────────────────────

// Config panel button
document.getElementById('mapValidateBtn').addEventListener('click', () => {
  const issues = validateMapState();
  showValidateModal(issues);
});
