// ─── STATIC HEX BUILDER ───────────────────────────────────────────────────────
// Multi-step wizard for building static hexes (offboard areas, borders, etc.)
// Load order: SEVENTH — after context-menu.js.
// Exposed: window.openStaticHexWizard(hexId)
//          window.staticHexCode(hex)  — export code string for map.rb

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────

  var TOTAL_STEPS = 5;

  // Hex background colors — keys match map.rb HEXES hash keys
  var BG_COLORS = {
    white:  '#D4B483',
    yellow: '#F0D070',
    gray:   '#BCBDC0',
    red:    '#E05050',
  };

  var PHASE_COLORS = {
    yellow: '#F0D070',
    green:  '#71BF44',
    brown:  '#CB7745',
    gray:   '#BCBDC0',
  };

  // Flat-top hex, circumradius 50, centered at 0,0 — matches EDGE_MIDPOINTS in constants.js
  var EDGE_MPS = [
    { x:  37.5,  y:  21.65 }, // 0 lower-right
    { x:   0,    y:  43.3  }, // 1 bottom
    { x: -37.5,  y:  21.65 }, // 2 lower-left
    { x: -37.5,  y: -21.65 }, // 3 upper-left
    { x:   0,    y: -43.3  }, // 4 top
    { x:  37.5,  y: -21.65 }, // 5 upper-right
  ];

  var HEX_CORNERS = [
    { x:  50,   y:   0    },
    { x:  25,   y:  43.3  },
    { x: -25,   y:  43.3  },
    { x: -50,   y:   0    },
    { x: -25,   y: -43.3  },
    { x:  25,   y: -43.3  },
  ];

  var PHASES = ['yellow', 'green', 'brown', 'gray'];

  // ── Wizard state ───────────────────────────────────────────────────────────

  var wizardHexId = null;
  var currentStep = 1;
  var wizardData  = null;

  function freshData() {
    return {
      bg:            'white',
      feature:       'none',
      slots:         1,
      exits:         [],
      exitPairs:     [],    // [[nodeA exits], [nodeB exits]] for dualTown
      rotation:      0,
      terminal:      false,
      taperStyle:    1,
      pathMode:      'star',
      pathPairs:     [],    // [[edgeA, edgeB], ...] for gray city directed routing
      townRevenue:   10,    // flat revenue for single town
      townRevenues:  [10, 10], // per-node revenue for dual town
      ooFlatRevenues: [20, 20], // flat per-node revenue for OO (always static integer)
      ooRevenues:    null,  // legacy phase-based OO revenues (unused in wizard now)
      phaseRevenue:  { yellow: 20, green: 30, brown: 40, gray: 60 },
      activePhases:  { yellow: true, green: true, brown: true, gray: true },
      name:          '',
      label:         '',
    };
  }

  // ── Open / close ───────────────────────────────────────────────────────────

  function openWizard(hexId) {
    wizardHexId = hexId;
    currentStep = 1;

    var existing = state.hexes[hexId];
    if (existing && existing.static) {
      wizardData = JSON.parse(JSON.stringify(existing));
      // Ensure all required fields exist
      if (!wizardData.phaseRevenue) wizardData.phaseRevenue = { yellow: 20, green: 30, brown: 40, gray: 60 };
      if (!wizardData.activePhases) wizardData.activePhases = { yellow: true, green: true, brown: true, gray: true };
      if (!wizardData.exits)        wizardData.exits = [];
      if (wizardData.slots === undefined) wizardData.slots = 1;
      if (wizardData.terminal === undefined) wizardData.terminal = (wizardData.bg === 'red');
      if (!wizardData.name)  wizardData.name  = '';
      if (!wizardData.label) wizardData.label = '';
      if (wizardData.taperStyle === undefined)  wizardData.taperStyle  = 1;
      if (!wizardData.pathMode)  wizardData.pathMode  = 'star';
      if (!wizardData.pathPairs) wizardData.pathPairs = [];
      if (!wizardData.exitPairs) wizardData.exitPairs = [];
      if (wizardData.townRevenue === undefined)   wizardData.townRevenue  = 10;
      if (!wizardData.townRevenues) wizardData.townRevenues = [10, 10];
      if (!wizardData.ooFlatRevenues) wizardData.ooFlatRevenues = [20, 20];
    } else {
      wizardData = freshData();
    }

    document.getElementById('staticHexWizard').style.display = 'flex';
    renderStep();
  }

  function closeWizard() {
    document.getElementById('staticHexWizard').style.display = 'none';
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  function saveWizard() {
    ensureHex(wizardHexId);
    var h = wizardData;
    state.hexes[wizardHexId] = {
      static:       true,
      bg:           h.bg,
      feature:      h.feature,
      slots:        h.feature === 'city' ? (h.slots || 1) : undefined,
      exits:        h.exits.slice(),
      rotation:     h.rotation,
      terminal:     h.terminal,
      taperStyle:    h.taperStyle || 1,
      pathMode:      h.pathMode || 'star',
      pathPairs:     (h.pathPairs || []).map(function (p) { return p.slice(); }),
      exitPairs:     (h.exitPairs || []).map(function (p) { return p.slice(); }),
      townRevenue:   h.townRevenue !== undefined ? h.townRevenue : 10,
      townRevenues:  h.townRevenues ? h.townRevenues.slice() : [10, 10],
      ooFlatRevenues: h.ooFlatRevenues ? h.ooFlatRevenues.slice() : [20, 20],
      phaseRevenue: Object.assign({}, h.phaseRevenue),
      activePhases: Object.assign({}, h.activePhases),
      name:         h.name,
      label:        h.label,
    };
    render();
    autosave();
    closeWizard();
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  function nextStep() {
    if (currentStep < TOTAL_STEPS) {
      currentStep++;
      renderStep();
    } else {
      saveWizard();
    }
  }

  function prevStep() {
    if (currentStep > 1) {
      currentStep--;
      renderStep();
    }
  }

  // ── Step dispatcher ────────────────────────────────────────────────────────

  function renderStep() {
    updateProgress();
    var body = document.getElementById('shwBody');
    body.innerHTML = '';

    switch (currentStep) {
      case 1: renderStep1(body); break;
      case 2: renderStep2(body); break;
      case 3: renderStep3(body); break;
      case 4: renderStep4(body); break;
      case 5: renderStep5(body); break;
    }

    document.getElementById('shwBtnBack').disabled =
      (currentStep === 1);
    document.getElementById('shwBtnNext').textContent =
      (currentStep === TOTAL_STEPS) ? 'Finish \u2713' : 'Next \u2192';
  }

  function updateProgress() {
    document.querySelectorAll('.shw-step-dot').forEach(function (dot, i) {
      dot.classList.toggle('active', i + 1 === currentStep);
      dot.classList.toggle('done',   i + 1 <  currentStep);
    });
    document.getElementById('shwStepLabel').textContent =
      'Step ' + currentStep + ' of ' + TOTAL_STEPS;
  }

  // ── Step 1 — Background ────────────────────────────────────────────────────

  function renderStep1(body) {
    var swatches = [
      { key: 'white',  color: '#D4B483', label: 'Land'             },
      { key: 'gray',   color: '#BCBDC0', label: 'Grey / Border'    },
      { key: 'red',    color: '#E05050', label: 'Red / Offboard'   },
      { key: 'yellow', color: '#F0D070', label: 'Yellow (pre-set)' },
    ];

    var html = '<h3 class="shw-title">Choose hex background</h3><div class="shw-bg-grid">';
    swatches.forEach(function (s) {
      html += '<div class="shw-swatch' + (wizardData.bg === s.key ? ' selected' : '') +
              '" data-bg="' + s.key + '" style="background:' + s.color + ';">' +
              '<span>' + s.label + '</span></div>';
    });
    html += '</div>';

    var div = document.createElement('div');
    div.innerHTML = html;
    body.appendChild(div);

    body.querySelectorAll('.shw-swatch').forEach(function (el) {
      el.onclick = function () {
        var newBg = el.dataset.bg;
        var wasRed = wizardData.bg === 'red';
        var becomesRed = newBg === 'red';
        if (newBg !== wizardData.bg) {
          // Switching to/from red invalidates town/city selections
          if (wasRed || becomesRed) {
            wizardData.feature = null;
            wizardData.slots   = null;
          }
          wizardData.pathMode  = 'star';
          wizardData.pathPairs = [];
        }
        wizardData.bg = newBg;
        // Auto-set terminal default for red bg
        if (wizardData.bg === 'red') wizardData.terminal = true;
        body.querySelectorAll('.shw-swatch').forEach(function (s) { s.classList.remove('selected'); });
        el.classList.add('selected');
      };
    });
  }

  // ── Step 2 — Feature ───────────────────────────────────────────────────────

  // Thumbnail SVG content for 60×60 viewBox
  function thumbSVG(feature, slots) {
    switch (feature) {
      case 'none':
        return '<text x="30" y="34" text-anchor="middle" fill="#666" font-size="9" font-family="Arial">no feature</text>';
      case 'town':
        return '<rect x="13" y="24" width="34" height="14" rx="2" fill="#000"/>';
      case 'dualTown':
        return '<rect x="5" y="24" width="22" height="14" rx="2" fill="#000"/>' +
               '<rect x="33" y="24" width="22" height="14" rx="2" fill="#000"/>';
      case 'oo':
        // RULE 3: two separate circles, no rect
        return '<circle cx="18" cy="27" r="10" fill="white" stroke="#333" stroke-width="1.5"/>' +
               '<circle cx="42" cy="27" r="10" fill="white" stroke="#333" stroke-width="1.5"/>' +
               '<text x="30" y="47" text-anchor="middle" fill="#555" font-size="7" font-family="Arial">OO</text>';
      case 'city':
        if (slots === 4) {
          return '<rect x="8" y="16" width="44" height="28" rx="3" fill="white" stroke="#333" stroke-width="1.5"/>' +
                 '<circle cx="18" cy="23" r="6" fill="white" stroke="#333" stroke-width="1.5"/>' +
                 '<circle cx="42" cy="23" r="6" fill="white" stroke="#333" stroke-width="1.5"/>' +
                 '<circle cx="18" cy="37" r="6" fill="white" stroke="#333" stroke-width="1.5"/>' +
                 '<circle cx="42" cy="37" r="6" fill="white" stroke="#333" stroke-width="1.5"/>';
        } else if (slots === 3) {
          return '<circle cx="18" cy="22" r="9" fill="white" stroke="#333" stroke-width="1.5"/>' +
                 '<circle cx="42" cy="22" r="9" fill="white" stroke="#333" stroke-width="1.5"/>' +
                 '<circle cx="30" cy="42" r="9" fill="white" stroke="#333" stroke-width="1.5"/>';
        } else if (slots === 2) {
          // 2-slot single node: rect with two inner circles
          return '<rect x="8" y="20" width="44" height="22" rx="3" fill="white" stroke="#333" stroke-width="1.5"/>' +
                 '<circle cx="20" cy="31" r="8" fill="white" stroke="#333" stroke-width="1.5"/>' +
                 '<circle cx="40" cy="31" r="8" fill="white" stroke="#333" stroke-width="1.5"/>';
        }
        return '<circle cx="30" cy="30" r="14" fill="white" stroke="#333" stroke-width="2"/>';
      case 'offboard':
        return '<polygon points="30,14 46,42 14,42" fill="#E05050" stroke="#a03030" stroke-width="1.5"/>';
      default:
        return '';
    }
  }

  function renderStep2(body) {
    // Feature options: feature key + slots
    var allOptions = [
      { feature: 'none',     slots: 1, label: 'None'             },
      { feature: 'town',     slots: 1, label: 'Town'             },
      { feature: 'dualTown', slots: 1, label: 'Dual Town'        },
      { feature: 'city',     slots: 1, label: 'City (1 slot)'    },
      { feature: 'oo',       slots: 1, label: 'OO city (two nodes)'},
      { feature: 'city',     slots: 2, label: 'City (2 slot)'    },
      { feature: 'city',     slots: 3, label: 'City (3 slot)'    },
      { feature: 'city',     slots: 4, label: 'City (Vancouver, 4 slot)'},
      { feature: 'offboard', slots: 1, label: 'Offboard'         },
    ];
    var options = wizardData.bg === 'red'
      ? allOptions.filter(function (o) { return o.feature === 'offboard' || o.feature === 'none'; })
      : allOptions;

    function isSelected(opt) {
      return wizardData.feature === opt.feature &&
             (opt.feature !== 'city' || wizardData.slots === opt.slots);
    }

    var html = '<h3 class="shw-title">What\'s on this hex?</h3><div class="shw-feature-grid">';
    options.forEach(function (opt) {
      html += '<div class="shw-feature-item' + (isSelected(opt) ? ' selected' : '') +
              '" data-feature="' + opt.feature + '" data-slots="' + opt.slots + '">' +
              '<svg viewBox="0 0 60 60" width="52" height="52">' + thumbSVG(opt.feature, opt.slots) + '</svg>' +
              '<span>' + opt.label + '</span></div>';
    });
    html += '</div><p class="shw-note">Full preview available after exits and orientation are set.</p>';

    var div = document.createElement('div');
    div.innerHTML = html;
    body.appendChild(div);

    body.querySelectorAll('.shw-feature-item').forEach(function (el) {
      el.onclick = function () {
        wizardData.feature   = el.dataset.feature;
        wizardData.slots     = parseInt(el.dataset.slots, 10) || 1;
        wizardData.pathMode  = 'star';
        wizardData.pathPairs = [];
        wizardData.exitPairs = [];
        body.querySelectorAll('.shw-feature-item').forEach(function (s) { s.classList.remove('selected'); });
        el.classList.add('selected');
      };
    });
  }

  // ── SVG helpers ────────────────────────────────────────────────────────────

  function hexPathStr() {
    return HEX_CORNERS.map(function (c, i) {
      return (i === 0 ? 'M' : 'L') + ' ' + c.x + ' ' + c.y;
    }).join(' ') + ' Z';
  }

  // Full-size feature SVG (centered at 0,0, SVG space radius-50)
  function featureSVGFull(feature, slots, exitPairs) {
    switch (feature) {
      case 'town':
        return '<rect x="-16" y="-8" width="32" height="16" rx="2" fill="#000"/>';
      case 'dualTown':
        return '<rect x="-30" y="-7" width="24" height="14" rx="2" fill="#000"/>' +
               '<rect x="6"   y="-7" width="24" height="14" rx="2" fill="#000"/>';
      case 'oo': {
        // Compute node positions from exitPairs; fall back to (±14, 0) if not set
        var ooHasEP = exitPairs && ((exitPairs[0] || []).length + (exitPairs[1] || []).length) > 0;
        var ooPos = [0, 1].map(function (ni) {
          if (!ooHasEP) return ni === 0 ? { x: -14, y: 0 } : { x: 14, y: 0 };
          var grp = exitPairs[ni] || [];
          if (!grp.length) return ni === 0 ? { x: -14, y: 0 } : { x: 14, y: 0 };
          var sx = 0, sy = 0;
          grp.forEach(function (e) { sx += EDGE_MPS[e % 6].x; sy += EDGE_MPS[e % 6].y; });
          return { x: sx / grp.length * 0.55, y: sy / grp.length * 0.55 };
        });
        return '<circle cx="' + ooPos[0].x.toFixed(1) + '" cy="' + ooPos[0].y.toFixed(1) + '" r="10" fill="white" stroke="#333" stroke-width="2"/>' +
               '<circle cx="' + ooPos[1].x.toFixed(1) + '" cy="' + ooPos[1].y.toFixed(1) + '" r="10" fill="white" stroke="#333" stroke-width="2"/>' +
               '<text x="0" y="24" text-anchor="middle" fill="#555" font-size="9" font-family="Arial">OO</text>';
      }
      case 'city':
        if ((slots || 1) === 4) {
          return '<rect x="-29" y="-16" width="58" height="32" rx="3" fill="white" stroke="#333" stroke-width="2"/>' +
                 '<circle cx="-14" cy="-7" r="9" fill="white" stroke="#333" stroke-width="1.5"/>' +
                 '<circle cx="14"  cy="-7" r="9" fill="white" stroke="#333" stroke-width="1.5"/>' +
                 '<circle cx="-14" cy="7"  r="9" fill="white" stroke="#333" stroke-width="1.5"/>' +
                 '<circle cx="14"  cy="7"  r="9" fill="white" stroke="#333" stroke-width="1.5"/>';
        } else if ((slots || 1) === 3) {
          return '<circle cx="-16" cy="-10" r="11" fill="white" stroke="#333" stroke-width="1.5"/>' +
                 '<circle cx="16"  cy="-10" r="11" fill="white" stroke="#333" stroke-width="1.5"/>' +
                 '<circle cx="0"   cy="12"  r="11" fill="white" stroke="#333" stroke-width="1.5"/>';
        } else if ((slots || 1) === 2) {
          return '<rect x="-26" y="-15" width="52" height="30" rx="3" fill="white" stroke="#333" stroke-width="2"/>' +
                 '<circle cx="-13" cy="0" r="11" fill="white" stroke="#333" stroke-width="1.5"/>' +
                 '<circle cx="13"  cy="0" r="11" fill="white" stroke="#333" stroke-width="1.5"/>';
        }
        return '<circle cx="0" cy="0" r="14" fill="white" stroke="#333" stroke-width="2"/>';
      case 'offboard':
        return ''; // offboard = red bg, no center symbol
      default:
        return '';
    }
  }

  // ── Step 3 — Exits SVG (interactive) ──────────────────────────────────────

  function buildExitsSVG(exits, size) {
    var bg   = BG_COLORS[wizardData.bg] || '#D4B483';
    var path = hexPathStr();

    var stubs = exits.map(function (e) {
      var mp = EDGE_MPS[e];
      return '<line x1="' + mp.x + '" y1="' + mp.y + '" x2="0" y2="0"' +
             ' stroke="#ffd700" stroke-width="6" stroke-linecap="round"/>';
    }).join('');

    var edges = '';
    for (var i = 0; i < 6; i++) {
      var c1 = HEX_CORNERS[i];
      var c2 = HEX_CORNERS[(i + 1) % 6];
      var active = exits.indexOf(i) >= 0;
      edges += '<line x1="' + c1.x + '" y1="' + c1.y + '" x2="' + c2.x + '" y2="' + c2.y + '"' +
               ' stroke="' + (active ? '#ffd700' : '#555') + '"' +
               ' stroke-width="' + (active ? 4 : 2) + '" pointer-events="none"/>';
      // Transparent wide hit target
      edges += '<line x1="' + c1.x + '" y1="' + c1.y + '" x2="' + c2.x + '" y2="' + c2.y + '"' +
               ' stroke="transparent" stroke-width="18"' +
               ' class="hex-edge-hit" data-edge="' + i + '" style="cursor:pointer;"/>';
    }

    // Edge index labels just outside the hex
    var labels = '';
    for (var j = 0; j < 6; j++) {
      var lx = EDGE_MPS[j].x * 1.3;
      var ly = EDGE_MPS[j].y * 1.3;
      labels += '<text x="' + lx + '" y="' + ly + '"' +
                ' text-anchor="middle" dominant-baseline="middle"' +
                ' fill="#888" font-size="7" font-family="Arial">' + j + '</text>';
    }

    return '<svg width="' + size + '" height="' + size + '" viewBox="-65 -65 130 130">' +
           '<path d="' + path + '" fill="' + bg + '" stroke="none"/>' +
           stubs + edges + labels + '</svg>';
  }

  function renderStep3(body) {
    var isDualTown = wizardData.feature === 'dualTown';
    var isOO       = wizardData.feature === 'oo';
    var isGrayCity = wizardData.bg === 'gray' && wizardData.feature === 'city';
    var pendingEdge = null;

    var div = document.createElement('div');
    div.innerHTML = '<h3 class="shw-title">Select track exits</h3>' +
      '<p class="shw-subtitle">Click edges of the hex to toggle exits.' +
      (isDualTown ? ' <em>Dual town needs an even number of exits (2, 4, or 6).</em>' : '') +
      (isOO ? ' <em>Assign exits to each OO city node in the pairing step below.</em>' : '') +
      '</p>' +
      '<div id="shwExitsWrap" style="display:flex;justify-content:center;margin:16px 0;"></div>' +
      (isDualTown ? '<div id="shwPairingWrap" style="margin-top:4px;"></div>' : '') +
      (isOO       ? '<div id="shwOOPairingWrap" style="margin-top:4px;"></div>' : '') +
      (isGrayCity ? '<div id="shwPathTopWrap" style="margin-top:4px;"></div>' : '') +
      '<p class="shw-note">Orientation is set in the next step.</p>';
    body.appendChild(div);

    var onExitsChange = null;
    if (isDualTown) {
      onExitsChange = function () {
        wizardData.exitPairs = [];
        renderPairingSection();
      };
    } else if (isOO) {
      onExitsChange = function () {
        wizardData.exitPairs = [];
        renderOOPairingSection();
      };
    } else if (isGrayCity) {
      onExitsChange = function () {
        wizardData.pathPairs = (wizardData.pathPairs || []).filter(function (p) {
          return wizardData.exits.indexOf(p[0]) >= 0 && wizardData.exits.indexOf(p[1]) >= 0;
        });
        pendingEdge = null;
        renderTopologySection();
      };
    }

    renderExitsHex(body, onExitsChange);

    if (isDualTown)  renderPairingSection();
    if (isOO)        renderOOPairingSection();
    if (isGrayCity)  renderTopologySection();

    // ── Dual-town pairing section ────────────────────────────────────────────

    function renderPairingSection() {
      var wrap = body.querySelector('#shwPairingWrap');
      if (!wrap) return;
      var exits = wizardData.exits;

      if (exits.length === 0) {
        // RULE 4: standalone dits when no exits
        wrap.innerHTML = '<p style="text-align:center;font-size:11px;color:#aaa;margin:6px 0;">' +
          'No exits \u2014 two standalone dits.</p>';
        return;
      }
      if (exits.length % 2 !== 0) {
        wrap.innerHTML = '<p style="text-align:center;font-size:11px;color:#e05050;margin:6px 0;">' +
          'Please select an even number of exits (' + exits.length + ' selected).</p>';
        return;
      }

      // ── 4-exit: named X / K / CF topology cards ────────────────────────────
      if (exits.length === 4) {
        var sorted = exits.slice().sort(function (a, b) { return a - b; });
        var e0 = sorted[0], e1 = sorted[1], e2 = sorted[2], e3 = sorted[3];
        var circDist = function (a, b) { return Math.min(Math.abs(b - a), 6 - Math.abs(b - a)); };

        // X: interleaved split — e0↔e2 vs e1↔e3 — paths cross through center
        var xPairing = [[e0, e2], [e1, e3]];
        // X is sensible only if both pairs are on opposite-ish sides (dist ≥ 2)
        var xValid = circDist(e0, e2) >= 2 && circDist(e1, e3) >= 2;

        // K: adjacent splits — paths don't cross
        var kPairings = [
          [[e0, e1], [e2, e3]],
          [[e0, e3], [e1, e2]],
        ];

        // CF: 4 options — each exit can be the lone "terminal" exit
        // Junction (3 exits) → _0, lone exit → _1
        var cfPairings = [0, 1, 2, 3].map(function (i) {
          var others = sorted.filter(function (_, j) { return j !== i; });
          return [others, [sorted[i]]];
        });

        var allCards = [];
        if (xValid) {
          allCards.push({ label: 'X routing',     pairing: xPairing });
        }
        kPairings.forEach(function (kp) {
          allCards.push({ label: 'K routing',     pairing: kp });
        });
        cfPairings.forEach(function (cfp) {
          allCards.push({ label: 'Chicken foot',  pairing: cfp });
        });

        wrap.innerHTML =
          '<h4 style="margin:12px 0 6px;text-align:center;font-size:13px;color:#ddd;">Choose town pairing</h4>' +
          '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">' +
          allCards.map(function (card, idx) {
            var sel = pairingEquals(card.pairing, wizardData.exitPairs);
            return '<div class="shw-pairing-card" data-idx="' + idx + '"' +
                   ' style="border:2px solid ' + (sel ? '#ffd700' : '#555') + ';' +
                   'border-radius:8px;padding:4px;cursor:pointer;text-align:center;' +
                   'background:' + (sel ? 'rgba(255,215,0,0.08)' : 'transparent') + ';">' +
                   buildPairingPreviewSVG(card.pairing[0], card.pairing[1], 80) +
                   '<div style="font-size:9px;color:#aaa;margin-top:2px;">' + card.label + '</div>' +
                   '</div>';
          }).join('') +
          '</div>';

        wrap._validPairings = allCards.map(function (c) { return c.pairing; });
        wrap.querySelectorAll('.shw-pairing-card').forEach(function (card) {
          card.onclick = function () {
            var idx = parseInt(card.dataset.idx, 10);
            wizardData.exitPairs = wrap._validPairings[idx].map(function (g) { return g.slice(); });
            wrap.querySelectorAll('.shw-pairing-card').forEach(function (c) {
              c.style.borderColor = c.dataset.idx == idx ? '#ffd700' : '#555';
              c.style.background  = c.dataset.idx == idx ? 'rgba(255,215,0,0.08)' : 'transparent';
            });
          };
        });
        return;
      }

      // ── 2-exit / 6-exit: generic pairing cards ──────────────────────────────
      var pairings = generatePairings(exits);
      var valid    = pairings;

      wrap.innerHTML =
        '<h4 style="margin:12px 0 6px;text-align:center;font-size:13px;color:#ddd;">Choose path pairing</h4>' +
        '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' +
        valid.map(function (pairing, idx) {
          var sel = pairingEquals(pairing, wizardData.exitPairs);
          return '<div class="shw-pairing-card" data-idx="' + idx + '"' +
                 ' style="border:2px solid ' + (sel ? '#ffd700' : '#555') + ';' +
                 'border-radius:8px;padding:6px;cursor:pointer;text-align:center;box-sizing:border-box;' +
                 'background:' + (sel ? 'rgba(255,215,0,0.08)' : 'transparent') + ';">' +
                 buildPairingPreviewSVG(pairing[0], pairing[1], 90) +
                 '</div>';
        }).join('') +
        '</div>';

      // Store valid pairings on the wrap for click handler
      wrap._validPairings = valid;

      wrap.querySelectorAll('.shw-pairing-card').forEach(function (card) {
        card.onclick = function () {
          var idx = parseInt(card.dataset.idx, 10);
          wizardData.exitPairs = wrap._validPairings[idx].map(function (g) { return g.slice(); });
          wrap.querySelectorAll('.shw-pairing-card').forEach(function (c) {
            c.style.borderColor = c.dataset.idx == idx ? '#ffd700' : '#555';
            c.style.background  = c.dataset.idx == idx ? 'rgba(255,215,0,0.08)' : 'transparent';
          });
        };
      });
    }

    // ── OO pairing section ───────────────────────────────────────────────────
    function renderOOPairingSection() {
      var wrap = body.querySelector('#shwOOPairingWrap');
      if (!wrap) return;
      var exits = wizardData.exits;

      if (exits.length < 2) {
        wrap.innerHTML = '<p style="text-align:center;font-size:11px;color:#aaa;margin:6px 0;">' +
          'Need \u22652 exits to assign nodes. Single exit goes to node A.</p>';
        return;
      }

      var pairings = generateOOPairings(exits);
      wrap.innerHTML =
        '<h4 style="margin:12px 0 6px;text-align:center;font-size:13px;color:#ddd;">Assign exits to each OO node</h4>' +
        '<div style="font-size:10px;color:#888;text-align:center;margin-bottom:6px;">' +
        'Yellow = node A &nbsp;\u2022&nbsp; Cyan = node B</div>' +
        '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">' +
        pairings.map(function (pairing, idx) {
          var sel = pairingEquals(pairing, wizardData.exitPairs);
          var aLabel = pairing[0].join(',');
          var bLabel = pairing[1].join(',');
          return '<div class="shw-pairing-card" data-idx="' + idx + '"' +
                 ' style="border:2px solid ' + (sel ? '#ffd700' : '#555') + ';' +
                 'border-radius:8px;padding:4px;cursor:pointer;text-align:center;' +
                 'background:' + (sel ? 'rgba(255,215,0,0.08)' : 'transparent') + ';">' +
                 buildPairingPreviewSVG(pairing[0], pairing[1], 80) +
                 '<div style="font-size:9px;color:#aaa;margin-top:2px;">' +
                 'A:' + aLabel + ' / B:' + bLabel + '</div>' +
                 '</div>';
        }).join('') +
        '</div>';

      wrap._validPairings = pairings;
      wrap.querySelectorAll('.shw-pairing-card').forEach(function (card) {
        card.onclick = function () {
          var idx = parseInt(card.dataset.idx, 10);
          wizardData.exitPairs = wrap._validPairings[idx].map(function (g) { return g.slice(); });
          wrap.querySelectorAll('.shw-pairing-card').forEach(function (c) {
            c.style.borderColor = c.dataset.idx == idx ? '#ffd700' : '#555';
            c.style.background  = c.dataset.idx == idx ? 'rgba(255,215,0,0.08)' : 'transparent';
          });
        };
      });
    }

    function renderTopologySection() {
      var topWrap = body.querySelector('#shwPathTopWrap');
      if (!topWrap) return;
      topWrap.innerHTML =
        '<h4 style="margin:12px 0 8px;text-align:center;font-size:13px;color:#ddd;">Path routing mode</h4>' +
        '<div style="display:flex;gap:12px;justify-content:center;">' +
        buildModeCard('star', 'Open routing',
          'All exits connect to the city node.',
          buildOpenRoutingMiniSVG(wizardData.exits)) +
        buildModeCard('directed', 'Directed routing',
          'Pair exits for edge-to-edge connections.',
          buildDirectedConceptSVG()) +
        '</div>' +
        '<div id="shwPairEditor"></div>';

      topWrap.querySelectorAll('.shw-mode-card').forEach(function (card) {
        card.style.borderColor = card.dataset.mode === wizardData.pathMode ? '#ffd700' : '#555';
        card.style.background  = card.dataset.mode === wizardData.pathMode ? 'rgba(255,215,0,0.08)' : 'transparent';
        card.onclick = function () {
          wizardData.pathMode = card.dataset.mode;
          pendingEdge = null;
          topWrap.querySelectorAll('.shw-mode-card').forEach(function (c) {
            c.style.borderColor = c.dataset.mode === wizardData.pathMode ? '#ffd700' : '#555';
            c.style.background  = c.dataset.mode === wizardData.pathMode ? 'rgba(255,215,0,0.08)' : 'transparent';
          });
          renderPairEditorContent();
        };
      });

      renderPairEditorContent();
    }

    function renderPairEditorContent() {
      var pairWrap = body.querySelector('#shwPairEditor');
      if (!pairWrap) return;
      if (wizardData.pathMode !== 'directed') {
        pairWrap.innerHTML = '';
        return;
      }

      pairWrap.innerHTML =
        '<p style="text-align:center;font-size:11px;color:#aaa;margin:6px 0 4px;">' +
        'Click two exits to pair them. Click a paired exit to remove the pair.</p>' +
        '<div style="display:flex;justify-content:center;">' +
        buildPairEditorSVG(wizardData.exits, wizardData.pathPairs || [], pendingEdge, 160) +
        '</div>' +
        '<div style="text-align:center;margin-top:4px;">' +
        '<button id="shwClearPairs" class="shw-btn-sec" style="font-size:11px;padding:3px 10px;">Clear pairs</button>' +
        '</div>';

      pairWrap.querySelectorAll('.pair-edge-hit').forEach(function (el) {
        el.addEventListener('click', function () {
          var edge  = parseInt(el.dataset.edge, 10);
          var pairs = wizardData.pathPairs || [];
          var pairIdx = -1;
          for (var i = 0; i < pairs.length; i++) {
            if (pairs[i][0] === edge || pairs[i][1] === edge) { pairIdx = i; break; }
          }

          if (pairIdx >= 0) {
            pairs.splice(pairIdx, 1);
            if (pendingEdge === edge) pendingEdge = null;
          } else if (pendingEdge === null) {
            pendingEdge = edge;
          } else if (pendingEdge === edge) {
            pendingEdge = null;
          } else {
            // Remove any existing pair involving pendingEdge, then form new pair
            wizardData.pathPairs = (wizardData.pathPairs || []).filter(function (p) {
              return p[0] !== pendingEdge && p[1] !== pendingEdge;
            });
            wizardData.pathPairs.push([pendingEdge, edge]);
            pendingEdge = null;
          }
          renderPairEditorContent();
        });
      });

      var clearBtn = pairWrap.querySelector('#shwClearPairs');
      if (clearBtn) {
        clearBtn.onclick = function () {
          wizardData.pathPairs = [];
          pendingEdge = null;
          renderPairEditorContent();
        };
      }
    }
  }

  function renderExitsHex(body, onChange) {
    var wrap = body.querySelector('#shwExitsWrap');
    wrap.innerHTML = buildExitsSVG(wizardData.exits, 170);
    wrap.querySelectorAll('.hex-edge-hit').forEach(function (el) {
      el.addEventListener('click', function () {
        var edge = parseInt(el.dataset.edge, 10);
        var idx  = wizardData.exits.indexOf(edge);
        if (idx >= 0) {
          wizardData.exits.splice(idx, 1);
        } else {
          wizardData.exits.push(edge);
        }
        renderExitsHex(body, onChange);
        if (onChange) onChange();
      });
    });
  }

  // ── Path topology helpers ──────────────────────────────────────────────────

  function buildModeCard(mode, title, description, svgHtml) {
    return '<div class="shw-mode-card" data-mode="' + mode + '"' +
           ' style="border:2px solid #555;border-radius:8px;padding:8px 10px;cursor:pointer;' +
           'width:130px;text-align:center;box-sizing:border-box;">' +
           svgHtml +
           '<div style="margin-top:5px;font-size:12px;font-weight:bold;color:#ddd;">' + title + '</div>' +
           '<div style="margin-top:3px;font-size:10px;color:#aaa;">' + description + '</div>' +
           '</div>';
  }

  function buildOpenRoutingMiniSVG(exits) {
    var bg   = BG_COLORS[wizardData.bg] || '#BCBDC0';
    var path = hexPathStr();
    var lines = (exits || []).map(function (e) {
      var mp = EDGE_MPS[e];
      return '<line x1="' + mp.x + '" y1="' + mp.y + '" x2="0" y2="0"' +
             ' stroke="#222" stroke-width="5" stroke-linecap="round"/>';
    }).join('');
    return '<svg width="80" height="80" viewBox="-60 -60 120 120">' +
           '<path d="' + path + '" fill="' + bg + '" stroke="#666" stroke-width="1.5"/>' +
           lines +
           '<circle cx="0" cy="0" r="10" fill="white" stroke="#333" stroke-width="1.5"/>' +
           '</svg>';
  }

  function buildDirectedConceptSVG() {
    var bg   = BG_COLORS[wizardData.bg] || '#BCBDC0';
    var path = hexPathStr();
    var mp0  = EDGE_MPS[0], mp3 = EDGE_MPS[3];
    return '<svg width="80" height="80" viewBox="-60 -60 120 120">' +
           '<path d="' + path + '" fill="' + bg + '" stroke="#666" stroke-width="1.5"/>' +
           '<line x1="' + mp0.x + '" y1="' + mp0.y + '" x2="' + mp3.x + '" y2="' + mp3.y + '"' +
           ' stroke="#222" stroke-width="5" stroke-linecap="round"/>' +
           '<circle cx="0" cy="0" r="10" fill="white" stroke="#888" stroke-width="1.5"' +
           ' stroke-dasharray="3,2"/>' +
           '</svg>';
  }

  function buildPairEditorSVG(exits, pairs, pendingEdge, size) {
    var bg       = BG_COLORS[wizardData.bg] || '#BCBDC0';
    var path     = hexPathStr();
    var pairedSet = {};
    (pairs || []).forEach(function (p) { pairedSet[p[0]] = true; pairedSet[p[1]] = true; });

    var pairLines = (pairs || []).map(function (p) {
      var mp1 = EDGE_MPS[p[0]], mp2 = EDGE_MPS[p[1]];
      return '<line x1="' + mp1.x + '" y1="' + mp1.y + '" x2="' + mp2.x + '" y2="' + mp2.y + '"' +
             ' stroke="#222" stroke-width="6" stroke-linecap="round"/>';
    }).join('');

    var starLines = (exits || []).filter(function (e) {
      return !pairedSet[e] && e !== pendingEdge;
    }).map(function (e) {
      var mp = EDGE_MPS[e];
      return '<line x1="' + mp.x + '" y1="' + mp.y + '" x2="0" y2="0"' +
             ' stroke="#666" stroke-width="4" stroke-dasharray="5,3" stroke-linecap="round"/>';
    }).join('');

    var pendingLine = '';
    if (pendingEdge !== null && (exits || []).indexOf(pendingEdge) >= 0) {
      var pmp = EDGE_MPS[pendingEdge];
      pendingLine = '<line x1="' + pmp.x + '" y1="' + pmp.y + '" x2="0" y2="0"' +
                   ' stroke="#ffd700" stroke-width="5" stroke-linecap="round"/>';
    }

    var edgeHits = (exits || []).map(function (e) {
      var c1 = HEX_CORNERS[e], c2 = HEX_CORNERS[(e + 1) % 6];
      var isPaired  = !!pairedSet[e];
      var isPending = (e === pendingEdge);
      var color = isPending ? '#ffd700' : (isPaired ? '#aaa' : '#555');
      var w     = (isPending || isPaired) ? 3 : 2;
      return '<line x1="' + c1.x + '" y1="' + c1.y + '" x2="' + c2.x + '" y2="' + c2.y + '"' +
             ' stroke="' + color + '" stroke-width="' + w + '" pointer-events="none"/>' +
             '<line x1="' + c1.x + '" y1="' + c1.y + '" x2="' + c2.x + '" y2="' + c2.y + '"' +
             ' stroke="transparent" stroke-width="16"' +
             ' class="pair-edge-hit" data-edge="' + e + '" style="cursor:pointer;"/>';
    }).join('');

    var labels = (exits || []).map(function (e) {
      var lx = EDGE_MPS[e].x * 1.35, ly = EDGE_MPS[e].y * 1.35;
      return '<text x="' + lx + '" y="' + ly + '"' +
             ' text-anchor="middle" dominant-baseline="middle"' +
             ' fill="#888" font-size="7" font-family="Arial">' + e + '</text>';
    }).join('');

    return '<svg width="' + size + '" height="' + size + '" viewBox="-65 -65 130 130">' +
           '<path d="' + path + '" fill="' + bg + '" stroke="none"/>' +
           pairLines + starLines + pendingLine +
           '<circle cx="0" cy="0" r="10" fill="white" stroke="#333" stroke-width="1.5"/>' +
           edgeHits + labels + '</svg>';
  }

  // ── OO / Dual-town pairing helpers ────────────────────────────────────────

  // Generate all valid ways to split exits between two OO nodes.
  // Allows unequal splits (e.g. 2+1 for a 3-exit OO like tile #65).
  // exits[0] is always in groupA to avoid A↔B duplicates.
  // Returns array of [groupA, groupB].
  function generateOOPairings(exits) {
    var n = exits.length;
    var result = [];
    // Iterate all 2^(n-1) subsets of exits[1..n-1]; exits[0] always in A
    for (var bits = 0; bits < (1 << (n - 1)); bits++) {
      var groupA = [exits[0]];
      var groupB = [];
      for (var i = 1; i < n; i++) {
        if (bits & (1 << (i - 1))) { groupA.push(exits[i]); }
        else { groupB.push(exits[i]); }
      }
      if (groupB.length > 0) result.push([groupA, groupB]);
    }
    return result;
  }

  // Generate all ways to split exits into two equal groups.
  // Returns array of [groupA, groupB] where each group is sorted exit indices.
  function generatePairings(exits) {
    var n = exits.length;
    var half = n / 2;
    var result = [];
    var seen = {};

    function choose(start, groupA) {
      if (groupA.length === half) {
        var groupB = exits.filter(function (e) { return groupA.indexOf(e) < 0; });
        // Canonical form: first group has the smaller first element
        var key;
        if (groupA[0] < groupB[0]) {
          key = groupA.join(',') + '|' + groupB.join(',');
        } else {
          key = groupB.join(',') + '|' + groupA.join(',');
          var tmp = groupA; groupA = groupB; groupB = tmp;
        }
        if (!seen[key]) {
          seen[key] = true;
          result.push([groupA.slice(), groupB.slice()]);
        }
        return;
      }
      for (var i = start; i < exits.length; i++) {
        groupA.push(exits[i]);
        choose(i + 1, groupA);
        groupA.pop();
      }
    }

    choose(0, []);
    return result;
  }

  // Returns true if the straight-line segments connecting each group's exit
  // midpoints intersect strictly inside the hexagon.
  function pairingCrosses(groupA, groupB) {
    for (var i = 0; i < groupA.length; i++) {
      for (var j = i + 1; j < groupA.length; j++) {
        var p1 = EDGE_MPS[groupA[i]], p2 = EDGE_MPS[groupA[j]];
        for (var k = 0; k < groupB.length; k++) {
          for (var l = k + 1; l < groupB.length; l++) {
            var p3 = EDGE_MPS[groupB[k]], p4 = EDGE_MPS[groupB[l]];
            if (segmentsIntersect(p1, p2, p3, p4)) return true;
          }
        }
      }
    }
    return false;
  }

  function segmentsIntersect(p1, p2, p3, p4) {
    var d1x = p2.x - p1.x, d1y = p2.y - p1.y;
    var d2x = p4.x - p3.x, d2y = p4.y - p3.y;
    var cross = d1x * d2y - d1y * d2x;
    if (Math.abs(cross) < 1e-8) return false; // parallel
    var dx = p3.x - p1.x, dy = p3.y - p1.y;
    var t = (dx * d2y - dy * d2x) / cross;
    var s = (dx * d1y - dy * d1x) / cross;
    return t > 0.05 && t < 0.95 && s > 0.05 && s < 0.95;
  }

  function pairingEquals(pA, pB) {
    if (!pA || !pB || pA.length !== pB.length) return false;
    for (var i = 0; i < pA.length; i++) {
      if (!pA[i] || !pB[i] || pA[i].length !== pB[i].length) return false;
      for (var j = 0; j < pA[i].length; j++) {
        if (pA[i][j] !== pB[i][j]) return false;
      }
    }
    return true;
  }

  // Mini SVG showing one pairing: groupA exits (yellow arcs) + groupB exits (cyan arcs).
  // RULE 5: quadratic bezier arcs; town dot at centroid scaled to 60% apothem.
  function buildPairingPreviewSVG(groupA, groupB, size) {
    var bg   = BG_COLORS[wizardData.bg] || '#D4B483';
    var path = hexPathStr();

    function centroid(group) {
      var sx = 0, sy = 0;
      group.forEach(function (e) { sx += EDGE_MPS[e].x; sy += EDGE_MPS[e].y; });
      // Scale to 60% of apothem distance so town is clearly inside
      return { x: sx / group.length * 0.6, y: sy / group.length * 0.6 };
    }

    function townArcs(group, color) {
      var tc = centroid(group);
      var arcs = group.map(function (e) {
        var mp = EDGE_MPS[e];
        // Quadratic bezier from edge to town, control point near center (0,0) for gentle curve
        return '<path d="M ' + mp.x.toFixed(1) + ' ' + mp.y.toFixed(1) +
               ' Q 0 0 ' + tc.x.toFixed(1) + ' ' + tc.y.toFixed(1) + '"' +
               ' fill="none" stroke="' + color + '" stroke-width="5" stroke-linecap="round"/>';
      }).join('');
      var dot = '<rect x="' + (tc.x - 7).toFixed(1) + '" y="' + (tc.y - 4).toFixed(1) +
                '" width="14" height="8" rx="1"' +
                ' fill="' + color + '" opacity="0.8"/>';
      return arcs + dot;
    }

    return '<svg width="' + size + '" height="' + size + '" viewBox="-60 -60 120 120">' +
           '<path d="' + path + '" fill="' + bg + '" stroke="#666" stroke-width="1.5"/>' +
           townArcs(groupA, '#ffd700') +
           townArcs(groupB, '#40e0d0') +
           '</svg>';
  }

  // ── Step 4 — Orientation / Preview ────────────────────────────────────────

  // RULE 6: compute where a stub from edge midpoint mp stops at the feature perimeter.
  function stubEndpoint(mp, feature, slots) {
    var dist = Math.sqrt(mp.x * mp.x + mp.y * mp.y);
    if (dist < 0.001) return { x: 0, y: 0 };
    var ux = mp.x / dist, uy = mp.y / dist;
    var s = slots || 1;

    if (feature === 'oo') {
      // Two circles at (±14, 0) r=10. Choose circle on same side as edge.
      var cx = mp.x >= 0 ? 14 : -14;
      var discInner = 100 * dist * dist - cx * cx * mp.y * mp.y;
      if (discInner < 0) { return { x: ux * 10, y: uy * 10 }; }
      var u = (mp.x * cx + Math.sqrt(discInner)) / (dist * dist);
      u = Math.max(0, Math.min(1, u));
      return { x: u * mp.x, y: u * mp.y };
    }
    if (feature === 'city') {
      if (s === 4) {
        var t4 = Math.min(
          Math.abs(ux) > 0.001 ? 29 / Math.abs(ux) : 999,
          Math.abs(uy) > 0.001 ? 16 / Math.abs(uy) : 999
        );
        return { x: ux * t4, y: uy * t4 };
      }
      if (s === 3) { return { x: ux * 22, y: uy * 22 }; }
      if (s === 2) {
        var t2 = Math.min(
          Math.abs(ux) > 0.001 ? 26 / Math.abs(ux) : 999,
          Math.abs(uy) > 0.001 ? 15 / Math.abs(uy) : 999
        );
        return { x: ux * t2, y: uy * t2 };
      }
      return { x: ux * 14, y: uy * 14 };
    }
    if (feature === 'town' || feature === 'dualTown') {
      return { x: ux * 8, y: uy * 8 };
    }
    // 'none', 'offboard': stub runs to center
    return { x: 0, y: 0 };
  }

  function buildPreviewSVG(data, size) {
    var bg   = BG_COLORS[data.bg] || '#D4B483';
    var path = hexPathStr();
    var feat  = data.feature;
    var slots = data.slots || 1;
    var exitPairs = data.exitPairs;

    var stubs;
    if (feat === 'oo') {
      // Compute OO node positions from exitPairs (raw, no rotation) for circle placement
      var ooHasEP = exitPairs && ((exitPairs[0] || []).length + (exitPairs[1] || []).length) > 0;
      var ooNodePos = [0, 1].map(function (ni) {
        if (!ooHasEP) return ni === 0 ? { x: -14, y: 0 } : { x: 14, y: 0 };
        var grp = exitPairs[ni] || [];
        if (!grp.length) return ni === 0 ? { x: -14, y: 0 } : { x: 14, y: 0 };
        var sx = 0, sy = 0;
        grp.forEach(function (e) { sx += EDGE_MPS[e % 6].x; sy += EDGE_MPS[e % 6].y; });
        return { x: sx / grp.length * 0.55, y: sy / grp.length * 0.55 };
      });
      stubs = (data.exits || []).map(function (e) {
        var re = (e + (data.rotation || 0) + 6) % 6;
        var mp = EDGE_MPS[re];
        var nodeIdx = ooHasEP
          ? ((exitPairs[0] || []).indexOf(e) >= 0 ? 0 : 1)
          : ((data.exits || []).indexOf(e) < Math.ceil((data.exits || []).length / 2) ? 0 : 1);
        var np = ooNodePos[nodeIdx];
        return '<line x1="' + mp.x + '" y1="' + mp.y + '" x2="' + np.x.toFixed(1) + '" y2="' + np.y.toFixed(1) + '"' +
               ' stroke="#222" stroke-width="8" stroke-linecap="round"/>';
      }).join('');
    } else {
      stubs = (data.exits || []).map(function (e) {
        var re = (e + (data.rotation || 0) + 6) % 6;  // RULE 6: +6 to keep positive
        var mp = EDGE_MPS[re];
        var ep = stubEndpoint(mp, feat, slots);
        return '<line x1="' + mp.x + '" y1="' + mp.y + '" x2="' + ep.x.toFixed(1) + '" y2="' + ep.y.toFixed(1) + '"' +
               ' stroke="#222" stroke-width="8" stroke-linecap="round"/>';
      }).join('');
    }

    var feature = featureSVGFull(feat, slots, exitPairs);

    return '<svg width="' + size + '" height="' + size + '" viewBox="-60 -60 120 120">' +
           '<path d="' + path + '" fill="' + bg + '" stroke="#666" stroke-width="1.5"/>' +
           stubs + feature + '</svg>';
  }

  function renderStep4(body) {
    var isOffboard = wizardData.bg === 'red' && wizardData.feature === 'offboard';
    var taperHtml  = '';
    if (isOffboard) {
      taperHtml =
        '<div style="display:flex;gap:16px;justify-content:center;margin-top:10px;">' +
        [{ val: 1, label: 'Medium taper' }, { val: 2, label: 'Short taper' }].map(function (t) {
          return '<label style="display:flex;align-items:center;gap:5px;cursor:pointer;' +
                 'font-size:12px;color:#ddd;">' +
                 '<input type="radio" name="shwTaper" value="' + t.val + '"' +
                 ((wizardData.taperStyle || 1) === t.val ? ' checked' : '') + '>' +
                 t.label + '</label>';
        }).join('') +
        '</div>';
    }

    var div = document.createElement('div');
    div.innerHTML = '<h3 class="shw-title">Set orientation</h3>' +
      '<div id="shwOrientWrap" style="display:flex;justify-content:center;margin:16px 0;"></div>' +
      '<div style="display:flex;gap:12px;justify-content:center;">' +
      '<button id="shwRotL" class="shw-btn-sec">\u21BA Rotate left</button>' +
      '<button id="shwRotR" class="shw-btn-sec">Rotate right \u21BB</button>' +
      '</div>' +
      '<p class="shw-note" style="text-align:center;margin-top:10px;">Rotation: <span id="shwRotVal">' +
      wizardData.rotation + '</span></p>' +
      taperHtml;
    body.appendChild(div);
    renderOrientPreview(body);

    body.querySelector('#shwRotL').onclick = function () {
      wizardData.rotation = (wizardData.rotation + 5) % 6;
      body.querySelector('#shwRotVal').textContent = wizardData.rotation;
      renderOrientPreview(body);
    };
    body.querySelector('#shwRotR').onclick = function () {
      wizardData.rotation = (wizardData.rotation + 1) % 6;
      body.querySelector('#shwRotVal').textContent = wizardData.rotation;
      renderOrientPreview(body);
    };

    if (isOffboard) {
      body.querySelectorAll('input[name="shwTaper"]').forEach(function (radio) {
        radio.onchange = function () {
          wizardData.taperStyle = parseInt(radio.value, 10);
        };
      });
    }
  }

  function renderOrientPreview(body) {
    var wrap = body.querySelector('#shwOrientWrap');
    wrap.innerHTML = buildPreviewSVG(wizardData, 170);
  }

  // ── Step 5 — Revenue, terminal, name, label ────────────────────────────────

  function usePhaseRevenue() {
    if (wizardData.feature === 'none')     return false; // track-only
    if (wizardData.feature === 'town')     return false; // flat integer revenue
    if (wizardData.feature === 'dualTown') return false; // per-node flat revenue
    if (wizardData.feature === 'oo')       return false; // flat per-node integer revenues via ooFlatRevenues
    return wizardData.feature === 'city' ||
           wizardData.feature === 'offboard' ||
           wizardData.bg === 'red' ||
           wizardData.bg === 'gray';
  }

  function buildOORevenueHtml() {
    var revs = wizardData.ooFlatRevenues || [20, 20];
    return '<div class="shw-field" style="border-left:3px solid #ffd700;padding-left:8px;margin-bottom:8px;">' +
           '<label style="color:#ffd700;">City A revenue</label>' +
           '<input type="number" id="shwOORevA" value="' + revs[0] + '" min="0" max="999" style="width:80px;"></div>' +
           '<div class="shw-field" style="border-left:3px solid #40e0d0;padding-left:8px;margin-bottom:8px;">' +
           '<label style="color:#40e0d0;">City B revenue</label>' +
           '<input type="number" id="shwOORevB" value="' + revs[1] + '" min="0" max="999" style="width:80px;"></div>';
  }

  function renderStep5(body) {
    var feat  = wizardData.feature;
    var exits = wizardData.exits || [];
    var bg    = wizardData.bg;
    // RULE 1: white/yellow hexes with no exits have no static revenue
    var noExits = exits.length === 0 && bg !== 'gray' && bg !== 'red';
    var revenueHtml = '';

    if (feat === 'none') {
      // Track-only hex — no revenue UI at all
    } else if (noExits) {
      // RULE 1: exits are required for a meaningful revenue on non-gray/red hexes
      revenueHtml = '<p class="shw-note" style="text-align:center;">' +
        'No exits \u2014 revenue defined by tile upgrade.</p>';
    } else if (feat === 'town') {
      // Single flat revenue integer
      revenueHtml = '<div class="shw-field"><label>Town revenue</label>' +
        '<input type="number" id="shwTownRev" value="' + (wizardData.townRevenue || 10) +
        '" min="0" max="999" style="width:80px;"></div>';
    } else if (feat === 'dualTown') {
      // Two flat revenue integers, one per node
      revenueHtml = '<div class="shw-field"><label>Town A revenue</label>' +
        '<input type="number" id="shwTownRevA" value="' + ((wizardData.townRevenues || [10, 10])[0]) +
        '" min="0" max="999" style="width:80px;"></div>' +
        '<div class="shw-field"><label>Town B revenue</label>' +
        '<input type="number" id="shwTownRevB" value="' + ((wizardData.townRevenues || [10, 10])[1]) +
        '" min="0" max="999" style="width:80px;"></div>';
    } else if (feat === 'oo') {
      // OO: two independent 1-slot city nodes — flat static integer revenue per node
      if (!wizardData.ooFlatRevenues) wizardData.ooFlatRevenues = [20, 20];
      revenueHtml = buildOORevenueHtml();
    } else if (usePhaseRevenue()) {
      // Phase-based revenue (single-node city, offboard)
      revenueHtml = '<div class="shw-field"><label>Revenue by phase</label>' +
        '<div class="shw-phase-rows">' +
        PHASES.map(function (ph) {
          return '<div class="shw-phase-row">' +
            '<span class="shw-phase-dot" style="background:' + PHASE_COLORS[ph] + ';"></span>' +
            '<input type="checkbox" id="shwChk_' + ph + '"' +
            (wizardData.activePhases[ph] ? ' checked' : '') + '>' +
            '<label for="shwChk_' + ph + '" class="shw-phase-label">' + ph + '</label>' +
            '<input type="number" id="shwRev_' + ph + '" class="shw-rev-input"' +
            ' value="' + (wizardData.phaseRevenue[ph] || 0) + '" min="0" max="9999">' +
            '</div>';
        }).join('') +
        '</div></div>';
    } else {
      var flatVal = wizardData.phaseRevenue.yellow || 0;
      revenueHtml = '<div class="shw-field"><label>Revenue</label>' +
        '<select id="shwFlatRev">' +
        [0, 10, 20, 30].map(function (v) {
          return '<option value="' + v + '"' + (flatVal === v ? ' selected' : '') + '>' +
                 (v === 0 ? '\u2014' : v) + '</option>';
        }).join('') +
        '</select></div>';
    }

    var html = '<h3 class="shw-title">Revenue &amp; label</h3>' +
      '<div class="shw-field"><label>Hex name (LOCATION_NAMES)</label>' +
      '<input type="text" id="shwName" value="' + escHtml(wizardData.name || '') +
      '" placeholder="e.g. Highlands, Aberdeen" style="width:100%;"></div>' +
      '<div class="shw-field"><label>Tile label (label=X, optional)</label>' +
      '<input type="text" id="shwLabel" value="' + escHtml(wizardData.label || '') +
      '" placeholder="e.g. B, NY" style="width:100%;"></div>' +
      revenueHtml +
      (wizardData.bg === 'gray' && wizardData.feature === 'city'
        ? '<div class="shw-field shw-terminal-row">' +
          '<input type="checkbox" id="shwTerminal"' + (wizardData.terminal ? ' checked' : '') + '>' +
          '<label for="shwTerminal">Dead-end / terminal city (Aberdeen-style)</label>' +
          '</div>'
        : '');

    var div = document.createElement('div');
    div.innerHTML = html;
    body.appendChild(div);

    body.querySelector('#shwName').oninput = function (e) {
      wizardData.name = e.target.value;
    };
    body.querySelector('#shwLabel').oninput = function (e) {
      wizardData.label = e.target.value;
    };
    var termEl = body.querySelector('#shwTerminal');
    if (termEl) {
      termEl.onchange = function (e) {
        wizardData.terminal = e.target.checked;
      };
    }

    if (feat === 'town') {
      body.querySelector('#shwTownRev').oninput = function (e) {
        wizardData.townRevenue = parseInt(e.target.value, 10) || 0;
      };
    } else if (feat === 'dualTown') {
      body.querySelector('#shwTownRevA').oninput = function (e) {
        if (!wizardData.townRevenues) wizardData.townRevenues = [10, 10];
        wizardData.townRevenues[0] = parseInt(e.target.value, 10) || 0;
      };
      body.querySelector('#shwTownRevB').oninput = function (e) {
        if (!wizardData.townRevenues) wizardData.townRevenues = [10, 10];
        wizardData.townRevenues[1] = parseInt(e.target.value, 10) || 0;
      };
    } else if (feat === 'oo') {
      // OO flat revenue handlers
      var inpA = body.querySelector('#shwOORevA');
      var inpB = body.querySelector('#shwOORevB');
      if (inpA) inpA.oninput = function (e) {
        if (!wizardData.ooFlatRevenues) wizardData.ooFlatRevenues = [20, 20];
        wizardData.ooFlatRevenues[0] = parseInt(e.target.value, 10) || 0;
      };
      if (inpB) inpB.oninput = function (e) {
        if (!wizardData.ooFlatRevenues) wizardData.ooFlatRevenues = [20, 20];
        wizardData.ooFlatRevenues[1] = parseInt(e.target.value, 10) || 0;
      };
    } else if (usePhaseRevenue()) {
      PHASES.forEach(function (ph) {
        body.querySelector('#shwChk_' + ph).onchange = function (e) {
          wizardData.activePhases[ph] = e.target.checked;
        };
        body.querySelector('#shwRev_' + ph).oninput = function (e) {
          wizardData.phaseRevenue[ph] = parseInt(e.target.value, 10) || 0;
        };
      });
    } else if (body.querySelector('#shwFlatRev')) {
      body.querySelector('#shwFlatRev').onchange = function (e) {
        var v = parseInt(e.target.value, 10) || 0;
        wizardData.phaseRevenue = { yellow: v, green: v, brown: v, gray: v };
      };
    }
  }

  // ── Utility ────────────────────────────────────────────────────────────────

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  function init() {
    var modal = document.getElementById('staticHexWizard');
    if (!modal) return;
    document.getElementById('shwBtnCancel').onclick = closeWizard;
    document.getElementById('shwBtnBack').onclick   = prevStep;
    document.getElementById('shwBtnNext').onclick   = nextStep;
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeWizard();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  window.openStaticHexWizard = openWizard;

  /**
   * staticHexCode(hex) — generate map.rb `code` string for a static hex.
   *
   * Examples:
   *   city=revenue:yellow_20|green_30|brown_40|gray_60;path=a:0,b:_0,terminal:1
   *   offboard=revenue:yellow_30|brown_60;path=a:1,b:_0,terminal:1;path=a:4,b:_0,terminal:1
   *   town=revenue:yellow_10;path=a:0,b:_0;path=a:3,b:_0
   */
  window.staticHexCode = function staticHexCode(hex) {
    if (!hex || !hex.static) return '';

    var parts = [];
    var exits = hex.exits || [];
    // RULE 1: white/yellow hexes with no exits get revenue:0
    var noExits = exits.length === 0 && hex.bg !== 'gray' && hex.bg !== 'red';

    var activePhases = PHASES.filter(function (p) {
      return hex.activePhases && hex.activePhases[p];
    });
    var revenueStr = noExits ? '0' : activePhases.map(function (p) {
      return p + '_' + (hex.phaseRevenue[p] || 0);
    }).join('|');

    // ── Feature directives ─────────────────────────────────────────────────
    switch (hex.feature) {
      case 'town':
        parts.push('town=revenue:' + (noExits ? 0 : (hex.townRevenue !== undefined ? hex.townRevenue : 10)));
        break;
      case 'dualTown': {
        var rev0 = noExits ? 0 : ((hex.townRevenues && hex.townRevenues[0] !== undefined) ? hex.townRevenues[0] : 10);
        var rev1 = noExits ? 0 : ((hex.townRevenues && hex.townRevenues[1] !== undefined) ? hex.townRevenues[1] : 10);
        parts.push('town=revenue:' + rev0);
        parts.push('town=revenue:' + rev1);
        break;
      }
      case 'offboard':
        parts.push('offboard=revenue:' + revenueStr);
        break;
      case 'oo': {
        // RULE 2: two separate 1-slot city nodes with flat static revenue + label=OO
        var ooFlatRevs = hex.ooFlatRevenues || [20, 20];
        parts.push('city=revenue:' + (noExits ? 0 : (ooFlatRevs[0] || 0)));
        parts.push('city=revenue:' + (noExits ? 0 : (ooFlatRevs[1] || 0)));
        break;
      }
      case 'city': {
        var slots = hex.slots || 1;
        if (slots === 2) {
          // RULE 2: single node with 2 slots
          parts.push('city=revenue:' + revenueStr + ',slots:2');
        } else if (slots === 3) {
          parts.push('city=revenue:' + revenueStr + ',slots:3,loc:1');
        } else if (slots === 4) {
          parts.push('city=revenue:' + revenueStr + ',slots:4');
        } else {
          parts.push('city=revenue:' + revenueStr);
        }
        break;
      }
      // 'none': no feature directive, only paths
    }

    // ── Path directives ────────────────────────────────────────────────────
    var termSuffix = '';
    if (hex.feature === 'offboard') {
      termSuffix = ',terminal:' + (hex.taperStyle || 1);
    } else if (hex.terminal) {
      termSuffix = ',terminal:1';
    }

    if (hex.feature === 'oo') {
      // Use exitPairs if set, otherwise fall back to simple ceil/2 split
      var ooAExits = (hex.exitPairs && hex.exitPairs[0] && hex.exitPairs[0].length) ? hex.exitPairs[0] : null;
      var ooBExits = (hex.exitPairs && hex.exitPairs[1] && hex.exitPairs[1].length) ? hex.exitPairs[1] : null;
      if (ooAExits && ooBExits) {
        ooAExits.forEach(function (e) {
          parts.push('path=a:' + (e + (hex.rotation || 0)) % 6 + ',b:_0' + termSuffix);
        });
        ooBExits.forEach(function (e) {
          parts.push('path=a:' + (e + (hex.rotation || 0)) % 6 + ',b:_1' + termSuffix);
        });
      } else {
        var ooHalf = Math.ceil(exits.length / 2);
        exits.forEach(function (e, i) {
          var re = (e + (hex.rotation || 0)) % 6;
          var station = i < ooHalf ? '_0' : '_1';
          parts.push('path=a:' + re + ',b:' + station + termSuffix);
        });
      }
    } else if (hex.feature === 'dualTown') {
      // Use exitPairs if set, otherwise fall back to first-half/_0 second-half/_1
      var nodeAExits = (hex.exitPairs && hex.exitPairs[0]) ? hex.exitPairs[0] : [];
      var nodeBExits = (hex.exitPairs && hex.exitPairs[1]) ? hex.exitPairs[1] : [];
      if (nodeAExits.length > 0 || nodeBExits.length > 0) {
        nodeAExits.forEach(function (e) {
          parts.push('path=a:' + (e + (hex.rotation || 0)) % 6 + ',b:_0' + termSuffix);
        });
        nodeBExits.forEach(function (e) {
          parts.push('path=a:' + (e + (hex.rotation || 0)) % 6 + ',b:_1' + termSuffix);
        });
      } else {
        var dHalf = Math.ceil(exits.length / 2);
        exits.forEach(function (e, i) {
          var re = (e + (hex.rotation || 0)) % 6;
          var station = i < dHalf ? '_0' : '_1';
          parts.push('path=a:' + re + ',b:' + station + termSuffix);
        });
      }
    } else if (hex.feature === 'city' && hex.pathMode === 'directed' &&
                      (hex.pathPairs || []).length > 0) {
      // Directed routing: paired exits first, then star for any unpaired exits
      var pairedExitSet = {};
      (hex.pathPairs || []).forEach(function (pair) {
        var reA = (pair[0] + (hex.rotation || 0)) % 6;
        var reB = (pair[1] + (hex.rotation || 0)) % 6;
        parts.push('path=a:' + reA + ',b:' + reB);
        pairedExitSet[pair[0]] = true;
        pairedExitSet[pair[1]] = true;
      });
      exits.forEach(function (e) {
        if (!pairedExitSet[e]) {
          var re = (e + (hex.rotation || 0)) % 6;
          parts.push('path=a:' + re + ',b:_0' + termSuffix);
        }
      });
    } else {
      // Single station, 2-slot city, or no station (_0 for all paths)
      exits.forEach(function (e) {
        var re = (e + (hex.rotation || 0)) % 6;
        parts.push('path=a:' + re + ',b:_0' + termSuffix);
      });
    }

    // ── Label directive ────────────────────────────────────────────────────
    // OO always gets label=OO; user-set hex.label overrides
    var labelText = hex.label || (hex.feature === 'oo' ? 'OO' : '');
    if (labelText) {
      parts.push('label=' + labelText);
    }

    // ── Border directives ──────────────────────────────────────────────────
    (hex.borders || []).forEach(function (b) {
      var dir = 'border=edge:' + b.edge + ',type:' + b.type;
      if (b.type === 'water' && b.cost) dir += ',cost:' + b.cost;
      parts.push(dir);
    });

    // ── Icon directives ────────────────────────────────────────────────────
    (hex.icons || []).forEach(function (icon) {
      parts.push('icon=image:' + icon.image + ',sticky:1');
    });

    return parts.join(';');
  };

}());
