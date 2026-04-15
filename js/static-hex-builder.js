// ─── STATIC HEX BUILDER (Track-First Wizard) ──────────────────────────────────
// 3-step modal: (1) background → (2) draw tracks & nodes → (3) label + finish
// Load order: SEVENTH — after context-menu.js
//
// Tracks drive topology. Nodes (cities/towns) live on tracks, not before them.
//
// Public API:
//   window.openStaticHexWizard(hexId)
//   window.staticHexCode(hex)  — generate map.rb DSL from saved hex model

(function () {
'use strict';

// ── Constants ──────────────────────────────────────────────────────────────────

const PHASES       = ['yellow', 'green', 'brown', 'gray'];
const PHASE_COLORS = { yellow:'#F0D070', green:'#71BF44', brown:'#CB7745', gray:'#BCBDC0' };

const BG_OPTS = [
  { v:'',       label:'Blank',  hex:'#1e1e1e', border:'#555'    },
  { v:'white',  label:'White',  hex:'#D4B483', border:'#bba060' },
  { v:'yellow', label:'Yellow', hex:'#F0D070', border:'#c8a800' },
  { v:'green',  label:'Green',  hex:'#71BF44', border:'#3a8a1a' },
  { v:'brown',  label:'Brown',  hex:'#CB7745', border:'#8a4010' },
  { v:'gray',   label:'Gray',   hex:'#BCBDC0', border:'#888'    },
  { v:'red',    label:'Red',    hex:'#E05050', border:'#900'    },
  { v:'blue',   label:'Blue',   hex:'#4080c0', border:'#205090' },
];

// Canvas — flat-top hex matching existing wizard edge numbering:
//   0=lower-right  1=bottom  2=lower-left  3=upper-left  4=top  5=upper-right
const SC  = 1.56;
const OR  = 50   * SC;   // outer (circum) radius ≈ 78
const IR  = 43.3 * SC;   // inner (in)     radius ≈ 67.5
const CW  = 200, CH = 210;
const CCX = 100, CCY = 102;

// Edge midpoints (absolute canvas coords)
const EMP = [
  [CCX+37.5*SC, CCY+21.65*SC],
  [CCX,         CCY+43.3*SC ],
  [CCX-37.5*SC, CCY+21.65*SC],
  [CCX-37.5*SC, CCY-21.65*SC],
  [CCX,         CCY-43.3*SC ],
  [CCX+37.5*SC, CCY-21.65*SC],
];

// Unit direction from center → each edge (for node positioning)
const EDIR = EMP.map(([x,y]) => {
  const dx = x-CCX, dy = y-CCY, len = Math.hypot(dx,dy);
  return [dx/len, dy/len];
});

// Hex corners
const CORNERS = [
  [CCX+OR,    CCY      ], [CCX+OR/2,  CCY+IR   ],
  [CCX-OR/2,  CCY+IR   ], [CCX-OR,    CCY      ],
  [CCX-OR/2,  CCY-IR   ], [CCX+OR/2,  CCY-IR   ],
];

const EDGE_R   = 12;               // edge circle radius (label inside)
const NODE_R   = 13;               // city circle radius
const TOWN_SZ  = 11;               // town square half-size
const NODE_D   = IR * 0.52;        // multi-node offset from center

// ── Wizard state ──────────────────────────────────────────────────────────────

let _hexId     = null;
let _step      = 1;
let _bg        = '';
let _nodes     = [];      // [{id, type, slots, revenue, phaseRevenue, terminal}]
let _eePaths   = [];      // [{id, ea, eb}] blank edge-to-edge tracks
let _nodeLinks = [];      // [{id, edge, nodeId}]
let _label     = '';
let _uid       = 1;

let _pendingEdge  = null; // first edge selected, waiting for second
let _editNodeId   = null; // node chip open for editing
let _pickerEdges  = null; // {ea, eb|null} — type picker is showing

function _id() { return _uid++; }

function _reset(hexId) {
  _hexId=hexId; _step=1; _bg=''; _nodes=[]; _eePaths=[];
  _nodeLinks=[]; _label=''; _uid=1;
  _pendingEdge=null; _editNodeId=null; _pickerEdges=null;
  const h = (state.hexes||{})[hexId];
  if (h && h.static) { _bg=h.bg||''; _label=h.label||''; }
}

// ── Open / close ──────────────────────────────────────────────────────────────

window.openStaticHexWizard = function (hexId) {
  _reset(hexId);
  document.getElementById('staticHexWizard').style.display = 'flex';
  _renderWiz();
};

function _closeWiz() {
  document.getElementById('staticHexWizard').style.display = 'none';
}

// ── Save model ────────────────────────────────────────────────────────────────

function _buildModel() {
  const cityNodes = _nodes.filter(n => n.type==='city');
  const townNodes = _nodes.filter(n => n.type==='town');
  const offNodes  = _nodes.filter(n => n.type==='offboard');

  let feature = 'none';
  if      (offNodes.length)          feature = 'offboard';
  else if (cityNodes.length >= 3)    feature = 'm';
  else if (cityNodes.length === 2)   feature = 'oo';
  else if (cityNodes.length === 1)   feature = 'city';
  else if (townNodes.length >= 2)    feature = 'dualTown';
  else if (townNodes.length === 1)   feature = 'town';

  const exitSet = new Set();
  _nodeLinks.forEach(l => exitSet.add(l.edge));
  _eePaths.forEach(p => { exitSet.add(p.ea); exitSet.add(p.eb); });
  const exits = Array.from(exitSet).sort((a,b)=>a-b);

  const exitPairs = _nodes.length > 1
    ? _nodes.map(n => _nodeLinks.filter(l=>l.nodeId===n.id).map(l=>l.edge))
    : undefined;

  const p0 = _nodes[0];

  // Phase revenue only applies to cities and offboards — towns always use flat revenue.
  const usesPhaseRev = (_bg==='gray'||_bg==='red') && (feature==='city'||feature==='offboard');
  const phaseRevenue = usesPhaseRev
    ? (p0?.phaseRevenue && Object.keys(p0.phaseRevenue).length ? {...p0.phaseRevenue} : {yellow:20,green:30,brown:40,gray:60})
    : {};
  const activePhases = usesPhaseRev
    ? {yellow:true,green:true,brown:true,gray:true}
    : {};

  return {
    static:         true,
    bg:             _bg,
    feature,
    slots:          cityNodes.length===1 ? (cityNodes[0].slots||1) : undefined,
    ooSlots:        cityNodes.length>=2  ? cityNodes.map(c=>c.slots||1) : undefined,
    exits,
    exitPairs,
    blankPaths:     _eePaths.map(p=>[p.ea,p.eb]),
    rotation:       0,
    terminal:       p0?.terminal || false,
    taperStyle:     1,
    pathMode:       'star',
    pathPairs:      [],
    townRevenue:    townNodes[0]?.revenue ?? 10,
    townRevenues:   townNodes.map(t=>t.revenue||10),
    ooFlatRevenues: cityNodes.map(c=>c.revenue||20),
    mFlatRevenues:  cityNodes.map(c=>c.revenue||20),
    phaseRevenue,
    activePhases,
    label:          _label,
    name:           '',
  };
}

function _save() {
  if (!_hexId) return;
  ensureHex(_hexId);
  Object.assign(state.hexes[_hexId], _buildModel());
  if (typeof updateHexPanel === 'function') updateHexPanel(_hexId);
  render();
  autosave();
  _closeWiz();
}

// ── Main render ───────────────────────────────────────────────────────────────

function _renderWiz() {
  document.querySelectorAll('.shw-step-dot').forEach((d,i) => {
    d.classList.toggle('active', i===_step-1);
    d.classList.toggle('done',   i<_step-1);
  });
  const lbl = document.getElementById('shwStepLabel');
  if (lbl) lbl.textContent = `Step ${_step} of 3`;

  const body    = document.getElementById('shwBody');
  const btnBack = document.getElementById('shwBtnBack');
  const btnNext = document.getElementById('shwBtnNext');

  btnBack.disabled    = (_step===1);
  btnNext.textContent = _step===3 ? 'Finish ✓' : 'Next →';

  btnBack.onclick = () => { if (_step>1) { _step--; _pendingEdge=null; _pickerEdges=null; _renderWiz(); } };
  btnNext.onclick = () => { if (_step<3) { _step++; _renderWiz(); } else _save(); };
  document.getElementById('shwBtnCancel').onclick = _closeWiz;

  if      (_step===1) { body.innerHTML=_html1(); _bindStep1(body); }
  else if (_step===2) { body.innerHTML=_html2(); _bind2(); if(_editNodeId!==null) _renderNodeEdit(_editNodeId); }
  else                { body.innerHTML=_html3(); }
}

// ── Step 1: Background ────────────────────────────────────────────────────────

function _html1() {
  const swatches = BG_OPTS.map(o => {
    const sel = _bg===o.v;
    return `<div class="shw-swatch${sel?' selected':''}"
      style="background:${o.hex};border-color:${sel?'#ffd700':o.border};"
      data-bg="${o.v}"><span>${o.label}</span></div>`;
  }).join('');
  return `<div class="shw-title">Hex Background</div><div class="shw-bg-grid">${swatches}</div>`;
}

function _bindStep1(body) {
  body.querySelectorAll('.shw-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      _bg = sw.dataset.bg;
      body.querySelectorAll('.shw-swatch').forEach(s => {
        const isNow = s.dataset.bg===_bg;
        s.classList.toggle('selected', isNow);
        const opt = BG_OPTS.find(o=>o.v===s.dataset.bg);
        s.style.borderColor = isNow ? '#ffd700' : (opt?.border||'#555');
      });
    });
  });
}

// ── Step 2: Draw tracks ───────────────────────────────────────────────────────

function _html2() {
  return `
    <div class="shw-title">Draw Tracks</div>
    <div style="text-align:center;">${_svgCanvas()}</div>
    <div id="shwInstr" class="shw-subtitle" style="text-align:center;min-height:16px;margin-top:5px;">${_instrHtml()}</div>
    <div id="shwPicker">${_pickerHtml()}</div>
    <div id="shwChips" style="margin-top:8px;">${_chipsHtml()}</div>
    <div id="shwNodeEdit" style="margin-top:4px;"></div>`;
}

function _instrHtml() {
  if (_pickerEdges) return '';
  if (_pendingEdge!==null) return `Edge <b>${_pendingEdge}</b> selected — click another edge or a node`;
  return 'Click an edge to start a track';
}

function _bgHexColor() { return BG_OPTS.find(o=>o.v===_bg)?.hex||'#2a2a2a'; }

function _nodePos(nodeId) {
  const links = _nodeLinks.filter(l=>l.nodeId===nodeId);
  if (_nodes.length<=1 || links.length===0) return [CCX, CCY];
  let dx=0, dy=0;
  links.forEach(l => { dx+=EDIR[l.edge][0]; dy+=EDIR[l.edge][1]; });
  const len = Math.hypot(dx,dy)||1;
  return [CCX+(dx/len)*NODE_D, CCY+(dy/len)*NODE_D];
}

function _svgCanvas() {
  const cornerPts = CORNERS.map(([x,y])=>`${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  let s = `<svg id="shwCanvas" width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}" style="cursor:pointer;display:inline-block;user-select:none;">`;
  s += `<polygon points="${cornerPts}" fill="${_bgHexColor()}" stroke="#888" stroke-width="1.5"/>`;

  // Blank edge-to-edge tracks
  _eePaths.forEach(ep => {
    const [ax,ay]=EMP[ep.ea], [bx,by]=EMP[ep.eb];
    s += `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="#ddd" stroke-width="6" stroke-linecap="round" pointer-events="none"/>`;
  });

  // Tracks from edges to nodes
  _nodes.forEach(n => {
    const [nx,ny] = _nodePos(n.id);
    _nodeLinks.filter(l=>l.nodeId===n.id).forEach(l => {
      const [ex,ey]=EMP[l.edge];
      s += `<line x1="${ex.toFixed(1)}" y1="${ey.toFixed(1)}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#ddd" stroke-width="6" stroke-linecap="round" pointer-events="none"/>`;
    });
  });

  // Node shapes
  _nodes.forEach(n => {
    const [nx,ny] = _nodePos(n.id);
    const isEd    = _editNodeId===n.id;
    const stroke  = isEd ? '#ffd700' : '#333';
    const sw      = isEd ? 2.5 : 2;
    if (n.type==='town') {
      s += `<rect x="${(nx-TOWN_SZ).toFixed(1)}" y="${(ny-TOWN_SZ).toFixed(1)}" width="${TOWN_SZ*2}" height="${TOWN_SZ*2}" fill="white" stroke="${stroke}" stroke-width="${sw}" data-nid="${n.id}" style="cursor:pointer;"/>`;
    } else {
      s += `<circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="${NODE_R}" fill="white" stroke="${stroke}" stroke-width="${sw}" data-nid="${n.id}" style="cursor:pointer;"/>`;
      const slots = Math.min(n.slots||1, 4);
      if (slots>1) {
        for (let k=0; k<slots; k++) {
          const a=(k/slots)*Math.PI*2-Math.PI/2, dr=NODE_R*0.52;
          s += `<circle cx="${(nx+Math.cos(a)*dr).toFixed(1)}" cy="${(ny+Math.sin(a)*dr).toFixed(1)}" r="2.5" fill="#555" pointer-events="none"/>`;
        }
      }
    }
  });

  // Pending edge glow
  if (_pendingEdge!==null) {
    const [px,py]=EMP[_pendingEdge];
    s += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${EDGE_R+5}" fill="#ffd700" opacity="0.3" pointer-events="none"/>`;
  }

  // Edge circles with number labels inside
  for (let e=0; e<6; e++) {
    const [ex,ey] = EMP[e];
    const used = _nodeLinks.some(l=>l.edge===e)||_eePaths.some(p=>p.ea===e||p.eb===e);
    const fill = used ? '#3a7a2a' : (_pendingEdge===e ? '#c8a000' : '#444');
    s += `<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${EDGE_R}" fill="${fill}" stroke="#111" stroke-width="1.5" data-edge="${e}" style="cursor:pointer;"/>`;
    s += `<text x="${ex.toFixed(1)}" y="${(ey+4).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="bold" fill="white" pointer-events="none">${e}</text>`;
  }

  s += '</svg>';
  return s;
}

function _pickerHtml() {
  if (!_pickerEdges) return '';
  const {ea,eb} = _pickerEdges;
  const isStub = eb===null;
  const show0  = _bg==='red'||_bg==='gray';
  return `<div style="background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:10px 12px;margin-top:6px;">
    <div class="shw-subtitle" style="margin-bottom:8px;">${isStub?`Stub at edge <b>${ea}</b>:`:`Track edge <b>${ea}</b> ↔ <b>${eb}</b>:`}</div>
    <div style="display:flex;gap:7px;flex-wrap:wrap;">
      ${!isStub?'<button class="shw-btn-sec" id="shwPkBlank">── Blank</button>':''}
      <button class="shw-btn-sec" id="shwPkTown">◇ Town</button>
      <button class="shw-btn-sec" id="shwPkCity">○ City</button>
      ${show0?'<button class="shw-btn-sec" id="shwPkOff">✦ Offboard</button>':''}
    </div>
    <button class="shw-btn-cancel" style="margin-top:8px;font-size:11px;padding:4px 10px;" id="shwPkCancel">Cancel</button>
  </div>`;
}

function _chipsHtml() {
  if (!_nodes.length && !_eePaths.length)
    return '<div style="text-align:center;color:#555;font-size:11px;padding:4px 0;">No tracks yet — click two edge points above</div>';
  let h = '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">';
  _eePaths.forEach(ep => {
    h += `<div class="shw-chip">── ${ep.ea}↔${ep.eb}<button class="shw-chip-x" data-dep="${ep.id}">×</button></div>`;
  });
  _nodes.forEach(n => {
    const edges = _nodeLinks.filter(l=>l.nodeId===n.id).map(l=>l.edge).join(',');
    const icon  = n.type==='town'?'◇':n.type==='offboard'?'✦':'○';
    const sinfo = n.type==='city'&&(n.slots||1)>1 ? ` ${n.slots}-slot` : '';
    const rev   = n.type!=='offboard' ? ` ${n.revenue||0}` : '';
    const sel   = _editNodeId===n.id;
    h += `<div class="shw-chip${sel?' shw-chip-sel':''}" data-nedit="${n.id}" style="cursor:pointer;">${icon}${sinfo}${rev} [${edges||'—'}]<button class="shw-chip-x" data-dn="${n.id}">×</button></div>`;
  });
  h += '</div>';
  return h;
}

function _bind2() {
  const canvas = document.getElementById('shwCanvas');
  if (canvas) {
    canvas.addEventListener('click', e => {
      const el = e.target;
      if (el.dataset.edge!==undefined && el.dataset.edge!=='') _onEdgeClick(parseInt(el.dataset.edge));
      else if (el.dataset.nid!==undefined && el.dataset.nid!=='')  _onNodeClick(parseInt(el.dataset.nid));
    });
  }

  const chips = document.getElementById('shwChips');
  if (chips) chips.addEventListener('click', e => {
    if (e.target.dataset.dep) {
      _eePaths = _eePaths.filter(p=>p.id!==parseInt(e.target.dataset.dep));
      _refresh2(); return;
    }
    if (e.target.dataset.dn) {
      const nid=parseInt(e.target.dataset.dn);
      _nodes=_nodes.filter(n=>n.id!==nid);
      _nodeLinks=_nodeLinks.filter(l=>l.nodeId!==nid);
      if (_editNodeId===nid) _editNodeId=null;
      _refresh2(); return;
    }
    const ne = e.target.closest('[data-nedit]');
    if (ne && !e.target.dataset.dn) { _editNodeId=parseInt(ne.dataset.nedit); _refresh2(); }
  });

  const bindPick = (id,type) => { const b=document.getElementById(id); if(b) b.onclick=()=>_commitTrack(type); };
  bindPick('shwPkBlank','blank');
  bindPick('shwPkTown', 'town');
  bindPick('shwPkCity', 'city');
  bindPick('shwPkOff',  'offboard');
  const cancel = document.getElementById('shwPkCancel');
  if (cancel) cancel.onclick = () => { _pendingEdge=null; _pickerEdges=null; _refresh2(); };
}

function _onEdgeClick(edge) {
  if (_pickerEdges) return;
  if (_pendingEdge===null)        { _pendingEdge=edge; _refresh2(); }
  else if (_pendingEdge===edge)   { _pickerEdges={ea:edge,eb:null}; _pendingEdge=null; _refresh2(); }
  else                            { _pickerEdges={ea:_pendingEdge,eb:edge}; _pendingEdge=null; _refresh2(); }
}

function _onNodeClick(nodeId) {
  if (_pickerEdges) return;
  if (_pendingEdge!==null) {
    if (!_nodeLinks.some(l=>l.nodeId===nodeId&&l.edge===_pendingEdge))
      _nodeLinks.push({id:_id(),edge:_pendingEdge,nodeId});
    _pendingEdge=null; _refresh2();
  } else {
    _editNodeId = _editNodeId===nodeId ? null : nodeId;
    _refresh2();
  }
}

function _commitTrack(type) {
  const {ea,eb} = _pickerEdges;
  _pickerEdges=null; _pendingEdge=null;
  if (type==='blank') {
    if (eb!==null) _eePaths.push({id:_id(),ea,eb});
  } else {
    // Phase revenue only for cities and offboards — towns always use flat revenue
    const isPhase = (_bg==='gray'||_bg==='red') && (type==='city'||type==='offboard');
    const node = {
      id:           _id(),
      type,
      slots:        1,
      revenue:      type==='town'?10:20,
      phaseRevenue: isPhase?{yellow:20,green:30,brown:40,gray:60}:{},
      terminal:     type==='offboard',
    };
    _nodes.push(node);
    _nodeLinks.push({id:_id(),edge:ea,nodeId:node.id});
    if (eb!==null) _nodeLinks.push({id:_id(),edge:eb,nodeId:node.id});
    _editNodeId = node.id;
  }
  _refresh2();
}

function _refresh2() {
  const body = document.getElementById('shwBody');
  if (!body) return;
  body.innerHTML = _html2();
  _bind2();
  if (_editNodeId!==null) _renderNodeEdit(_editNodeId);
}

// ── Node edit panel ───────────────────────────────────────────────────────────

function _renderNodeEdit(nodeId) {
  const panel = document.getElementById('shwNodeEdit');
  if (!panel) return;
  const n = _nodes.find(x=>x.id===nodeId);
  if (!n) return;
  // Phase revenue only meaningful for cities and offboards
  const isPhase = (_bg==='gray'||_bg==='red') && (n.type==='city'||n.type==='offboard');
  panel.innerHTML = `
    <div style="background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:11px 12px;">
      <div class="shw-subtitle" style="margin-bottom:9px;text-transform:capitalize;">${n.type} settings</div>
      ${n.type==='city'?`
        <div class="shw-field"><label>Token slots</label>
          <div style="display:flex;gap:6px;">
            ${[1,2,3,4].map(s=>`<button class="shw-btn-sec${n.slots===s?' shw-btn-sel':''}" onclick="window._shwSlots(${n.id},${s})">${s}</button>`).join('')}
          </div></div>`:''}
      ${n.type!=='offboard'?( isPhase ? `
        <div class="shw-field"><label>Revenue by phase</label>
          <div class="shw-phase-rows">
            ${PHASES.map(p=>`
              <div class="shw-phase-row">
                <span class="shw-phase-dot" style="background:${PHASE_COLORS[p]};"></span>
                <span class="shw-phase-label">${p}</span>
                <input class="shw-rev-input" type="number" min="0" step="10" value="${n.phaseRevenue?.[p]??0}" oninput="window._shwPhRev(${n.id},'${p}',this.value)">
              </div>`).join('')}
          </div></div>` : `
        <div class="shw-field"><label>Revenue</label>
          <input type="number" min="0" step="10" value="${n.revenue||0}" style="width:80px;" oninput="window._shwRev(${n.id},this.value)">
        </div>`) :''}
      ${n.type==='city'?`
        <div class="shw-field" style="display:flex;align-items:center;gap:7px;margin-bottom:4px;">
          <input type="checkbox" id="shwTerm${n.id}" ${n.terminal?'checked':''} onchange="window._shwTerm(${n.id},this.checked)">
          <label for="shwTerm${n.id}" style="margin:0;cursor:pointer;font-size:12px;color:#aaa;">Terminal (dead-end)</label>
        </div>`:''}
      <button class="shw-btn-primary" style="margin-top:4px;" onclick="window._shwDone()">Done</button>
    </div>`;
}

window._shwSlots = (id,v)   => { const n=_nodes.find(x=>x.id===id); if(n){n.slots=v; _refresh2();} };
window._shwRev   = (id,v)   => { const n=_nodes.find(x=>x.id===id); if(n){n.revenue=parseInt(v)||0; _updateChips();} };
window._shwPhRev = (id,p,v) => { const n=_nodes.find(x=>x.id===id); if(n){if(!n.phaseRevenue)n.phaseRevenue={};n.phaseRevenue[p]=parseInt(v)||0;} };
window._shwTerm  = (id,v)   => { const n=_nodes.find(x=>x.id===id); if(n) n.terminal=v; };
window._shwDone  = ()       => { _editNodeId=null; const p=document.getElementById('shwNodeEdit'); if(p)p.innerHTML=''; _updateChips(); };

function _updateChips() {
  const el=document.getElementById('shwChips'); if(el) el.innerHTML=_chipsHtml();
}

// ── Step 3: Label + preview ───────────────────────────────────────────────────

function _html3() {
  const model = _buildModel();
  const dsl   = typeof window.staticHexCode==='function' ? window.staticHexCode(model) : '';
  const esc   = s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `
    <div class="shw-title">Label & Finish</div>
    <div class="shw-field">
      <label>Label <span style="color:#555;font-size:11px;">(optional — e.g. P, OO, B, NY)</span></label>
      <input type="text" id="shwLbl" value="${esc(_label)}" placeholder="P" autocomplete="off"
        style="width:120px;" oninput="window._shwLbl(this.value)">
    </div>
    <div style="margin-top:14px;">
      <div class="shw-subtitle" style="margin-bottom:5px;">DSL preview</div>
      <pre style="background:#111;border:1px solid #2a2a2a;border-radius:4px;padding:8px 10px;font-size:10px;color:#888;white-space:pre-wrap;word-break:break-all;max-height:80px;overflow-y:auto;margin:0;">${esc(dsl||'(blank hex — no tracks)')}</pre>
    </div>`;
}

window._shwLbl = v => { _label=v.trim(); };

// ── Init ──────────────────────────────────────────────────────────────────────

(function _init() {
  const modal = document.getElementById('staticHexWizard');
  if (!modal) { document.addEventListener('DOMContentLoaded', _init); return; }
  modal.addEventListener('click', e => {
    if (e.target===modal && confirm('Discard this hex build?')) _closeWiz();
  });
}());

// ── Public: staticHexCode ─────────────────────────────────────────────────────
// Generates tobymao map.rb DSL from a saved static hex model.

window.staticHexCode = function staticHexCode(hex) {
  if (!hex || !hex.static) return '';
  const parts  = [];
  const exits  = hex.exits || [];
  const rot    = hex.rotation || 0;
  const isPhase = hex.bg==='gray' || hex.bg==='red';
  const noExits = exits.length===0;

  function phaseRevStr() {
    const pr = hex.phaseRevenue || {};
    const active = PHASES.filter(p => hex.activePhases?.[p]);
    return active.length ? active.map(p=>`${p}_${pr[p]||0}`).join('|') : '0';
  }

  const termSuffix = hex.feature==='offboard'
    ? `,terminal:${hex.taperStyle||1}`
    : (hex.terminal?',terminal:1':'');

  // ── Node directives ───────────────────────────────────────────────────────
  switch (hex.feature) {
    case 'town':
      parts.push(`town=revenue:${noExits?0:(hex.townRevenue??10)}`);
      break;
    case 'dualTown': {
      const [r0,r1] = hex.townRevenues||[10,10];
      parts.push(`town=revenue:${noExits?0:r0}`);
      parts.push(`town=revenue:${noExits?0:r1}`);
      break;
    }
    case 'offboard':
      parts.push(`offboard=revenue:${isPhase?phaseRevStr():'0'}`);
      break;
    case 'oo':
    case 'c': {
      const revs = hex.ooFlatRevenues||[20,20];
      const sl   = hex.ooSlots||[1,1];
      [0,1].forEach(i=>parts.push(`city=revenue:${noExits?0:revs[i]||0}${sl[i]>1?`,slots:${sl[i]}`:''}`));
      break;
    }
    case 'm': {
      const revs = hex.mFlatRevenues||[20,20,20];
      [0,1,2].forEach(i=>parts.push(`city=revenue:${noExits?0:revs[i]||0}`));
      break;
    }
    case 'city': {
      const slots = hex.slots||1;
      const rev   = isPhase ? phaseRevStr() : (noExits?0:(hex.ooFlatRevenues?.[0]??20));
      const sl    = slots>1?`,slots:${slots}`:'';
      const loc   = slots===3?',loc:1':'';
      parts.push(`city=revenue:${rev}${sl}${loc}`);
      break;
    }
    default: break;
  }

  // ── Path directives ───────────────────────────────────────────────────────
  if (!hex.feature || hex.feature==='none') {
    // Blank hex: use stored blankPaths if available
    (hex.blankPaths||[]).forEach(([a,b])=>parts.push(`path=a:${(a+rot)%6},b:${(b+rot)%6}`));
  } else if (hex.feature==='oo'||hex.feature==='c') {
    const ep = hex.exitPairs;
    const [a0,a1] = (ep&&ep.length>=2) ? ep : [exits.slice(0,Math.ceil(exits.length/2)), exits.slice(Math.ceil(exits.length/2))];
    (a0||[]).forEach(e=>parts.push(`path=a:${(e+rot)%6},b:_0${termSuffix}`));
    (a1||[]).forEach(e=>parts.push(`path=a:${(e+rot)%6},b:_1${termSuffix}`));
  } else if (hex.feature==='m') {
    const ep = hex.exitPairs||[];
    if (ep.length>=3) {
      [0,1,2].forEach(i=>(ep[i]||[]).forEach(e=>parts.push(`path=a:${(e+rot)%6},b:_${i}${termSuffix}`)));
    } else {
      exits.forEach((e,i)=>parts.push(`path=a:${(e+rot)%6},b:_${i%3}${termSuffix}`));
    }
  } else if (hex.feature==='dualTown') {
    const ep = hex.exitPairs;
    const [a0,a1] = (ep&&ep.length>=2&&(ep[0].length||ep[1].length)) ? ep : [exits.slice(0,Math.ceil(exits.length/2)),exits.slice(Math.ceil(exits.length/2))];
    (a0||[]).forEach(e=>parts.push(`path=a:${(e+rot)%6},b:_0${termSuffix}`));
    (a1||[]).forEach(e=>parts.push(`path=a:${(e+rot)%6},b:_1${termSuffix}`));
  } else if (hex.feature==='city'&&hex.pathMode==='directed'&&(hex.pathPairs||[]).length) {
    const paired={};
    (hex.pathPairs||[]).forEach(([pa,pb])=>{
      parts.push(`path=a:${(pa+rot)%6},b:${(pb+rot)%6}`);
      paired[pa]=paired[pb]=true;
    });
    exits.forEach(e=>{ if(!paired[e]) parts.push(`path=a:${(e+rot)%6},b:_0${termSuffix}`); });
  } else {
    exits.forEach(e=>parts.push(`path=a:${(e+rot)%6},b:_0${termSuffix}`));
  }

  if (hex.label) parts.push(`label=${hex.label}`);

  (hex.borders||[]).forEach(b=>{
    let d=`border=edge:${b.edge}`;
    if(b.type)d+=`,type:${b.type}`;
    if(b.cost)d+=`,cost:${b.cost}`;
    parts.push(d);
  });

  return parts.join(';');
};

}());
