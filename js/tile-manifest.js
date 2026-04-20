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
      .manifest-card {
        position:relative; display:inline-flex; flex-direction:column; align-items:center;
        background:linear-gradient(170deg,#2c2c2c 0%,#242424 100%);
        border:1px solid #3d3d3d; border-radius:10px;
        padding:9px 9px 10px; width:128px; box-sizing:border-box;
        box-shadow:0 2px 10px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.04);
        transition:border-color .15s,transform .12s,box-shadow .15s; cursor:default; }
      .manifest-card:hover {
        border-color:#5a5a5a; transform:translateY(-2px);
        box-shadow:0 6px 20px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06); }
      .manifest-card.is-unlimited {
        border-color:rgba(255,200,60,.3);
        box-shadow:0 2px 10px rgba(0,0,0,.45),0 0 14px rgba(255,200,60,.12),inset 0 1px 0 rgba(255,255,255,.04); }
      .manifest-card.is-unlimited:hover {
        border-color:rgba(255,200,60,.5);
        box-shadow:0 6px 20px rgba(0,0,0,.55),0 0 20px rgba(255,200,60,.2),inset 0 1px 0 rgba(255,255,255,.06); }
      .manifest-card.is-overridden {
        border-color:rgba(255,140,0,.45);
        box-shadow:0 2px 10px rgba(0,0,0,.45),0 0 14px rgba(255,140,0,.15),inset 0 1px 0 rgba(255,255,255,.04); }
      .manifest-card.is-overridden:hover {
        border-color:rgba(255,140,0,.7);
        box-shadow:0 6px 20px rgba(0,0,0,.55),0 0 22px rgba(255,140,0,.28),inset 0 1px 0 rgba(255,255,255,.06); }
      .manifest-card.drag-over { border-color:#88aaff; transform:scale(1.03); }
      .manifest-remove {
        position:absolute; top:5px; right:5px; width:17px; height:17px;
        background:rgba(180,40,30,.8); border:none; border-radius:50%; color:#fff;
        font-size:11px; line-height:17px; text-align:center; cursor:pointer;
        display:none; padding:0; z-index:3;
        transition:background .1s,transform .1s; }
      .manifest-remove:hover { background:#e03020; transform:scale(1.2); }
      .manifest-card:hover .manifest-remove { display:block; }
      .manifest-override-badge {
        position:absolute; top:5px; left:5px; width:17px; height:17px;
        background:rgba(200,100,0,.85); border:none; border-radius:50%; color:#fff;
        font-size:10px; line-height:17px; text-align:center;
        cursor:default; padding:0; z-index:3; pointer-events:all; }
      .manifest-override-swatch-dim { opacity:0.55; filter:sepia(0.4) brightness(0.75); }
      /* ── Stepper ── */
      /* ── Count display bar (above buttons, no text input) ── */
      .mc-count-bar {
        width:100%; margin-top:7px; height:22px;
        display:flex; align-items:center; justify-content:center;
        background:rgba(0,0,0,.35); border-radius:5px;
        font-size:13px; font-weight:700; font-variant-numeric:tabular-nums;
        color:#e8e8e8; letter-spacing:.03em; user-select:none; }
      .mc-count-bar.is-inf { color:#f0c040; font-size:12px; letter-spacing:.05em; }
      /* ── 4-button row ── */
      .mc-btns {
        display:grid; grid-template-columns:repeat(4,1fr); gap:4px;
        width:100%; margin-top:5px; }
      .mc-btn {
        height:26px; border:1px solid #333; border-radius:5px;
        background:#1c1c1c; color:#777; font-size:12px; font-weight:600;
        cursor:pointer; display:flex; align-items:center; justify-content:center;
        transition:background .1s,color .1s,transform .07s,border-color .1s; padding:0; }
      .mc-btn:hover { background:#272727; color:#ccc; border-color:#555; }
      .mc-btn:active { transform:scale(.86); color:#fff; }
      .mc-btn-reset { color:#5599ee; border-color:#2a3a55; }
      .mc-btn-reset:hover { background:#1a2840; color:#88bbff; border-color:#4477cc; }
      .mc-btn-inf { color:#666; }
      .mc-btn-inf.is-inf { color:#f0c040; background:rgba(240,192,64,.09); border-color:rgba(240,192,64,.35); }
      .mc-btn-inf.is-inf:hover { background:rgba(240,192,64,.16); border-color:rgba(240,192,64,.55); }
      #manifestGrid.accepting { outline:2px dashed #88aaff; outline-offset:-4px; border-radius:4px; }
      .manifest-drop-hint { color:#666; font-size:12px; margin:auto; padding:32px; text-align:center; user-select:none; line-height:1.8; }
    `;
    document.head.appendChild(style);
  }

  // Detect which manifest tiles have their embedded definition silently
  // overridden by a pack tile (non-identical DSL clash).
  // Keyed by tile id → collision object { id, sameDefinition, suggestedPackId }.
  const overrideMap = {};
  if (state.customTiles && Object.keys(state.customTiles).length > 0) {
    const cols = TileRegistry.detectEmbeddedCollisions(state.customTiles);
    for (const col of cols) {
      if (!col.sameDefinition) overrideMap[col.id] = col;
    }
  }

  const ids = sortedManifestIds();

  if (ids.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'manifest-drop-hint';
    hint.textContent = 'Drag tiles from the left panel to add them here';
    grid.appendChild(hint);
  } else {
    for (const id of ids) {
      grid.appendChild(makeManifestCard(id, overrideMap[id] || null));
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

// overrideInfo: { id, sameDefinition, suggestedPackId } from detectEmbeddedCollisions,
// or null when the tile is not overridden.
function makeManifestCard(id, overrideInfo) {
  const isUnlimited = state.manifest[id] === null;
  const isOverridden = !!overrideInfo; // non-identical DSL clash with a pack tile

  const card = document.createElement('div');
  card.className = 'manifest-card'
    + (isUnlimited  ? ' is-unlimited'  : '')
    + (isOverridden ? ' is-overridden' : '');
  card.setAttribute('data-tile', id);

  // ── Override badge (top-left, shown when pack tile wins over embedded def) ─
  if (isOverridden) {
    const badge = document.createElement('div');
    badge.className = 'manifest-override-badge';
    badge.textContent = '⚠';
    // Tooltip: explain what's happening and what to do.
    const { suggestedPackId } = overrideInfo;
    if (suggestedPackId && suggestedPackId !== id) {
      badge.title = `Your map.rb defines tile #${id}, but the pack tile #${id} renders instead.\nYour definition matches pack tile #${suggestedPackId}.\nRe-import and choose "Swap → pack #${suggestedPackId}" or "Build as custom" to resolve.`;
    } else {
      badge.title = `Your map.rb defines tile #${id}, but the pack tile #${id} renders instead (different definition).\nRe-import and choose "Build as custom" to preserve your map's version.`;
    }
    card.appendChild(badge);
  }

  // ── Remove button (shown on hover via CSS) ────────────────────────────────
  const removeBtn = document.createElement('button');
  removeBtn.className = 'manifest-remove';
  removeBtn.textContent = '×';
  removeBtn.title = `Remove tile #${id}`;
  removeBtn.addEventListener('click', e => { e.stopPropagation(); removeFromManifest(id); });
  card.appendChild(removeBtn);

  // ── SVG swatch — dimmed when overridden to signal it's not the map's def ──
  const svgWrap = document.createElement('div');
  if (isOverridden) svgWrap.className = 'manifest-override-swatch-dim';
  svgWrap.innerHTML = _makeSwatchSvg(id);
  card.appendChild(svgWrap);

  // ── Count display bar (read-only, no input) ───────────────────────────────
  const countBar = document.createElement('div');
  countBar.className = 'mc-count-bar' + (isUnlimited ? ' is-inf' : '');
  countBar.textContent = isUnlimited ? 'unlimited' : String(state.manifest[id] || 1);
  card.appendChild(countBar);

  // ── 4-button row: [↺ reset] [+1] [+5] [∞] ───────────────────────────────
  // ↺  = reset to 1 (blue)
  // +1 = increment by 1
  // +5 = increment by 5
  // ∞  = toggle unlimited (gold when active)
  const btns = document.createElement('div');
  btns.className = 'mc-btns';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'mc-btn mc-btn-reset';
  resetBtn.textContent = '↺';
  resetBtn.title = 'Reset to 1';

  const plus1Btn = document.createElement('button');
  plus1Btn.className = 'mc-btn';
  plus1Btn.textContent = '+1';
  plus1Btn.title = 'Add 1';

  const plus5Btn = document.createElement('button');
  plus5Btn.className = 'mc-btn';
  plus5Btn.textContent = '+5';
  plus5Btn.title = 'Add 5';

  const infBtn = document.createElement('button');
  infBtn.className = 'mc-btn mc-btn-inf' + (isUnlimited ? ' is-inf' : '');
  infBtn.textContent = '∞';
  infBtn.title = isUnlimited ? 'Click to set a fixed count' : 'Set unlimited';

  // Shared helper — refresh the display bar + card glow state
  function _refresh() {
    const unl = state.manifest[id] === null;
    countBar.textContent = unl ? 'unlimited' : String(state.manifest[id]);
    countBar.className = 'mc-count-bar' + (unl ? ' is-inf' : '');
    card.classList.toggle('is-unlimited', unl);
    infBtn.classList.toggle('is-inf', unl);
    infBtn.title = unl ? 'Click to set a fixed count' : 'Set unlimited';
    resetBtn.style.opacity = unl ? '0.25' : '1';
    plus1Btn.style.opacity = unl ? '0.25' : '1';
    plus5Btn.style.opacity = unl ? '0.25' : '1';
    resetBtn.disabled = unl;
    plus1Btn.disabled = unl;
    plus5Btn.disabled = unl;
  }
  _refresh(); // set initial disabled state

  resetBtn.addEventListener('click', () => {
    if (state.manifest[id] === null) return;
    state.manifest[id] = 1;
    _refresh();
    autosave();
  });
  plus1Btn.addEventListener('click', () => {
    if (state.manifest[id] === null) return;
    state.manifest[id] = (state.manifest[id] || 1) + 1;
    _refresh();
    autosave();
  });
  plus5Btn.addEventListener('click', () => {
    if (state.manifest[id] === null) return;
    state.manifest[id] = (state.manifest[id] || 1) + 5;
    _refresh();
    autosave();
  });
  infBtn.addEventListener('click', () => {
    if (state.manifest[id] === null) {
      state.manifest[id] = 1; // turn off unlimited
    } else {
      state.manifest[id] = null; // turn on unlimited
    }
    _refresh();
    autosave();
  });

  btns.appendChild(resetBtn);
  btns.appendChild(plus1Btn);
  btns.appendChild(plus5Btn);
  btns.appendChild(infBtn);
  card.appendChild(btns);

  // ── Card as drop target ───────────────────────────────────────────────────
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

function addOrIncrement(id) {
  if (state.manifest[id] === null) {
    // Already unlimited — nothing to change
    return;
  }
  if (state.manifest[id] > 0) {
    // Existing tile: increment and update display bar in-place (no rebuild needed)
    state.manifest[id]++;
    const card = document.querySelector(`.manifest-card[data-tile="${CSS.escape(id)}"]`);
    if (card) {
      const bar = card.querySelector('.mc-count-bar');
      if (bar) bar.textContent = String(state.manifest[id]);
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
