// ─── FINANCIALS / MARKET PANEL ────────────────────────────────────────────────
// Three-column market view: sidebar (config) / center (grid) / inspector.
// Rewritten 2026-05.

// ── State helpers ────────────────────────────────────────────────────────────
function _ensureFinState() {
  if (!state.financials) {
    state.financials = {};
  }
  const f = state.financials;
  if (typeof f.bank !== 'number')           f.bank = 12000;
  if (!f.marketType)                        f.marketType = '2D';
  if (!Array.isArray(f.market))             f.market = [];
  if (typeof f.marketRows !== 'number')     f.marketRows = 11;
  if (typeof f.marketCols !== 'number')     f.marketCols = 19;
  if (!f.rules)                             f.rules = { dividend: 'right', withheld: 'left', soldOut: 'up', canPool: true };
  if (!Array.isArray(f.logicRules))         f.logicRules = [];
  if (!f.locks)                             f.locks = {};
  if (!f.bonusPerShare)                     f.bonusPerShare = {};
  if (typeof f.soldOutIncrease !== 'boolean') f.soldOutIncrease = true;
  if (!Array.isArray(f.unlimitedTypes))     f.unlimitedTypes = ['multiple_buy', 'unlimited', 'no_cert_limit'];
  if (!Array.isArray(f.multipleBuyTypes))   f.multipleBuyTypes = ['multiple_buy'];
  // Selection is transient (not autosaved persistently, but lives on state for cross-module access)
  if (f.selectedCell === undefined)         f.selectedCell = null;
}

function getCellRaw(r, c, oneD) {
  const m = state.financials.market;
  if (oneD) return m[c] || '';
  return (m[r] && m[r][c]) || '';
}
function setCellRaw(r, c, oneD, v) {
  const m = state.financials.market;
  if (oneD) m[c] = v;
  else if (m[r]) m[r][c] = v;
}

// ── Init ─────────────────────────────────────────────────────────────────────
function initFinancialsListeners() {
  _ensureFinState();
  _wireSidebar();
  _wireInspectorTabs();
  _wireToolbarBrushes();
  _wireNudgeAndDebug();
  syncFinancialsUI();
  renderMarketEditor();
  renderCellInspector();
  renderRulesPanel();
}

function _wireSidebar() {
  const bankInput = document.getElementById('finBank');
  const typeSelect = document.getElementById('finMarketType');
  const rowInput = document.getElementById('finMarketRows');
  const colInput = document.getElementById('finMarketCols');
  const countInput = document.getElementById('finMarketCount');

  bankInput.addEventListener('change', (e) => {
    state.financials.bank = parseInt(e.target.value, 10) || 0;
    document.getElementById('bankCashVal') && (document.getElementById('bankCashVal').textContent = state.financials.bank);
    const wide = document.getElementById('bankCashValWide');
    if (wide) wide.textContent = state.financials.bank;
    autosave();
  });

  typeSelect.addEventListener('change', (e) => {
    state.financials.marketType = e.target.value;
    document.getElementById('finMarket2DConfig').style.display = (e.target.value === '2D' ? 'grid' : 'none');
    document.getElementById('finMarket1DConfig').style.display = (e.target.value !== '2D' ? 'grid' : 'none');
    resetMarketStructure();
    state.financials.selectedCell = null;
    renderMarketEditor();
    renderCellInspector();
    autosave();
  });

  [rowInput, colInput, countInput].forEach(el => {
    if (!el) return;
    el.addEventListener('change', () => {
      state.financials.marketRows = parseInt(rowInput.value, 10) || 1;
      state.financials.marketCols = parseInt(colInput.value, 10) || 1;
      resizeMarketStructure();
      renderMarketEditor();
      autosave();
    });
  });

  // Templates
  const templates = {
    tmpl1830: applyTemplate1830,
    tmplChesa: applyTemplate18Chesa,
    tmpl1846: applyTemplate1846,
    tmpl1817: applyTemplate1817,
    tmpl1822: applyTemplate1822,
    tmpl1862: applyTemplate1862,
  };
  for (const [id, fn] of Object.entries(templates)) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', fn);
  }
}

function _wireInspectorTabs() {
  document.querySelectorAll('.mkt-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mkt-tab').forEach(t => {
        const active = t === tab;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      const which = tab.dataset.tab;
      document.getElementById('insPanelCell').hidden  = (which !== 'cell');
      document.getElementById('insPanelRules').hidden = (which !== 'rules');
    });
  });
}

function _wireToolbarBrushes() {
  // Tools and brushes both live on .mkt-tool / .mkt-brush; market-painter.js binds them.
  // Initialize default brush state via market-painter init.
}

function _wireNudgeAndDebug() {
  const debugBtn = document.getElementById('marketDebugBtn');
  if (debugBtn) debugBtn.addEventListener('click', showMarketDebug);
  const nudgeDismiss = document.getElementById('marketNudgeDismissBtn');
  const nudgeRegen   = document.getElementById('marketNudgeRegenBtn');
  if (nudgeDismiss) nudgeDismiss.addEventListener('click', _hideMarketRegenNudge);
  if (nudgeRegen)   nudgeRegen.addEventListener('click', () => {
    _hideMarketRegenNudge();
    const btn = document.getElementById('wizGenerateBtn');
    if (btn) btn.click();
  });
}

// ── Reset / resize structure ────────────────────────────────────────────────
function resetMarketStructure() {
  const f = state.financials;
  if (f.marketType === '2D') {
    f.market = Array.from({ length: f.marketRows }, () =>
      Array.from({ length: f.marketCols }, () => '')
    );
  } else {
    const count = parseInt(document.getElementById('finMarketCount')?.value, 10) || 10;
    f.market = Array.from({ length: count }, () => '');
  }
  f.locks = {};
}

function resizeMarketStructure() {
  const f = state.financials;
  if (f.marketType === '2D') {
    if (!Array.isArray(f.market) || !Array.isArray(f.market[0])) {
      resetMarketStructure();
      return;
    }
    while (f.market.length < f.marketRows) f.market.push(Array.from({ length: f.marketCols }, () => ''));
    f.market = f.market.slice(0, f.marketRows);
    f.market = f.market.map(row => {
      while (row.length < f.marketCols) row.push('');
      return row.slice(0, f.marketCols);
    });
  } else {
    const count = parseInt(document.getElementById('finMarketCount')?.value, 10) || 10;
    if (!Array.isArray(f.market) || Array.isArray(f.market[0])) {
      f.market = Array.from({ length: count }, () => '');
    } else {
      while (f.market.length < count) f.market.push('');
      f.market = f.market.slice(0, count);
    }
  }
}

// ── Sync sidebar inputs after a state change ────────────────────────────────
function syncFinancialsUI() {
  const f = state.financials;
  const bank = document.getElementById('finBank');
  const wide = document.getElementById('bankCashValWide');
  const tSel = document.getElementById('finMarketType');
  const r = document.getElementById('finMarketRows');
  const c = document.getElementById('finMarketCols');
  const cnt = document.getElementById('finMarketCount');
  if (bank) bank.value = f.bank;
  if (wide) wide.textContent = f.bank;
  if (tSel) tSel.value = f.marketType;
  if (r) r.value = f.marketRows;
  if (c) c.value = f.marketCols;
  if (cnt) cnt.value = Array.isArray(f.market[0]) ? '' : f.market.length;
  document.getElementById('finMarket2DConfig').style.display = (f.marketType === '2D' ? 'grid' : 'none');
  document.getElementById('finMarket1DConfig').style.display = (f.marketType !== '2D' ? 'grid' : 'none');
}

// ── Adjacency (used for empty-cell type-to-fill) ────────────────────────────
function _hasFilledNeighbor(r, c, market) {
  return [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].some(([nr,nc]) =>
    nr >= 0 && nr < market.length && nc >= 0 && nc < (market[nr]?.length ?? 0) && market[nr][nc]
  );
}

// ── Render market grid ──────────────────────────────────────────────────────
function renderMarketEditor() {
  const host = document.getElementById('marketContainerWide');
  if (!host) return;
  host.innerHTML = '';

  const f = state.financials;
  const oneD = f.marketType !== '2D';

  if (oneD) {
    const strip = document.createElement('div');
    strip.className = 'mkt-1d-strip';
    f.market.forEach((val, c) => strip.appendChild(buildCell(0, c, val, true)));
    host.appendChild(strip);
  } else {
    const table = document.createElement('table');
    table.className = 'mkt-grid-table';
    f.market.forEach((row, r) => {
      const tr = document.createElement('tr');
      row.forEach((val, c) => {
        const td = document.createElement('td');
        td.style.padding = '0';
        td.appendChild(buildCell(r, c, val, false));
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    host.appendChild(table);
  }
  renderLegend();
  renderValidation();
}

// Build a single cell element.
function buildCell(r, c, val, oneD) {
  const cell = document.createElement('div');
  cell.className = 'mkt-cell';
  cell.dataset.r = String(r);
  cell.dataset.c = String(c);
  if (oneD) cell.dataset.oneD = '1';

  const price = document.createElement('span');
  price.className = 'mkt-cell-price';
  cell.appendChild(price);

  const lock = document.createElement('span');
  lock.className = 'mkt-cell-lock';
  lock.setAttribute('aria-hidden', 'true');
  cell.appendChild(lock);

  applyCellStyle(cell, r, c, val);

  if (typeof attachCellPainter === 'function') attachCellPainter(cell, r, c);

  return cell;
}

// Apply visual state to a cell wrapper.
function applyCellStyle(cellEl, r, c, val) {
  const oneD = cellEl.dataset.oneD === '1';
  const parsed = parseCell(val);
  const priceEl = cellEl.querySelector('.mkt-cell-price');

  // Reset
  cellEl.className = 'mkt-cell';
  if (oneD) cellEl.dataset.oneD = '1';
  cellEl.style.removeProperty('--c-bg');
  cellEl.style.removeProperty('--c-fg');
  // Clear any extra mark elements
  cellEl.querySelectorAll('.mkt-cell-mark, .mkt-cell-mark-extra').forEach(n => n.remove());

  if (parsed.price == null) {
    cellEl.classList.add('is-empty');
    if (!oneD && _hasFilledNeighbor(r, c, state.financials.market)) {
      cellEl.classList.add('is-adjacent');
    }
    priceEl.textContent = '';
    return;
  }

  priceEl.textContent = String(parsed.price);

  const primary = cellPrimary(parsed);
  if (primary && FLAG_DEFS[primary]) {
    const color = FLAG_DEFS[primary].color;
    cellEl.style.setProperty('--c-bg', color);
    const lightBg = _isLightColor(color);
    cellEl.style.setProperty('--c-fg', lightBg ? '#1a1a1a' : '#fff');
  }

  // Single-letter mark for the most-significant secondary
  const secs = cellSecondaries(parsed);
  if (secs.length > 0) {
    const t = secs[0];
    const def = FLAG_DEFS[t];
    if (def) {
      const m = document.createElement('span');
      m.className = 'mkt-cell-mark';
      m.textContent = def.char;
      m.title = def.label;
      cellEl.appendChild(m);
    }
    if (secs.length > 1) {
      const more = document.createElement('span');
      more.className = 'mkt-cell-mark-extra';
      more.textContent = `+${secs.length - 1}`;
      more.title = secs.slice(1).map(t => FLAG_DEFS[t]?.label).filter(Boolean).join(', ');
      cellEl.appendChild(more);
    }
  }

  if (state.financials.locks && state.financials.locks[`${r},${c}`]) {
    cellEl.classList.add('is-locked');
  }

  // Selection ring
  const sel = state.financials.selectedCell;
  if (sel && sel.r === r && sel.c === c) cellEl.classList.add('is-selected');

  // Tooltip
  const labels = cellOrderedTypes(parsed).map(({ def }) => def.label);
  cellEl.title = labels.length ? `${parsed.price} — ${labels.join(' · ')}` : String(parsed.price);
}

function _isLightColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return false;
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 0xff, g = (v >> 8) & 0xff, b = v & 0xff;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 165;
}

// Refresh a single cell.
function renderOneCell(r, c) {
  const oneD = state.financials.marketType !== '2D';
  const sel = oneD
    ? `.mkt-cell[data-r="0"][data-c="${c}"]`
    : `.mkt-cell[data-r="${r}"][data-c="${c}"]`;
  const el = document.querySelector(sel);
  if (!el) return;
  const val = oneD ? state.financials.market[c] : state.financials.market[r]?.[c];
  applyCellStyle(el, r, c, val);
}

// ── Selection ───────────────────────────────────────────────────────────────
function selectCell(r, c) {
  const oneD = state.financials.marketType !== '2D';
  const cur = state.financials.selectedCell;
  // De-highlight previous
  if (cur) {
    const prev = document.querySelector(`.mkt-cell[data-r="${cur.r}"][data-c="${cur.c}"]`);
    if (prev) prev.classList.remove('is-selected');
  }
  state.financials.selectedCell = { r, c };
  const next = document.querySelector(oneD
    ? `.mkt-cell[data-r="0"][data-c="${c}"]`
    : `.mkt-cell[data-r="${r}"][data-c="${c}"]`);
  if (next) next.classList.add('is-selected');
  renderCellInspector();
  // Switch to Cell tab
  const cellTab = document.getElementById('insTabCell');
  if (cellTab && !cellTab.classList.contains('active')) cellTab.click();
}

function clearSelection() {
  const cur = state.financials.selectedCell;
  if (cur) {
    const el = document.querySelector(`.mkt-cell[data-r="${cur.r}"][data-c="${cur.c}"]`);
    if (el) el.classList.remove('is-selected');
  }
  state.financials.selectedCell = null;
  renderCellInspector();
}

// ── Cell inspector (right rail Cell tab) ────────────────────────────────────
function renderCellInspector() {
  const panel = document.getElementById('insPanelCell');
  if (!panel) return;
  const sel = state.financials.selectedCell;
  if (!sel) {
    panel.innerHTML = `<div class="mkt-ins-empty">Click a cell to inspect or edit it.<br>Use brushes to paint.<br>Drag to fill multiple cells.</div>`;
    return;
  }
  const { r, c } = sel;
  const oneD = state.financials.marketType !== '2D';
  const val = getCellRaw(r, c, oneD);
  const parsed = parseCell(val);
  const locked = !!(state.financials.locks && state.financials.locks[`${r},${c}`]);
  const coordLabel = oneD ? `Cell ${c + 1}` : `Row ${r + 1} · Col ${c + 1}`;

  panel.innerHTML = `
    <div class="mkt-ins-coord">${coordLabel}</div>
    <div class="mkt-ins-price-row">
      <input type="text" inputmode="numeric" id="insPrice" class="mkt-ins-price-input" value="${parsed.price ?? ''}" placeholder="Price" aria-label="Price">
      <label class="mkt-ins-lock-toggle">
        <input type="checkbox" id="insLock" ${locked ? 'checked' : ''}>
        <span>Lock</span>
      </label>
    </div>
    <div id="insFlagSections"></div>
    <div class="mkt-ins-actions">
      <button id="insClearFlags" type="button" class="mkt-btn">Clear flags</button>
      <button id="insDelete" type="button" class="mkt-btn mkt-btn-danger">Delete cell</button>
    </div>
  `;

  // Build flag toggles by category
  const sections = panel.querySelector('#insFlagSections');
  for (const cat of BRUSH_CATEGORY_ORDER) {
    const flags = Object.keys(FLAG_DEFS).filter(t => FLAG_DEFS[t].category === cat);
    if (!flags.length) continue;
    const sec = document.createElement('div');
    sec.className = 'mkt-ins-section';
    const title = document.createElement('div');
    title.className = 'mkt-ins-section-title';
    title.textContent = BRUSH_CATEGORY_LABEL[cat];
    sec.appendChild(title);
    const grid = document.createElement('div');
    grid.className = 'mkt-ins-flags';
    for (const type of flags) {
      const def = FLAG_DEFS[type];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mkt-ins-flag';
      btn.dataset.flag = type;
      btn.style.setProperty('--flag-color', def.color);
      btn.title = def.text;
      const on = (parsed.types || []).includes(type);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.innerHTML = `<span class="mkt-ins-flag-swatch"></span><span>${def.label}</span>`;
      btn.addEventListener('click', () => _inspectorToggleFlag(r, c, oneD, type));
      grid.appendChild(btn);
    }
    sec.appendChild(grid);
    // Inline bonus row when a bonus flag is enabled
    if (cat === 'bonus') {
      const enabledBonus = flags.filter(t => (parsed.types || []).includes(t));
      enabledBonus.forEach(type => {
        const def = FLAG_DEFS[type];
        const row = document.createElement('div');
        row.className = 'mkt-ins-bonus-row';
        row.innerHTML = `
          <label>${def.label} per share</label>
          <input type="text" inputmode="numeric" class="mkt-ins-bonus-input" data-bonus="${type}" value="${state.financials.bonusPerShare[type] != null ? state.financials.bonusPerShare[type] : ''}" placeholder="0">
        `;
        sec.appendChild(row);
      });
    }
    sections.appendChild(sec);
  }

  // Wire price + lock
  panel.querySelector('#insPrice').addEventListener('change', (e) => _inspectorSetPrice(r, c, oneD, e.target.value));
  panel.querySelector('#insLock').addEventListener('change', (e) => _inspectorSetLock(r, c, oneD, e.target.checked));
  panel.querySelector('#insClearFlags').addEventListener('click', () => {
    const cur = parseCell(getCellRaw(r, c, oneD));
    if (cur.price == null) return;
    setCellRaw(r, c, oneD, serializeCell({ price: cur.price, types: [] }));
    renderOneCell(r, c);
    renderCellInspector();
    renderLegend();
    renderValidation();
    autosave();
  });
  panel.querySelector('#insDelete').addEventListener('click', () => {
    setCellRaw(r, c, oneD, '');
    if (state.financials.locks) delete state.financials.locks[`${r},${c}`];
    renderOneCell(r, c);
    renderCellInspector();
    renderLegend();
    renderValidation();
    autosave();
  });
  panel.querySelectorAll('.mkt-ins-bonus-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const type = inp.dataset.bonus;
      const n = parseInt(inp.value, 10);
      if (isNaN(n)) delete state.financials.bonusPerShare[type];
      else state.financials.bonusPerShare[type] = n;
      autosave();
    });
  });
}

function _inspectorToggleFlag(r, c, oneD, type) {
  const cur = parseCell(getCellRaw(r, c, oneD));
  if (cur.price == null) return;
  const updated = setCellFlag(cur, type, !cur.types.includes(type));
  setCellRaw(r, c, oneD, serializeCell(updated));
  renderOneCell(r, c);
  renderCellInspector();
  renderLegend();
  renderValidation();
  autosave();
}

function _inspectorSetPrice(r, c, oneD, raw) {
  const n = parseInt(raw, 10);
  const cur = parseCell(getCellRaw(r, c, oneD));
  if (isNaN(n)) {
    setCellRaw(r, c, oneD, '');
    if (state.financials.locks) delete state.financials.locks[`${r},${c}`];
  } else {
    setCellRaw(r, c, oneD, serializeCell({ price: n, types: cur.types || [] }));
  }
  renderOneCell(r, c);
  renderLegend();
  renderValidation();
  autosave();
}

function _inspectorSetLock(r, c, oneD, on) {
  const cur = parseCell(getCellRaw(r, c, oneD));
  const key = `${r},${c}`;
  if (on && cur.price != null) state.financials.locks[key] = cur.price;
  else delete state.financials.locks[key];
  renderOneCell(r, c);
  autosave();
}

// ── Movement rules tab ──────────────────────────────────────────────────────
function renderRulesPanel() {
  const panel = document.getElementById('insPanelRules');
  if (!panel) return;
  const f = state.financials;

  const dirRow = (label, key, val) => `
    <div class="mkt-rules-row">
      <div class="mkt-rules-row-label">${label}</div>
      <div class="mkt-segmented" data-rule="${key}">
        ${[
          ['right','→ Right'],
          ['left', '← Left'],
          ['up',   '↑ Up'],
          ['down', '↓ Down'],
        ].map(([v, lbl]) => `<button type="button" data-val="${v}" aria-pressed="${val===v}">${lbl}</button>`).join('')}
      </div>
    </div>
  `;

  panel.innerHTML = `
    ${dirRow('Dividend paid',     'dividend', f.rules.dividend || 'right')}
    ${dirRow('Dividend withheld', 'withheld', f.rules.withheld || 'left')}
    <p class="mkt-rules-note" style="margin: 0 0 16px;">
      These are simple one-step defaults: pay ⇒ right 1, withhold ⇒ left 1.
      For tiered ladders (1822 double-pay, 1846 half-pay, 1862 four-tier, etc.),
      configure the Dividend step in
      <a href="#" id="rulesGotoSteps" class="mkt-rules-link">Steps →</a>.
    </p>

    ${dirRow('Sold out (end of SR)', 'soldOut', f.rules.soldOut || 'up')}

    <label class="mkt-toggle-row" style="margin: 6px 0 16px;">
      <input type="checkbox" id="rulesSoldOutInc" ${f.soldOutIncrease ? 'checked' : ''}>
      <span>Sold-out cells move price (SOLD_OUT_INCREASE)</span>
    </label>

    <div class="mkt-rules-row">
      <div class="mkt-rules-row-label">Cert-limit exemption</div>
      <div class="mkt-ins-flags" id="rulesCertTypes"></div>
      <p class="mkt-rules-note">Cell flags whose corporations don't count toward the cert limit. Default: multiple_buy, unlimited, no_cert_limit.</p>
    </div>

    <div class="mkt-rules-row">
      <div class="mkt-rules-row-label">Multiple-buy types</div>
      <div class="mkt-ins-flags" id="rulesMultiBuy"></div>
      <p class="mkt-rules-note">Cell flags whose corporations can be bought more than once per turn. Default: multiple_buy.</p>
    </div>

    <p class="mkt-rules-note" style="border-top:1px solid var(--mkt-border); padding-top:12px; margin-top:12px;">
      Sell movement (SELL_MOVEMENT, POOL_SHARE_DROP, MUST_SELL_IN_BLOCKS) lives in
      <a href="#" id="rulesGotoMechanics" class="mkt-rules-link">Mechanics →</a>
      — share-sale rules belong with the operating round.
    </p>
  `;

  // Wire direction segments
  panel.querySelectorAll('.mkt-segmented').forEach(seg => {
    const key = seg.dataset.rule;
    seg.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        f.rules[key] = btn.dataset.val;
        seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
        autosave();
      });
    });
  });
  panel.querySelector('#rulesSoldOutInc').addEventListener('change', e => {
    f.soldOutIncrease = !!e.target.checked;
    autosave();
  });

  // Cross-panel jump links
  const stepsLink = panel.querySelector('#rulesGotoSteps');
  if (stepsLink) stepsLink.addEventListener('click', (e) => {
    e.preventDefault();
    const btn = document.querySelector('.nav-rail-btn[data-lsec="steps"]');
    if (btn) btn.click();
  });
  const mechLink = panel.querySelector('#rulesGotoMechanics');
  if (mechLink) mechLink.addEventListener('click', (e) => {
    e.preventDefault();
    const btn = document.querySelector('.nav-rail-btn[data-lsec="mechanics"]');
    if (btn) btn.click();
  });

  // Cert-limit and multi-buy flag chips
  const TYPE_CHOICES = ['multiple_buy', 'unlimited', 'no_cert_limit'];
  const certHost = panel.querySelector('#rulesCertTypes');
  const multiHost = panel.querySelector('#rulesMultiBuy');
  for (const type of TYPE_CHOICES) {
    const def = FLAG_DEFS[type];
    const certBtn = _makeRuleFlagToggle(type, def, f.unlimitedTypes.includes(type), (on) => {
      if (on && !f.unlimitedTypes.includes(type)) f.unlimitedTypes.push(type);
      else f.unlimitedTypes = f.unlimitedTypes.filter(t => t !== type);
      autosave();
    });
    certHost.appendChild(certBtn);
    const mbBtn = _makeRuleFlagToggle(type, def, f.multipleBuyTypes.includes(type), (on) => {
      if (on && !f.multipleBuyTypes.includes(type)) f.multipleBuyTypes.push(type);
      else f.multipleBuyTypes = f.multipleBuyTypes.filter(t => t !== type);
      autosave();
    });
    multiHost.appendChild(mbBtn);
  }
}

function _makeRuleFlagToggle(type, def, initial, onChange) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mkt-ins-flag';
  btn.dataset.flag = type;
  btn.style.setProperty('--flag-color', def.color);
  btn.title = def.text;
  btn.setAttribute('aria-pressed', initial ? 'true' : 'false');
  btn.innerHTML = `<span class="mkt-ins-flag-swatch"></span><span>${def.label}</span>`;
  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    onChange(on);
  });
  return btn;
}

// ── Legend ─────────────────────────────────────────────────────────────────
function renderLegend() {
  const host = document.getElementById('marketLegend');
  if (!host) return;
  host.innerHTML = '';
  const flat = (Array.isArray(state.financials.market[0]) ? state.financials.market.flat() : state.financials.market) || [];
  const present = new Set();
  for (const v of flat) {
    if (!v) continue;
    for (const t of parseCell(v).types) present.add(t);
  }
  const ordered = FLAG_SERIALIZE_ORDER.filter(t => present.has(t));
  for (const type of ordered) {
    const def = FLAG_DEFS[type];
    const item = document.createElement('div');
    item.className = 'mkt-legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'mkt-legend-swatch';
    swatch.style.background = def.color;
    item.appendChild(swatch);
    const label = document.createElement('span');
    label.textContent = def.label;
    item.appendChild(label);
    host.appendChild(item);
  }

  // Par range — show the discoverable par prices derived from p/x/z/w/P-flagged
  // cells. Two views: a compact "Par range: $X–$Y" min-to-max line, and (when
  // pars don't form a contiguous min-to-max sweep) the explicit list. The
  // companies panel can call getParPrices()/getParMin()/getParMax() directly
  // to constrain its parValue picker.
  if (typeof getParPrices === 'function') {
    const pars = getParPrices(state.financials.market);
    if (pars.length) {
      const min = pars[0], max = pars[pars.length - 1];

      const rangeItem = document.createElement('div');
      rangeItem.className = 'mkt-legend-item mkt-legend-pars';
      rangeItem.title = 'Companies par between these bounds (full set on the right when distinct)';
      const lbl = document.createElement('span');
      lbl.style.fontWeight = '600';
      lbl.textContent = 'Par range:';
      rangeItem.appendChild(lbl);
      const range = document.createElement('span');
      range.textContent = (min === max) ? `$${min}` : `$${min}–$${max}`;
      rangeItem.appendChild(range);
      host.appendChild(rangeItem);

      if (pars.length > 2) {
        const listItem = document.createElement('div');
        listItem.className = 'mkt-legend-item mkt-legend-par-list';
        const listLbl = document.createElement('span');
        listLbl.style.fontWeight = '600';
        listLbl.textContent = 'Par prices:';
        listItem.appendChild(listLbl);
        const vals = document.createElement('span');
        vals.textContent = pars.join(' · ');
        listItem.appendChild(vals);
        host.appendChild(listItem);
      }
    }
  }
}

// ── Validation ─────────────────────────────────────────────────────────────
function renderValidation() {
  const host = document.getElementById('marketValidation');
  if (!host) return;
  const f = state.financials;
  const flat = (Array.isArray(f.market[0]) ? f.market.flat() : f.market) || [];
  const cells = flat.filter(Boolean).map(parseCell);
  const PAR_TYPES = ['par', 'par_1', 'par_2', 'par_3', 'par_overlap'];

  const issues = [];
  if (cells.length === 0) {
    issues.push({ kind: 'error', text: 'Market is empty' });
  } else {
    const parCells = cells.filter(c => c.types.some(t => PAR_TYPES.includes(t)));
    if (parCells.length === 0) {
      issues.push({ kind: 'error', text: 'No par cells defined' });
    }
    // Pays_bonus cells must have a configured bonus value
    const BONUS = ['pays_bonus','pays_bonus_1','pays_bonus_2','pays_bonus_3','pays_bonus_4'];
    for (const t of BONUS) {
      const has = cells.some(c => c.types.includes(t));
      if (has && state.financials.bonusPerShare[t] == null) {
        issues.push({ kind: 'warn', text: `${FLAG_DEFS[t].label} cells need a per-share bonus value` });
      }
    }
  }

  if (issues.length === 0) {
    const parCount = cells.filter(c => c.types.some(t => PAR_TYPES.includes(t))).length;
    host.dataset.state = 'ok';
    host.textContent = `${parCount} par cell${parCount === 1 ? '' : 's'} · ${cells.length} total`;
    host.title = '';
  } else {
    const errors = issues.filter(i => i.kind === 'error');
    host.dataset.state = errors.length ? 'error' : 'warn';
    host.textContent = errors.length
      ? `${errors.length} error${errors.length === 1 ? '' : 's'}`
      : `${issues.length} warning${issues.length === 1 ? '' : 's'}`;
    host.title = issues.map(i => `${i.kind === 'error' ? '✕' : '!'} ${i.text}`).join('\n');
  }
}

// ── Templates ──────────────────────────────────────────────────────────────
function _applyTemplate(opts) {
  const f = state.financials;
  Object.assign(f, opts);
  f.locks = {};
  f.selectedCell = null;
  syncFinancialsUI();
  renderMarketEditor();
  renderCellInspector();
  renderRulesPanel();
  autosave();
}

function applyTemplate18Chesa() {
  _applyTemplate({
    marketType: '2D',
    marketRows: 8,
    marketCols: 17,
    bank: 8000,
    market: [
      ['80', '85', '90', '100', '110', '125', '140', '160', '180', '200', '225', '250', '275', '300', '325', '350', '375'],
      ['75', '80', '85', '90', '100', '110', '125', '140', '160', '180', '200', '225', '250', '275', '300', '325', '350'],
      ['70', '75', '80', '85', '95p', '105', '115', '130', '145', '160', '180', '200', '', '', '', '', ''],
      ['65', '70', '75', '80p', '85', '95', '105', '115', '130', '145', '', '', '', '', '', '', ''],
      ['60', '65', '70p', '75', '80', '85', '95', '105', '', '', '', '', '', '', '', '', ''],
      ['55y', '60', '65', '70', '75', '80', '', '', '', '', '', '', '', '', '', '', ''],
      ['50y', '55y', '60', '65', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['40y', '45y', '50y', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ],
  });
}

function applyTemplate1830() {
  _applyTemplate({
    marketType: '2D',
    marketRows: 11,
    marketCols: 19,
    bank: 12000,
    market: [
      ['60y','67','71','76','82','90','100p','112','126','142','160','180','200','225','250','275','300','325','350'],
      ['53y','60y','66','70','76','82','90p','100','112','126','142','160','180','200','220','240','260','280','300'],
      ['46y','55y','60y','65','70','76','82p','90','100','111','125','140','155','170','185','200','','',''],
      ['39o','48y','54y','60y','66','71','76p','82','90','100','110','120','130','','','','','',''],
      ['32o','41o','48y','55y','62','67','71p','76','82','90','100','','','','','','','',''],
      ['25b','34o','42o','50y','58y','65','67p','71','75','80','','','','','','','','',''],
      ['18b','27b','36o','45o','54y','63','67','69','70','','','','','','','','','',''],
      ['10b','20b','30b','40o','50y','60y','67','68','','','','','','','','','','',''],
      ['','10b','20b','30b','40o','50y','60y','','','','','','','','','','','',''],
      ['','','10b','20b','30b','40o','50y','','','','','','','','','','','',''],
      ['','','','10b','20b','30b','40o','','','','','','','','','','','',''],
    ],
  });
}

function applyTemplate1846() {
  _applyTemplate({
    marketType: '1D',
    bank: 6500,
    market: ['10b','20b','30b','40b','50y','60y','70y','80y','90y','100p','112','124','137','150','165','180','200','220','245','270','300','330','360','400','440','490','540','600'],
  });
}

function applyTemplate1817() {
  _applyTemplate({
    marketType: '1D',
    bank: 12000,
    market: ['0l','0a','0a','0a','40','45','50p','55s','60p','65p','70s','80p','90p','100p','110p','120s','135p','150p','165p','180p','200p','220','245','270','300','330','360','400','440','490','540','600'],
  });
}

function applyTemplate1822() {
  _applyTemplate({
    marketType: '2D',
    marketRows: 15,
    marketCols: 21,
    bank: 12000,
    market: [
      ['','','','','','','','','','','','','','','','','','550','600','650','700e'],
      ['','','','','','','','','','','','','','330','360','400','450','500','550','600','650'],
      ['','','','','','','','','','200','220','245','270','300','330','360','400','450','500','550','600'],
      ['70','80','90','100','110','120','135','150','165','180','200','220','245','270','300','330','360','400','450','500','550'],
      ['60','70','80','90','100xp','110','120','135','150','165','180','200','220','245','270','300','330','360','400','450','500'],
      ['50','60','70','80','90xp','100','110','120','135','150','165','180','200','220','245','270','300','330','','',''],
      ['45y','50','60','70','80xp','90','100','110','120','135','150','165','180','200','220','245','','','','',''],
      ['40y','45y','50','60','70xp','80','90','100','110','120','135','150','165','180','','','','','','',''],
      ['35y','40y','45y','50','60xp','70','80','90','100','110','120','135','','','','','','','','',''],
      ['30y','35y','40y','45y','50p','60','70','80','90','100','','','','','','','','','','',''],
      ['25y','30y','35y','40y','45y','50','60','70','80','','','','','','','','','','','',''],
      ['20y','25y','30y','35y','40y','45y','50y','60y','','','','','','','','','','','','',''],
      ['15y','20y','25y','30y','35y','40y','45y','','','','','','','','','','','','','',''],
      ['10y','15y','20y','25y','30y','35y','','','','','','','','','','','','','','',''],
      ['5y','10y','15y','20y','25y','','','','','','','','','','','','','','','',''],
    ],
  });
}

function applyTemplate1862() {
  _applyTemplate({
    marketType: 'zigzag',
    ledgeMovement: true,           // 1862 passes ledge_movement: true to StockMarket.new
    bank: 15000,
    market: ['0c','7i','14i','20i','26i','31i','36i','40','44','47','50','52','54p','56r','58p','60r','62p','65r','68p','71r','74p','78r','82p','86r','90p','95r','100p','105r','110r','116r','122r','128r','134r','142r','150r','158r','166r','174r','182r','191r','200r','210i','220i','232i','245i','260i','275i','292i','310i','330i','350i','375i','400j','430j','460j','495j','530j','570j','610j','655j','700j','750j','800j','850j','900j','950j','1000e'],
  });
}

// ── Debug (Ruby export modal) ──────────────────────────────────────────────
function showMarketDebug() {
  const market = state.financials.market;
  const oneD = !Array.isArray(market[0]);
  let out = '';
  const fmt = (v) => v ? `'${v}'` : "''";
  if (!oneD) {
    out = '[\n' + market.map(row => '  [' + row.map(fmt).join(', ') + ']').join(',\n') + '\n].freeze';
  } else {
    let line = '', lines = [];
    market.forEach((c, i) => {
      const sep = i === 0 ? '' : ', ';
      const tok = fmt(c);
      if (line.length + sep.length + tok.length > 78) { lines.push(line); line = ' ' + tok; }
      else line += sep + tok;
    });
    if (line) lines.push(line);
    out = '[\n  [' + lines.join(',\n   ') + '],\n].freeze';
  }
  const modal = document.getElementById('marketDebugModal');
  const ta = document.getElementById('marketDebugTextarea');
  const copy = document.getElementById('debugCopyBtn');
  if (!modal || !ta) {
    // Fallback: alert
    alert(out);
    return;
  }
  ta.value = out;
  modal.style.display = 'flex';
  copy.onclick = () => navigator.clipboard.writeText(out).then(() => {
    copy.textContent = 'Copied!';
    setTimeout(() => copy.textContent = 'Copy', 1500);
  });
}

// ── Nudge ──────────────────────────────────────────────────────────────────
function _showMarketRegenNudge() {
  const n = document.getElementById('marketRegenNudge');
  if (n) n.style.display = 'flex';
}
function _hideMarketRegenNudge() {
  const n = document.getElementById('marketRegenNudge');
  if (n) n.style.display = 'none';
}

// ── Globals ─────────────────────────────────────────────────────────────────
window.initFinancialsListeners = initFinancialsListeners;
window.renderMarketEditor = renderMarketEditor;
window.renderCellInspector = renderCellInspector;
window.renderRulesPanel = renderRulesPanel;
window.renderLegend = renderLegend;
window.renderValidation = renderValidation;
window.renderOneCell = renderOneCell;
window.applyCellStyle = applyCellStyle;
window.selectCell = selectCell;
window.clearSelection = clearSelection;
window.resetMarketStructure = resetMarketStructure;
window.resizeMarketStructure = resizeMarketStructure;
window.syncFinancialsUI = syncFinancialsUI;
window.showMarketDebug = showMarketDebug;
window._showMarketRegenNudge = _showMarketRegenNudge;
window._hideMarketRegenNudge = _hideMarketRegenNudge;
// Templates
window.apply18ChesapeakeTemplate = applyTemplate18Chesa;
window.apply1846Template = applyTemplate1846;
window.apply1862Template = applyTemplate1862;
