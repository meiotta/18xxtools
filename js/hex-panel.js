// ─── HEX PANEL ────────────────────────────────────────────────────────────────
// Right-panel "Hex" tab: displays and edits properties of the selected hex.
// Load order: EIGHTH — after palette.js.
//
// updateHexPanel(hexId) — populates the right panel fields from state.hexes[hexId].
// All DOM event listeners for hex tab fields are wired here.

function updateHexPanel(hexId) {
  const hex = state.hexes[hexId] || {};

  // Show killed-hex notice and disable editing controls when hex is killed
  const killedNotice = document.getElementById('killedHexNotice');
  const editControls = document.getElementById('hexEditControls');
  const isKilled = !!hex.killed;
  if (killedNotice) killedNotice.style.display = isKilled ? 'block' : 'none';
  if (editControls) {
    editControls.style.opacity      = isKilled ? '0.25' : '';
    editControls.style.pointerEvents = isKilled ? 'none' : '';
  }

  // ── Coordinate display ─────────────────────────────────────────────────────
  document.getElementById('hexCoord').value = hexId;
  const coordDisplay = document.getElementById('hexCoordDisplay');
  if (coordDisplay) coordDisplay.textContent = hexId || '—';

  if (isKilled) return; // coord shown above; skip populating editable fields

  // ── Type badges ────────────────────────────────────────────────────────────
  const badgeRow = document.getElementById('hexBadgeRow');
  if (badgeRow) {
    badgeRow.innerHTML = '';
    if (hex.static) {
      const b = document.createElement('span');
      b.className = 'hpanel-badge hpanel-badge-static';
      b.textContent = 'Static';
      badgeRow.appendChild(b);
    }
    if (hex.terrain === 'offmap' || hex.feature === 'offboard') {
      const b = document.createElement('span');
      b.className = 'hpanel-badge hpanel-badge-offboard';
      b.textContent = 'Offboard';
      badgeRow.appendChild(b);
    }
  }

  // ── Label ──────────────────────────────────────────────────────────────────
  const hexLabelEl = document.getElementById('hexLabel');
  if (hexLabelEl) hexLabelEl.value = hex.label || '';

  // ── Terrain ────────────────────────────────────────────────────────────────
  // Sync the hidden select (for JS compat) and highlight the matching brush btn
  document.getElementById('hexTerrain').value = hex.terrain || '';
  document.querySelectorAll('.terrain-brush-btn').forEach(btn => {
    btn.classList.toggle('tb-active', btn.dataset.terrain === (hex.terrain || ''));
  });

  // ── Rotation ───────────────────────────────────────────────────────────────
  const rot = hex.rotation || 0;
  document.getElementById('hexRotation').value = rot;
  document.querySelectorAll('.rot-seg').forEach(seg => {
    seg.classList.toggle('active', parseInt(seg.dataset.rot) === rot);
  });

  // ── City Name (shown when placed tile has a city or OO station) ────────────
  const tileCitySection = document.getElementById('tileCityNameSection');
  const td = hex.tile ? TILE_DEFS[String(hex.tile)] : null;
  if (td && (td.city || td.oo)) {
    tileCitySection.style.display = 'block';
    document.getElementById('tileCityName').value = hex.cityName || '';
  } else {
    tileCitySection.style.display = 'none';
  }

  // ── Company references (read-only) ─────────────────────────────────────────
  _updateCompanyRefs(hexId);

  // ── Upgrade rules ──────────────────────────────────────────────────────────
  const noUpgradeEl = document.getElementById('hexNoUpgrade');
  const upgradeOnlyEl = document.getElementById('hexUpgradeOnly');
  if (noUpgradeEl)    noUpgradeEl.checked = !!hex.noUpgrade;
  if (upgradeOnlyEl)  upgradeOnlyEl.value = hex.upgradeOnly || '';

  // ── Phase revenue section (static gray/red city or offboard only) ──────────
  const phaseRevSection = document.getElementById('staticPhaseRevenueSection');
  if (phaseRevSection) {
    const showPhaseRev = hex.static === true &&
      (hex.bg === 'gray' || hex.bg === 'red') &&
      (hex.feature === 'city' || hex.feature === 'offboard');
    phaseRevSection.style.display = showPhaseRev ? 'block' : 'none';
    if (showPhaseRev) {
      const pr = hex.phaseRevenue || {};
      document.getElementById('phRevYellow').value = pr.yellow !== undefined ? pr.yellow : 20;
      document.getElementById('phRevGreen').value  = pr.green  !== undefined ? pr.green  : 30;
      document.getElementById('phRevBrown').value  = pr.brown  !== undefined ? pr.brown  : 40;
      document.getElementById('phRevGray').value   = pr.gray   !== undefined ? pr.gray   : 60;
    }
  }
}

// ── Compute and render company references for this hex ────────────────────────
function _updateCompanyRefs(hexId) {
  const refsSection = document.getElementById('hexCompanyRefs');
  const refsList    = document.getElementById('hexCompanyRefsList');
  if (!refsSection || !refsList) return;

  const items = [];

  // Scan major companies
  (state.companies || []).forEach(co => {
    if (co.homeHex && co.homeHex.toUpperCase() === hexId.toUpperCase()) {
      items.push({ label: co.abbr || co.name, type: 'Home', color: co.color });
    }
    if (co.destHex && co.destHex.toUpperCase() === hexId.toUpperCase()) {
      items.push({ label: co.abbr || co.name, type: 'Destination', color: co.color });
    }
  });

  // Scan minors
  (state.minors || []).forEach(m => {
    if (m.homeHex && m.homeHex.toUpperCase() === hexId.toUpperCase()) {
      items.push({ label: m.abbr || m.name, type: 'Home', color: m.color });
    }
  });

  if (items.length === 0) {
    refsSection.style.display = 'none';
    return;
  }

  refsSection.style.display = 'block';
  refsList.innerHTML = '';
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'hpanel-ref-row';
    row.innerHTML = `
      <span class="hpanel-ref-swatch" style="background:${item.color || '#888'};"></span>
      <span class="hpanel-ref-label">${item.label}</span>
      <span class="hpanel-ref-type">${item.type}</span>`;
    refsList.appendChild(row);
  });
}

// ── Field change listeners ─────────────────────────────────────────────────────

document.getElementById('hexLabel').addEventListener('change', (e) => {
  if (!selectedHex) return;
  ensureHex(selectedHex);
  state.hexes[selectedHex].label = e.target.value.trim();
  render();
  autosave();
});

document.getElementById('hexTerrain').addEventListener('change', (e) => {
  if (selectedHex) {
    if (!state.hexes[selectedHex]) state.hexes[selectedHex] = { terrain: '', terrainCost: 0, tile: 0, rotation: 0, city: null, town: false, label: '' };
    state.hexes[selectedHex].terrain = e.target.value;
    state.hexes[selectedHex].terrainCost = terrainCost(e.target.value);
    updateHexPanel(selectedHex);
    render();
    autosave();
  }
});

document.getElementById('rotPrevBtn').addEventListener('click', () => {
  if (!selectedHex) return;
  const val = (parseInt(document.getElementById('hexRotation').value) - 1 + 6) % 6;
  document.getElementById('hexRotation').value = val;
  ensureHex(selectedHex);
  state.hexes[selectedHex].rotation = val;
  render();
  autosave();
});

document.getElementById('rotNextBtn').addEventListener('click', () => {
  if (!selectedHex) return;
  const val = (parseInt(document.getElementById('hexRotation').value) + 1) % 6;
  document.getElementById('hexRotation').value = val;
  ensureHex(selectedHex);
  state.hexes[selectedHex].rotation = val;
  render();
  autosave();
});

document.getElementById('hexNoUpgrade').addEventListener('change', (e) => {
  if (!selectedHex) return;
  ensureHex(selectedHex);
  state.hexes[selectedHex].noUpgrade = e.target.checked || undefined;
  if (!e.target.checked) delete state.hexes[selectedHex].noUpgrade;
  autosave();
});

document.getElementById('hexUpgradeOnly').addEventListener('change', (e) => {
  if (!selectedHex) return;
  ensureHex(selectedHex);
  const v = e.target.value.trim();
  if (v) {
    state.hexes[selectedHex].upgradeOnly = v;
  } else {
    delete state.hexes[selectedHex].upgradeOnly;
  }
  autosave();
});

document.getElementById('applyHexBtn').addEventListener('click', () => {
  if (selectedHex) {
    const hex = state.hexes[selectedHex] || {};
    hex.terrain     = document.getElementById('hexTerrain').value;
    hex.terrainCost = terrainCost(hex.terrain);
    hex.rotation    = parseInt(document.getElementById('hexRotation').value) || 0;
    hex.label       = document.getElementById('hexLabel').value.trim();

    // Save city name for placed tiles that have a city/OO
    const td = hex.tile ? TILE_DEFS[String(hex.tile)] : null;
    if (td && (td.city || td.oo)) {
      hex.cityName = document.getElementById('tileCityName').value.trim();
    }

    // Upgrade rules
    const noUpgradeEl = document.getElementById('hexNoUpgrade');
    const upgradeOnlyEl = document.getElementById('hexUpgradeOnly');
    if (noUpgradeEl && noUpgradeEl.checked) {
      hex.noUpgrade = true;
    } else {
      delete hex.noUpgrade;
    }
    const upgradeOnly = upgradeOnlyEl ? upgradeOnlyEl.value.trim() : '';
    if (upgradeOnly) {
      hex.upgradeOnly = upgradeOnly;
    } else {
      delete hex.upgradeOnly;
    }

    state.hexes[selectedHex] = hex;
    render();
    autosave();
  }
});

document.getElementById('clearHexBtn').addEventListener('click', () => {
  if (selectedHex) {
    state.hexes[selectedHex] = { terrain: '', terrainCost: 0, tile: 0, rotation: 0, city: null, town: false, label: '' };
    updateHexPanel(selectedHex);
    render();
    autosave();
  }
});

// ── makeDualTownBtn / makeOOCityBtn — kept as no-ops for compatibility ─────────
const _makeDualTownBtn = document.getElementById('makeDualTownBtn');
const _makeOOCityBtn   = document.getElementById('makeOOCityBtn');
if (_makeDualTownBtn) _makeDualTownBtn.addEventListener('click', () => {});
if (_makeOOCityBtn)   _makeOOCityBtn.addEventListener('click', () => {});

// ── Remove terrain button ─────────────────────────────────────────────────────

document.getElementById('removeTerrainBtn').addEventListener('click', () => {
  if (!selectedHex) return;
  ensureHex(selectedHex);
  state.hexes[selectedHex].terrain = '';
  state.hexes[selectedHex].terrainCost = 0;
  updateHexPanel(selectedHex);
  render();
  autosave();
});

// ── Rotation segmented picker ─────────────────────────────────────────────────

document.querySelectorAll('.rot-seg').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = parseInt(btn.dataset.rot);
    document.getElementById('hexRotation').value = val;
    document.querySelectorAll('.rot-seg').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (!selectedHex) return;
    ensureHex(selectedHex);
    state.hexes[selectedHex].rotation = val;
    render();
    autosave();
  });
});

// ── Phase revenue inputs (static gray/red city or offboard) ───────────────────

['Yellow', 'Green', 'Brown', 'Gray'].forEach(phase => {
  const el = document.getElementById('phRev' + phase);
  if (!el) return;
  el.addEventListener('input', () => {
    if (!selectedHex) return;
    ensureHex(selectedHex);
    const h = state.hexes[selectedHex];
    if (!h.phaseRevenue) h.phaseRevenue = {};
    h.phaseRevenue[phase.toLowerCase()] = parseInt(el.value, 10) || 0;
    render();
    autosave();
  });
});

// ── Terrain quick-btn stubs for JS compat (no UI shown, but some callers may exist) ──
document.querySelectorAll('.terrain-quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!selectedHex) return;
    ensureHex(selectedHex);
    const key = btn.dataset.terrain;
    const h = state.hexes[selectedHex];
    if (h.terrain === key) {
      h.terrain = '';
      h.terrainCost = 0;
    } else {
      h.terrain = key;
      h.terrainCost = (state.terrainCosts && state.terrainCosts[key]) || 0;
    }
    updateHexPanel(selectedHex);
    render();
    autosave();
  });
});
