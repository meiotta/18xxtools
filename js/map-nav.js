// ─── MAP NAVIGATION ──────────────────────────────────────────────────────────
// Enhanced map navigation for the SVG canvas:
//   • Middle-mouse-button drag to pan
//   • Arrow-key pan (when map SVG is focused)
//   • Themed overlay scrollbars (horizontal + vertical) that reflect and
//     control panX/panY — styled with the editor's gold accent colour.
//
// Load order: after canvas-input.js (needs panX/panY/zoom/updateViewport globals
// and hex-geometry/constants for getHexCenter/HEX_SIZE).
// v=20260422b

// ── Middle-mouse drag panning ─────────────────────────────────────────────────
(function () {
  const svg = document.getElementById('mapSvg');
  if (!svg) return;

  let _active = false;
  let _startX = 0, _startY = 0;
  let _panX0  = 0, _panY0  = 0;

  svg.addEventListener('mousedown', (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    _active = true;
    _startX = e.clientX;
    _startY = e.clientY;
    _panX0  = panX;
    _panY0  = panY;
    svg.style.cursor = 'grabbing';
    document.addEventListener('mousemove', _mmMove);
    document.addEventListener('mouseup',   _mmUp);
  });

  function _mmMove(e) {
    if (!_active) return;
    panX = _panX0 + (e.clientX - _startX) / zoom;
    panY = _panY0 + (e.clientY - _startY) / zoom;
    updateViewport();
  }

  function _mmUp(e) {
    if (e.button !== 1) return;
    _active = false;
    svg.style.cursor = '';
    document.removeEventListener('mousemove', _mmMove);
    document.removeEventListener('mouseup',   _mmUp);
  }
})();

// ── Arrow-key panning ─────────────────────────────────────────────────────────
(function () {
  const svg = document.getElementById('mapSvg');
  if (!svg) return;
  svg.addEventListener('keydown', (e) => {
    const STEP = 40;
    switch (e.key) {
      case 'ArrowLeft':  panX += STEP / zoom; break;
      case 'ArrowRight': panX -= STEP / zoom; break;
      case 'ArrowUp':    panY += STEP / zoom; break;
      case 'ArrowDown':  panY -= STEP / zoom; break;
      default: return;
    }
    e.preventDefault();
    updateViewport();
  });
})();

// ── Overlay scrollbars ────────────────────────────────────────────────────────
(function () {
  const container = document.getElementById('canvasContainer');
  const svg       = document.getElementById('mapSvg');
  if (!container || !svg) return;

  // ── Build DOM (helper declarations first so hoisting is unambiguous) ──────
  function _makeTrack(id, cls) {
    const t = document.createElement('div');
    t.id = id;
    t.className = 'map-scroll-track ' + cls;
    t.style.display = 'none';   // hidden until first valid _update()
    container.appendChild(t);
    return t;
  }
  function _makeThumb(track) {
    const th = document.createElement('div');
    th.className = 'map-scroll-thumb';
    track.appendChild(th);
    return th;
  }

  const hTrack = _makeTrack('mapScrollH', 'map-scroll-h');
  const hThumb = _makeThumb(hTrack);
  const vTrack = _makeTrack('mapScrollV', 'map-scroll-v');
  const vThumb = _makeThumb(vTrack);

  const corner = document.createElement('div');
  corner.className = 'map-scroll-corner';
  corner.style.display = 'none';
  container.appendChild(corner);

  // ── Content bounds ─────────────────────────────────────────────────────────
  function _bounds() {
    const rows   = state.meta?.rows   || 0;
    const cols   = state.meta?.cols   || 0;
    const orient = state.meta?.orientation || 'flat';
    const pad    = HEX_SIZE * 2;
    if (rows === 0 || cols === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const { x, y } = getHexCenter(r, c, HEX_SIZE, orient);
        if (x < minX) minX = x;  if (x > maxX) maxX = x;
        if (y < minY) minY = y;  if (y > maxY) maxY = y;
      }
    }
    return { x0: minX - pad, x1: maxX + pad, y0: minY - pad, y1: maxY + pad };
  }

  // ── Refresh scrollbar geometry from current pan/zoom ──────────────────────
  // Scrollbars are ALWAYS shown once a map is loaded — the thumb size and
  // position communicate how much of the map is visible and where you are.
  // (A full-width thumb means the whole axis fits; dragging still works.)
  function _update() {
    const cw = svg.clientWidth  || container.clientWidth;
    const ch = svg.clientHeight || container.clientHeight;
    if (!cw || !ch) return;          // container not laid out yet — skip

    const b = _bounds();
    if (!b) return;                  // map not configured yet — keep hidden

    // Reveal tracks once we have a valid map and laid-out container
    hTrack.style.display = '';
    vTrack.style.display = '';
    corner.style.display = '';

    const visW = cw / zoom;
    const visH = ch / zoom;
    const cntW = b.x1 - b.x0;
    const cntH = b.y1 - b.y0;

    // Horizontal
    const hTW   = hTrack.clientWidth;
    const hFrac = Math.min(1, visW / cntW);
    const hPos  = (cntW > visW)
      ? Math.max(0, Math.min(1 - hFrac, (-panX - b.x0) / (cntW - visW)))
      : 0;
    hThumb.style.width = Math.max(20, hFrac * hTW).toFixed(1) + 'px';
    hThumb.style.left  = (hPos * hTW).toFixed(1) + 'px';

    // Vertical
    const vTH   = vTrack.clientHeight;
    const vFrac = Math.min(1, visH / cntH);
    const vPos  = (cntH > visH)
      ? Math.max(0, Math.min(1 - vFrac, (-panY - b.y0) / (cntH - visH)))
      : 0;
    vThumb.style.height = Math.max(20, vFrac * vTH).toFixed(1) + 'px';
    vThumb.style.top    = (vPos * vTH).toFixed(1) + 'px';
  }

  // Expose so external callers can trigger a refresh if needed.
  window._updateScrollbars = _update;

  // ── Patch updateViewport so scrollbars refresh on every pan/zoom ──────────
  const _origUV = updateViewport;
  window.updateViewport = function () {
    _origUV();
    _update();
  };

  // ── Thumb drag ────────────────────────────────────────────────────────────
  function _makeDraggable(thumb, track, axis) {
    thumb.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const b     = _bounds();
      if (!b) return;
      const cw    = svg.clientWidth  || container.clientWidth;
      const ch    = svg.clientHeight || container.clientHeight;
      const vis   = axis === 'h' ? cw / zoom          : ch / zoom;
      const cnt   = axis === 'h' ? (b.x1 - b.x0)     : (b.y1 - b.y0);
      const minB  = axis === 'h' ? b.x0               : b.y0;
      const trkSz = axis === 'h' ? track.clientWidth  : track.clientHeight;
      const tmbSz = axis === 'h' ? thumb.offsetWidth  : thumb.offsetHeight;
      const panRange   = Math.max(0, cnt - vis);
      const trackRange = trkSz - tmbSz;
      const startMouse = axis === 'h' ? e.clientX : e.clientY;
      const startPan   = axis === 'h' ? panX      : panY;

      function onMove(me) {
        if (trackRange <= 0) return;
        const delta = (axis === 'h' ? me.clientX : me.clientY) - startMouse;
        const world = delta / trackRange * panRange;
        if (axis === 'h') panX = startPan - world;
        else              panY = startPan - world;
        updateViewport();
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  _makeDraggable(hThumb, hTrack, 'h');
  _makeDraggable(vThumb, vTrack, 'v');

  // ── Click on track body to jump ───────────────────────────────────────────
  function _onTrackClick(e, track, axis) {
    if (e.target !== track) return; // thumb drag handled separately
    const b = _bounds();
    if (!b) return;
    const rect  = track.getBoundingClientRect();
    const click = axis === 'h'
      ? (e.clientX - rect.left) / rect.width
      : (e.clientY - rect.top)  / rect.height;
    const cw    = svg.clientWidth  || container.clientWidth;
    const ch    = svg.clientHeight || container.clientHeight;
    const vis   = axis === 'h' ? cw / zoom      : ch / zoom;
    const cnt   = axis === 'h' ? (b.x1 - b.x0) : (b.y1 - b.y0);
    const minB  = axis === 'h' ? b.x0           : b.y0;
    const frac  = Math.min(1, vis / cnt);
    const pos   = Math.max(0, Math.min(1 - frac, click - frac / 2));
    const world = -(pos * Math.max(0, cnt - vis) + minB);
    if (axis === 'h') panX = world;
    else              panY = world;
    updateViewport();
  }

  hTrack.addEventListener('mousedown', (e) => _onTrackClick(e, hTrack, 'h'));
  vTrack.addEventListener('mousedown', (e) => _onTrackClick(e, vTrack, 'v'));

})();
