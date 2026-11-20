// My Cabinet Planner — js/roommodel.js
// Room Model v2 (Phase 4, docs/ROOM-MODEL-V2.md), step 4.1b: a room's shape as corners and
// walls (`room.outline`) instead of four lengths plus an optional L cut-out.
//
//   room.outline = { corners: [{ id, x, y }], walls: [{ id, from, to, kind, legacy? }],
//                    fromLegacy: true, sig }
//
// Every existing room converts with nothing moving: the walls keep their old ids (north,
// south, east, west, step1, step2), so cabinets, openings and island sides stay where
// they are. Where an old wall's numbers don't match its drawn corners (an L room's outer
// walls, or a rectangle typed with uneven sides), the wall keeps the old start / length
// in `legacy`, so every offset means exactly what it did. The old fields (walls, shape,
// lCut) stay on the room: deleting `outline` puts any room back exactly as it was.
//
// While `fromLegacy` is true the outline is only a translation of the old fields and is
// rebuilt whenever they change (the room shape window). The shape editor (step 4.1c)
// takes over from there.
//
// Turned on per login (the switch): Dan's first, then Sam's, then everyone. The switch is
// `room_v2: true` in the login's app_metadata, which only the database can set
// (supabase/supabase-room-model-switch.sql), so no email address sits in this code. On a
// local preview, localStorage cp_room_v2 = '1' turns it on for testing.
// Loaded by app.html as a classic script, after rooms.js.

let _roomV2Cache = { key: null, on: false };
function roomV2On() {
  const u = typeof currentUser !== 'undefined' ? currentUser : null;
  const flagged = !!(u && u.app_metadata && u.app_metadata.room_v2 === true);
  let local = false;
  if (['localhost', '127.0.0.1'].includes(location.hostname)) { try { local = localStorage.getItem('cp_room_v2') === '1'; } catch (e) {} }
  const key = (u ? u.id : '') + '|' + flagged + '|' + local;
  if (_roomV2Cache.key !== key) _roomV2Cache = { key, on: flagged || local };
  return _roomV2Cache.on;
}

// ── The old model's walls (exactly as wallFrame worked before 4.1b) ──
function legacyRoomSize(r) {
  return { w: Math.max(r.walls.north, r.walls.south, 48), h: Math.max(r.walls.east, r.walls.west, 48) };
}
function legacyRoomWalls(r) { return ['north', 'south', 'east', 'west', ...(getLShapeData(r) ? ['step1', 'step2'] : [])]; }
function legacyWallFrame(r, wall) {
  const { w: W, h: H } = legacyRoomSize(r);
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
  }
  return null;
}
// What the outline was built from; when it changes, a not-yet-edited outline is rebuilt
function legacySig(r) {
  const w = r.walls || {}, c = r.lCut || {};
  return [w.north, w.south, w.east, w.west, r.shape, c.corner, c.width, c.depth].join('|');
}

// ── Geometry of an outline ──
function _pointInPolygon(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function outlinePolygon(o) { return o.corners.map(c => [c.x, c.y]); }
const _frameCache = new WeakMap();   // outline → Map(wall id → frame); outlineChanged() clears it
function outlineChanged(o) { _frameCache.delete(o); }
// A wall as drawn: from its first corner toward its second, "inward" pointing into the room
function outlineGeomFrame(o, w) {
  const a = o.corners.find(c => c.id === w.from), b = o.corners.find(c => c.id === w.to); if (!a || !b) return null;
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); if (L < 1e-9) return null;
  const dir = [dx / L, dy / L];
  let inward = [-dir[1], dir[0]];
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  if (!_pointInPolygon(outlinePolygon(o), mx + inward[0] * 0.5, my + inward[1] * 0.5)) inward = [-inward[0], -inward[1]];
  return { start: [a.x, a.y], dir, inward, length: L };
}
function outlineWallFrame(r, wallId) {
  const o = r.outline;
  let m = _frameCache.get(o); if (!m) { m = new Map(); _frameCache.set(o, m); }
  if (m.has(wallId)) return m.get(wallId);
  const w = o.walls.find(x => x.id === wallId);
  let f = w ? outlineGeomFrame(o, w) : null;
  if (f && w.legacy) f = { ...f, ...w.legacy };      // the old numbers win where they differ (see top)
  m.set(wallId, f);
  return f;
}

// ── Converting a room ──
function buildOutlineFromLegacy(r) {
  const { w: W, h: H } = legacyRoomSize(r);
  const ld = getLShapeData(r);
  const poly = ld ? ld.polygon : [[0, 0], [W, 0], [W, H], [0, H]];
  const corners = poly.map((q, i) => ({ id: 'c' + (i + 1), x: q[0], y: q[1] }));
  const walls = [];
  for (const id of legacyRoomWalls(r)) {
    const f = legacyWallFrame(r, id); if (!f) return null;
    const along = q => (q[0] - f.start[0]) * f.dir[0] + (q[1] - f.start[1]) * f.dir[1];
    const off = q => (q[0] - f.start[0]) * f.inward[0] + (q[1] - f.start[1]) * f.inward[1];
    let edge = null;
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey); if (L < 1e-9) return;
      if (Math.abs(ex * f.dir[1] - ey * f.dir[0]) / L > 1e-9) return;          // not parallel
      if (Math.abs(off(a)) > 1e-6 || Math.abs(off(b)) > 1e-6) return;           // not on this wall's line
      edge = along(a) <= along(b) ? [i, (i + 1) % poly.length] : [(i + 1) % poly.length, i];
    });
    if (!edge) return null;                                                     // can't place it: stays on the old model
    walls.push({ id, from: corners[edge[0]].id, to: corners[edge[1]].id, kind: 'full' });
  }
  const o = { fromLegacy: true, corners, walls };
  // Keep the old numbers wherever the drawn wall differs from them
  for (const w of walls) {
    const g = outlineGeomFrame(o, w), f = legacyWallFrame(r, w.id);
    if (!g || g.dir[0] * f.dir[0] + g.dir[1] * f.dir[1] < 0.999999) return null;
    const legacy = {};
    if (Math.hypot(g.start[0] - f.start[0], g.start[1] - f.start[1]) > 1e-9) legacy.start = f.start.slice();
    if (Math.abs(g.length - f.length) > 1e-9) legacy.length = f.length;
    if (g.inward[0] * f.inward[0] + g.inward[1] * f.inward[1] < 0.999999) legacy.inward = f.inward.slice();
    if (Object.keys(legacy).length) w.legacy = legacy;
  }
  o.sig = legacySig(r);
  return o;
}
// Give a room its outline (or refresh one that is still a straight translation)
function ensureOutline(r) {
  if (!r || !r.walls) return;
  if (r.outline && !(r.outline.fromLegacy && r.outline.sig !== legacySig(r))) return;
  const o = buildOutlineFromLegacy(r);
  if (o) r.outline = o;
  else { delete r.outline; console.warn('Room kept on the old model (its walls could not be converted):', r.name); }
}
// The room's outline, refreshed if the old fields changed since (null = old model). Every
// reader goes through this: wallFrame, wallLength, roomSize, roomWalls.
function roomOutline(r) {
  if (!r || !(r.outline || roomV2On())) return null;
  ensureOutline(r);
  // With the switch on, a room switches over the first time it's used (4.1c)
  if (r.outline && r.outline.fromLegacy && !_takingOver && roomV2On()) takeOverRoom(r);
  return r.outline || null;
}
let _takingOver = false;
// Undo: put every room of every project back on the old model (the old fields were kept)
function revertRoomModel(projects) {
  (projects || []).forEach(p => { (p.rooms || []).forEach(r => { delete r.outline; }); p.schemaVersion = 2; });
}

// ════════════════════════════
// TAKING OVER A ROOM (step 4.1c)
// ════════════════════════════
// Until now the outline was a translation of the old fields. Taking a room over makes the
// outline the room's own shape (the editor changes it from then on) and fixes what the old
// model got wrong (Dan approved, 2026-11-20):
//   • walls are measured from their real corners: on an L room's outer walls the old
//     measurements started at the room's outer corner, inside the cut-out, so each piece's
//     offset is shifted by that much and it stays exactly where it was;
//   • a wall that faced away from the room (the first inner wall of every L room) turns to
//     face it, so the cabinets on it stand in the room instead of in the cut-out;
//   • a wall's length is its real length (pieces past the end get the usual red outline).
// Every change is written to room.shapeNotes so the room can say what moved.
function ownedOutline(r) { const o = roomOutline(r); return o && !o.fromLegacy ? o : null; }
function takeOverRoom(r) {
  if (_takingOver) return false;
  ensureOutline(r);
  const o = r.outline; if (!o || !o.fromLegacy) return false;
  _takingOver = true;
  try { return _takeOver(r, o); } finally { _takingOver = false; }
}
function _takeOver(r, o) {
  const notes = [];
  const ld = getLShapeData(r);    // (still readable: the room hasn't switched yet)
  const oldName = id => ld && ld[id] ? ld[id].label.replace(/^[^A-Za-z]+/, '') + ' wall' : id.charAt(0).toUpperCase() + id.slice(1) + ' wall';
  const onWall = id => [...(r.cabinets || []), ...(r.appliances || []), ...(r.openings || [])].filter(i => i.wall === id);
  o.walls.forEach(w => {
    if (!w.legacy) return;
    const g = outlineGeomFrame(o, w), L = w.legacy, name = oldName(w.id);
    if (L.start) {
      const shift = (L.start[0] - g.start[0]) * g.dir[0] + (L.start[1] - g.start[1]) * g.dir[1];
      if (Math.abs(shift) > 1e-9) {
        const items = onWall(w.id);
        items.forEach(i => { i.offset = Math.round(((i.offset || 0) + shift) * 1000) / 1000; });
        if (items.length) notes.push(`${name}: now measured from its real corner (${items.length} item${items.length === 1 ? '' : 's'} kept in place).`);
      }
    }
    if (L.inward && L.inward[0] * g.inward[0] + L.inward[1] * g.inward[1] < 0) {
      const n = onWall(w.id).filter(i => !(r.openings || []).includes(i)).length;
      if (n) notes.push(`${name}: now faces into the room, so its ${n} item${n === 1 ? '' : 's'} moved out of the cut-out corner.`);
    }
    delete w.legacy;
  });
  o.fromLegacy = false; delete o.sig;
  outlineChanged(o);
  if (notes.length) r.shapeNotes = notes;
  return true;
}

// ── Names: which way a wall faces you as you stand in the room ──
const COMPASS8 = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
function compassOf(dx, dy) {        // direction in room coordinates (x east, y south)
  const ang = Math.atan2(dx, -dy);   // 0 = north, clockwise
  return COMPASS8[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
}
// Each wall of an owned outline: "North", "Northeast", … (a second wall facing the same way is "North 2")
function outlineWallNames(r) {
  const o = ownedOutline(r); if (!o) return null;
  const base = {}, count = {};
  o.walls.forEach(w => { const f = outlineWallFrame(r, w.id); base[w.id] = f ? compassOf(-f.inward[0], -f.inward[1]) : 'Wall'; count[base[w.id]] = (count[base[w.id]] || 0) + 1; });
  const seen = {}, out = {};
  o.walls.forEach(w => { const b = base[w.id]; seen[b] = (seen[b] || 0) + 1; out[w.id] = seen[b] > 1 ? `${b} ${seen[b]}` : b; });   // North, North 2, …
  return out;
}
// Elevations are drawn as you face the wall; offsets run left to right unless the wall runs
// the other way (the old South and West walls do). Any wall, any angle.
function wallFlipped(r, wall) {
  if (!ownedOutline(r) || isIslandWall(wall)) return wall === 'south' || wall === 'west';   // the old rule, unchanged
  const f = wallFrame(r, wall); if (!f) return false;
  return f.dir[0] * f.inward[1] - f.dir[1] * f.inward[0] < 0;   // facing the wall, "right" is (inward.y, -inward.x)
}
// A switched-over room that is still a plain rectangle with four full walls: drawn the same
// way as before (same floor, grid and outline)
function isPlainBox(r) {
  const o = ownedOutline(r); if (!o || o.corners.length !== 4 || o.walls.some(w => (w.kind || 'full') !== 'full')) return false;
  const { w, h } = roomSize(r), key = q => q[0] + ',' + q[1];
  const want = new Set([[0, 0], [w, 0], [w, h], [0, h]].map(key));
  return outlinePolygon(o).every(q => want.has(key(q)));
}
// A wall length for labels: nearest 1/8", with feet (same look as fmtIn for whole inches)
function fmtWallLen(v) { const t = Math.round(v * 8) / 8; return t > 0 ? `${fmtFrac(t)} (${Math.floor(t / 12)}'-${fmtFrac(t - Math.floor(t / 12) * 12)})` : '0"'; }
// The room's corners and its drawn walls, in room inches
function roomPolygonPts(r) {
  const o = roomOutline(r); if (o) return outlinePolygon(o);
  const ld = getLShapeData(r); if (ld) return ld.polygon;
  const { w, h } = roomSize(r); return [[0, 0], [w, 0], [w, h], [0, h]];
}
function roomWallSegs(r) {
  const o = ownedOutline(r); if (!o) return [];
  return o.walls.map(w => {
    const a = o.corners.find(c => c.id === w.from), b = o.corners.find(c => c.id === w.to);
    return a && b ? { id: w.id, kind: w.kind || 'full', height: w.height, a: [a.x, a.y], b: [b.x, b.y], frame: outlineWallFrame(r, w.id) } : null;
  }).filter(Boolean);
}
