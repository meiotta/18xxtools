// js/import-url.js
// URL-based import for map.rb, entities.rb, and game.rb.
// Depends on import-ruby.js (applyMapImport / applyEntitiesImport / applyGameImport).
// Load order: after import-ruby.js.
//
// _importSources — session registry of active URL sources (not persisted to game state).
//   Keys: 'map' | 'entities' | 'game'
//   Values: null  |  { url: string, label: string }
//
// Refresh button (#refreshImportBtn) appears in the toolbar once any source is set.
// Clicking it re-fetches all active sources in order: map → game → entities
// (entities last so it can resolve grantedBy names from a freshly-imported game.rb).
//
// GitHub note: raw.githubusercontent.com serves files with CORS headers, so fetch()
// works directly from the browser. Standard github.com HTML page URLs will fail CORS.
// Future: use the GitHub API (api.github.com/repos/{owner}/{repo}/contents/{path})
// to list files in a folder and auto-discover map/entities/game.rb.

const _importSources = { map: null, entities: null, game: null };

// ── Refresh button helpers ────────────────────────────────────────────────────

function _updateRefreshBtn() {
  const btn = document.getElementById('refreshImportBtn');
  if (!btn) return;
  const active = Object.entries(_importSources)
    .filter(([, v]) => v !== null)
    .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1));
  if (active.length === 0) { btn.style.display = 'none'; return; }
  btn.style.display = '';
  btn.title = `Re-import from URL: ${active.join(', ')}`;
}

// ── URL import modal ──────────────────────────────────────────────────────────

const _URL_TYPE_LABELS = {
  map:      'Map (.rb)',
  entities: 'Entities (.rb)',
  game:     'Game (.rb)',
};

const _URL_APPLIERS = {
  map:      (content, label) => applyMapImport(content, label),
  entities: (content, label) => applyEntitiesImport(content, label),
  game:     (content, label) => applyGameImport(content, label),
};

function _labelFromUrl(url) {
  try { return new URL(url).pathname.split('/').filter(Boolean).pop() || url; }
  catch (_) { return url; }
}

function _showUrlImportModal(type) {
  const fileMenu = document.getElementById('fileMenu');
  if (fileMenu) fileMenu.style.display = 'none';

  const existing = _importSources[type];

  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:9999',
    'background:rgba(0,0,0,0.72)',
    'display:flex;align-items:center;justify-content:center',
  ].join(';');

  const modal = document.createElement('div');
  modal.style.cssText = [
    'background:#1e1e1e;color:#ddd;font-family:system-ui,sans-serif;font-size:13px',
    'border:1px solid #555;border-radius:8px',
    'padding:20px 24px;max-width:520px;width:90%',
    'box-shadow:0 8px 32px rgba(0,0,0,0.7)',
  ].join(';');

  modal.innerHTML = `
    <div style="font-size:15px;font-weight:600;color:#ddd;margin-bottom:14px">
      Import ${_URL_TYPE_LABELS[type]} from URL
    </div>
    <label style="display:flex;flex-direction:column;gap:5px;margin-bottom:12px">
      <span style="color:#aaa;font-size:12px">URL</span>
      <input id="_urlImportInput" type="url"
        value="${existing ? existing.url.replace(/"/g, '&quot;') : ''}"
        placeholder="https://raw.githubusercontent.com/&hellip;"
        style="background:#2a2a2a;border:1px solid #555;border-radius:4px;color:#ddd;
               padding:7px 10px;font-size:13px;width:100%;box-sizing:border-box">
    </label>
    <div id="_urlImportError"
      style="display:none;color:#f87171;font-size:12px;margin-bottom:10px"></div>
    <p style="color:#666;font-size:11px;margin:0 0 16px 0">
      Use <code style="color:#94a3b8">raw.githubusercontent.com</code> URLs for
      GitHub files — they allow browser fetch. Regular github.com page URLs will
      fail due to CORS.<br>
      The URL is stored for this session; use ↺ in the toolbar to re-import later.
    </p>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="_urlImportCancel"
        style="padding:6px 16px;background:#444;color:#ddd;border:none;
               border-radius:4px;cursor:pointer;font-size:13px">
        Cancel
      </button>
      <button id="_urlImportOk"
        style="padding:6px 16px;background:#2563eb;color:#fff;border:none;
               border-radius:4px;cursor:pointer;font-size:13px">
        Import
      </button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const input     = modal.querySelector('#_urlImportInput');
  const errorEl   = modal.querySelector('#_urlImportError');
  const cancelBtn = modal.querySelector('#_urlImportCancel');
  const okBtn     = modal.querySelector('#_urlImportOk');

  setTimeout(() => { input.focus(); input.select(); }, 50);

  const dismiss = () => overlay.remove();
  cancelBtn.addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });

  const doImport = async () => {
    const url = input.value.trim();
    if (!url) {
      errorEl.textContent = 'Please enter a URL.';
      errorEl.style.display = '';
      return;
    }
    okBtn.textContent = 'Importing\u2026';
    okBtn.disabled = true;
    errorEl.style.display = 'none';

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      const text = await resp.text();
      const label = _labelFromUrl(url);
      _URL_APPLIERS[type](text, label);
      _importSources[type] = { url, label };
      _updateRefreshBtn();
      overlay.remove();
    } catch (err) {
      console.error('[importUrl]', err);
      // Give a more helpful message for CORS failures
      const msg = err.message.toLowerCase().includes('failed to fetch') || err.message.includes('NetworkError')
        ? `Fetch failed (possible CORS block). Try a raw.githubusercontent.com URL instead.`
        : `Fetch failed: ${err.message}`;
      errorEl.textContent = msg;
      errorEl.style.display = '';
      okBtn.textContent = 'Import';
      okBtn.disabled = false;
    }
  };

  okBtn.addEventListener('click', doImport);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doImport(); });
}

// ── Button wiring ─────────────────────────────────────────────────────────────

document.getElementById('importMapUrlBtn').addEventListener('click',
  () => _showUrlImportModal('map'));
document.getElementById('importEntitiesUrlBtn').addEventListener('click',
  () => _showUrlImportModal('entities'));
document.getElementById('importGameUrlBtn').addEventListener('click',
  () => _showUrlImportModal('game'));

// ── Refresh button ────────────────────────────────────────────────────────────
// Re-fetches all active URL sources. Order: map → game → entities.
// Entities runs last so _resolveGrantedByNames() sees the freshly-imported trains.

document.getElementById('refreshImportBtn').addEventListener('click', async () => {
  const btn  = document.getElementById('refreshImportBtn');
  const orig = btn.textContent;
  btn.textContent = '\u27F3'; // ⟳ spinning feel
  btn.disabled = true;

  // Fixed processing order for dependency correctness
  const order = ['map', 'game', 'entities'];
  try {
    for (const type of order) {
      const src = _importSources[type];
      if (!src) continue;
      if (typeof updateStatus === 'function')
        updateStatus(`Re-importing ${type} from ${src.label}\u2026`);
      const resp = await fetch(src.url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${type} (${src.label})`);
      const text = await resp.text();
      _URL_APPLIERS[type](text, src.label);
    }
  } catch (err) {
    console.error('[refreshImport]', err);
    alert('Refresh failed: ' + err.message);
  } finally {
    btn.textContent = orig;
    btn.disabled = false;
  }
});
