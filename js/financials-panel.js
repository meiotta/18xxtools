// ─── FINANCIALS PANEL ──────────────────────────────────────────────────────────
// Handles Bank config, Market Type, Market Editor, and Movement Rules.
// Load order: TENTH — after companies-panel.js.

function initFinancialsListeners() {
  const bankInput = document.getElementById('finBank');
  const typeSelect = document.getElementById('finMarketType');
  const rowInput = document.getElementById('finMarketRows');
  const colInput = document.getElementById('finMarketCols');
  const countInput = document.getElementById('finMarketCount');

  bankInput.addEventListener('change', (e) => {
    state.financials.bank = parseInt(e.target.value) || 0;
    document.getElementById('bankCashVal').textContent = state.financials.bank;
    const wide = document.getElementById('bankCashValWide');
    if (wide) wide.textContent = state.financials.bank;
    autosave();
  });

  typeSelect.addEventListener('change', (e) => {
    const type = e.target.value;
    state.financials.marketType = type;
    document.getElementById('finMarket2DConfig').style.display = (type === '2D' ? 'flex' : 'none');
    document.getElementById('finMarket1DConfig').style.display = (type !== '2D' ? 'block' : 'none');
    
    // Reset market when type changes to ensure valid shape
    resetMarketStructure();
    renderMarketEditor();
    autosave();
  });

  [rowInput, colInput, countInput].forEach(el => {
    el.addEventListener('change', () => {
      state.financials.marketRows = parseInt(rowInput.value) || 1;
      state.financials.marketCols = parseInt(colInput.value) || 1;
      // We don't necessarily reset the values here, just resize
      resizeMarketStructure();
      renderMarketEditor();
      autosave();
    });
  });

  // Templates
  document.getElementById('tmplChesa').addEventListener('click', apply18ChesapeakeTemplate);
  document.getElementById('tmpl1846').addEventListener('click', apply1846Template);
  document.getElementById('tmpl1862').addEventListener('click', apply1862Template);

  // Initial Sync
  typeSelect.value = state.financials.marketType;
  bankInput.value = state.financials.bank;
  rowInput.value = state.financials.marketRows;
  colInput.value = state.financials.marketCols;

  renderMarketEditor();
}

function resetMarketStructure() {
  const type = state.financials.marketType;
  if (type === '2D') {
    state.financials.market = Array.from({ length: state.financials.marketRows }, () => 
      Array.from({ length: state.financials.marketCols }, () => '')
    );
  } else {
    const count = parseInt(document.getElementById('finMarketCount').value) || 10;
    state.financials.market = Array.from({ length: count }, () => '');
  }
}

function resizeMarketStructure() {
  const type = state.financials.marketType;
  if (type === '2D') {
    const rows = state.financials.marketRows;
    const cols = state.financials.marketCols;
    
    // Ensure market is an array of arrays
    if (!Array.isArray(state.financials.market) || !Array.isArray(state.financials.market[0])) {
      resetMarketStructure();
      return;
    }

    // Resize Rows
    while (state.financials.market.length < rows) {
      state.financials.market.push(Array.from({ length: cols }, () => ''));
    }
    state.financials.market = state.financials.market.slice(0, rows);

    // Resize Columns
    state.financials.market = state.financials.market.map(row => {
      while (row.length < cols) row.push('');
      return row.slice(0, cols);
    });
  } else {
    // 1D or Zigzag (1D list)
    const count = parseInt(document.getElementById('finMarketCount').value) || 10;
    if (!Array.isArray(state.financials.market) || Array.isArray(state.financials.market[0])) {
      resetMarketStructure();
      return;
    }
    while (state.financials.market.length < count) state.financials.market.push('');
    state.financials.market = state.financials.market.slice(0, count);
  }
}

// ── Cell helpers ──────────────────────────────────────────────────────────────
function _isFilled(v) { return v !== '' && v !== null && v !== undefined; }

function _hasFilledNeighbor(r, c, market) {
  return [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].some(([nr,nc]) =>
    nr >= 0 && nr < market.length && nc >= 0 && nc < market[nr].length && _isFilled(market[nr][nc])
  );
}

function _defaultActivationValue(r, c, market) {
  // Use nearest filled neighbor, preferring the cell to the right (smaller price)
  const order = [[r,c-1],[r,c+1],[r-1,c],[r+1,c]];
  for (const [nr,nc] of order) {
    if (nr >= 0 && nr < market.length && nc >= 0 && nc < market[nr].length && _isFilled(market[nr][nc])) {
      return parseInt(market[nr][nc]) || 40;
    }
  }
  return 40;
}

// ── Market context menu ───────────────────────────────────────────────────────
let _ctxMenu = null;

function _getCtxMenu() {
  if (_ctxMenu) return _ctxMenu;
  _ctxMenu = document.createElement('div');
  _ctxMenu.id = 'marketCtxMenu';
  _ctxMenu.className = 'market-ctx-menu';
  document.body.appendChild(_ctxMenu);
  // Hide on any outside click
  document.addEventListener('click', () => { _ctxMenu.style.display = 'none'; }, true);
  document.addEventListener('contextmenu', () => { _ctxMenu.style.display = 'none'; }, true);
  return _ctxMenu;
}

function _showCtxMenu(x, y, items) {
  const m = _getCtxMenu();
  m.innerHTML = '';
  items.forEach(item => {
    if (item === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      m.appendChild(sep);
      return;
    }
    const btn = document.createElement('button');
    btn.className = 'ctx-item' + (item.danger ? ' ctx-danger' : '');
    if (item.swatch) btn.style.setProperty('--swatch', item.swatch);
    if (item.swatch) btn.classList.add('ctx-swatch');
    btn.textContent = item.label;
    btn.addEventListener('click', (e) => { e.stopPropagation(); item.action(); m.style.display = 'none'; });
    m.appendChild(btn);
  });
  // Position — keep on screen
  m.style.display = 'block';
  const vw = window.innerWidth, vh = window.innerHeight;
  const mw = 160, mh = m.offsetHeight || 120;
  m.style.left = (x + mw > vw ? x - mw : x) + 'px';
  m.style.top  = (y + mh > vh ? y - mh : y) + 'px';
}

// ── Render market editor ──────────────────────────────────────────────────────
function renderMarketEditor() {
  const container = document.getElementById('marketContainerWide');
  if (!container) return;
  container.innerHTML = '';

  const type   = state.financials.marketType;
  const market = state.financials.market;

  const wrapper = document.createElement('div');
  wrapper.className = 'market-grid-wrapper';

  if (type === '2D') {
    const table = document.createElement('table');
    table.className = 'market-grid';

    market.forEach((rowArr, r) => {
      const tr = document.createElement('tr');
      rowArr.forEach((val, c) => {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text';
        input.value = val;
        input.className = 'market-input';
        styleMarketInput(input, val, r, c);

        // PAINTER
        if (typeof attachCellPainter === 'function') attachCellPainter(input, r, c);

        // Remove empty-state classes the moment the user starts typing (so text is visible)
        input.addEventListener('input', () => {
          if (input.value) input.classList.remove('market-cell-empty', 'adjacent-empty');
        });

        // Change handler — save value and restyle
        input.addEventListener('change', (e) => {
          const wasEmpty = !state.financials.market[r][c];
          state.financials.market[r][c] = e.target.value;
          styleMarketInput(input, e.target.value, r, c);
          renderMarketLegend();
          autosave();
          // Show regenerate nudge when user manually adds a new value
          if (wasEmpty && e.target.value.trim()) _showMarketRegenNudge();
        });

        if (_isFilled(val)) {
          // RIGHT-CLICK on filled cell: lock / clear
          input.addEventListener('contextmenu', e => {
            e.preventDefault();
            const key = `${r},${c}`;
            const locked = !!state.financials.locks[key];
            _showCtxMenu(e.clientX, e.clientY, [
              { label: locked ? '🔓 Unlock price' : '🔒 Lock price', action: () => {
                if (locked) {
                  delete state.financials.locks[key];
                } else {
                  state.financials.locks[key] = parseInt(state.financials.market[r][c]) || 0;
                }
                styleMarketInput(input, state.financials.market[r][c], r, c);
                autosave();
              }},
              'sep',
              { label: 'Clear this cell', danger: true, action: () => {
                state.financials.market[r][c] = '';
                delete state.financials.locks[key];
                renderMarketEditor(); autosave();
              }}
            ]);
          });
        } else {
          // Empty cell — check adjacency for double-click activation
          if (_hasFilledNeighbor(r, c, market)) {
            input.classList.add('adjacent-empty');
            input.title = 'Double-click to activate';
            input.addEventListener('dblclick', () => {
              const def = _defaultActivationValue(r, c, market);
              state.financials.market[r][c] = String(def);
              renderMarketEditor(); autosave();
            });
          }
        }

        td.appendChild(input);
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    wrapper.appendChild(table);
    container.appendChild(wrapper);
    if (typeof renderAxisHandles === 'function') renderAxisHandles(wrapper, table);

  } else {
    // 1D / Zigzag
    const listDiv = document.createElement('div');
    listDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;max-width:1000px;';

    const BANDS = [
      { brush:'p', label:'Par',    swatch:'#d97070' },
      { brush:'y', label:'Yellow', swatch:'#c8b030' },
      { brush:'o', label:'Orange', swatch:'#c87830' },
      { brush:'b', label:'Brown',  swatch:'#8c5028' },
      { brush:'c', label:'Closed', swatch:'#303030' },
    ];

    market.forEach((val, i) => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = val;
      input.className = 'market-input';
      input.title = `Index ${i}`;
      styleMarketInput(input, val);

      input.addEventListener('change', (e) => {
        state.financials.market[i] = e.target.value;
        styleMarketInput(input, e.target.value);
        renderMarketLegend(); autosave();
      });

      if (_isFilled(val)) {
        // 1D: right-click to recolor
        input.addEventListener('contextmenu', e => {
          e.preventDefault();
          _showCtxMenu(e.clientX, e.clientY, [
            ...BANDS.map(b => ({
              label: b.label, swatch: b.swatch,
              action: () => {
                const numeric = (state.financials.market[i] || '').replace(/[pyobc]/g,'');
                state.financials.market[i] = numeric + b.brush;
                renderMarketEditor(); autosave();
              }
            })),
            'sep',
            { label: 'Clear band', action: () => {
                state.financials.market[i] = (state.financials.market[i] || '').replace(/[pyobc]/g,'');
                renderMarketEditor(); autosave();
            }}
          ]);
        });
      }

      listDiv.appendChild(input);
    });
    wrapper.appendChild(listDiv);
    container.appendChild(wrapper);
  }
  renderMarketLegend();
}

function styleMarketInput(input, val, r, c) {
  // Reset classes
  input.classList.remove('market-cell-par', 'market-cell-yellow', 'market-cell-orange', 'market-cell-brown', 'market-cell-closed', 'locked', 'invalid');

  if (r !== undefined && c !== undefined) {
    if (state.financials.locks[`${r},${c}`]) input.classList.add('locked');
  }

  if (!val) {
    input.style.opacity = '';
    input.style.background = '';  // let CSS handle empty-cell color
    input.classList.add('market-cell-empty');
    return;
  }
  // Clear ALL empty-state classes when cell has a value
  input.classList.remove('market-cell-empty', 'adjacent-empty');
  input.style.opacity = '';
  input.style.background = '';

  // Apply high-fidelity classes based on suffixes
  const cleanVal = val.toLowerCase();
  if (cleanVal.includes('p')) input.classList.add('market-cell-par');
  if (cleanVal.includes('y')) input.classList.add('market-cell-yellow');
  if (cleanVal.includes('o')) input.classList.add('market-cell-orange');
  if (cleanVal.includes('b')) input.classList.add('market-cell-brown');
  if (cleanVal.includes('c') || cleanVal === '0') input.classList.add('market-cell-closed');

  // Logic flow validation (Smart check)
  if (r !== undefined && c !== undefined && c > 0) {
    const leftVal = parseInt(state.financials.market[r][c-1]) || 0;
    const thisVal = parseInt(val) || 0;
    // Basic 18xx rule: price must increase left-to-right
    if (thisVal > 0 && leftVal > 0 && thisVal < leftVal) {
      input.classList.add('invalid');
      input.title = "Price cannot be lower than the cell to its left!";
    }
  }
}

function renderMarketLegend() {
  let legendContainer = document.getElementById('marketLegend');
  if (!legendContainer) {
    legendContainer = document.createElement('div');
    legendContainer.id = 'marketLegend';
    legendContainer.className = 'market-legend';
    document.getElementById('marketEditorContainer').appendChild(legendContainer);
  }
  legendContainer.innerHTML = '';

  // Scan market for suffixes
  const marketFlat = state.financials.market.flat();
  const suffixes = {
    'p': { label: 'Par value', class: 'market-cell-par' },
    'y': { label: 'No share limit', class: 'market-cell-yellow' },
    'o': { label: 'Orange zone', class: 'market-cell-orange' },
    'b': { label: 'Brown zone', class: 'market-cell-brown' },
    'c': { label: 'Corporation closes', class: 'market-cell-closed' }
  };

  Object.keys(suffixes).forEach(key => {
    if (marketFlat.some(v => v && v.includes(key))) {
      const item = document.createElement('div');
      item.className = 'legend-item';
      
      const box = document.createElement('div');
      box.className = `legend-box ${suffixes[key].class}`;
      
      const label = document.createElement('span');
      label.textContent = suffixes[key].label;
      
      item.appendChild(box);
      item.appendChild(label);
      legendContainer.appendChild(item);
    }
  });
}

function apply18ChesapeakeTemplate() {
  state.financials.marketType = '2D';
  state.financials.marketRows = 8;
  state.financials.marketCols = 17;
  state.financials.bank = 8000;
  
  const m = Array.from({length:8}, () => Array.from({length:17}, () => ''));
  m[0] = ['80', '85', '90', '100', '110', '125', '140', '160', '180', '200', '225', '250', '275', '300', '325', '350', '375'];
  m[1] = ['75', '80', '85', '90', '100', '110', '125', '140', '160', '180', '200', '225', '250', '275', '300', '325', '350'];
  m[2] = ['70', '75', '80', '85', '95p', '105', '115', '130', '145', '160', '180', '200'];
  m[3] = ['65', '70', '75', '80p', '85', '95', '105', '115', '130', '145'];
  m[4] = ['60', '65', '70p', '75', '80', '85', '95', '105'];
  m[5] = ['55y', '60', '65', '70', '75', '80'];
  m[6] = ['50y', '55y', '60', '65'];
  m[7] = ['40y', '45y', '50y'];
  
  state.financials.market = m;
  syncFinancialsUI();
  renderMarketEditor();
  autosave();
}

function apply1846Template() {
  state.financials.marketType = '1D';
  state.financials.market = ['10b','20b','30b','40b','50y','60y','70y','80y','90y','100p','112','124','137','150','165','180','200','220','245','270','300','330','360','400','440','490','540','600'];
  state.financials.bank = 6500;
  syncFinancialsUI();
  renderMarketEditor();
  autosave();
}

function apply1862Template() {
  state.financials.marketType = 'zigzag';
  state.financials.market = ['0c', '7i', '14i', '20i', '26i', '31i', '36i', '40', '44', '47', '50', '52', '54p', '56r', '58p', '60r', '62p', '65r', '68p', '71r', '74p', '78r', '82p', '86r', '90p', '95r', '100p', '105r', '110r', '116r', '122r', '128r', '134r', '142r', '150r', '158r', '166r', '174r', '182r', '191r', '200r', '210i', '220i', '232i', '245i', '260i', '275i', '292i', '310i', '330i', '350i', '375i', '400j', '430j', '460j', '495j', '530j', '570j', '610j', '655j', '700j', '750j', '800j', '850j', '900j', '950j', '1000e'];
  state.financials.bank = 15000;
  syncFinancialsUI();
  renderMarketEditor();
  autosave();
}

function syncFinancialsUI() {
  document.getElementById('finBank').value = state.financials.bank;
  document.getElementById('bankCashVal').textContent = state.financials.bank;
  const wide = document.getElementById('bankCashValWide');
  if (wide) wide.textContent = state.financials.bank;
  document.getElementById('finMarketType').value = state.financials.marketType;
  document.getElementById('finMarketRows').value = state.financials.marketRows;
  document.getElementById('finMarketCols').value = state.financials.marketCols;
  document.getElementById('finMarketCount').value = state.financials.market.length;
}

// ── Market debug view ─────────────────────────────────────────────────────────
function showMarketDebug() {
  const market = state.financials.market;
  const type   = state.financials.marketType;
  let out = '';

  if (type === '2D') {
    // Format as Ruby array of arrays
    const lines = market.map(row => {
      const cells = row.map(v => {
        const s = (v || '').trim();
        return s ? `'${s}'` : "''";
      });
      return '  [' + cells.join(', ') + ']';
    });
    out = '[\n' + lines.join(',\n') + '\n]';
  } else {
    // 1D / zigzag — flat array
    const cells = market.map(v => {
      const s = (v || '').trim();
      return s ? `'${s}'` : "''";
    });
    // Wrap at ~80 chars
    let line = '', result = [];
    cells.forEach((c, i) => {
      const sep = i === 0 ? '' : ', ';
      if (line.length + sep.length + c.length > 78) {
        result.push(line);
        line = ' ' + c;
      } else {
        line += sep + c;
      }
    });
    if (line) result.push(line);
    out = '[\n' + result.map(l => '  ' + l.trimStart()).join(',\n') + '\n]';
  }

  const modal    = document.getElementById('marketDebugModal');
  const textarea = document.getElementById('marketDebugTextarea');
  const copyBtn  = document.getElementById('debugCopyBtn');
  if (!modal || !textarea) return;

  textarea.value = out;
  modal.style.display = 'flex';
  textarea.focus();
  textarea.setSelectionRange(0, 0);

  copyBtn.onclick = () => {
    navigator.clipboard.writeText(out).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1800);
    });
  };
}

// ── Market regenerate nudge ───────────────────────────────────────────────────
function _showMarketRegenNudge() {
  const nudge = document.getElementById('marketRegenNudge');
  if (nudge) nudge.style.display = 'flex';
}
function _hideMarketRegenNudge() {
  const nudge = document.getElementById('marketRegenNudge');
  if (nudge) nudge.style.display = 'none';
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  // If we have state from autosave, we might already have financials.
  // We'll call initFinancialsListeners from setup.js or similar high-level.
  const debugBtn = document.getElementById('marketDebugBtn');
  if (debugBtn) debugBtn.addEventListener('click', showMarketDebug);

  // Nudge dismiss / inline regen
  const nudgeDismiss = document.getElementById('marketNudgeDismissBtn');
  const nudgeRegen   = document.getElementById('marketNudgeRegenBtn');
  if (nudgeDismiss) nudgeDismiss.addEventListener('click', _hideMarketRegenNudge);
  if (nudgeRegen)   nudgeRegen.addEventListener('click', () => {
    _hideMarketRegenNudge();
    const btn = document.getElementById('wizGenerateBtn');
    if (btn) btn.click();
  });

  // Hide nudge when Generate is clicked manually
  const wizBtn = document.getElementById('wizGenerateBtn');
  if (wizBtn) wizBtn.addEventListener('click', _hideMarketRegenNudge, true);
});
