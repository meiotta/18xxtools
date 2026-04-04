// ─── COMPANIES PANEL ──────────────────────────────────────────────────────────
// Right-panel Companies, Trains, Privates, and Config tabs.
// Load order: NINTH — after hex-panel.js.
//
// renderCompaniesTable()   — rebuilds the company rows from state.companies
// renderTrainsTable()      — rebuilds train rows from state.trains
// renderPrivatesTable()    — rebuilds private company rows from state.privates
// renderTerrainCostsTable()— rebuilds terrain cost editor from state.terrainCosts
// renderHomeCompanySelect()— syncs the home company <select> in the hex panel

function renderCompaniesTable() {
  const tbody = document.getElementById('companiesTableBody');
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
    inputs[0].addEventListener('change', (e) => { state.companies[idx].color    = e.target.value; autosave(); });
    inputs[1].addEventListener('change', (e) => { state.companies[idx].name     = e.target.value; autosave(); });
    inputs[2].addEventListener('change', (e) => { state.companies[idx].abbr     = e.target.value; autosave(); });
    inputs[3].addEventListener('change', (e) => { state.companies[idx].homeHex  = e.target.value; autosave(); });
    inputs[4].addEventListener('change', (e) => { state.companies[idx].parValue = parseInt(e.target.value) || 100; autosave(); });
    inputs[5].addEventListener('change', (e) => { state.companies[idx].tokens   = parseInt(e.target.value) || 5; autosave(); });
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
  state.companies.push({ name: '', abbr: '', color: '#ff0000', homeHex: '', parValue: 100, tokens: 5, floatPct: 60 });
  renderCompaniesTable();
  renderHomeCompanySelect();
  autosave();
});

// ── Trains ───────────────────────────────────────────────────────────────────

function renderTrainsTable() {
  const tbody = document.getElementById('trainsTableBody');
  tbody.innerHTML = '';
  state.trains.forEach((tr, idx) => {
    const row = document.createElement('tr');
    row.innerHTML = '<td><input type="text" class="tr-type" maxlength="3"></td><td><input type="number" class="tr-cost"></td><td><input type="number" class="tr-dist"></td><td><input type="text" class="tr-rust" maxlength="3"></td><td><input type="text" class="tr-obs" maxlength="3"></td><td><input type="number" class="tr-count"></td><td><button class="table-btn" style="background: #8b0000;">x</button></td>';
    const inputs = row.querySelectorAll('input');
    inputs[0].value = tr.type || '';
    inputs[1].value = tr.cost || 0;
    inputs[2].value = tr.distance || 0;
    inputs[3].value = tr.rustsOn || '';
    inputs[4].value = tr.obsoleteOn || '';
    inputs[5].value = tr.count || 0;
    inputs[0].addEventListener('change', (e) => { state.trains[idx].type       = e.target.value; autosave(); });
    inputs[1].addEventListener('change', (e) => { state.trains[idx].cost       = parseInt(e.target.value) || 0; autosave(); });
    inputs[2].addEventListener('change', (e) => { state.trains[idx].distance   = parseInt(e.target.value) || 0; autosave(); });
    inputs[3].addEventListener('change', (e) => { state.trains[idx].rustsOn    = e.target.value; autosave(); });
    inputs[4].addEventListener('change', (e) => { state.trains[idx].obsoleteOn = e.target.value; autosave(); });
    inputs[5].addEventListener('change', (e) => { state.trains[idx].count      = parseInt(e.target.value) || 0; autosave(); });
    row.querySelector('button').addEventListener('click', () => {
      state.trains.splice(idx, 1);
      renderTrainsTable();
      autosave();
    });
    tbody.appendChild(row);
  });
}

document.getElementById('addTrainBtn').addEventListener('click', () => {
  state.trains.push({ type: '', cost: 0, distance: 0, rustsOn: '', obsoleteOn: '', count: 0 });
  renderTrainsTable();
  autosave();
});

// ── Privates ─────────────────────────────────────────────────────────────────

function renderPrivatesTable() {
  const tbody = document.getElementById('privatesTableBody');
  tbody.innerHTML = '';
  state.privates.forEach((pr, idx) => {
    const row = document.createElement('tr');
    row.innerHTML = '<td><input type="text" class="pr-name"></td><td><input type="number" class="pr-cost"></td><td><input type="number" class="pr-rev"></td><td><input type="text" class="pr-ability"></td><td><button class="table-btn" style="background: #8b0000;">x</button></td>';
    const inputs = row.querySelectorAll('input');
    inputs[0].value = pr.name || '';
    inputs[1].value = pr.cost || 0;
    inputs[2].value = pr.revenue || 0;
    inputs[3].value = pr.ability || '';
    inputs[0].addEventListener('change', (e) => { state.privates[idx].name    = e.target.value; autosave(); });
    inputs[1].addEventListener('change', (e) => { state.privates[idx].cost    = parseInt(e.target.value) || 0; autosave(); });
    inputs[2].addEventListener('change', (e) => { state.privates[idx].revenue = parseInt(e.target.value) || 0; autosave(); });
    inputs[3].addEventListener('change', (e) => { state.privates[idx].ability = e.target.value; autosave(); });
    row.querySelector('button').addEventListener('click', () => {
      state.privates.splice(idx, 1);
      renderPrivatesTable();
      autosave();
    });
    tbody.appendChild(row);
  });
}

document.getElementById('addPrivateBtn').addEventListener('click', () => {
  state.privates.push({ name: '', cost: 0, revenue: 0, ability: '' });
  renderPrivatesTable();
  autosave();
});

// ── Config / Terrain Costs ───────────────────────────────────────────────────

function renderTerrainCostsTable() {
  const tbody = document.getElementById('terrainCostsTable');
  tbody.innerHTML = '';
  Object.keys(state.terrainCosts).forEach(terrain => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="text-transform: capitalize;">${terrain}</td><td><input type="number" class="terrain-cost-input"></td>`;
    const input = tr.querySelector('input');
    input.value = state.terrainCosts[terrain];
    input.addEventListener('change', (e) => {
      state.terrainCosts[terrain] = parseInt(e.target.value) || 0;
      buildPalette();
      render();
      autosave();
    });
    tbody.appendChild(tr);
  });
}

// ── Tab switching ─────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab + 'Tab').classList.add('active');
  });
});
