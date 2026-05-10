// js/game-wizard.js  v20260510a
// Mechanic-first game setup wizard — multi-step modal.
// API: window.gameWizard = { open(), close() }
// Triggered by the "✦ New Game" toolbar button.
//
// On Apply, writes to:
//   state.trains[], state.phases[]
//   state.corpPacks[]
//   state.privates[]
//   state.mechanics.loans, state.mechanics.capitalization
// Then calls renderTrainsTable / renderPhasesTable / renderCorpsSection /
// renderPrivatesCards / autosave.
//
// Load order: after state.js, trains-panel.js, companies-panel.js.

'use strict';

(function () {

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  {
    key: 'corpStructure',
    title: 'Corporation Structure',
    options: [
      { id: 'classic_majors',  label: 'Classic Majors',
        desc: '8 major corporations, float at 60% — 1830 style' },
      { id: 'majors_minors',   label: 'Majors + Phase-Conditional Minors',
        desc: 'Majors with 1822-style minor railways, incremental capitalization' },
      { id: 'majors_irs',      label: 'Majors + Independent Railways',
        desc: 'Majors with pre-float IR companies — 1846 style' },
    ],
  },
  {
    key: 'capitalization',
    title: 'Capitalization',
    options: [
      { id: 'full',        label: 'Full Cap at Float',
        desc: 'Corporation receives full par × share count when floated' },
      { id: 'incremental', label: 'Incremental',
        desc: 'Corp receives only the presidency price at formation; capital builds as shares sell' },
    ],
  },
  {
    key: 'loans',
    title: 'Loans',
    options: [
      { id: 'no_loans',    label: 'No Loans',
        desc: 'Corporations cannot take out loans' },
      { id: 'loans_1817',  label: 'Yes — 1817-style',
        desc: '$100 per loan, 10% interest per operating round' },
    ],
  },
  {
    key: 'privates',
    title: 'Private Companies',
    options: [
      { id: 'standard',     label: 'Standard Privates',
        desc: '6 private companies with tiered pricing — 1830 style' },
      { id: 'concessions',  label: 'Concessions',
        desc: 'Privates that convert to minor company packages — 1822 style' },
      { id: 'no_privates',  label: 'No Privates',
        desc: 'Start with no private companies' },
    ],
  },
  {
    key: 'trainSet',
    title: 'Train Set',
    options: [
      { id: 'classic_2d',      label: 'Classic 2–D',
        desc: '2/3/4/5/6/D with 6 phases — 1830 baseline' },
      { id: 'etrain_variant',  label: 'E-Train Variant',
        desc: '2/3/4/4E/5/6 — includes express train variant' },
      { id: 'short_run_heavy', label: 'Short-Run Heavy',
        desc: '2/3/4/5/6/7/8 with 7 phases' },
      { id: 'scratch',         label: 'Start from Scratch',
        desc: 'No trains or phases added — configure manually' },
    ],
  },
];

const TILE_COLOR = { yellow: '#e8c840', green: '#44aa44', brown: '#8b4513', grey: '#888888' };

// ── Wizard state ───────────────────────────────────────────────────────────────

let _step      = 0;
let _sel       = {};   // { key → optionId }
let _overlay   = null;

// ── Public API ────────────────────────────────────────────────────────────────

function open() {
  if (_overlay) return;
  _step = 0;
  _sel  = {};
  _overlay = document.createElement('div');
  _overlay.id = 'wizardOverlay';
  Object.assign(_overlay.style, {
    position: 'fixed', inset: '0',
    background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: '10000',
  });
  _overlay.addEventListener('click', (e) => { if (e.target === _overlay) close(); });
  document.addEventListener('keydown', _onKey);
  document.body.appendChild(_overlay);
  _render();
}

function close() {
  if (!_overlay) return;
  document.removeEventListener('keydown', _onKey);
  _overlay.remove();
  _overlay = null;
}

function _onKey(e) { if (e.key === 'Escape') close(); }

// ── Render ────────────────────────────────────────────────────────────────────

function _render() {
  _overlay.innerHTML = '';
  const step = STEPS[_step];
  const sel  = _sel[step.key];
  const isLast = _step === STEPS.length - 1;

  // Modal container
  const modal = document.createElement('div');
  Object.assign(modal.style, {
    background:   'var(--bg-panel, #2a2a2a)',
    border:       '1px solid var(--border-mid, #444)',
    borderRadius: '10px',
    padding:      '28px 32px',
    maxWidth:     '540px',
    width:        '90vw',
    maxHeight:    '90vh',
    overflowY:    'auto',
    boxShadow:    '0 8px 32px rgba(0,0,0,0.6)',
    color:        'var(--text-primary, #e0e0e0)',
    fontFamily:   'inherit',
    position:     'relative',
    boxSizing:    'border-box',
  });

  // ── Header row (step label + title + ×)
  const hdr = document.createElement('div');
  Object.assign(hdr.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' });

  const hdrLeft = document.createElement('div');
  const stepLbl = document.createElement('div');
  Object.assign(stepLbl.style, { fontSize: '11px', color: 'var(--text-secondary, #888)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' });
  stepLbl.textContent = `Step ${_step + 1} of ${STEPS.length}`;

  const titleEl = document.createElement('h2');
  Object.assign(titleEl.style, { margin: '0', fontSize: '17px', fontWeight: '600' });
  titleEl.textContent = step.title;

  hdrLeft.appendChild(stepLbl);
  hdrLeft.appendChild(titleEl);

  const xBtn = document.createElement('button');
  Object.assign(xBtn.style, { background: 'none', border: 'none', color: 'var(--text-secondary, #888)', fontSize: '20px', cursor: 'pointer', lineHeight: '1', padding: '0 4px', marginTop: '-2px' });
  xBtn.textContent = '×';
  xBtn.title = 'Close without applying';
  xBtn.addEventListener('click', close);

  hdr.appendChild(hdrLeft);
  hdr.appendChild(xBtn);
  modal.appendChild(hdr);

  // ── Progress bar
  const prog = document.createElement('div');
  Object.assign(prog.style, { display: 'flex', gap: '5px', marginBottom: '20px' });
  STEPS.forEach((_, i) => {
    const seg = document.createElement('div');
    Object.assign(seg.style, {
      flex: '1', height: '3px', borderRadius: '2px',
      background: i <= _step ? 'var(--accent, #4a7c4a)' : 'var(--border-mid, #444)',
      transition: 'background 0.2s',
    });
    prog.appendChild(seg);
  });
  modal.appendChild(prog);

  // ── Option cards
  const cards = document.createElement('div');
  Object.assign(cards.style, { display: 'flex', flexDirection: 'column', gap: '9px', marginBottom: '22px' });

  step.options.forEach(opt => {
    const chosen = sel === opt.id;
    const card = document.createElement('div');
    Object.assign(card.style, {
      padding:      '13px 15px',
      borderRadius: '7px',
      border:       `1px solid ${chosen ? 'var(--accent, #4a7c4a)' : 'var(--border-mid, #444)'}`,
      background:   chosen ? 'rgba(74,124,74,0.13)' : 'transparent',
      cursor:       'pointer',
      transition:   'border-color 0.15s, background 0.15s',
    });
    card.addEventListener('mouseenter', () => {
      if (sel !== opt.id) card.style.borderColor = 'var(--accent, #4a7c4a)';
    });
    card.addEventListener('mouseleave', () => {
      if (sel !== opt.id) card.style.borderColor = 'var(--border-mid, #444)';
    });
    card.addEventListener('click', () => { _sel[step.key] = opt.id; _render(); });

    const ctitle = document.createElement('div');
    Object.assign(ctitle.style, { fontWeight: '600', fontSize: '13px', marginBottom: '3px' });
    ctitle.textContent = opt.label;

    const cdesc = document.createElement('div');
    Object.assign(cdesc.style, { fontSize: '12px', color: 'var(--text-secondary, #999)', lineHeight: '1.4' });
    cdesc.textContent = opt.desc;

    card.appendChild(ctitle);
    card.appendChild(cdesc);
    cards.appendChild(card);
  });
  modal.appendChild(cards);

  // ── Navigation
  const nav = document.createElement('div');
  Object.assign(nav.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center' });

  const backBtn = document.createElement('button');
  Object.assign(backBtn.style, {
    padding: '8px 20px', borderRadius: '5px', fontSize: '13px', cursor: 'pointer',
    border: '1px solid var(--border-mid, #444)',
    background: 'transparent',
    color: 'var(--text-primary, #e0e0e0)',
    opacity: _step === 0 ? '0.3' : '1',
  });
  backBtn.textContent = '← Back';
  backBtn.disabled = _step === 0;
  backBtn.addEventListener('click', () => { if (_step > 0) { _step--; _render(); } });

  const nextBtn = document.createElement('button');
  const nextActive = !!sel;
  Object.assign(nextBtn.style, {
    padding: '8px 22px', borderRadius: '5px', fontSize: '13px', fontWeight: '600',
    border: 'none', cursor: nextActive ? 'pointer' : 'default',
    background: nextActive ? 'var(--accent, #4a7c4a)' : 'var(--border-mid, #444)',
    color: '#fff',
    opacity: nextActive ? '1' : '0.5',
  });
  nextBtn.textContent = isLast ? 'Apply ✓' : 'Next →';
  nextBtn.disabled = !nextActive;
  nextBtn.addEventListener('click', () => {
    if (!nextActive) return;
    if (isLast) { _apply(); close(); }
    else { _step++; _render(); }
  });

  nav.appendChild(backBtn);
  nav.appendChild(nextBtn);
  modal.appendChild(nav);
  _overlay.appendChild(modal);
}

// ── Apply ─────────────────────────────────────────────────────────────────────

function _apply() {
  const { corpStructure, capitalization, loans, privates, trainSet } = _sel;

  // Trains & phases
  if (trainSet !== 'scratch') {
    state.trains = _buildTrains(trainSet);
    state.phases = _buildPhases(trainSet, state.trains);
  }

  // Corp packs
  state.corpPacks = _buildCorpPacks(corpStructure, capitalization);

  // Mechanics
  if (!state.mechanics) state.mechanics = {};
  state.mechanics.capitalization = capitalization;
  if (loans === 'loans_1817') {
    state.mechanics.loans = { enabled: true, value: 100, interest: 10 };
  } else {
    delete state.mechanics.loans;
  }

  // Privates
  state.privates = _buildPrivates(privates);

  // Re-render affected panels
  if (typeof renderTrainsTable   === 'function') renderTrainsTable();
  if (typeof renderPhasesTable   === 'function') renderPhasesTable();
  if (typeof renderCorpsSection  === 'function') renderCorpsSection();
  if (typeof renderPrivatesCards === 'function') renderPrivatesCards();
  if (typeof autosave            === 'function') autosave();
}

// ── Train builders ────────────────────────────────────────────────────────────

function _mkTrain(id, n, cost, count) {
  return { id, distType: 'n', n, cost, count, rusts: false, phase: '', variants: [] };
}

function _buildTrains(trainSet) {
  let t;
  if (trainSet === 'classic_2d') {
    t = [
      _mkTrain('t_2', 2,    80,  7),
      _mkTrain('t_3', 3,   180,  6),
      _mkTrain('t_4', 4,   300,  5),
      _mkTrain('t_5', 5,   450,  3),
      _mkTrain('t_6', 6,   630,  2),
      { id: 't_D', distType: 'u', cost: 1100, count: 20, rusts: false, phase: '', variants: [] },
    ];
    t[0].rusts = true; t[0].rustsOn = 't_4';
    t[1].rusts = true; t[1].rustsOn = 't_5';
    t[2].rusts = true; t[2].rustsOn = 't_6';
  } else if (trainSet === 'etrain_variant') {
    t = [
      _mkTrain('t_2',  2,  80,  7),
      _mkTrain('t_3',  3, 180,  6),
      _mkTrain('t_4',  4, 300,  5),
      Object.assign(_mkTrain('t_4E', 4, 400, 4), { label: '4E' }),
      _mkTrain('t_5',  5, 450,  3),
      _mkTrain('t_6',  6, 630,  2),
    ];
    t[0].rusts = true; t[0].rustsOn = 't_4';
    t[1].rusts = true; t[1].rustsOn = 't_4E';
    t[2].rusts = true; t[2].rustsOn = 't_5';
  } else { // short_run_heavy
    t = [
      _mkTrain('t_2', 2,   80,  6),
      _mkTrain('t_3', 3,  160,  5),
      _mkTrain('t_4', 4,  280,  4),
      _mkTrain('t_5', 5,  430,  3),
      _mkTrain('t_6', 6,  630,  2),
      _mkTrain('t_7', 7,  850,  2),
      _mkTrain('t_8', 8, 1100,  2),
    ];
    t[0].rusts = true; t[0].rustsOn = 't_4';
    t[1].rusts = true; t[1].rustsOn = 't_5';
    t[2].rusts = true; t[2].rustsOn = 't_6';
    t[3].rusts = true; t[3].rustsOn = 't_7';
    t[4].rusts = true; t[4].rustsOn = 't_8';
  }
  return t;
}

function _ph(name, onId, ors, limit, tiles) {
  return { name, onTrain: onId || '', ors, limit, tiles, color: TILE_COLOR[tiles] || '#888' };
}

function _buildPhases(trainSet, trains) {
  if (trainSet === 'classic_2d') {
    return [
      _ph('1', '',    1, 4, 'yellow'),
      _ph('2', 't_3', 2, 4, 'green'),
      _ph('3', 't_4', 2, 3, 'green'),
      _ph('4', 't_5', 3, 3, 'brown'),
      _ph('5', 't_6', 3, 2, 'brown'),
      _ph('6', 't_D', 3, 2, 'grey'),
    ];
  }
  if (trainSet === 'etrain_variant') {
    return [
      _ph('1',  '',     1, 4, 'yellow'),
      _ph('2',  't_3',  2, 4, 'green'),
      _ph('3',  't_4',  2, 3, 'green'),
      _ph('3E', 't_4E', 2, 3, 'green'),
      _ph('4',  't_5',  3, 3, 'brown'),
      _ph('5',  't_6',  3, 2, 'grey'),
    ];
  }
  // short_run_heavy
  return [
    _ph('1', '',    1, 4, 'yellow'),
    _ph('2', 't_3', 2, 4, 'yellow'),
    _ph('3', 't_4', 2, 4, 'green'),
    _ph('4', 't_5', 2, 3, 'green'),
    _ph('5', 't_6', 3, 3, 'brown'),
    _ph('6', 't_7', 3, 2, 'brown'),
    _ph('7', 't_8', 3, 2, 'grey'),
  ];
}

// ── Corp pack builder ─────────────────────────────────────────────────────────

function _buildCorpPacks(corpStructure, capitalization) {
  const majorPack = {
    id: 'pk_majors', label: 'Major Corporations', type: 'major', companies: [],
    floatPct: 60, maxOwnershipPct: 60,
    capitalization: capitalization || 'full',
    alwaysMarketPrice: false,
    shares: [20, 10, 10, 10, 10, 10, 10, 10, 10],
    tokens: [0, 40, 100],
  };
  const packs = [majorPack];

  if (corpStructure === 'majors_minors') {
    packs.push({
      id: 'pk_minors', label: 'Minor Railways', type: 'minor', companies: [],
      floatPct: 100, maxOwnershipPct: 100,
      capitalization: 'incremental',
      alwaysMarketPrice: true,
      shares: [100], tokens: [0],
    });
  } else if (corpStructure === 'majors_irs') {
    packs.push({
      id: 'pk_irs', label: 'Independent Railways', type: 'minor', companies: [],
      floatPct: 100, maxOwnershipPct: 100,
      capitalization: 'incremental',
      alwaysMarketPrice: true,
      shares: [100], tokens: [0],
    });
  }

  return packs;
}

// ── Private company builder ───────────────────────────────────────────────────

const _PRIV_TIERS = [
  { sym: 'P1', cost: 20,  revenue: 5  },
  { sym: 'P2', cost: 45,  revenue: 10 },
  { sym: 'P3', cost: 70,  revenue: 15 },
  { sym: 'P4', cost: 110, revenue: 20 },
  { sym: 'P5', cost: 160, revenue: 25 },
  { sym: 'P6', cost: 220, revenue: 30 },
];

function _buildPrivates(choice) {
  if (choice === 'no_privates') return [];
  const isConc = choice === 'concessions';
  return _PRIV_TIERS.map((t, i) => ({
    sym:      t.sym,
    name:     isConc ? `Concession ${i + 1}` : `Private Company ${i + 1}`,
    cost:     t.cost,
    revenue:  t.revenue,
    ability:  '',
    abilities: [],
  }));
}

// ── Expose + wire button ──────────────────────────────────────────────────────

window.gameWizard = { open, close };

const _wizBtn = document.getElementById('wizardBtn');
if (_wizBtn) _wizBtn.addEventListener('click', open);

})();
