// My Cabinet Planner — js/anglejoints.js
// Where two walls meet at an angle other than 90° (room model v2, Phase 4 step 4.1d):
//   • the setback: a cabinet sits far enough from the corner that its front just meets the
//     front of the cabinet on the other wall (24" deep at a 135° corner: about 9 15/16");
//     placement snaps to it
//   • tapered fillers: when the two fronts don't meet, a filler tapered to the angle closes
//     the gap; it is drawn, priced as filler stock and goes on the order list
//   • mitered tops: the two countertops are cut on the corner's bisector and meet in one seam
// Square (90°) corners keep the corner cabinet handling in corners.js.
// Loaded by app.html as a classic script, after roommodel.js.

const ANGLE_FILLER_MAX = 12;   // a front gap wider than this isn't a filler, it's open counter

// Every corner of a reshaped room where two walls meet at an angle cabinets can share
function angledCorners(r) {
  const o = ownedOutline(r); if (!o) return [];
  const out = [];
  o.corners.forEach(c => {
    const ws = o.walls.filter(w => w.from === c.id || w.to === c.id); if (ws.length !== 2) return;
    const ends = ws.map(w => {
      const f = wallFrame(r, w.id); if (!f) return null;
      const atStart = w.from === c.id;
      return { wall: w.id, f, atStart, away: atStart ? f.dir : [-f.dir[0], -f.dir[1]] };   // along the wall, away from the corner
    });
    if (ends.some(e => !e)) return;
    const [A, B] = ends, cos = A.away[0] * B.away[0] + A.away[1] * B.away[1];
    const theta = Math.acos(Math.max(-1, Math.min(1, cos)));
    if (Math.abs(theta - Math.PI / 2) < Math.PI / 180) return;                 // square: corners.js
    if (A.f.inward[0] * B.away[0] + A.f.inward[1] * B.away[1] <= 0.01) return;  // an outside corner: runs don't meet
    out.push({ c: [c.x, c.y], theta, ends });
  });
  return out;
}
// How far from the corner a cabinet `depth` deep sits so its front meets the other wall's
function angleSetback(theta, depth) { return depth / Math.tan(theta / 2); }

// Snap spots on a wall for an item next to an angled corner (palette.js snapCandidates)
function angleSnapCandidates(r, item) {
  const out = [], d = (item.depth || itemDepth(item)) + (item.wallOffset || 0), len = wallLength(r, item.wall);
  angledCorners(r).forEach(k => k.ends.forEach(e => {
    if (e.wall !== item.wall) return;
    const s = angleSetback(k.theta, d);
    if (s > 0 && s < len) out.push(e.atStart ? s : len - s - item.width);
  }));
  return out;
}

// The piece on a wall closest to an angled corner, standing on the floor (bases, tall, floor appliances)
function _nearestFloorPiece(r, end) {
  const len = wallLength(r, end.wall);
  const list = [...r.cabinets, ...(r.appliances || [])].filter(i => i.wall === end.wall && (CATALOG[i.type] || APPLIANCES[i.type])
    && itemVerticalRange(i)[0] < 1 && itemVerticalRange(i)[1] > 20 && !(APPLIANCES[i.type] && (APPLIANCES[i.type].builtIn || APPLIANCES[i.type].wallMount)));
  if (!list.length) return null;
  return list.reduce((best, i) => {
    const gap = end.atStart ? (i.offset || 0) : len - (i.offset || 0) - i.width;
    return !best || gap < best.gap ? { item: i, gap } : best;
  }, null).item;
}
// A piece's end face on the corner side: [front point, back point] in room inches
function _cornerEndFace(r, end, it) {
  const f = end.f, len = wallLength(r, end.wall), t = end.atStart ? (it.offset || 0) : (it.offset || 0) + it.width;
  const d0 = it.wallOffset || 0, d1 = d0 + (CATALOG[it.type] ? (it.depth || CATALOG[it.type].depth) : itemDepth(it));
  const P = d => [f.start[0] + f.dir[0] * t + f.inward[0] * d, f.start[1] + f.dir[1] * t + f.inward[1] * d];
  return [P(d1), P(d0)];
}
function _lineHit(p1, p2, q1, q2) {   // where line p1→p2 meets line q1→q2 (as a fraction along p), or null
  const r = [p2[0] - p1[0], p2[1] - p1[1]], s = [q2[0] - q1[0], q2[1] - q1[1]], den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  return ((q1[0] - p1[0]) * s[1] - (q1[1] - p1[1]) * s[0]) / den;
}
// The tapered fillers a room needs → [{ id, wall, pts, front, height, theta, between: [A, B] }]
function angleFillers(r) {
  const out = [];
  angledCorners(r).forEach(k => {
    const [EA, EB] = k.ends, A = _nearestFloorPiece(r, EA), B = _nearestFloorPiece(r, EB);
    if (!A || !B) return;
    if (itemRects(r, A).some(a => itemRects(r, B).some(b => shapesOverlap(a, b)))) return;   // overlapping: the fit check says so
    const [FA, BA] = _cornerEndFace(r, EA, A), [FB, BB] = _cornerEndFace(r, EB, B);
    const front = Math.hypot(FA[0] - FB[0], FA[1] - FB[1]);
    if (front < 0.25 || front > ANGLE_FILLER_MAX) return;
    // The filler itself: a 3/4" strip across the front gap, set back along each cabinet's end
    // face (the space behind it stays empty, under the countertop)
    const back = (F, Bk) => { const L = Math.hypot(Bk[0] - F[0], Bk[1] - F[1]) || 1; return [F[0] + (Bk[0] - F[0]) / L * 0.75, F[1] + (Bk[1] - F[1]) / L * 0.75]; };
    const pts = [FA, FB, back(FB, BB), back(FA, BA)];
    const height = Math.min(itemVerticalRange(A)[1], itemVerticalRange(B)[1]);
    out.push({ id: `angle:${A.id}:${B.id}`, wall: EA.wall, pts, front: Math.round(front * 16) / 16, height, theta: k.theta, between: [A, B] });
  });
  return out;
}
// As quote / order list pieces: filler stock ripped to the front width (rooms.js quoteCabinets)
function angleFillerPieces(r) {
  return angleFillers(r).map(af => ({
    id: af.id, type: 'filler3', wall: af.wall, width: af.front, height: af.height, depth: 0.75,
    styleOverride: af.between[0].styleOverride || null, _angleFor: af.between.map(i => i.id),
    note: `Tapered filler for the ${Math.round(af.theta * 180 / Math.PI)}° corner between ${itemLabel(af.between[0])} and ${itemLabel(af.between[1])}`,
  }));
}

// ── Mitered countertops ──
// A counter run that reaches an angled corner (within its setback + 12") gets that end cut on
// the corner's bisector; returns the run's top as a polygon (back-start, back-end, front-end,
// front-start), or null when neither end is at an angled corner.
function mitredCounterPoly(r, run, runs) {
  const f = wallFrame(r, run.wall); if (!f) return null;
  const len = wallLength(r, run.wall);
  let pts = frameQuad(f, run.a, run.b, 0, run.depth), cut = false;
  angledCorners(r).forEach(k => {
    const me = k.ends.find(e => e.wall === run.wall), other = k.ends.find(e => e.wall !== run.wall); if (!me) return;
    const reach = angleSetback(k.theta, run.depth) + 12;
    if (me.atStart ? run.a > reach : len - run.b > reach) return;
    // the other wall needs a counter at this corner too
    const theirs = runs.find(o => o.wall === other.wall && (other.atStart ? o.a <= angleSetback(k.theta, o.depth) + 12 : wallLength(r, o.wall) - o.b <= angleSetback(k.theta, o.depth) + 12));
    if (!theirs) return;
    const bis = [me.away[0] + other.away[0], me.away[1] + other.away[1]], C = k.c, C2 = [C[0] + bis[0], C[1] + bis[1]];
    const [i0, i1] = me.atStart ? [0, 3] : [1, 2];     // the back and front points at the corner end
    [[i0, me.atStart ? 1 : 0], [i1, me.atStart ? 2 : 3]].forEach(([i, j]) => {
      const t = _lineHit(pts[j], pts[i], C, C2);
      if (t != null) pts[i] = [pts[j][0] + (pts[i][0] - pts[j][0]) * t, pts[j][1] + (pts[i][1] - pts[j][1]) * t];
    });
    cut = true;
  });
  return cut ? pts : null;
}
function polygonArea(pts) { let a = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }); return Math.abs(a) / 2; }
