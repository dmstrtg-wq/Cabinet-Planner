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
  return r.outline || null;
}
// Undo: put every room of every project back on the old model (the old fields were kept)
function revertRoomModel(projects) {
  (projects || []).forEach(p => { (p.rooms || []).forEach(r => { delete r.outline; }); p.schemaVersion = 2; });
}
