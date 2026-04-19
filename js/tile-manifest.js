// ─── TILE MANIFEST ────────────────────────────────────────────────────────────
// Panel view for configuring the tile box for a game.
// Replaces the canvas area (left sidebar stays visible for drag-and-drop).
// Load order: LAST — after all other modules.
//
// Tile sort order: yellow → green → brown → grey, numeric low→high per color.
// Drag from left sidebar → dropped tile added with count 1 (if new to manifest).
// Cards never show count 0. Hover reveals × to remove entirely.

// ── Tile def lookup ───────────────────────────────────────────────────────────

function _getTileDef(id) {
  return TileRegistry.getTileDef(id);
}

function _makeSwatchSvg(id) {
  return makeTileSwatchSvg(id);
}

// ── Sort ──────────────────────────────────────────────────────────────────────

const COLOR_ORDER = { white: -1, yellow: 0, green: 1, brown: 2, grey: 3 };

function tileSort(a, b) {
  const tdA = TileRegistry.getTileDef(a), tdB = TileRegistry.getTileDef(b);
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

// ── Toggle ────────────────────────────────────────────────────────────────────

function _enterManifest() {
  currentView = 'manifest';
  document.getElementById('canvasContainer').style.display = 'none';
  document.getElementById('tileManifestView').style.display = 'flex';
  document.getElementById('tileManifestBtn').textContent = 'Map';
  buildManifestView();
}

function _exitManifest() {
  currentView = 'map';
  document.getElementById('canvasContainer').style.display = '';
  document.getElementById('tileManifestView').style.display = 'none';
  document.getElementById('tileManifestBtn').textContent = 'Tile Manifest';
}

function toggleManifestView() {
  if (currentView === 'map') _enterManifest(); else _exitManifest();
}

document.getElementById('tileManifestBtn').addEventListener('click', toggleManifestView);
document.getElementById('manifestMapBtn').addEventListener('click', _exitManifest);

// ── Grid builder ──────────────────────────────────────────────────────────────

// ── Pack short labels ─────────────────────────────────────────────────────────

const PACK_LABELS = {
  'White Tiles': 'White',
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
    } else {
      const v = Math.max(1, parseInt(raw) || 1);
      inp.value = v;
      state.manifest[id] = v;
      dec.disabled = false;
      inc.disabled = false;
    }
    autosave();
  });

  const inc = document.createElement('button');
  inc.textContent = '+';
  inc.disabled = isUnlimited;
  inc.addEventListener('click', () => adjustCount(id, inp, dec, inc, +1));

  wrap.appendChild(dec);
  wrap.appendChild(inp);
  wrap.appendChild(inc);
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
