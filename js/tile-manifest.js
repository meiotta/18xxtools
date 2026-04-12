// ─── TILE MANIFEST ────────────────────────────────────────────────────────────
// Panel view for configuring the tile box for a game.
// Replaces the canvas area (left sidebar stays visible for drag-and-drop).
// Load order: LAST — after all other modules.
//
// Tile sort order: yellow → green → brown → grey, numeric low→high per color,
// X-tiles after numeric within each color.
// Drag from left sidebar → dropped tile added with count 1 (if new to manifest).
// Cards never show count 0. Hover reveals × to remove entirely.

// ── Base tile sets ────────────────────────────────────────────────────────────

const BASE_TILE_SETS = {
  manifest: {
    "white-blank":1,"white-town":1,"white-dual-town":1,"white-city-1":1,"white-city-2":1,"white-oo":1,"white-city-3":1,
    "1":1,"2":1,"3":6,"4":6,"5":6,"6":8,"7":1,"56":1,"57":6,"58":6,"69":1,
    "X1":1,"X2":2,"X3":1,"X4":1,"X21":1,
    "14":6,"15":6,"80":6,"81":6,"82":8,"83":8,
    "141":4,"142":4,"143":4,"144":4,
    "207":2,"208":1,"405":3,"619":6,"622":1,"X5":3,
    "X6":1,"X7":2,"X8":1,"X9":1,"X10":3,"X22":1,
    "63":8,"544":6,"545":6,"546":8,"611":4,"767":4,"768":4,"769":6,
    "X11":2,"X12":1,"X13":2,"X14":1,"X15":1,"X16":2,"X17":2,"X18":2,"X19":4,"X23":1,
    "60":2,"169":2
  },
  '1822': {
    "1":1,"2":1,"3":6,"4":6,"5":6,"6":8,
    "14":6,"15":6,"55":1,"56":1,"57":6,"58":6,"60":2,"63":8,"69":1,
    "80":6,"81":6,"82":8,"83":8,
    "141":4,"142":4,"143":4,"144":4,
    "207":2,"208":1,"544":6,"545":6,"546":8,"611":4,"619":6,"622":1
  },
  '1830': {
    "1":1,"2":1,"3":2,"4":2,"7":4,"8":8,"9":7,
    "14":3,"15":2,"16":1,"18":1,"19":1,"20":1,
    "23":3,"24":3,"25":1,"26":1,"27":1,"28":1,"29":1,
    "39":1,"40":1,"41":2,"42":2,"43":2,"44":1,"45":2,"46":2,"47":1,
    "53":2,"54":1,"55":1,"56":1,"57":4,"58":2,"59":2,
    "61":2,"62":1,"63":3,"64":1,"65":1,"66":1,"67":1,"68":1,"69":1,"70":1
  },
  '1846': {
    "5":3,"6":4,
    "14":4,"15":5,"16":2,"17":1,"18":1,"19":2,"20":2,"21":1,"22":1,
    "23":4,"24":4,"25":2,"26":1,"27":1,"28":1,"29":1,"30":1,"31":1,
    "39":1,"40":1,"41":2,"42":2,"43":2,"44":1,"45":2,"46":2,"47":2,
    "51":2,"57":4,"70":1,"611":4,"619":3
  },
  '1856': {
    "1":1,"2":1,"3":3,"4":3,"5":2,"6":2,"7":7,"8":13,"9":13,
    "14":4,"15":4,"16":1,"17":1,"18":1,"19":1,"20":1,
    "23":4,"24":4,"25":1,"26":1,"27":1,"28":1,"29":1,
    "39":1,"40":1,"41":3,"42":3,"43":2,"44":1,"45":2,"46":2,"47":2,
    "55":1,"56":1,"57":4,"58":3,"59":2,
    "63":4,"64":1,"65":1,"66":1,"67":1,"68":1,"69":1,"70":1,
    "120":1,"121":2,"122":1,"123":1,"124":1,"126":1,"127":1
  },
  '1861': {
    "3":2,"4":4,"5":2,"6":2,
    "14":2,"15":2,"16":2,"17":2,"18":2,"19":2,"20":2,"21":2,"22":2,
    "23":5,"24":5,"25":4,"26":2,"27":2,"28":2,"29":2,"30":2,"31":2,
    "39":2,"40":2,"41":2,"42":2,"43":2,"44":2,"45":2,"46":2,"47":2,
    "57":2,"58":4,"63":3,"87":2,"88":2,
    "201":3,"202":3,"204":2,"207":5,"208":2,
    "611":3,"619":2,"621":2,"622":2,"623":3,"624":1,"625":1,"626":1,
    "801":2,"911":3
  },
  '1882': {
    "1":1,"2":1,"3":1,"4":1,"7":5,"8":10,"9":10,
    "14":3,"15":2,"18":1,"19":1,"20":1,
    "23":3,"24":3,"26":1,"27":1,
    "41":2,"42":2,"43":2,"44":1,"45":2,"46":2,"47":1,
    "55":1,"56":1,"57":4,"58":1,"59":1,
    "63":3,"66":1,"67":1,"68":1,"69":1
  },
  '1889': {
    "3":2,"5":2,"6":2,"7":2,"8":5,"9":5,
    "12":1,"13":1,"14":1,"15":3,"16":1,"19":1,"20":1,
    "23":2,"24":2,"25":1,"26":1,"27":1,"28":1,"29":1,
    "39":1,"40":1,"41":1,"42":1,"45":1,"46":1,"47":1,
    "57":2,"58":3,
    "205":1,"206":1,"437":1,"438":1,"439":1,"440":1,"448":4,"465":1,"466":1,"492":1,
    "611":2
  },
  '18Chesapeake': {
    "1":1,"2":1,"3":2,"4":2,
    "14":5,"15":6,"16":1,"19":1,"20":1,
    "23":3,"24":3,"25":2,"26":1,"27":1,"28":1,"29":1,
    "39":1,"40":1,"41":1,"42":1,"43":2,"44":1,"45":1,"46":1,"47":2,
    "55":1,"56":1,"57":7,"58":2,"69":1,"70":1,
    "611":5,"915":1
  },
  '18NewEngland': {
    "3":5,"4":5,"6":8,"7":5,"8":18,"9":15,
    "14":4,"15":4,"16":2,"19":2,"20":2,
    "23":5,"24":5,"25":4,"26":2,"27":2,"28":2,"29":2,"30":2,"31":2,
    "39":2,"40":2,"41":2,"42":2,"43":2,"44":2,"45":2,"46":2,"47":2,
    "58":5,"63":7,"70":2,"87":4,"88":4,
    "204":4,"207":1,"216":2,
    "611":3,"619":4,"622":1,"911":4
  }
};

// ── Tile def lookup (TILE_DEFS first, TILE_PACKS fallback) ───────────────────

function _getTileDef(id) {
  if (TILE_DEFS[id]) return TILE_DEFS[id];
  // Search TILE_PACKS for the id across all packs and colors
  if (typeof TILE_PACKS !== 'undefined') {
    for (const pack of Object.values(TILE_PACKS)) {
      for (const colorGroup of Object.values(pack)) {
        if (colorGroup && colorGroup[id]) {
          const entry = colorGroup[id];
          return TILE_GEO.parseDSL(entry.dsl, entry.color);
        }
      }
    }
  }
  return null;
}

function _makeSwatchSvg(id) {
  if (TILE_DEFS[id]) return makeTileSwatchSvg(id);
  const td = _getTileDef(id);
  if (!td) return '';
  // Render using the same logic as makeTileSwatchSvg but with parsed def
  const hexColor = (typeof TILE_HEX_COLORS !== 'undefined' && TILE_HEX_COLORS[td.color]) || '#c8a87a';
  const trackStroke = '#222';
  let inner = `<polygon points="50,0 25,43.3 -25,43.3 -50,0 -25,-43.3 25,-43.3" fill="${hexColor}" stroke="#999" stroke-width="1.5"/>`;
  if (td.svgPath) {
    const segments = td.svgPath.split(/(?=M )/).map(s => s.trim()).filter(Boolean);
    for (const seg of segments) {
      inner += `<path d="${seg}" stroke="${trackStroke}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  }
  inner += `<text x="-42" y="-32" font-size="10" fill="#555" font-weight="bold">${id}</text>`;
  return `<svg viewBox="-60 -55 120 110" width="72" height="66" style="display:block;">${inner}</svg>`;
}

// ── Sort ──────────────────────────────────────────────────────────────────────

const COLOR_ORDER = { yellow: 0, green: 1, brown: 2, grey: 3 };

function tileSort(a, b) {
  const tdA = TILE_DEFS[a], tdB = TILE_DEFS[b];
  const ca = COLOR_ORDER[tdA?.color] ?? 99;
  const cb = COLOR_ORDER[tdB?.color] ?? 99;
  if (ca !== cb) return ca - cb;

  // Within same color: pure numeric IDs first (ascending), then X-IDs (ascending)
  const aNum = /^\d+$/.test(a), bNum = /^\d+$/.test(b);
  if (aNum && bNum) return parseInt(a) - parseInt(b);
  if (aNum) return -1;
  if (bNum) return 1;
  const aX = /^X\d+$/.test(a), bX = /^X\d+$/.test(b);
  if (aX && bX) return parseInt(a.slice(1)) - parseInt(b.slice(1));
  if (aX) return -1;
  if (bX) return 1;
  return a.localeCompare(b);
}

function sortedManifestIds() {
  return Object.keys(state.manifest)
    .filter(id => _getTileDef(id) && (state.manifest[id] === null || state.manifest[id] > 0))
    .sort(tileSort);
}

// ── State ─────────────────────────────────────────────────────────────────────

if (!state.manifest) state.manifest = {};

let currentView = 'map';
let manifestInitialized = false;

// ── Toggle ────────────────────────────────────────────────────────────────────

function toggleManifestView() {
  if (currentView === 'map') {
    currentView = 'manifest';
    document.getElementById('canvasContainer').style.display = 'none';
    document.getElementById('tileManifestView').style.display = 'flex';
    document.getElementById('tileManifestBtn').textContent = 'Map';
    if (!manifestInitialized) initManifestFromBaseSet();
    buildManifestView();
  } else {
    currentView = 'map';
    document.getElementById('canvasContainer').style.display = '';
    document.getElementById('tileManifestView').style.display = 'none';
    document.getElementById('tileManifestBtn').textContent = 'Tile Manifest';
  }
}

document.getElementById('tileManifestBtn').addEventListener('click', toggleManifestView);
document.getElementById('manifestMapBtn').addEventListener('click', () => {
  currentView = 'map';
  document.getElementById('canvasContainer').style.display = '';
  document.getElementById('tileManifestView').style.display = 'none';
  document.getElementById('tileManifestBtn').textContent = 'Tile Manifest';
});

// ── Base set loaders ──────────────────────────────────────────────────────────

function initManifestFromBaseSet() {
  const setKey = document.getElementById('manifestTileSet').value;
  const base = BASE_TILE_SETS[setKey] || BASE_TILE_SETS['manifest'];
  for (const [id, count] of Object.entries(base)) {
    if (!(id in state.manifest)) state.manifest[id] = count;
  }
  manifestInitialized = true;
}

function loadBaseSet(setKey) {
  const base = BASE_TILE_SETS[setKey] || BASE_TILE_SETS['manifest'];
  state.manifest = Object.assign({}, base);
  autosave();
  buildManifestView();
}

document.getElementById('manifestTileSet').addEventListener('change', e => {
  if (currentView === 'manifest') loadBaseSet(e.target.value);
});

// ── Grid builder ──────────────────────────────────────────────────────────────

// ── Pack short labels ─────────────────────────────────────────────────────────

const PACK_LABELS = {
  'Basic Tile Pack': 'Basic',
  'Junctions & Nontraditional Cities': 'Junctions',
  'Limited Exit & Token Cities': 'Token Cities',
  'These are dumb and you are dumb but they don\'t break anything, I think': 'Dumb Tiles',
  'Unclassified (Review Needed)': 'Unclassified',
};

function buildManifestView() {
  const grid = document.getElementById('manifestGrid');

  // ── Pack toggle pills ──────────────────────────────────────────────────────
  let packsBar = document.getElementById('manifestPacksBar');
  if (!packsBar) {
    packsBar = document.createElement('div');
    packsBar.id = 'manifestPacksBar';
    packsBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;border-bottom:1px solid #3a3a3a;background:#222;align-items:center;';
    const label = document.createElement('span');
    label.textContent = 'Packs:';
    label.style.cssText = 'color:#888;font-size:12px;margin-right:2px;';
    packsBar.appendChild(label);
    grid.parentElement.insertBefore(packsBar, grid);
  }
  packsBar.innerHTML = '';
  const label = document.createElement('span');
  label.textContent = 'Packs:';
  label.style.cssText = 'color:#888;font-size:12px;margin-right:2px;';
  packsBar.appendChild(label);

  const enabledPacks = state.enabledPacks || DEFAULT_ENABLED_PACKS;
  for (const packName of TILE_PACK_ORDER) {
    if (packName === 'Unsupported') continue;
    const shortName = PACK_LABELS[packName] || packName;
    const isOn = !!enabledPacks[packName];
    const pill = document.createElement('label');
    pill.style.cssText = [
      'display:inline-flex', 'align-items:center', 'gap:4px',
      'padding:3px 9px', 'border-radius:12px', 'cursor:pointer',
      'font-size:12px', 'user-select:none', 'border:1px solid',
      isOn ? 'background:#2a4a2a;border-color:#4a7c4a;color:#aee8ae;' : 'background:#2a2a2a;border-color:#555;color:#888;'
    ].join(';');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = isOn;
    cb.style.cssText = 'margin:0;cursor:pointer;';
    cb.addEventListener('change', () => {
      if (!state.enabledPacks) state.enabledPacks = Object.assign({}, DEFAULT_ENABLED_PACKS);
      state.enabledPacks[packName] = cb.checked;
      autosave();
      buildManifestView();
    });
    pill.appendChild(cb);
    pill.appendChild(document.createTextNode(shortName));
    packsBar.appendChild(pill);
  }

  grid.innerHTML = '';

  // Inject shared styles once
  if (!document.getElementById('manifestStyles')) {
    const style = document.createElement('style');
    style.id = 'manifestStyles';
    style.textContent = `
      .manifest-card { position:relative; display:inline-flex; flex-direction:column;
        align-items:center; background:#2a2a2a; border:2px solid #444;
        border-radius:7px; padding:8px 8px 9px; width:116px; box-sizing:border-box;
        transition:border-color .12s, transform .1s; cursor:default; }
      .manifest-card:hover { border-color:#888; }
      .manifest-card.drag-over { border-color:#88aaff; transform:scale(1.04); }
      .manifest-remove { position:absolute; top:4px; right:4px; width:16px; height:16px;
        background:#c0392b; border:none; border-radius:50%; color:#fff;
        font-size:10px; line-height:16px; text-align:center; cursor:pointer;
        display:none; padding:0; z-index:3; font-weight:bold; }
      .manifest-card:hover .manifest-remove { display:block; }
      .manifest-count { display:flex; align-items:stretch; gap:0; margin-top:7px;
        width:100%; background:#1a1a1a; border:1px solid #3a3a3a; border-radius:5px;
        overflow:hidden; }
      .manifest-count button { flex:0 0 28px; font-size:15px; padding:0; line-height:1;
        cursor:pointer; border:none; background:transparent; color:#888; }
      .manifest-count button:hover:not(:disabled) { background:#2e2e2e; color:#fff; }
      .manifest-count button:disabled { opacity:.2; cursor:default; }
      .manifest-count input { flex:1; min-width:0; text-align:center; font-size:12px;
        padding:0; height:24px; background:transparent; color:#eee;
        border:none; border-left:1px solid #2e2e2e; border-right:1px solid #2e2e2e; }
      #manifestGrid.accepting { outline:2px dashed #88aaff; outline-offset:-4px;
        border-radius:4px; }
      .manifest-drop-hint { color:#777; font-size:12px; margin:auto;
        padding:24px; text-align:center; user-select:none; }
    `;
    document.head.appendChild(style);
  }

  const ids = sortedManifestIds();

  if (ids.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'manifest-drop-hint';
    hint.textContent = 'Drag tiles from the left panel to add them here';
    grid.appendChild(hint);
  } else {
    for (const id of ids) {
      grid.appendChild(makeManifestCard(id));
    }
  }

  // Grid-level drag target (catches drops that miss a card)
  grid.addEventListener('dragover', e => {
    if (e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      grid.classList.add('accepting');
    }
  });
  grid.addEventListener('dragleave', e => {
    if (!grid.contains(e.relatedTarget)) grid.classList.remove('accepting');
  });
  grid.addEventListener('drop', e => {
    e.preventDefault();
    grid.classList.remove('accepting');
    const id = e.dataTransfer.getData('text/plain');
    if (id && _getTileDef(id)) addOrIncrement(id);
  });
}

// ── Card factory ──────────────────────────────────────────────────────────────

function makeManifestCard(id) {
  const card = document.createElement('div');
  card.className = 'manifest-card';
  card.setAttribute('data-tile', id);

  // Remove button (shown on hover via CSS)
  const removeBtn = document.createElement('button');
  removeBtn.className = 'manifest-remove';
  removeBtn.textContent = '×';
  removeBtn.title = `Remove tile #${id}`;
  removeBtn.addEventListener('click', e => { e.stopPropagation(); removeFromManifest(id); });
  card.appendChild(removeBtn);

  // SVG swatch — tile number is already rendered inside the SVG top-left
  const svgWrap = document.createElement('div');
  svgWrap.innerHTML = _makeSwatchSvg(id);
  card.appendChild(svgWrap);

  // Count stepper — null = unlimited (displayed as ∞)
  // Simplified: [−] [n] [+]  — type ∞ in the field to set unlimited
  const isUnlimited = state.manifest[id] === null;
  const count = isUnlimited ? 1 : (state.manifest[id] || 1);
  const wrap = document.createElement('div');
  wrap.className = 'manifest-count';

  const dec = document.createElement('button');
  dec.textContent = '−';
  dec.disabled = isUnlimited;
  dec.addEventListener('click', () => adjustCount(id, inp, dec, inc, -1));

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = isUnlimited ? '∞' : count;
  inp.title = 'Count (type ∞ for unlimited)';
  inp.addEventListener('change', () => {
    const raw = inp.value.trim();
    if (raw === '∞' || raw === 'inf' || raw === '') {
      inp.value = '∞';
      state.manifest[id] = null;
      dec.disabled = true;
      inc.disabled = true;
      if (inf) inf.disabled = true;
    } else {
      const v = Math.max(1, parseInt(raw) || 1);
      inp.value = v;
      state.manifest[id] = v;
      dec.disabled = false;
      inc.disabled = false;
      if (inf) inf.disabled = false;
    }
    autosave();
  });

  const inc = document.createElement('button');
  inc.textContent = '+';
  inc.disabled = isUnlimited;
  inc.addEventListener('click', () => adjustCount(id, inp, dec, inc, +1));

  const inf = document.createElement('button');
  inf.textContent = '∞';
  inf.title = 'Set unlimited';
  inf.addEventListener('click', () => {
    state.manifest[id] = null;
    inp.value = '∞';
    dec.disabled = true;
    inc.disabled = true;
    inf.disabled = true;
    autosave();
  });
  if (isUnlimited) inf.disabled = true;

  wrap.appendChild(dec);
  wrap.appendChild(inp);
  wrap.appendChild(inc);
  wrap.appendChild(inf);
  card.appendChild(wrap);

  // Card as drop target: same tile → increment; different tile → add/increment
  card.addEventListener('dragover', e => {
    if (e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      card.classList.add('drag-over');
    }
  });
  card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
  card.addEventListener('drop', e => {
    e.preventDefault();
    e.stopPropagation();
    card.classList.remove('drag-over');
    const droppedId = e.dataTransfer.getData('text/plain');
    if (droppedId && _getTileDef(droppedId)) addOrIncrement(droppedId);
  });

  return card;
}

// ── Count logic ───────────────────────────────────────────────────────────────

function adjustCount(id, inputEl, decBtn, incBtn, delta) {
  if (state.manifest[id] === null) return; // unlimited — ignore
  const next = Math.max(1, (parseInt(inputEl.value) || 1) + delta);
  inputEl.value = next;
  state.manifest[id] = next;
  autosave();
}

function addOrIncrement(id) {
  if (state.manifest[id] === null) {
    // Already unlimited — nothing to change
    return;
  }
  if (state.manifest[id] > 0) {
    // Existing tile: increment and update in-place (no rebuild needed)
    state.manifest[id]++;
    const card = document.querySelector(`.manifest-card[data-tile="${CSS.escape(id)}"]`);
    if (card) {
      const inp = card.querySelector('input[type="text"]');
      if (inp) inp.value = state.manifest[id];
    } else {
      buildManifestView(); // shouldn't happen but safe fallback
    }
  } else {
    // New tile: add with count 1 and rebuild to insert in sorted order
    state.manifest[id] = 1;
    buildManifestView();
  }
  autosave();
}

function removeFromManifest(id) {
  delete state.manifest[id];
  autosave();
  buildManifestView();
}
