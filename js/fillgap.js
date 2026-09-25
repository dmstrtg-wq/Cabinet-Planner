// My Cabinet Planner — js/fillgap.js
// "Fill this gap" (Build Plan 5.2): for any open stretch on a wall, propose 1–3 exact
// combinations of standard cabinet widths plus a filler that close it, fewest and
// largest boxes first, filler (≤ 3") at the end against a wall or corner. Pick one and
// it's placed in one step (one undo). Gaps too small for a cabinet get a filler of
// exactly that width — fillers can be any size (Dan, 2026-09-24).
// Loaded by app.html as a classic script (shared global scope). Load order matters —
// see the <script> list at the bottom of app.html.

// ════════════════════════════
// SOLVER
// ════════════════════════════
const FILL_MAX_FILLER = 3;   // inches — the Build Plan's "fillers ≤ 3" at ends"

// All ways to make `total` from exactly k widths (non-increasing, so no duplicates)
function _partitions(total, widths, k, maxW = Infinity, acc = [], out = []) {
  if (out.length > 200) return out;
  if (k === 0) { if (Math.abs(total) < 1e-6) out.push(acc.slice()); return out; }
  const usable = widths.filter(w => w <= maxW);
  if (!usable.length) return out;
  const hi = usable[0], lo = usable[usable.length - 1];
  if (total > hi * k + 1e-6 || total < lo * k - 1e-6) return out;
  for (const w of usable) { acc.push(w); _partitions(total - w, widths, k - 1, w, acc, out); acc.pop(); }
  return out;
}

// → [{ boxes:[36,36,30], filler:3 }, …] best first
function solveGap(gap, widths) {
  widths = [...new Set(widths)].sort((a, b) => b - a);
  const minW = widths[widths.length - 1];
  const g16 = Math.round(gap * 16);
  const results = [];
  // Every width here is a multiple of 3", so the filler must make up gap mod 3
  // (or be 0 / 3 when the gap is already a multiple of 3). Sixteenths avoid float drift.
  const rem = g16 % 48;
  const fillers16 = rem === 0 ? [0, 48] : [rem];
  for (const f16 of fillers16) {
    const boxTotal = (g16 - f16) / 16, filler = f16 / 16;
    if (boxTotal < minW - 1e-6) continue;
    const kMin = Math.ceil(boxTotal / widths[0] - 1e-9);
    for (let k = kMin; k <= kMin + 1 && k <= 12; k++) {
      _partitions(boxTotal, widths, k).forEach(boxes => results.push({ boxes, filler }));
    }
  }
  // Fewer boxes → no filler → bigger boxes first
  results.sort((a, b) => a.boxes.length - b.boxes.length || (a.filler > 0) - (b.filler > 0)
    || b.boxes.map(x => String(x).padStart(3, '0')).join('').localeCompare(a.boxes.map(x => String(x).padStart(3, '0')).join('')));
  const seen = new Set(), picked = [];
  for (const r of results) {
    const key = r.boxes.join('+') + '|' + r.filler;
    if (seen.has(key)) continue;
    seen.add(key); picked.push(r);
    if (picked.length === 3) break;
  }
  // Too small for any cabinet (or no exact combo): one filler exactly the gap's width
  if (!picked.length && gap >= FILLER_MIN) picked.push({ boxes: [], filler: Math.round(gap * 16) / 16 });
  return picked;
}

// ════════════════════════════
// PLACING A SOLUTION
// ════════════════════════════
// Which end of the gap the filler goes on: the end against a wall or the next run's
// corner (that's where door/handle clearance is needed). If both ends are against
// cabinets on this wall, it goes on the right.
function fillerSide(r, wall, band, a, b) {
  const onWall = wallItems(r, wall).filter(i => rangesOverlap(itemVerticalRange(i), band));
  const touchesCab = x => onWall.some(i => Math.abs((i.offset || 0) + i.width - x) < 0.02 || Math.abs((i.offset || 0) - x) < 0.02);
  const leftFree = !touchesCab(a), rightFree = !touchesCab(b);
  if (leftFree && !rightFree) return 'left';
  if (rightFree && !leftFree) return 'right';
  return a < 0.02 || !rightFree ? 'left' : 'right';
}
function planGapPieces(r, wall, band, a, b, type, sol) {
  const upper = band[0] >= 48;
  const side = fillerSide(r, wall, band, a, b);
  const seq = [];
  if (sol.filler > 0 && side === 'left') seq.push({ filler: true, width: sol.filler });
  sol.boxes.forEach(w => seq.push({ filler: false, width: w }));
  if (sol.filler > 0 && side === 'right') seq.push({ filler: true, width: sol.filler });
  let pos = a;
  return seq.map(p => {
    const entry = p.filler ? { isCab: true, type: 'filler3', width: p.width } : { isCab: true, type, width: p.width };
    const it = makePaletteItem(entry, wall, pos);
    it.width = p.width;
    if (p.filler && upper) { it.wallBottom = band[0]; it.height = defaultCabHeight('wall', r); it.depth = 12; }
    pos += p.width;
    return it;
  });
}

// ════════════════════════════
// DIALOG
// ════════════════════════════
const FILL_TYPES = { base: ['base', 'drawerBase', 'sink', 'vanity'], upper: ['wall'] };
let _fill = null;

function openFillGap(wall, level, a, b) {
  const r = activeRoom(); if (!r) return;
  _fill = { wall, level, a, b, band: LEVEL_BANDS[level], type: FILL_TYPES[level][0] };
  let ov = document.getElementById('modal-fill-gap');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'modal-fill-gap'; ov.className = 'modal-overlay hidden';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Fill this gap');
    ov.innerHTML = `<div class="modal" style="max-width:520px;">
        <h3>Fill this gap</h3>
        <div id="fill-gap-where" class="form-hint" style="margin-bottom:10px;"></div>
        <label class="form-group" style="display:block;"><span style="font-size:12px;font-weight:600;color:var(--text-muted);">Cabinet type</span>
          <select id="fill-gap-type" class="cp-select" onchange="_fill.type = this.value; renderFillOptions()"></select></label>
        <div id="fill-gap-options"></div>
        <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal('modal-fill-gap')">Cancel</button></div>
      </div>`;
    ov.addEventListener('click', e => { if (e.target === ov) ov.classList.add('hidden'); });
    document.body.appendChild(ov);
  }
  document.getElementById('fill-gap-where').textContent =
    `${fmtFrac(b - a)} open on the ${wallName(r, wall)} (${level === 'upper' ? 'upper' : 'base'} run), from ${fmtFrac(a)} to ${fmtFrac(b)}.`;
  document.getElementById('fill-gap-type').innerHTML = FILL_TYPES[level].map(t => `<option value="${t}">${escHtml(CATALOG[t].label)}</option>`).join('');
  renderFillOptions();
  openModal('modal-fill-gap');
}
function renderFillOptions() {
  const r = activeRoom(), f = _fill; if (!r || !f) return;
  const sols = solveGap(f.b - f.a, CATALOG[f.type].widths);
  const box = document.getElementById('fill-gap-options');
  f.plans = sols.map(sol => planGapPieces(r, f.wall, f.band, f.a, f.b, f.type, sol))
    .filter(pieces => pieces.every(it => !placementIssue(r, it)));   // never offer something that won't fit
  if (!f.plans.length) { box.innerHTML = '<div class="form-hint">No exact fit with this cabinet type. Try another type, or drag pieces in from the Catalog.</div>'; return; }
  const total = f.b - f.a;
  box.innerHTML = f.plans.map((pieces, i) => {
    const bar = pieces.map(p => `<span class="fill-seg${isFiller(p.type) ? ' fill-seg-filler' : ''}" style="flex:${p.width} 0 0;" title="${escHtml(itemLabel(p))}">${p.width >= 9 ? escHtml(itemLabel(p)) : ''}</span>`).join('');
    const text = pieces.map(p => isFiller(p.type) ? `${fmtFrac(p.width)} filler` : itemLabel(p)).join(' + ');
    const nBoxes = pieces.filter(p => !isFiller(p.type)).length;
    return `<div class="fill-option">
        <div class="fill-bar" style="width:100%;">${bar}</div>
        <div class="fill-option-row"><div><strong>${escHtml(text)}</strong><div class="form-hint">${nBoxes} cabinet${nBoxes === 1 ? '' : 's'}${pieces.some(p => isFiller(p.type)) ? ' + filler' : ''} = exactly ${fmtFrac(total)}</div></div>
        <button class="btn btn-primary" onclick="applyFillPlan(${i})">Use this</button></div>
      </div>`;
  }).join('');
}
function applyFillPlan(i) {
  const r = activeRoom(), f = _fill; if (!r || !f || !f.plans[i]) return;
  const pieces = f.plans[i];
  closeModal('modal-fill-gap');
  pieces.forEach(it => { it.itemNum = nextItemNum(r); r.cabinets.push(it); });   // one burst → one undo step
  persist(); renderCutList(); refreshPlacementOffsets();
  if (state.viewMode === '3d') renderIsometric();
  selectItem(pieces[pieces.length - 1].id);
  if (typeof showMoveTip === 'function') showMoveTip(`Filled ${fmtFrac(f.b - f.a)} with ${pieces.length} piece${pieces.length === 1 ? '' : 's'}`);
}

// Side-panel list of open stretches on the active wall, each with a Fill… button
function openSpaceListHTML(r, wall) {
  if (!wallFrame(r, wall)) return '';
  const rows = [];
  [['base', 'Base run'], ['upper', 'Upper run']].forEach(([level, label]) => {
    wallOpenSpans(r, wall, LEVEL_BANDS[level]).filter(([a, b]) => b - a >= FILLER_MIN).forEach(([a, b]) => {
      rows.push(`<div class="open-space-row"><div><strong>${fmtFrac(b - a)}</strong> open · ${label}<div class="cab-dim">${fmtFrac(a)} – ${fmtFrac(b)} from left</div></div>
        <button class="btn btn-secondary open-space-fill" onclick="openFillGap('${wall}','${level}',${a},${b})">Fill…</button></div>`);
    });
  });
  return rows.length ? '<div class="cab-wall-header">Open space</div>' + rows.join('') : '';
}
