// ─── DIVIDEND RULES EDITOR ────────────────────────────────────────────────────
// Modal editor for the Dividend step's price-movement and half-pay configuration.
// Mounted from rounds-panel.js when the user clicks "Rules" on a Dividend step
// card. Persists to stepEntry.priceMovement.
//
// Owned by the market SME (this file) but rendered inside the Steps panel because
// the rule lives on a step body in tobymao (per-game Step::Dividend subclasses
// override `share_price_change`).
//
// State shape on each Dividend step entry:
//   stepEntry.priceMovement = {
//     recipe:          'standard' | '1tier' | '2tier' | '3tier' | '4tier' | 'absolute' | 'custom',
//     halfPay:         boolean,    // adds :half to DIVIDEND_TYPES
//     halfPayPenalty:  boolean,    // revenue < price/2 → left 1 (1846, 1825)
//     minorBranch:     'follow' | 'always_1' | 'no_movement',
//     priceFloorOp:    null | '<=' | '>=',
//     priceFloorValue: number | null,
//     priceFloorTier:  number,     // which tier the floor applies to (default = highest)
//     // Custom recipe only:
//     customRules:     [ ... ]     // future: pill-builder rule objects
//   }
//
// The bridge consumes this to emit a per-game Step::Dividend subclass body when
// recipe !== 'standard' or halfPay is on.

// ── Recipe definitions ──────────────────────────────────────────────────────
// The set surveyed across 60 tobymao Step::Dividend overrides:
//   standard — engine default; pay → right 1; withhold → left 1; revenue=0 → left 1.
//   1tier    — 1849, 1826, 1841: revenue >= price → right 1; revenue < price → stay.
//   2tier    — 1822, 1817: 1× → right 1, 2× → right 2.
//   3tier    — 1846, 1822PNW, 1868WY: 1× / 2× / 3× → right 1/2/3 (with optional price floor).
//   4tier    — 1862, 1825: 1× / 2× / 3× / 4× → right 1/2/3/4.
//   absolute — 1840: revenue >= 100, 200, 400 … → right 1..7.
//   custom   — escape hatch.
const DIVIDEND_RECIPES = {
  standard: {
    label:       'Standard',
    sublabel:    'engine default — most 1830-era games',
    description: 'Pay → right 1. Withhold or no-run → left 1.',
    tiers:       0,
    showFloor:   false,
  },
  '1tier': {
    label:       '1-tier ratio',
    sublabel:    '1849, 1826, 1841',
    description: 'revenue ≥ price → right 1. Below price → stay. Zero → left 1.',
    tiers:       1,
    showFloor:   false,
  },
  '2tier': {
    label:       '2-tier ratio',
    sublabel:    '1822, 1817',
    description: '1× → right 1. 2× → right 2.',
    tiers:       2,
    showFloor:   false,
  },
  '3tier': {
    label:       '3-tier ratio',
    sublabel:    '1846, 1822PNW, 1868WY',
    description: '1× → right 1. 2× → right 2. 3× → right 3 (with optional price floor).',
    tiers:       3,
    showFloor:   true,
  },
  '4tier': {
    label:       '4-tier ratio',
    sublabel:    '1862, 1825',
    description: '1× / 2× / 3× / 4× → right 1 / 2 / 3 / 4.',
    tiers:       4,
    showFloor:   false,
  },
  absolute: {
    label:       'Absolute thresholds',
    sublabel:    '1840',
    description: 'Right ×N at fixed revenue brackets (you define them).',
    tiers:       0,
    showFloor:   false,
    note:        'Requires custom rule editor — full configuration coming soon.',
  },
  custom: {
    label:       'Custom',
    sublabel:    'pill builder',
    description: 'Hand-author the rule with the rule builder.',
    tiers:       0,
    showFloor:   false,
    note:        'Custom rule builder is the planned escape hatch — coming soon.',
  },
};

const DEFAULT_PRICE_MOVEMENT = Object.freeze({
  recipe:          'standard',
  halfPay:         false,
  halfPayPenalty:  false,
  minorBranch:     'follow',
  priceFloorOp:    null,
  priceFloorValue: null,
  priceFloorTier:  null,
  customRules:     [],
});

function ensurePriceMovement(stepEntry) {
  if (!stepEntry.priceMovement) stepEntry.priceMovement = { ...DEFAULT_PRICE_MOVEMENT };
  return stepEntry.priceMovement;
}

function priceMovementBadge(stepEntry) {
  const pm = stepEntry.priceMovement;
  if (!pm || pm.recipe === 'standard') return pm && pm.halfPay ? 'standard + half' : null;
  const r = DIVIDEND_RECIPES[pm.recipe];
  const label = r ? r.label : pm.recipe;
  const half = pm.halfPay ? ' + half' : '';
  return `${label}${half}`;
}

// ── Ruby export preview ─────────────────────────────────────────────────────
// Generates an approximate `share_price_change` body. For 'standard', returns
// null so the bridge knows to skip the override.
function rubyPreview(pm) {
  if (!pm || pm.recipe === 'standard') {
    if (!pm || (!pm.halfPay && pm.minorBranch === 'follow')) return null;
  }
  const lines = [];
  lines.push('def share_price_change(entity, revenue = 0)');

  // Minor branch
  if (pm.minorBranch === 'no_movement') {
    lines.push('  return {} if entity.minor?');
  } else if (pm.minorBranch === 'always_1') {
    lines.push('  return { share_direction: :right, share_times: 1 } if entity.minor? && revenue.positive?');
  }

  // No-run / withhold
  lines.push('  return { share_direction: :left, share_times: 1 } unless revenue.positive?');

  // Half-pay penalty band
  if (pm.halfPayPenalty) {
    lines.push('  price = entity.share_price.price');
    lines.push('  return { share_direction: :left, share_times: 1 } if revenue < price / 2');
  } else if (DIVIDEND_RECIPES[pm.recipe]?.tiers > 0) {
    lines.push('  price = entity.share_price.price');
  }

  // Tier ladder
  const recipe = DIVIDEND_RECIPES[pm.recipe];
  if (recipe && recipe.tiers > 0) {
    lines.push('  times = 0');
    for (let n = 1; n <= recipe.tiers; n++) {
      const cond = n === 1 ? 'revenue >= price' : `revenue >= price * ${n}`;
      let suffix = '';
      if (pm.priceFloorOp && pm.priceFloorValue != null && (pm.priceFloorTier === n || (pm.priceFloorTier == null && n === recipe.tiers))) {
        suffix = ` && price ${pm.priceFloorOp} ${pm.priceFloorValue}`;
      }
      lines.push(`  times = ${n} if ${cond}${suffix}`);
    }
    lines.push('  times.positive? ? { share_direction: :right, share_times: times } : {}');
  } else if (pm.recipe === 'standard') {
    lines.push('  { share_direction: :right, share_times: 1 }');
  } else {
    lines.push('  # ' + (recipe?.note || 'recipe not yet supported'));
    lines.push('  super');
  }

  lines.push('end');
  return lines.join('\n');
}

function dividendTypesPreview(pm) {
  if (!pm || !pm.halfPay) return null;
  return 'DIVIDEND_TYPES = %i[payout half withhold].freeze\ninclude Engine::Step::HalfPay';
}

// ── Modal renderer ──────────────────────────────────────────────────────────
let _activeModal = null;

function openDividendRulesModal(stepEntry, onSave) {
  closeDividendRulesModal();
  const pm = { ...DEFAULT_PRICE_MOVEMENT, ...(stepEntry.priceMovement || {}) };

  const overlay = document.createElement('div');
  overlay.className = 'dr-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Dividend rules editor');

  const modal = document.createElement('div');
  modal.className = 'dr-modal';
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const renderBody = () => {
    const recipe = DIVIDEND_RECIPES[pm.recipe] || DIVIDEND_RECIPES.standard;
    modal.innerHTML = `
      <header class="dr-head">
        <h3>Dividend rules</h3>
        <button class="dr-close" type="button" aria-label="Close">×</button>
      </header>
      <div class="dr-body">
        <section class="dr-section">
          <h4 class="dr-section-title">Ladder preset</h4>
          <select class="dr-select dr-recipe">
            ${Object.entries(DIVIDEND_RECIPES).map(([k, r]) =>
              `<option value="${k}" ${pm.recipe === k ? 'selected' : ''}>${r.label} — ${r.sublabel}</option>`
            ).join('')}
          </select>
          <p class="dr-help">${recipe.description}${recipe.note ? `<br><em>${recipe.note}</em>` : ''}</p>
        </section>

        <section class="dr-section">
          <h4 class="dr-section-title">Half-pay option</h4>
          <label class="dr-toggle"><input type="checkbox" class="dr-half" ${pm.halfPay ? 'checked' : ''}>
            Allow half-pay <span class="dr-muted">(adds <code>:half</code> to dividend types)</span>
          </label>
          <label class="dr-toggle"><input type="checkbox" class="dr-half-penalty" ${pm.halfPayPenalty ? 'checked' : ''}>
            Half-pay penalty band <span class="dr-muted">(revenue &lt; price / 2 → left 1; 1846, 1825)</span>
          </label>
        </section>

        <section class="dr-section">
          <h4 class="dr-section-title">Minor companies</h4>
          <select class="dr-select dr-minor">
            <option value="follow"      ${pm.minorBranch === 'follow' ? 'selected' : ''}>Follow same ladder as majors</option>
            <option value="always_1"    ${pm.minorBranch === 'always_1' ? 'selected' : ''}>Always +1 right when revenue &gt; 0  (1822 family)</option>
            <option value="no_movement" ${pm.minorBranch === 'no_movement' ? 'selected' : ''}>Never move  (1846, 1840, 1868WY)</option>
          </select>
        </section>

        <section class="dr-section ${recipe.showFloor ? '' : 'dr-disabled'}">
          <h4 class="dr-section-title">Top-tier price floor</h4>
          <p class="dr-help">Some games gate the top tier on share price (1822PNW: tier 3 only when price ≤ 150; 1846: tier 3 only when price ≥ 165).</p>
          <div class="dr-floor-row">
            <select class="dr-select dr-floor-op" ${recipe.showFloor ? '' : 'disabled'}>
              <option value=""   ${!pm.priceFloorOp ? 'selected' : ''}>No floor</option>
              <option value="<=" ${pm.priceFloorOp === '<=' ? 'selected' : ''}>price ≤</option>
              <option value=">=" ${pm.priceFloorOp === '>=' ? 'selected' : ''}>price ≥</option>
            </select>
            <input type="number" class="dr-input dr-floor-value" placeholder="value"
              value="${pm.priceFloorValue ?? ''}" ${recipe.showFloor && pm.priceFloorOp ? '' : 'disabled'}>
          </div>
        </section>

        <section class="dr-section dr-preview-section">
          <h4 class="dr-section-title">Generated <code>share_price_change</code></h4>
          <pre class="dr-preview">${escapeHtml(rubyPreview(pm) || '# No override needed — engine default applies.')}</pre>
          ${pm.halfPay ? `<pre class="dr-preview dr-preview-extra">${escapeHtml(dividendTypesPreview(pm))}</pre>` : ''}
        </section>
      </div>
      <footer class="dr-foot">
        <button class="dr-btn"           type="button" data-act="cancel">Cancel</button>
        <button class="dr-btn dr-btn-primary" type="button" data-act="save">Save rules</button>
      </footer>
    `;
    wireFields();
  };

  const wireFields = () => {
    modal.querySelector('.dr-close').addEventListener('click', () => closeDividendRulesModal());
    modal.querySelector('[data-act="cancel"]').addEventListener('click', () => closeDividendRulesModal());
    modal.querySelector('[data-act="save"]').addEventListener('click', () => {
      stepEntry.priceMovement = pm;
      if (typeof onSave === 'function') onSave(pm);
      closeDividendRulesModal();
    });
    modal.querySelector('.dr-recipe').addEventListener('change', e => {
      pm.recipe = e.target.value;
      // Reset floor when leaving a recipe that supports it
      if (!DIVIDEND_RECIPES[pm.recipe].showFloor) {
        pm.priceFloorOp = null;
        pm.priceFloorValue = null;
        pm.priceFloorTier = null;
      }
      renderBody();
    });
    modal.querySelector('.dr-half').addEventListener('change', e => { pm.halfPay = !!e.target.checked; renderBody(); });
    modal.querySelector('.dr-half-penalty').addEventListener('change', e => { pm.halfPayPenalty = !!e.target.checked; renderBody(); });
    modal.querySelector('.dr-minor').addEventListener('change', e => { pm.minorBranch = e.target.value; renderBody(); });
    const floorOp = modal.querySelector('.dr-floor-op');
    if (floorOp) floorOp.addEventListener('change', e => {
      pm.priceFloorOp = e.target.value || null;
      if (!pm.priceFloorOp) pm.priceFloorValue = null;
      renderBody();
    });
    const floorVal = modal.querySelector('.dr-floor-value');
    if (floorVal) floorVal.addEventListener('input', e => {
      const n = parseInt(e.target.value, 10);
      pm.priceFloorValue = isNaN(n) ? null : n;
      // Update preview only — don't re-render whole body to keep input focused
      const preview = modal.querySelector('.dr-preview');
      if (preview) preview.textContent = rubyPreview(pm) || '# No override needed — engine default applies.';
    });
  };

  // Click outside / Esc to close
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDividendRulesModal(); });
  const escHandler = (e) => { if (e.key === 'Escape') closeDividendRulesModal(); };
  document.addEventListener('keydown', escHandler);

  _activeModal = { overlay, escHandler };
  renderBody();
  // Focus the first interactive control
  setTimeout(() => modal.querySelector('.dr-recipe')?.focus(), 0);
}

function closeDividendRulesModal() {
  if (!_activeModal) return;
  _activeModal.overlay.remove();
  document.removeEventListener('keydown', _activeModal.escHandler);
  _activeModal = null;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

// ── Globals ─────────────────────────────────────────────────────────────────
window.DIVIDEND_RECIPES         = DIVIDEND_RECIPES;
window.DEFAULT_PRICE_MOVEMENT   = DEFAULT_PRICE_MOVEMENT;
window.ensurePriceMovement      = ensurePriceMovement;
window.priceMovementBadge       = priceMovementBadge;
window.openDividendRulesModal   = openDividendRulesModal;
window.closeDividendRulesModal  = closeDividendRulesModal;
window.dividendRubyPreview      = rubyPreview;
window.dividendTypesPreview     = dividendTypesPreview;
