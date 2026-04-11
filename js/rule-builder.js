// ─── RULE BUILDER (drag-and-drop pill system) ─────────────────────────────────
// Categories: trigger (purple), company (blue), revenue (green, stackable),
//             event (gray), action (teal).
// Load order: ELEVENTH — after financials-panel.js.

// In-progress statement
const _stmt = {
  trigger:    null,   // string
  conditions: [],     // array of parsed condition objects (index mirrors AND rows)
  action:     null    // parsed action object
};

// Track how many AND rows currently exist in the builder
let _andRowCount = 1;

// ── Labels ────────────────────────────────────────────────────────────────────
const TRIGGER_LABELS = {
  if_paid:        'Pays Dividend',
  if_withheld:    'Withholds',
  if_sold_out:    'Sold Out',
  if_shares_sold: 'Shares Sold',
  if_no_run:      "Doesn't Run"
};

function _actionLabel(a) {
  if (!a) return '';
  if (a.type === 'move') {
    const m = { right:'→ Right', left:'← Left', up:'↑ Up', down:'↓ Down', up_twice:'↑↑ Up ×2', right_twice:'→→ Right ×2' };
    return m[a.value] || a.value;
  }
  if (a.type === 'end_game') return 'End Game';
  if (a.type === 'bankrupt') return 'Go Bankrupt';
  return a.type;
}

function _condLabel(c) {
  const fields = {
    entity_type:    'Type',
    price:          'Price',
    bank:           'Bank',
    revenue:        'Revenue',
    revenue_calc:   'Rev calc',
    sold_out_timing:'Sold-out timing',
    sold_by:        'Sold by',
    dividend:       'Dividend'
  };
  const unit = c.unit === 'percent' ? '%' : '';
  return `${fields[c.field] || c.field} ${c.op} ${c.value}${unit}`;
}

// Pill class to use in submitted rules based on condition field
function _condPillClass(c) {
  if (c.field === 'entity_type')    return 'pill-company';
  if (c.field === 'revenue' || c.field === 'revenue_calc') return 'pill-revenue';
  return 'pill-event';
}

// ── Setup ─────────────────────────────────────────────────────────────────────
function initLogicRulesListeners() {
  // Draggable pills in palette
  _attachDragListeners();

  // Drop zones
  _attachDropZone('stmtWhen');
  _attachDropZone('stmtAnd0');
  _attachDropZone('stmtThen');

  // Submit
  const submitBtn = document.getElementById('submitRuleBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      if (!_stmt.trigger || !_stmt.action) return;
      state.financials.logicRules.push({
        trigger:    _stmt.trigger,
        conditions: _stmt.conditions.filter(Boolean),
        action:     { ..._stmt.action }
      });
      _resetStmt();
      renderLogicRules();
      autosave();
    });
  }

  // Clear
  const clearBtn = document.getElementById('clearRuleBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', _resetStmt);
  }

  renderLogicRules();
}

function _attachDragListeners() {
  document.querySelectorAll('.draggable-pill').forEach(pill => {
    pill.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('application/json', JSON.stringify({
        type:  pill.dataset.type,
        value: pill.dataset.value,
        label: pill.textContent.trim()
      }));
      pill.classList.add('dragging');
    });
    pill.addEventListener('dragend', () => pill.classList.remove('dragging'));
  });
}

function _attachDropZone(id) {
  const zone = document.getElementById(id);
  if (!zone) return;

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    zone.classList.add('drop-hover');
  });
  zone.addEventListener('dragleave', e => {
    if (!zone.contains(e.relatedTarget)) zone.classList.remove('drop-hover');
  });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drop-hover');
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type !== zone.dataset.accept) return;

      if (data.type === 'trigger') {
        _stmt.trigger = data.value;
      } else if (data.type === 'condition') {
        const idx = parseInt(zone.dataset.idx ?? '0');
        let parsed = null;
        try { parsed = JSON.parse(data.value); } catch { parsed = { raw: data.value }; }
        _stmt.conditions[idx] = parsed;

        // If this AND slot is now filled, grow the list by adding another empty slot
        _maybeAddAndRow(idx);
      } else if (data.type === 'action') {
        try { _stmt.action = JSON.parse(data.value); } catch { _stmt.action = null; }
      }

      _renderZonePill(zone, data);
      _updateSubmitBtn();
    } catch (err) {
      console.warn('Drop parse error:', err);
    }
  });
}

// If the just-filled AND row is the last one, append a new empty one
function _maybeAddAndRow(filledIdx) {
  if (filledIdx < _andRowCount - 1) return; // not the last row

  _andRowCount++;
  const newIdx = _andRowCount - 1;

  const stmtRows = document.getElementById('stmtRows');
  const thenRow = stmtRows.querySelector('.stmt-row:last-child');

  const row = document.createElement('div');
  row.className = 'stmt-row';
  row.id = `stmtAndRow${newIdx}`;

  const label = document.createElement('span');
  label.className = 'stmt-label';
  label.textContent = 'And';

  const ph = 'drop another condition';
  const zone = document.createElement('div');
  zone.className = 'stmt-drop-zone stmt-and-zone';
  zone.id = `stmtAnd${newIdx}`;
  zone.dataset.accept = 'condition';
  zone.dataset.idx = String(newIdx);
  zone.dataset.placeholder = ph;
  zone.textContent = ph;

  row.appendChild(label);
  row.appendChild(zone);
  stmtRows.insertBefore(row, thenRow);

  // Wire drop events on the new zone
  _attachDropZone(`stmtAnd${newIdx}`);
}

function _renderZonePill(zone, data) {
  zone.classList.add('drop-filled');
  zone.innerHTML = '';

  // Pick pill class: for conditions use specific category class
  let pillClass = `pill-${data.type}`;
  if (data.type === 'condition') {
    try {
      const parsed = JSON.parse(data.value);
      pillClass = _condPillClass(parsed);
    } catch {}
  }

  const pill = document.createElement('div');
  pill.className = `logic-pill ${pillClass} zone-pill`;
  pill.textContent = data.label;

  const rem = document.createElement('span');
  rem.className = 'zone-pill-remove';
  rem.innerHTML = '&times;';
  rem.title = 'Remove';
  rem.addEventListener('click', () => {
    if (data.type === 'trigger') {
      _stmt.trigger = null;
    } else if (data.type === 'condition') {
      const idx = parseInt(zone.dataset.idx ?? '0');
      _stmt.conditions[idx] = null;
    } else if (data.type === 'action') {
      _stmt.action = null;
    }
    zone.innerHTML = zone.dataset.placeholder;
    zone.classList.remove('drop-filled');
    _updateSubmitBtn();
  });

  pill.appendChild(rem);
  zone.appendChild(pill);
}

function _resetStmt() {
  _stmt.trigger    = null;
  _stmt.conditions = [];
  _stmt.action     = null;

  // Reset all AND rows back to just one empty slot
  const stmtRows = document.getElementById('stmtRows');
  if (stmtRows) {
    // Remove all AND rows except the first
    document.querySelectorAll('.stmt-and-zone').forEach(z => {
      if (z.dataset.idx !== '0') {
        const row = z.closest('.stmt-row');
        if (row) row.remove();
      }
    });
    _andRowCount = 1;

    // Reset the first AND zone
    const firstAnd = document.getElementById('stmtAnd0');
    if (firstAnd) {
      firstAnd.innerHTML = firstAnd.dataset.placeholder;
      firstAnd.classList.remove('drop-filled');
    }
  }

  // Reset WHEN and THEN
  ['stmtWhen', 'stmtThen'].forEach(id => {
    const z = document.getElementById(id);
    if (z) { z.innerHTML = z.dataset.placeholder; z.classList.remove('drop-filled'); }
  });

  _updateSubmitBtn();
}

function _updateSubmitBtn() {
  const btn = document.getElementById('submitRuleBtn');
  if (!btn) return;
  btn.disabled = !(_stmt.trigger && _stmt.action);
}

// ── Render committed rules (below the market grid) ────────────────────────────
let _dragSrcIdx = null;

function renderLogicRules() {
  const list = document.getElementById('submittedRulesList');
  if (!list) return;
  list.innerHTML = '';

  const rules = state.financials.logicRules || [];
  const countEl = document.getElementById('submittedRulesCount');
  if (countEl) countEl.textContent = rules.length === 1 ? '1 rule' : `${rules.length} rules`;

  if (rules.length === 0) {
    list.innerHTML = '<span class="no-rules-msg">No rules yet — build one in the Logic Builder →</span>';
    return;
  }

  rules.forEach((rule, idx) => {
    const row = document.createElement('div');
    row.className = 'submitted-rule-row';
    row.draggable = true;
    row.dataset.idx = idx;

    // ── Drag handle ─────────────────────────────────────
    const handle = document.createElement('span');
    handle.className = 'rule-drag-handle';
    handle.title = 'Drag to reorder';
    handle.innerHTML = '⠿';
    row.appendChild(handle);

    // ── Pills ────────────────────────────────────────────
    row.appendChild(_makePill('pill-trigger', TRIGGER_LABELS[rule.trigger] || rule.trigger));

    (rule.conditions || []).filter(Boolean).forEach(c => {
      row.appendChild(_makeConn('and'));
      row.appendChild(_makePill(_condPillClass(c), _condLabel(c)));
    });

    row.appendChild(_makeConn('→'));
    row.appendChild(_makePill('pill-action', _actionLabel(rule.action)));

    // ── Edit button (restore to builder) ─────────────────
    const editBtn = document.createElement('button');
    editBtn.className = 'rule-edit-btn';
    editBtn.innerHTML = '✎';
    editBtn.title = 'Edit this rule';
    editBtn.addEventListener('click', () => {
      _restoreToBuilder(rule, idx);
    });
    row.appendChild(editBtn);

    // ── Delete button ─────────────────────────────────────
    const del = document.createElement('button');
    del.className = 'rule-delete-btn';
    del.innerHTML = '&times;';
    del.title = 'Remove rule';
    del.addEventListener('click', () => {
      state.financials.logicRules.splice(idx, 1);
      renderLogicRules();
      autosave();
    });
    row.appendChild(del);

    // ── Row-level drag-to-reorder ────────────────────────
    row.addEventListener('dragstart', e => {
      _dragSrcIdx = idx;
      row.classList.add('dragging-row');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging-row'));
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('drag-over-row');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over-row'));
    row.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove('drag-over-row');
      const targetIdx = idx;
      if (_dragSrcIdx === null || _dragSrcIdx === targetIdx) return;

      // Reorder the array
      const moved = state.financials.logicRules.splice(_dragSrcIdx, 1)[0];
      const insertAt = _dragSrcIdx < targetIdx ? targetIdx - 1 : targetIdx;
      state.financials.logicRules.splice(insertAt, 0, moved);
      _dragSrcIdx = null;
      renderLogicRules();
      autosave();
    });

    list.appendChild(row);
  });
}

// Restore a submitted rule to the builder for editing
function _restoreToBuilder(rule, idx) {
  // Load into _stmt
  _resetStmt();
  _stmt.trigger = rule.trigger;
  _stmt.action  = rule.action ? { ...rule.action } : null;

  // Remove from list immediately
  state.financials.logicRules.splice(idx, 1);
  renderLogicRules();
  autosave();

  // Repopulate WHEN zone
  const whenZone = document.getElementById('stmtWhen');
  if (whenZone && _stmt.trigger) {
    _renderZonePill(whenZone, {
      type: 'trigger',
      value: _stmt.trigger,
      label: TRIGGER_LABELS[_stmt.trigger] || _stmt.trigger
    });
  }

  // Repopulate THEN zone
  const thenZone = document.getElementById('stmtThen');
  if (thenZone && _stmt.action) {
    _renderZonePill(thenZone, {
      type: 'action',
      value: JSON.stringify(_stmt.action),
      label: _actionLabel(_stmt.action)
    });
  }

  // Repopulate AND zones (may need to grow the list)
  const conditions = (rule.conditions || []).filter(Boolean);
  conditions.forEach((c, i) => {
    // Ensure the AND row exists
    while (_andRowCount <= i) {
      _maybeAddAndRow(_andRowCount - 1);
    }
    const zone = document.getElementById(`stmtAnd${i}`);
    if (zone) {
      _stmt.conditions[i] = { ...c };
      _renderZonePill(zone, {
        type:  'condition',
        value: JSON.stringify(c),
        label: _condLabel(c)
      });
    }
  });

  _updateSubmitBtn();

  // Scroll the builder panel into view if possible
  const builder = document.querySelector('.stmt-builder');
  if (builder) builder.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _makePill(cls, label) {
  const el = document.createElement('span');
  el.className = `logic-pill ${cls} submitted-pill`;
  el.textContent = label;
  return el;
}

function _makeConn(text) {
  const el = document.createElement('span');
  el.className = 'logic-connector';
  el.textContent = text;
  return el;
}
