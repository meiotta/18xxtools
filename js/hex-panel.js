// ─── HEX PANEL ────────────────────────────────────────────────────────────────
// Right-panel "Hex" tab: displays and edits properties of the selected hex.
// Load order: EIGHTH — after palette.js.
//
// updateHexPanel(hexId) — populates the right panel fields from state.hexes[hexId].
// All DOM event listeners for hex tab fields are wired here.

function updateHexPanel(hexId) {
  const hex = state.hexes[hexId] || {};
  document.getElementById('hexCoord').value = hexId;
  document.getElementById('hexTerrain').value = hex.terrain || '';
  document.getElementById('hexRotation').value = hex.rotation || 0;

  // Remove-terrain button: only when terrain is set
  const removeTerrainBtn = document.getElementById('removeTerrainBtn');
  if (removeTerrainBtn) {
    removeTerrainBtn.style.display = hex.terrain ? 'block' : 'none';
  }

  // Highlight active terrain quick-add button
  document.querySelectorAll('.terrain-quick-btn').forEach(btn => {
    btn.style.outline = btn.dataset.terrain === hex.terrain ? '2px solid #ffd700' : '';
    btn.style.background = btn.dataset.terrain === hex.terrain ? 'rgba(255,215,0,0.15)' : '';
  });

  // Show city name field when the placed tile has a city or OO station
  const tileCitySection = document.getElementById('tileCityNameSection');
  const td = hex.tile ? TILE_DEFS[String(hex.tile)] : null;
  if (td && (td.city || td.oo)) {
    tileCitySection.style.display = 'block';
    document.getElementById('tileCityName').value = hex.cityName || '';
  } else {
    tileCitySection.style.display = 'none';
  }

  const citySection = document.getElementById('cityEditorSection');
  if (hex.city) {
    citySection.style.display = 'block';
    document.getElementById('homeCompany').value = hex.city.home || '';
  } else {
    citySection.style.display = 'none';
  }

  // OO button: toggle — shows "Make OO City" when city exists and not OO,
  // or "Remove OO" when already OO
  const makeOOCityBtn = document.getElementById('makeOOCityBtn');
  const makeDualTownBtn = document.getElementById('makeDualTownBtn');
  if (makeOOCityBtn) {
    if (hex.city) {
      makeOOCityBtn.style.display = 'block';
      makeOOCityBtn.textContent = hex.oo ? '🏙 Remove OO' : '🏙🏙 Make OO City';
    } else if (hex.oo) {
      makeOOCityBtn.style.display = 'block';
      makeOOCityBtn.textContent = '🏙 Remove OO';
    } else {
      makeOOCityBtn.style.display = 'none';
    }
  }
  if (makeDualTownBtn) {
    makeDualTownBtn.style.display = (hex.town && !hex.dualTown) ? 'block' : 'none';
  }

  // Phase revenue section: static gray/red hexes with city or offboard feature only
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

// ── Field change listeners ───────────────────────────────────────────────────

document.getElementById('hexTerrain').addEventListener('change', (e) => {
  if (selectedHex) {
    if (!state.hexes[selectedHex]) state.hexes[selectedHex] = { terrain: '', terrainCost: 0, tile: 0, rotation: 0, city: null, town: false, label: '' };
    state.hexes[selectedHex].terrain = e.target.value;
    state.hexes[selectedHex].terrainCost = terrainCost(e.target.value);
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

document.getElementById('applyHexBtn').addEventListener('click', () => {
  if (selectedHex) {
    const hex = state.hexes[selectedHex] || {};
    hex.terrain = document.getElementById('hexTerrain').value;
    hex.terrainCost = terrainCost(hex.terrain);
    hex.rotation = parseInt(document.getElementById('hexRotation').value) || 0;

    // Save city name for placed tiles that have a city/OO
    const td = hex.tile ? TILE_DEFS[String(hex.tile)] : null;
    if (td && (td.city || td.oo)) {
      hex.cityName = document.getElementById('tileCityName').value.trim();
    }

    if (hex.city) {
      hex.city.home = document.getElementById('homeCompany').value;
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

document.getElementById('makeDualTownBtn').addEventListener('click', () => {
  if (!selectedHex) return;
  ensureHex(selectedHex);
  const h = state.hexes[selectedHex];
  h.dualTown = true;
  h.city = null;
  h.oo = false;
  render(); updateHexPanel(selectedHex); autosave();
});

document.getElementById('makeOOCityBtn').addEventListener('click', () => {
  if (!selectedHex) return;
  ensureHex(selectedHex);
  const h = state.hexes[selectedHex];
  if (h.oo) {
    // Toggle off: convert back to regular city
    h.oo = false;
    if (!h.city) {
      h.city = { home: '', slots: 1 };
    }
  } else {
    // Toggle on: mark as OO (independent of slots)
    h.oo = true;
  }
  render(); updateHexPanel(selectedHex); autosave();
});

// ── Terrain quick-add buttons ────────────────────────────────────────────────

document.querySelectorAll('.terrain-quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!selectedHex) return;
    ensureHex(selectedHex);
    const key = btn.dataset.terrain;
    const h = state.hexes[selectedHex];
    if (h.terrain === key) {
      // Toggle off
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

// ── Remove terrain button ────────────────────────────────────────────────────

document.getElementById('removeTerrainBtn').addEventListener('click', () => {
  if (!selectedHex) return;
  ensureHex(selectedHex);
  state.hexes[selectedHex].terrain = '';
  state.hexes[selectedHex].terrainCost = 0;
  updateHexPanel(selectedHex);
  render();
  autosave();
});

// ── Phase revenue inputs (static gray/red city or offboard) ─────────────────

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
