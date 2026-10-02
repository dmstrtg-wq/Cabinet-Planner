// My Cabinet Planner — js/corners.js
// Corner cabinets that occupy TWO walls (Dan, 2026-10-02):
//   • Lazy Susan (LS33 / LS36): an L — the width along EACH wall, 24" deep; two bifold
//     doors (9" on an LS33, 12" on an LS36) on the inside faces, meeting at 90°.
//   • Diagonal Corner Wall (DCW24 / DCW27): the width along each wall, 12" deep sides,
//     one angled door across the corner (~17" on a DCW24).
// A cabinet is placed on one wall, but when it sits at that wall's end, it also claims
// the same width on the wall that meets it there. Everything that asks "what's on this
// wall?" (placement, snapping, gaps, countertops, crown, elevations, 3D) goes through here.
// Positions use a corner frame: C = the corner point, U = along the placed wall away from
// the corner, V = into the room (= along the other wall). Room inches throughout.
// Loaded by app.html as a classic script (shared global scope). Load order matters —
// see the <script> list at the bottom of app.html.

// ════════════════════════════
// GEOMETRY
// ════════════════════════════
const CORNER_SPEC = { lazysusan: { leg: 24 }, diagWall: { leg: 12 } };

function cornerInfo(r, item) {
  const spec = CORNER_SPEC[item.type]; if (!spec || !item.wall) return null;
  const f = wallFrame(r, item.wall); if (!f) return null;
  const len = wallLength(r, item.wall), off = item.offset || 0, S = item.width;
  const atStart = off < 1.01, atEnd = off + S > len - 1.01;
  if (!atStart && !atEnd) return null;                       // mid-wall: an ordinary box
  const C = atStart ? [f.start[0], f.start[1]] : [f.start[0] + f.dir[0] * len, f.start[1] + f.dir[1] * len];
  const U = atStart ? [f.dir[0], f.dir[1]] : [-f.dir[0], -f.dir[1]];
  const V = [f.inward[0], f.inward[1]];
  // The other wall that meets this one at C and runs into the room along V
  let w2 = null, w2Off = 0, w2AtStart = true;
  for (const w of roomWalls(r)) {
    if (w === item.wall) continue;
    const g = wallFrame(r, w); if (!g) continue;
    if (Math.abs(g.dir[0] * V[0] + g.dir[1] * V[1]) < 0.99) continue;
    const L2 = wallLength(r, w), gEnd = [g.start[0] + g.dir[0] * L2, g.start[1] + g.dir[1] * L2];
    if (Math.hypot(g.start[0] - C[0], g.start[1] - C[1]) < 1.5) { w2 = w; w2Off = 0; w2AtStart = true; break; }
    if (Math.hypot(gEnd[0] - C[0], gEnd[1] - C[1]) < 1.5) { w2 = w; w2Off = L2 - S; w2AtStart = false; break; }
  }
  return { C, U, V, S, leg: spec.leg, atStart, w2, w2Off, w2AtStart };
}
// Corner frame (u along the placed wall, v into the room) → room point
function cornerPt(ci, u, v) { return [ci.C[0] + ci.U[0] * u + ci.V[0] * v, ci.C[1] + ci.U[1] * u + ci.V[1] * v]; }
function rectOfPts(pts) {
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
function cornerBox(ci, u0, u1, v0, v1) { return rectOfPts([cornerPt(ci, u0, v0), cornerPt(ci, u1, v0), cornerPt(ci, u0, v1), cornerPt(ci, u1, v1)]); }
// Outline in (u,v): LS = L, DCW = five-sided with the angled front
function cornerOutlineUV(item, ci) {
  const S = ci.S, L = ci.leg;
  return item.type === 'diagWall'
    ? [[0, 0], [S, 0], [S, L], [L, S], [0, S]]
    : [[0, 0], [S, 0], [S, L], [L, L], [L, S], [0, S]];
}
// The space an item takes in plan — one rectangle normally, two for a corner cabinet
function itemRects(r, item) {
  const ci = cornerInfo(r, item);
  if (!ci) { const rc = itemRect(r, item); return rc ? [rc] : []; }
  return [cornerBox(ci, 0, ci.S, 0, ci.leg), cornerBox(ci, 0, ci.leg, 0, ci.S)];
}
// What a corner cabinet puts on the OTHER wall: a stand-in item there, so runs, gaps,
// countertops and crown on that wall account for it.
function cornerReturnItems(r, wall) {
  const out = [];
  r.cabinets.forEach(c => {
    const ci = cornerInfo(r, c); if (!ci || ci.w2 !== wall) return;
    out.push({ ...c, id: c.id + ':ret', wall, offset: ci.w2Off, depth: ci.leg, _returnOf: c.id });
  });
  return out;
}
function wallItemsWithReturns(r, wall) { return wallItems(r, wall).concat(cornerReturnItems(r, wall)); }

// For drawing a corner cabinet on a wall's elevation: along-wall position of a distance
// `d` measured from the corner. Works on the placed wall and on the other wall.
function cornerTOnWall(r, cab, ci, wall) {
  if (wall === cab.wall) return ci.atStart ? (d => d) : (d => wallLength(r, wall) - d);
  if (wall === ci.w2) return ci.w2AtStart ? (d => d) : (d => wallLength(r, wall) - d);
  return null;
}

// ════════════════════════════
// FLOOR PLAN
// ════════════════════════════
function drawCornerOnFloor(ctx, r, cab, ci, scale, RX, RY, isActive) {
  const cat = CATALOG[cab.type];
  const pts = cornerOutlineUV(cab, ci).map(([u, v]) => cornerPt(ci, u, v)).map(([x, y]) => [RX + x * scale, RY + y * scale]);
  ctx.save();
  ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
  if (cab.type === 'diagWall') {                      // uppers: light fill + dashed outline (NKBA)
    ctx.globalAlpha = 0.18; ctx.fillStyle = cat.color; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = isActive ? cat.color : 'rgba(0,0,0,0.55)'; ctx.lineWidth = isActive ? 2 : 1.2; ctx.setLineDash([5, 3]); ctx.stroke(); ctx.setLineDash([]);
  } else {
    ctx.globalAlpha = 0.88; ctx.fillStyle = cat.color; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = isActive ? cat.color : 'rgba(0,0,0,0.25)'; ctx.lineWidth = isActive ? 2 : 1.5; ctx.stroke();
    // rotating shelves: circles centered in the corner square
    const [cx, cy] = cornerPt(ci, ci.leg * 0.5, ci.leg * 0.5).map((q, k) => (k ? RY : RX) + q * scale);
    const r1 = ci.leg * 0.4 * scale;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r1, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r1 * 0.4, 0, Math.PI * 2); ctx.stroke();
    // bifold doors on the two inside faces
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
    const P = (u, v) => cornerPt(ci, u, v).map((q, k) => (k ? RY : RX) + q * scale);
    ctx.beginPath(); ctx.moveTo(...P(ci.leg, ci.leg)); ctx.lineTo(...P(ci.S, ci.leg)); ctx.moveTo(...P(ci.leg, ci.leg)); ctx.lineTo(...P(ci.leg, ci.S)); ctx.stroke();
  }
  // label in the middle of the shape
  const [lx, ly] = cornerPt(ci, ci.S * 0.42, ci.leg * (cab.type === 'diagWall' ? 0.5 : 0.55)).map((q, k) => (k ? RY : RX) + q * scale);
  ctx.fillStyle = cab.type === 'diagWall' ? '#1e293b' : '#fff';
  ctx.font = `bold ${Math.max(8, Math.min(scale * 2.0, 11))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`${cat.abbr}${fmtFrac(cab.width).replace('"', '')}`, lx, ly);
  ctx.restore();
}

// ════════════════════════════
// ELEVATION (true view, the same on both walls)
// ════════════════════════════
// LS: the 24" next to the corner is the other leg seen end-on (set back, shaded); the
// rest is this wall's bifold door. DCW: the 12" next to the corner is the side of the
// other leg; the rest is the angled door, seen at an angle.
// style = the cabinet's door style (elevation's cabStyle); dark = light text on it
function drawElevCorner(ctx, r, cab, ci, wall, scale, floorY, eX, PDF, style, dark) {
  const tOf = cornerTOnWall(r, cab, ci, wall); if (!tOf) return;
  const [bot, top] = itemVerticalRange(cab);
  const swatch = PDF ? '#FFFFFF' : style.swatch;
  const seg = (d0, d1) => { const a = Math.min(tOf(d0), tOf(d1)), b = Math.max(tOf(d0), tOf(d1)); return { x: eX(a, b - a), w: (b - a) * scale }; };
  const yTop = floorY - top * scale, h = (top - bot) * scale;
  const isBase = cab.type === 'lazysusan';
  const kickH = isBase ? TOE_KICK_H * scale : 0;
  // 1) next to the corner: the other leg / side panel
  const A = seg(0, ci.leg);
  ctx.fillStyle = PDF ? '#F3F3F3' : '#' + shade3D(style.swatch, -22).toString(16).padStart(6, '0');
  ctx.fillRect(A.x, yTop, A.w, h);
  ctx.strokeStyle = PDF ? '#1a1a1a' : '#64748B'; ctx.lineWidth = PDF ? 1.5 : 1.2; ctx.strokeRect(A.x, yTop, A.w, h);
  // 2) the door on this face
  const B = seg(ci.leg, ci.S);
  ctx.fillStyle = swatch; ctx.fillRect(B.x, yTop, B.w, h - kickH);
  ctx.strokeRect(B.x, yTop, B.w, h - kickH);
  drawDoorPanel(ctx, B.x, yTop, B.w, h - kickH, style.code, scale, PDF);
  // pull: near the outer (open) edge of the door, top on bases, bottom on uppers
  const outerX = eX(tOf(ci.S), 0);                       // screen x of the door's outer (open) edge
  const px = Math.abs(outerX - B.x) < Math.abs(outerX - (B.x + B.w)) ? B.x + 6 : B.x + B.w - 8;
  const py = isBase ? yTop + 10 : yTop + h - 22;
  ctx.fillStyle = PDF ? '#555555' : '#94A3B8'; ctx.fillRect(px, py, 2.5, 14);
  if (isBase) { ctx.fillStyle = PDF ? '#888888' : '#94A3B8'; ctx.fillRect(Math.min(A.x, B.x), floorY - kickH, A.w + B.w, kickH); }
  // label across the whole cabinet
  const all = seg(0, ci.S);
  ctx.fillStyle = PDF ? '#1a1a1a' : (dark ? '#fff' : '#334155');
  ctx.font = `600 ${Math.max(8, Math.min(scale * 1.9, 11))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`${CATALOG[cab.type].abbr}${fmtFrac(cab.width).replace('"', '')}`, A.x + A.w / 2, yTop + h / 2);
  if (wall === cab.wall && showItemNumbers && cab.itemNum) drawItemHexagon(ctx, all.x + all.w / 2, yTop, cab.itemNum, PDF);
}

// ════════════════════════════
// 3D
// ════════════════════════════
function buildCorner3D(r, cab, ci, kit, p) {
  const g = new THREE.Group();
  const info = doorStyleInfo(cab.styleOverride || p.style);
  const bodyMat = new THREE.MeshStandardMaterial({ color: info.swatch, roughness: 0.65, metalness: 0.05 });
  const kickMat = new THREE.MeshStandardMaterial({ color: shade3D(info.swatch, -70), roughness: 0.8 });
  const [bot, top] = itemVerticalRange(cab);
  const boxUV = (u0, u1, v0, v1, y0, y1, mat, tag) => {
    const R = cornerBox(ci, u0, u1, v0, v1); if (R.w <= 0.01 || R.h <= 0.01 || y1 - y0 <= 0.01) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(R.w, y1 - y0, R.h), mat);
    m.position.set(R.x + R.w / 2, (y0 + y1) / 2, R.y + R.h / 2); m.castShadow = m.receiveShadow = true;
    if (tag) m.userData.itemId = cab.id;
    g.add(m);
  };
  // A door on a face from uv point A to uv point B, facing outward along uv normal N
  const faceDoor = (Auv, Buv, Nuv, y0, y1, extra = {}) => {
    const A = cornerPt(ci, ...Auv), B = cornerPt(ci, ...Buv);
    const n = [ci.U[0] * Nuv[0] + ci.V[0] * Nuv[1], ci.U[1] * Nuv[0] + ci.V[1] * Nuv[1]];
    const nl = Math.hypot(n[0], n[1]); n[0] /= nl; n[1] /= nl;
    const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], w = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const sub = new THREE.Group(); sub.position.set(M[0], 0, M[1]); sub.rotation.y = Math.atan2(n[0], n[1]);
    const th = sub.rotation.y, localX = [Math.cos(th), -Math.sin(th)];
    let hinge = extra.hinge || 'L';
    if (extra.pullNear) {                     // handle near this uv point → hinge on the other side
      const P = cornerPt(ci, ...extra.pullNear);
      hinge = ((P[0] - M[0]) * localX[0] + (P[1] - M[1]) * localX[1]) > 0 ? 'L' : 'R';
    }
    const fr = { x0: -w / 2 + REVEAL / 2, x1: w / 2 - REVEAL / 2, y0, y1, kind: 'door', hinge, glass: !!extra.glass };
    addFront(sub, kit, info, fr);
    if (!extra.noPull) addHardware(sub, kit, fr, cab.type === 'diagWall');
    g.add(sub);
  };
  if (cab.type === 'lazysusan') {
    const L = ci.leg, S = ci.S, K = TOE_KICK_H;
    boxUV(0, S, 0, L, K, top, bodyMat, true);             // placed-wall leg
    boxUV(0, L, L, S, K, top, bodyMat, true);             // other-wall leg
    boxUV(0, S, 0, L - TOE_RECESS, 0, K, kickMat);        // recessed toe kick along both inside faces
    boxUV(0, L - TOE_RECESS, L - TOE_RECESS, S, 0, K, kickMat);
    // Bifold doors on the inside faces, meeting in the corner; one handle, at the outer edge
    faceDoor([L, L], [S, L], [0, 1], K + REVEAL / 2, top - REVEAL / 2, { pullNear: [S, L] });
    faceDoor([L, L], [L, S], [1, 0], K + REVEAL / 2, top - REVEAL / 2, { noPull: true });
  } else {
    // Diagonal corner wall: five-sided box, angled door across the corner
    const shape = new THREE.Shape();
    cornerOutlineUV(cab, ci).forEach(([u, v], i) => { const [x, z] = cornerPt(ci, u, v); i ? shape.lineTo(x, -z) : shape.moveTo(x, -z); });
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: top - bot, bevelEnabled: false }), bodyMat);
    m.rotation.x = -Math.PI / 2; m.position.y = bot; m.castShadow = m.receiveShadow = true; m.userData.itemId = cab.id;
    g.add(m);
    faceDoor([ci.S, ci.leg], [ci.leg, ci.S], [1, 1], bot + REVEAL / 2, top - REVEAL / 2, { hinge: cab.hinge || 'L', glass: cab.glassDoors });
  }
  return g;
}
