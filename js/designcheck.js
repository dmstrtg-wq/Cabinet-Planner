// My Cabinet Planner — js/designcheck.js
// Design Check (Build Plan 5.1): a non-blocking list of layout problems, each one marked
// on the floor plan and clickable to jump to it. Rules follow common NKBA kitchen
// guidelines; every number is in DESIGN_RULES so they can be tuned in one place.
// Aisles are measured countertop edge to countertop edge (cabinet + 1" overhang).
// Levels: problem (won't work as drawn), warning (below the guideline), tip (worth a look).
// Silver feature: demo shows it in full (it's the showcase); Free accounts see the count.
// Loaded by app.html as a classic script (shared global scope). Load order matters —
// see the <script> list at the bottom of app.html.

// ════════════════════════════
// RULES (all inches)
// ════════════════════════════
const DESIGN_RULES = {
  aisle:        { walkway: 36, work: 42, twoCook: 48 },  // < walkway = problem, < work = warning, < twoCook = tip
  doorSwing:    { dishwasher: 26, range: 22, wallOven: 22 }, // how far the door reaches out when open
  landing: {
    cookOneSide: 12, cookOtherSide: 15,                 // range / cooktop
    sinkOneSide: 24, sinkOtherSide: 18,                 // sink
    fridge: 15, fridgeAcross: 48,                       // fridge: beside it, or on an island within 48"
  },
  upperAboveCounter: 18,                                // bottom of uppers over a countertop
  hoodAboveCooktop: 24,                                 // bottom of a hood over the cooking surface
  cornerClearance: 1.5,                                 // filler where two runs meet so doors/drawers clear
  minOverlap: 6,                                        // runs must face each other at least this much to form an aisle
};
const DC_LEVELS = { problem: { label: 'Problem', color: '#DC2626' }, warning: { label: 'Warning', color: '#D97706' }, tip: { label: 'Tip', color: '#2563EB' } };

// ════════════════════════════
// GEOMETRY HELPERS
// ════════════════════════════
const _dcCorners = R => [[R.x, R.y], [R.x + R.w, R.y], [R.x, R.y + R.h], [R.x + R.w, R.y + R.h]];
const _dcAlong = (f, q) => (q[0] - f.start[0]) * f.dir[0] + (q[1] - f.start[1]) * f.dir[1];
const _dcOut = (f, q) => (q[0] - f.start[0]) * f.inward[0] + (q[1] - f.start[1]) * f.inward[1];
const _dcPt = (f, t, d) => [f.start[0] + f.dir[0] * t + f.inward[0] * d, f.start[1] + f.dir[1] * t + f.inward[1] * d];
function _dcSpan(f, rects) {
  const pts = rects.flatMap(_dcCorners);
  return { a0: Math.min(...pts.map(q => _dcAlong(f, q))), a1: Math.max(...pts.map(q => _dcAlong(f, q))),
           o0: Math.min(...pts.map(q => _dcOut(f, q))), o1: Math.max(...pts.map(q => _dcOut(f, q))) };
}
// Footprint in plan, with the countertop's front overhang where there's a countertop
function _dcPlanRects(r, i) {
  const rs = itemRects(r, i); if (!rs.length) return [];
  if (!coversCounter(i)) return rs;
  const f = wallFrame(r, i.wall); if (!f) return rs;
  return rs.map(R => {
    const pts = _dcCorners(R).concat(_dcCorners(R).map(q => [q[0] + f.inward[0] * COUNTER_FRONT, q[1] + f.inward[1] * COUNTER_FRONT]));
    return rectOfPts(pts);
  });
}
const _dcIsFloor = (r, i) => { const [b, t] = itemVerticalRange(i); return b < 1 && t > 20 && !(APPLIANCES[i.type] && applianceHost(r, i)); };
const _dcLabel = i => i._island ? (i.label || 'the island') : itemLabel(i);
const _dcName = i => i._island ? (i.label || 'Island') : (CATALOG[i.type] ? CATALOG[i.type].label : APPLIANCES[i.type].label);
const _dcIn = v => fmtFrac(Math.round(v * 8) / 8);
// Wall name as the app shows it (L-room inner walls use their own labels)
function _dcWallName(r, w) {
  const main = { north: 'North', south: 'South', east: 'East', west: 'West' }[w]; if (main) return main;
  const ld = getLShapeData(r); return ld && ld[w] ? ld[w].label : 'Inner';
}
// Does this piece have doors/drawers on its face? (fillers, panels and corner units designed
// for the corner don't count for the corner-clearance rule)
function _dcHasFront(i) {
  if (CATALOG[i.type]) return !isFiller(i.type) && !['fridgePanel', 'lazysusan', 'diagWall'].includes(i.type);
  return ['dishwasher', 'range', 'refrigerator', 'beverageCooler', 'microwave'].includes(i.type);
}

// ════════════════════════════
// THE CHECK
// ════════════════════════════
// → [{ key, level, title, detail, itemIds:[], rects:[{x,y,w,h}] (plan inches), wall }]
function computeDesignIssues(r) {
  if (!r) return [];
  const R = DESIGN_RULES, out = [];
  const walls = roomWalls(r);
  const items = [...r.cabinets, ...(r.appliances || [])].filter(i => i.wall && wallFrame(r, i.wall));
  const islands = (r.islands || []).map(isl => ({ ...isl, _island: true,
    _rect: { x: isl.x - COUNTER_SIDE, y: isl.y - COUNTER_SIDE, w: isl.width + 2 * COUNTER_SIDE, h: isl.depth + 2 * COUNTER_SIDE } }));
  const rectsOf = i => i._island ? [i._rect] : _dcPlanRects(r, i);
  const add = (level, key, title, detail, list, extraRects = [], wall = null) =>
    out.push({ level, key, title, detail, itemIds: list.filter(i => !i._island).map(i => i.id),
      rects: [...list.flatMap(i => i._island ? [i._rect] : itemRects(r, i)), ...extraRects], wall: wall || (list.find(i => i.wall) || {}).wall || null });

  // ── 1. Pieces that don't fit where they are (overlaps, past the wall end, over a door/window, corners)
  const seenPairs = new Set();     // "A hits B" and "B hits A" are one problem
  items.forEach(i => {
    const issue = placementIssue(r, i); if (!issue) return;
    const m = issue.match(/^(?:Hits (.+) in the corner|Overlaps (.+))$/);
    if (m) {
      const pair = [itemLabel(i), m[1] || m[2]].sort().join('|');
      if (seenPairs.has(pair)) return;
      seenPairs.add(pair);
    }
    add('problem', 'place:' + i.id, `${itemLabel(i)}: ${lcFirst(issue)}`, 'Move or resize it so it fits.', [i]);
  });
  roomFitProblems(r).filter(x => /ceiling/.test(x.reason)).forEach(x =>
    add('problem', 'ceil:' + x.item.id, `${itemLabel(x.item)} is taller than the room`, `Its ${x.reason}.`, [x.item]));

  // ── 2. Aisles between runs that face each other, and between runs and islands
  const floorByWall = {}; walls.forEach(w => { floorByWall[w] = items.filter(i => i.wall === w && _dcIsFloor(r, i)); });
  const aisles = new Map();      // key → { gap, a, b, rect }
  walls.forEach((wa, ia) => {
    const fa = wallFrame(r, wa); if (!fa) return;
    const targets = [...islands];
    walls.forEach((wb, ib) => {
      const fb = wallFrame(r, wb);
      if (ib > ia && fb && fa.inward[0] * fb.inward[0] + fa.inward[1] * fb.inward[1] < -0.99) targets.push(...floorByWall[wb]);
    });
    floorByWall[wa].forEach(A => {
      const sa = _dcSpan(fa, rectsOf(A));
      targets.forEach(T => {
        const st = _dcSpan(fa, rectsOf(T));
        const o0 = Math.max(sa.a0, st.a0), o1 = Math.min(sa.a1, st.a1);
        if (o1 - o0 < R.minOverlap) return;
        const gap = st.o0 - sa.o1;
        if (gap < -0.5 || gap >= R.aisle.twoCook) return;
        const key = wa + '|' + (T._island ? 'isl:' + T.id : T.wall);
        const cur = aisles.get(key);
        const rect = rectOfPts([_dcPt(fa, o0, sa.o1), _dcPt(fa, o1, sa.o1), _dcPt(fa, o0, Math.max(sa.o1, st.o0)), _dcPt(fa, o1, Math.max(sa.o1, st.o0))]);
        if (!cur || gap < cur.gap - 0.01) aisles.set(key, { gap, A, T, rect, list: [A, T] });
        else if (Math.abs(gap - cur.gap) < 0.01) { cur.list.push(A, T); cur.rect = rectOfPts([..._dcCorners(cur.rect), ..._dcCorners(rect)]); }
      });
    });
  });
  aisles.forEach((v, key) => {
    const gap = Math.max(0, v.gap), what = v.T._island ? _dcLabel(v.T) : `the ${_dcWallName(r, v.T.wall)} run`   // (inner walls keep the arrow names the wall buttons use);
    const level = gap < R.aisle.walkway ? 'problem' : gap < R.aisle.work ? 'warning' : 'tip';
    const need = level === 'tip' ? `${R.aisle.twoCook}" is comfortable for two cooks` : `${R.aisle.work}" is the guideline for a work aisle (${R.aisle.walkway}" absolute minimum)`;
    const from = _dcWallName(r, v.A.wall);
    add(level, 'aisle:' + key, `${from} run to ${what}: ${_dcIn(gap)} aisle`, `Measured countertop to countertop. ${need}.`, [...new Set(v.list)], [v.rect], v.A.wall);
  });

  // ── 3. Appliance doors that hit something when open
  items.filter(i => R.doorSwing[i.type] && i.wall).forEach(A => {
    const fa = wallFrame(r, A.wall), sa = _dcSpan(fa, itemRects(r, A)), reach = R.doorSwing[A.type];
    const targets = [...islands, ...items.filter(i => i.wall && i.wall !== A.wall && _dcIsFloor(r, i) && (() => {
      const fb = wallFrame(r, i.wall); return fb && fa.inward[0] * fb.inward[0] + fa.inward[1] * fb.inward[1] < -0.99; })())];
    targets.forEach(T => {
      const st = _dcSpan(fa, rectsOf(T));
      const o0 = Math.max(sa.a0, st.a0), o1 = Math.min(sa.a1, st.a1);
      if (o1 - o0 < 2) return;
      const gap = st.o0 - sa.o1;
      if (gap >= -0.5 && gap < reach) {
        const rect = rectOfPts([_dcPt(fa, sa.a0, sa.o1), _dcPt(fa, sa.a1, sa.o1), _dcPt(fa, sa.a0, sa.o1 + reach), _dcPt(fa, sa.a1, sa.o1 + reach)]);
        add('problem', 'swing:' + A.id + ':' + (T.id), `${_dcName(A)} door hits ${_dcLabel(T)} when open`,
          `The door reaches about ${reach}" out; there's ${_dcIn(Math.max(0, gap))}.`, [A, T], [rect]);
      }
    });
  });

  // ── 4. Landing space (counter beside the range/cooktop, sink, fridge)
  const runs = counterRuns(r);
  const runOn = (w, test) => runs.filter(run => run.wall === w && test(run));
  const sideLengths = i => {                       // counter on each side of a piece
    const a = i.offset || 0, b = a + i.width;
    const inside = runOn(i.wall, run => run.cabA <= a + 0.01 && run.cabB >= b - 0.01)[0];
    if (inside) return [a - inside.cabA, inside.cabB - b];
    const left = runOn(i.wall, run => Math.abs(run.cabB - a) <= 2.5)[0], right = runOn(i.wall, run => Math.abs(run.cabA - b) <= 2.5)[0];
    return [left ? left.cabB - left.cabA : 0, right ? right.cabB - right.cabA : 0];
  };
  items.filter(i => i.type === 'range' || i.type === 'cooktop').forEach(i => {
    const [s1, s2] = sideLengths(i), lo = Math.min(s1, s2), hi = Math.max(s1, s2);
    if (lo < R.landing.cookOneSide || hi < R.landing.cookOtherSide)
      add('warning', 'land:' + i.id, `${_dcName(i)}: not enough counter beside it`,
        `Has ${_dcIn(s1)} and ${_dcIn(s2)}. Guideline: ${R.landing.cookOneSide}" on one side and ${R.landing.cookOtherSide}" on the other.`, [i]);
  });
  items.filter(i => i.type === 'sink').forEach(i => {
    const [s1, s2] = sideLengths(i), lo = Math.min(s1, s2), hi = Math.max(s1, s2);
    if (hi < R.landing.sinkOneSide)
      add('warning', 'land:' + i.id, 'Sink: not enough counter beside it', `Has ${_dcIn(s1)} and ${_dcIn(s2)}. Guideline: ${R.landing.sinkOneSide}" on one side.`, [i]);
    else if (lo < R.landing.sinkOtherSide)
      add('tip', 'land2:' + i.id, 'Sink: short counter on one side', `Has ${_dcIn(lo)} on one side; ${R.landing.sinkOtherSide}" is the guideline for the second side.`, [i]);
  });
  items.filter(i => i.type === 'refrigerator').forEach(i => {
    const [s1, s2] = sideLengths(i);
    if (Math.max(s1, s2) >= R.landing.fridge) return;
    const fa = wallFrame(r, i.wall), sa = _dcSpan(fa, itemRects(r, i));
    const across = islands.some(T => { const st = _dcSpan(fa, [T._rect]); return Math.min(sa.a1, st.a1) - Math.max(sa.a0, st.a0) > 0 && st.o0 - sa.o1 <= R.landing.fridgeAcross; });
    if (!across) add('warning', 'land:' + i.id, 'Refrigerator: no counter to set things down',
      `Guideline: ${R.landing.fridge}" of counter beside it (handle side), or an island within ${R.landing.fridgeAcross}".`, [i]);
  });

  // ── 5. Heights over the countertop
  items.filter(i => CATALOG[i.type] && itemLevel(i) === 'upper').forEach(u => {
    const ub = itemVerticalRange(u)[0], a = u.offset || 0, b = a + u.width;
    const under = runOn(u.wall, run => run.cabA < b - 0.5 && run.cabB > a + 0.5);
    if (!under.length) return;
    const top = Math.max(...under.map(run => run.top + COUNTER_T)), clear = ub - top;
    if (clear >= 0 && clear < R.upperAboveCounter)
      add('warning', 'upper:' + u.id, `${itemLabel(u)} is only ${_dcIn(clear)} above the counter`, `Guideline: ${R.upperAboveCounter}" between the countertop and the bottom of the uppers.`, [u]);
  });
  items.filter(i => i.type === 'hood').forEach(h => {
    const hb = itemVerticalRange(h)[0], a = h.offset || 0, b = a + h.width;
    const cook = items.find(i => (i.type === 'range' || i.type === 'cooktop') && i.wall === h.wall && (i.offset || 0) < b - 1 && (i.offset || 0) + i.width > a + 1);
    if (!cook) return;
    const surface = cook.type === 'range' ? itemVerticalRange(cook)[1] : itemVerticalRange(cook)[1];
    if (hb - surface < R.hoodAboveCooktop)
      add('warning', 'hood:' + h.id, `Hood is ${_dcIn(hb - surface)} above the ${cook.type === 'range' ? 'range' : 'cooktop'}`,
        `Most hoods need at least ${R.hoodAboveCooktop}" (check the manufacturer's spec).`, [h, cook]);
  });

  // ── 6. Inside corners: doors/drawers on both runs need a filler between them
  const pairs = [];
  walls.forEach((wa, ia) => walls.forEach((wb, ib) => {
    if (ib <= ia) return;
    const fa = wallFrame(r, wa), fb = wallFrame(r, wb); if (!fa || !fb) return;
    if (Math.abs(fa.dir[0] * fb.dir[0] + fa.dir[1] * fb.dir[1]) > 0.01) return;      // must be perpendicular
    const La = wallLength(r, wa), Lb = wallLength(r, wb);
    [[0, fa.start], [La, _dcPt(fa, La, 0)]].forEach(([ta, Ca]) => [[0, fb.start], [Lb, _dcPt(fb, Lb, 0)]].forEach(([tb, Cb]) => {
      if (Math.hypot(Ca[0] - Cb[0], Ca[1] - Cb[1]) < 1.5) pairs.push({ wa, wb, aStart: ta === 0, bStart: tb === 0 });
    }));
  }));
  const distFromCorner = (i, atStart, len) => atStart ? (i.offset || 0) : len - ((i.offset || 0) + i.width);
  pairs.forEach(({ wa, wb, aStart, bStart }) => ['base', 'upper'].forEach(level => {
    [[wa, aStart, wb, bStart], [wb, bStart, wa, aStart]].forEach(([w1, s1, w2, s2]) => {
      const L1 = wallLength(r, w1), L2 = wallLength(r, w2);
      const atLevel = w => items.filter(i => i.wall === w && (level === 'upper' ? itemLevel(i) === 'upper' : _dcIsFloor(r, i)));
      const A = atLevel(w1).find(i => distFromCorner(i, s1, L1) < 0.5);          // the piece in the corner
      if (!A || cornerInfo(r, A) || !_dcHasFront(A)) return;
      const depthA = (A.depth || itemDepth(A)) + (A.wallOffset || 0);   // a bumped-out piece reaches further
      const B = atLevel(w2).filter(i => distFromCorner(i, s2, L2) >= depthA - 0.5).sort((m, n) => distFromCorner(m, s2, L2) - distFromCorner(n, s2, L2))[0];
      if (!B || !_dcHasFront(B)) return;
      const clear = distFromCorner(B, s2, L2) - depthA;
      if (clear < R.cornerClearance) {
        const blind = A.type === 'cornerBase';
        add('problem', `corner:${A.id}:${B.id}`,
          blind ? `Blind corner ${itemLabel(A)} has no pull clearance` : `${itemLabel(A)} and ${itemLabel(B)} collide in the corner`,
          `Doors/drawers on both runs meet at the corner. Add a filler (${_dcIn(R.cornerClearance)}–3") ${blind ? 'so the blind door and pulls clear' : 'where the runs meet'}.`, [A, B]);
      }
    });
  }));

  // ── 7. Ordering tips: single doors with no hinge side yet
  const noHinge = r.cabinets.filter(c => needsHinge(c) && !c.hinge);
  if (noHinge.length) add('tip', 'hinge', `${noHinge.length} single door${noHinge.length === 1 ? ' has' : 's have'} no hinge side`,
    `Set Left/Right (double-click → Hinge side) before ordering: ${noHinge.map(itemLabel).join(', ')}.`, noHinge);

  const rank = { problem: 0, warning: 1, tip: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

// ════════════════════════════
// PANEL + LOCATE
// ════════════════════════════
let _dcCache = { sig: null, issues: [] };
let _dcFocus = null;                 // { key, until }
const _dcCycle = {};                 // issue key → next item index (clicking again steps through its items)
function designIssues(r) {
  const sig = r ? JSON.stringify([r.walls, r.shape, r.ceilingHeight, r.cabinets, r.appliances, r.islands, r.openings, projectCounter(activeProj())]) : '';
  if (sig !== _dcCache.sig) _dcCache = { sig, issues: computeDesignIssues(r) };
  return _dcCache.issues;
}
function designCheckUnlocked() { return IS_DEMO || canAccess('silver'); }
function renderDesignCheck() {
  const box = document.getElementById('dc-list'), badge = document.getElementById('dc-badge');
  if (!box) return;
  const r = activeRoom();
  const issues = designIssues(r);
  const n = { problem: 0, warning: 0, tip: 0 }; issues.forEach(i => n[i.level]++);
  if (badge) badge.innerHTML = !r ? '' : (n.problem + n.warning)
    ? `<span class="dc-count dc-problem">${n.problem + n.warning}</span>` : '<span class="dc-count dc-ok">✓</span>';
  if (!r) { box.innerHTML = ''; return; }
  if (!designCheckUnlocked()) {
    box.innerHTML = `<div class="form-hint">${n.problem + n.warning ? `<b>${n.problem + n.warning} thing${n.problem + n.warning === 1 ? '' : 's'} to check</b> in this room (aisles, landing space, clearances).` : 'Checks aisles, landing space and clearances as you design.'}
      </div><button type="button" class="btn btn-secondary dc-upgrade" onclick="showTierUpgradePrompt('silver', 'Design Check')">See them with Silver</button>`;
    return;
  }
  if (!issues.length) { box.innerHTML = '<div class="form-hint dc-allgood">✓ No problems found in this room.</div>'; return; }
  box.innerHTML = issues.map((it, k) => `
    <button type="button" class="dc-item dc-${it.level}" data-k="${k}" title="Show it">
      <span class="dc-dot" aria-hidden="true"></span>
      <span class="dc-text"><span class="dc-title">${escHtml(it.title)}</span><span class="dc-detail">${escHtml(it.detail)}</span></span>
    </button>`).join('') + `<div class="form-hint" style="margin-top:4px;">${n.problem} problem${n.problem === 1 ? '' : 's'} · ${n.warning} warning${n.warning === 1 ? '' : 's'} · ${n.tip} tip${n.tip === 1 ? '' : 's'}. Guidelines, not rules — use your judgment.</div>`;
  box.querySelectorAll('.dc-item').forEach(b => b.addEventListener('click', () => locateDesignIssue(issues[+b.dataset.k])));
}
function locateDesignIssue(it) {
  if (!it) return;
  _dcFocus = { key: it.key, until: Date.now() + 4000 };
  if (it.itemIds.length) {
    const k = (_dcCycle[it.key] || 0) % it.itemIds.length;
    _dcCycle[it.key] = k + 1;
    selectItem(it.itemIds[k]);
  } else if (it.wall) selectWall(it.wall);
  if (state.viewMode === '3d') setViewMode('floor');
  renderAll();
  setTimeout(() => { if (_dcFocus && Date.now() >= _dcFocus.until) { _dcFocus = null; renderCanvas(); } }, 4100);
}

// Floor plan markers (Layers ▸ Design check): tinted areas with a dashed outline; the one
// you clicked is drawn stronger for a few seconds
function drawDesignCheckOnFloor(ctx, r, scale, RX, RY) {
  if (!layers.checks || !designCheckUnlocked()) return;
  const issues = designIssues(r).filter(i => i.level !== 'tip' || (_dcFocus && _dcFocus.key === i.key));
  ctx.save();
  issues.forEach(it => {
    const focus = _dcFocus && _dcFocus.key === it.key && Date.now() < _dcFocus.until;
    const col = DC_LEVELS[it.level].color;
    it.rects.forEach(Rc => {
      const x = RX + Rc.x * scale, y = RY + Rc.y * scale, w = Rc.w * scale, h = Rc.h * scale;
      ctx.globalAlpha = focus ? 0.28 : 0.12; ctx.fillStyle = col; ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = focus ? 3 : 1.5; ctx.setLineDash(focus ? [] : [5, 3]);
      ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    });
    // a "!" badge on the first area
    const R0 = it.rects[0]; if (!R0) return;
    const bx = RX + (R0.x + R0.w) * scale, by = RY + R0.y * scale;
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(bx, by, focus ? 8 : 6, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${focus ? 11 : 9}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', bx, by + 0.5);
  });
  ctx.restore();
}
