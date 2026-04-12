// ─── COMPANIES PANEL ──────────────────────────────────────────────────────────
// Right-panel Companies, Trains, Privates, and Config tabs.
// Load order: NINTH — after hex-panel.js.
//
// renderCompaniesTable()   — rebuilds the company rows from state.companies
// renderPrivatesTable()    — rebuilds private company rows from state.privates
// renderTerrainCostsTable()— rebuilds terrain cost editor from state.terrainCosts
// renderHomeCompanySelect()— syncs the home company <select> in the hex panel

function renderCompaniesTable() {
  const tbody = document.getElementById('companiesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  state.companies.forEach((co, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td><input type="color" class="co-color"></td><td><input type="text" class="co-name"></td><td><input type="text" class="co-abbr" maxlength="4"></td><td><input type="text" class="co-home" maxlength="3"></td><td><input type="number" class="co-par"></td><td><input type="number" class="co-tokens"></td><td><input type="number" class="co-float"></td><td><button class="table-btn" style="background: #8b0000;">x</button></td>';
    const inputs = tr.querySelectorAll('input');
    inputs[0].value = co.color || '#ff0000';
    inputs[1].value = co.name || '';
    inputs[2].value = co.abbr || '';
    inputs[3].value = co.homeHex || '';
    inputs[4].value = co.parValue || 100;
    inputs[5].value = co.tokens || 5;
    inputs[6].value = co.floatPct || 60;
    inputs[0].addEventListener('change', (e) => { state.companies[idx].color = e.target.value; autosave(); });
    inputs[1].addEventListener('change', (e) => { state.companies[idx].name = e.target.value; autosave(); });
    inputs[2].addEventListener('change', (e) => { state.companies[idx].abbr = e.target.value; autosave(); });
    inputs[3].addEventListener('change', (e) => { state.companies[idx].homeHex = e.target.value; autosave(); });
    inputs[4].addEventListener('change', (e) => { state.companies[idx].parValue = parseInt(e.target.value) || 100; autosave(); });
    inputs[5].addEventListener('change', (e) => { state.companies[idx].tokens = parseInt(e.target.value) || 5; autosave(); });
    inputs[6].addEventListener('change', (e) => { state.companies[idx].floatPct = parseInt(e.target.value) || 60; autosave(); });
    tr.querySelector('button').addEventListener('click', () => {
      state.companies.splice(idx, 1);
      renderCompaniesTable();
      renderHomeCompanySelect();
      autosave();
    });
    tbody.appendChild(tr);
  });
}

function renderHomeCompanySelect() {
  const sel = document.getElementById('homeCompany');
  if (!sel) return;
  const val = sel.value;
  sel.innerHTML = '<option value="">None</option>';
  state.companies.forEach(co => {
    const opt = document.createElement('option');
    opt.value = co.abbr || co.name;
    opt.textContent = co.name || co.abbr;
    sel.appendChild(opt);
  });
  sel.value = val;
}

document.getElementById('addCompanyBtn').addEventListener('click', () => {
  showCompanyWizard('major');
});

function renderMinorsTable() {
  const tbody = document.getElementById('minorsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  state.minors.forEach((co, idx) => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #333';

    const needsHome = co.locationMechanism === 'fixed' && !co.homeHex;
    const warning = needsHome ? '<span title="Home Hex Required" style="color:#ff4444;margin-right:4px;cursor:help;">⚠️</span>' : '';
    const placeBtn = co.locationMechanism === 'fixed' ? `<button class="table-btn place-btn" data-idx="${idx}" style="background:#444;margin-top:4px;font-size:10px;">${co.homeHex || 'Place'}</button>` : '<span style="color:#666;font-size:10px;">-</span>';

    tr.innerHTML = `
      <td><input type="color" class="co-color"></td>
      <td><div style="display:flex;align-items:center;">${warning}<input type="text" class="co-name" style="flex:1;"></div></td>
      <td><input type="text" class="co-abbr" maxlength="4"></td>
      <td style="text-align:center;">${placeBtn}</td>
      <td>
        <select class="co-mech" style="font-size:10px;">
          <option value="fixed">Fixed</option>
          <option value="choice">Choice</option>
          <option value="draft">Draft</option>
        </select>
        ${co.locationMechanism === 'draft' ? `<div style="font-size:9px;color:#aaa;margin-top:2px;">Bid: $${co.minBid || 0}</div>` : ''}
      </td>
      <td><input type="number" class="co-tokens"></td>
      <td><button class="table-btn delete-btn" style="background: #8b0000;">x</button></td>
    `;

    const colorInput = tr.querySelector('.co-color');
    const nameInput = tr.querySelector('.co-name');
    const abbrInput = tr.querySelector('.co-abbr');
    const mechSelect = tr.querySelector('.co-mech');
    const tokensInput = tr.querySelector('.co-tokens');

    colorInput.value = co.color || '#ffffff';
    nameInput.value = co.name || '';
    abbrInput.value = co.abbr || '';
    mechSelect.value = co.locationMechanism || 'fixed';
    tokensInput.value = co.tokens || 1;

    colorInput.addEventListener('change', (e) => { state.minors[idx].color = e.target.value; autosave(); });
    nameInput.addEventListener('change', (e) => { state.minors[idx].name = e.target.value; autosave(); });
    abbrInput.addEventListener('change', (e) => { state.minors[idx].abbr = e.target.value; autosave(); });
    mechSelect.addEventListener('change', (e) => {
      state.minors[idx].locationMechanism = e.target.value;
      renderMinorsTable();
      autosave();
    });
    tokensInput.addEventListener('change', (e) => { state.minors[idx].tokens = parseInt(e.target.value) || 1; autosave(); });

    const placeBtnEl = tr.querySelector('.place-btn');
    if (placeBtnEl) {
      placeBtnEl.addEventListener('click', () => { enterPlacementMode(idx); });
    }

    tr.querySelector('.delete-btn').addEventListener('click', () => {
      state.minors.splice(idx, 1);
      renderMinorsTable();
      autosave();
    });
    tbody.appendChild(tr);
  });
}

function enterPlacementMode(idx) {
  pendingMinorIndex = idx;
  isPlacementMode = true;
  const co = state.minors[idx];
  document.getElementById('placementOverlay').style.display = 'flex';
  document.getElementById('placementText').textContent = `Select Home Hex for ${co.abbr || co.name || ('Minor ' + (idx + 1))}`;
  document.body.style.cursor = 'crosshair';
  updateStatus(`Placement Mode: ${co.abbr || 'Minor'}`);
}

function exitPlacementMode() {
  pendingMinorIndex = null;
  isPlacementMode = false;
  document.getElementById('placementOverlay').style.display = 'none';
  document.body.style.cursor = 'default';
  updateStatus('');
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isPlacementMode) { exitPlacementMode(); }
});

document.getElementById('addMinorBtn').addEventListener('click', () => {
  showCompanyWizard('minor');
});

// ── Company Wizard ──────────────────────────────────────────────────────────

function showCompanyWizard(type) {
  document.getElementById('cwType').value = type;
  document.getElementById('cwTitle').textContent = type === 'major' ? 'Add Major Company' : 'Add Minor Company';
  document.getElementById('cwName').value = '';
  document.getElementById('cwAbbr').value = '';
  document.getElementById('cwColor').value = '#ff0000';
  document.getElementById('cwHome').value = '';
  document.getElementById('cwTokens').value = type === 'major' ? 5 : 1;
  document.getElementById('cwPar').value = 100;
  document.getElementById('cwFloat').value = 60;
  document.getElementById('cwLocationMech').value = 'fixed';
  document.getElementById('cwMinorCount').value = 1;
  document.getElementById('cwColorPalette').value = 'charter';
  document.getElementById('cwMinBid').value = 0;
  document.getElementById('cwTrainTiming').value = 'first_or_before_run';

  if (type === 'minor') {
    document.getElementById('cwMajorFields').style.display = 'none';
    document.getElementById('cwMinorFields').style.display = 'block';
    document.getElementById('cwBulkContainer').style.display = 'block';
  } else {
    document.getElementById('cwMajorFields').style.display = 'grid';
    document.getElementById('cwMinorFields').style.display = 'none';
    document.getElementById('cwBulkContainer').style.display = 'none';
  }

  document.getElementById('companyWizard').style.display = 'flex';
}

document.getElementById('cwLocationMech').addEventListener('change', (e) => {
  const mech = e.target.value;
  document.getElementById('cwMinBidContainer').style.display = (mech === 'draft' ? 'block' : 'none');
  document.getElementById('cwBulkContainer').style.display = (mech === 'fixed' ? 'block' : 'none');
});

const PALETTES = {
  charter: ['#ffffff'],
  standard: ['#ff0000', '#00ff00', '#0000cc', '#ffff00', '#ff00ff', '#00cccc', '#ffa500', '#800080', '#008000', '#800000'],
  rainbow: ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#f0a6ca', '#f48c06', '#06d6a0', '#118ab2', '#073b4c']
};

document.getElementById('cwBtnCancel').addEventListener('click', () => {
  document.getElementById('companyWizard').style.display = 'none';
});

document.getElementById('cwBtnSave').addEventListener('click', () => {
  const type = document.getElementById('cwType').value;
  const name = document.getElementById('cwName').value;
  const abbr = document.getElementById('cwAbbr').value;
  const color = document.getElementById('cwColor').value;
  const homeHex = document.getElementById('cwHome').value.toUpperCase();
  const tokens = parseInt(document.getElementById('cwTokens').value) || 1;

  if (type === 'major') {
    state.companies.push({ 
      name, abbr, color, homeHex, 
      parValue: parseInt(document.getElementById('cwPar').value) || 100, 
      tokens, 
      floatPct: parseInt(document.getElementById('cwFloat').value) || 60 
    });
    renderCompaniesTable();
    renderHomeCompanySelect();
  } else {
    const count = parseInt(document.getElementById('cwMinorCount').value) || 1;
    const mech = document.getElementById('cwLocationMechanism')?.value || 'fixed';
    const paletteKey = document.getElementById('cwColorPalette').value || 'charter';
    const palette = PALETTES[paletteKey];
    const trainPurchaseTiming = document.getElementById('cwTrainTiming').value;
    const minBid = parseInt(document.getElementById('cwMinBid').value) || 0;

    for(let i = 0; i < count; i++) {
      const coColor = palette[i % palette.length];
      const coName = count > 1 ? (name ? `${name} ${i + 1}` : `Minor ${state.minors.length + 1}`) : name;
      const coAbbr = count > 1 ? (abbr ? `${abbr}${i + 1}` : `M${state.minors.length + 1}`) : abbr;

      state.minors.push({
        name: coName,
        abbr: coAbbr,
        color: coColor,
        homeHex: (count === 1 ? homeHex : ''),
        tokens,
        locationMechanism: mech,
        trainPurchaseTiming,
        minBid
      });
    }
    renderMinorsTable();
  }

  autosave();
  document.getElementById('companyWizard').style.display = 'none';
});

function renderPrivatesTable() {
  const tbody = document.getElementById('privatesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  state.privates.forEach((p, idx) => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #333';
    tr.innerHTML = `
      <td><input type="text" class="p-name" style="width:100%;" placeholder="Name"></td>
      <td><input type="number" class="p-cost" style="width:100%;"></td>
      <td><input type="number" class="p-rev" style="width:100%;"></td>
      <td><input type="text" class="p-ability" style="width:100%;" placeholder="Ability"></td>
      <td style="text-align:center;"><button class="table-btn delete-btn" style="background:#8b0000;">✕</button></td>
    `;
    const nInp = tr.querySelector('.p-name');
    const cInp = tr.querySelector('.p-cost');
    const rInp = tr.querySelector('.p-rev');
    const aInp = tr.querySelector('.p-ability');

    nInp.value = p.name || '';
    cInp.value = p.cost || 0;
    rInp.value = p.revenue || 0;
    aInp.value = p.ability || '';

    nInp.addEventListener('change', (e) => { state.privates[idx].name = e.target.value; autosave(); });
    cInp.addEventListener('change', (e) => { state.privates[idx].cost = parseInt(e.target.value) || 0; autosave(); });
    rInp.addEventListener('change', (e) => { state.privates[idx].revenue = parseInt(e.target.value) || 0; autosave(); });
    aInp.addEventListener('change', (e) => { state.privates[idx].ability = e.target.value; autosave(); });

    tr.querySelector('.delete-btn').addEventListener('click', () => {
      state.privates.splice(idx, 1);
      renderPrivatesTable();
      autosave();
    });
    tbody.appendChild(tr);
  });
}

function renderTerrainCostsTable() {
  const tbody = document.getElementById('terrainCostsTable');
  if (!tbody) return;
  tbody.innerHTML = '';
  Object.entries(state.terrainCosts).forEach(([terrain, cost]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-size:11px; color:#aaa; text-transform:capitalize; width:80px; padding:4px 0;">${terrain}</td>
      <td><input type="number" value="${cost}" style="width:100%;"></td>
    `;
    tr.querySelector('input').addEventListener('change', (e) => {
      state.terrainCosts[terrain] = parseInt(e.target.value) || 0;
      autosave();
    });
    tbody.appendChild(tr);
  });
}

document.getElementById('addPrivateBtn').addEventListener('click', () => {
  state.privates.push({ name: 'New Private', cost: 100, revenue: 20, ability: '' });
  renderPrivatesTable();
  autosave();
});
