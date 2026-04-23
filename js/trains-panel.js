// ─── TRAINS & PHASES PANEL ──────────────────────────────────────────────────
// Dedicated logic for the high-density 'Zero-Typing' Train Roster.
// All labels are auto-generated based on Reach and Type configuration.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Human-readable display name: label for standard trains, label + company attribution for private trains.
 * Callable from mechanics-panel via window.getTrainDisplayName(tr).
 */
function getTrainDisplayName(tr) {
    if (!tr) return '—';
    const label = calculateTrainLabel(tr);
    if (tr.grantedBy && tr.grantedBy.length) {
        const companies = tr.grantedBy.map(function(g) {
            return g.name ? g.sym + ' \u2014 ' + g.name : g.sym;
        });
        return label + ' \xb7 ' + companies.join(', ');
    }
    return label;
}

/**
 * Automatically generates a label (e.g. "2", "4/2", "3+1") based on train configuration.
 */
function calculateTrainLabel(tr) {
    if (!tr) return '—';
    if (tr.label) return tr.label;   // linked/special trains carry an explicit label
    if (tr.distType === 'n') return String(tr.n || 2);
    if (tr.distType === 'xy') return `${tr.x || 2}/${tr.y || 1}`;
    if (tr.distType === 'nm') return `${tr.n || 2}+${tr.m || 1}`;
    if (tr.distType === 'h') return `H${tr.h || 4}`;
    if (tr.distType === 'u') {
        const base = tr.isExpress ? 'E' : 'D';
        return (tr.multiplier && tr.multiplier > 1) ? `${tr.multiplier}${base}` : base;
    }
    return '—';
}

/**
 * Re-renders the entire Train Roster dashboard.
 */
function renderTrainsTable() {
    const tbody = document.getElementById('trainsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!state.phases) state.phases = [];

    // Sort: standard buyable trains by cost ascending; private/granted trains at bottom.
    // tr.privateOnly is set by importGameRb when every instance is locked to a private company.
    state.trains.sort((a, b) => {
        const pa = !!a.privateOnly, pb = !!b.privateOnly;
        if (pa !== pb) return pa ? 1 : -1;
        if (!pa) return (a.cost || 0) - (b.cost || 0);
        return (a.label || '').localeCompare(b.label || '');
    });

    let _specialSepAdded = false;
    state.trains.forEach((tr, idx) => {
        // Insert "Private Company Trains" section header before first private train
        if (tr.privateOnly && !_specialSepAdded) {
            _specialSepAdded = true;
            const sepRow = document.createElement('tr');
            sepRow.className = 'train-section-sep';
            sepRow.innerHTML = '<td colspan="8" class="train-section-label">Private Company Trains</td>';
            tbody.appendChild(sepRow);
        }
        const isSpecial = !!tr.privateOnly;
        const trRow = document.createElement('tr');
        trRow.className = 'train-grid-row' + (isSpecial ? ' train-special-row' : '');

        const phase = state.phases.find(p => p.name === tr.phase);
        const phaseColor = phase ? (phase.color || '#444') : 'transparent';
        const label = calculateTrainLabel(tr);
        const isLinked = tr.linkedPrivateIdx !== undefined && tr.linkedPrivateIdx !== null;
        const linkedSym = isLinked ? 'P' + (tr.linkedPrivateIdx + 1) : '';
        const hasEvents = !!(tr.events && tr.events.length);
        const hasVariants = !!(tr.variants && tr.variants.length);
        const isUnlimited = tr.count === null;

        trRow.innerHTML = `
            <td style="padding:0; position:relative;">
                <div class="phase-sliver" style="background:${phaseColor}; width:6px; position:absolute; top:0; bottom:0; left:0;"></div>
            </td>
            <td>
                <span class="train-auto-label">${label}</span>
                ${hasVariants ? `<button class="var-toggle" title="${tr._expanded ? 'Collapse variants' : 'Show variants'}">${tr._expanded ? '▼' : '▶'} ${tr.variants.length}</button>` : ''}
                ${isLinked ? `<span class="train-linked-badge" title="Granted by private company ${linkedSym}">🔗 ${linkedSym}</span>` : ''}
                ${hasEvents ? `<span class="train-events-badge" title="${(tr.events||[]).map(function(ev){return ev.type;}).join(', ')}">⚡ ${(tr.events||[]).length}</span>` : ''}
                ${isSpecial && tr.grantedBy && tr.grantedBy.length ? `<div class="train-granted-line">${tr.grantedBy.map(function(g){return g.name?g.sym+' \u2014 '+g.name:g.sym;}).join(' &middot; ')}</div>` : ''}
                ${isSpecial && (!tr.grantedBy || !tr.grantedBy.length) ? '<div class="train-granted-line">Permanent — not in open depot</div>' : ''}
            </td>
            <td>
                <select class="tr-dist-type">
                    <option value="n" ${tr.distType === 'n' ? 'selected' : ''}>Steam</option>
                    <option value="xy" ${tr.distType === 'xy' ? 'selected' : ''}>Split</option>
                    <option value="nm" ${tr.distType === 'nm' ? 'selected' : ''}>Local</option>
                    <option value="h" ${tr.distType === 'h' ? 'selected' : ''}>Hex</option>
                    <option value="u" ${tr.distType === 'u' ? 'selected' : ''}>Diesel</option>
                </select>
            </td>
            <td>
                <div class="tr-dist-inputs"></div>
            </td>
            <td>
                <div class="input-with-label">
                    <span class="input-prefix">COST</span>
                    <input type="number" class="tr-cost" value="${tr.cost || 0}">
                </div>
            </td>
            <td>
                <div class="qty-chips">
                    <button class="qty-btn qty-dec"${isUnlimited ? ' disabled' : ''}>−</button>
                    <span class="qty-val${isUnlimited ? ' is-inf' : ''}">${isUnlimited ? '∞' : (tr.count || 0)}</span>
                    <button class="qty-btn qty-inc"${isUnlimited ? ' disabled' : ''}>+</button>
                    <button class="qty-btn qty-inf${isUnlimited ? ' is-active' : ''}" title="${isUnlimited ? 'Set fixed count' : 'Set unlimited'}">${isUnlimited ? '∞ ×' : '∞'}</button>
                </div>
            </td>
            <td>
                <div class="lifecycle-cell">
                    <div class="rust-zone">
                        <label class="compact-switch">
                            <input type="checkbox" class="rust-check" ${tr.rusts ? 'checked' : ''}>
                            <span class="compact-slider"></span>
                        </label>
                        <select class="rust-sel" ${!tr.rusts ? 'style="display:none;"' : ''}>
                            <option value="">Rusts on...</option>
                            ${state.trains.filter(t => t !== tr).map(t => `<option value="${t.type || t.id}" ${tr.rustsOn === (t.type || t.id) ? 'selected' : ''}>${calculateTrainLabel(t)}</option>`).join('')}
                        </select>
                        ${renderRustSliver(tr)}
                    </div>
                </div>
            </td>
            <td>
                <div style="display:flex; align-items:center; justify-content:flex-end; gap:8px;">
                    <select class="phase-assign-sel" style="width:100px; font-size:10px;">
                        <option value="">No Phase</option>
                        ${state.phases.map(p => `<option value="${p.name}" ${tr.phase === p.name ? 'selected' : ''}>Phase ${p.name}</option>`).join('')}
                    </select>
                    <button class="table-btn delete-btn" ${isLinked ? `title="Linked to ${linkedSym} — remove the 'Grants Train' ability from that private to delete" style="opacity:0.35; cursor:not-allowed;"` : ''}>✕</button>
                </div>
            </td>
        `;

        // Interaction Logic
        const distInputsZone = trRow.querySelector('.tr-dist-inputs');
        renderDistSubInputs(tr, distInputsZone);

        trRow.querySelector('.tr-dist-type').addEventListener('change', (e) => {
            tr.distType = e.target.value;
            // Reset type-specific fields when type changes
            if (tr.distType === 'u') { tr.isExpress = false; tr.multiplier = 1; }
            renderTrainsTable();
            autosave();
        });

        trRow.querySelector('.tr-cost').addEventListener('change', (e) => { tr.cost = parseInt(e.target.value) || 0; autosave(); });

        trRow.querySelector('.qty-dec').addEventListener('click', () => { if (tr.count === null) return; tr.count = Math.max(0, (tr.count || 0) - 1); renderTrainsTable(); autosave(); });
        trRow.querySelector('.qty-inc').addEventListener('click', () => { if (tr.count === null) return; tr.count = (tr.count || 0) + 1; renderTrainsTable(); autosave(); });
        trRow.querySelector('.qty-inf').addEventListener('click', () => { tr.count = tr.count === null ? 1 : null; renderTrainsTable(); autosave(); });

        trRow.querySelector('.rust-check').addEventListener('change', (e) => {
            tr.rusts = e.target.checked;
            renderTrainsTable();
            autosave();
        });

        const rustSel = trRow.querySelector('.rust-sel');
        if (rustSel) {
            rustSel.addEventListener('change', (e) => {
                tr.rustsOn = e.target.value;
                renderTrainsTable();
                autosave();
            });
        }

        trRow.querySelector('.phase-assign-sel').addEventListener('change', (e) => {
            tr.phase = e.target.value;
            renderTrainsTable();
            renderPhasesTable();
            autosave();
        });

        trRow.querySelector('.delete-btn').addEventListener('click', () => {
            if (isLinked) return; // deletion managed via the private's Grants Train ability
            state.trains.splice(idx, 1);
            renderTrainsTable();
            autosave();
        });

        tbody.appendChild(trRow);

        // Expand toggle wire-up
        if (hasVariants) {
            trRow.querySelector('.var-toggle').addEventListener('click', () => {
                tr._expanded = !tr._expanded;
                renderTrainsTable();
            });
        }

        // Variant sub-rows (rendered immediately after parent)
        if (hasVariants && tr._expanded) {
            tr.variants.forEach(function(vtr, vi) {
                const vRow = document.createElement('tr');
                vRow.className = 'variant-sub-row';
                const vLabel = calculateTrainLabel(vtr);
                vRow.innerHTML = `
                    <td style="padding:0; position:relative;">
                        <div class="phase-sliver" style="background:${phaseColor}; width:6px; position:absolute; top:0; bottom:0; left:0;"></div>
                    </td>
                    <td style="padding-left:18px;">
                        <span class="variant-indent">↳</span>
                        <span class="train-auto-label">${vLabel}</span>
                    </td>
                    <td>
                        <select class="vtr-dist-type">
                            <option value="n" ${vtr.distType === 'n' ? 'selected' : ''}>Steam</option>
                            <option value="xy" ${vtr.distType === 'xy' ? 'selected' : ''}>Split</option>
                            <option value="nm" ${vtr.distType === 'nm' ? 'selected' : ''}>Local</option>
                            <option value="h" ${vtr.distType === 'h' ? 'selected' : ''}>Hex</option>
                            <option value="u" ${vtr.distType === 'u' ? 'selected' : ''}>Diesel</option>
                        </select>
                    </td>
                    <td><div class="tr-dist-inputs"></div></td>
                    <td>
                        <div class="input-with-label">
                            <span class="input-prefix">COST</span>
                            <input type="number" class="vtr-cost" value="${vtr.cost || 0}">
                        </div>
                    </td>
                    <td>
                        <span class="qty-val${isUnlimited ? ' is-inf' : ''}" style="opacity:0.45;" title="Shares pool with ${label}">${isUnlimited ? '∞' : (tr.count || 0)}</span>
                    </td>
                    <td></td>
                    <td>
                        <button class="table-btn delete-btn vtr-del" title="Remove variant">✕</button>
                    </td>
                `;
                renderDistSubInputs(vtr, vRow.querySelector('.tr-dist-inputs'));
                vRow.querySelector('.vtr-dist-type').addEventListener('change', function(e) { vtr.distType = e.target.value; renderTrainsTable(); autosave(); });
                vRow.querySelector('.vtr-cost').addEventListener('change', function(e) { vtr.cost = parseInt(e.target.value) || 0; autosave(); });
                vRow.querySelector('.vtr-del').addEventListener('click', function() { tr.variants.splice(vi, 1); renderTrainsTable(); autosave(); });
                tbody.appendChild(vRow);
            });
        }
    });

    // Inline Add Train Button Row
    const addRow = document.createElement('tr');
    addRow.className = 'add-row-inline';
    addRow.innerHTML = `
        <td colspan="8" style="padding: 0;">
            <button id="inlineAddTrainBtn" style="width: 100%; padding: 12px; background: transparent; border: none; color: #888; font-weight: 500; text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer; transition: background 0.2s, color 0.2s;">
                + Add Train
            </button>
        </td>
    `;
    tbody.appendChild(addRow);

    // Must re-bind the listener since the button is recreated each render
    const addTrainBtn = document.getElementById('inlineAddTrainBtn');
    if (addTrainBtn) {
        addTrainBtn.addEventListener('click', () => {
            const newId = 't_' + Math.random().toString(36).substr(2, 6);
            state.trains.push({
                id: newId,
                distType: 'n',
                n: 2,
                cost: 100,
                count: 1,
                rusts: false,
                phase: '',
                variants: []
            });
            renderTrainsTable();
            autosave();
        });
        addTrainBtn.addEventListener('mouseenter', () => { addTrainBtn.style.color = '#ccc'; addTrainBtn.style.background = 'rgba(255,255,255,0.04)'; });
        addTrainBtn.addEventListener('mouseleave', () => { addTrainBtn.style.color = '#888'; addTrainBtn.style.background = 'transparent'; });
    }
}

/**
 * Renders the small 'Communication Sliver' for rusting relationships.
 */
function renderRustSliver(tr) {
    if (!tr.rusts || !tr.rustsOn) return '';
    const target = state.trains.find(t => (t.type || t.id) === tr.rustsOn);
    if (!target) return '';
    const targetLabel = calculateTrainLabel(target);
    const targetPhase = state.phases.find(p => p.name === target.phase);
    const bgColor = targetPhase ? (targetPhase.color || '#444') : '#444';
    return `<div class="rust-sliver" style="background:${bgColor};"><span class="emoji">🚄</span> ${targetLabel}</div>`;
}

/**
 * Renders sub-inputs for Reach configuration inline (no prompts).
 * For Unlimited (u): shows Diesel/Express radio and optional Multiplier field.
 */
function renderDistSubInputs(tr, container) {
    container.innerHTML = '';
    if (tr.distType === 'n') {
        container.innerHTML = `<input type="number" class="d-n" value="${tr.n || 2}" title="Stops at N cities">`;
        container.querySelector('.d-n').addEventListener('change', (e) => { tr.n = parseInt(e.target.value) || 2; renderTrainsTable(); autosave(); });

    } else if (tr.distType === 'xy') {
        container.innerHTML = `
            <input type="number" class="d-x" value="${tr.x || 2}" title="Count top X cities" style="width:40px;">
            <span>/</span>
            <input type="number" class="d-y" value="${tr.y || 1}" title="Max Y stops" style="width:40px;">
        `;
        container.querySelector('.d-x').addEventListener('change', (e) => { tr.x = parseInt(e.target.value) || 2; renderTrainsTable(); autosave(); });
        container.querySelector('.d-y').addEventListener('change', (e) => { tr.y = parseInt(e.target.value) || 1; renderTrainsTable(); autosave(); });

    } else if (tr.distType === 'nm') {
        container.innerHTML = `
            <input type="number" class="d-n" value="${tr.n || 2}" title="N cities (full value)" style="width:40px;">
            <span>+</span>
            <input type="number" class="d-m" value="${tr.m || 1}" title="M towns (counted)" style="width:40px;">
        `;
        container.querySelector('.d-n').addEventListener('change', (e) => { tr.n = parseInt(e.target.value) || 2; renderTrainsTable(); autosave(); });
        container.querySelector('.d-m').addEventListener('change', (e) => { tr.m = parseInt(e.target.value) || 1; renderTrainsTable(); autosave(); });

    } else if (tr.distType === 'h') {
        container.innerHTML = `<input type="number" class="d-h" value="${tr.h || 4}" title="Travels H hexes from origin">`;
        container.querySelector('.d-h').addEventListener('change', (e) => { tr.h = parseInt(e.target.value) || 4; renderTrainsTable(); autosave(); });

    } else if (tr.distType === 'u') {
        // Unlimited (D/E): Diesel collects towns (default), Express skips towns
        const isDiesel = !tr.isExpress;
        const multVal = tr.multiplier || 1;
        container.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:4px;font-size:10px;">
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
                    <input type="radio" name="utype_${tr.id || ''}" class="d-diesel" value="diesel" ${isDiesel ? 'checked' : ''}>
                    <span title="Collects from towns (default Diesel behavior)">Diesel</span>
                </label>
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
                    <input type="radio" name="utype_${tr.id || ''}" class="d-express" value="express" ${!isDiesel ? 'checked' : ''}>
                    <span title="Skips towns (Express behavior)">Express</span>
                </label>
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;margin-top:2px;">
                    <input type="number" class="d-mult" value="${multVal}" min="1" style="width:36px;" title="Revenue multiplier (e.g. 2 = double)">
                    <span style="color:#777;">×</span>
                </label>
            </div>
        `;
        container.querySelector('.d-diesel').addEventListener('change', (e) => { if (e.target.checked) { tr.isExpress = false; renderTrainsTable(); autosave(); } });
        container.querySelector('.d-express').addEventListener('change', (e) => { if (e.target.checked) { tr.isExpress = true; renderTrainsTable(); autosave(); } });
        container.querySelector('.d-mult').addEventListener('change', (e) => { tr.multiplier = parseInt(e.target.value) || 1; renderTrainsTable(); autosave(); });
    }
}

/**
 * Re-renders the Game Phases table.
 */
function renderPhasesTable() {
    const tbody = document.getElementById('phasesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const TILE_LABEL = { yellow: 'Yellow tiles', green: 'Green unlocked', brown: 'Brown unlocked', grey: 'Grey unlocked' };
    const STATUS_LABEL = { close_companies: 'Companies close', full_capitalisation: 'Full capitalisation', phase_revenue: 'Phase revenue', close_concessions: 'Concessions close' };

    state.phases.forEach((ph, idx) => {
        const triggerTrain = state.trains.find(function(t) { return t.id === ph.onTrain; });
        const triggerDesc  = triggerTrain ? 'First ' + calculateTrainLabel(triggerTrain) + '-train bought' : (idx === 0 ? 'Game start' : 'Manual trigger');
        const phaseDesc    = [triggerDesc, TILE_LABEL[ph.tiles] || ph.tiles, (ph.ors || 2) + ' ORs', 'Limit ' + (ph.limit || 4)].join(' · ');

        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="padding:0; position:relative; width:6px;">
                <div style="background:${ph.color || '#444'}; width:6px; position:absolute; top:0; bottom:0; left:0;"></div>
            </td>
            <td>
                <div style="display:flex; align-items:center;">
                    <input type="color" class="ph-color" value="${ph.color || '#ffffff'}" style="width:24px; height:24px; margin-right:8px; border:none; background:transparent; cursor:pointer;">
                    <input type="text" class="ph-name" value="${ph.name || ''}" placeholder="e.g. 2">
                </div>
                <div class="phase-auto-desc">${phaseDesc}</div>
            </td>
            <td>
                <select class="ph-trigger">
                    <option value="">Manual Only</option>
                    ${state.trains.map(t => `<option value="${t.id}" ${ph.onTrain === t.id ? 'selected' : ''}>${calculateTrainLabel(t)}</option>`).join('')}
                </select>
            </td>
            <td><input type="number" class="ph-ors" value="${ph.ors || 2}" style="width:60px;"></td>
            <td><input type="number" class="ph-limit" value="${ph.limit || 4}" style="width:60px;"></td>
            <td>
                <select class="ph-tiles">
                    <option value="yellow" ${ph.tiles === 'yellow' ? 'selected' : ''}>Yellow Only</option>
                    <option value="green" ${ph.tiles === 'green' ? 'selected' : ''}>+ Green</option>
                    <option value="brown" ${ph.tiles === 'brown' ? 'selected' : ''}>+ Brown</option>
                    <option value="grey" ${ph.tiles === 'grey' ? 'selected' : ''}>+ Grey</option>
                </select>
            </td>
            <td class="status-chips-cell">
                ${(ph.status || []).map(function(s){ const lbl=STATUS_LABEL[s]||(s.replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();})); return '<span class="status-chip" title="'+s+'">'+lbl+'</span>'; }).join('')}
            </td>
            <td>
                <button class="table-btn delete-btn">✕</button>
            </td>
        `;

        row.querySelector('.ph-color').addEventListener('change', (e) => { ph.color = e.target.value; renderTrainsTable(); if (typeof renderPrivatesCards === 'function') renderPrivatesCards(); autosave(); });
        row.querySelector('.ph-name').addEventListener('change', (e) => { ph.name = e.target.value; renderTrainsTable(); if (typeof renderPrivatesCards === 'function') renderPrivatesCards(); autosave(); });
        row.querySelector('.ph-trigger').addEventListener('change', (e) => { ph.onTrain = e.target.value; autosave(); });
        row.querySelector('.ph-ors').addEventListener('change', (e) => { ph.ors = parseInt(e.target.value) || 2; autosave(); });
        row.querySelector('.ph-limit').addEventListener('change', (e) => { ph.limit = parseInt(e.target.value) || 4; autosave(); });
        row.querySelector('.ph-tiles').addEventListener('change', (e) => { ph.tiles = e.target.value; autosave(); });

        row.querySelector('.delete-btn').addEventListener('click', () => {
            state.phases.splice(idx, 1);
            renderPhasesTable();
            renderTrainsTable();
            autosave();
        });

        tbody.appendChild(row);
    });

    // Inline Add Phase Button Row
    const addPhaseRow = document.createElement('tr');
    addPhaseRow.className = 'add-row-inline';
    addPhaseRow.innerHTML = `
        <td colspan="8" style="padding: 0;">
            <button id="inlineAddPhaseBtn" style="width: 100%; padding: 12px; background: transparent; border: none; color: #888; font-weight: 500; text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer; transition: background 0.2s, color 0.2s;">
                + Add Phase
            </button>
        </td>
    `;
    tbody.appendChild(addPhaseRow);

    // Must re-bind the listener since the button is recreated each render
    const addPhaseBtn = document.getElementById('inlineAddPhaseBtn');
    if (addPhaseBtn) {
        addPhaseBtn.addEventListener('click', () => {
            const nextName = (state.phases.length + 1).toString();
            state.phases.push({ name: nextName, onTrain: '', ors: 2, limit: 4, tiles: 'yellow', color: '#ffd700' });
            renderPhasesTable();
            autosave();
        });
        addPhaseBtn.addEventListener('mouseenter', () => { addPhaseBtn.style.color = '#ccc'; addPhaseBtn.style.background = 'rgba(255,255,255,0.04)'; });
        addPhaseBtn.addEventListener('mouseleave', () => { addPhaseBtn.style.color = '#888'; addPhaseBtn.style.background = 'transparent'; });
    }
}

// ── Initialization ────────────────────────────────────────────────────────────
// External addTrainBtn / addPhaseBtn listeners removed.
// Add-row buttons are now rendered inline within the tables and re-bound on each render.
