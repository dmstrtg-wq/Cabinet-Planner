// My Cabinet Planner — js/gaps.js
// Live gap dimensions: while an item is selected, dragged, or previewed from the palette,
// show the exact gap to the nearest neighbour / wall end / door on each side, plus the open
// space left along that wall. With "Dims" on, open space shows on every wall. Build Plan 2.4.
// Loaded by app.html as a classic script (shared global scope). Load order matters —
// see the <script> list at the bottom of app.html.

// ════════════════════════════
// GAP MATH
// ════════════════════════════
// Stretches of a wall that are blocked at a given height band, as [start, end] inches from
// the wall's "from left" 0: items on this wall, the run coming in from a neighbouring wall
// (measured to its face), and doors/windows.
function wallObstacles(r, wall, band, excludeId) {
  const f = wallFrame(r, wall); if (!f) return [];
  const len = wallLength(r, wall);
  const out = [];
  wallItems(r, wall).forEach(i => {
    if (i.id !== excludeId && rangesOverlap(itemVerticalRange(i), band)) out.push([i.offset || 0, (i.offset || 0) + i.width]);
  });
  // Neighbouring runs that reach into this wall's strip (inside corners)
  const stripDepth = band[0] >= 48 ? 13 : 25;
  roomItems(r).forEach(i => {
    if (!i.wall || i.wall === wall || i.id === excludeId || !rangesOverlap(itemVerticalRange(i), band)) return;
    const b = itemRect(r, i); if (!b) return;
    const corners = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]];
    const along = corners.map(([x, y]) => (x - f.start[0]) * f.dir[0] + (y - f.start[1]) * f.dir[1]);
    const depth = corners.map(([x, y]) => (x - f.start[0]) * f.inward[0] + (y - f.start[1]) * f.inward[1]);
    if (Math.min(...depth) < stripDepth - 0.01 && Math.max(...depth) > 0.01) {
      const a = Math.max(0, Math.min(...along)), z = Math.min(len, Math.max(...along));
      if (z > a) out.push([a, z]);
    }
  });
  (r.openings || []).forEach(o => {
    if (o.wall !== wall) return;
    const vr = o.type === 'window' ? [o.sillHeight ?? 36, (o.sillHeight ?? 36) + o.height]
             : (o.type === 'door' || o.type === 'arch') ? [0, o.height] : null;
    if (vr && rangesOverlap(vr, band)) out.push([o.offset, o.offset + o.width]);
  });
  return out.sort((a, b) => a[0] - b[0]);
}
// Open stretches along a wall at a height band
function wallOpenSpans(r, wall, band, excludeId) {
  const len = wallLength(r, wall), spans = [];
  let pos = 0;
  wallObstacles(r, wall, band, excludeId).forEach(([a, b]) => { if (a > pos + 0.06) spans.push([pos, Math.min(a, len)]); pos = Math.max(pos, b); });
  if (len > pos + 0.06) spans.push([pos, len]);
  return spans;
}
// Gaps on either side of one item: { left:[a,b]|null, right:[a,b]|null } (null = touching)
function itemSideGaps(r, item) {
  const off = item.offset || 0, end = off + item.width, len = wallLength(r, item.wall);
  const obs = wallObstacles(r, item.wall, itemVerticalRange(item), item.id);
  // Nearest thing on each side. Anything overlapping the item counts as touching (no gap),
  // so an overlap never shows a misleading measurement to something further away.
  let leftEdge = 0, rightEdge = len;
  obs.forEach(([a, b]) => {
    if (b < end - 0.01) leftEdge = Math.max(leftEdge, b);
    if (a > off + 0.01) rightEdge = Math.min(rightEdge, a);
  });
  return {
    left:  off - leftEdge > 0.06 ? [leftEdge, off] : null,
    right: rightEdge - end > 0.06 ? [end, rightEdge] : null,
  };
}
// The item the live dimensions are about: the palette preview while dragging one in,
// otherwise the selected item (which is also what you're dragging)
function gapSubject() {
  if (typeof placementGhost !== 'undefined' && placementGhost && placementGhost.item.wall && !placementGhost.issue) return placementGhost.item;
  const it = getSelectedItem();
  return it && it.wall ? it : null;
}

// ════════════════════════════
// DRAWING
// ════════════════════════════
const GAP_COLOR = '#0f766e', OPEN_COLOR = '#64748b';

function drawDimLabel(ctx, text, x, y, color, bold) {
  ctx.save();
  ctx.font = `${bold ? 700 : 600} ${bold ? 12 : 10}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 8, h = bold ? 17 : 14;
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
  ctx.restore();
}
function drawDimSegment(ctx, x1, y1, x2, y2, color, bold, label) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = bold ? 1.6 : 1; ctx.setLineDash(bold ? [] : [4, 3]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.setLineDash([]);
  // end ticks, perpendicular to the line
  const len = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / len * 5, ny = (x2 - x1) / len * 5;
  [[x1, y1], [x2, y2]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x - nx, y - ny); ctx.lineTo(x + nx, y + ny); ctx.stroke(); });
  ctx.restore();
  drawDimLabel(ctx, label, (x1 + x2) / 2, (y1 + y2) / 2, color, bold);
}

// Floor plan: lines run along the wall, `depthIn` inches out from it
function drawFloorSpan(ctx, r, wall, a, b, depthIn, scale, RX, RY, color, bold, label) {
  const f = wallFrame(r, wall); if (!f) return;
  const P = t => [RX + (f.start[0] + f.dir[0] * t + f.inward[0] * depthIn) * scale, RY + (f.start[1] + f.dir[1] * t + f.inward[1] * depthIn) * scale];
  const [x1, y1] = P(a), [x2, y2] = P(b);
  drawDimSegment(ctx, x1, y1, x2, y2, color, bold, label);
}
function drawFloorGaps(ctx, r, scale, RX, RY) {
  const subj = gapSubject();
  const walls = ['north', 'south', 'east', 'west', ...(getLShapeData(r) ? ['step1', 'step2'] : [])];
  // Open space: on every wall with Dims on, otherwise just the subject's wall
  const openWalls = showDimensions ? walls : (subj ? [subj.wall] : []);
  openWalls.forEach(w => {
    const band = subj && subj.wall === w ? itemVerticalRange(subj) : LEVEL_BANDS.base;
    const ignore = subj ? subj.id : null;
    const sideSpans = subj && subj.wall === w ? Object.values(itemSideGaps(r, subj)).filter(Boolean) : [];
    wallOpenSpans(r, w, band, ignore)
      .filter(([a, b]) => !sideSpans.some(([c, d]) => Math.abs(c - a) < 0.01 && Math.abs(d - b) < 0.01) && !(subj && subj.wall === w && a < subj.offset + subj.width && subj.offset < b))
      .forEach(([a, b]) => drawFloorSpan(ctx, r, w, a, b, 12, scale, RX, RY, OPEN_COLOR, false, 'open ' + fmtFrac(b - a)));
  });
  if (!subj) return;
  const g = itemSideGaps(r, subj), mid = itemDepth(subj) / 2;
  if (g.left)  drawFloorSpan(ctx, r, subj.wall, g.left[0],  g.left[1],  mid, scale, RX, RY, GAP_COLOR, true, fmtFrac(g.left[1] - g.left[0]));
  if (g.right) drawFloorSpan(ctx, r, subj.wall, g.right[0], g.right[1], mid, scale, RX, RY, GAP_COLOR, true, fmtFrac(g.right[1] - g.right[0]));
}

// Elevation: horizontal lines across the gap at a given height
function drawElevGaps(ctx, r, wall, scale, floorY, eX) {
  const subj = gapSubject();
  const onWall = subj && subj.wall === wall;
  const xs = (a, b) => { const x = eX(a, b - a); return [x, x + (b - a) * scale]; };
  const bands = onWall ? [itemVerticalRange(subj)] : (showDimensions ? [LEVEL_BANDS.base, LEVEL_BANDS.upper] : []);
  bands.forEach(band => {
    const y = floorY - ((band[0] + band[1]) / 2) * scale;
    const sideSpans = onWall ? Object.values(itemSideGaps(r, subj)).filter(Boolean) : [];
    wallOpenSpans(r, wall, band, onWall ? subj.id : null)
      .filter(([a, b]) => !sideSpans.some(([c, d]) => Math.abs(c - a) < 0.01 && Math.abs(d - b) < 0.01) && !(onWall && a < subj.offset + subj.width && subj.offset < b))
      .forEach(([a, b]) => { const [x1, x2] = xs(a, b); drawDimSegment(ctx, x1, y, x2, y, OPEN_COLOR, false, 'open ' + fmtFrac(b - a)); });
  });
  if (!onWall) return;
  const g = itemSideGaps(r, subj), [bot, top] = itemVerticalRange(subj), y = floorY - ((bot + top) / 2) * scale;
  [g.left, g.right].filter(Boolean).forEach(([a, b]) => { const [x1, x2] = xs(a, b); drawDimSegment(ctx, x1, y, x2, y, GAP_COLOR, true, fmtFrac(b - a)); });
}
