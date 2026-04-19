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
      .manifest-card.drag-over { border-color:#88aaff; transform:scale(1.03); }
      .manifest-remove {
        position:absolute; top:5px; right:5px; width:17px; height:17px;
        background:rgba(180,40,30,.8); border:none; border-radius:50%; color:#fff;
        font-size:11px; line-height:17px; text-align:center; cursor:pointer;
        display:none; padding:0; z-index:3;
        transition:background .1s,transform .1s; }
      .manifest-remove:hover { background:#e03020; transform:scale(1.2); }
      .manifest-card:hover .manifest-remove { display:block; }
      /* ── Stepper ── */
      .mc-stepper {
        display:flex; align-items:stretch; width:100%; margin-top:8px; height:30px;
        background:#161616; border:1px solid #333; border-radius:7px; overflow:hidden;
        box-shadow:inset 0 1px 3px rgba(0,0,0,.5); }
      .mc-btn {
        flex:0 0 28px; border:none; background:transparent; color:#666;
        font-size:17px; padding:0; cursor:pointer; display:flex;
        align-items:center; justify-content:center;
        transition:background .1s,color .12s,transform .08s; }
      .mc-btn:hover:not(:disabled) { background:#222; color:#ddd; }
      .mc-btn:active:not(:disabled) { transform:scale(.84); color:#fff; }
      .mc-btn:disabled { opacity:.18; cursor:default; }
      .mc-display {
        flex:1; min-width:0; display:flex; align-items:center; justify-content:center;
        border-left:1px solid #2a2a2a; border-right:1px solid #2a2a2a; }
      .mc-input {
        width:100%; text-align:center; background:transparent; border:none;
        outline:none; color:#e8e8e8; font-size:13px; font-weight:600;
        font-variant-numeric:tabular-nums; padding:0 3px;
        transition:color .15s; }
      .mc-input.is-inf { color:#f0c040; font-size:15px; letter-spacing:.02em; }
      .mc-inf {
        flex:0 0 26px; border:none; border-left:1px solid #2a2a2a;
        background:transparent; color:#444; font-size:13px;
        padding:0; cursor:pointer; display:flex; align-items:center; justify-content:center;
        transition:background .1s,color .12s; }
      .mc-inf:hover { background:#1e1e1e; color:#c8a020; }
      .mc-inf.is-inf { color:#f0c040; background:rgba(240,192,64,.07); }
      #manifestGrid.accepting { outline:2px dashed #88aaff; outline-offset:-4px; border-radius:4px; }
      .manifest-drop-hint { color:#666; font-size:12px; margin:auto; padding:32px; text-align:center; user-select:none; line-height:1.8; }
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
  const isUnlimited = state.manifest[id] === null;
  const count = isUnlimited ? 1 : (state.manifest[id] || 1);

  const card = document.createElement('div');
  card.className = 'manifest-card' + (isUnlimited ? ' is-unlimited' : '');
  card.setAttribute('data-tile', id);

  // ── Remove button (shown on hover via CSS) ────────────────────────────────
  const removeBtn = document.createElement('button');
  removeBtn.className = 'manifest-remove';
  removeBtn.textContent = '×';
  removeBtn.title = `Remove tile #${id}`;
  removeBtn.addEventListener('click', e => { e.stopPropagation(); removeFromManifest(id); });
  card.appendChild(removeBtn);

  // ── SVG swatch ────────────────────────────────────────────────────────────
  const svgWrap = document.createElement('div');
  svgWrap.innerHTML = _makeSwatchSvg(id);
  card.appendChild(svgWrap);

  // ── Casino-polish count stepper: [−] [display] [+] [∞] ───────────────────
  // null = unlimited (shown as ∞, gold glow on card + ∞ button active).
  // Typing ∞ / inf in the field also sets unlimited.

  const stepper = document.createElement('div');
  stepper.className = 'mc-stepper';

  const dec = document.createElement('button');
  dec.className = 'mc-btn';
  dec.textContent = '−';
  dec.disabled = isUnlimited;

  const display = document.createElement('div');
  display.className = 'mc-display';

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'mc-input' + (isUnlimited ? ' is-inf' : '');
  inp.value = isUnlimited ? '∞' : count;
  inp.title = 'Count (type ∞ for unlimited)';

  const inc = document.createElement('button');
  inc.className = 'mc-btn';
  inc.textContent = '+';
  inc.disabled = isUnlimited;

  const infBtn = document.createElement('button');
  infBtn.className = 'mc-inf' + (isUnlimited ? ' is-inf' : '');
  infBtn.textContent = '∞';
  infBtn.title = isUnlimited ? 'Click to set a fixed count' : 'Click for unlimited';

  // Shared helper — switches between unlimited and fixed-count mode
  function _setUnlimited(on) {
    if (on) {
      state.manifest[id] = null;
      inp.value = '∞';
      inp.classList.add('is-inf');
      dec.disabled = true;
      inc.disabled = true;
      infBtn.classList.add('is-inf');
      infBtn.title = 'Click to set a fixed count';
      card.classList.add('is-unlimited');
    } else {
      const v = Math.max(1, parseInt(inp.value) || 1);
      state.manifest[id] = v;
      inp.value = v;
      inp.classList.remove('is-inf');
      dec.disabled = false;
      inc.disabled = false;
      infBtn.classList.remove('is-inf');
      infBtn.title = 'Click for unlimited';
      card.classList.remove('is-unlimited');
    }
    autosave();
  }

  inp.addEventListener('change', () => {
    const raw = inp.value.trim();
    if (raw === '∞' || raw.toLowerCase() === 'inf' || raw === '') {
      _setUnlimited(true);
    } else {
      _setUnlimited(false); // sets inp.value = parseInt(inp.value)||1, state, autosave
    }
  });

  dec.addEventListener('click', () => adjustCount(id, inp, dec, inc, -1));
  inc.addEventListener('click', () => adjustCount(id, inp, dec, inc, +1));
  infBtn.addEventListener('click', () => _setUnlimited(state.manifest[id] !== null));

  display.appendChild(inp);
  stepper.appendChild(dec);
  stepper.appendChild(display);
  stepper.appendChild(inc);
  stepper.appendChild(infBtn);
  card.appendChild(stepper);

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
