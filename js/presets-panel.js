(function () {
  'use strict';

  // ── Utilities ──────────────────────────────────────────────────────────────
  function uid() { return '_' + Math.random().toString(36).slice(2, 9); }

  // ── Step definitions ──────────────────────────────────────────────────────
  // Each step: id, q (question text), opts (array of {label, val, sub?})
  // Optional showIf(answers) — if false the step is skipped entirely.
  var STEPS = [
    {
      id: 'majors',
      q: 'Will your game have major corporations?',
      opts: [
        { label: 'Yes', val: true },
        { label: 'No',  val: false }
      ]
    },
    {
      id: 'privates',
      q: 'Will your game have private companies?',
      opts: [
        { label: 'Yes — standard privates',  val: 'standard',   sub: 'Buy, sell, and blocking powers' },
        { label: 'Yes — as concessions',     val: 'concession', sub: 'Convert to minor starting packages' },
        { label: 'No',                            val: 'none' }
      ]
    },
    {
      id: 'minors',
      q: 'Will your game have minor companies?',
      opts: [
        { label: 'Yes', val: true },
        { label: 'No',  val: false }
      ]
    },
    {
      id: 'minorTiming',
      q: 'When do minors become available?',
      showIf: function (ans) { return ans.minors === true; },
      opts: [
        { label: 'From the start',            val: 'fixed',            sub: 'Minors are available in the initial auction' },
        { label: 'Starting in a later phase', val: 'phase_conditional', sub: 'Minors unlock when a specific phase begins' }
      ]
    },
    {
      id: 'mergers',
      q: 'Will corporations be able to merge?',
      opts: [
        { label: 'Yes', val: true },
        { label: 'No',  val: false }
      ]
    },
    {
      id: 'loans',
      q: 'Will there be loans?',
      opts: [
        { label: 'Yes', val: true },
        { label: 'No',  val: false }
      ]
    },
    {
      id: 'trains',
      q: 'What train set?',
      opts: [
        { label: 'Classic (2/3/4/5/6/D)',                    val: 'classic', sub: 'Rusty 2s and 3s, permanent 4+, diesel endgame' },
        { label: 'Shorter runs (2/3/4/5/6)',                  val: 'short',   sub: 'No diesel train' },
        { label: 'Longer runs (3/4/5/6/7/8)',                 val: 'long',    sub: 'Higher values, unlimited 8s' },
        { label: 'Skip — I’ll configure trains manually', val: 'skip' }
      ]
    }
  ];

  // Returns ordered list of steps visible given current answers.
  function visibleSteps(ans) {
    return STEPS.filter(function (s) { return !s.showIf || s.showIf(ans); });
  }

  // ── Next-step routing ──────────────────────────────────────────────────────
  function nextStepId(currentId, ans) {
    switch (currentId) {
      case 'majors':      return 'privates';
      case 'privates':    return 'minors';
      case 'minors':      return ans.minors ? 'minorTiming' : 'mergers';
      case 'minorTiming': return 'mergers';
      case 'mergers':     return 'loans';
      case 'loans':       return 'trains';
      case 'trains':      return 'summary';
      default:            return 'summary';
    }
  }

  // ── Train set data ─────────────────────────────────────────────────────────
  function mkN(id, n, cost, count, rusts, rustsOn, phase) {
    return { id: id, distType: 'n', n: n, cost: cost,
             count: count < 0 ? null : count,
             rusts: !!rusts, rustsOn: rustsOn || null,
             phase: phase || '', variants: [] };
  }
  function mkD(id, cost, phase) {
    return { id: id, distType: 'u', n: 0, cost: cost, count: null,
             rusts: false, rustsOn: null, phase: phase || 'D', variants: [] };
  }
  function mkPh(name, onTrain, ors, limit, tiles) {
    var colors = { yellow: 'yellow', green: 'green', brown: 'brown', gray: 'gray' };
    return { name: name, onTrain: onTrain, ors: ors, limit: limit,
             tiles: tiles, color: colors[tiles] || '' };
  }

  var TRAIN_SETS = {
    classic: {
      trains: [
        mkN('t_2', 2,   80, 6, true,  't_4', '2'),
        mkN('t_3', 3,  180, 5, true,  't_6', '3'),
        mkN('t_4', 4,  300, 4, false, null,  '4'),
        mkN('t_5', 5,  450, 3, false, null,  '5'),
        mkN('t_6', 6,  630, 2, false, null,  '6'),
        mkD('t_D',    1100,          'D')
      ],
      phases: [
        mkPh('2', 't_2', 2, 4, 'yellow'),
        mkPh('3', 't_3', 2, 4, 'yellow'),
        mkPh('4', 't_4', 2, 3, 'green'),
        mkPh('5', 't_5', 3, 2, 'brown'),
        mkPh('6', 't_6', 3, 2, 'brown'),
        mkPh('D', 't_D', 3, 2, 'gray')
      ]
    },
    short: {
      trains: [
        mkN('t_2', 2,  80, 6, true,  't_4', '2'),
        mkN('t_3', 3, 180, 5, true,  't_6', '3'),
        mkN('t_4', 4, 300, 4, false, null,  '4'),
        mkN('t_5', 5, 450, 3, false, null,  '5'),
        mkN('t_6', 6, 630, 2, false, null,  '6')
      ],
      phases: [
        mkPh('2', 't_2', 2, 4, 'yellow'),
        mkPh('3', 't_3', 2, 4, 'yellow'),
        mkPh('4', 't_4', 2, 3, 'green'),
        mkPh('5', 't_5', 3, 2, 'brown'),
        mkPh('6', 't_6', 3, 2, 'brown')
      ]
    },
    long: {
      trains: [
        mkN('t_3', 3,  160, 4, true,  't_6', '3'),
        mkN('t_4', 4,  240, 3, true,  't_7', '4'),
        mkN('t_5', 5,  350, 2, false, null,  '5'),
        mkN('t_6', 6,  500, 2, false, null,  '6'),
        mkN('t_7', 7,  650, 2, false, null,  '7'),
        mkN('t_8', 8,  800,-1, false, null,  '8')
      ],
      phases: [
        mkPh('3', 't_3', 1, 4, 'yellow'),
        mkPh('4', 't_4', 2, 4, 'yellow'),
        mkPh('5', 't_5', 2, 3, 'green'),
        mkPh('6', 't_6', 2, 2, 'brown'),
        mkPh('7', 't_7', 2, 2, 'brown'),
        mkPh('8', 't_8', 3, 2, 'gray')
      ]
    }
  };

  // ── Private-company factory ────────────────────────────────────────────────
  function makePrivates(type) {
    var data = [
      { name: 'Private 1', cost:  20, revenue:  5 },
      { name: 'Private 2', cost:  40, revenue: 10 },
      { name: 'Private 3', cost:  80, revenue: 15 },
      { name: 'Private 4', cost: 120, revenue: 20 },
      { name: 'Private 5', cost: 160, revenue: 25 },
      { name: 'Private 6', cost: 220, revenue: 30 }
    ];
    return data.map(function (d) {
      var p = { name: d.name, buyerType: 'any', cost: d.cost,
                revenue: d.revenue, ability: '', closesOn: null, abilities: [] };
      if (type === 'concession') p.companyType = 'concession';
      return p;
    });
  }

  // ── Summary sentence ───────────────────────────────────────────────────────
  function buildSummaryText(ans) {
    var parts = [];
    if (ans.majors) parts.push('major corporations');
    if (ans.privates === 'standard')   parts.push('standard private companies');
    if (ans.privates === 'concession') parts.push('concession privates');
    if (ans.minors) {
      parts.push(ans.minorTiming === 'fixed'
        ? 'minors available from the start'
        : 'phase-conditional minors');
    }
    if (ans.mergers) parts.push('corporation mergers');
    if (ans.loans)   parts.push('loans');
    var trainLabel = {
      classic: 'classic 2–6 trains plus diesel',
      short:   '2–6 trains (no diesel)',
      long:    '3–8 trains'
    };
    if (ans.trains && ans.trains !== 'skip') parts.push(trainLabel[ans.trains]);

    if (!parts.length) return 'No sections will be configured.';
    if (parts.length === 1) return 'Your game will have ' + parts[0] + '.';
    var last = parts.pop();
    return 'Your game will have ' + parts.join(', ') + ', and ' + last + '.';
  }

  // ── Apply answers to state ─────────────────────────────────────────────────
  function applyAnswers(ans) {
    if (ans.majors) {
      if (!state.companies) state.companies = [];
    }

    if (ans.minors) {
      if (!state.minors) state.minors = [];
      // Store minor availability timing in mechanics for reference
      state.mechanics.minorTiming = ans.minorTiming || 'fixed';
    } else {
      delete state.mechanics.minorTiming;
    }

    if (ans.privates !== 'none') {
      state.privates = makePrivates(ans.privates);
    }

    // Mechanics — preserve functionMap, only touch wizard-owned keys
    if (ans.mergers) state.mechanics.mergers = true;
    else delete state.mechanics.mergers;

    if (ans.loans) {
      state.mechanics.loans = true;
      state.mechanics.loanInterest = 10;
    } else {
      delete state.mechanics.loans;
      delete state.mechanics.loanInterest;
    }

    if (ans.trains && ans.trains !== 'skip') {
      var ts = TRAIN_SETS[ans.trains];
      state.trains = ts.trains.map(function (t) { return Object.assign({}, t); });
      state.phases = ts.phases.map(function (p) { return Object.assign({}, p); });
    }

    if (typeof renderCompaniesTable === 'function') renderCompaniesTable();
    if (typeof renderMinorsTable    === 'function') renderMinorsTable();
    if (typeof renderPrivatesCards  === 'function') renderPrivatesCards();
    if (typeof renderTrainsTable    === 'function') renderTrainsTable();
    if (typeof renderPhasesTable    === 'function') renderPhasesTable();
    if (typeof autosave             === 'function') autosave();
  }

  // ── UI state ───────────────────────────────────────────────────────────────
  var overlay     = null;
  var answers     = {};
  var stepHistory = []; // ordered visit history; last element = current step id

  function currentStepId() {
    return stepHistory[stepHistory.length - 1] || null;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function open() {
    answers     = {};
    stepHistory = ['majors'];
    if (!overlay) buildOverlay();
    overlay.style.display = 'flex';
    renderStep();
  }

  function close() {
    if (overlay) overlay.style.display = 'none';
  }

  // ── Overlay scaffold (built once) ──────────────────────────────────────────
  function buildOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'configWizardOverlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0',
      'background:rgba(0,0,0,0.55)',
      'z-index:9000',
      'display:flex',
      'align-items:center',
      'justify-content:center'
    ].join(';');
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    var modal = document.createElement('div');
    modal.id = 'configWizardModal';
    modal.style.cssText = [
      'background:var(--bg-panel)',
      'border:1px solid var(--border-mid)',
      'border-radius:8px',
      'width:560px',
      'max-width:95vw',
      'padding:32px 36px',
      'box-sizing:border-box',
      'display:flex',
      'flex-direction:column'
    ].join(';');

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay && overlay.style.display !== 'none') close();
    });
  }

  // ── Step renderer ──────────────────────────────────────────────────────────
  function renderStep() {
    var modal = document.getElementById('configWizardModal');
    if (!modal) return;
    modal.innerHTML = '';

    var stepId    = currentStepId();
    var isSummary = stepId === 'summary';
    var vis       = visibleSteps(answers);
    var totalQ    = vis.length;
    var posIdx    = vis.findIndex(function (s) { return s.id === stepId; });
    var currentPos = isSummary ? totalQ : posIdx + 1;

    // Header
    var hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;';

    var progress = document.createElement('span');
    progress.style.cssText = 'font-size:13px;color:var(--text-secondary);';
    progress.textContent = isSummary
      ? 'Summary'
      : 'Question ' + currentPos + ' of ' + totalQ;

    var xBtn = document.createElement('button');
    xBtn.innerHTML = '&times;';
    xBtn.style.cssText = [
      'background:none', 'border:none', 'cursor:pointer',
      'color:var(--text-secondary)', 'font-size:22px',
      'line-height:1', 'padding:0'
    ].join(';');
    xBtn.addEventListener('click', close);

    hdr.appendChild(progress);
    hdr.appendChild(xBtn);
    modal.appendChild(hdr);

    if (isSummary) {
      renderSummaryContent(modal, answers);
    } else {
      var step = STEPS.find(function (s) { return s.id === stepId; });
      if (!step) { close(); return; }
      renderQuestionContent(modal, step);
    }

    // Back button
    if (stepHistory.length > 1) {
      var nav = document.createElement('div');
      nav.style.marginTop = '24px';

      var backBtn = document.createElement('button');
      backBtn.textContent = '← Back';
      backBtn.style.cssText = [
        'background:none',
        'border:1px solid var(--border-mid)',
        'border-radius:4px',
        'padding:7px 16px',
        'cursor:pointer',
        'color:var(--text-primary)',
        'font-size:14px'
      ].join(';');
      backBtn.addEventListener('click', function () {
        stepHistory.pop();
        renderStep();
      });

      nav.appendChild(backBtn);
      modal.appendChild(nav);
    }
  }

  // ── Question screen ────────────────────────────────────────────────────────
  function renderQuestionContent(modal, step) {
    var q = document.createElement('div');
    q.style.cssText = [
      'font-size:21px', 'font-weight:600',
      'color:var(--text-primary)',
      'margin-bottom:24px', 'line-height:1.35'
    ].join(';');
    q.textContent = step.q;
    modal.appendChild(q);

    var opts = document.createElement('div');
    opts.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

    step.opts.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.style.cssText = [
        'background:var(--bg-input,var(--bg-panel))',
        'border:2px solid var(--border-mid)',
        'border-radius:6px',
        'padding:14px 18px',
        'cursor:pointer',
        'text-align:left',
        'color:var(--text-primary)',
        'font-size:16px',
        'transition:border-color 0.12s'
      ].join(';');

      var labelEl = document.createElement('div');
      labelEl.style.fontWeight = '500';
      labelEl.textContent = opt.label;
      btn.appendChild(labelEl);

      if (opt.sub) {
        var subEl = document.createElement('div');
        subEl.style.cssText = 'font-size:13px;color:var(--text-secondary);margin-top:3px;font-weight:400;';
        subEl.textContent = opt.sub;
        btn.appendChild(subEl);
      }

      btn.addEventListener('mouseenter', function () { btn.style.borderColor = 'var(--accent)'; });
      btn.addEventListener('mouseleave', function () { btn.style.borderColor = 'var(--border-mid)'; });
      btn.addEventListener('click', function () {
        answers[step.id] = opt.val;
        stepHistory.push(nextStepId(step.id, answers));
        renderStep();
      });

      opts.appendChild(btn);
    });

    modal.appendChild(opts);
  }

  // ── Summary screen ─────────────────────────────────────────────────────────
  function renderSummaryContent(modal, ans) {
    var title = document.createElement('div');
    title.style.cssText = 'font-size:19px;font-weight:600;color:var(--text-primary);margin-bottom:14px;';
    title.textContent = 'Ready to apply';
    modal.appendChild(title);

    var summary = document.createElement('div');
    summary.style.cssText = 'font-size:15px;line-height:1.75;color:var(--text-primary);margin-bottom:12px;';
    summary.textContent = buildSummaryText(ans);
    modal.appendChild(summary);

    var note = document.createElement('div');
    note.style.cssText = 'font-size:12px;color:var(--text-secondary);margin-bottom:28px;';
    note.textContent = 'This will not touch your map or tile placements.';
    modal.appendChild(note);

    var applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.style.cssText = [
      'background:var(--accent)',
      'color:#fff',
      'border:none',
      'border-radius:4px',
      'padding:10px 28px',
      'cursor:pointer',
      'font-size:15px',
      'font-weight:600'
    ].join(';');
    applyBtn.addEventListener('click', function () {
      applyAnswers(ans);
      close();
    });
    modal.appendChild(applyBtn);
  }

  // ── Wire up ────────────────────────────────────────────────────────────────
  window.presetsPanel = { open: open, close: close };

  var triggerBtn = document.getElementById('loadPresetBtn');
  if (triggerBtn) {
    var fm = document.getElementById('fileMenu');
    triggerBtn.addEventListener('click', function () {
      if (fm) fm.style.display = 'none';
      open();
    });
  }
})();
