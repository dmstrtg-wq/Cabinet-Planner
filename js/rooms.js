// My Cabinet Planner — js/rooms.js
// Projects, rooms, L-shapes, wall geometry (wallFrame/itemRect), openings, cabinet/appliance/island forms, pricing toggle, style panel.
// Loaded by app.html as a classic script (shared global scope, same as when this was
// inline). Load order matters — see the <script> list at the bottom of app.html.

// ════════════════════════════
// PROJECT CRUD
// ════════════════════════════
// Room dimension fields: always pre-filled with real numbers, validated on submit.
// A blank or out-of-range field shows an error instead of quietly becoming 0 (which
// used to draw as a 48" room).
const ROOM_DIM_DEFAULTS = { north:120, south:120, east:96, west:96, ceiling:96 };
const ROOM_WALL_MIN = 12, ROOM_WALL_MAX = 1200, CEILING_MIN = 72, CEILING_MAX = 180;
function setRoomDimFields(prefix, d) {
  ['north','south','east','west','ceiling'].forEach(k => { document.getElementById(`${prefix}-${k}`).value = d[k]; });
  const err = document.getElementById(`${prefix}-dim-error`);
  if (err) { err.style.display = 'none'; err.textContent = ''; }
}
function readRoomDimFields(prefix) {
  const err = document.getElementById(`${prefix}-dim-error`);
  const labels = { north:'North wall', south:'South wall', east:'East wall', west:'West wall', ceiling:'Ceiling height' };
  const out = {}; let problem = null, badEl = null;
  for (const k of ['north','south','east','west','ceiling']) {
    const el = document.getElementById(`${prefix}-${k}`);
    const v = parseFloat(el.value);
    const [lo, hi] = k === 'ceiling' ? [CEILING_MIN, CEILING_MAX] : [ROOM_WALL_MIN, ROOM_WALL_MAX];
    if (el.value.trim() === '' || isNaN(v)) problem = `${labels[k]} is blank — enter a length in inches.`;
    else if (v < lo || v > hi) problem = `${labels[k]} must be between ${lo}" and ${hi}".`;
    if (problem) { badEl = el; break; }
    out[k] = Math.round(v * 8) / 8; // keep eighths, never silently round a real measurement to 0
  }
  if (problem) {
    if (err) { err.textContent = problem; err.style.display = 'block'; }
    badEl.focus();
    return null;
  }
  if (err) err.style.display = 'none';
  return { walls: { north: out.north, south: out.south, east: out.east, west: out.west }, ceilingHeight: out.ceiling };
}
function openNewProjectModal() {
  ['np-customer','np-phone','np-company','np-notes','np-address','np-city'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  setRoomDimFields('np', ROOM_DIM_DEFAULTS);
  document.getElementById('np-type').value = 'Kitchen';
  // Populate state dropdown if empty
  const sel = document.getElementById('np-state');
  if (sel.options.length <= 1) {
    US_STATES.forEach(([code,name]) => { const o=document.createElement('option'); o.value=code; o.textContent=`${name} (${code})`; sel.appendChild(o); });
  }
  sel.value = '';
  if (HOME_PRO) {   // homeowner mode (6.1): no customer/company fields — just the room
    document.getElementById('np-company').value = (window.HOME_LISTING && HOME_LISTING.company_name) || '';
    document.getElementById('np-title').textContent = 'Start your design';
    document.getElementById('np-create-btn').textContent = 'Start designing →';
    openModal('modal-new-project');
    return;
  }
  openModal('modal-new-project');
  setTimeout(() => document.getElementById('np-customer').focus(), 50);
}
function createProject() {
  const customer = HOME_PRO ? `My ${document.getElementById('np-type').value.toLowerCase()} design` : document.getElementById('np-customer').value.trim();
  if (!customer) { document.getElementById('np-customer').focus(); return; }
  const dims = readRoomDimFields('np'); if (!dims) return;
  const npType = document.getElementById('np-type').value;
  const room = {
    id: uid(), name: npType,
    kind: /bath|vanity/i.test(npType) ? 'bath' : /laundry/i.test(npType) ? 'laundry' : /other/i.test(npType) ? 'other' : 'kitchen',
    walls: dims.walls,
    ceilingHeight: dims.ceilingHeight,
    cabinets: [], openings: []
  };
  if (room.kind === 'bath' && document.getElementById('np-starter')?.checked) bathStarterLayout(room);
  const proj = {
    id: newId(), customer,
    phone:   document.getElementById('np-phone').value.trim(),
    company: document.getElementById('np-company').value.trim(),
    type:    document.getElementById('np-type').value,
    notes:   document.getElementById('np-notes').value.trim(),
    address: document.getElementById('np-address').value.trim(),
    city:    document.getElementById('np-city').value.trim(),
    state:   document.getElementById('np-state').value,
    style: getStyles()[0]?.code || 'AW', createdAt: Date.now(), rooms: [room], taxPct: null,   // null = company default rate
    status: 'Lead', activityLog: [],
    quoteLocked: false, lockedQuote: null, quoteHistory: []
  };
  state.projects.unshift(proj);
  persist();
  closeModal('modal-new-project');
  openProject(proj.id, room.id);
}
function openEditProjectModal() {
  const p = activeProj(); if (!p) return;
  document.getElementById('ep-customer').value = p.customer;
  document.getElementById('ep-phone').value    = p.phone   || '';
  document.getElementById('ep-company').value  = p.company || '';
  document.getElementById('ep-type').value     = p.type;
  document.getElementById('ep-address').value  = p.address || '';
  document.getElementById('ep-city').value     = p.city    || '';
  document.getElementById('ep-notes').value    = p.notes   || '';
  const sel = document.getElementById('ep-state');
  if (sel.options.length <= 1) {
    US_STATES.forEach(([code,name]) => { const o=document.createElement('option'); o.value=code; o.textContent=`${name} (${code})`; sel.appendChild(o); });
  }
  sel.value = p.state || '';
  openModal('modal-edit-project');
}
function saveEditProject() {
  const p = activeProj(); if (!p) return;
  p.customer = document.getElementById('ep-customer').value.trim() || p.customer;
  p.phone    = document.getElementById('ep-phone').value.trim();
  p.company  = document.getElementById('ep-company').value.trim();
  p.type     = document.getElementById('ep-type').value;
  p.address  = document.getElementById('ep-address').value.trim();
  p.city     = document.getElementById('ep-city').value.trim();
  p.state    = document.getElementById('ep-state').value;
  p.notes    = document.getElementById('ep-notes').value.trim();
  persist(); closeModal('modal-edit-project'); renderProjectView();
}
function deleteProject(id, e) {
  e.stopPropagation();
  if (!confirm('Delete this project?')) return;
  state.projects = state.projects.filter(p => p.id !== id);
  if (currentUser) {
    db.from('projects').delete().eq('id', id); // fire and forget
    // …and its 3D quote views in storage
    const folder = `${effectiveOwnerId}/${id}`;
    db.storage.from('quote-snapshots').list(folder).then(({ data }) => {
      if (data && data.length) db.storage.from('quote-snapshots').remove(data.map(f => `${folder}/${f.name}`));
    }).catch(() => {});
  }
  // Also drop it from this browser's copy, or it would come back on the next load.
  writeLocalProjects(readLocalProjects().filter(p => p.id !== id));
  if (state.activeProjectId === id) { state.activeProjectId = null; state.activeRoomId = null; showWelcome(); }
  renderSidebar();
}
let _ctxMenu = null;
function closeProjectMenu() {
  if (_ctxMenu) { _ctxMenu.remove(); _ctxMenu = null; }
  document.removeEventListener('click', closeProjectMenu);
}
function showProjectMenu(id, e) {
  e.stopPropagation();
  closeProjectMenu();
  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'project-ctx-menu';
  menu.innerHTML = `
    <button onclick="renameProject('${id}')">Rename</button>
    <button class="ctx-delete" onclick="deleteProject('${id}',_fakeEvent())">Delete</button>`;
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.style.left = rect.left + 'px';
  document.body.appendChild(menu);
  _ctxMenu = menu;
  // Adjust if off-screen right
  const mr = menu.getBoundingClientRect();
  if (mr.right > window.innerWidth - 8) menu.style.left = (window.innerWidth - mr.width - 8) + 'px';
  setTimeout(() => document.addEventListener('click', closeProjectMenu), 0);
}
function _fakeEvent() { return { stopPropagation: () => {} }; }
function renameProject(id) {
  closeProjectMenu();
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  const newName = prompt('Rename project:', p.customer);
  if (newName === null) return; // cancelled
  const trimmed = newName.trim();
  if (!trimmed) { alert('Project name cannot be empty.'); return; }
  p.customer = trimmed;
  persist();
  renderSidebar();
  // If this is the active project, update the header
  if (state.activeProjectId === id) renderProjectView();
}

// ════════════════════════════
// ROOM
// ════════════════════════════
// Room types with a starter layout (7.4): bathroom, living room (entertainment center),
// hallway (mudroom lockers). The option only shows for those.
const STARTER_TEXT = { bath: 'Start with a bathroom layout', living: 'Start with an entertainment center', hall: 'Start with a mudroom locker wall' };
function syncStarterOption(prefix) {
  const kindEl = document.getElementById(prefix === 'np' ? 'np-type' : 'ar-kind');
  const kind = prefix === 'np' ? (/bath|vanity/i.test(kindEl.value) ? 'bath' : '') : kindEl.value;
  const g = document.getElementById(prefix + '-starter-group'); if (g) g.style.display = STARTER_TEXT[kind] ? '' : 'none';
  const t = document.getElementById(prefix + '-starter-text'); if (t && STARTER_TEXT[kind]) t.textContent = STARTER_TEXT[kind];
}
function applyStarterLayout(r) {
  if (r.kind === 'bath') bathStarterLayout(r);
  else if (r.kind === 'living') livingStarterLayout(r);
  else if (r.kind === 'hall') hallStarterLayout(r);
}
// Entertainment center on the north wall (7.4b): a media base centred, open bookcases either
// side if they fit, and a TV over the base sized to it.
function livingStarterLayout(r) {
  let n = 0;
  const pick = (list, max) => list.filter(v => v <= max + 0.01).pop();
  const L = r.walls.north;
  const bw = L >= 150 ? 30 : L >= 108 ? 24 : 0;                       // bookcase each side
  const mb = pick(CATALOG.mediaBase.widths, Math.min(72, L - 2 * bw)); if (!mb) return;
  const x0 = (L - mb - 2 * bw) / 2;
  const cab = (type, width, offset, extra = {}) => ({ id: uid(), type, wall: 'north', width, offset, height: defaultCabHeight(type, r),
    depth: CATALOG[type].depth, note: '', wallBottom: null, glassDoors: false, styleOverride: null, itemNum: ++n, ...extra });
  r.cabinets = r.cabinets || []; r.appliances = r.appliances || [];
  if (bw) r.cabinets.push(cab('openTall', bw, x0), cab('openTall', bw, x0 + bw + mb));
  r.cabinets.push(cab('mediaBase', mb, x0 + bw, { height: 24 }));
  const tvW = pick(APPLIANCES.tv.widths, mb);
  if (tvW) r.appliances.push({ id: uid(), type: 'tv', wall: 'north', width: tvW, offset: x0 + bw + (mb - tvW) / 2, height: APPLIANCES.tv.heightFor(tvW),
    note: '', customElevBottom: 42, price: null, itemNum: ++n });
  r.cabinets.filter(c => needsHinge(c) && !c.hinge).forEach(c => { c.hinge = 'L'; });
}
// Mudroom locker wall on the north wall (7.4b): as many 18" lockers as fit (up to 4), centred
function hallStarterLayout(r) {
  const L = r.walls.north, count = Math.max(0, Math.min(4, Math.floor(L / 18))); if (!count) return;
  const x0 = (L - count * 18) / 2;
  r.cabinets = r.cabinets || [];
  for (let k = 0; k < count; k++) r.cabinets.push({ id: uid(), type: 'locker', wall: 'north', width: 18, offset: x0 + k * 18,
    height: defaultCabHeight('locker', r), depth: CATALOG.locker.depth, note: '', wallBottom: null, glassDoors: false, styleOverride: null, itemNum: k + 1, hinge: k % 2 ? 'R' : 'L' });
}
// A starter bathroom sized to the room (7.4): tub (or a shower if the end wall is too short)
// across the west wall; on the north wall a toilet with code clearance from the tub, then the
// vanity (double sink at 60"+), a mirror and two sconces over it, a cabinet over the toilet,
// and a linen tower if there's room. Everything is ordinary items — move, resize or delete.
function bathStarterLayout(r) {
  let n = 0;
  const cab = (type, wall, width, offset, extra = {}) => ({ id: uid(), type, wall, width, offset, height: defaultCabHeight(type, r),
    depth: CATALOG[type].depth, note: '', wallBottom: null, glassDoors: false, styleOverride: null, itemNum: ++n, ...extra });
  const app = (type, wall, width, offset, extra = {}) => ({ id: uid(), type, wall, width, offset, height: APPLIANCES[type].height,
    note: '', customElevBottom: null, price: null, itemNum: ++n, ...extra });
  const pick = (list, max) => list.filter(v => v <= max + 0.01).pop();
  r.cabinets = r.cabinets || []; r.appliances = r.appliances || [];
  const west = r.walls.west, north = r.walls.north;
  // Bathing: a tub that fits the end wall, else a 48" (or smaller) shower
  const tubW = west >= 59.9 && west <= 74 ? pick(APPLIANCES.tub.widths, west) : null;
  let bathDepth = 0;
  if (tubW) { r.appliances.push(app('tub', 'west', tubW, Math.max(0, (west - tubW) / 2))); bathDepth = APPLIANCES.tub.depth; }
  else { const sw = pick(APPLIANCES.shower.widths, Math.min(48, west)); if (sw) { r.appliances.push(app('shower', 'west', sw, 0, { depth: 36 })); bathDepth = 36; } }
  // Toilet: 15" from the tub/shower to its centre (code minimum), plus a little
  const toiletOff = bathDepth + 6;
  if (toiletOff + 20 <= north) r.appliances.push(app('toilet', 'north', 20, toiletOff));
  r.cabinets.push(cab('wall', 'north', 24, toiletOff - 2, { height: 30, depth: 12, wallBottom: 60 }));   // over-the-toilet cabinet
  // Vanity: 15" from the toilet's centre to the vanity's edge, as wide as fits (leave room for a linen tower if wide)
  const vOff = toiletOff + 10 + 15;
  const room4linen = north - vOff >= 60 + 18 ? 18 : 0;
  const vW = pick(CATALOG.vanity.widths, north - vOff - room4linen);
  if (vW) {
    const dbl = vW >= 60;
    r.cabinets.push(cab('vanity', 'north', vW, vOff, { sinks: dbl ? 2 : 1 }));
    // A mirror over each bowl. Sconces flank the mirrors when there's 7" beside them (and
    // stay inside the vanity's width); otherwise one sconce goes centred above the mirror.
    const bays = dbl ? [[vOff, vOff + vW / 2], [vOff + vW / 2, vOff + vW]] : [[vOff, vOff + vW]];
    const mirrors = bays.map(([a0, a1]) => {
      const bay = a1 - a0, mW = pick(APPLIANCES.mirror.widths, bay - 14) || pick(APPLIANCES.mirror.widths, bay - 2);
      if (!mW) return null;
      const m = app('mirror', 'north', mW, a0 + (bay - mW) / 2); r.appliances.push(m); return m;
    }).filter(Boolean);
    const lo = vOff - 1, hi = vOff + vW - 6;                          // where a sconce may go
    const spots = [];
    mirrors.forEach((m, k) => {
      const left = m.offset - 7, right = m.offset + m.width + 1;
      const next = mirrors[k + 1];
      if (left >= lo && (k === 0)) spots.push(left);
      if (next) { const mid = (m.offset + m.width + next.offset) / 2 - 3; if (next.offset - (m.offset + m.width) >= 7) spots.push(mid); }
      else if (right <= hi) spots.push(right);
    });
    if (spots.length >= mirrors.length + 1) spots.forEach(x => r.appliances.push(app('sconce', 'north', 6, x)));
    else mirrors.forEach(m => r.appliances.push(app('sconce', 'north', 6, m.offset + m.width / 2 - 3,
      { customElevBottom: itemVerticalRange(m)[1] + 3 })));
    if (room4linen) r.cabinets.push(cab('linenTall', 'north', 18, vOff + vW, { hinge: 'L' }));
  }
  r.cabinets.filter(c => needsHinge(c) && !c.hinge).forEach(c => { c.hinge = 'L'; });
}
function openAddRoomModal() {
  document.getElementById('ar-name').value = '';
  const k = document.getElementById('ar-kind'); if (k) k.value = 'kitchen';
  syncStarterOption('ar');
  setRoomDimFields('ar', ROOM_DIM_DEFAULTS);
  openModal('modal-add-room');
  setTimeout(() => document.getElementById('ar-name').focus(), 50);
}
function addRoom() {
  const p = activeProj(); if (!p) return;
  const arShape = document.querySelector('input[name="ar-shape"]:checked')?.value || 'rect';
  const dims = readRoomDimFields('ar'); if (!dims) return;
  const kind = document.getElementById('ar-kind')?.value || 'kitchen';
  const room = {
    id: uid(), name: document.getElementById('ar-name').value.trim() || ROOM_KINDS[kind] || 'Room',
    kind,
    shape: arShape,
    walls: dims.walls,
    ceilingHeight: dims.ceilingHeight,
    cabinets: [], openings: []
  };
  if (arShape === 'L') {
    room.lCut = {
      corner: document.getElementById('ar-corner').value,
      width:  parseInt(document.getElementById('ar-cut-width').value)  || 48,
      depth:  parseInt(document.getElementById('ar-cut-depth').value)  || 48,
    };
  }
  if (STARTER_TEXT[kind] && arShape !== 'L' && document.getElementById('ar-starter')?.checked) applyStarterLayout(room);
  p.rooms.push(room);
  state.activeRoomId = room.id;
  // Reset ar-shape radio to rect for next time
  document.getElementById('ar-shape-rect').checked = true;
  document.getElementById('ar-lcut-fields').style.display = 'none';
  persist(); closeModal('modal-add-room');
  renderRoomTabs(); renderWallButtons(); renderCabinetList(); renderCanvas();
}
function deleteRoom(roomId) {
  if (READ_ONLY) return;   // share link: view-only
  const p = activeProj();
  if (!p || p.rooms.length <= 1) { alert('A project must have at least one room.'); return; }
  if (!confirm('Delete this room and all its cabinets?')) return;
  p.rooms = p.rooms.filter(r => r.id !== roomId);
  state.activeRoomId = p.rooms[0].id;
  persist(); renderRoomTabs(); renderCabinetList(); renderCanvas();
}
function switchRoom(roomId) {
  state.activeRoomId = roomId; persist();
  // Reset to north if active wall doesn't exist on new room
  const nr = activeProj()?.rooms.find(r=>r.id===roomId);
  if (nr && !getLShapeData(nr) && (state.activeWall==='step1'||state.activeWall==='step2')) {
    state.activeWall = 'north';
  }
  refreshPlacementOffsets();
  renderRoomTabs(); renderWallButtons(); renderCabinetList(); renderCanvas();
}

// ════════════════════════════
// L-SHAPE ROOM HELPERS
// ════════════════════════════
function getLShapeData(r) {
  if (!r || r.shape !== 'L' || !r.lCut) return null;
  const { corner, width: cW, depth: cD } = r.lCut;
  const roomW = Math.max(r.walls.north, r.walls.south, 48);
  const roomH = Math.max(r.walls.east,  r.walls.west,  48);
  const w = Math.max(12, Math.min(cW, roomW - 24));
  const d = Math.max(12, Math.min(cD, roomH - 24));
  switch(corner) {
    case 'NE': return {
      corner, cutW:w, cutD:d,
      polygon: [[0,0],[roomW-w,0],[roomW-w,d],[roomW,d],[roomW,roomH],[0,roomH]],
      step1: { wall:'step1', label:'→ Inner', isVertical:true,  x:roomW-w, startY:0,      length:d, depthRight:true,  depthDown:false },
      step2: { wall:'step2', label:'↓ Inner', isVertical:false, y:d,       startX:roomW-w, length:w, depthRight:false, depthDown:true  },
    };
    case 'NW': return {
      corner, cutW:w, cutD:d,
      polygon: [[w,0],[roomW,0],[roomW,roomH],[0,roomH],[0,d],[w,d]],
      step1: { wall:'step1', label:'← Inner', isVertical:true,  x:w,       startY:0, length:d, depthRight:false, depthDown:false },
      step2: { wall:'step2', label:'↓ Inner', isVertical:false, y:d,       startX:0, length:w, depthRight:false, depthDown:true  },
    };
    case 'SE': return {
      corner, cutW:w, cutD:d,
      polygon: [[0,0],[roomW,0],[roomW,roomH-d],[roomW-w,roomH-d],[roomW-w,roomH],[0,roomH]],
      step1: { wall:'step1', label:'→ Inner', isVertical:true,  x:roomW-w, startY:roomH-d, length:d, depthRight:true,  depthDown:false },
      step2: { wall:'step2', label:'↑ Inner', isVertical:false, y:roomH-d, startX:roomW-w, length:w, depthRight:false, depthDown:false },
    };
    case 'SW': return {
      corner, cutW:w, cutD:d,
      polygon: [[0,0],[roomW,0],[roomW,roomH],[w,roomH],[w,roomH-d],[0,roomH-d]],
      step1: { wall:'step1', label:'← Inner', isVertical:true,  x:w,       startY:roomH-d, length:d, depthRight:false, depthDown:false },
      step2: { wall:'step2', label:'↑ Inner', isVertical:false, y:roomH-d, startX:0,       length:w, depthRight:false, depthDown:false },
    };
    default: return null;
  }
}

// ════════════════════════════
// WALL GEOMETRY — the one place that knows where a wall is and where an item on it sits
// ════════════════════════════
// Room coordinates are inches with (0,0) at the north-west corner, x to the east and
// y to the south (same as the floor plan; 3D uses the same numbers as x and z).
// A wall is: where its "from left" 0 is, which way offsets run along it, and which way
// is into the room. Every view positions items through wallFrame/itemRect, so adding
// new wall kinds later (angled walls, Phase 4) only means teaching wallFrame about them.
function roomSize(r) {
  return { w: Math.max(r.walls.north, r.walls.south, 48), h: Math.max(r.walls.east, r.walls.west, 48) };
}
function wallFrame(r, wall) {
  const { w: W, h: H } = roomSize(r);
  switch (wall) {
    case 'north': return { start: [0, 0], dir: [1, 0], inward: [0, 1],  length: r.walls.north };
    case 'south': return { start: [0, H], dir: [1, 0], inward: [0, -1], length: r.walls.south };
    case 'west':  return { start: [0, 0], dir: [0, 1], inward: [1, 0],  length: r.walls.west };
    case 'east':  return { start: [W, 0], dir: [0, 1], inward: [-1, 0], length: r.walls.east };
    case 'step1': case 'step2': {
      const ld = getLShapeData(r); if (!ld) return null;
      const sw = ld[wall];
      return sw.isVertical
        ? { start: [sw.x, sw.startY], dir: [0, 1], inward: [sw.depthRight ? 1 : -1, 0], length: sw.length }
        : { start: [sw.startX, sw.y], dir: [1, 0], inward: [0, sw.depthDown ? 1 : -1], length: sw.length };
    }
    default: return null;
  }
}
function itemDepth(item) {
  if (item.type === 'diagWall') return 12;    // diagonal corner uppers: 12" sides, always
  if (CATALOG[item.type]) return item.depth || CATALOG[item.type].depth;
  if (item.depth && APPLIANCES[item.type] && (APPLIANCES[item.type].depths || item.type === 'floatingShelf')) return item.depth;   // shelves, showers pick their depth
  return APPLIANCES[item.type]?.depth || 24;
}
// Floating shelves (7.3): a stack of `stack` shelves, `spacing` apart (bottom to bottom),
// each `height` thick. The stack's span is what other pieces can't overlap.
function shelfStack(item) {
  const n = Math.max(1, Math.min(6, Math.round(item.stack || 1)));
  return { n, spacing: n > 1 ? Math.max(4, item.spacing || 12) : 0, t: item.height || 2.5 };
}
function shelfFinish(item) { return SHELF_FINISHES[item.shelfFinish] ? item.shelfFinish : 'wood'; }
// Axis-aligned footprint of a wall item in room inches: { x, y, w, h }.
function itemRect(r, item, depth = itemDepth(item)) {
  const f = wallFrame(r, item.wall); if (!f) return null;
  const off = item.offset || 0, d0 = item.wallOffset || 0;                            // d0: brought out from the wall (7.1)
  const ax = f.start[0] + f.dir[0] * off + f.inward[0] * d0, ay = f.start[1] + f.dir[1] * off + f.inward[1] * d0;   // start along wall
  const bx = ax + f.dir[0] * item.width, by = ay + f.dir[1] * item.width;             // end along wall
  const cx = ax + f.inward[0] * depth,   cy = ay + f.inward[1] * depth;               // pushed into room
  const xs = [ax, bx, cx], ys = [ay, by, cy];
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// ════════════════════════════
// WALL OFFSET / BUMP-OUT (Build Plan 7.1)
// ════════════════════════════
// A cabinet can be brought out from the wall (cab.wallOffset, inches). The box keeps its
// normal depth; the gap behind it is cased in with filler on any side a neighbour doesn't
// already hide — e.g. a 12" upper over the fridge brought out 12" to sit flush with the
// 24" run. Corner units (lazy susan, diagonal corner wall) always sit against the wall.
function canBumpOut(cab) { return !!CATALOG[cab.type] && !['lazysusan', 'diagWall'].includes(cab.type); }
// → [{ cab, side: 'start'|'end', depth, height, bottom }]  depth = how far from the wall it runs
function casingPieces(r, cab) {
  const off = cab.wallOffset || 0;
  if (off <= 0.01 || !canBumpOut(cab) || isFiller(cab.type)) return [];
  const [bot, top] = itemVerticalRange(cab), len = wallLength(r, cab.wall);
  const a = cab.offset || 0, b = a + cab.width;
  const same = r.cabinets.filter(c => c.id !== cab.id && c.wall === cab.wall && rangesOverlap(itemVerticalRange(c), [bot, top]));
  const out = [];
  [['start', a], ['end', b]].forEach(([side, edge]) => {
    if (side === 'start' ? edge < 0.1 : edge > len - 0.1) return;                     // against the side wall
    const nb = same.find(c => side === 'start' ? Math.abs((c.offset || 0) + c.width - edge) < 0.1 : Math.abs((c.offset || 0) - edge) < 0.1);
    // A neighbour hides the gap as far out as it reaches (its own gap is cased on its far side)
    const hidden = nb ? (nb.wallOffset || 0) + itemDepth(nb) : 0;
    const depth = Math.round((off - hidden) * 16) / 16;
    if (depth > 0.01) out.push({ cab, side, depth, height: top - bot, bottom: bot });
  });
  return out;
}
// Where a casing piece sits in plan: a 3/4" strip just inside the cabinet's side, from
// where the neighbour stops hiding the gap out to the back of the box
function casingRect(r, pc) {
  const f = wallFrame(r, pc.cab.wall); if (!f) return null;
  const a = pc.cab.offset || 0, b = a + pc.cab.width, off = pc.cab.wallOffset || 0;
  const [t0, t1] = pc.side === 'start' ? [a, a + 0.75] : [b - 0.75, b];
  const P = (t, d) => [f.start[0] + f.dir[0] * t + f.inward[0] * d, f.start[1] + f.dir[1] * t + f.inward[1] * d];
  return rectOfPts([P(t0, off - pc.depth), P(t1, off - pc.depth), P(t0, off), P(t1, off)]);
}
// Cabinets as priced on a quote: the room's cabinets, plus the casing filler for any
// bumped-out ones (priced as filler stock, like any filler). Virtual — never saved.
function quoteCabinets(room) {
  const extra = [];
  room.cabinets.forEach(c => casingPieces(room, c).forEach(pc => extra.push({
    id: `${c.id}:case:${pc.side}`, type: 'filler3', wall: c.wall, width: pc.depth, height: pc.height,
    depth: 0.75, styleOverride: c.styleOverride || null, note: `Bump-out casing for ${itemLabel(c)}`, _casingFor: c.id,
  })));
  return room.cabinets.concat(extra);
}
// "Case in this fridge": a fridge end panel on each open side, and the uppers above it
// brought out flush with the 24" run. Returns a short summary for the toast.
function caseInFridge(r, fridge) {
  const did = [];
  const a = fridge.offset || 0, b = a + fridge.width, len = wallLength(r, fridge.wall);
  const panelH = defaultCabHeight('fridgePanel', r);
  let added = 0, blocked = 0;
  [a - 0.75, b].forEach(at => {
    const already = r.cabinets.some(c => c.type === 'fridgePanel' && c.wall === fridge.wall && Math.abs((c.offset || 0) - at) < 0.5);
    if (already || at < -0.01 || at + 0.75 > len + 0.01) return;      // panel there already, or the side wall
    const cand = { id: uid(), type: 'fridgePanel', wall: fridge.wall, width: 0.75, height: panelH, depth: CATALOG.fridgePanel.depth,
      note: '', offset: Math.round(at * 1000) / 1000, wallBottom: null, glassDoors: false, styleOverride: null, itemNum: nextItemNum(r) };
    if (!placementIssue(r, cand)) { r.cabinets.push(cand); added++; } else blocked++;
  });
  if (added) did.push(added === 2 ? 'end panels both sides' : 'end panel on one side');
  if (blocked) did.push(`no room for a panel on ${blocked === 2 ? 'either side' : 'one side'} (leave 3/4")`);
  r.cabinets.filter(c => c.wall === fridge.wall && itemLevel(c) === 'upper' && canBumpOut(c)
    && (c.offset || 0) < b - 0.5 && (c.offset || 0) + c.width > a + 0.5).forEach(u => {
    const want = Math.max(0, CATALOG.base.depth - itemDepth(u));
    if ((u.wallOffset || 0) !== want) { u.wallOffset = want; did.push(`${itemLabel(u)} brought out ${fmtFrac(want)}`); }
  });
  return did;
}

function renderWallButtons() {
  const r = activeRoom();
  const container = document.getElementById('wall-grid');
  if (!container) return;
  const ld = r ? getLShapeData(r) : null;
  const allWalls = [
    {id:'north', label:'↑ North'},
    {id:'east',  label:'→ East'},
    {id:'south', label:'↓ South'},
    {id:'west',  label:'← West'},
  ];
  if (ld) {
    allWalls.push({id:'step1', label: ld.step1.label + ' Wall'});
    allWalls.push({id:'step2', label: ld.step2.label + ' Wall'});
  }
  container.innerHTML = allWalls.map(w =>
    `<button class="wall-btn${w.id===state.activeWall?' active':''}" data-wall="${w.id}" onclick="selectWall('${w.id}')">${w.label}</button>`
  ).join('');
}

function toggleLCutFields(prefix) {
  const isL = document.querySelector(`input[name="${prefix}-shape"]:checked`)?.value === 'L';
  const fields = document.getElementById(`${prefix}-lcut-fields`);
  if (fields) fields.style.display = isL ? '' : 'none';
}

function openRoomShapeModal() {
  const r = activeRoom(); if (!r) return;
  const isL = r.shape === 'L';
  document.getElementById('rs-shape-rect').checked = !isL;
  document.getElementById('rs-shape-L').checked = isL;
  document.getElementById('rs-corner').value = r.lCut?.corner || 'NE';
  const roomW = Math.max(r.walls.north, r.walls.south, 48);
  const roomH = Math.max(r.walls.east,  r.walls.west,  48);
  document.getElementById('rs-cut-width').value = r.lCut?.width  || Math.round(roomW / 2);
  document.getElementById('rs-cut-depth').value = r.lCut?.depth  || Math.round(roomH / 2);
  document.getElementById('rs-lcut-fields').style.display = isL ? '' : 'none';
  document.getElementById('rs-name').value = r.name || '';
  setRoomDimFields('rs', { ...r.walls, ceiling: r.ceilingHeight || 96 });
  openModal('modal-room-shape');
}

function saveRoomShape() {
  const r = activeRoom(); if (!r) return;
  const dims = readRoomDimFields('rs'); if (!dims) return;
  const before = new Set(roomFitProblems(r).map(x => x.item.id));
  r.walls = dims.walls;
  r.ceilingHeight = dims.ceilingHeight;
  r.name = document.getElementById('rs-name').value.trim() || r.name;
  const isL = document.querySelector('input[name="rs-shape"]:checked')?.value === 'L';
  r.shape = isL ? 'L' : 'rect';
  if (isL) {
    r.lCut = {
      corner: document.getElementById('rs-corner').value,
      width:  parseInt(document.getElementById('rs-cut-width').value)  || 48,
      depth:  parseInt(document.getElementById('rs-cut-depth').value)  || 48,
    };
  } else {
    delete r.lCut;
  }
  if (!isL && (state.activeWall === 'step1' || state.activeWall === 'step2')) {
    state.activeWall = 'north';
  }
  persist(); closeModal('modal-room-shape');
  // Room size changed: every view and the quote redraw from the new numbers
  vpState.floor = { zoom: 1, panX: 0, panY: 0 }; vpState.elev = { zoom: 1, panX: 0, panY: 0 };
  if (iso3D) iso3D.initedCamera = false;
  renderRoomTabs(); renderWallButtons(); refreshPlacementOffsets(); renderAll();
  if (state.viewMode === '3d') resetIso3DView();
  const newProblems = roomFitProblems(r).filter(x => !before.has(x.item.id));
  if (newProblems.length) {
    alert(`${newProblems.length} item${newProblems.length === 1 ? '' : 's'} no longer fit${newProblems.length === 1 ? 's' : ''} and ${newProblems.length === 1 ? 'is' : 'are'} outlined in red:\n\n` +
      newProblems.map(x => `• #${x.item.itemNum || '?'} ${itemLabel(x.item)} on ${wallName(r, x.item.wall)}: ${x.reason}`).join('\n') +
      `\n\nNothing was deleted. Move, resize, or remove them when you're ready.`);
  }
}
function wallName(r, wall) {
  const ld = getLShapeData(r);
  if (wall === 'step1' || wall === 'step2') return ld ? ld[wall].label + ' wall' : 'inner wall';
  return wall.charAt(0).toUpperCase() + wall.slice(1) + ' wall';
}
function wallLength(r, wall) {
  if (wall === 'step1' || wall === 'step2') { const ld = getLShapeData(r); return ld ? ld[wall].length : 0; }
  return r.walls[wall] || 0;
}
// Items that don't fit the room as currently sized: past the end of their wall, or
// taller than the ceiling. Used to flag them (never to delete them).
function roomFitProblems(r) {
  if (!r) return [];
  const ceiling = r.ceilingHeight || 96;
  const out = [];
  [...r.cabinets, ...(r.appliances || [])].forEach(item => {
    const len = wallLength(r, item.wall);
    const end = (item.offset || 0) + item.width;
    if (end > len + 0.01) { out.push({ item, reason: `ends at ${end}" but the wall is ${len}"` }); return; }
    const top = itemVerticalRange(item)[1];
    if (top > ceiling + 0.01) out.push({ item, reason: `top is ${top}" but the ceiling is ${ceiling}"` });
  });
  return out;
}

// ════════════════════════════
// WALL / OPENING SELECTION
// ════════════════════════════
function selectWall(wall) {
  state.activeWall = wall;
  const r = activeRoom();
  const ld = r ? getLShapeData(r) : null;
  const labels = {north:'North', south:'South', east:'East', west:'West',
    step1: ld ? ld.step1.label + ' Wall' : 'Inner Wall 1',
    step2: ld ? ld.step2.label + ' Wall' : 'Inner Wall 2',
  };
  const lbl = labels[wall] || wall;
  document.querySelectorAll('.wall-btn').forEach(b => b.classList.toggle('active', b.dataset.wall === wall));
  document.getElementById('wall-list-label').textContent = lbl;
  document.getElementById('wall-add-label').textContent  = 'Add Cabinet — ' + lbl;
  refreshPlacementOffsets();
  renderCabinetList(); renderCanvas();
}
function selectElevWall(wall) {
  state.elevWall = wall;
  document.querySelectorAll('.elev-wall-tab').forEach(b => b.classList.toggle('active', b.dataset.wall === wall));
  renderElevation();
  fitView('elev'); // walls differ in length — re-center the new one
}
function selectOpeningType(type) {
  state.activeOpeningType = type;
  document.querySelectorAll('.opening-type-btn').forEach(b => b.classList.toggle('active', b.dataset.otype === type));
  document.getElementById('sill-height-row').style.display = type === 'window' ? 'flex' : 'none';
}

// ════════════════════════════
// OPENINGS
// ════════════════════════════
function addOpening() {
  const r = activeRoom(); if (!r) return;
  const w = parseInt(document.getElementById('opening-width').value)  || 0;
  const h = parseInt(document.getElementById('opening-height').value) || 0;
  const offset = parseInt(document.getElementById('opening-offset').value) || 0;
  if (!w || !h) { alert('Enter width and height for the opening.'); return; }
  if (!r.openings) r.openings = [];
  const sillHeight = parseInt(document.getElementById('opening-sill').value) || 36;
  r.openings.push({ id: uid(), type: state.activeOpeningType, wall: state.activeWall, width: w, height: h, offset, sillHeight });
  document.getElementById('opening-width').value  = '';
  document.getElementById('opening-height').value = '';
  document.getElementById('opening-offset').value = '0';
  document.getElementById('opening-sill').value   = '36';
  persist(); renderCabinetList(); renderCanvas(); renderElevation();
}
function removeOpening(id) {
  const r = activeRoom(); if (!r || !r.openings) return;
  r.openings = r.openings.filter(o => o.id !== id);
  persist(); renderCabinetList(); renderCanvas(); renderElevation();
}

// ════════════════════════════
// CABINET FORM
// ════════════════════════════
function onTypeChange() {
  const type = document.getElementById('cab-type').value;
  const ws = document.getElementById('cab-width');
  const hs = document.getElementById('cab-height-sel');
  ws.innerHTML = '<option value="">— Width —</option>';
  hs.innerHTML = '<option value="">— Height —</option>';
  hs.classList.add('hidden');
  // Fillers get free-typed width/height boxes instead of the size dropdowns
  const filler = isFiller(type);
  const wn = document.getElementById('cab-width-num'), hn = document.getElementById('cab-height-num');
  ws.classList.toggle('hidden', filler); wn.classList.toggle('hidden', !filler); hn.classList.toggle('hidden', !filler);
  if (!type) return;
  const cat = CATALOG[type];
  if (filler) { wn.value = cat.stock; hn.value = cat.heights[0]; }
  cat.widths.forEach(w => {
    const o = document.createElement('option'); o.value = w;
    o.textContent = `${w}" wide  (${(w/12).toFixed(1)}')`;
    ws.appendChild(o);
  });
  if (cat.heights.length > 1 && !filler) {
    hs.classList.remove('hidden');
    cat.heights.forEach(h => {
      const o = document.createElement('option'); o.value = h;
      o.textContent = `${h}" tall  (${(h/12).toFixed(1)}')`;
      hs.appendChild(o);
    });
    hs.value = defaultCabHeight(type, activeRoom());
  }
  refreshPlacementOffsets(); // uppers and bases run independently
  // Show bottom-from-floor + depth selectors for wall cabinets
  const wbr = document.getElementById('wall-bottom-row');
  const ds  = document.getElementById('cab-depth-sel');
  const gdr = document.getElementById('glass-door-row');
  if (type === 'wall') {
    wbr.style.display = 'flex'; document.getElementById('cab-wall-bottom').value = '54';
    ds.classList.remove('hidden');
    gdr.style.display = 'flex'; document.getElementById('cab-glass-doors').checked = false;
  } else if (type === 'diagWall') {
    wbr.style.display = 'flex'; document.getElementById('cab-wall-bottom').value = '54';
    ds.classList.add('hidden'); // depth is auto from width selection
    gdr.style.display = 'flex'; document.getElementById('cab-glass-doors').checked = false;
  } else if (filler) {          // a filler can sit at any height: 0 = on the floor
    wbr.style.display = 'flex'; document.getElementById('cab-wall-bottom').value = '0';
    ds.classList.add('hidden');
    gdr.style.display = 'none'; document.getElementById('cab-glass-doors').checked = false;
  } else {
    wbr.style.display = 'none'; ds.classList.add('hidden');
    gdr.style.display = 'none'; document.getElementById('cab-glass-doors').checked = false;
  }
}
// Next cut-list item number for this room — cabinets and appliances share one
// sequence. Assigned once at creation and never reassigned, so numbers stay
// stable on a printed schedule even after something is later deleted.
// Uppers hang at 54" and their height follows the ceiling: 8' → 30", 9' → 36", 10' → 42".
// Tall cabinets and fridge panels line up with the top of those uppers (84/90/96").
function defaultCabHeight(type, r) {
  const cat = CATALOG[type];
  const ceiling = (r && r.ceilingHeight) || 96;
  const upper = ceiling >= 120 ? 42 : ceiling >= 108 ? 36 : 30;
  let want = cat.heights[0];
  if (type === 'wall' || type === 'diagWall') want = upper;
  else if (['tall', 'ovenTall', 'linenTall', 'openTall', 'locker', 'fridgePanel'].includes(type)) want = 54 + upper;
  return cat.heights.includes(want) ? want : cat.heights[0];
}
// Height band an item fills on its wall, in inches from the floor. Two items only
// collide if they overlap along the wall AND in height — so an upper over the fridge,
// or a hood over the range, is fine.
function itemVerticalRange(item) {
  if (CATALOG[item.type]) {
    if (item.type === 'wall' || item.type === 'diagWall') { const b = item.wallBottom ?? 54; return [b, b + item.height]; }
    if (isFiller(item.type)) { const b = item.wallBottom ?? 0; return [b, b + item.height]; }   // fillers sit wherever they're put
    return [0, item.height];
  }
  const acat = APPLIANCES[item.type] || {};
  const b = item.customElevBottom ?? (acat.elevBottomFor ? acat.elevBottomFor(item) : acat.elevBottom) ?? 0;
  if (item.type === 'floatingShelf') { const s = shelfStack(item); return [b, b + (s.n - 1) * s.spacing + s.t]; }
  if (acat.heightFor) return [b, b + acat.heightFor(item.width)];                // a TV's height follows its size (7.4b)
  return [b, b + (item.height || acat.height || 0)];
}
// 'upper' or 'base' — which run a new piece of this type belongs to
function itemLevel(item) {
  if (item.type === 'wall' || item.type === 'diagWall') return 'upper';
  if (isFiller(item.type)) return (item.wallBottom ?? 0) >= 48 ? 'upper' : 'base';
  const acat = APPLIANCES[item.type];
  return acat && acat.wallMount ? 'upper' : 'base';
}
const LEVEL_BANDS = { base: [0, 34.5], upper: [54, 84] };
const rangesOverlap = (a, b) => a[0] < b[1] - 0.01 && b[0] < a[1] - 0.01;
function wallItems(r, wall) { return [...r.cabinets, ...(r.appliances||[])].filter(i => i.wall === wall); }
// Right edge of the run on this wall at this level — where the next piece should go.
// Bases and uppers are separate runs; a tall piece (fridge, pantry) sitting right where
// the run would continue is stepped over, since nothing at that level fits there.
function nextFreeOffset(r, wall, level) {
  const items = wallItemsWithReturns(r, wall);   // includes a corner cabinet's leg on this wall
  const end = i => (i.offset || 0) + i.width;
  const sameLevel = items.filter(i => itemLevel(i) === level);
  let pos = sameLevel.length ? Math.max(...sameLevel.map(end)) : 0;
  const band = LEVEL_BANDS[level] || LEVEL_BANDS.base;
  const blockers = items.filter(i => rangesOverlap(itemVerticalRange(i), band));
  for (let moved = true; moved; ) {
    moved = false;
    for (const b of blockers) if ((b.offset || 0) <= pos + 0.01 && end(b) > pos + 0.01) { pos = end(b); moved = true; }
  }
  return pos;
}
// selfType: the type of the piece being placed — a built-in and the cabinet that holds it
// (wall oven in an oven cabinet, cooktop over a base) don't count as overlapping.
function overlappingItems(r, wall, vRange, offset, width, ignoreId, selfType) {
  return wallItems(r, wall).filter(i => i.id !== ignoreId && rangesOverlap(itemVerticalRange(i), vRange)
    && offset < (i.offset||0) + i.width - 0.01 && (i.offset||0) < offset + width - 0.01
    && !(selfType && canHost(selfType, i.type)));
}
// ── Built-in appliances (Build Plan 3.3) ──
function canHost(a, b) { return (APPLIANCE_HOSTS[a] || []).includes(b) || (APPLIANCE_HOSTS[b] || []).includes(a); }
const _inside = (a, c) => (a.offset || 0) >= (c.offset || 0) - 0.01 && (a.offset || 0) + a.width <= (c.offset || 0) + c.width + 0.01;
// Appliances sitting inside this cabinet (they move with it)
function hostedAppliances(r, cab) {
  return (r.appliances || []).filter(a => a.wall === cab.wall && (APPLIANCE_HOSTS[a.type] || []).includes(cab.type) && _inside(a, cab));
}
// The cabinet an appliance sits inside, if any
function applianceHost(r, app) {
  const types = APPLIANCE_HOSTS[app.type]; if (!types) return null;
  return r.cabinets.find(c => c.wall === app.wall && types.includes(c.type) && _inside(app, c)) || null;
}
// Move a placed item along its wall; a cabinet takes its built-ins with it
function setItemOffset(r, item, next) {
  const d = next - (item.offset || 0);
  if (CATALOG[item.type] && d) hostedAppliances(r, item).forEach(a => { a.offset = Math.round(((a.offset || 0) + d) * 1000) / 1000; });
  item.offset = next;
}
// Where a built-in goes when added: centred in the first cabinet of its kind on this wall
// that doesn't have one yet
function freeHostOffset(r, wall, type, width) {
  const kinds = APPLIANCES[type] && APPLIANCES[type].builtIn ? [APPLIANCES[type].builtIn] : null; if (!kinds) return null;
  const c = r.cabinets.find(c => c.wall === wall && kinds.includes(c.type) && c.width >= width - 0.01
    && !hostedAppliances(r, c).some(a => a.type === type));
  return c ? (c.offset || 0) + (c.width - width) / 2 : null;
}
function applianceVariant(app) {
  const v = APPLIANCE_VARIANTS[app.type]; if (!v) return null;
  return app.variant && v[app.variant] ? app.variant : Object.keys(v)[0];
}
function applianceFinishOptions(type) {
  if (!FINISHED_APPLIANCES.includes(type)) return [];
  return Object.entries(APPLIANCE_FINISHES).filter(([k]) => k !== 'panel' || PANEL_READY_TYPES.includes(type)).map(([k, f]) => [k, f.label]);
}
function applianceHeightLabel(type, h) {
  if (type === 'wallOven') return h >= 50 ? `Double oven (${h}")` : `Single oven (${h}")`;
  return `${h}" tall`;
}
// Look of an appliance: finish (stainless default; panel-ready only where it exists)
function applianceFinish(app) {
  const f = app.finish && APPLIANCE_FINISHES[app.finish] ? app.finish : 'stainless';
  return f === 'panel' && !PANEL_READY_TYPES.includes(app.type) ? 'stainless' : f;
}
function itemLabel(i) {
  const w = i.width >= 1 || isFiller(i.type) ? fmtFrac(i.width).replace('"', '').replace(' ', '-') : '';
  return (CATALOG[i.type]?.abbr || APPLIANCES[i.type]?.abbr || i.type) + w;   // B36, FL1-3/8
}
// Keep both "From left" boxes pointed at the end of the current run.
function refreshPlacementOffsets() {
  const r = activeRoom(); if (!r) return;
  const cabType = document.getElementById('cab-type')?.value;
  const cabLevel = cabType ? itemLevel({ type: cabType }) : 'base';
  const appType = document.getElementById('app-type')?.value;
  const appLevel = appType ? itemLevel({ type: appType }) : 'base';
  const co = document.getElementById('cab-offset-input'); if (co) co.value = nextFreeOffset(r, state.activeWall, cabLevel);
  const appW = parseFloat(document.getElementById('app-width')?.value) || (appType && APPLIANCES[appType] ? APPLIANCES[appType].widths[0] : 0);
  const inHost = appType ? freeHostOffset(r, state.activeWall, appType, appW) : null;   // a built-in: into its cabinet
  const ao = document.getElementById('app-offset');       if (ao) ao.value = inHost != null ? inHost : nextFreeOffset(r, state.activeWall, appLevel);
}
function confirmNoOverlap(r, item, offset, width) {
  const hits = overlappingItems(r, state.activeWall, itemVerticalRange(item), offset, width, null, item.type);
  if (!hits.length) return true;
  return confirm(`This overlaps ${hits.map(itemLabel).join(', ')} on this wall (${offset}" to ${offset + width}" from left).\n\nAdd it anyway?`);
}
function nextItemNum(r) {
  const nums = [...r.cabinets, ...(r.appliances||[])].map(x => x.itemNum || 0);
  return (nums.length ? Math.max(...nums) : 0) + 1;
}
function addCabinet() {
  const r = activeRoom(); if (!r) return;
  const type  = document.getElementById('cab-type').value;
  const filler = isFiller(type);
  const width = filler ? cleanFillerDim(document.getElementById('cab-width-num').value, NaN)
                       : parseFloat(document.getElementById('cab-width').value);
  if (!type || !width) { alert(filler ? 'Enter the filler width in inches, e.g. 1 3/8.' : 'Select cabinet type and width.'); return; }
  const cat = CATALOG[type];
  const hs  = document.getElementById('cab-height-sel');
  const height = filler ? cleanFillerDim(document.getElementById('cab-height-num').value, cat.heights[0])
               : hs.classList.contains('hidden') ? cat.heights[0] : (parseFloat(hs.value) || defaultCabHeight(type, r));
  const note   = document.getElementById('cab-note-input').value.trim();
  const cabOffset = parseInches(document.getElementById('cab-offset-input').value) || 0;
  const depthSel    = document.getElementById('cab-depth-sel');
  const wallBottom  = (type === 'wall' || type === 'diagWall') ? (parseInches(document.getElementById('cab-wall-bottom').value) || 54)
                    : filler ? Math.max(0, parseInches(document.getElementById('cab-wall-bottom').value) || 0) : null;
  const depth       = type === 'diagWall' ? 12
                    : (type === 'wall' && !depthSel.classList.contains('hidden')) ? parseInt(depthSel.value)
                    : filler ? (wallBottom >= 48 ? 12 : 24)       // a filler up in the upper run is upper-depth
                    : cat.depth;
  const glassDoors    = (type === 'wall' || type === 'diagWall') && document.getElementById('cab-glass-doors').checked;
  const styleOverride = document.getElementById('cab-style-override').value || null;
  if (!confirmNoOverlap(r, { type, height, wallBottom }, cabOffset, width)) return;
  r.cabinets.push({ id: uid(), type, wall: state.activeWall, width, height, depth, note, offset: cabOffset, wallBottom, glassDoors, styleOverride, itemNum: nextItemNum(r) });
  document.getElementById('cab-note-input').value    = '';
  document.getElementById('cab-style-override').value = '';
  refreshPlacementOffsets();
  persist(); renderCabinetList(); renderCanvas(); renderCutList();
  if (state.viewMode === 'elevation') renderElevation();
}
function removeCabinet(id) {
  const r = activeRoom(); if (!r) return;
  r.cabinets = r.cabinets.filter(c => c.id !== id);
  persist(); renderCabinetList(); renderCanvas(); renderCutList();
  if (state.viewMode === 'elevation') renderElevation();
}

// ════════════════════════════
// APPLIANCE FORM
// ════════════════════════════
function onAppTypeChange() {
  const type = document.getElementById('app-type').value;
  const ws   = document.getElementById('app-width');
  const hs   = document.getElementById('app-height-sel');
  const es   = document.getElementById('app-elev-bottom-sel');
  ws.innerHTML = '<option value="">— Width —</option>';
  hs.innerHTML = '<option value="">— Height —</option>';
  es.innerHTML = '<option value="">— Height from floor —</option>';
  hs.classList.add('hidden');
  es.classList.add('hidden');
  if (!type) return;
  const acat = APPLIANCES[type];
  acat.widths.forEach(w => {
    const o = document.createElement('option'); o.value = w;
    o.textContent = `${w}" wide  (${(w/12).toFixed(1)}')`;
    ws.appendChild(o);
  });
  if (acat.heights) {
    hs.classList.remove('hidden');
    acat.heights.forEach(h => {
      const o = document.createElement('option'); o.value = h;
      o.textContent = `${h}" tall  (${(h/12).toFixed(1)}')`;
      hs.appendChild(o);
    });
  }
  if (acat.elevBottomOptions) {
    es.classList.remove('hidden');
    acat.elevBottomOptions.forEach(v => {
      const o = document.createElement('option'); o.value = v;
      o.textContent = `${v}" from floor`;
      if (v === acat.elevBottom) o.selected = true;
      es.appendChild(o);
    });
  }
  refreshPlacementOffsets();
}
function addAppliance() {
  const r = activeRoom(); if (!r) return;
  const type  = document.getElementById('app-type').value;
  const width = parseFloat(document.getElementById('app-width').value);
  if (!type || !width) { alert('Select appliance type and width.'); return; }
  const acat  = APPLIANCES[type];
  const note  = document.getElementById('app-note').value.trim();
  const offset = parseInches(document.getElementById('app-offset').value) || 0;   // fractions: a built-in centred in its cabinet
  const priceRaw = document.getElementById('app-price').value.trim();
  const price = priceRaw !== '' ? parseFloat(priceRaw) : null;
  const hs = document.getElementById('app-height-sel');
  const appHeight = (acat.heights && !hs.classList.contains('hidden') && hs.value)
    ? parseFloat(hs.value) : acat.height;
  const es = document.getElementById('app-elev-bottom-sel');
  const customElevBottom = (acat.elevBottomOptions && !es.classList.contains('hidden') && es.value)
    ? parseFloat(es.value) : null;
  if (!r.appliances) r.appliances = [];
  if (!confirmNoOverlap(r, { type, height: appHeight, customElevBottom }, offset, width)) return;
  r.appliances.push({ id: uid(), type, wall: state.activeWall, width, height: appHeight, note, offset, customElevBottom, price, itemNum: nextItemNum(r) });
  document.getElementById('app-note').value   = '';
  document.getElementById('app-price').value  = '';
  refreshPlacementOffsets();
  persist(); renderCabinetList(); renderCanvas(); renderCutList();
  if (state.viewMode === 'elevation') renderElevation();
}
function addIsland() {
  const r = activeRoom(); if (!r) return;
  const width = parseInt(document.getElementById('island-width').value) || 36;
  const depth = parseInt(document.getElementById('island-depth').value) || 24;
  const label = document.getElementById('island-label').value.trim();
  const roomW = Math.max(r.walls.north, r.walls.south, 48);
  const roomH = Math.max(r.walls.east,  r.walls.west,  48);
  const x = Math.max(6, Math.round((roomW - width) / 2));
  const y = Math.max(6, Math.round((roomH - depth) / 2));
  if (!r.islands) r.islands = [];
  r.islands.push({ id: uid(), width, depth, x, y, label });
  document.getElementById('island-label').value = '';
  persist(); renderCabinetList(); renderCanvas();
}
function removeIsland(id) {
  const r = activeRoom(); if (!r) return;
  r.islands = (r.islands || []).filter(i => i.id !== id);
  persist(); renderCabinetList(); renderCanvas();
}
// ── Island Edit Modal ──
function openEditIslandModal(isl) {
  if (READ_ONLY) return;
  document.getElementById('edit-isl-id').value    = isl.id;
  document.getElementById('edit-isl-width').value = isl.width;
  document.getElementById('edit-isl-depth').value = isl.depth;
  document.getElementById('edit-isl-label').value = isl.label || '';
  document.getElementById('modal-edit-island').classList.remove('hidden');
}
function saveEditIslandModal() {
  const r = activeRoom(); if (!r) return;
  const id  = document.getElementById('edit-isl-id').value;
  const isl = (r.islands||[]).find(i => i.id === id); if (!isl) return;
  const newW = parseInt(document.getElementById('edit-isl-width').value) || isl.width;
  const newD = parseInt(document.getElementById('edit-isl-depth').value) || isl.depth;
  // keep within room if resized
  const roomW = Math.max(r.walls.north, r.walls.south, 48);
  const roomH = Math.max(r.walls.east,  r.walls.west,  48);
  isl.width = newW; isl.depth = newD;
  isl.x = Math.min(isl.x, roomW - newW);
  isl.y = Math.min(isl.y, roomH - newD);
  isl.label = document.getElementById('edit-isl-label').value.trim();
  closeModal('modal-edit-island');
  persist(); renderCabinetList(); renderCanvas();
}
function deleteFromEditIslandModal() {
  const r = activeRoom(); if (!r) return;
  const id = document.getElementById('edit-isl-id').value;
  r.islands = (r.islands||[]).filter(i => i.id !== id);
  closeModal('modal-edit-island');
  persist(); renderCabinetList(); renderCanvas();
}

// ── Appliance Edit Modal ──
function openEditApplianceModal(app) {
  const acat = APPLIANCES[app.type]; if (!acat) return;
  document.getElementById('edit-app-id').value         = app.id;
  document.getElementById('edit-app-title').textContent = `Edit — ${acat.label}`;
  document.getElementById('edit-app-type-label').value  = acat.label;
  document.getElementById('edit-app-offset').value      = app.offset || 0;
  document.getElementById('edit-app-note').value        = app.note || '';
  document.getElementById('edit-app-price').value       = app.price != null ? app.price : '';
  // Width options
  const ws = document.getElementById('edit-app-width');
  ws.innerHTML = '';
  [...new Set([...acat.widths, app.width])].sort((m, n) => m - n).forEach(w => {   // (a shelf can be any length)
    const o = document.createElement('option'); o.value = w;
    o.textContent = `${w}" wide`;
    if (w === app.width) o.selected = true;
    ws.appendChild(o);
  });
  // Height from floor (if applicable)
  const eg = document.getElementById('edit-app-elevbottom-group');
  const es = document.getElementById('edit-app-elevbottom');
  es.innerHTML = '';
  if (acat.elevBottomOptions) {
    eg.style.display = '';
    acat.elevBottomOptions.forEach(v => {
      const o = document.createElement('option'); o.value = v;
      o.textContent = `${v}" from floor`;
      const cur = itemVerticalRange(app)[0];
      if (v === cur) o.selected = true;
      es.appendChild(o);
    });
  } else { eg.style.display = 'none'; }
  // Size / style / finish (3.3)
  const fillSel = (groupId, selId, entries, cur) => {
    const g = document.getElementById(groupId), s = document.getElementById(selId);
    g.style.display = entries.length ? '' : 'none';
    s.innerHTML = entries.map(([v, l]) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${l}</option>`).join('');
  };
  fillSel('edit-app-height-group', 'edit-app-height', acat.heights ? acat.heights.map(h => [h, applianceHeightLabel(app.type, h)]) : [], app.height || acat.height);
  fillSel('edit-app-variant-group', 'edit-app-variant', Object.entries(APPLIANCE_VARIANTS[app.type] || {}), applianceVariant(app));
  fillSel('edit-app-finish-group', 'edit-app-finish', applianceFinishOptions(app.type), applianceFinish(app));
  document.getElementById('modal-edit-appliance').classList.remove('hidden');
}
function saveEditApplianceModal() {
  const r = activeRoom(); if (!r) return;
  const id  = document.getElementById('edit-app-id').value;
  const app = (r.appliances||[]).find(a => a.id === id); if (!app) return;
  const acat = APPLIANCES[app.type];
  app.width  = parseFloat(document.getElementById('edit-app-width').value) || app.width;
  app.offset = parseInches(document.getElementById('edit-app-offset').value) || 0;
  app.note   = document.getElementById('edit-app-note').value.trim();
  const editPriceRaw = document.getElementById('edit-app-price').value.trim();
  app.price  = editPriceRaw !== '' ? parseFloat(editPriceRaw) : null;
  const es = document.getElementById('edit-app-elevbottom');
  const oldBottom = itemVerticalRange(app)[0];
  const newH = acat.heights ? parseFloat(document.getElementById('edit-app-height').value) : null;
  const heightChanged = !!newH && newH !== (app.height || acat.height);
  if (heightChanged) app.height = newH;
  const pickedBottom = acat.elevBottomOptions && es.value ? parseFloat(es.value) : null;
  // Switching single ↔ double oven: if the height-from-floor wasn't touched, take the new
  // size's own default (double ovens sit lower)
  if (heightChanged && acat.elevBottomFor && pickedBottom === oldBottom) app.customElevBottom = null;
  else if (pickedBottom != null) app.customElevBottom = pickedBottom;
  if (APPLIANCE_VARIANTS[app.type]) app.variant = document.getElementById('edit-app-variant').value || null;
  if (FINISHED_APPLIANCES.includes(app.type)) app.finish = document.getElementById('edit-app-finish').value || null;
  closeModal('modal-edit-appliance');
  persist(); renderCabinetList(); renderCanvas();
  if (state.viewMode === 'elevation') renderElevation();
}
function deleteFromEditApplianceModal() {
  const r = activeRoom(); if (!r) return;
  const id = document.getElementById('edit-app-id').value;
  r.appliances = (r.appliances||[]).filter(a => a.id !== id);
  closeModal('modal-edit-appliance');
  persist(); renderCabinetList(); renderCanvas();
  if (state.viewMode === 'elevation') renderElevation();
}

// ── Cabinet Edit Modal ──
function openEditModal(cab) {
  const cat = CATALOG[cab.type]; if (!cat) return;
  document.getElementById('edit-cab-id').value         = cab.id;
  document.getElementById('edit-cab-title').textContent = `Edit — ${cat.label}`;
  document.getElementById('edit-cab-type-label').value  = cat.label;
  document.getElementById('edit-cab-offset').value      = cab.offset || 0;
  document.getElementById('edit-cab-note').value        = cab.note || '';
  document.getElementById('edit-cab-glass').checked     = !!cab.glassDoors;

  const filler = isFiller(cab.type);
  document.getElementById('edit-cab-offset').value = +(cab.offset || 0).toFixed(4);
  // Fillers: free width/height boxes (fractions OK) instead of size dropdowns
  let wnum = document.getElementById('edit-cab-width-num'), hnum = document.getElementById('edit-cab-height-num');
  if (!wnum) {
    const mk = (id, after, label) => { const i = document.createElement('input'); i.type = 'text'; i.id = id; i.className = 'cp-input';
      i.setAttribute('inputmode', 'decimal'); i.setAttribute('aria-label', label); after.insertAdjacentElement('afterend', i); return i; };
    wnum = mk('edit-cab-width-num', document.getElementById('edit-cab-width'), 'Filler width in inches');
    hnum = mk('edit-cab-height-num', document.getElementById('edit-cab-height'), 'Filler height in inches');
  }
  document.getElementById('edit-cab-width').classList.toggle('hidden', filler);
  document.getElementById('edit-cab-height').classList.toggle('hidden', filler);
  wnum.classList.toggle('hidden', !filler); hnum.classList.toggle('hidden', !filler);
  if (filler) { wnum.value = fmtFrac(cab.width).replace('"', ''); hnum.value = fmtFrac(cab.height).replace('"', ''); }

  // Width options
  const ws = document.getElementById('edit-cab-width');
  ws.innerHTML = '';
  cat.widths.forEach(w => {
    const o = document.createElement('option'); o.value = w;
    o.textContent = `${w}" wide`;
    if (w === cab.width) o.selected = true;
    ws.appendChild(o);
  });

  // Height options
  const hg = document.getElementById('edit-height-group');
  const hs = document.getElementById('edit-cab-height');
  hs.innerHTML = '';
  if (cat.heights) {
    hg.style.display = '';
    cat.heights.forEach(h => {
      const o = document.createElement('option'); o.value = h;
      o.textContent = `${h}" tall`;
      if (h === cab.height) o.selected = true;
      hs.appendChild(o);
    });
  } else { hg.style.display = 'none'; }

  // Depth (wall cabs only)
  const dg = document.getElementById('edit-depth-group');
  const ds = document.getElementById('edit-cab-depth');
  if (cab.type === 'wall') {
    dg.style.display = '';
    ds.value = String(cab.depth || 12);
  } else { dg.style.display = 'none'; }

  // Wall bottom (wall + diagWall)
  const wbg = document.getElementById('edit-wallbottom-group');
  if (cab.type === 'wall' || cab.type === 'diagWall' || filler) {
    wbg.style.display = '';
    document.getElementById('edit-cab-wallbottom').value = cab.wallBottom != null ? cab.wallBottom : (filler ? 0 : 54);
  } else { wbg.style.display = 'none'; }

  // Glass doors (wall + diagWall)
  document.getElementById('edit-glass-group').style.display = (cab.type === 'wall' || cab.type === 'diagWall') ? '' : 'none';

  // Door style override
  const ss = document.getElementById('edit-cab-style');
  ss.innerHTML = '<option value="">— Use Project Default —</option>';
  // (Was reading proj.styles, which doesn't exist — the list was always empty and saving
  // wiped any per-cabinet style. The account's styles come from getStyles().)
  {
    getStyles().forEach(s => {
      const o = document.createElement('option'); o.value = s.code;
      o.textContent = s.name || s.code;
      if (s.code === cab.styleOverride) o.selected = true;
      ss.appendChild(o);
    });
  }

  document.getElementById('modal-edit-cabinet').classList.remove('hidden');
}

function saveEditModal() {
  const r = activeRoom(); if (!r) return;
  const id  = document.getElementById('edit-cab-id').value;
  const cab = r.cabinets.find(c => c.id === id); if (!cab) return;
  if (isFiller(cab.type)) {
    cab.width  = cleanFillerDim(document.getElementById('edit-cab-width-num').value, cab.width);
    cab.height = cleanFillerDim(document.getElementById('edit-cab-height-num').value, cab.height);
    cab.wallBottom = Math.max(0, parseInches(document.getElementById('edit-cab-wallbottom').value) || 0);
    cab.depth  = cab.wallBottom >= 48 ? 12 : 24;
  } else {
    cab.width  = parseFloat(document.getElementById('edit-cab-width').value) || cab.width;
    const hs = document.getElementById('edit-cab-height');
    if (hs.options.length > 0 && hs.value) cab.height = parseFloat(hs.value);
  }
  if (cab.type === 'wall') {
    cab.depth      = parseFloat(document.getElementById('edit-cab-depth').value) || 12;
  }
  if (cab.type === 'wall' || cab.type === 'diagWall') {
    cab.wallBottom = parseInches(document.getElementById('edit-cab-wallbottom').value) || 54;
    cab.glassDoors = document.getElementById('edit-cab-glass').checked;
  }
  setItemOffset(r, cab, parseInches(document.getElementById('edit-cab-offset').value) || 0);   // was parseInt: dropped fractions (built-ins move with it)
  cab.note          = document.getElementById('edit-cab-note').value.trim();
  cab.styleOverride = document.getElementById('edit-cab-style').value || null;
  closeModal('modal-edit-cabinet');
  persist(); renderCabinetList(); renderCanvas();
  if (state.viewMode === 'elevation') renderElevation();
}

function deleteFromEditModal() {
  const r = activeRoom(); if (!r) return;
  const id = document.getElementById('edit-cab-id').value;
  r.cabinets = r.cabinets.filter(c => c.id !== id);
  closeModal('modal-edit-cabinet');
  persist(); renderCabinetList(); renderCanvas();
  if (state.viewMode === 'elevation') renderElevation();
}

function removeAppliance(id) {
  const r = activeRoom(); if (!r) return;
  r.appliances = (r.appliances || []).filter(a => a.id !== id);
  persist(); renderCabinetList(); renderCanvas(); renderCutList();
  if (state.viewMode === 'elevation') renderElevation();
}

// ════════════════════════════
// PRICING
// ════════════════════════════
function onPricingToggle(fromToolbar) {
  const main = document.getElementById('pricing-toggle');
  const tb = document.getElementById('pricing-toggle-2');
  // Gate pricing visibility at Silver tier
  if (!canAccess('silver')) {
    if (main) main.checked = false;
    if (tb) tb.checked = false;
    showTierUpgradePrompt('silver', 'Show Pricing');
    return;
  }
  if (fromToolbar) { main.checked = tb.checked; } else if (tb) { tb.checked = main.checked; }
  document.getElementById('pricing-opts').classList.toggle('hidden', !pricingOn());
  renderAll();
}
function renderAll() { if (typeof syncPaletteToRoom === 'function') syncPaletteToRoom(); renderCanvas(); renderCabinetList(); if (state.viewMode === 'elevation') renderElevation(); if (state.viewMode === '3d') renderIsometric(); renderCutList(); if (typeof renderDesignCheck === 'function') renderDesignCheck(); }

// ════════════════════════════
// STYLE PANEL
// ════════════════════════════
function buildStylePanel() {
  const container = document.getElementById('style-container');
  const overrideSel = document.getElementById('cab-style-override');
  // Rebuilt when the account loads — start the per-cabinet list fresh so entries don't pile up
  if (overrideSel) overrideSel.innerHTML = '<option value="">— Door Style: Use Project Default —</option>';
  let html = '', tier = null;
  getStyles().forEach(s => {
    const t = s.tier || '';
    if (t !== tier) {
      if (tier !== null) html += '</div>';
      html += `${t ? `<div class="style-tier-label">${escHtml(t)}</div>` : ''}<div class="style-grid">`;
      tier = t;
    }
    const bord = s.swatch === '#FEFEFE' || s.swatch === '#FAF9F7' ? '#ddd' : 'transparent';
    html += `<div class="style-opt" data-code="${s.code}" onclick="selectStyle('${s.code}')" title="${s.name}">
      <div class="style-swatch" style="background:${s.swatch};border-color:${bord}"></div>
      <div class="style-code">${s.code}</div></div>`;
    // Also populate the per-cabinet style override dropdown
    if (overrideSel) {
      const o = document.createElement('option'); o.value = s.code;
      o.textContent = `${s.tier ? s.tier + ': ' : ''}${s.code} — ${s.name}`;
      overrideSel.appendChild(o);
    }
  });
  if (tier !== null) html += '</div>';
  container.innerHTML = html;
}
function selectStyle(code) {
  const p = activeProj(); if (!p) return;
  p.style = code; persist();
  renderProjectMeta(p);
  document.querySelectorAll('.style-opt').forEach(el => el.classList.toggle('selected', el.dataset.code === code));
  syncStyleCurrent(code);
  document.getElementById('style-container').classList.add('hidden');
  const action = document.getElementById('style-current-action');
  if (action) action.textContent = 'Change ▾';
  renderCanvas(); if (state.viewMode === 'elevation') renderElevation();
  if (state.viewMode === '3d') renderIsometric();
}
// Project hardware: bar pulls everywhere, knobs on doors (pulls on drawers), or knobs on
// everything. Drives the 3D/elevation look and the hardware counts on the quote (7.2).
function setHardware(v) {
  const p = activeProj(); if (!p) return;
  p.hardware = ['knobs', 'allKnobs'].includes(v) ? v : 'pulls';
  persist(); syncHardwareButtons();
  renderAll(); if (state.viewMode === '3d') renderIsometric();
}
function syncHardwareButtons() {
  const hw = projectHardware(activeProj());
  document.querySelectorAll('.hw-row [data-hw]').forEach(b => b.classList.toggle('active', b.dataset.hw === hw));
}
function syncStylePanel() {
  syncHardwareButtons();
  if (typeof syncCountertopPanel === 'function') syncCountertopPanel();
  if (typeof updateSnapButton === 'function') updateSnapButton();
  const p = activeProj(); const code = p ? (p.style || 'AW') : 'AW';
  document.querySelectorAll('.style-opt').forEach(el => el.classList.toggle('selected', el.dataset.code === code));
  syncStyleCurrent(code);
}
function syncStyleCurrent(code) {
  const found = getStyles().find(x => x.code === code);
  const s = found || getStyles()[0];
  const sw = document.getElementById('style-current-swatch');
  const cd = document.getElementById('style-current-code');
  const nm = document.getElementById('style-current-name');
  if (sw) { sw.style.background = s.swatch; sw.style.borderColor = (s.swatch === '#FEFEFE' || s.swatch === '#FAF9F7') ? '#ddd' : 'transparent'; }
  if (cd) cd.textContent = found ? s.code : (code || '—');
  // A saved style that isn't one of this account's finishes used to quietly show the first
  // finish (e.g. Ice White Shaker). Say so instead, so it gets fixed with one click.
  if (nm) nm.textContent = found ? s.name : 'Not one of your finishes — pick one';
  document.getElementById('style-current')?.classList.toggle('style-missing', !found);
}
function toggleStylePicker() {
  const container = document.getElementById('style-container');
  const open = container.classList.toggle('hidden') === false;
  const action = document.getElementById('style-current-action');
  if (action) action.textContent = open ? 'Close ▴' : 'Change ▾';
}

