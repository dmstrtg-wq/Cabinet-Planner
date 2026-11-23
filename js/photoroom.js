// My Cabinet Planner — js/photoroom.js
// Room from a picture (Build Plan 5.4, Dan 2026-11-22): New Project / Add Room → "From a
// picture". The picture (a sketch or floor plan with measurements, or a phone photo of the
// room) goes to netlify/functions/room-from-photo.js, which describes the room's corners,
// walls, doors and windows, cabinet runs and islands. A review screen shows what was read:
// lengths that were estimated are highlighted to measure, every cabinet can be left out.
// Only "Build the room" changes anything; the room is then a reshaped room like a drawn one
// (room model v2), so Edit walls and corners works on it.
// Open to every signed-in account (free accounts get a few pictures a day; the server counts).
// Loaded by app.html as a classic script, after anglejoints.js.

const PHOTO = { file: {}, job: null };
const PHOTO_MAX_SIDE = 1600, PHOTO_MAX_PDF = 4 * 1024 * 1024;

function photoFileChosen(prefix) {
  const f = document.getElementById(`${prefix}-photo-file`).files[0];
  PHOTO.file[prefix] = f || null;
  document.getElementById(`${prefix}-photo-name`).textContent = f ? f.name : '';
}
// Whether this person can use it; says why not
function photoAllowed() {
  if (READ_ONLY) return false;
  if (!currentUser || IS_DEMO) { alert('Create a free account to turn a picture into a room. It only takes a minute. You can draw the room in the meantime.'); return false; }
  return true;
}
// The picture as base64: photos shrunk to 1600 px on the long side (JPEG), PDFs as they are
function photoPayload(file) {
  return new Promise((resolve, reject) => {
    if (file.type === 'application/pdf') {
      if (file.size > PHOTO_MAX_PDF) { reject(new Error('That PDF is too large. Please use one under 4 MB, or a picture of the page.')); return; }
      const rd = new FileReader();
      rd.onload = () => resolve({ mediaType: 'application/pdf', data: String(rd.result).split(',')[1] });
      rd.onerror = () => reject(new Error("We couldn't open that file."));
      rd.readAsDataURL(file); return;
    }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve({ mediaType: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.86).split(',')[1] });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("We couldn't open that picture. Please use a JPEG or PNG (on an iPhone, a screenshot of the photo works).")); };
    img.src = url;
  });
}

// ── Start: the room exists already (a placeholder); read the picture, then review ──
async function startRoomFromPhoto(room, file, prevRoomId, isNewProject) {
  PHOTO.job = { roomId: room.id, prevRoomId, isNewProject, result: null };
  photoModal(`<h3>Reading your picture…</h3>
    <p style="font-size:14px;color:#475569;">This usually takes 20 to 40 seconds. We're finding the walls, measurements, doors, windows and cabinets.</p>
    <div class="photo-spinner" aria-hidden="true"></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="cancelRoomFromPhoto()">Cancel</button></div>`);
  try {
    const payload = await photoPayload(file);
    const { data: sess } = await db.auth.getSession();
    const token = sess && sess.session && sess.session.access_token;
    const kind = (activeRoom() && activeRoom().kind) || 'kitchen';
    const res = await fetch('/.netlify/functions/room-from-photo', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ requestId: 'rp-' + uid() + uid(), kind, ...payload }),
    });
    const out = await res.json().catch(() => ({}));
    if (!PHOTO.job || PHOTO.job.roomId !== room.id) return;          // cancelled while reading
    if (!res.ok || !out.room) throw new Error(out.error || 'Something went wrong reading the picture. Please try again.');
    if (out.room.picture_kind === 'not_a_room' || !(out.room.corners || []).length) {
      throw new Error(((out.room.notes || [])[0] || "We couldn't find a room in that picture.") + ' You can draw the room instead.');
    }
    PHOTO.job.result = out.room; PHOTO.job.left = out.left;
    renderPhotoReview();
  } catch (e) {
    if (!PHOTO.job || PHOTO.job.roomId !== room.id) return;
    photoModal(`<h3>We couldn't build the room from that picture</h3>
      <p style="font-size:14px;color:#475569;">${escHtml(e.message)}</p>
      <div class="modal-footer"><button class="btn btn-secondary" onclick="cancelRoomFromPhoto()">Close</button>
      <button class="btn btn-primary" onclick="photoDrawInstead()">Draw the room instead</button></div>`);
  }
}
function photoModal(html) {
  let el = document.getElementById('modal-photo-room');
  if (!el) {
    el = document.createElement('div'); el.id = 'modal-photo-room'; el.className = 'modal-overlay hidden';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Room from a picture');
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="modal" style="width:640px;max-width:96vw;">${html}</div>`;
  openModal('modal-photo-room');
}
function _photoRoom() { const p = activeProj(); return p && PHOTO.job ? p.rooms.find(x => x.id === PHOTO.job.roomId) : null; }
// Cancel: a new project keeps its usual starting rectangle; an added room goes away again
function cancelRoomFromPhoto() {
  const p = activeProj(), r = _photoRoom(), job = PHOTO.job; PHOTO.job = null;
  closeModal('modal-photo-room');
  if (r && job && !job.isNewProject && p.rooms.length > 1) {
    p.rooms = p.rooms.filter(x => x !== r);
    state.activeRoomId = p.rooms.some(x => x.id === job.prevRoomId) ? job.prevRoomId : p.rooms[p.rooms.length - 1].id;
  }
  persist(); renderRoomTabs(); renderWallButtons(); renderAll();
}
function photoDrawInstead() {
  const r = _photoRoom(), job = PHOTO.job; PHOTO.job = null; closeModal('modal-photo-room');
  if (!r) return;
  r.walls = { north: 360, south: 360, east: 360, west: 360 }; r.shape = 'rect'; delete r.lCut; delete r.outline; r._drawing = true;
  startRoomDraw(r, job && !job.isNewProject ? job.prevRoomId : null);
}

// ── Review ──
const PHOTO_TYPE_LABEL = t => t === 'filler' ? 'Filler' : (CATALOG[t] ? CATALOG[t].label : APPLIANCES[t] ? APPLIANCES[t].label : t);
// Corners from the wall lengths (as edited), keeping each wall's direction; the last wall closes the room
function photoCorners(res, lengths) {
  const C = res.corners, n = C.length, pts = [[C[0].x, C[0].y]];
  for (let k = 0; k < n - 1; k++) {
    const a = C[k], b = C[(k + 1) % n], L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const len = lengths[k] > 0 ? lengths[k] : L, p = pts[k];
    pts.push([p[0] + (b.x - a.x) / L * len, p[1] + (b.y - a.y) / L * len]);
  }
  return pts;
}
// Which side of each wall is the room: +1 when the corners go clockwise as drawn (y down), else −1
function photoTurn(pts) { let a = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }); return a >= 0 ? 1 : -1; }
function photoWallName(pts, k) {
  const n = pts.length, a = pts[k], b = pts[(k + 1) % n], t = photoTurn(pts);
  return compassOf(t * (b[1] - a[1]), -t * (b[0] - a[0]));   // the way the wall faces out of the room
}
function renderPhotoReview() {
  const res = PHOTO.job.result, n = res.corners.length;
  const lengths = (res.walls || []).map(w => w.length_in);
  PHOTO.job.lengths = lengths.slice();
  const pts = photoCorners(res, lengths);
  const anyEstimated = (res.walls || []).some(w => !w.measured);
  const wallRows = (res.walls || []).map((w, k) => `<tr class="${w.measured ? '' : 'photo-est'}">
      <td>${k + 1}</td><td>${escHtml(compassFacing(pts, k))}</td>
      <td><input class="cp-input" id="photo-len-${k}" value="${fmtFrac(Math.round(w.length_in * 8) / 8).replace('"', '')}" inputmode="decimal" aria-label="Wall ${k + 1} length in inches" oninput="photoPreview()" ${k === n - 1 ? 'disabled title="The last wall closes the room"' : ''}> in</td>
      <td>${w.kind === 'open' ? 'Open' : w.kind === 'half' ? 'Half wall' : 'Wall'}</td>
      <td>${k === n - 1 ? 'Closes the room' : w.measured ? 'From the picture' : 'Estimated: please measure'}</td></tr>`).join('');
  let idx = 0;
  const items = [];
  (res.runs || []).forEach((run, ri) => (run.items || []).forEach((it, ii) => { items.push({ ri, ii, run, it, id: idx++ }); }));
  const itemRows = items.map(x => `<label class="photo-item"><input type="checkbox" id="photo-item-${x.id}" checked>
      <b>${escHtml(x.it.code || PHOTO_TYPE_LABEL(x.it.type))}</b> <span>${escHtml(PHOTO_TYPE_LABEL(x.it.type))}, ${fmtFrac(x.it.width_in)} wide${x.it.note ? ', ' + escHtml(x.it.note) : ''}</span>
      <span class="photo-item-wall">Wall ${x.run.wall + 1}, ${x.run.level}</span></label>`).join('');
  PHOTO.job.items = items;
  photoModal(`<h3>Here's what we read</h3>
    <p style="font-size:13px;color:#475569;margin:0 0 10px;">Check the walls and cabinets, then build the room. You can change everything afterward.${anyEstimated ? ' <b>Highlighted lengths were estimated: measure them before you rely on the plan.</b>' : ''}</p>
    <canvas id="photo-preview" width="600" height="300" class="photo-preview" aria-label="The room as read from the picture"></canvas>
    <table class="photo-walls"><thead><tr><th>#</th><th>Faces</th><th>Length</th><th>Type</th><th></th></tr></thead><tbody>${wallRows}</tbody></table>
    ${items.length ? `<div class="photo-section">Cabinets and appliances (${items.length})</div><div class="photo-items">${itemRows}</div>` : ''}
    ${(res.islands || []).length ? `<div class="photo-section">Islands</div><p style="font-size:13px;margin:0;">${res.islands.map(i => `${fmtFrac(i.width_in)} × ${fmtFrac(i.depth_in)}${i.note ? ' (' + escHtml(i.note) + ')' : ''}`).join('; ')}</p>` : ''}
    ${(res.notes || []).length ? `<div class="photo-section">Notes</div><ul class="photo-notes">${res.notes.map(t => `<li>${escHtml(t)}</li>`).join('')}</ul>` : ''}
    <div id="photo-warn" class="photo-warn" style="display:none;"></div>
    <div id="photo-err" style="color:#b91c1c;font-size:13px;min-height:18px;"></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="cancelRoomFromPhoto()">Cancel</button>
      <button class="btn btn-primary" onclick="buildRoomFromPhoto()">Build the room</button></div>
    ${PHOTO.job.left != null ? `<p class="form-hint" style="text-align:right;margin:6px 0 0;">${PHOTO.job.left} more ${PHOTO.job.left === 1 ? 'picture' : 'pictures'} today.</p>` : ''}`);
  photoPreview();
}
function compassFacing(pts, k) { return photoWallName(pts, k); }
function _photoLengths() {
  const res = PHOTO.job.result;
  return (res.walls || []).map((w, k) => { const el = document.getElementById(`photo-len-${k}`); const v = el ? parseInches(el.value) : NaN; return v > 0 ? v : w.length_in; });
}
// The little drawing: the outline as edited, wall numbers, and the runs along each wall
function photoPreview() {
  const cv = document.getElementById('photo-preview'); if (!cv || !PHOTO.job) return;
  const res = PHOTO.job.result, pts = photoCorners(res, _photoLengths()), g = cv.getContext('2d');
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  (res.islands || []).forEach(i => { xs.push(i.x - i.width_in / 2, i.x + i.width_in / 2); ys.push(i.y - i.depth_in / 2, i.y + i.depth_in / 2); });
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const s = Math.min((cv.width - 40) / Math.max(1, maxX - minX), (cv.height - 40) / Math.max(1, maxY - minY));
  const P = q => [20 + (q[0] - minX) * s, 20 + (q[1] - minY) * s];
  g.clearRect(0, 0, cv.width, cv.height); g.fillStyle = '#F8FAFC'; g.fillRect(0, 0, cv.width, cv.height);
  g.beginPath(); pts.forEach((q, i) => { const [x, y] = P(q); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
  g.fillStyle = '#fff'; g.fill();
  pts.forEach((q, k) => {
    const b = pts[(k + 1) % pts.length], w = (res.walls || [])[k] || {}, [ax, ay] = P(q), [bx, by] = P(b);
    g.strokeStyle = w.kind === 'open' ? '#94A3B8' : w.measured === false ? '#D97706' : '#1E293B'; g.lineWidth = w.kind === 'half' ? 2 : 3;
    g.setLineDash(w.kind === 'open' ? [6, 5] : []); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); g.setLineDash([]);
    // runs: a band just inside the wall
    const L = Math.hypot(b[0] - q[0], b[1] - q[1]) || 1, dir = [(b[0] - q[0]) / L, (b[1] - q[1]) / L], tn = photoTurn(pts), inn = [-dir[1] * tn, dir[0] * tn];   // into the room
    (res.runs || []).filter(rn => rn.wall === k).forEach(rn => {
      let t = rn.start_offset_in || 0;
      const deep = rn.level === 'upper' ? 12 : 24;
      (rn.items || []).forEach(it => {
        t += Math.max(0, +it.gap_before_in || 0);
        const t0 = t, t1 = t + (it.width_in || 0); t = t1;
        const c = [[t0, 0], [t1, 0], [t1, deep], [t0, deep]].map(([u, v]) => P([q[0] + dir[0] * u + inn[0] * v, q[1] + dir[1] * u + inn[1] * v]));
        g.beginPath(); c.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
        g.fillStyle = rn.level === 'upper' ? 'rgba(147,197,253,0.35)' : CATALOG[it.type] ? 'rgba(59,130,246,0.55)' : 'rgba(100,116,139,0.6)'; g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1; g.stroke();
      });
    });
    const [mx, my] = P([(q[0] + b[0]) / 2, (q[1] + b[1]) / 2]);
    g.fillStyle = '#0f766e'; g.beginPath(); g.arc(mx, my, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(k + 1), mx, my);
  });
  (res.islands || []).forEach(i => {
    const [cx, cy] = P([i.x, i.y]); g.save(); g.translate(cx, cy); g.rotate((i.rotation_deg || 0) * Math.PI / 180);
    g.fillStyle = 'rgba(217,119,6,0.5)'; g.fillRect(-i.width_in / 2 * s, -i.depth_in / 2 * s, i.width_in * s, i.depth_in * s); g.restore();
  });
  const warn = document.getElementById('photo-warn');
  if (warn) {
    const shallow = photoTooShallow(res, pts);
    warn.style.display = shallow ? '' : 'none';
    warn.textContent = shallow ? `The room looks too shallow for its cabinets: there's less than 3 feet of floor in front of wall ${shallow}. The line along the cabinet fronts may have been read as a wall. Fix the wall lengths, or choose Cancel and draw the room instead.` : '';
  }
  // a last wall far off its read direction means the lengths don't close the room
  const err = document.getElementById('photo-err');
  if (err) {
    const C = res.corners, n = C.length, a = C[n - 1], b = C[0], d0 = Math.atan2(b.y - a.y, b.x - a.x);
    const p = pts[n - 1], q = pts[0], d1 = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const off = Math.abs(((d1 - d0 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * 180 / Math.PI;
    err.textContent = off > 3 ? "These lengths don't close the room squarely. Check them; the last wall will be set to whatever closes it." : '';
  }
}

// The first wall (1-based) with base or tall cabinets but less than 36" of floor in front of them, or 0
function photoTooShallow(res, pts) {
  const n = pts.length, tn = photoTurn(pts);
  const inside = (x, y) => { let c = false; for (let i = 0, j = n - 1; i < n; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  for (const rn of res.runs || []) {
    if (rn.level === 'upper' || !(rn.items || []).length || rn.wall < 0 || rn.wall >= n) continue;
    const a = pts[rn.wall], b = pts[(rn.wall + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const dir = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], inn = [-dir[1] * tn, dir[0] * tn];
    let t = rn.start_offset_in || 0, t0 = null;
    rn.items.forEach(it => { t += Math.max(0, +it.gap_before_in || 0); if (t0 == null) t0 = t; t += +it.width_in || 0; });
    const mid = Math.min(L - 1, Math.max(1, (t0 + t) / 2)), reach = 24 + 36;
    if (!inside(a[0] + dir[0] * mid + inn[0] * reach, a[1] + dir[1] * mid + inn[1] * reach)) return rn.wall + 1;
  }
  return 0;
}

// ── Build ──
function buildRoomFromPhoto() {
  const r = _photoRoom(); if (!r || !PHOTO.job) return;
  const res = PHOTO.job.result, pts = photoCorners(res, _photoLengths()), n = pts.length;
  // The outline: wall k runs from corner k to corner k+1, as read
  const corners = pts.map((q, i) => ({ id: 'c' + (i + 1), x: Math.round(q[0] * 1000) / 1000, y: Math.round(q[1] * 1000) / 1000 }));
  const walls = corners.map((c, i) => {
    const w = { id: 'w' + (i + 1), from: c.id, to: corners[(i + 1) % n].id, kind: ((res.walls || [])[i] || {}).kind || 'full' };
    if (w.kind === 'half') w.height = 42;
    return w;
  });
  const o = { fromLegacy: false, corners, walls };
  const bad = shapeProblem(o); if (bad) { document.getElementById('photo-err').textContent = bad + ' Please check the wall lengths.'; return; }
  r.outline = o; outlineChanged(o);
  const startOf = {}; walls.forEach(w => { startOf[w.id] = w.from; });   // the corner each wall was read from
  walls.forEach(w => _orientWall(r, w));
  // An offset measured from the wall's read start → the wall's own start (it may run the other way)
  const place = (wallId, pos, width) => {
    const w = walls.find(x => x.id === wallId), len = wallLength(r, wallId);
    return w.from === startOf[wallId] ? pos : len - pos - width;
  };
  r.cabinets = []; r.appliances = []; r.openings = []; r.islands = []; r.furniture = r.furniture || [];
  let num = 0;
  // Cabinets and appliances, in order along each wall
  const keep = new Set((PHOTO.job.items || []).filter(x => (document.getElementById(`photo-item-${x.id}`) || {}).checked).map(x => x.run.wall + ':' + (res.runs || []).indexOf(x.run) + ':' + x.ii));
  (res.runs || []).forEach((run, ri) => {
    const wallId = 'w' + (run.wall + 1); if (!walls.some(w => w.id === wallId)) return;
    let pos = run.start_offset_in || 0;
    const placed = [];
    (run.items || []).forEach((it, ii) => {
      pos += Math.max(0, +it.gap_before_in || 0);   // empty space drawn before this piece (uppers over a sink)
      const width = Math.max(0.75, +it.width_in || 0), here = pos; pos += width;
      if (!keep.has(run.wall + ':' + ri + ':' + ii)) return;
      const type = it.type === 'filler' ? 'filler3' : it.type;
      let piece;
      if (CATALOG[type]) {
        piece = makePaletteItem({ isCab: true, type, width }, wallId, 0);
        if (it.height_in && (CATALOG[type].heights || []).includes(+it.height_in)) piece.height = +it.height_in;
        if (isFiller(type) && run.level === 'upper') { piece.wallBottom = 54; piece.height = defaultCabHeight('wall', r); piece.depth = 12; }
        if (it.note) piece.note = it.note;
        r.cabinets.push(piece);
      } else if (APPLIANCES[type]) {
        piece = makePaletteItem({ isCab: false, type, width }, wallId, 0);
        if (it.note) piece.note = it.note;
        r.appliances.push(piece);
      } else return;
      piece.offset = Math.round(place(wallId, here, width) * 1000) / 1000;
      piece.itemNum = ++num;
      placed.push(piece);
    });
    // A run that runs into a corner cabinet (or the next wall's run) at either end: slide it clear by the
    // smallest standard amount that fixes every clash without pushing a piece off the wall
    const cornerHit = () => placed.some(pc => /in the corner/.test(placementIssue(r, pc) || ''));
    if (placed.length && cornerHit()) {
      const before = placed.map(pc => pc.offset);
      const ok = [12, 24, 36, -12, -24, -36].some(d => {
        placed.forEach((pc, i) => { pc.offset = Math.round((before[i] + d) * 1000) / 1000; });
        return !cornerHit() && !placed.some(pc => placementIssue(r, pc));
      });
      if (!ok) placed.forEach((pc, i) => { pc.offset = before[i]; });   // leave it outlined in red for the user
    }
  });
  // Doors, windows and openings
  (res.openings || []).forEach(op => {
    const wallId = 'w' + (op.wall + 1); if (!walls.some(w => w.id === wallId)) return;
    const type = op.type === 'opening' ? 'arch' : op.type, width = Math.max(12, +op.width_in || 30);
    r.openings.push({ id: uid(), type, wall: wallId, width, height: type === 'window' ? 40 : 80, offset: Math.max(0, place(wallId, +op.offset_in || 0, width)), sillHeight: type === 'window' ? 42 : 0 });
  });
  // Islands (turned ones keep their angle)
  (res.islands || []).forEach(i => {
    const w = Math.max(12, +i.width_in || 48), d = Math.max(12, +i.depth_in || 24);
    const isl = { id: uid(), width: Math.round(w), depth: Math.round(d), x: Math.round(i.x - w / 2), y: Math.round(i.y - d / 2), label: 'Island' };
    if (+i.rotation_deg) isl.rotation = ((+i.rotation_deg % 360) + 360) % 360;
    r.islands.push(isl);
  });
  shapeNormalize(r);
  const { w: W, h: H } = roomSize(r);
  r.walls = { north: W, south: W, east: H, west: H }; r.shape = 'rect'; delete r.lCut;   // (old fields: its overall size)
  r.fromPicture = { at: new Date().toISOString(), estimated: (res.walls || []).some(w => !w.measured) };
  PHOTO.job = null; closeModal('modal-photo-room');
  state.activeWall = walls[0].id; state.elevWall = walls[0].id;
  persist(); renderRoomTabs(); renderWallButtons(); renderAll(); if (typeof fitView === 'function') fitView('floor');
  const misfits = roomFitProblems(r).length + [...r.cabinets, ...r.appliances].filter(i => placementIssue(r, i)).length;
  showMoveTip(misfits ? `Room built. ${misfits} piece${misfits === 1 ? ' needs' : 's need'} a look (outlined in red).` : 'Room built from your picture. Check it against the room before you order.');
}
