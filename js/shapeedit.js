// My Cabinet Planner — js/shapeedit.js
// Room shape editor (Phase 4 step 4.1c, docs/ROOM-MODEL-V2.md). Works on a room that has
// switched over to the new room model (room.outline, js/roommodel.js):
//   • drag a corner (lengths snap to the inch, angles to 90° and 45°)
//   • click a wall: its exact length, full / half / open, add a corner in the middle
//   • click a corner: cut it at an angle, or remove it
// Cabinets, appliances and openings stay where they are in the room while walls change
// (their offsets are re-measured); anything that no longer fits gets the usual red outline
// and is never deleted. Every change ends in persist(), so Undo works.
// Loaded by app.html as a classic script, after roommodel.js.

const shapeEdit = { active: false, sel: null, drag: null };
const SHAPE_MIN_WALL = 6;   // inches

// ════════════════════════════
// GEOMETRY EDITS (all keep items in place)
// ════════════════════════════
function _wallItems(r, id) { return [...r.cabinets, ...(r.appliances || []), ...(r.openings || [])].filter(i => i.wall === id); }
// Remember where everything on the walls is, before an edit
function shapeSnapshot(r) {
  const o = r.outline, frames = {}, offs = {};
  o.walls.forEach(w => { frames[w.id] = outlineWallFrame(r, w.id); _wallItems(r, w.id).forEach(i => { offs[i.id] = i.offset || 0; }); });
  return { corners: JSON.parse(JSON.stringify(o.corners)), walls: JSON.parse(JSON.stringify(o.walls)), frames, offs };
}
// After an edit: each item is re-measured along its (possibly moved) wall so it stays put
function shapeRebase(r, snap, moved = {}) {
  outlineChanged(r.outline);
  [...r.cabinets, ...(r.appliances || []), ...(r.openings || [])].forEach(i => {
    const from = moved[i.id] || i.wall, f0 = snap.frames[from], f1 = outlineWallFrame(r, i.wall);
    if (!f0 || !f1 || snap.offs[i.id] == null) return;
    const px = f0.start[0] + f0.dir[0] * snap.offs[i.id], py = f0.start[1] + f0.dir[1] * snap.offs[i.id];
    i.offset = Math.round(((px - f1.start[0]) * f1.dir[0] + (py - f1.start[1]) * f1.dir[1]) * 1000) / 1000;
  });
}
function shapeRestore(r, snap) {
  r.outline.corners = JSON.parse(JSON.stringify(snap.corners)); r.outline.walls = JSON.parse(JSON.stringify(snap.walls));
  [...r.cabinets, ...(r.appliances || []), ...(r.openings || [])].forEach(i => { if (snap.offs[i.id] != null) i.offset = snap.offs[i.id]; });
  outlineChanged(r.outline);
}
// A usable room: every wall at least 6", no walls crossing
function shapeProblem(o) {
  const P = o.corners.map(c => [c.x, c.y]), n = P.length;
  if (n < 3) return 'A room needs at least three walls.';
  for (let i = 0; i < n; i++) if (Math.hypot(P[(i + 1) % n][0] - P[i][0], P[(i + 1) % n][1] - P[i][1]) < SHAPE_MIN_WALL - 1e-6) return `Every wall needs to be at least ${SHAPE_MIN_WALL}" long.`;
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;          // neighbours share a corner
    const a = P[i], b = P[(i + 1) % n], c = P[j], d = P[(j + 1) % n];
    if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return "Walls can't cross each other.";
  }
  return null;
}
// Keep the room's top-left at 0,0 (islands and furniture move with the room)
function shapeNormalize(r) {
  const o = r.outline, mx = Math.min(...o.corners.map(c => c.x)), my = Math.min(...o.corners.map(c => c.y));
  if (Math.abs(mx) < 1e-9 && Math.abs(my) < 1e-9) return;
  o.corners.forEach(c => { c.x -= mx; c.y -= my; });
  [...(r.islands || []), ...(r.furniture || [])].forEach(i => { i.x -= mx; i.y -= my; });
  outlineChanged(o);
}
// New walls run left to right as you face them (their elevation is never mirrored)
function _orientWall(r, w) { outlineChanged(r.outline); if (wallFlipped(r, w.id)) { const t = w.from; w.from = w.to; w.to = t; outlineChanged(r.outline); } }
function _newId(prefix, taken) { let k = 1; while (taken.has(prefix + k)) k++; return prefix + k; }
function _cornerWalls(o, cid) { return o.walls.filter(w => w.from === cid || w.to === cid); }
function _finishEdit(r, snap, moved) {
  const bad = shapeProblem(r.outline);
  if (bad) { shapeRestore(r, snap); showMoveTip(bad); renderAll(); return false; }
  shapeRebase(r, snap, moved); shapeNormalize(r);
  persist(); renderWallButtons(); renderAll();
  if (state.viewMode === '3d') renderIsometric();
  return true;
}

function shapeSetWallLength(r, wallId, len) {
  const o = r.outline, w = o.walls.find(x => x.id === wallId); if (!w || !(len >= SHAPE_MIN_WALL)) return;
  const snap = shapeSnapshot(r), f = snap.frames[wallId];
  const a = o.corners.find(c => c.id === w.from), b = o.corners.find(c => c.id === w.to);
  b.x = Math.round((a.x + f.dir[0] * len) * 1000) / 1000; b.y = Math.round((a.y + f.dir[1] * len) * 1000) / 1000;
  _finishEdit(r, snap);
}
function shapeSetWallKind(r, wallId, kind, height) {
  const w = r.outline.walls.find(x => x.id === wallId); if (!w) return;
  w.kind = kind; if (kind === 'half') w.height = Math.max(12, Math.min(r.ceilingHeight || 96, height || 42)); else delete w.height;
  outlineChanged(r.outline); persist(); renderWallButtons(); renderAll(); if (state.viewMode === '3d') renderIsometric();
}
// A corner in the middle of a wall: two walls, each keeping its items
function shapeSplitWall(r, wallId, t) {
  const o = r.outline, w = o.walls.find(x => x.id === wallId); if (!w) return;
  const snap = shapeSnapshot(r), f = snap.frames[wallId];
  if (t == null) t = f.length / 2;
  if (t < SHAPE_MIN_WALL || t > f.length - SHAPE_MIN_WALL) { showMoveTip(`That wall is too short to split.`); return; }
  const taken = new Set(o.corners.map(c => c.id)), cid = _newId('c', taken);
  const m = { id: cid, x: Math.round((f.start[0] + f.dir[0] * t) * 1000) / 1000, y: Math.round((f.start[1] + f.dir[1] * t) * 1000) / 1000 };
  // into the corner list between the wall's two corners (in the room's order)
  const ia = o.corners.findIndex(c => c.id === w.from), ib = o.corners.findIndex(c => c.id === w.to), n = o.corners.length;
  o.corners.splice((ia + 1) % n === ib ? ia + 1 : ib + 1, 0, m);
  const nw = { id: _newId('w', new Set(o.walls.map(x => x.id))), from: cid, to: w.to, kind: w.kind || 'full' };
  if (w.height) nw.height = w.height;
  w.to = cid; o.walls.splice(o.walls.indexOf(w) + 1, 0, nw);
  // items past the new corner move to the new wall
  const moved = {};
  _wallItems(r, wallId).forEach(i => { if ((i.offset || 0) + (i.width || 0) / 2 > t) { i.wall = nw.id; moved[i.id] = wallId; } });
  _orientWall(r, nw);
  _finishEdit(r, snap, moved);
}
// Cut a corner: it becomes a short angled wall, `d1` / `d2` back along its two walls
function shapeCutCorner(r, cid, d1, d2) {
  const o = r.outline, ws = _cornerWalls(o, cid); if (ws.length !== 2) return;
  const snap = shapeSnapshot(r), C = o.corners.find(c => c.id === cid), n = o.corners.length, ic = o.corners.indexOf(C);
  const prev = o.corners[(ic - 1 + n) % n], next = o.corners[(ic + 1) % n];
  const wPrev = ws.find(w => w.from === prev.id || w.to === prev.id), wNext = ws.find(w => w !== wPrev);
  const toward = (q, d) => { const L = Math.hypot(q.x - C.x, q.y - C.y); return { x: C.x + (q.x - C.x) / L * d, y: C.y + (q.y - C.y) / L * d, L }; };
  const p1 = toward(prev, d1), p2 = toward(next, d2);
  if (d1 < 1 || d2 < 1 || d1 > p1.L - SHAPE_MIN_WALL || d2 > p2.L - SHAPE_MIN_WALL) { showMoveTip('The cut has to leave at least 6" of each wall.'); return; }
  const taken = new Set(o.corners.map(c => c.id)), id1 = _newId('c', taken); taken.add(id1); const id2 = _newId('c', taken);
  const r3 = v => Math.round(v * 1000) / 1000;
  o.corners.splice(ic, 1, { id: id1, x: r3(p1.x), y: r3(p1.y) }, { id: id2, x: r3(p2.x), y: r3(p2.y) });
  [[wPrev, id1], [wNext, id2]].forEach(([w, nid]) => { if (w.from === cid) w.from = nid; else w.to = nid; });
  const cw = { id: _newId('w', new Set(o.walls.map(x => x.id))), from: id1, to: id2, kind: 'full' };
  o.walls.splice(o.walls.indexOf(wPrev) + 1, 0, cw);
  _orientWall(r, cw);
  _finishEdit(r, snap);
}
// Remove a corner: its two walls become one straight wall (items from both are kept on it)
function shapeRemoveCorner(r, cid) {
  const o = r.outline; if (o.corners.length <= 3) { showMoveTip('A room needs at least three walls.'); return; }
  const ws = _cornerWalls(o, cid); if (ws.length !== 2) return;
  const snap = shapeSnapshot(r), [keep, drop] = ws;
  const keepEnd = keep.from === cid ? 'from' : 'to', other = drop.from === cid ? drop.to : drop.from;
  keep[keepEnd] = other;
  o.walls.splice(o.walls.indexOf(drop), 1);
  o.corners = o.corners.filter(c => c.id !== cid);
  const moved = {};
  _wallItems(r, drop.id).forEach(i => { i.wall = keep.id; moved[i.id] = drop.id; });
  _finishEdit(r, snap, moved);
}

// ════════════════════════════
// EDIT MODE ON THE FLOOR PLAN
// ════════════════════════════
function startShapeEdit() {
  const r = activeRoom(); if (!r || READ_ONLY) return;
  if (!roomOutline(r) || !ownedOutline(r)) { takeOverRoom(r); }
  if (!ownedOutline(r)) return;
  closeModal('modal-room-shape');
  shapeEdit.active = true; shapeEdit.sel = null;
  if (state.viewMode !== 'floor') setViewMode('floor');
  let bar = document.getElementById('shape-edit-bar');
  if (!bar) {
    bar = document.createElement('div'); bar.id = 'shape-edit-bar'; bar.className = 'shape-edit-bar'; bar.setAttribute('role', 'status');
    bar.innerHTML = `<span>Editing the room's shape. Drag a corner, or click a wall or a corner for more options.</span>
      <button class="btn btn-primary" onclick="stopShapeEdit()">Done</button>`;
    (document.getElementById('fp-viewport') || document.body).appendChild(bar);
  }
  bar.style.display = '';
  renderCanvas();
}
function stopShapeEdit() {
  shapeEdit.active = false; shapeEdit.sel = null; shapeEdit.drag = null;
  const bar = document.getElementById('shape-edit-bar'); if (bar) bar.style.display = 'none';
  closeShapePopover(); renderAll();
}
// Pointer (client px) → room inches
function _shapePt(e) {
  const g = vpGeom.floor, c = document.getElementById('floor-plan').getBoundingClientRect(), z = vpState.floor.zoom;
  return { x: ((e.clientX - c.left) / z - g.originX) / g.scale, y: ((e.clientY - c.top) / z - g.originY) / g.scale, px: 1 / (g.scale * z) };
}
function _shapeHit(r, pt) {
  const o = ownedOutline(r); if (!o) return null;
  const near = 10 * pt.px;   // 10 screen pixels
  const c = o.corners.find(k => Math.hypot(k.x - pt.x, k.y - pt.y) <= near);
  if (c) return { kind: 'corner', id: c.id };
  let best = null;
  roomWallSegs(r).forEach(sg => {
    const dx = sg.b[0] - sg.a[0], dy = sg.b[1] - sg.a[1], L2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((pt.x - sg.a[0]) * dx + (pt.y - sg.a[1]) * dy) / L2));
    const d = Math.hypot(pt.x - sg.a[0] - t * dx, pt.y - sg.a[1] - t * dy);
    if (d <= 8 * pt.px && (!best || d < best.d)) best = { kind: 'wall', id: sg.id, d, t: t * Math.sqrt(L2) };
  });
  return best;
}
// Where a dragged corner lands: whole inches, then 90°/45° to its neighbours when close
function _shapeSnap(o, cid, x, y) {
  let p = [Math.round(x), Math.round(y)];
  const n = o.corners.length, i = o.corners.findIndex(c => c.id === cid);
  [o.corners[(i - 1 + n) % n], o.corners[(i + 1) % n]].forEach(nb => {
    const vx = p[0] - nb.x, vy = p[1] - nb.y, L = Math.hypot(vx, vy); if (L < 1) return;
    const ang = Math.atan2(vy, vx), step = Math.PI / 4, snapA = Math.round(ang / step) * step;
    if (Math.abs(ang - snapA) < 3 * Math.PI / 180) p = [Math.round((nb.x + Math.cos(snapA) * L) * 1000) / 1000, Math.round((nb.y + Math.sin(snapA) * L) * 1000) / 1000];
  });
  return p;
}
function shapeMouseDown(e) {
  if (!shapeEdit.active || e.button !== 0) return;
  const r = activeRoom(); const pt = _shapePt(e), hit = _shapeHit(r, pt);
  if (!hit) { closeShapePopover(); shapeEdit.sel = null; renderCanvas(); return; }   // background: let the view pan
  e.stopImmediatePropagation(); e.preventDefault();
  shapeEdit.sel = hit; closeShapePopover();
  if (hit.kind === 'corner') shapeEdit.drag = { cid: hit.id, snap: shapeSnapshot(r), sx: e.clientX, sy: e.clientY, moved: false };
  else openShapePopover(r, hit, e.clientX, e.clientY);
  renderCanvas();
}
function shapeMouseMove(e) {
  const d = shapeEdit.drag; if (!d) return;
  if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
  d.moved = true;
  const r = activeRoom(), o = r.outline, c = o.corners.find(k => k.id === d.cid), pt = _shapePt(e);
  [c.x, c.y] = _shapeSnap(o, d.cid, pt.x, pt.y);
  shapeRebase(r, d.snap);
  const tip = document.getElementById('drag-tooltip');
  if (tip) { const ws = _cornerWalls(o, d.cid).map(w => outlineWallFrame(r, w.id)).filter(Boolean);
    tip.style.display = 'block'; tip.style.background = '#1e293b'; tip.textContent = ws.map(f => fmtWallLen(f.length)).join(' · '); }
  renderCanvas();
}
function shapeMouseUp(e) {
  const d = shapeEdit.drag; if (!d) return;
  shapeEdit.drag = null;
  const tip = document.getElementById('drag-tooltip'); if (tip) tip.style.display = 'none';
  const r = activeRoom();
  if (!d.moved) { openShapePopover(r, { kind: 'corner', id: d.cid }, e.clientX, e.clientY); return; }
  _finishEdit(r, d.snap);
}
(function wireShapeEdit() {
  const cv = document.getElementById('floor-plan'); if (!cv) return;
  cv.addEventListener('mousedown', shapeMouseDown, true);       // capture: ahead of cabinet dragging
  window.addEventListener('mousemove', shapeMouseMove);
  window.addEventListener('mouseup', shapeMouseUp);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && shapeEdit.active) stopShapeEdit(); });
})();

// Drawn last on the floor plan while editing: corners as handles, the picked wall/corner highlighted
function drawShapeEditOverlay(ctx, r, scale, RX, RY) {
  if (!shapeEdit.active) return;
  const o = ownedOutline(r); if (!o) return;
  const P = (x, y) => [RX + x * scale, RY + y * scale];
  if (shapeEdit.sel && shapeEdit.sel.kind === 'wall') {
    const sg = roomWallSegs(r).find(s => s.id === shapeEdit.sel.id);
    if (sg) { ctx.save(); ctx.strokeStyle = '#D97706'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(...P(...sg.a)); ctx.lineTo(...P(...sg.b)); ctx.stroke(); ctx.restore(); }
  }
  o.corners.forEach(c => {
    const [x, y] = P(c.x, c.y), on = shapeEdit.sel && shapeEdit.sel.kind === 'corner' && shapeEdit.sel.id === c.id;
    ctx.save(); ctx.fillStyle = on ? '#D97706' : '#fff'; ctx.strokeStyle = '#0f766e'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
  });
}

// ════════════════════════════
// POPOVERS
// ════════════════════════════
function closeShapePopover() { const el = document.getElementById('shape-popover'); if (el) el.remove(); }
function openShapePopover(r, hit, cx, cy) {
  closeShapePopover();
  const o = r.outline, pop = document.createElement('div');
  pop.id = 'shape-popover'; pop.className = 'shape-popover'; pop.setAttribute('role', 'dialog');
  if (hit.kind === 'wall') {
    const w = o.walls.find(x => x.id === hit.id), f = outlineWallFrame(r, hit.id), kind = w.kind || 'full';
    pop.setAttribute('aria-label', 'Edit ' + wallName(r, hit.id));
    pop.innerHTML = `<div class="sp-title">${escHtml(wallName(r, hit.id))}</div>
      <label class="sp-row">Length <input id="sp-len" class="cp-input" value="${fmtFrac(Math.round(f.length * 8) / 8).replace('"', '')}" inputmode="decimal" aria-label="Wall length in inches"> in
        <button class="btn btn-secondary" onclick="spApplyLength('${w.id}')">Set</button></label>
      <div class="sp-hint">Moves the wall's far corner; the next wall follows.</div>
      <div class="sp-row" role="radiogroup" aria-label="Wall type">
        ${[['full', 'Full wall'], ['half', 'Half wall'], ['open', 'Open']].map(([k, l]) => `<label><input type="radio" name="sp-kind" value="${k}" ${k === kind ? 'checked' : ''} onchange="spApplyKind('${w.id}')"> ${l}</label>`).join('')}
      </div>
      <label class="sp-row" id="sp-h-row" style="${kind === 'half' ? '' : 'display:none'}">Height <input id="sp-h" class="cp-input" value="${w.height || 42}" inputmode="decimal" aria-label="Half wall height in inches" onchange="spApplyKind('${w.id}')"> in</label>
      <div class="sp-hint">Open: no wall here; the room opens to the rest of the house.</div>
      <div class="sp-actions"><button class="btn btn-secondary" onclick="spSplit('${w.id}', ${Math.round(hit.t || f.length / 2)})">Add a corner here</button>
        <button class="btn btn-secondary" onclick="closeShapePopover()">Close</button></div>`;
  } else {
    const ws = _cornerWalls(o, hit.id);
    pop.setAttribute('aria-label', 'Edit corner');
    pop.innerHTML = `<div class="sp-title">Corner</div>
      <div class="sp-hint">Cut it at an angle: how far back along each wall.</div>
      ${ws.map((w, k) => `<label class="sp-row">Along the ${escHtml(wallName(r, w.id))} <input id="sp-cut${k}" class="cp-input" value="24" inputmode="decimal" aria-label="Cut distance along the ${escHtml(wallName(r, w.id))} in inches"> in</label>`).join('')}
      <div class="sp-actions"><button class="btn btn-primary" onclick="spCut('${hit.id}')">Cut this corner</button>
        <button class="btn btn-secondary" onclick="spRemoveCorner('${hit.id}')" ${o.corners.length <= 3 ? 'disabled' : ''}>Remove this corner</button>
        <button class="btn btn-secondary" onclick="closeShapePopover()">Close</button></div>`;
  }
  pop.style.cssText = `position:fixed;z-index:9200;left:${Math.min(cx + 12, innerWidth - 300)}px;top:${Math.min(cy + 12, innerHeight - 260)}px;`;
  document.body.appendChild(pop);
}
function spApplyLength(id) {
  const v = parseInches(document.getElementById('sp-len').value);
  if (!(v >= SHAPE_MIN_WALL)) { showMoveTip(`Enter a length of at least ${SHAPE_MIN_WALL}".`); return; }
  shapeSetWallLength(activeRoom(), id, v); closeShapePopover();
}
function spApplyKind(id) {
  const k = (document.querySelector('input[name="sp-kind"]:checked') || {}).value || 'full';
  document.getElementById('sp-h-row').style.display = k === 'half' ? '' : 'none';
  shapeSetWallKind(activeRoom(), id, k, parseInches(document.getElementById('sp-h').value) || 42);
}
function spSplit(id, t) { closeShapePopover(); shapeSplitWall(activeRoom(), id, t); }
function spCut(cid) {
  const a = parseInches(document.getElementById('sp-cut0').value), b = parseInches(document.getElementById('sp-cut1').value);
  closeShapePopover(); shapeCutCorner(activeRoom(), cid, a, b);
}
function spRemoveCorner(cid) { closeShapePopover(); shapeRemoveCorner(activeRoom(), cid); }

// What sort of wall an item is on ('full' unless the room says otherwise)
function wallKind(r, wall) { const o = ownedOutline(r), w = o && o.walls.find(x => x.id === wall); return w ? (w.kind || 'full') : 'full'; }
