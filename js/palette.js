// My Cabinet Planner — js/palette.js
// Searchable catalog palette: drag a cabinet or appliance onto a wall in the floor plan
// or elevation (snaps to wall ends and neighbours, ghost preview, invalid spots in red),
// or click a tile to add it to the end of the active wall's run. Build Plan task 2.2.
// Also home of placementIssue(), the one "can this go here?" check.
// Loaded by app.html as a classic script (shared global scope). Load order matters —
// see the <script> list at the bottom of app.html.

// ════════════════════════════
// PLACEMENT RULES
// ════════════════════════════
// Returns null if the item can sit where it is, or a short reason it can't.
function placementIssue(r, item) {
  if (!item.wall || !wallFrame(r, item.wall)) return 'Drop it next to a wall';
  const len = wallLength(r, item.wall), off = item.offset || 0;
  if (off < -0.01 || off + item.width > len + 0.01) return 'Runs past the end of the wall';
  const vr = itemVerticalRange(item);
  const hits = overlappingItems(r, item.wall, vr, off, item.width, item.id);
  if (hits.length) return 'Overlaps ' + hits.map(itemLabel).join(', ');
  // Footprint against the runs on the neighbouring walls (inside corners)
  const a = itemRect(r, item);
  const corner = roomItems(r).find(i => i.id !== item.id && i.wall && i.wall !== item.wall && rangesOverlap(itemVerticalRange(i), vr)
    && (b => b && a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01)(itemRect(r, i)));
  if (corner) return 'Hits ' + itemLabel(corner) + ' in the corner';
  // Doors and windows on this wall
  const blocked = (r.openings || []).find(o => {
    if (o.wall !== item.wall || !(off < o.offset + o.width - 0.01 && o.offset < off + item.width - 0.01)) return false;
    if (o.type === 'door' || o.type === 'arch') return rangesOverlap(vr, [0, o.height]);
    if (o.type === 'window') { const sill = o.sillHeight ?? 36; return rangesOverlap(vr, [sill, sill + o.height]); }
    return false;
  });
  if (blocked) return 'Blocks the ' + (OPENING_LABELS[blocked.type] || 'opening').toLowerCase();
  return null;
}

// Snap an offset to wall ends, the edges of neighbours on this wall, and the edge of the
// run coming in from the next wall — so pieces butt up without typing numbers.
function snapCandidates(r, item) {
  const f = wallFrame(r, item.wall); if (!f) return [];
  const len = wallLength(r, item.wall), w = item.width, vr = itemVerticalRange(item);
  const cands = [0, len - w];
  wallItems(r, item.wall).filter(i => i.id !== item.id && rangesOverlap(itemVerticalRange(i), vr))
    .forEach(i => { cands.push((i.offset || 0) + i.width, (i.offset || 0) - w); });
  // Neighbouring runs, projected onto this wall
  roomItems(r).filter(i => i.wall && i.wall !== item.wall && rangesOverlap(itemVerticalRange(i), vr)).forEach(i => {
    const b = itemRect(r, i); if (!b) return;
    const along = [[b.x, b.y], [b.x + b.w, b.y + b.h]].map(([x, y]) => (x - f.start[0]) * f.dir[0] + (y - f.start[1]) * f.dir[1]);
    cands.push(Math.max(...along), Math.min(...along) - w);
  });
  return cands;
}
function snapPlacementOffset(r, item, off) {
  if (!wallFrame(r, item.wall)) return off;
  const w = item.width, cands = snapCandidates(r, item);
  let best = null, bestD = 6.01; // snap distance, inches
  cands.forEach(c => { const d = Math.abs(c - off); if (d < bestD) { bestD = d; best = c; } });
  const snapped = best != null ? best : Math.round(off / 3) * 3;
  if (!placementIssue(r, { ...item, offset: snapped })) return snapped;
  // The spot under the pointer is taken — slide to the nearest open snap point if one is
  // close (within ~half the cabinet's width), so a slightly-off drop still lands cleanly.
  const reach = Math.max(12, w * 0.6);
  const open = cands.filter(c => Math.abs(c - off) <= reach && !placementIssue(r, { ...item, offset: c }))
    .sort((a, b) => Math.abs(a - off) - Math.abs(b - off));
  return open.length ? open[0] : snapped;
}

const lcFirst = t => t.charAt(0).toLowerCase() + t.slice(1); // "Overlaps B18" → "overlaps B18"

// Inches as a tape-measure string: 12, 12 3/8, 0 1/8 (nearest 1/8")
function fmtFrac(v) {
  const neg = v < 0; v = Math.round(Math.abs(v) * 8) / 8;
  const whole = Math.floor(v), eighths = Math.round((v - whole) * 8);
  const frac = eighths ? (eighths % 4 === 0 ? '1/2' : eighths % 2 === 0 ? (eighths / 2) + '/4' : eighths + '/8') : '';
  return (neg ? '-' : '') + (whole || !frac ? whole : '') + (whole && frac ? ' ' : '') + frac + '"';
}

// ════════════════════════════
// MOVING PLACED ITEMS (Build Plan 2.3)
// ════════════════════════════
// Where a dragged item should go for a pointer position `raw` (inches along its wall).
// Snaps to neighbours/wall ends within 3", otherwise whole inches. If that spot is taken it
// stops flush against whatever is in the way (it never overlaps); drag past the obstacle
// into open space and it hops over. Items already sitting somewhere invalid (older
// projects) move freely so they can be fixed.
function resolveMoveOffset(r, item, raw) {
  const cur = item.offset || 0;
  const ok = off => !placementIssue(r, { ...item, offset: off });
  const cands = snapCandidates(r, item);
  const near = cands.filter(c => Math.abs(c - raw) <= 3).sort((a, b) => Math.abs(a - raw) - Math.abs(b - raw))[0];
  const target = near != null ? near : Math.round(raw);
  if (!ok(cur) || ok(target)) return target;
  const lo = Math.min(cur, target), hi = Math.max(cur, target);
  const stops = cands.filter(c => c >= lo - 0.01 && c <= hi + 0.01 && ok(c));
  stops.push(cur);
  return stops.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
}
function showMoveTip(text, bad) {
  const t = document.getElementById('drag-tooltip'); if (!t) return;
  t.textContent = text; t.style.display = 'block'; t.style.background = bad ? '#b91c1c' : '#1e293b';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.style.display = 'none'; t.style.background = '#1e293b'; }, 1400);
}

// Arrow keys nudge the selected item: 1", Shift = 1/8", Alt/Option = 3".
// Arrows follow what you see: in the floor plan an item on the east wall moves with
// Up/Down; in a mirrored elevation (south/west) Right still moves it to the right on screen.
function nudgeSelected(key, shift, alt) {
  const r = activeRoom(), it = getSelectedItem(); if (!r || !it) return false;
  const step = alt ? 3 : shift ? 0.125 : 1;
  const v = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
  if (r.islands && r.islands.includes(it)) {            // islands move freely inside the room
    if (state.viewMode !== 'floor') return false;
    const { w, h } = roomSize(r);
    it.x = Math.max(0, Math.min(w - it.width, it.x + v[0] * step));
    it.y = Math.max(0, Math.min(h - it.depth, it.y + v[1] * step));
    persist(); renderCanvas(); renderCabinetList();
    showMoveTip(`${it.label || 'Island'} · ${fmtFrac(it.x)}, ${fmtFrac(it.y)} from NW`);
    return true;
  }
  let sign = 0;
  if (state.viewMode === 'elevation') {
    if (it.wall !== state.elevWall) return false;
    sign = v[0] * ((it.wall === 'south' || it.wall === 'west') ? -1 : 1);
  } else if (state.viewMode === 'floor') {
    const f = wallFrame(r, it.wall); if (!f) return false;
    sign = v[0] * f.dir[0] + v[1] * f.dir[1];
  }
  if (!sign) return false;                               // arrow across the wall: nothing to do
  const cur = it.offset || 0;
  let next = Math.round((cur + sign * step) * 8) / 8;
  const issue = placementIssue(r, { ...it, offset: next });
  if (issue && !placementIssue(r, it)) {
    // Step would collide: go as far as possible — flush against the wall end or neighbour
    const lo = Math.min(cur, next), hi = Math.max(cur, next);
    const stop = snapCandidates(r, it).filter(c => c > lo - 0.001 && c < hi + 0.001 && Math.abs(c - cur) > 0.001 && !placementIssue(r, { ...it, offset: c }))
      .sort((a, b) => Math.abs(a - next) - Math.abs(b - next))[0];
    if (stop == null) { showMoveTip(`Can't move: ${lcFirst(issue)}`, true); return true; }
    next = stop;
  }
  it.offset = next;
  persist(); renderCanvas(); renderCabinetList();
  if (state.viewMode === 'elevation') renderElevation();
  showMoveTip(`${itemLabel(it)} · ${fmtFrac(next)} from left`);
  return true;
}
document.addEventListener('keydown', e => {
  if (!e.key.startsWith('Arrow') || !selectedItemId) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
  if (document.querySelector('.modal-overlay:not(.hidden)') || document.getElementById('item-popover')) return;
  if (e.metaKey || e.ctrlKey) return;
  if (nudgeSelected(e.key, e.shiftKey, e.altKey)) e.preventDefault();
});

// ════════════════════════════
// PALETTE
// ════════════════════════════
const PALETTE_CATEGORIES = [
  { id: 'base',   label: 'Base',              types: ['base', 'sink', 'drawerBase', 'vanity'] },
  { id: 'wall',   label: 'Wall',              types: ['wall'] },
  { id: 'tall',   label: 'Tall',              types: ['tall'] },
  { id: 'corner', label: 'Corner',            types: ['cornerBase', 'lazysusan', 'diagWall'] },
  { id: 'fill',   label: 'Fillers & Panels',  types: ['filler3', 'filler6', 'fridgePanel'] },
  { id: 'app',    label: 'Appliances',        types: Object.keys(APPLIANCES) },
];
let paletteCategory = 'all';

function paletteEntries() {
  const out = [];
  PALETTE_CATEGORIES.forEach(cat => cat.types.forEach(type => {
    const isCab = !!CATALOG[type], def = isCab ? CATALOG[type] : APPLIANCES[type];
    def.widths.forEach(w => out.push({
      cat: cat.id, type, width: w, isCab, color: def.color,
      code: def.abbr + (w >= 1 ? w : ''),
      label: `${def.label} ${w >= 1 ? w + '"' : ''}`.trim(),
    }));
  }));
  return out;
}
function renderPalette() {
  const box = document.getElementById('palette-items'); if (!box) return;
  const q = (document.getElementById('palette-search')?.value || '').trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const list = paletteEntries().filter(e =>
    (paletteCategory === 'all' || e.cat === paletteCategory) &&
    words.every(wd => (e.code + ' ' + e.label + ' ' + e.type).toLowerCase().includes(wd)));
  document.querySelectorAll('#palette-cats [data-cat]').forEach(b => b.classList.toggle('active', b.dataset.cat === paletteCategory));
  box.innerHTML = list.length ? list.map((e, i) =>
    `<button type="button" class="palette-tile" data-i="${i}" title="${escHtml(e.label)} — drag onto a wall, or click to add it to the end of the active wall">
       <span class="palette-swatch" style="background:${e.color}"></span><span class="palette-code">${escHtml(e.code)}</span>
     </button>`).join('')
    : '<div class="palette-empty">Nothing matches. Try "B36", "sink" or "30".</div>';
  box._entries = list;
}
function setPaletteCategory(id) { paletteCategory = id; renderPalette(); }

// A new cabinet/appliance record for a palette entry (same fields the Add forms create)
function makePaletteItem(entry, wall, offset) {
  const r = activeRoom();
  if (entry.isCab) {
    const cat = CATALOG[entry.type], upper = entry.type === 'wall' || entry.type === 'diagWall';
    return { id: uid(), type: entry.type, wall, width: entry.width, height: defaultCabHeight(entry.type, r),
      depth: entry.type === 'diagWall' ? (entry.width === 24 ? 24 : 15) : cat.depth, note: '', offset,
      wallBottom: upper ? 54 : null, glassDoors: false, styleOverride: null, itemNum: null };
  }
  const acat = APPLIANCES[entry.type];
  return { id: uid(), type: entry.type, wall, width: entry.width, height: acat.height, note: '', offset,
    customElevBottom: null, price: null, itemNum: null };
}
function commitPaletteItem(item) {
  const r = activeRoom(); if (!r) return;
  item.itemNum = nextItemNum(r);
  (CATALOG[item.type] ? r.cabinets : (r.appliances = r.appliances || [])).push(item);
  persist(); renderCutList(); refreshPlacementOffsets();
  if (state.viewMode === '3d') renderIsometric();
  selectItem(item.id);
}

// Click a tile: add it to the end of the active wall's run (or say why it won't fit)
function paletteQuickAdd(entry) {
  const r = activeRoom(); if (!r) return;
  const item = makePaletteItem(entry, state.activeWall, 0);
  item.offset = nextFreeOffset(r, state.activeWall, itemLevel(item));
  if (placementIssue(r, item)) {
    // e.g. the start of the wall is filled by the corner of the next run: take the first
    // open snap point from the end of this run onward
    const spot = snapCandidates(r, item).filter(c => c >= item.offset - 0.01).sort((a, b) => a - b)
      .find(c => !placementIssue(r, { ...item, offset: c }));
    if (spot != null) item.offset = spot;
  }
  const issue = placementIssue(r, item);
  if (issue) { paletteToast(`${entry.code} doesn't fit at the end of this wall: ${lcFirst(issue)}. Drag it to a spot instead.`, true); return; }
  commitPaletteItem(item);
}

// ── Drag and drop onto the floor plan / elevation ───────────────────────────
let placementGhost = null;    // { item, issue } while dragging over a view
let _pDrag = null;

function floorPlacement(entry, clientX, clientY) {
  const r = activeRoom(), g = vpGeom.floor; if (!r || !g) return null;
  const c = document.getElementById('floor-plan').getBoundingClientRect(), z = vpState.floor.zoom;
  const px = ((clientX - c.left) / z - g.originX) / g.scale, py = ((clientY - c.top) / z - g.originY) / g.scale;
  const walls = ['north', 'south', 'east', 'west', ...(getLShapeData(r) ? ['step1', 'step2'] : [])];
  let best = null;
  walls.forEach(w => {
    const f = wallFrame(r, w); if (!f) return;
    const t = (px - f.start[0]) * f.dir[0] + (py - f.start[1]) * f.dir[1];
    const d = (px - f.start[0]) * f.inward[0] + (py - f.start[1]) * f.inward[1];
    if (d < -18 || d > 48 || t < -24 || t > f.length + 24) return;   // must be near this wall
    if (!best || Math.abs(d) < Math.abs(best.d)) best = { w, t, d };
  });
  if (!best) return { item: makePaletteItem(entry, null, 0), issue: 'Drop it next to a wall' };
  const item = makePaletteItem(entry, best.w, 0);
  item.offset = snapPlacementOffset(r, item, best.t - item.width / 2);
  return { item, issue: placementIssue(r, item) };
}
function elevPlacement(entry, clientX) {
  const r = activeRoom(), g = vpGeom.elev; if (!r || !g) return null;
  const wall = state.elevWall, len = wallLength(r, wall);
  const c = document.getElementById('elevation-plan').getBoundingClientRect(), z = vpState.elev.zoom;
  let x = ((clientX - c.left) / z - g.originX) / g.scale;
  if (wall === 'south' || wall === 'west') x = len - x;   // these elevations are drawn mirrored
  const item = makePaletteItem(entry, wall, 0);
  item.offset = snapPlacementOffset(r, item, x - item.width / 2);
  return { item, issue: placementIssue(r, item) };
}
function placementAt(entry, clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  if (state.viewMode === 'floor' && el && el.closest('#fp-viewport')) return floorPlacement(entry, clientX, clientY);
  if (state.viewMode === 'elevation' && el && el.closest('#elev-viewport')) return elevPlacement(entry, clientX);
  return null;
}
function redrawForGhost() {
  if (state.viewMode === 'floor') renderCanvas();
  else if (state.viewMode === 'elevation') renderElevation();
}

function _paletteDown(e) {
  const tile = e.target.closest('.palette-tile'); if (!tile || e.button > 0) return;
  const entry = document.getElementById('palette-items')._entries[+tile.dataset.i];
  _pDrag = { entry, x0: e.clientX, y0: e.clientY, dragging: false, chip: null, raf: 0 };
  try { tile.setPointerCapture(e.pointerId); } catch (_) {} // keeps touch drags flowing; harmless if unsupported
  e.preventDefault();
}
function _paletteMove(e) {
  if (!_pDrag) return;
  if (!_pDrag.dragging) {
    if (Math.abs(e.clientX - _pDrag.x0) + Math.abs(e.clientY - _pDrag.y0) < 5) return;
    _pDrag.dragging = true;
    const chip = document.createElement('div');
    chip.className = 'palette-drag-chip';
    chip.textContent = _pDrag.entry.code;
    document.body.appendChild(chip);
    _pDrag.chip = chip;
    if (state.viewMode === '3d') paletteToast('Switch to Floor Plan or Elevation to drop onto a wall.', false);
  }
  _pDrag.chip.style.left = (e.clientX + 14) + 'px';
  _pDrag.chip.style.top  = (e.clientY + 14) + 'px';
  const pos = { x: e.clientX, y: e.clientY };
  cancelAnimationFrame(_pDrag.raf);
  _pDrag.raf = requestAnimationFrame(() => {
    if (!_pDrag) return;
    placementGhost = placementAt(_pDrag.entry, pos.x, pos.y);
    _pDrag.chip.classList.toggle('bad', !!(placementGhost && placementGhost.issue));
    _pDrag.chip.textContent = _pDrag.entry.code + (placementGhost ? (placementGhost.issue ? ' — ' + placementGhost.issue : ' @ ' + placementGhost.item.offset + '"') : '');
    redrawForGhost();
  });
}
function _paletteUp(e) {
  if (!_pDrag) return;
  const d = _pDrag; _pDrag = null;
  cancelAnimationFrame(d.raf);
  if (d.chip) d.chip.remove();
  if (!d.dragging) { paletteQuickAdd(d.entry); return; }   // a click, not a drag
  const g = placementAt(d.entry, e.clientX, e.clientY);
  placementGhost = null;
  if (g && !g.issue) commitPaletteItem(g.item);
  else { redrawForGhost(); if (g) paletteToast(`Can't place ${d.entry.code} there: ${lcFirst(g.issue)}.`, true); }
}
function cancelPaletteDrag() {
  if (!_pDrag) return;
  if (_pDrag.chip) _pDrag.chip.remove();
  _pDrag = null; placementGhost = null; redrawForGhost();
}

// Ghost drawing, called by the renderers
function drawGhostBox(ctx, x, y, w, h, bad, label) {
  ctx.save();
  ctx.fillStyle = bad ? 'rgba(220,38,38,0.28)' : 'rgba(15,118,110,0.28)';
  ctx.strokeStyle = bad ? '#dc2626' : '#0f766e'; ctx.lineWidth = 2; ctx.setLineDash([5, 3]);
  ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]); ctx.fillStyle = bad ? '#991b1b' : '#115e59';
  ctx.font = '700 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.restore();
}
function drawFloorGhost(ctx, r, scale, RX, RY) {
  const g = placementGhost; if (!g || !g.item.wall) return;
  const rc = itemRect(r, g.item); if (!rc) return;
  drawGhostBox(ctx, RX + rc.x * scale, RY + rc.y * scale, rc.w * scale, rc.h * scale, !!g.issue, itemLabel(g.item));
}
function drawElevGhost(ctx, r, wall, scale, floorY, eX) {
  const g = placementGhost; if (!g || g.item.wall !== wall) return;
  const [bottom, top] = itemVerticalRange(g.item);
  drawGhostBox(ctx, eX(g.item.offset, g.item.width), floorY - top * scale, g.item.width * scale, (top - bottom) * scale, !!g.issue, itemLabel(g.item));
}

let _toastTimer = 0;
function paletteToast(msg, bad) {
  const t = document.getElementById('drag-tooltip'); if (!t) return;
  t.textContent = msg; t.style.display = 'block'; t.style.background = bad ? '#b91c1c' : '#1e293b';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.style.display = 'none'; t.style.background = '#1e293b'; }, 2600);
}

(function initPalette() {
  const box = document.getElementById('palette-items'); if (!box) return;
  box.addEventListener('pointerdown', _paletteDown);
  window.addEventListener('pointermove', _paletteMove);
  window.addEventListener('pointerup', _paletteUp);
  window.addEventListener('pointercancel', cancelPaletteDrag);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && _pDrag) { e.stopPropagation(); cancelPaletteDrag(); } }, true);
  document.getElementById('palette-search')?.addEventListener('input', renderPalette);
  renderPalette();
})();
