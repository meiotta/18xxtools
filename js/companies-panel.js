// ─── COMPANIES PANEL ──────────────────────────────────────────────────────────
// Right-panel Companies, Trains, Privates, and Config tabs.
// Load order: NINTH — after hex-panel.js.
//
// renderCompaniesTable()   — rebuilds the company rows from state.companies
// renderPrivatesCards()    — rebuilds private company cards from state.privates
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

// ── Ability System ────────────────────────────────────────────────────────────
// Structured ability definitions for private companies.
// ABILITY_DEFS maps tobymao ability type strings to display config.
// Each def has: label, category, fields[], suggest(ability) → string.
// Fields: { key, label, type: 'select'|'number'|'checkbox'|'tags'|'text', ... }
// 'tags' fields store string[] (comma-separated in UI, array in state).

// ── Buyer type / charter color ────────────────────────────────────────────────
// Colors copied directly from tobymao's g_1822 PRIVATE_GREEN/RED/BLUE constants
// and the g_1830 registered yellow. These are the canonical charter band colors.
// no_buy is NOT an ability here — it is expressed via buyerType: 'no_acquire'.
const BUYER_TYPES = {
  any:         { label: 'Any Corporation',      color: '#ffe600', textColor: '#1a1a1a' },
  major_minor: { label: 'Major / Minor',        color: '#90EE90', textColor: '#1a1a1a' },
  major_only:  { label: 'Major Only',           color: '#FF7276', textColor: '#1a1a1a' },
  no_acquire:  { label: 'Cannot Be Acquired',   color: '#89CFF0', textColor: '#1a1a1a' },
};

function buyerTypeColor(p) {
  return (BUYER_TYPES[p.buyerType] || BUYER_TYPES.any).color;
}

const ABILITY_CATEGORIES = [
  { label: 'Track & Terrain', types: ['tile_lay', 'tile_discount'] },
  { label: 'Tokens & Stations', types: ['token', 'teleport'] },
  { label: 'Blocking', types: ['blocks_hexes'] },
  { label: 'Corporate', types: ['exchange', 'shares'] },
  { label: 'Revenue', types: ['hex_bonus', 'train_discount'] },
  { label: 'Trains', types: ['grants_train'] },
  { label: 'Lifecycle', types: ['close'] },
  { label: 'Other', types: ['generic'] },
];

const ABILITY_DEFS = {
  tile_lay: {
    label: 'Tile Lay',
    fields: [
      { key: 'owner_type', label: 'Owner', type: 'select', options: ['corporation', 'player'], default: 'corporation' },
      { key: 'count', label: 'Uses', type: 'number', default: 1 },
      { key: 'free', label: 'Free of charge', type: 'checkbox', default: false },
      { key: 'closed_when_used_up', label: 'Closes when used', type: 'checkbox', default: true },
      { key: 'reachable', label: 'Must be reachable', type: 'checkbox', default: true },
      { key: 'hexes', label: 'Limit to hexes', type: 'tags', placeholder: 'e.g. B20, G15 — blank = any' },
      { key: 'tiles', label: 'Limit to tiles', type: 'tags', placeholder: 'e.g. 3, 4, 58 — blank = any' },
    ],
    suggest(a) {
      const who = a.owner_type === 'player' ? 'player' : 'owning corporation';
      const n   = a.count || 1;
      const fr  = a.free ? ', free of charge,' : '';
      const hx  = (a.hexes && a.hexes.length) ? ` on hexes ${a.hexes.join(', ')}` : '';
      const tl  = (a.tiles && a.tiles.length) ? ` using tiles ${a.tiles.join(', ')}` : '';
      const cl  = a.closed_when_used_up ? ' Closes when the power is used.' : '';
      return `Allows the ${who} to lay ${n} tile(s)${fr}${hx}${tl}.${cl}`;
    },
  },
  tile_discount: {
    label: 'Tile Discount',
    fields: [
      { key: 'owner_type', label: 'Owner', type: 'select', options: ['corporation', 'player'], default: 'corporation' },
      { key: 'discount', label: 'Discount', type: 'number', default: 20 },
      { key: 'terrain', label: 'Terrain', type: 'select', options: ['', 'mountain', 'hill', 'swamp', 'water', 'desert', 'forest'], default: '' },
      { key: 'hexes', label: 'Limit to hexes', type: 'tags', placeholder: 'blank = all terrain of that type' },
    ],
    suggest(a) {
      const terrain = a.terrain || 'all terrain';
      const hx = (a.hexes && a.hexes.length) ? ` (${a.hexes.join(', ')})` : '';
      return `Provides a $${a.discount || 0} discount on ${terrain} tile lays${hx}.`;
    },
  },
  token: {
    label: 'Token Placement',
    fields: [
      { key: 'owner_type', label: 'Owner', type: 'select', options: ['corporation', 'player'], default: 'corporation' },
      { key: 'price', label: 'Token cost', type: 'number', default: 0 },
      { key: 'count', label: 'Uses', type: 'number', default: 1 },
      { key: 'hexes', label: 'Limit to hexes', type: 'tags', placeholder: 'blank = any' },
    ],
    suggest(a) {
      const price = (a.price && a.price > 0) ? `for $${a.price}` : 'free of charge';
      const hx    = (a.hexes && a.hexes.length) ? ` in ${a.hexes.join(', ')}` : '';
      return `Allows the owning ${a.owner_type || 'corporation'} to place a station token${hx} ${price}.`;
    },
  },
  teleport: {
    label: 'Teleport (Token Without Route)',
    fields: [
      { key: 'owner_type', label: 'Owner', type: 'select', options: ['corporation', 'player'], default: 'corporation' },
      { key: 'hexes', label: 'Target hexes', type: 'tags', placeholder: 'e.g. F16' },
      { key: 'tiles', label: 'Required tile(s)', type: 'tags', placeholder: 'e.g. 57' },
    ],
    suggest(a) {
      const hx = (a.hexes && a.hexes.length) ? ` in ${a.hexes.join(', ')}` : '';
      return `The owning ${a.owner_type || 'corporation'} may place a tile and station token${hx} without needing a connected route.`;
    },
  },
  blocks_hexes: {
    label: 'Block Hexes',
    fields: [
      { key: 'owner_type', label: 'While owned by', type: 'select', options: ['player', 'corporation'], default: 'player' },
      { key: 'hexes', label: 'Blocked hexes', type: 'tags', placeholder: 'e.g. G15, B20' },
    ],
    suggest(a) {
      const hx = (a.hexes && a.hexes.length) ? a.hexes.join(', ') : '?';
      return `Blocks ${hx} while owned by a ${a.owner_type || 'player'}.`;
    },
  },
  exchange: {
    label: 'Exchange for Share',
    fields: [
      { key: 'owner_type', label: 'Owner', type: 'select', options: ['player', 'corporation'], default: 'player' },
      { key: 'corporations', label: 'Corporation(s)', type: 'tags', placeholder: 'e.g. NYC, PRR' },
      { key: 'when', label: 'When', type: 'text', placeholder: 'any, stock_round, …', default: 'any' },
      { key: 'from', label: 'From', type: 'tags', placeholder: 'ipo, market' },
    ],
    suggest(a) {
      const corps = (a.corporations && a.corporations.length) ? a.corporations.join('/') : '?';
      const from  = (a.from && a.from.length) ? ` from the ${a.from.join(' or ')}` : '';
      const when  = a.when ? ` during ${a.when}` : '';
      return `May be exchanged for a share of ${corps}${from}${when}.`;
    },
  },
  shares: {
    label: 'Grant Shares on Acquisition',
    fields: [
      { key: 'shares', label: 'Shares', type: 'tags', placeholder: 'e.g. PRR_1, B&O_0' },
    ],
    suggest(a) {
      const s = (a.shares && a.shares.length) ? a.shares.join(', ') : '?';
      return `The initial acquirer immediately receives: ${s}.`;
    },
  },
  hex_bonus: {
    label: 'Hex Revenue Bonus',
    fields: [
      { key: 'owner_type', label: 'Owner', type: 'select', options: ['corporation', 'player'], default: 'corporation' },
      { key: 'amount', label: 'Bonus amount', type: 'number', default: 10 },
      { key: 'hexes', label: 'Hexes', type: 'tags', placeholder: 'e.g. D12, F16' },
    ],
    suggest(a) {
      const hx = (a.hexes && a.hexes.length) ? ` through ${a.hexes.join(', ')}` : '';
      return `Routes${hx} earn a bonus of $${a.amount || 0}.`;
    },
  },
  train_discount: {
    label: 'Train Purchase Discount',
    fields: [
      { key: 'owner_type', label: 'Owner', type: 'select', options: ['corporation', 'player'], default: 'corporation' },
      { key: 'discount', label: 'Discount', type: 'number', default: 20 },
      { key: 'trains', label: 'Train types', type: 'tags', placeholder: 'e.g. 4, 5 — blank = all' },
    ],
    suggest(a) {
      const tr = (a.trains && a.trains.length) ? ` on ${a.trains.join('/')} trains` : '';
      return `Provides a $${a.discount || 0} discount${tr} when purchasing trains from the depot.`;
    },
  },
  grants_train: {
    label: 'Grants Train on Purchase',
    fields: [
      { key: 'trainKind', label: 'Train type', type: 'select',
        options: [
          { value: 'permanent', label: 'Permanent (e.g. 2P)' },
          { value: 'pullman',   label: 'Pullman (P)' },
          { value: 'local',     label: 'Local (L)' },
        ], default: 'permanent' },
      { key: 'distance', label: 'Distance (permanent only)', type: 'number', default: 2 },
    ],
    suggest(a) {
      if (a.trainKind === 'pullman') return 'When purchased by a corporation, grants a Pullman train. Closes when purchased.';
      if (a.trainKind === 'local')   return 'When purchased by a corporation, grants a permanent L-train. Closes when purchased.';
      return `When purchased by a corporation, grants a permanent ${a.distance || 2}-train. Closes when purchased.`;
    },
  },
  close: {
    label: 'Custom Close Condition',
    fields: [
      { key: 'when', label: 'Closes when', type: 'select', options: ['bought_train', 'sold', 'never', 'operated', 'par'], default: 'bought_train' },
      { key: 'corporation', label: 'Corporation (if bought_train)', type: 'text', placeholder: 'e.g. B&O — blank = any corp' },
    ],
    suggest(a) {
      if (a.when === 'never')       return 'Never auto-closes.';
      if (a.when === 'sold')        return 'Closes immediately when sold to a corporation.';
      if (a.when === 'operated')    return 'Closes after the owning corporation first operates.';
      if (a.when === 'par')         return 'Closes when the owning corporation is parred.';
      if (a.when === 'bought_train') {
        return a.corporation
          ? `Closes when ${a.corporation} purchases its first train.`
          : 'Closes when the owning corporation purchases its first train.';
      }
      return `Closes when: ${a.when}.`;
    },
  },
  generic: {
    label: 'Generic / Custom',
    fields: [
      { key: 'desc', label: 'Description', type: 'textarea', placeholder: 'Describe the ability in plain text…' },
    ],
    suggest(a) { return a.desc || ''; },
  },
};

// ── Linked-train helpers ──────────────────────────────────────────────────────
// Returns the display label for a grants_train ability (e.g. '2P', 'P', 'L').
function trainKindLabel(kind, distance) {
  if (kind === 'pullman') return 'P';
  if (kind === 'local')   return 'L';
  return (distance || 2) + 'P'; // permanent
}

// Syncs a linked train's label and distance after a grants_train field change.
function syncLinkedTrain(ability) {
  if (!ability || !ability.linkedTrainId) return;
  const train = (state.trains || []).find(t => t.id === ability.linkedTrainId);
  if (!train) return;
  const kind = ability.trainKind || 'permanent';
  const dist = parseInt(ability.distance) || 2;
  train.label = trainKindLabel(kind, dist);
  train.n     = (kind === 'pullman' || kind === 'local') ? 0 : dist;
  if (typeof renderTrainsTable === 'function') renderTrainsTable();
}

// Selected private index for the master-detail panel (null = nothing selected)
let _selectedPrivateIdx = null;

// Generate a suggested description from all configured abilities on a private
function suggestDescription(p) {
  if (!p.abilities || !p.abilities.length) return '';
  return p.abilities
    .map(a => { const def = ABILITY_DEFS[a.type]; return def ? def.suggest(a) : ''; })
    .filter(Boolean)
    .join(' ');
}

function buildAbilityPickerHTML() {
  return ABILITY_CATEGORIES.map(cat => {
    const btns = cat.types
      .map(t => ABILITY_DEFS[t] ? `<button class="pc-pick-type" data-type="${t}">${ABILITY_DEFS[t].label}</button>` : '')
      .join('');
    return `<div class="pc-pick-category">
      <div class="pc-pick-cat-label">${cat.label}</div>
      <div class="pc-pick-items">${btns}</div>
    </div>`;
  }).join('');
}


// ── Private Company Master-Detail ─────────────────────────────────────────────
// Layout: left rail (list) + right detail editor.
// _selectedPrivateIdx tracks which company is open in the editor.
//
// Phase strip semantics:
//   p.closesOn = phase name string — the FIRST phase the company is inactive in.
//   Clicking an active pill → that pill becomes first inactive (closes before it).
//   Clicking the close-point pill → clears closesOn (never auto-closes).

// ── Phase strip ───────────────────────────────────────────────────────────────
function buildPhaseStripHTML(p) {
  const phases = state.phases || [];

  if (phases.length === 0) {
    // Ghost reference: closesOn set but no phases exist
    if (p.closesOn) {
      return `
        <div class="pc-strip-label">Active phases</div>
        <div class="pc-strip-pills">
          <span class="pc-phase-pill pc-phase-ghost" title="Phase '${p.closesOn}' referenced but no phases defined">${p.closesOn}?</span>
        </div>`;
    }
    return `
      <div class="pc-strip-label">Active phases</div>
      <div class="pc-strip-empty">No phases defined — set them in Trains &amp; Phases</div>`;
  }

  const closesOn = p.closesOn || null;
  let pastClose = false;
  const pills = phases.map(ph => {
    const name = ph.name || '?';
    const isClosePoint = (name === closesOn);
    const bgColor = ph.color || '#4a7fa5';

    if (isClosePoint) {
      pastClose = true;
      // close-boundary pill: dashed border, ⊘ prefix via CSS ::before
      return `<span class="pc-phase-pill pc-phase-closes" data-phase="${name}" title="Closes when phase ${name} starts — click to clear">${name}</span>`;
    }
    if (pastClose) {
      return `<span class="pc-phase-pill pc-phase-inactive" data-phase="${name}" title="Company closed — click to move close point here">${name}</span>`;
    }
    return `<span class="pc-phase-pill pc-phase-active" data-phase="${name}" style="background:${bgColor};" title="Active — click to close before this phase">${name}</span>`;
  });

  // Ghost pill: closesOn references a phase name not in state.phases
  let ghostPill = '';
  if (closesOn && !phases.find(ph => ph.name === closesOn)) {
    ghostPill = `<span class="pc-phase-pill pc-phase-ghost" title="Phase '${closesOn}' not defined yet">${closesOn}?</span>`;
  }

  const neverBadge = !closesOn
    ? `<span class="pc-strip-never" title="Never auto-closes">∞ never</span>`
    : '';

  return `
    <div class="pc-strip-label">Active phases</div>
    <div class="pc-strip-pills">${pills.join('')}${ghostPill}${neverBadge}</div>`;
}

// ── Master-detail entry point ─────────────────────────────────────────────────
// Called whenever the privates list or selection changes.
function renderPrivatesSection() {
  const wrap = document.getElementById('corpPrivatesSection');
  if (!wrap) return;

  // Guard: clamp selection to valid range
  if (_selectedPrivateIdx !== null && _selectedPrivateIdx >= state.privates.length) {
    _selectedPrivateIdx = state.privates.length ? state.privates.length - 1 : null;
  }

  wrap.innerHTML = '';

  // ── Left rail ─────────────────────────────────────────────────────────────
  const rail = document.createElement('div');
  rail.className = 'pc-rail';

  const itemsWrap = document.createElement('div');
  itemsWrap.className = 'pc-rail-items';

  state.privates.forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = 'pc-rail-item' + (idx === _selectedPrivateIdx ? ' active' : '');
    item.dataset.idx = idx;
    const dotColor = buyerTypeColor(p);
    const sym      = `P${idx + 1}`;
    const name     = escHtml(p.name || 'Unnamed');
    const isConc   = (p.companyType || 'private') === 'concession';
    const hasGameRbAbilities = !p.abilities?.length && p.ability;
    item.innerHTML = `
      <span class="pc-rail-dot" style="background:${dotColor};"></span>
      <div class="pc-rail-text">
        <span class="pc-rail-sym">${sym}</span>
        ${isConc ? `<span class="pc-rail-type-badge pc-rail-conc-badge">C</span>` : ''}
        <span class="pc-rail-name">${name}</span>
        ${isConc && p.linkedMajor ? `<span class="pc-rail-linked-major">${escHtml(p.linkedMajor)}</span>` : ''}
        ${hasGameRbAbilities ? `<span class="co-warn-badge" title="Abilities may be defined in game.rb — not imported">⚠</span>` : ''}
      </div>`;
    item.addEventListener('click', () => {
      _selectedPrivateIdx = idx;
      renderPrivatesSection();
    });
    itemsWrap.appendChild(item);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'pc-rail-add';
  addBtn.textContent = '+ Add Private';
  addBtn.addEventListener('click', () => {
    state.privates.push({ name: '', buyerType: 'any', cost: 0, revenue: 0, ability: '', closesOn: null, abilities: [] });
    _selectedPrivateIdx = state.privates.length - 1;
    renderPrivatesSection();
    autosave();
  });

  rail.appendChild(itemsWrap);
  rail.appendChild(addBtn);
  wrap.appendChild(rail);

  // ── Right detail panel ────────────────────────────────────────────────────
  const detail = document.createElement('div');
  detail.className = 'pc-detail-wrap';

  if (_selectedPrivateIdx === null || !state.privates.length) {
    detail.innerHTML = `<div class="pc-detail-empty">
      <span>Select a private company from the list</span>
      <span class="pc-detail-empty-sub">or click + Add Private to create one</span>
    </div>`;
  } else {
    detail.appendChild(buildPrivateDetailEl(_selectedPrivateIdx));
  }

  wrap.appendChild(detail);
}

// Convenience alias so io.js / setup.js / trains-panel.js calls still work
function renderPrivatesCards() { renderPrivatesSection(); }

// ── Detail editor element ─────────────────────────────────────────────────────
function buildPrivateDetailEl(idx) {
  const p = state.privates[idx];
  if (!p.abilities) p.abilities = [];
  const abCount = p.abilities.length;

  const el = document.createElement('div');
  el.className = 'pc-detail-editor';

  const currentType   = p.companyType || 'private';
  const btKey         = p.buyerType || 'any';
  const btData        = BUYER_TYPES[btKey] || BUYER_TYPES.any;
  const btOptionsHTML = Object.entries(BUYER_TYPES).map(([k, v]) =>
    `<option value="${k}"${k === btKey ? ' selected' : ''}>${v.label}</option>`
  ).join('');
  const majorSyms     = _allMajorSyms();
  const majorDatalist = majorSyms.map(s => `<option value="${s}">`).join('');

  el.innerHTML = `
    <div class="pc-charter-band" style="background:${btData.color}; color:${btData.textColor};">
      <span class="pc-charter-sym">P${idx + 1}</span>
      <div class="pc-type-toggle">
        <button type="button" class="pc-type-pill${currentType === 'private'     ? ' active' : ''}" data-ptype="private">Private</button>
        <button type="button" class="pc-type-pill${currentType === 'concession'  ? ' active' : ''}" data-ptype="concession">Concession</button>
      </div>
      <select class="pc-buyer-sel">${btOptionsHTML}</select>
    </div>
    <div class="pc-det-header">
      <input type="text" class="pc-det-name" placeholder="Name" value="${escHtml(p.name || '')}">
      <button class="pc-det-delete" title="Delete this private">Delete</button>
    </div>

    <div class="pc-det-section pc-det-financials">
      <div class="pc-det-field">
        <label class="pc-det-label">Face value</label>
        <div class="pc-det-money">$<input type="number" class="pc-det-cost"    min="0" value="${p.cost    || 0}"></div>
      </div>
      <div class="pc-det-field">
        <label class="pc-det-label">Revenue / OR</label>
        <div class="pc-det-money">$<input type="number" class="pc-det-revenue" min="0" value="${p.revenue || 0}"></div>
      </div>
      <div class="pc-det-field">
        <label class="pc-det-label">Auction tier</label>
        <input type="number" class="pc-det-auction-row" min="1" max="9"
          placeholder="—" value="${p.auctionRow != null ? p.auctionRow : ''}"
          title="auction_row: groups companies into tiers (1828-style tiered waterfall). Leave blank for default single-row.">
        <span class="pc-field-hint">Tier / row (tiered waterfall only)</span>
      </div>
    </div>

    ${currentType === 'concession' ? `
    <div class="pc-det-section pc-concession-section">
      <div class="pc-det-section-title">Concession link
        <span class="pc-det-hint">Winning bidder receives the right to par the linked major.</span>
      </div>
      <div class="pc-concession-fields">
        <div class="pc-concession-field">
          <label class="pc-det-label">Unlocks major</label>
          <input type="text" class="pc-det-linked-major" list="pc-major-syms-${idx}"
            placeholder="e.g. GWR" value="${escHtml(p.linkedMajor || '')}">
          <datalist id="pc-major-syms-${idx}">${majorDatalist}</datalist>
        </div>
        <div class="pc-concession-field">
          <label class="pc-det-label">Blocks hexes</label>
          <input type="text" class="pc-det-blocks-hexes"
            placeholder="e.g. M36 N39" value="${escHtml((p.blocksHexes || []).join(' '))}">
          <span class="pc-field-hint">While player-owned</span>
        </div>
        <div class="pc-concession-field pc-concession-field-sm">
          <label class="pc-det-label">Min bid +$</label>
          <input type="number" class="pc-det-min-bid-adj" min="0"
            value="${p.minBidAdjust || 0}"
            title="Extra amount added to face value as minimum bid (e.g. 100 for 1822MX C1)">
          <span class="pc-field-hint">Above face value</span>
        </div>
      </div>
    </div>` : ''}

    <div class="pc-det-section">
      <div class="pc-det-section-hd">
        <span class="pc-det-section-title">Abilities${abCount ? ` <span class="pc-ab-badge">${abCount}</span>` : ''}</span>
      </div>
      <div class="pc-ability-list pc-det-ability-list"></div>
      <div class="pc-add-ability-bar">
        <button class="pc-add-ability-btn">+ Add ability</button>
        <div class="pc-ability-picker" style="display:none;">${buildAbilityPickerHTML()}</div>
      </div>
    </div>

    <div class="pc-det-section">
      <div class="pc-det-section-hd">
        <span class="pc-det-section-title">Description</span>
        <button class="pc-suggest-btn"${!abCount ? ' disabled' : ''} title="Generate from configured abilities">↺ Suggest from abilities</button>
      </div>
      <textarea class="pc-desc pc-det-desc" placeholder="Free-text description of what this company does…">${escHtml(p.ability || '')}</textarea>
    </div>

    <div class="pc-det-section">
      <div class="pc-det-section-title">Active phases</div>
      <div class="pc-phase-strip pc-det-phase-strip">${buildPhaseStripHTML(p)}</div>
    </div>
  `;

  // Render ability chips into the list slot
  el.querySelector('.pc-det-ability-list').innerHTML = buildAbilitiesListHTML(p, idx);

  // ── field listeners ────────────────────────────────────────────────────────
  el.querySelector('.pc-buyer-sel').addEventListener('change', e => {
    state.privates[idx].buyerType = e.target.value;
    autosave();
    // Update charter band color live
    const bd  = BUYER_TYPES[e.target.value] || BUYER_TYPES.any;
    const band = el.querySelector('.pc-charter-band');
    if (band) { band.style.background = bd.color; band.style.color = bd.textColor; }
    // Update rail dot color live
    const dot = document.querySelector(`.pc-rail-item[data-idx="${idx}"] .pc-rail-dot`);
    if (dot) dot.style.background = bd.color;
  });
  el.querySelector('.pc-det-name').addEventListener('change', e => {
    state.privates[idx].name = e.target.value; autosave();
    const railItem = document.querySelector(`.pc-rail-item:nth-child(${idx + 1}) .pc-rail-name`);
    if (railItem) railItem.textContent = state.privates[idx].name || 'Unnamed';
  });
  el.querySelector('.pc-det-cost').addEventListener('change',    e => { state.privates[idx].cost    = parseInt(e.target.value) || 0; autosave(); });
  el.querySelector('.pc-det-revenue').addEventListener('change', e => { state.privates[idx].revenue = parseInt(e.target.value) || 0; autosave(); });
  el.querySelector('.pc-det-auction-row').addEventListener('change', e => {
    const v = e.target.value.trim();
    state.privates[idx].auctionRow = v === '' ? null : (parseInt(v) || null);
    autosave();
  });
  el.querySelector('.pc-desc').addEventListener('change',        e => { state.privates[idx].ability = e.target.value; autosave(); });

  // ── Company type toggle (Private | Concession) ─────────────────────────────
  el.querySelectorAll('.pc-type-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      state.privates[idx].companyType = btn.dataset.ptype;
      autosave();
      renderPrivatesSection(); // re-render to show/hide concession section
    });
  });

  // ── Concession-specific fields ─────────────────────────────────────────────
  const linkedMajorEl = el.querySelector('.pc-det-linked-major');
  if (linkedMajorEl) {
    linkedMajorEl.addEventListener('change', e => {
      state.privates[idx].linkedMajor = e.target.value.trim().toUpperCase() || null;
      autosave();
      // Update the linked-major label in the rail without full re-render
      const railItem = document.querySelector(`.pc-rail-item[data-idx="${idx}"]`);
      if (railItem) {
        let lbl = railItem.querySelector('.pc-rail-linked-major');
        const val = state.privates[idx].linkedMajor;
        if (val) {
          if (!lbl) { lbl = document.createElement('span'); lbl.className = 'pc-rail-linked-major'; railItem.querySelector('.pc-rail-text').appendChild(lbl); }
          lbl.textContent = val;
        } else if (lbl) lbl.remove();
      }
    });
  }
  const blocksHexesEl = el.querySelector('.pc-det-blocks-hexes');
  if (blocksHexesEl) {
    blocksHexesEl.addEventListener('change', e => {
      state.privates[idx].blocksHexes = e.target.value.trim().split(/\s+/).filter(Boolean);
      autosave();
    });
  }
  const minBidAdjEl = el.querySelector('.pc-det-min-bid-adj');
  if (minBidAdjEl) {
    minBidAdjEl.addEventListener('change', e => {
      state.privates[idx].minBidAdjust = parseInt(e.target.value) || 0;
      autosave();
    });
  }

  el.querySelector('.pc-det-delete').addEventListener('click', () => {
    state.privates.splice(idx, 1);
    _selectedPrivateIdx = state.privates.length ? Math.min(idx, state.privates.length - 1) : null;
    renderPrivatesSection();
    autosave();
  });

  // ── suggest ────────────────────────────────────────────────────────────────
  el.querySelector('.pc-suggest-btn').addEventListener('click', () => {
    const text = suggestDescription(p);
    if (!text) return;
    state.privates[idx].ability = text;
    el.querySelector('.pc-desc').value = text;
    autosave();
  });

  // ── ability field changes (no full re-render — preserves focus) ───────────
  el.querySelectorAll('.pc-ab-f').forEach(field => {
    const ai      = parseInt(field.dataset.ai);
    const key     = field.dataset.key;
    const ability = state.privates[idx].abilities[ai];
    if (!ability) return;
    const fDef = (ABILITY_DEFS[ability.type] && ABILITY_DEFS[ability.type].fields || []).find(f => f.key === key);
    field.addEventListener('change', () => {
      let val = field.value;
      if (field.type === 'checkbox')           val = field.checked;
      else if (fDef && fDef.type === 'number') val = parseFloat(val) || 0;
      else if (fDef && fDef.type === 'tags')   val = val.split(',').map(s => s.trim()).filter(Boolean);
      state.privates[idx].abilities[ai][key] = val;
      // Keep linked train in sync when grants_train fields change
      if (ability.type === 'grants_train') syncLinkedTrain(state.privates[idx].abilities[ai]);
      autosave();
    });
  });

  // ── remove ability ─────────────────────────────────────────────────────────
  el.querySelectorAll('.pc-ability-rm').forEach(btn => {
    btn.addEventListener('click', () => {
      const ai      = parseInt(btn.dataset.ai);
      const ability = state.privates[idx].abilities[ai];
      // grants_train: remove the linked train from the roster when ability is removed
      if (ability && ability.type === 'grants_train' && ability.linkedTrainId) {
        const ti = (state.trains || []).findIndex(t => t.id === ability.linkedTrainId);
        if (ti !== -1) {
          state.trains.splice(ti, 1);
          if (typeof renderTrainsTable === 'function') renderTrainsTable();
        }
      }
      state.privates[idx].abilities.splice(ai, 1);
      autosave();
      renderPrivatesSection();
    });
  });

  // ── + Add ability picker ───────────────────────────────────────────────────
  const addAbBtn = el.querySelector('.pc-add-ability-btn');
  const picker   = el.querySelector('.pc-ability-picker');
  if (addAbBtn && picker) {
    addAbBtn.addEventListener('click', e => {
      e.stopPropagation();
      const showing = picker.style.display !== 'none';
      picker.style.display = showing ? 'none' : 'block';
      addAbBtn.classList.toggle('active', !showing);
    });
    picker.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', function closePicker() {
      picker.style.display = 'none';
      addAbBtn.classList.remove('active');
    }, { once: true });
    el.querySelectorAll('.pc-pick-type').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const type = btn.dataset.type;
        const def  = ABILITY_DEFS[type];
        if (!def) return;
        const newAbility = { type };
        def.fields.forEach(f => {
          const defVal = typeof f.default !== 'undefined' ? f.default : '';
          newAbility[f.key] = f.type === 'tags' ? [] : defVal;
        });
        // grants_train: auto-create a linked train in the roster
        if (type === 'grants_train') {
          const linkedId = 'lt_' + Math.random().toString(36).substr(2, 6);
          newAbility.linkedTrainId = linkedId;
          if (!state.trains) state.trains = [];
          state.trains.push({
            id:               linkedId,
            distType:         'n',
            n:                newAbility.distance || 2,
            cost:             0,
            count:            1,
            rusts:            false,
            phase:            '',
            label:            trainKindLabel(newAbility.trainKind || 'permanent', newAbility.distance || 2),
            linkedPrivateIdx: idx,
          });
        }
        state.privates[idx].abilities.push(newAbility);
        autosave();
        renderPrivatesSection();
        if (type === 'grants_train' && typeof renderTrainsTable === 'function') renderTrainsTable();
      });
    });
  }

  // ── phase strip interaction ────────────────────────────────────────────────
  el.querySelectorAll('.pc-phase-pill[data-phase]').forEach(pill => {
    pill.addEventListener('click', () => {
      const pr = state.privates[idx];
      pr.closesOn = pill.classList.contains('pc-phase-closes') ? null : pill.dataset.phase;
      autosave();
      renderPrivatesSection();
    });
  });

  return el;
}

// Renders ability chips HTML for the detail panel's ability list slot
// (picker HTML is now generated separately and inlined in buildPrivateDetailEl)
function buildAbilitiesListHTML(p, idx) {
  const abilities = p.abilities || [];
  if (!abilities.length) {
    return `<div class="pc-no-abilities">No abilities configured — click + Add ability below</div>`;
  }
  return abilities.map((a, ai) => {
    const def = ABILITY_DEFS[a.type];
    const typeLabel = def ? def.label : a.type;
    const fields = def ? def.fields.map(f => {
      const v = a[f.key];
      let ctrl = '';
      if (f.type === 'select') {
        const opts = f.options.map(o => {
          const oval = typeof o === 'object' ? o.value : o;
          const olbl = typeof o === 'object' ? o.label : (o || '(any)');
          return `<option value="${escHtml(oval)}"${v === oval ? ' selected' : ''}>${escHtml(olbl)}</option>`;
        }).join('');
        ctrl = `<select class="pc-ab-f" data-ai="${ai}" data-key="${f.key}">${opts}</select>`;
      } else if (f.type === 'checkbox') {
        ctrl = `<input type="checkbox" class="pc-ab-f" data-ai="${ai}" data-key="${f.key}"${v ? ' checked' : ''}>`;
      } else if (f.type === 'number') {
        ctrl = `<input type="number" class="pc-ab-f" data-ai="${ai}" data-key="${f.key}" value="${v !== undefined ? v : (f.default || 0)}">`;
      } else if (f.type === 'tags') {
        const tv = Array.isArray(v) ? v.join(', ') : (v || '');
        ctrl = `<input type="text" class="pc-ab-f" data-ai="${ai}" data-key="${f.key}" value="${escHtml(tv)}" placeholder="${escHtml(f.placeholder || '')}">`;
      } else if (f.type === 'textarea') {
        ctrl = `<textarea class="pc-ab-f pc-ab-textarea" data-ai="${ai}" data-key="${f.key}" placeholder="${escHtml(f.placeholder || '')}">${escHtml(v || '')}</textarea>`;
      } else {
        ctrl = `<input type="text" class="pc-ab-f" data-ai="${ai}" data-key="${f.key}" value="${escHtml(v || '')}" placeholder="${escHtml(f.placeholder || '')}">`;
      }
      return `<div class="pc-ab-row"><label class="pc-ab-lbl">${f.label}</label>${ctrl}</div>`;
    }).join('') : '';
    return `<div class="pc-ability-chip">
      <div class="pc-ability-chip-hd">
        <span class="pc-ability-type">${typeLabel}</span>
        <button class="pc-ability-rm" data-ai="${ai}" title="Remove">×</button>
      </div>
      ${fields ? `<div class="pc-ability-fields">${fields}</div>` : ''}
    </div>`;
  }).join('');
}

// Minimal HTML-escaping for inline values
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
  state.privates.push({ name: '', buyerType: 'any', cost: 0, revenue: 0, ability: '', closesOn: null, abilities: [] });
  _selectedPrivateIdx = state.privates.length - 1;
  renderPrivatesSection();
  autosave();
});

// ═══════════════════════════════════════════════════════════════════════════════
// CORPORATION PACK SYSTEM
// Pack = shared defaults for a group of corporations (e.g. all Majors).
// Individual companies inherit pack values but can override specific fields.
// ═══════════════════════════════════════════════════════════════════════════════

const CORP_TYPES = [
  { value: 'major',    label: 'Major' },
  { value: 'minor',    label: 'Minor' },
  { value: 'coal',     label: 'Coal' },
  { value: 'national', label: 'National' },
  { value: 'system',   label: 'System' },
  { value: 'public',   label: 'Public' },
  { value: 'custom',   label: 'Custom' },
];

// Smart defaults per type — derived from the 14-game research sample
const CORP_TYPE_DEFAULTS = {
  major:    { floatPct: 60,  maxOwnershipPct: 60,  capitalization: 'full',        alwaysMarketPrice: false, shares: [20,10,10,10,10,10,10,10,10], tokens: [0,40,100] },
  minor:    { floatPct: 100, maxOwnershipPct: 100, capitalization: 'incremental', alwaysMarketPrice: true,  shares: [100],                         tokens: [0] },
  coal:     { floatPct: 100, maxOwnershipPct: 100, capitalization: 'full',        alwaysMarketPrice: true,  shares: [100],                         tokens: [0] },
  national: { floatPct: 0,   maxOwnershipPct: 100, capitalization: 'full',        alwaysMarketPrice: true,  shares: [10,10,10,10,10,10,10,10,10,10], tokens: [] },
  system:   { floatPct: 20,  maxOwnershipPct: 100, capitalization: 'full',        alwaysMarketPrice: true,  shares: [20,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5], tokens: [0,20,20,20] },
  public:   { floatPct: 20,  maxOwnershipPct: 100, capitalization: 'full',        alwaysMarketPrice: true,  shares: [20,10,10,10,10,10,10,10,10], tokens: [0,20,20,20] },
  custom:   { floatPct: 60,  maxOwnershipPct: 100, capitalization: 'full',        alwaysMarketPrice: false, shares: [10,10,10,10,10,10,10,10,10,10], tokens: [0,40] },
};

// ── 18xx corporation colors (sourced from 18USA + common engine palette) ──────
const CORP_COLORS = [
  { name: 'Black',       hex: '#1a1a1a', text: '#ffffff' },
  { name: 'Brown',       hex: '#7B3B00', text: '#ffffff' },
  { name: 'Crimson',     hex: '#B01020', text: '#ffffff' },
  { name: 'DarkBlue',    hex: '#003080', text: '#ffffff' },
  { name: 'DarkGreen',   hex: '#1A5C1A', text: '#ffffff' },
  { name: 'DarkRed',     hex: '#8B0000', text: '#ffffff' },
  { name: 'ForestGreen', hex: '#228B22', text: '#ffffff' },
  { name: 'Gold',        hex: '#CFB53B', text: '#000000' },
  { name: 'Gray',        hex: '#808080', text: '#ffffff' },
  { name: 'Indigo',      hex: '#4B0082', text: '#ffffff' },
  { name: 'LightBlue',   hex: '#5B9BD5', text: '#000000' },
  { name: 'Lime',        hex: '#5EA830', text: '#000000' },
  { name: 'Maroon',      hex: '#800000', text: '#ffffff' },
  { name: 'Navy',        hex: '#001F5B', text: '#ffffff' },
  { name: 'Orange',      hex: '#D46000', text: '#ffffff' },
  { name: 'Pink',        hex: '#C85080', text: '#ffffff' },
  { name: 'Purple',      hex: '#800080', text: '#ffffff' },
  { name: 'Red',         hex: '#CC1010', text: '#ffffff' },
  { name: 'Sienna',      hex: '#A0522D', text: '#ffffff' },
  { name: 'SteelBlue',   hex: '#4682B4', text: '#ffffff' },
  { name: 'Tan',         hex: '#C8A060', text: '#000000' },
  { name: 'Teal',        hex: '#007070', text: '#ffffff' },
  { name: 'White',       hex: '#F4F4F4', text: '#000000' },
  { name: 'Yellow',      hex: '#D4B800', text: '#000000' },
];

const TEXT_COLORS = [
  { name: 'White',  hex: '#ffffff' },
  { name: 'Black',  hex: '#000000' },
  { name: 'Gold',   hex: '#CFB53B' },
  { name: 'Silver', hex: '#C0C0C0' },
];

// ── Color chip picker helpers ─────────────────────────────────────────────────

function _buildColorPickerHTML(currentHex, prefix, colors) {
  const arr  = colors || CORP_COLORS;
  const norm = (currentHex || '').toLowerCase();
  const chips = arr.map(c => {
    const sel = norm === c.hex.toLowerCase();
    return `<button type="button" class="cp-color-chip" data-color="${c.hex}" title="${c.name}" style="background:${c.hex};${sel ? 'box-shadow:0 0 0 2px #fff,0 0 0 4px rgba(0,0,0,0.6);' : ''}"></button>`;
  }).join('');
  const display = currentHex || '#336699';
  return `<div class="cp-color-pick-wrap">
    <button type="button" class="cp-color-trigger cp-${prefix}-trigger" style="background:${display};" title="${display}"></button>
    <div class="cp-color-popout cp-${prefix}-popout">
      <div class="cp-color-grid">${chips}</div>
    </div>
  </div>`;
}

function _wireColorPicker(container, prefix, onChange) {
  const trigger = container.querySelector('.cp-' + prefix + '-trigger');
  const popout  = container.querySelector('.cp-' + prefix + '-popout');
  if (!trigger || !popout) return;

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = popout.classList.contains('cp-color-open');
    // Close every other open picker on the page
    document.querySelectorAll('.cp-color-popout.cp-color-open').forEach(p => p.classList.remove('cp-color-open'));
    if (!isOpen) popout.classList.add('cp-color-open');
  });

  popout.addEventListener('click', e => e.stopPropagation());

  popout.querySelectorAll('.cp-color-chip').forEach(chip => {
    chip.addEventListener('click', e => {
      e.stopPropagation();
      const hex = chip.dataset.color;
      trigger.style.background = hex;
      trigger.title = hex;
      popout.querySelectorAll('.cp-color-chip').forEach(c => c.style.boxShadow = '');
      chip.style.boxShadow = '0 0 0 2px #fff,0 0 0 4px rgba(0,0,0,0.6)';
      popout.classList.remove('cp-color-open');
      onChange(hex);
    });
  });

  document.addEventListener('click', () => popout.classList.remove('cp-color-open'));
}

// ── Selection state ───────────────────────────────────────────────────────────
let _selectedPackIdx   = null;  // index into state.corpPacks
let _selectedCompanyId = null;  // company.id (null = pack settings selected)

// ── Helpers ───────────────────────────────────────────────────────────────────
function _cpRandId(prefix) {
  return prefix + '_' + Math.random().toString(36).substr(2, 7);
}

function _packDefaults(type) {
  return Object.assign({}, CORP_TYPE_DEFAULTS[type] || CORP_TYPE_DEFAULTS.custom);
}

// Returns all major corporation syms defined across all packs (used for dropdowns / datalists).
function _allMajorSyms() {
  const syms = [];
  (state.corpPacks || []).forEach(pk => {
    if (pk.type === 'major') {
      (pk.companies || []).forEach(co => { if (co.sym) syms.push(co.sym); });
    }
  });
  return syms;
}

// Returns company field value: override if set, else pack default
function _effective(pack, company, field) {
  const ov = company[field + 'Override'];
  return (ov !== undefined && ov !== null) ? ov : pack[field];
}

// Find a company across all packs by id
function _findCompany(id) {
  for (let pi = 0; pi < state.corpPacks.length; pi++) {
    const pack = state.corpPacks[pi];
    const ci = (pack.companies || []).findIndex(c => c.id === id);
    if (ci !== -1) return { pack, pi, company: pack.companies[ci], ci };
  }
  return null;
}

// ── Token editor HTML ─────────────────────────────────────────────────────────
function _buildTokenEditorHTML(tokens, prefix) {
  const arr = tokens || [];
  const slots = arr.map((cost, ti) => {
    const isFree = cost === 0;
    return `<div class="cp-token-slot">
      <div class="cp-token-slot-icon"></div>
      <div class="cp-token-slot-body">
        <span class="cp-token-slot-num">Slot ${ti + 1}</span>
        <div class="cp-token-slot-cost">
          <span class="cp-token-dollar">$</span>
          <input type="number" class="cp-token-cost" data-prefix="${prefix}" data-ti="${ti}" value="${cost}" min="0">
        </div>
        ${isFree ? '<span class="cp-token-free-badge">Free</span>' : ''}
      </div>
      <button class="cp-token-rm" data-prefix="${prefix}" data-ti="${ti}" title="Remove slot">×</button>
    </div>`;
  }).join('');
  return `<div class="cp-token-editor" data-prefix="${prefix}">
    <div class="cp-token-slots">${slots}</div>
    <button class="cp-token-add" data-prefix="${prefix}">+ Add slot</button>
  </div>`;
}

// ── Share template editor HTML ────────────────────────────────────────────────
function _buildShareEditorHTML(shares, prefix) {
  const arr   = shares || [];
  const total = arr.reduce((a, b) => a + b, 0);
  const ok    = total === 100;

  // Visual proportions bar — each segment width proportional to share value
  const barSegs = arr.map((pct, si) => {
    const w = total > 0 ? ((pct / total) * 100).toFixed(2) : 0;
    const hue = (si * 47) % 360;
    return `<div class="cp-share-seg" style="width:${w}%;background:hsl(${hue},55%,42%);" title="${pct}%"></div>`;
  }).join('');

  const chips = arr.map((pct, si) =>
    `<div class="cp-share-chip">
      <input type="number" class="cp-share-input" data-prefix="${prefix}" data-si="${si}" value="${pct}" min="1" max="100">
      <span class="cp-share-pct-label">%</span>
      <button class="cp-share-rm cp-share-rm-btn" data-prefix="${prefix}" data-si="${si}" title="Remove">×</button>
    </div>`
  ).join('');

  return `<div class="cp-share-editor" data-prefix="${prefix}">
    <div class="cp-share-chips">${chips}
      <button class="cp-share-add" data-prefix="${prefix}" title="Add share">+ Share</button>
    </div>
    <div class="cp-share-bar-wrap"><div class="cp-share-bar">${barSegs}</div></div>
    <div class="cp-share-footer">
      <span class="cp-share-total ${ok ? 'cp-share-ok' : 'cp-share-warn'}">
        ${ok ? '✓' : '⚠'} ${total}%
      </span>
      ${!ok ? `<span class="cp-share-diff">${total < 100 ? '+' + (100 - total) : (total - 100)} to reach 100%</span>` : ''}
    </div>
  </div>`;
}

// ── Wire token/share editors inside a container el ────────────────────────────
function _wireTokenEditor(el, getTokens, setTokens, rerender) {
  el.querySelectorAll('.cp-token-cost').forEach(inp => {
    inp.addEventListener('change', () => {
      const ti = parseInt(inp.dataset.ti);
      const arr = getTokens().slice();
      arr[ti] = parseInt(inp.value) || 0;
      setTokens(arr);
      autosave();
    });
  });
  el.querySelectorAll('.cp-token-rm').forEach(btn => {
    btn.addEventListener('click', () => {
      const ti = parseInt(btn.dataset.ti);
      const arr = getTokens().slice();
      arr.splice(ti, 1);
      setTokens(arr);
      autosave();
      rerender();
    });
  });
  el.querySelectorAll('.cp-token-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const arr = getTokens().slice();
      arr.push(arr.length === 0 ? 0 : 40);
      setTokens(arr);
      autosave();
      rerender();
    });
  });
}

function _wireShareEditor(el, getShares, setShares, rerender) {
  el.querySelectorAll('.cp-share-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const si  = parseInt(inp.dataset.si);
      const arr = getShares().slice();
      arr[si]   = parseInt(inp.value) || 0;
      setShares(arr); autosave();
      // Refresh bar + total without full re-render
      const editor = inp.closest('.cp-share-editor');
      if (!editor) return;
      const total = arr.reduce((a, b) => a + b, 0);
      const ok    = total === 100;
      const tot   = editor.querySelector('.cp-share-total');
      if (tot) { tot.textContent = (ok ? '✓ ' : '⚠ ') + total + '%'; tot.className = 'cp-share-total ' + (ok ? 'cp-share-ok' : 'cp-share-warn'); }
      const diff  = editor.querySelector('.cp-share-diff');
      if (diff)  diff.textContent = total < 100 ? '+' + (100-total) + ' to reach 100%' : (total-100) + ' to reach 100%';
      // Redraw proportions bar
      const bar = editor.querySelector('.cp-share-bar');
      if (bar) bar.innerHTML = arr.map((pct, i) => {
        const w = total > 0 ? ((pct/total)*100).toFixed(2) : 0;
        const hue = (i * 47) % 360;
        return `<div class="cp-share-seg" style="width:${w}%;background:hsl(${hue},55%,42%);" title="${pct}%"></div>`;
      }).join('');
    });
  });
  el.querySelectorAll('.cp-share-rm-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const si  = parseInt(btn.dataset.si);
      const arr = getShares().slice();
      arr.splice(si, 1);
      setShares(arr); autosave(); rerender();
    });
  });
  el.querySelectorAll('.cp-share-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const arr = getShares().slice();
      arr.push(10); setShares(arr); autosave(); rerender();
    });
  });
}

// ── Minor home-hex validator ──────────────────────────────────────────────────
// Returns { [coId]: ['warning text', ...] } for every minor with a problem.
function validateMinors() {
  const result = {};
  (state.corpPacks || []).forEach(pack => {
    if (pack.type !== 'minor') return;
    (pack.companies || []).forEach(co => {
      const w = [];
      if (!co.coordinates) {
        w.push('No home hex defined');
      } else {
        const hex = (state.hexes || {})[co.coordinates];
        if (!hex) {
          w.push('Home ' + co.coordinates + ' not on map');
        } else {
          const cities = (hex.nodes || []).filter(n => n.type === 'city');
          if (!cities.length) {
            w.push('Home ' + co.coordinates + ' has no city');
          } else {
            const ci = parseInt(co.city) || 0;
            if (ci >= cities.length) {
              w.push('Home ' + co.coordinates + ': no city at index ' + ci);
            } else if ((cities[ci].slots || 1) < 1) {
              w.push('Home ' + co.coordinates + ': no free token slot');
            }
          }
        }
      }
      if (w.length) result[co.id] = w;
    });
  });
  return result;
}

// ── Main render entry point ───────────────────────────────────────────────────
function renderCorpsSection() {
  const wrap = document.getElementById('corpCorpsSection');
  if (!wrap) return;
  if (!state.corpPacks) state.corpPacks = [];

  // Clamp selection
  if (_selectedPackIdx !== null && _selectedPackIdx >= state.corpPacks.length) {
    _selectedPackIdx = state.corpPacks.length ? state.corpPacks.length - 1 : null;
    _selectedCompanyId = null;
  }

  const savedRailScroll = wrap.querySelector('.cp-rail')?.scrollTop || 0;
  const minorWarnings   = validateMinors();
  wrap.innerHTML = '';

  // ── Left rail ─────────────────────────────────────────────────────────────
  const rail = document.createElement('div');
  rail.className = 'cp-rail';

  if (!state.corpPacks.length) {
    rail.innerHTML = `<div class="cp-rail-empty">No packs yet.<br>Click + New Pack to start.</div>`;
  }

  state.corpPacks.forEach((pack, pi) => {
    const isPackSelected = (pi === _selectedPackIdx && _selectedCompanyId === null);
    const collapsed = pack._collapsed || false;

    const packHd = document.createElement('div');
    packHd.className = 'cp-pack-header' + (isPackSelected ? ' active' : '');
    packHd.innerHTML = `
      <span class="cp-pack-collapse">${collapsed ? '▶' : '▼'}</span>
      <span class="cp-pack-type-badge">${(pack.type || 'custom').toUpperCase().slice(0,3)}</span>
      <span class="cp-pack-label">${escHtml(pack.label || 'Unnamed Pack')}</span>
      <span class="cp-pack-count">${(pack.companies || []).length}</span>`;
    packHd.addEventListener('click', () => {
      _selectedPackIdx   = pi;
      _selectedCompanyId = null;
      renderCorpsSection();
    });
    packHd.querySelector('.cp-pack-collapse').addEventListener('click', e => {
      e.stopPropagation();
      pack._collapsed = !pack._collapsed;
      renderCorpsSection();
    });
    rail.appendChild(packHd);

    if (!collapsed) {
      (pack.companies || []).forEach((co, ci) => {
        const isCoSelected = co.id === _selectedCompanyId;
        const item = document.createElement('div');
        item.className = 'cp-rail-item' + (isCoSelected ? ' active' : '');
        const dotColor   = co.color || '#666';
        const assocBadge = (pack.type === 'minor' && co.associatedMajor)
          ? `<span class="cp-rail-assoc-badge" title="Associated: ${escHtml(co.associatedMajor)}">${escHtml(co.associatedMajor)}</span>`
          : '';
        const coWarns = minorWarnings[co.id];
        const warnBadge = coWarns
          ? `<span class="co-warn-badge" title="${escHtml(coWarns.join('\n'))}">⚠</span>`
          : '';
        item.innerHTML = `
          <span class="cp-rail-dot" style="background:${dotColor};"></span>
          <span class="cp-rail-sym">${escHtml(co.sym || '?')}</span>
          <span class="cp-rail-name">${escHtml(co.name || 'Unnamed')}</span>
          ${assocBadge}${warnBadge}`;
        item.addEventListener('click', () => {
          _selectedPackIdx   = pi;
          _selectedCompanyId = co.id;
          renderCorpsSection();
        });
        rail.appendChild(item);
      });

      // Add company button inside pack
      const addCoBtn = document.createElement('button');
      addCoBtn.className = 'cp-add-company-btn';
      addCoBtn.textContent = '+ Add Company';
      addCoBtn.addEventListener('click', () => {
        const newCo = { id: _cpRandId('co'), sym: '', name: '', color: '#336699', textColor: '#ffffff', logo: '', coordinates: '', city: '', abilities: [] };
        if (!pack.companies) pack.companies = [];
        pack.companies.push(newCo);
        _selectedPackIdx   = pi;
        _selectedCompanyId = newCo.id;
        autosave();
        renderCorpsSection();
      });
      rail.appendChild(addCoBtn);
    }
  });

  wrap.appendChild(rail);
  rail.scrollTop = savedRailScroll;

  // ── Right detail panel ────────────────────────────────────────────────────
  const detail = document.createElement('div');
  detail.className = 'cp-detail-wrap';

  if (_selectedPackIdx === null) {
    detail.innerHTML = `<div class="pc-detail-empty">
      <span>Select a pack or company from the list</span>
      <span class="pc-detail-empty-sub">or click + New Pack to create one</span>
    </div>`;
  } else if (_selectedCompanyId === null) {
    detail.appendChild(_buildPackDetailEl(_selectedPackIdx));
  } else {
    const found = _findCompany(_selectedCompanyId);
    if (found) detail.appendChild(_buildCompanyDetailEl(found.pi, found.ci));
  }

  wrap.appendChild(detail);
}

// ── Pack settings detail panel ────────────────────────────────────────────────
function _buildPackDetailEl(pi) {
  const pack = state.corpPacks[pi];
  const el   = document.createElement('div');
  el.className = 'cp-pack-editor';

  const typeOpts = CORP_TYPES.map(t =>
    `<option value="${t.value}"${pack.type === t.value ? ' selected' : ''}>${t.label}</option>`
  ).join('');
  const capOpts = ['full','incremental'].map(v =>
    `<option value="${v}"${pack.capitalization === v ? ' selected' : ''}>${v.charAt(0).toUpperCase() + v.slice(1)}</option>`
  ).join('');

  el.innerHTML = `
    <div class="cp-pack-det-header">
      <input type="text" class="cp-pack-name-input" placeholder="Pack label…" value="${escHtml(pack.label || '')}">
      <button class="cp-pack-delete" title="Delete this pack">Delete Pack</button>
    </div>

    <div class="cp-det-section">
      <div class="cp-det-section-title">Pack Defaults</div>
      <div class="cp-pack-grid">
        <div class="cp-pack-cell cp-pack-cell-wide">
          <label class="cp-pack-cell-label">Type</label>
          <select class="cp-pack-type-sel cp-pack-sel">${typeOpts}</select>
        </div>
        <div class="cp-pack-cell">
          <label class="cp-pack-cell-label">Float %</label>
          <div class="cp-pack-num-wrap">
            <input type="number" class="cp-pack-float cp-pack-num" value="${pack.floatPct || 60}" min="0" max="100">
            <span class="cp-pack-num-suffix">%</span>
          </div>
        </div>
        <div class="cp-pack-cell">
          <label class="cp-pack-cell-label">Max ownership</label>
          <div class="cp-pack-num-wrap">
            <input type="number" class="cp-pack-maxown cp-pack-num" value="${pack.maxOwnershipPct || 100}" min="0" max="100">
            <span class="cp-pack-num-suffix">%</span>
          </div>
        </div>
        <div class="cp-pack-cell cp-pack-cell-wide">
          <label class="cp-pack-cell-label">Capitalization</label>
          <select class="cp-pack-cap cp-pack-sel">${capOpts}</select>
        </div>
        <div class="cp-pack-cell cp-pack-cell-toggle">
          <label class="cp-pack-toggle-label">
            <input type="checkbox" class="cp-pack-amp"${pack.alwaysMarketPrice ? ' checked' : ''}>
            <span class="cp-pack-toggle-text">Always market price</span>
          </label>
        </div>
      </div>
    </div>

    <div class="cp-det-section">
      <div class="cp-det-section-hd">
        <span class="cp-det-section-title">Share structure</span>
        <span class="cp-det-hint">template inherited by all companies</span>
      </div>
      ${_buildShareEditorHTML(pack.shares, 'pack_sh')}
    </div>

    <div class="cp-det-section">
      <div class="cp-det-section-hd">
        <span class="cp-det-section-title">Station tokens</span>
        <span class="cp-det-hint">cost to place each token</span>
      </div>
      ${_buildTokenEditorHTML(pack.tokens, 'pack_tk')}
    </div>
  `;

  // ── Listeners ──────────────────────────────────────────────────────────────
  el.querySelector('.cp-pack-name-input').addEventListener('change', e => {
    pack.label = e.target.value; autosave();
    // Update rail label live
    const railLabel = document.querySelector(`.cp-pack-header:nth-of-type(${pi + 1}) .cp-pack-label`);
    if (railLabel) railLabel.textContent = pack.label || 'Unnamed Pack';
  });
  el.querySelector('.cp-pack-type-sel').addEventListener('change', e => {
    pack.type = e.target.value;
    // Apply smart defaults for the new type
    const defs = _packDefaults(e.target.value);
    Object.assign(pack, defs);
    autosave(); renderCorpsSection();
  });
  el.querySelector('.cp-pack-float').addEventListener('change',  e => { pack.floatPct         = parseInt(e.target.value) || 60;  autosave(); });
  el.querySelector('.cp-pack-maxown').addEventListener('change', e => { pack.maxOwnershipPct   = parseInt(e.target.value) || 100; autosave(); });
  el.querySelector('.cp-pack-cap').addEventListener('change',    e => { pack.capitalization    = e.target.value;                  autosave(); });
  el.querySelector('.cp-pack-amp').addEventListener('change',    e => { pack.alwaysMarketPrice = e.target.checked;                autosave(); });

  el.querySelector('.cp-pack-delete').addEventListener('click', () => {
    if (!confirm(`Delete pack "${pack.label || 'Unnamed'}" and all its companies?`)) return;
    state.corpPacks.splice(pi, 1);
    _selectedPackIdx   = state.corpPacks.length ? Math.min(pi, state.corpPacks.length - 1) : null;
    _selectedCompanyId = null;
    autosave(); renderCorpsSection();
  });

  _wireTokenEditor(el,
    () => pack.tokens,
    arr => { pack.tokens = arr; },
    () => { autosave(); renderCorpsSection(); }
  );
  _wireShareEditor(el,
    () => pack.shares,
    arr => { pack.shares = arr; },
    () => { autosave(); renderCorpsSection(); }
  );

  return el;
}

// ── Company detail panel ──────────────────────────────────────────────────────
function _buildCompanyDetailEl(pi, ci) {
  const pack    = state.corpPacks[pi];
  const company = pack.companies[ci];
  const el      = document.createElement('div');
  el.className  = 'cp-company-editor';

  // Effective (inherited or overridden) values shown in inherit fields
  const effTokens  = _effective(pack, company, 'tokens');
  const effFloat   = _effective(pack, company, 'floatPct');
  const effMaxOwn  = _effective(pack, company, 'maxOwnershipPct');
  const hasTokenOv = company.tokensOverride !== undefined && company.tokensOverride !== null;
  const hasFloatOv = company.floatPctOverride !== undefined && company.floatPctOverride !== null;

  if (!company.abilities) company.abilities = [];
  const abCount = company.abilities.length;

  el.innerHTML = `
    <div class="cp-company-band" style="background:${company.color || '#336699'};">
      <span class="cp-co-sym">${escHtml(company.sym || '?')}</span>
      <input type="text" class="cp-co-sym-input" maxlength="5" placeholder="SYM" value="${escHtml(company.sym || '')}" title="Symbol">
    </div>

    <div class="cp-co-header">
      <input type="text" class="cp-co-name" placeholder="Corporation name" value="${escHtml(company.name || '')}">
      <button class="cp-co-delete">Delete</button>
    </div>

    <div class="cp-det-section cp-co-identity">
      <div class="cp-det-section-title">Identity</div>
      <div class="cp-co-fields">
        <div class="cp-co-field-row">
          <label class="cp-co-field-label">Charter color</label>
          ${_buildColorPickerHTML(company.color || '#336699', 'co-color', CORP_COLORS)}
          <label class="cp-co-field-label" style="margin-left:16px;">Text color</label>
          ${_buildColorPickerHTML(company.textColor || '#ffffff', 'co-textcolor', TEXT_COLORS)}
        </div>
        <div class="cp-co-field-row">
          <label class="cp-co-field-label">Home hex</label>
          <input type="text" class="cp-co-coords" placeholder="e.g. D12" value="${escHtml(company.coordinates || '')}">
          <label class="cp-co-field-label" style="margin-left:12px;">City slot</label>
          <input type="number" class="cp-co-city" min="0" max="5" value="${company.city !== '' ? (company.city || 0) : ''}" placeholder="0">
        </div>
        <div class="cp-co-field-row">
          <label class="cp-co-field-label">Logo path</label>
          <input type="text" class="cp-co-logo" placeholder="e.g. 1882/NYC" value="${escHtml(company.logo || '')}">
        </div>
        ${pack.type === 'minor' ? `
        <div class="cp-co-field-row">
          <label class="cp-co-field-label">Assoc. major</label>
          <input type="text" class="cp-co-assoc-major" list="cp-assoc-syms-${company.id}"
            placeholder="e.g. CPR" value="${escHtml(company.associatedMajor || '')}">
          <datalist id="cp-assoc-syms-${company.id}">${_allMajorSyms().map(s => `<option value="${s}">`).join('')}</datalist>
          <span class="cp-co-assoc-hint">Minor is pre-assigned to this major on float</span>
        </div>` : ''}
      </div>
    </div>

    <div class="cp-det-section">
      <div class="cp-det-section-title">Overrides <span class="cp-det-hint">(leave blank to inherit from pack)</span></div>
      <div class="cp-co-fields">
        <div class="cp-co-field-row">
          <label class="cp-co-field-label">Float %</label>
          ${hasFloatOv
            ? `<input type="number" class="cp-co-float-ov" value="${company.floatPctOverride}" min="0" max="100"> <button class="cp-co-reset-float cp-reset-btn" title="Reset to pack default (${effFloat}%)">↩ ${effFloat}%</button>`
            : `<span class="cp-inherit-val">${effFloat}%</span><button class="cp-co-override-float cp-override-btn">Override</button>`
          }
        </div>
        <div class="cp-co-field-row">
          <label class="cp-co-field-label">Token slots</label>
          ${hasTokenOv
            ? `${_buildTokenEditorHTML(company.tokensOverride, 'co_tk')} <button class="cp-co-reset-tokens cp-reset-btn" title="Reset to pack default">↩ pack</button>`
            : `<span class="cp-inherit-val">${(effTokens || []).map((c,i) => '$'+c).join(', ') || '(none)'}</span><button class="cp-co-override-tokens cp-override-btn">Override</button>`
          }
        </div>
      </div>
    </div>

    <div class="cp-det-section">
      <div class="cp-det-section-hd">
        <span class="cp-det-section-title">Abilities${abCount ? ` <span class="pc-ab-badge">${abCount}</span>` : ''}</span>
      </div>
      <div class="cp-ability-list cp-det-ability-list"></div>
      <div class="pc-add-ability-bar">
        <button class="pc-add-ability-btn">+ Add ability</button>
        <div class="pc-ability-picker" style="display:none;">${buildAbilityPickerHTML()}</div>
      </div>
    </div>
  `;

  // Render ability chips (reuse privates system)
  el.querySelector('.cp-det-ability-list').innerHTML = buildAbilitiesListHTML(company, ci);

  // ── field listeners ────────────────────────────────────────────────────────
  el.querySelector('.cp-co-sym-input').addEventListener('change', e => {
    company.sym = e.target.value.toUpperCase();
    el.querySelector('.cp-co-sym').textContent = company.sym || '?';
    autosave();
    // update rail
    const railSym = document.querySelector(`.cp-rail-item.active .cp-rail-sym`);
    if (railSym) railSym.textContent = company.sym || '?';
  });
  el.querySelector('.cp-co-name').addEventListener('change', e => {
    company.name = e.target.value; autosave();
    const railName = document.querySelector('.cp-rail-item.active .cp-rail-name');
    if (railName) railName.textContent = company.name || 'Unnamed';
  });
  _wireColorPicker(el, 'co-color', hex => {
    company.color = hex;
    el.querySelector('.cp-company-band').style.background = hex;
    const railDot = document.querySelector('.cp-rail-item.active .cp-rail-dot');
    if (railDot) railDot.style.background = hex;
    autosave();
  });
  _wireColorPicker(el, 'co-textcolor', hex => { company.textColor = hex; autosave(); });
  el.querySelector('.cp-co-coords').addEventListener('change',    e => { company.coordinates  = e.target.value;                 autosave(); });
  el.querySelector('.cp-co-city').addEventListener('change',      e => { company.city         = parseInt(e.target.value) || 0;  autosave(); });
  el.querySelector('.cp-co-logo').addEventListener('change',      e => { company.logo         = e.target.value;                 autosave(); });

  const assocMajorEl = el.querySelector('.cp-co-assoc-major');
  if (assocMajorEl) {
    assocMajorEl.addEventListener('change', e => {
      company.associatedMajor = e.target.value.trim().toUpperCase() || null;
      autosave();
      // Sync badge in active rail item without full re-render
      const activeRailItem = document.querySelector('.cp-rail-item.active');
      if (activeRailItem) {
        let badge = activeRailItem.querySelector('.cp-rail-assoc-badge');
        if (company.associatedMajor) {
          if (!badge) {
            badge = document.createElement('span');
            badge.className = 'cp-rail-assoc-badge';
            activeRailItem.appendChild(badge);
          }
          badge.textContent  = company.associatedMajor;
          badge.title        = 'Associated: ' + company.associatedMajor;
        } else if (badge) {
          badge.remove();
        }
      }
    });
  }

  el.querySelector('.cp-co-delete').addEventListener('click', () => {
    pack.companies.splice(ci, 1);
    _selectedCompanyId = pack.companies.length ? pack.companies[Math.max(0, ci - 1)].id : null;
    autosave(); renderCorpsSection();
  });

  // Override / reset listeners
  const ovFloatBtn = el.querySelector('.cp-co-override-float');
  if (ovFloatBtn) ovFloatBtn.addEventListener('click', () => {
    company.floatPctOverride = pack.floatPct; autosave(); renderCorpsSection();
  });
  const rstFloatBtn = el.querySelector('.cp-co-reset-float');
  if (rstFloatBtn) rstFloatBtn.addEventListener('click', () => {
    delete company.floatPctOverride; autosave(); renderCorpsSection();
  });
  const floatOvInp = el.querySelector('.cp-co-float-ov');
  if (floatOvInp) floatOvInp.addEventListener('change', e => {
    company.floatPctOverride = parseInt(e.target.value) || 0; autosave();
  });

  const ovTkBtn = el.querySelector('.cp-co-override-tokens');
  if (ovTkBtn) ovTkBtn.addEventListener('click', () => {
    company.tokensOverride = (pack.tokens || []).slice(); autosave(); renderCorpsSection();
  });
  const rstTkBtn = el.querySelector('.cp-co-reset-tokens');
  if (rstTkBtn) rstTkBtn.addEventListener('click', () => {
    delete company.tokensOverride; autosave(); renderCorpsSection();
  });
  if (hasTokenOv) {
    _wireTokenEditor(el,
      () => company.tokensOverride,
      arr => { company.tokensOverride = arr; },
      () => { autosave(); renderCorpsSection(); }
    );
  }

  // ── Ability system (reuse privates ability picker) ─────────────────────────
  el.querySelectorAll('.pc-ab-f').forEach(field => {
    const ai = parseInt(field.dataset.ai), key = field.dataset.key;
    const ability = company.abilities[ai];
    if (!ability) return;
    const fDef = (ABILITY_DEFS[ability.type] && ABILITY_DEFS[ability.type].fields || []).find(f => f.key === key);
    field.addEventListener('change', () => {
      let val = field.value;
      if (field.type === 'checkbox')           val = field.checked;
      else if (fDef && fDef.type === 'number') val = parseFloat(val) || 0;
      else if (fDef && fDef.type === 'tags')   val = val.split(',').map(s => s.trim()).filter(Boolean);
      company.abilities[ai][key] = val;
      autosave();
    });
  });

  el.querySelectorAll('.pc-ability-rm').forEach(btn => {
    btn.addEventListener('click', () => {
      company.abilities.splice(parseInt(btn.dataset.ai), 1);
      autosave(); renderCorpsSection();
    });
  });

  const addAbBtn = el.querySelector('.pc-add-ability-btn');
  const picker   = el.querySelector('.pc-ability-picker');
  if (addAbBtn && picker) {
    addAbBtn.addEventListener('click', e => {
      e.stopPropagation();
      const showing = picker.style.display !== 'none';
      picker.style.display = showing ? 'none' : 'block';
      addAbBtn.classList.toggle('active', !showing);
    });
    picker.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', function closePicker() {
      picker.style.display = 'none'; addAbBtn.classList.remove('active');
    }, { once: true });
    el.querySelectorAll('.pc-pick-type').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const type = btn.dataset.type, def = ABILITY_DEFS[type];
        if (!def) return;
        const newAb = { type };
        def.fields.forEach(f => { newAb[f.key] = f.type === 'tags' ? [] : (f.default !== undefined ? f.default : ''); });
        company.abilities.push(newAb);
        autosave(); renderCorpsSection();
      });
    });
  }

  return el;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUCTION PANEL
// Game-level auction configuration rendered into #corpAuctionSection.
// ─────────────────────────────────────────────────────────────────────────────

function renderAuctionPanel() {
  const wrap = document.getElementById('corpAuctionSection');
  if (!wrap) return;

  // Ensure auction object exists on state
  if (!state.auction) {
    state.auction = {
      hasInitialRound: true, mechanism: 'waterfall', bidIncrement: 5,
      mustBeMultiple: false, companyOrder: 'value_asc',
      passDecreases: false, passAmount: 5,
      privateSlots: 3, minorSlots: 3, concessionSlots: 3, draftOrder: 'snake',
    };
  }
  const a = state.auction;

  const mech = a.mechanism || 'waterfall';

  // Build mechanism-specific extra panels
  const waterfallExtras = `
    <div class="auc-sub-card" id="aucWaterfallSettings">
      <div class="auc-sub-title">Waterfall settings</div>
      <div class="auc-row">
        <label class="auc-label">Company order</label>
        <select class="auc-sel" id="aucCompanyOrder">
          <option value="value_asc"  ${a.companyOrder === 'value_asc'  ? 'selected' : ''}>Face value ↑ (cheapest first)</option>
          <option value="value_desc" ${a.companyOrder === 'value_desc' ? 'selected' : ''}>Face value ↓ (most expensive first)</option>
          <option value="custom"     ${a.companyOrder === 'custom'     ? 'selected' : ''}>Custom (as listed)</option>
        </select>
      </div>
      <div class="auc-row">
        <label class="auc-label">If all pass</label>
        <label class="auc-toggle-label">
          <input type="checkbox" class="auc-chk" id="aucPassDecreases" ${a.passDecreases ? 'checked' : ''}>
          Price decreases
        </label>
        <span class="auc-label" style="margin-left:12px;">by $</span>
        <input type="number" class="auc-num" id="aucPassAmount" min="1" max="100"
          value="${a.passAmount || 5}" ${!a.passDecreases ? 'disabled' : ''}>
      </div>
    </div>`;

  const bidBoxExtras = `
    <div class="auc-sub-card" id="aucBidBoxSettings">
      <div class="auc-sub-title">Bid box slot counts
        <span class="auc-hint">How many companies are face-up in each bid box at once</span>
      </div>
      <div class="auc-row">
        <label class="auc-label">Private slots</label>
        <input type="number" class="auc-num" id="aucPrivateSlots" min="1" max="10" value="${a.privateSlots || 3}">
      </div>
      <div class="auc-row">
        <label class="auc-label">Minor cert slots</label>
        <input type="number" class="auc-num" id="aucMinorSlots" min="1" max="10" value="${a.minorSlots || 3}">
      </div>
      <div class="auc-row">
        <label class="auc-label">Concession slots</label>
        <input type="number" class="auc-num" id="aucConcessionSlots" min="1" max="10" value="${a.concessionSlots || 3}">
      </div>
      <div class="auc-hint-block">
        <strong>Engine constants:</strong><br>
        <code>BIDDING_BOX_PRIVATE_COUNT = ${a.privateSlots || 3}</code><br>
        <code>BIDDING_BOX_MINOR_COUNT   = ${a.minorSlots   || 3}</code><br>
        <code>BIDDING_BOX_CONCESSION_COUNT = ${a.concessionSlots || 3}</code>
      </div>
    </div>`;

  const draftExtras = `
    <div class="auc-sub-card" id="aucDraftSettings">
      <div class="auc-sub-title">Draft settings</div>
      <div class="auc-row">
        <label class="auc-label">Draft order</label>
        <select class="auc-sel" id="aucDraftOrder">
          <option value="snake"      ${a.draftOrder === 'snake'      ? 'selected' : ''}>Snake (1 → N → 1)</option>
          <option value="sequential" ${a.draftOrder === 'sequential' ? 'selected' : ''}>Sequential (1 → N → 1 → N…)</option>
        </select>
      </div>
    </div>`;

  const extrasHTML = mech === 'waterfall' ? waterfallExtras
                   : mech === 'bid_box'   ? bidBoxExtras
                   : mech === 'draft'     ? draftExtras
                   : '';

  wrap.innerHTML = `
    <div class="auc-panel">
      <div class="auc-section-title">Auction / Initial Offering</div>

      <div class="auc-card">
        <div class="auc-row">
          <label class="auc-label">Initial round</label>
          <label class="auc-toggle-label">
            <input type="checkbox" class="auc-chk" id="aucHasInitialRound" ${a.hasInitialRound !== false ? 'checked' : ''}>
            Game starts with an auction round before the first stock round
          </label>
        </div>

        <div class="auc-row">
          <label class="auc-label">Mechanism</label>
          <div class="auc-mech-grid" id="aucMechGrid">
            ${[
              { val: 'waterfall', label: 'Waterfall',    sub: '1830 sequential — bid or buy in order' },
              { val: 'bid_box',   label: 'Bid Box',      sub: '1822 simultaneous — multiple items face-up' },
              { val: 'draft',     label: 'Draft',        sub: 'Players pick in rotation, no bidding' },
              { val: 'fixed',     label: 'Fixed price',  sub: 'Buy at face value, first-come-first-served' },
              { val: 'none',      label: 'None',         sub: 'No company auction (majors only or manual)' },
            ].map(m => `
              <button type="button" class="auc-mech-btn${mech === m.val ? ' active' : ''}" data-mech="${m.val}">
                <span class="auc-mech-label">${m.label}</span>
                <span class="auc-mech-sub">${m.sub}</span>
              </button>`).join('')}
          </div>
        </div>

        <div class="auc-row auc-row-inline">
          <label class="auc-label">Bid increment</label>
          <div class="auc-num-wrap">
            <span class="auc-dollar">$</span>
            <input type="number" class="auc-num" id="aucBidIncrement" min="1" max="100" value="${a.bidIncrement || 5}">
          </div>
          <label class="auc-toggle-label" style="margin-left:16px;">
            <input type="checkbox" class="auc-chk" id="aucMustBeMultiple" ${a.mustBeMultiple ? 'checked' : ''}>
            Bids must be exact multiples
          </label>
        </div>
      </div>

      ${extrasHTML}

      <div class="auc-sub-card auc-export-preview">
        <div class="auc-sub-title">Export preview <span class="auc-hint">game.rb constants</span></div>
        <pre class="auc-code" id="aucCodePreview">${_auctionExportPreview(a)}</pre>
      </div>
    </div>
  `;

  // ── wire listeners ────────────────────────────────────────────────────────

  function saveAndRefresh() { autosave(); _refreshAuctionCodePreview(); }

  wrap.querySelector('#aucHasInitialRound').addEventListener('change', e => {
    state.auction.hasInitialRound = e.target.checked; saveAndRefresh();
  });

  wrap.querySelectorAll('.auc-mech-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.auction.mechanism = btn.dataset.mech;
      autosave();
      renderAuctionPanel(); // re-render to swap mechanism extras
    });
  });

  const bindNum = (id, key, parse) => {
    const el = wrap.querySelector('#' + id);
    if (el) el.addEventListener('change', e => {
      state.auction[key] = parse(e.target.value);
      saveAndRefresh();
    });
  };
  const bindChk = (id, key) => {
    const el = wrap.querySelector('#' + id);
    if (el) el.addEventListener('change', e => {
      state.auction[key] = e.target.checked;
      saveAndRefresh();
      // Enable/disable pass amount when passDecreases toggles
      if (key === 'passDecreases') {
        const pa = wrap.querySelector('#aucPassAmount');
        if (pa) pa.disabled = !e.target.checked;
      }
    });
  };
  const bindSel = (id, key) => {
    const el = wrap.querySelector('#' + id);
    if (el) el.addEventListener('change', e => { state.auction[key] = e.target.value; saveAndRefresh(); });
  };

  bindNum('aucBidIncrement',   'bidIncrement',   v => parseInt(v) || 5);
  bindChk('aucMustBeMultiple', 'mustBeMultiple');
  bindSel('aucCompanyOrder',   'companyOrder');
  bindChk('aucPassDecreases',  'passDecreases');
  bindNum('aucPassAmount',     'passAmount',     v => parseInt(v) || 5);
  bindNum('aucPrivateSlots',   'privateSlots',   v => parseInt(v) || 3);
  bindNum('aucMinorSlots',     'minorSlots',     v => parseInt(v) || 3);
  bindNum('aucConcessionSlots','concessionSlots',v => parseInt(v) || 3);
  bindSel('aucDraftOrder',     'draftOrder');
}

// Returns a Ruby constant preview string for the export panel
function _auctionExportPreview(a) {
  const mech = a.mechanism || 'waterfall';
  const inc  = a.bidIncrement || 5;
  const mul  = a.mustBeMultiple ? 'true' : 'false';
  const lines = [];
  lines.push(`MIN_BID_INCREMENT          = ${inc}`);
  lines.push(`MUST_BID_INCREMENT_MULTIPLE = ${mul}`);
  if (mech === 'bid_box') {
    lines.push(`BIDDING_BOX_PRIVATE_COUNT     = ${a.privateSlots    || 3}`);
    lines.push(`BIDDING_BOX_MINOR_COUNT       = ${a.minorSlots      || 3}`);
    lines.push(`BIDDING_BOX_CONCESSION_COUNT  = ${a.concessionSlots || 3}`);
  }
  if (mech === 'waterfall' && a.passDecreases) {
    lines.push(`COMPANY_SALE_MINIMUM          = ${a.passAmount || 5} # price drop when all pass`);
  }
  return lines.join('\n');
}

function _refreshAuctionCodePreview() {
  const pre = document.getElementById('aucCodePreview');
  if (pre && state.auction) pre.textContent = _auctionExportPreview(state.auction);
}

// ── + New Pack button ─────────────────────────────────────────────────────────
document.getElementById('addPackBtn').addEventListener('click', () => {
  const type = 'major';
  const defs = _packDefaults(type);
  const newPack = Object.assign({ id: _cpRandId('pk'), label: 'New Pack', type, companies: [] }, defs);
  state.corpPacks.push(newPack);
  _selectedPackIdx   = state.corpPacks.length - 1;
  _selectedCompanyId = null;
  autosave();
  renderCorpsSection();
});
