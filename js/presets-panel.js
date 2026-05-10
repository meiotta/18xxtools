// js/presets-panel.js -- v20260510a
// Mechanical archetype presets modal.
// Triggered from File > Load Preset... (id="loadPresetBtn").
// Exposes window.presetsPanel = { open, close }.
'use strict';
(function () {

const PC = { yellow: '#e8c840', green: '#44aa44', brown: '#8b4513', grey: '#888888' };

function mkN(id, n, cost, count, rusts, rustsOn, phase) {
  return { id, distType: 'n', n, cost, count: count < 0 ? null : count,
           rusts: !!rusts, rustsOn: rustsOn || null, phase: phase || '', variants: [] };
}
function mkXY(id, x, y, cost, count, phase) {
  return { id, distType: 'xy', x, y, cost, count,
           rusts: false, rustsOn: null, phase: phase || '', variants: [] };
}
function mkD(id, cost, phase) {
  return { id, distType: 'u', cost, count: null,
           rusts: false, rustsOn: null, phase: phase || '', variants: [] };
}
function mkPh(name, onTrain, ors, limit, tiles) {
  return { name, onTrain, ors, limit, tiles, color: PC[tiles] };
}
function uid() { return '_' + Math.random().toString(36).slice(2, 9); }
function co(sym, name, color, textColor) {
  return { id: uid(), sym, name, color, textColor: textColor || '#fff',
           logo: '', coordinates: '', city: '', abilities: [] };
}

// -- Preset definitions -------------------------------------------------------

const PRESETS = [
  {
    id: 'classic_1830',
    label: '1830 Classic',
    desc: '8 major railways, 60% float, full capitalization.',
    desc2: 'Standard 2-3-4-5-6-D train progression with 6 privates.',
    sets: '6 trains, 6 phases, 8 corps, 6 privates',
    build: () => ({
      trains: [
        mkN('t_2', 2,  80,  6, true,  't_4', '2'),
        mkN('t_3', 3, 180,  5, true,  't_5', '3'),
        mkN('t_4', 4, 300,  4, false, null,  '4'),
        mkN('t_5', 5, 450,  3, false, null,  '5'),
        mkN('t_6', 6, 630,  2, false, null,  '6'),
        mkD('t_D',    1100,                  'D'),
      ],
      phases: [
        mkPh('2', '',     2, 4, 'yellow'),
        mkPh('3', 't_3',  2, 4, 'yellow'),
        mkPh('4', 't_4',  2, 3, 'green'),
        mkPh('5', 't_5',  3, 3, 'green'),
        mkPh('6', 't_6',  3, 2, 'brown'),
        mkPh('D', 't_D',  3, 2, 'grey'),
      ],
      corpPacks: [{
        id: uid(), label: 'Major Railways', type: 'major',
        floatPct: 60, maxOwnershipPct: 60, capitalization: 'full',
        alwaysMarketPrice: false, shares: 10, tokens: [0, 40, 100],
        companies: [
          co('PRR',  'Pennsylvania Railroad',               '#4682B4'),
          co('NYC',  'New York Central',                    '#808080'),
          co('CPR',  'Canadian Pacific',                    '#8B0000'),
          co('B&O',  'Baltimore & Ohio',                    '#000080'),
          co('C&O',  'Chesapeake & Ohio',                   '#228B22'),
          co('ERIE', 'Erie Railroad',                       '#FFD700', '#000'),
          co('NYNH', 'New York, New Haven & Hartford',      '#FF6347'),
          co('B&M',  'Boston & Maine',                      '#4B0082'),
        ],
      }],
      privates: [
        { id: uid(), sym: 'SV', abbr: 'SV', name: 'Schuylkill Valley',          value:  20, revenue:  5, desc: '' },
        { id: uid(), sym: 'CS', abbr: 'CS', name: 'Champlain & St. Lawrence',   value:  40, revenue: 10, desc: '' },
        { id: uid(), sym: 'DH', abbr: 'DH', name: 'Delaware & Hudson',          value:  70, revenue: 15, desc: '' },
        { id: uid(), sym: 'MH', abbr: 'MH', name: 'Mohawk & Hudson',            value: 110, revenue: 20, desc: '' },
        { id: uid(), sym: 'CA', abbr: 'CA', name: 'Camden & Amboy',             value: 160, revenue: 25, desc: '' },
        { id: uid(), sym: 'BO', abbr: 'BO', name: 'Baltimore & Ohio',           value: 220, revenue: 30, desc: '' },
      ],
      mechanics: {},
    }),
  },

  {
    id: 'style_1846',
    label: '1846 Style',
    desc: 'Majors + independent railways, incremental cap.',
    desc2: '2-3-4-4E-5-6 trains. 4E express train skips towns.',
    sets: '6 trains, 5 phases, 8 corps',
    build: () => ({
      trains: [
        mkN ('t_2',  2,  80, 7, true,  't_4',  '2'),
        mkN ('t_3',  3, 180, 6, true,  't_5',  '3'),
        mkN ('t_4',  4, 300, 4, false, null,   '4'),
        mkXY('t_4E', 4, 1,  300, 4,            '4'),
        mkN ('t_5',  5, 450, 3, false, null,   '5'),
        mkN ('t_6',  6, 630, 2, false, null,   '6'),
      ],
      phases: [
        mkPh('2', '',     2, 4, 'yellow'),
        mkPh('3', 't_3',  2, 4, 'yellow'),
        mkPh('4', 't_4',  2, 3, 'green'),
        mkPh('5', 't_5',  3, 3, 'brown'),
        mkPh('6', 't_6',  3, 2, 'brown'),
      ],
      corpPacks: [
        {
          id: uid(), label: 'Major Railways', type: 'major',
          floatPct: 50, maxOwnershipPct: 60, capitalization: 'incremental',
          alwaysMarketPrice: false, shares: 10, tokens: [0, 40, 80, 120],
          companies: [
            co('IC',  'Illinois Central',       '#228B22'),
            co('B&O', 'Baltimore & Ohio',        '#4169E1'),
            co('C&O', 'Chesapeake & Ohio',       '#FFD700', '#000'),
            co('NYC', 'New York Central',        '#808080'),
            co('PRR', 'Pennsylvania Railroad',   '#8B0000'),
          ],
        },
        {
          id: uid(), label: 'Independent Railways', type: 'minor',
          floatPct: 40, maxOwnershipPct: 100, capitalization: 'incremental',
          alwaysMarketPrice: false, shares: 4, tokens: [0, 40],
          companies: [
            co('M&C',  'Michigan Central',             '#4B0082'),
            co('OH&I', 'Ohio & Indiana',               '#FF6347'),
            co('C&WI', 'Chicago & Western Indiana',    '#8B4513'),
          ],
        },
      ],
      privates: [],
      mechanics: {},
    }),
  },

  {
    id: 'style_1822',
    label: '1822 Style',
    desc: 'British majors, longer train runs, concession privates.',
    desc2: '2-3-4-5-6-7-8 progression. Full cap, 7 phases.',
    sets: '7 trains, 7 phases, 8 corps, 6 concessions',
    build: () => ({
      trains: [
        mkN('t_2', 2, 100, 7, true,  't_4', '2'),
        mkN('t_3', 3, 200, 5, true,  't_5', '3'),
        mkN('t_4', 4, 300, 4, false, null,  '4'),
        mkN('t_5', 5, 450, 3, false, null,  '5'),
        mkN('t_6', 6, 600, 2, false, null,  '6'),
        mkN('t_7', 7, 750, 2, false, null,  '7'),
        mkN('t_8', 8, 800,-1, false, null,  '8'),
      ],
      phases: [
        mkPh('2', '',     2, 4, 'yellow'),
        mkPh('3', 't_3',  2, 4, 'yellow'),
        mkPh('4', 't_4',  2, 3, 'green'),
        mkPh('5', 't_5',  3, 3, 'green'),
        mkPh('6', 't_6',  3, 2, 'brown'),
        mkPh('7', 't_7',  3, 2, 'brown'),
        mkPh('8', 't_8',  3, 2, 'grey'),
      ],
      corpPacks: [{
        id: uid(), label: 'Major Railways', type: 'major',
        floatPct: 60, maxOwnershipPct: 60, capitalization: 'full',
        alwaysMarketPrice: false, shares: 10, tokens: [0, 40, 100, 100],
        companies: [
          co('LNWR', 'London & North Western',           '#2F4F4F'),
          co('MR',   'Midland Railway',                  '#8B0000'),
          co('GWR',  'Great Western Railway',            '#006400'),
          co('LSWR', 'London & South Western',           '#B8860B', '#000'),
          co('GNR',  'Great Northern Railway',           '#4169E1'),
          co('SECR', 'South Eastern & Chatham',          '#556B2F'),
          co('LBSC', 'London, Brighton & South Coast',   '#8B4513'),
          co('NBR',  'North British Railway',            '#800080'),
        ],
      }],
      privates: [
        { id: uid(), sym: 'C1', abbr: 'C1', name: 'Concession 1', value: 50, revenue: 0, desc: '' },
        { id: uid(), sym: 'C2', abbr: 'C2', name: 'Concession 2', value: 50, revenue: 0, desc: '' },
        { id: uid(), sym: 'C3', abbr: 'C3', name: 'Concession 3', value: 50, revenue: 0, desc: '' },
        { id: uid(), sym: 'C4', abbr: 'C4', name: 'Concession 4', value: 50, revenue: 0, desc: '' },
        { id: uid(), sym: 'C5', abbr: 'C5', name: 'Concession 5', value: 50, revenue: 0, desc: '' },
        { id: uid(), sym: 'C6', abbr: 'C6', name: 'Concession 6', value: 50, revenue: 0, desc: '' },
      ],
      mechanics: {},
    }),
  },

  {
    id: 'style_1817',
    label: '1817 Style',
    desc: 'Self-funding 2-share corps, loans at 10% interest.',
    desc2: 'W-suffix trains, always market price, 7 phases.',
    sets: '7 trains, 7 phases, 8 corps, mechanics',
    build: () => ({
      trains: [
        mkN('t_2W', 2, 100, 6, true,  't_4W', '2'),
        mkN('t_3W', 3, 200, 5, true,  't_5W', '3'),
        mkN('t_4W', 4, 300, 4, true,  't_6W', '4'),
        mkN('t_5W', 5, 400, 3, false, null,   '5'),
        mkN('t_6W', 6, 600, 2, false, null,   '6'),
        mkN('t_7W', 7, 750, 2, false, null,   '7'),
        mkN('t_8W', 8, 800, 6, false, null,   '8'),
      ],
      phases: [
        mkPh('2', '',      2, 4, 'yellow'),
        mkPh('3', 't_3W',  2, 4, 'yellow'),
        mkPh('4', 't_4W',  2, 3, 'green'),
        mkPh('5', 't_5W',  3, 3, 'brown'),
        mkPh('6', 't_6W',  3, 2, 'brown'),
        mkPh('7', 't_7W',  3, 2, 'brown'),
        mkPh('8', 't_8W',  3, 2, 'grey'),
      ],
      corpPacks: [{
        id: uid(), label: 'Corporations', type: 'major',
        floatPct: 20, maxOwnershipPct: 100, capitalization: 'incremental',
        alwaysMarketPrice: true, shares: 2, tokens: [0],
        companies: [
          co('A', 'Corporation A', '#B22222'),
          co('B', 'Corporation B', '#2E8B57'),
          co('C', 'Corporation C', '#4169E1'),
          co('D', 'Corporation D', '#FF8C00', '#000'),
          co('E', 'Corporation E', '#9400D3'),
          co('F', 'Corporation F', '#8B4513'),
          co('G', 'Corporation G', '#2F4F4F'),
          co('H', 'Corporation H', '#C71585'),
        ],
      }],
      privates: [],
      mechanics: { loans: { enabled: true, value: 100, interest: 10 } },
    }),
  },

  {
    id: 'style_1861',
    label: '1861 Style',
    desc: '7 major railways, 50% float, merger round enabled.',
    desc2: '2-3-4-5-6-D trains. Russian railways archetype.',
    sets: '6 trains, 6 phases, 7 corps, mechanics',
    build: () => ({
      trains: [
        mkN('t_2', 2, 100, 6, true,  't_4', '2'),
        mkN('t_3', 3, 200, 5, true,  't_5', '3'),
        mkN('t_4', 4, 300, 4, false, null,  '4'),
        mkN('t_5', 5, 450, 3, false, null,  '5'),
        mkN('t_6', 6, 600, 2, false, null,  '6'),
        mkD('t_D',    1100,                 'D'),
      ],
      phases: [
        mkPh('2', '',     2, 4, 'yellow'),
        mkPh('3', 't_3',  2, 4, 'yellow'),
        mkPh('4', 't_4',  2, 3, 'green'),
        mkPh('5', 't_5',  3, 3, 'brown'),
        mkPh('6', 't_6',  3, 2, 'brown'),
        mkPh('D', 't_D',  3, 2, 'grey'),
      ],
      corpPacks: [{
        id: uid(), label: 'Major Railways', type: 'major',
        floatPct: 50, maxOwnershipPct: 60, capitalization: 'full',
        alwaysMarketPrice: false, shares: 10, tokens: [0, 40, 100],
        companies: [
          co('SPW', 'St. Petersburg-Warsaw',         '#4169E1'),
          co('MB',  'Moscow-Brest',                  '#8B0000'),
          co('MK',  'Moscow-Kursk',                  '#228B22'),
          co('RO',  'Riga-Orel',                     '#FF8C00', '#000'),
          co('MNN', 'Moscow-Nizhni Novgorod',        '#9400D3'),
          co('OK',  'Odessa-Kiev',                   '#8B4513'),
          co('V',   'Vologda',                       '#2F4F4F'),
        ],
      }],
      privates: [],
      mechanics: { mergingRound: true },
    }),
  },
];

// -- State --------------------------------------------------------------------

let _overlay = null;
let _selected = null;

// -- Open / close -------------------------------------------------------------

function open() {
  if (_overlay) return;
  _selected = null;
  _overlay = _buildModal();
  document.body.appendChild(_overlay);
}

function close() {
  if (!_overlay) return;
  _overlay.remove();
  _overlay = null;
  _selected = null;
}

// -- Build modal --------------------------------------------------------------

function _buildModal() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9000;display:flex;align-items:center;justify-content:center;';
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  const box = document.createElement('div');
  box.style.cssText = [
    'background:var(--bg-panel,#2a2a2a)',
    'border:1px solid var(--border-mid,#444)',
    'border-radius:8px',
    'width:800px',
    'max-width:calc(100vw - 40px)',
    'max-height:calc(100vh - 80px)',
    'display:flex',
    'flex-direction:column',
    'overflow:hidden',
    'box-shadow:0 12px 40px rgba(0,0,0,0.6)',
  ].join(';');

  // Header row
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border-mid,#444);flex-shrink:0;';
  hdr.innerHTML = '<span style="font-size:15px;font-weight:600;color:var(--text-primary,#eee);">Load Preset</span>'
    + '<button id="_presetsCloseBtn" style="background:none;border:none;color:#999;font-size:20px;cursor:pointer;line-height:1;padding:0 4px;">&times;</button>';

  // Body: two zones
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex:1;overflow:hidden;min-height:0;';

  // Left: preset list
  const left = document.createElement('div');
  left.id = '_presetsList';
  left.style.cssText = 'width:260px;flex-shrink:0;border-right:1px solid var(--border-mid,#444);overflow-y:auto;padding:8px 0;';

  PRESETS.forEach(p => {
    const card = document.createElement('div');
    card.dataset.presetId = p.id;
    card.style.cssText = 'padding:10px 14px 10px 11px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.06);border-left:3px solid transparent;transition:background 0.1s;';
    card.innerHTML = '<div style="font-size:13px;font-weight:600;color:var(--text-primary,#eee);margin-bottom:3px;">' + p.label + '</div>'
      + '<div style="font-size:11px;color:#aaa;margin-bottom:4px;">' + p.desc + '</div>'
      + '<div style="font-size:10px;color:#666;">Sets: ' + p.sets + '</div>';
    card.addEventListener('mouseenter', () => { if (_selected !== p) card.style.background = 'rgba(255,255,255,0.05)'; });
    card.addEventListener('mouseleave', () => { if (_selected !== p) card.style.background = ''; });
    card.addEventListener('click', () => _selectPreset(p, box));
    left.appendChild(card);
  });

  // Right: placeholder until a preset is selected
  const right = document.createElement('div');
  right.id = '_presetsRight';
  right.style.cssText = 'flex:1;padding:20px;display:flex;flex-direction:column;justify-content:center;align-items:center;overflow-y:auto;';
  right.innerHTML = '<div style="color:#666;font-size:13px;text-align:center;">Select a preset from the left to continue.</div>';

  body.appendChild(left);
  body.appendChild(right);
  box.appendChild(hdr);
  box.appendChild(body);
  overlay.appendChild(box);

  hdr.querySelector('#_presetsCloseBtn').addEventListener('click', close);
  return overlay;
}

function _selectPreset(preset, box) {
  _selected = preset;

  // Highlight selected card
  box.querySelectorAll('#_presetsList > div').forEach(card => {
    const active = card.dataset.presetId === preset.id;
    card.style.background = active ? 'rgba(100,160,255,0.12)' : '';
    card.style.borderLeft  = active ? '3px solid var(--accent,#5090d0)' : '3px solid transparent';
  });

  const right = box.querySelector('#_presetsRight');
  right.style.justifyContent = 'flex-start';
  right.style.alignItems     = 'stretch';

  right.innerHTML = [
    '<div style="margin-bottom:16px;">',
      '<div style="font-size:15px;font-weight:600;color:var(--text-primary,#eee);margin-bottom:4px;">' + preset.label + '</div>',
      '<div style="font-size:12px;color:#aaa;margin-bottom:2px;">' + preset.desc + '</div>',
      '<div style="font-size:12px;color:#aaa;">' + preset.desc2 + '</div>',
    '</div>',
    '<div style="font-size:11px;font-weight:600;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Apply this preset to:</div>',
    _ck('_ck_trains',    'Trains &amp; Phases',             true),
    _ck('_ck_corps',     'Corporations (corp packs)',        true),
    _ck('_ck_privates',  'Companies (privates)',             true),
    _ck('_ck_mechanics', 'Mechanics',                        true),
    _ck('_ck_market',    'Market',                           false),
    '<div style="margin-top:10px;font-size:11px;color:#555;">Your map will not be affected.</div>',
    '<div style="flex:1;min-height:16px;"></div>',
    '<button id="_presetsApplyBtn" style="margin-top:16px;padding:10px 28px;background:var(--accent,#4a80c8);color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;">Apply Preset</button>',
  ].join('');

  right.querySelector('#_presetsApplyBtn').addEventListener('click', _apply);
}

function _ck(id, label, checked) {
  return '<label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;font-size:13px;color:var(--text-primary,#ddd);">'
    + '<input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + ' style="width:14px;height:14px;cursor:pointer;"> ' + label
    + '</label>';
}

// -- Apply --------------------------------------------------------------------

function _apply() {
  if (!_selected) return;
  const data = _selected.build();

  const get = id => document.getElementById(id);
  const ckTrains    = get('_ck_trains')?.checked;
  const ckCorps     = get('_ck_corps')?.checked;
  const ckPrivates  = get('_ck_privates')?.checked;
  const ckMechanics = get('_ck_mechanics')?.checked;

  if (ckTrains)   { state.trains = data.trains; state.phases = data.phases; }
  if (ckCorps)    { state.corpPacks = data.corpPacks; }
  if (ckPrivates) { state.privates = data.privates; }
  if (ckMechanics) {
    if (!state.mechanics) state.mechanics = {};
    const preset = data.mechanics;
    // Apply preset mechanic keys
    Object.assign(state.mechanics, preset);
    // Remove mechanic keys this preset doesn't set (avoid stale state from a prior preset)
    const presetKeys = new Set(Object.keys(preset));
    ['loans', 'mergingRound'].forEach(k => { if (!presetKeys.has(k)) delete state.mechanics[k]; });
  }

  if (typeof renderTrainsTable   === 'function') renderTrainsTable();
  if (typeof renderPhasesTable   === 'function') renderPhasesTable();
  if (typeof renderCorpsSection  === 'function') renderCorpsSection();
  if (typeof renderPrivatesCards === 'function') renderPrivatesCards();
  if (typeof autosave            === 'function') autosave();

  close();
}

// -- Wire up ------------------------------------------------------------------

window.presetsPanel = { open, close };

const _menuBtn = document.getElementById('loadPresetBtn');
if (_menuBtn) _menuBtn.addEventListener('click', () => {
  const fm = document.getElementById('fileMenu');
  if (fm) fm.style.display = 'none';
  open();
});

})();
