// ─── HEX BUILDER DEBUG LOGGER (HBD) ─────────────────────────────────────────
// Floating panel that logs every significant action inside the build-a-hex tool.
// Instrumenting static-hex-builder.js calls window.HBD?.log(cat, msg, data).
//
// Categories:
//   click  — raw click coords + target element
//   hit    — hit-test results (edge found, snap found, node found, miss)
//   lane   — lane +/- button and badge cycle operations
//   node   — node placed / removed / selected / slot-cycled
//   seg    — segment (bypass track) added or removed
//   path   — node-to-node path added or removed
//   state  — tool switched, bg color changed, pending set/cancelled
//   save   — _save() and _buildFinalModel() summary
//
// Load order: after static-hex-builder.js, before closing </body>.
// Public API: window.HBD = { log, open, close, toggle }

(function () {
'use strict';

// ── Config ──────────────────────────────────────────────────────────────────
const MAX_ENTRIES  = 300;
const PANEL_ID     = 'hbdPanel';

const CAT_STYLES = {
  click: { color: '#7ecfff', label: 'CLK'  },
  hit:   { color: '#a0e87c', label: 'HIT'  },
  lane:  { color: '#ffdd55', label: 'LAN'  },
  node:  { color: '#ff9f55', label: 'NOD'  },
  seg:   { color: '#cc99ff', label: 'SEG'  },
  path:  { color: '#ff77aa', label: 'PTH'  },
  state: { color: '#88dddd', label: 'STT'  },
  save:  { color: '#aaffaa', label: 'SAV'  },
};

// ── State ──────────────────────────────────────────────────────────────────
let _entries     = [];
let _filters     = {};   // cat → true means SHOWN
let _pinScroll   = true; // auto-scroll to bottom
let _visible     = false;
let _seq         = 0;

// Init all filters to on
Object.keys(CAT_STYLES).forEach(c => { _filters[c] = true; });

// ── Panel HTML ─────────────────────────────────────────────────────────────
function _panelHtml() {
  const filterBtns = Object.entries(CAT_STYLES).map(([cat, s]) => `
    <button class="hbd-filter${_filters[cat] ? ' on' : ''}"
      data-hbd-cat="${cat}"
      style="border-color:${s.color};${_filters[cat] ? `background:${s.color}22;color:${s.color}` : 'opacity:0.4'}"
      title="Toggle ${cat}">${s.label}</button>
  `).join('');

  return `
    <div id="${PANEL_ID}" style="
      position:fixed;bottom:16px;right:16px;z-index:99999;
      width:420px;max-width:92vw;
      background:#1a1a1e;border:1px solid #444;border-radius:8px;
      box-shadow:0 4px 24px #0009;
      font-family:monospace;font-size:11px;
      display:flex;flex-direction:column;
      user-select:none;
    ">
      <!-- Header / drag handle -->
      <div id="hbdHeader" style="
        display:flex;align-items:center;gap:6px;flex-wrap:wrap;
        padding:6px 8px;background:#222230;border-radius:8px 8px 0 0;
        cursor:grab;
      ">
        <span style="color:#aaa;font-weight:bold;margin-right:4px;">HBD</span>
        ${filterBtns}
        <span style="flex:1"></span>
        <button id="hbdPin" title="Pin scroll to bottom"
          style="background:none;border:1px solid #555;border-radius:3px;color:${_pinScroll?'#ffe':' #555'};
          cursor:pointer;padding:1px 5px;font-size:10px;">PIN</button>
        <button id="hbdClear" title="Clear log"
          style="background:none;border:1px solid #555;border-radius:3px;color:#aaa;
          cursor:pointer;padding:1px 5px;font-size:10px;">CLR</button>
        <button id="hbdCopy" title="Copy log to clipboard"
          style="background:none;border:1px solid #555;border-radius:3px;color:#aaa;
          cursor:pointer;padding:1px 5px;font-size:10px;">CPY</button>
        <button id="hbdClose" title="Close debug panel"
          style="background:none;border:1px solid #555;border-radius:3px;color:#f88;
          cursor:pointer;padding:1px 5px;font-size:10px;">✕</button>
      </div>
      <!-- Log list -->
      <div id="hbdLog" style="
        flex:1;overflow-y:auto;max-height:340px;min-height:80px;
        padding:4px 6px;
      "></div>
    </div>
  `;
}

// ── Render helpers ─────────────────────────────────────────────────────────
function _renderEntry(e) {
  const s = CAT_STYLES[e.cat] || { color: '#aaa', label: '???' };
  const dataStr = e.data ? ' <span style="color:#888">' +
    JSON.stringify(e.data).replace(/</g,'&lt;').slice(0,120) + '</span>' : '';
  return `<div data-hbd-seq="${e.seq}" style="
    padding:1px 0;border-bottom:1px solid #2a2a35;white-space:nowrap;overflow:hidden;
    text-overflow:ellipsis;
  ">
    <span style="color:#555">${String(e.seq).padStart(4,' ')}</span>
    <span style="
      display:inline-block;width:30px;text-align:center;border-radius:2px;
      background:${s.color}22;color:${s.color};font-weight:bold;margin:0 4px;
    ">${s.label}</span>
    <span style="color:#ddd">${e.msg.replace(/</g,'&lt;')}</span>${dataStr}
  </div>`;
}

function _refreshLog() {
  const logEl = document.getElementById('hbdLog');
  if (!logEl) return;
  const visible = _entries.filter(e => _filters[e.cat]);
  logEl.innerHTML = visible.map(_renderEntry).join('');
  if (_pinScroll) logEl.scrollTop = logEl.scrollHeight;
}

function _appendEntry(entry) {
  const logEl = document.getElementById('hbdLog');
  if (!logEl) return;
  if (!_filters[entry.cat]) return;
  const div = document.createElement('div');
  div.innerHTML = _renderEntry(entry);
  logEl.appendChild(div.firstElementChild);
  // Trim DOM if too tall (keep max 200 rendered)
  while (logEl.children.length > 200) logEl.removeChild(logEl.firstChild);
  if (_pinScroll) logEl.scrollTop = logEl.scrollHeight;
}

// ── Draggable ──────────────────────────────────────────────────────────────
function _makeDraggable() {
  const panel  = document.getElementById(PANEL_ID);
  const header = document.getElementById('hbdHeader');
  if (!panel || !header) return;

  let ox = 0, oy = 0, startX = 0, startY = 0, dragging = false;

  header.addEventListener('mousedown', ev => {
    if (ev.target.tagName === 'BUTTON') return;
    dragging = true;
    startX = ev.clientX;
    startY = ev.clientY;
    // Store the current CSS right/bottom as the drag origin
    const cs = window.getComputedStyle(panel);
    ox = parseInt(cs.right)  || 0;
    oy = parseInt(cs.bottom) || 0;
    header.style.cursor = 'grabbing';
    ev.preventDefault();
  });

  document.addEventListener('mousemove', ev => {
    if (!dragging) return;
    const dx = ev.clientX - startX;   // positive = mouse moved right
    const dy = ev.clientY - startY;   // positive = mouse moved down
    // Moving right decreases CSS right; moving down decreases CSS bottom
    panel.style.right  = Math.max(0, ox - dx) + 'px';
    panel.style.bottom = Math.max(0, oy - dy) + 'px';
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
    header.style.cursor = 'grab';
  });
}

// ── Bind controls ──────────────────────────────────────────────────────────
function _bindControls() {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;

  // Filter toggles
  panel.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-hbd-cat]');
    if (btn) {
      const cat = btn.dataset.hbdCat;
      _filters[cat] = !_filters[cat];
      btn.classList.toggle('on', _filters[cat]);
      if (_filters[cat]) {
        btn.style.background = CAT_STYLES[cat].color + '22';
        btn.style.color      = CAT_STYLES[cat].color;
        btn.style.opacity    = '1';
      } else {
        btn.style.background = '';
        btn.style.color      = '';
        btn.style.opacity    = '0.4';
      }
      _refreshLog();
    }
  });

  // Pin
  document.getElementById('hbdPin')?.addEventListener('click', () => {
    _pinScroll = !_pinScroll;
    const btn = document.getElementById('hbdPin');
    if (btn) btn.style.color = _pinScroll ? '#ffe' : '#555';
    if (_pinScroll) {
      const logEl = document.getElementById('hbdLog');
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
    }
  });

  // Clear
  document.getElementById('hbdClear')?.addEventListener('click', () => {
    _entries = [];
    _seq = 0;
    _refreshLog();
  });

  // Copy
  document.getElementById('hbdCopy')?.addEventListener('click', () => {
    const lines = _entries
      .filter(e => _filters[e.cat])
      .map(e => {
        const cat = (CAT_STYLES[e.cat]?.label || e.cat).padEnd(3);
        const data = e.data ? '  ' + JSON.stringify(e.data) : '';
        return `[${String(e.seq).padStart(4,'0')}][${cat}] ${e.msg}${data}`;
      })
      .join('\n');
    navigator.clipboard?.writeText(lines).then(() => {
      const btn = document.getElementById('hbdCopy');
      if (btn) {
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = 'CPY'; }, 1500);
      }
    });
  });

  // Close
  document.getElementById('hbdClose')?.addEventListener('click', () => {
    window.HBD?.close();
  });

  _makeDraggable();
}

// ── Mount / unmount ────────────────────────────────────────────────────────
function _mount() {
  if (document.getElementById(PANEL_ID)) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = _panelHtml();
  document.body.appendChild(wrapper.firstElementChild);
  _bindControls();
  _refreshLog();
}

function _unmount() {
  document.getElementById(PANEL_ID)?.remove();
}

// ── Public API ─────────────────────────────────────────────────────────────
window.HBD = {
  /**
   * Log an entry.
   * @param {string} cat   - Category key (click|hit|lane|node|seg|path|state|save)
   * @param {string} msg   - Human-readable message
   * @param {*}      data  - Optional data object (JSON-serialized inline)
   */
  log(cat, msg, data) {
    const entry = { seq: ++_seq, cat, msg, data: data !== undefined ? data : null };
    _entries.push(entry);
    if (_entries.length > MAX_ENTRIES) _entries.shift();
    if (_visible) _appendEntry(entry);
  },

  open() {
    _visible = true;
    _mount();
    window.HBD.log('state', '── Builder opened ──');
  },

  close() {
    _visible = false;
    _unmount();
  },

  toggle() {
    if (_visible) window.HBD.close();
    else          window.HBD.open();
  },

  isOpen() { return _visible; },
};

// ── Keyboard shortcut: Ctrl+Shift+D ───────────────────────────────────────
document.addEventListener('keydown', ev => {
  if (ev.ctrlKey && ev.shiftKey && ev.key === 'D') {
    ev.preventDefault();
    window.HBD.toggle();
  }
});

})();
